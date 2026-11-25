import { daysBetween } from './time-maths';

// TIM-07 Ot (Nov 2026): overtime asked for ahead of the work, and how a later claim reads it. The company chooses what
// happens to a claim without one (attendance.overtime.pre_approval: refuse, flag or allow; default flag).

export type PreApprovalMode = 'refuse' | 'flag' | 'allow';

/** Hours as words: 90 → "1.5 h". */
export const hoursText = (m: number) => `${Math.round((m / 60) * 100) / 100} h`;

/** The plain reason a plan can't be asked for, or null. Quarter hours, 0.5 to 12 h, today up to `aheadDays` ahead. */
export function otPlanProblem(i: { on: string; today: string; aheadDays: number; minutes: number }): { field: 'on' | 'minutes'; message: string } | null {
  if (i.on < i.today) return { field: 'on', message: 'Pick today or a later date. Overtime already worked is claimed on My overtime.' };
  if (daysBetween(i.today, i.on) > i.aheadDays) return { field: 'on', message: `Pick a date in the next ${i.aheadDays} days.` };
  if (!Number.isInteger(i.minutes) || i.minutes < 30) return { field: 'minutes', message: 'Enter at least 0.5 h.' };
  if (i.minutes % 15) return { field: 'minutes', message: 'Use quarter hours (for example 1.25 or 1.5).' };
  if (i.minutes > 720) return { field: 'minutes', message: 'Enter at most 12 h.' };
  return null;
}

/**
 * What a claim does with the day's pre-approval. With a plan: the summary says how much was pre-approved and any time
 * over it. Without one: refused, flagged to the approver, or nothing, by the company setting.
 */
export function preApprovalCheck(mode: string, plannedMinutes: number | null, payableMinutes: number): { refuse: string | null; note: string | null } {
  if (plannedMinutes !== null) {
    const over = payableMinutes - plannedMinutes;
    return { refuse: null, note: over > 0 ? `Pre-approved up to ${hoursText(plannedMinutes)}; ${hoursText(over)} more than planned` : `Pre-approved up to ${hoursText(plannedMinutes)}` };
  }
  if (mode === 'refuse') return { refuse: 'Overtime needs approval before the work. Ask your manager to pre-approve it next time, or ask HR about this day.', note: null };
  if (mode === 'flag') return { refuse: null, note: 'Not pre-approved' };
  return { refuse: null, note: null };
}
