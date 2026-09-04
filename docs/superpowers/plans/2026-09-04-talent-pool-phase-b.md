# Talent Pool (Phase B) + Category-Aware Analytics — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a candidate-level global stage (New → In Review → Engaged → **Available** → Offered/Hired/Rejected) that powers a re-engageable talent pool, with auto-archive-on-hire + Available-on-job-close, and make the hiring analytics funnel category-aware so custom pipelines are counted.

**Architecture:** A stored `Candidate.globalStage` maintained by one idempotent pure derivation (`deriveGlobalStage`) called from hooks (add-entry, status-change, comms-send, job-close). "Archiving" an entry means setting `PipelineEntry.archivedAt` (the seeded default pipeline has no archived-category stage, so archiving is a timestamp, not a status move); archived entries drop off the board and free the candidate to `available`. Analytics pivots on the Phase-A stage `category` instead of the removed fixed stage names.

**Tech Stack:** NestJS + Prisma + SQL Server (apps/api), Next.js 16 + React 18 + ui-v2 (apps/web), `@exam-platform/shared`. Jest (api/shared), tsc (web).

**Spec:** `docs/superpowers/specs/2026-09-04-configurable-pipeline-and-talent-pool-design.md` (§4 behavior, §4.1 recompute precedence, §4.2 hooks, §5 API, §6 web, §7 phasing). This plan is **Phase B**; Phase A (`feat/ats-configurable-pipeline`, commits ..bae92c78) is already built, browser-verified, and provides the `Pipeline`/`PipelineStage(category)`/`PipelineStatus` model, `PipelineEntry.statusId`/`archivedAt`, `StageCategory` enum, and `getBoard`→`{pipeline,columns}`. Build Phase B on that same branch.

## Global Constraints

- **NEVER `npm install`/`ci`/`update`** — deps are present; installing corrupts the workspace. If something's missing, STOP → NEEDS_CONTEXT.
- **Commands** (verified): api tests `cd apps/api && npx jest <path>`; shared tests `cd packages/shared && npx jest <path>`; regenerate client `cd apps/api && npx prisma generate`; web typecheck `npx tsc -p apps/web/tsconfig.json --noEmit` (ignore ~41 pre-existing `.next/` errors); apply migrations to the dev DB `cd apps/api && npx prisma migrate deploy` (DB is reachable via apps/api/.env). If `packages/shared/dist` is stale, rebuild with `cd packages/shared && npx tsc` (build only).
- **RLS is mandatory** — every DB access via `TenantPrismaService.forTenant(context, tx => ...)`. New tables (none in this plan) use the shared `dbo.TenantAccessPolicy` + `dbo.fn_tenant_access_predicate(organization_id)` in a separate migration.
- **Migration SQL-Server gotchas (learned applying Phase A):** (1) a cross-tenant `UPDATE`/`INSERT` in a migration needs the RLS bypass `EXEC sp_set_session_context @key=N'app_is_super_admin', @value=1;` before and `@value=0;` after (see `20260904090002_configurable_pipeline_seed`). (2) referencing a column added earlier in the SAME batch fails (error 207) — wrap such DML in `EXEC(N'...')` dynamic SQL (Prisma SQL-Server has no `GO`). (3) dropping a column with a default constraint fails (5074) — drop the constraint first. Only (1) is likely relevant here (the globalStage backfill).
- **Enum values, exact:** `GLOBAL_STAGES = ['new','in_review','engaged','available','offered','hired','rejected']`; stage `category ∈ 'active'|'offer'|'hired'|'rejected'|'archived'` (from Phase A `@exam-platform/shared`).
- **Archiving = `archivedAt` timestamp**, never requires an archived-category stage. Archived entries are excluded from the board's active columns.
- **Behavior preservation:** with `autoArchiveSiblingsOnHire` default `true`, and existing candidates back-filled to a correct globalStage, no existing UI breaks; the talent pool is opt-in via a filter.
- **TDD:** failing test first, watch it fail, minimal impl, watch it pass, commit. Frequent commits.

---

## File Structure

**Shared (`packages/shared/src/pipeline/`)** — new:
- `global-stage.ts` — `GLOBAL_STAGES`, `GlobalStage`, `deriveGlobalStage(entries, contacted)`.
- `global-stage.spec.ts`.

