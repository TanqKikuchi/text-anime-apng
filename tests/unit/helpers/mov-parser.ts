/** Test-only QuickTime box walker. */
export interface MovBox {
  readonly type: string;
  readonly offset: number;
  readonly size: number;
  readonly headerSize: number;
  readonly children: MovBox[];
}

const CONTAINERS = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'dinf', 'edts']);

export function parseBoxes(bytes: Uint8Array, start = 0, end = bytes.length): MovBox[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const boxes: MovBox[] = [];
  let offset = start;
  while (offset < end) {
    let size = view.getUint32(offset);
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    let headerSize = 8;
    if (size === 1) {
      size = view.getUint32(offset + 8) * 2 ** 32 + view.getUint32(offset + 12);
      headerSize = 16;
    }
    if (size < headerSize || offset + size > end) throw new Error(`bad box ${type} at ${offset} (size ${size})`);
    const children = CONTAINERS.has(type) ? parseBoxes(bytes, offset + headerSize, offset + size) : [];
    boxes.push({ type, offset, size, headerSize, children });
    offset += size;
  }
  return boxes;
}

export function findBox(boxes: readonly MovBox[], path: string): MovBox {
  const [head, ...rest] = path.split('/');
  const box = boxes.find((candidate) => candidate.type === head);
  if (!box) throw new Error(`box ${head} not found`);
  return rest.length === 0 ? box : findBox(box.children, rest.join('/'));
}

export function payload(bytes: Uint8Array, box: MovBox): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset + box.offset + box.headerSize, box.size - box.headerSize);
}
