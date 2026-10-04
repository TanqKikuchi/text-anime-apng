import { ascii, concatBytes, u16be, u32be } from './binary.ts';

/**
 * Minimal QuickTime (.mov) writer for one video track of intra-only frames
 * (QuickTime File Format: ftyp, wide, mdat, moov/mvhd/trak/tkhd/edts/mdia/minf/stbl).
 */
export interface MovVideoOptions {
  readonly width: number;
  readonly height: number;
  /** Integral frames per second. */
  readonly fps: number;
  /** Sample description four-character code, e.g. 'ap4h'. */
  readonly codec: string;
  /** Compressor name stored in the sample description (≤ 31 bytes). */
  readonly compressorName: string;
  /** Sample description depth: 24 = no alpha, 32 = alpha. */
  readonly depth: number;
  /** nclc colour parameters (primaries, transfer, matrix). */
  readonly color?: { readonly primaries: number; readonly transfer: number; readonly matrix: number };
}

export interface MovTiming {
  readonly timescale: number;
  readonly sampleDelta: number;
}

const U32_MAX = 0xffffffff;
const IDENTITY_MATRIX = [0x00010000, 0, 0, 0, 0x00010000, 0, 0, 0, 0x40000000];

export function movTiming(fps: number): MovTiming {
  if (!Number.isInteger(fps) || fps <= 0 || fps > 1000) throw new RangeError('MOV fps must be an integer in 1..1000');
  const timescale = 600 % fps === 0 ? 600 : fps * 100;
  return { timescale, sampleDelta: timescale / fps };
}

function box(type: string, ...parts: Uint8Array[]): Uint8Array {
  const payload = concatBytes(parts);
  if (payload.length + 8 > U32_MAX) throw new RangeError(`${type} box too large`);
  return concatBytes([u32be(payload.length + 8), ascii(type), payload]);
}

function fullBox(type: string, version: number, flags: number, ...parts: Uint8Array[]): Uint8Array {
  return box(type, u32be(((version & 0xff) << 24) | (flags & 0xffffff)), ...parts);
}

function u64be(value: number): Uint8Array {
  return concatBytes([u32be(Math.floor(value / 2 ** 32)), u32be(value >>> 0)]);
}

function zeros(count: number): Uint8Array {
  return new Uint8Array(count);
}

function matrix(): Uint8Array {
  return concatBytes(IDENTITY_MATRIX.map((value) => u32be(value)));
}

function fixed16(value: number): Uint8Array {
  return u32be(Math.round(value * 65536) >>> 0);
}

function pascalString(text: string, fieldLength?: number): Uint8Array {
  const bytes = ascii(text);
  const max = fieldLength === undefined ? 255 : fieldLength - 1;
  if (bytes.length > max) throw new RangeError(`string too long: ${text}`);
  const out = new Uint8Array(fieldLength ?? bytes.length + 1);
  out[0] = bytes.length;
  out.set(bytes, 1);
  return out;
}

function sampleDescription(options: MovVideoOptions): Uint8Array {
  if (options.codec.length !== 4) throw new RangeError('codec must be a four-character code');
  const extensions: Uint8Array[] = [];
  if (options.color) {
    extensions.push(
      box('colr', ascii('nclc'), u16be(options.color.primaries), u16be(options.color.transfer), u16be(options.color.matrix)),
    );
  }
  extensions.push(box('fiel', Uint8Array.of(1, 0))); // one field (progressive)
  extensions.push(box('pasp', u32be(1), u32be(1))); // square pixels
  const entry = box(
    options.codec,
    zeros(6), // reserved
    u16be(1), // data reference index
    u16be(0), // version
    u16be(0), // revision level
    u32be(0), // vendor
    u32be(0), // temporal quality
    u32be(0x200), // spatial quality (codecNormalQuality)
    u16be(options.width),
    u16be(options.height),
    fixed16(72), // horizontal resolution
    fixed16(72), // vertical resolution
    u32be(0), // data size
    u16be(1), // frame count per sample
    pascalString(options.compressorName, 32),
    u16be(options.depth),
    u16be(0xffff), // color table ID: -1 (none)
    ...extensions,
  );
  return fullBox('stsd', 0, 0, u32be(1), entry);
}

/**
 * Builds a complete .mov file: ftyp, wide, mdat (frames back to back, one sample per chunk), moov.
 * Uses a 64-bit mdat header and co64 offsets when the file exceeds 4 GiB.
 */
