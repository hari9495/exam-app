import { addDays, caseNumber, daysBetween, ecAmount, ecInterest, late, mergeFacts, remindNow } from './accident-rules';

// HLP-12 rules with boundary values. The values below stand in for the IN.EC.CLAIM rule set row.
const V = { payWithinDays: 30, interestPctYear: 12, wageCeiling: 15000, deathPct: 50, deathMin: 120000, totalPct: 60, totalMin: 140000, tempPct: 25, waitingDays: 3 };

describe('HLP-12 accident rules', () => {
  it('numbers and dates (month end, leap year)', () => {
    expect(caseNumber(7)).toBe('ACC-0007');
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(daysBetween('2026-11-01', '2026-11-04')).toBe(3);
  });

  it('EC: the wage ceiling, minimums, a partial share and the waiting period', () => {
    expect(ecAmount(V, { kind: 'permanent-total', monthlyWage: 42000, factor: 197.06 })).toMatchObject({ wageUsed: 15000, amount: Math.round(0.6 * 15000 * 197.06) });
    expect(ecAmount(V, { kind: 'permanent-total', monthlyWage: 5000, factor: 10 }).amount).toBe(140000);
    expect(ecAmount(V, { kind: 'death', monthlyWage: 5000, factor: 10 }).amount).toBe(120000);
    expect(ecAmount(V, { kind: 'permanent-partial', monthlyWage: 42000, factor: 197.06, disablementPct: 20 }).amount).toBe(Math.round((Math.round(0.6 * 15000 * 197.06) * 20) / 100));
    expect(ecAmount(V, { kind: 'temporary', monthlyWage: 12000, days: 3 }).amount).toBe(0);
    expect(ecAmount(V, { kind: 'temporary', monthlyWage: 12000, days: 18 }).amount).toBe(3000);
  });

  it('EC interest: nothing up to the deadline, then from the day it fell due', () => {
    expect(ecInterest(100000, '2026-09-10', '2026-10-10', '2026-10-10', 12)).toBe(0);
    expect(ecInterest(100000, '2026-09-10', '2026-10-10', '2026-10-11', 12)).toBe(Math.round((100000 * 0.12 * 31) / 365));
  });

  it('late, reminders and facts', () => {
    expect(late({ key: 'esic', label: '', due: '2026-11-02', doneOn: null }, '2026-11-02')).toBe(false);
    expect(late({ key: 'esic', label: '', due: '2026-11-02', doneOn: null }, '2026-11-03')).toBe(true);
    expect(late({ key: 'esic', label: '', due: '2026-11-02', doneOn: '2026-11-03' }, '2026-11-04')).toBe(false);
    expect(late(undefined, '2026-11-04')).toBe(false);
    expect(remindNow(null, '2026-11-04', '1')).toBe(true);
    expect(remindNow('2026-11-04', '2026-11-04', '1')).toBe(false);
    expect(remindNow('2026-11-02', '2026-11-04', '3')).toBe(false);
    expect(remindNow(null, '2026-11-04', 'off')).toBe(false);
    expect(mergeFacts([{ kind: 'facts', data: { esiCovered: true, leaveFrom: '2026-11-01' } }, { kind: 'statement', data: {} }, { kind: 'facts', data: { esiCovered: false } }])).toEqual({ esiCovered: false, leaveFrom: '2026-11-01' });
  });
});
