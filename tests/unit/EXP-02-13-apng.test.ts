import { describe, expect, it } from 'vitest';
import { ApngEncoder, crc32, PNG_SIGNATURE } from '../../src/core';
import { decodeApng } from './helpers/apng-decoder';

function frame(width: number, height: number, pixels: readonly (readonly [number, number, number, number])[]): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(width * height * 4);
  pixels.forEach((pixel, index) => rgba.set(pixel, index * 4));
  return rgba;
}

const transparent = [0, 0, 0, 0] as const;
const red = [255, 0, 0, 255] as const;

async function make(includeDefaultImage: boolean, loop: 'once' | 'forever' | 'count' = 'once') {
  const empty = frame(2, 1, [transparent, transparent]);
  const opaque = frame(2, 1, [red, transparent]);
  const encoder = new ApngEncoder({
    width: 2,
    height: 1,
    fps: 12,
    loop: loop === 'count' ? { kind: 'count', count: 7 } : { kind: loop },
    includeDefaultImage,
  });
  if (includeDefaultImage) await encoder.setDefaultImage(opaque);
  await encoder.addFrame(empty);
  await encoder.addFrame(opaque);
  await encoder.addFrame(empty);
  return { result: encoder.finish(), input: [empty, opaque, empty], opaque };
}

describe('EXP-02/03/05/06/09/10/12/13 APNG container', () => {
  it('writes a valid default-image APNG with contiguous sequence numbers', async () => {
    const { result, input, opaque } = await make(true);
    expect([...result.bytes.slice(0, 8)]).toEqual([...PNG_SIGNATURE]);
    const decoded = decodeApng(result.bytes);
    expect(decoded.chunks.every((chunk) => chunk.validCrc)).toBe(true);
    expect(decoded.chunks.map((chunk) => chunk.type)).toEqual([
      'IHDR', 'acTL', 'IDAT', 'fcTL', 'fdAT', 'fcTL', 'fdAT', 'fcTL', 'fdAT', 'IEND',
    ]);
    expect(decoded.frames).toEqual(input);
    expect(decoded.defaultImage).toEqual(opaque);
    expect(decoded.numFrames).toBe(3);
    expect(decoded.numPlays).toBe(1);
    expect(decoded.controls[0]).toMatchObject({ x: 0, y: 0, width: 2, height: 1 });
    expect(decoded.controls.every((control) => control.dispose === 0 && control.blend === 0)).toBe(true);
    const sequence = decoded.chunks
      .filter((chunk) => chunk.type === 'fcTL' || chunk.type === 'fdAT')
      .map((chunk) => new DataView(chunk.data.buffer, chunk.data.byteOffset).getUint32(0));
    expect(sequence).toEqual([0, 1, 2, 3, 4, 5]);
    const ihdr = decoded.chunks[0]!.data;
    expect([...ihdr.slice(8)]).toEqual([8, 6, 0, 0, 0]);
  });

  it('uses the first IDAT as frame one when default image is off', async () => {
    const { result, input } = await make(false, 'forever');
    const decoded = decodeApng(result.bytes);
    expect(decoded.chunks.map((chunk) => chunk.type)).toEqual([
      'IHDR', 'acTL', 'fcTL', 'IDAT', 'fcTL', 'fdAT', 'fcTL', 'fdAT', 'IEND',
    ]);
    expect(decoded.frames).toEqual(input);
    expect(decoded.defaultImage).toBeUndefined();
    expect(decoded.numFrames).toBe(3);
    expect(decoded.numPlays).toBe(0);
    const sequence = decoded.chunks
      .filter((chunk) => chunk.type === 'fcTL' || chunk.type === 'fdAT')
      .map((chunk) => new DataView(chunk.data.buffer, chunk.data.byteOffset).getUint32(0));
    expect(sequence).toEqual([0, 1, 2, 3, 4]);
  });

  it('stores custom num_plays', async () => {
    const { result } = await make(false, 'count');
    expect(decodeApng(result.bytes).numPlays).toBe(7);
  });

  it('exports a single fully transparent frame', async () => {
    const rgba = new Uint8ClampedArray(3 * 2 * 4);
    const encoder = new ApngEncoder({ width: 3, height: 2, fps: 24, loop: { kind: 'once' }, includeDefaultImage: false });
    await encoder.addFrame(rgba);
    const decoded = decodeApng(encoder.finish().bytes);
    expect(decoded.frames).toEqual([rgba]);
    expect(decoded.controls[0]).toMatchObject({ width: 3, height: 2, delay: 1 });
  });

  it('uses standard CRC-32', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });
});
