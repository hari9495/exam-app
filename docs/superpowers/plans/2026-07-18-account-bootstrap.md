# Organization & Admin Account Bootstrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a `super_admin` a real, in-app way to onboard a new organization and its first `org_admin` — today the only way is running the seed script directly against the database.

**Architecture:** Extend the existing (currently unusable — creates zero users) `POST /organizations` to atomically create the org, a locked first `org_admin` account, and a password-reset token, then fire-and-forget an email whose link reuses the already-shipped `/reset-password/:token` page verbatim. Add a `GET /organizations` list endpoint. Fix the missing `super_admin` case in the login redirect (login itself already works for `super_admin` — the org-slug field is optional). Add one minimal, role-gated `(platform)` route group with a single "Organizations" page (create form + list).

**Tech Stack:** NestJS + Prisma (SQL Server) backend, Next.js App Router + React Query frontend, `argon2` for the locked placeholder password, existing `EmailService`/`TenantPrismaService`/`PasswordResetToken` infrastructure — no new schema, no new token model.

## Global Constraints

- No plan/billing selection: every new org is auto-assigned the trial plan (looked up by name, not caller-supplied or hardcoded by id).
- The first admin's password is never set by the `super_admin` or transmitted in any request/response body — it's a random, unguessable, immediately-discarded value; the admin sets their real password via the emailed link.
- Reuse the existing `PasswordResetToken` model and its existing 15-minute expiry verbatim — no new token model, no new expiry constant duplicated from a shared source (a local constant with the same value is fine, per the established per-module-owns-its-constants convention already used for `INVITATION_EXPIRY_DAYS`).
- The welcome email link points at `/reset-password/:token` — the exact existing page, no new frontend "accept invite" page.
- `super_admin` account creation stays seed-script-only; not in scope.
- Org editing, deletion, and cross-org user management are not in scope — the new `(platform)` UI is exactly one page.
- All `users`/`refresh_tokens`-adjacent writes for the new org route through `TenantPrismaService.forTenant({ organizationId: newOrg.id, isSuperAdmin: true }, ...)` — there is no pre-existing tenant session to scope to for a brand-new org, mirroring the exact idiom the password-reset flow already established.

---

### Task 1: Backend — `GET /organizations` (list)

**Files:**
- Modify: `apps/api/src/organizations/organizations.controller.ts`
- Modify: `apps/api/src/organizations/organizations.service.ts`
- Test: `apps/api/src/organizations/organizations.service.spec.ts`

**Interfaces:**
- Produces: `OrganizationsService.list(): Promise<Organization[]>` — Task 4 (frontend) relies on the response containing at least `{ id, name, slug, region, createdAt }` per row (the actual Prisma row has more columns; the frontend type only declares the fields it uses).

- [ ] **Step 1: Widen the test file's `prisma` mock and add the failing test**

In `apps/api/src/organizations/organizations.service.spec.ts`, update the `let prisma: ...` type declaration and the `beforeEach` to add `findMany` to the `organization` mock:

```typescript
  let prisma: { organization: { findUnique: jest.Mock; create: jest.Mock; update: jest.Mock; findMany: jest.Mock } };
```

```typescript
    prisma = { organization: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), findMany: jest.fn() } };
```

(This replaces the existing `let prisma: ...` line and the existing `prisma = { organization: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() } };` line in the current `beforeEach` — same structure, `findMany` added to both.)

Add a new test, anywhere inside the top-level `describe('OrganizationsService', ...)` block:

```typescript
  describe('list', () => {
    it('returns all organizations ordered by newest first', async () => {
      prisma.organization.findMany.mockResolvedValue([
        { id: 'org-2', name: 'Beta', slug: 'beta', region: 'eu', createdAt: new Date('2026-01-02') },
        { id: 'org-1', name: 'Acme', slug: 'acme', region: 'us', createdAt: new Date('2026-01-01') },
      ]);

      const result = await service.list();

      expect(result).toHaveLength(2);
      expect(prisma.organization.findMany).toHaveBeenCalledWith({ orderBy: { createdAt: 'desc' } });
    });
  });
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `cd apps/api && npx jest organizations.service.spec.ts`
Expected: FAIL — `service.list is not a function`.

- [ ] **Step 3: Implement `list()`**

In `apps/api/src/organizations/organizations.service.ts`, add this method (anywhere among the other public methods, e.g. right after `create`):

```typescript
  async list(): Promise<Organization[]> {
    return this.prisma.organization.findMany({ orderBy: { createdAt: 'desc' } });
  }
