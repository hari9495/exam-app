# Screen-Capture Violation Evidence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On exams the recruiter opts in, capture a picture of the candidate's actual screen at the moment each strike-worthy violation fires, so a reviewer can tell real cheating from a machine misfiring.

**Architecture:** The candidate grants a screen-share at the start of the exam; the resulting stream stays open for the attempt and a frame is grabbed on each strike-worthy violation, uploaded to blob storage and referenced from the existing `ProctoringEvent.metadataJson`. A pause/resume gate holds the exam while sharing is absent, and paused time already extends the deadline so the candidate loses nothing.

**Tech Stack:** NestJS (apps/exam-runtime, apps/api), Prisma on SQL Server, Next.js + React (apps/web), Azure Blob Storage, Jest.

## Global Constraints

- **`screenCaptureEnabled` defaults to `false`.** Defaulting true would add a hard new precondition to exams already published and mid-hiring-round.
- **Mobile is out of scope by product decision** — candidates sit exams on a computer. Desktop browser variation is still real: an old or locked-down desktop browser can lack `getDisplayMedia`.
- **The share must be `displaySurface === 'monitor'`.** A shared tab or window is not acceptable evidence. Where the browser does not report `displaySurface`, accept but record the `userAgent` so a reviewer knows the guarantee was weaker.
- **Pausing for a missing share is a precondition, not enforcement** — it applies even when `enforcement` is `'warn'`. The *strike* for stopping sharing respects warn mode normally.
- **A bypassed attempt is exempt from the screen-share pause entirely.** A candidate whose sharing keeps dying is exactly the case the bypass exists for.
- **Hard cap 150 captures per attempt, enforced server-side.** A client-side cap is trivially bypassed and storage abuse is what a tampered bundle would target. Client self-limits to the same number to avoid pointless uploads.
- **Client rate limit ~1 capture per 5s.** `right_click` is not debounced, so without this a candidate holding the context menu generates a capture per event.
- Frames downscaled to ≤1280px wide, JPEG quality 0.5.
- **Screenshots are ignored, not rejected, when the exam has capture off** — same server-authoritative treatment already given to disabled signals.
- SQL Server migrations: one statement per `ALTER TABLE ... ADD`, no `GO`.
- Run each Jest suite **alone** (`--maxWorkers=2`). Concurrent suites on this machine produce contention failures that are not real.
- Baseline to preserve: apps/api 540, apps/exam-runtime 459, apps/web 627.

## File Structure

| File | Responsibility |
|---|---|
| `apps/api/prisma/schema.prisma` + migration | `Exam.screenCaptureEnabled`, `Attempt.screenShareStartedAt` |
| `apps/api/src/exams/dto/create-exam.dto.ts`, `exams.service.ts` | Accept and persist the toggle |
| `apps/exam-runtime/src/attempts/proctoring-config.ts` | `screenCaptureEnabled` on the resolved config |
| `apps/exam-runtime/src/attempts/proctoring-severity.ts` | Two new event types |
| `apps/exam-runtime/src/attempts/attempt.service.ts` | Share-state endpoint; screenshot upload on violation |
| `apps/web/lib/hooks/useScreenCapture.ts` | **New.** Owns the stream, validation, capture, rate limit |
| `apps/web/app/(candidate)/welcome/page.tsx` | Browser-capability gate before the attempt starts |
| `apps/web/app/(candidate)/exam/page.tsx` | Blocking share overlay; wires capture into the monitor |
| `apps/web/components/ExamDetailsForm.tsx` | Recruiter toggle |
| `apps/api/src/candidates/candidates.service.ts` + `packages/shared/.../blob-storage.service.ts` | Delete blobs on GDPR erase |

---

### Task 1: Schema and migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma` — `Exam` (after `disabledProctoringSignalsJson`) and `Attempt` (after `consentAt`)
- Create: `apps/api/prisma/migrations/20260726140000_screen_capture/migration.sql`

**Interfaces:**
- Produces: `Exam.screenCaptureEnabled: boolean`, `Attempt.screenShareStartedAt: Date | null`.

- [ ] **Step 1: Add both columns**

On `model Exam`:

```prisma
  screenCaptureEnabled          Boolean             @default(false) @map("screen_capture_enabled")
```

On `model Attempt`:

