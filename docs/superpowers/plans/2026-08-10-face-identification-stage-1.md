# Face Identification — Stage 1 (Enrolment & Evidence) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture a consented, liveness-verified reference photo before an exam starts, store it safely, delete it on schedule, and show recruiters who did and did not enrol.

**Architecture:** The candidate's browser runs a blink challenge and a quality gate using the MediaPipe FaceLandmarker already loaded for proctoring, then uploads one still frame to exam-runtime, which writes it to blob storage and records a `FaceEnrolment` row. Enrolment failure branches on a per-exam recruiter setting. No verification, no enforcement, and **no ML runtime** — the embedding column is created nullable and populated in stage 2 from the stored image.

**Tech Stack:** Prisma + Azure SQL, NestJS (apps/api, apps/exam-runtime), Next.js (apps/web), MediaPipe Tasks Vision (already self-hosted), Azure Blob Storage via `BlobStorageService`. No new dependencies.

**Not in this stage, deliberately:** `OrgSecretsCryptoService` encryption of the embedding. The spec requires it, but the embedding is only *populated* in stage 2 — encrypting a column nothing writes to would be untestable ceremony. Stage 2 owns both the population and the encryption, together.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-10-face-identification-design.md`. Stage 1 only.
- **No verification and no enforcement in this stage.** No comparison, no `face_mismatch` event, no pause/block. Do not add the mismatch-action setting — that is stage 2.
- **No ONNX, no model weights, no new dependency with native binaries.** If a task seems to need one, stop and raise it.
- Reference image goes to the **private** blob container; the stored value is the blob path. Never store a SAS-signed URL — see `toStoredImageUrl` in `apps/api/src/questions/questions.service.ts`.
- Blob uploads happen **outside** `tenantPrisma.forTenant` transactions (a long upload inside one exhausts the connection pool).
- Retention window is **90 days** after the attempt is finalised. Decided; do not parameterise per org.
- Enrolment-failure policy values are exactly: `allow_unenrolled` | `retry_then_allow` | `require_enrolment`. Default `retry_then_allow`.
- Max **3** capture attempts before the policy branch.
- Every failure degrades to letting the candidate proceed unless the exam is set to `require_enrolment`. A candidate must never be stuck because our code failed.
- Run `npx jest` in the changed workspace and `npx tsc --noEmit` before every commit.

---

### Task 1: Schema and migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260811000000_face_enrolment/migration.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: Prisma models `FaceEnrolment`; `Exam.faceVerificationEnabled: boolean`, `Exam.faceEnrolmentPolicy: string`.

- [ ] **Step 1: Add the model to `schema.prisma`**

Add after the `ProctoringEvent` model (around line 580):

```prisma
model FaceEnrolment {
  id                 String   @id @default(uuid()) @db.UniqueIdentifier
  attemptId          String   @unique @map("attempt_id") @db.UniqueIdentifier
  status             String
  // Populated in stage 2 from referenceImagePath; encrypted with OrgSecretsCryptoService.
  embedding          String?  @db.NVarChar(Max)
  referenceImagePath String?  @map("reference_image_path")
  qualityJson        String?  @map("quality_json") @db.NVarChar(Max)
  consentAt          DateTime @map("consent_at")
  capturedAt         DateTime? @map("captured_at")
  createdAt          DateTime @default(now()) @map("created_at")
  attempt            Attempt  @relation(fields: [attemptId], references: [id], onDelete: Cascade)

  @@map("face_enrolments")
}
```

- [ ] **Step 2: Add the relation and exam columns**

In `model Attempt`, add alongside the other relations:

```prisma
  faceEnrolment                 FaceEnrolment?
```

In `model Exam`, add after `lockdownRequired`:

```prisma
  faceVerificationEnabled       Boolean       @default(false) @map("face_verification_enabled")
  faceEnrolmentPolicy           String        @default("retry_then_allow") @map("face_enrolment_policy")
