import { DateTime } from 'luxon';
import ipaddr from 'ipaddr.js';

// M02 time and leave maths, pure and unit-tested: day counting (holidays, weekly offs, sandwich, half days), accruals
// (pro-rata, rounding, the year-end true-up), year end, statutory floors, check-in verdicts (geofence, allowed
// networks) and the day engine. Dates are ISO calendar dates (yyyy-mm-dd); instants are Dates; local wall-clock maths
// goes through luxon in the location's time zone.

export type Half = 'full' | 'first' | 'second';
export type FromHalf = 'full' | 'second';
export type ToHalf = 'full' | 'first';

const day = (iso: string) => DateTime.fromISO(iso, { zone: 'utc' });
export const addDays = (iso: string, n: number) => day(iso).plus({ days: n }).toISODate()!;
export const daysBetween = (a: string, b: string) => Math.round(day(b).diff(day(a), 'days').days);
export function* eachDay(from: string, to: string): Generator<string> {
  for (let d = from; d <= to; d = addDays(d, 1)) yield d;
}

// ------------------------------------------------------------------------------------------ weekly offs and holidays

/** Q1 location default: an ISO weekday (1 = Monday), optionally only its nth occurrences in the month (2nd and 4th Saturday). */
export interface WeeklyOffRule {
  weekday: number;
  nth?: number[];
}

export function isWeeklyOff(iso: string, rules: readonly WeeklyOffRule[]): boolean {
  const d = day(iso);
  const nth = Math.ceil(d.day / 7);
  return rules.some((r) => r.weekday === d.weekday && (!r.nth?.length || r.nth.includes(nth)));
}

/** A holiday on a date; a half day keeps `openHalf` of the working day (the calendar's working half). */
export interface HolidayOn {
  name: string;
  halfDay: boolean;
  openHalf: 'first' | 'second';
}

// ------------------------------------------------------------------------------------------ counting leave days

/**
 * L3 sandwich per leave type: none, sandwich (a non-working day counts only between two leave days of the request)
 * or always (every non-working day inside the range counts); on weekly offs, holidays or both; with
 * `sandwichHalfDays` false a half-day leave next to the gap does not make it count.
 */
export interface CountRules {
  sandwich: 'none' | 'sandwich' | 'always';
  sandwichOn: 'weekly_offs' | 'holidays' | 'both';
  sandwichHalfDays: boolean;
}

export interface CountedDay {
  on: string;
  part: Half;
  portion: 0 | 0.5 | 1;
  countedAs: 'leave' | 'sandwich' | 'holiday' | 'weekly_off';
}

export interface CountInput {
  from: string;
  to: string;
  fromHalf: FromHalf;
  toHalf: ToHalf;
  holidays: ReadonlyMap<string, HolidayOn>;
  weeklyOff: (iso: string) => boolean;
  rules: CountRules;
}

// ponytail: one request at a time; a sandwich across two requests (Fri, then Mon) is not joined up.
export function countLeaveDays(i: CountInput): { days: CountedDay[]; total: number } {
  if (i.to < i.from) return { days: [], total: 0 };
  const days: CountedDay[] = [];
  for (const on of eachDay(i.from, i.to)) {
    let part: Half = 'full';
    if (on === i.from && i.fromHalf === 'second') part = 'second';
    if (on === i.to && i.toHalf === 'first') part = part === 'second' ? 'full' : 'first';
    const hol = i.holidays.get(on);
    if (i.weeklyOff(on)) {
      days.push({ on, part, portion: 0, countedAs: 'weekly_off' });
    } else if (hol && !hol.halfDay) {
      days.push({ on, part, portion: 0, countedAs: 'holiday' });
    } else if (hol) {
      // A half-day holiday: only its working half can be leave.
      const working = part === 'full' || part === hol.openHalf;
      days.push({ on, part: working ? hol.openHalf : part, portion: working ? 0.5 : 0, countedAs: working ? 'leave' : 'holiday' });
    } else {
      days.push({ on, part, portion: part === 'full' ? 1 : 0.5, countedAs: 'leave' });
    }
  }
  const applies = (d: CountedDay) =>
    d.portion === 0 && ((d.countedAs === 'weekly_off' && i.rules.sandwichOn !== 'holidays') || (d.countedAs === 'holiday' && i.rules.sandwichOn !== 'weekly_offs'));
  const bound = (d: CountedDay | undefined) => Boolean(d && d.portion > 0 && (i.rules.sandwichHalfDays || d.portion === 1));
  if (i.rules.sandwich !== 'none') {
    for (let k = 0; k < days.length; k++) {
      if (!applies(days[k])) continue;
      let ok = i.rules.sandwich === 'always';
      if (!ok) {
        let a = k - 1;
        while (a >= 0 && days[a].portion === 0) a--;
        let b = k + 1;
        while (b < days.length && days[b].portion === 0) b++;
        ok = bound(days[a]) && bound(days[b]);
      }
      if (ok) days[k] = { ...days[k], part: 'full', portion: 1, countedAs: 'sandwich' };
    }
  }
  return { days, total: days.reduce((s, d) => s + d.portion, 0) };
}

