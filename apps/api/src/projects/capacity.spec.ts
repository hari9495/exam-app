import { allocatedMinutes, attendanceMismatch, availableMinutes, freePct, hideSmallTeam, rankMatches, utilisationPct } from './capacity';

describe('capacity rules (PRJ-03, PRJ-07, answers 1411, 1418, 1541)', () => {
  const wd = (over: Partial<{ weekday: boolean; holiday: boolean; leave: 'full' | 'first' | 'second' | null }> = {}) => ({ weekday: true, holiday: false, leave: null, ...over });

  it('available hours: weekdays less holidays and leave (half days count half)', () => {
    expect(availableMinutes([wd(), wd(), wd(), wd(), wd(), wd({ weekday: false }), wd({ weekday: false })])).toBe(2400);
    expect(availableMinutes([wd({ holiday: true }), wd({ leave: 'full' }), wd({ leave: 'first' }), wd(), wd()])).toBe(1200);
  });

  it('allocated hours follow the allocation’s days and share', () => {
    const days = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08'].map((on, k) => ({ on, weekday: k < 5 }));
    expect(allocatedMinutes(days, [{ percent: 50, fromOn: '2026-01-01', toOn: null }])).toBe(1200);
    expect(allocatedMinutes(days, [{ percent: 100, fromOn: '2026-11-05', toOn: null }, { percent: 50, fromOn: '2026-10-01', toOn: '2026-11-02' }])).toBe(960 + 240);
  });

  it('utilisation and the small-team rule', () => {
    expect(utilisationPct(1800, 2400)).toBe(75);
    expect(utilisationPct(100, 0)).toBe(0);
    expect(hideSmallTeam(4, 5, false)).toBe(true);
    expect(hideSmallTeam(5, 5, false)).toBe(false);
    expect(hideSmallTeam(2, 5, true)).toBe(false);
  });

  it('free capacity counts every allocation overlapping the period; matches need enough of it, bench first', () => {
    const allocs = [{ percent: 50, fromOn: '2026-11-01', toOn: '2026-11-30' }, { percent: 30, fromOn: '2026-12-01', toOn: null }];
    expect(freePct(allocs, '2026-11-15', '2026-12-15')).toBe(20);
    expect(freePct(allocs, '2026-12-01', '2027-01-31')).toBe(70);
    expect(freePct([{ percent: 80, fromOn: '2026-01-01', toOn: null }, { percent: 60, fromOn: '2026-01-01', toOn: null }], '2026-11-01', '2026-11-30')).toBe(0);
    const people = [
      { name: 'Asha', free: 100, onBench: false },
      { name: 'Bala', free: 60, onBench: true },
      { name: 'Chitra', free: 40, onBench: true },
      { name: 'Dev', free: 100, onBench: false },
    ];
    expect(rankMatches(people, 50).map((p) => p.name)).toEqual(['Bala', 'Asha', 'Dev']);
    expect(rankMatches(people, 101)).toEqual([]);
  });

  it('timesheet against attendance: an hour or more apart is flagged; no attendance, no flag', () => {
    expect(attendanceMismatch(2520, 2400)).toBe('Timesheet 42 h vs attendance 40 h worked');
    expect(attendanceMismatch(2430, 2400)).toBeNull();
    expect(attendanceMismatch(2520, null)).toBeNull();
  });
});
