import { createDefaultScene, mergeScene } from '../core/scene';
import type { Scene, SceneMode } from '../core/scene';
import {
  applyTemplate,
  createModeScene,
  defaultLoop,
  firstTemplate,
  getTemplate,
  shouldRememberText,
  templateSample,
} from '../templates';
import type { RollSystem, SceneText, TemplateCategory, TemplateDef } from '../templates';
import { MISSING_FONT_REPLACEMENT, findCatalogFont, snapWeight } from './fonts/catalog';
import type { Lang } from './i18n';

/** App-level state (pure data). DOM-free so it can be unit-tested. */

export const MODES: readonly SceneMode[] = ['message', 'trailer', 'place-time'];
export const SETTINGS_GROUPS = ['text', 'font', 'motion', 'decoration', 'layout'] as const;
export type SettingsGroup = (typeof SETTINGS_GROUPS)[number];
export const PREVIEW_BACKGROUNDS = ['transparent', 'black', 'white', 'grey', 'image'] as const;
export type PreviewBackground = (typeof PREVIEW_BACKGROUNDS)[number];

export interface ModeState {
  readonly scene: Scene;
  readonly templateId: string;
}

export interface TextMemory {
  /** message / trailer: per template (TPL-03). */
  readonly message: Readonly<Record<string, SceneText>>;
  readonly trailer: Readonly<Record<string, SceneText>>;
  /** place-time: one shared text. */
  readonly placeTime: SceneText | null;
}

export interface AppState {
  readonly mode: SceneMode;
  readonly group: SettingsGroup;
  readonly modes: Readonly<Record<SceneMode, ModeState>>;
  readonly memory: TextMemory;
  readonly previewBackground: PreviewBackground;
  readonly loopPlayback: boolean;
}

export const EMPTY_MEMORY: TextMemory = { message: {}, trailer: {}, placeTime: null };

export function templateOf(state: AppState, mode: SceneMode = state.mode): TemplateDef {
  return getTemplate(state.modes[mode].templateId) ?? firstTemplate(mode);
}

export function activeScene(state: AppState): Scene {
  return state.modes[state.mode].scene;
}

export function createInitialState(lang: Lang): AppState {
  const modes = {} as Record<SceneMode, ModeState>;
  for (const mode of MODES) modes[mode] = { scene: createModeScene(mode, lang), templateId: firstTemplate(mode).id };
  return { mode: 'message', group: 'text', modes, memory: EMPTY_MEMORY, previewBackground: 'transparent', loopPlayback: true };
}

/** Export settings that are shared across modes (everything except the per-mode file name). */
export function withSharedExport(target: Scene, source: Scene): Scene {
  return { ...target, export: { ...source.export, fileName: target.export.fileName } };
}

export function rememberedText(memory: TextMemory, mode: SceneMode, templateId: string): SceneText | null {
  if (mode === 'place-time') return memory.placeTime;
  return memory[mode][templateId] ?? null;
}

/** TPL-03: records (or forgets) the text of the current template after a user edit. */
export function recordText(memory: TextMemory, mode: SceneMode, template: TemplateDef, text: SceneText): TextMemory {
  if (mode === 'place-time') {
    if (text.main.trim() === '') return memory;
    return { ...memory, placeTime: { main: text.main, sub: text.sub } };
  }
  const table = { ...memory[mode] };
  if (shouldRememberText(template, text)) table[template.id] = { main: text.main, sub: text.sub };
  else delete table[template.id];
  return { ...memory, [mode]: table };
}

/** TPL-02 / TPL-03: scene after choosing `template` in its mode. */
export function sceneForTemplate(state: AppState, template: TemplateDef, lang: Lang): Scene {
  const current = state.modes[template.mode].scene;
  const text = rememberedText(state.memory, template.mode, template.id) ?? templateSample(template, lang);
  return applyTemplate(current, template, { lang, text });
}

export function withModeState(state: AppState, mode: SceneMode, patch: Partial<ModeState>): AppState {
  return { ...state, modes: { ...state.modes, [mode]: { ...state.modes[mode], ...patch } } };
}

/** TPL-05: resets one mode (scene from its first template, memory and manual file name cleared). */
export function resetMode(state: AppState, mode: SceneMode, lang: Lang): AppState {
  const template = firstTemplate(mode);
  const current = state.modes[mode].scene;
  const fresh = createModeScene(mode, lang);
  const scene: Scene = { ...fresh, export: { ...current.export, fileName: '', loop: defaultLoop(template) } };
  const memory: TextMemory = mode === 'place-time' ? { ...state.memory, placeTime: null } : { ...state.memory, [mode]: {} };
  return { ...withModeState(state, mode, { scene, templateId: template.id }), memory };
}

/**
 * STO-02: registered fonts that no longer exist fall back to Noto Sans JP (main) / "same as main"
 * (sub). `known` tells whether a family is still available (catalogue or my fonts).
 */
export function repairFonts(scene: Scene, known: (family: string) => boolean): Scene {
  let text = scene.text;
  if (!known(text.mainFont.family)) {
    const replacement = findCatalogFont(MISSING_FONT_REPLACEMENT);
    text = {
      ...text,
      mainFont: { ...text.mainFont, family: MISSING_FONT_REPLACEMENT, weight: snapWeight(text.mainFont.weight, replacement?.weights ?? [400]) },
    };
  }
  if (!text.subFontInherit && !known(text.subFont.family)) text = { ...text, subFontInherit: true, subFont: { ...text.subFont, family: text.mainFont.family } };
  return text === scene.text ? scene : { ...scene, text };
}

/** A blank mode scene used as a merge base when a saved template is gone (STO-02). */
export function rebuildModeScene(mode: SceneMode, lang: Lang, saved: Scene): Scene {
  const scene = createModeScene(mode, lang);
  return mergeScene(scene, {
    canvas: saved.canvas,
    motion: { exitEnabled: saved.motion.exitEnabled },
  });
}

export function emptyScene(mode: SceneMode): Scene {
  return createDefaultScene(mode);
}

export type { RollSystem, TemplateCategory };
