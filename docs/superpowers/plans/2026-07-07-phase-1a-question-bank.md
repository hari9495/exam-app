# Phase 1a — Question Bank Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a Recruiter a tested API to create, list, view, update, and archive MCQ questions (Single-correct, Multiple-correct, True/False) in their organization's question bank, with the same database-level tenant isolation established in Phase 0.

**Architecture:** Two new Prisma models (`Question`, `QuestionOption`) added to the existing Phase 0 schema, protected by extending the existing SQL Server Row-Level Security policy (`TenantAccessPolicy`) to cover `questions`. A `QuestionsModule` (service + controller + DTOs) follows the exact same pattern as Phase 0's `OrganizationsModule`/`UsersModule`: every `questions`-table access goes through `TenantPrismaService.forTenant()`, RBAC-guarded via a new `question_bank:manage` permission.

**Tech Stack:** Same as Phase 0 — NestJS, Prisma (`sqlserver` provider), SQL Server, Jest/Supertest. No new dependencies.

## Global Constraints

- All primary keys and organization-scoping foreign keys are `@db.UniqueIdentifier` in Prisma (maps to SQL Server `UNIQUEIDENTIFIER`) — never a plain `String` with no native-type annotation. Getting this wrong was a real bug in Phase 0 (Prisma defaults SQL Server `String` to `NVARCHAR(1000)`).
- **Every service method that queries `questions` MUST go through `TenantPrismaService.forTenant()`** (`apps/api/src/prisma/tenant-prisma.service.ts`), never the raw `PrismaService` directly. This is the single most important lesson from Phase 0: `sp_set_session_context` (which SQL Server RLS reads) is scoped to the physical database connection, not to any Prisma transaction, and Prisma pools connections across separate top-level calls. This exact bug was found and fixed three times in Phase 0. If a single unit of work needs to check a row exists AND then mutate it, do both inside the SAME `forTenant` callback — do not split them across two separate `forTenant` calls.
- Migrations are applied with `npx prisma migrate deploy`, **never** `npx prisma migrate dev` (the `examapp_dev` database login lacks `CREATE DATABASE` permission needed for `migrate dev`'s shadow database). `migrate dev --create-only` is safe to use for *generating* migration SQL (it doesn't touch the shadow DB), but the actual apply step must be `migrate deploy`, followed by an explicit `npx prisma generate` (unlike `migrate dev`, `migrate deploy` does not auto-generate the Prisma Client).
- Required (non-optional) `class-validator` DTO properties must use a definite-assignment assertion (`email!: string;`), not a bare `email: string;` — the root `tsconfig.base.json`'s `strict: true` enables `strictPropertyInitialization`, which breaks `nest build`/`tsc --noEmit` (though not `ts-jest`) otherwise.
- No hard `DELETE` on `questions` — only soft-delete via `status: 'archived'`.
- No rich text, images, math equations, bulk import/export, AI generation, or a reusable tag system in this sub-phase — see the design spec's "Open Items" section for what's deferred and why.
- Full spec: `docs/superpowers/specs/2026-07-07-phase-1a-question-bank-design.md`. Full Phase 0 history/context: `memory.md` at repo root.

---

## File Structure

```
apps/api/
  prisma/
    schema.prisma                              # Modify: add Question, QuestionOption models
    migrations/
      <timestamp>_question_bank_schema/
        migration.sql                          # Create: questions, question_options tables
      <timestamp>_question_bank_rls/
        migration.sql                          # Create: extend TenantAccessPolicy to questions
    seed.ts                                     # Modify: add question_bank:manage permission + grant to recruiter
  src/
    auth/
      current-user-id.decorator.ts              # Create: extracts request.user.userId
    questions/
      question-validation.ts                    # Create: pure validation function, no DB/DI
      question-validation.spec.ts                # Create: unit tests for validation rules
      questions.service.ts                       # Create: CRUD via TenantPrismaService
      questions.service.spec.ts                   # Create: unit tests, mocked TenantPrismaService
      questions.controller.ts                     # Create: HTTP routes, RBAC-guarded
      questions.module.ts                         # Create: wires service+controller
      dto/
        create-question.dto.ts                    # Create: request shape for POST /questions
        update-question.dto.ts                     # Create: request shape for PATCH /questions/:id
    app.module.ts                                # Modify: register QuestionsModule
  test/
    question-bank.e2e-spec.ts                    # Create: tenant isolation + full HTTP CRUD flow + RBAC negative case
```

---