export function buildMov(options: MovVideoOptions, frames: readonly Uint8Array[]): Uint8Array {
  if (frames.length === 0) throw new RangeError('MOV needs at least one frame');
  if (!Number.isInteger(options.width) || options.width < 1 || options.width > 0xffff) throw new RangeError('bad width');
  if (!Number.isInteger(options.height) || options.height < 1 || options.height > 0xffff) throw new RangeError('bad height');
  const { timescale, sampleDelta } = movTiming(options.fps);
  const duration = frames.length * sampleDelta;
  if (duration > U32_MAX) throw new RangeError('MOV duration too long');

  const ftyp = box('ftyp', ascii('qt  '), u32be(0x200), ascii('qt  '));
  const payloadSize = frames.reduce((sum, frame) => sum + frame.length, 0);
  const large = payloadSize + 8 > U32_MAX;
  // 'wide' reserves the 8 bytes a 64-bit mdat header needs, so sample offsets are identical either way.
  const mdatHeader = large
    ? concatBytes([u32be(1), ascii('mdat'), u64be(payloadSize + 16)])
    : concatBytes([u32be(8), ascii('wide'), u32be(payloadSize + 8), ascii('mdat')]);
  const firstOffset = ftyp.length + 16;
  const offsets: number[] = [];
  let offset = firstOffset;
  for (const frame of frames) {
    offsets.push(offset);
    offset += frame.length;
  }
  const needCo64 = offset > U32_MAX;

  const mvhd = fullBox(
    'mvhd', 0, 0,
    u32be(0), u32be(0), // creation / modification time
    u32be(timescale), u32be(duration),
    fixed16(1), // preferred rate
    u16be(0x0100), // preferred volume
    zeros(10),
    matrix(),
    u32be(0), u32be(0), u32be(0), u32be(0), u32be(0), u32be(0), // preview, poster, selection, current time
    u32be(2), // next track ID
  );
  const tkhd = fullBox(
    'tkhd', 0, 0x0f, // enabled, in movie, in preview, in poster
    u32be(0), u32be(0),
    u32be(1), // track ID
    u32be(0),
    u32be(duration),
    zeros(8),
    u16be(0), u16be(0), // layer, alternate group
    u16be(0), u16be(0), // volume, reserved
    matrix(),
    fixed16(options.width), fixed16(options.height),
  );
  const edts = box('edts', fullBox('elst', 0, 0, u32be(1), u32be(duration), u32be(0), fixed16(1)));
  const mdhd = fullBox('mdhd', 0, 0, u32be(0), u32be(0), u32be(timescale), u32be(duration), u16be(0x55c4), u16be(0));
  const mediaHandler = fullBox('hdlr', 0, 0, ascii('mhlr'), ascii('vide'), u32be(0), u32be(0), u32be(0), pascalString('Video Media Handler'));
  const vmhd = fullBox('vmhd', 0, 1, u16be(0x40), u16be(0x8000), u16be(0x8000), u16be(0x8000));
  const dataHandler = fullBox('hdlr', 0, 0, ascii('dhlr'), ascii('alis'), u32be(0), u32be(0), u32be(0), pascalString('Data Handler'));
  const dinf = box('dinf', fullBox('dref', 0, 0, u32be(1), fullBox('alis', 0, 1)));
  const stts = fullBox('stts', 0, 0, u32be(1), u32be(frames.length), u32be(sampleDelta));
  const stsc = fullBox('stsc', 0, 0, u32be(1), u32be(1), u32be(1), u32be(1));
  const sizes = new Uint8Array(frames.length * 4);
  const sizeView = new DataView(sizes.buffer);
  frames.forEach((frame, index) => sizeView.setUint32(index * 4, frame.length));
  const stsz = fullBox('stsz', 0, 0, u32be(0), u32be(frames.length), sizes);
  const offsetBytes = new Uint8Array(frames.length * (needCo64 ? 8 : 4));
  const offsetView = new DataView(offsetBytes.buffer);
  offsets.forEach((value, index) => {
    if (needCo64) {
      offsetView.setUint32(index * 8, Math.floor(value / 2 ** 32));
      offsetView.setUint32(index * 8 + 4, value >>> 0);
    } else offsetView.setUint32(index * 4, value);
  });
  const chunkOffsets = fullBox(needCo64 ? 'co64' : 'stco', 0, 0, u32be(frames.length), offsetBytes);
  const stbl = box('stbl', sampleDescription(options), stts, stsc, stsz, chunkOffsets);
  const minf = box('minf', vmhd, dataHandler, dinf, stbl);
  const mdia = box('mdia', mdhd, mediaHandler, minf);
  const trak = box('trak', tkhd, edts, mdia);
  const moov = box('moov', mvhd, trak);

  const total = ftyp.length + mdatHeader.length + payloadSize + moov.length;
  const out = new Uint8Array(total);
  let p = 0;
  out.set(ftyp, p);
  p += ftyp.length;
  out.set(mdatHeader, p);
  p += mdatHeader.length;
  for (const frame of frames) {
    out.set(frame, p);
    p += frame.length;
  }
  out.set(moov, p);
  return out;
}
