import type { EasingId } from '../core/easing';
import type {
  Direction,
  EffectSettings,
  EnterEffectId,
  ExitEffectId,
  FontSettings,
  SceneMode,
  StaggerOrder,
} from '../core/scene';
import type { TemplateDef, TemplateInput } from './types';

// Small builders that keep the template tables readable.

export function font(family: string, size: number, weight: number, letterSpacing = 0): FontSettings {
  return { family, size, weight, italic: false, letterSpacing };
}

interface EffectExtras {
  readonly order?: StaggerOrder;
  readonly easing?: EasingId;
  readonly strength?: number;
  readonly direction?: Direction;
}

function effect<T extends string>(id: T, duration: number, stagger: number, extras: EffectExtras): EffectSettings<T> {
  return {
    id,
    duration,
    stagger,
    order: extras.order ?? 'forward',
    easing: extras.easing ?? 'auto',
    strength: extras.strength ?? 1,
    direction: extras.direction ?? 'left',
  };
}

export function enter(id: EnterEffectId, duration: number, stagger = 0, extras: EffectExtras = {}): EffectSettings<EnterEffectId> {
  return effect(id, duration, stagger, extras);
}

export function exit(id: ExitEffectId, duration: number, stagger = 0, extras: EffectExtras = {}): EffectSettings<ExitEffectId> {
  return effect(id, duration, stagger, extras);
}

export const STROKE_OFF = { enabled: false } as const;
export const SHADOW_OFF = { enabled: false } as const;
export const GLOW_OFF = { enabled: false } as const;

export function stroke(color: string, width: number) {
  return { enabled: true, color, width } as const;
}

export function shadow(color: string, opacity: number, blur: number, offsetX = 0, offsetY = 0) {
  return { enabled: true, color, opacity, blur, offsetX, offsetY } as const;
}

export function glow(color: string, spread: number, strength = 1) {
  return { enabled: true, color, spread, strength } as const;
}

/** Single-colour fill; colour 2 keeps a pale gold so switching to gradient still looks intentional. */
export function solid(color: string, opacity = 1) {
  return { kind: 'solid', colors: [color, '#ffd98a', ''], direction: 'line-vertical', opacity } as const;
}

export function gradient(
  colors: readonly [string, string, string?],
  direction: 'line-vertical' | 'block-horizontal' | 'block-diagonal' = 'line-vertical',
  opacity = 1,
) {
  // Always three slots ('' = unused) so the stored value matches validateScene's normal form.
  const normalized: readonly [string, string, string] = [colors[0], colors[1], colors[2] ?? ''];
  return { kind: 'gradient', colors: normalized, direction, opacity } as const;
}

/**
 * Sub font. Its size is not used by the renderer (sub size = main size × subScale) but is kept
 * consistent for anyone reading the scene JSON.
 */
export function subFont(family: string, mainSize: number, scale: number, weight: number, letterSpacing = 0): FontSettings {
  return font(family, Math.round(mainSize * scale), weight, letterSpacing);
}

/** Attaches the mode and derives `subFontInherit` (sub family equal to main → "same as main"). */
export function defineTemplates(mode: SceneMode, inputs: readonly TemplateInput[]): readonly TemplateDef[] {
  return inputs.map((input) => {
    const text = input.patch.text;
    const mainFamily = text?.mainFont?.family;
    const subFamily = text?.subFont?.family;
    const inherit = text?.subFontInherit ?? (subFamily === undefined || subFamily === mainFamily);
    return { ...input, mode, patch: { ...input.patch, text: { ...text, subFontInherit: inherit } } };
  });
}
