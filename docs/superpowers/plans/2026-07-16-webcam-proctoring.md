# Webcam Proctoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add real-time webcam presence/attention checking that pauses the exam after a sustained violation (no face / head turned away), warns the candidate up to twice with self-resume, and hard-blocks on the third violation until a recruiter unblocks it — all detection running on-device in the browser, no video sent to any server.

**Architecture:** A client-side MediaPipe Face Landmarker samples the candidate's webcam a few times a second; a sustained (~3s) violation POSTs to a new exam-runtime endpoint that reuses the existing `ProctoringEvent` table and centralizes the pause/block state machine in `AttemptSettlementService` (the same service that already owns every other Attempt status transition). The exam's countdown timer is made pause-aware by pinning "now" to the pause timestamp while paused/blocked. Recruiter unblock reuses the existing `apps/api` → `ExamRuntimeInternalClient` → `apps/exam-runtime` internal-controller proxy pattern (same plumbing as force-submit).

**Tech Stack:** NestJS (`apps/exam-runtime`, `apps/api`), Prisma/SQL Server, Next.js/React + `@tanstack/react-query` (`apps/web`), Jest/Supertest/React Testing Library/Playwright, `@mediapipe/tasks-vision` (new dependency, client-side only).

## Global Constraints

- Candidate-facing routes are session-derived, no `:attemptId` in the URL — matches `attempt.controller.ts`'s existing convention (`/attempt/proctoring-event`, `/attempt/run-code`, etc.), not the design spec's original `POST /attempts/:attemptId/...` shape.
- Migrations are hand-written SQL applied with `npx prisma migrate deploy` (never `migrate dev`, never `db push`) — this environment has no shadow database. See `apps/api/prisma/migrations/20260716120000_add_code_run_execution_allow_stdin/migration.sql` for the exact style to match.
- All `Attempt.status` transitions are centralized in `AttemptSettlementService` — new pause/block/resume logic goes there too, not scattered across `AttemptService`/`InternalController`.
- Webcam violations reuse the existing `ProctoringEvent` table (new `eventType` values `webcam_no_face`, `webcam_head_turned`) — no new table.
- No video frame or continuous stream ever leaves the candidate's browser — only a single base64 snapshot per violation, sent once a violation is confirmed.
- Required DTO properties use definite-assignment assertion (`field!: string`), matching every existing DTO in `apps/exam-runtime/src/attempts/dto/`.

---

## Task 1: Data Model — Attempt pause/block fields

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (`Attempt` model, lines 281-304)
- Create: `apps/api/prisma/migrations/20260716210000_webcam_proctoring/migration.sql`

**Interfaces:**
- Produces: `Attempt.webcamViolationCount: number`, `Attempt.pausedAt: Date | null`, `Attempt.pausedDurationMs: number` — consumed by Tasks 2-5.

- [ ] **Step 1: Add the three new fields to the `Attempt` model**

In `apps/api/prisma/schema.prisma`, find the `Attempt` model and add three fields right after `lastSeenAt`:

```prisma
model Attempt {
  id                  String              @id @default(uuid()) @db.UniqueIdentifier
  invitationId        String              @unique @map("invitation_id") @db.UniqueIdentifier
  candidateId         String              @map("candidate_id") @db.UniqueIdentifier
  examId              String              @map("exam_id") @db.UniqueIdentifier
  status              String              @default("in_progress")
  questionOrderJson   String              @map("question_order_json") @db.NVarChar(Max)
  sectionSnapshotJson String              @map("section_snapshot_json") @db.NVarChar(Max)
  optionOrderJson     String?             @map("option_order_json") @db.NVarChar(Max)
  startedAt           DateTime            @default(now()) @map("started_at")
  submittedAt         DateTime?           @map("submitted_at")
  deviceFingerprint   String?             @map("device_fingerprint")
  lastSeenAt          DateTime?           @map("last_seen_at")
  webcamViolationCount Int                @default(0) @map("webcam_violation_count")
  pausedAt            DateTime?           @map("paused_at")
  pausedDurationMs    Int                 @default(0) @map("paused_duration_ms")
  invitation          Invitation          @relation(fields: [invitationId], references: [id], onDelete: Cascade)
  answers             Answer[]
  result              Result?
  proctoringEvents    ProctoringEvent[]
  messages            CandidateMessage[]
  proctoringAnalysis  ProctoringAnalysis?
  insight             AttemptInsight?

  @@index([examId, status])
  @@map("attempts")
}
```

- [ ] **Step 2: Write the migration SQL**

Create `apps/api/prisma/migrations/20260716210000_webcam_proctoring/migration.sql`:

```sql
ALTER TABLE [dbo].[attempts] ADD [webcam_violation_count] INT NOT NULL CONSTRAINT [attempts_webcam_violation_count_default] DEFAULT 0;
ALTER TABLE [dbo].[attempts] ADD [paused_at] DATETIME2;
ALTER TABLE [dbo].[attempts] ADD [paused_duration_ms] INT NOT NULL CONSTRAINT [attempts_paused_duration_ms_default] DEFAULT 0;
```

- [ ] **Step 3: Apply the migration and regenerate the client**

Run from `apps/api`:
```bash
npx prisma migrate deploy
npx prisma generate
```
Expected: both commands exit 0; `npx prisma migrate status` shows no pending migrations.

- [ ] **Step 4: Verify the `audit_logs` FK didn't drift (known environment quirk)**

