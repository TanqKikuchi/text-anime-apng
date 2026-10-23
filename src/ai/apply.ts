import { CANVAS_PRESETS, mergeScene } from '../core/scene';
import type { Scene, SceneMode } from '../core/scene';
import { getTemplate } from '../templates';
import type { Lang } from '../ui/i18n';
import { MODES, activeScene, recordText, sceneForTemplate, templateOf, withModeState, withSharedExport } from '../ui/state';
import type { AppState } from '../ui/state';

/** One `apply_design` tool call, as received from the model (untrusted). */
export interface DesignCommand {
  readonly mode?: unknown;
  readonly templateId?: unknown;
  readonly text?: unknown;
  readonly patch?: unknown;
  readonly reply?: unknown;
}

export interface ApplyResult {
  readonly state: AppState;
  /** Requested values that were ignored or adjusted (dotted paths), for the chat log. */
  readonly adjusted: readonly string[];
  readonly changed: boolean;
}

/** Keys the assistant must not touch: identity fields and the per-user export file name. */
const LOCKED: ReadonlySet<string> = new Set(['version', 'seed', 'mode', 'export.fileName']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Drops locked keys and keys the scene does not have; returns the cleaned patch and what was dropped. */
function cleanPatch(patch: Record<string, unknown>, base: Record<string, unknown>, prefix: string, dropped: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (LOCKED.has(path) || !(key in base)) {
      dropped.push(path);
      continue;
    }
    const target = base[key];
    out[key] = isRecord(value) && isRecord(target) ? cleanPatch(value, target, path, dropped) : value;
  }
  return out;
}

/** Leaf paths whose requested value did not survive validation (clamped / unknown enum / wrong type). */
function adjustedLeaves(patch: Record<string, unknown>, result: Record<string, unknown>, prefix: string, out: string[]): void {
  for (const [key, value] of Object.entries(patch)) {
    const path = prefix ? `${prefix}.${key}` : key;
    const actual = result[key];
    if (isRecord(value) && isRecord(actual)) adjustedLeaves(value, actual, path, out);
    else if (JSON.stringify(value) !== JSON.stringify(actual)) out.push(path);
  }
}

function valueAt(root: unknown, keys: readonly string[]): unknown {
  return keys.reduce<unknown>((node, key) => (isRecord(node) ? node[key] : undefined), root);
}

function sameColor(a: unknown, b: unknown): boolean {
  return typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
}

function withCanvasPreset(patch: Record<string, unknown>): Record<string, unknown> {
  const canvas = patch.canvas;
  if (!isRecord(canvas) || typeof canvas.preset !== 'string' || canvas.preset === 'custom') return patch;
  const size = CANVAS_PRESETS[canvas.preset as keyof typeof CANVAS_PRESETS];
  return size ? { ...patch, canvas: { ...canvas, ...size } } : patch;
}

/**
 * Applies a model command to the app state, in the order a person would: mode → template → text
 * → fine settings. Everything passes through `mergeScene` (which validates and clamps), unknown
 * fonts are refused via `knownFont`, and the export settings stay shared across modes.
 */
export function applyDesign(state: AppState, command: DesignCommand, lang: Lang, knownFont: (family: string) => boolean): ApplyResult {
  const adjusted: string[] = [];
  let next = state;

  if (command.mode !== undefined) {
    if (MODES.includes(command.mode as SceneMode)) {
      const mode = command.mode as SceneMode;
      if (mode !== next.mode) next = withModeState({ ...next, mode }, mode, { scene: withSharedExport(next.modes[mode].scene, activeScene(next)) });
    } else adjusted.push('mode');
  }

  if (command.templateId !== undefined) {
    const template = typeof command.templateId === 'string' ? getTemplate(command.templateId) : undefined;
    if (template) {
      const before = activeScene(next);
      if (template.mode !== next.mode) next = withModeState({ ...next, mode: template.mode }, template.mode, { scene: withSharedExport(next.modes[template.mode].scene, before) });
      const scene = sceneForTemplate(next, template, lang);
      next = withModeState(next, template.mode, { scene, templateId: template.id });
    } else adjusted.push('templateId');
  }

  let scene = activeScene(next);
  let textEdited = false;

  if (command.text !== undefined) {
    if (isRecord(command.text)) {
      const text: Record<string, string> = {};
      for (const key of ['main', 'sub'] as const) {
        const value = command.text[key];
        if (typeof value === 'string') text[key] = value;
        else if (value !== undefined) adjusted.push(`text.${key}`);
      }
      if (scene.mode === 'trailer' && 'sub' in text) {
        delete text.sub;
        adjusted.push('text.sub');
      }
      if (Object.keys(text).length > 0) {
        scene = mergeScene(scene, { text });
        textEdited = true;
      }
    } else adjusted.push('text');
  }

  if (command.patch !== undefined) {
    if (isRecord(command.patch)) {
      const dropped: string[] = [];
      const patch = withCanvasPreset(cleanPatch(command.patch, scene as unknown as Record<string, unknown>, '', dropped));
      const before = scene;
      let merged = mergeScene(scene, patch);
      for (const key of ['mainFont', 'subFont'] as const) {
        if (merged.text[key].family !== before.text[key].family && !knownFont(merged.text[key].family)) {
          merged = { ...merged, text: { ...merged.text, [key]: { ...merged.text[key], family: before.text[key].family } } };
        }
      }
      const changedLeaves: string[] = [];
      adjustedLeaves(patch, merged as unknown as Record<string, unknown>, '', changedLeaves);
      // An unknown choice (string) keeps the previous value instead of falling back to the default.
      const revert: Record<string, unknown> = {};
      for (const path of changedLeaves) {
        const keys = path.split('.');
        if (typeof valueAt(patch, keys) !== 'string' || keys.some((key) => /^\d+$/.test(key))) continue;
        let node = revert;
        keys.slice(0, -1).forEach((key) => { node = (node[key] ??= {}) as Record<string, unknown>; });
        node[keys.at(-1)!] = valueAt(before, keys);
      }
      if (Object.keys(revert).length > 0) merged = mergeScene(merged, revert);
      // Colour case differences are not adjustments.
      adjusted.push(...dropped, ...changedLeaves.filter((path) => {
        const keys = path.split('.');
        return !sameColor(valueAt(patch, keys), valueAt(merged, keys));
      }));
      if ('text' in patch) textEdited = true;
      scene = merged;
    } else adjusted.push('patch');
  }

  const mode = next.mode;
  if (scene !== activeScene(next)) {
    next = withModeState(next, mode, { scene });
    for (const other of MODES) if (other !== mode) next = withModeState(next, other, { scene: withSharedExport(next.modes[other].scene, scene) });
    if (textEdited) next = { ...next, memory: recordText(next.memory, mode, templateOf(next), scene.text) };
  }

  return { state: next, adjusted, changed: next !== state };
}

/** The part of the state the model sees each turn: the active scene minus the file name. */
export function describeState(state: AppState): string {
  const scene: Scene = activeScene(state);
  const { fileName: _fileName, ...exportSettings } = scene.export;
  void _fileName;
  return JSON.stringify({ templateId: state.modes[state.mode].templateId, scene: { ...scene, export: exportSettings } });
}
