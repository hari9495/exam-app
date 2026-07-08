# Phase 2b (Live Monitoring) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a recruiter a live WebSocket view of an exam in progress — roster with online/offline/progress/remaining-time, proctoring flags as they happen, submission events — plus a way to message a candidate mid-exam, delivered on their next request.

**Architecture:** A new `MonitoringModule` (socket.io gateway + a plain roster-computation service) is the first real-time piece in this project. No Redis — a single in-process `MonitoringGateway` with socket.io rooms (one room per exam) and a lightweight in-process `setInterval` for presence diffing. Candidates stay REST-only; presence is inferred from a new `Attempt.lastSeenAt` column, updated automatically by an interceptor. Four existing services (`AttemptService`, `AttemptSettlementService`, `CandidateAuthService`, `AttemptsAdminService`) each get `MonitoringGateway` injected directly — no event bus, the simplest thing that works for a single-instance app.

**Tech Stack:** NestJS, Prisma (`sqlserver` provider), SQL Server, Jest/Supertest — plus `@nestjs/websockets`, `@nestjs/platform-socket.io`, `socket.io` (new), and `socket.io-client` (new, dev-only, for e2e verification).

## Global Constraints

- **No Redis, no multi-instance fan-out.** A plain in-process `setInterval` and an in-memory socket.io room registry are the entire mechanism — this is deliberately deferred infrastructure, not an oversight (see the design spec's Section 1).
- **Candidates never get a WebSocket connection in this phase.** All candidate-facing behavior remains REST, exactly as it is today. Presence is inferred from `Attempt.lastSeenAt`; messages are delivered on the candidate's next `GET /attempt/current` call, not pushed live.
- **`MonitoringModule` must NOT import `GradingModule`, to avoid a module-level circular dependency.** `GradingModule` needs to import `MonitoringModule` (so `AttemptSettlementService` can emit `attempt:status`), so the dependency can only run one direction. `MonitoringService` therefore must NOT inject `AttemptSettlementService` — it uses a new plain pure function, `computeRemainingSeconds` (extracted from `AttemptSettlementService.remainingSeconds` into `grading.ts` in Task 3), imported directly with no DI. This is the load-bearing reason Task 3 exists before Task 4.
- **Presence/timer behavior is a best-effort UI signal, not a correctness-critical operation.** Unlike Phase 1d's auto-submit-on-access (which had to be lazy-but-guaranteed-correct), a missed or slightly-stale presence tick has zero data-integrity consequence — it just means a recruiter's dashboard is briefly out of date. This is why a plain `setInterval` is acceptable here where a real scheduler was avoided elsewhere.
- **Gateway emit calls happen synchronously inside the same DB transaction/callback as the write that triggers them**, for simplicity — e.g. `AttemptSettlementService.finalize()` emits `attempt:status` immediately after `tx.attempt.update(...)`, before the enclosing `forTenant`/`$transaction` call has necessarily committed. This is an accepted, deliberate simplification: socket.io's `.emit()` never throws for an empty/nonexistent room (it's a safe no-op), and the small window where a UI notification could theoretically precede a (rare) transaction rollback has no correctness impact — it is exactly the same class of "advisory, not authoritative" signal the roster and presence data already are.
- **Roster data has no REST fallback in this phase.** `MonitoringService.getRosterSnapshot` is only reachable via the WebSocket `join-exam` flow.
- **Online/offline threshold (30 seconds) and presence-timer interval (15 seconds) are hardcoded constants**, not configurable per organization.
- **`CandidateMessage` has no Row-Level Security policy of its own** — same precedent as `ProctoringEvent`/`Answer`/`Result`, reached only through `Attempt` → `Invitation` → `Exam`.
- The recruiter-facing WebSocket connection authenticates with the SAME staff JWT (`JWT_ACCESS_SECRET`) used everywhere else — no new secret, no new token type.
- Migrations are applied with `npx prisma migrate deploy`, **never** `npx prisma migrate dev` (`migrate dev --create-only` reliably fails with P3014 in this environment — hand-write the migration SQL, as every prior schema task in this project has done).
- Every timestamp-style column default must use `DEFAULT GETUTCDATE()`, never `DEFAULT CURRENT_TIMESTAMP`.
- **Never edit an already-applied migration file's SQL text in place.**
- Required (non-optional) `class-validator` DTO properties must use a definite-assignment assertion (`body!: string;`).
- Full spec: `docs/superpowers/specs/2026-07-08-phase-2b-live-monitoring-design.md`. Full prior context: `docs/superpowers/plans/2026-07-08-phase-2a-session-enforcement-anti-cheat.md`.

---

## File Structure

```
apps/api/
  package.json                                            # Modify: add @nestjs/websockets, @nestjs/platform-socket.io,
                                                            #         socket.io deps; socket.io-client devDep
  prisma/
    schema.prisma                                          # Modify: Attempt.lastSeenAt, add CandidateMessage
    migrations/
      20260709090000_live_monitoring_schema/
        migration.sql                                       # Create: 1 column addition + candidate_messages table
  src/
    attempts/
      last-seen.interceptor.ts                              # Create: bumps Attempt.lastSeenAt on candidate requests
      last-seen.interceptor.spec.ts                          # Create
      attempt.controller.ts                                  # Modify: apply LastSeenInterceptor
      dto/
        send-candidate-message.dto.ts                        # Create: { body }
      attempt.service.ts                                     # Modify: getCurrent() returns+marks-read messages
      attempt.service.spec.ts                                # Modify: add message tests
      attempts-admin.service.ts                              # Modify: sendMessage/listMessages, emit wiring
      attempts-admin.service.spec.ts                         # Modify: add message + emit tests
      attempts.controller.ts                                 # Modify: add message routes
      attempt.module.ts                                      # Modify: import MonitoringModule
    grading/
      grading.ts                                             # Modify: extract computeRemainingSeconds
      grading.spec.ts                                        # Modify: add computeRemainingSeconds tests
      attempt-settlement.service.ts                          # Modify: delegate to computeRemainingSeconds,
                                                              #         inject MonitoringGateway, emit attempt:status
      attempt-settlement.service.spec.ts                     # Modify: mock MonitoringGateway, add emit test
      grading.module.ts                                      # Modify: import MonitoringModule
    candidate-auth/
      candidate-auth.service.ts                              # Modify: inject MonitoringGateway, emit proctoring:flag
      candidate-auth.service.spec.ts                         # Modify: add emit test
      candidate-auth.module.ts                               # Modify: import MonitoringModule
    monitoring/
      monitoring.service.ts                                  # Create: getRosterSnapshot, isOnline
      monitoring.service.spec.ts                             # Create
      monitoring.gateway.ts                                  # Create: connection auth, join-exam, emits, presence timer
      monitoring.gateway.spec.ts                             # Create
      monitoring.module.ts                                   # Create
  test/
    live-monitoring.e2e-spec.ts                              # Create
```

---

### Task 1: Schema for last-seen presence and candidate messages

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260709090000_live_monitoring_schema/migration.sql`

**Interfaces:**
- Produces: `Attempt.lastSeenAt: Date | null`, Prisma model `CandidateMessage` (fields: `id`, `attemptId`, `sentByUserId`, `body`, `sentAt`, `readAt`, relation `attempt`) — every later task relies on these exact field names.

- [ ] **Step 1: Modify `Attempt` and add `CandidateMessage` to schema.prisma**

In `apps/api/prisma/schema.prisma`, add one field to `Attempt` (after `deviceFingerprint`):
```prisma
model Attempt {
  id                String            @id @default(uuid()) @db.UniqueIdentifier
  invitationId      String            @unique @map("invitation_id") @db.UniqueIdentifier
  candidateId       String            @map("candidate_id") @db.UniqueIdentifier
  examId            String            @map("exam_id") @db.UniqueIdentifier
  status            String            @default("in_progress")
  questionOrderJson String            @map("question_order_json") @db.NVarChar(Max)
  startedAt         DateTime          @default(now()) @map("started_at")
  submittedAt       DateTime?         @map("submitted_at")
  deviceFingerprint String?           @map("device_fingerprint")
  lastSeenAt        DateTime?         @map("last_seen_at")
  invitation        Invitation        @relation(fields: [invitationId], references: [id], onDelete: Cascade)
  answers           Answer[]
  result            Result?
  proctoringEvents  ProctoringEvent[]
  messages          CandidateMessage[]

  @@index([examId, status])
  @@map("attempts")
}
```

Add a new model at the end of the file (after `ProctoringEvent`):
```prisma
model CandidateMessage {
  id           String    @id @default(uuid()) @db.UniqueIdentifier
  attemptId    String    @map("attempt_id") @db.UniqueIdentifier
  sentByUserId String    @map("sent_by_user_id") @db.UniqueIdentifier
  body         String    @db.NVarChar(Max)
  sentAt       DateTime  @default(now()) @map("sent_at")
  readAt       DateTime? @map("read_at")
  attempt      Attempt   @relation(fields: [attemptId], references: [id], onDelete: Cascade)

  @@index([attemptId, sentAt])
  @@map("candidate_messages")
}
```

- [ ] **Step 2: Generate the migration**

Run (from `apps/api/`): `npx prisma migrate dev --create-only --name live_monitoring_schema`
Expected: fails with a P3014 shadow-database permission error, same as every prior schema task in this project. Hand-write the migration SQL directly (Step 3).

- [ ] **Step 3: Write the migration SQL by hand**

`apps/api/prisma/migrations/20260709090000_live_monitoring_schema/migration.sql`:
```sql
-- AlterTable: attempts gains a last-seen timestamp, bumped automatically on every candidate
-- request (see the LastSeenInterceptor). Never required, never blocks anything.
ALTER TABLE [dbo].[attempts] ADD [last_seen_at] DATETIME2;

