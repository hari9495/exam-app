# Configurable Pipeline — Phase A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded flat 5-stage pipeline with org-configurable **multiple named pipelines**, each a 2-level Stage→Status tree with typed-stage categories, without changing behavior for existing orgs.

**Architecture:** Three new org-scoped config tables (`Pipeline`/`PipelineStage`/`PipelineStatus`). `PipelineEntry.stage` (string) is replaced by `statusId` (FK); the entry's stage is derived via `status→stage`, and `category` (a fixed enum on each stage) becomes the stable semantic key that reports, comms, and the hired-event pivot on. A behavior-preserving migration seeds each org a default pipeline mirroring today's stages and maps every existing entry. Config is org_admin-only behind a new `pipelines:configure` permission.

**Tech Stack:** NestJS + Prisma + SQL Server (apps/api), Next.js 16 App Router + React 18 + ui-v2 (apps/web), shared package (`@exam-platform/shared`). Jest (api), tsc (web).

**Spec:** `docs/superpowers/specs/2026-09-04-configurable-pipeline-and-talent-pool-design.md` — read it alongside this plan. This plan implements **Phase A only** (spec §7); Phase B (talent pool: `Candidate.globalStage`, recompute, hooks, pool UI) is a separate follow-on plan that depends on this one's schema.

## Global Constraints

- **NEVER `npm install` in a git worktree** — worktree `node_modules` are junctions into main; npm deletes through them and has filled both drives before. Use the existing repo deps. To run api tests use the project's jest setup from `apps/api`; to type-check web use `tsc -p apps/web/tsconfig.json --noEmit`.
- **Multi-tenant RLS is mandatory** — every DB access goes through `TenantPrismaService.forTenant(context, tx => ...)`; every new table needs an RLS policy migration. Follow the split-migration idiom (tables file + RLS file) used by the approvals migration.
- **Stage `category` enum is fixed:** `active | offer | hired | rejected | archived` — copied verbatim, lives in `@exam-platform/shared`.
- **Behavior preservation:** after migration an org that never touches pipeline config must see byte-identical board/reports/comms behavior. The seeded default pipeline's stages are `applied`(active) · `screened`(active) · `interview`(active) · `offer`(offer) · `hired`(hired) · `rejected`(rejected), each with one same-named status, in that `position` order.
- **RBAC:** config endpoints require `@RequirePermissions('pipelines:configure')` (org_admin), mirroring `approvals:configure`. Entry moves keep `pipeline:manage`.
- **TDD:** write the failing test first, watch it fail, minimal implementation, watch it pass, commit. Frequent commits.

---

## File Structure

**Shared (`packages/shared/src/pipeline/`)** — new:
- `pipeline-categories.ts` — `STAGE_CATEGORIES` const + `StageCategory` type + `isTerminalCategory`.
- `pipeline-categories.spec.ts`.

**API (`apps/api/src/pipeline/`)** — new + modified:
- `pipelines.service.ts` (new) — config CRUD + guardrails + `getDefaultPipeline`/`resolveStatus`.
- `pipelines.controller.ts` (new) — config endpoints.
- `dto/*.dto.ts` (new) — create/patch pipeline/stage/status DTOs.
- `pipeline.service.ts` (modify) — `createJob` pipelineId, `patchEntry` statusId, board/counts pipeline-aware, hired-event on category.
- `pipeline.module.ts` (modify) — register `PipelinesService`/controller.
- delete `pipeline-stages.ts` + `pipeline-stages.spec.ts` (replaced by config).

**API migrations (`apps/api/prisma/migrations/`)** — new:
- `<ts>_configurable_pipeline_tables/migration.sql` — tables + Job/PipelineEntry columns.
- `<ts>_configurable_pipeline_rls/migration.sql` — RLS policies.
- `<ts>_configurable_pipeline_seed/migration.sql` — data migration (seed defaults + map entries + drop `stage`).

**Web (`apps/web/`)** — new + modified:
- `lib/hooks/usePipelines.ts` (new) — config hooks.
- `lib/types.ts` (modify) — remove `PIPELINE_STAGES`/`STAGE_LABEL`/`PipelineStage`; add pipeline config types + `STAGE_CATEGORIES`.
- `app/v2/(recruiter)/settings/pipelines/page.tsx` (new) — config editor.
- `app/v2/(recruiter)/jobs/PipelineBoard.tsx` (modify) — dynamic columns + status dropdown.
- `app/v2/(recruiter)/jobs/page.tsx` (modify) — pipeline picker in create modal + stage chips from pipeline.
- `app/v2/(recruiter)/message-templates/page.tsx` (modify) — trigger on stage FK.

---

## Task 1: Shared stage-category enum

**Files:**
- Create: `packages/shared/src/pipeline/pipeline-categories.ts`
- Test: `packages/shared/src/pipeline/pipeline-categories.spec.ts`
- Modify: `packages/shared/src/index.ts` (barrel export)

**Interfaces:**
- Produces: `STAGE_CATEGORIES: readonly ['active','offer','hired','rejected','archived']`; `type StageCategory`; `isTerminalCategory(c: StageCategory): boolean` (true for `hired|rejected|archived`).

- [ ] **Step 1: Write the failing test**

```ts
import { STAGE_CATEGORIES, isTerminalCategory } from './pipeline-categories';

describe('pipeline categories', () => {
  it('lists the five fixed categories in order', () => {
    expect(STAGE_CATEGORIES).toEqual(['active', 'offer', 'hired', 'rejected', 'archived']);
  });
  it('treats hired/rejected/archived as terminal, active/offer as not', () => {
    expect(isTerminalCategory('hired')).toBe(true);
    expect(isTerminalCategory('rejected')).toBe(true);
    expect(isTerminalCategory('archived')).toBe(true);
    expect(isTerminalCategory('active')).toBe(false);
    expect(isTerminalCategory('offer')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test, verify it fails** — Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```ts
