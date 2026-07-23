# Browser-Activity Proctoring Strikes — Design

## Goal

Extend the exam-taking anti-cheat system so that seven browser-activity proctoring signals — tab switching/window blur, fullscreen exit, copy/paste, right-click, DevTools opening, multiple monitors, and 5+ minute idle — get the same visible warning + strike-based block treatment that webcam violations already have, instead of being recorded silently and only surfaced later on the Reports page.

## Current State

- `apps/web/lib/hooks/useProctoringMonitor.ts` detects these signals client-side and calls `useReportProctoringEvent()` (`apps/web/lib/hooks/useAttempt.ts:139`), which `POST`s to `/attempt/proctoring-event` and discards the response (`.catch(() => undefined)`).
- `AttemptService.reportProctoringEvent` (`apps/exam-runtime/src/attempts/attempt.service.ts:453`) just writes a `ProctoringEvent` row with a severity from `getProctoringEventSeverity` (`apps/exam-runtime/src/attempts/proctoring-severity.ts`) and returns `{ id, eventType, severity }`. No strike counter, no pause/block.
- Webcam violations (`no_face` / `multiple_faces` / `head_turned`) already have the target pattern: `AttemptSettlementService.registerWebcamViolation` (`apps/exam-runtime/src/grading/attempt-settlement.service.ts`) increments `attempt.webcamViolationCount`, sets `attempt.status` to `'paused'` (strikes 1–2) or `'blocked'` (strike 3), and the frontend renders `ProctoringWarningOverlay` / `ProctoringBlockOverlay` (`apps/web/app/(candidate)/components/`) accordingly, with a `Continue` button (`webcamResume` mutation) that resumes from `'paused'` back to `'in_progress'`.
- Reports page integrity analysis (`apps/api/src/reports/reports.service.ts`) already scores all `ProctoringEvent` rows by severity for staff review — this stays unchanged; it's the audit trail for everything below.

## Scope

Exactly these 7 event types get strike treatment: `tab_switch`, `window_blur`, `fullscreen_exit`, `copy_paste`, `right_click`, `dev_tools_detected`, `multi_monitor_detected`, `idle_timeout`. Other existing event types in `CLIENT_REPORTABLE_EVENT_TYPES` (`refresh_warning`, `editor_paste`, `looking_down`) are out of scope and keep their current silent-only behavior — the user didn't ask for those and expanding scope isn't warranted.

## Design

### 1. New counter, same state machine as webcam

Add `browserActivityViolationCount` (`Int @default(0)`) to the `Attempt` Prisma model, parallel to and fully independent from `webcamViolationCount`. Same 3-strike threshold and consequence: strike 1–2 → `attempt.status = 'paused'`, strike 3 → `attempt.status = 'blocked'`. Both counters can be non-zero independently; `attempt.status` is shared, and `'blocked'` always wins over `'paused'` if both systems are active (i.e. a system never downgrades `'blocked'` back to `'paused'`).

### 2. Cooldown-based dedup

`dev_tools_detected` currently re-fires every 2 seconds while DevTools stays open (confirmed empirically: 14 events in ~30 seconds during manual testing). Naively counting every occurrence as a strike would block an exam within 6 seconds of opening DevTools once. Fix: before counting a strike, look up the most recent `ProctoringEvent` of the *same `eventType`* for this attempt. If one exists within the last 60 seconds, still insert the new `ProctoringEvent` row (so the Reports timeline keeps full fidelity) but don't increment the strike counter — it's the same ongoing incident. If none exists within 60 seconds (first occurrence, or the cooldown has elapsed), it's a fresh strike.

### 3. Backend

