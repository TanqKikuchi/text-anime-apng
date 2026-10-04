import { describe, expect, it } from 'vitest';
import {
  BitWriter,
  buildMov,
  createFrameTimeline,
  createPlanes,
  DC_DIFF_CODEBOOKS,
  dctBasis,
  estimateMovBytes,
  ExportCancelledError,
  exportMov,
  FastCodebook,
  forwardDct8x8,
  frameRateCode,
  LEVEL_CODEBOOKS,
  MOV_COLOR,
  MOV_QUANTIZATION_INDEX,
  movTiming,
  PROGRESSIVE_SCAN,
  ProResEncoder,
  qScaleForIndex,
  rgbaToPlanes,
  RUN_CODEBOOKS,
  signedToSymbol,
  sliceSizesInMb,
  TransparentFill,
  writeCodeword,
  writeScannedAlpha,
  writeScannedCoefficients,
  type Codebook,
} from '../../src/core';
import { findBox, parseBoxes, payload } from './helpers/mov-parser';
import {
  decodeCodewords,
  decodedToRgba,
  decodeProResFrame,
  decodeScannedAlpha,
  decodeScannedCoefficients,
  TEST_PROGRESSIVE_SCAN,
  type Code,
} from './helpers/prores-decoder';

// ---------------------------------------------------------------------------------------------- helpers

function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

function bitString(writer: BitWriter): string {
  const bits = writer.bitLength;
  writer.alignToByte();
  return Array.from(writer.bytes(), (byte) => byte.toString(2).padStart(8, '0')).join('').slice(0, bits);
}

function toTestCode(codebook: Codebook): Code {
  return codebook.type === 'exp' ? { exp: codebook.k } : { lastRiceQ: codebook.lastRiceQ, kRice: codebook.kRice, kExp: codebook.kExp };
}

type Painter = (x: number, y: number) => readonly [number, number, number, number];

function image(width: number, height: number, paint: Painter): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) rgba.set(paint(x, y), (y * width + x) * 4);
  return rgba;
}

/** Anti-aliased discs with soft glow over transparency — text-animation-like content. */
function softScene(width: number, height: number, seed = 1): Uint8ClampedArray {
  const random = rng(seed);
  const discs = Array.from({ length: 6 }, () => ({
    x: random() * width, y: random() * height, r: 3 + random() * Math.min(width, height) * 0.3,
    c: [random() * 255, random() * 255, random() * 255] as const, a: 0.4 + random() * 0.6,
  }));
  return image(width, height, (x, y) => {
    let pr = 0, pg = 0, pb = 0, pa = 0; // premultiplied 0..1
    for (const d of discs) {
      const dist = Math.hypot(x + 0.5 - d.x, y + 0.5 - d.y);
      const cover = Math.min(1, Math.max(0, d.r + 0.5 - dist)) + 0.5 * Math.exp(-((dist - d.r) ** 2) / 20) * (dist > d.r ? 1 : 0);
      const a = Math.min(1, cover) * d.a;
      pr = (d.c[0] / 255) * a + pr * (1 - a);
      pg = (d.c[1] / 255) * a + pg * (1 - a);
      pb = (d.c[2] / 255) * a + pb * (1 - a);
      pa = a + pa * (1 - a);
    }
    const a8 = Math.round(pa * 255);
    if (a8 === 0) return [0, 0, 0, 0];
    return [Math.round((pr / pa) * 255), Math.round((pg / pa) * 255), Math.round((pb / pa) * 255), a8];
  });
}

interface Quality {
  readonly psnr: number;
  readonly alphaMaxError: number;
}

/** Premultiplied-colour PSNR and alpha max error between straight RGBA images. */
function compare(source: ArrayLike<number>, decoded: ArrayLike<number>): Quality {
  let sse = 0;
  let alphaMaxError = 0;
  const pixels = source.length / 4;
  for (let p = 0; p < pixels; p += 1) {
    const sa = source[p * 4 + 3]!;
    const da = decoded[p * 4 + 3]!;
    alphaMaxError = Math.max(alphaMaxError, Math.abs(sa - da));
    for (let c = 0; c < 3; c += 1) {
      const d = (source[p * 4 + c]! * sa) / 255 - (decoded[p * 4 + c]! * da) / 255;
      sse += d * d;
    }
  }
  const mse = sse / (pixels * 3);
  return { psnr: mse === 0 ? 99 : 10 * Math.log10((255 * 255) / mse), alphaMaxError };
}

