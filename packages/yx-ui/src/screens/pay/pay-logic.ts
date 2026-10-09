// Pure payroll maths used by the Pay screens (M03, P07 starter values, P23 tax planner).
// Every figure here is illustrative data for the screens; production values come from P07 rule sets.

import { formatINR } from '../../lib/format';
/* ------------------------------------------------------------------ Tax (P07 IN.TDS, tax year 2026-27) */

export type Regime = 'new' | 'old';

export interface Slab {
  upTo: number | null; // null = no upper bound
  rate: number; // percent
}

/** P07 `IN.TDS` law version shown on every tax figure. */
export const TDS_LAW_VERSION = 'IN.TDS 2025 Act · v2026-04';

export const SLABS: Record<Regime, Slab[]> = {
  new: [
    { upTo: 400_000, rate: 0 },
    { upTo: 800_000, rate: 5 },
    { upTo: 1_200_000, rate: 10 },
    { upTo: 1_600_000, rate: 15 },
    { upTo: 2_000_000, rate: 20 },
    { upTo: 2_400_000, rate: 25 },
    { upTo: null, rate: 30 },
  ],
  old: [
    { upTo: 250_000, rate: 0 },
    { upTo: 500_000, rate: 5 },
    { upTo: 1_000_000, rate: 20 },
    { upTo: null, rate: 30 },
  ],
};

export const STANDARD_DEDUCTION: Record<Regime, number> = { new: 75_000, old: 50_000 };
/** Rebate: taxable income up to the limit pays no tax (max rebate), with marginal relief above it in the new regime. */
export const REBATE: Record<Regime, { limit: number; max: number }> = {
  new: { limit: 1_200_000, max: 60_000 },
  old: { limit: 500_000, max: 12_500 },
};
export const CESS_RATE = 4;

/** Tax on a taxable income by slabs (no rebate, no cess). */
export function slabTax(taxable: number, slabs: Slab[]): number {
  let tax = 0;
  let floor = 0;
  for (const s of slabs) {
    const top = s.upTo ?? Infinity;
    if (taxable > floor) tax += ((Math.min(taxable, top) - floor) * s.rate) / 100;
    floor = top;
    if (taxable <= top) break;
  }
  return Math.round(tax);
}

export interface Deductions {
  /** 80C-equivalent (PF, ELSS, life insurance, tuition), capped at ₹1,50,000. */
  sec80c: number;
  /** Health insurance, self + parents. */
  sec80d: number;
  /** Own NPS contribution, capped at ₹50,000. */
  nps: number;
  /** Home-loan interest on a self-occupied house, capped at ₹2,00,000. */
  homeLoanInterest: number;
  /** HRA exemption already computed month by month (YX-TAX-04). */
  hraExemption: number;
  /** Employer NPS, allowed in both regimes up to 10 % of basic (old) or 14 % (new) when `basic` is given. */
  employerNps: number;
  /** Annual basic (+ DA), for the employer NPS cap. */
  basic?: number;
  /** Professional tax paid in the year; deductible in the old regime only. */
  professionalTax?: number;
}

export const NO_DEDUCTIONS: Deductions = { sec80c: 0, sec80d: 0, nps: 0, homeLoanInterest: 0, hraExemption: 0, employerNps: 0 };

export const DEDUCTION_CAPS = { sec80c: 150_000, sec80d: 75_000, nps: 50_000, homeLoanInterest: 200_000 };

export interface TaxResult {
  regime: Regime;
  gross: number;
  standardDeduction: number;
  deductions: number;
  taxable: number;
  slabTax: number;
  rebate: number;
  cess: number;
  total: number;
}

