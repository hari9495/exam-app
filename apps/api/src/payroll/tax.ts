import { Prisma } from '@prisma/client';
import { RuleSet, StatutoryError, hraExempt, inForce, taxDeduction, tds } from '../statutory/evaluator';

// Income tax on salary (M03-BUILD-DESIGN §8.5, PAY-5.02 … 5.07): one pure function makes both the employee's tax sheet
// and the TDS on the payslip (YX-TAX-06). Annual tax on the projected year's income, less tax already deducted (here and
// by earlier employers or entities), spread over the pay periods left (YX-TAX-02). Before the proof cut-off declarations
// count; after it only verified amounts, so any extra tax is spread over what is left (YX-TAX-03). HRA month by month
// (YX-TAX-04). No or inoperative PAN: never a block, the higher of the slab tax and the no-PAN rate (YX-TAX-10).

export const TAX_CALC_VERSION = '5e.1';
const D = (x: Prisma.Decimal.Value) => new Prisma.Decimal(x);
const ZERO = D(0);
const r0 = (x: Prisma.Decimal) => x.toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);
const sum = (xs: Prisma.Decimal.Value[]) => xs.reduce<Prisma.Decimal>((t, x) => t.add(x), ZERO);

export type LawVersion = 'IT-1961' | 'IT-2025';
/** The law a tax year is under (YX-TAX-19): the Income-tax Act 2025 from 1 April 2026. */
export const lawVersionFor = (taxYear: string): LawVersion => (Number(taxYear.slice(0, 4)) >= 2026 ? 'IT-2025' : 'IT-1961');
/** The tax year (YYYY-YY) of a month (YYYY-MM). */
export const taxYearOf = (month: string) => {
  const y = Number(month.slice(0, 4)) - (Number(month.slice(5, 7)) < 4 ? 1 : 0);
  return `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
};
/** The forms a law version files and issues: Form 16 and 24Q until March 2026, Form 130 and Form 138 after. */
export const taxForms = (law: LawVersion) => (law === 'IT-2025' ? { certificate: 'form130' as const, quarterlyReturn: 'Form 138' } : { certificate: 'form16' as const, quarterlyReturn: '24Q' });

export interface TaxMonth {
  month: string;
  basic: string;
  hra: string;
}
export interface TaxInputs {
  taxYear: string;
  lawVersion: LawVersion;
  regime: 'new' | 'old';
  age: number;
  resident: boolean;
  pan: 'ok' | 'missing' | 'inoperative';
  /** declared: before the proof cut-off; verified: after it (only verified proof amounts are in `deductions`). */
  proofStage: 'declared' | 'verified';
  /** Approved payslips of this tax year before this month, in this company (every entity and employment of the person). */
  past: { gross: string; tds: string; pt: string; months: TaxMonth[]; otherEntities: string[] };
  /** Form 12B and opening balances: income and tax from earlier employers (or the old payroll) this tax year. */
  previous: { gross: string; exemptions: string; tds: string; pt: string };
  otherIncome: string;
  /** Perquisites for the tax year (Form 12BA). */
  perquisites: string;
  /** Whole months after this one, to the tax year's end or the last day of work. */
  futureMonths: number;
  /** One future month at the current pay (professional tax: this month's when not given). */
  future: { gross: string; basic: string; hra: string; pt?: string | null };
  deductions: { key: string; amount: string }[];
  rent: { monthly: string; from: string; to: string; metro: boolean } | null;
}
export interface ThisMonth {
  month: string;
  gross: string;
  basic: string;
  hra: string;
  pt: string;
}
export interface TaxProjection {
  calcVersion: string;
  taxYear: string;
  lawVersion: LawVersion;
  regime: 'new' | 'old';
  income: { salary: string; previousEmployers: string; perquisites: string; other: string; total: string };
  exemptions: { standardDeduction: string; hra: string; professionalTax: string; previousEmployers: string };
  deductions: { key: string; claimed: string; allowed: string }[];
  taxable: string;
  tax: { slab: string; rebate: string; surcharge: string; total: string; noPanApplied: boolean };
  alreadyDeducted: string;
  remainingPeriods: number;
  monthTds: string;
  notes: string[];
  ruleVersions: Record<string, string>;
  /** This month's figures as used (the regime comparison re-runs the function on them). */
  thisMonth: ThisMonth;
}

const nextMonth = (m: string) => {
  const d = new Date(`${m}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 7);
};

