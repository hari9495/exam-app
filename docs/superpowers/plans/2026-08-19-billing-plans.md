# Billing & Plans (Phase 1: Metering + Quota Enforcement) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make subscription plans + per-org usage limits real and enforced — meter seats/candidates/AI-credits/proctoring-minutes per org, hard-block the cost drivers (AI + proctoring) with HTTP 402, soft-warn the rest, and expose it in an org-admin billing page + super-admin plan catalog.

**Architecture:** Extend the existing `Plan` model + `Organization.planId` + `AiCreditUsage` metering. A pure billing core in `packages/shared` (period + limit math, shared by apps/api and apps/exam-runtime). A `BillingModule` (apps/api) with `UsageService` (the four live counts) and `QuotaService` (hard-assert-402 / soft-warn + notice dedup). Enforcement injected at a minimal set of existing action boundaries. Stripe/payments deferred to Phase 2 (seam columns added now, left null).

**Tech Stack:** NestJS 11 + Prisma (Azure SQL Server), `@exam-platform/shared` (TenantPrismaService, AuditService, EmailService), Next.js 16 + React Query, Jest.

## Global Constraints

- **Phase 1 only:** NO Stripe/payment/checkout/invoice code. Seam columns (`Organization.stripeCustomerId`/`stripeSubscriptionId`/`billingStatus`, `Plan.stripeProductId`/`stripePriceId`) are added but stay null/default.
- **Enforcement split:** HARD dimensions `ai_credits` + `proctoring_minutes` → throw `QuotaExceededException` (HTTP **402**) at/over limit. SOFT dimensions `seats` + `candidates` → never throw; warn only.
- **Limit semantics:** every limit is a non-negative integer; `over = used >= limit`; no "unlimited" sentinel (a large number = effectively unlimited).
- **Billing period:** calendar month, UTC. `periodStart` = first day of current month 00:00:00 UTC. Consumption metrics filter `>= periodStart`; seats/candidates are point-in-time.
- **Counts (exact):** seats = active users `user.count({ organizationId, status: 'active' })`; candidates = `candidate.count({ organizationId, erasedAt: null })`; AI credits = `aiCreditUsage._sum(credits) where occurredAt >= periodStart`; proctoring minutes = sum of `datediff(minute, started_at, submitted_at)` over attempts whose exam has `enableAntiCheating = true` and `submitted_at >= periodStart`.
- **Super-admin bypass:** `context.isSuperAdmin` (platform super-admin / acting-super-admin) is never quota-limited — checked first, returns immediately.
- **Reads via `TenantPrismaService.forTenant` (RLS).** Quota checks are read-only and run OUTSIDE any write transaction (a 402 never leaves a partial write).
- **SQL Server migration rules:** `created_at`/`period_start` defaults `GETUTCDATE()`; additive nullable/defaulted `ALTER TABLE ADD` (no same-batch reference → no EXEC-wrap); RLS `ALTER SECURITY POLICY` in a SEPARATE migration from `CREATE TABLE`; new per-org table `billing_notices` has NO FK to organizations (plain `organization_id` + RLS); permission seeded idempotently in the migration (`IF NOT EXISTS` INSERT into `permissions` + `role_permissions`) because `seed.ts` does not run on deploy.
- **New permission:** `org:manage_billing` granted to `org_admin`. Plan-catalog CRUD + assignment under existing `platform:manage_organizations`.
- **Audit:** plan create/edit, plan assignment via `AuditService`.

---

### Task 1: Schema + migrations

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (extend `Plan`, extend `Organization`, add `BillingNotice`)
- Modify: `apps/api/prisma/seed.ts` (grant `org:manage_billing`; set `seatLimit` on the seeded trial plan)
- Create: `apps/api/prisma/migrations/20260826090000_billing_phase1/migration.sql`
- Create: `apps/api/prisma/migrations/20260826090001_billing_phase1_rls/migration.sql`

**Interfaces:**
- Produces: `Plan.seatLimit/priceLabel/billingInterval/isPublic/stripeProductId/stripePriceId`; `Organization.billingStatus/stripeCustomerId/stripeSubscriptionId`; model `BillingNotice`; permission key `org:manage_billing`.

- [ ] **Step 1: Extend `Plan` in `schema.prisma`** (add to the existing model, alongside the three existing limits):

```prisma
  seatLimit       Int     @default(5)  @map("seat_limit")
  priceLabel      String? @map("price_label")
  billingInterval String  @default("month") @map("billing_interval")
  isPublic        Boolean @default(true)  @map("is_public")
  stripeProductId String? @map("stripe_product_id")
  stripePriceId   String? @map("stripe_price_id")
```

- [ ] **Step 2: Extend `Organization`** (add alongside existing fields):

```prisma
  billingStatus        String  @default("active") @map("billing_status")
  stripeCustomerId     String? @map("stripe_customer_id")
  stripeSubscriptionId String? @map("stripe_subscription_id")
```

- [ ] **Step 3: Add the `BillingNotice` model:**

```prisma
model BillingNotice {
  id             String   @id @default(uuid()) @db.UniqueIdentifier
  organizationId String   @map("organization_id") @db.UniqueIdentifier
  dimension      String
  threshold      Int
  periodStart    DateTime @map("period_start")
  createdAt      DateTime @default(now()) @map("created_at")

  @@unique([organizationId, dimension, threshold, periodStart])
  @@index([organizationId])
  @@map("billing_notices")
}
```

- [ ] **Step 4: Write the CREATE/ALTER migration** `20260826090000_billing_phase1/migration.sql`:

```sql
-- AlterTable: Plan additive columns
ALTER TABLE [dbo].[plans] ADD
  [seat_limit] INT NOT NULL CONSTRAINT [plans_seat_limit_df] DEFAULT 5,
  [price_label] NVARCHAR(1000),
  [billing_interval] NVARCHAR(1000) NOT NULL CONSTRAINT [plans_billing_interval_df] DEFAULT 'month',
  [is_public] BIT NOT NULL CONSTRAINT [plans_is_public_df] DEFAULT 1,
  [stripe_product_id] NVARCHAR(1000),
  [stripe_price_id] NVARCHAR(1000);

-- AlterTable: Organization seam columns
ALTER TABLE [dbo].[organizations] ADD
  [billing_status] NVARCHAR(1000) NOT NULL CONSTRAINT [organizations_billing_status_df] DEFAULT 'active',
  [stripe_customer_id] NVARCHAR(1000),
  [stripe_subscription_id] NVARCHAR(1000);

-- CreateTable
CREATE TABLE [dbo].[billing_notices] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organization_id] UNIQUEIDENTIFIER NOT NULL,
    [dimension] NVARCHAR(1000) NOT NULL,
    [threshold] INT NOT NULL,
    [period_start] DATETIME2 NOT NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [billing_notices_created_at_df] DEFAULT GETUTCDATE(),
    CONSTRAINT [billing_notices_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [billing_notices_org_dim_thr_period_key] UNIQUE NONCLUSTERED ([organization_id],[dimension],[threshold],[period_start])
);
CREATE NONCLUSTERED INDEX [billing_notices_organization_id_idx] ON [dbo].[billing_notices]([organization_id]);

-- Seed permission org:manage_billing (idempotent; seed.ts does not run on deploy)
DECLARE @permId UNIQUEIDENTIFIER = NEWID();
IF NOT EXISTS (SELECT 1 FROM dbo.permissions WHERE [key] = 'org:manage_billing')
  INSERT INTO dbo.permissions (id, [key], description)
  VALUES (@permId, 'org:manage_billing', 'View organization billing, plan, and usage');
DECLARE @pid UNIQUEIDENTIFIER = (SELECT id FROM dbo.permissions WHERE [key] = 'org:manage_billing');
IF NOT EXISTS (SELECT 1 FROM dbo.role_permissions WHERE role = 'org_admin' AND permission_id = @pid)
  INSERT INTO dbo.role_permissions (role, permission_id) VALUES ('org_admin', @pid);

-- Backfill a sane seat limit on the seeded trial plan
UPDATE dbo.plans SET seat_limit = 5 WHERE id = '00000000-0000-0000-0000-000000000001';
```

