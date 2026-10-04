import { describe, expect, it } from 'vitest';
import {
  createDefaultScene,
  deepMerge,
  ENTER_EFFECT_IDS,
  EXIT_EFFECT_IDS,
  FPS_CHOICES,
  frameCount,
  HOLD_EFFECT_IDS,
  isSceneTextEmpty,
  mergeScene,
  validateScene,
  type DecorationKind,
  type Scene,
  type ScenePatch,
  type TrailerFlow,
} from '../../src/core';
import { createRgbaRenderer, defaultFontFamily, fontString, renderFrame, type Context2D, type RenderOptions } from '../../src/render';
import { MockContext, mockFactory, scene } from './helpers/engine';

describe('Scene model defaults (06 tables, EXP-21 / EXP-27)', () => {
  it('uses the global and mode defaults', () => {
    const message = createDefaultScene('message');
    expect(message.text.mainFont).toMatchObject({ family: 'Noto Serif JP', size: 130, weight: 700, letterSpacing: 0.08 });
    expect(createDefaultScene('trailer').text.mainFont.size).toBe(46);
    expect(createDefaultScene('trailer').text.lineHeight).toBe(1.9);
    expect(createDefaultScene('place-time').text.mainFont.size).toBe(110);
    expect(message.text).toMatchObject({ subScale: 0.3, subGap: 0.3, lineHeight: 1.5, subPosition: 'after', subFontInherit: true });
    expect(message.text.subFont).toMatchObject({ weight: 400, letterSpacing: 0.25 });
    expect(message.export).toMatchObject({ fps: 24, colorMode: 'palette', loop: { kind: 'once' }, loopCount: 3, includeDefaultImage: true, autoTrim: false, fileName: '' });
    expect(FPS_CHOICES).toEqual([12, 15, 20, 24, 30, 60]);
    expect(message.motion).toMatchObject({ preDelay: 0.1, holdDuration: 1.5, postDelay: 0.3, subDelay: -0.2, exitEnabled: true, pageGap: 0.3 });
    expect(message.style.decoration).toMatchObject({ kind: 'none', animation: 'grow', duration: 0.45, padding: 0.4, lineWidth: 3, lineExtent: 0.8, fillOpacity: 0.55 });
    expect(message.background).toMatchObject({ kind: 'none', opacity: 0.45, syncFade: true });
    expect(message.canvas).toEqual({ width: 1280, height: 720, preset: 'hd' });
    expect(ENTER_EFFECT_IDS).toHaveLength(23);
    expect(EXIT_EFFECT_IDS).toHaveLength(17);
    expect(HOLD_EFFECT_IDS).toHaveLength(9);
  });
});

