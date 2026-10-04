// Writes ProRes 4444 test movies for AVFoundation / Keynote verification.
//
// Usage: node tools/make_test_mov.ts <out-dir>
//
// For every case: <name>.mov, the straight-RGBA source frames (<rgba>, all frames concatenated, as
// expected by tools/verify_mov.swift) and an entry in manifest.json.
import { mkdirSync, openSync, closeSync, writeSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { exportMov, type MovQuality } from '../src/core/export-mov.ts';

/** Small premultiplied float canvas with anti-aliased primitives (source-over). */
class SoftCanvas {
  readonly width: number;
  readonly height: number;
  readonly data: Float32Array;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.data = new Float32Array(width * height * 4);
  }

  blend(x: number, y: number, r: number, g: number, b: number, a: number): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height || a <= 0) return;
    const i = (y * this.width + x) * 4;
    const d = this.data;
    const k = 1 - a;
    d[i] = r * a + d[i]! * k;
    d[i + 1] = g * a + d[i + 1]! * k;
    d[i + 2] = b * a + d[i + 2]! * k;
    d[i + 3] = a + d[i + 3]! * k;
  }

  fill(r: number, g: number, b: number, a: number): void {
    for (let y = 0; y < this.height; y += 1) for (let x = 0; x < this.width; x += 1) this.blend(x, y, r, g, b, a);
  }

  circle(cx: number, cy: number, radius: number, r: number, g: number, b: number, a: number): void {
    const x0 = Math.floor(cx - radius - 1), x1 = Math.ceil(cx + radius + 1);
    const y0 = Math.floor(cy - radius - 1), y1 = Math.ceil(cy + radius + 1);
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const dist = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        const coverage = Math.min(1, Math.max(0, radius + 0.5 - dist));
        this.blend(x, y, r, g, b, a * coverage);
      }
    }
  }

  glow(cx: number, cy: number, sigma: number, r: number, g: number, b: number, a: number): void {
    const reach = Math.ceil(sigma * 3);
    for (let y = Math.floor(cy - reach); y <= cy + reach; y += 1) {
      for (let x = Math.floor(cx - reach); x <= cx + reach; x += 1) {
        const d2 = (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2;
        this.blend(x, y, r, g, b, a * Math.exp(-d2 / (2 * sigma * sigma)));
      }
    }
  }

  rect(x0: number, y0: number, w: number, h: number, r: number, g: number, b: number, a: number): void {
    for (let y = Math.floor(y0); y < Math.ceil(y0 + h); y += 1) {
      const cy = Math.min(y + 1, y0 + h) - Math.max(y, y0);
      for (let x = Math.floor(x0); x < Math.ceil(x0 + w); x += 1) {
        const cx = Math.min(x + 1, x0 + w) - Math.max(x, x0);
        this.blend(x, y, r, g, b, a * Math.max(0, cx) * Math.max(0, cy));
      }
    }
  }

  /** Anti-aliased line of the given width (distance-based coverage). */
  line(xa: number, ya: number, xb: number, yb: number, width: number, r: number, g: number, b: number, a: number): void {
    const dx = xb - xa, dy = yb - ya;
    const len2 = dx * dx + dy * dy || 1;
    const minX = Math.floor(Math.min(xa, xb) - width - 1), maxX = Math.ceil(Math.max(xa, xb) + width + 1);
    const minY = Math.floor(Math.min(ya, yb) - width - 1), maxY = Math.ceil(Math.max(ya, yb) + width + 1);
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const px = x + 0.5, py = y + 0.5;
        const t = Math.min(1, Math.max(0, ((px - xa) * dx + (py - ya) * dy) / len2));
        const dist = Math.hypot(px - (xa + t * dx), py - (ya + t * dy));
        this.blend(x, y, r, g, b, a * Math.min(1, Math.max(0, width / 2 + 0.5 - dist)));
      }
    }
  }

  /** Straight 8-bit RGBA (like canvas getImageData: unpremultiplied, rounded). */
  toRgba(): Uint8ClampedArray {
    const out = new Uint8ClampedArray(this.width * this.height * 4);
    const d = this.data;
    for (let i = 0; i < out.length; i += 4) {
      const a = Math.round(d[i + 3]! * 255);
      out[i + 3] = a;
      if (a === 0) continue;
      const scale = 255 / d[i + 3]!;
      out[i] = Math.round(d[i]! * scale);
      out[i + 1] = Math.round(d[i + 1]! * scale);
      out[i + 2] = Math.round(d[i + 2]! * scale);
    }
    return out;
  }
}

