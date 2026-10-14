// Recruitment batch AT5 (M10-BUILD-DESIGN §8.3, rule YX-ATS-51, founder D7): pure scorecard rules.

export const RECOMMENDATIONS = ['strong_no', 'no', 'yes', 'strong_yes'] as const;
export type Recommendation = (typeof RECOMMENDATIONS)[number];

/** The weighted average of the ratings on the template's scale (2 decimals); null until every item is rated. */
export function weightedScore(items: { id: string; weight: number }[], ratings: { itemId: string; rating: number | null }[]): number | null {
  if (!items.length) return null;
  let sum = 0;
  let weights = 0;
  for (const it of items) {
    const r = ratings.find((x) => x.itemId === it.id)?.rating;
    if (r == null) return null;
    sum += r * it.weight;
    weights += it.weight;
  }
  return Math.round((sum / weights) * 100) / 100;
}

/** What is still missing before a scorecard can be submitted, in plain words; empty when complete. */
export function missingForSubmit(items: { id: string; label: string }[], ratings: { itemId: string; rating: number | null }[], recommendation: string | null | undefined, scaleMax: number): string[] {
  const out: string[] = [];
  for (const it of items) {
    const r = ratings.find((x) => x.itemId === it.id)?.rating;
    if (r == null) out.push(`Rate "${it.label}".`);
    else if (r < 1 || r > scaleMax) out.push(`"${it.label}" must be rated 1 to ${scaleMax}.`);
  }
  if (!recommendation || !RECOMMENDATIONS.includes(recommendation as Recommendation)) out.push('Choose an overall recommendation.');
  return out;
}

/**
 * D7: whose scorecards a viewer may read for one interview. A panellist reads their own, and the others' only after
 * submitting their own. Recruiters and the job's hiring manager read every submitted scorecard (never others' drafts).
 */
export function visibleScorecards<T extends { panelistUserId: string; status: string }>(cards: T[], viewer: { userId: string; isPanelist: boolean; isOverseer: boolean }): T[] {
  const own = cards.find((c) => c.panelistUserId === viewer.userId);
  const submittedOwn = own?.status === 'submitted';
  return cards.filter((c) => {
    if (c.panelistUserId === viewer.userId) return true;
    if (c.status !== 'submitted') return false;
    return viewer.isOverseer || (viewer.isPanelist && submittedOwn);
  });
}

/** The interview result once every panellist has submitted: the mean of their weighted scores against the bar. */
export function interviewResult(panelists: number, submitted: { weightedScore: number }[], passBar: number): { complete: boolean; submitted: number; expected: number; score: number | null; passes: boolean | null } {
  const complete = panelists > 0 && submitted.length >= panelists;
  if (!complete) return { complete, submitted: submitted.length, expected: panelists, score: null, passes: null };
  const score = Math.round((submitted.reduce((a, s) => a + s.weightedScore, 0) / submitted.length) * 100) / 100;
  return { complete, submitted: submitted.length, expected: panelists, score, passes: score >= passBar };
}
