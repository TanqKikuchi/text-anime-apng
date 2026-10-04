import { diffRect, expandRect, fullRect, rectEquals, type Rect } from './image';
import { PaletteAnalyzer, type Palette } from './quantizer';

export interface AnalysisResult {
  readonly trimRect: Rect;
  readonly trimmed: boolean;
  readonly palette?: Palette;
}

export class FrameAnalyzer {
  readonly #width: number;
  readonly #height: number;
  readonly #paletteAnalyzer: PaletteAnalyzer | undefined;
  readonly #autoTrim: boolean;
  #previous: Uint8ClampedArray | undefined;
  #opaqueBounds: Rect | undefined;

  constructor(width: number, height: number, options: { palette: boolean; autoTrim: boolean }) {
    this.#width = width;
    this.#height = height;
    this.#paletteAnalyzer = options.palette ? new PaletteAnalyzer() : undefined;
    this.#autoTrim = options.autoTrim;
  }

  addFrame(rgba: Uint8ClampedArray): void {
    const changed = diffRect(this.#previous, rgba, this.#width, this.#height);
    if (changed !== undefined) {
      this.#paletteAnalyzer?.addPixels(rgba, this.#width, changed);
      if (this.#autoTrim) this.#includeOpaque(rgba, changed);
    }
    this.#previous = rgba.slice();
  }

  addDefaultImage(rgba: Uint8ClampedArray): void {
    this.addFrame(rgba);
  }

  finish(): AnalysisResult {
    const full = fullRect(this.#width, this.#height);
    const candidate = this.#opaqueBounds === undefined ? full : expandRect(this.#opaqueBounds, 2, this.#width, this.#height);
    const trimRect = this.#autoTrim && !rectEquals(candidate, full) ? candidate : full;
    return {
      trimRect,
      trimmed: !rectEquals(trimRect, full),
      palette: this.#paletteAnalyzer?.build(),
    };
  }

  #includeOpaque(rgba: Uint8ClampedArray, rect: Rect): void {
    let minX = this.#width;
    let minY = this.#height;
    let maxX = -1;
    let maxY = -1;
    for (let y = rect.y; y < rect.y + rect.height; y += 1) {
      for (let x = rect.x; x < rect.x + rect.width; x += 1) {
        if (rgba[(y * this.#width + x) * 4 + 3] === 0) continue;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
    if (maxX < 0) return;
    const found = { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
    if (this.#opaqueBounds === undefined) this.#opaqueBounds = found;
    else {
      const right = Math.max(this.#opaqueBounds.x + this.#opaqueBounds.width, found.x + found.width);
      const bottom = Math.max(this.#opaqueBounds.y + this.#opaqueBounds.height, found.y + found.height);
      const x = Math.min(this.#opaqueBounds.x, found.x);
      const y = Math.min(this.#opaqueBounds.y, found.y);
      this.#opaqueBounds = { x, y, width: right - x, height: bottom - y };
    }
  }
}
