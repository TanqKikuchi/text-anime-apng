import { describe, expect, it } from 'vitest';
import {
  applyBlockEnterEffect,
  applyBlockExitEffect,
  applyEnterEffect,
  applyExitEffect,
  applyHoldBlockEffect,
  applyHoldCharacterEffect,
  computeFrame,
  createBlockState,
  createGlitchPlan,
  createMiniPreviewScene,
  createSceneModel,
  createTransformState,
  CURVES,
  easing,
  ENTER_EFFECT_DEFAULTS,
  EXIT_EFFECT_DEFAULTS,
  listedEnterEffects,
  miniPreviewText,
  miniPreviewTimes,
  outCubic,
  resolveDirection,
  selectEnterEffect,
  selectExitEffect,
  wipeAlpha,
  wipeMaskStops,
  type BlockState,
  type EffectContext,
  type EnterEffectId,
  type ExitEffectId,
  type TransformState,
} from '../../src/core';
import { model, mono, scene } from './helpers/engine';

const S = 100;
const ctx = (progress: number, extra: Partial<EffectContext> = {}): EffectContext => ({ progress, size: S, seed: 12345, time: 0.5, lineOffset: 150, lineReach: 300, lineDisplayCount: 5, odd: true, ...extra });
const enter = (id: EnterEffectId, p: number, extra: Partial<EffectContext> = {}): TransformState => applyEnterEffect(id, createTransformState(), ctx(p, extra));
const exit = (id: ExitEffectId, p: number, extra: Partial<EffectContext> = {}): TransformState => applyExitEffect(id, createTransformState(), ctx(p, extra));
const blockEnter = (id: EnterEffectId, p: number, extra: Partial<EffectContext> = {}): BlockState => applyBlockEnterEffect(id, createBlockState(), ctx(p, extra));
const blockExit = (id: ExitEffectId, p: number, extra: Partial<EffectContext> = {}): BlockState => applyBlockExitEffect(id, createBlockState(), ctx(p, extra));

function expectIdentity(state: TransformState): void {
  expect(state.a).toBeCloseTo(1, 6);
  expect(state.x).toBeCloseTo(0, 6);
  expect(state.y).toBeCloseTo(0, 6);
  expect(state.s * state.sx).toBeCloseTo(1, 6);
  expect(state.s * state.sy).toBeCloseTo(1, 6);
  expect(state.rotation).toBeCloseTo(0, 6);
  expect(state.blur).toBeCloseTo(0, 6);
}

/** "Invisible" per FX acceptance: transparent, or collapsed to (almost) zero size. */
function expectHidden(state: TransformState): void {
  const collapsed = Math.abs(state.s * state.sx) < 0.01 || Math.abs(state.s * state.sy) < 0.01;
  expect(state.a < 0.01 || collapsed).toBe(true);
}

const charEnters = (Object.keys(ENTER_EFFECT_DEFAULTS) as EnterEffectId[]).filter((id) => ENTER_EFFECT_DEFAULTS[id].unit === 'character');
const blockEnters = (Object.keys(ENTER_EFFECT_DEFAULTS) as EnterEffectId[]).filter((id) => ENTER_EFFECT_DEFAULTS[id].unit === 'block');
const charExits = (Object.keys(EXIT_EFFECT_DEFAULTS) as ExitEffectId[]).filter((id) => EXIT_EFFECT_DEFAULTS[id].unit === 'character');
const blockExits = (Object.keys(EXIT_EFFECT_DEFAULTS) as ExitEffectId[]).filter((id) => EXIT_EFFECT_DEFAULTS[id].unit === 'block');

