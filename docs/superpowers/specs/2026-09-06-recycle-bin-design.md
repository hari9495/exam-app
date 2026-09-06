# Recycle Bin (Zoho #12) — Design

**Date:** 2026-09-06
**Status:** Approved (design), pending spec review
**Zoho adopt:** #12 (Recycle Bin — unified soft-delete + restore + retention window). Today: only per-entity archive (PipelineEntry.archivedAt, question `archived` status, CustomFieldDefinition.archivedAt); no unified bin, no retention purge.
**Branch:** `feat/recycle-bin` (off origin/main @ `fec52f3c`)

## Goal

Replace the hard-deletes on five entities with soft-delete, hide soft-deleted rows from all normal reads via a global Prisma query filter, expose a unified admin Recycle Bin (list / restore / delete-forever), and auto-purge soft-deleted rows after a fixed 30-day retention window.

## Scope

**In:** Soft-delete for **Candidate, Job, Question, Pipeline, WalkInGroup**; a global `$extends` read filter; a unified bin API + web page (admin-gated); a scheduled 30-day purge.

**Out (deferred fast-follows):**
- Org-configurable retention window (v1 is a fixed 30 days).
- SQL Server filtered unique indexes (`WHERE deleted_at IS NULL`) to allow reusing a soft-deleted row's unique value before restore/purge (v1 accepts + documents the collision).
- Soft-delete for any entity beyond the five (e.g. exams, offers) — not requested.
- Child-row hiding: a soft-deleted parent is hidden; its child rows remain in place (untouched) so restore is intact. We do not separately hide children.

## Decisions (rulings baked in)

1. **Soft-delete + global `$extends` filter** (not a snapshot table). Delete sets `deletedAt`; reads auto-filter; restore clears the flag with relations intact. **Validated by spike (2026-09-06):** a Prisma `$extends` query extension fires inside `TenantPrismaService.forTenant`'s interactive `$transaction` on the installed Prisma 5.22.0 (`firedInTx: true`), so the filter is airtight without per-call-site edits.
2. **Five entities:** Candidate, Job, Question, Pipeline, WalkInGroup — the codebase's five top-level hard-deletes (`candidates.service.remove`, `pipeline.service` job delete, `pipelines.service` pipeline delete, `questions.service` question delete, `walk-in-groups.service` delete).
3. **`findUnique`/`findUniqueOrThrow` → `findFirst`/`findFirstOrThrow`** inside the extension for soft-deletable models (a non-unique `deletedAt` filter is invalid on `findUnique`). Standard Prisma soft-delete pattern.
4. **Unique-value collisions accepted in v1:** a soft-deleted row keeps its unique values; re-creating a row with the same value errors until the soft-deleted one is restored or purged. Documented; filtered unique indexes are the fast-follow.
5. **Fixed 30-day retention**, hardcoded. Auto-purge is a scheduled job that runs the real hard-delete (original cascades).
6. **Admin-gated** bin: view/restore/purge require `org:manage_settings` (no new permission, no seed change).
7. **Existing delete guards preserved** (e.g. candidate "has invitations → mark inactive" ConflictException stays; the soft-delete happens only when the guard passes).

## Architecture

### Schema (additive)

Add to each of the five models:
```prisma
deletedAt       DateTime? @map("deleted_at")
deletedByUserId String?   @map("deleted_by_user_id") @db.UniqueIdentifier
```
Migration `20260906150000_recycle_bin_soft_delete` — five `ALTER TABLE ... ADD [deleted_at] DATETIME2 NULL, [deleted_by_user_id] UNIQUEIDENTIFIER NULL;` statements. All five tables already carry the tenant RLS policy → additive columns need **no paired `_rls`** migration.

### Soft-delete registry + `$extends` filter (packages/shared)

