# Super Admin Creation & Promotion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an existing `super_admin` invite a brand-new `super_admin` by email, or promote an existing staff user to `super_admin`, closing the standing gap where `super_admin` accounts can only be created via `apps/api/prisma/seed.ts`.

**Architecture:** Two new `UsersService` methods reuse the existing welcome-email + `PasswordResetToken` pattern (invite) and a direct role/org update (promote), both gated by the existing `platform:manage_organizations` permission. One new frontend page under `(platform)/` with a nav link, plus matching hooks.

**Tech Stack:** NestJS (`@nestjs/common`, `class-validator`, `argon2`), Prisma (SQL Server, RLS via `TenantPrismaService`), Next.js App Router, React Query, existing design-system primitives (`Input`/`Button`/`Table`/`Card`/`Modal`/`useToast`).

## Global Constraints

- Both new endpoints are gated by the existing `platform:manage_organizations` permission (spec: "no new permission needed" — only `super_admin` holds it, per `apps/api/prisma/seed.ts`'s `ROLE_PERMISSIONS`).
- Reuse the existing `PasswordResetToken` model and 15-minute `PASSWORD_RESET_EXPIRY_MINUTES` policy verbatim for the invite flow — no new token type.
- Promotion does **not** touch `passwordHash` — the promoted user keeps their existing password.
- No demote/remove capability, no cross-org user browsing/search (promote is by exact email only) — both explicitly out of scope per the spec.
- Every write records an audit event via the existing `AuditService.record(context, {...})` pattern.
- Frontend confirm dialogs are required before either mutation fires, given the stakes (spec: "Grant super_admin access... This cannot be undone from this screen").

---

## File Structure

- `apps/api/src/users/dto/super-admin-email.dto.ts` (new) — one shared DTO (`{ email }`) for both invite and promote request bodies; their validation shape is identical, so one file avoids a duplicate near-empty DTO.
- `apps/api/src/users/users.service.ts` (modify) — add `listSuperAdmins`, `inviteSuperAdmin`, `promoteSuperAdmin`.
- `apps/api/src/users/users.controller.ts` (modify) — add `GET /users/super-admins`, `POST /users/super-admins/invite`, `POST /users/super-admins/promote`.
- `apps/api/src/users/users.module.ts` (modify) — import `EmailModule` (new dependency for the invite/promotion emails).
- `apps/api/src/users/users.service.spec.ts` (modify) — unit tests for the three new service methods.
- `apps/api/test/auth-flow.e2e-spec.ts` — read-only check in Task 2 (confirm the new routes don't collide with anything this suite already exercises; no changes expected).
- `apps/web/lib/types.ts` (modify) — add `SuperAdminSummary` interface.
- `apps/web/lib/hooks/useSuperAdmins.ts` (new) — `useSuperAdmins()`, `useInviteSuperAdmin()`, `usePromoteSuperAdmin()`.
- `apps/web/app/(platform)/layout.tsx` (modify) — add a two-link nav ("Organizations" / "Platform Admins").
- `apps/web/app/(platform)/platform-admins/page.tsx` (new) — the list + invite form + promote form + confirm dialogs.

---

### Task 1: Backend — DTO + UsersService methods

**Files:**
- Create: `apps/api/src/users/dto/super-admin-email.dto.ts`
- Modify: `apps/api/src/users/users.service.ts`
- Modify: `apps/api/src/users/users.module.ts`
- Test: `apps/api/src/users/users.service.spec.ts`

**Interfaces:**
- Consumes: `TenantPrismaService.forTenant(context, fn)` (`packages/shared/src/prisma/tenant-prisma.service.ts`), `AuditService.record(context, {actorUserId, action, entityType, entityId})`, `EmailService.send({to, subject, html})` (`apps/api/src/email/email.service.ts`).
- Produces: `UsersService.listSuperAdmins(context: TenantContext): Promise<SuperAdminRecord[]>`, `UsersService.inviteSuperAdmin(context: TenantContext, actorUserId: string, dto: SuperAdminEmailDto): Promise<SuperAdminRecord>`, `UsersService.promoteSuperAdmin(context: TenantContext, actorUserId: string, dto: SuperAdminEmailDto): Promise<SuperAdminRecord>`, where `SuperAdminRecord = { id: string; email: string; createdAt: Date }`. Task 2's controller calls these three methods directly.

**Key design note:** any caller who passes the `platform:manage_organizations` permission guard is, by construction, a `super_admin` — and `CurrentTenant()` (`apps/api/src/auth/current-tenant.decorator.ts`) already derives `{organizationId: null, isSuperAdmin: true}` for every `super_admin` request. So unlike `OrganizationsService.create()` (which must construct a one-off bypass context for a *brand-new* org with no session), these three methods just pass the controller-supplied `context` straight into `forTenant` — it's already the correct bypass context. No new context object needed.

- [ ] **Step 1: Write the failing DTO + service tests**

Create `apps/api/src/users/dto/super-admin-email.dto.ts`:

```typescript
import { IsEmail } from 'class-validator';

export class SuperAdminEmailDto {
  @IsEmail()
  email!: string;
}
```

Add to `apps/api/src/users/users.service.spec.ts` (append inside the existing `describe('UsersService', ...)` block, after the last `it(...)`):

```typescript
  it('listSuperAdmins returns only super_admin users via the bypass context', async () => {
    tenantPrisma.forTenant.mockResolvedValue([
      { id: 'sa-1', email: 'super1@platform.test', createdAt: new Date('2026-01-01T00:00:00.000Z') },
    ]);

    const result = await service.listSuperAdmins({ organizationId: null, isSuperAdmin: true });

    expect(result).toHaveLength(1);
    expect(tenantPrisma.forTenant).toHaveBeenCalledWith(
      { organizationId: null, isSuperAdmin: true },
      expect.any(Function),
    );
  });

  it('inviteSuperAdmin rejects an email that already has a platform account', async () => {
    tenantPrisma.forTenant.mockImplementation(async (_context: unknown, fn: (tx: unknown) => unknown) =>
      fn({ user: { findFirst: async () => ({ id: 'existing-sa' }) } }),
    );

    await expect(
      service.inviteSuperAdmin({ organizationId: null, isSuperAdmin: true }, 'actor-1', { email: 'dup@platform.test' }),
    ).rejects.toThrow(ConflictException);
  });

  it('inviteSuperAdmin creates a null-org super_admin user and records an audit event', async () => {
    let createCall: unknown;
    let tokenCreateCall: unknown;
    tenantPrisma.forTenant.mockImplementation(async (_context: unknown, fn: (tx: unknown) => unknown) =>
      fn({
        user: {
          findFirst: async () => null,
          create: async (args: unknown) => {
            createCall = args;
            return { id: 'new-sa', email: 'new@platform.test', createdAt: new Date('2026-01-01T00:00:00.000Z') };
          },
        },
        passwordResetToken: {
          create: async (args: unknown) => {
            tokenCreateCall = args;
            return {};
          },
        },
      }),
    );

    const result = await service.inviteSuperAdmin(
      { organizationId: null, isSuperAdmin: true },
      'actor-1',
      { email: 'new@platform.test' },
    );

    expect(result.email).toBe('new@platform.test');
    expect(createCall).toEqual(
      expect.objectContaining({ data: expect.objectContaining({ organizationId: null, email: 'new@platform.test', role: 'super_admin' }) }),
    );
    expect(tokenCreateCall).toEqual(
      expect.objectContaining({ data: expect.objectContaining({ userId: 'new-sa' }) }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      { organizationId: null, isSuperAdmin: true },
      { actorUserId: 'actor-1', action: 'user.super_admin_invited', entityType: 'user', entityId: 'new-sa' },
    );
  });

  it('promoteSuperAdmin rejects when no user matches the email', async () => {
    tenantPrisma.forTenant.mockImplementation(async (_context: unknown, fn: (tx: unknown) => unknown) =>
      fn({ user: { findMany: async () => [] } }),
    );

    await expect(
      service.promoteSuperAdmin({ organizationId: null, isSuperAdmin: true }, 'actor-1', { email: 'nobody@x.test' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('promoteSuperAdmin rejects when the email matches more than one account across orgs', async () => {
    tenantPrisma.forTenant.mockImplementation(async (_context: unknown, fn: (tx: unknown) => unknown) =>
      fn({
        user: {
          findMany: async () => [
            { id: 'u-1', role: 'recruiter' },
            { id: 'u-2', role: 'org_admin' },
          ],
        },
      }),
    );

    await expect(
      service.promoteSuperAdmin({ organizationId: null, isSuperAdmin: true }, 'actor-1', { email: 'shared@x.test' }),
    ).rejects.toThrow(ConflictException);
  });

  it('promoteSuperAdmin rejects a user who is already a super_admin', async () => {
    tenantPrisma.forTenant.mockImplementation(async (_context: unknown, fn: (tx: unknown) => unknown) =>
      fn({ user: { findMany: async () => [{ id: 'u-1', role: 'super_admin' }] } }),
    );

    await expect(
      service.promoteSuperAdmin({ organizationId: null, isSuperAdmin: true }, 'actor-1', { email: 'already@x.test' }),
    ).rejects.toThrow(ConflictException);
  });

  it('promoteSuperAdmin clears organizationId and sets role on the matched user', async () => {
    let updateCall: unknown;
    tenantPrisma.forTenant.mockImplementation(async (_context: unknown, fn: (tx: unknown) => unknown) =>
      fn({
        user: {
          findMany: async () => [{ id: 'u-1', role: 'org_admin' }],
          update: async (args: unknown) => {
            updateCall = args;
            return { id: 'u-1', email: 'promote@x.test', createdAt: new Date('2026-01-01T00:00:00.000Z') };
          },
        },
      }),
    );

    const result = await service.promoteSuperAdmin(
      { organizationId: null, isSuperAdmin: true },
      'actor-1',
      { email: 'promote@x.test' },
    );

    expect(result.id).toBe('u-1');
    expect(updateCall).toEqual(
      expect.objectContaining({
        where: { id: 'u-1' },
        data: expect.objectContaining({ organizationId: null, role: 'super_admin' }),
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      { organizationId: null, isSuperAdmin: true },
      { actorUserId: 'actor-1', action: 'user.super_admin_promoted', entityType: 'user', entityId: 'u-1' },
    );
  });
```

Add `ConflictException` and `NotFoundException` to the existing `import { BadRequestException, UnauthorizedException } from '@nestjs/common';` line at the top of `users.service.spec.ts` (making it `import { BadRequestException, ConflictException, NotFoundException, UnauthorizedException } from '@nestjs/common';`).

`UsersService`'s constructor is gaining a 4th dependency (`EmailService`, added in Step 3 below) — the test module must provide a mock for it or Nest's DI will fail to construct `UsersService` at all, breaking every existing test in this file, not just the new ones. Add the import `import { EmailService } from '../email/email.service';` to the top of `users.service.spec.ts`, then update the `beforeEach` block:

```typescript
  let tenantPrisma: { forTenant: jest.Mock };
  let audit: { record: jest.Mock };
  let jwt: { verify: jest.Mock };
  let emailService: { send: jest.Mock };

  beforeEach(async () => {
    tenantPrisma = { forTenant: jest.fn() };
    audit = { record: jest.fn() };
    jwt = { verify: jest.fn() };
    emailService = { send: jest.fn().mockResolvedValue({ success: true }) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: TenantPrismaService, useValue: tenantPrisma },
        { provide: AuditService, useValue: audit },
        { provide: JwtService, useValue: jwt },
        { provide: EmailService, useValue: emailService },
      ],
    }).compile();
    service = moduleRef.get(UsersService);
  });
```

This replaces the existing `let tenantPrisma...` through the closing `});` of the current `beforeEach` block (the four lines above `describe`'s first `it(...)`).

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && npx jest users.service.spec.ts`
Expected: FAIL — `service.listSuperAdmins is not a function` (and similarly for `inviteSuperAdmin`/`promoteSuperAdmin`).

- [ ] **Step 3: Implement the three service methods**

In `apps/api/src/users/users.service.ts`:

Replace the import line `import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';` with:

```typescript
import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
```

Add after the existing imports (below `import { AuditService } from '@exam-platform/shared';`):

```typescript
import { randomBytes, createHash } from 'crypto';
import { EmailService } from '../email/email.service';
import { SuperAdminEmailDto } from './dto/super-admin-email.dto';
```

Add below the `SAFE_USER_SELECT` constant:

```typescript
const SUPER_ADMIN_SELECT = { id: true, email: true, createdAt: true } as const;

export type SuperAdminRecord = Pick<User, 'id' | 'email' | 'createdAt'>;

// Mirrors OrganizationsService's PASSWORD_RESET_EXPIRY_MINUTES (apps/api/src/organizations/organizations.service.ts)
// -- same policy, reused verbatim rather than shared cross-module, matching this codebase's existing pattern
// of each service owning its own small local constants.
const PASSWORD_RESET_EXPIRY_MINUTES = 15;
```

Update the class to add `Logger` and `EmailService` to the constructor:

```typescript
@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly audit: AuditService,
    private readonly jwt: JwtService,
    private readonly emailService: EmailService,
  ) {}
```

Add the three new methods at the end of the class, before the closing `}` (after `changePassword`):

```typescript
  async listSuperAdmins(context: TenantContext): Promise<SuperAdminRecord[]> {
    return this.tenantPrisma.forTenant(context, (tx) =>
      tx.user.findMany({
        where: { role: 'super_admin' },
        select: SUPER_ADMIN_SELECT,
        orderBy: { createdAt: 'desc' },
      }),
    );
  }

  async inviteSuperAdmin(context: TenantContext, actorUserId: string, dto: SuperAdminEmailDto): Promise<SuperAdminRecord> {
    const existing = await this.tenantPrisma.forTenant(context, (tx) =>
      tx.user.findFirst({ where: { organizationId: null, email: dto.email } }),
    );
    if (existing) {
      throw new ConflictException(`A platform account for "${dto.email}" already exists`);
    }

    const passwordHash = await argon2.hash(randomBytes(32).toString('hex'));
    const newAdmin = await this.tenantPrisma.forTenant(context, (tx) =>
      tx.user.create({
        data: { organizationId: null, email: dto.email, passwordHash, role: 'super_admin' },
        select: SUPER_ADMIN_SELECT,
      }),
    );

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    await this.tenantPrisma.forTenant(context, (tx) =>
      tx.passwordResetToken.create({
        data: {
          userId: newAdmin.id,
          tokenHash,
          expiresAt: new Date(Date.now() + PASSWORD_RESET_EXPIRY_MINUTES * 60 * 1000),
        },
      }),
    );

    this.dispatchInviteEmail(dto.email, rawToken).catch((error) =>
      this.logger.error(`Failed to dispatch super_admin invite email to ${dto.email}`, error as Error),
    );

    await this.audit.record(context, {
      actorUserId,
      action: 'user.super_admin_invited',
      entityType: 'user',
      entityId: newAdmin.id,
    });
    return newAdmin;
  }

  async promoteSuperAdmin(context: TenantContext, actorUserId: string, dto: SuperAdminEmailDto): Promise<SuperAdminRecord> {
    // The (organizationId, email) unique index allows the same email string to exist under
    // multiple different orgs, so a plain findFirst could silently promote the wrong account.
    // findMany + an explicit ambiguity check makes that impossible instead of picking arbitrarily.
    const matches = await this.tenantPrisma.forTenant(context, (tx) => tx.user.findMany({ where: { email: dto.email } }));
    if (matches.length === 0) {
      throw new NotFoundException(`No user found with email "${dto.email}"`);
    }
    if (matches.length > 1) {
      throw new ConflictException(
        `"${dto.email}" matches ${matches.length} accounts across organizations; promotion requires a globally unique email`,
      );
    }
    const [user] = matches;
    if (user.role === 'super_admin') {
      throw new ConflictException(`"${dto.email}" is already a super_admin`);
    }

    const promoted = await this.tenantPrisma.forTenant(context, (tx) =>
      tx.user.update({
        where: { id: user.id },
        data: { organizationId: null, role: 'super_admin' },
        select: SUPER_ADMIN_SELECT,
      }),
    );

    this.dispatchPromotionEmail(dto.email).catch((error) =>
      this.logger.error(`Failed to dispatch super_admin promotion email to ${dto.email}`, error as Error),
    );

    await this.audit.record(context, {
      actorUserId,
      action: 'user.super_admin_promoted',
      entityType: 'user',
      entityId: promoted.id,
    });
    return promoted;
  }

  private async dispatchInviteEmail(email: string, rawToken: string): Promise<void> {
    const link = `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/reset-password/${rawToken}`;
    await this.emailService.send({
      to: email,
      subject: 'Welcome — set up your platform administrator account',
      html: `<p>You've been invited as a platform administrator on the Examination Platform. Click the link below to set your password and get started. This link expires in 15 minutes.</p><p><a href="${link}">${link}</a></p>`,
    });
  }

  private async dispatchPromotionEmail(email: string): Promise<void> {
    await this.emailService.send({
      to: email,
      subject: 'Your account now has platform administrator access',
      html: `<p>Your account on the Examination Platform has been granted platform administrator access. No action is needed — sign in as usual with your existing password.</p>`,
    });
  }