Run:
```bash
npx prisma db execute --stdin <<< "SELECT delete_referential_action_desc FROM sys.foreign_keys WHERE name = 'audit_logs_actor_user_id_fkey';"
```
Expected output contains `SET_NULL`. If it shows `NO_ACTION` instead, re-apply `apps/api/prisma/migrations/20260715210000_fix_audit_log_actor_fk_set_null/migration.sql`'s two `ALTER TABLE` statements by hand before continuing — this is a known local-environment drift unrelated to this feature, documented in the Code Run Execution plan.

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260716210000_webcam_proctoring
git commit -m "feat: add Attempt pause/block fields for webcam proctoring"
```

---

## Task 2: Pause-aware remaining-seconds computation

**Files:**
- Modify: `apps/exam-runtime/src/grading/grading.ts:46-49`
- Modify: `apps/exam-runtime/src/grading/grading.spec.ts`
- Modify: `apps/exam-runtime/src/grading/attempt-settlement.service.ts:25-27`

**Interfaces:**
- Produces: `computeRemainingSeconds(durationMinutes, startedAt, pausedDurationMs?, frozenAt?): number` and `AttemptSettlementService.remainingSeconds(exam, attempt)` now accepting an attempt with `pausedDurationMs`/`pausedAt`/`status` — consumed by Task 3 (`registerWebcamViolation`/`resumeFromPause`) and already-existing callers in `attempt.service.ts`.

- [ ] **Step 1: Write failing tests for the new `computeRemainingSeconds` behavior**

In `apps/exam-runtime/src/grading/grading.spec.ts`, extend the `describe('computeRemainingSeconds', ...)` block (after the existing two `it`s):

```ts
  it('extends the deadline by pausedDurationMs', () => {
    const startedAt = new Date(Date.now() - 40 * 60_000); // 40 min ago, on a 30-min exam — would be expired
    const seconds = computeRemainingSeconds(30, startedAt, 15 * 60_000); // but 15 min of pause time is credited back
    expect(seconds).toBeGreaterThan(0);
    expect(seconds).toBeLessThanOrEqual(5 * 60);
  });

  it('freezes at the value computed at frozenAt, ignoring the real current time', () => {
    const startedAt = new Date(Date.now() - 10 * 60_000);
    const frozenAt = new Date(Date.now() - 5 * 60_000); // pause began 5 min ago
    const seconds = computeRemainingSeconds(30, startedAt, 0, frozenAt);
    // Same call a moment "later" (real Date.now() has advanced) must return the identical value.
    const secondsAgain = computeRemainingSeconds(30, startedAt, 0, frozenAt);
    expect(seconds).toBe(secondsAgain);
    expect(seconds).toBe(25 * 60); // 30 min duration - 5 min elapsed at the moment it froze
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/exam-runtime && npx jest grading.spec.ts -t "computeRemainingSeconds"`
Expected: FAIL — `computeRemainingSeconds` only accepts 2 arguments today, extra args are silently ignored and both new assertions fail (the pause-credit test still returns 0, the freeze test returns two different decreasing values).

- [ ] **Step 3: Update `computeRemainingSeconds`**

In `apps/exam-runtime/src/grading/grading.ts`, replace lines 46-49:

```ts
export function computeRemainingSeconds(
  durationMinutes: number,
  startedAt: Date,
  pausedDurationMs = 0,
  frozenAt: Date | null = null,
): number {
  const deadline = new Date(startedAt).getTime() + durationMinutes * 60_000 + pausedDurationMs;
  const now = frozenAt ? frozenAt.getTime() : Date.now();
  return Math.max(0, Math.round((deadline - now) / 1000));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/exam-runtime && npx jest grading.spec.ts`
Expected: PASS, all tests in the file green.

- [ ] **Step 5: Update `AttemptSettlementService.remainingSeconds` to pass pause state through**

In `apps/exam-runtime/src/grading/attempt-settlement.service.ts`, replace lines 25-27:

```ts
  remainingSeconds(
    exam: Pick<SettlementExam, 'durationMinutes'>,
    attempt: { startedAt: Date; pausedDurationMs: number; pausedAt: Date | null; status: string },
  ): number {
    const frozenAt = attempt.status === 'paused' || attempt.status === 'blocked' ? attempt.pausedAt : null;
    return computeRemainingSeconds(exam.durationMinutes, attempt.startedAt, attempt.pausedDurationMs, frozenAt);
  }
```

No other call sites need changes: `attempt.service.ts`'s `getCurrent()` already passes the full Prisma `Attempt` object, which now has `pausedDurationMs`/`pausedAt`/`status` after Task 1's migration + `prisma generate`.

- [ ] **Step 6: Run the full exam-runtime unit suite**

Run: `cd apps/exam-runtime && npx jest`
Expected: PASS — this is a compile-time-compatible signature widening (new fields, existing shape still valid where `Attempt` is passed), so no other spec files should break. If `attempt-settlement.service.spec.ts` has a hand-built mock attempt object missing the new fields, add `pausedDurationMs: 0, pausedAt: null` to that mock's fixture.

- [ ] **Step 7: Commit**

```bash
git add apps/exam-runtime/src/grading/grading.ts apps/exam-runtime/src/grading/grading.spec.ts apps/exam-runtime/src/grading/attempt-settlement.service.ts
git commit -m "feat: make remaining-seconds computation pause-aware"
```

---

## Task 3: AttemptSettlementService — violation and resume transitions

**Files:**
- Modify: `apps/exam-runtime/src/grading/attempt-settlement.service.ts`
- Modify: `apps/exam-runtime/src/grading/attempt-settlement.service.spec.ts`
- Create: `apps/exam-runtime/src/attempts/dto/webcam-violation.dto.ts`

**Interfaces:**
- Consumes: `ATTEMPT_STATUS_BROADCASTER` (`this.broadcaster.emitAttemptStatus`, already injected).
- Produces: `AttemptSettlementService.registerWebcamViolation(tx, attempt, reason, snapshot): Promise<{ attempt: Attempt; strike: number }>` and `AttemptSettlementService.resumeFromPause(tx, attempt): Promise<Attempt>` — consumed by Task 4 (`AttemptService`) and Task 5 (`InternalController`).

- [ ] **Step 1: Create the violation reason DTO**

Create `apps/exam-runtime/src/attempts/dto/webcam-violation.dto.ts`:

```ts
import { IsIn, IsString } from 'class-validator';

export const WEBCAM_VIOLATION_REASONS = ['no_face', 'head_turned'] as const;
export type WebcamViolationReason = (typeof WEBCAM_VIOLATION_REASONS)[number];

export class WebcamViolationDto {
  @IsIn(WEBCAM_VIOLATION_REASONS)
  reason!: WebcamViolationReason;

  @IsString()
  snapshot!: string;
}
```

- [ ] **Step 2: Write failing tests for `registerWebcamViolation` and `resumeFromPause`**

In `apps/exam-runtime/src/grading/attempt-settlement.service.spec.ts`, add (adjust the existing mock-`tx`/broadcaster setup variable names to match whatever this file already uses for its `beforeEach`):

```ts
  describe('registerWebcamViolation', () => {
    it('pauses the attempt and logs a medium-severity event on strike 1', async () => {
      const attempt = { id: 'attempt-1', examId: 'exam-1', candidateId: 'cand-1', webcamViolationCount: 0 } as any;
      const tx = {
        proctoringEvent: { create: jest.fn().mockResolvedValue({}) },
        attempt: { update: jest.fn().mockResolvedValue({ ...attempt, status: 'paused', webcamViolationCount: 1 }) },
      } as any;

      const { attempt: updated, strike } = await service.registerWebcamViolation(tx, attempt, 'no_face', 'data:image/jpeg;base64,abc');

      expect(strike).toBe(1);
      expect(updated.status).toBe('paused');
      expect(tx.proctoringEvent.create).toHaveBeenCalledWith({
        data: { attemptId: 'attempt-1', eventType: 'webcam_no_face', severity: 'medium', metadataJson: JSON.stringify({ snapshot: 'data:image/jpeg;base64,abc', strike: 1 }) },
      });
      expect(tx.attempt.update).toHaveBeenCalledWith({
        where: { id: 'attempt-1' },
        data: { webcamViolationCount: 1, status: 'paused', pausedAt: expect.any(Date) },
      });
    });

    it('blocks the attempt with high severity on strike 3', async () => {
      const attempt = { id: 'attempt-1', examId: 'exam-1', candidateId: 'cand-1', webcamViolationCount: 2 } as any;
      const tx = {
        proctoringEvent: { create: jest.fn().mockResolvedValue({}) },
        attempt: { update: jest.fn().mockResolvedValue({ ...attempt, status: 'blocked', webcamViolationCount: 3 }) },
      } as any;

      const { attempt: updated, strike } = await service.registerWebcamViolation(tx, attempt, 'head_turned', 'snap');

      expect(strike).toBe(3);
      expect(updated.status).toBe('blocked');
      expect(tx.proctoringEvent.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ eventType: 'webcam_head_turned', severity: 'high' }) }));
      expect(tx.attempt.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'blocked' }) }));
    });
  });

  describe('resumeFromPause', () => {
    it('accumulates the elapsed pause time into pausedDurationMs and clears pausedAt', async () => {
      const pausedAt = new Date(Date.now() - 10_000); // paused 10s ago
      const attempt = { id: 'attempt-1', examId: 'exam-1', candidateId: 'cand-1', pausedAt, pausedDurationMs: 5_000 } as any;
      const tx = { attempt: { update: jest.fn().mockResolvedValue({ ...attempt, status: 'in_progress', pausedAt: null, pausedDurationMs: 15_000 }) } } as any;

      const updated = await service.resumeFromPause(tx, attempt);

      expect(updated.status).toBe('in_progress');
      const call = tx.attempt.update.mock.calls[0][0];
      expect(call.where).toEqual({ id: 'attempt-1' });
      expect(call.data.status).toBe('in_progress');
      expect(call.data.pausedAt).toBeNull();
      expect(call.data.pausedDurationMs).toBeGreaterThanOrEqual(5_000 + 9_000); // >= previous 5s + ~10s just elapsed, with slack
    });
  });
```

- [ ] **Step 3: Run to verify failure**

Run: `cd apps/exam-runtime && npx jest attempt-settlement.service.spec.ts -t "registerWebcamViolation|resumeFromPause"`
Expected: FAIL with `service.registerWebcamViolation is not a function` / `service.resumeFromPause is not a function`.

- [ ] **Step 4: Implement both methods**

In `apps/exam-runtime/src/grading/attempt-settlement.service.ts`, add the import and two new methods (place them after `finalizeManualGrade`, before the closing class brace):

```ts
import { WebcamViolationReason } from '../attempts/dto/webcam-violation.dto';
```

```ts
  async registerWebcamViolation(
    tx: Prisma.TransactionClient,
    attempt: Attempt,
    reason: WebcamViolationReason,
    snapshot: string,
  ): Promise<{ attempt: Attempt; strike: number }> {
    const strike = attempt.webcamViolationCount + 1;
    const eventType = reason === 'no_face' ? 'webcam_no_face' : 'webcam_head_turned';
    await tx.proctoringEvent.create({
      data: {
        attemptId: attempt.id,
        eventType,
        severity: strike >= 3 ? 'high' : 'medium',
        metadataJson: JSON.stringify({ snapshot, strike }),
      },
    });
    const status = strike >= 3 ? 'blocked' : 'paused';
    const updated = await tx.attempt.update({
      where: { id: attempt.id },
      data: { webcamViolationCount: strike, status, pausedAt: new Date() },
    });
    void this.broadcaster
      .emitAttemptStatus(attempt.examId, { attemptId: updated.id, candidateId: attempt.candidateId, status: updated.status })
      .catch((error) => this.logger.error('Failed to broadcast attempt status', error as Error));
    return { attempt: updated, strike };
  }

  async resumeFromPause(tx: Prisma.TransactionClient, attempt: Attempt): Promise<Attempt> {
    const elapsedMs = attempt.pausedAt ? Date.now() - attempt.pausedAt.getTime() : 0;
    const updated = await tx.attempt.update({
      where: { id: attempt.id },
      data: { status: 'in_progress', pausedAt: null, pausedDurationMs: attempt.pausedDurationMs + elapsedMs },
    });
    void this.broadcaster
      .emitAttemptStatus(attempt.examId, { attemptId: updated.id, candidateId: attempt.candidateId, status: updated.status })
      .catch((error) => this.logger.error('Failed to broadcast attempt status', error as Error));
    return updated;
  }
```

- [ ] **Step 5: Run to verify pass**

Run: `cd apps/exam-runtime && npx jest attempt-settlement.service.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/exam-runtime/src/grading/attempt-settlement.service.ts apps/exam-runtime/src/grading/attempt-settlement.service.spec.ts apps/exam-runtime/src/attempts/dto/webcam-violation.dto.ts
git commit -m "feat: add webcam violation and resume-from-pause transitions"
```

---

## Task 4: Candidate endpoints — report violation, self-resume

**Files:**
- Modify: `apps/exam-runtime/src/attempts/attempt.service.ts`
- Modify: `apps/exam-runtime/src/attempts/attempt.controller.ts`
- Modify: `apps/exam-runtime/src/attempts/attempt.service.spec.ts`

**Interfaces:**
- Consumes: `AttemptSettlementService.registerWebcamViolation`/`resumeFromPause` (Task 3).
- Produces: `POST /attempt/webcam-violation` → `{ strike: number; status: string }`, `POST /attempt/webcam-resume` → `{ status: string }` — consumed by Task 6's frontend hooks. Also widens `AttemptStateResponse` with `webcamViolationCount: number` — consumed by Task 8's paused overlay.

- [ ] **Step 1: Write failing service tests**

In `apps/exam-runtime/src/attempts/attempt.service.spec.ts`, add a new `describe` block (reuse the file's existing `mockBootstrapThenScoped` helper and `session`/`exam`/`invitationRecord` fixtures from the top of the file):

```ts
  describe('webcamViolation', () => {
    it('throws BadRequestException when the attempt is not in_progress', async () => {
      const tx = { attempt: { findUnique: jest.fn().mockResolvedValue({ id: 'attempt-1', status: 'blocked' }) } };
      mockBootstrapThenScoped(tx);

      await expect(service.webcamViolation(session, { reason: 'no_face', snapshot: 'x' })).rejects.toThrow(BadRequestException);
    });

    it('delegates to AttemptSettlementService.registerWebcamViolation and returns strike/status', async () => {
      const attempt = { id: 'attempt-1', status: 'in_progress', webcamViolationCount: 0 };
      const tx = { attempt: { findUnique: jest.fn().mockResolvedValue(attempt) } };
      mockBootstrapThenScoped(tx);
      settlement.registerWebcamViolation = jest.fn().mockResolvedValue({ attempt: { ...attempt, status: 'paused', webcamViolationCount: 1 }, strike: 1 });

      const result = await service.webcamViolation(session, { reason: 'no_face', snapshot: 'x' });

      expect(result).toEqual({ strike: 1, status: 'paused' });
      expect(settlement.registerWebcamViolation).toHaveBeenCalledWith(tx, attempt, 'no_face', 'x');
    });
  });

  describe('webcamResume', () => {
    it('throws BadRequestException when the attempt is not paused', async () => {
      const tx = { attempt: { findUnique: jest.fn().mockResolvedValue({ id: 'attempt-1', status: 'blocked' }) } };
      mockBootstrapThenScoped(tx);

      await expect(service.webcamResume(session)).rejects.toThrow(BadRequestException);
    });

    it('delegates to AttemptSettlementService.resumeFromPause and returns the new status', async () => {
      const attempt = { id: 'attempt-1', status: 'paused' };
      const tx = { attempt: { findUnique: jest.fn().mockResolvedValue(attempt) } };
      mockBootstrapThenScoped(tx);
      settlement.resumeFromPause = jest.fn().mockResolvedValue({ ...attempt, status: 'in_progress' });

      const result = await service.webcamResume(session);

      expect(result).toEqual({ status: 'in_progress' });
      expect(settlement.resumeFromPause).toHaveBeenCalledWith(tx, attempt);
    });
  });
