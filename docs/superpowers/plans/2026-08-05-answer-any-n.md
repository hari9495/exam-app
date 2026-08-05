# Answer Any N of M Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a section show `M` questions but require only `N` to be answered (e.g. 5 code questions, answer any 3), scoring the best `N` attempted out of `N`.

**Architecture:** A new nullable `ExamSection.requiredCount` column (null = today's "answer all"), validated at publish, frozen into each attempt's `sectionSnapshotJson`, and consumed by a single shared `selectCountedAnswers()` helper in `packages/shared` that both exam-runtime's settlement and the API's reports service call — so the best-N rule has exactly one home.

**Tech Stack:** NestJS + Prisma (SQL Server) on apps/api and apps/exam-runtime, Next.js + React Query on apps/web, shared library in packages/shared, Jest across all four.

## Global Constraints

- `requiredCount` is `Int?` — `null` means every question is required (today's behaviour). Existing exams must be bit-for-bit unaffected: no backfill, no data migration beyond adding the nullable column.
- `requiredCount === M` normalises to `null` on write — it *is* "answer all", and two representations of one meaning is a bug waiting to happen.
- Best-N ties break by the question's position in the section's `questionIds`, never by object key order.
- `sectionMax` = sum of the **top `requiredCount` marks across all `M` questions**, including ones never opened. Never `requiredCount × mark` — a pool's eligible bank can change after publish, and the scoring path must degrade instead of throwing mid-settlement.
- The rule must be applied at **both** `finalize()` and `finalizeManualGrade()`. A section mixing MCQ and code is scored twice.
- Section edits ride the existing `PATCH /exams/:id/sections/:sectionId` and inherit `assertExamMutable()`. Do not add new locking.
- Never store anything on `ExamSectionQuestion` — `exams.service.ts:901-904` rebuilds that table by delete-then-recreate on every question save, which would wipe it.
- Write migration SQL by hand as a small precise `ALTER`, matching `20260805130000_exam_section_weight`. Apply with `npx prisma migrate deploy --schema=apps/api/prisma/schema.prisma`.
- Run each workspace's Jest suite **one at a time** — concurrent runs produce phantom failures on this machine.

---

### Task 1: Schema — add `requiredCount` as a nullable column

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (`ExamSection` model, ~line 357-376)
- Create: `apps/api/prisma/migrations/20260806090000_exam_section_required_count/migration.sql`

**Interfaces:**
- Produces: `ExamSection.requiredCount: number | null` on the generated Prisma Client, consumed by every later task.

- [ ] **Step 1: Add the field to the schema**

In `apps/api/prisma/schema.prisma`, add to the `ExamSection` model immediately after the `weightPercent` line:

```prisma
  // How many of this section's questions the candidate must actually answer. null = all of
  // them (the default and today's behaviour). When set, the best `requiredCount` answers are
  // scored, out of `requiredCount` questions -- see docs/superpowers/specs/
  // 2026-08-05-answer-any-n-design.md. Publish enforces 1 <= requiredCount <= M and that all
  // candidate questions carry equal marks.
  requiredCount         Int?                  @map("required_count")
```

- [ ] **Step 2: Write the migration**

Create `apps/api/prisma/migrations/20260806090000_exam_section_required_count/migration.sql`:

```sql
ALTER TABLE [dbo].[exam_sections] ADD [required_count] INT NULL;
```

- [ ] **Step 3: Apply locally and regenerate the client**

Run from the repo root:
```bash
cd apps/api && npx prisma migrate deploy --schema=prisma/schema.prisma && npx prisma generate --schema=prisma/schema.prisma
```
Expected: `Applying migration 20260806090000_exam_section_required_count` then `All migrations have been successfully applied.` and `✔ Generated Prisma Client`.

- [ ] **Step 4: Verify nothing broke**

Run: `cd apps/api && npx tsc --noEmit`
Expected: no output (clean).

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260806090000_exam_section_required_count
git commit -m "feat(exams): add nullable requiredCount column to ExamSection"
```

---

### Task 2: Shared `selectCountedAnswers()` helper (pure function + tests)

**Files:**
- Create: `packages/shared/src/grading/select-counted-answers.ts`
- Create: `packages/shared/src/grading/select-counted-answers.spec.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Consumes: nothing (pure function, no DB access).
- Produces:
  - `CountableQuestion = { questionId: string; marks: number; marksAwarded: number }`
  - `CountedSelection = { countedQuestionIds: string[]; score: number; maxScore: number }`
  - `selectCountedAnswers(questions: CountableQuestion[], requiredCount: number | null | undefined): CountedSelection`

  Used by Task 4 (settlement) and Task 6 (reports). `questions` must be supplied in the section's `questionIds` order — the function relies on that order for tie-breaking and does not re-derive it.

- [ ] **Step 1: Write the failing tests**

Create `packages/shared/src/grading/select-counted-answers.spec.ts`:

```ts
import { selectCountedAnswers } from './select-counted-answers';

const q = (questionId: string, marks: number, marksAwarded: number) => ({ questionId, marks, marksAwarded });

describe('selectCountedAnswers', () => {
  it('counts every question when requiredCount is null (today\'s behaviour)', () => {
    const result = selectCountedAnswers([q('a', 5, 5), q('b', 5, 0)], null);
    expect(result).toEqual({ countedQuestionIds: ['a', 'b'], score: 5, maxScore: 10 });
  });

  it('counts every question when requiredCount is undefined (legacy snapshot with no key)', () => {
    const result = selectCountedAnswers([q('a', 5, 5), q('b', 5, 0)], undefined);
    expect(result).toEqual({ countedQuestionIds: ['a', 'b'], score: 5, maxScore: 10 });
  });

  it('keeps only the best N when more than N were attempted', () => {
    // Best 3 of 5, all worth 10. Awarded 10/0/10/7/0 -> keep a (10), c (10), d (7) = 27 of 30.
    const result = selectCountedAnswers(
      [q('a', 10, 10), q('b', 10, 0), q('c', 10, 10), q('d', 10, 7), q('e', 10, 0)],
      3,
    );
    expect(result.countedQuestionIds.sort()).toEqual(['a', 'c', 'd']);
    expect(result.score).toBe(27);
    expect(result.maxScore).toBe(30);
  });

  it('breaks ties by question order, not by object key order', () => {
    // All tied at 5. The first three in the supplied order must win, deterministically.
    const result = selectCountedAnswers(
      [q('a', 10, 5), q('b', 10, 5), q('c', 10, 5), q('d', 10, 5)],
      3,
    );
    expect(result.countedQuestionIds).toEqual(['a', 'b', 'c']);
  });

  it('still scores out of N when FEWER than N were answered', () => {
    // Required 3, only 2 attempted. The empty slot contributes 0 but still counts toward max.
    const result = selectCountedAnswers(
      [q('a', 10, 10), q('b', 10, 8), q('c', 10, 0), q('d', 10, 0), q('e', 10, 0)],
      3,
    );
    expect(result.score).toBe(18);
    expect(result.maxScore).toBe(30);
  });

  it('takes the top N MARKS for the denominator, even when the bank drifted to unequal marks', () => {
    // Publish validation normally forbids this, but a pool's eligible bank can change after
    // publish. Denominator must be the best achievable (20+20+10 = 50), never throw.
    const result = selectCountedAnswers(
      [q('a', 10, 10), q('b', 10, 0), q('c', 10, 0), q('d', 20, 0), q('e', 20, 0)],
      3,
    );
    expect(result.maxScore).toBe(50);
    expect(result.score).toBe(10);
  });

  it('never returns a negative score -- a section floored at zero under negative marking', () => {
    const result = selectCountedAnswers([q('a', 5, -3), q('b', 5, -2), q('c', 5, -1)], 2);
    expect(result.score).toBe(0);
  });

  it('returns an empty selection for a section with no questions', () => {
    expect(selectCountedAnswers([], 3)).toEqual({ countedQuestionIds: [], score: 0, maxScore: 0 });
  });

  it('clamps a requiredCount larger than the question count', () => {
    const result = selectCountedAnswers([q('a', 10, 10), q('b', 10, 4)], 5);
    expect(result.score).toBe(14);
    expect(result.maxScore).toBe(20);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd packages/shared && npx jest select-counted-answers`
Expected: FAIL — `Cannot find module './select-counted-answers'`.

- [ ] **Step 3: Implement**

Create `packages/shared/src/grading/select-counted-answers.ts`:

```ts
export interface CountableQuestion {
  questionId: string;
  marks: number;
  /** 0 for an unanswered question -- callers resolve a missing Answer row to 0 before calling. */
  marksAwarded: number;
}

export interface CountedSelection {
  countedQuestionIds: string[];
  score: number;
  maxScore: number;
}

// Picks which of a section's answers actually count toward its score.
//
// `requiredCount` null/undefined means "all of them" -- the pre-feature behaviour, and what a
// legacy attempt snapshot (written before this shipped) resolves to.
//
// `questions` MUST arrive in the section's own questionIds order: that order is the tie-breaker,
// so that two candidates with identical marks always get the same questions counted, and a
// re-run of grading reproduces the same result. Sorting by marksAwarded alone would leave ties
// resolved by whatever order the array happened to arrive in.
//
// The denominator is the top `requiredCount` MARKS across every question -- including ones the
// candidate never opened -- not `requiredCount * mark`. Publish validation normally guarantees
// equal marks, but a pool section's eligible bank can change after publish, so this has to stay
// well-defined for a mixed-marks draw rather than throwing while settling a live attempt.
export function selectCountedAnswers(
  questions: CountableQuestion[],
  requiredCount: number | null | undefined,
): CountedSelection {
  const limit = requiredCount == null ? questions.length : Math.min(requiredCount, questions.length);

  const counted = questions
    .map((question, index) => ({ question, index }))
    .sort((a, b) => b.question.marksAwarded - a.question.marksAwarded || a.index - b.index)
    .slice(0, limit);

  const score = counted.reduce((sum, entry) => sum + entry.question.marksAwarded, 0);

  const maxScore = questions
    .map((question) => question.marks)
    .sort((a, b) => b - a)
    .slice(0, limit)
    .reduce((sum, marks) => sum + marks, 0);

  return {
    // Restored to the section's own order so downstream display is stable and readable.
    countedQuestionIds: counted.sort((a, b) => a.index - b.index).map((entry) => entry.question.questionId),
    score: Math.max(0, score),
    maxScore,
  };
}
```

- [ ] **Step 4: Export it from the package**

In `packages/shared/src/index.ts`, add at the end:

```ts
export * from './grading/select-counted-answers';
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd packages/shared && npx jest select-counted-answers`
Expected: PASS, 9/9.

- [ ] **Step 6: Build the package so dependents see the new export**

Run: `npm run build --workspace=packages/shared`
Expected: no output (tsc clean). Skipping this makes Task 4's import fail to resolve.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/grading packages/shared/src/index.ts
git commit -m "feat(shared): add selectCountedAnswers for best-N section scoring"
```

---

### Task 3: `requiredCount` through the section DTO and service

**Files:**
- Modify: `apps/api/src/exams/dto/update-exam-section.dto.ts`
- Modify: `apps/api/src/exams/exams.service.ts` (`updateSection`, ~line 710-740; `duplicateSection`, ~line 765-790; whole-exam `duplicate`, ~line 597-615)
- Modify: `apps/api/src/exams/dto/update-exam-section.dto.spec.ts`
- Modify: `apps/api/src/exams/exams.service.spec.ts`

**Interfaces:**
- Consumes: `ExamSection.requiredCount` (Task 1).
- Produces: `UpdateExamSectionDto.requiredCount?: number | null`, accepted by `PATCH /exams/:id/sections/:sectionId`. Consumed by Task 7's frontend.

- [ ] **Step 1: Write the failing DTO validation tests**

In `apps/api/src/exams/dto/update-exam-section.dto.spec.ts`, add inside the existing `describe('UpdateExamSectionDto', ...)` block:

```ts
  it('accepts a partial update carrying only requiredCount', () => {
    expect(errorsFor({ requiredCount: 3 })).toEqual([]);
  });

  it('accepts null requiredCount, which clears the requirement back to "answer all"', () => {
    expect(errorsFor({ requiredCount: null })).toEqual([]);
  });

  it.each([0, -1, 2.5])('rejects a requiredCount that is not a positive integer (%p)', (requiredCount) => {
    expect(errorsFor({ requiredCount }).length).toBeGreaterThan(0);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && npx jest update-exam-section.dto`
Expected: FAIL — `requiredCount: 3` currently produces a `property requiredCount should not exist`-style failure or the range tests pass vacuously.

- [ ] **Step 3: Add the field to the DTO**

In `apps/api/src/exams/dto/update-exam-section.dto.ts`, add after the existing `weightPercent` field:

```ts
  // null clears the requirement (back to "every question must be answered"), so this is
  // ValidateIf-guarded rather than @IsOptional -- @IsOptional() would skip validation for an
  // explicit null too, but here null is a meaningful value we want to allow through untouched
  // while still rejecting 0, negatives and fractions.
  @ValidateIf((o) => o.requiredCount !== null && o.requiredCount !== undefined)
  @IsInt()
  @Min(1)
  requiredCount?: number | null;
```

- [ ] **Step 4: Run the DTO tests to verify they pass**

Run: `cd apps/api && npx jest update-exam-section.dto`
Expected: PASS, full file.

- [ ] **Step 5: Write the failing service tests**

In `apps/api/src/exams/exams.service.spec.ts`, add inside the `describe('duplicateSection', ...)` block:

```ts
    it("copies the source section's requiredCount onto the duplicate", async () => {
      const tx = {
        exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1', status: 'draft' }) },
        attempt: { count: jest.fn().mockResolvedValue(0) },
        examSection: {
          findFirst: jest
            .fn()
            .mockResolvedValueOnce({
              id: 'section-1',
              title: 'Coding',
              selectionMode: 'fixed',
              poolSize: null,
              poolDifficulty: null,
              targetDurationMinutes: null,
              weightPercent: 100,
              requiredCount: 3,
              questions: [],
              poolTags: [],
            })
            .mockResolvedValueOnce(null),
          create: jest.fn().mockResolvedValue({ id: 'section-2', requiredCount: 3 }),
        },
        examSectionQuestion: { createMany: jest.fn() },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await service.duplicateSection(context, 'exam-1', 'section-1');

      expect(tx.examSection.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ requiredCount: 3 }) }),
      );
    });
```

And add a normalisation test next to the existing proctoring/section update tests:

```ts
  it('normalises requiredCount equal to the section question count down to null', async () => {
    const tx = {
      exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1', status: 'draft' }) },
      attempt: { count: jest.fn().mockResolvedValue(0) },
      examSection: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'section-1', examId: 'exam-1', title: 'Coding', selectionMode: 'fixed',
          poolSize: null, poolDifficulty: null, poolTags: [],
          questions: [{ questionId: 'q1' }, { questionId: 'q2' }, { questionId: 'q3' }],
        }),
        update: jest.fn().mockResolvedValue({ id: 'section-1' }),
      },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await service.updateSection(context, 'exam-1', 'section-1', { title: 'Coding', requiredCount: 3 });

    expect(tx.examSection.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ requiredCount: null }) }),
    );
  });
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `cd apps/api && npx jest exams.service.spec -t "requiredCount"`
Expected: FAIL — `create`/`update` not called with `requiredCount`.