- [ ] **Step 5: Write the RLS migration** `20260826090001_billing_phase1_rls/migration.sql`:

```sql
-- Extend tenant isolation to billing_notices (separate migration: ALTER SECURITY POLICY
-- cannot share the CREATE TABLE batch). Same pattern as prior *_rls migrations.
ALTER SECURITY POLICY dbo.TenantAccessPolicy
ADD FILTER PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.billing_notices,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.billing_notices AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.billing_notices AFTER UPDATE;
```

- [ ] **Step 6: Update `seed.ts`** — add `'org:manage_billing'` to the `PERMISSIONS` array (with a description) and to `ROLE_PERMISSIONS.org_admin`; add `seatLimit: 5` to the trial-plan upsert data (id `00000000-0000-0000-0000-000000000001`). (Read the existing arrays first; append, don't reorder.)

- [ ] **Step 7: Regenerate client + validate + typecheck**

Run: `cd apps/api && npx prisma generate && npx prisma validate`
Expected: "schema is valid"; client regenerates.
Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/seed.ts apps/api/prisma/migrations/20260826090000_billing_phase1 apps/api/prisma/migrations/20260826090001_billing_phase1_rls
git commit -m "feat(billing): Plan/Organization billing columns + BillingNotice + org:manage_billing perm + RLS"
```

---

### Task 2: Pure billing core (shared)

Pure functions in `packages/shared` so apps/api and apps/exam-runtime share identical period/limit semantics.

**Files:**
- Create: `packages/shared/src/billing/billing-core.ts`
- Modify: `packages/shared/src/index.ts` (export the new module)
- Test: `packages/shared/src/billing/billing-core.spec.ts`

**Interfaces:**
- Produces (consumed by Tasks 3,4,8,9): `type BillingDimension = 'seats' | 'candidates' | 'ai_credits' | 'proctoring_minutes'`; `HARD_DIMENSIONS: readonly ['ai_credits','proctoring_minutes']`; `SOFT_DIMENSIONS: readonly ['seats','candidates']`; `currentPeriodStart(now: Date): Date`; `usageRatio(used: number, limit: number): number`; `warnThreshold(ratio: number): 80 | 100 | null`; `isOverLimit(used: number, limit: number): boolean`.

- [ ] **Step 1: Write the failing test** `packages/shared/src/billing/billing-core.spec.ts`:

```ts
import { currentPeriodStart, usageRatio, warnThreshold, isOverLimit, HARD_DIMENSIONS, SOFT_DIMENSIONS } from './billing-core';

describe('billing-core', () => {
  describe('currentPeriodStart', () => {
    it('returns the first of the month at 00:00:00 UTC', () => {
      expect(currentPeriodStart(new Date('2026-08-19T17:31:00.000Z')).toISOString()).toBe('2026-08-01T00:00:00.000Z');
    });
    it('handles the first instant of a month', () => {
      expect(currentPeriodStart(new Date('2026-01-01T00:00:00.000Z')).toISOString()).toBe('2026-01-01T00:00:00.000Z');
    });
  });
  describe('usageRatio', () => {
    it('is used/limit', () => { expect(usageRatio(50, 100)).toBe(0.5); });
    it('limit 0 with usage is Infinity, without usage is 0', () => {
      expect(usageRatio(1, 0)).toBe(Infinity);
      expect(usageRatio(0, 0)).toBe(0);
    });
  });
  describe('isOverLimit', () => {
    it('is true at or over the limit', () => {
      expect(isOverLimit(100, 100)).toBe(true);
      expect(isOverLimit(101, 100)).toBe(true);
      expect(isOverLimit(99, 100)).toBe(false);
    });
  });
  describe('warnThreshold', () => {
    it('null below 80%, 80 in [80,100), 100 at/over 100%', () => {
      expect(warnThreshold(0.79)).toBeNull();
      expect(warnThreshold(0.8)).toBe(80);
      expect(warnThreshold(0.99)).toBe(80);
      expect(warnThreshold(1.0)).toBe(100);
      expect(warnThreshold(1.5)).toBe(100);
    });
  });
  it('dimension groupings are correct', () => {
    expect([...HARD_DIMENSIONS]).toEqual(['ai_credits', 'proctoring_minutes']);
    expect([...SOFT_DIMENSIONS]).toEqual(['seats', 'candidates']);
  });
});
```

- [ ] **Step 2: Run it red**

Run: `cd packages/shared && npx jest src/billing/billing-core.spec.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement** `packages/shared/src/billing/billing-core.ts`:

```ts
export type BillingDimension = 'seats' | 'candidates' | 'ai_credits' | 'proctoring_minutes';

export const HARD_DIMENSIONS = ['ai_credits', 'proctoring_minutes'] as const;
export const SOFT_DIMENSIONS = ['seats', 'candidates'] as const;

// First instant of the current calendar month, in UTC. The billing "reset" is implicit:
// consumption aggregates filter on occurredAt/submittedAt >= this value, so the window moves.
export function currentPeriodStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
}

export function usageRatio(used: number, limit: number): number {
  if (limit <= 0) return used > 0 ? Infinity : 0;
  return used / limit;
}

export function isOverLimit(used: number, limit: number): boolean {
  return used >= limit;
}

export function warnThreshold(ratio: number): 80 | 100 | null {
  if (ratio >= 1) return 100;
  if (ratio >= 0.8) return 80;
  return null;
}
```

- [ ] **Step 4: Export from `packages/shared/src/index.ts`** — add `export * from './billing/billing-core';` (place it alongside the other `export *` lines).

- [ ] **Step 5: Run it green**

Run: `cd packages/shared && npx jest src/billing/billing-core.spec.ts`
Expected: PASS.

- [ ] **Step 6: Build shared so consumers resolve it**

Run: `cd packages/shared && npm run build`
Expected: dist emits `billing/billing-core.js` + types; no error.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/billing packages/shared/src/index.ts
git commit -m "feat(billing): shared pure billing core (period, ratio, thresholds, dimension groups)"
```

---

### Task 3: `UsageService` — the four live counts

**Files:**
- Create: `apps/api/src/billing/usage.service.ts`
- Test: `apps/api/src/billing/usage.service.spec.ts`

**Interfaces:**
- Consumes: `TenantPrismaService.forTenant`; `currentPeriodStart` (Task 2); `TenantContext`.
- Produces (consumed by Tasks 4, 5): 
  ```ts
  interface DimensionUsage { used: number; limit: number }
  interface OrgUsage {
    planName: string; periodStart: Date;
    seats: DimensionUsage; candidates: DimensionUsage;
    aiCredits: DimensionUsage; proctoringMinutes: DimensionUsage;
  }
  getUsage(context: TenantContext): Promise<OrgUsage>
  ```

- [ ] **Step 1: Write the failing test** `apps/api/src/billing/usage.service.spec.ts`:

```ts
import { UsageService } from './usage.service';

describe('UsageService', () => {
  const context = { organizationId: 'org-1', isSuperAdmin: false };
  let tx: any; let tenantPrisma: any; let service: UsageService;

  beforeEach(() => {
    tx = {
      organization: { findFirst: jest.fn().mockResolvedValue({ id: 'org-1', plan: { name: 'Trial', seatLimit: 5, candidateLimit: 100, aiCreditLimit: 50, proctoringMinutesLimit: 200 } }) },
      user: { count: jest.fn().mockResolvedValue(3) },
      candidate: { count: jest.fn().mockResolvedValue(42) },
      aiCreditUsage: { aggregate: jest.fn().mockResolvedValue({ _sum: { credits: 20 } }) },
      $queryRaw: jest.fn().mockResolvedValue([{ minutes: 75 }]),
    };
    tenantPrisma = { forTenant: jest.fn(async (_c: any, fn: any) => fn(tx)) };
    service = new UsageService(tenantPrisma);
  });

  it('returns all four dimensions with used + limit', async () => {
    const u = await service.getUsage(context as any);
    expect(u.planName).toBe('Trial');
    expect(u.seats).toEqual({ used: 3, limit: 5 });
    expect(u.candidates).toEqual({ used: 42, limit: 100 });
    expect(u.aiCredits).toEqual({ used: 20, limit: 50 });
    expect(u.proctoringMinutes).toEqual({ used: 75, limit: 200 });
    // active-only seats + non-erased candidates + period-filtered AI credits
    expect(tx.user.count).toHaveBeenCalledWith({ where: { organizationId: 'org-1', status: 'active' } });
    expect(tx.candidate.count).toHaveBeenCalledWith({ where: { organizationId: 'org-1', erasedAt: null } });
    expect(tx.aiCreditUsage.aggregate).toHaveBeenCalledWith(expect.objectContaining({ _sum: { credits: true }, where: expect.objectContaining({ organizationId: 'org-1', occurredAt: expect.objectContaining({ gte: expect.any(Date) }) }) }));
  });

  it('treats a null aiCredit sum and empty proctoring result as 0', async () => {
    tx.aiCreditUsage.aggregate.mockResolvedValue({ _sum: { credits: null } });
    tx.$queryRaw.mockResolvedValue([{ minutes: null }]);
    const u = await service.getUsage(context as any);
    expect(u.aiCredits.used).toBe(0);
    expect(u.proctoringMinutes.used).toBe(0);
  });
});
```

- [ ] **Step 2: Run it red**

Run: `cd apps/api && npx jest src/billing/usage.service.spec.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement** `apps/api/src/billing/usage.service.ts`:

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantContext, TenantPrismaService, currentPeriodStart } from '@exam-platform/shared';

