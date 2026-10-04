import type { DecorationFrame, DecorationPrimitive, StrokeLayer } from '../core/decoration';
import type { BlockState, TransformState } from '../core/effects';
import { computeFrame, createSceneModel, type FrameState, type GlyphFrame, type PageFrame, type SceneModel } from '../core/frame';
import type { LayoutGlyph, PageLayout, TextMeasurement, TextMeasurer } from '../core/layout';
import type { FontSettings, Scene, ScenePatch } from '../core/scene';
import { backgroundPaint, colorWithAlpha, glowPasses, glyphPaint, textStylePlan, type BackgroundPaint, type TextStylePlan } from '../core/style';

/** Any 2D context: HTMLCanvasElement or OffscreenCanvas (main thread or worker). */
export type Context2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
export type CanvasLike = HTMLCanvasElement | OffscreenCanvas;
/** Kept for backward compatibility. */
export type CanvasContext = Context2D;

export interface LayerCanvas {
  readonly canvas: CanvasLike;
  readonly context: Context2D;
}

export type CanvasFactory = (width: number, height: number) => LayerCanvas;

export interface RenderOptions {
  /** Maps a font family setting to a CSS font-family list (e.g. with FNT-03 fallbacks). Default: quoted family + generic fallback. */
  readonly fontFamily?: (family: string) => string;
  /** Creates offscreen layers (default: OffscreenCanvas, else a DOM canvas). */
  readonly canvasFactory?: CanvasFactory;
}

const GENERIC_FAMILIES = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded', 'emoji', 'math', 'fangsong']);

/** Default CSS family list: quotes a single family name and appends a generic fallback. */
export function defaultFontFamily(family: string): string {
  const trimmed = family.trim();
  if (trimmed.includes(',') || GENERIC_FAMILIES.has(trimmed.toLowerCase())) return trimmed;
  const quoted = /^["'].*["']$/.test(trimmed) ? trimmed : `"${trimmed.replace(/"/g, '')}"`;
  return `${quoted}, ${/serif|mincho|明朝/i.test(trimmed) && !/sans/i.test(trimmed) ? 'serif' : 'sans-serif'}`;
}

/** CSS font shorthand for a FontSettings. */
export function fontString(font: FontSettings, family: (name: string) => string = defaultFontFamily): string {
  return `${font.italic ? 'italic ' : ''}${Math.round(font.weight)} ${Math.max(0.01, font.size)}px ${family(font.family)}`;
}

/** TextMeasurer backed by a canvas context (metrics are cached per font + text). */
export class CanvasTextMeasurer implements TextMeasurer {
  private readonly cache = new Map<string, TextMeasurement>();

  constructor(private readonly context: Context2D, private readonly family: (name: string) => string = defaultFontFamily) {}

  measure(text: string, font: FontSettings): TextMeasurement {
    const css = fontString(font, this.family);
    const key = `${css}\u0000${text}`;
    const cached = this.cache.get(key);
    if (cached) return cached;
    this.context.save();
    this.context.font = css;
    const metrics = this.context.measureText(text);
    this.context.restore();
    const result: TextMeasurement = {
      width: metrics.width,
      ascent: Number.isFinite(metrics.actualBoundingBoxAscent) ? metrics.actualBoundingBoxAscent : undefined,
      descent: Number.isFinite(metrics.actualBoundingBoxDescent) ? metrics.actualBoundingBoxDescent : undefined,
    };
    if (this.cache.size > 20_000) this.cache.clear();
    this.cache.set(key, result);
    return result;
  }
}

export function defaultCanvasFactory(width: number, height: number): LayerCanvas {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(w, h);
    const context = canvas.getContext('2d');
    if (context) return { canvas, context };
  }
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const context = canvas.getContext('2d');
    if (context) return { canvas, context };
  }
  throw new Error('A 2D canvas (OffscreenCanvas or DOM) is required for rendering');
}

