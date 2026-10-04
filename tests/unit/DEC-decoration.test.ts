import { describe, expect, it } from 'vitest';
import {
  backgroundPaint,
  computeCursor,
  computeFrame,
  decorationAnimation,
  decorationFrame,
  decorationProgress,
  decorationStrokeLayers,
  fillGradientLine,
  fillStops,
  GLITCH_EFFECTS,
  glowPasses,
  glyphPaint,
  gradientParameter,
  polylineLength,
  slicePolyline,
  tapeBlinkDarkness,
  textStylePlan,
  type DecorationPrimitive,
  type SceneModel,
} from '../../src/core';
import { model, scene } from './helpers/engine';

type Prim<T extends DecorationPrimitive['type']> = Extract<DecorationPrimitive, { type: T }>;

function decoAt(m: SceneModel, time?: number) {
  const page = m.layout.pages[0]!;
  const timeline = m.timeline.pages[0]!;
  return decorationFrame(m.scene, m.layout, page, timeline, time ?? timeline.displayEnd - 0.01);
}

const deco = (kind: string, extra: Record<string, unknown> = {}, patch: Record<string, unknown> = {}) =>
  model({ text: { main: 'あいう', mainFont: { size: 100 } }, layout: { autoShrink: false }, style: { decoration: { kind, padding: 0.4, lineWidth: 4, lineExtent: 0.8, ...extra } }, ...patch } as never);

describe('DEC-01 fill (solid / gradient)', () => {
  it('spaces 2 or 3 colours evenly', () => {
    expect(fillStops({ kind: 'gradient', colors: ['#000', '#fff', ''], direction: 'line-vertical', opacity: 1 }).map((s) => s.offset)).toEqual([0, 1]);
    expect(fillStops({ kind: 'gradient', colors: ['#000', '#888', '#fff'], direction: 'line-vertical', opacity: 1 }).map((s) => s.offset)).toEqual([0, 0.5, 1]);
  });

  it('horizontal (whole) gradient gives different colours at both ends of line 1', () => {
    const m = model({ text: { main: 'あいう\nえお' }, style: { fill: { kind: 'gradient', direction: 'block-horizontal' } } });
    const page = m.layout.pages[0]!;
    const glyphs = page.main.glyphs;
    const line = fillGradientLine(m.scene.style.fill, glyphs[0]!, page.box);
    expect(gradientParameter(line, glyphs[0]!.x, glyphs[0]!.y)).toBeLessThan(0.3);
    expect(gradientParameter(line, glyphs[2]!.x, glyphs[2]!.y)).toBeGreaterThan(0.7);
  });

  it('vertical (per line) gradient gives the same colour at the same position on each line', () => {
    const m = model({ text: { main: 'あ\nい' }, style: { fill: { kind: 'gradient', direction: 'line-vertical' } } });
    const [a, i] = m.layout.pages[0]!.main.glyphs;
    const page = m.layout.pages[0]!;
    const pa = gradientParameter(fillGradientLine(m.scene.style.fill, a!, page.box), a!.x, a!.y);
    const pi = gradientParameter(fillGradientLine(m.scene.style.fill, i!, page.box), i!.x, i!.y);
    expect(pa).toBeCloseTo(pi);
  });

  it('counter-rotates the gradient for rotated glyphs and uses the glyph frame in vertical writing', () => {
    const m = model({ text: { main: 'Aあ' }, layout: { writingMode: 'vertical' }, style: { fill: { kind: 'gradient', direction: 'line-vertical' } } });
    const page = m.layout.pages[0]!;
    const [latin, kana] = page.main.glyphs;
    const paint = glyphPaint(m.scene, latin!, page, latin!.rotation);
    expect(paint.kind).toBe('linear');
    if (paint.kind === 'linear') {
      // Under a 90° clockwise rotation local +x points down the screen, so top→bottom maps to +x.
      expect(paint.x1 - paint.x0).toBeGreaterThan(0);
      expect(Math.abs(paint.y1 - paint.y0)).toBeLessThan(1e-6);
    }
    expect(kana!.inkBottom - kana!.inkTop).toBeCloseTo(kana!.advance);
    expect(glyphPaint(scene(), latin!, page, 0)).toEqual({ kind: 'solid', color: '#FFFFFF' });
  });
});

describe('DEC-02 fill opacity', () => {
  it('passes the fill opacity to the style plan (strokes unaffected)', () => {
    const plan = textStylePlan(scene({ style: { fill: { opacity: 0 }, innerStroke: { enabled: true, width: 5 } } }), 1);
    expect(plan.fillOpacity).toBe(0);
    expect(plan.inner?.lineWidth).toBe(10);
  });
});

