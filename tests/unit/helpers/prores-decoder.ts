/**
 * Test-only ProRes decoder written directly from SMPTE RDD 36:2022 §5–§7 (progressive frames,
 * 4:2:2 / 4:4:4, alpha types 0/1/2). Deliberately independent of src/core/prores (own bit reader,
 * own VLC decoding by counting prefix zeros, floating-point reference IDCT).
 */

export interface ProResFrameHeader {
  readonly frameSize: number;
  readonly frameHeaderSize: number;
  readonly bitstreamVersion: number;
  readonly encoderIdentifier: string;
  readonly width: number;
  readonly height: number;
  readonly chromaFormat: number;
  readonly interlaceMode: number;
  readonly aspectRatioInformation: number;
  readonly frameRateCode: number;
  readonly colorPrimaries: number;
  readonly transferCharacteristic: number;
  readonly matrixCoefficients: number;
  readonly alphaChannelType: number;
  readonly lumaMatrix: readonly number[];
  readonly chromaMatrix: readonly number[];
}

export interface DecodedProResFrame {
  readonly header: ProResFrameHeader;
  readonly log2SliceSizeInMb: number;
  readonly sliceSizes: readonly number[];
  readonly quantizationIndices: readonly number[];
  readonly pictureSize: number;
  /** Reconstructed values v (−256..256) per component, width × height (excess discarded). */
  readonly y: Float64Array;
  readonly cb: Float64Array;
  readonly cr: Float64Array;
  readonly alpha: Uint16Array | null;
}

class BitReader {
  private bitPos = 0;
  private readonly bytes: Uint8Array;
  private readonly endBit: number;

  constructor(bytes: Uint8Array, start: number, size: number) {
    if (start + size > bytes.length) throw new Error(`structure overruns buffer (${start}+${size} > ${bytes.length})`);
    this.bytes = bytes;
    this.bitPos = start * 8;
    this.endBit = (start + size) * 8;
  }

  get position(): number {
    return this.bitPos;
  }

  bit(): number {
    if (this.bitPos >= this.endBit) throw new Error('read past end of structure');
    const value = (this.bytes[this.bitPos >> 3]! >> (7 - (this.bitPos & 7))) & 1;
    this.bitPos += 1;
    return value;
  }

  bits(count: number): number {
    let value = 0;
    for (let i = 0; i < count; i += 1) value = value * 2 + this.bit();
    return value;
  }

  remaining(): number {
    return this.endBit - this.bitPos;
  }

  /** endOfData(): ≤ 31 bits remain and all of them are 0. */
  endOfData(): boolean {
    const left = this.remaining();
    if (left >= 32) return false;
    for (let p = this.bitPos; p < this.endBit; p += 1) {
      if (((this.bytes[p >> 3]! >> (7 - (p & 7))) & 1) !== 0) return false;
    }
    return true;
  }

  byteAligned(): boolean {
    return (this.bitPos & 7) === 0;
  }
}

export type Code = { readonly exp: number } | { readonly lastRiceQ: number; readonly kRice: number; readonly kExp: number };

function countZeros(reader: BitReader): number {
  let q = 0;
  while (reader.bit() === 0) q += 1;
  return q;
}

/** Exponential-Golomb order k: the codeword read as a number, minus 2^k. */
function readExpGolomb(reader: BitReader, k: number): number {
  const q = countZeros(reader);
  // The '1' separator already consumed: codeword value = 2^(q+k) + suffix of q+k bits.
  const suffix = reader.bits(q + k);
  return 2 ** (q + k) + suffix - 2 ** k;
}

function readCode(reader: BitReader, code: Code): number {
  if ('exp' in code) return readExpGolomb(reader, code.exp);
  const q = countZeros(reader);
  if (q <= code.lastRiceQ) return q * 2 ** code.kRice + reader.bits(code.kRice);
  // q > lastRiceQ: the first lastRiceQ+1 zeros belong to the escape, the rest to the exp-Golomb prefix.
  const expZeros = q - (code.lastRiceQ + 1);
  const suffix = reader.bits(expZeros + code.kExp);
  const expValue = 2 ** (expZeros + code.kExp) + suffix - 2 ** code.kExp;
  return expValue + (code.lastRiceQ + 1) * 2 ** code.kRice;
}