export interface DimensionUsage { used: number; limit: number }
export interface OrgUsage {
  planName: string;
  periodStart: Date;
  seats: DimensionUsage;
  candidates: DimensionUsage;
  aiCredits: DimensionUsage;
  proctoringMinutes: DimensionUsage;
}

@Injectable()
export class UsageService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async getUsage(context: TenantContext): Promise<OrgUsage> {
    const orgId = context.organizationId as string;
    const periodStart = currentPeriodStart(new Date());

    return this.tenantPrisma.forTenant(context, async (tx) => {
      const org = await tx.organization.findFirst({ where: { id: orgId }, include: { plan: true } });
      if (!org) throw new NotFoundException('Organization not found');
      const plan = org.plan;

      const [seats, candidates, aiAgg, proctoringRows] = await Promise.all([
        tx.user.count({ where: { organizationId: orgId, status: 'active' } }),
        tx.candidate.count({ where: { organizationId: orgId, erasedAt: null } }),
        tx.aiCreditUsage.aggregate({ _sum: { credits: true }, where: { organizationId: orgId, occurredAt: { gte: periodStart } } }),
        // Proctoring minutes: attempts of anti-cheating-enabled exams, completed this period.
        // Attempt has no direct org column -> join via exam. datediff in minutes; NULL -> 0.
        tx.$queryRaw<{ minutes: number | null }[]>(Prisma.sql`
          SELECT COALESCE(SUM(DATEDIFF(MINUTE, a.[started_at], a.[submitted_at])), 0) AS minutes
          FROM [dbo].[attempts] a
          JOIN [dbo].[exams] e ON e.[id] = a.[exam_id]
          WHERE e.[organization_id] = ${orgId}
            AND e.[enable_anti_cheating] = 1
            AND a.[submitted_at] IS NOT NULL
            AND a.[submitted_at] >= ${periodStart}
        `),
      ]);

      return {
        planName: plan.name,
        periodStart,
        seats: { used: seats, limit: plan.seatLimit },
        candidates: { used: candidates, limit: plan.candidateLimit },
        aiCredits: { used: aiAgg._sum.credits ?? 0, limit: plan.aiCreditLimit },
        proctoringMinutes: { used: Number(proctoringRows[0]?.minutes ?? 0), limit: plan.proctoringMinutesLimit },
      };
    });
  }
}
```

**Note for the implementer:** verify the raw SQL column names against `schema.prisma` `@map`s: `attempts.started_at`/`submitted_at`/`exam_id`, `exams.organization_id`/`enable_anti_cheating`. Adjust if any differ. The `$queryRaw` runs inside `forTenant`, so RLS session context is set, but the explicit `e.organization_id = ${orgId}` is defense-in-depth.

- [ ] **Step 4: Run it green**

Run: `cd apps/api && npx jest src/billing/usage.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/billing/usage.service.ts apps/api/src/billing/usage.service.spec.ts
git commit -m "feat(billing): UsageService — live seat/candidate/ai-credit/proctoring-minute counts"
```

---

### Task 4: `QuotaService` — hard-assert-402 / soft-warn + notice dedup

**Files:**
- Create: `apps/api/src/billing/quota.service.ts`
- Create: `apps/api/src/billing/quota-exceeded.exception.ts`
- Test: `apps/api/src/billing/quota.service.spec.ts`

**Interfaces:**
- Consumes: `UsageService.getUsage` (Task 3); `TenantPrismaService.forTenant`; `EmailService.send`; `buildCandidateEmailHtml`; `warnThreshold`, `isOverLimit`, `currentPeriodStart` (Task 2).
- Produces (consumed by Tasks 5,7,8,9,10,11):
  ```ts
  class QuotaExceededException extends HttpException  // 402, body { error:'quota_exceeded', dimension, used, limit, message }
  assertWithinLimit(context, dimension: 'ai_credits'|'proctoring_minutes'): Promise<void>  // throws 402 at/over
  checkSoftLimit(context, dimension: 'seats'|'candidates'): Promise<{ warn: boolean; threshold: 80|100|null; used: number; limit: number }>  // never throws; dedup-notifies
  ```

- [ ] **Step 1: Implement the exception first** `apps/api/src/billing/quota-exceeded.exception.ts`:

```ts
import { HttpException, HttpStatus } from '@nestjs/common';

export class QuotaExceededException extends HttpException {
  constructor(dimension: string, used: number, limit: number) {
    super(
      { error: 'quota_exceeded', dimension, used, limit, message: `Plan limit reached for ${dimension}. Upgrade to continue.` },
      HttpStatus.PAYMENT_REQUIRED, // 402
    );
  }
}
```

- [ ] **Step 2: Write the failing test** `apps/api/src/billing/quota.service.spec.ts`:

```ts
import { QuotaExceededException } from './quota-exceeded.exception';
import { QuotaService } from './quota.service';

