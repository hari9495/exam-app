# Phase 4a — Question Tagging & Negative Marking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a many-to-many question-tagging model and wire the already-existing-but-unused `Question.negativeMarks` field into real grading — the first, foundational sub-phase of Phase 4 (Randomization, Question Pools & Reporting Depth).

**Architecture:** A new `Tag`/`QuestionTag` pair extends the Question Bank schema, additive to the existing `topic`/`category` fields. `QuestionsService` resolves tag names to IDs (creating new ones on the fly) and writes the join rows using the same full-replace-on-update pattern it already uses for `QuestionOption`. A new `TagsController`/`TagsService` inside the existing `questions/` module expose `GET /tags` for listing. Separately, `apps/exam-runtime`'s `gradeAnswer`/`computeResult` gain negative-marking logic — unattempted questions are never penalized, and a whole attempt's total score is floored at 0. Backend only; `apps/web` has no Question Bank UI to extend (Phase 1a/1b's own precedent), so no frontend work is in scope.

**Tech Stack:** Same as every prior phase — NestJS, Prisma (`sqlserver` provider via `@exam-platform/shared`), SQL Server, Jest/Supertest. No new dependencies.

## Global Constraints

- `topic`/`category` on `Question` are untouched — tags are additive, not a migration/replacement of existing data.
- `QuestionTag` (the join table) gets **no `organizationId` column and no RLS registration** — this matches every other join/child table in the schema today (`ExamSectionQuestion`, `QuestionOption`, `Answer`, none of which have `organizationId` or RLS). `Tag` itself **does** get `organizationId` + RLS registration, following the exact pattern `dbo.questions`/`dbo.exams` already use.
- Tags are created only implicitly through the question create/update DTO's `tags: string[]` field (names, not IDs) — no standalone `POST /tags` endpoint.
- `GET /questions` gains a `tagId` filter alongside the existing `topic`/`difficulty`/`status` filters — single-tag only, no AND/OR multi-tag filtering in this sub-phase.
- Every question response (`create`, `list`, `findOne`, `update`, `archive`) includes `tags: { id: string; name: string }[]`, flattened from the join-table shape.
- `gradeAnswer` only deducts `negativeMarks` when the candidate selected something and got it wrong (`selectedOptionIds.length > 0`) — an unattempted question always scores 0, never a deduction.
- `computeResult` floors the summed `score` at 0 before computing `percentage`/`passFail` — a whole attempt's score and percentage can never be negative.
- No partial credit, no per-option negative marking, no exam-level negative-marking override — `negativeMarks` stays exactly the per-question field it already is in the schema.
- No Question Bank / Exam Builder frontend UI — out of scope, deferred to its own future sub-phase.
- Work happens directly on `main` (no feature branch) — established pattern for this project across every prior phase.
- Full spec: `docs/superpowers/specs/2026-07-10-phase-4a-question-tagging-negative-marking-design.md`.

---

## File Structure

```
apps/api/
  prisma/
    schema.prisma                                          # Modify: add Tag, QuestionTag models; Question gains tags relation
    migrations/
      20260710090000_question_tags_schema/migration.sql    # Create
      20260710090001_question_tags_rls/migration.sql       # Create
  src/
    questions/
      dto/create-question.dto.ts                            # Modify: add tags?: string[]
      questions.service.ts                                  # Modify: resolveTagIds, tags in create/list/findOne/update/archive
      questions.service.spec.ts                             # Modify: update existing mocks, add tag-resolution tests
      questions.controller.ts                                # Modify: tagId query param
      tags.controller.ts                                     # Create
      tags.service.ts                                        # Create
      tags.service.spec.ts                                   # Create
      questions.module.ts                                    # Modify: register TagsController/TagsService
  test/
    question-bank.e2e-spec.ts                                # Modify: tag round-trip + cross-tenant tag isolation
    exam-taking-runtime.e2e-spec.ts                           # Modify: negative-marking + floor-at-zero scenario
apps/exam-runtime/
  src/
    grading/
      grading.ts                                              # Modify: negativeMarks in GradableQuestion, floor in computeResult
      grading.spec.ts                                         # Modify: update existing cases, add negative-marking cases
      attempt-settlement.service.ts                            # Modify: pass negativeMarks into gradeAnswer
      attempt-settlement.service.spec.ts                        # Modify: negativeMarks on mocked questions, add deduction test
```

---

### Task 1: Schema — `Tag` and `QuestionTag` models

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260710090000_question_tags_schema/migration.sql`
- Create: `apps/api/prisma/migrations/20260710090001_question_tags_rls/migration.sql`

**Interfaces:**
- Produces: `Tag` model (`id, organizationId, name, createdAt`, `@@unique([organizationId, name])`) and `QuestionTag` model (`questionId, tagId`, composite PK). `Question` gains a `tags QuestionTag[]` relation field. Task 2 depends on both models and the `organizationId_name` compound-unique input name Prisma generates from `@@unique([organizationId, name])`.

- [ ] **Step 1: Add the models to the schema**

In `apps/api/prisma/schema.prisma`, add `tags QuestionTag[]` to the existing `Question` model (alongside its existing `options`, `examLinks`, `answers` relation fields — no other change to `Question`):

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
  tags           QuestionTag[]

  @@index([organizationId, topic, difficulty])
  @@map("questions")
}
```

Add two new models immediately after `Question` (or wherever the file's existing model ordering makes sense — after `QuestionOption` is fine):

```prisma
model Tag {
  id             String        @id @default(uuid()) @db.UniqueIdentifier
  organizationId String        @map("organization_id") @db.UniqueIdentifier
  name           String
  createdAt      DateTime      @default(now()) @map("created_at")
  questions      QuestionTag[]

  @@unique([organizationId, name])
  @@map("tags")
}

model QuestionTag {
  questionId String   @map("question_id") @db.UniqueIdentifier
  tagId      String   @map("tag_id") @db.UniqueIdentifier
  question   Question @relation(fields: [questionId], references: [id], onDelete: Cascade)
  tag        Tag      @relation(fields: [tagId], references: [id], onDelete: Cascade)

  @@id([questionId, tagId])
  @@map("question_tags")
}
```

`Tag` follows `Question`'s exact convention: a plain `organizationId` UUID column with **no Prisma relation to `Organization`** (tenant-scoped tables in this schema never declare that relation — RLS plus explicit `organizationId` filters handle it). `QuestionTag` follows `ExamSectionQuestion`'s exact convention: no `organizationId`, no RLS.

- [ ] **Step 2: Generate the schema migration**

Run (from `apps/api/`): `npx prisma migrate dev --create-only --name question_tags_schema`

Expected: creates `apps/api/prisma/migrations/<timestamp>_question_tags_schema/migration.sql` with `CREATE TABLE` statements for `tags` and `question_tags`, a unique index for `[organization_id, name]`, and foreign keys from `question_tags` to both `questions` and `tags`. Rename the generated folder to `20260710090000_question_tags_schema` if Prisma's auto-generated timestamp differs, so it sorts correctly after `20260709150000_organization_branding`. The generated SQL should closely match:

```sql
-- CreateTable
CREATE TABLE [dbo].[tags] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organization_id] UNIQUEIDENTIFIER NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [tags_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [tags_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[question_tags] (
    [question_id] UNIQUEIDENTIFIER NOT NULL,
    [tag_id] UNIQUEIDENTIFIER NOT NULL,
    CONSTRAINT [question_tags_pkey] PRIMARY KEY CLUSTERED ([question_id],[tag_id])
);

-- CreateIndex
CREATE UNIQUE NONCLUSTERED INDEX [tags_organization_id_name_key] ON [dbo].[tags]([organization_id], [name]);

-- AddForeignKey
ALTER TABLE [dbo].[question_tags] ADD CONSTRAINT [question_tags_question_id_fkey] FOREIGN KEY ([question_id]) REFERENCES [dbo].[questions]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[question_tags] ADD CONSTRAINT [question_tags_tag_id_fkey] FOREIGN KEY ([tag_id]) REFERENCES [dbo].[tags]([id]) ON DELETE CASCADE ON UPDATE CASCADE;
```

If Prisma's actual output differs in naming details, keep Prisma's real output — do not hand-edit a generated schema migration's DDL.

- [ ] **Step 3: Hand-write the RLS migration**

Prisma can't diff a raw `ALTER SECURITY POLICY` statement, so this migration is created by hand, matching every prior RLS-registration migration's structure (`20260707130003_question_bank_rls` for `dbo.questions`, `20260707140001_exam_builder_rls` for `dbo.exams`).

Create `apps/api/prisma/migrations/20260710090001_question_tags_rls/migration.sql`:

```sql
-- Extend the tenant isolation security policy created in Phase 0
-- (20260707110005_tenant_rls_policy) to also cover dbo.tags. Reuses
-- the existing dbo.fn_tenant_access_predicate function unchanged; this
-- adds predicates to the existing policy, it does not create a new
-- policy or function. The policy is already WITH (STATE = ON), so no
-- state change is needed here. dbo.question_tags is deliberately NOT
-- added here -- it has no organization_id column, matching every other
-- join table in this schema (exam_section_questions, question_options);
-- tenant isolation for it is enforced at the application layer only,
-- by always reaching it through an already-tenant-filtered Question row.
ALTER SECURITY POLICY dbo.TenantAccessPolicy
ADD FILTER PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.tags,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.tags AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.tags AFTER UPDATE;
```

- [ ] **Step 4: Apply the migrations and regenerate the client**

Run (from `apps/api/`): `npx prisma migrate deploy` (never `migrate dev` for applying — the `examapp_dev` database login lacks `CREATE DATABASE` permission `migrate dev` needs for its shadow database), then `npx prisma generate`.

Expected: both migrations apply cleanly. Run `npx prisma migrate status` to confirm — should report all migrations applied, no drift.

- [ ] **Step 5: Verify the schema directly against the database**

Run (from `apps/api/`), using whatever DB client/script this project already uses to run ad-hoc SQL against `DATABASE_URL` (matching the verification standard every prior schema-touching phase used):
```sql
SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME IN ('tags', 'question_tags') ORDER BY TABLE_NAME, ORDINAL_POSITION;
```
Expected: `tags` has `id, organization_id, name, created_at`; `question_tags` has `question_id, tag_id`. Then confirm RLS registration:
```sql
SELECT OBJECT_NAME(target_object_id) AS table_name FROM sys.security_predicates WHERE OBJECT_NAME(target_object_id) = 'tags';
```
Expected: rows returned for `tags` (filter + 2 block predicates); no rows for `question_tags` (by design).

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260710090000_question_tags_schema apps/api/prisma/migrations/20260710090001_question_tags_rls
git commit -m "feat: add Tag and QuestionTag schema, registered on the tenant RLS policy"
```

---

### Task 2: Question tagging — DTO, service, controller, `GET /tags`

**Files:**
- Modify: `apps/api/src/questions/dto/create-question.dto.ts`
- Modify: `apps/api/src/questions/questions.service.ts`
- Modify: `apps/api/src/questions/questions.service.spec.ts`
- Modify: `apps/api/src/questions/questions.controller.ts`
- Create: `apps/api/src/questions/tags.controller.ts`
- Create: `apps/api/src/questions/tags.service.ts`
- Create: `apps/api/src/questions/tags.service.spec.ts`
- Modify: `apps/api/src/questions/questions.module.ts`
- Modify: `apps/api/test/question-bank.e2e-spec.ts`

**Interfaces:**
- Consumes: `Tag`/`QuestionTag` Prisma models (Task 1).
- Produces: every `QuestionsService` method returns `{ ...question, tags: { id: string; name: string }[] }`. `TagsService.list(context: TenantContext): Promise<Tag[]>`. No other task depends on these directly — this is the last task that touches the question-bank surface in this sub-phase.

- [ ] **Step 1: Add `tags` to `CreateQuestionDto`**

In `apps/api/src/questions/dto/create-question.dto.ts`, add the import and field (`UpdateQuestionDto extends CreateQuestionDto` with no overrides, so it inherits this automatically — no separate change needed there):

```typescript
import { ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class QuestionOptionDto {
  @IsString()
  text!: string;

  @IsBoolean()
  isCorrect!: boolean;
}

export class CreateQuestionDto {
  @IsIn(['single_mcq', 'multi_mcq', 'true_false'])
  type!: string;

  @IsString()
  text!: string;

  @IsOptional()
  @IsString()
  topic?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsIn(['easy', 'medium', 'hard'])
  difficulty!: string;

  @IsInt()
  @Min(1)
  marks!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  negativeMarks?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ValidateNested({ each: true })
  @Type(() => QuestionOptionDto)
  @ArrayMinSize(1)
  options!: QuestionOptionDto[];
}
```

- [ ] **Step 2: Write the failing service tests**

Replace `apps/api/src/questions/questions.service.spec.ts` in full:

```typescript
import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { QuestionsService } from './questions.service';
import { TenantPrismaService } from '@exam-platform/shared';

describe('QuestionsService', () => {
  let service: QuestionsService;
  let tenantPrisma: { forTenant: jest.Mock };
  const context = { organizationId: 'org-1', isSuperAdmin: false };

  beforeEach(async () => {
    tenantPrisma = { forTenant: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [QuestionsService, { provide: TenantPrismaService, useValue: tenantPrisma }],
    }).compile();
    service = moduleRef.get(QuestionsService);
  });

  const validDto = {
    type: 'single_mcq',
    text: 'What is 2+2?',
    difficulty: 'easy',
    marks: 5,
    options: [
      { text: '3', isCorrect: false },
      { text: '4', isCorrect: true },
    ],
  };

  it('creates a question scoped to the caller\'s organization', async () => {
    const created = { id: 'q-1', organizationId: 'org-1', ...validDto, options: validDto.options, tags: [] };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) =>
      fn({ tag: { upsert: jest.fn() }, question: { create: jest.fn().mockResolvedValue(created) } }),
    );

    const result = await service.create(context, 'user-1', validDto);

    expect(result).toEqual(created);
    expect(tenantPrisma.forTenant).toHaveBeenCalledWith(context, expect.any(Function));
  });

  it('rejects an invalid payload before touching the database', async () => {
    const invalidDto = { ...validDto, options: [{ text: '4', isCorrect: false }, { text: '3', isCorrect: false }] };

    await expect(service.create(context, 'user-1', invalidDto)).rejects.toThrow(BadRequestException);
    expect(tenantPrisma.forTenant).not.toHaveBeenCalled();
  });

  it('resolves tag names into Tag rows and links them when creating a question, deduping and trimming input', async () => {
    const tagUpsert = jest.fn().mockImplementation(({ create }) => Promise.resolve({ id: `tag-${create.name}`, ...create }));
    const questionCreate = jest.fn().mockResolvedValue({ id: 'q-1', ...validDto, tags: [] });
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn({ tag: { upsert: tagUpsert }, question: { create: questionCreate } }));

    await service.create(context, 'user-1', { ...validDto, tags: ['javascript', 'javascript', ' typescript '] });

    expect(tagUpsert).toHaveBeenCalledTimes(2);
    expect(tagUpsert).toHaveBeenCalledWith({
      where: { organizationId_name: { organizationId: 'org-1', name: 'javascript' } },
      create: { organizationId: 'org-1', name: 'javascript' },
      update: {},
    });
    expect(tagUpsert).toHaveBeenCalledWith({
      where: { organizationId_name: { organizationId: 'org-1', name: 'typescript' } },
      create: { organizationId: 'org-1', name: 'typescript' },
      update: {},
    });
    expect(questionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tags: { create: [{ tagId: 'tag-javascript' }, { tagId: 'tag-typescript' }] } }),
      }),
    );
  });

  it('lists questions scoped to the caller\'s organization, defaulting to active status', async () => {
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) =>
      fn({ question: { findMany: jest.fn().mockResolvedValue([{ id: 'q-1', status: 'active', tags: [] }]) } }),
    );

    const result = await service.list(context, {});

    expect(result).toHaveLength(1);
    expect(tenantPrisma.forTenant).toHaveBeenCalledWith(context, expect.any(Function));
  });

  it('filters the list by tagId when provided', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn({ question: { findMany } }));

    await service.list(context, { tagId: 'tag-1' });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tags: { some: { tagId: 'tag-1' } } }) }),
    );
  });

  it('throws NotFoundException when findOne cannot find the question', async () => {
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn({ question: { findFirst: jest.fn().mockResolvedValue(null) } }));

    await expect(service.findOne(context, 'missing-id')).rejects.toThrow(NotFoundException);
  });

  it('returns a question with its tags flattened to {id, name} when findOne succeeds', async () => {
    const found = { id: 'q-1', tags: [{ tagId: 'tag-1', questionId: 'q-1', tag: { id: 'tag-1', name: 'javascript' } }] };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn({ question: { findFirst: jest.fn().mockResolvedValue(found) } }));

    const result = await service.findOne(context, 'q-1');

    expect(result.tags).toEqual([{ id: 'tag-1', name: 'javascript' }]);
  });

  it('replaces a question\'s tags entirely on update, not merging with the prior set', async () => {
    const tx = {
      question: {
        findFirst: jest.fn().mockResolvedValue({ id: 'q-1' }),
        update: jest.fn().mockResolvedValue({ id: 'q-1', ...validDto, tags: [] }),
      },
      questionOption: { deleteMany: jest.fn() },
      questionTag: { deleteMany: jest.fn() },
      tag: { upsert: jest.fn().mockResolvedValue({ id: 'tag-new' }) },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await service.update(context, 'q-1', { ...validDto, tags: ['new-tag'] });

    expect(tx.questionTag.deleteMany).toHaveBeenCalledWith({ where: { questionId: 'q-1' } });
    expect(tx.question.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tags: { create: [{ tagId: 'tag-new' }] } }) }),
    );
  });

  it('archives a question by setting status to archived', async () => {
    const tx = {
      question: {
        findFirst: jest.fn().mockResolvedValue({ id: 'q-1' }),
        update: jest.fn().mockResolvedValue({ id: 'q-1', status: 'archived', tags: [] }),
      },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    const result = await service.archive(context, 'q-1');

    expect(result.status).toBe('archived');
    expect(tx.question.update).toHaveBeenCalledWith({
      where: { id: 'q-1' },
      data: { status: 'archived' },
      include: { options: true, tags: { include: { tag: true } } },
    });
  });

  it('throws NotFoundException when archiving a question that does not exist', async () => {
    const tx = { question: { findFirst: jest.fn().mockResolvedValue(null) } };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await expect(service.archive(context, 'missing-id')).rejects.toThrow(NotFoundException);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm run test:api -- questions.service` (from repo root)
Expected: FAIL — `QuestionsService` doesn't resolve tags yet, mocked `tx` shapes (`tag.upsert`, `questionTag.deleteMany`) don't match the current implementation's calls, and the `create`/`update`/`archive`/`findOne` include shapes don't match.

- [ ] **Step 4: Implement tag resolution in `QuestionsService`**

Replace `apps/api/src/questions/questions.service.ts` in full:

```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Question, QuestionOption, QuestionTag, Tag } from '@prisma/client';
import { TenantPrismaService } from '@exam-platform/shared';
import { TenantContext } from '@exam-platform/shared';
import { CreateQuestionDto } from './dto/create-question.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';
import { validateQuestionPayload } from './question-validation';

type QuestionWithRelations = Question & { options?: QuestionOption[]; tags: (QuestionTag & { tag: Tag })[] };
type QuestionResponse = Omit<QuestionWithRelations, 'tags'> & { tags: { id: string; name: string }[] };

interface QuestionFilters {
  topic?: string;
  difficulty?: string;
  status?: string;
  tagId?: string;
  limit?: number;
  cursor?: string;
}

@Injectable()
export class QuestionsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async create(context: TenantContext, userId: string, dto: CreateQuestionDto): Promise<QuestionResponse> {
    validateQuestionPayload({
      type: dto.type,
      difficulty: dto.difficulty,
      marks: dto.marks,
      negativeMarks: dto.negativeMarks ?? 0,
      options: dto.options,
    });

    const question = await this.tenantPrisma.forTenant(context, async (tx) => {
      const tagIds = await this.resolveTagIds(tx, context.organizationId as string, dto.tags ?? []);
      return tx.question.create({
        data: {
          organizationId: context.organizationId as string,
          type: dto.type,
          text: dto.text,
          topic: dto.topic,
          category: dto.category,
          difficulty: dto.difficulty,
          marks: dto.marks,
          negativeMarks: dto.negativeMarks ?? 0,
          createdBy: userId,
          options: {
            create: dto.options.map((o, index) => ({ text: o.text, isCorrect: o.isCorrect, orderIndex: index })),
          },
          tags: {
            create: tagIds.map((tagId) => ({ tagId })),
          },
        },
        include: { options: true, tags: { include: { tag: true } } },
      });
    });
    return this.toResponse(question as QuestionWithRelations);
  }

  async list(context: TenantContext, filters: QuestionFilters): Promise<QuestionResponse[]> {
    const limit = filters.limit && filters.limit > 0 && filters.limit <= 100 ? filters.limit : 20;
    const questions = await this.tenantPrisma.forTenant(context, (tx) =>
      tx.question.findMany({
        where: {
          organizationId: context.organizationId as string,
          ...(filters.topic ? { topic: filters.topic } : {}),
          ...(filters.difficulty ? { difficulty: filters.difficulty } : {}),
          ...(filters.tagId ? { tags: { some: { tagId: filters.tagId } } } : {}),
          status: filters.status ?? 'active',
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit,
        ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
        include: { tags: { include: { tag: true } } },
      }),
    );
    return questions.map((q) => this.toResponse(q as unknown as QuestionWithRelations));
  }

  async findOne(context: TenantContext, id: string): Promise<QuestionResponse> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const question = await tx.question.findFirst({
        where: { id, organizationId: context.organizationId as string },
        include: { options: true, tags: { include: { tag: true } } },
      });
      if (!question) {
        throw new NotFoundException(`Question ${id} not found`);
      }
      return this.toResponse(question as unknown as QuestionWithRelations);
    });
  }

  async update(context: TenantContext, id: string, dto: UpdateQuestionDto): Promise<QuestionResponse> {
    validateQuestionPayload({
      type: dto.type,
      difficulty: dto.difficulty,
      marks: dto.marks,
      negativeMarks: dto.negativeMarks ?? 0,
      options: dto.options,
    });

    return this.tenantPrisma.forTenant(context, async (tx) => {
      const existing = await tx.question.findFirst({ where: { id, organizationId: context.organizationId as string } });
      if (!existing) {
        throw new NotFoundException(`Question ${id} not found`);
      }

      const tagIds = await this.resolveTagIds(tx, context.organizationId as string, dto.tags ?? []);

      await tx.questionOption.deleteMany({ where: { questionId: id } });
      await tx.questionTag.deleteMany({ where: { questionId: id } });

      const updated = await tx.question.update({
        where: { id },
        data: {
          type: dto.type,
          text: dto.text,
          topic: dto.topic,
          category: dto.category,
          difficulty: dto.difficulty,
          marks: dto.marks,
          negativeMarks: dto.negativeMarks ?? 0,
          options: {
            create: dto.options.map((o, index) => ({ text: o.text, isCorrect: o.isCorrect, orderIndex: index })),
          },
          tags: {
            create: tagIds.map((tagId) => ({ tagId })),
          },
        },
        include: { options: true, tags: { include: { tag: true } } },
      });
      return this.toResponse(updated as QuestionWithRelations);
    });
  }

  async archive(context: TenantContext, id: string): Promise<QuestionResponse> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const existing = await tx.question.findFirst({ where: { id, organizationId: context.organizationId as string } });
      if (!existing) {
        throw new NotFoundException(`Question ${id} not found`);
      }
      const archived = await tx.question.update({
        where: { id },
        data: { status: 'archived' },
        include: { options: true, tags: { include: { tag: true } } },
      });
      return this.toResponse(archived as QuestionWithRelations);
    });
  }

  private async resolveTagIds(tx: Prisma.TransactionClient, organizationId: string, names: string[]): Promise<string[]> {
    const trimmed = [...new Set(names.map((n) => n.trim()).filter((n) => n.length > 0))];
    const tags = await Promise.all(
      trimmed.map((name) =>
        tx.tag.upsert({
          where: { organizationId_name: { organizationId, name } },
          create: { organizationId, name },
          update: {},
        }),
      ),
    );
    return tags.map((tag) => tag.id);
  }

  private toResponse(question: QuestionWithRelations): QuestionResponse {
    const { tags, ...rest } = question;
    return { ...rest, tags: tags.map((qt) => ({ id: qt.tag.id, name: qt.tag.name })) } as QuestionResponse;
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test:api -- questions.service`
Expected: `10 passed` (the original 6 — create, reject-invalid, list-default, findOne-not-found, archive, archive-not-found — plus 4 new: tag resolution, tagId filter, findOne-with-tags, update-replaces-tags).

- [ ] **Step 6: Add the `tagId` query param to the controller**

In `apps/api/src/questions/questions.controller.ts`, update the `list` method:

```typescript
  @Get()
  @RequirePermissions('question_bank:manage')
  list(
    @CurrentTenant() tenant: TenantContext,
    @Query('topic') topic?: string,
    @Query('difficulty') difficulty?: string,
    @Query('status') status?: string,
    @Query('tagId') tagId?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.questionsService.list(tenant, { topic, difficulty, status, tagId, limit: limit ? parseInt(limit, 10) : undefined, cursor });
  }
```

The rest of the controller (`create`, `findOne`, `update`, `archive`) is unchanged — they already pass their DTOs straight through to the service, which now handles `tags` internally.

- [ ] **Step 7: Write the failing `TagsService` test**

`apps/api/src/questions/tags.service.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { TagsService } from './tags.service';
import { TenantPrismaService } from '@exam-platform/shared';

describe('TagsService', () => {
  let service: TagsService;
  let tenantPrisma: { forTenant: jest.Mock };
  const context = { organizationId: 'org-1', isSuperAdmin: false };

  beforeEach(async () => {
    tenantPrisma = { forTenant: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [TagsService, { provide: TenantPrismaService, useValue: tenantPrisma }],
    }).compile();
    service = moduleRef.get(TagsService);
  });

  it('lists the caller\'s organization tags ordered by name', async () => {
    const findMany = jest.fn().mockResolvedValue([{ id: 'tag-1', name: 'javascript' }]);
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn({ tag: { findMany } }));

    const result = await service.list(context);

    expect(result).toEqual([{ id: 'tag-1', name: 'javascript' }]);
    expect(findMany).toHaveBeenCalledWith({ where: { organizationId: 'org-1' }, orderBy: { name: 'asc' } });
  });
});
```

- [ ] **Step 8: Run the test to verify it fails**

Run: `npm run test:api -- tags.service` (from repo root)
Expected: FAIL — `./tags.service` module doesn't exist yet.

- [ ] **Step 9: Implement `TagsService` and `TagsController`**

`apps/api/src/questions/tags.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { TenantPrismaService, TenantContext } from '@exam-platform/shared';