export const STAGE_CATEGORIES = ['active', 'offer', 'hired', 'rejected', 'archived'] as const;
export type StageCategory = (typeof STAGE_CATEGORIES)[number];
const TERMINAL: ReadonlySet<StageCategory> = new Set(['hired', 'rejected', 'archived']);
export function isTerminalCategory(c: StageCategory): boolean {
  return TERMINAL.has(c);
}
```

Add to `packages/shared/src/index.ts`: `export * from './pipeline/pipeline-categories';`

- [ ] **Step 4: Run test, verify it passes.**

- [ ] **Step 5: Commit** — `git add packages/shared/src/pipeline packages/shared/src/index.ts && git commit -m "feat(pipeline): shared stage-category enum"`

---

## Task 2: Config tables + column additions (schema + migration SQL)

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (add 3 models + Job/PipelineEntry columns)
- Create: `apps/api/prisma/migrations/<ts>_configurable_pipeline_tables/migration.sql`
- Create: `apps/api/prisma/migrations/<ts>_configurable_pipeline_rls/migration.sql`

**Interfaces:**
- Produces Prisma models `Pipeline`, `PipelineStage`, `PipelineStatus`; `Job.pipelineId`; `PipelineEntry.statusId` + `archivedAt`. (`PipelineEntry.stage` stays for now — dropped in Task 3 after data is mapped.)

- [ ] **Step 1: Add models to `schema.prisma`** (after the `Job` model)

```prisma
model Pipeline {
  id             String          @id @default(uuid()) @db.UniqueIdentifier
  organizationId String          @map("organization_id") @db.UniqueIdentifier
  name           String          @db.NVarChar(200)
  isDefault      Boolean         @default(false) @map("is_default")
  createdAt      DateTime        @default(now()) @map("created_at")
  updatedAt      DateTime        @updatedAt @map("updated_at")
  stages         PipelineStage[]
  jobs           Job[]
  @@index([organizationId])
  @@map("pipelines")
}

model PipelineStage {
  id             String           @id @default(uuid()) @db.UniqueIdentifier
  organizationId String           @map("organization_id") @db.UniqueIdentifier
  pipelineId     String           @map("pipeline_id") @db.UniqueIdentifier
  name           String           @db.NVarChar(200)
  category       String           @db.NVarChar(20)
  position       Int
  pipeline       Pipeline         @relation(fields: [pipelineId], references: [id], onDelete: Cascade, onUpdate: NoAction)
  statuses       PipelineStatus[]
  @@index([pipelineId])
  @@map("pipeline_stages")
}

