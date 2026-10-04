import { concatBytes, crc32, writeU16le, writeU32le } from './binary';
import { ExportCancelledError, type ExportProgress, type RenderFrame } from './export';
import { encodePng } from './png';
import { assertPixelFrameLimit, createFrameTimeline } from './timeline';

interface CentralEntry {
  readonly name: Uint8Array;
  readonly crc: number;
  readonly size: number;
  readonly offset: number;
  readonly time: number;
  readonly date: number;
}

function dosDateTime(value: Date): readonly [number, number] {
  const year = Math.max(1980, Math.min(2107, value.getFullYear()));
  const time = (value.getHours() << 11) | (value.getMinutes() << 5) | Math.floor(value.getSeconds() / 2);
  const date = ((year - 1980) << 9) | ((value.getMonth() + 1) << 5) | value.getDate();
  return [time, date];
}

export class ZipWriter {
  readonly #parts: Uint8Array[] = [];
  readonly #entries: CentralEntry[] = [];
  readonly #timestamp: Date;
  #offset = 0;
  #finished = false;

  constructor(timestamp = new Date()) {
    this.#timestamp = timestamp;
  }

  add(name: string, data: Uint8Array): void {
    if (this.#finished) throw new Error('ZIP writer has already finished');
    if (this.#entries.length >= 65535) throw new RangeError('ZIP64 is not supported');
    const encodedName = new TextEncoder().encode(name);
    const crc = crc32(data);
    const [time, date] = dosDateTime(this.#timestamp);
    const header = new Uint8Array(30);
    const view = new DataView(header.buffer);
    writeU32le(view, 0, 0x04034b50);
    writeU16le(view, 4, 20);
    writeU16le(view, 6, 0x0800);
    writeU16le(view, 8, 0);
    writeU16le(view, 10, time);
    writeU16le(view, 12, date);
    writeU32le(view, 14, crc);
    writeU32le(view, 18, data.length);
    writeU32le(view, 22, data.length);
    writeU16le(view, 26, encodedName.length);
    writeU16le(view, 28, 0);
    this.#parts.push(header, encodedName, data);
    this.#entries.push({ name: encodedName, crc, size: data.length, offset: this.#offset, time, date });
    this.#offset += header.length + encodedName.length + data.length;
  }

  finish(): Uint8Array {
    if (this.#finished) throw new Error('ZIP writer has already finished');
    this.#finished = true;
    const centralOffset = this.#offset;
    const central: Uint8Array[] = [];
    for (const entry of this.#entries) {
      const header = new Uint8Array(46);
      const view = new DataView(header.buffer);
      writeU32le(view, 0, 0x02014b50);
      writeU16le(view, 4, 20);
      writeU16le(view, 6, 20);
      writeU16le(view, 8, 0x0800);
      writeU16le(view, 10, 0);
      writeU16le(view, 12, entry.time);
      writeU16le(view, 14, entry.date);
      writeU32le(view, 16, entry.crc);
      writeU32le(view, 20, entry.size);
      writeU32le(view, 24, entry.size);
      writeU16le(view, 28, entry.name.length);
      writeU16le(view, 30, 0);
      writeU16le(view, 32, 0);
      writeU16le(view, 34, 0);
      writeU16le(view, 36, 0);
      writeU32le(view, 38, 0);
      writeU32le(view, 42, entry.offset);
      central.push(header, entry.name);
    }
    const centralSize = central.reduce((sum, part) => sum + part.length, 0);
    const end = new Uint8Array(22);
    const view = new DataView(end.buffer);
    writeU32le(view, 0, 0x06054b50);
    writeU16le(view, 4, 0);
    writeU16le(view, 6, 0);
    writeU16le(view, 8, this.#entries.length);
    writeU16le(view, 10, this.#entries.length);
    writeU32le(view, 12, centralSize);
    writeU32le(view, 16, centralOffset);
    writeU16le(view, 20, 0);
    return concatBytes([...this.#parts, ...central, end]);
  }
}

export interface PngSequenceOptions {
  readonly baseName: string;
  readonly width: number;
  readonly height: number;
  readonly duration: number;
  readonly fps: number;
  readonly render: RenderFrame;
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: ExportProgress) => void;
  readonly yieldControl?: () => Promise<void>;
  readonly timestamp?: Date;
}

export interface PngBytesSequenceOptions extends Omit<PngSequenceOptions, 'render'> {
  readonly renderPng: (time: number) => Uint8Array | Promise<Uint8Array>;
}

function cancelled(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new ExportCancelledError();
}

function nextTask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export async function encodePngSequenceZip(options: PngSequenceOptions): Promise<Uint8Array> {
  return encodePngBytesSequenceZip({
    ...options,
    renderPng: async (time) => encodePng(await options.render(time), options.width, options.height),
  });
}

export async function encodePngBytesSequenceZip(options: PngBytesSequenceOptions): Promise<Uint8Array> {
  const timeline = createFrameTimeline(options.duration, options.fps);
  assertPixelFrameLimit(options.width, options.height, timeline.count);
  const writer = new ZipWriter(options.timestamp);
  const digits = Math.max(4, String(timeline.count).length);
  const yieldControl = options.yieldControl ?? nextTask;
  for (let index = 0; index < timeline.count; index += 1) {
    cancelled(options.signal);
    const png = await options.renderPng(timeline.times[index]!);
    writer.add(`${options.baseName}_${String(index + 1).padStart(digits, '0')}.png`, png);
    options.onProgress?.({ percent: ((index + 1) / timeline.count) * 100, phase: 'encode', current: index + 1, total: timeline.count });
    if ((index + 1) % 2 === 0 || index + 1 === timeline.count) await yieldControl();
  }
  const info = [
    `fps: ${options.fps}`,
    `frames: ${timeline.count}`,
    `size: ${options.width}x${options.height}`,
    `duration: ${(timeline.count / options.fps).toFixed(3)}s`,
  ].join('\n');
  writer.add(`${options.baseName}_info.txt`, new TextEncoder().encode(info));
  return writer.finish();
}
