# Blueprint Guided Stage Transitions — Design Spec

**Date:** 2026-09-06
**Status:** Approved design, ready for implementation planning.
**Source:** Zoho adopt inventory #19 (Blueprint — guided stage transitions). See `docs/ats/zoho-adopt-inventory.md`.

## Goal

Let org admins attach **entry requirements** to a pipeline stage, so a candidate cannot be moved **into** that stage until the requirements are satisfied. v1 requirement types: sufficient **feedback/rating**, a **passed exam**, and a manual **checklist**. Enforcement is a hard block at the single move endpoint; the board's existing error toast surfaces what's missing.

## Why

Today `patchEntry` moves a candidate to any status with only a "status belongs to this pipeline" check — nothing verifies the work that should precede a stage (e.g. reaching **Offer** with no interview feedback, or **Hired** with a failed exam). A lightweight, org-configured rule engine at the one move choke point turns the pipeline into a guided workflow without new UI plumbing.

## Decisions (locked during brainstorming)

1. **Per-stage entry requirements** — rules mean "to move a candidate INTO this stage, these must hold." Per-transition (from→to matrices) is OUT of v1.
2. **Hard block** — the move endpoint throws `BadRequestException` listing unmet requirements; the board is non-optimistic and shows the message in a toast, then refetches (no new error UI).
3. **v1 requirement types (only data present on `origin/main`):** `feedback` (min count / min average rating / note required), `exam_passed` (a linked exam passed, optional min score), `checklist` (manual "mark done" items). No "required custom field" (custom fields are on a separate parked branch).
4. **Storage = two additive JSON columns on existing tenant tables — no new table, no RLS migration:** rule definitions in `PipelineStage.rulesJson`; per-candidate checklist ticks in `PipelineEntry.blueprintChecklistJson`. Both tables are already under the tenant security policy.
5. **Enforced only when the entry's STAGE changes into a ruled, non-terminal stage.** Same-stage status changes are not "entering." **Reject / withdraw / archive moves are exempt** (never blocked by advance requirements). Moving into `hired` IS gated (the headline use case).
6. **Config gated `pipelines:configure`** (org admin) — no new permission, no seed step. Reuses the existing pipeline-config surface.

## Existing code this builds on

- **Models** `apps/api/prisma/schema.prisma`: `PipelineStage` (~L886: `id`, `organizationId`, `pipelineId`, `name`, `category NVarChar(20)`, `position`; NO json column — add `rulesJson`). `PipelineStatus` (~L900). `PipelineEntry` (~L913: position is **`statusId` only** — stage derived via `status.stage`; relations `feedback PipelineFeedback[]`, `interviews`, `offers`, `candidateEmails`, `fitAssessment`; has `rejected`, `assignedUserId`, `assignedGroupId`, `archivedAt`; add `blueprintChecklistJson`). Category strings validated against `STAGE_CATEGORIES = ['active','offer','hired','rejected','archived']` in `packages/shared/src/pipeline/pipeline-categories.ts` (`isTerminalCategory` = hired/rejected/archived).
- **The move choke point:** `PipelineService.patchEntry(context, actorUserId, entryId, dto)` (`apps/api/src/pipeline/pipeline.service.ts:647-782`), route `PATCH /entries/:id` gated `pipeline:manage` (`pipeline.controller.ts:94`), DTO `dto/patch-entry.dto.ts` (`statusId?`, `rejected?`, `reason?`). Branch A (`dto.statusId` set) resolves the target status→stage + category via `pipelines.resolveStatus`, captures `previousCategory`, then at ~L713 does `tx.pipelineEntry.update` + `audit.record`, then `recomputeGlobalStage`, then a post-commit stage-comms hook. **Enforcement injects between entry-load (~L657) and the update (~L713), inside the tx, in Branch A only.**
- **Gate-able data (reuse existing helpers):**
  - Feedback: `PipelineFeedback` (`entryId`, `note String?`, `rating Int?`, many per entry). `averageRating()` + count already computed in `apps/api/src/pipeline/derive-entry-exam-results.ts` / board build.
  - Exam pass: `deriveEntryExamResults(invitations, linkedExamIds)` (`derive-entry-exam-results.ts:16`) → `[{ examId, passFail, score }]` for the job's linked exams (`JobExam`), from the candidate's `Invitation → Attempt → Result` (`Result.passFail`, `percentage`).
  - (Interviews/offers/fit exist too — reserved for a fast-follow, same engine.)
