import { cosineSimilarity, classifySimilarity, PROVISIONAL_THRESHOLDS } from './similarity';

const vec = (...xs: number[]) => Float32Array.from(xs);

describe('cosineSimilarity', () => {
  it('is 1 for identical directions', () => {
    expect(cosineSimilarity(vec(1, 0, 0), vec(1, 0, 0))).toBeCloseTo(1, 6);
  });

  it('ignores magnitude — only direction matters', () => {
    expect(cosineSimilarity(vec(1, 2, 3), vec(10, 20, 30))).toBeCloseTo(1, 6);
  });

  it('is 0 for orthogonal vectors', () => {
    expect(cosineSimilarity(vec(1, 0), vec(0, 1))).toBeCloseTo(0, 6);
  });

  it('is -1 for opposite directions', () => {
    expect(cosineSimilarity(vec(1, 0), vec(-1, 0))).toBeCloseTo(-1, 6);
  });

  // A zero vector has no direction. Returning 0 rather than NaN matters because NaN would
  // silently compare FALSE against both thresholds and land in the uncertain band by accident,
  // which is the right outcome for the wrong reason and impossible to debug later.
  it('returns 0 rather than NaN when a vector is all zeros', () => {
    expect(cosineSimilarity(vec(0, 0), vec(1, 0))).toBe(0);
  });

  it('throws on mismatched lengths instead of comparing nonsense', () => {
    expect(() => cosineSimilarity(vec(1, 0), vec(1, 0, 0))).toThrow(/length/i);
  });
});

describe('classifySimilarity', () => {
  const t = { high: 0.6, low: 0.4 };

  it('calls a clearly high score a match', () => {
    expect(classifySimilarity(0.9, t)).toBe('match');
  });

  it('calls a clearly low score a mismatch', () => {
    expect(classifySimilarity(0.1, t)).toBe('mismatch');
  });

  // The uncertain band is the whole point: it absorbs bad lighting, a turned head, a candidate
  // mid-sip. Without it, every marginal frame becomes an accusation.
  it('calls anything between the thresholds uncertain', () => {
    expect(classifySimilarity(0.5, t)).toBe('uncertain');
  });

  it('treats the boundaries as inclusive on the safe side', () => {
    expect(classifySimilarity(0.6, t)).toBe('match');
    expect(classifySimilarity(0.4, t)).toBe('uncertain');
  });

  it('defaults to the provisional thresholds when none are given', () => {
    expect(classifySimilarity(0.99)).toBe('match');
    expect(classifySimilarity(-0.99)).toBe('mismatch');
  });

  it('exposes provisional thresholds with high strictly above low', () => {
    expect(PROVISIONAL_THRESHOLDS.high).toBeGreaterThan(PROVISIONAL_THRESHOLDS.low);
  });
});
