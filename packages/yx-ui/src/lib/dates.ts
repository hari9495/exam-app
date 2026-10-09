// Pure date maths for calendars, rosters and timelines. Weeks start on Monday (India).
import { formatDate, formatTime } from './format';

export const DAY_MS = 86_400_000;
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const WEEKDAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const WEEKDAYS_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** A public or company holiday, passed in as data (the calendar follows the work location, M02 L2). */
export interface Holiday {
  date: Date;
  name: string;
}

export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
/** Calendar-day arithmetic (safe across DST, unlike adding milliseconds). */
export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes());
export const addMonths = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, 1);
export const isSameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
/** Stable key "2026-10-02" for maps and ids. */
export const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/** 0 = Monday … 6 = Sunday. */
export const weekdayIndex = (d: Date) => (d.getDay() + 6) % 7;
export const isWeekend = (d: Date) => weekdayIndex(d) >= 5;
export const minutesOfDay = (d: Date) => d.getHours() * 60 + d.getMinutes();
export const daysBetween = (a: Date, b: Date) => Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / DAY_MS);

export const startOfWeek = (d: Date) => addDays(startOfDay(d), -weekdayIndex(d));
/** Monday to Sunday containing d. */
export function weekRange(d: Date): { start: Date; end: Date } {
  const start = startOfWeek(d);
  return { start, end: addDays(start, 6) };
}
export const daysFrom = (start: Date, count: number) => Array.from({ length: count }, (_, i) => addDays(startOfDay(start), i));
export const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();

/** Weeks (Monday first) covering the month, including leading/trailing days of neighbouring months. */
export function monthGrid(year: number, month: number): Date[][] {
  const first = new Date(year, month, 1);
  const start = startOfWeek(first);
  const weeks = Math.ceil((weekdayIndex(first) + daysInMonth(year, month)) / 7);
  return Array.from({ length: weeks }, (_, w) => daysFrom(addDays(start, w * 7), 7));
}

export const monthTitle = (d: Date) => `${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`;
export const weekdayLong = (d: Date) => WEEKDAYS_LONG[weekdayIndex(d)];
/** "Fri 2 Oct 2026". */
export const dayTitle = (d: Date) => `${WEEKDAYS_SHORT[weekdayIndex(d)]} ${formatDate(d)}`;
/** "28 Sep – 4 Oct 2026" (year once when both ends share it). */
export function rangeTitle(a: Date, b: Date): string {
  const fa = formatDate(a);
  const fb = formatDate(b);
  return a.getFullYear() === b.getFullYear() ? `${fa.slice(0, -5)} – ${fb}` : `${fa} – ${fb}`;
}
/** 12-hour clock, e.g. "9:30 am" (§35). */
export const timeOf = (d: Date) => formatTime(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);

/** "2 h 15 min", "1 day 3 h", "5 min". */
export function formatDuration(ms: number): string {
  const mins = Math.max(0, Math.round(ms / 60_000));
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (d) return `${d} ${d === 1 ? 'day' : 'days'}${h ? ` ${h} h` : ''}`;
  if (h) return `${h} h${m ? ` ${m} min` : ''}`;
  return `${m} min`;
}

/** "Today", "Yesterday" or the date, for grouping activity by day. */
export function relativeDayLabel(d: Date, today: Date): string {
  const diff = daysBetween(d, today);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return dayTitle(d);
}

/** Groups items by calendar day, newest day first and newest item first within a day. */
export function groupByDay<T>(items: T[], at: (t: T) => Date): { day: Date; items: T[] }[] {
  const sorted = [...items].sort((a, b) => at(b).getTime() - at(a).getTime());
  const out: { day: Date; items: T[] }[] = [];
  for (const it of sorted) {
    const last = out[out.length - 1];
    if (last && isSameDay(last.day, at(it))) last.items.push(it);
    else out.push({ day: startOfDay(at(it)), items: [it] });
  }
  return out;
}

export interface Span {
  id: string;
  start: Date;
  end: Date;
}

/**
 * Side-by-side layout for overlapping timed events in one day column.
 * Events that overlap form a cluster; each gets the first free column and the cluster's column count.
 */
export function layoutOverlaps(spans: Span[]): Map<string, { col: number; cols: number }> {
  const sorted = [...spans].sort((a, b) => a.start.getTime() - b.start.getTime() || b.end.getTime() - a.end.getTime());
  const out = new Map<string, { col: number; cols: number }>();
  let cluster: { id: string; col: number }[] = [];
  let colEnds: number[] = [];
  let clusterEnd = -Infinity;
  const flush = () => {
    for (const c of cluster) out.set(c.id, { col: c.col, cols: colEnds.length });
    cluster = [];
    colEnds = [];
  };
  for (const s of sorted) {
    const st = s.start.getTime();
    if (st >= clusterEnd) flush();
    let col = colEnds.findIndex((end) => end <= st);
    if (col === -1) col = colEnds.push(0) - 1;
    colEnds[col] = s.end.getTime();
    cluster.push({ id: s.id, col });
    clusterEnd = Math.max(clusterEnd === -Infinity ? st : clusterEnd, s.end.getTime());
  }
  flush();
  return out;
}

export const findHoliday = (holidays: Holiday[] | undefined, d: Date) => holidays?.find((h) => isSameDay(h.date, d));
