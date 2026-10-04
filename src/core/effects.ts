import { clamp01, easing, inCubic, lerp, outCubic, outQuad, smoothstepRange, type CurveName, type EasingId } from './easing';
import { glyphRandoms, seededRandom, smoothNoise1D, timeBucket, timeRandom } from './random';
import type { Direction, EnterEffectId, ExitEffectId, HoldEffectId, Scene, SubEnterChoice } from './scene';

/** FX-01 per-glyph state. rotation is in radians, clockwise positive; blur in px. */
export interface TransformState {
  a: number;
  x: number;
  y: number;
  s: number;
  sx: number;
  sy: number;
  rotation: number;
  blur: number;
}

export interface WipeMask {
  readonly direction: Direction;
  /** Eased progress e. */
  readonly progress: number;
  readonly phase: 'enter' | 'exit';
}

/** FX-01 per-page block state. */
export interface BlockState extends TransformState {
  bright: number;
  glitch: number;
  glowMultiplier: number;
  layerAlpha: number;
  mask?: WipeMask;
}

export interface EffectContext {
  /** Raw progress p (0〜1). */
  readonly progress: number;
  readonly easing?: EasingId;
  readonly strength?: number;
  readonly direction?: Direction;
  /** Actual font size S in px. */
  readonly size: number;
  readonly time?: number;
  readonly seed?: number;
  readonly displayIndex?: number;
  readonly odd?: boolean;
  readonly vertical?: boolean;
  readonly lineOffset?: number;
  readonly lineReach?: number;
  readonly lineDisplayCount?: number;
}

export interface EffectDefaults {
  readonly easing: CurveName;
  readonly duration: number;
  readonly stagger: number;
  readonly unit: 'character' | 'block';
  readonly directions?: readonly Direction[];
  /** Whether the strength slider applies (FX-02). */
  readonly hasStrength: boolean;
}

const SIDES: readonly Direction[] = ['left', 'right', 'up', 'down'];
const WIPES: readonly Direction[] = ['left-to-right', 'right-to-left', 'top-to-bottom', 'bottom-to-top', 'center'];
const AXES: readonly Direction[] = ['vertical', 'horizontal'];

const char = (easingName: CurveName, duration: number, stagger: number, extra: Partial<EffectDefaults> = {}): EffectDefaults => ({ easing: easingName, duration, stagger, unit: 'character', hasStrength: true, ...extra });
const block = (easingName: CurveName, duration: number, extra: Partial<EffectDefaults> = {}): EffectDefaults => ({ easing: easingName, duration, stagger: 0, unit: 'block', hasStrength: true, ...extra });

export const ENTER_EFFECT_DEFAULTS: Readonly<Record<EnterEffectId, EffectDefaults>> = {
  'FX-I01': char('outCubic', 0.6, 0, { hasStrength: false }),
  'FX-I02': char('outCubic', 0.8, 0.06),
  'FX-I03': char('outCubic', 0.8, 0.06),
  'FX-I04': char('outCubic', 0.9, 0.1),
  'FX-I05': char('outCubic', 0.7, 0.04, { directions: SIDES }),
  'FX-I06': char('outCubic', 1.4, 0),
  'FX-I07': char('outQuart', 1.3, 0),
  'FX-I08': char('outCubic', 0.8, 0.05),
  'FX-I09': char('outBack', 0.5, 0.07),
  'FX-I10': char('outCubic', 0.55, 0.06),
  'FX-I11': char('outCubic', 0.8, 0.06),
  'FX-I12': char('outBack', 0.6, 0.06),
  'FX-I13': char('outBounce', 0.9, 0.07),
  'FX-I14': char('outCubic', 1.1, 0.02),
  'FX-I15': char('linear', 0, 0.08, { hasStrength: false }),
  'FX-I16': char('linear', 0.9, 0.05),
  'FX-I17': block('linear', 0.75),
  'FX-I18': block('outCubic', 0.9),
  'FX-I19': block('outCubic', 0.9),
  'FX-I20': block('inOutCubic', 0.9, { directions: WIPES }),
  'FX-I21': block('outExpo', 0.6, { directions: AXES }),
  'FX-I22': block('linear', 0.9),
  'FX-I23': block('outCubic', 0.8),
};

