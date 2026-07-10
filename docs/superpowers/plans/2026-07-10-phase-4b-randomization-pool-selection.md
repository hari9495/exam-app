# Phase 4b — Randomization & Pool-Based Question Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a recruiter opt an exam into randomized question/option order, and configure a section to draw N questions matching tag/difficulty criteria at attempt-start instead of only a fixed explicit list — the second sub-phase of Phase 4.

**Architecture:** `Exam` gains a `randomizeOrder` toggle; `ExamSection` gains a `selectionMode` ('fixed' | 'pool') plus pool criteria (count, optional difficulty, required tags via a new `ExamSectionPoolTag` join table). `apps/exam-runtime`'s `AttemptService.start()` draws each pool section's questions fresh per candidate (shuffled, AND-tag-matched against the same Phase 4a tag model), optionally shuffles fixed sections' order and every question's option order, and persists two new per-attempt snapshots (`sectionSnapshotJson`, `optionOrderJson`) alongside the existing `questionOrderJson` — `loadSections()` is rewritten to read from these snapshots instead of re-querying live tables, which is required for pool-drawn questions (they have no persisted link row to re-derive from) and also fixes a latent quirk in how fixed sections were re-derived. Grading and monitoring are untouched — both already consume only the flat `questionOrderJson`.

**Tech Stack:** Same as every prior phase — NestJS, Prisma (`sqlserver` provider via `@exam-platform/shared`), SQL Server, Jest/Supertest. No new dependencies.

## Global Constraints

- `randomizeOrder` on `Exam` controls both question-order and option-order shuffling together — no separate toggles.
- A section is always unambiguously `'fixed'` or `'pool'` — never both. Switching modes clears the other mode's data (`fixed→pool` clears `ExamSectionQuestion` rows; `pool→fixed` clears `ExamSectionPoolTag` rows and resets `poolSize`/`poolDifficulty` to `null`).
- Pool tag matching is AND (a question must have every specified tag), never OR — via one `tags: { some: { tagId } }` clause per tag, `AND`-ed together (the confirmed-correct Prisma pattern for this many-to-many shape, not `tagId: { in: [...] }` which would be OR).
- Pool sections are always freshly randomized in composition at attempt-start — the `randomizeOrder` toggle only affects whether a *fixed* section's curated order gets shuffled.
- Publish-time validation is the only enforcement point for insufficient pool matches — a candidate must never be able to reach a broken pool. A `'pool'` section's match count must be `>= poolSize` at publish time, using the exact same AND-tag query `start()` uses for the real draw.
- `ExamSectionPoolTag` gets no `organizationId` column and no RLS registration — matching `QuestionTag`/`ExamSectionQuestion`'s existing convention (reached only through an already-tenant-filtered `ExamSection`). `Exam`/`ExamSection`'s new columns need no new RLS migration — both tables are already registered on `TenantAccessPolicy` (table-level, not column-level).
- `questionOrderJson`'s shape and every existing consumer (`attempt-settlement.service.ts` grading, `monitoring.service.ts`'s `totalQuestions`) are unchanged.
- No Question Bank / Exam Builder frontend UI — backend only, matching every Phase 1/4a precedent.
- Work happens directly on `main` (no feature branch) — established pattern for this project across every prior phase.
- Full spec: `docs/superpowers/specs/2026-07-10-phase-4b-randomization-pool-selection-design.md`.

---

## File Structure

```
apps/api/
  prisma/
    schema.prisma                                            # Modify: Exam.randomizeOrder, ExamSection pool fields, ExamSectionPoolTag, Attempt new fields
    migrations/
      20260710100000_randomization_pool_selection_schema/migration.sql  # Create
  src/
    exams/
      dto/create-exam.dto.ts                                  # Modify: add randomizeOrder
      dto/update-exam-section.dto.ts                          # Modify: add selectionMode/poolSize/poolDifficulty/poolTagIds
      exams.service.ts                                        # Modify: create/update pass randomizeOrder; updateSection mode-switch; publish pool validation
      exams.service.spec.ts                                   # Modify: existing tests + new pool/mode-switch tests
  test/
    exam-builder.e2e-spec.ts                                  # Modify: pool section publish-validation round trip
    exam-taking-runtime.e2e-spec.ts                           # Modify: pool-draw + option-order-stability scenarios
apps/exam-runtime/
  src/
    attempts/
      shuffle.ts                                              # Create
      shuffle.spec.ts                                         # Create
      attempt.service.ts                                      # Modify: start()/getCurrent()/loadSections() rewritten
      attempt.service.spec.ts                                 # Modify: existing tests updated + new pool/shuffle tests
```

---

### Task 1: Schema — `Exam.randomizeOrder`, `ExamSection` pool fields, `ExamSectionPoolTag`, `Attempt` snapshots

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260710100000_randomization_pool_selection_schema/migration.sql`

**Interfaces:**
- Produces: `Exam.randomizeOrder: boolean`, `ExamSection.selectionMode: string` ('fixed'|'pool'), `ExamSection.poolSize: number | null`, `ExamSection.poolDifficulty: string | null`, `ExamSectionPoolTag(sectionId, tagId)`, `Attempt.optionOrderJson: string | null`, `Attempt.sectionSnapshotJson: string`. Tasks 3 and 4 depend on all of these existing and the Prisma client being regenerated.

- [ ] **Step 1: Add the schema changes**

In `apps/api/prisma/schema.prisma`, modify the `Exam` model (add `randomizeOrder` after `passCriteriaPercent`):
```prisma
model Exam {
  id                  String        @id @default(uuid()) @db.UniqueIdentifier
  organizationId      String        @map("organization_id") @db.UniqueIdentifier
  title               String
  instructions        String?       @db.NVarChar(Max)
  status              String        @default("draft")
  durationMinutes     Int           @default(60) @map("duration_minutes")
  passCriteriaPercent Int           @default(40) @map("pass_criteria_percent")
  randomizeOrder      Boolean       @default(false) @map("randomize_order")
  createdBy           String        @map("created_by") @db.UniqueIdentifier
  createdAt           DateTime      @default(now()) @map("created_at")
  sections            ExamSection[]
  invitations         Invitation[]

  @@index([organizationId, status])
  @@map("exams")
}
```

Modify `ExamSection` and add `ExamSectionPoolTag`:
```prisma
model ExamSection {
  id             String                @id @default(uuid()) @db.UniqueIdentifier
  examId         String                @map("exam_id") @db.UniqueIdentifier
  title          String
  orderIndex     Int                   @map("order_index")
  selectionMode  String                @default("fixed") @map("selection_mode")
  poolSize       Int?                  @map("pool_size")
  poolDifficulty String?               @map("pool_difficulty")
  exam           Exam                  @relation(fields: [examId], references: [id], onDelete: Cascade)
  questions      ExamSectionQuestion[]
  poolTags       ExamSectionPoolTag[]

  @@index([examId])
  @@map("exam_sections")
}

