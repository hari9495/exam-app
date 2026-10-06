// Pure rules behind the portal, console, partner and mobile-shell screens. No React here so they are easy to test.
// Where a design doc gives no number (OTP length, expiry, attempts) the value is a YukthiX UI default, noted beside it.

/* ------------------------------------------------------------------ OTP (P02 §4.7, YX-SEC-21, YX-IAM-07) */

/** UI defaults: the docs leave OTP numbers open (M04 Q2 "rate-limited"). */
export const OTP_LENGTH = 6;
export const OTP_VALID_MINUTES = 10;
export const OTP_RESEND_SECONDS = 30;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_LOCK_MINUTES = 15;

/** Keeps digits only and cuts to the OTP length; used for typing and paste. */
export function cleanOtp(input: string, length = OTP_LENGTH): string {
  return input.replace(/\D/g, '').slice(0, length);
}

export type OtpPhase = 'enter' | 'wrong' | 'locked';

/** After `used` wrong attempts: keep entering, show "n attempts left", or lock. */
export function otpPhase(used: number, max = OTP_MAX_ATTEMPTS): { phase: OtpPhase; left: number } {
  const left = Math.max(0, max - used);
  if (left === 0) return { phase: 'locked', left };
  return { phase: used > 0 ? 'wrong' : 'enter', left };
}

/** "Resend code in 0:25" or "Resend code". */
export function resendLabel(secondsLeft: number): string {
  if (secondsLeft <= 0) return 'Resend code';
  const m = Math.floor(secondsLeft / 60);
  const s = String(secondsLeft % 60).padStart(2, '0');
  return `Resend code in ${m}:${s}`;
}

/** Masks the destination so the screen never shows a full email or number: d•••@gmail.com, ••••• ••321. */
export function maskDestination(value: string): string {
  if (value.includes('@')) {
    const [user, domain] = value.split('@');
    return `${user.slice(0, 1)}•••@${domain}`;
  }
  const digits = value.replace(/\D/g, '');
  return `+91 ••••• ••${digits.slice(-3)}`;
}

/* ------------------------------------------------------------------ Access windows */

const DAY = 86_400_000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** Whole days from today to `end` (negative once it has passed). */
export function daysUntil(end: Date, today: Date): number {
  return Math.round((startOfDay(end) - startOfDay(today)) / DAY);
}

export type AccessWindow = { state: 'active' | 'ending' | 'ended'; days: number };

/** Portal access (APX-D §4 "Access ends 15 Oct"): ending inside 7 days is flagged. */
export function accessWindow(end: Date, today: Date, warnDays = 7): AccessWindow {
  const days = daysUntil(end, today);
  if (days < 0) return { state: 'ended', days };
  return { state: days <= warnDays ? 'ending' : 'active', days };
}

/** Alumni access lasts 7 years from the exit date (YX-DOC-16). */
export function alumniAccessEnds(exitDate: Date): Date {
  return new Date(exitDate.getFullYear() + 7, exitDate.getMonth(), exitDate.getDate());
}

/* ------------------------------------------------------------------ Anonymous reporter code (YX-CASE-11) */

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I so the code reads cleanly

/** Normalises what a reporter types: upper-case, alphabet only, grouped 4-4-4-4. */
export function formatAccessCode(input: string): string {
  const raw = input
    .toUpperCase()
    .split('')
    .filter((c) => CODE_ALPHABET.includes(c))
    .join('')
    .slice(0, 16);
  return raw.replace(/(.{4})(?=.)/g, '$1-');
}

export function isCompleteAccessCode(input: string): boolean {
  return formatAccessCode(input).replace(/-/g, '').length === 16;
}

/* ------------------------------------------------------------------ Public verify page (P05 Q5, YX-DOC-11) */

export interface VerifiableDoc {
  code: string;
  company: string;
  type: string;
  name: string;
  issuedOn: Date;
  /** Only current or superseded reach the public page; withdrawn shows as not found. */
  status: 'issued' | 'superseded' | 'withdrawn';
  supersededOn?: Date;
}

export type VerifyResult = { state: 'current' | 'superseded'; doc: VerifiableDoc } | { state: 'not-found' };