/** Reads `count` consecutive codewords of one codebook (VLC tests). */
export function decodeCodewords(bytes: Uint8Array, code: Code, count: number): number[] {
  const reader = new BitReader(bytes, 0, bytes.length);
  return Array.from({ length: count }, () => readCode(reader, code));
}

const E = (k: number): Code => ({ exp: k });
const R = (lastRiceQ: number, kRice: number, kExp: number): Code => ({ lastRiceQ, kRice, kExp });
const DC_CODES = [E(0), E(1), R(1, 2, 3), E(3)];
const RUN_CODES = [R(2, 0, 1), R(2, 0, 1), R(1, 0, 1), R(1, 0, 1), E(0), R(1, 1, 2), R(1, 1, 2), R(1, 1, 2), R(1, 1, 2), E(1), E(1), E(1), E(1), E(1), E(1), E(2)];
const LEVEL_CODES = [R(2, 0, 2), R(1, 0, 1), R(2, 0, 1), E(0), E(1), E(1), E(1), E(1), E(2)];

function symbolToSigned(symbol: number): number {
  return symbol % 2 === 0 ? symbol / 2 : -((symbol + 1) / 2);
}

export const TEST_PROGRESSIVE_SCAN = [
  [0, 1, 4, 5, 16, 17, 21, 22],
  [2, 3, 6, 7, 18, 20, 23, 28],
  [8, 9, 12, 13, 19, 24, 27, 29],
  [10, 11, 14, 15, 25, 26, 30, 31],
  [32, 33, 37, 38, 45, 46, 53, 54],
  [34, 36, 39, 44, 47, 52, 55, 60],
  [35, 40, 43, 48, 51, 56, 59, 61],
  [41, 42, 49, 50, 57, 58, 62, 63],
];

/** scanned_coefficients() → scanned coefficient array. Exposed for VLC tests. */
export function decodeScannedCoefficients(bytes: Uint8Array, start: number, size: number, numBlocks: number): Int32Array {
  const reader = new BitReader(bytes, start, size);
  const coefficients = new Int32Array(numBlocks * 64);
  let previousDc = symbolToSigned(readExpGolomb(reader, 5));
  coefficients[0] = previousDc;
  let previousDcDiff = 3;
  let n = 1;
  while (n < numBlocks) {
    const signed = symbolToSigned(readCode(reader, DC_CODES[Math.min(Math.abs(previousDcDiff), 3)]!));
    const diff = previousDcDiff >= 0 ? signed : -signed;
    previousDc += diff;
    coefficients[n++] = previousDc;
    previousDcDiff = diff;
  }
  let previousRun = 4;
  let previousLevel = 1;
  while (!reader.endOfData()) {
    const run = readCode(reader, RUN_CODES[Math.min(previousRun, 15)]!);
    previousRun = run;
    n += run;
    const absLevelMinus1 = readCode(reader, LEVEL_CODES[Math.min(previousLevel, 8)]!);
    previousLevel = absLevelMinus1;
    const sign = reader.bit();
    if (n >= coefficients.length) throw new Error('coefficient index out of range');
    coefficients[n++] = (absLevelMinus1 + 1) * (1 - 2 * sign);
  }
  while (!reader.byteAligned()) {
    if (reader.bit() !== 0) throw new Error('nonzero zero_bit');
  }
  return coefficients;
}

