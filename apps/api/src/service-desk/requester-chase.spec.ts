import { businessDaysSince, chaseStep } from './requester-chase';
import type { CalendarSpec } from './business-time';

// Batch F GLPI 4 (answer 2571).
const CAL: CalendarSpec = { zone: 'Asia/Kolkata', hours: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, startMinute: 570, endMinute: 1110, validFrom: '2020-01-01', validTo: null })), holidays: [{ on: '2026-11-20', halfDay: false }] };
const at = (iso: string) => new Date(`${iso}+05:30`);

describe('requester chase', () => {
  it('counts business days after the waiting day, once the calendar has opened on them; weekends and holidays do not count', () => {
    // Waiting from Monday 16 Nov 2026, 15:00.
    const from = at('2026-11-16T15:00:00');
    expect(businessDaysSince(CAL, from, at('2026-11-16T18:00:00'))).toBe(0);
    expect(businessDaysSince(CAL, from, at('2026-11-17T09:00:00'))).toBe(0); // before Tuesday opens
    expect(businessDaysSince(CAL, from, at('2026-11-17T09:30:00'))).toBe(1);
    expect(businessDaysSince(CAL, from, at('2026-11-19T12:00:00'))).toBe(3);
    // Friday 20 Nov is a holiday; Saturday and Sunday are off: still 3 until Monday opens.
    expect(businessDaysSince(CAL, from, at('2026-11-23T08:00:00'))).toBe(3);
    expect(businessDaysSince(CAL, from, at('2026-11-23T10:00:00'))).toBe(4);
    expect(businessDaysSince(CAL, from, from)).toBe(0);
  });

  it('chases once per business day up to the most, then solves on the set day', () => {
    const s = (businessDays: number, chased: number) => chaseStep({ businessDays, chased, max: 3, solveDays: 5 });
    expect(s(0, 0)).toBeNull();
    expect(s(1, 0)).toBe('chase');
    expect(s(1, 1)).toBeNull(); // already chased today
    expect(s(2, 1)).toBe('chase');
    expect(s(3, 2)).toBe('chase');
    expect(s(4, 3)).toBeNull(); // at most 3
    expect(s(5, 3)).toBe('solve');
    expect(s(9, 0)).toBe('solve'); // the job was down: solve, never a burst of reminders
    expect(chaseStep({ businessDays: 2, chased: 0, max: 0, solveDays: 5 })).toBeNull();
  });
});
