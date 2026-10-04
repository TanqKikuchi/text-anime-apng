import { BitWriter } from './bitwriter.ts';
import { createPlanes, rgbaToPlanes, TransparentFill, type YCbCrPlanes } from './color.ts';
import { forwardDct8x8 } from './dct.ts';
import { frameRateCode, PROGRESSIVE_SCAN, qScaleForIndex, sliceSizesInMb } from './tables.ts';
import {
  FAST_DC_DIFF,
  FAST_FIRST_DC,
  FAST_LEVEL,
  FAST_RUN,
  INITIAL_PREVIOUS_DC_DIFF,
  INITIAL_PREVIOUS_LEVEL_SYMBOL,
  INITIAL_PREVIOUS_RUN,
  signedToSymbol,
} from './vlc.ts';

/**
 * Apple ProRes 4444 frame encoder (bitstream version 1, 4:4:4, progressive, 8-bit alpha),
 * written from SMPTE RDD 36:2022 (syntax §5, semantics §6, inverse of the decoding process §7).
 */
export interface ProResEncoderOptions {
  readonly width: number;
  readonly height: number;
  /** quantization_index of every slice (1..224; qScale per Table 15). Raised per slice only if a slice overflows. */
  readonly quantizationIndex: number;
  /** Frame rate for the informative frame_rate_code (0 when not one of Table 4's integral rates). */
  readonly fps?: number;
  /** Store premultiplied colour instead of straight colour (default false = straight). */
  readonly premultiplyAlpha?: boolean;
  /**
   * Replace the (invisible) colour of alpha-0 pixels by a smooth extension of the visible colours
   * (default true; ignored with premultiplied alpha, where those pixels are black anyway).
   */
  readonly fillTransparent?: boolean;
  /** Upper bound for the 16-bit slice / component size fields (default 65535; lower values are for tests). */
  readonly sliceByteLimit?: number;
  /** log2_desired_slice_size_in_mb (0..3, default 3 = 8 macroblocks). */
  readonly log2SliceSizeInMb?: number;
  /** Four-character encoder_identifier (decoders ignore it). */
  readonly encoderIdentifier?: string;
  /**
   * Frame-header colour description (Tables 5, 6 and transfer_characteristic). Defaults: BT.709 primaries,
   * transfer 2 (unspecified: canvas data is sRGB, which RDD 36 cannot signal; the .mov 'colr' atom does), BT.709 matrix.
   */
  readonly colorPrimaries?: number;
  readonly transferCharacteristic?: number;
}

export interface ProResColorDescription {
  readonly primaries: number;
  readonly transfer: number;
  readonly matrix: number;
}

/** Quantization weight matrix sent in the frame header for luma and chroma (all weights 4 = RDD 36 default). */
export const QUANT_MATRIX: readonly number[] = new Array<number>(64).fill(4);

export const PRORES_FRAME_HEADER_SIZE = 20 + 128;
const PICTURE_HEADER_SIZE = 8;
const SLICE_HEADER_SIZE = 8;
const MAX_U16 = 0xffff;
const COLOR_PRIMARIES_BT709 = 1;
const TRANSFER_UNSPECIFIED = 2;
const MATRIX_BT709 = 1;
const ALPHA_8BIT = 1;
const CHROMA_444 = 3;
const BITSTREAM_VERSION = 1;

/** Block origins inside a macroblock: luma Figure 6 (0 1 / 2 3), 4:4:4 chroma Figure 8 (0 2 / 1 3). */
const LUMA_BLOCK_X = [0, 8, 0, 8];
const LUMA_BLOCK_Y = [0, 0, 8, 8];
const CHROMA_BLOCK_X = [0, 0, 8, 8];
const CHROMA_BLOCK_Y = [0, 8, 0, 8];

const MAX_ALPHA_RUN = 2048;

