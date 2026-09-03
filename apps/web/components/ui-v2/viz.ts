// Single source for data-viz colours. Concrete hex on purpose: recharts can't resolve CSS vars in
// SVG fill/stroke, and our HTML-based viz reads these same values inline — so one JS module keeps
// charts and tiles in sync. Kept separate from --org-primary, which is reserved for interactive
// chrome (nav / CTA / focus) and must not compete with data colour.
export const VIZ = {
  azure: '#3b5fe3',
  teal: '#0d9488',
  violet: '#7c3aed',
  amber: '#d97706',
  rose: '#e11d48',
  yellow: '#eab308',
  green: '#15803d',
} as const;

// Distinct hues for categorical tiles (KPI badges, etc.).
export const VIZ_CATEGORICAL = [VIZ.azure, VIZ.teal, VIZ.violet, VIZ.amber] as const;

// Graded low → high scale for score distributions.
export const SCORE_SCALE = [VIZ.rose, VIZ.amber, VIZ.yellow, VIZ.teal, VIZ.green] as const;

// Funnel progression, Invited → Passed (success green at the end).
export const FUNNEL_SCALE = [VIZ.azure, VIZ.teal, VIZ.violet, VIZ.green] as const;

// Semantic status (integrity clear/review/concern, pass/fail).
export const STATUS = { ok: VIZ.green, warn: '#a16207', bad: '#b91c1c' } as const;

// Grade a value's position across the score scale, whatever the bucket count.
export function scoreColor(index: number, total: number): string {
  if (total <= 1) return SCORE_SCALE[SCORE_SCALE.length - 1];
  const pos = index / (total - 1);
  return SCORE_SCALE[Math.min(SCORE_SCALE.length - 1, Math.round(pos * (SCORE_SCALE.length - 1)))];
}

// Threshold colour for a rate against a target (e.g. pass rate vs a goal).
export function rateColor(value: number, target = 70): string {
  if (value >= target) return VIZ.green;
  if (value >= target * 0.7) return VIZ.amber;
  return STATUS.bad;
}
