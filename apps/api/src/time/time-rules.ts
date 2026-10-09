import { DateTime } from 'luxon';
import { DayRule, addDays, daysBetween, minutesInto } from './time-maths';

// M02 batch 2 maths, pure and unit-tested: shift patterns (weekly and N-day cycles) and what a date resolves to
// (roster > pattern > location, Q1), the working day of a punch around a night shift, roster conflicts (overlap,
// minimum rest, YX-AT-07) and the women's night window (YX-AT-25), overtime (Q7, YX-AT-04) and comp-off, maternity
// eligibility (YX-LV-10) and what a day pays (§B6).

// ------------------------------------------------------------------------------------------ shifts and patterns

export interface ShiftTimes extends DayRule {
  shiftId: string | null;
  name: string;
  night: boolean;
}

/** Minutes a shift runs (an end before the start crosses midnight). */
export const shiftLength = (s: Pick<DayRule, 'shiftStart' | 'shiftEnd'>) => (s.shiftEnd > s.shiftStart ? s.shiftEnd - s.shiftStart : s.shiftEnd + 1440 - s.shiftStart);
export const crossesMidnight = (s: Pick<DayRule, 'shiftStart' | 'shiftEnd'>) => s.shiftEnd < s.shiftStart;

/** The minutes a day on this shift is expected to work: its length less the fixed break when the break rule applies (Q3). */
export function scheduledMinutes(s: DayRule): number {
  const len = shiftLength(s);
  return len > s.breakAboveMinutes ? len - s.breakMinutes : len;
}

export interface PatternDef {
  kind: 'weekly' | 'cycle';
  /** Shift ids, null for a weekly off. Weekly: Monday … Sunday. Cycle: day 1 … N from the assignment's date. */
  cycle: (string | null)[];
}

/** The pattern's cell for a date: a weekly pattern by weekday, a cycle by days since `from` plus the crew offset. */
export function patternCell(p: PatternDef, from: string, offsetDays: number, on: string): string | null {
  if (p.kind === 'weekly') return p.cycle[DateTime.fromISO(on, { zone: 'utc' }).weekday - 1] ?? null;
  const n = p.cycle.length;
  const i = (((daysBetween(from, on) + offsetDays) % n) + n) % n;
  return p.cycle[i] ?? null;
}

export type DaySource = 'roster' | 'pattern' | 'location';
export interface Scheduled {
  /** The shift worked that day, or null on a weekly off. */
  shift: ShiftTimes | null;
  weeklyOff: boolean;
  source: DaySource;
}

/**
 * Q1 precedence for one date: a published roster entry (a shift or "off"), else the pattern in force, else the
 * location's default shift and weekly offs. A pattern cell or roster entry naming a shift with no version in force on
 * the date falls back to the location's shift.
 */
export function resolveDay(i: {
  roster: { shiftId: string | null; isOff: boolean } | null;
  pattern: string | null | undefined;
  location: { rule: ShiftTimes; weeklyOff: boolean };
  shiftOn: (shiftId: string) => ShiftTimes | null;
}): Scheduled {
  if (i.roster) return i.roster.isOff || !i.roster.shiftId ? { shift: null, weeklyOff: true, source: 'roster' } : { shift: i.shiftOn(i.roster.shiftId) ?? i.location.rule, weeklyOff: false, source: 'roster' };
  if (i.pattern !== undefined) return i.pattern === null ? { shift: null, weeklyOff: true, source: 'pattern' } : { shift: i.shiftOn(i.pattern) ?? i.location.rule, weeklyOff: false, source: 'pattern' };
  return i.location.weeklyOff ? { shift: null, weeklyOff: true, source: 'location' } : { shift: i.location.rule, weeklyOff: false, source: 'location' };
}

// ------------------------------------------------------------------------------------------ the night-shift day boundary

/**
 * The working day a punch belongs to (§B3 step 2, YX-AT-13: a night shift belongs to the day it started). A punch in
 * the morning goes to yesterday when yesterday's shift crossed midnight and the punch is within 6 hours of its end,
 * unless it is a check-in close to the start of today's own shift (from 3 hours before it).
 */
export function workOnForPunch(at: Date, zone: string, kind: 'in' | 'out', shiftOf: (on: string) => Pick<DayRule, 'shiftStart' | 'shiftEnd'> | null): string {
  const today = DateTime.fromJSDate(at, { zone }).toISODate()!;
  const minute = minutesInto(today, zone, at);
  const prev = shiftOf(addDays(today, -1));
  if (!prev || !crossesMidnight(prev) || minute >= prev.shiftEnd + 360) return today;
  const own = shiftOf(today);
  if (kind === 'in' && own && minute >= own.shiftStart - 180) return today;
  return addDays(today, -1);
}

// ------------------------------------------------------------------------------------------ roster conflicts