-- CreateTable
CREATE TABLE [dbo].[candidate_messages] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [attempt_id] UNIQUEIDENTIFIER NOT NULL,
    [sent_by_user_id] UNIQUEIDENTIFIER NOT NULL,
    [body] NVARCHAR(MAX) NOT NULL,
    [sent_at] DATETIME2 NOT NULL CONSTRAINT [candidate_messages_sent_at_df] DEFAULT GETUTCDATE(),
    [read_at] DATETIME2,
    CONSTRAINT [candidate_messages_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [candidate_messages_attempt_id_sent_at_idx] ON [dbo].[candidate_messages]([attempt_id], [sent_at]);

-- AddForeignKey
ALTER TABLE [dbo].[candidate_messages] ADD CONSTRAINT [candidate_messages_attempt_id_fkey] FOREIGN KEY ([attempt_id]) REFERENCES [dbo].[attempts]([id]) ON DELETE CASCADE ON UPDATE CASCADE;
```

Note: `candidate_messages` gets no RLS policy and no FK on `sent_by_user_id` (a plain denormalized column, matching how `attempts.candidate_id`/`attempts.exam_id` are already plain denormalized columns) — the real ownership path is always `candidate_message → attempt → invitation → exam`.

- [ ] **Step 4: Apply the migration**

Run: `npx prisma migrate deploy`, then `npx prisma generate`.
Expected: migration applies cleanly; `@prisma/client` types now include `CandidateMessage` and `Attempt.lastSeenAt`.

- [ ] **Step 5: Verify against the real database**

Run: `sqlcmd -S localhost,1433 -U examapp_dev -P 'DevPassw0rd!2026' -d examapp -Q "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'candidate_messages'" -C`
Expected: one row returned.

Run: `sqlcmd -S localhost,1433 -U examapp_dev -P 'DevPassw0rd!2026' -d examapp -Q "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='attempts' AND COLUMN_NAME='last_seen_at'" -C`
Expected: one row returned.

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat: add last-seen presence tracking and candidate messages schema"
```

---

### Task 2: LastSeenInterceptor

**Files:**
- Create: `apps/api/src/attempts/last-seen.interceptor.ts`
- Create: `apps/api/src/attempts/last-seen.interceptor.spec.ts`
- Modify: `apps/api/src/attempts/attempt.controller.ts`

**Interfaces:**
- Produces: `LastSeenInterceptor`, applied via `@UseInterceptors(LastSeenInterceptor)` on `AttemptController` — bumps `Attempt.lastSeenAt` to `now()` after every successful candidate request, if an attempt exists for the caller's invitation; a no-op otherwise.

- [ ] **Step 1: Write the failing tests**

`apps/api/src/attempts/last-seen.interceptor.spec.ts`:
```typescript
import { CallHandler, ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';
import { LastSeenInterceptor } from './last-seen.interceptor';
import { PrismaService } from '../prisma/prisma.service';

describe('LastSeenInterceptor', () => {
  let interceptor: LastSeenInterceptor;
  let prisma: { attempt: { updateMany: jest.Mock } };

  beforeEach(() => {
    prisma = { attempt: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) } };
    interceptor = new LastSeenInterceptor(prisma as unknown as PrismaService);
  });

  function makeContext(user: { invitationId: string } | undefined): ExecutionContext {
    return {
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    } as unknown as ExecutionContext;
  }

  function makeHandler(): CallHandler {
    return { handle: () => of({ ok: true }) };
  }

  it('bumps lastSeenAt for the caller invitation after a successful request', (done) => {
    const context = makeContext({ invitationId: 'inv-1' });

    interceptor.intercept(context, makeHandler()).subscribe(() => {
      expect(prisma.attempt.updateMany).toHaveBeenCalledWith({
        where: { invitationId: 'inv-1' },
        data: { lastSeenAt: expect.any(Date) },
      });
      done();
    });
  });

  it('does nothing when there is no authenticated candidate on the request', (done) => {
    const context = makeContext(undefined);

    interceptor.intercept(context, makeHandler()).subscribe(() => {
      expect(prisma.attempt.updateMany).not.toHaveBeenCalled();
      done();
    });
  });

  it('still returns the handler response unchanged', (done) => {
    const context = makeContext({ invitationId: 'inv-1' });

    interceptor.intercept(context, makeHandler()).subscribe((result) => {
      expect(result).toEqual({ ok: true });
      done();
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:api -- last-seen.interceptor`
Expected: FAIL — `LastSeenInterceptor` is not defined yet.

- [ ] **Step 3: Implement the interceptor**

`apps/api/src/attempts/last-seen.interceptor.ts`:
```typescript
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import { CandidateSession } from '../candidate-auth/current-candidate.decorator';

@Injectable()
export class LastSeenInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const candidate = request.user as CandidateSession | undefined;

    return next.handle().pipe(
      tap(() => {
        if (!candidate?.invitationId) {
          return;
        }
        void this.prisma.attempt.updateMany({
          where: { invitationId: candidate.invitationId },
          data: { lastSeenAt: new Date() },
        });
      }),
    );
  }
}
```

`updateMany` (not `update`) is deliberate: if no `Attempt` exists yet for this invitation (candidate hasn't started), it matches zero rows and does nothing, rather than throwing a "record not found" error the way `update` would.

- [ ] **Step 4: Apply the interceptor to AttemptController**

In `apps/api/src/attempts/attempt.controller.ts`, add the import and decorator:
```typescript
import { Body, Controller, Get, Post, UseGuards, UseInterceptors } from '@nestjs/common';
import { CandidateJwtAuthGuard } from '../candidate-auth/candidate-jwt-auth.guard';
import { CurrentCandidate, CandidateSession } from '../candidate-auth/current-candidate.decorator';
import { LastSeenInterceptor } from './last-seen.interceptor';
import { AttemptService } from './attempt.service';
import { AnswerDto } from './dto/answer.dto';
import { StartAttemptDto } from './dto/start-attempt.dto';
import { ReportProctoringEventDto } from './dto/report-proctoring-event.dto';

@Controller('attempt')
@UseGuards(CandidateJwtAuthGuard)
@UseInterceptors(LastSeenInterceptor)
export class AttemptController {
```
(No other change to this file — every existing route method stays exactly as it is; only the class-level decorators gain `@UseInterceptors(LastSeenInterceptor)`.)

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test:api -- last-seen.interceptor`
Expected: `3 passed`.

Run: `npm run test:api` (from repo root)
Expected: all suites passing, no regressions.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/attempts/last-seen.interceptor.ts apps/api/src/attempts/last-seen.interceptor.spec.ts apps/api/src/attempts/attempt.controller.ts
git commit -m "feat: bump Attempt.lastSeenAt automatically on every candidate request"
```

---

### Task 3: Extract computeRemainingSeconds into grading.ts

**Files:**
- Modify: `apps/api/src/grading/grading.ts`
- Modify: `apps/api/src/grading/grading.spec.ts`
- Modify: `apps/api/src/grading/attempt-settlement.service.ts`
- Modify: `apps/api/src/grading/attempt-settlement.service.spec.ts`

**Interfaces:**
- Produces: `computeRemainingSeconds(durationMinutes: number, startedAt: Date): number` — a plain, dependency-free pure function. Task 4's `MonitoringService` imports this directly (NOT via `AttemptSettlementService` injection) specifically to avoid a module-level circular dependency between `MonitoringModule` and `GradingModule` (see this plan's Global Constraints). `AttemptSettlementService.remainingSeconds` keeps its existing public signature — it becomes a one-line delegation to this new function, so every existing caller (`AttemptService.getCurrent`, `ExamsService.getResults`) needs zero changes.

- [ ] **Step 1: Write the failing test**

In `apps/api/src/grading/grading.spec.ts`, add this `describe` block at the end of the file:
```typescript
describe('computeRemainingSeconds', () => {
  it('returns a positive value before the exam duration has elapsed', () => {
    const startedAt = new Date(Date.now() - 5 * 60_000);
    const seconds = computeRemainingSeconds(30, startedAt);
    expect(seconds).toBeGreaterThan(0);
    expect(seconds).toBeLessThanOrEqual(25 * 60);
  });

  it('returns zero (not negative) once the duration has elapsed', () => {
    const startedAt = new Date(Date.now() - 60 * 60_000);
    expect(computeRemainingSeconds(30, startedAt)).toBe(0);
  });
});
```

And add the import at the top of the file:
```typescript
import { gradeAnswer, computeResult, computeRemainingSeconds } from './grading';
```
(Replace the existing `import { gradeAnswer, computeResult } from './grading';` line with this one.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:api -- grading.spec`
Expected: FAIL — `computeRemainingSeconds` is not exported yet.

- [ ] **Step 3: Implement**

In `apps/api/src/grading/grading.ts`, add this function (anywhere in the file, e.g. after `computeResult`):
```typescript
export function computeRemainingSeconds(durationMinutes: number, startedAt: Date): number {
  const deadline = new Date(startedAt).getTime() + durationMinutes * 60_000;
  return Math.max(0, Math.round((deadline - Date.now()) / 1000));
}
```

In `apps/api/src/grading/attempt-settlement.service.ts`, update the import and delegate:
```typescript
import { Injectable } from '@nestjs/common';
import { Attempt, Prisma } from '@prisma/client';
import { gradeAnswer, computeResult, computeRemainingSeconds } from './grading';

export interface SettlementExam {
  id: string;
  durationMinutes: number;
  passCriteriaPercent: number;
}

@Injectable()
export class AttemptSettlementService {
  remainingSeconds(exam: Pick<SettlementExam, 'durationMinutes'>, attempt: { startedAt: Date }): number {
    return computeRemainingSeconds(exam.durationMinutes, attempt.startedAt);
  }

  private isExpired(exam: Pick<SettlementExam, 'durationMinutes'>, attempt: { startedAt: Date }): boolean {
    return this.remainingSeconds(exam, attempt) <= 0;
  }
```
(The rest of the file — `settleIfExpired`, `finalize` — is unchanged in this task; `finalize` gains `MonitoringGateway` injection in Task 6, not here.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:api -- grading.spec attempt-settlement.service`
Expected: both files' full suites pass (grading.spec gains 2 tests; attempt-settlement.service's existing 6 tests are unaffected, since `remainingSeconds`'s observable behavior is identical, only its internal implementation delegates now).

Run: `npm run test:api` (from repo root)
Expected: all suites passing.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/grading/grading.ts apps/api/src/grading/grading.spec.ts apps/api/src/grading/attempt-settlement.service.ts
git commit -m "refactor: extract computeRemainingSeconds as a dependency-free pure function"
```

---

### Task 4: MonitoringService.getRosterSnapshot

**Files:**
- Create: `apps/api/src/monitoring/monitoring.service.ts`
- Create: `apps/api/src/monitoring/monitoring.service.spec.ts`

**Interfaces:**
- Consumes: `TenantPrismaService.forTenant` (Phase 0), `computeRemainingSeconds` (Task 3, exact signature).
- Produces: `MonitoringService.getRosterSnapshot(context: TenantContext, examId: string): Promise<RosterRow[]>`, `MonitoringService.isOnline(lastSeenAt: Date | null): boolean` — Task 5's `MonitoringGateway` calls these exact names.

- [ ] **Step 1: Write the failing tests**

`apps/api/src/monitoring/monitoring.service.spec.ts`:
```typescript
import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { MonitoringService } from './monitoring.service';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';

describe('MonitoringService', () => {
  let service: MonitoringService;
  let tenantPrisma: { forTenant: jest.Mock };
  const context = { organizationId: 'org-1', isSuperAdmin: false };
  const exam = { id: 'exam-1', organizationId: 'org-1', durationMinutes: 60, passCriteriaPercent: 40 };

  beforeEach(async () => {
    tenantPrisma = { forTenant: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [MonitoringService, { provide: TenantPrismaService, useValue: tenantPrisma }],
    }).compile();
    service = moduleRef.get(MonitoringService);
  });

  describe('isOnline', () => {
    it('returns true when lastSeenAt is within the last 30 seconds', () => {
      expect(service.isOnline(new Date(Date.now() - 5_000))).toBe(true);
    });

    it('returns false when lastSeenAt is older than 30 seconds', () => {
      expect(service.isOnline(new Date(Date.now() - 45_000))).toBe(false);
    });

    it('returns false when lastSeenAt is null', () => {
      expect(service.isOnline(null)).toBe(false);
    });
  });

  describe('getRosterSnapshot', () => {
    it('throws NotFoundException when the exam does not belong to the caller organization', async () => {
      const tx = { exam: { findFirst: jest.fn().mockResolvedValue(null) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.getRosterSnapshot(context, 'exam-1')).rejects.toThrow(NotFoundException);
    });

    it('returns one row per invitation, with nulls for a candidate who has not started', async () => {
      const tx = {
        exam: { findFirst: jest.fn().mockResolvedValue(exam) },
        invitation: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'inv-1', candidateId: 'cand-1', status: 'invited', candidate: { name: 'Alice' }, attempt: null },
          ]),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.getRosterSnapshot(context, 'exam-1');

      expect(result).toEqual([
        {
          candidateId: 'cand-1', candidateName: 'Alice', invitationId: 'inv-1', attemptId: null,
          status: 'invited', online: false, remainingSeconds: null, answeredCount: null, totalQuestions: null,
        },
      ]);
    });

    it('returns full progress/presence/remaining-time data for an in-progress attempt', async () => {
      const recentLastSeen = new Date(Date.now() - 5_000);
      const attempt = {
        id: 'attempt-1', status: 'in_progress', startedAt: new Date(Date.now() - 5 * 60_000),
        lastSeenAt: recentLastSeen, questionOrderJson: JSON.stringify(['q1', 'q2', 'q3']),
      };
      const tx = {
        exam: { findFirst: jest.fn().mockResolvedValue(exam) },
        invitation: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'inv-1', candidateId: 'cand-1', status: 'invited', candidate: { name: 'Alice' }, attempt },
          ]),
        },
        answer: { count: jest.fn().mockResolvedValue(2) },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.getRosterSnapshot(context, 'exam-1');

      expect(result[0]).toEqual({
        candidateId: 'cand-1', candidateName: 'Alice', invitationId: 'inv-1', attemptId: 'attempt-1',
        status: 'in_progress', online: true, remainingSeconds: expect.any(Number), answeredCount: 2, totalQuestions: 3,
      });
    });

    it('reports offline and no remainingSeconds for a submitted attempt', async () => {
      const attempt = {
        id: 'attempt-1', status: 'submitted', startedAt: new Date(Date.now() - 65 * 60_000),
        lastSeenAt: new Date(Date.now() - 60 * 60_000), questionOrderJson: JSON.stringify(['q1']),
      };
      const tx = {
        exam: { findFirst: jest.fn().mockResolvedValue(exam) },
        invitation: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'inv-1', candidateId: 'cand-1', status: 'invited', candidate: { name: 'Alice' }, attempt },
          ]),
        },
        answer: { count: jest.fn().mockResolvedValue(1) },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.getRosterSnapshot(context, 'exam-1');

      expect(result[0].online).toBe(false);
      expect(result[0].remainingSeconds).toBeNull();
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:api -- monitoring.service`
Expected: FAIL — `MonitoringService` is not defined yet.

- [ ] **Step 3: Implement the service**

`apps/api/src/monitoring/monitoring.service.ts`:
```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { TenantContext } from '../prisma/tenant-context';
import { computeRemainingSeconds } from '../grading/grading';

const ONLINE_THRESHOLD_MS = 30_000;

export interface RosterRow {
  candidateId: string;
  candidateName: string;
  invitationId: string;
  attemptId: string | null;
  status: string;
  online: boolean;
  remainingSeconds: number | null;
  answeredCount: number | null;
  totalQuestions: number | null;
}

@Injectable()
export class MonitoringService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  isOnline(lastSeenAt: Date | null): boolean {
    if (!lastSeenAt) {
      return false;
    }
    return Date.now() - new Date(lastSeenAt).getTime() <= ONLINE_THRESHOLD_MS;
  }

  async getRosterSnapshot(context: TenantContext, examId: string): Promise<RosterRow[]> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const exam = await tx.exam.findFirst({ where: { id: examId, organizationId: context.organizationId as string } });
      if (!exam) {
        throw new NotFoundException(`Exam ${examId} not found`);
      }

      const invitations = await tx.invitation.findMany({
        where: { examId },
        include: { candidate: true, attempt: true },
        orderBy: [{ invitedAt: 'desc' }, { id: 'desc' }],
      });

      const rows: RosterRow[] = [];
      for (const invitation of invitations) {
        const attempt = invitation.attempt;
        let answeredCount: number | null = null;
        let totalQuestions: number | null = null;
        let remainingSeconds: number | null = null;

        if (attempt) {
          totalQuestions = (JSON.parse(attempt.questionOrderJson) as string[]).length;
          answeredCount = await tx.answer.count({ where: { attemptId: attempt.id } });
          if (attempt.status === 'in_progress') {
            remainingSeconds = computeRemainingSeconds(exam.durationMinutes, attempt.startedAt);
          }
        }

        rows.push({
          candidateId: invitation.candidateId,
          candidateName: invitation.candidate.name,
          invitationId: invitation.id,
          attemptId: attempt?.id ?? null,
          status: attempt?.status ?? invitation.status,
          online: attempt ? this.isOnline(attempt.lastSeenAt) : false,
          remainingSeconds,
          answeredCount,
          totalQuestions,
        });
      }
      return rows;
    });
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:api -- monitoring.service`
Expected: `7 passed`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/monitoring/monitoring.service.ts apps/api/src/monitoring/monitoring.service.spec.ts
git commit -m "feat: add MonitoringService.getRosterSnapshot"
```