describe('Scene model validation', () => {
  it('clamps numbers to the spec ranges', () => {
    const s = validateScene({
      text: { mainFont: { size: 999, letterSpacing: 5 }, subFont: { letterSpacing: 9 }, subScale: 2, lineHeight: 0, maxCharactersPerLine: 99.6 },
      layout: { marginX: -5, offsetY: 9999 },
      motion: { enter: { duration: 99, stagger: -1, strength: 0 }, hold: { strength: 10 }, preDelay: 9, postDelay: 9, holdDuration: 99, subDelay: -9, trailer: { charactersPerSecond: 100, centerSize: 2, impact: 9 } },
      style: { innerStroke: { width: 0 }, outerStroke: { width: 99 }, shadow: { blur: 999, offsetX: -999 }, glow: { spread: 1, strength: 99 }, decoration: { lineWidth: 99, tapeWidth: 1 } },
      background: { opacity: 3 },
      export: { loop: { kind: 'count', count: 5000 } },
    });
    expect(s.text.mainFont.size).toBe(400);
    expect(s.text.mainFont.letterSpacing).toBe(1.2);
    expect(s.text.subFont.letterSpacing).toBe(1.5);
    expect(s.text.subScale).toBe(0.9);
    expect(s.text.lineHeight).toBe(0.9);
    expect(s.text.maxCharactersPerLine).toBe(60);
    expect(s.layout.marginX).toBe(0);
    expect(s.layout.offsetY).toBe(800);
    expect(s.motion.enter).toMatchObject({ duration: 4, stagger: 0, strength: 0.2 });
    expect(s.motion.hold.strength).toBe(3);
    expect([s.motion.preDelay, s.motion.postDelay, s.motion.holdDuration, s.motion.subDelay]).toEqual([3, 5, 10, -2]);
    expect(s.motion.trailer).toMatchObject({ charactersPerSecond: 40, centerSize: 0.9, impact: 3 });
    expect(s.style.innerStroke.width).toBe(0.5);
    expect(s.style.outerStroke.width).toBe(40);
    expect(s.style.shadow).toMatchObject({ blur: 80, offsetX: -60 });
    expect(s.style.glow).toMatchObject({ spread: 2, strength: 4 });
    expect(s.style.decoration).toMatchObject({ lineWidth: 16, tapeWidth: 8 });
    expect(s.background.opacity).toBe(1);
    expect(s.export.loop).toEqual({ kind: 'count', count: 999 });
  });

  it('repairs enums and missing fields (unknown exit → fade), drops sub text in trailers', () => {
    const s = validateScene({ mode: 'trailer', text: { sub: 'x' }, motion: { exit: { id: 'FX-O99' as never }, enter: { id: 'nope' as never, easing: 'weird' as never } }, export: { fps: 25 as never } });
    expect(s.motion.exit.id).toBe('FX-O01');
    expect(s.motion.enter.id).toBe('FX-I01');
    expect(s.motion.enter.easing).toBe('auto');
    expect(s.text.sub).toBe('');
    expect(s.export.fps).toBe(24);
    expect(validateScene(JSON.parse('{"mode":"bogus","canvas":"oops"}'))).toEqual(createDefaultScene('message'));
  });

  it('round-trips through JSON and deep-merges partial patches', () => {
    const s = scene({ text: { main: '保存' }, style: { decoration: { kind: 'box' } } });
    expect(validateScene(JSON.parse(JSON.stringify(s)))).toEqual(s);
    const merged = mergeScene(s, { style: { decoration: { padding: 1 } }, export: { loop: { kind: 'count', count: 4 } } });
    expect(merged.style.decoration).toMatchObject({ kind: 'box', padding: 1 });
    expect(merged.export.loop).toEqual({ kind: 'count', count: 4 });
    expect(deepMerge({ a: 1, b: { c: 2 } }, { b: { c: 'x' } })).toEqual({ a: 1, b: { c: 2 } });
  });
});

describe('EXP-24 / EXP-26 helpers', () => {
  it('detects empty text and counts frames', () => {
    expect(isSceneTextEmpty(scene({ text: { main: '  ', sub: ' ' } }))).toBe(true);
    expect(isSceneTextEmpty(scene({ text: { main: ' ', sub: 'x' } }))).toBe(false);
    expect(isSceneTextEmpty(scene({ mode: 'trailer', text: { main: '\n' } }, 'trailer'))).toBe(true);
    expect(frameCount(2.5, 24)).toBe(60);
    expect(frameCount(2.5, 60)).toBe(150);
  });
});

function render(patch: ScenePatch, times: readonly number[], mode?: Scene['mode'], scale = 0.5): string[] {
  const log: string[] = [];
  const options: RenderOptions = { canvasFactory: mockFactory(log) };
  const s = scene(patch, mode);
  const context = new MockContext(Math.round(s.canvas.width * scale), Math.round(s.canvas.height * scale));
  (context as unknown as { log: string[] }).log.push = (...items: string[]) => log.push(...items);
  for (const t of times) {
    context.setTransform(scale, 0, 0, scale, 0, 0);
    renderFrame(s, t, context as unknown as Context2D, options);
  }
  return log;
}

const SAMPLE_TIMES = [0, 0.15, 0.4, 0.8, 1.2, 2.3, 2.6, 3.0, 5];

