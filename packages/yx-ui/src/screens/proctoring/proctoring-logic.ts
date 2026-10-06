// Pure rules behind the proctoring and analytics screens (T02–T05, P09). Tested in proctoring.test.tsx.

/* ---------- Integrity score (T04 YX-PROC-14, B5) ---------- */

export type IntegrityLevel = 'clear' | 'review' | 'high';
export interface SignalCount {
  signal: string;
  label: string;
  count: number;
  /** Points per occurrence from the company's weight profile. */
  weight: number;
  /** AI-assistance signal (Q7): review flag only, marked with AiBadge. */
  ai?: boolean;
}
export interface ScoreContribution extends SignalCount {
  deduction: number;
}

/** 100 minus weighted deductions, floored at 0. Returns the breakdown shown next to the score. */
export function integrityScore(signals: SignalCount[]): { score: number; contributions: ScoreContribution[] } {
  const contributions = signals
    .filter((s) => s.count > 0)
    .map((s) => ({ ...s, deduction: s.count * s.weight }))
    .sort((a, b) => b.deduction - a.deduction);
  const total = contributions.reduce((n, c) => n + c.deduction, 0);
  return { score: Math.max(0, 100 - total), contributions };
}

/** Starter ranges: ≥ 80 clear, 50–79 review, < 50 high concern. */
export function integrityLevel(score: number, ranges = { clear: 80, review: 50 }): IntegrityLevel {
  if (score >= ranges.clear) return 'clear';
  if (score >= ranges.review) return 'review';
  return 'high';
}

export const LEVEL_LABEL: Record<IntegrityLevel, string> = { clear: 'Clear', review: 'Review', high: 'High concern' };
export const LEVEL_TONE: Record<IntegrityLevel, 'success' | 'warning' | 'danger'> = { clear: 'success', review: 'warning', high: 'danger' };

/* ---------- Live console (T04 §7) ---------- */

export interface LiveTileData {
  id: string;
  name: string;
  status: 'in-progress' | 'paused' | 'waiting' | 'disconnected' | 'submitted' | 'terminated';
  score: number;
  flags: number;
  lastFlag?: string;
  lastFlagAi?: boolean;
  question: string;
  secondsLeft: number;
  accommodation?: string;
}

/** Sorted by concern: lowest score first, then most flags, then name. */
export function sortByConcern<T extends { score: number; flags: number; name: string }>(tiles: T[]): T[] {
  return [...tiles].sort((a, b) => a.score - b.score || b.flags - a.flags || a.name.localeCompare(b.name));
}

export function filterByRisk<T extends { score: number }>(tiles: T[], risk: 'all' | IntegrityLevel): T[] {
  return risk === 'all' ? tiles : tiles.filter((t) => integrityLevel(t.score) === risk);
}

/** A proctor action (warn / pause / terminate…) needs a reason (YX-PROC-09). */
export function proctorActionError(reason: string): string | null {
  return reason.trim().length < 10 ? 'Enter a reason of at least 10 characters. It is saved in the audit log.' : null;
}

/** Live ratio default 1 : 12, range 8–16 (T04 Q8). */
export function liveCapacity(watching: number, ratio = 12) {
  return { watching, ratio, full: watching >= ratio, free: Math.max(0, ratio - watching) };
}

/* ---------- Session continuity (T03 Q4) ---------- */

/** Automatic credit up to the cap (default 10 min); the rest needs admin approval; > cap needs re-auth. */
export function timeCredit(lostSeconds: number, capSeconds = 600) {
  const auto = Math.min(lostSeconds, capSeconds);
  return { auto, needsApproval: Math.max(0, lostSeconds - capSeconds), reauth: lostSeconds > capSeconds };
}

/** Extra-time accommodation: minutes × (1 + pct/100), rounded up. */
export function withExtraTime(minutes: number, pct: number): number {
  return Math.ceil(minutes * (1 + pct / 100));
}

/* ---------- Scheduling (T03 Q1) ---------- */

export function slotState(capacity: number, booked: number): 'open' | 'filling' | 'full' {
  if (booked >= capacity) return 'full';
  if (booked / capacity >= 0.8) return 'filling';
  return 'open';
}

/** Reschedule allowed up to 2 times and until 24 h before the slot. */
export function canReschedule(count: number, hoursToSlot: number, maxCount = 2, cutoffHours = 24): { ok: boolean; reason?: string } {
  if (count >= maxCount) return { ok: false, reason: `You have already rescheduled ${maxCount} times, the most this test allows.` };
  if (hoursToSlot < cutoffHours) return { ok: false, reason: `Rescheduling closes ${cutoffHours} hours before your slot.` };
  return { ok: true };
}

/** Drives above 1,000 need a capacity plan with waves (YX-DLV-12). */
export function planWaves(expected: number, perWave: number): number[] {
  const waves: number[] = [];
  let left = expected;
  while (left > 0) {
    waves.push(Math.min(perWave, left));
    left -= perWave;
  }
  return waves;
}

/* ---------- Test builder (T02 YX-TB-01) ---------- */

/** A blueprint cell needs k × drawn approved items (default k = 3). */
export function blueprintCell(needed: number, available: number, k = 3) {
  const required = needed * k;
  return { required, ok: needed === 0 || available >= required };
}