describe('FX-01 state model', () => {
  it('fade at p = 0.5 gives a = outCubic(0.5) = 0.875', () => {
    expect(enter('FX-I01', 0.5).a).toBeCloseTo(0.875);
  });

  it('multiplies glyph alpha by block alpha and culls ≤ 0.002', () => {
    const m = model({ text: { main: 'あ' }, motion: { enter: { id: 'FX-I18', duration: 1 } } });
    const page = m.timeline.pages[0]!;
    const frame = computeFrame(m, page.characterStart + 0.5);
    const glyph = frame.pages[0]!.glyphs[0]!;
    expect(glyph.alpha).toBeCloseTo(glyph.state.a * frame.pages[0]!.block.a);
    expect(computeFrame(m, page.characterStart).pages[0]!.drawText).toBe(false);
  });

  it('sums glyph and block blur', () => {
    const m = model({ text: { main: 'あ' }, motion: { enter: { id: 'FX-I08', duration: 1 } } });
    const page = m.timeline.pages[0]!;
    const g = computeFrame(m, page.characterStart + 0.5).pages[0]!.glyphs[0]!;
    expect(g.blur).toBeCloseTo((1 - outCubic(0.5)) * 0.28 * m.layout.fontSize);
  });
});

describe('FX-02 common parameters', () => {
  it('falls back to the first valid direction', () => {
    expect(resolveDirection(ENTER_EFFECT_DEFAULTS['FX-I20'], 'up')).toBe('left-to-right');
    expect(resolveDirection(ENTER_EFFECT_DEFAULTS['FX-I05'], 'up')).toBe('up');
    expect(resolveDirection(ENTER_EFFECT_DEFAULTS['FX-I21'], 'left')).toBe('vertical');
    expect(resolveDirection(ENTER_EFFECT_DEFAULTS['FX-I01'], 'left')).toBeUndefined();
  });

  it('hides strength for fade / typewriter / erase only and scales amplitudes by strength', () => {
    const noStrength = [...Object.entries(ENTER_EFFECT_DEFAULTS), ...Object.entries(EXIT_EFFECT_DEFAULTS)].filter(([, d]) => !d.hasStrength).map(([id]) => id).sort();
    expect(noStrength).toEqual(['FX-I01', 'FX-I15', 'FX-O01', 'FX-O11']);
    expect(enter('FX-I02', 0, { strength: 2 }).y).toBeCloseTo(2 * enter('FX-I02', 0).y);
  });

  it('derives r1, r2, r3 deterministically from the glyph seed', () => {
    expect(enter('FX-I14', 0.3)).toEqual(enter('FX-I14', 0.3));
    expect(enter('FX-I14', 0.3, { seed: 1 }).x).not.toBeCloseTo(enter('FX-I14', 0.3, { seed: 2 }).x, 3);
  });
});

describe('FX-03 effect card selection', () => {
  it('sets duration / stagger defaults, auto curve, strength 1 and a valid direction', () => {
    const base = scene({ motion: { enter: { id: 'FX-I05', direction: 'up', easing: 'linear', strength: 2 } } });
    const pop = selectEnterEffect(base, 'FX-I09').motion.enter;
    expect([pop.duration, pop.stagger, pop.easing, pop.strength]).toEqual([0.5, 0.07, 'auto', 1]);
    expect(selectEnterEffect(base, 'FX-I20').motion.enter.direction).toBe('left-to-right');
    expect(selectEnterEffect(base, 'FX-I18').motion.enter.stagger).toBe(0);
  });

  it('handles trailer typewriter duration and erase order', () => {
    const trailer = scene({ mode: 'trailer' }, 'trailer');
    const typed = selectEnterEffect(trailer, 'FX-I15');
    expect(typed.motion.trailer.characterDuration).toBe(0);
    expect(selectEnterEffect(typed, 'FX-I02').motion.trailer.characterDuration).toBe(0.4);
    expect(selectExitEffect(scene(), 'FX-O11').motion.exit.order).toBe('reverse');
    expect(selectExitEffect(scene(), 'FX-O13').motion.exit.stagger).toBe(0);
  });
});

