# Phase 4a — Question Tagging & Negative Marking Design Spec

**Status:** Approved, ready for implementation planning.
**Date:** 2026-07-10
**Depends on:** Phase 1a (Question Bank) — merged to `main`. This is the first sub-phase of Phase 4 (Randomization, Question Pools & Reporting Depth); it was scoped as the foundational, lowest-risk piece because the randomization/pool-selection sub-phase that comes after it needs a tag model to query against.

---

## 1. Context and Scope

The original platform roadmap's Phase 4 (`docs/superpowers/specs/2026-07-07-online-mcq-exam-platform-design.md`, Section "Phase 4") bundles several independent subsystems: randomization, tag/difficulty-based pool selection, negative marking, section timers/locks, a full analytics dashboard, CSV/Excel/PDF export, and an Interview Panel role. A pre-scoping survey of the current codebase confirmed these are genuinely independent — Phase 4 is decomposed into sub-phases (4a, 4b, ...) the same way Phase 3 was (3a-3d), each scoped and shipped on its own.

This sub-phase covers the two smallest, most foundational pieces:

1. **Question tagging** — a new many-to-many `Tag` model, additive to the existing `topic`/`category` string fields (no migration of existing data, no change to current Question Bank filtering behavior).
2. **Negative marking** — `Question.negativeMarks` already exists in the schema and is validated on create/update, but is never read during grading. This wires it into the actual scoring path.

The survey also found that **`apps/web` has no Question Bank UI at all** — Phase 1a and Phase 1b shipped API-only, with no list/create/edit screens ever built in the Next.js app. Building that UI from scratch is a substantially larger undertaking than tags + negative marking themselves, so it is explicitly out of scope here (see Section 6) and left for its own future sub-phase, matching Phase 1a/1b's own precedent of shipping backend-only.

### In scope
- `Tag` and `QuestionTag` models, with `Tag` registered on the tenant RLS policy.
- `CreateQuestionDto`/`UpdateQuestionDto` accept tag names; `QuestionsService` resolves/creates tags and writes the join rows.
- Question responses include each question's tags.
- `GET /questions` gains a `tagId` filter.
- New `GET /tags` endpoint for listing an organization's tags (autocomplete backing data for a future UI).
- `gradeAnswer`/`computeResult` in `apps/exam-runtime`'s grading logic apply negative marking, with unattempted questions never penalized and the total score floored at 0.

### Explicitly out of scope (deferred)
- Any Question Bank / Exam Builder frontend UI — a separate future sub-phase; Phase 1a/1b's own precedent.
- Tag rename/delete or a dedicated tag-management screen/endpoints — tags are created implicitly via the question DTO's `tags` field only.
- Multi-tag AND/OR filtering and tag/difficulty-based pool selection — belongs to the randomization/pool-selection sub-phase that depends on this one.
- Partial credit for multi-select questions — `gradeAnswer` stays all-or-nothing; negative marking doesn't change that boundary.
- Section timers/locks, analytics dashboard, export, Interview Panel role — separate Phase 4 sub-phases.

---

## 2. Schema

