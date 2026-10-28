import { DateTime } from 'luxon';

// TIM-35 open shifts and TIM-38 standby and call-out: the pure parts (feature sheet rules 9 and 10 in
// docs/yukthix/time-design-map.md), unit-tested in roster-extras-rules.spec.ts.

export interface BidFacts {
  employeeId: string;
  code: string | null;
  /** Open shifts this person won in the 30 days before the shift. */
  won30: number;
  /** Minutes rostered in the shift's Monday–Sunday week (before this shift). */
  weekMinutes: number;
  bidAt: Date;
}

/**
 * Rule 9 fair order for "manager picks": fewest open shifts won in the last 30 days, then fewest rostered hours that
 * week, then the earliest bid, then the employee code (no code last). Returns a new array.
 */
export function fairOrder<T extends BidFacts>(bids: readonly T[]): T[] {
  return [...bids].sort((a, b) => a.won30 - b.won30 || a.weekMinutes - b.weekMinutes || a.bidAt.getTime() - b.bidAt.getTime() || (a.code ?? '￿').localeCompare(b.code ?? '￿') || a.employeeId.localeCompare(b.employeeId));
}

/** Rule 10: a call-out is paid at least the company minimum (hours, may be 0), whatever was worked. */
export const paidMinutes = (workedMinutes: number, minimumHours: number) => Math.max(workedMinutes, Math.round(minimumHours * 60));

/** Whole minutes between two instants (negative when `to` is before `from`). */
export const minutesBetween = (from: Date, to: Date) => Math.floor((to.getTime() - from.getTime()) / 60_000);

/** The instant a shift starts: `minutes` after local midnight of `on` in the location's zone. */
export const startsAt = (on: string, minutes: number, zone: string) => DateTime.fromISO(on, { zone }).plus({ minutes }).toJSDate();

/** The location's local date of an instant (yyyy-mm-dd). */
export const localDay = (at: Date, zone: string) => DateTime.fromJSDate(at, { zone }).toISODate()!;

/** The first shift that starts at or after `after`, from days in date order; null when none in the list. */
export function nextShift<S extends { shiftStart: number }>(days: readonly { on: string; shift: S | null }[], zone: string, after: Date): { on: string; shift: S; at: Date } | null {
  for (const d of days) {
    if (!d.shift) continue;
    const at = startsAt(d.on, d.shift.shiftStart, zone);
    if (at.getTime() >= after.getTime()) return { on: d.on, shift: d.shift, at };
  }
  return null;
}

export const MAX_SLOT_MINUTES = 24 * 60;
/** A standby slot's span: why it is refused, or null. */
export function slotSpanError(start: Date, end: Date): string | null {
  if (end.getTime() <= start.getTime()) return 'The end must be after the start.';
  if (minutesBetween(start, end) > MAX_SLOT_MINUTES) return 'A standby slot is at most 24 hours.';
  return null;
}

/** Two time spans overlap (end exclusive). */
export const overlaps = (a: { start: Date; end: Date }, b: { start: Date; end: Date }) => a.start.getTime() < b.end.getTime() && b.start.getTime() < a.end.getTime();
