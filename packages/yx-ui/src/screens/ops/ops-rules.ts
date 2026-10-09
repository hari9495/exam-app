// Pure rules behind the ops screens (helpdesk, cases, POSH, compliance, expenses, contract labour, visitors).
// Values are P07 / company starter values from the design docs; screens label them as estimates where the docs say so.
import { formatINR } from '../../lib/format';

export const DAY_MS = 86_400_000;

/** Midnight copy of a date. */
export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
export function addDays(d: Date, n: number): Date {
  const x = startOfDay(d);
  x.setDate(x.getDate() + n);
  return x;
}
/** Whole calendar days from a to b (negative when b is before a). */
export function daysBetween(a: Date, b: Date): number {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / DAY_MS);
}

/* ---------------- Helpdesk SLA (YX-HD-01 / 02) ---------------- */

export type SlaState = 'on-track' | 'at-risk' | 'breached' | 'paused' | 'met';

/** YX-HD-02: warning at 80 % of the target, breach at 100 %. Timers pause while waiting on the employee. */
export function slaState(elapsedMin: number, targetMin: number, opts: { paused?: boolean; met?: boolean } = {}): SlaState {
  if (opts.met) return 'met';
  if (opts.paused) return 'paused';
  if (elapsedMin >= targetMin) return 'breached';
  if (elapsedMin >= targetMin * 0.8) return 'at-risk';
  return 'on-track';
}

export function formatMinutes(min: number): string {
  const m = Math.abs(Math.round(min));
  const d = Math.floor(m / (60 * 24));
  const h = Math.floor((m % (60 * 24)) / 60);
  const r = m % 60;
  if (d) return h ? `${d} d ${h} h` : `${d} d`;
  if (h) return r ? `${h} h ${r} min` : `${h} h`;
  return `${r} min`;
}

export function slaText(elapsedMin: number, targetMin: number, state: SlaState): string {
  const left = targetMin - elapsedMin;
  switch (state) {
    case 'met':
      return 'SLA met';
    case 'paused':
      return 'Paused, waiting on employee';
    case 'breached':
      return `Breached ${formatMinutes(-left)} ago`;
    default:
      return `${formatMinutes(left)} left`;
  }
}

/** YX-HD-05: a resolved ticket closes after 3 days without a reply; the employee can reopen within 7 days of closing. */
export function ticketCloseInfo(resolvedOn: Date, today: Date): { closesOn: Date; reopenUntil: Date; closed: boolean; canReopen: boolean } {
  const closesOn = addDays(resolvedOn, 3);
  const reopenUntil = addDays(closesOn, 7);
  const closed = daysBetween(closesOn, today) >= 0;
  return { closesOn, reopenUntil, closed, canReopen: daysBetween(today, reopenUntil) >= 0 };
}

/* ---------------- Statutory clocks (cases, POSH, accidents) ---------------- */

export type ClockState = 'done' | 'upcoming' | 'due-soon' | 'overdue' | 'waiting';
export interface ClockItem {
  key: string;
  label: string;
  /** null = the clock has not started (depends on an earlier step). */
  due: Date | null;
  doneOn?: Date | null;
  escalateOn?: Date | null;
  note?: string;
}

export function clockState(item: ClockItem, today: Date, soonDays = 7): ClockState {
  if (item.doneOn) return 'done';
  if (!item.due) return 'waiting';
  const left = daysBetween(today, item.due);
  if (left < 0) return 'overdue';
  if (left <= soonDays || (item.escalateOn && daysBetween(item.escalateOn, today) >= 0)) return 'due-soon';
  return 'upcoming';
}

export function clockText(item: ClockItem, today: Date): string {
  if (item.doneOn) return `Done`;
  if (!item.due) return item.note ?? 'Starts after the previous step';
  const left = daysBetween(today, item.due);
  if (left < 0) return `${-left} ${-left === 1 ? 'day' : 'days'} overdue`;
  if (left === 0) return 'Due today';
  return `${left} ${left === 1 ? 'day' : 'days'} left`;
}

/**
 * YX-POSH-03 (P07 POSH parameters, current values): notice to the respondent within 7 days of filing;
 * inquiry completed within 90 days (escalation at 75); report within 10 days of the inquiry; employer acts within 60 days of the report.
 */