```

In `apps/api/src/users/users.module.ts`, add the `EmailModule` import:

```typescript
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { AuditModule } from '@exam-platform/shared';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [JwtModule.register({}), AuditModule, EmailModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/api && npx jest users.service.spec.ts`
Expected: PASS, all tests including the 6 new ones.

- [ ] **Step 5: Run full API package type-check**

Run: `cd apps/api && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/users/dto/super-admin-email.dto.ts apps/api/src/users/users.service.ts apps/api/src/users/users.module.ts apps/api/src/users/users.service.spec.ts
git commit -m "feat: add UsersService methods to invite/promote super_admin accounts"
```

---

### Task 2: Backend — Controller endpoints

**Files:**
- Modify: `apps/api/src/users/users.controller.ts`

**Interfaces:**
- Consumes: `UsersService.listSuperAdmins`, `UsersService.inviteSuperAdmin`, `UsersService.promoteSuperAdmin` (Task 1), `SuperAdminEmailDto` (Task 1), existing `CurrentTenant`, `CurrentUserId`, `RequirePermissions` decorators (same imports already present in this file).
- Produces: `GET /users/super-admins`, `POST /users/super-admins/invite`, `POST /users/super-admins/promote` — all three return `SuperAdminRecord` (or `SuperAdminRecord[]` for the list) as JSON, matching what Task 1's service methods return. Task 4's frontend hooks call these three routes directly.

- [ ] **Step 1: Add the three endpoints**

In `apps/api/src/users/users.controller.ts`, add the import:

```typescript
import { SuperAdminEmailDto } from './dto/super-admin-email.dto';
```

Add these three methods inside `UsersController`, after the existing `list()` method and before `getMe()`:

```typescript
  @Get('super-admins')
  @RequirePermissions('platform:manage_organizations')
  listSuperAdmins(@CurrentTenant() tenant: TenantContext) {
    return this.usersService.listSuperAdmins(tenant);
  }

  @Post('super-admins/invite')
  @RequirePermissions('platform:manage_organizations')
  inviteSuperAdmin(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Body() dto: SuperAdminEmailDto) {
    return this.usersService.inviteSuperAdmin(tenant, userId, dto);
  }

  @Post('super-admins/promote')
  @RequirePermissions('platform:manage_organizations')
  promoteSuperAdmin(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Body() dto: SuperAdminEmailDto) {
    return this.usersService.promoteSuperAdmin(tenant, userId, dto);
  }
```

- [ ] **Step 2: Run full API package type-check**

Run: `cd apps/api && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Live-verify against the real dev DB and Ethereal email**

Comment out `SMTP_HOST=smtp.office365.com` in `apps/api/.env` (the real creds are broken — this forces the `EmailService` Ethereal fallback so a real send can be observed without live SMTP).

Start the API dev server (`cd apps/api && npm run start:dev`, or the repo's existing dev workflow), then with a `super_admin` bearer token (log in via `POST /api/v1/auth/staff/login` with no `organizationSlug`, using the seeded `super@platform.test` / `DevSuper123!`):

```bash
curl -s -X POST http://localhost:3501/api/v1/users/super-admins/invite \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"email":"new-super@platform.test"}'
```

Expected: `201` with `{id, email: "new-super@platform.test", createdAt}`. Check the API server log for an Ethereal preview URL and confirm the email content mentions "platform administrator" and a `/reset-password/<token>` link.

```bash
curl -s http://localhost:3501/api/v1/users/super-admins -H "Authorization: Bearer <token>"
```

Expected: `200` with an array containing both the seeded `super@platform.test` and the just-invited `new-super@platform.test`.

Then create a throwaway `org_admin` in some org (or reuse an existing seeded one) and promote them:

```bash
curl -s -X POST http://localhost:3501/api/v1/users/super-admins/promote \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"email":"<that org_admin email>"}'
```

Expected: `201` with the promoted user's record. Re-run the `GET /users/super-admins` call and confirm the promoted user now appears in the list.

Restore `SMTP_HOST=smtp.office365.com` in `apps/api/.env` afterward.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/users/users.controller.ts
git commit -m "feat: add GET/POST /users/super-admins endpoints"
```

---

### Task 3: Frontend — types + hooks

**Files:**
- Modify: `apps/web/lib/types.ts`
- Create: `apps/web/lib/hooks/useSuperAdmins.ts`

**Interfaces:**
- Consumes: `apiFetch` (`apps/web/lib/api-client.ts`), `useAuth` (`apps/web/lib/auth-context.tsx`), matching the exact pattern of `apps/web/lib/hooks/useOrganizations.ts`.
- Produces: `SuperAdminSummary` type, `useSuperAdmins(): UseQueryResult<SuperAdminSummary[]>`, `useInviteSuperAdmin(): UseMutationResult` (input `{email: string}`), `usePromoteSuperAdmin(): UseMutationResult` (input `{email: string}`). Task 4's page imports all three.

- [ ] **Step 1: Add the type**

In `apps/web/lib/types.ts`, add after the existing `Organization` interface:

```typescript
export interface SuperAdminSummary {
  id: string;
  email: string;
  createdAt: string;
}
```

- [ ] **Step 2: Create the hooks file**

Create `apps/web/lib/hooks/useSuperAdmins.ts`:

```typescript
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { SuperAdminSummary } from '../types';
import { useAuth } from '../auth-context';

export function useSuperAdmins() {
  const { accessToken } = useAuth();
  return useQuery<SuperAdminSummary[]>({
    queryKey: ['superAdmins'],
    queryFn: () => apiFetch('/users/super-admins', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}

export function useInviteSuperAdmin() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { email: string }): Promise<SuperAdminSummary> =>
      apiFetch('/users/super-admins/invite', { method: 'POST', body: JSON.stringify(input) }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['superAdmins'] }),
  });
}

