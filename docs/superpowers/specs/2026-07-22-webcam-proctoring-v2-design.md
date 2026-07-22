# Webcam Proctoring v2 — Design

**Date:** 2026-07-22
**Status:** Approved by user (design conversation, this session)

## Purpose

Make the existing on-device webcam proctoring measurably more accurate, in four
ways the user approved:

1. **Multiple-faces detection** — a second person in frame is currently
   invisible (`numFaces: 1`; "≥1 face = fine"). New `multiple_faces` violation.
2. **Looking-down detection** — only yaw is measured today; looking down at a
   phone in the lap passes clean. New `looking_down` signal from pitch.
3. **Majority-vote sliding window** — today one clean frame resets the
   continuous-3s violation timer, which is both dodgeable and blink-fragile.
4. **Periodic snapshots + a viewer** — snapshots are currently captured only
   at violation time and, critically, **no screen renders any snapshot at
   all** (violation snapshots have been stored invisibly since v1). Periodic
   capture plus a "Webcam timeline" section fixes both.

## Current state (verified in source)

- `apps/web/lib/hooks/useWebcamMonitor.ts`: samples every 500ms
  (`SAMPLE_INTERVAL_MS`), requires an unbroken 3000ms of the same reason
  (`SUSTAINED_VIOLATION_MS`) before reporting; one clean frame resets
  (`violationSince = null`). MediaPipe `FaceLandmarker`, `numFaces: 1`,
  `outputFacialTransformationMatrixes: true`.
- `apps/web/lib/webcam-detection.ts`: `detectViolationReason()` returns
  `no_face` | `head_turned` (yaw > 30°) | null. Pitch is available in the same
  matrix but unused.
- Violation path: `POST /attempt/webcam-violation` →
  `AttemptSettlementService.registerWebcamViolation()` → creates a
  `webcam_violation` ProctoringEvent with `metadataJson: { snapshot, strike }`,
  increments `attempt.webcamViolationCount`, 3rd strike → status `blocked`,
  timer paused; recruiter Unblock releases.
- Candidate overlays: `ProctoringOverlay` warning ("Face not visible",
  "Warning {n}/3", "Continue") and block screens.
- **No frontend fetches or renders proctoring-event snapshots anywhere**
  (grep-verified: the attempts-admin `listProctoringEvents` endpoint has zero
  web callers).

## The four changes

### 1. Multiple-faces → strike path

- `FaceLandmarker` option `numFaces: 2`.
- `detectViolationReason()` gains: `faceLandmarks.length > 1` →
  `'multiple_faces'` (checked before the yaw branch; `length === 0` stays
  `no_face`).
- `multiple_faces` joins the existing strike pipeline exactly like
  `no_face`/`head_turned`: sustained (via the new voting window) → snapshot →
  `POST /attempt/webcam-violation` → strike/overlay/3-strike block. The
  webcam-violation DTO's reason enum adds `multiple_faces`.
- `ProctoringOverlay` warning gains a reason-specific message variant:
  heading **"More than one person detected"**, body instructing that only the
  candidate may be in frame, same "Warning {n}/3" + "Continue" recovery.
- Rationale: strong, low-false-positive signal; the strike overlay gives an
  innocent candidate (someone walked by) instant feedback to correct.

### 2. Looking-down → report-only proctoring event

- Pitch derived from the same facial transformation matrix (rotation about
  the X axis), mirroring the existing yaw math.
- Threshold: pitch more than **45° downward** (generous — typing glances at
  the keyboard sit well under this), sustained for a **longer window: ≥ 20 of
  the last 24 samples (~10s of 12s)** using the same voting mechanism as
  change 3 but with its own window parameters.
- On confirmation: report a **`looking_down` proctoring event** via the
  existing `POST /attempt/proctoring-event` pipeline, severity **medium**
  (registered in `CLIENT_REPORTABLE_EVENT_TYPES` + `SEVERITY_BY_EVENT_TYPE`,
  the same 3-point pattern as `window_blur`). Edge-triggered with the standard
  debounce so one sustained episode reports once; a new episode can report
  again.
- **Never a strike, never an overlay** — candidates who type while looking at
  the keyboard must not be paused or blocked. Recruiters see it live and the
  integrity engine counts it (medium events aggregate; no rule changes
  needed).

### 3. Majority-vote sliding window (replaces continuous-3s)

- In `useWebcamMonitor`, keep sampling at 500ms. Maintain a rolling buffer of
  the last **8** per-sample detection results. A violation reason is
  **confirmed** when **≥ 5 of the 8** samples report that same reason.
- On confirmation: capture snapshot + report, exactly as today; then reset
  the buffer so the next confirmation requires a fresh window (prevents
  rapid-fire duplicate strikes from one continuous episode; the existing
  `alreadyReported` semantics carry over as buffer-reset-until-clear:
  after a confirmed report, do not confirm again until a full clean window
  (0 of 8) has been observed).
- Effect: same effective sensitivity (~2.5–4s of violation), but a single
  clean frame no longer resets detection (fixes the dodge/flicker exploit),
  and transient single-frame false detections no longer accumulate toward a
  strike (fixes blink-fragility).
- The `looking_down` detector reuses the same voting utility with its own
  window (24 samples / threshold 20) and feeds the proctoring-event pipeline
  instead of the violation pipeline.
