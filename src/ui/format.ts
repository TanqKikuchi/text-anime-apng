import { filenameCandidate } from '../core/filename';
import { frameCount } from '../core/timeline';
import type { Scene } from '../core/scene';
import { effectKey, flowKey, modeKey, translate } from './i18n';
import type { Lang } from './i18n';

/** Display helpers shared by the export card and result panel (EXP-17 / EXP-22 / EXP-26). Pure. */

export const SIZE_WARNING_BYTES = 5 * 1024 * 1024;

/** EXP-17: ≥ 1 MiB → "x.xx MB", otherwise "n KB" (rounded, at least 1). */
export function formatSize(bytes: number, lang: Lang): string {
  if (bytes >= 1024 * 1024) return translate(lang, 'result.sizeMb', { v: (bytes / (1024 * 1024)).toFixed(2) });
  return translate(lang, 'result.sizeKb', { v: Math.max(1, Math.round(bytes / 1024)) });
}

/** EXP-26 info line. */
export function infoLine(scene: Scene, duration: number, lang: Lang): string {
  return translate(lang, 'export.info', {
    w: scene.canvas.width,
    h: scene.canvas.height,
    d: duration.toFixed(2),
    fps: scene.export.fps,
    n: frameCount(duration, scene.export.fps),
  });
}

export function loopLabel(scene: Scene, lang: Lang): string {
  const loop = scene.export.loop;
  if (loop.kind === 'forever') return translate(lang, 'result.loopForever');
  if (loop.kind === 'count') return translate(lang, 'result.loopCount', { n: loop.count });
  return translate(lang, 'result.loopOnce');
}

/** EXP-22 automatic file name candidate in the given UI language. */
export function fileNameCandidate(scene: Scene, lang: Lang): string {
  const trailer = scene.mode === 'trailer';
  return filenameCandidate({
    text: scene.text.main,
    modeLabel: translate(lang, modeKey(scene.mode)),
    motionLabel: trailer ? translate(lang, flowKey(scene.motion.trailer.flow)) : translate(lang, effectKey(scene.motion.enter.id)),
    hasExit: scene.motion.exitEnabled,
    isTrailerScroll: trailer && scene.motion.trailer.flow === 'scroll',
    noExitLabel: translate(lang, 'filename.noExit'),
    loopsForever: scene.export.loop.kind === 'forever',
    loopLabel: translate(lang, 'filename.loop'),
  });
}

/** EXP-22: input value equal to the candidate (or empty) counts as "no manual name". */
export function manualFileName(value: string, candidate: string): string {
  const trimmed = value.trim();
  return trimmed === '' || trimmed === candidate ? '' : value;
}

/** Rounds to the number of decimals of `step` (UI-05). */
export function roundToStep(value: number, step: number): number {
  const decimals = (String(step).split('.')[1] ?? '').length;
  const rounded = Math.round(value / step) * step;
  return Number(rounded.toFixed(decimals));
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** UI-11: displayed preview size for a scene in the available box. */
export function previewDisplaySize(sceneWidth: number, sceneHeight: number, availableWidth: number, availableHeight: number): { width: number; height: number } {
  const maxW = Math.max(120, availableWidth);
  const maxH = Math.max(1, availableHeight);
  const scale = Math.min(maxW / sceneWidth, maxH / sceneHeight);
  return { width: Math.max(1, Math.floor(sceneWidth * scale)), height: Math.max(1, Math.floor(sceneHeight * scale)) };
}

/** UI-11: available preview height (wide: min(0.6 vh, 620) ≥ 160; phone: 0.32 vh ≥ 140). */
export function previewAvailableHeight(viewportHeight: number, phone: boolean): number {
  return phone ? Math.max(140, viewportHeight * 0.32) : Math.max(160, Math.min(viewportHeight * 0.6, 620));
}

/** UI-11: internal resolution = display × min(2, dpr), capped at the scene width. */
export function previewInternalWidth(displayWidth: number, devicePixelRatio: number, sceneWidth: number): number {
  return Math.max(1, Math.min(sceneWidth, Math.round(displayWidth * Math.min(2, Math.max(1, devicePixelRatio)))));
}