interface Matrix {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
  readonly e: number;
  readonly f: number;
}

const IDENTITY: Matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

function readTransform(context: Context2D): Matrix {
  const getter = (context as { getTransform?: () => Matrix }).getTransform;
  if (typeof getter !== 'function') return IDENTITY;
  const m = getter.call(context);
  return { a: m.a, b: m.b, c: m.c, d: m.d, e: m.e, f: m.f };
}

function setMatrix(context: Context2D, m: Matrix): void {
  context.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
}

function matrixScale(m: Matrix): number {
  return Math.sqrt(Math.abs(m.a * m.d - m.b * m.c));
}

const supportsFilter = (context: Context2D): boolean => typeof (context as { filter?: unknown }).filter === 'string';

interface ModelCacheEntry {
  readonly generation: number;
  readonly measurer: TextMeasurer;
  readonly model: SceneModel;
}

let generation = 0;
const modelCache = new WeakMap<object, ModelCacheEntry>();
// Measurers cache text metrics, so they are tied to the cache generation (fonts may have loaded since).
const measurerCache = new WeakMap<object, { generation: number; byFamily: Map<(name: string) => string, CanvasTextMeasurer> }>();
const layerCache = new WeakMap<object, Layers>();

/** Drops cached layouts (call after web fonts finish loading). */
export function invalidateRenderCache(): void {
  generation += 1;
}

/** Kept for backward compatibility (there is no bitmap sprite cache; glyphs are drawn as vectors). */
export function clearGlyphSpriteCache(): void {
  invalidateRenderCache();
}

function measurerFor(context: Context2D, options: RenderOptions): TextMeasurer {
  const family = options.fontFamily ?? defaultFontFamily;
  let entry = measurerCache.get(context);
  if (!entry || entry.generation !== generation) {
    entry = { generation, byFamily: new Map() };
    measurerCache.set(context, entry);
  }
  const byFamily = entry.byFamily;
  let measurer = byFamily.get(family);
  if (!measurer) {
    measurer = new CanvasTextMeasurer(context, family);
    byFamily.set(family, measurer);
  }
  return measurer;
}

/** Cached scene model for a scene object (layout + timeline). */
export function getSceneModel(scene: Scene | ScenePatch, measurer: TextMeasurer): SceneModel {
  const cached = modelCache.get(scene);
  if (cached && cached.generation === generation && cached.measurer === measurer) return cached.model;
  const model = createSceneModel(scene, measurer);
  modelCache.set(scene, { generation, measurer, model });
  return model;
}

class Layers {
  readonly text: LayerCanvas;
  readonly pass: LayerCanvas;
  readonly temp: LayerCanvas;

  constructor(readonly width: number, readonly height: number, factory: CanvasFactory) {
    this.text = factory(width, height);
    this.pass = factory(width, height);
    this.temp = factory(width, height);
  }
}

function layersFor(context: Context2D, factory: CanvasFactory): Layers {
  const { width, height } = context.canvas;
  let layers = layerCache.get(context);
  if (!layers || layers.width !== width || layers.height !== height) {
    layers = new Layers(width, height, factory);
    layerCache.set(context, layers);
  }
  return layers;
}

function clearLayer(layer: LayerCanvas): void {
  const c = layer.context;
  c.save();
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalAlpha = 1;
  c.globalCompositeOperation = 'source-over';
  c.clearRect(0, 0, layer.canvas.width, layer.canvas.height);
  c.restore();
}

function compositeLayer(target: Context2D, layer: LayerCanvas, alpha: number, operation: GlobalCompositeOperation = 'source-over'): void {
  if (alpha <= 0) return;
  target.save();
  target.setTransform(1, 0, 0, 1, 0, 0);
  target.globalAlpha = Math.min(1, alpha);
  target.globalCompositeOperation = operation;
  target.drawImage(layer.canvas, 0, 0);
  target.restore();
}

