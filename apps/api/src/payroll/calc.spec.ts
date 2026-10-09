import { readFileSync } from 'fs';
import { join } from 'path';
import fc from 'fast-check';
import { Prisma } from '@prisma/client';
import { calculatePayslip, hashOf, type Snapshot } from './calc';
import { PACKAGE, RULES, snapshot } from './regression/fixtures';

// PAY-3.04 … 3.16: the pure payslip calculation. Hand-checked cases (full month, LOP, a mid-month revision with PF
// ceilings per part, recoveries within the cap and protected net, a negative net carried forward, suspension, hourly pay),
// properties (net = gross − deductions, never negative; the same snapshot gives the same hash), and the regression pack
// (PAY-3.18): stored snapshots must still give their stored results.

const amount = (r: ReturnType<typeof calculatePayslip>, code: string) => r.lines.filter((l) => l.code === code).reduce((t, l) => t.add(l.amount), new Prisma.Decimal(0)).toFixed(2);

describe('calculatePayslip', () => {
  it('a full month in Karnataka: earnings as agreed, PF on the ceiling, no ESI above its limit, PT 200, cited and explained', () => {
    const r = calculatePayslip(snapshot(), RULES);
    expect([r.gross, r.deductions, r.net]).toEqual(['58900.00', '2000.00', '56900.00']);
    expect(amount(r, 'pf_employee')).toBe('1800.00');
    expect(amount(r, 'pt')).toBe('200.00');
    expect(amount(r, 'esi_employee')).toBe('0.00');
    expect(r.lines.find((l) => l.code === 'pf_employee')).toMatchObject({ rule: { statute: 'IN.PF' }, verify: true });
    expect(r.lines.every((l) => l.explanation.length > 10)).toBe(true);
    expect(r.ruleVersions['IN.PF|IN']).toBe('2025-v1');
    expect(r.minWage).toMatchObject({ below: false });
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
    // PF: 15,000 × 15/31 and 15,000 × 16/31 ceilings, 12% each.
    expect(amount(r, 'pf_employee')).toBe('1800.00');
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
    expect(amount(r, 'loan_emi')).toBe('11560.00');
    expect(r.deferred).toEqual([{ kind: 'loan', ref: 'l1', amount: '8440.00' }]);
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
