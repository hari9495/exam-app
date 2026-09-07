# Recycle Bin (Zoho #12) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the four top-level hard-deletes (Candidate, Job, Pipeline, WalkInGroup) to soft-delete, hide soft-deleted rows from all normal reads via a global Prisma `$extends` filter, expose an admin Recycle Bin (list / restore / delete-forever), and auto-purge after 30 days.

**Architecture:** Additive `deletedAt`/`deletedByUserId` columns; a Prisma client extension filters `deletedAt: null` on reads of the four models (fires inside `forTenant`'s interactive tx — spike-verified on Prisma 5.22.0); `TenantPrismaService` holds a filtered client (normal path) + a new `forTenantIncludingDeleted` (raw path, for bin/restore/purge); a scheduled service hard-deletes rows past retention.

**Tech Stack:** NestJS, Prisma 5.22 (`$extends`), SQL Server (RLS via SESSION_CONTEXT), Next.js (apps/web), Jest.

**Spec:** docs/superpowers/specs/2026-09-06-recycle-bin-design.md

## Global Constraints

- **Base:** branch `feat/recycle-bin` off origin/main @ `fec52f3c`. Work in the main checkout, NOT a worktree (junction disk-fill hazard).
- **NEVER** run `npm install` / `npm ci` / `npm update`. Use only `npx prisma generate` / `npx prisma migrate deploy` / existing `jest` / `tsc`. To rebuild the shared dist use its BUILD script (a build, not an install).
- **`packages/shared` has its OWN jest runner** — apps/api jest does NOT cover shared specs. Run packages/shared jest whenever shared code changes (T2, T3), and rebuild the shared dist after.
- **Four soft-delete models ONLY:** `Candidate`, `Job`, `Pipeline`, `WalkInGroup`. Questions are OUT (no hard-delete; archive is their path). Do not add soft-delete to any other model.
- **SQL Server:** additive columns on already-RLS tables need NO `_rls` migration. Use `DATETIME2 NULL` for `deleted_at` and `UNIQUEIDENTIFIER NULL` for `deleted_by_user_id` (matches Prisma's `DateTime?` / `String? @db.UniqueIdentifier` mapping). Migration number `20260906150000` (sorts after everything on origin/main + parked branches).
- **No new permission / no seed change** — bin is gated with the existing `org:manage_settings`.
- **Preserve existing delete guards** (e.g. candidate invitation-count ConflictException) and existing audit calls.
- **Do not weaken tenant RLS or the existing session-context set/reset.** `forTenantIncludingDeleted` sets the SAME session context as `forTenant` and resets it identically.
- Attribution footer on every commit: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

### Task 1: Soft-delete columns + migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (models `Candidate`, `Job`, `Pipeline`, `WalkInGroup`)
- Create: `apps/api/prisma/migrations/20260906150000_recycle_bin_soft_delete/migration.sql`

**Interfaces:**
- Produces: `deletedAt: Date | null` + `deletedByUserId: string | null` on the four models; columns `deleted_at DATETIME2 NULL`, `deleted_by_user_id UNIQUEIDENTIFIER NULL` on `candidates`, `jobs`, `pipelines`, `walk_in_groups`.

- [ ] **Step 1: Add fields to each of the four models.** In each model add:
```prisma
deletedAt       DateTime? @map("deleted_at")
deletedByUserId String?   @map("deleted_by_user_id") @db.UniqueIdentifier
```
(Confirm the exact table `@@map` names: `candidates`, `jobs`, `pipelines`, `walk_in_groups` — check each model's `@@map`.)

- [ ] **Step 2: Author the migration SQL** at `apps/api/prisma/migrations/20260906150000_recycle_bin_soft_delete/migration.sql`:
```sql
ALTER TABLE [dbo].[candidates] ADD [deleted_at] DATETIME2 NULL, [deleted_by_user_id] UNIQUEIDENTIFIER NULL;
ALTER TABLE [dbo].[jobs] ADD [deleted_at] DATETIME2 NULL, [deleted_by_user_id] UNIQUEIDENTIFIER NULL;
ALTER TABLE [dbo].[pipelines] ADD [deleted_at] DATETIME2 NULL, [deleted_by_user_id] UNIQUEIDENTIFIER NULL;
ALTER TABLE [dbo].[walk_in_groups] ADD [deleted_at] DATETIME2 NULL, [deleted_by_user_id] UNIQUEIDENTIFIER NULL;
```
(Verify each `@@map` name against schema.prisma before writing; correct any that differ.)

- [ ] **Step 3: Apply + regenerate.** From `apps/api`: `npx prisma migrate deploy` then `npx prisma generate`. Expected: migration applied; client has the new fields.

- [ ] **Step 4: Typecheck.** `npx tsc -p apps/api/tsconfig.json --noEmit`. Expected: clean.

- [ ] **Step 5: Commit.**
```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260906150000_recycle_bin_soft_delete
git commit -m "feat(recycle-bin): soft-delete columns on candidate/job/pipeline/walk-in-group"
```

---

### Task 2: Soft-delete registry + `$extends` extension (shared, pure/unit-tested)

**Files:**
- Create: `packages/shared/src/soft-delete/soft-delete.ts`
- Create: `packages/shared/src/soft-delete/soft-delete.extension.ts`
- Modify: `packages/shared/src/index.ts` (barrel export)
- Test: `packages/shared/src/soft-delete/soft-delete.extension.spec.ts`

**Interfaces:**
- Produces:
  - `SOFT_DELETE_MODELS: readonly string[]` = `['Candidate','Job','Pipeline','WalkInGroup']`
  - `isSoftDeleteModel(model: string): boolean`
  - `softDeleteExtension` — a `Prisma.defineExtension(...)` value applied via `client.$extends(softDeleteExtension)`.

- [ ] **Step 1: Registry** `soft-delete.ts`:
```ts
export const SOFT_DELETE_MODELS = ['Candidate', 'Job', 'Pipeline', 'WalkInGroup'] as const;
export function isSoftDeleteModel(model: string | undefined): boolean {
  return model != null && (SOFT_DELETE_MODELS as readonly string[]).includes(model);
}
```

- [ ] **Step 2: Write the failing extension spec** `soft-delete.extension.spec.ts`. The extension's query hooks receive `{ model, operation, args, query }` and call `query(args)`. Test by invoking the hook directly with a fake `query` that records the `args` it received:
  - For a registered model (`'Candidate'`), `findMany` with `args = { where: { organizationId: 'o1' } }` → the `query` fn receives `where: { organizationId: 'o1', deletedAt: null }`.
  - `findFirst`, `count`, `update` likewise merge `deletedAt: null` into `where` for a registered model.
  - `findUnique` with `args = { where: { id: 'x' } }` on a registered model → is dispatched as a `findFirst` (assert via the mechanism the implementation uses to redirect; e.g. the extension calls the model's `findFirst`) with `where: { id: 'x', deletedAt: null }`.
  - A NON-registered model (`'Organization'`) → `args` passed through unchanged (no `deletedAt`).
  Use the exact operation set from the spec (findFirst, findFirstOrThrow, findMany, count, aggregate, groupBy, update, updateMany filter; findUnique/findUniqueOrThrow redirect; create/delete/deleteMany/upsert pass through).

Run (shared jest): `npx jest soft-delete --config packages/shared/jest.config.js`. Expected: FAIL (module missing).

- [ ] **Step 3: Implement `soft-delete.extension.ts`** with `Prisma.defineExtension`:
```ts
import { Prisma } from '@prisma/client';
import { isSoftDeleteModel } from './soft-delete';

const withNotDeleted = (where: unknown) => ({ ...(where as object), deletedAt: null });

export const softDeleteExtension = Prisma.defineExtension({
  name: 'soft-delete',
  query: {
    $allModels: {
      async findMany({ model, args, query }) {
        if (isSoftDeleteModel(model)) args.where = withNotDeleted(args.where);
        return query(args);
      },
      // ...same for findFirst, findFirstOrThrow, count, aggregate, groupBy, update, updateMany
      async findUnique({ model, args, query, /* context */ }) {
        // findUnique can't take a non-unique filter; redirect to findFirst on the same model.
        // Use the extension's client context to call findFirst. If the client-context approach
        // is unavailable, implement findUnique/findUniqueOrThrow via `query` with a where that
        // includes deletedAt only when the model is NOT soft-deletable, and otherwise route
        // through findFirst. Choose the mechanism Prisma 5.22 supports; document it in the report.
        // ...
      },
      // findUniqueOrThrow -> findFirstOrThrow likewise
    },
  },
});
```
Implement all listed operations. For `findUnique`/`findUniqueOrThrow` on a soft-delete model, redirect to `findFirst`/`findFirstOrThrow` with `deletedAt: null` merged in (the standard Prisma soft-delete redirect — use `Prisma.getExtensionContext`/client access as supported by 5.22; the implementer confirms the working mechanism and notes it in the report). Non-soft-delete models: pass `args` through untouched for every op.

- [ ] **Step 4: Barrel export** in `packages/shared/src/index.ts`: `export * from './soft-delete/soft-delete';` and `export * from './soft-delete/soft-delete.extension';`.

- [ ] **Step 5: Run the spec GREEN.** `npx jest soft-delete --config packages/shared/jest.config.js`. Expected: PASS.

- [ ] **Step 6: Rebuild shared dist + typecheck.** Build packages/shared (build script, not install); then `npx tsc -p apps/api/tsconfig.json --noEmit`. Expected: clean.

- [ ] **Step 7: Commit.**
```bash
git add packages/shared/src/soft-delete packages/shared/src/index.ts
git commit -m "feat(recycle-bin): soft-delete registry + prisma $extends read filter"
```

---

### Task 3: Wire the filtered client + `forTenantIncludingDeleted` into TenantPrismaService

**Files:**
- Modify: `packages/shared/src/prisma/tenant-prisma.service.ts`
- Test: `packages/shared/src/prisma/tenant-prisma.service.spec.ts`

**Interfaces:**
- Consumes: `softDeleteExtension` (T2).
- Produces: `forTenant` now routes through the soft-delete-filtered client; new `forTenantIncludingDeleted<T>(context, fn, options?)` routes through the raw client (soft-deleted rows visible), same session context + reset.

- [ ] **Step 1: Build the filtered client once.** In `TenantPrismaService`, after construction, create `private readonly filtered = this.prisma.$extends(softDeleteExtension);` (import `softDeleteExtension`). Keep `this.prisma` (raw) for the bypass path.

- [ ] **Step 2: Factor the session set/reset.** Extract the existing set (`app_current_org`, `app_is_super_admin`, `app_current_user`, `app_record_visibility_governed`) and the `resetSessionContext` call into a private helper that takes the tx client, so both `forTenant` and `forTenantIncludingDeleted` share identical session handling. Do NOT change the keys, values, ordering, or reset behavior — only factor them.

- [ ] **Step 3: Route `forTenant` through the filtered client.** Change the `$transaction` to `this.filtered.$transaction(...)`. Keep the public signature `fn: (tx: Prisma.TransactionClient) => Promise<T>` unchanged; the extended client's tx is assignable for model ops (cast at the boundary if tsc requires — document any cast). The `tx.$executeRaw` for session context must still work (spike-verified).

- [ ] **Step 4: Add `forTenantIncludingDeleted`.** Same body as `forTenant` but using `this.prisma.$transaction(...)` (raw). Same session set/reset helper, same options, same pool-exhaustion mapping.

- [ ] **Step 5: Update/extend the spec.** In `tenant-prisma.service.spec.ts`: keep the existing session set/reset assertions passing (they must be unchanged in behavior). Add a test that `forTenantIncludingDeleted` sets + resets the session context identically. If the existing tests mock `this.prisma.$transaction`, ensure the filtered-client routing is exercised (e.g. assert `forTenant` uses the extended client and `forTenantIncludingDeleted` uses the raw client — via spies on each `$transaction`).

- [ ] **Step 6: Run shared jest + rebuild dist + api tsc (LOAD-BEARING).** `npx jest tenant-prisma --config packages/shared/jest.config.js`; rebuild shared dist; then `npx tsc -p apps/api/tsconfig.json --noEmit`. **This is the integration risk:** routing `forTenant` through the extended client changes the `tx` type seen by ~100 consumer callbacks. Expected: api tsc CLEAN. If tsc breaks broadly on the tx type, do NOT hand-edit 100 call sites — narrow the fix at the `forTenant` boundary (cast the extended tx to `Prisma.TransactionClient`) so consumers are unaffected; report the approach. If it cannot be made clean at the boundary, report BLOCKED with the specific type error.

- [ ] **Step 7: Commit.**
```bash
git add packages/shared/src/prisma/tenant-prisma.service.ts
git commit -m "feat(recycle-bin): filtered client for forTenant + forTenantIncludingDeleted bypass"
```

---

### Task 4: Convert the four hard-deletes to soft-delete

**Files:**
- Modify: `apps/api/src/candidates/candidates.service.ts` (`remove`, ~line 310-337)
- Modify: `apps/api/src/pipeline/pipeline.service.ts` (job delete, ~line 559)
- Modify: `apps/api/src/pipeline/pipelines.service.ts` (pipeline delete, ~line 97)
- Modify: `apps/api/src/walk-in-groups/walk-in-groups.service.ts` (delete, ~line 121)
- Test: the existing `*.service.spec.ts` for each (adjust delete assertions) + soft-delete behavior.

**Interfaces:**
- Consumes: soft-delete columns (T1), the filtered read path (T3).

- [ ] **Step 1: Candidate.** In `remove`, keep the not-found and invitation-count guards; replace `await tx.candidate.delete({ where: { id: candidateId } })` with `await tx.candidate.update({ where: { id: candidateId }, data: { deletedAt: new Date(), deletedByUserId: actorUserId } })`. Do NOT run any hard child-cascade. Keep the audit `candidate.deleted` call.

- [ ] **Step 2: Job.** At pipeline.service.ts ~line 559, replace `tx.job.delete(...)` with a soft-delete update (`deletedAt`, `deletedByUserId`). Remove any hard cascade of the job's children that was only there for the hard delete (leave entries in place). Keep guards/audit.

- [ ] **Step 3: Pipeline.** At pipelines.service.ts ~line 97, replace `tx.pipeline.delete(...)` with the soft-delete update. Keep guards/audit.

- [ ] **Step 4: Walk-in group.** At walk-in-groups.service.ts ~line 121, replace `tx.walkInGroup.delete(...)` with the soft-delete update. Keep guards/audit. (This method may not currently take an actorUserId — thread one through from the controller via `@CurrentUserId()` if needed for `deletedByUserId`; if that widens the signature, update the controller + spec.)

- [ ] **Step 5: Tests.** For each service spec, update the delete test to assert a soft-delete `update` (deletedAt set) rather than a hard `delete`. Add/confirm: after remove, a normal read (filtered path) does not return the row; the candidate invitation guard still throws. Where the suite is real-DB-capable use it; where it mocks the tx, assert the `update` call shape. Run each: `npx jest candidates`, `npx jest pipeline`, `npx jest walk-in`.

- [ ] **Step 6: OPEN-RISK check (job → entries).** Confirm that soft-deleting a job does not leave its pipeline entries surfacing in a broken way (board/entry reads go through the job, now filtered). If entries appear orphaned in any read, report it (DONE_WITH_CONCERNS) with the specific read path — do not expand scope without a ruling.

- [ ] **Step 7: Full api suite + tsc, then commit.** `npx jest` (apps/api) + `npx tsc -p apps/api/tsconfig.json --noEmit`.
```bash
git add apps/api/src/candidates apps/api/src/pipeline apps/api/src/walk-in-groups
git commit -m "feat(recycle-bin): soft-delete the four entities instead of hard delete"
```

---

### Task 5: Recycle-bin module (service + controller)

**Files:**
- Create: `apps/api/src/recycle-bin/recycle-bin.service.ts`
- Create: `apps/api/src/recycle-bin/recycle-bin.controller.ts`
- Create: `apps/api/src/recycle-bin/recycle-bin.module.ts`
- Modify: `apps/api/src/app.module.ts` (register the module)
- Test: `apps/api/src/recycle-bin/recycle-bin.controller.spec.ts` + service spec (real-DB where available)

**Interfaces:**
- Consumes: `forTenantIncludingDeleted` (T3), soft-delete columns (T1).
- Produces: `GET /recycle-bin`, `POST /recycle-bin/:entityType/:id/restore`, `DELETE /recycle-bin/:entityType/:id` — all gated `org:manage_settings`.

- [ ] **Step 1: Service.** `list(context)` → via `forTenantIncludingDeleted`, run four `findMany({ where: { deletedAt: { not: null } }, select: { id, deletedAt, deletedByUserId, <label field> } })` (one per model), map to `{ entityType, id, label, deletedAt, deletedByUserId }`, concat, sort by `deletedAt` desc. `restore(context, entityType, id)` → validate entityType ∈ four; `update({ where: { id }, data: { deletedAt: null, deletedByUserId: null } })` via `forTenantIncludingDeleted`; 404 if no soft-deleted row; surface a unique-collision as a 409. `purge(context, entityType, id)` → validate; run the entity's real hard delete (`delete`/`deleteMany`) via `forTenantIncludingDeleted`; 404 if not soft-deleted. Define an `ENTITY_TYPES` map (entityType string → { model delegate name, label field }) as the single source for the four types.

- [ ] **Step 2: Write the failing controller spec.** Assert all three routes carry `@RequirePermissions('org:manage_settings')` (metadata reflection, mirror `field-permissions`/other config controller specs), and delegate to the service with the parsed params. Run `npx jest recycle-bin`. Expected: FAIL.

- [ ] **Step 3: Controller.** Three routes, `@UseGuards(JwtAuthGuard, PermissionsGuard)` + `@RequirePermissions('org:manage_settings')`, `@CurrentTenant()`, `@CurrentUserId()` where needed. GET returns the list; POST restore; DELETE purge. Validate `entityType` (400 on unknown).

- [ ] **Step 4: Module + registration.** Create the module (providers: service; controllers: controller; imports whatever gives `TenantPrismaService`/guards, mirroring an existing config module). Register in `app.module.ts`.

- [ ] **Step 5: Service spec (real-DB where available).** Seed a soft-deleted row per type; assert list returns them; restore un-hides (normal read returns it again); purge removes it entirely (not in includingDeleted either). Run `npx jest recycle-bin`.

- [ ] **Step 6: api tsc + commit.**
```bash
git add apps/api/src/recycle-bin apps/api/src/app.module.ts
git commit -m "feat(recycle-bin): admin list/restore/purge API gated org:manage_settings"
```

---

### Task 6: Scheduled 30-day purge

**Files:**
- Create: `apps/api/src/recycle-bin/recycle-bin-retention.service.ts`
- Modify: `apps/api/src/recycle-bin/recycle-bin.module.ts` (provide the retention service)
- Test: `apps/api/src/recycle-bin/recycle-bin-retention.service.spec.ts`

**Interfaces:**
- Consumes: soft-delete columns (T1), `TenantPrismaService`.

- [ ] **Step 1: Implement the service mirroring `system-events-retention.service.ts`** (verified pattern): `RETENTION_DAYS = 30`, `PRUNE_INTERVAL_MS = 24h`, `onModuleInit` runs `prune()` then `setInterval` with `.unref?.()`, `onModuleDestroy` clears the timer. `prune(now = new Date())`: `cutoff = now - 30d`; run cross-tenant as super-admin — `forTenant({ organizationId: null, isSuperAdmin: true }, tx => ...)` (matches system-events) — but use `forTenantIncludingDeleted` if the deleteMany must see soft-deleted rows (the extension leaves `deleteMany` unfiltered, so either works; prefer `forTenantIncludingDeleted` for clarity). For EACH of the four models: `deleteMany({ where: { deletedAt: { lt: cutoff } } })`. Sum counts; log one grep-able summary line; swallow errors (warn, never crash). Return total count.

- [ ] **Step 2: Write the test.** Seed rows with `deletedAt` older and newer than 30 days (set the column directly); call `prune(fixedNow)`; assert old rows hard-deleted, newer soft-deleted rows retained, live rows untouched. Real-DB where available; otherwise assert the four `deleteMany` calls with the correct cutoff where clause.

- [ ] **Step 3: Register** the retention service as a provider in `recycle-bin.module.ts`.

- [ ] **Step 4: Run + commit.** `npx jest recycle-bin` + api tsc.
```bash
git add apps/api/src/recycle-bin
git commit -m "feat(recycle-bin): scheduled 30-day purge of soft-deleted rows"
```

---

### Task 7: Web — recycle bin page, hook, nav

**Files:**
- Create: `apps/web/lib/hooks/useRecycleBin.ts`
- Create: `apps/web/app/v2/(org-admin)/settings/recycle-bin/page.tsx`
- Modify: `apps/web/lib/super-admin-nav.ts` (nav item + icon)
- Modify: `apps/web/lib/staff-nav.ts` (`V2_ROUTES`)
- Test: `apps/web/app/v2/(org-admin)/settings/recycle-bin/page.test.tsx`

**Interfaces:**
- Consumes: the T5 endpoints.

- [ ] **Step 1: Hook** `useRecycleBin.ts` — list query (`GET /recycle-bin`), restore mutation (`POST /recycle-bin/:type/:id/restore`), purge mutation (`DELETE /recycle-bin/:type/:id`); invalidate the list on success. Mirror an existing settings hook's client + query-key conventions (e.g. `useFieldPermissions`/`useBusinessHours`). Do NOT import `@exam-platform/shared` runtime values.

- [ ] **Step 2: Write the failing page test.** Render with a mocked list (one item per type); assert items render grouped/labeled; Restore fires the restore mutation with the right `{type,id}`; Delete-forever (after a confirm) fires the purge mutation. Mirror an existing settings page test. Run `npx jest recycle-bin` (web). Expected: FAIL.

- [ ] **Step 3: Page.** `/settings/recycle-bin` — list grouped by entityType (or a flat table with a Type column), each row showing label + deletedAt, with Restore and Delete-forever (confirm dialog) actions; empty state ("Recycle bin is empty"). Use existing v2 primitives (`Button`, etc.); match an existing settings page shell.

- [ ] **Step 4: Nav.** `super-admin-nav.ts`: add `{ href: '/settings/recycle-bin', label: 'Recycle Bin', icon: Trash2 }` (import `Trash2` from lucide-react in the top import). `staff-nav.ts`: add `'/settings/recycle-bin'` to `V2_ROUTES`.

- [ ] **Step 5: Run + tsc + commit.** `npx jest recycle-bin` (web); web suite (note the known pre-existing ImpersonationBanner failure only); `npx tsc -p apps/web/tsconfig.json --noEmit` (ignore pre-existing stale `.next/types` noise; no NEW errors).
```bash
git add apps/web/lib apps/web/app/v2/'(org-admin)'/settings/recycle-bin
git commit -m "feat(recycle-bin): admin recycle-bin page + hook + nav"
```

---

## Self-Review

**Spec coverage:** soft-delete columns (T1) ✓; registry + `$extends` filter (T2) ✓; filtered-client wiring + bypass (T3) ✓; four delete conversions (T4) ✓; bin API (T5) ✓; scheduled purge (T6) ✓; web (T7) ✓. Questions correctly excluded throughout.

**Placeholder scan:** No TBD. T2's `findUnique` redirect names the exact requirement and asks the implementer to confirm the Prisma-5.22-supported mechanism in the report (a real API detail, not a vague instruction). T3's tsc-across-consumers is a concrete load-bearing gate with a specified boundary-cast fallback. T4's job→entries open-risk is a concrete check with a report-not-expand instruction.

**Type/name consistency:** `SOFT_DELETE_MODELS` (T2) single-sources the four model names, consumed by the extension (T2), and the bin/purge `ENTITY_TYPES` map (T5/T6) covers the same four. `deletedAt`/`deletedByUserId` spelled identically across T1 schema, T2 filter, T3 wiring, T4 writes, T5/T6 reads. Migration `20260906150000` unique/ordered. Endpoints `GET/POST/DELETE /recycle-bin...` match between T5 (server) and T7 (hook).

**Load-bearing risks flagged:** (a) T3 extended-tx type across ~100 consumers — boundary cast fallback specified; (b) T2 `findUnique` redirect mechanism — implementer confirms; (c) T4 job→entries — concrete check.