export const EXIT_EFFECT_DEFAULTS: Readonly<Record<ExitEffectId, EffectDefaults>> = {
  'FX-O01': char('inCubic', 0.6, 0, { hasStrength: false }),
  'FX-O02': char('inCubic', 0.8, 0.04),
  'FX-O03': char('inCubic', 0.8, 0.04),
  'FX-O04': char('inCubic', 0.8, 0.06),
  'FX-O05': char('inCubic', 0.7, 0.03, { directions: SIDES }),
  'FX-O06': char('inCubic', 1.2, 0),
  'FX-O07': char('inCubic', 0.8, 0.03),
  'FX-O08': char('inCubic', 0.6, 0.04),
  'FX-O09': char('inCubic', 0.6, 0.04),
  'FX-O10': char('inCubic', 1, 0.02),
  'FX-O11': char('linear', 0, 0.06, { hasStrength: false }),
  'FX-O12': char('linear', 0.8, 0.04),
  'FX-O13': block('inCubic', 0.6),
  'FX-O14': block('inCubic', 0.7),
  'FX-O15': block('inOutCubic', 0.8, { directions: WIPES }),
  'FX-O16': block('inExpo', 0.5, { directions: AXES }),
  'FX-O17': block('linear', 0.8),
};

/** Effects that use the glitch post-process (DEC-08 colour fields are shown only for these). */
export const GLITCH_EFFECTS: ReadonlySet<string> = new Set(['FX-I22', 'FX-O17', 'FX-H08']);

/** Enter effects that the trailer may not use (block effects and FX-I07); they fall back to fade. */
export function isTrailerEnterAllowed(id: EnterEffectId): boolean {
  return ENTER_EFFECT_DEFAULTS[id].unit === 'character' && id !== 'FX-I07';
}

export function createTransformState(): TransformState {
  return { a: 1, x: 0, y: 0, s: 1, sx: 1, sy: 1, rotation: 0, blur: 0 };
}

export function createBlockState(): BlockState {
  return { ...createTransformState(), bright: 0, glitch: 0, glowMultiplier: 1, layerAlpha: 1 };
}

/** FX-02: an invalid direction for the effect resolves to the effect's first direction. */
export function resolveDirection(defaults: EffectDefaults, direction: Direction | undefined): Direction | undefined {
  const allowed = defaults.directions;
  if (!allowed) return undefined;
  return direction !== undefined && allowed.includes(direction) ? direction : allowed[0];
}

function move(state: TransformState, side: Direction, distance: number): void {
  if (side === 'left') state.x -= distance;
  if (side === 'right') state.x += distance;
  if (side === 'up') state.y -= distance;
  if (side === 'down') state.y += distance;
}

function progressOf(context: EffectContext, automatic: CurveName): { p: number; e: number; k: number } {
  const p = clamp01(context.progress);
  return { p, e: easing(context.easing ?? 'auto', automatic)(p), k: context.strength ?? 1 };
}

/** FX-I16 / FX-O12 flicker on progress q, with an independent random series per phase. */
function flicker(q: number, seed: number, series: number): number {
  if (q >= 1) return 1;
  const step = Math.min(15, Math.floor(clamp01(q) * 16));
  return seededRandom(step, seed, series) < 0.25 + 0.85 * q ? 0.35 + 0.65 * q : 0.05 * q;
}

/** Overlap opacity and scatter used by FX-I07 and the trailer "expand" flow (TL-10). */
export function expandParameters(lineDisplayCount: number, lineReach: number, size: number): { overlap: number; scatter: number } {
  const count = Math.max(1, lineDisplayCount);
  return {
    overlap: Math.max(0.3, Math.min(1, 1.8 / Math.sqrt(count))),
    scatter: lineReach <= 0 ? 0.2 : Math.min(0.2, (0.9 * size) / lineReach),
  };
}

