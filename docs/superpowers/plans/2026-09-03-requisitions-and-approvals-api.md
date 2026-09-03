# Requisitions & Approvals — API Implementation Plan (Phase 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the backend for job requisitions + a configurable, subject-polymorphic multi-step approval subsystem (requisition & offer gates) with a lightweight org hierarchy that dynamic approvers resolve against.

**Architecture:** One generic `ApprovalsService` engine over four new Prisma models, called from the existing `pipeline` (requisition) and `offers` (offer) services. Each in-flight request freezes its resolved chain; gates default disabled so existing flows are untouched. NestJS + Prisma + SQL Server, multi-tenant via `TenantPrismaService.forTenant`.

**Tech Stack:** NestJS, Prisma (SQL Server), Jest. RBAC via `@RequirePermissions`. Notifications via `NotificationsService.notify`. Audit via `AuditService.record`.

**Spec:** `docs/superpowers/specs/2026-09-03-requisitions-and-approvals-design.md`

## Global Constraints

- **Multi-tenant:** every DB access goes through `this.tenantPrisma.forTenant(context, (tx) => …)`; never raw Prisma. New tables carry `organization_id` + an RLS policy matching existing tables.
- **IDs:** `String @id @default(uuid()) @db.UniqueIdentifier`; timestamps `@map("created_at")` / `@map("updated_at")`.
- **Gates default DISABLED** — when a gate is off, the existing job/offer flow behaves byte-identically to today. No retroactive changes to live `open` jobs / `sent` offers.
- **Immutable in-flight:** a request's `chainSnapshotJson` (with dynamic approvers already resolved to concrete userIds) is frozen at submit; later config/manager edits never reroute it.
- **Never hard-block all hiring:** an empty/unresolvable resolved chain auto-passes with an audit record (and a notification for dynamic-resolution misses).
- **Concurrency:** step transitions use the repo's conditional-update idiom (`where: { id, status, currentStepPosition }`, check `count`), mirroring `offers.service.sendOffer`.
- **Migrations (SQL Server hazards):** no same-batch column references; `EXEC`-wrap statements that need it (per prior migration incidents).
- **Machine caveat:** this box fakes mass jest failures under load — run new suites **isolated** (`-t`/single file), not the whole repo, when validating.
- **NEVER `npm install` in a worktree.**

---

### Task 1: Schema + migration (new tables, Job/User/Offer fields, RLS)

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260903120000_requisitions_and_approvals/migration.sql`

**Interfaces:**
- Produces: Prisma models `ApprovalChain`, `ApprovalChainStep`, `ApprovalRequest`, `ApprovalDecision`; new `Job` fields (`department`, `hiringManagerId`, `headcount`, `salaryMin`, `salaryMax`, `salaryCurrency`); `User.managerId`. `Offer.status` gains a `pending_approval`/`approved` value (no column change).

- [ ] **Step 1: Add models + fields to `schema.prisma`**

```prisma
model ApprovalChain {
  id             String              @id @default(uuid()) @db.UniqueIdentifier
  organizationId String              @map("organization_id") @db.UniqueIdentifier
  gate           String              // 'requisition' | 'offer'
  enabled        Boolean             @default(false)
  createdAt      DateTime            @default(now()) @map("created_at")
  updatedAt      DateTime            @updatedAt @map("updated_at")
  steps          ApprovalChainStep[]

  @@unique([organizationId, gate])
  @@map("approval_chains")
}

model ApprovalChainStep {
  id              String        @id @default(uuid()) @db.UniqueIdentifier
  chainId         String        @map("chain_id") @db.UniqueIdentifier
  position        Int
  name            String        @db.NVarChar(200)
  approverType    String        @map("approver_type") // 'users' | 'reporting_manager' | 'hiring_manager'
  approverUserIds String?       @map("approver_user_ids") @db.NVarChar(Max) // JSON array
  managerLevel    Int?          @map("manager_level")
  chain           ApprovalChain @relation(fields: [chainId], references: [id], onDelete: Cascade, onUpdate: NoAction)

  @@index([chainId])
  @@map("approval_chain_steps")
}

model ApprovalRequest {
  id                  String             @id @default(uuid()) @db.UniqueIdentifier
  organizationId      String             @map("organization_id") @db.UniqueIdentifier
  gate                String
  subjectType         String             @map("subject_type") // 'job' | 'offer'
  subjectId           String             @map("subject_id") @db.UniqueIdentifier
  status              String             @default("pending_approval")
  currentStepPosition Int                @map("current_step_position")
  submittedByUserId   String             @map("submitted_by_user_id") @db.UniqueIdentifier
  submittedAt         DateTime           @default(now()) @map("submitted_at")
  decidedAt           DateTime?          @map("decided_at")
  chainSnapshotJson   String             @map("chain_snapshot_json") @db.NVarChar(Max)
  createdAt           DateTime           @default(now()) @map("created_at")
  updatedAt           DateTime           @updatedAt @map("updated_at")
  decisions           ApprovalDecision[]

  @@index([organizationId, status])
  @@index([subjectType, subjectId])
  @@map("approval_requests")
}