---

### Task 5: MonitoringGateway (connection auth + join-exam) and MonitoringModule

**Files:**
- Modify: `apps/api/package.json`
- Create: `apps/api/src/monitoring/monitoring.gateway.ts`
- Create: `apps/api/src/monitoring/monitoring.gateway.spec.ts`
- Create: `apps/api/src/monitoring/monitoring.module.ts`

**Interfaces:**
- Consumes: `MonitoringService.getRosterSnapshot` (Task 4, exact signature).
- Produces: `MonitoringGateway` with `emitAttemptStatus`, `emitProctoringFlag`, `emitMessageSent` methods (bodies added in this task; consumed by Tasks 6-8), a `'join-exam'` message handler, and staff-JWT connection authentication. `MonitoringModule` exports `MonitoringGateway`.

- [ ] **Step 1: Add dependencies**

In `apps/api/package.json`, add to `dependencies`:
```json
    "@nestjs/platform-socket.io": "^10.3.0",
    "@nestjs/websockets": "^10.3.0",
    "socket.io": "^4.7.5",
```

Run (from repo root): `npm install`
Expected: installs cleanly, `package-lock.json` updated.

- [ ] **Step 2: Write the failing tests**

`apps/api/src/monitoring/monitoring.gateway.spec.ts`:
```typescript
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { MonitoringGateway } from './monitoring.gateway';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { MonitoringService } from './monitoring.service';

describe('MonitoringGateway', () => {
  let gateway: MonitoringGateway;
  let jwt: JwtService;
  let prisma: { rolePermission: { findFirst: jest.Mock } };
  let tenantPrisma: { forTenant: jest.Mock };
  let monitoring: { getRosterSnapshot: jest.Mock };

  function makeSocket(overrides: Record<string, unknown> = {}) {
    return {
      handshake: { auth: {} },
      data: {},
      disconnect: jest.fn(),
      join: jest.fn().mockResolvedValue(undefined),
      emit: jest.fn(),
      ...overrides,
    } as any;
  }

  beforeEach(async () => {
    prisma = { rolePermission: { findFirst: jest.fn() } };
    tenantPrisma = { forTenant: jest.fn() };
    monitoring = { getRosterSnapshot: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        MonitoringGateway,
        JwtService,
        { provide: PrismaService, useValue: prisma },
        { provide: TenantPrismaService, useValue: tenantPrisma },
        { provide: MonitoringService, useValue: monitoring },
      ],
    }).compile();

    gateway = moduleRef.get(MonitoringGateway);
    jwt = moduleRef.get(JwtService);
    process.env.JWT_ACCESS_SECRET = 'test-staff-access-secret';
  });

  describe('handleConnection', () => {
    it('disconnects a socket with no auth token', () => {
      const socket = makeSocket();

      gateway.handleConnection(socket);

      expect(socket.disconnect).toHaveBeenCalledWith(true);
    });

    it('disconnects a socket with an invalid token', () => {
      const socket = makeSocket({ handshake: { auth: { token: 'not-a-real-jwt' } } });

      gateway.handleConnection(socket);

      expect(socket.disconnect).toHaveBeenCalledWith(true);
    });

    it('attaches the decoded staff user to the socket for a valid token', () => {
      const token = jwt.sign(
        { sub: 'user-1', organizationId: 'org-1', role: 'recruiter' },
        { secret: process.env.JWT_ACCESS_SECRET },
      );
      const socket = makeSocket({ handshake: { auth: { token } } });

      gateway.handleConnection(socket);

      expect(socket.disconnect).not.toHaveBeenCalled();
      expect(socket.data.user).toEqual({ userId: 'user-1', organizationId: 'org-1', role: 'recruiter' });
    });
  });

  describe('handleJoinExam', () => {
    it('disconnects a socket with no authenticated user', async () => {
      const socket = makeSocket();

      await gateway.handleJoinExam(socket, { examId: 'exam-1' });

      expect(socket.disconnect).toHaveBeenCalledWith(true);
    });

    it('emits an error and does not join when the role lacks exam:manage', async () => {
      const socket = makeSocket({ data: { user: { userId: 'user-1', organizationId: 'org-1', role: 'panel' } } });
      prisma.rolePermission.findFirst.mockResolvedValue(null);

      await gateway.handleJoinExam(socket, { examId: 'exam-1' });

      expect(socket.emit).toHaveBeenCalledWith('error', { message: 'Missing required permission: exam:manage' });
      expect(socket.join).not.toHaveBeenCalled();
    });

    it('emits an error when the roster lookup throws (exam not found / not owned)', async () => {
      const socket = makeSocket({ data: { user: { userId: 'user-1', organizationId: 'org-1', role: 'recruiter' } } });
      prisma.rolePermission.findFirst.mockResolvedValue({ role: 'recruiter' });
      monitoring.getRosterSnapshot.mockRejectedValue(new Error('not found'));

      await gateway.handleJoinExam(socket, { examId: 'exam-1' });

      expect(socket.emit).toHaveBeenCalledWith('error', { message: 'Exam exam-1 not found' });
      expect(socket.join).not.toHaveBeenCalled();
    });

    it('joins the exam room and emits a roster snapshot on success', async () => {
      const socket = makeSocket({ data: { user: { userId: 'user-1', organizationId: 'org-1', role: 'recruiter' } } });
      prisma.rolePermission.findFirst.mockResolvedValue({ role: 'recruiter' });
      const roster = [{ candidateId: 'cand-1' }];
      monitoring.getRosterSnapshot.mockResolvedValue(roster);

      await gateway.handleJoinExam(socket, { examId: 'exam-1' });

      expect(socket.join).toHaveBeenCalledWith('exam:exam-1');
      expect(socket.emit).toHaveBeenCalledWith('roster:snapshot', roster);
      expect(monitoring.getRosterSnapshot).toHaveBeenCalledWith({ organizationId: 'org-1', isSuperAdmin: false }, 'exam-1');
    });
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm run test:api -- monitoring.gateway`
Expected: FAIL — `MonitoringGateway` is not defined yet.