model ExamSectionPoolTag {
  sectionId String      @map("section_id") @db.UniqueIdentifier
  tagId     String      @map("tag_id") @db.UniqueIdentifier
  section   ExamSection @relation(fields: [sectionId], references: [id], onDelete: Cascade)
  tag       Tag         @relation(fields: [tagId], references: [id], onDelete: Cascade)

  @@id([sectionId, tagId])
  @@map("exam_section_pool_tags")
}
```

Modify `Tag` to add the second back-relation (after its existing `questions QuestionTag[]`):
```prisma
model Tag {
  id             String               @id @default(uuid()) @db.UniqueIdentifier
  organizationId String               @map("organization_id") @db.UniqueIdentifier
  name           String
  createdAt      DateTime             @default(now()) @map("created_at")
  questions      QuestionTag[]
  poolSections   ExamSectionPoolTag[]

  @@unique([organizationId, name])
  @@map("tags")
}
```

Modify `Attempt` (add `optionOrderJson` and `sectionSnapshotJson` after `questionOrderJson`):
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
  invitation          Invitation          @relation(fields: [invitationId], references: [id], onDelete: Cascade)
  answers             Answer[]
  result              Result?
  proctoringEvents    ProctoringEvent[]
  messages            CandidateMessage[]
  proctoringAnalysis  ProctoringAnalysis?

  @@index([examId, status])
  @@map("attempts")
}
```

- [ ] **Step 2: Generate the migration**

Run (from `apps/api/`): `npx prisma migrate dev --create-only --name randomization_pool_selection_schema`