function fillBackground(context: Context2D, paint: BackgroundPaint, width: number, height: number): void {
  context.save();
  if (paint.kind === 'solid') {
    context.fillStyle = colorWithAlpha(paint.color, paint.alpha);
  } else {
    const gradient = paint.kind === 'radial'
      ? context.createRadialGradient(paint.cx, paint.cy, paint.r0, paint.cx, paint.cy, paint.r1)
      : context.createLinearGradient(paint.x0, paint.y0, paint.x1, paint.y1);
    gradient.addColorStop(0, colorWithAlpha(paint.color, 0));
    gradient.addColorStop(1, colorWithAlpha(paint.color, paint.alpha));
    context.fillStyle = gradient;
  }
  context.fillRect(0, 0, width, height);
  context.restore();
}

function roundedRectPath(context: Context2D, x: number, y: number, width: number, height: number, radius: number): void {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  context.beginPath();
  context.moveTo(x + r, y);
  context.lineTo(x + width - r, y);
  context.arcTo(x + width, y, x + width, y + r, r);
  context.lineTo(x + width, y + height - r);
  context.arcTo(x + width, y + height, x + width - r, y + height, r);
  context.lineTo(x + r, y + height);
  context.arcTo(x, y + height, x, y + height - r, r);
  context.lineTo(x, y + r);
  context.arcTo(x, y, x + r, y, r);
  context.closePath();
}

function strokeLayers(context: Context2D, layers: readonly StrokeLayer[], path: () => void, join: CanvasLineJoin): void {
  for (const layer of layers) {
    if (layer.width <= 0) continue;
    context.lineWidth = layer.width;
    context.strokeStyle = layer.color;
    context.lineCap = layer.cap;
    context.lineJoin = join;
    path();
    context.stroke();
  }
}

