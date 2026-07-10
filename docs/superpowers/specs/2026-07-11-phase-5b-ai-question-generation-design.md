# Phase 5b: AI Question Generation — Design Spec

## 1. Context & Scope

Phase 5a shipped this codebase's first async job infrastructure (BullMQ + Redis, a generic `AiJob` model, a type-dispatch `JobProcessor` registry, and a decoupled-worker tenant-context reconstruction pattern). Phase 5b is the second Phase 5 sub-phase (Epic #5972 "Phase 5 - AI Features") and is the first real consumer of that infrastructure: recruiters can generate a first draft of MCQ questions from a topic, instead of writing every question by hand.

Per the master spec (`docs/superpowers/specs/2026-07-07-online-mcq-exam-platform-design.md`):
- Roadmap: "AI question generation (topic/JD → draft MCQs)" (line 881).
- Feature description: "AI-generated questions: input topic/JD/skill → generate draft MCQs for recruiter review/edit before adding to bank" (line 136).
- API surface: `POST /api/v1/questions/ai-generate` (topic/JD → draft questions, async job), `GET /api/v1/ai-jobs/{id}` (poll generation job status) (lines 612-613).
- Tech stack: "LLM API (e.g., Claude) called from a background worker, never inline in the request path" (line 681).
- Edge case: "AI question generation job fails/times out: Job marked `failed` with reason surfaced to the recruiter; no partial/corrupt questions are added to the bank; recruiter can retry" (line 841).

