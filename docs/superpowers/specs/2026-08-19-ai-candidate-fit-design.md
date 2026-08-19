# AI Candidate Fit Scoring & Summaries — Design

**Status:** Approved (brainstorming) — ready for implementation planning
**Date:** 2026-08-19
**Feature:** #4 (last) of the 4-feature ATS-depth set. Features #1 candidate communication, #2 offer-letter generation, #3 interview scheduling are live in production.

## Goal

Help recruiters triage a job's applicant pool with AI. For each candidate in a job's pipeline, produce a concise **fit summary** (narrative + strengths + concerns) and a **0–100 fit score** measuring how well the candidate's résumé profile matches that job. The pipeline board can **sort by fit score**, giving a de-facto ranking. Scoring is **on-demand** (recruiter-triggered), and the fit criteria are **layered** (job description alone, plus optional free-text criteria, plus an optional weighted rubric).

The AI output is **advisory only** — a hiring aid, never an automated decision. It never rejects a candidate or changes a stage.

## Scope decisions (from brainstorming)

1. **Deliverable:** per-candidate summary + 0–100 fit score. Ranking = board sorts by that score.
2. **Ranking type:** sort-by-independent-score now; a true comparative whole-pool AI pass is **deferred** (clean seam left, built only if recruiters ask).
3. **Fit criteria (layered, all optional-degrading):** job title + description always; optional recruiter free-text criteria to sharpen; optional weighted rubric that additionally yields per-dimension sub-scores. A job with nothing extra still scores off its description.
4. **Exam results:** kept **separate**. The fit score reflects résumé/profile-vs-job fit only. Exam pass/fail and % stay their own deterministic number shown beside it (already on the board). The AI does not see or fold in the exam score.
5. **Trigger:** on-demand — a bulk "Score candidates" action per job, and an "Assess fit" / "Re-score" button per candidate in the drawer. Results cached until re-run.

## Non-goals

- No comparative whole-pool AI ranking pass (deferred — sorting by independent score is the ranking).
- No automated actions from a score (no auto-reject, no auto-stage-change, no auto-email).
- No blending of exam scores into the fit score.
- No re-parsing of the résumé PDF for scoring — the parsed `CandidateProfile` fields are the input (raw résumé text is not stored anywhere).
- No auto-scoring on entry — every scoring run is an explicit recruiter action.

## Architecture

Reuses the existing async-AI plumbing end to end:

- **`AiJob` + BullMQ worker** (`apps/api/src/jobs/`): a new processor `candidate-fit.processor.ts` registered under `AI_JOB_PROCESSORS` with `type = 'candidate_fit'`. One `AiJob` **per pipeline entry** (bulk scoring enqueues N jobs) so progress is incremental and a single candidate's failure is isolated.
- **`AiApiKeyResolverService.resolve(orgId)`** (`packages/shared/src/crypto/`): returns the org's configured `AiProvider`; the processor calls `generateStructured(...)` with a fit-scoring tool schema. `AiNotConfiguredError` is handled distinctly from a genuine provider failure.
- **`generateStructured`** (`packages/shared/src/ai/ai-provider.ts`): structured tool-call abstraction — the fit result comes back as a validated object, no free-form parsing.
- **`TenantPrismaService.forTenant`** for all DB work; **the AI network call happens outside any `forTenant` tx** (three-phase discipline — short read tx → AI call → short write tx).
- **`AuditService.record`** for every scoring run; **`AiCreditUsage`** row per call (`source: 'candidate_fit'`), mirroring the résumé-parse processor.
- **`PermissionsGuard` + `@RequirePermissions`**: `pipeline:manage` for triggering scoring; `results:view` for reading assessments.

### New Prisma model

