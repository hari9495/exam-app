# Phase 4c — Section Target Duration Design Spec

**Status:** Approved, ready for implementation planning.
**Date:** 2026-07-10
**Depends on:** Phase 4b (Randomization & Pool-Based Question Selection) — merged to `main` (commit `ef7704c`). Reuses Phase 4b's per-attempt section-snapshot mechanism (`Attempt.sectionSnapshotJson`) as the source of truth for the candidate-facing response.

---

## 1. Context and Scope

The third sub-phase of Phase 4. The original roadmap bullet was "section timers/locks," but scoping conversation surfaced a real tension: the user wants candidates to always be able to revisit and change answers in any section, at any time before final submission — no section should ever become inaccessible or force a candidate away from an answer they want to reconsider. A hard lock is fundamentally incompatible with that.

Given that, "section timers" without a lock has no runtime enforcement to attach to — nothing should happen when a section's target time is exceeded, since nothing is allowed to happen. What's left is the genuinely useful, low-risk piece: a recruiter can set an expected/target duration per section when building the exam, and it's shown to the candidate as pacing guidance. Nothing about answering, navigation, or the existing exam-wide deadline (`Exam.durationMinutes` / `Attempt.startedAt`, unchanged since Phase 1d) changes.

A pre-scoping survey of the current codebase confirmed:
- Exactly one exam-wide clock exists today (`computeRemainingSeconds(exam.durationMinutes, attempt.startedAt)`, `grading.ts:46-49`) — no per-section timing concept anywhere.
- The candidate receives all sections and all questions in one response and can answer any question in any order at any time before the exam-wide deadline — no sequencing or locking concept exists, and this phase does not change that.
- No candidate-facing UI exists in `apps/web` (matching every prior backend-only Phase 1/4a/4b precedent) — this stays backend-only.

**Goal of this sub-phase:** let a recruiter set an optional target duration per section, and surface it to the candidate for pacing purposes only — no enforcement, no locking, no new state machine.

### In scope
- `ExamSection.targetDurationMinutes` (nullable, optional, purely informational).
- Exposed through the existing section create/update admin API.
- Exposed through the candidate-facing attempt response (`AttemptSection`), captured in the per-attempt section snapshot (Phase 4b's `sectionSnapshotJson`) at `start()` time, for snapshot-consistency with everything else that snapshot already carries.

### Explicitly out of scope (deferred — not part of "section timers/locks" as re-scoped)
- Any live per-section countdown, section-entry tracking, or new `Attempt` state — there is nothing to count down to or enforce.
- Sequential section locking of any kind — explicitly rejected during scoping; candidates can always revisit and re-answer any section.
- Any change to the existing exam-wide `Exam.durationMinutes` deadline or `settleIfExpired` auto-submit behavior.
- Any candidate-facing UI — still doesn't exist in this codebase; this phase only makes the data available for a future UI to read.
- Validation of a section's target duration against the exam's overall `durationMinutes` (e.g. rejecting a target that would exceed the exam length) — it's advisory-only, so nothing depends on it summing correctly.

---

## 2. Schema

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

One nullable column, no new tables, no RLS impact — `exam_sections` has no RLS registration today (confirmed during Phase 4b's Task 1: it has no `organizationId` column at all, reached only via `Exam`), and a new nullable column on it doesn't change that.

---

## 3. Admin API

`CreateExamSectionDto` gains `@IsOptional() @IsInt() @Min(1) targetDurationMinutes?: number`. `UpdateExamSectionDto extends CreateExamSectionDto` with no overrides needed — it inherits this automatically, same as every other base field.

`ExamsService.createSection` passes `targetDurationMinutes: dto.targetDurationMinutes` straight into the create `data` — when omitted, Prisma treats the `undefined` value as "don't set this key," and the nullable column defaults to `NULL` on insert.

`ExamsService.updateSection` follows the exact conditional-spread idiom already used for `Exam.update`'s optional fields (`...(dto.durationMinutes !== undefined ? { durationMinutes: dto.durationMinutes } : {})`), added alongside the existing `title`/`selectionMode`/pool fields in the `data` object:
```typescript
...(dto.targetDurationMinutes !== undefined ? { targetDurationMinutes: dto.targetDurationMinutes } : {})
```
This gives correct PATCH semantics: omitting the field from the request body leaves the stored value untouched; explicitly sending `targetDurationMinutes: null` clears a previously-set value (class-validator's `@IsOptional()` treats `null` as "skip validation," so an explicit `null` passes through to the service, then `!== undefined` is true for `null`, so the clear is applied). This field is independent of the `selectionMode` fixed/pool mode-switch logic Phase 4b introduced — it's simply threaded through alongside it, no interaction with pool-tag clearing/replacement.

---

## 4. Candidate-Facing Exposure

`apps/exam-runtime/src/attempts/attempt.service.ts`'s `SectionSnapshotEntry` interface gains `targetDurationMinutes: number | null`, captured in `start()` at snapshot-build time (`sectionSnapshot.push({ sectionId: section.id, title: section.title, targetDurationMinutes: section.targetDurationMinutes, questionIds })`) — the same moment every other per-section fact is captured, so a recruiter editing the target duration mid-attempt doesn't inconsistently affect an already-started candidate's view (the same snapshot-consistency principle Phase 4b's design established for section membership itself).

The `AttemptSection` wire interface (returned by `loadSections()`, consumed by both `getCurrent()` and the response of `start()`) gains the same field, read straight from the snapshot entry — no new query, no new database read.

---

## 5. Testing Approach

- **Unit:**
  - `exams.service.spec.ts`: `createSection`/`updateSection` with `targetDurationMinutes` provided, omitted, and explicitly cleared (`null`).
  - `attempt.service.spec.ts`: `start()`'s snapshot captures `targetDurationMinutes` from the live section at snapshot time; `getCurrent()`'s response surfaces it (including the `null` case for a section that never had one set).
- **e2e:**
  - Extend `exam-builder.e2e-spec.ts`: set a target duration via the section update endpoint, confirm it round-trips through `GET /exams/:id`.
  - Extend `exam-taking-runtime.e2e-spec.ts`: a candidate's `GET /attempt/current` response includes the section's target duration.
- **Migration:** a real SQL Server migration adding the single nullable column, verified directly against `INFORMATION_SCHEMA`, matching every prior schema-touching phase's standard.

---

## 6. Open Items / Deferred to Future Sub-Phases

- Reporting depth + export, the analytics dashboard, and the Interview Panel role — separate Phase 4 sub-phases, unaffected by this one.
- If a future phase ever needs genuine per-section enforcement (a real lock, live countdown, auto-advance), that is a materially different feature requiring new `Attempt`-level state and a section-entry/exit signal from the candidate client — explicitly not what this sub-phase builds, and would need its own scoping conversation given the UX tension this session already surfaced (candidates wanting to freely revise earlier answers).
- No validation ties a section's target duration to the exam's overall `durationMinutes` — if this becomes a real recruiter pain point (e.g. section targets summing to more than the exam length), a future phase can add a soft warning; not blocking today since the field carries no enforcement weight either way.
