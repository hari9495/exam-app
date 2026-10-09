// Pure rules behind the People screens (M01, P02, P05, P06, P01, P21). Tested in people.test.tsx.

export type Persona = 'emp' | 'mgr' | 'hr';
/** P02 §4.4 field classes. */
export type FieldClass = 'Public' | 'Internal' | 'Personal' | 'Confidential' | 'Special';
/** How the viewer relates to the person on screen. */
export type Relation = 'self' | 'team' | 'other';
export type Visibility = 'edit' | 'read' | 'masked' | 'hidden';

/**
 * P02 §4.4 defaults: Public for all; Internal for HR and the manager's team; Personal for self and HR;
 * Confidential and Special for self and HR, masked with an audited reveal.
 * `payGrant` = the manager holds the P02 Q3 salary grant.
 */
export function fieldVisibility(cls: FieldClass, persona: Persona, relation: Relation, payGrant = false): Visibility {
  if (cls === 'Public') return persona === 'hr' ? 'edit' : 'read';
  if (relation === 'self') {
    if (cls === 'Personal') return 'edit';
    if (cls === 'Internal') return 'read';
    return 'masked';
  }
  // HR sees Confidential / Special masked by default with an audited reveal (P02 §7).
  if (persona === 'hr') return cls === 'Confidential' || cls === 'Special' ? 'masked' : 'edit';
  if (persona === 'mgr' && relation === 'team') {
    if (cls === 'Internal') return 'read';
    if (cls === 'Confidential' && payGrant) return 'read';
  }
  return 'hidden';
}

/** Pay tab gate (§13): self, HR, or a manager with the salary grant for their team. */
export function canSeePay(persona: Persona, relation: Relation, payGrant = false): boolean {
  return relation === 'self' || persona === 'hr' || (persona === 'mgr' && relation === 'team' && payGrant);
}

/* ------------------------------------------------------------------ dates */

const DAY = 86400000;
export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}
export function daysBetween(a: Date, b: Date): number {
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((ub - ua) / DAY);
}
const sameDay = (a: Date, b: Date) => daysBetween(a, b) === 0;

/** Entity working-day calendar: Sundays and listed holidays are off (Kaveri Foods works a 6-day week). */
export function isWorkingDay(d: Date, holidays: Date[] = []): boolean {
  return d.getDay() !== 0 && !holidays.some((h) => sameDay(h, d));
}

/** LWD + n working days (YX-LC-08: wages due on exit within 2 working days). */
export function addWorkingDays(d: Date, n: number, holidays: Date[] = []): Date {
  let cur = d;
  let left = n;
  while (left > 0) {
    cur = addDays(cur, 1);
    if (isWorkingDay(cur, holidays)) left--;
  }
  return cur;
}

/** Working days from `today` to `due` (negative when overdue). */
export function workingDaysUntil(today: Date, due: Date, holidays: Date[] = []): number {
  if (daysBetween(today, due) === 0) return 0;
  const sign = due > today ? 1 : -1;
  let n = 0;
  let cur = today;
  while (!sameDay(cur, due)) {
    cur = addDays(cur, sign);
    if (isWorkingDay(cur, holidays)) n += sign;
  }
  return n;
}

/* ------------------------------------------------------------------ resignation (YX-LC-04) */

export interface NoticeResult {
  standardLwd: Date;
  requestedLwd: Date;
  shortfallDays: number;
  /** Recovery for the shortfall on the monthly basic (30-day month), unless waived. */
  shortfallAmount: number;
}
export function noticeOutcome(submittedOn: Date, noticeDays: number, requestedLwd: Date | null, monthlyBasic: number): NoticeResult {
  const standardLwd = addDays(submittedOn, noticeDays);
  const req = requestedLwd ?? standardLwd;
  const shortfallDays = Math.max(0, daysBetween(req, standardLwd));
  return { standardLwd, requestedLwd: req, shortfallDays, shortfallAmount: Math.round((monthlyBasic / 30) * shortfallDays) };
}

/* ------------------------------------------------------------------ F&F (M01 §3.8, YX-LC-06) */

export interface FnfLine {
  id: string;
  kind: 'earning' | 'recovery' | 'tax';
  label: string;
  amount: number;
  how: string;
  /** Pulled automatically (YX-LC-07) and refreshed until approval. */
  auto?: boolean;
  /** Wage line: must be paid within 2 working days of LWD. */
  wage?: boolean;
  /** Held by company policy (an open case); never a wage line. */
  held?: boolean;
}
export function fnfTotals(lines: FnfLine[]) {
  const sum = (k: FnfLine['kind']) => lines.filter((l) => l.kind === k).reduce((s, l) => s + l.amount, 0);
  const earnings = sum('earning');
  const recoveries = sum('recovery');
  const tax = sum('tax');
  const net = earnings - recoveries - tax;
  return { earnings, recoveries, tax, net, payable: Math.max(0, net), recoverable: Math.max(0, -net) };
}

