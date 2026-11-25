import { DateTime } from 'luxon';
import { workingIntervals, type CalendarSpec } from './business-time';

// Batch F GLPI 4 (answer 2571): a ticket waiting for the requester is chased once a business day, at most `max` times,
// then solved after `solveDays` business days with no reply. A business day counts once the desk's calendar has opened
// on it after the ticket started waiting (the waiting day itself never counts).

/** Business days of the desk's calendar since `from` (a day counts once its first working hour has begun). */
export function businessDaysSince(cal: CalendarSpec, from: Date, now: Date): number {
  if (now <= from) return 0;
  let day = DateTime.fromJSDate(from, { zone: cal.zone }).startOf('day').plus({ days: 1 });
  const end = DateTime.fromJSDate(now, { zone: cal.zone });
  let n = 0;
  // ponytail: walks day by day; a ticket waits weeks, not years (capped at 400 days).
  for (let i = 0; i < 400 && day <= end; i++, day = day.plus({ days: 1 })) {
    const first = workingIntervals(cal, day)[0];
    if (first && first[0] <= now.getTime()) n++;
  }
  return n;
}

/** What the job does now: send a reminder, solve the ticket, or nothing. */
export function chaseStep(o: { businessDays: number; chased: number; max: number; solveDays: number }): 'chase' | 'solve' | null {
  if (o.businessDays >= o.solveDays) return 'solve';
  if (o.chased < o.max && o.businessDays >= o.chased + 1) return 'chase';
  return null;
}
