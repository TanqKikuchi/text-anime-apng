import type { EasingId } from './easing';
import { ENTER_EFFECT_DEFAULTS, EXIT_EFFECT_DEFAULTS, isTrailerEnterAllowed, subEnterPlan } from './effects';
import type { LayoutGlyph, PageLayout, SceneLayout } from './layout';
import { deterministicShuffle, hashIntegers } from './random';
import type { Direction, EnterEffectId, ExitEffectId, Scene, StaggerOrder } from './scene';

/** Parameters of a per-character (or block) effect as applied at render time. */
export interface AppliedEffect<T extends string> {
  readonly id: T;
  readonly easing: EasingId;
  readonly strength: number;
  readonly direction: Direction;
}

export interface GlyphTiming {
  readonly glyph: LayoutGlyph;
  readonly enterStart: number;
  readonly enterDuration: number;
  readonly exitStart: number;
  readonly exitDuration: number;
  /** Per-character enter effect; undefined = appears without a per-character transform. */
  readonly enterEffect?: AppliedEffect<EnterEffectId>;
  /** Per-character exit effect; undefined = no per-character exit transform. */
  readonly exitEffect?: AppliedEffect<ExitEffectId>;
}

export interface BlockPhase<T extends string> extends AppliedEffect<T> {
  readonly start: number;
  readonly duration: number;
}

export interface CenterBeat {
  readonly glyph: LayoutGlyph;
  readonly start: number;
  readonly end: number;
}

export interface PageTimeline {
  readonly index: number;
  readonly start: number;
  readonly decorationEnterEnd: number;
  readonly characterStart: number;
  readonly enterComplete: number;
  readonly displayEnd: number;
  /** ∞ when the page never exits (last page with exit off). */
  readonly exitComplete: number;
  /** ∞ when decorations never leave. */
  readonly decorationExitStart: number;
  /** Decoration animation time (0 when the decoration animation is "none"). */
  readonly decorationDuration: number;
  /** Finite end used for chaining pages / total duration (display end for a persistent page). */
  readonly end: number;
  /** 'effect' = exit animation, 'instant' = vanish at display end, 'none' = stays forever. */
  readonly exitMode: 'effect' | 'instant' | 'none';
  readonly persistent: boolean;
  readonly glyphs: readonly GlyphTiming[];
  readonly blockEnter?: BlockPhase<EnterEffectId>;
  readonly blockExit?: BlockPhase<ExitEffectId>;
  readonly scroll?: { readonly startX: number; readonly startY: number; readonly endX: number; readonly endY: number; readonly duration: number };
  readonly center?: { readonly beat: number; readonly beats: readonly CenterBeat[]; readonly revealStart: number; readonly room: number };
  readonly expand?: { readonly overlapHold: number; readonly expandDuration: number };
  /** Trailer typing cursor enabled for this page (TL-08). */
  readonly cursor: boolean;
}

export interface SceneTimeline {
  readonly pages: readonly PageTimeline[];
  /** Total duration D (TL-01). */
  readonly duration: number;
  /** Completed time (TL-01): still PNG, default image, paused edit view. */
  readonly completedTime: number;
  readonly backgroundFadeStart: number;
  readonly backgroundFadeDuration: number;
  /** ∞ when the background never fades out. */
  readonly backgroundFadeOutStart: number;
}

/** TL-03 stagger ranks. `seed` only affects 'random'. */
export function staggerRanks(length: number, order: StaggerOrder, seed = 0): number[] {
  if (length <= 0) return [];
  const center = (length - 1) / 2;
  if (order === 'forward') return Array.from({ length }, (_, index) => index);
  if (order === 'reverse') return Array.from({ length }, (_, index) => length - 1 - index);
  if (order === 'center') return Array.from({ length }, (_, index) => Math.floor(Math.abs(index - center)));
  if (order === 'edges') return Array.from({ length }, (_, index) => Math.floor(center) - Math.floor(Math.abs(index - center)));
  return deterministicShuffle(length, seed);
}

