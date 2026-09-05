import { evaluateSlot, WEEKDAYS, BusinessHours, Holiday } from './business-hours';

const businessHours: BusinessHours = {
  timeZone: 'Asia/Kolkata',
  days: {
    mon: { enabled: true, open: '09:00', close: '18:00' },
    tue: { enabled: true, open: '09:00', close: '18:00' },
    wed: { enabled: true, open: '09:00', close: '18:00' },
    thu: { enabled: true, open: '09:00', close: '18:00' },
    fri: { enabled: true, open: '09:00', close: '18:00' },
    sat: { enabled: false, open: '09:00', close: '18:00' },
    sun: { enabled: false, open: '09:00', close: '18:00' },
  },
};

const holidays: Holiday[] = [{ date: '2026-01-26', name: 'Republic Day' }];

describe('WEEKDAYS', () => {
  it('lists mon..sun in order', () => {
    expect(WEEKDAYS).toEqual(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
  });
});

describe('evaluateSlot', () => {
  it('is within hours for Tue 10:00 IST', () => {
    // 2026-01-27 is a Tuesday. 10:00 IST = 04:30 UTC.
    expect(evaluateSlot('2026-01-27T04:30:00.000Z', businessHours, holidays)).toEqual({
      outsideHours: false,
      holiday: null,
    });
  });

  it('is outside hours for Tue 20:00 IST', () => {
    // 20:00 IST = 14:30 UTC, same Tuesday.
    expect(evaluateSlot('2026-01-27T14:30:00.000Z', businessHours, holidays)).toEqual({
      outsideHours: true,
      holiday: null,
    });
  });

  it('is outside hours for a Sunday instant', () => {
    // 2026-01-25 is a Sunday. 12:00 IST = 06:30 UTC.
    expect(evaluateSlot('2026-01-25T06:30:00.000Z', businessHours, holidays)).toEqual({
      outsideHours: true,
      holiday: null,
    });
  });

  it('flags the holiday for a 2026-01-26 instant (IST), independent of hours', () => {
    // 2026-01-26 is a Monday, Republic Day. 10:00 IST = 04:30 UTC -> within hours too.
    expect(evaluateSlot('2026-01-26T04:30:00.000Z', businessHours, holidays)).toEqual({
      outsideHours: false,
      holiday: 'Republic Day',
    });
  });

  it('timezone proof: evaluates by the business-hours timezone, not UTC', () => {
    // Instant is Sun 2026-01-25 23:00 UTC, which is Mon 2026-01-26 04:30 in IST (UTC+5:30).
    // A naive UTC-based evaluation would see Sunday 2026-01-25 (disabled day, no holiday match).
    // The correct IST-based evaluation sees Monday 2026-01-26 (Republic Day, before opening).
    expect(evaluateSlot('2026-01-25T23:00:00.000Z', businessHours, holidays)).toEqual({
      outsideHours: true,
      holiday: 'Republic Day',
    });
  });

  it('handles the Intl hour12:false midnight quirk (24:00 -> 00:00)', () => {
    // Mon 2026-01-26 00:00 IST = Sun 2026-01-25 18:30 UTC.
    expect(evaluateSlot('2026-01-25T18:30:00.000Z', businessHours, holidays)).toEqual({
      outsideHours: true,
      holiday: 'Republic Day',
    });
  });

  it('returns no warning when businessHours is null', () => {
    expect(evaluateSlot('2026-01-27T04:30:00.000Z', null, holidays)).toEqual({
      outsideHours: false,
      holiday: null,
    });
  });
});
