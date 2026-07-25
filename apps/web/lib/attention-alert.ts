import { ProctoringFlag } from './types';

// A single violation is the ordinary case and must never flag. A burst is either a
// misfiring machine or a candidate repeatedly leaving the exam -- both need a human.
export const ATTENTION_ALERT_COUNT = 5;
export const ATTENTION_WINDOW_MINUTES = 2;

// How long an attempt must stay off the flagged set before a fresh desktop notification
// is allowed for it again -- otherwise a sustained burst would renotify on every event.
export const NOTIFY_REARM_MINUTES = 10;

// How long the client keeps an alert in the feed. Matches the server's replay window so
// the seeded history and the live feed hold the same thing, and it comfortably covers
// every consumer: the 2-minute flag window, the panel's 5-minute tile, the per-row count.
export const ALERT_RETENTION_MINUTES = 30;

// Memory guard only, and deliberately PER ATTEMPT. An exam-wide count cap couples
// candidates to each other: at 50 exam-wide, 30 candidates misfiring at once left ~1.7
// alerts each and nobody could reach the 5 needed to flag -- the feature went dark in
// exactly the scenario it exists for. Per-attempt retention means one candidate's noise
// can never evict another's, and the total stays bounded by exam size, which is already
// bounded. ponytail: a flat per-attempt number, not a byte budget -- revisit only if a
// real exam ever holds enough attempts for 30 minutes of alerts to matter for memory.
export const MAX_ALERTS_PER_ATTEMPT = 100;

// Assumes newest-first ordering, which both the server replay and the client's prepend
// maintain -- so the per-attempt cap drops a spamming attempt's oldest, never its newest.
export function retainAlerts(alerts: ProctoringFlag[], now: number): ProctoringFlag[] {
  const cutoff = now - ALERT_RETENTION_MINUTES * 60_000;
  const perAttempt = new Map<string, number>();
  return alerts.filter((alert) => {
    if (new Date(alert.occurredAt).getTime() < cutoff) return false;
    const kept = (perAttempt.get(alert.attemptId) ?? 0) + 1;
    perAttempt.set(alert.attemptId, kept);
    return kept <= MAX_ALERTS_PER_ATTEMPT;
  });
}

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