export function poshClock(filedOn: Date, done: { notice?: Date | null; inquiry?: Date | null; report?: Date | null; action?: Date | null } = {}): ClockItem[] {
  return [
    { key: 'notice', label: 'Notice to respondent', due: addDays(filedOn, 7), doneOn: done.notice ?? null },
    { key: 'inquiry', label: 'Inquiry complete', due: addDays(filedOn, 90), escalateOn: addDays(filedOn, 75), doneOn: done.inquiry ?? null },
    {
      key: 'report',
      label: 'IC report to employer',
      due: done.inquiry ? addDays(done.inquiry, 10) : null,
      doneOn: done.report ?? null,
      note: 'Due 10 days after the inquiry ends',
    },
    {
      key: 'action',
      label: 'Employer action',
      due: done.report ? addDays(done.report, 60) : null,
      doneOn: done.action ?? null,
      note: 'Due 60 days after the IC report',
    },
  ];
}

/** YX-POSH-02: 3 months from the incident; the IC can extend by 3 more with reasons. */
export function poshFilingWindow(incident: Date, filedOn: Date): 'in-time' | 'extension-needed' | 'out-of-window' {
  const plus = (m: number) => new Date(incident.getFullYear(), incident.getMonth() + m, incident.getDate());
  if (filedOn <= plus(3)) return 'in-time';
  if (filedOn <= plus(6)) return 'extension-needed';
  return 'out-of-window';
}

export interface IcMember {
  name: string;
  role: 'presiding' | 'member' | 'external';
  woman: boolean;
  senior?: boolean;
  tenureFrom: Date;
  tenureTo: Date;
}
/** YX-POSH-01: senior woman presiding, at least half women, one external member, tenure of 3 years or less. Returns what is wrong. */
export function icIssues(members: IcMember[], today: Date): string[] {
  const issues: string[] = [];
  const po = members.find((m) => m.role === 'presiding');
  if (!po || !po.woman || !po.senior) issues.push('Presiding officer must be a senior woman employee');
  if (members.filter((m) => m.woman).length * 2 < members.length) issues.push('At least half the members must be women');
  if (!members.some((m) => m.role === 'external')) issues.push('Add one external member');
  for (const m of members) {
    const years = (m.tenureTo.getTime() - m.tenureFrom.getTime()) / (365.25 * DAY_MS);
    if (years > 3.01) issues.push(`${m.name}: tenure is longer than 3 years`);
    else if (daysBetween(today, m.tenureTo) < 0) issues.push(`${m.name}: tenure ended on ${m.tenureTo.toDateString().slice(4)}`);
  }
  return issues;
}

/* ---------------- Expenses (M05) ---------------- */

export interface ExpenseRule {
  /** Limit per line in rupees; undefined = no line limit. */
  perLine?: number;
  /** Receipt mandatory above this amount (Q4 starter ₹500). */
  receiptAbove: number;
  /** Company switched the category to hard block (Q7). */
  hardBlock?: boolean;
}
export interface LineForCheck {
  amount: number;
  hasReceipt: boolean;
  /** Receipt image hash already used on another claim (YX-EXP-04). */
  duplicateOf?: string | null;
}
export type LineFlag =
  | { kind: 'over-limit'; excess: number; blocked: boolean }
  | { kind: 'receipt-missing' }
  | { kind: 'duplicate'; of: string };

/** YX-EXP-01 / 02 / 03 / 04: flags shown on the line before submission and to the approver. */
export function checkLine(line: LineForCheck, rule: ExpenseRule): LineFlag[] {
  const flags: LineFlag[] = [];
  if (rule.perLine != null && line.amount > rule.perLine) flags.push({ kind: 'over-limit', excess: line.amount - rule.perLine, blocked: !!rule.hardBlock });
  if (!line.hasReceipt && line.amount > rule.receiptAbove) flags.push({ kind: 'receipt-missing' });
  if (line.duplicateOf) flags.push({ kind: 'duplicate', of: line.duplicateOf });
  return flags;
}
export function flagText(f: LineFlag): string {
  if (f.kind === 'over-limit') return f.blocked ? `Over the limit by ${formatINR(f.excess)}. This category is blocked above the limit.` : `Over the limit by ${formatINR(f.excess)}. Add a reason; the excess needs one more approval.`;
  if (f.kind === 'receipt-missing') return 'Receipt needed above the threshold';
  return `Same receipt as ${f.of}`;
}