### `Tag` — new top-level, tenant-scoped model

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
```

Follows the exact shape of `Question`/`Exam` — a plain `organizationId` UUID column with **no Prisma relation to `Organization`** (confirmed: `Question.organizationId`, `schema.prisma:105`, has no `@relation` attribute and `Organization`, `schema.prisma:22-38`, only declares back-relation arrays for `users`/`auditLogs` — tenant-scoped tables rely on RLS plus explicit `organizationId` filters in every query, not a Prisma-level relation), and registration on `TenantAccessPolicy` via a new migration:

```sql
ALTER SECURITY POLICY dbo.TenantAccessPolicy
ADD FILTER PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.tags,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.tags AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.tags AFTER UPDATE;
```

(Verbatim structure of `20260707130003_question_bank_rls`'s migration for `dbo.questions`, substituting the table name — reuses the existing `dbo.fn_tenant_access_predicate` function and the existing `TenantAccessPolicy`, no new policy or function.)

`@@unique([organizationId, name])` prevents duplicate tag names within one organization; tag resolution (Section 3) relies on this constraint to make find-or-create safe.

### `QuestionTag` — new join table, no RLS (matches existing join-table convention)

```prisma
model QuestionTag {
  questionId String   @map("question_id") @db.UniqueIdentifier
  tagId      String   @map("tag_id") @db.UniqueIdentifier
  question   Question @relation(fields: [questionId], references: [id], onDelete: Cascade)
  tag        Tag      @relation(fields: [tagId], references: [id], onDelete: Cascade)

  @@id([questionId, tagId])
  @@map("question_tags")
}
```

No `organizationId` column and no RLS registration — this matches every other join/child table in the schema today (`ExamSectionQuestion`, `QuestionOption`, `Answer`, none of which have `organizationId` or RLS either). Tenant isolation for `QuestionTag` is enforced the same way it already is for those tables: purely at the application/service layer, by only ever reaching it through a `Question` row that itself passed RLS/tenant filtering. This is not a new gap being introduced — it's the codebase's existing, consistent pattern for child tables.

`Question.negativeMarks` (`schema.prisma:112`) needs no schema change — it already exists, is already validated in `question-validation.ts`, and is simply unused by grading today (Section 4 fixes that).

---

## 3. Question API changes

### DTOs

`CreateQuestionDto` (`apps/api/src/questions/dto/create-question.dto.ts`) gains:
```typescript
@IsOptional()
@IsArray()
@IsString({ each: true })
tags?: string[];
```
`UpdateQuestionDto extends CreateQuestionDto` with no overrides today, so it inherits this field automatically — no separate change needed there.

### `QuestionsService`

A new private helper resolves tag names to IDs, creating any that don't exist yet for the tenant:

```typescript
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
```

`create` (`questions.service.ts:23-51`) calls `resolveTagIds` before the `tx.question.create(...)` call and adds `tags: { create: tagIds.map((tagId) => ({ tagId })) }` to the nested `data`, alongside the existing `options: { create: ... }`, and `include: { options: true, tags: { include: { tag: true } } }`.

`update` (`questions.service.ts:83-117`) follows the exact same full-replacement pattern the method already uses for options (`tx.questionOption.deleteMany({ where: { questionId: id } })` at line 98): add `await tx.questionTag.deleteMany({ where: { questionId: id } })` alongside it, resolve the new tag names, and include `tags: { create: tagIds.map((tagId) => ({ tagId })) }` in the update's `data`.

`list` (`questions.service.ts:53-68`) and `findOne` (`questions.service.ts:70-81`) both add `tags: { include: { tag: true } }` to their `include`, and gain a `tagId` filter in `list`'s `where` (alongside the existing `topic`/`difficulty` conditions):
```typescript
...(filters.tagId ? { tags: { some: { tagId: filters.tagId } } } : {}),
```

Every question response shape becomes `{ ...question, tags: [{ id, name }] }` — the controller/service maps the raw `QuestionTag & { tag: Tag }[]` include down to a flat `{ id, name }[]` before returning, so callers never see the join-table shape.

### Controller

`QuestionsController.list` (`questions.controller.ts:23-34`) gains `@Query('tagId') tagId?: string`, passed through to the service's filters object.

### New `TagsController`

```typescript
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

`TagsService.list` returns `tx.tag.findMany({ where: { organizationId }, orderBy: { name: 'asc' } })` — no pagination needed at this scale (a tag list, not a question list). No new permission key — `question_bank:manage` (already used by every question-bank route) covers this, since tags are a question-bank concept, not a separate resource with its own access boundary. No `POST /tags` — creation is implicit through the question DTO's `tags` field only, per the create-on-the-fly decision; a standalone create endpoint would be unused surface with no caller.

