// Pure rules for Performance (M06), Learning (M07) and Engage (M09) screens. Tested in growth.test.tsx.
// Each function cites the rule it implements so screens and tests stay in step with the design docs.

/* ================================================================== Performance (M06) */

export interface KeyResult {
  id: string;
  title: string;
  start: number;
  target: number;
  actual: number;
  unit: string;
  /** Default increase. "decrease" for targets like "cut defects from 40 to 10". */
  direction?: 'increase' | 'decrease';
}

export type GoalOwnerType = 'person' | 'team' | 'company';
export type GoalConfidence = 'On track' | 'At risk' | 'Off track';

export interface Goal {
  id: string;
  title: string;
  type: 'okr' | 'kpi';
  owner: { type: GoalOwnerType; name: string };
  /** Parent may be owned by anyone (YX-PERF-01, U70). */
  parentId?: string;
  weight: number;
  period: string;
  status: 'Draft' | 'Pending approval' | 'Approved' | 'Closed';
  keyResults: KeyResult[];
  confidence?: GoalConfidence;
  lastCheckIn?: Date;
}

/** One key result's progress 0–100, from start → target (handles "decrease" targets). */
export function krProgress(kr: KeyResult): number {
  const span = kr.target - kr.start;
  if (span === 0) return kr.actual === kr.target ? 100 : 0;
  const raw = ((kr.actual - kr.start) / span) * 100;
  return Math.round(Math.max(0, Math.min(100, raw)));
}

/**
 * YX-PERF-01: progress comes from key results (average), or from children's weighted progress.
 * It is never typed when key results exist. Returns null when there is nothing to measure yet.
 */
export function goalProgress(goal: Goal, all: Goal[] = []): number | null {
  if (goal.keyResults.length > 0) {
    return Math.round(goal.keyResults.reduce((a, kr) => a + krProgress(kr), 0) / goal.keyResults.length);
  }
  const children = all.filter((g) => g.parentId === goal.id);
  const measured = children.map((c) => ({ w: c.weight, p: goalProgress(c, all) })).filter((c): c is { w: number; p: number } => c.p != null);
  const weight = measured.reduce((a, c) => a + c.w, 0);
  if (measured.length === 0 || weight === 0) return null;
  return Math.round(measured.reduce((a, c) => a + c.w * c.p, 0) / weight);
}

/** Goal weights for one person must add up to 100 before the manager can approve them. */
export function weightCheck(goals: Pick<Goal, 'weight'>[]): { total: number; ok: boolean; message: string | null } {
  const total = goals.reduce((a, g) => a + g.weight, 0);
  if (total === 100) return { total, ok: true, message: null };
  return { total, ok: false, message: total < 100 ? `Weights add up to ${total}%. Add ${100 - total}% to reach 100%.` : `Weights add up to ${total}%. Remove ${total - 100}% to reach 100%.` };
}

export interface ReviewSection {
  id: string;
  title: string;
  /** Percent of the final score. */
  weight: number;
  /** 1–5, or null while the section is not complete. */
  score: number | null;
  /** Goals section with no goals is excluded with a warning (YX-PERF-02). */
  empty?: boolean;
}

/**
 * YX-PERF-02: only completed sections count, weights re-normalised; missing inputs are "pending", never 0;
 * a section without goals is excluded with a warning.
 */
export function reviewScore(sections: ReviewSection[]): { score: number | null; pending: string[]; excluded: string[] } {
  const excluded = sections.filter((s) => s.empty).map((s) => s.title);
  const live = sections.filter((s) => !s.empty);
  const pending = live.filter((s) => s.score == null).map((s) => s.title);
  const done = live.filter((s): s is ReviewSection & { score: number } => s.score != null);
  const w = done.reduce((a, s) => a + s.weight, 0);
  if (done.length === 0 || w === 0) return { score: null, pending, excluded };
  return { score: Math.round((done.reduce((a, s) => a + s.weight * s.score, 0) / w) * 100) / 100, pending, excluded };
}

/** M06 Q3 default 1–5 scale labels. */
export const RATING_LABELS = ['Needs improvement', 'Partly meets', 'Meets', 'Exceeds', 'Outstanding'] as const;
export type Band = (typeof RATING_LABELS)[number];

/** YX-PERF-07: final score → band label, always shown with the score. */
export function bandFor(score: number): Band {
  if (score < 1.5) return 'Needs improvement';
  if (score < 2.5) return 'Partly meets';
  if (score < 3.5) return 'Meets';
  if (score < 4.5) return 'Exceeds';
  return 'Outstanding';
}

