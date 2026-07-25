# Recruiter Mid-Exam Proctoring Bypass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a recruiter relax proctoring enforcement for one in-progress attempt from Live Monitoring, so a candidate hitting false-positive violations can finish their exam while every violation is still recorded.

**Architecture:** Three nullable columns on `Attempt` hold the bypass state. `resolveProctoringConfig` gains an optional `attempt` argument and forces `enforcement: 'warn'` when the attempt is bypassed, so every existing enforcement path inherits the behaviour without its own conditional. A pair of internal endpoints in `apps/exam-runtime` apply and revoke it (both resetting violation counters and resuming the attempt), fronted by `apps/api` passthrough methods that add audit records, and surfaced as a button in the Live Monitoring roster.

**Tech Stack:** NestJS (apps/api, apps/exam-runtime), Prisma + SQL Server, Next.js + React Query + TanStack (apps/web), Jest.

## Global Constraints

- **Per-attempt only.** Never touch `Exam` columns. The exam-level config is locked once a candidate starts and applies to every candidate simultaneously.
- **`reason` is mandatory** on apply: `@IsString() @IsNotEmpty() @MaxLength(500)`.
- **Both apply and revoke reset both violation counters** (`webcamViolationCount` and `browserActivityViolationCount`) via `resumeFromPause(tx, attempt, { resetViolationCounters: true })`.
- **Bypass means `enforcement: 'warn'`, never "proctoring off".** Events must still be written to `proctoring_events`, still broadcast to the monitoring gateway, and still scored by integrity analysis.
- **Bypass disclosure goes in the integrity narrative, never in `flagsJson`.** `IntegrityFlag.severity` is only `'medium' | 'high'` and `deriveLevel` maps those to `review`/`high_concern`; a bypass flag would inflate an honest candidate's level.
- **SQL Server migrations:** one statement per `ALTER TABLE ... ADD`. A statement referencing a column added earlier in the same batch fails at compile time. No `GO`.
- **`EXAM_RUNTIME_INTERNAL_URL` must stay suffix-free** (`http://127.0.0.1:3003`) — `ExamRuntimeInternalClient` appends `/api/v1/internal/...` itself.
- Run `apps/api` tests with `cd "D:/exam app/apps/api" && npx jest <path>`; same shape for `apps/exam-runtime` and `apps/web`.

## File Structure

| File | Responsibility |
|---|---|
| `apps/api/prisma/schema.prisma` | Three new `Attempt` columns |
| `apps/api/prisma/migrations/20260726090000_attempt_proctoring_bypass/migration.sql` | Additive migration |
| `apps/exam-runtime/src/attempts/proctoring-config.ts` | Bypass → `enforcement: 'warn'` override |
| `apps/exam-runtime/src/grading/attempt-settlement.service.ts` | Pass the attempt into the resolver |
| `apps/exam-runtime/src/attempts/attempt.service.ts` | Pass the attempt into the resolver |
| `apps/exam-runtime/src/internal/dto/proctoring-bypass.dto.ts` | Internal request bodies |
| `apps/exam-runtime/src/internal/internal.controller.ts` | Apply / revoke endpoints |
| `apps/exam-runtime/src/monitoring/monitoring.service.ts` | Expose bypass state on the roster |
| `apps/exam-runtime/src/integrity/integrity-analysis.service.ts` | Narrative disclosure |
| `apps/api/src/exam-runtime-client/exam-runtime-internal.client.ts` | Two client methods |
| `apps/api/src/attempts-admin/dto/bypass-proctoring.dto.ts` | Public request body |
| `apps/api/src/attempts-admin/attempts-admin.service.ts` | Passthrough + audit |
| `apps/api/src/attempts-admin/attempts-admin.controller.ts` | Two routes |
| `apps/web/lib/types.ts` | `RosterRow.proctoringBypassed` |
| `apps/web/lib/hooks/useAttemptModeration.ts` | Two mutations |
| `apps/web/components/LiveMonitoringPanel.tsx` | Button, reason modal, badge |

---

### Task 1: Schema and migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma:385` (immediately after `consentAt`, before the `invitation` relation)
- Create: `apps/api/prisma/migrations/20260726090000_attempt_proctoring_bypass/migration.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: `Attempt.proctoringBypassedAt: Date | null`, `Attempt.proctoringBypassedBy: string | null`, `Attempt.proctoringBypassReason: string | null` on the generated Prisma client.

- [ ] **Step 1: Add the three columns to the Prisma model**

In `apps/api/prisma/schema.prisma`, insert these three lines directly after the `consentAt` line and before `invitation Invitation @relation(...)`:

```prisma
  proctoringBypassedAt          DateTime?           @map("proctoring_bypassed_at")
  proctoringBypassedBy          String?             @map("proctoring_bypassed_by") @db.UniqueIdentifier
  proctoringBypassReason        String?             @map("proctoring_bypass_reason")