`AttemptService.reportProctoringEvent` (`apps/exam-runtime/src/attempts/attempt.service.ts:453`):
- After inserting the `ProctoringEvent` row as today, if `dto.eventType` is one of the 7 in-scope types, call a new `AttemptSettlementService.registerBrowserActivityViolation(tx, attempt, eventType)` method (mirroring `registerWebcamViolation`'s shape) that applies the cooldown check from §2, updates `browserActivityViolationCount`/`status` when it's a fresh strike, and returns `{ strike, status }` (the *current* counter/status either way, whether or not this particular occurrence incremented it).
- Response shape changes from `{ id, eventType, severity }` to `{ id, eventType, severity, strike, status }`.
- Guard: if `attempt.status === 'blocked'` already, still log the event but don't attempt further status transitions (mirrors `webcamViolation`'s early check, though webcam throws — here we just no-op the transition since these events can keep arriving passively from background listeners).

### 4. Frontend

- `useReportProctoringEvent` (`apps/web/lib/hooks/useAttempt.ts:139`) changes from a fire-and-forget void function to one that returns the `{ strike, status }` result (still swallows network errors the same way, so a failed report never breaks the exam UI).
- `apps/web/app/(candidate)/exam/page.tsx` calls this from wherever `useProctoringMonitor` events surface (needs threading the report result up — `useProctoringMonitor` currently doesn't return anything; it will need to accept an `onViolation` callback or similarly expose the `{ strike, status }` result to the exam page) and reacts the same way it already reacts to `webcamViolation`'s result: `status === 'paused'` shows the warning overlay, `status === 'blocked'` shows the block overlay.
- `ProctoringWarningOverlay` / `ProctoringBlockOverlay` currently take a webcam-specific `reason` prop (`'no_face' | 'multiple_faces' | 'head_turned'`). Generalize both to accept a `message: string` prop instead (or a broader reason union covering all 10 event types) so the same components render the copy from §5 for browser-activity strikes without duplicating the overlay UI.
- The `Continue` button for a browser-activity pause has nothing to re-verify (unlike webcam, which re-checks face presence before resuming) — it's a simple "acknowledge and resume" call that just flips `status` back to `'in_progress'` server-side.

### 5. Candidate-facing copy

Per-signal warning message (strikes 1–2), each followed by a common line *"This has been recorded ({strike}/3). Repeated violations will block your exam."*:

| Signal | Message |
|---|---|
| `tab_switch` | "We noticed you switched away from this exam tab." |
| `window_blur` | "We noticed you switched to another application." |
| `fullscreen_exit` | "We noticed you exited fullscreen mode." |
| `copy_paste` | "We noticed copy or paste activity." |
| `right_click` | "We noticed a right-click / context-menu action." |
| `dev_tools_detected` | "We noticed browser developer tools were opened." |
| `multi_monitor_detected` | "We noticed an additional display was connected." |
| `idle_timeout` | "We noticed no activity for several minutes." |

Strike 3 (blocked): *"Your exam has been blocked due to repeated policy violations. Please contact your recruiter or interview coordinator."*

### 6. Testing

- `AttemptSettlementService.registerBrowserActivityViolation`: unit tests mirroring the existing `registerWebcamViolation` spec suite — strike 1/2 → paused, strike 3 → blocked, cooldown suppresses a same-type repeat within 60s, cooldown allows a new strike after 60s, independent from `webcamViolationCount`.
- `AttemptService.reportProctoringEvent`: unit tests confirming the response shape change and that out-of-scope event types (`refresh_warning`, `editor_paste`, `looking_down`) never call the new strike logic.
- Frontend: extend `useProctoringMonitor.test.tsx` / `exam/page.test.tsx` to cover the new overlay rendering on a `paused`/`blocked` response from a browser-activity report, and a generalized-overlay test for the message-prop change.

## Out of Scope

- The 3 non-listed event types (`refresh_warning`, `editor_paste`, `looking_down`) — stay silent-only.
- Any change to the webcam violation system itself, beyond the shared "blocked wins" status rule.
- Any change to the Reports page integrity scoring — it already reads all `ProctoringEvent` rows regardless of strike status.