export type Relationship = 'Manager' | 'Peer' | 'Direct report' | 'Other';

/**
 * YX-PERF-05: anonymous feedback shows only when a relationship group has at least `min` (3) responses.
 * Smaller anonymous groups merge into "Others"; if "Others" is still too small it is held back. Named groups always show.
 */
export function anonymityGroups(
  responses: { relationship: Relationship; anonymous: boolean }[],
  min = 3,
): { shown: { group: string; count: number }[]; heldBack: number } {
  const counts = new Map<string, { n: number; anon: boolean }>();
  for (const r of responses) {
    const c = counts.get(r.relationship) ?? { n: 0, anon: r.anonymous };
    counts.set(r.relationship, { n: c.n + 1, anon: c.anon && r.anonymous });
  }
  const shown: { group: string; count: number }[] = [];
  let others = 0;
  for (const [group, c] of counts) {
    if (!c.anon || c.n >= min) shown.push({ group, count: c.n });
    else others += c.n;
  }
  if (others >= min) {
    shown.push({ group: 'Others', count: others });
    return { shown, heldBack: 0 };
  }
  return { shown, heldBack: others };
}

/** Q4: nominations must stay between the cycle's min and max. */
export function nominationCheck(count: number, min: number, max: number): string | null {
  if (count < min) return `Nominate at least ${min} reviewers. You have ${count}.`;
  if (count > max) return `Nominate at most ${max} reviewers. Remove ${count - max}.`;
  return null;
}

/** Comp matrix (Q6): band × compa-ratio position → suggested increment % range. */
export type CompaBucket = 'Below 0.9' | '0.9–1.1' | 'Above 1.1';
export const COMP_MATRIX: Record<Band, Record<CompaBucket, [number, number]>> = {
  'Needs improvement': { 'Below 0.9': [0, 2], '0.9–1.1': [0, 0], 'Above 1.1': [0, 0] },
  'Partly meets': { 'Below 0.9': [3, 5], '0.9–1.1': [2, 4], 'Above 1.1': [0, 2] },
  Meets: { 'Below 0.9': [7, 9], '0.9–1.1': [5, 7], 'Above 1.1': [3, 5] },
  Exceeds: { 'Below 0.9': [10, 14], '0.9–1.1': [8, 11], 'Above 1.1': [6, 8] },
  Outstanding: { 'Below 0.9': [14, 18], '0.9–1.1': [12, 15], 'Above 1.1': [9, 12] },
};

export function compaBucket(ratio: number): CompaBucket {
  return ratio < 0.9 ? 'Below 0.9' : ratio <= 1.1 ? '0.9–1.1' : 'Above 1.1';
}

/** YX-PERF-10: suggested range from the matrix; outside it needs a justification and an extra approval. */
export function checkProposal(band: Band, compaRatio: number, proposedPct: number): { range: [number, number]; within: boolean; needsJustification: boolean } {
  const range = COMP_MATRIX[band][compaBucket(compaRatio)];
  const within = proposedPct >= range[0] && proposedPct <= range[1];
  return { range, within, needsJustification: !within };
}

/** Department budget: used = Σ approved increment cost annualised; remaining = budget − used. */
export function budgetUse(budget: number, proposals: { annualCost: number }[]): { used: number; remaining: number; pct: number; over: boolean } {
  const used = proposals.reduce((a, p) => a + p.annualCost, 0);
  return { used, remaining: budget - used, pct: budget > 0 ? Math.round((used / budget) * 100) : 0, over: used > budget };
}

/**
 * YX-PERF-21 (J11) starter rules. Months are whole calendar months; cycle given by start (inclusive) and end (inclusive month).
 * Joined within `cutoffMonths` of the cycle end → excluded. Protected leave counts as served.
 */
export function eligibility(opts: {
  cycleStart: Date;
  cycleEnd: Date;
  joined: Date;
  cutoffMonths?: number;
  protectedLeave?: boolean;
  left?: boolean;
}): { rule: 'Included' | 'Excluded (joined after cut-off)' | 'Prorated (mid-cycle joiner)' | 'Protected leave' | 'Leaver'; eligibleMonths: number; factor: number } {
  const cutoff = opts.cutoffMonths ?? 3;
  const monthIdx = (d: Date) => d.getFullYear() * 12 + d.getMonth();
  const cycleMonths = monthIdx(opts.cycleEnd) - monthIdx(opts.cycleStart) + 1;
  if (opts.left) return { rule: 'Leaver', eligibleMonths: 0, factor: 0 };
  const startIdx = Math.max(monthIdx(opts.joined), monthIdx(opts.cycleStart));
  const served = monthIdx(opts.cycleEnd) - startIdx + 1;
  if (served <= cutoff && monthIdx(opts.joined) > monthIdx(opts.cycleStart)) return { rule: 'Excluded (joined after cut-off)', eligibleMonths: 0, factor: 0 };
  if (opts.protectedLeave) return { rule: 'Protected leave', eligibleMonths: cycleMonths, factor: 1 };
  if (served < cycleMonths) return { rule: 'Prorated (mid-cycle joiner)', eligibleMonths: served, factor: Math.round((served / cycleMonths) * 100) / 100 };
  return { rule: 'Included', eligibleMonths: cycleMonths, factor: 1 };
}