type Draw = (canvas: SoftCanvas, t: number, frame: number) => void;

interface Case {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly duration: number;
  readonly quality: MovQuality;
  readonly draw: Draw;
  /** Cases with the same source share one .rgba file. */
  readonly source?: string;
}

const HUES: readonly (readonly [number, number, number])[] = [
  [1, 1, 1], [1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 1, 0], [0, 1, 1], [1, 0, 1], [0.5, 0.5, 0.5], [0, 0, 0], [1, 0.5, 0], [0.08, 0.78, 0.7], [0.2, 0.1, 0.6],
];

/** Text-like animation: rounded glyph blocks sliding in with glow, outline strokes and a fade. */
const drawTitle: Draw = (c, t) => {
  const glyphs = 9;
  for (let g = 0; g < glyphs; g += 1) {
    const start = g * 0.12;
    const p = Math.min(1, Math.max(0, (t - start) / 0.5));
    const ease = 1 - (1 - p) ** 3;
    const x = 120 + g * 115;
    const y = 180 + (1 - ease) * 60;
    const alpha = ease * (t > 2.4 ? Math.max(0, 1 - (t - 2.4) / 0.6) : 1);
    if (alpha <= 0) continue;
    const [r, gg, b] = HUES[(g % 6) + 1]!;
    c.glow(x, y, 26, r, gg, b, 0.55 * alpha);
    c.rect(x - 38, y - 52, 76, 104, 0, 0, 0, 0.6 * alpha);
    c.rect(x - 34, y - 48, 68, 96, r * 0.4 + 0.6, gg * 0.4 + 0.6, b * 0.4 + 0.6, alpha);
    c.line(x - 24, y - 30, x + 24, y + 30, 6, r, gg, b, alpha);
    c.line(x - 24, y + 30, x + 24, y - 30, 2.5, 0.1, 0.1, 0.1, alpha);
    c.circle(x, y, 9, 1, 1, 1, alpha);
  }
  c.line(80, 300, 80 + Math.min(1, t / 2) * 1120, 300, 3, 1, 0.8, 0.1, 0.9);
};

