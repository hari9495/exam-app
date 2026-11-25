import { readFileSync } from 'fs';
import { join } from 'path';
import { Prisma } from '@prisma/client';
import { calculatePayslip, type Snapshot } from './calc';
import { projectTax, type TaxInputs } from './tax';
import { inForce, tds, type RuleSet } from '../statutory/evaluator';
import { PACKAGE, RULES, snapshot } from './regression/fixtures';

// Payroll statutory review, 26 Nov 2026 (docs/yukthix/reviews/payroll-statutory-review-2026-11-26.md). Each test states
// the figure the law gives and FAILS on today's code; the finding number in the review is in the test name. Nothing here
// changes product code. Remove the `.failing` notes when the fixes land.

const amount = (r: ReturnType<typeof calculatePayslip>, code: string) => r.lines.filter((l) => l.code === code).reduce((t, l) => t.add(l.amount), new Prisma.Decimal(0)).toFixed(2);
const TAX_RULES: RuleSet[] = (JSON.parse(readFileSync(join(__dirname, '..', 'statutory', 'packs', 'in-tax.json'), 'utf8')) as { ruleSets: RuleSet[] }).ruleSets;
const withBasic = (basic: string) => PACKAGE.map((l) => (l.code === 'basic' ? { ...l, monthly: basic } : l));

describe('payroll statutory review (26 Nov 2026): figures the code gets wrong today', () => {
  it('R1 PF admin charges are 0.5% of the wage PF is paid on (capped), not of the whole PF wage', () => {
    // October 2026, basic 60,000, PF on the 25,000 ceiling: admin = 0.5% x 25,000 = 125 (code: 0.5% x 60,000 = 300).
    const r = calculatePayslip(snapshot({ segments: [{ ...snapshot().segments[0], lines: withBasic('60000') }] }), RULES);
    expect(amount(r, 'pf_employee')).toBe('3000.00');
    expect(amount(r, 'pf_admin')).toBe('125.00');
  });

  it('R2 a mid-month joiner gets the full monthly PF ceiling, not a ceiling cut by the days worked', () => {
    // Joins 16 Oct 2026 on basic 40,000: earned basic 40,000 x 16/31 = 20,645 (below 25,000), so PF = 12% x 20,645 = 2,477.
    // Code: ceiling 25,000 x 16/31 = 12,903, PF 1,548 (employee and employer both short by 929; the ECR shows the wrong wage).
    const r = calculatePayslip(snapshot({ segments: [{ ...snapshot().segments[0], from: '2026-10-16', days: 16, lines: withBasic('40000') }] }), RULES);
    expect(amount(r, 'basic')).toBe('20645.00');
    expect(amount(r, 'pf_employee')).toBe('2477.00');
  });

  it('R3 ESI: no employee share when the average daily wage is 176 or less; the employer still pays', () => {
    // A covered worker on 4,000 for October (31 days): 129 a day, at or below 176. Employee 0; employer 3.25% x 4,000 = 130.
    const low = [{ code: 'basic', monthly: '4000' }];
    const r = calculatePayslip(snapshot({ segments: [{ ...snapshot().segments[0], lines: low }], profile: { ...snapshot().profile, esi: 'yes', esiCoveredThisPeriod: true } }), RULES);
    expect(amount(r, 'esi_employer')).toBe('130.00');
    expect(amount(r, 'esi_employee')).toBe('0.00');
  });

  it('R4 Maharashtra PT: only women have the 25,000 exemption; a transgender or non-binary employee pays the general slab', () => {
    // Gross 58,900 in Maharashtra, October: 200. Code: no slab matches a gender other than male or female, so PT is 0.
    for (const gender of ['transgender', 'non_binary', 'prefer_not_to_say']) {
      const r = calculatePayslip(snapshot({ segments: [{ ...snapshot().segments[0], state: 'IN-MH' }], profile: { ...snapshot().profile, ptState: 'IN-MH', gender } }), RULES);
      expect([gender, amount(r, 'pt')]).toEqual([gender, '200.00']);
    }
  });

  it('R5 an international worker pays PF on the whole PF wage (no ceiling)', () => {
    // Basic 1,00,000: 12% = 12,000 (EPF Scheme para 83). The profile flag is saved but never reaches the calculation: 3,000.
    const s = snapshot({ segments: [{ ...snapshot().segments[0], lines: withBasic('100000') }] });
    const r = calculatePayslip({ ...s, profile: { ...s.profile, internationalWorker: true } as Snapshot['profile'] }, RULES);
    expect(amount(r, 'pf_employee')).toBe('12000.00');
  });

  it('R6 a higher-pension member (joint option) gets EPS on the actual wage', () => {
    // Basic 1,00,000 with PF on actual wage and the higher-pension option: EPS 8.33% x 1,00,000 = 8,330 (code: capped at 2,083).
    const s = snapshot({ segments: [{ ...snapshot().segments[0], lines: withBasic('100000') }] });
    const r = calculatePayslip({ ...s, profile: { ...s.profile, pfOnActualWage: true, higherPension: true } as Snapshot['profile'] }, RULES);
    expect(amount(r, 'eps_employer')).toBe('8330.00');
  });

  it('R7 surcharge has marginal relief: crossing 50 lakh never costs more than the income above it', () => {
    // New regime, taxable 50,10,000: tax at 50,00,000 is 10,80,000; with surcharge it may not exceed 10,80,000 + 10,000 = 10,90,000;
    // with 4% cess 11,33,600. Code: 10,83,000 + 10% surcharge 1,08,300 = 11,91,300, with cess 12,38,952 (1,05,352 too much).
    const rs = inForce(RULES, 'IN.TDS', ['IN'], '2026-10-01')!;
    expect(tds(rs, { taxable: '5010000', regime: 'new', age: 35 }).tax.toFixed(0)).toBe('1133600');
    // Old regime at 1 crore + 10,000: tax at 1 crore with 10% = 31,62,500 x 1.1... relief caps the 15% band the same way.
    const atCrore = tds(rs, { taxable: '10000000', regime: 'old', age: 35 }).tax;
    const above = tds(rs, { taxable: '10010000', regime: 'old', age: 35 }).tax;
    expect(above.sub(atCrore).lte(new Prisma.Decimal(10000).mul('1.04'))).toBe(true);
  });

  it('R8 employer NPS (80CCD(2), now s.124(1)(a)) is capped at 14% of basic + DA in the new regime', () => {
    // Basic 50,000 a month for the year = 6,00,000; 14% = 84,000. A claim of 2,00,000 is allowed in full today.
    const t: TaxInputs = {
      taxYear: '2026-27', lawVersion: 'IT-2025', regime: 'new', age: 35, resident: true, pan: 'ok', proofStage: 'declared',
      past: { gross: '0', tds: '0', pt: '0', months: [], otherEntities: [] }, previous: { gross: '0', exemptions: '0', tds: '0', pt: '0' },
      otherIncome: '0', perquisites: '0', futureMonths: 11, future: { gross: '100000', basic: '50000', hra: '0' },
      deductions: [{ key: 'sec80ccd2', amount: '200000' }], rent: null,
    };
    const p = projectTax(t, [...RULES, ...TAX_RULES], { month: '2026-04', gross: '100000', basic: '50000', hra: '0', pt: '0' });
    expect(p.deductions[0].allowed).toBe('84000.00');
  });
});