/** 9-box (Q5, wave 6): performance and potential each 1 (low) – 3 (high). */
export const NINE_BOX_LABELS: Record<string, string> = {
  '3-3': 'Future leader',
  '3-2': 'High performer',
  '3-1': 'Trusted professional',
  '2-3': 'Growth talent',
  '2-2': 'Core player',
  '2-1': 'Effective',
  '1-3': 'Rough diamond',
  '1-2': 'Inconsistent',
  '1-1': 'Under-performer',
};
export const nineBoxLabel = (performance: number, potential: number) => NINE_BOX_LABELS[`${performance}-${potential}`];

/** Calibration distribution vs the guide (guidance only in wave 5; no forced curve). */
export function distribution(ratings: number[]): number[] {
  const counts = [0, 0, 0, 0, 0];
  for (const r of ratings) counts[Math.min(5, Math.max(1, Math.round(r))) - 1] += 1;
  const n = ratings.length || 1;
  return counts.map((c) => Math.round((c / n) * 100));
}

/** PIP (Q7): 30 / 60 / 90 days with check-ins every `everyDays` days. */
export function pipSchedule(start: Date, days: 30 | 60 | 90, everyDays = 14): { end: Date; checkIns: Date[] } {
  const add = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const checkIns: Date[] = [];
  for (let n = everyDays; n < days; n += everyDays) checkIns.push(add(start, n));
  const end = add(start, days);
  checkIns.push(end);
  return { end, checkIns };
}

/** YX-PERF-15: gap = required − current per competency; missing rating is "not assessed", never 0. */
export function skillGap(required: number, current: number | null): { gap: number | null; label: string } {
  if (current == null) return { gap: null, label: 'Not assessed' };
  const gap = required - current;
  return { gap, label: gap > 0 ? `${gap} level${gap > 1 ? 's' : ''} below` : gap === 0 ? 'Meets' : 'Above' };
}

/* ------------------------------------------------ PRF-17 bias check (P23 YX-AST-11) */

export type BiasKind = 'Gendered or loaded word' | 'Personality, not behaviour' | 'Age reference' | 'Vague, no example' | 'Rating and text disagree';

export interface BiasFlag {
  id: string;
  kind: BiasKind;
  /** The words flagged, exactly as written. */
  match: string;
  suggestion: string;
}

const LOADED = ['abrasive', 'emotional', 'bossy', 'shrill', 'aggressive', 'hysterical'];
const PERSONALITY = ['attitude', 'personality', 'not a team player', 'difficult person'];
const AGE = ['young', 'old-school', 'too old', 'digital native'];
const VAGUE = ['good job', 'great work', 'needs to improve', 'did well'];
const MISSES = ['missed', 'late', 'delayed', 'did not'];

/** Rule-based stand-in for the review assistant's suggestions. Suggestions only: the manager's text and rating stay final. */
export function detectBiasFlags(text: string, rating: number | null): BiasFlag[] {
  const t = text.toLowerCase();
  const flags: BiasFlag[] = [];
  const find = (words: string[], kind: BiasKind, suggestion: (w: string) => string) => {
    for (const w of words) {
      const i = t.indexOf(w);
      if (i >= 0) flags.push({ id: `${kind}-${w}`, kind, match: text.slice(i, i + w.length), suggestion: suggestion(w) });
    }
  };
  find(LOADED, 'Gendered or loaded word', (w) => `Describe what happened instead of "${w}", e.g. the meeting and its effect.`);
  find(PERSONALITY, 'Personality, not behaviour', () => 'Name the behaviour and its result, not the person’s character.');
  find(AGE, 'Age reference', () => 'Remove the age reference; describe skills or results.');
  find(VAGUE, 'Vague, no example', () => 'Add one example with a date or result.');
  const misses = MISSES.filter((w) => t.includes(w)).length;
  if (rating != null && rating >= 4 && misses >= 2) {
    flags.push({ id: 'inconsistent', kind: 'Rating and text disagree', match: `Rating ${rating} with ${misses} misses listed`, suggestion: 'Add the results that support this rating, or review the rating.' });
  }
  return flags;
}