/** Annual tax under one regime (YX-TAX-06: one function for the breakup and the deduction). */
export function computeTax(gross: number, regime: Regime, d: Deductions = NO_DEDUCTIONS, resident = true): TaxResult {
  const std = STANDARD_DEDUCTION[regime];
  const employerNps = d.basic != null ? Math.min(d.employerNps, Math.round(d.basic * (regime === 'old' ? 0.1 : 0.14))) : d.employerNps;
  const ded =
    regime === 'old'
      ? Math.min(d.sec80c, DEDUCTION_CAPS.sec80c) +
        Math.min(d.sec80d, DEDUCTION_CAPS.sec80d) +
        Math.min(d.nps, DEDUCTION_CAPS.nps) +
        Math.min(d.homeLoanInterest, DEDUCTION_CAPS.homeLoanInterest) +
        d.hraExemption +
        employerNps +
        (d.professionalTax ?? 0)
      : employerNps;
  const taxable = Math.max(0, gross - std - ded);
  const base = slabTax(taxable, SLABS[regime]);
  const r = REBATE[regime];
  let rebate = 0;
  if (resident) {
    if (taxable <= r.limit) rebate = Math.min(base, r.max);
    else if (regime === 'new') rebate = Math.max(0, base - (taxable - r.limit)); // marginal relief
  }
  const afterRebate = base - rebate;
  const cess = Math.round((afterRebate * CESS_RATE) / 100);
  return { regime, gross, standardDeduction: std, deductions: ded, taxable, slabTax: base, rebate, cess, total: afterRebate + cess };
}

/** Both regimes side by side; the tool never picks one (YX-AST-12). `lower` is only a fact to show. */
export function compareRegimes(gross: number, d: Deductions, resident = true) {
  const n = computeTax(gross, 'new', d, resident);
  const o = computeTax(gross, 'old', d, resident);
  const lower: Regime | 'same' = n.total === o.total ? 'same' : n.total < o.total ? 'new' : 'old';
  return { new: n, old: o, lower, difference: Math.abs(n.total - o.total) };
}

/** YX-TAX-02: monthly TDS = (projected annual tax − tax already deducted) ÷ remaining periods. */
export function monthlyTds(annualTax: number, deducted: number, remainingPeriods: number): number {
  if (remainingPeriods <= 0) return 0;
  return Math.max(0, Math.round((annualTax - deducted) / remainingPeriods));
}

/** YX-TAX-10: no or inoperative PAN → higher of 20 % or the slab rate. */
export function noPanTds(amount: number, slabRatePct: number): number {
  return Math.round((amount * Math.max(20, slabRatePct)) / 100);
}

/** YX-TAX-04: HRA exemption for one month = least of HRA received, rent − 10 % of basic, 50 % (metro) or 40 % of basic. */
export function hraExemptionMonth(hra: number, rent: number, basic: number, metro: boolean): number {
  return Math.max(0, Math.round(Math.min(hra, rent - basic * 0.1, basic * (metro ? 0.5 : 0.4))));
}

/* ------------------------------------------------------------------ Statutory (P07 starter values) */

export const PF_WAGE_CEILING = 15_000;
export const ESI_CEILING = 21_000;
export const ESI_CEILING_PWD = 25_000;

/** YX-PAY-17: employee 12 %; employer EPS 8.33 % on the capped wage, EPF = employer 12 % − EPS. */
export function pfContribution(pfWage: number, opts: { restrictToCeiling?: boolean } = {}) {
  const wage = opts.restrictToCeiling ? Math.min(pfWage, PF_WAGE_CEILING) : pfWage;
  const employee = Math.round(wage * 0.12);
  const eps = Math.round(Math.min(pfWage, PF_WAGE_CEILING) * 0.0833);
  const employerTotal = Math.round(wage * 0.12);
  return { employee, eps, epf: employerTotal - eps, edli: Math.round(Math.min(pfWage, PF_WAGE_CEILING) * 0.005) };
}

/** YX-PAY-18 / YX-STAT-30: ESI only at or below the ceiling; amounts rounded up to the next rupee. */
export function esiContribution(gross: number, pwd = false) {
  const covered = gross <= (pwd ? ESI_CEILING_PWD : ESI_CEILING);
  if (!covered) return { covered, employee: 0, employer: 0 };
  return { covered, employee: Math.ceil(gross * 0.0075), employer: Math.ceil(gross * 0.0325) };
}

/** YX-PAY-47: Code wages = basic + DA + retaining; if exclusions exceed 50 % of remuneration, the excess is added back. */
export function codeWageAddBack(wageComponents: number, totalRemuneration: number) {
  const exclusions = totalRemuneration - wageComponents;
  const addBack = Math.max(0, exclusions - totalRemuneration / 2);
  return { addBack, codeWage: wageComponents + addBack };
}