function roundTrip(width: number, height: number, rgba: Uint8ClampedArray, quantizationIndex = 8) {
  const encoder = new ProResEncoder({ width, height, quantizationIndex, fps: 30 });
  const frame = encoder.encodeFrame(rgba);
  const decoded = decodeProResFrame(frame);
  return { frame, decoded, rgba: decodedToRgba(decoded), encoder };
}

// ---------------------------------------------------------------------------------------------- VLC

describe('MOV-PR-01 variable-length codes (RDD 36 §7.1.1)', () => {
  it('writes exponential-Golomb and Golomb-Rice/exp-Golomb combination codewords bit-exactly', () => {
    const cases: [Codebook, number, string][] = [
      [{ type: 'exp', k: 0 }, 0, '1'],
      [{ type: 'exp', k: 0 }, 1, '010'],
      [{ type: 'exp', k: 0 }, 2, '011'],
      [{ type: 'exp', k: 0 }, 3, '00100'],
      [{ type: 'exp', k: 5 }, 0, '100000'],
      [{ type: 'exp', k: 5 }, 32, '01000000'],
      [{ type: 'exp', k: 2 }, 5, '01001'], // 5 + 4 = 9 = '1001' with one leading zero
      // RICE_EXP_COMBO_CODE(2, 0, 1): Rice order 0 for n < 3, then '000' + exp-Golomb(1) of n − 3.
      [{ type: 'combo', lastRiceQ: 2, kRice: 0, kExp: 1 }, 0, '1'],
      [{ type: 'combo', lastRiceQ: 2, kRice: 0, kExp: 1 }, 2, '001'],
      [{ type: 'combo', lastRiceQ: 2, kRice: 0, kExp: 1 }, 3, '00010'],
      [{ type: 'combo', lastRiceQ: 2, kRice: 0, kExp: 1 }, 5, '0000100'],
      // RICE_EXP_COMBO_CODE(1, 2, 3): Rice order 2 for n < 8.
      [{ type: 'combo', lastRiceQ: 1, kRice: 2, kExp: 3 }, 6, '0110'],
      [{ type: 'combo', lastRiceQ: 1, kRice: 2, kExp: 3 }, 8, '001000'],
    ];
    for (const [codebook, symbol, expected] of cases) {
      const writer = new BitWriter(16);
      writeCodeword(writer, codebook, symbol);
      expect(bitString(writer), `${JSON.stringify(codebook)} n=${symbol}`).toBe(expected);
    }
  });

  it('round-trips every codebook of Tables 9–11 through the independent decoder, incl. large symbols', () => {
    const codebooks = [{ type: 'exp', k: 5 } as const, ...DC_DIFF_CODEBOOKS, ...RUN_CODEBOOKS, ...LEVEL_CODEBOOKS];
    const symbols = [...Array.from({ length: 600 }, (_, i) => i), 1023, 1024, 4095, 8191, 65535, 262143];
    for (const codebook of codebooks) {
      const writer = new BitWriter(64);
      const fast = new FastCodebook(codebook);
      for (const symbol of symbols) fast.write(writer, symbol);
      writer.alignToByte();
      expect(decodeCodewords(writer.bytes().slice(), toTestCode(codebook), symbols.length)).toEqual(symbols);
    }
  });

  it('table-driven codewords equal the generic writer', () => {
    for (const codebook of [...DC_DIFF_CODEBOOKS, ...RUN_CODEBOOKS, ...LEVEL_CODEBOOKS]) {
      const fast = new FastCodebook(codebook);
      for (let symbol = 0; symbol < 700; symbol += 1) {
        const a = new BitWriter(8);
        const b = new BitWriter(8);
        fast.write(a, symbol);
        writeCodeword(b, codebook, symbol);
        expect(bitString(a)).toBe(bitString(b));
      }
    }
  });

  it('maps signed integers to symbols per Table 8', () => {
    expect([0, -1, 1, -2, 2, -3, 3].map(signedToSymbol)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('scanned_coefficients(): random coefficient arrays (DC differences, runs, signed levels) decode exactly', () => {
    const random = rng(7);
    for (const numBlocks of [4, 8, 16, 32]) {
      const coeffs = new Int32Array(numBlocks * 64);
      for (let i = 0; i < coeffs.length; i += 1) {
        const r = random();
        if (i < numBlocks) coeffs[i] = Math.round((random() - 0.5) * 8000);
        else if (r < 0.1) coeffs[i] = Math.round((random() - 0.5) * 2 ** (1 + random() * 13));
      }
      coeffs[coeffs.length - 1] = 0; // trailing zeros are implicit
      const writer = new BitWriter(64);
      const size = writeScannedCoefficients(writer, coeffs, numBlocks);
      expect(size).toBe(writer.bytes().length);
      expect(Array.from(decodeScannedCoefficients(writer.bytes().slice(), 0, size, numBlocks))).toEqual(Array.from(coeffs));
    }
  });

  it('scanned_coefficients(): an all-zero AC array is just the DC codes, byte aligned', () => {
    const writer = new BitWriter(8);
    const size = writeScannedCoefficients(writer, new Int32Array(4 * 64), 4);
    // first_dc_coeff 0 = exp-Golomb(5) '100000', then three DC differences of 0 with exp-Golomb(3) '1000', (0) '1', (0) '1'.
    expect(size).toBe(2);
    expect(Array.from(writer.bytes())).toEqual([0b10000010, 0b00110000]);
  });
});

describe('MOV-PR-02 alpha run-length coding (RDD 36 §7.1.2, Tables 12–13)', () => {
  it('uses the 1-bit, 5-bit and escaped 16-bit run codes and the 5-bit / escaped 9-bit differences', () => {
    const writer = new BitWriter(16);
    // values: 0 ×1 (diff +1 from −1), 3 ×2 (diff +3), 255 ×17 (diff +252 → escape)
    const values = [0, 3, 3, ...new Array<number>(17).fill(255)];
    writeScannedAlpha(writer, values, 0, values.length, values.length, 1);
    expect(bitString(writer)).toBe(
      '00000' + '1' + // +1, run 1
      '00100' + '00001' + // +3, run 2
      '1' + '11111100' + '00000' + '00000010000' + // escape 252, run 17
      '0000000', // zero_bits up to the byte boundary
    );
  });

  it('round-trips long runs (> 2048), zero differences after a maximal run and every 8-bit value', () => {
    const values: number[] = [...new Array<number>(5000).fill(0), ...Array.from({ length: 256 }, (_, i) => i), 255, 0, 255, ...new Array<number>(2048).fill(128), 7];
    const writer = new BitWriter(64);
    writeScannedAlpha(writer, values, 0, values.length, values.length, 1);
    const bytes = writer.bytes().slice();
    expect(Array.from(decodeScannedAlpha(bytes, 0, bytes.length, values.length, 1))).toEqual(values);
  });

  it('reads a strided region (slice rows inside a wider plane)', () => {
    const plane = Uint8Array.from({ length: 40 * 3 }, (_, i) => (i % 40 < 16 ? (i * 7) & 0xff : 99));
    const writer = new BitWriter(64);
    writeScannedAlpha(writer, plane, 0, 40, 16, 3);
    const expected = [0, 1, 2].flatMap((row) => Array.from(plane.subarray(row * 40, row * 40 + 16)));
    const bytes = writer.bytes().slice();
    expect(Array.from(decodeScannedAlpha(bytes, 0, bytes.length, 48, 1))).toEqual(expected);
  });
});

// ---------------------------------------------------------------------------------------------- tables, DCT, colour

describe('MOV-PR-03 scan, quantization and slice tables', () => {
  it('progressive scan is Figure 4 and a permutation of 0..63', () => {
    expect(PROGRESSIVE_SCAN).toEqual(TEST_PROGRESSIVE_SCAN.flat());
    expect([...PROGRESSIVE_SCAN].sort((a, b) => a - b)).toEqual(Array.from({ length: 64 }, (_, i) => i));
    expect(PROGRESSIVE_SCAN.slice(0, 8)).toEqual([0, 1, 4, 5, 16, 17, 21, 22]);
  });

  it('qScale follows Table 15', () => {
    expect([1, 2, 127, 128, 129, 130, 223, 224].map(qScaleForIndex)).toEqual([1, 2, 127, 128, 132, 136, 508, 512]);
    expect(() => qScaleForIndex(0)).toThrow(RangeError);
    expect(() => qScaleForIndex(225)).toThrow(RangeError);
  });

  it('slice layout matches the §4 example (45 macroblocks, desired size 8 → 8,8,8,8,8,4,1)', () => {
    expect(sliceSizesInMb(45, 3)).toEqual([8, 8, 8, 8, 8, 4, 1]);
    expect(sliceSizesInMb(15, 3)).toEqual([8, 4, 2, 1]);
    expect(sliceSizesInMb(1, 3)).toEqual([1]);
    expect(sliceSizesInMb(5, 1)).toEqual([2, 2, 1]);
  });

  it('frame_rate_code follows Table 4 for integral rates', () => {
    expect([24, 25, 30, 50, 60, 12].map(frameRateCode)).toEqual([2, 3, 5, 6, 8, 0]);
  });
});

describe('MOV-PR-04 forward DCT', () => {
  it('equals the direct DCT formula and inverts with the reference IDCT of §7.4', () => {
    const random = rng(3);
    const block = Float64Array.from({ length: 64 }, () => (random() - 0.5) * 500);
    const original = block.slice();
    forwardDct8x8(block, new Float64Array(64));
    const basis = dctBasis();
    for (let v = 0; v < 8; v += 1) {
      for (let u = 0; u < 8; u += 1) {
        let direct = 0;
        for (let y = 0; y < 8; y += 1) for (let x = 0; x < 8; x += 1) direct += original[y * 8 + x]! * basis[u * 8 + x]! * basis[v * 8 + y]!;
        expect(block[v * 8 + u]).toBeCloseTo(direct, 9);
      }
    }
    // f = 1/4 ΣΣ C(u)C(v) F cos cos
    for (let y = 0; y < 8; y += 1) {
      for (let x = 0; x < 8; x += 1) {
        let sum = 0;
        for (let v = 0; v < 8; v += 1) {
          for (let u = 0; u < 8; u += 1) {
            const cu = u === 0 ? Math.SQRT1_2 : 1;
            const cv = v === 0 ? Math.SQRT1_2 : 1;
            sum += cu * cv * block[v * 8 + u]! * Math.cos(((2 * x + 1) * u * Math.PI) / 16) * Math.cos(((2 * y + 1) * v * Math.PI) / 16);
          }
        }
        expect(sum / 4).toBeCloseTo(original[y * 8 + x]!, 9);
      }
    }
  });

  it('a constant block has only a DC coefficient of 8 × value', () => {
    const block = new Float64Array(64).fill(-100);
    forwardDct8x8(block, new Float64Array(64));
    expect(block[0]).toBeCloseTo(-800, 9);
    for (let i = 1; i < 64; i += 1) expect(Math.abs(block[i]!)).toBeLessThan(1e-9);
  });
});

describe('MOV-PR-05 RGB → Y′CbCr (BT.709, video levels)', () => {
  it('maps black, white and primaries to the nominal levels (v = 2 × 8-bit level − 256)', () => {
    const rgba = Uint8Array.from([0, 0, 0, 255, 255, 255, 255, 255, 255, 0, 0, 255, 0, 0, 255, 255]);
    const planes = createPlanes(16, 16);
    rgbaToPlanes(rgba, 4, 1, planes, false);
    expect(planes.y[0]).toBeCloseTo(2 * 16 - 256, 4);
    expect(planes.y[1]).toBeCloseTo(2 * 235 - 256, 4);
    expect(planes.cb[1]).toBeCloseTo(0, 4);
    expect(planes.cr[1]).toBeCloseTo(0, 4);
    expect(planes.cr[2]).toBeCloseTo(2 * 240 - 256, 4); // red: Cr at nominal peak
    expect(planes.cb[3]).toBeCloseTo(2 * 240 - 256, 4); // blue: Cb at nominal peak
    expect(planes.y[2]).toBeCloseTo(2 * (16 + 219 * 0.2126) - 256, 4);
    // padding replicates the last column / row
    expect(planes.y[15]).toBe(planes.y[3]);
    expect(planes.y[16 * 15 + 3]).toBe(planes.y[3]);
    expect(planes.alpha[16 * 15 + 15]).toBe(255);
  });

  it('transparent fill keeps visible pixels and gives alpha-0 pixels colours within the visible range', () => {
    const rgba = image(32, 16, (x) => (x < 10 ? [255, 0, 0, 255] : x < 12 ? [0, 0, 255, 128] : [0, 0, 0, 0]));
    const planes = createPlanes(32, 16);
    rgbaToPlanes(rgba, 32, 16, planes, false);
    const before = planes.y.slice();
    new TransparentFill(32, 16).apply(planes);
    for (let x = 0; x < 12; x += 1) expect(planes.y[x]).toBe(before[x]);
    const visible = [before[0]!, before[10]!];
    for (let x = 12; x < 32; x += 1) {
      expect(planes.y[x]).toBeGreaterThanOrEqual(Math.min(...visible) - 1e-3);
      expect(planes.y[x]).toBeLessThanOrEqual(Math.max(...visible) + 1e-3);
    }
    expect(planes.y[31]).not.toBe(before[31]); // black was replaced
  });
});

// ---------------------------------------------------------------------------------------------- frames

describe('MOV-PR-06 ProRes 4444 frame syntax', () => {
  it('writes frame_size, icpf, a version-1 4:4:4 progressive header with 8-bit alpha and BT.709 description', () => {
    const { frame, decoded } = roundTrip(40, 20, softScene(40, 20));
    const view = new DataView(frame.buffer);
    expect(view.getUint32(0)).toBe(frame.length);
    expect(String.fromCharCode(...frame.subarray(4, 8))).toBe('icpf');
    const h = decoded.header;
    expect(h).toMatchObject({
      frameHeaderSize: 148, bitstreamVersion: 1, width: 40, height: 20, chromaFormat: 3, interlaceMode: 0,
      frameRateCode: 5, colorPrimaries: 1, transferCharacteristic: 2, matrixCoefficients: 1, alphaChannelType: 1,
    });
    expect(h.lumaMatrix).toEqual(new Array(64).fill(4));
    expect(h.chromaMatrix).toEqual(new Array(64).fill(4));
    // picture: 3 macroblocks wide → slices of 2 and 1; 2 macroblock rows
    expect(decoded.sliceSizes).toEqual([2, 1]);
    expect(decoded.log2SliceSizeInMb).toBe(3);
    expect(decoded.quantizationIndices).toEqual([8, 8, 8, 8]);
    expect(8 + h.frameHeaderSize + decoded.pictureSize).toBe(frame.length); // no stuffing
  });

  it('slice header carries coded sizes of Y, Cb and Cr; the alpha data fill the rest of the slice', () => {
    const { frame } = roundTrip(16, 16, softScene(16, 16));
    const view = new DataView(frame.buffer);
    const picture = 8 + 148;
    expect(frame[picture]! >> 3).toBe(8);
    expect(view.getUint16(picture + 5)).toBe(1); // deprecated_number_of_slices
    const sliceSize = view.getUint16(picture + 8);
    const slice = picture + 10;
    expect(picture + 10 + sliceSize).toBe(frame.length);
    expect(frame[slice]! >> 3).toBe(8);
    const ySize = view.getUint16(slice + 2), cbSize = view.getUint16(slice + 4), crSize = view.getUint16(slice + 6);
    expect(8 + ySize + cbSize + crSize).toBeLessThan(sliceSize);
  });
});

describe('MOV-PR-07 encode → independent decode', () => {
  it('reproduces 8-bit RGBA exactly at the finest quantizer and alpha exactly at every quantizer', () => {
    const rgba = softScene(48, 32, 5);
    const fine = roundTrip(48, 32, rgba, 1);
    let maxColourError = 0;
    for (let i = 0; i < rgba.length; i += 1) if (i % 4 !== 3 && rgba[i + 3 - (i % 4)]! > 0) maxColourError = Math.max(maxColourError, Math.abs(rgba[i]! - fine.rgba[i]!));
    expect(maxColourError).toBeLessThanOrEqual(1);
    for (const q of [1, 8, 24, 64, 224]) {
      expect(compare(rgba, roundTrip(48, 32, rgba, q).rgba).alphaMaxError).toBe(0);
    }
  });

  it.each([
    ['1×1', 1, 1],
    ['17×9 (partial macroblocks)', 17, 9],
    ['333×77', 333, 77],
    ['240×16 (slices 8,4,2,1)', 240, 16],
    ['130×50', 130, 50],
  ])('meets the quality targets for %s', (_label, width, height) => {
    const rgba = softScene(width, height, width * 31 + height);
    for (const [quality, minPsnr] of [['high', 45], ['standard', 38]] as const) {
      const { rgba: decoded } = roundTrip(width, height, rgba, MOV_QUANTIZATION_INDEX[quality]);
      const result = compare(rgba, decoded);
      expect(result.alphaMaxError).toBe(0);
      expect(result.psnr, `${quality}`).toBeGreaterThanOrEqual(minPsnr);
    }
  });

  it('handles fully transparent, fully opaque, alpha gradients, thin lines and colour patches', () => {
    const cases: [string, Painter][] = [
      ['transparent', () => [0, 0, 0, 0]],
      ['opaque', (x, y) => [(x * 4) & 255, (y * 9) & 255, 128, 255]],
      ['alpha gradient', (x) => [255, 128, 0, Math.round((x / 63) * 255)]],
      ['thin lines', (x, y) => (x % 7 === 0 || y % 5 === 0 ? [255, 255, 255, 255] : [0, 0, 0, 0])],
      ['patches', (x, y) => [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0]][(x >> 4) % 4]!.concat([y < 16 ? 255 : 96]) as [number, number, number, number]],
    ];
    for (const [label, paint] of cases) {
      const rgba = image(64, 32, paint);
      const result = compare(rgba, roundTrip(64, 32, rgba, MOV_QUANTIZATION_INDEX.high).rgba);
      expect(result.alphaMaxError, label).toBe(0);
      expect(result.psnr, label).toBeGreaterThanOrEqual(label === 'thin lines' ? 38 : 45);
    }
  });

  it('a slice that would overflow its size fields is requantized with a coarser quantization_index', () => {
    const random = rng(11);
    const width = 256, height = 32;
    const rgba = image(width, height, () => [random() * 255, random() * 255, random() * 255, random() * 255]);
    // Real 16-bit overflow needs pathological input; a lower limit exercises the same path.
    const encoder = new ProResEncoder({ width, height, quantizationIndex: 1, sliceByteLimit: 6000 });
    const frame = encoder.encodeFrame(rgba);
    const decoded = decodeProResFrame(frame);
    expect(encoder.lastMaxQuantizationIndex).toBeGreaterThan(1);
    expect(Math.max(...decoded.quantizationIndices)).toBe(encoder.lastMaxQuantizationIndex);
    const view = new DataView(frame.buffer);
    for (let s = 0; s < decoded.quantizationIndices.length; s += 1) expect(view.getUint16(8 + 148 + 8 + 2 * s)).toBeLessThanOrEqual(6000);
    expect(compare(rgba, decodedToRgba(decoded)).alphaMaxError).toBe(0);
  });

  it('premultiplied mode stores colour × alpha', () => {
    const rgba = image(16, 16, () => [255, 255, 255, 128]);
    const encoder = new ProResEncoder({ width: 16, height: 16, quantizationIndex: 1, premultiplyAlpha: true });
    const out = decodedToRgba(decodeProResFrame(encoder.encodeFrame(rgba)));
    expect(out[0]).toBeGreaterThanOrEqual(127);
    expect(out[0]).toBeLessThanOrEqual(129);
    expect(out[3]).toBe(128);
  });

  it('rejects bad parameters', () => {
    expect(() => new ProResEncoder({ width: 0, height: 10, quantizationIndex: 8 })).toThrow(RangeError);
    expect(() => new ProResEncoder({ width: 10, height: 10, quantizationIndex: 0 })).toThrow(RangeError);
    expect(() => new ProResEncoder({ width: 10, height: 10, quantizationIndex: 8, log2SliceSizeInMb: 4 })).toThrow(RangeError);
    expect(() => new ProResEncoder({ width: 10, height: 10, quantizationIndex: 8 }).encodeFrame(new Uint8Array(10))).toThrow(RangeError);
  });
});

// ---------------------------------------------------------------------------------------------- QuickTime

describe('MOV-QT-01 QuickTime container', () => {
  const width = 40, height = 24;
  const frames = [0, 1, 2].map((seed) => new ProResEncoder({ width, height, quantizationIndex: 8 }).encodeFrame(softScene(width, height, seed + 1)));
  const options = { width, height, fps: 30, codec: 'ap4h', compressorName: 'Apple ProRes 4444', depth: 32, color: MOV_COLOR };
  const mov = buildMov(options, frames);
  const boxes = parseBoxes(mov);

  it('lays out ftyp (qt), wide, mdat, moov', () => {
    expect(boxes.map((box) => box.type)).toEqual(['ftyp', 'wide', 'mdat', 'moov']);
    expect(String.fromCharCode(...mov.subarray(8, 12))).toBe('qt  ');
    expect(findBox(boxes, 'mdat').size).toBe(8 + frames.reduce((sum, frame) => sum + frame.length, 0));
  });

  it('has consistent timing: mvhd / tkhd / mdhd / elst durations and one stts entry', () => {
    const timing = movTiming(30);
    expect(timing).toEqual({ timescale: 600, sampleDelta: 20 });
    const mvhd = payload(mov, findBox(boxes, 'moov/mvhd'));
    expect(mvhd.getUint32(12)).toBe(600);
    expect(mvhd.getUint32(16)).toBe(60);
    const tkhd = payload(mov, findBox(boxes, 'moov/trak/tkhd'));
    expect(tkhd.getUint32(0) & 0xffffff).toBe(0x0f);
    expect(tkhd.getUint32(20)).toBe(60);
    expect(tkhd.getUint32(76)).toBe(width * 65536);
    expect(tkhd.getUint32(80)).toBe(height * 65536);
    const elst = payload(mov, findBox(boxes, 'moov/trak/edts/elst'));
    expect([elst.getUint32(4), elst.getUint32(8), elst.getInt32(12)]).toEqual([1, 60, 0]);
    const mdhd = payload(mov, findBox(boxes, 'moov/trak/mdia/mdhd'));
    expect([mdhd.getUint32(12), mdhd.getUint32(16)]).toEqual([600, 60]);
    const stts = payload(mov, findBox(boxes, 'moov/trak/mdia/minf/stbl/stts'));
    expect([stts.getUint32(4), stts.getUint32(8), stts.getUint32(12)]).toEqual([1, 3, 20]);
    expect(movTiming(7)).toEqual({ timescale: 700, sampleDelta: 100 });
    expect(movTiming(24)).toEqual({ timescale: 600, sampleDelta: 25 });
  });

  it('describes the samples as ap4h, depth 32, with nclc 1/13/1, fiel and pasp', () => {
    const stsdBox = findBox(boxes, 'moov/trak/mdia/minf/stbl/stsd');
    const stsd = payload(mov, stsdBox);
    expect(stsd.getUint32(4)).toBe(1);
    const entryStart = stsdBox.offset + stsdBox.headerSize + 8;
    const entry = new DataView(mov.buffer, entryStart);
    const entrySize = entry.getUint32(0);
    expect(String.fromCharCode(...mov.subarray(entryStart + 4, entryStart + 8))).toBe('ap4h');
    expect(entry.getUint16(14)).toBe(1); // data reference index
    expect([entry.getUint16(32), entry.getUint16(34)]).toEqual([width, height]);
    expect(mov[entryStart + 50]).toBe(17);
    expect(String.fromCharCode(...mov.subarray(entryStart + 51, entryStart + 68))).toBe('Apple ProRes 4444');
    expect(entry.getUint16(82)).toBe(32);
    expect(entry.getInt16(84)).toBe(-1);
    const extensions = parseBoxes(mov, entryStart + 86, entryStart + entrySize);
    expect(extensions.map((box) => box.type)).toEqual(['colr', 'fiel', 'pasp']);
    const colr = payload(mov, extensions[0]!);
    expect(String.fromCharCode(colr.getUint8(0), colr.getUint8(1), colr.getUint8(2), colr.getUint8(3))).toBe('nclc');
    expect([colr.getUint16(4), colr.getUint16(6), colr.getUint16(8)]).toEqual([1, 13, 1]);
  });

  it('sample sizes and chunk offsets point at each ProRes frame', () => {
    const stsz = payload(mov, findBox(boxes, 'moov/trak/mdia/minf/stbl/stsz'));
    const stco = payload(mov, findBox(boxes, 'moov/trak/mdia/minf/stbl/stco'));
    const stsc = payload(mov, findBox(boxes, 'moov/trak/mdia/minf/stbl/stsc'));
    expect([stsc.getUint32(4), stsc.getUint32(8), stsc.getUint32(12), stsc.getUint32(16)]).toEqual([1, 1, 1, 1]);
    expect(stsz.getUint32(4)).toBe(0);
    expect(stsz.getUint32(8)).toBe(3);
    expect(stco.getUint32(4)).toBe(3);
    for (let i = 0; i < 3; i += 1) {
      const size = stsz.getUint32(12 + 4 * i);
      const offset = stco.getUint32(8 + 4 * i);
      expect(size).toBe(frames[i]!.length);
      expect(Array.from(mov.subarray(offset, offset + size))).toEqual(Array.from(frames[i]!));
      expect(decodeProResFrame(mov.subarray(offset, offset + size)).header.width).toBe(width);
    }
  });

  it('rejects empty input and bad parameters', () => {
    expect(() => buildMov(options, [])).toThrow(RangeError);
    expect(() => buildMov({ ...options, codec: 'ap4' }, frames)).toThrow(RangeError);
    expect(() => movTiming(0)).toThrow(RangeError);
    expect(() => movTiming(29.97)).toThrow(RangeError);
  });
});

// ---------------------------------------------------------------------------------------------- export

describe('MOV-EXP-01 exportMov', () => {
  const render = (width: number, height: number) => (time: number) => softScene(width, height, Math.round(time * 1000) + 1);

  it('encodes one frame per timeline time with progress to 100 % and a decodable .mov', async () => {
    const progress: number[] = [];
    const result = await exportMov({
      width: 48, height: 20, duration: 0.5, fps: 10, quality: 'standard',
      render: render(48, 20), onProgress: (p) => progress.push(p.percent), yieldControl: async () => {},
    });
    expect(result.frameCount).toBe(createFrameTimeline(0.5, 10).count);
    expect(result.quantizationIndex).toBe(MOV_QUANTIZATION_INDEX.standard);
    // One tick at the start plus one per frame.
    expect(progress).toHaveLength(1 + result.frameCount);
    expect(progress[0]).toBe(0);
    expect([...progress].sort((a, b) => a - b)).toEqual(progress);
    expect(progress.at(-1)).toBe(100);
    const boxes = parseBoxes(result.bytes);
    const stsz = payload(result.bytes, findBox(boxes, 'moov/trak/mdia/minf/stbl/stsz'));
    const stco = payload(result.bytes, findBox(boxes, 'moov/trak/mdia/minf/stbl/stco'));
    expect(stsz.getUint32(8)).toBe(result.frameCount);
    const times = createFrameTimeline(0.5, 10).times;
    for (let i = 0; i < result.frameCount; i += 1) {
      const offset = stco.getUint32(8 + 4 * i);
      const decoded = decodedToRgba(decodeProResFrame(result.bytes.subarray(offset, offset + stsz.getUint32(12 + 4 * i))));
      const quality = compare(render(48, 20)(times[i]!), decoded);
      expect(quality.alphaMaxError).toBe(0);
      expect(quality.psnr).toBeGreaterThanOrEqual(38);
    }
  });

  it('stops with ExportCancelledError when the signal is aborted', async () => {
    const controller = new AbortController();
    let rendered = 0;
    await expect(
      exportMov({
        width: 32, height: 16, duration: 1, fps: 30, quality: 'high', signal: controller.signal,
        render: (time) => {
          rendered += 1;
          if (rendered === 3) controller.abort();
          return render(32, 16)(time);
        },
        yieldControl: async () => {},
      }),
    ).rejects.toBeInstanceOf(ExportCancelledError);
    expect(rendered).toBe(3);
  });

  it('applies the frame / pixel-frame guards and gives a size estimate', async () => {
    await expect(exportMov({ width: 1920, height: 1080, duration: 61, fps: 30, quality: 'high', render: render(1, 1) })).rejects.toThrow(RangeError);
    expect(estimateMovBytes(1280, 360, 90, 'high')).toBeGreaterThan(estimateMovBytes(1280, 360, 90, 'standard'));
    expect(estimateMovBytes(1920, 1080, 600, 'high')).toBeLessThan(2 * 1024 ** 3);
  });
});
