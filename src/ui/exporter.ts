import { hasDeflateCompression } from '../core/compression';
import { ExportCancelledError, exportApng } from '../core/export';
import type { ExportProgress } from '../core/export';
import { exportBaseName, exportFilenames } from '../core/filename';
import { createSceneModel } from '../core/frame';
import { encodePng } from '../core/png';
import { isSceneTextEmpty } from '../core/scene';
import type { Scene } from '../core/scene';
import type { SceneTimeline } from '../core/scene-timeline';
import { MAX_EXPORT_FRAMES, MAX_PIXEL_FRAMES, frameCount } from '../core/timeline';
import { encodePngBytesSequenceZip, encodePngSequenceZip } from '../core/zip';
import { CanvasTextMeasurer, createRgbaRenderer } from '../render';
import type { LayerCanvas } from '../render';

/** Export jobs (EXP-15〜EXP-24) shared by the export panel and the test hook. */

export type ExportKind = 'apng' | 'png' | 'zip';

export type ExportFailure =
  | { readonly reason: 'empty' }
  | { readonly reason: 'unsupported' }
  | { readonly reason: 'frame-limit'; readonly frames: number }
  | { readonly reason: 'work-limit' }
  | { readonly reason: 'cancelled' }
  | { readonly reason: 'error'; readonly message: string };

export interface ExportOutput {
  readonly kind: ExportKind;
  readonly bytes: Uint8Array;
  readonly fileName: string;
  readonly mime: string;
  readonly width: number;
  readonly height: number;
  readonly sourceFrames: number;
  readonly storedFrames: number;
  readonly lossless: boolean;
  readonly fps: number;
}

export type ExportResult = { readonly ok: true; readonly output: ExportOutput } | { readonly ok: false; readonly failure: ExportFailure };

export interface ExportJobOptions {
  readonly scene: Scene;
  readonly kind: ExportKind;
  readonly fontFamily: (family: string) => string;
  /** EXP-18: preview playing (→ completed time) or the paused time. */
  readonly previewTime: number;
  readonly previewPlaying: boolean;
  readonly candidateName: string;
  readonly waitForFonts: () => Promise<unknown>;
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: ExportProgress | { readonly phase: 'fonts' | 'still'; readonly percent: number }) => void;
}

/**
 * Canvas factory used for export and the test hook: CPU-backed canvases (willReadFrequently) so
 * every pixel read goes through the same rasteriser and preview/export frames match exactly.
 */
export function cpuCanvasFactory(width: number, height: number): LayerCanvas {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(w, h);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (context) return { canvas, context };
  }
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('2D canvas is not available');
  return { canvas, context };
}

/**
 * Two-pass exports (analysis + encode) ask for every frame twice. Small jobs keep the first render
 * (up to `budgetBytes` of RGBA) and hand it out again on the second request, halving render time.
 */
export function reuseSecondRender(render: (t: number) => Uint8ClampedArray, budgetBytes = 256 * 1024 * 1024): (t: number) => Uint8ClampedArray {
  const cache = new Map<number, Uint8ClampedArray>();
  const seen = new Set<number>();
  let used = 0;
  return (time) => {
    const cached = cache.get(time);
    if (cached) {
      cache.delete(time);
      used -= cached.byteLength;
      return cached;
    }
    const frame = render(time);
    if (!seen.has(time) && used + frame.byteLength <= budgetBytes) {
      cache.set(time, frame);
      used += frame.byteLength;
    }
    seen.add(time);
    return frame;
  };
}

/** Renderer (t → RGBA at scene size) used by export and by `window.__tanim.renderRgba`. */
export function sceneRgbaRenderer(scene: Scene, fontFamily: (family: string) => string): (t: number) => Uint8ClampedArray {
  return createRgbaRenderer(scene, scene.canvas.width, scene.canvas.height, { fontFamily, canvasFactory: cpuCanvasFactory });
}

export function sceneTimeline(scene: Scene, fontFamily: (family: string) => string): SceneTimeline {
  const { context } = cpuCanvasFactory(1, 1);
  return createSceneModel(scene, new CanvasTextMeasurer(context, fontFamily)).timeline;
}

/** EXP-18: time of the still PNG. */
export function stillTime(timeline: SceneTimeline, previewTime: number, playing: boolean): number {
  if (playing) return timeline.completedTime;
  const time = Math.max(0, Math.min(timeline.duration, previewTime));
  const first = timeline.pages[0];
  const last = timeline.pages[timeline.pages.length - 1];
  if (!first || !last) return timeline.completedTime;
  if (time < first.characterStart) return timeline.completedTime;
  if (!last.persistent && time > last.end) return timeline.completedTime;
  return time;
}

