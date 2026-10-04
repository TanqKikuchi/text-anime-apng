import { describe, expect, it, vi } from 'vitest';
import { ApngEncoder, ExportCancelledError, exportApng } from '../../src/core';
import { decodeApng } from './helpers/apng-decoder';

function solid(width: number, height: number, rgba: readonly [number, number, number, number]): Uint8ClampedArray {
  const output = new Uint8ClampedArray(width * height * 4);
  for (let offset = 0; offset < output.length; offset += 4) output.set(rgba, offset);
  return output;
}

describe('EXP-07/08 difference rectangles and merging', () => {
  it('encodes the minimum changed rectangle and merges identical frames', async () => {
    const a = solid(5, 5, [0, 0, 0, 0]);
    const b = a.slice();
    for (const [x, y] of [[2, 1], [3, 1], [2, 2], [3, 2]]) b.set([20, 40, 60, 128], (y * 5 + x) * 4);
    const encoder = new ApngEncoder({ width: 5, height: 5, fps: 20, loop: { kind: 'once' }, includeDefaultImage: false });
    await encoder.addFrame(a);
    await encoder.addFrame(a);
    await encoder.addFrame(b);
    await encoder.addFrame(b);
    await encoder.addFrame(b);
    const result = encoder.finish();
    const decoded = decodeApng(result.bytes);
    expect(result).toMatchObject({ sourceFrames: 5, storedFrames: 2 });
    expect(decoded.controls.map((control) => control.delay)).toEqual([2, 3]);
    expect(decoded.controls[1]).toMatchObject({ x: 2, y: 1, width: 2, height: 2 });
    expect(decoded.frames).toEqual([a, a, b, b, b]);
  });

  it('detects a one-pixel alpha-only change', async () => {
    const a = solid(2, 2, [50, 50, 50, 100]);
    const b = a.slice();
    b[7] = 101;
    const encoder = new ApngEncoder({ width: 2, height: 2, fps: 12, loop: { kind: 'once' }, includeDefaultImage: false });
    await encoder.addFrame(a);
    await encoder.addFrame(b);
    const decoded = decodeApng(encoder.finish().bytes);
    expect(decoded.controls[1]).toMatchObject({ x: 1, y: 0, width: 1, height: 1 });
    expect(decoded.frames[1]).toEqual(b);
  });
});

describe('EXP-10/15/16 compression, progress and cancellation', () => {
  it('reports both passes and yields at the specified cadence', async () => {
    const progress: { phase: string; percent: number }[] = [];
    let yields = 0;
    const result = await exportApng({
      width: 2,
      height: 2,
      duration: 0.25,
      fps: 12,
      loop: { kind: 'once' },
      colorMode: 'palette',
      completedTime: 0.25,
      includeDefaultImage: false,
      render: (time) => solid(2, 2, [Math.round(time * 100), 0, 0, 255]),
      onProgress: ({ phase, percent }) => progress.push({ phase, percent }),
      yieldControl: async () => { yields += 1; },
    });
    expect(result.sourceFrames).toBe(3);
    expect(progress.some((entry) => entry.phase === 'analyze' && entry.percent === 40)).toBe(true);
    expect(progress.at(-1)).toEqual({ phase: 'encode', percent: 100 });
    expect(yields).toBe(3);
  });

  it('stops within the next frame boundary', async () => {
    const controller = new AbortController();
    let renders = 0;
    await expect(exportApng({
      width: 1,
      height: 1,
      duration: 0.5,
      fps: 12,
      loop: { kind: 'once' },
      colorMode: 'full',
      completedTime: 0.5,
      includeDefaultImage: false,
      signal: controller.signal,
      render: () => {
        renders += 1;
        if (renders === 2) controller.abort();
        return solid(1, 1, [renders, 0, 0, 255]);
      },
      yieldControl: async () => undefined,
    })).rejects.toBeInstanceOf(ExportCancelledError);
    expect(renders).toBe(2);
  });

  it('fails clearly when CompressionStream is unavailable', async () => {
    vi.stubGlobal('CompressionStream', undefined);
    const encoder = new ApngEncoder({ width: 1, height: 1, fps: 12, loop: { kind: 'once' }, includeDefaultImage: false });
    await expect(encoder.addFrame(solid(1, 1, [0, 0, 0, 0]))).rejects.toThrow(/CompressionStream/);
    vi.unstubAllGlobals();
  });
});
