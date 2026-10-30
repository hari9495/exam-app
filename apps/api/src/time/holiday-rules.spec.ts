import { cloneToYear, holidayCompOffDue, recountedDay, substituteDays, templateRows } from './holiday-rules';
import { isWeeklyOff } from './time-maths';
import { resolveDay } from './time-rules';

const h = (on: string, name: string, kind = 'national', halfDay = false) => ({ on, name, kind, halfDay });

// TIM-26 comp-off for a holiday on a weekly off follows each person's own day (founder, 30 Oct 2026).
describe('holidayCompOffDue (roster, pattern, then location)', () => {
  const shift = { shiftId: 's1', name: 'Morning', night: false, shiftStart: 360, shiftEnd: 840, graceMinutes: 10, halfDayMinutes: 240, fullDayMinutes: 480, breakMinutes: 30, breakAboveMinutes: 300 };
  const loc = (weeklyOff: boolean) => ({ rule: shift, weeklyOff });
  const day = (roster: { shiftId: string | null; isOff: boolean } | null, pattern: string | null | undefined, locOff: boolean) => holidayCompOffDue(resolveDay({ roster, pattern, location: loc(locOff), shiftOn: () => shift }));
  it('rostered off on the holiday: credit, even when the location works that day', () => expect(day({ shiftId: null, isOff: true }, undefined, false)).toBe(true));
  it('rostered to work on the location weekly off: no credit (the holiday rule applies)', () => expect(day({ shiftId: 's1', isOff: false }, undefined, true)).toBe(false));
  it('a pattern off day: credit; a pattern work day on the location weekly off: none', () => {
    expect(day(null, null, false)).toBe(true);
    expect(day(null, 's1', true)).toBe(false);
  });
  it('no roster and no pattern: the location decides', () => {
    expect(day(null, undefined, true)).toBe(true);
    expect(day(null, undefined, false)).toBe(false);
  });
  it('a roster entry with no shift counts as off', () => expect(day({ shiftId: null, isOff: false }, 's1', false)).toBe(true));
});

describe('recountedDay (a holiday removed or moved off a leave day)', () => {
  it('a working day is leave again as booked: full or half', () => {
    expect(recountedDay('full', false)).toEqual({ portion: 1, countedAs: 'leave' });
    expect(recountedDay('first', false)).toEqual({ portion: 0.5, countedAs: 'leave' });
    expect(recountedDay('second', false)).toEqual({ portion: 0.5, countedAs: 'leave' });
  });
  it("the person's weekly off stays not counted", () => expect(recountedDay('full', true)).toEqual({ portion: 0, countedAs: 'weekly_off' }));
});

describe('holiday calendar rules (TIM-26)', () => {
  it('clone keeps day and month, asks to confirm festivals only', () => {
    const out = cloneToYear([h('2026-11-08', 'Deepavali', 'festival'), h('2026-01-26', 'Republic Day'), h('2026-10-10', 'Mahalaya', 'optional')], 2027);
    expect(out).toEqual([
      { on: '2027-01-26', name: 'Republic Day', kind: 'national', halfDay: false, confirm: false },
      { on: '2027-10-10', name: 'Mahalaya', kind: 'optional', halfDay: false, confirm: true },
      { on: '2027-11-08', name: 'Deepavali', kind: 'festival', halfDay: false, confirm: true },
    ]);
  });
  it('clone moves 29 Feb to 28 Feb and never makes two holidays on one date', () => {
    expect(cloneToYear([h('2028-02-29', 'Leap'), h('2028-02-28', 'Other')], 2029).map((x) => x.on)).toEqual(['2029-02-28']);
  });
  it('template keeps days from the start date to 31 Dec, as state holidays', () => {
    const out = templateRows([h('2026-01-26', 'Republic Day'), h('2026-11-01', 'Rajyotsava'), h('2026-11-01', 'Twice'), h('2027-01-26', 'Next year')], '2026-10-30');
    expect(out).toEqual([{ on: '2026-11-01', name: 'Rajyotsava', kind: 'state', halfDay: false }]);
  });
  it('template from a date after every holiday is empty', () => {
    expect(templateRows([h('2026-01-26', 'Republic Day')], '2026-12-31')).toEqual([]);
  });
  describe('substitute day off', () => {
    const sunday = (on: string) => isWeeklyOff(on, [{ weekday: 7 }]);
    it('a holiday on a Sunday gives Monday', () => {
      expect(substituteDays([h('2026-11-08', 'Deepavali', 'festival')], sunday)).toEqual([{ on: '2026-11-09', name: 'Deepavali (substitute day off)', forOn: '2026-11-08' }]);
    });
    it('skips a Monday that is already a holiday', () => {
      expect(substituteDays([h('2026-11-08', 'A'), h('2026-11-09', 'B')], sunday).map((x) => x.on)).toEqual(['2026-11-10']);
    });
    it('gives nothing for a working day, a half day or an optional holiday', () => {
      expect(substituteDays([h('2026-11-09', 'Mon'), h('2026-11-15', 'Half', 'national', true), h('2026-11-22', 'Opt', 'optional')], sunday)).toEqual([]);
    });
    it('stops after two weeks when every day is off', () => {
      expect(substituteDays([h('2026-11-08', 'A')], () => true)[0].on).toBe('2026-11-23');
    });
  });
});