```prisma
  screenShareStartedAt          DateTime?           @map("screen_share_started_at")
```

- [ ] **Step 2: Write the migration**

`apps/api/prisma/migrations/20260726140000_screen_capture/migration.sql`:

```sql
ALTER TABLE [dbo].[exams] ADD [screen_capture_enabled] BIT NOT NULL CONSTRAINT [exams_screen_capture_enabled_df] DEFAULT 0;
ALTER TABLE [dbo].[attempts] ADD [screen_share_started_at] DATETIME2;
```

Two independent statements. The `DEFAULT 0` is what makes every existing exam keep working untouched.

- [ ] **Step 3: Apply and regenerate**

```bash
cd "D:/exam app/apps/api" && DB_URL=$(grep "^DATABASE_URL=" .env | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//') && DATABASE_URL="$DB_URL" npx prisma migrate deploy && DATABASE_URL="$DB_URL" npx prisma generate && npx tsc --noEmit
```

Expected: migration applied, client generated, `tsc` silent. Never `source` the `.env` — it contains semicolons.

If `migrate deploy` reports a failed or partial migration, **stop and report BLOCKED** — do not run `migrate resolve`, `db push` or `reset`.

- [ ] **Step 4: Commit**

```bash
git add apps/api/prisma/
git commit -m "feat: add screen-capture columns"
```

---

### Task 2: Recruiter toggle, end to end

**Files:**
- Modify: `apps/api/src/exams/dto/create-exam.dto.ts`, `apps/api/src/exams/exams.service.ts`
- Modify: `apps/exam-runtime/src/attempts/proctoring-config.ts`
- Modify: `apps/web/lib/types.ts`, `apps/web/components/ExamDetailsForm.tsx`
- Test: `apps/api/src/exams/exams.service.spec.ts`, `apps/exam-runtime/src/attempts/proctoring-config.spec.ts`, `apps/web/components/ExamDetailsForm.test.tsx`

**Interfaces:**
- Produces: `ExamProctoringConfig.screenCaptureEnabled: boolean`, reaching the candidate on both the preview and attempt-state payloads (both already carry `proctoring`).

- [ ] **Step 1: DTO and persistence**

Add an optional `@IsBoolean() screenCaptureEnabled?: boolean` to the exam DTO. In `exams.service.ts`, map it in `create()`, `duplicate()` and `update()` exactly as the four existing proctoring fields are mapped. **The whole-exam lock already guards `update()`, so nothing extra is needed there.**

- [ ] **Step 2: Resolver**

Add `screenCaptureEnabled: exam.screenCaptureEnabled` to the object `resolveProctoringConfig` returns, and to both `ProctoringConfigSource` and `ExamProctoringConfig`. A bypass does **not** change it — a bypass narrows what is punished, never what is watched.

- [ ] **Step 3: Web type and form**

Add `screenCaptureEnabled: boolean` to `ExamProctoringConfig` in `apps/web/lib/types.ts` and to the raw `Exam` fields. In `ExamDetailsForm.tsx`, add a checkbox inside the existing "Proctoring & integrity" fieldset:

```tsx
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={screenCaptureEnabled} onChange={(e) => setScreenCaptureEnabled(e.target.checked)} />
          Record the candidate&apos;s screen as evidence
        </label>
        {screenCaptureEnabled ? (
          <p className="pl-6 text-xs text-recruiter-text-secondary">
            Candidates must share their whole screen to start, and cannot use a phone or tablet. Their screen is captured only
            when a rule is broken.
          </p>
        ) : null}
```

Include it in the submitted value, defaulting from `initialExam?.screenCaptureEnabled ?? false`.

- [ ] **Step 4: Tests**

- exams.service.spec: persists on create; persists on update; left to the schema default when omitted.
- proctoring-config.spec: surfaced on the resolved config; a bypassed attempt still reports it unchanged.
- ExamDetailsForm.test: submits `false` by default, `true` when ticked, and the explanatory copy appears only when ticked.

- [ ] **Step 5: Run and commit**

```bash
cd "D:/exam app/apps/api" && npx jest src/exams --maxWorkers=2
cd "D:/exam app/apps/exam-runtime" && npx jest src/attempts/proctoring-config.spec.ts
cd "D:/exam app/apps/web" && npx jest components/ExamDetailsForm.test.tsx
```

