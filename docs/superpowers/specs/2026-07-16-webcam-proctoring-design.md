# Webcam Proctoring — Design Spec

## Context & Scope

The platform already has browser-event proctoring (`useProctoringMonitor`): tab switches, fullscreen exits, copy/paste, right-click, and dev-tools all get logged as `ProctoringEvent` rows and fed into an AI analysis pipeline (`claude-proctoring.client`) that recruiters see after the fact. None of that is real-time — a candidate can trigger every one of those events and keep taking the exam uninterrupted.

This feature adds a second, independent layer: **real-time webcam presence/attention checking that can actually stop the exam.** If a candidate's face isn't visible or their head is turned away for a sustained period, the attempt pauses and warns them. After three such violations, the attempt is hard-blocked and only a recruiter can resume it.

This is deliberately **not** an extension of the existing AI proctoring-analysis pipeline — no video/frames are sent to any server or LLM for interpretation. Detection runs entirely client-side using an on-device face-tracking model (MediaPipe Face Landmarker), the same category of technology as a browser-based QR scanner: a small ML model doing geometry, not a hosted AI call. The existing `ProctoringEvent` table and recruiter monitoring panel are reused as the storage/UI backbone, but this feature's violations are a separate concern from the AI-analyzed browser events.

## Scope Decisions