```

Also add `registerWebcamViolation: jest.fn(), resumeFromPause: jest.fn()` to the `settlement` mock object's type/initialization in this file's `beforeEach` (alongside the existing `settleIfExpired`/`finalize`/`remainingSeconds` mocks).

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/exam-runtime && npx jest attempt.service.spec.ts -t "webcamViolation|webcamResume"`
Expected: FAIL — `service.webcamViolation is not a function` / `service.webcamResume is not a function`.

- [ ] **Step 3: Implement the service methods**

In `apps/exam-runtime/src/attempts/attempt.service.ts`:

Add the import near the top (with the other DTO imports):
```ts
import { WebcamViolationDto } from './dto/webcam-violation.dto';
```

Widen `AttemptStateResponse` (around line 71-77):
```ts
interface AttemptStateResponse {
  status: string;
  remainingSeconds: number;
  webcamViolationCount: number;
  sections: AttemptSection[];
  answers: AttemptAnswerSummary[];
  messages: AttemptMessageSummary[];
}
```

In `getCurrent()`, add `webcamViolationCount: settled.webcamViolationCount,` to the returned object (right after the `remainingSeconds` line, around line 121).

Add two new methods after `reportProctoringEvent` (around line 367, before `submit`):
```ts
  async webcamViolation(session: CandidateSession, dto: WebcamViolationDto): Promise<{ strike: number; status: string }> {
    const { organizationId, invitation } = await this.resolveContext(session.invitationId);

    return this.tenantPrisma.forTenant({ organizationId, isSuperAdmin: false }, async (tx) => {
      const attempt = await tx.attempt.findUnique({ where: { invitationId: invitation.id } });
      if (!attempt) {
        throw new NotFoundException('No attempt has been started');
      }
      if (attempt.status !== 'in_progress') {
        throw new BadRequestException(`Cannot report a webcam violation — attempt status is "${attempt.status}"`);
      }
      const { attempt: updated, strike } = await this.attemptSettlement.registerWebcamViolation(tx, attempt, dto.reason, dto.snapshot);
      return { strike, status: updated.status };
    });
  }

  async webcamResume(session: CandidateSession): Promise<{ status: string }> {
    const { organizationId, invitation } = await this.resolveContext(session.invitationId);

    return this.tenantPrisma.forTenant({ organizationId, isSuperAdmin: false }, async (tx) => {
      const attempt = await tx.attempt.findUnique({ where: { invitationId: invitation.id } });
      if (!attempt) {
        throw new NotFoundException('No attempt has been started');
      }
      if (attempt.status !== 'paused') {
        throw new BadRequestException(`Cannot resume — attempt status is "${attempt.status}"`);
      }
      const updated = await this.attemptSettlement.resumeFromPause(tx, attempt);
      return { status: updated.status };
    });
  }
```

- [ ] **Step 4: Run to verify pass**

Run: `cd apps/exam-runtime && npx jest attempt.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Add the controller endpoints**

In `apps/exam-runtime/src/attempts/attempt.controller.ts`, add the import:
```ts
import { WebcamViolationDto } from './dto/webcam-violation.dto';
```

Add two new methods after `reportProctoringEvent` (before `runCode`):
```ts
  @Post('webcam-violation')
  @Throttle(MODERATE_ATTEMPT_THROTTLE)
  webcamViolation(@CurrentCandidate() candidate: CandidateSession, @Body() dto: WebcamViolationDto) {
    return this.attemptService.webcamViolation(candidate, dto);
  }

  @Post('webcam-resume')
  @Throttle(MODERATE_ATTEMPT_THROTTLE)
  webcamResume(@CurrentCandidate() candidate: CandidateSession) {
    return this.attemptService.webcamResume(candidate);
  }
```

- [ ] **Step 6: Run the full exam-runtime suite**

Run: `cd apps/exam-runtime && npx jest`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/exam-runtime/src/attempts/attempt.service.ts apps/exam-runtime/src/attempts/attempt.controller.ts apps/exam-runtime/src/attempts/attempt.service.spec.ts
git commit -m "feat: add webcam-violation and webcam-resume candidate endpoints"
```

---

## Task 5: Recruiter unblock

**Files:**
- Modify: `apps/exam-runtime/src/internal/internal.controller.ts`
- Modify: `apps/exam-runtime/src/internal/internal.controller.spec.ts`
- Modify: `apps/api/src/exam-runtime-client/exam-runtime-internal.client.ts`
- Modify: `apps/api/src/exam-runtime-client/exam-runtime-internal.client.spec.ts`
- Modify: `apps/api/src/attempts-admin/attempts-admin.service.ts`
- Modify: `apps/api/src/attempts-admin/attempts-admin.controller.ts`
- Modify: `apps/api/src/attempts-admin/attempts-admin.service.spec.ts`

**Interfaces:**
- Consumes: `AttemptSettlementService.resumeFromPause` (Task 3), `TenantPrismaService`, `ExamRuntimeInternalClient`, `AuditService` (all already injected in their respective classes).
- Produces: `POST /attempts/:id/unblock` (apps/api, recruiter-facing, `exam:manage` permission) → `{ status: string }` — consumed by Task 9's frontend hook.

- [ ] **Step 1: Add the internal exam-runtime endpoint**

In `apps/exam-runtime/src/internal/internal.controller.ts`, add a new method after `forceSubmit` (before `gradeCodeAnswer`):
```ts
  @Post('attempts/:id/unblock')
  async unblock(@Param('id') id: string) {
    const updated = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, async (tx) => {
      const attempt = await tx.attempt.findUnique({ where: { id } });
      if (!attempt) {
        throw new NotFoundException(`Attempt ${id} not found`);
      }
      if (attempt.status !== 'blocked') {
        throw new BadRequestException(`Attempt ${id} cannot be unblocked from status "${attempt.status}"`);
      }
      return this.attemptSettlement.resumeFromPause(tx, attempt);
    });
    return { status: updated.status };
  }
```

- [ ] **Step 2: Write a failing test for it**

