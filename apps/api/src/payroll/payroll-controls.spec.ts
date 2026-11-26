import { readFileSync } from 'fs';
import { join } from 'path';
import type { RuleSet } from '../statutory/evaluator';
import { calculatePayslip } from './calc';
import { defaultDates } from './pay-dates';
import { RULES, snapshot } from './regression/fixtures';
import { projectTax, type TaxInputs } from './tax';

// Enterprise E5 payroll controls (answers 2656, 2657): a grossed-up one-time item reaches the person in full, a separate
// item is marked for its own bank line, and the pay group's default cut-off and release dates.
const pack = (f: string) => (JSON.parse(readFileSync(join(__dirname, '..', 'statutory', 'packs', f), 'utf8')) as { ruleSets: RuleSet[] }).ruleSets;
const TAX = [...RULES, ...pack('in-tax.json')];
const tax: TaxInputs = {
  taxYear: '2026-27',
  lawVersion: 'IT-2025',
  regime: 'new',
  age: 30,
  resident: true,
  pan: 'ok',
  proofStage: 'declared',
  past: { gross: '0', tds: '0', pt: '0', months: [], otherEntities: [] },
  previous: { gross: '0', exemptions: '0', tds: '0', pt: '0' },
  otherIncome: '0',
  perquisites: '0',
  futureMonths: 11,
  future: { gross: '150000', basic: '60000', hra: '30000', pt: '200' },
  deductions: [],
  rent: null,
};
const bonus = (o: { grossUp?: boolean; separate?: boolean } = {}) => ({ id: 'jb', code: 'bonus', amount: '100000', days: null, label: 'Joining bonus.', ...o });
const tdsTotal = (r: ReturnType<typeof calculatePayslip>) => r.lines.filter((l) => l.code === 'tds').reduce((t, l) => t + Number(l.amount), 0);
/** Deductions other than income tax (PF, ESI, PT, LWF may follow the item; gross-up covers income tax only). */
const otherDeductions = (r: ReturnType<typeof calculatePayslip>) => Number(r.deductions) - tdsTotal(r);

describe('E5 (O16): gross-up and paying separately', () => {
  const plain = calculatePayslip(snapshot({ tax }), TAX);

  it('a grossed-up item reaches the person in full: the company pays its tax, which is taxable too (positive)', () => {
    const r = calculatePayslip(snapshot({ tax, oneTime: [bonus({ grossUp: true })] }), TAX);
    // Every rupee of income tax on it is the company's: the person gets the item less only PF, ESI, PT or LWF it attracts.
    expect(Number(r.net) - Number(plain.net)).toBeCloseTo(100000 - (otherDeductions(r) - otherDeductions(plain)), 2);
    expect(tdsTotal(r) - Number(r.lines.find((l) => l.code === 'tax_paid_by_company')!.amount)).toBeCloseTo(tdsTotal(plain), 2);
    const paid = r.lines.find((l) => l.code === 'tax_paid_by_company')!;
    expect(Number(paid.amount)).toBeGreaterThan(0);
    // The tax deducted for it equals the tax paid by the company, and that is the extra tax on the item plus itself.
    expect(tdsTotal(r) - tdsTotal(plain)).toBeCloseTo(Number(paid.amount), 2);
    const month = { month: '2026-10', basic: '0', hra: '0', pt: '0' };
    const extra = Number(projectTax(tax, TAX, { ...month, gross: String(Number(plain.gross) + 100000 + Number(paid.amount)) }).tax.total) - Number(projectTax(tax, TAX, { ...month, gross: plain.gross }).tax.total);
    expect(Math.abs(extra - Number(paid.amount))).toBeLessThanOrEqual(1);
  });

  it('without gross-up the item is taxed as usual: the person gets less than the item this month (negative)', () => {
    const r = calculatePayslip(snapshot({ tax, oneTime: [bonus()] }), TAX);
    expect(r.lines.some((l) => l.code === 'tax_paid_by_company')).toBe(false);
    expect(tdsTotal(r)).toBeGreaterThan(tdsTotal(plain));
    expect(Number(r.net) - Number(plain.net)).toBeLessThan(100000 - (otherDeductions(r) - otherDeductions(plain)));
  });

  it('a separate item and its gross-up lines are marked separate; the salary lines are not', () => {
    const r = calculatePayslip(snapshot({ tax, oneTime: [bonus({ grossUp: true, separate: true })] }), TAX);
    const sep = r.lines.filter((l) => l.separate);
    expect(sep.map((l) => l.code).sort()).toEqual(['bonus', 'tax_paid_by_company', 'tds']);
    const separateNet = sep.reduce((t, l) => t + (l.kind === 'earning' ? Number(l.amount) : l.kind === 'deduction' ? -Number(l.amount) : 0), 0);
    expect(separateNet).toBeCloseTo(100000, 2);
    expect(r.lines.find((l) => l.code === 'basic')?.separate).toBeUndefined();
    expect(calculatePayslip(snapshot({ tax, oneTime: [bonus()] }), TAX).lines.some((l) => l.separate)).toBe(false);
  });

  it('an item-only off-cycle with gross-up pays the item in full', () => {
    const r = calculatePayslip(snapshot({ offcycle: 'bonus', oneTime: [bonus({ grossUp: true })], tax }), TAX);
    expect(Number(r.net)).toBeCloseTo(100000 - otherDeductions(r), 2);
    expect(tdsTotal(r)).toBeCloseTo(Number(r.lines.find((l) => l.code === 'tax_paid_by_company')!.amount), 2);
    expect(Number(r.lines.find((l) => l.code === 'tax_paid_by_company')!.amount)).toBeGreaterThan(0);
  });

  it('nothing changes for a payslip without these items (same lines as before)', () => {
    expect(plain.lines.some((l) => l.separate || l.code === 'tax_paid_by_company')).toBe(false);
  });
});

describe('E5 (O17): the pay group default dates', () => {
  it('cut-off on its day (the last day in a short month); release that many days after the period, or when published', () => {
    expect(defaultDates({ cutOffDay: 25, releaseDay: 0 }, '2026-11')).toEqual({ month: '2026-11', cutOff: '2026-11-25', release: null });
    expect(defaultDates({ cutOffDay: 28, releaseDay: 3 }, '2027-02')).toEqual({ month: '2027-02', cutOff: '2027-02-28', release: '2027-03-03' });
  });
});
