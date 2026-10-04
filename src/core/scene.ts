import type { EasingId } from './easing';
import { EASING_IDS } from './easing';
import type { MovQuality } from './export-mov';
import type { LoopMode } from './timeline';

export type SceneMode = 'message' | 'trailer' | 'place-time';
export type WritingMode = 'horizontal' | 'vertical';
export type Alignment = 'start' | 'center' | 'end';
export type Anchor = 'top-left' | 'top' | 'top-right' | 'left' | 'center' | 'right' | 'bottom-left' | 'bottom' | 'bottom-right';
export type StaggerOrder = 'forward' | 'reverse' | 'center' | 'edges' | 'random';
export type Direction = 'left' | 'right' | 'up' | 'down' | 'left-to-right' | 'right-to-left' | 'top-to-bottom' | 'bottom-to-top' | 'center' | 'vertical' | 'horizontal';
export type EnterEffectId = `FX-I${'01' | '02' | '03' | '04' | '05' | '06' | '07' | '08' | '09' | '10' | '11' | '12' | '13' | '14' | '15' | '16' | '17' | '18' | '19' | '20' | '21' | '22' | '23'}`;
export type ExitEffectId = `FX-O${'01' | '02' | '03' | '04' | '05' | '06' | '07' | '08' | '09' | '10' | '11' | '12' | '13' | '14' | '15' | '16' | '17'}`;
export type HoldEffectId = `FX-H0${'0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8'}`;
export type TrailerFlow = 'characters' | 'center-characters' | 'expand' | 'lines' | 'smooth-lines' | 'simultaneous' | 'scroll';
export type SubEnterChoice = 'same' | 'FX-I01' | 'FX-I02' | 'FX-I05' | 'FX-I06' | 'FX-I08' | 'FX-I15';
export type CanvasPreset = 'fhd' | 'hd' | 'light' | 'banner' | 'caption' | 'square' | 'portrait' | 'custom';
export type FpsChoice = 12 | 15 | 20 | 24 | 30 | 60;
export type Language = 'ja' | 'en' | 'ko';

export interface FontSettings {
  readonly family: string;
  /** Base size in px (main: the "文字サイズ" setting; for subFont this value is ignored — sub size = S × subScale). */
  readonly size: number;
  readonly weight: number;
  readonly italic: boolean;
  /** em units (main −0.2〜1.2, sub −0.2〜1.5). */
  readonly letterSpacing: number;
}

export interface TextSettings {
  readonly main: string;
  readonly sub: string;
  readonly mainFont: FontSettings;
  readonly subFont: FontSettings;
  /** true = sub uses the main font family ("メインと同じ"). */
  readonly subFontInherit: boolean;
  readonly subScale: number;
  readonly subGap: number;
  /** 'before' = above (vertical: right), 'after' = below (vertical: left). */
  readonly subPosition: 'before' | 'after';
  readonly lineHeight: number;
  readonly maxCharactersPerLine: number;
  readonly splitPages: boolean;
}

export interface LayoutSettings {
  readonly writingMode: WritingMode;
  readonly alignment: Alignment;
  readonly anchor: Anchor;
  readonly marginX: number;
  readonly marginY: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly autoShrink: boolean;
}

export interface CanvasSettings {
  readonly width: number;
  readonly height: number;
  readonly preset: CanvasPreset;
}

export interface EffectSettings<T extends string> {
  readonly id: T;
  readonly duration: number;
  readonly stagger: number;
  readonly order: StaggerOrder;
  readonly easing: EasingId;
  readonly strength: number;
  readonly direction: Direction;
}

export interface TrailerSettings {
  readonly flow: TrailerFlow;
  readonly charactersPerSecond: number;
  readonly characterDuration: number;
  readonly punctuationPause: number;
  readonly linePause: number;
  readonly lineInterval: number;
  readonly lineFlowDuration: number;
  readonly centerPause: number;
  /** Fraction of the canvas short side (0.15〜0.9). */
  readonly centerSize: number;
  readonly impact: number;
  readonly overlapHold: number;
  readonly expandDuration: number;
  readonly scrollSpeed: number;
  readonly edgeFade: boolean;
  readonly cursor: boolean;
}