/** Gratuity: 15/26 × last basic + DA × years (6+ months round up); 5-year rule, pro-rata for fixed-term ≥ 1 year, waived on death; ₹20 lakh cap. */
export function gratuity(lastBasicDa: number, serviceMonths: number, opts: { fixedTerm?: boolean; death?: boolean } = {}): { eligible: boolean; amount: number; basis: string } {
  const years = Math.floor(serviceMonths / 12) + (serviceMonths % 12 >= 6 ? 1 : 0);
  const exact = serviceMonths / 12;
  const cap = 2000000;
  if (opts.death) {
    const amount = Math.min(cap, Math.round((15 / 26) * lastBasicDa * Math.max(years, exact)));
    return { eligible: true, amount, basis: 'Death in service: 5-year condition waived' };
  }
  if (opts.fixedTerm) {
    if (exact < 1) return { eligible: false, amount: 0, basis: 'Fixed-term service under 1 year' };
    return { eligible: true, amount: Math.min(cap, Math.round((15 / 26) * lastBasicDa * exact)), basis: `Pro-rata for fixed-term: ${exact.toFixed(2)} years` };
  }
  if (serviceMonths < 60) return { eligible: false, amount: 0, basis: 'Under 5 years of continuous service' };
  return { eligible: true, amount: Math.min(cap, Math.round((15 / 26) * lastBasicDa * years)), basis: `${years} completed years` };
}

export const leaveEncashment = (days: number, monthlyBasic: number) => Math.round((monthlyBasic / 30) * days);

/** Retrenchment compensation (YX-LC-27): 15 days' average pay per completed year; needs ≥ 1 year. */
export function retrenchmentCompensation(avgDailyPay: number, serviceMonths: number): number {
  const years = Math.floor(serviceMonths / 12);
  return years < 1 ? 0 : Math.round(15 * avgDailyPay * years);
}

/** Split an amount by percentage shares so the parts add up exactly (last payee takes the rounding). */
export function splitByShares(amount: number, shares: number[]): number[] {
  const total = shares.reduce((s, x) => s + x, 0);
  if (total !== 100) throw new Error('Shares must add up to 100%');
  const parts = shares.map((s) => Math.floor((amount * s) / 100));
  parts[parts.length - 1] += amount - parts.reduce((s, x) => s + x, 0);
  return parts;
}

/* ------------------------------------------------------------------ probation (YX-LC-01) */

export type ProbationState = 'running' | 'review due' | 'overdue' | 'escalated';
export function probationState(end: Date, today: Date, reviewDaysBefore = 15, reviewDone = false): ProbationState {
  if (reviewDone) return 'running';
  const left = daysBetween(today, end);
  if (left < 0) return 'escalated';
  if (left === 0) return 'overdue';
  return left <= reviewDaysBefore ? 'review due' : 'running';
}
/** Extension must keep total probation within the policy maximum. */
export function extensionAllowed(originalMonths: number, alreadyExtended: number, extendBy: number, maxTotalMonths: number): boolean {
  return extendBy > 0 && originalMonths + alreadyExtended + extendBy <= maxTotalMonths;
}

/* ------------------------------------------------------------------ journeys (YX-LC-02, YX-LC-13) */

export interface JourneyTask {
  id: string;
  title: string;
  owner: 'HR' | 'IT' | 'Admin' | 'Manager' | 'New hire' | 'Payroll' | 'Buddy';
  /** Days relative to the joining date; negative = before. */
  offset: number;
  status: 'todo' | 'done' | 'blocked';
  /** Law-required, can't be removed (YX-LC-26). */
  locked?: boolean;
  /** Blocked until this task is done. */
  waitsFor?: string;
}
export const taskDue = (joining: Date, t: JourneyTask) => addDays(joining, t.offset);
export function journeyProgress(tasks: JourneyTask[]): number {
  return tasks.length ? Math.round((tasks.filter((t) => t.status === 'done').length / tasks.length) * 100) : 0;
}
/** Re-anchor on a joining-date change: open tasks move, done tasks keep their dates. Returns new due dates by task. */
export function reanchor(tasks: JourneyTask[], oldJoin: Date, newJoin: Date): Record<string, { from: Date; to: Date }> {
  const out: Record<string, { from: Date; to: Date }> = {};
  for (const t of tasks) {
    const from = taskDue(oldJoin, t);
    out[t.id] = { from, to: t.status === 'done' ? from : taskDue(newJoin, t) };
  }
  return out;
}
export function overdueTasks(tasks: JourneyTask[], joining: Date, today: Date): JourneyTask[] {
  return tasks.filter((t) => t.status !== 'done' && daysBetween(taskDue(joining, t), today) > 0);
}

