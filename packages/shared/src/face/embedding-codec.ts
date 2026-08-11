// Base64 of the raw float buffer. Chosen over JSON because this value is encrypted and stored
// on every enrolment: 512 floats are ~2.7KB here versus ~10KB as JSON text.
export function encodeEmbedding(vector: Float32Array): string {
  return Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength).toString('base64');
}

export function decodeEmbedding(encoded: string): Float32Array {
  // Validate that input is valid base64 before decoding
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) {
    throw new Error(`Corrupt embedding: invalid base64 characters`);
  }
  const buffer = Buffer.from(encoded, 'base64');
  if (buffer.length % 4 !== 0) {
    throw new Error(`Corrupt embedding: ${buffer.length} bytes is not a whole number of floats`);
  }
  // Copy rather than aliasing Buffer's pooled memory -- a view over the pool would be
  // corrupted by an unrelated later allocation.
  const copy = new ArrayBuffer(buffer.length);
  new Uint8Array(copy).set(buffer);
  return new Float32Array(copy);
}