describe('FX-04 mini preview', () => {
  it('builds a 320×180 horizontal fixed-style scene from the first three visible characters', () => {
    const source = scene({ text: { main: 'あ い\nうえお', mainFont: { family: 'Mine', weight: 900 } }, layout: { writingMode: 'vertical' }, style: { fill: { colors: ['#FF0000', '#00FF00'] } } });
    expect(miniPreviewText(source.text.main)).toBe('あいう');
    expect(miniPreviewText('  ')).toBe('文字');
    const preview = createMiniPreviewScene(source, 'enter', 'FX-I09');
    expect(preview.canvas).toMatchObject({ width: 320, height: 180 });
    expect(preview.layout.writingMode).toBe('horizontal');
    expect(preview.text.mainFont).toMatchObject({ family: 'Mine', weight: 900 });
    expect(preview.style.fill.colors[0]).toBe('#FFFFFF');
    expect(preview.motion.enter.id).toBe('FX-I09');
    expect(preview.motion.exit.id).toBe('FX-O01');
    const exitPreview = createMiniPreviewScene(source, 'exit', 'FX-O08');
    expect(exitPreview.motion.enter.id).toBe('FX-I01');
    expect(exitPreview.motion.exit.id).toBe('FX-O08');
  });

  it('uses 55 % of the enter section / 45 % of the exit section and loops at D + 0.25', () => {
    const m = createSceneModel(createMiniPreviewScene(scene(), 'enter', 'FX-I02'), mono);
    const page = m.timeline.pages[0]!;
    const times = miniPreviewTimes(m.timeline, 'enter');
    expect(times.still).toBeCloseTo(page.start + (page.enterComplete - page.start) * 0.55);
    expect(times.loopPeriod).toBeCloseTo(m.timeline.duration + 0.25);
    expect(miniPreviewTimes(m.timeline, 'exit').still).toBeCloseTo(page.displayEnd + (page.end - page.displayEnd) * 0.45);
  });

  it('hides block effects and FX-I07 from the trailer enter list', () => {
    expect(listedEnterEffects('message')).toHaveLength(23);
    const trailer = listedEnterEffects('trailer');
    expect(trailer).toHaveLength(15);
    expect(trailer).not.toContain('FX-I07');
    expect(trailer).not.toContain('FX-I17');
  });
});

describe('FX-E01 easing curves', () => {
  it('maps 0 → 0 and 1 → 1 for every curve; outBack overshoots', () => {
    for (const [name, fn] of Object.entries(CURVES)) {
      expect(fn(0), name).toBeCloseTo(0, 9);
      expect(fn(1), name).toBeCloseTo(1, 9);
    }
    const samples = Array.from({ length: 101 }, (_, i) => CURVES.outBack(i / 100));
    expect(Math.max(...samples)).toBeGreaterThan(1);
    expect(CURVES.inOutCubic(0.25)).toBeCloseTo(4 * 0.25 ** 3);
    expect(CURVES.outExpo(0.5)).toBeCloseTo(1 - 2 ** -5);
    expect(CURVES.inExpo(0.5)).toBeCloseTo(2 ** -5);
  });

  it('resolves "auto" to the effect default', () => {
    expect(easing('auto', 'outBounce')).toBe(CURVES.outBounce);
    expect(easing('linear', 'outBounce')).toBe(CURVES.linear);
    expect(ENTER_EFFECT_DEFAULTS['FX-I07'].easing).toBe('outQuart');
    expect(EXIT_EFFECT_DEFAULTS['FX-O16'].easing).toBe('inExpo');
  });
});

describe('FX-I01〜I16 per-character enter effects (common acceptance)', () => {
  for (const id of charEnters) {
    it(`${id}: identity at p = 1, hidden or off-state at p = 0, deterministic`, () => {
      expectIdentity(enter(id, 1));
      // FX-I16's formula gives a = 0.35 at p = 0 when the step random < 0.25, so only an upper bound applies.
      if (id === 'FX-I16') expect(enter(id, 0).a).toBeLessThanOrEqual(0.35);
      else if (id !== 'FX-I15') expectHidden(enter(id, 0));
      expect(enter(id, 0.37)).toEqual(enter(id, 0.37));
    });
  }
});