describe('DEC-03 inner stroke', () => {
  it('draws with lineWidth = 2 × width × f', () => {
    expect(textStylePlan(scene({ style: { innerStroke: { enabled: true, width: 10 } } }), 0.5).inner?.lineWidth).toBe(10);
    expect(textStylePlan(scene({ style: { innerStroke: { enabled: false } } }), 1).inner).toBeUndefined();
  });
});

describe('DEC-04 outer stroke', () => {
  it('draws with lineWidth = 2 × (inner + outer) so the band covers 5〜11 px', () => {
    const plan = textStylePlan(scene({ style: { innerStroke: { enabled: true, width: 5 }, outerStroke: { enabled: true, width: 6 } } }), 1);
    expect(plan.outer?.lineWidth).toBe(22);
    expect(plan.innerSilhouetteWidth).toBe(10);
    expect(plan.silhouetteWidth).toBe(22);
  });
});

describe('DEC-05 shadow', () => {
  it('scales blur and offsets by f and is disabled by the switch', () => {
    const plan = textStylePlan(scene({ style: { shadow: { enabled: true, blur: 12, offsetX: 4, offsetY: 10, opacity: 0.6 } } }), 0.5);
    expect(plan.shadow).toMatchObject({ blurPx: 6, dx: 2, dy: 5, opacity: 0.6 });
    expect(textStylePlan(scene({ style: { shadow: { enabled: false } } }), 1).shadow).toBeUndefined();
  });
});

describe('DEC-06 glow', () => {
  it('repeats the glow for strength > 1 (integer part at 1, fraction once)', () => {
    expect(glowPasses(1)).toEqual([1]);
    expect(glowPasses(2)).toEqual([1, 1]);
    expect(glowPasses(1.5)).toEqual([1, 0.5]);
    expect(glowPasses(0.3)).toEqual([0.3]);
    const plan = textStylePlan(scene({ style: { glow: { enabled: true, spread: 28, strength: 2 } } }), 0.5);
    expect(plan.glow?.spreadPx).toBe(14);
    expect(glowPasses(2).reduce((a, b) => a + b)).toBeGreaterThan(glowPasses(1).reduce((a, b) => a + b));
    expect(textStylePlan(scene({ style: { glow: { enabled: true, strength: 9 } } }), 1).glow?.strength).toBe(4);
  });
});

describe('DEC-07 sub text colour', () => {
  it('paints only the sub text with the solid sub colour', () => {
    const m = model({ text: { main: 'あ', sub: 'b' }, style: { subColorEnabled: true, subColor: '#00FF00', fill: { kind: 'gradient' } } });
    const page = m.layout.pages[0]!;
    expect(glyphPaint(m.scene, page.sub!.glyphs[0]!, page, 0)).toEqual({ kind: 'solid', color: '#00FF00' });
    expect(glyphPaint(m.scene, page.main.glyphs[0]!, page, 0).kind).toBe('linear');
    expect(scene({ mode: 'trailer', style: { subColorEnabled: true } }, 'trailer').style.subColorEnabled).toBe(false);
  });
});

describe('DEC-08 glitch colours', () => {
  it('lists the glitch-type effects that show the colour fields', () => {
    expect([...GLITCH_EFFECTS].sort()).toEqual(['FX-H08', 'FX-I22', 'FX-O17']);
    expect(scene().style.glitchColors).toHaveLength(2);
  });
});

describe('DEC-09 cursor colour', () => {
  it('falls back to fill colour 1 when empty', () => {
    const empty = model({ mode: 'trailer', text: { main: 'あい' }, style: { fill: { colors: ['#123456', '#000000'] }, cursorColor: '' }, motion: { trailer: { cursor: true } } }, 'trailer');
    expect(computeCursor(empty.scene, empty.timeline.pages[0]!, 0.3)?.color).toBe('#123456');
    const set = model({ mode: 'trailer', text: { main: 'あい' }, style: { cursorColor: '#FF0000' }, motion: { trailer: { cursor: true } } }, 'trailer');
    expect(computeCursor(set.scene, set.timeline.pages[0]!, 0.3)?.color).toBe('#FF0000');
  });
});

