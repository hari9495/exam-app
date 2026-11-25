import { dayKinds } from './payslip-days';

describe('payslip days strip (founder answer 6)', () => {
  const base = { from: '2026-02-01', to: '2026-02-28', joinedOn: '2020-01-01', exitedOn: null, today: '2026-03-05', rows: new Map(), leavePaid: new Map<string, boolean>() };

  it('one cell per day of the month; days with no attendance row are paid', () => {
    const d = dayKinds(base);
    expect(d).toHaveLength(28);
    expect(d.every((x) => x.kind === 'paid')).toBe(true);
    expect(dayKinds({ ...base, from: '2028-02-01', to: '2028-02-29', today: '2028-03-01' })).toHaveLength(29);
  });

  it('maps holidays, weekly offs, paid and unpaid leave, absences and half days', () => {
    const rows = new Map([
      ['2026-02-01', { status: 'weekly_off', leavePart: null }],
      ['2026-02-02', { status: 'holiday', leavePart: null }],
      ['2026-02-03', { status: 'leave', leavePart: 'full' }],
      ['2026-02-04', { status: 'leave', leavePart: 'full' }],
      ['2026-02-05', { status: 'absent', leavePart: null }],
      ['2026-02-06', { status: 'half_day', leavePart: null }],
      ['2026-02-07', { status: 'present', leavePart: null }],
    ]);
    const d = dayKinds({ ...base, rows, leavePaid: new Map([['2026-02-04', false]]) });
    expect(d.slice(0, 7).map((x) => x.kind)).toEqual(['off', 'holiday', 'leave', 'lop', 'lop', 'lop', 'paid']);
  });

  it('only the days employed; after today is "not yet"', () => {
    const d = dayKinds({ ...base, joinedOn: '2026-02-10', exitedOn: '2026-02-20', today: '2026-02-15' });
    expect(d.map((x) => x.day)).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
    expect(d.filter((x) => x.kind === 'future').map((x) => x.day)).toEqual([16, 17, 18, 19, 20]);
  });
});
