// Performance batch PM4 (M06-BUILD-DESIGN §9.1, §9.2; J11, YX-PERF-02, YX-PERF-21): the pure rules of review cycles.
// Eligibility from the cycle's rules and a person's dates; scoring from the manager's entry. Unit-tested in
// review-rules.spec.ts.

export type StageKey = 'self' | 'manager' | 'skip';
export const STAGE_ORDER: readonly StageKey[] = ['self', 'manager', 'skip'];
export type StageIn = { key: StageKey; dueOn: string; optional?: boolean };

export type EligibilityRules = {
  /** People who served fewer months than this in the period are left out (or reviewed on probation). */
  cutoffMonths: number;
  /** Leavers are closed without a rating unless the company opts in. */
  rateLeavers: boolean;
};
export const DEFAULT_RULES: EligibilityRules = { cutoffMonths: 3, rateLeavers: false };

export type EligibilityRule = 'included' | 'excluded_cutoff' | 'leaver' | 'protected_leave';
export type Eligibility = { rule: EligibilityRule; eligibleMonths: number; proration: number; reviewed: boolean };

/** Calendar months from the first day to the day after the last (1 Jul–31 Mar is 9), to one decimal. */
function months(fromIso: string, toIso: string) {
  const end = new Date(Date.parse(`${toIso}T00:00:00Z`) + 86_400_000);
  const [y, m, d] = fromIso.split('-').map(Number);
  const inMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const n = (end.getUTCFullYear() - y) * 12 + (end.getUTCMonth() + 1 - m) + (end.getUTCDate() - d) / inMonth;
  return Math.round(n * 10) / 10;
}

/** Stages in order, each once, deadlines in order and inside the review window; the manager stage is always there. */
export function stagesProblem(stages: readonly StageIn[], launchOn: string): string | null {
  if (!stages.some((s) => s.key === 'manager')) return 'A cycle needs the manager stage.';
  let last = -1;
  let due = launchOn;
  for (const s of stages) {
    const at = STAGE_ORDER.indexOf(s.key);
    if (at <= last) return 'Stages go self, manager, skip-level, each at most once.';
    if (s.dueOn < due) return `The ${s.key === 'skip' ? 'skip-level' : s.key} stage is due before the stage it follows, or before today.`;
    if (s.key === 'manager' && s.optional) return 'The manager stage cannot be optional.';
    last = at;
    due = s.dueOn;
  }
  return null;
}

/**
 * J11: who is reviewed in a cycle for the period from–to. Months served run from the later of joining and the period's
 * start to the earlier of leaving and its end. Protected leave (maternity, paternity) counts as served and is never a
 * reason to leave someone out or rate them down (YX-PERF-21): it is marked so the reviewers see it.
 */
export function eligibilityFor(p: { joinedOn: string; exitedOn: string | null; periodFrom: string; periodTo: string; today: string; protectedLeave: boolean }, rules: EligibilityRules): Eligibility | null {
  if (p.joinedOn > p.periodTo || (p.exitedOn !== null && p.exitedOn < p.periodFrom)) return null;
  const from = p.joinedOn > p.periodFrom ? p.joinedOn : p.periodFrom;
  const to = p.exitedOn !== null && p.exitedOn < p.periodTo ? p.exitedOn : p.periodTo;
  const total = months(p.periodFrom, p.periodTo);
  const served = Math.min(months(from, to), total);
  const proration = Math.round((served / total) * 10_000) / 10_000;
  if (p.exitedOn !== null && p.exitedOn <= p.today) return { rule: 'leaver', eligibleMonths: served, proration, reviewed: rules.rateLeavers };
  if (served < rules.cutoffMonths) return { rule: 'excluded_cutoff', eligibleMonths: served, proration, reviewed: false };
  return { rule: p.protectedLeave ? 'protected_leave' : 'included', eligibleMonths: served, proration, reviewed: true };
}

export type ScoreSection = { id: string; title: string; weight: number; rated: boolean; questionIds: string[] };
export type Answers = Record<string, { rating?: number | null; text?: string | null }>;

/**
 * §9.1 scoring. Weighted: each rated section scores the average of its question ratings; a section with no ratings is
 * excluded and named, never scored 0 (YX-PERF-02, U69), and the weights of the rest are scaled to 100. Manager-overall:
 * the overall rating is the score; section scores are guidance.
 */
export function scoreReview(scoring: 'weighted' | 'manager_overall', sections: readonly ScoreSection[], answers: Answers, overall: number | null): { sectionScores: Record<string, number>; excluded: string[]; finalScore: number | null } {
  const sectionScores: Record<string, number> = {};
  const excluded: string[] = [];
  for (const s of sections.filter((x) => x.rated)) {
    const r = s.questionIds.map((q) => answers[q]?.rating).filter((x): x is number => typeof x === 'number');
    if (r.length) sectionScores[s.id] = Math.round((r.reduce((a, b) => a + b, 0) / r.length) * 100) / 100;
    else excluded.push(s.title);
  }
  if (scoring === 'manager_overall') return { sectionScores, excluded, finalScore: overall };
  const scored = sections.filter((s) => s.rated && s.id in sectionScores && s.weight > 0);
  const weight = scored.reduce((t, s) => t + s.weight, 0);
  if (!weight) return { sectionScores, excluded, finalScore: null };
  const final = scored.reduce((t, s) => t + sectionScores[s.id] * s.weight, 0) / weight;
  return { sectionScores, excluded, finalScore: Math.round(final * 100) / 100 };
}
