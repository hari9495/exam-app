import { sixMonthsBefore } from './whats-new.service';

// Founder answer 994: What's new shows the last 6 months only.
describe('sixMonthsBefore', () => {
  it('goes back six calendar months, to the month end when the day does not exist', () => {
    expect(sixMonthsBefore('2026-11-12')).toBe('2026-05-12');
    expect(sixMonthsBefore('2026-03-15')).toBe('2025-09-15');
    expect(sixMonthsBefore('2026-08-31')).toBe('2026-02-28');
    expect(sixMonthsBefore('2028-08-31')).toBe('2028-02-29');
  });
});
