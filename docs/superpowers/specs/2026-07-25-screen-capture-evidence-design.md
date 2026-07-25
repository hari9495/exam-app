# Screen-Capture Violation Evidence — Design

## Goal

For exams where the recruiter opts in, capture a screenshot of the candidate's **actual screen** at the moment each strike-worthy proctoring violation fires, so a reviewer can tell a genuine violation (they really did open another app) from a system false positive (an OS notification stole focus for 200ms). Screenshots attach to the existing proctoring event log.

## Current State

- Webcam violations already carry visual proof: `useWebcamMonitor` holds an open `getUserMedia` stream, `captureSnapshot(video)` (`apps/web/lib/hooks/useWebcamMonitor.ts:16`) grabs a canvas frame as a JPEG data URI, and the server uploads it via `blobStorage.uploadDataUri('webcam-snapshots/...')` and stores the resulting URL in `ProctoringEvent.metadataJson` as `{ snapshot: url }` (`apps/exam-runtime/src/attempts/attempt.service.ts:549,560`).
- Browser-activity violations carry no images. Some already carry useful metadata — `window_blur` records `durationMs`, `copy_paste` records `{ action }`, `dev_tools_detected` records `{ trigger }` (`apps/web/lib/hooks/useProctoringMonitor.ts:74-110`).
- Strike-worthy types are listed in `STRIKE_WORTHY_EVENT_TYPES` (`apps/exam-runtime/src/attempts/proctoring-severity.ts:33`); recruiter-toggleable ones in `TOGGLEABLE_PROCTORING_SIGNALS` (`apps/api/src/exams/dto/create-exam.dto.ts`).
- Per-exam proctoring config (`{ webcamEnabled, enforcement, strikeLimit, disabledSignals }`) is resolved by `resolveProctoringConfig` (`apps/exam-runtime/src/attempts/proctoring-config.ts`) and already reaches the candidate on both `AttemptPreviewResponse.exam.proctoring` and `AttemptStateResponse.exam.proctoring`.
- Pausing extends the deadline: `deadline = startedAt + durationMinutes*60_000 + pausedDurationMs` (`apps/exam-runtime/src/grading/grading.ts:56`).

## The constraint that shapes this design

A web page **cannot silently screenshot the screen**. The webcam approach works only because a camera stream is already open. The screen requires `getDisplayMedia()`, which:

1. Needs a real user gesture every single call — it cannot be pre-authorised and silently re-acquired the way camera permission can.
2. Shows a picker where the candidate chooses tab / window / entire screen. A screenshot of the exam tab proves nothing, so the choice must be validated.
3. Leaves a permanent browser-level "Stop sharing" control the candidate can hit at any time.
4. Is unsupported on mobile browsers entirely.

Consequence: the attempt starts on the welcome page and then **navigates** to `/exam` (`apps/web/app/(candidate)/welcome/page.tsx:73-74`), and a `MediaStream` cannot survive that route change. So the share must be acquired **on the exam page, with the clock already running** — which is fine, because pausing extends the deadline.

## Design

### 1. Per-exam config

New column on `Exam`:

```prisma
screenCaptureEnabled Boolean @default(false) @map("screen_capture_enabled")
```

**Default `false` is deliberate.** Defaulting true would retroactively make every existing exam impossible for any candidate on a mobile browser. Contrast `webcamProctoringEnabled`, which defaulted true because it was already the de-facto behaviour.

Threaded through the places the other four config fields already go: the create/update DTOs, `create()`/`update()`/`duplicate()` in `apps/api/src/exams/exams.service.ts`, the `ExamProctoringConfig` wire shape in both `proctoring-config.ts` and `apps/web/lib/types.ts`, and a checkbox in the "Proctoring & integrity" fieldset of `ExamDetailsForm.tsx`. It locks with the rest of the exam once a candidate starts.

### 2. Two new event types

Added to `CLIENT_REPORTABLE_EVENT_TYPES` in `proctoring-severity.ts`:

- `screen_share_started` — informational, `low` severity. Not strike-worthy. Metadata `{ displaySurface, userAgent }`.
- `screen_share_stopped` — added to `STRIKE_WORTHY_EVENT_TYPES` as well. This is the one that makes the requirement real; without it, stopping the share is a free pass to cheat.

**Neither is added to `TOGGLEABLE_PROCTORING_SIGNALS`.** They are integral to the feature rather than independent behaviours to tune, the same way `webcam_snapshot` isn't toggleable. The feature as a whole is switched off with `screenCaptureEnabled`.