export function verifyDocument(code: string, docs: VerifiableDoc[]): VerifyResult {
  const c = code.trim().toUpperCase();
  const doc = docs.find((d) => d.code === c);
  if (!doc || doc.status === 'withdrawn') return { state: 'not-found' };
  return { state: doc.status === 'issued' ? 'current' : 'superseded', doc };
}

/* ------------------------------------------------------------------ Checklists and progress */

export interface ChecklistItemState {
  id: string;
  status: 'done' | 'todo' | 'in-review' | 'sent-back' | 'blocked';
  required?: boolean;
}

/** Pre-boarding completion % counts done and in-review items (HR sees the same number, M01 §3.5). */
export function checklistPercent(items: ChecklistItemState[]): number {
  if (items.length === 0) return 0;
  const done = items.filter((i) => i.status === 'done' || i.status === 'in-review').length;
  return Math.round((done / items.length) * 100);
}

/** Nominee shares must add up to exactly 100% per scheme (PF, gratuity, insurance). */
export function nomineeShareError(shares: number[]): string | null {
  const total = shares.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
  if (shares.some((s) => s <= 0)) return 'Give every nominee a share above 0%.';
  if (Math.round(total * 100) !== 10000) return `Shares add up to ${total}%. Make them add up to 100%.`;
  return null;
}

/* ------------------------------------------------------------------ Status page (P20 YX-GRO-08 / 09) */

export type ComponentStatus = 'operational' | 'degraded' | 'partial' | 'major' | 'maintenance';

const SEVERITY: Record<ComponentStatus, number> = { operational: 0, maintenance: 1, degraded: 2, partial: 3, major: 4 };

export const STATUS_LABEL: Record<ComponentStatus, string> = {
  operational: 'Operational',
  maintenance: 'Under maintenance',
  degraded: 'Degraded performance',
  partial: 'Partial outage',
  major: 'Major outage',
};

/** The page headline is the worst status of any component. */
export function overallStatus(statuses: ComponentStatus[]): ComponentStatus {
  return statuses.reduce<ComponentStatus>((w, s) => (SEVERITY[s] > SEVERITY[w] ? s : w), 'operational');
}

/** Uptime % from minutes of downtime per day (partial outage counts half). */
export function uptimePercent(days: { downMinutes: number; partialMinutes?: number }[]): number {
  if (days.length === 0) return 100;
  const total = days.length * 1440;
  const lost = days.reduce((a, d) => a + d.downMinutes + (d.partialMinutes ?? 0) / 2, 0);
  return Math.floor(((total - lost) / total) * 10000) / 100;
}

/* ------------------------------------------------------------------ Public calculators (P20 YX-GRO-15, P07 versions) */

/**
 * Gratuity (Payment of Gratuity Act, P07 `IN.GRATUITY` FY 2026-27 version):
 * 15/26 × last drawn basic + DA × completed years; a final part-year over 6 months counts as a year;
 * needs 5 years' service (not for death or disablement); capped at ₹20,00,000.
 */
export const GRATUITY_CAP = 2_000_000;
export function gratuity(input: { monthlyBasicDa: number; years: number; months: number; deathOrDisablement?: boolean }): {
  eligible: boolean;
  countedYears: number;
  amount: number;
  capped: boolean;
} {
  const countedYears = input.years + (input.months > 6 ? 1 : 0);
  const eligible = Boolean(input.deathOrDisablement) || input.years >= 5;
  if (!eligible) return { eligible: false, countedYears, amount: 0, capped: false };
  const raw = Math.round((15 / 26) * input.monthlyBasicDa * countedYears);
  return { eligible: true, countedYears, amount: Math.min(raw, GRATUITY_CAP), capped: raw > GRATUITY_CAP };
}

