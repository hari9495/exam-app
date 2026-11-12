// Projects P-4 (PRJ-03, PRJ-07, founder answers 1411, 1417, 1418, 1541): the pure rules of capacity, utilisation,
// matching on free capacity and the timesheet-against-attendance check.

const DAY = 480; // an 8-hour working day, in minutes

export interface DayFacts {
  /** Monday to Friday. */
  weekday: boolean;
  holiday: boolean;
  leave: 'full' | 'first' | 'second' | null;
}

/** Available minutes: working weekdays, less holidays and leave (a half day of leave takes half the day). */
// shortcut: an 8-hour Monday-to-Friday day, as PRJ-01's 40-hour week; upgrade with the person's shift when rosters feed Projects.
export function availableMinutes(days: DayFacts[]): number {
  return days.reduce((t, d) => (!d.weekday || d.holiday ? t : t + (d.leave === 'full' ? 0 : d.leave ? DAY / 2 : DAY)), 0);
}

/** Allocated minutes over some days: each allocation's share of an 8-hour day, on the weekdays it covers. */
export function allocatedMinutes(days: { on: string; weekday: boolean }[], allocations: { percent: number; fromOn: string; toOn: string | null }[]): number {
  let total = 0;
  for (const d of days) {
    if (!d.weekday) continue;
    for (const a of allocations) if (a.fromOn <= d.on && (!a.toOn || a.toOn >= d.on)) total += (a.percent / 100) * DAY;
  }
  return Math.round(total);
}

/** Billable utilisation: approved billable minutes over available minutes, whole per cent (0 when nothing is available). */
export const utilisationPct = (billable: number, available: number) => (available > 0 ? Math.round((billable / available) * 100) : 0);

/** Answer 1411: per-person figures are hidden from someone who is not HR (Projects manage or resource) when the team is under the limit. */
export const hideSmallTeam = (teamSize: number, limit: number, privileged: boolean) => !privileged && teamSize < limit;

/** Free share over a period: 100 less every confirmed allocation overlapping it (the busiest case, never less than 0). */
export function freePct(allocations: { percent: number; fromOn: string; toOn: string | null }[], from: string, to: string): number {
  const busy = allocations.filter((a) => a.fromOn <= to && (!a.toOn || a.toOn >= from)).reduce((t, a) => t + a.percent, 0);
  return Math.max(0, 100 - busy);
}

/** Answer 1418: free capacity only (skills later), bench first, then the most free, then by name. */
export function rankMatches<T extends { name: string; free: number; onBench: boolean }>(people: T[], percent: number): T[] {
  return people.filter((p) => p.free >= percent).sort((a, b) => Number(b.onBench) - Number(a.onBench) || b.free - a.free || a.name.localeCompare(b.name));
}

/** Answer 1541: a week's timesheet against attendance; an hour or more apart is flagged (pay never changes). */
export function attendanceMismatch(timesheetMinutes: number, workedMinutes: number | null): string | null {
  if (workedMinutes == null || Math.abs(timesheetMinutes - workedMinutes) < 60) return null;
  const h = (m: number) => `${Math.round((m / 60) * 10) / 10} h`;
  return `Timesheet ${h(timesheetMinutes)} vs attendance ${h(workedMinutes)} worked`;
}
