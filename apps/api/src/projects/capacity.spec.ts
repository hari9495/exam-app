import { allocatedMinutes, attendanceMismatch, availableMinutes, freePct, hideSmallTeam, rankMatches, rangeFrom, teamHours, utilisationPct } from './capacity';

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

describe('teamHours and rangeFrom (batch D B3, answer 2537)', () => {
  const ok = (l: { minutes: number[]; status: string | null; approvedMinutes: number[] }) => (l.status === 'rejected' ? l.minutes.map(() => 0) : l.status === 'reduced' ? l.approvedMinutes : l.minutes);
  const row = (employee_id: string, billable: boolean, minutes: number[], status: string | null, sheet = 'pending', approved_minutes: number[] = []) => ({ employee_id, billable, minutes, status, approved_minutes, sheet });
  it('approved billable and non-billable from approved, reduced or whole-week approved lines; booked counts everything sent', () => {
    const m = teamHours([row('a', true, [480, 480], 'approved'), row('a', false, [120, 0], null, 'approved'), row('a', true, [240, 0], 'reduced', 'pending', [60, 0]), row('a', true, [300, 0], 'rejected'), row('a', true, [60, 0], 'pending'), row('b', false, [60, 0], null)], ok);
    expect(m.get('a')).toEqual({ billable: 960 + 60, nonBillable: 120, booked: 960 + 120 + 240 + 300 + 60 });
    // Waiting for a decision: booked only, never approved.
    expect(m.get('b')).toEqual({ billable: 0, nonBillable: 0, booked: 60 });
  });
  it('the range starts at this Monday, the Monday of the 1st of the month, or nowhere', () => {
    const mondayOf = (iso: string) => {
      const d = new Date(`${iso}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
      return d.toISOString().slice(0, 10);
    };
    expect(rangeFrom('week', '2026-11-18', mondayOf)).toBe('2026-11-16');
    expect(rangeFrom('month', '2026-11-18', mondayOf)).toBe('2026-10-26');
    expect(rangeFrom('all', '2026-11-18', mondayOf)).toBeNull();
  });
});