export class ProResEncoder {
  readonly width: number;
  readonly height: number;
  readonly widthInMb: number;
  readonly heightInMb: number;
  readonly sliceSizes: readonly number[];
  readonly quantizationIndex: number;
  private readonly premultiply: boolean;
  private readonly log2SliceSize: number;
  private readonly sliceByteLimit: number;
  private readonly frameHeader: Uint8Array;
  private readonly planes: YCbCrPlanes;
  private readonly fill: TransparentFill | null;
  /** Per 8×8 block: 1 when every alpha sample is 0 (colour invisible, coded as a flat block). */
  private readonly transparentBlocks: Uint8Array;
  private readonly writer = new BitWriter(1 << 20);
  private readonly block = new Float64Array(64);
  private readonly scratch = new Float64Array(64);
  private readonly coeffs: Int32Array;
  private readonly quantMultipliers = new Map<number, Float64Array>();
  private readonly sliceSizesOut: Uint32Array;
  /** Highest quantization_index actually used in the last frame (≥ quantizationIndex). */
  lastMaxQuantizationIndex = 0;

  constructor(options: ProResEncoderOptions) {
    const { width, height } = options;
    if (!Number.isInteger(width) || width < 1 || width > MAX_U16 || !Number.isInteger(height) || height < 1 || height > MAX_U16) {
      throw new RangeError('ProRes frame dimensions must be integers in 1..65535');
    }
    qScaleForIndex(options.quantizationIndex);
    const log2 = options.log2SliceSizeInMb ?? 3;
    if (!Number.isInteger(log2) || log2 < 0 || log2 > 3) throw new RangeError('log2SliceSizeInMb must be 0..3');
    this.width = width;
    this.height = height;
    this.quantizationIndex = options.quantizationIndex;
    this.premultiply = options.premultiplyAlpha ?? false;
    this.log2SliceSize = log2;
    this.sliceByteLimit = Math.min(MAX_U16, options.sliceByteLimit ?? MAX_U16);
    this.widthInMb = (width + 15) >> 4;
    this.heightInMb = (height + 15) >> 4;
    this.sliceSizes = sliceSizesInMb(this.widthInMb, log2);
    this.planes = createPlanes(this.widthInMb * 16, this.heightInMb * 16);
    this.fill = this.premultiply || options.fillTransparent === false ? null : new TransparentFill(this.widthInMb * 16, this.heightInMb * 16);
    this.transparentBlocks = new Uint8Array(this.widthInMb * 2 * this.heightInMb * 2);
    this.coeffs = new Int32Array(4 * (1 << log2) * 64);
    this.sliceSizesOut = new Uint32Array(this.sliceSizes.length * this.heightInMb);
    this.frameHeader = buildFrameHeader(width, height, options.fps ?? 0, options.encoderIdentifier ?? 'mjmt', {
      primaries: options.colorPrimaries ?? COLOR_PRIMARIES_BT709,
      transfer: options.transferCharacteristic ?? TRANSFER_UNSPECIFIED,
      matrix: MATRIX_BT709,
    });
  }

  /** Encodes one straight-alpha RGBA frame (row-major, width × height × 4) into a complete ProRes frame(). */
  encodeFrame(rgba: ArrayLike<number>): Uint8Array {
    rgbaToPlanes(rgba, this.width, this.height, this.planes, this.premultiply);
    this.fill?.apply(this.planes);
    if (!this.premultiply) this.markTransparentBlocks();
    const writer = this.writer;
    writer.reset();
    let maxIndex = 0;
    let sliceNumber = 0;
    for (let mbRow = 0; mbRow < this.heightInMb; mbRow += 1) {
      let mbOffset = 0;
      for (const sliceMb of this.sliceSizes) {
        const start = writer.alignedLength;
        let qIndex = this.quantizationIndex;
        for (;;) {
          if (this.encodeSlice(mbRow, mbOffset, sliceMb, qIndex)) break;
          if (qIndex >= 224) throw new Error('ProRes slice does not fit 65535 bytes even at the coarsest quantizer');
          writer.truncate(start);
          qIndex = Math.min(224, qIndex < 128 ? Math.max(qIndex + 1, qIndex * 2) : qIndex + 16);
        }
        maxIndex = Math.max(maxIndex, qIndex);
        this.sliceSizesOut[sliceNumber++] = writer.alignedLength - start;
        mbOffset += sliceMb;
      }
    }
    this.lastMaxQuantizationIndex = maxIndex;
    return this.assembleFrame(writer.bytes(), sliceNumber);
  }