/** scanned_alpha() → raster alpha values. Exposed for tests. */
export function decodeScannedAlpha(bytes: Uint8Array, start: number, size: number, numValues: number, alphaType: number): Uint16Array {
  const reader = new BitReader(bytes, start, size);
  const mask = alphaType === 1 ? 0xff : 0xffff;
  const values = new Uint16Array(numValues);
  let n = 0;
  let previous = -1;
  do {
    let alpha: number;
    if (reader.bit() === 0) {
      const magnitudeBits = alphaType === 1 ? 3 : 6;
      const magnitude = reader.bits(magnitudeBits) + 1;
      const negative = reader.bit() === 1;
      alpha = previous + (negative ? -magnitude : magnitude);
    } else {
      const difference = reader.bits(alphaType === 1 ? 8 : 16);
      alpha = (previous + difference) & mask;
    }
    previous = alpha;
    let run: number;
    if (reader.bit() === 1) run = 1;
    else {
      const four = reader.bits(4);
      run = four !== 0 ? four + 1 : reader.bits(11) + 1;
    }
    if (n + run > numValues) throw new Error(`alpha run overflows slice (${n} + ${run} > ${numValues})`);
    if (alpha < 0 || alpha > mask) throw new Error(`alpha value out of range: ${alpha}`);
    for (let m = 0; m < run; m += 1) values[n++] = alpha;
  } while (n < numValues);
  while (!reader.byteAligned()) {
    if (reader.bit() !== 0) throw new Error('nonzero alpha zero_bit');
  }
  return values;
}

/** Reference IDCT (§7.4), double precision, direct formula. */
function idct(F: Float64Array, out: Float64Array): void {
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      let sum = 0;
      for (let v = 0; v < 8; v += 1) {
        const cv = v === 0 ? Math.SQRT1_2 : 1;
        const cosY = Math.cos(((2 * y + 1) * v * Math.PI) / 16);
        for (let u = 0; u < 8; u += 1) {
          const cu = u === 0 ? Math.SQRT1_2 : 1;
          sum += cu * cv * F[v * 8 + u]! * Math.cos(((2 * x + 1) * u * Math.PI) / 16) * cosY;
        }
      }
      out[y * 8 + x] = sum / 4;
    }
  }
}

export function parseFrameHeader(frame: Uint8Array): ProResFrameHeader {
  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
  const frameSize = view.getUint32(0);
  const id = String.fromCharCode(...frame.subarray(4, 8));
  if (id !== 'icpf') throw new Error(`bad frame_identifier ${id}`);
  const h = 8;
  const frameHeaderSize = view.getUint16(h);
  const reader = new BitReader(frame, h + 2, frameHeaderSize - 2);
  reader.bits(8);
  const bitstreamVersion = reader.bits(8);
  const encoderIdentifier = String.fromCharCode(reader.bits(8), reader.bits(8), reader.bits(8), reader.bits(8));
  const width = reader.bits(16);
  const height = reader.bits(16);
  const chromaFormat = reader.bits(2);
  reader.bits(2);
  const interlaceMode = reader.bits(2);
  reader.bits(2);
  const aspectRatioInformation = reader.bits(4);
  const frameRateCode = reader.bits(4);
  const colorPrimaries = reader.bits(8);
  const transferCharacteristic = reader.bits(8);
  const matrixCoefficients = reader.bits(8);
  reader.bits(4);
  const alphaChannelType = reader.bits(4);
  reader.bits(14);
  const loadLuma = reader.bit();
  const loadChroma = reader.bit();
  let lumaMatrix = new Array<number>(64).fill(4);
  if (loadLuma) lumaMatrix = Array.from({ length: 64 }, () => reader.bits(8));
  let chromaMatrix = lumaMatrix;
  if (loadChroma) chromaMatrix = Array.from({ length: 64 }, () => reader.bits(8));
  return {
    frameSize, frameHeaderSize, bitstreamVersion, encoderIdentifier, width, height, chromaFormat, interlaceMode,
    aspectRatioInformation, frameRateCode, colorPrimaries, transferCharacteristic, matrixCoefficients,
    alphaChannelType, lumaMatrix, chromaMatrix,
  };
}