/** HRA exemption (old regime): least of actual HRA, rent − 10% of salary, 50% (metro) or 40% of salary. Annual figures. */
export function hraExemption(input: { basicDa: number; hra: number; rent: number; metro: boolean }): {
  exempt: number;
  taxable: number;
  rule: 'actual' | 'rent' | 'percent';
} {
  const rentLess = Math.max(0, input.rent - 0.1 * input.basicDa);
  const pct = (input.metro ? 0.5 : 0.4) * input.basicDa;
  const options: [number, 'actual' | 'rent' | 'percent'][] = [
    [input.hra, 'actual'],
    [rentLess, 'rent'],
    [pct, 'percent'],
  ];
  const [exempt, rule] = options.reduce((m, o) => (o[0] < m[0] ? o : m));
  const e = Math.round(exempt);
  return { exempt: e, taxable: Math.max(0, Math.round(input.hra) - e), rule };
}

/** Notice-period last working day: resignation date + notice days − 1 − days bought out. */
export function lastWorkingDay(resignedOn: Date, noticeDays: number, buyoutDays = 0): Date {
  const d = new Date(resignedOn.getFullYear(), resignedOn.getMonth(), resignedOn.getDate());
  d.setDate(d.getDate() + Math.max(0, noticeDays - buyoutDays) - 1);
  return d;
}

/* ------------------------------------------------------------------ Money roll-ups */

export interface CommissionLine {
  client: string;
  billed: number;
  ratePct: number;
  status: 'accrued' | 'approved' | 'paid';
}

/** Commission per line and totals by status (P16 YX-PTR-11). Rates are placeholders until adopted. */
export function commissionTotals<L extends CommissionLine>(lines: L[]) {
  const withAmount = lines.map((l) => ({ ...l, amount: Math.round((l.billed * l.ratePct) / 100) }));
  const by = (s: CommissionLine["status"]) => withAmount.filter((l) => l.status === s).reduce((a, l) => a + l.amount, 0);
  return {
    lines: withAmount,
    accrued: by('accrued'),
    approved: by('approved'),
    paid: by('paid'),
    total: withAmount.reduce((a, l) => a + l.amount, 0),
  };
}

/** Gross margin % and whether cost has crossed the alert share of revenue (YX-CONSOLE-09). */
export function tenantMargin(revenue: number, cost: number, alertSharePct = 35) {
  const margin = revenue > 0 ? Math.round(((revenue - cost) / revenue) * 1000) / 10 : 0;
  const share = revenue > 0 ? Math.round((cost / revenue) * 1000) / 10 : 100;
  return { margin, share, alert: share >= alertSharePct };
}

/** FIRC / e-BRC matching (YX-BILL-17): a receipt matches an export invoice on currency and amount within tolerance. */
export interface ExportInvoice {
  id: string;
  currency: string;
  amount: number;
  customer: string;
}
export interface ForeignReceipt {
  id: string;
  currency: string;
  amount: number;
  remitter: string;
}
export function matchReceipt(r: ForeignReceipt, invoices: ExportInvoice[], tolerancePct = 1): { invoice: ExportInvoice | null; reason: string } {
  const same = invoices.filter((i) => i.currency === r.currency);
  if (same.length === 0) return { invoice: null, reason: `No open invoice in ${r.currency}` };
  const close = same.find((i) => Math.abs(i.amount - r.amount) <= (i.amount * tolerancePct) / 100);
  if (close) return { invoice: close, reason: close.amount === r.amount ? 'Exact amount' : `Within ${tolerancePct}% (bank charges)` };
  return { invoice: null, reason: 'Amount does not match any open invoice' };
}

/* ------------------------------------------------------------------ Maker / checker and step-up */

/** A second approver must be a different person (P07 golden cases, YX-10 incidents, YX-04 admin messages). */
export function checkerError(maker: string, checker: string | null): string | null {
  if (!checker) return 'Pick a second approver.';
  if (checker === maker) return 'The second approver must be someone other than the author.';
  return null;
}

/** Step-up is fresh for 15 minutes (YX-IAM-02 floor). */
export const STEP_UP_MINUTES = 15;
export function stepUpFresh(verifiedAt: Date | null, now: Date, windowMin = STEP_UP_MINUTES): boolean {
  if (!verifiedAt) return false;
  const age = (now.getTime() - verifiedAt.getTime()) / 60_000;
  return age >= 0 && age <= windowMin;
}

/* ------------------------------------------------------------------ Health score (YX-04, PTR-01) */

