import { describe, expect, it } from 'vitest';
import { assertPixelFrameLimit, createFrameTimeline, loopNumPlays, MAX_PIXEL_FRAMES } from '../../src/core';

describe('EXP-01 frame timeline and guards', () => {
  it('uses the exact duration for the last frame', () => {
    const exact = createFrameTimeline(2, 24);
    expect(exact.count).toBe(48);
    expect(exact.times[47]).toBe(2);
    const fractional = createFrameTimeline(0.2, 12);
    expect(fractional.count).toBe(3);
    expect(fractional.times[2]).toBe(0.2);
  });

  it('rejects frame and pixel-frame excess', () => {
    expect(() => createFrameTimeline(31, 60)).toThrow(/1800/);
    expect(() => assertPixelFrameLimit(1, 1, MAX_PIXEL_FRAMES)).not.toThrow();
    expect(() => assertPixelFrameLimit(MAX_PIXEL_FRAMES + 1, 1, 1)).toThrow(/Pixel-frame/);
  });
});

describe('EXP-04 loop modes', () => {
  it('maps all modes and clamps custom counts', () => {
    expect(loopNumPlays({ kind: 'once' })).toBe(1);
    expect(loopNumPlays({ kind: 'forever' })).toBe(0);
    expect(loopNumPlays({ kind: 'count', count: 3 })).toBe(3);
    expect(loopNumPlays({ kind: 'count', count: 0 })).toBe(1);
    expect(loopNumPlays({ kind: 'count', count: 1000 })).toBe(999);
    expect(loopNumPlays({ kind: 'count', count: Number.NaN })).toBe(1);
  });
});