In `apps/exam-runtime/src/internal/internal.controller.spec.ts`, find the `describe('forceSubmit', ...)` block for the existing mock-setup pattern and add a sibling block:
```ts
  describe('unblock', () => {
    it('throws BadRequestException when the attempt is not blocked', async () => {
      tenantPrisma.forTenant.mockImplementationOnce((_ctx, fn) => fn({ attempt: { findUnique: jest.fn().mockResolvedValue({ id: 'attempt-1', status: 'in_progress' }) } }));

      await expect(controller.unblock('attempt-1')).rejects.toThrow(BadRequestException);
    });

    it('resumes a blocked attempt via AttemptSettlementService.resumeFromPause', async () => {
      const attempt = { id: 'attempt-1', status: 'blocked' };
      tenantPrisma.forTenant.mockImplementationOnce((_ctx, fn) => fn({ attempt: { findUnique: jest.fn().mockResolvedValue(attempt) } }));
      attemptSettlement.resumeFromPause = jest.fn().mockResolvedValue({ ...attempt, status: 'in_progress' });

      const result = await controller.unblock('attempt-1');

      expect(result).toEqual({ status: 'in_progress' });
    });
  });
```
(Match the exact mock variable names — `tenantPrisma`, `attemptSettlement` — to whatever this spec file's existing `beforeEach` already declares; add `resumeFromPause: jest.fn()` to the `attemptSettlement` mock object alongside its existing `finalize` mock.)

- [ ] **Step 3: Run to verify, then implement — run the whole file**

Run: `cd apps/exam-runtime && npx jest internal.controller.spec.ts`
Expected: first FAIL (`controller.unblock is not a function`), then PASS once Step 1's code is in place (it already is, from Step 1 — this step is confirming both together).

- [ ] **Step 4: Add the client method**

In `apps/api/src/exam-runtime-client/exam-runtime-internal.client.ts`, add the `ForceSubmitResult`-shaped interface reuse and a new method after `forceSubmit`:
```ts
  async unblock(attemptId: string): Promise<{ status: string }> {
    const response = await this.fetchWithTimeout(`${this.baseUrl()}/api/v1/internal/attempts/${attemptId}/unblock`, {
      method: 'POST',
      headers: this.headers(),
    });
    await this.throwIfNotOk(response);
    return response.json();
  }
```

- [ ] **Step 5: Write a failing test for the client method**

In `apps/api/src/exam-runtime-client/exam-runtime-internal.client.spec.ts`, find the `describe('forceSubmit', ...)` block for the fetch-mocking pattern this file already uses, and add:
```ts
  describe('unblock', () => {
    it('POSTs to the internal unblock endpoint and returns the status', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'in_progress' }) });

      const result = await client.unblock('attempt-1');

      expect(result).toEqual({ status: 'in_progress' });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/internal/attempts/attempt-1/unblock'),
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });
```
(Match the exact `mockFetch`/`client` variable names to this file's existing setup.)

- [ ] **Step 6: Run to verify pass**

Run: `cd apps/api && npx jest exam-runtime-internal.client.spec.ts`
Expected: PASS.

- [ ] **Step 7: Add the attempts-admin service method**

In `apps/api/src/attempts-admin/attempts-admin.service.ts`, add after `forceSubmit`:
```ts
  async unblock(context: TenantContext, attemptId: string, actorUserId: string): Promise<{ status: string }> {
    await this.requireOwnedAttempt(context, attemptId);

    const result = await this.examRuntime.unblock(attemptId);

    await this.audit.record(context, {
      actorUserId,
      action: 'attempt.unblock',
      entityType: 'attempt',
      entityId: attemptId,
    });

    return result;
  }
```

- [ ] **Step 8: Write a failing test for it**

In `apps/api/src/attempts-admin/attempts-admin.service.spec.ts`, mirror the existing `describe('forceSubmit', ...)` block's mock setup and add:
```ts
  describe('unblock', () => {
    it('proxies to examRuntime.unblock and records an audit entry', async () => {
      tenantPrisma.forTenant.mockResolvedValueOnce({ id: 'attempt-1' }); // requireOwnedAttempt's lookup
      examRuntime.unblock = jest.fn().mockResolvedValue({ status: 'in_progress' });

      const result = await service.unblock(context, 'attempt-1', 'user-1');

      expect(result).toEqual({ status: 'in_progress' });
      expect(examRuntime.unblock).toHaveBeenCalledWith('attempt-1');
      expect(audit.record).toHaveBeenCalledWith(context, {
        actorUserId: 'user-1',
        action: 'attempt.unblock',
        entityType: 'attempt',
        entityId: 'attempt-1',
      });
    });
  });
```
(Match `tenantPrisma`/`examRuntime`/`audit`/`context`/`service` to this file's existing fixture names — `requireOwnedAttempt` internally calls `tenantPrisma.forTenant` with a callback that resolves the attempt, so mock accordingly the same way the existing `forceSubmit` test does.)

- [ ] **Step 9: Run to verify pass**

Run: `cd apps/api && npx jest attempts-admin.service.spec.ts`
Expected: PASS.

- [ ] **Step 10: Add the controller endpoint**

In `apps/api/src/attempts-admin/attempts-admin.controller.ts`, add after `forceSubmit`:
```ts
  @Post(':id/unblock')
  @RequirePermissions('exam:manage')
  unblock(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Param('id') id: string) {
    return this.attemptsAdminService.unblock(tenant, id, userId);
  }
```

- [ ] **Step 11: Run the full apps/api and apps/exam-runtime unit suites**

Run: `cd apps/exam-runtime && npx jest && cd ../api && npx jest`
Expected: PASS.

- [ ] **Step 12: Commit**

```bash
git add apps/exam-runtime/src/internal/internal.controller.ts apps/exam-runtime/src/internal/internal.controller.spec.ts apps/api/src/exam-runtime-client/exam-runtime-internal.client.ts apps/api/src/exam-runtime-client/exam-runtime-internal.client.spec.ts apps/api/src/attempts-admin/attempts-admin.service.ts apps/api/src/attempts-admin/attempts-admin.controller.ts apps/api/src/attempts-admin/attempts-admin.service.spec.ts
git commit -m "feat: add recruiter unblock endpoint for blocked attempts"
```

---

## Task 6: Frontend detection — `useWebcamMonitor` hook

**Files:**
- Create: `apps/web/lib/webcam-detection.ts`
- Create: `apps/web/lib/webcam-detection.test.ts`
- Create: `apps/web/lib/hooks/useWebcamMonitor.ts`
- Create: `apps/web/lib/hooks/useWebcamMonitor.test.tsx`
- Modify: `apps/web/lib/hooks/useAttempt.ts`
- Modify: `apps/web/package.json`

**Interfaces:**
- Produces: `detectViolationReason(result): 'no_face' | 'head_turned' | null`, `useWebcamMonitor(enabled: boolean): void`, `useReportWebcamViolation()`, `useWebcamResume()` — consumed by Task 8 (exam page).

- [ ] **Step 1: Install the detection library**

Run: `cd apps/web && npm install @mediapipe/tasks-vision@0.10.14`
Expected: `apps/web/package.json` gains `"@mediapipe/tasks-vision": "0.10.14"` under `dependencies`.

- [ ] **Step 2: Write a failing test for the pure detection function**

Create `apps/web/lib/webcam-detection.test.ts`:
```ts
import { detectViolationReason } from './webcam-detection';

describe('detectViolationReason', () => {
  it('returns no_face when no face landmarks are present', () => {
    expect(detectViolationReason({ faceLandmarks: [], facialTransformationMatrixes: [] })).toBe('no_face');
  });

  it('returns null when a face is present and facing forward', () => {
    // Identity-like rotation: matrix[8] = 0 (sin yaw), matrix[10] = 1 (cos yaw) -> yaw = 0deg
    const data = new Float32Array(16);
    data[10] = 1;
    expect(detectViolationReason({ faceLandmarks: [[{ x: 0, y: 0, z: 0 }]], facialTransformationMatrixes: [{ data }] })).toBeNull();
  });

  it('returns head_turned when yaw exceeds the threshold', () => {
    // 90 degree yaw: matrix[8] = -sin(90deg) = -1, matrix[10] = cos(90deg) = 0
    const data = new Float32Array(16);
    data[8] = -1;
    data[10] = 0;
    expect(detectViolationReason({ faceLandmarks: [[{ x: 0, y: 0, z: 0 }]], facialTransformationMatrixes: [{ data }] })).toBe('head_turned');
  });

  it('returns null when no transformation matrix is available yet', () => {
    expect(detectViolationReason({ faceLandmarks: [[{ x: 0, y: 0, z: 0 }]], facialTransformationMatrixes: [] })).toBeNull();
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `cd apps/web && npx jest webcam-detection.test.ts`
Expected: FAIL — `Cannot find module './webcam-detection'`.

- [ ] **Step 4: Implement the pure detection function**

Create `apps/web/lib/webcam-detection.ts`:
```ts
export const HEAD_TURN_THRESHOLD_DEGREES = 30;

export type ViolationReason = 'no_face' | 'head_turned';

interface FaceLandmarkerResult {
  faceLandmarks: unknown[];
  facialTransformationMatrixes?: { data: Float32Array | number[] }[];
}

export function detectViolationReason(result: FaceLandmarkerResult): ViolationReason | null {
  if (result.faceLandmarks.length === 0) {
    return 'no_face';
  }
  const matrix = result.facialTransformationMatrixes?.[0]?.data;
  if (!matrix) {
    return null;
  }
  // Yaw (rotation around the vertical axis) from the 4x4 row-major rotation matrix:
  // matrix[8] = -sin(yaw), matrix[10] = cos(yaw).
  const yawRadians = Math.atan2(-matrix[8], matrix[10]);
  const yawDegrees = Math.abs((yawRadians * 180) / Math.PI);
  return yawDegrees > HEAD_TURN_THRESHOLD_DEGREES ? 'head_turned' : null;
}
```

- [ ] **Step 5: Run to verify pass**

Run: `cd apps/web && npx jest webcam-detection.test.ts`
Expected: PASS.

- [ ] **Step 6: Add the violation-report and resume mutations to `useAttempt.ts`**

In `apps/web/lib/hooks/useAttempt.ts`, add after `useReportProctoringEvent` (at the end of the file):
```ts
export interface WebcamViolationResult {
  strike: number;
  status: string;
}

export function useReportWebcamViolation() {
  const { accessToken } = useCandidateAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ reason, snapshot }: { reason: 'no_face' | 'head_turned'; snapshot: string }): Promise<WebcamViolationResult> =>
      withRetry(() =>
        candidateApiFetch(
          '/attempt/webcam-violation',
          { method: 'POST', body: JSON.stringify({ reason, snapshot }) },
          accessToken ?? undefined,
        ),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['attempt', 'current'] }),
  });
}

export function useWebcamResume() {
  const { accessToken } = useCandidateAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (): Promise<{ status: string }> =>
      withRetry(() => candidateApiFetch('/attempt/webcam-resume', { method: 'POST', body: JSON.stringify({}) }, accessToken ?? undefined)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['attempt', 'current'] }),
  });
}
```

Both reuse this file's existing `withRetry` helper (already defined at the top of `useAttempt.ts`, used by `useAnswerMutation`) — 3 attempts with exponential backoff, matching the design spec's "retry with backoff client-side" requirement. A resume that still fails after retries leaves the candidate paused rather than silently succeeding (fails safe).

- [ ] **Step 7: Write a failing test for the `useWebcamMonitor` hook**

Create `apps/web/lib/hooks/useWebcamMonitor.test.tsx`:
```tsx
import { render, waitFor } from '@testing-library/react';
import * as useAttemptModule from './useAttempt';
import { useWebcamMonitor } from './useWebcamMonitor';

const mockDetectForVideo = jest.fn();
const mockClose = jest.fn();

jest.mock('@mediapipe/tasks-vision', () => ({
  FilesetResolver: { forVisionTasks: jest.fn().mockResolvedValue({}) },
  FaceLandmarker: {
    createFromOptions: jest.fn().mockResolvedValue({ detectForVideo: (...args: unknown[]) => mockDetectForVideo(...args), close: mockClose }),
  },
}));

function Probe({ enabled }: { enabled: boolean }) {
  useWebcamMonitor(enabled);
  return null;
}

describe('useWebcamMonitor', () => {
  let mutate: jest.Mock;

  beforeEach(() => {
    mutate = jest.fn();
    jest.spyOn(useAttemptModule, 'useReportWebcamViolation').mockReturnValue({ mutate } as any);
    mockDetectForVideo.mockReturnValue({ faceLandmarks: [], facialTransformationMatrixes: [] });
    Object.defineProperty(global.navigator, 'mediaDevices', {
      value: { getUserMedia: jest.fn().mockResolvedValue({ getTracks: () => [{ stop: jest.fn() }] }) },
      configurable: true,
    });
    HTMLMediaElement.prototype.play = jest.fn().mockResolvedValue(undefined);
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('does nothing when disabled', async () => {
    render(<Probe enabled={false} />);
    await Promise.resolve();
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
  });

  it('reports a violation only after the condition is sustained for 3 seconds', async () => {
    render(<Probe enabled={true} />);
    await waitFor(() => expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled());

    mockDetectForVideo.mockReturnValue({ faceLandmarks: [] }); // no_face, sustained from here on
    jest.advanceTimersByTime(2_500); // under the 3s threshold
    expect(mutate).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1_000); // now past 3s
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ reason: 'no_face' }));
  });

  it('resets the sustained timer once the face reappears', async () => {
    render(<Probe enabled={true} />);
    await waitFor(() => expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled());

    mockDetectForVideo.mockReturnValue({ faceLandmarks: [] });
    jest.advanceTimersByTime(2_000);
    mockDetectForVideo.mockReturnValue({ faceLandmarks: [[{ x: 0, y: 0, z: 0 }]], facialTransformationMatrixes: [{ data: new Float32Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]) }] });
    jest.advanceTimersByTime(2_000);
    expect(mutate).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 8: Run to verify failure**