// ------------------------------------------------------------------------------------------ leave year, rounding, accruals

/** L1: the leave year that holds `iso`, starting in month `startMonth` (1 = calendar year, 4 = financial year). */
export function leaveYearOf(iso: string, startMonth: number): { start: string; end: string } {
  const d = day(iso);
  const y = d.month >= startMonth ? d.year : d.year - 1;
  const start = DateTime.utc(y, startMonth, 1);
  return { start: start.toISODate()!, end: start.plus({ years: 1 }).minus({ days: 1 }).toISODate()! };
}

/** L4: rounding to none (2 decimals) / 0.25 / 0.5 / 1, halfway rounds up. */
export function roundTo(x: number, unit: number): number {
  const u = unit > 0 ? unit : 0.01;
  return Math.round(Math.floor(x / u + 0.5 + 1e-9) * u * 100) / 100;
}

export interface AccrualLine {
  annualDays: number;
  frequency: 'yearly' | 'monthly';
  proRata: boolean;
  rounding: number;
}

export interface AccrualDue {
  periodKey: string;
  on: string;
  days: number;
}

/**
 * The credits due for one leave year up to `upTo` (YX-LV-02). Monthly credits are the rounded steps of the exact
 * cumulative entitlement, and the last month of the year trues up to the exact entitlement (L4). A joiner gets the
 * employed share of the joining month (pro-rata); nothing before joining or after leaving.
 */
export function accrualsDue(line: AccrualLine, o: { yearStart: string; joinedOn: string; exitedOn?: string | null; upTo: string }): AccrualDue[] {
  if (line.annualDays <= 0) return [];
  const start = day(o.yearStart);
  const yearEnd = start.plus({ years: 1 }).minus({ days: 1 }).toISODate()!;
  const last = o.exitedOn && o.exitedOn < yearEnd ? o.exitedOn : yearEnd;
  if (o.joinedOn > last) return [];
  const share = (from: string, to: string) => {
    const a = from < o.joinedOn ? o.joinedOn : from;
    const b = to > last ? last : to;
    if (b < a) return 0;
    return line.proRata ? (daysBetween(a, b) + 1) / (daysBetween(from, to) + 1) : 1;
  };
  if (line.frequency === 'yearly') {
    const on = o.yearStart < o.joinedOn ? o.joinedOn : o.yearStart;
    if (on > o.upTo) return [];
    const days = roundTo(line.annualDays * share(o.yearStart, yearEnd), line.rounding);
    return days > 0 ? [{ periodKey: `accrual:${o.yearStart}`, on, days }] : [];
  }
  const out: AccrualDue[] = [];
  let exact = 0;
  let given = 0;
  for (let m = 0; m < 12; m++) {
    const from = start.plus({ months: m });
    const to = from.endOf('month').toISODate()!;
    const f = from.toISODate()!;
    const s = share(f, to);
    if (s === 0) continue;
    exact += (line.annualDays / 12) * s;
    const final = m === 11 || to >= last;
    const target = final ? Math.round(exact * 100) / 100 : roundTo(exact, line.rounding);
    const on = f < o.joinedOn ? o.joinedOn : f;
    if (on > o.upTo) break;
    const days = Math.round((target - given) * 100) / 100;
    given = target;
    if (days !== 0) out.push({ periodKey: `accrual:${f.slice(0, 7)}`, on, days });
    if (final) break;
  }
  return out;
}

