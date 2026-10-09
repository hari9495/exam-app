import { Prisma } from '@prisma/client';
import { rootProblems } from '../documents/cca-roots';

// P07 statutory evaluator and calculators (M03-BUILD-DESIGN §8.2, PAY-2.02). Pure functions over a rule set's typed
// payload: no database, no clock, no country figures (they are all in the pack, statutory/packs/*.json). Money is
// Decimal; every result carries its citation {statute, jurisdiction, version, verify} (YX-STAT-05).

const D = (x: Prisma.Decimal.Value) => new Prisma.Decimal(x);
const ZERO = D(0);

export interface RuleSet {
  statute: string;
  jurisdiction: string;
  version: string;
  validFrom: string;
  validTo?: string | null;
  verify: boolean;
  values: Record<string, unknown> & { kind: string };
}
export interface Citation {
  statute: string;
  jurisdiction: string;
  version: string;
  verify: boolean;
}
export const cite = (rs: RuleSet): Citation => ({ statute: rs.statute, jurisdiction: rs.jurisdiction, version: rs.version, verify: rs.verify });

export class StatutoryError extends Error {}

const round = (x: Prisma.Decimal, how: string, step = '1') => {
  const s = D(step);
  const q = x.div(s);
  const r = how === 'up' ? q.ceil() : how === 'down' ? q.floor() : q.toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);
  return r.mul(s);
};
const money = (x: Prisma.Decimal) => x.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
const out = (x: Prisma.Decimal) => (x.isInteger() ? x.toFixed(0) : x.toFixed(2));

/** The rule set in force on a date (latest valid_from on or before it, not ended). */
export function inForce(sets: readonly RuleSet[], statute: string, jurisdictions: readonly string[], on: string): RuleSet | null {
  for (const j of jurisdictions) {
    const hit = sets.filter((s) => s.statute === statute && s.jurisdiction === j && s.validFrom <= on && (!s.validTo || s.validTo >= on)).sort((a, b) => b.validFrom.localeCompare(a.validFrom))[0];
    if (hit) return hit;
  }
  return null;
}

type V = Record<string, unknown>;
const need = (rs: RuleSet, kind: string) => {
  if (rs.values.kind !== kind) throw new StatutoryError(`${rs.statute} ${rs.jurisdiction} ${rs.version} is not a ${kind} rule set`);
  return rs.values as V;
};

// ------------------------------------------------------------------------------------------ calculators

/** PF: employee share; employer share split into EPS (capped, none from the stop age) and EPF; EDLI. */
export function pf(rs: RuleSet, i: { pfWage: Prisma.Decimal.Value; onActualWage: boolean; age: number }) {
  const v = need(rs, 'pf');
  const wage = D(i.pfWage);
  const base = i.onActualWage ? wage : Prisma.Decimal.min(wage, D(v.wageCeiling as string));
  const how = String(v.rounding);
  const employee = round(base.mul(D(v.employeeRate as string)), how);
  const employer = round(base.mul(D(v.employerRate as string)), how);
  const eps = i.age >= Number(v.epsStopAge) ? ZERO : Prisma.Decimal.min(round(Prisma.Decimal.min(wage, D(v.epsCeiling as string)).mul(D(v.epsRate as string)), how), employer);
  const edli = round(Prisma.Decimal.min(wage, D(v.edliCeiling as string)).mul(D(v.edliRate as string)), how);
  return { employee, eps, epf: employer.sub(eps), edli, citation: cite(rs) };
}

/** ESI: covered for the whole contribution period once covered at its start; amounts rounded up to the rupee. */
export function esi(rs: RuleSet, i: { esiWage: Prisma.Decimal.Value; covered: boolean }) {
  const v = need(rs, 'esi');
  if (!i.covered) return { employee: ZERO, employer: ZERO, citation: cite(rs) };
  const wage = D(i.esiWage);
  return { employee: round(wage.mul(D(v.employeeRate as string)), 'up'), employer: round(wage.mul(D(v.employerRate as string)), 'up'), citation: cite(rs) };
}

