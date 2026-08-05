# Answer Any N of M — Design

## Goal

Let a recruiter show a section's questions but require only some of them to be
answered — e.g. "here are 5 code questions, answer any 3". The candidate picks
which ones to attempt; the best `N` of whatever they attempted are scored, and
they are graded out of `N` questions, not `M`.

Today this is impossible, and the intuitive workaround silently mis-scores
everyone: attaching 5 questions and telling candidates "answer any 3" leaves
`maxScore` summing all 5, so a candidate who answers 3 perfectly scores 60%.

## Current state (traced from code, not assumed)

- `ExamSection` (`apps/api/prisma/schema.prisma:357-376`) carries
  `selectionMode` (`fixed` | `pool`), `poolSize`, `poolDifficulty`,
  `targetDurationMinutes`, `weightPercent`. There is no notion of a question
  being optional, and no `requiredCount`-like field anywhere in the schema.
- `computeResult()` (`apps/exam-runtime/src/grading/grading.ts:39-74`) sums
  `marks` over **every** question for `maxScore`, and each section's
  `sectionMax` sums **every** `questionId` in that section. Nothing anywhere
  excludes a question from a denominator.
- `computeResult()` has exactly two production call sites, both in
  `attempt-settlement.service.ts`: `finalize()` and `finalizeManualGrade()`.
  Code questions are graded manually, so a section containing them is scored
  twice — the best-N selection must therefore be computed at both sites, not
  once at submit.
- `Answer` rows are created **lazily** (`attempt.service.ts:423-511`), not up
  front. A row appears on first save — including a bare mark-for-review toggle,
  which writes `selectedOptionIdsJson: '[]'`. "Unanswered" is therefore a
  *content* test, not a missing row, and that test is duplicated in two places:
  `exam/page.tsx:278-282` and `QuestionNavigator.tsx:19-23`.
- The one exception: `finalize()` back-fills a blank `Answer` row for **code**
  questions only (`attempt-settlement.service.ts:135-144`) so they surface in
  the manual grading queue.
- `Attempt.sectionSnapshotJson` freezes
  `{ sectionId, title, targetDurationMinutes, weightPercent, questionIds }` at
  attempt start (`attempt.service.ts:62-71`, built at `:360-388`). It is read in
  four places: `loadSections`, `buildFeedback`, settlement's
  `toGradableSections`, and `reports.service.ts`.
- **`loadSections` (`attempt.service.ts:1369-1421`) deliberately drops
  `sectionId` and `weightPercent`** — the candidate payload
  (`AttemptSection`, `apps/web/lib/types.ts:353-357`) carries only
  `{ title, targetDurationMinutes, questions }`. Any new per-section rule the
  candidate must *see* has to be added to that DTO explicitly; it will not
  arrive for free.
- The candidate exam page (`apps/web/app/(candidate)/exam/page.tsx`) steps
  through **one question at a time on a flat global index** — all sections are
  flattened by `flattenQuestions` (`QuestionNavigator.tsx:8-14`). Sections
  surface only as a badge above the question (`page.tsx:504-507`), as accordion
  groups in the navigator (`QuestionNavigator.tsx:63-126`, showing
  `answeredInGroup/total` per group), and as `{title, questionCount}` on the
  pre-start welcome page.
- Useful existing precedent: mark-for-review (`Answer.isMarkedForReview`) plus
  a "step through only these questions" filter mode
  (`page.tsx:377-392`) already exist — the closest thing to a question-subset
  mechanic in the UI.
- Header progress is a flat count: `answeredCount = questions.filter(isQuestionAnswered).length`
  over the whole paper (`page.tsx:286`), rendered as `X/Y answered`.
- Pool sections draw at attempt start via
  `shuffle(candidates).slice(0, poolSize)` (`attempt.service.ts:374-376`) from
  questions matching the section's AND-ed tags plus optional difficulty.
- `publish()` (`exams.service.ts:491`) already validates ≥1 section, pool
  availability, per-section question presence, and weights summing to 100 — the
  natural home for the new checks.
- Section mutation rides `assertExamMutable()`, which blocks edits once the exam
  is published or any attempt has started. `requiredCount` inherits that for
  free by going through the existing `PATCH /exams/:id/sections/:sectionId`.
- `ExamSectionQuestion` (`schema.prisma:378-387`) has composite PK
  `[sectionId, questionId]` and a dense `orderIndex` that is **rewritten by
  delete-then-recreate on every save** (`exams.service.ts:901-904`). Any
  per-link column added there would be wiped — so this feature must not store
  anything on that join table.

## Decisions

Four product decisions, settled before design:

1. **Which N count: the best N.** Grade everything attempted, keep the highest
   `N`. A candidate can never be punished for attempting an extra question, so
   there is no wrong strategy and no way to lose marks by accident. Rejected:
   candidate-explicitly-selects (needs a fallback rule anyway when they forget,
   which would be best-N — so the picking UI earns nothing), and first-N-attempted
   (punishes exploring; opening a question and typing one line would burn a slot).
