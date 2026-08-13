# AI-Assisted Question Generation — Design

**Status:** design agreed 2026-08-12, not yet planned or implemented.

**Scope note:** this document covers all five stages so the shape is agreed up front, but **each stage gets its own implementation plan**. Stage 1 is the first plan; do not attempt the whole document in one pass.

## The finding that shapes this whole design

The generation backend **already exists and works end to end. Nothing in the UI calls it.**

Verified in the current tree:

| Piece | Location | State |
|---|---|---|
| `POST /questions/ai-generate` | `apps/api/src/questions/questions.controller.ts:29` | exists |
| Request DTO | `apps/api/src/questions/dto/ai-generate-questions.dto.ts` | topic, difficulty, questionTypes, count (1–20) |
| Enqueue | `questions.service.ts:284` → `jobsService.enqueue(..., 'ai-question-generation', ...)` | returns `{ aiJobId }` |
| Worker + processor | `apps/api/src/jobs/processors/ai-question-generation.processor.ts` | writes questions `status:'draft'`, `aiGenerated:true` |
| Provider call | `apps/api/src/jobs/processors/question-generation.client.ts` → `AiProvider.generateStructured()` | per-org provider config |
| Cost tracking | `aiCreditUsage.create` in the processor, source `question_generation` | already surfaced in the org usage breakdown (`organizations.service.ts:430`) |
| Job polling | `GET /jobs/:id` | exists |
| Draft → active | `POST /questions/:id/publish` | exists |
| `Question.aiGenerated` | `schema.prisma:245` | column exists |

A grep of `apps/web` for `ai-generate` returns nothing. The only trace of the feature in the UI is a purple "AI" badge in `QuestionPreviewCard.tsx:19`.

**Two consequences, both important:**

1. This is not a "build a generation pipeline" project. It is a "finish and expose one that is ~80% built, and give it a review step" project. Most of Stage 1 is frontend.
2. **Generation quality is completely unmeasured.** Nobody has run this endpoint. The prompt has never been evaluated against real output. Everything downstream assumes it produces usable questions.

## Goals

- Let a recruiter generate questions into the Question Bank from four kinds of input: a topic, a job description, their own material, or an existing question.
- Cover both MCQ-style questions (`single_mcq`, `multi_mcq`, `true_false`) and code questions.
- Never let an unreviewed generated question reach a candidate.
- Reuse the existing job, provider, validation and cost-tracking machinery rather than building a parallel path.

## Non-goals

- Auto-publishing generated questions.
- Auto-graded code questions with hidden test cases. This platform grades code answers manually with AI-assisted review; there is no test-case harness, and generating one is out of scope.
- Embedding-based duplicate detection across the bank (see *Known gaps*).
- A spend cap or budget system (see *Known gaps*).

## Safety property, already satisfied

`validateSectionQuestionsReplace` (`apps/api/src/exams/exam-section-question-validation.ts:26`) refuses any newly-added question whose status is not `active`:

```ts
if (isNewlyAdded && statusById.get(id) !== 'active') {
  throw new BadRequestException(`Question ${id} is not active and cannot be added to a section for the first time`);
}
```

So a `draft` question **cannot be added to an exam section**. An unreviewed AI question cannot reach a candidate without a human first publishing it. No new enforcement is needed — but this guard is load-bearing for the whole design and must not be weakened.

## Staging

Delivery is staged so each stage is independently useful, and so the riskiest unknown (does the model produce questions a recruiter will actually publish?) is answered first and cheapest.

### Stage 0 — Quality probe

Not a code deliverable. Trigger the existing endpoint against a real organization, read the generated questions, and judge them. If the output is poor, fix the prompt before building a UI on top of it.

Output: a written judgement on generation quality and any prompt changes needed.

### Stage 1 — Make it reachable (topic + difficulty, MCQ)

Almost entirely frontend, because the backend path already runs.

- A "Generate with AI" action in the Question Bank, opening a modal for topic, difficulty, question types and count.
- Job submission and polling against the existing endpoints.
- A **Drafts** tab in the Question Bank. The list endpoint already accepts `@Query('status')` (`questions.controller.ts:69`) and the service honours it (`questions.service.ts:167`), so this needs **no backend change**.
- Per-draft actions: edit (existing form), publish (existing endpoint), discard. Bulk publish and bulk discard.
- A count badge on the Drafts tab so pending drafts are visible from anywhere in the bank.

Backend changes needed in Stage 1 — all small, but none optional:

**1. Display dropped reasons.** *(Frontend only — corrected 2026-08-12.)* The processor already carries per-question rejection reasons in its output (`dropped: { reason: string }[]`), so no backend change is needed. Nothing displays them. The UI must show them, so a consistently-failing prompt is diagnosable rather than looking like the model being stingy.

**2. Stop hardcoding marks.** `ai-question-generation.processor.ts:74-75` writes every generated question with `marks: 1, negativeMarks: 0` regardless of what the exam needs, and assigns **no tags**. A bank of 1-mark untagged questions is tedious to clean up by hand — which is the work this feature exists to remove. Add marks, negative marks and tags to the generate request, applied to every question in the batch. The recruiter can still adjust individually afterwards.

**3. Record provenance.** The processor stores no link from a generated question back to the job that produced it. `topic` survives, but the input kind and prompt do not, so the draft row cannot show where a question came from — and after Stage 3 there will be four possible origins. Add a nullable `Question.aiJobId` referencing `AiJob`, set at creation. The `AiJob.inputJson` then carries the full request, so the draft view can show provenance without duplicating it onto every question row.

