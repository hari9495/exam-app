import { readFileSync } from 'fs';
import { join } from 'path';
import fc from 'fast-check';
import { Prisma } from '@prisma/client';
import { calculatePayslip, hashOf, type Snapshot } from './calc';
import { COMPONENTS, PACKAGE, RULES, snapshot } from './regression/fixtures';
import { MODULE_COMPONENTS } from './starter';

// PAY-3.04 … 3.16: the pure payslip calculation. Hand-checked cases (full month, LOP, a mid-month revision with PF
// ceilings per part, recoveries within the cap and protected net, a negative net carried forward, suspension, hourly pay),
// properties (net = gross − deductions, never negative; the same snapshot gives the same hash), and the regression pack
// (PAY-3.18): stored snapshots must still give their stored results.

const amount = (r: ReturnType<typeof calculatePayslip>, code: string) => r.lines.filter((l) => l.code === code).reduce((t, l) => t.add(l.amount), new Prisma.Decimal(0)).toFixed(2);

describe('calculatePayslip', () => {
  it('a full month in Karnataka: earnings as agreed, PF on the ceiling, no ESI above its limit, PT 200, cited and explained', () => {
    const r = calculatePayslip(snapshot(), RULES);
    // October 2026: the PF ceiling is 25,000 from 17 Sep 2026 (S.O. 5109(E)), so PF is 12% of the whole basic 24,200.
    expect([r.gross, r.deductions, r.net]).toEqual(['58900.00', '3104.00', '55796.00']);
    expect(amount(r, 'pf_employee')).toBe('2904.00');
    expect(amount(r, 'pt')).toBe('200.00');
    expect(amount(r, 'esi_employee')).toBe('0.00');
    expect(r.lines.find((l) => l.code === 'pf_employee')).toMatchObject({ rule: { statute: 'IN.PF' }, verify: true });
    expect(r.lines.every((l) => l.explanation.length > 10)).toBe(true);
    expect(r.ruleVersions['IN.PF|IN']).toBe('2026-v2');
    expect(r.minWage).toMatchObject({ below: false });
  });

  it('PAY-9.01: a part-month run pays its days without PT; the run that ends the month takes PT on the month so far', () => {
    const base = snapshot();
    const part = (days: number, sub: Snapshot['sub']) => snapshot({ segments: [{ ...base.segments[0], days }], sub });
    const first = calculatePayslip(part(7, { k: 1, final: false }), RULES);
    expect(amount(first, 'pt')).toBe('0.00');
    expect(Number(first.gross)).toBeLessThan(Number(calculatePayslip(base, RULES).gross) / 4);
    // The last 3 days alone are below the Karnataka slab; with the month's earlier pay the month's PT is due.
    expect(amount(calculatePayslip(part(3, { k: 5, final: true, mtd: { taxable: '0', ptWage: '0', basic: '0', hra: '0' } }), RULES), 'pt')).toBe('0.00');
    expect(amount(calculatePayslip(part(3, { k: 5, final: true, mtd: { taxable: '30000', ptWage: '30000', basic: '12000', hra: '6000' } }), RULES), 'pt')).toBe('200.00');
  });

  it('M05 D3: a reimbursement is outside gross pay and every wage base, inside net pay; a taxable one is an earning', () => {
    const modules = MODULE_COMPONENTS.map((c) => ({ code: c.code, name: c.name, kind: c.kind, pfWage: !!c.pfWage, esiWage: !!c.esiWage, ptWage: !!c.ptWage, gratuityWage: !!c.gratuityWage, bonusWage: !!c.bonusWage, codeWagePart: !!c.codeWagePart, codeExclusion: !!c.codeExclusion, prorated: c.prorated ?? true, rounding: c.rounding ?? 'rupee', statutory: null }));
    const plain = calculatePayslip(snapshot(), RULES);
    const r = calculatePayslip(snapshot({ components: [...COMPONENTS, ...modules], oneTime: [{ id: 'o1', code: 'exp_reimb', amount: '1234.50', days: null }] }), RULES);
    expect(r.lines.find((l) => l.code === 'exp_reimb')).toMatchObject({ kind: 'reimbursement', amount: '1234.50' });
    expect([r.gross, r.deductions]).toEqual([plain.gross, plain.deductions]);
    expect(amount(r, 'pf_employee')).toBe(amount(plain, 'pf_employee'));
    // Net pay rounds to the rupee (company rule), the reimbursement included.
    expect(r.net).toBe('57031.00');
    const t = calculatePayslip(snapshot({ components: [...COMPONENTS, ...modules], oneTime: [{ id: 'o2', code: 'exp_taxable', amount: '2000', days: null }, { id: 'o3', code: 'perf_bonus', amount: '10000', days: null }] }), RULES);
    expect(t.gross).toBe('70900.00');
    expect(amount(t, 'pf_employee')).toBe(amount(plain, 'pf_employee'));
  });

  it('M05 D3: a reimbursement is paid even when recoveries take the whole salary', () => {
    const modules = MODULE_COMPONENTS.map((c) => ({ code: c.code, name: c.name, kind: c.kind, pfWage: false, esiWage: false, ptWage: false, gratuityWage: false, bonusWage: false, codeWagePart: false, codeExclusion: false, prorated: false, rounding: 'rupee' as const, statutory: null }));
    const r = calculatePayslip(snapshot({ components: [...COMPONENTS, ...modules], attendance: { lopDays: '31', source: 'manual', otMinutes: { normal: 0, weeklyOff: 0, holiday: 0 }, timesheetMinutes: 0 }, oneTime: [{ id: 'o1', code: 'advance_recovery', amount: '5000', days: null }, { id: 'o2', code: 'exp_reimb', amount: '800', days: null }] }), RULES);
    expect(r.net).toBe('800.00');
    expect(Number(r.carryForward)).toBeGreaterThan(0);
  });

  it('3 days of loss of pay are cut once, at the monthly rate ÷ days of the month', () => {
    const r = calculatePayslip(snapshot({ attendance: { lopDays: '3', source: 'feed', otMinutes: { normal: 0, weeklyOff: 0, holiday: 0 }, timesheetMinutes: 0 } }), RULES);
    // 24,200 − 24,200 ÷ 31 × 3 = 21,858.06 → 21,858 (rupee rounding).
    expect(amount(r, 'basic')).toBe('21858.00');
    expect(amount(r, 'conveyance')).toBe('1445.00');
  });

  it('a raise on the 16th: two parts, each prorated, PF ceiling split by the days of each part', () => {
    const raised = PACKAGE.map((l) => ({ ...l, monthly: String(Number(l.monthly) * 1.1) }));
    const r = calculatePayslip(snapshot({ segments: [{ ...snapshot().segments[0], to: '2026-10-15', days: 15 }, { ...snapshot().segments[0], from: '2026-10-16', days: 16, lines: raised, changeId: 'c2' }] }), RULES);
    expect(r.lines.filter((l) => l.code === 'basic').map((l) => [l.segmentNo, l.amount])).toEqual([[0, '11710.00'], [1, '13739.00']]);
    // PF: 25,000 × 15/31 and 25,000 × 16/31 ceilings (from 17 Sep 2026); the first part's basic is below its share.
    expect(amount(r, 'pf_employee')).toBe('2953.00');
  });

  it('recoveries in legal order inside the deduction cap and protected net; what does not fit is deferred', () => {
    const r = calculatePayslip(
      snapshot({
        options: { ...snapshot().options, protectedNetPercent: '60' },
        recoveries: { courtOrders: [{ id: 'co1', ref: 'OS 12/2026', amount: '10000', percent: null, priorityDate: '2026-01-10', remaining: null }], loans: [{ id: 'l1', emi: '20000', outstanding: '50000' }], carryForwards: [] },
      }),
      RULES,
    );
    // Gross 58,900; statutory 2,000; protected net 60% = 35,340 → room 21,560: the court order first, then 11,560 of the EMI.
    expect(amount(r, 'court_attachment')).toBe('10000.00');
    expect(amount(r, 'loan_emi')).toBe('10456.00');
    expect(r.deferred).toEqual([{ kind: 'loan', ref: 'l1', amount: '9544.00' }]);
    expect(r.net).toBe('35340.00');
  });

  it('a month of only suspension: subsistence allowance instead of salary; deductions above pay leave net zero and a carry-forward', () => {
    const r = calculatePayslip(snapshot({ special: [{ kind: 'suspension', days: '31', daysBefore: 80 }] }), RULES);
    expect(amount(r, 'basic')).toBe('0.00');
    // Daily wage 58,900 ÷ 31 = 1,900; 10 days at half, 21 at three-fourths.
    expect(amount(r, 'subsistence')).toBe('39425.00');
    const neg = calculatePayslip(snapshot({ attendance: { lopDays: '31', source: 'manual', otMinutes: { normal: 0, weeklyOff: 0, holiday: 0 }, timesheetMinutes: 0 }, oneTime: [{ id: 'o1', code: 'advance_recovery', amount: '5000', days: null }] }), RULES);
    expect([neg.net, neg.carryForward]).toEqual(['0.00', '5000.00']);
  });

  it('HLP-12 answer 65: injury days already unpaid in the Time feed are not taken off twice; manual LOP still adds them', () => {
    const feed = (lop: string) => ({ lopDays: lop, source: 'feed' as const, otMinutes: { normal: 0, weeklyOff: 0, holiday: 0 }, timesheetMinutes: 0 });
    const onlyLop = calculatePayslip(snapshot({ attendance: feed('5') }), RULES);
    const filled = calculatePayslip(snapshot({ attendance: feed('5'), special: [{ kind: 'injury', days: '5', daysBefore: 0, inFeedDays: '5' }] }), RULES);
    expect(amount(filled, 'basic')).toBe(amount(onlyLop, 'basic'));
    expect(amount(filled, 'injury_pay')).not.toBe('0.00');
    const typed = calculatePayslip(snapshot({ attendance: feed('0'), special: [{ kind: 'injury', days: '5', daysBefore: 0 }] }), RULES);
    expect(amount(typed, 'basic')).toBe(amount(onlyLop, 'basic'));
    const manual = calculatePayslip(snapshot({ attendance: { ...feed('0'), source: 'manual' }, special: [{ kind: 'injury', days: '5', daysBefore: 0, inFeedDays: '5' }] }), RULES);
    expect(amount(manual, 'basic')).toBe(amount(onlyLop, 'basic'));
  });

  it('hourly pay from timesheet hours; overtime at the agreed multiplier', () => {
    const seg = { ...snapshot().segments[0], payBasis: 'hourly' as const, rate: '400', otMultiplier: '2' };
    const r = calculatePayslip(snapshot({ segments: [seg], attendance: { lopDays: '0', source: 'feed', otMinutes: { normal: 120, weeklyOff: 0, holiday: 0 }, timesheetMinutes: 160 * 60 } }), RULES);
    expect(amount(r, 'basic')).toBe('64000.00');
    expect(amount(r, 'ot')).toBe('1600.00');
  });

  it('overtime on a monthly salary: twice the ordinary rate of basic and allowances per standard hour', () => {
    const seg = { ...snapshot().segments[0], otMultiplier: '2' };
    const r = calculatePayslip(snapshot({ segments: [seg], attendance: { lopDays: '0', source: 'feed', otMinutes: { normal: 120, weeklyOff: 0, holiday: 0 }, timesheetMinutes: 0 } }), RULES);
    // 58,900 ÷ (31 × 8) = 237.50 an hour; 2 hours × 2 = 950.
    expect(amount(r, 'ot')).toBe('950.00');
  });

  it('properties: net = gross − deductions (never below zero), and the same snapshot always gives the same result hash', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 31 }), fc.integer({ min: 10000, max: 300000 }), fc.integer({ min: 0, max: 60000 }), (lop, basic, emi) => {
        const s = snapshot({ segments: [{ ...snapshot().segments[0], lines: [{ code: 'basic', monthly: String(basic) }, { code: 'special', monthly: '5000' }] }], attendance: { lopDays: String(lop), source: 'feed', otMinutes: { normal: 0, weeklyOff: 0, holiday: 0 }, timesheetMinutes: 0 }, recoveries: { courtOrders: [], loans: [{ id: 'l', emi: String(emi || 1), outstanding: '1000000' }], carryForwards: [] } });
        const a = calculatePayslip(s, RULES);
        const b = calculatePayslip(structuredClone(s), RULES);
        const net = new Prisma.Decimal(a.gross).sub(a.deductions);
        return a.resultHash === b.resultHash && new Prisma.Decimal(a.net).gte(0) && (net.isNegative() || new Prisma.Decimal(a.net).sub(net).abs().lte('0.5'));
      }),
      { numRuns: 120 },
    );
  });
});

describe('regression pack (PAY-3.18)', () => {
  const cases = JSON.parse(readFileSync(join(__dirname, 'regression', 'pack.json'), 'utf8')) as { name: string; snapshot: Snapshot; expected: { resultHash: string; net: string; gross: string } }[];
  it.each(cases.map((c) => [c.name, c]))('%s', (_n, c) => {
    const r = calculatePayslip(c.snapshot, RULES);
    expect({ net: r.net, gross: r.gross, resultHash: r.resultHash }).toEqual(c.expected);
  });
  it('the hash ignores key order', () => expect(hashOf({ a: 1, b: [2, { d: 1, c: 2 }] })).toBe(hashOf({ b: [2, { c: 2, d: 1 }], a: 1 })));
});
