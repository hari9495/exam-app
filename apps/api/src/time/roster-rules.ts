import { DateTime } from 'luxon';
import { addDays } from './time-maths';
import { ShiftTimes, mondayOf, restConflicts, scheduledMinutes, shiftLength } from './time-rules';

// The roster's working-time rules, pure and unit-tested (feature sheet rules 1, 2, 4, 8 in docs/yukthix/time-design-map.md):
// rest between shifts, hours a day and a week, the spread-over, the weekly off, and licences. A rule break is reported on
// the day it happens; a change is refused only for the breaks it ADDS (what was already there stays a warning), so a
// planner can always fix things one cell at a time.

export type RuleKind = 'rest' | 'overlap' | 'hours' | 'spread' | 'week' | 'weekly_off' | 'licence' | 'night';
export interface RuleBreak {
  on: string;
  kind: RuleKind;
  message: string;
}
export interface Limits {
  minRestMinutes: number;
  dailyMinutes: number;
  weeklyMinutes: number;
  spreadMinutes: number;
  minWeeklyOffs: number;
}
export interface PlanDay {
  on: string;
  /** The shift worked that date, or null (off). */
  shift: ShiftTimes | null;
  /** False on a day the person is not employed (before joining, after leaving): never counted. */
  employed: boolean;
  /** Call-out minutes that day that count towards the weekly hours (PAY-35: the on-call rule says so). */
  calloutMinutes?: number;
}

/** The refusal code an API returns for a break of each kind. */
export const GUARD_CODE: Record<RuleKind, string> = { rest: 'REST_GUARD', overlap: 'REST_GUARD', hours: 'HOURS_GUARD', spread: 'HOURS_GUARD', week: 'HOURS_GUARD', weekly_off: 'WEEKLY_OFF_GUARD', licence: 'LICENCE_GUARD', night: 'NIGHT_GUARD' };
/** Breaks that stop a publish, a swap, an award or an auto-roster placement. */
export const BLOCKING: readonly RuleKind[] = ['rest', 'overlap', 'hours', 'spread', 'week', 'weekly_off', 'licence', 'night'];