describe('FX-I per-effect values', () => {
  it('FX-I02/I03 rise from below / fall from above by 0.55S·k', () => {
    expect(enter('FX-I02', 0).y).toBeCloseTo(0.55 * S);
    expect(enter('FX-I03', 0).y).toBeCloseTo(-0.55 * S);
  });

  it('FX-I04 odd from below / even from above (vertical: odd from the left)', () => {
    expect(enter('FX-I04', 0, { odd: true }).y).toBeCloseTo(0.6 * S);
    expect(enter('FX-I04', 0, { odd: false }).y).toBeCloseTo(-0.6 * S);
    expect(enter('FX-I04', 0, { odd: true, vertical: true }).x).toBeCloseTo(-0.6 * S);
  });

  it('FX-I05 slides in from the chosen side', () => {
    expect(enter('FX-I05', 0, { direction: 'left' }).x).toBeCloseTo(-1.1 * S);
    expect(enter('FX-I05', 0, { direction: 'down' }).y).toBeCloseTo(1.1 * S);
    expect(enter('FX-I05', 0, { direction: 'center' }).x).toBeCloseTo(-1.1 * S);
  });

  it('FX-I06 starts at (1 + 1.6k) × the line offset', () => {
    expect(enter('FX-I06', 0).x).toBeCloseTo(150 * 1.6);
    expect(enter('FX-I06', 0, { vertical: true }).y).toBeCloseTo(150 * 1.6);
  });

  it('FX-I07 overlaps near the line centre, then spreads', () => {
    const early = enter('FX-I07', 0.3);
    const scatter = Math.min(0.2, (0.9 * S) / 300);
    expect(early.x).toBeCloseTo(-150 * (1 - scatter));
    expect(early.a).toBeCloseTo(Math.min(1, 1.8 / Math.sqrt(5)));
    expect(enter('FX-I07', 0.05).s).toBeGreaterThan(1);
  });

  it('FX-I08〜I13 values at p = 0', () => {
    expect(enter('FX-I08', 0).blur).toBeCloseTo(0.28 * S);
    expect(enter('FX-I09', 0).s).toBeCloseTo(0.001);
    expect(enter('FX-I09', 0.6).s).toBeGreaterThan(1);
    expect(enter('FX-I10', 0).s).toBeCloseTo(2.6);
    expect(enter('FX-I11', 0).rotation).toBeCloseTo(-0.8 * Math.PI);
    expect(enter('FX-I11', 0).s).toBeCloseTo(0.3);
    expect(enter('FX-I12', 0).sy).toBeCloseTo(0.001);
    expect(enter('FX-I12', 0, { vertical: true }).sx).toBeCloseTo(0.001);
    expect(enter('FX-I13', 0).y).toBeCloseTo(-1.3 * S);
  });

  it('FX-I14 gathers from a seeded direction and distance', () => {
    const state = enter('FX-I14', 0);
    const distance = Math.hypot(state.x, state.y);
    expect(distance).toBeGreaterThanOrEqual(1.4 * S - 1e-6);
    expect(distance).toBeLessThanOrEqual(3.2 * S + 1e-6);
  });

  it('FX-I15 typewriter has no transform; FX-I16 flickers in 16 steps', () => {
    expectIdentity(enter('FX-I15', 0));
    const values = Array.from({ length: 16 }, (_, i) => enter('FX-I16', (i + 0.5) / 16).a);
    expect(values.every((a) => a >= 0 && a <= 1)).toBe(true);
    expect(enter('FX-I16', 0.5, { seed: 7 })).toEqual(enter('FX-I16', 0.5, { seed: 7 }));
  });
});

describe('FX-I17〜I23 block enter effects (common acceptance)', () => {
  for (const id of blockEnters) {
    it(`${id}: identity at p = 1 (mask open, glitch 0)`, () => {
      const done = blockEnter(id, 1);
      expectIdentity(done);
      expect(done.mask).toBeUndefined();
      expect(done.glitch).toBeCloseTo(0);
      expect(done.bright).toBeCloseTo(0);
      expect(blockEnter(id, 0.4)).toEqual(blockEnter(id, 0.4));
    });
  }
});

