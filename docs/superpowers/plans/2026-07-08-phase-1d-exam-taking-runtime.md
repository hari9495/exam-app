# Phase 1d (Exam-Taking Runtime) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a Candidate a tested API to redeem an invitation token, view exam instructions, start the exam, answer questions with a server-authoritative timer, submit (idempotently, with auto-grading), and give a Recruiter a basic per-candidate results view — closing out Phase 1's "Core Exam MVP".

**Architecture:** Two new Prisma models with no RLS policy of their own (`Attempt`, `Answer` — transitively protected via `Invitation`), one new model similarly unprotected (`Result`), and a `CandidateRefreshToken` table paralleling the existing staff `RefreshToken` table. A new `CandidateAuthModule` issues candidate JWTs (separate secrets from staff auth) after validating an `Invitation.token`. A new `GradingModule` holds the grading math and the "settle an attempt past its deadline" logic shared between the candidate-facing `AttemptModule` and the recruiter-facing `ExamsService.getResults`. `Exam` gains `durationMinutes`/`passCriteriaPercent` fields, settable via the existing `CreateExamDto`/`UpdateExamDto`.

**Tech Stack:** Same as Phase 0/1a/1b/1c — NestJS, Prisma (`sqlserver` provider), SQL Server, Jest/Supertest. No new npm dependencies.

## Global Constraints

