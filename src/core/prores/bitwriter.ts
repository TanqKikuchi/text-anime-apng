/** MSB-first bit writer with a growable byte buffer (reused across slices to avoid allocations). */
export class BitWriter {
  private buffer: Uint8Array;
  private byteLength = 0;
  private accumulator = 0;
  private pendingBits = 0;

  constructor(initialCapacity = 1 << 16) {
    this.buffer = new Uint8Array(Math.max(16, initialCapacity));
  }

  reset(): void {
    this.byteLength = 0;
    this.accumulator = 0;
    this.pendingBits = 0;
  }

  /** Number of bits written so far. */
  get bitLength(): number {
    return this.byteLength * 8 + this.pendingBits;
  }

  /** Bytes written so far (the writer must be byte aligned). */
  get alignedLength(): number {
    if (this.pendingBits !== 0) throw new Error('BitWriter is not byte aligned');
    return this.byteLength;
  }

  /** Writes the low `count` bits of `value` (count may be 0..32). */
  writeBits(value: number, count: number): void {
    while (count > 24) {
      count -= 24;
      this.writeSmall((value / 2 ** count) & 0xffffff, 24);
    }
    if (count > 0) this.writeSmall(value & ((1 << count) - 1), count);
  }

  writeBit(bit: number): void {
    this.writeSmall(bit & 1, 1);
  }

  writeZeros(count: number): void {
    while (count > 24) {
      this.writeSmall(0, 24);
      count -= 24;
    }
    if (count > 0) this.writeSmall(0, count);
  }

  /** Pads with zero bits up to the next byte boundary. */
  alignToByte(): void {
    if (this.pendingBits > 0) this.writeSmall(0, 8 - this.pendingBits);
  }

  /** Drops everything after `byteLength` bytes (must be byte aligned). */
  truncate(byteLength: number): void {
    if (this.pendingBits !== 0 || byteLength > this.byteLength) throw new Error('Invalid BitWriter truncate');
    this.byteLength = byteLength;
  }

  /** Overwrites an already written byte. */
  patchByte(offset: number, value: number): void {
    if (offset >= this.byteLength) throw new RangeError('patchByte offset out of range');
    this.buffer[offset] = value & 0xff;
  }

  /** Byte-aligned view of the written data (valid until the next write or reset). */
  bytes(): Uint8Array {
    if (this.pendingBits !== 0) throw new Error('BitWriter is not byte aligned');
    return this.buffer.subarray(0, this.byteLength);
  }

  private writeSmall(value: number, count: number): void {
    // pendingBits <= 7 and count <= 24, so the accumulator stays below 2^31.
    this.accumulator = (this.accumulator << count) | value;
    this.pendingBits += count;
    while (this.pendingBits >= 8) {
      this.pendingBits -= 8;
      if (this.byteLength === this.buffer.length) this.grow();
      this.buffer[this.byteLength++] = (this.accumulator >>> this.pendingBits) & 0xff;
    }
    this.accumulator &= (1 << this.pendingBits) - 1;
  }

  private grow(): void {
    const next = new Uint8Array(this.buffer.length * 2);
    next.set(this.buffer);
    this.buffer = next;
  }
}