describe('QuotaService', () => {
  const ctx = { organizationId: 'org-1', isSuperAdmin: false };
  let usage: any; let tenantPrisma: any; let email: any; let tx: any; let service: QuotaService;

  beforeEach(() => {
    tx = { billingNotice: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({}) },
           organization: { findFirst: jest.fn().mockResolvedValue({ name: 'Acme', logoPath: null }) },
           user: { findMany: jest.fn().mockResolvedValue([{ email: 'admin@acme.test' }]) } };
    tenantPrisma = { forTenant: jest.fn(async (_c: any, fn: any) => fn(tx)) };
    usage = { getUsage: jest.fn() };
    email = { send: jest.fn().mockResolvedValue({ success: true }) };
    service = new QuotaService(usage, tenantPrisma, email);
  });

  describe('assertWithinLimit (hard)', () => {
    it('throws 402 QuotaExceededException at/over the limit', async () => {
      usage.getUsage.mockResolvedValue({ aiCredits: { used: 50, limit: 50 } });
      await expect(service.assertWithinLimit(ctx as any, 'ai_credits')).rejects.toBeInstanceOf(QuotaExceededException);
    });
    it('passes under the limit', async () => {
      usage.getUsage.mockResolvedValue({ aiCredits: { used: 49, limit: 50 } });
      await expect(service.assertWithinLimit(ctx as any, 'ai_credits')).resolves.toBeUndefined();
    });
    it('bypasses for super-admin', async () => {
      await expect(service.assertWithinLimit({ organizationId: null, isSuperAdmin: true } as any, 'ai_credits')).resolves.toBeUndefined();
      expect(usage.getUsage).not.toHaveBeenCalled();
    });
  });

  describe('checkSoftLimit (soft)', () => {
    it('never throws; returns warn+threshold and emails once when a threshold is first crossed', async () => {
      usage.getUsage.mockResolvedValue({ seats: { used: 5, limit: 5 } }); // ratio 1.0 -> 100
      const r = await service.checkSoftLimit(ctx as any, 'seats');
      expect(r).toEqual({ warn: true, threshold: 100, used: 5, limit: 5 });
      expect(tx.billingNotice.create).toHaveBeenCalled();
      expect(email.send).toHaveBeenCalled();
    });
    it('does not re-email when the notice already exists (dedup)', async () => {
      usage.getUsage.mockResolvedValue({ seats: { used: 5, limit: 5 } });
      tx.billingNotice.findFirst.mockResolvedValue({ id: 'existing' });
      const r = await service.checkSoftLimit(ctx as any, 'seats');
      expect(r.warn).toBe(true);
      expect(tx.billingNotice.create).not.toHaveBeenCalled();
      expect(email.send).not.toHaveBeenCalled();
    });
    it('returns warn=false below 80% and does not email', async () => {
      usage.getUsage.mockResolvedValue({ seats: { used: 3, limit: 5 } }); // 0.6
      const r = await service.checkSoftLimit(ctx as any, 'seats');
      expect(r.warn).toBe(false);
      expect(email.send).not.toHaveBeenCalled();
    });
    it('bypasses for super-admin (warn=false, no work)', async () => {
      const r = await service.checkSoftLimit({ organizationId: null, isSuperAdmin: true } as any, 'seats');
      expect(r.warn).toBe(false);
      expect(usage.getUsage).not.toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 3: Run it red**

Run: `cd apps/api && npx jest src/billing/quota.service.spec.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 4: Implement** `apps/api/src/billing/quota.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { TenantContext, TenantPrismaService, usageRatio, warnThreshold, isOverLimit, currentPeriodStart } from '@exam-platform/shared';
import { EmailService } from '../email/email.service';
import { buildCandidateEmailHtml } from '../candidate-emails/candidate-email-render';
import { UsageService, DimensionUsage } from './usage.service';
import { QuotaExceededException } from './quota-exceeded.exception';

const USAGE_KEY = {
  ai_credits: 'aiCredits',
  proctoring_minutes: 'proctoringMinutes',
  seats: 'seats',
  candidates: 'candidates',
} as const;

@Injectable()
export class QuotaService {
  constructor(
    private readonly usage: UsageService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly email: EmailService,
  ) {}

  async assertWithinLimit(context: TenantContext, dimension: 'ai_credits' | 'proctoring_minutes'): Promise<void> {
    if (context.isSuperAdmin) return;
    const u = await this.usage.getUsage(context);
    const d = (u as any)[USAGE_KEY[dimension]] as DimensionUsage;
    if (isOverLimit(d.used, d.limit)) throw new QuotaExceededException(dimension, d.used, d.limit);
  }

  async checkSoftLimit(
    context: TenantContext,
    dimension: 'seats' | 'candidates',
  ): Promise<{ warn: boolean; threshold: 80 | 100 | null; used: number; limit: number }> {
    if (context.isSuperAdmin) return { warn: false, threshold: null, used: 0, limit: 0 };
    const u = await this.usage.getUsage(context);
    const d = (u as any)[USAGE_KEY[dimension]] as DimensionUsage;
    const threshold = warnThreshold(usageRatio(d.used, d.limit));
    if (threshold === null) return { warn: false, threshold: null, used: d.used, limit: d.limit };

    await this.maybeNotify(context, dimension, threshold, d.used, d.limit);
    return { warn: true, threshold, used: d.used, limit: d.limit };
  }

  // Dedup: insert one BillingNotice per (org, dimension, threshold, period) and email the admins
  // only on first crossing. Email is outside the notice write (EmailService never throws).
  private async maybeNotify(context: TenantContext, dimension: string, threshold: 80 | 100, used: number, limit: number): Promise<void> {
    const periodStart = currentPeriodStart(new Date());
    const orgId = context.organizationId as string;

    const created = await this.tenantPrisma.forTenant(context, async (tx) => {
      const existing = await tx.billingNotice.findFirst({ where: { organizationId: orgId, dimension, threshold, periodStart } });
      if (existing) return false;
      await tx.billingNotice.create({ data: { organizationId: orgId, dimension, threshold, periodStart } });
      return true;
    });
    if (!created) return;

    const recipients = await this.tenantPrisma.forTenant(context, async (tx) => {
      const org = await tx.organization.findFirst({ where: { id: orgId }, select: { name: true } });
      const admins = await tx.user.findMany({ where: { organizationId: orgId, role: 'org_admin', status: 'active' }, select: { email: true } });
      return { orgName: org?.name ?? null, emails: admins.map((a) => a.email) };
    });

    for (const to of recipients.emails) {
      await this.email.send({
        to,
        subject: `Usage alert: ${dimension} at ${threshold}% of your plan`,
        html: buildCandidateEmailHtml({
          logoUrl: null,
          orgName: recipients.orgName,
          bodyText: `Your organization has reached ${threshold}% of its ${dimension} limit (${used} of ${limit}). Consider upgrading your plan.`,
        }),
        organizationId: orgId,
      });
    }
  }
}
```

- [ ] **Step 5: Run it green**

Run: `cd apps/api && npx jest src/billing/quota.service.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/billing/quota.service.ts apps/api/src/billing/quota-exceeded.exception.ts apps/api/src/billing/quota.service.spec.ts
git commit -m "feat(billing): QuotaService — hard 402 assert + soft warn with per-period notice dedup"
```

---

### Task 5: BillingModule + org usage endpoint + app wiring

**Files:**
- Create: `apps/api/src/billing/billing.controller.ts`
- Create: `apps/api/src/billing/billing.module.ts`
- Modify: `apps/api/src/app.module.ts` (register `BillingModule`)
- Test: `apps/api/src/billing/billing.controller.spec.ts`

**Interfaces:**
- Consumes: `UsageService` (Task 3), `QuotaService` (Task 4), guard/decorator pattern from `organizations.controller.ts`.
- Produces: `GET /organizations/billing/usage` (`org:manage_billing`) → `OrgUsage`; `BillingModule` exports `QuotaService` + `UsageService` for other modules to import.

- [ ] **Step 1: Write the failing controller test** `apps/api/src/billing/billing.controller.spec.ts`:

```ts
import { BillingController } from './billing.controller';

describe('BillingController', () => {
  it('usage delegates to UsageService with the tenant context', async () => {
    const usage = { getUsage: jest.fn().mockResolvedValue({ planName: 'Trial' }) };
    const controller = new BillingController(usage as any);
    const tenant = { organizationId: 'org-1', isSuperAdmin: false };
    await controller.usage(tenant as any);
    expect(usage.getUsage).toHaveBeenCalledWith(tenant);
  });
});
```

- [ ] **Step 2: Run it red** — `cd apps/api && npx jest src/billing/billing.controller.spec.ts` → FAIL.

- [ ] **Step 3: Implement the controller** `apps/api/src/billing/billing.controller.ts`:

```ts
import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { TenantContext } from '@exam-platform/shared';
import { UsageService } from './usage.service';

@Controller('organizations/billing')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class BillingController {
  constructor(private readonly usage: UsageService) {}

  @Get('usage')
  @RequirePermissions('org:manage_billing')
  usage(@CurrentTenant() tenant: TenantContext) {
    return this.usage.getUsage(tenant);
  }
}
```

- [ ] **Step 4: Implement the module** `apps/api/src/billing/billing.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { EmailModule } from '../email/email.module';
import { UsageService } from './usage.service';
import { QuotaService } from './quota.service';
import { BillingController } from './billing.controller';

@Module({
  imports: [EmailModule], // QuotaService injects EmailService
  controllers: [BillingController],
  providers: [UsageService, QuotaService],
  exports: [UsageService, QuotaService], // consumed by processors / other modules for enforcement
})
export class BillingModule {}
```

**Note:** confirm the module that provides `EmailService` (likely `EmailModule`) and import it here; if `EmailService` is provided by a `@Global` module, importing is still safe. Learn from the prod incident on the last feature — do NOT rely on `@Global` alone for a service a provider injects; import the module explicitly. `TenantPrismaService`/`AuditService` come from the global shared modules (already available app-wide).

- [ ] **Step 5: Register in `app.module.ts`** — add `import { BillingModule } from './billing/billing.module';` and add `BillingModule` to the `imports` array.

- [ ] **Step 6: Run controller test + build** — `cd apps/api && npx jest src/billing/billing.controller.spec.ts` (PASS) and `npx tsc --noEmit -p tsconfig.json` (clean).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/billing/billing.controller.ts apps/api/src/billing/billing.controller.spec.ts apps/api/src/billing/billing.module.ts apps/api/src/app.module.ts
git commit -m "feat(billing): BillingModule + GET /organizations/billing/usage + app wiring"
```

---

### Task 6: Plan catalog CRUD + assign-plan (super-admin)

**Files:**
- Create: `apps/api/src/billing/plans.service.ts`
- Create: `apps/api/src/billing/plans.controller.ts`
- Create: `apps/api/src/billing/dto/plan.dto.ts`
- Modify: `apps/api/src/billing/billing.module.ts` (register PlansService/Controller)
- Test: `apps/api/src/billing/plans.service.spec.ts`

**Interfaces:**
- Consumes: `TenantPrismaService` (use `withoutTenantScope` / a super-admin context — these are platform-level, cross-org reads of `plans`, and an org update); `AuditService.record`.
- Produces:
  - `GET /platform/plans` (`platform:manage_organizations`) → all plans.
  - `POST /platform/plans` / `PATCH /platform/plans/:id` → create/update a plan (name + 4 limits + priceLabel + isPublic).
  - `PATCH /platform/organizations/:id/plan` `{ planId }` → assign a plan to an org; audits `org.plan_assigned`.

- [ ] **Step 1: Write the DTOs** `apps/api/src/billing/dto/plan.dto.ts`:

```ts
import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, Min, MaxLength } from 'class-validator';

export class UpsertPlanDto {
  @IsString() @MaxLength(100) name!: string;
  @IsInt() @Min(0) seatLimit!: number;
  @IsInt() @Min(0) candidateLimit!: number;
  @IsInt() @Min(0) aiCreditLimit!: number;
  @IsInt() @Min(0) proctoringMinutesLimit!: number;
  @IsOptional() @IsString() @MaxLength(50) priceLabel?: string;
  @IsOptional() @IsBoolean() isPublic?: boolean;
}

export class AssignPlanDto {
  @IsUUID('4') planId!: string;
}
```

- [ ] **Step 2: Write the failing service test** `apps/api/src/billing/plans.service.spec.ts`:

```ts
import { PlansService } from './plans.service';

describe('PlansService', () => {
  const ctx = { organizationId: null, isSuperAdmin: true };
  let prisma: any; let audit: any; let service: PlansService;
  beforeEach(() => {
    prisma = { plan: { findMany: jest.fn().mockResolvedValue([{ id: 'p1', name: 'Trial' }]), create: jest.fn().mockResolvedValue({ id: 'p2' }), update: jest.fn().mockResolvedValue({ id: 'p1' }) },
               organization: { update: jest.fn().mockResolvedValue({ id: 'org-1', planId: 'p2' }) } };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    service = new PlansService(prisma, audit);
  });
  it('lists plans', async () => { expect(await service.list()).toHaveLength(1); });
  it('creates a plan', async () => {
    const out = await service.create(ctx as any, 'user-1', { name: 'Pro', seatLimit: 20, candidateLimit: 1000, aiCreditLimit: 500, proctoringMinutesLimit: 5000 } as any);
    expect(prisma.plan.create).toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'plan.created' }));
    expect(out.id).toBe('p2');
  });
  it('assigns a plan to an org and audits org.plan_assigned', async () => {
    await service.assignToOrg(ctx as any, 'user-1', 'org-1', 'p2');
    expect(prisma.organization.update).toHaveBeenCalledWith({ where: { id: 'org-1' }, data: { planId: 'p2' } });
    expect(audit.record).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'org.plan_assigned', entityId: 'org-1' }));
  });
});
```

- [ ] **Step 3: Run it red** — FAIL.

- [ ] **Step 4: Implement** `apps/api/src/billing/plans.service.ts`. Plans are platform-global (not org-scoped) so use the base prisma client for `plan.*`; the org assignment is a super-admin cross-org update. Follow how existing super-admin/platform code accesses cross-org data (read `organizations.service.ts` for the `this.prisma` vs `tenantPrisma` split — platform reads use the base `PrismaService`).

```ts
import { Injectable } from '@nestjs/common';
import { PrismaService, AuditService, TenantContext } from '@exam-platform/shared';
import { UpsertPlanDto } from './dto/plan.dto';

@Injectable()
export class PlansService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  list() {
    return this.prisma.plan.findMany({ orderBy: { name: 'asc' } });
  }

  async create(context: TenantContext, actorUserId: string, dto: UpsertPlanDto) {
    const plan = await this.prisma.plan.create({
      data: {
        name: dto.name, seatLimit: dto.seatLimit, candidateLimit: dto.candidateLimit,
        aiCreditLimit: dto.aiCreditLimit, proctoringMinutesLimit: dto.proctoringMinutesLimit,
        priceLabel: dto.priceLabel ?? null, isPublic: dto.isPublic ?? true,
      },
    });
    await this.audit.record(context, { actorUserId, action: 'plan.created', entityType: 'plan', entityId: plan.id, metadata: { name: dto.name } });
    return plan;
  }

  async update(context: TenantContext, actorUserId: string, id: string, dto: UpsertPlanDto) {
    const plan = await this.prisma.plan.update({
      where: { id },
      data: {
        name: dto.name, seatLimit: dto.seatLimit, candidateLimit: dto.candidateLimit,
        aiCreditLimit: dto.aiCreditLimit, proctoringMinutesLimit: dto.proctoringMinutesLimit,
        priceLabel: dto.priceLabel ?? null, isPublic: dto.isPublic ?? true,
      },
    });
    await this.audit.record(context, { actorUserId, action: 'plan.updated', entityType: 'plan', entityId: id, metadata: { ...dto } });
    return plan;
  }

  async assignToOrg(context: TenantContext, actorUserId: string, orgId: string, planId: string) {
    const org = await this.prisma.organization.update({ where: { id: orgId }, data: { planId } });
    await this.audit.record(context, { actorUserId, action: 'org.plan_assigned', entityType: 'organization', entityId: orgId, metadata: { planId } });
    return org;
  }
}
```

**Note:** confirm `PrismaService` (base, un-scoped) is exported from `@exam-platform/shared` and how existing platform/super-admin services obtain it (`organizations.service.ts` uses `this.prisma`). Mirror that. `AuditService.record(context, {...})` — match the exact signature used elsewhere (actorUserId/action/entityType/entityId/metadata).

- [ ] **Step 5: Implement the controller** `apps/api/src/billing/plans.controller.ts`:

```ts
import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { TenantContext } from '@exam-platform/shared';
import { PlansService } from './plans.service';
import { UpsertPlanDto, AssignPlanDto } from './dto/plan.dto';

@Controller('platform')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PlansController {
  constructor(private readonly plans: PlansService) {}

  @Get('plans')
  @RequirePermissions('platform:manage_organizations')
  list() { return this.plans.list(); }

  @Post('plans')
  @RequirePermissions('platform:manage_organizations')
  create(@CurrentTenant() t: TenantContext, @CurrentUserId() uid: string, @Body() dto: UpsertPlanDto) { return this.plans.create(t, uid, dto); }

  @Patch('plans/:id')
  @RequirePermissions('platform:manage_organizations')
  update(@CurrentTenant() t: TenantContext, @CurrentUserId() uid: string, @Param('id') id: string, @Body() dto: UpsertPlanDto) { return this.plans.update(t, uid, id, dto); }

  @Patch('organizations/:id/plan')
  @RequirePermissions('platform:manage_organizations')
  assign(@CurrentTenant() t: TenantContext, @CurrentUserId() uid: string, @Param('id') id: string, @Body() dto: AssignPlanDto) { return this.plans.assignToOrg(t, uid, id, dto.planId); }
}
```

**Route-collision check:** confirm `/platform/organizations/:id/...` and `/platform/plans` don't collide with an existing controller (grep for `@Controller('platform')`). If a platform controller already exists, add these routes there instead of a second `@Controller('platform')`.

- [ ] **Step 6: Register in `billing.module.ts`** — add `PlansService` to providers and `PlansController` to controllers.

- [ ] **Step 7: Run service test + build** — `cd apps/api && npx jest src/billing/plans.service.spec.ts` (PASS) + `npx tsc --noEmit -p tsconfig.json` (clean).

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/billing/plans.service.ts apps/api/src/billing/plans.controller.ts apps/api/src/billing/dto/plan.dto.ts apps/api/src/billing/plans.service.spec.ts apps/api/src/billing/billing.module.ts
git commit -m "feat(billing): plan catalog CRUD + assign-plan-to-org (super-admin)"
```

---

### Task 7: AI-credit hard enforcement — apps/api processors

**Files:**
- Modify: `apps/api/src/jobs/processors/candidate-fit.processor.ts`
- Modify: `apps/api/src/jobs/processors/resume-parse.processor.ts`
- Modify: `apps/api/src/jobs/processors/ai-question-generation.processor.ts`
- Modify: `apps/api/src/jobs/jobs.module.ts` (import `BillingModule` so processors can inject `QuotaService`)
- Test: extend each processor's `.spec.ts`

**Interfaces:**
- Consumes: `QuotaService.assertWithinLimit(context, 'ai_credits')` (Task 4).

- [ ] **Step 1: Wire `BillingModule` into `JobsModule`** — add `BillingModule` to `JobsModule`'s `imports` (mirror how the last feature explicitly imported the module it needed rather than trusting `@Global` — this caused a prod DI crash). Inject `QuotaService` into each of the three processors' constructors.

- [ ] **Step 2: For each processor, add the guard before the AI provider call.** In `candidate-fit.processor.ts`, right after the profile/eligibility read and BEFORE `this.callAi(...)`:

```ts
// Hard quota: block the AI spend when the org has exhausted its monthly AI credits.
await this.quota.assertWithinLimit(context, 'ai_credits');
```

Do the same in `resume-parse.processor.ts` (before `callAi`) and `ai-question-generation.processor.ts` (before its provider call). The `QuotaExceededException` (402) propagates as the job's failure — the worker records `status:'failed'` with the message; for candidate_fit specifically, prefer catching it to set the assessment status distinctly is OPTIONAL and NOT required here (the plan keeps it simple: over-limit → job fails with the 402 message, surfaced on retry). Keep the existing `AiNotConfiguredError` handling intact and separate.

- [ ] **Step 3: Add a test to each processor spec** asserting that when `quota.assertWithinLimit` rejects with `QuotaExceededException`, the provider is NOT called and the processor surfaces the failure. Example (candidate-fit):

```ts
it('does not call the AI provider when the AI-credit quota is exceeded', async () => {
  quota.assertWithinLimit.mockRejectedValue(new QuotaExceededException('ai_credits', 50, 50));
  await processor.process({ entryId: 'entry-1' }, context, aiJobId).catch(() => {});
  expect(provider.generateStructured).not.toHaveBeenCalled();
});
```

(Add a `quota` mock to each processor's test setup and pass it to the constructor.)

- [ ] **Step 4: Run the three processor specs + build** — `cd apps/api && npx jest src/jobs/processors` and `npx tsc --noEmit -p tsconfig.json` → green/clean.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/jobs/processors/candidate-fit.processor.ts apps/api/src/jobs/processors/resume-parse.processor.ts apps/api/src/jobs/processors/ai-question-generation.processor.ts apps/api/src/jobs/jobs.module.ts apps/api/src/jobs/processors/*.spec.ts
git commit -m "feat(billing): hard AI-credit quota check before AI spend in apps/api processors"
```

---

### Task 8: AI-credit hard enforcement — exam-runtime

**Files:**
- Create: `apps/exam-runtime/src/billing/quota.service.ts` (thin, exam-runtime-local — reads the same tables using the shared core)
- Create: `apps/exam-runtime/src/billing/billing.module.ts`
- Modify: the four exam-runtime AI spend sites: `integrity/integrity-analysis.service.ts`, `attempt-insight/attempt-insight.service.ts`, `attempts/attempt.service.ts` (screen_analysis path), `code-review/code-review.service.ts` — inject the quota service, call `assertAiCredits(context)` before each AI spend.
- Modify: the module(s) providing those services to import the exam-runtime `BillingModule`.
- Test: `apps/exam-runtime/src/billing/quota.service.spec.ts`

**Interfaces:**
- Consumes: `TenantPrismaService.forTenant`, `currentPeriodStart`, `isOverLimit` (shared core); `Plan.aiCreditLimit`.
- Produces: `assertAiCredits(context: TenantContext): Promise<void>` — throws a 402-equivalent (`ForbiddenException` or a local `QuotaExceededException` mirroring apps/api's body) when the org's period AI credits ≥ its plan `aiCreditLimit`.

- [ ] **Step 1: Write the failing test** — mock `tenantPrisma.forTenant` returning a tx with `organization.findFirst` (plan.aiCreditLimit) + `aiCreditUsage.aggregate` (_sum credits). Assert: throws when sum ≥ limit, passes under, bypasses super-admin.

```ts
import { QuotaService } from './quota.service';
describe('exam-runtime QuotaService.assertAiCredits', () => {
  const ctx = { organizationId: 'org-1', isSuperAdmin: false };
  let tx: any; let tenantPrisma: any; let service: QuotaService;
  beforeEach(() => {
    tx = { organization: { findFirst: jest.fn().mockResolvedValue({ plan: { aiCreditLimit: 50 } }) },
           aiCreditUsage: { aggregate: jest.fn().mockResolvedValue({ _sum: { credits: 50 } }) } };
    tenantPrisma = { forTenant: jest.fn(async (_c: any, fn: any) => fn(tx)) };
    service = new QuotaService(tenantPrisma);
  });
  it('throws at/over the limit', async () => { await expect(service.assertAiCredits(ctx as any)).rejects.toBeTruthy(); });
  it('passes under', async () => { tx.aiCreditUsage.aggregate.mockResolvedValue({ _sum: { credits: 49 } }); await expect(service.assertAiCredits(ctx as any)).resolves.toBeUndefined(); });
  it('bypasses super-admin', async () => { await expect(service.assertAiCredits({ organizationId: null, isSuperAdmin: true } as any)).resolves.toBeUndefined(); expect(tenantPrisma.forTenant).not.toHaveBeenCalled(); });
});
```

- [ ] **Step 2: Run red.**

- [ ] **Step 3: Implement** `apps/exam-runtime/src/billing/quota.service.ts`:

```ts
import { ForbiddenException, Injectable } from '@nestjs/common';
import { TenantContext, TenantPrismaService, currentPeriodStart, isOverLimit } from '@exam-platform/shared';

@Injectable()
export class QuotaService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async assertAiCredits(context: TenantContext): Promise<void> {
    if (context.isSuperAdmin) return;
    const orgId = context.organizationId as string;
    const periodStart = currentPeriodStart(new Date());
    const { used, limit } = await this.tenantPrisma.forTenant(context, async (tx) => {
      const org = await tx.organization.findFirst({ where: { id: orgId }, include: { plan: true } });
      const agg = await tx.aiCreditUsage.aggregate({ _sum: { credits: true }, where: { organizationId: orgId, occurredAt: { gte: periodStart } } });
      return { used: agg._sum.credits ?? 0, limit: org?.plan.aiCreditLimit ?? Number.MAX_SAFE_INTEGER };
    });
    if (isOverLimit(used, limit)) {
      throw new ForbiddenException({ error: 'quota_exceeded', dimension: 'ai_credits', used, limit, message: 'AI credit limit reached. Upgrade to continue.' });
    }
  }
}
```

(exam-runtime AI paths are called from candidate-triggered flows; a `ForbiddenException` is acceptable here — these aren't the public 402 UX surface. If exam-runtime already has a shared HttpException convention, match it.)

- [ ] **Step 4: Create `billing.module.ts`** (providers: `[QuotaService]`, exports: `[QuotaService]`), import it into the modules owning the four AI services, and inject `QuotaService` into each; add `await this.quota.assertAiCredits(context)` immediately before each `aiCreditUsage.create`/provider spend. Use the `context`/`organizationId` already in scope at each site.

- [ ] **Step 5: Add one enforcement test per site** (or at least for `attempt-insight` and `integrity`) asserting the provider/spend is skipped when `assertAiCredits` rejects. Run: `cd apps/exam-runtime && npx jest src/billing` + the touched service specs; then `npx tsc --noEmit -p tsconfig.json`.

- [ ] **Step 6: Commit**

```bash
git add apps/exam-runtime/src/billing apps/exam-runtime/src/integrity apps/exam-runtime/src/attempt-insight apps/exam-runtime/src/attempts apps/exam-runtime/src/code-review
git commit -m "feat(billing): hard AI-credit quota check before AI spend in exam-runtime"
```

---

### Task 9: Proctoring-minutes hard enforcement at exam start

**Files:**
- Modify: `apps/exam-runtime/src/billing/quota.service.ts` (add `assertProctoringMinutes`)
- Modify: `apps/exam-runtime/src/attempts/attempt.service.ts` (`start()` — gate before creating the attempt)
- Test: extend `apps/exam-runtime/src/billing/quota.service.spec.ts` + an attempt-start test

**Interfaces:**
- Consumes: shared core; `Exam.enableAntiCheating`.
- Produces: `assertProctoringMinutes(context: TenantContext): Promise<void>` — throws when the org's period proctoring minutes ≥ `Plan.proctoringMinutesLimit`.

- [ ] **Step 1: Write the failing test** for `assertProctoringMinutes` (mock the plan limit + a `$queryRaw` returning `[{ minutes }]`): throws at/over, passes under, bypasses super-admin. And an `attempt.service` test: `start()` on a proctored exam (`enableAntiCheating: true`) throws when over-limit and does NOT create an attempt; a non-proctored exam is unaffected.

- [ ] **Step 2: Run red.**

- [ ] **Step 3: Implement `assertProctoringMinutes`** (mirror `assertAiCredits`, using the same proctoring-minutes `$queryRaw` as Task 3's `UsageService`, and `Plan.proctoringMinutesLimit`).

- [ ] **Step 4: Gate `attempt.service.start()`** — after `resolveContext` (which yields `{ organizationId, exam, invitation }`) and before entering the `forTenant` create tx, add:

```ts
// Hard quota: block STARTING a new proctored attempt when the org has exhausted its monthly
// proctoring minutes. Never checked mid-exam -- a candidate already testing is never interrupted.
if (exam.enableAntiCheating) {
  await this.quota.assertProctoringMinutes({ organizationId, isSuperAdmin: false });
}
```

(Inject the exam-runtime `QuotaService` into `AttemptService`; import the exam-runtime `BillingModule` into `AttemptService`'s module.)

- [ ] **Step 5: Run tests + build** — `cd apps/exam-runtime && npx jest src/billing src/attempts/attempt.service.spec.ts` + `npx tsc --noEmit -p tsconfig.json`.

- [ ] **Step 6: Commit**

```bash
git add apps/exam-runtime/src/billing apps/exam-runtime/src/attempts
git commit -m "feat(billing): hard proctoring-minutes quota check at proctored-exam start"
```

---

### Task 10: Seats soft-warn at user create

**Files:**
- Modify: `apps/api/src/users/users.service.ts` (call `checkSoftLimit` after creating a staff user)
- Modify: `apps/api/src/users/users.module.ts` (import `BillingModule`)
- Test: extend `apps/api/src/users/users.service.spec.ts`

**Interfaces:**
- Consumes: `QuotaService.checkSoftLimit(context, 'seats')` (Task 4).

- [ ] **Step 1: Inject `QuotaService`** into `UsersService`; import `BillingModule` into `UsersModule`.

- [ ] **Step 2: After a successful staff-user create** (both the single-create at `users.service.ts:104` path and the bulk path — call once per successful create, or once after a bulk create), invoke:

```ts
// Soft limit: never blocks creating the user; warns + emails admins once per threshold/period.
await this.quota.checkSoftLimit(context, 'seats');
```

Fire it AFTER the create tx commits (it reads live counts + may email). Wrap in a try/catch that logs but never fails the create — a warning must never break user creation.

- [ ] **Step 3: Add a test** asserting `checkSoftLimit(context, 'seats')` is called after a successful create, and that a rejection from it does NOT fail the create (mock it to reject; assert the user is still returned).

- [ ] **Step 4: Run `users.service.spec.ts` + build.**

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/users/users.service.ts apps/api/src/users/users.module.ts apps/api/src/users/users.service.spec.ts
git commit -m "feat(billing): soft seat-limit warning on staff user create"
```

---

### Task 11: Candidates soft-warn at candidate add

**Files:**
- Modify: `apps/api/src/candidates/candidates.service.ts` (single create + `bulkUpload`)
- Modify: `apps/api/src/candidates/candidates.module.ts` (import `BillingModule`)
- Modify: the public-application path that adds a candidate (`apps/api/src/public-applications/public-applications.service.ts`) if it creates candidates — call `checkSoftLimit` there too (with the resolved org context)
- Test: extend `apps/api/src/candidates/candidates.service.spec.ts`

**Interfaces:**
- Consumes: `QuotaService.checkSoftLimit(context, 'candidates')`.

- [ ] **Step 1: Inject `QuotaService`** into `CandidatesService`; import `BillingModule` into `CandidatesModule`.

- [ ] **Step 2: After a successful candidate create / bulk import**, call `await this.quota.checkSoftLimit(context, 'candidates')` post-commit, wrapped in a try/catch that logs but never fails the add. For `bulkUpload`, call once after the batch (not per row). For the public-application candidate create, call with the resolved org context (super-admin/LOOKUP_ORG resolution already used there) — if the org context isn't a normal tenant context, SKIP the soft-warn there (public apply shouldn't email on every applicant); **decision: only warn on recruiter-initiated adds + bulk import, NOT public application** (avoids noisy emails and keeps the public path lean). Document this in a comment.

- [ ] **Step 3: Add a test** — `checkSoftLimit(context, 'candidates')` called after create + after bulk; a rejection doesn't fail the add.

- [ ] **Step 4: Run `candidates.service.spec.ts` + build.**

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/candidates/candidates.service.ts apps/api/src/candidates/candidates.module.ts apps/api/src/candidates/candidates.service.spec.ts
git commit -m "feat(billing): soft candidate-limit warning on recruiter add + bulk import"
```

---

### Task 12: Web — billing hook + org-admin billing page

**Files:**
- Create: `apps/web/lib/hooks/useBilling.ts`
- Modify: `apps/web/lib/types.ts` (add `OrgUsage`/`DimensionUsage` + `Plan` types)
- Create: `apps/web/app/(org-admin)/settings/billing/page.tsx`
- Modify: `apps/web/lib/super-admin-nav.ts` (add a Billing nav entry gated by `org:manage_billing`)
- Test: `apps/web/app/(org-admin)/settings/billing/page.test.tsx`

**Interfaces:**
- Consumes: `GET /organizations/billing/usage`.
- Produces: `useOrgUsage()` React Query hook; the Billing page.

- [ ] **Step 1: Add types** to `apps/web/lib/types.ts`:

```ts
export interface DimensionUsage { used: number; limit: number }
export interface OrgUsage {
  planName: string;
  periodStart: string;
  seats: DimensionUsage;
  candidates: DimensionUsage;
  aiCredits: DimensionUsage;
  proctoringMinutes: DimensionUsage;
}
```

- [ ] **Step 2: Add the hook** `apps/web/lib/hooks/useBilling.ts` (mirror `useIntegrations.ts` exactly):

```ts
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { useAuth } from '../auth-context';
import { OrgUsage } from '../types';

export function useOrgUsage() {
  const { accessToken } = useAuth();
  return useQuery<OrgUsage>({
    queryKey: ['billing', 'usage'],
    queryFn: () => apiFetch('/organizations/billing/usage', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}
```

- [ ] **Step 3: Build the page** `apps/web/app/(org-admin)/settings/billing/page.tsx` — read the existing `settings/integrations/page.tsx` first for the page shell/section styling. Render: plan name; four **usage bars** (a small local `UsageBar({label, used, limit})` — width `min(100, used/limit*100)%`, colour green `<80%`, amber `80–99%`, red `≥100%`, showing `used / limit` and a ⚠ when `used >= limit`); the **reset date** = first of next month computed from `periodStart`; and a "Need a different plan? Contact us." note. Gate the page content behind the token (org_admin only reaches it via nav).

- [ ] **Step 4: Add nav entry** in `apps/web/lib/super-admin-nav.ts` — a `{ href: '/settings/billing', label: 'Billing', icon: <CreditCard> }` (lucide-react) entry in the org_admin settings nav grouping; match the existing entry shape.

- [ ] **Step 5: Write tests** `billing/page.test.tsx` — mock `useOrgUsage`; assert the plan name renders, each dimension shows `used / limit`, a bar is red/⚠ when over limit, and the reset date renders. Concrete assertions.

- [ ] **Step 6: Run `cd apps/web && npx jest app/(org-admin)/settings/billing` (run twice — flaky under load) + `npx tsc --noEmit`.**

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/hooks/useBilling.ts apps/web/lib/types.ts "apps/web/app/(org-admin)/settings/billing" apps/web/lib/super-admin-nav.ts
git commit -m "feat(billing): org-admin Billing page (plan + usage bars + reset date) + useBilling hook + nav"
```

---

### Task 13: Web — over-limit banner + super-admin plan catalog

**Files:**
- Create: `apps/web/components/billing/OverLimitBanner.tsx`
- Modify: the org-admin + recruiter shell layout(s) to render the banner (e.g. `apps/web/app/(org-admin)/layout.tsx` and the recruiter layout)
- Create: super-admin plan-catalog page (list/create/edit) + per-org plan selector — locate the existing super-admin org-management page under `apps/web/app/(org-admin)/` or the platform console and add a plan selector; add a `usePlans.ts` hook (`GET/POST/PATCH /platform/plans`, `PATCH /platform/organizations/:id/plan`)
- Test: `OverLimitBanner.test.tsx` + a plans-page test

**Interfaces:**
- Consumes: `useOrgUsage` (Task 12); new `usePlans` hooks.

- [ ] **Step 1: `OverLimitBanner`** — reads `useOrgUsage()`; if any **hard** dimension (`aiCredits`/`proctoringMinutes`) has `used >= limit`, render a dismissible red banner ("You've hit your {dimension} limit — contact us to upgrade."). Renders nothing otherwise. Dismiss state in local component state (per session).

- [ ] **Step 2: Mount the banner** in the org-admin shell layout (and the recruiter shell if one exists) above the page content. Read the existing layout first.

- [ ] **Step 3: `usePlans.ts`** — `usePlans()` (GET), `useCreatePlan()`/`useUpdatePlan()` (POST/PATCH `/platform/plans`), `useAssignPlan()` (PATCH `/platform/organizations/:id/plan`), mirroring the hook conventions.

- [ ] **Step 4: Plan catalog page** — a super-admin page listing plans (name + 4 limits + priceLabel + isPublic) with create/edit forms (four integer inputs + name + priceLabel + isPublic toggle). Add a **plan selector** on the existing super-admin org detail view → `useAssignPlan`. Follow the existing super-admin page + form patterns.

- [ ] **Step 5: Tests** — `OverLimitBanner`: shows when a hard dim is over, hidden when under, dismissible. Plans page: create calls `useCreatePlan` with the four limits; assign calls `useAssignPlan`. Concrete assertions.

- [ ] **Step 6: Run the touched web test files (twice) + `npx tsc --noEmit`.**

- [ ] **Step 7: Commit**

```bash
git add apps/web/components/billing apps/web/lib/hooks/usePlans.ts "apps/web/app/(org-admin)" apps/web/app  # exact paths touched
git commit -m "feat(billing): app-wide over-limit banner + super-admin plan catalog + per-org assignment"
```

---

### Task 14: Full verification

**Files:** none.

- [ ] **Step 1: API suite + tsc** — `cd apps/api && npx jest` (all green) + `npx tsc --noEmit -p tsconfig.json` (clean). Run api and web suites SEPARATELY, not concurrently (concurrent runs starve CPU and produce false timeouts — re-run any failure in isolation before believing it).
- [ ] **Step 2: exam-runtime suite + tsc** — `cd apps/exam-runtime && npx jest` + `npx tsc --noEmit -p tsconfig.json`.
- [ ] **Step 3: shared suite + build** — `cd packages/shared && npx jest && npm run build`.
- [ ] **Step 4: web suite + tsc** — `cd apps/web && npx jest --maxWorkers=2` + `npx tsc --noEmit` (attribute any pre-existing flaky heavy-suite timeouts — dashboard/questions/ExamDetailsForm — to load, not this feature; re-run in isolation to confirm).
- [ ] **Step 5: prisma validate** — `cd apps/api && npx prisma validate`.
- [ ] **Step 6:** Branch ready for the final whole-branch review before merge + deploy.

## Self-review notes (coverage against spec)

- Data model (Plan/Org extensions, BillingNotice, permission, RLS, seed) → Task 1. ✅
- Pure period/limit core (shared) → Task 2. ✅
- Four live counts → Task 3 (UsageService). ✅
- Hard-402 assert + soft-warn + notice dedup + email → Task 4 (QuotaService). ✅
- Org usage endpoint + module wiring → Task 5. ✅
- Super-admin plan catalog CRUD + assignment (audited) → Task 6. ✅
- AI-credit hard enforcement (apps/api processors + exam-runtime) → Tasks 7, 8. ✅
- Proctoring-minutes hard enforcement at exam start → Task 9. ✅
- Seats + candidates soft-warn at their add boundaries → Tasks 10, 11. ✅
- Org-admin billing page + usage bars + reset date + hook → Task 12. ✅
- App-wide over-limit banner + super-admin plan UI → Task 13. ✅
- Super-admin bypass, RLS, reads-outside-write-tx, audit → threaded through Tasks 3,4,6,7–11. ✅
- Stripe/invoicing deferred → seam columns added (Task 1), no payment code anywhere. ✅
