# Phase 1b — Exam Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a Recruiter a tested API to create exams, organize them into sections, and assign specific questions from their organization's question bank into those sections in order, with the same database-level tenant isolation established in Phase 0 and extended in Phase 1a.

**Architecture:** Three new Prisma models (`Exam`, `ExamSection`, `ExamSectionQuestion`) added to the existing schema. Only `Exam` gets a Row-Level Security policy extension (it has `organization_id`); `ExamSection` and `ExamSectionQuestion` have none of their own — they are protected transitively, which means every service method touching them **must** verify the parent `Exam` belongs to the caller's organization first, in the same `forTenant` call, before touching anything downstream. An `ExamsModule` (service + controller + DTOs) follows the exact same pattern as Phase 1a's `QuestionsModule`.

**Tech Stack:** Same as Phase 0/1a — NestJS, Prisma (`sqlserver` provider), SQL Server, Jest/Supertest. No new dependencies.

## Global Constraints

- All primary keys and organization-scoping foreign keys are `@db.UniqueIdentifier` in Prisma — never a plain `String` with no native-type annotation.
- **Every service method that queries `exams` MUST go through `TenantPrismaService.forTenant()`** (`apps/api/src/prisma/tenant-prisma.service.ts`), never the raw `PrismaService` directly. If a single unit of work needs to check a row exists AND then mutate it, both steps must be inside the SAME `forTenant` callback.
- **`exam_sections` and `exam_section_questions` have no `organization_id` column and no Row-Level Security policy of their own.** RLS only protects `exams`. This means the application code is the *only* thing preventing a cross-tenant `sectionId` (or a cross-tenant question attachment) from being reached — there is no database-level backstop for these two tables the way there is for `exams`/`questions`/`users`. Every service method that touches `ExamSection` or `ExamSectionQuestion` MUST first verify the parent `Exam` belongs to the caller's organization (`tx.exam.findFirst({ where: { id: examId, organizationId } })`), inside the same `forTenant` call, before running any query scoped only by `sectionId`. Skipping this check is a real cross-tenant data leak, not a theoretical one — there is no RLS predicate to catch the mistake.
- Migrations are applied with `npx prisma migrate deploy`, **never** `npx prisma migrate dev` (the `examapp_dev` database login lacks `CREATE DATABASE` permission needed for `migrate dev`'s shadow database). `migrate dev --create-only` is safe to use for *generating* migration SQL; the actual apply step must be `migrate deploy`, followed by an explicit `npx prisma generate`.
- Every `created_at` column default must use `DEFAULT GETUTCDATE()`, never `DEFAULT CURRENT_TIMESTAMP` (which is OS-local time in SQL Server, not UTC) — this is a real, previously-shipped bug (see `memory.md` Section 4), not a style preference.
- **Never edit an already-applied migration file's SQL text in place.** If a mistake in an already-applied migration needs fixing, write a NEW migration that corrects it. Editing history breaks checksum integrity for any environment that already ran the original — this happened twice in Phase 1a and had to be reverted.
- Required (non-optional) `class-validator` DTO properties must use a definite-assignment assertion (`title!: string;`), not a bare `title: string;` — the root `tsconfig.base.json`'s `strict: true` enables `strictPropertyInitialization`.
- No hard `DELETE` on `exams` — only soft-delete via `status: 'archived'`. `ExamSection` IS hard-deleted (see the design spec's Section 2 for why this asymmetry is deliberate, not an oversight).
- No random-pool question selection, no exam-level settings tied to later sub-phases (`duration_minutes`, `pass_criteria_percent`, `schedule_start`/`end`, `proctoring_level`), no publish/draft lifecycle, no clone/preview, no frontend UI — see the design spec's "Open Items" section for what's deferred and why.
- Full spec: `docs/superpowers/specs/2026-07-07-phase-1b-exam-builder-design.md`. Full prior context: `memory.md` at repo root, `docs/superpowers/plans/2026-07-07-phase-1a-question-bank.md`.

---

## File Structure

```
apps/api/
  prisma/
    schema.prisma                                       # Modify: add Exam, ExamSection, ExamSectionQuestion; add Question.examLinks back-relation
    migrations/
      20260707140000_exam_builder_schema/
        migration.sql                                    # Create: exams, exam_sections, exam_section_questions tables
      20260707140001_exam_builder_rls/
        migration.sql                                    # Create: extend TenantAccessPolicy to exams
    seed.ts                                               # Modify: add exam:manage permission + grant to recruiter
  src/
    exams/
      exam-section-question-validation.ts                # Create: pure validation function for the bulk-replace diff rules
      exam-section-question-validation.spec.ts            # Create: unit tests
      exams.service.ts                                    # Create: CRUD + section + bulk-replace via TenantPrismaService
      exams.service.spec.ts                               # Create: unit tests, mocked TenantPrismaService
      exams.controller.ts                                 # Create: HTTP routes, RBAC-guarded
      exams.module.ts                                     # Create: wires service+controller
      dto/
        create-exam.dto.ts                                # Create
        update-exam.dto.ts                                # Create
        create-exam-section.dto.ts                        # Create
        update-exam-section.dto.ts                        # Create
        replace-section-questions.dto.ts                  # Create
    app.module.ts                                         # Modify: register ExamsModule
  test/
    exam-builder.e2e-spec.ts                              # Create in Task 2 (isolation only), completed in Task 6
```

---

### Task 1: Prisma schema and migration for Exam/ExamSection/ExamSectionQuestion

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260707140000_exam_builder_schema/migration.sql`

**Interfaces:**
- Produces: Prisma models `Exam` (fields: `id`, `organizationId`, `title`, `instructions`, `status`, `createdBy`, `createdAt`, relation `sections`), `ExamSection` (fields: `id`, `examId`, `title`, `orderIndex`, relation `exam`, relation `questions`), `ExamSectionQuestion` (fields: `sectionId`, `questionId`, `orderIndex`, relation `section`, relation `question`) — every later task in this plan relies on these exact field names.

- [ ] **Step 1: Add the models to schema.prisma**

Add to `apps/api/prisma/schema.prisma` (after the existing `QuestionOption` model):

```prisma
model Exam {
  id             String        @id @default(uuid()) @db.UniqueIdentifier
  organizationId String        @map("organization_id") @db.UniqueIdentifier
  title          String
  instructions   String?       @db.NVarChar(Max)
  status         String        @default("active")
  createdBy      String        @map("created_by") @db.UniqueIdentifier
  createdAt      DateTime      @default(now()) @map("created_at")
  sections       ExamSection[]

  @@index([organizationId, status])
  @@map("exams")
}

model ExamSection {
  id         String                @id @default(uuid()) @db.UniqueIdentifier
  examId     String                @map("exam_id") @db.UniqueIdentifier
  title      String
  orderIndex Int                   @map("order_index")
  exam       Exam                  @relation(fields: [examId], references: [id], onDelete: Cascade)
  questions  ExamSectionQuestion[]

  @@index([examId])
  @@map("exam_sections")
}

model ExamSectionQuestion {
  sectionId  String      @map("section_id") @db.UniqueIdentifier
  questionId String      @map("question_id") @db.UniqueIdentifier
  orderIndex Int         @map("order_index")
  section    ExamSection @relation(fields: [sectionId], references: [id], onDelete: Cascade)
  question   Question    @relation(fields: [questionId], references: [id])

  @@id([sectionId, questionId])
  @@map("exam_section_questions")
}
```

Then add one field to the existing `Question` model (a required back-relation pairing for the new FK — locate the `options QuestionOption[]` line inside `model Question { ... }` and add a line after it):

```prisma
  examLinks      ExamSectionQuestion[]
```

Note: `createdBy` on `Exam` is deliberately a plain `UniqueIdentifier` column, not a `@relation` to `User` — matching the existing `Question.createdBy` pattern.

- [ ] **Step 2: Generate the migration**

Run (from `apps/api/`): `npx prisma migrate dev --create-only --name exam_builder_schema`
Expected: this will very likely fail with a P3014 shadow-database permission error (the `examapp_dev` login lacks `CREATE DATABASE`), exactly as it did in Phase 1a's Task 1. If it fails this way, hand-write the migration SQL directly (Step 3 below) — this is the documented, expected fallback, not an error to debug. If it unexpectedly succeeds, use the generated SQL instead of Step 3's, but verify it matches the same table/column/constraint shape.

- [ ] **Step 3: Write the migration SQL by hand (fallback if Step 2 hit P3014)**

`apps/api/prisma/migrations/20260707140000_exam_builder_schema/migration.sql`:
```sql
-- CreateTable
CREATE TABLE [dbo].[exams] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organization_id] UNIQUEIDENTIFIER NOT NULL,
    [title] NVARCHAR(1000) NOT NULL,
    [instructions] NVARCHAR(MAX),
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [exams_status_df] DEFAULT 'active',
    [created_by] UNIQUEIDENTIFIER NOT NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [exams_created_at_df] DEFAULT GETUTCDATE(),
    CONSTRAINT [exams_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[exam_sections] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [exam_id] UNIQUEIDENTIFIER NOT NULL,
    [title] NVARCHAR(1000) NOT NULL,
    [order_index] INT NOT NULL,
    CONSTRAINT [exam_sections_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[exam_section_questions] (
    [section_id] UNIQUEIDENTIFIER NOT NULL,
    [question_id] UNIQUEIDENTIFIER NOT NULL,
    [order_index] INT NOT NULL,
    CONSTRAINT [exam_section_questions_pkey] PRIMARY KEY CLUSTERED ([section_id],[question_id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [exams_organization_id_status_idx] ON [dbo].[exams]([organization_id], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [exam_sections_exam_id_idx] ON [dbo].[exam_sections]([exam_id]);

-- AddForeignKey
ALTER TABLE [dbo].[exam_sections] ADD CONSTRAINT [exam_sections_exam_id_fkey] FOREIGN KEY ([exam_id]) REFERENCES [dbo].[exams]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[exam_section_questions] ADD CONSTRAINT [exam_section_questions_section_id_fkey] FOREIGN KEY ([section_id]) REFERENCES [dbo].[exam_sections]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[exam_section_questions] ADD CONSTRAINT [exam_section_questions_question_id_fkey] FOREIGN KEY ([question_id]) REFERENCES [dbo].[questions]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;
```

Note: the `exam_section_questions -> questions` FK uses `ON DELETE NO ACTION` deliberately — `questions` are never hard-deleted (Phase 1a's rule), so this path is never exercised, but Prisma/SQL Server require an explicit action, and `NO ACTION` here avoids a multiple-cascade-path conflict with the separate `exam_sections -> exams` cascade chain.

- [ ] **Step 4: Apply the migration**

Run: `npx prisma migrate deploy` (never `migrate dev` for applying), then `npx prisma generate`.
Expected: migration applies cleanly; `@prisma/client` types now include `Exam`, `ExamSection`, `ExamSectionQuestion`, and `Question.examLinks`.

- [ ] **Step 5: Verify against the real database**

Run: `sqlcmd -S localhost,1433 -U examapp_dev -P 'DevPassw0rd!2026' -d examapp -Q "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME IN ('exams','exam_sections','exam_section_questions')" -C`
Expected: all three table names returned.

Run: `sqlcmd -S localhost,1433 -U examapp_dev -P 'DevPassw0rd!2026' -d examapp -Q "SELECT dc.name, dc.definition FROM sys.default_constraints dc JOIN sys.columns c ON dc.parent_object_id=c.object_id AND dc.parent_column_id=c.column_id WHERE c.name='created_at' AND OBJECT_NAME(dc.parent_object_id)='exams'" -C`
Expected: one row, `definition` = `(getutcdate())` — confirming the `GETUTCDATE()` constraint (not `CURRENT_TIMESTAMP`) actually landed.

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat: add Exam, ExamSection, and ExamSectionQuestion schema for Phase 1b exam builder"
```

---

### Task 2: Row-Level Security on the exams table

**Files:**
- Create: `apps/api/prisma/migrations/20260707140001_exam_builder_rls/migration.sql`
- Create: `apps/api/test/exam-builder.e2e-spec.ts` (isolation-only portion; completed in Task 6)

**Interfaces:**
- Consumes: the existing `dbo.fn_tenant_access_predicate(@OrgId UNIQUEIDENTIFIER)` function and `dbo.TenantAccessPolicy` security policy — this task extends that same policy to a new table, it does not create a new function or policy.
- Produces: `exams` is now RLS-protected — a query with no tenant session context set returns zero rows; a query scoped to the wrong organization never sees another organization's exams.

- [ ] **Step 1: Write the migration**

`apps/api/prisma/migrations/20260707140001_exam_builder_rls/migration.sql`:
```sql
-- Extend the tenant isolation security policy created in Phase 0
-- (20260707110005_tenant_rls_policy) to also cover dbo.exams. Reuses
-- the existing dbo.fn_tenant_access_predicate function unchanged; this
-- adds predicates to the existing policy, it does not create a new
-- policy or function. The policy is already WITH (STATE = ON), so no
-- state change is needed here.
ALTER SECURITY POLICY dbo.TenantAccessPolicy
ADD FILTER PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.exams,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.exams AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.exams AFTER UPDATE;
```

Since Prisma can't diff a raw `ALTER SECURITY POLICY` statement from schema changes, create this migration folder and file by hand — do not run `prisma migrate dev --create-only` for this one.

Note: `exam_sections` and `exam_section_questions` deliberately get NO predicates here — see this plan's Global Constraints for why, and why every service method touching them must compensate with an explicit application-level check.

- [ ] **Step 2: Apply the migration**

Run: `npx prisma migrate deploy` (from `apps/api/`)
Expected: applies cleanly. Run `npx prisma migrate status` to confirm — all migrations applied, no drift.

- [ ] **Step 3: Write a failing isolation test to verify the policy works**

`apps/api/test/exam-builder.e2e-spec.ts` (this file is completed fully in Task 6 — for this step, write ONLY the isolation-proving portion below and run it standalone):

```typescript
import { Test } from '@nestjs/testing';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantPrismaService } from '../src/prisma/tenant-prisma.service';
import { PrismaModule } from '../src/prisma/prisma.module';
import { randomUUID } from 'crypto';

describe('Exam Builder Row-Level Security', () => {
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let planId: string;
  let orgAId: string;
  let orgBId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [PrismaModule] }).compile();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);

    const plan = await prisma.plan.create({
      data: { name: `eb-rls-plan-${randomUUID()}`, candidateLimit: 10, aiCreditLimit: 1, proctoringMinutesLimit: 1 },
    });
    planId = plan.id;

    const orgA = await prisma.organization.create({ data: { name: 'EB Org A', slug: `eb-org-a-${randomUUID()}`, planId } });
    const orgB = await prisma.organization.create({ data: { name: 'EB Org B', slug: `eb-org-b-${randomUUID()}`, planId } });
    orgAId = orgA.id;
    orgBId = orgB.id;

    await tenantPrisma.forTenant({ organizationId: orgAId, isSuperAdmin: false }, (tx) =>
      tx.exam.create({ data: { organizationId: orgAId, title: 'Org A Exam', createdBy: randomUUID() } }),
    );
  });

  afterAll(async () => {
    await tenantPrisma.forTenant({ organizationId: orgAId, isSuperAdmin: false }, (tx) =>
      tx.exam.deleteMany({ where: { organizationId: orgAId } }),
    );
    await prisma.organization.deleteMany({ where: { id: { in: [orgAId, orgBId] } } });
    await prisma.plan.delete({ where: { id: planId } });
    await prisma.$disconnect();
  });

  it('never returns another tenant\'s exams', async () => {
    const orgBExams = await tenantPrisma.forTenant({ organizationId: orgBId, isSuperAdmin: false }, (tx) =>
      tx.exam.findMany(),
    );
    expect(orgBExams).toHaveLength(0);
  });

  it('returns zero rows when no tenant context has been set', async () => {
    const rows = await prisma.exam.findMany({ where: { organizationId: orgAId } });
    expect(rows).toHaveLength(0);
  });
});
```

- [ ] **Step 4: Run it to confirm the RLS policy actually works**

Run: `npm run test:api:e2e -- exam-builder`
Expected: `2 passed`. If either fails, the policy did not apply correctly — re-check Step 1 before continuing.

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/migrations apps/api/test/exam-builder.e2e-spec.ts
git commit -m "feat: extend Row-Level Security policy to the exams table"
```

---

### Task 3: Section-question replace validation logic

**Files:**
- Create: `apps/api/src/exams/exam-section-question-validation.ts`
- Create: `apps/api/src/exams/exam-section-question-validation.spec.ts`

**Interfaces:**
- Produces: `validateSectionQuestionsReplace(newQuestionIds: string[], currentlyLinkedQuestionIds: string[], questionStatuses: QuestionStatusLookup[]): void` — throws `BadRequestException` on any invalid combination; returns nothing on success. `QuestionStatusLookup` type, exported, is consumed by Task 4's `ExamsService`.

- [ ] **Step 1: Write the failing tests**

`apps/api/src/exams/exam-section-question-validation.spec.ts`:
```typescript
import { BadRequestException } from '@nestjs/common';
import { validateSectionQuestionsReplace } from './exam-section-question-validation';

describe('validateSectionQuestionsReplace', () => {
  it('accepts a fresh list of active questions with no current links', () => {
    expect(() =>
      validateSectionQuestionsReplace(
        ['q1', 'q2'],
        [],
        [
          { id: 'q1', status: 'active' },
          { id: 'q2', status: 'active' },
        ],
      ),
    ).not.toThrow();
  });

  it('accepts an empty list, detaching every question from the section', () => {
    expect(() => validateSectionQuestionsReplace([], ['q1', 'q2'], [])).not.toThrow();
  });

  it('accepts keeping an already-linked question that has since been archived', () => {
    expect(() =>
      validateSectionQuestionsReplace(['q1'], ['q1'], [{ id: 'q1', status: 'archived' }]),
    ).not.toThrow();
  });

  it('accepts a mix of a retained archived question and a newly-added active one', () => {
    expect(() =>
      validateSectionQuestionsReplace(
        ['q1', 'q2'],
        ['q1'],
        [
          { id: 'q1', status: 'archived' },
          { id: 'q2', status: 'active' },
        ],
      ),
    ).not.toThrow();
  });

  it('rejects a newly-added archived question', () => {
    expect(() =>
      validateSectionQuestionsReplace(['q1'], [], [{ id: 'q1', status: 'archived' }]),
    ).toThrow(BadRequestException);
  });

  it('rejects a duplicate question id in the new list', () => {
    expect(() =>
      validateSectionQuestionsReplace(
        ['q1', 'q1'],
        [],
        [
          { id: 'q1', status: 'active' },
          { id: 'q1', status: 'active' },
        ],
      ),
    ).toThrow(BadRequestException);
  });

  it('rejects a duplicate even when the duplicated question is already linked and archived', () => {
    expect(() =>
      validateSectionQuestionsReplace(['q1', 'q1'], ['q1'], [{ id: 'q1', status: 'archived' }]),
    ).toThrow(BadRequestException);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:api -- exam-section-question-validation`
Expected: FAIL — `validateSectionQuestionsReplace` is not defined yet.

- [ ] **Step 3: Write the implementation**

`apps/api/src/exams/exam-section-question-validation.ts`:
```typescript
import { BadRequestException } from '@nestjs/common';

export interface QuestionStatusLookup {
  id: string;
  status: string;
}

export function validateSectionQuestionsReplace(
  newQuestionIds: string[],
  currentlyLinkedQuestionIds: string[],
  questionStatuses: QuestionStatusLookup[],
): void {
  const seen = new Set<string>();
  for (const id of newQuestionIds) {
    if (seen.has(id)) {
      throw new BadRequestException(`Question ${id} is listed more than once`);
    }
    seen.add(id);
  }

  const currentlyLinkedSet = new Set(currentlyLinkedQuestionIds);
  const statusById = new Map(questionStatuses.map((q) => [q.id, q.status]));

  for (const id of newQuestionIds) {
    const isNewlyAdded = !currentlyLinkedSet.has(id);
    if (isNewlyAdded && statusById.get(id) !== 'active') {
      throw new BadRequestException(`Question ${id} is archived and cannot be added to a section for the first time`);
    }
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:api -- exam-section-question-validation`
Expected: `7 passed`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/exams/exam-section-question-validation.ts apps/api/src/exams/exam-section-question-validation.spec.ts
git commit -m "feat: add section-question replace validation (duplicates, archived-question retention rule)"
```

---

### Task 4: ExamsService

**Files:**
- Create: `apps/api/src/exams/dto/create-exam.dto.ts`
- Create: `apps/api/src/exams/dto/update-exam.dto.ts`
- Create: `apps/api/src/exams/dto/create-exam-section.dto.ts`
- Create: `apps/api/src/exams/dto/update-exam-section.dto.ts`
- Create: `apps/api/src/exams/dto/replace-section-questions.dto.ts`
- Create: `apps/api/src/exams/exams.service.ts`
- Create: `apps/api/src/exams/exams.service.spec.ts`

**Interfaces:**
- Consumes: `TenantPrismaService.forTenant` (Phase 0), `validateSectionQuestionsReplace` (Task 3, exact signature above).
- Produces: `ExamsService.create(context, userId, dto)`, `.list(context, filters)`, `.findOne(context, id)`, `.update(context, id, dto)`, `.archive(context, id)`, `.createSection(context, examId, dto)`, `.updateSection(context, examId, sectionId, dto)`, `.deleteSection(context, examId, sectionId)`, `.replaceSectionQuestions(context, examId, sectionId, questionIds)` — Task 5's controller calls these exact method names.

- [ ] **Step 1: Write the DTOs first**

`apps/api/src/exams/dto/create-exam.dto.ts`:
```typescript
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateExamDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsOptional()
  @IsString()
  instructions?: string;
}
```

`apps/api/src/exams/dto/update-exam.dto.ts`:
```typescript
import { CreateExamDto } from './create-exam.dto';

export class UpdateExamDto extends CreateExamDto {}
```

`apps/api/src/exams/dto/create-exam-section.dto.ts`:
```typescript
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateExamSectionDto {
  @IsString()
  @IsNotEmpty()
  title!: string;
}
```

`apps/api/src/exams/dto/update-exam-section.dto.ts`:
```typescript
import { CreateExamSectionDto } from './create-exam-section.dto';

export class UpdateExamSectionDto extends CreateExamSectionDto {}
```

`apps/api/src/exams/dto/replace-section-questions.dto.ts`:
```typescript
import { IsArray, IsString } from 'class-validator';

export class ReplaceSectionQuestionsDto {
  @IsArray()
  @IsString({ each: true })
  questionIds!: string[];
}
```

Note: `questionIds` is deliberately NOT decorated with `@ArrayUnique()` — duplicate detection is a business rule handled by `validateSectionQuestionsReplace` (Task 3), not a DTO-layer format check, matching Phase 1a's precedent of leaving cross-field business rules to the service layer rather than the DTO.

- [ ] **Step 2: Write the failing unit tests for the service**

`apps/api/src/exams/exams.service.spec.ts`:
```typescript
import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ExamsService } from './exams.service';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';

describe('ExamsService', () => {
  let service: ExamsService;
  let tenantPrisma: { forTenant: jest.Mock };
  const context = { organizationId: 'org-1', isSuperAdmin: false };

  beforeEach(async () => {
    tenantPrisma = { forTenant: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [ExamsService, { provide: TenantPrismaService, useValue: tenantPrisma }],
    }).compile();
    service = moduleRef.get(ExamsService);
  });

  it("creates an exam scoped to the caller's organization", async () => {
    const created = { id: 'exam-1', organizationId: 'org-1', title: 'Backend Round' };
    tenantPrisma.forTenant.mockResolvedValue(created);

    const result = await service.create(context, 'user-1', { title: 'Backend Round' });

    expect(result).toEqual(created);
    expect(tenantPrisma.forTenant).toHaveBeenCalledWith(context, expect.any(Function));
  });

  it("lists exams scoped to the caller's organization, defaulting to active status", async () => {
    tenantPrisma.forTenant.mockResolvedValue([{ id: 'exam-1', status: 'active' }]);

    const result = await service.list(context, {});

    expect(result).toHaveLength(1);
    expect(tenantPrisma.forTenant).toHaveBeenCalledWith(context, expect.any(Function));
  });

  it('throws NotFoundException when findOne cannot find the exam', async () => {
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn({ exam: { findFirst: jest.fn().mockResolvedValue(null) } }));

    await expect(service.findOne(context, 'missing-id')).rejects.toThrow(NotFoundException);
  });

  it("updates an exam's title and instructions", async () => {
    const tx = {
      exam: {
        findFirst: jest.fn().mockResolvedValue({ id: 'exam-1' }),
        update: jest.fn().mockResolvedValue({ id: 'exam-1', title: 'Updated Title' }),
      },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    const result = await service.update(context, 'exam-1', { title: 'Updated Title' });

    expect(result.title).toBe('Updated Title');
    expect(tx.exam.update).toHaveBeenCalledWith({
      where: { id: 'exam-1' },
      data: { title: 'Updated Title', instructions: undefined },
    });
  });

  it('throws NotFoundException when updating an exam that does not exist', async () => {
    const tx = { exam: { findFirst: jest.fn().mockResolvedValue(null) } };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await expect(service.update(context, 'missing-id', { title: 'x' })).rejects.toThrow(NotFoundException);
  });

  it('archives an exam by setting status to archived', async () => {
    const tx = {
      exam: {
        findFirst: jest.fn().mockResolvedValue({ id: 'exam-1' }),
        update: jest.fn().mockResolvedValue({ id: 'exam-1', status: 'archived' }),
      },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    const result = await service.archive(context, 'exam-1');

    expect(result.status).toBe('archived');
    expect(tx.exam.update).toHaveBeenCalledWith({ where: { id: 'exam-1' }, data: { status: 'archived' } });
  });

  it('throws NotFoundException when archiving an exam that does not exist', async () => {
    const tx = { exam: { findFirst: jest.fn().mockResolvedValue(null) } };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await expect(service.archive(context, 'missing-id')).rejects.toThrow(NotFoundException);
  });

  it('creates a section appended after the current last orderIndex', async () => {
    const tx = {
      exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1' }) },
      examSection: {
        findFirst: jest.fn().mockResolvedValue({ orderIndex: 2 }),
        create: jest.fn().mockResolvedValue({ id: 'section-1', orderIndex: 3 }),
      },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    const result = await service.createSection(context, 'exam-1', { title: 'Section B' });

    expect(result.orderIndex).toBe(3);
    expect(tx.examSection.create).toHaveBeenCalledWith({ data: { examId: 'exam-1', title: 'Section B', orderIndex: 3 } });
  });

  it('throws NotFoundException when creating a section under a missing exam', async () => {
    const tx = { exam: { findFirst: jest.fn().mockResolvedValue(null) } };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await expect(service.createSection(context, 'missing-exam', { title: 'x' })).rejects.toThrow(NotFoundException);
  });

  it('throws NotFoundException when updating a section that does not belong to the given exam', async () => {
    const tx = {
      exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1' }) },
      examSection: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await expect(service.updateSection(context, 'exam-1', 'wrong-section', { title: 'x' })).rejects.toThrow(NotFoundException);
  });

  it('deletes a section that belongs to the given exam', async () => {
    const tx = {
      exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1' }) },
      examSection: {
        findFirst: jest.fn().mockResolvedValue({ id: 'section-1' }),
        delete: jest.fn().mockResolvedValue({ id: 'section-1' }),
      },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await service.deleteSection(context, 'exam-1', 'section-1');

    expect(tx.examSection.delete).toHaveBeenCalledWith({ where: { id: 'section-1' } });
  });

  it('throws NotFoundException from replaceSectionQuestions when a questionId does not resolve in this organization', async () => {
    const tx = {
      exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1' }) },
      examSection: { findFirst: jest.fn().mockResolvedValue({ id: 'section-1' }) },
      examSectionQuestion: { findMany: jest.fn().mockResolvedValue([]), deleteMany: jest.fn(), createMany: jest.fn() },
      question: { findMany: jest.fn().mockResolvedValue([]) },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await expect(service.replaceSectionQuestions(context, 'exam-1', 'section-1', ['q1'])).rejects.toThrow(NotFoundException);
  });

  it('rejects replaceSectionQuestions when a newly-added question is archived', async () => {
    const tx = {
      exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1' }) },
      examSection: { findFirst: jest.fn().mockResolvedValue({ id: 'section-1' }) },
      examSectionQuestion: { findMany: jest.fn().mockResolvedValue([]), deleteMany: jest.fn(), createMany: jest.fn() },
      question: { findMany: jest.fn().mockResolvedValue([{ id: 'q1', status: 'archived' }]) },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await expect(service.replaceSectionQuestions(context, 'exam-1', 'section-1', ['q1'])).rejects.toThrow(BadRequestException);
  });

  it("replaces a section's questions, keeping an already-linked archived question", async () => {
    const updatedSection = {
      id: 'section-1',
      questions: [
        { questionId: 'q1', orderIndex: 0, question: { id: 'q1', options: [] } },
        { questionId: 'q2', orderIndex: 1, question: { id: 'q2', options: [] } },
      ],
    };
    const tx = {
      exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1' }) },
      examSection: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({ id: 'section-1' })
          .mockResolvedValueOnce(updatedSection),
      },
      examSectionQuestion: {
        findMany: jest.fn().mockResolvedValue([{ questionId: 'q1' }]),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        createMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      question: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'q1', status: 'archived' },
          { id: 'q2', status: 'active' },
        ]),
      },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    const result = await service.replaceSectionQuestions(context, 'exam-1', 'section-1', ['q1', 'q2']);

    expect(result).toEqual(updatedSection);
    expect(tx.examSectionQuestion.deleteMany).toHaveBeenCalledWith({ where: { sectionId: 'section-1' } });
    expect(tx.examSectionQuestion.createMany).toHaveBeenCalledWith({
      data: [
        { sectionId: 'section-1', questionId: 'q1', orderIndex: 0 },
        { sectionId: 'section-1', questionId: 'q2', orderIndex: 1 },
      ],
    });
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm run test:api -- exams.service`
Expected: FAIL — `ExamsService` is not defined yet.

- [ ] **Step 4: Implement the service**

`apps/api/src/exams/exams.service.ts`:
```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { Exam, ExamSection, ExamSectionQuestion, Question, QuestionOption } from '@prisma/client';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { TenantContext } from '../prisma/tenant-context';
import { CreateExamDto } from './dto/create-exam.dto';
import { UpdateExamDto } from './dto/update-exam.dto';
import { CreateExamSectionDto } from './dto/create-exam-section.dto';
import { UpdateExamSectionDto } from './dto/update-exam-section.dto';
import { validateSectionQuestionsReplace } from './exam-section-question-validation';

type ExamSectionWithQuestions = ExamSection & {
  questions: (ExamSectionQuestion & { question: Question & { options: QuestionOption[] } })[];
};

interface ExamFilters {
  status?: string;
}

@Injectable()
export class ExamsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async create(context: TenantContext, userId: string, dto: CreateExamDto): Promise<Exam> {
    return this.tenantPrisma.forTenant(context, (tx) =>
      tx.exam.create({
        data: {
          organizationId: context.organizationId as string,
          title: dto.title,
          instructions: dto.instructions,
          createdBy: userId,
        },
      }),
    );
  }

  async list(context: TenantContext, filters: ExamFilters): Promise<Exam[]> {
    return this.tenantPrisma.forTenant(context, (tx) =>
      tx.exam.findMany({
        where: {
          organizationId: context.organizationId as string,
          status: filters.status ?? 'active',
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
    );
  }

  async findOne(context: TenantContext, id: string): Promise<Exam & { sections: ExamSectionWithQuestions[] }> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const exam = await tx.exam.findFirst({
        where: { id, organizationId: context.organizationId as string },
        include: {
          sections: {
            orderBy: { orderIndex: 'asc' },
            include: {
              questions: {
                orderBy: { orderIndex: 'asc' },
                include: { question: { include: { options: true } } },
              },
            },
          },
        },
      });
      if (!exam) {
        throw new NotFoundException(`Exam ${id} not found`);
      }
      return exam;
    });
  }

  async update(context: TenantContext, id: string, dto: UpdateExamDto): Promise<Exam> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const existing = await tx.exam.findFirst({ where: { id, organizationId: context.organizationId as string } });
      if (!existing) {
        throw new NotFoundException(`Exam ${id} not found`);
      }
      return tx.exam.update({
        where: { id },
        data: { title: dto.title, instructions: dto.instructions },
      });
    });
  }

  async archive(context: TenantContext, id: string): Promise<Exam> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const existing = await tx.exam.findFirst({ where: { id, organizationId: context.organizationId as string } });
      if (!existing) {
        throw new NotFoundException(`Exam ${id} not found`);
      }
      return tx.exam.update({ where: { id }, data: { status: 'archived' } });
    });
  }

  async createSection(context: TenantContext, examId: string, dto: CreateExamSectionDto): Promise<ExamSection> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const exam = await tx.exam.findFirst({ where: { id: examId, organizationId: context.organizationId as string } });
      if (!exam) {
        throw new NotFoundException(`Exam ${examId} not found`);
      }

      const lastSection = await tx.examSection.findFirst({
        where: { examId },
        orderBy: { orderIndex: 'desc' },
      });
      const orderIndex = lastSection ? lastSection.orderIndex + 1 : 0;

      return tx.examSection.create({
        data: { examId, title: dto.title, orderIndex },
      });
    });
  }

  async updateSection(
    context: TenantContext,
    examId: string,
    sectionId: string,
    dto: UpdateExamSectionDto,
  ): Promise<ExamSection> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const exam = await tx.exam.findFirst({ where: { id: examId, organizationId: context.organizationId as string } });
      if (!exam) {
        throw new NotFoundException(`Exam ${examId} not found`);
      }
      const section = await tx.examSection.findFirst({ where: { id: sectionId, examId } });
      if (!section) {
        throw new NotFoundException(`Section ${sectionId} not found`);
      }
      return tx.examSection.update({ where: { id: sectionId }, data: { title: dto.title } });
    });
  }

  async deleteSection(context: TenantContext, examId: string, sectionId: string): Promise<void> {
    await this.tenantPrisma.forTenant(context, async (tx) => {
      const exam = await tx.exam.findFirst({ where: { id: examId, organizationId: context.organizationId as string } });
      if (!exam) {
        throw new NotFoundException(`Exam ${examId} not found`);
      }
      const section = await tx.examSection.findFirst({ where: { id: sectionId, examId } });
      if (!section) {
        throw new NotFoundException(`Section ${sectionId} not found`);
      }
      await tx.examSection.delete({ where: { id: sectionId } });
    });
  }

  async replaceSectionQuestions(
    context: TenantContext,
    examId: string,
    sectionId: string,
    questionIds: string[],
  ): Promise<ExamSectionWithQuestions> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const exam = await tx.exam.findFirst({ where: { id: examId, organizationId: context.organizationId as string } });
      if (!exam) {
        throw new NotFoundException(`Exam ${examId} not found`);
      }
      const section = await tx.examSection.findFirst({ where: { id: sectionId, examId } });
      if (!section) {
        throw new NotFoundException(`Section ${sectionId} not found`);
      }

      const currentLinks = await tx.examSectionQuestion.findMany({ where: { sectionId } });
      const currentlyLinkedQuestionIds = currentLinks.map((link) => link.questionId);

      const uniqueQuestionIds = [...new Set(questionIds)];
      const questions = await tx.question.findMany({
        where: { id: { in: uniqueQuestionIds }, organizationId: context.organizationId as string },
        select: { id: true, status: true },
      });
      if (questions.length !== uniqueQuestionIds.length) {
        throw new NotFoundException('One or more questions were not found in this organization');
      }

      validateSectionQuestionsReplace(questionIds, currentlyLinkedQuestionIds, questions);

      await tx.examSectionQuestion.deleteMany({ where: { sectionId } });
      if (questionIds.length > 0) {
        await tx.examSectionQuestion.createMany({
          data: questionIds.map((questionId, index) => ({ sectionId, questionId, orderIndex: index })),
        });
      }

      const updatedSection = await tx.examSection.findFirst({
        where: { id: sectionId },
        include: {
          questions: {
            orderBy: { orderIndex: 'asc' },
            include: { question: { include: { options: true } } },
          },
        },
      });
      return updatedSection as ExamSectionWithQuestions;
    });
  }
}
```

Note: `createSection`, `updateSection`, `deleteSection`, and `replaceSectionQuestions` all check the parent `Exam` first, inside the same `forTenant` callback, before touching `ExamSection`/`ExamSectionQuestion` — this is the required compensating check documented in this plan's Global Constraints (those two tables have no RLS of their own).

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test:api -- exams.service`
Expected: `14 passed`.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/exams/dto apps/api/src/exams/exams.service.ts apps/api/src/exams/exams.service.spec.ts
git commit -m "feat: add ExamsService with tenant-scoped CRUD and section-question bulk replace"
```

---

### Task 5: ExamsController, RBAC wiring, and seed permission

**Files:**
- Create: `apps/api/src/exams/exams.controller.ts`
- Create: `apps/api/src/exams/exams.module.ts`
- Modify: `apps/api/prisma/seed.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `ExamsService` (Task 4), `JwtAuthGuard`/`PermissionsGuard`/`RequirePermissions`/`CurrentTenant`/`CurrentUserId` (Phase 0/1a).
- Produces: HTTP routes under `/exams`, gated by a new `exam:manage` permission, granted to the `recruiter` role.

- [ ] **Step 1: Write the controller**

`apps/api/src/exams/exams.controller.ts`:
```typescript
import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { TenantContext } from '../prisma/tenant-context';
import { ExamsService } from './exams.service';
import { CreateExamDto } from './dto/create-exam.dto';
import { UpdateExamDto } from './dto/update-exam.dto';
import { CreateExamSectionDto } from './dto/create-exam-section.dto';
import { UpdateExamSectionDto } from './dto/update-exam-section.dto';
import { ReplaceSectionQuestionsDto } from './dto/replace-section-questions.dto';

@Controller('exams')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ExamsController {
  constructor(private readonly examsService: ExamsService) {}

  @Post()
  @RequirePermissions('exam:manage')
  create(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Body() dto: CreateExamDto) {
    return this.examsService.create(tenant, userId, dto);
  }

  @Get()
  @RequirePermissions('exam:manage')
  list(@CurrentTenant() tenant: TenantContext, @Query('status') status?: string) {
    return this.examsService.list(tenant, { status });
  }

  @Get(':id')
  @RequirePermissions('exam:manage')
  findOne(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.examsService.findOne(tenant, id);
  }

  @Patch(':id')
  @RequirePermissions('exam:manage')
  update(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: UpdateExamDto) {
    return this.examsService.update(tenant, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('exam:manage')
  archive(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.examsService.archive(tenant, id);
  }

  @Post(':id/sections')
  @RequirePermissions('exam:manage')
  createSection(@CurrentTenant() tenant: TenantContext, @Param('id') examId: string, @Body() dto: CreateExamSectionDto) {
    return this.examsService.createSection(tenant, examId, dto);
  }

  @Patch(':id/sections/:sectionId')
  @RequirePermissions('exam:manage')
  updateSection(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') examId: string,
    @Param('sectionId') sectionId: string,
    @Body() dto: UpdateExamSectionDto,
  ) {
    return this.examsService.updateSection(tenant, examId, sectionId, dto);
  }

  @Delete(':id/sections/:sectionId')
  @RequirePermissions('exam:manage')
  deleteSection(@CurrentTenant() tenant: TenantContext, @Param('id') examId: string, @Param('sectionId') sectionId: string) {
    return this.examsService.deleteSection(tenant, examId, sectionId);
  }

  @Put(':id/sections/:sectionId/questions')
  @RequirePermissions('exam:manage')
  replaceSectionQuestions(
    @CurrentTenant() tenant: TenantContext,
    @Param('id') examId: string,
    @Param('sectionId') sectionId: string,
    @Body() dto: ReplaceSectionQuestionsDto,
  ) {
    return this.examsService.replaceSectionQuestions(tenant, examId, sectionId, dto.questionIds);
  }
}
```

Note: `DELETE /exams/:id` maps to the service's `archive()` method (soft-delete), a deliberate divergence from Phase 1a's `POST :id/archive` convention — the approved design spec's API section explicitly chose the `DELETE` verb with soft-delete semantics underneath for exams, unlike questions. This is not an inconsistency to "fix"; it's what was decided during brainstorming.

- [ ] **Step 2: Write the module**

`apps/api/src/exams/exams.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { ExamsController } from './exams.controller';
import { ExamsService } from './exams.service';

@Module({
  controllers: [ExamsController],
  providers: [ExamsService],
  exports: [ExamsService],
})
export class ExamsModule {}
```

- [ ] **Step 3: Add the permission to the seed script**

In `apps/api/prisma/seed.ts`, add `'exam:manage'` to the `PERMISSIONS` array:
```typescript
const PERMISSIONS = [
  { key: 'platform:manage_organizations', description: 'Create and manage organizations (Super Admin only)' },
  { key: 'org:manage_users', description: 'Invite and manage users within an organization' },
  { key: 'org:manage_settings', description: 'Edit organization branding/domain/security settings' },
  { key: 'org:view', description: 'View organization dashboard and data' },
  { key: 'question_bank:manage', description: 'Create, edit, and archive questions in the organization\'s question bank' },
  { key: 'exam:manage', description: 'Create, edit, and archive exams and their sections in the organization' },
];
```

And add it to the `recruiter` entry in `ROLE_PERMISSIONS`:
```typescript
const ROLE_PERMISSIONS: Record<string, string[]> = {
  super_admin: ['platform:manage_organizations', 'org:manage_users', 'org:manage_settings', 'org:view'],
  org_admin: ['org:manage_users', 'org:manage_settings', 'org:view'],
  recruiter: ['org:view', 'question_bank:manage', 'exam:manage'],
  panel: ['org:view'],
};
```

Run: `npx prisma db seed` (from `apps/api/`) to apply the new permission to the existing seeded database.
Expected: runs without error (idempotent — existing `upsert` calls handle the new permission/grant cleanly).

- [ ] **Step 4: Register the module in AppModule**

In `apps/api/src/app.module.ts`, add `ExamsModule` to the imports:
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
  ],
})
export class AppModule {}
```

- [ ] **Step 5: Run the full unit suite and build check**

Run: `npm run test:api` (from repo root) — expect all suites passing, no regressions.
Run: `npx nest build` (from `apps/api/`) — expect a clean build with `ExamsModule` wired in.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/exams/exams.controller.ts apps/api/src/exams/exams.module.ts apps/api/prisma/seed.ts apps/api/src/app.module.ts
git commit -m "feat: add ExamsController with RBAC, seed exam:manage permission, wire into AppModule"
```

---

### Task 6: End-to-end test — full exam build flow, tenant isolation, RBAC denial

**Files:**
- Modify: `apps/api/test/exam-builder.e2e-spec.ts` (Task 2 already created this file with the isolation-only tests; this task completes it with the full HTTP flow)

**Interfaces:**
- Consumes: the full `ExamsController` HTTP surface (Task 5), the real `AuthService` login flow (Phase 0), the real seeded `recruiter`/`org_admin` roles and `exam:manage` permission (Task 5), the existing `QuestionsController`'s archive endpoint (Phase 1a).

- [ ] **Step 1: Replace the file with the complete test**

`apps/api/test/exam-builder.e2e-spec.ts` (full replacement — includes the Task 2 isolation tests plus the new HTTP flow tests):
```typescript
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantPrismaService } from '../src/prisma/tenant-prisma.service';

describe('Exam Builder Row-Level Security', () => {
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let planId: string;
  let orgAId: string;
  let orgBId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [PrismaModule] }).compile();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);

    const plan = await prisma.plan.create({
      data: { name: `eb-rls-plan-${randomUUID()}`, candidateLimit: 10, aiCreditLimit: 1, proctoringMinutesLimit: 1 },
    });
    planId = plan.id;

    const orgA = await prisma.organization.create({ data: { name: 'EB Org A', slug: `eb-org-a-${randomUUID()}`, planId } });
    const orgB = await prisma.organization.create({ data: { name: 'EB Org B', slug: `eb-org-b-${randomUUID()}`, planId } });
    orgAId = orgA.id;
    orgBId = orgB.id;

    await tenantPrisma.forTenant({ organizationId: orgAId, isSuperAdmin: false }, (tx) =>
      tx.exam.create({ data: { organizationId: orgAId, title: 'Org A Exam', createdBy: randomUUID() } }),
    );
  });

  afterAll(async () => {
    await tenantPrisma.forTenant({ organizationId: orgAId, isSuperAdmin: false }, (tx) =>
      tx.exam.deleteMany({ where: { organizationId: orgAId } }),
    );
    await prisma.organization.deleteMany({ where: { id: { in: [orgAId, orgBId] } } });
    await prisma.plan.delete({ where: { id: planId } });
    await prisma.$disconnect();
  });

  it('never returns another tenant\'s exams', async () => {
    const orgBExams = await tenantPrisma.forTenant({ organizationId: orgBId, isSuperAdmin: false }, (tx) =>
      tx.exam.findMany(),
    );
    expect(orgBExams).toHaveLength(0);
  });

  it('returns zero rows when no tenant context has been set', async () => {
    const rows = await prisma.exam.findMany({ where: { organizationId: orgAId } });
    expect(rows).toHaveLength(0);
  });
});

describe('Exam Builder HTTP flow', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let planId: string;
  let orgId: string;
  let recruiterAccessToken: string;
  let orgAdminAccessToken: string;
  let questionAId: string;
  let questionBId: string;
  let examId: string;
  let sectionOneId: string;
  let sectionTwoId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);

    const plan = await prisma.plan.create({
      data: { name: `eb-http-plan-${randomUUID()}`, candidateLimit: 10, aiCreditLimit: 1, proctoringMinutesLimit: 1 },
    });
    planId = plan.id;

    const org = await prisma.organization.create({ data: { name: 'EB HTTP Org', slug: `eb-http-org-${randomUUID()}`, planId } });
    orgId = org.id;

    const recruiterHash = await argon2.hash('RecruiterPassw0rd!');
    const orgAdminHash = await argon2.hash('OrgAdminPassw0rd!');
    const questions = await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, async (tx) => {
      await Promise.all([
        tx.user.create({ data: { organizationId: orgId, email: 'recruiter@eb-http.test', passwordHash: recruiterHash, role: 'recruiter' } }),
        tx.user.create({ data: { organizationId: orgId, email: 'orgadmin@eb-http.test', passwordHash: orgAdminHash, role: 'org_admin' } }),
      ]);
      const questionA = await tx.question.create({
        data: {
          organizationId: orgId,
          type: 'true_false',
          text: 'Question A',
          difficulty: 'easy',
          marks: 1,
          createdBy: randomUUID(),
          options: { create: [{ text: 'True', isCorrect: true, orderIndex: 0 }, { text: 'False', isCorrect: false, orderIndex: 1 }] },
        },
      });
      const questionB = await tx.question.create({
        data: {
          organizationId: orgId,
          type: 'true_false',
          text: 'Question B',
          difficulty: 'easy',
          marks: 1,
          createdBy: randomUUID(),
          options: { create: [{ text: 'True', isCorrect: true, orderIndex: 0 }, { text: 'False', isCorrect: false, orderIndex: 1 }] },
        },
      });
      return { questionA, questionB };
    });
    questionAId = questions.questionA.id;
    questionBId = questions.questionB.id;

    const recruiterLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/staff/login')
      .send({ organizationSlug: org.slug, email: 'recruiter@eb-http.test', password: 'RecruiterPassw0rd!' })
      .expect(200);
    recruiterAccessToken = recruiterLogin.body.accessToken;

    const orgAdminLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/staff/login')
      .send({ organizationSlug: org.slug, email: 'orgadmin@eb-http.test', password: 'OrgAdminPassw0rd!' })
      .expect(200);
    orgAdminAccessToken = orgAdminLogin.body.accessToken;
  });

  afterAll(async () => {
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) =>
      tx.exam.deleteMany({ where: { organizationId: orgId } }),
    );
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) =>
      tx.question.deleteMany({ where: { organizationId: orgId } }),
    );
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: true }, (tx) =>
      tx.refreshToken.deleteMany({ where: { user: { organizationId: orgId } } }),
    );
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) =>
      tx.user.deleteMany({ where: { organizationId: orgId } }),
    );
    await prisma.organization.delete({ where: { id: orgId } }).catch(() => undefined);
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('rejects a non-permitted role from creating an exam', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/exams')
      .set('Authorization', `Bearer ${orgAdminAccessToken}`)
      .send({ title: 'Should be forbidden' })
      .expect(403);
  });

  it('builds an exam end-to-end: sections, question assignment, ordering, and archived-question retention', async () => {
    const createExamResponse = await request(app.getHttpServer())
      .post('/api/v1/exams')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ title: 'Backend Round', instructions: 'Answer all questions.' })
      .expect(201);
    examId = createExamResponse.body.id;

    const sectionOneResponse = await request(app.getHttpServer())
      .post(`/api/v1/exams/${examId}/sections`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ title: 'Section One' })
      .expect(201);
    sectionOneId = sectionOneResponse.body.id;
    expect(sectionOneResponse.body.orderIndex).toBe(0);

    const sectionTwoResponse = await request(app.getHttpServer())
      .post(`/api/v1/exams/${examId}/sections`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ title: 'Section Two' })
      .expect(201);
    sectionTwoId = sectionTwoResponse.body.id;
    expect(sectionTwoResponse.body.orderIndex).toBe(1);

    await request(app.getHttpServer())
      .put(`/api/v1/exams/${examId}/sections/${sectionOneId}/questions`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ questionIds: [questionBId, questionAId] })
      .expect(200);

    const examDetailResponse = await request(app.getHttpServer())
      .get(`/api/v1/exams/${examId}`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(200);
    const sectionOneQuestions = examDetailResponse.body.sections.find((s: { id: string }) => s.id === sectionOneId).questions;
    expect(sectionOneQuestions.map((q: { questionId: string }) => q.questionId)).toEqual([questionBId, questionAId]);

    await request(app.getHttpServer())
      .post(`/api/v1/questions/${questionBId}/archive`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(201);

    await request(app.getHttpServer())
      .put(`/api/v1/exams/${examId}/sections/${sectionOneId}/questions`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ questionIds: [questionAId, questionBId] })
      .expect(200);

    await request(app.getHttpServer())
      .put(`/api/v1/exams/${examId}/sections/${sectionTwoId}/questions`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ questionIds: [questionBId] })
      .expect(400);

    await request(app.getHttpServer())
      .delete(`/api/v1/exams/${examId}/sections/${sectionTwoId}`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(200);

    const examAfterSectionDeleteResponse = await request(app.getHttpServer())
      .get(`/api/v1/exams/${examId}`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(200);
    expect(examAfterSectionDeleteResponse.body.sections).toHaveLength(1);

    await request(app.getHttpServer())
      .delete(`/api/v1/exams/${examId}`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(200);

    const activeListResponse = await request(app.getHttpServer())
      .get('/api/v1/exams?status=active')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(200);
    expect(activeListResponse.body.map((e: { id: string }) => e.id)).not.toContain(examId);
  });
});
```

- [ ] **Step 2: Run the full e2e suite**

Run: `npm run test:api:e2e` (from repo root)
Expected: all suites pass, including both `describe` blocks in `exam-builder.e2e-spec.ts` (2 RLS tests + 2 HTTP flow tests = 4 tests in this file), with no regressions to `tenant-isolation.e2e-spec.ts`, `health.e2e-spec.ts`, `auth-flow.e2e-spec.ts`, or `question-bank.e2e-spec.ts`.

- [ ] **Step 3: Run the full unit suite one more time**

Run: `npm run test:api` (from repo root)
Expected: all suites still passing.

- [ ] **Step 4: Commit**

```bash
git add apps/api/test/exam-builder.e2e-spec.ts
git commit -m "test: add full exam builder e2e coverage - section/question assembly, archived-question retention, tenant isolation, RBAC denial"
```