/** Per-character enter effects (FX-I01〜I16). Block effects are ignored here. */
export function applyEnterEffect(id: EnterEffectId, state: TransformState, context: EffectContext): TransformState {
  const defaults = ENTER_EFFECT_DEFAULTS[id];
  if (defaults.unit === 'block') return state;
  const { p, e, k } = progressOf(context, defaults.easing);
  const size = context.size;
  switch (id) {
    case 'FX-I01':
      state.a *= e;
      break;
    case 'FX-I02':
      state.a *= e;
      state.y += (1 - e) * 0.55 * size * k;
      break;
    case 'FX-I03':
      state.a *= e;
      state.y -= (1 - e) * 0.55 * size * k;
      break;
    case 'FX-I04': {
      const distance = (1 - e) * 0.6 * size * k;
      if (context.vertical) state.x += context.odd ? -distance : distance;
      else state.y += context.odd ? distance : -distance;
      state.a *= e;
      break;
    }
    case 'FX-I05':
      move(state, resolveDirection(defaults, context.direction) ?? 'left', (1 - e) * 1.1 * size * k);
      state.a *= e;
      break;
    case 'FX-I06': {
      const offset = (context.lineOffset ?? 0) * 1.6 * k * (1 - e);
      if (context.vertical) state.y += offset;
      else state.x += offset;
      state.a *= e;
      break;
    }
    case 'FX-I07': {
      const appear = clamp01(p / 0.18);
      const spreadRaw = clamp01((p - 0.42) / 0.58);
      const spread = easing(context.easing ?? 'auto', defaults.easing)(spreadRaw);
      const { overlap, scatter } = expandParameters(context.lineDisplayCount ?? 1, context.lineReach ?? 0, size);
      const shift = -(context.lineOffset ?? 0) * (1 - spread) * (1 - scatter);
      if (context.vertical) state.y += shift;
      else state.x += shift;
      state.a *= outQuad(appear) * lerp(overlap, 1, spread);
      state.s *= 1 + 0.25 * k * (1 - outCubic(appear));
      break;
    }
    case 'FX-I08':
      state.blur += (1 - e) * 0.28 * size * k;
      state.a *= e;
      break;
    case 'FX-I09':
      state.s *= Math.max(0.001, e);
      state.a *= clamp01(3 * p);
      break;
    case 'FX-I10':
      state.s *= 1 + (1 - e) * 1.6 * k;
      state.a *= e;
      break;
    case 'FX-I11':
      state.rotation += -0.8 * Math.PI * k * (1 - e);
      state.s *= 0.3 + 0.7 * e;
      state.a *= e;
      break;
    case 'FX-I12':
      if (context.vertical) state.sx *= Math.max(0.001, e);
      else state.sy *= Math.max(0.001, e);
      state.a *= clamp01(2.5 * p);
      break;
    case 'FX-I13':
      state.y -= (1 - e) * 1.3 * size * k;
      state.a *= clamp01(6 * p);
      break;
    case 'FX-I14': {
      const [r1, r2, r3] = glyphRandoms(context.seed ?? 0);
      const distance = (1.4 + 1.8 * r2) * size * k * (1 - e);
      state.x += Math.cos(r1 * 2 * Math.PI) * distance;
      state.y += Math.sin(r1 * 2 * Math.PI) * distance;
      state.rotation += (r3 - 0.5) * 2.4 * (1 - e);
      state.a *= e;
      break;
    }
    case 'FX-I15':
      break;
    case 'FX-I16':
      state.a *= flicker(p, context.seed ?? 0, 101);
      break;
    default:
      break;
  }
  return state;
}