**API (`apps/api/src/`)** — new + modified:
- `candidates/recompute-global-stage.ts` (new) — `recomputeGlobalStage(tx, organizationId, candidateId)` (operates on a Prisma tx client; no service DI, avoids circular deps).
- `candidates/recompute-global-stage.spec.ts` (new).
- `pipeline/pipeline.service.ts` (modify) — call recompute from `addEntry`, `patchEntry`; add sibling auto-archive on hire; add job-close archiving in `updateJob`.
- `candidate-emails/candidate-emails.service.ts` (modify) — call recompute after `sendMessage`.
- `candidates/candidates.service.ts` + `candidates.controller.ts` (modify) — `globalStage` list filter.
- `organizations/*` (modify) — `autoArchiveSiblingsOnHire` read/write (behind `pipelines:configure`).
- `analytics/pipeline-analytics.ts` + `pipeline-analytics.service.ts` (modify) — category-aware funnel.
- Prisma: `schema.prisma` + migrations for `Candidate.globalStage`, `Organization.autoArchiveSiblingsOnHire`, and a backfill.

**Web (`apps/web/`)** — modified:
- `app/v2/(recruiter)/candidates/page.tsx` — globalStage filter + default "Available" pool view + Re-engage.
- `app/v2/(recruiter)/settings/pipelines/page.tsx` — auto-archive toggle (co-located with pipeline config).
- `lib/hooks/*` + `lib/types.ts` — globalStage types + the setting hook.
- `app/v2/(recruiter)/analytics/hiring/page.tsx` — category funnel labels.

---

## Task 1: Shared `deriveGlobalStage` + enum

**Files:**
- Create: `packages/shared/src/pipeline/global-stage.ts`
- Test: `packages/shared/src/pipeline/global-stage.spec.ts`
- Modify: `packages/shared/src/index.ts` (barrel export)

**Interfaces:**
- Consumes: `StageCategory` from `./pipeline-categories` (Phase A).
- Produces: `GLOBAL_STAGES: readonly [...]`; `type GlobalStage`; `deriveGlobalStage(entries: { category: StageCategory; archived: boolean }[], contacted: boolean): GlobalStage`.

- [ ] **Step 1: Write the failing test**

```ts
import { deriveGlobalStage, GLOBAL_STAGES } from './global-stage';

const e = (category: any, archived = false) => ({ category, archived });

describe('deriveGlobalStage', () => {
  it('lists the seven global stages in order', () => {
    expect(GLOBAL_STAGES).toEqual(['new','in_review','engaged','available','offered','hired','rejected']);
  });
  it('no entries, never contacted -> new', () => {
    expect(deriveGlobalStage([], false)).toBe('new');
  });
  it('no entries but contacted -> in_review', () => {
    expect(deriveGlobalStage([], true)).toBe('in_review');
  });
  it('a non-archived active entry -> engaged', () => {
    expect(deriveGlobalStage([e('active')], true)).toBe('engaged');
  });
  it('a non-archived offer entry -> offered (beats engaged)', () => {
    expect(deriveGlobalStage([e('active'), e('offer')], true)).toBe('offered');
  });
  it('a non-archived hired entry -> hired (beats everything)', () => {
    expect(deriveGlobalStage([e('active'), e('offer'), e('hired'), e('rejected')], true)).toBe('hired');
  });
  it('all entries terminal, one archived (freed) -> available (beats rejected)', () => {
    expect(deriveGlobalStage([e('rejected'), e('active', true)], true)).toBe('available');
  });
  it('only rejected entries -> rejected', () => {
    expect(deriveGlobalStage([e('rejected')], true)).toBe('rejected');
  });
  it('a hired entry that was itself archived does not count as hired', () => {
    // e.g. hired then the job closed/archived; falls to available via the archived flag
    expect(deriveGlobalStage([e('hired', true)], true)).toBe('available');
  });
});
```

- [ ] **Step 2: Run test, verify it fails** (`cd packages/shared && npx jest src/pipeline/global-stage.spec.ts`) — module not found.

- [ ] **Step 3: Implement**