- [ ] **Step 4: Implement the gateway**

`apps/api/src/monitoring/monitoring.gateway.ts`:
```typescript
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { MonitoringService, RosterRow } from './monitoring.service';

interface StaffSocketUser {
  userId: string;
  organizationId: string | null;
  role: string;
}

export const PRESENCE_TICK_MS = 15_000;
const EXAM_ROOM_PREFIX = 'exam:';

@WebSocketGateway({ namespace: '/monitoring', cors: { origin: process.env.WEB_ORIGIN } })
export class MonitoringGateway implements OnGatewayConnection, OnGatewayInit {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(MonitoringGateway.name);
  private readonly lastPresence = new Map<string, boolean>();

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly monitoring: MonitoringService,
  ) {}

  afterInit(): void {
    setInterval(() => {
      this.tickPresence().catch((error) => this.logger.error('Presence tick failed', error as Error));
    }, PRESENCE_TICK_MS);
  }

  handleConnection(client: Socket): void {
    const token = client.handshake.auth?.token as string | undefined;
    if (!token) {
      client.disconnect(true);
      return;
    }
    try {
      const payload = this.jwt.verify(token, { secret: process.env.JWT_ACCESS_SECRET }) as {
        sub: string;
        organizationId: string | null;
        role: string;
      };
      (client.data as { user?: StaffSocketUser }).user = {
        userId: payload.sub,
        organizationId: payload.organizationId,
        role: payload.role,
      };
    } catch {
      client.disconnect(true);
    }
  }

  @SubscribeMessage('join-exam')
  async handleJoinExam(@ConnectedSocket() client: Socket, @MessageBody() body: { examId: string }): Promise<void> {
    const user = (client.data as { user?: StaffSocketUser }).user;
    if (!user) {
      client.disconnect(true);
      return;
    }

    const hasPermission = await this.hasExamManagePermission(user.role);
    if (!hasPermission) {
      client.emit('error', { message: 'Missing required permission: exam:manage' });
      return;
    }

    const context = { organizationId: user.organizationId, isSuperAdmin: user.role === 'super_admin' };
    let roster: RosterRow[];
    try {
      roster = await this.monitoring.getRosterSnapshot(context, body.examId);
    } catch {
      client.emit('error', { message: `Exam ${body.examId} not found` });
      return;
    }

    await client.join(`${EXAM_ROOM_PREFIX}${body.examId}`);
    client.emit('roster:snapshot', roster);
  }

  emitAttemptStatus(examId: string, payload: { attemptId: string; candidateId: string; status: string }): void {
    this.server?.to(`${EXAM_ROOM_PREFIX}${examId}`).emit('attempt:status', payload);
  }

  emitProctoringFlag(
    examId: string,
    payload: { attemptId: string; candidateId: string; eventType: string; severity: string; occurredAt: Date },
  ): void {
    this.server?.to(`${EXAM_ROOM_PREFIX}${examId}`).emit('proctoring:flag', payload);
  }

  emitMessageSent(examId: string, payload: { attemptId: string; candidateId: string; sentAt: Date }): void {
    this.server?.to(`${EXAM_ROOM_PREFIX}${examId}`).emit('message:sent', payload);
  }

  private async hasExamManagePermission(role: string): Promise<boolean> {
    const grant = await this.prisma.rolePermission.findFirst({ where: { role, permission: { key: 'exam:manage' } } });
    return !!grant;
  }

  private async tickPresence(): Promise<void> {
    const rooms = this.server.sockets.adapter.rooms;
    for (const roomName of rooms.keys()) {
      if (!roomName.startsWith(EXAM_ROOM_PREFIX)) {
        continue;
      }
      const examId = roomName.slice(EXAM_ROOM_PREFIX.length);

      const exam = await this.tenantPrisma
        .forTenant({ organizationId: null, isSuperAdmin: true }, (tx) => tx.exam.findUnique({ where: { id: examId } }))
        .catch(() => null);
      if (!exam) {
        continue;
      }

      const roster = await this.monitoring.getRosterSnapshot(
        { organizationId: exam.organizationId, isSuperAdmin: false },
        examId,
      );

      for (const row of roster) {
        if (!row.attemptId) {
          continue;
        }
        const previous = this.lastPresence.get(row.attemptId);
        if (previous !== row.online) {
          this.lastPresence.set(row.attemptId, row.online);
          this.server.to(roomName).emit('roster:presence', {
            attemptId: row.attemptId,
            candidateId: row.candidateId,
            online: row.online,
          });
        }
      }
    }
  }
}
```

Note: `this.server?.to(...)` uses optional chaining in the three public `emit*` methods because unit tests (and, briefly, the moment between module instantiation and the WebSocket server binding) may call these before `@WebSocketServer()` has injected a live `Server` instance — this makes the emit methods safe to call in any test that doesn't itself set up a real socket.io server.

- [ ] **Step 5: Write the module**

`apps/api/src/monitoring/monitoring.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MonitoringGateway } from './monitoring.gateway';
import { MonitoringService } from './monitoring.service';

@Module({
  imports: [JwtModule.register({})],
  providers: [MonitoringGateway, MonitoringService],
  exports: [MonitoringGateway],
})
export class MonitoringModule {}
```

Deliberately does NOT import `GradingModule` — see this plan's Global Constraints for why (avoiding a module-level circular dependency with `GradingModule`, which imports `MonitoringModule` starting in Task 6).

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm run test:api -- monitoring.gateway`
Expected: `7 passed`.

Run: `npm run test:api` (from repo root)
Expected: all suites passing.

Run: `npx nest build` (from `apps/api/`)
Expected: clean build.

- [ ] **Step 7: Commit**

```bash
git add apps/api/package.json package-lock.json apps/api/src/monitoring/monitoring.gateway.ts apps/api/src/monitoring/monitoring.gateway.spec.ts apps/api/src/monitoring/monitoring.module.ts
git commit -m "feat: add MonitoringGateway (staff-authenticated WebSocket, join-exam, presence timer) and MonitoringModule"
```

---

### Task 6: Wire attempt:status emissions

**Files:**
- Modify: `apps/api/src/grading/grading.module.ts`
- Modify: `apps/api/src/grading/attempt-settlement.service.ts`
- Modify: `apps/api/src/grading/attempt-settlement.service.spec.ts`
- Modify: `apps/api/src/attempts/attempt.service.ts`
- Modify: `apps/api/src/attempts/attempt.service.spec.ts`
- Modify: `apps/api/src/attempts/attempt.module.ts`

**Interfaces:**
- Consumes: `MonitoringGateway.emitAttemptStatus` (Task 5, exact signature).
- Produces: `AttemptSettlementService.finalize()` and `AttemptService.start()` (on the newly-created-attempt branch only) each emit `attempt:status` after their existing DB write.

- [ ] **Step 1: Update GradingModule to import MonitoringModule**

`apps/api/src/grading/grading.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { MonitoringModule } from '../monitoring/monitoring.module';
import { AttemptSettlementService } from './attempt-settlement.service';

@Module({
  imports: [MonitoringModule],
  providers: [AttemptSettlementService],
  exports: [AttemptSettlementService],
})
export class GradingModule {}
```

- [ ] **Step 2: Write the failing test for AttemptSettlementService's emit**

In `apps/api/src/grading/attempt-settlement.service.spec.ts`, add the import and update `beforeEach`:
```typescript
import { MonitoringGateway } from '../monitoring/monitoring.gateway';
```
```typescript
describe('AttemptSettlementService', () => {
  let service: AttemptSettlementService;
  let monitoringGateway: { emitAttemptStatus: jest.Mock };
  const exam = { id: 'exam-1', durationMinutes: 30, passCriteriaPercent: 50 };

  beforeEach(() => {
    monitoringGateway = { emitAttemptStatus: jest.fn() };
    service = new AttemptSettlementService(monitoringGateway as unknown as MonitoringGateway);
  });
```

Add this test inside the `describe('finalize', ...)` block:
```typescript
    it('emits attempt:status to the monitoring gateway after finalizing', async () => {
      const attempt = { id: 'attempt-1', candidateId: 'cand-1', examId: 'exam-1', questionOrderJson: JSON.stringify(['q1']) };
      const tx = {
        question: { findMany: jest.fn().mockResolvedValue([{ id: 'q1', marks: 5, options: [{ id: 'opt-a', isCorrect: true }] }]) },
        answer: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
        result: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() },
        attempt: { update: jest.fn().mockResolvedValue({ id: 'attempt-1', status: 'submitted' }) },
      };

      await service.finalize(tx as unknown as Prisma.TransactionClient, exam, attempt as any, 'submitted');

      expect(monitoringGateway.emitAttemptStatus).toHaveBeenCalledWith('exam-1', {
        attemptId: 'attempt-1', candidateId: 'cand-1', status: 'submitted',
      });
    });
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm run test:api -- attempt-settlement.service`
Expected: FAIL — the constructor now requires an argument, and `emitAttemptStatus` is never called yet.

- [ ] **Step 4: Implement the emit**

In `apps/api/src/grading/attempt-settlement.service.ts`, add the import, constructor, and emit call:
```typescript
import { Injectable } from '@nestjs/common';
import { Attempt, Prisma } from '@prisma/client';
import { gradeAnswer, computeResult, computeRemainingSeconds } from './grading';
import { MonitoringGateway } from '../monitoring/monitoring.gateway';

export interface SettlementExam {
  id: string;
  durationMinutes: number;
  passCriteriaPercent: number;
}

@Injectable()
export class AttemptSettlementService {
  constructor(private readonly monitoringGateway: MonitoringGateway) {}

  remainingSeconds(exam: Pick<SettlementExam, 'durationMinutes'>, attempt: { startedAt: Date }): number {
    return computeRemainingSeconds(exam.durationMinutes, attempt.startedAt);
  }

  private isExpired(exam: Pick<SettlementExam, 'durationMinutes'>, attempt: { startedAt: Date }): boolean {
    return this.remainingSeconds(exam, attempt) <= 0;
  }

  async settleIfExpired(tx: Prisma.TransactionClient, exam: SettlementExam, attempt: Attempt): Promise<Attempt> {
    if (attempt.status !== 'in_progress' || !this.isExpired(exam, attempt)) {
      return attempt;
    }
    return this.finalize(tx, exam, attempt, 'auto_submitted');
  }

  async finalize(
    tx: Prisma.TransactionClient,
    exam: SettlementExam,
    attempt: Attempt,
    status: 'submitted' | 'auto_submitted' | 'force_submitted',
  ): Promise<Attempt> {
    const existingResult = await tx.result.findUnique({ where: { attemptId: attempt.id } });
    if (existingResult) {
      return tx.attempt.findUniqueOrThrow({ where: { id: attempt.id } });
    }

    const questionIds: string[] = JSON.parse(attempt.questionOrderJson);
    const questions = await tx.question.findMany({ where: { id: { in: questionIds } }, include: { options: true } });
    const existingAnswers = await tx.answer.findMany({ where: { attemptId: attempt.id } });
    const answersByQuestionId = new Map(existingAnswers.map((answer) => [answer.questionId, answer]));

    const gradedAnswers: { marksAwarded: number }[] = [];
    for (const question of questions) {
      const answer = answersByQuestionId.get(question.id);
      const selectedOptionIds: string[] = answer ? JSON.parse(answer.selectedOptionIdsJson) : [];
      const correctOptionIds = question.options.filter((option) => option.isCorrect).map((option) => option.id);
      const { isCorrect, marksAwarded } = gradeAnswer({ marks: question.marks, correctOptionIds }, selectedOptionIds);
      gradedAnswers.push({ marksAwarded });
      if (answer) {
        await tx.answer.update({ where: { id: answer.id }, data: { isCorrect, marksAwarded } });
      }
    }

    const summary = computeResult(gradedAnswers, questions, exam.passCriteriaPercent);
    await tx.result.create({
      data: {
        attemptId: attempt.id,
        score: summary.score,
        maxScore: summary.maxScore,
        percentage: summary.percentage,
        passFail: summary.passFail,
      },
    });

    const finalized = await tx.attempt.update({ where: { id: attempt.id }, data: { status, submittedAt: new Date() } });
    this.monitoringGateway.emitAttemptStatus(finalized.examId, {
      attemptId: finalized.id,
      candidateId: finalized.candidateId,
      status: finalized.status,
    });
    return finalized;
  }
}
```

- [ ] **Step 5: Write the failing test for AttemptService.start()'s emit**

In `apps/api/src/attempts/attempt.service.spec.ts`, add the import and update `beforeEach`:
```typescript
import { MonitoringGateway } from '../monitoring/monitoring.gateway';
```
```typescript
  let monitoringGateway: { emitAttemptStatus: jest.Mock };

  beforeEach(async () => {
    tenantPrisma = { forTenant: jest.fn() };
    settlement = { settleIfExpired: jest.fn(), finalize: jest.fn(), remainingSeconds: jest.fn() };
    monitoringGateway = { emitAttemptStatus: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AttemptService,
        { provide: TenantPrismaService, useValue: tenantPrisma },
        { provide: AttemptSettlementService, useValue: settlement },
        { provide: MonitoringGateway, useValue: monitoringGateway },
      ],
    }).compile();
    service = moduleRef.get(AttemptService);
  });
