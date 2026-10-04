import { describe, expect, it } from 'vitest';
import { MAX_MOV_BYTES, createDefaultScene, exportFilenames, frameCount, mergeScene, typicalMovBytes, validateScene } from '../../src/core';
import type { Scene } from '../../src/core';
import { applyTemplate, getTemplate } from '../../src/templates';
import { DICTIONARIES } from '../../src/ui/i18n';
import { checkMovLimits, movSizeEstimate } from '../../src/ui/exporter';
import { formatLargeSize } from '../../src/ui/format';
import { restoreState, serializeState } from '../../src/ui/persist';
import { createInitialState, withModeState } from '../../src/ui/state';

const sized = (width: number, height: number, fps: Scene['export']['fps'], movQuality: Scene['export']['movQuality'] = 'standard'): Scene =>
  mergeScene(createDefaultScene(), { canvas: { preset: 'custom', width, height }, export: { fps, movQuality } });

describe('MOV-02 video quality setting', () => {
  it('defaults to standard and rejects unknown values', () => {
    expect(createDefaultScene().export.movQuality).toBe('standard');
    expect(validateScene({ export: { movQuality: 'high' } }).export.movQuality).toBe('high');
    expect(validateScene({ export: { movQuality: 'ultra' as never } }).export.movQuality).toBe('standard');
  });

  it('is kept by templates and survives a save / restore round trip', () => {
    const base = sized(1280, 720, 24, 'high');
    expect(applyTemplate(base, getTemplate('msg-battle-clash')!).export.movQuality).toBe('high');
    const initial = createInitialState('ja');
    const state = withModeState(initial, 'message', { scene: { ...initial.modes.message.scene, export: { ...initial.modes.message.scene.export, movQuality: 'high' } } });
    expect(restoreState(serializeState(state), 'ja', () => true).modes.message.scene.export.movQuality).toBe('high');
  });
});

describe('MOV-03 video file name', () => {
  it('uses the .mov extension', () => {
    expect(exportFilenames('clip').mov).toBe('clip.mov');
  });
});

describe('MOV-04 size estimate and guards', () => {
  it('scales the measured 1280×360 / 30 fps / 3 s figures (≈ 8–11 MB) by pixels × frames', () => {
    const frames = frameCount(3, 30);
    expect(frames).toBe(90);
    const standard = typicalMovBytes(1280, 360, frames, 'standard') / 1e6;
    const high = typicalMovBytes(1280, 360, frames, 'high') / 1e6;
    expect(standard).toBeGreaterThan(7.5);
    expect(standard).toBeLessThan(9);
    expect(high).toBeGreaterThan(10);
    expect(high).toBeLessThan(11.5);
    const estimate = movSizeEstimate(sized(2560, 360, 30), 3);
    expect(estimate.frames).toBe(90);
    expect(estimate.typical).toBeCloseTo(typicalMovBytes(1280, 360, 90, 'standard') * 2, -4);
    expect(estimate.guard).toBeGreaterThan(estimate.typical);
    expect(estimate.low).toBeLessThan(estimate.typical);
  });

  it('stops jobs over the frame limit first, then jobs projected above 2 GB, then the pixel-frame limit', () => {
    expect(checkMovLimits(sized(1280, 360, 30), 3)).toBeNull();
    expect(checkMovLimits(sized(320, 180, 60), 31)).toEqual({ reason: 'frame-limit', frames: frameCount(31, 60) });
    const failure = checkMovLimits(sized(3840, 2160, 60), 12);
    expect(failure?.reason).toBe('size-limit');
    if (failure?.reason === 'size-limit') {
      expect(failure.max).toBe(MAX_MOV_BYTES);
      expect(failure.estimate).toBeGreaterThan(MAX_MOV_BYTES);
    }
    // 3840 × 2160 × 120 frames ≈ 1.0 G pixel-frames: under both limits.
    expect(checkMovLimits(sized(3840, 2160, 60), 2)).toBeNull();
    expect(checkMovLimits(sized(3840, 2160, 60), 4)).toEqual({ reason: 'work-limit' });
  });

  it('formats sizes of 1 GiB and more in GB', () => {
    expect(formatLargeSize(MAX_MOV_BYTES, 'ja')).toBe('2 GB');
    expect(formatLargeSize(1.5 * 1024 ** 3, 'en')).toBe('1.5 GB');
    expect(formatLargeSize(8.2 * 1024 * 1024, 'en')).toBe('8.20 MB');
  });
});

describe('MOV-07 strings', () => {
  it('has every video string in ja / en / ko', () => {
    for (const key of ['export.mov', 'export.movQuality', 'export.movHigh', 'export.movStandard', 'export.movHint', 'export.apngOnly', 'error.movSize', 'help.keynoteHeading'] as const) {
      for (const dictionary of Object.values(DICTIONARIES)) expect(dictionary[key].length, key).toBeGreaterThan(0);
    }
    expect(DICTIONARIES.ja['export.mov']).toBe('透過動画 (.mov・Keynote 用)');
    expect(DICTIONARIES.en['export.mov']).toBe('Transparent video (.mov, for Keynote)');
    expect(DICTIONARIES.ja['help.keynoteHeading']).toBe('Keynote で使う');
  });
});