- All primary keys and organization-scoping foreign keys are `@db.UniqueIdentifier` in Prisma — never a plain `String` with no native-type annotation.
- **`attempts`, `answers`, `results`, and `candidate_refresh_tokens` have no `organization_id` column and no Row-Level Security policy of their own.** They are reached only through a parent that IS RLS-protected (`Invitation` → `Exam`/`Candidate` for `attempts`; `Attempt` for `answers`/`results`; `Invitation` for `candidate_refresh_tokens`). Every service method that touches any of these four tables MUST first resolve ownership through that parent chain inside the same unit of work — skipping this is a real cross-candidate/cross-tenant data leak, not a theoretical one.
- **Candidate requests carry no `organizationId`.** The candidate JWT payload only contains an `invitationId`. Every `AttemptService` method's first step is a bootstrap lookup — `TenantPrismaService.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) => tx.invitation.findUnique({ where: { id: invitationId }, include: { exam: true } }))` — to safely learn `exam.organizationId` before any RLS-protected table is touched. This mirrors the existing `AuthService.refresh()` pattern in `apps/api/src/auth/auth.service.ts`, which already uses the identical `{ organizationId: null, isSuperAdmin: true }` bypass to look up a user by ID when the caller's org isn't known yet. After the bootstrap, every further read/write in that request uses `TenantPrismaService.forTenant({ organizationId: exam.organizationId, isSuperAdmin: false }, ...)` — the super-admin bypass is used ONLY for the bootstrap lookup, never for the actual business logic.
- Migrations are applied with `npx prisma migrate deploy`, **never** `npx prisma migrate dev` (the `examapp_dev` database login lacks `CREATE DATABASE` permission needed for `migrate dev`'s shadow database). `migrate dev --create-only` reliably fails with a P3014 shadow-database permission error in this environment — this is expected, not a bug to chase; hand-write the migration SQL directly instead.
- Every `created_at`/timestamp-style column default must use `DEFAULT GETUTCDATE()`, never `DEFAULT CURRENT_TIMESTAMP` (which is OS-local time in SQL Server, not UTC).
- **Never edit an already-applied migration file's SQL text in place.** If a mistake needs fixing, write a NEW migration.
- Required (non-optional) `class-validator` DTO properties must use a definite-assignment assertion (`title!: string;`), not a bare `title: string;` — `tsconfig.base.json`'s `strict: true` enables `strictPropertyInitialization`.
- **Grading and settlement logic lives in exactly one place** (`GradingModule`'s `AttemptSettlementService`), used by both `AttemptService` (candidate-facing) and `ExamsService.getResults` (recruiter-facing). Do not duplicate the "is this attempt past its deadline, and if so grade it" logic in a second location.
- **Candidate JWTs use separate secrets from staff JWTs** (`CANDIDATE_JWT_ACCESS_SECRET`/`CANDIDATE_JWT_REFRESH_SECRET`, distinct from `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET`) and a separate Passport strategy name (`'candidate-jwt'`, distinct from the staff `'jwt'` strategy) — a bug in one guard must never be able to authenticate the other subject type.
- Candidate-facing question/option responses must never include `isCorrect` — a candidate should never be able to read the correct answer from the API response, even accidentally.
- No hard `DELETE` anywhere in this phase.
- No WebSocket, no scheduled/cron auto-submit sweep, no randomization, no negative marking, no section timers/locks, no rank/analytics, no Email OTP candidate login, no frontend UI — see the design spec's "Open Items" section for what's deferred and why.
- Full spec: `docs/superpowers/specs/2026-07-08-phase-1d-exam-taking-runtime-design.md`. Full prior context: `memory.md` at repo root, `docs/superpowers/plans/2026-07-07-phase-1c-candidates-invitations.md`.

---

## File Structure

```
.env.example                                            # Modify: add candidate JWT env vars
apps/api/
  prisma/
    schema.prisma                                        # Modify: Exam gains durationMinutes/passCriteriaPercent;
                                                           #         add Attempt, Answer, Result, CandidateRefreshToken
    migrations/
      20260708090000_attempt_runtime_schema/
        migration.sql                                    # Create: exams columns + 4 new tables
  src/
    exams/
      dto/create-exam.dto.ts                              # Modify: add durationMinutes/passCriteriaPercent
      exams.service.ts                                    # Modify: create/update pass through new fields; add getResults()
      exams.service.spec.ts                               # Modify: update beforeEach for new dependency, add tests
      exams.controller.ts                                 # Modify: add GET :id/results route
      exams.module.ts                                     # Modify: import GradingModule
    grading/
      grading.ts                                          # Create: pure functions gradeAnswer/computeResult
      grading.spec.ts                                     # Create
      attempt-settlement.service.ts                       # Create: settleIfExpired/finalize, uses grading.ts
      attempt-settlement.service.spec.ts                  # Create
      grading.module.ts                                   # Create
    candidate-auth/
      dto/redeem-invitation.dto.ts                        # Create
      candidate-auth.service.ts                           # Create: redeem/refresh/logout
      candidate-auth.service.spec.ts                      # Create
      candidate-auth.controller.ts                        # Create
      candidate-jwt.strategy.ts                           # Create
      candidate-jwt-auth.guard.ts                          # Create
      current-candidate.decorator.ts                      # Create
      candidate-auth.module.ts                            # Create
    attempts/
      dto/answer.dto.ts                                   # Create
      attempt.service.ts                                  # Create: current/start/answer/submit
      attempt.service.spec.ts                             # Create
      attempt.controller.ts                               # Create
      attempt.module.ts                                   # Create
    app.module.ts                                          # Modify: register CandidateAuthModule, AttemptModule
  test/
    exam-taking-runtime.e2e-spec.ts                        # Create
```

---

### Task 1: Exam duration/pass-criteria fields, and Attempt/Answer/Result/CandidateRefreshToken schema

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260708090000_attempt_runtime_schema/migration.sql`
- Modify: `apps/api/src/exams/dto/create-exam.dto.ts`
- Modify: `apps/api/src/exams/exams.service.ts`
- Modify: `apps/api/src/exams/exams.service.spec.ts`

**Interfaces:**
- Produces: `Exam.durationMinutes: number` (default 60), `Exam.passCriteriaPercent: number` (default 40), settable via `CreateExamDto`/`UpdateExamDto`. Prisma models `Attempt` (fields: `id`, `invitationId`, `candidateId`, `examId`, `status`, `questionOrderJson`, `startedAt`, `submittedAt`, relations `invitation`, `answers`, `result`), `Answer` (fields: `id`, `attemptId`, `questionId`, `selectedOptionIdsJson`, `isMarkedForReview`, `answeredAt`, `isCorrect`, `marksAwarded`, relations `attempt`, `question`), `Result` (fields: `id`, `attemptId`, `score`, `maxScore`, `percentage`, `passFail`, `computedAt`, relation `attempt`), `CandidateRefreshToken` (fields: `id`, `invitationId`, `tokenHash`, `familyId`, `expiresAt`, `revokedAt`, `createdAt`, relation `invitation`) — every later task relies on these exact field names.

- [ ] **Step 1: Modify the `Exam` model and add the four new models to schema.prisma**

In `apps/api/prisma/schema.prisma`, change the `Exam` model to add the two new fields (insert after `status`):

```prisma
model Exam {
  id                  String        @id @default(uuid()) @db.UniqueIdentifier
  organizationId      String        @map("organization_id") @db.UniqueIdentifier
  title               String
  instructions        String?       @db.NVarChar(Max)
  status              String        @default("draft")
  durationMinutes     Int           @default(60) @map("duration_minutes")
  passCriteriaPercent Int           @default(40) @map("pass_criteria_percent")
  createdBy           String        @map("created_by") @db.UniqueIdentifier
  createdAt           DateTime      @default(now()) @map("created_at")
  sections            ExamSection[]
  invitations         Invitation[]

  @@index([organizationId, status])
  @@map("exams")
}
```

Modify the existing `Invitation` model to add two back-relations (needed for the new `Attempt`/`CandidateRefreshToken` relations below):

```prisma
model Invitation {
  id                     String                  @id @default(uuid()) @db.UniqueIdentifier
  examId                 String                  @map("exam_id") @db.UniqueIdentifier
  candidateId            String                  @map("candidate_id") @db.UniqueIdentifier
  token                  String                  @unique
  status                 String                  @default("invited")
  invitedAt              DateTime                @default(now()) @map("invited_at")
  expiresAt              DateTime                @map("expires_at")
  revokedAt              DateTime?               @map("revoked_at")
  exam                   Exam                    @relation(fields: [examId], references: [id], onDelete: Cascade)
  candidate              Candidate               @relation(fields: [candidateId], references: [id], onDelete: Cascade)
  notifications          Notification[]
  attempt                Attempt?
  candidateRefreshTokens CandidateRefreshToken[]

  @@index([examId, status])
  @@map("invitations")
}
```

Modify the existing `Question` model to add a back-relation for `Answer`:

```prisma
model Question {
  id             String                @id @default(uuid()) @db.UniqueIdentifier
  organizationId String                @map("organization_id") @db.UniqueIdentifier
  type           String
  text           String                @db.NVarChar(Max)
  topic          String?
  category       String?
  difficulty     String
  marks          Int
  negativeMarks  Int                   @default(0) @map("negative_marks")
  status         String                @default("active")
  createdBy      String                @map("created_by") @db.UniqueIdentifier
  createdAt      DateTime              @default(now()) @map("created_at")
  options        QuestionOption[]
  examLinks      ExamSectionQuestion[]
  answers        Answer[]

  @@index([organizationId, topic, difficulty])
  @@map("questions")
}
```

Then add four new models at the end of the file (after `Notification`):

```prisma
model Attempt {
  id                String     @id @default(uuid()) @db.UniqueIdentifier
  invitationId      String     @unique @map("invitation_id") @db.UniqueIdentifier
  candidateId       String     @map("candidate_id") @db.UniqueIdentifier
  examId            String     @map("exam_id") @db.UniqueIdentifier
  status            String     @default("in_progress")
  questionOrderJson String     @map("question_order_json") @db.NVarChar(Max)
  startedAt         DateTime   @default(now()) @map("started_at")
  submittedAt       DateTime?  @map("submitted_at")
  invitation        Invitation @relation(fields: [invitationId], references: [id], onDelete: Cascade)
  answers           Answer[]
  result            Result?

  @@index([examId, status])
  @@map("attempts")
}

model Answer {
  id                    String   @id @default(uuid()) @db.UniqueIdentifier
  attemptId             String   @map("attempt_id") @db.UniqueIdentifier
  questionId            String   @map("question_id") @db.UniqueIdentifier
  selectedOptionIdsJson String   @map("selected_option_ids_json") @db.NVarChar(Max)
  isMarkedForReview     Boolean  @default(false) @map("is_marked_for_review")
  answeredAt            DateTime @default(now()) @map("answered_at")
  isCorrect             Boolean? @map("is_correct")
  marksAwarded          Int?     @map("marks_awarded")
  attempt               Attempt  @relation(fields: [attemptId], references: [id], onDelete: Cascade)
  question              Question @relation(fields: [questionId], references: [id])

  @@unique([attemptId, questionId])
  @@map("answers")
}

model Result {
  id         String   @id @default(uuid()) @db.UniqueIdentifier
  attemptId  String   @unique @map("attempt_id") @db.UniqueIdentifier
  score      Int
  maxScore   Int      @map("max_score")
  percentage Float
  passFail   String   @map("pass_fail")
  computedAt DateTime @default(now()) @map("computed_at")
  attempt    Attempt  @relation(fields: [attemptId], references: [id], onDelete: Cascade)

  @@map("results")
}

model CandidateRefreshToken {
  id           String     @id @default(uuid()) @db.UniqueIdentifier
  invitationId String     @map("invitation_id") @db.UniqueIdentifier
  tokenHash    String     @map("token_hash")
  familyId     String     @map("family_id")
  expiresAt    DateTime   @map("expires_at")
  revokedAt    DateTime?  @map("revoked_at")
  createdAt    DateTime   @default(now()) @map("created_at")
  invitation   Invitation @relation(fields: [invitationId], references: [id], onDelete: Cascade)

  @@index([invitationId])
  @@map("candidate_refresh_tokens")
}
```

- [ ] **Step 2: Generate the migration**

Run (from `apps/api/`): `npx prisma migrate dev --create-only --name attempt_runtime_schema`
Expected: fails with a P3014 shadow-database permission error, same as every prior schema task in this project. Hand-write the migration SQL directly (Step 3).

- [ ] **Step 3: Write the migration SQL by hand**

`apps/api/prisma/migrations/20260708090000_attempt_runtime_schema/migration.sql`:
```sql
-- AlterTable: exams gain durationMinutes and passCriteriaPercent, needed by the
-- Phase 1d exam-taking runtime for the server-authoritative timer and pass/fail
-- grading. Existing exams get sensible defaults rather than nullable columns.
ALTER TABLE [dbo].[exams] ADD [duration_minutes] INT NOT NULL CONSTRAINT [exams_duration_minutes_df] DEFAULT 60;
ALTER TABLE [dbo].[exams] ADD [pass_criteria_percent] INT NOT NULL CONSTRAINT [exams_pass_criteria_percent_df] DEFAULT 40;

-- CreateTable
CREATE TABLE [dbo].[attempts] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [invitation_id] UNIQUEIDENTIFIER NOT NULL,
    [candidate_id] UNIQUEIDENTIFIER NOT NULL,
    [exam_id] UNIQUEIDENTIFIER NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [attempts_status_df] DEFAULT 'in_progress',
    [question_order_json] NVARCHAR(MAX) NOT NULL,
    [started_at] DATETIME2 NOT NULL CONSTRAINT [attempts_started_at_df] DEFAULT GETUTCDATE(),
    [submitted_at] DATETIME2,
    CONSTRAINT [attempts_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[answers] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [attempt_id] UNIQUEIDENTIFIER NOT NULL,
    [question_id] UNIQUEIDENTIFIER NOT NULL,
    [selected_option_ids_json] NVARCHAR(MAX) NOT NULL,
    [is_marked_for_review] BIT NOT NULL CONSTRAINT [answers_is_marked_for_review_df] DEFAULT 0,
    [answered_at] DATETIME2 NOT NULL CONSTRAINT [answers_answered_at_df] DEFAULT GETUTCDATE(),
    [is_correct] BIT,
    [marks_awarded] INT,
    CONSTRAINT [answers_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[results] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [attempt_id] UNIQUEIDENTIFIER NOT NULL,
    [score] INT NOT NULL,
    [max_score] INT NOT NULL,
    [percentage] FLOAT NOT NULL,
    [pass_fail] NVARCHAR(1000) NOT NULL,
    [computed_at] DATETIME2 NOT NULL CONSTRAINT [results_computed_at_df] DEFAULT GETUTCDATE(),
    CONSTRAINT [results_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[candidate_refresh_tokens] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [invitation_id] UNIQUEIDENTIFIER NOT NULL,
    [token_hash] NVARCHAR(1000) NOT NULL,
    [family_id] NVARCHAR(1000) NOT NULL,
    [expires_at] DATETIME2 NOT NULL,
    [revoked_at] DATETIME2,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [candidate_refresh_tokens_created_at_df] DEFAULT GETUTCDATE(),
    CONSTRAINT [candidate_refresh_tokens_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE UNIQUE NONCLUSTERED INDEX [attempts_invitation_id_key] ON [dbo].[attempts]([invitation_id]);
CREATE NONCLUSTERED INDEX [attempts_exam_id_status_idx] ON [dbo].[attempts]([exam_id], [status]);
CREATE UNIQUE NONCLUSTERED INDEX [answers_attempt_id_question_id_key] ON [dbo].[answers]([attempt_id], [question_id]);
CREATE UNIQUE NONCLUSTERED INDEX [results_attempt_id_key] ON [dbo].[results]([attempt_id]);
CREATE NONCLUSTERED INDEX [candidate_refresh_tokens_invitation_id_idx] ON [dbo].[candidate_refresh_tokens]([invitation_id]);

-- AddForeignKey
ALTER TABLE [dbo].[attempts] ADD CONSTRAINT [attempts_invitation_id_fkey] FOREIGN KEY ([invitation_id]) REFERENCES [dbo].[invitations]([id]) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE [dbo].[answers] ADD CONSTRAINT [answers_attempt_id_fkey] FOREIGN KEY ([attempt_id]) REFERENCES [dbo].[attempts]([id]) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE [dbo].[answers] ADD CONSTRAINT [answers_question_id_fkey] FOREIGN KEY ([question_id]) REFERENCES [dbo].[questions]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[results] ADD CONSTRAINT [results_attempt_id_fkey] FOREIGN KEY ([attempt_id]) REFERENCES [dbo].[attempts]([id]) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE [dbo].[candidate_refresh_tokens] ADD CONSTRAINT [candidate_refresh_tokens_invitation_id_fkey] FOREIGN KEY ([invitation_id]) REFERENCES [dbo].[invitations]([id]) ON DELETE CASCADE ON UPDATE CASCADE;
```

Note: `attempts.candidate_id`/`attempts.exam_id` are deliberately plain denormalized columns with no FK constraint (used only for the `[exam_id, status]` index) — the real ownership path is always `attempt → invitation → exam`/`candidate`, exactly as `invitations.candidate_id`/`invitations.exam_id` are the real FKs and nothing else in this schema duplicates them redundantly with a second constraint. `answers_question_id_fkey` uses `NO ACTION` since questions are never hard-deleted in this system (archive-only) and an answer must survive independently of question lifecycle.

- [ ] **Step 4: Apply the migration**

Run: `npx prisma migrate deploy` (never `migrate dev` for applying), then `npx prisma generate`.
Expected: migration applies cleanly; `@prisma/client` types now include `Attempt`, `Answer`, `Result`, `CandidateRefreshToken`, and `Exam.durationMinutes`/`passCriteriaPercent`.

- [ ] **Step 5: Verify against the real database**

Run: `sqlcmd -S localhost,1433 -U examapp_dev -P 'DevPassw0rd!2026' -d examapp -Q "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME IN ('attempts','answers','results','candidate_refresh_tokens')" -C`
Expected: all four table names returned.

Run: `sqlcmd -S localhost,1433 -U examapp_dev -P 'DevPassw0rd!2026' -d examapp -Q "SELECT dc.name, dc.definition FROM sys.default_constraints dc JOIN sys.columns c ON dc.parent_object_id=c.object_id AND dc.parent_column_id=c.column_id WHERE c.name='duration_minutes' AND OBJECT_NAME(dc.parent_object_id)='exams'" -C`
Expected: one row, `definition` = `((60))`.

- [ ] **Step 6: Wire the new Exam fields into CreateExamDto/UpdateExamDto**

Replace `apps/api/src/exams/dto/create-exam.dto.ts`:
```typescript
import { IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateExamDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsOptional()
  @IsString()
  instructions?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  durationMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  passCriteriaPercent?: number;
}
```

`apps/api/src/exams/dto/update-exam.dto.ts` already reads `export class UpdateExamDto extends CreateExamDto {}` — no change needed, it inherits the new fields automatically.

- [ ] **Step 7: Write the failing tests for create()/update() passthrough**

In `apps/api/src/exams/exams.service.spec.ts`, add these two tests directly after the existing `"creates an exam scoped to the caller's organization"` test:

```typescript
  it('passes durationMinutes and passCriteriaPercent through to the created exam when provided', async () => {
    const tx = { exam: { create: jest.fn().mockResolvedValue({ id: 'exam-1' }) } };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await service.create(context, 'user-1', { title: 'Backend Round', durationMinutes: 45, passCriteriaPercent: 60 });

    expect(tx.exam.create).toHaveBeenCalledWith({
      data: {
        organizationId: 'org-1',
        title: 'Backend Round',
        instructions: undefined,
        durationMinutes: 45,
        passCriteriaPercent: 60,
        createdBy: 'user-1',
      },
    });
  });

  it('lets the database default apply to durationMinutes/passCriteriaPercent when omitted', async () => {
    const tx = { exam: { create: jest.fn().mockResolvedValue({ id: 'exam-1' }) } };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await service.create(context, 'user-1', { title: 'Backend Round' });

    expect(tx.exam.create).toHaveBeenCalledWith({
      data: {
        organizationId: 'org-1',
        title: 'Backend Round',
        instructions: undefined,
        durationMinutes: undefined,
        passCriteriaPercent: undefined,
        createdBy: 'user-1',
      },
    });
  });
```

- [ ] **Step 8: Run the tests to verify they fail**

Run: `npm run test:api -- exams.service`
Expected: FAIL — `tx.exam.create` was called without `durationMinutes`/`passCriteriaPercent` keys yet.

- [ ] **Step 9: Update ExamsService.create() and update()**

In `apps/api/src/exams/exams.service.ts`, replace the `create` method:
```typescript
  async create(context: TenantContext, userId: string, dto: CreateExamDto): Promise<Exam> {
    return this.tenantPrisma.forTenant(context, (tx) =>
      tx.exam.create({
        data: {
          organizationId: context.organizationId as string,
          title: dto.title,
          instructions: dto.instructions,
          durationMinutes: dto.durationMinutes,
          passCriteriaPercent: dto.passCriteriaPercent,
          createdBy: userId,
        },
      }),
    );
  }
```

Replace the `update` method:
```typescript
  async update(context: TenantContext, id: string, dto: UpdateExamDto): Promise<Exam> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const existing = await tx.exam.findFirst({ where: { id, organizationId: context.organizationId as string } });
      if (!existing) {
        throw new NotFoundException(`Exam ${id} not found`);
      }
      return tx.exam.update({
        where: { id },
        data: {
          title: dto.title,
          instructions: dto.instructions,
          ...(dto.durationMinutes !== undefined ? { durationMinutes: dto.durationMinutes } : {}),
          ...(dto.passCriteriaPercent !== undefined ? { passCriteriaPercent: dto.passCriteriaPercent } : {}),
        },
      });
    });
  }
```

- [ ] **Step 10: Run the tests to verify they pass**

Run: `npm run test:api -- exams.service`
Expected: `21 passed`.

Run: `npm run test:api` (from repo root)
Expected: all suites passing, no regressions.

- [ ] **Step 11: Add the candidate JWT env vars to .env.example**

In `.env.example` (repo root), append after `WEB_ORIGIN`:
```
CANDIDATE_JWT_ACCESS_SECRET="dev-candidate-access-secret-change-me"
CANDIDATE_JWT_REFRESH_SECRET="dev-candidate-refresh-secret-change-me"
CANDIDATE_ACCESS_TOKEN_TTL_SECONDS=14400
CANDIDATE_REFRESH_TOKEN_TTL_DAYS=1
```

Then run (from repo root): manually append the same four lines to `apps/api/.env` (gitignored, not committed) so the local dev server and test run pick them up.

- [ ] **Step 12: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations apps/api/src/exams/dto/create-exam.dto.ts apps/api/src/exams/exams.service.ts apps/api/src/exams/exams.service.spec.ts .env.example
git commit -m "feat: add Exam duration/pass-criteria fields and Attempt/Answer/Result/CandidateRefreshToken schema"
```

---

### Task 2: Grading pure functions

**Files:**
- Create: `apps/api/src/grading/grading.ts`
- Create: `apps/api/src/grading/grading.spec.ts`

**Interfaces:**
- Produces: `gradeAnswer(question: { marks: number; correctOptionIds: string[] }, selectedOptionIds: string[]): { isCorrect: boolean; marksAwarded: number }`, `computeResult(gradedAnswers: { marksAwarded: number }[], questions: { marks: number }[], passCriteriaPercent: number): { score: number; maxScore: number; percentage: number; passFail: 'pass' | 'fail' }` — Task 3's `AttemptSettlementService` calls these exact signatures.

- [ ] **Step 1: Write the failing tests**

`apps/api/src/grading/grading.spec.ts`:
```typescript
import { gradeAnswer, computeResult } from './grading';

describe('gradeAnswer', () => {
  it('awards full marks for an exact single-option match', () => {
    const result = gradeAnswer({ marks: 5, correctOptionIds: ['opt-a'] }, ['opt-a']);
    expect(result).toEqual({ isCorrect: true, marksAwarded: 5 });
  });

  it('awards zero marks for a wrong single-option selection', () => {
    const result = gradeAnswer({ marks: 5, correctOptionIds: ['opt-a'] }, ['opt-b']);
    expect(result).toEqual({ isCorrect: false, marksAwarded: 0 });
  });

  it('awards full marks for an exact multi-option match regardless of order', () => {
    const result = gradeAnswer({ marks: 4, correctOptionIds: ['opt-a', 'opt-b'] }, ['opt-b', 'opt-a']);
    expect(result).toEqual({ isCorrect: true, marksAwarded: 4 });
  });

  it('awards zero marks for a partial multi-option match (all-or-nothing)', () => {
    const result = gradeAnswer({ marks: 4, correctOptionIds: ['opt-a', 'opt-b'] }, ['opt-a']);
    expect(result).toEqual({ isCorrect: false, marksAwarded: 0 });
  });

  it('awards zero marks when an extra incorrect option is included alongside the correct ones', () => {
    const result = gradeAnswer({ marks: 4, correctOptionIds: ['opt-a', 'opt-b'] }, ['opt-a', 'opt-b', 'opt-c']);
    expect(result).toEqual({ isCorrect: false, marksAwarded: 0 });
  });

  it('awards zero marks for an empty selection', () => {
    const result = gradeAnswer({ marks: 5, correctOptionIds: ['opt-a'] }, []);
    expect(result).toEqual({ isCorrect: false, marksAwarded: 0 });
  });
});

describe('computeResult', () => {
  it('computes score, maxScore, percentage, and pass when meeting the pass criteria', () => {
    const summary = computeResult([{ marksAwarded: 5 }, { marksAwarded: 0 }], [{ marks: 5 }, { marks: 5 }], 50);
    expect(summary).toEqual({ score: 5, maxScore: 10, percentage: 50, passFail: 'pass' });
  });

  it('returns fail when below the pass criteria', () => {
    const summary = computeResult([{ marksAwarded: 2 }], [{ marks: 10 }], 50);
    expect(summary).toEqual({ score: 2, maxScore: 10, percentage: 20, passFail: 'fail' });
  });

  it('counts an unanswered question toward maxScore but contributes nothing to score', () => {
    const summary = computeResult([{ marksAwarded: 3 }], [{ marks: 3 }, { marks: 7 }], 40);
    expect(summary).toEqual({ score: 3, maxScore: 10, percentage: 30, passFail: 'fail' });
  });

  it('returns a zero percentage instead of dividing by zero when there are no questions', () => {
    const summary = computeResult([], [], 40);
    expect(summary).toEqual({ score: 0, maxScore: 0, percentage: 0, passFail: 'fail' });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:api -- grading`
Expected: FAIL — `gradeAnswer`/`computeResult` are not defined yet.

- [ ] **Step 3: Write the implementation**

`apps/api/src/grading/grading.ts`:
```typescript
export interface GradableQuestion {
  marks: number;
  correctOptionIds: string[];
}

export interface GradedAnswer {
  isCorrect: boolean;
  marksAwarded: number;
}

export function gradeAnswer(question: GradableQuestion, selectedOptionIds: string[]): GradedAnswer {
  const selectedSet = new Set(selectedOptionIds);
  const correctSet = new Set(question.correctOptionIds);
  const isCorrect = selectedSet.size === correctSet.size && [...selectedSet].every((id) => correctSet.has(id));
  return { isCorrect, marksAwarded: isCorrect ? question.marks : 0 };
}

export interface ResultSummary {
  score: number;
  maxScore: number;
  percentage: number;
  passFail: 'pass' | 'fail';
}

export function computeResult(
  gradedAnswers: { marksAwarded: number }[],
  questions: { marks: number }[],
  passCriteriaPercent: number,
): ResultSummary {
  const score = gradedAnswers.reduce((sum, answer) => sum + answer.marksAwarded, 0);
  const maxScore = questions.reduce((sum, question) => sum + question.marks, 0);
  const percentage = maxScore > 0 ? (score / maxScore) * 100 : 0;
  const passFail: 'pass' | 'fail' = percentage >= passCriteriaPercent ? 'pass' : 'fail';
  return { score, maxScore, percentage, passFail };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:api -- grading`
Expected: `10 passed`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/grading/grading.ts apps/api/src/grading/grading.spec.ts
git commit -m "feat: add pure grading functions for exam-taking runtime"
```

---

### Task 3: AttemptSettlementService and GradingModule

**Files:**
- Create: `apps/api/src/grading/attempt-settlement.service.ts`
- Create: `apps/api/src/grading/attempt-settlement.service.spec.ts`
- Create: `apps/api/src/grading/grading.module.ts`

**Interfaces:**
- Consumes: `gradeAnswer`/`computeResult` (Task 2, exact signatures).
- Produces: `AttemptSettlementService.remainingSeconds(exam: { durationMinutes: number }, attempt: { startedAt: Date }): number`, `.settleIfExpired(tx: Prisma.TransactionClient, exam: { id: string; durationMinutes: number; passCriteriaPercent: number }, attempt: Attempt): Promise<Attempt>`, `.finalize(tx, exam, attempt, status: 'submitted' | 'auto_submitted'): Promise<Attempt>` — Task 6's `AttemptService` and Task 8's `ExamsService.getResults` both call these exact method names. `GradingModule` exports `AttemptSettlementService`.

- [ ] **Step 1: Write the failing tests**

`apps/api/src/grading/attempt-settlement.service.spec.ts`:
```typescript
import { Prisma } from '@prisma/client';
import { AttemptSettlementService } from './attempt-settlement.service';

describe('AttemptSettlementService', () => {
  let service: AttemptSettlementService;
  const exam = { id: 'exam-1', durationMinutes: 30, passCriteriaPercent: 50 };

  beforeEach(() => {
    service = new AttemptSettlementService();
  });

  describe('remainingSeconds', () => {
    it('returns a positive value before the exam duration has elapsed', () => {
      const startedAt = new Date(Date.now() - 5 * 60_000);
      const seconds = service.remainingSeconds(exam, { startedAt });
      expect(seconds).toBeGreaterThan(0);
      expect(seconds).toBeLessThanOrEqual(25 * 60);
    });

    it('returns zero (not negative) once the duration has elapsed', () => {
      const startedAt = new Date(Date.now() - 60 * 60_000);
      expect(service.remainingSeconds(exam, { startedAt })).toBe(0);
    });
  });

  describe('settleIfExpired', () => {
    it('leaves an in-progress attempt untouched if the duration has not elapsed', async () => {
      const attempt = { id: 'attempt-1', status: 'in_progress', startedAt: new Date(), questionOrderJson: '[]' };
      const tx = {
        question: { findMany: jest.fn() },
        answer: { findMany: jest.fn() },
        result: { create: jest.fn() },
        attempt: { update: jest.fn() },
      };

      const result = await service.settleIfExpired(tx as unknown as Prisma.TransactionClient, exam, attempt as any);

      expect(result).toBe(attempt);
      expect(tx.attempt.update).not.toHaveBeenCalled();
    });

    it('leaves an already-submitted attempt untouched even if the duration has elapsed', async () => {
      const attempt = {
        id: 'attempt-1', status: 'submitted', startedAt: new Date(Date.now() - 60 * 60_000), questionOrderJson: '[]',
      };
      const tx = {
        question: { findMany: jest.fn() },
        answer: { findMany: jest.fn() },
        result: { create: jest.fn() },
        attempt: { update: jest.fn() },
      };

      const result = await service.settleIfExpired(tx as unknown as Prisma.TransactionClient, exam, attempt as any);

      expect(result).toBe(attempt);
      expect(tx.question.findMany).not.toHaveBeenCalled();
    });

    it('grades and transitions an expired in-progress attempt to auto_submitted', async () => {
      const attempt = {
        id: 'attempt-1',
        status: 'in_progress',
        startedAt: new Date(Date.now() - 60 * 60_000),
        questionOrderJson: JSON.stringify(['q1']),
      };
      const tx = {
        question: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'q1', marks: 5, options: [{ id: 'opt-a', isCorrect: true }, { id: 'opt-b', isCorrect: false }] },
          ]),
        },
        answer: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'answer-1', questionId: 'q1', selectedOptionIdsJson: JSON.stringify(['opt-a']) },
          ]),
          update: jest.fn(),
        },
        result: { create: jest.fn() },
        attempt: { update: jest.fn().mockResolvedValue({ id: 'attempt-1', status: 'auto_submitted' }) },
      };

      const result = await service.settleIfExpired(tx as unknown as Prisma.TransactionClient, exam, attempt as any);

      expect(tx.answer.update).toHaveBeenCalledWith({ where: { id: 'answer-1' }, data: { isCorrect: true, marksAwarded: 5 } });
      expect(tx.result.create).toHaveBeenCalledWith({
        data: { attemptId: 'attempt-1', score: 5, maxScore: 5, percentage: 100, passFail: 'pass' },
      });
      expect(tx.attempt.update).toHaveBeenCalledWith({
        where: { id: 'attempt-1' },
        data: { status: 'auto_submitted', submittedAt: expect.any(Date) },
      });
      expect(result.status).toBe('auto_submitted');
    });
  });

  describe('finalize', () => {
    it('grades an unanswered question as zero marks without creating an answer row', async () => {
      const attempt = { id: 'attempt-1', questionOrderJson: JSON.stringify(['q1']) };
      const tx = {
        question: { findMany: jest.fn().mockResolvedValue([{ id: 'q1', marks: 5, options: [{ id: 'opt-a', isCorrect: true }] }]) },
        answer: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
        result: { create: jest.fn() },
        attempt: { update: jest.fn().mockResolvedValue({ id: 'attempt-1', status: 'submitted' }) },
      };

      await service.finalize(tx as unknown as Prisma.TransactionClient, exam, attempt as any, 'submitted');

      expect(tx.answer.update).not.toHaveBeenCalled();
      expect(tx.result.create).toHaveBeenCalledWith({
        data: { attemptId: 'attempt-1', score: 0, maxScore: 5, percentage: 0, passFail: 'fail' },
      });
      expect(tx.attempt.update).toHaveBeenCalledWith({
        where: { id: 'attempt-1' },
        data: { status: 'submitted', submittedAt: expect.any(Date) },
      });
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:api -- attempt-settlement`
Expected: FAIL — `AttemptSettlementService` is not defined yet.

- [ ] **Step 3: Implement the service**

`apps/api/src/grading/attempt-settlement.service.ts`:
```typescript
import { Injectable } from '@nestjs/common';
import { Attempt, Prisma } from '@prisma/client';
import { gradeAnswer, computeResult } from './grading';

export interface SettlementExam {
  id: string;
  durationMinutes: number;
  passCriteriaPercent: number;
}

@Injectable()
export class AttemptSettlementService {
  remainingSeconds(exam: Pick<SettlementExam, 'durationMinutes'>, attempt: { startedAt: Date }): number {
    const deadline = new Date(attempt.startedAt).getTime() + exam.durationMinutes * 60_000;
    return Math.max(0, Math.round((deadline - Date.now()) / 1000));
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
    status: 'submitted' | 'auto_submitted',
  ): Promise<Attempt> {
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

    return tx.attempt.update({ where: { id: attempt.id }, data: { status, submittedAt: new Date() } });
  }
}
```

`apps/api/src/grading/grading.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { AttemptSettlementService } from './attempt-settlement.service';

@Module({
  providers: [AttemptSettlementService],
  exports: [AttemptSettlementService],
})
export class GradingModule {}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:api -- attempt-settlement`
Expected: `5 passed`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/grading
git commit -m "feat: add AttemptSettlementService (lazy auto-submit + grading) and GradingModule"
```

---

### Task 4: CandidateAuthService

**Files:**
- Create: `apps/api/src/candidate-auth/candidate-auth.service.ts`
- Create: `apps/api/src/candidate-auth/candidate-auth.service.spec.ts`

**Interfaces:**
- Consumes: `PrismaService` (Phase 0, raw — `candidateRefreshToken` and `invitation` have no RLS), `TenantPrismaService` (Phase 0, super-admin bootstrap bypass — see Global Constraints).
- Produces: `CandidateAuthService.redeem(token: string): Promise<{ accessToken: string; refreshToken: string }>`, `.refresh(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }>`, `.logout(refreshToken: string): Promise<void>` — Task 5's controller calls these exact method names.

- [ ] **Step 1: Write the failing tests**

`apps/api/src/candidate-auth/candidate-auth.service.spec.ts`:
```typescript
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { CandidateAuthService } from './candidate-auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';

describe('CandidateAuthService', () => {
  let service: CandidateAuthService;
  let prisma: {
    invitation: { findUnique: jest.Mock };
    candidateRefreshToken: { findFirst: jest.Mock; create: jest.Mock; update: jest.Mock; updateMany: jest.Mock };
  };
  let tenantPrisma: { forTenant: jest.Mock };
  let jwt: JwtService;

  beforeEach(async () => {
    prisma = {
      invitation: { findUnique: jest.fn() },
      candidateRefreshToken: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    };
    tenantPrisma = { forTenant: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        CandidateAuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: TenantPrismaService, useValue: tenantPrisma },
        JwtService,
      ],
    }).compile();

    service = moduleRef.get(CandidateAuthService);
    jwt = moduleRef.get(JwtService);
    process.env.CANDIDATE_JWT_ACCESS_SECRET = 'test-candidate-access-secret';
    process.env.CANDIDATE_JWT_REFRESH_SECRET = 'test-candidate-refresh-secret';
  });

  describe('redeem', () => {
    it('throws NotFoundException when the token does not resolve to an invitation', async () => {
      prisma.invitation.findUnique.mockResolvedValue(null);

      await expect(service.redeem('bad-token')).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when the invitation was revoked', async () => {
      prisma.invitation.findUnique.mockResolvedValue({
        id: 'inv-1', status: 'revoked', expiresAt: new Date(Date.now() + 86_400_000), examId: 'exam-1',
      });

      await expect(service.redeem('token')).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when the invitation has expired', async () => {
      prisma.invitation.findUnique.mockResolvedValue({
        id: 'inv-1', status: 'invited', expiresAt: new Date(Date.now() - 1000), examId: 'exam-1',
      });

      await expect(service.redeem('token')).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when the exam is not published', async () => {
      prisma.invitation.findUnique.mockResolvedValue({
        id: 'inv-1', status: 'invited', expiresAt: new Date(Date.now() + 86_400_000), examId: 'exam-1',
      });
      tenantPrisma.forTenant.mockResolvedValue({ id: 'exam-1', status: 'draft' });

      await expect(service.redeem('token')).rejects.toThrow(BadRequestException);
    });

    it('issues a candidate access and refresh token pair for a valid, live invitation to a published exam', async () => {
      prisma.invitation.findUnique.mockResolvedValue({
        id: 'inv-1', status: 'invited', expiresAt: new Date(Date.now() + 86_400_000), examId: 'exam-1',
      });
      tenantPrisma.forTenant.mockResolvedValue({ id: 'exam-1', status: 'published' });
      prisma.candidateRefreshToken.create.mockResolvedValue({});

      const result = await service.redeem('token');

      expect(result.accessToken).toEqual(expect.any(String));
      expect(result.refreshToken).toEqual(expect.any(String));
      const decoded = jwt.decode(result.accessToken) as { sub: string; subjectType: string };
      expect(decoded.sub).toBe('inv-1');
      expect(decoded.subjectType).toBe('candidate');
    });
  });

  describe('refresh', () => {
    it('throws UnauthorizedException for a refresh token that fails signature verification', async () => {
      await expect(service.refresh('not-a-real-jwt')).rejects.toThrow(UnauthorizedException);
    });

    it('rotates and revokes the whole family on reuse of an already-rotated/unknown token', async () => {
      const refreshToken = jwt.sign({ sub: 'inv-1', familyId: 'family-1' }, { secret: process.env.CANDIDATE_JWT_REFRESH_SECRET });
      prisma.candidateRefreshToken.findFirst.mockResolvedValue(null);

      await expect(service.refresh(refreshToken)).rejects.toThrow(UnauthorizedException);
      expect(prisma.candidateRefreshToken.updateMany).toHaveBeenCalledWith({
        where: { invitationId: 'inv-1', familyId: 'family-1' },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('issues a new token pair on a valid, unrevoked refresh token', async () => {
      const refreshToken = jwt.sign({ sub: 'inv-1', familyId: 'family-1' }, { secret: process.env.CANDIDATE_JWT_REFRESH_SECRET });
      const tokenHash = await argon2.hash(refreshToken);
      prisma.candidateRefreshToken.findFirst.mockResolvedValue({ id: 'crt-1', tokenHash, revokedAt: null });
      prisma.candidateRefreshToken.update.mockResolvedValue({});
      prisma.candidateRefreshToken.create.mockResolvedValue({});

      const result = await service.refresh(refreshToken);

      expect(result.accessToken).toEqual(expect.any(String));
      expect(prisma.candidateRefreshToken.update).toHaveBeenCalledWith({
        where: { id: 'crt-1' },
        data: { revokedAt: expect.any(Date) },
      });
    });
  });

  describe('logout', () => {
    it('revokes the refresh token family', async () => {
      const refreshToken = jwt.sign({ sub: 'inv-1', familyId: 'family-1' }, { secret: process.env.CANDIDATE_JWT_REFRESH_SECRET });

      await service.logout(refreshToken);

      expect(prisma.candidateRefreshToken.updateMany).toHaveBeenCalledWith({
        where: { invitationId: 'inv-1', familyId: 'family-1' },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('does nothing when given an invalid refresh token', async () => {
      await service.logout('not-a-real-jwt');

      expect(prisma.candidateRefreshToken.updateMany).not.toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:api -- candidate-auth.service`
Expected: FAIL — `CandidateAuthService` is not defined yet.

- [ ] **Step 3: Implement the service**

`apps/api/src/candidate-auth/candidate-auth.service.ts`:
```typescript
import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';

interface CandidateTokenPair {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class CandidateAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly jwt: JwtService,
  ) {}

  async redeem(token: string): Promise<CandidateTokenPair> {
    const invitation = await this.prisma.invitation.findUnique({ where: { token } });
    if (!invitation) {
      throw new NotFoundException('This invitation link is invalid');
    }
    if (invitation.status === 'revoked') {
      throw new BadRequestException('This invitation was revoked');
    }
    if (invitation.expiresAt < new Date()) {
      throw new BadRequestException('This invitation has expired');
    }

    const exam = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) =>
      tx.exam.findUniqueOrThrow({ where: { id: invitation.examId } }),
    );
    if (exam.status !== 'published') {
      throw new BadRequestException('This exam is not currently available');
    }

    return this.issueTokenPair(invitation.id);
  }

  async refresh(refreshToken: string): Promise<CandidateTokenPair> {
    let payload: { sub: string; familyId: string };
    try {
      payload = this.jwt.verify(refreshToken, { secret: process.env.CANDIDATE_JWT_REFRESH_SECRET });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const stored = await this.prisma.candidateRefreshToken.findFirst({
      where: { invitationId: payload.sub, familyId: payload.familyId, revokedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    if (!stored || !(await argon2.verify(stored.tokenHash, refreshToken).catch(() => false))) {
      await this.prisma.candidateRefreshToken.updateMany({
        where: { invitationId: payload.sub, familyId: payload.familyId },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Refresh token reuse detected — session revoked');
    }

    await this.prisma.candidateRefreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });

    return this.issueTokenPair(payload.sub, payload.familyId);
  }

  async logout(refreshToken: string): Promise<void> {
    let payload: { sub: string; familyId: string };
    try {
      payload = this.jwt.verify(refreshToken, { secret: process.env.CANDIDATE_JWT_REFRESH_SECRET });
    } catch {
      return;
    }
    await this.prisma.candidateRefreshToken.updateMany({
      where: { invitationId: payload.sub, familyId: payload.familyId },
      data: { revokedAt: new Date() },
    });
  }

  private async issueTokenPair(invitationId: string, familyId: string = randomUUID()): Promise<CandidateTokenPair> {
    const accessToken = this.jwt.sign(
      { sub: invitationId, subjectType: 'candidate' },
      { secret: process.env.CANDIDATE_JWT_ACCESS_SECRET, expiresIn: `${process.env.CANDIDATE_ACCESS_TOKEN_TTL_SECONDS ?? 14400}s` },
    );
    const refreshToken = this.jwt.sign(
      { sub: invitationId, familyId },
      { secret: process.env.CANDIDATE_JWT_REFRESH_SECRET, expiresIn: `${process.env.CANDIDATE_REFRESH_TOKEN_TTL_DAYS ?? 1}d` },
    );
    const tokenHash = await argon2.hash(refreshToken);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + Number(process.env.CANDIDATE_REFRESH_TOKEN_TTL_DAYS ?? 1));

    await this.prisma.candidateRefreshToken.create({ data: { invitationId, tokenHash, familyId, expiresAt } });

    return { accessToken, refreshToken };
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:api -- candidate-auth.service`
Expected: `10 passed`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/candidate-auth/candidate-auth.service.ts apps/api/src/candidate-auth/candidate-auth.service.spec.ts
git commit -m "feat: add CandidateAuthService (redeem/refresh/logout, separate JWT secrets from staff)"
```

---

### Task 5: CandidateAuthController, strategy, guard, decorator, module, and AppModule wiring

**Files:**
- Create: `apps/api/src/candidate-auth/dto/redeem-invitation.dto.ts`
- Create: `apps/api/src/candidate-auth/candidate-auth.controller.ts`
- Create: `apps/api/src/candidate-auth/candidate-jwt.strategy.ts`
- Create: `apps/api/src/candidate-auth/candidate-jwt-auth.guard.ts`
- Create: `apps/api/src/candidate-auth/current-candidate.decorator.ts`
- Create: `apps/api/src/candidate-auth/candidate-auth.module.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `CandidateAuthService` (Task 4), `RefreshDto` (Phase 0, `apps/api/src/auth/dto/refresh.dto.ts`, reused as-is — its shape `{ refreshToken: string }` is identical to what candidate refresh/logout need).
- Produces: HTTP routes `POST /candidate-auth/redeem`, `POST /candidate-auth/refresh`, `POST /candidate-auth/logout`. `CandidateJwtAuthGuard` (Passport strategy name `'candidate-jwt'`) and `CurrentCandidate()` decorator resolving `{ invitationId: string }` — Task 7's `AttemptController` uses both exact names.

- [ ] **Step 1: Write the DTO**

`apps/api/src/candidate-auth/dto/redeem-invitation.dto.ts`:
```typescript
import { IsString } from 'class-validator';

export class RedeemInvitationDto {
  @IsString()
  token!: string;
}
```

- [ ] **Step 2: Write the Passport strategy, guard, and decorator**

`apps/api/src/candidate-auth/candidate-jwt.strategy.ts`:
```typescript
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

export interface CandidateJwtPayload {
  sub: string;
  subjectType: 'candidate';
}

@Injectable()
export class CandidateJwtStrategy extends PassportStrategy(Strategy, 'candidate-jwt') {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.CANDIDATE_JWT_ACCESS_SECRET,
    });
  }

  validate(payload: CandidateJwtPayload) {
    return { invitationId: payload.sub };
  }
}
```

`apps/api/src/candidate-auth/candidate-jwt-auth.guard.ts`:
```typescript
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class CandidateJwtAuthGuard extends AuthGuard('candidate-jwt') {}
```

`apps/api/src/candidate-auth/current-candidate.decorator.ts`:
```typescript
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface CandidateSession {
  invitationId: string;
}

export const CurrentCandidate = createParamDecorator((_: unknown, ctx: ExecutionContext): CandidateSession => {
  const request = ctx.switchToHttp().getRequest();
  const candidate = request.user as CandidateSession | undefined;
  return { invitationId: candidate?.invitationId as string };
});
```

- [ ] **Step 3: Write the controller**

`apps/api/src/candidate-auth/candidate-auth.controller.ts`:
```typescript
import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { CandidateAuthService } from './candidate-auth.service';
import { RedeemInvitationDto } from './dto/redeem-invitation.dto';
import { RefreshDto } from '../auth/dto/refresh.dto';

@Controller('candidate-auth')
export class CandidateAuthController {
  constructor(private readonly candidateAuthService: CandidateAuthService) {}

  @Post('redeem')
  @HttpCode(200)
  redeem(@Body() dto: RedeemInvitationDto) {
    return this.candidateAuthService.redeem(dto.token);
  }

  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() dto: RefreshDto) {
    return this.candidateAuthService.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@Body() dto: RefreshDto) {
    await this.candidateAuthService.logout(dto.refreshToken);
    return { success: true };
  }
}
```

- [ ] **Step 4: Write the module**

`apps/api/src/candidate-auth/candidate-auth.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { CandidateAuthService } from './candidate-auth.service';
import { CandidateAuthController } from './candidate-auth.controller';
import { CandidateJwtStrategy } from './candidate-jwt.strategy';

@Module({
  imports: [PassportModule, JwtModule.register({})],
  providers: [CandidateAuthService, CandidateJwtStrategy],
  controllers: [CandidateAuthController],
  exports: [CandidateAuthService],
})
export class CandidateAuthModule {}
```

- [ ] **Step 5: Register the module in AppModule**

In `apps/api/src/app.module.ts`, add `CandidateAuthModule` to the imports:
```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { RbacModule } from './rbac/rbac.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { UsersModule } from './users/users.module';
import { QuestionsModule } from './questions/questions.module';
import { ExamsModule } from './exams/exams.module';
import { CandidatesModule } from './candidates/candidates.module';
import { InvitationsModule } from './invitations/invitations.module';
import { CandidateAuthModule } from './candidate-auth/candidate-auth.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    RbacModule,
    AuditModule,
    AuthModule,
    OrganizationsModule,
    UsersModule,
    QuestionsModule,
    ExamsModule,
    CandidatesModule,
    InvitationsModule,
    CandidateAuthModule,
  ],
})
export class AppModule {}
```

- [ ] **Step 6: Run the full unit suite and build check**

Run: `npm run test:api` (from repo root) — expect all suites passing, no regressions.
Run: `npx nest build` (from `apps/api/`) — expect a clean build with `CandidateAuthModule` wired in.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/candidate-auth apps/api/src/app.module.ts
git commit -m "feat: add CandidateAuthController, JWT strategy/guard, wire into AppModule"
```

---

### Task 6: AttemptService

**Files:**
- Create: `apps/api/src/attempts/dto/answer.dto.ts`
- Create: `apps/api/src/attempts/attempt.service.ts`
- Create: `apps/api/src/attempts/attempt.service.spec.ts`

**Interfaces:**
- Consumes: `TenantPrismaService.forTenant` (Phase 0, including the super-admin bootstrap pattern from Global Constraints), `AttemptSettlementService` (Task 3, exact method names), `CandidateSession` (Task 5, `{ invitationId: string }`).
- Produces: `AttemptService.getCurrent(session): Promise<AttemptCurrentResponse>`, `.start(session): Promise<{ id: string; status: string }>`, `.answer(session, dto: AnswerDto): Promise<{ questionId: string; selectedOptionIds: string[]; isMarkedForReview: boolean }>`, `.submit(session): Promise<{ status: string }>` — Task 7's controller calls these exact method names.

- [ ] **Step 1: Write the DTO**

`apps/api/src/attempts/dto/answer.dto.ts`:
```typescript
import { ArrayMinSize, IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';

export class AnswerDto {
  @IsString()
  questionId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  selectedOptionIds!: string[];

  @IsOptional()
  @IsBoolean()
  markedForReview?: boolean;
}
```

- [ ] **Step 2: Write the failing tests**

`apps/api/src/attempts/attempt.service.spec.ts`:
```typescript
import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { AttemptService } from './attempt.service';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { AttemptSettlementService } from '../grading/attempt-settlement.service';

describe('AttemptService', () => {
  let service: AttemptService;
  let tenantPrisma: { forTenant: jest.Mock };
  let settlement: { settleIfExpired: jest.Mock; finalize: jest.Mock; remainingSeconds: jest.Mock };
  const session = { invitationId: 'inv-1' };
  const exam = { id: 'exam-1', organizationId: 'org-1', title: 'Backend Round', instructions: 'Be honest', durationMinutes: 60, passCriteriaPercent: 40 };
  const invitationRecord = { id: 'inv-1', candidateId: 'cand-1', examId: 'exam-1', exam };

  beforeEach(async () => {
    tenantPrisma = { forTenant: jest.fn() };
    settlement = { settleIfExpired: jest.fn(), finalize: jest.fn(), remainingSeconds: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AttemptService,
        { provide: TenantPrismaService, useValue: tenantPrisma },
        { provide: AttemptSettlementService, useValue: settlement },
      ],
    }).compile();
    service = moduleRef.get(AttemptService);
  });

  function mockBootstrapThenScoped(scopedTx: unknown) {
    tenantPrisma.forTenant
      .mockImplementationOnce(() => Promise.resolve(invitationRecord))
      .mockImplementationOnce((_ctx, fn) => fn(scopedTx));
  }

  describe('getCurrent', () => {
    it('throws UnauthorizedException when the invitation no longer resolves', async () => {
      tenantPrisma.forTenant.mockImplementationOnce(() => Promise.resolve(null));

      await expect(service.getCurrent(session)).rejects.toThrow(UnauthorizedException);
    });

    it('returns an exam preview with no questions when no attempt has been started yet', async () => {
      const tx = { attempt: { findUnique: jest.fn().mockResolvedValue(null) } };
      mockBootstrapThenScoped(tx);

      const result = await service.getCurrent(session);

      expect(result).toEqual({ exam: { title: 'Backend Round', instructions: 'Be honest', durationMinutes: 60 } });
    });

    it('returns the full attempt state with sections, questions (no isCorrect), and existing answers', async () => {
      const attempt = { id: 'attempt-1', status: 'in_progress', startedAt: new Date(), questionOrderJson: JSON.stringify(['q1']) };
      const tx = {
        attempt: { findUnique: jest.fn().mockResolvedValue(attempt) },
        examSection: {
          findMany: jest.fn().mockResolvedValue([
            {
              title: 'Section One',
              questions: [
                {
                  questionId: 'q1',
                  question: { id: 'q1', text: 'What is 2+2?', type: 'single_mcq', marks: 5, options: [{ id: 'opt-a', text: '4' }, { id: 'opt-b', text: '5' }] },
                },
              ],
            },
          ]),
        },
        answer: { findMany: jest.fn().mockResolvedValue([{ questionId: 'q1', selectedOptionIdsJson: JSON.stringify(['opt-a']), isMarkedForReview: false }]) },
      };
      settlement.settleIfExpired.mockResolvedValue(attempt);
      settlement.remainingSeconds.mockReturnValue(3300);
      mockBootstrapThenScoped(tx);

      const result = await service.getCurrent(session);

      expect(result).toEqual({
        status: 'in_progress',
        remainingSeconds: 3300,
        sections: [
          { title: 'Section One', questions: [{ id: 'q1', text: 'What is 2+2?', type: 'single_mcq', marks: 5, options: [{ id: 'opt-a', text: '4' }, { id: 'opt-b', text: '5' }] }] },
        ],
        answers: [{ questionId: 'q1', selectedOptionIds: ['opt-a'], isMarkedForReview: false }],
      });
      expect(result.sections[0].questions[0]).not.toHaveProperty('isCorrect');
    });
  });

  describe('start', () => {
    it('creates a new attempt snapshotting the question order when none exists', async () => {
      const tx = {
        attempt: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'attempt-1', status: 'in_progress' }) },
        examSection: {
          findMany: jest.fn().mockResolvedValue([
            { questions: [{ questionId: 'q1' }, { questionId: 'q2' }] },
          ]),
        },
      };
      mockBootstrapThenScoped(tx);

      const result = await service.start(session);

      expect(result).toEqual({ id: 'attempt-1', status: 'in_progress' });
      expect(tx.attempt.create).toHaveBeenCalledWith({
        data: { invitationId: 'inv-1', candidateId: 'cand-1', examId: 'exam-1', questionOrderJson: JSON.stringify(['q1', 'q2']) },
      });
    });

    it('returns the existing attempt unchanged when one already exists (idempotent)', async () => {
      const existing = { id: 'attempt-1', status: 'in_progress' };
      const tx = { attempt: { findUnique: jest.fn().mockResolvedValue(existing), create: jest.fn() } };
      mockBootstrapThenScoped(tx);

      const result = await service.start(session);

      expect(result).toEqual({ id: 'attempt-1', status: 'in_progress' });
      expect(tx.attempt.create).not.toHaveBeenCalled();
    });
  });

  describe('answer', () => {
    const attempt = { id: 'attempt-1', status: 'in_progress', startedAt: new Date(), questionOrderJson: JSON.stringify(['q1']) };
    const question = { id: 'q1', type: 'single_mcq', options: [{ id: 'opt-a' }, { id: 'opt-b' }] };

    it('upserts a valid answer', async () => {
      const tx = {
        attempt: { findUnique: jest.fn().mockResolvedValue(attempt) },
        question: { findFirstOrThrow: jest.fn().mockResolvedValue(question) },
        answer: { upsert: jest.fn().mockResolvedValue({}) },
      };
      settlement.settleIfExpired.mockResolvedValue(attempt);
      mockBootstrapThenScoped(tx);

      const result = await service.answer(session, { questionId: 'q1', selectedOptionIds: ['opt-a'] });

      expect(result).toEqual({ questionId: 'q1', selectedOptionIds: ['opt-a'], isMarkedForReview: false });
      expect(tx.answer.upsert).toHaveBeenCalledWith({
        where: { attemptId_questionId: { attemptId: 'attempt-1', questionId: 'q1' } },
        create: { attemptId: 'attempt-1', questionId: 'q1', selectedOptionIdsJson: JSON.stringify(['opt-a']), isMarkedForReview: false },
        update: { selectedOptionIdsJson: JSON.stringify(['opt-a']), isMarkedForReview: false, answeredAt: expect.any(Date) },
      });
    });

    it('throws BadRequestException for a question not part of this attempt', async () => {
      const tx = { attempt: { findUnique: jest.fn().mockResolvedValue(attempt) } };
      settlement.settleIfExpired.mockResolvedValue(attempt);
      mockBootstrapThenScoped(tx);

      await expect(service.answer(session, { questionId: 'not-in-attempt', selectedOptionIds: ['opt-a'] })).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when a single_mcq answer selects more than one option', async () => {
      const tx = {
        attempt: { findUnique: jest.fn().mockResolvedValue(attempt) },
        question: { findFirstOrThrow: jest.fn().mockResolvedValue(question) },
      };
      settlement.settleIfExpired.mockResolvedValue(attempt);
      mockBootstrapThenScoped(tx);

      await expect(service.answer(session, { questionId: 'q1', selectedOptionIds: ['opt-a', 'opt-b'] })).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when the attempt is not in_progress', async () => {
      const submittedAttempt = { ...attempt, status: 'submitted' };
      const tx = { attempt: { findUnique: jest.fn().mockResolvedValue(submittedAttempt) } };
      settlement.settleIfExpired.mockResolvedValue(submittedAttempt);
      mockBootstrapThenScoped(tx);

      await expect(service.answer(session, { questionId: 'q1', selectedOptionIds: ['opt-a'] })).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when no attempt has been started', async () => {
      const tx = { attempt: { findUnique: jest.fn().mockResolvedValue(null) } };
      mockBootstrapThenScoped(tx);

      await expect(service.answer(session, { questionId: 'q1', selectedOptionIds: ['opt-a'] })).rejects.toThrow(NotFoundException);
    });
  });

  describe('submit', () => {
    it('finalizes an in-progress attempt as submitted', async () => {
      const attempt = { id: 'attempt-1', status: 'in_progress', startedAt: new Date(), questionOrderJson: '[]' };
      const tx = { attempt: { findUnique: jest.fn().mockResolvedValue(attempt) } };
      settlement.settleIfExpired.mockResolvedValue(attempt);
      settlement.finalize.mockResolvedValue({ id: 'attempt-1', status: 'submitted' });
      mockBootstrapThenScoped(tx);

      const result = await service.submit(session);

      expect(result).toEqual({ status: 'submitted' });
      expect(settlement.finalize).toHaveBeenCalledWith(tx, exam, attempt, 'submitted');
    });

    it('is a no-op returning the existing status when the attempt is already submitted', async () => {
      const attempt = { id: 'attempt-1', status: 'submitted', startedAt: new Date(), questionOrderJson: '[]' };
      const tx = { attempt: { findUnique: jest.fn().mockResolvedValue(attempt) } };
      settlement.settleIfExpired.mockResolvedValue(attempt);
      mockBootstrapThenScoped(tx);

      const result = await service.submit(session);

      expect(result).toEqual({ status: 'submitted' });
      expect(settlement.finalize).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when no attempt has been started', async () => {
      const tx = { attempt: { findUnique: jest.fn().mockResolvedValue(null) } };
      mockBootstrapThenScoped(tx);

      await expect(service.submit(session)).rejects.toThrow(NotFoundException);
    });
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm run test:api -- attempt.service`
Expected: FAIL — `AttemptService` is not defined yet.

- [ ] **Step 4: Implement the service**

`apps/api/src/attempts/attempt.service.ts`:
```typescript
import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { AttemptSettlementService } from '../grading/attempt-settlement.service';
import { CandidateSession } from '../candidate-auth/current-candidate.decorator';
import { AnswerDto } from './dto/answer.dto';

interface AttemptQuestionOption {
  id: string;
  text: string;
}

interface AttemptQuestion {
  id: string;
  text: string;
  type: string;
  marks: number;
  options: AttemptQuestionOption[];
}

interface AttemptSection {
  title: string;
  questions: AttemptQuestion[];
}

interface AttemptAnswerSummary {
  questionId: string;
  selectedOptionIds: string[];
  isMarkedForReview: boolean;
}

interface AttemptPreviewResponse {
  exam: { title: string; instructions: string | null; durationMinutes: number };
}

interface AttemptStateResponse {
  status: string;
  remainingSeconds: number;
  sections: AttemptSection[];
  answers: AttemptAnswerSummary[];
}

export type AttemptCurrentResponse = AttemptPreviewResponse | AttemptStateResponse;

@Injectable()
export class AttemptService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly attemptSettlement: AttemptSettlementService,
  ) {}

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

      return {
        status: settled.status,
        remainingSeconds: this.attemptSettlement.remainingSeconds(exam, settled),
        sections,
        answers: answers.map((answer) => ({
          questionId: answer.questionId,
          selectedOptionIds: JSON.parse(answer.selectedOptionIdsJson),
          isMarkedForReview: answer.isMarkedForReview,
        })),
      };
    });
  }

  async start(session: CandidateSession): Promise<{ id: string; status: string }> {
    const { organizationId, exam, invitation } = await this.resolveContext(session.invitationId);

    return this.tenantPrisma.forTenant({ organizationId, isSuperAdmin: false }, async (tx) => {
      const existing = await tx.attempt.findUnique({ where: { invitationId: invitation.id } });
      if (existing) {
        return { id: existing.id, status: existing.status };
      }

      const sections = await tx.examSection.findMany({
        where: { examId: exam.id },
        orderBy: { orderIndex: 'asc' },
        include: { questions: { orderBy: { orderIndex: 'asc' } } },
      });
      const questionIds = sections.flatMap((section) => section.questions.map((link) => link.questionId));

      const attempt = await tx.attempt.create({
        data: {
          invitationId: invitation.id,
          candidateId: invitation.candidateId,
          examId: exam.id,
          questionOrderJson: JSON.stringify(questionIds),
        },
      });
      return { id: attempt.id, status: attempt.status };
    });
  }

  async answer(
    session: CandidateSession,
    dto: AnswerDto,
  ): Promise<{ questionId: string; selectedOptionIds: string[]; isMarkedForReview: boolean }> {
    const { organizationId, exam, invitation } = await this.resolveContext(session.invitationId);

    return this.tenantPrisma.forTenant({ organizationId, isSuperAdmin: false }, async (tx) => {
      const attempt = await tx.attempt.findUnique({ where: { invitationId: invitation.id } });
      if (!attempt) {
        throw new NotFoundException('No attempt has been started');
      }
      const settled = await this.attemptSettlement.settleIfExpired(tx, exam, attempt);
      if (settled.status !== 'in_progress') {
        throw new BadRequestException(`Cannot answer — attempt status is "${settled.status}"`);
      }

      const questionIds: string[] = JSON.parse(settled.questionOrderJson);
      if (!questionIds.includes(dto.questionId)) {
        throw new BadRequestException(`Question ${dto.questionId} is not part of this attempt`);
      }
      const question = await tx.question.findFirstOrThrow({ where: { id: dto.questionId }, include: { options: true } });
      this.validateSelection(question, dto.selectedOptionIds);

      const isMarkedForReview = dto.markedForReview ?? false;
      await tx.answer.upsert({
        where: { attemptId_questionId: { attemptId: settled.id, questionId: dto.questionId } },
        create: {
          attemptId: settled.id,
          questionId: dto.questionId,
          selectedOptionIdsJson: JSON.stringify(dto.selectedOptionIds),
          isMarkedForReview,
        },
        update: {
          selectedOptionIdsJson: JSON.stringify(dto.selectedOptionIds),
          isMarkedForReview,
          answeredAt: new Date(),
        },
      });

      return { questionId: dto.questionId, selectedOptionIds: dto.selectedOptionIds, isMarkedForReview };
    });
  }

  async submit(session: CandidateSession): Promise<{ status: string }> {
    const { organizationId, exam, invitation } = await this.resolveContext(session.invitationId);

    return this.tenantPrisma.forTenant({ organizationId, isSuperAdmin: false }, async (tx) => {
      const attempt = await tx.attempt.findUnique({ where: { invitationId: invitation.id } });
      if (!attempt) {
        throw new NotFoundException('No attempt has been started');
      }
      const settled = await this.attemptSettlement.settleIfExpired(tx, exam, attempt);
      if (settled.status !== 'in_progress') {
        return { status: settled.status };
      }

      const finalized = await this.attemptSettlement.finalize(tx, exam, settled, 'submitted');
      return { status: finalized.status };
    });
  }

  private async resolveContext(invitationId: string) {
    const invitation = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) =>
      tx.invitation.findUnique({ where: { id: invitationId }, include: { exam: true } }),
    );
    if (!invitation || !invitation.exam) {
      throw new UnauthorizedException('Invalid candidate session');
    }
    return { organizationId: invitation.exam.organizationId, exam: invitation.exam, invitation };
  }

  private validateSelection(question: { type: string; options: { id: string }[] }, selectedOptionIds: string[]): void {
    const validIds = new Set(question.options.map((option) => option.id));
    if (selectedOptionIds.length === 0 || !selectedOptionIds.every((id) => validIds.has(id))) {
      throw new BadRequestException('One or more selected options do not belong to this question');
    }
    if ((question.type === 'single_mcq' || question.type === 'true_false') && selectedOptionIds.length !== 1) {
      throw new BadRequestException(`Question type "${question.type}" requires exactly one selected option`);
    }
  }

  private async loadSections(tx: Prisma.TransactionClient, examId: string, questionIds: string[]): Promise<AttemptSection[]> {
    const sections = await tx.examSection.findMany({
      where: { examId },
      orderBy: { orderIndex: 'asc' },
      include: {
        questions: {
          orderBy: { orderIndex: 'asc' },
          include: { question: { include: { options: true } } },
        },
      },
    });
    return sections.map((section) => ({
      title: section.title,
      questions: section.questions
        .filter((link) => questionIds.includes(link.questionId))
        .map((link) => ({
          id: link.question.id,
          text: link.question.text,
          type: link.question.type,
          marks: link.question.marks,
          options: link.question.options.map((option) => ({ id: option.id, text: option.text })),
        })),
    }));
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test:api -- attempt.service`
Expected: `14 passed`.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/attempts/dto apps/api/src/attempts/attempt.service.ts apps/api/src/attempts/attempt.service.spec.ts
git commit -m "feat: add AttemptService (current/start/answer/submit with lazy auto-submit)"
```

---

### Task 7: AttemptController, module, and AppModule wiring

**Files:**
- Create: `apps/api/src/attempts/attempt.controller.ts`
- Create: `apps/api/src/attempts/attempt.module.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `AttemptService` (Task 6), `CandidateJwtAuthGuard`/`CurrentCandidate` (Task 5), `GradingModule` (Task 3).
- Produces: HTTP routes `GET /attempt/current`, `POST /attempt/start`, `POST /attempt/answer`, `POST /attempt/submit`, guarded by `CandidateJwtAuthGuard`.

- [ ] **Step 1: Write the controller**

`apps/api/src/attempts/attempt.controller.ts`:
```typescript
import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { CandidateJwtAuthGuard } from '../candidate-auth/candidate-jwt-auth.guard';
import { CurrentCandidate, CandidateSession } from '../candidate-auth/current-candidate.decorator';
import { AttemptService } from './attempt.service';
import { AnswerDto } from './dto/answer.dto';

@Controller('attempt')
@UseGuards(CandidateJwtAuthGuard)
export class AttemptController {
  constructor(private readonly attemptService: AttemptService) {}

  @Get('current')
  getCurrent(@CurrentCandidate() candidate: CandidateSession) {
    return this.attemptService.getCurrent(candidate);
  }

  @Post('start')
  start(@CurrentCandidate() candidate: CandidateSession) {
    return this.attemptService.start(candidate);
  }

  @Post('answer')
  answer(@CurrentCandidate() candidate: CandidateSession, @Body() dto: AnswerDto) {
    return this.attemptService.answer(candidate, dto);
  }

  @Post('submit')
  submit(@CurrentCandidate() candidate: CandidateSession) {
    return this.attemptService.submit(candidate);
  }
}
```

- [ ] **Step 2: Write the module**

`apps/api/src/attempts/attempt.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { GradingModule } from '../grading/grading.module';
import { AttemptController } from './attempt.controller';
import { AttemptService } from './attempt.service';

@Module({
  imports: [GradingModule],
  controllers: [AttemptController],
  providers: [AttemptService],
})
export class AttemptModule {}
```

- [ ] **Step 3: Register the module in AppModule**

In `apps/api/src/app.module.ts`, add the import and list entry:
```typescript
import { AttemptModule } from './attempts/attempt.module';
```
Add `AttemptModule` as the last entry in the `imports` array (after `CandidateAuthModule`).

- [ ] **Step 4: Run the full unit suite and build check**

Run: `npm run test:api` (from repo root) — expect all suites passing, no regressions.
Run: `npx nest build` (from `apps/api/`) — expect a clean build with `AttemptModule` wired in.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/attempts/attempt.controller.ts apps/api/src/attempts/attempt.module.ts apps/api/src/app.module.ts
git commit -m "feat: add AttemptController, wire into AppModule"
```

---

### Task 8: ExamsService.getResults

**Files:**
- Modify: `apps/api/src/exams/exams.service.ts`
- Modify: `apps/api/src/exams/exams.service.spec.ts`
- Modify: `apps/api/src/exams/exams.controller.ts`
- Modify: `apps/api/src/exams/exams.module.ts`

**Interfaces:**
- Consumes: `AttemptSettlementService.settleIfExpired` (Task 3, exact signature).
- Produces: `ExamsService.getResults(context, examId): Promise<ExamResultRow[]>`; `GET /exams/:id/results`, gated by the existing `exam:manage` permission.

- [ ] **Step 1: Update the existing spec's beforeEach for the new constructor dependency**

In `apps/api/src/exams/exams.service.spec.ts`, add the import and update `beforeEach`:
```typescript
import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ExamsService } from './exams.service';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { AttemptSettlementService } from '../grading/attempt-settlement.service';

describe('ExamsService', () => {
  let service: ExamsService;
  let tenantPrisma: { forTenant: jest.Mock };
  let attemptSettlement: { settleIfExpired: jest.Mock };
  const context = { organizationId: 'org-1', isSuperAdmin: false };

  beforeEach(async () => {
    tenantPrisma = { forTenant: jest.fn() };
    attemptSettlement = { settleIfExpired: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        ExamsService,
        { provide: TenantPrismaService, useValue: tenantPrisma },
        { provide: AttemptSettlementService, useValue: attemptSettlement },
      ],
    }).compile();
    service = moduleRef.get(ExamsService);
  });
```

- [ ] **Step 2: Write the failing tests for getResults**

Add these tests at the end of the `describe('ExamsService', ...)` block, just before the closing `});`:
```typescript
  describe('getResults', () => {
    it('throws NotFoundException when the exam does not exist', async () => {
      const tx = { exam: { findFirst: jest.fn().mockResolvedValue(null) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.getResults(context, 'missing-exam')).rejects.toThrow(NotFoundException);
    });

    it('returns one row per invitation, with nulls for candidates who have not started', async () => {
      const exam = { id: 'exam-1', passCriteriaPercent: 40 };
      const tx = {
        exam: { findFirst: jest.fn().mockResolvedValue(exam) },
        invitation: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'inv-1', candidateId: 'cand-1', status: 'invited', candidate: { name: 'Alice' }, attempt: null },
          ]),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.getResults(context, 'exam-1');

      expect(result).toEqual([
        {
          candidateId: 'cand-1', candidateName: 'Alice', invitationId: 'inv-1', attemptId: null,
          status: 'invited', score: null, maxScore: null, percentage: null, passFail: null, submittedAt: null,
        },
      ]);
    });

    it('returns the graded result for a submitted attempt', async () => {
      const exam = { id: 'exam-1', passCriteriaPercent: 40 };
      const submittedAt = new Date();
      const tx = {
        exam: { findFirst: jest.fn().mockResolvedValue(exam) },
        invitation: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'inv-1', candidateId: 'cand-1', status: 'invited', candidate: { name: 'Alice' },
              attempt: {
                id: 'attempt-1', status: 'submitted', submittedAt,
                result: { score: 8, maxScore: 10, percentage: 80, passFail: 'pass' },
              },
            },
          ]),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.getResults(context, 'exam-1');

      expect(result).toEqual([
        {
          candidateId: 'cand-1', candidateName: 'Alice', invitationId: 'inv-1', attemptId: 'attempt-1',
          status: 'submitted', score: 8, maxScore: 10, percentage: 80, passFail: 'pass', submittedAt,
        },
      ]);
      expect(attemptSettlement.settleIfExpired).not.toHaveBeenCalled();
    });

    it('settles an in-progress attempt past its deadline before reporting it', async () => {
      const exam = { id: 'exam-1', passCriteriaPercent: 40 };
      const inProgressAttempt = { id: 'attempt-1', status: 'in_progress', result: null };
      const settledAttempt = { id: 'attempt-1', status: 'auto_submitted', submittedAt: new Date() };
      const tx = {
        exam: { findFirst: jest.fn().mockResolvedValue(exam) },
        invitation: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'inv-1', candidateId: 'cand-1', status: 'invited', candidate: { name: 'Alice' }, attempt: inProgressAttempt },
          ]),
        },
        attempt: {
          findUnique: jest.fn().mockResolvedValue({ ...settledAttempt, result: { score: 4, maxScore: 10, percentage: 40, passFail: 'pass' } }),
        },
      };
      attemptSettlement.settleIfExpired.mockResolvedValue(settledAttempt);
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.getResults(context, 'exam-1');

      expect(attemptSettlement.settleIfExpired).toHaveBeenCalledWith(tx, exam, inProgressAttempt);
      expect(result[0].status).toBe('auto_submitted');
      expect(result[0].passFail).toBe('pass');
    });
  });
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm run test:api -- exams.service`
Expected: FAIL — `service.getResults` is not a function yet.

- [ ] **Step 4: Implement getResults()**

In `apps/api/src/exams/exams.service.ts`, add the import:
```typescript
import { AttemptSettlementService } from '../grading/attempt-settlement.service';
```

Change the constructor:
```typescript
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly attemptSettlement: AttemptSettlementService,
  ) {}
```

Add this interface near the top of the file (after `ExamFilters`):
```typescript
export interface ExamResultRow {
  candidateId: string;
  candidateName: string;
  invitationId: string;
  attemptId: string | null;
  status: string;
  score: number | null;
  maxScore: number | null;
  percentage: number | null;
  passFail: string | null;
  submittedAt: Date | null;
}
```

Add the `getResults` method, placed after `replaceSectionQuestions`:
```typescript
  async getResults(context: TenantContext, examId: string): Promise<ExamResultRow[]> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const exam = await tx.exam.findFirst({ where: { id: examId, organizationId: context.organizationId as string } });
      if (!exam) {
        throw new NotFoundException(`Exam ${examId} not found`);
      }

      const invitations = await tx.invitation.findMany({
        where: { examId },
        include: { candidate: true, attempt: { include: { result: true } } },
        orderBy: [{ invitedAt: 'desc' }, { id: 'desc' }],
      });

      const rows: ExamResultRow[] = [];
      for (const invitation of invitations) {
        let attempt = invitation.attempt;
        if (attempt && attempt.status === 'in_progress') {
          await this.attemptSettlement.settleIfExpired(tx, exam, attempt);
          attempt = await tx.attempt.findUnique({ where: { id: attempt.id }, include: { result: true } });
        }
        rows.push({
          candidateId: invitation.candidateId,
          candidateName: invitation.candidate.name,
          invitationId: invitation.id,
          attemptId: attempt?.id ?? null,
          status: attempt?.status ?? invitation.status,
          score: attempt?.result?.score ?? null,
          maxScore: attempt?.result?.maxScore ?? null,
          percentage: attempt?.result?.percentage ?? null,
          passFail: attempt?.result?.passFail ?? null,
          submittedAt: attempt?.submittedAt ?? null,
        });
      }
      return rows;
    });
  }
```

- [ ] **Step 5: Add the controller route**

In `apps/api/src/exams/exams.controller.ts`, add this route after `replaceSectionQuestions`:
```typescript
  @Get(':id/results')
  @RequirePermissions('exam:manage')
  getResults(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.examsService.getResults(tenant, id);
  }
```

- [ ] **Step 6: Update ExamsModule to import GradingModule**

`apps/api/src/exams/exams.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { GradingModule } from '../grading/grading.module';
import { ExamsController } from './exams.controller';
import { ExamsService } from './exams.service';

@Module({
  imports: [GradingModule],
  controllers: [ExamsController],
  providers: [ExamsService],
  exports: [ExamsService],
})
export class ExamsModule {}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npm run test:api -- exams.service`
Expected: `25 passed`.

Run: `npm run test:api` (from repo root)
Expected: all suites passing, no regressions.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/exams
git commit -m "feat: add ExamsService.getResults (basic per-candidate results view)"
```

---

### Task 9: End-to-end test

**Files:**
- Create: `apps/api/test/exam-taking-runtime.e2e-spec.ts`

**Interfaces:**
- Consumes: the full `CandidateAuthController`/`AttemptController`/`ExamsController.getResults` HTTP surface (Tasks 5/7/8), the existing `ExamsController`/`QuestionsController`/`CandidatesController`/`InvitationsController` HTTP surface (Phase 1a-1c), the real `AuthService` staff login flow (Phase 0).

- [ ] **Step 1: Write the e2e spec**

`apps/api/test/exam-taking-runtime.e2e-spec.ts`:
```typescript
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantPrismaService } from '../src/prisma/tenant-prisma.service';
import { EmailService } from '../src/email/email.service';