describe('FX-I block per-effect values', () => {
  it('FX-I17 slams from 3.4× and flashes in the second half', () => {
    expect(blockEnter('FX-I17', 0).s).toBeCloseTo(3.4);
    expect(blockEnter('FX-I17', 0).a).toBe(0);
    expect(blockEnter('FX-I17', 0.4001).bright).toBeCloseTo(0.85, 2);
  });

  it('FX-I18 / I19 scale from large / small', () => {
    expect(blockEnter('FX-I18', 0).s).toBeCloseTo(1.9);
    expect(blockEnter('FX-I18', 0).blur).toBeCloseTo(0.1 * S);
    expect(blockEnter('FX-I19', 0).s).toBeCloseTo(0.4);
  });

  it('FX-I20 sets a wipe mask; FX-I21 unfolds on the chosen axis', () => {
    expect(blockEnter('FX-I20', 0.5, { direction: 'center' }).mask).toMatchObject({ direction: 'center', phase: 'enter' });
    expect(blockEnter('FX-I21', 0, { direction: 'horizontal' }).sx).toBeCloseTo(0.001);
    expect(blockEnter('FX-I21', 0).sy).toBeCloseTo(0.001);
  });

  it('FX-I22 glitches with amount (1 − p)k; FX-I23 flashes white with extra glow', () => {
    expect(blockEnter('FX-I22', 0.25).glitch).toBeCloseTo(0.75);
    expect(blockEnter('FX-I22', 0.9).a).toBe(1);
    const flash = blockEnter('FX-I23', 0);
    expect(flash.bright).toBeCloseTo(1);
    expect(flash.glowMultiplier).toBeCloseTo(2.5);
    expect(flash.a).toBe(0);
  });
});

describe('FX-O01〜O12 per-character exit effects (common acceptance)', () => {
  for (const id of charExits) {
    it(`${id}: identity at e = 0, invisible at e = 1`, () => {
      expectIdentity(exit(id, 0));
      expectHidden(exit(id, 1));
      expect(exit(id, 0.5)).toEqual(exit(id, 0.5));
    });
  }
});

describe('FX-O per-effect values', () => {
  it('FX-O02〜O10 values at e = 1', () => {
    expect(exit('FX-O02', 1).y).toBeCloseTo(-0.55 * S);
    expect(exit('FX-O03', 1).y).toBeCloseTo(0.55 * S);
    expect(exit('FX-O04', 1, { odd: false }).y).toBeCloseTo(-0.6 * S);
    expect(exit('FX-O05', 1, { direction: 'right' }).x).toBeCloseTo(1.1 * S);
    expect(exit('FX-O06', 1).x).toBeCloseTo(150 * 1.6);
    expect(exit('FX-O07', 1).blur).toBeCloseTo(0.28 * S);
    expect(exit('FX-O08', 1).s).toBeCloseTo(2.3);
    expect(exit('FX-O09', 1, { strength: 2 }).s).toBeCloseTo(0.05);
    expect(Math.hypot(exit('FX-O10', 1).x, exit('FX-O10', 1).y)).toBeGreaterThanOrEqual(1.4 * S - 1e-6);
  });

  it('FX-O12 is the reversed flicker with its own random series', () => {
    expect(exit('FX-O12', 0).a).toBe(1);
    const seq = Array.from({ length: 16 }, (_, i) => exit('FX-O12', (i + 0.5) / 16).a);
    expect(seq.every((a) => a >= 0 && a <= 1)).toBe(true);
  });
});

describe('FX-O13〜O17 block exit effects (common acceptance)', () => {
  for (const id of blockExits) {
    it(`${id}: identity at e = 0, invisible / closed at e = 1`, () => {
      const start = blockExit(id, 0);
      expectIdentity(start);
      expect(start.glitch).toBeCloseTo(0);
      const end = blockExit(id, 1);
      expectHidden(end);
    });
  }

  it('FX-O15 closes the wipe fully; FX-O16 collapses; FX-O17 glitch amount p·k', () => {
    const mask = blockExit('FX-O15', 1).mask!;
    for (const x of [0, 50, 100]) expect(wipeAlpha(mask, x, 0, 100, 10)).toBeCloseTo(0);
    expect(blockExit('FX-O16', 1, { direction: 'horizontal' }).sx).toBeCloseTo(0.001);
    expect(blockExit('FX-O17', 0.5).glitch).toBeCloseTo(0.5);
    expect(blockExit('FX-O13', 1).s).toBeCloseTo(1.9);
    expect(blockExit('FX-O14', 1).s).toBeCloseTo(0.4);
  });
});