@Injectable()
export class TagsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async list(context: TenantContext) {
    return this.tenantPrisma.forTenant(context, (tx) =>
      tx.tag.findMany({ where: { organizationId: context.organizationId as string }, orderBy: { name: 'asc' } }),
    );
  }
}
```

`apps/api/src/questions/tags.controller.ts`:

```typescript
import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { TenantContext } from '@exam-platform/shared';
import { TagsService } from './tags.service';

@Controller('tags')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TagsController {
  constructor(private readonly tagsService: TagsService) {}

  @Get()
  @RequirePermissions('question_bank:manage')
  list(@CurrentTenant() tenant: TenantContext) {
    return this.tagsService.list(tenant);
  }
}
```

- [ ] **Step 10: Register both in `QuestionsModule`**

Replace `apps/api/src/questions/questions.module.ts` in full:

```typescript
import { Module } from '@nestjs/common';
import { QuestionsController } from './questions.controller';
import { QuestionsService } from './questions.service';
import { TagsController } from './tags.controller';
import { TagsService } from './tags.service';

@Module({
  controllers: [QuestionsController, TagsController],
  providers: [QuestionsService, TagsService],
  exports: [QuestionsService],
})
export class QuestionsModule {}
```

- [ ] **Step 11: Run the test to verify it passes**

Run: `npm run test:api -- tags.service`
Expected: `1 passed`.

- [ ] **Step 12: Extend the question-bank e2e spec**

In `apps/api/test/question-bank.e2e-spec.ts`, add a new test to the `'Question Bank Row-Level Security'` describe block, after the existing `'returns zero rows when no tenant context has been set'` test (inside that same `describe`, so it shares the existing `beforeAll`/`afterAll` org setup):

```typescript
  it('never returns another tenant\'s tags', async () => {
    await tenantPrisma.forTenant({ organizationId: orgAId, isSuperAdmin: false }, (tx) =>
      tx.tag.create({ data: { organizationId: orgAId, name: 'org-a-only-tag' } }),
    );

    const orgBTags = await tenantPrisma.forTenant({ organizationId: orgBId, isSuperAdmin: false }, (tx) => tx.tag.findMany());

    expect(orgBTags).toHaveLength(0);
  });
