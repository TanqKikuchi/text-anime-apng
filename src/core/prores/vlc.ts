import { BitWriter } from './bitwriter.ts';

/**
 * Variable-length codes of SMPTE RDD 36 §7.1.1: exponential-Golomb codes and
 * Golomb-Rice / exponential-Golomb combination codes.
 */
export type Codebook =
  | { readonly type: 'exp'; readonly k: number }
  | { readonly type: 'combo'; readonly lastRiceQ: number; readonly kRice: number; readonly kExp: number };

export const expGolomb = (k: number): Codebook => ({ type: 'exp', k });
export const riceExpCombo = (lastRiceQ: number, kRice: number, kExp: number): Codebook => ({
  type: 'combo',
  lastRiceQ,
  kRice,
  kExp,
});

/** Codebook for first_dc_coeff (§7.1.1.3). */
export const FIRST_DC_CODEBOOK = expGolomb(5);

/** Table 9, indexed by min(|previousDCDiff|, 3). */
export const DC_DIFF_CODEBOOKS: readonly Codebook[] = [
  expGolomb(0),
  expGolomb(1),
  riceExpCombo(1, 2, 3),
  expGolomb(3),
];

/** Table 10, indexed by min(previousRun, 15). */
export const RUN_CODEBOOKS: readonly Codebook[] = [
  riceExpCombo(2, 0, 1),
  riceExpCombo(2, 0, 1),
  riceExpCombo(1, 0, 1),
  riceExpCombo(1, 0, 1),
  expGolomb(0),
  riceExpCombo(1, 1, 2),
  riceExpCombo(1, 1, 2),
  riceExpCombo(1, 1, 2),
  riceExpCombo(1, 1, 2),
  expGolomb(1),
  expGolomb(1),
  expGolomb(1),
  expGolomb(1),
  expGolomb(1),
  expGolomb(1),
  expGolomb(2),
];

/** Table 11, indexed by min(previousLevelSymbol, 8). */
export const LEVEL_CODEBOOKS: readonly Codebook[] = [
  riceExpCombo(2, 0, 2),
  riceExpCombo(1, 0, 1),
  riceExpCombo(2, 0, 1),
  expGolomb(0),
  expGolomb(1),
  expGolomb(1),
  expGolomb(1),
  expGolomb(1),
  expGolomb(2),
];

/** Initial adaptation state for each scanned coefficient array. */
export const INITIAL_PREVIOUS_DC_DIFF = 3;
export const INITIAL_PREVIOUS_RUN = 4;
export const INITIAL_PREVIOUS_LEVEL_SYMBOL = 1;

/** Signed integer-to-symbol mapping S(n) (§7.1.1.2, Table 8). */
export function signedToSymbol(n: number): number {
  return n >= 0 ? 2 * n : -2 * n - 1;
}

function bitLength(value: number): number {
  return value <= 0 ? 0 : 32 - Math.clz32(value);
}

/** Order-k exponential-Golomb codeword: q = floor(log2(n + 2^k)) - k zeros, then n + 2^k in q + k + 1 bits. */
export function writeExpGolomb(writer: BitWriter, k: number, n: number): void {
  const value = n + 2 ** k;
  const length = value < 2 ** 31 ? bitLength(value) : Math.floor(Math.log2(value)) + 1;
  writer.writeZeros(length - 1 - k);
  writer.writeBits(value, length);
}

export function writeCodeword(writer: BitWriter, codebook: Codebook, n: number): void {
  if (codebook.type === 'exp') {
    writeExpGolomb(writer, codebook.k, n);
    return;
  }
  const threshold = (codebook.lastRiceQ + 1) << codebook.kRice;
  if (n < threshold) {
    writer.writeZeros(n >> codebook.kRice);
    writer.writeBit(1);
    if (codebook.kRice > 0) writer.writeBits(n & ((1 << codebook.kRice) - 1), codebook.kRice);
    return;
  }
  writer.writeZeros(codebook.lastRiceQ + 1);
  writeExpGolomb(writer, codebook.kExp, n - threshold);
}

const TABLE_SYMBOLS = 512;

/**
 * Precomputed codewords for small symbols (all codewords for symbols < 512 are at most 24 bits long),
 * falling back to the generic writer for larger ones.
 */
export class FastCodebook {
  private readonly codes = new Uint32Array(TABLE_SYMBOLS);
  private readonly lengths = new Uint8Array(TABLE_SYMBOLS);

  readonly codebook: Codebook;

  constructor(codebook: Codebook) {
    this.codebook = codebook;
    const scratch = new BitWriter(64);
    for (let symbol = 0; symbol < TABLE_SYMBOLS; symbol += 1) {
      scratch.reset();
      writeCodeword(scratch, codebook, symbol);
      const length = scratch.bitLength;
      if (length > 24) throw new Error('Codeword table entry too long');
      scratch.alignToByte();
      const bytes = scratch.bytes();
      let value = 0;
      for (const byte of bytes) value = value * 256 + byte;
      this.codes[symbol] = Math.floor(value / 2 ** (bytes.length * 8 - length));
      this.lengths[symbol] = length;
    }
  }

  write(writer: BitWriter, symbol: number): void {
    if (symbol < TABLE_SYMBOLS) writer.writeBits(this.codes[symbol]!, this.lengths[symbol]!);
    else writeCodeword(writer, this.codebook, symbol);
  }
}

export const FAST_FIRST_DC = new FastCodebook(FIRST_DC_CODEBOOK);
export const FAST_DC_DIFF: readonly FastCodebook[] = DC_DIFF_CODEBOOKS.map((cb) => new FastCodebook(cb));
export const FAST_RUN: readonly FastCodebook[] = RUN_CODEBOOKS.map((cb) => new FastCodebook(cb));
export const FAST_LEVEL: readonly FastCodebook[] = LEVEL_CODEBOOKS.map((cb) => new FastCodebook(cb));