const LONG_PAUSE = /^[。．.！？!?…‥―]$/u;
const SHORT_PAUSE = /^[、，,・]$/u;

/** TL-08 extra delay after a character. */
export function punctuationDelay(text: string, amount: number): number {
  if (LONG_PAUSE.test(text)) return amount;
  if (SHORT_PAUSE.test(text)) return amount * 0.5;
  return 0;
}

interface Slot {
  start: number;
  duration: number;
  effect?: AppliedEffect<EnterEffectId>;
}

function rankSeed(scene: Scene, pageIndex: number, group: number, phase: number): number {
  return hashIntegers(pageIndex + 1, group + 1, phase + scene.seed * 7);
}

function applied<T extends string>(id: T, settings: { easing: EasingId; strength: number; direction: Direction }): AppliedEffect<T> {
  return { id, easing: settings.easing, strength: settings.strength, direction: settings.direction };
}

export function isDecorationAnimated(scene: Scene): boolean {
  return scene.style.decoration.kind !== 'none' && scene.style.decoration.animation !== 'none';
}

/** TL-15: band / tape / title frame / box appear before the text. */
export function decorationLeads(scene: Scene): boolean {
  return ['band', 'hazard', 'title-frame', 'box'].includes(scene.style.decoration.kind);
}

/** TL-16 fade duration. */
export function backgroundFadeDuration(scene: Scene): number {
  return Math.max(0.3, isDecorationAnimated(scene) ? scene.style.decoration.duration : 0.4);
}

function trailerEnterId(scene: Scene): EnterEffectId {
  return isTrailerEnterAllowed(scene.motion.enter.id) ? scene.motion.enter.id : 'FX-I01';
}

function messageMainSlots(scene: Scene, page: PageLayout, characterStart: number, slots: Map<LayoutGlyph, Slot>): BlockPhase<EnterEffectId> | undefined {
  const enter = scene.motion.enter;
  const defaults = ENTER_EFFECT_DEFAULTS[enter.id];
  const glyphs = page.main.glyphs;
  if (defaults.unit === 'block') {
    const duration = Math.max(0.05, enter.duration);
    for (const glyph of glyphs) slots.set(glyph, { start: characterStart, duration });
    return { ...applied(enter.id, enter), start: characterStart, duration };
  }
  const shown = glyphs.filter((glyph) => glyph.drawable);
  const ranks = staggerRanks(shown.length, enter.order, rankSeed(scene, page.index, 0, 0));
  const typewriter = enter.id === 'FX-I15';
  const stagger = typewriter ? Math.max(0.01, enter.stagger || 0.08) : enter.stagger;
  const duration = typewriter ? 0 : enter.duration;
  const effect = typewriter ? undefined : applied(enter.id, enter);
  shown.forEach((glyph, index) => slots.set(glyph, { start: characterStart + ranks[index]! * stagger, duration, effect }));
  return undefined;
}

function trailerMainSlots(scene: Scene, page: PageLayout, characterStart: number, slots: Map<LayoutGlyph, Slot>): void {
  const trailer = scene.motion.trailer;
  const id = trailerEnterId(scene);
  const typewriter = id === 'FX-I15';
  const duration = typewriter ? 0 : trailer.characterDuration;
  const effect = typewriter || duration <= 0 ? undefined : applied(id, scene.motion.enter);
  const glyphs = page.main.glyphs;
  if (trailer.flow === 'characters') {
    let cursor = characterStart;
    for (let line = 0; line < page.main.lineCount; line += 1) {
      for (const glyph of glyphs) {
        if (glyph.lineIndex !== line) continue;
        slots.set(glyph, { start: cursor, duration, effect });
        cursor += 1 / trailer.charactersPerSecond;
        cursor += punctuationDelay(glyph.text, trailer.punctuationPause);
      }
      cursor += trailer.linePause;
    }
    return;
  }
  if (trailer.flow === 'lines' || trailer.flow === 'smooth-lines') {
    const lineNumbers = [...new Set(glyphs.filter((glyph) => glyph.drawable).map((glyph) => glyph.lineIndex))].sort((a, b) => a - b);
    for (const glyph of glyphs) {
      const li = Math.max(0, lineNumbers.indexOf(glyph.lineIndex));
      const flow = trailer.flow === 'smooth-lines' ? glyph.linePosition * trailer.lineFlowDuration : 0;
      slots.set(glyph, { start: characterStart + li * trailer.lineInterval + flow, duration, effect });
    }
    return;
  }
  for (const glyph of glyphs) slots.set(glyph, { start: characterStart, duration, effect });
}

