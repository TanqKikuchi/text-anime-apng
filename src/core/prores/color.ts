/**
 * RGBA (8-bit sRGB / BT.709 primaries) → Y′CbCr planes in the "reconstructed value" domain of
 * RDD 36 §7.5.1: v = 512 * s / 2^b − 256, i.e. v = 2 * (8-bit video level) − 256.
 * Luma: 8-bit levels 16..235 (v = −224..214); chroma: 16..240 around 128 (v = −224..224).
 * Matrix: ITU-R BT.709 (matrix_coefficients = 1).
 */
const KR = 0.2126;
const KG = 0.7152;
const KB = 0.0722;

const Y_SCALE = 438 / 255; // 2 * 219 per unit E′Y, per 8-bit code value
const Y_OFFSET = -224; // 2 * 16 - 256
const CB_SCALE = 448 / (2 * (1 - KB)) / 255;
const CR_SCALE = 448 / (2 * (1 - KR)) / 255;

export const LUMA_COEFFS = { KR, KG, KB } as const;

export interface YCbCrPlanes {
  /** Padded width / height (multiples of 16). */
  readonly stride: number;
  readonly paddedHeight: number;
  readonly y: Float32Array;
  readonly cb: Float32Array;
  readonly cr: Float32Array;
  /** 8-bit alpha, same padded layout. */
  readonly alpha: Uint8Array;
}

export function createPlanes(stride: number, paddedHeight: number): YCbCrPlanes {
  const size = stride * paddedHeight;
  return {
    stride,
    paddedHeight,
    y: new Float32Array(size),
    cb: new Float32Array(size),
    cr: new Float32Array(size),
    alpha: new Uint8Array(size),
  };
}

/**
 * Converts one straight-alpha RGBA frame into the planes, replicating the last column / row into
 * the padding (RDD 36 §4 lets encoders choose the appended pixels).
 * When `premultiply` is true the colour is multiplied by alpha first.
 */
export function rgbaToPlanes(
  rgba: ArrayLike<number>,
  width: number,
  height: number,
  planes: YCbCrPlanes,
  premultiply: boolean,
): void {
  if (rgba.length < width * height * 4) throw new RangeError('RGBA buffer is smaller than width × height × 4');
  const { stride, paddedHeight, y, cb, cr, alpha } = planes;
  for (let row = 0; row < height; row += 1) {
    let src = row * width * 4;
    let dst = row * stride;
    for (let col = 0; col < width; col += 1, src += 4, dst += 1) {
      let r = rgba[src]!;
      let g = rgba[src + 1]!;
      let b = rgba[src + 2]!;
      const a = rgba[src + 3]!;
      if (premultiply && a !== 255) {
        const f = a / 255;
        r *= f;
        g *= f;
        b *= f;
      }
      const luma = KR * r + KG * g + KB * b;
      y[dst] = luma * Y_SCALE + Y_OFFSET;
      cb[dst] = (b - luma) * CB_SCALE;
      cr[dst] = (r - luma) * CR_SCALE;
      alpha[dst] = a;
    }
    const last = row * stride + width - 1;
    for (let col = width; col < stride; col += 1) {
      const dstPad = row * stride + col;
      y[dstPad] = y[last]!;
      cb[dstPad] = cb[last]!;
      cr[dstPad] = cr[last]!;
      alpha[dstPad] = alpha[last]!;
    }
  }
  const lastRow = (height - 1) * stride;
  for (let row = height; row < paddedHeight; row += 1) {
    const start = row * stride;
    y.copyWithin(start, lastRow, lastRow + stride);
    cb.copyWithin(start, lastRow, lastRow + stride);
    cr.copyWithin(start, lastRow, lastRow + stride);
    alpha.copyWithin(start, lastRow, lastRow + stride);
  }
}

interface FillLevel {
  readonly width: number;
  readonly height: number;
  readonly y: Float32Array;
  readonly cb: Float32Array;
  readonly cr: Float32Array;
  readonly weight: Float32Array;
}

/**
 * Replaces the colour of fully transparent pixels (alpha 0, invisible with straight alpha) by a smooth
 * extension of the visible colours (push-pull: averaged pyramid down, fill holes from coarser levels up).
 * Visible pixels are untouched; the hard colour edges at the alpha-0 boundary disappear, which saves bits
 * and avoids DCT ringing leaking into visible edge pixels.
 */
export class TransparentFill {
  private readonly levels: FillLevel[] = [];