If this hits the P3014 shadow-database permission error (the documented, established issue every prior schema-touching phase in this project has hit — see e.g. Phase 4a's Task 1 report), hand-write the migration instead, cross-checking naming conventions against the real migrations already in the repo (`20260710090000_question_tags_schema` is the closest recent analog for a new-table-plus-join-table migration; `20260707140000_exam_builder_schema` for adding columns to `exams`/`exam_sections`). Rename the folder to `20260710100000_randomization_pool_selection_schema` if the generated timestamp differs, so it sorts after `20260710090001_question_tags_rls`.

Expected SQL (either generated or hand-written, matching this shape):
```sql
-- AlterTable
ALTER TABLE [dbo].[exams] ADD [randomize_order] BIT NOT NULL CONSTRAINT [exams_randomize_order_df] DEFAULT 0;

-- AlterTable
ALTER TABLE [dbo].[exam_sections] ADD [selection_mode] NVARCHAR(1000) NOT NULL CONSTRAINT [exam_sections_selection_mode_df] DEFAULT 'fixed',
[pool_size] INT,
[pool_difficulty] NVARCHAR(1000);

-- AlterTable
ALTER TABLE [dbo].[attempts] ADD [section_snapshot_json] NVARCHAR(MAX) NOT NULL CONSTRAINT [attempts_section_snapshot_json_df] DEFAULT '[]',
[option_order_json] NVARCHAR(MAX);

-- CreateTable
CREATE TABLE [dbo].[exam_section_pool_tags] (
    [section_id] UNIQUEIDENTIFIER NOT NULL,
    [tag_id] UNIQUEIDENTIFIER NOT NULL,
    CONSTRAINT [exam_section_pool_tags_pkey] PRIMARY KEY CLUSTERED ([section_id],[tag_id])
);

-- AddForeignKey
ALTER TABLE [dbo].[exam_section_pool_tags] ADD CONSTRAINT [exam_section_pool_tags_section_id_fkey] FOREIGN KEY ([section_id]) REFERENCES [dbo].[exam_sections]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[exam_section_pool_tags] ADD CONSTRAINT [exam_section_pool_tags_tag_id_fkey] FOREIGN KEY ([tag_id]) REFERENCES [dbo].[tags]([id]) ON DELETE CASCADE ON UPDATE CASCADE;
```
Note: `attempts.section_snapshot_json` is `NOT NULL` with a `DEFAULT '[]'` purely so the `ALTER TABLE ADD` succeeds against any existing rows in the table (there should be none in a dev database, but the column is declared `NOT NULL` in the schema going forward — every new `Attempt` row created after this migration always supplies a real value, per Task 4). No RLS migration is needed for this task: `exams`/`exam_sections` are already registered on `TenantAccessPolicy` (table-level, unaffected by new columns), and `exam_section_pool_tags` deliberately gets no RLS registration at all, matching `question_tags`/`exam_section_questions`.

- [ ] **Step 3: Apply the migration and regenerate the client**

Run (from `apps/api/`): `npx prisma migrate deploy`, then `npx prisma generate`.

Expected: migration applies cleanly. Run `npx prisma migrate status` to confirm — should report all migrations applied, no drift.

- [ ] **Step 4: Verify the schema directly against the database**

```sql
SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS
WHERE (TABLE_NAME = 'exams' AND COLUMN_NAME = 'randomize_order')
   OR (TABLE_NAME = 'exam_sections' AND COLUMN_NAME IN ('selection_mode', 'pool_size', 'pool_difficulty'))
   OR (TABLE_NAME = 'attempts' AND COLUMN_NAME IN ('section_snapshot_json', 'option_order_json'))
   OR TABLE_NAME = 'exam_section_pool_tags'
ORDER BY TABLE_NAME, ORDINAL_POSITION;
```
Expected: `exams.randomize_order` (bit, not nullable); `exam_sections.selection_mode` (not nullable), `pool_size`/`pool_difficulty` (nullable); `attempts.section_snapshot_json` (not nullable), `option_order_json` (nullable); `exam_section_pool_tags`'s two columns.

Then confirm RLS is unaffected/correctly absent:
```sql
SELECT OBJECT_NAME(target_object_id) AS table_name, COUNT(*) AS predicate_count
FROM sys.security_predicates
WHERE OBJECT_NAME(target_object_id) IN ('exams', 'exam_sections', 'exam_section_pool_tags')
GROUP BY OBJECT_NAME(target_object_id);
```
Expected: `exams` and `exam_sections` each still show their existing 3 predicates (filter + 2 block, unchanged from Phase 1b); `exam_section_pool_tags` returns **no row at all** (zero predicates — by design).

- [ ] **Step 5: Verify the exam-runtime and api builds are clean**

Run `npx tsc --noEmit` from `apps/api/` and from `apps/exam-runtime/`.
Expected: both clean, no errors — confirms the regenerated Prisma client's new fields don't break either app's existing compiled code (neither app references the new fields yet, so this just proves nothing broke).

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260710100000_randomization_pool_selection_schema
git commit -m "feat: add randomization + pool-selection schema (Exam.randomizeOrder, ExamSection pool fields, ExamSectionPoolTag, Attempt snapshots)"
```

---

### Task 2: `shuffle()` utility

**Files:**
- Create: `apps/exam-runtime/src/attempts/shuffle.ts`
- Create: `apps/exam-runtime/src/attempts/shuffle.spec.ts`

**Interfaces:**
- Produces: `shuffle<T>(items: T[]): T[]` — pure, non-mutating, Fisher-Yates. Task 4 imports this directly.

- [ ] **Step 1: Write the failing tests**

`apps/exam-runtime/src/attempts/shuffle.spec.ts`:
```typescript
import { shuffle } from './shuffle';

describe('shuffle', () => {
  it('returns an array with the same length as the input', () => {
    const result = shuffle([1, 2, 3, 4, 5]);
    expect(result).toHaveLength(5);
  });

  it('returns an array containing exactly the same elements as the input', () => {
    const input = ['a', 'b', 'c', 'd'];
    const result = shuffle(input);
    expect([...result].sort()).toEqual([...input].sort());
  });

  it('does not mutate the input array', () => {
    const input = [1, 2, 3];
    const inputCopy = [...input];
    shuffle(input);
    expect(input).toEqual(inputCopy);
  });

  it('returns an empty array when given an empty array', () => {
    expect(shuffle([])).toEqual([]);
  });

  it('returns a single-element array unchanged', () => {
    expect(shuffle(['only'])).toEqual(['only']);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:exam-runtime -- shuffle.spec` (from repo root)
Expected: FAIL — `./shuffle` module doesn't exist yet.

- [ ] **Step 3: Implement `shuffle`**

`apps/exam-runtime/src/attempts/shuffle.ts`:
```typescript
export function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:exam-runtime -- shuffle.spec`
Expected: `5 passed`.

- [ ] **Step 5: Commit**

```bash
git add apps/exam-runtime/src/attempts/shuffle.ts apps/exam-runtime/src/attempts/shuffle.spec.ts
git commit -m "feat: add shuffle() utility for question/option order randomization"
```

---

### Task 3: Exam/Section API — `randomizeOrder`, pool section CRUD, publish validation

**Files:**
- Modify: `apps/api/src/exams/dto/create-exam.dto.ts`
- Modify: `apps/api/src/exams/dto/update-exam-section.dto.ts`
- Modify: `apps/api/src/exams/exams.service.ts`
- Modify: `apps/api/src/exams/exams.service.spec.ts`
- Modify: `apps/api/test/exam-builder.e2e-spec.ts`

**Interfaces:**
- Consumes: `Exam.randomizeOrder`, `ExamSection.selectionMode`/`poolSize`/`poolDifficulty`, `ExamSectionPoolTag` (Task 1).
- Produces: `ExamsService.updateSection` accepts and persists pool config with mode-switch clearing. `ExamsService.publish` validates pool sections via a `tx.question.count(...)` AND-tag query. No other task depends on these signatures directly — Task 4's `start()` implements its own equivalent draw query independently (same AND-tag pattern, different app/Prisma client).

- [ ] **Step 1: Add `randomizeOrder` to `CreateExamDto`**

Replace `apps/api/src/exams/dto/create-exam.dto.ts` in full:
```typescript
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';

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

  @IsOptional()
  @IsBoolean()
  randomizeOrder?: boolean;
}
```
`UpdateExamDto extends CreateExamDto` with no overrides, so it inherits this automatically — no separate change needed there.

- [ ] **Step 2: Add pool fields to `UpdateExamSectionDto`**

Replace `apps/api/src/exams/dto/update-exam-section.dto.ts` in full:
```typescript
import { ArrayMinSize, IsArray, IsIn, IsInt, IsOptional, IsString, Min, ValidateIf } from 'class-validator';
import { CreateExamSectionDto } from './create-exam-section.dto';

export class UpdateExamSectionDto extends CreateExamSectionDto {
  @IsOptional()
  @IsIn(['fixed', 'pool'])
  selectionMode?: string;

  @ValidateIf((o) => o.selectionMode === 'pool')
  @IsInt()
  @Min(1)
  poolSize?: number;

  @IsOptional()
  @IsIn(['easy', 'medium', 'hard'])
  poolDifficulty?: string;

  @ValidateIf((o) => o.selectionMode === 'pool')
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  poolTagIds?: string[];
}
```

- [ ] **Step 3: Write the failing service tests**

In `apps/api/src/exams/exams.service.spec.ts`, first update the two existing `create` tests that assert an exact `data` object (lines 36-52 and 54-70 of the current file) — add `randomizeOrder: undefined` to both expected `data` objects, immediately after `passCriteriaPercent`:
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
        randomizeOrder: undefined,
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
        randomizeOrder: undefined,
        createdBy: 'user-1',
      },
    });
  });
```

Then add these new tests, placed after the existing `'throws NotFoundException when updating a section that does not belong to the given exam'` test (around line 180 of the current file):
```typescript
  it('updates a section\'s title without touching pool data when staying fixed', async () => {
    const tx = {
      exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1' }) },
      examSection: {
        findFirst: jest.fn().mockResolvedValue({ id: 'section-1', selectionMode: 'fixed', poolSize: null, poolDifficulty: null }),
        update: jest.fn().mockResolvedValue({ id: 'section-1', title: 'Renamed', selectionMode: 'fixed' }),
      },
      examSectionQuestion: { deleteMany: jest.fn() },
      examSectionPoolTag: { deleteMany: jest.fn() },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await service.updateSection(context, 'exam-1', 'section-1', { title: 'Renamed' });

    expect(tx.examSectionQuestion.deleteMany).not.toHaveBeenCalled();
    expect(tx.examSectionPoolTag.deleteMany).not.toHaveBeenCalled();
    expect(tx.examSection.update).toHaveBeenCalledWith({
      where: { id: 'section-1' },
      data: { title: 'Renamed', selectionMode: 'fixed', poolSize: null, poolDifficulty: null },
      include: { poolTags: true },
    });
  });

  it('switches a section from fixed to pool, clearing existing question links and storing pool criteria', async () => {
    const tx = {
      exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1' }) },
      examSection: {
        findFirst: jest.fn().mockResolvedValue({ id: 'section-1', selectionMode: 'fixed', poolSize: null, poolDifficulty: null }),
        update: jest.fn().mockResolvedValue({ id: 'section-1', title: 'Pool Section', selectionMode: 'pool' }),
      },
      examSectionQuestion: { deleteMany: jest.fn() },
      examSectionPoolTag: { deleteMany: jest.fn() },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await service.updateSection(context, 'exam-1', 'section-1', {
      title: 'Pool Section', selectionMode: 'pool', poolSize: 5, poolDifficulty: 'hard', poolTagIds: ['tag-1', 'tag-2'],
    });

    expect(tx.examSectionQuestion.deleteMany).toHaveBeenCalledWith({ where: { sectionId: 'section-1' } });
    expect(tx.examSectionPoolTag.deleteMany).toHaveBeenCalledWith({ where: { sectionId: 'section-1' } });
    expect(tx.examSection.update).toHaveBeenCalledWith({
      where: { id: 'section-1' },
      data: {
        title: 'Pool Section',
        selectionMode: 'pool',
        poolSize: 5,
        poolDifficulty: 'hard',
        poolTags: { create: [{ tagId: 'tag-1' }, { tagId: 'tag-2' }] },
      },
      include: { poolTags: true },
    });
  });

  it('switches a section from pool back to fixed, clearing pool criteria', async () => {
    const tx = {
      exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1' }) },
      examSection: {
        findFirst: jest.fn().mockResolvedValue({ id: 'section-1', selectionMode: 'pool', poolSize: 5, poolDifficulty: 'hard' }),
        update: jest.fn().mockResolvedValue({ id: 'section-1', title: 'Section', selectionMode: 'fixed' }),
      },
      examSectionQuestion: { deleteMany: jest.fn() },
      examSectionPoolTag: { deleteMany: jest.fn() },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await service.updateSection(context, 'exam-1', 'section-1', { title: 'Section', selectionMode: 'fixed' });

    expect(tx.examSectionPoolTag.deleteMany).toHaveBeenCalledWith({ where: { sectionId: 'section-1' } });
    expect(tx.examSectionQuestion.deleteMany).not.toHaveBeenCalled();
    expect(tx.examSection.update).toHaveBeenCalledWith({
      where: { id: 'section-1' },
      data: { title: 'Section', selectionMode: 'fixed', poolSize: null, poolDifficulty: null },
      include: { poolTags: true },
    });
  });
```

Then add these two new tests after the existing `'throws BadRequestException when publishing an exam with a section that has no questions'` test (around line 323 of the current file):
```typescript
  it('publishes a draft exam whose pool section has enough matching questions', async () => {
    const tx = {
      exam: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'exam-1',
          status: 'draft',
          sections: [
            { id: 'section-1', title: 'Pool Section', selectionMode: 'pool', poolSize: 3, poolDifficulty: 'hard', questions: [], poolTags: [{ tagId: 'tag-1' }] },
          ],
        }),
        update: jest.fn().mockResolvedValue({ id: 'exam-1', status: 'published' }),
      },
      question: { count: jest.fn().mockResolvedValue(3) },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    const result = await service.publish(context, 'exam-1');

    expect(result.status).toBe('published');
    expect(tx.question.count).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', status: 'active', difficulty: 'hard', AND: [{ tags: { some: { tagId: 'tag-1' } } }] },
    });
  });

  it('rejects publish when a pool section has fewer matching questions than its pool size', async () => {
    const tx = {
      exam: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'exam-1',
          status: 'draft',
          sections: [
            { id: 'section-1', title: 'Pool Section', selectionMode: 'pool', poolSize: 5, poolDifficulty: null, questions: [], poolTags: [{ tagId: 'tag-1' }] },
          ],
        }),
      },
      question: { count: jest.fn().mockResolvedValue(3) },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await expect(service.publish(context, 'exam-1')).rejects.toThrow(BadRequestException);
  });
```

- [ ] **Step 4: Run the tests to verify the new/changed ones fail**

Run: `npm run test:api -- exams.service` (from repo root)
Expected: FAIL — `create`'s two tests fail on the missing `randomizeOrder: undefined` key (before the DTO/service change); the new `updateSection`/`publish` tests fail since the mode-switch and pool-count logic don't exist yet.

- [ ] **Step 5: Implement the service changes**

In `apps/api/src/exams/exams.service.ts`, update `create`'s `data` object (add `randomizeOrder: dto.randomizeOrder,` after `passCriteriaPercent: dto.passCriteriaPercent,`):
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
          randomizeOrder: dto.randomizeOrder,
          createdBy: userId,
        },
      }),
    );
  }
