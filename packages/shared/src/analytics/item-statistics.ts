// Below this many scored responses, no statistic is computed or shown. A p-value from five
// candidates renders identically to one from ninety, and acting on it means retiring a
// perfectly good question -- the precise failure this feature exists to prevent.
export const MIN_RESPONSES = 20;

const WEAK_DISCRIMINATION = 0.2;
const TOO_EASY_P = 0.95;
const VERY_HARD_P = 0.2;

export interface ItemAggregate {
  questionId: string;
  n: number;
  /** Proportion answering correctly. HIGH p means an EASY item. */
  p: number;
  /** Mean rest-score of candidates who answered correctly. Null when nobody did. */
  m1: number | null;
  /** Mean rest-score of candidates who answered incorrectly. Null when nobody did. */
  m0: number | null;
  /** Population SD of rest-scores across all responders. */
  sdRest: number;
}

export interface OptionCount {
  optionId: string;
  isCorrect: boolean;
  selections: number;
}

export type FlagSeverity = 'critical' | 'warning' | 'info';

export interface ItemFlag {
  code: string;
  severity: FlagSeverity;
  message: string;
}

// Corrected point-biserial correlation between answering this item correctly and performing
// well on the REST of the exam.
//
// The rest-score correction happens upstream in the SQL (score minus this item's marks). It
// matters: correlating an item against a total that contains it inflates every item's apparent
// quality, because the item is partly correlated with itself. At 20-40 items that inflation is
// not negligible, and it hides exactly the weak items this exists to find.
export function pointBiserial(agg: ItemAggregate): number | null {
  const { p, m1, m0, sdRest } = agg;
  // Undefined rather than zero. Everyone-correct and everyone-wrong items carry no
  // discrimination information at all; reporting 0 would file them under "weak
  // discrimination", implying we measured something. They are already flagged on p alone.
  //
  // Number.isFinite (not a bare comparison) is load-bearing here: every comparison against
  // NaN is false, so `p <= 0` and friends silently let a NaN input (e.g. Number(undefined)
  // from a mismapped SQL column) flow through as a real correlation. A negative sdRest is
  // likewise invalid -- a standard deviation can't be negative -- and would flip the sign of
  // the result, so it's rejected the same way rather than only checking `=== 0`.
  if (!Number.isFinite(p) || p <= 0 || p >= 1) return null;
  if (!Number.isFinite(sdRest) || sdRest <= 0) return null;
  if (m1 === null || m0 === null || !Number.isFinite(m1) || !Number.isFinite(m0)) return null;
  return ((m1 - m0) / sdRest) * Math.sqrt(p * (1 - p));
}

export function classifyFlags(
  agg: ItemAggregate,
  discrimination: number | null,
  options: OptionCount[],
): ItemFlag[] {
  const flags: ItemFlag[] = [];

  if (discrimination !== null && discrimination < 0) {
    flags.push({
      code: 'miskeyed_suspect',
      severity: 'critical',
      message: 'Stronger candidates answered this correctly less often than weaker ones, which usually means the answer key is wrong.',
    });
  } else if (discrimination !== null && discrimination < WEAK_DISCRIMINATION) {
    flags.push({
      code: 'weak_discrimination',
      severity: 'warning',
      message: 'This question barely separates stronger candidates from weaker ones.',
    });
  }

  if (agg.p > TOO_EASY_P) {
    flags.push({ code: 'too_easy', severity: 'info', message: 'Almost every candidate answers this correctly, so it carries little information.' });
  }
  if (agg.p < VERY_HARD_P) {
    flags.push({ code: 'very_hard', severity: 'info', message: 'Very few candidates answer this correctly. It may be genuinely hard, or unclear.' });
  }

  const correct = options.find((o) => o.isCorrect);
  const distractors = options.filter((o) => !o.isCorrect);

  if (correct && distractors.some((d) => d.selections > correct.selections)) {
    flags.push({
      code: 'ambiguous_option',
      severity: 'warning',
      message: 'A wrong option was chosen more often than the correct one, suggesting it is misleading or also defensible.',
    });
  }
  // Only distractors can be dead. A correct option nobody picked is already covered by p.
  if (distractors.some((d) => d.selections === 0)) {
    flags.push({ code: 'dead_distractor', severity: 'info', message: 'One option was never chosen, so this question effectively offers fewer choices.' });
  }

  return flags;
}