```ts
import type { StageCategory } from './pipeline-categories';

export const GLOBAL_STAGES = ['new', 'in_review', 'engaged', 'available', 'offered', 'hired', 'rejected'] as const;
export type GlobalStage = (typeof GLOBAL_STAGES)[number];

export interface GlobalStageEntry {
  category: StageCategory;
  archived: boolean;
}

// Idempotent derivation of a candidate's global stage from their pipeline entries.
// An archived entry (archivedAt set) is "freed" -- it no longer counts toward
// active/offer/hired, but it does make the candidate re-engageable (available).
export function deriveGlobalStage(entries: GlobalStageEntry[], contacted: boolean): GlobalStage {
  const live = entries.filter((e) => !e.archived);
  if (live.some((e) => e.category === 'hired')) return 'hired';
  if (live.some((e) => e.category === 'offer')) return 'offered';
  if (live.some((e) => e.category === 'active')) return 'engaged';
  if (entries.some((e) => e.archived)) return 'available';
  if (live.some((e) => e.category === 'rejected')) return 'rejected';
  return contacted ? 'in_review' : 'new';
}
```

Add to `packages/shared/src/index.ts`: `export * from './pipeline/global-stage';`

- [ ] **Step 4: Run test, verify it passes.**

- [ ] **Step 5: Commit** — `git add packages/shared/src/pipeline/global-stage.* packages/shared/src/index.ts && git commit -m "feat(pipeline): shared deriveGlobalStage + GLOBAL_STAGES enum"`

---

## Task 2: Schema — `Candidate.globalStage` + `Organization.autoArchiveSiblingsOnHire` + backfill

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<ts>_candidate_global_stage/migration.sql`
- Create: `apps/api/prisma/migrations/<ts>_backfill_candidate_global_stage/migration.sql`

**Interfaces:**
- Produces: `Candidate.globalStage String @default("new")` (indexed `(organizationId, globalStage)`); `Organization.autoArchiveSiblingsOnHire Boolean @default(true)`.

- [ ] **Step 1: Edit `schema.prisma`.** On `Candidate` add `globalStage String @default("new") @map("global_stage")` and an index `@@index([organizationId, globalStage])`. On `Organization` add `autoArchiveSiblingsOnHire Boolean @default(true) @map("auto_archive_siblings_on_hire")`.

- [ ] **Step 2: Write the columns migration** `<ts>_candidate_global_stage/migration.sql` (timestamp after the latest existing migration; match folder-naming):

```sql
ALTER TABLE [candidates] ADD [global_stage] NVARCHAR(1000) NOT NULL CONSTRAINT [candidates_global_stage_df] DEFAULT 'new';
CREATE INDEX [candidates_organization_id_global_stage_idx] ON [candidates]([organization_id], [global_stage]);
ALTER TABLE [organizations] ADD [auto_archive_siblings_on_hire] BIT NOT NULL CONSTRAINT [organizations_auto_archive_df] DEFAULT 1;
```

(Confirm the exact string column type Prisma uses for `String` on SQL Server in a sibling migration — recent ones use `NVARCHAR(1000)`; match whatever the newest migration uses.)

- [ ] **Step 3: Write the backfill migration** `<ts>_backfill_candidate_global_stage/migration.sql`. It sets each existing candidate's `global_stage` from their entries' stage categories, mirroring `deriveGlobalStage`. Wrap in the RLS bypass (candidates, pipeline_entries, pipeline_statuses, pipeline_stages, candidate_emails all carry tenant predicates). Precedence via one `UPDATE ... SET global_stage = CASE ...` using `EXISTS` sub-queries:

```sql
EXEC sp_set_session_context @key=N'app_is_super_admin', @value=1;

