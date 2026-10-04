import { concatBytes, pngChunk, u16be, u32be } from './binary';
import { cropRgba, diffRect, fullRect, type Rect } from './image';
import { compressPixels, makeIhdr, paletteChunks, PNG_SIGNATURE } from './png';
import type { Palette } from './quantizer';
import { loopNumPlays, type LoopMode } from './timeline';

interface EncodedFrame {
  readonly rect: Rect;
  readonly compressed: Uint8Array;
  delay: number;
}

export interface ApngEncoderOptions {
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly loop: LoopMode;
  readonly includeDefaultImage?: boolean;
  readonly trimRect?: Rect;
  readonly palette?: Palette;
}

export interface ApngResult {
  readonly bytes: Uint8Array;
  readonly sourceFrames: number;
  readonly storedFrames: number;
  readonly width: number;
  readonly height: number;
}

function extractRect(source: Uint8ClampedArray, sourceWidth: number, rect: Rect): Uint8ClampedArray {
  const output = new Uint8ClampedArray(rect.width * rect.height * 4);
  for (let y = 0; y < rect.height; y += 1) {
    const start = ((rect.y + y) * sourceWidth + rect.x) * 4;
    output.set(source.subarray(start, start + rect.width * 4), y * rect.width * 4);
  }
  return output;
}

export function normalizedDelay(delay: number, fps: number): readonly [number, number] {
  let numerator = Math.max(1, Math.round(delay));
  let denominator = Math.max(1, Math.round(fps));
  while (numerator > 65535) {
    numerator = Math.max(1, Math.round(numerator / 2));
    denominator = Math.max(1, Math.round(denominator / 2));
  }
  return [numerator, denominator];
}

function frameControl(sequence: number, frame: EncodedFrame, fps: number): Uint8Array {
  const [delayNumerator, delayDenominator] = normalizedDelay(frame.delay, fps);
  return concatBytes([
    u32be(sequence),
    u32be(frame.rect.width),
    u32be(frame.rect.height),
    u32be(frame.rect.x),
    u32be(frame.rect.y),
    u16be(delayNumerator),
    u16be(delayDenominator),
    Uint8Array.of(0, 0),
  ]);
}

export class ApngEncoder {
  readonly #sourceWidth: number;
  readonly #sourceHeight: number;
  readonly #width: number;
  readonly #height: number;
  readonly #fps: number;
  readonly #numPlays: number;
  readonly #includeDefault: boolean;
  readonly #trimRect: Rect;
  readonly #palette: Palette | undefined;
  readonly #frames: EncodedFrame[] = [];
  #previous: Uint8ClampedArray | undefined;
  #defaultImage: Uint8Array | undefined;
  #sourceFrames = 0;
  #finished = false;

  constructor(options: ApngEncoderOptions) {
    this.#sourceWidth = options.width;
    this.#sourceHeight = options.height;
    this.#fps = options.fps;
    this.#numPlays = loopNumPlays(options.loop);
    this.#includeDefault = options.includeDefaultImage ?? true;
    this.#trimRect = options.trimRect ?? fullRect(options.width, options.height);
    this.#width = this.#trimRect.width;
    this.#height = this.#trimRect.height;
    this.#palette = options.palette;
  }

  async setDefaultImage(rgba: Uint8ClampedArray): Promise<void> {
    this.#assertOpen();
    if (!this.#includeDefault) return;
    const cropped = cropRgba(rgba, this.#sourceWidth, this.#sourceHeight, this.#trimRect);
    this.#defaultImage = await compressPixels(cropped, this.#width, this.#height, this.#palette);
  }

  async addFrame(rgba: Uint8ClampedArray): Promise<void> {
    this.#assertOpen();
    const current = cropRgba(rgba, this.#sourceWidth, this.#sourceHeight, this.#trimRect);
    const changed = diffRect(this.#previous, current, this.#width, this.#height);
    this.#sourceFrames += 1;
    if (changed === undefined) {
      this.#frames[this.#frames.length - 1]!.delay += 1;
      return;
    }
    const pixels = extractRect(current, this.#width, changed);
    this.#frames.push({
      rect: changed,
      compressed: await compressPixels(pixels, changed.width, changed.height, this.#palette),
      delay: 1,
    });
    this.#previous = current;
  }

  finish(): ApngResult {
    this.#assertOpen();
    this.#finished = true;
    if (this.#frames.length === 0) throw new Error('At least one animation frame is required');
    if (this.#includeDefault && this.#defaultImage === undefined) throw new Error('Default image is required');

    const chunks: Uint8Array[] = [
      PNG_SIGNATURE,
      pngChunk('IHDR', makeIhdr(this.#width, this.#height, this.#palette !== undefined)),
      pngChunk('acTL', concatBytes([u32be(this.#frames.length), u32be(this.#numPlays)])),
    ];
    if (this.#palette !== undefined) chunks.push(...paletteChunks(this.#palette));

    let sequence = 0;
    if (this.#includeDefault) {
      chunks.push(pngChunk('IDAT', this.#defaultImage!));
      for (const frame of this.#frames) {
        chunks.push(pngChunk('fcTL', frameControl(sequence, frame, this.#fps)));
        sequence += 1;
        chunks.push(pngChunk('fdAT', concatBytes([u32be(sequence), frame.compressed])));
        sequence += 1;
      }
    } else {
      const first = this.#frames[0]!;
      chunks.push(pngChunk('fcTL', frameControl(sequence, first, this.#fps)));
      sequence += 1;
      chunks.push(pngChunk('IDAT', first.compressed));
      for (const frame of this.#frames.slice(1)) {
        chunks.push(pngChunk('fcTL', frameControl(sequence, frame, this.#fps)));
        sequence += 1;
        chunks.push(pngChunk('fdAT', concatBytes([u32be(sequence), frame.compressed])));
        sequence += 1;
      }
    }
    chunks.push(pngChunk('IEND'));
    return {
      bytes: concatBytes(chunks),
      sourceFrames: this.#sourceFrames,
      storedFrames: this.#frames.length,
      width: this.#width,
      height: this.#height,
    };
  }

  #assertOpen(): void {
    if (this.#finished) throw new Error('Encoder has already finished');
  }
}
