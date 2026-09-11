import { generateBookableSlots, BookableSlotsInput } from './booking-slots';
import { BusinessHours } from '@exam-platform/shared';

// 2026-09-07 is a Monday (UTC), 2026-09-08 is a Tuesday.
const NINE_TO_FIVE_MON_FRI: BusinessHours = {
  timeZone: 'UTC',
  days: {
    mon: { enabled: true, open: '09:00', close: '17:00' },
    tue: { enabled: true, open: '09:00', close: '17:00' },
    wed: { enabled: true, open: '09:00', close: '17:00' },
    thu: { enabled: true, open: '09:00', close: '17:00' },
    fri: { enabled: true, open: '09:00', close: '17:00' },
    sat: { enabled: false, open: '09:00', close: '17:00' },
    sun: { enabled: false, open: '09:00', close: '17:00' },
  },
};

const FAR_PAST_NOW = '2020-01-01T00:00:00.000Z';

function baseInput(overrides: Partial<BookableSlotsInput> = {}): BookableSlotsInput {
  return {
    windowStart: '2026-09-07T09:00:00.000Z',
    windowEnd: '2026-09-07T11:00:00.000Z',
    slotDurationMinutes: 30,
    businessHours: NINE_TO_FIVE_MON_FRI,
    holidays: [],
    busyIntervals: [],
    now: FAR_PAST_NOW,
    leadTimeMinutes: 0,
    ...overrides,
  };
}

