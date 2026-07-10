# Phase 4c — Section Target Duration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a recruiter set an optional, purely informational target duration per exam section, surfaced to the candidate for pacing guidance — the third sub-phase of Phase 4.

**Architecture:** `ExamSection` gains one nullable `targetDurationMinutes` column. The admin section create/update API threads it through like any other optional field. `apps/exam-runtime`'s per-attempt section snapshot (`Attempt.sectionSnapshotJson`, introduced in Phase 4b) captures it at `start()` time alongside everything else the snapshot already carries, and `loadSections()` surfaces it in the candidate-facing response. No enforcement, no new `Attempt` state, no changes to the existing exam-wide deadline or to grading/settlement.

**Tech Stack:** Same as every prior phase — NestJS, Prisma (`sqlserver` provider via `@exam-platform/shared`), SQL Server, Jest/Supertest. No new dependencies.

## Global Constraints

- `targetDurationMinutes` carries no enforcement weight whatsoever — no lock, no auto-advance, no interaction with `settleIfExpired`/grading. It is display-only metadata.
- No sequential section locking of any kind — candidates can always revisit and re-answer any section, exactly as today. This was explicitly decided during brainstorming and must not be reintroduced.
- Omitting `targetDurationMinutes` from an update request leaves the stored value unchanged; explicitly sending `null` clears it — matching the existing conditional-spread idiom `ExamsService.update` already uses for `Exam`'s own optional fields.
- The candidate-facing field is captured in the section snapshot at `start()` time, not read live at every `getCurrent()` call — consistent with how section membership itself is snapshotted (Phase 4b), so a recruiter editing the value mid-attempt doesn't inconsistently affect an already-started candidate's view.
- Work happens directly on `main` (no feature branch) — established pattern for this project across every prior phase.
- Full spec: `docs/superpowers/specs/2026-07-10-phase-4c-section-target-duration-design.md`.

---

## File Structure

```
apps/api/
  prisma/
    schema.prisma                                          # Modify: ExamSection.targetDurationMinutes
    migrations/
      20260710110000_section_target_duration_schema/migration.sql  # Create
  src/
    exams/
      dto/create-exam-section.dto.ts                        # Modify: add targetDurationMinutes
      exams.service.ts                                      # Modify: createSection/updateSection pass it through
      exams.service.spec.ts                                 # Modify: existing tests + new targetDurationMinutes tests
  test/
    exam-builder.e2e-spec.ts                                # Modify: set + retrieve target duration round trip
    exam-taking-runtime.e2e-spec.ts                          # Modify: candidate sees target duration in attempt response
apps/exam-runtime/
  src/
    attempts/
      attempt.service.ts                                    # Modify: SectionSnapshotEntry/AttemptSection gain the field; start()/loadSections() thread it through
      attempt.service.spec.ts                                # Modify: existing snapshot-JSON fixtures + new tests
```

---