function centerPlan(scene: Scene, page: PageLayout, characterStart: number): { beats: CenterBeat[]; revealStart: number; beat: number; room: number } {
  const trailer = scene.motion.trailer;
  const beat = 1 / trailer.charactersPerSecond;
  const beats: CenterBeat[] = [];
  let k = 0;
  let gap = false;
  let previousLine: number | undefined;
  for (const glyph of page.main.glyphs) {
    if (!glyph.drawable) {
      gap = true;
      continue;
    }
    if (previousLine !== undefined && glyph.lineIndex !== previousLine) gap = true;
    if (gap && beats.length > 0) k += 1;
    gap = false;
    beats.push({ glyph, start: characterStart + k * beat - 1e-6, end: characterStart + (k + 1) * beat - 1e-6 });
    k += 1;
    previousLine = glyph.lineIndex;
  }
  const revealStart = characterStart + k * beat + trailer.centerPause - 1e-6;
  const S = page.main.glyphs[0]?.font.size ?? scene.text.mainFont.size;
  const box = page.box;
  const cx = (box.left + box.right) / 2;
  const cy = (box.top + box.bottom) / 2;
  const inset = 0.05 * S;
  const ratios: number[] = [];
  if (box.width > 0) ratios.push((cx - inset) / (box.width / 2), (scene.canvas.width - inset - cx) / (box.width / 2));
  if (box.height > 0) ratios.push((cy - inset) / (box.height / 2), (scene.canvas.height - inset - cy) / (box.height / 2));
  const room = Math.max(1, ratios.length > 0 ? Math.min(...ratios) : 1);
  return { beats, revealStart, beat, room };
}

function subSlots(scene: Scene, page: PageLayout, characterStart: number, mainComplete: number, slots: Map<LayoutGlyph, Slot>): void {
  if (!page.sub) return;
  const plan = subEnterPlan(scene);
  const glyphs = page.sub.glyphs;
  if (plan.kind === 'block') {
    for (const glyph of glyphs) slots.set(glyph, { start: characterStart, duration: plan.duration });
    return;
  }
  const start = Math.max(characterStart, mainComplete + scene.motion.subDelay);
  const main = scene.motion.enter;
  const effect = plan.effect === 'FX-I15' ? undefined : plan.useMainParameters
    ? applied(plan.effect, main)
    : applied(plan.effect, { easing: 'auto', strength: 1, direction: main.direction });
  const shown = glyphs.filter((glyph) => glyph.drawable);
  const ranks = staggerRanks(shown.length, plan.useMainOrder ? main.order : 'forward', rankSeed(scene, page.index, 1, 0));
  shown.forEach((glyph, index) => slots.set(glyph, { start: start + ranks[index]! * plan.stagger, duration: plan.duration, effect }));
  for (const glyph of glyphs) if (!slots.has(glyph)) slots.set(glyph, { start, duration: 0 });
}

function maxEnd(values: Iterable<{ start: number; duration: number }>, fallback: number): number {
  let maximum = fallback;
  for (const value of values) maximum = Math.max(maximum, value.start + value.duration);
  return maximum;
}

interface ExitSlot {
  start: number;
  duration: number;
  effect?: AppliedEffect<ExitEffectId>;
}