2. **Equal marks, enforced at publish.** A section using this feature must have
   all its candidate questions carrying the same marks. Makes the rule
   explainable in one sentence and every candidate directly comparable. Rejected:
   scoring out of whichever N actually counted, which makes two candidates'
   percentages incomparable and defeats the point of a screening exam.
3. **Both fixed and pool sections** support it. For pool, the candidate is drawn
   `poolSize` questions and must answer `requiredCount` of those.
4. **Reports show counted vs dropped.** Without it a recruiter adds up the
   visible marks, gets a different number than the section score, and
   reasonably concludes the scoring is broken.

## Data model

`ExamSection.requiredCount: Int?` (`@map("required_count")`), nullable.

`null` means "every question must be answered" — today's behaviour. Existing
exams are therefore untouched with no backfill, and the feature is strictly
opt-in. This is the opposite choice from `weightPercent` (non-nullable, always
computed) and deliberately so: a weight always has a meaningful value for every
section, whereas "optional questions" is a mode most sections will never use,
and a nullable column lets `null` carry that meaning without a sentinel.

**M — how many the candidate sees** — is `questions.length` for a fixed section
and `poolSize` for a pool section.

### Validation (at `publish()`, beside the existing weight-sum check)

- `1 ≤ requiredCount ≤ M`.
- If `requiredCount < M`, every candidate question must carry equal marks:
  - **fixed**: the attached questions;
  - **pool**: every question matching the section's tag/difficulty filter — the
    same predicate `publish()` already uses for the pool-availability count, so
    it is one extra aggregate on a query that is already being run.
- `requiredCount === M` is normalised to `null` on write: it *is* "answer all",
  and storing it as a distinct state would create two representations of one
  meaning.

Validation lives at publish rather than on the PATCH because marks live on
`Question`, not on the section — a section can become invalid without being
edited (someone re-marks a question in the bank). Publish is the last moment
we control, and it is where the equivalent weight check already lives.

### Attempt snapshot

`SectionSnapshotEntry` gains `requiredCount: number | null`, frozen at attempt
start exactly as `weightPercent` is, so a later config edit cannot rescore a
candidate who has already started. A legacy snapshot lacking the key reads as
"all required" — matching the `toGradableSections` legacy handling already in
`attempt-settlement.service.ts:28-58`.

## Scoring

When `requiredCount` is `null` the behaviour is exactly today's: every question
counts, `sectionMax` sums them all. Everything below applies only when a
requirement is set.

Per section, over that section's graded answers:

1. Sort by `marksAwarded` descending; ties broken by the question's position in
   the section's `questionIds` (stable and reproducible — never by object key
   order, which is not guaranteed).
2. `sectionScore` = sum of the top `requiredCount`, floored at 0 (unchanged
   from today's per-section flooring).
3. `sectionMax` = sum of the **top `requiredCount` marks** among all `M` of the
   section's questions — including ones the candidate never opened. The
   denominator is a property of the exam, not of what was attempted.

Step 3 is written as "top N marks" rather than `requiredCount × mark` on
purpose. In the validated equal-marks case the two are identical, but a pool
section's eligible bank can change *after* publish (someone tags a new question
with different marks), so a later draw can be mixed despite validation passing.
Expressing the denominator as an actual max keeps it well-defined and degrades
to "best achievable" instead of erroring at settlement — a candidate mid-exam
must never hit a scoring exception because the bank drifted.

The result feeds the existing weighted formula unchanged:
`percentage += (sectionScore / sectionMax) × weightPercent`.

### Consequences, stated explicitly

- **Answering fewer than N is not special-cased.** The unfilled slots
  contribute 0 but still count toward `sectionMax`: answer 2 of 3 required and
  you are scored out of 3. Correct by construction, no extra branch.
- **Negative marking still applies within the counted N**, but a wrong extra
  attempt is simply dropped. Attempting a 4th is therefore never penalised —
  the point of best-N, but it does mean negative marking loses its deterrent on
  attempts beyond the requirement. Acceptable, and worth saying out loud so it
  is not later mistaken for a bug.
- **Both settlement call sites must apply the rule.** `finalize()` scores MCQs
  while code questions are still ungraded; `finalizeManualGrade()` re-scores
  once marks arrive. A section mixing both types would otherwise pick its best-N
  from a partially-graded set and never revisit it.
- **An all-code section legitimately scores 0 on the first pass.** `finalize()`
  already drops code questions from `scoredQuestions` when any exist
  (`attempt-settlement.service.ts:124`), so such a section has no gradable
  questions yet, contributes 0, and the attempt moves to `pending_manual_grade`.
  `finalizeManualGrade()` then recomputes with the real marks. This is existing
  behaviour, not something this feature introduces — but since the motivating
  use case is "5 code questions, answer any 3", an implementer will meet it
  immediately and should not mistake it for a best-N bug.

