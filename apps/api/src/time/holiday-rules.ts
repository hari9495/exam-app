import { addDays } from './time-maths';

// TIM-26 holiday calendar rules, pure and unit-tested: clone to next year, a state template, and the substitute day
// off for a holiday on a weekly off. Dates are ISO calendar dates (yyyy-mm-dd).

export interface HolidayRow {
  on: string;
  name: string;
  kind: string;
  halfDay: boolean;
}

/** Kinds whose date changes from year to year (festivals; optional and restricted days are mostly festivals). */
const MOVES = new Set(['festival', 'optional', 'restricted']);

/**
 * A calendar copied to `year`: the same day and month (29 Feb becomes 28 Feb). Festivals keep the copied date as a
 * draft HR must confirm, since their dates change every year; fixed-date days are ready.
 */
export function cloneToYear(rows: readonly HolidayRow[], year: number): (HolidayRow & { confirm: boolean })[] {
  const seen = new Set<string>();
  const out: (HolidayRow & { confirm: boolean })[] = [];
  for (const h of [...rows].sort((a, b) => a.on.localeCompare(b.on))) {
    const md = h.on.slice(5) === '02-29' ? '02-28' : h.on.slice(5);
    const on = `${year}-${md}`;
    if (seen.has(on)) continue;
    seen.add(on);
    out.push({ on, name: h.name, kind: h.kind, halfDay: h.halfDay, confirm: MOVES.has(h.kind) });
  }
  return out;
}

/** A state template from `from` to the end of that year: the feed's days, one per date, as state holidays. */
export function templateRows(feed: readonly { on: string; name: string }[], from: string): HolidayRow[] {
  const end = `${from.slice(0, 4)}-12-31`;
  const seen = new Set<string>();
  return [...feed]
    .sort((a, b) => a.on.localeCompare(b.on))
    .filter((h) => h.on >= from && h.on <= end && !seen.has(h.on) && seen.add(h.on))
    .map((h) => ({ on: h.on, name: h.name.slice(0, 100), kind: 'state', halfDay: false }));
}

/**
 * TIM-26 "Holiday on a weekly off: comp-off credit": due when the holiday is the person's own weekly off (their roster,
 * shift pattern or location, as resolveDay decides). Rostered to work, the holiday rule applies instead (no credit).
 */
export function holidayCompOffDue(day: { weeklyOff: boolean; shift: unknown | null }): boolean {
  return day.weeklyOff && !day.shift;
}

/** A leave day whose holiday went away: leave again on a working day (as booked: full or half), not counted on a weekly off. */
export function recountedDay(part: 'full' | 'first' | 'second', weeklyOff: boolean): { portion: 0 | 0.5 | 1; countedAs: 'leave' | 'weekly_off' } {
  return weeklyOff ? { portion: 0, countedAs: 'weekly_off' } : { portion: part === 'full' ? 1 : 0.5, countedAs: 'leave' };
}

/**
 * Substitute days off (E19 / YX-AT-11, calendar rule "substitute"): a whole-day holiday on a weekly off gives the next
 * day that is neither a weekly off nor a holiday nor another substitute. Optional and restricted days give none.
 */
export function substituteDays(holidays: readonly HolidayRow[], isOff: (on: string) => boolean): { on: string; name: string; forOn: string }[] {
  const taken = new Set(holidays.map((h) => h.on));
  const out: { on: string; name: string; forOn: string }[] = [];
  for (const h of [...holidays].sort((a, b) => a.on.localeCompare(b.on))) {
    if (h.halfDay || h.kind === 'optional' || h.kind === 'restricted' || !isOff(h.on)) continue;
    let d = addDays(h.on, 1);
    // A week of weekly offs and holidays in a row is not a real calendar; stop rather than loop.
    for (let i = 0; i < 14 && (isOff(d) || taken.has(d)); i++) d = addDays(d, 1);
    taken.add(d);
    out.push({ on: d, name: `${h.name} (substitute day off)`, forOn: h.on });
  }
  return out;
}
