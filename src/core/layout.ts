import { glyphSeed } from './random';
import { resolveSubFont, type Alignment, type FontSettings, type Scene } from './scene';

export interface TextMeasurement {
  /** Advance width of the whole string in px. */
  readonly width: number;
  /** Ink extent above the alphabetic baseline (actualBoundingBoxAscent); undefined if unknown. */
  readonly ascent?: number;
  /** Ink extent below the baseline (actualBoundingBoxDescent); undefined if unknown. */
  readonly descent?: number;
}

/** Abstract text measurement so layout runs in Node (tests use a fake monospace measurer). */
export interface TextMeasurer {
  measure(text: string, font: FontSettings): TextMeasurement;
}

export interface Box {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
}

/** LAY-17: per-glyph layout data. Coordinates are canvas px (after placement). */
export interface LayoutGlyph {
  readonly text: string;
  readonly pageIndex: number;
  readonly group: 'main' | 'sub';
  /** 0 = main, 1 = sub. */
  readonly groupIndex: number;
  /** Running index inside the group (whitespace included). */
  readonly sourceIndex: number;
  /** Index inside the group without whitespace; −1 for whitespace. */
  readonly displayIndex: number;
  readonly odd: boolean;
  readonly seed: number;
  readonly lineIndex: number;
  readonly lineDisplayCount: number;
  /** Signed distance from the line centre along the line direction. */
  readonly lineOffset: number;
  /** 0 at the line start … <1 at the last glyph (based on glyph start position). */
  readonly linePosition: number;
  readonly lineReach: number;
  /** Glyph centre. */
  readonly x: number;
  readonly y: number;
  /** Advance along the line direction. */
  readonly advance: number;
  /** Ink extent above / below the glyph centre line (for decorations and glow margins). */
  readonly ascent: number;
  readonly descent: number;
  /** Draw with textBaseline 'alphabetic' at (centre.x, centre.y + baselineOffset) in glyph-local space. */
  readonly baselineOffset: number;
  /** Vertical gradient range (DEC-01 "line-vertical"): line ink top/bottom, or the glyph frame in vertical writing. */
  readonly inkTop: number;
  readonly inkBottom: number;
  /** Base rotation (π/2 for sideways glyphs in vertical writing). */
  readonly rotation: number;
  readonly rotated: boolean;
  readonly drawable: boolean;
  readonly font: FontSettings;
}

export interface TextBlockLayout {
  readonly glyphs: readonly LayoutGlyph[];
  readonly box: Box;
  readonly lineCount: number;
}

export interface PageLayout {
  readonly index: number;
  readonly main: TextBlockLayout;
  readonly sub?: TextBlockLayout;
  readonly glyphs: readonly LayoutGlyph[];
  /** Page box = union of the main and sub boxes. */
  readonly box: Box;
  readonly contentBox: Box;
  /** Number of drawable glyphs. */
  readonly drawableCount: number;
}

