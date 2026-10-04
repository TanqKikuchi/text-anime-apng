import { decorationFrame, type DecorationFrame } from './decoration';
import { lerp, clamp01 } from './easing';
import {
  applyBlockEnterEffect,
  applyBlockExitEffect,
  applyCenterSlam,
  applyEnterEffect,
  applyExitEffect,
  applyHoldBlockEffect,
  applyHoldCharacterEffect,
  applyTrailerExpand,
  centerGlyphScale,
  createBlockState,
  createGlitchPlan,
  createTransformState,
  wipeMaskStops,
  type BlockState,
  type GlitchPlan,
  type GradientStop,
  type TransformState,
} from './effects';
import { expandBox, layoutScene, makeBox, type Box, type LayoutGlyph, type PageLayout, type SceneLayout, type TextMeasurer } from './layout';
import { backgroundOpacity, createSceneTimeline, isPageActive, type GlyphTiming, type PageTimeline, type SceneTimeline } from './scene-timeline';
import { validateScene, type Scene, type ScenePatch } from './scene';
import { backgroundPaint, type BackgroundPaint } from './style';

/** A validated scene with its layout and timeline (compute once per scene change). */
export interface SceneModel {
  readonly scene: Scene;
  readonly layout: SceneLayout;
  readonly timeline: SceneTimeline;
  readonly measurer: TextMeasurer;
}

export function createSceneModel(input: Scene | ScenePatch, measurer: TextMeasurer): SceneModel {
  const scene = validateScene(input);
  const layout = layoutScene(scene, measurer);
  const timeline = createSceneTimeline(scene, layout);
  return { scene, layout, timeline, measurer };
}

export interface GlyphFrame {
  readonly glyph: LayoutGlyph;
  readonly state: TransformState;
  /** Final opacity = glyph a × block a. */
  readonly alpha: number;
  /** Total blur radius (glyph + block) in scene px. */
  readonly blur: number;
}

export interface CursorFrame {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly color: string;
}

export interface CenterGlyphFrame {
  readonly glyph: LayoutGlyph;
  readonly scale: number;
}

export interface WipeFrame {
  readonly axis: 'x' | 'y';
  readonly from: number;
  readonly to: number;
  readonly stops: readonly GradientStop[];
}

export interface PageFrame {
  readonly page: PageLayout;
  readonly timeline: PageTimeline;
  readonly block: BlockState;
  /** Block transform origin (page-box centre). */
  readonly origin: { readonly x: number; readonly y: number };
  readonly decoration?: DecorationFrame;
  /** False when the block opacity is ~0 (TL-20 3.3): only the decoration is drawn. */
  readonly drawText: boolean;
  readonly glyphs: readonly GlyphFrame[];
  readonly cursor?: CursorFrame;
  readonly center?: CenterGlyphFrame;
  readonly wipe?: WipeFrame;
  /** Scroll edge fade (TL-13): fade 14 % at both ends of the canvas along `axis`. */
  readonly edgeFade?: { readonly axis: 'x' | 'y'; readonly length: number };
  readonly glitch?: GlitchPlan;
}

export interface FrameState {
  readonly time: number;
  readonly background?: BackgroundPaint;
  readonly pages: readonly PageFrame[];
}

export interface FrameOptions {
  /** Device pixels per scene pixel (preview scale); used for the minimum wipe softness of 1 device px. */
  readonly pixelScale?: number;
}

const TEXT_ALPHA_EPSILON = 0.002;

/** Transformed (block-scaled and translated) page box. */
export function transformedBox(box: Box, block: BlockState): Box {
  const cx = (box.left + box.right) / 2;
  const cy = (box.top + box.bottom) / 2;
  const hw = (box.width / 2) * Math.abs(block.s * block.sx);
  const hh = (box.height / 2) * Math.abs(block.s * block.sy);
  return makeBox(cx + block.x - hw, cy + block.y - hh, cx + block.x + hw, cy + block.y + hh);
}

function pageSize(page: PageLayout, layout: SceneLayout): number {
  return page.main.glyphs[0]?.font.size ?? layout.fontSize;
}

