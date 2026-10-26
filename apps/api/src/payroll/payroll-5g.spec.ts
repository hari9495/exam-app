import { readFileSync } from 'fs';
import { join } from 'path';
import { checkShape, gratuityDue, inForce, runGolden, serviceYears, type GoldenCase, type RuleSet } from '../statutory/evaluator';
import { calculatePayslip } from './calc';
import { staleRuleUses } from './arrears.service';
import { RULES, snapshot } from './regression/fixtures';
import type { TaxInputs } from './tax';

// Batch 5g pure parts: years of service, gratuity due on exit, retrenchment (the IN.IR pack), and the off-cycle payslip.
const pack = (f: string) => (JSON.parse(readFileSync(join(__dirname, '..', 'statutory', 'packs', f), 'utf8')) as { ruleSets: (RuleSet & { golden: GoldenCase[] })[] }).ruleSets;
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

describe('batch 5g: exit pay and off-cycle payslips', () => {
  it('counts service as the laws do: whole years, a part year over six months counts', () => {
    expect(serviceYears('2020-01-01', '2024-12-31')).toEqual({ completed: 4, counted: 5, months: 59 });
    expect(serviceYears('2020-01-01', '2025-05-31')).toEqual({ completed: 5, counted: 5, months: 64 });
    expect(serviceYears('2020-01-15', '2020-07-13')).toEqual({ completed: 0, counted: 0, months: 5 });
  });

  it('gratuity: 15/26 of the last wage per year after five years, any service on death, up to the cap', () => {
    const rs = inForce(RULES, 'IN.SS-CODE', ['IN'], '2026-10-31')!;
    expect(gratuityDue(rs, { lastWage: '26000', joined: '2016-10-01', lastDay: '2026-09-30' })).toMatchObject({ eligible: true, years: 10 });
    expect(gratuityDue(rs, { lastWage: '26000', joined: '2016-10-01', lastDay: '2026-09-30' }).amount.toFixed(2)).toBe('150000.00');
    expect(gratuityDue(rs, { lastWage: '26000', joined: '2022-10-01', lastDay: '2026-09-30' })).toMatchObject({ eligible: false });
    expect(gratuityDue(rs, { lastWage: '26000', joined: '2022-10-01', lastDay: '2026-09-30', death: true })).toMatchObject({ eligible: true, years: 4 });
    expect(gratuityDue(rs, { lastWage: '26000', joined: '2024-10-01', lastDay: '2026-09-30', fixedTerm: true })).toMatchObject({ eligible: true, years: 2 });
    expect(gratuityDue(rs, { lastWage: '900000', joined: '1990-01-01', lastDay: '2026-09-30' }).amount.toFixed(0)).toBe('2000000');
  });

  it('retrenchment rules: the IN.IR pack is well formed and its golden case passes', () => {
    for (const rs of pack('in-exit.json')) expect([...checkShape(rs), ...rs.golden.flatMap((g) => runGolden(rs, g))]).toEqual([]);
  });

  it('an item-only off-cycle pays its items: no salary, PT or provisions; TDS is the extra tax the items cause', () => {
    const bonus = { id: 'b1', code: 'bonus', amount: '100000', days: null, label: 'Diwali bonus.' };
    const r = calculatePayslip(snapshot({ offcycle: 'bonus', oneTime: [bonus], tax }), TAX);
    const codes = r.lines.map((l) => l.code);
    expect(codes).toContain('bonus');
    expect(codes).not.toContain('basic');
    expect(codes).not.toContain('pt');
    expect(codes).not.toContain('gratuity_provision');
    expect(codes).not.toContain('code_wage_add_back');
    expect(r.lines.find((l) => l.code === 'bonus')?.explanation).toBe('Diwali bonus.');
    const tds = r.lines.find((l) => l.code === 'tds');
    expect(Number(tds?.amount)).toBeGreaterThan(0);
    expect(r.tax?.monthTds).toBe(tds?.amount);
    // The regular payslip of the same person still pays salary and spreads tax over the year.
    const regular = calculatePayslip(snapshot({ tax }), TAX);
    expect(regular.lines.map((l) => l.code)).toEqual(expect.arrayContaining(['basic', 'pt']));
  });

  it('a rule set published for a past month that differs from the one a payslip used makes one proposal per new version', () => {
    const pt = RULES.find((r) => r.statute === 'IN.PT' && r.jurisdiction === 'IN-KA')!;
    const newer: RuleSet = { ...pt, version: 'TEST-v2', validFrom: '2026-09-01' };
    const slips: { employeeId: string; month: string; ruleVersions: Record<string, string> }[] = [
      { employeeId: 'e1', month: '2026-09', ruleVersions: { 'IN.PT|IN-KA': pt.version, 'IN.TDS|IN': 'x' } },
      { employeeId: 'e2', month: '2026-09', ruleVersions: { 'IN.PT|IN-KA': pt.version } },
      { employeeId: 'e1', month: '2026-08', ruleVersions: { 'IN.PT|IN-KA': pt.version } },
    ];
    expect(staleRuleUses(slips, [...RULES, newer])).toEqual([{ statute: 'IN.PT', jurisdiction: 'IN-KA', version: 'TEST-v2', periods: ['2026-09'], employees: ['e1', 'e2'] }]);
    expect(staleRuleUses(slips, RULES)).toEqual([]);
  });

  it('an agreed overpayment is recovered by instalment, within the protected net, and reported', () => {
    const r = calculatePayslip(snapshot({ recoveries: { courtOrders: [], loans: [], carryForwards: [], overpayments: [{ id: 'o1', instalment: '5000', balance: '12000' }] } }), RULES);
    expect(r.recoveries.overpayments).toEqual([{ id: 'o1', amount: '5000.00' }]);
    expect(r.lines.find((l) => l.code === 'overpayment_recovery')?.amount).toBe('5000.00');
    // Snapshots from before 5g (no overpayments field) calculate as before.
    expect(calculatePayslip(snapshot(), RULES).recoveries.overpayments).toEqual([]);
  });
});
