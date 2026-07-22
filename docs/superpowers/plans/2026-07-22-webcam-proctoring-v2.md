# Webcam Proctoring v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve on-device webcam proctoring accuracy with multiple-face detection, downward-pitch detection, a majority-vote sliding window replacing the resettable continuous-3s logic, periodic evidence snapshots, and a panel-side "Webcam timeline" viewer that finally surfaces stored snapshots.

**Architecture:** Detection stays entirely client-side (MediaPipe FaceLandmarker in `useWebcamMonitor`). A new pure voting module debounces raw per-frame detections. `multiple_faces` joins the existing 3-strike webcam-violation pipeline with a corrective overlay; `looking_down` becomes a report-only medium proctoring event (never a strike, so typing candidates aren't paused). Periodic snapshots upload through a dedicated throttled endpoint and store as low-severity `webcam_snapshot` events, rendered chronologically alongside violation snapshots on the panel candidate-detail page.

**Tech Stack:** React 18 + Jest/RTL (apps/web), `@mediapipe/tasks-vision` FaceLandmarker, NestJS + class-validator (apps/exam-runtime), apps/api reports service, Playwright. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-22-webcam-proctoring-v2-design.md`

## Global Constraints

- New/changed detection reasons, verbatim: `multiple_faces` (webcam violation → strike), `looking_down` (proctoring event → report-only, severity `medium`), `webcam_snapshot` (periodic evidence proctoring event → severity `low`, dedicated endpoint only).
- Voting window (violations): last **8** samples, confirm at **≥5 of 8** the same reason; after a confirmed report, do not confirm again until a fully clean window (0 of 8) is observed.
- Voting window (looking_down): last **24** samples, confirm at **≥20 of 24**.
- Pitch threshold: more than **45° downward** counts toward `looking_down`. Yaw threshold unchanged at **30°** (`HEAD_TURN_THRESHOLD_DEGREES`).
- Sampling rate unchanged: **500ms** (`SAMPLE_INTERVAL_MS`). `numFaces: 2`.
- Periodic snapshot interval: **random 120000–180000ms**, re-jittered after each capture.
- `webcam_snapshot` is accepted ONLY via `POST /attempt/webcam-snapshot` — never added to `CLIENT_REPORTABLE_EVENT_TYPES`. It is NOT broadcast via `emitProctoringFlag`.
- Multiple-faces is a strike (corrective overlay). Looking-down never strikes, never shows an overlay.
- Existing behaviors preserved: 3-strike block/unblock flow, camera-failure fail-safe (reports `no_face`), the `__DISABLE_WEBCAM_MONITOR__` e2e escape hatch (production-dead-code-eliminated), 30° yaw.
- No new npm dependencies. No schema/migration changes (snapshots reuse the existing `ProctoringEvent.metadataJson`).

---

### Task 1: Voting module (pure, web)

**Files:**
- Create: `apps/web/lib/webcam-voting.ts`
- Create: `apps/web/lib/webcam-voting.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `createViolationVoter(opts: { windowSize: number; threshold: number }): { push(reason: string | null): string | null }`. Each `push` records one per-sample detection (`null` = clean). Returns a confirmed reason string the first sample it reaches `threshold` occurrences of the same non-null reason within the trailing `windowSize` samples; returns `null` otherwise. After a confirmation, further pushes return `null` until a window with zero of any violation reason has been observed (re-arm), so one continuous episode confirms once.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/lib/webcam-voting.test.ts`:

```typescript
import { createViolationVoter } from './webcam-voting';

describe('createViolationVoter', () => {
  function pushAll(voter: ReturnType<typeof createViolationVoter>, seq: (string | null)[]) {
    return seq.map((r) => voter.push(r));
  }

  it('confirms when threshold of the same reason is reached in the window', () => {
    const v = createViolationVoter({ windowSize: 8, threshold: 5 });
    // 4 no_face then a 5th -> confirm on the 5th
    const out = pushAll(v, ['no_face', 'no_face', 'no_face', 'no_face', 'no_face']);
    expect(out).toEqual([null, null, null, null, 'no_face']);
  });

  it('does not confirm at 4 of 8', () => {
    const v = createViolationVoter({ windowSize: 8, threshold: 5 });
    const out = pushAll(v, ['no_face', null, 'no_face', null, 'no_face', null, 'no_face', null]);
    expect(out.every((r) => r === null)).toBe(true);
  });

  it('a single clean frame does not reset accumulated votes', () => {
    const v = createViolationVoter({ windowSize: 8, threshold: 5 });
    // 4 no_face, one clean, then two more no_face -> 6 of last 7 (window not yet full to 8) = confirm
    const out = pushAll(v, ['no_face', 'no_face', 'no_face', 'no_face', null, 'no_face', 'no_face']);
    expect(out[out.length - 1]).toBe('no_face');
  });

  it('does not re-confirm during one continuous episode until a clean window re-arms', () => {
    const v = createViolationVoter({ windowSize: 8, threshold: 5 });
    const first = pushAll(v, ['no_face', 'no_face', 'no_face', 'no_face', 'no_face']); // confirm at index 4
    expect(first[4]).toBe('no_face');
    const during = pushAll(v, ['no_face', 'no_face', 'no_face', 'no_face', 'no_face', 'no_face', 'no_face', 'no_face']);
    expect(during.every((r) => r === null)).toBe(true); // still the same episode, no re-confirm
    const clean = pushAll(v, ['no_face', null, null, null, null, null, null, null]); // one lingering then a fully clean window
    // after 8 pushes the window holds only nulls -> re-armed; still returns null here (no violation present)
    expect(clean.every((r) => r === null)).toBe(true);
    const again = pushAll(v, ['no_face', 'no_face', 'no_face', 'no_face', 'no_face']); // fresh episode confirms
    expect(again[4]).toBe('no_face');
  });

  it('two interleaved reasons at 4/4 never confirm either', () => {
    const v = createViolationVoter({ windowSize: 8, threshold: 5 });
    const out = pushAll(v, ['no_face', 'head_turned', 'no_face', 'head_turned', 'no_face', 'head_turned', 'no_face', 'head_turned']);
    expect(out.every((r) => r === null)).toBe(true);
  });

  it('supports a larger window for looking_down (20 of 24)', () => {
    const v = createViolationVoter({ windowSize: 24, threshold: 20 });
    const seq = Array.from({ length: 19 }, () => 'looking_down');
    expect(pushAll(v, seq).every((r) => r === null)).toBe(true);
    expect(v.push('looking_down')).toBe('looking_down'); // 20th
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd "D:\exam app\apps\web" && npx jest lib/webcam-voting.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `apps/web/lib/webcam-voting.ts`:

```typescript
export interface ViolationVoterOptions {
  windowSize: number;
  threshold: number;
}

export interface ViolationVoter {
  push(reason: string | null): string | null;
}

// Debounces raw per-sample detections into confirmed violations by majority vote
// over a trailing window. A confirmed episode reports once: after confirming, further
// pushes return null until a fully clean window re-arms the voter.
export function createViolationVoter({ windowSize, threshold }: ViolationVoterOptions): ViolationVoter {
  const buffer: (string | null)[] = [];
  let armed = true;

  return {
    push(reason: string | null): string | null {
      buffer.push(reason);
      if (buffer.length > windowSize) buffer.shift();

      // Count occurrences of each non-null reason in the current window.
      const counts = new Map<string, number>();
      for (const r of buffer) {
        if (r !== null) counts.set(r, (counts.get(r) ?? 0) + 1);
      }

      // Re-arm once the window carries no violation at all.
      if (counts.size === 0) {
        armed = true;
        return null;
      }
      if (!armed) return null;

      for (const [r, count] of counts) {
        if (count >= threshold) {
          armed = false;
          return r;
        }
      }
      return null;
    },
  };
}
```

- [ ] **Step 4: Run to verify pass**

```bash
cd "D:\exam app\apps\web" && npx jest lib/webcam-voting.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/webcam-voting.ts apps/web/lib/webcam-voting.test.ts
git commit -m "feat: majority-vote violation voter for webcam proctoring"
```

---

### Task 2: Detection — multiple faces + pitch

**Files:**
- Modify: `apps/web/lib/webcam-detection.ts`
- Test: `apps/web/lib/webcam-detection.test.ts` (create if absent — grep first; if present, extend)

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `detectViolationReason(result)` now returns `'no_face' | 'head_turned' | 'multiple_faces' | null` (adds `multiple_faces` when `faceLandmarks.length > 1`, checked before the yaw branch).
  - New `detectLookingDown(result): boolean` — true when a single face's downward pitch exceeds `PITCH_DOWN_THRESHOLD_DEGREES` (45). Exported `PITCH_DOWN_THRESHOLD_DEGREES = 45`.
  - Existing `HEAD_TURN_THRESHOLD_DEGREES = 30` unchanged.

- [ ] **Step 1: Write the failing tests**

Create/extend `apps/web/lib/webcam-detection.test.ts`. Build 4×4 row-major transformation matrices for known yaw/pitch. Helper (place at top of the describe):

```typescript
import { detectViolationReason, detectLookingDown } from './webcam-detection';

// Row-major 4x4. Yaw about vertical axis: matrix[8] = -sin(yaw), matrix[10] = cos(yaw).
// Pitch about horizontal axis: matrix[6] = sin(pitch), matrix[10] = cos(pitch) approx;
// use the same convention the implementation reads (matrix[9] for pitch component below).
function matrixFor({ yawDeg = 0, pitchDeg = 0 }: { yawDeg?: number; pitchDeg?: number }) {
  const yaw = (yawDeg * Math.PI) / 180;
  const pitch = (pitchDeg * Math.PI) / 180;
  const m = new Array(16).fill(0);
  m[0] = 1; m[5] = 1; m[10] = 1; m[15] = 1;
  m[8] = -Math.sin(yaw); m[10] = Math.cos(yaw);
  m[9] = -Math.sin(pitch); // pitch component read by detectLookingDown
  return { data: m };
}
function result({ faces = 1, yawDeg = 0, pitchDeg = 0 } = {}) {
  return {
    faceLandmarks: Array.from({ length: faces }, () => ({})),
    facialTransformationMatrixes: faces > 0 ? [matrixFor({ yawDeg, pitchDeg })] : [],
  };
}

describe('detectViolationReason', () => {
  it('returns no_face when no landmarks', () => {
    expect(detectViolationReason(result({ faces: 0 }))).toBe('no_face');
  });
  it('returns multiple_faces when more than one face', () => {
    expect(detectViolationReason(result({ faces: 2 }))).toBe('multiple_faces');
  });
  it('returns head_turned above the yaw threshold', () => {
    expect(detectViolationReason(result({ yawDeg: 40 }))).toBe('head_turned');
  });
  it('returns null when centered', () => {
    expect(detectViolationReason(result({ yawDeg: 5 }))).toBeNull();
  });
});

describe('detectLookingDown', () => {
  it('true when pitched down beyond 45 degrees', () => {
    expect(detectLookingDown(result({ pitchDeg: 55 }))).toBe(true);
  });
  it('false at a keyboard-glance angle (~25 degrees)', () => {
    expect(detectLookingDown(result({ pitchDeg: 25 }))).toBe(false);
  });
  it('false when no face', () => {
    expect(detectLookingDown(result({ faces: 0 }))).toBe(false);
  });
  it('false when multiple faces (looking-down is a single-face signal)', () => {
    expect(detectLookingDown(result({ faces: 2 }))).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
cd "D:\exam app\apps\web" && npx jest lib/webcam-detection.test.ts
```
Expected: FAIL (`detectLookingDown` undefined; `multiple_faces` not returned).

- [ ] **Step 3: Implement**

Replace `apps/web/lib/webcam-detection.ts`:

```typescript
export const HEAD_TURN_THRESHOLD_DEGREES = 30;
export const PITCH_DOWN_THRESHOLD_DEGREES = 45;

export type ViolationReason = 'no_face' | 'head_turned' | 'multiple_faces';

interface FaceLandmarkerResult {
  faceLandmarks: unknown[];
  facialTransformationMatrixes?: { data: Float32Array | number[] }[];
}

export function detectViolationReason(result: FaceLandmarkerResult): ViolationReason | null {
  if (result.faceLandmarks.length === 0) {
    return 'no_face';
  }
  if (result.faceLandmarks.length > 1) {
    return 'multiple_faces';
  }
  const matrix = result.facialTransformationMatrixes?.[0]?.data;
  if (!matrix) {
    return null;
  }
  // Yaw (rotation around the vertical axis): matrix[8] = -sin(yaw), matrix[10] = cos(yaw).
  const yawRadians = Math.atan2(-matrix[8], matrix[10]);
  const yawDegrees = Math.abs((yawRadians * 180) / Math.PI);
  return yawDegrees > HEAD_TURN_THRESHOLD_DEGREES ? 'head_turned' : null;
}

// Report-only signal: candidate's head pitched downward past the threshold (e.g. looking
// at a phone in the lap). Single-face only -- multi-face and no-face are handled as
// violations above, and pitch is meaningless without exactly one head.
export function detectLookingDown(result: FaceLandmarkerResult): boolean {
  if (result.faceLandmarks.length !== 1) {
    return false;
  }
  const matrix = result.facialTransformationMatrixes?.[0]?.data;
  if (!matrix) {
    return false;
  }
  // Pitch (rotation around the horizontal axis): matrix[9] = -sin(pitch).
  const pitchRadians = Math.asin(Math.max(-1, Math.min(1, -matrix[9])));
  const pitchDegrees = (pitchRadians * 180) / Math.PI;
  // Positive = looking down in this convention.
  return pitchDegrees > PITCH_DOWN_THRESHOLD_DEGREES;
}
```

- [ ] **Step 4: Run to verify pass**

```bash
cd "D:\exam app\apps\web" && npx jest lib/webcam-detection.test.ts && npx tsc --noEmit -p tsconfig.json
```
Expected: PASS; no new tsc errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/webcam-detection.ts apps/web/lib/webcam-detection.test.ts
git commit -m "feat: multiple-face and downward-pitch webcam detection"
```

---

### Task 3: Backend — multiple_faces violation, looking_down event, webcam-snapshot endpoint

**Files:**
- Modify: `apps/exam-runtime/src/attempts/dto/webcam-violation.dto.ts`
- Modify: `apps/exam-runtime/src/grading/attempt-settlement.service.ts` (`registerWebcamViolation`, ~line 234-259)
- Modify: `apps/exam-runtime/src/attempts/proctoring-severity.ts`
- Create: `apps/exam-runtime/src/attempts/dto/webcam-snapshot.dto.ts`
- Modify: `apps/exam-runtime/src/attempts/attempt.controller.ts`
- Modify: `apps/exam-runtime/src/attempts/attempt.service.ts` (add `webcamSnapshot` method near `webcamViolation`, ~line 454)
- Test: `apps/exam-runtime/src/attempts/proctoring-severity.spec.ts`, `apps/exam-runtime/src/grading/attempt-settlement.service.spec.ts`, `apps/exam-runtime/src/attempts/attempt.service.spec.ts` (extend the ones that exist; grep first)

**Interfaces:**
- Consumes: frontend reports `multiple_faces` via the existing `POST /attempt/webcam-violation` (Task 5), `looking_down` via `POST /attempt/proctoring-event` (Task 5), periodic snapshots via the new `POST /attempt/webcam-snapshot` (Task 5).
- Produces:
  - `WEBCAM_VIOLATION_REASONS` includes `multiple_faces`; `registerWebcamViolation` maps it to eventType `webcam_multiple_faces`.
  - `CLIENT_REPORTABLE_EVENT_TYPES` includes `looking_down`; `SEVERITY_BY_EVENT_TYPE.looking_down = 'medium'`; `SEVERITY_BY_EVENT_TYPE.webcam_snapshot = 'low'`.
  - `WebcamSnapshotDto { snapshot: string }`; `AttemptService.webcamSnapshot(session, dto)` stores a `webcam_snapshot` ProctoringEvent (severity low, `{ snapshot }`), no gateway emit; `POST /attempt/webcam-snapshot` (CandidateJwt, `MODERATE_ATTEMPT_THROTTLE`).

- [ ] **Step 1: Write failing severity + DTO tests**

In `proctoring-severity.spec.ts` add (match the file's style):

```typescript
  it('accepts looking_down as client-reportable with medium severity', () => {
    expect(CLIENT_REPORTABLE_EVENT_TYPES).toContain('looking_down');
    expect(getProctoringEventSeverity('looking_down')).toBe('medium');
  });

  it('maps webcam_snapshot to low severity (server-stored, not client-reportable)', () => {
    expect(CLIENT_REPORTABLE_EVENT_TYPES).not.toContain('webcam_snapshot');
    expect(getProctoringEventSeverity('webcam_snapshot')).toBe('low');
  });
```

- [ ] **Step 2: Run to verify failure**

```bash
cd "D:\exam app\apps\exam-runtime" && npx jest src/attempts/proctoring-severity.spec.ts
```
Expected: FAIL.

- [ ] **Step 3: Implement severity + violation reason**

`proctoring-severity.ts` — add to `CLIENT_REPORTABLE_EVENT_TYPES`: `'looking_down'`. Add to `SEVERITY_BY_EVENT_TYPE`:

```typescript
  looking_down: 'medium',
  webcam_snapshot: 'low',
```

`dto/webcam-violation.dto.ts`:

```typescript
export const WEBCAM_VIOLATION_REASONS = ['no_face', 'head_turned', 'multiple_faces'] as const;
```

`attempt-settlement.service.ts` `registerWebcamViolation`, replace the eventType line (241):

```typescript
    const eventType =
      reason === 'no_face' ? 'webcam_no_face'
      : reason === 'multiple_faces' ? 'webcam_multiple_faces'
      : 'webcam_head_turned';
```

- [ ] **Step 4: Write the failing snapshot-endpoint test**

In `attempt.service.spec.ts` (mirror the existing `webcamViolation` test's mock scaffolding — read it first):

```typescript
  describe('webcamSnapshot', () => {
    it('stores a low-severity webcam_snapshot event and does not emit a live flag', async () => {
      // resolveContext + tenantPrisma mocks as in webcamViolation tests; a tx with
      // proctoringEvent.create mocked. Call service.webcamSnapshot(session, { snapshot: 'data:...' }).
      // Assert proctoringEvent.create called with eventType 'webcam_snapshot', severity 'low',
      // metadataJson containing the snapshot; assert monitoringGateway.emitProctoringFlag NOT called.
    });
  });
```

- [ ] **Step 5: Implement the endpoint**

Create `dto/webcam-snapshot.dto.ts`:

```typescript
import { IsString } from 'class-validator';

export class WebcamSnapshotDto {
  @IsString()
  snapshot!: string;
}
```

`attempt.service.ts` — add near `webcamViolation` (import `WebcamSnapshotDto`):

```typescript
  async webcamSnapshot(session: CandidateSession, dto: WebcamSnapshotDto): Promise<{ ok: true }> {
    const { organizationId, invitation } = await this.resolveContext(session.invitationId);
    await this.tenantPrisma.forTenant({ organizationId, isSuperAdmin: false }, async (tx) => {
      const attempt = await tx.attempt.findUnique({ where: { invitationId: invitation.id } });
      if (!attempt) return;
      await tx.proctoringEvent.create({
        data: { attemptId: attempt.id, eventType: 'webcam_snapshot', severity: 'low', metadataJson: JSON.stringify({ snapshot: dto.snapshot }) },
      });
    });
    return { ok: true };
  }
```

(Deliberately no `emitProctoringFlag` — periodic snapshots must not spam the live alerts feed.)

`attempt.controller.ts` — add (import `WebcamSnapshotDto`), next to the `webcam-violation` route:

```typescript
  @Post('webcam-snapshot')
  @Throttle(MODERATE_ATTEMPT_THROTTLE)
  webcamSnapshot(@CurrentCandidate() candidate: CandidateSession, @Body() dto: WebcamSnapshotDto) {
    return this.attemptService.webcamSnapshot(candidate, dto);
  }
```

- [ ] **Step 6: Run all backend tests + typecheck**

```bash
cd "D:\exam app\apps\exam-runtime" && npx jest && npx tsc --noEmit -p tsconfig.json
```
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add apps/exam-runtime/src/attempts/ apps/exam-runtime/src/grading/attempt-settlement.service.ts
git commit -m "feat: backend support for multiple_faces, looking_down, and periodic webcam snapshots"
```

---

### Task 4: Candidate monitor — voting window, looking_down, periodic snapshots, violation reason surfacing

**Files:**
- Modify: `apps/web/lib/hooks/useWebcamMonitor.ts`
- Modify: `apps/web/lib/hooks/useAttempt.ts` (add `useReportWebcamSnapshot`; extend `useReportWebcamViolation` reason type; add `looking_down` to the proctoring-event reporter's accepted type via `ProctoringEventType` — already extended in types if Task done; here just call it)
- Modify: `apps/web/lib/types.ts` (`ProctoringEventType` add `'looking_down'`; `WebcamViolationReason` add `'multiple_faces'` if such a type exists — grep)
- Test: `apps/web/lib/hooks/useWebcamMonitor.test.tsx`

**Interfaces:**
- Consumes: `createViolationVoter` (Task 1); `detectViolationReason`, `detectLookingDown` (Task 2); backend endpoints (Task 3).
- Produces: `useWebcamMonitor(enabled: boolean, onViolationReason?: (reason: string) => void)` — the optional callback fires with the confirmed violation reason each time a strike is reported, letting the exam page (Task 5) show a reason-specific overlay. Behavior: violations use an 8/5 voter feeding `useReportWebcamViolation`; `looking_down` uses a 24/20 voter feeding the proctoring-event reporter; a jittered 120–180s timer captures periodic snapshots to `useReportWebcamSnapshot`.

- [ ] **Step 1: Add hooks + types**

`apps/web/lib/types.ts`: add `| 'looking_down'` to `ProctoringEventType`; if a `WebcamViolationReason` union exists there, add `'multiple_faces'` (grep — if the reason is only typed inside the hook, extend it there instead).

`apps/web/lib/hooks/useAttempt.ts`: add, mirroring `useReportWebcamViolation`:

```typescript
export function useReportWebcamSnapshot() {
  const { accessToken } = useCandidateAuth();
  return function report(snapshot: string) {
    candidateApiFetch(
      '/attempt/webcam-snapshot',
      { method: 'POST', body: JSON.stringify({ snapshot }) },
      accessToken ?? undefined,
    ).catch(() => undefined);
  };
}
```

- [ ] **Step 2: Write the failing monitor tests**

Extend `apps/web/lib/hooks/useWebcamMonitor.test.tsx`. The existing test mocks `@mediapipe/tasks-vision` and `navigator.mediaDevices`; reuse that harness (read it fully first). Add cases driving `detectForVideo` to return scripted results across ticks:

```tsx
  it('reports a webcam violation only after the voting window confirms (5 of 8), not on a single frame', async () => {
    // Script the mocked landmarker: 4 no-face frames -> no report; 5th no-face -> one report.
    // Advance timers by SAMPLE_INTERVAL_MS between frames; assert reportViolation.mutate called once.
  });

  it('reports looking_down as a proctoring event, never as a webcam violation', async () => {
    // Script 20 looking-down frames; assert the proctoring-event reporter got 'looking_down'
    // and reportViolation.mutate was NOT called.
  });

  it('captures a periodic snapshot within the jittered interval and reschedules', async () => {
    // Advance timers past 180s; assert reportWebcamSnapshot called >= 1 with a data URL.
  });

  it('invokes onViolationReason with the confirmed reason when a strike is reported', async () => {
    // Script a confirmed multiple_faces; assert the callback got 'multiple_faces'.
  });
```

(Match the existing file's mocking approach exactly — if it stubs modules via `jest.mock`, extend those stubs; the goal is scripted `detectForVideo` return values, not real MediaPipe.)

- [ ] **Step 3: Run to verify failure**

```bash
cd "D:\exam app\apps\web" && npx jest lib/hooks/useWebcamMonitor.test.tsx
```
Expected: FAIL.

- [ ] **Step 4: Implement the monitor rewrite**

Rewrite the sampling core of `apps/web/lib/hooks/useWebcamMonitor.ts`:
- Signature: `useWebcamMonitor(enabled: boolean, onViolationReason?: (reason: string) => void)`; keep the callback in a ref like `reportRef`.
- Constants: keep `SAMPLE_INTERVAL_MS = 500`; add `PERIODIC_SNAPSHOT_MIN_MS = 120_000`, `PERIODIC_SNAPSHOT_MAX_MS = 180_000`.
- `numFaces: 2` in the FaceLandmarker options.
- Two voters: `const violationVoter = createViolationVoter({ windowSize: 8, threshold: 5 })` and `const lookingVoter = createViolationVoter({ windowSize: 24, threshold: 20 })`.
- Per interval tick (replacing the `violationSince`/`alreadyReported` block):

```typescript
        const result = landmarker.detectForVideo(video, performance.now());
        const violationReason = detectViolationReason(result);
        const confirmedViolation = violationVoter.push(violationReason);
        if (confirmedViolation) {
          const snap = captureSnapshot(video); // helper: canvas draw -> toDataURL('image/jpeg', 0.5)
          reportViolationRef.current({ reason: confirmedViolation, snapshot: snap });
          onViolationRef.current?.(confirmedViolation);
        }

        // looking_down runs independently; only meaningful when not already a violation frame.
        const lookingConfirmed = lookingVoter.push(detectLookingDown(result) ? 'looking_down' : null);
        if (lookingConfirmed) {
          reportEventRef.current('looking_down');
        }
```

- Periodic snapshot timer, set up alongside the interval and torn down in cleanup:

```typescript
    function scheduleSnapshot() {
      const delay = PERIODIC_SNAPSHOT_MIN_MS + Math.random() * (PERIODIC_SNAPSHOT_MAX_MS - PERIODIC_SNAPSHOT_MIN_MS);
      snapshotTimer = setTimeout(() => {
        if (video.readyState >= 2) reportSnapshotRef.current(captureSnapshot(video));
        scheduleSnapshot();
      }, delay);
    }
    scheduleSnapshot();
```

- Extract `captureSnapshot(video)` (the existing canvas→dataURL code, factored into a local function).
- Cleanup: `clearTimeout(snapshotTimer)` in addition to the existing interval/stream teardown.
- Keep the `__DISABLE_WEBCAM_MONITOR__` gate, the camera-failure fail-safe (`reportViolationRef.current({ reason: 'no_face', snapshot: '' })`), and `video.readyState < 2` guard unchanged.

- [ ] **Step 5: Run to verify pass**

```bash
cd "D:\exam app\apps\web" && npx jest lib/hooks/useWebcamMonitor.test.tsx && npx tsc --noEmit -p tsconfig.json
```
Expected: PASS; no new tsc errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/hooks/useWebcamMonitor.ts apps/web/lib/hooks/useAttempt.ts apps/web/lib/types.ts apps/web/lib/hooks/useWebcamMonitor.test.tsx
git commit -m "feat: voting window, looking_down, and periodic snapshots in the webcam monitor"
```

---

### Task 5: Candidate overlay variant + exam-page wiring

**Files:**
- Modify: `apps/web/app/(candidate)/components/ProctoringOverlay.tsx` (`ProctoringWarningOverlay`)
- Modify: `apps/web/app/(candidate)/exam/page.tsx`
- Test: `apps/web/app/(candidate)/components/ProctoringOverlay.test.tsx`

**Interfaces:**
- Consumes: `useWebcamMonitor(enabled, onViolationReason)` (Task 4).
- Produces: the warning overlay renders a reason-specific message; the exam page stores the last confirmed reason and passes it through.

- [ ] **Step 1: Write the failing overlay test**

In `ProctoringOverlay.test.tsx`, add:

```tsx
  it('shows the multiple-person message for a multiple_faces reason', () => {
    render(<ProctoringWarningOverlay strike={1} reason="multiple_faces" onContinue={() => {}} continuePending={false} continueError={false} />);
    expect(screen.getByText('More than one person detected')).toBeInTheDocument();
  });

  it('shows the default face-not-visible message for no_face', () => {
    render(<ProctoringWarningOverlay strike={2} reason="no_face" onContinue={() => {}} continuePending={false} continueError={false} />);
    expect(screen.getByText('Face not visible')).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run to verify failure**

```bash
cd "D:\exam app\apps\web" && npx jest "app/(candidate)/components/ProctoringOverlay.test.tsx"
```
(If the parens-in-path pattern matches nothing under Jest, use the paren-free substring `ProctoringOverlay.test`.)
Expected: FAIL.

- [ ] **Step 3: Implement the overlay variant**

`ProctoringOverlay.tsx` — add `reason?: string` to `ProctoringWarningOverlayProps` and branch the heading/body:

```tsx
export function ProctoringWarningOverlay({ strike, reason, onContinue, continuePending, continueError }: ProctoringWarningOverlayProps) {
  const isMultiple = reason === 'multiple_faces';
  const heading = isMultiple ? 'More than one person detected' : 'Face not visible';
  const body = isMultiple
    ? 'Only you may be in view during the exam. Make sure no one else is visible in the camera, then continue.'
    : "We couldn't see your face clearly. Make sure you're centered in the camera and facing forward, then continue.";
  return (
    /* same wrapper; replace the <h1> text with {heading} and the description <p> with {body} */
  );
}
```

(Keep the existing markup, icon, "Warning {strike}/3", and continue button unchanged — only heading/body text vary.)

- [ ] **Step 4: Wire the exam page**

`exam/page.tsx`:
- Add state: `const [lastViolationReason, setLastViolationReason] = useState<string>('no_face');`
- Change the monitor call (line ~61): `useWebcamMonitor(started, setLastViolationReason);`
- Pass it to the overlay (line ~180): `reason={lastViolationReason}` on `ProctoringWarningOverlay`.

- [ ] **Step 5: Run to verify pass**

```bash
cd "D:\exam app\apps\web" && npx jest ProctoringOverlay.test && npx tsc --noEmit -p tsconfig.json
```
Expected: PASS; no new tsc errors.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/app/(candidate)/components/ProctoringOverlay.tsx" "apps/web/app/(candidate)/components/ProctoringOverlay.test.tsx" "apps/web/app/(candidate)/exam/page.tsx"
git commit -m "feat: reason-specific webcam warning overlay for multiple faces"
```

---

### Task 6: Reports webcam timeline API + panel viewer + final verification

**Files:**
- Modify: `apps/api/src/reports/reports.service.ts` (candidate report method, ~line 285-300)
- Modify: `apps/web/lib/types.ts` (`CandidateDetail` gains `webcamTimeline`)
- Modify: `apps/web/app/(panel)/reports/[examId]/candidates/[candidateId]/page.tsx`
- Test: `apps/api/src/reports/reports.service.spec.ts`, `apps/web/app/(panel)/reports/[examId]/candidates/[candidateId]/page.test.tsx` (extend; grep for existing)

**Interfaces:**
- Consumes: `webcam_violation` and `webcam_snapshot` ProctoringEvents (Tasks 3–4).
- Produces: candidate report returns `webcamTimeline: { occurredAt: string; kind: 'violation' | 'periodic'; reason?: string; strike?: number; snapshot: string }[]` (chronological). Panel page renders a "Webcam timeline" section.

- [ ] **Step 1: Write the failing reports test**

In `reports.service.spec.ts`, add a case (mirror an existing candidate-report test's tenant/prisma mock): given an attempt with one `webcam_violation` (`metadataJson: {snapshot:'a', strike:1}`, eventType `webcam_multiple_faces`) and one `webcam_snapshot` (`{snapshot:'b'}`), the returned `webcamTimeline` is chronological with entries `{ kind:'violation', reason:'multiple_faces', strike:1, snapshot:'a' }` and `{ kind:'periodic', snapshot:'b' }`.

Mapping rule to implement: eventType prefixed `webcam_` and not `webcam_snapshot` → `kind:'violation'`, `reason` = eventType minus the `webcam_` prefix (`no_face`/`head_turned`/`multiple_faces`), `strike` from metadata; `webcam_snapshot` → `kind:'periodic'`.

- [ ] **Step 2: Run to verify failure**

```bash
cd "D:\exam app\apps\api" && npx jest src/reports/reports.service.spec.ts
```
Expected: FAIL.

- [ ] **Step 3: Implement the report field**

In the candidate report method, after loading the attempt, query its webcam events and build the timeline:

```typescript
      const webcamEvents = await tx.proctoringEvent.findMany({
        where: { attemptId: row.attemptId as string, eventType: { startsWith: 'webcam_' } },
        orderBy: { occurredAt: 'asc' },
      });
      const webcamTimeline = webcamEvents.map((e) => {
        const meta = e.metadataJson ? JSON.parse(e.metadataJson) : {};
        if (e.eventType === 'webcam_snapshot') {
          return { occurredAt: e.occurredAt.toISOString(), kind: 'periodic' as const, snapshot: meta.snapshot ?? '' };
        }
        return {
          occurredAt: e.occurredAt.toISOString(),
          kind: 'violation' as const,
          reason: e.eventType.replace(/^webcam_/, ''),
          strike: meta.strike,
          snapshot: meta.snapshot ?? '',
        };
      });
```

Include `webcamTimeline` in the returned object (both the has-attempt and, as `[]`, the no-attempt early-return path). Add the type to the service's return interface.

- [ ] **Step 4: Write the failing panel-page test**

In the candidate-detail `page.test.tsx`, add: given a mocked `CandidateDetail` with a two-entry `webcamTimeline`, the page renders a "Webcam timeline" heading and two tiles; clicking a tile opens the Modal (assert the enlarged image appears); with an empty timeline, "No webcam snapshots recorded." shows.

- [ ] **Step 5: Implement the viewer**

`apps/web/lib/types.ts` — add to `CandidateDetail`:

```typescript
  webcamTimeline: { occurredAt: string; kind: 'violation' | 'periodic'; reason?: string; strike?: number; snapshot: string }[];
```

In the candidate-detail page, add a "Webcam timeline" section: a responsive thumbnail grid over `detail.webcamTimeline`. Each tile is a `<button>` showing the snapshot as a background/`<img>` (skip the image when `snapshot === ''`, render a labeled placeholder), the capture time, and — for `kind:'violation'` — a red border + a "{reason} — strike {n}" label. Clicking sets a `selected` state that drives the existing `Modal` (title = the tile's time/label) showing the full-size image. Empty state: `No webcam snapshots recorded.` Follow the page's existing section/card styling (integrity section is the nearest pattern).

- [ ] **Step 6: Run all touched suites + typecheck**

```bash
cd "D:\exam app\apps\api" && npx jest src/reports/reports.service.spec.ts
cd "D:\exam app\apps\web" && npx jest "candidates" && npx tsc --noEmit -p tsconfig.json
```
Expected: PASS; no new tsc errors.

- [ ] **Step 7: Full regression**

```bash
cd "D:\exam app\apps\exam-runtime" && npx jest
cd "D:\exam app\apps\api" && npx jest
cd "D:\exam app\apps\web" && npx jest lib/webcam-voting.test.ts lib/webcam-detection.test.ts lib/hooks/useWebcamMonitor.test.tsx ProctoringOverlay.test
cd "D:\exam app\apps\web" && WEB_BASE_URL=http://localhost:3002 E2E_API_BASE=http://localhost:3501/api/v1 npx playwright test --reporter=list
```
Expected: exam-runtime + api jest green; the web unit suites green; Playwright full suite green (unchanged count — webcam monitoring stays disabled by the e2e mock, so no new e2e spec; verify the candidate golden-path and live-monitoring specs still pass, confirming nothing regressed in the exam page or violation pipeline).

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/reports/reports.service.ts apps/api/src/reports/reports.service.spec.ts apps/web/lib/types.ts "apps/web/app/(panel)/reports/[examId]/candidates/[candidateId]/"
git commit -m "feat: webcam timeline viewer on the panel candidate detail page"
```

---

## Self-Review Notes

- **Spec coverage:** voting module (T1); multiple_faces + pitch detection (T2); backend violation reason, looking_down registration, snapshot endpoint with no-emit + not-client-reportable (T3); monitor rewire with 8/5 + 24/20 voters, periodic jittered snapshots, reason callback (T4); multiple-faces corrective overlay + never-strike looking_down (T4/T5 — looking_down never touches the violation/overlay path); webcam timeline API + panel viewer surfacing v1 snapshots too (T6). Unchanged-behavior constraints (3-strike flow, 30° yaw, e2e hatch, fail-safe) explicitly preserved in T3/T4. ✓
- **Placeholder scan:** test bodies in T4/T6 describe scripted-mock setups by reference to the existing test harness the implementer must read (the mediapipe mock and the candidate-report mock), with exact assertions stated — consistent with repo convention; all production code shown in full. ✓
- **Type consistency:** `createViolationVoter({windowSize, threshold})`, `detectViolationReason`→`'multiple_faces'`, `detectLookingDown`, `useWebcamMonitor(enabled, onViolationReason)`, `webcamTimeline` entry shape, eventType strings (`webcam_multiple_faces`, `webcam_snapshot`, `looking_down`) identical across tasks. ✓