### Task 1: Schema — `ExamSection.targetDurationMinutes`

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260710110000_section_target_duration_schema/migration.sql`

**Interfaces:**
- Produces: `ExamSection.targetDurationMinutes: number | null`. Tasks 2 and 3 depend on this column existing and the Prisma client being regenerated.

- [ ] **Step 1: Add the column to the schema**

In `apps/api/prisma/schema.prisma`, modify the `ExamSection` model (add `targetDurationMinutes` after `poolDifficulty`):
```prisma
model ExamSection {
  id                    String                @id @default(uuid()) @db.UniqueIdentifier
  examId                String                @map("exam_id") @db.UniqueIdentifier
  title                 String
  orderIndex            Int                   @map("order_index")
  selectionMode         String                @default("fixed") @map("selection_mode")
  poolSize              Int?                  @map("pool_size")
  poolDifficulty        String?               @map("pool_difficulty")
  targetDurationMinutes Int?                  @map("target_duration_minutes")
  exam                  Exam                  @relation(fields: [examId], references: [id], onDelete: Cascade)
  questions             ExamSectionQuestion[]
  poolTags              ExamSectionPoolTag[]

  @@index([examId])
  @@map("exam_sections")
}
```

- [ ] **Step 2: Generate the migration**

Run (from `apps/api/`): `npx prisma migrate dev --create-only --name section_target_duration_schema`

If this hits the P3014 shadow-database permission error (the documented, established issue every prior schema-touching phase in this project has hit — see e.g. Phase 4a's and Phase 4b's Task 1 reports), hand-write the migration instead, cross-checking naming conventions against the real migrations already in the repo (`20260710100000_randomization_pool_selection_schema` is the closest recent analog for adding a nullable column to `exam_sections`). Rename the folder to `20260710110000_section_target_duration_schema` if the generated timestamp differs, so it sorts after `20260710100000_randomization_pool_selection_schema`.

Expected SQL:
```sql
-- AlterTable
ALTER TABLE [dbo].[exam_sections] ADD [target_duration_minutes] INT;
```

No RLS migration is needed — `exam_sections` has no RLS registration today (confirmed during Phase 4b's Task 1: it has no `organization_id` column at all, being a child table reached via `Exam`), and a new nullable column doesn't change that.

- [ ] **Step 3: Apply the migration and regenerate the client**

Run (from `apps/api/`): `npx prisma migrate deploy`, then `npx prisma generate`.

Expected: migration applies cleanly. Run `npx prisma migrate status` to confirm — should report all migrations applied, no drift.

- [ ] **Step 4: Verify the schema directly against the database**

```sql
SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'exam_sections' AND COLUMN_NAME = 'target_duration_minutes';
```
Expected: one row, `target_duration_minutes`, `int`, `YES` (nullable).

- [ ] **Step 5: Verify both apps' builds are clean**

Run `npx tsc --noEmit` from `apps/api/` and from `apps/exam-runtime/`.
Expected: both clean — this is a purely additive, nullable column with no code yet referencing it, so nothing should break.

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260710110000_section_target_duration_schema
git commit -m "feat: add ExamSection.targetDurationMinutes schema"
```

---

### Task 2: Admin API — set and retrieve a section's target duration

**Files:**
- Modify: `apps/api/src/exams/dto/create-exam-section.dto.ts`
- Modify: `apps/api/src/exams/exams.service.ts`
- Modify: `apps/api/src/exams/exams.service.spec.ts`
- Modify: `apps/api/test/exam-builder.e2e-spec.ts`

**Interfaces:**
- Consumes: `ExamSection.targetDurationMinutes` (Task 1).
- Produces: `CreateExamSectionDto.targetDurationMinutes?: number` (inherited by `UpdateExamSectionDto`). `ExamsService.createSection`/`updateSection` persist it. Task 3 doesn't depend on this task directly — it reads the column straight from the database in `attempt.service.ts`'s own query, independent of which API path set it.

- [ ] **Step 1: Add `targetDurationMinutes` to `CreateExamSectionDto`**

Replace `apps/api/src/exams/dto/create-exam-section.dto.ts` in full:
```typescript
import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class CreateExamSectionDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  targetDurationMinutes?: number;
}
```
`UpdateExamSectionDto extends CreateExamSectionDto` with its own additional pool fields but no override of `targetDurationMinutes`, so it inherits this field automatically — no separate change needed there.

- [ ] **Step 2: Write the failing service tests**

In `apps/api/src/exams/exams.service.spec.ts`, replace the existing `'creates a section appended after the current last orderIndex'` test with two tests — the original behavior plus a new targetDurationMinutes case:
```typescript
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
    expect(tx.examSection.create).toHaveBeenCalledWith({
      data: { examId: 'exam-1', title: 'Section B', orderIndex: 3, targetDurationMinutes: undefined },
    });
  });

  it('creates a section with a target duration when provided', async () => {
    const tx = {
      exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1' }) },
      examSection: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'section-1', orderIndex: 0, targetDurationMinutes: 20 }),
      },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await service.createSection(context, 'exam-1', { title: 'Section A', targetDurationMinutes: 20 });

    expect(tx.examSection.create).toHaveBeenCalledWith({
      data: { examId: 'exam-1', title: 'Section A', orderIndex: 0, targetDurationMinutes: 20 },
    });
  });
```