- [ ] **Step 7: Implement `updateSection`**

In `apps/api/src/exams/exams.service.ts`'s `updateSection`, the `findFirst` already includes `poolTags`. Change it to also include the section's questions so the normalisation has a count to compare against:

```ts
      const section = await tx.examSection.findFirst({
        where: { id: sectionId, examId },
        include: { poolTags: true, questions: true },
      });
```

Then add to the final `tx.examSection.update` `data:` object, after the existing `weightPercent` line:

```ts
          ...(dto.requiredCount !== undefined
            ? { requiredCount: this.normaliseRequiredCount(dto.requiredCount, nextMode, dto.poolSize ?? section.poolSize, section.questions.length) }
            : {}),
```

And add this private helper next to `resolveProctoringFields`:

```ts
  // requiredCount === M means "answer all", which is exactly what null already means -- storing
  // both would leave two representations of one state for every reader to handle. M is poolSize
  // for a pool section (the candidate only ever sees the drawn subset) and the attached question
  // count for a fixed one.
  private normaliseRequiredCount(
    requiredCount: number | null | undefined,
    selectionMode: string,
    poolSize: number | null,
    fixedQuestionCount: number,
  ): number | null {
    if (requiredCount == null) {
      return null;
    }
    const total = selectionMode === 'pool' ? (poolSize ?? 0) : fixedQuestionCount;
    return requiredCount >= total ? null : requiredCount;
  }
```