export type HealthBand = 'healthy' | 'watch' | 'at-risk';
export function healthBand(score: number): HealthBand {
  if (score >= 70) return 'healthy';
  if (score >= 45) return 'watch';
  return 'at-risk';
}
export const HEALTH_LABEL: Record<HealthBand, string> = { healthy: 'Healthy', watch: 'Watch', 'at-risk': 'At risk' };

/* ------------------------------------------------------------------ Quiet hours (P04 §4.7) */

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/** True when `time` falls inside quiet hours; handles windows that cross midnight (default 21:00–08:00). */
export function inQuietHours(time: string, start = '21:00', end = '08:00'): boolean {
  const t = toMin(time);
  const s = toMin(start);
  const e = toMin(end);
  return s <= e ? t >= s && t < e : t >= s || t < e;
}

/** Types that are always delivered, even in quiet hours or when switched off (YX-NTF-05, YX-NTF-13). */
export const ALWAYS_DELIVERED = ['Security alerts', 'Sign-in codes', 'Bank-detail change confirmation', 'Payslip published'];

/* ------------------------------------------------------------------ Partner link transfer (YX-PTR-13) */

/** Partner-owned → client-owned transfer completes after the notice (starter 30 days, never more than 30). */
export function transferCompletesOn(requestedOn: Date, noticeDays = 30): Date {
  const n = Math.min(30, Math.max(0, noticeDays));
  return new Date(requestedOn.getFullYear(), requestedOn.getMonth(), requestedOn.getDate() + n);
}

/** A client link can become active only when the partner is verified and on the current G-34 version (YX-PTR-01). */
export function linkActivationBlock(p: { verification: 'pending' | 'verified' | 'suspended'; agreementCurrent: boolean }): string | null {
  if (p.verification === 'suspended') return 'Your firm is suspended. Client access is paused until YukthiX reinstates it.';
  if (p.verification === 'pending') return 'Your firm is not verified yet. Links activate once verification is complete.';
  if (!p.agreementCurrent) return 'Accept the current partner programme agreement (G-34) to activate new links.';
  return null;
}

/* ------------------------------------------------------------------ Staffing vendor rules (M10 C7, YX-ATS-25…30) */

/** A quote above the job's rate cap is blocked unless the recruiter approves an exception. */
export function rateCapCheck(quoted: number, cap: number): { ok: boolean; over: number } {
  return { ok: quoted <= cap, over: Math.max(0, quoted - cap) };
}

/** A vendor may not submit beyond the share's limit or after it expires or is withdrawn. */
export function submissionBlock(share: { maxSubmissions: number; mySubmissions: number; expiresOn: Date; state: 'shared' | 'expired' | 'withdrawn' }, today: Date): string | null {
  if (share.state === 'withdrawn') return 'The recruiter withdrew this job, so it no longer takes submissions.';
  if (share.state === 'expired' || daysUntil(share.expiresOn, today) < 0) return 'This job share has expired.';
  if (share.mySubmissions >= share.maxSubmissions) return `You have used all ${share.maxSubmissions} submissions for this job.`;
  return null;
}

/** Proposed vendor invoice: approved hours × vendor rate, plus 18% GST, less TDS on the base. */
export function vendorInvoice(hours: number, rate: number, tdsPct: number, gstPct = 18) {
  const base = Math.round(hours * rate);
  const gst = Math.round((base * gstPct) / 100);
  const tds = Math.round((base * tdsPct) / 100);
  return { base, gst, gross: base + gst, tds, payable: base + gst - tds };
}

/* ------------------------------------------------------------------ Contract-labour rules (M13, YX-CLRA-02…11) */

/** Deployment checks: no worker under 18, and never beyond the licence's maximum workers. */
export function deploymentBlock(p: { dob: Date; today: Date; deployed: number; maxWorkers: number }): string | null {
  const age = p.today.getFullYear() - p.dob.getFullYear() - (p.today < new Date(p.today.getFullYear(), p.dob.getMonth(), p.dob.getDate()) ? 1 : 0);
  if (age < 18) return 'This worker is under 18. Deployment is not allowed.';
  if (p.deployed + 1 > p.maxWorkers) return `The licence allows ${p.maxWorkers} workers; this would be worker ${p.deployed + 1}. Renew or amend the licence first.`;
  return null;
}

