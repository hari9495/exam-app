// Keka ideas (2026-11): "My team today" for a manager's Home. One state per direct report for today, from the day the
// engine keeps, approved leave, and approved work-from-home and on-duty requests. Pure, so the order of the rules is tested.

export type TeamTodayState = 'leave' | 'off' | 'on_duty' | 'wfh' | 'late' | 'in' | 'not_in';

const IN = new Set(['present', 'half_day', 'missing_out']);

/**
 * A full day of approved leave wins; then a holiday or weekly off; then on duty and work from home (approved requests);
 * then late (checked in after the grace); then in (a check-in or a worked day); anything else is not in yet.
 */
export function teamTodayState(x: { status?: string | null; leave?: 'full' | 'first' | 'second' | null; firstIn?: Date | null; lateMinutes?: number | null; wfh: boolean; onDuty: boolean }): TeamTodayState {
  if (x.leave === 'full' || x.status === 'leave') return 'leave';
  if (x.status === 'holiday' || x.status === 'weekly_off') return 'off';
  if (x.onDuty) return 'on_duty';
  if (x.wfh) return 'wfh';
  if ((x.lateMinutes ?? 0) > 0) return 'late';
  if (x.firstIn || IN.has(x.status ?? '')) return 'in';
  return 'not_in';
}
