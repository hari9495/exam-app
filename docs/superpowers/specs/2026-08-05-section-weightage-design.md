# Section Weightage — Design

## Goal

Let a recruiter assign each exam section an independent weight (a percentage of
the exam's total grade), decoupled from how many marks its questions literally
add up to — e.g. "Coding is 60% of the grade" even if Coding's questions only
carry 30% of the exam's raw marks. The weighted percentage becomes the real,
authoritative score: it drives pass/fail and leaderboard ranking, not just a
side display.

## Current state (traced from code, not assumed)

- `ExamSection` (schema.prisma) has no weight/percentage field. Only
  `Question.marks`/`negativeMarks` carry scoring weight today.
- Grading is section-*unaware*: `computeResult()` (apps/exam-runtime/src/grading/grading.ts)
  flat-sums every question's `marksAwarded` across the whole exam and divides
  by total marks. It has no concept of sections.
- `computeResult()` has exactly two production call sites, both in
  `attempt-settlement.service.ts`: `finalize()` (auto-grading at submit time)
  and `finalizeManualGrade()` (re-run once code questions get manual marks).
- Every attempt captures `sectionSnapshotJson` at start time
  (`attempt.service.ts`'s `loadSections`/section-generation logic): an array of
  `{ sectionId, title, targetDurationMinutes, questionIds }`, frozen for that
  attempt regardless of later exam edits. This already gives per-attempt
  section→question membership without a new query.
- Section-level score breakdown exists today only for *display*, in
  `reports.service.ts`'s `computeSectionScores()` — a separate, independent
  sum-of-marks calculation, never fed back into `Result.percentage`.
- `Result.percentage` is the single source of truth consumed everywhere else:
  `leaderboard.service.ts` reads `attempt.result.percentage` directly (no
  recomputation), `reports.service.ts` reads `row.percentage` directly in all
  three call sites, and `attempt.service.ts`'s `buildFeedback()` (candidate's
  own results view) also reads `result.percentage` directly. No frontend code
  independently recomputes percentage from score/maxScore. This means fixing
  the two `computeResult()` call sites is sufficient — every downstream
  consumer updates automatically.
- Section mutation (`createSection`/`updateSection`/`deleteSection`/
  `duplicateSection`) already goes through `assertExamMutable()`, which blocks
  any edit once the exam is published OR once any candidate has started an
  attempt (`ConflictException` either way). This is a stronger, already-built
  guarantee than "lock on publish" — weight inherits it for free by riding the
  same DTOs/endpoint.
- `PATCH /exams/:id/sections/:sectionId` → `exams.service.ts#updateSection`
  already exists and is reused, not replaced.
- `publish()` (`exams.service.ts:487`) already runs pre-publish validations
  (≥1 section, pool sections have enough matching questions) — the natural
  place to add the weight-sum-must-equal-100 check.

## Data model

`ExamSection.weightPercent: Int` (0–100), not nullable, no schema default —
every code path that creates a section computes and supplies a value
explicitly (see below), so there's never an ambiguous "unset" state to handle
downstream.

**New section default** (`createSection`): 100 if it's the exam's only
section so far (mirrors the existing `lastSection` presence check already
used for `orderIndex`), else 0. A lone section is trivially the whole grade —
zero recruiter action needed for the common single-section exam. Any
additional section starts at 0 and must be assigned manually; the running
total simply won't be 100 until the recruiter does, which is visible in the
UI immediately (not a silent trap sprung only at publish).

**Duplicate section** (`duplicateSection`): copies the source section's
`weightPercent` verbatim, same as it already copies title/pool config/
questions. This will usually push the exam's total over 100%, which is fine —
same "fix before publish" story as adding a section.

**Backfill migration** (existing `ExamSection` rows): each section's
`weightPercent` = its current share of the exam's total marks
(`Σ its questions' marks ÷ Σ all fixed-section questions' marks × 100`,
rounded to the nearest integer via the largest-remainder method so every
exam's sections sum to exactly 100). Sections in `selectionMode: 'pool'`
have no fixed mark total (each candidate draws a different subset), so they
split whatever percentage isn't claimed by fixed sections equally among
themselves; an exam made entirely of pool sections splits 100% equally.
**Why this matters for correctness:** this backfill makes the new weighted
formula mathematically equal to the old flat-sum formula for every
already-published exam, so historical `Result` rows need zero rewriting —
weighted-vs-unweighted only diverges once a recruiter deliberately edits a
weight on a *new* (post-migration) draft exam.

**Migration mechanics:** the largest-remainder rounding and fixed-vs-pool
split logic is real application code, not something to hand-write as raw
T-SQL against SQL Server. Following the existing precedent in this codebase
(`20260804120000_invitation_email_status` +
`20260805100000_backfill_invitation_email_status`), this ships as two
migrations: (1) add `weightPercent` as a nullable column, (2) a Prisma-Client
backfill script run once against every exam's sections (grouped by
`examId`), then a follow-up statement making the column `NOT NULL`.

## Editing & validation

No new endpoint. `weightPercent` becomes an optional field on
`UpdateExamSectionDto`, threaded through `updateSection`'s existing
`tx.examSection.update({ data: { ... } })` call. It inherits
`assertExamMutable()`'s existing lock (published, or any attempt started →
`ConflictException`) automatically.