function exitSlots(scene: Scene, page: PageLayout, displayEnd: number, mode: PageTimeline['exitMode']): { slots: Map<LayoutGlyph, ExitSlot>; block?: BlockPhase<ExitEffectId> } {
  const slots = new Map<LayoutGlyph, ExitSlot>();
  if (mode === 'none') {
    for (const glyph of page.glyphs) slots.set(glyph, { start: Number.POSITIVE_INFINITY, duration: 0 });
    return { slots };
  }
  if (mode === 'instant') {
    for (const glyph of page.glyphs) slots.set(glyph, { start: displayEnd, duration: 0 });
    return { slots };
  }
  const exit = scene.motion.exit;
  const defaults = EXIT_EFFECT_DEFAULTS[exit.id];
  if (defaults.unit === 'block') {
    const duration = Math.max(0.05, exit.duration);
    for (const glyph of page.glyphs) slots.set(glyph, { start: displayEnd, duration });
    return { slots, block: { ...applied(exit.id, exit), start: displayEnd, duration } };
  }
  const erase = exit.id === 'FX-O11';
  const order: StaggerOrder = erase && exit.order === 'forward' ? 'reverse' : exit.order;
  const stagger = erase ? Math.max(0.01, exit.stagger || 0.06) : exit.stagger;
  const duration = erase ? 0 : exit.duration;
  const effect = erase ? undefined : applied(exit.id, exit);
  for (const [group, glyphs] of [[0, page.main.glyphs], [1, page.sub?.glyphs ?? []]] as const) {
    const shown = glyphs.filter((glyph) => glyph.drawable);
    const ranks = staggerRanks(shown.length, order, rankSeed(scene, page.index, group, 1));
    shown.forEach((glyph, index) => slots.set(glyph, { start: displayEnd + ranks[index]! * stagger, duration, effect }));
  }
  for (const glyph of page.glyphs) if (!slots.has(glyph)) slots.set(glyph, { start: displayEnd, duration: 0 });
  return { slots };
}

function scrollData(scene: Scene, page: PageLayout): NonNullable<PageTimeline['scroll']> {
  const speed = Math.max(5, scene.motion.trailer.scrollSpeed);
  if (scene.layout.writingMode === 'horizontal') {
    const startY = scene.canvas.height - page.box.top;
    const endY = -page.box.bottom;
    return { startX: 0, startY, endX: 0, endY, duration: Math.abs(startY - endY) / speed };
  }
  const startX = -page.box.right;
  const endX = scene.canvas.width - page.box.left;
  return { startX, startY: 0, endX, endY: 0, duration: Math.abs(endX - startX) / speed };
}

function backgroundVisible(scene: Scene): boolean {
  return scene.background.kind !== 'none' && scene.background.opacity > 0 && scene.background.syncFade;
}

