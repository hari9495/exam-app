// PPL-42 re-verification: the due-date rules, kept pure so they are unit-tested on their own. Dates are YYYY-MM-DD.

/** Adds whole months; a day past the month's end clamps to its last day (31 Jan + 1 month = 28 or 29 Feb). */
export function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}

/**
 * When the next re-check is due: every N months after the last verification (or after joining, if never verified);
 * and, for a rule that also applies on a move into its roles, at once from the day of a move that came after the last
 * verification. Never before the rule itself started (`notBefore`): a new rule does not make people years overdue.
 */
export function dueOn(i: { lastVerified: string | null; joinedOn: string; everyMonths: number; onRoleChange: boolean; roleEnteredOn: string | null; notBefore?: string }): string {
  const periodic = addMonths(i.lastVerified ?? i.joinedOn, i.everyMonths);
  const moved = i.onRoleChange && i.roleEnteredOn && i.roleEnteredOn > i.joinedOn && (!i.lastVerified || i.roleEnteredOn > i.lastVerified) ? i.roleEnteredOn : null;
  const due = moved && moved < periodic ? moved : periodic;
  return i.notBefore && due < i.notBefore ? i.notBefore : due;
}

/** Overdue after the due date; due soon within `soonDays` of it; otherwise not due yet. */
export function dueStatus(due: string, today: string, soonDays = 30): 'overdue' | 'due soon' | 'not due' {
  if (due < today) return 'overdue';
  const soon = new Date(`${today}T00:00:00Z`);
  soon.setUTCDate(soon.getUTCDate() + soonDays);
  return due <= soon.toISOString().slice(0, 10) ? 'due soon' : 'not due';
}

/** A reminder for an asked, not yet uploaded copy: once it is due, then every `everyDays`. */
export function remindNow(i: { due: string; remindedOn: string | null; today: string; everyDays?: number }): boolean {
  if (i.today < i.due) return false;
  if (!i.remindedOn) return true;
  const next = new Date(`${i.remindedOn}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + (i.everyDays ?? 7));
  return i.today >= next.toISOString().slice(0, 10);
}