/* ------------------------------------------------------------------ absconding (YX-LC-17) */

export interface AbscondStep {
  day: number;
  label: string;
}
export const ABSCOND_STARTER: AbscondStep[] = [
  { day: 3, label: 'Salary hold and alert to manager and HR' },
  { day: 7, label: 'Notice 1 by email and registered post' },
  { day: 14, label: 'Notice 2 (final) by email and registered post' },
  { day: 21, label: 'Deemed abandonment: exit case opens' },
];
export function abscondingState(firstAbsent: Date, today: Date, steps = ABSCOND_STARTER, stopped = false) {
  const dayOfAbsence = daysBetween(firstAbsent, today) + 1;
  const rows = steps.map((s) => ({ ...s, on: addDays(firstAbsent, s.day - 1), status: (stopped ? 'stopped' : dayOfAbsence >= s.day ? 'done' : 'upcoming') as 'done' | 'upcoming' | 'stopped' }));
  const last = steps[steps.length - 1];
  const status = stopped ? 'stopped' : dayOfAbsence >= last.day ? 'deemed abandoned' : 'running';
  return { dayOfAbsence, rows, status };
}

/* ------------------------------------------------------------------ identity checks (YX-EMP-01) */

export const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
export const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
export const isPan = (v: string) => PAN_RE.test(v.trim().toUpperCase());
export const isIfsc = (v: string) => IFSC_RE.test(v.trim().toUpperCase());
export const isUan = (v: string) => /^\d{12}$/.test(v.replace(/\s/g, ''));

/** IBAN mod-97 with country length (YX-GLB-08). */
const IBAN_LEN: Record<string, number> = { AE: 23, SA: 24, GB: 22, DE: 22, FR: 27, NL: 18 };
export function isIban(raw: string): boolean {
  const v = raw.replace(/\s+/g, '').toUpperCase();
  const len = IBAN_LEN[v.slice(0, 2)];
  if (!len || v.length !== len || !/^[A-Z0-9]+$/.test(v)) return false;
  const moved = v.slice(4) + v.slice(0, 4);
  let rem = 0;
  for (const ch of moved) {
    const n = ch >= 'A' ? String(ch.charCodeAt(0) - 55) : ch;
    for (const d of n) rem = (rem * 10 + Number(d)) % 97;
  }
  return rem === 1;
}
export const isBic = (v: string) => /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(v.trim().toUpperCase());

/* ------------------------------------------------------------------ split pay (YX-GLB-09) */

export interface PaySplit {
  id: string;
  label: string;
  rule: 'fixed' | 'percent' | 'remainder';
  value: number;
}
export function splitNetPay(net: number, splits: PaySplit[]): { ok: boolean; error?: string; amounts: Record<string, number> } {
  if (splits.length > 3) return { ok: false, error: 'You can split pay across at most 3 accounts.', amounts: {} };
  const rem = splits.filter((s) => s.rule === 'remainder');
  if (rem.length !== 1) return { ok: false, error: 'Mark exactly one account to receive the remainder.', amounts: {} };
  const amounts: Record<string, number> = {};
  let left = net;
  for (const s of splits.filter((x) => x.rule === 'fixed')) {
    amounts[s.id] = s.value;
    left -= s.value;
  }
  const base = left;
  for (const s of splits.filter((x) => x.rule === 'percent')) {
    amounts[s.id] = Math.round((base * s.value) / 100);
    left -= amounts[s.id];
  }
  if (left < 0) return { ok: false, error: 'Fixed amounts and percentages are more than the net pay.', amounts: {} };
  amounts[rem[0].id] = left;
  return { ok: true, amounts };
}

/* ------------------------------------------------------------------ same-person matching (YX-ORG-27) */

