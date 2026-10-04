import type { Rect } from './image';

// Alpha is weighted heavily: glow/shadow edges span many alpha levels and errors there are the most visible.
const CHANNEL_WEIGHTS = [1, 1.25, 0.75, 3] as const;

interface Bin {
  readonly key: number;
  count: number;
  readonly sums: [number, number, number, number];
}

interface Point {
  readonly key: number;
  readonly weight: number;
  readonly value: [number, number, number, number];
}

export interface Palette {
  readonly rgba: Uint8Array;
  readonly lossless: boolean;
  readonly size: number;
  mapPixels(rgba: Uint8ClampedArray): Uint8Array;
}

function rgbaKey(r: number, g: number, b: number, a: number): number {
  return (((r << 24) | (g << 16) | (b << 8) | a) >>> 0);
}

function binKey(r: number, g: number, b: number, a: number): number {
  return (r >>> 3) | ((g >>> 3) << 5) | ((b >>> 3) << 10) | ((a >>> 2) << 15);
}

function premultiplied(r: number, g: number, b: number, a: number): [number, number, number, number] {
  const scale = a / 255;
  return [r * scale, g * scale, b * scale, a];
}

function distance(left: readonly number[], right: readonly number[]): number {
  let total = 0;
  for (let channel = 0; channel < 4; channel += 1) {
    const delta = left[channel]! - right[channel]!;
    total += delta * delta * CHANNEL_WEIGHTS[channel]!;
  }
  return total;
}

function weightedMean(points: readonly Point[]): [number, number, number, number] {
  const sums = [0, 0, 0, 0];
  let total = 0;
  for (const point of points) {
    total += point.weight;
    for (let channel = 0; channel < 4; channel += 1) sums[channel]! += point.value[channel]! * point.weight;
  }
  return sums.map((value) => value / total) as [number, number, number, number];
}

function boxError(points: readonly Point[]): number {
  const center = weightedMean(points);
  return points.reduce((sum, point) => sum + distance(point.value, center) * point.weight, 0);
}

function splitBox(points: readonly Point[]): [Point[], Point[]] {
  const center = weightedMean(points);
  let axis = 0;
  let bestVariance = -1;
  for (let channel = 0; channel < 4; channel += 1) {
    const variance = points.reduce((sum, point) => {
      const delta = point.value[channel]! - center[channel]!;
      return sum + delta * delta * point.weight;
    }, 0) * CHANNEL_WEIGHTS[channel]!;
    if (variance > bestVariance) {
      bestVariance = variance;
      axis = channel;
    }
  }
  const sorted = [...points].sort((left, right) => left.value[axis]! - right.value[axis]! || left.key - right.key);
  const total = sorted.reduce((sum, point) => sum + point.weight, 0);
  let cumulative = 0;
  let cut = 1;
  for (let index = 0; index < sorted.length - 1; index += 1) {
    cumulative += sorted[index]!.weight;
    cut = index + 1;
    if (cumulative >= total / 2) break;
  }
  return [sorted.slice(0, cut), sorted.slice(cut)];
}

function nearest(point: readonly number[], centers: readonly (readonly number[])[]): number {
  let selected = 0;
  let selectedDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < centers.length; index += 1) {
    const candidate = distance(point, centers[index]!);
    if (candidate < selectedDistance) {
      selected = index;
      selectedDistance = candidate;
    }
  }
  return selected;
}

export class PaletteAnalyzer {
  readonly #bins = new Map<number, Bin>();
  #unique: Map<number, [number, number, number, number]> | undefined = new Map();