/** Year end for one balance (YX-LV-07): carry up to the cap, the rest lapses. A negative balance carries as it is. */
export function yearEndSplit(balance: number, carryCap: number | null): { carry: number; lapse: number } {
  if (balance <= 0 || carryCap === null || balance <= carryCap) return { carry: balance, lapse: 0 };
  return { carry: carryCap, lapse: Math.round((balance - carryCap) * 100) / 100 };
}

/** A P07 floor: the least days a year for a group of leave kinds (TN: casual and sick together, 12). */
export interface Floor {
  kinds: string[];
  days: number;
}

/**
 * The statutory floor applied to a policy's lines (P07, YX-STAT-01): a company may give more, never less. A group's
 * shortfall is added to its first kind the policy has. Returns the annual days per line and what was raised.
 */
export function applyFloors<T extends { kind: string; annualDays: number }>(lines: readonly T[], floors: readonly Floor[]): { annual: number[]; raised: { kinds: string[]; from: number; to: number }[] } {
  const annual = lines.map((l) => l.annualDays);
  const raised: { kinds: string[]; from: number; to: number }[] = [];
  for (const f of floors) {
    const idx = lines.map((l, i) => (f.kinds.includes(l.kind) ? i : -1)).filter((i) => i >= 0);
    if (!idx.length) continue;
    const sum = idx.reduce((s, i) => s + annual[i], 0);
    if (sum < f.days) {
      annual[idx[0]] += f.days - sum;
      raised.push({ kinds: f.kinds, from: sum, to: f.days });
    }
  }
  return { annual, raised };
}

// ------------------------------------------------------------------------------------------ check-in

export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(h))));
}

export function ipInRanges(ip: string | null | undefined, ranges: readonly string[]): boolean {
  if (!ip || !ranges.length) return false;
  try {
    const addr = ipaddr.process(ip);
    return ranges.some((r) => {
      const [net, bits] = ipaddr.parseCIDR(r);
      return addr.kind() === net.kind() && (addr as ipaddr.IPv4).match(net as ipaddr.IPv4, bits);
    });
  } catch {
    return false;
  }
}

export interface Fence {
  locationId: string;
  name: string;
  lat: number | null;
  lng: number | null;
  radiusM: number | null;
  ipRanges: readonly string[];
}

export interface CheckInVerdict {
  accepted: boolean;
  verdict: 'inside' | 'outside' | 'network' | 'no_fence' | 'field' | 'coarse' | 'no_location';
  distanceM: number | null;
  locationId: string | null;
  /** Plain words, shown to the employee (YX-AT-23). */
  message: string;
}

/**
 * Q6 / YX-AT-01 / 23: restricted locations accept a punch inside any allowed geofence or from an allowed network;
 * field locations record where it was and accept it. A location with neither a fence nor a network accepts it.
 */
export function checkInVerdict(i: { fences: readonly Fence[]; pin: { lat: number; lng: number; accuracyM: number } | null; ip: string | null; mode: 'restricted' | 'field'; maxAccuracyM?: number }): CheckInVerdict {
  const maxAcc = i.maxAccuracyM ?? 150;
  const net = i.fences.find((f) => ipInRanges(i.ip, f.ipRanges));
  const geo = i.fences.filter((f) => f.lat !== null && f.lng !== null && f.radiusM);
  const nearest = i.pin
    ? geo.map((f) => ({ f, d: distanceM(i.pin!, { lat: f.lat!, lng: f.lng! }) })).sort((a, b) => a.d - b.d)[0]
    : undefined;
  if (nearest && nearest.d <= nearest.f.radiusM! && i.pin!.accuracyM <= maxAcc) return { accepted: true, verdict: 'inside', distanceM: nearest.d, locationId: nearest.f.locationId, message: `Inside ${nearest.f.name}` };
  if (net) return { accepted: true, verdict: 'network', distanceM: nearest?.d ?? null, locationId: net.locationId, message: `On the ${net.name} network` };
  if (!geo.length && !i.fences.some((f) => f.ipRanges.length)) return { accepted: true, verdict: 'no_fence', distanceM: null, locationId: null, message: 'Checked in' };
  if (i.mode === 'field') return { accepted: true, verdict: 'field', distanceM: nearest?.d ?? null, locationId: nearest?.f.locationId ?? null, message: 'Checked in, location recorded' };
  if (!i.pin) return { accepted: false, verdict: 'no_location', distanceM: null, locationId: null, message: 'Turn on location for this site, or connect to the office network' };
  if (i.pin.accuracyM > maxAcc) return { accepted: false, verdict: 'coarse', distanceM: nearest?.d ?? null, locationId: nearest?.f.locationId ?? null, message: `Location accuracy ${Math.round(i.pin.accuracyM)} m. Move outdoors or near a window and try again` };
  if (!nearest) return { accepted: false, verdict: 'outside', distanceM: null, locationId: null, message: 'Connect to the office network to check in' };
  return { accepted: false, verdict: 'outside', distanceM: nearest.d, locationId: nearest.f.locationId, message: `Outside ${nearest.f.name}, ${formatDistance(nearest.d)} away` };
}

