import { readFileSync } from 'fs';
import { join } from 'path';
import { Prisma } from '@prisma/client';
import { checkShape, inForce, loanPerquisite, runGolden, type GoldenCase, type PerqLoanIn, type RuleSet } from '../statutory/evaluator';
import { calculatePayslip } from './calc';
import { RULES, snapshot } from './regression/fixtures';
import type { TaxInputs } from './tax';

// D14 (founder answers 2404, 2405): the loan perquisite of Rule 3(7)(i) on the month's maximum outstanding, from the rule
// set IN.PERQ-LOAN; nothing at all until a CA loads the SBI rates.
const TAX = (JSON.parse(readFileSync(join(__dirname, '..', 'statutory', 'packs', 'in-tax.json'), 'utf8')) as { ruleSets: (RuleSet & { golden: GoldenCase[] })[] }).ruleSets;
const SHIPPED = TAX.find((r) => r.statute === 'IN.PERQ-LOAN')!;
// A CA-loaded version for the tests (made-up rates; the shipped one has none).
const LOADED: RuleSet = { ...SHIPPED, version: 'TEST', values: { ...SHIPPED.values, rates: { housing: '8.50', vehicle: '9.15', education: '10.00', personal: '12.00', other: '12.00' } } };
const loan = (over: Partial<PerqLoanIn> = {}): PerqLoanIn => ({ id: 'l1', purpose: 'personal', ratePct: '0', maxOutstanding: '300000', exempt: false, ...over });
const money = (x: Prisma.Decimal) => x.toFixed(2);

describe('loan perquisite (Rule 3(7)(i))', () => {
  it('the shipped rule set is dated, marked verify, well formed and its golden cases pass', () => {
    expect(SHIPPED).toMatchObject({ validFrom: '2026-04-01', validTo: '2027-03-31', verify: true });
    expect([...checkShape(SHIPPED), ...SHIPPED.golden.flatMap((g) => runGolden(SHIPPED, g))]).toEqual([]);
    expect(checkShape(LOADED)).toEqual([]);
  });

  it('a rate that is not a percent, a missing loan type or an unknown one is refused by the shape check', () => {
    expect(checkShape({ ...LOADED, values: { ...LOADED.values, rates: { ...(LOADED.values.rates as object), personal: '12%' } } })).toEqual(['The SBI rate for personal is a percent a year (like 9.15) or null until loaded']);
    const { other: _o, ...four } = LOADED.values.rates as Record<string, string>;
    expect(checkShape({ ...LOADED, values: { ...LOADED.values, rates: four } })).toEqual(['The SBI rate for other is a percent a year (like 9.15) or null until loaded']);
    expect(checkShape({ ...LOADED, values: { ...LOADED.values, rates: { ...(LOADED.values.rates as object), gold: '9' } } })).toEqual(['Loan type gold is not one of housing, vehicle, education, personal, other']);
    expect(checkShape({ ...LOADED, values: { ...LOADED.values, exemptAggregate: '20000.50' } })).toEqual(['exemptAggregate is whole rupees']);
  });

  it('no rate loaded: nothing, and it says so (never a guessed rate)', () => {
    const r = loanPerquisite(SHIPPED, { loans: [loan()] });
    expect(money(r.total)).toBe('0.00');
    expect(r.ratesMissing).toBe(true);
    expect(r.lines[0]).toMatchObject({ reason: 'rate_not_loaded', refRate: null });
    // One loan type loaded, another not: the loaded one is worked out, the other flagged.
    const part: RuleSet = { ...SHIPPED, values: { ...SHIPPED.values, rates: { ...(SHIPPED.values.rates as object), vehicle: '9.15' } } };
    const both = loanPerquisite(part, { loans: [loan({ id: 'car', purpose: 'vehicle' }), loan({ id: 'p' })] });
    expect(both.ratesMissing).toBe(true);
    expect(money(both.total)).toBe('2287.50');
  });

  it('the ₹20,000 limit: loans adding up to exactly 20,000 are exempt, a paisa more and the whole is charged', () => {
    const at = loanPerquisite(LOADED, { loans: [loan({ maxOutstanding: '12000' }), loan({ id: 'l2', maxOutstanding: '8000' })] });
    expect(at).toMatchObject({ smallTotal: true, ratesMissing: false });
    expect(money(at.total)).toBe('0.00');
    const over = loanPerquisite(LOADED, { loans: [loan({ maxOutstanding: '12000' }), loan({ id: 'l2', maxOutstanding: '8000.01' })] });
    expect(over.smallTotal).toBe(false);
    // 12,000 × 12% ÷ 12 = 120.00; 8,000.01 × 12% ÷ 12 = 80.0001 → 80.00.
    expect(over.lines.map((l) => money(l.value))).toEqual(['120.00', '80.00']);
    expect(money(over.total)).toBe('200.00');
    // A medical loan still counts towards the total, but is never charged itself.
    const med = loanPerquisite(LOADED, { loans: [loan({ maxOutstanding: '15000', exempt: true }), loan({ id: 'l2', maxOutstanding: '6000' })] });
    expect(med.lines.map((l) => [l.reason, money(l.value)])).toEqual([
      ['exempt', '0.00'],
      ['charged', '60.00'],
    ]);
  });

  it('the difference only: the SBI rate less the loan rate; at or above the SBI rate is nothing; rounded half up to the paisa', () => {
    // 2,50,000 × (9.15 − 6) ÷ 12 ÷ 100 = 656.25.
    expect(money(loanPerquisite(LOADED, { loans: [loan({ purpose: 'vehicle', ratePct: '6', maxOutstanding: '250000' })] }).total)).toBe('656.25');
    expect(loanPerquisite(LOADED, { loans: [loan({ purpose: 'vehicle', ratePct: '9.15' })] }).lines[0]).toMatchObject({ reason: 'not_below' });
    expect(money(loanPerquisite(LOADED, { loans: [loan({ purpose: 'vehicle', ratePct: '11' })] }).total)).toBe('0.00');
    // 1,00,001 × 8.5% ÷ 12 = 708.340083… → 708.34; 1,00,007 × 8.5% ÷ 12 = 708.382916… → 708.38; 30,003 × 12% ÷ 12 = 300.03.
    expect(money(loanPerquisite(LOADED, { loans: [loan({ purpose: 'housing', maxOutstanding: '100001' })] }).total)).toBe('708.34');
    expect(money(loanPerquisite(LOADED, { loans: [loan({ purpose: 'housing', maxOutstanding: '100007' })] }).total)).toBe('708.38');
    expect(money(loanPerquisite(LOADED, { loans: [loan({ maxOutstanding: '30003' })] }).total)).toBe('300.03');
    // A half paisa rounds up: 1,005 × 12% ÷ 12 = 10.05 exactly; 25,125 × 0.02% ÷ 12 = 0.41875 → 0.42.
    const tiny: RuleSet = { ...LOADED, values: { ...LOADED.values, exemptAggregate: '0' } };
    expect(money(loanPerquisite(tiny, { loans: [loan({ maxOutstanding: '25125', ratePct: '11.98' })] }).total)).toBe('0.42');
  });

  it('dated: the shipped version covers tax year 2026-27 only', () => {
    expect(inForce(TAX, 'IN.PERQ-LOAN', ['IN'], '2026-04-01')?.version).toBe('TY2026-27');
    expect(inForce(TAX, 'IN.PERQ-LOAN', ['IN'], '2027-03-31')?.version).toBe('TY2026-27');
    expect(inForce(TAX, 'IN.PERQ-LOAN', ['IN'], '2027-04-01')).toBeNull();
    expect(inForce(TAX, 'IN.PERQ-LOAN', ['IN'], '2026-03-31')).toBeNull();
  });
});