**Out of scope for 5b** (deferred to later Phase 5 sub-phases per the master spec's own roadmap decomposition): AI-based evaluation insight summaries (5c), credit/usage metering (5d). Bulk-import duplicate detection (a separate, unrelated feature already scoped for the question bank) is not part of this phase.

## 2. Architecture

A new job type, `ai-question-generation`, plugs into Phase 5a's existing `JobProcessor` / `AI_JOB_PROCESSORS` registry — the same extension point the `echo` processor already demonstrates, now doing real work.

Flow:
1. Recruiter calls `POST /api/v1/questions/ai-generate` with `{ topic, difficulty, questionTypes[], count }`.
2. The endpoint enqueues a job via the existing `JobsService.enqueue()`, returning `{ aiJobId }` immediately.
3. Recruiter polls `GET /api/v1/ai-jobs/:id` (already built in Phase 5a, unchanged) until `status` is `completed` or `failed`.
4. On the worker side, `AiJobsWorkerService` dispatches to the new `AiQuestionGenerationProcessor`, which calls a thin Anthropic client (`ClaudeQuestionGenerationClient`, mirroring the existing `ClaudeProctoringClient` precedent) to generate question data, validates each question with the **existing** `validateQuestionPayload()` (the same function manual question create/edit already uses), and inserts the valid ones as `Question` rows with `status: 'draft'`.
5. Recruiter reviews drafts via the existing `GET /questions?status=draft`, edits via the existing `PATCH /questions/:id`, and publishes via a new `POST /questions/:id/publish` (mirrors the existing `POST /questions/:id/archive` exactly).

### Interface change carried over from Phase 5a

`JobProcessor.process(input)` currently receives no tenant context — fine for `echo` (no DB writes), not fine for this processor, which must insert `Question` rows under RLS. The interface widens to:

```typescript
export interface JobProcessor {
  readonly type: string;
  process(input: unknown, context: TenantContext): Promise<unknown>;
}
```

`AiJobsWorkerService.handle()` already reconstructs `context` from the job payload — it now passes it into `processor.process()` as a second argument. `EchoProcessor` gets the same signature with the parameter unused; this is the only other implementer, so this is a mechanical, non-breaking change.

### Why not a separate review-queue table

Generated questions land as real `Question` rows (`status: 'draft'`) rather than living only in `AiJob.outputJson` until an explicit per-question "accept" call. This reuses every existing question-bank mechanism (list/filter, edit, tag, archive) with zero new review-queue endpoints. Safety is already guaranteed by an existing, unrelated guardrail: `validateSectionQuestionsReplace()` (in `apps/api/src/exams/exam-section-question-validation.ts`) already rejects attaching any question whose `status !== 'active'` to an exam section for the first time — so a draft can never leak into a live exam by construction, without any new code in this phase.

## 3. Data Model

One schema change, one migration (no new RLS migration — `questions` is already RLS-registered):

```prisma
model Question {
  // ...existing fields unchanged...
  aiGenerated Boolean @default(false) @map("ai_generated")
}
```

This is the `ai_generated (bool)` field the master spec's own schema section already calls for (line 487), letting recruiters/reports later distinguish AI-drafted from hand-written questions.

`status: 'draft'` requires no schema change: `Question.status` is already a free-text string defaulting to `'active'`, and `QuestionsService.list()` already accepts an arbitrary `?status=` filter — so `GET /questions?status=draft` works with zero service changes.

No new table links a `Question` back to the `AiJob` that created it. The job's own `outputJson` records the created question IDs for that batch (see §5), which is sufficient for the recruiter to jump straight to what a given job produced; a persistent FK isn't needed for anything in this phase's scope.

## 4. LLM Integration

**`ClaudeQuestionGenerationClient`** (new file, `apps/api/src/jobs/processors/claude-question-generation.client.ts`, same shape as the existing `apps/exam-runtime/src/proctoring-analysis/claude-proctoring.client.ts`):

- Constructor: `new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })` — same env var already in use, no new secret to provision.
- Model: `claude-sonnet-5` (not the `claude-haiku-4-5` used by proctoring's risk classification) — generating plausible distractors and factually correct MCQs is a harder creative/reasoning task than proctoring's classification, and generation already runs async in the background so the extra latency/cost is acceptable.
- One method: `generate(topic: string, difficulty: string, questionTypes: string[], count: number): Promise<GeneratedQuestion[]>`, using a forced tool call (`tool_choice: { type: 'tool', name: 'report_generated_questions' }`) whose `input_schema` mirrors the shape `validateQuestionPayload()` already expects: `{ questions: [{ type, text, options: [{ text, isCorrect }] }] }`.
- The prompt states the topic, difficulty, and the requested `questionTypes` set, and explicitly tells the model this project's own type rules (`single_mcq` → exactly 1 correct option; `multi_mcq` → at least 1 correct option; `true_false` → exactly 2 options, exactly 1 correct) so most output should already pass validation cleanly. The model chooses how to distribute the `count` questions across the requested types (e.g. `count: 6, questionTypes: ['single_mcq','true_false']` may come back as any mix summing to 6) — the API does not require an even split or a per-type count.
- Malformed tool response (missing tool call, wrong shape) throws — this fails the whole job via the worker's existing catch-and-mark-failed path, matching the master spec's "no corrupt questions on failure" edge case.

**`AiQuestionGenerationProcessor implements JobProcessor`** (`type = 'ai-question-generation'`, new file, `apps/api/src/jobs/processors/ai-question-generation.processor.ts`):

1. Parses `input` as `{ topic, difficulty, questionTypes, count, requestedBy }` (see §5 for why `requestedBy` lives here instead of in the job payload).
2. Calls `ClaudeQuestionGenerationClient.generate(...)`.
3. For each returned question, runs `validateQuestionPayload()` with `marks: 1, negativeMarks: 0` as defaults (generation input doesn't collect per-question marks — recruiter can edit any draft's marks before publishing, same as any other question field).
4. Valid questions are inserted via `tenantPrisma.forTenant(context, ...)` as `Question` rows: `status: 'draft'`, `aiGenerated: true`, `createdBy: requestedBy`, `topic`, `difficulty` (as given), plus `options`.
5. Invalid questions are dropped (not inserted), with a reason recorded.
6. Returns `{ requested: count, created: number, dropped: [{ reason: string }], questionIds: string[] }` as the processor's output — this becomes the `AiJob.outputJson` the recruiter polls for.

If ALL returned questions fail validation (zero created), the job still completes (not fails) with `created: 0` — the LLM did respond, just poorly; this is distinct from an outright LLM/API failure, which fails the job per §4's malformed-response case above. The recruiter sees `created: 0` in the output and can retry with adjusted input.

## 5. API Surface & Validation

```
POST /api/v1/questions/ai-generate
  Guard: JwtAuthGuard, PermissionsGuard — question_bank:manage (reused, no new permission)
  Body: { topic: string, difficulty: 'easy'|'medium'|'hard', questionTypes: string[], count: number }
  Validates: questionTypes is a non-empty subset of ['single_mcq','multi_mcq','true_false'];
             count is an integer in [1, 20] (hard cap — bounds LLM cost/latency and keeps
             the review batch a manageable size for the recruiter)
  → constructs inputJson = JSON.stringify({ topic, difficulty, questionTypes, count, requestedBy: userId })
    (requestedBy travels inside the job's own input, not the BullMQ payload, since the payload
    only carries { aiJobId, organizationId, type } and widening it further would couple the
    generic worker to this one job type's needs)
  → JobsService.enqueue(tenant, 'ai-question-generation', inputJson, userId)
  → 201, body: { aiJobId: string }

POST /api/v1/questions/:id/publish
  Guard: JwtAuthGuard, PermissionsGuard — question_bank:manage
  → sets status: 'active' (mirrors the existing /:id/archive action-endpoint exactly:
    org-scoped findFirst, 404 if absent, single-field update, same response shape)
```

Both endpoints are added to the existing `QuestionsController` / `QuestionsService` — no new controller/module.

**Error handling**, matching the master spec's edge case precisely:
- LLM call fails outright (timeout, malformed/missing tool response, rate limit) → job `failed`, `error` set to a human-readable reason, zero questions inserted.
- LLM call succeeds but some/all individual questions fail our own validation → job `completed`, valid ones inserted, invalid ones dropped and reported in `outputJson` (per your explicit choice: partial success is still success — the recruiter gets whatever usable output the LLM produced rather than losing an entire batch over one malformed question).

## 6. Testing Approach

**Unit:**
- `ClaudeQuestionGenerationClient`: mocked Anthropic responses — valid tool call, malformed tool call (wrong shape), missing tool call (throws in all failure cases).
- `AiQuestionGenerationProcessor`: mix of valid/invalid generated questions → correct created/dropped counts, `aiGenerated: true`, `status: 'draft'`, correct `createdBy` from the input payload's `requestedBy`.
- `QuestionsService.publish()`: happy path, 404 for a non-existent/cross-org question.
- `EchoProcessor`'s updated signature (still returns `{ echoed: input }`, now ignoring the added `context` param) — confirm the Phase 5a echo test still passes unchanged.

**E2E:** one new spec (`apps/api/test/ai-question-generation.e2e-spec.ts`), mirroring `ai-jobs.e2e-spec.ts`'s shape, with the Anthropic client mocked at the module level (same precedent as `ai-proctoring.e2e-spec.ts`, which does not hit the real API in CI):
1. Enqueue a generation job via the real HTTP endpoint, poll to `completed`.
2. Assert the created questions are visible via `GET /questions?status=draft` and invisible via the default `GET /questions` (`status=active`).
3. Assert `validateSectionQuestionsReplace()` rejects attaching one of the drafts to an exam section (proves the existing guardrail covers AI-generated drafts with no new code).
4. Publish one via `POST /questions/:id/publish`, confirm it now appears in `GET /questions` and can be attached to a section.
5. Cross-org and permission-403 cases, matching the Phase 5a e2e precedent.

**Not covered by automated tests** (flagged as an open item, not a gap to fix): actual generation quality (are the questions good, are distractors plausible, is the difficulty accurate) is a manual/staging concern — no automated suite verifies LLM output quality, same precedent as AI proctoring's risk assessment.

## 7. Open Items

- No live-Anthropic-API test in CI — consistent with the existing proctoring precedent, not a gap introduced by this phase.
- No persistent link from a `Question` row back to the `AiJob` that created it (batch identification relies on the job's own `outputJson.questionIds` at poll time) — acceptable for this phase's scope; could be added later if a "show me everything job X created, at any point in the future" feature becomes a real requirement.
- Credit/usage metering for generation cost (how many jobs/questions an org can generate) is explicitly Phase 5d's responsibility, not this phase's.