/** Builds the full timeline (TL-01〜TL-16) for a validated scene and its layout. */
export function createSceneTimeline(scene: Scene, layout: SceneLayout): SceneTimeline {
  const pages: PageTimeline[] = [];
  const animated = isDecorationAnimated(scene);
  const decorationDuration = animated ? Math.max(0.05, scene.style.decoration.duration) : 0;
  const bgFade = backgroundFadeDuration(scene);
  const trailer = scene.mode === 'trailer';
  const flow = scene.motion.trailer.flow;
  let pageStart = scene.motion.preDelay;
  for (const page of layout.pages) {
    const isLast = page.index === layout.pages.length - 1;
    let characterStart = pageStart + (animated && decorationLeads(scene) ? Math.min(0.3, 0.6 * decorationDuration) : 0);
    const decorationEnterEnd = pageStart + decorationDuration;

    if (trailer && flow === 'scroll') {
      const scroll = scrollData(scene, page);
      const end = characterStart + scroll.duration;
      const glyphs = page.glyphs.map((glyph): GlyphTiming => ({ glyph, enterStart: characterStart, enterDuration: 0, exitStart: end, exitDuration: 0 }));
      const decorationExitStart = end;
      const pageEnd = Math.max(end, decorationExitStart + decorationDuration);
      pages.push({
        index: page.index, start: pageStart, decorationEnterEnd, characterStart, enterComplete: end, displayEnd: end, exitComplete: end,
        decorationExitStart, decorationDuration, end: pageEnd, exitMode: 'effect', persistent: false, glyphs, scroll, cursor: false,
      });
      pageStart = pageEnd + scene.motion.pageGap;
      continue;
    }

    const slots = new Map<LayoutGlyph, Slot>();
    let blockEnter: BlockPhase<EnterEffectId> | undefined;
    let center: PageTimeline['center'];
    let expand: PageTimeline['expand'];
    let mainComplete: number;
    if (trailer && flow === 'center-characters') {
      if (page.index === 0 && backgroundVisible(scene)) characterStart = Math.max(characterStart, scene.motion.preDelay + bgFade);
      const plan = centerPlan(scene, page, characterStart);
      center = plan;
      for (const glyph of page.main.glyphs) slots.set(glyph, { start: plan.revealStart, duration: 0 });
      mainComplete = plan.revealStart + 0.26;
    } else if (trailer && flow === 'expand') {
      const tr = scene.motion.trailer;
      const total = 0.25 + tr.overlapHold + tr.expandDuration;
      expand = { overlapHold: tr.overlapHold, expandDuration: tr.expandDuration };
      for (const glyph of page.main.glyphs) slots.set(glyph, { start: characterStart, duration: total });
      mainComplete = characterStart + total;
    } else {
      if (trailer) trailerMainSlots(scene, page, characterStart, slots);
      else blockEnter = messageMainSlots(scene, page, characterStart, slots);
      mainComplete = maxEnd([...slots.values()], characterStart);
    }
    for (const glyph of page.main.glyphs) if (!slots.has(glyph)) slots.set(glyph, { start: characterStart, duration: 0 });
    const mainSlots = [...slots.values()];
    subSlots(scene, page, characterStart, mainComplete, slots);
    const subEnd = page.sub ? maxEnd(page.sub.glyphs.map((glyph) => slots.get(glyph)!), characterStart) : characterStart;
    const enterComplete = Math.max(mainComplete, subEnd, maxEnd(mainSlots, characterStart));
    const displayEnd = enterComplete + scene.motion.holdDuration;
    const exitMode: PageTimeline['exitMode'] = scene.motion.exitEnabled ? 'effect' : isLast ? 'none' : 'instant';
    const exits = exitSlots(scene, page, displayEnd, exitMode);
    const exitComplete = exitMode === 'none' ? Number.POSITIVE_INFINITY : maxEnd([...exits.slots.values()].filter((slot) => Number.isFinite(slot.start)), displayEnd);
    const decorationExitStart = exitMode === 'none'
      ? Number.POSITIVE_INFINITY
      : animated ? displayEnd + (exitComplete - displayEnd) * 0.35 : exitComplete;
    const end = exitMode === 'none' ? displayEnd : Math.max(exitComplete, decorationExitStart + decorationDuration);
    const glyphs = page.glyphs.map((glyph): GlyphTiming => {
      const entry = slots.get(glyph) ?? { start: characterStart, duration: 0 };
      const leaving = exits.slots.get(glyph) ?? { start: displayEnd, duration: 0 };
      return {
        glyph,
        enterStart: entry.start,
        enterDuration: entry.duration,
        exitStart: leaving.start,
        exitDuration: leaving.duration,
        enterEffect: entry.effect,
        exitEffect: leaving.effect,
      };
    });
    pages.push({
      index: page.index, start: pageStart, decorationEnterEnd, characterStart, enterComplete, displayEnd, exitComplete,
      decorationExitStart, decorationDuration, end, exitMode, persistent: exitMode === 'none', glyphs, blockEnter,
      blockExit: exits.block, center, expand, cursor: trailer && flow === 'characters' && scene.motion.trailer.cursor,
    });
    if (exitMode === 'none') break;
    pageStart = end + scene.motion.pageGap;
  }
  const last = pages[pages.length - 1];
  const contentEnd = last?.end ?? scene.motion.preDelay;
  const duration = Math.max(0.2, contentEnd + scene.motion.postDelay);
  const first = pages[0];
  const completedRaw = first?.scroll ? first.characterStart + first.scroll.duration * 0.5 : first?.enterComplete ?? 0;
  return {
    pages,
    duration,
    completedTime: Math.min(duration, completedRaw),
    backgroundFadeStart: scene.motion.preDelay,
    backgroundFadeDuration: bgFade,
    backgroundFadeOutStart: last && !last.persistent ? last.end - bgFade : Number.POSITIVE_INFINITY,
  };
}

