import { nextRunAt } from './report-schedules.service';

// Answer 2690: schedules run at 07:00 India time; weekdays skip the weekend, weekly is Monday, monthly the 1st.
const ist = (d: Date) => new Date(d.getTime() + 5.5 * 3_600_000).toISOString().slice(0, 16).replace('T', ' ');

describe('nextRunAt', () => {
  it('daily: today at 07:00 if still ahead, else tomorrow', () => {
    expect(ist(nextRunAt('daily', new Date('2026-11-25T00:00:00Z')))).toBe('2026-11-25 07:00');
    expect(ist(nextRunAt('daily', new Date('2026-11-25T03:00:00Z')))).toBe('2026-11-26 07:00');
  });
  it('weekdays skip Saturday and Sunday; weekly is the next Monday', () => {
    expect(ist(nextRunAt('weekdays', new Date('2026-11-27T03:00:00Z')))).toBe('2026-11-30 07:00'); // Friday after 07:00
    expect(ist(nextRunAt('weekly', new Date('2026-11-25T03:00:00Z')))).toBe('2026-11-30 07:00');
    expect(ist(nextRunAt('weekly', new Date('2026-11-30T03:00:00Z')))).toBe('2026-12-07 07:00');
  });
  it('monthly is the 1st, across the year end', () => {
    expect(ist(nextRunAt('monthly', new Date('2026-11-25T03:00:00Z')))).toBe('2026-12-01 07:00');
    expect(ist(nextRunAt('monthly', new Date('2026-12-15T03:00:00Z')))).toBe('2027-01-01 07:00');
    expect(ist(nextRunAt('monthly', new Date('2026-12-01T00:00:00Z')))).toBe('2026-12-01 07:00');
  });
});