describe('DEC-10 band', () => {
  it('spans the canvas with thickness = text height + 2 pad, centred on the page box', () => {
    const m = deco('band');
    const band = decoAt(m)!.primitives[0] as Prim<'band'>;
    const box = m.layout.pages[0]!.box;
    expect(band).toMatchObject({ x: 0, width: 1280, lengthAxis: 'x', edgeBlur: 0.5, endFade: 0.3, opacity: 0.55 });
    expect(band.height).toBeCloseTo(box.height + 80);
    expect(band.y + band.height / 2).toBeCloseTo((box.top + box.bottom) / 2);
    const vertical = decoAt(deco('band', {}, { layout: { writingMode: 'vertical', autoShrink: false } }))!.primitives[0] as Prim<'band'>;
    expect(vertical).toMatchObject({ y: 0, height: 720, lengthAxis: 'y' });
  });
});

describe('DEC-11 hazard tape', () => {
  it('draws two striped tapes above and below that flow in opposite directions and blink', () => {
    const m = deco('hazard', { tapeWidth: 40, tapeSpeed: 90 });
    const box = m.layout.pages[0]!.box;
    const [top, bottom] = decoAt(m, 2)!.primitives as Prim<'tape'>[];
    expect(top!.y + top!.height).toBeCloseTo(box.top - 40);
    expect(bottom!.y).toBeCloseTo(box.bottom + 40);
    expect(top!.period).toBeCloseTo(52);
    expect(top!.stripeWidth).toBeCloseTo(26);
    expect(top!.skew).toBeCloseTo(40);
    const later = decoAt(m, 2.1)!.primitives as Prim<'tape'>[];
    expect(later[0]!.phase - top!.phase).toBeCloseTo(-9);
    expect(later[1]!.phase - bottom!.phase).toBeCloseTo(9);
    expect(tapeBlinkDarkness(0.4, 0.5)).toBeCloseTo(0.5);
    expect(tapeBlinkDarkness(0.1, 0.5)).toBe(0);
    expect(tapeBlinkDarkness(0.15, 0.5, 0.5)).toBeCloseTo(0.5);
    const page = m.timeline.pages[0]!;
    const sliding = decoAt(m, page.start + 0.1)!.primitives as Prim<'tape'>[];
    expect(sliding[0]!.x).toBeGreaterThan(0);
    expect(sliding[1]!.x).toBeLessThan(0);
  });
});

describe('DEC-12 box', () => {
  it('fills a rounded rectangle of page box + pad and grows horizontally', () => {
    const m = deco('box', { cornerRadius: 0.2 });
    const box = m.layout.pages[0]!.box;
    const rect = decoAt(m)!.primitives[0] as Prim<'rect'>;
    expect(rect.width).toBeCloseTo(box.width + 80);
    expect(rect.height).toBeCloseTo(box.height + 80);
    expect(rect.radius).toBeCloseTo(20);
    expect(decoAt(m)!.followsBlockScale).toBe(true);
    const early = decoAt(m, m.timeline.pages[0]!.start + 0.05)!.primitives[0] as Prim<'rect'>;
    expect(early.width).toBeLessThan(rect.width);
    expect(early.height).toBeCloseTo(rect.height);
    expect((decoAt(deco('box', { lineWidth: 0 }))!.primitives[0] as Prim<'rect'>).strokes).toBeUndefined();
  });
});

describe('DEC-13 title frame', () => {
  it('encloses the main text only, extends sideways and stops at the inset', () => {
    const m = deco('title-frame', { lineExtent: 1, fillOpacity: 0.3 }, { text: { main: 'あいう', sub: 'sub', mainFont: { size: 100 }, subGap: 0.3, subPosition: 'after' } });
    const page = m.layout.pages[0]!;
    const [fill, line] = decoAt(m)!.primitives as [Prim<'rect'>, Prim<'polyline'>];
    expect(fill.x).toBeCloseTo(page.main.box.left - 40 - 100);
    expect(fill.y + fill.height).toBeCloseTo(page.main.box.bottom + 15);
    expect(fill.y + fill.height).toBeLessThan(page.sub!.box.top);
    expect(line.points[0]).toEqual([fill.x, fill.y]);
    const wide = deco('title-frame', { lineExtent: 12 });
    const wideLine = decoAt(wide)!.primitives.find((p) => p.type === 'polyline') as Prim<'polyline'>;
    expect(Math.min(...wideLine.points.map((p) => p[0]))).toBeCloseTo(32);
    expect(Math.max(...wideLine.points.map((p) => p[0]))).toBeCloseTo(1280 - 32);
  });

  it('draws the outline clockwise as a growing one-stroke path', () => {
    const m = deco('title-frame', { fillOpacity: 0 });
    const page = m.timeline.pages[0]!;
    const full = decoAt(m)!.primitives[0] as Prim<'polyline'>;
    const half = decoAt(m, page.start + 0.06)!.primitives[0] as Prim<'polyline'>;
    expect(polylineLength(half.points)).toBeLessThan(polylineLength(full.points));
    expect(half.points[0]).toEqual(full.points[0]);
    expect(full.points[1]![1]).toBe(full.points[0]![1]);
  });
});

