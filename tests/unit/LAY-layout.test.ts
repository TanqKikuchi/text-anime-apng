import { describe, expect, it } from 'vitest';
import {
  canvasSize,
  estimateOutsets,
  glyphSeed,
  layoutScene,
  LINE_END_PROHIBITED,
  LINE_START_PROHIBITED,
  lineWidth,
  MonospaceMeasurer,
  normalizeText,
  segmentGraphemes,
  splitTrailerPages,
  validateScene,
  wrapHorizontalLine,
  wrapText,
  wrapVerticalLine,
  type LayoutGlyph,
} from '../../src/core';
import { mono, scene } from './helpers/engine';

const S = 100;
const font = (letterSpacing = 0) => ({ family: 'x', size: S, weight: 700, italic: false, letterSpacing });
const text = (lines: string[][]) => lines.map((line) => line.join(''));
const byText = (glyphs: readonly LayoutGlyph[], char: string) => glyphs.find((glyph) => glyph.text === char)!;
const base = { text: { mainFont: { size: S, letterSpacing: 0 }, lineHeight: 1.5 }, layout: { autoShrink: false }, style: { shadow: { enabled: false }, innerStroke: { enabled: false } } } as const;

describe('LAY-01 text decomposition', () => {
  it('keeps emoji ZWJ sequences as one grapheme and normalises line breaks', () => {
    expect(segmentGraphemes('👨‍👩‍👧')).toHaveLength(1);
    expect(segmentGraphemes('A B')).toHaveLength(3);
    expect(normalizeText('a\r\nb\rc')).toBe('a\nb\nc');
  });

  it('counts whitespace as a position but not as a drawable glyph', () => {
    const layout = layoutScene(scene({ ...base, text: { ...base.text, main: 'A B' } }), mono);
    const glyphs = layout.pages[0]!.main.glyphs;
    expect(glyphs).toHaveLength(3);
    expect(glyphs.filter((glyph) => glyph.drawable)).toHaveLength(2);
    expect(layout.pages[0]!.drawableCount).toBe(2);
  });

  it('treats whitespace-only sub text as no sub text', () => {
    const layout = layoutScene(scene({ ...base, text: { ...base.text, main: 'A', sub: ' 　 ' } }), mono);
    expect(layout.pages[0]!.sub).toBeUndefined();
  });
});

describe('LAY-02 horizontal lines', () => {
  it('adds letter spacing between characters only (S × 1.0 for 3 chars at 0.5 em)', () => {
    const chars = ['あ', 'い', 'う'];
    expect(lineWidth(chars, font(0.5), mono) - lineWidth(chars, font(0), mono)).toBeCloseTo(S * 1.0);
  });

  it('centres a short line inside a long line and stacks baselines by line height', () => {
    const layout = layoutScene(scene({ ...base, text: { ...base.text, main: 'あいうえ\nかき' } }), mono);
    const glyphs = layout.pages[0]!.main.glyphs;
    const longCenter = (byText(glyphs, 'あ').x + byText(glyphs, 'え').x) / 2;
    const shortCenter = (byText(glyphs, 'か').x + byText(glyphs, 'き').x) / 2;
    expect(shortCenter).toBeCloseTo(longCenter);
    expect(byText(glyphs, 'か').y - byText(glyphs, 'あ').y).toBeCloseTo(1.5 * S);
  });

  it('centres glyphs on the ink box and computes the block range from non-empty lines', () => {
    const layout = layoutScene(scene({ ...base, text: { ...base.text, main: 'あ\n\nい' }, layout: { autoShrink: false, anchor: 'top-left', marginX: 0, marginY: 0 } }), mono);
    const page = layout.pages[0]!;
    const a = byText(page.main.glyphs, 'あ');
    // baseline − (ascent − descent) / 2 with ascent 0.8S, descent 0.2S
    expect(a.y - page.box.top).toBeCloseTo(0.8 * S - 0.3 * S);
    expect(page.box.height).toBeCloseTo(2 * 1.5 * S + S);
    expect(a.baselineOffset).toBeCloseTo(0.3 * S);
  });
});

