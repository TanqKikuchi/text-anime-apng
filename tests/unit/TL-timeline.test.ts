import { describe, expect, it } from 'vitest';
import {
  advancePlayback,
  backgroundOpacity,
  computeBlockState,
  computeCenterGlyph,
  computeCursor,
  computeFrame,
  computeGlyphState,
  edgeFadeAlpha,
  hashIntegers,
  playbackSegments,
  playbackStartTime,
  punctuationDelay,
  seededRandom,
  seekTime,
  smoothNoise1D,
  staggerRanks,
  timeAfterEdit,
  timeRandom,
  type SceneModel,
} from '../../src/core';
import { model } from './helpers/engine';

const mainTimings = (m: SceneModel, page = 0) => m.timeline.pages[page]!.glyphs.filter((g) => g.glyph.group === 'main' && g.glyph.drawable);
const visible = (m: SceneModel, t: number, page = 0) => {
  const p = m.layout.pages[page]!;
  const pt = m.timeline.pages[page]!;
  return pt.glyphs.filter((timing) => computeGlyphState(m.scene, p, pt, timing, t) !== undefined).map((timing) => timing.glyph.text);
};

describe('TL-01 common time structure', () => {
  it('computes D = 3.1 and completed time 0.7 for the reference message', () => {
    const m = model({ text: { main: 'テスト' }, motion: { enter: { id: 'FX-I01', duration: 0.6, stagger: 0 }, exit: { id: 'FX-O01', duration: 0.6 }, holdDuration: 1.5, preDelay: 0.1, postDelay: 0.3 } });
    expect(m.timeline.duration).toBeCloseTo(3.1);
    expect(m.timeline.completedTime).toBeCloseTo(0.7);
    const page = m.timeline.pages[0]!;
    expect([page.start, page.characterStart, page.enterComplete, page.displayEnd, page.exitComplete, page.end].map((v) => +v.toFixed(6))).toEqual([0.1, 0.1, 0.7, 2.2, 2.8, 2.8]);
  });

  it('enforces the 0.2 s minimum and makes whitespace exit immediately', () => {
    const m = model({ text: { main: ' ' }, motion: { preDelay: 0, postDelay: 0, holdDuration: 0, exit: { duration: 0.05 }, enter: { duration: 0.05 } } });
    expect(m.timeline.duration).toBeCloseTo(0.2);
    const space = m.timeline.pages[0]!.glyphs[0]!;
    expect(space.exitDuration).toBe(0);
    expect(space.enterStart).toBe(m.timeline.pages[0]!.characterStart);
  });
});

describe('TL-02 per-character enter (message / place-time)', () => {
  it('staggers 5 characters by 0.1 with duration 0.5', () => {
    const m = model({ text: { main: 'あいうえお' }, motion: { enter: { id: 'FX-I02', stagger: 0.1, duration: 0.5, order: 'forward' } } });
    const timings = mainTimings(m);
    const cs = m.timeline.pages[0]!.characterStart;
    expect(timings[4]!.enterStart - cs).toBeCloseTo(0.4);
    expect(m.timeline.pages[0]!.enterComplete - cs).toBeCloseTo(0.9);
  });

  it('typewriter appears instantly with stagger 0.08 when unset (min 0.01)', () => {
    const timings = mainTimings(model({ text: { main: 'あいう' }, motion: { enter: { id: 'FX-I15', stagger: 0, duration: 0 } } }));
    expect(timings.map((t) => t.enterDuration)).toEqual([0, 0, 0]);
    expect(timings[2]!.enterStart - timings[0]!.enterStart).toBeCloseTo(0.16);
    expect(timings[0]!.enterEffect).toBeUndefined();
    const placeTime = mainTimings(model({ mode: 'place-time', text: { main: 'あい' }, motion: { enter: { id: 'FX-I15', stagger: 0.001 } } }, 'place-time'));
    expect(placeTime[1]!.enterStart - placeTime[0]!.enterStart).toBeCloseTo(0.01);
  });
});