- `packages/shared/src/soft-delete/soft-delete.ts` — `SOFT_DELETE_MODELS: readonly Prisma.ModelName[]` = the five model names; a helper `isSoftDeleteModel(model)`.
- `packages/shared/src/soft-delete/soft-delete.extension.ts` — a Prisma client extension (`Prisma.defineExtension`) whose `query` hooks, for the five models only:
  - `findFirst`, `findFirstOrThrow`, `findMany`, `count`, `aggregate`, `groupBy`: merge `deletedAt: null` into `args.where`.
  - `findUnique` → run as `findFirst` with `{ ...where, deletedAt: null }`; `findUniqueOrThrow` → `findFirstOrThrow` likewise.
  - `update`, `updateMany`: merge `deletedAt: null` into `args.where` (can't modify a soft-deleted row through normal paths).
  - Leave `create`, `delete`, `deleteMany`, `upsert` unfiltered (delete/purge run through the bypass path or the soft-delete write itself).
  - Non-registered models pass through untouched.
  Implemented as a pure factory so it is unit-testable without a DB (assert the `where` passed to the wrapped `query` fn).

### TenantPrismaService wiring (packages/shared)

- Construct a filtered client once: `this.filtered = this.prisma.$extends(softDeleteExtension)`.
- `forTenant(context, fn)` uses `this.filtered.$transaction(...)` (normal path — soft-deleted rows hidden). Session-context `EXEC sp_set_session_context` and `$executeRaw` remain available on the extended client's tx (verified in spike).
- **New** `forTenantIncludingDeleted(context, fn)` uses the **raw** `this.prisma.$transaction(...)` (bin/restore/purge — soft-deleted rows visible), setting the same session context (tenancy/RLS still enforced) and the same reset in `finally`. Factor the session set/reset so both variants share it (no duplication).
- `withoutTenantScope` and the pool-exhaustion mapping are unchanged.

### Delete methods → soft-delete

Convert each of the five to set `deletedAt = new Date()`, `deletedByUserId = actorUserId` via `update` (not `delete`), preserving the surrounding guards and audit calls:
- `candidates.service.remove` — keep the invitation-count ConflictException guard; replace `tx.candidate.delete` with the soft-delete update. Do **not** run the hard child-cascade.
- `pipeline.service` job delete (~line 559) — soft-delete the job; do not cascade-delete entries (they stay, hidden with the job? entries are not in the registry — a job's entries remain visible unless the job is required; acceptable: the job is hidden from job lists; entries reference a hidden job. See Open-risk note).
- `pipelines.service` pipeline delete (~line 97) — soft-delete.
- `questions.service` question delete — soft-delete (distinct from the existing `archived` status, which stays as-is for its own workflow).
- `walk-in-groups.service` delete (~line 121) — soft-delete.
Audit actions unchanged (`*.deleted`), or add `deletedByUserId` capture.

### Bin API (admin)

New `recycle-bin` module (controller + service), all gated `@RequirePermissions('org:manage_settings')`, all via `forTenantIncludingDeleted`:
- `GET /recycle-bin` → `RecycleBinItem[]` = `{ entityType, id, label, deletedAt, deletedByUserId }` unioned across the five models where `deletedAt != null`, newest first. `label` is a per-entity human string (candidate name, job title, question stem/prompt truncated, pipeline name, walk-in-group name).
- `POST /recycle-bin/:entityType/:id/restore` → set `deletedAt = null`, `deletedByUserId = null`; 404 if not a soft-deleted row of that type; surface a unique-collision error clearly if restore violates a constraint.
- `DELETE /recycle-bin/:entityType/:id` → purge-now: run the real hard-delete for that entity (the original delete logic + cascades). 404 if not soft-deleted.
`entityType` is validated against the five known types (reject others with 400).

### Scheduled purge

`recycle-bin-retention.service.ts` mirroring `system-events-retention.service` / `face-retention.service` (same scheduling mechanism, same tenant-iteration approach they use). On each run, for each org, hard-delete rows with `deletedAt < now - 30 days` across the five models (running each entity's real delete/cascade). `RETENTION_DAYS = 30` constant. Log a grep-able summary line per run.

### Web

- `apps/web/lib/hooks/useRecycleBin.ts` — list query + restore mutation + purge mutation.
- `apps/web/app/v2/(org-admin)/settings/recycle-bin/page.tsx` (or a top-level `/recycle-bin`) — grouped list by entityType with Restore and Delete-forever (confirm dialog) actions; empty state.
- Nav registration in `super-admin-nav.ts` (icon, e.g. `Trash2`) + `staff-nav.ts` `V2_ROUTES`.

## Data flow

1. Admin deletes a candidate → guard passes → `deletedAt`/`deletedByUserId` set; row now hidden from every candidate read (filtered client).
2. Admin opens Recycle Bin → `forTenantIncludingDeleted` lists the five models' soft-deleted rows.
3. Restore → `deletedAt = null` → row reappears everywhere.
4. 30 days later (no restore) → scheduled purge hard-deletes it (real cascade).
5. Delete-forever → immediate hard-delete (same as purge, one row).

## Error handling

- Restore/create hitting a unique collision → propagate as a clear 409 (documented v1 limitation).
- `forTenantIncludingDeleted` resets session context in `finally` exactly like `forTenant`.
- Unknown `entityType` in a bin route → 400.
- Purge runs the real delete, so its existing guards/cascades apply; a guard failure (should not occur for already-soft-deleted rows) is logged, not fatal to the batch.

## Open-risk note (validate during implementation)

- **Job soft-delete + its pipeline entries:** entries are not soft-deletable; a soft-deleted job leaves its entries referencing a now-hidden job. Confirm board/entry reads that join the job don't surface entries of a soft-deleted job in a broken way (they read via the job, which is filtered). If entries would appear orphaned, the implementer flags it — the likely resolution is that entry reads already scope by a visible job. Do not expand scope without a ruling.

## Testing

- **Shared:** the extension factory (unit, no DB) — asserts `deletedAt: null` merged into `where` for each intercepted op on registered models, `findUnique`→`findFirst` conversion, and pass-through for non-registered models. Registry contents.
- **API (real-DB, reuse the tenant-isolation.e2e harness pattern):** soft-delete hides a row from normal reads; `forTenantIncludingDeleted` still sees it; restore un-hides; purge/delete-forever hard-removes; the candidate invitation guard still blocks; a unique-collision on re-create surfaces. Per-entity smoke for all five.
- **Retention service:** rows older than 30 days are purged, newer ones retained (mock the clock or seed `deletedAt`).
- **Bin controller:** routes gated `org:manage_settings`; entityType validation; shapes.
- **Web:** page lists grouped items, Restore/Delete-forever fire the mutations; nav present.
- Full api + shared jest green; `tsc` clean.

## Deploy notes

- One additive migration (five columns, no `_rls`, no seed change). Ships with any api build; existing rows have `deletedAt = NULL` = visible = today's behavior.
- The soft-delete filter changes delete semantics on deploy: deletes become recoverable. No data migration needed.
- Web page needs any web build. No exam-day deploy.
