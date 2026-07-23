# Public API + Webhooks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a read-only, API-key-authenticated public REST API (candidates, exams, invitations, results) plus HMAC-signed webhooks for `invitation.created` and `attempt.settled`, so orgs can integrate with their own ATS instead of only using the built-in consoles.

**Architecture:** Everything lives inside `apps/api` as new modules — no new service. API keys are a SHA-256 hash on `Organization` (verify-only, never sent anywhere). Webhook delivery reuses the existing hand-wired BullMQ queue/worker pattern (`apps/api/src/jobs/*`), not `@nestjs/bullmq`. The one cross-service piece — `attempt.settled` firing in `apps/exam-runtime` — is bridged by a new internal-only endpoint on `apps/api`, mirroring the existing (reverse-direction) internal-call pattern between these two services exactly.

**Tech Stack:** NestJS, Prisma/Azure SQL, BullMQ + ioredis (already installed), native `fetch` for cross-service calls (no axios anywhere in this monorepo — don't add it).

## Global Constraints

- v1 is **read-only** on the public API — no write endpoints (create candidate/invitation via the public API is explicitly out of scope).
- **One active API key per org** — no per-key scopes, no multiple keys. Regenerating overwrites and immediately invalidates the previous key.
- Webhook events in v1: **only** `invitation.created` and `attempt.settled`.
- Public-API results must **never** include proctoring or integrity data — those fields exist on the staff-facing `ExamResultRow` type and must be explicitly excluded, not just "not selected by accident."
- Public-API rate limit: 60 requests/minute, keyed by **organizationId**, not IP. Must fail **closed** on a Redis outage — do not reuse `FailOpenThrottlerGuard`, which fails open by design for the staff console.
- The webhook signing scheme is HMAC-SHA256 over the raw JSON body, sent as `X-Webhook-Signature` — this exact header name and algorithm, so it matches the Stripe/GitHub convention documented for integrators.
- `docs/public-api.md` (hand-written, not generated) is a required deliverable, not optional polish.
- Follow established patterns exactly where they exist: the `smtpPasswordEncrypted`/`aiApiKeyEncrypted` column-on-`Organization` pattern for secrets, the `updateSmtpSettings`/`updateAiKey` method shape in `OrganizationsService` for admin-triggered secret writes, the `AttemptService.resolveContext()`-style super-admin-bootstrap `forTenant` call for resolving a tenant from an opaque credential, and the exam-runtime `InternalController`/`InternalAuthGuard` shape (mirrored, not shared — this codebase already duplicates that guard per-service rather than sharing it from `packages/shared`, so follow that precedent rather than introducing a refactor).

---

### Task 1: Schema — Organization columns + WebhookDelivery model

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260719150000_public_api_webhooks/migration.sql`

**Interfaces:**
- Produces: `Organization.apiKeyHash: string | null`, `Organization.apiKeyPrefix: string | null`, `Organization.apiKeyCreatedAt: Date | null`, `Organization.webhookUrl: string | null`, `Organization.webhookSecretEncrypted: string | null`, `Organization.webhookDeliveries: WebhookDelivery[]`, and the full `WebhookDelivery` model — every later task in this plan depends on these.

- [ ] **Step 1: Add the new columns to `Organization` and the new `WebhookDelivery` model**

In `apps/api/prisma/schema.prisma`, add five new nullable columns to `model Organization` (after `aiApiKeyEncrypted`, before `planId`) and the new back-relation (after `auditLogs`):

```prisma
model Organization {
  id                     String              @id @default(uuid()) @db.UniqueIdentifier
  name                   String
  slug                   String              @unique
  region                 String              @default("us")
  status                 String              @default("active")
  logoPath               String?             @map("logo_path")
  primaryColor           String?             @map("primary_color")
  accentColor            String?             @map("accent_color")
  smtpHost               String?             @map("smtp_host")
  smtpPort               Int?                @map("smtp_port")
  smtpUser               String?             @map("smtp_user")
  smtpPasswordEncrypted  String?             @map("smtp_password_encrypted")
  emailFromAddress       String?             @map("email_from_address")
  aiApiKeyEncrypted      String?             @map("ai_api_key_encrypted")
  apiKeyHash             String?             @map("api_key_hash")
  apiKeyPrefix           String?             @map("api_key_prefix")
  apiKeyCreatedAt         DateTime?           @map("api_key_created_at")
  webhookUrl              String?             @map("webhook_url")
  webhookSecretEncrypted  String?             @map("webhook_secret_encrypted")
  planId                 String              @map("plan_id") @db.UniqueIdentifier
  plan                   Plan                @relation(fields: [planId], references: [id])
  createdAt              DateTime            @default(now()) @map("created_at")
  users                  User[]
  auditLogs               AuditLog[]
  webhookDeliveries       WebhookDelivery[]

  @@map("organizations")
}
```

Add the new model anywhere after `Organization` (e.g. right after it):

```prisma
model WebhookDelivery {
  id             String       @id @default(uuid()) @db.UniqueIdentifier
  organizationId String       @map("organization_id") @db.UniqueIdentifier
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  eventType      String       @map("event_type")
  payloadJson    String       @map("payload_json") @db.NVarChar(Max)
  status         String       @default("pending")
  httpStatusCode Int?         @map("http_status_code")
  attemptCount   Int          @default(0) @map("attempt_count")
  lastAttemptAt  DateTime?    @map("last_attempt_at")
  createdAt      DateTime     @default(now()) @map("created_at")

  @@index([organizationId, createdAt])
  @@map("webhook_deliveries")
}
```

- [ ] **Step 2: Write the migration SQL**

Create `apps/api/prisma/migrations/20260719150000_public_api_webhooks/migration.sql`:

```sql
ALTER TABLE [dbo].[organizations] ADD [api_key_hash] NVARCHAR(1000);
ALTER TABLE [dbo].[organizations] ADD [api_key_prefix] NVARCHAR(1000);
ALTER TABLE [dbo].[organizations] ADD [api_key_created_at] DATETIME2;
ALTER TABLE [dbo].[organizations] ADD [webhook_url] NVARCHAR(1000);
ALTER TABLE [dbo].[organizations] ADD [webhook_secret_encrypted] NVARCHAR(1000);

CREATE TABLE [dbo].[webhook_deliveries] (
    [id]               UNIQUEIDENTIFIER NOT NULL CONSTRAINT [webhook_deliveries_id_df] DEFAULT newid(),
    [organization_id]  UNIQUEIDENTIFIER NOT NULL,
    [event_type]       NVARCHAR(1000) NOT NULL,
    [payload_json]     NVARCHAR(max) NOT NULL,
    [status]           NVARCHAR(1000) NOT NULL CONSTRAINT [webhook_deliveries_status_df] DEFAULT 'pending',
    [http_status_code] INT,
    [attempt_count]    INT NOT NULL CONSTRAINT [webhook_deliveries_attempt_count_df] DEFAULT 0,
    [last_attempt_at]  DATETIME2,
    [created_at]       DATETIME2 NOT NULL CONSTRAINT [webhook_deliveries_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [webhook_deliveries_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [webhook_deliveries_organization_id_fkey] FOREIGN KEY ([organization_id]) REFERENCES [dbo].[organizations]([id]) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX [webhook_deliveries_organization_id_created_at_idx] ON [dbo].[webhook_deliveries]([organization_id], [created_at]);
```

- [ ] **Step 3: Apply the migration and regenerate the Prisma client**

Run: `cd apps/api && npx prisma migrate deploy && npx prisma generate`
Expected: `20260719150000_public_api_webhooks` applied, client regenerated with the new `Organization` fields and the new `WebhookDelivery` model.

- [ ] **Step 4: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260719150000_public_api_webhooks
git commit -m "feat: add API key and webhook columns/table for Public API + Webhooks"
```

---

### Task 2: API key generation & management (org-admin)

**Files:**
- Modify: `apps/api/src/organizations/organizations.service.ts`
- Modify: `apps/api/src/organizations/organizations.controller.ts`
- Modify: `apps/api/src/organizations/organizations.service.spec.ts`
- Test: `apps/api/src/organizations/organizations.controller.spec.ts` (if it exists — check; if not, add unit coverage in the service spec only, following whatever the existing test-file split is)

**Interfaces:**
- Consumes: `Organization.apiKeyHash/apiKeyPrefix/apiKeyCreatedAt` (Task 1).
- Produces: `OrganizationsService.generateApiKey(context, actorUserId): Promise<{ apiKey: string; apiKeyPrefix: string }>`, `OrganizationsService.revokeApiKey(context, actorUserId): Promise<{ apiKeyConfigured: boolean }>` — Task 9 (frontend) calls these via new controller routes. The `apiKeyHash` column this writes is read by Task 3's `ApiKeyAuthGuard`.

This task uses the **existing** `JwtAuthGuard` (staff console auth) — API keys are generated by an authenticated org-admin, not by themselves. `ApiKeyAuthGuard` (the guard that *verifies* a key on the public API) doesn't exist yet; it's introduced in Task 3, which is the first task that needs it.

- [ ] **Step 1: Write the failing tests**

In `apps/api/src/organizations/organizations.service.spec.ts`, find the existing fixture setup (`beforeEach`, shared `context`/`tenantPrisma` mocks) and add, matching this file's existing test style (check the top of the file for whether it mocks `this.prisma` directly or via `tenantPrisma.forTenant` — match whichever `updateSmtpSettings`'s existing tests already use):

```typescript
  describe('generateApiKey', () => {
    it('stores a hashed key and returns the full key exactly once', async () => {
      prisma.organization.update.mockResolvedValue({ id: 'org-1' });

      const result = await service.generateApiKey(context, 'user-1');

      expect(result.apiKey).toMatch(/^pk_live_[0-9a-f]{64}$/);
      expect(result.apiKeyPrefix).toBe(result.apiKey.slice(0, 12));
      expect(prisma.organization.update).toHaveBeenCalledWith({
        where: { id: 'org-1' },
        data: expect.objectContaining({
          apiKeyHash: expect.any(String),
          apiKeyPrefix: result.apiKeyPrefix,
          apiKeyCreatedAt: expect.any(Date),
        }),
      });
      const writtenHash = prisma.organization.update.mock.calls[0][0].data.apiKeyHash;
      expect(writtenHash).not.toBe(result.apiKey);
      expect(writtenHash).toHaveLength(64);
      expect(audit.record).toHaveBeenCalledWith(context, expect.objectContaining({ action: 'organization.api_key_generated' }));
    });

    it('overwrites a previous key on regeneration, invalidating it', async () => {
      prisma.organization.update.mockResolvedValue({ id: 'org-1' });

      const first = await service.generateApiKey(context, 'user-1');
      const second = await service.generateApiKey(context, 'user-1');

      expect(first.apiKey).not.toBe(second.apiKey);
      expect(prisma.organization.update).toHaveBeenCalledTimes(2);
    });
  });

  describe('revokeApiKey', () => {
    it('clears the stored key', async () => {
      prisma.organization.update.mockResolvedValue({ id: 'org-1' });

      const result = await service.revokeApiKey(context, 'user-1');

      expect(result).toEqual({ apiKeyConfigured: false });
      expect(prisma.organization.update).toHaveBeenCalledWith({
        where: { id: 'org-1' },
        data: { apiKeyHash: null, apiKeyPrefix: null, apiKeyCreatedAt: null },
      });
      expect(audit.record).toHaveBeenCalledWith(context, expect.objectContaining({ action: 'organization.api_key_revoked' }));
    });
  });
```

(Adapt `prisma`/`context`/`audit` to whatever variable names `organizations.service.spec.ts` already uses for its Prisma mock, tenant context fixture, and audit mock — check the top of the file before pasting; they're almost certainly named consistently with the existing `updateSmtpSettings`/`updateAiKey` tests already in this file.)

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/api && npx jest organizations.service.spec.ts`
Expected: FAIL — `service.generateApiKey is not a function`

- [ ] **Step 3: Implement `generateApiKey`/`revokeApiKey`**

In `apps/api/src/organizations/organizations.service.ts`, add the import:

```typescript
import { randomBytes, createHash } from 'crypto';
```

Add a private helper near the top of the class (or as a module-level function above the class, matching whatever style the file already uses for small helpers):

```typescript
  private generateApiKeyValue(): { apiKey: string; apiKeyPrefix: string; apiKeyHash: string } {
    const apiKey = `pk_live_${randomBytes(32).toString('hex')}`;
    const apiKeyPrefix = apiKey.slice(0, 12);
    const apiKeyHash = createHash('sha256').update(apiKey).digest('hex');
    return { apiKey, apiKeyPrefix, apiKeyHash };
  }
```

Add the two public methods, following `updateSmtpSettings`'s exact `requireOrganizationId` + `prisma.organization.update` + `audit.record` shape:

```typescript
  async generateApiKey(context: TenantContext, actorUserId: string): Promise<{ apiKey: string; apiKeyPrefix: string }> {
    const organizationId = this.requireOrganizationId(context);
    const { apiKey, apiKeyPrefix, apiKeyHash } = this.generateApiKeyValue();

    await this.prisma.organization.update({
      where: { id: organizationId },
      data: { apiKeyHash, apiKeyPrefix, apiKeyCreatedAt: new Date() },
    });
    await this.audit.record(context, {
      actorUserId,
      action: 'organization.api_key_generated',
      entityType: 'organization',
      entityId: organizationId,
    });
    return { apiKey, apiKeyPrefix };
  }

  async revokeApiKey(context: TenantContext, actorUserId: string): Promise<{ apiKeyConfigured: boolean }> {
    const organizationId = this.requireOrganizationId(context);

    await this.prisma.organization.update({
      where: { id: organizationId },
      data: { apiKeyHash: null, apiKeyPrefix: null, apiKeyCreatedAt: null },
    });
    await this.audit.record(context, {
      actorUserId,
      action: 'organization.api_key_revoked',
      entityType: 'organization',
      entityId: organizationId,
    });
    return { apiKeyConfigured: false };
  }
```

Also extend the existing `getIntegrations` method's return object to include `apiKeyConfigured: boolean`, `apiKeyPrefix: string | null`, `apiKeyCreatedAt: Date | null`, `webhookConfigured: boolean`, `webhookUrl: string | null` (read directly off the `Organization` row it already fetches — no new query). Read the current method body first (`getIntegrations`, lines ~209-222) and add these fields to whatever object it currently returns, deriving `apiKeyConfigured: organization.apiKeyHash !== null` and `webhookConfigured: organization.webhookUrl !== null`.

- [ ] **Step 4: Run it to verify it passes**

Run: `cd apps/api && npx jest organizations.service.spec.ts`
Expected: PASS

- [ ] **Step 5: Add the controller routes**

In `apps/api/src/organizations/organizations.controller.ts`, add two routes following the exact `@RequirePermissions('org:manage_settings')` + `@CurrentTenant()`/`@CurrentUserId()` shape already used by `updateSmtpSettings`/`updateAiKey`:

```typescript
  @Post('integrations/api-key')
  @RequirePermissions('org:manage_settings')
  generateApiKey(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string) {
    return this.organizationsService.generateApiKey(tenant, userId);
  }

  @Delete('integrations/api-key')
  @RequirePermissions('org:manage_settings')
  revokeApiKey(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string) {
    return this.organizationsService.revokeApiKey(tenant, userId);
  }
```

Add `Delete` to the `@nestjs/common` import at the top of the file if it isn't already imported.

- [ ] **Step 6: Add a controller-level test**

In whichever spec file covers `OrganizationsController` routes (check if `organizations.controller.spec.ts` exists; if the existing SMTP/AI-key routes are only covered at the service level with no dedicated controller spec, skip this step and rely on Task 10's e2e coverage instead — do not invent a new test file convention this codebase doesn't already have).

- [ ] **Step 7: Run the full apps/api suite and tsc**

Run: `cd apps/api && npx jest && npx tsc --noEmit`
Expected: PASS, no new tsc errors

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/organizations/organizations.service.ts apps/api/src/organizations/organizations.controller.ts apps/api/src/organizations/organizations.service.spec.ts
git commit -m "feat: add org-admin API key generate/revoke endpoints"
```

---

### Task 3: Public API — auth guard, throttling, candidates + exams endpoints

**Files:**
- Create: `apps/api/src/public-api/api-key-auth.guard.ts`
- Create: `apps/api/src/public-api/current-api-key-org.decorator.ts`
- Create: `apps/api/src/public-api/public-api-throttler.guard.ts`
- Create: `apps/api/src/public-api/dto/pagination-query.dto.ts`
- Create: `apps/api/src/public-api/public-api.service.ts`
- Create: `apps/api/src/public-api/public-candidates.controller.ts`
- Create: `apps/api/src/public-api/public-exams.controller.ts`
- Create: `apps/api/src/public-api/public-api.module.ts`
- Modify: `apps/api/src/app.module.ts` (register `PublicApiModule`)
- Test: `apps/api/src/public-api/api-key-auth.guard.spec.ts`
- Test: `apps/api/src/public-api/public-api.service.spec.ts`

**Interfaces:**
- Consumes: `Organization.apiKeyHash` (Task 1, written by Task 2). `TenantPrismaService`, `TenantContext` from `@exam-platform/shared`.
- Produces: `ApiKeyAuthGuard` and `@CurrentApiKeyOrg()` — every later public-API controller (Task 4) uses both, in that exact order: `@UseGuards(ApiKeyAuthGuard, PublicApiThrottlerGuard)` — the auth guard MUST run first so `PublicApiThrottlerGuard` can read the resolved org off the request; reversing the order silently falls back to IP-based limiting. `PublicApiService.listCandidates/getCandidate/listExams/getExam` — Task 4 adds sibling methods to this same service for invitations/results.

- [ ] **Step 1: Write the failing test for `ApiKeyAuthGuard`**

Create `apps/api/src/public-api/api-key-auth.guard.spec.ts`:

```typescript
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'crypto';
import { ApiKeyAuthGuard } from './api-key-auth.guard';

describe('ApiKeyAuthGuard', () => {
  let guard: ApiKeyAuthGuard;
  let tenantPrisma: { forTenant: jest.Mock };

  beforeEach(() => {
    tenantPrisma = { forTenant: jest.fn() };
    guard = new ApiKeyAuthGuard(tenantPrisma as any);
  });

  function contextWithHeader(authorization: string | undefined): ExecutionContext {
    const request: any = { headers: authorization !== undefined ? { authorization } : {} };
    return { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
  }

  it('throws UnauthorizedException when the Authorization header is missing', async () => {
    await expect(guard.canActivate(contextWithHeader(undefined))).rejects.toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException when the header is not a Bearer token', async () => {
    await expect(guard.canActivate(contextWithHeader('Basic abc123'))).rejects.toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException when no organization matches the hash', async () => {
    tenantPrisma.forTenant.mockResolvedValue(null);

    await expect(guard.canActivate(contextWithHeader('Bearer pk_live_wrongkey'))).rejects.toThrow(UnauthorizedException);
    expect(tenantPrisma.forTenant).toHaveBeenCalledWith({ organizationId: null, isSuperAdmin: true }, expect.any(Function));
  });

  it('attaches request.apiKeyOrg and returns true on a valid key', async () => {
    tenantPrisma.forTenant.mockResolvedValue({ id: 'org-1' });
    const request: any = { headers: { authorization: 'Bearer pk_live_realkey' } };
    const context = { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(request.apiKeyOrg).toEqual({ organizationId: 'org-1' });
  });

  it('hashes the provided key with SHA-256 before querying', async () => {
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn({ organization: { findFirst: jest.fn().mockResolvedValue(null) } }));
    const expectedHash = createHash('sha256').update('pk_live_realkey').digest('hex');
    const captured: { where?: { apiKeyHash: string } } = {};
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) =>
      fn({ organization: { findFirst: (args: { where: { apiKeyHash: string } }) => { Object.assign(captured, args); return Promise.resolve(null); } } }),
    );

    await expect(guard.canActivate(contextWithHeader('Bearer pk_live_realkey'))).rejects.toThrow(UnauthorizedException);
    expect(captured.where?.apiKeyHash).toBe(expectedHash);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/api && npx jest api-key-auth.guard.spec.ts`
Expected: FAIL — cannot find module `./api-key-auth.guard`

- [ ] **Step 3: Implement `ApiKeyAuthGuard`**

Create `apps/api/src/public-api/api-key-auth.guard.ts`:

```typescript
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'crypto';
import { TenantPrismaService } from '@exam-platform/shared';

@Injectable()
export class ApiKeyAuthGuard implements CanActivate {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];
    if (typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or malformed API key');
    }
    const apiKey = authHeader.slice('Bearer '.length);
    const apiKeyHash = createHash('sha256').update(apiKey).digest('hex');

    // No tenant context exists yet -- resolving which org this key belongs to is
    // exactly what this lookup is for, so it uses the same super-admin-bootstrap
    // pattern established for resolving tenant from an opaque credential elsewhere
    // (e.g. AttemptService.resolveContext() in exam-runtime).
    const organization = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) =>
      tx.organization.findFirst({ where: { apiKeyHash } }),
    );
    if (!organization) {
      throw new UnauthorizedException('Invalid API key');
    }
    request.apiKeyOrg = { organizationId: organization.id };
    return true;
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd apps/api && npx jest api-key-auth.guard.spec.ts`
Expected: PASS

- [ ] **Step 5: Add the `@CurrentApiKeyOrg()` decorator and `PublicApiThrottlerGuard`**

Create `apps/api/src/public-api/current-api-key-org.decorator.ts`:

```typescript
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { TenantContext } from '@exam-platform/shared';

export const CurrentApiKeyOrg = createParamDecorator((_: unknown, ctx: ExecutionContext): TenantContext => {
  const request = ctx.switchToHttp().getRequest();
  const apiKeyOrg = request.apiKeyOrg as { organizationId: string } | undefined;
  return { organizationId: apiKeyOrg?.organizationId ?? null, isSuperAdmin: false };
});
```

Create `apps/api/src/public-api/public-api-throttler.guard.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class PublicApiThrottlerGuard extends ThrottlerGuard {
  // Keyed by the resolved organization, not IP -- a per-org public API must not be
  // limited by shared egress infrastructure on the caller's side. Requires
  // ApiKeyAuthGuard to have already run and set request.apiKeyOrg (guard order
  // matters: @UseGuards(ApiKeyAuthGuard, PublicApiThrottlerGuard), never reversed).
  // Deliberately does NOT extend FailOpenThrottlerGuard -- that guard fails open by
  // design for the staff console; a public-facing surface should fail closed.
  protected async getTracker(req: Record<string, any>): Promise<string> {
    return req.apiKeyOrg?.organizationId ?? req.ip;
  }
}
```

Add the new tier to `apps/api/src/rate-limit-tiers.ts`, following the exact existing shape used by the other tiers in this file (read the file first and match whatever pattern `STRICT_AUTH_THROTTLE` etc. already use, including how they already handle the test environment, if at all — do not invent a new environment-gating mechanism this file doesn't already have):

```typescript
export const PUBLIC_API_THROTTLE = { default: { limit: 60, ttl: seconds(60) } };
```

- [ ] **Step 6: Write the failing test for `PublicApiService`**

Create `apps/api/src/public-api/public-api.service.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { PublicApiService } from './public-api.service';
import { TenantPrismaService } from '@exam-platform/shared';

describe('PublicApiService', () => {
  let service: PublicApiService;
  let tenantPrisma: { forTenant: jest.Mock };
  const tenant = { organizationId: 'org-1', isSuperAdmin: false };

  beforeEach(async () => {
    tenantPrisma = { forTenant: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [PublicApiService, { provide: TenantPrismaService, useValue: tenantPrisma }],
    }).compile();
    service = moduleRef.get(PublicApiService);
  });

  describe('listCandidates', () => {
    it('returns a paginated, org-scoped list', async () => {
      const tx = {
        candidate: {
          findMany: jest.fn().mockResolvedValue([{ id: 'cand-1', name: 'Alice', email: 'a@test.com', createdAt: new Date('2026-01-01') }]),
          count: jest.fn().mockResolvedValue(1),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.listCandidates(tenant, 1, 50);

      expect(result).toEqual({
        data: [{ id: 'cand-1', name: 'Alice', email: 'a@test.com', createdAt: new Date('2026-01-01') }],
        page: 1,
        pageSize: 50,
        total: 1,
      });
      expect(tx.candidate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: 'org-1' }, skip: 0, take: 50 }),
      );
    });

    it('computes skip from the requested page', async () => {
      const tx = { candidate: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await service.listCandidates(tenant, 3, 20);

      expect(tx.candidate.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 40, take: 20 }));
    });
  });

  describe('getCandidate', () => {
    it('returns null when the candidate does not belong to this org', async () => {
      const tx = { candidate: { findFirst: jest.fn().mockResolvedValue(null) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.getCandidate(tenant, 'cand-1');

      expect(result).toBeNull();
      expect(tx.candidate.findFirst).toHaveBeenCalledWith({
        where: { id: 'cand-1', organizationId: 'org-1' },
        select: { id: true, name: true, email: true, createdAt: true },
      });
    });
  });

  describe('listExams', () => {
    it('returns exam metadata without question content', async () => {
      const tx = {
        exam: {
          findMany: jest.fn().mockResolvedValue([{ id: 'exam-1', title: 'Backend Round', status: 'published', durationMinutes: 60, passCriteriaPercent: 40, createdAt: new Date('2026-01-01') }]),
          count: jest.fn().mockResolvedValue(1),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.listExams(tenant, 1, 50);

      expect(result.data[0]).not.toHaveProperty('sections');
      expect(tx.exam.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId: 'org-1' },
          select: { id: true, title: true, status: true, durationMinutes: true, passCriteriaPercent: true, createdAt: true },
        }),
      );
    });
  });
});
```

- [ ] **Step 7: Run it to verify it fails**

Run: `cd apps/api && npx jest public-api.service.spec.ts`
Expected: FAIL — cannot find module `./public-api.service`

- [ ] **Step 8: Implement `PublicApiService`, `PaginationQueryDto`, and both controllers**

Create `apps/api/src/public-api/dto/pagination-query.dto.ts`:

```typescript
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number = 50;
}
```

Create `apps/api/src/public-api/public-api.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { TenantPrismaService, TenantContext } from '@exam-platform/shared';

export interface PaginatedResponse<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface PublicCandidate {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
}

export interface PublicExam {
  id: string;
  title: string;
  status: string;
  durationMinutes: number;
  passCriteriaPercent: number;
  createdAt: Date;
}

const CANDIDATE_SELECT = { id: true, name: true, email: true, createdAt: true } as const;
const EXAM_SELECT = { id: true, title: true, status: true, durationMinutes: true, passCriteriaPercent: true, createdAt: true } as const;

@Injectable()
export class PublicApiService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async listCandidates(tenant: TenantContext, page: number, pageSize: number): Promise<PaginatedResponse<PublicCandidate>> {
    const organizationId = tenant.organizationId as string;
    return this.tenantPrisma.forTenant(tenant, async (tx) => {
      const [data, total] = await Promise.all([
        tx.candidate.findMany({ where: { organizationId }, select: CANDIDATE_SELECT, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
        tx.candidate.count({ where: { organizationId } }),
      ]);
      return { data, page, pageSize, total };
    });
  }

  async getCandidate(tenant: TenantContext, id: string): Promise<PublicCandidate | null> {
    const organizationId = tenant.organizationId as string;
    return this.tenantPrisma.forTenant(tenant, (tx) =>
      tx.candidate.findFirst({ where: { id, organizationId }, select: CANDIDATE_SELECT }),
    );
  }

  async listExams(tenant: TenantContext, page: number, pageSize: number): Promise<PaginatedResponse<PublicExam>> {
    const organizationId = tenant.organizationId as string;
    return this.tenantPrisma.forTenant(tenant, async (tx) => {
      const [data, total] = await Promise.all([
        tx.exam.findMany({ where: { organizationId }, select: EXAM_SELECT, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
        tx.exam.count({ where: { organizationId } }),
      ]);
      return { data, page, pageSize, total };
    });
  }

  async getExam(tenant: TenantContext, id: string): Promise<PublicExam | null> {
    const organizationId = tenant.organizationId as string;
    return this.tenantPrisma.forTenant(tenant, (tx) =>
      tx.exam.findFirst({ where: { id, organizationId }, select: EXAM_SELECT }),
    );
  }
}
```

Create `apps/api/src/public-api/public-candidates.controller.ts`:

```typescript
import { Controller, Get, NotFoundException, Param, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiKeyAuthGuard } from './api-key-auth.guard';
import { PublicApiThrottlerGuard } from './public-api-throttler.guard';
import { CurrentApiKeyOrg } from './current-api-key-org.decorator';
import { PublicApiService } from './public-api.service';
import { PaginationQueryDto } from './dto/pagination-query.dto';
import { TenantContext } from '@exam-platform/shared';
import { PUBLIC_API_THROTTLE } from '../rate-limit-tiers';

@Controller('public/candidates')
@UseGuards(ApiKeyAuthGuard, PublicApiThrottlerGuard)
@Throttle(PUBLIC_API_THROTTLE)
export class PublicCandidatesController {
  constructor(private readonly publicApiService: PublicApiService) {}

  @Get()
  list(@CurrentApiKeyOrg() tenant: TenantContext, @Query() query: PaginationQueryDto) {
    return this.publicApiService.listCandidates(tenant, query.page ?? 1, query.pageSize ?? 50);
  }

  @Get(':id')
  async get(@CurrentApiKeyOrg() tenant: TenantContext, @Param('id') id: string) {
    const candidate = await this.publicApiService.getCandidate(tenant, id);
    if (!candidate) {
      throw new NotFoundException(`Candidate ${id} not found`);
    }
    return candidate;
  }
}
```

Create `apps/api/src/public-api/public-exams.controller.ts` (the `:id/results` route is added in Task 4 — this task only adds list/get):

```typescript
import { Controller, Get, NotFoundException, Param, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiKeyAuthGuard } from './api-key-auth.guard';
import { PublicApiThrottlerGuard } from './public-api-throttler.guard';
import { CurrentApiKeyOrg } from './current-api-key-org.decorator';
import { PublicApiService } from './public-api.service';
import { PaginationQueryDto } from './dto/pagination-query.dto';
import { TenantContext } from '@exam-platform/shared';
import { PUBLIC_API_THROTTLE } from '../rate-limit-tiers';

@Controller('public/exams')
@UseGuards(ApiKeyAuthGuard, PublicApiThrottlerGuard)
@Throttle(PUBLIC_API_THROTTLE)
export class PublicExamsController {
  constructor(private readonly publicApiService: PublicApiService) {}

  @Get()
  list(@CurrentApiKeyOrg() tenant: TenantContext, @Query() query: PaginationQueryDto) {
    return this.publicApiService.listExams(tenant, query.page ?? 1, query.pageSize ?? 50);
  }

  @Get(':id')
  async get(@CurrentApiKeyOrg() tenant: TenantContext, @Param('id') id: string) {
    const exam = await this.publicApiService.getExam(tenant, id);
    if (!exam) {
      throw new NotFoundException(`Exam ${id} not found`);
    }
    return exam;
  }
}
```

Create `apps/api/src/public-api/public-api.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { PublicApiService } from './public-api.service';
import { PublicCandidatesController } from './public-candidates.controller';
import { PublicExamsController } from './public-exams.controller';

@Module({
  controllers: [PublicCandidatesController, PublicExamsController],
  providers: [PublicApiService],
  exports: [PublicApiService],
})
export class PublicApiModule {}
```

Register it in `apps/api/src/app.module.ts` — add `PublicApiModule` to the `imports` array alongside the other feature modules already registered there.

- [ ] **Step 9: Run it to verify it passes**

Run: `cd apps/api && npx jest public-api.service.spec.ts api-key-auth.guard.spec.ts`
Expected: PASS

- [ ] **Step 10: Run the full apps/api suite and tsc**

Run: `cd apps/api && npx jest && npx tsc --noEmit`
Expected: PASS, no new tsc errors

- [ ] **Step 11: Commit**

```bash
git add apps/api/src/public-api apps/api/src/app.module.ts apps/api/src/rate-limit-tiers.ts
git commit -m "feat: public API auth guard, org-scoped rate limiting, candidates + exams endpoints"
```

---

### Task 4: Public API — invitations + results endpoints

**Files:**
- Create: `apps/api/src/public-api/public-invitations.controller.ts`
- Modify: `apps/api/src/public-api/public-api.service.ts`
- Modify: `apps/api/src/public-api/public-exams.controller.ts` (add `:id/results` route)
- Modify: `apps/api/src/public-api/public-api.module.ts`
- Modify: `apps/api/src/exams/exams.module.ts` (export `ExamsService` if not already exported, so `PublicApiModule` can import it)
- Modify: `apps/api/src/public-api/public-api.service.spec.ts`

**Interfaces:**
- Consumes: `PublicApiService` (Task 3), `ExamsService.getResults(context, examId): Promise<ExamResultRow[]>` (existing, `apps/api/src/exams/exams.service.ts`) — reused rather than reimplemented, so the public results endpoint gets the same settle-on-read behavior (`settleIfExpiredBatch`) as the staff-facing results screen for free, and only needs to narrow/filter the output.
- Produces: `PublicApiService.listInvitations`, `PublicApiService.getExamResults` — no later task depends on these beyond Task 10's e2e coverage.

- [ ] **Step 1: Write the failing tests**

In `apps/api/src/public-api/public-api.service.spec.ts`, add:

```typescript
  describe('listInvitations', () => {
    it('scopes by organization via the exam relation, and supports optional filters', async () => {
      const tx = {
        invitation: {
          findMany: jest.fn().mockResolvedValue([{ id: 'inv-1', examId: 'exam-1', candidateId: 'cand-1', status: 'invited', invitedAt: new Date('2026-01-01'), expiresAt: new Date('2026-01-08') }]),
          count: jest.fn().mockResolvedValue(1),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.listInvitations(tenant, 1, 50, { examId: 'exam-1' });

      expect(result.total).toBe(1);
      expect(tx.invitation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { exam: { organizationId: 'org-1' }, examId: 'exam-1' } }),
      );
    });

    it('omits absent filters from the where clause', async () => {
      const tx = { invitation: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await service.listInvitations(tenant, 1, 50, {});

      expect(tx.invitation.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { exam: { organizationId: 'org-1' } } }));
    });
  });

  describe('getExamResults', () => {
    it('strips proctoring and integrity data from the staff-facing result rows', async () => {
      const examsService = { getResults: jest.fn().mockResolvedValue([
        {
          candidateId: 'cand-1', candidateName: 'Alice', invitationId: 'inv-1', attemptId: 'attempt-1', status: 'submitted',
          score: 8, maxScore: 10, percentage: 80, passFail: 'pass', submittedAt: new Date('2026-01-01'),
          proctoringAnalysis: { status: 'completed', riskLevel: 'low', summary: 'ok' },
          integrityAnalysis: { status: 'completed', level: 'none', flagsJson: '[]', narrative: null },
          integrityLevel: 'none', integrityFlagCount: 0,
        },
      ]) };
      const svc = new (require('./public-api.service').PublicApiService)(tenantPrisma, examsService);

      const result = await svc.getExamResults(tenant, 'exam-1', 1, 50);

      expect(result.data[0]).toEqual({
        candidateId: 'cand-1', candidateName: 'Alice', status: 'submitted',
        score: 8, maxScore: 10, percentage: 80, passFail: 'pass', submittedAt: new Date('2026-01-01'),
      });
      expect(result.data[0]).not.toHaveProperty('proctoringAnalysis');
      expect(result.data[0]).not.toHaveProperty('integrityAnalysis');
      expect(result.data[0]).not.toHaveProperty('integrityLevel');
      expect(examsService.getResults).toHaveBeenCalledWith(tenant, 'exam-1');
    });

    it('paginates the already-fetched result rows in-memory', async () => {
      const rows = Array.from({ length: 5 }, (_, i) => ({
        candidateId: `cand-${i}`, candidateName: `C${i}`, invitationId: `inv-${i}`, attemptId: null, status: 'submitted',
        score: 1, maxScore: 1, percentage: 100, passFail: 'pass', submittedAt: new Date(),
        proctoringAnalysis: null, integrityAnalysis: null, integrityLevel: null, integrityFlagCount: 0,
      }));
      const examsService = { getResults: jest.fn().mockResolvedValue(rows) };
      const svc = new (require('./public-api.service').PublicApiService)(tenantPrisma, examsService);

      const result = await svc.getExamResults(tenant, 'exam-1', 2, 2);

      expect(result).toMatchObject({ page: 2, pageSize: 2, total: 5 });
      expect(result.data).toHaveLength(2);
      expect(result.data[0].candidateId).toBe('cand-2');
    });
  });
```

Update this spec file's `PublicApiService` instantiation in the top-level `beforeEach` (the `Test.createTestingModule` block) to also provide a mock `ExamsService`:

```typescript
    examsService = { getResults: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        PublicApiService,
        { provide: TenantPrismaService, useValue: tenantPrisma },
        { provide: ExamsService, useValue: examsService },
      ],
    }).compile();
```

(Add `let examsService: { getResults: jest.Mock };` to the `describe` block's variable declarations, and `import { ExamsService } from '../exams/exams.service';` at the top.)

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/api && npx jest public-api.service.spec.ts`
Expected: FAIL — `service.listInvitations is not a function`, `service.getExamResults is not a function`

- [ ] **Step 3: Implement `listInvitations` and `getExamResults`**

In `apps/api/src/public-api/public-api.service.ts`, add the import:

```typescript
import { ExamsService } from '../exams/exams.service';
```

Update the constructor to also inject `ExamsService`:

```typescript
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly examsService: ExamsService,
  ) {}
```

Add the new interfaces and constant near the existing ones:

```typescript
export interface PublicInvitation {
  id: string;
  examId: string;
  candidateId: string;
  status: string;
  invitedAt: Date;
  expiresAt: Date;
}

export interface PublicResultRow {
  candidateId: string;
  candidateName: string;
  status: string;
  score: number | null;
  maxScore: number | null;
  percentage: number | null;
  passFail: string | null;
  submittedAt: Date | null;
}

export interface InvitationFilters {
  examId?: string;
  candidateId?: string;
  status?: string;
}
```

Add the two new methods:

```typescript
  async listInvitations(
    tenant: TenantContext,
    page: number,
    pageSize: number,
    filters: InvitationFilters,
  ): Promise<PaginatedResponse<PublicInvitation>> {
    const organizationId = tenant.organizationId as string;
    const where = {
      exam: { organizationId },
      ...(filters.examId !== undefined ? { examId: filters.examId } : {}),
      ...(filters.candidateId !== undefined ? { candidateId: filters.candidateId } : {}),
      ...(filters.status !== undefined ? { status: filters.status } : {}),
    };
    return this.tenantPrisma.forTenant(tenant, async (tx) => {
      const [data, total] = await Promise.all([
        tx.invitation.findMany({
          where,
          select: { id: true, examId: true, candidateId: true, status: true, invitedAt: true, expiresAt: true },
          orderBy: { invitedAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        tx.invitation.count({ where }),
      ]);
      return { data, page, pageSize, total };
    });
  }

  // getResults() already enforces org-scoping (it 404s if the exam doesn't belong
  // to tenant.organizationId) and already settles any expired in-progress attempts
  // before returning -- reusing it here means the public results endpoint gets that
  // behavior for free and never needs its own duplicate query. Pagination is applied
  // in-memory afterward since getResults() returns the full list.
  async getExamResults(tenant: TenantContext, examId: string, page: number, pageSize: number): Promise<PaginatedResponse<PublicResultRow>> {
    const rows = await this.examsService.getResults(tenant, examId);
    const data: PublicResultRow[] = rows.map((row) => ({
      candidateId: row.candidateId,
      candidateName: row.candidateName,
      status: row.status,
      score: row.score,
      maxScore: row.maxScore,
      percentage: row.percentage,
      passFail: row.passFail,
      submittedAt: row.submittedAt,
    }));
    const start = (page - 1) * pageSize;
    return { data: data.slice(start, start + pageSize), page, pageSize, total: data.length };
  }
```

- [ ] **Step 4: Add the controller wiring**

Create `apps/api/src/public-api/public-invitations.controller.ts`:

```typescript
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiKeyAuthGuard } from './api-key-auth.guard';
import { PublicApiThrottlerGuard } from './public-api-throttler.guard';
import { CurrentApiKeyOrg } from './current-api-key-org.decorator';
import { PublicApiService } from './public-api.service';
import { PaginationQueryDto } from './dto/pagination-query.dto';
import { TenantContext } from '@exam-platform/shared';
import { PUBLIC_API_THROTTLE } from '../rate-limit-tiers';

class ListInvitationsQueryDto extends PaginationQueryDto {
  examId?: string;
  candidateId?: string;
  status?: string;
}

@Controller('public/invitations')
@UseGuards(ApiKeyAuthGuard, PublicApiThrottlerGuard)
@Throttle(PUBLIC_API_THROTTLE)
export class PublicInvitationsController {
  constructor(private readonly publicApiService: PublicApiService) {}

  @Get()
  list(@CurrentApiKeyOrg() tenant: TenantContext, @Query() query: ListInvitationsQueryDto) {
    return this.publicApiService.listInvitations(tenant, query.page ?? 1, query.pageSize ?? 50, {
      examId: query.examId,
      candidateId: query.candidateId,
      status: query.status,
    });
  }
}
```

In `apps/api/src/public-api/public-exams.controller.ts`, add the results route to the existing `PublicExamsController` class:

```typescript
  @Get(':id/results')
  results(@CurrentApiKeyOrg() tenant: TenantContext, @Param('id') id: string, @Query() query: PaginationQueryDto) {
    return this.publicApiService.getExamResults(tenant, id, query.page ?? 1, query.pageSize ?? 50);
  }
```

Update `apps/api/src/public-api/public-api.module.ts` to import `ExamsModule` (so `ExamsService` is injectable into `PublicApiService`) and register the new controller:

```typescript
import { Module } from '@nestjs/common';
import { ExamsModule } from '../exams/exams.module';
import { PublicApiService } from './public-api.service';
import { PublicCandidatesController } from './public-candidates.controller';
import { PublicExamsController } from './public-exams.controller';
import { PublicInvitationsController } from './public-invitations.controller';

@Module({
  imports: [ExamsModule],
  controllers: [PublicCandidatesController, PublicExamsController, PublicInvitationsController],
  providers: [PublicApiService],
  exports: [PublicApiService],
})
export class PublicApiModule {}
```

Check `apps/api/src/exams/exams.module.ts`'s `exports` array — if `ExamsService` isn't already exported, add it.

- [ ] **Step 5: Run it to verify it passes**

Run: `cd apps/api && npx jest public-api.service.spec.ts`
Expected: PASS

- [ ] **Step 6: Run the full apps/api suite and tsc**

Run: `cd apps/api && npx jest && npx tsc --noEmit`
Expected: PASS, no new tsc errors

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/public-api apps/api/src/exams/exams.module.ts
git commit -m "feat: public API invitations + results endpoints, reusing ExamsService.getResults"
```

---

### Task 5: Webhook delivery infrastructure (queue, worker, signing)

**Files:**
- Create: `apps/api/src/jobs/webhook-deliveries.queue.ts`
- Create: `apps/api/src/jobs/webhook-delivery.worker.service.ts`
- Create: `apps/api/src/webhooks/webhooks.service.ts`
- Create: `apps/api/src/webhooks/webhooks.module.ts`
- Modify: `apps/api/src/jobs/jobs.module.ts`
- Test: `apps/api/src/webhooks/webhooks.service.spec.ts`
- Test: `apps/api/src/jobs/webhook-delivery.worker.service.spec.ts`

**Interfaces:**
- Consumes: `WebhookDelivery` model, `Organization.webhookUrl/webhookSecretEncrypted` (Task 1). `OrgSecretsCryptoService.decrypt` (`@exam-platform/shared`, existing). `REDIS_CONNECTION` token (existing, `apps/api/src/jobs/redis-connection.ts`).
- Produces: `WebhooksService.enqueue(organizationId: string, eventType: string, data: Record<string, unknown>): Promise<void>` — Task 6 (webhook secret admin endpoints don't call this), Task 7 (`invitation.created`) and Task 8 (`attempt.settled`, via the internal endpoint) both call this. `WEBHOOK_DELIVERIES_QUEUE_NAME = 'webhook-deliveries'` (exact literal from the spec).

- [ ] **Step 1: Write the failing test for `WebhooksService.enqueue`**

Create `apps/api/src/webhooks/webhooks.service.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { WebhooksService } from './webhooks.service';
import { TenantPrismaService } from '@exam-platform/shared';
import { WEBHOOK_DELIVERIES_QUEUE } from '../jobs/webhook-deliveries.queue';

describe('WebhooksService', () => {
  let service: WebhooksService;
  let tenantPrisma: { forTenant: jest.Mock };
  let queue: { add: jest.Mock };

  beforeEach(async () => {
    tenantPrisma = { forTenant: jest.fn() };
    queue = { add: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        WebhooksService,
        { provide: TenantPrismaService, useValue: tenantPrisma },
        { provide: WEBHOOK_DELIVERIES_QUEUE, useValue: queue },
      ],
    }).compile();
    service = moduleRef.get(WebhooksService);
  });

  it('does nothing when the org has no webhookUrl configured', async () => {
    tenantPrisma.forTenant.mockResolvedValueOnce({ webhookUrl: null });

    await service.enqueue('org-1', 'invitation.created', { id: 'inv-1' });

    expect(queue.add).not.toHaveBeenCalled();
  });

  it('creates a pending WebhookDelivery row and enqueues a job with retry options', async () => {
    const tx = { webhookDelivery: { create: jest.fn().mockResolvedValue({ id: 'delivery-1' }) } };
    tenantPrisma.forTenant
      .mockResolvedValueOnce({ webhookUrl: 'https://example.com/hook' })
      .mockImplementationOnce((_ctx, fn) => fn(tx));

    await service.enqueue('org-1', 'invitation.created', { id: 'inv-1' });

    expect(tx.webhookDelivery.create).toHaveBeenCalledWith({
      data: { organizationId: 'org-1', eventType: 'invitation.created', payloadJson: JSON.stringify({ id: 'inv-1' }), status: 'pending' },
    });
    expect(queue.add).toHaveBeenCalledWith(
      'deliver',
      { deliveryId: 'delivery-1' },
      { attempts: 3, backoff: { type: 'exponential', delay: 30_000 } },
    );
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/api && npx jest webhooks.service.spec.ts`
Expected: FAIL — cannot find module `./webhooks.service`

- [ ] **Step 3: Implement the queue file and `WebhooksService`**

Create `apps/api/src/jobs/webhook-deliveries.queue.ts`:

```typescript
import { Queue } from 'bullmq';
import Redis from 'ioredis';

export const WEBHOOK_DELIVERIES_QUEUE = 'WEBHOOK_DELIVERIES_QUEUE';
export const WEBHOOK_DELIVERIES_QUEUE_NAME = 'webhook-deliveries';

export function createWebhookDeliveriesQueue(connection: Redis): Queue {
  return new Queue(WEBHOOK_DELIVERIES_QUEUE_NAME, { connection });
}
```

Create `apps/api/src/webhooks/webhooks.service.ts`:

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { TenantPrismaService } from '@exam-platform/shared';
import { WEBHOOK_DELIVERIES_QUEUE } from '../jobs/webhook-deliveries.queue';

const SUPER_ADMIN_CONTEXT = { organizationId: null, isSuperAdmin: true };

@Injectable()
export class WebhooksService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    @Inject(WEBHOOK_DELIVERIES_QUEUE) private readonly queue: Queue,
  ) {}

  // Callers (invitation creation, and the internal endpoint the attempt.settled path
  // hits from exam-runtime) pass a raw organizationId rather than a TenantContext --
  // by the time either call site reaches here, organizationId is already known, and
  // requiring a full TenantContext would just push this same bootstrap lookup onto
  // both callers instead of doing it once, here.
  async enqueue(organizationId: string, eventType: string, data: Record<string, unknown>): Promise<void> {
    const organization = await this.tenantPrisma.forTenant(SUPER_ADMIN_CONTEXT, (tx) =>
      tx.organization.findUnique({ where: { id: organizationId }, select: { webhookUrl: true } }),
    );
    if (!organization?.webhookUrl) {
      return;
    }
    const payloadJson = JSON.stringify(data);
    const delivery = await this.tenantPrisma.forTenant(SUPER_ADMIN_CONTEXT, (tx) =>
      tx.webhookDelivery.create({ data: { organizationId, eventType, payloadJson, status: 'pending' } }),
    );
    await this.queue.add('deliver', { deliveryId: delivery.id }, { attempts: 3, backoff: { type: 'exponential', delay: 30_000 } });
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd apps/api && npx jest webhooks.service.spec.ts`
Expected: PASS

- [ ] **Step 5: Write the failing test for `WebhookDeliveryWorkerService`**

Create `apps/api/src/jobs/webhook-delivery.worker.service.spec.ts`:

```typescript
import { WebhookDeliveryWorkerService } from './webhook-delivery.worker.service';
import { TenantPrismaService, OrgSecretsCryptoService } from '@exam-platform/shared';
import { createHmac } from 'crypto';

describe('WebhookDeliveryWorkerService', () => {
  let worker: WebhookDeliveryWorkerService;
  let tenantPrisma: { forTenant: jest.Mock };
  let cryptoService: { decrypt: jest.Mock };
  const originalFetch = global.fetch;

  beforeEach(() => {
    tenantPrisma = { forTenant: jest.fn() };
    cryptoService = { decrypt: jest.fn().mockReturnValue('plaintext-secret') };
    worker = new WebhookDeliveryWorkerService({} as any, tenantPrisma as any, cryptoService as any);
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('signs the payload with HMAC-SHA256 of the decrypted secret and posts it', async () => {
    const delivery = {
      id: 'delivery-1', payloadJson: JSON.stringify({ id: 'inv-1' }),
      organization: { webhookUrl: 'https://example.com/hook', webhookSecretEncrypted: 'encrypted-blob' },
    };
    const tx = { webhookDelivery: { findUniqueOrThrow: jest.fn().mockResolvedValue(delivery), update: jest.fn() } };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });

    await (worker as any).handle({ data: { deliveryId: 'delivery-1' } });

    const expectedSignature = createHmac('sha256', 'plaintext-secret').update(delivery.payloadJson).digest('hex');
    expect(global.fetch).toHaveBeenCalledWith('https://example.com/hook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Webhook-Signature': expectedSignature },
      body: delivery.payloadJson,
    });
    expect(tx.webhookDelivery.update).toHaveBeenCalledWith({
      where: { id: 'delivery-1' },
      data: { status: 'delivered', httpStatusCode: 200, attemptCount: { increment: 1 }, lastAttemptAt: expect.any(Date) },
    });
  });

  it('records status pending (not failed) and throws on a non-2xx response, to let BullMQ retry', async () => {
    const delivery = { id: 'delivery-1', payloadJson: '{}', organization: { webhookUrl: 'https://example.com/hook', webhookSecretEncrypted: 'blob' } };
    const tx = { webhookDelivery: { findUniqueOrThrow: jest.fn().mockResolvedValue(delivery), update: jest.fn() } };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 });

    await expect((worker as any).handle({ data: { deliveryId: 'delivery-1' } })).rejects.toThrow('500');
    expect(tx.webhookDelivery.update).toHaveBeenCalledWith({
      where: { id: 'delivery-1' },
      data: { status: 'pending', httpStatusCode: 500, attemptCount: { increment: 1 }, lastAttemptAt: expect.any(Date) },
    });
  });

  it('marks a delivery permanently failed only once BullMQ has exhausted all retries', async () => {
    const updateMock = jest.fn();
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn({ webhookDelivery: { update: updateMock } }));

    await (worker as any).markFailed('delivery-1');

    expect(updateMock).toHaveBeenCalledWith({ where: { id: 'delivery-1' }, data: { status: 'failed' } });
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `cd apps/api && npx jest webhook-delivery.worker.service.spec.ts`
Expected: FAIL — cannot find module `./webhook-delivery.worker.service`

- [ ] **Step 7: Implement `WebhookDeliveryWorkerService`**

Create `apps/api/src/jobs/webhook-delivery.worker.service.ts`:

```typescript
import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Job, Worker } from 'bullmq';
import Redis from 'ioredis';
import { createHmac } from 'crypto';
import { TenantPrismaService, OrgSecretsCryptoService } from '@exam-platform/shared';
import { REDIS_CONNECTION } from './redis-connection';
import { WEBHOOK_DELIVERIES_QUEUE_NAME } from './webhook-deliveries.queue';

const SUPER_ADMIN_CONTEXT = { organizationId: null, isSuperAdmin: true };

interface WebhookDeliveryJobData {
  deliveryId: string;
}

@Injectable()
export class WebhookDeliveryWorkerService implements OnModuleDestroy {
  private readonly logger = new Logger(WebhookDeliveryWorkerService.name);
  private readonly worker: Worker;

  constructor(
    @Inject(REDIS_CONNECTION) private readonly connection: Redis,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly cryptoService: OrgSecretsCryptoService,
  ) {
    this.worker = new Worker(WEBHOOK_DELIVERIES_QUEUE_NAME, (job) => this.handle(job), { connection: this.connection });
    // BullMQ fires 'failed' after every failed attempt, including ones that will
    // still retry -- only mark the row permanently failed once attemptsMade has
    // reached the job's configured attempts ceiling (job.opts.attempts).
    this.worker.on('failed', (job) => {
      if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
        void this.markFailed((job.data as WebhookDeliveryJobData).deliveryId).catch((error) =>
          this.logger.error('Failed to mark webhook delivery as permanently failed', error as Error),
        );
      }
    });
  }

  private async handle(job: Job<WebhookDeliveryJobData>): Promise<void> {
    const { deliveryId } = job.data;
    const delivery = await this.tenantPrisma.forTenant(SUPER_ADMIN_CONTEXT, (tx) =>
      tx.webhookDelivery.findUniqueOrThrow({ where: { id: deliveryId }, include: { organization: true } }),
    );
    const { webhookUrl, webhookSecretEncrypted } = delivery.organization;
    if (!webhookUrl || !webhookSecretEncrypted) {
      throw new Error(`Organization ${delivery.organizationId} has no webhook configured`);
    }

    const secret = this.cryptoService.decrypt(webhookSecretEncrypted);
    const signature = createHmac('sha256', secret).update(delivery.payloadJson).digest('hex');

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Webhook-Signature': signature },
      body: delivery.payloadJson,
    });

    await this.tenantPrisma.forTenant(SUPER_ADMIN_CONTEXT, (tx) =>
      tx.webhookDelivery.update({
        where: { id: deliveryId },
        data: { status: response.ok ? 'delivered' : 'pending', httpStatusCode: response.status, attemptCount: { increment: 1 }, lastAttemptAt: new Date() },
      }),
    );
    if (!response.ok) {
      throw new Error(`Webhook endpoint responded with status ${response.status}`);
    }
  }

  private async markFailed(deliveryId: string): Promise<void> {
    await this.tenantPrisma.forTenant(SUPER_ADMIN_CONTEXT, (tx) =>
      tx.webhookDelivery.update({ where: { id: deliveryId }, data: { status: 'failed' } }),
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker.close();
  }
}
```

- [ ] **Step 8: Run it to verify it passes**

Run: `cd apps/api && npx jest webhook-delivery.worker.service.spec.ts`
Expected: PASS

- [ ] **Step 9: Wire both into `JobsModule`, and create `WebhooksModule`**

In `apps/api/src/jobs/jobs.module.ts`, add the imports and new providers, and export `WebhooksService` alongside the existing `JobsService`:

```typescript
import { WEBHOOK_DELIVERIES_QUEUE, createWebhookDeliveriesQueue } from './webhook-deliveries.queue';
import { WebhookDeliveryWorkerService } from './webhook-delivery.worker.service';
import { WebhooksService } from '../webhooks/webhooks.service';
```

```typescript
@Module({
  imports: [CryptoModule],
  controllers: [JobsController],
  providers: [
    { provide: REDIS_CONNECTION, useFactory: createRedisConnection },
    { provide: AI_JOBS_QUEUE, useFactory: createAiJobsQueue, inject: [REDIS_CONNECTION] },
    { provide: WEBHOOK_DELIVERIES_QUEUE, useFactory: createWebhookDeliveriesQueue, inject: [REDIS_CONNECTION] },
    EchoProcessor,
    ClaudeQuestionGenerationClient,
    AiQuestionGenerationProcessor,
    {
      provide: AI_JOB_PROCESSORS,
      useFactory: (echo: EchoProcessor, aiQuestionGeneration: AiQuestionGenerationProcessor) => [echo, aiQuestionGeneration],
      inject: [EchoProcessor, AiQuestionGenerationProcessor],
    },
    AiJobsWorkerService,
    WebhookDeliveryWorkerService,
    JobsService,
    WebhooksService,
  ],
  exports: [JobsService, WebhooksService],
})
export class JobsModule {}
```

Create `apps/api/src/webhooks/webhooks.module.ts` — a thin re-export module so other feature modules (Task 7's `InvitationsModule`, Task 8's new `InternalModule`) can import just the webhook piece without depending on the whole `JobsModule` surface:

```typescript
import { Module } from '@nestjs/common';
import { JobsModule } from '../jobs/jobs.module';
import { WebhooksService } from './webhooks.service';

@Module({
  imports: [JobsModule],
  exports: [WebhooksService],
})
export class WebhooksModule {}
```

(`WebhooksService` itself is already provided by `JobsModule` — this module exists purely to give later tasks a narrowly-named thing to import instead of reaching into `JobsModule` directly.)

- [ ] **Step 10: Run the full apps/api suite and tsc**

Run: `cd apps/api && npx jest && npx tsc --noEmit`
Expected: PASS, no new tsc errors

- [ ] **Step 11: Commit**

```bash
git add apps/api/src/jobs apps/api/src/webhooks
git commit -m "feat: webhook delivery queue, worker, and HMAC signing"
```

---

### Task 6: Webhook URL + signing secret management (org-admin)

**Files:**
- Modify: `apps/api/src/organizations/organizations.service.ts`
- Modify: `apps/api/src/organizations/organizations.controller.ts`
- Modify: `apps/api/src/organizations/organizations.service.spec.ts`
- Create: `apps/api/src/organizations/dto/update-webhook-url.dto.ts`

**Interfaces:**
- Consumes: `Organization.webhookUrl/webhookSecretEncrypted` (Task 1), `OrgSecretsCryptoService` (existing).
- Produces: `OrganizationsService.updateWebhookUrl`, `OrganizationsService.generateWebhookSecret`, `OrganizationsService.listWebhookDeliveries` — Task 9 (frontend) calls all three via new controller routes.

- [ ] **Step 1: Write the failing tests**

In `apps/api/src/organizations/organizations.service.spec.ts`, add (matching this file's existing fixture names, same as Task 2):

```typescript
  describe('updateWebhookUrl', () => {
    it('saves the URL and audits the change', async () => {
      prisma.organization.update.mockResolvedValue({ id: 'org-1' });

      const result = await service.updateWebhookUrl(context, 'user-1', { url: 'https://example.com/hook' });

      expect(result).toEqual({ webhookUrl: 'https://example.com/hook' });
      expect(prisma.organization.update).toHaveBeenCalledWith({ where: { id: 'org-1' }, data: { webhookUrl: 'https://example.com/hook' } });
      expect(audit.record).toHaveBeenCalledWith(context, expect.objectContaining({ action: 'organization.webhook_url_updated' }));
    });
  });

  describe('generateWebhookSecret', () => {
    it('encrypts and stores a new secret, returning the plaintext once', async () => {
      prisma.organization.update.mockResolvedValue({ id: 'org-1' });
      cryptoService.encrypt.mockReturnValue('encrypted-blob');

      const result = await service.generateWebhookSecret(context, 'user-1');

      expect(result.webhookSecret).toMatch(/^[0-9a-f]{64}$/);
      expect(cryptoService.encrypt).toHaveBeenCalledWith(result.webhookSecret);
      expect(prisma.organization.update).toHaveBeenCalledWith({ where: { id: 'org-1' }, data: { webhookSecretEncrypted: 'encrypted-blob' } });
      expect(audit.record).toHaveBeenCalledWith(context, expect.objectContaining({ action: 'organization.webhook_secret_generated' }));
    });
  });

  describe('listWebhookDeliveries', () => {
    it('returns the most recent 50 deliveries for the org', async () => {
      prisma.webhookDelivery.findMany.mockResolvedValue([{ id: 'delivery-1', eventType: 'invitation.created', status: 'delivered', httpStatusCode: 200, createdAt: new Date() }]);

      const result = await service.listWebhookDeliveries(context);

      expect(result).toHaveLength(1);
      expect(prisma.webhookDelivery.findMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-1' },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: { id: true, eventType: true, status: true, httpStatusCode: true, createdAt: true },
      });
    });
  });
```

(Reuse whatever `cryptoService` mock variable this file already has for `OrgSecretsCryptoService` from Task 2's/the pre-existing `updateAiKey` tests — do not introduce a second mock.)

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/api && npx jest organizations.service.spec.ts`
Expected: FAIL — `service.updateWebhookUrl is not a function`

- [ ] **Step 3: Implement the three methods**

Create `apps/api/src/organizations/dto/update-webhook-url.dto.ts`:

```typescript
import { IsUrl } from 'class-validator';

export class UpdateWebhookUrlDto {
  @IsUrl({ require_protocol: true })
  url!: string;
}
```

In `apps/api/src/organizations/organizations.service.ts`, add the import (if not already present from Task 2's `randomBytes` import):

```typescript
import { randomBytes, createHash } from 'crypto';
```

Add the three methods, following the same `requireOrganizationId` + `prisma.organization.update` + `audit.record` shape used throughout this file:

```typescript
  async updateWebhookUrl(context: TenantContext, actorUserId: string, dto: UpdateWebhookUrlDto): Promise<{ webhookUrl: string }> {
    const organizationId = this.requireOrganizationId(context);

    await this.prisma.organization.update({ where: { id: organizationId }, data: { webhookUrl: dto.url } });
    await this.audit.record(context, {
      actorUserId,
      action: 'organization.webhook_url_updated',
      entityType: 'organization',
      entityId: organizationId,
    });
    return { webhookUrl: dto.url };
  }

  async generateWebhookSecret(context: TenantContext, actorUserId: string): Promise<{ webhookSecret: string }> {
    const organizationId = this.requireOrganizationId(context);
    const webhookSecret = randomBytes(32).toString('hex');

    await this.prisma.organization.update({
      where: { id: organizationId },
      data: { webhookSecretEncrypted: this.cryptoService.encrypt(webhookSecret) },
    });
    await this.audit.record(context, {
      actorUserId,
      action: 'organization.webhook_secret_generated',
      entityType: 'organization',
      entityId: organizationId,
    });
    return { webhookSecret };
  }

  async listWebhookDeliveries(context: TenantContext): Promise<{ id: string; eventType: string; status: string; httpStatusCode: number | null; createdAt: Date }[]> {
    const organizationId = this.requireOrganizationId(context);
    return this.prisma.webhookDelivery.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, eventType: true, status: true, httpStatusCode: true, createdAt: true },
    });
  }
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd apps/api && npx jest organizations.service.spec.ts`
Expected: PASS

- [ ] **Step 5: Add the controller routes**

In `apps/api/src/organizations/organizations.controller.ts`, add the import and three routes, same `@RequirePermissions('org:manage_settings')` shape as every other route in this file:

```typescript
import { UpdateWebhookUrlDto } from './dto/update-webhook-url.dto';
```

```typescript
  @Patch('integrations/webhook')
  @RequirePermissions('org:manage_settings')
  updateWebhookUrl(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Body() dto: UpdateWebhookUrlDto) {
    return this.organizationsService.updateWebhookUrl(tenant, userId, dto);
  }

  @Post('integrations/webhook-secret')
  @RequirePermissions('org:manage_settings')
  generateWebhookSecret(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string) {
    return this.organizationsService.generateWebhookSecret(tenant, userId);
  }

  @Get('integrations/webhook-deliveries')
  @RequirePermissions('org:manage_settings')
  listWebhookDeliveries(@CurrentTenant() tenant: TenantContext) {
    return this.organizationsService.listWebhookDeliveries(tenant);
  }
```

- [ ] **Step 6: Run the full apps/api suite and tsc**

Run: `cd apps/api && npx jest && npx tsc --noEmit`
Expected: PASS, no new tsc errors

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/organizations
git commit -m "feat: org-admin webhook URL + signing secret management, delivery log endpoint"
```

---

### Task 7: `invitation.created` webhook emission

**Files:**
- Modify: `apps/api/src/invitations/invitations.service.ts`
- Modify: `apps/api/src/invitations/invitations.module.ts`
- Modify: `apps/api/src/invitations/invitations.service.spec.ts`

**Interfaces:**
- Consumes: `WebhooksService.enqueue` (Task 5).
- Produces: nothing consumed by later tasks — this is a leaf wiring task.

- [ ] **Step 1: Write the failing test**

In `apps/api/src/invitations/invitations.service.spec.ts`, find the existing test(s) covering `bulkInvite()`'s audit call (search for `'invitation.created'`) and add, alongside it, using this file's existing per-test `tx` and `webhooksService` mock conventions (add `webhooksService = { enqueue: jest.fn() };` to the `beforeEach` block and pass it into the service constructor in `Test.createTestingModule`):

```typescript
  it('enqueues an invitation.created webhook after successfully inviting candidates', async () => {
    const createTx = {
      exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1', title: 'Backend Round', status: 'published' }) },
      candidate: { findMany: jest.fn().mockResolvedValue([{ id: 'cand-1', email: 'a@test.com', name: 'Alice', erasedAt: null }]) },
      invitation: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 'inv-1', examId: 'exam-1', candidateId: 'cand-1', status: 'invited' }),
      },
    };
    const notifTx = { notification: { create: jest.fn().mockResolvedValue({ id: 'notif-1' }) } };
    tenantPrisma.forTenant
      .mockImplementationOnce((_ctx, fn) => fn(createTx))
      .mockImplementationOnce((_ctx, fn) => fn(notifTx));

    await service.bulkInvite(context, 'exam-1', ['cand-1']);

    expect(webhooksService.enqueue).toHaveBeenCalledWith(
      'org-1',
      'invitation.created',
      expect.objectContaining({ id: 'inv-1', examId: 'exam-1', candidateId: 'cand-1' }),
    );
  });

  it('does not enqueue a webhook when no invitations were actually created', async () => {
    const createTx = {
      exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1', title: 'Backend Round', status: 'published' }) },
      candidate: { findMany: jest.fn().mockResolvedValue([]) },
      invitation: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn() },
    };
    tenantPrisma.forTenant.mockImplementationOnce((_ctx, fn) => fn(createTx));

    await service.bulkInvite(context, 'exam-1', ['cand-1']);

    expect(webhooksService.enqueue).not.toHaveBeenCalled();
  });
```

(Match `context`'s `organizationId` value — `'org-1'` — to whatever this file's shared `context` fixture already uses.)

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/api && npx jest invitations.service.spec.ts`
Expected: FAIL — `webhooksService.enqueue` never called (property doesn't exist on the constructed service, or the test's constructor call fails because `WebhooksService` isn't yet an accepted DI param)

- [ ] **Step 3: Wire `WebhooksService` into `InvitationsService.bulkInvite()`**

In `apps/api/src/invitations/invitations.service.ts`, add the import:

```typescript
import { WebhooksService } from '../webhooks/webhooks.service';
```

Update the constructor:

```typescript
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly emailService: EmailService,
    private readonly audit: AuditService,
    private readonly webhooks: WebhooksService,
  ) {}
```

Immediately after the existing `audit.record({ action: 'invitation.created', ... })` call in `bulkInvite()` (inside the `if (createdWithCandidate.length > 0) { ... }` block), add one webhook-enqueue call per created invitation:

```typescript
    if (createdWithCandidate.length > 0) {
      await this.audit.record(context, {
        actorUserId: null,
        action: 'invitation.created',
        entityType: 'invitation',
        metadata: { count: createdWithCandidate.length, examTitle },
      });
      for (const { invitation } of createdWithCandidate) {
        await this.webhooks.enqueue(context.organizationId as string, 'invitation.created', {
          id: invitation.id,
          examId: invitation.examId,
          candidateId: invitation.candidateId,
          status: invitation.status,
        });
      }
    }
```

(Read the current method body first to confirm the exact shape of `createdWithCandidate` — the brief above assumes it's an array of `{ invitation, ...}` objects per the earlier-summarized `bulkInvite()` structure; adjust the destructuring to match whatever the actual variable name/shape is if it differs.)

- [ ] **Step 4: Wire `WebhooksModule` into `InvitationsModule`**

In `apps/api/src/invitations/invitations.module.ts`, add `WebhooksModule` to the `imports` array (check the current imports list first and add alongside whatever's already there).

- [ ] **Step 5: Run it to verify it passes**

Run: `cd apps/api && npx jest invitations.service.spec.ts`
Expected: PASS

- [ ] **Step 6: Run the full apps/api suite and tsc**

Run: `cd apps/api && npx jest && npx tsc --noEmit`
Expected: PASS, no new tsc errors

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/invitations
git commit -m "feat: enqueue invitation.created webhooks on successful invite"
```

---

### Task 8: `attempt.settled` webhook emission (cross-service)

**Files:**
- Create: `apps/api/src/internal/internal-auth.guard.ts`
- Create: `apps/api/src/internal/dto/dispatch-webhook.dto.ts`
- Create: `apps/api/src/internal/internal.controller.ts`
- Create: `apps/api/src/internal/internal.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Create: `apps/exam-runtime/src/api-internal-client/api-internal.client.ts`
- Create: `apps/exam-runtime/src/api-internal-client/api-internal-client.module.ts`
- Modify: `apps/exam-runtime/src/grading/attempt-settlement.service.ts`
- Modify: `apps/exam-runtime/src/grading/grading.module.ts`
- Test: `apps/api/src/internal/internal-auth.guard.spec.ts`
- Test: `apps/api/src/internal/internal.controller.spec.ts`
- Test: `apps/exam-runtime/src/grading/attempt-settlement.service.spec.ts`

**Interfaces:**
- Consumes: `WebhooksService.enqueue` (Task 5, via the new internal controller). `INTERNAL_SERVICE_SECRET` env var (existing, already shared between apps/api and apps/exam-runtime).
- Produces: `POST /api/v1/internal/webhooks/dispatch` on apps/api. New `API_INTERNAL_URL` env var (apps/exam-runtime → apps/api base URL) — add to `.env.example` in this task.

This is the first case of apps/api being the *callee* of an internal route rather than the caller — `InternalAuthGuard` here is a deliberate duplicate of exam-runtime's existing one (`apps/exam-runtime/src/internal/internal-auth.guard.ts`), not a shared import, matching the precedent that this codebase already keeps that guard local to each service rather than sharing it from `packages/shared`.

- [ ] **Step 1: Write the failing test for apps/api's `InternalAuthGuard`**

Create `apps/api/src/internal/internal-auth.guard.spec.ts` — this is a verbatim copy of exam-runtime's existing `internal-auth.guard.spec.ts` test file (read it first at `apps/exam-runtime/src/internal/internal-auth.guard.spec.ts` if it exists, and copy its test cases exactly, just importing from `./internal-auth.guard` in this new location). If no spec file exists for exam-runtime's guard, write these tests:

```typescript
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { InternalAuthGuard } from './internal-auth.guard';

describe('InternalAuthGuard', () => {
  const guard = new InternalAuthGuard();
  const originalSecret = process.env.INTERNAL_SERVICE_SECRET;

  beforeEach(() => {
    process.env.INTERNAL_SERVICE_SECRET = 'test-secret-value';
  });

  afterEach(() => {
    process.env.INTERNAL_SERVICE_SECRET = originalSecret;
  });

  function contextWithHeader(secret: string | undefined): ExecutionContext {
    const request = { headers: secret !== undefined ? { 'x-internal-secret': secret } : {} };
    return { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
  }

  it('allows the request when the header matches the expected secret', () => {
    expect(guard.canActivate(contextWithHeader('test-secret-value'))).toBe(true);
  });

  it('throws UnauthorizedException when the header is missing', () => {
    expect(() => guard.canActivate(contextWithHeader(undefined))).toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException when the header does not match', () => {
    expect(() => guard.canActivate(contextWithHeader('wrong-secret'))).toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException when INTERNAL_SERVICE_SECRET is not configured', () => {
    delete process.env.INTERNAL_SERVICE_SECRET;
    expect(() => guard.canActivate(contextWithHeader('anything'))).toThrow(UnauthorizedException);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/api && npx jest internal-auth.guard.spec.ts`
Expected: FAIL — cannot find module `./internal-auth.guard`

- [ ] **Step 3: Implement apps/api's `InternalAuthGuard`**

Create `apps/api/src/internal/internal-auth.guard.ts` — exact copy of exam-runtime's:

```typescript
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'crypto';

function secretsMatch(provided: string, expected: string): boolean {
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }
  return timingSafeEqual(providedBuffer, expectedBuffer);
}

@Injectable()
export class InternalAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const providedSecret = request.headers['x-internal-secret'];
    const expectedSecret = process.env.INTERNAL_SERVICE_SECRET;
    if (!expectedSecret || typeof providedSecret !== 'string' || !secretsMatch(providedSecret, expectedSecret)) {
      throw new UnauthorizedException('Invalid internal service credentials');
    }
    return true;
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd apps/api && npx jest internal-auth.guard.spec.ts`
Expected: PASS

- [ ] **Step 5: Write the failing test for the internal dispatch controller**

Create `apps/api/src/internal/internal.controller.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { InternalController } from './internal.controller';
import { WebhooksService } from '../webhooks/webhooks.service';

describe('InternalController', () => {
  let controller: InternalController;
  let webhooksService: { enqueue: jest.Mock };

  beforeEach(async () => {
    webhooksService = { enqueue: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      controllers: [InternalController],
      providers: [{ provide: WebhooksService, useValue: webhooksService }],
    }).compile();
    controller = moduleRef.get(InternalController);
  });

  it('delegates to WebhooksService.enqueue with the request body fields', async () => {
    await controller.dispatch({ organizationId: 'org-1', eventType: 'attempt.settled', data: { attemptId: 'attempt-1' } });

    expect(webhooksService.enqueue).toHaveBeenCalledWith('org-1', 'attempt.settled', { attemptId: 'attempt-1' });
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `cd apps/api && npx jest internal.controller.spec.ts`
Expected: FAIL — cannot find module `./internal.controller`

- [ ] **Step 7: Implement the DTO, controller, and module**

Create `apps/api/src/internal/dto/dispatch-webhook.dto.ts`:

```typescript
import { IsIn, IsNotEmpty, IsObject, IsString } from 'class-validator';

export class DispatchWebhookDto {
  @IsString()
  @IsNotEmpty()
  organizationId!: string;

  @IsIn(['attempt.settled'])
  eventType!: string;

  @IsObject()
  data!: Record<string, unknown>;
}
```

Create `apps/api/src/internal/internal.controller.ts`:

```typescript
import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { InternalAuthGuard } from './internal-auth.guard';
import { WebhooksService } from '../webhooks/webhooks.service';
import { DispatchWebhookDto } from './dto/dispatch-webhook.dto';

@Controller('internal/webhooks')
@UseGuards(InternalAuthGuard)
export class InternalController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Post('dispatch')
  @HttpCode(204)
  async dispatch(@Body() dto: DispatchWebhookDto): Promise<void> {
    await this.webhooksService.enqueue(dto.organizationId, dto.eventType, dto.data);
  }
}
```

Create `apps/api/src/internal/internal.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { InternalController } from './internal.controller';

@Module({
  imports: [WebhooksModule],
  controllers: [InternalController],
})
export class InternalModule {}
```

Register `InternalModule` in `apps/api/src/app.module.ts`'s `imports` array.

- [ ] **Step 8: Run it to verify it passes**

Run: `cd apps/api && npx jest internal.controller.spec.ts`
Expected: PASS

- [ ] **Step 9: Build the exam-runtime → apps/api client**

Create `apps/exam-runtime/src/api-internal-client/api-internal.client.ts` — mirrors `apps/api/src/exam-runtime-client/exam-runtime-internal.client.ts`'s `fetchWithTimeout`/env-var/header pattern exactly, but swallows its own errors (this call is always used fire-and-forget, so it must never throw into its caller):

```typescript
import { Injectable, Logger } from '@nestjs/common';

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 5000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

@Injectable()
export class ApiInternalClient {
  private readonly logger = new Logger(ApiInternalClient.name);

  private baseUrl(): string {
    return process.env.API_INTERNAL_URL as string;
  }

  private headers(): Record<string, string> {
    return { 'Content-Type': 'application/json', 'x-internal-secret': process.env.INTERNAL_SERVICE_SECRET as string };
  }

  async dispatchWebhook(organizationId: string, eventType: string, data: Record<string, unknown>): Promise<void> {
    try {
      const response = await fetchWithTimeout(`${this.baseUrl()}/internal/webhooks/dispatch`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ organizationId, eventType, data }),
      });
      if (!response.ok) {
        this.logger.warn(`Webhook dispatch call to apps/api returned status ${response.status}`);
      }
    } catch (error) {
      this.logger.warn(`Webhook dispatch call to apps/api failed: ${(error as Error).message}`);
    }
  }
}
```

Create `apps/exam-runtime/src/api-internal-client/api-internal-client.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { ApiInternalClient } from './api-internal.client';

@Module({
  providers: [ApiInternalClient],
  exports: [ApiInternalClient],
})
export class ApiInternalClientModule {}
```

- [ ] **Step 10: Write the failing test for `AttemptSettlementService.finalize()`'s new webhook dispatch**

In `apps/exam-runtime/src/grading/attempt-settlement.service.spec.ts`, find the existing test(s) covering `finalize()` and the fire-and-forget analysis block, and add (matching this file's existing `apiInternalClient` mock naming convention if you add it to `beforeEach` — add `apiInternalClient = { dispatchWebhook: jest.fn() };` and pass it into the service constructor):

```typescript
  it('calls ApiInternalClient.dispatchWebhook with the settled attempt summary', async () => {
    // ... reuse this file's existing finalize() test setup (tx, exam, attempt, mocked
    // question/answer data) up through calling `await service.finalize(tx, exam, attempt, 'submitted')` ...
    await new Promise((resolve) => setImmediate(resolve)); // let the fire-and-forget block run

    expect(apiInternalClient.dispatchWebhook).toHaveBeenCalledWith(
      exam.organizationId,
      'attempt.settled',
      expect.objectContaining({ attemptId: expect.any(String), examId: attempt.examId, candidateId: attempt.candidateId }),
    );
  });
```

(This test necessarily reuses the bulk of an existing `finalize()` test's setup — read the current file first to find the closest existing test to extend rather than rebuilding the whole fixture from scratch; the exact mocked `tx`/`exam`/`attempt`/`question`/`answer` shapes are already established elsewhere in this file.)

- [ ] **Step 11: Run it to verify it fails**

Run: `cd apps/exam-runtime && npx jest attempt-settlement.service.spec.ts`
Expected: FAIL — `apiInternalClient.dispatchWebhook` never called (constructor doesn't yet accept it)

- [ ] **Step 12: Wire `ApiInternalClient` into `AttemptSettlementService.finalize()`**

In `apps/exam-runtime/src/grading/attempt-settlement.service.ts`, add the import:

```typescript
import { ApiInternalClient } from '../api-internal-client/api-internal.client';
```

Update the constructor:

```typescript
  constructor(
    @Inject(ATTEMPT_STATUS_BROADCASTER) private readonly broadcaster: AttemptStatusBroadcaster,
    private readonly attemptAnalysis: AttemptAnalysisService,
    private readonly attemptInsight: AttemptInsightService,
    private readonly integrityAnalysis: IntegrityAnalysisService,
    private readonly apiInternalClient: ApiInternalClient,
  ) {}
```

In `finalize()`, add a new `try/catch` to the existing fire-and-forget `void (async () => { ... })()` block, in the same style as the `attemptAnalysis`/`integrityAnalysis`/`attemptInsight` calls already there:

```typescript
    void (async () => {
      try {
        await this.attemptAnalysis.analyze(finalized.id);
      } catch (error) {
        this.logger.error('Proctoring analysis failed to start', error as Error);
      }
      try {
        await this.integrityAnalysis.analyze(finalized.id);
      } catch (error) {
        this.logger.error('Integrity analysis failed to start', error as Error);
      }
      if (!hasCodeQuestions) {
        try {
          await this.attemptInsight.analyze(finalized.id);
        } catch (error) {
          this.logger.error('Insight generation failed to start', error as Error);
        }
      }
      try {
        await this.apiInternalClient.dispatchWebhook(exam.organizationId, 'attempt.settled', {
          attemptId: finalized.id,
          examId: finalized.examId,
          candidateId: finalized.candidateId,
          status: finalized.status,
          score: summary.score,
          maxScore: summary.maxScore,
          percentage: summary.percentage,
          passFail: summary.passFail,
        });
      } catch (error) {
        this.logger.error('Webhook dispatch failed to start', error as Error);
      }
    })();
```

(`ApiInternalClient.dispatchWebhook` already swallows its own errors internally per Step 9 — this outer `try/catch` is defense-in-depth matching the existing style of every sibling call in this block, not strictly load-bearing, but keeps the block visually consistent and safe against any future change to that assumption.)

- [ ] **Step 13: Wire `ApiInternalClientModule` into `GradingModule`**

In `apps/exam-runtime/src/grading/grading.module.ts`, add `ApiInternalClientModule` to the `imports` array (check the current imports list first).

- [ ] **Step 14: Run it to verify it passes**

Run: `cd apps/exam-runtime && npx jest attempt-settlement.service.spec.ts`
Expected: PASS

- [ ] **Step 15: Add the new env var**

In `.env.example` at the repo root, add a new line near the existing `EXAM_RUNTIME_INTERNAL_URL`/`INTERNAL_SERVICE_SECRET` entries:

```
API_INTERNAL_URL=http://localhost:3501/api/v1
```

- [ ] **Step 16: Run both full suites and tsc**

Run: `cd apps/api && npx jest && npx tsc --noEmit`
Run: `cd apps/exam-runtime && npx jest --testPathIgnorePatterns=test/ && npx tsc --noEmit`
Expected: PASS on both, no new tsc errors

- [ ] **Step 17: Commit**

```bash
git add apps/api/src/internal apps/api/src/app.module.ts apps/exam-runtime/src/api-internal-client apps/exam-runtime/src/grading/attempt-settlement.service.ts apps/exam-runtime/src/grading/attempt-settlement.service.spec.ts apps/exam-runtime/src/grading/grading.module.ts .env.example
git commit -m "feat: dispatch attempt.settled webhooks from exam-runtime via a new internal endpoint"
```

---

### Task 9: Org-admin UI — Public API + Webhooks section

**Files:**
- Modify: `apps/web/lib/hooks/useIntegrations.ts`
- Modify: `apps/web/lib/types.ts` (`IntegrationsResponse`)
- Modify: `apps/web/app/(org-admin)/settings/integrations/page.tsx`
- Modify: `apps/web/app/(org-admin)/settings/integrations/page.test.tsx`

**Interfaces:**
- Consumes: the six new org-admin endpoints from Tasks 2 and 6 (`POST/DELETE integrations/api-key`, `PATCH integrations/webhook`, `POST integrations/webhook-secret`, `GET integrations/webhook-deliveries`), plus `getIntegrations`'s extended return shape (Task 2 Step 3).
- Produces: nothing consumed by later tasks — this is a leaf UI task.

There is no existing one-time-reveal-secret component in this codebase to reuse — the SMTP/AI-key fields are pure write-only inputs that clear on save. This task builds that UI pattern from scratch, using the existing `Input`/`Button`/`Card`/`useToast` primitives.

- [ ] **Step 1: Extend `IntegrationsResponse` and add the new hooks**

In `apps/web/lib/types.ts`, extend the existing `IntegrationsResponse` interface:

```typescript
export interface IntegrationsResponse {
  smtpConfigured: boolean;
  aiKeyConfigured: boolean;
  smtpHost: string | null;
  smtpPort: number | null;
  emailFromAddress: string | null;
  apiKeyConfigured: boolean;
  apiKeyPrefix: string | null;
  apiKeyCreatedAt: string | null;
  webhookConfigured: boolean;
  webhookUrl: string | null;
}

export interface WebhookDeliveryRow {
  id: string;
  eventType: string;
  status: string;
  httpStatusCode: number | null;
  createdAt: string;
}
```

In `apps/web/lib/hooks/useIntegrations.ts`, add the new mutations/query, following this file's exact existing `useMutation`/`useQuery` + `apiFetch` + `queryClient.invalidateQueries({ queryKey: ['integrations'] })` shape:

```typescript
export function useGenerateApiKey() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (): Promise<{ apiKey: string; apiKeyPrefix: string }> =>
      apiFetch('/organizations/integrations/api-key', { method: 'POST' }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['integrations'] }),
  });
}

export function useRevokeApiKey() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (): Promise<{ apiKeyConfigured: boolean }> =>
      apiFetch('/organizations/integrations/api-key', { method: 'DELETE' }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['integrations'] }),
  });
}

export function useUpdateWebhookUrl() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (url: string): Promise<{ webhookUrl: string }> =>
      apiFetch('/organizations/integrations/webhook', { method: 'PATCH', body: JSON.stringify({ url }) }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['integrations'] }),
  });
}

export function useGenerateWebhookSecret() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (): Promise<{ webhookSecret: string }> =>
      apiFetch('/organizations/integrations/webhook-secret', { method: 'POST' }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['integrations'] }),
  });
}

export function useWebhookDeliveries() {
  const { accessToken } = useAuth();
  return useQuery<WebhookDeliveryRow[]>({
    queryKey: ['webhook-deliveries'],
    queryFn: () => apiFetch('/organizations/integrations/webhook-deliveries', {}, accessToken ?? undefined),
  });
}
```

(Import `WebhookDeliveryRow` from `../types` alongside whatever this file already imports from there.)

- [ ] **Step 2: Write the failing test for the new UI section**

In `apps/web/app/(org-admin)/settings/integrations/page.test.tsx`, add tests following this file's existing render/mock conventions (check the top of the file for how `useIntegrations` is currently mocked and match that exactly):

```typescript
  it('shows "No API key generated" when none exists, and a Generate button', () => {
    (useIntegrations as jest.Mock).mockReturnValue({
      data: { smtpConfigured: false, aiKeyConfigured: false, smtpHost: null, smtpPort: null, emailFromAddress: null, apiKeyConfigured: false, apiKeyPrefix: null, apiKeyCreatedAt: null, webhookConfigured: false, webhookUrl: null },
      isLoading: false,
    });
    (useGenerateApiKey as jest.Mock).mockReturnValue({ mutate: jest.fn(), isPending: false });
    (useRevokeApiKey as jest.Mock).mockReturnValue({ mutate: jest.fn(), isPending: false });
    (useUpdateWebhookUrl as jest.Mock).mockReturnValue({ mutate: jest.fn(), isPending: false });
    (useGenerateWebhookSecret as jest.Mock).mockReturnValue({ mutate: jest.fn(), isPending: false });
    (useWebhookDeliveries as jest.Mock).mockReturnValue({ data: [], isLoading: false });

    render(<IntegrationsPage />);

    expect(screen.getByText('No API key generated')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Generate' })).toBeInTheDocument();
  });

  it('reveals the full API key once, immediately after generating', async () => {
    const mutate = jest.fn((_vars, options) => options.onSuccess({ apiKey: 'pk_live_abcdef', apiKeyPrefix: 'pk_live_abcd' }));
    (useIntegrations as jest.Mock).mockReturnValue({
      data: { smtpConfigured: false, aiKeyConfigured: false, smtpHost: null, smtpPort: null, emailFromAddress: null, apiKeyConfigured: false, apiKeyPrefix: null, apiKeyCreatedAt: null, webhookConfigured: false, webhookUrl: null },
      isLoading: false,
    });
    (useGenerateApiKey as jest.Mock).mockReturnValue({ mutate, isPending: false });
    (useRevokeApiKey as jest.Mock).mockReturnValue({ mutate: jest.fn(), isPending: false });
    (useUpdateWebhookUrl as jest.Mock).mockReturnValue({ mutate: jest.fn(), isPending: false });
    (useGenerateWebhookSecret as jest.Mock).mockReturnValue({ mutate: jest.fn(), isPending: false });
    (useWebhookDeliveries as jest.Mock).mockReturnValue({ data: [], isLoading: false });

    render(<IntegrationsPage />);
    await userEvent.click(screen.getByRole('button', { name: 'Generate' }));

    expect(screen.getByText('pk_live_abcdef')).toBeInTheDocument();
    expect(screen.getByText(/won't be shown again/i)).toBeInTheDocument();
  });

  it('shows the delivery log with event type, status, and HTTP code', () => {
    (useIntegrations as jest.Mock).mockReturnValue({
      data: { smtpConfigured: false, aiKeyConfigured: false, smtpHost: null, smtpPort: null, emailFromAddress: null, apiKeyConfigured: true, apiKeyPrefix: 'pk_live_abcd', apiKeyCreatedAt: '2026-07-19T00:00:00.000Z', webhookConfigured: true, webhookUrl: 'https://example.com/hook' },
      isLoading: false,
    });
    (useGenerateApiKey as jest.Mock).mockReturnValue({ mutate: jest.fn(), isPending: false });
    (useRevokeApiKey as jest.Mock).mockReturnValue({ mutate: jest.fn(), isPending: false });
    (useUpdateWebhookUrl as jest.Mock).mockReturnValue({ mutate: jest.fn(), isPending: false });
    (useGenerateWebhookSecret as jest.Mock).mockReturnValue({ mutate: jest.fn(), isPending: false });
    (useWebhookDeliveries as jest.Mock).mockReturnValue({
      data: [{ id: 'delivery-1', eventType: 'invitation.created', status: 'delivered', httpStatusCode: 200, createdAt: '2026-07-19T00:00:00.000Z' }],
      isLoading: false,
    });

    render(<IntegrationsPage />);

    expect(screen.getByText('invitation.created')).toBeInTheDocument();
    expect(screen.getByText('delivered')).toBeInTheDocument();
    expect(screen.getByText('200')).toBeInTheDocument();
  });
```

Add the corresponding `jest.mock('../../../../lib/hooks/useIntegrations', ...)` entries for the five new hooks to this file's existing mock block (check the current relative import depth used by the existing `jest.mock` call and match it).

- [ ] **Step 3: Run it to verify it fails**

Run: `cd apps/web && npx jest integrations/page.test.tsx`
Expected: FAIL — new hooks not mocked/rendered yet, "No API key generated" text not found

- [ ] **Step 4: Implement the UI section**

Read `apps/web/app/(org-admin)/settings/integrations/page.tsx` in full first to see its exact current structure (how the SMTP/AI-key cards are laid out) and add a new section following the same visual pattern, using local `useState` for the one-time-reveal values:

```tsx
  const [revealedApiKey, setRevealedApiKey] = useState<string | null>(null);
  const [revealedWebhookSecret, setRevealedWebhookSecret] = useState<string | null>(null);
  const [webhookUrlInput, setWebhookUrlInput] = useState(integrations?.webhookUrl ?? '');

  const generateApiKey = useGenerateApiKey();
  const revokeApiKey = useRevokeApiKey();
  const updateWebhookUrl = useUpdateWebhookUrl();
  const generateWebhookSecret = useGenerateWebhookSecret();
  const { data: deliveries } = useWebhookDeliveries();
```

```tsx
      <Card>
        <h2 className="mb-2 text-lg font-semibold">Public API</h2>
        {integrations?.apiKeyConfigured ? (
          <p className="text-sm text-gray-600">Active key: {integrations.apiKeyPrefix}&hellip; (created {new Date(integrations.apiKeyCreatedAt as string).toLocaleDateString()})</p>
        ) : (
          <p className="text-sm text-gray-600">No API key generated</p>
        )}
        {revealedApiKey ? (
          <div className="mt-2 rounded border border-yellow-300 bg-yellow-50 p-3">
            <p className="mb-1 font-mono text-sm">{revealedApiKey}</p>
            <p className="text-xs text-yellow-800">Copy this now &mdash; it won&apos;t be shown again.</p>
          </div>
        ) : null}
        <div className="mt-3 flex gap-2">
          <Button
            disabled={generateApiKey.isPending}
            onClick={() =>
              generateApiKey.mutate(undefined, {
                onSuccess: (result: { apiKey: string; apiKeyPrefix: string }) => setRevealedApiKey(result.apiKey),
              })
            }
          >
            {integrations?.apiKeyConfigured ? 'Regenerate' : 'Generate'}
          </Button>
          {integrations?.apiKeyConfigured ? (
            <Button variant="secondary" disabled={revokeApiKey.isPending} onClick={() => revokeApiKey.mutate(undefined, { onSuccess: () => setRevealedApiKey(null) })}>
              Revoke
            </Button>
          ) : null}
        </div>
      </Card>

      <Card>
        <h2 className="mb-2 text-lg font-semibold">Webhooks</h2>
        <Input label="Webhook URL" value={webhookUrlInput} onChange={setWebhookUrlInput} placeholder="https://your-ats.example.com/webhooks/exam-platform" />
        <Button className="mt-2" disabled={updateWebhookUrl.isPending} onClick={() => updateWebhookUrl.mutate(webhookUrlInput)}>
          Save URL
        </Button>
        {revealedWebhookSecret ? (
          <div className="mt-2 rounded border border-yellow-300 bg-yellow-50 p-3">
            <p className="mb-1 font-mono text-sm">{revealedWebhookSecret}</p>
            <p className="text-xs text-yellow-800">Copy this now &mdash; it won&apos;t be shown again.</p>
          </div>
        ) : null}
        <Button
          className="mt-3"
          disabled={generateWebhookSecret.isPending}
          onClick={() =>
            generateWebhookSecret.mutate(undefined, {
              onSuccess: (result: { webhookSecret: string }) => setRevealedWebhookSecret(result.webhookSecret),
            })
          }
        >
          {integrations?.webhookConfigured ? 'Regenerate signing secret' : 'Generate signing secret'}
        </Button>

        <h3 className="mb-1 mt-4 text-sm font-semibold">Recent deliveries</h3>
        {deliveries && deliveries.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="pr-3">Event</th>
                <th className="pr-3">Status</th>
                <th className="pr-3">HTTP</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {deliveries.map((delivery) => (
                <tr key={delivery.id}>
                  <td className="pr-3">{delivery.eventType}</td>
                  <td className="pr-3">{delivery.status}</td>
                  <td className="pr-3">{delivery.httpStatusCode ?? '—'}</td>
                  <td>{new Date(delivery.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-gray-500">No deliveries yet.</p>
        )}
      </Card>
```

Add the corresponding imports (`useState` from `react` if not already imported; the five new hooks from `../../../../lib/hooks/useIntegrations`).

- [ ] **Step 5: Run it to verify it passes**

Run: `cd apps/web && npx jest integrations/page.test.tsx`
Expected: PASS

- [ ] **Step 6: Run the full web suite and tsc**

Run: `cd apps/web && npx jest && npx tsc --noEmit`
Expected: PASS; `tsc` shows only the pre-existing baseline error count (confirm it hasn't grown — check against whatever count Task 10 confirms as current baseline)

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/hooks/useIntegrations.ts apps/web/lib/types.ts apps/web/app/\(org-admin\)/settings/integrations
git commit -m "feat: org-admin UI for API key and webhook management"
```

---

### Task 9.5: `getIntegrations` frontend consumer sanity check

(Not a separate numbered task — fold into Task 9's review: confirm the extended `IntegrationsResponse` fields from Task 2 Step 3 actually reach the frontend unchanged, i.e. that `useIntegrations()`'s existing query — `GET /organizations/integrations` — doesn't need any change beyond the type, since the backend method already returns the new fields in the same response object.)

---

### Task 10: API reference docs + E2E + final verification

**Files:**
- Create: `docs/public-api.md`
- Create: `apps/api/test/public-api.e2e-spec.ts`
- Modify: `apps/api/test/invitations.e2e-spec.ts` (if it exists — add coverage for the webhook-enqueue side effect) or note as a gap if e2e webhook delivery can't be asserted without a live BullMQ worker in the e2e environment (check how `apps/api/test/*.e2e-spec.ts` currently handles/mocks BullMQ, if at all, before assuming a live worker runs during e2e)

**Interfaces:**
- Consumes: every prior task in this plan.

- [ ] **Step 1: Write `docs/public-api.md`**

Create `docs/public-api.md` covering, in order: authentication (how to generate a key in org-admin, the `Authorization: Bearer pk_live_...` header, what a 401 means), each of the five `GET /public/*` endpoints (method, path, query params, one example request/response each), the pagination envelope, the 60 req/min rate limit and 429/`Retry-After` behavior, and webhooks (how to configure a URL + secret in org-admin, the payload envelope for both event types with a real example body each, and a worked Node.js signature-verification snippet):

```markdown
# Public API Reference

Base URL: `https://<your-domain>/api/v1/public`

## Authentication

Generate an API key from your org-admin console under Settings → Integrations → Public API. The full key is shown exactly once, at generation time — copy it immediately, it cannot be retrieved again. Regenerating a key immediately invalidates the previous one.

Send it as a bearer token on every request:

```
Authorization: Bearer pk_live_<your key>
```

A missing, malformed, or revoked key returns `401 Unauthorized`.

## Rate limits

60 requests/minute per API key. Exceeding it returns `429 Too Many Requests` with a `Retry-After` header (seconds until you can retry).

## Pagination

Every list endpoint accepts `page` (default `1`) and `pageSize` (default `50`, max `200`) query parameters, and returns:

```json
{ "data": [...], "page": 1, "pageSize": 50, "total": 137 }
```

## Endpoints

### `GET /candidates`

Query params: `page`, `pageSize`.

```json
{
  "data": [{ "id": "c1", "name": "Alice Example", "email": "alice@example.com", "createdAt": "2026-07-19T10:00:00.000Z" }],
  "page": 1, "pageSize": 50, "total": 1
}
```

### `GET /candidates/:id`

```json
{ "id": "c1", "name": "Alice Example", "email": "alice@example.com", "createdAt": "2026-07-19T10:00:00.000Z" }
```

`404` if the candidate doesn't exist or doesn't belong to your organization.

### `GET /exams`

Query params: `page`, `pageSize`. Returns exam metadata only — no question or option content.

```json
{
  "data": [{ "id": "e1", "title": "Backend Screening", "status": "published", "durationMinutes": 60, "passCriteriaPercent": 40, "createdAt": "2026-07-19T10:00:00.000Z" }],
  "page": 1, "pageSize": 50, "total": 1
}
```

### `GET /exams/:id`

Same shape as one item above. `404` if not found or not yours.

### `GET /invitations`

Query params: `page`, `pageSize`, `examId` (optional), `candidateId` (optional), `status` (optional — `invited` or `revoked`).

```json
{
  "data": [{ "id": "i1", "examId": "e1", "candidateId": "c1", "status": "invited", "invitedAt": "2026-07-19T10:00:00.000Z", "expiresAt": "2026-07-26T10:00:00.000Z" }],
  "page": 1, "pageSize": 50, "total": 1
}
```

### `GET /exams/:id/results`

Query params: `page`, `pageSize`. Results only appear here once an attempt has fully settled.

```json
{
  "data": [{ "candidateId": "c1", "candidateName": "Alice Example", "status": "submitted", "score": 8, "maxScore": 10, "percentage": 80, "passFail": "pass", "submittedAt": "2026-07-19T11:00:00.000Z" }],
  "page": 1, "pageSize": 50, "total": 1
}
```

## Webhooks

Configure a webhook URL and generate a signing secret from org-admin under Settings → Integrations → Webhooks. The secret is shown exactly once, at generation time.

### Event types

- `invitation.created` — fires when a candidate is successfully invited to an exam.
- `attempt.settled` — fires when a candidate's attempt is fully graded and the result is final.

### Payload envelope

```json
{
  "id": "<delivery id>",
  "type": "attempt.settled",
  "createdAt": "2026-07-19T11:00:00.000Z",
  "data": {
    "attemptId": "a1", "examId": "e1", "candidateId": "c1", "status": "submitted",
    "score": 8, "maxScore": 10, "percentage": 80, "passFail": "pass"
  }
}
```

```json
{
  "id": "<delivery id>",
  "type": "invitation.created",
  "createdAt": "2026-07-19T10:00:00.000Z",
  "data": { "id": "i1", "examId": "e1", "candidateId": "c1", "status": "invited" }
}
```

### Verifying the signature

Every delivery includes an `X-Webhook-Signature` header: the hex-encoded HMAC-SHA256 of the **raw request body**, computed with your webhook secret. Verify it before trusting the payload:

```js
const crypto = require('crypto');

function isValidSignature(rawBody, signatureHeader, webhookSecret) {
  const expected = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected));
}
```

Use the **raw, unparsed** request body — computing the signature over a re-serialized JSON object will not match if key order or whitespace differs from what was actually sent.

### Delivery and retries

A delivery is retried up to 3 times with exponential backoff if your endpoint doesn't respond with a 2xx status. After the final failed attempt, no further retries occur — check the delivery log in org-admin (Settings → Integrations → Webhooks) to see recent delivery status and HTTP response codes.
```

- [ ] **Step 2: Write the e2e spec**

Read an existing `apps/api/test/*.e2e-spec.ts` file first (e.g. `invitations.e2e-spec.ts`) to match its exact login/setup boilerplate, then create `apps/api/test/public-api.e2e-spec.ts` following that same structure: log in as a recruiter, create a candidate + exam + invitation via the normal staff-facing endpoints, generate an API key via `POST /organizations/integrations/api-key`, then call each public endpoint with `Authorization: Bearer <key>` and assert correctly-scoped 200 responses, plus one 401 test with no key and one with a garbage key. Do not invent the login/app-setup boilerplate — copy it verbatim from whichever existing e2e spec file has it, adjusting only the request bodies/assertions to this feature's endpoints.

- [ ] **Step 3: Run the new e2e spec**

Run: `cd apps/api && npx jest --config test/jest-e2e.json public-api.e2e-spec.ts` (or whatever exact e2e run command the existing `test:api:e2e` package.json script uses — check `package.json` first)
Expected: PASS (requires a live dev database, matching every other e2e spec's preconditions)

- [ ] **Step 4: Run every full test suite touched by this plan**

Run: `cd apps/api && npx jest && npx tsc --noEmit`
Run: `cd apps/exam-runtime && npx jest --testPathIgnorePatterns=test/ && npx tsc --noEmit`
Run: `cd apps/web && npx jest && npx tsc --noEmit`
Expected: all green; `apps/web`'s `tsc` shows only the established pre-existing baseline count (confirm the exact number by running it before this feature's first commit if not already known, and treat any growth as a regression to fix)

- [ ] **Step 5: Live-verify in a browser**

Using the dev stack (`apps/api`, `apps/exam-runtime`, `apps/web` all running): as an org-admin, generate an API key and a webhook secret from the Integrations page, confirm both are shown exactly once and the page reflects "configured" state after. Using `curl` or a REST client, call `GET /api/v1/public/candidates` with the generated key and confirm a 200 with real data; call it with no key and confirm 401. As a recruiter, invite a candidate to a published exam and confirm a `WebhookDelivery` row appears (query the DB or check the delivery log in org-admin) — if a real receiving endpoint isn't available, point the webhook URL at a temporary request-catching service (e.g. a local `nc -l` listener or a webhook-testing site) to confirm the signature header and payload shape match `docs/public-api.md`'s documented examples exactly.

- [ ] **Step 6: Commit**

```bash
git add docs/public-api.md apps/api/test/public-api.e2e-spec.ts
git commit -m "docs: public API reference; test: e2e coverage for Public API + Webhooks"
```