function qScale(index: number): number {
  if (index < 1 || index > 224) throw new Error(`reserved quantization_index ${index}`);
  return index <= 128 ? index : 128 + 4 * (index - 128);
}

/** Decodes a complete progressive ProRes frame() (§5.1). */
export function decodeProResFrame(frame: Uint8Array): DecodedProResFrame {
  const header = parseFrameHeader(frame);
  if (header.frameSize > frame.length) throw new Error('frame_size exceeds buffer');
  if (header.bitstreamVersion > 1) throw new Error('unsupported bitstream_version');
  if (header.interlaceMode !== 0) throw new Error('test decoder handles progressive frames only');
  if (header.chromaFormat !== 2 && header.chromaFormat !== 3) throw new Error('reserved chroma_format');
  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
  const pictureStart = 8 + header.frameHeaderSize;
  const pictureHeaderSize = frame[pictureStart]! >> 3;
  const pictureSize = view.getUint32(pictureStart + 1);
  const log2SliceSizeInMb = (frame[pictureStart + 7]! >> 4) & 3;
  const widthInMb = Math.floor((header.width + 15) / 16);
  const pictureVerticalSize = header.height;
  const heightInMb = Math.floor((pictureVerticalSize + 15) / 16);
  const sliceSizes: number[] = [];
  let sliceSize = 1 << log2SliceSizeInMb;
  let remaining = widthInMb;
  do {
    while (remaining >= sliceSize) {
      sliceSizes.push(sliceSize);
      remaining -= sliceSize;
    }
    sliceSize /= 2;
  } while (remaining > 0);
  const slicesPerRow = sliceSizes.length;
  const tableStart = pictureStart + pictureHeaderSize;
  const codedSizes: number[] = [];
  for (let s = 0; s < heightInMb * slicesPerRow; s += 1) codedSizes.push(view.getUint16(tableStart + 2 * s));
  let sliceStart = tableStart + 2 * heightInMb * slicesPerRow;

  const W = header.width;
  const H = header.height;
  const out = { y: new Float64Array(W * H), cb: new Float64Array(W * H), cr: new Float64Array(W * H) };
  const alpha = header.alphaChannelType !== 0 ? new Uint16Array(W * H) : null;
  const quantizationIndices: number[] = [];
  const nC = header.chromaFormat === 3 ? 4 : 2;
  const F = new Float64Array(64);
  const f = new Float64Array(64);

  for (let i = 0; i < heightInMb; i += 1) {
    let mbOffset = 0;
    for (let j = 0; j < slicesPerRow; j += 1) {
      const sliceMb = sliceSizes[j]!;
      const coded = codedSizes[i * slicesPerRow + j]!;
      const sliceHeaderSize = frame[sliceStart]! >> 3;
      const quantizationIndex = frame[sliceStart + 1]!;
      quantizationIndices.push(quantizationIndex);
      const ySize = view.getUint16(sliceStart + 2);
      const cbSize = view.getUint16(sliceStart + 4);
      const crSize = header.alphaChannelType !== 0 ? view.getUint16(sliceStart + 6) : coded - sliceHeaderSize - ySize - cbSize;
      const yStart = sliceStart + sliceHeaderSize;
      const components = [
        { start: yStart, size: ySize, nB: 4, plane: out.y, matrix: header.lumaMatrix, luma: true },
        { start: yStart + ySize, size: cbSize, nB: nC, plane: out.cb, matrix: header.chromaMatrix, luma: false },
        { start: yStart + ySize + cbSize, size: crSize, nB: nC, plane: out.cr, matrix: header.chromaMatrix, luma: false },
      ];
      const qs = qScale(quantizationIndex);
      for (const component of components) {
        const numBlocks = component.nB * sliceMb;
        const scanned = decodeScannedCoefficients(frame, component.start, component.size, numBlocks);
        for (let m = 0; m < sliceMb; m += 1) {
          for (let b = 0; b < component.nB; b += 1) {
            for (let v = 0; v < 8; v += 1) {
              for (let u = 0; u < 8; u += 1) {
                const n = TEST_PROGRESSIVE_SCAN[v]![u]!;
                const qf = scanned[component.nB * sliceMb * n + component.nB * m + b]!;
                F[v * 8 + u] = (qf * component.matrix[v * 8 + u]! * qs) / 8;
              }
            }
            idct(F, f);
            // Block placement: luma Figure 6; 4:4:4 chroma Figure 8; 4:2:2 chroma Figure 7 (8 wide, stacked).
            let bx: number;
            let by: number;
            if (component.luma) {
              bx = (b & 1) * 8;
              by = (b >> 1) * 8;
            } else if (nC === 4) {
              bx = (b >> 1) * 8;
              by = (b & 1) * 8;
            } else {
              bx = 0;
              by = b * 8;
            }
            const horizontalScale = component.luma || nC === 4 ? 1 : 2;
            for (let yy = 0; yy < 8; yy += 1) {
              const py = 16 * i + by + yy;
              if (py >= H) continue;
              for (let xx = 0; xx < 8; xx += 1) {
                for (let rep = 0; rep < horizontalScale; rep += 1) {
                  const px = 16 * (mbOffset + m) + (bx + xx) * horizontalScale + rep;
                  if (px < W) component.plane[py * W + px] = f[yy * 8 + xx]!;
                }
              }
            }
          }
        }
      }
      if (alpha) {
        const sliceVerticalSize = i < heightInMb - 1 ? 16 : pictureVerticalSize - 16 * (heightInMb - 1);
        const numAlphaValues = 16 * sliceMb * sliceVerticalSize;
        const alphaStart = yStart + ySize + cbSize + crSize;
        const values = decodeScannedAlpha(frame, alphaStart, sliceStart + coded - alphaStart, numAlphaValues, header.alphaChannelType);
        for (let r = 0; r < sliceVerticalSize; r += 1) {
          for (let n = 0; n < 16 * sliceMb; n += 1) {
            const px = 16 * mbOffset + n;
            if (px < W) alpha[(16 * i + r) * W + px] = values[16 * sliceMb * r + n]!;
          }
        }
      }
      sliceStart += coded;
      mbOffset += sliceMb;
    }
  }
  if (sliceStart !== pictureStart + pictureSize) throw new Error(`picture_size mismatch: ${sliceStart - pictureStart} vs ${pictureSize}`);
  return { header, log2SliceSizeInMb, sliceSizes, quantizationIndices, pictureSize, ...out, alpha };
}