export interface PersonKeys {
  name: string;
  dob?: string;
  email?: string;
  phone?: string;
  pan?: string;
  uan?: string;
}
function nameSimilarity(a: string, b: string): number {
  const ta = new Set(a.toLowerCase().split(/\s+/));
  const tb = new Set(b.toLowerCase().split(/\s+/));
  const inter = [...ta].filter((t) => tb.has(t)).length;
  return inter / Math.max(ta.size, tb.size);
}
export type MatchResult = { kind: 'auto-link'; basis: string[] } | { kind: 'propose'; basis: string[] } | { kind: 'none'; basis: string[] };
/** Deterministic keys auto-link; name + DOB proposes; name alone never links. */
export function matchPersons(a: PersonKeys, b: PersonKeys, consentedFaceMatch = false): MatchResult {
  const keys = (['email', 'phone', 'pan', 'uan'] as const).filter((k) => a[k] && b[k] && a[k] === b[k]);
  const label = { email: 'verified email', phone: 'verified phone', pan: 'PAN', uan: 'UAN' };
  if (keys.length) return { kind: 'auto-link', basis: keys.map((k) => label[k]) };
  const basis: string[] = [];
  if (a.dob && a.dob === b.dob && nameSimilarity(a.name, b.name) >= 0.5) basis.push('name + date of birth');
  if (consentedFaceMatch) basis.push('face match (consented)');
  return basis.length ? { kind: 'propose', basis } : { kind: 'none', basis: [] };
}

/* ------------------------------------------------------------------ BFSI pre-clearance (YX-EMP-18) */

export function preclearanceState(approvedOn: Date, windowDays: number, today: Date, reported: boolean, windowClosed: boolean) {
  if (windowClosed) return 'blocked: trading window closed' as const;
  if (reported) return 'trade reported' as const;
  const validUntil = addDays(approvedOn, windowDays - 1);
  return daysBetween(today, validUntil) >= 0 ? ('valid' as const) : ('expired: report or re-apply' as const);
}

/* ------------------------------------------------------------------ re-verification (YX-EMP-16) */

export function reverificationDue(lastVerified: Date, everyYears: number, today: Date, leadDays = 30): 'not due' | 'due soon' | 'overdue' {
  const due = new Date(lastVerified.getFullYear() + everyYears, lastVerified.getMonth(), lastVerified.getDate());
  const left = daysBetween(today, due);
  return left < 0 ? 'overdue' : left <= leadDays ? 'due soon' : 'not due';
}

/* ------------------------------------------------------------------ import validation (P01 §7) */

export interface ImportRow {
  row: number;
  code: string;
  name: string;
  pan: string;
  manager: string;
  joined: string;
}
export function validateImport(
  rows: ImportRow[],
  existingCodes: string[],
  /** Current employees: a row with the same PAN is the same person, not a new joiner. */
  existingPeople: { code: string; name: string; pan: string }[] = [],
): { row: number; field: string; message: string }[] {
  const issues: { row: number; field: string; message: string }[] = [];
  const seen = new Set(existingCodes);
  const codes = new Set(rows.map((r) => r.code));
  for (const r of rows) {
    const same = r.pan ? existingPeople.find((p) => p.pan === r.pan) : undefined;
    if (same) {
      issues.push({ row: r.row, field: 'Already an employee', message: `Looks like ${same.name} (${same.code}, same PAN), who is already an employee. This row is skipped.` });
      continue;
    }
    if (!r.name.trim()) issues.push({ row: r.row, field: 'Name', message: 'Enter the employee name.' });
    if (r.code && seen.has(r.code)) issues.push({ row: r.row, field: 'Employee code', message: `${r.code} already exists. Use a new code or leave it blank.` });
    if (r.code) seen.add(r.code);
    if (r.pan && !isPan(r.pan)) issues.push({ row: r.row, field: 'PAN', message: 'Enter a 10-character PAN like ABCDE1234F.' });
    if (r.manager && !codes.has(r.manager) && !existingCodes.includes(r.manager)) issues.push({ row: r.row, field: 'Manager code', message: `No employee with code ${r.manager}. Check the code.` });
    if (!/^\d{2} [A-Z][a-z]{2} \d{4}$/.test(r.joined)) issues.push({ row: r.row, field: 'Joining date', message: 'Enter the date as dd MMM yyyy, like 01 Oct 2026.' });
  }
  return issues;
}

/* ------------------------------------------------------------------ bulk increment (P06 §7) */

export function applyIncrement(ctc: number, pct: number): number {
  return Math.round((ctc * (1 + pct / 100)) / 100) * 100;
}

/* ------------------------------------------------------------------ succession (M01 Q8) */

export type Readiness = 'Ready now' | '1–2 years' | '3+ years';
export function successionRisk(successors: { readiness: Readiness }[]): 'No successor' | 'No ready successor' | 'Covered' {
  if (!successors.length) return 'No successor';
  return successors.some((s) => s.readiness === 'Ready now') ? 'Covered' : 'No ready successor';
}

/* ------------------------------------------------------------------ scheduled changes (P06 §4.4) */

export function withinWindow(effective: Date, today: Date, days: 30 | 60 | 90): boolean {
  const d = daysBetween(today, effective);
  return d >= 0 && d <= days;
}
