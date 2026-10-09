import { DateTime, IANAZone } from 'luxon';

// §8.2 business time: one small pure module, shared with P03 approvals. A calendar is a time zone, weekly working
// hours that are effective-dated (an old ticket keeps old maths) and holidays (a half day keeps the first or second half of that
// day's working time, as the calendar says). Hours are local wall-clock times; luxon turns them into real instants, so a DST change day is
// simply shorter or longer. Everything in and out is a UTC instant.

export interface CalendarHours {
  /** ISO weekday, 1 = Monday. */
  weekday: number;
  startMinute: number;
  /** Exclusive; 1440 = midnight at the end of the day. */
  endMinute: number;
  /** yyyy-mm-dd, inclusive. */
  validFrom: string;
  validTo: string | null;
}

export interface CalendarSpec {
  zone: string;
  hours: readonly CalendarHours[];
  holidays: readonly { on: string; halfDay: boolean }[];
  /** Founder decision 8 Oct 2026: on a half-day holiday this half of the working time stays open (default first). */
  // Founder decision 8 Oct 2026: the calendar screen says "Working half: Morning / Afternoon" (first = morning worked).
  halfDayOpen?: 'first' | 'second';
  /**
   * A person's approved leave (M02), for timers that follow one person (task OLAs, assignment). A half-day leave takes
   * away only that half of their working time. Empty until M02 exists.
   */
  leave?: readonly { on: string; part: 'full' | 'first' | 'second' }[];
}

/** Keeps the first or second half of a day's working intervals (by working time, not by the clock). */
function keepHalf(intervals: [number, number][], half: 'first' | 'second'): [number, number][] {
  const list = half === 'first' ? intervals : [...intervals].reverse().map(([a, b]) => [-b, -a] as [number, number]);
  let left = list.reduce((sum, [a, b]) => sum + (b - a), 0) / 2;
  const kept = list.flatMap(([a, b]) => {
    const take = Math.min(b - a, left);
    left -= take;
    return take > 0 ? [[a, a + take] as [number, number]] : [];
  });
  return half === 'first' ? kept : kept.map(([a, b]) => [-b, -a] as [number, number]).reverse();
}

// ponytail: walks day by day; ten years is the ceiling for one call (a target longer than that is a set-up error).
const MAX_DAYS = 3660;

export const isValidZone = (zone: string) => IANAZone.isValidZone(zone);

/** The working intervals [start, end) in epoch ms of one local day. */
export function workingIntervals(cal: CalendarSpec, day: DateTime): [number, number][] {
  const iso = day.toISODate()!;
  const holiday = cal.holidays.find((h) => h.on === iso);
  if (holiday && !holiday.halfDay) return [];
  const leave = cal.leave?.find((l) => l.on === iso);
  if (leave?.part === 'full') return [];
  const at = (minute: number) => (minute >= 1440 ? day.plus({ days: 1 }).startOf('day') : day.set({ hour: Math.floor(minute / 60), minute: minute % 60, second: 0, millisecond: 0 })).toMillis();
  let intervals = cal.hours
    .filter((h) => h.weekday === day.weekday && h.validFrom <= iso && (h.validTo === null || iso <= h.validTo))
    .sort((a, b) => a.startMinute - b.startMinute)
    .map((h) => [at(h.startMinute), at(h.endMinute)] as [number, number])
    .filter(([a, b]) => b > a);
  if (holiday?.halfDay) intervals = keepHalf(intervals, cal.halfDayOpen ?? 'first');
  // Half-day leave: the person is away for that half of what is left.
  if (leave) intervals = keepHalf(intervals, leave.part === 'first' ? 'second' : 'first');
  return intervals;
}

const startDay = (cal: CalendarSpec, ms: number) => DateTime.fromMillis(ms, { zone: cal.zone }).startOf('day');

/** The instant that is `seconds` of working time after `start` (YX-SD SLA targets, P03 timeouts). */
export function addBusinessSeconds(cal: CalendarSpec, start: Date, seconds: number): Date {
  if (seconds < 0) throw new RangeError('seconds must not be negative');
  if (seconds === 0) return new Date(start);
  let remaining = seconds * 1000;
  const from = start.getTime();
  let day = startDay(cal, from);
  for (let i = 0; i < MAX_DAYS; i++, day = day.plus({ days: 1 })) {
    for (const [a, b] of workingIntervals(cal, day)) {
      if (b <= from) continue;
      const s = Math.max(a, from);
      if (remaining <= b - s) return new Date(s + remaining);
      remaining -= b - s;
    }
  }
  throw new RangeError('The calendar has no working time in the next ten years');
}

/** Working seconds between two instants (0 when `to` is not after `from`). */
export function businessSecondsBetween(cal: CalendarSpec, from: Date, to: Date): number {
  const a0 = from.getTime();
  const b0 = to.getTime();
  if (b0 <= a0) return 0;
  let total = 0;
  let day = startDay(cal, a0);
  for (let i = 0; i < MAX_DAYS && day.toMillis() < b0; i++, day = day.plus({ days: 1 })) {
    for (const [a, b] of workingIntervals(cal, day)) total += Math.max(0, Math.min(b, b0) - Math.max(a, a0));
  }
  return Math.floor(total / 1000);
}