const CASES: readonly Case[] = [
  { name: 'transparent', width: 320, height: 120, fps: 30, duration: 0.3, quality: 'high', draw: () => {} },
  {
    name: 'opaque', width: 320, height: 120, fps: 30, duration: 0.3, quality: 'high',
    draw: (c, _t, f) => {
      for (let x = 0; x < c.width; x += 1) c.rect(x, 0, 1, c.height, x / c.width, 0.5, 1 - x / c.width, 1);
      HUES.slice(0, 8).forEach(([r, g, b], i) => c.rect(10 + i * 38, 20, 34, 40, r, g, b, 1));
      c.circle(40 + f * 20, 90, 18, 1, 1, 1, 1);
    },
  },
  {
    name: 'alpha_gradient', width: 320, height: 120, fps: 30, duration: 0.3, quality: 'high',
    draw: (c) => {
      for (let y = 0; y < c.height; y += 1) {
        for (let x = 0; x < c.width; x += 1) c.blend(x, y, y < 40 ? 1 : y < 80 ? 0.1 : 0.9, y < 40 ? 1 : y < 80 ? 0.6 : 0.2, y < 40 ? 1 : 0.2, x / (c.width - 1));
      }
    },
  },
  {
    name: 'thin_lines', width: 320, height: 120, fps: 30, duration: 0.3, quality: 'high',
    draw: (c, _t, f) => {
      for (let i = 0; i < 10; i += 1) {
        const [r, g, b] = HUES[i]!;
        c.line(5, 6 + i * 11 + f * 0.3, 315, 6 + i * 11 + f * 0.3, 1, r, g, b, 1 - i * 0.07);
        c.line(170 + i * 14 + f * 0.25, 2, 170 + i * 14 + f * 0.25, 118, 1, r, g, b, 1);
      }
      c.line(0, 0, 320, 120, 1, 1, 1, 1, 1);
    },
  },
  {
    name: 'color_patches', width: 320, height: 120, fps: 30, duration: 0.3, quality: 'high',
    draw: (c) => {
      const alphas = [1, 0.75, 0.5, 0.25];
      HUES.forEach(([r, g, b], i) => alphas.forEach((a, j) => c.rect((i % 6) * 53 + 2, Math.floor(i / 6) * 60 + j * 15, 50, 15, r, g, b, a)));
    },
  },
  {
    name: 'odd_size', width: 333, height: 77, fps: 30, duration: 0.5, quality: 'high',
    draw: (c, t) => {
      c.glow(40 + t * 500, 38, 12, 0.2, 0.6, 1, 0.8);
      c.circle(40 + t * 500, 38, 20, 1, 0.9, 0.2, 1);
      c.rect(328, 70, 5, 7, 1, 0, 0, 1); // bottom-right corner, in the partial macroblock
    },
  },
  {
    name: 'one_frame', width: 200, height: 100, fps: 5, duration: 0.2, quality: 'high',
    draw: (c) => {
      c.circle(100, 50, 40, 1, 0.3, 0, 1);
      c.circle(130, 50, 30, 0, 0.47, 1, 0.5);
    },
  },
  {
    name: 'tiny_17x9', width: 17, height: 9, fps: 30, duration: 0.2, quality: 'high',
    draw: (c, _t, f) => c.rect(f, 2, 6, 5, 1, 1, 1, 0.5 + f * 0.08),
  },
  {
    name: 'wide_flat', width: 1920, height: 64, fps: 30, duration: 0.2, quality: 'standard',
    draw: (c) => c.rect(0, 0, 1920, 32, 0.2, 0.4, 0.8, 1), // long alpha runs (> 2048 values per slice row)
  },
  { name: 'standard_high', width: 1280, height: 360, fps: 30, duration: 3, quality: 'high', draw: drawTitle, source: 'standard' },
  { name: 'standard_standard', width: 1280, height: 360, fps: 30, duration: 3, quality: 'standard', draw: drawTitle, source: 'standard' },
];

async function run(outDir: string): Promise<void> {
  mkdirSync(outDir, { recursive: true });
  const manifest: object[] = [];
  const written = new Set<string>();
  for (const testCase of CASES) {
    const rgbaName = `${testCase.source ?? testCase.name}.rgba`;
    const writeSource = !written.has(rgbaName);
    const fd = writeSource ? openSync(join(outDir, rgbaName), 'w') : -1;
    let frame = 0;
    const started = performance.now();
    let renderMs = 0;
    const result = await exportMov({
      width: testCase.width,
      height: testCase.height,
      duration: testCase.duration,
      fps: testCase.fps,
      quality: testCase.quality,
      render: (time) => {
        const renderStart = performance.now();
        const canvas = new SoftCanvas(testCase.width, testCase.height);
        testCase.draw(canvas, time, frame);
        frame += 1;
        const rgba = canvas.toRgba();
        if (fd >= 0) writeSync(fd, rgba);
        renderMs += performance.now() - renderStart;
        return rgba;
      },
      yieldControl: async () => {},
    });
    const totalMs = performance.now() - started;
    if (fd >= 0) closeSync(fd);
    written.add(rgbaName);
    writeFileSync(join(outDir, `${testCase.name}.mov`), result.bytes);
    const entry = {
      name: testCase.name,
      mov: `${testCase.name}.mov`,
      rgba: rgbaName,
      width: result.width,
      height: result.height,
      frames: result.frameCount,
      fps: result.fps,
      quality: result.quality,
      quantizationIndex: result.quantizationIndex,
      maxQuantizationIndex: result.maxQuantizationIndex,
      bytes: result.bytes.length,
      encodeMs: Math.round(totalMs - renderMs),
    };
    manifest.push(entry);
    console.log(JSON.stringify(entry));
  }
  writeFileSync(join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

const outDir = process.argv[2];
if (!outDir) {
  console.error('usage: node tools/make_test_mov.ts <out-dir>');
  process.exit(2);
}
await run(outDir);
