import { DateTime } from 'luxon';
import { RRule } from 'rrule';

// SD-2.13 (US-G-052): repeating schedules as RFC 5545 rules (rrule). The rule does calendar maths on "floating" wall
// time (no time zone inside rrule, whose own zone support depends on the server's zone); each wall time is then placed
// in the schedule's time zone with luxon. So "every Monday 9:00 Europe/London" stays 9:00 local across summer time, and
// the server's own zone never matters. Only daily, weekly, monthly and yearly rules; at most 1,000 repeats.

const KEYS = new Set(['FREQ', 'INTERVAL', 'COUNT', 'UNTIL', 'BYDAY', 'BYMONTHDAY', 'BYMONTH', 'BYSETPOS']);
const FREQS = new Set(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']);
const DAY = /^([+-]?[1-5])?(MO|TU|WE|TH|FR|SA|SU)$/;

export class ScheduleError extends Error {}

const ints = (v: string, lo: number, hi: number, what: string) =>
  v.split(',').map((x) => {
    const n = Number(x);
    if (!/^[+-]?\d+$/.test(x) || n < lo || n > hi || n === 0) throw new ScheduleError(`${what} is not valid.`);
    return n;
  });

/** Checks the rule text (without DTSTART). Throws ScheduleError with a plain message. */
export function checkRule(text: string): string {
  const t = text.trim().replace(/^RRULE:/i, '').toUpperCase();
  if (!t || t.length > 300) throw new ScheduleError('Choose how often it repeats.');
  const parts = new Map<string, string>();
  for (const p of t.split(';')) {
    const [k, v] = p.split('=');
    if (!k || v === undefined || !KEYS.has(k)) throw new ScheduleError(`The repeat rule has a part we do not use: ${String(k).slice(0, 12)}.`);
    if (parts.has(k)) throw new ScheduleError(`The repeat rule says ${k} twice.`);
    parts.set(k, v);
  }
  if (!FREQS.has(parts.get('FREQ') ?? '')) throw new ScheduleError('Repeat daily, weekly, monthly or yearly.');
  if (parts.has('INTERVAL')) ints(parts.get('INTERVAL')!, 1, 1000, 'The interval');
  if (parts.has('COUNT')) ints(parts.get('COUNT')!, 1, 1000, 'The number of repeats (1 to 1000)');
  if (parts.has('COUNT') && parts.has('UNTIL')) throw new ScheduleError('Use either a number of repeats or an end date, not both.');
  if (parts.has('UNTIL') && !/^\d{8}(T\d{6}Z?)?$/.test(parts.get('UNTIL')!)) throw new ScheduleError('The end date is not valid.');
  if (parts.has('BYDAY') && parts.get('BYDAY')!.split(',').some((d) => !DAY.test(d))) throw new ScheduleError('The weekdays are not valid.');
  if (parts.has('BYMONTHDAY')) ints(parts.get('BYMONTHDAY')!, -31, 31, 'The day of the month');
  if (parts.has('BYMONTH')) ints(parts.get('BYMONTH')!, 1, 12, 'The month');
  if (parts.has('BYSETPOS')) ints(parts.get('BYSETPOS')!, -366, 366, 'The position');
  return [...parts].map(([k, v]) => `${k}=${v}`).join(';');
}

const floating = (at: Date, zone: string) => {
  const d = DateTime.fromJSDate(at, { zone });
  return new Date(Date.UTC(d.year, d.month - 1, d.day, d.hour, d.minute, d.second));
};
const real = (f: Date, zone: string) =>
  DateTime.fromObject({ year: f.getUTCFullYear(), month: f.getUTCMonth() + 1, day: f.getUTCDate(), hour: f.getUTCHours(), minute: f.getUTCMinutes(), second: f.getUTCSeconds() }, { zone }).toJSDate();

export interface Schedule {
  rule: string;
  zone: string;
  startsAt: Date;
}

function build(s: Schedule): RRule {
  if (!DateTime.local().setZone(s.zone).isValid) throw new ScheduleError('Choose a valid time zone.');
  return new RRule({ ...RRule.parseString(checkRule(s.rule)), dtstart: floating(s.startsAt, s.zone) });
}

/** The first time strictly after `after` (or at or after the start, when `after` is before it); null when it has ended. */
export function nextRun(s: Schedule, after: Date): Date | null {
  const r = build(s);
  const from = after < s.startsAt ? new Date(s.startsAt.getTime() - 1) : after;
  const f = r.after(floating(from, s.zone), false);
  return f ? real(f, s.zone) : null;
}

/** Due times in (from, to], oldest first, at most `limit`. */
export function dueBetween(s: Schedule, from: Date, to: Date, limit = 10): Date[] {
  const r = build(s);
  const out: Date[] = [];
  r.between(floating(from, s.zone), floating(to, s.zone), true, (d) => {
    const at = real(d, s.zone);
    if (at > from && at <= to) out.push(at);
    return out.length < limit;
  });
  return out;
}

/** The next few times, for the set-up screen. */
export function preview(s: Schedule, n = 5, now = new Date()): Date[] {
  const out: Date[] = [];
  let at: Date | null = now;
  while (out.length < n && at) {
    at = nextRun(s, at);
    if (at) out.push(at);
  }
  return out;
}
