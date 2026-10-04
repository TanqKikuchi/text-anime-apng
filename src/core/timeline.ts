export const MAX_EXPORT_FRAMES = 1800;
export const MAX_PIXEL_FRAMES = 1_250_000_000;

export interface FrameTimeline {
  readonly duration: number;
  readonly fps: number;
  readonly count: number;
  readonly times: readonly number[];
}

export function createFrameTimeline(duration: number, fps: number): FrameTimeline {
  if (!Number.isFinite(duration) || duration < 0.2) throw new RangeError('Duration must be at least 0.2 seconds');
  if (!Number.isInteger(fps) || fps <= 0) throw new RangeError('FPS must be a positive integer');
  const count = frameCount(duration, fps);
  if (count > MAX_EXPORT_FRAMES) {
    throw new RangeError(`Frame count ${count} exceeds limit ${MAX_EXPORT_FRAMES}; reduce duration or FPS`);
  }
  const times = Array.from({ length: count }, (_, index) =>
    index === count - 1 ? duration : Math.min(index / fps, duration),
  );
  return { duration, fps, count, times };
}

/** EXP-01 / EXP-26: N = ceil(D × f − 0.000001), at least 1 (no limit check). */
export function frameCount(duration: number, fps: number): number {
  return Math.max(1, Math.ceil(duration * fps - 0.000001));
}

export function assertPixelFrameLimit(width: number, height: number, frames: number): void {
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
    throw new RangeError('Image dimensions must be positive integers');
  }
  if (!Number.isInteger(frames) || frames < 1) throw new RangeError('Frame count must be positive');
  const work = width * height * frames;
  if (!Number.isSafeInteger(work) || work > MAX_PIXEL_FRAMES) {
    throw new RangeError(`Pixel-frame count ${work} exceeds limit ${MAX_PIXEL_FRAMES}`);
  }
}

export type LoopMode =
  | { readonly kind: 'once' }
  | { readonly kind: 'forever' }
  | { readonly kind: 'count'; readonly count: number };

export function loopNumPlays(mode: LoopMode): number {
  if (mode.kind === 'once') return 1;
  if (mode.kind === 'forever') return 0;
  const count = Number.isFinite(mode.count) ? Math.round(mode.count) : 1;
  return Math.max(1, Math.min(999, count));
}