  private assembleFrame(sliceData: Uint8Array, sliceCount: number): Uint8Array {
    const sliceTableSize = 2 * sliceCount;
    const pictureSize = PICTURE_HEADER_SIZE + sliceTableSize + sliceData.length;
    const frameSize = 8 + this.frameHeader.length + pictureSize;
    const out = new Uint8Array(frameSize);
    const view = new DataView(out.buffer);
    view.setUint32(0, frameSize);
    out.set([0x69, 0x63, 0x70, 0x66], 4); // 'icpf'
    out.set(this.frameHeader, 8);
    let p = 8 + this.frameHeader.length;
    // picture_header(): picture_header_size(5) reserved(3) picture_size(32) deprecated_number_of_slices(16)
    // reserved(2) log2_desired_slice_size_in_mb(2) reserved(4)
    out[p] = PICTURE_HEADER_SIZE << 3;
    view.setUint32(p + 1, pictureSize);
    view.setUint16(p + 5, sliceCount <= MAX_U16 ? sliceCount : 0);
    out[p + 7] = this.log2SliceSize << 4;
    p += PICTURE_HEADER_SIZE;
    for (let i = 0; i < sliceCount; i += 1, p += 2) view.setUint16(p, this.sliceSizesOut[i]!);
    out.set(sliceData, p);
    return out;
  }

  /** Writes slice(i, j); returns false (leaving partial data) if a size field would overflow. */
  private encodeSlice(mbRow: number, mbOffset: number, sliceMb: number, qIndex: number): boolean {
    const writer = this.writer;
    const headerAt = writer.alignedLength;
    writer.writeZeros(SLICE_HEADER_SIZE * 8);
    const qMul = this.quantMultiplier(qIndex);
    const x0 = mbOffset * 16;
    const y0 = mbRow * 16;
    const ySize = this.encodeComponent(this.planes.y, x0, y0, sliceMb, LUMA_BLOCK_X, LUMA_BLOCK_Y, qMul);
    const cbSize = this.encodeComponent(this.planes.cb, x0, y0, sliceMb, CHROMA_BLOCK_X, CHROMA_BLOCK_Y, qMul);
    const crSize = this.encodeComponent(this.planes.cr, x0, y0, sliceMb, CHROMA_BLOCK_X, CHROMA_BLOCK_Y, qMul);
    const rows = mbRow < this.heightInMb - 1 ? 16 : this.height - 16 * (this.heightInMb - 1);
    writeScannedAlpha(writer, this.planes.alpha, y0 * this.planes.stride + x0, this.planes.stride, sliceMb * 16, rows);
    const total = writer.alignedLength - headerAt;
    const limit = this.sliceByteLimit;
    if (ySize > limit || cbSize > limit || crSize > limit || total > limit) return false;
    // slice_header(): slice_header_size(5) reserved(3) quantization_index(8) coded sizes of Y, Cb, Cr (16 each)
    writer.patchByte(headerAt, SLICE_HEADER_SIZE << 3);
    writer.patchByte(headerAt + 1, qIndex);
    writer.patchByte(headerAt + 2, ySize >> 8);
    writer.patchByte(headerAt + 3, ySize);
    writer.patchByte(headerAt + 4, cbSize >> 8);
    writer.patchByte(headerAt + 5, cbSize);
    writer.patchByte(headerAt + 6, crSize >> 8);
    writer.patchByte(headerAt + 7, crSize);
    return true;
  }

  private markTransparentBlocks(): void {
    const { alpha, stride, paddedHeight } = this.planes;
    const blocksPerRow = stride >> 3;
    for (let by = 0; by < paddedHeight; by += 8) {
      for (let bx = 0; bx < stride; bx += 8) {
        let transparent = 1;
        for (let y = 0; y < 8 && transparent === 1; y += 1) {
          const rowStart = (by + y) * stride + bx;
          for (let x = 0; x < 8; x += 1) {
            if (alpha[rowStart + x] !== 0) {
              transparent = 0;
              break;
            }
          }
        }
        this.transparentBlocks[(by >> 3) * blocksPerRow + (bx >> 3)] = transparent;
      }
    }
  }