describe('FX-H00〜H08 hold effects', () => {
  const holdBlock = (id: Parameters<typeof applyHoldBlockEffect>[0], time: number, strength = 1, enterComplete = 0) =>
    applyHoldBlockEffect(id, createBlockState(), { time, size: S, strength, seed: 3, enterComplete });

  it('FX-H00 does nothing', () => {
    expectIdentity(holdBlock('FX-H00', 1.3));
    expectIdentity(applyHoldCharacterEffect('FX-H00', createTransformState(), { time: 1, size: S, strength: 1 }));
  });

  it('FX-H01 floats: y = +0.05S·k at a quarter period (t = 0.65)', () => {
    expect(holdBlock('FX-H01', 0.65).y).toBeCloseTo(0.05 * S);
  });

  it('FX-H02 waves per character with a 0.6 phase step', () => {
    const a = applyHoldCharacterEffect('FX-H02', createTransformState(), { time: 0.4, size: S, strength: 1, displayIndex: 0 });
    expect(a.y).toBeCloseTo(0.07 * S);
    const b = applyHoldCharacterEffect('FX-H02', createTransformState(), { time: 0.4, size: S, strength: 1, displayIndex: 1 });
    expect(b.y).toBeCloseTo(Math.sin(Math.PI / 2 - 0.6) * 0.07 * S);
  });

  it('FX-H03 beats twice per 1.1 s', () => {
    expect(holdBlock('FX-H03', 0.1).s).toBeCloseTo(1 + 0.035 * (1 + 0.6 * Math.exp(-((0.2 / 0.06) ** 2))));
    expect(holdBlock('FX-H03', 1.2).s).toBeCloseTo(holdBlock('FX-H03', 0.1).s);
    expect(holdBlock('FX-H03', 0.7).s).toBeCloseTo(1, 4);
  });

  it('FX-H04 shakes within ±0.025S·k, changing 20 times per second', () => {
    const a = holdBlock('FX-H04', 0.51, 2);
    expect(Math.abs(a.x)).toBeLessThanOrEqual(0.05 * S);
    expect(holdBlock('FX-H04', 0.52, 2).x).toBe(a.x);
    expect(holdBlock('FX-H04', 0.56, 2).x).not.toBe(a.x);
  });

  it('FX-H05 modulates the glow multiplier', () => {
    expect(holdBlock('FX-H05', 0).glowMultiplier).toBeCloseTo(0.55);
    expect(holdBlock('FX-H05', 0.9).glowMultiplier).toBeCloseTo(1);
  });

  it('FX-H06 flickers the layer alpha deterministically', () => {
    const values = Array.from({ length: 120 }, (_, i) => holdBlock('FX-H06', i / 12, 3).layerAlpha);
    expect(values.some((v) => v < 1)).toBe(true);
    expect(values.every((v) => v === 1 || (v >= 0.2 && v <= 0.55))).toBe(true);
  });

  it('FX-H07 blinks from enter complete: 1 − 0.85k at +0.35 s', () => {
    expect(holdBlock('FX-H07', 1.35, 0.5, 1).layerAlpha).toBeCloseTo(0.575);
    expect(holdBlock('FX-H07', 1.1, 0.5, 1).layerAlpha).toBe(1);
    expect(holdBlock('FX-H07', 0.5, 0.5, 1).layerAlpha).toBe(1);
  });

  it('FX-H08 adds 0.55k glitch for the first 0.14 s of every 1.7 s', () => {
    expect(holdBlock('FX-H08', 1.75).glitch).toBeCloseTo(0.55);
    expect(holdBlock('FX-H08', 2).glitch).toBe(0);
  });
});

