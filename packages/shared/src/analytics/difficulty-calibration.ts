// Compares a question's DECLARED difficulty against how candidates actually performed (its
// proportion-correct, p). Pure + deterministic — the "AI" difficulty-calibration feature is really
// statistics: a p-value already tells you how hard an item is; this just names the mismatch.

export type DifficultyLabel = 'easy' | 'medium' | 'hard';
export type CalibrationVerdict = 'aligned' | 'easier_than_labeled' | 'harder_than_labeled';

// Observed band from proportion-correct. HIGH p == EASY item. Boundaries are deliberate, documented
// judgement calls: an item most people get right reads easy; one most people miss reads hard.
export const OBSERVED_EASY_MIN_P = 0.8; // p >= 0.8  -> observed easy
export const OBSERVED_HARD_MAX_P = 0.5; // p <= 0.5  -> observed hard ; between -> medium

const RANK: Record<DifficultyLabel, number> = { easy: 0, medium: 1, hard: 2 };

export function observedDifficulty(p: number): DifficultyLabel {
  if (p >= OBSERVED_EASY_MIN_P) return 'easy';
  if (p <= OBSERVED_HARD_MAX_P) return 'hard';
  return 'medium';
}

export interface CalibrationResult {
  observed: DifficultyLabel;
  verdict: CalibrationVerdict;
  // 0 = aligned, 1 = one band off (e.g. easy↔medium), 2 = two bands off (easy↔hard). For ranking.
  gap: number;
}

// `declared` is the author-set label; unknown values are treated as 'medium' so a bad label never
// throws (it just calibrates against the middle).
export function calibrateDifficulty(declared: string, p: number): CalibrationResult {
  const declaredRank = RANK[declared as DifficultyLabel] ?? RANK.medium;
  const observed = observedDifficulty(p);
  const delta = RANK[observed] - declaredRank; // observed harder than declared -> positive
  const verdict: CalibrationVerdict = delta === 0 ? 'aligned' : delta > 0 ? 'harder_than_labeled' : 'easier_than_labeled';
  return { observed, verdict, gap: Math.abs(delta) };
}
