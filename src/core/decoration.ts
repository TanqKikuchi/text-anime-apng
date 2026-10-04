import { clamp01, lerp } from './easing';
import { decorationProgress, tapeBlinkDarkness } from './effects';
import { expandBox, type Box, type PageLayout, type SceneLayout } from './layout';
import type { PageTimeline } from './scene-timeline';
import type { Scene } from './scene';

export type Point = readonly [number, number];

export interface StrokeLayer {
  readonly width: number;
  readonly color: string;
  readonly cap: 'butt' | 'square';
}

export type DecorationPrimitive =
  | { readonly type: 'band'; readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly lengthAxis: 'x' | 'y'; readonly color: string; readonly opacity: number; readonly edgeBlur: number; readonly endFade: number }
  | { readonly type: 'tape'; readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly lengthAxis: 'x' | 'y'; readonly color: string; readonly stripeColor: string; readonly period: number; readonly stripeWidth: number; readonly skew: number; readonly phase: number; readonly darkness: number }
  | { readonly type: 'rect'; readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly radius: number; readonly fill?: { readonly color: string; readonly opacity: number }; readonly strokes?: readonly StrokeLayer[] }
  | { readonly type: 'polyline'; readonly points: readonly Point[]; readonly strokes: readonly StrokeLayer[] };

export interface DecorationFrame {
  readonly alpha: number;
  /** Only the box follows the block scale (TL-20); all decorations follow the block translation. */
  readonly followsBlockScale: boolean;
  readonly primitives: readonly DecorationPrimitive[];
}

export interface DecorationAnimation {
  readonly growth: number;
  readonly alpha: number;
  /** Eased enter progress (outCubic). */
  readonly enter: number;
  /** Eased exit progress (inCubic). */
  readonly exit: number;
}

/** TL-15 / DEC-19 decoration animation state of a page at time t. */
export function decorationAnimation(scene: Scene, page: PageTimeline, time: number): DecorationAnimation {
  const animation = scene.style.decoration.animation;
  if (animation === 'none' || page.decorationDuration <= 0) {
    const visible = time >= page.start && time < page.decorationExitStart;
    const on = visible ? 1 : 0;
    return { growth: on, alpha: on, enter: time >= page.start ? 1 : 0, exit: time >= page.decorationExitStart ? 1 : 0 };
  }
  const duration = page.decorationDuration;
  const enterP = clamp01((time - page.start) / duration);
  const exitP = Number.isFinite(page.decorationExitStart) ? clamp01((time - page.decorationExitStart) / duration) : 0;
  return decorationProgress(animation, enterP, exitP);
}

/** Total length of a polyline. */
export function polylineLength(points: readonly Point[]): number {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += Math.hypot(points[index]![0] - points[index - 1]![0], points[index]![1] - points[index - 1]![1]);
  }
  return total;
}

/** Sub-path covering the fraction [from, to] of the polyline length. */
export function slicePolyline(points: readonly Point[], from: number, to: number): Point[] {
  const total = polylineLength(points);
  if (points.length < 2 || total <= 0) return [];
  const a = clamp01(from) * total;
  const b = clamp01(to) * total;
  if (b <= a) return [];
  const result: Point[] = [];
  let walked = 0;
  for (let index = 1; index < points.length; index += 1) {
    const p0 = points[index - 1]!;
    const p1 = points[index]!;
    const length = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    const segStart = walked;
    const segEnd = walked + length;
    walked = segEnd;
    if (segEnd < a || segStart > b || length === 0) continue;
    const at = (distance: number): Point => {
      const t = clamp01((distance - segStart) / length);
      return [lerp(p0[0], p1[0], t), lerp(p0[1], p1[1], t)];
    };
    if (result.length === 0) result.push(at(Math.max(a, segStart)));
    result.push(at(Math.min(b, segEnd)));
  }
  return result;
}

/** DEC-20: optional text-stroke outline layers under a decoration line, then the line itself. */
export function decorationStrokeLayers(scene: Scene, scale: number, withTextStroke: boolean): StrokeLayer[] {
  const decoration = scene.style.decoration;
  const th = Math.max(0.5, decoration.lineWidth * scale);
  const layers: StrokeLayer[] = [];
  const inner = scene.style.innerStroke.enabled ? scene.style.innerStroke.width * scale : 0;
  const outer = scene.style.outerStroke.enabled ? scene.style.outerStroke.width * scale : 0;
  if (withTextStroke && decoration.lineUsesTextStroke && inner + outer > 0) {
    if (outer > 0) layers.push({ width: th + 2 * (inner + outer), color: scene.style.outerStroke.color, cap: 'square' });
    if (inner > 0) layers.push({ width: th + 2 * inner, color: scene.style.innerStroke.color, cap: 'square' });
  }
  layers.push({ width: th, color: decoration.lineColor, cap: 'butt' });
  return layers;
}