export function projectTax(t: TaxInputs, rules: RuleSet[], m: ThisMonth): TaxProjection {
  const on = `${m.month}-01`;
  const tdsRs = inForce(rules, 'IN.TDS', ['IN'], on);
  if (!tdsRs) throw new StatutoryError(`No income-tax rules are in force on ${on}.`);
  const dedRs = inForce(rules, 'IN.TAXDED', ['IN'], on);
  if (t.regime === 'old' && !dedRs) throw new StatutoryError(`No tax deduction rules are in force on ${on}.`);
  const regime = (tdsRs.values.regimes as Record<string, { standardDeduction: string }>)[t.regime];
  const notes: string[] = [];
  const n = t.futureMonths;

  const salary = sum([t.past.gross, m.gross, D(t.future.gross).mul(n)]);
  const total = sum([salary, t.previous.gross, t.perquisites, t.otherIncome]);
  const standard = Prisma.Decimal.min(D(regime.standardDeduction), salary.add(t.previous.gross));

  // HRA, month by month over the months of employment and rent (old regime only).
  let hra = ZERO;
  if (t.regime === 'old' && t.rent && dedRs) {
    const months: TaxMonth[] = [...t.past.months, { month: m.month, basic: m.basic, hra: m.hra }];
    let f = m.month;
    for (let i = 0; i < n; i++) months.push({ month: (f = nextMonth(f)), basic: t.future.basic, hra: t.future.hra });
    for (const x of months) if (x.month >= t.rent.from && x.month <= t.rent.to) hra = hra.add(hraExempt(dedRs, { hra: x.hra, basic: x.basic, rent: t.rent.monthly, metro: t.rent.metro }).exempt);
    notes.push(`HRA exemption worked out for each month you paid rent (${t.rent.from} to ${t.rent.to}).`);
  }
  const pt = t.regime === 'old' ? sum([t.past.pt, m.pt, D(t.future.pt ?? m.pt).mul(n), t.previous.pt]) : ZERO;
  const prevExempt = t.regime === 'old' ? D(t.previous.exemptions) : ZERO;
  const deductions = t.deductions.map((x) => {
    const r = dedRs ? taxDeduction(dedRs, { key: x.key, amount: x.amount, regime: t.regime }) : { allowed: ZERO, known: false, allowedInRegime: false };
    if (!r.allowedInRegime && D(x.amount).gt(0)) notes.push(`${x.key} is not allowed in the ${t.regime} regime.`);
    return { key: x.key, claimed: D(x.amount).toFixed(2), allowed: D(r.allowed).toFixed(2) };
  });
  const via = sum(deductions.map((x) => x.allowed));
  // Taxable income rounded to the nearest ten rupees.
  const taxable = Prisma.Decimal.max(ZERO, total.sub(standard).sub(hra).sub(pt).sub(prevExempt).sub(via)).div(10).toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP).mul(10);
  const r = tds(tdsRs, { taxable, regime: t.regime, age: t.age, resident: t.resident });
  let annual = D(r.tax);
  const noPan = t.pan !== 'ok';
  if (noPan) {
    const floor = r0(taxable.mul(D(String(tdsRs.values.noPanRate))));
    if (floor.gt(annual)) annual = floor;
    notes.push(t.pan === 'missing' ? 'No PAN on file: tax is the higher of the slab tax and the no-PAN rate.' : 'Your PAN is inoperative: tax is the higher of the slab tax and the no-PAN rate.');
  }
  if (!t.resident) notes.push('Non-resident: no rebate.');
  if (t.past.otherEntities.length) notes.push('Pay from another entity of the company this year is counted.');
  if (t.proofStage === 'verified') notes.push('After the proof cut-off only verified proofs count; any extra tax is spread over the months left.');
  const deducted = D(t.past.tds).add(t.previous.tds);
  const remaining = 1 + n;
  const monthTds = Prisma.Decimal.max(ZERO, r0(annual.sub(deducted).div(remaining)));
  const ruleVersions: Record<string, string> = { [`${tdsRs.statute}|${tdsRs.jurisdiction}`]: tdsRs.version, ...(dedRs ? { [`${dedRs.statute}|${dedRs.jurisdiction}`]: dedRs.version } : {}) };
  return {
    calcVersion: TAX_CALC_VERSION,
    taxYear: t.taxYear,
    lawVersion: t.lawVersion,
    regime: t.regime,
    income: { salary: salary.toFixed(2), previousEmployers: D(t.previous.gross).toFixed(2), perquisites: D(t.perquisites).toFixed(2), other: D(t.otherIncome).toFixed(2), total: total.toFixed(2) },
    exemptions: { standardDeduction: standard.toFixed(2), hra: hra.toFixed(2), professionalTax: pt.toFixed(2), previousEmployers: prevExempt.toFixed(2) },
    deductions,
    taxable: taxable.toFixed(2),
    tax: { slab: D(r.slabTax).toFixed(2), rebate: D(r.rebate).toFixed(2), surcharge: D(r.surcharge).toFixed(2), total: annual.toFixed(2), noPanApplied: noPan && !annual.eq(D(r.tax)) },
    alreadyDeducted: deducted.toFixed(2),
    remainingPeriods: remaining,
    monthTds: monthTds.toFixed(2),
    notes,
    ruleVersions,
    thisMonth: m,
  };
}
