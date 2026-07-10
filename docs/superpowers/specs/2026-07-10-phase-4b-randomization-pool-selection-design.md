# Phase 4b — Randomization & Pool-Based Question Selection Design Spec

**Status:** Approved, ready for implementation planning.
**Date:** 2026-07-10
**Depends on:** Phase 4a (Question Tagging & Negative Marking) — merged to `main` (commit `257f2cc`). Pool selection's tag-matching criteria depend directly on the `Tag`/`QuestionTag` model Phase 4a introduced; Phase 4a's own design doc explicitly deferred multi-tag AND-matching to this sub-phase.

---

## 1. Context and Scope

The second sub-phase of Phase 4 (Randomization, Question Pools & Reporting Depth). A pre-scoping survey of the current codebase confirmed:

- Question order is deterministic today — `AttemptService.start()` flattens `ExamSection.orderIndex` → `ExamSectionQuestion.orderIndex` identically for every candidate. No shuffle logic exists anywhere in the codebase.
- Option order has no explicit ordering or per-attempt snapshot at all.
- `ExamSection`/`ExamSectionQuestion` express only a fixed, explicit question list — no concept of "pick N questions matching criteria."
- Grading already computes `maxScore`/`percentage`/`passFail` per-attempt from that attempt's own `questionOrderJson`, not from any exam-wide constant — so pool selection (different question subsets per candidate) requires no changes to grading logic.
- Phase 4a's `GET /questions?tagId=` filter only supports a single tag; pool selection needs multi-tag AND-matching, which Phase 4a's own design doc flagged as deferred here.

**Goal of this sub-phase:** let a recruiter (1) opt an exam into randomized question and option order, and (2) configure a section to draw N questions matching tag/difficulty criteria at attempt-start, instead of only a fixed explicit list.

### In scope
- `Exam.randomizeOrder` toggle controlling both question-order and option-order shuffling together.
- Per-section `selectionMode` ('fixed' | 'pool'): a pool section stores criteria (count, required tags, optional difficulty) instead of an explicit question list; the actual questions are drawn fresh per candidate at attempt-start.
- Multi-tag AND-matching (a question must have every specified tag) for pool criteria, and publish-time validation that each pool has enough matching questions.
- A per-attempt section+question snapshot (see Section 3) — a necessary architectural correction, not scope creep: pool-drawn questions have no persisted link row for `loadSections()` to re-derive their section membership from, the way fixed sections' `ExamSectionQuestion` rows allow today.

### Explicitly out of scope (deferred)
- Section timers/locks, the analytics dashboard, export, and the Interview Panel role — separate Phase 4 sub-phases.
- Mixing fixed and pool-filled questions within one section — a section is always unambiguously one mode.
- OR-matching or any tag-matching mode beyond AND for pool criteria.
- Any Question Bank / Exam Builder frontend UI — still doesn't exist in `apps/web`; this remains backend-only, matching every Phase 1/4a precedent.
- Retrofitting the same snapshot correction onto every other latent live-re-derivation quirk in `AttemptService` beyond what pool selection itself requires.

---

## 2. Schema

### `Exam.randomizeOrder`

```prisma
randomizeOrder Boolean @default(false) @map("randomize_order")
```
Added to the existing `Exam` model. Default `false` preserves current behavior for every existing exam.

### `ExamSection` pool fields + `ExamSectionPoolTag`

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
`ExamSectionPoolTag` follows the exact shape `QuestionTag` already established (no `organizationId`, no RLS — reached only through an already-tenant-filtered `ExamSection`). `Tag` gains a second back-relation field (`poolSections ExamSectionPoolTag[]`, alongside its existing `questions QuestionTag[]`).

A `'fixed'` section's `poolSize`/`poolDifficulty`/`poolTags` stay unset; a `'pool'` section's `ExamSectionQuestion` rows stay empty. The two are mutually exclusive by construction, enforced at the service layer (Section 3).

### `Attempt.optionOrderJson` and `Attempt.sectionSnapshotJson`

```prisma
optionOrderJson    String? @map("option_order_json") @db.NVarChar(Max)
sectionSnapshotJson String @map("section_snapshot_json") @db.NVarChar(Max)
```