describe('LAY-03 vertical columns', () => {
  const vertical = (main: string, alignment: 'start' | 'center' | 'end' = 'center') =>
    layoutScene(scene({ ...base, text: { ...base.text, main }, layout: { writingMode: 'vertical', autoShrink: false, alignment } }), mono).pages[0]!;

  it('places columns right to left', () => {
    const page = vertical('あい\nう');
    const a = byText(page.main.glyphs, 'あ');
    const i = byText(page.main.glyphs, 'い');
    const u = byText(page.main.glyphs, 'う');
    expect(a.x).toBeCloseTo(i.x);
    expect(i.y - a.y).toBeCloseTo(S);
    expect(a.x - u.x).toBeCloseTo(1.5 * S);
  });

  it('aligns column ends with bottom alignment', () => {
    const page = vertical('あい\nう', 'end');
    expect(byText(page.main.glyphs, 'う').y).toBeCloseTo(byText(page.main.glyphs, 'い').y);
  });
});

describe('LAY-04 vertical punctuation offsets', () => {
  it('shifts 、 by 0.5em right/up and small kana by 0.1em', () => {
    const page = layoutScene(scene({ ...base, text: { ...base.text, main: 'あ、ぁ' }, layout: { writingMode: 'vertical', autoShrink: false } }), mono).pages[0]!;
    const [a, comma, small] = page.main.glyphs;
    expect(comma!.x - a!.x).toBeCloseTo(0.5 * S);
    expect(comma!.y - a!.y).toBeCloseTo(S - 0.5 * S);
    expect(small!.x - a!.x).toBeCloseTo(0.1 * S);
    expect(small!.y - a!.y).toBeCloseTo(2 * S - 0.1 * S);
  });
});

describe('LAY-05 rotated characters in vertical writing', () => {
  it('rotates ー, （ and Latin; Latin advance is the measured width', () => {
    const half = new MonospaceMeasurer(0.5);
    const page = layoutScene(scene({ ...base, text: { ...base.text, main: 'ー（ABCあ' }, layout: { writingMode: 'vertical', autoShrink: false, alignment: 'start' } }), half).pages[0]!;
    const glyphs = page.main.glyphs;
    for (const char of ['ー', '（', 'A', 'B', 'C']) expect(byText(glyphs, char).rotation).toBeCloseTo(Math.PI / 2);
    expect(byText(glyphs, 'あ').rotation).toBe(0);
    const abc = ['A', 'B', 'C'].map((c) => byText(glyphs, c));
    expect(abc.reduce((sum, g) => sum + g.advance, 0)).toBeCloseTo(3 * 0.5 * S);
    expect(byText(glyphs, 'A').ascent + byText(glyphs, 'A').descent).toBeCloseTo(0.5 * S);
  });
});

describe('LAY-06 automatic wrapping (horizontal)', () => {
  const wrap = (input: string, count: number) => text(wrapHorizontalLine(segmentGraphemes(input), count * S, font(0), mono));

  it('hangs a line-start prohibited period and pushes an opening bracket', () => {
    expect(wrap('あいうえお。かき', 5)).toEqual(['あいうえお。', 'かき']);
    expect(wrap('あいうえ「お', 5)).toEqual(['あいうえ', '「お']);
  });

  it('keeps words together and drops leading spaces on following lines', () => {
    expect(wrap('hello world', 8)).toEqual(['hello', 'world']);
    expect(wrap('abcdefghij', 4)).toEqual(['abcd', 'efgh', 'ij']);
  });

  it('applies to trailer main text only, using W_c × S × (1 + spacing)', () => {
    const trailer = scene({ mode: 'trailer', text: { main: 'あいうえおかきくけこ', maxCharactersPerLine: 5, mainFont: { size: S, letterSpacing: 0.08 } } }, 'trailer');
    expect(text(wrapText(trailer.text.main, trailer, { ...trailer.text.mainFont }, mono))).toEqual(['あいうえお', 'かきくけこ']);
    const message = scene({ text: { main: 'あいうえおかきくけこ', maxCharactersPerLine: 5 } });
    expect(wrapText(message.text.main, message, message.text.mainFont, mono)).toHaveLength(1);
  });
});

