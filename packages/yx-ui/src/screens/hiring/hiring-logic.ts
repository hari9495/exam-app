// Pure rules behind the Hiring & staffing desk screens (M10). Screens call these; hiring.test.tsx covers them.
import { formatINR } from '../../lib/format';

const DAY_MS = 86_400_000;
const dayNo = (d: Date) => Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS);
export const daysBetween = (from: Date, to: Date) => dayNo(to) - dayNo(from);
export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/* ---------------- HIR-01 / 02 · plan and requisition approval (YX-ATS-01, Q1) ---------------- */

export interface PlanLine {
  id: string;
  department: string;
  designation: string;
  grade: string;
  location: string;
  approved: number;
  filled: number;
  open: number; // requisitions in progress
  budget: number; // annual CTC budget for the line
  committed: number; // CTC of filled + offered
}

export const planLineFree = (l: PlanLine) => Math.max(0, l.approved - l.filled - l.open);
export const planBudgetLeft = (l: PlanLine) => l.budget - l.committed;

export interface RequisitionInput {
  planLine?: PlanLine | null;
  /** Proposed top of the pay range for this hire, annual CTC. */
  proposedMax: number;
  /** Replacement for a leaver: linked to the exit, draws no new plan line (Q1). */
  replacementFor?: string | null;
}

export interface ApprovalRoute {
  steps: string[];
  extra: boolean;
  reasons: string[];
}

/** In-plan requisitions take the short chain; outside plan or over budget adds the extra approver (default CFO). */
export function requisitionRoute(r: RequisitionInput, extraApprover = 'CFO'): ApprovalRoute {
  const steps = ['Hiring manager', 'HR business partner'];
  const reasons: string[] = [];
  if (r.replacementFor) return { steps, extra: false, reasons: [`Replacement for ${r.replacementFor}; no new plan line used`] };
  if (!r.planLine) reasons.push('Outside the approved headcount plan');
  else {
    if (planLineFree(r.planLine) <= 0) reasons.push('No free position left on this plan line');
    if (r.proposedMax > planBudgetLeft(r.planLine)) reasons.push('Pay above the budget left on the plan line');
  }
  const extra = reasons.length > 0;
  return { steps: extra ? [...steps, 'Finance', extraApprover] : [...steps, 'Finance'], extra, reasons };
}

/* ---------------- HIR-24 · pay range and pay-history question (YX-ATS-34) ---------------- */

export interface PayLaw {
  /** Location's pay-transparency law makes the range mandatory. */
  rangeRequired: boolean;
  /** Pay-history question banned by law. */
  historyBanned: boolean;
  source?: string;
}

export interface PayRange {
  min: number | null;
  max: number | null;
}

export function payRangeIssues(range: PayRange, law: PayLaw, showRange: boolean): string[] {
  const out: string[] = [];
  const has = range.min != null && range.max != null;
  if (law.rangeRequired && !has) out.push('Add a minimum and maximum. The law for this location requires a pay range before you publish.');
  if (has && range.min! > range.max!) out.push('Minimum must be less than or equal to maximum.');
  if (!law.rangeRequired && showRange && !has) out.push('Add a range, or switch off "Show pay range on the careers page".');
  return out;
}

export const canPublishJob = (range: PayRange, law: PayLaw, showRange: boolean) => payRangeIssues(range, law, showRange).length === 0;
export const payHistoryAllowed = (law: PayLaw) => !law.historyBanned;

/* ---------------- HIR-07 · scorecards (YX-ATS-04) ---------------- */

export interface ScoreItem {
  skill: string;
  weight: number;
  passBar: number; // out of 5
  rating: number | null;
}

export type Recommendation = 'strong-yes' | 'yes' | 'no' | 'strong-no';

