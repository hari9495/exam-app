// Learning, the pure rules (LRN-01, 02, 07, 08): who a rule covers, when a course is due, when a completion runs out
// and a renewal is due, which reminder a day brings, and the status words the screens show. Dates are 'YYYY-MM-DD'.

export interface Job {
  legalEntityId: string;
  locationId: string;
  departmentId: string;
  designation: string;
}
export interface RuleScope {
  legalEntityIds: string[];
  locationIds: string[];
  departmentIds: string[];
  designation: string | null;
}

/** A rule covers a job when each listed set contains it (an empty set means any) and the designation has the words. */
export function covers(rule: RuleScope, job: Job): boolean {
  const inSet = (set: string[], v: string) => set.length === 0 || set.includes(v);
  const words = rule.designation?.trim().toLowerCase();
  return inSet(rule.legalEntityIds, job.legalEntityId) && inSet(rule.locationIds, job.locationId) && inSet(rule.departmentIds, job.departmentId) && (!words || job.designation.toLowerCase().includes(words));
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The same day n months on; the 31st falls back to the month's last day. */
export function addMonths(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(d, last));
  return first.toISOString().slice(0, 10);
}

/** Renewal enrolments are made this many days before a completion runs out (YX-LRN-05). */
export const RENEW_DAYS_BEFORE = 30;

/**
 * Whether a rule enrols the person today, and the due date. Nothing while an enrolment is open. With no completion:
 * due N days from today. With a completion and a repeat: from 30 days before it runs out, due the day it runs out
 * (a renewal). A completion with no repeat is final.
 */
export function ruleEnrols(input: { today: string; dueDays: number; repeatMonths: number; open: boolean; lastCompleted: string | null }): { enrol: false } | { enrol: true; dueOn: string; renewal: boolean } {
  if (input.open) return { enrol: false };
  if (!input.lastCompleted) return { enrol: true, dueOn: addDays(input.today, input.dueDays), renewal: false };
  if (!input.repeatMonths) return { enrol: false };
  const runsOut = addMonths(input.lastCompleted, input.repeatMonths);
  if (input.today < addDays(runsOut, -RENEW_DAYS_BEFORE)) return { enrol: false };
  return { enrol: true, dueOn: runsOut > input.today ? runsOut : addDays(input.today, input.dueDays), renewal: true };
}

export type ReminderKind = 'before_7' | 'before_2' | 'overdue_manager' | 'overdue_hr';

/**
 * The reminder a day brings for an open enrolment (LRN-07: 7 and 2 days before; the manager the day after it is
 * missed; HR after 7 days). A sweep that missed a day still sends the latest one that applies.
 */
export function reminderDue(dueOn: string, today: string): ReminderKind | null {
  if (today > addDays(dueOn, 6)) return 'overdue_hr';
  if (today > dueOn) return 'overdue_manager';
  if (today >= addDays(dueOn, -2)) return 'before_2';
  if (today >= addDays(dueOn, -7)) return 'before_7';
  return null;
}

export type ShownStatus = 'Requested' | 'Waitlisted' | 'Enrolled' | 'In progress' | 'Completed' | 'Overdue';

/** The status word on My learning and the record (never colour only): past due and not completed is Overdue. */
export function shownStatus(e: { status: string; dueOn: string | null }, today: string): ShownStatus {
  if (e.status === 'completed') return 'Completed';
  if (e.status === 'requested') return 'Requested';
  if (e.status === 'waitlisted') return 'Waitlisted';
  if (e.dueOn && e.dueOn < today) return 'Overdue';
  return e.status === 'in_progress' ? 'In progress' : 'Enrolled';
}

/** Required items done out of all required items, as a whole percentage. */
export function progressPct(requiredDone: number, requiredTotal: number): number {
  return requiredTotal ? Math.round((requiredDone / requiredTotal) * 100) : 0;
}

/** A completion counts for compliance while its certificate (if it expires) is still valid. */
export function validOn(completedOn: string | null, expiresOn: string | null, day: string): boolean {
  return Boolean(completedOn) && (!expiresOn || expiresOn >= day);
}

/** "2 h 30 min" from minutes. */
export function durationText(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