Then add two new tests after the existing `'updates a section's title without touching pool data when staying fixed'` test:
```typescript
  it('sets a target duration on update when provided', async () => {
    const tx = {
      exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1' }) },
      examSection: {
        findFirst: jest.fn().mockResolvedValue({ id: 'section-1', selectionMode: 'fixed', poolSize: null, poolDifficulty: null, targetDurationMinutes: null }),
        update: jest.fn().mockResolvedValue({ id: 'section-1', title: 'Section', targetDurationMinutes: 15 }),
      },
      examSectionQuestion: { deleteMany: jest.fn() },
      examSectionPoolTag: { deleteMany: jest.fn() },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await service.updateSection(context, 'exam-1', 'section-1', { title: 'Section', targetDurationMinutes: 15 });

    expect(tx.examSection.update).toHaveBeenCalledWith({
      where: { id: 'section-1' },
      data: { title: 'Section', selectionMode: 'fixed', poolSize: null, poolDifficulty: null, targetDurationMinutes: 15 },
      include: { poolTags: true },
    });
  });

  it('leaves an existing target duration untouched when omitted from the update', async () => {
    const tx = {
      exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1' }) },
      examSection: {
        findFirst: jest.fn().mockResolvedValue({ id: 'section-1', selectionMode: 'fixed', poolSize: null, poolDifficulty: null, targetDurationMinutes: 15 }),
        update: jest.fn().mockResolvedValue({ id: 'section-1', title: 'Renamed', targetDurationMinutes: 15 }),
      },
      examSectionQuestion: { deleteMany: jest.fn() },
      examSectionPoolTag: { deleteMany: jest.fn() },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await service.updateSection(context, 'exam-1', 'section-1', { title: 'Renamed' });

    expect(tx.examSection.update).toHaveBeenCalledWith({
      where: { id: 'section-1' },
      data: { title: 'Renamed', selectionMode: 'fixed', poolSize: null, poolDifficulty: null },
      include: { poolTags: true },
    });
  });
```

- [ ] **Step 3: Run the tests to verify the new/changed ones fail**

Run: `npm run test:api -- exams.service` (from repo root)
Expected: FAIL — `createSection`/`updateSection` don't pass `targetDurationMinutes` through yet, so the new tests' exact-`data`-object assertions don't match, and the modified `'creates a section appended after...'` test's assertion (now including `targetDurationMinutes: undefined`) doesn't match the current call either.

- [ ] **Step 4: Implement the service changes**

In `apps/api/src/exams/exams.service.ts`, update `createSection`'s `data` object (add `targetDurationMinutes: dto.targetDurationMinutes` after `orderIndex`):
```typescript
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
        data: { examId, title: dto.title, orderIndex, targetDurationMinutes: dto.targetDurationMinutes },
      });
    });
  }
```