- **Config CRUD:** `PipelinesConfigController` (`@Controller('pipelines')`, all routes `pipelines:configure`); `PipelinesService.updateStage` (`pipelines.service.ts:~124`) is where `rulesJson` is written. Web `apps/web/app/v2/(org-admin)/settings/pipelines/page.tsx` edits stages inline (category Combobox, position swap) via hooks in `apps/web/lib/hooks/usePipelines.ts`.
- **Board move UI:** `apps/web/app/v2/(recruiter)/jobs/PipelineBoard.tsx` — `handleStatusChange`/`handleReject` call `usePatchEntry(jobId)` (`apps/web/lib/hooks/usePipeline.ts:111`); non-optimistic; `onError → toast(error.message,'error')`. `CandidateDrawer.tsx` uses the same toast pattern and is where the checklist tick UI goes.
- **Migration style:** hand-authored additive mssql SQL; latest `20260906100001_user_groups_rls`. Additive column example: `ALTER TABLE [dbo].[users] ADD [avatar_path] NVARCHAR(1000) NULL;`. JSON stored as `NVARCHAR(Max)` strings (precedent: `Job.fitRubric`, `ApprovalChainStep.approverUserIds`). **No new tenant table here → no `_rls` migration needed.**
- **Web constraint:** apps/web cannot import `@exam-platform/shared` VALUES at runtime — inline types.

## Architecture

### 1. Data model — two additive JSON columns

```prisma
// on model PipelineStage
rulesJson String? @map("rules_json") @db.NVarChar(Max)   // JSON: BlueprintRule[]
// on model PipelineEntry
blueprintChecklistJson String? @map("blueprint_checklist_json") @db.NVarChar(Max)  // JSON: { [itemId]: true }
```
One migration, two `ALTER TABLE ... ADD` statements (`pipeline_stages`, `pipeline_entries`). No new table, no RLS migration (both tables already in `dbo.TenantAccessPolicy`).

### 2. Rule shape (shared type, but engine lives API-side)

```ts
type BlueprintRule =
  | { id: string; type: 'feedback'; minCount?: number; minAvgRating?: number; requireNote?: boolean }
  | { id: string; type: 'exam_passed'; examId?: string; minScore?: number }   // examId omitted = any linked exam passed
  | { id: string; type: 'checklist'; items: { id: string; label: string }[] };
```
`rulesJson` is a JSON-encoded `BlueprintRule[]`. Each rule has a stable `id`. Checklist item `id`s are stable (used as the keys in `blueprintChecklistJson`).

### 3. The evaluation engine (pure, unit-tested) — `apps/api/src/pipeline/blueprint-rules.ts`

```ts
interface BlueprintContext {
  feedback: { rating: number | null; note: string | null }[];
  examResults: { examId: string; passFail: string | null; score: number | null }[]; // from deriveEntryExamResults
  checklistTicks: Record<string, boolean>;   // parsed blueprintChecklistJson
}
// returns [] if all satisfied, else a list of human-readable unmet-requirement strings
function evaluateBlueprint(rules: BlueprintRule[], ctx: BlueprintContext): string[];
```
- `feedback`: `feedback.length >= minCount`; average of non-null `rating` `>= minAvgRating`; if `requireNote`, at least one feedback with a non-empty trimmed `note`.
- `exam_passed`: if `examId` set, that exam's `passFail === 'pass'` (and `score >= minScore` when set); if `examId` omitted, at least one linked exam passes (and meets `minScore`).
- `checklist`: every `items[].id` is `true` in `checklistTicks`; unmet message lists the missing item labels.
Malformed/empty rules → treated as satisfied (fail-open on config errors, never on real unmet requirements). `parseRules(rulesJson)` and `parseChecklist(json)` tolerate null/invalid → `[]`/`{}`.

### 4. Enforcement in `patchEntry` (Branch A only)