/** EXP-01 / D-05b guards before rendering. */
export function checkLimits(scene: Scene, duration: number): ExportFailure | null {
  const frames = frameCount(duration, scene.export.fps);
  if (frames > MAX_EXPORT_FRAMES) return { reason: 'frame-limit', frames };
  if (scene.canvas.width * scene.canvas.height * frames > MAX_PIXEL_FRAMES) return { reason: 'work-limit' };
  return null;
}

async function canvasPng(rgba: Uint8ClampedArray, width: number, height: number): Promise<Uint8Array> {
  const { canvas, context } = cpuCanvasFactory(width, height);
  context.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
  const blob = canvas instanceof OffscreenCanvas
    ? await canvas.convertToBlob({ type: 'image/png' })
    : await new Promise<Blob>((resolve, reject) => (canvas as HTMLCanvasElement).toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'));
  return new Uint8Array(await blob.arrayBuffer());
}

/** PNG bytes of an RGBA frame: in-house encoder (exact pixels), browser encoder when CompressionStream is missing. */
export async function rgbaToPng(rgba: Uint8ClampedArray, width: number, height: number): Promise<Uint8Array> {
  return hasDeflateCompression() ? encodePng(rgba, width, height) : canvasPng(rgba, width, height);
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function' && !document.hidden) {
      // Let the browser paint progress and handle input (cancel) between frames.
      setTimeout(resolve, 0);
    } else setTimeout(resolve, 0);
  });
}

export async function runExport(options: ExportJobOptions): Promise<ExportResult> {
  const { scene, kind } = options;
  if (isSceneTextEmpty(scene)) return { ok: false, failure: { reason: 'empty' } };
  if (kind === 'apng' && !hasDeflateCompression()) return { ok: false, failure: { reason: 'unsupported' } };
  try {
    options.onProgress?.({ phase: 'fonts', percent: 0 });
    await options.waitForFonts();
    if (options.signal?.aborted) throw new ExportCancelledError();
    const timeline = sceneTimeline(scene, options.fontFamily);
    const duration = timeline.duration;
    const names = exportFilenames(exportBaseName(scene.export.fileName, options.candidateName));
    const { width, height } = scene.canvas;
    const render = sceneRgbaRenderer(scene, options.fontFamily);
    const fps = scene.export.fps;
    if (kind === 'png') {
      options.onProgress?.({ phase: 'still', percent: 50 });
      const rgba = render(stillTime(timeline, options.previewTime, options.previewPlaying));
      const bytes = await rgbaToPng(rgba, width, height);
      return { ok: true, output: { kind, bytes, fileName: names.still, mime: 'image/png', width, height, sourceFrames: 1, storedFrames: 1, lossless: true, fps } };
    }
    const limit = checkLimits(scene, duration);
    if (limit) return { ok: false, failure: limit };
    if (kind === 'apng') {
      const result = await exportApng({
        width,
        height,
        duration,
        fps,
        loop: scene.export.loop,
        colorMode: scene.export.colorMode,
        autoTrim: scene.export.autoTrim,
        includeDefaultImage: scene.export.includeDefaultImage,
        completedTime: timeline.completedTime,
        render: scene.export.colorMode === 'palette' || scene.export.autoTrim ? reuseSecondRender(render) : render,
        signal: options.signal,
        onProgress: options.onProgress,
        yieldControl: nextFrame,
      });
      return {
        ok: true,
        output: {
          kind,
          bytes: result.bytes,
          fileName: names.apng,
          mime: 'image/png',
          width: result.width,
          height: result.height,
          sourceFrames: result.sourceFrames,
          storedFrames: result.storedFrames,
          lossless: result.analysis.palette?.lossless ?? false,
          fps,
        },
      };
    }
    const base = names.frames.replace(/_frames\.zip$/u, '');
    const zipOptions = { baseName: base, width, height, duration, fps, signal: options.signal, onProgress: options.onProgress, yieldControl: nextFrame };
    const bytes = hasDeflateCompression()
      ? await encodePngSequenceZip({ ...zipOptions, render })
      : await encodePngBytesSequenceZip({ ...zipOptions, renderPng: (time) => canvasPng(render(time), width, height) });
    const frames = frameCount(duration, fps);
    return { ok: true, output: { kind, bytes, fileName: names.frames, mime: 'application/zip', width, height, sourceFrames: frames, storedFrames: frames, lossless: true, fps } };
  } catch (error) {
    if (error instanceof ExportCancelledError || options.signal?.aborted) return { ok: false, failure: { reason: 'cancelled' } };
    const message = error instanceof Error ? error.message : String(error);
    if (/Pixel-frame count/u.test(message)) return { ok: false, failure: { reason: 'work-limit' } };
    if (/Frame count/u.test(message)) return { ok: false, failure: { reason: 'frame-limit', frames: Number(/(\d+)/u.exec(message)?.[1] ?? 0) } };
    return { ok: false, failure: { reason: 'error', message } };
  }
}

export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  return btoa(binary);
}
