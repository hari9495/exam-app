import { DateTime } from 'luxon';

// SD-1.06 automatic assignment (US-B-087, US-G-011, YX-SD-04/05): pure rules, so they are unit tested on their own.
// The service feeds them the group's members who hold an agent seat today with their open-ticket counts.

export type AssignmentMethod = 'manual' | 'round_robin' | 'load';

export interface AgentAvailability {
  status: string;
  awayUntil: Date | null;
  shiftStartMinute: number | null;
  shiftEndMinute: number | null;
  shiftDays: number[];
  shiftTimeZone: string | null;
}

/**
 * YX-SD-05: an agent gets new tickets only when not away and inside their shift (when they set one). "Away until"
 * ends by itself. A shift may run past midnight (22:00–06:00 belongs to the day it starts).
 */
export function isAvailable(a: AgentAvailability | null | undefined, now: Date): boolean {
  if (!a) return true;
  if (a.status === 'away' && (a.awayUntil === null || a.awayUntil > now)) return false;
  if (a.shiftStartMinute === null || a.shiftEndMinute === null || !a.shiftTimeZone) return true;
  const local = DateTime.fromJSDate(now, { zone: a.shiftTimeZone });
  const minute = local.hour * 60 + local.minute;
  const { shiftStartMinute: start, shiftEndMinute: end } = a;
  if (start < end) return a.shiftDays.includes(local.weekday) && minute >= start && minute < end;
  // Overnight: the evening part today, or the morning part of a shift that started yesterday.
  const yesterday = local.minus({ days: 1 }).weekday;
  return (a.shiftDays.includes(local.weekday) && minute >= start) || (a.shiftDays.includes(yesterday) && minute < end);
}

export interface Candidate {
  userId: string;
  open: number;
}

/**
 * The next owner, or null when nobody is free (the ticket then waits in the group queue, YX-SD-05).
 * round_robin: the next member after the last one who got a ticket, in a stable order.
 * load: the fewest open tickets; ties go by the same stable order.
 * A member already at the group's cap gets nothing new.
 */
export function chooseAgent(method: AssignmentMethod, candidates: readonly Candidate[], lastAssignedUserId: string | null, maxOpen: number | null): string | null {
  if (method === 'manual') return null;
  const pool = [...candidates].filter((c) => maxOpen === null || c.open < maxOpen).sort((a, b) => a.userId.localeCompare(b.userId));
  if (!pool.length) return null;
  if (method === 'load') return pool.reduce((best, c) => (c.open < best.open ? c : best)).userId;
  const next = pool.find((c) => lastAssignedUserId !== null && c.userId.localeCompare(lastAssignedUserId) > 0);
  return (next ?? pool[0]).userId;
}

/**
 * Founder decision 8 Oct 2026: half-day leave means away only for that half. The first half runs to 13:00 local time,
 * the second half from 13:00; a full day is away all day.
 */
export function onLeaveNow(part: 'full' | 'first' | 'second', zone: string, now: Date): boolean {
  if (part === 'full') return true;
  const local = DateTime.fromJSDate(now, { zone });
  const morning = local.hour < 13;
  return part === 'first' ? morning : !morning;
}