```bash
git add apps/api/src/exams apps/exam-runtime/src/attempts/proctoring-config.ts apps/web/lib/types.ts apps/web/components/ExamDetailsForm.tsx
git commit -m "feat: add the per-exam screen-capture toggle"
```

---

### Task 3: Two new event types

**Files:**
- Modify: `apps/exam-runtime/src/attempts/proctoring-severity.ts`
- Test: `apps/exam-runtime/src/attempts/proctoring-severity.spec.ts`

**Interfaces:**
- Produces: `screen_share_started` (informational) and `screen_share_stopped` (strike-worthy).

- [ ] **Step 1: Add them**

Append `'screen_share_started'` and `'screen_share_stopped'` to `CLIENT_REPORTABLE_EVENT_TYPES`. Add to `SEVERITY_BY_EVENT_TYPE`: `screen_share_started: 'low'`, `screen_share_stopped: 'high'`. Add **only** `'screen_share_stopped'` to `STRIKE_WORTHY_EVENT_TYPES`.

Do **not** add either to `TOGGLEABLE_PROCTORING_SIGNALS` in `apps/api/src/exams/dto/create-exam.dto.ts`. They are integral to the feature rather than independently tunable, exactly as `webcam_snapshot` is not toggleable. The feature as a whole is switched off with `screenCaptureEnabled`.

- [ ] **Step 2: Tests**

Assert `screen_share_stopped` is strike-worthy and `screen_share_started` is not; both are client-reportable; their severities; and that `TOGGLEABLE_PROCTORING_SIGNALS` still has exactly its original 8 entries.

- [ ] **Step 3: Run and commit**

```bash
cd "D:/exam app/apps/exam-runtime" && npx jest src/attempts/proctoring-severity.spec.ts
git add apps/exam-runtime/src/attempts/proctoring-severity.ts apps/exam-runtime/src/attempts/proctoring-severity.spec.ts
git commit -m "feat: add screen-share event types"
```

---

### Task 4: Share-state endpoint

**Files:**
- Create: `apps/exam-runtime/src/attempts/dto/screen-share-state.dto.ts`
- Modify: `apps/exam-runtime/src/attempts/attempt.controller.ts`, `apps/exam-runtime/src/attempts/attempt.service.ts`
- Test: `apps/exam-runtime/src/attempts/attempt.service.spec.ts`

**Interfaces:**
- Produces: `POST /attempt/screen-share-state`, body `{ active: boolean; displaySurface?: string; userAgent?: string }`, returning `{ status: string }`.

- [ ] **Step 1: DTO**

```ts
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class ScreenShareStateDto {
  @IsBoolean()
  active!: boolean;

  @IsOptional() @IsString() @MaxLength(50)
  displaySurface?: string;

  @IsOptional() @IsString() @MaxLength(400)
  userAgent?: string;
}
```

- [ ] **Step 2: Service method**

`screenShareState(session, dto)` resolves the attempt and exam like the neighbouring methods, then:

**If the exam has `screenCaptureEnabled` false** — return the current status unchanged, writing nothing. The server is authoritative; a stale client must not be able to pause an exam that never asked for sharing.

**`active: true`:**
- Set `screenShareStartedAt` if currently null.
- Record a `screen_share_started` event with metadata `{ displaySurface, userAgent }`.
- Resume via `resumeFromPause(tx, attempt)` — **without** `resetViolationCounters`. Meeting a precondition is not a recruiter pardon.

**`active: false`:**
- If `screenShareStartedAt` is non-null, this is a genuine stop: record `screen_share_stopped` through `registerBrowserActivityViolation` so it counts a strike and respects the exam's enforcement mode.
- Pause the attempt if it is currently `in_progress`. Leave a `blocked` attempt blocked — the existing state machine never downgrades `blocked` to `paused`.
- **Skip the pause entirely when the attempt has an active proctoring bypass.** Reuse `isProctoringBypassActive`.

Idempotent both ways: a repeated call must not double-strike or double-record.

- [ ] **Step 3: Controller route**

Mirror the neighbouring candidate routes (same guard and session decorator as `reportProctoringEvent`).

- [ ] **Step 4: Tests**