  constructor(width: number, height: number) {
    let w = width;
    let h = height;
    for (;;) {
      const size = w * h;
      this.levels.push({ width: w, height: h, y: new Float32Array(size), cb: new Float32Array(size), cr: new Float32Array(size), weight: new Float32Array(size) });
      if (w === 1 && h === 1) break;
      w = (w + 1) >> 1;
      h = (h + 1) >> 1;
    }
  }

  apply(planes: YCbCrPlanes): void {
    const base = this.levels[0]!;
    if (base.width !== planes.stride || base.height !== planes.paddedHeight) throw new RangeError('TransparentFill size mismatch');
    const { alpha } = planes;
    let transparent = 0;
    for (let i = 0; i < alpha.length; i += 1) if (alpha[i] === 0) transparent += 1;
    if (transparent === 0 || transparent === alpha.length) return;
    for (let i = 0; i < alpha.length; i += 1) {
      const w = alpha[i] === 0 ? 0 : 1;
      base.weight[i] = w;
      base.y[i] = planes.y[i]! * w;
      base.cb[i] = planes.cb[i]! * w;
      base.cr[i] = planes.cr[i]! * w;
    }
    // Push: 2×2 sums (weighted colour sums and weights).
    for (let k = 1; k < this.levels.length; k += 1) {
      const fine = this.levels[k - 1]!;
      const coarse = this.levels[k]!;
      coarse.weight.fill(0);
      coarse.y.fill(0);
      coarse.cb.fill(0);
      coarse.cr.fill(0);
      for (let fy = 0; fy < fine.height; fy += 1) {
        const crow = (fy >> 1) * coarse.width;
        const frow = fy * fine.width;
        for (let fx = 0; fx < fine.width; fx += 1) {
          const f = frow + fx;
          const c = crow + (fx >> 1);
          coarse.weight[c] += fine.weight[f]!;
          coarse.y[c] += fine.y[f]!;
          coarse.cb[c] += fine.cb[f]!;
          coarse.cr[c] += fine.cr[f]!;
        }
      }
    }
    // Normalise every level to mean colours where weight > 0.
    for (const level of this.levels) {
      for (let i = 0; i < level.weight.length; i += 1) {
        const w = level.weight[i]!;
        if (w > 0) {
          level.y[i] /= w;
          level.cb[i] /= w;
          level.cr[i] /= w;
        }
      }
    }
    // Pull: holes take the (already filled) colour of the coarser level, bilinearly interpolated.
    for (let k = this.levels.length - 2; k >= 0; k -= 1) {
      const fine = this.levels[k]!;
      const coarse = this.levels[k + 1]!;
      const targetY = k === 0 ? planes.y : fine.y;
      const targetCb = k === 0 ? planes.cb : fine.cb;
      const targetCr = k === 0 ? planes.cr : fine.cr;
      for (let fy = 0; fy < fine.height; fy += 1) {
        // Fine pixel centre in coarse pixel coordinates.
        const cyf = Math.min(Math.max((fy + 0.5) / 2 - 0.5, 0), coarse.height - 1);
        const cy0 = Math.floor(cyf);
        const cy1 = Math.min(cy0 + 1, coarse.height - 1);
        const ty = cyf - cy0;
        for (let fx = 0; fx < fine.width; fx += 1) {
          const f = fy * fine.width + fx;
          if (fine.weight[f]! > 0) continue;
          const cxf = Math.min(Math.max((fx + 0.5) / 2 - 0.5, 0), coarse.width - 1);
          const cx0 = Math.floor(cxf);
          const cx1 = Math.min(cx0 + 1, coarse.width - 1);
          const tx = cxf - cx0;
          const a = cy0 * coarse.width + cx0;
          const b = cy0 * coarse.width + cx1;
          const c = cy1 * coarse.width + cx0;
          const d = cy1 * coarse.width + cx1;
          const wa = (1 - tx) * (1 - ty), wb = tx * (1 - ty), wc = (1 - tx) * ty, wd = tx * ty;
          targetY[f] = coarse.y[a]! * wa + coarse.y[b]! * wb + coarse.y[c]! * wc + coarse.y[d]! * wd;
          targetCb[f] = coarse.cb[a]! * wa + coarse.cb[b]! * wb + coarse.cb[c]! * wc + coarse.cb[d]! * wd;
          targetCr[f] = coarse.cr[a]! * wa + coarse.cr[b]! * wb + coarse.cr[c]! * wc + coarse.cr[d]! * wd;
        }
      }
    }
  }
}