### Task 1: Prisma schema and migration for Question/QuestionOption

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_question_bank_schema/migration.sql`

**Interfaces:**
- Produces: Prisma models `Question` (fields: `id`, `organizationId`, `type`, `text`, `topic`, `category`, `difficulty`, `marks`, `negativeMarks`, `status`, `createdBy`, `createdAt`, relation `options`) and `QuestionOption` (fields: `id`, `questionId`, `text`, `isCorrect`, `orderIndex`) — every later task in this plan relies on these exact field names.

- [ ] **Step 1: Add the models to schema.prisma**

Add to `apps/api/prisma/schema.prisma` (after the existing `AuditLog` model):

```prisma
model Question {
  id             String           @id @default(uuid()) @db.UniqueIdentifier
  organizationId String           @map("organization_id") @db.UniqueIdentifier
  type           String
  text           String           @db.NVarChar(Max)
  topic          String?
  category       String?
  difficulty     String
  marks          Int
  negativeMarks  Int              @default(0) @map("negative_marks")
  status         String           @default("active")
  createdBy      String           @map("created_by") @db.UniqueIdentifier
  createdAt      DateTime         @default(now()) @map("created_at")
  options        QuestionOption[]

  @@index([organizationId, topic, difficulty])
  @@map("questions")
}

model QuestionOption {
  id         String   @id @default(uuid()) @db.UniqueIdentifier
  questionId String   @map("question_id") @db.UniqueIdentifier
  text       String
  isCorrect  Boolean  @map("is_correct")
  orderIndex Int      @map("order_index")
  question   Question @relation(fields: [questionId], references: [id], onDelete: Cascade)

  @@index([questionId])
  @@map("question_options")
}
```

Note: `createdBy` is deliberately a plain `UniqueIdentifier` column, not a `@relation` to `User` — matching the existing `AuditLog.actorUserId` pattern (a loosely-tracked reference, not a hard FK), which avoids any cascade-ordering complexity between `questions` and `users`.

- [ ] **Step 2: Generate the migration**

Run (from `apps/api/`): `npx prisma migrate dev --create-only --name question_bank_schema`
Expected: a new folder `apps/api/prisma/migrations/<timestamp>_question_bank_schema/migration.sql` is created with `CREATE TABLE` statements for `questions` and `question_options`, plus the FK and indexes. This step only generates SQL from the schema diff — it doesn't apply anything, so it's safe despite the shadow-database permission limitation (if it still fails with a P3014/permission error, hand-write the migration SQL directly, modeled on the existing `apps/api/prisma/migrations/20260707104325_init_schema/migration.sql` file's style, with these two tables).

- [ ] **Step 3: Apply the migration**

Run: `npx prisma migrate deploy` (never `migrate dev` for applying — see Global Constraints), then `npx prisma generate`.
Expected: migration applies cleanly; `@prisma/client` types now include `Question` and `QuestionOption`.

- [ ] **Step 4: Verify against the real database**

Run: `sqlcmd -S localhost,1433 -U examapp_dev -P 'DevPassw0rd!2026' -d examapp -Q "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME IN ('questions','question_options')" -C`
Expected: both table names returned.

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat: add Question and QuestionOption schema for Phase 1a question bank"
```

---

### Task 2: Row-Level Security on the questions table

**Files:**
- Create: `apps/api/prisma/migrations/<timestamp>_question_bank_rls/migration.sql`

**Interfaces:**
- Consumes: the existing `dbo.fn_tenant_access_predicate(@OrgId UNIQUEIDENTIFIER)` function and `dbo.TenantAccessPolicy` security policy created in Phase 0 (Task 4) — this task extends that same policy to a new table, it does not create a new function or policy.
- Produces: `questions` is now RLS-protected — a query with no tenant session context set returns zero rows; a query scoped to the wrong organization never sees another organization's questions.

- [ ] **Step 1: Write the migration**

`apps/api/prisma/migrations/<timestamp>_question_bank_rls/migration.sql`:
```sql
ALTER SECURITY POLICY dbo.TenantAccessPolicy
ADD FILTER PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.questions,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.questions AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.questions AFTER UPDATE;
```

