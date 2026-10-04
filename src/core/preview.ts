import { ENTER_EFFECT_DEFAULTS, EXIT_EFFECT_DEFAULTS, isTrailerEnterAllowed } from './effects';
import { isWhitespace, segmentGraphemes } from './layout';
import { createDefaultScene, validateScene, type EnterEffectId, type ExitEffectId, type Scene, type SceneMode } from './scene';
import type { SceneTimeline } from './scene-timeline';

export const MINI_PREVIEW_WIDTH = 320;
export const MINI_PREVIEW_HEIGHT = 180;
const SAMPLE_TEXT = '文字';
const SHORT_HOLD = 0.35;
const SHORT_FADE = 0.3;

/** FX-04: up to the first three non-space graphemes of the main text (or a 2-character sample). */
export function miniPreviewText(main: string): string {
  const chars = segmentGraphemes(main.replace(/\r?\n|\r/g, '')).filter((char) => !isWhitespace(char)).slice(0, 3);
  return chars.length > 0 ? chars.join('') : SAMPLE_TEXT;
}

/**
 * FX-04 mini preview scene (320×180, horizontal, fixed white/dark-stroke/soft-shadow style).
 * Enter cards: effect enter → short hold → short fade exit. Exit cards: short fade enter → short hold → effect exit.
 */
export function createMiniPreviewScene(scene: Scene, phase: 'enter', id: EnterEffectId): Scene;
export function createMiniPreviewScene(scene: Scene, phase: 'exit', id: ExitEffectId): Scene;
export function createMiniPreviewScene(scene: Scene, phase: 'enter' | 'exit', id: EnterEffectId | ExitEffectId): Scene {
  const base = createDefaultScene('message');
  const enterId: EnterEffectId = phase === 'enter' ? (id as EnterEffectId) : 'FX-I01';
  const exitId: ExitEffectId = phase === 'exit' ? (id as ExitEffectId) : 'FX-O01';
  const enterDefaults = ENTER_EFFECT_DEFAULTS[enterId];
  const exitDefaults = EXIT_EFFECT_DEFAULTS[exitId];
  return validateScene({
    ...base,
    text: {
      ...base.text,
      main: miniPreviewText(scene.text.main),
      sub: '',
      mainFont: { ...scene.text.mainFont, size: 84, letterSpacing: 0.08 },
      lineHeight: 1.2,
    },
    layout: { ...base.layout, writingMode: 'horizontal', alignment: 'center', anchor: 'center', marginX: 16, marginY: 16, autoShrink: true },
    canvas: { width: MINI_PREVIEW_WIDTH, height: MINI_PREVIEW_HEIGHT, preset: 'custom' },
    motion: {
      ...base.motion,
      enter: {
        ...base.motion.enter,
        id: enterId,
        duration: phase === 'enter' ? enterDefaults.duration : SHORT_FADE,
        stagger: phase === 'enter' ? enterDefaults.stagger : 0,
        direction: phase === 'enter' ? scene.motion.enter.direction : 'left',
      },
      exit: {
        ...base.motion.exit,
        id: exitId,
        duration: phase === 'exit' ? exitDefaults.duration : SHORT_FADE,
        stagger: phase === 'exit' ? exitDefaults.stagger : 0,
        order: exitId === 'FX-O11' ? 'reverse' : 'forward',
        direction: phase === 'exit' ? scene.motion.exit.direction : 'left',
      },
      exitEnabled: true,
      holdDuration: SHORT_HOLD,
      preDelay: 0.1,
      postDelay: 0.1,
    },
    style: {
      ...base.style,
      fill: { kind: 'solid', colors: ['#FFFFFF', '#FFFFFF', ''], direction: 'line-vertical', opacity: 1 },
      innerStroke: { enabled: true, color: '#1B1B24', width: 5 },
      outerStroke: { enabled: false, color: '#FFFFFF', width: 6 },
      shadow: { enabled: true, color: '#000000', opacity: 0.35, blur: 6, offsetX: 0, offsetY: 3 },
      glow: { enabled: false, color: '#FFFFFF', spread: 20, strength: 1 },
      decoration: { ...base.style.decoration, kind: 'none' },
    },
    background: { ...base.background, kind: 'none' },
  });
}

/** FX-04: representative still time and hover loop period of a mini preview. */
export function miniPreviewTimes(timeline: SceneTimeline, phase: 'enter' | 'exit'): { readonly still: number; readonly loopPeriod: number } {
  const page = timeline.pages[0];
  if (!page) return { still: 0, loopPeriod: timeline.duration + 0.25 };
  const still = phase === 'enter'
    ? page.start + (page.enterComplete - page.start) * 0.55
    : page.displayEnd + (page.end - page.displayEnd) * 0.45;
  return { still, loopPeriod: timeline.duration + 0.25 };
}

/** FX-04: which enter cards to list for a mode (trailer hides block effects and FX-I07). */
export function listedEnterEffects(mode: SceneMode): EnterEffectId[] {
  const all = Object.keys(ENTER_EFFECT_DEFAULTS) as EnterEffectId[];
  return mode === 'trailer' ? all.filter(isTrailerEnterAllowed) : all;
}