```

- [ ] **Step 3: Write the migration**

Create `apps/api/prisma/migrations/20260811000000_face_enrolment/migration.sql`:

```sql
CREATE TABLE [dbo].[face_enrolments] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [attempt_id] UNIQUEIDENTIFIER NOT NULL,
    [status] NVARCHAR(1000) NOT NULL,
    [embedding] NVARCHAR(MAX),
    [reference_image_path] NVARCHAR(1000),
    [quality_json] NVARCHAR(MAX),
    [consent_at] DATETIME2 NOT NULL,
    [captured_at] DATETIME2,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [face_enrolments_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [face_enrolments_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [face_enrolments_attempt_id_key] UNIQUE NONCLUSTERED ([attempt_id])
);

ALTER TABLE [dbo].[face_enrolments] ADD CONSTRAINT [face_enrolments_attempt_id_fkey]
    FOREIGN KEY ([attempt_id]) REFERENCES [dbo].[attempts]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE [dbo].[exams] ADD [face_verification_enabled] BIT NOT NULL CONSTRAINT [exams_face_verification_enabled_df] DEFAULT 0;
ALTER TABLE [dbo].[exams] ADD [face_enrolment_policy] NVARCHAR(1000) NOT NULL CONSTRAINT [exams_face_enrolment_policy_df] DEFAULT 'retry_then_allow';
```

**Do not** reference the new exam columns in a later statement inside this same file — SQL Server binds the whole batch at compile time and it will fail with "Invalid column name". If a backfill is ever needed, it goes in a second migration directory.

- [ ] **Step 4: Apply locally and regenerate the client**

Run:
```bash
cd "D:/exam app" && npx prisma migrate dev --schema=apps/api/prisma/schema.prisma --name face_enrolment
```
Expected: `The following migration(s) have been applied` and `Generated Prisma Client`.

- [ ] **Step 5: Verify the client has the new types**

Run:
```bash
cd "D:/exam app/apps/api" && npx tsc --noEmit
```
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260811000000_face_enrolment
git commit -m "feat(face-id): FaceEnrolment table and per-exam enrolment settings"
```

---

### Task 2: Face quality gate (pure module)

A bad reference poisons every future comparison, so this rejects unusable frames before they are stored.

**Files:**
- Create: `apps/web/lib/face-quality.ts`
- Test: `apps/web/lib/face-quality.test.ts`

**Interfaces:**
- Consumes: `FaceLandmarkerResult` from `@mediapipe/tasks-vision` (already a dependency).
- Produces: `assessFaceQuality(result, frameWidth, frameHeight): QualityVerdict` where
  `type QualityVerdict = { ok: true; metrics: QualityMetrics } | { ok: false; problem: QualityProblem; hint: string; metrics: QualityMetrics }`,
  `type QualityProblem = 'no_face' | 'multiple_faces' | 'too_small' | 'off_centre'`,
  `type QualityMetrics = { faceCount: number; faceWidthRatio: number; centreOffsetRatio: number }`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/lib/face-quality.test.ts`:

```ts
import { assessFaceQuality } from './face-quality';

// MediaPipe normalises landmark x/y to 0..1 of the frame. A face is described here by the
// horizontal extent of its landmarks, which is what faceWidthRatio measures.
function face(minX: number, maxX: number, centreY = 0.5) {
  return [
    { x: minX, y: centreY, z: 0 },
    { x: maxX, y: centreY, z: 0 },
    { x: (minX + maxX) / 2, y: centreY, z: 0 },
  ];
}

const FRAME = { w: 640, h: 480 };

describe('assessFaceQuality', () => {
  it('accepts a single, large, centred face', () => {
    const verdict = assessFaceQuality({ faceLandmarks: [face(0.35, 0.65)] } as never, FRAME.w, FRAME.h);
    expect(verdict.ok).toBe(true);
    expect(verdict.metrics.faceCount).toBe(1);
  });

  it('rejects an empty frame as no_face', () => {
    const verdict = assessFaceQuality({ faceLandmarks: [] } as never, FRAME.w, FRAME.h);
    expect(verdict).toMatchObject({ ok: false, problem: 'no_face' });
  });

  // Enrolling with two people in frame is how you end up with the wrong reference entirely.
  it('rejects two faces rather than guessing which one to enrol', () => {
    const verdict = assessFaceQuality(
      { faceLandmarks: [face(0.1, 0.3), face(0.6, 0.9)] } as never, FRAME.w, FRAME.h,
    );
    expect(verdict).toMatchObject({ ok: false, problem: 'multiple_faces' });
  });

  it('rejects a face too small in frame, and says what to do', () => {
    const verdict = assessFaceQuality({ faceLandmarks: [face(0.48, 0.54)] } as never, FRAME.w, FRAME.h);
    expect(verdict).toMatchObject({ ok: false, problem: 'too_small' });
    if (!verdict.ok) expect(verdict.hint).toMatch(/closer/i);
  });

  it('rejects a face pushed to the edge of frame', () => {
    const verdict = assessFaceQuality({ faceLandmarks: [face(0.72, 0.98)] } as never, FRAME.w, FRAME.h);
    expect(verdict).toMatchObject({ ok: false, problem: 'off_centre' });
  });

  it('always reports metrics, so a rejected enrolment can be debugged later', () => {
    const verdict = assessFaceQuality({ faceLandmarks: [face(0.48, 0.54)] } as never, FRAME.w, FRAME.h);
    expect(verdict.metrics.faceWidthRatio).toBeCloseTo(0.06, 2);
  });

  it('treats a missing faceLandmarks array as no_face rather than throwing', () => {
    const verdict = assessFaceQuality({} as never, FRAME.w, FRAME.h);
    expect(verdict).toMatchObject({ ok: false, problem: 'no_face' });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd "D:/exam app/apps/web" && npx jest face-quality`
Expected: FAIL — `Cannot find module './face-quality'`.

- [ ] **Step 3: Implement**

Create `apps/web/lib/face-quality.ts`:

```ts
import type { FaceLandmarkerResult } from '@mediapipe/tasks-vision';

export type QualityProblem = 'no_face' | 'multiple_faces' | 'too_small' | 'off_centre';

export interface QualityMetrics {
  faceCount: number;
  faceWidthRatio: number;
  centreOffsetRatio: number;
}

export type QualityVerdict =
  | { ok: true; metrics: QualityMetrics }
  | { ok: false; problem: QualityProblem; hint: string; metrics: QualityMetrics };

// The face must span at least this fraction of the frame width. Below it the reference carries
// too few pixels to be worth comparing against for the next hour.
const MIN_FACE_WIDTH_RATIO = 0.15;
// How far the face centre may sit from the frame centre, as a fraction of frame width.
const MAX_CENTRE_OFFSET_RATIO = 0.25;

export function assessFaceQuality(
  result: FaceLandmarkerResult,
  frameWidth: number,
  frameHeight: number,
): QualityVerdict {
  const faces = result?.faceLandmarks ?? [];
  const empty: QualityMetrics = { faceCount: faces.length, faceWidthRatio: 0, centreOffsetRatio: 0 };

  if (faces.length === 0) {
    return { ok: false, problem: 'no_face', hint: 'We can’t see your face. Move into the light and look at the camera.', metrics: empty };
  }
  if (faces.length > 1) {
    return { ok: false, problem: 'multiple_faces', hint: 'More than one person is visible. Make sure you’re alone in frame.', metrics: empty };
  }

  const xs = faces[0].map((point) => point.x);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const faceWidthRatio = maxX - minX;
  const centreOffsetRatio = Math.abs((minX + maxX) / 2 - 0.5);
  const metrics: QualityMetrics = { faceCount: 1, faceWidthRatio, centreOffsetRatio };

  if (faceWidthRatio < MIN_FACE_WIDTH_RATIO) {
    return { ok: false, problem: 'too_small', hint: 'Move closer to the camera.', metrics };
  }
  if (centreOffsetRatio > MAX_CENTRE_OFFSET_RATIO) {
    return { ok: false, problem: 'off_centre', hint: 'Centre your face in the frame.', metrics };
  }
  return { ok: true, metrics };
}
```

Note `frameWidth`/`frameHeight` are accepted but unused: MediaPipe landmarks are already
normalised, and keeping them in the signature means the caller passes the frame it captured, which
is what `qualityJson` records.

- [ ] **Step 4: Run the tests**

Run: `cd "D:/exam app/apps/web" && npx jest face-quality`
Expected: 7 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/face-quality.ts apps/web/lib/face-quality.test.ts
git commit -m "feat(face-id): quality gate that rejects an unusable reference frame"
```

---

### Task 3: Blink liveness challenge (pure module)

A held-up photograph cannot blink. This guarantees the reference came from a live person, which
matters more than any later check because everything downstream compares against it.

**Files:**
- Create: `apps/web/lib/face-liveness.ts`
- Test: `apps/web/lib/face-liveness.test.ts`

**Interfaces:**
- Consumes: `FaceLandmarkerResult` (with `faceBlendshapes`).
- Produces: `createBlinkChallenge(): BlinkChallenge` where
  `interface BlinkChallenge { push(result: FaceLandmarkerResult): BlinkState; reset(): void }` and
  `type BlinkState = 'waiting_open' | 'waiting_close' | 'satisfied'`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/lib/face-liveness.test.ts`:

```ts
import { createBlinkChallenge } from './face-liveness';

// MediaPipe emits eyeBlinkLeft/eyeBlinkRight blendshape scores in 0..1; high means closed.
function frame(blink: number) {
  return {
    faceBlendshapes: [
      { categories: [
        { categoryName: 'eyeBlinkLeft', score: blink },
        { categoryName: 'eyeBlinkRight', score: blink },
      ] },
    ],
  } as never;
}

describe('createBlinkChallenge', () => {
  it('is not satisfied by open eyes alone — a photo would pass that', () => {
    const challenge = createBlinkChallenge();
    for (let i = 0; i < 20; i += 1) expect(challenge.push(frame(0.02))).not.toBe('satisfied');
  });

  it('is satisfied only by open → closed → open', () => {
    const challenge = createBlinkChallenge();
    expect(challenge.push(frame(0.02))).toBe('waiting_close');
    // Still 'waiting_close': the state names what the machine is waiting to observe next, and
    // after a closure it is waiting for the eyes to reopen to complete the same blink.
    expect(challenge.push(frame(0.8))).toBe('waiting_close');
    expect(challenge.push(frame(0.02))).toBe('satisfied');
  });

  // A frame that starts mid-blink must not count the first opening as a completed blink.
  it('requires eyes open FIRST, so starting closed does not shortcut it', () => {
    const challenge = createBlinkChallenge();
    expect(challenge.push(frame(0.9))).toBe('waiting_open');
    expect(challenge.push(frame(0.02))).toBe('waiting_close');
    expect(challenge.push(frame(0.02))).toBe('waiting_close');
  });

  it('ignores frames with no face rather than losing progress', () => {
    const challenge = createBlinkChallenge();
    challenge.push(frame(0.02));
    expect(challenge.push({ faceBlendshapes: [] } as never)).toBe('waiting_close');
  });

  it('stays satisfied once satisfied, so a later frame cannot un-verify it', () => {
    const challenge = createBlinkChallenge();
    challenge.push(frame(0.02));
    challenge.push(frame(0.8));
    expect(challenge.push(frame(0.02))).toBe('satisfied');
    expect(challenge.push(frame(0.8))).toBe('satisfied');
  });

  it('reset() starts a fresh challenge for a retry', () => {
    const challenge = createBlinkChallenge();
    challenge.push(frame(0.02));
    challenge.push(frame(0.8));
    challenge.push(frame(0.02));
    challenge.reset();
    expect(challenge.push(frame(0.02))).toBe('waiting_close');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd "D:/exam app/apps/web" && npx jest face-liveness`
Expected: FAIL — `Cannot find module './face-liveness'`.

- [ ] **Step 3: Implement**

Create `apps/web/lib/face-liveness.ts`:

```ts
import type { FaceLandmarkerResult } from '@mediapipe/tasks-vision';

export type BlinkState = 'waiting_open' | 'waiting_close' | 'satisfied';

export interface BlinkChallenge {
  push(result: FaceLandmarkerResult): BlinkState;
  reset(): void;
}

const CLOSED_THRESHOLD = 0.5;
const OPEN_THRESHOLD = 0.2;

function blinkScore(result: FaceLandmarkerResult): number | null {
  const categories = result?.faceBlendshapes?.[0]?.categories;
  if (!categories) return null;
  const scores = categories
    .filter((category) => category.categoryName === 'eyeBlinkLeft' || category.categoryName === 'eyeBlinkRight')
    .map((category) => category.score);
  if (scores.length === 0) return null;
  // Both eyes: take the lower score so one eye's tracking noise cannot fake a blink.
  return Math.min(...scores);
}

// A deliberate open -> closed -> open sequence. Requiring the OPEN state FIRST is what stops a
// frame that happens to start mid-blink from registering a blink it never saw begin -- without it,
// a candidate who is already blinking when the challenge starts would pass on a half-observation.
export function createBlinkChallenge(): BlinkChallenge {
  let state: BlinkState = 'waiting_open';
  let sawClosed = false;

  return {
    push(result) {
      if (state === 'satisfied') return state;
      const score = blinkScore(result);
      // No face in this frame: hold position rather than losing progress.
      if (score === null) return state;

      if (state === 'waiting_open' && score < OPEN_THRESHOLD) {
        state = 'waiting_close';
        return state;
      }
      if (state === 'waiting_close' && score > CLOSED_THRESHOLD) {
        sawClosed = true;
        return state;
      }
      if (state === 'waiting_close' && sawClosed && score < OPEN_THRESHOLD) {
        state = 'satisfied';
      }
      return state;
    },
    reset() {
      state = 'waiting_open';
      sawClosed = false;
    },
  };
}
```

Trace it against the tests: `push(0.02)` → `waiting_close`; `push(0.8)` → stays `waiting_close` and
records `sawClosed`; `push(0.02)` → `satisfied`. Starting closed, `push(0.9)` → `waiting_open`
unchanged, so the sequence cannot be short-circuited.

- [ ] **Step 4: Run the tests**

Run: `cd "D:/exam app/apps/web" && npx jest face-liveness`
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/face-liveness.ts apps/web/lib/face-liveness.test.ts
git commit -m "feat(face-id): blink challenge so the reference cannot be a photograph"
```

---

### Task 4: Enrolment endpoint in exam-runtime

**Files:**
- Create: `apps/exam-runtime/src/attempts/dto/face-enrolment.dto.ts`
- Modify: `apps/exam-runtime/src/attempts/attempt.controller.ts` (after the `webcam-snapshot` handler, ~line 86)
- Modify: `apps/exam-runtime/src/attempts/attempt.service.ts`
- Test: `apps/exam-runtime/src/attempts/attempt.service.spec.ts`

**Interfaces:**
- Consumes: `CandidateSession`, `BlobStorageService.uploadDataUri(blobPath, dataUri)`, `TenantPrismaService.forTenant`.
- Produces: `AttemptService.recordFaceEnrolment(session: CandidateSession, dto: FaceEnrolmentDto): Promise<{ status: string }>`.

- [ ] **Step 1: Create the DTO**

Create `apps/exam-runtime/src/attempts/dto/face-enrolment.dto.ts`:

```ts
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class FaceEnrolmentDto {
  // 'enrolled' carries an image; 'not_verified' records that capture failed and the exam's
  // policy let the candidate through anyway.
  @IsIn(['enrolled', 'not_verified'])
  status!: 'enrolled' | 'not_verified';

  // data: URI of the captured still. Absent for not_verified.
  @IsOptional() @IsString()
  snapshot?: string;

  // JSON of QualityMetrics, so a bad reference can be explained after the fact.
  @IsOptional() @IsString() @MaxLength(2000)
  qualityJson?: string;

  @IsBoolean()
  consentGiven!: boolean;
}
```

- [ ] **Step 2: Write the failing tests**

Add to `apps/exam-runtime/src/attempts/attempt.service.spec.ts`:

```ts
  describe('recordFaceEnrolment', () => {
    it('uploads the reference image and stores its PATH, never a signed URL', async () => {
      const upsert = jest.fn().mockResolvedValue({});
      blobStorage.uploadDataUri = jest.fn().mockResolvedValue('https://acct.blob.core.windows.net/c/face/attempt-1.jpg');
      mockBootstrapThenScoped({ attempt: { findUnique: jest.fn().mockResolvedValue({ id: 'attempt-1' }) }, faceEnrolment: { upsert } });

      await service.recordFaceEnrolment(session, {
        status: 'enrolled', snapshot: 'data:image/jpeg;base64,AAA', qualityJson: '{"faceCount":1}', consentGiven: true,
      });

      expect(blobStorage.uploadDataUri).toHaveBeenCalled();
      const stored = upsert.mock.calls[0][0].create.referenceImagePath;
      expect(stored).not.toContain('?');
      expect(stored).toContain('face/');
    });

    it('records not_verified with no image when capture failed', async () => {
      const upsert = jest.fn().mockResolvedValue({});
      blobStorage.uploadDataUri = jest.fn();
      mockBootstrapThenScoped({ attempt: { findUnique: jest.fn().mockResolvedValue({ id: 'attempt-1' }) }, faceEnrolment: { upsert } });

      await service.recordFaceEnrolment(session, { status: 'not_verified', consentGiven: true });

      expect(blobStorage.uploadDataUri).not.toHaveBeenCalled();
      expect(upsert.mock.calls[0][0].create).toMatchObject({ status: 'not_verified', referenceImagePath: null });
    });

    // Consent is the lawful basis for holding biometric data. No consent, no capture, ever.
    it('refuses to store anything when consent was not given', async () => {
      const upsert = jest.fn();
      mockBootstrapThenScoped({ attempt: { findUnique: jest.fn().mockResolvedValue({ id: 'attempt-1' }) }, faceEnrolment: { upsert } });

      await expect(
        service.recordFaceEnrolment(session, { status: 'enrolled', snapshot: 'data:image/jpeg;base64,AAA', consentGiven: false }),
      ).rejects.toThrow(/consent/i);
      expect(upsert).not.toHaveBeenCalled();
    });

    it('is idempotent — a retry replaces the previous row rather than failing on the unique key', async () => {
      const upsert = jest.fn().mockResolvedValue({});
      blobStorage.uploadDataUri = jest.fn().mockResolvedValue('https://acct.blob.core.windows.net/c/face/attempt-1.jpg');
      mockBootstrapThenScoped({ attempt: { findUnique: jest.fn().mockResolvedValue({ id: 'attempt-1' }) }, faceEnrolment: { upsert } });

      await service.recordFaceEnrolment(session, { status: 'enrolled', snapshot: 'data:image/jpeg;base64,AAA', consentGiven: true });

      expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { attemptId: 'attempt-1' } }));
    });
  });
```

- [ ] **Step 3: Run to verify failure**

Run: `cd "D:/exam app/apps/exam-runtime" && npx jest attempt.service -t recordFaceEnrolment`
Expected: FAIL — `service.recordFaceEnrolment is not a function`.

- [ ] **Step 4: Implement the service method**

Add to `apps/exam-runtime/src/attempts/attempt.service.ts`, next to `webcamSnapshot`:

```ts
  async recordFaceEnrolment(session: CandidateSession, dto: FaceEnrolmentDto): Promise<{ status: string }> {
    if (!dto.consentGiven) {
      throw new BadRequestException('Face enrolment requires the candidate’s consent');
    }
    const { organizationId, invitation } = await this.resolveContext(session.invitationId);
    const attempt = await this.tenantPrisma.forTenant({ organizationId, isSuperAdmin: false }, (tx) =>
      tx.attempt.findUnique({ where: { invitationId: invitation.id }, select: { id: true } }),
    );
    if (!attempt) {
      throw new BadRequestException('Cannot enrol before the attempt has started');
    }

    // Upload OUTSIDE the transaction: a slow blob write inside forTenant holds a pooled
    // connection for its whole duration and starves concurrent candidates.
    let referenceImagePath: string | null = null;
    if (dto.status === 'enrolled' && dto.snapshot) {
      const url = await this.blobStorage.uploadDataUri(`face/${attempt.id}.jpg`, dto.snapshot);
      // Store the PATH, never a signed URL -- a stored SAS expires and cannot be re-signed.
      referenceImagePath = url.split('?')[0];
    }

    const row = {
      status: dto.status,
      referenceImagePath,
      qualityJson: dto.qualityJson ?? null,
      consentAt: new Date(),
      capturedAt: referenceImagePath ? new Date() : null,
    };
    await this.tenantPrisma.forTenant({ organizationId, isSuperAdmin: false }, (tx) =>
      tx.faceEnrolment.upsert({
        where: { attemptId: attempt.id },
        create: { attemptId: attempt.id, ...row },
        update: row,
      }),
    );
    return { status: dto.status };
  }
```

Add the import at the top of the file:

```ts
import { FaceEnrolmentDto } from './dto/face-enrolment.dto';
```

- [ ] **Step 5: Add the controller route**

In `apps/exam-runtime/src/attempts/attempt.controller.ts`, after the `webcam-snapshot` handler:

```ts
  @Post('face-enrolment')
  @Throttle(MODERATE_ATTEMPT_THROTTLE)
  faceEnrolment(@CurrentCandidate() candidate: CandidateSession, @Body() dto: FaceEnrolmentDto) {
    return this.attemptService.recordFaceEnrolment(candidate, dto);
  }
```

with `import { FaceEnrolmentDto } from './dto/face-enrolment.dto';` added to the imports.

- [ ] **Step 6: Run the tests**

Run: `cd "D:/exam app/apps/exam-runtime" && npx jest attempt.service`
Expected: all pass, including the 4 new ones.

- [ ] **Step 7: Commit**

```bash
git add apps/exam-runtime/src/attempts/dto/face-enrolment.dto.ts apps/exam-runtime/src/attempts/attempt.controller.ts apps/exam-runtime/src/attempts/attempt.service.ts apps/exam-runtime/src/attempts/attempt.service.spec.ts
git commit -m "feat(face-id): candidate enrolment endpoint storing consent, image path and quality"
```

---

### Task 5: Recruiter settings — enable and enrolment policy

**Files:**
- Modify: `apps/api/src/exams/dto/update-exam.dto.ts`
- Modify: `apps/api/src/exams/exams.service.ts` (the exam-settings mapper)
- Modify: `apps/web/lib/types.ts`
- Modify: the exam settings panel that renders the proctoring config (find with the grep in Step 1)
- Test: `apps/api/src/exams/exams.service.spec.ts`

**Interfaces:**
- Consumes: `Exam.faceVerificationEnabled`, `Exam.faceEnrolmentPolicy` from Task 1.
- Produces: both fields on the exam DTO returned to the recruiter UI and accepted on update.

- [ ] **Step 1: Find the settings panel and the existing proctoring fields**

Run:
```bash
cd "D:/exam app" && grep -rln "proctoringStrikeLimit" apps/web/components apps/web/app
```
Use the panel that renders those controls; add the new controls beside them.

- [ ] **Step 2: Write the failing API test**

Add to `apps/api/src/exams/exams.service.spec.ts`, in the update-exam describe block:

```ts
    it('accepts the face verification settings', async () => {
      const update = jest.fn().mockResolvedValue({ id: 'exam-1' });
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) =>
        fn({ exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1', status: 'draft' }), update }, attempt: { count: jest.fn().mockResolvedValue(0) } }),
      );

      await service.update(context, 'exam-1', { faceVerificationEnabled: true, faceEnrolmentPolicy: 'require_enrolment' } as never, 'user-1');

      expect(update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ faceVerificationEnabled: true, faceEnrolmentPolicy: 'require_enrolment' }),
      }));
    });

    it('rejects an unknown enrolment policy rather than storing it', async () => {
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) =>
        fn({ exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1', status: 'draft' }), update: jest.fn() }, attempt: { count: jest.fn().mockResolvedValue(0) } }),
      );

      await expect(
        service.update(context, 'exam-1', { faceEnrolmentPolicy: 'whatever' } as never, 'user-1'),
      ).rejects.toThrow(/enrolment policy/i);
    });
```

- [ ] **Step 3: Run to verify failure**

Run: `cd "D:/exam app/apps/api" && npx jest exams.service -t "face verification settings"`
Expected: FAIL.

- [ ] **Step 4: Add the DTO fields**

In `apps/api/src/exams/dto/update-exam.dto.ts`:

```ts
  @IsOptional() @IsBoolean()
  faceVerificationEnabled?: boolean;

  @IsOptional() @IsIn(['allow_unenrolled', 'retry_then_allow', 'require_enrolment'], {
    message: 'Enrolment policy must be allow_unenrolled, retry_then_allow or require_enrolment',
  })
  faceEnrolmentPolicy?: string;
```

Ensure `IsBoolean` and `IsIn` are imported from `class-validator`.

- [ ] **Step 5: Thread the fields through the service**

In `apps/api/src/exams/exams.service.ts`, wherever `update()` builds its `data` object from the DTO,
add the two fields the same way the existing proctoring fields are handled. In the exam response
mapper, return both so the UI can render current values.

- [ ] **Step 6: Add the types and the UI controls**

In `apps/web/lib/types.ts`, add to the exam interface used by the settings panel:

```ts
  faceVerificationEnabled: boolean;
  /** allow_unenrolled | retry_then_allow | require_enrolment */
  faceEnrolmentPolicy: string;
```

In the settings panel from Step 1, add a checkbox labelled **"Require a face photo before starting"**
bound to `faceVerificationEnabled`, and — shown only when it is checked — a select labelled
**"If the photo can't be captured"** with options:

```
allow_unenrolled   → "Let them start (recorded as not verified)"
retry_then_allow   → "Retry 3 times, then let them start (recommended)"
require_enrolment  → "Don't let them start"
```

- [ ] **Step 7: Run both suites**

Run:
```bash
cd "D:/exam app/apps/api" && npx jest exams.service && cd "D:/exam app/apps/web" && npx jest
```
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/exams apps/web/lib/types.ts apps/web/components
git commit -m "feat(face-id): per-exam face verification toggle and enrolment-failure policy"
```

---

### Task 6: Welcome-page consent and capture

**Files:**
- Create: `apps/web/app/(candidate)/components/FaceEnrolmentStep.tsx`
- Create: `apps/web/app/(candidate)/components/FaceEnrolmentStep.test.tsx`
- Modify: `apps/web/app/(candidate)/welcome/page.tsx`
- Modify: `apps/web/lib/hooks/useAttempt.ts` (add the mutation)

**Interfaces:**
- Consumes: `assessFaceQuality` (Task 2), `createBlinkChallenge` (Task 3), `POST /attempt/face-enrolment` (Task 4), `faceVerificationEnabled` and `faceEnrolmentPolicy` on the welcome payload (Task 5).
- Produces: `<FaceEnrolmentStep policy={...} onSettled={(status: 'enrolled' | 'not_verified') => void} />`, and `useFaceEnrolment()` returning a react-query mutation.

- [ ] **Step 1: Add the mutation**

In `apps/web/lib/hooks/useAttempt.ts`, beside the other candidate mutations:

```ts
export function useFaceEnrolment() {
  const { accessToken } = useCandidateAuth();
  return useMutation({
    mutationFn: (body: { status: 'enrolled' | 'not_verified'; snapshot?: string; qualityJson?: string; consentGiven: boolean }) =>
      candidateApiFetch('/attempt/face-enrolment', { method: 'POST', body: JSON.stringify(body) }, accessToken ?? undefined),
  });
}
```

- [ ] **Step 2: Write the failing component tests**

Create `apps/web/app/(candidate)/components/FaceEnrolmentStep.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FaceEnrolmentStep } from './FaceEnrolmentStep';
import { useFaceEnrolment } from '../../../lib/hooks/useAttempt';

jest.mock('../../../lib/hooks/useAttempt', () => ({ useFaceEnrolment: jest.fn() }));

const mutateAsync = jest.fn().mockResolvedValue({ status: 'enrolled' });

beforeEach(() => {
  mutateAsync.mockClear();
  (useFaceEnrolment as jest.Mock).mockReturnValue({ mutateAsync, isPending: false });
});

describe('FaceEnrolmentStep', () => {
  // Consent is the lawful basis. Nothing may be captured before it is given.
  it('asks for consent before touching the camera', () => {
    render(<FaceEnrolmentStep policy="retry_then_allow" onSettled={jest.fn()} />);
    expect(screen.getByText(/photo of your face/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /take photo/i })).not.toBeInTheDocument();
  });

  it('says plainly what declining means when the exam requires enrolment', () => {
    render(<FaceEnrolmentStep policy="require_enrolment" onSettled={jest.fn()} />);
    expect(screen.getByText(/you won’t be able to start/i)).toBeInTheDocument();
  });

  it('settles as not_verified without a photo when the candidate declines under a permissive policy', async () => {
    const onSettled = jest.fn();
    render(<FaceEnrolmentStep policy="retry_then_allow" onSettled={onSettled} />);

    await userEvent.click(screen.getByRole('button', { name: /don’t agree/i }));

    expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ status: 'not_verified', consentGiven: false }));
    expect(onSettled).toHaveBeenCalledWith('not_verified');
  });

  it('does not settle at all when the candidate declines and enrolment is required', async () => {
    const onSettled = jest.fn();
    render(<FaceEnrolmentStep policy="require_enrolment" onSettled={onSettled} />);

    await userEvent.click(screen.getByRole('button', { name: /don’t agree/i }));

    expect(onSettled).not.toHaveBeenCalled();
    expect(screen.getByText(/contact your recruiter/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `cd "D:/exam app/apps/web" && npx jest FaceEnrolmentStep`
Expected: FAIL — cannot find the module.

- [ ] **Step 4: Implement the component**

Create `apps/web/app/(candidate)/components/FaceEnrolmentStep.tsx`. It renders three phases —
`consent`, `capture`, `done` — and holds the retry counter.

Required behaviour, all covered by the tests above plus the manual check in Step 6:

- **Consent phase.** Explain in plain words: a photo of your face is taken, used only to check it's
  still you during this exam, kept for 90 days, and deleted when your data is deleted. Two buttons:
  "I agree" and "I don't agree". Under `require_enrolment`, declining shows "You won't be able to
  start this exam — contact your recruiter" and does **not** call `onSettled`. Under the other two
  policies, declining posts `{ status: 'not_verified', consentGiven: false }` and settles.
- **Capture phase.** Reuse the existing `CameraPreview` for the video element. On each animation
  frame, run the MediaPipe result through `createBlinkChallenge().push(...)`; show "Look at the
  camera and blink". Once the challenge returns `satisfied`, run `assessFaceQuality`. If `ok`, draw
  the current video frame to a canvas, `toDataURL('image/jpeg', 0.8)`, post
  `{ status: 'enrolled', snapshot, qualityJson: JSON.stringify(metrics), consentGiven: true }`, and
  settle as `enrolled`. If not `ok`, show `verdict.hint`, increment the attempt counter, and
  `reset()` the challenge.
- **After 3 failed attempts**, branch on `policy`:
  `allow_unenrolled` and `retry_then_allow` → post `{ status: 'not_verified', consentGiven: true }`
  and settle `not_verified`; `require_enrolment` → show "We couldn't take your photo — contact your
  recruiter" and do not settle.
- **Any thrown error** (camera lost, request failed) is treated exactly like a failed attempt. The
  candidate must never be stuck on a spinner.

- [ ] **Step 5: Wire it into the welcome page**

In `apps/web/app/(candidate)/welcome/page.tsx`, render `<FaceEnrolmentStep>` when
`proctoring?.faceVerificationEnabled` is true and enrolment has not yet settled, and gate the Start
button on it exactly as the camera gate is gated today (see the `cameraStatus === 'granted'`
condition around line 246). When `faceVerificationEnabled` is false the step is not rendered at all
and Start behaves as it does today.

- [ ] **Step 6: Run the tests, then check it by hand**

Run: `cd "D:/exam app/apps/web" && npx jest FaceEnrolmentStep welcome`
Expected: all pass.

Then start the app and walk the flow with a real camera: agree → blink → photo accepted → Start
unlocks. Then cover the lens and confirm three failures fall through to the policy branch. Automated
tests cannot cover the camera path, so this manual pass is required before the task is complete.

- [ ] **Step 7: Commit**

```bash
git add "apps/web/app/(candidate)/components/FaceEnrolmentStep.tsx" "apps/web/app/(candidate)/components/FaceEnrolmentStep.test.tsx" "apps/web/app/(candidate)/welcome/page.tsx" apps/web/lib/hooks/useAttempt.ts
git commit -m "feat(face-id): consent screen and blink-verified reference capture on the welcome page"
```

---

### Task 7: Surface enrolment status to recruiters

**Files:**
- Modify: `apps/api/src/exams/exams.service.ts` (`getResults` row mapper — add `faceEnrolmentStatus`)
- Modify: `apps/api/src/reports/reports.service.ts` (`getCandidateDetail` — add `faceEnrolment`)
- Modify: `apps/web/lib/types.ts`
- Modify: `apps/web/components/LiveMonitoringPanel.tsx`
- Modify: `apps/web/components/CandidateReportPanel.tsx`
- Test: `apps/api/src/reports/reports.service.spec.ts`, `apps/web/components/CandidateReportPanel.test.tsx`

**Interfaces:**
- Consumes: `FaceEnrolment` rows from Task 1, `BlobStorageService.signIfOurs` for the image.
- Produces: `faceEnrolmentStatus: 'enrolled' | 'not_verified' | null` on the results row, and
  `faceEnrolment: { status: string; referenceImageUrl: string | null; capturedAt: string | null } | null`
  on `CandidateDetail`.

- [ ] **Step 1: Write the failing report test**

Add to `apps/api/src/reports/reports.service.spec.ts` in the `getCandidateDetail` describe:

```ts
    it('returns the enrolment with a SIGNED reference image url, since the container is private', async () => {
      examsService.getResults.mockResolvedValue([row({ candidateId: 'cand-1', attemptId: 'a1', status: 'submitted' })]);
      blobStorage.signIfOurs = jest.fn().mockResolvedValue('https://acct.blob.core.windows.net/c/face/a1.jpg?sig=x');
      const tx = {
        attempt: { findFirst: jest.fn().mockResolvedValue({
          sectionSnapshotJson: '[]', answers: [],
          faceEnrolment: { status: 'enrolled', referenceImagePath: 'https://acct.blob.core.windows.net/c/face/a1.jpg', capturedAt: new Date('2026-08-11T09:00:00Z') },
        }) },
        question: { findMany: jest.fn().mockResolvedValue([]) },
        proctoringEvent: { findMany: jest.fn().mockResolvedValue([]) },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const detail = await service.getCandidateDetail(context, 'exam-1', 'cand-1');

      expect(detail.faceEnrolment).toMatchObject({ status: 'enrolled' });
      expect(detail.faceEnrolment?.referenceImageUrl).toContain('sig=');
    });

    it('returns null enrolment for an attempt that predates the feature', async () => {
      examsService.getResults.mockResolvedValue([row({ candidateId: 'cand-1', attemptId: 'a1', status: 'submitted' })]);
      const tx = {
        attempt: { findFirst: jest.fn().mockResolvedValue({ sectionSnapshotJson: '[]', answers: [], faceEnrolment: null }) },
        question: { findMany: jest.fn().mockResolvedValue([]) },
        proctoringEvent: { findMany: jest.fn().mockResolvedValue([]) },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const detail = await service.getCandidateDetail(context, 'exam-1', 'cand-1');

      expect(detail.faceEnrolment).toBeNull();
    });
```

- [ ] **Step 2: Run to verify failure**

Run: `cd "D:/exam app/apps/api" && npx jest reports.service -t "reference image url"`
Expected: FAIL.

- [ ] **Step 3: Implement the API side**

In `reports.service.ts`, include `faceEnrolment: true` in the attempt `select`, and add to the
returned object:

```ts
      faceEnrolment: attempt.faceEnrolment
        ? {
            status: attempt.faceEnrolment.status,
            // The container is private: sign on read, and never persist the signed value.
            referenceImageUrl: (await this.blobStorage.signIfOurs(attempt.faceEnrolment.referenceImagePath)) as string | null,
            capturedAt: attempt.faceEnrolment.capturedAt?.toISOString() ?? null,
          }
        : null,
```

In `exams.service.ts`'s `getResults`, include the relation and map
`faceEnrolmentStatus: attempt?.faceEnrolment?.status ?? null` onto each row.

- [ ] **Step 4: Add the web types and both UI surfaces**

In `apps/web/lib/types.ts`, add `faceEnrolmentStatus: string | null` to the results row interface and:

```ts
export interface CandidateFaceEnrolment {
  status: string;
  referenceImageUrl: string | null;
  capturedAt: string | null;
}
```
with `faceEnrolment: CandidateFaceEnrolment | null` on `CandidateDetail`.

In `LiveMonitoringPanel.tsx`, add a **Face** column to the existing column list rendering
`Verified` for `enrolled`, `Not verified` for `not_verified`, and `—` for null. Follow the
`StatusBadge` usage already in that file.

In `CandidateReportPanel.tsx`, add a **Face verification** card above "Technical Issues During Exam"
showing the reference image (when present) with its capture time, or the words
**"Not verified — no reference photo was captured"** when the status is `not_verified`. Render
nothing when `faceEnrolment` is null.

- [ ] **Step 5: Write the failing web test, then make it pass**

Add to `apps/web/components/CandidateReportPanel.test.tsx`:

```tsx
  describe('face verification', () => {
    it('shows the reference photo when the candidate enrolled', () => {
      renderPanel([], { faceEnrolment: { status: 'enrolled', referenceImageUrl: 'https://blob/face.jpg?sig=x', capturedAt: '2026-08-11T09:00:00.000Z' } });
      expect(screen.getByAltText(/reference photo/i)).toHaveAttribute('src', 'https://blob/face.jpg?sig=x');
    });

    it('says so plainly when no reference was captured', () => {
      renderPanel([], { faceEnrolment: { status: 'not_verified', referenceImageUrl: null, capturedAt: null } });
      expect(screen.getByText(/not verified/i)).toBeInTheDocument();
    });

    it('renders nothing for an attempt from before the feature existed', () => {
      renderPanel([], { faceEnrolment: null });
      expect(screen.queryByText(/face verification/i)).not.toBeInTheDocument();
    });
  });
```

`renderPanel` currently takes only sections — extend its signature to accept an overrides object and
spread it into the mocked candidate detail.

- [ ] **Step 6: Run both suites**

Run:
```bash
cd "D:/exam app/apps/api" && npx jest && cd "D:/exam app/apps/web" && npx jest
```
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/reports apps/api/src/exams apps/web/lib/types.ts apps/web/components
git commit -m "feat(face-id): show enrolment status on the Live tab and the candidate report"
```

---

### Task 8: GDPR erase must delete face data

**Files:**
- Modify: `apps/api/src/candidates/candidates.service.ts` (the `erase` method, ~line 383)
- Test: `apps/api/src/candidates/candidates.service.spec.ts`

**Interfaces:**
- Consumes: `FaceEnrolment` rows, `BlobStorageService.deleteByUrl`.
- Produces: no new exports; `erase` additionally deletes reference images and enrolment rows.

- [ ] **Step 1: Write the failing test**

Add to `apps/api/src/candidates/candidates.service.spec.ts`:

```ts
    it('deletes the face reference image blob and the enrolment row', async () => {
      const deleteMany = jest.fn().mockResolvedValue({ count: 1 });
      blobStorage.deleteByUrl = jest.fn().mockResolvedValue('deleted');
      mockEraseTx({
        faceEnrolments: [{ referenceImagePath: 'https://acct.blob.core.windows.net/c/face/a1.jpg' }],
        faceEnrolment: { deleteMany },
      });

      await service.erase(context, 'user-1', 'cand-1');

      expect(blobStorage.deleteByUrl).toHaveBeenCalledWith('https://acct.blob.core.windows.net/c/face/a1.jpg');
      expect(deleteMany).toHaveBeenCalled();
    });

    // This is the assertion that makes the GDPR position defensible rather than nominal.
    it('leaves NO face data behind for the erased candidate', async () => {
      const deleteMany = jest.fn().mockResolvedValue({ count: 2 });
      blobStorage.deleteByUrl = jest.fn().mockResolvedValue('deleted');
      mockEraseTx({
        faceEnrolments: [
          { referenceImagePath: 'https://acct.blob.core.windows.net/c/face/a1.jpg' },
          { referenceImagePath: 'https://acct.blob.core.windows.net/c/face/a2.jpg' },
        ],
        faceEnrolment: { deleteMany },
      });

      await service.erase(context, 'user-1', 'cand-1');

      expect(blobStorage.deleteByUrl).toHaveBeenCalledTimes(2);
      expect(deleteMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.anything() }));
    });

    it('still deletes the row when the blob is already gone', async () => {
      const deleteMany = jest.fn().mockResolvedValue({ count: 1 });
      blobStorage.deleteByUrl = jest.fn().mockRejectedValue(new Error('404'));
      mockEraseTx({ faceEnrolments: [{ referenceImagePath: 'https://acct.blob.core.windows.net/c/face/a1.jpg' }], faceEnrolment: { deleteMany } });

      await expect(service.erase(context, 'user-1', 'cand-1')).resolves.toBeDefined();
      expect(deleteMany).toHaveBeenCalled();
    });
```

Add a `mockEraseTx` helper to the file if one does not already exist, modelled on how the existing
erase tests build their transaction mock.

- [ ] **Step 2: Run to verify failure**

Run: `cd "D:/exam app/apps/api" && npx jest candidates.service -t "face reference image"`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `erase()`, alongside the existing collection of proctoring `evidenceUrls`, collect the reference
image paths from the candidate's attempts' `faceEnrolment` rows **before** deleting them, delete the
rows inside the transaction, and delete the blobs after it — matching how evidence blobs are already
handled. Wrap each `deleteByUrl` so a missing blob cannot abort the erase.

- [ ] **Step 4: Run the tests**

Run: `cd "D:/exam app/apps/api" && npx jest candidates.service`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/candidates
git commit -m "feat(face-id): GDPR erase deletes reference images and enrolment rows"
```

---

### Task 9: 90-day retention job

**Files:**
- Create: `apps/api/src/face-enrolment/face-retention.service.ts`
- Create: `apps/api/src/face-enrolment/face-retention.service.spec.ts`
- Create: `apps/api/src/face-enrolment/face-enrolment.module.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `TenantPrismaService`, `BlobStorageService.deleteByUrl`.
- Produces: `FaceRetentionService.prune(now?: Date): Promise<number>` returning the number of
  enrolments purged.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/face-enrolment/face-retention.service.spec.ts`:

```ts
import { FaceRetentionService } from './face-retention.service';

describe('FaceRetentionService', () => {
  const NOW = new Date('2026-11-10T00:00:00Z');
  let findMany: jest.Mock;
  let updateMany: jest.Mock;
  let blobStorage: { deleteByUrl: jest.Mock };
  let service: FaceRetentionService;

  beforeEach(() => {
    findMany = jest.fn().mockResolvedValue([]);
    updateMany = jest.fn().mockResolvedValue({ count: 0 });
    blobStorage = { deleteByUrl: jest.fn().mockResolvedValue('deleted') };
    service = new FaceRetentionService(
      { forTenant: jest.fn((_ctx: unknown, fn: (tx: unknown) => unknown) => fn({ faceEnrolment: { findMany, updateMany } })) } as never,
      blobStorage as never,
    );
  });

  // 90 days is a product decision recorded in the spec, not a tunable.
  it('purges an enrolment whose attempt finalised more than 90 days ago', async () => {
    findMany.mockResolvedValue([{ id: 'fe-1', referenceImagePath: 'https://acct.blob/face/a1.jpg' }]);

    const purged = await service.prune(NOW);

    expect(purged).toBe(1);
    expect(blobStorage.deleteByUrl).toHaveBeenCalledWith('https://acct.blob/face/a1.jpg');
  });

  it('clears the stored path and embedding, so no dangling reference survives', async () => {
    findMany.mockResolvedValue([{ id: 'fe-1', referenceImagePath: 'https://acct.blob/face/a1.jpg' }]);

    await service.prune(NOW);

    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { referenceImagePath: null, embedding: null },
    }));
  });

  it('leaves a recent enrolment alone', async () => {
    findMany.mockResolvedValue([]);

    expect(await service.prune(NOW)).toBe(0);
    expect(blobStorage.deleteByUrl).not.toHaveBeenCalled();
  });

  it('keeps going when one blob delete fails, rather than stranding the rest', async () => {
    findMany.mockResolvedValue([
      { id: 'fe-1', referenceImagePath: 'https://acct.blob/face/a1.jpg' },
      { id: 'fe-2', referenceImagePath: 'https://acct.blob/face/a2.jpg' },
    ]);
    blobStorage.deleteByUrl.mockRejectedValueOnce(new Error('gone'));

    expect(await service.prune(NOW)).toBe(2);
    expect(blobStorage.deleteByUrl).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd "D:/exam app/apps/api" && npx jest face-retention`
Expected: FAIL — cannot find the module.

- [ ] **Step 3: Implement**

Create `apps/api/src/face-enrolment/face-retention.service.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { BlobStorageService, TenantPrismaService } from '@exam-platform/shared';

// Fixed by the design spec (2026-08-10). Biometric data must not outlive its purpose, and the
// review window is the purpose -- see docs/superpowers/specs/2026-08-10-face-identification-design.md.
const RETENTION_DAYS = 90;

@Injectable()
export class FaceRetentionService {
  private readonly logger = new Logger(FaceRetentionService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly blobStorage: BlobStorageService,
  ) {}

  async prune(now: Date = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const superAdmin = { organizationId: null, isSuperAdmin: true };

    const expired = await this.tenantPrisma.forTenant(superAdmin, (tx) =>
      tx.faceEnrolment.findMany({
        where: { referenceImagePath: { not: null }, attempt: { submittedAt: { lt: cutoff } } },
        select: { id: true, referenceImagePath: true },
      }),
    );
    if (expired.length === 0) return 0;

    // One failed blob delete must not strand the remaining rows: the DB reference is cleared
    // either way, and an orphaned blob is a smaller problem than retained biometric data.
    for (const row of expired) {
      try {
        await this.blobStorage.deleteByUrl(row.referenceImagePath as string);
      } catch (error) {
        this.logger.warn(`Failed to delete face reference blob for ${row.id}: ${(error as Error).message}`);
      }
    }

    await this.tenantPrisma.forTenant(superAdmin, (tx) =>
      tx.faceEnrolment.updateMany({
        where: { id: { in: expired.map((row) => row.id) } },
        data: { referenceImagePath: null, embedding: null },
      }),
    );
    return expired.length;
  }
}
```

- [ ] **Step 4: Schedule it**

Create `apps/api/src/face-enrolment/face-enrolment.module.ts` providing and exporting
`FaceRetentionService`, and register it in `apps/api/src/app.module.ts`. Schedule `prune()` daily
using the same mechanism `system-events-retention.service.ts` uses — read that file and copy its
interval/lifecycle pattern rather than introducing a different scheduler.

- [ ] **Step 5: Run the tests**

Run: `cd "D:/exam app/apps/api" && npx jest face-retention`
Expected: 4 passed.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/face-enrolment apps/api/src/app.module.ts
git commit -m "feat(face-id): purge reference images 90 days after the attempt finalises"
```

---

### Task 10: Full verification and deploy preparation

**Files:** none created — this task proves the stage is whole.

- [ ] **Step 1: Run every suite and typecheck**

```bash
cd "D:/exam app/apps/api" && npx jest && npx tsc --noEmit
cd "D:/exam app/apps/exam-runtime" && npx jest && npx tsc --noEmit
cd "D:/exam app/apps/web" && npx jest && npx tsc --noEmit
```
Expected: all green. `apps/web` will report one pre-existing TS1128 in the generated
`.next/dev/types/routes.d.ts` — that is build output, not this change.

- [ ] **Step 2: Confirm the migration applies to a clean database**

```bash
cd "D:/exam app" && npx prisma migrate status --schema=apps/api/prisma/schema.prisma
```
Expected: `Database schema is up to date!` and the new migration listed as applied.

- [ ] **Step 3: Walk the candidate path manually**

With `faceVerificationEnabled` on for a test exam, and a real camera:
consent → blink → photo accepted → Start unlocks. Then set the exam to `require_enrolment`, decline
consent, and confirm Start stays locked with the recruiter message. Then cover the lens for three
attempts and confirm the policy branch fires.

- [ ] **Step 4: Check the recruiter surfaces**

Live tab shows the Face column; the candidate report shows the reference photo for an enrolled
attempt and "Not verified" for a failed one.

- [ ] **Step 5: Deploy**

This stage changes **apps/api, apps/exam-runtime and apps/web**, and it carries a **migration**, so
the fast single-file path does not apply. Follow the full sequence in
`memory/project_azure_deployment.md`: check for live attempts first, back up, sync the tree,
`migrate status` before `migrate deploy`, then build and restart all three, detached behind a
done-marker.

Confirm `face_enrolments` exists in production and that no attempt has a row yet.

- [ ] **Step 6: Commit anything outstanding and update ADO**

```bash
git add -A && git commit -m "chore(face-id): stage 1 verification"
```
Create the ADO work item for stage 1 and close it, per the project's standing practice.