export interface Outsets {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

export interface SceneLayout {
  readonly pages: readonly PageLayout[];
  /** Actual size S after auto shrink. */
  readonly fontSize: number;
  /** The font-size setting (before shrink). */
  readonly baseSize: number;
  /** Shrink factor f (stroke / shadow / glow px values are multiplied by it). */
  readonly scale: number;
  readonly shrunk: boolean;
  readonly decorationOutsets: Outsets;
  readonly visualOutsets: Outsets;
  readonly vertical: boolean;
  readonly scrolling: boolean;
}

function graphemeSet(text: string): ReadonlySet<string> {
  return new Set(segmentGraphemes(text));
}

/** LAY-08 line-start prohibited characters (hang at the line end). */
export const LINE_START_PROHIBITED: ReadonlySet<string> = graphemeSet('、。，．・：；？！゛゜ヽヾゝゞ々ー）］｝」』】〉》〕…‥ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ!),.:;?]}’”%％');
/** LAY-08 line-end prohibited characters (pushed to the next line). */
export const LINE_END_PROHIBITED: ReadonlySet<string> = graphemeSet('（［｛「『【〈《〔([{‘“');

const VERTICAL_ROTATED = graphemeSet('ー－―—‐‑–-～〜~…‥（）()「」『』【】〔〕［］[]｛｝{}〈〉《》<>＜＞＝=：:；;｜|→←');
const SMALL_KANA = graphemeSet('ぁぃぅぇぉっゃゅょゎゕゖァィゥェォッャュョヮヵヶ');
const VERTICAL_PUNCTUATION = graphemeSet('、。，．');
const WORD_CHARACTER = /^[A-Za-z0-9'’\-_.,!?&:;%$#@/ᄀ-ᇿ㄰-㆏가-힯]$/u;

export function normalizeText(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}

/** LAY-01: grapheme segmentation (code points when Intl.Segmenter is unavailable). */
export function segmentGraphemes(text: string): string[] {
  const Segmenter = (Intl as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
  if (typeof Segmenter === 'function') {
    return Array.from(new Segmenter(undefined, { granularity: 'grapheme' }).segment(text), ({ segment }) => segment);
  }
  return Array.from(text);
}

export function isWhitespace(text: string): boolean {
  return /^\s+$/u.test(text) || text === '　';
}

export function isWordCharacter(text: string): boolean {
  return WORD_CHARACTER.test(text);
}

/** LAY-05: characters drawn rotated 90° clockwise in vertical writing. */
export function isVerticalRotated(char: string): boolean {
  if (VERTICAL_ROTATED.has(char)) return true;
  const code = char.codePointAt(0) ?? 0;
  return (code >= 0x20 && code <= 0x024f) || (code >= 0x0370 && code <= 0x04ff) || (code >= 0x2010 && code <= 0x201f);
}

/** LAY-04: draw offset (em) for vertical punctuation / small kana, as [right, up]. */
export function verticalPunctuationShift(char: string): readonly [number, number] {
  if (VERTICAL_PUNCTUATION.has(char)) return [0.5, 0.5];
  if (SMALL_KANA.has(char)) return [0.1, 0.1];
  return [0, 0];
}

/** LAY-11: trailer pages separated by one or more blank (or whitespace-only) lines. */
export function splitTrailerPages(text: string, enabled: boolean, scrolling: boolean): string[] {
  const normalized = normalizeText(text);
  if (!enabled || scrolling) return [normalized];
  const pages = normalized
    .split(/\n(?:[^\S\n]*\n)+/u)
    .map((page) => page.replace(/^\n+|\n+$/g, ''))
    .filter((page) => page.trim().length > 0);
  return pages.length > 0 ? pages : [''];
}

export function makeBox(left: number, top: number, right: number, bottom: number): Box {
  return { left, top, right, bottom, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

export function translateBox(box: Box, x: number, y: number): Box {
  return makeBox(box.left + x, box.top + y, box.right + x, box.bottom + y);
}

export function unionBox(a: Box, b: Box): Box {
  return makeBox(Math.min(a.left, b.left), Math.min(a.top, b.top), Math.max(a.right, b.right), Math.max(a.bottom, b.bottom));
}

export function expandBox(box: Box, outsets: Outsets | number): Box {
  const o = typeof outsets === 'number' ? { left: outsets, right: outsets, top: outsets, bottom: outsets } : outsets;
  return makeBox(box.left - o.left, box.top - o.top, box.right + o.right, box.bottom + o.bottom);
}

function translateBlock(block: TextBlockLayout, x: number, y: number): TextBlockLayout {
  return {
    ...block,
    box: translateBox(block.box, x, y),
    glyphs: block.glyphs.map((glyph) => ({ ...glyph, x: glyph.x + x, y: glyph.y + y, inkTop: glyph.inkTop + y, inkBottom: glyph.inkBottom + y })),
  };
}

export function alignmentCoefficient(alignment: Alignment): number {
  return alignment === 'start' ? 0 : alignment === 'center' ? 0.5 : 1;
}

/** LAY-02 line width: measured string width + S × letterSpacing × (n − 1). */
export function lineWidth(chars: readonly string[], font: FontSettings, measurer: TextMeasurer): number {
  if (chars.length === 0) return 0;
  return measurer.measure(chars.join(''), font).width + font.size * font.letterSpacing * (chars.length - 1);
}

/** Splits a line into wrap elements: runs of word characters, or single other graphemes. */
export function tokenizeLine(line: readonly string[]): string[][] {
  const tokens: string[][] = [];
  let word: string[] = [];
  for (const char of line) {
    if (isWordCharacter(char)) {
      word.push(char);
      continue;
    }
    if (word.length > 0) tokens.push(word);
    word = [];
    tokens.push([char]);
  }
  if (word.length > 0) tokens.push(word);
  return tokens;
}

/** LAY-06: wraps one explicit line at `maximum` px with word keeping and kinsoku. */
export function wrapHorizontalLine(line: readonly string[], maximum: number, font: FontSettings, measurer: TextMeasurer): string[][] {
  if (maximum <= 0 || line.length === 0) return [[...line]];
  const output: string[][] = [];
  let current: string[] = [];
  const width = (chars: readonly string[]): number => lineWidth(chars, font, measurer);
  const breakLine = (): void => {
    const carry: string[] = [];
    while (current.length > 1 && LINE_END_PROHIBITED.has(current[current.length - 1]!)) carry.unshift(current.pop()!);
    while (current.length > 0 && isWhitespace(current[current.length - 1]!)) current.pop();
    if (current.length > 0) output.push(current);
    current = carry;
  };
  const addElement = (element: readonly string[]): void => {
    const whitespace = element.length === 1 && isWhitespace(element[0]!);
    if (current.length === 0 && output.length > 0 && whitespace) return;
    if (current.length === 0 || width([...current, ...element]) <= maximum) {
      current.push(...element);
      return;
    }
    if (element.length === 1 && LINE_START_PROHIBITED.has(element[0]!)) {
      current.push(element[0]!);
      output.push(current);
      current = [];
      return;
    }
    breakLine();
    if (whitespace && current.length === 0) return;
    current.push(...element);
  };
  for (const token of tokenizeLine(line)) {
    if (token.length > 1 && width(token) > maximum) {
      for (const char of token) addElement([char]);
    } else {
      addElement(token);
    }
  }
  if (current.length > 0 || output.length === 0) output.push(current);
  return output;
}

/** LAY-07: vertical wrapping by character count with kinsoku (no word keeping). */
export function wrapVerticalLine(line: readonly string[], maximumCharacters: number): string[][] {
  if (maximumCharacters <= 0 || line.length === 0) return [[...line]];
  const output: string[][] = [];
  let current: string[] = [];
  for (const char of line) {
    if (current.length >= maximumCharacters && !LINE_START_PROHIBITED.has(char)) {
      const carry: string[] = [];
      while (current.length > 1 && LINE_END_PROHIBITED.has(current[current.length - 1]!)) carry.unshift(current.pop()!);
      output.push(current);
      current = carry;
    }
    current.push(char);
  }
  output.push(current);
  return output;
}

/** Explicit lines → wrapped lines (auto wrap applies to trailer main text only). */
export function wrapText(text: string, scene: Scene, font: FontSettings, measurer: TextMeasurer, group: 'main' | 'sub' = 'main'): string[][] {
  const explicit = normalizeText(text).split('\n').map(segmentGraphemes);
  const count = scene.mode === 'trailer' && group === 'main' ? scene.text.maxCharactersPerLine : 0;
  if (count <= 0) return explicit;
  if (scene.layout.writingMode === 'vertical') return explicit.flatMap((line) => wrapVerticalLine(line, count));
  const maxWidth = count * font.size * (1 + font.letterSpacing);
  return explicit.flatMap((line) => wrapHorizontalLine(line, maxWidth, font, measurer));
}

interface BlockOptions {
  readonly font: FontSettings;
  readonly lineHeight: number;
  readonly pageIndex: number;
  readonly group: 'main' | 'sub';
  readonly measurer: TextMeasurer;
  readonly alignment: Alignment;
}

function glyphBase(options: BlockOptions, sourceIndex: number, displayIndex: number, drawable: boolean): Pick<LayoutGlyph, 'pageIndex' | 'group' | 'groupIndex' | 'sourceIndex' | 'displayIndex' | 'odd' | 'seed' | 'drawable' | 'font'> {
  const groupIndex = options.group === 'main' ? 0 : 1;
  return {
    pageIndex: options.pageIndex,
    group: options.group,
    groupIndex,
    sourceIndex,
    displayIndex: drawable ? displayIndex : -1,
    odd: drawable && displayIndex % 2 === 1,
    seed: glyphSeed(options.pageIndex, groupIndex, sourceIndex),
    drawable,
    font: options.font,
  };
}

/** LAY-02 horizontal block in local coordinates (x from 0, first baseline at y = 0). */
export function layoutHorizontalBlock(lines: readonly (readonly string[])[], options: BlockOptions): TextBlockLayout {
  const { font, measurer } = options;
  const spacing = font.size * font.letterSpacing;
  const widths = lines.map((line) => lineWidth(line, font, measurer));
  const blockWidth = Math.max(0, ...widths);
  const coefficient = alignmentCoefficient(options.alignment);
  const glyphs: LayoutGlyph[] = [];
  let sourceIndex = 0;
  let displayIndex = 0;
  let top = Number.POSITIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  lines.forEach((line, lineIndex) => {
    const metrics = measurer.measure(line.join('') || 'M', font);
    const ascent = metrics.ascent ?? font.size * 0.8;
    const descent = metrics.descent ?? font.size * 0.12;
    const baseline = lineIndex * options.lineHeight * font.size;
    const width = widths[lineIndex]!;
    const startX = (blockWidth - width) * coefficient;
    const lineCenter = startX + width / 2;
    const displayCount = line.filter((char) => !isWhitespace(char)).length;
    const starts: number[] = [];
    const advances: number[] = [];
    let previous = 0;
    line.forEach((_, index) => {
      const prefix = measurer.measure(line.slice(0, index + 1).join(''), font).width;
      starts.push(startX + previous + spacing * index);
      advances.push(Math.max(0, prefix - previous));
      previous = prefix;
    });
    const centers = starts.map((start, index) => start + advances[index]! / 2);
    const reach = Math.max(0, ...centers.filter((_, index) => !isWhitespace(line[index]!)).map((center) => Math.abs(center - lineCenter)));
    const centerY = baseline - (ascent - descent) / 2;
    line.forEach((char, index) => {
      const drawable = !isWhitespace(char);
      glyphs.push({
        ...glyphBase(options, sourceIndex, displayIndex, drawable),
        text: char,
        lineIndex,
        lineDisplayCount: displayCount,
        lineOffset: centers[index]! - lineCenter,
        linePosition: width > 0 ? (starts[index]! - startX) / width : 0,
        lineReach: reach,
        x: centers[index]!,
        y: centerY,
        advance: advances[index]!,
        ascent: (ascent + descent) / 2,
        descent: (ascent + descent) / 2,
        baselineOffset: (ascent - descent) / 2,
        inkTop: baseline - ascent,
        inkBottom: baseline + descent,
        rotation: 0,
        rotated: false,
      });
      sourceIndex += 1;
      if (drawable) displayIndex += 1;
    });
    if (displayCount > 0) {
      top = Math.min(top, baseline - ascent);
      bottom = Math.max(bottom, baseline + descent);
    }
  });
  if (!Number.isFinite(top)) {
    top = -font.size * 0.8;
    bottom = font.size * 0.2;
  }
  return { glyphs, lineCount: lines.length, box: makeBox(0, top, blockWidth, bottom) };
}

/** LAY-03〜05 vertical block in local coordinates (first column centre at x = 0, top at y = 0). */
export function layoutVerticalBlock(lines: readonly (readonly string[])[], options: BlockOptions): TextBlockLayout {
  const { font, measurer } = options;
  const S = font.size;
  const spacing = S * font.letterSpacing;
  const pitch = options.lineHeight * S;
  const coefficient = alignmentCoefficient(options.alignment);
  const advances = lines.map((line) => line.map((char) => (isVerticalRotated(char) ? measurer.measure(char, font).width : S)));
  const lengths = advances.map((values) => values.reduce((sum, value) => sum + value, 0) + Math.max(0, values.length - 1) * spacing);
  const longest = Math.max(S * 0.1, ...lengths);
  const glyphs: LayoutGlyph[] = [];
  let sourceIndex = 0;
  let displayIndex = 0;
  lines.forEach((line, lineIndex) => {
    const lineTop = (longest - lengths[lineIndex]!) * coefficient;
    const lineCenter = lineTop + lengths[lineIndex]! / 2;
    const displayCount = line.filter((char) => !isWhitespace(char)).length;
    let cursor = lineTop;
    const starts: number[] = [];
    const centers = advances[lineIndex]!.map((advance) => {
      starts.push(cursor);
      const value = cursor + advance / 2;
      cursor += advance + spacing;
      return value;
    });
    const reach = Math.max(0, ...centers.filter((_, index) => !isWhitespace(line[index]!)).map((center) => Math.abs(center - lineCenter)));
    const columnX = -lineIndex * pitch;
    line.forEach((char, index) => {
      const drawable = !isWhitespace(char);
      const advance = advances[lineIndex]![index]!;
      const rotated = isVerticalRotated(char);
      const [right, up] = verticalPunctuationShift(char);
      const metrics = drawable ? measurer.measure(char, font) : { width: S };
      const inkAscent = metrics.ascent ?? S * 0.8;
      const inkDescent = metrics.descent ?? S * 0.12;
      const centerY = centers[index]!;
      glyphs.push({
        ...glyphBase(options, sourceIndex, displayIndex, drawable),
        text: char,
        lineIndex,
        lineDisplayCount: displayCount,
        lineOffset: centerY - lineCenter,
        linePosition: lengths[lineIndex]! > 0 ? (starts[index]! - lineTop) / lengths[lineIndex]! : 0,
        lineReach: reach,
        x: columnX + right * S,
        y: centerY - up * S,
        advance,
        ascent: rotated ? advance / 2 : S / 2,
        descent: rotated ? advance / 2 : S / 2,
        baselineOffset: (inkAscent - inkDescent) / 2,
        inkTop: centerY - advance / 2,
        inkBottom: centerY + advance / 2,
        rotation: rotated ? Math.PI / 2 : 0,
        rotated,
      });
      sourceIndex += 1;
      if (drawable) displayIndex += 1;
    });
  });
  const columns = Math.max(1, lines.length);
  return { glyphs, lineCount: lines.length, box: makeBox(-(columns - 1) * pitch - S / 2, 0, S / 2, longest) };
}

function layoutBlock(text: string, scene: Scene, font: FontSettings, pageIndex: number, group: 'main' | 'sub', measurer: TextMeasurer): TextBlockLayout {
  const lines = wrapText(text, scene, font, measurer, group);
  const options: BlockOptions = { font, lineHeight: scene.text.lineHeight, pageIndex, group, measurer, alignment: scene.layout.alignment };
  return scene.layout.writingMode === 'horizontal' ? layoutHorizontalBlock(lines, options) : layoutVerticalBlock(lines, options);
}

/** Lays out one page (main + optional sub, LAY-10) in local coordinates at actual size `size`. */
export function layoutPageLocal(scene: Scene, text: string, size: number, pageIndex: number, measurer: TextMeasurer): PageLayout {
  let main = layoutBlock(text, scene, { ...scene.text.mainFont, size }, pageIndex, 'main', measurer);
  let sub: TextBlockLayout | undefined;
  if (scene.mode !== 'trailer' && pageIndex === 0 && scene.text.sub.trim().length > 0) {
    sub = layoutBlock(scene.text.sub, scene, resolveSubFont(scene, size), pageIndex, 'sub', measurer);
    const gap = scene.text.subGap * size;
    const coefficient = alignmentCoefficient(scene.layout.alignment);
    if (scene.layout.writingMode === 'horizontal') {
      const width = Math.max(main.box.width, sub.box.width);
      main = translateBlock(main, (width - main.box.width) * coefficient - main.box.left, 0);
      sub = translateBlock(sub, (width - sub.box.width) * coefficient - sub.box.left,
        scene.text.subPosition === 'before' ? main.box.top - gap - sub.box.bottom : main.box.bottom + gap - sub.box.top);
    } else {
      const height = Math.max(main.box.height, sub.box.height);
      main = translateBlock(main, 0, (height - main.box.height) * coefficient - main.box.top);
      sub = translateBlock(sub,
        scene.text.subPosition === 'before' ? main.box.right + gap - sub.box.left : main.box.left - gap - sub.box.right,
        (height - sub.box.height) * coefficient - sub.box.top);
    }
  }
  const box = sub ? unionBox(main.box, sub.box) : main.box;
  const glyphs = [...main.glyphs, ...(sub?.glyphs ?? [])];
  return { index: pageIndex, main, sub, glyphs, box, contentBox: box, drawableCount: glyphs.filter((glyph) => glyph.drawable).length };
}

/** Sum of enabled text stroke widths (base px). */
export function textStrokeTotal(scene: Scene): number {
  return (scene.style.innerStroke.enabled ? scene.style.innerStroke.width : 0) + (scene.style.outerStroke.enabled ? scene.style.outerStroke.width : 0);
}

/** Effective decoration line thickness th (px, already × f), LAY-15 / DEC-20. */
export function decorationThickness(scene: Scene, scale: number): number {
  const decoration = scene.style.decoration;
  const strokes = decoration.lineUsesTextStroke ? textStrokeTotal(scene) : 0;
  return (decoration.lineWidth + strokes) * scale;
}

/** LAY-15 outsets: decoration and stroke/glow/shadow. `size` = S, `scale` = f. */
export function estimateOutsets(scene: Scene, size: number, scale: number): { decoration: Outsets; visual: Outsets } {
  const decoration = scene.style.decoration;
  const pad = decoration.padding * size;
  const th = decorationThickness(scene, scale);
  const ext = decoration.lineExtent * size;
  const vertical = scene.layout.writingMode === 'vertical';
  const all = pad + th;
  const zero: Outsets = { left: 0, right: 0, top: 0, bottom: 0 };
  const o = (left: number, right: number, top: number, bottom: number): Outsets => ({ left, right, top, bottom });
  let out = zero;
  switch (decoration.kind) {
    case 'box':
    case 'corners':
    case 'title-frame':
      out = o(all, all, all, all);
      break;
    case 'lines':
      out = vertical ? o(all, all, ext, ext) : o(ext, ext, all, all);
      break;
    case 'underline':
      out = vertical ? o(all, 0, ext, ext) : o(ext, ext, 0, all);
      break;
    case 'side-lines':
      out = vertical ? o(0, 0, pad + ext, pad + ext) : o(pad + ext, pad + ext, 0, 0);
      break;
    case 'accent-bar':
      out = vertical ? o(0, all, 0, 0) : o(all, 0, 0, 0);
      break;
    case 'band':
      out = vertical ? o(pad, pad, 0, 0) : o(0, 0, pad, pad);
      break;
    case 'hazard': {
      const tape = pad + decoration.tapeWidth * scale;
      out = vertical ? o(tape, tape, 0, 0) : o(0, 0, tape, tape);
      break;
    }
    default:
      out = zero;
  }
  const stroke = textStrokeTotal(scene) * scale;
  let visual: Outsets = o(stroke, stroke, stroke, stroke);
  if (scene.style.glow.enabled) {
    const amount = stroke + scene.style.glow.spread * 1.25 * scale;
    visual = o(Math.max(visual.left, amount), Math.max(visual.right, amount), Math.max(visual.top, amount), Math.max(visual.bottom, amount));
  }
  if (scene.style.shadow.enabled) {
    const spread = stroke + scene.style.shadow.blur * 1.25 * scale;
    const dx = scene.style.shadow.offsetX * scale;
    const dy = scene.style.shadow.offsetY * scale;
    visual = o(Math.max(visual.left, spread - dx), Math.max(visual.right, spread + dx), Math.max(visual.top, spread - dy), Math.max(visual.bottom, spread + dy));
  }
  return { decoration: out, visual };
}

export function isScrolling(scene: Scene): boolean {
  return scene.mode === 'trailer' && scene.motion.trailer.flow === 'scroll';
}

/**
 * LAY-12: largest factor f ≤ 1 so that every page fits. All extents scale linearly with f
 * (em values with S, px values with f), so f is the minimum ratio over the constraints.
 */
export function computeShrinkFactor(scene: Scene, pages: readonly PageLayout[]): number {
  if (!scene.layout.autoShrink) return 1;
  const { decoration, visual } = estimateOutsets(scene, scene.text.mainFont.size, 1);
  const innerWidth = Math.max(16, scene.canvas.width - scene.layout.marginX * 2);
  const innerHeight = Math.max(16, scene.canvas.height - scene.layout.marginY * 2);
  const scrolling = isScrolling(scene);
  const vertical = scene.layout.writingMode === 'vertical';
  let factor = 1;
  const limit = (available: number, needed: number): void => {
    if (needed > 0) factor = Math.min(factor, available / needed);
  };
  for (const page of pages) {
    if (!(scrolling && vertical)) {
      limit(innerWidth, page.box.width + decoration.left + decoration.right);
      limit(scene.canvas.width, page.box.width + Math.max(decoration.left, visual.left) + Math.max(decoration.right, visual.right));
    }
    if (!(scrolling && !vertical)) {
      limit(innerHeight, page.box.height + decoration.top + decoration.bottom);
      limit(scene.canvas.height, page.box.height + Math.max(decoration.top, visual.top) + Math.max(decoration.bottom, visual.bottom));
    }
  }
  if (factor >= 1) return 1;
  return Math.max(0.05, factor * 0.985);
}

/** LAY-13/14: placement offset of a locally laid-out page. */
export function placementOffset(scene: Scene, box: Box, decoration: Outsets, visual: Outsets): { x: number; y: number } {
  const anchor = scene.layout.anchor;
  const horizontal = anchor.endsWith('left') ? 'start' : anchor.endsWith('right') ? 'end' : 'center';
  const vertical = anchor.startsWith('top') ? 'start' : anchor.startsWith('bottom') ? 'end' : 'center';
  const outer = expandBox(box, decoration);
  const { width, height } = scene.canvas;
  let x = horizontal === 'start' ? scene.layout.marginX - outer.left : horizontal === 'end' ? width - scene.layout.marginX - outer.right : width / 2 - (outer.left + outer.right) / 2;
  let y = vertical === 'start' ? scene.layout.marginY - outer.top : vertical === 'end' ? height - scene.layout.marginY - outer.bottom : height / 2 - (outer.top + outer.bottom) / 2;
  x += scene.layout.offsetX;
  y += scene.layout.offsetY;
  if (scene.layout.autoShrink) {
    const extent = makeBox(
      box.left + x - Math.max(decoration.left, visual.left),
      box.top + y - Math.max(decoration.top, visual.top),
      box.right + x + Math.max(decoration.right, visual.right),
      box.bottom + y + Math.max(decoration.bottom, visual.bottom),
    );
    const scrolling = isScrolling(scene);
    const writingVertical = scene.layout.writingMode === 'vertical';
    if (!(scrolling && writingVertical) && extent.width <= width) {
      if (extent.left < 0) x -= extent.left;
      else if (extent.right > width) x -= extent.right - width;
    }
    if (!(scrolling && !writingVertical) && extent.height <= height) {
      if (extent.top < 0) y -= extent.top;
      else if (extent.bottom > height) y -= extent.bottom - height;
    }
  }
  return { x, y };
}

function placePage(page: PageLayout, x: number, y: number): PageLayout {
  const main = translateBlock(page.main, x, y);
  const sub = page.sub ? translateBlock(page.sub, x, y) : undefined;
  return { ...page, main, sub, glyphs: [...main.glyphs, ...(sub?.glyphs ?? [])], box: translateBox(page.box, x, y), contentBox: translateBox(page.contentBox, x, y) };
}

export function pageTexts(scene: Scene): string[] {
  return scene.mode === 'trailer' ? splitTrailerPages(scene.text.main, scene.text.splitPages, isScrolling(scene)) : [normalizeText(scene.text.main)];
}

/** Full layout of a (validated) scene: pages, auto shrink and placement. */
export function layoutScene(scene: Scene, measurer: TextMeasurer): SceneLayout {
  const texts = pageTexts(scene);
  const baseSize = scene.text.mainFont.size;
  let pages = texts.map((text, index) => layoutPageLocal(scene, text, baseSize, index, measurer));
  const scale = computeShrinkFactor(scene, pages);
  if (scale !== 1) pages = texts.map((text, index) => layoutPageLocal(scene, text, baseSize * scale, index, measurer));
  const outsets = estimateOutsets(scene, baseSize * scale, scale);
  pages = pages.map((page) => {
    const offset = placementOffset(scene, page.box, outsets.decoration, outsets.visual);
    return placePage(page, offset.x, offset.y);
  });
  return {
    pages,
    fontSize: baseSize * scale,
    baseSize,
    scale,
    shrunk: scale < 0.999,
    decorationOutsets: outsets.decoration,
    visualOutsets: outsets.visual,
    vertical: scene.layout.writingMode === 'vertical',
    scrolling: isScrolling(scene),
  };
}

/** A fixed-advance measurer (each grapheme = `advance` em) for tests and headless use. */
export class MonospaceMeasurer implements TextMeasurer {
  constructor(private readonly advance = 1, private readonly ascentEm = 0.8, private readonly descentEm = 0.2) {}

  measure(text: string, font: FontSettings): TextMeasurement {
    const count = segmentGraphemes(text).length;
    return { width: count * this.advance * font.size, ascent: this.ascentEm * font.size, descent: this.descentEm * font.size };
  }
}
