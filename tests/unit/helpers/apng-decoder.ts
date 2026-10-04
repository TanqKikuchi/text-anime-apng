import { inflateSync } from 'node:zlib';
import { crc32 } from '../../../src/core/binary';

export interface ParsedChunk {
  readonly type: string;
  readonly data: Uint8Array;
  readonly crc: number;
  readonly validCrc: boolean;
}

interface Control {
  readonly width: number;
  readonly height: number;
  readonly x: number;
  readonly y: number;
  readonly delay: number;
  readonly dispose: number;
  readonly blend: number;
}

export interface DecodedApng {
  readonly width: number;
  readonly height: number;
  readonly numFrames: number;
  readonly numPlays: number;
  readonly frames: readonly Uint8ClampedArray[];
  readonly controls: readonly Control[];
  readonly defaultImage?: Uint8ClampedArray;
  readonly chunks: readonly ParsedChunk[];
}

function u32(data: Uint8Array, offset = 0): number {
  return new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(offset);
}

function u16(data: Uint8Array, offset: number): number {
  return new DataView(data.buffer, data.byteOffset, data.byteLength).getUint16(offset);
}

export function parsePngChunks(bytes: Uint8Array): ParsedChunk[] {
  const chunks: ParsedChunk[] = [];
  let offset = 8;
  while (offset < bytes.length) {
    const length = u32(bytes, offset);
    const typeBytes = bytes.slice(offset + 4, offset + 8);
    const type = String.fromCharCode(...typeBytes);
    const data = bytes.slice(offset + 8, offset + 8 + length);
    const crc = u32(bytes, offset + 8 + length);
    chunks.push({ type, data, crc, validCrc: crc32(typeBytes, data) === crc });
    offset += 12 + length;
  }
  return chunks;
}

function paeth(left: number, above: number, upperLeft: number): number {
  const estimate = left + above - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const aboveDistance = Math.abs(estimate - above);
  const diagonalDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= aboveDistance && leftDistance <= diagonalDistance) return left;
  return aboveDistance <= diagonalDistance ? above : upperLeft;
}

function unfilter(compressed: Uint8Array, width: number, height: number, bytesPerPixel: number): Uint8Array {
  const filtered = inflateSync(compressed);
  const stride = width * bytesPerPixel;
  const output = new Uint8Array(stride * height);
  for (let y = 0; y < height; y += 1) {
    const sourceStart = y * (stride + 1);
    const type = filtered[sourceStart]!;
    for (let x = 0; x < stride; x += 1) {
      const encoded = filtered[sourceStart + 1 + x]!;
      const target = y * stride + x;
      const left = x >= bytesPerPixel ? output[target - bytesPerPixel]! : 0;
      const above = y > 0 ? output[target - stride]! : 0;
      const upperLeft = y > 0 && x >= bytesPerPixel ? output[target - stride - bytesPerPixel]! : 0;
      let prediction = 0;
      if (type === 1) prediction = left;
      else if (type === 2) prediction = above;
      else if (type === 3) prediction = Math.floor((left + above) / 2);
      else if (type === 4) prediction = paeth(left, above, upperLeft);
      output[target] = (encoded + prediction) & 0xff;
    }
  }
  return output;
}

function decodePixels(
  compressed: Uint8Array,
  width: number,
  height: number,
  colorType: number,
  palette: Uint8Array | undefined,
  alpha: Uint8Array | undefined,
): Uint8ClampedArray {
  if (colorType === 6) return new Uint8ClampedArray(unfilter(compressed, width, height, 4));
  if (colorType !== 3 || palette === undefined) throw new Error(`Unsupported PNG color type ${colorType}`);
  const indexes = unfilter(compressed, width, height, 1);
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let pixel = 0; pixel < indexes.length; pixel += 1) {
    const index = indexes[pixel]!;
    rgba[pixel * 4] = palette[index * 3]!;
    rgba[pixel * 4 + 1] = palette[index * 3 + 1]!;
    rgba[pixel * 4 + 2] = palette[index * 3 + 2]!;
    rgba[pixel * 4 + 3] = alpha?.[index] ?? 255;
  }
  return rgba;
}

export function decodePng(bytes: Uint8Array): Uint8ClampedArray {
  const chunks = parsePngChunks(bytes);
  const ihdr = chunks.find((chunk) => chunk.type === 'IHDR')!.data;
  const idat = chunks.find((chunk) => chunk.type === 'IDAT')!.data;
  return decodePixels(
    idat,
    u32(ihdr),
    u32(ihdr, 4),
    ihdr[9]!,
    chunks.find((chunk) => chunk.type === 'PLTE')?.data,
    chunks.find((chunk) => chunk.type === 'tRNS')?.data,
  );
}

export function decodeApng(bytes: Uint8Array): DecodedApng {
  const chunks = parsePngChunks(bytes);
  const ihdr = chunks.find((chunk) => chunk.type === 'IHDR')!.data;
  const width = u32(ihdr);
  const height = u32(ihdr, 4);
  const colorType = ihdr[9]!;
  const palette = chunks.find((chunk) => chunk.type === 'PLTE')?.data;
  const alpha = chunks.find((chunk) => chunk.type === 'tRNS')?.data;
  const actl = chunks.find((chunk) => chunk.type === 'acTL')!.data;
  const animation: { control: Control; compressed: Uint8Array }[] = [];
  let pending: Control | undefined;
  let defaultImage: Uint8ClampedArray | undefined;
  for (const chunk of chunks) {
    if (chunk.type === 'fcTL') {
      pending = {
        width: u32(chunk.data, 4),
        height: u32(chunk.data, 8),
        x: u32(chunk.data, 12),
        y: u32(chunk.data, 16),
        delay: u16(chunk.data, 20),
        dispose: chunk.data[24]!,
        blend: chunk.data[25]!,
      };
    } else if (chunk.type === 'IDAT') {
      if (pending === undefined) defaultImage = decodePixels(chunk.data, width, height, colorType, palette, alpha);
      else {
        animation.push({ control: pending, compressed: chunk.data });
        pending = undefined;
      }
    } else if (chunk.type === 'fdAT') {
      if (pending === undefined) throw new Error('fdAT without fcTL');
      animation.push({ control: pending, compressed: chunk.data.slice(4) });
      pending = undefined;
    }
  }
  const canvas = new Uint8ClampedArray(width * height * 4);
  const frames: Uint8ClampedArray[] = [];
  for (const entry of animation) {
    const pixels = decodePixels(
      entry.compressed,
      entry.control.width,
      entry.control.height,
      colorType,
      palette,
      alpha,
    );
    for (let y = 0; y < entry.control.height; y += 1) {
      for (let x = 0; x < entry.control.width; x += 1) {
        const source = (y * entry.control.width + x) * 4;
        const target = ((entry.control.y + y) * width + entry.control.x + x) * 4;
        canvas.set(pixels.subarray(source, source + 4), target);
      }
    }
    for (let repeat = 0; repeat < entry.control.delay; repeat += 1) frames.push(canvas.slice());
  }
  return {
    width,
    height,
    numFrames: u32(actl),
    numPlays: u32(actl, 4),
    frames,
    controls: animation.map((entry) => entry.control),
    defaultImage,
    chunks,
  };
}
