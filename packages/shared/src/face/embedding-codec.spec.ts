import { encodeEmbedding, decodeEmbedding } from './embedding-codec';

describe('embedding codec', () => {
  it('round-trips a vector without losing precision that matters', () => {
    const original = Float32Array.from([0.1234567, -0.9876543, 0, 1, -1]);
    const restored = decodeEmbedding(encodeEmbedding(original));
    expect(restored.length).toBe(original.length);
    for (let i = 0; i < original.length; i += 1) {
      expect(restored[i]).toBeCloseTo(original[i], 6);
    }
  });

  it('produces a compact string, not JSON', () => {
    // 512 floats as JSON is ~10KB; base64 of the raw buffer is ~2.7KB. The column is encrypted
    // and sits on every attempt, so the difference is worth having.
    const encoded = encodeEmbedding(new Float32Array(512));
    expect(encoded.length).toBeLessThan(3000);
    expect(encoded.startsWith('[')).toBe(false);
  });

  it('rejects a corrupt string rather than returning a silently wrong vector', () => {
    expect(() => decodeEmbedding('not-base64-at-all!!')).toThrow();
  });

  it('round-trips an empty vector', () => {
    expect(decodeEmbedding(encodeEmbedding(new Float32Array(0))).length).toBe(0);
  });
});
