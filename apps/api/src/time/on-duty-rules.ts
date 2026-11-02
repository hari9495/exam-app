import { daysBetween } from './time-maths';

// TIM-03 / TIM-07 OnDuty (Nov 2026): an employee asks to mark a day, or part of it, as on duty away from the office.
// The company sets how far ahead and back it can be asked (attendance.on_duty.ahead_days / back_days).

/** Shortest on-duty stretch (minutes). */
export const ON_DUTY_MIN_MINUTES = 30;

/** 510 → "8:30 am". */
export const clockText = (m: number) => `${Math.floor(m / 60) % 12 || 12}:${String(m % 60).padStart(2, '0')} ${m < 720 ? 'am' : 'pm'}`;

/** The plain reason an on-duty request can't be sent, or null. */
export function onDutyProblem(i: { on: string; today: string; aheadDays: number; backDays: number; inMinute: number; outMinute: number }): { field: 'on' | 'times'; message: string } | null {
  const ahead = daysBetween(i.today, i.on);
  if (ahead > i.aheadDays) return { field: 'on', message: `Pick a date in the next ${i.aheadDays} days.` };
  if (-ahead > i.backDays) return { field: 'on', message: `Pick a date in the last ${i.backDays} days. Ask HR to record an older day.` };
  if (![i.inMinute, i.outMinute].every((m) => Number.isInteger(m) && m >= 0 && m <= 1439)) return { field: 'times', message: 'Enter the From and To times.' };
  if (i.outMinute <= i.inMinute) return { field: 'times', message: 'Enter a To time after From.' };
  if (i.outMinute - i.inMinute < ON_DUTY_MIN_MINUTES) return { field: 'times', message: `On duty is at least ${ON_DUTY_MIN_MINUTES} minutes.` };
  return null;
}

/** Do two on-duty stretches of one day overlap (touching ends do not)? */
export const overlaps = (a: { inMinute: number; outMinute: number }, b: { inMinute: number; outMinute: number }) => a.inMinute < b.outMinute && b.inMinute < a.outMinute;
