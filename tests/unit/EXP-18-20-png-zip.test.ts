import { describe, expect, it, vi } from 'vitest';
import { crc32, encodePng, encodePngBytesSequenceZip, encodePngSequenceZip } from '../../src/core';
import { decodePng, parsePngChunks } from './helpers/apng-decoder';

interface ZipEntry {
  readonly name: string;
  readonly data: Uint8Array;
  readonly method: number;
  readonly crc: number;
}

function parseZip(bytes: Uint8Array): ZipEntry[] {
  const entries: ZipEntry[] = [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;
  while (view.getUint32(offset, true) === 0x04034b50) {
    const method = view.getUint16(offset + 8, true);
    const crc = view.getUint32(offset + 14, true);
    const size = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    entries.push({
      name: new TextDecoder().decode(bytes.slice(nameStart, nameStart + nameLength)),
      data: bytes.slice(dataStart, dataStart + size),
      method,
      crc,
    });
    offset = dataStart + size;
  }
  expect(view.getUint32(offset, true)).toBe(0x02014b50);
  const endOffset = bytes.length - 22;
  expect(view.getUint32(endOffset, true)).toBe(0x06054b50);
  expect(view.getUint16(endOffset + 10, true)).toBe(entries.length);
  expect(view.getUint32(endOffset + 16, true)).toBe(offset);
  return entries;
}

describe('EXP-18 still PNG', () => {
  it('round-trips full-colour RGBA with valid chunks', async () => {
    const rgba = new Uint8ClampedArray([255, 0, 0, 255, 0, 20, 80, 100]);
    const png = await encodePng(rgba, 2, 1);
    expect(parsePngChunks(png).every((chunk) => chunk.validCrc)).toBe(true);
    expect(decodePng(png)).toEqual(rgba);
  });
});

describe('EXP-19/20 sequential PNG ZIP', () => {
  it('stores every unmerged PNG plus info and valid local/central records', async () => {
    const rgba = new Uint8ClampedArray([10, 20, 30, 255]);
    const zip = await encodePngSequenceZip({
      baseName: 'sample',
      width: 1,
      height: 1,
      duration: 2,
      fps: 12,
      render: () => rgba,
      timestamp: new Date(2026, 0, 2, 3, 4, 6),
      yieldControl: async () => undefined,
    });
    const entries = parseZip(zip);
    expect(entries).toHaveLength(25);
    expect(entries[0]!.name).toBe('sample_0001.png');
    expect(entries[23]!.name).toBe('sample_0024.png');
    expect(entries[24]!.name).toBe('sample_info.txt');
    expect(entries.every((entry) => entry.method === 0 && crc32(entry.data) === entry.crc)).toBe(true);
    expect(decodePng(entries[0]!.data)).toEqual(rgba);
    expect(new TextDecoder().decode(entries[24]!.data)).toContain('duration: 2.000s');
  });

  it('packages browser-produced PNG bytes without CompressionStream', async () => {
    const png = await encodePng(new Uint8ClampedArray([1, 2, 3, 255]), 1, 1);
    vi.stubGlobal('CompressionStream', undefined);
    const zip = await encodePngBytesSequenceZip({
      baseName: 'plain',
      width: 1,
      height: 1,
      duration: 0.2,
      fps: 12,
      renderPng: () => png,
      yieldControl: async () => undefined,
    });
    vi.unstubAllGlobals();
    const entries = parseZip(zip);
    expect(entries.slice(0, 3).every((entry) => entry.data.length === png.length)).toBe(true);
    expect(entries).toHaveLength(4);
  });
});