- capture disabled → nothing written, status unchanged.
- `active:false` with null `screenShareStartedAt` → pauses, records **no** strike (arriving is not a violation).
- `active:false` with a non-null one → records `screen_share_stopped` and strikes.
- `active:false` on a `blocked` attempt → stays `blocked`.
- `active:false` on a bypassed attempt → no pause.
- `active:true` → sets the timestamp, records `screen_share_started`, resumes **without** resetting counters.
- repeated calls in each direction are idempotent.

- [ ] **Step 5: Run and commit**

```bash
cd "D:/exam app/apps/exam-runtime" && npx jest src/attempts --maxWorkers=2
git add apps/exam-runtime/src/attempts/
git commit -m "feat: add the screen-share state endpoint"
```

---

### Task 5: Accept and store screenshots on violations

**Files:**
- Modify: `apps/exam-runtime/src/attempts/dto/report-proctoring-event.dto.ts`, `attempt.service.ts`
- Test: `apps/exam-runtime/src/attempts/attempt.service.spec.ts`

**Interfaces:**
- Produces: `ReportProctoringEventDto.screenshot?: string` (a base64 data URI). Stored as `metadataJson.screenshot`.

- [ ] **Step 1: DTO field**

Add `@IsOptional() @IsString() screenshot?: string`.

- [ ] **Step 2: Upload path**

In `reportProctoringEvent`, when `dto.screenshot` is present **and** the exam has `screenCaptureEnabled`:
- Count existing events for this attempt whose `metadataJson` contains a screenshot. **At or above 150, skip the upload** and record `{ screenshotCapReached: true }` in the metadata so a reviewer is not misled by the missing image.
- Otherwise upload to `screen-captures/${attempt.id}-${Date.now()}.jpg` via `blobStorage.uploadDataUri` and merge `{ screenshot: url }` into the event metadata.

When `screenCaptureEnabled` is false, **ignore** a supplied screenshot silently — do not reject. This mirrors the disabled-signal guard's ignore-don't-reject shape.

An upload failure must not lose the violation: catch, log, and still record the event without an image.

- [ ] **Step 3: Tests**

Uploaded and referenced when enabled; ignored when disabled; the `screen-captures/` prefix; past the cap the event still records with `screenshotCapReached` and no upload; an upload throw still records the event.

- [ ] **Step 4: Run and commit**

```bash
cd "D:/exam app/apps/exam-runtime" && npx jest src/attempts --maxWorkers=2
git add apps/exam-runtime/src/attempts/
git commit -m "feat: store screen captures against proctoring events"
```

---

### Task 6: The capture hook

**Files:**
- Create: `apps/web/lib/hooks/useScreenCapture.ts`, `apps/web/lib/hooks/useScreenCapture.test.tsx`

**Interfaces:**
- Produces:

```ts
useScreenCapture(enabled: boolean, onEnded: () => void): {
  active: boolean;
  error: 'wrong-surface' | 'denied' | 'unsupported' | null;
  requestShare: () => Promise<{ displaySurface?: string; userAgent: string } | null>;
  capture: () => string | null;
}
```

- [ ] **Step 1: Implement**

Requirements the implementation must meet:

- `requestShare()` calls `navigator.mediaDevices.getDisplayMedia({ video: true })`. **It must only ever be called from a user gesture** — never on mount.
- Read `track.getSettings().displaySurface`. If present and not `'monitor'`, stop the tracks, set `error: 'wrong-surface'` and return null. If absent, accept and return the `userAgent` so the server can record the weaker guarantee.
- Attach `track.addEventListener('ended', ...)` → clear state and call `onEnded`. This is how a candidate pressing the browser's Stop-sharing control is detected.
- `capture()` draws the video frame to a canvas, downscaled to at most 1280px wide, and returns `toDataURL('image/jpeg', 0.5)`. Returns null when there is no active stream, when fewer than 5000ms have passed since the last capture, or once 150 captures have been taken.
- Guard `typeof navigator !== 'undefined' && navigator.mediaDevices?.getDisplayMedia` — this is Next.js and the module can evaluate server-side. Report `'unsupported'` rather than throwing.
- Stop all tracks on unmount.

Follow the `useRef` mirror pattern already used in `useWebcamMonitor` / `useProctoringMonitor` for anything read inside a stable effect.

- [ ] **Step 2: Tests**