**4. Populate `aiCreditUsage.sourceId`.** It is currently written as `null` (`processor.ts:88`), so a credit charge cannot be traced back to the job that incurred it. Set it to the job id — the column already exists.

### Stage 2 — Code questions

Extend generation to `code` questions. The model produces question text, starter code, and a language; we validate the language against the organization's actual Piston runtimes via the existing `listAvailableLanguages()`.

The model also returns a **reference solution**, displayed to the reviewer and **not stored on the question**. Rationale: a wrong MCQ is visible (the marked-correct option is wrong), but a subtly wrong or unanswerable code prompt requires the reviewer to actually solve it. A worked solution next to the question turns that into a seconds-long check.

Review card for code drafts reuses the existing Monaco setup, read-only, on the pinned 0.52.2 build.

### Stage 3 — Job description and seed-question inputs

Same pipeline, new prompts and input fields.

For a job description, generation is two steps: extract the skills, show them to the recruiter for confirmation, then generate against the confirmed list. Confirming before generating avoids spending credits on a misreading of the JD.

For a seed question, the instruction must be *vary the surface, keep the concept* — different scenario and numbers, same thing tested. Without that, models paraphrase, which is useless against candidates sharing questions between sittings.

### Stage 4 — Your own material

The only stage needing new infrastructure: file upload, text extraction, chunking, and a token budget. Generate per chunk so a long document is not silently truncated to its first page.

## Endpoint shape

Stage 1 keeps the existing flat DTO (`topic`, `difficulty`, `questionTypes`, `count`). It is reshaped into a discriminated union over input kinds when Stage 3 introduces the second input.

This is a deliberate YAGNI call, and it is safe **because no client consumes `ai-generate` today** — the endpoint can be reshaped freely without breaking anyone. Designing the union now would be paying for flexibility available for free later.

## Data flow

```
Recruiter fills the generate modal
  → POST /questions/ai-generate                     exists
  → AiJob row, status pending                       exists
  → worker picks it up                              exists
  → question-generation.client                      exists
  → organization's configured AI provider           exists
  → each result validated                           exists
  → questions written with status='draft'           exists
  → ai_credit_usage row (source question_generation) exists
  ────────────────────────────────────────────────────────
  → UI polls GET /jobs/:id                          NEW
  → Drafts tab lists status=draft                   NEW (frontend only)
  → recruiter edits / publishes / discards          NEW UI over existing endpoints
```

## The review surface

The Drafts view is a **filter tab within the Question Bank**, not a separate page — same list, same row component, same filters. A draft is a question with a different status; treating it as a separate concept would duplicate the edit form, tag picker and preview card for no gain.

A draft row shows three things the active list does not:

- **Provenance** — which input produced it and the prompt used, read through the new `Question.aiJobId` link to `AiJob.inputJson`.
- **Publish** — one click, existing endpoint.
- **Discard** — delete.

Bulk select supports publish and discard. Reviewing twenty questions one modal at a time defeats the purpose of generating twenty.

**Job feedback.** Generation is asynchronous and may take a while. The modal shows progress and can be closed — drafts land regardless. This is precisely why drafts were chosen over review-before-save: a job that outlives the browser tab still delivers its work.

On completion the UI reports *requested / created / dropped*, with reasons. `"10 requested, 6 created, 4 dropped — 3 had no correct option, 1 had duplicate options"` tells the recruiter the prompt is wrong. A bare `"6 created"` does not.

## Error handling

| Condition | Behaviour |
|---|---|
| Organization has no AI key configured | Reject at the endpoint before enqueueing. Do not create a job that is certain to fail. |
| Provider call fails | Job fails with a message. No questions written, no credits recorded. |
| A generated question fails `validateQuestionPayload` | That question is dropped; the others still land. The reason is carried in the job result. |
| All generated questions fail validation | Job completes with `created: 0` and the reasons, not an error — the distinction matters for diagnosing a bad prompt. |
| Browser tab closed mid-job | Drafts land anyway; the Drafts tab count is the recovery path. |
| Code question names a language the org's Piston does not offer | Dropped with that reason. Never write a question a candidate cannot run. |

## Testing

- **Pure validation** of every generated question through the existing `validateQuestionPayload`, so generated and hand-authored questions are held to one standard.
- **Processor tests** with a stubbed provider covering: all valid, partial drop with reasons, all dropped, provider error, that `aiCreditUsage` is written exactly once per successful job and carries the job id as `sourceId`, and that requested marks and tags are applied to every question in the batch rather than defaulted.
- **A test that a draft cannot be added to an exam section**, pinning the safety property above so a future refactor of the section validator cannot silently open that path.
- **Web tests** for the Drafts tab filter, the count badge, bulk publish and bulk discard, and job-completion reporting including the dropped reasons.
- **Stage 2** adds tests that a language outside the org's runtimes is rejected, and that the reference solution is shown to the reviewer but never persisted on the question.

Tests must be able to fail. Generated-content features are especially prone to tests that assert on a mock rather than on behaviour.

## Known gaps, accepted for now

**No spend cap.** `ai_credit_usage` records consumption and the organization settings page reports it, but nothing enforces a limit. Four input modes plus code generation makes it easier for one organization to run up cost by accident. The only brake today is `count ≤ 20` per request. Worth revisiting if usage grows; not built now.

**Near-duplicates.** Generating the same topic twice produces overlapping questions, and there is no similarity check against the existing bank. Stage 1 mitigates cheaply by passing existing question texts for that topic into the prompt as exclusions. That is a hint, not a guarantee. Embedding-based deduplication is explicitly out of scope.

**Generation quality is unmeasured.** Stage 0 exists precisely to close this before anything is built on top.
