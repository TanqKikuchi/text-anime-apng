import type { EasingId } from '../../core/easing';
import type {
  Anchor,
  BackgroundSettings,
  CanvasPreset,
  DecorationKind,
  Direction,
  EnterEffectId,
  ExitEffectId,
  HoldEffectId,
  SceneMode,
  StaggerOrder,
  TrailerFlow,
} from '../../core/scene';
import type { GradientPresetId, StylePresetId } from '../../templates/presets';
import type { RollSystem, TemplateCategory } from '../../templates/types';
import { en } from './en';
import { ja } from './ja';
import { ko } from './ko';
import { HTML_LANG, LANGUAGES, isLang } from './languages';
import type { Lang } from './languages';
import type { Dictionary, MessageKey, MessageParams } from './types';

export { HTML_LANG, LANGUAGE_BUTTON_LABEL, LANGUAGES, isLang } from './languages';
export type { Lang } from './languages';
export type { Dictionary, MessageKey, MessageParams } from './types';

export const DICTIONARIES: Readonly<Record<Lang, Dictionary>> = { ja, en, ko };

/** I18N-02 fallback order when a value is missing: requested language → English → Japanese. */
function lookup(lang: Lang, key: MessageKey): string {
  return DICTIONARIES[lang][key] || DICTIONARIES.en[key] || DICTIONARIES.ja[key] || key;
}

export function format(template: string, params?: MessageParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => (name in params ? String(params[name]) : whole));
}

/** Translate into an explicit language. */
export function translate(lang: Lang, key: MessageKey, params?: MessageParams): string {
  return format(lookup(lang, key), params);
}

// ── current language (module state) ──

let current: Lang = 'ja';
const listeners = new Set<(lang: Lang) => void>();

export function getLanguage(): Lang {
  return current;
}

/** Changes the language and notifies subscribers. Persisting is a separate step (saveLanguage). */
export function setLanguage(lang: Lang): void {
  if (lang === current) return;
  current = lang;
  for (const listener of listeners) listener(lang);
}

export function onLanguageChange(listener: (lang: Lang) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Translate into the current language. */
export function t(key: MessageKey, params?: MessageParams): string {
  return translate(current, key, params);
}

// ── detection & persistence (I18N-01, STO-03) ──

export const LANGUAGE_STORAGE_KEY = 'mojimotion.lang';

export type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

/** First browser language decides: ja* → Japanese, ko* → Korean, anything else → English. */
export function detectLanguage(browserLanguages: readonly string[] | undefined): Lang {
  const first = (browserLanguages?.[0] ?? '').toLowerCase();
  if (first.startsWith('ja')) return 'ja';
  if (first.startsWith('ko')) return 'ko';
  return 'en';
}

/** localStorage, or null where it is missing or throws (private mode, sandboxed frames). */
export function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function browserLanguages(): readonly string[] {
  if (typeof navigator === 'undefined') return [];
  if (navigator.languages && navigator.languages.length > 0) return navigator.languages;
  return navigator.language ? [navigator.language] : [];
}

/** Saved choice if valid, otherwise browser detection. Never throws. */
export function loadLanguage(storage: StorageLike | null = defaultStorage(), languages: readonly string[] = browserLanguages()): Lang {
  try {
    const saved = storage?.getItem(LANGUAGE_STORAGE_KEY);
    if (isLang(saved)) return saved;
  } catch {
    // Storage unavailable: fall through to detection.
  }
  return detectLanguage(languages);
}

/** Returns false when the choice could not be stored; the app keeps working either way. */
export function saveLanguage(lang: Lang, storage: StorageLike | null = defaultStorage()): boolean {
  try {
    if (!storage) return false;
    storage.setItem(LANGUAGE_STORAGE_KEY, lang);
    return true;
  } catch {
    return false;
  }
}

/** Updates `<html lang>` and the page title for the language (I18N-01). */
export function applyDocumentLanguage(doc: Pick<Document, 'documentElement' | 'title'>, lang: Lang): void {
  doc.documentElement.lang = HTML_LANG[lang];
  doc.title = translate(lang, 'app.pageTitle');
}

// ── typed key helpers for enum-like values ──
// The `satisfies MessageKey` checks make a missing dictionary entry for any ID a type error.

export type EffectId = EnterEffectId | ExitEffectId | HoldEffectId;

export function effectKey(id: EffectId): MessageKey {
  return `fx.${id}` as const satisfies MessageKey;
}
export function easingKey(id: EasingId): MessageKey {
  return `easing.${id}` as const satisfies MessageKey;
}
export function directionKey(id: Direction): MessageKey {
  return `direction.${id}` as const satisfies MessageKey;
}
export function orderKey(id: StaggerOrder): MessageKey {
  return `order.${id}` as const satisfies MessageKey;
}
export function flowKey(id: TrailerFlow): MessageKey {
  return `flow.${id}` as const satisfies MessageKey;
}
export function decorationKey(id: DecorationKind): MessageKey {
  return `deco.${id}` as const satisfies MessageKey;
}
export function backgroundKey(id: BackgroundSettings['kind']): MessageKey {
  return `bg.${id}` as const satisfies MessageKey;
}
export function anchorKey(id: Anchor): MessageKey {
  return `anchor.${id}` as const satisfies MessageKey;
}
export function canvasKey(id: CanvasPreset): MessageKey {
  return `canvas.${id}` as const satisfies MessageKey;
}
export function modeKey(mode: SceneMode): MessageKey {
  return `mode.${mode}` as const satisfies MessageKey;
}
export function modeDescriptionKey(mode: SceneMode): MessageKey {
  return `mode.${mode}.desc` as const satisfies MessageKey;
}

export type FontCategoryId = 'all' | 'gothic' | 'mincho' | 'rounded' | 'design' | 'brush' | 'korean' | 'latin' | 'mine';
export function fontCategoryKey(id: FontCategoryId): MessageKey {
  return `fontCat.${id}` as const satisfies MessageKey;
}

export type WeightValue = 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;
export function weightKey(weight: WeightValue): MessageKey {
  return `weight.${weight}` as const satisfies MessageKey;
}

export function categoryKey(id: TemplateCategory): MessageKey {
  return `category.${id}` as const satisfies MessageKey;
}
export function systemKey(id: RollSystem): MessageKey {
  return `system.${id}` as const satisfies MessageKey;
}
export function stylePresetKey(id: StylePresetId): MessageKey {
  return `preset.${id}` as const satisfies MessageKey;
}
export function gradientPresetKey(id: GradientPresetId): MessageKey {
  return `gradient.${id}` as const satisfies MessageKey;
}

/** All language codes in UI order (JA | EN | KO). */
export const UI_LANGUAGES: readonly Lang[] = LANGUAGES;