/** Is a wage within the ESI ceiling (the PwD ceiling with consent)? Decided at the start of a contribution period. */
export function esiCovered(rs: RuleSet, wage: Prisma.Decimal.Value, pwd = false) {
  const v = need(rs, 'esi');
  return D(wage).lte(D((pwd ? v.pwdWageCeiling : v.wageCeiling) as string));
}

interface Slab {
  from: string;
  to: string | null;
  amount: string;
  gender?: string;
  months?: Record<string, string>;
}
/** PT for a month (monthly basis) or a deduction month of a half-year (half-yearly basis), by state slabs. */
export function pt(rs: RuleSet, i: { ptWage: Prisma.Decimal.Value; month: number; gender?: string | null }) {
  const v = need(rs, 'pt');
  const months = v.deductMonths as number[] | undefined;
  if (months && !months.includes(i.month)) return { amount: ZERO, citation: cite(rs) };
  const wage = D(i.ptWage);
  const slabs = (v.slabs as Slab[]).filter((s) => !s.gender || !i.gender || s.gender === i.gender).filter((s) => !s.gender || i.gender || s.gender === 'male');
  const s = slabs.find((x) => wage.gte(D(x.from)) && (x.to === null || wage.lte(D(x.to))));
  const amount = s ? D(s.months?.[String(i.month)] ?? s.amount) : ZERO;
  return { amount, citation: cite(rs) };
}

/** LWF in its deduction months. */
export function lwf(rs: RuleSet, i: { month: number }) {
  const v = need(rs, 'lwf');
  const due = (v.months as number[]).includes(i.month);
  return { employee: due ? D(v.employee as string) : ZERO, employer: due ? D(v.employer as string) : ZERO, citation: cite(rs) };
}

/** One row of a state minimum-wage table (amounts per month, as the notification prints them). */
export interface MinWageRate {
  zone: string;
  skill: string;
  description: string;
  basicMonthly: string;
  /** The VDA / DA for the period, or null when the notification leaves it to a separate order not loaded yet. */
  vdaMonthly: string | null;
  totalMonthly?: string;
}

/**
 * A state's table for one scheduled employment (founder decision 5b-D1, 9 Oct 2026): rates by zone and skill, its
 * notification, in force between the rule set's dates. Without a known skill the lowest class of the zone applies (every
 * worker gets at least that); without a zone, the lowest in the state.
 */
export function minWageTable(rs: RuleSet, i: { zone?: string | null; skill?: string | null }) {
  const v = need(rs, 'min_wage_table');
  const rates = (v.rates as MinWageRate[]).filter((r) => (!i.zone || r.zone === i.zone) && (!i.skill || r.skill === i.skill));
  if (!rates.length) throw new StatutoryError(`No ${rs.jurisdiction} rate for zone ${i.zone ?? 'any'} and skill ${i.skill ?? 'any'}`);
  const total = (r: MinWageRate) => D(r.basicMonthly).add(r.vdaMonthly ?? 0);
  const low = rates.reduce((a, b) => (total(b).lt(total(a)) ? b : a));
  return { monthly: total(low), basic: D(low.basicMonthly), vda: low.vdaMonthly === null ? null : D(low.vdaMonthly), daMissing: low.vdaMonthly === null, zone: low.zone, skill: low.skill, citation: cite(rs) };
}

/**
 * Minimum wage (YX-STAT-22): the state table's rate when one is in force for the place, never below the national floor.
 * A table whose DA is not loaded is compared on its basic and says so (daMissing).
 */
export function minWage(rs: RuleSet, i: { table?: RuleSet | null; zone?: string | null; skill?: string | null } = {}) {
  const v = need(rs, 'min_wage');
  const floorMonthly = D(v.floorDaily as string).mul(Number(v.monthDays));
  const st = i.table ? minWageTable(i.table, i) : null;
  const useState = !!st && st.monthly.gt(floorMonthly);
  const daily = useState ? st!.monthly.div(Number(i.table!.values.dailyDivisor ?? v.monthDays)).toDecimalPlaces(2) : D(v.floorDaily as string);
  return { daily, monthly: useState ? st!.monthly : floorMonthly, floorApplied: !useState, daMissing: !!st?.daMissing, state: st, citation: useState ? st!.citation : cite(rs) };
}