Sum-to-100 is **not** enforced on every individual section save (a recruiter
adjusting three sections one at a time would otherwise never be able to save
an intermediate state). It's enforced once, server-side, inside `publish()`:
if `Σ section.weightPercent !== 100`, throw
`BadRequestException` naming the actual total, right alongside the existing
"must have ≥1 section" / pool-availability checks.

## Scoring (the correctness-critical part)

Both `computeResult()` call sites in `attempt-settlement.service.ts` change
to compute a **weighted** percentage instead of the current flat one:

```
for each section in sectionSnapshot:
  sectionScore = Σ marksAwarded for that section's questionIds, floored at 0
                 (matches reports.service.ts's existing per-section floor)
  sectionMax   = Σ marks for that section's questionIds
  sectionContribution = sectionMax > 0 ? (sectionScore / sectionMax) × weightPercent : 0

weightedPercentage = Σ sectionContribution across all sections
```

`weightPercent` per section comes from the same `sectionSnapshotJson` already
captured at attempt-start (add `weightPercent` as one more frozen field
alongside `title`/`targetDurationMinutes`, so a published exam's locked
weights are what every attempt is graded against, immutably, even if a
future code path somehow changed them after the fact).

`Result.score` / `Result.maxScore` stay exactly as they are today — the raw,
unweighted sum of marks awarded / available, for transparent "you scored
45/60 raw marks" display. Only `Result.percentage` changes meaning, from
"raw score as a percentage" to "weighted score as a percentage." Pass/fail
compares this weighted percentage against `exam.passCriteriaPercent`
(unchanged threshold semantics, just a different number feeding it).

`finalizeManualGrade()` gets the identical treatment (it currently doesn't
even receive `sectionSnapshotJson` — that gets added to its query).

## UI

- **ExamSectionsPanel.tsx**: a weight% number input in each section card's
  header (next to the title, editable while the exam is a draft with no
  started attempts — i.e., whenever the rest of that card already is). A
  panel-level running-total banner ("Weights total: 100%" in the neutral/
  success state, "Weights total: 82% — add 18% more before publishing" in a
  warning state) so the gap is visible the whole time, not just at publish.
  The `Publish` button's existing failure-toast path surfaces the server's
  400 if a recruiter tries anyway.
- **CandidateReportPanel.tsx**: each section row gets its weight% shown next
  to its raw score (e.g. "Coding — 45/60 · 60% weight"), giving the recruiter
  exactly the "which section should I focus on" signal from the original ask.
- No leaderboard/results-list UI changes — they already just render whatever
  `percentage` the API returns.

## Testing

- `grading.ts`: new/updated unit tests for a weighted computation helper
  (empty section, zero-max section, single section, multiple sections,
  negative-marks section floored at 0 before weighting).
- `attempt-settlement.service.spec.ts`: both call sites re-verified with a
  multi-section `sectionSnapshotJson` fixture showing the weighted result
  differs from the flat sum when weights are uneven.
- `exams.service.spec.ts`: `createSection` default (100 for first section, 0
  otherwise), `duplicateSection` copies weight, `publish()` rejects a
  non-100 sum with the right message, accepts exactly 100.
- Migration: verify backfill produces integer weights summing to exactly 100
  per exam, including a pool-only exam and a mixed fixed+pool exam.
- Frontend: `ExamSectionsPanel.test.tsx` weight input + running-total banner;
  `CandidateReportPanel.test.tsx` weight% display.