describe('TL-03 stagger order', () => {
  it('computes ranks for every order', () => {
    expect(staggerRanks(5, 'forward')).toEqual([0, 1, 2, 3, 4]);
    expect(staggerRanks(5, 'reverse')).toEqual([4, 3, 2, 1, 0]);
    expect(staggerRanks(5, 'center')).toEqual([2, 1, 0, 1, 2]);
    expect(staggerRanks(5, 'edges')).toEqual([0, 1, 2, 1, 0]);
    expect(staggerRanks(4, 'center')).toEqual([1, 0, 0, 1]);
    const random = staggerRanks(8, 'random', 42);
    expect([...random].sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(staggerRanks(8, 'random', 42)).toEqual(random);
  });

  it('uses separate orders for enter and exit, crossing lines', () => {
    const m = model({ text: { main: 'あい\nう' }, motion: { enter: { id: 'FX-I02', stagger: 0.1, order: 'reverse' }, exit: { id: 'FX-O02', stagger: 0.1, order: 'forward' } } });
    const [a, , u] = mainTimings(m);
    expect(a!.enterStart).toBeGreaterThan(u!.enterStart);
    expect(a!.exitStart).toBeLessThan(u!.exitStart);
  });
});

describe('TL-04 block enter', () => {
  it('shows all characters at once and transforms the page block', () => {
    const m = model({ text: { main: 'せまる' }, motion: { enter: { id: 'FX-I18', duration: 0.9, stagger: 0.2 } } });
    const page = m.timeline.pages[0]!;
    const starts = new Set(mainTimings(m).map((t) => t.enterStart));
    expect(starts.size).toBe(1);
    expect(page.enterComplete - page.characterStart).toBeCloseTo(0.9);
    expect(computeBlockState(m.scene, m.layout, m.layout.pages[0]!, page, page.characterStart - 0.01).a).toBe(0);
    const start = computeBlockState(m.scene, m.layout, m.layout.pages[0]!, page, page.characterStart);
    expect(start.s).toBeCloseTo(1.9);
    const tiny = model({ text: { main: 'A' }, motion: { enter: { id: 'FX-I19', duration: 0.05 } } });
    expect(tiny.timeline.pages[0]!.enterComplete - tiny.timeline.pages[0]!.characterStart).toBeCloseTo(0.05);
  });
});

describe('TL-05 sub text enter', () => {
  it('starts the sub at main-complete + delay (fade: stagger 0, default duration)', () => {
    const m = model({ text: { main: 'メイン', sub: 'さぶ' }, motion: { enter: { id: 'FX-I02', duration: 0.9, stagger: 0 }, subEnter: 'FX-I01', subDelay: -0.2 } });
    const sub = m.timeline.pages[0]!.glyphs.filter((g) => g.glyph.group === 'sub');
    expect(sub[0]!.enterStart).toBeCloseTo(0.8);
    expect(sub[1]!.enterStart).toBeCloseTo(0.8);
    expect(sub[0]!.enterDuration).toBeCloseTo(0.6);
    expect(sub[0]!.enterEffect?.id).toBe('FX-I01');
  });

  it('shares the block enter when "same" and the main is a block effect', () => {
    const m = model({ text: { main: 'メイン', sub: 'さぶ' }, motion: { enter: { id: 'FX-I17' }, subEnter: 'same' } });
    const page = m.timeline.pages[0]!;
    const sub = page.glyphs.filter((g) => g.glyph.group === 'sub');
    expect(sub.every((g) => g.enterStart === page.characterStart && g.enterEffect === undefined)).toBe(true);
  });

  it('uses min(main stagger, 0.05) for "same", 0.05 for typewriter, 0.035 otherwise, and page complete = max', () => {
    const same = model({ text: { main: 'メ', sub: 'abc' }, motion: { enter: { id: 'FX-I02', stagger: 0.2, duration: 0.5 }, subEnter: 'same', subDelay: 1 } });
    const sameSub = same.timeline.pages[0]!.glyphs.filter((g) => g.glyph.group === 'sub');
    expect(sameSub[1]!.enterStart - sameSub[0]!.enterStart).toBeCloseTo(0.05);
    expect(same.timeline.pages[0]!.enterComplete).toBeCloseTo(sameSub[2]!.enterStart + 0.5);
    const tw = model({ text: { main: 'メ', sub: 'abc' }, motion: { subEnter: 'FX-I15' } }).timeline.pages[0]!.glyphs.filter((g) => g.glyph.group === 'sub');
    expect(tw[1]!.enterStart - tw[0]!.enterStart).toBeCloseTo(0.05);
    expect(tw[0]!.enterDuration).toBe(0);
    const slide = model({ text: { main: 'メ', sub: 'abc' }, motion: { subEnter: 'FX-I05' } }).timeline.pages[0]!.glyphs.filter((g) => g.glyph.group === 'sub');
    expect(slide[1]!.enterStart - slide[0]!.enterStart).toBeCloseTo(0.035);
    expect(slide[0]!.enterDuration).toBeCloseTo(0.7);
  });
});

describe('TL-06 exit', () => {
  it('erases one character every 0.1 s from the end', () => {
    const m = model({ text: { main: 'あいうえお' }, motion: { exit: { id: 'FX-O11', stagger: 0.1, order: 'forward' } } });
    const page = m.timeline.pages[0]!;
    const end = page.displayEnd;
    expect(visible(m, end - 0.001)).toEqual(['あ', 'い', 'う', 'え', 'お']);
    expect(visible(m, end + 0.001)).toEqual(['あ', 'い', 'う', 'え']);
    expect(visible(m, end + 0.15)).toEqual(['あ', 'い', 'う']);
    expect(page.exitComplete - end).toBeCloseTo(0.4);
  });

  it('runs per-character and block exits from the display end', () => {
    const m = model({ text: { main: 'あい' }, motion: { exit: { id: 'FX-O02', stagger: 0.1, duration: 0.8 } } });
    const page = m.timeline.pages[0]!;
    expect(page.exitComplete - page.displayEnd).toBeCloseTo(0.9);
    const block = model({ text: { main: 'あい' }, motion: { exit: { id: 'FX-O13', duration: 0.6 } } });
    const bp = block.timeline.pages[0]!;
    expect(bp.blockExit?.start).toBeCloseTo(bp.displayEnd);
    expect(computeBlockState(block.scene, block.layout, block.layout.pages[0]!, bp, bp.displayEnd + 0.6).a).toBe(0);
  });
});

describe('TL-07 exit on/off', () => {
  it('keeps the last page on screen and shortens D when exit is off', () => {
    const m = model({ text: { main: 'のこる' }, motion: { exitEnabled: false } });
    const page = m.timeline.pages[0]!;
    expect(page.persistent).toBe(true);
    expect(page.exitComplete).toBe(Number.POSITIVE_INFINITY);
    expect(m.timeline.duration).toBeCloseTo(0.1 + 0.6 + 1.5 + 0.3);
    expect(visible(m, m.timeline.duration)).toHaveLength(3);
  });

  it('makes non-last trailer pages vanish instantly at the display end', () => {
    const m = model({ mode: 'trailer', text: { main: 'あ\n\nい' }, motion: { exitEnabled: false } }, 'trailer');
    const [first, second] = m.timeline.pages;
    expect(first!.exitMode).toBe('instant');
    expect(first!.exitComplete).toBeCloseTo(first!.displayEnd);
    expect(visible(m, first!.displayEnd + 0.001, 0)).toEqual([]);
    expect(second!.persistent).toBe(true);
  });

  it('is always on for scroll', () => {
    const m = model({ mode: 'trailer', text: { main: 'あ' }, motion: { exitEnabled: false, trailer: { flow: 'scroll' } } }, 'trailer');
    expect(m.timeline.pages[0]!.persistent).toBe(false);
  });
});

describe('TL-08 trailer: one character at a time', () => {
  it('advances 1/speed per character, with punctuation and line pauses', () => {
    const plain = model({ mode: 'trailer', text: { main: 'あ'.repeat(12) }, motion: { trailer: { charactersPerSecond: 12, punctuationPause: 0, linePause: 0 } } }, 'trailer');
    const t = mainTimings(plain);
    expect(t[11]!.enterStart - plain.timeline.pages[0]!.characterStart).toBeCloseTo(11 / 12);
    const punct = model({ mode: 'trailer', text: { main: 'あ。い、う\nえ' }, motion: { trailer: { charactersPerSecond: 10, punctuationPause: 0.25, linePause: 0.35 } } }, 'trailer');
    const p = mainTimings(punct);
    expect(p[2]!.enterStart - p[1]!.enterStart).toBeCloseTo(0.1 + 0.25);
    expect(p[4]!.enterStart - p[3]!.enterStart).toBeCloseTo(0.1 + 0.125);
    expect(p[5]!.enterStart - p[4]!.enterStart).toBeCloseTo(0.1 + 0.35);
    expect(punctuationDelay('…', 0.2)).toBe(0.2);
    expect(punctuationDelay('・', 0.2)).toBe(0.1);
  });

  it('counts whitespace and empty lines; typewriter has zero duration; block effects fall back to fade', () => {
    const single = model({ mode: 'trailer', text: { main: 'あ い\nう', splitPages: false }, motion: { enter: { id: 'FX-I15' }, trailer: { charactersPerSecond: 10, linePause: 0.5, punctuationPause: 0 } } }, 'trailer');
    const g = mainTimings(single);
    expect(g[1]!.enterStart - g[0]!.enterStart).toBeCloseTo(0.2);
    expect(g[2]!.enterStart - g[1]!.enterStart).toBeCloseTo(0.1 + 0.5);
    expect(g.every((timing) => timing.enterDuration === 0)).toBe(true);
    const block = model({ mode: 'trailer', text: { main: 'あ' }, motion: { enter: { id: 'FX-I18' } } }, 'trailer');
    expect(mainTimings(block)[0]!.enterEffect?.id).toBe('FX-I01');
  });

  it('shows a cursor after the last typed character and blinks after completion', () => {
    const m = model({ mode: 'trailer', text: { main: 'あいう' }, motion: { trailer: { cursor: true, charactersPerSecond: 10 } } }, 'trailer');
    const page = m.timeline.pages[0]!;
    const g = mainTimings(m);
    const cursor = computeCursor(m.scene, page, g[1]!.enterStart + 0.01)!;
    expect(cursor.x).toBeCloseTo(g[1]!.glyph.x + g[1]!.glyph.advance / 2 + 0.06 * g[1]!.glyph.font.size);
    expect(cursor.height).toBeCloseTo(0.98 * g[1]!.glyph.font.size);
    expect(cursor.color).toBe(m.scene.style.fill.colors[0]);
    expect(computeCursor(m.scene, page, page.enterComplete + 0.1)).toBeDefined();
    expect(computeCursor(m.scene, page, page.enterComplete + 0.5)).toBeUndefined();
    expect(computeCursor(m.scene, page, page.displayEnd + 0.01)).toBeUndefined();
  });
});

describe('TL-09 trailer: centre one at a time', () => {
  it('reveals the whole text after beats + pause and slams for 0.26 s', () => {
    const m = model({ mode: 'trailer', text: { main: 'あいうえ' }, motion: { trailer: { flow: 'center-characters', charactersPerSecond: 8, centerPause: 0.4 } } }, 'trailer');
    const page = m.timeline.pages[0]!;
    expect(page.center!.revealStart - page.characterStart).toBeCloseTo(0.9, 5);
    expect(page.enterComplete - page.center!.revealStart).toBeCloseTo(0.26);
    const center = computeCenterGlyph(m.scene, page, page.characterStart + 0.2, m.measurer)!;
    expect(center.glyph.text).toBe('い');
    expect(center.glyph.font.size).toBeCloseTo(720 * 0.55);
    expect(center.glyph.x).toBe(640);
    const slam = computeBlockState(m.scene, m.layout, m.layout.pages[0]!, page, page.center!.revealStart + 0.01);
    expect(slam.s).toBeGreaterThan(1);
    expect(slam.bright).toBeGreaterThan(0.4);
  });

  it('adds one beat for spaces / line breaks and waits for the background fade', () => {
    const m = model({ mode: 'trailer', text: { main: 'あ  い\nう', splitPages: false }, motion: { trailer: { flow: 'center-characters', charactersPerSecond: 10 } } }, 'trailer');
    const beats = m.timeline.pages[0]!.center!.beats;
    expect(beats[1]!.start - beats[0]!.start).toBeCloseTo(0.2);
    expect(beats[2]!.start - beats[1]!.start).toBeCloseTo(0.2);
    const bg = model({ mode: 'trailer', text: { main: 'あ' }, background: { kind: 'solid', opacity: 0.5, syncFade: true }, motion: { trailer: { flow: 'center-characters' } } }, 'trailer');
    expect(bg.timeline.pages[0]!.characterStart).toBeCloseTo(0.1 + 0.4);
  });
});

describe('TL-10 trailer: expand from the centre', () => {
  it('gathers glyphs near the centre during the overlap and spreads to the home position', () => {
    const m = model({ mode: 'trailer', text: { main: 'あいうえおかき' }, motion: { trailer: { flow: 'expand', overlapHold: 0.5, expandDuration: 0.9 } } }, 'trailer');
    const page = m.timeline.pages[0]!;
    const layoutPage = m.layout.pages[0]!;
    const first = page.glyphs[0]!;
    const centerX = (layoutPage.box.left + layoutPage.box.right) / 2;
    const during = computeGlyphState(m.scene, layoutPage, page, first, page.characterStart + 0.5)!;
    expect(Math.abs(first.glyph.x + during.x - centerX)).toBeLessThan(Math.abs(first.glyph.x - centerX) * 0.25);
    expect(page.enterComplete - page.characterStart).toBeCloseTo(0.25 + 0.5 + 0.9);
    const done = computeGlyphState(m.scene, layoutPage, page, first, page.enterComplete)!;
    expect(done.x).toBeCloseTo(0);
    expect(done.a).toBeCloseTo(1);
  });
});

describe('TL-11 trailer: line by line / smooth', () => {
  it('starts line 3 at +2.0 with interval 1.0 and flows within a line', () => {
    const lines = model({ mode: 'trailer', text: { main: 'あい\nう\nえ' }, motion: { trailer: { flow: 'lines', lineInterval: 1 } } }, 'trailer');
    const g = mainTimings(lines);
    expect(g[3]!.enterStart - lines.timeline.pages[0]!.characterStart).toBeCloseTo(2);
    expect(g[0]!.enterStart).toBeCloseTo(g[1]!.enterStart);
    const smooth = model({ mode: 'trailer', text: { main: 'あいうえ' }, motion: { trailer: { flow: 'smooth-lines', lineFlowDuration: 1.2 } } }, 'trailer');
    const s = mainTimings(smooth);
    expect(s[2]!.enterStart - s[0]!.enterStart).toBeCloseTo(s[2]!.glyph.linePosition * 1.2);
    expect(s[2]!.glyph.linePosition).toBeGreaterThan(0.45);
    expect(s[0]!.enterDuration).toBeCloseTo(0.4);
  });
});

describe('TL-12 trailer: all at once', () => {
  it('starts every glyph together', () => {
    const m = model({ mode: 'trailer', text: { main: 'あい\nう' }, motion: { trailer: { flow: 'simultaneous', characterDuration: 0.7 } } }, 'trailer');
    const page = m.timeline.pages[0]!;
    expect(new Set(mainTimings(m).map((g) => g.enterStart)).size).toBe(1);
    expect(page.enterComplete - page.characterStart).toBeCloseTo(0.7);
  });
});

describe('TL-13 trailer: scroll', () => {
  it('takes (720 + 1000) / 100 = 17.2 s and fades at the edges', () => {
    const main = Array.from({ length: 10 }, () => 'あ').join('\n');
    const m = model({ mode: 'trailer', text: { main, lineHeight: 1, mainFont: { size: 100 } }, motion: { trailer: { flow: 'scroll', scrollSpeed: 100 } } }, 'trailer');
    const page = m.timeline.pages[0]!;
    expect(m.layout.pages[0]!.box.height).toBeCloseTo(1000);
    expect(page.scroll!.duration).toBeCloseTo(17.2);
    expect(page.enterComplete).toBeCloseTo(page.exitComplete);
    expect(m.timeline.completedTime).toBeCloseTo(page.characterStart + 8.6);
    const startBlock = computeBlockState(m.scene, m.layout, m.layout.pages[0]!, page, page.characterStart);
    expect(m.layout.pages[0]!.box.top + startBlock.y).toBeCloseTo(720);
    expect(edgeFadeAlpha(0, 720)).toBe(0);
    expect(edgeFadeAlpha(360, 720)).toBe(1);
    const frame = computeFrame(m, page.characterStart + 3);
    expect(frame.pages[0]!.edgeFade).toEqual({ axis: 'y', length: 720 });
  });

  it('scrolls vertical text left to right', () => {
    const m = model({ mode: 'trailer', text: { main: 'あい\nう' }, layout: { writingMode: 'vertical' }, motion: { trailer: { flow: 'scroll' } } }, 'trailer');
    const page = m.timeline.pages[0]!;
    const box = m.layout.pages[0]!.box;
    expect(box.right + page.scroll!.startX).toBeCloseTo(0);
    expect(box.left + page.scroll!.endX).toBeCloseTo(1280);
  });
});

describe('TL-14 page sequencing', () => {
  it('starts page 2 at page 1 end + gap and reports total duration', () => {
    const m = model({ mode: 'trailer', text: { main: 'あ\n\nい' }, motion: { pageGap: 0.3 } }, 'trailer');
    const [first, second] = m.timeline.pages;
    expect(second!.start - first!.exitComplete).toBeCloseTo(0.3);
    expect(m.timeline.duration).toBeCloseTo(second!.end + m.scene.motion.postDelay);
  });
});

describe('TL-15 decoration timing', () => {
  it('leads the text by min(0.3, 0.6 × duration) for bands and lags the exit', () => {
    const m = model({ text: { main: 'あ' }, style: { decoration: { kind: 'band', duration: 0.45 } } });
    const page = m.timeline.pages[0]!;
    expect(page.characterStart - page.start).toBeCloseTo(0.27);
    expect(page.decorationExitStart).toBeCloseTo(page.displayEnd + (page.exitComplete - page.displayEnd) * 0.35);
    expect(page.end).toBeCloseTo(Math.max(page.exitComplete, page.decorationExitStart + 0.45));
    const line = model({ text: { main: 'あ' }, style: { decoration: { kind: 'underline' } } });
    expect(line.timeline.pages[0]!.characterStart).toBeCloseTo(line.timeline.pages[0]!.start);
  });

  it('switches instantly with animation "none" and never leaves a persistent page', () => {
    const none = model({ text: { main: 'あ' }, style: { decoration: { kind: 'box', animation: 'none' } } });
    const page = none.timeline.pages[0]!;
    expect(page.characterStart).toBeCloseTo(page.start);
    expect(page.decorationExitStart).toBeCloseTo(page.exitComplete);
    const stay = model({ text: { main: 'あ' }, motion: { exitEnabled: false }, style: { decoration: { kind: 'box' } } });
    expect(stay.timeline.pages[0]!.decorationExitStart).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('TL-16 background fade sync', () => {
  it('fades in from the pre-delay and out before the end', () => {
    const m = model({ text: { main: 'あ' }, background: { kind: 'solid', opacity: 0.5, syncFade: true } });
    const tl = m.timeline;
    expect(backgroundOpacity(m.scene, tl, 0.05)).toBe(0);
    expect(backgroundOpacity(m.scene, tl, 1.5)).toBeCloseTo(0.5);
    expect(backgroundOpacity(m.scene, tl, tl.pages[0]!.end)).toBeCloseTo(0);
    expect(tl.backgroundFadeDuration).toBeCloseTo(0.4);
    const off = model({ text: { main: 'あ' }, background: { kind: 'solid', opacity: 0.5, syncFade: false } });
    expect(backgroundOpacity(off.scene, off.timeline, 0)).toBe(0.5);
    const stay = model({ text: { main: 'あ' }, motion: { exitEnabled: false }, background: { kind: 'solid', opacity: 0.5 } });
    expect(backgroundOpacity(stay.scene, stay.timeline, stay.timeline.duration)).toBeCloseTo(0.5);
    const deco = model({ text: { main: 'あ' }, style: { decoration: { kind: 'band', duration: 0.8 } }, background: { kind: 'solid' } });
    expect(deco.timeline.backgroundFadeDuration).toBeCloseTo(0.8);
  });
});

describe('TL-17 preview playback', () => {
  it('loops or stops at D, restarts near the end, and clamps seeks', () => {
    expect(advancePlayback({ time: 2.9, playing: true }, 0.2, 3, true).time).toBeCloseTo(0.1);
    expect(advancePlayback({ time: 2.9, playing: true }, 0.2, 3, false)).toEqual({ time: 3, playing: false });
    expect(advancePlayback({ time: 1, playing: false }, 0.2, 3, true)).toEqual({ time: 1, playing: false });
    expect(playbackStartTime(2.995, 3)).toBe(0);
    expect(playbackStartTime(1.5, 3)).toBe(1.5);
    expect(seekTime(9, 3)).toBe(3);
    expect(seekTime(Number.NaN, 3)).toBe(0);
  });

  it('builds enter / hold / exit segments; a persistent page holds until D', () => {
    const m = model({ text: { main: 'あ' } });
    expect(playbackSegments(m.timeline).map((s) => s.phase)).toEqual(['enter', 'hold', 'exit']);
    const stay = model({ text: { main: 'あ' }, motion: { exitEnabled: false } });
    const segments = playbackSegments(stay.timeline);
    expect(segments.map((s) => s.phase)).toEqual(['enter', 'hold']);
    expect(segments[1]!.end).toBeCloseTo(stay.timeline.duration);
  });
});

describe('TL-18 editing while paused', () => {
  it('jumps to the completed time when no text is visible', () => {
    const m = model({ text: { main: 'あ' } });
    expect(timeAfterEdit(0, m.timeline)).toBeCloseTo(m.timeline.completedTime);
    expect(timeAfterEdit(m.timeline.duration, m.timeline)).toBeCloseTo(m.timeline.completedTime);
    expect(timeAfterEdit(1, m.timeline)).toBe(1);
  });
});

describe('TL-19 deterministic drawing', () => {
  it('derives every random value from integers and time buckets', () => {
    expect(seededRandom(1, 2, 3)).toBe(seededRandom(1, 2, 3));
    expect(seededRandom(1, 2, 3)).not.toBe(seededRandom(1, 2, 4));
    for (let i = 0; i < 200; i += 1) {
      const value = seededRandom(i, i * 7, -i);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
    expect(hashIntegers(5)).toBe(hashIntegers(5, 0, 0));
    expect(timeRandom(1.234, 24)).toBe(timeRandom(1.24, 24));
    expect(timeRandom(1.234, 24)).not.toBe(timeRandom(1.3, 24));
    const noise = smoothNoise1D(3.5);
    expect(noise).toBeGreaterThanOrEqual(-1);
    expect(noise).toBeLessThanOrEqual(1);
    expect(smoothNoise1D(3)).toBeCloseTo(seededRandom(3) * 2 - 1);
  });

  it('computes identical frame states for the same time, including glitch', () => {
    const m = model({ text: { main: 'グリッチ', sub: 'sub' }, motion: { enter: { id: 'FX-I22' }, hold: { id: 'FX-H04' } } });
    expect(computeFrame(m, 1.234)).toEqual(computeFrame(m, 1.234));
    expect(computeFrame(m, 0.3).pages[0]!.glitch).toEqual(computeFrame(model({ text: { main: 'グリッチ', sub: 'sub' }, motion: { enter: { id: 'FX-I22' }, hold: { id: 'FX-H04' } } }), 0.3).pages[0]!.glitch);
  });
});

describe('TL-20 drawing order (frame plan)', () => {
  it('skips inactive or empty pages and drops text when the block is invisible', () => {
    const m = model({ text: { main: 'あ' }, motion: { enter: { id: 'FX-I18' } }, style: { decoration: { kind: 'box', animation: 'none' } } });
    expect(computeFrame(m, 0).pages).toHaveLength(0);
    const early = computeFrame(m, m.timeline.pages[0]!.start);
    expect(early.pages[0]!.decoration).toBeDefined();
    expect(early.pages[0]!.drawText).toBe(false);
    expect(computeFrame(model({ text: { main: '   ' } }), 1).pages).toHaveLength(0);
  });
});