```

- [ ] **Step 4: Wire the route**

In `apps/api/src/organizations/organizations.controller.ts`, add this method right after the existing `create` method:

```typescript
  @Get()
  @RequirePermissions('platform:manage_organizations')
  list() {
    return this.organizationsService.list();
  }
```

- [ ] **Step 5: Run the test and verify it passes**

Run: `cd apps/api && npx jest organizations.service.spec.ts`
Expected: PASS, all tests including the new one.

- [ ] **Step 6: Run `tsc --noEmit`**

Run: `cd apps/api && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/organizations/organizations.controller.ts apps/api/src/organizations/organizations.service.ts apps/api/src/organizations/organizations.service.spec.ts
git commit -m "feat: add GET /organizations list endpoint"
```

---

### Task 2: Backend — `POST /organizations` creates the org's first admin

**Files:**
- Modify: `apps/api/src/organizations/dto/create-organization.dto.ts`
- Modify: `apps/api/src/organizations/organizations.service.ts`
- Modify: `apps/api/src/organizations/organizations.module.ts`
- Test: `apps/api/src/organizations/organizations.service.spec.ts`

**Interfaces:**
- Consumes: `EmailService.send({ to, subject, html }): Promise<SendEmailResult>` (`apps/api/src/email/email.service.ts`); `TenantPrismaService.forTenant` (already used elsewhere in this file for `getUsage`).
- Produces: `CreateOrganizationDto` now requires `{ name, slug, region, adminEmail }` (no `planId`) — this is the exact request body shape Task 4's frontend form must send.

- [ ] **Step 1: Update the DTO**

Replace `apps/api/src/organizations/dto/create-organization.dto.ts`:

```typescript
import { IsEmail, IsIn, IsString, Matches, MinLength } from 'class-validator';

export class CreateOrganizationDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  @Matches(/^[a-z0-9-]+$/, { message: 'slug must be lowercase letters, numbers, and hyphens only' })
  slug!: string;

  @IsIn(['us', 'eu'])
  region!: string;

  @IsEmail()
  adminEmail!: string;
}
```

- [ ] **Step 2: Write the failing tests**

In `apps/api/src/organizations/organizations.service.spec.ts`, first update the `prisma` mock type and `beforeEach` again to add a `plan` mock and an `EmailService` mock provider:

```typescript
  let prisma: {
    organization: { findUnique: jest.Mock; create: jest.Mock; update: jest.Mock; findMany: jest.Mock };
    plan: { findFirst: jest.Mock };
  };
```

```typescript
  let emailService: { send: jest.Mock };

  beforeEach(async () => {
    prisma = {
      organization: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), findMany: jest.fn() },
      plan: { findFirst: jest.fn() },
    };
    tenantPrisma = { forTenant: jest.fn() };
    audit = { record: jest.fn() };
    emailService = { send: jest.fn().mockResolvedValue({ success: true }) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        OrganizationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: TenantPrismaService, useValue: tenantPrisma },
        { provide: AuditService, useValue: audit },
        { provide: EmailService, useValue: emailService },
      ],
    }).compile();
    service = moduleRef.get(OrganizationsService);
  });