export function usePromoteSuperAdmin() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { email: string }): Promise<SuperAdminSummary> =>
      apiFetch('/users/super-admins/promote', { method: 'POST', body: JSON.stringify(input) }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['superAdmins'] }),
  });
}
```

- [ ] **Step 3: Run frontend type-check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/types.ts apps/web/lib/hooks/useSuperAdmins.ts
git commit -m "feat: add SuperAdminSummary type and useSuperAdmins hooks"
```

---

### Task 4: Frontend — Platform Admins page + nav link

**Files:**
- Create: `apps/web/app/(platform)/platform-admins/page.tsx`
- Modify: `apps/web/app/(platform)/layout.tsx`
- Test: `apps/web/app/(platform)/platform-admins/page.test.tsx`

**Interfaces:**
- Consumes: `useSuperAdmins`, `useInviteSuperAdmin`, `usePromoteSuperAdmin` (Task 3), `SuperAdminSummary` (Task 3), existing `Input`/`Button`/`Table`/`Card`/`Modal`/`useToast` from `apps/web/components/ui`, matching the structure of `apps/web/app/(platform)/organizations/page.tsx`.
- Produces: nothing consumed by a later task — this is the final task before verification.

- [ ] **Step 1: Add the nav link to the platform layout**

In `apps/web/app/(platform)/layout.tsx`, add `Link`/`usePathname` imports and a nav block. Replace the file's header `<div>` (currently just the "Platform Admin" label + logout button) with:

