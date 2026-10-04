export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export function assertRgba(data: Uint8ClampedArray, width: number, height: number): void {
  if (data.length !== width * height * 4) throw new RangeError('RGBA buffer length does not match dimensions');
}

export function fullRect(width: number, height: number): Rect {
  return { x: 0, y: 0, width, height };
}

export function diffRect(
  previous: Uint8ClampedArray | undefined,
  current: Uint8ClampedArray,
  width: number,
  height: number,
): Rect | undefined {
  assertRgba(current, width, height);
  if (previous === undefined) return fullRect(width, height);
  assertRgba(previous, width, height);
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      if (
        previous[offset] !== current[offset] ||
        previous[offset + 1] !== current[offset + 1] ||
        previous[offset + 2] !== current[offset + 2] ||
        previous[offset + 3] !== current[offset + 3]
      ) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }
  return maxX < 0 ? undefined : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

export function cropRgba(
  source: Uint8ClampedArray,
  sourceWidth: number,
  sourceHeight: number,
  rect: Rect,
): Uint8ClampedArray {
  assertRgba(source, sourceWidth, sourceHeight);
  const output = new Uint8ClampedArray(rect.width * rect.height * 4);
  for (let y = 0; y < rect.height; y += 1) {
    const start = ((rect.y + y) * sourceWidth + rect.x) * 4;
    output.set(source.subarray(start, start + rect.width * 4), y * rect.width * 4);
  }
  return output;
}

export function expandRect(rect: Rect, margin: number, width: number, height: number): Rect {
  const x = Math.max(0, rect.x - margin);
  const y = Math.max(0, rect.y - margin);
  const right = Math.min(width, rect.x + rect.width + margin);
  const bottom = Math.min(height, rect.y + rect.height + margin);
  return { x, y, width: right - x, height: bottom - y };
}

export function rectEquals(left: Rect, right: Rect): boolean {
  return left.x === right.x && left.y === right.y && left.width === right.width && left.height === right.height;
}
