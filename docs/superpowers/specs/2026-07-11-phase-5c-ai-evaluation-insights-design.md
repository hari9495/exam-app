# Phase 5c: AI Evaluation Insight Summaries — Design Spec

## 1. Context & Scope

Phase 5c is the third Phase 5 sub-phase (Epic #5972 "Phase 5 - AI Features"), following Phase 5a (async job infrastructure) and Phase 5b (AI question generation). Unlike 5a/5b, this feature does **not** use the BullMQ/AiJob job-queue pipeline — it follows this codebase's other existing async-AI precedent instead: `AttemptAnalysisService`, the AI proctoring risk-assessment service shipped in Phase 2, which is fire-and-forget, auto-triggered at attempt settlement, and caches its result in a dedicated table read via a plain GET.

Per the master spec (`docs/superpowers/specs/2026-07-07-online-mcq-exam-platform-design.md`):
- Feature description: "**AI-based evaluation insights**: auto-generated candidate summary (e.g., 'strong in SQL, weak in system design, 2 proctoring flags — tab switch') for Recruiter/Panel" (line 183).
- API surface: `GET /api/v1/attempts/{id}/ai-insight` (AI-generated evaluation summary) (line 656) — note this is a bare GET, with no corresponding create/poll pair, unlike Phase 5b's `POST .../ai-generate` + `GET /ai-jobs/:id` shape. This absence is itself evidence the feature is meant to be automatic, not recruiter-triggered.
- Roadmap: "AI-based evaluation insight summaries" (line 881), same Phase 5 bucket as question generation and async job infra.

**Out of scope for 5c**: credit/usage metering (Phase 5d, the last Phase 5 sub-phase). Re-analyzing proctoring risk itself is unchanged — Phase 5c consumes the existing `ProctoringAnalysis` result as plain input, it does not modify how that result is produced.

## 2. Architecture

At attempt settlement (`AttemptSettlementService.finalize()`, `apps/exam-runtime/src/grading/attempt-settlement.service.ts:89`), a new `AttemptInsightService.analyze(attemptId)` runs after proctoring analysis completes — sequenced, not parallel, so the insight always has a real (or cleanly-absent) `ProctoringAnalysis` row to reference rather than racing it:

```typescript
void (async () => {
  try {
    await this.attemptAnalysis.analyze(finalized.id);
  } catch (error) {
    this.logger.error('Proctoring analysis failed to start', error as Error);
  }
  try {
    await this.attemptInsight.analyze(finalized.id);
  } catch (error) {
    this.logger.error('Insight generation failed to start', error as Error);
  }
})();
```

Both calls remain fully asynchronous relative to the candidate's settlement response (the `void (...)()` wrapper is never awaited by `finalize()` itself) — only the two background calls are now internally ordered.

`AttemptInsightService.analyze(attemptId)` is self-contained, mirroring `AttemptAnalysisService.analyze()`'s exact shape: it takes only an `attemptId` and re-fetches everything it needs (no data threaded through from the settlement transaction). It:
1. Fetches `Attempt` + `Result` (score/percentage/passFail), using the same super-admin-bypass-then-org-scoped two-step pattern `AttemptAnalysisService` already uses to learn the attempt's `organizationId`.
2. Fetches every `Answer` + its `Question` (`topic`, `isCorrect`) for the attempt, and groups them into a per-topic `{ topic, correct, total }[]` breakdown — plain arithmetic, no LLM call for this part. Questions with a null/empty `topic` (the field is optional on `Question`) are excluded from the breakdown entirely — they still count toward the attempt's overall score, they just don't contribute to any named topic bucket, since there is nothing meaningful to group them under.
3. Fetches the (by now persisted, or absent-if-failed) `ProctoringAnalysis` row for the attempt.
4. Calls `ClaudeInsightClient.generate(...)` with that bundle; on success upserts an `AttemptInsight` row (`status: 'completed'`), on the client throwing upserts `status: 'failed', summary: null`.

Recruiters read the result via a new `GET /api/v1/attempts/:id/ai-insight` on the existing `AttemptsAdminController` (`apps/api/src/attempts-admin/`), which already owns the analogous proctoring `/attempts/:id/reanalyze` endpoint. A matching `POST /api/v1/attempts/:id/ai-insight/regenerate` lets a recruiter retry a failed or stale insight, mirroring `reanalyze`'s exact cross-app-call shape (`ExamRuntimeInternalClient` → `InternalController` on `apps/exam-runtime` → the service method) rather than inventing a new pattern.

## 3. Data Model

```prisma
model AttemptInsight {
  id          String   @id @default(uuid()) @db.UniqueIdentifier
  attemptId   String   @unique @map("attempt_id") @db.UniqueIdentifier
  status      String
  summary     String?  @db.NVarChar(Max)
  generatedAt DateTime @default(now()) @map("generated_at")
  attempt     Attempt  @relation(fields: [attemptId], references: [id], onDelete: Cascade)

  @@map("attempt_insights")
}
```

**No `organizationId` column, no RLS registration.** This deliberately mirrors the existing `ProctoringAnalysis` model's shape rather than the RLS-first pattern most other tables in this project follow (e.g. every table added in Phases 4a/4b/5a). The precedent is sound for this specific shape of table: `AttemptInsight`, like `ProctoringAnalysis`, is only ever reached through a specific `Attempt` that has already been ownership-checked (`requireOwnedAttempt`, the same helper `reanalyze` uses today) — it is never listed org-wide on its own. Adding RLS here would be redundant defense-in-depth on top of an already-scoped lookup, not closing a real gap. This is a deliberate architectural choice, not an oversight, and is called out here explicitly since it departs from this project's usual default.

`status` is a two-value enum (`'completed' | 'failed'`), simpler than `ProctoringAnalysis`'s three states — there is no "clean/skip" case analogous to zero proctoring events, since every settled attempt has real score and answer data to summarize.

Single schema migration only (no RLS migration, per the above).

## 4. LLM Integration

**`ClaudeInsightClient`** (new, `apps/exam-runtime/src/attempt-insight/claude-insight.client.ts`, same shape as `apps/exam-runtime/src/proctoring-analysis/claude-proctoring.client.ts`):

- Constructor: `new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })`, same env var already in use.
- Model: `claude-sonnet-5` — weaving score/topic/proctoring context into a coherent narrative is closer to Phase 5b's question-generation task than proctoring's simple risk classification.
- One method: `generate(input: InsightInput): Promise<string>`, where:
  ```typescript
  interface InsightInput {
    percentage: number;
    passFail: string;
    topicBreakdown: { topic: string; correct: number; total: number }[];
    proctoring: { riskLevel: string; summary: string } | null;
  }
  ```
- Forced tool call (`tool_choice: { type: 'tool', name: 'report_insight' }`), tool schema: `{ summary: string }` — a single narrative field, matching `ProctoringAnalysis.summary`'s shape.
- The prompt states the overall result, lists each topic's correct/total, and — only if `proctoring` is non-null — includes its risk level and summary as additional context. When `proctoring` is null (analysis itself failed or is still absent for some other reason), the prompt omits that section entirely rather than fabricating a claim about proctoring.
- Malformed/missing tool response throws, exactly like `ClaudeProctoringClient.assessRisk()` — the caller's try/catch turns this into a `status: 'failed'` row, never a partial/fabricated summary.

**`AttemptInsightService`** (new, `apps/exam-runtime/src/attempt-insight/attempt-insight.service.ts`): see §2 for its 4-step flow. Its outer structure matches `AttemptAnalysisService.analyze()`'s own outer try/catch — any unexpected failure anywhere in the method is caught, logged, and swallowed, never propagated, so a bug here can never surface as a candidate-facing error (settlement itself has already completed by this point regardless).

## 5. API Surface

Both routes are added to the existing `AttemptsAdminController` (`@Controller('attempts')`, `apps/api/src/attempts-admin/attempts-admin.controller.ts`):

```
GET /api/v1/attempts/:id/ai-insight
  Guard: JwtAuthGuard, PermissionsGuard — results:view (reused, no new permission)
  → requireOwnedAttempt(context, id) [existing helper, 404 if attempt doesn't exist/isn't owned]
  → findFirst AttemptInsight by attemptId
  → 404 ("AI insight not yet generated for attempt {id}") if the attempt exists but no
    insight row exists yet (settlement hasn't finished the async chain, or it's still in flight)
  → 200, the AttemptInsight row otherwise

POST /api/v1/attempts/:id/ai-insight/regenerate
  Guard: JwtAuthGuard, PermissionsGuard — results:view (reused)
  → requireOwnedAttempt(context, id)
  → ExamRuntimeInternalClient.regenerateInsight(id)   [new method, mirrors reanalyze() exactly:
    POST {EXAM_RUNTIME_INTERNAL_URL}/api/v1/internal/attempts/:id/regenerate-insight,
    same headers/timeout/error-mapping via the existing fetchWithTimeout/throwIfNotOk]
  → new InternalController route on apps/exam-runtime:
    POST internal/attempts/:id/regenerate-insight → calls attemptInsight.analyze(id) directly
    (no re-sequencing with proctoring analysis on manual regenerate — ProctoringAnalysis already
    exists by the time a recruiter would click regenerate, so there's nothing to wait for)
  → returns the fresh AttemptInsight row (findUniqueOrThrow, matching reanalyze()'s response shape)
```

No new permission, no `seed.ts` change — `results:view` already gates the semantically adjacent candidate report detail endpoint (Phase 4e), which already embeds `proctoringAnalysis` in its response; this is the same audience and access level.

## 6. Testing Approach

**Unit:**
- `ClaudeInsightClient`: mocked Anthropic responses — valid tool call, malformed tool call, missing tool call, thrown API error (mirrors `claude-proctoring.client.spec.ts` exactly).
- `AttemptInsightService`: topic-breakdown arithmetic correctness (multiple questions per topic, questions with no topic), upsert on success (`status: 'completed'`) and on the client throwing (`status: 'failed', summary: null`), correct behavior when no `ProctoringAnalysis` row exists (prompt omits that section, doesn't throw).
- `AttemptSettlementService`: the sequencing change — a `attemptAnalysis.analyze()` rejection is caught and logged, and `attemptInsight.analyze()` still runs afterward (not skipped).
- `AttemptsAdminService`'s two new methods (`getInsight`, `regenerateInsight`): org-scoping via `requireOwnedAttempt`, 404 shapes, delegation to `ExamRuntimeInternalClient`.
- `ExamRuntimeInternalClient.regenerateInsight()`: mirrors the existing `reanalyze()` test pattern.

**E2E:** extend the existing dual-app e2e harness (`bootAdminApp`/`bootRuntimeApp`, matching `ai-proctoring.e2e-spec.ts`'s shape exactly): settle an attempt with `ClaudeInsightClient` mocked via `overrideProvider` on the runtime app, then:
1. Poll/read `GET /attempts/:id/ai-insight` until the row exists, assert its shape and that it references real score data.
2. Assert cross-org/permission-403 cases, matching every prior phase's e2e precedent.
3. Exercise `POST /attempts/:id/ai-insight/regenerate` and confirm a fresh `generatedAt`.

**Not covered by automated tests**: actual narrative quality (is the summary accurate, well-written) is a manual/staging concern, same precedent as Phase 5b's question generation and the existing proctoring risk assessment — no automated suite verifies LLM output quality.

## 7. Open Items

- No live-Anthropic-API test in CI — consistent with every prior AI-integration phase in this project.
- The `AttemptInsight`/`ProctoringAnalysis` RLS-bypass pattern (§3) is intentionally inconsistent with most other tables in this project; flagged for awareness, not treated as a gap to close in this phase.
- Credit/usage metering for insight-generation cost is Phase 5d's responsibility, not this phase's.