In `updateSection`, add the conditional-spread for `targetDurationMinutes` to the `data` object, alongside the existing `title`/`selectionMode`/pool fields:
```typescript
      return tx.examSection.update({
        where: { id: sectionId },
        data: {
          title: dto.title,
          selectionMode: nextMode,
          poolSize: nextMode === 'pool' ? (dto.poolSize ?? section.poolSize) : null,
          poolDifficulty: nextMode === 'pool' ? (dto.poolDifficulty ?? section.poolDifficulty) : null,
          ...(nextMode === 'pool' && uniquePoolTagIds
            ? { poolTags: { create: uniquePoolTagIds.map((tagId) => ({ tagId })) } }
            : {}),
          ...(dto.targetDurationMinutes !== undefined ? { targetDurationMinutes: dto.targetDurationMinutes } : {}),
        },
        include: { poolTags: true },
      });
```
(This is the same `updateSection` method Phase 4b's Task 3 built — read the current full method first to confirm the exact surrounding code before inserting, since the `uniquePoolTagIds`/pool-tags conditional-spread line must stay exactly as-is; only the new `targetDurationMinutes` line is added.)

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test:api -- exams.service`
Expected: all tests pass — the 1 modified `createSection` test, 1 new `createSection` test, 2 new `updateSection` tests, and every pre-existing test unaffected (pool-mode tests don't send `targetDurationMinutes`, so the new conditional-spread contributes nothing to their expected `data` objects).

- [ ] **Step 6: Extend the exam-builder e2e spec**

In `apps/api/test/exam-builder.e2e-spec.ts`, add a new test to the `'Exam Builder HTTP flow'` describe block, after the existing pool-section test (`'rejects publishing an exam with an underfilled pool section...'`):
```typescript
  it('sets and retrieves a section\'s target duration', async () => {
    const examResponse = await request(app.getHttpServer())
      .post('/api/v1/exams')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ title: 'Timed Sections Round' })
      .expect(201);
    const timedExamId = examResponse.body.id;

    const sectionResponse = await request(app.getHttpServer())
      .post(`/api/v1/exams/${timedExamId}/sections`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ title: 'Section One', targetDurationMinutes: 20 })
      .expect(201);
    expect(sectionResponse.body.targetDurationMinutes).toBe(20);
    const timedSectionId = sectionResponse.body.id;

    const updateResponse = await request(app.getHttpServer())
      .patch(`/api/v1/exams/${timedExamId}/sections/${timedSectionId}`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ title: 'Section One', targetDurationMinutes: 25 })
      .expect(200);
    expect(updateResponse.body.targetDurationMinutes).toBe(25);

    const examDetailResponse = await request(app.getHttpServer())
      .get(`/api/v1/exams/${timedExamId}`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(200);
    const timedSection = examDetailResponse.body.sections.find((s: { id: string }) => s.id === timedSectionId);
    expect(timedSection.targetDurationMinutes).toBe(25);
  });
```

- [ ] **Step 7: Run the exam-builder e2e spec**

Run: `npm run test:api:e2e -- exam-builder` (from repo root)
Expected: all tests pass, including the new target-duration round trip.

- [ ] **Step 8: Run the full api unit and e2e suites**

Run: `npm run test:api` then `npm run test:api:e2e -- --runInBand` (from repo root; run e2e serially per this project's documented pre-existing parallel-worker DB-contention flake)
Expected: all suites passing, no regressions.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/exams apps/api/test/exam-builder.e2e-spec.ts
git commit -m "feat: let a recruiter set an optional target duration on an exam section"
```

---

### Task 3: Candidate-facing exposure — surface target duration in the attempt response

**Files:**
- Modify: `apps/exam-runtime/src/attempts/attempt.service.ts`
- Modify: `apps/exam-runtime/src/attempts/attempt.service.spec.ts`
- Modify: `apps/api/test/exam-taking-runtime.e2e-spec.ts`

**Interfaces:**
- Consumes: `ExamSection.targetDurationMinutes` (Task 1). Independent of Task 2's admin API — this task reads the column directly via its own Prisma query in `start()`.
- Produces: nothing further downstream in this plan — this is the last code task before final verification.

- [ ] **Step 1: Write the failing tests**

In `apps/exam-runtime/src/attempts/attempt.service.spec.ts`, update the three `getCurrent` tests whose fixtures construct `sectionSnapshotJson` to include `targetDurationMinutes` in both the stored snapshot and the expected response.