```prisma
model CandidateFitAssessment {
  id              String    @id @default(uuid()) @db.UniqueIdentifier
  organizationId  String    @map("organization_id") @db.UniqueIdentifier
  entryId         String    @unique @map("entry_id") @db.UniqueIdentifier
  jobId           String    @map("job_id") @db.UniqueIdentifier
  candidateId     String    @map("candidate_id") @db.UniqueIdentifier
  status          String    @default("pending")   // pending | processing | done | failed | skipped_no_resume | skipped_no_ai_key
  overallScore    Int?      @map("overall_score")
  summary         String?   @db.NVarChar(Max)
  strengths       String?   @db.NVarChar(Max)     // JSON string[]
  concerns        String?   @db.NVarChar(Max)     // JSON string[]
  dimensionScores String?   @map("dimension_scores") @db.NVarChar(Max) // JSON [{label,weight,score}] — only when a rubric exists
  criteriaHash    String?   @map("criteria_hash")
  modelUsed       String?   @map("model_used")
  scoredByUserId  String?   @map("scored_by_user_id") @db.UniqueIdentifier
  scoredAt        DateTime? @map("scored_at")
  aiJobId         String?   @map("ai_job_id") @db.UniqueIdentifier
  error           String?   @db.NVarChar(Max)
  createdAt       DateTime  @default(now()) @map("created_at")
  updatedAt       DateTime  @updatedAt @map("updated_at")

  @@index([organizationId, jobId])
  @@map("candidate_fit_assessments")
}
```

