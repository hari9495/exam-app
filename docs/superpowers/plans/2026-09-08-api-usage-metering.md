# Per-Key API Usage Metering (Zoho #25) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record every authenticated public-API call (processed + throttled, split) as a daily per-endpoint aggregate, and surface a 30/90-day usage report to the org admin next to the API key. Additive; metering can never fail or slow a real API request.

**Architecture:** New tenant table `ApiUsageDaily` (+RLS). A cohesive `ApiUsageService` owns `record()` (fire-and-forget upsert-increment), `report()` (windowed aggregate), and `prune()` (365-day retention via a `setInterval` service). Processed requests are counted by an interceptor on the 3 public-API controllers; throttles by overriding `PublicApiThrottlerGuard.throwThrottlingException()`. Report served at `GET /organizations/api-usage`, shown in the Integrations settings page.

**Tech Stack:** NestJS 10, `@nestjs/throttler` 6.5.0, Prisma 5.22 (SQL Server), Next.js (apps/web), Jest.

**Spec:** docs/superpowers/specs/2026-09-08-api-usage-metering-design.md

## Global Constraints

- **Base:** branch `feat/api-usage-metering` off origin/main @ `08ae024e`. Work in the main checkout, NOT a worktree (junction disk-fill hazard).
- **NEVER** run `npm install` / `npm ci` / `npm update`. Do NOT add any dependency (`@nestjs/schedule` is NOT installed — use a `setInterval` service, mirroring `RecycleBinRetentionService`). Use only `npx prisma generate` / `npx prisma migrate deploy` / existing `jest` / `tsc`. Run jest FROM `apps/api` or `apps/web` (repo-root `npx jest` mis-resolves into a stale sibling worktree; kill stale jest on a locked-DLL EPERM).
- **New tenant table `api_usage_daily` → paired `_rls` migration** (migrations `20260908210000` + `20260908210001`). **No seed** (reuses the existing `org:manage_settings` permission). New empty table → the `_rls` migration is safe anytime (no FILTER swap).
- **Metering must never break or slow the API:** every `record()` call is fire-and-forget with a swallowed/logged error — never awaited in the request path, never allowed to reject into it.
- **Tenant safety:** all reads/writes of `api_usage_daily` go through `TenantPrismaService.forTenant` (never raw `PrismaService` — an RLS table read on the raw client silently returns 0 rows). The report is tenant-scoped; the retention purge uses the all-org super-admin bypass `forTenant({ organizationId: null, isSuperAdmin: true }, …)`.
- **Guard order is load-bearing:** `@UseGuards(ApiKeyAuthGuard, PublicApiThrottlerGuard)` — auth first (sets `request.apiKeyOrg`), throttle second. Never reorder. The interceptor runs only after both guards pass.
- Report route per-method `@RequirePermissions('org:manage_settings')` (PermissionsGuard is handler-only — class-level is inert).
- apps/web must NOT import `@exam-platform/shared` VALUES at runtime (types-only OK). Deep-import ui components (ui-v2 barrel is a Jest hazard).
- Attribution footer on every commit: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

### Task 1: Schema — `ApiUsageDaily` table + RLS

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (add model)
- Create: `apps/api/prisma/migrations/20260908210000_api_usage_daily/migration.sql`
- Create: `apps/api/prisma/migrations/20260908210001_api_usage_daily_rls/migration.sql`

**Interfaces:**
- Produces: Prisma model `ApiUsageDaily { id, organizationId, day: Date, endpoint: string, requestCount: number, throttledCount: number, createdAt, updatedAt }`, unique `(organizationId, day, endpoint)`.

- [ ] **Step 1: Add the model** to `schema.prisma`:
```prisma
model ApiUsageDaily {
  id             String   @id @default(uuid()) @db.UniqueIdentifier
  organizationId String   @map("organization_id") @db.UniqueIdentifier
  day            DateTime @map("day") @db.Date
  endpoint       String   @map("endpoint")
  requestCount   Int      @default(0) @map("request_count")
  throttledCount Int      @default(0) @map("throttled_count")
  createdAt      DateTime @default(now()) @map("created_at")
  updatedAt      DateTime @updatedAt @map("updated_at")

  @@unique([organizationId, day, endpoint])
  @@index([organizationId, day])
  @@map("api_usage_daily")
}
```