```

Add this test inside the `describe('start', ...)` block:
```typescript
    it('emits attempt:status when a new attempt is created', async () => {
      const tx = {
        attempt: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'attempt-1', status: 'in_progress' }) },
        examSection: { findMany: jest.fn().mockResolvedValue([{ questions: [{ questionId: 'q1' }] }]) },
      };
      mockBootstrapThenScoped(tx);

      await service.start(session);

      expect(monitoringGateway.emitAttemptStatus).toHaveBeenCalledWith('exam-1', {
        attemptId: 'attempt-1', candidateId: 'cand-1', status: 'in_progress',
      });
    });

    it('does not emit again when returning an already-existing attempt (idempotent path)', async () => {
      const existing = { id: 'attempt-1', status: 'in_progress' };
      const tx = { attempt: { findUnique: jest.fn().mockResolvedValue(existing), create: jest.fn() } };
      mockBootstrapThenScoped(tx);

      await service.start(session);

      expect(monitoringGateway.emitAttemptStatus).not.toHaveBeenCalled();
    });
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `npm run test:api -- attempt.service`
Expected: FAIL — `AttemptService`'s constructor doesn't accept `MonitoringGateway` yet, and `start()` never emits.

- [ ] **Step 7: Implement the emit in AttemptService.start()**

In `apps/api/src/attempts/attempt.service.ts`, add the import, constructor parameter, and emit call:
```typescript
import { MonitoringGateway } from '../monitoring/monitoring.gateway';
```
```typescript
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly attemptSettlement: AttemptSettlementService,
    private readonly monitoringGateway: MonitoringGateway,
  ) {}
```

Replace the `start` method's body where the attempt is created:
```typescript
      const attempt = await tx.attempt.create({
        data: {
          invitationId: invitation.id,
          candidateId: invitation.candidateId,
          examId: exam.id,
          questionOrderJson: JSON.stringify(questionIds),
          deviceFingerprint: dto.deviceFingerprint,
        },
      });
      this.monitoringGateway.emitAttemptStatus(exam.id, {
        attemptId: attempt.id,
        candidateId: invitation.candidateId,
        status: attempt.status,
      });
      return { id: attempt.id, status: attempt.status };
```
(The early-return branch, when `existing` already has an attempt, is unchanged — no emit there, matching the "only emit on an actual status change" principle.)

- [ ] **Step 8: Register MonitoringModule in AttemptModule**

`apps/api/src/attempts/attempt.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { GradingModule } from '../grading/grading.module';
import { MonitoringModule } from '../monitoring/monitoring.module';
import { AttemptController } from './attempt.controller';
import { AttemptService } from './attempt.service';
import { AttemptsController } from './attempts.controller';
import { AttemptsAdminService } from './attempts-admin.service';

@Module({
  imports: [GradingModule, MonitoringModule],
  controllers: [AttemptController, AttemptsController],
  providers: [AttemptService, AttemptsAdminService],
})
export class AttemptModule {}
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `npm run test:api -- attempt-settlement.service attempt.service`
Expected: both files' full suites pass.

Run: `npm run test:api` (from repo root)
Expected: all suites passing.

Run: `npx nest build` (from `apps/api/`)
Expected: clean build.

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/grading/grading.module.ts apps/api/src/grading/attempt-settlement.service.ts apps/api/src/grading/attempt-settlement.service.spec.ts apps/api/src/attempts/attempt.service.ts apps/api/src/attempts/attempt.service.spec.ts apps/api/src/attempts/attempt.module.ts
git commit -m "feat: emit attempt:status from AttemptSettlementService.finalize and AttemptService.start"
```

---

### Task 7: Wire proctoring:flag emissions

**Files:**
- Modify: `apps/api/src/attempts/attempt.service.ts`
- Modify: `apps/api/src/attempts/attempt.service.spec.ts`
- Modify: `apps/api/src/candidate-auth/candidate-auth.service.ts`
- Modify: `apps/api/src/candidate-auth/candidate-auth.service.spec.ts`
- Modify: `apps/api/src/candidate-auth/candidate-auth.module.ts`

**Interfaces:**
- Consumes: `MonitoringGateway.emitProctoringFlag` (Task 5, exact signature).
- Produces: `AttemptService.reportProctoringEvent()` and `CandidateAuthService.redeem()`'s `multi_login` branch each emit `proctoring:flag` after creating their respective `ProctoringEvent` row.

- [ ] **Step 1: Write the failing test for AttemptService.reportProctoringEvent()'s emit**

In `apps/api/src/attempts/attempt.service.spec.ts`, add this test inside the `describe('reportProctoringEvent', ...)` block:
```typescript
    it('emits proctoring:flag after creating the event', async () => {
      const createdEvent = { id: 'evt-1', eventType: 'tab_switch', severity: 'medium', occurredAt: new Date() };
      const tx = { attempt: { findUnique: jest.fn().mockResolvedValue({ id: 'attempt-1' }) }, proctoringEvent: { create: jest.fn().mockResolvedValue(createdEvent) } };
      mockBootstrapThenScoped(tx);

      await service.reportProctoringEvent(session, { eventType: 'tab_switch' });

      expect(monitoringGateway.emitProctoringFlag).toHaveBeenCalledWith('exam-1', {
        attemptId: 'attempt-1', candidateId: 'cand-1', eventType: 'tab_switch', severity: 'medium', occurredAt: createdEvent.occurredAt,
      });
    });
```

Add `emitProctoringFlag: jest.fn()` to the `monitoringGateway` mock object declared in this file's `beforeEach` (from Task 6):
```typescript
    monitoringGateway = { emitAttemptStatus: jest.fn(), emitProctoringFlag: jest.fn() };
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:api -- attempt.service`
Expected: FAIL — `reportProctoringEvent` never calls `emitProctoringFlag` yet.

- [ ] **Step 3: Implement the emit in AttemptService.reportProctoringEvent()**

In `apps/api/src/attempts/attempt.service.ts`, replace the `reportProctoringEvent` method's body:
```typescript
  async reportProctoringEvent(
    session: CandidateSession,
    dto: ReportProctoringEventDto,
  ): Promise<{ id: string; eventType: string; severity: string }> {
    const { organizationId, exam, invitation } = await this.resolveContext(session.invitationId);

    return this.tenantPrisma.forTenant({ organizationId, isSuperAdmin: false }, async (tx) => {
      const attempt = await tx.attempt.findUnique({ where: { invitationId: invitation.id } });
      if (!attempt) {
        throw new NotFoundException('No attempt has been started');
      }

      const event = await tx.proctoringEvent.create({
        data: {
          attemptId: attempt.id,
          eventType: dto.eventType,
          severity: getProctoringEventSeverity(dto.eventType),
          metadataJson: dto.metadata ? JSON.stringify(dto.metadata) : null,
        },
      });
      this.monitoringGateway.emitProctoringFlag(exam.id, {
        attemptId: attempt.id,
        candidateId: invitation.candidateId,
        eventType: event.eventType,
        severity: event.severity,
        occurredAt: event.occurredAt,
      });
      return { id: event.id, eventType: event.eventType, severity: event.severity };
    });
  }
```
(Note: `resolveContext` already destructures `exam`, previously unused by this method — it's needed now for `exam.id`.)

- [ ] **Step 4: Write the failing test for CandidateAuthService.redeem()'s emit**

In `apps/api/src/candidate-auth/candidate-auth.service.spec.ts`, add the import, extend the mock shape, and add a test:
```typescript
import { MonitoringGateway } from '../monitoring/monitoring.gateway';
```

Update the `Test.createTestingModule` providers array in `beforeEach` to include:
```typescript
    let monitoringGateway: { emitProctoringFlag: jest.Mock };
    monitoringGateway = { emitProctoringFlag: jest.fn() };
```
(add `monitoringGateway` alongside the other `let` declarations at the top of the `describe` block, and add `{ provide: MonitoringGateway, useValue: monitoringGateway }` to the providers array.)

Add this test inside the `describe('redeem', ...)` block:
```typescript
    it('emits proctoring:flag when a multi_login event is logged', async () => {
      prisma.invitation.findUnique.mockResolvedValue({
        id: 'inv-1', candidateId: 'cand-1', status: 'invited', expiresAt: new Date(Date.now() + 86_400_000),
        examId: 'exam-1', activeSessionFamilyId: 'old-family',
      });
      tenantPrisma.forTenant.mockResolvedValue({ id: 'exam-1', status: 'published' });
      prisma.candidateRefreshToken.updateMany.mockResolvedValue({});
      prisma.attempt.findUnique.mockResolvedValue({ id: 'attempt-1' });
      prisma.proctoringEvent.create.mockResolvedValue({ occurredAt: new Date('2026-07-09T00:00:00Z') });
      prisma.candidateRefreshToken.create.mockResolvedValue({});
      prisma.invitation.update.mockResolvedValue({});

      await service.redeem('token');

      expect(monitoringGateway.emitProctoringFlag).toHaveBeenCalledWith('exam-1', {
        attemptId: 'attempt-1', candidateId: 'cand-1', eventType: 'multi_login', severity: 'high',
        occurredAt: new Date('2026-07-09T00:00:00Z'),
      });
    });
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `npm run test:api -- candidate-auth.service`
Expected: FAIL — the constructor doesn't accept `MonitoringGateway` yet, and `redeem()` never emits.

- [ ] **Step 6: Implement the emit in CandidateAuthService.redeem()**

In `apps/api/src/candidate-auth/candidate-auth.service.ts`, add the import and constructor parameter:
```typescript
import { MonitoringGateway } from '../monitoring/monitoring.gateway';
```
```typescript
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly jwt: JwtService,
    private readonly monitoringGateway: MonitoringGateway,
  ) {}
