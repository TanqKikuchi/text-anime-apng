import { concatBytes, pngChunk, u32be } from './binary';
import { deflateZlib } from './compression';
import { filterIndexed, filterRgba } from './filter';
import type { Palette } from './quantizer';

export const PNG_SIGNATURE = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10);

export function makeIhdr(width: number, height: number, indexed: boolean): Uint8Array {
  return concatBytes([
    u32be(width),
    u32be(height),
    Uint8Array.of(8, indexed ? 3 : 6, 0, 0, 0),
  ]);
}

export function paletteChunks(palette: Palette): Uint8Array[] {
  const rgb = new Uint8Array(palette.size * 3);
  const alpha = new Uint8Array(palette.size);
  for (let index = 0; index < palette.size; index += 1) {
    rgb[index * 3] = palette.rgba[index * 4]!;
    rgb[index * 3 + 1] = palette.rgba[index * 4 + 1]!;
    rgb[index * 3 + 2] = palette.rgba[index * 4 + 2]!;
    alpha[index] = palette.rgba[index * 4 + 3]!;
  }
  return [pngChunk('PLTE', rgb), pngChunk('tRNS', alpha)];
}

export async function compressPixels(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  palette?: Palette,
): Promise<Uint8Array> {
  const filtered = palette === undefined
    ? filterRgba(new Uint8Array(rgba.buffer, rgba.byteOffset, rgba.byteLength), width, height)
    : filterIndexed(palette.mapPixels(rgba), width, height);
  return deflateZlib(filtered);
}

export async function encodePng(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  palette?: Palette,
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [PNG_SIGNATURE, pngChunk('IHDR', makeIhdr(width, height, palette !== undefined))];
  if (palette !== undefined) chunks.push(...paletteChunks(palette));
  chunks.push(pngChunk('IDAT', await compressPixels(rgba, width, height, palette)), pngChunk('IEND'));
  return concatBytes(chunks);
}