describe('FX-P01 wipe mask', () => {
  it('shows the left half at e = 0.5 for a left→right enter', () => {
    const mask = { direction: 'left-to-right' as const, progress: 0.5, phase: 'enter' as const };
    expect(wipeAlpha(mask, 10, 0, 1000, 1)).toBe(1);
    expect(wipeAlpha(mask, 400, 0, 1000, 1)).toBe(1);
    expect(wipeAlpha(mask, 600, 0, 1000, 1)).toBe(0);
    expect(wipeAlpha({ ...mask, direction: 'right-to-left' }, 600, 0, 1000, 1)).toBe(1);
  });

  it('hides the left side first on exit and opens from the centre', () => {
    const exitMask = { direction: 'left-to-right' as const, progress: 0.5, phase: 'exit' as const };
    expect(wipeAlpha(exitMask, 100, 0, 1000, 10)).toBe(0);
    expect(wipeAlpha(exitMask, 900, 0, 1000, 10)).toBe(1);
    const center = { direction: 'center' as const, progress: 0.5, phase: 'enter' as const };
    expect(wipeAlpha(center, 500, 0, 1000, 10)).toBe(1);
    expect(wipeAlpha(center, 0, 0, 1000, 10)).toBe(0);
  });

  it('converts the mask into exact gradient stops', () => {
    const mask = { direction: 'bottom-to-top' as const, progress: 0.3, phase: 'enter' as const };
    const { from, to, stops } = wipeMaskStops(mask, 100, 500, 40);
    for (const stop of stops) expect(stop.alpha).toBeCloseTo(wipeAlpha(mask, from + stop.offset * (to - from), 100, 500, 40));
    for (const x of [120, 300, 450]) {
      const offset = (x - from) / (to - from);
      const i = stops.findIndex((s) => s.offset >= offset);
      const a = stops[i - 1]!;
      const b = stops[i]!;
      const interpolated = a.alpha + ((b.alpha - a.alpha) * (offset - a.offset)) / (b.offset - a.offset);
      expect(interpolated).toBeCloseTo(wipeAlpha(mask, x, 100, 500, 40));
    }
  });

  it('uses the transformed page box grown by 0.25S along the wipe axis', () => {
    const m = model({ text: { main: 'あい' }, motion: { enter: { id: 'FX-I20', direction: 'left-to-right' } } });
    const page = m.timeline.pages[0]!;
    const wipe = computeFrame(m, page.characterStart + 0.3).pages[0]!.wipe!;
    const box = m.layout.pages[0]!.box;
    const S2 = m.layout.fontSize;
    expect(wipe.axis).toBe('x');
    expect(wipe.from).toBeCloseTo(box.left - 0.25 * S2 - 2 * 0.6 * S2);
  });
});

describe('FX-P02 glitch rendering plan', () => {
  it('is deterministic per 1/20 s bucket with 2〜6 slices', () => {
    const a = createGlitchPlan(1.01, 1, S, 0, 200, 9);
    expect(createGlitchPlan(1.04, 1, S, 0, 200, 9)).toEqual(a);
    expect(createGlitchPlan(1.06, 1, S, 0, 200, 9)).not.toEqual(a);
    expect(a.slices.length).toBeGreaterThanOrEqual(2);
    expect(a.slices.length).toBeLessThanOrEqual(6);
    expect(a.shift).toBeGreaterThanOrEqual(1);
    for (const slice of a.slices) {
      expect(slice.y).toBeGreaterThanOrEqual(0);
      expect(slice.y).toBeLessThanOrEqual(200);
      expect(Math.abs(slice.offsetX)).toBeLessThanOrEqual(0.25 * S);
    }
    expect(createGlitchPlan(0, 5, S, 0, 1).amount).toBe(2);
  });

  it('is attached to the frame when the block glitch exceeds 0.01', () => {
    const m = model({ text: { main: 'あ' }, motion: { enter: { id: 'FX-I22' } } });
    expect(computeFrame(m, m.timeline.pages[0]!.characterStart + 0.1).pages[0]!.glitch).toBeDefined();
    expect(computeFrame(m, m.timeline.completedTime + 0.2).pages[0]!.glitch).toBeUndefined();
  });
});

describe('FX-P03 white flash', () => {
  it('passes the block brightness to the frame', () => {
    const m = model({ text: { main: 'あ' }, motion: { enter: { id: 'FX-I23', duration: 0.8 } } });
    const page = m.timeline.pages[0]!;
    expect(computeFrame(m, page.characterStart + 0.05).pages[0]!.block.bright).toBeGreaterThan(0.5);
    expect(computeFrame(m, page.enterComplete + 0.01).pages[0]!.block.bright).toBe(0);
  });
});