Note: no `WITH (STATE = ON)` needed — the policy is already enabled from Phase 0; this only adds predicates to it. No `GO` batch separator needed — this is a single statement, and (per Phase 0's established constraint) `prisma migrate deploy` sends each migration file as one batch anyway.

Since Prisma can't diff a raw `ALTER SECURITY POLICY` statement from schema changes, create this migration folder and file by hand (do not run `prisma migrate dev --create-only` for this one — it would produce an empty diff since no Prisma-visible schema changed). Use a timestamp that sorts after Task 1's migration folder.

- [ ] **Step 2: Apply the migration**

Run: `npx prisma migrate deploy` (from `apps/api/`)
Expected: applies cleanly. Run `npx prisma migrate status` to confirm — should report all migrations applied, no drift.

- [ ] **Step 3: Write a failing isolation test to verify the policy works**

`apps/api/test/question-bank.e2e-spec.ts` (this file is completed fully in Task 6 — for this step, write ONLY the isolation-proving portion below and run it standalone to prove the RLS policy itself works before building the service/controller on top of it):

```typescript
import { Test } from '@nestjs/testing';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantPrismaService } from '../src/prisma/tenant-prisma.service';
import { PrismaModule } from '../src/prisma/prisma.module';
import { randomUUID } from 'crypto';

describe('Question Bank Row-Level Security', () => {
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
      data: { name: `qb-rls-plan-${randomUUID()}`, candidateLimit: 10, aiCreditLimit: 1, proctoringMinutesLimit: 1 },
    });
    planId = plan.id;

    const orgA = await prisma.organization.create({ data: { name: 'QB Org A', slug: `qb-org-a-${randomUUID()}`, planId } });
    const orgB = await prisma.organization.create({ data: { name: 'QB Org B', slug: `qb-org-b-${randomUUID()}`, planId } });
    orgAId = orgA.id;
    orgBId = orgB.id;

    await tenantPrisma.forTenant({ organizationId: orgAId, isSuperAdmin: false }, (tx) =>
      tx.question.create({
        data: {
          organizationId: orgAId,
          type: 'true_false',
          text: 'Org A question',
          difficulty: 'easy',
          marks: 1,
          createdBy: randomUUID(),
          options: { create: [{ text: 'True', isCorrect: true, orderIndex: 0 }, { text: 'False', isCorrect: false, orderIndex: 1 }] },
        },
      }),
    );
  });

  afterAll(async () => {
    await tenantPrisma.forTenant({ organizationId: orgAId, isSuperAdmin: false }, (tx) =>
      tx.question.deleteMany({ where: { organizationId: orgAId } }),
    );
    await prisma.organization.deleteMany({ where: { id: { in: [orgAId, orgBId] } } });
    await prisma.plan.delete({ where: { id: planId } });
    await prisma.$disconnect();
  });

  it('never returns another tenant\'s questions', async () => {
    const orgBQuestions = await tenantPrisma.forTenant({ organizationId: orgBId, isSuperAdmin: false }, (tx) =>
      tx.question.findMany(),
    );
    expect(orgBQuestions).toHaveLength(0);
  });

  it('returns zero rows when no tenant context has been set', async () => {
    const rows = await prisma.question.findMany({ where: { organizationId: orgAId } });
    expect(rows).toHaveLength(0);
  });
});
```

- [ ] **Step 4: Run it to confirm the RLS policy actually works**

Run: `npm run test:api:e2e -- question-bank`
Expected: `2 passed`. If either fails, the policy did not apply correctly — re-check Step 1 before continuing; this is the core security guarantee for this table and must be green before Task 3 onward.

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/migrations apps/api/test/question-bank.e2e-spec.ts
git commit -m "feat: extend Row-Level Security policy to the questions table"
```

---

### Task 3: Question validation logic

**Files:**
- Create: `apps/api/src/questions/question-validation.ts`
- Create: `apps/api/src/questions/question-validation.spec.ts`

**Interfaces:**
- Produces: `validateQuestionPayload(input: QuestionValidationInput): void` — throws `BadRequestException` on any invalid combination; returns nothing on success. `QuestionValidationInput` and `QuestionOptionInput` types, both exported, are consumed by Task 4's `QuestionsService`.

- [ ] **Step 1: Write the failing tests**

`apps/api/src/questions/question-validation.spec.ts`:
```typescript
import { BadRequestException } from '@nestjs/common';
import { validateQuestionPayload } from './question-validation';

describe('validateQuestionPayload', () => {
  const base = { marks: 5, negativeMarks: 1 };

  it('accepts a valid single_mcq question', () => {
    expect(() =>
      validateQuestionPayload({
        ...base,
        type: 'single_mcq',
        difficulty: 'easy',
        options: [
          { text: 'A', isCorrect: true },
          { text: 'B', isCorrect: false },
        ],
      }),
    ).not.toThrow();
  });

  it('rejects single_mcq with 0 correct options', () => {
    expect(() =>
      validateQuestionPayload({
        ...base,
        type: 'single_mcq',
        difficulty: 'easy',
        options: [
          { text: 'A', isCorrect: false },
          { text: 'B', isCorrect: false },
        ],
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects single_mcq with 2 correct options', () => {
    expect(() =>
      validateQuestionPayload({
        ...base,
        type: 'single_mcq',
        difficulty: 'easy',
        options: [
          { text: 'A', isCorrect: true },
          { text: 'B', isCorrect: true },
        ],
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects single_mcq with fewer than 2 options', () => {
    expect(() =>
      validateQuestionPayload({
        ...base,
        type: 'single_mcq',
        difficulty: 'easy',
        options: [{ text: 'A', isCorrect: true }],
      }),
    ).toThrow(BadRequestException);
  });

  it('accepts a valid multi_mcq question with multiple correct options', () => {
    expect(() =>
      validateQuestionPayload({
        ...base,
        type: 'multi_mcq',
        difficulty: 'medium',
        options: [
          { text: 'A', isCorrect: true },
          { text: 'B', isCorrect: true },
          { text: 'C', isCorrect: false },
        ],
      }),
    ).not.toThrow();
  });

  it('rejects multi_mcq with 0 correct options', () => {
    expect(() =>
      validateQuestionPayload({
        ...base,
        type: 'multi_mcq',
        difficulty: 'medium',
        options: [
          { text: 'A', isCorrect: false },
          { text: 'B', isCorrect: false },
        ],
      }),
    ).toThrow(BadRequestException);
  });

  it('accepts a valid true_false question', () => {
    expect(() =>
      validateQuestionPayload({
        ...base,
        type: 'true_false',
        difficulty: 'easy',
        options: [
          { text: 'True', isCorrect: true },
          { text: 'False', isCorrect: false },
        ],
      }),
    ).not.toThrow();
  });

  it('rejects true_false with anything other than 2 options', () => {
    expect(() =>
      validateQuestionPayload({
        ...base,
        type: 'true_false',
        difficulty: 'easy',
        options: [{ text: 'True', isCorrect: true }],
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects true_false with 0 correct options', () => {
    expect(() =>
      validateQuestionPayload({
        ...base,
        type: 'true_false',
        difficulty: 'easy',
        options: [
          { text: 'True', isCorrect: false },
          { text: 'False', isCorrect: false },
        ],
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects an unknown question type', () => {
    expect(() =>
      validateQuestionPayload({
        ...base,
        type: 'fill_in_blank',
        difficulty: 'easy',
        options: [
          { text: 'A', isCorrect: true },
          { text: 'B', isCorrect: false },
        ],
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects marks of 0 or less', () => {
    expect(() =>
      validateQuestionPayload({
        type: 'true_false',
        difficulty: 'easy',
        marks: 0,
        negativeMarks: 0,
        options: [
          { text: 'True', isCorrect: true },
          { text: 'False', isCorrect: false },
        ],
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects negativeMarks less than 0', () => {
    expect(() =>
      validateQuestionPayload({
        type: 'true_false',
        difficulty: 'easy',
        marks: 2,
        negativeMarks: -1,
        options: [
          { text: 'True', isCorrect: true },
          { text: 'False', isCorrect: false },
        ],
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects negativeMarks greater than marks', () => {
    expect(() =>
      validateQuestionPayload({
        type: 'true_false',
        difficulty: 'easy',
        marks: 2,
        negativeMarks: 3,
        options: [
          { text: 'True', isCorrect: true },
          { text: 'False', isCorrect: false },
        ],
      }),
    ).toThrow(BadRequestException);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:api -- question-validation`
Expected: FAIL — `validateQuestionPayload` is not defined yet.

- [ ] **Step 3: Write the implementation**

`apps/api/src/questions/question-validation.ts`:
```typescript
import { BadRequestException } from '@nestjs/common';

export interface QuestionOptionInput {
  text: string;
  isCorrect: boolean;
}

export interface QuestionValidationInput {
  type: string;
  difficulty: string;
  marks: number;
  negativeMarks: number;
  options: QuestionOptionInput[];
}

const VALID_TYPES = ['single_mcq', 'multi_mcq', 'true_false'];
const VALID_DIFFICULTIES = ['easy', 'medium', 'hard'];

export function validateQuestionPayload(input: QuestionValidationInput): void {
  const { type, difficulty, marks, negativeMarks, options } = input;

  if (!VALID_TYPES.includes(type)) {
    throw new BadRequestException(`Unknown question type: ${type}`);
  }
  if (!VALID_DIFFICULTIES.includes(difficulty)) {
    throw new BadRequestException(`Unknown difficulty: ${difficulty}`);
  }
  if (marks <= 0) {
    throw new BadRequestException('marks must be greater than 0');
  }
  if (negativeMarks < 0) {
    throw new BadRequestException('negativeMarks must be 0 or greater');
  }
  if (negativeMarks > marks) {
    throw new BadRequestException('negativeMarks cannot exceed marks');
  }

  const correctCount = options.filter((o) => o.isCorrect).length;

  if (type === 'true_false') {
    if (options.length !== 2) {
      throw new BadRequestException('true_false questions must have exactly 2 options');
    }
    if (correctCount !== 1) {
      throw new BadRequestException('true_false questions must have exactly 1 correct option');
    }
  } else if (type === 'single_mcq') {
    if (options.length < 2) {
      throw new BadRequestException('single_mcq questions must have at least 2 options');
    }
    if (correctCount !== 1) {
      throw new BadRequestException('single_mcq questions must have exactly 1 correct option');
    }
  } else if (type === 'multi_mcq') {
    if (options.length < 2) {
      throw new BadRequestException('multi_mcq questions must have at least 2 options');
    }
    if (correctCount < 1) {
      throw new BadRequestException('multi_mcq questions must have at least 1 correct option');
    }
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:api -- question-validation`
Expected: `13 passed`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/questions/question-validation.ts apps/api/src/questions/question-validation.spec.ts
git commit -m "feat: add question payload validation rules (option counts, marks)"
```

---

### Task 4: QuestionsService

**Files:**
- Create: `apps/api/src/questions/questions.service.ts`
- Create: `apps/api/src/questions/questions.service.spec.ts`

**Interfaces:**
- Consumes: `TenantPrismaService.forTenant` (Phase 0), `validateQuestionPayload` (Task 3, exact signature above).
- Produces: `QuestionsService.create(context, userId, dto)`, `.list(context, filters)`, `.findOne(context, id)`, `.update(context, id, dto)`, `.archive(context, id)` — Task 5's controller calls these exact method names.

- [ ] **Step 1: Write the DTOs first (needed by the service's type signatures)**

`apps/api/src/questions/dto/create-question.dto.ts`:
```typescript
import { ArrayMinSize, IsBoolean, IsIn, IsInt, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
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

  @ValidateNested({ each: true })
  @Type(() => QuestionOptionDto)
  @ArrayMinSize(1)
  options!: QuestionOptionDto[];
}
```

`apps/api/src/questions/dto/update-question.dto.ts`:
```typescript
import { CreateQuestionDto } from './create-question.dto';

export class UpdateQuestionDto extends CreateQuestionDto {}
```

Note: `UpdateQuestionDto` is a full replace, not a partial patch — a PATCH request must send the complete question (all fields, all options), which are then fully re-validated and the options fully replaced. This is a deliberate simplification for this sub-phase (avoids partial-merge logic); revisit only if a future UI need requires true partial updates.

- [ ] **Step 2: Write the failing unit tests for the service**

`apps/api/src/questions/questions.service.spec.ts`:
```typescript
import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { QuestionsService } from './questions.service';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';

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
    const created = { id: 'q-1', organizationId: 'org-1', ...validDto, options: validDto.options };
    tenantPrisma.forTenant.mockResolvedValue(created);

    const result = await service.create(context, 'user-1', validDto);

    expect(result).toEqual(created);
    expect(tenantPrisma.forTenant).toHaveBeenCalledWith(context, expect.any(Function));
  });

  it('rejects an invalid payload before touching the database', async () => {
    const invalidDto = { ...validDto, options: [{ text: '4', isCorrect: false }, { text: '3', isCorrect: false }] };

    await expect(service.create(context, 'user-1', invalidDto)).rejects.toThrow(BadRequestException);
    expect(tenantPrisma.forTenant).not.toHaveBeenCalled();
  });

  it('lists questions scoped to the caller\'s organization, defaulting to active status', async () => {
    tenantPrisma.forTenant.mockResolvedValue([{ id: 'q-1', status: 'active' }]);

    const result = await service.list(context, {});

    expect(result).toHaveLength(1);
    expect(tenantPrisma.forTenant).toHaveBeenCalledWith(context, expect.any(Function));
  });

  it('throws NotFoundException when findOne cannot find the question', async () => {
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn({ question: { findFirst: jest.fn().mockResolvedValue(null) } }));

    await expect(service.findOne(context, 'missing-id')).rejects.toThrow(NotFoundException);
  });

  it('archives a question by setting status to archived', async () => {
    const tx = {
      question: {
        findFirst: jest.fn().mockResolvedValue({ id: 'q-1' }),
        update: jest.fn().mockResolvedValue({ id: 'q-1', status: 'archived' }),
      },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    const result = await service.archive(context, 'q-1');

    expect(result.status).toBe('archived');
    expect(tx.question.update).toHaveBeenCalledWith({
      where: { id: 'q-1' },
      data: { status: 'archived' },
      include: { options: true },
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

Run: `npm run test:api -- questions.service`
Expected: FAIL — `QuestionsService` is not defined yet.

- [ ] **Step 4: Implement the service**

`apps/api/src/questions/questions.service.ts`:
```typescript
import { Injectable, NotFoundException } from '@nestjs/common';
import { Question, QuestionOption } from '@prisma/client';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { TenantContext } from '../prisma/tenant-context';
import { CreateQuestionDto } from './dto/create-question.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';
import { validateQuestionPayload } from './question-validation';

type QuestionWithOptions = Question & { options: QuestionOption[] };

interface QuestionFilters {
  topic?: string;
  difficulty?: string;
  status?: string;
  limit?: number;
  cursor?: string;
}

@Injectable()
export class QuestionsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async create(context: TenantContext, userId: string, dto: CreateQuestionDto): Promise<QuestionWithOptions> {
    validateQuestionPayload({
      type: dto.type,
      difficulty: dto.difficulty,
      marks: dto.marks,
      negativeMarks: dto.negativeMarks ?? 0,
      options: dto.options,
    });

    return this.tenantPrisma.forTenant(context, (tx) =>
      tx.question.create({
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
        },
        include: { options: true },
      }),
    );
  }

  async list(context: TenantContext, filters: QuestionFilters): Promise<Question[]> {
    const limit = filters.limit && filters.limit > 0 && filters.limit <= 100 ? filters.limit : 20;
    return this.tenantPrisma.forTenant(context, (tx) =>
      tx.question.findMany({
        where: {
          organizationId: context.organizationId,
          ...(filters.topic ? { topic: filters.topic } : {}),
          ...(filters.difficulty ? { difficulty: filters.difficulty } : {}),
          status: filters.status ?? 'active',
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit,
        ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
      }),
    );
  }

  async findOne(context: TenantContext, id: string): Promise<QuestionWithOptions> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const question = await tx.question.findFirst({
        where: { id, organizationId: context.organizationId },
        include: { options: true },
      });
      if (!question) {
        throw new NotFoundException(`Question ${id} not found`);
      }
      return question;
    });
  }

  async update(context: TenantContext, id: string, dto: UpdateQuestionDto): Promise<QuestionWithOptions> {
    validateQuestionPayload({
      type: dto.type,
      difficulty: dto.difficulty,
      marks: dto.marks,
      negativeMarks: dto.negativeMarks ?? 0,
      options: dto.options,
    });

    return this.tenantPrisma.forTenant(context, async (tx) => {
      const existing = await tx.question.findFirst({ where: { id, organizationId: context.organizationId } });
      if (!existing) {
        throw new NotFoundException(`Question ${id} not found`);
      }

      await tx.questionOption.deleteMany({ where: { questionId: id } });

      return tx.question.update({
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
        },
        include: { options: true },
      });
    });
  }

  async archive(context: TenantContext, id: string): Promise<QuestionWithOptions> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const existing = await tx.question.findFirst({ where: { id, organizationId: context.organizationId } });
      if (!existing) {
        throw new NotFoundException(`Question ${id} not found`);
      }
      return tx.question.update({
        where: { id },
        data: { status: 'archived' },
        include: { options: true },
      });
    });
  }
}
```

Note: `update` and `archive` both do their existence check and their mutation inside the SAME `forTenant` callback — not as two separate `forTenant` calls — so the whole "find-or-404, then mutate" unit of work runs on one reserved connection. This is both more efficient and avoids any risk of the two steps disagreeing about tenant context.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test:api -- questions.service`
Expected: `6 passed`.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/questions/dto apps/api/src/questions/questions.service.ts apps/api/src/questions/questions.service.spec.ts
git commit -m "feat: add QuestionsService with tenant-scoped CRUD"
```

---

### Task 5: QuestionsController, RBAC wiring, and seed permission

**Files:**
- Create: `apps/api/src/auth/current-user-id.decorator.ts`
- Create: `apps/api/src/questions/questions.controller.ts`
- Create: `apps/api/src/questions/questions.module.ts`
- Modify: `apps/api/prisma/seed.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `QuestionsService` (Task 4), `JwtAuthGuard`/`PermissionsGuard`/`RequirePermissions`/`CurrentTenant` (Phase 0).
- Produces: HTTP routes under `/questions`, gated by a new `question_bank:manage` permission, granted to the `recruiter` role.

- [ ] **Step 1: Add the CurrentUserId decorator**

`apps/api/src/auth/current-user-id.decorator.ts`:
```typescript
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentUserId = createParamDecorator((_: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest();
  return request.user?.userId;
});
```

- [ ] **Step 2: Write the controller**

`apps/api/src/questions/questions.controller.ts`:
```typescript
import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { TenantContext } from '../prisma/tenant-context';
import { QuestionsService } from './questions.service';
import { CreateQuestionDto } from './dto/create-question.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';

@Controller('questions')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class QuestionsController {
  constructor(private readonly questionsService: QuestionsService) {}

  @Post()
  @RequirePermissions('question_bank:manage')
  create(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Body() dto: CreateQuestionDto) {
    return this.questionsService.create(tenant, userId, dto);
  }

  @Get()
  @RequirePermissions('question_bank:manage')
  list(
    @CurrentTenant() tenant: TenantContext,
    @Query('topic') topic?: string,
    @Query('difficulty') difficulty?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.questionsService.list(tenant, { topic, difficulty, status, limit: limit ? parseInt(limit, 10) : undefined, cursor });
  }

  @Get(':id')
  @RequirePermissions('question_bank:manage')
  findOne(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.questionsService.findOne(tenant, id);
  }

  @Patch(':id')
  @RequirePermissions('question_bank:manage')
  update(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: UpdateQuestionDto) {
    return this.questionsService.update(tenant, id, dto);
  }

  @Post(':id/archive')
  @RequirePermissions('question_bank:manage')
  archive(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.questionsService.archive(tenant, id);
  }
}
```

Note: `@RequirePermissions` is applied per-method, not once at the class level — `PermissionsGuard` (Phase 0) reads metadata via `reflector.get(PERMISSIONS_KEY, context.getHandler())`, which only sees method-level decorators, not class-level ones. This matches the exact pattern already used in `OrganizationsController`/`UsersController`.

- [ ] **Step 3: Write the module**

`apps/api/src/questions/questions.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { QuestionsController } from './questions.controller';
import { QuestionsService } from './questions.service';

@Module({
  controllers: [QuestionsController],
  providers: [QuestionsService],
  exports: [QuestionsService],
})
export class QuestionsModule {}
```

- [ ] **Step 4: Add the permission to the seed script**

In `apps/api/prisma/seed.ts`, add `'question_bank:manage'` to the `PERMISSIONS` array:
```typescript
const PERMISSIONS = [
  { key: 'platform:manage_organizations', description: 'Create and manage organizations (Super Admin only)' },
  { key: 'org:manage_users', description: 'Invite and manage users within an organization' },
  { key: 'org:manage_settings', description: 'Edit organization branding/domain/security settings' },
  { key: 'org:view', description: 'View organization dashboard and data' },
  { key: 'question_bank:manage', description: 'Create, edit, and archive questions in the organization\'s question bank' },
];
```

And add it to the `recruiter` entry in `ROLE_PERMISSIONS`:
```typescript
const ROLE_PERMISSIONS: Record<string, string[]> = {
  super_admin: ['platform:manage_organizations', 'org:manage_users', 'org:manage_settings', 'org:view'],
  org_admin: ['org:manage_users', 'org:manage_settings', 'org:view'],
  recruiter: ['org:view', 'question_bank:manage'],
  panel: ['org:view'],
};
```

Run: `npx prisma db seed` (from `apps/api/`) to apply the new permission to the existing seeded database.
Expected: runs without error (idempotent — existing `upsert` calls handle the new permission/grant cleanly).

- [ ] **Step 5: Register the module in AppModule**

In `apps/api/src/app.module.ts`, add `QuestionsModule` to the imports:
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
  ],
})
export class AppModule {}
```

- [ ] **Step 6: Run the full unit suite and build check**

Run: `npm run test:api` (from repo root) — expect all suites passing, no regressions.
Run: `npx nest build` (from `apps/api/`) — expect a clean build with `QuestionsModule` wired in.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/auth/current-user-id.decorator.ts apps/api/src/questions/questions.controller.ts apps/api/src/questions/questions.module.ts apps/api/prisma/seed.ts apps/api/src/app.module.ts
git commit -m "feat: add QuestionsController with RBAC, seed question_bank:manage permission, wire into AppModule"
```

---

### Task 6: End-to-end test — full CRUD flow, tenant isolation, RBAC denial

**Files:**
- Modify: `apps/api/test/question-bank.e2e-spec.ts` (Task 2 already created this file with the isolation-only tests; this task completes it with the full HTTP flow)

**Interfaces:**
- Consumes: the full `QuestionsController` HTTP surface (Task 5), the real `AuthService` login flow (Phase 0), the real seeded `recruiter`/`org_admin` roles and `question_bank:manage` permission (Task 5).

- [ ] **Step 1: Replace the file with the complete test**

`apps/api/test/question-bank.e2e-spec.ts` (full replacement — includes the Task 2 isolation tests plus the new HTTP flow and RBAC tests):
```typescript
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantPrismaService } from '../src/prisma/tenant-prisma.service';

describe('Question Bank Row-Level Security', () => {
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
      data: { name: `qb-rls-plan-${randomUUID()}`, candidateLimit: 10, aiCreditLimit: 1, proctoringMinutesLimit: 1 },
    });
    planId = plan.id;

    const orgA = await prisma.organization.create({ data: { name: 'QB Org A', slug: `qb-org-a-${randomUUID()}`, planId } });
    const orgB = await prisma.organization.create({ data: { name: 'QB Org B', slug: `qb-org-b-${randomUUID()}`, planId } });
    orgAId = orgA.id;
    orgBId = orgB.id;

    await tenantPrisma.forTenant({ organizationId: orgAId, isSuperAdmin: false }, (tx) =>
      tx.question.create({
        data: {
          organizationId: orgAId,
          type: 'true_false',
          text: 'Org A question',
          difficulty: 'easy',
          marks: 1,
          createdBy: randomUUID(),
          options: { create: [{ text: 'True', isCorrect: true, orderIndex: 0 }, { text: 'False', isCorrect: false, orderIndex: 1 }] },
        },
      }),
    );
  });

  afterAll(async () => {
    await tenantPrisma.forTenant({ organizationId: orgAId, isSuperAdmin: false }, (tx) =>
      tx.question.deleteMany({ where: { organizationId: orgAId } }),
    );
    await prisma.organization.deleteMany({ where: { id: { in: [orgAId, orgBId] } } });
    await prisma.plan.delete({ where: { id: planId } });
    await prisma.$disconnect();
  });

  it('never returns another tenant\'s questions', async () => {
    const orgBQuestions = await tenantPrisma.forTenant({ organizationId: orgBId, isSuperAdmin: false }, (tx) =>
      tx.question.findMany(),
    );
    expect(orgBQuestions).toHaveLength(0);
  });

  it('returns zero rows when no tenant context has been set', async () => {
    const rows = await prisma.question.findMany({ where: { organizationId: orgAId } });
    expect(rows).toHaveLength(0);
  });
});

describe('Question Bank HTTP flow', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let planId: string;
  let orgId: string;
  let recruiterAccessToken: string;
  let orgAdminAccessToken: string;
  let questionId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);

    const plan = await prisma.plan.create({
      data: { name: `qb-http-plan-${randomUUID()}`, candidateLimit: 10, aiCreditLimit: 1, proctoringMinutesLimit: 1 },
    });
    planId = plan.id;

    const org = await prisma.organization.create({ data: { name: 'QB HTTP Org', slug: `qb-http-org-${randomUUID()}`, planId } });
    orgId = org.id;

    const recruiterHash = await argon2.hash('RecruiterPassw0rd!');
    const orgAdminHash = await argon2.hash('OrgAdminPassw0rd!');
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) =>
      Promise.all([
        tx.user.create({ data: { organizationId: orgId, email: 'recruiter@qb-http.test', passwordHash: recruiterHash, role: 'recruiter' } }),
        tx.user.create({ data: { organizationId: orgId, email: 'orgadmin@qb-http.test', passwordHash: orgAdminHash, role: 'org_admin' } }),
      ]),
    );

    const recruiterLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/staff/login')
      .send({ organizationSlug: org.slug, email: 'recruiter@qb-http.test', password: 'RecruiterPassw0rd!' })
      .expect(200);
    recruiterAccessToken = recruiterLogin.body.accessToken;

    const orgAdminLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/staff/login')
      .send({ organizationSlug: org.slug, email: 'orgadmin@qb-http.test', password: 'OrgAdminPassw0rd!' })
      .expect(200);
    orgAdminAccessToken = orgAdminLogin.body.accessToken;
  });

  afterAll(async () => {
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) =>
      tx.question.deleteMany({ where: { organizationId: orgId } }),
    );
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) =>
      tx.user.deleteMany({ where: { organizationId: orgId } }),
    );
    await prisma.organization.delete({ where: { id: orgId } }).catch(() => undefined);
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('rejects a non-permitted role from creating a question', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/questions')
      .set('Authorization', `Bearer ${orgAdminAccessToken}`)
      .send({
        type: 'true_false',
        text: 'Should be forbidden',
        difficulty: 'easy',
        marks: 1,
        options: [{ text: 'True', isCorrect: true }, { text: 'False', isCorrect: false }],
      })
      .expect(403);
  });

  it('creates, lists, retrieves, updates, and archives a question end-to-end', async () => {
    const createResponse = await request(app.getHttpServer())
      .post('/api/v1/questions')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({
        type: 'single_mcq',
        text: 'What is the capital of France?',
        topic: 'geography',
        difficulty: 'easy',
        marks: 5,
        negativeMarks: 1,
        options: [
          { text: 'Paris', isCorrect: true },
          { text: 'London', isCorrect: false },
        ],
      })
      .expect(201);
    questionId = createResponse.body.id;
    expect(createResponse.body.options).toHaveLength(2);

    const listResponse = await request(app.getHttpServer())
      .get('/api/v1/questions')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(200);
    expect(listResponse.body.map((q: { id: string }) => q.id)).toContain(questionId);

    const getResponse = await request(app.getHttpServer())
      .get(`/api/v1/questions/${questionId}`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(200);
    expect(getResponse.body.text).toBe('What is the capital of France?');

    const updateResponse = await request(app.getHttpServer())
      .patch(`/api/v1/questions/${questionId}`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({
        type: 'single_mcq',
        text: 'What is the capital of France? (updated)',
        difficulty: 'medium',
        marks: 10,
        options: [
          { text: 'Paris', isCorrect: true },
          { text: 'Berlin', isCorrect: false },
        ],
      })
      .expect(200);
    expect(updateResponse.body.marks).toBe(10);

    await request(app.getHttpServer())
      .post(`/api/v1/questions/${questionId}/archive`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(201);

    const activeListResponse = await request(app.getHttpServer())
      .get('/api/v1/questions?status=active')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(200);
    expect(activeListResponse.body.map((q: { id: string }) => q.id)).not.toContain(questionId);

    const archivedListResponse = await request(app.getHttpServer())
      .get('/api/v1/questions?status=archived')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(200);
    expect(archivedListResponse.body.map((q: { id: string }) => q.id)).toContain(questionId);
  });

  it('rejects an invalid question payload with 400', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/questions')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({
        type: 'single_mcq',
        text: 'Bad question — two correct answers',
        difficulty: 'easy',
        marks: 1,
        options: [
          { text: 'A', isCorrect: true },
          { text: 'B', isCorrect: true },
        ],
      })
      .expect(400);
  });
});
```

- [ ] **Step 2: Run the full e2e suite**

Run: `npm run test:api:e2e` (from repo root)
Expected: all suites pass, including both `describe` blocks in `question-bank.e2e-spec.ts` (2 RLS tests + 3 HTTP flow tests = 5 tests in this file), with no regressions to `tenant-isolation.e2e-spec.ts`, `health.e2e-spec.ts`, or `auth-flow.e2e-spec.ts`.

- [ ] **Step 3: Run the full unit suite one more time**

Run: `npm run test:api` (from repo root)
Expected: all suites still passing.

- [ ] **Step 4: Commit**

```bash
git add apps/api/test/question-bank.e2e-spec.ts
git commit -m "test: add full question bank e2e coverage — CRUD flow, tenant isolation, RBAC denial"
```