```typescript
'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { LogOut } from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../../lib/auth-context';

const NAV_LINKS = [
  { href: '/organizations', label: 'Organizations' },
  { href: '/platform-admins', label: 'Platform Admins' },
];

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { accessToken, role, isLoading, logout } = useAuth();

  useEffect(() => {
    if (!isLoading && !accessToken) {
      router.push('/login');
    } else if (!isLoading && accessToken && role && role !== 'super_admin') {
      router.push('/login');
    }
  }, [isLoading, accessToken, role, router]);

  async function handleLogout() {
    await logout();
    router.push('/login');
  }

  if (isLoading || !accessToken || (role !== null && role !== 'super_admin')) {
    return <p className="p-8 text-sm text-gray-500">Loading…</p>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center gap-6">
          <span className="text-sm font-bold text-gray-900">Platform Admin</span>
          <nav className="flex items-center gap-4">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={clsx(
                  'text-sm font-medium',
                  pathname === link.href ? 'text-primary' : 'text-gray-500 hover:text-gray-900',
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <button
          type="button"
          aria-label="Log out"
          onClick={handleLogout}
          className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
        >
          <LogOut size={16} />
        </button>
      </div>
      <main className="p-8">{children}</main>
    </div>
  );
}
```

- [ ] **Step 2: Write the failing page test**

