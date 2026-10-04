import { clamp01 } from './easing';
import type { Box, LayoutGlyph, PageLayout } from './layout';
import type { FillSettings, GlowSettings, Scene, ShadowSettings, StrokeSettings } from './scene';

export interface Rgba {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

/** Parses #RGB, #RGBA, #RRGGBB, #RRGGBBAA and rgb()/rgba(); unknown strings → opaque black. */
export function parseColor(color: string): Rgba {
  const value = color.trim();
  const hex = /^#([0-9a-f]{3,8})$/i.exec(value);
  if (hex) {
    let digits = hex[1]!;
    if (digits.length === 3 || digits.length === 4) digits = digits.split('').map((c) => c + c).join('');
    if (digits.length === 6 || digits.length === 8) {
      const n = (i: number): number => Number.parseInt(digits.slice(i, i + 2), 16);
      return { r: n(0), g: n(2), b: n(4), a: digits.length === 8 ? n(6) / 255 : 1 };
    }
  }
  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/i.exec(value);
  if (rgb) {
    const alphaText = rgb[4];
    const a = alphaText === undefined ? 1 : alphaText.endsWith('%') ? Number.parseFloat(alphaText) / 100 : Number.parseFloat(alphaText);
    return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]), a: clamp01(a) };
  }
  return { r: 0, g: 0, b: 0, a: 1 };
}

/** CSS rgba() string for a colour multiplied by `alpha`. */
export function colorWithAlpha(color: string, alpha: number): string {
  const c = parseColor(color);
  const a = Math.round(clamp01(c.a * alpha) * 1000) / 1000;
  return `rgba(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)}, ${a})`;
}

export interface ColorStop {
  readonly offset: number;
  readonly color: string;
}

/** DEC-01: equally spaced stops for 2 or 3 colours ('' / missing third = unused). */
export function fillStops(fill: FillSettings): ColorStop[] {
  const colors = fill.colors.filter((value): value is string => typeof value === 'string' && value !== '');
  if (colors.length <= 1) return [{ offset: 0, color: colors[0] ?? '#FFFFFF' }, { offset: 1, color: colors[0] ?? '#FFFFFF' }];
  return colors.map((color, index) => ({ offset: index / (colors.length - 1), color }));
}

export type GlyphPaint =
  | { readonly kind: 'solid'; readonly color: string }
  | { readonly kind: 'linear'; readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number; readonly stops: readonly ColorStop[] };

/** Gradient line of the fill in canvas coordinates (before mapping into glyph space). */
export function fillGradientLine(fill: FillSettings, glyph: LayoutGlyph, pageBox: Box): { x0: number; y0: number; x1: number; y1: number } {
  if (fill.direction === 'block-horizontal') {
    const cy = (pageBox.top + pageBox.bottom) / 2;
    return { x0: pageBox.left, y0: cy, x1: pageBox.right, y1: cy };
  }
  if (fill.direction === 'block-diagonal') return { x0: pageBox.left, y0: pageBox.top, x1: pageBox.right, y1: pageBox.bottom };
  return { x0: glyph.x, y0: glyph.inkTop, x1: glyph.x, y1: glyph.inkBottom };
}

/**
 * DEC-01/07: paint of a glyph in glyph-local coordinates (origin = glyph home centre, rotated by
 * `rotation`). Gradient endpoints are counter-rotated so the visual direction is preserved.
 */
export function glyphPaint(scene: Scene, glyph: LayoutGlyph, page: PageLayout, rotation: number): GlyphPaint {
  if (glyph.group === 'sub' && scene.style.subColorEnabled) return { kind: 'solid', color: scene.style.subColor };
  const fill = scene.style.fill;
  if (fill.kind === 'solid') return { kind: 'solid', color: fill.colors[0] };
  const line = fillGradientLine(fill, glyph, page.box);
  const cos = Math.cos(-rotation);
  const sin = Math.sin(-rotation);
  const local = (x: number, y: number): [number, number] => {
    const dx = x - glyph.x;
    const dy = y - glyph.y;
    return [dx * cos - dy * sin, dx * sin + dy * cos];
  };
  const [x0, y0] = local(line.x0, line.y0);
  const [x1, y1] = local(line.x1, line.y1);
  return { kind: 'linear', x0, y0, x1, y1, stops: fillStops(fill) };
}

