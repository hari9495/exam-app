# Deepen Hiring Drives Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Link a `WalkInGroup` to a `Job` so walk-in/drive registrants enter that job's ATS pipeline as `enteredVia='drive'` candidates, with backfill on link — the 4th ATS entry point.

**Architecture:** One nullable column `WalkInGroup.jobId`. A `PipelineService.upsertDriveEntry` helper (stamp-if-absent) is called from two places: `WalkInService.register` (on every registration to a job-linked group) and a new `setJob` on the walk-in-groups service (backfill when a job is attached). Drives then appear as a fourth source in the existing recruiter analytics (one label add). No new table, no new dependency.

**Tech Stack:** NestJS 11, Prisma + Azure SQL, Next.js 16 (see `apps/web/AGENTS.md`), React Query, jest + Testing Library.

## Global Constraints

- **Additive.** One nullable column `WalkInGroup.jobId` (FK → `Job`, `onDelete: SetNull`, `onUpdate: NoAction`). `enteredVia` gains the string value `'drive'` — NO enum/schema change (it's an unconstrained string).
- **Stamp-if-absent everywhere.** The register hook AND the backfill `upsert` the `PipelineEntry` with **`update:{}`** — never reset an existing entry's `stage`/`enteredVia` (first-source-wins, consistent with feature #1's exam/application hooks).
- **Reuse `PipelineService`** (exported by `PipelineModule`) for the upsert — do not duplicate upsert logic. `WalkInModule` and `WalkInGroupsModule` import `PipelineModule`; **`PipelineModule` must NOT import either of them** (no circular dep).
- **`register` is already org-pinned** (`forTenant({ organizationId, isSuperAdmin: true })`, resolved from the org slug); the drive upsert uses that same `tx`/context, atomic with candidate creation.
- **`pipeline:manage`** gates the link/unlink route.
- **Trigger on ANY registration** to a job-linked group (not gated on a live `DriveSession`).
- SQL Server: single schema migration (ADD COLUMN + FK). `walk_in_groups` already has its RLS policy; a nullable column needs no new predicate. No P1012 (deleting a `Job` cascades `pipeline_entries`/`job_exams` and SetNulls `walk_in_groups.jobId` — no table reached twice).
- **Windows/Next.js:** don't remove the auto-generated block in `apps/web/AGENTS.md`; commit it if it appears.

---

## File Structure

**Backend:**
- `apps/api/prisma/schema.prisma` — `WalkInGroup.jobId` + `Job.walkInGroups` back-relation.
- `apps/api/prisma/migrations/20260820090000_walkin_group_job/migration.sql`.
- `apps/api/src/pipeline/pipeline.service.ts` — `upsertDriveEntry` helper.
- `apps/api/src/walk-in/walk-in.service.ts` + `walk-in.module.ts` — register hook + import PipelineModule.
- `apps/api/src/walk-in-groups/walk-in-groups.service.ts` + `.controller.ts` + `.module.ts` + `dto/set-group-job.dto.ts` — `setJob` + backfill + route; `jobId` in read responses.
- `*.spec.ts` for the touched services/controller.

**Frontend:**
- `apps/web/lib/types.ts` — `WalkInGroup` type gains `jobId: string | null`.
- `apps/web/lib/hooks/useWalkInGroups.ts` (or wherever the groups hook lives) — `useSetGroupJob` mutation.
- The walk-in-groups management surface — an "Attach job" control.
- The hiring-analytics source panel — `'drive' → 'Drive'` label.
- `*.test.tsx`.

---

## Task 1: Schema + migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260820090000_walkin_group_job/migration.sql`

**Interfaces:**
- Produces: `WalkInGroup.jobId String?` (FK → Job, SetNull); `Job.walkInGroups WalkInGroup[]`.

- [ ] **Step 1: Edit `schema.prisma`**

On `model WalkInGroup` add:
```prisma
  jobId String? @map("job_id") @db.UniqueIdentifier
  job   Job?    @relation(fields: [jobId], references: [id], onDelete: SetNull, onUpdate: NoAction)
```
On `model Job` add the back-relation:
```prisma
  walkInGroups WalkInGroup[]
```

- [ ] **Step 2: Hand-write the migration** (model on `apps/api/prisma/migrations/20260817120000_hiring_drives/migration.sql`, which added `invitations.drive_session_id` with a `SetNull` FK):