- [ ] **Step 8: Implement both duplication paths**

In `duplicateSection`'s `tx.examSection.create` `data:` object, after `weightPercent: section.weightPercent,` add:

```ts
          requiredCount: section.requiredCount,
```

In the whole-exam `duplicate()`'s per-section `tx.examSection.create` `data:` object, after `weightPercent: section.weightPercent,` add:

```ts
            requiredCount: section.requiredCount,
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `cd apps/api && npx jest exams.service.spec`
Expected: PASS, full file.

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/exams/dto/update-exam-section.dto.ts apps/api/src/exams/dto/update-exam-section.dto.spec.ts apps/api/src/exams/exams.service.ts apps/api/src/exams/exams.service.spec.ts
git commit -m "feat(exams): section update/duplicate handle requiredCount"
```

---

### Task 4: `publish()` validates the requirement

**Files:**
- Modify: `apps/api/src/exams/exams.service.ts` (`publish`, ~line 491-535)
- Modify: `apps/api/src/exams/exams.service.spec.ts`

**Interfaces:**
- Consumes: `ExamSection.requiredCount` (Task 1).

- [ ] **Step 1: Write the failing tests**

In `apps/api/src/exams/exams.service.spec.ts`, add next to the existing publish tests:

```ts
  it('rejects publish when a fixed section requires more answers than it has questions', async () => {
    const tx = {
      exam: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'exam-1',
          status: 'draft',
          sections: [{
            id: 'section-1', title: 'Coding', selectionMode: 'fixed', weightPercent: 100,
            requiredCount: 4, poolTags: [],
            questions: [{ questionId: 'q1', question: { marks: 10 } }, { questionId: 'q2', question: { marks: 10 } }],
          }],
        }),
        update: jest.fn(),
      },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await expect(service.publish(context, 'user-1', 'exam-1')).rejects.toThrow(
      'Section "Coding" asks for 4 answers but only has 2 questions',
    );
    expect(tx.exam.update).not.toHaveBeenCalled();
  });

  it('rejects publish when an answer-any-N fixed section has unequal marks', async () => {
    const tx = {
      exam: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'exam-1',
          status: 'draft',
          sections: [{
            id: 'section-1', title: 'Coding', selectionMode: 'fixed', weightPercent: 100,
            requiredCount: 2, poolTags: [],
            questions: [
              { questionId: 'q1', question: { marks: 10 } },
              { questionId: 'q2', question: { marks: 20 } },
              { questionId: 'q3', question: { marks: 10 } },
            ],
          }],
        }),
        update: jest.fn(),
      },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await expect(service.publish(context, 'user-1', 'exam-1')).rejects.toThrow(
      'Section "Coding" lets candidates choose which questions to answer, so all its questions must carry the same marks',
    );
  });

  it('publishes an answer-any-N fixed section whose questions all carry equal marks', async () => {
    const tx = {
      exam: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'exam-1',
          status: 'draft',
          sections: [{
            id: 'section-1', title: 'Coding', selectionMode: 'fixed', weightPercent: 100,
            requiredCount: 2, poolTags: [],
            questions: [
              { questionId: 'q1', question: { marks: 10 } },
              { questionId: 'q2', question: { marks: 10 } },
              { questionId: 'q3', question: { marks: 10 } },
            ],
          }],
        }),
        update: jest.fn().mockResolvedValue({ id: 'exam-1', status: 'published' }),
      },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    const result = await service.publish(context, 'user-1', 'exam-1');

    expect(result.status).toBe('published');
  });

  it('rejects publish when a pool section\'s eligible bank has unequal marks', async () => {
    const tx = {
      exam: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'exam-1',
          status: 'draft',
          sections: [{
            id: 'section-1', title: 'Pool', selectionMode: 'pool', poolSize: 5, poolDifficulty: null,
            weightPercent: 100, requiredCount: 3, questions: [], poolTags: [{ tagId: 'tag-1' }],
          }],
        }),
        update: jest.fn(),
      },
      question: {
        count: jest.fn().mockResolvedValue(8),
        findMany: jest.fn().mockResolvedValue([{ marks: 10 }, { marks: 20 }]),
      },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await expect(service.publish(context, 'user-1', 'exam-1')).rejects.toThrow(
      'Section "Pool" lets candidates choose which questions to answer, so all its questions must carry the same marks',
    );
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && npx jest exams.service.spec -t "answer"`
Expected: FAIL — no such validation exists yet.

- [ ] **Step 3: Include question marks in the publish query**

In `publish()`, the existing `findFirst` includes `sections: { include: { questions: true, poolTags: true } }`. Change it to load each linked question's marks:

```ts
        include: { sections: { include: { questions: { include: { question: { select: { marks: true } } } }, poolTags: true } } },
```

- [ ] **Step 4: Implement the checks**

In `publish()`, inside the existing `for (const section of exam.sections)` loop, add at the top of the loop body — **before** the pool-availability branch, so a misconfigured requirement is reported even when the pool is also short:

```ts
        if (section.requiredCount != null) {
          const total = section.selectionMode === 'pool' ? (section.poolSize ?? 0) : section.questions.length;
          if (section.requiredCount > total) {
            throw new BadRequestException(
              `Section "${section.title}" asks for ${section.requiredCount} answers but only has ${total} questions`,
            );
          }
          // Candidates choose which questions to answer, so unequal marks would make two
          // candidates' percentages incomparable -- one could pick the cheap questions and be
          // capped below 100% through no fault of their own.
          const marks = section.selectionMode === 'pool'
            ? (
                await tx.question.findMany({
                  where: {
                    organizationId: context.organizationId as string,
                    status: 'active',
                    ...(section.poolDifficulty ? { difficulty: section.poolDifficulty } : {}),
                    AND: section.poolTags.map((poolTag) => ({ tags: { some: { tagId: poolTag.tagId } } })),
                  },
                  select: { marks: true },
                  distinct: ['marks'],
                })
              ).map((question) => question.marks)
            : [...new Set(section.questions.map((link) => link.question.marks))];
          if (marks.length > 1) {
            throw new BadRequestException(
              `Section "${section.title}" lets candidates choose which questions to answer, so all its questions must carry the same marks`,
            );
          }
        }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd apps/api && npx jest exams.service.spec`