/* ================================================================== Learning (M07) */

export type EnrolmentStatus = 'Requested' | 'Approved' | 'Enrolled' | 'Waitlisted' | 'In progress' | 'Completed' | 'Failed' | 'No-show' | 'Withdrawn' | 'Declined';

/**
 * YX-LRN-01: completion needs attendance ≥ threshold (sessions), all required items (self-paced),
 * and a pass score when an assessment is attached. An absent attendee is never completed.
 */
export function completionStatus(e: {
  kind: 'session' | 'self-paced';
  attendedSlots?: number;
  totalSlots?: number;
  threshold?: number;
  requiredDone?: number;
  requiredTotal?: number;
  passScore?: number;
  score?: number | null;
}): { status: EnrolmentStatus; reason: string } {
  if (e.kind === 'session') {
    const total = e.totalSlots ?? 0;
    const attended = e.attendedSlots ?? 0;
    if (attended === 0) return { status: 'No-show', reason: 'Did not attend any slot' };
    const pct = total ? attended / total : 0;
    const need = e.threshold ?? 0.75;
    if (pct < need) return { status: 'Failed', reason: `Attended ${attended} of ${total} slots; needs ${Math.round(need * 100)}%` };
  } else {
    const done = e.requiredDone ?? 0;
    const tot = e.requiredTotal ?? 0;
    if (done < tot) return { status: 'In progress', reason: `${done} of ${tot} required items done` };
  }
  if (e.passScore != null) {
    if (e.score == null) return { status: 'In progress', reason: 'Assessment not taken yet' };
    if (e.score < e.passScore) return { status: 'Failed', reason: `Scored ${e.score}%; pass mark ${e.passScore}%` };
  }
  return { status: 'Completed', reason: 'All criteria met' };
}

/** YX-LRN-06: seat limit with a first-come waitlist. */
export function enrol(session: { seats: number; enrolled: string[]; waitlist: string[] }, person: string) {
  if (session.enrolled.includes(person) || session.waitlist.includes(person)) return { ...session, result: 'Already enrolled' as const };
  if (session.enrolled.length < session.seats) return { ...session, enrolled: [...session.enrolled, person], result: 'Enrolled' as const };
  return { ...session, waitlist: [...session.waitlist, person], result: 'Waitlisted' as const, position: session.waitlist.length + 1 };
}

/** YX-LRN-06: a withdrawal promotes the first waitlisted person (who is then notified). */
export function withdraw(session: { seats: number; enrolled: string[]; waitlist: string[] }, person: string) {
  const enrolled = session.enrolled.filter((p) => p !== person);
  const waitlist = session.waitlist.filter((p) => p !== person);
  let promoted: string | null = null;
  if (enrolled.length < session.seats && waitlist.length > 0) {
    promoted = waitlist[0];
    enrolled.push(promoted);
    waitlist.shift();
  }
  return { seats: session.seats, enrolled, waitlist, promoted };
}

/** YX-LRN-07 / Q5: cost against the department budget per FY; warn by default, block when set. */
export function budgetCheck(cost: number, budget: { planned: number; spent: number; committed: number }, mode: 'warn' | 'block' = 'warn') {
  const remaining = budget.planned - budget.spent - budget.committed;
  const after = remaining - cost;
  if (after >= 0) return { level: 'ok' as const, remaining, after, message: null };
  return {
    level: mode === 'block' ? ('block' as const) : ('warn' as const),
    remaining,
    after,
    message: mode === 'block' ? 'This request is over the department’s training budget. Ask L&D to raise the budget or pick a cheaper option.' : 'This request goes over the department’s training budget. The approver will see this.',
  };
}

/** YX-LRN-05: renewal enrolment N days before expiry (default 30). */
export function renewalDate(expires: Date, daysBefore = 30): Date {
  return new Date(expires.getFullYear(), expires.getMonth(), expires.getDate() - daysBefore);
}

/** Compliance dashboard cell: % complete, status words for the cell (never colour only). */
export function complianceCell(done: number, assigned: number): { pct: number | null; status: 'Compliant' | 'At risk' | 'Non-compliant' | 'Not assigned' } {
  if (assigned === 0) return { pct: null, status: 'Not assigned' };
  const pct = Math.round((done / assigned) * 100);
  return { pct, status: pct >= 95 ? 'Compliant' : pct >= 80 ? 'At risk' : 'Non-compliant' };
}