/** YX-PAY-22: minimum = max(state rate for zone and skill, national floor wage). */
export function minimumWageCheck(monthlyWage: number, stateMinimum: number, floorWage: number) {
  const applicable = Math.max(stateMinimum, floorWage);
  return { applicable, below: monthlyWage < applicable, shortfall: Math.max(0, applicable - monthlyWage), basis: stateMinimum >= floorWage ? 'state' : 'floor' } as const;
}

/* ------------------------------------------------------------------ Run maths */

/** YX-PAY-02: amount × payable days ÷ period days, never prorated twice. */
export function prorate(amount: number, payableDays: number, periodDays: number): number {
  if (periodDays <= 0) return 0;
  return Math.round((amount * Math.min(payableDays, periodDays)) / periodDays);
}

/** YX-PAY-06: change against last period, and whether it must be acknowledged. */
export function variance(current: number, previous: number, thresholdPct = 10, componentChange = false) {
  const diff = current - previous;
  const pct = previous === 0 ? (current === 0 ? 0 : 100) : (diff / previous) * 100;
  return { diff, pct: Math.round(pct * 10) / 10, flagged: componentChange || Math.abs(pct) > thresholdPct };
}

export type DeductionKind = 'statutory' | 'court' | 'ewa' | 'loan' | 'advance' | 'carry' | 'other';
export interface DeductionLine {
  id: string;
  label: string;
  kind: DeductionKind;
  amount: number;
  /** Earlier order date wins among court orders. */
  priority?: number;
}

const ORDER: DeductionKind[] = ['statutory', 'court', 'ewa', 'loan', 'advance', 'carry', 'other'];

/**
 * YX-PAY-11/29/32/41: statutory first, then court orders, EWA recovery, loans, advances, carry-forwards.
 * Total deductions stay within capPct of wages and above the protected net; lower-priority lines are deferred.
 */
export function applyDeductionCap(wages: number, lines: DeductionLine[], capPct = 50, protectedNet = 0) {
  const sorted = [...lines].sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) || (a.priority ?? 0) - (b.priority ?? 0));
  const cap = Math.min((wages * capPct) / 100, Math.max(0, wages - protectedNet));
  let used = 0;
  const applied: (DeductionLine & { deducted: number; deferred: number })[] = [];
  for (const l of sorted) {
    const room = l.kind === 'statutory' ? l.amount : Math.max(0, Math.min(l.amount, cap - used));
    used += room;
    applied.push({ ...l, deducted: Math.round(room), deferred: Math.round(l.amount - room) });
  }
  const total = applied.reduce((a, l) => a + l.deducted, 0);
  return { cap: Math.round(cap), lines: applied, total, net: wages - total, deferred: applied.reduce((a, l) => a + l.deferred, 0) };
}

/** YX-PAY-29: a negative net is paid as zero; the shortfall becomes a carry-forward. */
export function settleNet(net: number) {
  return net < 0 ? { paid: 0, carryForward: -net } : { paid: net, carryForward: 0 };
}

/* ------------------------------------------------------------------ Earned wage access (YX-PAY-40) */

export interface EwaPolicy {
  on: boolean;
  pct: number;
  min: number;
  max: number;
  drawsPerPeriod: number;
  blackoutDays: number;
  fee: number;
  feePayer: 'employee' | 'employer' | 'split';
}

export const EWA_STARTER: EwaPolicy = { on: true, pct: 50, min: 500, max: 25_000, drawsPerPeriod: 3, blackoutDays: 3, fee: 49, feePayer: 'employee' };

export interface EwaInput {
  expectedNet: number;
  periodDays: number;
  daysEarned: number;
  drawnThisPeriod: number;
  drawsThisPeriod: number;
  dueDeductions: number;
  daysToCutOff: number;
  onNotice?: boolean;
  onHold?: boolean;
  confirmed?: boolean;
}