UPDATE c SET c.global_stage =
  CASE
    WHEN EXISTS (SELECT 1 FROM pipeline_entries e JOIN pipeline_statuses su ON su.id=e.status_id JOIN pipeline_stages st ON st.id=su.stage_id
                 WHERE e.candidate_id=c.id AND e.archived_at IS NULL AND st.category='hired') THEN 'hired'
    WHEN EXISTS (SELECT 1 FROM pipeline_entries e JOIN pipeline_statuses su ON su.id=e.status_id JOIN pipeline_stages st ON st.id=su.stage_id
                 WHERE e.candidate_id=c.id AND e.archived_at IS NULL AND st.category='offer') THEN 'offered'
    WHEN EXISTS (SELECT 1 FROM pipeline_entries e JOIN pipeline_statuses su ON su.id=e.status_id JOIN pipeline_stages st ON st.id=su.stage_id
                 WHERE e.candidate_id=c.id AND e.archived_at IS NULL AND st.category='active') THEN 'engaged'
    WHEN EXISTS (SELECT 1 FROM pipeline_entries e WHERE e.candidate_id=c.id AND e.archived_at IS NOT NULL) THEN 'available'
    WHEN EXISTS (SELECT 1 FROM pipeline_entries e JOIN pipeline_statuses su ON su.id=e.status_id JOIN pipeline_stages st ON st.id=su.stage_id
                 WHERE e.candidate_id=c.id AND e.archived_at IS NULL AND st.category='rejected') THEN 'rejected'
    WHEN EXISTS (SELECT 1 FROM candidate_emails m WHERE m.candidate_id=c.id) THEN 'in_review'
    ELSE 'new'
  END
FROM [candidates] c;

EXEC sp_set_session_context @key=N'app_is_super_admin', @value=0;
```

- [ ] **Step 4:** `cd apps/api && npx prisma generate` — client exposes `globalStage` + `autoArchiveSiblingsOnHire`.

- [ ] **Step 5:** Apply to dev DB: `npx prisma migrate deploy`; expect both migrations applied. (If it errors, follow the Global-Constraints SQL-Server notes.)

- [ ] **Step 6: Commit** — `git add apps/api/prisma && git commit -m "feat(pipeline): Candidate.globalStage + org autoArchiveSiblingsOnHire + backfill"`

---

## Task 3: `recomputeGlobalStage(tx, orgId, candidateId)`

**Files:**
- Create: `apps/api/src/candidates/recompute-global-stage.ts`
- Test: `apps/api/src/candidates/recompute-global-stage.spec.ts`

**Interfaces:**
- Consumes: `deriveGlobalStage` (Task 1).
- Produces: `async function recomputeGlobalStage(tx: Prisma.TransactionClient, organizationId: string, candidateId: string): Promise<GlobalStage>` — loads the candidate's entries (category via `status.stage`, plus `archivedAt`) and whether any `candidateEmail` exists, derives, writes `candidate.globalStage`, returns it. Takes a `tx` so hooks call it inside their existing transaction.

- [ ] **Step 1: Write the failing test** (mock a `tx` with `pipelineEntry.findMany`, `candidateEmail.count`, `candidate.update`):

```ts
import { recomputeGlobalStage } from './recompute-global-stage';

function fakeTx(entries: any[], emailCount: number) {
  return {
    pipelineEntry: { findMany: jest.fn().mockResolvedValue(entries) },
    candidateEmail: { count: jest.fn().mockResolvedValue(emailCount) },
    candidate: { update: jest.fn().mockResolvedValue({}) },
  } as any;
}

it('writes engaged for a live active entry', async () => {
  const tx = fakeTx([{ archivedAt: null, status: { stage: { category: 'active' } } }], 0);
  const result = await recomputeGlobalStage(tx, 'org-1', 'cand-1');
  expect(result).toBe('engaged');
  expect(tx.candidate.update).toHaveBeenCalledWith({ where: { id: 'cand-1' }, data: { globalStage: 'engaged' } });
});

it('writes available when the only entry is archived', async () => {
  const tx = fakeTx([{ archivedAt: new Date(), status: { stage: { category: 'active' } } }], 0);
  expect(await recomputeGlobalStage(tx, 'org-1', 'cand-1')).toBe('available');
});

it('writes in_review for a contacted candidate with no entries', async () => {
  const tx = fakeTx([], 2);
  expect(await recomputeGlobalStage(tx, 'org-1', 'cand-1')).toBe('in_review');
});
```

- [ ] **Step 2: Run test, verify it fails.**

- [ ] **Step 3: Implement**

```ts
import { Prisma } from '@prisma/client';
import { deriveGlobalStage, GlobalStage } from '@exam-platform/shared';

