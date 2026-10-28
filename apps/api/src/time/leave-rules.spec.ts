import { accrualsDue } from './time-maths';
import { compOffExpiries, compOffUseBy, encashAmount, encashMax, encashWindowOpen, factoriesElEligible, lastDayAfterLeave, longestRun, optionalLimitAfterMove, probationAllows, toCsv } from './leave-rules';

describe('leave v2 rules', () => {
  describe('comp-off expiry (oldest first)', () => {
    const credits = [
      { key: 'a', on: '2026-01-10', days: 1, lapsed: 0 },
      { key: 'b', on: '2026-02-10', days: 1, lapsed: 0 },
    ];
    it('lapses the unused part of an expired credit', () => {
      expect(compOffExpiries(credits, 0.5, 30, '2026-02-15')).toEqual([{ key: 'a', on: '2026-01-10', days: 0.5 }]);
    });
    it('uses the oldest credit first, so nothing lapses when it was used', () => {
      expect(compOffExpiries(credits, 1, 30, '2026-02-15')).toEqual([]);
    });
    it('the use-by day itself is still in time; the next day it lapses', () => {
      expect(compOffExpiries(credits, 0, 30, '2026-02-09')).toEqual([]);
      expect(compOffExpiries(credits, 0, 30, '2026-02-10')).toEqual([{ key: 'a', on: '2026-01-10', days: 1 }]);
    });
    it('never lapses twice, and never with "never"', () => {
      expect(compOffExpiries([{ ...credits[0], lapsed: 1 }, credits[1]], 0, 30, '2026-02-15')).toEqual([]);
      expect(compOffExpiries(credits, 0, null, '2027-01-01')).toEqual([]);
      expect(compOffUseBy('2026-01-10', null)).toBeNull();
      expect(compOffUseBy('2026-01-10', 60)).toBe('2026-03-11');
    });
    it('a lapsed credit takes no later use', () => {
      expect(compOffExpiries([{ ...credits[0], lapsed: 1 }, credits[1]], 1, 30, '2026-03-20')).toEqual([]);
      expect(compOffExpiries([{ ...credits[0], lapsed: 1 }, credits[1]], 0.5, 30, '2026-03-20')).toEqual([{ key: 'b', on: '2026-02-10', days: 0.5 }]);
    });
  });

  describe('encashment', () => {
    it('caps by the year and by what must stay', () => {
      expect(encashMax({ available: 20, maxPerYear: 7, minLeft: 7, encashedThisYear: 0 })).toBe(7);
      expect(encashMax({ available: 12, maxPerYear: 7, minLeft: 7, encashedThisYear: 0 })).toBe(5);
      expect(encashMax({ available: 20, maxPerYear: 7, minLeft: 7, encashedThisYear: 5 })).toBe(2);
    });
    it('is zero at and below the limit, and rounds down to half days', () => {
      expect(encashMax({ available: 7, maxPerYear: 7, minLeft: 7, encashedThisYear: 0 })).toBe(0);
      expect(encashMax({ available: 3, maxPerYear: 7, minLeft: 7, encashedThisYear: 0 })).toBe(0);
      expect(encashMax({ available: 9.75, maxPerYear: 7, minLeft: 7, encashedThisYear: 0 })).toBe(2.5);
    });
    it('opens the window in the set month only', () => {
      expect(encashWindowOpen('12', 12)).toBe(true);
      expect(encashWindowOpen('12', 11)).toBe(false);
      expect(encashWindowOpen('off', 12)).toBe(false);
      expect(encashWindowOpen('any_month', 3)).toBe(true);
    });
    it('works out the daily rate and amount', () => {
      expect(encashAmount(48000, 26, 5)).toEqual({ dailyRate: 1846.15, amount: 9230.75 });
      expect(encashAmount(30000, 30, 0.5)).toEqual({ dailyRate: 1000, amount: 500 });
    });
  });

  it('probation limits paid leave by the setting', () => {
    expect(probationAllows('all', 'earned')).toBe(true);
    expect(probationAllows('casual_sick_unpaid', 'earned')).toBe(false);
    expect(probationAllows('casual_sick_unpaid', 'sick')).toBe(true);
    expect(probationAllows('unpaid_only', 'casual')).toBe(false);
    expect(probationAllows('unpaid_only', 'lop')).toBe(true);
    expect(probationAllows('unpaid_only', 'maternity')).toBe(true);
  });

  it('moves the last day only when the company says so, a half day by a whole day', () => {
    expect(lastDayAfterLeave('no_change', '2026-11-30', 3)).toBe('2026-11-30');
    expect(lastDayAfterLeave('extends_last_day', '2026-11-30', 3)).toBe('2026-12-03');
    expect(lastDayAfterLeave('extends_last_day', '2026-11-30', 0.5)).toBe('2026-12-01');
    expect(lastDayAfterLeave('extends_last_day', '2026-11-30', 0)).toBe('2026-11-30');
  });

  it('prorates optional holidays after a move by the months left', () => {
    expect(optionalLimitAfterMove(2, '2026-01-01', null)).toBe(2);
    expect(optionalLimitAfterMove(2, '2026-01-01', '2026-01-01')).toBe(2);
    expect(optionalLimitAfterMove(2, '2026-01-01', '2026-07-01')).toBe(1);
    expect(optionalLimitAfterMove(2, '2026-01-01', '2026-11-15')).toBe(0);
    expect(optionalLimitAfterMove(3, '2026-04-01', '2026-10-01')).toBe(2);
  });

  describe('Factories Act earned leave', () => {
    const y = { prevYearStart: '2025-01-01', prevYearEnd: '2025-12-31' };
    it('needs 240 days, 239 is not enough', () => {
      expect(factoriesElEligible({ ...y, worked: 240, joinedOn: '2020-01-01' })).toEqual({ ok: true, needed: 240 });
      expect(factoriesElEligible({ ...y, worked: 239, joinedOn: '2020-01-01' }).ok).toBe(false);
    });
    it('a joiner last year needs two thirds of the days from joining', () => {
      // 1 Jul - 31 Dec 2025: 184 days, two thirds = 123 (rounded up)
      expect(factoriesElEligible({ ...y, worked: 123, joinedOn: '2025-07-01' })).toEqual({ ok: true, needed: 123 });
      expect(factoriesElEligible({ ...y, worked: 122, joinedOn: '2025-07-01' }).ok).toBe(false);
    });
    it('a joiner this year is not yet eligible', () => {
      expect(factoriesElEligible({ ...y, worked: 0, joinedOn: '2026-02-01' }).ok).toBe(false);
    });
  });

  it('counts the longest run of leave days, weekly offs inside not breaking it', () => {
    const leave = new Set(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-09', '2026-11-10']);
    const off = (d: string) => d === '2026-11-07' || d === '2026-11-08';
    expect(longestRun(leave, '2026-11-01', '2026-11-30', off)).toBe(7);
    expect(longestRun(leave, '2026-11-01', '2026-11-30', () => false)).toBe(5);
  });

  it('accrual leaves out the days of a long absence that earns no leave', () => {
    const line = { annualDays: 12, frequency: 'monthly' as const, proRata: true, rounding: 0 };
    const base = accrualsDue(line, { yearStart: '2026-01-01', joinedOn: '2020-01-01', upTo: '2026-03-31' });
    expect(base.map((x) => x.days)).toEqual([1, 1, 1]);
    // All of February away: no February credit; half of March away: about half.
    const away = accrualsDue(line, { yearStart: '2026-01-01', joinedOn: '2020-01-01', upTo: '2026-03-31', notEarning: [{ from: '2026-02-01', to: '2026-03-16' }] });
    expect(away.map((x) => x.periodKey)).toEqual(['accrual:2026-01', 'accrual:2026-03']);
    expect(away[1].days).toBeCloseTo(0.48, 2);
  });

  it('writes CSV that a spreadsheet will not run', () => {
    expect(toCsv([['Name', 'Days'], ['=cmd()', 2], ['A "B"', null], ['-3', -3]])).toBe('"Name","Days"\r\n"\'=cmd()","2"\r\n"A ""B""",""\r\n"\'-3","-3"');
  });
});
