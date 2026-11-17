// Assessments AS-6 (answer 2019): pass rates per group from voluntary answers only, hidden below the company's least
// group size, and the four-fifths rule: a group whose pass rate is under 0.8 of the best-shown group's is a finding.
// Pure, so it is tested; the counts come from the API.

export interface GroupCount {
  group: string;
  attempts: number;
  passed: number;
}

export interface ImpactRow {
  group: string;
  /** null when hidden (fewer answers than the least group size). */
  attempts: number | null;
  rate: number | null;
  ratio: number | null;
  status: 'ok' | 'watch' | 'flagged' | 'hidden';
}

export function impactRows(groups: GroupCount[], minGroup: number): { rows: ImpactRow[]; finding: { group: string; ratio: number } | null } {
  const shown = groups.filter((g) => g.attempts >= minGroup && g.attempts > 0);
  const best = Math.max(0, ...shown.map((g) => g.passed / g.attempts));
  const rows: ImpactRow[] = groups.map((g) => {
    if (g.attempts < minGroup || g.attempts === 0) return { group: g.group, attempts: null, rate: null, ratio: null, status: 'hidden' };
    const rate = g.passed / g.attempts;
    const ratio = best > 0 ? rate / best : 1;
    return { group: g.group, attempts: g.attempts, rate, ratio, status: ratio < 0.8 ? 'flagged' : ratio < 0.9 ? 'watch' : 'ok' };
  });
  // A finding needs two groups to compare.
  const flagged = shown.length >= 2 ? rows.filter((r) => r.status === 'flagged').sort((a, b) => (a.ratio ?? 1) - (b.ratio ?? 1))[0] : undefined;
  return { rows, finding: flagged ? { group: flagged.group, ratio: flagged.ratio! } : null };
}

/** Answer 2165: the after-test survey, only for 5 or more answers. */
export function surveySummary(rows: { rating: number; clearInstructions: boolean | null }[]): { responses: number; averageRating: number; clearPercent: number | null } | null {
  if (rows.length < 5) return null;
  const clear = rows.filter((r) => r.clearInstructions !== null);
  return {
    responses: rows.length,
    averageRating: Math.round((rows.reduce((n, r) => n + r.rating, 0) / rows.length) * 10) / 10,
    // A share only from 5 or more answers to that question, as the survey promises.
    clearPercent: clear.length >= 5 ? Math.round((clear.filter((r) => r.clearInstructions).length / clear.length) * 100) : null,
  };
}