model PipelineStatus {
  id             String          @id @default(uuid()) @db.UniqueIdentifier
  organizationId String          @map("organization_id") @db.UniqueIdentifier
  stageId        String          @map("stage_id") @db.UniqueIdentifier
  name           String          @db.NVarChar(200)
  position       Int
  stage          PipelineStage   @relation(fields: [stageId], references: [id], onDelete: Cascade, onUpdate: NoAction)
  entries        PipelineEntry[]
  @@index([stageId])
  @@map("pipeline_statuses")
}
```

On `Job` add: `pipelineId String? @map("pipeline_id") @db.UniqueIdentifier` and `pipeline Pipeline? @relation(fields: [pipelineId], references: [id], onDelete: NoAction, onUpdate: NoAction)`.

On `PipelineEntry` add: `statusId String? @map("status_id") @db.UniqueIdentifier`, `archivedAt DateTime? @map("archived_at")`, and `status PipelineStatus? @relation(fields: [statusId], references: [id], onDelete: NoAction, onUpdate: NoAction)`. Keep the existing `stage` column for now.

- [ ] **Step 2: Write the tables migration** `<ts>_configurable_pipeline_tables/migration.sql`

```sql
CREATE TABLE [pipelines] (
  [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [pipelines_pkey] PRIMARY KEY,
  [organization_id] UNIQUEIDENTIFIER NOT NULL,
  [name] NVARCHAR(200) NOT NULL,
  [is_default] BIT NOT NULL CONSTRAINT [pipelines_is_default_df] DEFAULT 0,
  [created_at] DATETIME2 NOT NULL CONSTRAINT [pipelines_created_at_df] DEFAULT CURRENT_TIMESTAMP,
  [updated_at] DATETIME2 NOT NULL
);
CREATE INDEX [pipelines_organization_id_idx] ON [pipelines]([organization_id]);

CREATE TABLE [pipeline_stages] (
  [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [pipeline_stages_pkey] PRIMARY KEY,
  [organization_id] UNIQUEIDENTIFIER NOT NULL,
  [pipeline_id] UNIQUEIDENTIFIER NOT NULL,
  [name] NVARCHAR(200) NOT NULL,
  [category] NVARCHAR(20) NOT NULL,
  [position] INT NOT NULL,
  CONSTRAINT [pipeline_stages_pipeline_fk] FOREIGN KEY ([pipeline_id]) REFERENCES [pipelines]([id]) ON DELETE CASCADE
);
CREATE INDEX [pipeline_stages_pipeline_id_idx] ON [pipeline_stages]([pipeline_id]);

CREATE TABLE [pipeline_statuses] (
  [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [pipeline_statuses_pkey] PRIMARY KEY,
  [organization_id] UNIQUEIDENTIFIER NOT NULL,
  [stage_id] UNIQUEIDENTIFIER NOT NULL,
  [name] NVARCHAR(200) NOT NULL,
  [position] INT NOT NULL,
  CONSTRAINT [pipeline_statuses_stage_fk] FOREIGN KEY ([stage_id]) REFERENCES [pipeline_stages]([id]) ON DELETE CASCADE
);
CREATE INDEX [pipeline_statuses_stage_id_idx] ON [pipeline_statuses]([stage_id]);

ALTER TABLE [jobs] ADD [pipeline_id] UNIQUEIDENTIFIER NULL;
ALTER TABLE [pipeline_entries] ADD [status_id] UNIQUEIDENTIFIER NULL, [archived_at] DATETIME2 NULL;
ALTER TABLE [jobs] ADD CONSTRAINT [jobs_pipeline_fk] FOREIGN KEY ([pipeline_id]) REFERENCES [pipelines]([id]);
ALTER TABLE [pipeline_entries] ADD CONSTRAINT [pipeline_entries_status_fk] FOREIGN KEY ([status_id]) REFERENCES [pipeline_statuses]([id]);
```

- [ ] **Step 3: Write the RLS migration** `<ts>_configurable_pipeline_rls/migration.sql` — copy the exact RLS policy shape used by an existing org-scoped table (open the approvals RLS migration and mirror it) for `pipelines`, `pipeline_stages`, `pipeline_statuses`, each filtering on `organization_id = CAST(SESSION_CONTEXT(N'organizationId') AS UNIQUEIDENTIFIER)`. Example for one table (repeat for all three):

```sql
ALTER TABLE [pipelines] ENABLE ROW LEVEL SECURITY;
CREATE SECURITY POLICY [pipelines_rls]
  ADD FILTER PREDICATE [dbo].[fn_tenant_filter]([organization_id]) ON [dbo].[pipelines],
  ADD BLOCK PREDICATE [dbo].[fn_tenant_filter]([organization_id]) ON [dbo].[pipelines] AFTER INSERT
  WITH (STATE = ON);
```

(Use whatever the repo's existing tenant predicate function is actually named — check an existing `*_rls` migration; do not invent `fn_tenant_filter` if the repo uses a different name.)

- [ ] **Step 4: Regenerate the Prisma client** so the new models/fields are typed. Run the repo's prisma generate step (check `package.json` scripts, e.g. `npm run prisma:generate` or `npx prisma generate --schema apps/api/prisma/schema.prisma`). Expected: client types now include `pipeline`, `pipelineStage`, `pipelineStatus`.

- [ ] **Step 5: Commit** — `git add apps/api/prisma && git commit -m "feat(pipeline): config tables + entry status_id/archived_at columns + RLS"`

---

## Task 3: Data migration — seed default pipeline, map entries, drop `stage`

**Files:**
- Create: `apps/api/prisma/migrations/<ts>_configurable_pipeline_seed/migration.sql`
- Modify: `apps/api/prisma/schema.prisma` (remove `PipelineEntry.stage` after this migration)
- Test: `apps/api/src/pipeline/pipeline-seed-migration.spec.ts` (integration-style assertion on the mapping logic; if the repo has no DB-integration test harness, instead assert the seed SQL's mapping via a small pure helper — see Step 1)

**Interfaces:**
- Produces: every org has exactly one `is_default = 1` pipeline with 6 stages/statuses; every `pipeline_entries.status_id` populated; every `jobs.pipeline_id` populated.

- [ ] **Step 1: Write the failing test** for the entry→status mapping helper (the SQL calls the same mapping conceptually; the helper is what the app will also use when validating). Create `apps/api/src/pipeline/default-stage-map.ts` mapping the legacy stage string + rejected flag to a seeded stage key.

```ts
import { legacyStageToSeededStageKey } from './default-stage-map';

describe('legacyStageToSeededStageKey', () => {
  it('maps each legacy active stage to its same-named seeded stage', () => {
    expect(legacyStageToSeededStageKey('applied', false)).toBe('applied');
    expect(legacyStageToSeededStageKey('screened', false)).toBe('screened');
    expect(legacyStageToSeededStageKey('interview', false)).toBe('interview');
    expect(legacyStageToSeededStageKey('offer', false)).toBe('offer');
    expect(legacyStageToSeededStageKey('hired', false)).toBe('hired');
  });
  it('maps any rejected entry to the rejected stage regardless of stage', () => {
    expect(legacyStageToSeededStageKey('interview', true)).toBe('rejected');
    expect(legacyStageToSeededStageKey('applied', true)).toBe('rejected');
  });
});
```

- [ ] **Step 2: Run test, verify it fails.**

- [ ] **Step 3: Implement `default-stage-map.ts`**

```ts
export const DEFAULT_PIPELINE_STAGES = [
  { key: 'applied', category: 'active' },
  { key: 'screened', category: 'active' },
  { key: 'interview', category: 'active' },
  { key: 'offer', category: 'offer' },
  { key: 'hired', category: 'hired' },
  { key: 'rejected', category: 'rejected' },
] as const;

export function legacyStageToSeededStageKey(stage: string, rejected: boolean): string {
  if (rejected) return 'rejected';
  const found = DEFAULT_PIPELINE_STAGES.find((s) => s.key === stage);
  return found ? found.key : 'applied';
}
```

- [ ] **Step 4: Run test, verify it passes.**

- [ ] **Step 5: Write the seed migration SQL** `<ts>_configurable_pipeline_seed/migration.sql`. It must be **idempotent** (guarded on "org has no pipeline yet"). Because SQL Server has no per-org loop primitive here, use a set-based approach: (a) insert one default pipeline per org that has none; (b) insert the 6 stages per new default pipeline; (c) insert one status per stage (same name); (d) set `jobs.pipeline_id` to the org's default; (e) set `pipeline_entries.status_id` by joining legacy `stage`/`rejected` to the seeded status. Sketch:

```sql
-- (a) one default pipeline per org lacking one
INSERT INTO [pipelines] (id, organization_id, name, is_default, updated_at)
SELECT NEWID(), o.id, 'Default Pipeline', 1, CURRENT_TIMESTAMP
FROM [organizations] o
WHERE NOT EXISTS (SELECT 1 FROM [pipelines] p WHERE p.organization_id = o.id);

-- (b) stages for each brand-new default pipeline (6 rows via a VALUES join)
INSERT INTO [pipeline_stages] (id, organization_id, pipeline_id, name, category, position)
SELECT NEWID(), p.organization_id, p.id, s.name, s.category, s.position
FROM [pipelines] p
CROSS JOIN (VALUES
  ('applied','active',0),('screened','active',1),('interview','active',2),
  ('offer','offer',3),('hired','hired',4),('rejected','rejected',5)
) AS s(name, category, position)
WHERE p.is_default = 1
  AND NOT EXISTS (SELECT 1 FROM [pipeline_stages] st WHERE st.pipeline_id = p.id);

-- (c) one status per stage, same name
INSERT INTO [pipeline_statuses] (id, organization_id, stage_id, name, position)
SELECT NEWID(), st.organization_id, st.id, st.name, 0
FROM [pipeline_stages] st
WHERE NOT EXISTS (SELECT 1 FROM [pipeline_statuses] su WHERE su.stage_id = st.id);

-- (d) jobs.pipeline_id -> org default
UPDATE j SET j.pipeline_id = p.id
FROM [jobs] j
JOIN [pipelines] p ON p.organization_id = j.organization_id AND p.is_default = 1
WHERE j.pipeline_id IS NULL;

-- (e) entry.status_id from legacy stage/rejected
UPDATE e SET e.status_id = su.id
FROM [pipeline_entries] e
JOIN [pipelines] p ON p.organization_id = e.organization_id AND p.is_default = 1
JOIN [pipeline_stages] st ON st.pipeline_id = p.id
  AND st.name = CASE WHEN e.rejected = 1 THEN 'rejected'
                     WHEN e.stage IN ('applied','screened','interview','offer','hired') THEN e.stage
                     ELSE 'applied' END
JOIN [pipeline_statuses] su ON su.stage_id = st.id
WHERE e.status_id IS NULL;
```

(Confirm the organizations table name — check `schema.prisma` `@@map` for the org model — and use it verbatim.)

- [ ] **Step 6: Drop the legacy `stage` column** — append to the same migration: `ALTER TABLE [pipeline_entries] DROP COLUMN [stage];` Then remove `stage String @default("applied")` from `PipelineEntry` in `schema.prisma` and regenerate the client.

- [ ] **Step 7: Run the mapping test again + typecheck** — Expected: PASS; `tsc` on api has no references to `.stage` on `PipelineEntry` yet failing (later tasks fix call sites — if the build breaks here, that's expected and Task 4+ resolve it; commit the migration + helper now regardless since they're self-contained).

- [ ] **Step 8: Commit** — `git add apps/api/prisma apps/api/src/pipeline/default-stage-map.ts apps/api/src/pipeline/default-stage-map.spec.ts && git commit -m "feat(pipeline): seed default pipeline, map entries, drop legacy stage column"`

---

## Task 4: PipelinesService — config CRUD + guardrails

**Files:**
- Create: `apps/api/src/pipeline/pipelines.service.ts`
- Create: `apps/api/src/pipeline/dto/create-pipeline.dto.ts`, `dto/update-stage.dto.ts`, `dto/update-status.dto.ts`
- Test: `apps/api/src/pipeline/pipelines.service.spec.ts`
- Modify: `apps/api/src/pipeline/pipeline.module.ts` (provide `PipelinesService`)

**Interfaces:**
- Consumes: `TenantPrismaService`, `AuditService`, `STAGE_CATEGORIES` (Task 1).
- Produces:
  - `listPipelines(ctx): Promise<PipelineWithStages[]>` where `PipelineWithStages = Pipeline & { stages: (PipelineStage & { statuses: PipelineStatus[] })[] }`
  - `getDefaultPipeline(ctx): Promise<PipelineWithStages>`
  - `createPipeline(ctx, actor, { name }): Promise<Pipeline>` (new pipeline starts with a copy of the default's stages/statuses)
  - `createStage(ctx, actor, pipelineId, { name, category, position }): Promise<PipelineStage>`
  - `updateStage(ctx, actor, stageId, { name?, category?, position? }): Promise<PipelineStage>`
  - `deleteStage(ctx, actor, stageId): Promise<void>` (throws `ConflictException` if it has entries; `BadRequestException` if it would drop the last `hired`/`rejected` stage)
  - status equivalents `createStatus`/`updateStatus`/`deleteStatus`
  - `deletePipeline(ctx, actor, pipelineId): Promise<void>` (throws if `isDefault`)
  - `resolveStatus(ctx, statusId): Promise<{ status: PipelineStatus; stage: PipelineStage } | null>` (used by patchEntry validation, Task 6)

- [ ] **Step 1: Write failing tests** covering the load-bearing guardrails:

```ts
// pipelines.service.spec.ts — mock TenantPrismaService.forTenant to run the callback with a fake tx.
describe('PipelinesService guardrails', () => {
  it('refuses to delete the default pipeline', async () => {
    // arrange tx.pipeline.findFirst -> { id: 'p1', isDefault: true }
    await expect(service.deletePipeline(ctx, 'u1', 'p1')).rejects.toThrow(/default/i);
  });
  it('refuses to delete a stage that still has entries', async () => {
    // tx.pipelineEntry.count -> 3
    await expect(service.deleteStage(ctx, 'u1', 's1')).rejects.toThrow(/entr/i);
  });
  it('refuses to delete the last hired-category stage', async () => {
    // stage s1 category 'hired'; sibling stages have no other 'hired'
    await expect(service.deleteStage(ctx, 'u1', 's1')).rejects.toThrow(/hired/i);
  });
  it('rejects an invalid category on createStage', async () => {
    await expect(service.createStage(ctx, 'u1', 'p1', { name: 'X', category: 'bogus' as any, position: 0 }))
      .rejects.toThrow(/category/i);
  });
});
```

- [ ] **Step 2: Run tests, verify they fail.**

- [ ] **Step 3: Implement `PipelinesService`** — mirror `ApprovalsService` structure (constructor injects `TenantPrismaService` + `AuditService`; every method wraps `this.tenantPrisma.forTenant(ctx, tx => ...)`; audit each mutation via `this.audit.record`). Guardrails:
  - `createStage`/`updateStage`: validate `category` ∈ `STAGE_CATEGORIES` → else `BadRequestException`.
  - `deleteStage`: `const n = await tx.pipelineEntry.count({ where: { status: { stageId } } })`; if `n > 0` → `ConflictException`. Load sibling stages of the same pipeline; if the target's category is `hired` or `rejected` and no sibling shares it → `BadRequestException`.
  - `deletePipeline`: load pipeline; if `isDefault` → `BadRequestException`.
  - `createPipeline`: create the pipeline, then deep-copy the default pipeline's stages+statuses into it (so a new pipeline is usable immediately and always has hired+rejected).
  - `resolveStatus`: `tx.pipelineStatus.findFirst({ where: { id: statusId, organizationId }, include: { stage: true } })`.

- [ ] **Step 4: Run tests, verify they pass.**

- [ ] **Step 5: Register in `pipeline.module.ts`** (add to `providers` and `exports`). Typecheck api.

- [ ] **Step 6: Commit** — `git add apps/api/src/pipeline && git commit -m "feat(pipeline): PipelinesService config CRUD + guardrails"`

---

## Task 5: Pipelines controller + RBAC + `pipelines:configure` permission

**Files:**
- Create: `apps/api/src/pipeline/pipelines.controller.ts`
- Test: `apps/api/src/pipeline/pipelines.controller.spec.ts`
- Modify: wherever permission keys are registered/seeded (grep for `'approvals:configure'` — add `'pipelines:configure'` alongside it in the same place, incl. org_admin role mapping)
- Modify: `apps/api/src/pipeline/pipeline.module.ts` (add controller)

**Interfaces:**
- Consumes: `PipelinesService` (Task 4).
- Produces HTTP routes (all `@UseGuards(JwtAuthGuard, PermissionsGuard)` + `@RequirePermissions('pipelines:configure')`):
  - `GET /pipelines` → `listPipelines`
  - `POST /pipelines` `{ name }` → `createPipeline`
  - `DELETE /pipelines/:id`
  - `POST /pipelines/:id/stages` `{ name, category, position }`
  - `PATCH /pipelines/stages/:stageId` `{ name?, category?, position? }`
  - `DELETE /pipelines/stages/:stageId`
  - `POST /pipelines/stages/:stageId/statuses` `{ name, position }`
  - `PATCH /pipelines/statuses/:statusId` `{ name?, position? }`
  - `DELETE /pipelines/statuses/:statusId`

- [ ] **Step 1: Write failing test** — assert the controller delegates and is decorated. Follow the approvals controller spec pattern (mock the service, call the handler, assert the service method was called with the tenant context + actor). Also assert `Reflect.getMetadata` for the permissions decorator on one route equals `['pipelines:configure']` (copy how the approvals controller spec asserts its guard, if it does).

```ts
it('POST /pipelines delegates to createPipeline', async () => {
  service.createPipeline.mockResolvedValue({ id: 'p2' });
  const res = await controller.create(ctxReq, { name: 'Tech' });
  expect(service.createPipeline).toHaveBeenCalledWith(expect.anything(), 'user-1', { name: 'Tech' });
  expect(res).toEqual({ id: 'p2' });
});
```

- [ ] **Step 2: Run test, verify it fails.**

- [ ] **Step 3: Implement the controller** mirroring `approvals.controller.ts` (extract `TenantContext` + `actorUserId` from the request the same way). Add `'pipelines:configure'` to the permission registry + org_admin role wherever `'approvals:configure'` lives.

- [ ] **Step 4: Run test, verify it passes.**

- [ ] **Step 5: Register controller in `pipeline.module.ts`. Typecheck.**

- [ ] **Step 6: Commit** — `git add apps/api && git commit -m "feat(pipeline): pipelines config controller + pipelines:configure permission"`

---

## Task 6: `createJob` pipeline selection + `patchEntry` statusId

**Files:**
- Modify: `apps/api/src/pipeline/pipeline.service.ts` (`createJob`, `patchEntry`, `addEntry`)
- Modify: `apps/api/src/pipeline/dto/patch-entry.dto.ts` (replace `stage` with `statusId`), `dto/add-entry.dto.ts`
- Test: `apps/api/src/pipeline/pipeline.service.spec.ts` (extend)

**Interfaces:**
- Consumes: `PipelinesService.getDefaultPipeline`, `PipelinesService.resolveStatus` (Task 4).
- Produces: `createJob` sets `pipelineId` (dto value if org-owned, else org default); `addEntry` sets `statusId` to the job's pipeline's first `active`-category stage's first status; `patchEntry({ statusId })` validates + maintains `rejected`/`archivedAt` mirror from the status's stage `category`.

- [ ] **Step 1: Write failing tests**

```ts
it('addEntry places a new candidate at the first active status of the job\'s pipeline', async () => {
  // job has pipelineId p1 whose first active stage 'applied' has status 'applied' (id st-app)
  const entry = await service.addEntry(ctx, 'u1', 'job1', { candidateId: 'c1', enteredVia: 'manual' });
  expect(entry.statusId).toBe('st-app');
});

it('patchEntry sets rejected mirror true when moving to a rejected-category status', async () => {
  // resolveStatus('st-rej') -> { status, stage: { category: 'rejected' } }
  const { entry } = await service.patchEntry(ctx, 'u1', 'e1', { statusId: 'st-rej' });
  expect(entry.rejected).toBe(true);
  expect(entry.archivedAt).toBeNull();
});

it('patchEntry sets archivedAt when moving to an archived-category status', async () => {
  const { entry } = await service.patchEntry(ctx, 'u1', 'e1', { statusId: 'st-arch' });
  expect(entry.archivedAt).toBeInstanceOf(Date);
});

it('patchEntry rejects a status that does not belong to the job\'s pipeline', async () => {
  // resolveStatus returns a status whose stage.pipelineId != job.pipelineId
  await expect(service.patchEntry(ctx, 'u1', 'e1', { statusId: 'st-other' }))
    .rejects.toThrow(/pipeline/i);
});
```

- [ ] **Step 2: Run tests, verify they fail.**

- [ ] **Step 3: Implement.**
  - `createJob`: after the existing requisition-gate logic, resolve `pipelineId = dto.pipelineId (validated org-owned) ?? (await pipelines.getDefaultPipeline(ctx)).id` and persist it.
  - `addEntry`: load the job's pipeline (`include: { pipeline: { include: { stages: { include: { statuses: true }, orderBy: { position: 'asc' } } } } }`), pick the first stage with `category==='active'` (fallback: first stage), then its first status by `position`; set `statusId`.
  - `patchEntry`: change the `dto.stage` branch to `dto.statusId`. Resolve via `pipelines.resolveStatus`; if null or `stage.pipelineId !== entry.job.pipelineId` → `BadRequestException('status does not belong to the job pipeline')`. Compute `category`. Set `data = { statusId, rejected: category === 'rejected', rejectedReason: category === 'rejected' ? (dto.reason ?? null) : null, rejectedAt: category === 'rejected' ? new Date() : null, archivedAt: category === 'archived' ? new Date() : null }`. Keep the `dto.rejected === true/false` branches for back-compat (rejection without picking a status still works: it should move the entry to the pipeline's first `rejected`-category status — resolve and set `statusId` accordingly).

- [ ] **Step 4: Run tests, verify they pass.**

- [ ] **Step 5: Commit** — `git add apps/api/src/pipeline && git commit -m "feat(pipeline): job pipeline selection + entry statusId with category mirror"`

---

## Task 7: Board + counts pipeline-aware; hired-event on category

**Files:**
- Modify: `apps/api/src/pipeline/pipeline.service.ts` (`getBoard`, the `JobWithCounts`/`listJobs` counts, the `candidate.hired` emit)
- Test: `apps/api/src/pipeline/pipeline.service.spec.ts` (extend)

**Interfaces:**
- Produces: `getBoard` returns `{ pipeline: { stages: {id,name,category,position, statuses:{id,name,position}[] }[] }, columns: Record<stageId, BoardRow[]> }` (dynamic, replaces the fixed `stages: Record<PipelineStage, ...>` + `rejected`). `BoardRow` gains `statusId` + `stageId` + `category`. Counts become `{ byStageId: Record<string, number>, byCategory: Record<StageCategory, number> }`.

- [ ] **Step 1: Write failing tests**

```ts
it('getBoard groups entries by the job pipeline\'s stages', async () => {
  const board = await service.getBoard(ctx, 'job1');
  expect(board.pipeline.stages.map((s) => s.name)).toEqual(['applied','screened','interview','offer','hired','rejected']);
  expect(board.columns['st-app'].map((r) => r.candidateId)).toContain('c1');
});
it('counts roll up by category across custom stage names', async () => {
  const { byCategory } = await service.stageCountsFor(ctx, 'job1');
  expect(byCategory.hired).toBe(2);
});
it('emits candidate.hired when moving into any hired-category status', async () => {
  await service.patchEntry(ctx, 'u1', 'e1', { statusId: 'st-hired' }); // stage category hired
  expect(integrationEvents.emit).toHaveBeenCalledWith(expect.anything(), 'candidate.hired', expect.anything());
});
```

- [ ] **Step 2: Run tests, verify they fail.**

- [ ] **Step 3: Implement.**
  - `getBoard`: load the job with its pipeline (stages+statuses ordered), load entries with `include: { status: { include: { stage: true } } }`, group rows into `columns[stageId]`. Build `BoardRow` with `statusId`, `stageId`, `category` from `entry.status.stage`.
  - counts: replace `emptyStageCounts`/`PIPELINE_STAGES` loops with a walk over the pipeline's stages producing `byStageId` and a `byCategory` reduction (`isTerminalCategory` etc. from Task 1).
  - hired-event: change the guard from `dto.stage === 'hired' && previousStage !== 'hired'` to "the new status's stage category is `hired` and the previous status's category was not `hired`" (fetch previous category before the update, as `patchEntry` already captures `previousStage`).

- [ ] **Step 4: Run tests, verify they pass.**

- [ ] **Step 5: Commit** — `git add apps/api/src/pipeline && git commit -m "feat(pipeline): dynamic board + category rollup counts + hired-event on category"`

---

## Task 8: Comms template triggers → stage FK; delete legacy stage constants

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (`CandidateEmailTemplate.triggerEvent` → add `triggerStageId String?`; keep `triggerEvent` column briefly for migration then drop)
- Create: `apps/api/prisma/migrations/<ts>_comms_trigger_stage/migration.sql`
- Modify: `apps/api/src/candidate-emails/candidate-email-templates.service.ts` (`resolveForEvent` → `resolveForStage`), `dto/upsert-template.dto.ts`
- Delete: `apps/api/src/pipeline/pipeline-stages.ts` + `.spec.ts`
- Modify: `apps/api/src/pipeline/pipeline.service.ts` (the comms hook in `patchEntry` calls `resolveForStage(stageId)`)
- Test: `apps/api/src/candidate-emails/candidate-email-templates.service.spec.ts`

**Interfaces:**
- Produces: `CandidateEmailTemplatesService.resolveForStage(ctx, stageId): Promise<Template | null>`; template DTO takes `triggerStageId` (a `PipelineStage` id) instead of a stage-name string.

- [ ] **Step 1: Write the migration** `<ts>_comms_trigger_stage/migration.sql`: add `trigger_stage_id UNIQUEIDENTIFIER NULL` to `candidate_email_templates`; back-fill by joining the old `trigger_event` name to the default pipeline's stage of that name (and `'rejected'` → the rejected stage) per org; then `DROP COLUMN [trigger_event]`.

```sql
ALTER TABLE [candidate_email_templates] ADD [trigger_stage_id] UNIQUEIDENTIFIER NULL;
UPDATE t SET t.trigger_stage_id = st.id
FROM [candidate_email_templates] t
JOIN [pipelines] p ON p.organization_id = t.organization_id AND p.is_default = 1
JOIN [pipeline_stages] st ON st.pipeline_id = p.id AND st.name = t.trigger_event
WHERE t.trigger_event IS NOT NULL;
ALTER TABLE [candidate_email_templates] DROP COLUMN [trigger_event];
```

Update `schema.prisma` accordingly (remove `triggerEvent`, add `triggerStageId` + optional relation), regenerate client.

- [ ] **Step 2: Write failing test** for `resolveForStage`:

```ts
it('resolveForStage returns the enabled template whose triggerStageId matches', async () => {
  // tx.candidateEmailTemplate.findFirst -> template with triggerStageId 'st-hired'
  const tpl = await service.resolveForStage(ctx, 'st-hired');
  expect(tpl?.id).toBe('tpl-1');
});
```

- [ ] **Step 3: Run test, verify it fails.**

- [ ] **Step 4: Implement** `resolveForStage` (query by `triggerStageId` + `enabled: true`). In `pipeline.service.ts` `patchEntry` comms hook, replace `resolveForEvent(context, event)` with `resolveForStage(context, stageId)` (the new status's stageId). Delete `pipeline-stages.ts` + spec and fix any remaining imports (grep `pipeline-stages`).

- [ ] **Step 5: Run tests + full api typecheck** — Expected: no remaining references to `PIPELINE_STAGES`/`isValidStage` in api; PASS.

- [ ] **Step 6: Commit** — `git add apps/api && git commit -m "feat(pipeline): comms triggers reference stage FK; remove flat-stage constants (api)"`

---

## Task 9: Web config hooks + types

**Files:**
- Create: `apps/web/lib/hooks/usePipelines.ts`
- Modify: `apps/web/lib/types.ts` (remove `PIPELINE_STAGES`, `PipelineStage`, `STAGE_LABEL`; add `StageCategory`, `Pipeline`, `PipelineStage`, `PipelineStatus`, `BoardData` types)
- Test: `apps/web/lib/hooks/usePipelines.spec.ts` (follow the `useApprovals` hook test pattern)

**Interfaces:**
- Produces React Query hooks: `usePipelines()`, `useCreatePipeline()`, `useCreateStage()`, `useUpdateStage()`, `useDeleteStage()`, `useCreateStatus()`, `useUpdateStatus()`, `useDeleteStatus()`, `useDeletePipeline()`. Mutations invalidate the `['pipelines']` query key (verify this key matches the query — the approvals feature shipped a bug where invalidation keys didn't match; assert it in the test).

- [ ] **Step 1: Write failing test** asserting `useCreateStage` invalidates `['pipelines']` on success (mirror the regression test added for `useDecideApproval`).

- [ ] **Step 2: Run test, verify it fails.**

- [ ] **Step 3: Implement hooks** (fetch wrappers to the Task 5 endpoints; queryKey `['pipelines']`; each mutation `onSuccess` → `queryClient.invalidateQueries({ queryKey: ['pipelines'] })`). Replace removed type exports; grep the web app for `PIPELINE_STAGES`/`STAGE_LABEL`/`PipelineStage` and note the call sites for Tasks 10-11.

- [ ] **Step 4: Run test, verify it passes.**

- [ ] **Step 5: Commit** — `git add apps/web/lib && git commit -m "feat(pipeline-web): config hooks + types; drop flat-stage constants (web)"`

---

## Task 10: Web — Settings → Pipelines editor

**Files:**
- Create: `apps/web/app/v2/(recruiter)/settings/pipelines/page.tsx`
- Test: none (UI page; covered by browser verification). If a component holds non-trivial logic (e.g. reorder), extract it to a pure helper with a unit test.

**Interfaces:**
- Consumes: `usePipelines` + mutation hooks (Task 9), ui-v2 primitives (Button, TextField, Combobox, DataTable) — mirror `settings/approvals/page.tsx`.

- [ ] **Step 1: Build the page** — pipeline list (create/delete), and for the selected pipeline a stage/status editor: add/rename/reorder stages (each with a category Combobox from `STAGE_CATEGORIES`) and add/rename/reorder statuses under each. Reuse the Approvals settings page layout + the org-primary tokens. Guard the whole page behind the `pipelines:configure` permission the same way the Approvals page guards `approvals:configure`.

- [ ] **Step 2: Typecheck web** (`tsc -p apps/web/tsconfig.json --noEmit`, filter to source errors as the approvals tasks did).

- [ ] **Step 3: Commit** — `git add apps/web/app && git commit -m "feat(pipeline-web): settings pipelines editor"`

---

## Task 11: Web — job pipeline picker, dynamic board, stage chips, template trigger

**Files:**
- Modify: `apps/web/app/v2/(recruiter)/jobs/page.tsx` (create-modal pipeline picker; stage chips from the job's counts)
- Modify: `apps/web/app/v2/(recruiter)/jobs/PipelineBoard.tsx` (dynamic columns from `board.pipeline.stages`; per-card status dropdown → `patchEntry({ statusId })`)
- Modify: `apps/web/app/v2/(recruiter)/message-templates/page.tsx` (trigger picker → a stage from a pipeline instead of the removed `PIPELINE_STAGES`)

**Interfaces:**
- Consumes: `usePipelines`, updated board hook returning `{ pipeline, columns }` (Task 7 shape), `useCreateJob` extended with `pipelineId`.

- [ ] **Step 1: Job create modal** — add a pipeline `<Combobox>` (options from `usePipelines`, default = the `isDefault` pipeline). Pass `pipelineId` into the create mutation.

- [ ] **Step 2: PipelineBoard** — render one column per `board.pipeline.stages` (ordered), each listing `board.columns[stage.id]`; give each card a status `<select>` of that stage's statuses; moving a card (drag or status change) calls `patchEntry({ statusId })`. Remove all `PIPELINE_STAGES.map`/`STAGE_LABEL` usage.

- [ ] **Step 3: Job list stage chips** — build chips from the job's `byStageId`/pipeline stage names (or `byCategory` rollup) instead of `PIPELINE_STAGES`.

- [ ] **Step 4: message-templates trigger** — the trigger picker becomes: pick a pipeline, then a stage within it (writes `triggerStageId`); keep a "None (manual only)" option.

- [ ] **Step 5: Typecheck web** — Expected: no remaining references to the removed constants; source errors clean.

- [ ] **Step 6: Commit** — `git add apps/web/app && git commit -m "feat(pipeline-web): job pipeline picker + dynamic board + template stage trigger"`

---

## Task 12: End-to-end browser verification

**Files:** none (verification task).

- [ ] **Step 1:** Start the dev server (preview_start with the web config) and log in as an org_admin (assistant pre-fills org slug + email; the user types the password).
- [ ] **Step 2:** Settings → Pipelines: create a 2nd pipeline "Tech", add a custom stage/status (e.g. stage "Take-home" (active) with statuses "Sent"/"Reviewed"), reorder, save; confirm persistence on reload.
- [ ] **Step 3:** Create a job on the "Tech" pipeline; confirm the board shows the custom columns.
- [ ] **Step 4:** Add a candidate → lands in the first active status; move across custom statuses; move to a hired status → confirm a `candidate.hired` webhook/integration event fires (check `read_network_requests`/logs) and the rejected mirror behaves when moved to Rejected.
- [ ] **Step 5:** Confirm an existing job (default pipeline) still shows the original 5 columns + Rejected, and its counts/reports are unchanged (behavior-preservation check).
- [ ] **Step 6:** Configure a stage-triggered email template on a specific stage; move a candidate into it; confirm the prompt/auto-send fires.
- [ ] **Step 7:** Capture a screenshot of the custom board and note results. Fix any bug found (add a regression test first), then re-verify.

---

## Self-review notes (author)

- **Spec coverage:** §3 tables → T2; §3.3 migration → T3; §4.3 board/counts/comms/event pipeline-aware → T7/T8; §5 API + RBAC → T4/T5/T6; §6 web → T9/T10/T11; behavior preservation → T3 + T12 step 5. Phase B (§ candidate globalStage, hooks, pool) intentionally excluded — separate plan.
- **Back-compat:** `rejected` mirror maintained in T6; existing readers untouched. Legacy `stage` column dropped only after T3 maps data; flat constants removed only after all call sites migrate (T8 api, T9/T11 web).
- **Deferred to Phase B:** `Candidate.globalStage`, `recomputeGlobalStage`, addEntry/comms/job-close hooks, auto-archive-on-hire, talent-pool filter + Re-engage, the `autoArchiveSiblingsOnHire` setting.
- **Executor cautions:** confirm the real RLS predicate function name, the organizations table `@@map`, and the repo's prisma-generate + jest commands before running the DB tasks (do not `npm install` in a worktree).