/** Subsistence allowance for days of suspension (PAY-3.13): a lower rate for the first days of the suspension, then higher. */
export function subsistence(rs: RuleSet, i: { dailyWage: Prisma.Decimal.Value; days: number; daysBefore: number }) {
  const v = need(rs, 'subsistence');
  const first = Math.max(0, Math.min(i.days, Number(v.firstDays) - i.daysBefore));
  const amount = money(D(i.dailyWage).mul(D(first).mul(D(v.firstRate as string)).add(D(i.days - first).mul(D(v.laterRate as string)))));
  return { amount, firstDays: first, laterDays: i.days - first, citation: cite(rs) };
}

/** Maternity benefit paid by the employer (PAY-3.14): the average daily wage for each day, when ESI does not cover her. */
export function maternity(rs: RuleSet, i: { averageDailyWage: Prisma.Decimal.Value; days: number; esiCovered: boolean }) {
  const v = need(rs, 'maternity');
  if (i.esiCovered) return { amount: ZERO, payer: 'esi', citation: cite(rs) };
  return { amount: money(D(i.averageDailyWage).mul(i.days).mul(D(v.rate as string))), payer: 'employer', citation: cite(rs) };
}

/** Injury pay for temporary disablement (PAY-3.14): half-monthly payments of a share of monthly wages, unless ESI covers it. */
export function injury(rs: RuleSet, i: { monthlyWage: Prisma.Decimal.Value; days: number; monthDays: number; esiCovered: boolean }) {
  const v = need(rs, 'injury');
  if (i.esiCovered) return { amount: ZERO, payer: 'esi', citation: cite(rs) };
  const perDay = D(i.monthlyWage).mul(D(v.halfMonthlyRate as string)).mul(2).div(i.monthDays);
  return { amount: money(perDay.mul(i.days)), payer: 'employer', citation: cite(rs) };
}

/** Is a root (by its SHA-256 fingerprint) in a trusted-roots rule set (5b-D3)? */
export function trustedRoot(rs: RuleSet, i: { sha256: string }) {
  const v = need(rs, 'trusted_roots');
  return { trusted: (v.roots as { sha256: string }[]).some((r) => r.sha256 === i.sha256), citation: cite(rs) };
}

/** The state table in force for a place and date (the employment's, when the company says which). */
export function minWageTableFor(sets: readonly RuleSet[], state: string, on: string, employment?: string | null): RuleSet | null {
  return sets.filter((s) => s.statute === 'IN.MW' && s.jurisdiction === state && s.values.kind === 'min_wage_table' && (!employment || s.values.employment === employment) && s.validFrom <= on && (!s.validTo || s.validTo >= on)).sort((a, b) => b.validFrom.localeCompare(a.validFrom))[0] ?? null;
}

/** Code wage (YX-PAY-47): exclusions above the limit of total pay are added back. */
export function codeWage(rs: RuleSet, i: { wageParts: Prisma.Decimal.Value; exclusions: Prisma.Decimal.Value }) {
  const v = need(rs, 'code_wage');
  const parts = D(i.wageParts);
  const excl = D(i.exclusions);
  const allowed = parts.add(excl).mul(D(v.exclusionLimit as string));
  const addBack = Prisma.Decimal.max(ZERO, excl.sub(allowed));
  return { codeWage: money(parts.add(addBack)), addBack: money(addBack), citation: cite(rs) };
}

export function deductionCap(rs: RuleSet, i: { wages: Prisma.Decimal.Value; coop: boolean }) {
  const v = need(rs, 'deduction_cap');
  return { cap: money(D(i.wages).mul(D((i.coop ? v.withCoopCap : v.cap) as string))), citation: cite(rs) };
}

