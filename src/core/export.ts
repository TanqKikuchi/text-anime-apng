import { FrameAnalyzer, type AnalysisResult } from './analysis';
import { ApngEncoder, type ApngResult } from './apng';
import { fullRect } from './image';
import { assertPixelFrameLimit, createFrameTimeline, type LoopMode } from './timeline';

export type RenderFrame = (time: number) => Uint8ClampedArray | Promise<Uint8ClampedArray>;

export interface ExportProgress {
  readonly percent: number;
  readonly phase: 'analyze' | 'encode';
  readonly current: number;
  readonly total: number;
}

export interface ExportApngOptions {
  readonly width: number;
  readonly height: number;
  readonly duration: number;
  readonly fps: number;
  readonly loop: LoopMode;
  readonly colorMode: 'palette' | 'full';
  readonly autoTrim?: boolean;
  readonly includeDefaultImage?: boolean;
  readonly completedTime: number;
  readonly render: RenderFrame;
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: ExportProgress) => void;
  readonly yieldControl?: () => Promise<void>;
}

export interface ExportApngResult extends ApngResult {
  readonly analysis: AnalysisResult;
}

export class ExportCancelledError extends Error {
  constructor() {
    super('Export cancelled');
    this.name = 'ExportCancelledError';
  }
}

function checkCancelled(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new ExportCancelledError();
}

function defaultYield(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export async function exportApng(options: ExportApngOptions): Promise<ExportApngResult> {
  const timeline = createFrameTimeline(options.duration, options.fps);
  assertPixelFrameLimit(options.width, options.height, timeline.count);
  const needsAnalysis = options.colorMode === 'palette' || options.autoTrim === true;
  const includeDefault = options.includeDefaultImage ?? true;
  const yieldControl = options.yieldControl ?? defaultYield;
  let analysis: AnalysisResult = {
    trimRect: fullRect(options.width, options.height),
    trimmed: false,
  };

  if (needsAnalysis) {
    const analyzer = new FrameAnalyzer(options.width, options.height, {
      palette: options.colorMode === 'palette',
      autoTrim: options.autoTrim ?? false,
    });
    for (let index = 0; index < timeline.count; index += 1) {
      checkCancelled(options.signal);
      analyzer.addFrame(await options.render(timeline.times[index]!));
      options.onProgress?.({ percent: ((index + 1) / timeline.count) * 40, phase: 'analyze', current: index + 1, total: timeline.count });
      if ((index + 1) % 3 === 0 || index + 1 === timeline.count) await yieldControl();
    }
    if (includeDefault) {
      checkCancelled(options.signal);
      analyzer.addDefaultImage(await options.render(options.completedTime));
    }
    analysis = analyzer.finish();
  }

  const encoder = new ApngEncoder({
    width: options.width,
    height: options.height,
    fps: options.fps,
    loop: options.loop,
    includeDefaultImage: includeDefault,
    trimRect: analysis.trimRect,
    palette: analysis.palette,
  });
  if (includeDefault) {
    checkCancelled(options.signal);
    await encoder.setDefaultImage(await options.render(options.completedTime));
  }
  for (let index = 0; index < timeline.count; index += 1) {
    checkCancelled(options.signal);
    await encoder.addFrame(await options.render(timeline.times[index]!));
    const fraction = (index + 1) / timeline.count;
    options.onProgress?.({
      percent: needsAnalysis ? 40 + fraction * 60 : fraction * 100,
      phase: 'encode',
      current: index + 1,
      total: timeline.count,
    });
    if ((index + 1) % 2 === 0 || index + 1 === timeline.count) await yieldControl();
  }
  return { ...encoder.finish(), analysis };
}