Replace `'returns the full attempt state with sections, questions (no isCorrect), and existing answers'`:
```typescript
    it('returns the full attempt state with sections, questions (no isCorrect), and existing answers', async () => {
      const attempt = {
        id: 'attempt-1', status: 'in_progress', startedAt: new Date(),
        questionOrderJson: JSON.stringify(['q1']),
        sectionSnapshotJson: JSON.stringify([{ sectionId: 'section-1', title: 'Section One', targetDurationMinutes: 20, questionIds: ['q1'] }]),
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
          { title: 'Section One', targetDurationMinutes: 20, questions: [{ id: 'q1', text: 'What is 2+2?', type: 'single_mcq', marks: 5, options: [{ id: 'opt-a', text: '4' }, { id: 'opt-b', text: '5' }] }] },
        ],
        answers: [{ questionId: 'q1', selectedOptionIds: ['opt-a'], isMarkedForReview: false }],
        messages: [],
      });
      expect((result as any).sections[0].questions[0]).not.toHaveProperty('isCorrect');
    });
```

Replace `'reorders a question's options according to optionOrderJson when present'`'s `sectionSnapshotJson` line only (keep the rest of that test unchanged):
```typescript
        sectionSnapshotJson: JSON.stringify([{ sectionId: 'section-1', title: 'Section One', targetDurationMinutes: null, questionIds: ['q1'] }]),
```

Replace `'returns unread messages and marks them read'`'s attempt fixture line (keep the rest unchanged):
```typescript
      const attempt = {
        id: 'attempt-1', status: 'in_progress', startedAt: new Date(),
        questionOrderJson: '[]', sectionSnapshotJson: '[]', optionOrderJson: null,
      };
```
(This one stays `'[]'` — an empty section list has nothing to carry a `targetDurationMinutes` value on, so no change needed here beyond confirming it still parses to an empty array.)

Add a new test to the `describe('start', ...)` block, after the existing `'preserves a fixed section's stored order when randomizeOrder is off'` test:
```typescript
    it('captures each section\'s targetDurationMinutes in the snapshot at start time', async () => {
      const tx = {
        attempt: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'attempt-1', status: 'in_progress' }) },
        examSection: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'section-1', title: 'Section One', selectionMode: 'fixed', poolSize: null, poolDifficulty: null, targetDurationMinutes: 20, poolTags: [], questions: [{ questionId: 'q1' }] },
            { id: 'section-2', title: 'Section Two', selectionMode: 'fixed', poolSize: null, poolDifficulty: null, targetDurationMinutes: null, poolTags: [], questions: [{ questionId: 'q2' }] },
          ]),
        },
      };
      mockBootstrapThenScoped(tx);

      await service.start(session);

      const createdData = tx.attempt.create.mock.calls[0][0].data;
      const snapshot = JSON.parse(createdData.sectionSnapshotJson);
      expect(snapshot).toEqual([
        { sectionId: 'section-1', title: 'Section One', targetDurationMinutes: 20, questionIds: ['q1'] },
        { sectionId: 'section-2', title: 'Section Two', targetDurationMinutes: null, questionIds: ['q2'] },
      ]);
    });
```

