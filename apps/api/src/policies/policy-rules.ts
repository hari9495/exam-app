// HLP-10 / HLP-11 rules as plain functions (docs/yukthix/helpdesk-design-map.md section 4d). Dates are India days
// ("2026-11-03"); every number comes from the company's settings.

const DAY = 86_400_000;
const asDay = (d: string) => Date.parse(`${d}T00:00:00Z`);

/** "2026-11-03" + n days. */
export const addDays = (d: string, n: number) => new Date(asDay(d) + n * DAY).toISOString().slice(0, 10);
/** Whole days from a to b (b later = positive). */
export const daysBetween = (a: string, b: string) => Math.round((asDay(b) - asDay(a)) / DAY);

/** POL-01 … POL-99, POL-100. */
export const policyCode = (n: number) => `POL-${String(n).padStart(2, '0')}`;

/** A setting value as days; 'off' (or anything not a whole number above 0) is null. */
export function daysSetting(v: string): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * The version people must have acknowledged: the newest published one that asked for it (v1 always does).
 * Versions are { number, reack } of the published ones.
 */
export function ackVersionNumber(published: readonly { number: number; reack: boolean }[]): number | null {
  const asked = published.filter((v) => v.reack || v.number === 1).map((v) => v.number);
  return asked.length ? Math.max(...asked) : null;
}

/** Done once the person acknowledged that version or a later one. */
export const isDone = (ackedNumbers: readonly number[], need: number) => ackedNumbers.some((n) => n >= need);

/** Due: the later of the version's effective day and the joining day, plus the company's due days. */
export function dueOn(effectiveOn: string, joinedOn: string | null, dueDays: number): string {
  const from = joinedOn && joinedOn > effectiveOn ? joinedOn : effectiveOn;
  return addDays(from, dueDays);
}

export type MyStatus = 'pending' | 'overdue' | 'acknowledged';
/** Overdue the day after the due day. */
export const statusOf = (done: boolean, due: string, today: string): MyStatus => (done ? 'acknowledged' : today > due ? 'overdue' : 'pending');

/**
 * The daily job: remind a pending person when nothing went to them in the last `everyDays` days (counted from the last
 * reminder, or the publish notice). Null everyDays = the company switched reminders off.
 */
export function remindNow(lastSent: string | null, today: string, everyDays: number | null): boolean {
  if (!everyDays) return false;
  return !lastSent || daysBetween(lastSent, today) >= everyDays;
}

/** Tell the manager once, when the person is at least `afterDays` days overdue. */
export function tellManagerNow(due: string, today: string, afterDays: number | null, alreadyTold: boolean): boolean {
  if (!afterDays || alreadyTold) return false;
  return daysBetween(due, today) >= afterDays;
}

/** Names compared the way people type them: trimmed, one space, any case. */
export const sameName = (a: string, b: string) => a.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en') === b.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en');