- The voting logic is extracted into a small pure module
  (`apps/web/lib/webcam-voting.ts` — `class` or closure factory
  `createViolationVoter({ windowSize, threshold })` returning
  `push(reason: string | null): string | null` where a non-null return is a
  confirmed reason) so it is unit-testable without the camera.

### 4. Periodic snapshots + Webcam timeline viewer

**Capture (candidate side, in `useWebcamMonitor`):**
- Every **random 120–180 seconds** (re-jittered after each capture so timing
  can't be gamed), capture a frame exactly like violation snapshots (JPEG,
  quality 0.5) and upload via a new endpoint
  `POST /attempt/webcam-snapshot` (candidate JWT, moderate throttle tier).
- Skipped while the e2e `__DISABLE_WEBCAM_MONITOR__` escape hatch is active
  (same gate as the rest of the monitor). Upload failures are swallowed
  (evidence, not control flow).

**Storage (exam-runtime):**
- The endpoint stores a ProctoringEvent with `eventType: 'webcam_snapshot'`,
  severity **low**, `metadataJson: { snapshot }` — same storage shape as
  violation snapshots.
- `webcam_snapshot` is **excluded from the live monitoring gateway emit**
  (no `emitProctoringFlag` for it — it must not spam the recruiter alerts
  feed) and, being low severity, is inert in the integrity engine's
  severity-based aggregation. It is server-accepted from this new endpoint
  only — NOT added to `CLIENT_REPORTABLE_EVENT_TYPES` (the generic
  proctoring-event endpoint must not accept giant base64 payloads).

**Viewer (panel console):**
- The panel candidate-detail report (`GET .../candidates/:candidateId/report`
  in apps/api reports service) adds a `webcamTimeline` array: for the
  attempt, every ProctoringEvent of type `webcam_violation` or
  `webcam_snapshot`, chronological: `{ occurredAt, kind: 'violation' |
  'periodic', reason?: string, strike?: number, snapshot: string }` (base64
  data URL as stored; empty-snapshot violation rows — e.g. the camera-failure
  fail-safe — are included without an image, rendered as a labeled tile).
- The candidate detail page (`apps/web/app/(panel)/reports/[examId]/candidates/[candidateId]/page.tsx`)
  gains a **"Webcam timeline"** section: chronological thumbnail grid;
  periodic tiles show just the time; violation tiles are visually marked with
  a red border + label ("{reason} — strike {n}"); clicking a tile opens the
  full-size image in the existing Modal primitive. Empty state: "No webcam
  snapshots recorded."

## Out of scope (deliberate)

- No changes to the 3-strike/block/unblock flow, sampling rate, yaw
  threshold, or e2e escape hatch.
- No audio monitoring, gaze/eye tracking, or object (phone) detection —
  different models, separate feature if ever wanted.
- No recruiter-console snapshot surface (the panel candidate-detail page is
  the established evidence-review surface; recruiters with results:view can
  already open it — note: recruiter role HAS results:view, so recruiters can
  view the same page).
- No retention policy change: snapshots live and die with the attempt row
  exactly as violation snapshots do today (and are removed by candidate-data
  erasure like all attempt data).

## Error handling summary

| Condition | Behavior |
|---|---|
| Camera/model failure at setup | Unchanged fail-safe: reports a `no_face` violation |
| Flickering detection (alternating clean/violation frames) | Voting window confirms when ≥5/8 agree — no longer resettable by a single clean frame |
| Blink / brief glance | Stays below 5-of-8 — no report (unchanged effective tolerance) |
| Candidate types while looking at keyboard | Pitch < 45° or short episodes — nothing fires |
| Sustained lap-gazing ≥ ~10s | One `looking_down` medium event per episode; no pause, no strike |
| Second person leans into frame | `multiple_faces` strike with corrective overlay |
| Periodic snapshot upload fails | Swallowed; next jittered capture proceeds |
| Snapshot event flooding | Server accepts `webcam_snapshot` only on its dedicated throttled endpoint; not client-reportable via the generic event route |

## Testing

- **Unit — voting module:** 5-of-8 confirms; 4-of-8 doesn't; single clean
  frames don't reset progress; post-confirmation requires a clean window
  before re-confirming; independent reasons don't cross-contaminate
  (alternating no_face/head_turned never confirms either at 4/8 + 4/8).
- **Unit — detection:** `multiple_faces` when landmarks length > 1; pitch
  math confirms >45° down triggers and keyboard-range (~25°) doesn't; yaw
  behavior unchanged.
- **Unit — monitor wiring (jsdom, mocked landmarker):** confirmed violation
  reports with snapshot; looking_down confirmation posts a proctoring event
  not a violation; periodic capture fires within the jittered interval and
  re-schedules.
- **Backend:** webcam-snapshot endpoint stores the event with severity low;
  gateway emit NOT called for it; DTO rejects `webcam_snapshot`/`looking_down`
  mis-routed as webcam-violation reasons; `multiple_faces` accepted as a
  violation reason; `looking_down` accepted by the proctoring-event allowlist
  with severity medium.
- **Reports:** candidate report includes the chronological `webcamTimeline`
  with correct kind/reason/strike mapping.
- **Page test:** Webcam timeline renders periodic + violation tiles, modal
  opens on click, empty state.
- **E2E:** existing suite green (webcam monitor remains disabled by the
  established mock flag; no new e2e spec — the camera cannot be meaningfully
  exercised in Playwright, consistent with v1's approach).