export interface PublishCheck {
  id: string;
  label: string;
  ok: boolean;
}
export function publishChecks(input: { draftQuestions: number; weightsTotal: number; cellsShort: number; certification: boolean; cutScoreApproved: boolean }): PublishCheck[] {
  return [
    { id: 'approved', label: input.draftQuestions ? `${input.draftQuestions} question versions are not approved` : 'Every question version is approved', ok: input.draftQuestions === 0 },
    { id: 'weights', label: `Section weights total ${input.weightsTotal} %`, ok: input.weightsTotal === 100 },
    { id: 'depth', label: input.cellsShort ? `${input.cellsShort} blueprint cells are below pool depth` : 'Every blueprint cell meets pool depth', ok: input.cellsShort === 0 },
    ...(input.certification ? [{ id: 'cut', label: input.cutScoreApproved ? 'Cut-score study approved' : 'Certification test needs an approved cut-score study', ok: input.cutScoreApproved }] : []),
  ];
}

/** Pass only when the overall mark and every enabled section cut-off are met (YX-TB-15). */
export function overallOutcome(overall: number, passMark: number, sections: { name: string; score: number; cutoff?: number }[]) {
  const failed = sections.filter((s) => s.cutoff != null && s.score < s.cutoff).map((s) => s.name);
  const pass = overall >= passMark && failed.length === 0;
  return { pass, failed };
}

/* ---------- Integrity verdicts (T05) ---------- */

export type Verdict = 'cleared' | 'warning' | 'section' | 'attempt';
export const VERDICT_LABEL: Record<Verdict, string> = {
  cleared: 'Cleared',
  warning: 'Warning noted',
  section: 'Section invalidated',
  attempt: 'Attempt invalidated',
};

/** Attempt invalidation needs two reviewers (YX-EVAL-01); every verdict needs a reason (YX-EVAL-02). */
export function verdictError(verdict: Verdict | null, reason: string, secondReviewer: string | null): string | null {
  if (!verdict) return 'Choose a verdict.';
  if (reason.trim().length < 10) return 'Enter a reason of at least 10 characters.';
  if (verdict === 'attempt' && !secondReviewer) return 'Attempt invalidation needs a second reviewer. Choose one before you save.';
  return null;
}

/** Two blind evaluators differing by more than the threshold trigger a third (YX-EVAL-05). */
export function needsModeration(a: number, b: number, threshold = 3) {
  return Math.abs(a - b) > threshold;
}

/* ---------- Fairness (T05 A13) ---------- */

/** Impact ratio vs the highest-rate group; < 0.8 is a finding. Groups under the minimum size are suppressed. */
export function impactRatios(groups: { group: string; passed: number; total: number }[], minSize = 5) {
  const eligible = groups.filter((g) => g.total >= minSize);
  const top = Math.max(0, ...eligible.map((g) => g.passed / g.total));
  return groups.map((g) => {
    if (g.total < minSize) return { ...g, rate: null, ratio: null, status: 'suppressed' as const };
    const rate = g.passed / g.total;
    const ratio = top ? rate / top : 1;
    return { ...g, rate, ratio, status: ratio < 0.8 ? ('flagged' as const) : ratio < 0.9 ? ('watch' as const) : ('ok' as const) };
  });
}

/* ---------- Typing (T05 YX-EVAL-20) ---------- */

export function netWpm(chars: number, uncorrected: number, minutes: number) {
  return Math.max(0, Math.round((chars / 5 - uncorrected) / minutes));
}

/* ---------- Analytics (P09) ---------- */

/** Small-group suppression: cells below the threshold show as null (YX-MET-04). */
export function suppress(values: { label: string; value: number; n: number }[], threshold = 5) {
  return values.map((v) => ({ ...v, shown: v.n < threshold ? null : v.value }));
}

/** Calculated metric inherits the most restrictive sensitivity (YX-MET-11). */
export type Sensitivity = 'Internal' | 'Confidential' | 'Special';
const RANK: Record<Sensitivity, number> = { Internal: 0, Confidential: 1, Special: 2 };
export function inheritedSensitivity(inputs: Sensitivity[]): Sensitivity {
  return inputs.reduce<Sensitivity>((a, b) => (RANK[b] > RANK[a] ? b : a), 'Internal');
}

/** Email attaches the file only for content without Confidential / Special data (YX-MET-08). */
export function deliveryMode(sensitivity: Sensitivity, channel: 'email' | 'whatsapp' | 'in-app'): 'attachment' | 'secure link' | 'in-app' {
  if (channel === 'in-app') return 'in-app';
  if (channel === 'whatsapp') return 'secure link';
  return sensitivity === 'Internal' ? 'attachment' : 'secure link';
}

/* ---------- Calculator (runner tool) ---------- */

/** Basic four-function calculator step. Returns the new display. */
export function calcApply(a: number, op: '+' | '-' | '×' | '÷', b: number): number | 'Error' {
  if (op === '÷' && b === 0) return 'Error';
  const r = op === '+' ? a + b : op === '-' ? a - b : op === '×' ? a * b : a / b;
  return Math.round(r * 1e8) / 1e8;
}