```

Update that describe block's existing `afterAll` to also clean up tags:

```typescript
  afterAll(async () => {
    await tenantPrisma.forTenant({ organizationId: orgAId, isSuperAdmin: false }, (tx) =>
      tx.question.deleteMany({ where: { organizationId: orgAId } }),
    );
    await tenantPrisma.forTenant({ organizationId: orgAId, isSuperAdmin: false }, (tx) =>
      tx.tag.deleteMany({ where: { organizationId: orgAId } }),
    );
    await prisma.organization.deleteMany({ where: { id: { in: [orgAId, orgBId] } } });
    await prisma.plan.delete({ where: { id: planId } });
    await prisma.$disconnect();
  });
```

In the same file's `'Question Bank HTTP flow'` describe block, extend the existing `'creates, lists, retrieves, updates, and archives a question end-to-end'` test — after the initial create (`createResponse`) and before the `listResponse` fetch, add tag assertions on the create response, then add a tag round-trip via update and the `tagId` filter, and a create-with-tags request:

```typescript
    questionId = createResponse.body.id;
    expect(createResponse.body.options).toHaveLength(2);

    const taggedCreateResponse = await request(app.getHttpServer())
      .post('/api/v1/questions')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({
        type: 'true_false',
        text: 'Is this tagged?',
        difficulty: 'easy',
        marks: 1,
        tags: ['geography', 'geography'],
        options: [{ text: 'True', isCorrect: true }, { text: 'False', isCorrect: false }],
      })
      .expect(201);
    expect(taggedCreateResponse.body.tags).toEqual([{ id: expect.any(String), name: 'geography' }]);
    const geographyTagId = taggedCreateResponse.body.tags[0].id;

    const tagFilteredListResponse = await request(app.getHttpServer())
      .get(`/api/v1/questions?tagId=${geographyTagId}`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(200);
    expect(tagFilteredListResponse.body.map((q: { id: string }) => q.id)).toEqual([taggedCreateResponse.body.id]);

    const tagListResponse = await request(app.getHttpServer())
      .get('/api/v1/tags')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(200);
    expect(tagListResponse.body.map((t: { name: string }) => t.name)).toContain('geography');
```

Then in that same test's existing `updateResponse` call, add `tags: ['geography', 'capitals']` to the sent body, and after the existing `expect(updateResponse.body.marks).toBe(10);` line, add:
```typescript
    expect(updateResponse.body.tags.map((t: { name: string }) => t.name).sort()).toEqual(['capitals', 'geography']);
```

Add cleanup for the newly-created tagged question and its tags in this describe block's existing `afterAll` (alongside the existing `tx.question.deleteMany` call):
```typescript
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) =>
      tx.tag.deleteMany({ where: { organizationId: orgId } }),
    );
