/**
 * Separable 8×8 forward DCT, the exact inverse of the RDD 36 §7.4 IDCT
 * (f = 1/4 ΣΣ C(u)C(v) F cos cos, i.e. the orthonormal DCT-II of IEEE Std 1180-1990):
 * F[v][u] = 1/4 C(u) C(v) Σx Σy f[y][x] cos((2x+1)uπ/16) cos((2y+1)vπ/16).
 */
const BASIS = (() => {
  const basis = new Float64Array(64);
  for (let u = 0; u < 8; u += 1) {
    const scale = u === 0 ? 0.5 / Math.SQRT2 : 0.5;
    for (let x = 0; x < 8; x += 1) basis[u * 8 + x] = scale * Math.cos(((2 * x + 1) * u * Math.PI) / 16);
  }
  return basis;
})();

/** Basis value c[u][x] = C(u)/2 · cos((2x+1)uπ/16). */
export function dctBasis(): Float64Array {
  return BASIS.slice();
}

/** In-place forward DCT of a row-major 8×8 block (`block[y * 8 + x]` → `block[v * 8 + u]`). */
export function forwardDct8x8(block: Float64Array, scratch: Float64Array): void {
  const c = BASIS;
  for (let y = 0; y < 8; y += 1) {
    const o = y * 8;
    const s0 = block[o]!, s1 = block[o + 1]!, s2 = block[o + 2]!, s3 = block[o + 3]!;
    const s4 = block[o + 4]!, s5 = block[o + 5]!, s6 = block[o + 6]!, s7 = block[o + 7]!;
    for (let u = 0; u < 8; u += 1) {
      const k = u * 8;
      scratch[o + u] =
        s0 * c[k]! + s1 * c[k + 1]! + s2 * c[k + 2]! + s3 * c[k + 3]! +
        s4 * c[k + 4]! + s5 * c[k + 5]! + s6 * c[k + 6]! + s7 * c[k + 7]!;
    }
  }
  for (let u = 0; u < 8; u += 1) {
    const t0 = scratch[u]!, t1 = scratch[8 + u]!, t2 = scratch[16 + u]!, t3 = scratch[24 + u]!;
    const t4 = scratch[32 + u]!, t5 = scratch[40 + u]!, t6 = scratch[48 + u]!, t7 = scratch[56 + u]!;
    for (let v = 0; v < 8; v += 1) {
      const k = v * 8;
      block[k + u] =
        t0 * c[k]! + t1 * c[k + 1]! + t2 * c[k + 2]! + t3 * c[k + 3]! +
        t4 * c[k + 4]! + t5 * c[k + 5]! + t6 * c[k + 6]! + t7 * c[k + 7]!;
    }
  }
}