`optionOrderJson` is the per-attempt option-order snapshot: `{ [questionId]: optionId[] }`, populated only when `randomizeOrder` is true, `null` otherwise (candidate sees DB order, exactly as today).

`sectionSnapshotJson` is new and required (not nullable) — see Section 3 for why. Shape: `[{ sectionId: string, title: string, questionIds: string[] }]`, built once at `start()` from whichever questions were actually selected (fixed list or pool draw) for that attempt, in section order.

---

## 3. Attempt-Start Selection, Randomization, and the Snapshot Correction

### The gap this closes

`AttemptService.loadSections()` currently re-queries the *live* `ExamSection`/`ExamSectionQuestion` tables on every call (`getCurrent()`, and the response of `start()`), filtering by the attempt's stored `questionOrderJson`. This works today only because a fixed section's question-to-section link (`ExamSectionQuestion`) is itself a durable row a candidate's already-started attempt can keep re-reading. A pool-drawn question has **no such row** — it was matched by criteria, not linked — so there is nothing for a live re-query to find. `loadSections()` must instead read from a snapshot taken once, at `start()`, the same moment `questionOrderJson` is taken.

This also incidentally corrects a latent quirk in the current fixed-section behavior (if a recruiter edits a section's question list after a candidate has already started, `loadSections()` today would silently reflect the live edit rather than what the candidate's attempt actually snapshotted) — not a goal of this sub-phase, but a natural side effect of building the snapshot correctly rather than only for pool sections.

`questionOrderJson`'s own shape and every existing consumer (`attempt-settlement.service.ts`'s grading, `monitoring.service.ts`'s `totalQuestions`) are unchanged — they only ever needed a flat ID list, which pool selection still produces.

### `shuffle()` utility

A new pure `apps/exam-runtime/src/attempts/shuffle.ts`, Fisher-Yates, colocated with its only consumer:
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
No existing shuffle/array utility exists anywhere in the codebase (`packages/shared` or `apps/exam-runtime`) — confirmed by search.

### `start()` — selection + snapshot