```

(This replaces the file's current `beforeEach` block in full — same structure, `plan` added to the `prisma` mock object and `emailService` added as a new provider.)

Add `EmailService` to the imports at the top of the file:

```typescript
import { EmailService } from '../email/email.service';
```

Add `createHash` to the imports (for verifying the emailed token against the stored hash):

```typescript
import { createHash } from 'crypto';
```

Now **replace** the two existing top-level tests `it('creates an organization when the slug is free', ...)` and `it('rejects a duplicate slug', ...)` with this `describe('create', ...)` block:

```typescript
  describe('create', () => {
    it('creates an organization, its first org_admin, and a password-reset token', async () => {
      prisma.organization.findUnique.mockResolvedValue(null);
      prisma.plan.findFirst.mockResolvedValue({ id: 'trial-plan-1', name: 'trial' });
      prisma.organization.create.mockResolvedValue({ id: 'org-1', name: 'Acme', slug: 'acme', region: 'us', planId: 'trial-plan-1' });
      tenantPrisma.forTenant.mockImplementation(async (_context: unknown, fn: (tx: unknown) => unknown) =>
        fn({
          user: { create: jest.fn().mockResolvedValue({ id: 'admin-1', email: 'admin@acme.test', role: 'org_admin' }) },
          passwordResetToken: { create: jest.fn().mockResolvedValue({ id: 'token-1' }) },
        }),
      );

      const result = await service.create(
        { organizationId: null, isSuperAdmin: true },
        'super-1',
        { name: 'Acme', slug: 'acme', region: 'us', adminEmail: 'admin@acme.test' },
      );

      expect(result.slug).toBe('acme');
      expect(prisma.plan.findFirst).toHaveBeenCalledWith({ where: { name: 'trial' } });
      expect(prisma.organization.create).toHaveBeenCalledWith({
        data: { name: 'Acme', slug: 'acme', region: 'us', planId: 'trial-plan-1' },
      });
      expect(tenantPrisma.forTenant).toHaveBeenCalledWith(
        { organizationId: 'org-1', isSuperAdmin: true },
        expect.any(Function),
      );
      expect(audit.record).toHaveBeenCalledWith(
        { organizationId: null, isSuperAdmin: true },
        { actorUserId: 'super-1', action: 'organization.created', entityType: 'organization', entityId: 'org-1' },
      );
    });

    it('creates the first admin with role org_admin and a genuinely hashed random password', async () => {
      prisma.organization.findUnique.mockResolvedValue(null);
      prisma.plan.findFirst.mockResolvedValue({ id: 'trial-plan-1', name: 'trial' });
      prisma.organization.create.mockResolvedValue({ id: 'org-1', name: 'Acme', slug: 'acme', region: 'us', planId: 'trial-plan-1' });
      const userCreate = jest.fn().mockResolvedValue({ id: 'admin-1', email: 'admin@acme.test', role: 'org_admin' });
      tenantPrisma.forTenant.mockImplementation(async (_context: unknown, fn: (tx: unknown) => unknown) =>
        fn({ user: { create: userCreate }, passwordResetToken: { create: jest.fn().mockResolvedValue({ id: 'token-1' }) } }),
      );

      await service.create(
        { organizationId: null, isSuperAdmin: true },
        'super-1',
        { name: 'Acme', slug: 'acme', region: 'us', adminEmail: 'admin@acme.test' },
      );

      expect(userCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({ organizationId: 'org-1', email: 'admin@acme.test', role: 'org_admin' }),
      });
      const passwordHash = userCreate.mock.calls[0][0].data.passwordHash;
      expect(passwordHash).toMatch(/^\$argon2/);
    });

    it('creates a password-reset token and emails a reset-password link whose token hashes to the stored value', async () => {
      prisma.organization.findUnique.mockResolvedValue(null);
      prisma.plan.findFirst.mockResolvedValue({ id: 'trial-plan-1', name: 'trial' });
      prisma.organization.create.mockResolvedValue({ id: 'org-1', name: 'Acme', slug: 'acme', region: 'us', planId: 'trial-plan-1' });
      const tokenCreate = jest.fn().mockResolvedValue({ id: 'token-1' });
      tenantPrisma.forTenant.mockImplementation(async (_context: unknown, fn: (tx: unknown) => unknown) =>
        fn({
          user: { create: jest.fn().mockResolvedValue({ id: 'admin-1', email: 'admin@acme.test', role: 'org_admin' }) },
          passwordResetToken: { create: tokenCreate },
        }),
      );

      await service.create(
        { organizationId: null, isSuperAdmin: true },
        'super-1',
        { name: 'Acme', slug: 'acme', region: 'us', adminEmail: 'admin@acme.test' },
      );
      // dispatchWelcomeEmail is fire-and-forget; flush microtasks so it has run.
      await new Promise((resolve) => setImmediate(resolve));

      expect(tokenCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({ userId: 'admin-1', expiresAt: expect.any(Date) }),
      });
      const storedTokenHash = tokenCreate.mock.calls[0][0].data.tokenHash;

      expect(emailService.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'admin@acme.test' }));
      const htmlContent = emailService.send.mock.calls[0][0].html as string;
      const match = htmlContent.match(/\/reset-password\/([a-f0-9]+)/);
      expect(match).not.toBeNull();
      const rawTokenFromEmail = match![1];
      expect(createHash('sha256').update(rawTokenFromEmail).digest('hex')).toBe(storedTokenHash);
    });

    it('rejects a duplicate slug without creating any user or token', async () => {
      prisma.organization.findUnique.mockResolvedValue({ id: 'existing-org' });

      await expect(
        service.create({ organizationId: null, isSuperAdmin: true }, 'super-1', {
          name: 'Acme 2',
          slug: 'acme',
          region: 'us',
          adminEmail: 'admin@acme.test',
        }),
      ).rejects.toThrow(ConflictException);
      expect(prisma.organization.create).not.toHaveBeenCalled();
      expect(tenantPrisma.forTenant).not.toHaveBeenCalled();
    });

    it('throws if no trial plan is configured', async () => {
      prisma.organization.findUnique.mockResolvedValue(null);
      prisma.plan.findFirst.mockResolvedValue(null);

      await expect(
        service.create({ organizationId: null, isSuperAdmin: true }, 'super-1', {
          name: 'Acme',
          slug: 'acme',
          region: 'us',
          adminEmail: 'admin@acme.test',
        }),
      ).rejects.toThrow();
      expect(prisma.organization.create).not.toHaveBeenCalled();
    });
  });