Create `apps/web/app/(platform)/platform-admins/page.test.tsx`:

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import PlatformAdminsPage from './page';
import { ToastProvider } from '../../../components/ui';
import * as authContext from '../../../lib/auth-context';
import * as apiClient from '../../../lib/api-client';

jest.mock('../../../lib/auth-context');
jest.mock('../../../lib/api-client');

const mockedUseAuth = authContext.useAuth as jest.Mock;
const mockedApiFetch = apiClient.apiFetch as jest.Mock;

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <PlatformAdminsPage />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('PlatformAdminsPage', () => {
  beforeEach(() => {
    mockedUseAuth.mockReturnValue({ accessToken: 'token', role: 'super_admin', isLoading: false });
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === '/users/super-admins') {
        return Promise.resolve([{ id: 'sa-1', email: 'super@platform.test', createdAt: '2026-01-01T00:00:00.000Z' }]);
      }
      return Promise.resolve({});
    });
  });

  it('lists existing super admins', async () => {
    renderPage();
    expect(await screen.findByText('super@platform.test')).toBeInTheDocument();
  });

  it('confirms before inviting a new super admin', async () => {
    renderPage();
    fireEvent.change(await screen.findByLabelText('Invite by email'), { target: { value: 'new@platform.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Invite' }));

    expect(await screen.findByText(/Grant super_admin access to new@platform.test/)).toBeInTheDocument();
    expect(mockedApiFetch).not.toHaveBeenCalledWith('/users/super-admins/invite', expect.anything(), expect.anything());

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith(
        '/users/super-admins/invite',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ email: 'new@platform.test' }) }),
        'token',
      ),
    );
  });

  it('confirms before promoting an existing user', async () => {
    renderPage();
    fireEvent.change(await screen.findByLabelText('Promote by email'), { target: { value: 'existing@org.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Promote' }));

    expect(await screen.findByText(/Grant super_admin access to existing@org.test/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith(
        '/users/super-admins/promote',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ email: 'existing@org.test' }) }),
        'token',
      ),
    );
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd apps/web && npx jest platform-admins/page.test.tsx`
Expected: FAIL — `Cannot find module './page'` (the page doesn't exist yet).

- [ ] **Step 4: Implement the page**

Create `apps/web/app/(platform)/platform-admins/page.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { useSuperAdmins, useInviteSuperAdmin, usePromoteSuperAdmin } from '../../../lib/hooks/useSuperAdmins';
import { Table, Input, Button, Card, Modal, useToast, type Column } from '../../../components/ui';
import { SuperAdminSummary } from '../../../lib/types';