export function scorecardResult(items: ScoreItem[]) {
  const rated = items.filter((i) => i.rating != null);
  const complete = rated.length === items.length;
  const totalWeight = items.reduce((s, i) => s + i.weight, 0) || 1;
  const weighted = rated.reduce((s, i) => s + (i.rating! * i.weight), 0) / totalWeight;
  const below = rated.filter((i) => i.rating! < i.passBar).map((i) => i.skill);
  let prompt: string;
  if (!complete) prompt = 'Rate every skill to see the recommendation.';
  else if (below.length === 0) prompt = 'Meets the pass bar on every skill. Suggested next step: move to the next round.';
  else if (below.length === 1) prompt = `Below the pass bar on ${below[0]}. Suggested next step: discuss with the panel before moving on.`;
  else prompt = `Below the pass bar on ${below.length} skills. Suggested next step: do not progress.`;
  return { complete, score: Math.round(weighted * 10) / 10, below, prompt };
}

/* ---------------- HIR-09 / 28 · offers (YX-ATS-06 / 17, Q3) ---------------- */

export interface Band {
  min: number;
  max: number;
}
export type BandPosition = 'below' | 'within' | 'above';

export function bandCheck(ctc: number, band: Band): { position: BandPosition; extraApproval: boolean; text: string } {
  if (ctc > band.max) return { position: 'above', extraApproval: true, text: 'Above the grade pay range. Needs extra approval.' };
  if (ctc < band.min) return { position: 'below', extraApproval: true, text: 'Below the grade pay range. Needs extra approval.' };
  return { position: 'within', extraApproval: false, text: 'Within the grade pay range.' };
}

export interface CtcLine {
  key: string;
  label: string;
  kind: 'earning' | 'employer' | 'one-time' | 'variable';
  annual: number;
  monthly: number;
}

/** M03 starter CTC template: basic 40 %, HRA 50 % of basic (metro), employer PF 12 % of basic capped at ₹1,800 a month, gratuity 4.81 % of basic, special allowance is the balance. */
export function ctcBreakup(fixedCtc: number, opts: { variable?: number; joiningBonus?: number; metro?: boolean } = {}): CtcLine[] {
  const r = (n: number) => Math.round(n);
  const basic = r(fixedCtc * 0.4);
  const hra = r(basic * (opts.metro === false ? 0.4 : 0.5));
  const pf = Math.min(r(basic * 0.12), 1800 * 12);
  const gratuity = r(basic * 0.0481);
  const special = fixedCtc - basic - hra - pf - gratuity;
  const lines: CtcLine[] = [
    { key: 'basic', label: 'Basic', kind: 'earning', annual: basic, monthly: r(basic / 12) },
    { key: 'hra', label: 'House rent allowance', kind: 'earning', annual: hra, monthly: r(hra / 12) },
    { key: 'special', label: 'Special allowance', kind: 'earning', annual: special, monthly: r(special / 12) },
    { key: 'pf', label: 'Employer PF', kind: 'employer', annual: pf, monthly: r(pf / 12) },
    { key: 'gratuity', label: 'Gratuity', kind: 'employer', annual: gratuity, monthly: r(gratuity / 12) },
  ];
  if (opts.variable) lines.push({ key: 'variable', label: 'Variable pay (target)', kind: 'variable', annual: opts.variable, monthly: 0 });
  if (opts.joiningBonus) lines.push({ key: 'joining', label: 'Joining bonus (one time)', kind: 'one-time', annual: opts.joiningBonus, monthly: 0 });
  return lines;
}

export const totalCtc = (lines: CtcLine[]) => lines.filter((l) => l.kind !== 'one-time').reduce((s, l) => s + l.annual, 0);
export const grossMonthly = (lines: CtcLine[]) => lines.filter((l) => l.kind === 'earning').reduce((s, l) => s + l.monthly, 0);

/** A revision needs re-approval only when CTC or grade changed (YX-ATS-17). */
export const revisionNeedsApproval = (prev: { ctc: number; grade: string }, next: { ctc: number; grade: string }) =>
  prev.ctc !== next.ctc || prev.grade !== next.grade;

