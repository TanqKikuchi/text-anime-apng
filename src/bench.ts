import { exportApng } from './core';

interface BenchResult {
  readonly case: string;
  readonly color: 'palette' | 'full';
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly duration: number;
  readonly milliseconds: number;
  readonly bytes: number;
  readonly sourceFrames: number;
  readonly storedFrames: number;
}

interface BenchState {
  status: 'idle' | 'running' | 'complete' | 'error';
  results: BenchResult[];
  error?: string;
}

declare global {
  interface Window {
    __bench: BenchState;
  }
}

const cases = [
  { name: 'standard', width: 1280, height: 360, fps: 30, duration: 3 },
  { name: 'max', width: 1920, height: 1080, fps: 60, duration: 10 },
] as const;

function createRenderer(width: number, height: number, duration: number): (time: number) => Uint8ClampedArray {
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (context === null) throw new Error('OffscreenCanvas 2D is unavailable');
  return (time) => {
    context.clearRect(0, 0, width, height);
    const phase = Math.min(1, time / duration);
    const originX = Math.round(-width * 0.2 + phase * width * 0.75);
    const originY = Math.round(height * 0.38 + Math.sin(phase * Math.PI * 2) * height * 0.08);
    const unit = Math.max(3, Math.round(height / 45));
    context.fillStyle = 'rgba(255,255,255,0.94)';
    for (let glyph = 0; glyph < 14; glyph += 1) {
      const x = originX + glyph * unit * 5;
      const glyphHeight = unit * (6 + (glyph % 3));
      context.fillRect(x, originY, unit * 3, glyphHeight);
      context.clearRect(x + unit, originY + unit, unit, Math.max(unit, glyphHeight - unit * 2));
    }
    context.fillStyle = 'rgba(80,190,255,0.65)';
    context.fillRect(originX, originY + unit * 10, unit * 68, unit);
    return context.getImageData(0, 0, width, height).data;
  };
}

async function runBench(): Promise<void> {
  window.__bench = { status: 'running', results: [] };
  try {
    for (const benchCase of cases) {
      for (const color of ['palette', 'full'] as const) {
        const render = createRenderer(benchCase.width, benchCase.height, benchCase.duration);
        const started = performance.now();
        const encoded = await exportApng({
          width: benchCase.width,
          height: benchCase.height,
          duration: benchCase.duration,
          fps: benchCase.fps,
          loop: { kind: 'once' },
          colorMode: color,
          includeDefaultImage: true,
          autoTrim: false,
          completedTime: benchCase.duration,
          render,
        });
        window.__bench.results.push({
          case: benchCase.name,
          color,
          width: benchCase.width,
          height: benchCase.height,
          fps: benchCase.fps,
          duration: benchCase.duration,
          milliseconds: Math.round(performance.now() - started),
          bytes: encoded.bytes.length,
          sourceFrames: encoded.sourceFrames,
          storedFrames: encoded.storedFrames,
        });
      }
    }
    window.__bench.status = 'complete';
  } catch (error) {
    window.__bench.status = 'error';
    window.__bench.error = error instanceof Error ? error.message : String(error);
  }
}

window.__bench = { status: 'idle', results: [] };
document.querySelector('#run')?.addEventListener('click', () => void runBench());
void runBench();

const output = document.querySelector('#output');
setInterval(() => {
  if (output !== null) output.textContent = JSON.stringify(window.__bench, null, 2);
}, 250);