```

- [ ] **Step 13: Run the full question-bank e2e spec**

Run: `npm run test:api:e2e -- question-bank` (from repo root)
Expected: all tests pass, including the new tag isolation test and the extended HTTP flow test.

- [ ] **Step 14: Run the full api unit and e2e suites**

Run: `npm run test:api` then `npm run test:api:e2e` (from repo root)
Expected: all suites passing, no regressions.

- [ ] **Step 15: Commit**

```bash
git add apps/api/src/questions apps/api/test/question-bank.e2e-spec.ts
git commit -m "feat: add question tagging (create-on-the-fly Tag resolution, GET /tags, tagId filter)"
```

---

### Task 3: Negative marking in grading

**Files:**
- Modify: `apps/exam-runtime/src/grading/grading.ts`
- Modify: `apps/exam-runtime/src/grading/grading.spec.ts`
- Modify: `apps/exam-runtime/src/grading/attempt-settlement.service.ts`
- Modify: `apps/exam-runtime/src/grading/attempt-settlement.service.spec.ts`
- Modify: `apps/api/test/exam-taking-runtime.e2e-spec.ts`

**Interfaces:**
- Consumes: nothing from Tasks 1-2 (schema/tagging and grading are independent surfaces).
- Produces: `gradeAnswer(question: GradableQuestion, selectedOptionIds: string[])` where `GradableQuestion` now requires `negativeMarks: number`. `computeResult(...)` now floors `score` at 0. No other task depends on these signatures.

- [ ] **Step 1: Write the failing `grading.spec.ts` tests**

Replace `apps/exam-runtime/src/grading/grading.spec.ts` in full:

```typescript
import { gradeAnswer, computeResult, computeRemainingSeconds } from './grading';