Also update every OTHER existing test in the `describe('start', ...)` block whose mocked `examSection.findMany` returns section objects — each mocked section object needs a `targetDurationMinutes: null` field added (the code will read `section.targetDurationMinutes` unconditionally when building the snapshot, so a mock missing this field would produce `undefined` instead of `null`; harmless for these tests since none of them assert on `sectionSnapshotJson`'s exact contents, but added anyway for consistency with the real `ExamSection` shape). Four tests are affected — the exact replacement mocked-section line for each:

`'creates a new attempt snapshotting the question order and section structure when none exists'` (the first test in this `describe` block) — replace its `examSection.findMany` mock's array entry:
```typescript
            { id: 'section-1', title: 'Section One', selectionMode: 'fixed', poolSize: null, poolDifficulty: null, targetDurationMinutes: null, poolTags: [], questions: [{ questionId: 'q1' }, { questionId: 'q2' }] },
```

`'records a device fingerprint on the attempt when the client provides one'`:
```typescript
            { id: 'section-1', title: 'Section One', selectionMode: 'fixed', poolSize: null, poolDifficulty: null, targetDurationMinutes: null, poolTags: [], questions: [{ questionId: 'q1' }] },
```

`'resolves tenant context via an unscoped bootstrap lookup followed by a properly scoped call'` (the `start` describe block's version, not the identically-named tests in `getCurrent`/`answer`/`submit`):
```typescript
            { id: 'section-1', title: 'Section One', selectionMode: 'fixed', poolSize: null, poolDifficulty: null, targetDurationMinutes: null, poolTags: [], questions: [{ questionId: 'q1' }, { questionId: 'q2' }] },
```

`'emits attempt:status when a new attempt is created'`:
```typescript
            { id: 'section-1', title: 'Section One', selectionMode: 'fixed', poolSize: null, poolDifficulty: null, targetDurationMinutes: null, poolTags: [], questions: [{ questionId: 'q1' }] },
```

In each case, only that one array-entry line changes (adding `targetDurationMinutes: null` after `poolDifficulty: null`) — the rest of the test (assertions, setup, `mockBootstrapThenScoped(tx)` call) stays exactly as it is today. The two idempotent-path tests (`'returns the existing attempt unchanged when one already exists'`, `'does not emit again when returning an already-existing attempt'`) don't call `examSection.findMany` at all (they short-circuit on an existing attempt) and need no change. `'preserves a fixed section's stored order when randomizeOrder is off'` and `'draws a pool section's questions matching tag and difficulty criteria, up to poolSize'` also don't assert on `sectionSnapshotJson` contents and can be left as-is (their mocked sections already lack `targetDurationMinutes`, which is harmless there for the same reason).

- [ ] **Step 2: Run the tests to verify the new/changed ones fail**

Run: `npm run test:exam-runtime -- attempt.service.spec` (from repo root)
Expected: FAIL — `SectionSnapshotEntry`/`AttemptSection` don't carry `targetDurationMinutes` yet, so the updated `getCurrent` tests' exact-equality assertions and the new `start` test's snapshot assertion don't match current output.

- [ ] **Step 3: Implement the change**

In `apps/exam-runtime/src/attempts/attempt.service.ts`, update the `AttemptSection` and `SectionSnapshotEntry` interfaces:
```typescript
interface AttemptSection {
  title: string;
  targetDurationMinutes: number | null;
  questions: AttemptQuestion[];
}

interface SectionSnapshotEntry {
  sectionId: string;
  title: string;
  targetDurationMinutes: number | null;
  questionIds: string[];
}
```

In `start()`, update the `examSection.findMany` call to also select `targetDurationMinutes` (it's a scalar column with no `include`/`select` clause currently restricting it, so it already comes back — no query change needed there, only the snapshot-building line), and update the `sectionSnapshot.push(...)` call:
```typescript
        sectionSnapshot.push({
          sectionId: section.id,
          title: section.title,
          targetDurationMinutes: section.targetDurationMinutes,
          questionIds,
        });
```

In `loadSections()`, update the returned section object:
```typescript
    return snapshot.map((section) => ({
      title: section.title,
      targetDurationMinutes: section.targetDurationMinutes,
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:exam-runtime -- attempt.service.spec`
Expected: all tests pass — the 2 modified `getCurrent` tests (`'returns the full attempt state...'` fully replaced, `'reorders a question's options...'` with its one snapshot-JSON line changed; `'returns unread messages...'` needed no change at all), the 1 new `start` test, the 4 other `start` tests with their mock sections updated for consistency, and every other describe block (`answer`, `submit`, `reportProctoringEvent`) unaffected.

- [ ] **Step 5: Add an e2e scenario**

In `apps/api/test/exam-taking-runtime.e2e-spec.ts`, add a new test to the main `describe('Exam-Taking Runtime HTTP flow', ...)` block, after the option-order-stability test added in Phase 4b (`'serves a stable option order across repeated reads when randomizeOrder is on'`):
```typescript
  it('surfaces a section\'s target duration to the candidate', async () => {
    const timedExamResponse = await request(adminHttp)
      .post('/api/v1/exams')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ title: 'Timed Section Round' })
      .expect(201);
    const timedExamId = timedExamResponse.body.id;

    const timedSectionResponse = await request(adminHttp)
      .post(`/api/v1/exams/${timedExamId}/sections`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ title: 'Section One', targetDurationMinutes: 15 })
      .expect(201);
    const timedSectionId = timedSectionResponse.body.id;

    const timedQuestion = await request(adminHttp)
      .post('/api/v1/questions')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({
        type: 'true_false', text: 'Timed section question', difficulty: 'easy', marks: 1,
        options: [{ text: 'True', isCorrect: true }, { text: 'False', isCorrect: false }],
      })
      .expect(201);

    await request(adminHttp)
      .put(`/api/v1/exams/${timedExamId}/sections/${timedSectionId}/questions`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ questionIds: [timedQuestion.body.id] })
      .expect(200);

    await request(adminHttp)
      .post(`/api/v1/exams/${timedExamId}/publish`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(201);

    const ivy = await request(adminHttp)
      .post('/api/v1/candidates')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ email: 'ivy@ci-attempt.test', name: 'Ivy' })
      .expect(201);
    const ivyInvite = await request(adminHttp)
      .post(`/api/v1/exams/${timedExamId}/invitations`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ candidateIds: [ivy.body.id] })
      .expect(201);
    const ivyAccessToken = (
      await request(runtimeHttp).post('/api/v1/candidate-auth/redeem').send({ token: ivyInvite.body.created[0].token }).expect(200)
    ).body.accessToken;

    await request(runtimeHttp).post('/api/v1/attempt/start').set('Authorization', `Bearer ${ivyAccessToken}`).expect(201);

    const stateResponse = await request(runtimeHttp)
      .get('/api/v1/attempt/current')
      .set('Authorization', `Bearer ${ivyAccessToken}`)
      .expect(200);

    expect(stateResponse.body.sections[0].targetDurationMinutes).toBe(15);
  });
```

- [ ] **Step 6: Run the exam-taking-runtime e2e spec**

Run: `npm run test:api:e2e -- exam-taking-runtime` (from repo root)
Expected: all tests pass, including the new target-duration exposure scenario, and every pre-existing test in this file (including Phase 4a's and Phase 4b's own additions) still passes unchanged.

- [ ] **Step 7: Run the full exam-runtime and api suites**

Run: `npm run test:exam-runtime`, `npm run test:api`, `npm run test:api:e2e -- --runInBand` (from repo root)
Expected: all suites passing, no regressions.

- [ ] **Step 8: Commit**

```bash
git add apps/exam-runtime/src/attempts/attempt.service.ts apps/exam-runtime/src/attempts/attempt.service.spec.ts apps/api/test/exam-taking-runtime.e2e-spec.ts
git commit -m "feat: surface a section's target duration to the candidate via the attempt snapshot"
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

- [ ] **Step 3: Run the full api e2e suite (serially, per this project's documented pre-existing parallel-worker flake)**

Run: `npm run test:api:e2e -- --runInBand` (from repo root)
Expected: all suites passing, including `exam-builder` (target-duration round trip) and `exam-taking-runtime` (target-duration exposure).

- [ ] **Step 4: Build both apps cleanly**

Run: `npx nest build` from `apps/exam-runtime/`, then from `apps/api/`.
Expected: both build with no errors.

- [ ] **Step 5: Confirm migration status is clean**

Run (from `apps/api/`): `npx prisma migrate status`
Expected: reports all migrations applied, no drift.

- [ ] **Step 6: Record final verification (no commit needed for this task — it's verification-only)**

If Steps 1-5 all pass cleanly, Phase 4c's implementation is complete and ready for the final whole-branch review.