describe('DEC-14 top and bottom lines', () => {
  it('draws two lines of box length + 2 × line length, growing from the centre', () => {
    const m = deco('lines');
    const box = m.layout.pages[0]!.box;
    const [top, bottom] = decoAt(m)!.primitives as Prim<'polyline'>[];
    expect(polylineLength(top!.points)).toBeCloseTo(box.width + 160);
    expect(top!.points[0]![1]).toBeCloseTo(box.top - 40 - 2);
    expect(bottom!.points[0]![1]).toBeCloseTo(box.bottom + 40 + 2);
    const early = decoAt(m, m.timeline.pages[0]!.start + 0.05)!.primitives[0] as Prim<'polyline'>;
    expect(polylineLength(early.points)).toBeLessThan(polylineLength(top!.points));
    const v = decoAt(deco('lines', {}, { layout: { writingMode: 'vertical', autoShrink: false } }))!.primitives[0] as Prim<'polyline'>;
    expect(v.points[0]![0]).toBe(v.points[1]![0]);
  });
});

describe('DEC-15 underline', () => {
  it('sits pad below the main text, or between main and a lower sub, and draws left to right', () => {
    const m = deco('underline');
    const page = m.layout.pages[0]!;
    const line = decoAt(m)!.primitives[0] as Prim<'polyline'>;
    expect(line.points[0]![1]).toBeCloseTo(page.main.box.bottom + 40 + 2);
    expect(polylineLength(line.points)).toBeCloseTo(page.box.width + 160);
    const withSub = deco('underline', {}, { text: { main: 'あい', sub: 'sub', mainFont: { size: 100 } } });
    const sp = withSub.layout.pages[0]!;
    expect((decoAt(withSub)!.primitives[0] as Prim<'polyline'>).points[0]![1]).toBeCloseTo((sp.main.box.bottom + sp.sub!.box.top) / 2);
    const early = decoAt(m, m.timeline.pages[0]!.start + 0.05)!.primitives[0] as Prim<'polyline'>;
    expect(early.points[0]![0]).toBeCloseTo(line.points[0]![0]);
    expect(early.points[1]![0]).toBeLessThan(line.points[1]![0]);
    const page0 = m.timeline.pages[0]!;
    const leaving = decoAt(m, page0.decorationExitStart + 0.3)!.primitives[0] as Prim<'polyline'>;
    expect(leaving.points[0]![0]).toBeGreaterThan(line.points[0]![0]);
  });
});

describe('DEC-16 side lines', () => {
  it('draws short lines left and right of the main text, length max(0.2em, extent)', () => {
    const m = deco('side-lines', { lineExtent: 0.1 });
    const main = m.layout.pages[0]!.main.box;
    const [left, right] = decoAt(m)!.primitives as Prim<'polyline'>[];
    expect(polylineLength(left!.points)).toBeCloseTo(20);
    expect(left!.points[0]![0]).toBeCloseTo(main.left - 40);
    expect(right!.points[0]![0]).toBeCloseTo(main.right + 40);
    expect(left!.points[0]![1]).toBeCloseTo((main.top + main.bottom) / 2);
  });
});

describe('DEC-17 accent bar', () => {
  it('draws a vertical bar left of the box (vertical writing: horizontal bar above)', () => {
    const m = deco('accent-bar');
    const box = m.layout.pages[0]!.box;
    const bar = decoAt(m)!.primitives[0] as Prim<'polyline'>;
    expect(bar.points[0]![0]).toBeCloseTo(box.left - 40 - 2);
    expect(polylineLength(bar.points)).toBeCloseTo(box.height);
    const v = decoAt(deco('accent-bar', {}, { layout: { writingMode: 'vertical', autoShrink: false } }))!.primitives[0] as Prim<'polyline'>;
    expect(v.points[0]![1]).toBe(v.points[1]![1]);
  });
});

describe('DEC-18 corner brackets', () => {
  it('draws four L brackets with arms of 0.28 × the short side that move in while growing', () => {
    const m = deco('corners');
    const box = m.layout.pages[0]!.box;
    const prims = decoAt(m)!.primitives as Prim<'polyline'>[];
    expect(prims).toHaveLength(4);
    const arm = Math.min(box.width + 80, box.height + 80) * 0.28;
    expect(polylineLength(prims[0]!.points)).toBeCloseTo(2 * arm);
    expect(prims[0]!.points[1]).toEqual([box.left - 40, box.top - 40]);
    const early = decoAt(m, m.timeline.pages[0]!.start + 0.05)!.primitives[0] as Prim<'polyline'>;
    expect(early.points[1]![0]).toBeLessThan(box.left - 40);
  });
});