/** Parameter (0〜1, clamped) of the gradient at a point — used by tests and colour previews. */
export function gradientParameter(line: { x0: number; y0: number; x1: number; y1: number }, x: number, y: number): number {
  const dx = line.x1 - line.x0;
  const dy = line.y1 - line.y0;
  const length2 = dx * dx + dy * dy;
  if (length2 === 0) return 0;
  return clamp01(((x - line.x0) * dx + (y - line.y0) * dy) / length2);
}

export interface StrokePass {
  readonly color: string;
  /** Canvas lineWidth in px (already × f). */
  readonly lineWidth: number;
}

export interface TextStylePlan {
  /** DEC-03 inner stroke (lineWidth = 2 × width × f). */
  readonly inner?: StrokePass;
  /** DEC-04 outer stroke (lineWidth = 2 × (inner + outer) × f). */
  readonly outer?: StrokePass;
  /** Width of the full silhouette stroke (fill + all strokes) used by shadow and glow. */
  readonly silhouetteWidth: number;
  /** Width of fill + inner stroke (knocked out of the shadow / outer layers). */
  readonly innerSilhouetteWidth: number;
  readonly shadow?: ShadowSettings & { readonly blurPx: number; readonly dx: number; readonly dy: number };
  readonly glow?: GlowSettings & { readonly spreadPx: number; readonly passes: readonly number[] };
  readonly fillOpacity: number;
}

/** Glow repetition (DEC-06): integer part at opacity 1, fractional part once at its opacity. */
export function glowPasses(strength: number): number[] {
  const value = Math.max(0, strength);
  const whole = Math.floor(value);
  const passes = Array.from({ length: whole }, () => 1);
  const fraction = value - whole;
  if (fraction > 1e-6) passes.push(fraction);
  return passes;
}

function stroke(settings: StrokeSettings): number {
  return settings.enabled ? settings.width : 0;
}

/** DEC-02〜06 resolved for drawing at shrink factor `scale`. */
export function textStylePlan(scene: Scene, scale: number): TextStylePlan {
  const { innerStroke, outerStroke, shadow, glow, fill } = scene.style;
  const inner = stroke(innerStroke);
  const outer = stroke(outerStroke);
  return {
    inner: inner > 0 ? { color: innerStroke.color, lineWidth: 2 * inner * scale } : undefined,
    outer: outer > 0 ? { color: outerStroke.color, lineWidth: 2 * (inner + outer) * scale } : undefined,
    silhouetteWidth: 2 * (inner + outer) * scale,
    innerSilhouetteWidth: 2 * inner * scale,
    shadow: shadow.enabled && shadow.opacity > 0 ? { ...shadow, blurPx: shadow.blur * scale, dx: shadow.offsetX * scale, dy: shadow.offsetY * scale } : undefined,
    glow: glow.enabled ? { ...glow, spreadPx: glow.spread * scale, passes: glowPasses(glow.strength) } : undefined,
    fillOpacity: fill.opacity,
  };
}

export type BackgroundPaint =
  | { readonly kind: 'solid'; readonly color: string; readonly alpha: number }
  | { readonly kind: 'radial'; readonly cx: number; readonly cy: number; readonly r0: number; readonly r1: number; readonly color: string; readonly alpha: number }
  | { readonly kind: 'linear'; readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number; readonly color: string; readonly alpha: number };

/**
 * DEC-21 background at effective opacity (濃さ × TL-16 fade). Gradients go from transparent at
 * (x0,y0)/r0 to `color` × alpha at (x1,y1)/r1.
 */
export function backgroundPaint(scene: Scene, opacity: number): BackgroundPaint | undefined {
  const { kind, color } = scene.background;
  const { width, height } = scene.canvas;
  if (kind === 'none' || opacity <= 0) return undefined;
  if (kind === 'solid') return { kind: 'solid', color, alpha: opacity };
  if (kind === 'vignette') return { kind: 'radial', cx: width / 2, cy: height / 2, r0: Math.min(width, height) * 0.2, r1: Math.hypot(width, height) / 2, color, alpha: opacity };
  if (kind === 'bottom-gradient') return { kind: 'linear', x0: 0, y0: height * 0.45, x1: 0, y1: height, color, alpha: opacity };
  return { kind: 'linear', x0: 0, y0: height * 0.55, x1: 0, y1: 0, color, alpha: opacity };
}
