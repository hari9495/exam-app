# Blueprint Guided Stage Transitions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Org admins attach entry requirements (feedback/rating, passed exam, manual checklist) to a pipeline stage; a candidate cannot be moved INTO that stage until they're satisfied. Hard-enforced at the single `patchEntry` move endpoint; the board's existing error toast surfaces what's missing.

**Architecture:** Two additive JSON columns on existing tenant tables (`PipelineStage.rulesJson`, `PipelineEntry.blueprintChecklistJson`) — no new table, no RLS, no seed. A pure `evaluateBlueprint` engine. Enforcement injects into `patchEntry`'s stage-change branch. A checklist tick endpoint + drawer UI, and a per-stage requirements editor in the pipelines settings page.

**Tech Stack:** NestJS + Prisma + SQL Server (mssql, RLS), Next.js App Router (v2 UI), TanStack Query, class-validator, jest.

**Spec:** `docs/superpowers/specs/2026-09-06-blueprint-stage-rules-design.md`

## Global Constraints

- **NEVER run `npm install`/`npm ci`/`npm update`** (worktree junction disk-fill hazard). Use only `npx prisma generate`/`npx prisma migrate deploy` and existing `npx jest`/`npx tsc`.
- **Migrations are hand-authored additive raw SQL** (SQL Server). This feature adds only nullable columns to EXISTING tenant tables (`pipeline_stages`, `pipeline_entries`) already covered by `dbo.TenantAccessPolicy` → **NO `_rls` migration, NO new table, NO seed.** Long/JSON text → `NVARCHAR(MAX)`. Migration folder: `20260906110000_blueprint_stage_rules` (sorts after all parked branches' `20260905*`/`20260906*` migrations).
- **apps/web CANNOT import `@exam-platform/shared` VALUES at runtime** — inline types web-side. (Also read `apps/web/AGENTS.md` before web edits if present.)
- **Tenant scoping:** every service write wraps `this.tenantPrisma.forTenant(context, async (tx) => …)`; rows carry `organizationId`. `TenantContext = { organizationId: string | null; isSuperAdmin: boolean }`.
- **Config API returns PARSED `rules: BlueprintRule[]`** on each stage (never the raw `rulesJson` string) — mirrors the repo's parsed-options convention. Board rows return PARSED `blueprintChecklist: Record<string, boolean>`.
- **Enforcement is hard-block, advance-only:** throw `BadRequestException` only when the entry's STAGE changes into a non-terminal ruled stage; reject/withdraw/archive moves and same-stage status changes are never gated.
- Commit after each task (TDD: red → green → commit; end messages with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`).

---

## File Structure

**API (new):** `apps/api/src/pipeline/blueprint-rules.ts` (+ `.spec.ts`); `apps/api/src/pipeline/dto/set-checklist-item.dto.ts`.
**API (modified):** `apps/api/prisma/schema.prisma`; migration; `apps/api/src/pipeline/dto/update-stage.dto.ts`; `apps/api/src/pipeline/pipelines.service.ts` (`updateStage`, list/get rules mapping); `apps/api/src/pipeline/pipeline.service.ts` (`patchEntry` enforcement, `getBoard` stage rules + row checklist, `setChecklistItem`); `apps/api/src/pipeline/pipeline.controller.ts` (checklist route).
**Web (new):** none required (hooks added to existing files).
**Web (modified):** `apps/web/lib/types.ts` (`BlueprintRule`, `PipelineStageConfig.rules`, `BoardEntryRow.blueprintChecklist`); `apps/web/lib/hooks/usePipelines.ts` (`UpdateStageInput.rules`); `apps/web/lib/hooks/usePipeline.ts` (`useSetChecklistItem`); `apps/web/app/v2/(org-admin)/settings/pipelines/page.tsx` (requirements editor); `apps/web/app/v2/(recruiter)/jobs/PipelineBoard.tsx` (pass stages to drawer); `apps/web/app/v2/(recruiter)/jobs/CandidateDrawer.tsx` (checklist card).

---

### Task 1: Schema + migration (two additive columns)

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260906110000_blueprint_stage_rules/migration.sql`

**Interfaces:**
- Produces: `PipelineStage.rulesJson String?`, `PipelineEntry.blueprintChecklistJson String?`.

- [ ] **Step 1: schema.prisma** — add to `model PipelineStage`: `rulesJson String? @map("rules_json") @db.NVarChar(Max)`; add to `model PipelineEntry`: `blueprintChecklistJson String? @map("blueprint_checklist_json") @db.NVarChar(Max)`.
- [ ] **Step 2: migration.sql**
```sql
ALTER TABLE [dbo].[pipeline_stages] ADD [rules_json] NVARCHAR(MAX) NULL;
ALTER TABLE [dbo].[pipeline_entries] ADD [blueprint_checklist_json] NVARCHAR(MAX) NULL;
```
- [ ] **Step 3: apply + generate** — `cd apps/api && npx prisma migrate deploy && npx prisma generate` (no `_rls` migration — both tables already in the security policy; the columns inherit it). If migrate deploy errors, capture verbatim + DONE_WITH_CONCERNS; do NOT npm install.
- [ ] **Step 4: tsc** — `npx tsc --noEmit` clean.
- [ ] **Step 5: commit** `git add apps/api/prisma && git commit -m "feat(blueprint): add PipelineStage.rulesJson + PipelineEntry.blueprintChecklistJson"`

---

### Task 2: Blueprint engine (pure) + parse/validate

**Files:**
- Create: `apps/api/src/pipeline/blueprint-rules.ts`
- Test: `apps/api/src/pipeline/blueprint-rules.spec.ts`

**Interfaces:**
- Produces:
```ts
export type BlueprintRule =
  | { id: string; type: 'feedback'; minCount?: number; minAvgRating?: number; requireNote?: boolean }
  | { id: string; type: 'exam_passed'; examId?: string; minScore?: number }
  | { id: string; type: 'checklist'; items: { id: string; label: string }[] };

export interface BlueprintContext {
  feedback: { rating: number | null; note: string | null }[];
  examResults: { examId: string; passFail: string | null; score: number | null }[];
  checklistTicks: Record<string, boolean>;
}
export function parseRules(rulesJson: string | null | undefined): BlueprintRule[];
export function parseChecklist(json: string | null | undefined): Record<string, boolean>;
export function validateBlueprintRules(rules: unknown): BlueprintRule[]; // throws BadRequestException on invalid shape
export function evaluateBlueprint(rules: BlueprintRule[], ctx: BlueprintContext): string[]; // [] = all satisfied
```

- [ ] **Step 1: Write failing tests** — cover, with real assertions:
  - `parseRules`: valid JSON array → rules; null/`''`/invalid JSON/non-array → `[]`.
  - `parseChecklist`: valid object → map; null/invalid → `{}`.
  - `validateBlueprintRules`: accepts a valid mixed array; rejects unknown `type`, missing `id`, checklist without `items`, non-array → `BadRequestException`.
  - `evaluateBlueprint`:
    - `feedback`: `minCount` unmet (fewer feedback) → message; met → none; `minAvgRating` (avg of non-null ratings) unmet/met; `requireNote` with no non-empty note → message.
    - `exam_passed` with `examId`: that exam `passFail!=='pass'` → message; passed → none; `minScore` unmet even when passed → message.
    - `exam_passed` without `examId`: no linked exam passed → message; at least one passed → none.
    - `checklist`: a missing item id (or `false`) → message listing the missing labels; all `true` → none.
    - empty rules `[]` → `[]`; a malformed rule slipped past parse → treated satisfied (never a false block).
    - multiple unmet rules → all messages returned.

- [ ] **Step 2: Run red** `cd apps/api && npx jest blueprint-rules`.
- [ ] **Step 3: Implement `blueprint-rules.ts`**
```ts
import { BadRequestException } from '@nestjs/common';

export type BlueprintRule =
  | { id: string; type: 'feedback'; minCount?: number; minAvgRating?: number; requireNote?: boolean }
  | { id: string; type: 'exam_passed'; examId?: string; minScore?: number }
  | { id: string; type: 'checklist'; items: { id: string; label: string }[] };

export interface BlueprintContext {
  feedback: { rating: number | null; note: string | null }[];
  examResults: { examId: string; passFail: string | null; score: number | null }[];
  checklistTicks: Record<string, boolean>;
}

const RULE_TYPES = ['feedback', 'exam_passed', 'checklist'] as const;

export function parseRules(rulesJson: string | null | undefined): BlueprintRule[] {
  if (!rulesJson) return [];
  try {
    const arr = JSON.parse(rulesJson);
    return Array.isArray(arr) ? (arr as BlueprintRule[]) : [];
  } catch {
    return [];
  }
}

export function parseChecklist(json: string | null | undefined): Record<string, boolean> {
  if (!json) return {};
  try {
    const obj = JSON.parse(json);
    return obj && typeof obj === 'object' && !Array.isArray(obj) ? (obj as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

export function validateBlueprintRules(rules: unknown): BlueprintRule[] {
  if (!Array.isArray(rules)) throw new BadRequestException('rules must be an array');
  for (const r of rules as any[]) {
    if (!r || typeof r !== 'object' || typeof r.id !== 'string' || !r.id) throw new BadRequestException('each rule needs a string id');
    if (!RULE_TYPES.includes(r.type)) throw new BadRequestException(`unknown rule type ${r.type}`);
    if (r.type === 'checklist') {
      if (!Array.isArray(r.items) || r.items.length === 0) throw new BadRequestException('checklist rule needs items');
      for (const it of r.items) if (!it || typeof it.id !== 'string' || typeof it.label !== 'string') throw new BadRequestException('checklist item needs id + label');
    }
    if (r.type === 'feedback') {
      for (const k of ['minCount', 'minAvgRating', 'minScore'] as const) if (r[k] !== undefined && typeof r[k] !== 'number') throw new BadRequestException(`${k} must be a number`);
    }
    if (r.type === 'exam_passed') {
      if (r.examId !== undefined && typeof r.examId !== 'string') throw new BadRequestException('examId must be a string');
      if (r.minScore !== undefined && typeof r.minScore !== 'number') throw new BadRequestException('minScore must be a number');
    }
  }
  return rules as BlueprintRule[];
}

function avg(nums: (number | null)[]): number | null {
  const xs = nums.filter((n): n is number => typeof n === 'number');
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

export function evaluateBlueprint(rules: BlueprintRule[], ctx: BlueprintContext): string[] {
  const unmet: string[] = [];
  for (const rule of rules) {
    if (rule.type === 'feedback') {
      if (rule.minCount !== undefined && ctx.feedback.length < rule.minCount) unmet.push(`at least ${rule.minCount} feedback ${rule.minCount === 1 ? 'entry' : 'entries'}`);
      if (rule.minAvgRating !== undefined) {
        const a = avg(ctx.feedback.map((f) => f.rating));
        if (a === null || a < rule.minAvgRating) unmet.push(`an average rating of at least ${rule.minAvgRating}`);
      }
      if (rule.requireNote && !ctx.feedback.some((f) => (f.note ?? '').trim() !== '')) unmet.push('a feedback note');
    } else if (rule.type === 'exam_passed') {
      const pool = rule.examId ? ctx.examResults.filter((r) => r.examId === rule.examId) : ctx.examResults;
      const ok = pool.some((r) => r.passFail === 'pass' && (rule.minScore === undefined || (r.score ?? -Infinity) >= rule.minScore));
      if (!ok) unmet.push(rule.examId ? 'the required exam passed' : 'a passing exam result');
    } else if (rule.type === 'checklist') {
      const missing = rule.items.filter((it) => ctx.checklistTicks[it.id] !== true).map((it) => it.label);
      if (missing.length) unmet.push(`checklist: ${missing.join(', ')}`);
    }
    // unknown/malformed rule type → treated as satisfied (never a false block)
  }
  return unmet;
}
```
- [ ] **Step 4: Run green + tsc. Step 5: commit** `feat(blueprint): rule engine + parse/validate`.

---

### Task 3: Config API — rules on updateStage + parsed in read shapes

**Files:**
- Modify: `apps/api/src/pipeline/dto/update-stage.dto.ts`; `apps/api/src/pipeline/pipelines.service.ts` (`updateStage` ~L123, list/get); `apps/api/src/pipeline/pipeline.service.ts` (`getBoard` stage mapping)
- Test: extend the pipelines service spec

**Interfaces:**
- `UpdateStageDto` gains `rules?: unknown[]` (validated in the service via `validateBlueprintRules`).
- Every stage the config API (`GET /pipelines`) and `getBoard` emit gains `rules: BlueprintRule[]` (parsed from `rulesJson`; raw `rulesJson` never sent).

- [ ] **Step 1: DTO** — add `@IsOptional() @IsArray() rules?: unknown[];` to `UpdateStageDto` (import `IsArray`, `IsOptional`).
- [ ] **Step 2: Failing tests** — `updateStage` with valid `rules` persists `rulesJson` (serialized) and the returned stage includes parsed `rules`; invalid rule shape → `BadRequestException` (validated); the pipelines list maps `rulesJson`→`rules` (a stage with null rulesJson → `rules: []`); a stage with rules round-trips.
- [ ] **Step 3: Implement**
  - `updateStage`: before the update, if `dto.rules !== undefined`, `const rulesJson = JSON.stringify(validateBlueprintRules(dto.rules));` and add `...(dto.rules !== undefined ? { rulesJson } : {})` to the `data` object. Return the stage mapped through a `toStageResponse` that adds `rules: parseRules(stage.rulesJson)` and omits `rulesJson`.
  - The pipelines `list`/`get` (whatever builds the `GET /pipelines` payload) maps each stage the same way (`rules: parseRules(s.rulesJson)`, omit `rulesJson`). Import `parseRules`/`validateBlueprintRules` from `./blueprint-rules`.
  - `getBoard` (`pipeline.service.ts`): where it returns `board.pipeline.stages`, include `rules: parseRules(stage.rulesJson)` on each stage (add `rulesJson: true` to that stage select if it uses `select`). The board's stage list must carry `rules` for the drawer.
- [ ] **Step 4: Run tests + tsc. Step 5: commit** `feat(blueprint): stage rules read/write in config + board`.

---

### Task 4: Enforcement in patchEntry

**Files:**
- Modify: `apps/api/src/pipeline/pipeline.service.ts` (`patchEntry` ~L638-773)
- Test: extend `pipeline.service.spec.ts`

**Interfaces:**
- Consumes: `evaluateBlueprint`, `parseRules`, `parseChecklist` from `./blueprint-rules`; `deriveEntryExamResults` from `./derive-entry-exam-results`.

- [ ] **Step 1: Failing tests** — inside `patchEntry`'s `statusId` branch:
  - moving into a stage whose `rulesJson` has an unmet rule → `BadRequestException` whose message names the stage + unmet items; `tx.pipelineEntry.update` NOT called.
  - all rules met → move succeeds (update called).
  - target stage == current stage (same-stage status change) → NOT gated (even with unmet rules).
  - target category `rejected` or `archived` → NOT gated (unmet rules ignored).
  - a `rejected:true` (Branch B) reject → NOT gated.
  - target stage with no `rulesJson` → unaffected (no extra queries needed).

- [ ] **Step 2: Implement** — in the `dto.statusId !== undefined` branch, after `resolved` is obtained and `category` known, and BEFORE `tx.pipelineEntry.update`:
```ts
const targetStage = resolved.stage;
const currentStageId = existing.status?.stageId ?? existing.status?.stage?.id ?? null;
const isStageChange = targetStage.id !== currentStageId;
const isTerminalReject = targetStage.category === 'rejected' || targetStage.category === 'archived';
if (isStageChange && !isTerminalReject) {
  const rules = parseRules(targetStage.rulesJson);
  if (rules.length) {
    const [linkExamRows, feedbackRows, invitations] = await Promise.all([
      tx.jobExam.findMany({ where: { jobId: existing.jobId }, select: { examId: true } }),
      tx.pipelineFeedback.findMany({ where: { entryId, organizationId: orgId }, select: { rating: true, note: true } }),
      tx.invitation.findMany({
        where: { candidateId: existing.candidateId, organizationId: orgId },
        include: { exam: { select: { title: true } }, attempt: { include: { result: true } } },
      }),
    ]);
    const examResults = deriveEntryExamResults(invitations as any, linkExamRows.map((l) => l.examId));
    const ctx = {
      feedback: feedbackRows,
      examResults: examResults.map((r) => ({ examId: r.examId, passFail: r.passFail, score: r.score })),
      checklistTicks: parseChecklist(existing.blueprintChecklistJson),
    };
    const unmet = evaluateBlueprint(rules, ctx);
    if (unmet.length) throw new BadRequestException(`Cannot move to "${targetStage.name}": ${unmet.join('; ')}`);
  }
}
```
Notes: confirm the `existing` findFirst returns the scalars `jobId`, `candidateId`, `blueprintChecklistJson` (findFirst with `include` returns all scalar columns by default — after Task 1 + generate, `blueprintChecklistJson` is a scalar). Confirm `targetStage.rulesJson` is present — `resolveStatus` returns the full `PipelineStage` row (includes `rulesJson` after Task 1). Confirm the `Invitation` model relation names (`exam`, `attempt.result`) match `derive-entry-exam-results` usage in `getBoard`. The check is inside the existing tx and only runs when the target stage has rules (zero cost otherwise).
- [ ] **Step 3: Run tests + tsc. Step 5: commit** `feat(blueprint): enforce stage entry requirements in patchEntry`.

---

### Task 5: Checklist tick API

**Files:**
- Create: `apps/api/src/pipeline/dto/set-checklist-item.dto.ts`
- Modify: `apps/api/src/pipeline/pipeline.service.ts` (`setChecklistItem`; `getBoard` row `blueprintChecklist`); `apps/api/src/pipeline/pipeline.controller.ts` (route)
- Test: extend `pipeline.service.spec.ts`

**Interfaces:**
- `PATCH /entries/:id/checklist` `{ itemId: string; done: boolean }` (gated `pipeline:manage`).
- `setChecklistItem(context, actorUserId, entryId, itemId, done): Promise<{ success: true }>`.
- Board rows gain `blueprintChecklist: Record<string, boolean>` (parsed from the entry's `blueprintChecklistJson`).

- [ ] **Step 1: DTO** `set-checklist-item.dto.ts`:
```ts
import { IsBoolean, IsString, IsNotEmpty, MaxLength } from 'class-validator';
export class SetChecklistItemDto {
  @IsString() @IsNotEmpty() @MaxLength(100) itemId!: string;
  @IsBoolean() done!: boolean;
}
```
- [ ] **Step 2: Failing tests** — `setChecklistItem` merges `{ [itemId]: true }` into `blueprintChecklistJson` (preserving existing ticks); `done:false` removes/sets false; audits `entry.checklist_changed`; `getBoard` row includes parsed `blueprintChecklist`.
- [ ] **Step 3: Implement**
```ts
async setChecklistItem(context: TenantContext, actorUserId: string, entryId: string, itemId: string, done: boolean): Promise<{ success: true }> {
  const orgId = context.organizationId as string;
  await this.tenantPrisma.forTenant(context, async (tx) => {
    const entry = await tx.pipelineEntry.findFirst({ where: { id: entryId, organizationId: orgId }, select: { id: true, blueprintChecklistJson: true } });
    if (!entry) throw new NotFoundException(`Pipeline entry ${entryId} not found`);
    const ticks = parseChecklist(entry.blueprintChecklistJson);
    if (done) ticks[itemId] = true; else delete ticks[itemId];
    await tx.pipelineEntry.update({ where: { id: entryId }, data: { blueprintChecklistJson: JSON.stringify(ticks) } });
  });
  await this.audit.record(context, { actorUserId, action: 'entry.checklist_changed', entityType: 'pipeline_entry', entityId: entryId, metadata: { itemId, done } });
  return { success: true };
}
```
(Note: `audit.record` AFTER `forTenant` resolves — the established convention.) Controller: `@Patch('entries/:id/checklist') @RequirePermissions('pipeline:manage')` → `setChecklistItem(tenant, userId, id, dto.itemId, dto.done)`. In `getBoard`, add `blueprintChecklistJson: true` to the entry select and set `blueprintChecklist: parseChecklist(e.blueprintChecklistJson)` on each row (+ the `BoardRow` interface field).
- [ ] **Step 4: Run tests + tsc. Step 5: commit** `feat(blueprint): checklist tick API + board row checklist`.

---

### Task 6: Web — types + stage requirements editor (settings)

**Files:**
- Modify: `apps/web/lib/types.ts`; `apps/web/lib/hooks/usePipelines.ts` (`UpdateStageInput.rules`); `apps/web/app/v2/(org-admin)/settings/pipelines/page.tsx`
- Test: a focused test of the requirements-editor round-trip (or the settings page render + save)

**Interfaces (inline in `types.ts`):**
```ts
export type BlueprintRule =
  | { id: string; type: 'feedback'; minCount?: number; minAvgRating?: number; requireNote?: boolean }
  | { id: string; type: 'exam_passed'; examId?: string; minScore?: number }
  | { id: string; type: 'checklist'; items: { id: string; label: string }[] };
```
Add `rules?: BlueprintRule[]` to `PipelineStageConfig` (~types.ts L297).

- [ ] **Step 1: Types + hook** — add `BlueprintRule`; add `rules?: BlueprintRule[]` to `PipelineStageConfig`; add `rules?: BlueprintRule[]` to `UpdateStageInput` in `usePipelines.ts` (it already POSTs the body to `PATCH /pipelines/stages/:stageId`).
- [ ] **Step 2: Requirements editor** in `StageCard` (settings page) — a "Requirements" expander showing the stage's `rules`; add-rule (pick type), per-type inputs (feedback: min count / min avg rating / require-note checkbox; exam_passed: exam id text or a select if a linked-exam list is readily available in this surface — else a plain input, documented; optional min score; checklist: an editable list of item labels), remove-rule. Generate rule/item ids client-side (`crypto.randomUUID()`). On save, `updateStage.mutate({ stageId, rules })`. Keep the existing name/category/position editing intact. Import `Button` directly if needed (jest/DataTable ESM dodge).
- [ ] **Step 3: Test** — render StageCard/editor with hooks mocked; adding a rule + saving calls `updateStage.mutate` with the `rules` array; an existing stage's rules render. Run `npx jest pipelines` (web) or the settings test.
- [ ] **Step 4: tsc + commit** `feat(blueprint): web stage requirements editor + types`.

---

### Task 7: Web — checklist card in the drawer + board wiring

**Files:**
- Modify: `apps/web/lib/types.ts` (`BoardEntryRow.blueprintChecklist`); `apps/web/lib/hooks/usePipeline.ts` (`useSetChecklistItem`); `apps/web/app/v2/(recruiter)/jobs/PipelineBoard.tsx` (pass stages to drawer); `apps/web/app/v2/(recruiter)/jobs/CandidateDrawer.tsx` (checklist card)
- Test: a focused test of the checklist card (renders items, tick calls the hook) — extract a pure helper if importing the drawer trips the jest/DataTable ESM issue (mirror `boardFilters.ts`).

**Interfaces:**
- `BoardEntryRow` gains `blueprintChecklist: Record<string, boolean>`.
- `useSetChecklistItem(entryId, jobId)` → PATCH `/entries/:id/checklist` `{ itemId, done }`, invalidates `['jobs', jobId, 'pipeline']`.

- [ ] **Step 1: Type + hook** — add `blueprintChecklist: Record<string, boolean>` to `BoardEntryRow`; add `useSetChecklistItem` mirroring `usePatchEntry` (`usePipeline.ts:111`).
- [ ] **Step 2: Board wiring** — `PipelineBoard` passes the pipeline stages (which now carry `rules`) to the drawer: add a `stages={board.pipeline.stages}` prop on `<CandidateDrawer …>` (the board already has `board.pipeline.stages`).
- [ ] **Step 3: Drawer checklist card** — `CandidateDrawer` accepts `stages: PipelineStageConfig[]`; compute the checklist items across all stages that have a `checklist` rule: `stages.flatMap(s => (s.rules ?? []).filter(r => r.type==='checklist').flatMap(r => r.items.map(it => ({ ...it, stageName: s.name }))))`. If any, render a "Checklist" card (in the section stack ~L527-582) listing each item with a checkbox bound to `row.blueprintChecklist[it.id] === true`; on toggle call `useSetChecklistItem(row.entryId, jobId).mutate({ itemId: it.id, done })`. If no checklist items in the pipeline, render nothing.
- [ ] **Step 4: Test** — a pure helper `collectChecklistItems(stages)` extracted + unit-tested (dedupe by item id; carries stageName); optionally a light drawer render. Run `npx jest` (web) for the touched tests.
- [ ] **Step 5: tsc + commit** `feat(blueprint): drawer checklist card + board wiring`.

---

## Self-Review Notes (author)

- **Spec coverage:** columns+migration (T1); engine (T2); config read/write of rules (T3); enforcement (T4); checklist API + board checklist (T5); settings editor (T6); drawer checklist + wiring (T7). All spec sections mapped; interview/offer/fit rule types are documented out-of-scope (same engine, fast-follow).
- **Type consistency:** `BlueprintRule` union identical API (T2) ↔ web (T6); `PipelineStageConfig.rules` (parsed) flows config→board→drawer; `blueprintChecklist: Record<string,boolean>` identical getBoard row (T5) ↔ web `BoardEntryRow` (T7); checklist item ids are the keys in `blueprintChecklistJson` and in the tick API.
- **Enforcement guards:** advance-only (stage change), non-terminal (reject/archive exempt), reject branch bypassed, no-rules zero-cost. Hard-block message flows to the existing toast (non-optimistic board — no revert needed).
- **Config API returns parsed `rules`** (never raw `rulesJson`) — consistent with the parsed-shape convention; validation centralized in `validateBlueprintRules` (T2), called by `updateStage` (T3).
- **No new table/RLS/seed** — two additive nullable columns on existing tenant tables. Migration `20260906110000` sorts after all five parked branches; keep all migrations on a later multi-branch merge.
- **Checklist UX:** the drawer aggregates checklist items across the pipeline's stages (ticked anytime); a move into a stage enforces that stage's checklist item ids are ticked. Simple + unambiguous vs. guessing the "next" stage.