### `Result.score` / `Result.maxScore`

These are today the raw totals over every question. They change to reflect only
the counted N, summed per section — so an "any 3 of 5" candidate reads **27/30**,
not 27/50.

This is a real behavioural change to two persisted fields, limited to exams
using the feature. It is necessary because `CandidateReportPanel` prints
`score/maxScore` directly: leaving them as raw totals would put a headline
number on screen that contradicts the percentage beside it.

## Shared scoring helper

The best-N rule must produce identical output in two independently-written
places: exam-runtime's settlement, and the API's `computeSectionScores()` which
drives the recruiter's report. If they disagree, a recruiter sees a section
score that contradicts the per-question marks listed directly underneath it.

Section weightage already carries this duplication and got away with it because
the arithmetic was trivial. Best-N is not trivial — sorting, tie-breaking, and
a top-N denominator are exactly the kind of logic that drifts.

So: extract `selectCountedAnswers()` into `packages/shared` (which already
hosts cross-app concerns: storage, crypto, AI providers, SEB), and have both
consume it. One home for the rule, one set of tests, no drift.

## Candidate experience

`AttemptSection` gains `requiredCount: number | null` — added explicitly to
both `attempt.service.ts`'s interface and `apps/web/lib/types.ts`, since
`loadSections` drops fields it is not told to keep.

- **Section badge** states the rule: *"Section 2: Coding — answer any 3 of 5"*.
- **Question navigator** per-group count becomes `2/3 required` where a
  requirement exists, and stays `2/5 answered` where it does not. Cells beyond
  the requirement remain fully selectable — extra answers are free.
- **Header progress chip** denominator becomes Σ`requiredCount` (falling back
  to question count for sections without one), so "5/8 answered" reflects what
  the candidate actually needs to do.
- **Submit modal** warns and names any section below its requirement, and still
  permits submit. It must: the timer auto-submits, so a hard block is
  unenforceable and would only punish candidates who ran out of time.
- **No cap on extra answers.** Best-N makes them free; blocking would only harm.

## Recruiter experience

A "Required answers" number input beside the existing weight input in
`ExamSectionsPanel`, with an "of 5" hint, plus an inline warning when the
section's questions carry unequal marks — so the recruiter learns before
publish rejects them, not after.

Saved through the existing `PATCH /exams/:id/sections/:sectionId`, inheriting
`assertExamMutable()`'s lock-after-publish/lock-after-start guarantee.

## Reporting

`SectionScore` gains `requiredCount: number | null`, and each question in the
candidate-detail payload gains `counted: boolean`.

`CandidateReportPanel` renders *"best 3 of 5 counted"* in the section header
and badges dropped answers "Not counted" with muted styling.

No new persistence: best-N is recomputable from the stored `marksAwarded`,
which is itself frozen at settlement, so recomputation is stable over time.

## Backward compatibility

Same shape that worked for section weightage:

- `requiredCount` null ⇒ all required ⇒ existing exams bit-for-bit unaffected.
- Legacy attempt snapshots without the key read as all-required.
- The `score`/`maxScore` change touches only sections that use the feature.
- No backfill, no data migration beyond adding a nullable column.

## Testing

- **Shared helper**: best-N with more/exactly/fewer than N attempted; ties
  broken by question order; the all-required (null) path; a section whose marks
  are unequal (the post-publish bank-drift case) to pin the top-N denominator.
- **Publish validation**: range bounds, equal-marks for fixed, equal-marks
  across a pool's eligible bank, and the `requiredCount === M` normalisation.
- **Settlement**: both `finalize()` and `finalizeManualGrade()` apply the rule;
  a mixed MCQ+code section picks its best-N only after manual marks land.
- **Snapshot freezing**: an explicit `toHaveProperty('requiredCount')`
  assertion. `JSON.stringify` drops undefined keys, which is exactly how the
  weightage snapshot's `toEqual` assertions passed *before* the field was
  implemented — a silent gap that would have un-weighted every new exam.
- **DTO validation**: a spec asserting a partial PATCH carrying only
  `requiredCount` validates. This is the gap that shipped the weight editor
  broken — `UpdateExamSectionDto` inherits a required `title`, the component
  test mocked the response, and production returned 400 for every edit.
- **Candidate UI**: badge copy, navigator per-section counts, header chip
  denominator, submit-modal warning.
- **Reports**: counted/dropped flags and section header copy.

## Out of scope

- Candidate explicitly choosing which answers count (best-N removes the need).
- Requiring a spread across groups ("one from each topic") — a different
  feature with its own model.
- Per-question optionality independent of a count ("Q4 is bonus").
- Changing pool sections' random-draw behaviour.
