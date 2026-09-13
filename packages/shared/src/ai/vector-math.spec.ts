import { cosineSimilarity, topKSimilar } from './vector-math';
import { buildEmbeddingText, embeddingHash } from './embedding-text';

describe('cosineSimilarity', () => {
  it('is 1 for identical direction, 0 for orthogonal, -1 for opposite', () => {
    expect(cosineSimilarity([1, 0], [2, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1);
  });

  it('returns 0 on empty, mismatched-length, or zero vectors', () => {
    expect(cosineSimilarity([], [])).toBe(0);
    expect(cosineSimilarity([1, 2], [1])).toBe(0);
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
});

describe('topKSimilar', () => {
  const items = [
    { item: 'a', vector: [1, 0] },
    { item: 'b', vector: [0.9, 0.1] },
    { item: 'c', vector: [0, 1] },
  ];
  it('orders by similarity, highest first, limited to k', () => {
    const out = topKSimilar([1, 0], items, 2);
    expect(out.map((s) => s.item)).toEqual(['a', 'b']);
    expect(out[0].score).toBeGreaterThan(out[1].score);
  });
  it('skips items whose vector length differs from the query', () => {
    const out = topKSimilar([1, 0], [{ item: 'x', vector: [1, 0, 0] }, { item: 'y', vector: [1, 0] }], 5);
    expect(out.map((s) => s.item)).toEqual(['y']);
  });
});

describe('buildEmbeddingText / embeddingHash', () => {
  it('assembles title + summary + skills and is empty when nothing is present', () => {
    const text = buildEmbeddingText({ parsedTitle: 'Dev', parsedSummary: '5y Node', parsedSkills: '["Node","SQL"]' });
    expect(text).toContain('Title: Dev');
    expect(text).toContain('5y Node');
    expect(text).toContain('Skills: Node, SQL');
    expect(buildEmbeddingText({})).toBe('');
  });
  it('tolerates malformed skills JSON', () => {
    expect(buildEmbeddingText({ parsedSummary: 's', parsedSkills: 'not json' })).toBe('s');
  });
  it('hash changes with text or model', () => {
    expect(embeddingHash('a', 'm1')).toBe(embeddingHash('a', 'm1'));
    expect(embeddingHash('a', 'm1')).not.toBe(embeddingHash('b', 'm1'));
    expect(embeddingHash('a', 'm1')).not.toBe(embeddingHash('a', 'm2'));
  });
});