- **On-device detection only.** `@mediapipe/tasks-vision` (Face Landmarker) runs in the candidate's browser. No frame is ever uploaded except a single evidence snapshot captured at the instant a violation fires.
- **Two violation types**: no face detected, and head turned beyond an angle threshold (computed from the landmarker's facial transformation matrix). Both use the same sustained-duration debounce (~3 continuous seconds) to avoid flagging a brief glance away.
- **Mandatory for every exam.** No per-exam opt-in toggle — every exam requires camera access. (A future per-exam toggle is a natural follow-up if needed; not built now.)
- **Hard gate at exam start.** If the candidate denies camera permission or has no camera, they cannot start the exam — same pattern as the existing fullscreen requirement.
- **3-strike escalation**:
  - Strikes 1 and 2: attempt is paused (timer freezes), candidate sees a warning overlay, and can self-resume as soon as they're back in frame — no recruiter involvement.
  - Strike 3: attempt is blocked. No self-resume. Only a recruiter, from the existing Live Monitoring panel, can unblock it.
- **Timer truly freezes on pause/block.** The attempt's deadline is shifted forward by the paused duration when it resumes, so paused time is never counted against the candidate.
- **Reuses `ProctoringEvent`**, not a new table — two new `eventType` values (`webcam_no_face`, `webcam_head_turned`), snapshot stored in `metadataJson` as base64 for now.
- **Out of scope for this pass** (explicitly deferred, can be added later if needed): continuous video recording, AI-based analysis of webcam violations, a live video feed for recruiters, and a per-exam opt-in toggle.

## Data Model

```prisma
model Attempt {
  // ...existing fields...
  webcamViolationCount Int       @default(0) @map("webcam_violation_count")
  pausedAt             DateTime? @map("paused_at")
  pausedDurationMs      Int      @default(0) @map("paused_duration_ms")
}
```

- `status` (already a plain string, no enum) gains two new values: `"paused"`, `"blocked"`.
- `webcamViolationCount` drives the strike logic (1/2 → pause, 3 → block).
- `pausedAt` marks when the current pause began; on resume, `(now - pausedAt)` is added to `pausedDurationMs`, and the attempt's effective deadline calculation adds `pausedDurationMs` on top of the original duration — this is how the timer "freezes."

No new columns on `ProctoringEvent` — `eventType: 'webcam_no_face' | 'webcam_head_turned'`, `severity` follows existing conventions, `metadataJson` carries `{ snapshot: base64string, strikeNumber: number }`.

## Detection Logic (candidate browser)

New `useWebcamMonitor(enabled: boolean)` hook, structured like `useProctoringMonitor`:

1. On mount (when `enabled`), request `getUserMedia({ video: true })`, attach the stream to a hidden `<video>` element.
2. Run the Face Landmarker on that video at a low sample rate (a few times/sec — no need for full frame rate).
3. Track two conditions independently, each requiring **~3 continuous seconds** before counting as a violation:
   - No face detected in frame.
   - Head yaw/pitch (from the landmarker's transformation matrix) exceeds a fixed threshold.
4. On a sustained violation: capture one canvas snapshot from the video element, POST it to the backend, then stop re-triggering until the condition clears and re-occurs (no rapid-fire duplicate violations).

## Pause / Warn / Block Flow

**New endpoints on `apps/exam-runtime`** (candidate-facing, attempt-scoped, same auth guard as save-answer):

```
POST /attempts/:attemptId/webcam-violation
Body: { reason: 'no_face' | 'head_turned', snapshot: string (base64) }
Response: { strike: number, status: 'paused' | 'blocked' }
```
Processing: validate attempt ownership/active state → increment `webcamViolationCount` → log `ProctoringEvent` → if strike < 3, set status `paused` + `pausedAt = now`; if strike === 3, set status `blocked` + `pausedAt = now`.

```
POST /attempts/:attemptId/webcam-resume
Response: { status: 'in_progress' }
```
Only succeeds if current status is `paused` (not `blocked`) — candidate self-resume path. Adds elapsed pause time to `pausedDurationMs`, clears `pausedAt`, sets status back to `in_progress`.

**Recruiter unblock** — new endpoint on `apps/api`'s `attempts-admin` module, mirroring the existing force-submit action:

```
POST /attempts-admin/:attemptId/unblock
```
Proxies to an exam-runtime internal endpoint (same pattern as other admin actions) that does the same status/`pausedDurationMs` transition as `webcam-resume`, but callable only by a recruiter and only from `blocked`.

**Candidate-side resume detection while blocked**: the candidate client polls attempt status every few seconds while `blocked` (simplest option — no new WebSocket channel needed, since the candidate app doesn't currently hold a live socket connection; the existing monitoring gateway is recruiter-side only).

## Frontend

**Candidate exam page**:
- `useWebcamMonitor` mounted alongside the existing `useProctoringMonitor` during an active attempt.
- **Warning overlay** (strikes 1–2): full-screen overlay, "Warning {n}/3 — face not detected / please face the camera," with a "Continue" action once back in frame (calls `webcam-resume`).
- **Block overlay** (strike 3): full-screen overlay, "Your exam has been paused. A recruiter needs to unblock your session to continue," no dismiss action, polling in the background for status change.

**Welcome page**: extend the existing "This exam is monitored…" notice to mention webcam monitoring; add the camera-permission request as a hard gate before the Start button is enabled, matching the current fullscreen-requirement UX.

**Recruiter `LiveMonitoringPanel`**: add `blocked` to `STATUS_VARIANT` (danger), and an **Unblock** row action visible only when `status === 'blocked'`, calling the new `attempts-admin` endpoint and optimistically updating the roster row.

## Error Handling

- Camera permission denied / no camera at welcome screen — block Start with an explanation, consistent with the fullscreen-requirement gate.
- `getUserMedia` failing mid-attempt (camera disconnected, permission revoked) — treated the same as a sustained "no face" violation (fails safe toward flagging, not silently disabling the check).
- `webcam-violation` / `webcam-resume` network failures — retry with backoff client-side; if a paused candidate can't reach the resume endpoint, they remain paused (fails safe — never silently resumes without a real check passing).
- Unblock endpoint — standard admin-action error handling (403 if not authorized for that exam, 409 if attempt isn't currently `blocked`).

## Testing

- **Backend unit**: strike-counting logic (1→paused, 2→paused, 3→blocked), pause-duration accumulation across multiple pause/resume cycles, resume rejected when status is `blocked` (only unblock can clear that), unblock rejected when status isn't `blocked`.
- **Backend e2e**: full cycle — three violations → blocked → recruiter unblock → candidate resumes with correctly extended deadline.
- **Frontend unit**: warning/block overlay rendering per strike count, `useWebcamMonitor` sustained-duration debounce logic (mocked landmarker output — no real camera in tests), LiveMonitoringPanel unblock action and status badge.
- **Playwright**: cannot drive a real webcam/ML model in CI. The golden-path e2e will mock `getUserMedia`/landmarker output to simulate a violation and assert the warning overlay and roster status update — camera hardware and model-accuracy behavior are out of scope for automated browser tests and rely on the unit-level coverage above.