/** YX-EXP-03: computed, never typed. */
export function mileageAmount(km: number, ratePerKm: number): number {
  return Math.round(km * ratePerKm);
}
export function perDiemAmount(days: number, ratePerDay: number): number {
  return Math.round(days * ratePerDay);
}

/** YX-EXP-06: net payable = approved − advance adjusted (never below zero; the rest is to return). */
export function settlement(approved: number, advance: number): { netPayable: number; toReturn: number } {
  const diff = approved - advance;
  return { netPayable: Math.max(0, diff), toReturn: Math.max(0, -diff) };
}

/** YX-EXP-02: "Approved ₹1,200 of ₹2,000 — hotel cap Tier 2". */
export function reductionText(approved: number, claimed: number, reason?: string): string {
  if (approved >= claimed) return `Approved ${formatINR(approved)}`;
  return `Approved ${formatINR(approved)} of ${formatINR(claimed)}${reason ? ` — ${reason}` : ''}`;
}

/** YX-EXP-14: an employee-entered FX rate more than the tolerance (starter 3 %) away from the reference is flagged. */
export function fxVariancePct(entered: number, reference: number): number {
  return Math.round(((entered - reference) / reference) * 1000) / 10;
}
export function fxFlagged(entered: number, reference: number, tolerancePct = 3): boolean {
  return Math.abs(fxVariancePct(entered, reference)) > tolerancePct;
}

/** Q6: recovery instalments (default up to 3), last one takes the remainder. */
export function recoveryInstalments(balance: number, count = 3): number[] {
  const each = Math.floor(balance / count);
  return Array.from({ length: count }, (_, i) => (i === count - 1 ? balance - each * (count - 1) : each));
}

/* ---------------- TDS (YX-TAX-14, P07 IN.TDS penalty parameters, estimate) ---------------- */

/** Months or part of a month from a to b (s.201(1A) counts a part month as a full month). */
export function monthsOrPart(from: Date, to: Date): number {
  if (to <= from) return 0;
  let months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  if (to.getDate() >= from.getDate()) months += 1;
  return Math.max(1, months);
}
/** s.201(1A) late deposit: 1.5 % per month or part from the deduction date, only when deposited after the due date. */
export function tdsLateInterest(tds: number, deductedOn: Date, dueOn: Date, depositedOn: Date): number {
  if (depositedOn <= dueOn) return 0;
  return Math.round(tds * 0.015 * monthsOrPart(deductedOn, depositedOn));
}
/** s.234E late filing fee: ₹200 per day, capped at the TDS amount. */
export function lateFilingFee(daysLate: number, tds: number): number {
  return Math.min(Math.max(0, daysLate) * 200, tds);
}

/* ---------------- PF supplementary filing (YX-PAY-51, YX-STAT-26, estimate) ---------------- */

/** EPF s.7Q interest 12 % a year; s.14B damages by delay band (5 / 10 / 15 / 25 % a year). */
export function pfLatePayment(base: number, daysLate: number): { interest: number; damages: number; band: string } {
  const interest = Math.round((base * 0.12 * daysLate) / 365);
  const months = daysLate / 30;
  const [rate, band] = months <= 2 ? [0.05, 'Up to 2 months, 5 % a year'] : months <= 4 ? [0.1, '2 to 4 months, 10 % a year'] : months <= 6 ? [0.15, '4 to 6 months, 15 % a year'] : [0.25, 'Over 6 months, 25 % a year'];
  return { interest, damages: Math.round((base * rate * daysLate) / 365), band };
}

/* ---------------- Contract labour (M13) ---------------- */

export function ageOn(dob: Date, on: Date): number {
  let age = on.getFullYear() - dob.getFullYear();
  if (on.getMonth() < dob.getMonth() || (on.getMonth() === dob.getMonth() && on.getDate() < dob.getDate())) age -= 1;
  return age;
}

export interface DeployInput {
  dob: Date;
  on: Date;
  licenceValidTo: Date | null;
  licenceMax: number;
  activeDeployments: number;
  licenceStates: string[];
  siteState: string;
}
/** YX-CLRA-02 / 03 / 13: blocking reasons for a new deployment. */
export function deployBlocks(i: DeployInput): string[] {
  const out: string[] = [];
  if (ageOn(i.dob, i.on) < 18) out.push('Worker is under 18. Deployment is not allowed.');
  if (!i.licenceValidTo || i.licenceValidTo < startOfDay(i.on)) out.push('Contractor licence is not valid on the deployment date.');
  if (!i.licenceStates.includes(i.siteState)) out.push(`Licence scope does not cover ${i.siteState}.`);
  if (i.activeDeployments + 1 > i.licenceMax) out.push(`Licence allows ${i.licenceMax} workers here; ${i.activeDeployments} are already deployed.`);
  return out;
}

