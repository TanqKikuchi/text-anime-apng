import { createDefaultScene, deepMerge, validateScene } from '../core/scene';
import type { Scene, SceneMode } from '../core/scene';
import type { LoopMode } from '../core/timeline';
import { LANGUAGES } from '../ui/i18n/languages';
import type { Lang } from '../ui/i18n/languages';
import { MESSAGE_TEMPLATES } from './message';
import { PLACE_TIME_TEMPLATES } from './placeTime';
import { TRAILER_TEMPLATES } from './trailer';
import type { RollSystem, TemplateCategory, TemplateDef } from './types';

export type { DeepPartial, RollSystem, TemplateCategory, TemplateDef, TemplateOverrides, TemplateSample } from './types';
export * from './presets';

export const TEMPLATES: readonly TemplateDef[] = [...MESSAGE_TEMPLATES, ...TRAILER_TEMPLATES, ...PLACE_TIME_TEMPLATES];

/** Tab order of the message-mode categories (TPL-01). Other modes show a flat list. */
export const MESSAGE_CATEGORIES: readonly TemplateCategory[] = ['battle', 'mystery', 'horror', 'scifi', 'comedy', 'scene', 'gm', 'roll'];
export const ALL_CATEGORIES: readonly TemplateCategory[] = [...MESSAGE_CATEGORIES, 'cinema', 'fantasy', 'daily'];
export const ROLL_SYSTEMS: readonly RollSystem[] = ['d100', '2d6'];

/** TPL-06: categories meant to stay on screen loop forever by default. */
const LOOPING_CATEGORIES: ReadonlySet<TemplateCategory> = new Set<TemplateCategory>(['gm', 'roll']);

export interface TemplateFilter {
  readonly category?: TemplateCategory;
  readonly system?: RollSystem;
}

export function listTemplates(mode?: SceneMode, filter: TemplateFilter = {}): readonly TemplateDef[] {
  return TEMPLATES.filter((template) =>
    (mode === undefined || template.mode === mode)
    && (filter.category === undefined || template.category === filter.category)
    && (filter.system === undefined || template.system === filter.system));
}

export function getTemplate(id: string): TemplateDef | undefined {
  return TEMPLATES.find((template) => template.id === id);
}

/** Category tabs for a mode; empty for modes that show a flat chip list. */
export function listCategories(mode: SceneMode): readonly TemplateCategory[] {
  if (mode !== 'message') return [];
  return MESSAGE_CATEGORIES.filter((category) => listTemplates(mode, { category }).length > 0);
}

/** System row under a category (only "roll" has one). */
export function listSystems(category: TemplateCategory): readonly RollSystem[] {
  return ROLL_SYSTEMS.filter((system) => listTemplates('message', { category, system }).length > 0);
}

/**
 * First template of a mode / category / system (TPL-04). For "roll" without a system the first
 * system's first template is returned. Every mode has at least one template, so this never fails
 * for a valid mode.
 */
export function firstTemplate(mode: SceneMode, category?: TemplateCategory, system?: RollSystem): TemplateDef {
  const matches = listTemplates(mode, { category, system });
  const found = matches[0] ?? listTemplates(mode)[0];
  if (!found) throw new Error(`no template for mode ${mode}`);
  return found;
}

/** TPL-06: explicit loop → category default → play once. */
export function defaultLoop(template: TemplateDef): LoopMode {
  if (template.defaultLoop) return template.defaultLoop;
  return LOOPING_CATEGORIES.has(template.category) ? { kind: 'forever' } : { kind: 'once' };
}

export function templateName(template: TemplateDef, lang: Lang): string {
  return template.names[lang] || template.names.en || template.names.ja;
}

export interface SceneText {
  readonly main: string;
  readonly sub: string;
}

export function templateSample(template: TemplateDef, lang: Lang): SceneText {
  const sample = template.samples[lang];
  return { main: sample.main, sub: template.mode === 'trailer' ? '' : sample.sub ?? '' };
}

export interface ApplyTemplateOptions {
  /** Language of the sample text (default 'ja'). */
  readonly lang?: Lang;
  /** Remembered text (TPL-03); replaces the sample when given. */
  readonly text?: SceneText | null;
}

/**
 * TPL-02 composition without validation: global + mode defaults → template patch. Keeps the
 * current canvas size, the "exit" switch (unless the template sets it) and export settings, with
 * the export loop reset to the template default (TPL-06). Exposed for tests.
 */
export function composeTemplateScene(base: Scene, template: TemplateDef, options: ApplyTemplateOptions = {}): Scene {
  const merged = deepMerge(createDefaultScene(template.mode), template.patch);
  const text = options.text ?? templateSample(template, options.lang ?? 'ja');
  return {
    ...merged,
    text: { ...merged.text, main: text.main, sub: template.mode === 'trailer' ? '' : text.sub },
    canvas: { ...base.canvas },
    motion: { ...merged.motion, exitEnabled: template.patch.motion?.exitEnabled ?? base.motion.exitEnabled },
    export: { ...base.export, loop: defaultLoop(template) },
  };
}

export function applyTemplate(base: Scene, template: TemplateDef, options: ApplyTemplateOptions = {}): Scene {
  return validateScene(composeTemplateScene(base, template, options));
}

/**
 * Initial / reset scene of a mode (TPL-02 start-up, TPL-05). With `carry`, the canvas size, exit
 * switch and export settings are kept but the manual file name is cleared.
 */
export function createModeScene(mode: SceneMode, lang: Lang = 'ja', carry?: Scene): Scene {
  const base = carry ?? createDefaultScene(mode);
  const scene = applyTemplate(base, firstTemplate(mode), { lang });
  return { ...scene, export: { ...scene.export, fileName: '' } };
}

/** Language whose sample exactly equals the given text, or null when the text was edited. */
export function matchingSampleLanguage(template: TemplateDef, text: SceneText): Lang | null {
  for (const lang of LANGUAGES) {
    const sample = templateSample(template, lang);
    if (sample.main === text.main && (template.mode === 'trailer' || sample.sub === text.sub)) return lang;
  }
  return null;
}

/** TPL-03: only edited, non-empty text is remembered. */
export function shouldRememberText(template: TemplateDef, text: SceneText): boolean {
  return text.main.trim() !== '' && matchingSampleLanguage(template, text) === null;
}

/** I18N-03: swap an untouched sample to the new language; edited text is left alone. */
export function relocalizeSample(scene: Scene, template: TemplateDef, lang: Lang): Scene {
  const matched = matchingSampleLanguage(template, scene.text);
  if (matched === null || matched === lang) return scene;
  const sample = templateSample(template, lang);
  return { ...scene, text: { ...scene.text, main: sample.main, sub: sample.sub } };
}
