function paeth(left: number, above: number, upperLeft: number): number {
  const estimate = left + above - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const aboveDistance = Math.abs(estimate - above);
  const diagonalDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= aboveDistance && leftDistance <= diagonalDistance) return left;
  return aboveDistance <= diagonalDistance ? above : upperLeft;
}

function signedMagnitude(value: number): number {
  return value < 128 ? value : 256 - value;
}

export function filterRgba(data: Uint8Array, width: number, height: number): Uint8Array {
  const stride = width * 4;
  if (data.length !== stride * height) throw new RangeError('RGBA buffer length does not match dimensions');
  const output = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * stride;
    let allZero = true;
    for (let x = 0; x < stride; x += 1) if (data[rowStart + x] !== 0) allZero = false;

    let bestType = 0;
    let bestScore = Number.POSITIVE_INFINITY;
    let bestRow = new Uint8Array(stride);
    const types = allZero ? [0] : [0, 1, 2, 3, 4];
    for (const type of types) {
      const candidate = new Uint8Array(stride);
      let score = 0;
      for (let x = 0; x < stride; x += 1) {
        const raw = data[rowStart + x]!;
        const left = x >= 4 ? data[rowStart + x - 4]! : 0;
        const above = y > 0 ? data[rowStart - stride + x]! : 0;
        const upperLeft = y > 0 && x >= 4 ? data[rowStart - stride + x - 4]! : 0;
        let prediction = 0;
        if (type === 1) prediction = left;
        else if (type === 2) prediction = above;
        else if (type === 3) prediction = Math.floor((left + above) / 2);
        else if (type === 4) prediction = paeth(left, above, upperLeft);
        const filtered = (raw - prediction + 256) & 0xff;
        candidate[x] = filtered;
        score += signedMagnitude(filtered);
      }
      if (score < bestScore) {
        bestScore = score;
        bestType = type;
        bestRow = candidate;
      }
    }
    const target = y * (stride + 1);
    output[target] = bestType;
    output.set(bestRow, target + 1);
  }
  return output;
}

export function filterIndexed(data: Uint8Array, width: number, height: number): Uint8Array {
  if (data.length !== width * height) throw new RangeError('Index buffer length does not match dimensions');
  const output = new Uint8Array((width + 1) * height);
  for (let y = 0; y < height; y += 1) output.set(data.subarray(y * width, (y + 1) * width), y * (width + 1) + 1);
  return output;
}
