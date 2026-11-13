// Answer 1648: fuller per-ticket timing on the SLA timeline. Pure rules; the clock is the SLA engine's business time on
// the desk's calendar (businessSecondsBetween), never a second clock.
import { CalendarSpec, businessSecondsBetween } from './business-time';

export interface TimingMessage {
  side: string;
  at: Date;
}

/**
 * The average wait for an agent's reply: from the ticket opening (the requester's first turn) or a requester message to
 * the next public agent reply, in business seconds. Null before any agent reply.
 */
export function replyGaps(cal: CalendarSpec, openedAt: Date, messages: readonly TimingMessage[]): { average: number | null; count: number } {
  let waitingSince: Date | null = openedAt;
  const gaps: number[] = [];
  for (const m of [...messages].sort((a, b) => a.at.getTime() - b.at.getTime())) {
    if (m.side === 'requester') waitingSince ??= m.at;
    else if (m.side === 'agent' && waitingSince) {
      gaps.push(businessSecondsBetween(cal, waitingSince, m.at));
      waitingSince = null;
    }
  }
  return { average: gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : null, count: gaps.length };
}

/** Business seconds the ticket spent on hold: each stretch from a change into "on hold" to the next change (or now). */
export function onHoldSeconds(cal: CalendarSpec, spans: readonly { at: Date; onHold: boolean }[], now: Date): number {
  const list = [...spans].sort((a, b) => a.at.getTime() - b.at.getTime());
  let total = 0;
  list.forEach((s, i) => {
    if (!s.onHold) return;
    const to = list[i + 1]?.at ?? now;
    if (to > s.at) total += businessSecondsBetween(cal, s.at, to);
  });
  return total;
}

/** Moves: every change of queue (group), and every change of owner after the first (a hand-over or taking it away). */
export function moveCount(events: readonly { kind: string; fromValue: string | null; toValue: string | null }[]): number {
  return events.filter((e) => (e.kind === 'group_changed' && e.fromValue !== e.toValue) || (e.kind === 'assigned' && e.fromValue !== null && e.fromValue !== e.toValue)).length;
}