/** Per-character exit effects (FX-O01〜O12). e is the exit progress. */
export function applyExitEffect(id: ExitEffectId, state: TransformState, context: EffectContext): TransformState {
  const defaults = EXIT_EFFECT_DEFAULTS[id];
  if (defaults.unit === 'block') return state;
  const { p, e, k } = progressOf(context, defaults.easing);
  const size = context.size;
  switch (id) {
    case 'FX-O01':
      state.a *= 1 - e;
      break;
    case 'FX-O02':
      state.y -= e * 0.55 * size * k;
      state.a *= 1 - e;
      break;
    case 'FX-O03':
      state.y += e * 0.55 * size * k;
      state.a *= 1 - e;
      break;
    case 'FX-O04': {
      const distance = e * 0.6 * size * k;
      if (context.vertical) state.x += context.odd ? -distance : distance;
      else state.y += context.odd ? distance : -distance;
      state.a *= 1 - e;
      break;
    }
    case 'FX-O05':
      move(state, resolveDirection(defaults, context.direction) ?? 'left', e * 1.1 * size * k);
      state.a *= 1 - e;
      break;
    case 'FX-O06': {
      const offset = (context.lineOffset ?? 0) * 1.6 * k * e;
      if (context.vertical) state.y += offset;
      else state.x += offset;
      state.a *= 1 - e;
      break;
    }
    case 'FX-O07':
      state.blur += e * 0.28 * size * k;
      state.a *= 1 - e;
      break;
    case 'FX-O08':
      state.s *= 1 + e * 1.3 * k;
      state.a *= 1 - e;
      break;
    case 'FX-O09':
      state.s *= Math.max(0.001, 1 - 0.95 * e);
      state.a *= 1 - e ** 2;
      break;
    case 'FX-O10': {
      const [r1, r2, r3] = glyphRandoms(context.seed ?? 0);
      const distance = (1.4 + 1.8 * r2) * size * k * e;
      state.x += Math.cos(r1 * 2 * Math.PI) * distance;
      state.y += Math.sin(r1 * 2 * Math.PI) * distance;
      state.rotation += (r3 - 0.5) * 2.4 * e;
      state.a *= 1 - e;
      break;
    }
    case 'FX-O11':
      // Instant: the timeline hides the glyph at its exit start (duration 0).
      if (p > 0) state.a = 0;
      break;
    case 'FX-O12':
      state.a *= p >= 1 ? 0 : flicker(1 - p, context.seed ?? 0, 211);
      break;
    default:
      break;
  }
  return state;
}

/** Block enter effects (FX-I17〜I23). */
export function applyBlockEnterEffect(id: EnterEffectId, state: BlockState, context: EffectContext): BlockState {
  const defaults = ENTER_EFFECT_DEFAULTS[id];
  if (defaults.unit === 'character') return state;
  const { p, e, k } = progressOf(context, defaults.easing);
  const size = context.size;
  const time = context.time ?? 0;
  const seed = context.seed ?? 0;
  switch (id) {
    case 'FX-I17':
      if (p < 0.4) {
        const q = p / 0.4;
        state.s *= 1 + (1 - q ** 2) * 2.4 * k;
        state.a *= clamp01(2.2 * q);
        state.blur += (1 - q) * 0.04 * size;
      } else if (p < 1) {
        const q = (p - 0.4) / 0.6;
        const decay = (1 - q) ** 2;
        state.s *= 1 + Math.sin(3 * Math.PI * q) * 0.05 * decay * k;
        state.x += smoothNoise1D(time * 42, 1, seed) * 0.08 * size * decay * k;
        state.y += smoothNoise1D(time * 42, 2, seed) * 0.08 * size * decay * k;
        state.bright = Math.max(state.bright, (1 - q) ** 3 * 0.85);
      }
      break;
    case 'FX-I18':
      state.s *= 1 + (1 - e) * 0.9 * k;
      state.a *= e;
      state.blur += (1 - e) * 0.1 * size * k;
      break;
    case 'FX-I19':
      state.s *= Math.max(0.05, 1 - (1 - e) * 0.6 * k);
      state.a *= e;
      break;
    case 'FX-I20':
      if (p < 1) state.mask = { direction: resolveDirection(defaults, context.direction) ?? 'left-to-right', progress: e, phase: 'enter' };
      break;
    case 'FX-I21':
      if (resolveDirection(defaults, context.direction) === 'horizontal') state.sx *= Math.max(0.001, e);
      else state.sy *= Math.max(0.001, e);
      state.a *= clamp01(1.6 * e);
      break;
    case 'FX-I22': {
      state.glitch = Math.max(state.glitch, (1 - p) * k);
      if (p < 1) {
        const r1 = timeRandom(time, 24, 1, seed);
        const r2 = timeRandom(time, 24, 2, seed);
        state.a *= p > 0.8 || r1 < 0.3 + 0.6 * p ? 1 : 0.12;
        state.x += (r2 - 0.5) * 0.18 * size * (1 - p) * k;
      }
      break;
    }
    case 'FX-I23':
      state.a *= clamp01(5 * p);
      state.bright = Math.max(state.bright, 1 - e);
      state.glowMultiplier *= 1 + (1 - e) * 1.5;
      break;
    default:
      break;
  }
  return state;
}