describe('LAY-07 automatic wrapping (vertical)', () => {
  it('wraps by character count with hanging punctuation', () => {
    expect(text(wrapVerticalLine(segmentGraphemes('あいう、え'), 3))).toEqual(['あいう、', 'え']);
    expect(text(wrapVerticalLine(segmentGraphemes('あいう「え'), 3))).toEqual(['あいう', '「え']);
  });
});

describe('LAY-08 kinsoku character classes', () => {
  const starts = [...'、。，．・：；？！゛゜ヽヾゝゞ々ー）］｝」』】〉》〕…‥ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ!),.:;?]}’”%％'];
  const ends = [...'（［｛「『【〈《〔([{‘“'];

  it('hangs every line-start prohibited character', () => {
    for (const char of starts) {
      expect(LINE_START_PROHIBITED.has(char)).toBe(true);
      const lines = text(wrapHorizontalLine(segmentGraphemes(`あいうえお${char}か`), 5 * S, font(0), mono));
      expect(lines[0], char).toBe(`あいうえお${char}`);
    }
  });

  it('pushes every line-end prohibited character to the next line', () => {
    for (const char of ends) {
      expect(LINE_END_PROHIBITED.has(char)).toBe(true);
      const lines = text(wrapHorizontalLine(segmentGraphemes(`あいうえ${char}お`), 5 * S, font(0), mono));
      expect(lines, char).toEqual(['あいうえ', `${char}お`]);
    }
  });
});

describe('LAY-09 alignment', () => {
  it('aligns lines to the start / end of the block', () => {
    const page = (alignment: 'start' | 'end') => layoutScene(scene({ ...base, text: { ...base.text, main: 'あいう\nか' }, layout: { autoShrink: false, alignment } }), mono).pages[0]!;
    const start = page('start');
    expect(byText(start.main.glyphs, 'か').x).toBeCloseTo(byText(start.main.glyphs, 'あ').x);
    const end = page('end');
    expect(byText(end.main.glyphs, 'か').x).toBeCloseTo(byText(end.main.glyphs, 'う').x);
  });
});

describe('LAY-10 sub text placement', () => {
  it('puts the sub below the main with gap × S (horizontal)', () => {
    const page = layoutScene(scene({ ...base, text: { ...base.text, main: 'メイン', sub: 'sub', subGap: 0.3, subPosition: 'after', subScale: 0.3 } }), mono).pages[0]!;
    expect(page.sub!.box.top - page.main.box.bottom).toBeCloseTo(0.3 * S);
    expect(page.sub!.glyphs[0]!.font.size).toBeCloseTo(0.3 * S);
    expect(page.box.bottom).toBeCloseTo(page.sub!.box.bottom);
  });

  it('puts the sub to the right of the main for vertical "before"', () => {
    const page = layoutScene(scene({ ...base, text: { ...base.text, main: 'メイン', sub: 'さぶ', subPosition: 'before' }, layout: { writingMode: 'vertical', autoShrink: false } }), mono).pages[0]!;
    expect(page.sub!.box.left).toBeGreaterThan(page.main.box.right);
  });

  it('uses the main family when subFontInherit is on', () => {
    const page = layoutScene(scene({ ...base, text: { ...base.text, main: 'A', sub: 'b', subFontInherit: true, mainFont: { family: 'Main', size: S }, subFont: { family: 'Other' } } }), mono).pages[0]!;
    expect(page.sub!.glyphs[0]!.font.family).toBe('Main');
  });
});