function segment(a: Point, b: Point, strokes: readonly StrokeLayer[]): DecorationPrimitive {
  return { type: 'polyline', points: [a, b], strokes };
}

function centerOf(box: Box): Point {
  return [(box.left + box.right) / 2, (box.top + box.bottom) / 2];
}

/**
 * DEC-10〜18 geometry of the page decoration in canvas coordinates (before the block translation).
 * Returns undefined when nothing is visible.
 */
export function decorationFrame(scene: Scene, layout: SceneLayout, page: PageLayout, timeline: PageTimeline, time: number): DecorationFrame | undefined {
  const decoration = scene.style.decoration;
  if (decoration.kind === 'none') return undefined;
  const anim = decorationAnimation(scene, timeline, time);
  if (anim.alpha <= 0.002) return undefined;
  const animatedGrow = decoration.animation === 'grow';
  const g = animatedGrow ? anim.growth : 1;
  const S = layout.fontSize;
  const f = layout.scale;
  const pad = decoration.padding * S;
  const vertical = scene.layout.writingMode === 'vertical';
  const box = page.box;
  const main = page.main.box;
  const { width: W, height: H } = scene.canvas;
  const lineWidth = Math.max(0.5, decoration.lineWidth * f);
  const ext = decoration.lineExtent * S;
  const strokes = decorationStrokeLayers(scene, f, true);
  const primitives: DecorationPrimitive[] = [];
  const [cx, cy] = centerOf(box);

  switch (decoration.kind) {
    case 'band': {
      if (vertical) {
        const thickness = (box.width + 2 * pad) * g;
        primitives.push({ type: 'band', x: cx - thickness / 2, y: 0, width: thickness, height: H, lengthAxis: 'y', color: decoration.fillColor, opacity: decoration.fillOpacity, edgeBlur: decoration.bandEdgeBlur, endFade: decoration.bandEndFade });
      } else {
        const thickness = (box.height + 2 * pad) * g;
        primitives.push({ type: 'band', x: 0, y: cy - thickness / 2, width: W, height: thickness, lengthAxis: 'x', color: decoration.fillColor, opacity: decoration.fillOpacity, edgeBlur: decoration.bandEdgeBlur, endFade: decoration.bandEndFade });
      }
      break;
    }
    case 'hazard': {
      const tw = decoration.tapeWidth * f;
      const period = 1.3 * tw;
      const flow = decoration.tapeSpeed * time;
      const length = vertical ? H : W;
      // Tape 1 (top / right) flows towards −axis and slides in from the +axis end; tape 2 is mirrored.
      const slide1 = animatedGrow ? length * (1 - anim.enter) - length * anim.exit : 0;
      const slide2 = animatedGrow ? -length * (1 - anim.enter) + length * anim.exit : 0;
      const common = { type: 'tape' as const, color: decoration.tapeColor, stripeColor: decoration.tapeStripeColor, period, stripeWidth: period / 2, skew: tw };
      if (vertical) {
        primitives.push({ ...common, x: box.right + pad, y: slide1, width: tw, height: H, lengthAxis: 'y', phase: -flow + slide1, darkness: tapeBlinkDarkness(time, decoration.tapeBlink, 0) });
        primitives.push({ ...common, x: box.left - pad - tw, y: slide2, width: tw, height: H, lengthAxis: 'y', phase: flow + slide2, darkness: tapeBlinkDarkness(time, decoration.tapeBlink, 0.5) });
      } else {
        primitives.push({ ...common, x: slide1, y: box.top - pad - tw, width: W, height: tw, lengthAxis: 'x', phase: -flow + slide1, darkness: tapeBlinkDarkness(time, decoration.tapeBlink, 0) });
        primitives.push({ ...common, x: slide2, y: box.bottom + pad, width: W, height: tw, lengthAxis: 'x', phase: flow + slide2, darkness: tapeBlinkDarkness(time, decoration.tapeBlink, 0.5) });
      }
      break;
    }
    case 'box': {
      const outer = expandBox(box, pad);
      const width = vertical ? outer.width : outer.width * g;
      const height = vertical ? outer.height * g : outer.height;
      const radius = Math.max(0, Math.min(decoration.cornerRadius * S, width / 2, height / 2));
      primitives.push({
        type: 'rect', x: cx - width / 2, y: cy - height / 2, width, height, radius,
        fill: { color: decoration.fillColor, opacity: decoration.fillOpacity },
        strokes: decoration.lineWidth > 0 ? decorationStrokeLayers(scene, f, false) : undefined,
      });
      break;
    }
    case 'title-frame': {
      const gap = scene.text.subGap * S;
      const subPad = page.sub ? Math.min(pad, gap / 2) : pad;
      const before = page.sub !== undefined && scene.text.subPosition === 'before';
      const after = page.sub !== undefined && scene.text.subPosition === 'after';
      let left: number;
      let right: number;
      let top: number;
      let bottom: number;
      if (vertical) {
        const inset = Math.max(lineWidth, scene.layout.marginY * 0.5);
        right = main.right + (before ? subPad : pad);
        left = main.left - (after ? subPad : pad);
        top = Math.max(inset, main.top - pad - ext);
        bottom = Math.min(H - inset, main.bottom + pad + ext);
      } else {
        const inset = Math.max(lineWidth, scene.layout.marginX * 0.5);
        top = main.top - (before ? subPad : pad);
        bottom = main.bottom + (after ? subPad : pad);
        left = Math.max(inset, main.left - pad - ext);
        right = Math.min(W - inset, main.right + pad + ext);
      }
      if (decoration.fillOpacity > 0) {
        primitives.push({ type: 'rect', x: left, y: top, width: right - left, height: bottom - top, radius: 0, fill: { color: decoration.fillColor, opacity: decoration.fillOpacity * (animatedGrow ? clamp01(1.5 * g) : 1) } });
      }
      if (decoration.lineWidth > 0) {
        const path: Point[] = vertical
          ? [[right, top], [right, bottom], [left, bottom], [left, top], [right, top]]
          : [[left, top], [right, top], [right, bottom], [left, bottom], [left, top]];
        const points = g >= 1 ? path : slicePolyline(path, 0, g);
        if (points.length >= 2) primitives.push({ type: 'polyline', points, strokes });
      }
      break;
    }
    case 'lines': {
      if (vertical) {
        const half = (box.height / 2 + ext) * g;
        const x1 = box.left - pad - lineWidth / 2;
        const x2 = box.right + pad + lineWidth / 2;
        primitives.push(segment([x1, cy - half], [x1, cy + half], strokes), segment([x2, cy - half], [x2, cy + half], strokes));
      } else {
        const half = (box.width / 2 + ext) * g;
        const y1 = box.top - pad - lineWidth / 2;
        const y2 = box.bottom + pad + lineWidth / 2;
        primitives.push(segment([cx - half, y1], [cx + half, y1], strokes), segment([cx - half, y2], [cx + half, y2], strokes));
      }
      break;
    }
    case 'underline': {
      const subAfter = page.sub !== undefined && scene.text.subPosition === 'after';
      const from = animatedGrow ? anim.exit : 0;
      const to = animatedGrow ? anim.enter : 1;
      if (to <= from) break;
      if (vertical) {
        const x = subAfter ? (main.left + page.sub!.box.right) / 2 : main.left - pad - lineWidth / 2;
        const y0 = box.top - ext;
        const y1 = box.bottom + ext;
        primitives.push(segment([x, lerp(y0, y1, from)], [x, lerp(y0, y1, to)], strokes));
      } else {
        const y = subAfter ? (main.bottom + page.sub!.box.top) / 2 : main.bottom + pad + lineWidth / 2;
        const x0 = box.left - ext;
        const x1 = box.right + ext;
        primitives.push(segment([lerp(x0, x1, from), y], [lerp(x0, x1, to), y], strokes));
      }
      break;
    }
    case 'side-lines': {
      const length = Math.max(0.2 * S, ext) * g;
      const [mx, my] = centerOf(main);
      if (length <= 0) break;
      if (vertical) {
        primitives.push(segment([mx, main.top - pad], [mx, main.top - pad - length], strokes), segment([mx, main.bottom + pad], [mx, main.bottom + pad + length], strokes));
      } else {
        primitives.push(segment([main.left - pad, my], [main.left - pad - length, my], strokes), segment([main.right + pad, my], [main.right + pad + length, my], strokes));
      }
      break;
    }
    case 'accent-bar': {
      if (g <= 0) break;
      if (vertical) {
        const y = box.top - pad - lineWidth / 2;
        primitives.push(segment([box.right, y], [lerp(box.right, box.left, g), y], strokes));
      } else {
        const x = box.left - pad - lineWidth / 2;
        primitives.push(segment([x, box.top], [x, lerp(box.top, box.bottom, g)], strokes));
      }
      break;
    }
    case 'corners': {
      const final = expandBox(box, pad);
      const arm = Math.min(final.width, final.height) * 0.28 * g;
      if (arm <= 0) break;
      const r = expandBox(box, pad + (1 - g) * 0.4 * S);
      primitives.push(
        { type: 'polyline', points: [[r.left, r.top + arm], [r.left, r.top], [r.left + arm, r.top]], strokes },
        { type: 'polyline', points: [[r.right - arm, r.top], [r.right, r.top], [r.right, r.top + arm]], strokes },
        { type: 'polyline', points: [[r.right, r.bottom - arm], [r.right, r.bottom], [r.right - arm, r.bottom]], strokes },
        { type: 'polyline', points: [[r.left + arm, r.bottom], [r.left, r.bottom], [r.left, r.bottom - arm]], strokes },
      );
      break;
    }
    default:
      break;
  }
  if (primitives.length === 0) return undefined;
  return { alpha: anim.alpha, followsBlockScale: decoration.kind === 'box', primitives };
}