```

- [ ] **Step 3: Run the tests and verify they fail**

Run: `cd apps/api && npx jest organizations.service.spec.ts`
Expected: FAIL — `prisma.plan.findFirst is not a function` (or similar), since `service.create()` doesn't yet call it.

- [ ] **Step 4: Rewrite `OrganizationsService.create()` and add `dispatchWelcomeEmail`**

In `apps/api/src/organizations/organizations.service.ts`, update the imports at the top of the file:

```typescript
import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Organization } from '@prisma/client';
import { randomBytes, createHash } from 'crypto';
import * as argon2 from 'argon2';
import { dirname, join } from 'path';
import * as fs from 'fs/promises';
import { PrismaService } from '@exam-platform/shared';
import { TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { AuditService } from '@exam-platform/shared';
import { EmailService } from '../email/email.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateBrandingColorsDto } from './dto/update-branding-colors.dto';
import { UPLOADS_ROOT } from './uploads-path';
```

Add a module-local constant right below the existing `MAX_LOGO_SIZE_BYTES` constant:

```typescript
// Mirrors AuthService's PASSWORD_RESET_EXPIRY_MINUTES (apps/api/src/auth/auth.service.ts) --
// same policy, reused verbatim rather than shared cross-module, matching this codebase's
// existing pattern of each service owning its own small local constants.
const PASSWORD_RESET_EXPIRY_MINUTES = 15;
```

Update the class to add a logger field and inject `EmailService`:

```typescript
@Injectable()
export class OrganizationsService {
  private readonly logger = new Logger(OrganizationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly audit: AuditService,
    private readonly emailService: EmailService,
  ) {}
```

Replace the existing `create` method:

```typescript
  async create(context: TenantContext, actorUserId: string, dto: CreateOrganizationDto): Promise<Organization> {
    const existing = await this.prisma.organization.findUnique({ where: { slug: dto.slug } });
    if (existing) {
      throw new ConflictException(`Organization slug "${dto.slug}" is already taken`);
    }

    const trialPlan = await this.prisma.plan.findFirst({ where: { name: 'trial' } });
    if (!trialPlan) {
      throw new Error('No trial plan is configured for this environment');
    }

    const org = await this.prisma.organization.create({
      data: { name: dto.name, slug: dto.slug, region: dto.region, planId: trialPlan.id },
    });

    // The new org has no pre-existing tenant session to scope to, so admin creation
    // and the token that lets them set their own password are both routed through
    // forTenant's super-admin bypass -- same idiom the password-reset flow already
    // established for "identity proven by other means, not an org-scoped session".
    const passwordHash = await argon2.hash(randomBytes(32).toString('hex'));
    const admin = await this.tenantPrisma.forTenant({ organizationId: org.id, isSuperAdmin: true }, (tx) =>
      tx.user.create({
        data: { organizationId: org.id, email: dto.adminEmail, passwordHash, role: 'org_admin' },
      }),
    );

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    await this.tenantPrisma.forTenant({ organizationId: org.id, isSuperAdmin: true }, (tx) =>
      tx.passwordResetToken.create({
        data: {
          userId: admin.id,
          tokenHash,
          expiresAt: new Date(Date.now() + PASSWORD_RESET_EXPIRY_MINUTES * 60 * 1000),
        },
      }),
    );

    this.dispatchWelcomeEmail(dto.adminEmail, rawToken).catch((error) =>
      this.logger.error(`Failed to dispatch welcome email to ${dto.adminEmail}`, error as Error),
    );

    await this.audit.record(context, {
      actorUserId,
      action: 'organization.created',
      entityType: 'organization',
      entityId: org.id,
    });
    return org;
  }

  private async dispatchWelcomeEmail(email: string, rawToken: string): Promise<void> {
    const link = `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/reset-password/${rawToken}`;
    await this.emailService.send({
      to: email,
      subject: 'Welcome — set up your account',
      html: `<p>An organization has been created for you on the Examination Platform. Click the link below to set your password and get started. This link expires in 15 minutes.</p><p><a href="${link}">${link}</a></p>`,
    });
  }
```

- [ ] **Step 5: Run the tests and verify they pass**

Run: `cd apps/api && npx jest organizations.service.spec.ts`
Expected: PASS, all tests including the 5 new ones.

- [ ] **Step 6: Wire `EmailModule` into `OrganizationsModule`**

Replace `apps/api/src/organizations/organizations.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsPublicController } from './organizations-public.controller';
import { OrganizationsService } from './organizations.service';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [EmailModule],
  controllers: [OrganizationsController, OrganizationsPublicController],
  providers: [OrganizationsService],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
```

- [ ] **Step 7: Run `tsc --noEmit`**

Run: `cd apps/api && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/organizations/dto/create-organization.dto.ts apps/api/src/organizations/organizations.service.ts apps/api/src/organizations/organizations.module.ts apps/api/src/organizations/organizations.service.spec.ts
git commit -m "feat: POST /organizations creates the org's first admin and emails a setup link"
```

---

### Task 3: Frontend — login redirect fix + organization hooks

**Files:**
- Modify: `apps/web/app/login/page.tsx`
- Modify: `apps/web/lib/types.ts`
- Create: `apps/web/lib/hooks/useOrganizations.ts`
- Test: `apps/web/app/login/page.test.tsx`
- Test: `apps/web/lib/hooks/useOrganizations.test.tsx`

**Interfaces:**
- Consumes: `GET /organizations` and `POST /organizations` from Tasks 1-2.
- Produces: `useOrganizations(): UseQueryResult<Organization[]>` and `useCreateOrganization(): UseMutationResult<Organization, Error, { name: string; slug: string; region: string; adminEmail: string }>` — Task 4 consumes both by these exact names.

- [ ] **Step 1: Add the `Organization` type**

In `apps/web/lib/types.ts`, add (anywhere near `StaffUser`/`BrandingResponse`):

```typescript
export interface Organization {
  id: string;
  name: string;
  slug: string;
  region: string;
  createdAt: string;
}
```

- [ ] **Step 2: Write the failing test for `useOrganizations`**

Create `apps/web/lib/hooks/useOrganizations.test.tsx`:

```tsx
import { renderHook, waitFor } from '@testing-library/react';
import { QueryProvider } from '../query-provider';
import { AuthProvider } from '../auth-context';
import { useOrganizations } from './useOrganizations';
import { fakeJwt } from '../test-utils/fake-jwt';

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      <AuthProvider>{children}</AuthProvider>
    </QueryProvider>
  );
}

