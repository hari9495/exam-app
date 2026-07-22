# External-Tool & Screen-Share Detection — Design

**Date:** 2026-07-22
**Status:** Approved by user (design conversation, this session)

## Purpose

Extend the existing Integrity & Anti-Cheating system with two new
browser-observable proctoring signals aimed at candidates using third-party
tools (AI assistants, messaging apps) or sharing their screen to a helper
during an exam:

1. **`window_blur`** — focus lost to another application while the exam tab
   stays visible (the "AI assistant in a second window on the same screen"
   case, invisible to the existing `tab_switch` detector).
2. **Multi-monitor** — an extended display, the main enabler of both external
   tools and screen-sharing to a helper: gated at exam start, flagged if a
   display is added mid-exam (`multi_monitor_detected`).

**Honest detection limit (drove the whole scope):** no browser API can
directly detect another application capturing or casting the screen. These
two signals are the browser-observable proxies commercial proctoring products
use for the same goal. No native agent, no browser extension — this stays a
pure web app.

## Response model (the approved hybrid)

| Signal | During exam | At exam start | Blocking |
|---|---|---|---|
| `window_blur` | Report-only proctoring event, severity **medium** | — | Never |
| Multi-monitor | `multi_monitor_detected` report-only event, severity **high** | **Gate**: cannot start while `screen.isExtended` is true | Start-gate only; never mid-exam |

No strike system for either signal — strikes remain webcam-only. Rationale:
`window_blur` is noisy (notifications, alt-tab reflexes, password managers)
so it is pattern-evidence for the recruiter and integrity engine, not
punishment; `isExtended` is reliable and candidate-fixable in seconds, so
friction at start is fair while mid-exam blocking would be harsh.

## Architecture: two new event types, zero new pipeline

Both signals register through the existing 3-point pattern for a client
proctoring event; everything downstream (live socket flags, ProctoringEvent
persistence, integrity-level derivation, badges, exports, Claude narrative)
picks them up automatically:

1. `apps/web/lib/types.ts` `ProctoringEventType` union: add `'window_blur'`
   and `'multi_monitor_detected'`.
2. `apps/exam-runtime/src/attempts/proctoring-severity.ts`:
   - `CLIENT_REPORTABLE_EVENT_TYPES`: add both.
   - `SEVERITY_BY_EVENT_TYPE`: `window_blur: 'medium'`,
     `multi_monitor_detected: 'high'`.
3. `apps/web/lib/hooks/useProctoringMonitor.ts`: the two detectors (below).

The integrity engine needs **no new rules**: its existing `proctoring_events`
attempt-derived flag already aggregates events by severity into
`clear/review/high_concern` (`integrity-rules.ts` `deriveAttemptFlags`), and
any single high-severity event already yields `high_concern` — which is the
intended weight for a mid-exam monitor addition.

## Detector 1: window_blur

In `useProctoringMonitor.ts`:

- Listen to `window` `blur`. Report **only when
  `document.visibilityState === 'visible'`** — a real tab switch fires
  `visibilitychange` (already covered by `tab_switch`); this condition
  isolates focus lost to another app/window while the exam remains on
  screen. Debounced 5s, same as `tab_switch`/`fullscreen_exit`.
- The event is reported on the matching `focus` (return) event, carrying the
  measured blur duration as `metadata: { durationMs }` (the `ProctoringEvent`
  table already has `metadataJson`; the report DTO/service already accept
  metadata). Reporting at focus-return is safe: the candidate must refocus
  the window to keep taking the exam, so every blur they come back from
  reports; a blur they never return from ends in idle-timeout/expiry, which
  are their own, stronger signals. Recruiters see "lost focus 14×, ~6 min
  total" patterns in the timeline rather than bare counts.

## Detector 2: multi-monitor

**Start gate — `apps/web/app/(candidate)/welcome/page.tsx`:**

- When the candidate clicks "Start exam" (after practice + consent, before
  calling the start endpoint): if `window.screen.isExtended === true`, do
  not call start; render a candidate-styled message: **"Please disconnect
  additional displays before starting the exam."** The button stays active
  and re-checks on every click, so unplugging then clicking again proceeds
  with no reload.
- Browsers without `screen.isExtended` (Firefox, Safari): the property is
  `undefined` → gate passes. Fail-open by necessity — the browser offers no
  signal — matching this platform's existing client-side proctoring posture.
- Client-side only, like every other proctoring check in this app (webcam
  monitor included). Bypassing it requires devtools-level tampering, which
  the existing `dev_tools_detected` signal already covers as its own flag.

**Mid-exam watcher — in `useProctoringMonitor.ts`:**

- A 15-second `setInterval` reads `screen.isExtended`. Edge-triggered:
  report `multi_monitor_detected` once per false→true transition, not per
  tick (an internal ref tracks last state; state resets if the display is
  removed, so re-adding fires again).
- Candidates who passed the gate on a browser without `isExtended` simply
  never fire this event (undefined never transitions to true).

## Recruiter surfacing

No new UI. The live monitoring panel's alert list and per-attempt alert
counts, the candidate-detail integrity badge/flag list/narrative, and the
CSV/XLSX/PDF exports all render whatever event types and integrity flags
exist. The two new event types appear in all of them by construction.

## Error handling summary

| Condition | Behavior |
|---|---|
| Browser lacks `screen.isExtended` | Start gate passes; mid-exam watcher never fires (fail-open — no signal available) |
| Blur with tab hidden | Suppressed (that's a `tab_switch`, already reported) |
| Blur bursts | 5s debounce, same as existing events |
| Display added mid-exam | One `multi_monitor_detected` (high) per transition; no block |
| Backend receives unknown event type | Existing DTO `@IsIn` allowlist rejects — both new types added to it |

## Testing

- **Unit — useProctoringMonitor** (extend existing hook tests): blur while
  visible fires `window_blur`; blur during tab-hide is suppressed; focus
  return attaches `durationMs` metadata; `isExtended` false→true fires
  `multi_monitor_detected` exactly once; true→true ticks stay silent;
  removal + re-add fires again; undefined `isExtended` never fires.
- **Unit — welcome page** (extend existing page tests): `isExtended: true`
  blocks start with the message visible and does not call the start
  endpoint; re-click after flipping to false proceeds; undefined proceeds.
- **Unit — backend**: both types accepted by the DTO allowlist; severity map
  returns medium/high respectively (extend proctoring-severity tests).
- **E2E (Playwright)**: mock `screen.isExtended` true via addInitScript →
  candidate is gated at start with the message; flip the mock → start
  succeeds; mid-exam flip → recruiter's live monitoring view shows the
  `multi_monitor_detected` flag (same two-context pattern as
  live-monitoring-golden-path.spec.ts).

## Out of scope (deliberate)

- Native/extension-based process detection (impossible as a pure web app).
- Direct screen-capture/casting detection (no browser API exists).
- Strike/blocking behavior for the new signals (webcam-only remains).
- New integrity rules or thresholds (existing severity aggregation carries
  the new events).
- Recruiter-side per-exam toggle for these signals (they are always-on like
  every existing proctoring event; a config surface can come later if
  requested).