Stub `navigator.mediaDevices.getDisplayMedia`. Cover: a `'monitor'` surface is accepted; `'browser'`/`'window'` is rejected and the tracks stopped; an absent `displaySurface` is accepted and returns the userAgent; a denied prompt yields `'denied'`; missing API yields `'unsupported'` without throwing; `capture()` returns null with no stream; the 5s rate limit; the 150 cap; `onEnded` fires on the track's `ended` event.

- [ ] **Step 3: Run and commit**

```bash
cd "D:/exam app/apps/web" && npx jest lib/hooks/useScreenCapture.test.tsx
git add apps/web/lib/hooks/useScreenCapture.ts apps/web/lib/hooks/useScreenCapture.test.tsx
git commit -m "feat: add the screen-capture hook"
```

---

### Task 7: Welcome-page capability gate

**Files:**
- Modify: `apps/web/app/(candidate)/welcome/page.tsx`
- Test: `apps/web/app/(candidate)/welcome/page.test.tsx`

**Interfaces:**
- Consumes: `preview.exam.proctoring.screenCaptureEnabled`.

- [ ] **Step 1: Gate before the attempt starts**

The page already reads `const proctoring = current.exam.proctoring;` and already hard-gates on multi-monitor inside `handleStart`. Add the same shape: when `proctoring?.screenCaptureEnabled` and `typeof navigator.mediaDevices?.getDisplayMedia !== 'function'`, block starting with:

> "This exam records your screen, which this browser does not support. Please use desktop Chrome, Edge or Firefox on a computer."

Also add a line to the monitoring-consent list, beside the existing webcam entry, when capture is on: **"Screenshots of your entire screen when a rule is broken"**. The candidate must be told before consenting — the whole desktop is captured, not just the exam.

**This gate must come before `startAttempt`**, so an unsupported browser never burns the attempt and leaves the candidate stuck at an overlay they cannot satisfy.

- [ ] **Step 2: Tests**

Blocked with the message when capture is on and the API is missing; starts normally when the API exists; starts normally when capture is off regardless; the consent line appears only when capture is on.

- [ ] **Step 3: Run and commit**

```bash
cd "D:/exam app/apps/web" && npx jest "app/(candidate)/welcome"
git add "apps/web/app/(candidate)/welcome/"
git commit -m "feat: gate exam start on screen-share support"
```

---

### Task 8: Exam-page share overlay and capture wiring

**Files:**
- Modify: `apps/web/app/(candidate)/exam/page.tsx`
- Create: `apps/web/app/(candidate)/components/ScreenShareRequiredOverlay.tsx`
- Modify: `apps/web/lib/hooks/useProctoringMonitor.ts`, `apps/web/lib/hooks/useAttempt.ts`
- Test: `apps/web/app/(candidate)/exam/page.test.tsx`

**Interfaces:**
- Consumes: `useScreenCapture` (Task 6), the share-state endpoint (Task 4).

- [ ] **Step 1: Overlay component**

A blocking panel matching the existing `ProctoringWarningOverlay` styling: explains that this exam records the screen, that they must share their **entire screen**, that their exam is paused and no time is being lost, and a "Share my screen" button. When `error === 'wrong-surface'`, add: "Please choose your entire screen, not a single tab or window."

- [ ] **Step 2: Wire the exam page**

- Call `useScreenCapture(proctoringConfig?.screenCaptureEnabled === true, onEnded)`.
- When capture is enabled and not active: POST `screen-share-state { active: false }` once, and render the overlay **instead of** the questions. The block overlay takes precedence if the attempt is `blocked`.
- The button calls `requestShare()`; on success POST `{ active: true, displaySurface, userAgent }` and reveal the exam.
- `onEnded` POSTs `{ active: false }` and re-renders the overlay.
- Pass `capture` into `useProctoringMonitor` so strike-worthy reports attach a frame. Follow the existing ref-mirror pattern — the monitor's effect depends only on `[enabled]` and must not re-subscribe when the function identity changes.
- `useAttempt.ts` gains the `screenShareState` mutation and `useReportProctoringEvent` gains the optional screenshot argument.

- [ ] **Step 3: Tests**

Overlay blocks questions when capture is on and sharing absent; questions render when active; the block overlay wins when blocked; no overlay at all when capture is off; a wrong-surface rejection keeps the overlay up with the extra hint.

