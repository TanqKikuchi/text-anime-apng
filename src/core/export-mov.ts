import { ExportCancelledError } from './cancel.ts';
import type { RenderFrame } from './export.ts';
import { buildMov } from './mov.ts';
import { ProResEncoder } from './prores/encoder.ts';
import { assertPixelFrameLimit, createFrameTimeline } from './timeline.ts';

/**
 * Transparent video export: ProRes 4444 (8-bit straight alpha) in a QuickTime .mov, for Keynote / AVFoundation.
 * One play of the animation (looping is left to the player); frames are encoded one at a time and only the
 * compressed frames are kept.
 */
export type MovQuality = 'high' | 'standard';

/** quantization_index per quality (qScale = index for ≤ 128; flat weight matrix 4 → DCT step = qScale / 2). */
export const MOV_QUANTIZATION_INDEX: Readonly<Record<MovQuality, number>> = { high: 8, standard: 24 };

/**
 * Bytes per pixel per frame for the pre-export size estimate: about twice what the 1280×360 glow/outline test
 * animation needs (0.26 high / 0.20 standard), so typical scenes stay below the estimate.
 */
// Conservative upper bounds (measured worst so far: high 0.55, standard ~0.4 bytes per pixel-frame).
const ESTIMATE_BYTES_PER_PIXEL: Readonly<Record<MovQuality, number>> = { high: 0.8, standard: 0.6 };

/** Hard limit on the compressed output (estimate before starting, running total while encoding). */
export const MAX_MOV_BYTES = 2 * 1024 ** 3;

/** sRGB canvas data: BT.709 primaries and matrix, IEC 61966-2-1 (sRGB) transfer (H.273 code 13) in the 'colr' atom. */
export const MOV_COLOR = { primaries: 1, transfer: 13, matrix: 1 } as const;

export interface MovExportProgress {
  readonly percent: number;
  readonly phase: 'encode';
  readonly current: number;
  readonly total: number;
}

export interface ExportMovOptions {
  readonly width: number;
  readonly height: number;
  readonly duration: number;
  readonly fps: number;
  readonly quality: MovQuality;
  readonly render: RenderFrame;
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: MovExportProgress) => void;
  readonly yieldControl?: () => Promise<void>;
}

export interface ExportMovResult {
  readonly bytes: Uint8Array;
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly frameCount: number;
  readonly quality: MovQuality;
  readonly quantizationIndex: number;
  /** Coarsest quantization_index used by any slice (> quantizationIndex only if a slice had to be requantized). */
  readonly maxQuantizationIndex: number;
}

/** Measured bytes per pixel-frame of the 1280×360 / 30 fps / 3 s test animation (10.6 MB high, 8.2 MB standard). */
const TYPICAL_BYTES_PER_PIXEL: Readonly<Record<MovQuality, number>> = { high: 0.26, standard: 0.2 };

export function estimateMovBytes(width: number, height: number, frameCount: number, quality: MovQuality): number {
  return Math.ceil(width * height * frameCount * ESTIMATE_BYTES_PER_PIXEL[quality]) + 4096;
}

/** Typical output size (shown before exporting); `estimateMovBytes` is the conservative figure used by the guard. */
export function typicalMovBytes(width: number, height: number, frameCount: number, quality: MovQuality): number {
  return Math.ceil(width * height * frameCount * TYPICAL_BYTES_PER_PIXEL[quality]) + 4096;
}

function defaultYield(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export async function exportMov(options: ExportMovOptions): Promise<ExportMovResult> {
  const timeline = createFrameTimeline(options.duration, options.fps);
  assertPixelFrameLimit(options.width, options.height, timeline.count);
  const estimate = estimateMovBytes(options.width, options.height, timeline.count, options.quality);
  if (estimate > MAX_MOV_BYTES) {
    throw new RangeError(`Estimated video size ${estimate} bytes exceeds limit ${MAX_MOV_BYTES}; reduce size, duration or FPS`);
  }
  const quantizationIndex = MOV_QUANTIZATION_INDEX[options.quality];
  const encoder = new ProResEncoder({
    width: options.width,
    height: options.height,
    quantizationIndex,
    fps: options.fps,
  });
  const yieldControl = options.yieldControl ?? defaultYield;
  const frames: Uint8Array[] = [];
  let total = 0;
  let maxQuantizationIndex = quantizationIndex;
  // Report 0 % immediately so the bar appears before the first (possibly slow) frame is rendered.
  options.onProgress?.({ percent: 0, phase: 'encode', current: 0, total: timeline.count });
  await yieldControl();
  for (let index = 0; index < timeline.count; index += 1) {
    if (options.signal?.aborted) throw new ExportCancelledError();
    const rgba = await options.render(timeline.times[index]!);
    if (options.signal?.aborted) throw new ExportCancelledError();
    const frame = encoder.encodeFrame(rgba);
    maxQuantizationIndex = Math.max(maxQuantizationIndex, encoder.lastMaxQuantizationIndex);
    total += frame.length;
    if (total > MAX_MOV_BYTES) throw new RangeError(`Video size exceeds limit ${MAX_MOV_BYTES} bytes; reduce size, duration or FPS`);
    frames.push(frame);
    options.onProgress?.({ percent: ((index + 1) / timeline.count) * 100, phase: 'encode', current: index + 1, total: timeline.count });
    await yieldControl();
  }
  if (options.signal?.aborted) throw new ExportCancelledError();
  const bytes = buildMov(
    {
      width: options.width,
      height: options.height,
      fps: options.fps,
      codec: 'ap4h',
      compressorName: 'Apple ProRes 4444',
      depth: 32,
      color: MOV_COLOR,
    },
    frames,
  );
  return {
    bytes,
    width: options.width,
    height: options.height,
    fps: options.fps,
    frameCount: timeline.count,
    quality: options.quality,
    quantizationIndex,
    maxQuantizationIndex,
  };
}