describe('generateBookableSlots', () => {
  it('slices the window into duration-sized slots', () => {
    const result = generateBookableSlots(baseInput());
    expect(result.map((s) => s.startsAt)).toEqual([
      '2026-09-07T09:00:00.000Z',
      '2026-09-07T09:30:00.000Z',
      '2026-09-07T10:00:00.000Z',
      '2026-09-07T10:30:00.000Z',
    ]);
    expect(result[0]).toEqual({
      startsAt: '2026-09-07T09:00:00.000Z',
      endsAt: '2026-09-07T09:30:00.000Z',
    });
  });

  it('excludes a slot whose end exceeds business-hours close', () => {
    const closeAtEleven: BusinessHours = {
      ...NINE_TO_FIVE_MON_FRI,
      days: { ...NINE_TO_FIVE_MON_FRI.days, mon: { enabled: true, open: '09:00', close: '11:00' } },
    };
    const result = generateBookableSlots(
      baseInput({
        businessHours: closeAtEleven,
        windowStart: '2026-09-07T10:45:00.000Z',
        windowEnd: '2026-09-07T11:15:00.000Z',
      }),
    );
    expect(result).toEqual([]);
  });

  it('includes a slot that ends exactly at business-hours close', () => {
    const closeAtEleven: BusinessHours = {
      ...NINE_TO_FIVE_MON_FRI,
      days: { ...NINE_TO_FIVE_MON_FRI.days, mon: { enabled: true, open: '09:00', close: '11:00' } },
    };
    const result = generateBookableSlots(
      baseInput({
        businessHours: closeAtEleven,
        windowStart: '2026-09-07T10:30:00.000Z',
        windowEnd: '2026-09-07T11:00:00.000Z',
      }),
    );
    expect(result).toEqual([
      { startsAt: '2026-09-07T10:30:00.000Z', endsAt: '2026-09-07T11:00:00.000Z' },
    ]);
  });

  it('excludes a slot on an org holiday date', () => {
    const result = generateBookableSlots(
      baseInput({
        holidays: [{ date: '2026-09-07', name: 'Labor Day' }],
      }),
    );
    expect(result).toEqual([]);
  });

  it('excludes a slot straddling into a holiday at its tail end', () => {
    // Slot from 23:45 Mon into 00:15 Tue; Tue 2026-09-08 is a holiday.
    // Business hours close at 23:59 so the start instant itself is "in hours".
    const lateHours: BusinessHours = {
      timeZone: 'UTC',
      days: {
        mon: { enabled: true, open: '00:00', close: '23:59' },
        tue: { enabled: true, open: '00:00', close: '23:59' },
        wed: { enabled: true, open: '00:00', close: '23:59' },
        thu: { enabled: true, open: '00:00', close: '23:59' },
        fri: { enabled: true, open: '00:00', close: '23:59' },
        sat: { enabled: true, open: '00:00', close: '23:59' },
        sun: { enabled: true, open: '00:00', close: '23:59' },
      },
    };
    const result = generateBookableSlots(
      baseInput({
        businessHours: lateHours,
        holidays: [{ date: '2026-09-08', name: 'Holiday' }],
        windowStart: '2026-09-07T23:45:00.000Z',
        windowEnd: '2026-09-08T00:15:00.000Z',
      }),
    );
    expect(result).toEqual([]);
  });

  it('excludes a slot starting before now + leadTime', () => {
    const result = generateBookableSlots(
      baseInput({
        now: '2026-09-07T08:30:00.000Z',
        leadTimeMinutes: 60,
      }),
    );
    // earliest allowed start is 09:30; 09:00 slot excluded, 09:30 onward kept
    expect(result.map((s) => s.startsAt)).toEqual([
      '2026-09-07T09:30:00.000Z',
      '2026-09-07T10:00:00.000Z',
      '2026-09-07T10:30:00.000Z',
    ]);
  });

  it('defaults leadTimeMinutes to 60 when omitted', () => {
    const input = baseInput({ now: '2026-09-07T08:30:00.000Z' });
    delete (input as Partial<BookableSlotsInput>).leadTimeMinutes;
    const result = generateBookableSlots(input);
    expect(result.map((s) => s.startsAt)).toEqual([
      '2026-09-07T09:30:00.000Z',
      '2026-09-07T10:00:00.000Z',
      '2026-09-07T10:30:00.000Z',
    ]);
  });

  describe('conflicts with busyIntervals', () => {
    const singleSlotWindow = {
      windowStart: '2026-09-07T09:00:00.000Z',
      windowEnd: '2026-09-07T09:30:00.000Z',
    };

    it('excludes on a left-edge overlap (busy interval starts before, ends inside)', () => {
      const result = generateBookableSlots(
        baseInput({ ...singleSlotWindow, busyIntervals: [{ startsAt: '2026-09-07T08:45:00.000Z', endsAt: '2026-09-07T09:15:00.000Z' }] }),
      );
      expect(result).toEqual([]);
    });

    it('excludes on a right-edge overlap (busy interval starts inside, ends after)', () => {
      const result = generateBookableSlots(
        baseInput({ ...singleSlotWindow, busyIntervals: [{ startsAt: '2026-09-07T09:15:00.000Z', endsAt: '2026-09-07T09:45:00.000Z' }] }),
      );
      expect(result).toEqual([]);
    });

    it('excludes when the busy interval fully contains the slot', () => {
      const result = generateBookableSlots(
        baseInput({ ...singleSlotWindow, busyIntervals: [{ startsAt: '2026-09-07T08:00:00.000Z', endsAt: '2026-09-07T10:00:00.000Z' }] }),
      );
      expect(result).toEqual([]);
    });

    it('excludes when the slot fully contains the busy interval', () => {
      const result = generateBookableSlots(
        baseInput({ ...singleSlotWindow, busyIntervals: [{ startsAt: '2026-09-07T09:10:00.000Z', endsAt: '2026-09-07T09:20:00.000Z' }] }),
      );
      expect(result).toEqual([]);
    });

    it('includes a slot merely adjacent to a busy interval (touching, not overlapping)', () => {
      const result = generateBookableSlots(
        baseInput({
          ...singleSlotWindow,
          busyIntervals: [
            { startsAt: '2026-09-07T08:00:00.000Z', endsAt: '2026-09-07T09:00:00.000Z' },
            { startsAt: '2026-09-07T09:30:00.000Z', endsAt: '2026-09-07T10:00:00.000Z' },
          ],
        }),
      );
      expect(result).toEqual([
        { startsAt: '2026-09-07T09:00:00.000Z', endsAt: '2026-09-07T09:30:00.000Z' },
      ]);
    });
  });

  it('yields no slots on a weekday with enabled:false', () => {
    const noTuesday: BusinessHours = {
      ...NINE_TO_FIVE_MON_FRI,
      days: { ...NINE_TO_FIVE_MON_FRI.days, tue: { enabled: false, open: '09:00', close: '17:00' } },
    };
    const result = generateBookableSlots(
      baseInput({
        businessHours: noTuesday,
        windowStart: '2026-09-08T09:00:00.000Z',
        windowEnd: '2026-09-08T11:00:00.000Z',
      }),
    );
    expect(result).toEqual([]);
  });

  it('treats businessHours: null as a no-op on the hours/holiday check', () => {
    // Window is at midnight UTC, which would normally be outside 09-17 hours.
    const result = generateBookableSlots(
      baseInput({
        businessHours: null,
        holidays: [{ date: '2026-09-07', name: 'Would-be holiday' }],
        windowStart: '2026-09-07T00:00:00.000Z',
        windowEnd: '2026-09-07T01:00:00.000Z',
      }),
    );
    expect(result.map((s) => s.startsAt)).toEqual([
      '2026-09-07T00:00:00.000Z',
      '2026-09-07T00:30:00.000Z',
    ]);
  });

  it('evaluates business hours in businessHours.timeZone, not UTC', () => {
    // America/New_York is UTC-4 in September (EDT).
    const nyHours: BusinessHours = {
      timeZone: 'America/New_York',
      days: {
        mon: { enabled: true, open: '09:00', close: '17:00' },
        tue: { enabled: true, open: '09:00', close: '17:00' },
        wed: { enabled: true, open: '09:00', close: '17:00' },
        thu: { enabled: true, open: '09:00', close: '17:00' },
        fri: { enabled: true, open: '09:00', close: '17:00' },
        sat: { enabled: false, open: '09:00', close: '17:00' },
        sun: { enabled: false, open: '09:00', close: '17:00' },
      },
    };
    // 2026-09-08T12:30:00Z = 08:30 EDT (before 09:00 local open) -> excluded
    // 2026-09-08T13:00:00Z = 09:00 EDT (at open) -> included
    const result = generateBookableSlots(
      baseInput({
        businessHours: nyHours,
        windowStart: '2026-09-08T12:30:00.000Z',
        windowEnd: '2026-09-08T13:30:00.000Z',
      }),
    );
    expect(result).toEqual([
      { startsAt: '2026-09-08T13:00:00.000Z', endsAt: '2026-09-08T13:30:00.000Z' },
    ]);
  });
});