Expected: PASS, full file.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/exams/exams.service.ts apps/api/src/exams/exams.service.spec.ts
git commit -m "feat(exams): validate requiredCount and equal marks at publish"
```

---

### Task 5: Freeze `requiredCount` into the attempt snapshot

**Files:**
- Modify: `apps/exam-runtime/src/attempts/attempt.service.ts` (`SectionSnapshotEntry` ~line 62-71; `AttemptSection` ~line 56-60; snapshot build ~line 360-388; `loadSections` ~line 1369-1421)
- Modify: `apps/exam-runtime/src/attempts/attempt.service.spec.ts`

**Interfaces:**
- Produces: `SectionSnapshotEntry.requiredCount: number | null` in every newly-written `Attempt.sectionSnapshotJson`, read by Task 6's settlement; and `AttemptSection.requiredCount: number | null` on the candidate payload, read by Task 8's UI.

- [ ] **Step 1: Write the failing tests**

In `apps/exam-runtime/src/attempts/attempt.service.spec.ts`, add inside the `start` describe block:

```ts
    // Guards the settlement contract: AttemptSettlementService reads requiredCount straight out
    // of this snapshot and treats a missing key as "all required". JSON.stringify drops undefined
    // keys, so a silently-absent field here would quietly un-limit every newly started exam --
    // hence toHaveProperty rather than a toEqual that would pass on absence.
    it("freezes each section's requiredCount into the snapshot at start time", async () => {
      const tx = {
        attempt: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'attempt-1', status: 'in_progress' }) },
        examSection: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'section-1', title: 'Coding', selectionMode: 'fixed', poolSize: null, poolDifficulty: null, targetDurationMinutes: null, weightPercent: 100, requiredCount: 3, poolTags: [], questions: [{ questionId: 'q1' }, { questionId: 'q2' }] },
          ]),
        },
      };
      mockBootstrapThenScoped(tx);

      await service.start(session, { consent: true });

      const snapshot = JSON.parse(tx.attempt.create.mock.calls[0][0].data.sectionSnapshotJson);
      expect(snapshot[0]).toHaveProperty('requiredCount', 3);
    });

    it('freezes requiredCount as null for a section with no requirement', async () => {
      const tx = {
        attempt: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'attempt-1', status: 'in_progress' }) },
        examSection: {
          findMany: jest.fn().mockResolvedValue([
            { id: 'section-1', title: 'Coding', selectionMode: 'fixed', poolSize: null, poolDifficulty: null, targetDurationMinutes: null, weightPercent: 100, requiredCount: null, poolTags: [], questions: [{ questionId: 'q1' }] },
          ]),
        },
      };
      mockBootstrapThenScoped(tx);

      await service.start(session, { consent: true });

      const snapshot = JSON.parse(tx.attempt.create.mock.calls[0][0].data.sectionSnapshotJson);
      expect(snapshot[0]).toHaveProperty('requiredCount', null);
    });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/exam-runtime && npx jest attempt.service.spec -t "requiredCount"`
Expected: FAIL — the snapshot object has no `requiredCount` property.

- [ ] **Step 3: Update both interfaces**

In `apps/exam-runtime/src/attempts/attempt.service.ts`, change `SectionSnapshotEntry`:

```ts
interface SectionSnapshotEntry {
  sectionId: string;
  title: string;
  targetDurationMinutes: number | null;
  weightPercent: number;
  // Frozen per-attempt like weightPercent: a recruiter changing the requirement afterwards must
  // not retroactively rescore a candidate who already sat the exam. null = every question required.
  requiredCount: number | null;
  questionIds: string[];
}
```

And `AttemptSection` — this is what the candidate actually receives, and `loadSections` drops anything not listed here:

```ts
interface AttemptSection {
  title: string;
  targetDurationMinutes: number | null;
  requiredCount: number | null;
  questions: AttemptQuestion[];
}
```

- [ ] **Step 4: Stamp it when building the snapshot**

In the snapshot-building loop, add to the pushed entry after `weightPercent`:

```ts
          requiredCount: section.requiredCount,
```

- [ ] **Step 5: Pass it through to the candidate**

In `loadSections`, add to the mapped object after `targetDurationMinutes`:

```ts
        requiredCount: section.requiredCount ?? null,
```

The `?? null` matters: a legacy snapshot written before this task has no such key, and `undefined` would serialise away entirely, leaving the client unable to distinguish "no requirement" from "field missing".

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd apps/exam-runtime && npx jest attempt.service.spec`
Expected: PASS, full file.

- [ ] **Step 7: Commit**

```bash
git add apps/exam-runtime/src/attempts/attempt.service.ts apps/exam-runtime/src/attempts/attempt.service.spec.ts
git commit -m "feat(exam-runtime): freeze requiredCount into the attempt section snapshot"
```

---

### Task 6: Settlement scores the best N

**Files:**
- Modify: `apps/exam-runtime/src/grading/grading.ts` (`computeResult`, ~line 39-74)
- Modify: `apps/exam-runtime/src/grading/grading.spec.ts`
- Modify: `apps/exam-runtime/src/grading/attempt-settlement.service.ts` (`SectionSnapshotEntry` ~line 20-27, `toGradableSections` ~line 28-58)
- Modify: `apps/exam-runtime/src/grading/attempt-settlement.service.spec.ts`

**Interfaces:**
- Consumes: `selectCountedAnswers` (Task 2), `SectionSnapshotEntry.requiredCount` (Task 5).
- Produces: `GradableSection` gains `requiredCount: number | null`. `computeResult`'s signature is unchanged — the new field rides inside `sections`.

- [ ] **Step 1: Write the failing grading tests**

In `apps/exam-runtime/src/grading/grading.spec.ts`, add inside `describe('computeResult', ...)`:

```ts
  it('scores only the best N of a section, out of N', () => {
    // 5 questions worth 10 each, answer any 3. Awarded 10/10/7/0/0.
    // Best 3 = 27 out of 30 = 90% of a 100%-weighted section.
    const summary = computeResult(
      [
        { questionId: 'q1', marksAwarded: 10 },
        { questionId: 'q2', marksAwarded: 10 },
        { questionId: 'q3', marksAwarded: 7 },
        { questionId: 'q4', marksAwarded: 0 },
        { questionId: 'q5', marksAwarded: 0 },
      ],
      [
        { id: 'q1', marks: 10 }, { id: 'q2', marks: 10 }, { id: 'q3', marks: 10 },
        { id: 'q4', marks: 10 }, { id: 'q5', marks: 10 },
      ],
      50,
      [{ sectionId: 's1', weightPercent: 100, requiredCount: 3, questionIds: ['q1', 'q2', 'q3', 'q4', 'q5'] }],
    );
    expect(summary.percentage).toBe(90);
    expect(summary.score).toBe(27);
    expect(summary.maxScore).toBe(30);
  });

  it('reports score/maxScore as the counted totals, not the raw totals over every question', () => {
    // Raw would be 27/50. Counted must be 27/30 -- otherwise the headline numbers contradict
    // the percentage printed beside them in the recruiter report.
    const summary = computeResult(
      [{ questionId: 'q1', marksAwarded: 27 }],
      [
        { id: 'q1', marks: 10 }, { id: 'q2', marks: 10 }, { id: 'q3', marks: 10 },
        { id: 'q4', marks: 10 }, { id: 'q5', marks: 10 },
      ],
      50,
      [{ sectionId: 's1', weightPercent: 100, requiredCount: 3, questionIds: ['q1', 'q2', 'q3', 'q4', 'q5'] }],
    );
    expect(summary.maxScore).toBe(30);
  });

  it('leaves a section with no requiredCount scoring every question, exactly as before', () => {
    const summary = computeResult(
      [{ questionId: 'q1', marksAwarded: 5 }, { questionId: 'q2', marksAwarded: 0 }],
      [{ id: 'q1', marks: 5 }, { id: 'q2', marks: 5 }],
      50,
      [{ sectionId: 's1', weightPercent: 100, requiredCount: null, questionIds: ['q1', 'q2'] }],
    );
    expect(summary).toEqual({ score: 5, maxScore: 10, percentage: 50, passFail: 'pass' });
  });
```

