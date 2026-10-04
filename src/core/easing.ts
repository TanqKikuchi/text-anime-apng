/** UI-selectable curves (FX-E01). 'auto' resolves to the effect's default curve. */
export type EasingId =
  | 'auto'
  | 'outCubic'
  | 'outExpo'
  | 'inOutCubic'
  | 'outBack'
  | 'outElastic'
  | 'outBounce'
  | 'linear'
  | 'inCubic';

/** Every concrete curve, including the internal-only ones (inQuad, outQuad, outQuart, inExpo). */
export type CurveName = Exclude<EasingId, 'auto'> | 'inQuad' | 'outQuad' | 'outQuart' | 'inExpo';

export type EasingFunction = (value: number) => number;

export const EASING_IDS: readonly EasingId[] = ['auto', 'outCubic', 'outExpo', 'inOutCubic', 'outBack', 'outElastic', 'outBounce', 'linear', 'inCubic'];

export function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export const linear: EasingFunction = (x) => clamp01(x);
export const inQuad: EasingFunction = (x) => clamp01(x) ** 2;
export const outQuad: EasingFunction = (x) => 1 - (1 - clamp01(x)) ** 2;
export const inCubic: EasingFunction = (x) => clamp01(x) ** 3;
export const outCubic: EasingFunction = (x) => 1 - (1 - clamp01(x)) ** 3;
export const outQuart: EasingFunction = (x) => 1 - (1 - clamp01(x)) ** 4;
export const inOutCubic: EasingFunction = (x) => {
  const value = clamp01(x);
  return value < 0.5 ? 4 * value ** 3 : 1 - (-2 * value + 2) ** 3 / 2;
};
export const outExpo: EasingFunction = (x) => {
  const value = clamp01(x);
  return value >= 1 ? 1 : 1 - 2 ** (-10 * value);
};
export const inExpo: EasingFunction = (x) => {
  const value = clamp01(x);
  return value <= 0 ? 0 : 2 ** (10 * value - 10);
};
export const outBack: EasingFunction = (x) => {
  const value = clamp01(x);
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (value - 1) ** 3 + c1 * (value - 1) ** 2;
};
export const outElastic: EasingFunction = (x) => {
  const value = clamp01(x);
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return 2 ** (-10 * value) * Math.sin(((10 * value - 0.75) * 2 * Math.PI) / 3) + 1;
};
export const outBounce: EasingFunction = (x) => {
  let value = clamp01(x);
  const n1 = 7.5625;
  const d1 = 2.75;
  if (value < 1 / d1) return n1 * value * value;
  if (value < 2 / d1) {
    value -= 1.5 / d1;
    return n1 * value * value + 0.75;
  }
  if (value < 2.5 / d1) {
    value -= 2.25 / d1;
    return n1 * value * value + 0.9375;
  }
  value -= 2.625 / d1;
  return n1 * value * value + 0.984375;
};

export const CURVES: Readonly<Record<CurveName, EasingFunction>> = {
  outCubic,
  outExpo,
  inOutCubic,
  outBack,
  outElastic,
  outBounce,
  linear,
  inCubic,
  inQuad,
  outQuad,
  outQuart,
  inExpo,
};

/** Kept for backward compatibility: the UI-selectable subset of CURVES. */
export const EASINGS: Readonly<Record<Exclude<EasingId, 'auto'>, EasingFunction>> = {
  outCubic,
  outExpo,
  inOutCubic,
  outBack,
  outElastic,
  outBounce,
  linear,
  inCubic,
};

/** Resolves a UI choice: 'auto' (or an unknown id) uses the effect's default curve. */
export function easing(id: EasingId, automatic: CurveName = 'outCubic'): EasingFunction {
  if (id === 'auto' || !(id in CURVES)) return CURVES[automatic];
  return CURVES[id];
}

export function smoothstep(value: number): number {
  const x = clamp01(value);
  return x * x * (3 - 2 * x);
}

/** Smoothstep between two edges (GLSL semantics). */
export function smoothstepRange(edge0: number, edge1: number, value: number): number {
  if (edge1 === edge0) return value < edge0 ? 0 : 1;
  return smoothstep((value - edge0) / (edge1 - edge0));
}

export function lerp(start: number, end: number, amount: number): number {
  return start + (end - start) * amount;
}
