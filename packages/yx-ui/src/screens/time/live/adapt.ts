// Live API data in the designed screens' own shapes (design audit: the designed screen made live, never a second one).
import type { AttendanceDay, DayCode, Punch } from '../time-logic';
import type { DayCard, DayRow, MusterDay } from './types';

/** "2026-09-07" as a local date (the designed screens work in local dates). */
export const localDate = (iso: string) => new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
/** Every date of a month ("2026-09") as yyyy-mm-dd. */
export function monthDates(month: string): string[] {
  const [y, m] = month.split('-').map(Number);
  const n = new Date(y, m, 0).getDate();
  return Array.from({ length: n }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
}
const KNOWN: Partial<Record<string, DayCode>> = { CL: 'CL', EL: 'EL', SL: 'SL', LOP: 'LOP' };
const STATUS_CODE: Record<DayRow['status'], DayCode> = {
  present: 'P',
  half_day: 'HD',
  absent: 'A',
  leave: 'LV',
  holiday: 'H',
  weekly_off: 'WO',
  missing_in: 'MP',
  missing_out: 'MP',
  no_timesheet: 'A',
  not_started: 'FUT',
};
const NOTE: Partial<Record<DayRow['status'], string>> = { missing_in: 'No check-in', missing_out: 'No check-out', no_timesheet: 'No timesheet yet' };

/** One API day as a designed day (code, late, overtime, leave). A day without a record is upcoming, or today. */
export function toDay(on: string, row: (DayRow & Partial<MusterDay>) | undefined, today: string): AttendanceDay {
  const date = localDate(on);
  if (!row || row.status === 'not_started') return { date, code: on === today ? 'TODAY' : 'FUT', ...(row?.lateMinutes ? { lateMin: row.lateMinutes } : {}) };
  let code = STATUS_CODE[row.status];
  if (row.status === 'present') code = row.wfh ? 'WFH' : row.lateMinutes ? 'L' : 'P';
  if (row.status === 'leave' && row.leave) code = KNOWN[row.leave.code] ?? 'LV';
  // A request still waiting decides the day, so it reads as "waiting" until it is answered.
  if (row.waiting && (code === 'A' || code === 'MP')) code = 'R';
  return {
    date,
    code,
    ...(row.lateMinutes ? { lateMin: row.lateMinutes } : {}),
    ...(row.workedMinutes ? { workedMin: row.workedMinutes } : {}),
    ...(row.ot ? { otMin: row.ot.minutes, otStatus: row.ot.status } : {}),
    ...(row.leave && code === 'LV' ? { leave: row.leave } : {}),
    ...(NOTE[row.status] ? { note: NOTE[row.status] } : {}),
  };
}

/** A whole month of designed days from the API's rows (missing days filled in). */
export const monthDays = (month: string, rows: (DayRow & Partial<MusterDay>)[], today: string): AttendanceDay[] => monthDates(month).map((on) => toDay(on, rows.find((r) => r.on === on), today));

const VERDICT: Record<string, Punch['verdict']> = { network: 'network', inside: 'inside', outside: 'outside' };
const SOURCES: Punch['source'][] = ['web', 'mobile', 'biometric', 'kiosk', 'teams', 'desktop', 'field'];
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** A day card's accepted punches as designed punches ("HH:mm", source, place, verdict). */
export const toPunches = (card: DayCard): Punch[] =>
  card.punches
    .filter((p) => p.accepted)
    .map((p) => ({
      id: p.id,
      kind: p.kind,
      time: hhmm(((p.minute % 1440) + 1440) % 1440),
      source: SOURCES.includes(p.source as Punch['source']) ? (p.source as Punch['source']) : 'web',
      where: p.where ?? (p.verdict === 'network' ? 'Office network' : 'Location recorded'),
      ...(p.distanceM !== null ? { distanceM: p.distanceM } : {}),
      verdict: VERDICT[p.verdict] ?? 'field',
    }));

/** The day card's shift for the designed card ("09:30"); a weekly off or holiday has none. */
export const toShift = (card: DayCard) => (card.shift ? { name: card.shift.name, start: hhmm(card.shift.start), end: hhmm(card.shift.end), graceMin: card.shift.grace } : { name: 'No shift', start: '09:00', end: '18:00', graceMin: 0 });