Every pre-existing `computeResult` test in this file passes `sections` without `requiredCount`; leave them alone — they must keep passing untouched, which is the proof that non-requirement sections are unaffected.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/exam-runtime && npx jest grading.spec`
Expected: FAIL — `requiredCount` is not a property of `GradableSection`, and `maxScore` returns 50.

- [ ] **Step 3: Implement in `computeResult`**

In `apps/exam-runtime/src/grading/grading.ts`, add the import at the top:

```ts
import { selectCountedAnswers } from '@exam-platform/shared';
```

Extend the interface:

```ts
export interface GradableSection {
  sectionId: string;
  weightPercent: number;
  /** null = every question counts. Otherwise only the best N are scored, out of N. */
  requiredCount: number | null;
  questionIds: string[];
}
```

Replace the body of `computeResult` from `const rawScore` down to the `return`:

```ts
  const marksAwardedByQuestionId = new Map(gradedAnswers.map((answer) => [answer.questionId, answer.marksAwarded]));
  const marksByQuestionId = new Map(questions.map((question) => [question.id, question.marks]));

  // Weighted, not flat: each section's (score/max) ratio contributes its own weightPercent share
  // of the overall percentage. score/maxScore are the COUNTED totals -- for a section with a
  // requiredCount they exclude the dropped answers, so the headline numbers agree with the
  // percentage rather than contradicting it.
  // See docs/superpowers/specs/2026-08-05-answer-any-n-design.md.
  let percentage = 0;
  let score = 0;
  let maxScore = 0;
  for (const section of sections) {
    const counted = selectCountedAnswers(
      section.questionIds.map((questionId) => ({
        questionId,
        marks: marksByQuestionId.get(questionId) ?? 0,
        marksAwarded: marksAwardedByQuestionId.get(questionId) ?? 0,
      })),
      section.requiredCount,
    );
    score += counted.score;
    maxScore += counted.maxScore;
    if (counted.maxScore > 0) {
      percentage += (counted.score / counted.maxScore) * section.weightPercent;
    }
  }

  const passFail: 'pass' | 'fail' = percentage >= passCriteriaPercent ? 'pass' : 'fail';
  return { score, maxScore, percentage, passFail };
```

Two things to be deliberate about here:

- `selectCountedAnswers` already floors each section's score at 0, so the previous per-section `Math.max(0, ...)` is no longer needed.
- `maxScore` now sums per-section rather than over the `questions` array. That is **not** a behaviour change for code questions: `finalize()` passes `scoredQuestions` (code excluded) as `questions`, so a code question's id simply misses `marksByQuestionId` and resolves to 0 marks — exactly as it was excluded from the old global sum. Verified by the existing settlement tests continuing to pass untouched.

- [ ] **Step 4: Run the grading tests to verify they pass**

Run: `cd apps/exam-runtime && npx jest grading.spec`
Expected: PASS, full file — including every pre-existing test.

- [ ] **Step 5: Write the failing settlement test**

In `apps/exam-runtime/src/grading/attempt-settlement.service.spec.ts`, add inside the `describe('finalize section weighting', ...)` block:

```ts
    it('scores the best N when the section carries a requiredCount', async () => {
      const attempt = {
        id: 'attempt-1',
        questionOrderJson: JSON.stringify(['q1', 'q2']),
        sectionSnapshotJson: JSON.stringify([
          { sectionId: 's1', title: 'Coding', targetDurationMinutes: null, weightPercent: 100, requiredCount: 1, questionIds: ['q1', 'q2'] },
        ]),
      };
      const tx = weightedTx();

      await service.finalize(tx as unknown as Prisma.TransactionClient, exam, attempt as any, 'submitted');

      // q1 correct (5), q2 unanswered (0). Best 1 of 2 = 5 out of 5 = 100%.
      expect(tx.result.create).toHaveBeenCalledWith({
        data: { attemptId: 'attempt-1', score: 5, maxScore: 5, percentage: 100, passFail: 'pass' },
      });
    });
```

Also add a `finalizeManualGrade` case. Both call sites must apply the rule: a section mixing MCQ and code is scored once at submit and again once marks land, and only the second pass sees real code marks. Model the mock on the existing `describe('finalizeManualGrade', ...)` fixtures in this file:

```ts
    it('applies best-N again on the manual-grade pass, once code marks have landed', async () => {
      const attempt = {
        id: 'attempt-1', candidateId: 'cand-1', examId: 'exam-1', status: 'pending_manual_grade',
        questionOrderJson: JSON.stringify(['c1', 'c2', 'c3']),
        sectionSnapshotJson: JSON.stringify([
          { sectionId: 's1', title: 'Coding', targetDurationMinutes: null, weightPercent: 100, requiredCount: 2, questionIds: ['c1', 'c2', 'c3'] },
        ]),
      };
      const tx = {
        question: { findMany: jest.fn().mockResolvedValue([
          { id: 'c1', type: 'code', marks: 10, negativeMarks: 0 },
          { id: 'c2', type: 'code', marks: 10, negativeMarks: 0 },
          { id: 'c3', type: 'code', marks: 10, negativeMarks: 0 },
        ]) },
        answer: { findMany: jest.fn().mockResolvedValue([
          { questionId: 'c1', marksAwarded: 9 },
          { questionId: 'c2', marksAwarded: 2 },
          { questionId: 'c3', marksAwarded: 7 },
        ]) },
        result: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn(), upsert: jest.fn() },
        attempt: { update: jest.fn().mockResolvedValue({ id: 'attempt-1', status: 'submitted' }) },
        auditLog: { create: jest.fn() },
      } as any;

      await service.finalizeManualGrade(tx as unknown as Prisma.TransactionClient, exam, attempt as any);

      // Best 2 of 3 = 9 + 7 = 16, out of 20 -> 80%. A flat score would be 18 of 30 = 60%.
      const written = (tx.result.create.mock.calls[0] ?? tx.result.upsert.mock.calls[0])[0];
      expect(written.data ?? written.create).toEqual(
        expect.objectContaining({ score: 16, maxScore: 20, percentage: 80 }),
      );
    });
```

Read `finalizeManualGrade`'s actual `Result` write (create vs upsert) before finalising this assertion and match it exactly rather than guessing.

- [ ] **Step 6: Run it to verify it fails**

Run: `cd apps/exam-runtime && npx jest attempt-settlement.service.spec -t "best N"`
Expected: FAIL — `requiredCount` is dropped by `toGradableSections`, so all questions are counted (5 of 10 = 50%).

- [ ] **Step 7: Thread `requiredCount` through `toGradableSections`**

In `apps/exam-runtime/src/grading/attempt-settlement.service.ts`, add to the local `SectionSnapshotEntry` interface:

```ts
  requiredCount: number | null;
```

In `toGradableSections`, the legacy branch already returns one synthetic section; give it `requiredCount: null`:

```ts
    return [{ sectionId: '__flat__', weightPercent: 100, requiredCount: null, questionIds: allQuestionIds }];
```

And in the mapping branch:

```ts
  return snapshot.map((section) => ({
    sectionId: section.sectionId,
    weightPercent: section.weightPercent,
    // A snapshot written before this feature has no key at all -- undefined must read as
    // "all required", never as 0, which would score every section out of nothing.
    requiredCount: section.requiredCount ?? null,
    questionIds: section.questionIds,
  }));