describe('gradeAnswer', () => {
  it('awards full marks for an exact single-option match', () => {
    const result = gradeAnswer({ marks: 5, negativeMarks: 0, correctOptionIds: ['opt-a'] }, ['opt-a']);
    expect(result).toEqual({ isCorrect: true, marksAwarded: 5 });
  });

  it('awards zero marks for a wrong single-option selection when negativeMarks is 0', () => {
    const result = gradeAnswer({ marks: 5, negativeMarks: 0, correctOptionIds: ['opt-a'] }, ['opt-b']);
    expect(result).toEqual({ isCorrect: false, marksAwarded: 0 });
  });

  it('awards full marks for an exact multi-option match regardless of order', () => {
    const result = gradeAnswer({ marks: 4, negativeMarks: 0, correctOptionIds: ['opt-a', 'opt-b'] }, ['opt-b', 'opt-a']);
    expect(result).toEqual({ isCorrect: true, marksAwarded: 4 });
  });

  it('awards zero marks for a partial multi-option match (all-or-nothing)', () => {
    const result = gradeAnswer({ marks: 4, negativeMarks: 0, correctOptionIds: ['opt-a', 'opt-b'] }, ['opt-a']);
    expect(result).toEqual({ isCorrect: false, marksAwarded: 0 });
  });

  it('awards zero marks when an extra incorrect option is included alongside the correct ones', () => {
    const result = gradeAnswer({ marks: 4, negativeMarks: 0, correctOptionIds: ['opt-a', 'opt-b'] }, ['opt-a', 'opt-b', 'opt-c']);
    expect(result).toEqual({ isCorrect: false, marksAwarded: 0 });
  });

  it('awards zero marks for an empty selection even when negativeMarks is set (no penalty for skipping)', () => {
    const result = gradeAnswer({ marks: 5, negativeMarks: 2, correctOptionIds: ['opt-a'] }, []);
    expect(result).toEqual({ isCorrect: false, marksAwarded: 0 });
  });

  it('deducts negativeMarks for a wrong selected answer', () => {
    const result = gradeAnswer({ marks: 5, negativeMarks: 2, correctOptionIds: ['opt-a'] }, ['opt-b']);
    expect(result).toEqual({ isCorrect: false, marksAwarded: -2 });
  });

  it('deducts negativeMarks for a partial multi-option selection (still wrong, still attempted)', () => {
    const result = gradeAnswer({ marks: 4, negativeMarks: 1, correctOptionIds: ['opt-a', 'opt-b'] }, ['opt-a']);
    expect(result).toEqual({ isCorrect: false, marksAwarded: -1 });
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

  it('floors a negative raw score at zero instead of returning a negative score or percentage', () => {
    const summary = computeResult([{ marksAwarded: 3 }, { marksAwarded: -5 }], [{ marks: 3 }, { marks: 3 }], 50);
    expect(summary).toEqual({ score: 0, maxScore: 6, percentage: 0, passFail: 'fail' });
  });

  it('does not floor a positive score that is merely reduced by a deduction', () => {
    const summary = computeResult([{ marksAwarded: 5 }, { marksAwarded: -2 }], [{ marks: 5 }, { marks: 5 }], 20);
    expect(summary).toEqual({ score: 3, maxScore: 10, percentage: 30, passFail: 'pass' });
  });
});

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

- [ ] **Step 2: Run the tests to verify the new/changed ones fail**

Run: `npm run test:exam-runtime -- grading.spec` (from repo root)
Expected: FAIL — `gradeAnswer`'s current signature doesn't accept/use `negativeMarks`, and `computeResult` doesn't floor at 0.

- [ ] **Step 3: Implement negative marking and score flooring**

Replace `apps/exam-runtime/src/grading/grading.ts` in full:

```typescript
export interface GradableQuestion {
  marks: number;
  negativeMarks: number;
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
  if (isCorrect) {
    return { isCorrect, marksAwarded: question.marks };
  }
  const attempted = selectedOptionIds.length > 0;
  return { isCorrect, marksAwarded: attempted ? -question.negativeMarks : 0 };
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
  const rawScore = gradedAnswers.reduce((sum, answer) => sum + answer.marksAwarded, 0);
  const score = Math.max(0, rawScore);
  const maxScore = questions.reduce((sum, question) => sum + question.marks, 0);
  const percentage = maxScore > 0 ? (score / maxScore) * 100 : 0;
  const passFail: 'pass' | 'fail' = percentage >= passCriteriaPercent ? 'pass' : 'fail';
  return { score, maxScore, percentage, passFail };
}

export function computeRemainingSeconds(durationMinutes: number, startedAt: Date): number {
  const deadline = new Date(startedAt).getTime() + durationMinutes * 60_000;
  return Math.max(0, Math.round((deadline - Date.now()) / 1000));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:exam-runtime -- grading.spec`
Expected: `16 passed` (8 `gradeAnswer` + 6 `computeResult` + 2 `computeRemainingSeconds`).

- [ ] **Step 5: Wire `negativeMarks` through `attempt-settlement.service.ts`**

In `apps/exam-runtime/src/grading/attempt-settlement.service.ts`, inside `finalize`, update the `gradeAnswer` call:

```typescript
    const gradedAnswers: { marksAwarded: number }[] = [];
    for (const question of questions) {
      const answer = answersByQuestionId.get(question.id);
      const selectedOptionIds: string[] = answer ? JSON.parse(answer.selectedOptionIdsJson) : [];
      const correctOptionIds = question.options.filter((option) => option.isCorrect).map((option) => option.id);
      const { isCorrect, marksAwarded } = gradeAnswer(
        { marks: question.marks, negativeMarks: question.negativeMarks, correctOptionIds },
        selectedOptionIds,
      );
      gradedAnswers.push({ marksAwarded });
      if (answer) {
        await tx.answer.update({ where: { id: answer.id }, data: { isCorrect, marksAwarded } });
      }
    }
```

Nothing else in the file changes — `question.negativeMarks` is already available from the existing `tx.question.findMany(...)` call earlier in `finalize` (the `Question` model already has this column; no new query needed).

- [ ] **Step 6: Update `attempt-settlement.service.spec.ts`'s mocked questions and add a deduction test**

In `apps/exam-runtime/src/grading/attempt-settlement.service.spec.ts`, add `negativeMarks: 0` to every existing mocked question object that currently lacks it (there are 6: in `'grades and transitions an expired in-progress attempt to auto_submitted'`, `'grades an unanswered question as zero marks without creating an answer row'`, `'emits attempt:status to the monitoring gateway after finalizing'`, `'triggers proctoring analysis for the finalized attempt without awaiting it'`, `'does not let a rejected analysis trigger propagate out of finalize'`, `'does not let a rejected broadcast propagate out of finalize'`). For example, the first one becomes:

```typescript
          findMany: jest.fn().mockResolvedValue([
            { id: 'q1', marks: 5, negativeMarks: 0, options: [{ id: 'opt-a', isCorrect: true }, { id: 'opt-b', isCorrect: false }] },
          ]),
```

Apply the same `negativeMarks: 0` addition to every other `{ id: 'q1', marks: 5, options: [...] }` object in the file (they all follow this exact shape).

Then add a new test to the `'finalize'` describe block, after the existing `'grades an unanswered question as zero marks without creating an answer row'` test:

```typescript
    it('deducts negativeMarks for a wrong selected answer through the full settlement path', async () => {
      const attempt = { id: 'attempt-1', questionOrderJson: JSON.stringify(['q1']) };
      const tx = {
        question: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'q1', marks: 5, negativeMarks: 2, options: [{ id: 'opt-a', isCorrect: true }, { id: 'opt-b', isCorrect: false }] },
          ]),
        },
        answer: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'answer-1', questionId: 'q1', selectedOptionIdsJson: JSON.stringify(['opt-b']) },
          ]),
          update: jest.fn(),
        },
        result: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() },
        attempt: { update: jest.fn().mockResolvedValue({ id: 'attempt-1', status: 'submitted' }) },
      };

      await service.finalize(tx as unknown as Prisma.TransactionClient, exam, attempt as any, 'submitted');

      expect(tx.answer.update).toHaveBeenCalledWith({ where: { id: 'answer-1' }, data: { isCorrect: false, marksAwarded: -2 } });
      expect(tx.result.create).toHaveBeenCalledWith({
        data: { attemptId: 'attempt-1', score: 0, maxScore: 5, percentage: 0, passFail: 'fail' },
      });
    });
```

- [ ] **Step 7: Run the exam-runtime unit suite**

Run: `npm run test:exam-runtime` (from repo root)
Expected: all suites passing, including the updated `grading.spec.ts` and `attempt-settlement.service.spec.ts`.

- [ ] **Step 8: Add a negative-marking e2e scenario**

In `apps/api/test/exam-taking-runtime.e2e-spec.ts`, add a new test to the main `describe('Exam-Taking Runtime HTTP flow', ...)` block, after the existing `'rejects redeeming a revoked or expired invitation with a specific error, not a generic 404'` test. This test creates its own dedicated exam (independent of the shared `examId`/questions from `beforeAll`, so it can't affect any existing test's score assertions) with one question worth more than its `negativeMarks` and one worth less, so a candidate who gets both wrong sees a floored-at-zero result — proving both the deduction and the floor in one flow:

```typescript
  it('applies negative marking and floors the total score at zero', async () => {
    const negMarksExamResponse = await request(adminHttp)
      .post('/api/v1/exams')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ title: 'Negative Marking Round' })
      .expect(201);
    const negMarksExamId = negMarksExamResponse.body.id;

    const negMarksSectionResponse = await request(adminHttp)
      .post(`/api/v1/exams/${negMarksExamId}/sections`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ title: 'Section One' })
      .expect(201);
    const negMarksSectionId = negMarksSectionResponse.body.id;

    const easyQuestion = await request(adminHttp)
      .post('/api/v1/questions')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({
        type: 'single_mcq', text: 'Capital of Japan?', difficulty: 'easy', marks: 3, negativeMarks: 1,
        options: [{ text: 'Tokyo', isCorrect: true }, { text: 'Osaka', isCorrect: false }],
      })
      .expect(201);
    const hardQuestion = await request(adminHttp)
      .post('/api/v1/questions')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({
        type: 'single_mcq', text: 'What is the time complexity of binary search?', difficulty: 'hard', marks: 3, negativeMarks: 5,
        options: [{ text: 'O(log n)', isCorrect: true }, { text: 'O(n)', isCorrect: false }],
      })
      .expect(201);

    await request(adminHttp)
      .put(`/api/v1/exams/${negMarksExamId}/sections/${negMarksSectionId}/questions`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ questionIds: [easyQuestion.body.id, hardQuestion.body.id] })
      .expect(200);

    await request(adminHttp)
      .post(`/api/v1/exams/${negMarksExamId}/publish`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(201);

    const frankCandidate = await request(adminHttp)
      .post('/api/v1/candidates')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ email: 'frank@ci-attempt.test', name: 'Frank' })
      .expect(201);

    const frankInvite = await request(adminHttp)
      .post(`/api/v1/exams/${negMarksExamId}/invitations`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ candidateIds: [frankCandidate.body.id] })
      .expect(201);
    const frankToken = frankInvite.body.created[0].token;

    const frankRedeem = await request(runtimeHttp).post('/api/v1/candidate-auth/redeem').send({ token: frankToken }).expect(200);
    const frankAccessToken = frankRedeem.body.accessToken;

    await request(runtimeHttp).post('/api/v1/attempt/start').set('Authorization', `Bearer ${frankAccessToken}`).expect(201);

    const correctEasyOptionId = easyQuestion.body.options.find((o: { text: string }) => o.text === 'Tokyo').id;
    const wrongHardOptionId = hardQuestion.body.options.find((o: { text: string }) => o.text === 'O(n)').id;

    await request(runtimeHttp)
      .post('/api/v1/attempt/answer')
      .set('Authorization', `Bearer ${frankAccessToken}`)
      .send({ questionId: easyQuestion.body.id, selectedOptionIds: [correctEasyOptionId] })
      .expect(201);

    await request(runtimeHttp)
      .post('/api/v1/attempt/answer')
      .set('Authorization', `Bearer ${frankAccessToken}`)
      .send({ questionId: hardQuestion.body.id, selectedOptionIds: [wrongHardOptionId] })
      .expect(201);

    await request(runtimeHttp).post('/api/v1/attempt/submit').set('Authorization', `Bearer ${frankAccessToken}`).expect(201);

    const resultsResponse = await request(adminHttp)
      .get(`/api/v1/exams/${negMarksExamId}/results`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(200);
    const frankResult = resultsResponse.body.find((row: { candidateName: string }) => row.candidateName === 'Frank');

    // Raw score: +3 (correct easy) - 5 (wrong hard) = -2, floored to 0.
    expect(frankResult.score).toBe(0);
    expect(frankResult.maxScore).toBe(6);
    expect(frankResult.percentage).toBe(0);
    expect(frankResult.passFail).toBe('fail');
  });
```

No new cleanup is needed — this test's exam/questions/candidate are created under the same `orgId` the file's existing `afterAll` already deletes by `organizationId`.

- [ ] **Step 9: Run the exam-taking-runtime e2e spec**

Run: `npm run test:api:e2e -- exam-taking-runtime` (from repo root)
Expected: all tests pass, including the new negative-marking scenario.

- [ ] **Step 10: Run the full exam-runtime and api suites**

Run: `npm run test:exam-runtime`, `npm run test:api`, `npm run test:api:e2e` (from repo root)
Expected: all suites passing, no regressions.

- [ ] **Step 11: Commit**

```bash
git add apps/exam-runtime/src/grading apps/api/test/exam-taking-runtime.e2e-spec.ts
git commit -m "feat: wire Question.negativeMarks into grading, floor attempt score at zero"
```

---

### Task 4: Final verification

**Files:** none — this task runs the full regression suite and confirms end-to-end wiring; no code changes expected unless verification surfaces a real gap, in which case follow the same TDD pattern as the task where the gap belongs.

**Interfaces:** none — this task consumes the full surface built across Tasks 1-3.

- [ ] **Step 1: Run the full exam-runtime unit suite**

Run: `npm run test:exam-runtime` (from repo root)
Expected: all suites passing.

- [ ] **Step 2: Run the full api unit suite**

Run: `npm run test:api` (from repo root)
Expected: all suites passing.

- [ ] **Step 3: Run the full api e2e suite**

Run: `npm run test:api:e2e` (from repo root)
Expected: all suites passing, including `question-bank` (tag isolation + HTTP flow) and `exam-taking-runtime` (negative marking + floor-at-zero).

- [ ] **Step 4: Build both apps cleanly**

Run: `npx nest build` from `apps/exam-runtime/`, then from `apps/api/`.
Expected: both build with no errors.

- [ ] **Step 5: Confirm migration status is clean**

Run (from `apps/api/`): `npx prisma migrate status`
Expected: reports all migrations applied, no drift.

- [ ] **Step 6: Record final verification (no commit needed for this task — it's verification-only)**

If Steps 1-5 all pass cleanly, Phase 4a's implementation is complete and ready for the final whole-branch review.
