import { accrualsDue, afterWait, ceilingLapses } from './time-maths';

// Answer 2342 (Oracle O10, O11): the most days held (ceiling) and no credit in the first N months after joining.
const monthly = { annualDays: 12, frequency: 'monthly' as const, proRata: true, rounding: 0.5 };

describe('no credit in the first N months (O11)', () => {
  it('0 months changes nothing', () => {
    const due = accrualsDue(monthly, { yearStart: '2026-01-01', joinedOn: '2026-01-01', upTo: '2026-06-30' });
    expect(afterWait(due, '2026-01-01', 0)).toEqual(due);
  });
  it('3 months: credits dated before 1 Apr are dropped (not paid later); April on are kept', () => {
    const due = accrualsDue(monthly, { yearStart: '2026-01-01', joinedOn: '2026-01-01', upTo: '2026-06-30' });
    const kept = afterWait(due, '2026-01-01', 3);
    expect(kept.map((d) => d.on)).toEqual(['2026-04-01', '2026-05-01', '2026-06-01']);
  });
  it('a mid-month joiner: the boundary is the same day N months on', () => {
    const due = accrualsDue(monthly, { yearStart: '2026-01-01', joinedOn: '2026-01-15', upTo: '2026-06-30' });
    expect(afterWait(due, '2026-01-15', 2).map((d) => d.on)).toEqual(['2026-04-01', '2026-05-01', '2026-06-01']);
  });
});

describe('the ceiling (O10)', () => {
  const due = (on: string, days: number) => ({ periodKey: `accrual:${on.slice(0, 7)}`, on, days });
  it('no ceiling: no lapse', () => {
    expect(ceilingLapses([due('2026-01-01', 1)], 100, null)).toEqual([]);
    expect(ceilingLapses([due('2026-01-01', 1)], 100, undefined)).toEqual([]);
  });
  it('below the ceiling: nothing lapses; reaching it exactly: nothing lapses', () => {
    expect(ceilingLapses([due('2026-01-01', 1), due('2026-02-01', 1)], 28, 30)).toEqual([]);
  });
  it('over it: only the part over lapses, credit by credit in date order', () => {
    expect(ceilingLapses([due('2026-02-01', 1), due('2026-01-01', 1)], 29.5, 30)).toEqual([
      { periodKey: 'ceiling:accrual:2026-01', on: '2026-01-01', days: -0.5 },
      { periodKey: 'ceiling:accrual:2026-02', on: '2026-02-01', days: -1 },
    ]);
  });
  it('a balance already above the ceiling (carried in) is never cut; each new credit lapses whole', () => {
    expect(ceilingLapses([due('2026-01-01', 1.5)], 40, 30)).toEqual([{ periodKey: 'ceiling:accrual:2026-01', on: '2026-01-01', days: -1.5 }]);
  });
});