For each `ExamSection` (ordered by `orderIndex`):
- **`'fixed'`**: take its `ExamSectionQuestion` list (already ordered by `orderIndex`) — shuffled via `shuffle()` if `exam.randomizeOrder`, otherwise unchanged (identical to today's behavior when the toggle is off).
- **`'pool'`**: query questions matching every one of the section's `ExamSectionPoolTag` tag IDs (AND — one `tags: { some: { tagId } }` clause per tag, `AND`-ed together, the confirmed-correct Prisma pattern for this many-to-many shape) plus `poolDifficulty` if set, `status: 'active'`, scoped to the exam's `organizationId`; shuffle the matches; take the first `poolSize`. Pool sections are always freshly randomized in composition — the `randomizeOrder` toggle only governs whether a *fixed* section's curated order gets shuffled, since a pool draw has no "curated order" to preserve in the first place.

The flattened result across all sections becomes `questionOrderJson`, exactly as today. The same per-section structure (section id/title + its resolved question IDs, in order) becomes `sectionSnapshotJson`.

If `randomizeOrder` is true, `optionOrderJson` is built by fetching every selected question's options and shuffling each question's option-id list independently; if false, `optionOrderJson` stays `null`.

### `loadSections()` — reads the snapshot, not live tables

Replaces its current `examSection.findMany(...)` + filter with: parse `sectionSnapshotJson`, collect every question id across all sections, fetch those `Question` rows (with `options`) in one query (question *content* — text, marks — still reflects the current DB state, matching today's behavior; only section *membership* is now snapshotted, not question content), then assemble each section's question list from the snapshot's id order. When `optionOrderJson` has an entry for a question, its options are reordered to match; otherwise options stay in DB order (today's behavior, unchanged when `randomizeOrder` is off).

Grading (`attempt-settlement.service.ts`) and monitoring (`monitoring.service.ts`) are untouched — both already consume only the flat `questionOrderJson`, which keeps its exact shape and meaning.

---

## 4. Exam / Section API

**`CreateExamDto`** (inherited by `UpdateExamDto`) gains `@IsOptional() @IsBoolean() randomizeOrder?: boolean`.

**`UpdateExamSectionDto`** gains:
```typescript
@IsOptional() @IsIn(['fixed', 'pool']) selectionMode?: string;
@ValidateIf((o) => o.selectionMode === 'pool') @IsInt() @Min(1) poolSize?: number;
@IsOptional() @IsIn(['easy', 'medium', 'hard']) poolDifficulty?: string;
@ValidateIf((o) => o.selectionMode === 'pool') @IsArray() @ArrayMinSize(1) @IsString({ each: true }) poolTagIds?: string[];
```
`poolSize`/`poolTagIds` become required only when `selectionMode` is `'pool'` (via `@ValidateIf`), matching class-validator's existing conditional-validation idiom.

**`ExamsService.updateSection`** enforces the mode exclusivity: switching `'fixed' → 'pool'` clears any existing `ExamSectionQuestion` rows for that section; switching `'pool' → 'fixed'` clears `ExamSectionPoolTag` rows and resets `poolSize`/`poolDifficulty` to `null`. Providing new `poolTagIds` on an already-pool section does a full replace (delete-then-recreate), the same idiom already used for `replaceSectionQuestions` and question tags.

**`ExamsService.publish`** extends its existing per-section validation loop: a `'fixed'` section still requires ≥1 linked `ExamSectionQuestion` (unchanged); a `'pool'` section instead runs the same AND-tag-matching count query `start()` uses for the actual draw, and rejects publish with a clear error naming the section and the shortfall if the count is below `poolSize`. This is the only enforcement point — a candidate can never reach a broken pool, since publish already guaranteed enough matching questions existed at that moment.

Every section response (from create/update/the exam's own GET) includes its `selectionMode` and, when `'pool'`, `poolSize`/`poolDifficulty`/`poolTagIds`.

---

## 5. Testing Approach

- **Unit:**
  - `shuffle.spec.ts`: permutation-property tests (same length, same elements as a set) — not exact-order assertions, since it's `Math.random`-based.
  - `attempt.service.spec.ts`: extended for — fixed-order preserved when `randomizeOrder` is off (existing tests' exact-order assertions should still pass unchanged); question order shuffled when on; a pool section drawing `poolSize` matching questions; `optionOrderJson` populated/omitted correctly; `loadSections()` reading from `sectionSnapshotJson` instead of live tables.
  - `exams.service.spec.ts`: extended for — mode-switch clearing (`fixed→pool` drops `ExamSectionQuestion`, `pool→fixed` drops `ExamSectionPoolTag`), pool `poolTagIds` full-replace, publish accepting a pool with exactly `poolSize` matches and rejecting one short by even one.
- **e2e:**
  - Extend `exam-builder.e2e-spec.ts`: configure a section as `'pool'` with real tag criteria, confirm publish rejects when underfilled and succeeds once enough matching questions exist.
  - Extend `exam-taking-runtime.e2e-spec.ts`: a real candidate attempt against a pool-based exam, asserting every question the candidate actually received satisfies the pool's tag/difficulty criteria. For `randomizeOrder: true`, avoid a probabilistic "does the order differ from DB order" assertion (a `Math.random`-based shuffle can coincidentally reproduce the original order, making that assertion inherently flaky) — instead assert the *snapshot* behavior directly: two separate `GET /attempt/current` calls within the same attempt return byte-identical option order for every question, proving `optionOrderJson` was actually persisted and reused rather than re-shuffled per request. Combined with the unit-level proof that `shuffle()` is invoked and its output flows into `optionOrderJson` (already covered above), this fully exercises the real behavior without a flaky assertion.
- **Migration:** real SQL Server migration for the new `Exam`/`ExamSection`/`Attempt` columns and the new `exam_section_pool_tags` table, verified directly against `INFORMATION_SCHEMA`, matching every prior schema-touching phase's standard.

---

## 6. Open Items / Deferred to Future Sub-Phases

- Section timers/locks, the analytics dashboard, export, and the Interview Panel role — separate Phase 4 sub-phases, unaffected by this one's schema changes.
- The pre-existing live-re-derivation quirk this sub-phase's snapshot correction fixes as a side effect was not independently audited for other latent consequences beyond what `loadSections()` itself does — worth a note if a future phase touches `AttemptService` again.
- No mechanism to preview or re-roll a pool's draw before a candidate starts — the draw happens exactly once, silently, at `start()`, matching how `questionOrderJson` itself already works today.
