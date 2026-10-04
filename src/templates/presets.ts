import type { FillSettings, GlowSettings, Scene, ShadowSettings, StrokeSettings } from '../core/scene';

export type StylePresetId =
  | 'clean'
  | 'gold'
  | 'silver'
  | 'blood'
  | 'neon'
  | 'eerie'
  | 'pop'
  | 'ghost'
  | 'ink'
  | 'outline';

export interface StylePreset {
  readonly id: StylePresetId;
  readonly fill: FillSettings;
  readonly innerStroke: StrokeSettings;
  readonly outerStroke: StrokeSettings;
  readonly shadow: ShadowSettings;
  readonly glow: GlowSettings;
}

const off = { enabled: false } as const;
const strokeOff = (color: string, width: number): StrokeSettings => ({ ...off, color, width });
const shadowOff: ShadowSettings = { ...off, color: '#000000', opacity: 0.6, blur: 12, offsetX: 0, offsetY: 5 };
const glowOff = (color: string): GlowSettings => ({ ...off, color, spread: 28, strength: 1 });

/** DEC-22 style presets (our own palettes). Each one overwrites fill, strokes, shadow and glow only. */
export const STYLE_PRESETS: readonly StylePreset[] = [
  {
    id: 'clean',
    fill: { kind: 'solid', colors: ['#ffffff', '#ffd98a', ''], direction: 'line-vertical', opacity: 1 },
    innerStroke: { enabled: true, color: '#1f2430', width: 5 },
    outerStroke: strokeOff('#ffffff', 6),
    shadow: { enabled: true, color: '#000000', opacity: 0.55, blur: 10, offsetX: 0, offsetY: 4 },
    glow: glowOff('#6fe3ff'),
  },
  {
    id: 'gold',
    fill: { kind: 'gradient', colors: ['#fff6d0', '#f2c14e', '#a8701a'], direction: 'line-vertical', opacity: 1 },
    innerStroke: { enabled: true, color: '#3b2604', width: 5 },
    outerStroke: { enabled: true, color: '#fff1c2', width: 2.5 },
    shadow: { enabled: true, color: '#000000', opacity: 0.55, blur: 12, offsetX: 0, offsetY: 5 },
    glow: { enabled: true, color: '#ffcf5a', spread: 34, strength: 0.8 },
  },
  {
    id: 'silver',
    fill: { kind: 'gradient', colors: ['#ffffff', '#c9d1db', '#7b8794'], direction: 'line-vertical', opacity: 1 },
    innerStroke: { enabled: true, color: '#1c232b', width: 4.5 },
    outerStroke: { enabled: true, color: '#eef2f6', width: 2 },
    shadow: { enabled: true, color: '#000000', opacity: 0.5, blur: 10, offsetX: 0, offsetY: 4 },
    glow: glowOff('#dfe9f5'),
  },
  {
    id: 'blood',
    fill: { kind: 'gradient', colors: ['#ff6b6b', '#b00020', '#4a0010'], direction: 'line-vertical', opacity: 1 },
    innerStroke: { enabled: true, color: '#150004', width: 4 },
    outerStroke: strokeOff('#ffffff', 6),
    shadow: { enabled: true, color: '#2a0000', opacity: 0.85, blur: 20, offsetX: 0, offsetY: 3 },
    glow: glowOff('#ff3b3b'),
  },
  {
    id: 'neon',
    fill: { kind: 'solid', colors: ['#f2fdff', '#ffd98a', ''], direction: 'line-vertical', opacity: 1 },
    innerStroke: { enabled: true, color: '#00b8ff', width: 3 },
    outerStroke: strokeOff('#ffffff', 6),
    shadow: shadowOff,
    glow: { enabled: true, color: '#00d0ff', spread: 36, strength: 1.6 },
  },
  {
    id: 'eerie',
    fill: { kind: 'gradient', colors: ['#efe3ff', '#9b5de5', '#3c096c'], direction: 'line-vertical', opacity: 1 },
    innerStroke: { enabled: true, color: '#12002b', width: 4 },
    outerStroke: strokeOff('#ffffff', 6),
    shadow: { enabled: true, color: '#000000', opacity: 0.7, blur: 18, offsetX: 0, offsetY: 2 },
    glow: { enabled: true, color: '#7b2cbf', spread: 44, strength: 1 },
  },
  {
    id: 'pop',
    fill: { kind: 'solid', colors: ['#fff35c', '#ffd98a', ''], direction: 'line-vertical', opacity: 1 },
    innerStroke: { enabled: true, color: '#ff3d7f', width: 7 },
    outerStroke: { enabled: true, color: '#ffffff', width: 6 },
    shadow: { enabled: true, color: '#000000', opacity: 0.35, blur: 0, offsetX: 4, offsetY: 6 },
    glow: glowOff('#ff8fb8'),
  },
  {
    id: 'ghost',
    fill: { kind: 'solid', colors: ['#ffffff', '#ffd98a', ''], direction: 'line-vertical', opacity: 0.55 },
    innerStroke: { enabled: true, color: '#ffffff', width: 1.5 },
    outerStroke: strokeOff('#ffffff', 6),
    shadow: shadowOff,
    glow: { enabled: true, color: '#cfe8ff', spread: 30, strength: 0.7 },
  },
  {
    id: 'ink',
    fill: { kind: 'solid', colors: ['#16181d', '#ffd98a', ''], direction: 'line-vertical', opacity: 1 },
    innerStroke: { enabled: true, color: '#ffffff', width: 3 },
    outerStroke: strokeOff('#ffffff', 6),
    shadow: { enabled: true, color: '#000000', opacity: 0.2, blur: 6, offsetX: 0, offsetY: 2 },
    glow: glowOff('#ffffff'),
  },
  {
    id: 'outline',
    fill: { kind: 'solid', colors: ['#ffffff', '#ffd98a', ''], direction: 'line-vertical', opacity: 0 },
    innerStroke: { enabled: true, color: '#ffffff', width: 3 },
    outerStroke: strokeOff('#ffffff', 6),
    shadow: { enabled: true, color: '#000000', opacity: 0.45, blur: 8, offsetX: 0, offsetY: 3 },
    glow: glowOff('#ffffff'),
  },
];