describe('loan perquisite on the payslip', () => {
  const tax: TaxInputs = {
    taxYear: '2026-27',
    lawVersion: 'IT-2025',
    regime: 'new',
    age: 30,
    resident: true,
    pan: 'ok',
    proofStage: 'declared',
    past: { gross: '1500000', tds: '0', pt: '0', months: [], otherEntities: [] },
    previous: { gross: '0', exemptions: '0', tds: '0', pt: '0' },
    otherIncome: '0',
    perquisites: '0',
    futureMonths: 5,
    future: { gross: '250000', basic: '100000', hra: '50000', pt: '200' },
    deductions: [],
    rent: null,
  };
  const rules = (perq: RuleSet) => [...RULES, ...TAX.filter((r) => r.statute !== 'IN.PERQ-LOAN'), perq];
  // The month's maximum is the balance before the month's instalment: 3,00,000 owed, 10,000 recovered this month.
  const tdsOf = (r: ReturnType<typeof calculatePayslip>) => Number(r.lines.find((l) => l.code === 'tds')?.amount ?? 0);
  const withLoan = (perq: RuleSet, over: Partial<PerqLoanIn> = {}) =>
    calculatePayslip(snapshot({ tax, perqLoans: [loan(over)], recoveries: { courtOrders: [], loans: [{ id: 'l1', emi: '10000', outstanding: '300000' }], carryForwards: [] } }), rules(perq));

  it('rates loaded: an information line on the maximum outstanding, counted as a perquisite for TDS, never paid', () => {
    const base = calculatePayslip(snapshot({ tax }), rules(LOADED));
    const r = withLoan(LOADED);
    const line = r.lines.find((l) => l.code === 'loan_perquisite')!;
    // 3,00,000 (not 2,90,000 after the instalment) × 12% ÷ 12 = 3,000.00.
    expect(line).toMatchObject({ kind: 'info', amount: '3000.00', sourceRef: 'l1', verify: true, rule: { statute: 'IN.PERQ-LOAN', version: 'TEST' } });
    expect(line.explanation).toContain('₹300000.00, the most owed this month');
    expect(r.ruleVersions['IN.PERQ-LOAN|IN']).toBe('TEST');
    expect(r.gross).toBe(base.gross);
    // Answer 2451: this month's 3,000 counts for this month and the 5 left in the year (spread evenly).
    expect(r.tax?.income.perquisites).toBe('18000.00');
    expect(tdsOf(base)).toBeGreaterThan(0);
    expect(tdsOf(r)).toBeGreaterThan(tdsOf(base));
    // Not paid: no earning or deduction line carries it.
    expect(r.lines.filter((l) => l.kind !== 'info' && /perq/.test(l.code))).toEqual([]);
  });

  it('no rate loaded, a medical loan, or loans of 20,000 or less: no line and TDS as without the loan', () => {
    const base = calculatePayslip(snapshot({ tax }), rules(SHIPPED));
    for (const r of [withLoan(SHIPPED), withLoan(LOADED, { exempt: true }), withLoan(LOADED, { maxOutstanding: '20000' })]) {
      expect(r.lines.find((l) => l.code === 'loan_perquisite')).toBeUndefined();
      expect(tdsOf(r)).toBe(tdsOf(base));
      expect(r.tax?.income.perquisites).toBe('0.00');
    }
  });

  it('a payslip from before D14 (no loans in its snapshot) calculates as before', () => {
    const r = calculatePayslip(snapshot({ tax }), rules(LOADED));
    expect(r.lines.find((l) => l.code === 'loan_perquisite')).toBeUndefined();
    expect(r.ruleVersions['IN.PERQ-LOAN|IN']).toBeUndefined();
  });
});