function edgeStops(gradient: CanvasGradient, amount: number): void {
  const e = Math.max(0, Math.min(1, amount)) / 2;
  if (e <= 0) {
    gradient.addColorStop(0, 'rgba(0,0,0,1)');
    gradient.addColorStop(1, 'rgba(0,0,0,1)');
    return;
  }
  gradient.addColorStop(0, 'rgba(0,0,0,0)');
  gradient.addColorStop(e, 'rgba(0,0,0,1)');
  gradient.addColorStop(1 - e, 'rgba(0,0,0,1)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
}

class FrameRenderer {
  private readonly family: (name: string) => string;
  private plan!: TextStylePlan;
  private base: Matrix = IDENTITY;
  private filterSupported = false;

  constructor(private readonly model: SceneModel, private readonly layers: Layers, options: RenderOptions) {
    this.family = options.fontFamily ?? defaultFontFamily;
  }

  draw(target: Context2D, frame: FrameState): void {
    const { scene, layout } = this.model;
    this.base = readTransform(target);
    this.filterSupported = supportsFilter(target);
    this.plan = textStylePlan(scene, layout.scale);
    target.save();
    target.setTransform(1, 0, 0, 1, 0, 0);
    target.clearRect(0, 0, target.canvas.width, target.canvas.height);
    target.restore();
    if (frame.background) {
      target.save();
      setMatrix(target, this.base);
      fillBackground(target, frame.background, scene.canvas.width, scene.canvas.height);
      target.restore();
    }
    for (const page of frame.pages) this.drawPage(target, page, frame.time);
    setMatrix(target, this.base);
  }

  private withBase(context: Context2D): void {
    setMatrix(context, this.base);
  }

  private applyBlockTransform(context: Context2D, block: BlockState, origin: { x: number; y: number }, scale: boolean): void {
    context.translate(origin.x + block.x, origin.y + block.y);
    if (scale) {
      context.rotate(block.rotation);
      context.scale(block.s * block.sx, block.s * block.sy);
    }
    context.translate(-origin.x, -origin.y);
  }

  private drawPage(target: Context2D, page: PageFrame, time: number): void {
    if (page.decoration) this.drawDecoration(target, page, page.decoration);
    if (!page.drawText) return;
    const glyphs: GlyphFrame[] = [...page.glyphs];
    if (page.center) {
      glyphs.push({ glyph: page.center.glyph, state: { a: 1, x: 0, y: 0, s: page.center.scale, sx: 1, sy: 1, rotation: 0, blur: 0 }, alpha: page.block.a, blur: page.block.blur });
    }
    if (glyphs.length === 0 && !page.cursor) return;
    const text = this.layers.text;
    clearLayer(text);
    this.drawGlyphLayers(text.context, page, glyphs);
    if (page.cursor) {
      const c = text.context;
      c.save();
      this.withBase(c);
      this.applyBlockTransform(c, page.block, page.origin, true);
      c.globalAlpha = Math.min(1, page.block.a);
      c.fillStyle = page.cursor.color;
      c.fillRect(page.cursor.x, page.cursor.y, page.cursor.width, page.cursor.height);
      c.restore();
    }
    this.postProcess(page, time);
    compositeLayer(target, text, page.block.layerAlpha);
  }

  private drawDecoration(target: Context2D, page: PageFrame, decoration: DecorationFrame): void {
    const pass = this.layers.pass;
    clearLayer(pass);
    const c = pass.context;
    for (const primitive of decoration.primitives) {
      c.save();
      this.withBase(c);
      this.applyBlockTransform(c, page.block, page.origin, decoration.followsBlockScale);
      this.drawPrimitive(c, primitive, page);
      c.restore();
    }
    compositeLayer(target, pass, decoration.alpha);
  }

  private drawPrimitive(c: Context2D, primitive: DecorationPrimitive, page: PageFrame): void {
    switch (primitive.type) {
      case 'rect': {
        if (primitive.width <= 0 || primitive.height <= 0) return;
        const path = (): void => roundedRectPath(c, primitive.x, primitive.y, primitive.width, primitive.height, primitive.radius);
        if (primitive.fill && primitive.fill.opacity > 0) {
          path();
          c.fillStyle = colorWithAlpha(primitive.fill.color, primitive.fill.opacity);
          c.fill();
        }
        if (primitive.strokes) strokeLayers(c, primitive.strokes, path, primitive.radius > 0 ? 'round' : 'miter');
        return;
      }
      case 'polyline': {
        const points = primitive.points;
        if (points.length < 2) return;
        const closed = points.length > 2 && points[0]![0] === points[points.length - 1]![0] && points[0]![1] === points[points.length - 1]![1];
        const path = (): void => {
          c.beginPath();
          c.moveTo(points[0]![0], points[0]![1]);
          for (let index = 1; index < points.length; index += 1) c.lineTo(points[index]![0], points[index]![1]);
          if (closed) c.closePath();
        };
        strokeLayers(c, primitive.strokes, path, 'miter');
        return;
      }
      case 'band':
        this.drawBand(c, primitive, page);
        return;
      case 'tape':
        this.drawTape(c, primitive);
        return;
      default:
        return;
    }
  }

  private drawBand(c: Context2D, band: Extract<DecorationPrimitive, { type: 'band' }>, page: PageFrame): void {
    if (band.width <= 0 || band.height <= 0) return;
    const temp = this.layers.temp;
    clearLayer(temp);
    const t = temp.context;
    t.save();
    this.withBase(t);
    this.applyBlockTransform(t, page.block, page.origin, false);
    const across = band.lengthAxis === 'x'
      ? t.createLinearGradient(0, band.y, 0, band.y + band.height)
      : t.createLinearGradient(band.x, 0, band.x + band.width, 0);
    edgeStops(across, band.edgeBlur);
    t.fillStyle = across;
    t.fillRect(band.x, band.y, band.width, band.height);
    t.globalCompositeOperation = 'destination-in';
    const along = band.lengthAxis === 'x'
      ? t.createLinearGradient(band.x, 0, band.x + band.width, 0)
      : t.createLinearGradient(0, band.y, 0, band.y + band.height);
    edgeStops(along, band.endFade);
    t.fillStyle = along;
    t.fillRect(band.x, band.y, band.width, band.height);
    t.globalCompositeOperation = 'source-in';
    t.fillStyle = colorWithAlpha(band.color, band.opacity);
    t.fillRect(band.x, band.y, band.width, band.height);
    t.restore();
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.drawImage(temp.canvas, 0, 0);
    c.restore();
  }

  private drawTape(c: Context2D, tape: Extract<DecorationPrimitive, { type: 'tape' }>): void {
    if (tape.width <= 0 || tape.height <= 0) return;
    c.save();
    c.beginPath();
    c.rect(tape.x, tape.y, tape.width, tape.height);
    c.clip();
    c.fillStyle = tape.color;
    c.fillRect(tape.x, tape.y, tape.width, tape.height);
    c.fillStyle = tape.stripeColor;
    const horizontal = tape.lengthAxis === 'x';
    const start = horizontal ? tape.x : tape.y;
    const length = horizontal ? tape.width : tape.height;
    const across0 = horizontal ? tape.y : tape.x;
    const thickness = horizontal ? tape.height : tape.width;
    const first = Math.floor((start - tape.skew - tape.phase) / tape.period) - 1;
    const last = Math.ceil((start + length - tape.phase) / tape.period) + 1;
    c.beginPath();
    for (let n = first; n <= last; n += 1) {
      const u = tape.phase + n * tape.period;
      const quad: [number, number][] = [
        [u, across0 + thickness],
        [u + tape.stripeWidth, across0 + thickness],
        [u + tape.stripeWidth + tape.skew, across0],
        [u + tape.skew, across0],
      ];
      quad.forEach(([along, across], index) => {
        const x = horizontal ? along : across;
        const y = horizontal ? across : along;
        if (index === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      });
      c.closePath();
    }
    c.fill();
    if (tape.darkness > 0.002) {
      c.fillStyle = `rgba(0,0,0,${Math.min(1, tape.darkness)})`;
      c.fillRect(tape.x, tape.y, tape.width, tape.height);
    }
    c.restore();
  }

  /** Sets the glyph-local transform (on top of base · block). Returns the full device matrix. */
  private glyphTransform(c: Context2D, page: PageFrame, glyph: LayoutGlyph, state: TransformState): Matrix {
    this.withBase(c);
    this.applyBlockTransform(c, page.block, page.origin, true);
    c.translate(glyph.x + state.x, glyph.y + state.y);
    c.scale(state.s * state.sx, state.s * state.sy);
    c.rotate(state.rotation + glyph.rotation);
    return readTransform(c);
  }

  private setGlyphFont(c: Context2D, glyph: LayoutGlyph): void {
    c.font = fontString(glyph.font, this.family);
    c.textAlign = 'center';
    c.textBaseline = 'alphabetic';
    c.lineJoin = 'round';
    c.miterLimit = 2;
  }

  /**
   * Applies the glyph blur filter. When a blur is active the context is also clipped to the glyph's
   * neighbourhood (glyph-local units): CPU canvases otherwise filter a full-canvas layer per glyph,
   * which made blur-heavy templates several times slower. `extra` covers stroke / shadow / glow reach.
   */
  private setBlur(c: Context2D, frame: GlyphFrame, device: Matrix, extra = 0): void {
    if (!this.filterSupported) return;
    const radius = frame.blur * matrixScale(device);
    if (radius <= 0.35) {
      (c as { filter: string }).filter = 'none';
      return;
    }
    const glyph = frame.glyph;
    const half = Math.max(glyph.advance, glyph.ascent + glyph.descent, glyph.font.size) * 0.8 + 4 * frame.blur + extra;
    c.beginPath();
    c.rect(-half, -half, 2 * half, 2 * half);
    c.clip();
    (c as { filter: string }).filter = `blur(${radius.toFixed(3)}px)`;
  }

  /** Draws the glyph silhouette far off-canvas so that only its shadow lands at the glyph position. */
  private shadowSilhouette(c: Context2D, frame: GlyphFrame, device: Matrix, color: string, blur: number, dx: number, dy: number, strokeWidth: number): void {
    const scale = matrixScale(device);
    const offset = Math.max(4096, 4 * (this.layers.width + this.layers.height));
    c.setTransform(device.a, device.b, device.c, device.d, device.e + offset, device.f);
    c.shadowColor = color;
    c.shadowBlur = blur * scale;
    c.shadowOffsetX = -offset + dx * scale;
    c.shadowOffsetY = dy * scale;
    c.fillStyle = '#000';
    c.strokeStyle = '#000';
    const y = frame.glyph.baselineOffset;
    c.fillText(frame.glyph.text, 0, y);
    if (strokeWidth > 0) {
      c.lineWidth = strokeWidth;
      c.strokeText(frame.glyph.text, 0, y);
    }
  }

  private knockout(c: Context2D, frames: readonly GlyphFrame[], page: PageFrame, strokeWidth: number): void {
    for (const frame of frames) {
      c.save();
      this.glyphTransform(c, page, frame.glyph, frame.state);
      this.setGlyphFont(c, frame.glyph);
      c.globalCompositeOperation = 'destination-out';
      c.globalAlpha = Math.min(1, frame.alpha);
      c.fillStyle = '#000';
      c.strokeStyle = '#000';
      c.fillText(frame.glyph.text, 0, frame.glyph.baselineOffset);
      if (strokeWidth > 0) {
        c.lineWidth = strokeWidth;
        c.strokeText(frame.glyph.text, 0, frame.glyph.baselineOffset);
      }
      c.restore();
    }
  }

  private drawGlyphLayers(text: Context2D, page: PageFrame, frames: readonly GlyphFrame[]): void {
    const plan = this.plan;
    const pass = this.layers.pass;
    // 1. Glow layer (outside of the silhouette only), opacity × glow multiplier.
    if (plan.glow && page.block.glowMultiplier > 0) {
      clearLayer(pass);
      const c = pass.context;
      for (const frame of frames) {
        c.save();
        const device = this.glyphTransform(c, page, frame.glyph, frame.state);
        this.setGlyphFont(c, frame.glyph);
        this.setBlur(c, frame, device, 4 * plan.glow.spreadPx + plan.silhouetteWidth);
        c.globalAlpha = Math.min(1, frame.alpha);
        this.shadowSilhouette(c, frame, device, plan.glow.color, plan.glow.spreadPx, 0, 0, Math.max(plan.silhouetteWidth, 0));
        c.restore();
      }
      this.knockout(c, frames, page, plan.silhouetteWidth);
      for (const alpha of glowPasses(plan.glow.strength * page.block.glowMultiplier)) compositeLayer(text, pass, alpha);
    }
    // 2. Shadow + outer stroke layer, with the fill + inner stroke area removed.
    if (plan.shadow || plan.outer) {
      clearLayer(pass);
      const c = pass.context;
      for (const frame of frames) {
        c.save();
        const device = this.glyphTransform(c, page, frame.glyph, frame.state);
        this.setGlyphFont(c, frame.glyph);
        this.setBlur(
          c,
          frame,
          device,
          (plan.shadow ? 4 * plan.shadow.blurPx + Math.abs(plan.shadow.dx) + Math.abs(plan.shadow.dy) : 0) + plan.silhouetteWidth + (plan.outer?.lineWidth ?? 0),
        );
        c.globalAlpha = Math.min(1, frame.alpha);
        if (plan.shadow) {
          c.save();
          this.shadowSilhouette(c, frame, device, colorWithAlpha(plan.shadow.color, plan.shadow.opacity), plan.shadow.blurPx, plan.shadow.dx, plan.shadow.dy, plan.silhouetteWidth);
          c.restore();
        }
        if (plan.outer) {
          c.strokeStyle = plan.outer.color;
          c.lineWidth = plan.outer.lineWidth;
          c.strokeText(frame.glyph.text, 0, frame.glyph.baselineOffset);
        }
        c.restore();
      }
      this.knockout(c, frames, page, plan.innerSilhouetteWidth);
      compositeLayer(text, pass, 1);
    }
    // 3. Inner strokes of all glyphs, then (optionally) cut the fill area, then all fills.
    if (plan.inner) {
      for (const frame of frames) {
        text.save();
        const device = this.glyphTransform(text, page, frame.glyph, frame.state);
        this.setGlyphFont(text, frame.glyph);
        this.setBlur(text, frame, device, plan.inner.lineWidth);
        text.globalAlpha = Math.min(1, frame.alpha);
        text.strokeStyle = plan.inner.color;
        text.lineWidth = plan.inner.lineWidth;
        text.strokeText(frame.glyph.text, 0, frame.glyph.baselineOffset);
        text.restore();
      }
    }
    if (plan.fillOpacity < 1) this.knockout(text, frames, page, 0);
    if (plan.fillOpacity > 0) {
      for (const frame of frames) {
        text.save();
        const device = this.glyphTransform(text, page, frame.glyph, frame.state);
        this.setGlyphFont(text, frame.glyph);
        this.setBlur(text, frame, device);
        text.globalAlpha = Math.min(1, frame.alpha * plan.fillOpacity);
        text.fillStyle = this.paint(text, page.page, frame);
        text.fillText(frame.glyph.text, 0, frame.glyph.baselineOffset);
        text.restore();
      }
    }
  }

  private paint(c: Context2D, page: PageLayout, frame: GlyphFrame): string | CanvasGradient {
    const paint = glyphPaint(this.model.scene, frame.glyph, page, frame.state.rotation + frame.glyph.rotation);
    if (paint.kind === 'solid') return paint.color;
    const gradient = c.createLinearGradient(paint.x0, paint.y0, paint.x1, paint.y1);
    for (const stop of paint.stops) gradient.addColorStop(stop.offset, stop.color);
    return gradient;
  }

  private maskWithGradient(axis: 'x' | 'y', from: number, to: number, stops: readonly { offset: number; alpha: number }[]): void {
    const c = this.layers.text.context;
    c.save();
    this.withBase(c);
    c.globalCompositeOperation = 'destination-in';
    const gradient = axis === 'x' ? c.createLinearGradient(from, 0, to, 0) : c.createLinearGradient(0, from, 0, to);
    for (const stop of stops) gradient.addColorStop(Math.max(0, Math.min(1, stop.offset)), `rgba(0,0,0,${Math.max(0, Math.min(1, stop.alpha))})`);
    c.fillStyle = gradient;
    c.fillRect(-1e5, -1e5, 2e5, 2e5);
    c.restore();
  }

  private postProcess(page: PageFrame, time: number): void {
    const text = this.layers.text;
    const c = text.context;
    void time;
    if (page.block.bright > 0.002) {
      c.save();
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalCompositeOperation = 'source-atop';
      c.globalAlpha = Math.min(1, page.block.bright);
      c.fillStyle = '#FFFFFF';
      c.fillRect(0, 0, text.canvas.width, text.canvas.height);
      c.restore();
    }
    if (page.wipe) this.maskWithGradient(page.wipe.axis, page.wipe.from, page.wipe.to, page.wipe.stops);
    if (page.edgeFade) {
      this.maskWithGradient(page.edgeFade.axis, 0, page.edgeFade.length, [
        { offset: 0, alpha: 0 }, { offset: 0.14, alpha: 1 }, { offset: 0.86, alpha: 1 }, { offset: 1, alpha: 0 },
      ]);
    }
    if (page.glitch) this.glitch(page);
  }

  private glitch(page: PageFrame): void {
    const plan = page.glitch!;
    const { text, temp, pass } = this.layers;
    const scene = this.model.scene;
    const w = text.canvas.width;
    const h = text.canvas.height;
    clearLayer(temp);
    temp.context.drawImage(text.canvas, 0, 0);
    const shiftX = plan.shift * this.base.a;
    const tint = (color: string): void => {
      clearLayer(pass);
      const p = pass.context;
      p.save();
      p.setTransform(1, 0, 0, 1, 0, 0);
      p.drawImage(temp.canvas, 0, 0);
      p.globalCompositeOperation = 'source-in';
      p.fillStyle = color;
      p.fillRect(0, 0, w, h);
      p.restore();
    };
    clearLayer(text);
    const c = text.context;
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    tint(scene.style.glitchColors[0]);
    c.globalAlpha = 0.8;
    c.drawImage(pass.canvas, -shiftX, 0);
    tint(scene.style.glitchColors[1]);
    c.drawImage(pass.canvas, shiftX, 0);
    c.globalAlpha = 1;
    c.drawImage(temp.canvas, 0, 0);
    c.restore();
    // Horizontal slices displaced sideways.
    clearLayer(temp);
    temp.context.drawImage(text.canvas, 0, 0);
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    for (const slice of plan.slices) {
      const y = Math.round(slice.y * this.base.d + this.base.f);
      const height = Math.max(1, Math.round(slice.height * this.base.d));
      if (y >= h || y + height <= 0) continue;
      const sy = Math.max(0, y);
      const sh = Math.min(h, y + height) - sy;
      const dx = Math.round(slice.offsetX * this.base.a);
      c.clearRect(0, sy, w, sh);
      c.drawImage(temp.canvas, 0, sy, w, sh, dx, sy, w, sh);
    }
    c.restore();
  }
}

/**
 * Draws `scene` at time `t` onto `context` (TL-20). The context's current transform maps scene
 * coordinates to its pixels (e.g. a preview scale); it is preserved. Deterministic for a given scene and t.
 */
export function renderFrame(scene: Scene | ScenePatch, t: number, context: Context2D, options: RenderOptions = {}): FrameState {
  const model = getSceneModel(scene, measurerFor(context, options));
  return renderModelFrame(model, t, context, options);
}

/** Like renderFrame for an already computed model (avoids the cache lookup). */
export function renderModelFrame(model: SceneModel, t: number, context: Context2D, options: RenderOptions = {}): FrameState {
  const pixelScale = matrixScale(readTransform(context));
  const frame = computeFrame(model, t, { pixelScale });
  const layers = layersFor(context, options.canvasFactory ?? defaultCanvasFactory);
  new FrameRenderer(model, layers, options).draw(context, frame);
  return frame;
}

/**
 * Returns `(t) => RGBA` for exportApng's `render`. The scene is drawn scaled to width × height
 * (identity when they equal the scene canvas size).
 */
export function createRgbaRenderer(scene: Scene | ScenePatch, width: number, height: number, options: RenderOptions = {}): (t: number) => Uint8ClampedArray {
  const factory = options.canvasFactory ?? defaultCanvasFactory;
  const target = factory(width, height);
  const context = target.context;
  const measurer = measurerFor(context, options);
  let model: SceneModel | undefined;
  return (t: number) => {
    model ??= createSceneModel(scene, measurer);
    context.setTransform(width / model.scene.canvas.width, 0, 0, height / model.scene.canvas.height, 0, 0);
    renderModelFrame(model, t, context, options);
    return context.getImageData(0, 0, width, height).data;
  };
}

/** Background paint helper re-exported for UI previews. */
export { backgroundPaint };