describe('useOrganizations', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('fetches the organization list from GET /organizations', async () => {
    const token = fakeJwt({ sub: 'u1', organizationId: null, role: 'super_admin' });
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: token }), { status: 200 });
      }
      if (String(url).endsWith('/organizations')) {
        return new Response(
          JSON.stringify([{ id: 'org-1', name: 'Acme', slug: 'acme', region: 'us', createdAt: '2026-01-01T00:00:00.000Z' }]),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    const { result } = renderHook(() => useOrganizations(), { wrapper });

    await waitFor(() => expect(result.current.data?.[0]?.name).toBe('Acme'));
  });
});
```

- [ ] **Step 3: Run the test and verify it fails**

Run: `cd apps/web && npx jest useOrganizations.test.tsx`
Expected: FAIL — `Cannot find module './useOrganizations'`.

- [ ] **Step 4: Implement `useOrganizations.ts`**

Create `apps/web/lib/hooks/useOrganizations.ts`:

```typescript
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { Organization } from '../types';
import { useAuth } from '../auth-context';

export function useOrganizations() {
  const { accessToken } = useAuth();
  return useQuery<Organization[]>({
    queryKey: ['organizations'],
    queryFn: () => apiFetch('/organizations', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}

interface CreateOrganizationInput {
  name: string;
  slug: string;
  region: string;
  adminEmail: string;
}

export function useCreateOrganization() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateOrganizationInput): Promise<Organization> =>
      apiFetch('/organizations', { method: 'POST', body: JSON.stringify(input) }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['organizations'] }),
  });
}
```

- [ ] **Step 5: Run the test and verify it passes**

Run: `cd apps/web && npx jest useOrganizations.test.tsx`
Expected: PASS.

- [ ] **Step 6: Fix the login redirect**

In `apps/web/app/login/page.tsx`, replace the `router.push(...)` line inside `handleSubmit`:

```typescript
      router.push(
        payload?.role === 'super_admin'
          ? '/organizations'
          : payload?.role === 'org_admin'
            ? '/users'
            : payload?.role === 'panel'
              ? '/reports'
              : '/dashboard',
      );