/** A shift on a date as an absolute minute range from the epoch day of `base` (for rest and overlap checks). */
function spanOf(base: string, on: string, s: Pick<DayRule, 'shiftStart' | 'shiftEnd'>): [number, number] {
  const start = daysBetween(base, on) * 1440 + s.shiftStart;
  return [start, start + shiftLength(s)];
}

export interface Conflict {
  on: string;
  kind: 'rest' | 'overlap' | 'leave' | 'holiday' | 'night';
  message: string;
}

const hoursText = (m: number) => `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} m` : ''}`;

/**
 * YX-AT-07: overlap and minimum rest between consecutive shifts of one person, over a run of dates in order. Each
 * entry is the shift worked that date (null: off). Reported on the later date.
 */
export function restConflicts(days: { on: string; shift: Pick<DayRule, 'shiftStart' | 'shiftEnd'> | null }[], minRestMinutes: number): Conflict[] {
  const out: Conflict[] = [];
  if (!days.length) return out;
  const base = days[0].on;
  let last: { on: string; end: number } | null = null;
  for (const d of days) {
    if (!d.shift) continue;
    const [start, end] = spanOf(base, d.on, d.shift);
    if (last) {
      const gap = start - last.end;
      if (gap < 0) out.push({ on: d.on, kind: 'overlap', message: `Overlaps the shift of ${last.on}` });
      else if (gap < minRestMinutes) out.push({ on: d.on, kind: 'rest', message: `Only ${hoursText(gap)} rest after the shift before (at least ${hoursText(minRestMinutes)})` });
    }
    last = { on: d.on, end };
  }
  return out;
}

/** Does a shift overlap the legal night window (P07 IN.OSH, e.g. 19:00 to 06:00)? */
export function overlapsNight(s: Pick<DayRule, 'shiftStart' | 'shiftEnd'>, window: { start: number; end: number }): boolean {
  const [a, b] = [s.shiftStart, s.shiftStart + shiftLength(s)];
  // The window as ranges over two days: [start, end + 1440) when it wraps midnight, shifted back a day too.
  const wins: [number, number][] = window.end <= window.start ? [[window.start - 1440, window.end], [window.start, window.end + 1440], [window.start + 1440, window.end + 2880]] : [[window.start, window.end], [window.start + 1440, window.end + 1440]];
  return wins.some(([x, y]) => a < y && x < b);
}

// ------------------------------------------------------------------------------------------ overtime (Q7)

export interface OtRule {
  minMinutes: number;
  roundMinutes: number;
  dailyCapMinutes: number | null;
}
export interface OtStatutory {
  dailyMaxWorkMinutes: number;
  quarterlyOtMinutes: number;
}
export type OtCategory = 'normal' | 'weekly_off' | 'holiday';

export interface OtResult {
  /** Minutes past the scheduled day (all minutes on a weekly off or holiday). */
  raw: number;
  /** After the minimum and rounding down (YX-AT-04: none below the minimum, never a few minutes past the end). */
  eligible: number;
  /** Within the company's daily cap and the P07 daily and quarterly limits. */
  payable: number;
  /** Over a cap: flagged, paid only with an HR override and a reason (Q7). */
  overCap: number;
}

export function overtimeFor(i: { category: OtCategory; workedMinutes: number; scheduledMinutes: number; rule: OtRule; statutory: OtStatutory; quarterUsedMinutes: number }): OtResult {
  const raw = Math.max(0, i.category === 'normal' ? i.workedMinutes - i.scheduledMinutes : i.workedMinutes);
  const unit = Math.max(1, i.rule.roundMinutes);
  const eligible = raw < i.rule.minMinutes || raw === 0 ? 0 : Math.floor(raw / unit) * unit;
  const lawDay = i.category === 'normal' ? Math.max(0, i.statutory.dailyMaxWorkMinutes - i.scheduledMinutes) : i.statutory.dailyMaxWorkMinutes;
  const quarterLeft = Math.max(0, i.statutory.quarterlyOtMinutes - i.quarterUsedMinutes);
  const payable = Math.min(eligible, lawDay, quarterLeft, i.rule.dailyCapMinutes ?? Infinity);
  return { raw, eligible, payable, overCap: eligible - payable };
}

/** Comp-off for approved OT settled as time off: a full day from `full` minutes, a half day from `half`. */
export const compOffDays = (minutes: number, half: number, full: number) => (minutes >= full ? 1 : minutes >= half ? 0.5 : 0);

/**
 * How approved OT is settled (founder decision 9 Oct 2026): where the Factories Act covers the person (the dated setting
 * attendance.factories_act says "covered" and P07 IN.FACTORIES counts their employment category as workers), OT is
 * always paid through the payroll feed, at least at the legal rate (P07, 2× ordinary wages, on the verify list); comp-off
 * is offered only where the Act does not apply. Elsewhere the company's rule decides.
 */
export function otSettlement(rule: { settle: 'pay' | 'comp_off'; rate: number }, factoriesAct: { covered: boolean; legalRate: number }): { settle: 'pay' | 'comp_off'; rate: number } {
  return factoriesAct.covered ? { settle: 'pay', rate: Math.max(rule.rate, factoriesAct.legalRate) } : { settle: rule.settle, rate: rule.rate };
}

/** The calendar quarter (Jan–Mar …) holding a date, for the P07 quarterly OT cap. */
export function quarterOf(on: string): { from: string; to: string } {
  const d = DateTime.fromISO(on, { zone: 'utc' });
  const start = DateTime.utc(d.year, Math.floor((d.month - 1) / 3) * 3 + 1, 1);
  return { from: start.toISODate()!, to: start.plus({ months: 3 }).minus({ days: 1 }).toISODate()! };
}

// ------------------------------------------------------------------------------------------ maternity (YX-LV-10)

export type MaternityCase = 'birth' | 'third_child' | 'adoption' | 'miscarriage' | 'tubectomy';
export interface MaternityValues {
  maternityWeeks: number;
  maternityWeeksThirdChild: number;
  beforeDeliveryWeeks: number;
  eligibilityDaysWorked: number;
  miscarriageWeeks?: number;
  tubectomyWeeks?: number;
}

/** The most days the case allows (P07 IN.LEAVE, never typed in). */
export function maternityLimit(v: MaternityValues, c: MaternityCase): number {
  const weeks = c === 'birth' ? v.maternityWeeks : c === 'third_child' || c === 'adoption' ? v.maternityWeeksThirdChild : c === 'miscarriage' ? (v.miscarriageWeeks ?? 6) : (v.tubectomyWeeks ?? 2);
  return weeks * 7;
}

/** The 12 months before the expected date, in which the days worked are counted (the Act's s.5(2)). */
export const eligibilityWindow = (expectedOn: string) => ({ from: DateTime.fromISO(expectedOn, { zone: 'utc' }).minus({ months: 12 }).toISODate()!, to: addDays(expectedOn, -1) });

/**
 * Days worked for maternity eligibility from the evaluated days: a day present or a half day counts as a day worked,
 * and so does a paid holiday (the Act counts holidays with wages and lay-off days as worked).
 */
export function daysWorked(statuses: readonly string[]): number {
  return statuses.filter((s) => s === 'present' || s === 'half_day' || s === 'holiday').length;
}

/** Plain reasons a maternity request is refused (empty when it may go ahead). */
export function maternityChecks(i: { values: MaternityValues; maternityCase: MaternityCase; expectedOn: string; from: string; to: string; worked: number }): string[] {
  const out: string[] = [];
  const total = daysBetween(i.from, i.to) + 1;
  const limit = maternityLimit(i.values, i.maternityCase);
  if (total > limit) out.push(`Maternity leave for this case is at most ${limit / 7} weeks (${limit} days) under the Maternity Benefit Act.`);
  if (i.maternityCase === 'birth' || i.maternityCase === 'third_child') {
    const before = daysBetween(i.from, i.expectedOn);
    if (before > i.values.beforeDeliveryWeeks * 7) out.push(`Maternity leave can start at most ${i.values.beforeDeliveryWeeks} weeks before the expected date of delivery.`);
  }
  if (i.worked < i.values.eligibilityDaysWorked) out.push(`Maternity leave needs at least ${i.values.eligibilityDaysWorked} days worked in the 12 months before the expected date. Our records show ${i.worked}. Ask HR if days are missing.`);
  return out;
}

// ------------------------------------------------------------------------------------------ what a day pays (§B6)

/**
 * One evaluated day as paid and loss-of-pay days. A half on leave counts by the leave type (paid or not); a worked
 * half pays half; holidays and weekly offs pay; an absent or unresolved day is loss of pay.
 */
export function payOfDay(d: { status: string; leavePart: 'full' | 'first' | 'second' | null; leavePaid: boolean | null }): { paid: number; lop: number } {
  const leaveHalf = d.leavePart && d.leavePart !== 'full' ? (d.leavePaid ? { paid: 0.5, lop: 0 } : { paid: 0, lop: 0.5 }) : null;
  switch (d.status) {
    case 'leave':
      return d.leavePaid === false ? { paid: 0, lop: 1 } : { paid: 1, lop: 0 };
    case 'holiday':
    case 'weekly_off':
      return { paid: 1, lop: 0 };
    case 'present':
      return leaveHalf ? { paid: 0.5 + leaveHalf.paid, lop: leaveHalf.lop } : { paid: 1, lop: 0 };
    case 'half_day':
      return { paid: 0.5, lop: 0.5 };
    case 'not_started':
      return { paid: 0, lop: 0 };
    default:
      return leaveHalf ? { paid: leaveHalf.paid, lop: 0.5 + leaveHalf.lop } : { paid: 0, lop: 1 };
  }
}

/** The Monday of a date's week. */
export const mondayOf = (on: string) => addDays(on, 1 - DateTime.fromISO(on, { zone: 'utc' }).weekday);