/** Converts a decoded frame to straight 8-bit RGBA using the inverse of the BT.709 / BT.601 matrix. */
export function decodedToRgba(decoded: DecodedProResFrame): Uint8ClampedArray {
  const { width, height, matrixCoefficients, alphaChannelType } = decoded.header;
  const [kr, kb] = matrixCoefficients === 6 ? [0.299, 0.114] : [0.2126, 0.0722];
  const kg = 1 - kr - kb;
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let p = 0; p < width * height; p += 1) {
    // 8-bit video levels from v: level = (v + 256) / 2.
    const yl = ((decoded.y[p]! + 256) / 2 - 16) / 219;
    const cbn = ((decoded.cb[p]! + 256) / 2 - 128) / 224;
    const crn = ((decoded.cr[p]! + 256) / 2 - 128) / 224;
    const r = yl + 2 * (1 - kr) * crn;
    const b = yl + 2 * (1 - kb) * cbn;
    const g = (yl - kr * r - kb * b) / kg;
    rgba[p * 4] = Math.round(r * 255);
    rgba[p * 4 + 1] = Math.round(g * 255);
    rgba[p * 4 + 2] = Math.round(b * 255);
    const a = decoded.alpha ? decoded.alpha[p]! : 255;
    rgba[p * 4 + 3] = alphaChannelType === 2 ? Math.round((a * 255) / 65535) : a;
  }
  return rgba;
}