```

- [ ] **Step 7: Write the failing redirect test**

Add to `apps/web/app/login/page.test.tsx`, inside the existing `describe('LoginPage', ...)` block:

```typescript
  it('redirects super_admin to /organizations after login', async () => {
    const superAdminToken = fakeJwt({ sub: 'u1', organizationId: null, role: 'super_admin' });
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ message: 'no session' }), { status: 401 });
      }
      if (String(url).endsWith('/auth/staff/login')) {
        return new Response(JSON.stringify({ accessToken: superAdminToken }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    render(
      <QueryProvider>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </QueryProvider>,
    );

    await userEvent.type(screen.getByLabelText(/email/i), 'super@platform.test');
    await userEvent.type(screen.getByLabelText(/password/i), 'DevSuperAdmin123!');
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/organizations'));
  });
```

(Note this test deliberately leaves the "Organization slug" field blank — matching how a real `super_admin` logs in, and confirming the field is genuinely optional.)

- [ ] **Step 8: Run the login page tests and verify they pass**

Run: `cd apps/web && npx jest login/page.test.tsx`
Expected: PASS, all tests including the new one.

- [ ] **Step 9: Run `tsc --noEmit`**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no new errors beyond the pre-existing, already-documented baseline (`QuestionNavigator.test.tsx`, `forgot-password`/`login`/`reset-password` page tests' fetch-mock-tuple pattern).

- [ ] **Step 10: Commit**

```bash
git add apps/web/lib/types.ts apps/web/lib/hooks/useOrganizations.ts apps/web/lib/hooks/useOrganizations.test.tsx apps/web/app/login/page.tsx apps/web/app/login/page.test.tsx
git commit -m "feat: fix super_admin login redirect, add organization list/create hooks"
```

---

### Task 4: Frontend — `(platform)` shell + Organizations page

**Files:**
- Create: `apps/web/app/(platform)/layout.tsx`
- Create: `apps/web/app/(platform)/organizations/page.tsx`
- Test: `apps/web/app/(platform)/layout.test.tsx`
- Test: `apps/web/app/(platform)/organizations/page.test.tsx`

**Interfaces:**
- Consumes: `useOrganizations`, `useCreateOrganization` (Task 3); `useAuth()`; `Button`, `Input`, `Select`, `Table`, `Card`, `useToast` from `apps/web/components/ui`.

- [ ] **Step 1: Write the failing layout tests**

Create `apps/web/app/(platform)/layout.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PlatformLayout from './layout';
import { AuthProvider } from '../../lib/auth-context';
import { QueryProvider } from '../../lib/query-provider';
import { fakeJwt } from '../../lib/test-utils/fake-jwt';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }));