```

Do **not** add a relation to `User`. `AuditLog.actor` documents why: a second `users` cascade path on this table trips Prisma's multi-cascade-path validator. The audit log is the authoritative record of who acted.

- [ ] **Step 2: Write the migration**

Create `apps/api/prisma/migrations/20260726090000_attempt_proctoring_bypass/migration.sql`:

```sql
ALTER TABLE [dbo].[attempts] ADD [proctoring_bypassed_at] DATETIME2;
ALTER TABLE [dbo].[attempts] ADD [proctoring_bypassed_by] UNIQUEIDENTIFIER;
ALTER TABLE [dbo].[attempts] ADD [proctoring_bypass_reason] NVARCHAR(1000);
```

All three are nullable with no default, so no `CONSTRAINT ... DEFAULT` clause is needed. Three independent statements — SQL Server would fail to compile a batch where one statement referenced a column added by an earlier one.

- [ ] **Step 3: Apply the migration**

```bash
cd "D:/exam app/apps/api" && DB_URL=$(grep "^DATABASE_URL=" .env | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//') && DATABASE_URL="$DB_URL" npx prisma migrate deploy
```

Expected: `The following migration(s) have been applied` listing `20260726090000_attempt_proctoring_bypass`. Never `source` the `.env` — the connection string contains semicolons that break bash.

- [ ] **Step 4: Regenerate the client and confirm it compiles**

```bash
cd "D:/exam app/apps/api" && DB_URL=$(grep "^DATABASE_URL=" .env | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//') && DATABASE_URL="$DB_URL" npx prisma generate && npx tsc --noEmit
```

Expected: `Generated Prisma Client`, then `tsc` exits silently with no output.

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260726090000_attempt_proctoring_bypass/migration.sql
git commit -m "feat: add per-attempt proctoring bypass columns"
```

---

### Task 2: Resolver honours the bypass

**Files:**
- Modify: `apps/exam-runtime/src/attempts/proctoring-config.ts`
- Test: `apps/exam-runtime/src/attempts/proctoring-config.spec.ts`

**Interfaces:**
- Consumes: `Attempt.proctoringBypassedAt` from Task 1.
- Produces: `resolveProctoringConfig(exam: ProctoringConfigSource, attempt?: ProctoringBypassSource): ExamProctoringConfig` and the exported type `ProctoringBypassSource = { proctoringBypassedAt: Date | null }`. The second argument is optional, so every existing call site keeps compiling and keeps today's behaviour.

- [ ] **Step 1: Write the failing tests**

Append to `apps/exam-runtime/src/attempts/proctoring-config.spec.ts`:

```ts
describe('proctoring bypass', () => {
  const blockingExam = {
    webcamProctoringEnabled: true,
    proctoringEnforcement: 'block',
    proctoringStrikeLimit: 5,
    disabledProctoringSignalsJson: JSON.stringify(['right_click']),
  };

  it('forces warn enforcement when the attempt is bypassed', () => {
    const config = resolveProctoringConfig(blockingExam, { proctoringBypassedAt: new Date() });

    expect(config.enforcement).toBe('warn');
  });

  it('leaves every other setting untouched when bypassed', () => {
    const config = resolveProctoringConfig(blockingExam, { proctoringBypassedAt: new Date() });

    expect(config.webcamEnabled).toBe(true);
    expect(config.strikeLimit).toBe(5);
    expect(config.disabledSignals).toEqual(['right_click']);
  });

  it('enforces normally when the attempt is not bypassed', () => {
    expect(resolveProctoringConfig(blockingExam, { proctoringBypassedAt: null }).enforcement).toBe('block');
  });

  it('enforces normally when no attempt is supplied at all', () => {
    expect(resolveProctoringConfig(blockingExam).enforcement).toBe('block');
  });

  it('is a no-op on an exam already configured as warn-only', () => {
    const warnExam = { ...blockingExam, proctoringEnforcement: 'warn' };

    expect(resolveProctoringConfig(warnExam, { proctoringBypassedAt: new Date() }).enforcement).toBe('warn');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd "D:/exam app/apps/exam-runtime" && npx jest src/attempts/proctoring-config.spec.ts
```

Expected: FAIL — `Expected: "warn", Received: "block"` on the first two tests.

- [ ] **Step 3: Implement the override**

In `apps/exam-runtime/src/attempts/proctoring-config.ts`, add the exported type after `ExamProctoringConfig`:

```ts
export interface ProctoringBypassSource {
  proctoringBypassedAt: Date | null;
}
```

Then replace `resolveProctoringConfig` with:

```ts
export function resolveProctoringConfig(
  exam: ProctoringConfigSource,
  attempt?: ProctoringBypassSource,
): ExamProctoringConfig {
  // A recruiter bypass downgrades enforcement to warn-only for this one attempt:
  // events are still recorded, counted and broadcast, but nothing pauses or blocks
  // the candidate. It never widens what is watched -- only what is punished.
  const bypassed = attempt?.proctoringBypassedAt != null;
  return {
    webcamEnabled: exam.webcamProctoringEnabled,
    // Anything other than an explicit 'warn' enforces, so a corrupt row fails safe.
    enforcement: bypassed || exam.proctoringEnforcement === 'warn' ? 'warn' : 'block',
    strikeLimit: Math.max(1, exam.proctoringStrikeLimit),
    disabledSignals: parseDisabledSignals(exam.disabledProctoringSignalsJson),
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd "D:/exam app/apps/exam-runtime" && npx jest src/attempts/proctoring-config.spec.ts
```

Expected: PASS, all tests in the file green (the pre-existing tests must still pass — the second argument is optional).

- [ ] **Step 5: Commit**

```bash
git add apps/exam-runtime/src/attempts/proctoring-config.ts apps/exam-runtime/src/attempts/proctoring-config.spec.ts
git commit -m "feat: resolve a bypassed attempt as warn-only proctoring"
```

---

### Task 3: Enforcement paths pass the attempt to the resolver

Task 2 added the capability; nothing uses it yet. This task threads the attempt through the four call sites that decide whether to pause or block.

**Files:**
- Modify: `apps/exam-runtime/src/grading/attempt-settlement.service.ts:249` and `:307`
- Modify: `apps/exam-runtime/src/attempts/attempt.service.ts:477` and the `resolveProctoringConfig` call inside `webcamViolation`
- Test: `apps/exam-runtime/src/grading/attempt-settlement.service.spec.ts`

**Interfaces:**
- Consumes: `resolveProctoringConfig(exam, attempt?)` from Task 2.
- Produces: no signature changes. `registerWebcamViolation` and `registerBrowserActivityViolation` already receive `attempt` as a parameter, and `reportProctoringEvent`/`webcamViolation` already load it — this is purely passing an argument that is already in scope.

- [ ] **Step 1: Write the failing tests**

Append to `apps/exam-runtime/src/grading/attempt-settlement.service.spec.ts`. Match the surrounding tests' existing mock-construction style for `tx` and the broadcaster:

```ts
describe('bypassed attempts are never paused or blocked', () => {
  const blockingExam = {
    id: 'exam-1',
    durationMinutes: 60,
    webcamProctoringEnabled: true,
    proctoringEnforcement: 'block',
    proctoringStrikeLimit: 2,
    disabledProctoringSignalsJson: null,
  } as never;

  it('registerWebcamViolation still counts the strike but leaves status alone', async () => {
    const attempt = {
      id: 'a1', examId: 'exam-1', candidateId: 'c1', status: 'in_progress',
      webcamViolationCount: 1, browserActivityViolationCount: 0, pausedDurationMs: 0,
      proctoringBypassedAt: new Date(),
    } as never;
    const tx = {
      proctoringEvent: { create: jest.fn().mockResolvedValue({ id: 'e1' }) },
      attempt: { update: jest.fn().mockResolvedValue({ ...(attempt as object), status: 'in_progress' }) },
    } as never;

    const { strike } = await service.registerWebcamViolation(tx, blockingExam, attempt, 'no_face', 'data:,');

    expect(strike).toBe(2);
    expect((tx as never as { attempt: { update: jest.Mock } }).attempt.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ webcamViolationCount: 2, status: 'in_progress', pausedAt: null }) }),
    );
  });

  it('registerBrowserActivityViolation still records the event but leaves status alone', async () => {
    const attempt = {
      id: 'a2', examId: 'exam-1', candidateId: 'c1', status: 'in_progress',
      webcamViolationCount: 0, browserActivityViolationCount: 1, pausedDurationMs: 0,
      proctoringBypassedAt: new Date(),
    } as never;
    const tx = {
      proctoringEvent: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'e2', eventType: 'tab_switch', severity: 'medium' }),
      },
      attempt: { update: jest.fn().mockResolvedValue({ ...(attempt as object), status: 'in_progress' }) },
    } as never;

    await service.registerBrowserActivityViolation(tx, blockingExam, attempt, 'tab_switch');

    expect((tx as never as { attempt: { update: jest.Mock } }).attempt.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ browserActivityViolationCount: 2, status: 'in_progress', pausedAt: null }) }),
    );
  });

  it('blocks a non-bypassed attempt at the same strike, proving the exam config is otherwise unchanged', async () => {
    const attempt = {
      id: 'a3', examId: 'exam-1', candidateId: 'c1', status: 'in_progress',
      webcamViolationCount: 1, browserActivityViolationCount: 0, pausedDurationMs: 0,
      proctoringBypassedAt: null,
    } as never;
    const tx = {
      proctoringEvent: { create: jest.fn().mockResolvedValue({ id: 'e3' }) },
      attempt: { update: jest.fn().mockResolvedValue({ ...(attempt as object), status: 'blocked' }) },
    } as never;

    await service.registerWebcamViolation(tx, blockingExam, attempt, 'no_face', 'data:,');

    expect((tx as never as { attempt: { update: jest.Mock } }).attempt.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'blocked' }) }),
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd "D:/exam app/apps/exam-runtime" && npx jest src/grading/attempt-settlement.service.spec.ts -t "bypassed attempts"
```

Expected: FAIL — the first two tests assert `status: 'in_progress'` / `pausedAt: null` but receive `status: 'blocked'` / a `Date`.

- [ ] **Step 3: Pass the attempt at both settlement call sites**

In `apps/exam-runtime/src/grading/attempt-settlement.service.ts`, change line 249 inside `registerWebcamViolation` from:

```ts
    const { enforcement, strikeLimit } = resolveProctoringConfig(exam);
```

to:

```ts
    const { enforcement, strikeLimit } = resolveProctoringConfig(exam, attempt);
```

Make the identical change at line 307 inside `registerBrowserActivityViolation`.

- [ ] **Step 4: Pass the attempt at both attempt-service call sites**

In `apps/exam-runtime/src/attempts/attempt.service.ts`, inside `reportProctoringEvent` (line 477), change:

```ts
      const proctoring = resolveProctoringConfig(exam);
```

to:

```ts
      const proctoring = resolveProctoringConfig(exam, attempt);
```

Then find the `resolveProctoringConfig(exam)` call inside `webcamViolation` (it guards on `.webcamEnabled`) and pass `attempt` there too, so a single resolver call in that method reflects the attempt's effective policy.

Note: `webcamEnabled` and `disabledSignals` are unaffected by a bypass, so these two changes alter no ingestion behaviour — they exist so that every resolver call in an enforcement path is consistent and a future reader does not have to work out which calls are bypass-aware.

- [ ] **Step 5: Run the full exam-runtime suite**

```bash
cd "D:/exam app/apps/exam-runtime" && npx jest --silent
```

Expected: PASS, no regressions. Every pre-existing test constructs attempts without `proctoringBypassedAt`, which reads as `undefined` and is correctly treated as not bypassed.

- [ ] **Step 6: Commit**

```bash
git add apps/exam-runtime/src/grading/attempt-settlement.service.ts apps/exam-runtime/src/grading/attempt-settlement.service.spec.ts apps/exam-runtime/src/attempts/attempt.service.ts
git commit -m "feat: apply the per-attempt bypass in every enforcement path"
```

---

### Task 4: Internal apply and revoke endpoints

**Files:**
- Create: `apps/exam-runtime/src/internal/dto/proctoring-bypass.dto.ts`
- Modify: `apps/exam-runtime/src/internal/internal.controller.ts` (add after the `unblock` handler at line 62)
- Test: `apps/exam-runtime/src/internal/internal.controller.spec.ts` (create if absent, following `apps/exam-runtime/src/internal/internal-auth.guard.spec.ts` for module-setup style)

**Interfaces:**
- Consumes: `resumeFromPause(tx, attempt, { resetViolationCounters: true })`; the Task 1 columns.
- Produces: `POST /internal/attempts/:id/proctoring-bypass` accepting `{ reason: string; actorUserId: string }`, and `POST /internal/attempts/:id/proctoring-bypass/revoke` accepting `{ actorUserId: string }`. Both return `{ status: string; proctoringBypassedAt: string | null }`.

- [ ] **Step 1: Create the DTOs**

Create `apps/exam-runtime/src/internal/dto/proctoring-bypass.dto.ts`:

```ts
import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';

export class ApplyProctoringBypassDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;

  @IsUUID()
  actorUserId!: string;
}

export class RevokeProctoringBypassDto {
  @IsUUID()
  actorUserId!: string;
}
```

- [ ] **Step 2: Write the failing tests**

Create `apps/exam-runtime/src/internal/internal.controller.spec.ts`. Only the two new handlers are covered; instantiate the controller directly with mocked collaborators rather than booting a Nest module, matching how the settlement spec builds its subject:

```ts
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { InternalController } from './internal.controller';

describe('InternalController proctoring bypass', () => {
  const ACTOR = '11111111-1111-1111-1111-111111111111';
  let tx: { attempt: { findUnique: jest.Mock; update: jest.Mock } };
  let attemptSettlement: { resumeFromPause: jest.Mock };
  let controller: InternalController;

  beforeEach(() => {
    tx = {
      attempt: {
        findUnique: jest.fn(),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ status: 'in_progress', ...data })),
      },
    };
    attemptSettlement = { resumeFromPause: jest.fn().mockResolvedValue({ status: 'in_progress' }) };
    const tenantPrisma = { forTenant: jest.fn((_ctx, fn) => fn(tx)) };
    controller = new InternalController(
      tenantPrisma as never, attemptSettlement as never,
      {} as never, {} as never, {} as never, {} as never, {} as never,
    );
  });

  it('stores the reason, the actor and a timestamp, then resets counters and resumes', async () => {
    const attempt = { id: 'a1', status: 'blocked', pausedAt: new Date(), pausedDurationMs: 0 };
    tx.attempt.findUnique.mockResolvedValue(attempt);

    const result = await controller.applyProctoringBypass('a1', { reason: 'webcam driver crashing', actorUserId: ACTOR });

    expect(tx.attempt.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'a1' },
        data: expect.objectContaining({ proctoringBypassReason: 'webcam driver crashing', proctoringBypassedBy: ACTOR }),
      }),
    );
    expect(tx.attempt.update.mock.calls[0][0].data.proctoringBypassedAt).toBeInstanceOf(Date);
    expect(attemptSettlement.resumeFromPause).toHaveBeenCalledWith(tx, expect.objectContaining({ id: 'a1' }), { resetViolationCounters: true });
    expect(result.status).toBe('in_progress');
  });

  it('clears all three columns on revoke and also resets counters', async () => {
    tx.attempt.findUnique.mockResolvedValue({ id: 'a1', status: 'paused', pausedAt: new Date(), pausedDurationMs: 0, proctoringBypassedAt: new Date() });

    const result = await controller.revokeProctoringBypass('a1', { actorUserId: ACTOR });

    expect(tx.attempt.update).toHaveBeenCalledWith({
      where: { id: 'a1' },
      data: { proctoringBypassedAt: null, proctoringBypassedBy: null, proctoringBypassReason: null },
    });
    expect(attemptSettlement.resumeFromPause).toHaveBeenCalledWith(tx, expect.objectContaining({ id: 'a1' }), { resetViolationCounters: true });
    expect(result.proctoringBypassedAt).toBeNull();
  });

  it('resumes an in_progress attempt without error', async () => {
    tx.attempt.findUnique.mockResolvedValue({ id: 'a1', status: 'in_progress', pausedAt: null, pausedDurationMs: 0 });

    await expect(controller.applyProctoringBypass('a1', { reason: 'flaky wifi', actorUserId: ACTOR })).resolves.toBeDefined();
  });

  it('rejects a settled attempt', async () => {
    tx.attempt.findUnique.mockResolvedValue({ id: 'a1', status: 'submitted', pausedAt: null, pausedDurationMs: 0 });

    await expect(controller.applyProctoringBypass('a1', { reason: 'too late', actorUserId: ACTOR })).rejects.toThrow(BadRequestException);
    expect(tx.attempt.update).not.toHaveBeenCalled();
  });

  it('throws NotFound for a missing attempt', async () => {
    tx.attempt.findUnique.mockResolvedValue(null);

    await expect(controller.applyProctoringBypass('nope', { reason: 'x', actorUserId: ACTOR })).rejects.toThrow(NotFoundException);
  });

  it('re-applying updates the reason rather than erroring', async () => {
    tx.attempt.findUnique.mockResolvedValue({ id: 'a1', status: 'in_progress', pausedAt: null, pausedDurationMs: 0, proctoringBypassedAt: new Date() });

    await expect(controller.applyProctoringBypass('a1', { reason: 'second reason', actorUserId: ACTOR })).resolves.toBeDefined();
    expect(tx.attempt.update.mock.calls[0][0].data.proctoringBypassReason).toBe('second reason');
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

```bash
cd "D:/exam app/apps/exam-runtime" && npx jest src/internal/internal.controller.spec.ts
```

Expected: FAIL — `controller.applyProctoringBypass is not a function`.

- [ ] **Step 4: Implement both handlers**

Add the import to `apps/exam-runtime/src/internal/internal.controller.ts`:

```ts
import { ApplyProctoringBypassDto, RevokeProctoringBypassDto } from './dto/proctoring-bypass.dto';
```

Then insert both handlers directly after the closing brace of `unblock` (line 62):

```ts
  // A bypass is deliberately allowed from in_progress, paused and blocked: the
  // recruiter is rescuing a candidate whose environment keeps tripping false
  // positives, and that candidate may be in any of those three states.
  private static readonly BYPASSABLE_STATUSES = ['in_progress', 'paused', 'blocked'];

  @Post('attempts/:id/proctoring-bypass')
  async applyProctoringBypass(@Param('id') id: string, @Body() dto: ApplyProctoringBypassDto) {
    return this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, async (tx) => {
      const attempt = await tx.attempt.findUnique({ where: { id } });
      if (!attempt) {
        throw new NotFoundException(`Attempt ${id} not found`);
      }
      if (!InternalController.BYPASSABLE_STATUSES.includes(attempt.status)) {
        throw new BadRequestException(`Attempt ${id} cannot be bypassed from status "${attempt.status}"`);
      }
      const bypassedAt = new Date();
      await tx.attempt.update({
        where: { id },
        data: {
          proctoringBypassedAt: bypassedAt,
          proctoringBypassedBy: dto.actorUserId,
          proctoringBypassReason: dto.reason,
        },
      });
      // Reset counters and resume: the candidate may already be paused or blocked by
      // the very false positives being forgiven, so leaving them stuck would defeat
      // the point of the bypass.
      const resumed = await this.attemptSettlement.resumeFromPause(tx, attempt, { resetViolationCounters: true });
      return { status: resumed.status, proctoringBypassedAt: bypassedAt.toISOString() };
    });
  }

  @Post('attempts/:id/proctoring-bypass/revoke')
  async revokeProctoringBypass(@Param('id') id: string, @Body() _dto: RevokeProctoringBypassDto) {
    return this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, async (tx) => {
      const attempt = await tx.attempt.findUnique({ where: { id } });
      if (!attempt) {
        throw new NotFoundException(`Attempt ${id} not found`);
      }
      await tx.attempt.update({
        where: { id },
        data: { proctoringBypassedAt: null, proctoringBypassedBy: null, proctoringBypassReason: null },
      });
      // Counters must reset here too. Warn mode still increments them, so an attempt
      // that spent time bypassed can sit far past the strike limit -- restoring
      // enforcement without clearing them would block the candidate instantly.
      const resumed = await this.attemptSettlement.resumeFromPause(tx, attempt, { resetViolationCounters: true });
      return { status: resumed.status, proctoringBypassedAt: null };
    });
  }
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd "D:/exam app/apps/exam-runtime" && npx jest src/internal/internal.controller.spec.ts
```

Expected: PASS, 6 tests.

- [ ] **Step 6: Commit**

```bash
git add apps/exam-runtime/src/internal/dto/proctoring-bypass.dto.ts apps/exam-runtime/src/internal/internal.controller.ts apps/exam-runtime/src/internal/internal.controller.spec.ts
git commit -m "feat: add internal proctoring bypass apply and revoke endpoints"
```

---

### Task 5: apps/api passthrough with audit

**Files:**
- Modify: `apps/api/src/exam-runtime-client/exam-runtime-internal.client.ts` (after `unblock`, line 51)
- Create: `apps/api/src/attempts-admin/dto/bypass-proctoring.dto.ts`
- Modify: `apps/api/src/attempts-admin/attempts-admin.service.ts` (after `unblock`, line 52)
- Modify: `apps/api/src/attempts-admin/attempts-admin.controller.ts` (after the `unblock` route, line 33)
- Test: `apps/api/src/attempts-admin/attempts-admin.service.spec.ts`

**Interfaces:**
- Consumes: the two internal endpoints from Task 4.
- Produces: `POST /attempts/:id/proctoring-bypass` with body `{ reason: string }` and `POST /attempts/:id/proctoring-bypass/revoke` with no body, both requiring the `exam:manage` permission and returning `{ status: string; proctoringBypassedAt: string | null }`.

- [ ] **Step 1: Add the two client methods**

In `apps/api/src/exam-runtime-client/exam-runtime-internal.client.ts`, insert after the `unblock` method. Follow the neighbouring methods exactly — `baseUrl()` must not carry an `/api/v1` suffix because it is appended here:

```ts
  async applyProctoringBypass(
    attemptId: string,
    payload: { reason: string; actorUserId: string },
  ): Promise<{ status: string; proctoringBypassedAt: string | null }> {
    const response = await this.fetchWithTimeout(`${this.baseUrl()}/api/v1/internal/attempts/${attemptId}/proctoring-bypass`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(payload),
    });
    await this.throwIfNotOk(response);
    return response.json();
  }

  async revokeProctoringBypass(
    attemptId: string,
    payload: { actorUserId: string },
  ): Promise<{ status: string; proctoringBypassedAt: string | null }> {
    const response = await this.fetchWithTimeout(`${this.baseUrl()}/api/v1/internal/attempts/${attemptId}/proctoring-bypass/revoke`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(payload),
    });
    await this.throwIfNotOk(response);
    return response.json();
  }