describe('DEC-19 decoration animation', () => {
  it('fade = partial alpha, grow = shorter shape with alpha clamp(4g), none = instant', () => {
    expect(decorationProgress('fade', 0.5, 0)).toMatchObject({ growth: 1, alpha: 1 - 0.5 ** 3 });
    const grow = decorationProgress('grow', 0.1, 0);
    expect(grow.growth).toBeLessThan(1);
    expect(grow.alpha).toBeCloseTo(Math.min(1, 4 * grow.growth));
    expect(decorationProgress('grow', 1, 0.5).exit).toBeCloseTo(0.125);
    expect(decorationProgress('none', 0.5, 0).alpha).toBe(0);
    expect(decorationProgress('none', 1, 0).alpha).toBe(1);
  });

  it('is independent of the block opacity and evaluated from the page timing', () => {
    const m = deco('box', { animation: 'fade' }, { motion: { enter: { id: 'FX-I18' } } });
    const page = m.timeline.pages[0]!;
    const mid = decorationAnimation(m.scene, page, page.start + page.decorationDuration / 2);
    expect(mid.alpha).toBeGreaterThan(0.5);
    expect(mid.alpha).toBeLessThan(1);
    const frame = computeFrame(m, page.characterStart);
    expect(frame.pages[0]!.block.a).toBe(0);
    expect(frame.pages[0]!.decoration!.alpha).toBeGreaterThan(0);
    const none = deco('box', { animation: 'none' });
    expect(decorationAnimation(none.scene, none.timeline.pages[0]!, none.timeline.pages[0]!.start).alpha).toBe(1);
  });
});

describe('DEC-20 text stroke on lines', () => {
  it('adds outer and inner outline layers with square caps', () => {
    const s = scene({ style: { innerStroke: { enabled: true, width: 5, color: '#111111' }, outerStroke: { enabled: true, width: 6, color: '#EEEEEE' }, decoration: { kind: 'underline', lineWidth: 3, lineUsesTextStroke: true } } });
    expect(decorationStrokeLayers(s, 1, true)).toEqual([
      { width: 3 + 22, color: '#EEEEEE', cap: 'square' },
      { width: 3 + 10, color: '#111111', cap: 'square' },
      { width: 3, color: s.style.decoration.lineColor, cap: 'butt' },
    ]);
    expect(decorationStrokeLayers(s, 1, false)).toHaveLength(1);
    const off = scene({ style: { innerStroke: { enabled: false }, outerStroke: { enabled: false }, decoration: { lineUsesTextStroke: true } } });
    expect(decorationStrokeLayers(off, 1, true)).toHaveLength(1);
  });

  it('slices polylines by length fraction', () => {
    expect(slicePolyline([[0, 0], [10, 0], [10, 10]], 0, 0.75)).toEqual([[0, 0], [10, 0], [10, 5]]);
    expect(slicePolyline([[0, 0], [10, 0]], 0.5, 0.5)).toEqual([]);
  });
});

describe('DEC-21 background', () => {
  it('describes solid / vignette / gradients at the effective opacity', () => {
    const solid = scene({ background: { kind: 'solid', opacity: 0.5, color: '#000000' } });
    expect(backgroundPaint(solid, 0.5)).toEqual({ kind: 'solid', color: '#000000', alpha: 0.5 });
    expect(Math.round(0.5 * 255)).toBe(128);
    expect(backgroundPaint(scene(), 1)).toBeUndefined();
    const v = backgroundPaint(scene({ background: { kind: 'vignette' } }), 0.45)!;
    expect(v).toMatchObject({ kind: 'radial', cx: 640, cy: 360, r0: 144, r1: Math.hypot(1280, 720) / 2 });
    expect(backgroundPaint(scene({ background: { kind: 'bottom-gradient' } }), 1)).toMatchObject({ y0: 720 * 0.45, y1: 720 });
    expect(backgroundPaint(scene({ background: { kind: 'top-gradient' } }), 1)).toMatchObject({ y0: 720 * 0.55, y1: 0 });
    const frame = computeFrame(model({ text: { main: 'あ' }, background: { kind: 'solid', opacity: 0.5, syncFade: false } }), 0);
    expect(frame.background).toMatchObject({ alpha: 0.5 });
  });
});