/* ---------------- HIR-29 · offer conditions and auto-lapse (YX-ATS-41) ---------------- */

export interface OfferCondition {
  id: string;
  name: string;
  due: Date;
  status: 'open' | 'met' | 'waived';
}

export function offerLapse(conditions: OfferCondition[], lapseDate: Date, today: Date, reminderDays = 3) {
  const open = conditions.filter((c) => c.status === 'open');
  const overdue = open.filter((c) => daysBetween(c.due, today) > 0);
  const daysToLapse = daysBetween(today, lapseDate);
  let state: 'clear' | 'on-track' | 'reminder' | 'lapsed';
  if (open.length === 0) state = 'clear';
  else if (daysToLapse < 0) state = 'lapsed';
  else if (daysToLapse <= reminderDays || overdue.length > 0) state = 'reminder';
  else state = 'on-track';
  return { open: open.length, overdue: overdue.map((c) => c.name), daysToLapse, state };
}

/* ---------------- HIR-12 · referral bonus (YX-ATS-12) ---------------- */

export function referralBonusStatus(joined: Date | null, today: Date, eligibleAfterDays = 90) {
  if (!joined) return { state: 'not-joined' as const, daysLeft: null as number | null, eligibleOn: null as Date | null };
  const served = daysBetween(joined, today);
  const eligibleOn = addDays(joined, eligibleAfterDays);
  if (served >= eligibleAfterDays) return { state: 'eligible' as const, daysLeft: 0, eligibleOn };
  return { state: 'waiting' as const, daysLeft: eligibleAfterDays - served, eligibleOn };
}

/* ---------------- HIR-20 · campaigns and consent (YX-ATS-20 / 22) ---------------- */

export type Channel = 'email' | 'whatsapp';
export interface CrmMember {
  id: string;
  name: string;
  minor?: boolean;
  sourcedPending?: boolean;
  consent: Partial<Record<Channel, 'opted-in' | 'opted-out' | 'none'>>;
}

export function campaignAudience(members: CrmMember[], channel: Channel) {
  const enrolled: CrmMember[] = [];
  const skipped = { noConsent: 0, optedOut: 0, minor: 0, pendingConsent: 0 };
  for (const m of members) {
    if (m.minor) skipped.minor++;
    else if (m.sourcedPending) skipped.pendingConsent++;
    else if (m.consent[channel] === 'opted-out') skipped.optedOut++;
    else if (m.consent[channel] !== 'opted-in') skipped.noConsent++;
    else enrolled.push(m);
  }
  return { enrolled, skipped, skippedTotal: members.length - enrolled.length };
}

/** A sourced capture with no consent inside the window is deleted (starter 30 days). */
export function sourcedPurgeIn(capturedAt: Date, today: Date, windowDays = 30) {
  return windowDays - daysBetween(capturedAt, today);
}

/* ---------------- HIR-06 / 27 · slot finder (YX-ATS-24) ---------------- */

export interface Busy {
  start: number; // minutes from midnight
  end: number;
}
export interface Panelist {
  id: string;
  name: string;
  required: boolean;
  /** null = no connected calendar: availability unknown, never assumed free. */
  busy: Busy[] | null;
  interviewsToday: number;
}
export interface SlotRules {
  dayStart: number;
  dayEnd: number;
  duration: number;
  buffer: number;
  maxPerDay: number;
  step?: number;
}

export interface ProposedSlot {
  start: number;
  end: number;
  optionalFree: number;
}

export function findSlots(panel: Panelist[], rules: SlotRules, limit = 5): ProposedSlot[] {
  const step = rules.step ?? 30;
  const free = (p: Panelist, s: number, e: number) =>
    p.busy != null && p.interviewsToday < rules.maxPerDay && p.busy.every((b) => e + rules.buffer <= b.start || s >= b.end + rules.buffer);
  const out: ProposedSlot[] = [];
  for (let s = rules.dayStart; s + rules.duration <= rules.dayEnd; s += step) {
    const e = s + rules.duration;
    const required = panel.filter((p) => p.required);
    if (required.some((p) => p.busy == null)) return [];
    if (!required.every((p) => free(p, s, e))) continue;
    out.push({ start: s, end: e, optionalFree: panel.filter((p) => !p.required && free(p, s, e)).length });
  }
  return out.sort((a, b) => b.optionalFree - a.optionalFree || a.start - b.start).slice(0, limit);
}

