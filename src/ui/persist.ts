import { mergeScene } from '../core/scene';
import type { Scene, SceneMode } from '../core/scene';
import { applyTemplate, createModeScene, defaultLoop, firstTemplate, getTemplate, templateSample } from '../templates';
import type { SceneText } from '../templates';
import type { Lang, StorageLike } from './i18n';
import {
  EMPTY_MEMORY,
  MODES,
  PREVIEW_BACKGROUNDS,
  SETTINGS_GROUPS,
  createInitialState,
  rebuildModeScene,
  repairFonts,
} from './state';
import type { AppState, ModeState, PreviewBackground, SettingsGroup, TextMemory } from './state';

/** STO-01 / STO-02 persistence of the app state (localStorage JSON, versioned). */

export const STATE_STORAGE_KEY = 'mojimotion.state';
export const THEME_STORAGE_KEY = 'mojimotion.theme';
export const MYFONTS_STORAGE_KEY = 'mojimotion.myfonts';
/** Current saved-data format version. */
export const STATE_VERSION = 2;
export const SAVE_DEBOUNCE_MS = 300;

interface SavedState {
  readonly version: number;
  readonly mode: SceneMode;
  readonly group: SettingsGroup;
  readonly modes: Record<SceneMode, { readonly scene: Scene; readonly templateId: string }>;
  readonly memory: TextMemory;
  readonly previewBackground: Exclude<PreviewBackground, 'image'>;
  readonly loopPlayback: boolean;
}

export function serializeState(state: AppState): string {
  const saved: SavedState = {
    version: STATE_VERSION,
    mode: state.mode,
    group: state.group,
    modes: {
      message: { scene: state.modes.message.scene, templateId: state.modes.message.templateId },
      trailer: { scene: state.modes.trailer.scene, templateId: state.modes.trailer.templateId },
      'place-time': { scene: state.modes['place-time'].scene, templateId: state.modes['place-time'].templateId },
    },
    memory: state.memory,
    // The preview image is never stored (UI-12).
    previewBackground: state.previewBackground === 'image' ? 'transparent' : state.previewBackground,
    loopPlayback: state.loopPlayback,
  };
  return JSON.stringify(saved);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readText(value: unknown): SceneText | null {
  if (!isRecord(value) || typeof value.main !== 'string') return null;
  return { main: value.main, sub: typeof value.sub === 'string' ? value.sub : '' };
}

function readTextTable(value: unknown): Record<string, SceneText> {
  const table: Record<string, SceneText> = {};
  if (!isRecord(value)) return table;
  for (const [id, entry] of Object.entries(value)) {
    const text = readText(entry);
    if (text && getTemplate(id)) table[id] = text;
  }
  return table;
}

function readMemory(value: unknown): TextMemory {
  if (!isRecord(value)) return EMPTY_MEMORY;
  return { message: readTextTable(value.message), trailer: readTextTable(value.trailer), placeTime: readText(value.placeTime) };
}

function restoreMode(mode: SceneMode, raw: unknown, lang: Lang, version: number, known: (family: string) => boolean): ModeState {
  const first = firstTemplate(mode);
  if (!isRecord(raw) || !isRecord(raw.scene)) return { scene: createModeScene(mode, lang), templateId: first.id };
  const savedScene = mergeScene(createModeScene(mode, lang), { ...raw.scene, mode });
  const template = typeof raw.templateId === 'string' ? getTemplate(raw.templateId) : undefined;
  let scene: Scene;
  let templateId: string;
  if (template && template.mode === mode) {
    // Default scene = global + mode defaults + this template, then the saved values on top.
    const base = applyTemplate(savedScene, template, { lang, text: templateSample(template, lang) });
    scene = mergeScene(base, raw.scene);
    templateId = template.id;
  } else if (mode === 'message') {
    // Category mode whose template no longer exists: start again from the first template.
    scene = rebuildModeScene(mode, lang, savedScene);
    templateId = first.id;
  } else {
    scene = savedScene;
    templateId = first.id;
  }
  scene = repairFonts({ ...scene, mode }, known);
  // Export loop is restored only from current-format data (older data → template default, TPL-06).
  if (version < STATE_VERSION) scene = { ...scene, export: { ...scene.export, loop: defaultLoop(getTemplate(templateId) ?? first) } };
  return { scene, templateId };
}

/**
 * STO-02: rebuilds the app state from saved JSON. Broken JSON or missing fields fall back to the
 * defaults; never throws. `known(family)` reports whether a font family still exists.
 */
export function restoreState(json: string | null, lang: Lang, known: (family: string) => boolean): AppState {
  const initial = createInitialState(lang);
  if (!json) return initial;
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return initial;
  }
  if (!isRecord(parsed)) return initial;
  const version = typeof parsed.version === 'number' ? parsed.version : 0;
  const savedModes = isRecord(parsed.modes) ? parsed.modes : {};
  const modes = {} as Record<SceneMode, ModeState>;
  for (const mode of MODES) {
    try {
      modes[mode] = restoreMode(mode, savedModes[mode], lang, version, known);
    } catch {
      modes[mode] = initial.modes[mode];
    }
  }
  const mode = MODES.includes(parsed.mode as SceneMode) ? (parsed.mode as SceneMode) : 'message';
  const group = (SETTINGS_GROUPS as readonly string[]).includes(parsed.group as string) ? (parsed.group as SettingsGroup) : 'text';
  const background = (PREVIEW_BACKGROUNDS as readonly string[]).includes(parsed.previewBackground as string) && parsed.previewBackground !== 'image'
    ? (parsed.previewBackground as PreviewBackground)
    : 'transparent';
  return {
    mode,
    group,
    modes,
    memory: readMemory(parsed.memory),
    previewBackground: background,
    loopPlayback: typeof parsed.loopPlayback === 'boolean' ? parsed.loopPlayback : true,
  };
}

export function loadStateJson(storage: StorageLike | null): string | null {
  try {
    return storage?.getItem(STATE_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

export function saveStateJson(storage: StorageLike | null, state: AppState): boolean {
  try {
    if (!storage) return false;
    storage.setItem(STATE_STORAGE_KEY, serializeState(state));
    return true;
  } catch {
    return false;
  }
}

/** Debounced saver (STO-01: 300 ms). Returns `schedule` and `flush`. */
export function createSaver(save: () => void, delay = SAVE_DEBOUNCE_MS): { schedule(): void; flush(): void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    schedule() {
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = undefined;
        save();
      }, delay);
    },
    flush() {
      if (timer === undefined) return;
      clearTimeout(timer);
      timer = undefined;
      save();
    },
  };
}