- [ ] **Step 4: Run and commit**

```bash
cd "D:/exam app/apps/web" && npx jest "app/(candidate)" --maxWorkers=2
git add "apps/web/app/(candidate)/" apps/web/lib/hooks/
git commit -m "feat: require and capture the candidate screen during the exam"
```

---

### Task 9: Delete evidence blobs on GDPR erase

This closes a pre-existing leak: `candidates.service.ts` nulls `proctoringEvent.metadataJson` on erase, which drops the *reference* but never deletes the blob — so webcam snapshots already survive candidate erasure as orphaned files. Screen captures of a whole desktop make that materially worse.

**Files:**
- Modify: `packages/shared/src/storage/blob-storage.service.ts`
- Modify: `apps/api/src/candidates/candidates.service.ts`
- Test: `packages/shared` storage spec (if present) and `apps/api/src/candidates/candidates.service.spec.ts`

- [ ] **Step 1: Add a delete method**

`BlobStorageService` has no delete today. Add:

```ts
  async deleteByUrl(blobUrl: string): Promise<void> {
    const container = this.getContainer();
    const prefix = `${container.url}/`;
    if (!blobUrl.startsWith(prefix)) {
      return; // not ours -- never try to delete an arbitrary URL
    }
    await container.getBlockBlobClient(decodeURIComponent(blobUrl.slice(prefix.length))).deleteIfExists();
  }
```

The prefix check is the safety property: the URL comes from a database column, so it must never be treated as an instruction to delete something outside our own container.

- [ ] **Step 2: Collect before nulling**

In `erase()`, **before** the `proctoringEvent.updateMany` that nulls `metadataJson`, read the affected events and collect every `snapshot` and `screenshot` URL (parsing each `metadataJson` in a try/catch — a corrupt row must not abort an erase).

Delete those blobs **outside the Prisma transaction**, after it commits. A failed remote delete must not roll back the erase — the database redaction is the legally binding part. Log failures and still report success.

- [ ] **Step 3: Tests**

URLs are collected before the column is nulled; deletion happens after the transaction; a delete that throws still leaves the erase successful; a malformed `metadataJson` does not abort; a URL outside the container is not deleted.

- [ ] **Step 4: Run and commit**

```bash
cd "D:/exam app/apps/api" && npx jest src/candidates --maxWorkers=2
git add packages/shared/src/storage/ apps/api/src/candidates/
git commit -m "fix: delete proctoring evidence blobs when a candidate is erased"
```

---

### Task 10: Verification and deployment

**GATED: do not deploy without explicit user approval.**

- [ ] **Step 1: All suites and typechecks, each alone**

```bash
cd "D:/exam app/apps/exam-runtime" && npx jest --maxWorkers=2 && npx tsc --noEmit
cd "D:/exam app/apps/api" && npx jest --maxWorkers=2 && npx tsc --noEmit
cd "D:/exam app/apps/web" && npx jest --maxWorkers=2
```

- [ ] **Step 2: Browser verification**

Via the preview tooling. Turn the toggle on for a test exam, start it as a candidate, confirm: the consent list mentions screen recording; sharing a single tab is rejected with the hint; sharing the whole screen reveals the exam; pressing the browser's Stop-sharing control pauses the exam and records a strike; a violation while sharing produces a screenshot visible as a thumbnail in the recruiter's View log; and paused time did not shorten the exam.

The log modal already renders `metadataJson.screenshot` thumbnails, so no reviewer-UI work is needed — **confirm this rather than assuming it.**

- [ ] **Step 3: Production live-attempt check, then ask for approval**

Report the counts and wait for an explicit yes.

- [ ] **Step 4: Deploy**

Migration + all three apps. Follow the established recipe: one `scp` per file with its full destination path, md5-verify every file, `migrate status` before `migrate deploy`, `prisma generate`, background builds with done-markers, the Next standalone `.next/static` + `public` copy, then `pm2 restart api exam-runtime web`.

- [ ] **Step 5: Record in Azure DevOps** under Epic 6084, closed once Step 4 verifies.

## Out of Scope

- Periodic screen captures on a timer — the goal is evidence *for a violation*.
- Video recording of the session.
- Re-validating `displaySurface` mid-stream; it cannot change without the stream ending, which `onEnded` covers.