`20260820090000_walkin_group_job/migration.sql`:
```sql
-- AlterTable
ALTER TABLE [dbo].[walk_in_groups] ADD [job_id] UNIQUEIDENTIFIER;

-- AddForeignKey
ALTER TABLE [dbo].[walk_in_groups] ADD CONSTRAINT [walk_in_groups_job_id_fkey] FOREIGN KEY ([job_id]) REFERENCES [dbo].[jobs] ([id]) ON DELETE SET NULL ON UPDATE NO ACTION;

-- CreateIndex
CREATE NONCLUSTERED INDEX [walk_in_groups_job_id_idx] ON [dbo].[walk_in_groups]([job_id]);
```
(No RLS migration — `walk_in_groups` already has its policy; a nullable column adds no predicate.)

- [ ] **Step 3: Apply + verify**

```bash
cd "D:/exam app/apps/api" && DB_URL=$(grep "^DATABASE_URL=" .env | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//') && DATABASE_URL="$DB_URL" npx prisma migrate deploy --schema=prisma/schema.prisma && DATABASE_URL="$DB_URL" npx prisma generate --schema=prisma/schema.prisma
```
Expected: migration applies; the client's `WalkInGroup` type has `jobId`. If `migrate deploy` reports P1012, stop and report (not expected — see Global Constraints).