---

## 4. Negative Marking in Grading

`apps/exam-runtime/src/grading/grading.ts`:

```typescript
export interface GradableQuestion {
  marks: number;
  negativeMarks: number;
  correctOptionIds: string[];
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
```

An unattempted question (`selectedOptionIds.length === 0`) always scores 0 — no penalty for skipping, matching the standard "guessing is discouraged, skipping isn't" convention. Only a wrong *selected* answer deducts `negativeMarks`.

```typescript
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
```

The raw (possibly negative) sum is floored at 0 before `percentage`/`passFail` are computed from it — so `percentage` can never be negative, and no display code anywhere needs to handle a negative score or percentage.

`apps/exam-runtime/src/grading/attempt-settlement.service.ts` (around line 59, where it currently builds `{ marks: question.marks, correctOptionIds }` for `gradeAnswer`) adds `negativeMarks: question.negativeMarks` to that object — the field is already available on `question` from the existing `tx.question.findMany(...)` call at line ~51, no new query needed.

---

## 5. Testing Approach

- **Unit:**
  - `grading.spec.ts`: new cases — wrong answer with a selection deducts `negativeMarks`; unattempted (empty selection) scores 0, not a deduction; an attempt whose wrong answers outweigh correct ones floors `score`/`percentage` at 0 rather than going negative; existing all-correct/all-wrong-no-negative-marks cases still pass unchanged.
  - `questions.service.spec.ts`: new cases — creating a question with new tag names creates `Tag` rows and links them; creating a question reusing an existing org tag name reuses the existing row (no duplicate); updating a question's tags fully replaces the prior set (added tag appears, removed tag's `QuestionTag` row is gone, but the `Tag` row itself survives since another question or nothing else may still reference it); tag names are case-sensitive exact match and whitespace-trimmed; a `tagId` filter on `list` returns only matching questions.
  - New `tags.controller.spec.ts` / `tags.service.spec.ts`: `GET /tags` returns only the caller's organization's tags, alphabetically ordered.
- **e2e:** extend `question-bank.e2e-spec.ts` with a real create-with-tags → list-with-tagId-filter → update-replaces-tags round trip against a real database. Extend whichever existing e2e spec covers attempt grading (in `apps/exam-runtime`'s dual-app e2e suite) with a real negative-marking attempt: one wrong selected answer (score reduced), one unattempted question (not reduced further), and a case where enough wrong answers would go negative (confirm the persisted `Result.score`/`percentage` are floored at 0).
- **Migration:** a real, hand-verified SQL Server migration for `tags`/`question_tags` (confirmed via `INFORMATION_SCHEMA.COLUMNS`/`TABLES`, matching every prior schema-touching phase's verification standard) plus the RLS policy addition for `tags` (confirmed the same way Phase 0's RLS tests verify cross-tenant isolation — a query as one organization's session context must not see another organization's tags).

---

## 6. Open Items / Deferred to Future Sub-Phases

- **Question Bank / Exam Builder frontend UI** — does not exist in `apps/web` today (Phase 1a/1b shipped API-only). Building it is a substantially larger, separately-scoped undertaking, not a small addition on top of tags. A future sub-phase should scope "Question Bank & Exam Builder UI" on its own, at which point it would also surface the tag input and negative-marks field built here.
- **Tag management** (rename, delete, merge duplicates) — no endpoints or UI; revisit only if organizations actually accumulate messy tag data in practice.
- **Multi-tag filtering (AND/OR) and tag/difficulty-based pool selection** — the next Phase 4 sub-phase (randomization + pool-based selection) is the one that actually needs this; this sub-phase only had to make sure a queryable tag model exists for it to build on.
- **Partial credit, per-option negative marking, or negative-marking configuration at the exam level (vs. per-question)** — not requested; `negativeMarks` stays a per-question field exactly as it already exists in the schema.