  private quantMultiplier(qIndex: number): Float64Array {
    let table = this.quantMultipliers.get(qIndex);
    if (!table) {
      const qScale = qScaleForIndex(qIndex);
      table = new Float64Array(64);
      // QF = F * 8 / (W * qScale), the inverse of F = QF * W * qScale / 8 (§7.3).
      for (let i = 0; i < 64; i += 1) table[i] = 8 / (QUANT_MATRIX[i]! * qScale);
      this.quantMultipliers.set(qIndex, table);
    }
    return table;
  }

  /** DCT + quantization + slice scanning + scanned_coefficients() for one colour component. Returns byte size. */
  private encodeComponent(
    plane: Float32Array,
    x0: number,
    y0: number,
    sliceMb: number,
    blockX: readonly number[],
    blockY: readonly number[],
    qMul: Float64Array,
  ): number {
    const stride = this.planes.stride;
    const numBlocks = 4 * sliceMb;
    const coeffs = this.coeffs;
    const block = this.block;
    const scan = PROGRESSIVE_SCAN;
    for (let m = 0; m < sliceMb; m += 1) {
      for (let b = 0; b < 4; b += 1) {
        const blockIndex = 4 * m + b;
        const bx = x0 + 16 * m + blockX[b]!;
        const by = y0 + blockY[b]!;
        let first = plane[by * stride + bx]!;
        let flat = true;
        let sum = 0;
        for (let y = 0; y < 8; y += 1) {
          const rowStart = (by + y) * stride + bx;
          for (let x = 0; x < 8; x += 1) {
            const value = plane[rowStart + x]!;
            block[y * 8 + x] = value;
            sum += value;
            if (value !== first) flat = false;
          }
        }
        if (!flat && this.transparentBlocks[(by >> 3) * (stride >> 3) + (bx >> 3)] === 1) {
          flat = true;
          first = sum / 64;
        }
        if (flat) {
          // DC of a constant block: F[0][0] = 1/4 · 1/2 · 64 · value = 8 · value.
          coeffs[blockIndex] = quantize(8 * first * qMul[0]!);
          for (let n = 1; n < 64; n += 1) coeffs[numBlocks * n + blockIndex] = 0;
          continue;
        }
        forwardDct8x8(block, this.scratch);
        for (let i = 0; i < 64; i += 1) coeffs[numBlocks * scan[i]! + blockIndex] = quantize(block[i]! * qMul[i]!);
      }
    }
    return writeScannedCoefficients(this.writer, coeffs, numBlocks);
  }
}

/**
 * scanned_coefficients() (§5.3.2, §7.1.1) for quantized coefficients in slice-scanned order
 * (index = numBlocks · n + blockIndex). Returns the byte size (the writer must start byte aligned).
 */
export function writeScannedCoefficients(writer: BitWriter, coeffs: ArrayLike<number>, numBlocks: number): number {
  const startBits = writer.bitLength;
  let previous = coeffs[0]!;
  FAST_FIRST_DC.write(writer, signedToSymbol(previous));
  let previousDiff = INITIAL_PREVIOUS_DC_DIFF;
  for (let n = 1; n < numBlocks; n += 1) {
    const value = coeffs[n]!;
    const diff = value - previous;
    const coded = previousDiff >= 0 ? diff : -diff;
    const absPrevious = previousDiff < 0 ? -previousDiff : previousDiff;
    FAST_DC_DIFF[absPrevious < 3 ? absPrevious : 3]!.write(writer, signedToSymbol(coded));
    previousDiff = diff;
    previous = value;
  }
  const total = numBlocks * 64;
  let run = 0;
  let previousRun = INITIAL_PREVIOUS_RUN;
  let previousLevel = INITIAL_PREVIOUS_LEVEL_SYMBOL;
  for (let n = numBlocks; n < total; n += 1) {
    const value = coeffs[n]!;
    if (value === 0) {
      run += 1;
      continue;
    }
    FAST_RUN[previousRun < 15 ? previousRun : 15]!.write(writer, run);
    previousRun = run;
    const levelSymbol = (value < 0 ? -value : value) - 1;
    FAST_LEVEL[previousLevel < 8 ? previousLevel : 8]!.write(writer, levelSymbol);
    previousLevel = levelSymbol;
    writer.writeBit(value < 0 ? 1 : 0);
    run = 0;
  }
  writer.alignToByte();
  return (writer.bitLength - startBits) >> 3;
}