model ApprovalDecision {
  id             String          @id @default(uuid()) @db.UniqueIdentifier
  requestId      String          @map("request_id") @db.UniqueIdentifier
  stepPosition   Int             @map("step_position")
  approverUserId String          @map("approver_user_id") @db.UniqueIdentifier
  decision       String          // 'approved' | 'rejected'
  note           String?         @db.NVarChar(Max)
  decidedAt      DateTime        @default(now()) @map("decided_at")
  request        ApprovalRequest @relation(fields: [requestId], references: [id], onDelete: Cascade, onUpdate: NoAction)

  @@index([requestId])
  @@map("approval_decisions")
}
```

Add to `model Job`:
```prisma
  department      String?  @db.NVarChar(200)
  hiringManagerId String?  @map("hiring_manager_id") @db.UniqueIdentifier
  headcount       Int?
  salaryMin       Int?     @map("salary_min")
  salaryMax       Int?     @map("salary_max")
  salaryCurrency  String?  @map("salary_currency") @db.NVarChar(10)
```

Add to `model User`:
```prisma
  managerId String? @map("manager_id") @db.UniqueIdentifier
```

- [ ] **Step 2: Write the migration SQL**

Create `migration.sql`. Model the RLS block on an existing table's migration (open `apps/api/prisma/migrations/20260826100004_user_notifications_rls/migration.sql` and copy its `sp_set_session_context`/security-policy pattern verbatim for each new table). Skeleton:

```sql
CREATE TABLE [approval_chains] (
  [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [approval_chains_pkey] PRIMARY KEY,
  [organization_id] UNIQUEIDENTIFIER NOT NULL,
  [gate] NVARCHAR(1000) NOT NULL,
  [enabled] BIT NOT NULL CONSTRAINT [approval_chains_enabled_df] DEFAULT 0,
  [created_at] DATETIME2 NOT NULL CONSTRAINT [approval_chains_created_at_df] DEFAULT CURRENT_TIMESTAMP,
  [updated_at] DATETIME2 NOT NULL,
  CONSTRAINT [approval_chains_org_gate_key] UNIQUE ([organization_id],[gate])
);
-- approval_chain_steps, approval_requests, approval_decisions: same shape as the Prisma models above.
ALTER TABLE [jobs] ADD [department] NVARCHAR(200) NULL, [hiring_manager_id] UNIQUEIDENTIFIER NULL,
  [headcount] INT NULL, [salary_min] INT NULL, [salary_max] INT NULL, [salary_currency] NVARCHAR(10) NULL;
ALTER TABLE [users] ADD [manager_id] UNIQUEIDENTIFIER NULL;
-- RLS: enable + create security policy per new table, copied from the user_notifications_rls migration.
```

Validate the raw SQL applies against a scratch batch before finalizing (no same-batch column refs; `EXEC('…')`-wrap any `CREATE INDEX`/policy statement that errored in prior incidents).

- [ ] **Step 3: Apply + generate**

Run (in `apps/api`):
```bash
npx prisma migrate deploy && npx prisma generate
```
Expected: migration `20260903120000_requisitions_and_approvals` applied; client regenerated.

- [ ] **Step 4: Smoke test the models exist**

Create `apps/api/src/approvals/approvals.schema.spec.ts`:
```ts
import { PrismaClient } from '@prisma/client';
it('exposes the new approval models on the client', () => {
  const c = new PrismaClient();
  expect(c.approvalChain).toBeDefined();
  expect(c.approvalChainStep).toBeDefined();
  expect(c.approvalRequest).toBeDefined();
  expect(c.approvalDecision).toBeDefined();
});
```
Run: `npx jest src/approvals/approvals.schema.spec.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations apps/api/src/approvals/approvals.schema.spec.ts
git commit -m "feat(approvals): schema + migration for requisitions, approval chains, org hierarchy"
```

---

### Task 2: Shared constants & types

**Files:**
- Create: `packages/shared/src/approvals/approval-types.ts`
- Modify: `packages/shared/src/index.ts` (export the new module)

**Interfaces:**
- Produces: `APPROVAL_GATES = ['requisition','offer'] as const`; `type ApprovalGate`; `APPROVER_TYPES = ['users','reporting_manager','hiring_manager'] as const`; `type ApproverType`; `APPROVAL_NOTIFICATION_TYPES` (`approval.requested|approved|rejected|cancelled`); `interface ResolvedStep { position: number; name: string; approverType: ApproverType; approverUserIds: string[] }`.

- [ ] **Step 1: Write the failing test**

Create `packages/shared/src/approvals/approval-types.spec.ts`:
```ts
import { APPROVAL_GATES, APPROVER_TYPES } from './approval-types';
it('defines the two gates and three approver types', () => {
  expect(APPROVAL_GATES).toEqual(['requisition', 'offer']);
  expect(APPROVER_TYPES).toEqual(['users', 'reporting_manager', 'hiring_manager']);
});
```

- [ ] **Step 2: Run to verify it fails** — `npx jest packages/shared/src/approvals` → FAIL (module not found).

- [ ] **Step 3: Implement `approval-types.ts`**

```ts
export const APPROVAL_GATES = ['requisition', 'offer'] as const;
export type ApprovalGate = (typeof APPROVAL_GATES)[number];

export const APPROVER_TYPES = ['users', 'reporting_manager', 'hiring_manager'] as const;
export type ApproverType = (typeof APPROVER_TYPES)[number];

export const APPROVAL_NOTIFICATION_TYPES = {
  requested: 'approval.requested',
  approved: 'approval.approved',
  rejected: 'approval.rejected',
  cancelled: 'approval.cancelled',
} as const;

export interface ResolvedStep {
  position: number;
  name: string;
  approverType: ApproverType;
  approverUserIds: string[];
}
```
Add `export * from './approvals/approval-types';` to `packages/shared/src/index.ts`.

- [ ] **Step 4: Build shared + run test**

```bash
npm run build -w @exam-platform/shared && npx jest packages/shared/src/approvals
```
Expected: PASS. (Rebuilding shared is required so the API picks up the new exports — see `reference_web_standalone_static_copy` conventions for shared dist.)

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/approvals packages/shared/src/index.ts
git commit -m "feat(approvals): shared gate/approver/notification type constants"
```

---

### Task 3: RBAC seed — `approvals:configure`

**Files:**
- Modify: `apps/api/prisma/seed.ts` (PERMISSIONS list + `org_admin` role permissions)

**Interfaces:**
- Produces: permission key `approvals:configure`, granted to `org_admin`.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/approvals/approvals-permission.spec.ts`:
```ts
import { PERMISSIONS, ROLE_PERMISSIONS } from '../../prisma/seed';
it('seeds approvals:configure for org_admin', () => {
  expect(PERMISSIONS.some((p) => p.key === 'approvals:configure')).toBe(true);
  expect(ROLE_PERMISSIONS.org_admin).toContain('approvals:configure');
});
```
(If `PERMISSIONS`/`ROLE_PERMISSIONS` aren't exported from `seed.ts`, add `export` to those consts as part of this step.)

- [ ] **Step 2: Run to verify it fails** — `npx jest src/approvals/approvals-permission.spec.ts` → FAIL.

- [ ] **Step 3: Add the permission + grant**

In `seed.ts` PERMISSIONS array add:
```ts
{ key: 'approvals:configure', description: 'Configure approval chains and staff reporting managers' },
```
In `ROLE_PERMISSIONS.org_admin` add `'approvals:configure'`.

- [ ] **Step 4: Run test** → PASS. Then apply the seed: `npx prisma db seed` (idempotent upsert).

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/seed.ts apps/api/src/approvals/approvals-permission.spec.ts
git commit -m "feat(approvals): seed approvals:configure permission for org_admin"
```

---

### Task 4: User `managerId` — DTO + update

**Files:**
- Modify: `apps/api/src/users/dto/update-user.dto.ts`, `apps/api/src/users/users.service.ts`
- Test: `apps/api/src/users/users.service.spec.ts`

**Interfaces:**
- Consumes: existing `updateUser(context, id, dto)`.
- Produces: `UpdateUserDto.managerId?: string`; `updateUser` persists `managerId`.

- [ ] **Step 1: Write the failing test** (add to `users.service.spec.ts`)

```ts
it('updates a user managerId', async () => {
  const tx = mockTx(); // existing spec helper
  await service.updateUser(ctx, 'u1', { managerId: 'mgr1' });
  expect(tx.user.update).toHaveBeenCalledWith(
    expect.objectContaining({ where: { id: 'u1' }, data: expect.objectContaining({ managerId: 'mgr1' }) }),
  );
});
```

- [ ] **Step 2: Run** → FAIL (managerId not passed through).

- [ ] **Step 3: Implement** — add `@IsOptional() @IsUUID() managerId?: string;` to `UpdateUserDto`; include `managerId` in the `updateUser` update `data`. Guard self-reference: reject `managerId === id` with `BadRequestException('A user cannot report to themselves')`.

- [ ] **Step 4: Run** → PASS.

- [ ] **Step 5: Commit**
```bash
git add apps/api/src/users
git commit -m "feat(approvals): allow setting a user's reporting manager"
```

---

### Task 5: Approver resolver

**Files:**
- Create: `apps/api/src/approvals/approver-resolver.ts`
- Test: `apps/api/src/approvals/approver-resolver.spec.ts`

**Interfaces:**
- Consumes: a Prisma `tx` (from `forTenant`), `Job.hiringManagerId`, `User.managerId`.
- Produces:
  `resolveSteps(tx, args: { steps: ChainStepInput[]; submitterUserId: string; gate: ApprovalGate; subjectId: string }): Promise<{ resolved: ResolvedStep[]; skipped: { position: number; reason: string }[] }>`
  where `ChainStepInput = { position; name; approverType; approverUserIds: string[]; managerLevel: number | null }`.

- [ ] **Step 1: Write the failing tests**

```ts
describe('resolveSteps', () => {
  it('passes users steps through, dropping deactivated users', async () => { /* tx.user.findMany returns only active */ });
  it('resolves reporting_manager level 1 to the submitter\'s manager', async () => { /* walk managerId once */ });
  it('resolves reporting_manager level 2 up two hops', async () => {});
  it('resolves hiring_manager for the requisition gate from job.hiringManagerId', async () => {});
  it('resolves hiring_manager for the offer gate via offer -> entry -> job', async () => {});
  it('skips a step (with reason) when a manager is not set', async () => {});
});
```
Write each with a mocked `tx` whose `user.findUnique/findMany`, `job.findUnique`, `offer.findUnique` return controlled rows. Assert `resolved` contents and `skipped` reasons.

- [ ] **Step 2: Run** → FAIL (module not found).

- [ ] **Step 3: Implement `approver-resolver.ts`**

```ts
import type { ApprovalGate, ResolvedStep, ApproverType } from '@exam-platform/shared';

export interface ChainStepInput {
  position: number; name: string; approverType: ApproverType;
  approverUserIds: string[]; managerLevel: number | null;
}

async function walkManagers(tx: any, startUserId: string, levels: number): Promise<string | null> {
  let current: string | null = startUserId;
  for (let i = 0; i < levels && current; i++) {
    const u = await tx.user.findUnique({ where: { id: current }, select: { managerId: true } });
    current = u?.managerId ?? null;
  }
  return current;
}

async function activeIds(tx: any, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const rows = await tx.user.findMany({ where: { id: { in: ids }, status: 'active' }, select: { id: true } });
  return rows.map((r: { id: string }) => r.id);
}

export async function resolveSteps(
  tx: any,
  args: { steps: ChainStepInput[]; submitterUserId: string; gate: ApprovalGate; subjectId: string },
): Promise<{ resolved: ResolvedStep[]; skipped: { position: number; reason: string }[] }> {
  const resolved: ResolvedStep[] = [];
  const skipped: { position: number; reason: string }[] = [];
  for (const s of args.steps) {
    let ids: string[] = [];
    if (s.approverType === 'users') {
      ids = await activeIds(tx, s.approverUserIds);
    } else if (s.approverType === 'reporting_manager') {
      const mgr = await walkManagers(tx, args.submitterUserId, s.managerLevel ?? 1);
      ids = mgr ? await activeIds(tx, [mgr]) : [];
    } else if (s.approverType === 'hiring_manager') {
      let jobId = args.subjectId;
      if (args.gate === 'offer') {
        const offer = await tx.offer.findUnique({ where: { id: args.subjectId }, select: { pipelineEntry: { select: { jobId: true } } } });
        jobId = offer?.pipelineEntry?.jobId ?? '';
      }
      const job = jobId ? await tx.job.findUnique({ where: { id: jobId }, select: { hiringManagerId: true } }) : null;
      ids = job?.hiringManagerId ? await activeIds(tx, [job.hiringManagerId]) : [];
    }
    if (ids.length === 0) {
      skipped.push({ position: s.position, reason: `No approver resolved for step "${s.name}" (${s.approverType})` });
      continue;
    }
    resolved.push({ position: s.position, name: s.name, approverType: s.approverType, approverUserIds: ids });
  }
  // Re-number resolved steps to a contiguous 0..n so currentStepPosition math is simple.
  resolved.forEach((r, i) => (r.position = i));
  return { resolved, skipped };
}
```

- [ ] **Step 4: Run** → PASS.

- [ ] **Step 5: Commit**
```bash
git add apps/api/src/approvals/approver-resolver.ts apps/api/src/approvals/approver-resolver.spec.ts
git commit -m "feat(approvals): dynamic approver resolver (users, reporting manager, hiring manager)"
```

---

### Task 6: ApprovalsModule + `ApprovalsService.submit`

**Files:**
- Create: `apps/api/src/approvals/approvals.service.ts`, `apps/api/src/approvals/approvals.module.ts`
- Modify: `apps/api/src/app.module.ts` (register `ApprovalsModule`)
- Test: `apps/api/src/approvals/approvals.service.spec.ts`

**Interfaces:**
- Consumes: `TenantPrismaService`, `NotificationsService`, `AuditService`, `resolveSteps`.
- Produces:
  `submit(context, gate, subjectId, submitterUserId): Promise<{ status: 'approved' | 'pending_approval'; requestId?: string }>` — returns `approved` when the chain is disabled OR auto-passes (caller then flips the subject to its approved state); returns `pending_approval` + `requestId` when a request was created (caller flips subject to `pending_approval`).
- Note: `submit` does **not** itself mutate `Job`/`Offer` status — the caller owns the subject write (keeps subject-specific transitions in the owning service). `submit` only creates the request, notifies, audits, and reports what the caller should do.

- [ ] **Step 1: Write the failing tests**

```ts
describe('ApprovalsService.submit', () => {
  it('returns approved when the gate chain is disabled', async () => { /* chain.enabled=false -> {status:'approved'} , no request created */ });
  it('auto-passes (approved) + audits when the resolved chain has zero steps', async () => {});
  it('creates a pending request at step 0, freezes the snapshot, and notifies step-0 approvers', async () => {});
  it('notifies submitter+admins about skipped dynamic steps', async () => {});
});
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement `submit`**

```ts
async submit(context: TenantContext, gate: ApprovalGate, subjectId: string, submitterUserId: string) {
  const subjectType = gate === 'requisition' ? 'job' : 'offer';
  return this.tenantPrisma.forTenant(context, async (tx) => {
    const chain = await tx.approvalChain.findUnique({
      where: { organizationId_gate: { organizationId: context.organizationId as string, gate } },
      include: { steps: { orderBy: { position: 'asc' } } },
    });
    if (!chain || !chain.enabled) return { status: 'approved' as const };

    const stepInputs = chain.steps.map((s) => ({
      position: s.position, name: s.name, approverType: s.approverType as ApproverType,
      approverUserIds: s.approverUserIds ? JSON.parse(s.approverUserIds) : [],
      managerLevel: s.managerLevel,
    }));
    const { resolved, skipped } = await resolveSteps(tx, { steps: stepInputs, submitterUserId, gate, subjectId });

    for (const sk of skipped) {
      await this.audit.record(context, { actorUserId: submitterUserId, action: 'approval.step_skipped', entityType: subjectType, entityId: subjectId });
    }
    if (resolved.length === 0) {
      await this.audit.record(context, { actorUserId: submitterUserId, action: 'approval.auto_passed', entityType: subjectType, entityId: subjectId });
      return { status: 'approved' as const };
    }

    const request = await tx.approvalRequest.create({
      data: {
        organizationId: context.organizationId as string, gate, subjectType, subjectId,
        status: 'pending_approval', currentStepPosition: 0, submittedByUserId: submitterUserId,
        chainSnapshotJson: JSON.stringify(resolved),
      },
    });
    await this.audit.record(context, { actorUserId: submitterUserId, action: 'approval.submitted', entityType: subjectType, entityId: subjectId });
    // Notify (outside tx side effects are fine; notify uses its own forTenant) — do after tx via return, or call here with tx-independent service:
    this._notifyStep(context, submitterUserId, resolved[0], gate, subjectId, request.id);
    if (skipped.length) this._notifySkipped(context, submitterUserId, skipped, subjectType, subjectId);
    return { status: 'pending_approval' as const, requestId: request.id };
  });
}
```
Add private `_notifyStep` (→ `NotificationsService.notify(context, submitter, step.approverUserIds, APPROVAL_NOTIFICATION_TYPES.requested, { entityType: subjectType, entityId: subjectId, linkPath: `/v2/approvals/${requestId}` })`) and `_notifySkipped` (→ notify submitter + `approvals:configure` holders). Resolve admin ids via `tx.rolePermission`/`user` lookup or a helper; keep it a single query.

- [ ] **Step 4: Run** → PASS.

- [ ] **Step 5: Create the module + register**

`approvals.module.ts`:
```ts
@Module({
  imports: [NotificationsModule, AuditModule],
  providers: [ApprovalsService],
  controllers: [], // added in Tasks 9-10
  exports: [ApprovalsService],
})
export class ApprovalsModule {}
```
Add `ApprovalsModule` to `app.module.ts` imports. Run `npx jest src/approvals/approvals.service.spec.ts` → PASS.

- [ ] **Step 6: Commit**
```bash
git add apps/api/src/approvals apps/api/src/app.module.ts
git commit -m "feat(approvals): ApprovalsService.submit + module wiring"
```

---

### Task 7: `ApprovalsService.decide` (approve/reject + concurrency)

**Files:**
- Modify: `apps/api/src/approvals/approvals.service.ts`, spec.

**Interfaces:**
- Produces: `decide(context, requestId, actorUserId, decision: 'approved'|'rejected', note?): Promise<{ requestStatus: string; subjectResolved: boolean; subjectType: string; subjectId: string; gate: ApprovalGate }>` — `subjectResolved` true when the caller must flip the subject (approve→final, or reject). The controller (Task 10) maps that to the subject write via the owning service.

- [ ] **Step 1: Write the failing tests**

```ts
describe('decide', () => {
  it('advances to the next step when a non-final step is approved', async () => {});
  it('marks the request approved + subjectResolved on final-step approval', async () => {});
  it('marks rejected + subjectResolved on reject, storing the note', async () => {});
  it('throws 403 when actor is not in the current step approvers', async () => {});
  it('the conditional update makes a second concurrent decide a no-op (409)', async () => {});
});
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement `decide`** (conditional update mirrors `offers.service.sendOffer`)

```ts
async decide(context, requestId, actorUserId, decision, note?) {
  return this.tenantPrisma.forTenant(context, async (tx) => {
    const req = await tx.approvalRequest.findFirst({ where: { id: requestId, organizationId: context.organizationId as string } });
    if (!req || req.status !== 'pending_approval') throw new ConflictException('Request is not open for approval');
    const steps: ResolvedStep[] = JSON.parse(req.chainSnapshotJson);
    const step = steps[req.currentStepPosition];
    if (!step || !step.approverUserIds.includes(actorUserId)) throw new ForbiddenException('Not an approver for the current step');

    await tx.approvalDecision.create({ data: { requestId, stepPosition: req.currentStepPosition, approverUserId: actorUserId, decision, note: note ?? null } });

    const isLast = req.currentStepPosition >= steps.length - 1;
    if (decision === 'rejected') {
      const upd = await tx.approvalRequest.updateMany({ where: { id: requestId, status: 'pending_approval', currentStepPosition: req.currentStepPosition }, data: { status: 'rejected', decidedAt: new Date() } });
      if (upd.count === 0) throw new ConflictException('Already actioned');
      return { requestStatus: 'rejected', subjectResolved: true, subjectType: req.subjectType, subjectId: req.subjectId, gate: req.gate as ApprovalGate };
    }
    if (isLast) {
      const upd = await tx.approvalRequest.updateMany({ where: { id: requestId, status: 'pending_approval', currentStepPosition: req.currentStepPosition }, data: { status: 'approved', decidedAt: new Date() } });
      if (upd.count === 0) throw new ConflictException('Already actioned');
      return { requestStatus: 'approved', subjectResolved: true, subjectType: req.subjectType, subjectId: req.subjectId, gate: req.gate as ApprovalGate };
    }
    const upd = await tx.approvalRequest.updateMany({ where: { id: requestId, status: 'pending_approval', currentStepPosition: req.currentStepPosition }, data: { currentStepPosition: req.currentStepPosition + 1 } });
    if (upd.count === 0) throw new ConflictException('Already actioned');
    return { requestStatus: 'pending_approval', subjectResolved: false, subjectType: req.subjectType, subjectId: req.subjectId, gate: req.gate as ApprovalGate };
  });
}
```
After the tx: audit each decision; notify — on advance, next step's approvers (`approval.requested`); on approve-final, submitter (`approval.approved`); on reject, submitter (`approval.rejected`). (Fetch submitter/next-step ids from the request/snapshot.)

- [ ] **Step 4: Run** → PASS.

- [ ] **Step 5: Commit**
```bash
git add apps/api/src/approvals
git commit -m "feat(approvals): decide (approve/reject) with conditional-update concurrency guard"
```

---

### Task 8: `ApprovalsService.cancel`

**Files:** Modify `approvals.service.ts` + spec.

**Interfaces:**
- Produces: `cancel(context, requestId, actorUserId, isConfigurer: boolean): Promise<{ subjectType; subjectId; gate }>` — throws 403 unless actor is submitter or `isConfigurer`; sets request `cancelled`; caller flips subject to `draft`.

- [ ] **Step 1: Write the failing tests** — submitter can cancel; configurer can cancel; a third party gets 403; already-decided request → 409.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** — `findFirst` open request; authorize (`req.submittedByUserId === actorUserId || isConfigurer`); `updateMany` guard on `status:'pending_approval'`; notify current-step approvers `approval.cancelled`; audit.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(approvals): cancel an in-flight approval request"`

---

### Task 9: Chain config — service methods, DTO, controller, validation

**Files:**
- Create: `apps/api/src/approvals/approvals-config.controller.ts`, `apps/api/src/approvals/dto/upsert-chain.dto.ts`
- Modify: `approvals.service.ts` (add `getChains`, `upsertChain`), `approvals.module.ts` (register controller)
- Test: `apps/api/src/approvals/approvals-config.spec.ts`

**Interfaces:**
- Produces:
  `GET /organizations/approvals/chains` → `{ requisition: ChainDto, offer: ChainDto }`
  `PUT /organizations/approvals/chains/:gate` body `UpsertChainDto { enabled: boolean; steps: { name; approverType; approverUserIds?: string[]; managerLevel?: number }[] }`
  Both `@RequirePermissions('approvals:configure')`.

- [ ] **Step 1: Write failing tests** — validation: enabled + a `users` step with empty `approverUserIds` → 400; enabled + a `reporting_manager` step with no `managerLevel` (default to 1 or 400 — default to 1); enabled + zero steps → allowed; positions normalized 0..n on save; upsert replaces existing steps.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** DTO with `class-validator` (`@IsBoolean`, `@ValidateNested`, `@IsIn(APPROVER_TYPES)`, conditional check via a custom validator or in-service). `upsertChain`: within `forTenant`, `upsert` the `ApprovalChain`, delete existing steps, `createMany` normalized steps (position = index). `getChains`: return both gates, creating an empty disabled default row shape if absent (don't persist on read).
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(approvals): chain config API (get/put) with validation"`

---

### Task 10: Approvals read + decide controller

**Files:**
- Create: `apps/api/src/approvals/approvals.controller.ts`
- Modify: `approvals.service.ts` (add `listRequests`, `getRequestDetail`), `approvals.module.ts`
- Test: `apps/api/src/approvals/approvals.controller.spec.ts`

**Interfaces:**
- Produces:
  `GET /approvals/requests?scope=inbox|submitted&status=` → list (inbox = requests where actor ∈ current step approvers; submitted = `submittedByUserId === actor`)
  `GET /approvals/requests/:id` → detail (steps snapshot, decisions, subject summary)
  `POST /approvals/requests/:id/decide` `{ decision, note? }` → calls `ApprovalsService.decide`, then flips the subject via a small dispatch (see below).
- The decide endpoint, after `decide(...)` returns `subjectResolved`, calls the owning service to flip the subject:
  - `subjectType==='job'` + approved → `pipeline.markRequisitionApproved(context, subjectId)`; rejected/cancel → `pipeline.markRequisitionDraft(...)`.
  - `subjectType==='offer'` + approved → `offers.markApproved(...)`; rejected/cancel → `offers.markDraft(...)`.
  (These small subject-flip methods are added in Tasks 11–12.)

- [ ] **Step 1: Write failing tests** — inbox filters by current-step membership (ponytail: fetch org pending requests, filter in app); submitted filters by submitter; decide wires to service + subject flip; leave a `// ponytail: in-app inbox filter; denormalize current_approver if volume grows` comment.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** the controller (`@Controller('approvals')`, `JwtAuthGuard` only — no `@RequirePermissions` on decide; inbox reads use `@CurrentUserId`). `listRequests` app-filters the snapshot; `getRequestDetail` joins decisions + a subject summary (title for job, candidate/comp for offer).
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(approvals): approver inbox + decide endpoints"`

---

### Task 11: Requisition integration (pipeline)

**Files:**
- Modify: `apps/api/src/pipeline/pipeline.service.ts`, `apps/api/src/pipeline/pipeline.controller.ts`, `apps/api/src/pipeline/dto/*` (job create/update), `apps/api/src/pipeline/pipeline.module.ts` (import `ApprovalsModule`)
- Test: `apps/api/src/pipeline/pipeline.service.spec.ts`

**Interfaces:**
- Consumes: `ApprovalsService.submit`, `getChains` (to know if the req gate is enabled).
- Produces: job DTO fields (`department, hiringManagerId, headcount, salaryMin, salaryMax, salaryCurrency`); `submitRequisition(context, actor, jobId)`; `markRequisitionApproved(context, jobId)` (→ status `open`); `markRequisitionDraft(context, jobId)`; gating in `addEntry` + `setPublicApply`.
  New endpoints: `POST /pipeline/jobs/:id/submit`, `POST /pipeline/jobs/:id/approval/cancel`.

- [ ] **Step 1: Write failing tests**
```ts
it('creates a job as draft when the requisition gate is enabled', async () => {});
it('creates a job as open when the gate is disabled', async () => {});
it('refuses addEntry when the job is not open (409)', async () => {});
it('refuses setPublicApply when the job is not open (409)', async () => {});
it('submitRequisition -> pending when submit returns pending', async () => {});
it('submitRequisition -> open immediately when submit auto-passes', async () => {});
```
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** — add DTO fields (`@IsOptional()` validators); `createJob` checks `getChains().requisition.enabled` → initial `status='draft'` else `'open'`; add the guard in `addEntry`/`setPublicApply` (`if (job.status !== 'open') throw new ConflictException('Requisition not approved')`); `submitRequisition` calls `approvals.submit(ctx,'requisition',jobId,actor)` then, if `status==='approved'`, `markRequisitionApproved`; else leave `pending_approval`. Wire the two endpoints in the controller (`POST jobs/:id/submit` @RequirePermissions('pipeline:manage'); `POST jobs/:id/approval/cancel` → `approvals.cancel`).
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(approvals): requisition fields, submit + gating on jobs"`

---

### Task 12: Offer integration

**Files:**
- Modify: `apps/api/src/offers/offers.service.ts`, `apps/api/src/offers/offers.controller.ts`, `apps/api/src/offers/offers.module.ts` (import `ApprovalsModule`)
- Test: `apps/api/src/offers/offers.service.spec.ts`

**Interfaces:**
- Produces: `submitOffer(context, actor, offerId)`, `markApproved(context, offerId)` (status `approved`), `markDraft(context, offerId)`; a guard in `sendOffer` (gate on ⇒ require `status==='approved'`).
  New endpoints: `POST /offers/:id/submit`, `POST /offers/:id/approval/cancel`.

- [ ] **Step 1: Write failing tests**
```ts
it('sendOffer refuses unless status approved when the offer gate is on', async () => {});
it('sendOffer works from draft when the gate is off', async () => {});
it('submitOffer -> pending when submit returns pending', async () => {});
it('submitOffer -> approved immediately when submit auto-passes', async () => {});
```
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** — `submitOffer` calls `approvals.submit(ctx,'offer',offerId,actor)`; add the `sendOffer` guard (`if (gateEnabled && offer.status !== 'approved') throw new ConflictException('Offer not approved')`); `markApproved`/`markDraft` update status. Wire endpoints.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(approvals): offer submit + send gating"`

---

### Task 13: Subject read enrichment (approval summary)

**Files:**
- Modify: `apps/api/src/pipeline/pipeline.service.ts` (`getPipeline`, `listJobs`, `getJob`), `apps/api/src/offers/offers.service.ts` (offer reads)
- Test: the respective service specs.

**Interfaces:**
- Produces: an `approval` field on job + offer read payloads: `{ status: string; currentStep: number; steps: { name: string; state: 'pending'|'approved'|'rejected' }[] } | null`. Add a shared `ApprovalsService.getSummaryFor(context, subjectType, subjectId)` (or `getSummariesFor(ids)` batched) that reads the latest request + decisions.

- [ ] **Step 1: Write failing test** — a job with an open request returns an `approval` summary with `currentStep`; a job with no request returns `approval: null`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `getSummariesFor(context, subjectType, ids)` (one query for the latest request per subject + its decisions), map into the summary shape, attach in the read methods. Batch for the pipeline board / job list to avoid N+1.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(approvals): expose approval summary on job/offer reads"`

---

## Self-Review

**Spec coverage:**
- §2 data model → Task 1 (tables/fields), Task 4 (`User.managerId`). ✓
- §3 state machines & gating → Task 11 (requisition draft/open/gating), Task 12 (offer send gate). ✓
- §4 runtime (submit/decide/cancel/resolver/notify/audit/concurrency) → Tasks 5–8. ✓
- §4.6 integration points → Tasks 11 (pipeline), 12 (offers), 4 (users.managerId). ✓
- §5 RBAC → Task 3; decide-by-membership → Task 10. ✓
- §6 API surface → config Task 9, submit/cancel Tasks 11–12, inbox/decide Task 10, read enrichment Task 13, user managerId Task 4. ✓
- §8 testing → each task is TDD; migration check Task 1 Step 4; concurrency Task 7. ✓
- §9 rollout (gates default disabled, seed permission) → Task 1 default `enabled=false`, Task 3. ✓
- §10 YAGNI cuts → not built (correct). ✓
- **§7 UI is intentionally out of this plan** → Phase 2 (separate web plan).

**Placeholder scan:** the three tasks with condensed step bodies (8, 9, 12, 13) still name exact files, signatures, endpoints, and test cases; code idioms reference concrete existing patterns (`sendOffer` conditional update, `notify`, `audit.record`). No "TBD/handle edge cases" left.

**Type consistency:** `submit` returns `{status, requestId?}`; `decide` returns `{requestStatus, subjectResolved, subjectType, subjectId, gate}`; subject flips use `markRequisitionApproved/markRequisitionDraft` (Task 11) and `markApproved/markDraft` (Task 12) — names consistent between Task 10 (caller) and Tasks 11–12 (definers). `ResolvedStep` shape identical across Tasks 2/5/6/7. `resolveSteps` signature identical in Tasks 5 and 6.

---

## Phase 2 (Web/UI) — separate plan

The v2 UI (spec §7: Settings→Approvals, Staff Users manager field, job requisition fields + submit, offer approval, Approvals inbox, notification types) is a **companion plan**: `docs/superpowers/plans/2026-09-03-requisitions-and-approvals-web.md`. It depends on this API being in place and is written after Phase 1 is approved.