/** FX-01 block state for a page at time t (enter → exit → hold → centre slam → scroll). */
export function computeBlockState(scene: Scene, layout: SceneLayout, page: PageLayout, timeline: PageTimeline, time: number): BlockState {
  const state = createBlockState();
  const S = pageSize(page, layout);
  const seed = scene.seed * 131 + page.index;
  const enter = timeline.blockEnter;
  if (enter) {
    if (time < enter.start) state.a = 0;
    else if (time < enter.start + enter.duration) {
      applyBlockEnterEffect(enter.id, state, { progress: (time - enter.start) / enter.duration, easing: enter.easing, strength: enter.strength, direction: enter.direction, size: S, time, seed });
    }
  }
  const exit = timeline.blockExit;
  if (exit && time >= exit.start) {
    const progress = (time - exit.start) / exit.duration;
    applyBlockExitEffect(exit.id, state, { progress, easing: exit.easing, strength: exit.strength, direction: exit.direction, size: S, time, seed });
    if (progress >= 1) state.a = 0;
  }
  applyHoldBlockEffect(scene.motion.hold.id, state, { time, size: S, strength: scene.motion.hold.strength, seed, enterComplete: timeline.enterComplete });
  if (timeline.center) {
    applyCenterSlam(state, time - timeline.center.revealStart, { impact: scene.motion.trailer.impact, room: timeline.center.room, size: S, seed, time });
  }
  if (timeline.scroll) {
    const progress = timeline.scroll.duration > 0 ? clamp01((time - timeline.characterStart) / timeline.scroll.duration) : 1;
    state.x += lerp(timeline.scroll.startX, timeline.scroll.endX, progress);
    state.y += lerp(timeline.scroll.startY, timeline.scroll.endY, progress);
  }
  return state;
}

/** FX-01 per-glyph state, or undefined when the glyph is not visible at time t. */
export function computeGlyphState(scene: Scene, page: PageLayout, timeline: PageTimeline, timing: GlyphTiming, time: number): TransformState | undefined {
  const glyph = timing.glyph;
  if (!glyph.drawable || time < timing.enterStart) return undefined;
  if (time >= timing.exitStart && (timing.exitDuration <= 0 || time >= timing.exitStart + timing.exitDuration)) return undefined;
  const state = createTransformState();
  const vertical = scene.layout.writingMode === 'vertical';
  const size = glyph.font.size;
  if (timeline.expand && glyph.group === 'main') {
    const center = vertical ? (page.box.top + page.box.bottom) / 2 : (page.box.left + page.box.right) / 2;
    applyTrailerExpand(state, time - timeline.characterStart, {
      overlapHold: timeline.expand.overlapHold,
      expandDuration: timeline.expand.expandDuration,
      lineDisplayCount: glyph.lineDisplayCount,
      lineReach: glyph.lineReach,
      size,
      towardCenter: center - (vertical ? glyph.y : glyph.x),
      vertical,
    });
  }
  const context = {
    size, time, seed: glyph.seed, displayIndex: glyph.displayIndex, odd: glyph.odd, vertical,
    lineOffset: glyph.lineOffset, lineReach: glyph.lineReach, lineDisplayCount: glyph.lineDisplayCount,
  };
  const enter = timing.enterEffect;
  if (enter && timing.enterDuration > 0 && time < timing.enterStart + timing.enterDuration) {
    applyEnterEffect(enter.id, state, { ...context, progress: (time - timing.enterStart) / timing.enterDuration, easing: enter.easing, strength: enter.strength, direction: enter.direction });
  }
  const exit = timing.exitEffect;
  if (exit && time >= timing.exitStart && timing.exitDuration > 0) {
    applyExitEffect(exit.id, state, { ...context, progress: (time - timing.exitStart) / timing.exitDuration, easing: exit.easing, strength: exit.strength, direction: exit.direction });
  }
  applyHoldCharacterEffect(scene.motion.hold.id, state, { time, size, strength: scene.motion.hold.strength, displayIndex: glyph.displayIndex });
  return state;
}

/** TL-08 typing cursor. */
export function computeCursor(scene: Scene, timeline: PageTimeline, time: number): CursorFrame | undefined {
  if (!timeline.cursor) return undefined;
  if (timeline.exitMode !== 'none' && time >= timeline.displayEnd) return undefined;
  const mains = timeline.glyphs.filter((timing) => timing.glyph.group === 'main');
  if (mains.length === 0) return undefined;
  if (time >= timeline.enterComplete && Math.floor((time - timeline.enterComplete) / 0.45) % 2 === 1) return undefined;
  let last: GlyphTiming | undefined;
  for (const timing of mains) if (timing.enterStart <= time) last = timing;
  const color = scene.style.cursorColor || scene.style.fill.colors[0];
  const reference = (last ?? mains[0]!).glyph;
  const S = reference.font.size;
  if (scene.layout.writingMode === 'vertical') {
    const width = 0.9 * S;
    const height = 0.08 * S;
    const y = last ? reference.y + reference.advance / 2 : reference.y - reference.advance / 2;
    return { x: reference.x - width / 2, y, width, height, color };
  }
  const width = 0.07 * S;
  const height = 0.98 * S;
  const x = last ? reference.x + reference.advance / 2 + 0.06 * S : reference.x - reference.advance / 2;
  return { x, y: reference.y - height / 2, width, height, color };
}