describe('Renderer (TL-19 / TL-20) — smoke test on a recording context', () => {
  it('renders every enter, exit and hold effect without errors, deterministically', () => {
    for (const id of ENTER_EFFECT_IDS) {
      const a = render({ text: { main: 'あい', sub: 'b' }, motion: { enter: { id } } }, SAMPLE_TIMES);
      expect(a.length, id).toBeGreaterThan(0);
      expect(render({ text: { main: 'あい', sub: 'b' }, motion: { enter: { id } } }, SAMPLE_TIMES), id).toEqual(a);
    }
    for (const id of EXIT_EFFECT_IDS) expect(() => render({ text: { main: 'あい' }, motion: { exit: { id } } }, SAMPLE_TIMES), id).not.toThrow();
    for (const id of HOLD_EFFECT_IDS) expect(() => render({ text: { main: 'あい' }, motion: { hold: { id } }, style: { glow: { enabled: true } } }, SAMPLE_TIMES), id).not.toThrow();
  });

  it('renders every decoration, background and trailer flow', () => {
    const kinds: DecorationKind[] = ['band', 'hazard', 'box', 'title-frame', 'lines', 'underline', 'side-lines', 'accent-bar', 'corners'];
    for (const kind of kinds) {
      for (const writingMode of ['horizontal', 'vertical'] as const) {
        expect(() => render({ text: { main: 'あい', sub: 'b' }, layout: { writingMode }, style: { decoration: { kind, lineUsesTextStroke: true } } }, SAMPLE_TIMES), `${kind} ${writingMode}`).not.toThrow();
      }
    }
    for (const kind of ['solid', 'vignette', 'bottom-gradient', 'top-gradient'] as const) {
      expect(render({ text: { main: 'あ' }, background: { kind, opacity: 0.5 } }, [1]).some((line) => line.includes('fillRect'))).toBe(true);
    }
    const flows: TrailerFlow[] = ['characters', 'center-characters', 'expand', 'lines', 'smooth-lines', 'simultaneous', 'scroll'];
    for (const flow of flows) {
      expect(() => render({ text: { main: 'あいう\n\nえお' }, motion: { trailer: { flow, cursor: true } } }, SAMPLE_TIMES, 'trailer'), flow).not.toThrow();
    }
  });

  it('draws glow, then shadow/outer, then inner strokes of all glyphs before any fill', () => {
    const log = render({ text: { main: 'AB' }, style: { glow: { enabled: true }, outerStroke: { enabled: true }, innerStroke: { enabled: true } } }, [1.5]);
    const textLayer = 'layer0';
    const composites = log.filter((line) => line.startsWith(`${textLayer}:drawImage(layer1`));
    expect(composites.length).toBeGreaterThanOrEqual(2);
    const textOps = log.filter((line) => line.startsWith(`${textLayer}:strokeText`) || line.startsWith(`${textLayer}:fillText`));
    const firstFill = textOps.findIndex((line) => line.includes(':fillText'));
    const lastStroke = textOps.map((line) => line.includes(':strokeText')).lastIndexOf(true);
    expect(lastStroke).toBeLessThan(firstFill);
    expect(textOps.filter((line) => line.includes(':fillText'))).toHaveLength(2);
  });

  it('applies post effects: flash (source-atop), wipe (destination-in), glitch colours, layer alpha', () => {
    const flash = render({ text: { main: 'A' }, motion: { enter: { id: 'FX-I23' } } }, [0.15]);
    expect(flash.some((line) => line.startsWith('layer0:fillRect') && line.includes('op=source-atop'))).toBe(true);
    const wipe = render({ text: { main: 'A' }, motion: { enter: { id: 'FX-I20' } } }, [0.5]);
    expect(wipe.some((line) => line.startsWith('layer0:fillRect') && line.includes('op=destination-in'))).toBe(true);
    const glitch = render({ text: { main: 'A' }, motion: { enter: { id: 'FX-I22' } }, style: { glitchColors: ['#ABCDEF', '#123456'] } }, [0.2]);
    expect(glitch.some((line) => line.includes('fill=#ABCDEF'))).toBe(true);
    expect(glitch.some((line) => line.includes('fill=#123456'))).toBe(true);
    const blink = render({ text: { main: 'A' }, motion: { hold: { id: 'FX-H07', strength: 0.5 } } }, [0.7 + 0.35]);
    expect(blink.some((line) => line.startsWith('main:drawImage(layer0') && line.includes('a=0.575'))).toBe(true);
  });

  it('skips the fill pass at 0 % fill opacity and knocks the fill area out below 100 %', () => {
    const hollow = render({ text: { main: 'A' }, style: { fill: { opacity: 0 } } }, [1.5]);
    expect(hollow.some((line) => line.startsWith('layer0:fillText') && line.includes('op=destination-out'))).toBe(true);
    expect(hollow.some((line) => line.startsWith('layer0:fillText') && line.includes('op=source-over'))).toBe(false);
  });

  it('createRgbaRenderer returns width × height × 4 bytes', () => {
    const log: string[] = [];
    const rgba = createRgbaRenderer(scene({ text: { main: 'A' } }), 64, 36, { canvasFactory: mockFactory(log) });
    expect(rgba(1)).toHaveLength(64 * 36 * 4);
    expect(log.length).toBeGreaterThan(0);
  });

  it('builds CSS font strings with quoted families and a generic fallback', () => {
    expect(defaultFontFamily('Noto Serif JP')).toBe('"Noto Serif JP", serif');
    expect(defaultFontFamily('Noto Sans JP')).toBe('"Noto Sans JP", sans-serif');
    expect(defaultFontFamily('"A", B, sans-serif')).toBe('"A", B, sans-serif');
    expect(fontString({ family: 'serif', size: 20, weight: 700, italic: true, letterSpacing: 0 })).toBe('italic 700 20px serif');
  });
});
