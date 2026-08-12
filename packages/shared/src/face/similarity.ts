export type FaceVerdict = 'match' | 'uncertain' | 'mismatch';

export interface SimilarityThresholds {
  /** At or above this, the same person. */
  high: number;
  /** Below this, a different person. Between the two, we do not know. */
  low: number;
}

// PROVISIONAL. These are starting values, NOT calibrated ones. They are safe to ship only
// because stage 2 defaults every exam to `flag`, which records a verdict and acts on nothing.
// Stage 3 replaces them with values measured against a labelled fixture set of real captures,
// and enforcement beyond `flag` must not be enabled until it does.
export const PROVISIONAL_THRESHOLDS: SimilarityThresholds = { high: 0.6, low: 0.4 };

// How many mismatches in a row before anyone is told about one. Lives here, beside the
// thresholds, because BOTH tiers need it and they must not drift: the server uses it to decide
// when to record a face_mismatch event, the browser to decide when to show the candidate a hint.
// If the two disagreed, a candidate would see a warning at a different moment than the recruiter
// sees evidence for it -- or, worse, see one where no evidence was ever recorded.
export const CONSECUTIVE_MISMATCHES_TO_CONFIRM = 3;

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error(`Embedding length mismatch: ${a.length} vs ${b.length}`);
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  // A zero vector has no direction, so no meaningful similarity. Return 0, never NaN --
  // NaN compares false against both thresholds and would land in `uncertain` by accident.
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Three bands, not two. Forcing a binary decision on a marginal frame is where false
// accusations come from; the middle band records a score and does nothing.
export function classifySimilarity(
  score: number,
  thresholds: SimilarityThresholds = PROVISIONAL_THRESHOLDS,
): FaceVerdict {
  if (score >= thresholds.high) return 'match';
  if (score < thresholds.low) return 'mismatch';
  return 'uncertain';
}