  addPixels(rgba: Uint8ClampedArray, width: number, rect: Rect): void {
    for (let y = rect.y; y < rect.y + rect.height; y += 1) {
      for (let x = rect.x; x < rect.x + rect.width; x += 1) {
        const offset = (y * width + x) * 4;
        const r = rgba[offset]!;
        const g = rgba[offset + 1]!;
        const b = rgba[offset + 2]!;
        const a = rgba[offset + 3]!;
        if (a === 0) continue;
        if (this.#unique !== undefined) {
          const exact = rgbaKey(r, g, b, a);
          if (!this.#unique.has(exact)) this.#unique.set(exact, [r, g, b, a]);
          if (this.#unique.size > 255) this.#unique = undefined;
        }
        const key = binKey(r, g, b, a);
        const bin = this.#bins.get(key);
        if (bin === undefined) this.#bins.set(key, { key, count: 1, sums: [r, g, b, a] });
        else {
          bin.count += 1;
          bin.sums[0] += r;
          bin.sums[1] += g;
          bin.sums[2] += b;
          bin.sums[3] += a;
        }
      }
    }
  }

  build(): Palette {
    if (this.#unique !== undefined) return createLosslessPalette(this.#unique);
    const points: Point[] = [...this.#bins.values()].map((bin) => {
      const average = bin.sums.map((sum) => sum / bin.count) as [number, number, number, number];
      // sqrt(count) keeps large flat areas from absorbing palette entries that thin gradients need (D-04 revision).
      return { key: bin.key, weight: Math.sqrt(bin.count), value: premultiplied(...average) };
    });
    if (points.length === 0) return createLosslessPalette(new Map());

    let centers: [number, number, number, number][];
    if (points.length <= 255) centers = points.map((point) => [...point.value]);
    else {
      const boxes: Point[][] = [points];
      while (boxes.length < 255) {
        let selected = -1;
        let selectedError = -1;
        for (let index = 0; index < boxes.length; index += 1) {
          if (boxes[index]!.length < 2) continue;
          const error = boxError(boxes[index]!);
          if (error > selectedError) {
            selected = index;
            selectedError = error;
          }
        }
        if (selected < 0) break;
        const [left, right] = splitBox(boxes[selected]!);
        boxes.splice(selected, 1, left, right);
      }
      centers = boxes.map(weightedMean);
      const iterations = points.length * centers.length > 24_000_000 ? 2 : 6;
      for (let iteration = 0; iteration < iterations; iteration += 1) {
        const sums = centers.map(() => [0, 0, 0, 0] as [number, number, number, number]);
        const weights = new Array<number>(centers.length).fill(0);
        for (const point of points) {
          const cluster = nearest(point.value, centers);
          weights[cluster]! += point.weight;
          for (let channel = 0; channel < 4; channel += 1) sums[cluster]![channel] += point.value[channel]! * point.weight;
        }
        centers = centers.map((center, index) =>
          weights[index] === 0
            ? center
            : sums[index]!.map((sum) => sum / weights[index]!) as [number, number, number, number],
        );
      }
    }
    return createQuantizedPalette(centers, points);
  }
}

function createLosslessPalette(colors: ReadonlyMap<number, readonly [number, number, number, number]>): Palette {
  const entries = [...colors.entries()];
  const rgba = new Uint8Array((entries.length + 1) * 4);
  const exact = new Map<number, number>();
  entries.forEach(([key, color], index) => {
    rgba.set(color, (index + 1) * 4);
    exact.set(key, index + 1);
  });
  const centers = entries.map(([, color]) => premultiplied(...color));
  return {
    rgba,
    lossless: true,
    size: entries.length + 1,
    mapPixels(source) {
      const output = new Uint8Array(source.length / 4);
      for (let pixel = 0; pixel < output.length; pixel += 1) {
        const offset = pixel * 4;
        const a = source[offset + 3]!;
        if (a === 0) continue;
        const key = rgbaKey(source[offset]!, source[offset + 1]!, source[offset + 2]!, a);
        output[pixel] = exact.get(key) ?? nearest(premultiplied(source[offset]!, source[offset + 1]!, source[offset + 2]!, a), centers) + 1;
      }
      return output;
    },
  };
}

function createQuantizedPalette(centers: readonly (readonly [number, number, number, number])[], points: readonly Point[]): Palette {
  const rgba = new Uint8Array((centers.length + 1) * 4);
  centers.forEach((center, index) => {
    const alpha = Math.max(1, Math.min(255, Math.round(center[3])));
    const scale = 255 / alpha;
    rgba[(index + 1) * 4] = Math.max(0, Math.min(255, Math.round(center[0] * scale)));
    rgba[(index + 1) * 4 + 1] = Math.max(0, Math.min(255, Math.round(center[1] * scale)));
    rgba[(index + 1) * 4 + 2] = Math.max(0, Math.min(255, Math.round(center[2] * scale)));
    rgba[(index + 1) * 4 + 3] = alpha;
  });
  const binMap = new Map<number, number>();
  for (const point of points) binMap.set(point.key, nearest(point.value, centers) + 1);
  return {
    rgba,
    lossless: false,
    size: centers.length + 1,
    mapPixels(source) {
      const output = new Uint8Array(source.length / 4);
      for (let pixel = 0; pixel < output.length; pixel += 1) {
        const offset = pixel * 4;
        const a = source[offset + 3]!;
        if (a === 0) continue;
        const key = binKey(source[offset]!, source[offset + 1]!, source[offset + 2]!, a);
        let mapped = binMap.get(key);
        if (mapped === undefined) {
          mapped = nearest(premultiplied(source[offset]!, source[offset + 1]!, source[offset + 2]!, a), centers) + 1;
          binMap.set(key, mapped);
        }
        output[pixel] = mapped;
      }
      return output;
    },
  };
}