/** YX-CLRA-02 starter lead times 60 / 30 / 7 days. */
export function expiryTone(validTo: Date, today: Date): { tone: 'success' | 'warning' | 'danger'; text: string } {
  const left = daysBetween(today, validTo);
  if (left < 0) return { tone: 'danger', text: `Expired ${-left} days ago` };
  if (left <= 30) return { tone: 'danger', text: `Expires in ${left} days` };
  if (left <= 60) return { tone: 'warning', text: `Expires in ${left} days` };
  return { tone: 'success', text: 'Valid' };
}

/** YX-CLRA-06 short challan: workers covered must be at least workers with site attendance. */
export function challanShortfall(covered: number, onSite: number): number {
  return Math.max(0, onSite - covered);
}

/* ---------------- Visitors (M02 §B11) and policies (M08) ---------------- */

/** Starter retention 90 days for visitor data, 30 days for ID images. */
export function retentionLeft(visitDate: Date, today: Date, days = 90): number {
  return Math.max(0, days - daysBetween(visitDate, today));
}

export function ackPercent(acknowledged: number, audience: number): number {
  return audience === 0 ? 0 : Math.round((acknowledged / audience) * 100);
}

/** YX-CASE-11: a one-time, high-entropy access code (deterministic here from a seed for stories and tests). */
export function formatAccessCode(seed: number): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = seed >>> 0 || 1;
  let out = '';
  for (let i = 0; i < 16; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    out += alphabet[s % alphabet.length];
    if (i % 4 === 3 && i < 15) out += '-';
  }
  return out;
}

/* ---------------- Employees' Compensation (P07 IN.EC, estimate; YX-CASE-16) ---------------- */

export type EcKind = 'death' | 'permanent-total' | 'permanent-partial' | 'temporary';
export interface EcInput {
  kind: EcKind;
  monthlyWage: number;
  /** Age factor from the IN.EC schedule valid on the accident date. */
  factor: number;
  /** Loss of earning capacity, % (permanent partial). */
  disablementPct?: number;
  /** Temporary: days unable to work. */
  days?: number;
}
/** P07 IN.EC parameters (current values, dated data): wage ceiling ₹15,000; 50 % (death) / 60 % (total) × wage × factor; minimums ₹1,20,000 / ₹1,40,000; temporary 25 % of wage half-monthly after a 3-day waiting period. */
export const EC_PARAMS = { wageCeiling: 15000, deathPct: 0.5, totalPct: 0.6, deathMin: 120000, totalMin: 140000, waitingDays: 3 };
export function ecCompensation(i: EcInput): { wageUsed: number; amount: number; formula: string } {
  const wageUsed = Math.min(i.monthlyWage, EC_PARAMS.wageCeiling);
  const total = Math.max(Math.round(EC_PARAMS.totalPct * wageUsed * i.factor), EC_PARAMS.totalMin);
  switch (i.kind) {
    case 'death': {
      const amount = Math.max(Math.round(EC_PARAMS.deathPct * wageUsed * i.factor), EC_PARAMS.deathMin);
      return { wageUsed, amount, formula: `50 % × ₹${wageUsed} × ${i.factor}, at least ₹1,20,000` };
    }
    case 'permanent-total':
      return { wageUsed, amount: total, formula: `60 % × ₹${wageUsed} × ${i.factor}, at least ₹1,40,000` };
    case 'permanent-partial': {
      const pct = i.disablementPct ?? 0;
      return { wageUsed, amount: Math.round((total * pct) / 100), formula: `${pct} % of the permanent total amount (${formatINR(total)})` };
    }
    case 'temporary': {
      const payable = Math.max(0, (i.days ?? 0) - EC_PARAMS.waitingDays);
      return { wageUsed, amount: Math.round((wageUsed * 0.25 * payable) / 15), formula: `25 % of ₹${wageUsed} per half-month for ${payable} days after the 3-day waiting period` };
    }
  }
}

/** YX-CASE-07: show-cause reply due in 7 days (extendable). */
export function showCauseDue(issuedOn: Date, extensionDays = 0): Date {
  return addDays(issuedOn, 7 + extensionDays);
}