describe('LAY-11 trailer pages', () => {
  it('splits on blank or whitespace-only lines unless scrolling', () => {
    expect(splitTrailerPages('A\n\nB\n \nC', true, false)).toEqual(['A', 'B', 'C']);
    expect(splitTrailerPages('A\n\nB', true, true)).toHaveLength(1);
    expect(splitTrailerPages('A\n\nB', false, false)).toHaveLength(1);
    expect(splitTrailerPages('\n\n', true, false)).toEqual(['']);
    const layout = layoutScene(scene({ mode: 'trailer', text: { main: 'A\n\nB\n \nC' } }, 'trailer'), mono);
    expect(layout.pages).toHaveLength(3);
    expect(layout.pages.every((page) => page.sub === undefined)).toBe(true);
  });
});

describe('LAY-12 auto shrink', () => {
  const long = 'あ'.repeat(30);

  it('shrinks a 30-character line at 120px on 1280×720 and reports it', () => {
    const layout = layoutScene(scene({ text: { main: long, mainFont: { size: 120 } } }), mono);
    expect(layout.shrunk).toBe(true);
    expect(layout.fontSize).toBeLessThan(120);
    const page = layout.pages[0]!;
    expect(page.box.width).toBeLessThanOrEqual(1280 - 2 * 64 + 1e-6);
  });

  it('does not shrink when off', () => {
    const layout = layoutScene(scene({ text: { main: long, mainFont: { size: 120 } }, layout: { autoShrink: false } }), mono);
    expect(layout.scale).toBe(1);
    expect(layout.shrunk).toBe(false);
  });

  it('uses the minimum factor over all pages and ignores the scroll axis', () => {
    const paged = layoutScene(scene({ mode: 'trailer', text: { main: `あ\n\n${'い'.repeat(40)}`, mainFont: { size: 100 } } }, 'trailer'), mono);
    expect(paged.pages[0]!.main.glyphs[0]!.font.size).toBeCloseTo(paged.pages[1]!.main.glyphs[0]!.font.size);
    const tall = Array.from({ length: 30 }, () => 'あ').join('\n');
    const scroll = layoutScene(scene({ mode: 'trailer', text: { main: tall, mainFont: { size: 100 } }, motion: { trailer: { flow: 'scroll' } } }, 'trailer'), mono);
    expect(scroll.scale).toBe(1);
  });
});

describe('LAY-13 shift to avoid clipping when shrinking', () => {
  it('moves a top-left block right/down so a large shadow is not cut', () => {
    const s = scene({ text: { main: 'あ', mainFont: { size: S } }, layout: { anchor: 'top-left', marginX: 0, marginY: 0 }, style: { shadow: { enabled: true, blur: 40, offsetX: 0, offsetY: 0 }, innerStroke: { enabled: false } } });
    const layout = layoutScene(s, mono);
    expect(layout.pages[0]!.box.left).toBeCloseTo(layout.visualOutsets.left);
    expect(layout.pages[0]!.box.top).toBeCloseTo(layout.visualOutsets.top);
  });
});

describe('LAY-14 anchor, margins and offsets', () => {
  it('places the outer box corner at (W − 64, H − 56) for bottom-right and adds offsets', () => {
    const at = (offsetX: number) => layoutScene(scene({ ...base, text: { ...base.text, main: 'あい' }, layout: { anchor: 'bottom-right', marginX: 64, marginY: 56, autoShrink: false, offsetX } }), mono).pages[0]!.box;
    const box = at(0);
    expect(box.right).toBeCloseTo(1280 - 64);
    expect(box.bottom).toBeCloseTo(720 - 56);
    expect(at(10).right - box.right).toBeCloseTo(10);
  });

  it('centres the decorated outer box', () => {
    const page = layoutScene(scene({ ...base, text: { ...base.text, main: 'あい' }, style: { ...base.style, decoration: { kind: 'accent-bar', padding: 0.3, lineWidth: 2 } } }), mono).pages[0]!;
    const outerLeft = page.box.left - (0.3 * S + 2);
    expect((outerLeft + page.box.right) / 2).toBeCloseTo(640);
  });
});

