import { blockDateStops, dailyPay, noticeDaysFor, noticeText } from './leave-rules';
import { parseRules } from './time-core';

// Founder decisions 1, 2 and 3 (29 Oct 2026): block-date leave types, notice per leave type, the leave liability.
describe('leave decisions (29 Oct 2026)', () => {
  describe('notice per leave type', () => {
    it('uses the type\'s own number when it has one, even 0', () => {
      expect(noticeDaysFor(7, 'earned', 3)).toBe(7);
      expect(noticeDaysFor(0, 'earned', 3)).toBe(0);
      expect(noticeDaysFor(5, 'sick', 3)).toBe(5);
    });
    it('falls back to the company default, but sick leave to 0', () => {
      expect(noticeDaysFor(null, 'earned', 3)).toBe(3);
      expect(noticeDaysFor(undefined, 'casual', 0)).toBe(0);
      expect(noticeDaysFor(null, 'sick', 30)).toBe(0);
    });
    it('says the notice in plain English', () => {
      expect(noticeText(1)).toBe("1 day's");
      expect(noticeText(7)).toBe("7 days'");
    });
    it('keeps a stored number and accepts "company default" (null); refuses out-of-range', () => {
      expect(parseRules({ noticeDays: 7 }).noticeDays).toBe(7);
      expect(parseRules({}).noticeDays).toBeNull();
      expect(parseRules({ noticeDays: null }).noticeDays).toBeNull();
      expect(parseRules({ noticeDays: 90 }).noticeDays).toBe(90);
      expect(() => parseRules({ noticeDays: 91 })).toThrow('Notice is 0 to 90 days.');
      expect(() => parseRules({ noticeDays: -1 })).toThrow('Notice is 0 to 90 days.');
      expect(() => parseRules({ noticeDays: 1.5 })).toThrow('Notice is 0 to 90 days.');
    });
  });

  describe('which leave a block date stops', () => {
    it('stops planned leave only when HR picked no types', () => {
      expect(blockDateStops([], 't1', 'earned')).toBe(true);
      expect(blockDateStops([], 't1', 'casual')).toBe(true);
      for (const k of ['sick', 'maternity', 'paternity', 'lop']) expect(blockDateStops([], 't1', k)).toBe(false);
    });
    it('stops exactly the picked types (sick leave too, when HR ticks it)', () => {
      expect(blockDateStops(['t1', 't2'], 't2', 'sick')).toBe(true);
      expect(blockDateStops(['t1'], 't2', 'earned')).toBe(false);
    });
  });

  describe('daily pay for the liability', () => {
    it('divides by 26 or 30, to the paisa', () => {
      expect(dailyPay(26000, '26', '2026-10-29')).toBe(1000);
      expect(dailyPay(30000, '30', '2026-10-29')).toBe(1000);
      expect(dailyPay(10000, '26', '2026-10-29')).toBe(384.62);
    });
    it('divides by the days in the month for calendar days, leap year included', () => {
      expect(dailyPay(31000, 'calendar', '2026-10-01')).toBe(1000);
      expect(dailyPay(30000, 'calendar', '2026-11-30')).toBe(1000);
      expect(dailyPay(28000, 'calendar', '2026-02-10')).toBe(1000);
      expect(dailyPay(29000, 'calendar', '2028-02-29')).toBe(1000);
    });
  });
});