Run: `cd apps/web && npx jest useWebcamMonitor.test.tsx`
Expected: FAIL — `Cannot find module './useWebcamMonitor'`.

- [ ] **Step 9: Implement the hook**

Create `apps/web/lib/hooks/useWebcamMonitor.ts`:
```ts
'use client';

import { useEffect, useRef } from 'react';
import { detectViolationReason, ViolationReason } from '../webcam-detection';
import { useReportWebcamViolation } from './useAttempt';

const SAMPLE_INTERVAL_MS = 500;
const SUSTAINED_VIOLATION_MS = 3000;
const MEDIAPIPE_WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const FACE_LANDMARKER_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

export function useWebcamMonitor(enabled: boolean): void {
  const reportViolation = useReportWebcamViolation();
  const reportRef = useRef(reportViolation.mutate);
  reportRef.current = reportViolation.mutate;

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let stream: MediaStream | null = null;
    let intervalId: ReturnType<typeof setInterval> | undefined;
    let violationSince: number | null = null;
    let currentReason: ViolationReason | null = null;
    let alreadyReported = false;

    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;

    async function setup() {
      const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');
      const filesetResolver = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_URL);
      const landmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
        baseOptions: { modelAssetPath: FACE_LANDMARKER_MODEL_URL },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFacialTransformationMatrixes: true,
      });
      if (cancelled) {
        landmarker.close();
        return;
      }

      stream = await navigator.mediaDevices.getUserMedia({ video: true });
      video.srcObject = stream;
      await video.play();

      intervalId = setInterval(() => {
        if (video.readyState < 2) return;
        const result = landmarker.detectForVideo(video, performance.now());
        const reason = detectViolationReason(result);
        const now = Date.now();

        if (reason === null) {
          violationSince = null;
          currentReason = null;
          alreadyReported = false;
          return;
        }

        if (currentReason !== reason) {
          currentReason = reason;
          violationSince = now;
          alreadyReported = false;
          return;
        }

        if (!alreadyReported && violationSince !== null && now - violationSince >= SUSTAINED_VIOLATION_MS) {
          alreadyReported = true;
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          canvas.getContext('2d')?.drawImage(video, 0, 0);
          reportRef.current({ reason, snapshot: canvas.toDataURL('image/jpeg', 0.5) });
        }
      }, SAMPLE_INTERVAL_MS);
    }

    setup().catch(() => {
      // Camera/model failure mid-attempt fails safe toward flagging (a sustained "no
      // face" violation) rather than silently disabling the check.
      reportRef.current({ reason: 'no_face', snapshot: '' });
    });

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [enabled]);
}
```

- [ ] **Step 10: Run to verify pass**

Run: `cd apps/web && npx jest useWebcamMonitor.test.tsx useAttempt`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add apps/web/package.json apps/web/package-lock.json apps/web/lib/webcam-detection.ts apps/web/lib/webcam-detection.test.ts apps/web/lib/hooks/useWebcamMonitor.ts apps/web/lib/hooks/useWebcamMonitor.test.tsx apps/web/lib/hooks/useAttempt.ts
git commit -m "feat: add on-device webcam violation detection hook"
```

---

## Task 7: Welcome page camera-permission gate

**Files:**
- Modify: `apps/web/app/(candidate)/welcome/page.tsx`
- Modify: `apps/web/app/(candidate)/welcome/page.test.tsx`
- Modify: `apps/web/e2e/candidate-golden-path.spec.ts`
- Modify: `apps/web/e2e/code-question-golden-path.spec.ts`
- Modify: `apps/web/e2e/live-monitoring-golden-path.spec.ts`
- Modify: `apps/web/e2e/exam-scheduling-golden-path.spec.ts`
- Modify: `apps/web/e2e/panel-golden-path.spec.ts`

**Interfaces:**
- Consumes: `navigator.mediaDevices.getUserMedia` (browser API).

This is the first hard gate of its kind in this codebase (the existing "This exam is monitored" text is passive notice only, fullscreen is never enforced pre-start) — do not assume an existing pattern to extend.

**Important regression risk:** five existing Playwright specs (listed above) already drive a candidate through `/welcome` and click "Start exam" — a grep for `Start exam` across `apps/web/e2e/` confirms all five. None of them run with real camera hardware in CI, so once this task's hard gate ships, `getUserMedia({ video: true })` will reject and "Start exam" will never appear, breaking all five. Step 6 below fixes this by mocking the camera permission in each. This codebase's e2e specs are self-contained (no shared helpers file exists under `apps/web/e2e/`), so match that convention — add the same inline mock to each file rather than introducing a new shared helper module.

- [ ] **Step 1: Write failing tests**

In `apps/web/app/(candidate)/welcome/page.test.tsx`, add (mirroring this file's existing mock setup for `useAttemptQuery`/`useStartAttempt` — check the top of the file for how `current`/`startAttempt` are mocked and reuse that exact pattern):
```tsx
  it('requires camera permission before Start exam is available', async () => {
    const getUserMedia = jest.fn().mockResolvedValue({ getTracks: () => [{ stop: jest.fn() }] });
    Object.defineProperty(global.navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true });

    render(<CandidateWelcomePage />);

    expect(screen.queryByRole('button', { name: /start exam/i })).not.toBeInTheDocument();
    const enableButton = screen.getByRole('button', { name: /enable camera/i });
    await userEvent.click(enableButton);

    expect(getUserMedia).toHaveBeenCalledWith({ video: true });
    expect(await screen.findByRole('button', { name: /start exam/i })).toBeInTheDocument();
  });

  it('shows an error and keeps Start hidden when camera permission is denied', async () => {
    const getUserMedia = jest.fn().mockRejectedValue(new Error('denied'));
    Object.defineProperty(global.navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true });

    render(<CandidateWelcomePage />);
    await userEvent.click(screen.getByRole('button', { name: /enable camera/i }));

    expect(await screen.findByText(/camera access is required/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /start exam/i })).not.toBeInTheDocument();
  });
```
(Add `import { screen } from '@testing-library/react'` and `import userEvent from '@testing-library/user-event'` to this file's imports if not already present — check first, this codebase's other test files already use these.)

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/web && npx jest welcome/page.test.tsx -t "camera"`
Expected: FAIL — no "Enable camera" button exists yet.

- [ ] **Step 3: Implement the gate**

In `apps/web/app/(candidate)/welcome/page.tsx`, add `useState` import and camera state, then gate the Start button behind it. Replace the component body:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CandidateButton } from '../components/CandidateButton';
import { useAttemptQuery, useStartAttempt } from '../../../lib/hooks/useAttempt';
import { isAttemptStarted } from '../../../lib/types';
import { useToast } from '../../../components/ui';
import { useCandidateAuth } from '../../../lib/candidate-auth-context';

