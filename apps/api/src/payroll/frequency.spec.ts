import { subPeriods } from './frequency';

describe('weekly and fortnightly pay calendars (YX-PAY-58)', () => {
  it('weeks from a Monday anchor, cut at the month ends', () => {
    const p = subPeriods('weekly', '2026-09-28', '2026-10');
    expect(p.map((x) => [x.from, x.to])).toEqual([
      ['2026-10-01', '2026-10-04'],
      ['2026-10-05', '2026-10-11'],
      ['2026-10-12', '2026-10-18'],
      ['2026-10-19', '2026-10-25'],
      ['2026-10-26', '2026-10-31'],
    ]);
    expect(p.map((x) => x.final)).toEqual([false, false, false, false, true]);
  });

  it('fortnights from an anchor long before the month, and one anchored after it', () => {
    expect(subPeriods('fortnightly', '2026-01-05', '2026-10').map((x) => [x.from, x.to])).toEqual([
      ['2026-10-01', '2026-10-11'],
      ['2026-10-12', '2026-10-25'],
      ['2026-10-26', '2026-10-31'],
    ]);
    expect(subPeriods('fortnightly', '2027-03-01', '2026-11').map((x) => x.from)).toEqual(['2026-11-01', '2026-11-09', '2026-11-23']);
  });

  it('a period that starts on the 1st is not cut', () => {
    expect(subPeriods('weekly', '2026-06-01', '2026-06')[0]).toEqual({ k: 1, from: '2026-06-01', to: '2026-06-07', final: false });
  });
});