/** Block exit effects (FX-O13〜O17). */
export function applyBlockExitEffect(id: ExitEffectId, state: BlockState, context: EffectContext): BlockState {
  const defaults = EXIT_EFFECT_DEFAULTS[id];
  if (defaults.unit === 'character') return state;
  const { p, e, k } = progressOf(context, defaults.easing);
  const size = context.size;
  const time = context.time ?? 0;
  const seed = context.seed ?? 0;
  switch (id) {
    case 'FX-O13':
      state.s *= 1 + e * 0.9 * k;
      state.a *= 1 - e;
      state.blur += e * 0.1 * size * k;
      break;
    case 'FX-O14':
      state.s *= Math.max(0.05, 1 - e * 0.6 * k);
      state.a *= 1 - e;
      break;
    case 'FX-O15':
      if (p > 0) state.mask = { direction: resolveDirection(defaults, context.direction) ?? 'left-to-right', progress: e, phase: 'exit' };
      if (p >= 1) state.a = 0;
      break;
    case 'FX-O16': {
      const amount = Math.max(0.001, 1 - e);
      if (resolveDirection(defaults, context.direction) === 'horizontal') state.sx *= amount;
      else state.sy *= amount;
      state.a *= clamp01(1.6 * (1 - e));
      break;
    }
    case 'FX-O17': {
      state.glitch = Math.max(state.glitch, p * k);
      const r1 = timeRandom(time, 24, 3, seed);
      const r2 = timeRandom(time, 24, 4, seed);
      state.a *= (1 - p ** 3) * (p < 0.15 || r1 < 0.85 - 0.6 * p ? 1 : 0.1);
      state.x += (r2 - 0.5) * 0.18 * size * p * k;
      break;
    }
    default:
      break;
  }
  return state;
}

export interface HoldContext {
  readonly time: number;
  readonly size: number;
  readonly strength: number;
  readonly seed?: number;
  readonly displayIndex?: number;
  /** Page enter-complete time (FX-H07 starts from it). */
  readonly enterComplete?: number;
}

/** Per-character hold effects (only FX-H02 wave is per character). */
export function applyHoldCharacterEffect(id: HoldEffectId, state: TransformState, context: HoldContext): TransformState {
  if (id === 'FX-H02') {
    state.y += Math.sin((2 * Math.PI * context.time) / 1.6 - (context.displayIndex ?? 0) * 0.6) * 0.07 * context.size * context.strength;
  }
  return state;
}

function positiveModulo(value: number, period: number): number {
  return ((value % period) + period) % period;
}