/** TL-16: effective background opacity at time t. */
export function backgroundOpacity(scene: Scene, timeline: SceneTimeline, time: number): number {
  if (!scene.background.syncFade) return scene.background.opacity;
  const fade = timeline.backgroundFadeDuration;
  const inP = Math.max(0, Math.min(1, (time - timeline.backgroundFadeStart) / fade));
  const outP = Number.isFinite(timeline.backgroundFadeOutStart) ? Math.max(0, Math.min(1, (time - timeline.backgroundFadeOutStart) / fade)) : 0;
  return scene.background.opacity * (1 - (1 - inP) ** 3) * (1 - outP ** 3);
}

/** Whether a page is drawn at time t (TL-20 step 3). */
export function isPageActive(page: PageTimeline, time: number): boolean {
  if (time < page.start) return false;
  return page.persistent || time <= page.end + 1e-9;
}

export function seekTime(time: number, duration: number): number {
  if (!Number.isFinite(time)) return 0;
  return Math.max(0, Math.min(duration, time));
}

export interface PlaybackState {
  readonly time: number;
  readonly playing: boolean;
}

/** TL-17: advances preview playback; loops to 0 or stops at D. */
export function advancePlayback(state: PlaybackState, elapsed: number, duration: number, loop: boolean): PlaybackState {
  if (!state.playing || elapsed <= 0) return { time: seekTime(state.time, duration), playing: state.playing };
  const next = state.time + elapsed;
  if (next < duration) return { time: next, playing: true };
  if (loop && duration > 0) return { time: next % duration, playing: true };
  return { time: duration, playing: false };
}

/** TL-17: pressing play near the end (≥ D − 0.01) restarts from 0. */
export function playbackStartTime(time: number, duration: number): number {
  return time >= duration - 0.01 ? 0 : seekTime(time, duration);
}

/** TL-18: after editing while paused, jump to the completed time if no text would be visible. */
export function timeAfterEdit(time: number, timeline: SceneTimeline): number {
  const first = timeline.pages[0];
  const last = timeline.pages[timeline.pages.length - 1];
  if (!first || !last) return time;
  if (time < first.characterStart) return timeline.completedTime;
  if (!last.persistent && time > last.end) return timeline.completedTime;
  return time;
}

export interface PlaybackSegment {
  readonly page: number;
  readonly phase: 'enter' | 'hold' | 'exit';
  readonly start: number;
  readonly end: number;
}

/** TL-17 timeline bar: enter / hold / exit per page; a persistent last page's hold runs to D. */
export function playbackSegments(timeline: SceneTimeline): PlaybackSegment[] {
  const segments: PlaybackSegment[] = [];
  for (const page of timeline.pages) {
    segments.push({ page: page.index, phase: 'enter', start: page.start, end: page.enterComplete });
    segments.push({ page: page.index, phase: 'hold', start: page.enterComplete, end: page.persistent ? timeline.duration : page.displayEnd });
    if (!page.persistent) segments.push({ page: page.index, phase: 'exit', start: page.displayEnd, end: page.end });
  }
  return segments;
}
