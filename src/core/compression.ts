export function hasDeflateCompression(): boolean {
  return typeof CompressionStream !== 'undefined';
}

export async function deflateZlib(data: Uint8Array): Promise<Uint8Array> {
  if (!hasDeflateCompression()) {
    throw new Error('CompressionStream deflate support is required; use a current major browser');
  }
  const stream = new CompressionStream('deflate');
  const result = new Response(stream.readable).arrayBuffer();
  const writer = stream.writable.getWriter();
  await writer.write(Uint8Array.from(data));
  await writer.close();
  return new Uint8Array(await result);
}
