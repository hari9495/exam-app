import { CalendarSpec, addBusinessSeconds, businessSecondsBetween, isValidZone } from './business-time';

// §15.2 business time: weekends, holidays, half days, midnight, DST zones (Europe, US), a calendar version change.
const H = 3600;
const weekdays = (start: number, end: number, validFrom = '2020-01-01', validTo: string | null = null) =>
  [1, 2, 3, 4, 5].map((weekday) => ({ weekday, startMinute: start, endMinute: end, validFrom, validTo }));
const ist: CalendarSpec = { zone: 'Asia/Kolkata', hours: weekdays(9 * 60, 18 * 60), holidays: [] };
const at = (iso: string) => new Date(iso);

describe('business time (§8.2)', () => {
  it('adds within one day and across the night', () => {
    // Mon 5 Oct 2026, 10:00 IST + 4 h = 14:00 IST.
    expect(addBusinessSeconds(ist, at('2026-10-05T10:00:00+05:30'), 4 * H)).toEqual(at('2026-10-05T14:00:00+05:30'));
    // 16:00 + 4 h: 2 h today, 2 h tomorrow from 09:00.
    expect(addBusinessSeconds(ist, at('2026-10-05T16:00:00+05:30'), 4 * H)).toEqual(at('2026-10-06T11:00:00+05:30'));
    // Raised at night: the clock starts at 09:00.
    expect(addBusinessSeconds(ist, at('2026-10-05T23:30:00+05:30'), H)).toEqual(at('2026-10-06T10:00:00+05:30'));
  });

  it('skips the weekend', () => {
    // Fri 9 Oct 17:00 + 2 h → Mon 12 Oct 10:00.
    expect(addBusinessSeconds(ist, at('2026-10-09T17:00:00+05:30'), 2 * H)).toEqual(at('2026-10-12T10:00:00+05:30'));
    expect(businessSecondsBetween(ist, at('2026-10-09T17:00:00+05:30'), at('2026-10-12T10:00:00+05:30'))).toBe(2 * H);
  });

  it('skips holidays and keeps only the first half of a half day', () => {
    const cal: CalendarSpec = { ...ist, holidays: [{ on: '2026-10-20', halfDay: false }, { on: '2026-10-21', halfDay: true }] };
    // Mon 19 Oct 17:00 + 3 h: 1 h Monday, Tuesday is a holiday, Wednesday counts 09:00–13:30 (half of 9 h).
    expect(addBusinessSeconds(cal, at('2026-10-19T17:00:00+05:30'), 3 * H)).toEqual(at('2026-10-21T11:00:00+05:30'));
    expect(businessSecondsBetween(cal, at('2026-10-19T00:00:00+05:30'), at('2026-10-22T00:00:00+05:30'))).toBe(9 * H + 4.5 * H);
    // Past midday on the half day nothing counts.
    expect(businessSecondsBetween(cal, at('2026-10-21T14:00:00+05:30'), at('2026-10-21T18:00:00+05:30'))).toBe(0);
  });

  it('handles hours that run to and from midnight', () => {
    const night: CalendarSpec = {
      zone: 'Asia/Kolkata',
      hours: [{ weekday: 1, startMinute: 22 * 60, endMinute: 1440, validFrom: '2020-01-01', validTo: null }, { weekday: 2, startMinute: 0, endMinute: 2 * 60, validFrom: '2020-01-01', validTo: null }],
      holidays: [],
    };
    expect(addBusinessSeconds(night, at('2026-10-05T23:00:00+05:30'), 2 * H)).toEqual(at('2026-10-06T01:00:00+05:30'));
    expect(businessSecondsBetween(night, at('2026-10-05T21:00:00+05:30'), at('2026-10-06T03:00:00+05:30'))).toBe(4 * H);
  });

  it('counts real time across a DST change (Europe/London and America/New_York)', () => {
    // UK clocks go forward at 01:00 on Sun 29 Mar 2026; a 00:00–04:00 Sunday window is 3 real hours.
    const london: CalendarSpec = { zone: 'Europe/London', hours: [{ weekday: 7, startMinute: 0, endMinute: 4 * 60, validFrom: '2020-01-01', validTo: null }], holidays: [] };
    expect(businessSecondsBetween(london, at('2026-03-29T00:00:00Z'), at('2026-03-30T00:00:00Z'))).toBe(3 * H);
    // New York falls back at 02:00 on Sun 1 Nov 2026: 00:00–04:00 is 5 real hours.
    const ny: CalendarSpec = { zone: 'America/New_York', hours: [{ weekday: 7, startMinute: 0, endMinute: 4 * 60, validFrom: '2020-01-01', validTo: null }], holidays: [] };
    expect(businessSecondsBetween(ny, at('2026-11-01T00:00:00-04:00'), at('2026-11-02T00:00:00-05:00'))).toBe(5 * H);
    // Weekday hours keep their local times on both sides of the US spring change (8 Mar 2026).
    const nyDays: CalendarSpec = { zone: 'America/New_York', hours: weekdays(9 * 60, 17 * 60), holidays: [] };
    expect(addBusinessSeconds(nyDays, at('2026-03-06T16:00:00-05:00'), 2 * H)).toEqual(at('2026-03-09T10:00:00-04:00'));
  });

  it('uses the hours in force on each day when the calendar changes mid-ticket', () => {
    // 9–18 until Sun 11 Oct, then 10–14 from Mon 12 Oct.
    const changed: CalendarSpec = { zone: 'Asia/Kolkata', hours: [...weekdays(9 * 60, 18 * 60, '2020-01-01', '2026-10-11'), ...weekdays(10 * 60, 14 * 60, '2026-10-12')], holidays: [] };
    expect(businessSecondsBetween(changed, at('2026-10-09T09:00:00+05:30'), at('2026-10-13T00:00:00+05:30'))).toBe(9 * H + 4 * H);
    expect(addBusinessSeconds(changed, at('2026-10-09T17:00:00+05:30'), 3 * H)).toEqual(at('2026-10-12T12:00:00+05:30'));
  });

  it('is zero for an empty or reversed range, and refuses a calendar with no hours', () => {
    expect(businessSecondsBetween(ist, at('2026-10-05T12:00:00Z'), at('2026-10-05T11:00:00Z'))).toBe(0);
    expect(addBusinessSeconds(ist, at('2026-10-05T12:00:00Z'), 0)).toEqual(at('2026-10-05T12:00:00Z'));
    expect(() => addBusinessSeconds({ zone: 'UTC', hours: [], holidays: [] }, at('2026-10-05T12:00:00Z'), 60)).toThrow(RangeError);
    expect(isValidZone('Asia/Kolkata')).toBe(true);
    expect(isValidZone('Mars/Olympus')).toBe(false);
  });
});