/** Statutory bonus provision a month (eligibility and calculation ceilings; the rate the entity chose within the range). */
export function bonus(rs: RuleSet, i: { bonusWage: Prisma.Decimal.Value; rate: Prisma.Decimal.Value; minWageMonthly: Prisma.Decimal.Value }) {
  const v = need(rs, 'bonus');
  const rate = D(i.rate);
  if (rate.lt(D(v.minRate as string)) || rate.gt(D(v.maxRate as string))) throw new StatutoryError('The bonus rate is outside the range the law allows.');
  const wage = D(i.bonusWage);
  if (wage.gt(D(v.eligibilityWage as string))) return { eligible: false, monthly: ZERO, citation: cite(rs) };
  const ceiling = Prisma.Decimal.max(D(v.calculationCeiling as string), D(i.minWageMonthly));
  return { eligible: true, monthly: money(Prisma.Decimal.min(wage, ceiling).mul(rate)), citation: cite(rs) };
}

/** Gratuity provision a month: daysPerYear / monthDays of the monthly wage, spread over 12 months. */
export function gratuity(rs: RuleSet, i: { gratuityWage: Prisma.Decimal.Value }) {
  const v = need(rs, 'gratuity');
  return { monthly: money(D(i.gratuityWage).mul(Number(v.daysPerYear)).div(Number(v.monthDays)).div(12)), citation: cite(rs) };
}

interface TdsRegime {
  standardDeduction: string;
  rebate: { incomeUpTo: string; max: string };
  slabs: { upTo: string | null; rate: string }[];
  surcharge: { above: string; rate: string }[];
  seniorExemption?: string;
  superSeniorExemption?: string;
}
/** Annual tax on taxable income for a regime and age: slabs, rebate with marginal relief, surcharge, cess. */
export function tds(rs: RuleSet, i: { taxable: Prisma.Decimal.Value; regime: 'new' | 'old'; age: number }) {
  const v = need(rs, 'tds');
  const r = (v.regimes as Record<string, TdsRegime>)[i.regime];
  if (!r) throw new StatutoryError(`No ${i.regime} regime in ${rs.version}`);
  const income = D(i.taxable);
  const slabs = r.slabs.map((s) => ({ ...s }));
  // Older people's higher exemption (old regime): the first slab widens.
  if (i.regime === 'old' && i.age >= 60) slabs[0].upTo = i.age >= 80 ? (r.superSeniorExemption ?? slabs[0].upTo) : (r.seniorExemption ?? slabs[0].upTo);
  let slabTax = ZERO;
  let lower = ZERO;
  for (const s of slabs) {
    const upper = s.upTo === null ? income : Prisma.Decimal.min(income, D(s.upTo));
    if (upper.gt(lower)) slabTax = slabTax.add(upper.sub(lower).mul(D(s.rate)));
    if (s.upTo !== null) lower = Prisma.Decimal.max(lower, D(s.upTo));
    if (s.upTo !== null && income.lte(D(s.upTo))) break;
  }
  slabTax = round(slabTax, 'nearest');
  let rebate = ZERO;
  const limit = D(r.rebate.incomeUpTo);
  if (income.lte(limit)) rebate = Prisma.Decimal.min(slabTax, D(r.rebate.max));
  else if (i.regime === 'new' && slabTax.gt(income.sub(limit))) rebate = slabTax.sub(income.sub(limit)); // marginal relief
  const afterRebate = slabTax.sub(rebate);
  const sc = [...r.surcharge].reverse().find((x) => income.gt(D(x.above)));
  const surcharge = sc ? round(afterRebate.mul(D(sc.rate)), 'nearest') : ZERO;
  const tax = round(afterRebate.add(surcharge).mul(D(1).add(D(v.cess as string))), 'nearest');
  return { slabTax, rebate, surcharge, tax, citation: cite(rs) };
}

