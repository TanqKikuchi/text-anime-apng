/** Progressive block scan pattern (RDD 36 Figure 4): PROGRESSIVE_SCAN[v * 8 + u] = scan[v][u]. */
export const PROGRESSIVE_SCAN: readonly number[] = [
  0, 1, 4, 5, 16, 17, 21, 22,
  2, 3, 6, 7, 18, 20, 23, 28,
  8, 9, 12, 13, 19, 24, 27, 29,
  10, 11, 14, 15, 25, 26, 30, 31,
  32, 33, 37, 38, 45, 46, 53, 54,
  34, 36, 39, 44, 47, 52, 55, 60,
  35, 40, 43, 48, 51, 56, 59, 61,
  41, 42, 49, 50, 57, 58, 62, 63,
];

/** qScale for a quantization_index (Table 15). */
export function qScaleForIndex(quantizationIndex: number): number {
  if (!Number.isInteger(quantizationIndex) || quantizationIndex < 1 || quantizationIndex > 224) {
    throw new RangeError(`quantization_index must be 1..224, got ${quantizationIndex}`);
  }
  return quantizationIndex <= 128 ? quantizationIndex : 128 + 4 * (quantizationIndex - 128);
}

/**
 * Slice sizes (in macroblocks) of one macroblock row (§6.2 slice_size_in_mb):
 * desired-size slices from the left, then the next-largest permissible sizes.
 */
export function sliceSizesInMb(widthInMb: number, log2DesiredSliceSizeInMb: number): number[] {
  const sizes: number[] = [];
  let sliceSize = 1 << log2DesiredSliceSizeInMb;
  let remaining = widthInMb;
  do {
    while (remaining >= sliceSize) {
      sizes.push(sliceSize);
      remaining -= sliceSize;
    }
    sliceSize >>= 1;
  } while (remaining > 0);
  return sizes;
}

/** frame_rate_code (Table 4) for integral frame rates; 0 = unknown/unspecified. */
export function frameRateCode(fps: number): number {
  const codes: Record<number, number> = { 24: 2, 25: 3, 30: 5, 50: 6, 60: 8, 100: 9, 120: 11 };
  return codes[fps] ?? 0;
}