export interface MotionSettings {
  readonly enter: EffectSettings<EnterEffectId>;
  readonly subEnter: SubEnterChoice;
  readonly subDelay: number;
  readonly exit: EffectSettings<ExitEffectId>;
  readonly hold: { readonly id: HoldEffectId; readonly strength: number };
  readonly exitEnabled: boolean;
  readonly preDelay: number;
  readonly holdDuration: number;
  readonly postDelay: number;
  readonly pageGap: number;
  readonly trailer: TrailerSettings;
}

export interface FillSettings {
  readonly kind: 'solid' | 'gradient';
  /** Colour 1, colour 2 and optional colour 3 ('' or missing = unused). */
  readonly colors: readonly [string, string, string?];
  readonly direction: 'line-vertical' | 'block-horizontal' | 'block-diagonal';
  readonly opacity: number;
}

export interface StrokeSettings {
  readonly enabled: boolean;
  readonly color: string;
  readonly width: number;
}

export interface ShadowSettings {
  readonly enabled: boolean;
  readonly color: string;
  readonly opacity: number;
  readonly blur: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

export interface GlowSettings {
  readonly enabled: boolean;
  readonly color: string;
  readonly spread: number;
  readonly strength: number;
}

export type DecorationKind = 'none' | 'band' | 'hazard' | 'box' | 'title-frame' | 'lines' | 'underline' | 'side-lines' | 'accent-bar' | 'corners';

export interface DecorationSettings {
  readonly kind: DecorationKind;
  readonly animation: 'grow' | 'fade' | 'none';
  readonly duration: number;
  readonly padding: number;
  readonly fillColor: string;
  readonly fillOpacity: number;
  readonly lineColor: string;
  readonly lineWidth: number;
  /** Line length (0〜4 em) for lines / underline / side lines; frame extension (0〜12 em) for the title frame. */
  readonly lineExtent: number;
  readonly lineUsesTextStroke: boolean;
  readonly cornerRadius: number;
  readonly bandEdgeBlur: number;
  readonly bandEndFade: number;
  readonly tapeColor: string;
  readonly tapeStripeColor: string;
  readonly tapeWidth: number;
  readonly tapeSpeed: number;
  readonly tapeBlink: number;
}

export interface StyleSettings {
  readonly fill: FillSettings;
  readonly innerStroke: StrokeSettings;
  readonly outerStroke: StrokeSettings;
  readonly shadow: ShadowSettings;
  readonly glow: GlowSettings;
  readonly subColorEnabled: boolean;
  readonly subColor: string;
  readonly glitchColors: readonly [string, string];
  readonly cursorColor: string;
  readonly decoration: DecorationSettings;
}

export interface BackgroundSettings {
  readonly kind: 'none' | 'solid' | 'vignette' | 'bottom-gradient' | 'top-gradient';
  readonly color: string;
  readonly opacity: number;
  readonly syncFade: boolean;
}

export interface ExportSettings {
  readonly fps: FpsChoice;
  readonly colorMode: 'palette' | 'full';
  readonly loop: LoopMode;
  /** Remembered count for the "回数指定" loop choice (1〜999, default 3). */
  readonly loopCount: number;
  readonly autoTrim: boolean;
  readonly includeDefaultImage: boolean;
  /** Transparent video (.mov) quality (MOV-02). */
  readonly movQuality: MovQuality;
  /** '' = automatic file name (EXP-22). */
  readonly fileName: string;
}

export interface Scene {
  readonly version: 1;
  readonly seed: number;
  readonly mode: SceneMode;
  readonly text: TextSettings;
  readonly layout: LayoutSettings;
  readonly canvas: CanvasSettings;
  readonly motion: MotionSettings;
  readonly style: StyleSettings;
  readonly background: BackgroundSettings;
  readonly export: ExportSettings;
}

export type DeepPartial<T> = T extends readonly unknown[]
  ? T
  : T extends object
    ? { readonly [K in keyof T]?: DeepPartial<T[K]> }
    : T;

export type ScenePatch = DeepPartial<Scene>;

export const CANVAS_PRESETS: Readonly<Record<Exclude<CanvasPreset, 'custom'>, { readonly width: number; readonly height: number }>> = {
  fhd: { width: 1920, height: 1080 },
  hd: { width: 1280, height: 720 },
  light: { width: 960, height: 540 },
  banner: { width: 1280, height: 360 },
  caption: { width: 1024, height: 256 },
  square: { width: 1080, height: 1080 },
  portrait: { width: 720, height: 1280 },
};

export const FPS_CHOICES: readonly FpsChoice[] = [12, 15, 20, 24, 30, 60];
export const MODE_FONT_SIZE: Readonly<Record<SceneMode, number>> = { message: 130, trailer: 46, 'place-time': 110 };
export const GLOBAL_FONT_SIZE = 120;
export const DEFAULT_FONT_FAMILY = 'Noto Serif JP';

export const ENTER_EFFECT_IDS: readonly EnterEffectId[] = Array.from({ length: 23 }, (_, i) => `FX-I${String(i + 1).padStart(2, '0')}` as EnterEffectId);
export const EXIT_EFFECT_IDS: readonly ExitEffectId[] = Array.from({ length: 17 }, (_, i) => `FX-O${String(i + 1).padStart(2, '0')}` as ExitEffectId);
export const HOLD_EFFECT_IDS: readonly HoldEffectId[] = Array.from({ length: 9 }, (_, i) => `FX-H0${i}` as HoldEffectId);

const font = (size: number): FontSettings => ({ family: DEFAULT_FONT_FAMILY, size, weight: 700, italic: false, letterSpacing: 0.08 });
const effect = <T extends string>(id: T, duration: number, stagger: number): EffectSettings<T> => ({
  id,
  duration,
  stagger,
  order: 'forward',
  easing: 'auto',
  strength: 1,
  direction: 'left',
});

/** "全体の既定値 → モードの既定値" (05 TPL-02, 06 tables). */
export function createDefaultScene(mode: SceneMode = 'message'): Scene {
  const mainSize = MODE_FONT_SIZE[mode];
  return {
    version: 1,
    seed: 1,
    mode,
    text: {
      main: mode === 'trailer' ? 'Once upon a time' : 'Your message',
      sub: mode === 'trailer' ? '' : 'Subtitle',
      mainFont: font(mainSize),
      subFont: { family: DEFAULT_FONT_FAMILY, size: mainSize * 0.3, weight: 400, italic: false, letterSpacing: 0.25 },
      subFontInherit: true,
      subScale: 0.3,
      subGap: 0.3,
      subPosition: 'after',
      lineHeight: mode === 'trailer' ? 1.9 : 1.5,
      maxCharactersPerLine: 0,
      splitPages: true,
    },
    layout: { writingMode: 'horizontal', alignment: 'center', anchor: 'center', marginX: 64, marginY: 56, offsetX: 0, offsetY: 0, autoShrink: true },
    canvas: { width: 1280, height: 720, preset: 'hd' },
    motion: {
      enter: effect('FX-I01', 0.6, 0),
      subEnter: 'same',
      subDelay: -0.2,
      exit: effect('FX-O01', 0.6, 0),
      hold: { id: 'FX-H00', strength: 1 },
      exitEnabled: true,
      preDelay: 0.1,
      holdDuration: 1.5,
      postDelay: 0.3,
      pageGap: 0.3,
      trailer: {
        flow: 'characters', charactersPerSecond: 12, characterDuration: 0.4, punctuationPause: 0.25,
        linePause: 0.35, lineInterval: 0.9, lineFlowDuration: 1.2, centerPause: 0.4,
        centerSize: 0.55, impact: 1, overlapHold: 0.5, expandDuration: 0.9,
        scrollSpeed: 90, edgeFade: true, cursor: false,
      },
    },
    style: {
      fill: { kind: 'solid', colors: ['#FFFFFF', '#F3DFA2', ''], direction: 'line-vertical', opacity: 1 },
      innerStroke: { enabled: true, color: '#2B2B33', width: 5 },
      outerStroke: { enabled: false, color: '#FFFFFF', width: 6 },
      shadow: { enabled: true, color: '#000000', opacity: 0.6, blur: 12, offsetX: 0, offsetY: 5 },
      glow: { enabled: false, color: '#6FE3FF', spread: 28, strength: 1 },
      subColorEnabled: false,
      subColor: '#FFFFFF',
      glitchColors: ['#FF2D55', '#2DE2FF'],
      cursorColor: '',
      decoration: {
        kind: 'none', animation: 'grow', duration: 0.45, padding: 0.4, fillColor: '#000000', fillOpacity: 0.55,
        lineColor: '#FFFFFF', lineWidth: 3, lineExtent: 0.8, lineUsesTextStroke: false, cornerRadius: 0.2,
        bandEdgeBlur: 0.5, bandEndFade: 0.3, tapeColor: '#FFD21F', tapeStripeColor: '#141414',
        tapeWidth: 40, tapeSpeed: 90, tapeBlink: 0.5,
      },
    },
    background: { kind: 'none', color: '#000000', opacity: 0.45, syncFade: true },
    export: { fps: 24, colorMode: 'palette', loop: { kind: 'once' }, loopCount: 3, autoTrim: false, includeDefaultImage: true, movQuality: 'standard', fileName: '' },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Deep-merges a (partial, possibly untrusted) patch onto a base value. Objects merge recursively,
 * arrays and primitives replace, and values whose type differs from the base are ignored.
 * Used for templates (TPL-02) and restoring saved state (STO-02).
 */
export function deepMerge<T>(base: T, patch: unknown): T {
  if (patch === undefined) return base;
  if (isRecord(base)) {
    if (!isRecord(patch)) return base;
    const result: Record<string, unknown> = { ...base };
    for (const [key, value] of Object.entries(patch)) {
      // Keys missing from the base (e.g. LoopMode.count) are copied; validateScene drops junk later.
      result[key] = key in base ? deepMerge((base as Record<string, unknown>)[key], value) : value;
    }
    return result as T;
  }
  if (Array.isArray(base)) return (Array.isArray(patch) ? patch : base) as T;
  if (base === undefined || base === null) return patch as T;
  return (typeof patch === typeof base ? patch : base) as T;
}

/** Applies a template / saved patch onto the mode defaults and validates the result. */
export function mergeScene(base: Scene, patch: unknown): Scene {
  return validateScene(deepMerge(base, patch));
}

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  return Math.max(min, Math.min(max, finite(value, fallback)));
}

function integer(value: unknown, min: number, max: number, fallback: number): number {
  return Math.round(clampNumber(value, min, max, fallback));
}

function oneOf<T extends string | number>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function color(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : fallback;
}

function optionalColor(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function validateFont(value: FontSettings, fallback: FontSettings, spacingMax: number): FontSettings {
  return {
    family: typeof value.family === 'string' && value.family.trim() ? value.family : fallback.family,
    size: clampNumber(value.size, 12, 400, fallback.size),
    weight: integer(value.weight, 100, 900, fallback.weight),
    italic: Boolean(value.italic),
    letterSpacing: clampNumber(value.letterSpacing, -0.2, spacingMax, fallback.letterSpacing),
  };
}

const ZERO_DURATION_EFFECTS = new Set<string>(['FX-I15', 'FX-O11']);
const ORDERS: readonly StaggerOrder[] = ['forward', 'reverse', 'center', 'edges', 'random'];
const DIRECTIONS: readonly Direction[] = ['left', 'right', 'up', 'down', 'left-to-right', 'right-to-left', 'top-to-bottom', 'bottom-to-top', 'center', 'vertical', 'horizontal'];

function validateEffect<T extends string>(value: EffectSettings<T>, fallback: EffectSettings<T>, ids: readonly T[]): EffectSettings<T> {
  const id = oneOf(value.id, ids, fallback.id);
  return {
    id,
    duration: clampNumber(value.duration, ZERO_DURATION_EFFECTS.has(id) ? 0 : 0.05, 4, fallback.duration),
    stagger: clampNumber(value.stagger, 0, 0.6, fallback.stagger),
    order: oneOf(value.order, ORDERS, fallback.order),
    easing: oneOf(value.easing, EASING_IDS, fallback.easing),
    strength: clampNumber(value.strength, 0.2, 2.5, fallback.strength),
    direction: oneOf(value.direction, DIRECTIONS, fallback.direction),
  };
}

function validateLoop(value: LoopMode): LoopMode {
  if (value?.kind === 'forever') return { kind: 'forever' };
  if (value?.kind === 'count') return { kind: 'count', count: integer(value.count, 1, 999, 3) };
  return { kind: 'once' };
}

/**
 * Normalises a scene: missing fields are filled from the mode defaults, numbers are clamped to the
 * spec ranges, unknown enum values fall back to defaults (unknown exit effect → fade, STO-02).
 * Accepts partial / untrusted input (e.g. parsed JSON).
 */
export function validateScene(input: Scene | ScenePatch): Scene {
  const mode = oneOf((input as { mode?: unknown }).mode, ['message', 'trailer', 'place-time'] as const, 'message');
  const base = createDefaultScene(mode);
  const merged = deepMerge(base, input);
  const t = merged.text;
  const m = merged.motion;
  const s = merged.style;
  const d = s.decoration;
  const tr = m.trailer;
  const preset = oneOf(merged.canvas.preset, ['fhd', 'hd', 'light', 'banner', 'caption', 'square', 'portrait', 'custom'] as const, 'custom');
  return {
    version: 1,
    seed: integer(merged.seed, -0x7fff_ffff, 0x7fff_ffff, 1),
    mode,
    text: {
      main: String(t.main ?? ''),
      sub: mode === 'trailer' ? '' : String(t.sub ?? ''),
      mainFont: validateFont(t.mainFont, base.text.mainFont, 1.2),
      subFont: validateFont(t.subFont, base.text.subFont, 1.5),
      subFontInherit: Boolean(t.subFontInherit),
      subScale: clampNumber(t.subScale, 0.1, 0.9, base.text.subScale),
      subGap: clampNumber(t.subGap, 0, 1.5, base.text.subGap),
      subPosition: oneOf(t.subPosition, ['before', 'after'] as const, 'after'),
      lineHeight: clampNumber(t.lineHeight, 0.9, 3.2, base.text.lineHeight),
      maxCharactersPerLine: integer(t.maxCharactersPerLine, 0, 60, 0),
      splitPages: Boolean(t.splitPages),
    },
    layout: {
      writingMode: oneOf(merged.layout.writingMode, ['horizontal', 'vertical'] as const, 'horizontal'),
      alignment: oneOf(merged.layout.alignment, ['start', 'center', 'end'] as const, 'center'),
      anchor: oneOf(merged.layout.anchor, ['top-left', 'top', 'top-right', 'left', 'center', 'right', 'bottom-left', 'bottom', 'bottom-right'] as const, 'center'),
      marginX: clampNumber(merged.layout.marginX, 0, 400, 64),
      marginY: clampNumber(merged.layout.marginY, 0, 400, 56),
      offsetX: clampNumber(merged.layout.offsetX, -800, 800, 0),
      offsetY: clampNumber(merged.layout.offsetY, -800, 800, 0),
      autoShrink: Boolean(merged.layout.autoShrink),
    },
    canvas: {
      width: integer(merged.canvas.width, 32, 3840, 1280),
      height: integer(merged.canvas.height, 32, 3840, 720),
      preset,
    },
    motion: {
      enter: validateEffect(m.enter, base.motion.enter, ENTER_EFFECT_IDS),
      subEnter: oneOf(m.subEnter, ['same', 'FX-I01', 'FX-I02', 'FX-I05', 'FX-I06', 'FX-I08', 'FX-I15'] as const, 'same'),
      subDelay: clampNumber(m.subDelay, -2, 2, -0.2),
      exit: validateEffect(m.exit, base.motion.exit, EXIT_EFFECT_IDS),
      hold: { id: oneOf(m.hold.id, HOLD_EFFECT_IDS, 'FX-H00'), strength: clampNumber(m.hold.strength, 0.2, 3, 1) },
      exitEnabled: Boolean(m.exitEnabled),
      preDelay: clampNumber(m.preDelay, 0, 3, 0.1),
      holdDuration: clampNumber(m.holdDuration, 0, 10, 1.5),
      postDelay: clampNumber(m.postDelay, 0, 5, 0.3),
      pageGap: clampNumber(m.pageGap, 0, 3, 0.3),
      trailer: {
        flow: oneOf(tr.flow, ['characters', 'center-characters', 'expand', 'lines', 'smooth-lines', 'simultaneous', 'scroll'] as const, 'characters'),
        charactersPerSecond: clampNumber(tr.charactersPerSecond, 2, 40, 12),
        characterDuration: clampNumber(tr.characterDuration, 0, 2, 0.4),
        punctuationPause: clampNumber(tr.punctuationPause, 0, 1.5, 0.25),
        linePause: clampNumber(tr.linePause, 0, 2, 0.35),
        lineInterval: clampNumber(tr.lineInterval, 0.1, 4, 0.9),
        lineFlowDuration: clampNumber(tr.lineFlowDuration, 0.2, 5, 1.2),
        centerPause: clampNumber(tr.centerPause, 0, 2, 0.4),
        centerSize: clampNumber(tr.centerSize, 0.15, 0.9, 0.55),
        impact: clampNumber(tr.impact, 0, 3, 1),
        overlapHold: clampNumber(tr.overlapHold, 0, 3, 0.5),
        expandDuration: clampNumber(tr.expandDuration, 0.1, 3, 0.9),
        scrollSpeed: clampNumber(tr.scrollSpeed, 5, 400, 90),
        edgeFade: Boolean(tr.edgeFade),
        cursor: Boolean(tr.cursor),
      },
    },
    style: {
      fill: {
        kind: oneOf(s.fill.kind, ['solid', 'gradient'] as const, 'solid'),
        colors: [color(s.fill.colors[0], '#FFFFFF'), color(s.fill.colors[1], base.style.fill.colors[1]), optionalColor(s.fill.colors[2])],
        direction: oneOf(s.fill.direction, ['line-vertical', 'block-horizontal', 'block-diagonal'] as const, 'line-vertical'),
        opacity: clampNumber(s.fill.opacity, 0, 1, 1),
      },
      innerStroke: { enabled: Boolean(s.innerStroke.enabled), color: color(s.innerStroke.color, base.style.innerStroke.color), width: clampNumber(s.innerStroke.width, 0.5, 30, 5) },
      outerStroke: { enabled: Boolean(s.outerStroke.enabled), color: color(s.outerStroke.color, base.style.outerStroke.color), width: clampNumber(s.outerStroke.width, 0.5, 40, 6) },
      shadow: {
        enabled: Boolean(s.shadow.enabled),
        color: color(s.shadow.color, '#000000'),
        opacity: clampNumber(s.shadow.opacity, 0, 1, 0.6),
        blur: clampNumber(s.shadow.blur, 0, 80, 12),
        offsetX: clampNumber(s.shadow.offsetX, -60, 60, 0),
        offsetY: clampNumber(s.shadow.offsetY, -60, 60, 5),
      },
      glow: {
        enabled: Boolean(s.glow.enabled),
        color: color(s.glow.color, base.style.glow.color),
        spread: clampNumber(s.glow.spread, 2, 150, 28),
        strength: clampNumber(s.glow.strength, 0.1, 4, 1),
      },
      subColorEnabled: mode !== 'trailer' && Boolean(s.subColorEnabled),
      subColor: color(s.subColor, '#FFFFFF'),
      glitchColors: [color(s.glitchColors[0], base.style.glitchColors[0]), color(s.glitchColors[1], base.style.glitchColors[1])],
      cursorColor: optionalColor(s.cursorColor),
      decoration: {
        kind: oneOf(d.kind, ['none', 'band', 'hazard', 'box', 'title-frame', 'lines', 'underline', 'side-lines', 'accent-bar', 'corners'] as const, 'none'),
        animation: oneOf(d.animation, ['grow', 'fade', 'none'] as const, 'grow'),
        duration: clampNumber(d.duration, 0.1, 2.5, 0.45),
        padding: clampNumber(d.padding, 0, 2, 0.4),
        fillColor: color(d.fillColor, '#000000'),
        fillOpacity: clampNumber(d.fillOpacity, 0, 1, 0.55),
        lineColor: color(d.lineColor, '#FFFFFF'),
        lineWidth: clampNumber(d.lineWidth, 0, 16, 3),
        lineExtent: clampNumber(d.lineExtent, 0, 12, 0.8),
        lineUsesTextStroke: Boolean(d.lineUsesTextStroke),
        cornerRadius: clampNumber(d.cornerRadius, 0, 1, 0.2),
        bandEdgeBlur: clampNumber(d.bandEdgeBlur, 0, 1, 0.5),
        bandEndFade: clampNumber(d.bandEndFade, 0, 1, 0.3),
        tapeColor: color(d.tapeColor, base.style.decoration.tapeColor),
        tapeStripeColor: color(d.tapeStripeColor, base.style.decoration.tapeStripeColor),
        tapeWidth: clampNumber(d.tapeWidth, 8, 120, 40),
        tapeSpeed: clampNumber(d.tapeSpeed, 0, 400, 90),
        tapeBlink: clampNumber(d.tapeBlink, 0, 1, 0.5),
      },
    },
    background: {
      kind: oneOf(merged.background.kind, ['none', 'solid', 'vignette', 'bottom-gradient', 'top-gradient'] as const, 'none'),
      color: color(merged.background.color, '#000000'),
      opacity: clampNumber(merged.background.opacity, 0, 1, 0.45),
      syncFade: Boolean(merged.background.syncFade),
    },
    export: {
      fps: oneOf(merged.export.fps, FPS_CHOICES, 24),
      colorMode: oneOf(merged.export.colorMode, ['palette', 'full'] as const, 'palette'),
      loop: validateLoop(merged.export.loop),
      loopCount: integer(merged.export.loopCount, 1, 999, 3),
      autoTrim: Boolean(merged.export.autoTrim),
      includeDefaultImage: Boolean(merged.export.includeDefaultImage),
      movQuality: oneOf(merged.export.movQuality, ['high', 'standard'] as const, 'standard'),
      fileName: typeof merged.export.fileName === 'string' ? merged.export.fileName : '',
    },
  };
}

/** LAY-16: preset → size; custom sizes are clamped to 32〜3840 integers. */
export function canvasSize(preset: CanvasPreset, customWidth = 1280, customHeight = 720): { width: number; height: number } {
  if (preset !== 'custom') return { ...CANVAS_PRESETS[preset] };
  return { width: integer(customWidth, 32, 3840, 1280), height: integer(customHeight, 32, 3840, 720) };
}

/** Effective sub font (family follows main when subFontInherit). Size is S × subScale. */
export function resolveSubFont(scene: Scene, mainSize: number): FontSettings {
  return {
    ...scene.text.subFont,
    family: scene.text.subFontInherit ? scene.text.mainFont.family : scene.text.subFont.family,
    size: mainSize * scene.text.subScale,
  };
}

/** True when there is nothing to draw (EXP-24 pre-export check). */
export function isSceneTextEmpty(scene: Scene): boolean {
  const mainEmpty = scene.text.main.trim() === '';
  if (scene.mode === 'trailer') return mainEmpty;
  return mainEmpty && scene.text.sub.trim() === '';
}

export interface SceneTemplate {
  readonly id: string;
  readonly mode: SceneMode;
  readonly names: Readonly<Record<Language, string>>;
  readonly samples: Readonly<Record<Language, { readonly main: string; readonly sub?: string }>>;
  readonly category?: string;
  readonly icon?: string;
  readonly patch: ScenePatch;
  readonly defaultLoop?: LoopMode;
}