```

- [ ] **Step 2: Create the public DTO**

Create `apps/api/src/attempts-admin/dto/bypass-proctoring.dto.ts`:

```ts
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class BypassProctoringDto {
  // Mandatory: an unexplained enforcement override on a hiring record is worse
  // than no override, because nobody can later tell why it was granted.
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}
```

- [ ] **Step 3: Write the failing service tests**

Append to `apps/api/src/attempts-admin/attempts-admin.service.spec.ts`, matching how the existing `unblock` test builds its mocks:

```ts
describe('proctoring bypass', () => {
  it('calls the runtime with the reason and actor, then audits', async () => {
    examRuntime.applyProctoringBypass = jest.fn().mockResolvedValue({ status: 'in_progress', proctoringBypassedAt: '2026-07-26T00:00:00.000Z' });
    tenantPrisma.forTenant.mockImplementation((_ctx: unknown, fn: (tx: unknown) => unknown) =>
      fn({ attempt: { findFirst: jest.fn().mockResolvedValue({ id: 'a1' }) } }),
    );

    const result = await service.bypassProctoring(context, 'a1', 'user-1', 'webcam driver crashing');

    expect(examRuntime.applyProctoringBypass).toHaveBeenCalledWith('a1', { reason: 'webcam driver crashing', actorUserId: 'user-1' });
    expect(audit.record).toHaveBeenCalledWith(context, {
      actorUserId: 'user-1',
      action: 'attempt.proctoring_bypassed',
      entityType: 'attempt',
      entityId: 'a1',
      metadata: { reason: 'webcam driver crashing' },
    });
    expect(result.status).toBe('in_progress');
  });

  it('audits the revoke with its own action name', async () => {
    examRuntime.revokeProctoringBypass = jest.fn().mockResolvedValue({ status: 'in_progress', proctoringBypassedAt: null });
    tenantPrisma.forTenant.mockImplementation((_ctx: unknown, fn: (tx: unknown) => unknown) =>
      fn({ attempt: { findFirst: jest.fn().mockResolvedValue({ id: 'a1' }) } }),
    );

    await service.revokeProctoringBypass(context, 'a1', 'user-1');

    expect(audit.record).toHaveBeenCalledWith(context, {
      actorUserId: 'user-1',
      action: 'attempt.proctoring_bypass_revoked',
      entityType: 'attempt',
      entityId: 'a1',
    });
  });

  it('refuses an attempt outside the caller organization', async () => {
    examRuntime.applyProctoringBypass = jest.fn();
    tenantPrisma.forTenant.mockImplementation((_ctx: unknown, fn: (tx: unknown) => unknown) =>
      fn({ attempt: { findFirst: jest.fn().mockResolvedValue(null) } }),
    );

    await expect(service.bypassProctoring(context, 'a1', 'user-1', 'nope')).rejects.toThrow(NotFoundException);
    expect(examRuntime.applyProctoringBypass).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

```bash
cd "D:/exam app/apps/api" && npx jest src/attempts-admin/attempts-admin.service.spec.ts -t "proctoring bypass"
```

Expected: FAIL — `service.bypassProctoring is not a function`.

- [ ] **Step 5: Implement the service methods**

In `apps/api/src/attempts-admin/attempts-admin.service.ts`, insert after `unblock`:

```ts
  async bypassProctoring(
    context: TenantContext,
    attemptId: string,
    actorUserId: string,
    reason: string,
  ): Promise<{ status: string; proctoringBypassedAt: string | null }> {
    await this.requireOwnedAttempt(context, attemptId);

    const result = await this.examRuntime.applyProctoringBypass(attemptId, { reason, actorUserId });

    await this.audit.record(context, {
      actorUserId,
      action: 'attempt.proctoring_bypassed',
      entityType: 'attempt',
      entityId: attemptId,
      metadata: { reason },
    });

    return result;
  }

  async revokeProctoringBypass(
    context: TenantContext,
    attemptId: string,
    actorUserId: string,
  ): Promise<{ status: string; proctoringBypassedAt: string | null }> {
    await this.requireOwnedAttempt(context, attemptId);

    const result = await this.examRuntime.revokeProctoringBypass(attemptId, { actorUserId });

    await this.audit.record(context, {
      actorUserId,
      action: 'attempt.proctoring_bypass_revoked',
      entityType: 'attempt',
      entityId: attemptId,
    });

    return result;
  }
```

- [ ] **Step 6: Add the two routes**

In `apps/api/src/attempts-admin/attempts-admin.controller.ts`, add the import:

```ts
import { BypassProctoringDto } from './dto/bypass-proctoring.dto';
```

and insert after the `unblock` route:

```ts
  @Post(':id/proctoring-bypass')
  @RequirePermissions('exam:manage')
  bypassProctoring(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body() dto: BypassProctoringDto,
  ) {
    return this.attemptsAdminService.bypassProctoring(tenant, id, userId, dto.reason);
  }

  @Post(':id/proctoring-bypass/revoke')
  @RequirePermissions('exam:manage')
  revokeProctoringBypass(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Param('id') id: string) {
    return this.attemptsAdminService.revokeProctoringBypass(tenant, id, userId);
  }
```

- [ ] **Step 7: Run the api suite and typecheck**

```bash
cd "D:/exam app/apps/api" && npx jest src/attempts-admin && npx tsc --noEmit
```

Expected: PASS on all attempts-admin specs; `tsc` silent.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/exam-runtime-client/exam-runtime-internal.client.ts apps/api/src/attempts-admin/
git commit -m "feat: expose proctoring bypass through the staff API with audit records"
```

---

### Task 6: Roster reports bypass state

The recruiter UI needs to know an attempt is bypassed after a page refresh, so the flag must ride the roster rather than local mutation state.

**Files:**
- Modify: `apps/exam-runtime/src/monitoring/monitoring.service.ts:8-18` and `:62-72`
- Modify: `apps/web/lib/types.ts:507-517`
- Test: `apps/exam-runtime/src/monitoring/monitoring.service.spec.ts`

**Interfaces:**
- Consumes: `Attempt.proctoringBypassedAt` from Task 1.
- Produces: `RosterRow.proctoringBypassed: boolean` in both `apps/exam-runtime/src/monitoring/monitoring.service.ts` and `apps/web/lib/types.ts`. The two declarations are separate and must stay in sync.

- [ ] **Step 1: Write the failing test**

Append to `apps/exam-runtime/src/monitoring/monitoring.service.spec.ts`, following the existing `getRosterSnapshot` tests' mock shape:

```ts
it('reports proctoringBypassed true only for a bypassed attempt', async () => {
  const tx = {
    exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1', durationMinutes: 60 }) },
    invitation: {
      findMany: jest.fn().mockResolvedValue([
        {
          candidateId: 'c1', id: 'i1', extraTimePercent: 0, status: 'invited', candidate: { name: 'Bypassed' },
          attempt: {
            id: 'a1', status: 'in_progress', questionOrderJson: '["q1"]', startedAt: new Date(),
            lastSeenAt: new Date(), proctoringBypassedAt: new Date(),
          },
        },
        {
          candidateId: 'c2', id: 'i2', extraTimePercent: 0, status: 'invited', candidate: { name: 'Normal' },
          attempt: {
            id: 'a2', status: 'in_progress', questionOrderJson: '["q1"]', startedAt: new Date(),
            lastSeenAt: new Date(), proctoringBypassedAt: null,
          },
        },
        {
          candidateId: 'c3', id: 'i3', extraTimePercent: 0, status: 'invited', candidate: { name: 'Not started' },
          attempt: null,
        },
      ]),
    },
    answer: { count: jest.fn().mockResolvedValue(0) },
  };
  tenantPrisma.forTenant.mockImplementation((_ctx: unknown, fn: (tx: unknown) => unknown) => fn(tx));

  const rows = await service.getRosterSnapshot(context, 'exam-1');

  expect(rows[0].proctoringBypassed).toBe(true);
  expect(rows[1].proctoringBypassed).toBe(false);
  expect(rows[2].proctoringBypassed).toBe(false);
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd "D:/exam app/apps/exam-runtime" && npx jest src/monitoring/monitoring.service.spec.ts -t "proctoringBypassed"
```

Expected: FAIL — `expect(received).toBe(true)` received `undefined`.

- [ ] **Step 3: Add the field to the runtime interface and builder**

In `apps/exam-runtime/src/monitoring/monitoring.service.ts`, add to the `RosterRow` interface after `totalQuestions`:

```ts
  proctoringBypassed: boolean;
```

and add to the `rows.push({ ... })` object after `totalQuestions`:

```ts
          proctoringBypassed: attempt?.proctoringBypassedAt != null,
```

- [ ] **Step 4: Mirror the field on the web type**

In `apps/web/lib/types.ts`, add to the `RosterRow` interface after `totalQuestions`:

```ts
  proctoringBypassed: boolean;
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd "D:/exam app/apps/exam-runtime" && npx jest src/monitoring
```

Expected: PASS, all monitoring specs green.

- [ ] **Step 6: Commit**

```bash
git add apps/exam-runtime/src/monitoring/monitoring.service.ts apps/exam-runtime/src/monitoring/monitoring.service.spec.ts apps/web/lib/types.ts
git commit -m "feat: report per-attempt proctoring bypass state on the live roster"
```

---

### Task 7: Recruiter UI

**Files:**
- Modify: `apps/web/lib/hooks/useAttemptModeration.ts`
- Modify: `apps/web/components/LiveMonitoringPanel.tsx`
- Test: `apps/web/components/LiveMonitoringPanel.test.tsx`

**Interfaces:**
- Consumes: the two routes from Task 5; `RosterRow.proctoringBypassed` from Task 6.
- Produces: `useBypassProctoring()` (variables `{ attemptId: string; reason: string }`) and `useRevokeProctoringBypass()` (variables `attemptId: string`).

- [ ] **Step 1: Add the two mutations**

Append to `apps/web/lib/hooks/useAttemptModeration.ts`:

```ts
export function useBypassProctoring() {
  const { accessToken } = useAuth();
  return useMutation({
    mutationFn: ({ attemptId, reason }: { attemptId: string; reason: string }) =>
      apiFetch(`/attempts/${attemptId}/proctoring-bypass`, { method: 'POST', body: JSON.stringify({ reason }) }, accessToken ?? undefined),
  });
}

export function useRevokeProctoringBypass() {
  const { accessToken } = useAuth();
  return useMutation({
    mutationFn: (attemptId: string) =>
      apiFetch(`/attempts/${attemptId}/proctoring-bypass/revoke`, { method: 'POST', body: JSON.stringify({}) }, accessToken ?? undefined),
  });
}
```

- [ ] **Step 2: Write the failing tests**

Append to `apps/web/components/LiveMonitoringPanel.test.tsx`, following how the existing unblock tests stub `useExamMonitoring` and `fetch`:

```ts
describe('proctoring bypass', () => {
  it('keeps the confirm button disabled until a reason is typed', async () => {
    renderPanelWithRoster([
      { candidateId: 'c1', candidateName: 'Ann', invitationId: 'i1', attemptId: 'a1', status: 'in_progress',
        online: true, remainingSeconds: 600, answeredCount: 1, totalQuestions: 5, proctoringBypassed: false },
    ]);

    await userEvent.click(await screen.findByRole('button', { name: 'Relax proctoring' }));

    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled();

    await userEvent.type(screen.getByLabelText('Why are you relaxing proctoring?'), 'webcam driver crashing');

    expect(screen.getByRole('button', { name: 'Confirm' })).not.toBeDisabled();
  });

  it('shows a badge and a restore action for an already-bypassed attempt', async () => {
    renderPanelWithRoster([
      { candidateId: 'c1', candidateName: 'Ann', invitationId: 'i1', attemptId: 'a1', status: 'in_progress',
        online: true, remainingSeconds: 600, answeredCount: 1, totalQuestions: 5, proctoringBypassed: true },
    ]);

    expect(await screen.findByText('Proctoring relaxed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Restore proctoring' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Relax proctoring' })).not.toBeInTheDocument();
  });
});
```

`renderPanelWithRoster` may not exist yet. Read `apps/web/components/LiveMonitoringPanel.test.tsx` first; if the existing unblock tests inline their provider and `useExamMonitoring` scaffolding, extract it in this same commit with this contract:

```ts
function renderPanelWithRoster(roster: RosterRow[]): void;
```

It stubs `useExamMonitoring` to return `{ roster, alerts: [], connectionStatus: 'connected', joinError: null }` and renders `<LiveMonitoringPanel examId="exam-1" />` inside the same providers the existing tests use. Move the existing tests onto it too, so the scaffolding exists once.

- [ ] **Step 3: Run the tests to verify they fail**

```bash
cd "D:/exam app/apps/web" && npx jest components/LiveMonitoringPanel.test.tsx -t "proctoring bypass"
```

Expected: FAIL — unable to find a button named `Relax proctoring`.

- [ ] **Step 4: Wire the UI**

In `apps/web/components/LiveMonitoringPanel.tsx`, extend the hook import:

```ts
import { useUnblockAttempt, useBypassProctoring, useRevokeProctoringBypass } from '../lib/hooks/useAttemptModeration';
```

Add to the component body beside the existing `unblockAttempt`:

```ts
  const bypassProctoring = useBypassProctoring();
  const revokeProctoringBypass = useRevokeProctoringBypass();
  const [bypassAttemptId, setBypassAttemptId] = useState<string | null>(null);
  const [bypassReason, setBypassReason] = useState('');

  function handleConfirmBypass() {
    if (!bypassAttemptId || !bypassReason.trim()) return;
    bypassProctoring.mutate(
      { attemptId: bypassAttemptId, reason: bypassReason.trim() },
      {
        onSuccess: () => {
          toast('Proctoring relaxed for this candidate.', 'success');
          setBypassAttemptId(null);
          setBypassReason('');
        },
        onError: () => toast("Couldn't relax proctoring — please try again.", 'error'),
      },
    );
  }
```

In the actions column renderer, add beside the existing Unblock/View log buttons:

```tsx
          {row.attemptId && row.proctoringBypassed ? (
            <button
              onClick={() => {
                revokeProctoringBypass.mutate(row.attemptId as string, {
                  onSuccess: () => toast('Proctoring restored.', 'success'),
                  onError: () => toast("Couldn't restore proctoring — please try again.", 'error'),
                });
              }}
              disabled={revokeProctoringBypass.isPending}
              className="rounded-full border border-gray-300 px-2 py-0.5 text-xs text-gray-700 hover:bg-gray-50"
            >
              Restore proctoring
            </button>
          ) : null}
          {row.attemptId && !row.proctoringBypassed ? (
            <button
              onClick={() => setBypassAttemptId(row.attemptId)}
              className="rounded-full border border-gray-300 px-2 py-0.5 text-xs text-gray-700 hover:bg-gray-50"
            >
              Relax proctoring
            </button>
          ) : null}
```

Render the badge inside the status column renderer, after the existing status `<Badge>`:

```tsx
          {row.proctoringBypassed ? <Badge variant="warning">Proctoring relaxed</Badge> : null}
```

Add the modal beside the existing proctoring-log modal:

```tsx
      {bypassAttemptId ? (
        <Modal open title="Relax proctoring for this candidate" onClose={() => { setBypassAttemptId(null); setBypassReason(''); }}>
          <p className="mb-3 text-sm text-recruiter-text-secondary">
            Violations will still be recorded, but this candidate will no longer be paused or blocked. Only this candidate is
            affected.
          </p>
          <label htmlFor="bypass-reason" className="mb-1 block text-sm font-medium text-gray-700">
            Why are you relaxing proctoring?
          </label>
          <textarea
            id="bypass-reason"
            value={bypassReason}
            onChange={(event) => setBypassReason(event.target.value)}
            rows={3}
            maxLength={500}
            className="mb-4 w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => { setBypassAttemptId(null); setBypassReason(''); }}
              className="rounded-full border border-gray-300 px-3 py-1 text-xs text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmBypass}
              disabled={!bypassReason.trim() || bypassProctoring.isPending}
              className="rounded-full bg-primary px-3 py-1 text-xs text-white disabled:opacity-50"
            >
              Confirm
            </button>
          </div>
        </Modal>
      ) : null}
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd "D:/exam app/apps/web" && npx jest components/LiveMonitoringPanel.test.tsx
```

Expected: PASS, all tests in the file including the pre-existing unblock ones.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/hooks/useAttemptModeration.ts apps/web/components/LiveMonitoringPanel.tsx apps/web/components/LiveMonitoringPanel.test.tsx
git commit -m "feat: add relax/restore proctoring actions to live monitoring"
```

---

### Task 8: Integrity report discloses the bypass

Without this, a bypassed attempt can produce a spotless integrity report, and a reviewer cannot tell "no violations enforced" from "no violations occurred".

**Files:**
- Modify: `apps/exam-runtime/src/integrity/integrity-analysis.service.ts:107-137`
- Test: `apps/exam-runtime/src/integrity/integrity-analysis.service.spec.ts`

**Interfaces:**
- Consumes: `Attempt.proctoringBypassedAt` / `proctoringBypassReason` from Task 1; `resolveProctoringConfig(exam, attempt)` from Task 2.
- Produces: no new exports. The stored `IntegrityAnalysis.narrative` gains a leading disclosure sentence when the attempt was bypassed. `flagsJson` and `level` are deliberately unchanged.

- [ ] **Step 1: Write the failing tests**

Append to `apps/exam-runtime/src/integrity/integrity-analysis.service.spec.ts`, following the existing tests' setup:

```ts
describe('bypass disclosure', () => {
  it('prepends a disclosure to the clear narrative when no flags were raised', async () => {
    const analysis = await runAnalysisWith({
      proctoringBypassedAt: new Date('2026-07-26T10:30:00.000Z'),
      proctoringBypassReason: 'webcam driver crashing',
      webcamViolationCount: 0,
      events: [],
    });

    expect(analysis.narrative).toContain('Proctoring enforcement was relaxed by a recruiter');
    expect(analysis.narrative).toContain('webcam driver crashing');
  });

  it('leaves the integrity level untouched, so a bypass never penalises the candidate', async () => {
    const analysis = await runAnalysisWith({
      proctoringBypassedAt: new Date('2026-07-26T10:30:00.000Z'),
      proctoringBypassReason: 'flaky wifi',
      webcamViolationCount: 0,
      events: [],
    });

    expect(analysis.level).toBe('clear');
    expect(JSON.parse(analysis.flagsJson ?? '[]')).toEqual([]);
  });

  it('adds no disclosure when the attempt was never bypassed', async () => {
    const analysis = await runAnalysisWith({
      proctoringBypassedAt: null,
      proctoringBypassReason: null,
      webcamViolationCount: 0,
      events: [],
    });

    expect(analysis.narrative).not.toContain('relaxed by a recruiter');
  });

  it('does not report a block when enforcement was bypassed past the strike limit', async () => {
    const analysis = await runAnalysisWith({
      proctoringBypassedAt: new Date('2026-07-26T10:30:00.000Z'),
      proctoringBypassReason: 'driver crash',
      webcamViolationCount: 9,
      events: [],
    });

    const flags = JSON.parse(analysis.flagsJson ?? '[]') as { type: string; detail: string }[];
    const webcamFlag = flags.find((flag) => flag.type === 'webcam_violations');
    expect(webcamFlag?.detail).not.toContain('session blocked');
  });
});
```

`runAnalysisWith` does not exist yet. Before writing these tests, read `apps/exam-runtime/src/integrity/integrity-analysis.service.spec.ts` in full and extract a helper from the mock scaffolding the existing tests already build, with exactly this contract:

```ts
async function runAnalysisWith(overrides: {
  proctoringBypassedAt: Date | null;
  proctoringBypassReason: string | null;
  webcamViolationCount: number;
  events: { eventType: string; severity: string }[];
}): Promise<{ narrative: string | null; level: string; flagsJson: string | null }>;
```

It must build the attempt with those four fields, attach an exam configured `proctoringEnforcement: 'block'` with `proctoringStrikeLimit: 3` and `webcamProctoringEnabled: true`, run the service's analysis entry point, and return the payload passed to the `integrityAnalysis` upsert/create call. Refactor the existing tests onto the same helper in this commit so the scaffolding exists once rather than twice.

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd "D:/exam app/apps/exam-runtime" && npx jest src/integrity/integrity-analysis.service.spec.ts -t "bypass disclosure"
```

Expected: FAIL — the narrative lacks the disclosure text, and the webcam flag still says `session blocked`.

- [ ] **Step 3: Make the blocked derivation bypass-aware**

In `apps/exam-runtime/src/integrity/integrity-analysis.service.ts`, change line 111 from:

```ts
      const proctoring = resolveProctoringConfig(attempt.invitation.exam);
```

to:

```ts
      const proctoring = resolveProctoringConfig(attempt.invitation.exam, attempt);
```

This alone fixes the fourth test: a bypassed attempt resolves to `'warn'`, so `blocked` becomes `false` and the flag stops claiming the session was blocked — which is accurate, because it never was.

- [ ] **Step 4: Prepend the disclosure to both narrative branches**

Still in `apps/exam-runtime/src/integrity/integrity-analysis.service.ts`, add this helper as a private method on the service:

```ts
  // The disclosure belongs in the narrative, not in flagsJson: IntegrityFlag severity
  // is only 'medium' | 'high', so a bypass flag would push an otherwise-clean attempt
  // to 'review' and penalise a candidate for a fault the recruiter accommodated.
  private bypassDisclosure(attempt: { proctoringBypassedAt: Date | null; proctoringBypassReason: string | null }): string | null {
    if (!attempt.proctoringBypassedAt) {
      return null;
    }
    const when = attempt.proctoringBypassedAt.toISOString();
    const reason = attempt.proctoringBypassReason?.trim() || 'no reason recorded';
    return `Proctoring enforcement was relaxed by a recruiter at ${when} (reason: ${reason}). Violations after that point were recorded but not acted on, so the absence of a pause or block does not imply the absence of violations.`;
  }
```

Then, where the narrative is decided (the `if (flags.length === 0) { narrative = CLEAR_NARRATIVE; } else { ... }` block starting at line 135), prepend the disclosure to whichever narrative was produced. Immediately after that block completes and before the analysis is persisted, insert:

```ts
      const disclosure = this.bypassDisclosure(attempt);
      if (disclosure) {
        narrative = narrative ? `${disclosure}\n\n${narrative}` : disclosure;
      }
```

Place it so it applies to the `CLEAR_NARRATIVE` path, the AI-generated path, and the AI-failure path where `narrative` may be `null` — one insertion after the branch covers all three.

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd "D:/exam app/apps/exam-runtime" && npx jest src/integrity
```

Expected: PASS, all integrity specs green.

- [ ] **Step 6: Commit**

```bash
git add apps/exam-runtime/src/integrity/integrity-analysis.service.ts apps/exam-runtime/src/integrity/integrity-analysis.service.spec.ts
git commit -m "feat: disclose a proctoring bypass in the integrity narrative"
```

---

### Task 9: Full verification and deployment

**GATED: do not deploy without explicit user approval.**

**Files:** none modified.

**Interfaces:**
- Consumes: everything from Tasks 1-8.
- Produces: a verified production deployment.

- [ ] **Step 1: Run all three suites and both typechecks**

```bash
cd "D:/exam app/apps/api" && npx jest --silent && npx tsc --noEmit
```

```bash
cd "D:/exam app/apps/exam-runtime" && npx jest --silent && npx tsc --noEmit
```

```bash
cd "D:/exam app/apps/web" && npx jest --silent
```

Expected: all green, no regressions against the pre-change counts.

- [ ] **Step 2: Verify locally in the browser**

Start the dev servers via the preview tooling (never plain `bash`), seed if needed, then confirm end to end: a candidate attempt that is paused/blocked can be relaxed from Live Monitoring with a reason; further violations are recorded in the proctoring log but no longer pause the candidate; "Restore proctoring" returns it to normal; and the reason is required before Confirm enables.

- [ ] **Step 3: Confirm production has no live attempts before restarting**

```bash
ssh -i "$KEY" ptcsfadmin@20.219.132.226 'cd ~/app && DB_URL=$(grep "^DATABASE_URL=" apps/api/.env | head -1 | cut -d= -f2- | sed -e "s/^\"//" -e "s/\"$//") && DATABASE_URL="$DB_URL" node -e "const {PrismaClient}=require(\"./node_modules/@prisma/client\");const p=new PrismaClient();p.\$queryRawUnsafe(\"SELECT COUNT(*) as c FROM attempts WHERE status = N'"'"'in_progress'"'"' AND last_seen_at > DATEADD(minute, -15, GETUTCDATE())\").then(r=>{console.log(JSON.stringify(r));return p.\$disconnect();});"'
```

Expected: `[{"c":0}]`. This deployment restarts `exam-runtime`, which would interrupt a live exam session.

- [ ] **Step 4: Ask the user for deployment approval**

Report the test results and the live-attempt count, then ask before proceeding. Do not continue without an explicit yes.

- [ ] **Step 5: Deploy**

`KEY="/c/Users/HariSivaSaiKumarMada/Downloads/PTC-VSS-SF-Interview-VM_key.pem"`, host `ptcsfadmin@20.219.132.226`, app root `~/app`.

Transfer exactly these, **one `scp` call each with its own full destination path** — never batch, because `scp` silently overwrites by basename:

```
apps/api/prisma/schema.prisma
apps/api/prisma/migrations/20260726090000_attempt_proctoring_bypass/migration.sql   (mkdir -p the remote dir first)
apps/api/src/exam-runtime-client/exam-runtime-internal.client.ts
apps/api/src/attempts-admin/dto/bypass-proctoring.dto.ts
apps/api/src/attempts-admin/attempts-admin.service.ts
apps/api/src/attempts-admin/attempts-admin.controller.ts
apps/exam-runtime/src/attempts/proctoring-config.ts
apps/exam-runtime/src/attempts/attempt.service.ts
apps/exam-runtime/src/grading/attempt-settlement.service.ts
apps/exam-runtime/src/internal/dto/proctoring-bypass.dto.ts
apps/exam-runtime/src/internal/internal.controller.ts
apps/exam-runtime/src/monitoring/monitoring.service.ts
apps/exam-runtime/src/integrity/integrity-analysis.service.ts
apps/web/lib/types.ts
apps/web/lib/hooks/useAttemptModeration.ts
apps/web/components/LiveMonitoringPanel.tsx
```

Then `grep` each remote file for a distinctive string from the change to prove it landed — a mid-batch SSH reset drops the remainder silently without failing loudly.

On the VM, in order:

```bash
cd ~/app && DB_URL=$(grep "^DATABASE_URL=" apps/api/.env | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//') && DATABASE_URL="$DB_URL" npx prisma migrate status --schema=apps/api/prisma/schema.prisma
```

Confirm only `20260726090000_attempt_proctoring_bypass` is pending, then:

```bash
cd ~/app && DB_URL=$(grep "^DATABASE_URL=" apps/api/.env | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//') && DATABASE_URL="$DB_URL" npx prisma migrate deploy --schema=apps/api/prisma/schema.prisma && DATABASE_URL="$DB_URL" npx prisma generate --schema=apps/api/prisma/schema.prisma
```

Then build all three in the background with done-markers so an SSH drop cannot kill them:

```bash
cd ~/app && rm -f /tmp/b-*.done /tmp/b-*.fail
for a in api exam-runtime web; do nohup bash -c "npm run build --workspace=apps/$a && touch /tmp/b-$a.done || touch /tmp/b-$a.fail" > /tmp/b-$a.log 2>&1 & disown; done
```

Poll for all three `.done` markers, then the web standalone asset copy (a fresh `next build` does not place these inside the standalone output, and skipping it 404s every asset):

```bash
cd ~/app/apps/web && cp -r .next/static .next/standalone/apps/web/.next/static && cp -r public .next/standalone/apps/web/public
```

Finally `pm2 restart api exam-runtime web`. All three restart because this change touches all three.

- [ ] **Step 6: Verify in production**

Confirm the site responds (homepage and login 200), then exercise the real endpoint against a real attempt: apply a bypass, confirm the roster reports `proctoringBypassed: true`, revoke it, and confirm it returns to false. Restore any data touched during verification.

- [ ] **Step 7: Record the work in Azure DevOps**

Org `https://dev.azure.com/PIDC-Salesforce`, project `Interview App`, pre-authenticated `az boards` CLI. Create one Feature parented to Epic `6084`, with User Stories beneath it for: the bypass state and resolver override (Tasks 1-3), the apply/revoke endpoints and audit trail (Tasks 4-5), the Live Monitoring action (Tasks 6-7), and the integrity narrative disclosure (Task 8).

Each description must be substantive HTML covering the problem, the behaviour, and acceptance criteria — not a restated title. Note that `az boards work-item create` returns the numeric id via `grep -oE '"id": [0-9]+,'` on its JSON output; `--output tsv --fields` is not valid for this command. Close the items once Step 6 passes.

## Out of Scope

- Time-limited or auto-expiring bypasses.
- Per-signal bypass for a single attempt.
- Candidate-visible notification that proctoring was relaxed.
- Anything from `docs/superpowers/specs/2026-07-25-screen-capture-evidence-design.md` — that is a separate later feature.