- [ ] **Step 2: Table migration** `20260908210000_api_usage_daily/migration.sql` (match `org_sender_addresses`'s conventions — named default constraints, clustered PK, nonclustered indexes):
```sql
CREATE TABLE [dbo].[api_usage_daily] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [api_usage_daily_id_df] DEFAULT newid(),
    [organization_id] UNIQUEIDENTIFIER NOT NULL,
    [day] DATE NOT NULL,
    [endpoint] NVARCHAR(1000) NOT NULL,
    [request_count] INT NOT NULL CONSTRAINT [api_usage_daily_request_count_df] DEFAULT 0,
    [throttled_count] INT NOT NULL CONSTRAINT [api_usage_daily_throttled_count_df] DEFAULT 0,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [api_usage_daily_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [api_usage_daily_pkey] PRIMARY KEY CLUSTERED ([id])
);
CREATE UNIQUE NONCLUSTERED INDEX [api_usage_daily_organization_id_day_endpoint_key] ON [dbo].[api_usage_daily]([organization_id], [day], [endpoint]);
CREATE NONCLUSTERED INDEX [api_usage_daily_organization_id_day_idx] ON [dbo].[api_usage_daily]([organization_id], [day]);
```

- [ ] **Step 3: RLS migration** `20260908210001_api_usage_daily_rls/migration.sql` (verbatim shape of `20260907180001_org_sender_addresses_rls`, retargeted):
```sql
ALTER SECURITY POLICY dbo.TenantAccessPolicy
ADD FILTER PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.api_usage_daily,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.api_usage_daily AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.api_usage_daily AFTER UPDATE;
```

- [ ] **Step 4: Apply + regenerate + typecheck.** From `apps/api`: `npx prisma migrate deploy`, `npx prisma generate`, `npx tsc --noEmit`. Expected: both migrations applied, client has `apiUsageDaily`, tsc clean.

- [ ] **Step 5: Commit.**
```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260908210000_api_usage_daily apps/api/prisma/migrations/20260908210001_api_usage_daily_rls
git commit -m "feat(api-usage): api_usage_daily table + RLS"
```

---

### Task 2: `ApiUsageService.record()` + `ApiUsageModule`

**Files:**
- Create: `apps/api/src/api-usage/api-usage.service.ts`
- Create: `apps/api/src/api-usage/api-usage.module.ts`
- Create: `apps/api/src/api-usage/endpoint-label.ts`
- Test: `apps/api/src/api-usage/api-usage.service.spec.ts`, `apps/api/src/api-usage/endpoint-label.spec.ts`

**Interfaces:**
- Consumes: `ApiUsageDaily` (T1), `TenantPrismaService`, `TenantContext`.
- Produces: `ApiUsageService.record(context: TenantContext, endpoint: string, kind: 'request' | 'throttled'): Promise<void>` (fire-and-forget safe — never rejects); `endpointLabel(method: string, routePath: string | undefined): string`; `ApiUsageModule` (exports `ApiUsageService`).

- [ ] **Step 1: Failing test — endpoint-label helper** `endpoint-label.spec.ts`:
```ts
import { endpointLabel } from './endpoint-label';

describe('endpointLabel', () => {
  it('joins method + route template', () => {
    expect(endpointLabel('GET', '/public/candidates')).toBe('GET /public/candidates');
  });
  it('uppercases the method and keeps the route template (never the concrete url)', () => {
    expect(endpointLabel('get', '/public/exams/:id')).toBe('GET /public/exams/:id');
  });
  it('falls back to "unknown" when the route path is missing', () => {
    expect(endpointLabel('POST', undefined)).toBe('POST unknown');
  });
});
```

- [ ] **Step 2: Implement** `endpoint-label.ts`:
```ts
// Stable, bounded-cardinality usage key: METHOD + the matched route TEMPLATE (e.g.
// "GET /public/exams/:id"), never the concrete URL (which would interpolate ids and
// explode cardinality). routePath comes from Express's req.route.path at record time.
export function endpointLabel(method: string, routePath: string | undefined): string {
  return `${method.toUpperCase()} ${routePath ?? 'unknown'}`;
}
```
Run `npx jest endpoint-label` (apps/api) → PASS.

- [ ] **Step 3: Failing test — record()** `api-usage.service.spec.ts` (mock `TenantPrismaService.forTenant` to invoke the callback with a `tx` whose `apiUsageDaily.upsert` is a jest mock; assert the upsert shape; assert a rejecting `forTenant` is swallowed):
```ts
// record('request') upserts (org, todays-utc-day, endpoint) creating with requestCount:1 / incrementing requestCount
// record('throttled') creates with throttledCount:1 / increments throttledCount
// a create includes both counters (the other defaulting to 0)
// when forTenant rejects, record() resolves (does NOT throw) and logs a warning
```
Concretely assert, for `kind:'request'`:
```ts
expect(tx.apiUsageDaily.upsert).toHaveBeenCalledWith(expect.objectContaining({
  where: { organizationId_day_endpoint: { organizationId: 'org-1', day: expect.any(Date), endpoint: 'GET /public/candidates' } },
  create: expect.objectContaining({ organizationId: 'org-1', endpoint: 'GET /public/candidates', requestCount: 1, throttledCount: 0 }),
  update: { requestCount: { increment: 1 } },
}));
```
and for the swallow test: `forTenant` mock `.mockRejectedValue(new Error('db down'))` → `await expect(service.record(ctx,'GET /x','request')).resolves.toBeUndefined()`.

- [ ] **Step 4: Implement** `api-usage.service.ts` (record only for this task; report/prune added in T4/T5):
```ts
import { Injectable, Logger } from '@nestjs/common';
import { TenantContext, TenantPrismaService } from '@exam-platform/shared';

export type ApiUsageKind = 'request' | 'throttled';

// UTC-midnight of the given instant, as a Date -- the @db.Date column stores date-only,
// so the time component is irrelevant, but normalizing keeps the unique key stable within a day.
export function utcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

@Injectable()
export class ApiUsageService {
  private readonly logger = new Logger(ApiUsageService.name);

  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  // Fire-and-forget safe: callers do `void apiUsage.record(...)` and never await it in the
  // request path. This method therefore NEVER throws -- any failure is logged and swallowed,
  // because a metering write must not break or delay a real API request.
  async record(context: TenantContext, endpoint: string, kind: ApiUsageKind, now = new Date()): Promise<void> {
    const day = utcDay(now);
    const col = kind === 'throttled' ? 'throttledCount' : 'requestCount';
    try {
      await this.tenantPrisma.forTenant(context, (tx) =>
        tx.apiUsageDaily.upsert({
          where: { organizationId_day_endpoint: { organizationId: context.organizationId as string, day, endpoint } },
          create: {
            organizationId: context.organizationId as string,
            day,
            endpoint,
            requestCount: kind === 'request' ? 1 : 0,
            throttledCount: kind === 'throttled' ? 1 : 0,
          },
          update: { [col]: { increment: 1 } },
        }),
      );
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      this.logger.warn(`api-usage: failed to record ${kind} for ${endpoint}: ${detail}`);
    }
  }
}
```

- [ ] **Step 5: Module** `api-usage.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { ApiUsageService } from './api-usage.service';

@Module({
  providers: [ApiUsageService],
  exports: [ApiUsageService],
})
export class ApiUsageModule {}
```
(Interceptor, report route wiring, and retention are added to this module in T3/T4/T5.)

- [ ] **Step 6: Register the module.** Add `ApiUsageModule` to `apps/api/src/app.module.ts` imports (so it's constructed once; T5's retention service rides on it).

- [ ] **Step 7: Tests + tsc + commit.** `npx jest api-usage endpoint-label` (apps/api) + `npx tsc --noEmit`.
```bash
git add apps/api/src/api-usage apps/api/src/app.module.ts
git commit -m "feat(api-usage): ApiUsageService.record + endpoint-label helper + module"
```

---

### Task 3: Write path — interceptor (processed) + throttler override (throttled)

**Files:**
- Create: `apps/api/src/api-usage/api-usage.interceptor.ts`
- Test: `apps/api/src/api-usage/api-usage.interceptor.spec.ts`
- Modify: `apps/api/src/api-usage/api-usage.module.ts` (provide + export the interceptor)
- Modify: `apps/api/src/public-api/public-api-throttler.guard.ts` (record throttles) + `apps/api/src/public-api/public-api-throttler.guard.spec.ts`
- Modify: `apps/api/src/public-api/public-api.module.ts` (import `ApiUsageModule`)
- Modify: `apps/api/src/public-api/public-candidates.controller.ts`, `public-exams.controller.ts`, `public-invitations.controller.ts` (apply `@UseInterceptors(ApiUsageInterceptor)`) + touch their specs if they assert guard/interceptor metadata

**Interfaces:**
- Consumes: `ApiUsageService.record` + `endpointLabel` (T2); `request.apiKeyOrg.organizationId` (set by `ApiKeyAuthGuard`).
- Produces: `ApiUsageInterceptor`; a throttle-recording `PublicApiThrottlerGuard`.

- [ ] **Step 1: Failing test — interceptor** `api-usage.interceptor.spec.ts`. Build a fake `ExecutionContext` whose HTTP request has `apiKeyOrg: { organizationId: 'org-1' }`, `method: 'GET'`, `route: { path: '/public/candidates' }`; a `CallHandler` whose `handle()` returns `of('ok')`; a mocked `ApiUsageService`. Assert:
  - on success, `record` called once with `({ organizationId:'org-1', isSuperAdmin:false }, 'GET /public/candidates', 'request')` (context shape per Step 2);
  - on handler error (`handle()` returns `throwError(() => new Error('boom'))`), `record` still called once with `'request'`, and the error still propagates (`subscribe` error fires);
  - when `request.apiKeyOrg` is absent, `record` is NOT called;
  - `record` is invoked fire-and-forget (not awaited) — asserting it was called is sufficient.

- [ ] **Step 2: Implement** `api-usage.interceptor.ts`:
```ts
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { ApiUsageService } from './api-usage.service';
import { endpointLabel } from './endpoint-label';

// Counts PROCESSED public-API requests (authenticated + not throttled -- both guards already
// passed, else this interceptor never runs). Records on success AND on handler error (the caller
// consumed a request either way). Throttled (429) requests are counted separately in
// PublicApiThrottlerGuard, because a guard rejection short-circuits before any interceptor runs.
@Injectable()
export class ApiUsageInterceptor implements NestInterceptor {
  constructor(private readonly apiUsage: ApiUsageService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const orgId: string | undefined = req.apiKeyOrg?.organizationId;
    const endpoint = endpointLabel(req.method, req.route?.path);
    const recordOnce = () => {
      if (!orgId) return;
      void this.apiUsage.record({ organizationId: orgId, isSuperAdmin: false }, endpoint, 'request');
    };
    // tap fires its next/error callbacks exactly once for this request; record in both so a
    // handler that throws (4xx/5xx) is still counted as a processed request.
    return next.handle().pipe(tap({ next: recordOnce, error: recordOnce }));
  }
}
```
Add to `ApiUsageModule` providers + exports.

- [ ] **Step 3: Run interceptor test** `npx jest api-usage.interceptor` (apps/api) → PASS.

- [ ] **Step 4: Failing test — throttler override** in `public-api-throttler.guard.spec.ts`: construct the guard with a mocked `ApiUsageService`; call `throwThrottlingException(context)` with a fake context whose request has `apiKeyOrg:{organizationId:'org-1'}`, `method:'GET'`, `route:{path:'/public/candidates'}`; assert `record` was called with `('org-1'-context, 'GET /public/candidates', 'throttled')` AND that the method still throws (the 429). (Keep the existing `getTracker` test.)

- [ ] **Step 5: Implement the override** in `public-api-throttler.guard.ts` — add a constructor injecting the base deps + `ApiUsageService`, and override `throwThrottlingException`:
```ts
import { Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ExecutionContext } from '@nestjs/common';
import { THROTTLER_OPTIONS, ThrottlerGuard, ThrottlerModuleOptions, ThrottlerStorage } from '@nestjs/throttler';
import { ApiUsageService } from '../api-usage/api-usage.service';
import { endpointLabel } from '../api-usage/endpoint-label';

@Injectable()
export class PublicApiThrottlerGuard extends ThrottlerGuard {
  constructor(
    @Inject(THROTTLER_OPTIONS) options: ThrottlerModuleOptions,
    @Inject(ThrottlerStorage) storageService: ThrottlerStorage,
    reflector: Reflector,
    private readonly apiUsage: ApiUsageService,
  ) {
    super(options, storageService, reflector);
  }

  protected async getTracker(req: Record<string, any>): Promise<string> {
    return req.apiKeyOrg?.organizationId ?? req.ip;
  }

  // A 429 is thrown here, inside a guard -- before any interceptor runs -- so this is the only
  // place a throttled request can be counted. Record (fire-and-forget) then throw as before.
  protected async throwThrottlingException(context: ExecutionContext, throttlerLimitDetail: any): Promise<void> {
    const req = context.switchToHttp().getRequest();
    const orgId: string | undefined = req.apiKeyOrg?.organizationId;
    if (orgId) {
      void this.apiUsage.record({ organizationId: orgId, isSuperAdmin: false }, endpointLabel(req.method, req.route?.path), 'throttled');
    }
    return super.throwThrottlingException(context, throttlerLimitDetail);
  }
}
```
**Note (verify against installed types):** confirm the `throwThrottlingException` signature in `@nestjs/throttler@6.5.0` (`node_modules/@nestjs/throttler/dist/throttler.guard.d.ts`) and match its parameters exactly (name/arity of `throttlerLimitDetail`); confirm `ThrottlerStorage` is the correct injection token (it is the token the `ThrottlerStorageProvider` provides). Keep the base `super(...)` call intact so throttling behavior is unchanged.

- [ ] **Step 6: Apply the interceptor** to the three public controllers: add `@UseInterceptors(ApiUsageInterceptor)` at class level on `PublicCandidatesController`, `PublicExamsController`, `PublicInvitationsController` (import from `../api-usage/api-usage.interceptor`). Import `ApiUsageModule` into `public-api.module.ts` so both the interceptor and the guard's `ApiUsageService` dep resolve.

- [ ] **Step 7: Tests + tsc + commit.** `npx jest public-api api-usage` (apps/api) + `npx tsc --noEmit`. Expected: throttler still 429s, interceptor records, existing public-api specs green.
```bash
git add apps/api/src/api-usage apps/api/src/public-api
git commit -m "feat(api-usage): count processed requests (interceptor) + throttles (guard override)"
```

---

### Task 4: Reporting — `ApiUsageService.report()` + `GET /organizations/api-usage`

**Files:**
- Modify: `apps/api/src/api-usage/api-usage.service.ts` (add `report`) + spec
- Create: `apps/api/src/organizations/dto/api-usage-query.dto.ts`
- Modify: `apps/api/src/organizations/organizations.controller.ts` (route) + `organizations.controller.spec.ts`
- Modify: `apps/api/src/organizations/organizations.module.ts` (import `ApiUsageModule`)

**Interfaces:**
- Consumes: `ApiUsageDaily` (T1), `ApiUsageService` (T2).
- Produces: `ApiUsageService.report(context, window: 30 | 90): Promise<ApiUsageReport>` where `ApiUsageReport = { window: number; totals: { requests: number; throttled: number }; byEndpoint: { endpoint: string; requests: number; throttled: number }[]; byDay: { day: string; requests: number; throttled: number }[] }`; `GET /organizations/api-usage?window=30|90`.

- [ ] **Step 1: Failing test — report()** in `api-usage.service.spec.ts`. Mock `forTenant` to invoke the callback with a `tx.apiUsageDaily.findMany` returning rows across 2 endpoints / 2 days; assert:
  - `findMany` called with `where: { day: { gte: <utcDay(now) - (window-1) days> } }` (window inclusive of today) via forTenant with the passed context;
  - `totals` sums requests + throttled;
  - `byEndpoint` groups by endpoint (desc by requests);
  - `byDay` groups by day ascending, `day` serialized as `YYYY-MM-DD`.

- [ ] **Step 2: Implement `report()`** in `api-usage.service.ts`:
```ts
export interface ApiUsageReport {
  window: number;
  totals: { requests: number; throttled: number };
  byEndpoint: { endpoint: string; requests: number; throttled: number }[];
  byDay: { day: string; requests: number; throttled: number }[];
}

// window is validated to 30 | 90 at the controller; inclusive of today (gte today-(window-1)).
async report(context: TenantContext, window: number, now = new Date()): Promise<ApiUsageReport> {
  const since = utcDay(new Date(now.getTime() - (window - 1) * 24 * 60 * 60 * 1000));
  const rows = await this.tenantPrisma.forTenant(context, (tx) =>
    tx.apiUsageDaily.findMany({ where: { day: { gte: since } }, orderBy: [{ day: 'asc' }, { endpoint: 'asc' }] }),
  );
  const totals = { requests: 0, throttled: 0 };
  const byEndpoint = new Map<string, { endpoint: string; requests: number; throttled: number }>();
  const byDay = new Map<string, { day: string; requests: number; throttled: number }>();
  for (const r of rows) {
    totals.requests += r.requestCount; totals.throttled += r.throttledCount;
    const e = byEndpoint.get(r.endpoint) ?? { endpoint: r.endpoint, requests: 0, throttled: 0 };
    e.requests += r.requestCount; e.throttled += r.throttledCount; byEndpoint.set(r.endpoint, e);
    const key = r.day.toISOString().slice(0, 10);
    const d = byDay.get(key) ?? { day: key, requests: 0, throttled: 0 };
    d.requests += r.requestCount; d.throttled += r.throttledCount; byDay.set(key, d);
  }
  return {
    window,
    totals,
    byEndpoint: [...byEndpoint.values()].sort((a, b) => b.requests - a.requests),
    byDay: [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day)),
  };
}
```

- [ ] **Step 3: DTO** `api-usage-query.dto.ts`:
```ts
import { Type } from 'class-transformer';
import { IsIn, IsOptional } from 'class-validator';

export class ApiUsageQueryDto {
  // 30 or 90; default 30. @Type coerces the query string to a number before @IsIn checks it.
  @IsOptional()
  @Type(() => Number)
  @IsIn([30, 90])
  window?: number;
}
```

- [ ] **Step 4: Failing controller spec** in `organizations.controller.spec.ts`: `GET /organizations/api-usage` delegates to `ApiUsageService.report(tenant, window ?? 30)`; carries per-method `@RequirePermissions('org:manage_settings')` (Reflector assertion, mirroring the existing api-key route assertions in this spec). Run `npx jest organizations.controller` → FAIL.

- [ ] **Step 5: Controller route** in `organizations.controller.ts` (inject `ApiUsageService` via constructor; `ApiUsageModule` imported into `organizations.module.ts`):
```ts
@Get('api-usage')
@RequirePermissions('org:manage_settings')
getApiUsage(@CurrentTenant() tenant: TenantContext, @Query() query: ApiUsageQueryDto) {
  return this.apiUsage.report(tenant, query.window ?? 30);
}
```
(Import `ApiUsageService`, `ApiUsageQueryDto`, and `Get`/`Query` if not already imported.)

- [ ] **Step 6: Tests + tsc + commit.** `npx jest api-usage organizations` (apps/api) + `npx tsc --noEmit`.
```bash
git add apps/api/src/api-usage apps/api/src/organizations
git commit -m "feat(api-usage): GET /organizations/api-usage report gated org:manage_settings"
```

---

### Task 5: Retention — 365-day purge (`setInterval` service)

**Files:**
- Create: `apps/api/src/api-usage/api-usage-retention.service.ts`
- Test: `apps/api/src/api-usage/api-usage-retention.service.spec.ts`
- Modify: `apps/api/src/api-usage/api-usage.module.ts` (provide the retention service)

**Interfaces:**
- Consumes: `TenantPrismaService`, `ApiUsageDaily` (T1).
- Produces: `ApiUsageRetentionService.prune(now?): Promise<number>` (rows deleted), booting on module init + daily thereafter.

- [ ] **Step 1: Failing test** `api-usage-retention.service.spec.ts`: mock `forTenant` to invoke the callback with `tx.apiUsageDaily.deleteMany` (returns `{ count: 3 }`); call `prune(now)`; assert `deleteMany` called with `where: { day: { lt: <utcDay(now) - 365 days> } }` and `forTenant` used the all-org bypass `{ organizationId: null, isSuperAdmin: true }`; assert it returns 3; assert a rejecting `forTenant` is swallowed (returns 0, no throw).

- [ ] **Step 2: Implement** `api-usage-retention.service.ts` (mirror `RecycleBinRetentionService` shape exactly — `setInterval`, `unref`, `OnModuleInit/OnModuleDestroy`, boot-then-daily):
```ts
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { TenantPrismaService } from '@exam-platform/shared';
import { utcDay } from './api-usage.service';

export const API_USAGE_RETENTION_DAYS = 365;
const PRUNE_INTERVAL_MS = 24 * 60 * 60 * 1000;

// Deletes api_usage_daily rows older than 365 days -- on boot then daily. Mirrors
// RecycleBinRetentionService (plain setInterval; @nestjs/schedule is not a dependency).
// api_usage_daily has no FK pointing at it, so a single deleteMany is safe (no per-row dance).
// ponytail: single-process interval; move to a repeatable queue job if api scales out.
@Injectable()
export class ApiUsageRetentionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ApiUsageRetentionService.name);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  onModuleInit(): void {
    void this.prune();
    this.timer = setInterval(() => void this.prune(), PRUNE_INTERVAL_MS);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async prune(now = new Date()): Promise<number> {
    const cutoff = utcDay(new Date(now.getTime() - API_USAGE_RETENTION_DAYS * 24 * 60 * 60 * 1000));
    try {
      const { count } = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) =>
        tx.apiUsageDaily.deleteMany({ where: { day: { lt: cutoff } } }),
      );
      if (count > 0) this.logger.log(`api-usage retention: purged ${count} rows older than ${API_USAGE_RETENTION_DAYS} days`);
      return count;
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      this.logger.warn(`api-usage retention: prune failed: ${detail}`);
      return 0;
    }
  }
}
```
Add `ApiUsageRetentionService` to `ApiUsageModule` providers (no export needed).

- [ ] **Step 3: Tests + tsc + commit.** `npx jest api-usage` (apps/api) + `npx tsc --noEmit`.
```bash
git add apps/api/src/api-usage
git commit -m "feat(api-usage): 365-day retention purge (setInterval service)"
```

---

### Task 6: Web — usage card in Integrations settings

**Files:**
- Create: `apps/web/lib/hooks/useApiUsage.ts`
- Modify: `apps/web/app/v2/(org-admin)/settings/integrations/page.tsx` (add the usage card)
- Modify: `apps/web/lib/types.ts` (add the report type, types-only)
- Test: `apps/web/app/v2/(org-admin)/settings/integrations/*.test.tsx` (extend existing, or add `api-usage-card.test.tsx` if the card is a small subcomponent)

**Interfaces:**
- Consumes: `GET /organizations/api-usage?window=` (T4).

- [ ] **Step 1: Type** in `types.ts` (types-only; no runtime `@exam-platform/shared` import):
```ts
export interface ApiUsageReport {
  window: number;
  totals: { requests: number; throttled: number };
  byEndpoint: { endpoint: string; requests: number; throttled: number }[];
  byDay: { day: string; requests: number; throttled: number }[];
}
```

- [ ] **Step 2: Hook** `useApiUsage.ts` — mirror an existing authed settings hook (e.g. `useIntegrations`): `useApiUsage(window: 30 | 90)` does `apiFetch<ApiUsageReport>(\`/organizations/api-usage?window=${window}\`)`, keyed by window, with the app's standard query setup. Read-only (no mutation).

- [ ] **Step 3: Failing test** for the usage card: renders totals (requests + throttled), a per-endpoint table (endpoint · requests · throttled), and a 30/90 toggle that refetches; shows an empty state ("No API usage recorded yet") when `totals.requests === 0 && totals.throttled === 0`. Mock the hook/fetch. Run `npx jest api-usage` (apps/web) → FAIL first.

- [ ] **Step 4: Implement the card** in the Integrations settings page, below the existing API-key section: a bordered "API usage" card with the 30/90 toggle (buttons), the two totals, the per-endpoint table, and a simple daily bar/sparkline of `byDay` (reuse the existing chart primitive used elsewhere in v2 reports; if none is trivially reusable, render a minimal inline bar list — do NOT add a charting dependency). Deep-import ui primitives (Button/table), never the ui-v2 barrel. Only render the card when an API key is configured (reuse the page's existing `apiKeyConfigured` state); otherwise the key section's existing empty state stands.

- [ ] **Step 5: Run tests + tsc + commit.** `npx jest api-usage integrations` (apps/web); web suite (note only the known pre-existing ImpersonationBanner failure); `npx tsc -p apps/web/tsconfig.json --noEmit` (ignore pre-existing stale `.next/types` noise; no NEW errors).
```bash
git add apps/web/lib apps/web/app/v2/'(org-admin)'/settings/integrations
git commit -m "feat(api-usage): API usage card in Integrations settings"
```

---

## Self-Review

**Spec coverage:** table+RLS (T1) ✓; record() fire-and-forget upsert (T2) ✓; processed-via-interceptor + throttled-via-guard-override, the two-spot write path the spec calls out (T3) ✓; windowed report gated org:manage_settings (T4) ✓; 365-day setInterval retention (T5) ✓; web usage card in Integrations settings with 30/90 toggle + empty state (T6) ✓.

**Placeholder scan:** No TBD. Two explicit "verify against installed types" flags in T3 (throttler `throwThrottlingException` signature + `ThrottlerStorage` token) — these are real API-surface confirmations, not hand-waves; the code given is the expected shape for `@nestjs/throttler@6.5.0`. T6 chart says "reuse existing primitive or minimal inline bars, no new dependency" (the never-add-a-dep constraint).

**Type/name consistency:** `ApiUsageDaily` fields (T1) ↔ `record`/`report` (T2/T4) ↔ web `ApiUsageReport` (T6) spelled identically; unique key `organizationId_day_endpoint` used in `record` matches the `@@unique([organizationId, day, endpoint])`; `utcDay` defined once in `api-usage.service.ts` and reused by retention (T5); `endpointLabel` defined once (T2) and reused by interceptor + guard (T3); `window: 30 | 90` consistent across DTO (T4) and hook (T6); `kind: 'request' | 'throttled'` consistent T2↔T3.

**Load-bearing risks:** (a) throttle can only be counted in the guard (interceptors don't run on a guard rejection) — T3 does exactly this and asserts the 429 still throws; (b) metering must never break the API — record() swallows in T2, callers use `void`, and both write sites guard on `orgId` presence; (c) guard constructor must call `super(options, storage, reflector)` unchanged so throttling behavior is preserved — T3 Step 5 + its verify note; (d) tenant safety — every read/write via forTenant (report tenant-scoped, retention all-org bypass), never raw PrismaService.