export function penalty(rs: RuleSet, i: { item: string; amount: Prisma.Decimal.Value; days?: number; months?: number }) {
  const v = need(rs, 'penalty');
  const rate = (v.items as Record<string, string>)[i.item];
  if (!rate) throw new StatutoryError(`Unknown penalty ${i.item}`);
  const base = D(i.amount).mul(D(rate));
  const amount = i.item.endsWith('_yearly') ? base.mul(i.days ?? 0).div(365) : i.item.endsWith('_monthly') ? base.mul(i.months ?? 0) : D(rate).mul(i.days ?? 0);
  return { amount: money(amount), citation: cite(rs) };
}

/** When a monthly return or deposit is due (YYYY-MM-DD) for a wage month. */
export function due(rs: RuleSet, i: { key: string; month: string }) {
  const v = need(rs, 'calendar');
  const item = (v.items as { key: string; dueDay: number; monthOffset: number; march?: { dueDay: number; monthOffset: number } }[]).find((x) => x.key === i.key);
  if (!item) throw new StatutoryError(`No due date for ${i.key}`);
  const rule = item.march && i.month.endsWith('-03') ? item.march : item;
  const d = new Date(`${i.month}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + rule.monthOffset);
  d.setUTCDate(rule.dueDay);
  return { due: d.toISOString().slice(0, 10), citation: cite(rs) };
}

/** Coverage: not covered, approaching, covered (sticky once covered where the law says so). */
export function coverage(rs: RuleSet, i: { statute: string; headcount: number; wasCovered: boolean }) {
  const v = need(rs, 'coverage');
  const item = (v.items as { statute: string; threshold: number; approachAt: number; sticky: boolean }[]).find((x) => x.statute === i.statute);
  if (!item) throw new StatutoryError(`No coverage rule for ${i.statute}`);
  const status = i.headcount >= item.threshold || (item.sticky && i.wasCovered) ? 'covered' : i.headcount >= item.approachAt ? 'approaching' : 'not_covered';
  return { status, threshold: item.threshold, sticky: item.sticky, citation: cite(rs) };
}

/** The constitutional ceiling on a state's professional tax (art. 276(2)). */
export function ptLimit(rs: RuleSet) {
  const v = need(rs, 'pt_limit');
  return { annualMax: D(v.annualMax as string), citation: cite(rs) };
}

/** Default applicability of a statute for an employment category (YX-ORG-20). */
export function empDefaults(rs: RuleSet, i: { category: string; statute: string }) {
  const v = need(rs, 'emp_defaults');
  const a = (v.categories as Record<string, Record<string, string>>)[i.category]?.[i.statute];
  if (!a) throw new StatutoryError(`No default for ${i.category} and ${i.statute}`);
  return { applicability: a as 'mandatory' | 'optional' | 'excluded' | 'by_wage', citation: cite(rs) };
}

// ------------------------------------------------------------------------------------------ publish checks and golden cases

/** Shape checks before a rule set is published (§8.1): slabs contiguous and not overlapping, PT cap, rates in range. */
export function checkShape(rs: RuleSet, limits: { ptAnnualMax?: string } = {}): string[] {
  const v = rs.values as V;
  const problems: string[] = [];
  const rate = (x: unknown, name: string) => {
    if (typeof x !== 'string' || !/^\d+(\.\d+)?$/.test(x) || D(x).gt(1)) problems.push(`${name} must be a rate between 0 and 1`);
  };
  if (rs.values.kind === 'pt') {
    const slabs = (v.slabs as Slab[]) ?? [];
    for (const g of [...new Set(slabs.map((s) => s.gender ?? ''))]) {
      const list = slabs.filter((s) => (s.gender ?? '') === g);
      list.forEach((s, i) => {
        if (i === 0 && !D(s.from).eq(0)) problems.push('The first slab must start at 0');
        if (i > 0) {
          const prev = list[i - 1];
          if (prev.to === null || D(s.from).lte(D(prev.to)) || D(s.from).sub(D(prev.to)).gt(1)) problems.push(`Slab ${i + 1} must start just after slab ${i}`);
        }
        if (s.to !== null && D(s.to).lt(D(s.from))) problems.push(`Slab ${i + 1} ends before it starts`);
      });
      if (list.length && list[list.length - 1].to !== null) problems.push('The last slab must be open-ended');
    }
    if (limits.ptAnnualMax && D(v.annualCap as string).gt(D(limits.ptAnnualMax))) problems.push(`Professional tax can never be more than ₹${limits.ptAnnualMax} a year`);
  }
  if (rs.values.kind === 'pf') ['employeeRate', 'employerRate', 'epsRate', 'edliRate', 'adminRate'].forEach((k) => rate(v[k], k));
  if (rs.values.kind === 'esi') ['employeeRate', 'employerRate'].forEach((k) => rate(v[k], k));
  if (rs.values.kind === 'tds') for (const r of Object.values(v.regimes as Record<string, TdsRegime>)) r.slabs.forEach((s, i) => rate(s.rate, `slab ${i + 1} rate`));
  if (rs.values.kind === 'min_wage_table') {
    const n = v.notification as Record<string, string> | undefined;
    if (!n?.number || !n?.date || !n?.url) problems.push('A minimum-wage table names its notification (number, date, official link)');
    if (typeof v.employment !== 'string' || !v.employment) problems.push('A minimum-wage table names its scheduled employment');
    const zones = new Set(((v.zones as { code: string }[]) ?? []).map((z) => z.code));
    const rates = (v.rates as MinWageRate[]) ?? [];
    if (!rates.length) problems.push('A minimum-wage table has at least one rate');
    const seen = new Set<string>();
    const money = (x: unknown) => typeof x === 'string' && /^\d{1,9}(\.\d{1,2})?$/.test(x);
    rates.forEach((r, i) => {
      const at = `Rate ${i + 1} (zone ${r.zone}, ${r.skill})`;
      if (!zones.has(r.zone)) problems.push(`${at}: zone not in the table's zone list`);
      if (seen.has(`${r.zone}|${r.skill}`)) problems.push(`${at}: listed twice`);
      seen.add(`${r.zone}|${r.skill}`);
      if (!money(r.basicMonthly) || (r.vdaMonthly !== null && !money(r.vdaMonthly))) problems.push(`${at}: amounts are rupees with up to 2 decimals`);
      else if (r.totalMonthly !== undefined && !D(r.basicMonthly).add(r.vdaMonthly ?? 0).eq(D(r.totalMonthly))) problems.push(`${at}: basic and VDA do not add up to the printed total`);
    });
  }
  if (rs.values.kind === 'trusted_roots') problems.push(...rootProblems(rs));
  if (rs.validTo && rs.validTo < rs.validFrom) problems.push('The rule set ends before it starts');
  return problems;
}

export interface GoldenCase {
  name: string;
  fn: string;
  input: Record<string, unknown>;
  expected: Record<string, unknown>;
}
const CALCULATORS: Record<string, (rs: RuleSet, input: never) => Record<string, unknown>> = { pf, esi, pt, lwf, min_wage: minWage, min_wage_table: minWageTable, trusted_roots: trustedRoot, subsistence, maternity, injury, code_wage: codeWage, deduction_cap: deductionCap, bonus, gratuity, tds, penalty, calendar: due, coverage, emp_defaults: empDefaults, pt_limit: ptLimit };

/** Runs one golden case; returns the fields that differ (empty when it passes). */
export function runGolden(rs: RuleSet, g: GoldenCase): string[] {
  const calc = CALCULATORS[g.fn];
  if (!calc) return [`unknown calculator ${g.fn}`];
  const got = calc(rs, g.input as never);
  return Object.entries(g.expected).flatMap(([k, want]) => {
    const v = got[k];
    const have = v instanceof Prisma.Decimal ? out(v) : v;
    const ok = v instanceof Prisma.Decimal ? D(String(want)).eq(v) : have === want;
    return ok ? [] : [`${g.name}: ${k} is ${String(have)}, expected ${String(want)}`];
  });
}
