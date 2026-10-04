function mix32(value: number): number {
  let x = value | 0;
  x = Math.imul(x ^ (x >>> 16), 0x21f0aaad);
  x = Math.imul(x ^ (x >>> 15), 0x735a2d97);
  return (x ^ (x >>> 15)) >>> 0;
}

export function hashIntegers(a: number, b = 0, c = 0): number {
  const x = mix32((a | 0) ^ 0x9e3779b9);
  const y = mix32((b | 0) ^ 0x85ebca6b);
  const z = mix32((c | 0) ^ 0xc2b2ae35);
  return mix32(x ^ Math.imul(y, 0x27d4eb2d) ^ Math.imul(z, 0x165667b1));
}

export function seededRandom(a: number, b = 0, c = 0): number {
  return hashIntegers(a, b, c) / 0x1_0000_0000;
}

export function glyphSeed(pageIndex: number, groupIndex: number, sourceIndex: number): number {
  return hashIntegers(pageIndex + 1, groupIndex + 1, sourceIndex + 1);
}

/** The three per-glyph random values r1, r2, r3 ∈ [0,1) of FX-02, derived from the glyph seed. */
export function glyphRandoms(seed: number): readonly [number, number, number] {
  return [seededRandom(seed, 1, 11), seededRandom(seed, 2, 17), seededRandom(seed, 3, 23)];
}

export function timeBucket(time: number, rate: number): number {
  return Math.floor(Math.max(0, time) * rate + 1e-9);
}

export function timeRandom(time: number, rate: number, series = 0, seed = 0): number {
  return seededRandom(timeBucket(time, rate), series, seed);
}

export function smoothNoise1D(position: number, series = 0, seed = 0): number {
  const lo = Math.floor(position);
  const fraction = position - lo;
  const blend = fraction * fraction * (3 - 2 * fraction);
  const a = seededRandom(lo, series, seed) * 2 - 1;
  const b = seededRandom(lo + 1, series, seed) * 2 - 1;
  return a + (b - a) * blend;
}

export function deterministicShuffle(length: number, seed: number): number[] {
  const values = Array.from({ length }, (_, index) => index);
  for (let index = length - 1; index > 0; index -= 1) {
    const target = Math.floor(seededRandom(seed, index, length) * (index + 1));
    [values[index], values[target]] = [values[target]!, values[index]!];
  }
  const ranks = Array<number>(length);
  values.forEach((sourceIndex, rank) => {
    ranks[sourceIndex] = rank;
  });
  return ranks;
}