```

- [ ] **Step 8: Run the settlement tests to verify they pass**

Run: `cd apps/exam-runtime && npx jest attempt-settlement.service.spec`
Expected: PASS, full file — all pre-existing tests included, which is the evidence in-flight attempts are unaffected.

- [ ] **Step 9: Commit**

```bash
git add apps/exam-runtime/src/grading/grading.ts apps/exam-runtime/src/grading/grading.spec.ts apps/exam-runtime/src/grading/attempt-settlement.service.ts apps/exam-runtime/src/grading/attempt-settlement.service.spec.ts
git commit -m "feat(grading): score the best N answers in an answer-any-N section"
```

---

### Task 7: Reports surface counted vs dropped

**Files:**
- Modify: `apps/api/src/reports/reports.service.ts` (`SectionScore`/`SectionSnapshotEntryShape` ~line 39-56, `computeSectionScores` ~line 538-560, `getCandidateDetail` section mapping ~line 407-431)
- Modify: `apps/api/src/reports/reports.service.spec.ts`

**Interfaces:**
- Consumes: `selectCountedAnswers` (Task 2).
- Produces: `SectionScore.requiredCount: number | null`, and `CandidateDetailQuestion.counted: boolean`. Consumed by Task 9's frontend.

- [ ] **Step 1: Write the failing tests**

In `apps/api/src/reports/reports.service.spec.ts`, add inside the `compareCandidates` describe block:

```ts
    it('scores only the best N for a section with a requiredCount', async () => {
      examsService.getResults.mockResolvedValue([
        row({ candidateId: 'cand-1', invitationId: 'inv-1', candidateName: 'Alice', attemptId: 'a1', status: 'submitted', score: 15, maxScore: 20, percentage: 75, passFail: 'pass' }),
      ]);
      const tx = {
        attempt: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'a1',
              sectionSnapshotJson: JSON.stringify([{ sectionId: 'sec-1', title: 'Coding', weightPercent: 100, requiredCount: 2, questionIds: ['q1', 'q2', 'q3'] }]),
              answers: [
                { questionId: 'q1', marksAwarded: 10 },
                { questionId: 'q2', marksAwarded: 0 },
                { questionId: 'q3', marksAwarded: 8 },
              ],
            },
          ]),
        },
        question: { findMany: jest.fn().mockResolvedValue([{ id: 'q1', marks: 10 }, { id: 'q2', marks: 10 }, { id: 'q3', marks: 10 }]) },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const comparison = await service.compareCandidates(context, 'exam-1', 'inv-1');

      // Best 2 of 3 = 10 + 8 = 18, out of 20 -- not 18 out of 30.
      expect(comparison[0].sectionScores).toEqual([
        { sectionId: 'sec-1', title: 'Coding', score: 18, maxScore: 20, weightPercent: 100, requiredCount: 2 },
      ]);
    });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/api && npx jest reports.service.spec -t "best N"`
Expected: FAIL — returns `score: 18, maxScore: 30` and has no `requiredCount` key.

- [ ] **Step 3: Extend the interfaces**

In `apps/api/src/reports/reports.service.ts`:

```ts
export interface SectionScore {
  sectionId: string;
  title: string;
  score: number;
  maxScore: number;
  weightPercent: number;
  /** null = every question counted. Otherwise only the best N were scored, out of N. */
  requiredCount: number | null;
}

interface SectionSnapshotEntryShape {
  sectionId: string;
  title: string;
  weightPercent?: number;
  requiredCount?: number | null;
  questionIds: string[];
}
```

Add `counted: boolean` to the `CandidateDetailQuestion` interface in the same file.

- [ ] **Step 4: Reimplement `computeSectionScores` on the shared helper**

Add the import at the top of `reports.service.ts`:

```ts
import { selectCountedAnswers } from '@exam-platform/shared';
```

Replace the body of `computeSectionScores`:

```ts
  private computeSectionScores(
    sectionSnapshot: SectionSnapshotEntryShape[],
    marksAwardedByQuestionId: Map<string, number>,
    marksByQuestionId: Map<string, number>,
  ): SectionScore[] {
    return sectionSnapshot.map((section) => {
      // Same helper the exam-runtime settlement path uses. Two independent copies of the best-N
      // rule would let a recruiter see a section score that contradicts the per-question marks
      // listed directly underneath it.
      const counted = selectCountedAnswers(
        section.questionIds.map((questionId) => ({
          questionId,
          marks: marksByQuestionId.get(questionId) ?? 0,
          marksAwarded: marksAwardedByQuestionId.get(questionId) ?? 0,
        })),
        section.requiredCount,
      );
      return {
        sectionId: section.sectionId,
        title: section.title,
        score: counted.score,
        maxScore: counted.maxScore,
        weightPercent: section.weightPercent ?? 0,
        requiredCount: section.requiredCount ?? null,
      };
    });
  }