### 3. Attempt column

```prisma
screenShareStartedAt DateTime? @map("screen_share_started_at")
```

Set the first time a valid share is established. Its only job is to distinguish two states that look identical from the server's side: *never shared yet* (the candidate just landed on the exam page — pause, no strike) versus *shared and then stopped* (a violation — strike). Without it, every candidate would be struck once simply for arriving.

### 4. One endpoint for share state

`POST /attempt/screen-share-state`, body `{ active: boolean, displaySurface?: string }`.

**`active: false`:**
- Pause the attempt if it is currently `in_progress`. A `blocked` attempt is left `blocked` — the existing state machine never downgrades `blocked` back to `paused`, and a blocked candidate has nothing to resume into.
- If `screenShareStartedAt` is non-null, this is a genuine stop: record `screen_share_stopped` through `registerBrowserActivityViolation` so it counts a strike and applies the exam's enforcement policy.
- If `screenShareStartedAt` is null, record nothing. This is the pre-share state, not a violation.

**`active: true`:**
- Set `screenShareStartedAt` if null; record a `screen_share_started` event with the metadata.
- Resume via `resumeFromPause(tx, attempt)` — **without** `resetViolationCounters`. Restoring a share is the candidate meeting a precondition, not a recruiter pardon.

Idempotent in both directions so a retry or a duplicate `onended` cannot double-strike.

**The pause here is a precondition, not enforcement.** It therefore applies even when `enforcement` is `'warn'` — warn mode means "don't punish behaviour", and without a stream there is no evidence to collect at all. The *strike* for stopping still respects warn mode normally.

**Interaction with the recruiter bypass** (see `2026-07-25-recruiter-proctoring-bypass-design.md`): a bypassed attempt is exempt from the screen-share pause entirely. A candidate whose screen sharing keeps dying is exactly the glitch case the bypass exists for, and it would be useless if the share requirement still froze them.

### 5. Welcome-page capability gate

Before the attempt is created, if `screenCaptureEnabled` and `typeof navigator.mediaDevices?.getDisplayMedia !== 'function'`, block starting with a clear explanation ("This exam requires screen sharing, which this browser does not support — please use desktop Chrome, Edge, or Firefox").

This matters: without it a mobile candidate burns their attempt, lands on the exam page, and is stuck at an overlay they can never satisfy. The welcome page already has this shape — a hard multi-monitor gate and a camera-permission prompt, both conditioned on the resolved config.

### 6. Exam-page flow

A new `useScreenCapture(enabled, onEnded)` hook owns the stream and exposes a capture function. It follows the `useRef` mirror pattern already used for `onViolation` and `config` in the monitor hooks: the effect depends only on `[enabled]`, and the callbacks/config are read through refs, because React Query hands a fresh config object identity every few seconds and widening the dependency array would re-subscribe constantly.

`apps/web/app/(candidate)/exam/page.tsx`: when `screenCaptureEnabled` and no active stream, render a blocking `ScreenShareRequiredOverlay` instead of the questions. Its button calls `getDisplayMedia({ video: true })`, then:

- If `track.getSettings().displaySurface` is present and is **not** `'monitor'`, stop the tracks and re-prompt with an explanation. A shared tab or window is not acceptable evidence.
- If `displaySurface` is absent (non-Chromium browsers do not all report it), accept the stream but pass the `userAgent` through so a reviewer knows the guarantee was weaker for this attempt.
- On success, POST `active: true` and reveal the exam.

`track.addEventListener('ended', ...)` fires when the candidate uses the browser's own Stop-sharing control; that POSTs `active: false` and re-renders the overlay. If that strike happens to hit the limit, the existing block overlay takes precedence over the share overlay.

### 7. Capturing on violation

`useProctoringMonitor` accepts the capture function and attaches a frame to strike-worthy reports. `ReportProctoringEventDto` gains an optional `screenshot` data URI; when present **and** the exam has `screenCaptureEnabled`, the server uploads to `screen-captures/${attemptId}-${Date.now()}.jpg` and stores the URL in `metadataJson.screenshot`, mirroring the webcam `{ snapshot: url }` convention.

If `screenCaptureEnabled` is false, a supplied screenshot is **ignored, not rejected** — the same server-authoritative treatment already given to disabled signals, because a stale client bundle should not be able to write evidence for an exam that opted out.

