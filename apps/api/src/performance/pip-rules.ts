import { addDays } from '../org-structure/org-validation';

// Performance batch PM8 (M06-BUILD-DESIGN §13; PM-8.01 … 8.03): pure rules for improvement plans, unit-tested.

export type Span = { from: string; to: string };
const DAY = 86_400_000;
const days = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);

/** Check-ins on a fixed schedule from the start: every n days up to the end, and always one on the last day. */
export function checkinDates(startsOn: string, endsOn: string, every: number, after?: string): string[] {
  const out: string[] = [];
  for (let k = 1; ; k++) {
    const d = addDays(startsOn, k * every);
    if (d > endsOn) break;
    out.push(d);
  }
  if (out[out.length - 1] !== endsOn) out.push(endsOn);
  return after ? out.filter((d) => d > after) : out;
}

/**
 * §13 / D10: protected leave pauses a plan, so the end moves by every protected day inside it. A pause can push the end
 * into more leave, so this runs until the end stops moving.
 */
export function pausedEnd(startsOn: string, plannedEnd: string, leave: readonly Span[]): { endsOn: string; pausedDays: number } {
  let paused = 0;
  for (let i = 0; i < 20; i++) {
    const end = addDays(plannedEnd, paused);
    const next = leave.reduce((t, l) => {
      const from = l.from > startsOn ? l.from : startsOn;
      const to = l.to < end ? l.to : end;
      return from <= to ? t + days(from, to) + 1 : t;
    }, 0);
    if (next === paused) break;
    paused = next;
  }
  return { endsOn: addDays(plannedEnd, paused), pausedDays: paused };
}

export const onLeave = (day: string, leave: readonly Span[]) => leave.some((l) => l.from <= day && day <= l.to);

/** What is wrong with a proposed plan, or null (lengths from perf.pip.lengths; check-ins at least weekly, at most monthly). */
export function planProblem(p: { lengthDays: number; checkinEveryDays: number; startsOn: string }, lengths: readonly number[], today: string): string | null {
  if (!lengths.includes(p.lengthDays)) return `A plan runs for ${lengths.join(', ')} days.`;
  if (p.checkinEveryDays < 7 || p.checkinEveryDays > 30) return 'Check in at least every 30 days and at most every 7.';
  if (p.checkinEveryDays >= p.lengthDays) return 'Check in more than once during the plan.';
  if (p.startsOn < today) return 'A plan cannot start in the past.';
  if (days(today, p.startsOn) > 60) return 'Start the plan within 60 days.';
  return null;
}

/** An extension happens once, moves the end later, and by at most 90 days. */
export function extensionProblem(endsOn: string, extendTo: string | null | undefined, extended: boolean): string | null {
  if (extended) return 'A plan is extended only once.';
  if (!extendTo || extendTo <= endsOn) return 'Give a new end date after the current one.';
  if (days(endsOn, extendTo) > 90) return 'Extend by at most 90 days.';
  return null;
}

/** A check-in is missed when it was not held within the grace days after it was due (and not during protected leave). */
export const MISSED_AFTER_DAYS = 3;
export const isMissed = (dueOn: string, today: string, leave: readonly Span[]) => days(dueOn, today) > MISSED_AFTER_DAYS && !onLeave(dueOn, leave);