/** Block hold effects (FX-H01, H03〜H08). Applied once per page per frame. */
export function applyHoldBlockEffect(id: HoldEffectId, state: BlockState, context: HoldContext): BlockState {
  const { time, size } = context;
  const k = context.strength;
  const seed = context.seed ?? 0;
  switch (id) {
    case 'FX-H01':
      state.y += Math.sin((2 * Math.PI * time) / 2.6) * 0.05 * size * k;
      break;
    case 'FX-H03': {
      const c = positiveModulo(time, 1.1);
      const beat = Math.exp(-(((c - 0.1) / 0.06) ** 2)) + 0.6 * Math.exp(-(((c - 0.3) / 0.06) ** 2));
      state.s *= 1 + beat * 0.035 * k;
      break;
    }
    case 'FX-H04':
      state.x += (timeRandom(time, 20, 5, seed) * 2 - 1) * 0.025 * size * k;
      state.y += (timeRandom(time, 20, 6, seed) * 2 - 1) * 0.025 * size * k;
      break;
    case 'FX-H05':
      state.glowMultiplier *= Math.max(0, Math.min(2, 1 - 0.45 * k * (0.5 + 0.5 * Math.cos((2 * Math.PI * time) / 1.8))));
      break;
    case 'FX-H06':
      if (timeRandom(time, 12, 7, seed) < 0.09 * k) state.layerAlpha *= 0.2 + timeRandom(time, 12, 8, seed) * 0.35;
      break;
    case 'FX-H07': {
      const elapsed = time - (context.enterComplete ?? 0);
      if (elapsed >= 0 && positiveModulo(elapsed, 0.5) >= 0.3 - 1e-9) state.layerAlpha *= clamp01(1 - 0.85 * k);
      break;
    }
    case 'FX-H08':
      if (positiveModulo(time, 1.7) < 0.14) state.glitch = Math.max(state.glitch, 0.55 * k);
      break;
    default:
      break;
  }
  return state;
}

/** TL-10: state of a glyph in the trailer "expand" flow, `elapsed` seconds after the character start. */
export function applyTrailerExpand(state: TransformState, elapsed: number, params: {
  readonly overlapHold: number;
  readonly expandDuration: number;
  readonly lineDisplayCount: number;
  readonly lineReach: number;
  readonly size: number;
  /** Signed distance from the glyph's home position to the page-box centre along the line axis. */
  readonly towardCenter: number;
  readonly vertical: boolean;
}): TransformState {
  const appear = clamp01(elapsed / 0.25);
  const spreadStart = 0.25 + params.overlapHold;
  const spreadP = elapsed <= spreadStart ? 0 : clamp01((elapsed - spreadStart) / params.expandDuration);
  const k = elapsed <= spreadStart ? 0 : 1 - (1 - spreadP) ** 4;
  const { overlap, scatter } = expandParameters(params.lineDisplayCount, params.lineReach, params.size);
  const shift = params.towardCenter * (1 - k) * (1 - scatter);
  if (params.vertical) state.y += shift;
  else state.x += shift;
  state.a *= outQuad(appear) * lerp(overlap, 1, spreadP);
  state.s *= 1 + 0.25 * (1 - outCubic(appear));
  return state;
}

/** TL-09: block "slam" right after the whole text appears. */
export function applyCenterSlam(state: BlockState, elapsed: number, params: { readonly impact: number; readonly room: number; readonly size: number; readonly seed?: number; readonly time: number }): BlockState {
  if (elapsed < 0 || elapsed >= 0.26) return state;
  const impact = Math.min(3, Math.max(0, params.impact));
  const d = (1 - elapsed / 0.26) ** 3;
  state.s *= 1 + Math.min(0.2 * impact, Math.max(0, params.room - 1)) * d;
  const bucket = timeBucket(params.time, 30);
  state.x += (seededRandom(bucket, 31, params.seed ?? 0) * 2 - 1) * 0.03 * params.size * impact * d;
  state.y += (seededRandom(bucket, 32, params.seed ?? 0) * 2 - 1) * 0.03 * params.size * impact * d;
  state.bright = Math.max(state.bright, Math.min(1, 0.6 * impact * d));
  return state;
}

/** TL-09: scale of the big centre glyph within its beat (p = progress inside the beat). */
export function centerGlyphScale(p: number, impact: number): number {
  return 1 + 0.08 * Math.min(3, Math.max(0, impact)) * (1 - clamp01(p)) ** 2;
}

/**
 * FX-P01 wipe mask alpha at `coordinate` along the wipe axis. [low, high] is the masked range
 * (transformed page box grown by 0.25S), `softness` the soft edge width.
 */