After the target status/stage/category are resolved and before `tx.pipelineEntry.update`:
- Skip if not a **stage change** (target `stage.id === currentStatus.stage.id`).
- Skip if the target category is terminal-reject/archived (`rejected`/`archived`), and skip Branch B/C (reject/un-reject) entirely — advance rules never block a rejection.
- Load the target stage's `rulesJson`; if empty, proceed. Else build `BlueprintContext` from `entry.feedback`, `deriveEntryExamResults(candidate invitations, job linked exam ids)`, and `parseChecklist(entry.blueprintChecklistJson)`; run `evaluateBlueprint`.
- If unmet list non-empty → `throw new BadRequestException('Cannot move to "<stage>": ' + unmet.join('; '))`. (The board toast surfaces it; the non-optimistic board needs no revert.)

### 5. Checklist tick API + UI

- **API:** `PATCH /entries/:id/checklist` (gated `pipeline:manage`), DTO `{ itemId: string; done: boolean }`. Service `setChecklistItem(context, actorUserId, entryId, itemId, done)` merges into `blueprintChecklistJson` inside `forTenant` (audit `entry.checklist_changed`). (Ticking is not itself gated — it's the pre-work.)
- **Web:** in `CandidateDrawer`, render the checklist items for stages in this entry's pipeline that have `checklist` rules (from the job's pipeline config), each a tickbox bound to `blueprintChecklistJson`; ticking calls the endpoint + invalidates the board query. A hook `useSetChecklistItem(entryId, jobId)` mirrors `usePatchEntry`.

### 6. Config UI — stage requirements editor

- In `settings/pipelines/page.tsx`, per stage add a "Requirements" affordance opening an editor: add/remove rules; per type, the config inputs (feedback: min count / min avg rating / require-note; exam_passed: pick a linked exam or "any" + optional min score; checklist: a list of item labels). Saved via `updateStage` with the new `rulesJson`. Rule/item `id`s generated client-side (uuid) and preserved on edit.
- Web reads the pipeline's exam options from the existing job/exam config as available; if the linked-exam list isn't readily available in this surface, the exam rule may reference an exam by id chosen from a simple text/known list — implementer picks the least-effort correct source (documented in the plan).
- Types inlined web-side (`BlueprintRule` union in `apps/web/lib/types.ts`).

## Testing

- **Engine (pure):** each rule type satisfied/unsatisfied; feedback count/avg/note; exam pass with/without examId and minScore; checklist all-ticked vs missing; empty/malformed rules → satisfied; unmet messages list the right labels.
- **Enforcement:** moving into a ruled stage with unmet rules → 400 with the message; with met rules → succeeds; same-stage status change → not gated; reject/withdraw/archive → never gated even with unmet rules; a stage with no rules → unaffected.
- **Checklist API:** tick/untick merges JSON; persists per entry; unknown item id tolerated.
- **Config:** `updateStage` persists/returns `rulesJson`; invalid rule shape rejected by the DTO/validator.
- **Web:** stage requirements editor round-trips rules; CandidateDrawer checklist ticks call the endpoint; a blocked move surfaces the toast (mock).

## Out of scope (v1)

- Per-transition (from→to) rules; direction-aware rules beyond "entering a stage."
- Requirement types beyond the three: required custom field (custom-fields is a separate parked branch), required interview/offer/fit (same engine — fast-follow), time-in-stage, SLA timers, automatic actions on transition (field-update/webhook/email as a *blueprint action* — the existing stage-comms hook already covers stage emails).
- Blocking rejections/withdrawals; soft-warning mode (v1 is hard-block only).
- A visual blueprint/state-machine builder (v1 is a per-stage requirements list).
- Deferring the offer-stage rule to the existing offer ApprovalChain (offers already have their own approval gate; blueprint does not reimplement it).

## Deploy notes

- Two additive nullable columns on existing tenant tables — no new table, no RLS, **no seed**. Ships with any api/web build, independent of the deferred migration chain. A stage with no `rulesJson` = today's behavior exactly (no gating).
- Migration `20260906110000_blueprint_stage_rules` sorts after the parked user-groups (`20260906100000/100001`), custom-fields (`090000/090001`), timezone (`20260905140000`), business-hours (`20260905130000`) branches — linear on a later merge; a merge of multiple parked branches must keep all migrations.