type PendingAction = { kind: 'invite' | 'promote'; email: string } | null;

export default function PlatformAdminsPage() {
  const { data: superAdmins, isLoading, isError } = useSuperAdmins();
  const inviteSuperAdmin = useInviteSuperAdmin();
  const promoteSuperAdmin = usePromoteSuperAdmin();
  const { toast } = useToast();

  const [inviteEmail, setInviteEmail] = useState('');
  const [promoteEmail, setPromoteEmail] = useState('');
  const [pending, setPending] = useState<PendingAction>(null);
  const [error, setError] = useState<string | null>(null);

  function confirmPending() {
    if (!pending) return;
    setError(null);
    const mutation = pending.kind === 'invite' ? inviteSuperAdmin : promoteSuperAdmin;
    mutation.mutate(
      { email: pending.email },
      {
        onSuccess: () => {
          toast(`Granted super_admin access to ${pending.email}.`);
          if (pending.kind === 'invite') setInviteEmail('');
          else setPromoteEmail('');
          setPending(null);
        },
        onError: (err) => {
          setError(err instanceof Error ? err.message : 'Action failed');
          setPending(null);
        },
      },
    );
  }

  const columns: Column<SuperAdminSummary>[] = [
    { key: 'email', header: 'Email', render: (sa) => sa.email, sortValue: (sa) => sa.email },
    {
      key: 'createdAt',
      header: 'Created',
      render: (sa) => new Date(sa.createdAt).toLocaleDateString(),
      sortValue: (sa) => sa.createdAt,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-gray-900">Platform Admins</h1>

      <div className="grid max-w-3xl grid-cols-1 gap-6 sm:grid-cols-2">
        <Card>
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Invite new admin</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setPending({ kind: 'invite', email: inviteEmail });
            }}
            className="flex flex-col gap-3"
          >
            <Input label="Invite by email" type="email" value={inviteEmail} onChange={setInviteEmail} required />
            <Button type="submit">Invite</Button>
          </form>
        </Card>
        <Card>
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Promote existing user</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setPending({ kind: 'promote', email: promoteEmail });
            }}
            className="flex flex-col gap-3"
          >
            <Input label="Promote by email" type="email" value={promoteEmail} onChange={setPromoteEmail} required />
            <Button type="submit">Promote</Button>
          </form>
        </Card>
      </div>

      {error && (
        <p role="alert" className="text-sm text-status-danger">
          {error}
        </p>
      )}

      {isLoading && <p className="text-sm text-gray-500">Loading platform admins…</p>}
      {isError && (
        <p role="alert" className="text-sm text-status-danger">
          Failed to load platform admins.
        </p>
      )}
      {!isLoading && !isError && (
        <Table columns={columns} rows={superAdmins ?? []} rowKey={(sa) => sa.id} emptyMessage="No platform admins yet." />
      )}

      <Modal open={pending !== null} title="Confirm" onClose={() => setPending(null)}>
        <p className="mb-4 text-sm text-gray-700">
          Grant super_admin access to {pending?.email}? This cannot be undone from this screen.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setPending(null)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={confirmPending}
            loading={inviteSuperAdmin.isPending || promoteSuperAdmin.isPending}
          >
            Confirm
          </Button>
        </div>
      </Modal>
    </div>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd apps/web && npx jest platform-admins/page.test.tsx`
Expected: PASS, all 3 tests.

- [ ] **Step 6: Run frontend type-check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add "apps/web/app/(platform)/layout.tsx" "apps/web/app/(platform)/platform-admins/page.tsx" "apps/web/app/(platform)/platform-admins/page.test.tsx"
git commit -m "feat: add Platform Admins page with invite/promote confirm flow"
```