export function wipeAlpha(mask: WipeMask, coordinate: number, low: number, high: number, softness: number): number {
  const soft = Math.max(1e-6, softness);
  if (mask.direction === 'center') {
    const center = (low + high) / 2;
    const distance = Math.abs(coordinate - center);
    const width = lerp(0, (high - low) / 2 + soft, mask.progress);
    const revealed = clamp01((width - distance) / soft);
    return mask.phase === 'enter' ? revealed : 1 - revealed;
  }
  const reverse = mask.direction === 'right-to-left' || mask.direction === 'bottom-to-top';
  const position = reverse ? low + high - coordinate : coordinate;
  if (mask.phase === 'enter') {
    const edge = lerp(low, high + soft, mask.progress);
    return clamp01((edge - position) / soft);
  }
  const edge = lerp(low - soft, high, mask.progress);
  return clamp01((position - edge) / soft);
}

export interface GradientStop {
  readonly offset: number;
  readonly alpha: number;
}

/**
 * Converts a wipe mask into linear-gradient stops over [from, to] = [low − softness, high + softness]
 * along the wipe axis (the renderer pads beyond both ends). Exact: alpha is piecewise linear.
 */
export function wipeMaskStops(mask: WipeMask, low: number, high: number, softness: number): { readonly from: number; readonly to: number; readonly stops: readonly GradientStop[] } {
  const soft = Math.max(1e-6, softness);
  const from = low - 2 * soft;
  const to = high + 2 * soft;
  const center = (low + high) / 2;
  const breakpoints: number[] = [from, to];
  if (mask.direction === 'center') {
    const width = lerp(0, (high - low) / 2 + soft, mask.progress);
    breakpoints.push(center - width, center - width + soft, center + width - soft, center + width, center);
  } else {
    const reverse = mask.direction === 'right-to-left' || mask.direction === 'bottom-to-top';
    const edge = mask.phase === 'enter' ? lerp(low, high + soft, mask.progress) : lerp(low - soft, high, mask.progress);
    const a = mask.phase === 'enter' ? edge - soft : edge;
    const b = mask.phase === 'enter' ? edge : edge + soft;
    for (const value of [a, b]) breakpoints.push(reverse ? low + high - value : value);
  }
  const span = to - from;
  const stops = [...new Set(breakpoints.filter((value) => value >= from && value <= to))]
    .sort((x, y) => x - y)
    .map((value) => ({ offset: (value - from) / span, alpha: wipeAlpha(mask, value, low, high, soft) }));
  return { from, to, stops };
}

export interface GlitchSlice {
  readonly y: number;
  readonly height: number;
  readonly offsetX: number;
}

export interface GlitchPlan {
  readonly amount: number;
  readonly shift: number;
  readonly slices: readonly GlitchSlice[];
}

/** FX-P02: deterministic glitch parameters (changes 20 times per second). */
export function createGlitchPlan(time: number, amount: number, size: number, top: number, height: number, seed = 0): GlitchPlan {
  const g = Math.max(0, Math.min(2, amount));
  const bucket = timeBucket(time, 20);
  const shift = Math.max(1, 0.045 * size * g * (0.6 + 0.8 * seededRandom(bucket, 11, seed)));
  const count = 2 + Math.floor(seededRandom(bucket, 12, seed) * 5 * Math.min(1, g + 0.3));
  return {
    amount: g,
    shift,
    slices: Array.from({ length: count }, (_, index) => ({
      y: top + seededRandom(bucket, 20 + index, seed) * height,
      height: size * (0.03 + 0.14 * seededRandom(bucket, 40 + index, seed)),
      offsetX: (seededRandom(bucket, 60 + index, seed) - 0.5) * 0.5 * size * g,
    })),
  };
}

/**
 * DEC-19: decoration growth and alpha from raw enter/exit progress (0〜1).
 * Enter is eased with outCubic, exit with inCubic.
 */