**SQL Server / schema conventions (from prior features):**
- No `@relation`/FK to `Organization`/`User`/`Candidate`/`Job` — plain `organizationId`/`jobId`/`candidateId`/`entryId` columns under RLS, avoiding P1012 multiple-cascade-path. (Intra-feature there are no child tables, so no FKs at all.)
- `created_at DEFAULT GETUTCDATE()` (migration SQL uses `GETUTCDATE()`, not `CURRENT_TIMESTAMP`).
- RLS goes in a **separate migration** from `CREATE TABLE` (`ALTER SECURITY POLICY` can't share the CREATE TABLE batch): filter + block-insert + block-update predicates on `candidate_fit_assessments` → 3 predicates.
- `entryId` is a non-nullable `@unique` (every assessment has an entry) → a plain unique constraint is fine (no filtered index needed; it is never NULL). One assessment per entry; re-scoring **updates** the row.

### Criteria on the Job (additive, optional)

```prisma
// added to model Job
fitCriteria String? @map("fit_criteria") @db.NVarChar(Max)   // free-text "what we're looking for"
fitRubric   String? @map("fit_rubric") @db.NVarChar(Max)     // JSON [{label, weight}] — weights are integers summing to 100
```

Both nullable and additive (single migration, `ALTER TABLE ADD` — no same-batch reference, so no EXEC-wrap needed). A job with both NULL scores off `title` + `description` alone.

## Scoring flow

### Trigger endpoints

- **Bulk** — `POST /jobs/:jobId/fit-assessments/score` (`pipeline:manage`). In one short `forTenant` tx:
  - Load all non-rejected `PipelineEntry` rows for the job, each with its candidate's `CandidateProfile.parseStatus`.
  - For each entry **with** a parsed profile (`parseStatus = 'done'`): upsert a `CandidateFitAssessment` at `status:'pending'` and enqueue `AiJob(type:'candidate_fit', input:{entryId})`.
  - For each entry **without** a parsed profile: upsert a row at `status:'skipped_no_resume'` (never enqueued).
  - Skip entries that already have an in-flight (`pending`/`processing`) assessment.
  - Returns `{ queued: number, skipped: number }`.
- **Single** — `POST /pipeline/entries/:entryId/fit-assessment/score` (`pipeline:manage`). Same logic for one entry; also the **re-score** path (overwrites the existing row → `pending`, new enqueue). Rejects with a generic message if the entry has no parsed résumé.

### Read endpoints

- `GET /pipeline/entries/:entryId/fit-assessment` (`results:view`) → the single assessment (or `null`), with a computed `stale` boolean.
- The board read (`GET /jobs/:jobId/pipeline`, existing) is extended so each `BoardRow` carries `fitScore`, `fitStatus`, and `fitStale` for the chip + sort — no separate per-card fetch.

### Processor (`candidate-fit.processor.ts`)

Per entry (`input.entryId`):

1. **Read tx** (`forTenant`): load the entry → candidate → `CandidateProfile` (`parsedSummary`, `parsedSkills`, `parsedTitle`, `parsedYearsExperience`) and the Job (`title`, `description`, `fitCriteria`, `fitRubric`). If no parsed profile, write `skipped_no_resume` and stop.
2. **AI call (outside any tx):** `AiApiKeyResolverService.resolve(orgId)` → `generateStructured`:
   - `modelTier: 'standard'`, bounded `maxTokens`.
   - Tool `report_candidate_fit`, schema:
     ```
     {
       overallScore: integer 0–100,   // profile-vs-job fit, exam NOT considered
       summary: string,                // 2–4 sentences
       strengths: string[],            // concise bullets
       concerns: string[],             // concise bullets / gaps
       dimensionScores?: [{ label: string, score: integer 0–100 }]  // requested ONLY when the job has a rubric
     }
     ```
   - Prompt composes: job title + description; `fitCriteria` if present; the rubric labels + weights if present (asking for a per-dimension score for each); and the candidate's parsed profile (summary, skills, title, years). Prompt instructs: score résumé/experience fit against the role only; do not consider or invent test/exam performance; be specific and evidence-based.
3. **Write tx** (`forTenant`): set `status:'done'`, `overallScore`, `summary`, `strengths`/`concerns` (`JSON.stringify`), `dimensionScores` (merge the AI per-dimension scores back with each rubric dimension's weight → `[{label, weight, score}]`), `criteriaHash`, `modelUsed`, `scoredByUserId`, `scoredAt`; write an `AiCreditUsage` row and an `AuditService.record({ action:'candidate_fit.scored', entityType:'candidate_fit_assessment', entityId })`.
4. **Errors:** `AiNotConfiguredError` → `status:'skipped_no_ai_key'` (terminal, not retried). Any other error → `status:'failed'` + `error` message (no stack, no secrets).

The `overallScore` is **clamped to 0–100** and dimension scores validated server-side; a malformed AI response fails the job cleanly rather than persisting garbage.

### Staleness

`criteriaHash = sha256([job.title, job.description, job.fitCriteria ?? '', job.fitRubric ?? ''].join('\n'))` computed at scoring time and stored (title included because the prompt scores against it). On read, recompute from the job's current values; `stale = storedHash !== currentHash`. Surfaced as a ⚠ prompt ("job criteria changed since scoring — re-score"). No auto-rescoring.

### Polling

The drawer and board poll assessment status (same cadence as résumé-parse / AI question generation) until `done` / `failed` / `skipped_*`.

## UI surfaces

### PipelineBoard (`apps/web/components/pipeline/PipelineBoard.tsx`, job page)

- **"Score candidates"** button in the job header → calls the bulk endpoint, then shows live progress ("Scoring 8 candidates…", updating as rows finish). Disabled with an explanatory tooltip when the org has no AI provider configured.
- Each candidate card gains a **fit-score chip** (0–100, color-scaled) beside the existing exam-result number. Un-scored = faint "—"; a stale score shows a small ⚠.
- **"Sort by fit"** toggle orders each stage column by `overallScore` desc (un-scored last).

### CandidateDrawer (`apps/web/components/pipeline/CandidateDrawer.tsx`)

New **"AI Fit"** section near the existing Profile section:
- Big score + label, the summary narrative, **Strengths** and **Concerns** bullet lists, and per-dimension bars when a rubric exists (`{label} — {score}/100`, weight shown).
- **"Assess fit"** / **"Re-score"** button. States: no-résumé ("Add a résumé to assess fit"), no-AI-key ("Configure an AI provider in settings"), scoring (spinner), failed (retry), stale (re-score prompt), done.
- An explicit advisory line: *"AI-generated guidance — a hiring aid, not a decision. Review the candidate yourself."*

### Job settings (the criteria — `apps/web/app/(recruiter)/jobs/...` edit form)

- Optional **"What you're looking for"** free-text field → `Job.fitCriteria`.
- Optional **weighted rubric** editor: add/remove dimensions (label + integer weight), with a running-total banner (like the exam section-weights panel); weights must sum to 100 when any dimension exists. Persists as `Job.fitRubric` JSON. Empty = score off the job description alone.

## Safety, privacy, audit

- **Advisory framing** everywhere the score appears; the score never triggers an automated action (no auto-reject/stage/email).
- **Audit:** every scoring run records a `candidate_fit.scored` audit event. The worker has no request context, so the triggering recruiter is carried through `AiJob.createdBy` (recorded at enqueue) → stored as `scoredByUserId` and used as the audit actor.
- **GDPR erase:** `candidates.service.ts` erase path scrubs the candidate's `CandidateFitAssessment` rows (null out `summary`/`strengths`/`concerns`/`dimensionScores`) alongside the existing profile scrub. Delete-vs-scrub follows the existing candidate-erase convention.
- **Multi-tenancy:** all reads/writes `forTenant`-scoped; RLS predicates on the new table; no cross-org leak. No public/tokenized surface (recruiter-only feature) — so no anti-oracle concerns.
- **Prompt-injection note:** the parsed résumé is attacker-influenced (candidate-supplied). The AI output is consumed as structured fields and rendered as text (React escapes it); it is never executed and never fed back into a privileged action. The scoring prompt treats profile content as data, not instructions.

## Error handling summary

| Condition | Result |
|---|---|
| No parsed résumé for the entry | row `skipped_no_resume`; UI prompts to add a résumé; not enqueued |
| Org has no AI provider configured | row `skipped_no_ai_key`; UI prompts to configure AI settings |
| AI provider call fails (timeout/5xx/refusal) | row `failed` + sanitized `error`; UI offers retry |
| Malformed AI response (score out of range, missing fields) | job fails cleanly; row `failed`; nothing garbage persisted |
| Job criteria changed after scoring | row still `done` but flagged `stale`; UI prompts re-score |
| Concurrent double-trigger on one entry | in-flight (`pending`/`processing`) entries are skipped by the trigger; re-score overwrites only a settled row |

## Testing

- **Pure:** criteria-hash computation (stable, order-independent for the three inputs); rubric validation (weights sum to 100, integer, non-empty labels); AI-response validation/clamp (score 0–100, dimension merge with weights, malformed → reject).
- **Processor:** parsed-profile present → `generateStructured` called with a prompt containing job + criteria + rubric + profile and **not** the exam score; `done` row written with audit + credit-usage; AI call happens **outside** `forTenant` (assert invocation order); `AiNotConfiguredError` → `skipped_no_ai_key`; provider error → `failed`; no profile → `skipped_no_resume` (no AI call).
- **Service:** bulk trigger enqueues one job per eligible entry, skips no-résumé and in-flight entries, returns correct `{queued, skipped}`; single trigger + re-score overwrite; reads are org-scoped (RLS); `stale` computed correctly.
- **Controller:** trigger routes require `pipeline:manage`, read routes `results:view` (401/403 without).
- **Web:** board chip renders score/—/stale and "Sort by fit" orders correctly; drawer AI-Fit section renders each state (no-résumé, no-key, scoring, failed, stale, done with dimensions); rubric editor enforces the sum-to-100 banner.
- **GDPR:** erase scrubs assessment PII fields.

## Reuse map

| Need | Reuse |
|---|---|
| Async AI execution | `AiJob` + BullMQ worker + new `candidate-fit.processor.ts` (type `candidate_fit`) |
| Per-org AI provider | `AiApiKeyResolverService.resolve(orgId).generateStructured(...)`, `AiNotConfiguredError` |
| Candidate inputs | `CandidateProfile.parsed{Summary,Skills,Title,YearsExperience}` |
| Pool + job | `PipelineEntry`, `Job`, `pipeline.service.getPipeline` / `BoardRow` |
| Credit tracking | `AiCreditUsage` (`source:'candidate_fit'`) |
| Tenant isolation | `TenantPrismaService.forTenant`, RLS policy |
| Audit | `AuditService.record` |
| Permissions | `pipeline:manage` (trigger), `results:view` (read) |
| UI hooks | `PipelineBoard.tsx`, `CandidateDrawer.tsx`, `usePipeline.ts`, job edit form |
| Running-total rubric UI | pattern from the exam section-weights panel |

## Deferred (future)

- Comparative whole-pool AI ranking pass (head-to-head rationale) — the processor/model seam is left clean; add a second processor type if recruiters ask.