export const formatDistance = (m: number) => (m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`);

// ------------------------------------------------------------------------------------------ the day engine

export interface DayRule {
  shiftStart: number;
  shiftEnd: number;
  graceMinutes: number;
  halfDayMinutes: number;
  fullDayMinutes: number;
  breakMinutes: number;
  breakAboveMinutes: number;
}

/** Wall-clock minutes of `at` on the local day `on` in `zone` (past 1440 for the next morning). Durations stay real. */
export function minutesInto(on: string, zone: string, at: Date): number {
  const local = DateTime.fromJSDate(at, { zone });
  return daysBetween(on, local.toISODate()!) * 1440 + local.hour * 60 + local.minute;
}

/** The instant of a wall-clock minute of the local day `on` (a minute a DST jump skips moves forward with it). */
export function instantAt(on: string, zone: string, minute: number): Date {
  const m = ((minute % 1440) + 1440) % 1440;
  return DateTime.fromISO(on, { zone })
    .plus({ days: Math.floor(minute / 1440) })
    .set({ hour: Math.floor(m / 60), minute: m % 60, second: 0, millisecond: 0 })
    .toJSDate();
}

/** The local date of an instant. */
export const localDate = (at: Date, zone: string) => DateTime.fromJSDate(at, { zone }).toISODate()!;

/** The working day a punch belongs to: its local date, or the day before for the morning end of a night shift. */
export function workOnFor(at: Date, zone: string, rule: Pick<DayRule, 'shiftStart' | 'shiftEnd'>): string {
  const on = localDate(at, zone);
  if (rule.shiftEnd < rule.shiftStart && minutesInto(on, zone, at) < rule.shiftEnd + 360) return addDays(on, -1);
  return on;
}

export type DayStatus = 'present' | 'half_day' | 'absent' | 'leave' | 'holiday' | 'weekly_off' | 'missing_in' | 'missing_out' | 'no_timesheet' | 'not_started';

export interface DayInput {
  on: string;
  zone: string;
  mode: 'punch' | 'assumed_present' | 'timesheet';
  weeklyOff: boolean;
  holiday: HolidayOn | null;
  /** Approved leave on the day: the whole day or one half. */
  leave: Half | null;
  punches: readonly { at: Date; kind: 'in' | 'out' }[];
  /** The latest approved regularisation of the day. */
  fix: { kind: 'missed_in' | 'missed_out' | 'wrong_time' | 'full_day'; inMinute: number | null; outMinute: number | null } | null;
  rule: DayRule;
  now: Date;
  /** Timesheet mode (D1): the day's approved timesheet minutes, or null when no approved timesheet covers it. */
  timesheetMinutes?: number | null;
}

export interface DayResult {
  status: DayStatus;
  leavePart: Half | null;
  firstIn: Date | null;
  lastOut: Date | null;
  workedMinutes: number | null;
  lateMinutes: number | null;
  regularised: boolean;
}

/**
 * YX-AT-03 / §B3: expected status first (weekly off, holiday, leave), then the mode: assumed present needs no punches,
 * timesheet waits for its timesheet, punch reads first-in / last-out minus the break rule (Q3) against the shift's
 * thresholds. A missing punch is "missing check-in / check-out", never a threshold status. On a half-day leave or
 * half-day holiday the grace starts at the working half and the thresholds are halved (YX-AT-12).
 */
export function evaluateDay(i: DayInput): DayResult {
  const none: DayResult = { status: 'absent', leavePart: null, firstIn: null, lastOut: null, workedMinutes: null, lateMinutes: null, regularised: false };
  if (i.leave === 'full') return { ...none, status: 'leave', leavePart: 'full' };
  if (i.weeklyOff) return { ...none, status: 'weekly_off' };
  if (i.holiday && !i.holiday.halfDay) return { ...none, status: 'holiday' };
  const leavePart = i.leave;
  const offHalf: 'first' | 'second' | null = leavePart ?? (i.holiday ? (i.holiday.openHalf === 'first' ? 'second' : 'first') : null);

  const r = i.rule;
  const end = r.shiftEnd > r.shiftStart ? r.shiftEnd : r.shiftEnd + 1440;
  const mid = Math.round((r.shiftStart + end) / 2);
  const workStart = offHalf === 'first' ? mid : r.shiftStart;
  const workEnd = offHalf === 'second' ? mid : end;
  const halfFactor = offHalf ? 0.5 : 1;
  const fix = i.fix;
  if (fix?.kind === 'full_day') return { ...none, status: 'present', leavePart, regularised: true };

  const ins = i.punches.filter((p) => p.kind === 'in').map((p) => p.at.getTime());
  const outs = i.punches.filter((p) => p.kind === 'out').map((p) => p.at.getTime());
  let firstIn = ins.length ? new Date(Math.min(...ins)) : null;
  let lastOut = outs.length ? new Date(Math.max(...outs)) : null;
  if (fix && fix.inMinute !== null && (fix.kind === 'missed_in' || fix.kind === 'wrong_time')) firstIn = instantAt(i.on, i.zone, fix.inMinute);
  if (fix && fix.outMinute !== null && (fix.kind === 'missed_out' || fix.kind === 'wrong_time')) lastOut = instantAt(i.on, i.zone, fix.outMinute < r.shiftStart && r.shiftEnd < r.shiftStart ? fix.outMinute + 1440 : fix.outMinute);
  if (firstIn && lastOut && lastOut <= firstIn) lastOut = null;
  const regularised = Boolean(fix);
  // Punches are still recorded in the other modes (D1) and shown on the day, but they never set its status.
  if (i.mode !== 'punch') {
    const both = firstIn && lastOut;
    const shown = { firstIn, lastOut, workedMinutes: both ? Math.floor((lastOut!.getTime() - firstIn!.getTime()) / 60_000) : null };
    if (i.mode === 'assumed_present') return { ...none, ...shown, status: 'present', leavePart };
    // Timesheet mode: the approved hours set the day against the shift's thresholds (§B3, YX-AT-09).
    const t = i.timesheetMinutes;
    if (t === null || t === undefined) return { ...none, ...shown, status: 'no_timesheet', leavePart };
    const status: DayStatus = t >= r.fullDayMinutes * halfFactor ? 'present' : t >= r.halfDayMinutes * halfFactor && !offHalf ? 'half_day' : 'absent';
    return { ...none, ...shown, workedMinutes: t, status, leavePart };
  }
  const nowMin = minutesInto(i.on, i.zone, i.now);
  const dayOver = nowMin >= workEnd + 240;

  const late = firstIn ? Math.max(0, minutesInto(i.on, i.zone, firstIn) - workStart - r.graceMinutes) : null;
  if (!firstIn && !lastOut) return { ...none, status: dayOver ? 'absent' : 'not_started', leavePart, regularised };
  if (!firstIn) return { ...none, status: 'missing_in', leavePart, lastOut, regularised };
  if (!lastOut) return { ...none, status: dayOver ? 'missing_out' : 'not_started', leavePart, firstIn, lateMinutes: late, regularised };
  let worked = Math.floor((lastOut.getTime() - firstIn.getTime()) / 60_000);
  if (worked > r.breakAboveMinutes) worked -= r.breakMinutes;
  const status: DayStatus = worked >= r.fullDayMinutes * halfFactor ? 'present' : worked >= r.halfDayMinutes * halfFactor && !offHalf ? 'half_day' : 'absent';
  return { status, leavePart, firstIn, lastOut, workedMinutes: worked, lateMinutes: late, regularised };
}