describe('LAY-15 outset estimation', () => {
  it('underline (horizontal, pad 0.3, th 2) extends 0.3S + 2 downward', () => {
    const s = scene({ style: { decoration: { kind: 'underline', padding: 0.3, lineWidth: 2, lineExtent: 0.5 } } });
    const { decoration } = estimateOutsets(s, S, 1);
    expect(decoration.bottom).toBeCloseTo(0.3 * S + 2);
    expect(decoration.left).toBeCloseTo(0.5 * S);
    expect(decoration.top).toBe(0);
  });

  it('accounts for strokes, glow and shadow offsets', () => {
    const s = scene({ style: { innerStroke: { enabled: true, width: 5 }, outerStroke: { enabled: true, width: 6 }, glow: { enabled: false }, shadow: { enabled: true, blur: 10, offsetX: 4, offsetY: 8 } } });
    const { visual } = estimateOutsets(s, S, 1);
    expect(visual.right).toBeCloseTo(11 + 12.5 + 4);
    expect(visual.left).toBeCloseTo(11 + 12.5 - 4);
    expect(visual.bottom).toBeCloseTo(11 + 12.5 + 8);
    const half = estimateOutsets(s, S / 2, 0.5).visual;
    expect(half.right).toBeCloseTo(visual.right / 2);
  });

  it('includes text strokes in the line thickness when DEC-20 is on, and handles vertical tables', () => {
    const s = scene({ layout: { writingMode: 'vertical' }, style: { innerStroke: { enabled: true, width: 3 }, decoration: { kind: 'hazard', padding: 0.1, tapeWidth: 20 } } });
    expect(estimateOutsets(s, S, 1).decoration).toEqual({ left: 0.1 * S + 20, right: 0.1 * S + 20, top: 0, bottom: 0 });
    const lines = scene({ style: { innerStroke: { enabled: true, width: 3 }, decoration: { kind: 'lines', padding: 0, lineWidth: 2, lineUsesTextStroke: true } } });
    expect(estimateOutsets(lines, S, 1).decoration.top).toBeCloseTo(5);
  });
});

describe('LAY-16 canvas size', () => {
  it('maps presets and clamps custom sizes to 32〜3840', () => {
    expect(canvasSize('hd')).toEqual({ width: 1280, height: 720 });
    expect(canvasSize('portrait')).toEqual({ width: 720, height: 1280 });
    expect(canvasSize('custom', 5000, 10)).toEqual({ width: 3840, height: 32 });
    expect(validateScene({ canvas: { width: 5000, height: 12.4, preset: 'custom' } }).canvas).toEqual({ width: 3840, height: 32, preset: 'custom' });
  });
});

describe('LAY-17 per-glyph information', () => {
  it('assigns display indexes, parity, seeds and line data', () => {
    const page = layoutScene(scene({ ...base, text: { ...base.text, main: 'あ い' } }), mono).pages[0]!;
    const [a, space, i] = page.main.glyphs;
    expect(i!.displayIndex).toBe(1);
    expect(i!.odd).toBe(true);
    expect(space!.displayIndex).toBe(-1);
    expect(a!.seed).toBe(glyphSeed(0, 0, 0));
    expect(i!.seed).toBe(glyphSeed(0, 0, 2));
    expect(a!.lineOffset).toBeCloseTo(-i!.lineOffset);
    expect(a!.linePosition).toBe(0);
    expect(i!.lineDisplayCount).toBe(2);
    expect(i!.lineReach).toBeCloseTo(S);
    const again = layoutScene(scene({ ...base, text: { ...base.text, main: 'あ い' } }), mono).pages[0]!;
    expect(again.main.glyphs.map((g) => g.seed)).toEqual(page.main.glyphs.map((g) => g.seed));
  });
});
