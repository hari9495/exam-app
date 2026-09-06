import { evaluateSlot } from './business-hours-eval';
import type { BusinessHours, Holiday } from './types';

// Mirrors packages/shared/src/scheduling/business-hours.spec.ts's cases -- this is a duplicated
// (not imported, see business-hours-eval.ts's comment) copy of evaluateSlot for the web bundle.
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

describe('evaluateSlot (web copy)', () => {
  it('is within hours for Tue 10:00 IST', () => {
    expect(evaluateSlot('2026-01-27T04:30:00.000Z', businessHours, holidays)).toEqual({
      outsideHours: false,
      holiday: null,
    });
  });

  it('is outside hours for Tue 20:00 IST', () => {
    expect(evaluateSlot('2026-01-27T14:30:00.000Z', businessHours, holidays)).toEqual({
      outsideHours: true,
      holiday: null,
    });
  });

  it('is outside hours on a disabled day (Sunday)', () => {
    expect(evaluateSlot('2026-01-25T06:30:00.000Z', businessHours, holidays)).toEqual({
      outsideHours: true,
      holiday: null,
    });
  });

  it('flags the holiday independent of hours', () => {
    // 2026-01-26 is Monday (Republic Day), 10:00 IST = within hours too.
    expect(evaluateSlot('2026-01-26T04:30:00.000Z', businessHours, holidays)).toEqual({
      outsideHours: false,
      holiday: 'Republic Day',
    });
  });

  it('timezone proof: evaluates by the business-hours timezone, not UTC', () => {
    // Sun 2026-01-25 23:00 UTC = Mon 2026-01-26 04:30 IST (Republic Day, before opening).
    expect(evaluateSlot('2026-01-25T23:00:00.000Z', businessHours, holidays)).toEqual({
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
