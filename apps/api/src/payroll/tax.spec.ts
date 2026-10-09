import { readFileSync } from 'fs';
import { join } from 'path';
import type { RuleSet } from '../statutory/evaluator';
import { calculatePayslip } from './calc';
import { RULES, snapshot } from './regression/fixtures';
import { lawVersionFor, projectTax, taxForms, taxYearOf, type TaxInputs, type ThisMonth } from './tax';

const TAX: RuleSet[] = [...RULES, ...(JSON.parse(readFileSync(join(__dirname, '..', 'statutory', 'packs', 'in-tax.json'), 'utf8')) as { ruleSets: RuleSet[] }).ruleSets];
const base = (over: Partial<TaxInputs> = {}): TaxInputs => ({
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
  ...over,
});
const april: ThisMonth = { month: '2026-04', gross: '150000', basic: '60000', hra: '30000', pt: '200' };

describe('income tax projection (PAY-5.02 … 5.07)', () => {
  it('spreads the year’s tax over the periods left; past tax counts (rehire in the same year combines the year)', () => {
    const a = projectTax(base(), TAX, april);
    // 18 L salary, 75,000 standard deduction: 17,25,000 taxable in the new regime.
    expect(a).toMatchObject({ taxable: '1725000.00', remainingPeriods: 12, lawVersion: 'IT-2025' });
    expect(Number(a.monthTds) * 12).toBeCloseTo(Number(a.tax.total), -1);
    // Rehired in October of the same year: six months earned before (in another employment) and their tax already paid.
    const oct: ThisMonth = { ...april, month: '2026-10' };
    const b = projectTax(
      base({ futureMonths: 5, past: { gross: '900000', tds: a.tax.total === '0.00' ? '0' : String(Math.round(Number(a.tax.total) / 2)), pt: '1200', months: [], otherEntities: [] } }),
      TAX,
      oct,
    );
    expect(b.income.salary).toBe('1800000.00');
    expect(Number(b.monthTds)).toBeCloseTo(Number(a.monthTds), -1);
  });

  it('after the proof cut-off only verified proofs count, and the extra tax is spread over the months left', () => {
    const declared = projectTax(
      base({ regime: 'old', futureMonths: 2, past: { gross: '1350000', tds: '150000', pt: '1800', months: [], otherEntities: [] }, deductions: [{ key: 'sec80c', amount: '150000' }] }),
      TAX,
      { ...april, month: '2027-01' },
    );
    const verified = projectTax(
      base({
        regime: 'old',
        proofStage: 'verified',
        futureMonths: 2,
        past: { gross: '1350000', tds: '150000', pt: '1800', months: [], otherEntities: [] },
        deductions: [{ key: 'sec80c', amount: '50000' }],
      }),
      TAX,
      { ...april, month: '2027-01' },
    );
    expect(Number(verified.tax.total) - Number(declared.tax.total)).toBe(31200); // 1,00,000 less deduction at 30% + 4% cess
    expect(Number(verified.monthTds) - Number(declared.monthTds)).toBe(10400); // spread over the 3 periods left
    expect(verified.notes.join(' ')).toMatch(/only verified proofs count/);
  });

  it('HRA is worked out month by month, only for the months rent was paid', () => {
    const rent = { monthly: '25000', from: '2026-07', to: '2027-03', metro: false };
    const p = projectTax(base({ regime: 'old', rent }), TAX, april);
    // Jul–Mar = 9 months; each month the least is rent over 10% of basic: 25,000 − 6,000 = 19,000.
    expect(p.exemptions.hra).toBe('171000.00');
    expect(projectTax(base({ regime: 'new', rent }), TAX, april).exemptions.hra).toBe('0.00');
  });

  it('no or inoperative PAN: the higher of the slab tax and 20%; never a block', () => {
    const p = projectTax(base({ pan: 'missing', future: { gross: '50000', basic: '25000', hra: '12500', pt: '200' } }), TAX, { ...april, gross: '50000' });
    // 6 L taxable: nil after the rebate, but 20% without a PAN.
    expect(p.tax).toMatchObject({ total: '105000.00', noPanApplied: true });
    expect(projectTax(base({ pan: 'inoperative' }), TAX, april).notes.join(' ')).toMatch(/inoperative/);
  });

  it('a non-resident gets no rebate', () => {
    const low = { future: { gross: '60000', basic: '30000', hra: '15000', pt: '200' } };
    expect(projectTax(base(low), TAX, { ...april, gross: '60000' }).tax.total).toBe('0.00');
    expect(Number(projectTax(base({ ...low, resident: false }), TAX, { ...april, gross: '60000' }).tax.total)).toBeGreaterThan(0);
  });

  it('the law version picks the forms: 24Q and Form 16 to March 2026, Form 138 and Form 130 after', () => {
    expect([taxYearOf('2026-03'), lawVersionFor(taxYearOf('2026-03')), taxForms(lawVersionFor('2025-26'))]).toEqual(['2025-26', 'IT-1961', { certificate: 'form16', quarterlyReturn: '24Q' }]);
    expect([taxYearOf('2026-04'), lawVersionFor('2026-27'), taxForms('IT-2025')]).toEqual(['2026-27', 'IT-2025', { certificate: 'form130', quarterlyReturn: 'Form 138' }]);
  });

  it('the payslip’s TDS line is the projection’s monthly figure (one function for both)', () => {
    const s = snapshot();
    const month = s.period.end.slice(0, 7);
    const r = calculatePayslip(
      { ...s, tax: base({ taxYear: taxYearOf(month), lawVersion: lawVersionFor(taxYearOf(month)), future: { gross: '58900', basic: '24200', hra: '12100', pt: '200' }, futureMonths: 3 }) },
      TAX,
    );
    expect(r.tax).not.toBeNull();
    expect(r.lines.find((l) => l.code === 'tds')?.amount ?? '0.00').toBe(r.tax!.monthTds === '0.00' ? '0.00' : r.tax!.monthTds);
    // Without tax inputs (before 5e) there is no TDS line, so earlier payslips reproduce unchanged.
    expect(calculatePayslip(s, TAX).lines.some((l) => l.code === 'tds')).toBe(false);
  });
});