/** Licence expiry alerts at 60, 30 and 7 days. */
export function licenceAlert(validTo: Date, today: Date): { band: 'expired' | '7' | '30' | '60' | 'ok'; days: number } {
  const days = daysUntil(validTo, today);
  if (days < 0) return { band: 'expired', days };
  if (days <= 7) return { band: '7', days };
  if (days <= 30) return { band: '30', days };
  if (days <= 60) return { band: '60', days };
  return { band: 'ok', days };
}

/* ------------------------------------------------------------------ Income tax estimate (P07 IN.TDS, FY 2026-27 version) */

type Slab = [upTo: number, ratePct: number];
/** New regime slabs (Finance Act 2025, carried into FY 2026-27): standard deduction ₹75,000, rebate up to ₹12,00,000 taxable. */
export const NEW_REGIME: { slabs: Slab[]; standard: number; rebateLimit: number } = {
  slabs: [
    [4_00_000, 0],
    [8_00_000, 5],
    [12_00_000, 10],
    [16_00_000, 15],
    [20_00_000, 20],
    [24_00_000, 25],
    [Infinity, 30],
  ],
  standard: 75_000,
  rebateLimit: 12_00_000,
};
/** Old regime slabs (below 60): standard deduction ₹50,000, rebate up to ₹5,00,000 taxable. */
export const OLD_REGIME: { slabs: Slab[]; standard: number; rebateLimit: number } = {
  slabs: [
    [2_50_000, 0],
    [5_00_000, 5],
    [10_00_000, 20],
    [Infinity, 30],
  ],
  standard: 50_000,
  rebateLimit: 5_00_000,
};

export function slabTax(taxable: number, slabs: Slab[]): number {
  let tax = 0;
  let prev = 0;
  for (const [upTo, rate] of slabs) {
    if (taxable <= prev) break;
    tax += ((Math.min(taxable, upTo) - prev) * rate) / 100;
    prev = upTo;
  }
  return Math.round(tax);
}

/** Annual tax with the standard deduction, section 87A rebate and 4% cess. `deductions` applies to the old regime only. */
export function incomeTax(gross: number, regime: 'new' | 'old', deductions = 0): { taxable: number; tax: number } {
  const r = regime === 'new' ? NEW_REGIME : OLD_REGIME;
  const taxable = Math.max(0, gross - r.standard - (regime === 'old' ? deductions : 0));
  const base = taxable <= r.rebateLimit ? 0 : slabTax(taxable, r.slabs);
  return { taxable, tax: Math.round(base * 1.04) };
}

/** CTC → monthly in-hand: employee PF 12% of basic (wage ceiling ₹15,000 when capped), PT ₹200, new-regime TDS. */
export function ctcToInHand(input: { annualCtc: number; basicPct: number; pfCapped: boolean }) {
  const basicMonthly = (input.annualCtc * input.basicPct) / 100 / 12;
  const pfWage = input.pfCapped ? Math.min(basicMonthly, 15_000) : basicMonthly;
  const employerPf = Math.round(pfWage * 0.12);
  const grossAnnual = input.annualCtc - employerPf * 12;
  const employeePf = employerPf;
  const pt = 200;
  const { tax } = incomeTax(grossAnnual, 'new');
  const monthly = Math.round(grossAnnual / 12 - employeePf - pt - tax / 12);
  return { grossMonthly: Math.round(grossAnnual / 12), employeePf, employerPf, pt, taxMonthly: Math.round(tax / 12), inHand: monthly };
}

/** ESI applies when monthly gross is ₹21,000 or less: employee 0.75%, employer 3.25%. */
export function esi(grossMonthly: number) {
  if (grossMonthly > 21_000) return { applies: false, employee: 0, employer: 0 };
  return { applies: true, employee: Math.ceil(grossMonthly * 0.0075), employer: Math.ceil(grossMonthly * 0.0325) };
}

