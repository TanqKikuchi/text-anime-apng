import { describe, expect, it } from 'vitest';
import { ApngEncoder, exportApng, FrameAnalyzer } from '../../src/core';
import { decodeApng } from './helpers/apng-decoder';

describe('EXP-11 palette quantization', () => {
  it('uses transparent index zero and preserves up to 255 opaque colours losslessly', async () => {
    const rgba = new Uint8ClampedArray([
      0, 0, 0, 0,
      255, 0, 0, 255,
      0, 255, 0, 128,
      0, 0, 255, 255,
    ]);
    const analyzer = new FrameAnalyzer(4, 1, { palette: true, autoTrim: false });
    analyzer.addFrame(rgba);
    const palette = analyzer.finish().palette!;
    expect(palette.lossless).toBe(true);
    expect(palette.size).toBe(4);
    expect(palette.rgba.slice(0, 4)).toEqual(new Uint8Array([0, 0, 0, 0]));
    const encoder = new ApngEncoder({ width: 4, height: 1, fps: 12, loop: { kind: 'once' }, includeDefaultImage: false, palette });
    await encoder.addFrame(rgba);
    const decoded = decodeApng(encoder.finish().bytes);
    expect(decoded.frames[0]).toEqual(rgba);
    expect(decoded.chunks.map((chunk) => chunk.type)).toEqual(['IHDR', 'acTL', 'PLTE', 'tRNS', 'fcTL', 'IDAT', 'IEND']);
    expect(decoded.chunks.find((chunk) => chunk.type === 'PLTE')!.data.length).toBe(12);
    expect(decoded.chunks.find((chunk) => chunk.type === 'tRNS')!.data[0]).toBe(0);
  });

  it('takes the weighted median-cut path above 255 colours with low mean error', async () => {
    const width = 32;
    const height = 16;
    const rgba = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 4;
        rgba.set([x * 8, y * 16, (x * 11 + y * 7) & 255, 64 + ((x * 5 + y * 3) % 192)], offset);
      }
    }
    const analyzer = new FrameAnalyzer(width, height, { palette: true, autoTrim: false });
    analyzer.addFrame(rgba);
    const palette = analyzer.finish().palette!;
    expect(palette.lossless).toBe(false);
    expect(palette.size).toBeLessThanOrEqual(256);
    const encoder = new ApngEncoder({ width, height, fps: 12, loop: { kind: 'once' }, includeDefaultImage: false, palette });
    await encoder.addFrame(rgba);
    const decoded = decodeApng(encoder.finish().bytes).frames[0]!;
    let error = 0;
    for (let index = 0; index < rgba.length; index += 1) error += Math.abs(rgba[index]! - decoded[index]!);
    expect(error / rgba.length).toBeLessThan(8);
  });
});

describe('EXP-14/15 two-pass auto-trim', () => {
  it('unions motion bounds, adds two pixels, and encodes the common crop', async () => {
    const render = (time: number) => {
      const rgba = new Uint8ClampedArray(10 * 8 * 4);
      const x = time < 0.1 ? 3 : 6;
      rgba.set([200, 100, 50, 255], (3 * 10 + x) * 4);
      return rgba;
    };
    const result = await exportApng({
      width: 10,
      height: 8,
      duration: 0.2,
      fps: 12,
      loop: { kind: 'once' },
      colorMode: 'full',
      autoTrim: true,
      includeDefaultImage: false,
      completedTime: 0.2,
      render,
      yieldControl: async () => undefined,
    });
    expect(result.analysis.trimRect).toEqual({ x: 1, y: 1, width: 8, height: 5 });
    expect([result.width, result.height]).toEqual([8, 5]);
    const decoded = decodeApng(result.bytes);
    expect([decoded.width, decoded.height]).toEqual([8, 5]);
    expect(decoded.frames).toHaveLength(3);
  });

  it('does not trim an entirely transparent animation', async () => {
    const result = await exportApng({
      width: 4,
      height: 3,
      duration: 0.2,
      fps: 12,
      loop: { kind: 'once' },
      colorMode: 'full',
      autoTrim: true,
      includeDefaultImage: false,
      completedTime: 0.2,
      render: () => new Uint8ClampedArray(4 * 3 * 4),
      yieldControl: async () => undefined,
    });
    expect(result.analysis.trimmed).toBe(false);
    expect([result.width, result.height]).toEqual([4, 3]);
  });
});