```

Update `update` to also pass `randomizeOrder` through when provided (add after the existing `passCriteriaPercent` conditional spread):
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
          ...(dto.randomizeOrder !== undefined ? { randomizeOrder: dto.randomizeOrder } : {}),
        },
      });
    });
  }
```

Replace `updateSection` in full:
```typescript
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

      const nextMode = dto.selectionMode ?? section.selectionMode;

      if (nextMode === 'pool' && section.selectionMode === 'fixed') {
        await tx.examSectionQuestion.deleteMany({ where: { sectionId } });
      }
      if (nextMode === 'fixed' && section.selectionMode === 'pool') {
        await tx.examSectionPoolTag.deleteMany({ where: { sectionId } });
      }
      if (nextMode === 'pool' && dto.poolTagIds) {
        await tx.examSectionPoolTag.deleteMany({ where: { sectionId } });
      }

      return tx.examSection.update({
        where: { id: sectionId },
        data: {
          title: dto.title,
          selectionMode: nextMode,
          poolSize: nextMode === 'pool' ? (dto.poolSize ?? section.poolSize) : null,
          poolDifficulty: nextMode === 'pool' ? (dto.poolDifficulty ?? section.poolDifficulty) : null,
          ...(nextMode === 'pool' && dto.poolTagIds
            ? { poolTags: { create: dto.poolTagIds.map((tagId) => ({ tagId })) } }
            : {}),
        },
        include: { poolTags: true },
      });
    });
  }
```

Replace `publish` in full:
```typescript
  async publish(context: TenantContext, id: string): Promise<Exam> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const exam = await tx.exam.findFirst({
        where: { id, organizationId: context.organizationId as string },
        include: { sections: { include: { questions: true, poolTags: true } } },
      });
      if (!exam) {
        throw new NotFoundException(`Exam ${id} not found`);
      }
      if (exam.status !== 'draft') {
        throw new BadRequestException(`Exam ${id} cannot be published from status "${exam.status}"`);
      }
      if (exam.sections.length === 0) {
        throw new BadRequestException('Exam must have at least one section before it can be published');
      }
      for (const section of exam.sections) {
        if (section.selectionMode === 'pool') {
          const tagIds = section.poolTags.map((poolTag) => poolTag.tagId);
          const matchingCount = await tx.question.count({
            where: {
              organizationId: context.organizationId as string,
              status: 'active',
              ...(section.poolDifficulty ? { difficulty: section.poolDifficulty } : {}),
              AND: tagIds.map((tagId) => ({ tags: { some: { tagId } } })),
            },
          });
          if (matchingCount < (section.poolSize ?? 0)) {
            throw new BadRequestException(
              `Section "${section.title}" pool requires ${section.poolSize} matching questions, only ${matchingCount} available`,
            );
          }
        } else if (section.questions.length === 0) {
          throw new BadRequestException(`Section "${section.title}" has no questions attached`);
        }
      }
      return tx.exam.update({ where: { id }, data: { status: 'published' } });
    });
  }
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm run test:api -- exams.service`
Expected: all tests pass — the 2 updated `create` tests, plus 5 new tests (3 `updateSection` mode-switch cases, 2 `publish` pool-validation cases), plus every pre-existing test unaffected (the `publish` tests using sections with no `selectionMode` field fall through to the unchanged `else if` branch, matching prior behavior exactly).

- [ ] **Step 7: Extend the exam-builder e2e spec**