export function decorationProgress(animation: 'grow' | 'fade' | 'none', enterProgress: number, exitProgress: number): { readonly growth: number; readonly alpha: number; readonly enter: number; readonly exit: number } {
  if (animation === 'none') {
    const on = enterProgress >= 1 && exitProgress < 1 ? 1 : 0;
    return { growth: on, alpha: on, enter: on, exit: exitProgress >= 1 ? 1 : 0 };
  }
  const entered = outCubic(enterProgress);
  const exited = inCubic(exitProgress);
  if (animation === 'fade') return { growth: 1, alpha: entered * (1 - exited), enter: entered, exit: exited };
  const growth = entered * (1 - exited);
  return { growth, alpha: clamp01(4 * growth), enter: entered, exit: exited };
}

/** DEC-11 blink envelope (0〜1 darkness factor) at time t; `phase` 0 or 0.5 for the second tape. */
export function tapeBlinkDarkness(time: number, amount: number, phase = 0): number {
  if (amount <= 0) return 0;
  const c = positiveModulo(time / 0.5 + phase, 1);
  const rise = smoothstepRange(0.55, 0.62, c);
  const fall = 1 - smoothstepRange(0.9, 0.97, c);
  return clamp01(amount) * Math.min(rise, fall);
}

/** The effect used for sub text (TL-05). */
export interface SubEnterPlan {
  /** 'block' = appears with the main block transform. */
  readonly kind: 'block' | 'character';
  readonly effect: EnterEffectId;
  readonly duration: number;
  readonly stagger: number;
  readonly useMainOrder: boolean;
  readonly useMainParameters: boolean;
}

export function subEnterPlan(scene: Scene): SubEnterPlan {
  const main = scene.motion.enter;
  const mainDefaults = ENTER_EFFECT_DEFAULTS[main.id];
  const requested: SubEnterChoice = scene.motion.subEnter;
  if (requested === 'same' && mainDefaults.unit === 'block') {
    return { kind: 'block', effect: main.id, duration: Math.max(0.05, main.duration), stagger: 0, useMainOrder: true, useMainParameters: true };
  }
  const effect: EnterEffectId = requested === 'same' ? main.id : requested;
  const mainStagger = main.id === 'FX-I15' ? Math.max(0.01, main.stagger || 0.08) : main.stagger;
  const stagger = requested === 'same' ? Math.min(mainStagger, 0.05) : effect === 'FX-I01' ? 0 : effect === 'FX-I15' ? 0.05 : 0.035;
  const duration = effect === 'FX-I15' ? 0 : requested === 'same' ? main.duration : ENTER_EFFECT_DEFAULTS[effect].duration;
  return { kind: 'character', effect, duration, stagger, useMainOrder: requested === 'same', useMainParameters: requested === 'same' };
}

/** FX-03: settings applied when an enter effect card is chosen. Returns a new scene. */
export function selectEnterEffect(scene: Scene, id: EnterEffectId): Scene {
  const defaults = ENTER_EFFECT_DEFAULTS[id];
  const current = scene.motion.enter;
  let trailer = scene.motion.trailer;
  if (scene.mode === 'trailer') {
    if (id === 'FX-I15') trailer = { ...trailer, characterDuration: 0 };
    else if (trailer.characterDuration === 0) trailer = { ...trailer, characterDuration: 0.4 };
  }
  return {
    ...scene,
    motion: {
      ...scene.motion,
      trailer,
      enter: {
        ...current,
        id,
        duration: defaults.duration,
        stagger: defaults.unit === 'character' ? defaults.stagger : 0,
        easing: 'auto',
        strength: 1,
        direction: resolveDirection(defaults, current.direction) ?? current.direction,
      },
    },
  };
}

/** FX-03: settings applied when an exit effect card is chosen. */
export function selectExitEffect(scene: Scene, id: ExitEffectId): Scene {
  const defaults = EXIT_EFFECT_DEFAULTS[id];
  const current = scene.motion.exit;
  return {
    ...scene,
    motion: {
      ...scene.motion,
      exit: {
        ...current,
        id,
        duration: defaults.duration,
        stagger: defaults.unit === 'character' ? defaults.stagger : 0,
        easing: 'auto',
        strength: 1,
        direction: resolveDirection(defaults, current.direction) ?? current.direction,
        order: id === 'FX-O11' ? 'reverse' : current.order,
      },
    },
  };
}