```

- [ ] **Step 5: Flag counted questions in the candidate detail**

In `getCandidateDetail`'s section mapping, compute the counted set once per section and stamp each question. Immediately before `const sections: CandidateDetailSection[] = sectionSnapshot.map((section) => {`, the `sectionScoreById` map already exists; inside the map callback, before the `return {`:

```ts
        const countedIds = new Set(
          selectCountedAnswers(
            section.questionIds.map((questionId) => ({
              questionId,
              marks: marksByQuestionId.get(questionId) ?? 0,
              marksAwarded: marksAwardedByQuestionId.get(questionId) ?? 0,
            })),
            section.requiredCount,
          ).countedQuestionIds,
        );
```

Then add to the object returned for each question, after `marksAwarded`:

```ts
              counted: countedIds.has(questionId),
```

And add `requiredCount: scoreEntry.requiredCount,` to the section object alongside the existing `weightPercent`.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd apps/api && npx jest reports.service.spec`
Expected: PASS, full file. Pre-existing assertions that used `toEqual` on `sectionScores` will need `requiredCount: null` added — that is expected and correct.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/reports/reports.service.ts apps/api/src/reports/reports.service.spec.ts
git commit -m "feat(reports): score sections via the shared best-N helper and flag counted answers"
```

---

### Task 8: Candidate UI — requirement badge, navigator counts, progress, submit warning

**Files:**
- Modify: `apps/web/lib/types.ts` (`AttemptSection` ~line 353-357)
- Modify: `apps/web/app/(candidate)/exam/page.tsx`
- Modify: `apps/web/app/(candidate)/components/QuestionNavigator.tsx`
- Modify: `apps/web/app/(candidate)/exam/page.test.tsx`

**Interfaces:**
- Consumes: `AttemptSection.requiredCount` (Task 5).

- [ ] **Step 1: Add the field to the client type**

In `apps/web/lib/types.ts`:

```ts
export interface AttemptSection {
  title: string;
  targetDurationMinutes: number | null;
  /** null = every question must be answered. Otherwise the candidate may answer any N. */
  requiredCount: number | null;
  questions: AttemptQuestion[];
}
```

- [ ] **Step 2: Write the failing tests**

In `apps/web/app/(candidate)/exam/page.test.tsx`, add (matching the file's existing render helper and attempt-state mock shape — read the top of the file first and reuse its helpers verbatim rather than inventing new ones):

```ts
  it('tells the candidate how many of the section\'s questions they must answer', async () => {
    renderExam({
      sections: [
        { title: 'Coding', targetDurationMinutes: null, requiredCount: 3, questions: [q('q1'), q('q2'), q('q3'), q('q4'), q('q5')] },
      ],
    });

    expect(await screen.findByText(/answer any 3 of 5/i)).toBeInTheDocument();
  });

  it('counts progress against what is required, not the total question count', async () => {
    renderExam({
      sections: [
        { title: 'Coding', targetDurationMinutes: null, requiredCount: 3, questions: [q('q1'), q('q2'), q('q3'), q('q4'), q('q5')] },
      ],
      answers: [{ questionId: 'q1', selectedOptionIds: ['opt-a'], answerText: null }],
    });

    expect(await screen.findByText('1/3 answered')).toBeInTheDocument();
  });

  it('leaves progress on the total question count when no section has a requirement', async () => {
    renderExam({
      sections: [
        { title: 'Coding', targetDurationMinutes: null, requiredCount: null, questions: [q('q1'), q('q2')] },
      ],
    });

    expect(await screen.findByText('0/2 answered')).toBeInTheDocument();
  });
```

- [ ] **Step 3: Run them to verify they fail**

Run: `cd apps/web && npx jest "candidate/exam/page" -t "answer any"`
Expected: FAIL — text not found.

- [ ] **Step 4: Show the requirement in the section badge**

In `apps/web/app/(candidate)/exam/page.tsx`, the badge currently renders section index/title. `flattenQuestions` must carry the requirement through — in `QuestionNavigator.tsx`, extend it:

```ts
export function flattenQuestions(sections: AttemptSection[]) {
  return sections.flatMap((section, sectionIndex) =>
    section.questions.map((question) => ({
      ...question,
      sectionTitle: section.title,
      sectionIndex,
      sectionRequiredCount: section.requiredCount,
      sectionQuestionCount: section.questions.length,
    })),
  );
}
```

Then in `page.tsx`'s badge, append the requirement when there is one:

```tsx
                {question.sectionRequiredCount != null
                  ? ` — answer any ${question.sectionRequiredCount} of ${question.sectionQuestionCount}`
                  : ''}
```

- [ ] **Step 5: Count progress against the requirement**

In `page.tsx`, replace the flat `answeredCount`/`unansweredCount` derivation with a requirement-aware one:

```ts
  // A section with a requiredCount contributes that many "needed" answers, not its full question
  // count -- otherwise the chip tells a candidate they have 5 to do when 3 finishes the section.
  // Answers beyond the requirement are free (best-N), so a section is capped at its requirement.
  const requiredTotal = (attemptState?.sections ?? []).reduce(
    (sum, section) => sum + (section.requiredCount ?? section.questions.length),
    0,
  );
  const answeredTowardRequirement = (attemptState?.sections ?? []).reduce((sum, section) => {
    const answeredInSection = section.questions.filter(isQuestionAnswered).length;
    return sum + Math.min(answeredInSection, section.requiredCount ?? section.questions.length);
  }, 0);
```

Then feed the chip:

```tsx
        progressLabel={`${answeredTowardRequirement}/${requiredTotal} answered`}
```

Leave the existing `answeredCount`/`unansweredCount` in place — the submit modal's tiles and the "review unanswered" stepping mode still operate on individual questions, and conflating the two would break that filter.

- [ ] **Step 6: Show per-section requirement in the navigator**

In `QuestionNavigator.tsx`, the group header currently renders `{answeredInGroup}/{group.questions.length}`. Change it to:

```tsx
                {answeredInGroup}/{group.requiredCount ?? group.questions.length}
                {group.requiredCount != null ? ' required' : ''}
```

(carry `requiredCount` onto the group object where the component builds `groups`).

- [ ] **Step 7: Warn on submit when a section is short**

In `page.tsx`'s submit modal, add above the existing tiles:

```tsx
              {shortSections.length > 0 && (
                <p className="rounded-md bg-candidate-warning-bg px-3 py-2 text-sm text-candidate-warning">
                  {shortSections.map((s) => `${s.title}: ${s.answered} of ${s.required} answered`).join('; ')}
                </p>
              )}
```

with, alongside the other derivations:

```ts
  // Warn, never block: the timer auto-submits, so a hard gate is unenforceable and would only
  // punish a candidate who ran out of time.
  const shortSections = (attemptState?.sections ?? [])
    .map((section) => ({
      title: section.title,
      required: section.requiredCount ?? section.questions.length,
      answered: section.questions.filter(isQuestionAnswered).length,
    }))
    .filter((section) => section.answered < section.required);
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `cd apps/web && npx jest "candidate/exam/page" QuestionNavigator`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/web/lib/types.ts "apps/web/app/(candidate)/exam/page.tsx" "apps/web/app/(candidate)/components/QuestionNavigator.tsx" "apps/web/app/(candidate)/exam/page.test.tsx"
git commit -m "feat(web): show and count answer-any-N requirements in the candidate exam UI"
```

---

### Task 9: Recruiter UI — required-answers input and report display

**Files:**
- Modify: `apps/web/lib/types.ts` (`ExamSection` ~line 102-120, `SectionScore` ~line 521-529, `CandidateDetailQuestion`)
- Modify: `apps/web/lib/hooks/useExamSections.ts` (`useUpdateSection`)
- Modify: `apps/web/components/ExamSectionsPanel.tsx`
- Modify: `apps/web/components/ExamSectionsPanel.test.tsx`
- Modify: `apps/web/components/CandidateReportPanel.tsx`
- Modify: `apps/web/components/CandidateReportPanel.test.tsx`

**Interfaces:**
- Consumes: `UpdateExamSectionDto.requiredCount` (Task 3), `SectionScore.requiredCount` + `CandidateDetailQuestion.counted` (Task 7).

- [ ] **Step 1: Extend the client types**

In `apps/web/lib/types.ts`, add to `ExamSection` after `weightPercent`:

```ts
  /** null = every question must be answered. Otherwise the candidate answers any N. */
  requiredCount: number | null;
```

Add to `SectionScore`:

```ts
  requiredCount: number | null;
```

Add `counted: boolean;` to `CandidateDetailQuestion`.

- [ ] **Step 2: Widen the update hook**

In `apps/web/lib/hooks/useExamSections.ts`, change `useUpdateSection`'s input type:

```ts
    mutationFn: (input: { weightPercent?: number; requiredCount?: number | null }) =>
```

- [ ] **Step 3: Write the failing recruiter tests**

In `apps/web/components/ExamSectionsPanel.test.tsx`, add inside the `describe('section weights', ...)` block (reusing its `mockWeightedExam`/`renderPanel` helpers — extend the fixture builder to accept a `requiredCount` per section):

```ts
    it("shows a section's required-answer count against its question count", async () => {
      mockWeightedExam([100], (url) => null, { requiredCount: 3, questionCount: 5 });
      renderPanel();

      expect(await screen.findByLabelText('Required answers for Section One')).toHaveValue(3);
      expect(screen.getByText(/of 5/)).toBeInTheDocument();
    });

    it('saves a new required-answer count on blur', async () => {
      const fetchMock = mockWeightedExam([100], (url, options) =>
        url.endsWith('/sections/section-1') && options?.method === 'PATCH'
          ? new Response(JSON.stringify({ id: 'section-1', requiredCount: 2 }), { status: 200 })
          : null,
        { requiredCount: 3, questionCount: 5 },
      );
      renderPanel();
      const input = await screen.findByLabelText('Required answers for Section One');

      await userEvent.clear(input);
      await userEvent.type(input, '2');
      await userEvent.tab();

      await waitFor(() => {
        const patchCall = fetchMock.mock.calls.find(
          (call) => String(call[0]).endsWith('/sections/section-1') && (call[1] as RequestInit | undefined)?.method === 'PATCH',
        );
        expect(patchCall).toBeDefined();
        expect(JSON.parse(String((patchCall![1] as RequestInit).body))).toEqual({ requiredCount: 2 });
      });
    });
```

- [ ] **Step 4: Run them to verify they fail**

Run: `cd apps/web && npx jest ExamSectionsPanel -t "required"`
Expected: FAIL — no such label exists.

- [ ] **Step 5: Add the input**

In `apps/web/components/ExamSectionsPanel.tsx`, add a sibling to `SectionWeightInput`, modelled on it exactly:

```tsx
function SectionRequiredCountInput({ examId, section, locked }: { examId: string; section: ExamSection; locked: boolean }) {
  const updateSection = useUpdateSection(examId, section.id);
  const { toast } = useToast();
  const total = section.selectionMode === 'pool' ? (section.poolSize ?? 0) : section.questions.length;
  const [value, setValue] = useState(section.requiredCount == null ? '' : String(section.requiredCount));

  if (locked) {
    return section.requiredCount == null ? null : (
      <span className="text-sm text-recruiter-text-secondary">answer any {section.requiredCount} of {total}</span>
    );
  }

  // Blank clears the requirement back to "answer all", which is what null means server-side.
  function handleBlur() {
    const trimmed = value.trim();
    const parsed = trimmed === '' ? null : Number(trimmed);
    if (parsed !== null && (!Number.isInteger(parsed) || parsed < 1 || parsed > total)) {
      setValue(section.requiredCount == null ? '' : String(section.requiredCount));
      return;
    }
    if (parsed === section.requiredCount) return;
    updateSection.mutate(
      { requiredCount: parsed },
      {
        onError: (error) => {
          toast(error instanceof Error ? error.message : 'Failed to update required answers.', 'error');
          setValue(section.requiredCount == null ? '' : String(section.requiredCount));
        },
      },
    );
  }

  return (
    <label className="flex items-center gap-1 text-sm text-recruiter-text-secondary">
      Required
      <input
        type="number"
        min={1}
        max={total}
        value={value}
        placeholder="all"
        onChange={(event) => setValue(event.target.value)}
        onBlur={handleBlur}
        aria-label={`Required answers for ${section.title}`}
        className="w-16 rounded border border-recruiter-border px-1.5 py-0.5 text-right"
      />
      of {total}
    </label>
  );
}
```

Render it beside `SectionWeightInput` in the section card header:

```tsx
                <SectionRequiredCountInput examId={examId} section={section} locked={locked} />
```

- [ ] **Step 6: Write the failing report test**

In `apps/web/components/CandidateReportPanel.test.tsx`, add:

```ts
  it('says how many of a section\'s answers were counted', () => {
    renderPanel([
      { sectionId: 's1', title: 'Coding', score: 18, maxScore: 20, weightPercent: 100, requiredCount: 2, questions: [] },
    ]);

    expect(screen.getByText('18/20 · 100% weight · best 2 of 0 counted')).toBeInTheDocument();
  });

  it('badges an answer that was dropped by the best-N rule', () => {
    renderPanel([
      {
        sectionId: 's1', title: 'Coding', score: 18, maxScore: 20, weightPercent: 100, requiredCount: 2,
        questions: [
          { questionId: 'q1', questionText: 'A', type: 'code', marks: 10, negativeMarks: 0, options: [], selectedOptionIds: [], correctOptionIds: [], isCorrect: true, marksAwarded: 10, counted: true },
          { questionId: 'q2', questionText: 'B', type: 'code', marks: 10, negativeMarks: 0, options: [], selectedOptionIds: [], correctOptionIds: [], isCorrect: false, marksAwarded: 0, counted: false },
        ],
      },
    ]);

    expect(screen.getByText('Not counted')).toBeInTheDocument();
  });
```

Fix the first test's expected string once you see the real section-question count in your fixture — it must read `best 2 of <questions.length> counted`.

- [ ] **Step 7: Implement the report display**

In `apps/web/components/CandidateReportPanel.tsx`, extend the section header line:

```tsx
                <span className="text-sm text-gray-500">
                  {section.score}/{section.maxScore} · {section.weightPercent}% weight
                  {section.requiredCount != null ? ` · best ${section.requiredCount} of ${section.questions.length} counted` : ''}
                </span>
```

And badge dropped answers — inside the per-question block, after the question text:

```tsx
                    {question.counted === false && (
                      <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">Not counted</span>
                    )}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `cd apps/web && npx jest ExamSectionsPanel CandidateReportPanel`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/web/lib/types.ts apps/web/lib/hooks/useExamSections.ts apps/web/components/ExamSectionsPanel.tsx apps/web/components/ExamSectionsPanel.test.tsx apps/web/components/CandidateReportPanel.tsx apps/web/components/CandidateReportPanel.test.tsx
git commit -m "feat(web): edit required answers per section and show counted/dropped in reports"
```

---

### Task 10: Full verification and deploy

**Files:** none — verification only.

- [ ] **Step 1: Run each workspace suite sequentially**

Concurrent runs produce phantom failures on this machine — one at a time:

```bash
npm test --workspace=packages/shared
npm test --workspace=apps/api
npm test --workspace=apps/exam-runtime
npm test --workspace=apps/web
```
Expected: all pass. Known pre-existing failures unrelated to this work: one `EmailService` test (reads a real `.env` SMTP value). If a web test fails here, re-run that file alone before believing it.

- [ ] **Step 2: Typecheck and build all four**

```bash
cd apps/api && npx tsc --noEmit && cd ../exam-runtime && npx tsc --noEmit && cd ../..
npm run build --workspace=packages/shared
npm run build --workspace=apps/api
npm run build --workspace=apps/exam-runtime
npm run build --workspace=apps/web
```
Expected: clean. `apps/web`'s typecheck has a known pre-existing baseline of test-file errors in `exams/page.test.tsx`, `forgot-password/page.test.tsx`, `login/page.test.tsx`, `reset-password/[token]/page.test.tsx`, `SectionQuestionPicker.test.tsx` — filter those out and expect nothing else.

- [ ] **Step 3: Deploy**

```bash
git push origin main
git archive main | ssh -i <key> ptcsfadmin@20.219.132.226 "tar -x -C ~/app"
```
Then apply the migration and rebuild detached (an SSH drop mid-build otherwise strands `web` stopped):
```bash
ssh -i <key> ptcsfadmin@20.219.132.226 "cd ~/app && DB_URL=\$(grep '^DATABASE_URL=' apps/api/.env | head -1 | cut -d= -f2- | sed -e 's/^\"//' -e 's/\"\$//') && DATABASE_URL=\"\$DB_URL\" npx prisma migrate deploy --schema=apps/api/prisma/schema.prisma"
ssh -i <key> ptcsfadmin@20.219.132.226 "cd ~/app && nohup bash -c 'npx prisma generate --schema=apps/api/prisma/schema.prisma && npm run build --workspace=packages/shared && npm run build --workspace=apps/api && npm run build --workspace=apps/exam-runtime && pm2 restart api exam-runtime --update-env && pm2 stop web && npm run build --workspace=apps/web && pm2 start web --update-env && echo DEPLOY_COMPLETE' > ~/deploy-any-n.log 2>&1 < /dev/null & echo STARTED"
```
Poll `~/deploy-any-n.log` until `DEPLOY_COMPLETE`.

- [ ] **Step 4: Live-verify against production**

At `https://prudenthire.prudentconsulting.com` as `recruiter@demo-org.test` / `Passw0rd!2026` (org `demo-org`):
1. Create an exam with one section, attach 5 equal-mark questions, set Required = 3, weight 100.
2. Confirm publish **succeeds**. Then change one question's marks so they are unequal, and confirm publish is **rejected** with the equal-marks message.
3. Start the exam as a candidate. Confirm the badge reads "answer any 3 of 5" and the header chip counts `/3`, not `/5`.
4. Answer 4 of the 5, deliberately scoring worst on one of them. Submit.
5. In the recruiter report, confirm the section reads "best 3 of 5 counted", the dropped answer is badged "Not counted", and `score/maxScore` is out of 3 questions' marks — not 5.
6. Delete the test exam.

**This step is the one that catches what unit tests cannot** — the weight editor shipped broken precisely because its component test mocked the fetch and never exercised real DTO validation.

- [ ] **Step 5: Create the ADO work item**

```bash
az boards work-item create --title "Answer any N of M: optional questions within a section" --type "Feature" --org "https://dev.azure.com/PIDC-Salesforce" --project "Interview App" --description "<writeup>" --query "id" -o tsv
```
Close it with a delivery summary once live verification passes.

---

## Notes for the implementer

- **Do not** add a `requiredCount` column to `ExamSectionQuestion`. `exams.service.ts:901-904` rebuilds that table by delete-then-recreate on every question save; anything stored there is silently wiped.
- **Do not** collapse `answeredCount` and `answeredTowardRequirement` in the candidate page. The submit modal's "review unanswered" filter steps through individual question indices and needs the raw per-question count.
- If a `toEqual` assertion on a section-score object starts failing after Task 7, that is expected — add `requiredCount` to the expectation rather than loosening the assertion to `toMatchObject`.
