import { ProctoringFlag } from './types';

// A single violation is the ordinary case and must never flag. A burst is either a
// misfiring machine or a candidate repeatedly leaving the exam -- both need a human.
export const ATTENTION_ALERT_COUNT = 5;
export const ATTENTION_WINDOW_MINUTES = 2;

// How long an attempt must stay off the flagged set before a fresh desktop notification
// is allowed for it again -- otherwise a sustained burst would renotify on every event.
export const NOTIFY_REARM_MINUTES = 10;

// Derived, never stored: the flag is a function of the feed and the clock, so it clears
// itself when the burst passes and cannot survive a reload as stale state.
export function flaggedAttemptIds(alerts: ProctoringFlag[], now: number): Set<string> {
  const cutoff = now - ATTENTION_WINDOW_MINUTES * 60_000;
  const counts = new Map<string, number>();
  for (const alert of alerts) {
    if (alert.severity !== 'medium' && alert.severity !== 'high') continue;
    if (new Date(alert.occurredAt).getTime() < cutoff) continue;
    counts.set(alert.attemptId, (counts.get(alert.attemptId) ?? 0) + 1);
  }
  const flagged = new Set<string>();
  for (const [attemptId, count] of counts) {
    if (count >= ATTENTION_ALERT_COUNT) flagged.add(attemptId);
  }
  return flagged;
}