---

### Task 5: Final verification

**Files:** none (verification only).

**Interfaces:** none — this task exercises the full stack built in Tasks 1-4.

- [ ] **Step 1: Run the full test suites**

Run: `cd apps/api && npx jest`
Expected: all tests pass, including the 6 new `users.service.spec.ts` tests.

Run: `cd apps/web && npx jest`
Expected: all tests pass, including the 3 new `platform-admins/page.test.tsx` tests.

- [ ] **Step 2: Type-check both packages**

Run: `cd apps/api && npx tsc --noEmit && cd ../web && npx tsc --noEmit`
Expected: no errors in either package.

- [ ] **Step 3: Live browser verification**

Comment out `SMTP_HOST` in `apps/api/.env` again (Ethereal fallback). Start both the API and web dev servers. Log in as `super@platform.test` / `DevSuper123!` with no org slug.

- Confirm the header nav shows "Organizations" and "Platform Admins", and clicking "Platform Admins" navigates to `/platform-admins`.
- On the Platform Admins page, confirm the seeded `super@platform.test` appears in the table.
- Invite a new super admin by email; confirm the confirm-dialog text names the exact email typed; confirm; verify the new row appears in the table (list auto-refetches via query invalidation) and an Ethereal preview link appears in the API server log with the correct subject/body.
- Promote an existing seeded `org_admin` (or a throwaway one created for this test) by email; confirm the dialog, submit, verify the row appears in the Platform Admins table.
- Log out and log back in as that just-promoted user with **no** org slug (proving their `organizationId` really did clear) — confirm they land on `/organizations` per the existing `super_admin` login redirect, not their old org's dashboard.
- Attempt to promote an email with no matching account; confirm a clear error message renders (not a raw 404 stack).

Restore `SMTP_HOST` in `apps/api/.env` afterward. Revert `apps/web/next-env.d.ts` if the dev server regenerated it (`git checkout -- apps/web/next-env.d.ts`).

- [ ] **Step 4: Update the progress ledger**

Append to `.superpowers/sdd/progress.md`:

```
=== SUPER ADMIN CREATION & PROMOTION FEATURE COMPLETE — ready for final whole-branch review ===
```
