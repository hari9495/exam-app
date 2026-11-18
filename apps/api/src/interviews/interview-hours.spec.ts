import { interviewBookingRules } from './interview-hours';
import { generateBookableSlots } from './booking-slots';

// Answers 2423 and 2510: self-booking follows the 6.1 interview hours and the holiday calendar of the job's location
// (else the company-wide one); optional holidays stay open.
const setting = (rows: { key: string; value: string }[]) => ({ findMany: jest.fn(async ({ where }: { where: { key: string } }) => rows.filter((r) => r.key === where.key).map((r, i) => ({ id: `s${i}`, scopeType: 'tenant', scopeId: 'org', value: r.value, validFrom: null }))) });
const tx = (rows: { key: string; value: string }[], calendars: { id: string; locationId: string | null }[], holidays: Record<string, { holidayOn: Date; name: string }[]>) =>
  ({
    setting: setting(rows),
    holidayCalendar: { findMany: jest.fn(async () => calendars) },
    holiday: { findMany: jest.fn(async ({ where }: { where: { calendarId: string; kind: { in: string[] } } }) => (expect(where.kind.in).toEqual(['national', 'festival']), holidays[where.calendarId] ?? [])) },
  }) as never;

describe('interviewBookingRules', () => {
  it('defaults: 09:30 to 18:30, Monday to Friday, India time; no calendar, no holidays', async () => {
    const r = await interviewBookingRules(tx([], [], {}), 'org', null);
    expect(r.businessHours.timeZone).toBe('Asia/Kolkata');
    expect(r.businessHours.days.mon).toEqual({ enabled: true, open: '09:30', close: '18:30' });
    expect(r.businessHours.days.sat.enabled).toBe(false);
    expect(r.holidays).toEqual([]);
  });

  it('the job location’s calendar wins over the company-wide one; without it, the company-wide one', async () => {
    const cals = [{ id: 'all', locationId: null }, { id: 'hosur', locationId: 'loc-h' }];
    const hol = { all: [{ holidayOn: new Date('2026-12-25'), name: 'Christmas' }], hosur: [{ holidayOn: new Date('2026-11-09'), name: 'Deepavali' }] };
    expect((await interviewBookingRules(tx([], cals, hol), 'org', 'loc-h')).holidays).toEqual([{ date: '2026-11-09', name: 'Deepavali' }]);
    expect((await interviewBookingRules(tx([], cals, hol), 'org', 'loc-other')).holidays).toEqual([{ date: '2026-12-25', name: 'Christmas' }]);
  });

  it('company hours and days; slots outside them or on a holiday are not offered', async () => {
    const rules = await interviewBookingRules(tx([{ key: 'hiring.interview_hours.from', value: '10:00' }, { key: 'hiring.interview_hours.to', value: '12:00' }, { key: 'hiring.interview_hours.days', value: 'mon,sat' }], [{ id: 'all', locationId: null }], { all: [{ holidayOn: new Date('2026-11-23'), name: 'Founders day' }] }), 'org', null);
    const slots = (from: string, to: string) => generateBookableSlots({ windowStart: from, windowEnd: to, slotDurationMinutes: 60, ...rules, busyIntervals: [], now: '2026-11-01T00:00:00Z' }).map((s) => s.startsAt);
    // Sat 21 Nov 2026, IST 09:00-13:00 (03:30-07:30 UTC): only 10:00 and 11:00 IST.
    expect(slots('2026-11-21T03:30:00Z', '2026-11-21T07:30:00Z')).toEqual(['2026-11-21T04:30:00.000Z', '2026-11-21T05:30:00.000Z']);
    // Fri 20 Nov is not a booking day; Mon 23 Nov is a holiday.
    expect(slots('2026-11-20T04:30:00Z', '2026-11-20T06:30:00Z')).toEqual([]);
    expect(slots('2026-11-23T04:30:00Z', '2026-11-23T06:30:00Z')).toEqual([]);
  });
});