describe('Exam-Taking Runtime HTTP flow', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let planId: string;
  let orgId: string;
  let recruiterAccessToken: string;
  let orgAdminAccessToken: string;
  let examId: string;
  let singleMcqId: string;
  let multiMcqId: string;
  let trueFalseId: string;
  let singleMcqOptions: { id: string; text: string }[];
  let multiMcqOptions: { id: string; text: string }[];
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
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);

    const plan = await prisma.plan.create({
      data: { name: `ci-attempt-plan-${randomUUID()}`, candidateLimit: 10, aiCreditLimit: 1, proctoringMinutesLimit: 1 },
    });
    planId = plan.id;

    const org = await prisma.organization.create({ data: { name: 'CI Attempt Org', slug: `ci-attempt-org-${randomUUID()}`, planId } });
    orgId = org.id;

    const recruiterHash = await argon2.hash('RecruiterPassw0rd!');
    const orgAdminHash = await argon2.hash('OrgAdminPassw0rd!');
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) =>
      Promise.all([
        tx.user.create({ data: { organizationId: orgId, email: 'recruiter@ci-attempt.test', passwordHash: recruiterHash, role: 'recruiter' } }),
        tx.user.create({ data: { organizationId: orgId, email: 'orgadmin@ci-attempt.test', passwordHash: orgAdminHash, role: 'org_admin' } }),
      ]),
    );

    recruiterAccessToken = (
      await request(app.getHttpServer())
        .post('/api/v1/auth/staff/login')
        .send({ organizationSlug: org.slug, email: 'recruiter@ci-attempt.test', password: 'RecruiterPassw0rd!' })
        .expect(200)
    ).body.accessToken;

    orgAdminAccessToken = (
      await request(app.getHttpServer())
        .post('/api/v1/auth/staff/login')
        .send({ organizationSlug: org.slug, email: 'orgadmin@ci-attempt.test', password: 'OrgAdminPassw0rd!' })
        .expect(200)
    ).body.accessToken;

    const examResponse = await request(app.getHttpServer())
      .post('/api/v1/exams')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ title: 'Full Stack Round' })
      .expect(201);
    examId = examResponse.body.id;

    const sectionResponse = await request(app.getHttpServer())
      .post(`/api/v1/exams/${examId}/sections`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ title: 'Section One' })
      .expect(201);
    const sectionId = sectionResponse.body.id;

    const singleMcq = await request(app.getHttpServer())
      .post('/api/v1/questions')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({
        type: 'single_mcq', text: 'What is 2+2?', difficulty: 'easy', marks: 5,
        options: [{ text: '4', isCorrect: true }, { text: '5', isCorrect: false }],
      })
      .expect(201);
    singleMcqId = singleMcq.body.id;
    singleMcqOptions = singleMcq.body.options;

    const multiMcq = await request(app.getHttpServer())
      .post('/api/v1/questions')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({
        type: 'multi_mcq', text: 'Which are prime numbers?', difficulty: 'medium', marks: 4,
        options: [
          { text: '2', isCorrect: true }, { text: '3', isCorrect: true },
          { text: '4', isCorrect: false }, { text: '9', isCorrect: false },
        ],
      })
      .expect(201);
    multiMcqId = multiMcq.body.id;
    multiMcqOptions = multiMcq.body.options;

    const trueFalse = await request(app.getHttpServer())
      .post('/api/v1/questions')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({
        type: 'true_false', text: 'TypeScript is a superset of JavaScript.', difficulty: 'easy', marks: 1,
        options: [{ text: 'True', isCorrect: true }, { text: 'False', isCorrect: false }],
      })
      .expect(201);
    trueFalseId = trueFalse.body.id;

    await request(app.getHttpServer())
      .put(`/api/v1/exams/${examId}/sections/${sectionId}/questions`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ questionIds: [singleMcqId, multiMcqId, trueFalseId] })
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

  async function inviteAndRedeem(email: string, name: string): Promise<{ candidateId: string; token: string }> {
    const candidateResponse = await request(app.getHttpServer())
      .post('/api/v1/candidates')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ email, name })
      .expect(201);
    const candidateId = candidateResponse.body.id;

    const inviteResponse = await request(app.getHttpServer())
      .post(`/api/v1/exams/${examId}/invitations`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ candidateIds: [candidateId] })
      .expect(201);

    return { candidateId, token: inviteResponse.body.created[0].token };
  }

  it('runs the full candidate exam-taking flow and reports a graded result to the recruiter', async () => {
    const { token } = await inviteAndRedeem('alice@ci-attempt.test', 'Alice');

    const redeemResponse = await request(app.getHttpServer()).post('/api/v1/candidate-auth/redeem').send({ token }).expect(200);
    const candidateAccessToken = redeemResponse.body.accessToken;

    const previewResponse = await request(app.getHttpServer())
      .get('/api/v1/attempt/current')
      .set('Authorization', `Bearer ${candidateAccessToken}`)
      .expect(200);
    expect(previewResponse.body.exam.title).toBe('Full Stack Round');
    expect(previewResponse.body.sections).toBeUndefined();

    const startResponse = await request(app.getHttpServer())
      .post('/api/v1/attempt/start')
      .set('Authorization', `Bearer ${candidateAccessToken}`)
      .expect(201);
    expect(startResponse.body.status).toBe('in_progress');

    const stateResponse = await request(app.getHttpServer())
      .get('/api/v1/attempt/current')
      .set('Authorization', `Bearer ${candidateAccessToken}`)
      .expect(200);
    expect(stateResponse.body.sections).toHaveLength(1);
    const allQuestions = stateResponse.body.sections[0].questions;
    allQuestions.forEach((question: Record<string, unknown>) => {
      (question.options as Record<string, unknown>[]).forEach((option) => expect(option).not.toHaveProperty('isCorrect'));
    });

    const correctSingleOptionId = singleMcqOptions.find((option) => option.text === '4')!.id;
    await request(app.getHttpServer())
      .post('/api/v1/attempt/answer')
      .set('Authorization', `Bearer ${candidateAccessToken}`)
      .send({ questionId: singleMcqId, selectedOptionIds: [correctSingleOptionId] })
      .expect(201);

    const partialMultiOptionId = multiMcqOptions.find((option) => option.text === '2')!.id;
    await request(app.getHttpServer())
      .post('/api/v1/attempt/answer')
      .set('Authorization', `Bearer ${candidateAccessToken}`)
      .send({ questionId: multiMcqId, selectedOptionIds: [partialMultiOptionId] })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/attempt/answer')
      .set('Authorization', `Bearer ${candidateAccessToken}`)
      .send({ questionId: 'not-a-real-question-id', selectedOptionIds: [correctSingleOptionId] })
      .expect(400);

    const submitResponse = await request(app.getHttpServer())
      .post('/api/v1/attempt/submit')
      .set('Authorization', `Bearer ${candidateAccessToken}`)
      .expect(201);
    expect(submitResponse.body).toEqual({ status: 'submitted' });
    expect(submitResponse.body.score).toBeUndefined();

    const duplicateSubmitResponse = await request(app.getHttpServer())
      .post('/api/v1/attempt/submit')
      .set('Authorization', `Bearer ${candidateAccessToken}`)
      .expect(201);
    expect(duplicateSubmitResponse.body).toEqual({ status: 'submitted' });

    await request(app.getHttpServer())
      .post('/api/v1/attempt/answer')
      .set('Authorization', `Bearer ${candidateAccessToken}`)
      .send({ questionId: trueFalseId, selectedOptionIds: [correctSingleOptionId] })
      .expect(400);

    const resultsResponse = await request(app.getHttpServer())
      .get(`/api/v1/exams/${examId}/results`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(200);
    const aliceResult = resultsResponse.body.find((row: { candidateName: string }) => row.candidateName === 'Alice');
    expect(aliceResult.status).toBe('submitted');
    expect(aliceResult.score).toBe(5);
    expect(aliceResult.maxScore).toBe(10);
    expect(aliceResult.percentage).toBe(50);
    expect(aliceResult.passFail).toBe('pass');

    await request(app.getHttpServer())
      .get(`/api/v1/exams/${examId}/results`)
      .set('Authorization', `Bearer ${orgAdminAccessToken}`)
      .expect(403);
  });

  it('rejects a candidate from accessing another candidate\'s attempt', async () => {
    const bobTokens = await inviteAndRedeem('bob@ci-attempt.test', 'Bob');
    const carolTokens = await inviteAndRedeem('carol@ci-attempt.test', 'Carol');

    const bobAccess = (await request(app.getHttpServer()).post('/api/v1/candidate-auth/redeem').send({ token: bobTokens.token }).expect(200)).body.accessToken;
    const carolAccess = (await request(app.getHttpServer()).post('/api/v1/candidate-auth/redeem').send({ token: carolTokens.token }).expect(200)).body.accessToken;

    await request(app.getHttpServer()).post('/api/v1/attempt/start').set('Authorization', `Bearer ${bobAccess}`).expect(201);

    const carolState = await request(app.getHttpServer())
      .get('/api/v1/attempt/current')
      .set('Authorization', `Bearer ${carolAccess}`)
      .expect(200);
    expect(carolState.body.sections).toBeUndefined();
  });

  it('auto-submits and grades an attempt that is touched again after its duration has elapsed', async () => {
    const { token } = await inviteAndRedeem('dave@ci-attempt.test', 'Dave');
    const daveAccess = (await request(app.getHttpServer()).post('/api/v1/candidate-auth/redeem').send({ token }).expect(200)).body.accessToken;

    const startResponse = await request(app.getHttpServer())
      .post('/api/v1/attempt/start')
      .set('Authorization', `Bearer ${daveAccess}`)
      .expect(201);

    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) =>
      tx.attempt.update({ where: { id: startResponse.body.id }, data: { startedAt: new Date(Date.now() - 2 * 60 * 60_000) } }),
    );

    const currentResponse = await request(app.getHttpServer())
      .get('/api/v1/attempt/current')
      .set('Authorization', `Bearer ${daveAccess}`)
      .expect(200);
    expect(currentResponse.body.status).toBe('auto_submitted');
    expect(currentResponse.body.remainingSeconds).toBe(0);

    const resultsResponse = await request(app.getHttpServer())
      .get(`/api/v1/exams/${examId}/results`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(200);
    const daveResult = resultsResponse.body.find((row: { candidateName: string }) => row.candidateName === 'Dave');
    expect(daveResult.status).toBe('auto_submitted');
    expect(daveResult.score).toBe(0);
  });

  it('rejects redeeming a revoked or expired invitation with a specific error, not a generic 404', async () => {
    const { candidateId } = await inviteAndRedeem('erin@ci-attempt.test', 'Erin');
    const listResponse = await request(app.getHttpServer())
      .get(`/api/v1/exams/${examId}/invitations`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(200);
    const erinInvitation = listResponse.body.find((inv: { candidateId: string }) => inv.candidateId === candidateId);

    await request(app.getHttpServer())
      .post(`/api/v1/invitations/${erinInvitation.id}/revoke`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/candidate-auth/redeem')
      .send({ token: 'this-token-does-not-exist' })
      .expect(404);
  });
});
```

- [ ] **Step 2: Run the full e2e suite**

Run: `npm run test:api:e2e` (from repo root)
Expected: all suites pass, including all 4 tests in `exam-taking-runtime.e2e-spec.ts`, with no regressions to `tenant-isolation.e2e-spec.ts`, `health.e2e-spec.ts`, `auth-flow.e2e-spec.ts`, `question-bank.e2e-spec.ts`, `exam-builder.e2e-spec.ts`, or `candidates-invitations.e2e-spec.ts`.

- [ ] **Step 3: Run the full unit suite one more time**

Run: `npm run test:api` (from repo root)
Expected: all suites still passing.

- [ ] **Step 4: Commit**

```bash
git add apps/api/test/exam-taking-runtime.e2e-spec.ts
git commit -m "test: add full exam-taking runtime e2e coverage - redeem, start/answer/submit, grading, auto-submit, results, RBAC"
```

---

## Self-Review Notes

- **Spec coverage:** candidate auth redeem/refresh/logout with separate JWT secrets (Tasks 4-5), attempt current/start/answer/submit with lazy auto-submit-on-access (Task 6-7), grading (all-or-nothing multi-mcq, flat marks, no negative marking) shared between the candidate runtime and the recruiter results view via `AttemptSettlementService` (Tasks 2-3, 8), `Exam.durationMinutes`/`passCriteriaPercent` schema + DTO plumbing (Task 1), basic results view (Task 8) — all covered. Deferred items (Email OTP, WebSocket timer, randomization, negative marking, section locks, anti-cheat, rank/analytics, scheduled sweep, frontend) are explicitly out of scope per the design spec and not included here.
- **Placeholder scan:** no TBD/TODO markers; every step has complete, runnable code.
- **Type consistency:** `AttemptSettlementService.settleIfExpired`/`.finalize`/`.remainingSeconds` (Task 3) match every call site in `AttemptService` (Task 6) and `ExamsService.getResults` (Task 8) exactly. `gradeAnswer`/`computeResult` (Task 2) match `AttemptSettlementService`'s usage (Task 3). `CandidateSession` (Task 5, `{ invitationId: string }`) matches `AttemptService`'s and `AttemptController`'s usage (Tasks 6-7). `CandidateAuthService`'s method names (`redeem`, `refresh`, `logout`) match `CandidateAuthController`'s calls (Task 5) exactly.
- **Cross-task dependency flagged explicitly:** Task 8 adds a second constructor dependency (`AttemptSettlementService`) to the existing `ExamsService` from Phase 1b/1c — the existing `exams.service.spec.ts`'s `beforeEach` is updated in that task (Step 1) before any new tests are added, so the whole suite keeps compiling and passing throughout.