/** Rotating QR token for trainer attendance (Q7): changes every 30 s so screenshots of it expire. */
export function qrToken(sessionId: string, slot: number, tick: number): string {
  let h = 2166136261;
  for (const c of `${sessionId}:${slot}:${tick}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h.toString(36).toUpperCase().padStart(7, '0').slice(0, 7);
}

/* ================================================================== Engage (M09) */

/** YX-ENG-05: eNPS = % promoters (9–10) − % detractors (0–6); hidden below the minimum group size. */
export function enps(scores: number[], min = 5): { score: number | null; promoters: number; passives: number; detractors: number; n: number; suppressed: boolean } {
  const n = scores.length;
  const promoters = scores.filter((s) => s >= 9).length;
  const detractors = scores.filter((s) => s <= 6).length;
  const passives = n - promoters - detractors;
  if (n < min) return { score: null, promoters, passives, detractors, n, suppressed: true };
  return { score: Math.round(((promoters - detractors) / n) * 100), promoters, passives, detractors, n, suppressed: false };
}

/** YX-ENG-04: a filter that would narrow the group below the minimum is disabled. */
export function canSlice(groupSize: number, min = 5): boolean {
  return groupSize >= min;
}

export interface KudosInput {
  giver: string;
  receivers: string[];
  value: string | null;
  points: number;
  /** Giver's manager chain (names). */
  managerChain: string[];
  /** Points the giver has left this month. */
  allowance: number;
  approvalThreshold: number;
  managerChainLimit: number;
}

/** YX-ENG-06: value required; no self points; manager-chain limit; approval above threshold. */
export function validateKudos(k: KudosInput): { errors: string[]; needsApproval: boolean; totalPoints: number } {
  const errors: string[] = [];
  const totalPoints = k.points * k.receivers.length;
  if (k.receivers.length === 0) errors.push('Choose at least one person to thank.');
  if (!k.value) errors.push('Pick a company value for this kudos.');
  if (k.points > 0 && k.receivers.includes(k.giver)) errors.push('You can’t give points to yourself. Remove yourself from the list.');
  if (k.points > k.managerChainLimit && k.receivers.some((r) => k.managerChain.includes(r))) errors.push(`Points to your manager chain are limited to ${k.managerChainLimit} each.`);
  if (totalPoints > k.allowance) errors.push(`You have ${k.allowance} points left this month. Lower the points to ${Math.floor(k.allowance / Math.max(1, k.receivers.length))} each.`);
  return { errors, needsApproval: errors.length === 0 && k.points > k.approvalThreshold, totalPoints };
}

/** YX-ENG-07: cash or voucher redemptions above the gift threshold go to payroll as a taxable perquisite. */
export function redemptionTax(valueINR: number, giftsThisYear: number, threshold = 5000): { taxable: boolean; taxableAmount: number } {
  const total = giftsThisYear + valueINR;
  if (total <= threshold) return { taxable: false, taxableAmount: 0 };
  return { taxable: true, taxableAmount: giftsThisYear >= threshold ? valueINR : total - threshold };
}

/** YX-ENG-03: blocked words hold the post; 3 reports hide it until a moderator acts. */
export function moderate(text: string, reports: number, blocked: string[], hideAfter = 3): { state: 'Published' | 'Held' | 'Hidden'; reason: string | null } {
  const lower = text.toLowerCase();
  const hit = blocked.find((w) => new RegExp(`\\b${w.toLowerCase()}\\b`).test(lower));
  if (hit) return { state: 'Held', reason: `Blocked word "${hit}"` };
  if (reports >= hideAfter) return { state: 'Hidden', reason: `${reports} reports` };
  return { state: 'Published', reason: null };
}

/** Poll results as whole percentages that add up to 100 (largest remainder). */
export function pollPercents(votes: number[]): number[] {
  const total = votes.reduce((a, v) => a + v, 0);
  if (total === 0) return votes.map(() => 0);
  const raw = votes.map((v) => (v / total) * 100);
  const floors = raw.map(Math.floor);
  let left = 100 - floors.reduce((a, v) => a + v, 0);
  const order = raw.map((r, i) => ({ i, rem: r - Math.floor(r) })).sort((a, b) => b.rem - a.rem);
  for (const o of order) {
    if (left <= 0) break;
    floors[o.i] += 1;
    left -= 1;
  }
  return floors;
}

/** Action plans (Q8): due 30 days after results open. */
export function actionPlanDue(resultsOpened: Date, days = 30): Date {
  return new Date(resultsOpened.getFullYear(), resultsOpened.getMonth(), resultsOpened.getDate() + days);
}