export function ewaAvailable(p: EwaPolicy, i: EwaInput): { available: number; earnedToDate: number; reason: string | null } {
  const earnedToDate = Math.max(0, Math.round((i.expectedNet / i.periodDays) * i.daysEarned - i.drawnThisPeriod - i.dueDeductions));
  const refuse = (reason: string) => ({ available: 0, earnedToDate, reason });
  if (!p.on) return refuse('Earned wage access is off for your pay group.');
  if (i.onHold) return refuse('Not available while your salary is on hold.');
  if (i.onNotice) return refuse('Not available while you are serving notice.');
  if (i.confirmed === false) return refuse('Available after your probation is confirmed.');
  if (i.drawsThisPeriod >= p.drawsPerPeriod) return refuse(`You have used all ${p.drawsPerPeriod} draws for this pay period.`);
  if (i.daysToCutOff <= p.blackoutDays) return refuse(`Not available in the ${p.blackoutDays} days before payroll cut-off. Try again after payday.`);
  const avail = Math.min(p.max, Math.floor(((earnedToDate * p.pct) / 100) / 100) * 100);
  if (avail < p.min) return refuse(`The available amount is below the minimum draw of ${formatINR(p.min)}.`);
  return { available: avail, earnedToDate, reason: null };
}

/* ------------------------------------------------------------------ Loans (M03 Q4) */

export interface EmiRow {
  no: number;
  month: string;
  emi: number;
  principal: number;
  interest: number;
  balance: number;
  status: 'paid' | 'due' | 'paused' | 'scheduled';
}

/** Reducing-balance EMI; interest-free when rate is 0. */
export function emiAmount(principal: number, annualRatePct: number, months: number): number {
  if (months <= 0) return principal;
  if (annualRatePct === 0) return Math.ceil(principal / months);
  const r = annualRatePct / 1200;
  return Math.round((principal * r * (1 + r) ** months) / ((1 + r) ** months - 1));
}

export function emiSchedule(principal: number, annualRatePct: number, months: number, startMonth: number, startYear: number, paidCount = 0, pausedAt: number[] = []): EmiRow[] {
  const emi = emiAmount(principal, annualRatePct, months);
  const rows: EmiRow[] = [];
  let bal = principal;
  let m = startMonth;
  let y = startYear;
  let no = 1;
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  while (bal > 0 && rows.length < months + pausedAt.length) {
    const label = `${MON[m]} ${y}`;
    const interest = Math.round((bal * annualRatePct) / 1200);
    if (pausedAt.includes(rows.length)) {
      // Interest keeps running in a paused month and is added to the balance.
      bal += interest;
      rows.push({ no: rows.length + 1, month: label, emi: 0, principal: 0, interest, balance: bal, status: 'paused' });
    } else {
      // The last instalment clears whatever rounding (or a pause) left on the balance.
      const principalPart = no === months ? bal : Math.min(bal, emi - interest);
      bal = Math.max(0, bal - principalPart);
      rows.push({ no: rows.length + 1, month: label, emi: principalPart + interest, principal: principalPart, interest, balance: bal, status: no <= paidCount ? 'paid' : no === paidCount + 1 ? 'due' : 'scheduled' });
      no++;
    }
    m++;
    if (m > 11) {
      m = 0;
      y++;
    }
  }
  return rows;
}

/* ------------------------------------------------------------------ Gratuity, bonus, special pay */

export const GRATUITY_CAP = 2_000_000;

/** YX-PAY-15: last wage × 15/26 × years; final part-year of 6 months or more rounds up; fixed-term pro-rata after 1 year. */
export function gratuity(lastWage: number, serviceMonths: number, fixedTerm = false) {
  const years = Math.floor(serviceMonths / 12) + (serviceMonths % 12 >= 6 ? 1 : 0);
  const eligible = fixedTerm ? serviceMonths >= 12 : serviceMonths >= 60;
  const serviceYears = fixedTerm ? serviceMonths / 12 : years;
  const amount = Math.min(GRATUITY_CAP, Math.round((lastWage * 15 * serviceYears) / 26));
  return { eligible, years: fixedTerm ? Math.round(serviceYears * 100) / 100 : years, amount: eligible ? amount : 0 };
}

export const BONUS_ELIGIBILITY_WAGE = 21_000;
/** YX-PAY-16: bonus on min(wage, max(₹7,000, minimum wage)) × months × %. */
export function statutoryBonus(monthlyWage: number, months: number, pct: number, minimumWage: number) {
  if (monthlyWage > BONUS_ELIGIBILITY_WAGE) return { eligible: false, base: 0, amount: 0 };
  const base = Math.min(monthlyWage, Math.max(7_000, minimumWage));
  return { eligible: true, base, amount: Math.round((base * months * pct) / 100) };
}