const h = (m: number) => `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} m` : ''}`;
const dateText = (iso: string) => DateTime.fromISO(iso, { zone: 'utc' }).toFormat('d LLL yyyy');

/** Hours a day, the spread-over, hours a week and weekly offs over consecutive dates (any length; whole weeks for the week rules). */
export function hoursBreaks(days: readonly PlanDay[], l: Limits): RuleBreak[] {
  const out: RuleBreak[] = [];
  for (const d of days) {
    if (!d.shift || !d.employed) continue;
    const worked = scheduledMinutes(d.shift);
    const spread = shiftLength(d.shift);
    if (worked > l.dailyMinutes) out.push({ on: d.on, kind: 'hours', message: `${h(worked)} of work in a day (at most ${h(l.dailyMinutes)})` });
    if (spread > l.spreadMinutes) out.push({ on: d.on, kind: 'spread', message: `The working day spreads over ${h(spread)} (at most ${h(l.spreadMinutes)})` });
  }
  const weeks = new Map<string, PlanDay[]>();
  for (const d of days) weeks.set(mondayOf(d.on), [...(weeks.get(mondayOf(d.on)) ?? []), d]);
  for (const [monday, list] of weeks) {
    let total = 0;
    let callouts = 0;
    let reported = false;
    for (const d of [...list].sort((a, b) => a.on.localeCompare(b.on))) {
      // A call-out counts on its own day too, also a day off (founder 2 Nov 2026, PAY-35 "count towards weekly hours").
      if (!d.employed || (!d.shift && !d.calloutMinutes)) continue;
      total += (d.shift ? scheduledMinutes(d.shift) : 0) + (d.calloutMinutes ?? 0);
      callouts += d.calloutMinutes ?? 0;
      if (!reported && total > l.weeklyMinutes) {
        out.push({ on: d.on, kind: 'week', message: `${h(total)} of work in the week of ${dateText(monday)} by this day${callouts ? `, ${callouts < 60 ? `${callouts} m` : h(callouts)} of call-outs included` : ''} (at most ${h(l.weeklyMinutes)})` });
        reported = true;
      }
    }
    // Weekly offs only for a whole week in which the person is employed every day (joiners and leavers are not judged).
    const whole = list.length === 7 && list.every((d) => d.employed);
    const offs = list.filter((d) => !d.shift).length;
    if (whole && offs < l.minWeeklyOffs) out.push({ on: addDays(monday, 6), kind: 'weekly_off', message: `${offs === 0 ? 'No weekly off' : `Only ${offs} ${offs === 1 ? 'day' : 'days'} off`} in the week of ${dateText(monday)} (at least ${l.minWeeklyOffs})` });
  }
  return out;
}

/** Every working-time break over consecutive dates (rest, overlap, hours, spread, week, weekly off). */
export function timeBreaks(days: readonly PlanDay[], l: Limits): RuleBreak[] {
  const worked = days.map((d) => ({ on: d.on, shift: d.employed ? d.shift : null }));
  return [...(restConflicts(worked, l.minRestMinutes) as RuleBreak[]), ...hoursBreaks(days, l)];
}

// A week's breaks are one per week, whichever day they land on (the day the total crosses the limit can move).
const keyOf = (b: RuleBreak) => (b.kind === 'week' || b.kind === 'weekly_off' ? `${mondayOf(b.on)}|${b.kind}` : `${b.on}|${b.kind}`);
/** The breaks in `after` that `before` did not have (by day and kind). */
export function addedBreaks(before: readonly RuleBreak[], after: readonly RuleBreak[]): RuleBreak[] {
  const was = new Set(before.map(keyOf));
  return after.filter((b) => !was.has(keyOf(b)));
}

export interface Requirement {
  licenceTypeId: string;
  shiftId: string | null;
  designationId: string | null;
  /** Null: at every location. */
  locationId: string | null;
}
export interface Held {
  licenceTypeId: string;
  validFrom: string;
  expiresOn: string | null;
}
export interface Override {
  licenceTypeId: string;
  until: string;
}

/** The licence types a person needs for a shift on a date (by the shift, or by their role), wherever they work. */
export function licencesNeeded(reqs: readonly Requirement[], at: { shiftId: string | null; designationId: string; locationId: string }): string[] {
  return [...new Set(reqs.filter((r) => (r.locationId === null || r.locationId === at.locationId) && ((r.shiftId !== null && r.shiftId === at.shiftId) || (r.designationId !== null && r.designationId === at.designationId))).map((r) => r.licenceTypeId))];
}

/** Rule 8: held and in date on `on` (valid_from ≤ on ≤ expires_on); a company licence may be overridden until a date. */
export function licenceValid(held: readonly Held[], licenceTypeId: string, on: string, override?: readonly Override[]): boolean {
  if (held.some((x) => x.licenceTypeId === licenceTypeId && x.validFrom <= on && (x.expiresOn === null || on <= x.expiresOn))) return true;
  return Boolean(override?.some((o) => o.licenceTypeId === licenceTypeId && on <= o.until));
}

/** Days until a date from today (negative: in the past). */
export const daysTo = (today: string, on: string) => Math.round(DateTime.fromISO(on, { zone: 'utc' }).diff(DateTime.fromISO(today, { zone: 'utc' }), 'days').days);

/**
 * Rule 5: a change to a day whose shift (before or after the change, whichever starts first) starts within the notice
 * needs a reason. `zone` is the location's time zone; minutes are after that day's local midnight.
 */
export function insideNotice(on: string, startMinutes: readonly (number | null)[], zone: string, noticeHours: number, now: Date): boolean {
  const starts = startMinutes.filter((m): m is number => m !== null);
  if (!starts.length || noticeHours <= 0) return false;
  const first = DateTime.fromISO(on, { zone }).plus({ minutes: Math.min(...starts) });
  return first.toMillis() - now.getTime() < noticeHours * 3_600_000;
}
