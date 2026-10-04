const CRC_TABLE = buildCrcTable();

function buildCrcTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let value = n;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[n] = value >>> 0;
  }
  return table;
}

export function crc32(...parts: readonly Uint8Array<ArrayBufferLike>[]): number {
  let crc = 0xffffffff;
  for (const part of parts) {
    for (const value of part) crc = CRC_TABLE[(crc ^ value) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function ascii(value: string): Uint8Array {
  return Uint8Array.from(value, (character) => character.charCodeAt(0));
}

export function u16be(value: number): Uint8Array {
  return Uint8Array.of((value >>> 8) & 0xff, value & 0xff);
}

export function u32be(value: number): Uint8Array {
  return Uint8Array.of(
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  );
}

export function concatBytes(parts: readonly Uint8Array<ArrayBufferLike>[]): Uint8Array {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

export function pngChunk(type: string, data: Uint8Array<ArrayBufferLike> = new Uint8Array()): Uint8Array {
  if (type.length !== 4) throw new Error(`PNG chunk type must be four bytes: ${type}`);
  const typeBytes = ascii(type);
  return concatBytes([u32be(data.length), typeBytes, data, u32be(crc32(typeBytes, data))]);
}

export function writeU16le(view: DataView, offset: number, value: number): void {
  view.setUint16(offset, value, true);
}

export function writeU32le(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value, true);
}