```

Replace the `multi_login` branch inside `redeem()`'s transaction:
```typescript
    return this.prisma.$transaction(async (tx) => {
      if (invitation.activeSessionFamilyId) {
        await tx.candidateRefreshToken.updateMany({
          where: { invitationId: invitation.id, familyId: invitation.activeSessionFamilyId },
          data: { revokedAt: new Date() },
        });
        const existingAttempt = await tx.attempt.findUnique({ where: { invitationId: invitation.id } });
        if (existingAttempt) {
          const event = await tx.proctoringEvent.create({
            data: { attemptId: existingAttempt.id, eventType: 'multi_login', severity: 'high' },
          });
          this.monitoringGateway.emitProctoringFlag(exam.id, {
            attemptId: existingAttempt.id,
            candidateId: invitation.candidateId,
            eventType: 'multi_login',
            severity: 'high',
            occurredAt: event.occurredAt,
          });
        }
      }

      const tokens = await this.issueTokenPair(invitation.id, familyId, tx);
      await tx.invitation.update({ where: { id: invitation.id }, data: { activeSessionFamilyId: familyId } });
      return tokens;
    });
```

- [ ] **Step 7: Register MonitoringModule in CandidateAuthModule**

`apps/api/src/candidate-auth/candidate-auth.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { MonitoringModule } from '../monitoring/monitoring.module';
import { CandidateAuthService } from './candidate-auth.service';
import { CandidateAuthController } from './candidate-auth.controller';
import { CandidateJwtStrategy } from './candidate-jwt.strategy';

@Module({
  imports: [PassportModule, JwtModule.register({}), MonitoringModule],
  providers: [CandidateAuthService, CandidateJwtStrategy],
  controllers: [CandidateAuthController],
  exports: [CandidateAuthService],
})
export class CandidateAuthModule {}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npm run test:api -- attempt.service candidate-auth.service`
Expected: both files' full suites pass.

Run: `npm run test:api` (from repo root)
Expected: all suites passing.

Run: `npx nest build` (from `apps/api/`)
Expected: clean build.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/attempts/attempt.service.ts apps/api/src/attempts/attempt.service.spec.ts apps/api/src/candidate-auth/candidate-auth.service.ts apps/api/src/candidate-auth/candidate-auth.service.spec.ts apps/api/src/candidate-auth/candidate-auth.module.ts
git commit -m "feat: emit proctoring:flag from candidate-reported events and system-generated multi_login"
```

---

### Task 8: Candidate messaging (send/list, force-submit emit)

**Files:**
- Create: `apps/api/src/attempts/dto/send-candidate-message.dto.ts`
- Modify: `apps/api/src/attempts/attempts-admin.service.ts`
- Modify: `apps/api/src/attempts/attempts-admin.service.spec.ts`
- Modify: `apps/api/src/attempts/attempts.controller.ts`

**Interfaces:**
- Consumes: `MonitoringGateway.emitAttemptStatus`/`emitMessageSent` (Task 5, exact signatures).
- Produces: `AttemptsAdminService.sendMessage(context, attemptId, actorUserId, body): Promise<{ id: string; sentAt: Date }>`, `.listMessages(context, attemptId): Promise<CandidateMessage[]>`; `POST /attempts/:id/message`, `GET /attempts/:id/messages`; `forceSubmit()` also emits `attempt:status`.

- [ ] **Step 1: Write the DTO**

`apps/api/src/attempts/dto/send-candidate-message.dto.ts`:
```typescript
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class SendCandidateMessageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  body!: string;
}
```

- [ ] **Step 2: Write the failing tests**

In `apps/api/src/attempts/attempts-admin.service.spec.ts`, add the import and extend the `beforeEach`:
```typescript
import { MonitoringGateway } from '../monitoring/monitoring.gateway';
```
```typescript
  let monitoringGateway: { emitAttemptStatus: jest.Mock; emitMessageSent: jest.Mock };

  beforeEach(async () => {
    tenantPrisma = { forTenant: jest.fn() };
    attemptSettlement = { finalize: jest.fn() };
    audit = { record: jest.fn() };
    monitoringGateway = { emitAttemptStatus: jest.fn(), emitMessageSent: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        AttemptsAdminService,
        { provide: TenantPrismaService, useValue: tenantPrisma },
        { provide: AttemptSettlementService, useValue: attemptSettlement },
        { provide: AuditService, useValue: audit },
        { provide: MonitoringGateway, useValue: monitoringGateway },
      ],
    }).compile();
    service = moduleRef.get(AttemptsAdminService);
  });
```