export function getStylePreset(id: StylePresetId): StylePreset | undefined {
  return STYLE_PRESETS.find((preset) => preset.id === id);
}

/** DEC-22: overwrite only the text paint fields; motion, text and decoration stay as they are. */
export function applyStylePreset(scene: Scene, preset: StylePreset): Scene {
  return {
    ...scene,
    style: {
      ...scene.style,
      fill: preset.fill,
      innerStroke: preset.innerStroke,
      outerStroke: preset.outerStroke,
      shadow: preset.shadow,
      glow: preset.glow,
    },
  };
}

export type GradientPresetId =
  | 'metal'
  | 'flame'
  | 'emerald'
  | 'sunset'
  | 'ice'
  | 'sakura'
  | 'twilight'
  | 'toxic'
  | 'royal'
  | 'ember';

export interface GradientPreset {
  readonly id: GradientPresetId;
  readonly colors: readonly [string, string, string];
}

/** DEC-01 gradient swatches: three colours each. */
export const GRADIENT_PRESETS: readonly GradientPreset[] = [
  { id: 'metal', colors: ['#ffffff', '#b8c2cc', '#5f6b78'] },
  { id: 'flame', colors: ['#fff3b0', '#ff9f1c', '#e63946'] },
  { id: 'emerald', colors: ['#e9fff4', '#3ddc97', '#0b6e4f'] },
  { id: 'sunset', colors: ['#ffe5b4', '#ff7b54', '#7b2d6b'] },
  { id: 'ice', colors: ['#ffffff', '#a8e6ff', '#3a86ff'] },
  { id: 'sakura', colors: ['#fff5f8', '#ffb7c9', '#e05780'] },
  { id: 'twilight', colors: ['#f0e6ff', '#8e7dff', '#2b2d6e'] },
  { id: 'toxic', colors: ['#f6ffd1', '#b5f23d', '#3f7d20'] },
  { id: 'royal', colors: ['#fff6d6', '#d4a017', '#5a2a82'] },
  { id: 'ember', colors: ['#ffd7a8', '#d9480f', '#3b0d0d'] },
];

export function applyGradientPreset(scene: Scene, preset: GradientPreset): Scene {
  return { ...scene, style: { ...scene.style, fill: { ...scene.style.fill, kind: 'gradient', colors: preset.colors } } };
}