In `apps/api/test/exam-builder.e2e-spec.ts`, add a new test to the `'Exam Builder HTTP flow'` describe block, after the existing `'builds an exam end-to-end...'` test:
```typescript
  it('rejects publishing an exam with an underfilled pool section, then succeeds once enough matching questions exist', async () => {
    const poolExamResponse = await request(app.getHttpServer())
      .post('/api/v1/exams')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ title: 'Pool Round' })
      .expect(201);
    const poolExamId = poolExamResponse.body.id;

    const poolSectionResponse = await request(app.getHttpServer())
      .post(`/api/v1/exams/${poolExamId}/sections`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ title: 'Pool Section' })
      .expect(201);
    const poolSectionId = poolSectionResponse.body.id;

    const sqlQuestionOne = await request(app.getHttpServer())
      .post('/api/v1/questions')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({
        type: 'true_false', text: 'SQL question one', difficulty: 'medium', marks: 1, tags: ['sql'],
        options: [{ text: 'True', isCorrect: true }, { text: 'False', isCorrect: false }],
      })
      .expect(201);
    const sqlTagId = sqlQuestionOne.body.tags[0].id;

    await request(app.getHttpServer())
      .patch(`/api/v1/exams/${poolExamId}/sections/${poolSectionId}`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ title: 'Pool Section', selectionMode: 'pool', poolSize: 2, poolTagIds: [sqlTagId] })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/api/v1/exams/${poolExamId}/publish`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(400);

    await request(app.getHttpServer())
      .post('/api/v1/questions')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({
        type: 'true_false', text: 'SQL question two', difficulty: 'medium', marks: 1, tags: ['sql'],
        options: [{ text: 'True', isCorrect: true }, { text: 'False', isCorrect: false }],
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/exams/${poolExamId}/publish`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(201);
  });
```

Update the `'Exam Builder HTTP flow'` describe block's existing `afterAll` to also clean up tags created by this test (add alongside the existing `tx.question.deleteMany` call):
```typescript
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) =>
      tx.tag.deleteMany({ where: { organizationId: orgId } }),
    );
```

- [ ] **Step 8: Run the exam-builder e2e spec**

Run: `npm run test:api:e2e -- exam-builder` (from repo root)
Expected: all tests pass, including the new pool-publish-validation round trip.

- [ ] **Step 9: Run the full api unit and e2e suites**

Run: `npm run test:api` then `npm run test:api:e2e` (from repo root)
Expected: all suites passing, no regressions.

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/exams apps/api/test/exam-builder.e2e-spec.ts
git commit -m "feat: add randomizeOrder toggle, pool-based section selection mode, and publish-time pool validation"
```

---

### Task 4: Attempt-runtime selection, randomization, and the section-snapshot rewrite

**Files:**
- Modify: `apps/exam-runtime/src/attempts/attempt.service.ts`
- Modify: `apps/exam-runtime/src/attempts/attempt.service.spec.ts`
- Modify: `apps/api/test/exam-taking-runtime.e2e-spec.ts`

**Interfaces:**
- Consumes: `shuffle()` (Task 2). `Exam.randomizeOrder`, `ExamSection.selectionMode`/`poolSize`/`poolDifficulty`/`poolTags`, `Attempt.sectionSnapshotJson`/`optionOrderJson` (Task 1). The same AND-tag Prisma query pattern Task 3's `publish` uses for counting.
- Produces: nothing further downstream in this plan — this is the last code task before final verification.

- [ ] **Step 1: Write the failing `getCurrent` and `start` tests**

Replace `apps/exam-runtime/src/attempts/attempt.service.spec.ts`'s top-level fixture (the `exam` const near the top of the file) to include `randomizeOrder`:
```typescript
  const exam = { id: 'exam-1', organizationId: 'org-1', title: 'Backend Round', instructions: 'Be honest', durationMinutes: 60, passCriteriaPercent: 40, randomizeOrder: false };
```

Replace the entire `describe('getCurrent', ...)` block's second and third tests (`'returns the full attempt state...'` and `'returns unread messages...'`) with:
```typescript
    it('returns the full attempt state with sections, questions (no isCorrect), and existing answers', async () => {
      const attempt = {
        id: 'attempt-1', status: 'in_progress', startedAt: new Date(),
        questionOrderJson: JSON.stringify(['q1']),
        sectionSnapshotJson: JSON.stringify([{ sectionId: 'section-1', title: 'Section One', questionIds: ['q1'] }]),
        optionOrderJson: null,
      };
      const tx = {
        attempt: { findUnique: jest.fn().mockResolvedValue(attempt) },
        question: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'q1', text: 'What is 2+2?', type: 'single_mcq', marks: 5, options: [{ id: 'opt-a', text: '4' }, { id: 'opt-b', text: '5' }] },
          ]),
        },
        answer: { findMany: jest.fn().mockResolvedValue([{ questionId: 'q1', selectedOptionIdsJson: JSON.stringify(['opt-a']), isMarkedForReview: false }]) },
        candidateMessage: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
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
        messages: [],
      });
      expect((result as any).sections[0].questions[0]).not.toHaveProperty('isCorrect');
    });

    it('reorders a question\'s options according to optionOrderJson when present', async () => {
      const attempt = {
        id: 'attempt-1', status: 'in_progress', startedAt: new Date(),
        questionOrderJson: JSON.stringify(['q1']),
        sectionSnapshotJson: JSON.stringify([{ sectionId: 'section-1', title: 'Section One', questionIds: ['q1'] }]),
        optionOrderJson: JSON.stringify({ q1: ['opt-b', 'opt-a'] }),
      };
      const tx = {
        attempt: { findUnique: jest.fn().mockResolvedValue(attempt) },
        question: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'q1', text: 'What is 2+2?', type: 'single_mcq', marks: 5, options: [{ id: 'opt-a', text: '4' }, { id: 'opt-b', text: '5' }] },
          ]),
        },
        answer: { findMany: jest.fn().mockResolvedValue([]) },
        candidateMessage: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
      };
      settlement.settleIfExpired.mockResolvedValue(attempt);
      settlement.remainingSeconds.mockReturnValue(3300);
      mockBootstrapThenScoped(tx);

      const result = await service.getCurrent(session);

      expect((result as any).sections[0].questions[0].options).toEqual([{ id: 'opt-b', text: '5' }, { id: 'opt-a', text: '4' }]);
    });

    it('returns unread messages and marks them read', async () => {
      const attempt = {
        id: 'attempt-1', status: 'in_progress', startedAt: new Date(),
        questionOrderJson: '[]', sectionSnapshotJson: '[]', optionOrderJson: null,
      };
      const unreadMessage = { id: 'msg-1', body: 'Please stay on the exam tab', sentAt: new Date('2026-07-09T00:00:00Z') };
      const tx = {
        attempt: { findUnique: jest.fn().mockResolvedValue(attempt) },
        question: { findMany: jest.fn().mockResolvedValue([]) },
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
(The other two `getCurrent` tests — `'throws UnauthorizedException...'` and `'resolves tenant context...'` — are unaffected; leave them exactly as they are.)

Replace the entire `describe('start', ...)` block with:
```typescript
  describe('start', () => {
    it('creates a new attempt snapshotting the question order and section structure when none exists', async () => {
      const tx = {
        attempt: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'attempt-1', status: 'in_progress' }) },
        examSection: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'section-1', title: 'Section One', selectionMode: 'fixed', poolSize: null, poolDifficulty: null, poolTags: [], questions: [{ questionId: 'q1' }, { questionId: 'q2' }] },
          ]),
        },
      };
      mockBootstrapThenScoped(tx);

      const result = await service.start(session);

      expect(result).toEqual({ id: 'attempt-1', status: 'in_progress' });
      expect(tx.attempt.create).toHaveBeenCalledWith({
        data: {
          invitationId: 'inv-1', candidateId: 'cand-1', examId: 'exam-1',
          questionOrderJson: JSON.stringify(['q1', 'q2']),
          sectionSnapshotJson: JSON.stringify([{ sectionId: 'section-1', title: 'Section One', questionIds: ['q1', 'q2'] }]),
          optionOrderJson: null,
          deviceFingerprint: undefined,
        },
      });
    });

    it('records a device fingerprint on the attempt when the client provides one', async () => {
      const tx = {
        attempt: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'attempt-1', status: 'in_progress' }) },
        examSection: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'section-1', title: 'Section One', selectionMode: 'fixed', poolSize: null, poolDifficulty: null, poolTags: [], questions: [{ questionId: 'q1' }] },
          ]),
        },
      };
      mockBootstrapThenScoped(tx);

      await service.start(session, { deviceFingerprint: 'fp-abc123' });

      expect(tx.attempt.create).toHaveBeenCalledWith({
        data: {
          invitationId: 'inv-1', candidateId: 'cand-1', examId: 'exam-1',
          questionOrderJson: JSON.stringify(['q1']),
          sectionSnapshotJson: JSON.stringify([{ sectionId: 'section-1', title: 'Section One', questionIds: ['q1'] }]),
          optionOrderJson: null,
          deviceFingerprint: 'fp-abc123',
        },
      });
    });

    it('resolves tenant context via an unscoped bootstrap lookup followed by a properly scoped call', async () => {
      const tx = {
        attempt: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'attempt-1', status: 'in_progress' }) },
        examSection: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'section-1', title: 'Section One', selectionMode: 'fixed', poolSize: null, poolDifficulty: null, poolTags: [], questions: [{ questionId: 'q1' }, { questionId: 'q2' }] },
          ]),
        },
      };
      mockBootstrapThenScoped(tx);

      await service.start(session);

      expect(tenantPrisma.forTenant).toHaveBeenNthCalledWith(
        1,
        { organizationId: null, isSuperAdmin: true },
        expect.any(Function),
      );
      expect(tenantPrisma.forTenant).toHaveBeenNthCalledWith(
        2,
        { organizationId: 'org-1', isSuperAdmin: false },
        expect.any(Function),
      );
    });

    it('returns the existing attempt unchanged when one already exists (idempotent)', async () => {
      const existing = { id: 'attempt-1', status: 'in_progress' };
      const tx = { attempt: { findUnique: jest.fn().mockResolvedValue(existing), create: jest.fn() } };
      mockBootstrapThenScoped(tx);

      const result = await service.start(session);

      expect(result).toEqual({ id: 'attempt-1', status: 'in_progress' });
      expect(tx.attempt.create).not.toHaveBeenCalled();
    });

    it('emits attempt:status when a new attempt is created', async () => {
      const tx = {
        attempt: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'attempt-1', status: 'in_progress' }) },
        examSection: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'section-1', title: 'Section One', selectionMode: 'fixed', poolSize: null, poolDifficulty: null, poolTags: [], questions: [{ questionId: 'q1' }] },
          ]),
        },
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

    it('preserves a fixed section\'s stored order when randomizeOrder is off', async () => {
      const tx = {
        attempt: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'attempt-1', status: 'in_progress' }) },
        examSection: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'section-1', title: 'Section One', selectionMode: 'fixed', poolSize: null, poolDifficulty: null, poolTags: [], questions: [{ questionId: 'q1' }, { questionId: 'q2' }, { questionId: 'q3' }] },
          ]),
        },
      };
      mockBootstrapThenScoped(tx);

      await service.start(session);

      expect(tx.attempt.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ questionOrderJson: JSON.stringify(['q1', 'q2', 'q3']) }) }),
      );
    });

    it('draws a pool section\'s questions matching tag and difficulty criteria, up to poolSize', async () => {
      const tx = {
        attempt: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'attempt-1', status: 'in_progress' }) },
        examSection: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'section-1', title: 'Pool Section', selectionMode: 'pool', poolSize: 2, poolDifficulty: 'hard', poolTags: [{ tagId: 'tag-1' }, { tagId: 'tag-2' }], questions: [] },
          ]),
        },
        question: {
          findMany: jest.fn().mockResolvedValue([{ id: 'q1' }, { id: 'q2' }, { id: 'q3' }]),
        },
      };
      mockBootstrapThenScoped(tx);

      await service.start(session);

      expect(tx.question.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-1', status: 'active', difficulty: 'hard',
          AND: [{ tags: { some: { tagId: 'tag-1' } } }, { tags: { some: { tagId: 'tag-2' } } }],
        },
        select: { id: true },
      });
      const createdData = tx.attempt.create.mock.calls[0][0].data;
      const questionIds: string[] = JSON.parse(createdData.questionOrderJson);
      expect(questionIds).toHaveLength(2);
      questionIds.forEach((id) => expect(['q1', 'q2', 'q3']).toContain(id));
    });

    it('builds optionOrderJson for every selected question when randomizeOrder is on', async () => {
      const randomizedExam = { ...exam, randomizeOrder: true };
      const tx = {
        attempt: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'attempt-1', status: 'in_progress' }) },
        examSection: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'section-1', title: 'Section One', selectionMode: 'fixed', poolSize: null, poolDifficulty: null, poolTags: [], questions: [{ questionId: 'q1' }] },
          ]),
        },
        question: {
          findMany: jest.fn().mockResolvedValue([{ id: 'q1', options: [{ id: 'opt-a' }, { id: 'opt-b' }, { id: 'opt-c' }] }]),
        },
      };
      tenantPrisma.forTenant
        .mockImplementationOnce(() => Promise.resolve({ ...invitationRecord, exam: randomizedExam }))
        .mockImplementationOnce((_ctx, fn) => fn(tx));

      await service.start(session);

      const createdData = tx.attempt.create.mock.calls[0][0].data;
      expect(createdData.optionOrderJson).not.toBeNull();
      const optionOrder = JSON.parse(createdData.optionOrderJson);
      expect([...optionOrder.q1].sort()).toEqual(['opt-a', 'opt-b', 'opt-c']);
    });

    it('leaves optionOrderJson null when randomizeOrder is off', async () => {
      const tx = {
        attempt: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'attempt-1', status: 'in_progress' }) },
        examSection: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'section-1', title: 'Section One', selectionMode: 'fixed', poolSize: null, poolDifficulty: null, poolTags: [], questions: [{ questionId: 'q1' }] },
          ]),
        },
      };
      mockBootstrapThenScoped(tx);

      await service.start(session);

      const createdData = tx.attempt.create.mock.calls[0][0].data;
      expect(createdData.optionOrderJson).toBeNull();
    });
  });
```

- [ ] **Step 2: Run the tests to verify the new/changed ones fail**

Run: `npm run test:exam-runtime -- attempt.service.spec` (from repo root)
Expected: FAIL — `getCurrent`/`start` still use the old live-query `loadSections` and flat question-only selection; the new tests' expectations about `sectionSnapshotJson`/`optionOrderJson`/pool-drawing don't match current behavior.

- [ ] **Step 3: Rewrite `attempt.service.ts`**

Replace `apps/exam-runtime/src/attempts/attempt.service.ts` in full:
```typescript
import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantPrismaService } from '@exam-platform/shared';
import { AttemptSettlementService } from '../grading/attempt-settlement.service';
import { MonitoringGateway } from '../monitoring/monitoring.gateway';
import { CandidateSession } from '../candidate-auth/current-candidate.decorator';
import { AnswerDto } from './dto/answer.dto';
import { StartAttemptDto } from './dto/start-attempt.dto';
import { getProctoringEventSeverity } from './proctoring-severity';
import { ReportProctoringEventDto } from './dto/report-proctoring-event.dto';
import { shuffle } from './shuffle';

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

interface SectionSnapshotEntry {
  sectionId: string;
  title: string;
  questionIds: string[];
}

interface AttemptAnswerSummary {
  questionId: string;
  selectedOptionIds: string[];
  isMarkedForReview: boolean;
}

interface AttemptMessageSummary {
  id: string;
  body: string;
  sentAt: Date;
}

interface AttemptPreviewResponse {
  exam: { title: string; instructions: string | null; durationMinutes: number };
}

interface AttemptStateResponse {
  status: string;
  remainingSeconds: number;
  sections: AttemptSection[];
  answers: AttemptAnswerSummary[];
  messages: AttemptMessageSummary[];
}

export type AttemptCurrentResponse = AttemptPreviewResponse | AttemptStateResponse;

@Injectable()
export class AttemptService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly attemptSettlement: AttemptSettlementService,
    private readonly monitoringGateway: MonitoringGateway,
  ) {}

  async getCurrent(session: CandidateSession): Promise<AttemptCurrentResponse> {
    const { organizationId, exam, invitation } = await this.resolveContext(session.invitationId);

    return this.tenantPrisma.forTenant({ organizationId, isSuperAdmin: false }, async (tx) => {
      const attempt = await tx.attempt.findUnique({ where: { invitationId: invitation.id } });
      if (!attempt) {
        return { exam: { title: exam.title, instructions: exam.instructions, durationMinutes: exam.durationMinutes } };
      }

      const settled = await this.attemptSettlement.settleIfExpired(tx, exam, attempt);
      const sections = await this.loadSections(tx, settled.sectionSnapshotJson, settled.optionOrderJson);
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

  async start(session: CandidateSession, dto: StartAttemptDto = {}): Promise<{ id: string; status: string }> {
    const { organizationId, exam, invitation } = await this.resolveContext(session.invitationId);

    return this.tenantPrisma.forTenant({ organizationId, isSuperAdmin: false }, async (tx) => {
      const existing = await tx.attempt.findUnique({ where: { invitationId: invitation.id } });
      if (existing) {
        return { id: existing.id, status: existing.status };
      }

      const sections = await tx.examSection.findMany({
        where: { examId: exam.id },
        orderBy: { orderIndex: 'asc' },
        include: { questions: { orderBy: { orderIndex: 'asc' } }, poolTags: true },
      });

      const sectionSnapshot: SectionSnapshotEntry[] = [];
      for (const section of sections) {
        let questionIds: string[];
        if (section.selectionMode === 'pool') {
          const tagIds = section.poolTags.map((poolTag) => poolTag.tagId);
          const candidates = await tx.question.findMany({
            where: {
              organizationId,
              status: 'active',
              ...(section.poolDifficulty ? { difficulty: section.poolDifficulty } : {}),
              AND: tagIds.map((tagId) => ({ tags: { some: { tagId } } })),
            },
            select: { id: true },
          });
          questionIds = shuffle(candidates)
            .slice(0, section.poolSize ?? 0)
            .map((candidate) => candidate.id);
        } else {
          const fixedIds = section.questions.map((link) => link.questionId);
          questionIds = exam.randomizeOrder ? shuffle(fixedIds) : fixedIds;
        }
        sectionSnapshot.push({ sectionId: section.id, title: section.title, questionIds });
      }

      const questionIds = sectionSnapshot.flatMap((section) => section.questionIds);

      let optionOrderJson: string | null = null;
      if (exam.randomizeOrder) {
        const questions = await tx.question.findMany({ where: { id: { in: questionIds } }, include: { options: true } });
        const optionOrder: Record<string, string[]> = {};
        for (const question of questions) {
          optionOrder[question.id] = shuffle(question.options.map((option) => option.id));
        }
        optionOrderJson = JSON.stringify(optionOrder);
      }

      const attempt = await tx.attempt.create({
        data: {
          invitationId: invitation.id,
          candidateId: invitation.candidateId,
          examId: exam.id,
          questionOrderJson: JSON.stringify(questionIds),
          sectionSnapshotJson: JSON.stringify(sectionSnapshot),
          optionOrderJson,
          deviceFingerprint: dto.deviceFingerprint,
        },
      });
      this.monitoringGateway.emitAttemptStatus(exam.id, {
        attemptId: attempt.id,
        candidateId: invitation.candidateId,
        status: attempt.status,
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

  private async loadSections(
    tx: Prisma.TransactionClient,
    sectionSnapshotJson: string,
    optionOrderJson: string | null,
  ): Promise<AttemptSection[]> {
    const snapshot: SectionSnapshotEntry[] = JSON.parse(sectionSnapshotJson);
    const allQuestionIds = snapshot.flatMap((section) => section.questionIds);
    const questions = await tx.question.findMany({ where: { id: { in: allQuestionIds } }, include: { options: true } });
    const questionsById = new Map(questions.map((question) => [question.id, question]));
    const optionOrder: Record<string, string[]> | null = optionOrderJson ? JSON.parse(optionOrderJson) : null;

    return snapshot.map((section) => ({
      title: section.title,
      questions: section.questionIds
        .map((questionId) => questionsById.get(questionId))
        .filter((question): question is NonNullable<typeof question> => question !== undefined)
        .map((question) => {
          const order = optionOrder?.[question.id];
          const orderedOptions = order
            ? order
                .map((optionId) => question.options.find((option) => option.id === optionId))
                .filter((option): option is NonNullable<typeof option> => option !== undefined)
            : question.options;
          return {
            id: question.id,
            text: question.text,
            type: question.type,
            marks: question.marks,
            options: orderedOptions.map((option) => ({ id: option.id, text: option.text })),
          };
        }),
    }));
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:exam-runtime -- attempt.service.spec`
Expected: all tests pass — in `getCurrent`, 2 existing tests updated (`'returns the full attempt state...'`, `'returns unread messages...'`) plus 1 new test (`'reorders a question's options according to optionOrderJson...'`), with the other 2 `getCurrent` tests (`'throws UnauthorizedException...'`, `'resolves tenant context...'`) unchanged; in `start`, all 6 existing tests updated for the new `examSection` mock shape (`id`/`selectionMode`/`poolTags` fields), plus 4 new tests (`'preserves a fixed section's stored order...'`, `'draws a pool section's questions...'`, `'builds optionOrderJson...when randomizeOrder is on'`, `'leaves optionOrderJson null when randomizeOrder is off'`); the other describe blocks (`answer`, `submit`, `reportProctoringEvent`) are untouched and still pass.

- [ ] **Step 5: Add pool-draw and option-order-stability e2e scenarios**

In `apps/api/test/exam-taking-runtime.e2e-spec.ts`, add two new tests to the main `describe('Exam-Taking Runtime HTTP flow', ...)` block, after the negative-marking test added in Phase 4a (`'applies negative marking and floors the total score at zero'`):

```typescript
  it('draws a pool section\'s questions matching its tag criteria at attempt-start', async () => {
    const poolExamResponse = await request(adminHttp)
      .post('/api/v1/exams')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ title: 'Pool Exam Round' })
      .expect(201);
    const poolExamId = poolExamResponse.body.id;

    const poolSectionResponse = await request(adminHttp)
      .post(`/api/v1/exams/${poolExamId}/sections`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ title: 'Pool Section' })
      .expect(201);
    const poolSectionId = poolSectionResponse.body.id;

    const tagName = `pool-tag-${randomUUID()}`;
    const poolQuestionIds: string[] = [];
    for (let i = 0; i < 3; i++) {
      const createdQuestion = await request(adminHttp)
        .post('/api/v1/questions')
        .set('Authorization', `Bearer ${recruiterAccessToken}`)
        .send({
          type: 'true_false', text: `Pool question ${i}`, difficulty: 'medium', marks: 1, tags: [tagName],
          options: [{ text: 'True', isCorrect: true }, { text: 'False', isCorrect: false }],
        })
        .expect(201);
      poolQuestionIds.push(createdQuestion.body.id);
    }
    const poolTagId = poolQuestionIds.length > 0
      ? (await request(adminHttp).get(`/api/v1/questions/${poolQuestionIds[0]}`).set('Authorization', `Bearer ${recruiterAccessToken}`).expect(200)).body.tags[0].id
      : '';

    await request(adminHttp)
      .patch(`/api/v1/exams/${poolExamId}/sections/${poolSectionId}`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ title: 'Pool Section', selectionMode: 'pool', poolSize: 2, poolTagIds: [poolTagId] })
      .expect(200);

    await request(adminHttp)
      .post(`/api/v1/exams/${poolExamId}/publish`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(201);

    const grace = await request(adminHttp)
      .post('/api/v1/candidates')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ email: 'grace@ci-attempt.test', name: 'Grace' })
      .expect(201);
    const graceInvite = await request(adminHttp)
      .post(`/api/v1/exams/${poolExamId}/invitations`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ candidateIds: [grace.body.id] })
      .expect(201);
    const graceAccessToken = (
      await request(runtimeHttp).post('/api/v1/candidate-auth/redeem').send({ token: graceInvite.body.created[0].token }).expect(200)
    ).body.accessToken;

    await request(runtimeHttp).post('/api/v1/attempt/start').set('Authorization', `Bearer ${graceAccessToken}`).expect(201);

    const stateResponse = await request(runtimeHttp)
      .get('/api/v1/attempt/current')
      .set('Authorization', `Bearer ${graceAccessToken}`)
      .expect(200);

    const receivedQuestionIds = stateResponse.body.sections.flatMap((section: { questions: { id: string }[] }) => section.questions.map((question) => question.id));
    expect(receivedQuestionIds).toHaveLength(2);
    receivedQuestionIds.forEach((id: string) => expect(poolQuestionIds).toContain(id));
  });

  it('serves a stable option order across repeated reads when randomizeOrder is on', async () => {
    const randExamResponse = await request(adminHttp)
      .post('/api/v1/exams')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ title: 'Randomized Round', randomizeOrder: true })
      .expect(201);
    const randExamId = randExamResponse.body.id;

    const randSectionResponse = await request(adminHttp)
      .post(`/api/v1/exams/${randExamId}/sections`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ title: 'Section One' })
      .expect(201);
    const randSectionId = randSectionResponse.body.id;

    const manyOptionsQuestion = await request(adminHttp)
      .post('/api/v1/questions')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({
        type: 'single_mcq', text: 'Pick one of many', difficulty: 'easy', marks: 1,
        options: [
          { text: 'A', isCorrect: true }, { text: 'B', isCorrect: false }, { text: 'C', isCorrect: false },
          { text: 'D', isCorrect: false }, { text: 'E', isCorrect: false },
        ],
      })
      .expect(201);

    await request(adminHttp)
      .put(`/api/v1/exams/${randExamId}/sections/${randSectionId}/questions`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ questionIds: [manyOptionsQuestion.body.id] })
      .expect(200);

    await request(adminHttp)
      .post(`/api/v1/exams/${randExamId}/publish`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(201);

    const henry = await request(adminHttp)
      .post('/api/v1/candidates')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ email: 'henry@ci-attempt.test', name: 'Henry' })
      .expect(201);
    const henryInvite = await request(adminHttp)
      .post(`/api/v1/exams/${randExamId}/invitations`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ candidateIds: [henry.body.id] })
      .expect(201);
    const henryAccessToken = (
      await request(runtimeHttp).post('/api/v1/candidate-auth/redeem').send({ token: henryInvite.body.created[0].token }).expect(200)
    ).body.accessToken;

    await request(runtimeHttp).post('/api/v1/attempt/start').set('Authorization', `Bearer ${henryAccessToken}`).expect(201);

    const firstRead = await request(runtimeHttp).get('/api/v1/attempt/current').set('Authorization', `Bearer ${henryAccessToken}`).expect(200);
    const secondRead = await request(runtimeHttp).get('/api/v1/attempt/current').set('Authorization', `Bearer ${henryAccessToken}`).expect(200);

    const firstOrder = firstRead.body.sections[0].questions[0].options.map((option: { id: string }) => option.id);
    const secondOrder = secondRead.body.sections[0].questions[0].options.map((option: { id: string }) => option.id);
    expect(firstOrder).toEqual(secondOrder);
  });
```

- [ ] **Step 6: Run the exam-taking-runtime e2e spec**

Run: `npm run test:api:e2e -- exam-taking-runtime` (from repo root)
Expected: all tests pass, including the two new scenarios, and every pre-existing test in this file (including Phase 4a's negative-marking scenario) still passes unchanged.

- [ ] **Step 7: Run the full exam-runtime and api suites**

Run: `npm run test:exam-runtime`, `npm run test:api`, `npm run test:api:e2e` (from repo root)
Expected: all suites passing, no regressions.

- [ ] **Step 8: Commit**

```bash
git add apps/exam-runtime/src/attempts/attempt.service.ts apps/exam-runtime/src/attempts/attempt.service.spec.ts apps/api/test/exam-taking-runtime.e2e-spec.ts
git commit -m "feat: draw pool sections and randomize question/option order at attempt-start, snapshot section structure per attempt"
```

---

### Task 5: Final verification

**Files:** none — this task runs the full regression suite and confirms end-to-end wiring; no code changes expected unless verification surfaces a real gap, in which case follow the same TDD pattern as the task where the gap belongs.

**Interfaces:** none — this task consumes the full surface built across Tasks 1-4.

- [ ] **Step 1: Run the full exam-runtime unit suite**

Run: `npm run test:exam-runtime` (from repo root)
Expected: all suites passing.

- [ ] **Step 2: Run the full api unit suite**

Run: `npm run test:api` (from repo root)
Expected: all suites passing.

- [ ] **Step 3: Run the full api e2e suite (serially, per this project's documented pre-existing parallel-worker flake)**

Run: `npm run test:api:e2e -- --runInBand` (from repo root)
Expected: all suites passing, including `exam-builder` (pool publish-validation) and `exam-taking-runtime` (pool draw + option-order stability + Phase 4a's negative-marking scenario).

- [ ] **Step 4: Build both apps cleanly**

Run: `npx nest build` from `apps/exam-runtime/`, then from `apps/api/`.
Expected: both build with no errors.

- [ ] **Step 5: Confirm migration status is clean**

Run (from `apps/api/`): `npx prisma migrate status`
Expected: reports all migrations applied, no drift.

- [ ] **Step 6: Record final verification (no commit needed for this task — it's verification-only)**

If Steps 1-5 all pass cleanly, Phase 4b's implementation is complete and ready for the final whole-branch review.