export async function recomputeGlobalStage(
  tx: Prisma.TransactionClient,
  organizationId: string,
  candidateId: string,
): Promise<GlobalStage> {
  const entries = await tx.pipelineEntry.findMany({
    where: { candidateId, organizationId },
    select: { archivedAt: true, status: { select: { stage: { select: { category: true } } } } },
  });
  const emailCount = await tx.candidateEmail.count({ where: { candidateId, organizationId } });
  const stage = deriveGlobalStage(
    entries.map((e) => ({
      category: (e.status?.stage.category ?? 'active') as any,
      archived: e.archivedAt != null,
    })),
    emailCount > 0,
  );
  await tx.candidate.update({ where: { id: candidateId }, data: { globalStage: stage } });
  return stage;
}
```

- [ ] **Step 4: Run test, verify it passes.**

- [ ] **Step 5: Commit** — `git add apps/api/src/candidates/recompute-global-stage.* && git commit -m "feat(pipeline): recomputeGlobalStage tx helper"`

---

## Task 4: Recompute hooks in `addEntry` + `patchEntry`

**Files:**
- Modify: `apps/api/src/pipeline/pipeline.service.ts` (`addEntry`, `patchEntry`)
- Test: `apps/api/src/pipeline/pipeline.service.spec.ts` (extend)

**Interfaces:**
- Consumes: `recomputeGlobalStage` (Task 3).

- [ ] **Step 1: Write failing tests** asserting `addEntry` and a `patchEntry` status change both cause the candidate's `globalStage` to be recomputed (spy that `candidate.update` is called with a `globalStage`, or that the mocked recompute path runs). Match the existing spec's `tx` mock shape; add `candidate.update`/`candidateEmail.count` to the fake tx.

```ts
it('addEntry recomputes the candidate global stage to engaged', async () => {
  // after creating the entry, expect tx.candidate.update called with globalStage 'engaged'
  await service.addEntry(ctx, 'u1', 'job1', { candidateId: 'c1', enteredVia: 'manual' });
  expect(txCandidateUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ globalStage: 'engaged' }) }));
});
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement** — inside `addEntry`'s `forTenant` tx, after creating the entry, `await recomputeGlobalStage(tx, orgId, candidateId)`. Inside `patchEntry`'s tx (the statusId branch AND both rejected branches), after the `pipelineEntry.update`, `await recomputeGlobalStage(tx, orgId, existing.candidateId)`. (The hire path in Task 5 also recomputes; that's fine — recompute is idempotent, but avoid double-writing in one tx by recomputing once at the end.)

- [ ] **Step 4: Run, verify pass.**

- [ ] **Step 5: Commit** — `git add apps/api/src/pipeline && git commit -m "feat(pipeline): recompute candidate global stage on add/patch entry"`

---

## Task 5: Auto-archive siblings on hire + Available on job-close

**Files:**
- Modify: `apps/api/src/pipeline/pipeline.service.ts` (`patchEntry` hire path; `updateJob` close path)
- Test: `apps/api/src/pipeline/pipeline.service.spec.ts` (extend)

**Interfaces:**
- Consumes: `recomputeGlobalStage`; the org `autoArchiveSiblingsOnHire` flag (read from `tx.organization`).

- [ ] **Step 1: Write failing tests**

```ts
it('on hire, archives the candidate\'s other active entries when the org toggle is on', async () => {
  // org.autoArchiveSiblingsOnHire = true; candidate c1 has entry e1 (this job, -> hired) and e2 (other job, active, not archived)
  await service.patchEntry(ctx, 'u1', 'e1', { statusId: 'hired-status' });
  expect(txEntryUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
    where: expect.objectContaining({ candidateId: 'c1', archivedAt: null, id: { not: 'e1' } }),
    data: { archivedAt: expect.any(Date) },
  }));
});

it('does NOT archive siblings when the org toggle is off', async () => {
  // org.autoArchiveSiblingsOnHire = false
  await service.patchEntry(ctx, 'u1', 'e1', { statusId: 'hired-status' });
  expect(txEntryUpdateMany).not.toHaveBeenCalled();
});

it('closing a job archives its still-active entries and frees those candidates to available', async () => {
  await service.updateJob(ctx, 'u1', 'job1', { status: 'closed' });
  expect(txEntryUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
    where: expect.objectContaining({ jobId: 'job1', archivedAt: null }),
    data: { archivedAt: expect.any(Date) },
  }));
  // and each affected candidate recomputed
});
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement.**
  - **Hire path** (in `patchEntry`, when the new status's stage `category === 'hired'` and it's a transition into hired): read `org = await tx.organization.findFirst({ where: { id: orgId }, select: { autoArchiveSiblingsOnHire: true } })`; if `org.autoArchiveSiblingsOnHire`, `await tx.pipelineEntry.updateMany({ where: { organizationId: orgId, candidateId: existing.candidateId, archivedAt: null, id: { not: entryId } }, data: { archivedAt: new Date() } })`. Then the single recompute at the end of patchEntry (Task 4) yields `hired`. Also recompute any sibling candidates? No — siblings belong to the SAME candidate (they're the same candidate's other entries), so one recompute covers it.
  - **Job-close path** (in `updateJob`, when `dto.status === 'closed'` and the job is transitioning to closed): after setting the job data, collect the still-active entries `const active = await tx.pipelineEntry.findMany({ where: { jobId, organizationId: orgId, archivedAt: null }, select: { id: true, candidateId: true } })`; `await tx.pipelineEntry.updateMany({ where: { jobId, organizationId: orgId, archivedAt: null }, data: { archivedAt: new Date() } })`; then for each distinct `candidateId` in `active`, `await recomputeGlobalStage(tx, orgId, candidateId)`. (Do NOT archive entries already terminal-by-hire on this job — but per spec, closing archives still-*active* ones; a hired entry on this job keeps the candidate `hired` via recompute precedence since hired beats archived. To preserve a hired outcome, only archive entries whose stage category is NOT `hired` — add `status: { stage: { category: { not: 'hired' } } }` to the archive filter, so a candidate hired on the closing job stays hired.)

- [ ] **Step 4: Run, verify pass.**

- [ ] **Step 5: Commit** — `git add apps/api/src/pipeline && git commit -m "feat(pipeline): auto-archive siblings on hire + Available on job-close"`

---

## Task 6: Board excludes archived entries

**Files:**
- Modify: `apps/api/src/pipeline/pipeline.service.ts` (`getBoard`, and the `stageCountsFor`/`listJobs` counts)
- Test: `apps/api/src/pipeline/pipeline.service.spec.ts` (extend)

**Interfaces:** none new.

- [ ] **Step 1: Write failing test** — an entry with `archivedAt` set does not appear in any board column and is not counted.

```ts
it('getBoard omits archived entries from all columns', async () => {
  // entries: one active (visible), one archivedAt-set (hidden)
  const board = await service.getBoard(ctx, 'job1');
  const allRows = Object.values(board.columns).flat();
  expect(allRows.map((r) => r.entryId)).not.toContain('archived-entry');
});
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement** — add `archivedAt: null` to the `where` of the entry query in `getBoard` and in the count queries (`stageCountsFor`, `listJobs` groupBy source). Archived entries are simply out of the active board.

- [ ] **Step 4: Run, verify pass.**

- [ ] **Step 5: Commit** — `git add apps/api/src/pipeline && git commit -m "feat(pipeline): exclude archived entries from board + counts"`

---

## Task 7: Comms-send recompute hook (new -> in_review)

**Files:**
- Modify: `apps/api/src/candidate-emails/candidate-emails.service.ts` (`sendMessage`)
- Test: `apps/api/src/candidate-emails/candidate-emails.service.spec.ts` (extend)

**Interfaces:** Consumes `recomputeGlobalStage`.

- [ ] **Step 1: Write failing test** — after `sendMessage` records a candidate email, the candidate's globalStage is recomputed (a previously `new`, entry-less candidate becomes `in_review`). Match the service's existing tx-mock style.

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement** — after the email row is created inside `sendMessage`'s tx (or in a post-commit `forTenant` if send is post-commit), call `await recomputeGlobalStage(tx, orgId, candidateId)`. If `sendMessage` has no candidateId in scope (it takes an entryId), resolve the candidateId from the entry/email first. Keep it inside the same tenant tx.

- [ ] **Step 4: Run, verify pass.**

- [ ] **Step 5: Commit** — `git add apps/api/src/candidate-emails && git commit -m "feat(pipeline): recompute global stage after candidate email send"`

---

## Task 8: API — candidates globalStage filter + org auto-archive setting

**Files:**
- Modify: `apps/api/src/candidates/candidates.service.ts` (`list`), `candidates.controller.ts` (`@Query('globalStage')`)
- Modify: `apps/api/src/organizations/organizations.service.ts` + controller (get/set `autoArchiveSiblingsOnHire`, behind `pipelines:configure`)
- Test: both service specs

**Interfaces:**
- Produces: `CandidatesService.list(..., { globalStage?: GlobalStage })` filters `where.globalStage`; `GET /organizations/settings` (or extend existing) returns `autoArchiveSiblingsOnHire`; `PATCH` sets it.

- [ ] **Step 1: Write failing tests** — (a) `list` with `globalStage: 'available'` adds `globalStage: 'available'` to the Prisma `where`; (b) the org setting get/set round-trips and the setter requires `pipelines:configure` (assert the controller route carries `@RequirePermissions('pipelines:configure')`).

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement** — thread an optional `globalStage` through `CandidatesService.list` into the `where`; add the controller `@Query('globalStage')` param (validate against `GLOBAL_STAGES`). For the org setting, mirror how an existing org setting (e.g. branding or approvals gate) is read/written; add the boolean. Reuse the existing org settings controller if present; else add a small endpoint on the pipelines-config controller.

- [ ] **Step 4: Run, verify pass.**

- [ ] **Step 5: Commit** — `git add apps/api/src && git commit -m "feat(pipeline): candidates globalStage filter + org auto-archive setting API"`

---

## Task 9: Web — talent pool filter + Re-engage + auto-archive toggle

**Files:**
- Modify: `apps/web/app/v2/(recruiter)/candidates/page.tsx` (globalStage filter + default "Available" pool view + Re-engage action)
- Modify: `apps/web/app/v2/(recruiter)/settings/pipelines/page.tsx` (auto-archive toggle)
- Modify: `apps/web/lib/types.ts` (+`GlobalStage`) and `apps/web/lib/hooks/*` (candidates list filter param; org setting hook)
- Test: none (UI; browser-verified in Task 11). Extract any non-trivial helper with a unit test.

**Interfaces:** Consumes Task 8 endpoints.

- [ ] **Step 1: Candidates page** — add a `globalStage` filter control (options from `GLOBAL_STAGES` with friendly labels; include an "All" option). Add a preset **"Talent pool"** view = the list filtered to `globalStage=available`. Add a **Re-engage** row action that opens the existing add-to-job flow (create a `PipelineEntry` for that candidate on a chosen job) — reuse the job's add-candidate mutation; on success the candidate's stage recomputes to `engaged` server-side, so just refetch the list.
- [ ] **Step 2: Settings → Pipelines** — add an "Auto-archive other applications when a candidate is hired" toggle wired to the Task 8 org setting endpoint (default on).
- [ ] **Step 3: Types/hooks** — add `GlobalStage` to `lib/types.ts`; extend the candidates-list hook with the `globalStage` query param; add a `useOrgPipelineSettings()`/mutation for the toggle.
- [ ] **Step 4: Typecheck** `npx tsc -p apps/web/tsconfig.json --noEmit` — zero new source errors.
- [ ] **Step 5: Commit** — `git add apps/web && git commit -m "feat(pipeline-web): talent pool filter + Re-engage + auto-archive toggle"`

---

## Task 10: Category-aware hiring analytics (core + service)

**Files:**
- Modify: `apps/api/src/analytics/pipeline-analytics.ts` (funnel/isHired pivot on category)
- Modify: `apps/api/src/analytics/pipeline-analytics.service.ts` (`toEntryRow` carries category)
- Test: `apps/api/src/analytics/pipeline-analytics.spec.ts` + `pipeline-analytics.service.spec.ts` (update)

**Interfaces:**
- Produces: `EntryRow` gains `category: StageCategory` (replaces the name-based funnel key); funnel is a fixed **category order** `['active','offer','hired']` (rejected/archived are terminal, excluded from funnel progression); `isHired = category === 'hired' && !rejected`.

- [ ] **Step 1: Write/adjust failing tests** — a funnel computed from entries whose stage *names* are custom (e.g. "Take-home", "Final round") but whose categories are `active`/`offer`/`hired` still counts them in the Active→Offer→Hired funnel; an entry on a renamed stage is NOT dropped.

```ts
it('counts custom-named stages by category in the funnel', () => {
  const out = computeHiringAnalytics([
    row({ category: 'active' }), row({ category: 'offer' }), row({ category: 'hired' }),
  ], new Map());
  const hired = out.funnel.find((f) => f.stage === 'hired');
  expect(hired?.reached).toBe(1);
});
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement** — change `STAGE_ORDER` to `CATEGORY_ORDER = ['active','offer','hired'] as const`; `EntryRow.category: StageCategory`; `isHired = (e) => e.category === 'hired' && !e.rejected`; funnel reached counts use category rank (`reached[k] = count(categoryRank(e.category) >= k)`, with the last bucket = `isHired`). Update `toEntryRow` to set `category: r.status?.stage.category ?? 'active'` (drop the name-based `stage`, or keep `stage` name only for display labels). Keep source/job/time-to-hire logic (they already use `isHired`).

- [ ] **Step 4: Run, verify pass** (both analytics specs).

- [ ] **Step 5: Commit** — `git add apps/api/src/analytics && git commit -m "feat(analytics): category-aware hiring funnel (counts custom pipelines)"`

---

## Task 11: Web analytics labels + end-to-end browser verification

**Files:**
- Modify: `apps/web/app/v2/(recruiter)/analytics/hiring/page.tsx` (funnel labels = Active/Offer/Hired)
- Verification only otherwise.

- [ ] **Step 1:** Update the hiring funnel labels/rendering to the 3 category buckets (Active → Offer → Hired) matching the new API shape; typecheck web.
- [ ] **Step 2: Commit** — `git add apps/web && git commit -m "feat(analytics-web): category funnel labels"`
- [ ] **Step 3: Browser-verify** (dev servers already run; org_admin @ demo-org): (a) a candidate on a job → move to hired → their other active application auto-archives (disappears from that board), and they show `hired`; toggle the org setting off and confirm siblings are NOT archived. (b) Close a job with active candidates → those candidates appear in the **Talent pool** (Available) filter on the candidates page; **Re-engage** one onto another job → they become `engaged` and appear on that board. (c) A brand-new candidate with no applications shows `new`; email them → `in_review`. (d) Hiring analytics funnel counts a candidate sitting on a custom-named Tech stage. (e) Existing candidates' back-filled globalStage looks right.
- [ ] **Step 4:** Screenshot the talent-pool view + a hire-with-sibling-archive; capture results. Fix any bug (regression test first), then re-verify.

---

## Self-review notes (author)

- **Spec coverage:** §4.1 recompute precedence → T1; §4.2 hooks (addEntry/patchEntry/comms/job-close) → T4/T5/T7; auto-archive toggle → T2/T5/T8/T9; stored globalStage + backfill → T2/T3; board excludes archived → T6; pool filter + Re-engage → T8/T9; §5 API → T8; §6 web → T9. Category-aware analytics follow-up (not in spec, requested) → T10/T11.
- **Archiving model:** archived = `archivedAt` timestamp only (no archived-category stage required); board + counts + funnel all exclude archived; derivation frees archived candidates to `available`. Consistent across T3/T5/T6/T10.
- **No circular deps:** `recomputeGlobalStage` is a tx-taking function, not a service, so PipelineService/CandidateEmailsService call it without new DI edges.
- **Migration lessons baked into Global Constraints** (RLS bypass, EXEC-for-add-then-reference, drop-constraint-before-column) so the backfill doesn't repeat Phase A's DB-only failures.
- **Executor cautions:** confirm the newest migration's string column type + folder-naming; confirm how an existing org setting is read/written before adding the toggle endpoint; do not `npm install`.