/** TL-09 big centre glyph during its beat. */
export function computeCenterGlyph(scene: Scene, timeline: PageTimeline, time: number, measurer: TextMeasurer): CenterGlyphFrame | undefined {
  const center = timeline.center;
  if (!center || time >= center.revealStart) return undefined;
  const beat = center.beats.find((entry) => time >= entry.start && time < entry.end);
  if (!beat) return undefined;
  const size = Math.min(scene.canvas.width, scene.canvas.height) * scene.motion.trailer.centerSize;
  const font = { ...beat.glyph.font, size };
  const metrics = measurer.measure(beat.glyph.text, font);
  const ascent = metrics.ascent ?? size * 0.8;
  const descent = metrics.descent ?? size * 0.12;
  const glyph: LayoutGlyph = {
    ...beat.glyph,
    font,
    x: scene.canvas.width / 2,
    y: scene.canvas.height / 2,
    advance: metrics.width,
    ascent: (ascent + descent) / 2,
    descent: (ascent + descent) / 2,
    baselineOffset: (ascent - descent) / 2,
    inkTop: scene.canvas.height / 2 - (ascent + descent) / 2,
    inkBottom: scene.canvas.height / 2 + (ascent + descent) / 2,
  };
  const p = (time - beat.start) / Math.max(1e-6, beat.end - beat.start);
  return { glyph, scale: centerGlyphScale(p, scene.motion.trailer.impact) };
}

function wipeFrame(page: PageLayout, block: BlockState, size: number, pixelScale: number): WipeFrame | undefined {
  const mask = block.mask;
  if (!mask) return undefined;
  const axis: 'x' | 'y' = mask.direction === 'top-to-bottom' || mask.direction === 'bottom-to-top' ? 'y' : 'x';
  const box = expandBox(transformedBox(page.box, block), 0.25 * size);
  const low = axis === 'x' ? box.left : box.top;
  const high = axis === 'x' ? box.right : box.bottom;
  const soft = Math.max(1 / Math.max(1e-6, pixelScale), 0.6 * size);
  const { from, to, stops } = wipeMaskStops(mask, low, high, soft);
  return { axis, from, to, stops };
}

/** Everything needed to draw one frame (TL-20), computed without any canvas. */
export function computeFrame(model: SceneModel, time: number, options: FrameOptions = {}): FrameState {
  const { scene, layout, timeline } = model;
  const pages: PageFrame[] = [];
  for (const page of layout.pages) {
    const pageTimeline = timeline.pages[page.index];
    if (!pageTimeline || !isPageActive(pageTimeline, time) || page.drawableCount === 0) continue;
    const S = pageSize(page, layout);
    const block = computeBlockState(scene, layout, page, pageTimeline, time);
    const decoration = decorationFrame(scene, layout, page, pageTimeline, time);
    const drawText = block.a > TEXT_ALPHA_EPSILON;
    const glyphs: GlyphFrame[] = [];
    if (drawText) {
      for (const timing of pageTimeline.glyphs) {
        const state = computeGlyphState(scene, page, pageTimeline, timing, time);
        if (!state) continue;
        const alpha = state.a * block.a;
        if (alpha <= TEXT_ALPHA_EPSILON) continue;
        glyphs.push({ glyph: timing.glyph, state, alpha, blur: state.blur + block.blur });
      }
    }
    const transformed = transformedBox(page.box, block);
    pages.push({
      page,
      timeline: pageTimeline,
      block,
      origin: { x: (page.box.left + page.box.right) / 2, y: (page.box.top + page.box.bottom) / 2 },
      decoration,
      drawText,
      glyphs,
      cursor: drawText ? computeCursor(scene, pageTimeline, time) : undefined,
      center: drawText ? computeCenterGlyph(scene, pageTimeline, time, model.measurer) : undefined,
      wipe: wipeFrame(page, block, S, options.pixelScale ?? 1),
      edgeFade: pageTimeline.scroll && scene.motion.trailer.edgeFade
        ? scene.layout.writingMode === 'horizontal' ? { axis: 'y', length: scene.canvas.height } : { axis: 'x', length: scene.canvas.width }
        : undefined,
      glitch: block.glitch > 0.01 ? createGlitchPlan(time, block.glitch, S, transformed.top, transformed.height, scene.seed * 131 + page.index) : undefined,
    });
  }
  return { time, background: backgroundPaint(scene, backgroundOpacity(scene, timeline, time)), pages };
}

/** TL-13 edge-fade alpha at a coordinate along the scroll axis (0 at the edges, 1 inside 14 %). */
export function edgeFadeAlpha(coordinate: number, length: number): number {
  const band = 0.14 * length;
  if (band <= 0) return 1;
  return Math.min(clamp01(coordinate / band), clamp01((length - coordinate) / band));
}