/** Leave encashment: (basic + DA) ÷ 26 × days (the divisor is set per company; 26 is the common default). */
export function leaveEncashment(monthlyBasicDa: number, days: number, divisor = 26): number {
  return Math.round((monthlyBasicDa / divisor) * days);
}

/* ------------------------------------------------------------------ Roadmap voting (P20 YX-GRO-12) */

/** One vote per signed-in user per request; voting again removes the vote. */
export function toggleVote(votes: Record<string, string[]>, requestId: string, userId: string | null): { votes: Record<string, string[]>; error: string | null } {
  if (!userId) return { votes, error: 'Sign in to vote.' };
  const cur = votes[requestId] ?? [];
  const next = cur.includes(userId) ? cur.filter((u) => u !== userId) : [...cur, userId];
  return { votes: { ...votes, [requestId]: next }, error: null };
}

/* ------------------------------------------------------------------ Rule-set slabs (P07 §4.1, YX-STAT-01…04) */

export interface SlabRow {
  from: number;
  /** null = no upper limit. */
  to: number | null;
  amount: number;
}

/** Slabs must start at 0, be contiguous (next from = previous to + 1), not overlap, and only the last may be open-ended. */
export function slabErrors(rows: SlabRow[]): { row: number; message: string }[] {
  const errs: { row: number; message: string }[] = [];
  rows.forEach((r, i) => {
    if (r.to != null && r.to < r.from) errs.push({ row: i, message: `Row ${i + 1}: "to" is below "from".` });
    if (r.amount < 0) errs.push({ row: i, message: `Row ${i + 1}: amount can't be negative.` });
    if (i === 0 && r.from !== 0) errs.push({ row: i, message: 'Row 1 must start at ₹0.' });
    if (i > 0) {
      const prev = rows[i - 1];
      if (prev.to == null) errs.push({ row: i - 1, message: `Row ${i}: only the last row can have no upper limit.` });
      else if (r.from <= prev.to) errs.push({ row: i, message: `Row ${i + 1} overlaps row ${i}.` });
      else if (r.from !== prev.to + 1) errs.push({ row: i, message: `Gap between row ${i} and row ${i + 1}.` });
    }
  });
  if (rows.length && rows[rows.length - 1].to != null) errs.push({ row: rows.length - 1, message: 'The last row needs no upper limit so every salary is covered.' });
  return errs;
}

/** Professional tax: the most any person pays in a year, from the monthly amount and the special month (e.g. February), capped at ₹2,500. */
export const PT_ANNUAL_CAP = 2_500;
export function ptAnnualMax(rows: SlabRow[], specialMonthExtra = 0): number {
  const top = rows.reduce((m, r) => Math.max(m, r.amount), 0);
  return top * 12 + specialMonthExtra;
}

/* ------------------------------------------------------------------ Maintenance window check (YX-GRO-09) */

/** Maintenance needs ≥ 72 h notice and must avoid a tenant's payroll-critical window (last 3 + first 7 days) and statutory due dates. */
export function maintenanceBlock(start: Date, now: Date, statutoryDays: number[] = [7, 15, 20]): string | null {
  const hours = (start.getTime() - now.getTime()) / 3_600_000;
  if (hours < 72) return `Only ${Math.floor(hours)} hours' notice. Maintenance must be announced at least 72 hours ahead.`;
  const day = start.getDate();
  const last = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
  if (day <= 7 || day > last - 3) return 'This falls in the payroll-critical window (last 3 and first 7 days of the month).';
  if (statutoryDays.includes(day)) return `The ${day}th is a statutory due date for some tenants.`;
  return null;
}

/* ------------------------------------------------------------------ Support access (P02 YX-SEC-20) */

/** Support sessions are approved by a tenant admin, default 24 h, never longer than 72 h. */
export function supportWindowError(hours: number): string | null {
  if (hours <= 0) return 'Choose how long support may access.';
  if (hours > 72) return 'Support access can last at most 72 hours.';
  return null;
}

/** CS admin messages: at most 2 non-critical messages per admin per week (YX-CONSOLE-06). */
export function csMessageAllowed(kind: string, sentThisWeek: number): boolean {
  if (kind === 'maintenance' || kind === 'incident') return true;
  return sentThisWeek < 2;
}
