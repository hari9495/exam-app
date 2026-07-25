# Proactive "Candidate Needs Attention" Alert — Design

## Goal

Tell a recruiter that a specific candidate is in trouble *while it is happening*, instead of relying on the recruiter to be staring at the Live Monitoring tab. A candidate whose machine is misfiring — or who is blatantly tab-switching — should surface itself.

## Why this exists

The proctoring bypass feature gave recruiters the ability to rescue a candidate mid-exam. It did not give them any reason to look. Today the only way to notice a struggling candidate is to have the Live tab open and to be watching the right row at the right moment. If nobody looks, the candidate is blocked and has to email support after the fact — by which point the exam is over.

## Current State

- `useExamMonitoring` (`apps/web/lib/hooks/useExamMonitoring.ts`) holds `alerts: ProctoringFlag[]`, fed only by the `proctoring:flag` socket event. `ProctoringFlag` carries `{ attemptId, candidateId, eventType, severity, occurredAt }`.
- `LiveMonitoringPanel.tsx:177-184` renders an "Integrity alerts" count per row by filtering that array for medium/high severity.
- The gateway emits `roster:snapshot` once on `join-exam`; `MonitoringService.getRosterSnapshot` builds it from the database.

**A pre-existing bug this design must fix.** `useExamMonitoring.ts:36` calls `setAlerts([])` on join, and nothing ever seeds it from history. So the alert count column reads **0 for every candidate** when a recruiter opens the tab, regardless of what actually happened. The number means "alerts since you opened this page", but it is presented as the candidate's alert count. A recruiter joining twenty minutes into an exam sees a clean board that is not clean.

This is not a side issue — an alert built on that array would inherit the same blindness and fail in exactly the situation it exists for.

## Design

### 1. Seed the alert history on join

`MonitoringService` gains a query for recent proctoring events across the exam — medium and high severity only, within the last `ALERT_HISTORY_MINUTES` (30), shaped as `ProctoringFlag[]` so it is indistinguishable from live traffic. The gateway emits it on `join-exam` as `proctoring:recent`, alongside the existing `roster:snapshot`.

`useExamMonitoring` seeds `alerts` from that event rather than leaving it empty.

Everything downstream then works unchanged: the count column becomes truthful, and the rate detection in §2 sees real history. Seeding the same array the socket already feeds is deliberate — no second code path, no reconciliation, no double-counting.

Cap the seeded history at the existing `MAX_ALERTS` ceiling, newest first, so a noisy exam cannot flood the client.

### 2. The trigger

A candidate is **flagged for attention** when they have accumulated `ATTENTION_ALERT_COUNT` (5) or more medium/high alerts within `ATTENTION_WINDOW_MINUTES` (2), measured on a rolling window from `occurredAt`.

Chosen over the alternatives because it catches both cases the recruiter cares about with one rule: a driver misfiring in bursts, and someone repeatedly leaving the exam. A single violation — the common, uninteresting case — never flags.

The flag is **derived, not stored**. It is a function of the alert list and the current time, so it clears by itself when the burst stops. No state to persist, nothing to reset, and no possibility of a stale flag surviving a reload.

Both constants are named exports in one module so the thresholds can be tuned without hunting through the component. They are deliberately **not** per-exam configurable — there is no evidence yet that different exams need different values, and a setting nobody knows how to choose is worse than a sensible constant.

### 3. In-app surfacing

- The flagged candidate's roster row is visually highlighted, and carries a plain-language badge — "Needs attention" — beside the existing status badges.
- The count in the "Integrity alerts" column is already there and becomes meaningful once §1 lands.
- The Live tab trigger itself shows a count of currently-flagged candidates, so the signal is visible from the Details or Candidates tab without switching.

The tab count is the part that matters most: a recruiter editing an exam or reviewing candidates gets pulled to Live without having to think to check.

**This requires moving `useExamMonitoring` up to the exam edit page.** `TabsContent` is Radix's, which unmounts inactive tabs, so today `LiveMonitoringPanel` — and with it the socket and the whole alert feed — is destroyed the moment the recruiter switches to Details or Candidates. Nothing can be counted on the Live tab because no data is arriving.

The same limitation silently breaks the notification in §4: a recruiter sitting on the Details tab would receive no events at all, so nothing could ever fire. (Switching to a different *browser* tab is fine — the React tree stays mounted — but switching in-app tabs is not.)

So the page owns the hook and passes `roster`, `alerts`, `connectionStatus` and `joinError` down to `LiveMonitoringPanel` as props. The panel keeps all its current behaviour and simply stops calling the hook itself. One socket, alive for as long as the exam page is open, regardless of which tab is showing.

### 4. Browser notification

When a candidate becomes flagged **and the page is not visible** (`document.visibilityState === 'hidden'`), fire a desktop notification naming the candidate and the exam.

Rules that keep it from becoming noise:

- **Only when hidden.** If the recruiter is already looking at the tab, the highlight is enough; a notification on a focused tab is pure irritation.
- **Once per candidate per flare-up.** Track which attempts have already been notified. An attempt is re-armed only after it has been *un*flagged (the burst subsided) for `NOTIFY_REARM_MINUTES` (10). Without this, a sustained burst re-notifies on every incoming event.
- **Permission is requested on an explicit user action**, not on page load — a button in the Live panel ("Enable alerts"). Browsers reject or penalise unprompted permission requests, and a spontaneous prompt on page load is hostile.
- If permission is denied or unavailable, the in-app highlighting still works. The notification is an enhancement, never the only channel.

### 5. What this deliberately does not do

- **No email.** Considered and rejected for now: email is slow for a live situation and quickly becomes filtered noise. The gap it would cover — the recruiter having closed the app entirely — is real, but worth confirming against actual usage before building.
- **No server-side detection.** The recruiter's client already receives every event it needs. Server-side detection would only be required to notify someone with no browser open, which is the email case above.
- **No auto-action.** The system never relaxes proctoring by itself. Deciding whether a burst is a broken machine or a cheating candidate is a human judgement, and the whole point of the bypass audit trail is that a person made that call.

## Accepted Limitations

- The alert only reaches a recruiter with the app open in some tab. Fully closing the app means no alert. Stated plainly rather than papered over — §5 explains why email is deferred rather than assumed.
- Seeded history is capped at 30 minutes and `MAX_ALERTS`. A candidate who had a burst 45 minutes ago and has been quiet since will not be flagged — which is correct, since they no longer need attention, though the count column will under-report their total.

## Testing

- `getRosterSnapshot`'s companion query returns only medium/high events within the window, newest first, respecting the cap.
- `useExamMonitoring` seeds `alerts` from `proctoring:recent` and still appends live `proctoring:flag` events without duplicating a seeded one.
- The trigger: 4 alerts in the window does not flag; 5 does; 5 spread beyond the window does not; alerts for a different attempt do not contribute.
- The flag clears on its own once the window passes.
- Notification fires only when `visibilityState` is `hidden`, fires once per flare-up, and re-arms only after the un-flagged interval.
- Denied permission leaves the in-app highlight fully working.
- The Live tab count reflects the number of flagged candidates and returns to zero when they subside.