/** YX-PAY-59: piece-rate earnings topped up to the time-rate minimum for days worked. */
export function pieceRatePay(outputs: { qty: number; rate: number }[], minimumForDays: number) {
  const earned = Math.round(outputs.reduce((a, o) => a + o.qty * o.rate, 0));
  return { earned, topUp: Math.max(0, minimumForDays - earned), total: Math.max(earned, minimumForDays) };
}

/** YX-PAY-61: split a pool by shares (points, shifts or hours); remainder rupees go to the largest shares first. */
export function splitPool(pool: number, shares: number[]): number[] {
  const total = shares.reduce((a, s) => a + s, 0);
  if (total === 0) return shares.map(() => 0);
  const raw = shares.map((s) => (pool * s) / total);
  const out = raw.map(Math.floor);
  let left = pool - out.reduce((a, v) => a + v, 0);
  const order = raw.map((v, i) => [v - Math.floor(v), i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) {
    if (left <= 0) break;
    out[i]++;
    left--;
  }
  return out;
}

/** YX-PAY-62: standby per slot + max(actual, minimum) × hourly rate × multiplier for a call-out. */
export function onCallPay(standby: number, actualHours: number, minimumHours: number, hourlyRate: number, multiplier: number) {
  const paidHours = actualHours > 0 ? Math.max(actualHours, minimumHours) : 0;
  return { paidHours, callOut: Math.round(paidHours * hourlyRate * multiplier), total: standby + Math.round(paidHours * hourlyRate * multiplier) };
}

/** YX-PAY-60: tiered commission with an accelerator above 100 % of quota. */
export interface CommissionTier {
  fromPct: number;
  ratePct: number;
}
export function commission(achieved: number, quota: number, tiers: CommissionTier[], cap?: number) {
  const pct = quota > 0 ? (achieved / quota) * 100 : 0;
  let amount = 0;
  const sorted = [...tiers].sort((a, b) => a.fromPct - b.fromPct);
  sorted.forEach((t, i) => {
    const next = sorted[i + 1]?.fromPct ?? Infinity;
    if (pct > t.fromPct) {
      const band = ((Math.min(pct, next) - t.fromPct) / 100) * quota;
      amount += (band * t.ratePct) / 100;
    }
  });
  const rounded = Math.round(amount);
  return { attainment: Math.round(pct), amount: cap != null ? Math.min(cap, rounded) : rounded, capped: cap != null && rounded > cap };
}

/** YX-PAY-52: arrears per month = corrected − as-paid; a month with no base blocks approval until HR confirms it. */
export interface ArrearMonth {
  month: string;
  corrected: number;
  asPaid: number | null;
  source: 'run' | 'import' | 'confirmed' | 'missing';
}
export function arrearsTotal(months: ArrearMonth[]) {
  const missing = months.filter((m) => m.asPaid == null).map((m) => m.month);
  const total = months.reduce((a, m) => a + (m.asPaid == null ? 0 : m.corrected - m.asPaid), 0);
  return { total, missing, canApprove: missing.length === 0 };
}

/** YX-PAY-49: retrenchment compensation = 15 days' average pay × completed years. */
export function retrenchmentCompensation(monthlyPay: number, completedYears: number, dayBasis = 26) {
  return Math.round((monthlyPay / dayBasis) * 15 * completedYears);
}

/** APX-D §6.4: the typed phrase must match exactly (entity + period in capitals). */
export function confirmPhraseMatches(typed: string, phrase: string) {
  return typed.trim() === phrase;
}

/** Salary optimiser (YX-AST-13): check a proposed split against law and company rules. */
export interface SplitOption {
  id: string;
  name: string;
  basic: number;
  hra: number;
  special: number;
  reimbursements: number;
  employerNps: number;
}
export function checkSplit(o: SplitOption, stateMinimum: number) {
  const gross = o.basic + o.hra + o.special + o.reimbursements;
  const { addBack } = codeWageAddBack(o.basic, gross);
  const issues: string[] = [];
  if (addBack > 0) issues.push(`Creates a Code wage add-back of ${formatINR(addBack)} a month`);
  if (o.basic < stateMinimum) issues.push('Basic is below the state minimum wage');
  return { gross, addBack, ok: issues.length === 0, issues };
}