- [ ] **Step 4: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260820090000_walkin_group_job
git commit -m "feat(drives): WalkInGroup.jobId link column + migration"
```

---

## Task 2: Drive-entry upsert + register hook

**Files:**
- Modify: `apps/api/src/pipeline/pipeline.service.ts`, `apps/api/src/walk-in/walk-in.service.ts`, `apps/api/src/walk-in/walk-in.module.ts`
- Modify: `apps/api/src/pipeline/pipeline.service.spec.ts`, `apps/api/src/walk-in/walk-in.service.spec.ts`

**Interfaces:**
- Consumes: existing `PipelineEntry` upsert shape (`jobId_candidateId` unique).
- Produces: `PipelineService.upsertDriveEntry(tx: any, context: TenantContext, jobId: string, candidateId: string): Promise<void>` — upserts a `drive` entry, stamp-if-absent, using the CALLER's `tx` (runs in the caller's transaction, like `syncEntriesForInvitations`).

- [ ] **Step 1: Write the failing tests**

In `pipeline.service.spec.ts`, add:
```ts
it('upsertDriveEntry upserts a drive entry stamp-if-absent using the caller tx', async () => {
  const upsert = jest.fn().mockResolvedValue({ id: 'en-1' });
  const tx = { pipelineEntry: { upsert } };
  await service.upsertDriveEntry(tx as any, context, 'job-1', 'cand-1');
  expect(upsert).toHaveBeenCalledWith({
    where: { jobId_candidateId: { jobId: 'job-1', candidateId: 'cand-1' } },
    create: { organizationId: 'org-1', jobId: 'job-1', candidateId: 'cand-1', stage: 'applied', enteredVia: 'drive' },
    update: {},
  });
});
```
In `walk-in.service.spec.ts`, add a test that after `register`, when the exam's group has a `jobId`, `PipelineService.upsertDriveEntry` is called with that jobId + the candidate id; and NOT called when the group has no `jobId`. (Add a mocked `PipelineService` provider to the walk-in test module; read the existing `walk-in.service.spec.ts` setup and mock `tx.walkInGroup.findUnique` to return `{ jobId }`.)

- [ ] **Step 2: Run — expect FAIL**

```bash
cd "D:/exam app" && npx jest --config apps/api/jest.config.js src/pipeline/pipeline.service src/walk-in/walk-in.service
```

- [ ] **Step 3: Implement `upsertDriveEntry`** in `pipeline.service.ts` (mirror `syncEntriesForInvitations`'s tx-passed shape):
```ts
// Called from within an existing forTenant transaction (walk-in register, or setJob's backfill)
// so entry creation is atomic with whatever triggered it. Stamp-if-absent: never resets an
// existing entry's stage/enteredVia (a candidate already at 'interview' isn't yanked back).
async upsertDriveEntry(tx: any, context: TenantContext, jobId: string, candidateId: string): Promise<void> {
  await tx.pipelineEntry.upsert({
    where: { jobId_candidateId: { jobId, candidateId } },
    create: { organizationId: context.organizationId as string, jobId, candidateId, stage: 'applied', enteredVia: 'drive' },
    update: {},
  });
}
```

- [ ] **Step 4: Wire the register hook** in `walk-in.service.ts`. Inject `PipelineService` into `WalkInService`'s constructor. Inside `register`'s `forTenant` callback, AFTER `candidate` is resolved and BEFORE the invitation-branch returns (so it runs for both the reuse and create branches), add:
```ts
// Drive-sourced ATS entry: if this exam's walk-in group is linked to a job, the registrant
// enters that job's pipeline. Any registration to a linked group counts (not gated on a live
// drive). Stamp-if-absent via PipelineService.
if (exam.walkInGroupId) {
  const group = await tx.walkInGroup.findUnique({ where: { id: exam.walkInGroupId }, select: { jobId: true } });
  if (group?.jobId) {
    await this.pipeline.upsertDriveEntry(tx, context, group.jobId, candidate.id);
  }
}
```
Place this once, after the `candidate`/`expandedName` resolution and before the `liveInvitation` branching, so both return branches include it. In `walk-in.module.ts`, add `imports: [PipelineModule]`. Confirm `PipelineModule` does not import `WalkInModule` (no circular dep); if Nest reports one, STOP and report.

- [ ] **Step 5: Run — expect PASS**, then api typecheck, commit

```bash
cd "D:/exam app" && npx jest --config apps/api/jest.config.js src/pipeline/pipeline.service src/walk-in/walk-in.service && npx tsc -p apps/api/tsconfig.json --noEmit
git add apps/api/src/pipeline/pipeline.service.ts apps/api/src/pipeline/pipeline.service.spec.ts apps/api/src/walk-in/walk-in.service.ts apps/api/src/walk-in/walk-in.service.spec.ts apps/api/src/walk-in/walk-in.module.ts
git commit -m "feat(drives): drive-sourced pipeline entry on walk-in registration"
```

---

## Task 3: setJob endpoint + backfill

**Files:**
- Modify: `apps/api/src/walk-in-groups/walk-in-groups.service.ts`, `walk-in-groups.controller.ts`, `walk-in-groups.module.ts`
- Create: `apps/api/src/walk-in-groups/dto/set-group-job.dto.ts`
- Modify: `walk-in-groups.service.spec.ts`, `walk-in-groups.controller.spec.ts`

**Interfaces:**
- Consumes: `PipelineService.upsertDriveEntry` (Task 2).
- Produces: `WalkInGroupsService.setJob(ctx, actorUserId, groupId, jobId: string | null): Promise<{ success: true }>`; route `PATCH /walk-in-groups/:id/job`; group read responses include `jobId`.

- [ ] **Step 1: Write failing tests** — `setJob` with a jobId: validates the group is org-scoped (NotFound otherwise) AND the job is org-scoped (NotFound otherwise), sets `walk_in_groups.job_id`, and **backfills**: finds distinct candidates who registered via the group (invitations whose exam belongs to the group) and calls `upsertDriveEntry` for each; audits `walk_in_group.job_linked`. `setJob` with `null`: clears `job_id`, does NO backfill, audits `walk_in_group.job_unlinked`. Controller: `PATCH /walk-in-groups/:id/job` delegates with parsed `jobId`; 401 when JwtAuthGuard rejects.

```ts
it('setJob links a job and backfills existing group registrants', async () => {
  const update = jest.fn().mockResolvedValue({ id: 'group-1', jobId: 'job-1' });
  const tx = {
    walkInGroup: { findFirst: jest.fn().mockResolvedValue({ id: 'group-1' }), update },
    job: { findFirst: jest.fn().mockResolvedValue({ id: 'job-1' }) },
    invitation: { findMany: jest.fn().mockResolvedValue([{ candidateId: 'c1' }, { candidateId: 'c1' }, { candidateId: 'c2' }]) },
  };
  tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(tx));
  await service.setJob(context, 'user-1', 'group-1', 'job-1');
  expect(update).toHaveBeenCalledWith({ where: { id: 'group-1' }, data: { jobId: 'job-1' } });
  // distinct candidates c1, c2 backfilled
  expect(pipeline.upsertDriveEntry).toHaveBeenCalledTimes(2);
  expect(pipeline.upsertDriveEntry).toHaveBeenCalledWith(tx, context, 'job-1', 'c1');
  expect(pipeline.upsertDriveEntry).toHaveBeenCalledWith(tx, context, 'job-1', 'c2');
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd "D:/exam app" && npx jest --config apps/api/jest.config.js src/walk-in-groups
```

- [ ] **Step 3: DTO + implement**

`dto/set-group-job.dto.ts`:
```ts
import { IsOptional, IsUUID, ValidateIf } from 'class-validator';

export class SetGroupJobDto {
  // jobId is either a UUID (link) or explicitly null (unlink).
  @ValidateIf((o) => o.jobId !== null)
  @IsUUID()
  jobId!: string | null;
}
```
`walk-in-groups.service.ts` — inject `PipelineService`; add:
```ts
async setJob(context: TenantContext, actorUserId: string, groupId: string, jobId: string | null): Promise<{ success: true }> {
  await this.tenantPrisma.forTenant(context, async (tx) => {
    const orgId = context.organizationId as string;
    const group = await tx.walkInGroup.findFirst({ where: { id: groupId, organizationId: orgId } });
    if (!group) throw new NotFoundException(`Walk-in group ${groupId} not found`);
    if (jobId) {
      const job = await tx.job.findFirst({ where: { id: jobId, organizationId: orgId } });
      if (!job) throw new NotFoundException(`Job ${jobId} not found`);
    }
    await tx.walkInGroup.update({ where: { id: groupId }, data: { jobId } });
    if (jobId) {
      // Backfill: everyone already registered via this group (invitations to the group's exams).
      const invitations = await tx.invitation.findMany({ where: { exam: { walkInGroupId: groupId } }, select: { candidateId: true } });
      const candidateIds = [...new Set(invitations.map((i) => i.candidateId))];
      for (const candidateId of candidateIds) {
        await this.pipeline.upsertDriveEntry(tx, context, jobId, candidateId);
      }
    }
    await this.audit.record(context, {
      actorUserId,
      action: jobId ? 'walk_in_group.job_linked' : 'walk_in_group.job_unlinked',
      entityType: 'walk_in_group',
      entityId: groupId,
      metadata: { jobId },
    });
  });
  return { success: true };
}
```
(Match the constructor injection to how the service currently injects `TenantPrismaService`/`AuditService`; add `PipelineService`. Import `NotFoundException`.)
Add `jobId` to the group read mapping (wherever `list`/`get` returns groups — include `jobId` in the select/response so the UI shows the link).
`walk-in-groups.controller.ts` — add:
```ts
@Patch(':id/job')
@RequirePermissions('pipeline:manage')
setJob(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Param('id') id: string, @Body() dto: SetGroupJobDto) {
  return this.walkInGroupsService.setJob(tenant, userId, id, dto.jobId);
}
```
`walk-in-groups.module.ts` — add `imports: [PipelineModule]`. Confirm no circular dep (PipelineModule must not import WalkInGroupsModule).

- [ ] **Step 4: Run — expect PASS**, then the whole api suite + typecheck

```bash
cd "D:/exam app" && npx jest --config apps/api/jest.config.js && npx tsc -p apps/api/tsconfig.json --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/walk-in-groups && git commit -m "feat(drives): PATCH /walk-in-groups/:id/job link + backfill"
```

---

## Task 4: Frontend — attach-job control + Drive analytics label

**Files:**
- Modify: `apps/web/lib/types.ts`, the walk-in-groups hook file (`apps/web/lib/hooks/useWalkInGroups.ts` or wherever `useWalkInGroups` lives), the walk-in-groups management surface, and the hiring-analytics source panel (`apps/web/app/(recruiter)/analytics/hiring/page.tsx`).
- Test: the touched page/component test.

**Interfaces:**
- Consumes: `PATCH /walk-in-groups/:id/job`; `useJobs` (`apps/web/lib/hooks/usePipeline.ts`).
- Produces: `useSetGroupJob(groupId)` mutation; the `WalkInGroup` web type gains `jobId: string | null`.

- [ ] **Step 1: Read `apps/web/AGENTS.md`**, then locate the walk-in-groups list page/hook (`grep -rn "useWalkInGroups\|walk-in-groups" apps/web/lib apps/web/app`) and the hiring-analytics source-label rendering in `analytics/hiring/page.tsx`.

- [ ] **Step 2: Write failing test** — for the attach-job control: mock `useJobs` (a couple jobs) + the set-group-job mutation; render the walk-in-groups surface (or a focused `AttachJob` component); assert selecting a job calls the mutation with that jobId, and selecting "None"/unlink calls it with `null`; assert the currently-linked job renders. For the analytics label: a small assertion that a `drive` source row renders as "Drive" (extend the existing hiring `page.test.tsx` fixture with a `{ source: 'drive', ... }` row).

- [ ] **Step 3: Implement**

- `lib/types.ts`: add `jobId: string | null` to the `WalkInGroup` type.
- The groups hook file: add `useSetGroupJob(groupId)` — `useMutation` calling `apiFetch('/walk-in-groups/' + groupId + '/job', { method: 'PATCH', body: JSON.stringify({ jobId }) })`, invalidating the walk-in-groups query key on success.
- The walk-in-groups management surface: an **"Attach job"** control near each group — a `<select>` of open jobs (`useJobs`) plus a "None" option; `onChange` calls `useSetGroupJob(group.id).mutate(value === '' ? null : value)`. Show the linked job name when set. Gate on `canManage` (`role !== 'panel'`), matching the other group-management controls.
- `analytics/hiring/page.tsx`: extend the source-label map to include `drive: 'Drive'` (find the existing map that renders source names; if sources render raw, add a `SOURCE_LABEL = { manual:'Manual', exam:'Exam', application:'Application', drive:'Drive' }` and use it in the source table).

- [ ] **Step 4: Run — expect PASS**, then web typecheck, commit

```bash
cd "D:/exam app/apps/web" && npx jest <the touched test files> && npx tsc --noEmit
git add apps/web/lib apps/web/app/\(recruiter\) && git commit -m "feat(drives): attach-job control on walk-in groups + Drive analytics source label"
```
(Adjust the `git add` paths to the actual files touched.)

---

## Task 5: Whole-feature verification

**Files:** none.

- [ ] **Step 1: Full backend suite + typecheck**

```bash
cd "D:/exam app" && npx jest --config apps/api/jest.config.js && npx tsc -p apps/api/tsconfig.json --noEmit
```
Expected: all green; exam-runtime untouched.

- [ ] **Step 2: Full web suite + typecheck**

```bash
cd "D:/exam app/apps/web" && npx jest --maxWorkers=2 && npx tsc --noEmit
```

- [ ] **Step 3: Browser smoke (post-deploy)** — attach a job to a walk-in group; register via the public `/walk-in/:orgSlug?group=` link; confirm the candidate appears on the job's pipeline board with `enteredVia=drive`; confirm "Drive" shows in the hiring-analytics source panel; unlink the job and confirm the entry remains.

- [ ] **Step 4: Proceed to the final whole-branch review + finishing-a-development-branch.**

---

## Self-Review

**Spec coverage:**
- `WalkInGroup.jobId` (SetNull) + `enteredVia='drive'` → Task 1. ✅
- `upsertDriveEntry` stamp-if-absent + register hook (via exam's `walkInGroupId` → group `jobId`, any registration) → Task 2. ✅
- `setJob` + backfill from existing group registrants; `pipeline:manage` `PATCH /walk-in-groups/:id/job`; `jobId` in read responses → Task 3. ✅
- Attach-job control + `'drive'→'Drive'` analytics label → Task 4. ✅
- No new write model beyond one column; QR/self-reg untouched (reused) → nothing adds it. ✅
- Edge cases (existing entry not reset; unlink leaves entries; job delete SetNull; backfill idempotent; group with no jobId no-op) → covered by Task 2/3 tests. ✅

**Placeholder scan:** the frontend Task 4 file paths are "locate then wire" (the walk-in-groups hook/surface path is discovered via grep in Step 1) — the exact files are named as candidates with the grep to confirm them, not left as TBD. No placeholder logic; all backend code is complete.

**Type consistency:** `upsertDriveEntry(tx, context, jobId, candidateId)`, `setJob(ctx, actorUserId, groupId, jobId|null)`, `enteredVia='drive'`, `WalkInGroup.jobId`, and the `PATCH /walk-in-groups/:id/job` route are used identically across tasks and match the spec.

**Circular-dependency note:** Tasks 2 and 3 both import `PipelineModule` into a module (`WalkInModule`, `WalkInGroupsModule`). `PipelineModule` imports neither, so no cycle — but each task's Step explicitly says to STOP and report if Nest reports one, since that would signal an unexpected import.