Update the existing `'finalizes an in-progress attempt as force_submitted and writes an audit log'` test to also assert the new emit (add this line at the end of that test):
```typescript
      expect(monitoringGateway.emitAttemptStatus).toHaveBeenCalledWith('exam-1', {
        attemptId: 'attempt-1', candidateId: attempt.candidateId, status: 'force_submitted',
      });
```
(Note: this requires `attempt`'s fixture in that `describe('forceSubmit', ...)` block to include a `candidateId` field — check the existing fixture and add `candidateId: 'cand-1'` to it if not already present, and update `attemptSettlement.finalize.mockResolvedValue(...)` to resolve `{ id: 'attempt-1', candidateId: 'cand-1', examId: 'exam-1', status: 'force_submitted' }`.)

Add a new `describe('sendMessage', ...)` and `describe('listMessages', ...)` block:
```typescript
  describe('sendMessage', () => {
    it('creates a message and emits message:sent', async () => {
      const tx = {
        attempt: { findFirst: jest.fn().mockResolvedValue({ id: 'attempt-1', examId: 'exam-1', candidateId: 'cand-1' }) },
        candidateMessage: { create: jest.fn().mockResolvedValue({ id: 'msg-1', sentAt: new Date('2026-07-09T00:00:00Z') }) },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.sendMessage(context, 'attempt-1', 'user-1', 'Please stay on the exam tab');

      expect(result).toEqual({ id: 'msg-1', sentAt: new Date('2026-07-09T00:00:00Z') });
      expect(tx.candidateMessage.create).toHaveBeenCalledWith({
        data: { attemptId: 'attempt-1', sentByUserId: 'user-1', body: 'Please stay on the exam tab' },
      });
      expect(monitoringGateway.emitMessageSent).toHaveBeenCalledWith('exam-1', {
        attemptId: 'attempt-1', candidateId: 'cand-1', sentAt: new Date('2026-07-09T00:00:00Z'),
      });
    });

    it('throws NotFoundException when the attempt does not belong to the caller organization', async () => {
      const tx = { attempt: { findFirst: jest.fn().mockResolvedValue(null) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.sendMessage(context, 'attempt-1', 'user-1', 'hello')).rejects.toThrow(NotFoundException);
    });
  });

  describe('listMessages', () => {
    it('returns the message history for an attempt owned by the caller organization', async () => {
      const tx = {
        attempt: { findFirst: jest.fn().mockResolvedValue({ id: 'attempt-1' }) },
        candidateMessage: { findMany: jest.fn().mockResolvedValue([{ id: 'msg-1' }]) },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.listMessages(context, 'attempt-1');

      expect(result).toEqual([{ id: 'msg-1' }]);
      expect(tx.candidateMessage.findMany).toHaveBeenCalledWith({ where: { attemptId: 'attempt-1' }, orderBy: { sentAt: 'asc' } });
    });

    it('throws NotFoundException when the attempt does not belong to the caller organization', async () => {
      const tx = { attempt: { findFirst: jest.fn().mockResolvedValue(null) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.listMessages(context, 'attempt-1')).rejects.toThrow(NotFoundException);
    });
  });
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm run test:api -- attempts-admin.service`
Expected: FAIL — the constructor doesn't accept `MonitoringGateway` yet, `sendMessage`/`listMessages` don't exist, `forceSubmit` never emits.

- [ ] **Step 4: Implement**

`apps/api/src/attempts/attempts-admin.service.ts`:
```typescript
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CandidateMessage, ProctoringEvent } from '@prisma/client';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { TenantContext } from '../prisma/tenant-context';
import { AttemptSettlementService } from '../grading/attempt-settlement.service';
import { AuditService } from '../audit/audit.service';
import { MonitoringGateway } from '../monitoring/monitoring.gateway';

@Injectable()
export class AttemptsAdminService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly attemptSettlement: AttemptSettlementService,
    private readonly audit: AuditService,
    private readonly monitoringGateway: MonitoringGateway,
  ) {}

  async listProctoringEvents(context: TenantContext, attemptId: string): Promise<ProctoringEvent[]> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const attempt = await tx.attempt.findFirst({
        where: { id: attemptId, invitation: { exam: { organizationId: context.organizationId as string } } },
      });
      if (!attempt) {
        throw new NotFoundException(`Attempt ${attemptId} not found`);
      }
      return tx.proctoringEvent.findMany({ where: { attemptId }, orderBy: { occurredAt: 'asc' } });
    });
  }

  async forceSubmit(context: TenantContext, attemptId: string, actorUserId: string): Promise<{ status: string }> {
    const finalized = await this.tenantPrisma.forTenant(context, async (tx) => {
      const attempt = await tx.attempt.findFirst({
        where: { id: attemptId, invitation: { exam: { organizationId: context.organizationId as string } } },
        include: { invitation: { include: { exam: true } } },
      });
      if (!attempt) {
        throw new NotFoundException(`Attempt ${attemptId} not found`);
      }
      if (attempt.status !== 'in_progress') {
        throw new BadRequestException(`Attempt ${attemptId} cannot be force-submitted from status "${attempt.status}"`);
      }

      const exam = attempt.invitation.exam;
      return this.attemptSettlement.finalize(tx, exam, attempt, 'force_submitted');
    });

    this.monitoringGateway.emitAttemptStatus(finalized.examId, {
      attemptId: finalized.id,
      candidateId: finalized.candidateId,
      status: finalized.status,
    });

    await this.audit.record(context, {
      actorUserId,
      action: 'attempt.force_submit',
      entityType: 'attempt',
      entityId: attemptId,
    });

    return { status: finalized.status };
  }

  async sendMessage(
    context: TenantContext,
    attemptId: string,
    actorUserId: string,
    body: string,
  ): Promise<{ id: string; sentAt: Date }> {
    const message = await this.tenantPrisma.forTenant(context, async (tx) => {
      const attempt = await tx.attempt.findFirst({
        where: { id: attemptId, invitation: { exam: { organizationId: context.organizationId as string } } },
      });
      if (!attempt) {
        throw new NotFoundException(`Attempt ${attemptId} not found`);
      }
      const created = await tx.candidateMessage.create({
        data: { attemptId: attempt.id, sentByUserId: actorUserId, body },
      });
      this.monitoringGateway.emitMessageSent(attempt.examId, {
        attemptId: attempt.id,
        candidateId: attempt.candidateId,
        sentAt: created.sentAt,
      });
      return created;
    });

    await this.audit.record(context, {
      actorUserId,
      action: 'attempt.message_sent',
      entityType: 'attempt',
      entityId: attemptId,
    });

    return { id: message.id, sentAt: message.sentAt };
  }

  async listMessages(context: TenantContext, attemptId: string): Promise<CandidateMessage[]> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const attempt = await tx.attempt.findFirst({
        where: { id: attemptId, invitation: { exam: { organizationId: context.organizationId as string } } },
      });
      if (!attempt) {
        throw new NotFoundException(`Attempt ${attemptId} not found`);
      }
      return tx.candidateMessage.findMany({ where: { attemptId }, orderBy: { sentAt: 'asc' } });
    });
  }
}
```

- [ ] **Step 5: Add the controller routes**

In `apps/api/src/attempts/attempts.controller.ts`, add the import and routes:
```typescript
import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { TenantContext } from '../prisma/tenant-context';
import { AttemptsAdminService } from './attempts-admin.service';
import { SendCandidateMessageDto } from './dto/send-candidate-message.dto';

@Controller('attempts')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AttemptsController {
  constructor(private readonly attemptsAdminService: AttemptsAdminService) {}

  @Get(':id/proctoring-events')
  @RequirePermissions('exam:manage')
  listProctoringEvents(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.attemptsAdminService.listProctoringEvents(tenant, id);
  }

  @Post(':id/force-submit')
  @RequirePermissions('exam:manage')
  forceSubmit(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Param('id') id: string) {
    return this.attemptsAdminService.forceSubmit(tenant, id, userId);
  }

  @Post(':id/message')
  @RequirePermissions('exam:manage')
  sendMessage(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body() dto: SendCandidateMessageDto,
  ) {
    return this.attemptsAdminService.sendMessage(tenant, id, userId, dto.body);
  }

  @Get(':id/messages')
  @RequirePermissions('exam:manage')
  listMessages(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.attemptsAdminService.listMessages(tenant, id);
  }
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm run test:api -- attempts-admin.service`
Expected: full file passes (existing tests + 5 new).

Run: `npm run test:api` (from repo root)
Expected: all suites passing.

Run: `npx nest build` (from `apps/api/`)
Expected: clean build.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/attempts/dto/send-candidate-message.dto.ts apps/api/src/attempts/attempts-admin.service.ts apps/api/src/attempts/attempts-admin.service.spec.ts apps/api/src/attempts/attempts.controller.ts
git commit -m "feat: add candidate messaging (send/list) and force-submit attempt:status emission"
```

---

### Task 9: Candidate message delivery via GET /attempt/current

**Files:**
- Modify: `apps/api/src/attempts/attempt.service.ts`
- Modify: `apps/api/src/attempts/attempt.service.spec.ts`

**Interfaces:**
- Produces: `AttemptStateResponse` gains a `messages: { id: string; body: string; sentAt: Date }[]` field — every unread `CandidateMessage` for the attempt at the time of the call, marked read as a side effect of this same call.

- [ ] **Step 1: Write the failing tests**

In `apps/api/src/attempts/attempt.service.spec.ts`, update the existing `'returns the full attempt state with sections, questions (no isCorrect), and existing answers'` test: add `candidateMessage: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() }` to the `tx` object literal, and add `messages: []` to the expected `result` object.

Add a new test directly after it, inside the `describe('getCurrent', ...)` block:
```typescript
    it('returns unread messages and marks them read', async () => {
      const attempt = { id: 'attempt-1', status: 'in_progress', startedAt: new Date(), questionOrderJson: '[]' };
      const unreadMessage = { id: 'msg-1', body: 'Please stay on the exam tab', sentAt: new Date('2026-07-09T00:00:00Z') };
      const tx = {
        attempt: { findUnique: jest.fn().mockResolvedValue(attempt) },
        examSection: { findMany: jest.fn().mockResolvedValue([]) },
        answer: { findMany: jest.fn().mockResolvedValue([]) },
        candidateMessage: { findMany: jest.fn().mockResolvedValue([unreadMessage]), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      };
      settlement.settleIfExpired.mockResolvedValue(attempt);
      settlement.remainingSeconds.mockReturnValue(1000);
      mockBootstrapThenScoped(tx);

      const result = await service.getCurrent(session);

      expect((result as any).messages).toEqual([{ id: 'msg-1', body: 'Please stay on the exam tab', sentAt: unreadMessage.sentAt }]);
      expect(tx.candidateMessage.findMany).toHaveBeenCalledWith({ where: { attemptId: 'attempt-1', readAt: null } });
      expect(tx.candidateMessage.updateMany).toHaveBeenCalledWith({
        where: { attemptId: 'attempt-1', readAt: null },
        data: { readAt: expect.any(Date) },
      });
    });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:api -- attempt.service`
Expected: FAIL — `getCurrent`'s response has no `messages` field yet.

- [ ] **Step 3: Implement**

In `apps/api/src/attempts/attempt.service.ts`, update the `AttemptStateResponse` interface and `getCurrent` method:
```typescript
interface AttemptMessageSummary {
  id: string;
  body: string;
  sentAt: Date;
}

interface AttemptStateResponse {
  status: string;
  remainingSeconds: number;
  sections: AttemptSection[];
  answers: AttemptAnswerSummary[];
  messages: AttemptMessageSummary[];
}
```

Replace the `getCurrent` method:
```typescript
  async getCurrent(session: CandidateSession): Promise<AttemptCurrentResponse> {
    const { organizationId, exam, invitation } = await this.resolveContext(session.invitationId);

    return this.tenantPrisma.forTenant({ organizationId, isSuperAdmin: false }, async (tx) => {
      const attempt = await tx.attempt.findUnique({ where: { invitationId: invitation.id } });
      if (!attempt) {
        return { exam: { title: exam.title, instructions: exam.instructions, durationMinutes: exam.durationMinutes } };
      }

      const settled = await this.attemptSettlement.settleIfExpired(tx, exam, attempt);
      const questionIds: string[] = JSON.parse(settled.questionOrderJson);
      const sections = await this.loadSections(tx, exam.id, questionIds);
      const answers = await tx.answer.findMany({ where: { attemptId: settled.id } });

      const unreadMessages = await tx.candidateMessage.findMany({ where: { attemptId: settled.id, readAt: null } });
      if (unreadMessages.length > 0) {
        await tx.candidateMessage.updateMany({ where: { attemptId: settled.id, readAt: null }, data: { readAt: new Date() } });
      }

      return {
        status: settled.status,
        remainingSeconds: this.attemptSettlement.remainingSeconds(exam, settled),
        sections,
        answers: answers.map((answer) => ({
          questionId: answer.questionId,
          selectedOptionIds: JSON.parse(answer.selectedOptionIdsJson),
          isMarkedForReview: answer.isMarkedForReview,
        })),
        messages: unreadMessages.map((message) => ({ id: message.id, body: message.body, sentAt: message.sentAt })),
      };
    });
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:api -- attempt.service`
Expected: full file passes.

Run: `npm run test:api` (from repo root)
Expected: all suites passing.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/attempts/attempt.service.ts apps/api/src/attempts/attempt.service.spec.ts
git commit -m "feat: deliver unread candidate messages via GET /attempt/current, marking them read"
```

---

### Task 10: End-to-end test

**Files:**
- Modify: `apps/api/package.json`
- Create: `apps/api/test/live-monitoring.e2e-spec.ts`

**Interfaces:**
- Consumes: the full `MonitoringGateway`/`AttemptsController`/`AttemptController` HTTP+WebSocket surface (Tasks 1-9), the existing exam/candidate/invitation setup flow from prior e2e specs.

- [ ] **Step 1: Add the socket.io-client dev dependency**

In `apps/api/package.json`, add to `devDependencies`:
```json
    "socket.io-client": "^4.7.5",
```

Run (from repo root): `npm install`

- [ ] **Step 2: Write the e2e spec**

`apps/api/test/live-monitoring.e2e-spec.ts`:
```typescript
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { io, Socket } from 'socket.io-client';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantPrismaService } from '../src/prisma/tenant-prisma.service';
import { EmailService } from '../src/email/email.service';

describe('Live Monitoring WebSocket flow', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let port: number;
  let planId: string;
  let orgId: string;
  let recruiterAccessToken: string;
  let examId: string;
  const fakeEmailService = { send: jest.fn().mockResolvedValue({ success: true, previewUrl: 'https://ethereal.email/fake' }) };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EmailService)
      .useValue(fakeEmailService)
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
    await app.listen(0);
    port = (app.getHttpServer().address() as { port: number }).port;

    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);

    const plan = await prisma.plan.create({
      data: { name: `ci-monitoring-plan-${randomUUID()}`, candidateLimit: 10, aiCreditLimit: 1, proctoringMinutesLimit: 1 },
    });
    planId = plan.id;

    const org = await prisma.organization.create({ data: { name: 'CI Monitoring Org', slug: `ci-monitoring-org-${randomUUID()}`, planId } });
    orgId = org.id;

    const recruiterHash = await argon2.hash('RecruiterPassw0rd!');
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) =>
      tx.user.create({ data: { organizationId: orgId, email: 'recruiter@ci-monitoring.test', passwordHash: recruiterHash, role: 'recruiter' } }),
    );

    recruiterAccessToken = (
      await request(app.getHttpServer())
        .post('/api/v1/auth/staff/login')
        .send({ organizationSlug: org.slug, email: 'recruiter@ci-monitoring.test', password: 'RecruiterPassw0rd!' })
        .expect(200)
    ).body.accessToken;

    const examResponse = await request(app.getHttpServer())
      .post('/api/v1/exams')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ title: 'Live Monitoring Round' })
      .expect(201);
    examId = examResponse.body.id;

    const sectionResponse = await request(app.getHttpServer())
      .post(`/api/v1/exams/${examId}/sections`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ title: 'Section One' })
      .expect(201);

    const questionResponse = await request(app.getHttpServer())
      .post('/api/v1/questions')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({
        type: 'true_false', text: 'Is this a live monitoring test?', difficulty: 'easy', marks: 5,
        options: [{ text: 'True', isCorrect: true }, { text: 'False', isCorrect: false }],
      })
      .expect(201);

    await request(app.getHttpServer())
      .put(`/api/v1/exams/${examId}/sections/${sectionResponse.body.id}/questions`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ questionIds: [questionResponse.body.id] })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/api/v1/exams/${examId}/publish`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(201);
  });

  afterAll(async () => {
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) => tx.exam.deleteMany({ where: { organizationId: orgId } }));
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) => tx.question.deleteMany({ where: { organizationId: orgId } }));
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) => tx.candidate.deleteMany({ where: { organizationId: orgId } }));
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: true }, (tx) => tx.refreshToken.deleteMany({ where: { user: { organizationId: orgId } } }));
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) => tx.user.deleteMany({ where: { organizationId: orgId } }));
    await prisma.organization.delete({ where: { id: orgId } }).catch(() => undefined);
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  async function inviteAndGetToken(email: string, name: string): Promise<string> {
    const candidateResponse = await request(app.getHttpServer())
      .post('/api/v1/candidates')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ email, name })
      .expect(201);
    const inviteResponse = await request(app.getHttpServer())
      .post(`/api/v1/exams/${examId}/invitations`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ candidateIds: [candidateResponse.body.id] })
      .expect(201);
    return inviteResponse.body.created[0].token;
  }

  function connectRecruiterSocket(): Socket {
    return io(`http://localhost:${port}/monitoring`, { auth: { token: recruiterAccessToken }, transports: ['websocket'], forceNew: true });
  }

  function waitForEvent<T>(socket: Socket, event: string): Promise<T> {
    return new Promise((resolve) => socket.once(event, resolve));
  }

  it('sends a roster snapshot on join, then pushes attempt:status and proctoring:flag as they happen', async () => {
    const token = await inviteAndGetToken('alice@ci-monitoring.test', 'Alice');
    const socket = connectRecruiterSocket();

    await waitForEvent(socket, 'connect');
    socket.emit('join-exam', { examId });
    const snapshot = await waitForEvent<any[]>(socket, 'roster:snapshot');
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0]).toMatchObject({ candidateName: 'Alice', status: 'invited', online: false });

    const accessToken = (await request(app.getHttpServer()).post('/api/v1/candidate-auth/redeem').send({ token }).expect(200)).body.accessToken;

    const attemptStatusPromise = waitForEvent<any>(socket, 'attempt:status');
    const startResponse = await request(app.getHttpServer())
      .post('/api/v1/attempt/start')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(201);
    const attemptStatus = await attemptStatusPromise;
    expect(attemptStatus).toEqual({ attemptId: startResponse.body.id, candidateId: expect.any(String), status: 'in_progress' });

    const proctoringFlagPromise = waitForEvent<any>(socket, 'proctoring:flag');
    await request(app.getHttpServer())
      .post('/api/v1/attempt/proctoring-event')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ eventType: 'tab_switch' })
      .expect(201);
    const proctoringFlag = await proctoringFlagPromise;
    expect(proctoringFlag).toEqual({ attemptId: startResponse.body.id, candidateId: expect.any(String), eventType: 'tab_switch', severity: 'medium', occurredAt: expect.any(String) });

    socket.disconnect();
  });

  it('delivers a recruiter message to the candidate on their next poll, and notifies the room', async () => {
    const token = await inviteAndGetToken('bob@ci-monitoring.test', 'Bob');
    const accessToken = (await request(app.getHttpServer()).post('/api/v1/candidate-auth/redeem').send({ token }).expect(200)).body.accessToken;
    const attemptId = (await request(app.getHttpServer()).post('/api/v1/attempt/start').set('Authorization', `Bearer ${accessToken}`).send({}).expect(201)).body.id;

    const socket = connectRecruiterSocket();
    await waitForEvent(socket, 'connect');
    socket.emit('join-exam', { examId });
    await waitForEvent(socket, 'roster:snapshot');

    const messageSentPromise = waitForEvent<any>(socket, 'message:sent');
    await request(app.getHttpServer())
      .post(`/api/v1/attempts/${attemptId}/message`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ body: 'Please stay on the exam tab' })
      .expect(201);
    await messageSentPromise;

    const currentResponse = await request(app.getHttpServer())
      .get('/api/v1/attempt/current')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(currentResponse.body.messages).toHaveLength(1);
    expect(currentResponse.body.messages[0].body).toBe('Please stay on the exam tab');

    const secondCurrentResponse = await request(app.getHttpServer())
      .get('/api/v1/attempt/current')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(secondCurrentResponse.body.messages).toHaveLength(0);

    socket.disconnect();
  });

  it('force-submits an attempt, pushing attempt:status to the room', async () => {
    const token = await inviteAndGetToken('carol@ci-monitoring.test', 'Carol');
    const accessToken = (await request(app.getHttpServer()).post('/api/v1/candidate-auth/redeem').send({ token }).expect(200)).body.accessToken;
    const attemptId = (await request(app.getHttpServer()).post('/api/v1/attempt/start').set('Authorization', `Bearer ${accessToken}`).send({}).expect(201)).body.id;

    const socket = connectRecruiterSocket();
    await waitForEvent(socket, 'connect');
    socket.emit('join-exam', { examId });
    await waitForEvent(socket, 'roster:snapshot');

    const attemptStatusPromise = waitForEvent<any>(socket, 'attempt:status');
    await request(app.getHttpServer())
      .post(`/api/v1/attempts/${attemptId}/force-submit`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(201);
    const attemptStatus = await attemptStatusPromise;
    expect(attemptStatus).toEqual({ attemptId, candidateId: expect.any(String), status: 'force_submitted' });

    socket.disconnect();
  });

  it('rejects a socket connection with no token, and rejects joining an exam outside the caller organization', async () => {
    const unauthenticated = io(`http://localhost:${port}/monitoring`, { transports: ['websocket'], forceNew: true, reconnection: false });
    await new Promise<void>((resolve) => unauthenticated.on('disconnect', () => resolve()));

    const otherOrgHash = await argon2.hash('OtherOrgPassw0rd!');
    const otherPlan = await prisma.plan.create({
      data: { name: `ci-monitoring-other-plan-${randomUUID()}`, candidateLimit: 10, aiCreditLimit: 1, proctoringMinutesLimit: 1 },
    });
    const otherOrg = await prisma.organization.create({ data: { name: 'CI Monitoring Other Org', slug: `ci-monitoring-other-org-${randomUUID()}`, planId: otherPlan.id } });
    await tenantPrisma.forTenant({ organizationId: otherOrg.id, isSuperAdmin: false }, (tx) =>
      tx.user.create({ data: { organizationId: otherOrg.id, email: 'other@ci-monitoring.test', passwordHash: otherOrgHash, role: 'recruiter' } }),
    );
    const otherAccessToken = (
      await request(app.getHttpServer())
        .post('/api/v1/auth/staff/login')
        .send({ organizationSlug: otherOrg.slug, email: 'other@ci-monitoring.test', password: 'OtherOrgPassw0rd!' })
        .expect(200)
    ).body.accessToken;

    const otherSocket = io(`http://localhost:${port}/monitoring`, { auth: { token: otherAccessToken }, transports: ['websocket'], forceNew: true });
    await waitForEvent(otherSocket, 'connect');
    const errorPromise = waitForEvent<any>(otherSocket, 'error');
    otherSocket.emit('join-exam', { examId });
    const error = await errorPromise;
    expect(error.message).toBe(`Exam ${examId} not found`);
    otherSocket.disconnect();

    await tenantPrisma.forTenant({ organizationId: otherOrg.id, isSuperAdmin: false }, (tx) => tx.user.deleteMany({ where: { organizationId: otherOrg.id } }));
    await prisma.organization.delete({ where: { id: otherOrg.id } }).catch(() => undefined);
    await prisma.plan.delete({ where: { id: otherPlan.id } }).catch(() => undefined);
  });
});
```

- [ ] **Step 3: Run the full e2e suite**

Run: `npm run test:api:e2e` (from repo root)
Expected: all suites pass, including all 4 tests in `live-monitoring.e2e-spec.ts`, with no regressions to any other e2e spec file.

- [ ] **Step 4: Run the full unit suite one more time**

Run: `npm run test:api` (from repo root)
Expected: all suites still passing.

Run: `npx nest build` (from `apps/api/`)
Expected: clean build.

- [ ] **Step 5: Commit**

```bash
git add apps/api/package.json package-lock.json apps/api/test/live-monitoring.e2e-spec.ts
git commit -m "test: add full live monitoring e2e coverage - roster snapshot, attempt:status, proctoring:flag, messaging, force-submit, cross-tenant denial"
```

---

## Self-Review Notes

- **Spec coverage:** WebSocket gateway with staff auth and per-exam rooms (Task 5), roster snapshot with online/progress/remaining-time (Task 4), presence timer (Task 5), attempt:status and proctoring:flag emissions from all four required call sites (Tasks 6-7), candidate messaging send/list/delivery (Tasks 8-9) — all covered. Deferred items (Redis, candidate-side WebSocket, dashboard UI, AI proctoring) are explicitly out of scope per the design spec and not included here.
- **Placeholder scan:** no TBD/TODO markers; every step has complete, runnable code.
- **Type consistency:** `RosterRow` (Task 4) matches what `MonitoringGateway.handleJoinExam` (Task 5) emits verbatim. `MonitoringGateway.emitAttemptStatus`/`emitProctoringFlag`/`emitMessageSent` signatures (Task 5) match every call site added in Tasks 6-8 exactly. `computeRemainingSeconds` (Task 3) is imported by name into both `AttemptSettlementService` (unchanged public behavior) and `MonitoringService` (Task 4) with no duplication of the underlying formula.
- **Module dependency direction verified explicitly:** `MonitoringModule` has zero imports of `GradingModule`, `AttemptModule`, or `CandidateAuthModule` — it is a leaf module from the perspective of this new subsystem. `GradingModule`, `AttemptModule`, and `CandidateAuthModule` each import `MonitoringModule` (Tasks 6-7), never the reverse. This is the one architectural constraint every task in this plan was written to preserve, called out explicitly in the Global Constraints and cross-checked in each task's file list.
- **Cross-task dependency flagged explicitly:** Task 6 changes `AttemptSettlementService`'s constructor (adds a required `MonitoringGateway` parameter) — the only existing test file that directly instantiates this class (`attempt-settlement.service.spec.ts`) is updated in that same task; every other file that depends on `AttemptSettlementService` already mocks it as an opaque provider and is unaffected.