Two limits, both load-bearing, and they sit at different layers on purpose:

- **Rate limit ~1 capture per 5s, client-side in the hook.** `right_click` is not debounced today, so without this a candidate holding down the context menu generates a capture per event. This layer exists to avoid pointless uploads, not as a security control.
- **Hard cap of 60 captures per attempt, enforced server-side.** The rate limit alone still permits ~720 captures in a 60-minute exam (~100MB); 60 bounds an attempt to roughly 10MB. This one must be server-side — a client-side cap is trivially bypassed by a tampered bundle, and storage abuse is exactly what a tampered bundle would target. The server counts existing events for the attempt that already carry a `screenshot`; past the cap, events still record normally but the upload is skipped and the metadata records that the cap was reached, so a reviewer is not misled by the missing image. The client self-limits to the same number to avoid uploading data the server will discard.

Frames are downscaled to at most 1280px wide and encoded JPEG at quality 0.5 (~100–200KB), matching the webcam path's approach.

### 8. Reviewer UI

The proctoring-event log modal in `LiveMonitoringPanel.tsx` (backed by `useProctoringEvents`) renders a thumbnail for any event whose `metadataJson` carries a `screenshot`, click-to-enlarge. The same rendering serves the existing webcam `snapshot` key, so both kinds of evidence appear the same way.

### 9. Consent and data protection

Two things must change, and the second is a real pre-existing gap this feature makes worse:

**Consent copy.** The welcome page's monitoring-consent block must explicitly state that the candidate's **entire screen** is recorded during the exam, not just the exam page. Screen capture exposes everything on their desktop — other tabs, messages, personal accounts. Burying that under a generic "I consent to monitoring" checkbox is not adequate disclosure.

**Blob deletion on erase.** `candidates.service.ts:321` nulls `proctoringEvent.metadataJson` on GDPR erase, which drops the *reference* to the blob but never deletes the blob itself. Webcam snapshots therefore already survive candidate erasure as orphaned files in Azure Blob Storage. Screen captures of a candidate's whole desktop make this materially more serious. The erase path should collect the `snapshot`/`screenshot` URLs before nulling the column and delete the underlying blobs. This closes the pre-existing webcam leak with the same change — flagged here because the honest alternative is knowingly shipping more sensitive orphaned data.

## Accepted Limitations

- If the candidate has two monitors and shares only one, captures miss the other screen. `multi_monitor_detected` still flags the setup, so a reviewer knows to weight the evidence accordingly.
- Mobile browsers cannot participate at all. This is precisely why §1 is a per-exam toggle defaulting to off.
- A determined candidate can still stop sharing and accept the strike. The design makes that costly and visible rather than impossible; nothing available to a web page can make it impossible.

## Out of Scope

- Periodic screen captures on a timer (the webcam path does this). The stated goal is evidence *for a violation*; continuous capture multiplies storage and privacy exposure for no additional diagnostic value here.
- Video recording of the session. Far larger storage and privacy footprint, and not asked for.
- Re-validating `displaySurface` mid-stream. It cannot change without the stream ending, which `onended` already covers.

## Testing

- `proctoring-severity.spec.ts` — `screen_share_stopped` is strike-worthy, `screen_share_started` is not, and neither appears in `TOGGLEABLE_PROCTORING_SIGNALS`.
- `attempt.service.spec.ts` — a screenshot is uploaded and stored when `screenCaptureEnabled`, and silently ignored when it is off; `screen-captures/` prefix is used.
- Share-state endpoint — `active:false` with a null `screenShareStartedAt` pauses without recording a strike; with a non-null one it records `screen_share_stopped` and strikes; `active:true` sets the timestamp, records `screen_share_started`, and resumes **without** resetting counters; repeated calls in either direction are idempotent; a bypassed attempt is exempt from the pause.
- `grading.spec.ts` already covers `pausedDurationMs` extending the deadline; add a case asserting a share-wait pause costs the candidate no exam time.
- `useScreenCapture.test.tsx` — rejects a non-`monitor` `displaySurface` and does not report active; accepts when `displaySurface` is undefined; `onended` triggers the inactive report; the rate limit and the 60-capture cap both hold.
- `exam/page.test.tsx` — the overlay blocks questions when sharing is required and absent; the block overlay wins when the attempt is blocked.
- `ExamDetailsForm.test.tsx` — the new toggle submits, and is disabled along with everything else once the exam is locked.
