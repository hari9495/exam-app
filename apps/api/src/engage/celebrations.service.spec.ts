import { sameDay } from './celebrations.service';

describe('celebrations: the same day of the year', () => {
  it('matches month and day only; 29 Feb is celebrated on 28 Feb outside leap years', () => {
    expect(sameDay('1990-11-25', '2026-11-25')).toBe(true);
    expect(sameDay('1990-11-24', '2026-11-25')).toBe(false);
    expect(sameDay('1992-02-29', '2026-02-28')).toBe(true);
    expect(sameDay('1992-02-29', '2028-02-28')).toBe(false);
    expect(sameDay('1992-02-29', '2028-02-29')).toBe(true);
  });
});