export const minutesToLabel = (m: number) => {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${String(mm).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
};

/** Bulk interview day: candidates assigned round-robin to panels by slot, rooms follow panels (YX-ATS-40). */
export function assignInterviewDay(candidates: string[], panels: { id: string; room: string }[], slots: number[]) {
  const cap = panels.length * slots.length;
  const assigned = candidates.slice(0, cap).map((c, i) => ({
    candidate: c,
    panel: panels[i % panels.length].id,
    room: panels[i % panels.length].room,
    start: slots[Math.floor(i / panels.length)],
  }));
  return { assigned, unassigned: candidates.slice(cap) };
}

/* ---------------- HIR-16 / 21 · rate caps and duplicates (YX-ATS-26 / 27) ---------------- */

export const suggestedRateCap = (billRate: number, targetMarginPct: number) => Math.floor(billRate * (1 - targetMarginPct / 100));

export function rateCapCheck(quoted: number, cap: number) {
  return quoted <= cap ? { ok: true, overBy: 0 } : { ok: false, overBy: quoted - cap };
}

export interface PriorSubmission {
  candidateKey: string; // email or phone, normalised
  jobId: string;
  source: string;
  at: Date;
}

/** Duplicate if anyone submitted the same person for the job inside the ownership window. The holder is never revealed to the vendor. */
export function duplicateCheck(candidateKey: string, jobId: string, prior: PriorSubmission[], today: Date, windowDays = 90) {
  const hit = prior.find((p) => p.candidateKey === candidateKey && p.jobId === jobId && daysBetween(p.at, today) <= windowDays);
  return hit
    ? { status: 'duplicate' as const, vendorMessage: 'Duplicate — not accepted', ownerUntil: addDays(hit.at, windowDays), holder: hit.source }
    : { status: 'unique' as const, vendorMessage: 'Accepted for review', ownerUntil: addDays(today, windowDays), holder: null };
}

/* ---------------- HIR-17 / 18 / 19 · placements, invoices, collections ---------------- */

export const placementMargin = (billRate: number, payRate: number, statutoryPerHour: number) => billRate - payRate - statutoryPerHour;

export interface InvoiceLine {
  description: string;
  qty: number;
  rate: number;
}

/** GST 18 %: CGST + SGST inside the state, IGST across states (place of supply from the client GSTIN). */
export function invoiceTotals(lines: InvoiceLine[], supplierState: string, clientState: string, gstPct = 18) {
  const subtotal = lines.reduce((s, l) => s + Math.round(l.qty * l.rate), 0);
  const gst = Math.round((subtotal * gstPct) / 100);
  const inter = supplierState !== clientState;
  return {
    subtotal,
    cgst: inter ? 0 : Math.round(gst / 2),
    sgst: inter ? 0 : gst - Math.round(gst / 2),
    igst: inter ? gst : 0,
    total: subtotal + gst,
    interState: inter,
  };
}

export type EInvoiceState = 'not-applicable' | 'ok' | 'warning' | 'blocked';

/** YX-ATS-44 / YX-PRJ-16: warning from day 25, blocked after day 30, only above the AATO threshold. */
export function eInvoiceWindow(invoiceDate: Date, today: Date, aboveThreshold: boolean): { days: number; state: EInvoiceState } {
  const days = daysBetween(invoiceDate, today);
  if (!aboveThreshold) return { days, state: 'not-applicable' };
  if (days > 30) return { days, state: 'blocked' };
  if (days >= 25) return { days, state: 'warning' };
  return { days, state: 'ok' };
}

export const AGEING_BUCKETS = ['0–30', '31–60', '61–90', '90+'] as const;
export type AgeingBucket = (typeof AGEING_BUCKETS)[number];
export function ageingBucket(invoiceDate: Date, today: Date): AgeingBucket {
  const d = daysBetween(invoiceDate, today);
  if (d <= 30) return '0–30';
  if (d <= 60) return '31–60';
  if (d <= 90) return '61–90';
  return '90+';
}

/** Client-side TDS receivable vs 26AS: unmatched is flagged. */
export const tdsMatch = (deducted: number, in26as: number | null) =>
  in26as == null ? 'Not in 26AS yet' : in26as === deducted ? 'Matched' : `Mismatch of ${formatINR(Math.abs(deducted - in26as))}`;

/* ---------------- HIR-17 · bench policy (YX-ATS-15) ---------------- */

export function benchPolicyState(benchStart: Date, today: Date, maxBenchDays: number) {
  const days = daysBetween(benchStart, today);
  return { days, left: maxBenchDays - days, action: days >= maxBenchDays ? 'Redeploy or start an exit review' : null };
}

/* ---------------- HIR-30 · fees and replacement guarantee (YX-ATS-43) ---------------- */

export type FeeModel = { kind: 'fixed'; amount: number } | { kind: 'percent'; pct: number };
export const placementFee = (m: FeeModel, ctc: number) => (m.kind === 'fixed' ? m.amount : Math.round((ctc * m.pct) / 100));

/** Conversion fee tapers by months served: the first tier whose `fromMonth` is <= months served applies. */
export function conversionFee(taper: { fromMonth: number; pct: number }[], monthsServed: number, ctc: number) {
  const tier = [...taper].sort((a, b) => b.fromMonth - a.fromMonth).find((t) => monthsServed >= t.fromMonth);
  return tier ? Math.round((ctc * tier.pct) / 100) : 0;
}

export function guaranteeOutcome(fee: number, guaranteeDays: number, leftAfterDays: number, remedy: 'replace' | 'refund') {
  if (leftAfterDays > guaranteeDays) return { covered: false, text: 'Outside the guarantee period. No replacement or credit.', credit: 0 };
  if (remedy === 'replace') return { covered: true, text: 'Free replacement due to the client.', credit: 0 };
  const credit = Math.round((fee * (guaranteeDays - leftAfterDays)) / guaranteeDays);
  return { covered: true, text: 'Pro-rated credit note due to the client.', credit };
}

/* ---------------- HIR-23 · bias audit (T05 YX-EVAL-32) ---------------- */

export interface AuditCategory {
  label: string;
  assessed: number;
  selected: number;
}

export function impactRatios(cats: AuditCategory[], smallShare = 0.02) {
  const total = cats.reduce((s, c) => s + c.assessed, 0) || 1;
  const rates = cats.map((c) => (c.assessed ? c.selected / c.assessed : 0));
  const best = Math.max(...rates, 0) || 1;
  return cats.map((c, i) => ({
    ...c,
    rate: Math.round(rates[i] * 1000) / 10,
    ratio: Math.round((rates[i] / best) * 100) / 100,
    small: c.assessed / total < smallShare,
  }));
}

export const auditExpired = (lastAudit: Date | null, today: Date) => !lastAudit || daysBetween(lastAudit, today) > 365;

/* ---------------- HIR-22 · identity strip (YX-ATS-32) ---------------- */

export type IdResult = 'match' | 'mismatch' | 'attested' | 're-verified' | 'not-run';
export interface IdCheckpoint {
  id: string;
  label: string;
  result: IdResult;
  at?: Date;
  deepfake?: 'clear' | 'suspected' | 'off';
}
/** Review flags only: never a reject (YX-ATS-05 / 32). */
export const identityFlags = (points: IdCheckpoint[]) =>
  points.filter((p) => p.result === 'mismatch' || p.deepfake === 'suspected').map((p) => p.label);
