import { componentDifference, correctionLabel, shouldBeLop, withDayChanged } from './late-corrections';
import type { Snapshot } from './calc';

describe('late corrections paid in the next run', () => {
  const types = [{ name: 'Leave without pay', code: 'LWP', paid: false }, { name: 'Casual leave', code: 'CL', paid: true }];

  it('what the day should have been: present and paid leave are paid, half a day half, unpaid leave unpaid', () => {
    expect(shouldBeLop({ source: 'late_request', change: { shouldBe: 'present' } }, types)).toBe(0);
    expect(shouldBeLop({ source: 'hr', change: { shouldBe: 'half_day' } }, types)).toBe(0.5);
    expect(shouldBeLop({ source: 'hr', change: { shouldBe: 'Leave without pay' } }, types)).toBe(1);
    expect(shouldBeLop({ source: 'hr', change: { shouldBe: 'cl' } }, types)).toBe(0);
    expect(shouldBeLop({ source: 'device_backfill', change: { punches: [] } }, types)).toBe(0);
  });

  it('pays the difference per earning component; statutory lines and equal components are left out', () => {
    const paid = [{ code: 'basic', kind: 'earning', amount: '9677.42' }, { code: 'hra', kind: 'earning', amount: '4838.71' }, { code: 'pf_employee', kind: 'deduction', amount: '1161.29' }, { code: 'special', kind: 'earning', amount: '0' }];
    const corrected = [{ code: 'basic', kind: 'earning', amount: '10000.00' }, { code: 'hra', kind: 'earning', amount: '5000.00' }, { code: 'pf_employee', kind: 'deduction', amount: '1200.00' }, { code: 'special', kind: 'earning', amount: '0' }];
    const out = componentDifference(paid, corrected, new Set(['pf_employee']));
    expect([...out.entries()].map(([k, v]) => [k, v.toFixed(2)])).toEqual([['basic', '322.58'], ['hra', '161.29']]);
  });

  it('a recovery is negative; the day never takes the month below no unpaid days', () => {
    const s = { attendance: { lopDays: '0.50', source: 'feed', otMinutes: { normal: 0, weeklyOff: 0, holiday: 0 }, timesheetMinutes: 0 } } as unknown as Snapshot;
    expect(withDayChanged(s, -1).attendance.lopDays).toBe('0.00');
    expect(withDayChanged(s, 1).attendance.lopDays).toBe('1.50');
    expect(correctionLabel('2026-12-05', -1, '2027-01-03')).toBe('Loss of pay reversed for 2026-12-05 (1 day; late correction approved 2027-01-03).');
    expect(correctionLabel('2026-12-05', 0.5, null)).toMatch(/^Loss of pay recovered for 2026-12-05 \(0.5 day; late correction\)/);
  });
});