export default function CandidateWelcomePage() {
  const router = useRouter();
  const { accessToken, isLoading: authLoading } = useCandidateAuth();
  const { data: current, isLoading, isError } = useAttemptQuery();
  const startAttempt = useStartAttempt();
  const { toast } = useToast();
  const [cameraStatus, setCameraStatus] = useState<'idle' | 'checking' | 'granted' | 'denied'>('idle');

  useEffect(() => {
    if (!authLoading && !accessToken) {
      router.push('/session-ended');
    } else if (isError) {
      router.push('/session-ended');
    } else if (current && isAttemptStarted(current) && current.status !== 'in_progress') {
      router.push('/submitted');
    } else if (current && isAttemptStarted(current)) {
      router.push('/exam');
    }
  }, [current, isError, router, accessToken, authLoading]);

  if (isLoading || isError || !current || isAttemptStarted(current)) {
    return <p className="p-8 text-sm text-gray-500">Loading…</p>;
  }

  async function handleEnableCamera() {
    setCameraStatus('checking');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach((track) => track.stop());
      setCameraStatus('granted');
    } catch {
      setCameraStatus('denied');
    }
  }

  async function handleStart() {
    try {
      await startAttempt.mutateAsync();
      router.push('/exam');
    } catch {
      toast("Couldn't start the exam — please check your connection and try again.", 'error');
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 p-8">
      <div className="rounded-lg bg-white p-6 shadow-sm">
        <h1 className="mb-2 text-xl font-semibold text-gray-900">{current.exam.title}</h1>
        <p className="mb-4 text-sm text-gray-600">Duration: {current.exam.durationMinutes} minutes</p>
        {current.exam.instructions && <p className="mb-4 whitespace-pre-wrap text-sm text-gray-700">{current.exam.instructions}</p>}
        {current.schedulingWindowState === 'not_open' ? (
          <div className="rounded-md bg-gray-50 p-3 text-sm text-gray-700">
            This exam opens on {new Date(current.exam.availabilityWindowStart as string).toLocaleString()}. Come back then to start.
          </div>
        ) : current.schedulingWindowState === 'closed' ? (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
            This exam&apos;s availability window has closed. Please contact the recruiter who invited you.
          </div>
        ) : (
          <>
            <div className="mb-6 rounded-md bg-candidate-review-bg p-3 text-xs text-candidate-review">
              This exam is monitored. Tab switches, exiting fullscreen, copy/paste, right-click, developer tools, and your webcam
              will be reported.
            </div>
            {cameraStatus === 'granted' ? (
              <CandidateButton onClick={handleStart} disabled={startAttempt.isPending} className="w-full">
                {startAttempt.isPending ? 'Starting…' : 'Start exam'}
              </CandidateButton>
            ) : (
              <>
                <CandidateButton onClick={handleEnableCamera} disabled={cameraStatus === 'checking'} className="w-full">
                  {cameraStatus === 'checking' ? 'Requesting camera…' : 'Enable camera'}
                </CandidateButton>
                {cameraStatus === 'denied' ? (
                  <p className="mt-2 text-xs text-red-600">
                    Camera access is required to start this exam. Please allow camera access and try again.
                  </p>
                ) : null}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd apps/web && npx jest welcome/page.test.tsx`
Expected: PASS.

- [ ] **Step 5: Mock camera permission in the five existing candidate-flow Playwright specs**

In each of `apps/web/e2e/candidate-golden-path.spec.ts`, `code-question-golden-path.spec.ts`, `live-monitoring-golden-path.spec.ts`, `exam-scheduling-golden-path.spec.ts`, and `panel-golden-path.spec.ts`, find the `test(...)` block that navigates to `/welcome` (or `/start?token=...`) and clicks "Start exam", and add a `page.addInitScript` call immediately before that navigation:

```ts
  await page.addInitScript(() => {
    // @ts-expect-error test-only override — this test environment has no real camera.
    navigator.mediaDevices = { getUserMedia: async () => ({ getTracks: () => [{ stop: () => undefined }] }) };
  });
  await page.goto(`/start?token=${token}`);
  await expect(page).toHaveURL(/\/welcome$/);
  await expect(page.getByText(examTitle)).toBeVisible();
  await page.getByRole('button', { name: 'Enable camera' }).click();
  await page.getByRole('button', { name: 'Start exam' }).click();
```

(The exact surrounding lines — variable names like `examTitle`, whether the flow goes through `/start?token=` or a different route — vary per file; match each file's existing navigation code and only insert the `addInitScript` call plus the new `Enable camera` click before the existing `Start exam` click, without altering anything else in that flow.)

- [ ] **Step 6: Run all five specs to verify they still pass**

Run: `cd apps/web && npx playwright test candidate-golden-path code-question-golden-path live-monitoring-golden-path exam-scheduling-golden-path panel-golden-path`
Expected: PASS — confirms the camera gate doesn't regress any existing candidate-flow coverage.

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/\(candidate\)/welcome/page.tsx apps/web/app/\(candidate\)/welcome/page.test.tsx apps/web/e2e/candidate-golden-path.spec.ts apps/web/e2e/code-question-golden-path.spec.ts apps/web/e2e/live-monitoring-golden-path.spec.ts apps/web/e2e/exam-scheduling-golden-path.spec.ts apps/web/e2e/panel-golden-path.spec.ts
git commit -m "feat: require camera permission before exam start"
```

---

## Task 8: Exam page paused/blocked overlays

**Files:**
- Modify: `apps/web/app/(candidate)/exam/page.tsx`
- Modify: `apps/web/lib/hooks/useAttempt.ts` (`useAttemptQuery`'s `refetchInterval`)
- Modify: `apps/web/lib/types.ts` (`AttemptState`)
- Create: `apps/web/app/(candidate)/exam/page.test.tsx` (or extend it if it already exists — check first with a Glob for `exam/page.test.tsx`; this plan assumes it does not exist yet based on the file list seen during research, so these steps create it)

**Interfaces:**
- Consumes: `useWebcamMonitor` (Task 6), `useWebcamResume` (Task 6), `AttemptState.webcamViolationCount` (Task 4's backend field).

- [ ] **Step 1: Add `webcamViolationCount` to the frontend `AttemptState` type**

In `apps/web/lib/types.ts`, find the `AttemptState` interface and add the field:
```ts
export interface AttemptState {
  status: string;
  remainingSeconds: number;
  webcamViolationCount: number;
  sections: AttemptSection[];
  answers: AttemptAnswerSummary[];
  messages: AttemptMessageSummary[];
}
```

- [ ] **Step 2: Make `useAttemptQuery` poll faster while paused or blocked**

In `apps/web/lib/hooks/useAttempt.ts`, replace `useAttemptQuery`'s fixed `refetchInterval: 30_000`:
```ts
export function useAttemptQuery() {
  const { accessToken } = useCandidateAuth();
  return useQuery<AttemptCurrent>({
    queryKey: ['attempt', 'current'],
    queryFn: () => candidateApiFetch('/attempt/current', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
    refetchInterval: (query) => {
      const data = query.state.data;
      const isPausedOrBlocked = data && 'status' in data && (data.status === 'paused' || data.status === 'blocked');
      return isPausedOrBlocked ? 3_000 : 30_000;
    },
    refetchOnWindowFocus: true,
  });
}
```

- [ ] **Step 3: Write failing tests for the overlays**

Create `apps/web/app/(candidate)/exam/page.test.tsx`. Check first whether this file already exists (a Glob for `apps/web/app/\(candidate\)/exam/*.test.tsx` was not found during planning research, but verify before creating — if it exists, add these `it` blocks to it instead, reusing its existing mock setup for `useAttemptQuery`, `useCandidateAuth`, and Next.js router):
```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as useAttemptModule from '../../../lib/hooks/useAttempt';
import * as useCandidateAuthModule from '../../../lib/candidate-auth-context';
import * as useWebcamMonitorModule from '../../../lib/hooks/useWebcamMonitor';
import CandidateExamPage from './page';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@monaco-editor/react', () => () => null);

function mockAttempt(overrides: Partial<{ status: string; webcamViolationCount: number }> = {}) {
  return {
    status: 'in_progress',
    remainingSeconds: 300,
    webcamViolationCount: 0,
    sections: [{ title: 'Section', targetDurationMinutes: null, questions: [{ id: 'q1', text: 'Q1', type: 'single_mcq', marks: 5, codeLanguage: null, starterCode: null, allowStdin: false, options: [{ id: 'o1', text: 'A' }] }] }],
    answers: [],
    messages: [],
    ...overrides,
  };
}

describe('CandidateExamPage webcam pause/block overlays', () => {
  beforeEach(() => {
    jest.spyOn(useCandidateAuthModule, 'useCandidateAuth').mockReturnValue({ accessToken: 'token', isLoading: false } as any);
    jest.spyOn(useWebcamMonitorModule, 'useWebcamMonitor').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('shows a warning overlay with the strike count when paused, and a Continue button', async () => {
    jest.spyOn(useAttemptModule, 'useAttemptQuery').mockReturnValue({ data: mockAttempt({ status: 'paused', webcamViolationCount: 1 }), isError: false } as any);
    const resumeMutate = jest.fn();
    jest.spyOn(useAttemptModule, 'useWebcamResume').mockReturnValue({ mutate: resumeMutate, isPending: false, isError: false } as any);
    jest.spyOn(useAttemptModule, 'useAnswerMutation').mockReturnValue({ saveAnswer: jest.fn(), flush: jest.fn() } as any);
    jest.spyOn(useAttemptModule, 'useSubmitAttempt').mockReturnValue({ isPending: false, isError: false, mutateAsync: jest.fn() } as any);
    jest.spyOn(useAttemptModule, 'useRunCode').mockReturnValue({ isPending: false, mutate: jest.fn() } as any);

    render(<CandidateExamPage />);

    expect(screen.getByText(/warning 1\/3/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(resumeMutate).toHaveBeenCalled();
  });

  it('shows a block overlay with no self-resume option when blocked', () => {
    jest.spyOn(useAttemptModule, 'useAttemptQuery').mockReturnValue({ data: mockAttempt({ status: 'blocked', webcamViolationCount: 3 }), isError: false } as any);
    jest.spyOn(useAttemptModule, 'useWebcamResume').mockReturnValue({ mutate: jest.fn(), isPending: false, isError: false } as any);
    jest.spyOn(useAttemptModule, 'useAnswerMutation').mockReturnValue({ saveAnswer: jest.fn(), flush: jest.fn() } as any);
    jest.spyOn(useAttemptModule, 'useSubmitAttempt').mockReturnValue({ isPending: false, isError: false, mutateAsync: jest.fn() } as any);
    jest.spyOn(useAttemptModule, 'useRunCode').mockReturnValue({ isPending: false, mutate: jest.fn() } as any);

    render(<CandidateExamPage />);

    expect(screen.getByText(/recruiter needs to unblock/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /continue/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Run to verify failure**

Run: `cd apps/web && npx jest "exam/page.test.tsx"`
Expected: FAIL — no warning/block text exists yet, and `useWebcamMonitor`/`useWebcamResume` aren't called from the page yet.

- [ ] **Step 5: Wire the hook and overlays into the page**

In `apps/web/app/(candidate)/exam/page.tsx`:

Add imports:
```tsx
import { useAttemptQuery, useAnswerMutation, useSubmitAttempt, useRunCode, useWebcamResume, RunCodeResult } from '../../../lib/hooks/useAttempt';
import { useWebcamMonitor } from '../../../lib/hooks/useWebcamMonitor';
```

Replace lines 54-57 (the `attemptState`/`isTerminal`/`started` derivation and `useProctoringMonitor(started)` call):
```tsx
  const attemptState = current && isAttemptStarted(current) ? current : null;
  const isPaused = attemptState?.status === 'paused';
  const isBlocked = attemptState?.status === 'blocked';
  const isTerminal = Boolean(attemptState && attemptState.status !== 'in_progress' && !isPaused && !isBlocked);
  const started = Boolean(attemptState) && attemptState.status === 'in_progress';
  useProctoringMonitor(started);
  useWebcamMonitor(started);
  const webcamResume = useWebcamResume();
```

Replace the render guard at line 96 (`if (isError || !attemptState || !question || isTerminal) { ... }`) with:
```tsx
  if (isError || !attemptState) {
    return <p className="p-8 text-sm text-gray-500">Loading…</p>;
  }

  if (isPaused) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-8 text-center">
        <h1 className="text-lg font-semibold text-gray-900">Warning {attemptState.webcamViolationCount}/3</h1>
        <p className="text-sm text-gray-600">
          We couldn&apos;t see your face clearly. Make sure you&apos;re centered in the camera and facing forward, then continue.
        </p>
        <CandidateButton onClick={() => webcamResume.mutate()} disabled={webcamResume.isPending}>
          {webcamResume.isPending ? 'Checking…' : 'Continue'}
        </CandidateButton>
        {webcamResume.isError ? <p className="text-xs text-red-600">Still not detected — reposition and try again.</p> : null}
      </div>
    );
  }

  if (isBlocked) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-8 text-center">
        <h1 className="text-lg font-semibold text-gray-900">Exam paused</h1>
        <p className="text-sm text-gray-600">
          Your exam has been paused after repeated webcam violations. A recruiter needs to unblock your session before you can
          continue.
        </p>
      </div>
    );
  }

  if (!question || isTerminal) {
    return <p className="p-8 text-sm text-gray-500">Loading…</p>;
  }
```

- [ ] **Step 6: Run to verify pass**

Run: `cd apps/web && npx jest "exam/page.test.tsx"`
Expected: PASS.

- [ ] **Step 7: Run the full frontend suite to check for regressions**

Run: `cd apps/web && npx jest`
Expected: PASS — in particular, confirm no existing `exam/page` test (if one already existed under a different assumption) broke from the `isTerminal`/render-guard restructuring.

- [ ] **Step 8: Commit**

```bash
git add apps/web/app/\(candidate\)/exam/page.tsx apps/web/app/\(candidate\)/exam/page.test.tsx apps/web/lib/hooks/useAttempt.ts apps/web/lib/types.ts
git commit -m "feat: add paused/blocked overlays to the candidate exam page"
```

---

## Task 9: Recruiter unblock UI

**Files:**
- Create: `apps/web/lib/hooks/useAttemptModeration.ts`
- Create: `apps/web/lib/hooks/useAttemptModeration.test.ts`
- Modify: `apps/web/components/LiveMonitoringPanel.tsx`
- Modify: `apps/web/components/LiveMonitoringPanel.test.tsx`

**Interfaces:**
- Consumes: `POST /attempts/:id/unblock` (Task 5).
- Produces: `useUnblockAttempt(): UseMutationResult` — consumed by `LiveMonitoringPanel`.

- [ ] **Step 1: Write a failing test for the mutation hook**

Create `apps/web/lib/hooks/useAttemptModeration.test.ts`:
```ts
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as authModule from '../auth-context';
import * as apiClientModule from '../api-client';
import { useUnblockAttempt } from './useAttemptModeration';

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useUnblockAttempt', () => {
  it('POSTs to /attempts/:id/unblock with the access token', async () => {
    jest.spyOn(authModule, 'useAuth').mockReturnValue({ accessToken: 'staff-token' } as any);
    const apiFetch = jest.spyOn(apiClientModule, 'apiFetch').mockResolvedValue({ status: 'in_progress' });

    const { result } = renderHook(() => useUnblockAttempt(), { wrapper });
    result.current.mutate('attempt-1');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(apiFetch).toHaveBeenCalledWith('/attempts/attempt-1/unblock', { method: 'POST', body: JSON.stringify({}) }, 'staff-token');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/web && npx jest useAttemptModeration.test.ts`
Expected: FAIL — `Cannot find module './useAttemptModeration'`.

- [ ] **Step 3: Implement the hook**

Create `apps/web/lib/hooks/useAttemptModeration.ts`:
```ts
import { useMutation } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { useAuth } from '../auth-context';

export function useUnblockAttempt() {
  const { accessToken } = useAuth();
  return useMutation({
    mutationFn: (attemptId: string) => apiFetch(`/attempts/${attemptId}/unblock`, { method: 'POST', body: JSON.stringify({}) }, accessToken ?? undefined),
  });
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd apps/web && npx jest useAttemptModeration.test.ts`
Expected: PASS.

- [ ] **Step 5: Write a failing test for the Unblock button in `LiveMonitoringPanel`**

In `apps/web/components/LiveMonitoringPanel.test.tsx`, find this file's existing mock setup for `useExamMonitoring` and add (reusing that pattern):
```tsx
  it('shows an Unblock action for a blocked candidate and calls the mutation on click', async () => {
    jest.spyOn(useExamMonitoringModule, 'useExamMonitoring').mockReturnValue({
      roster: [{ candidateId: 'c1', candidateName: 'Alice', invitationId: 'i1', attemptId: 'a1', status: 'blocked', online: true, remainingSeconds: null, answeredCount: 2, totalQuestions: 5 }],
      alerts: [],
      connectionStatus: 'connected',
      joinError: null,
    });
    const mutate = jest.fn();
    jest.spyOn(useAttemptModerationModule, 'useUnblockAttempt').mockReturnValue({ mutate, isPending: false } as any);

    render(<LiveMonitoringPanel examId="exam-1" />);

    const unblockButton = screen.getByRole('button', { name: /unblock/i });
    await userEvent.click(unblockButton);
    expect(mutate).toHaveBeenCalledWith('a1');
  });
```
(Add `import * as useAttemptModerationModule from '../lib/hooks/useAttemptModeration';` to this file's imports, matching how `useExamMonitoringModule` is already imported.)

- [ ] **Step 6: Run to verify failure**

Run: `cd apps/web && npx jest LiveMonitoringPanel.test.tsx -t "Unblock"`
Expected: FAIL — no "Unblock" button rendered yet.

- [ ] **Step 7: Add the status variant and Unblock action column**

In `apps/web/components/LiveMonitoringPanel.tsx`:

Add the import:
```tsx
import { useUnblockAttempt } from '../lib/hooks/useAttemptModeration';
```

Update `STATUS_VARIANT` (lines 8-14):
```tsx
const STATUS_VARIANT: Record<string, 'default' | 'success' | 'warning' | 'danger'> = {
  invited: 'default',
  in_progress: 'warning',
  submitted: 'success',
  auto_submitted: 'success',
  force_submitted: 'danger',
  blocked: 'danger',
};
```

Inside the `LiveMonitoringPanel` component, add the mutation hook (near the top, alongside `useExamMonitoring`/`useToast`):
```tsx
  const unblockAttempt = useUnblockAttempt();
```

Add a new column to `rosterColumns` (after the `progress` column):
```tsx
    {
      key: 'actions',
      header: '',
      render: (row) =>
        row.status === 'blocked' && row.attemptId ? (
          <button
            onClick={() => {
              unblockAttempt.mutate(row.attemptId as string, {
                onSuccess: () => toast('Candidate unblocked.', 'success'),
                onError: () => toast("Couldn't unblock the candidate — please try again.", 'error'),
              });
            }}
            disabled={unblockAttempt.isPending}
            className="rounded-full border border-gray-300 px-2 py-0.5 text-xs text-gray-700 hover:bg-gray-50"
          >
            Unblock
          </button>
        ) : null,
    },
```

- [ ] **Step 8: Run to verify pass**

Run: `cd apps/web && npx jest LiveMonitoringPanel.test.tsx`
Expected: PASS.

- [ ] **Step 9: Run the full frontend suite**

Run: `cd apps/web && npx jest`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add apps/web/lib/hooks/useAttemptModeration.ts apps/web/lib/hooks/useAttemptModeration.test.ts apps/web/components/LiveMonitoringPanel.tsx apps/web/components/LiveMonitoringPanel.test.tsx
git commit -m "feat: add recruiter Unblock action to the Live Monitoring panel"
```

---

## Task 10: End-to-end verification

**Files:**
- Create: `apps/api/test/webcam-proctoring.e2e-spec.ts`
- Modify: `apps/web/e2e/candidate-golden-path.spec.ts`

**Interfaces:**
- Consumes: everything from Tasks 1-9.

- [ ] **Step 1: Write the backend e2e test**

Create `apps/api/test/webcam-proctoring.e2e-spec.ts`, following `apps/api/test/live-monitoring.e2e-spec.ts`'s exact `bootAdminApp`/`bootRuntimeApp` setup pattern (copy its `beforeAll`/`afterAll`/`inviteAndGetToken` helpers verbatim, adjusting the org/exam names to avoid collisions):

```ts
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { bootAdminApp, bootRuntimeApp } from './dual-app';
import { PrismaService } from '@exam-platform/shared';
import { TenantPrismaService } from '@exam-platform/shared';
import { EmailService } from '../src/email/email.service';

describe('Webcam proctoring pause/block/unblock flow', () => {
  let adminApp: INestApplication;
  let runtimeApp: INestApplication;
  let adminHttp: any;
  let runtimeHttp: any;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let planId: string;
  let orgId: string;
  let recruiterAccessToken: string;
  let examId: string;
  const fakeEmailService = { send: jest.fn().mockResolvedValue({ success: true, previewUrl: 'https://ethereal.email/fake' }) };

  beforeAll(async () => {
    adminApp = await bootAdminApp((builder) => builder.overrideProvider(EmailService).useValue(fakeEmailService));
    ({ app: runtimeApp } = await bootRuntimeApp());
    adminHttp = adminApp.getHttpServer();
    runtimeHttp = runtimeApp.getHttpServer();

    prisma = adminApp.get(PrismaService);
    tenantPrisma = adminApp.get(TenantPrismaService);

    const plan = await prisma.plan.create({
      data: { name: `ci-webcam-plan-${randomUUID()}`, candidateLimit: 10, aiCreditLimit: 1, proctoringMinutesLimit: 1 },
    });
    planId = plan.id;

    const org = await prisma.organization.create({ data: { name: 'CI Webcam Org', slug: `ci-webcam-org-${randomUUID()}`, planId } });
    orgId = org.id;

    const recruiterHash = await argon2.hash('RecruiterPassw0rd!');
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) =>
      tx.user.create({ data: { organizationId: orgId, email: 'recruiter@ci-webcam.test', passwordHash: recruiterHash, role: 'recruiter' } }),
    );

    recruiterAccessToken = (
      await request(adminHttp)
        .post('/api/v1/auth/staff/login')
        .send({ organizationSlug: org.slug, email: 'recruiter@ci-webcam.test', password: 'RecruiterPassw0rd!' })
        .expect(200)
    ).body.accessToken;

    const examResponse = await request(adminHttp)
      .post('/api/v1/exams')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ title: 'Webcam Proctoring Round' })
      .expect(201);
    examId = examResponse.body.id;

    const sectionResponse = await request(adminHttp)
      .post(`/api/v1/exams/${examId}/sections`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ title: 'Section One' })
      .expect(201);

    const questionResponse = await request(adminHttp)
      .post('/api/v1/questions')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({
        type: 'true_false', text: 'Is this a webcam proctoring test?', difficulty: 'easy', marks: 5,
        options: [{ text: 'True', isCorrect: true }, { text: 'False', isCorrect: false }],
      })
      .expect(201);

    await request(adminHttp)
      .put(`/api/v1/exams/${examId}/sections/${sectionResponse.body.id}/questions`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ questionIds: [questionResponse.body.id] })
      .expect(200);

    await request(adminHttp).post(`/api/v1/exams/${examId}/publish`).set('Authorization', `Bearer ${recruiterAccessToken}`).expect(201);
  });

  afterAll(async () => {
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) => tx.exam.deleteMany({ where: { organizationId: orgId } }));
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) => tx.question.deleteMany({ where: { organizationId: orgId } }));
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) => tx.candidate.deleteMany({ where: { organizationId: orgId } }));
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: true }, (tx) => tx.refreshToken.deleteMany({ where: { user: { organizationId: orgId } } }));
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) => tx.user.deleteMany({ where: { organizationId: orgId } }));
    await prisma.organization.delete({ where: { id: orgId } }).catch(() => undefined);
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await adminApp.close();
    await runtimeApp.close();
  });

  async function inviteAndGetToken(email: string, name: string): Promise<string> {
    const candidateResponse = await request(adminHttp).post('/api/v1/candidates').set('Authorization', `Bearer ${recruiterAccessToken}`).send({ email, name }).expect(201);
    const inviteResponse = await request(adminHttp)
      .post(`/api/v1/exams/${examId}/invitations`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ candidateIds: [candidateResponse.body.id] })
      .expect(201);
    return inviteResponse.body.created[0].token;
  }

  it('pauses on strikes 1-2 with self-resume, blocks on strike 3, and only a recruiter can unblock', async () => {
    const token = await inviteAndGetToken('carol@ci-webcam.test', 'Carol');
    const accessToken = (await request(runtimeHttp).post('/api/v1/candidate-auth/redeem').send({ token }).expect(200)).body.accessToken;
    const attemptId = (await request(runtimeHttp).post('/api/v1/attempt/start').set('Authorization', `Bearer ${accessToken}`).send({}).expect(201)).body.id;

    // Strike 1: pauses.
    const strike1 = await request(runtimeHttp)
      .post('/api/v1/attempt/webcam-violation')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ reason: 'no_face', snapshot: 'snap1' })
      .expect(201);
    expect(strike1.body).toEqual({ strike: 1, status: 'paused' });

    // Can't answer while paused.
    await request(runtimeHttp)
      .post('/api/v1/attempt/answer')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ questionId: 'irrelevant', selectedOptionIds: [] })
      .expect(400);

    // Self-resume.
    const resume1 = await request(runtimeHttp).post('/api/v1/attempt/webcam-resume').set('Authorization', `Bearer ${accessToken}`).send({}).expect(201);
    expect(resume1.body).toEqual({ status: 'in_progress' });

    // Strike 2: pauses again.
    await request(runtimeHttp)
      .post('/api/v1/attempt/webcam-violation')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ reason: 'head_turned', snapshot: 'snap2' })
      .expect(201);
    await request(runtimeHttp).post('/api/v1/attempt/webcam-resume').set('Authorization', `Bearer ${accessToken}`).send({}).expect(201);

    // Strike 3: blocks. Self-resume must now fail.
    const strike3 = await request(runtimeHttp)
      .post('/api/v1/attempt/webcam-violation')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ reason: 'no_face', snapshot: 'snap3' })
      .expect(201);
    expect(strike3.body).toEqual({ strike: 3, status: 'blocked' });
    await request(runtimeHttp).post('/api/v1/attempt/webcam-resume').set('Authorization', `Bearer ${accessToken}`).send({}).expect(400);

    // Recruiter unblocks.
    const unblockResponse = await request(adminHttp)
      .post(`/api/v1/attempts/${attemptId}/unblock`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(201);
    expect(unblockResponse.body).toEqual({ status: 'in_progress' });

    // Candidate can act again.
    const current = await request(runtimeHttp).get('/api/v1/attempt/current').set('Authorization', `Bearer ${accessToken}`).expect(200);
    expect(current.body.status).toBe('in_progress');
    expect(current.body.webcamViolationCount).toBe(3);
  });
});
```

- [ ] **Step 2: Run the e2e test**

Run: `cd apps/api && npx jest --config test/jest-e2e.json webcam-proctoring.e2e-spec.ts`
Expected: PASS. If the exact response-body shapes for `/attempt/start` or `/attempt/current` differ slightly from what's assumed above (e.g. extra fields), adjust the assertions to `toMatchObject` rather than `toEqual` for those specific checks — don't change production code to fit the test.

- [ ] **Step 3: Add a route-mocked pause/block overlay test to the candidate golden-path spec**

`apps/web/lib/candidate-auth-context.tsx` keeps the candidate's access token in React state only (no `localStorage`) — there is no way for a Playwright test to grab it and call the API directly via `page.evaluate`/`fetch`. Driving a real 3-second sustained MediaPipe detection in a headless CI browser is also unreliable (real WASM model load, no real camera). So this test verifies the part that's actually deterministic and CI-safe: that the exam page correctly renders the paused/blocked overlays when the backend reports those statuses — by intercepting the `GET .../attempt/current` request the page already polls, exactly like Task 6/8's unit tests already verify the detection and mutation logic in isolation.

Add a new `test(...)` to `apps/web/e2e/candidate-golden-path.spec.ts` (after the existing `test('candidate redeems an invitation, takes an exam, and submits', ...)` block), reusing that test's exact login/create-exam/invite/candidate-creation steps (lines 7-59 of the existing test) to reach the point of having a redeem `token`, then diverging:

```ts
test('candidate sees the pause and block overlays when the backend reports paused/blocked status', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Organization slug').fill(ORG_SLUG);
  await page.getByLabel('Email').fill(RECRUITER_EMAIL);
  await page.getByLabel('Password').fill(RECRUITER_PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  await page.getByRole('link', { name: 'Question Bank' }).click();
  await page.getByRole('link', { name: 'New question' }).click();
  await page.getByLabel('Question text').fill('Webcam overlay test question?');
  await page.getByLabel('Marks', { exact: true }).fill('5');
  const optionInputs = page.getByLabel(/Option \d text/);
  await optionInputs.nth(0).fill('Yes');
  await optionInputs.nth(1).fill('No');
  await page.getByRole('radio', { name: 'Option 1 correct' }).click();
  await page.getByRole('button', { name: 'Create question' }).click();
  await expect(page).toHaveURL(/\/questions$/);

  await page.getByRole('link', { name: 'Exams' }).click();
  await page.getByRole('link', { name: 'New exam' }).click();
  const examTitle = `Webcam Overlay Exam ${Date.now()}`;
  await page.getByLabel('Title').fill(examTitle);
  await page.getByRole('button', { name: 'Create exam' }).click();
  await expect(page).toHaveURL(/\/exams\/.+\/edit$/);

  await page.getByRole('tab', { name: 'Sections & Questions' }).click();
  await page.getByLabel('New section title').fill('Section One');
  await page.getByRole('button', { name: 'Add section' }).click();
  await page.getByRole('button', { name: 'Manage questions' }).click();
  await page.getByRole('checkbox', { name: /Webcam overlay test question\?/ }).first().click();
  await page.getByRole('button', { name: 'Save questions' }).click();
  await page.getByRole('button', { name: 'Publish' }).click();
  await expect(page).toHaveURL(/\/exams$/);

  await page.getByRole('link', { name: 'Candidates' }).click();
  const candidateEmail = `webcam-overlay-${Date.now()}@example.com`;
  await page.getByLabel('Name').fill('Webcam Overlay Person');
  await page.getByLabel('Email').fill(candidateEmail);
  await page.getByRole('button', { name: 'Add candidate' }).click();
  await expect(page.getByText(candidateEmail)).toBeVisible();

  await page.getByLabel('Exam to invite to').click();
  await page.getByRole('option', { name: examTitle, exact: true }).click();
  await page.getByRole('row', { name: candidateEmail }).getByRole('checkbox', { name: 'Webcam Overlay Person' }).click();
  const [inviteResponse] = await Promise.all([
    page.waitForResponse((response) => response.url().includes('/invitations') && response.request().method() === 'POST'),
    page.getByRole('button', { name: 'Send invitations' }).click(),
  ]);
  const inviteBody = await inviteResponse.json();
  const token: string = inviteBody.created[0].token;

  await page.addInitScript(() => {
    // @ts-expect-error test-only override — this test environment has no real camera.
    navigator.mediaDevices = { getUserMedia: async () => ({ getTracks: () => [{ stop: () => undefined }] }) };
  });

  let mockedStatus: 'paused' | 'blocked' = 'paused';
  await page.route('**/attempt/current', async (route) => {
    if (route.request().method() !== 'GET') {
      return route.continue();
    }
    const response = await route.fetch();
    const body = await response.json();
    if ('status' in body) {
      body.status = mockedStatus;
      body.webcamViolationCount = mockedStatus === 'paused' ? 1 : 3;
    }
    await route.fulfill({ response, json: body });
  });

  await page.goto(`/start?token=${token}`);
  await expect(page).toHaveURL(/\/welcome$/);
  await page.getByRole('button', { name: 'Enable camera' }).click();
  await page.getByRole('button', { name: 'Start exam' }).click();
  await expect(page).toHaveURL(/\/exam$/);

  await expect(page.getByText('Warning 1/3')).toBeVisible();

  mockedStatus = 'blocked';
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText(/recruiter needs to unblock/i)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue' })).not.toBeVisible();
});
```

- [ ] **Step 4: Run the new Playwright test**

Run: `cd apps/web && npx playwright test candidate-golden-path`
Expected: PASS — both the original golden-path test and this new one.

- [ ] **Step 5: Run the full test suite across all three apps as a final regression check**

Run:
```bash
cd apps/exam-runtime && npx jest
cd ../api && npx jest && npx jest --config test/jest-e2e.json
cd ../web && npx jest && npx playwright test
```
Expected: PASS across the board.

- [ ] **Step 6: Commit**

```bash
git add apps/api/test/webcam-proctoring.e2e-spec.ts apps/web/e2e/
git commit -m "test: add webcam proctoring e2e and golden-path coverage"
```