/**
 * scanned_alpha() (§5.3.3, §7.1.2) for alpha_channel_type 1: the raster-scanned values of a `width` × `rows`
 * region starting at `offset` in a plane with the given stride; runs of equal values, at most 2048 long.
 */
export function writeScannedAlpha(
  writer: BitWriter,
  alpha: ArrayLike<number>,
  offset: number,
  stride: number,
  width: number,
  rows: number,
): void {
  let previous = -1;
  let current = alpha[offset]!;
  let run = 0;
  for (let r = 0; r < rows; r += 1) {
    const rowStart = offset + r * stride;
    for (let x = 0; x < width; x += 1) {
      const value = alpha[rowStart + x]!;
      if (value === current && run < MAX_ALPHA_RUN) {
        run += 1;
        continue;
      }
      writeAlphaRun(writer, current - previous, run);
      previous = current;
      current = value;
      run = 1;
    }
  }
  writeAlphaRun(writer, current - previous, run);
  writer.alignToByte();
}

function quantize(value: number): number {
  return value < 0 ? -Math.floor(0.5 - value) : Math.floor(value + 0.5);
}

/** alpha_difference (Table 13) followed by run (Table 12). */
function writeAlphaRun(writer: BitWriter, difference: number, run: number): void {
  const magnitude = difference < 0 ? -difference : difference;
  if (magnitude >= 1 && magnitude <= 8) {
    writer.writeBits(((magnitude - 1) << 1) | (difference < 0 ? 1 : 0), 5); // '0' + 3-bit |d|-1 + sign
  } else {
    writer.writeBits(0x100 | (difference & 0xff), 9); // escape '1' + difference mod 256
  }
  if (run === 1) writer.writeBit(1);
  else if (run <= 16) writer.writeBits(run - 1, 5);
  else writer.writeBits(run - 1, 16); // '00000' escape + 11-bit run − 1
}

function buildFrameHeader(width: number, height: number, fps: number, encoderId: string, color: ProResColorDescription): Uint8Array {
  if (encoderId.length !== 4) throw new RangeError('encoder identifier must be four characters');
  const header = new Uint8Array(PRORES_FRAME_HEADER_SIZE);
  const view = new DataView(header.buffer);
  view.setUint16(0, PRORES_FRAME_HEADER_SIZE); // frame_header_size
  header[2] = 0; // reserved
  header[3] = BITSTREAM_VERSION;
  for (let i = 0; i < 4; i += 1) header[4 + i] = encoderId.charCodeAt(i) & 0xff;
  view.setUint16(8, width);
  view.setUint16(10, height);
  header[12] = (CHROMA_444 << 6) | (0 << 2); // chroma_format(2) reserved(2) interlace_mode(2)=0 reserved(2)
  header[13] = (0 << 4) | frameRateCode(fps); // aspect_ratio_information(4)=0 frame_rate_code(4)
  header[14] = color.primaries;
  header[15] = color.transfer;
  header[16] = color.matrix;
  header[17] = ALPHA_8BIT; // reserved(4)=0 alpha_channel_type(4)
  header[18] = 0; // reserved(14) ...
  header[19] = 0b11; // ... load_luma_quantization_matrix, load_chroma_quantization_matrix
  for (let i = 0; i < 64; i += 1) {
    header[20 + i] = QUANT_MATRIX[i]!;
    header[84 + i] = QUANT_MATRIX[i]!;
  }
  return header;
}