describe('Platform layout', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    mockPush.mockClear();
  });

  function renderLayout(role = 'super_admin') {
    const token = fakeJwt({ sub: 'u1', organizationId: null, role });
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: token }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    return render(
      <QueryProvider>
        <AuthProvider>
          <PlatformLayout>
            <p>Page content</p>
          </PlatformLayout>
        </AuthProvider>
      </QueryProvider>,
    );
  }

  it('renders children for a super_admin', async () => {
    renderLayout();
    expect(await screen.findByText('Page content')).toBeInTheDocument();
  });

  it('redirects an org_admin (wrong role) to /login instead of rendering the platform shell', async () => {
    renderLayout('org_admin');
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/login'));
    expect(screen.queryByText('Page content')).not.toBeInTheDocument();
  });

  it('logs out and redirects to /login when the logout button is clicked', async () => {
    renderLayout();
    const logoutButton = await screen.findByRole('button', { name: 'Log out' });

    await userEvent.click(logoutButton);

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/login'));
    const logoutCall = (global.fetch as jest.Mock).mock.calls.find(([url]) => String(url).endsWith('/auth/logout'));
    expect(logoutCall).toBeDefined();
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `cd apps/web && npx jest --testPathPattern "platform.*layout.test"`
Expected: FAIL — `Cannot find module './layout'`.

- [ ] **Step 3: Implement `(platform)/layout.tsx`**

Create `apps/web/app/(platform)/layout.tsx`:

```tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { useAuth } from '../../lib/auth-context';

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
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
        <span className="text-sm font-bold text-gray-900">Platform Admin</span>
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

- [ ] **Step 4: Run the layout tests and verify they pass**

Run: `cd apps/web && npx jest --testPathPattern "platform.*layout.test"`
Expected: PASS, 3/3.

- [ ] **Step 5: Write the failing tests for the Organizations page**

Create `apps/web/app/(platform)/organizations/page.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OrganizationsPage from './page';
import { AuthProvider } from '../../../lib/auth-context';
import { QueryProvider } from '../../../lib/query-provider';
import { fakeJwt } from '../../../lib/test-utils/fake-jwt';

function renderPage() {
  const token = fakeJwt({ sub: 'u1', organizationId: null, role: 'super_admin' });
  global.fetch = jest.fn(async (url, options) => {
    if (String(url).endsWith('/auth/refresh')) {
      return new Response(JSON.stringify({ accessToken: token }), { status: 200 });
    }
    if (String(url).endsWith('/organizations') && (!options || options.method === undefined)) {
      return new Response(
        JSON.stringify([{ id: 'org-1', name: 'Acme', slug: 'acme', region: 'us', createdAt: '2026-01-01T00:00:00.000Z' }]),
        { status: 200 },
      );
    }
    if (String(url).endsWith('/organizations') && options?.method === 'POST') {
      return new Response(
        JSON.stringify({ id: 'org-2', name: 'Beta', slug: 'beta', region: 'us', createdAt: '2026-01-02T00:00:00.000Z' }),
        { status: 200 },
      );
    }
    return new Response(JSON.stringify({}), { status: 200 });
  }) as unknown as typeof fetch;

  return render(
    <QueryProvider>
      <AuthProvider>
        <OrganizationsPage />
      </AuthProvider>
    </QueryProvider>,
  );
}

describe('OrganizationsPage', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('lists existing organizations', async () => {
    renderPage();
    expect(await screen.findByText('Acme')).toBeInTheDocument();
    expect(screen.getByText('acme')).toBeInTheDocument();
  });

  it('submits the create-organization form with the entered fields', async () => {
    renderPage();
    await screen.findByText('Acme');
    await userEvent.type(screen.getByLabelText('Name'), 'Beta');
    await userEvent.type(screen.getByLabelText('Slug'), 'beta');
    await userEvent.type(screen.getByLabelText('Admin email'), 'admin@beta.test');
    await userEvent.click(screen.getByRole('button', { name: 'Create organization' }));

    await waitFor(() => {
      const postCall = (global.fetch as jest.Mock).mock.calls.find(
        ([url, options]) => String(url).endsWith('/organizations') && options?.method === 'POST',
      );
      expect(postCall).toBeDefined();
      expect(JSON.parse(postCall[1].body)).toEqual({
        name: 'Beta',
        slug: 'beta',
        region: 'us',
        adminEmail: 'admin@beta.test',
      });
    });
  });
});
```

- [ ] **Step 6: Run the test and verify it fails**

Run: `cd apps/web && npx jest --testPathPattern "organizations.*page.test"`
Expected: FAIL — `Cannot find module './page'`.

- [ ] **Step 7: Implement `(platform)/organizations/page.tsx`**

Create `apps/web/app/(platform)/organizations/page.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useOrganizations, useCreateOrganization } from '../../../lib/hooks/useOrganizations';
import { Table, Input, Select, Button, Card, useToast, type Column } from '../../../components/ui';
import { Organization } from '../../../lib/types';

const REGION_OPTIONS = [
  { value: 'us', label: 'US' },
  { value: 'eu', label: 'EU' },
];

export default function OrganizationsPage() {
  const { data: organizations, isLoading, isError } = useOrganizations();
  const createOrganization = useCreateOrganization();
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [region, setRegion] = useState('us');
  const [adminEmail, setAdminEmail] = useState('');
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    createOrganization.mutate(
      { name, slug, region, adminEmail },
      {
        onSuccess: () => {
          toast(`Created ${name}. A setup email was sent to ${adminEmail}.`);
          setName('');
          setSlug('');
          setRegion('us');
          setAdminEmail('');
        },
        onError: (err) => setError(err instanceof Error ? err.message : 'Failed to create organization'),
      },
    );
  }

  const columns: Column<Organization>[] = [
    { key: 'name', header: 'Name', render: (org) => org.name, sortValue: (org) => org.name },
    { key: 'slug', header: 'Slug', render: (org) => org.slug, sortValue: (org) => org.slug },
    { key: 'region', header: 'Region', render: (org) => org.region.toUpperCase() },
    {
      key: 'createdAt',
      header: 'Created',
      render: (org) => new Date(org.createdAt).toLocaleDateString(),
      sortValue: (org) => org.createdAt,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-gray-900">Organizations</h1>
      <Card className="max-w-lg">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Create organization</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <Input label="Name" value={name} onChange={setName} required />
          <Input label="Slug" value={slug} onChange={setSlug} required />
          <Select label="Region" value={region} onChange={setRegion} options={REGION_OPTIONS} />
          <Input label="Admin email" type="email" value={adminEmail} onChange={setAdminEmail} required />
          <Button type="submit">Create organization</Button>
        </form>
        {error && (
          <p role="alert" className="mt-3 text-sm text-status-danger">
            {error}
          </p>
        )}
      </Card>
      {isLoading && <p className="text-sm text-gray-500">Loading organizations…</p>}
      {isError && (
        <p role="alert" className="text-sm text-status-danger">
          Failed to load organizations.
        </p>
      )}
      {!isLoading && !isError && (
        <Table columns={columns} rows={organizations ?? []} rowKey={(org) => org.id} emptyMessage="No organizations yet." />
      )}
    </div>
  );
}
```

- [ ] **Step 8: Run the test and verify it passes**

Run: `cd apps/web && npx jest --testPathPattern "organizations.*page.test"`
Expected: PASS, 2/2.

- [ ] **Step 9: Run `tsc --noEmit`**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no new errors beyond the pre-existing baseline.

- [ ] **Step 10: Commit**

```bash
git add apps/web/app/\(platform\)
git commit -m "feat: add minimal platform-admin shell and Organizations screen"
```

---

### Task 5: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full backend test suite**

Run: `cd apps/api && npx jest`
Expected: all suites pass, including the updated `organizations.service.spec.ts` (7 tests in the `create` describe block plus the new `list` test, alongside the pre-existing `getBranding`/`updateBrandingColors`/`uploadLogo`/`getPublicBrandingBySlug`/`getUsage` blocks).

- [ ] **Step 2: Run backend typecheck**

Run: `cd apps/api && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Run the full frontend test suite**

Run: `cd apps/web && npx jest`
Expected: all suites pass, including the new `useOrganizations.test.tsx`, `(platform)/layout.test.tsx`, `(platform)/organizations/page.test.tsx`, and the updated `login/page.test.tsx`.

- [ ] **Step 4: Run frontend typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no new errors beyond the pre-existing, already-documented baseline (`QuestionNavigator.test.tsx`, forgot-password/login/reset-password page tests' fetch-mock-tuple pattern).

- [ ] **Step 5: Manual verification in the browser**

Start the API and web dev servers, log in as `super@platform.test` (seeded `super_admin`; check `apps/api/prisma/seed.ts` for the current seeded password) with the "Organization slug" field left blank, and:
1. Confirm the login redirects to `/organizations`, not a bounce back to `/login`.
2. Confirm the page shows the seeded `demo-org` in the list.
3. Fill in the create-organization form with a new name/slug/region/admin email, submit, confirm a success toast and the new org appears in the list immediately (proving `useCreateOrganization`'s cache invalidation works).
4. Retrieve the welcome email (Ethereal preview, matching this session's established email-testing pattern — may require temporarily unsetting `SMTP_HOST` in `apps/api/.env` the same way the Forgot Password feature's verification did, then restoring it afterward), extract the token from the `/reset-password/:token` link.
5. Open that link, confirm the existing reset-password page renders normally, set a password, confirm redirect to `/login`.
6. Log in with the new org's slug + the admin email + the just-set password, confirm it succeeds and lands on `/users` (the `org_admin` redirect) — proving the whole chain from "click Create" to "the new admin can actually log in and manage their org" genuinely works end to end.
7. Confirm attempting to log in with the new organization's slug and a WRONG password fails normally (proving the locked random password was genuinely unguessable and didn't leak anywhere, e.g. never appeared in a response body — check the create-organization network response in devtools to confirm no `passwordHash` or plaintext password field is present).

- [ ] **Step 6: Commit if any fixes were needed**

Only if Steps 1-5 surfaced a bug requiring a code change. If everything passed as implemented, there is nothing to commit here.
