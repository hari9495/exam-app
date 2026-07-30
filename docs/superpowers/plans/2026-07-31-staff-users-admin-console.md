# Staff Users Admin Console (Salesforce-style) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the minimal Staff Users screen into a Salesforce-Users-style admin console — a sortable/filterable table with per-row Edit / Deactivate / Reset-password / Login-as actions, plus single and bulk-paste user creation.

**Architecture:** New user-management endpoints live in the existing `UsersController`/`UsersService`. Impersonation reuses the super_admin org-switch token model and lives in `AuthController`/`AuthService` (mirroring `switch-into`/`switch-out`). The frontend reworks `app/(org-admin)/users/page.tsx` onto the existing `Table` primitive and adds an impersonation banner mirroring `SuperAdminActingBanner`.

**Tech Stack:** NestJS + Prisma (Azure SQL, RLS via `TenantPrismaService.forTenant`), argon2, `@nestjs/jwt`; Next.js (App Router) + React Query + the in-repo `components/ui` kit; Jest for both sides.

## Global Constraints

- **Deploy timing:** build + review now, **do NOT deploy to production until after the Saturday exam.** Task 1 changes the live login path.
- **Never mint a `super_admin`** through any endpoint in this plan (Edit, bulk, create). Platform-user provisioning stays separate.
- **No password over the wire** for reset or bulk — only emailed set-password links (reuse the `passwordResetToken` + `EmailService` pattern).
- **Permission gate** for user-management endpoints is `@RequirePermissions('org:manage_users')` (org_admin holds it; `actingSuperAdmin` bypasses in `PermissionsGuard`). Impersonation endpoints use `JwtAuthGuard` only — role rules are enforced inside `AuthService`.
- **Status values** are the closed set `'active'` / `'deactivated'`. No migration (the `users.status` column already exists as a string defaulting to `'active'`).
- **Return shape:** services return `SafeUser` (`Omit<User,'passwordHash'>`) via `SAFE_USER_SELECT` — never leak `passwordHash`.
- Reuse `TenantPrismaService.forTenant(context, tx => ...)`; never touch RLS-protected tables on the raw client without the super-admin bypass.
- **Shared list-view shell (added 2026-07-31).** The table chrome — object header, item count, search box, column chooser, row-action menu — is **not** built in this plan. It comes from `ListView` and `RowActions`, owned by the concurrent Platform Admin plan. Tasks 11 and 12 were amended accordingly. Do not build a second table shell.

## Coordination with the Platform Admin list view

A second workstream is running concurrently on this branch: **Platform Admin List View**
(`docs/superpowers/plans/2026-07-31-platform-admin-list-view.md`), rebuilding the three
`(platform)` tabs — Organizations, Platform Admins, All Users — in the same Salesforce
style. Both plans were independently designing a table; they were reconciled on
2026-07-31, after this plan's Tasks 1–4 (all backend) and before either wrote any frontend.

**That plan owns the shared shell**: `ListView`, `RowActions`, and an additive
`onSortChange` callback on the existing `Table`. This plan consumes them.

- **Task 11 is blocked** until `apps/web/app/(platform)/components/ListView.tsx` and
  `RowActions.tsx` exist (that plan's Tasks 4–6, frontend-only and independent of the rest
  of it). Check before starting; report BLOCKED rather than building a local table.
- Tasks 5–10 here are unaffected and can proceed in parallel.
- **`auth.service.ts` and `auth.controller.ts` have two writers.** This plan adds
  per-*user* deactivation guards; that plan adds per-*organization* suspension guards, in
  the same functions. Both are needed and they are not interchangeable. Re-read before
  editing rather than trusting a quoted block.

---

## File Structure

**Backend (`apps/api/src`)**
- `auth/jwt.strategy.ts` — add impersonation claims to `JwtPayload` + `validate()` passthrough.
- `auth/auth.service.ts` — deactivated-login rejection; `impersonate()` + `recordImpersonationStop()`; extend `signAccessToken` payload type.
- `auth/auth.controller.ts` — `POST /auth/impersonate/:userId`, `POST /auth/impersonate/stop`; deactivated check in `ssoExchange`.
- `users/dto/update-user.dto.ts` (new), `users/dto/bulk-create-users.dto.ts` (new).
- `users/users.service.ts` — `update`, `deactivate`, `reactivate`, `requestPasswordReset`, `bulkCreate`.
- `users/users.controller.ts` — `PATCH /users/:id`, `POST /users/:id/deactivate|reactivate|reset-password`, `POST /users/bulk`.
- `*.spec.ts` alongside each.

**Frontend (`apps/web`)**
- `lib/auth-context.tsx` — `impersonate`, `stopImpersonating`, `impersonating`, `impersonatorEmail`.
- `components/ImpersonationBanner.tsx` (new, mirrors `SuperAdminActingBanner.tsx`).
- `lib/hooks/useUsers.ts` — `useUpdateUser`, `useDeactivateUser`, `useReactivateUser`, `useResetUserPassword`, `useBulkCreateUsers`.
- `components/StaffUsersTable.tsx` (new), `components/NewUserModal.tsx` (new).
- `app/(org-admin)/users/page.tsx` — rework onto table + modal.

---

## Task 1: Reject deactivated users at login

**Files:**
- Modify: `apps/api/src/auth/auth.service.ts` (in `login`, after password verify)
- Modify: `apps/api/src/auth/auth.controller.ts` (in `ssoExchange`, after user lookup)
- Test: `apps/api/src/auth/auth.service.spec.ts`

**Interfaces:**
- Consumes: existing `AuthService.login(dto)`, `User.status`.
- Produces: login throws `UnauthorizedException('This account has been deactivated')` when `status !== 'active'` (password path and SSO path).

- [ ] **Step 1: Write the failing test** (append to `auth.service.spec.ts`)

```typescript
it('rejects login for a deactivated user even with the correct password', async () => {
  const passwordHash = await argon2.hash('password1');
  tenantPrisma.forTenant.mockImplementation(async (_ctx: unknown, fn: (tx: unknown) => unknown) =>
    fn({
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'u1', organizationId: 'org1', role: 'recruiter', status: 'deactivated', passwordHash,
        }),
      },
    }),
  );
  await expect(
    service.login({ organizationSlug: 'acme', email: 'a@b.com', password: 'password1' }),
  ).rejects.toThrow('This account has been deactivated');
});
```

(Ensure the test's `prisma.organization.findUnique` mock returns `{ id: 'org1' }` so the slug resolves — follow the existing login test's setup in this file.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest auth.service.spec -t "deactivated"`
Expected: FAIL (login currently returns tokens).

- [ ] **Step 3: Add the check in `login`**, immediately after the `if (!user || !(await argon2.verify(...)))` block (around line 59):

```typescript
    if (user.status !== 'active') {
      throw new UnauthorizedException('This account has been deactivated');
    }
```

- [ ] **Step 4: Add the same check in `ssoExchange`** (`auth.controller.ts`), right after `if (!user) { throw ... }` (around line 96):

```typescript
    if (user.status !== 'active') {
      throw new UnauthorizedException('This account has been deactivated');
    }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/api && npx jest auth.service.spec`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/auth/auth.service.ts apps/api/src/auth/auth.controller.ts apps/api/src/auth/auth.service.spec.ts
git commit -m "feat(auth): reject login for deactivated users (password + SSO)"
```

---

## Task 2: PATCH /users/:id — edit role and name

**Files:**
- Create: `apps/api/src/users/dto/update-user.dto.ts`
- Modify: `apps/api/src/users/users.service.ts`, `apps/api/src/users/users.controller.ts`
- Test: `apps/api/src/users/users.service.spec.ts`

**Interfaces:**
- Produces: `UsersService.update(context: TenantContext, targetUserId: string, dto: UpdateUserDto): Promise<SafeUser>`; `UpdateUserDto { role?: string; name?: string }`.
- Guards: throws `NotFoundException` if target not in scope; `ForbiddenException` if target is a `super_admin` or if `dto.role === 'super_admin'`.

- [ ] **Step 1: Create the DTO** (`update-user.dto.ts`):

```typescript
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

const EDITABLE_ROLES = ['org_admin', 'recruiter', 'panel'] as const;

export class UpdateUserDto {
  @IsOptional()
  @IsIn(EDITABLE_ROLES)
  role?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;
}
```

- [ ] **Step 2: Write the failing tests** (append to `users.service.spec.ts`):

```typescript
describe('update', () => {
  const ctx = { organizationId: 'org1', isSuperAdmin: false };

  it('updates role and name for an in-org staff user', async () => {
    const tx = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 't1', role: 'recruiter', organizationId: 'org1' }),
        update: jest.fn().mockResolvedValue({ id: 't1', email: 'a@b.com', role: 'panel', name: 'Al', organizationId: 'org1', status: 'active', lastLoginAt: null, createdAt: new Date() }),
      },
    };
    tenantPrisma.forTenant.mockImplementation(async (_c: unknown, fn: (t: unknown) => unknown) => fn(tx));
    const result = await service.update(ctx, 't1', { role: 'panel', name: 'Al' });
    expect(result.role).toBe('panel');
    expect(tx.user.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 't1' }, data: { role: 'panel', name: 'Al' } }));
    expect(audit.record).toHaveBeenCalledWith(ctx, expect.objectContaining({ action: 'user.updated', entityId: 't1' }));
  });

  it('refuses to modify a super_admin target', async () => {
    const tx = { user: { findUnique: jest.fn().mockResolvedValue({ id: 't1', role: 'super_admin', organizationId: null }) } };
    tenantPrisma.forTenant.mockImplementation(async (_c: unknown, fn: (t: unknown) => unknown) => fn(tx));
    await expect(service.update(ctx, 't1', { name: 'x' })).rejects.toThrow(ForbiddenException);
  });

  it('throws NotFound when the target is out of scope', async () => {
    const tx = { user: { findUnique: jest.fn().mockResolvedValue(null) } };
    tenantPrisma.forTenant.mockImplementation(async (_c: unknown, fn: (t: unknown) => unknown) => fn(tx));
    await expect(service.update(ctx, 'nope', { name: 'x' })).rejects.toThrow(NotFoundException);
  });
});
```

(Add `ForbiddenException` to the `@nestjs/common` import in the spec if missing.)

- [ ] **Step 3: Run to verify failure**

Run: `cd apps/api && npx jest users.service.spec -t "update"`
Expected: FAIL (`service.update` is not a function).

- [ ] **Step 4: Implement `update`** in `users.service.ts` (add `ForbiddenException` to the `@nestjs/common` import):

```typescript
  async update(context: TenantContext, targetUserId: string, dto: UpdateUserDto): Promise<SafeUser> {
    if (dto.role === 'super_admin') {
      throw new ForbiddenException('Cannot assign the super_admin role here');
    }
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const target = await tx.user.findUnique({ where: { id: targetUserId } });
      if (!target) {
        throw new NotFoundException('User not found');
      }
      if (target.role === 'super_admin') {
        throw new ForbiddenException('Cannot modify a platform administrator');
      }
      const updated = await tx.user.update({
        where: { id: targetUserId },
        data: {
          ...(dto.role !== undefined ? { role: dto.role } : {}),
          ...(dto.name !== undefined ? { name: dto.name } : {}),
        },
        select: SAFE_USER_SELECT,
      });
      await this.audit.record(context, {
        actorUserId: null,
        action: 'user.updated',
        entityType: 'user',
        entityId: targetUserId,
      });
      return updated;
    });
  }
```

Add the import at the top: `import { UpdateUserDto } from './dto/update-user.dto';`

- [ ] **Step 5: Add the controller route** in `users.controller.ts` (import `Param`, `UpdateUserDto`):

```typescript
  @Patch(':id')
  @RequirePermissions('org:manage_users')
  update(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(tenant, id, dto);
  }
```

- [ ] **Step 6: Run tests**

Run: `cd apps/api && npx jest users.service.spec`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/users/
git commit -m "feat(users): PATCH /users/:id to edit role and name"
```

---

## Task 3: Deactivate / Reactivate a staff user

**Files:**
- Modify: `apps/api/src/users/users.service.ts`, `apps/api/src/users/users.controller.ts`
- Test: `apps/api/src/users/users.service.spec.ts`

**Interfaces:**
- Produces: `UsersService.setStatus(context, targetUserId, status: 'active' | 'deactivated', actorUserId: string): Promise<SafeUser>`.
- On deactivate: revokes the target's refresh tokens. Guards: `ForbiddenException` for self or `super_admin` target; `NotFoundException` out of scope.

- [ ] **Step 1: Write the failing tests**:

```typescript
describe('setStatus', () => {
  const ctx = { organizationId: 'org1', isSuperAdmin: false };
  const safe = { id: 't1', email: 'a@b.com', role: 'recruiter', name: null, organizationId: 'org1', status: 'deactivated', lastLoginAt: null, createdAt: new Date() };

  it('deactivates an in-org user and revokes their refresh tokens', async () => {
    const tx = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 't1', role: 'recruiter', organizationId: 'org1' }),
        update: jest.fn().mockResolvedValue(safe),
      },
      refreshToken: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
    };
    tenantPrisma.forTenant.mockImplementation(async (_c: unknown, fn: (t: unknown) => unknown) => fn(tx));
    const result = await service.setStatus(ctx, 't1', 'deactivated', 'admin1');
    expect(result.status).toBe('deactivated');
    expect(tx.refreshToken.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 't1', revokedAt: null } }));
    expect(audit.record).toHaveBeenCalledWith(ctx, expect.objectContaining({ action: 'user.deactivated', actorUserId: 'admin1' }));
  });

  it('refuses to deactivate yourself', async () => {
    await expect(service.setStatus(ctx, 'admin1', 'deactivated', 'admin1')).rejects.toThrow(ForbiddenException);
  });

  it('refuses to deactivate a super_admin', async () => {
    const tx = { user: { findUnique: jest.fn().mockResolvedValue({ id: 't1', role: 'super_admin', organizationId: null }) }, refreshToken: { updateMany: jest.fn() } };
    tenantPrisma.forTenant.mockImplementation(async (_c: unknown, fn: (t: unknown) => unknown) => fn(tx));
    await expect(service.setStatus(ctx, 't1', 'deactivated', 'admin1')).rejects.toThrow(ForbiddenException);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/api && npx jest users.service.spec -t "setStatus"`
Expected: FAIL.

- [ ] **Step 3: Implement `setStatus`**:

```typescript
  async setStatus(
    context: TenantContext,
    targetUserId: string,
    status: 'active' | 'deactivated',
    actorUserId: string,
  ): Promise<SafeUser> {
    if (targetUserId === actorUserId) {
      throw new ForbiddenException('You cannot change your own active status');
    }
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const target = await tx.user.findUnique({ where: { id: targetUserId } });
      if (!target) {
        throw new NotFoundException('User not found');
      }
      if (target.role === 'super_admin') {
        throw new ForbiddenException('Cannot change a platform administrator');
      }
      const updated = await tx.user.update({ where: { id: targetUserId }, data: { status }, select: SAFE_USER_SELECT });
      if (status === 'deactivated') {
        await tx.refreshToken.updateMany({ where: { userId: targetUserId, revokedAt: null }, data: { revokedAt: new Date() } });
      }
      await this.audit.record(context, {
        actorUserId,
        action: status === 'deactivated' ? 'user.deactivated' : 'user.reactivated',
        entityType: 'user',
        entityId: targetUserId,
      });
      return updated;
    });
  }
```

- [ ] **Step 4: Add controller routes** (import `HttpCode` already present):

```typescript
  @Post(':id/deactivate')
  @HttpCode(200)
  @RequirePermissions('org:manage_users')
  deactivate(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Param('id') id: string) {
    return this.usersService.setStatus(tenant, id, 'deactivated', userId);
  }

  @Post(':id/reactivate')
  @HttpCode(200)
  @RequirePermissions('org:manage_users')
  reactivate(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Param('id') id: string) {
    return this.usersService.setStatus(tenant, id, 'active', userId);
  }
```

- [ ] **Step 5: Run tests**

Run: `cd apps/api && npx jest users.service.spec`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/users/
git commit -m "feat(users): deactivate/reactivate staff users (revokes sessions on deactivate)"
```

---

## Task 4: POST /users/:id/reset-password — email a set-password link

**Files:**
- Modify: `apps/api/src/users/users.service.ts`, `apps/api/src/users/users.controller.ts`
- Test: `apps/api/src/users/users.service.spec.ts`

**Interfaces:**
- Produces: `UsersService.requestPasswordReset(context, targetUserId, actorUserId): Promise<{ success: true }>`. Creates a `passwordResetToken` and emails `/reset-password/:rawToken` (reuses the existing 15-minute pattern). Never returns a password.

- [ ] **Step 1: Write the failing test**:

```typescript
describe('requestPasswordReset', () => {
  const ctx = { organizationId: 'org1', isSuperAdmin: false };
  it('creates a reset token and emails the target', async () => {
    const tx = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: 't1', email: 'a@b.com', role: 'recruiter', organizationId: 'org1' }) },
      passwordResetToken: { create: jest.fn().mockResolvedValue({ id: 'tok1' }) },
    };
    tenantPrisma.forTenant.mockImplementation(async (_c: unknown, fn: (t: unknown) => unknown) => fn(tx));
    const result = await service.requestPasswordReset(ctx, 't1', 'admin1');
    expect(result).toEqual({ success: true });
    expect(tx.passwordResetToken.create).toHaveBeenCalled();
    expect(emailService.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'a@b.com' }));
    expect(audit.record).toHaveBeenCalledWith(ctx, expect.objectContaining({ action: 'user.password_reset_requested' }));
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/api && npx jest users.service.spec -t "requestPasswordReset"`
Expected: FAIL.

- [ ] **Step 3: Implement `requestPasswordReset`** (reuses `randomBytes`, `createHash`, `PASSWORD_RESET_EXPIRY_MINUTES` already imported/defined in this file):

```typescript
  async requestPasswordReset(context: TenantContext, targetUserId: string, actorUserId: string): Promise<{ success: true }> {
    const email = await this.tenantPrisma.forTenant(context, async (tx) => {
      const target = await tx.user.findUnique({ where: { id: targetUserId } });
      if (!target) {
        throw new NotFoundException('User not found');
      }
      const rawToken = randomBytes(32).toString('hex');
      const tokenHash = createHash('sha256').update(rawToken).digest('hex');
      await tx.passwordResetToken.create({
        data: { userId: target.id, tokenHash, expiresAt: new Date(Date.now() + PASSWORD_RESET_EXPIRY_MINUTES * 60 * 1000) },
      });
      // dispatched below, outside the tenant transaction, fire-and-forget
      this.dispatchResetLink(target.email, rawToken).catch((error) =>
        this.logger.error(`Failed to dispatch password reset email to ${target.email}`, error as Error),
      );
      return target.email;
    });
    await this.audit.record(context, {
      actorUserId,
      action: 'user.password_reset_requested',
      entityType: 'user',
      entityId: targetUserId,
    });
    void email;
    return { success: true };
  }

  private async dispatchResetLink(email: string, rawToken: string): Promise<void> {
    const link = `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/reset-password/${rawToken}`;
    await this.emailService.send({
      to: email,
      subject: 'Reset your Examination Platform password',
      html: `<p>A password reset was requested for your account. Click the link below to set a new password. This link expires in 15 minutes.</p><p><a href="${link}">${link}</a></p>`,
    });
  }
```

- [ ] **Step 4: Add controller route**:

```typescript
  @Post(':id/reset-password')
  @HttpCode(200)
  @RequirePermissions('org:manage_users')
  resetUserPassword(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Param('id') id: string) {
    return this.usersService.requestPasswordReset(tenant, id, userId);
  }
```

- [ ] **Step 5: Run tests**

Run: `cd apps/api && npx jest users.service.spec`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/users/
git commit -m "feat(users): admin-triggered password reset emails a set-password link"
```

---

## Task 5: POST /users/bulk — create many from pasted emails

**Files:**
- Create: `apps/api/src/users/dto/bulk-create-users.dto.ts`
- Modify: `apps/api/src/users/users.service.ts`, `apps/api/src/users/users.controller.ts`
- Test: `apps/api/src/users/users.service.spec.ts`

**Interfaces:**
- Produces: `UsersService.bulkCreate(context, dto: BulkCreateUsersDto, actorUserId): Promise<{ created: SafeUser[]; skipped: { email: string; reason: string }[] }>`. Each created user gets a random password hash + emailed set-password link. Existing emails in the org are skipped, not errored. `role` cannot be `super_admin` (DTO-enforced).

- [ ] **Step 1: Create the DTO**:

```typescript
import { ArrayMaxSize, ArrayMinSize, IsArray, IsEmail, IsIn } from 'class-validator';

const CREATABLE_ROLES = ['org_admin', 'recruiter', 'panel'] as const;

export class BulkCreateUsersDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsEmail({}, { each: true })
  emails!: string[];

  @IsIn(CREATABLE_ROLES)
  role!: string;
}
```

- [ ] **Step 2: Write the failing test**:

```typescript
describe('bulkCreate', () => {
  const ctx = { organizationId: 'org1', isSuperAdmin: false };
  it('creates new emails and skips existing ones', async () => {
    const created = { id: 'n1', email: 'new@b.com', role: 'recruiter', name: null, organizationId: 'org1', status: 'active', lastLoginAt: null, createdAt: new Date() };
    const tx = {
      user: {
        findFirst: jest.fn()
          .mockResolvedValueOnce({ id: 'dup' }) // exists@b.com -> skipped
          .mockResolvedValueOnce(null),          // new@b.com    -> created
        create: jest.fn().mockResolvedValue(created),
      },
      passwordResetToken: { create: jest.fn().mockResolvedValue({ id: 'tok' }) },
    };
    tenantPrisma.forTenant.mockImplementation(async (_c: unknown, fn: (t: unknown) => unknown) => fn(tx));
    const result = await service.bulkCreate(ctx, { emails: ['exists@b.com', 'new@b.com'], role: 'recruiter' }, 'admin1');
    expect(result.created).toHaveLength(1);
    expect(result.skipped).toEqual([{ email: 'exists@b.com', reason: 'already exists' }]);
    expect(emailService.send).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `cd apps/api && npx jest users.service.spec -t "bulkCreate"`
Expected: FAIL.

- [ ] **Step 4: Implement `bulkCreate`** (import `BulkCreateUsersDto`):

```typescript
  async bulkCreate(
    context: TenantContext,
    dto: BulkCreateUsersDto,
    actorUserId: string,
  ): Promise<{ created: SafeUser[]; skipped: { email: string; reason: string }[] }> {
    if (!context.organizationId) {
      throw new BadRequestException('Users must be created within an organization');
    }
    const created: SafeUser[] = [];
    const skipped: { email: string; reason: string }[] = [];
    for (const email of dto.emails) {
      const outcome = await this.tenantPrisma.forTenant(context, async (tx) => {
        const existing = await tx.user.findFirst({ where: { email, organizationId: context.organizationId } });
        if (existing) {
          return { skipped: { email, reason: 'already exists' } };
        }
        const passwordHash = await argon2.hash(randomBytes(32).toString('hex'));
        const user = await tx.user.create({
          data: { organizationId: context.organizationId as string, email, passwordHash, role: dto.role },
          select: SAFE_USER_SELECT,
        });
        const rawToken = randomBytes(32).toString('hex');
        const tokenHash = createHash('sha256').update(rawToken).digest('hex');
        await tx.passwordResetToken.create({
          data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + PASSWORD_RESET_EXPIRY_MINUTES * 60 * 1000) },
        });
        this.dispatchResetLink(email, rawToken).catch((error) =>
          this.logger.error(`Failed to dispatch invite email to ${email}`, error as Error),
        );
        return { created: user };
      });
      if ('created' in outcome) {
        created.push(outcome.created);
        await this.audit.record(context, { actorUserId, action: 'user.created', entityType: 'user', entityId: outcome.created.id });
      } else {
        skipped.push(outcome.skipped);
      }
    }
    return { created, skipped };
  }
```

- [ ] **Step 5: Add controller route**:

```typescript
  @Post('bulk')
  @RequirePermissions('org:manage_users')
  bulkCreate(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Body() dto: BulkCreateUsersDto) {
    return this.usersService.bulkCreate(tenant, dto, userId);
  }
```

> NOTE: register `@Post('bulk')` **before** any `@Post(':id/...')` is not required (they don't collide — `bulk` is a literal segment, `:id` is a param on sub-paths), but keep `bulk` grouped with the other `@Post` routes for readability.

- [ ] **Step 6: Run tests**

Run: `cd apps/api && npx jest users.service.spec`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/users/
git commit -m "feat(users): POST /users/bulk to create staff from a pasted email list"
```

---

## Task 6: JWT impersonation claims

**Files:**
- Modify: `apps/api/src/auth/jwt.strategy.ts`
- Test: `apps/api/src/auth/jwt.strategy.spec.ts` (create if absent)

**Interfaces:**
- Produces: `JwtPayload` gains `impersonatorUserId?: string; impersonatorEmail?: string`; `validate()` returns those on the request user (defaulting `impersonatorUserId` to `undefined`).

- [ ] **Step 1: Write the failing test** (`jwt.strategy.spec.ts`):

```typescript
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy.validate', () => {
  it('passes impersonation claims through to the request user', () => {
    const strategy = new JwtStrategy();
    const user = strategy.validate({
      sub: 'target1', organizationId: 'org1', role: 'recruiter',
      impersonatorUserId: 'admin1', impersonatorEmail: 'admin@x.com',
    });
    expect(user).toEqual(expect.objectContaining({
      userId: 'target1', role: 'recruiter', impersonatorUserId: 'admin1', impersonatorEmail: 'admin@x.com',
    }));
  });

  it('leaves impersonation claims undefined for a normal token', () => {
    const strategy = new JwtStrategy();
    const user = strategy.validate({ sub: 'u1', organizationId: 'org1', role: 'org_admin' });
    expect(user.impersonatorUserId).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/api && npx jest jwt.strategy.spec`
Expected: FAIL (property not on returned object).

- [ ] **Step 3: Extend `JwtPayload` and `validate`**:

```typescript
export interface JwtPayload {
  sub: string;
  organizationId: string | null;
  role: string;
  actingSuperAdmin?: boolean;
  actingOrgName?: string;
  impersonatorUserId?: string;
  impersonatorEmail?: string;
}
```

```typescript
  validate(payload: JwtPayload) {
    return {
      userId: payload.sub,
      organizationId: payload.organizationId,
      role: payload.role,
      actingSuperAdmin: payload.actingSuperAdmin ?? false,
      impersonatorUserId: payload.impersonatorUserId,
      impersonatorEmail: payload.impersonatorEmail,
    };
  }
```

- [ ] **Step 4: Run tests**

Run: `cd apps/api && npx jest jwt.strategy.spec`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/auth/jwt.strategy.ts apps/api/src/auth/jwt.strategy.spec.ts
git commit -m "feat(auth): carry impersonation claims through the JWT strategy"
```

---

## Task 7: Impersonation endpoints (full session takeover + return)

**Files:**
- Modify: `apps/api/src/auth/auth.service.ts`, `apps/api/src/auth/auth.controller.ts`
- Test: `apps/api/src/auth/auth.service.spec.ts`

**Interfaces:**
- Consumes: `signAccessToken` (extend its payload type), `JwtPayload` claims from Task 6.
- Produces:
  - `AuthService.impersonate(caller: { userId: string; organizationId: string | null; role: string; impersonatorUserId?: string }, targetUserId: string): Promise<string>` → access token.
  - `AuthService.recordImpersonationStop(impersonatorUserId: string, targetUserId: string): Promise<void>`.
  - Endpoints `POST /auth/impersonate/:userId` → `{ accessToken }`, `POST /auth/impersonate/stop` → `{ success: true }` (both `JwtAuthGuard`).
- Authorization: super_admin → any non-super_admin target (any org); org_admin → recruiter/panel in own org only; no self; target must be `active`; reject if caller is already impersonating.

- [ ] **Step 1: Write the failing tests** (append to `auth.service.spec.ts`):

```typescript
describe('impersonate', () => {
  beforeEach(() => {
    jwt.sign = jest.fn().mockReturnValue('signed.jwt.token');
  });

  function mockTarget(target: unknown, caller: unknown) {
    tenantPrisma.forTenant.mockImplementation(async (_c: unknown, fn: (t: unknown) => unknown) =>
      fn({ user: { findUnique: jest.fn().mockImplementation(({ where }: { where: { id: string } }) =>
        where.id === 'target1' ? Promise.resolve(target) : Promise.resolve(caller)) } }),
    );
  }

  it('lets a super_admin impersonate a recruiter in another org', async () => {
    mockTarget({ id: 'target1', role: 'recruiter', organizationId: 'orgB', status: 'active', email: 't@x.com' }, { id: 'admin1', email: 'admin@x.com' });
    const token = await service.impersonate({ userId: 'admin1', organizationId: null, role: 'super_admin' }, 'target1');
    expect(token).toBe('signed.jwt.token');
    expect(jwt.sign).toHaveBeenCalledWith(expect.objectContaining({ sub: 'target1', role: 'recruiter', impersonatorUserId: 'admin1' }), expect.anything());
    expect(audit.record).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: 'user.impersonate_start' }));
  });

  it('forbids a super_admin impersonating another super_admin', async () => {
    mockTarget({ id: 'target1', role: 'super_admin', organizationId: null, status: 'active', email: 't@x.com' }, { id: 'admin1', email: 'admin@x.com' });
    await expect(service.impersonate({ userId: 'admin1', organizationId: null, role: 'super_admin' }, 'target1')).rejects.toThrow(ForbiddenException);
  });

  it('forbids an org_admin impersonating a user in another org', async () => {
    mockTarget({ id: 'target1', role: 'recruiter', organizationId: 'orgB', status: 'active', email: 't@x.com' }, { id: 'admin1', email: 'admin@x.com' });
    await expect(service.impersonate({ userId: 'admin1', organizationId: 'orgA', role: 'org_admin' }, 'target1')).rejects.toThrow(ForbiddenException);
  });

  it('forbids an org_admin impersonating another org_admin', async () => {
    mockTarget({ id: 'target1', role: 'org_admin', organizationId: 'orgA', status: 'active', email: 't@x.com' }, { id: 'admin1', email: 'admin@x.com' });
    await expect(service.impersonate({ userId: 'admin1', organizationId: 'orgA', role: 'org_admin' }, 'target1')).rejects.toThrow(ForbiddenException);
  });

  it('rejects a deactivated target', async () => {
    mockTarget({ id: 'target1', role: 'recruiter', organizationId: 'orgA', status: 'deactivated', email: 't@x.com' }, { id: 'admin1', email: 'admin@x.com' });
    await expect(service.impersonate({ userId: 'admin1', organizationId: 'orgA', role: 'org_admin' }, 'target1')).rejects.toThrow(BadRequestException);
  });

  it('rejects self-impersonation', async () => {
    await expect(service.impersonate({ userId: 'admin1', organizationId: 'orgA', role: 'org_admin' }, 'admin1')).rejects.toThrow(BadRequestException);
  });

  it('rejects nested impersonation', async () => {
    await expect(service.impersonate({ userId: 'admin1', organizationId: 'orgA', role: 'org_admin', impersonatorUserId: 'x' }, 'target1')).rejects.toThrow(BadRequestException);
  });
});
```

(Add `ForbiddenException` + `BadRequestException` to the spec's `@nestjs/common` import.)

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/api && npx jest auth.service.spec -t "impersonate"`
Expected: FAIL.

- [ ] **Step 3: Extend `signAccessToken`'s payload type** in `auth.service.ts`:

```typescript
  private signAccessToken(payload: {
    sub: string;
    organizationId: string | null;
    role: string;
    actingSuperAdmin?: boolean;
    actingOrgName?: string;
    impersonatorUserId?: string;
    impersonatorEmail?: string;
  }): string {
```

- [ ] **Step 4: Implement `impersonate` + `recordImpersonationStop`** (add `ForbiddenException` to the `@nestjs/common` import):

```typescript
  async impersonate(
    caller: { userId: string; organizationId: string | null; role: string; impersonatorUserId?: string },
    targetUserId: string,
  ): Promise<string> {
    if (caller.impersonatorUserId) {
      throw new BadRequestException('Already impersonating another user');
    }
    if (caller.userId === targetUserId) {
      throw new BadRequestException('You cannot impersonate yourself');
    }

    const isSuper = caller.role === 'super_admin';
    const lookupContext = { organizationId: isSuper ? null : caller.organizationId, isSuperAdmin: isSuper };
    const { target, callerRecord } = await this.tenantPrisma.forTenant(lookupContext, async (tx) => ({
      target: await tx.user.findUnique({ where: { id: targetUserId } }),
      callerRecord: await tx.user.findUnique({ where: { id: caller.userId } }),
    }));

    if (!target) {
      throw new NotFoundException('User not found');
    }
    if (target.status !== 'active') {
      throw new BadRequestException('Cannot impersonate a deactivated user');
    }
    if (isSuper) {
      if (target.role === 'super_admin') {
        throw new ForbiddenException('Cannot impersonate another platform administrator');
      }
    } else if (caller.role === 'org_admin') {
      const inOrg = target.organizationId === caller.organizationId;
      const impersonatable = target.role === 'recruiter' || target.role === 'panel';
      if (!inOrg || !impersonatable) {
        throw new ForbiddenException('You can only impersonate recruiter or panel users in your own organization');
      }
    } else {
      throw new ForbiddenException('You are not allowed to impersonate users');
    }

    await this.audit.record(
      { organizationId: target.organizationId, isSuperAdmin: isSuper },
      { actorUserId: caller.userId, action: 'user.impersonate_start', entityType: 'user', entityId: target.id },
    );

    return this.signAccessToken({
      sub: target.id,
      organizationId: target.organizationId,
      role: target.role,
      impersonatorUserId: caller.userId,
      impersonatorEmail: callerRecord?.email ?? undefined,
    });
  }

  async recordImpersonationStop(impersonatorUserId: string, targetUserId: string): Promise<void> {
    await this.audit.record(
      { organizationId: null, isSuperAdmin: true },
      { actorUserId: impersonatorUserId, action: 'user.impersonate_stop', entityType: 'user', entityId: targetUserId },
    );
  }
```

- [ ] **Step 5: Add controller endpoints** in `auth.controller.ts` (below `switchOutOfOrg`):

```typescript
  @Post('impersonate/:userId')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  async impersonate(@Req() req: Request, @Param('userId') userId: string) {
    const caller = req.user as { userId: string; organizationId: string | null; role: string; impersonatorUserId?: string };
    const accessToken = await this.authService.impersonate(caller, userId);
    return { accessToken };
  }

  @Post('impersonate/stop')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  async stopImpersonating(@Req() req: Request) {
    const user = req.user as { userId: string; impersonatorUserId?: string };
    if (user.impersonatorUserId) {
      await this.authService.recordImpersonationStop(user.impersonatorUserId, user.userId);
    }
    return { success: true };
  }
```

- [ ] **Step 6: Run tests**

Run: `cd apps/api && npx jest auth.service.spec`
Expected: PASS.

- [ ] **Step 7: Full API suite + typecheck**

Run: `cd apps/api && npx jest && npx tsc --noEmit -p tsconfig.json`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/auth/
git commit -m "feat(auth): full-session-takeover impersonation with return + audit"
```

---

## Task 8: Frontend auth-context — impersonate / stop

**Files:**
- Modify: `apps/web/lib/auth-context.tsx`
- Test: `apps/web/lib/auth-context.test.tsx` (create if absent; otherwise append)

**Interfaces:**
- Produces on `useAuth()`: `impersonating: boolean`, `impersonatorEmail: string | null`, `impersonate(userId: string): Promise<void>`, `stopImpersonating(): Promise<void>`.
- `impersonate` mirrors `switchIntoOrg` (POST then `applyToken`); `stopImpersonating` mirrors `switchOutOfOrg` (POST best-effort then `silentRefresh`).

- [ ] **Step 1: Extend `AuthContextValue`**:

```typescript
  impersonating: boolean;
  impersonatorEmail: string | null;
  impersonate: (userId: string) => Promise<void>;
  stopImpersonating: () => Promise<void>;
```

- [ ] **Step 2: Add state + decode in `applyToken`**:

Add near the other `useState`s:
```typescript
  const [impersonating, setImpersonating] = useState(false);
  const [impersonatorEmail, setImpersonatorEmail] = useState<string | null>(null);
```
Inside `applyToken`, after the `setActingOrgName(...)` line:
```typescript
    setImpersonating(Boolean(payload?.impersonatorUserId));
    setImpersonatorEmail(payload && typeof payload.impersonatorEmail === 'string' ? payload.impersonatorEmail : null);
```

- [ ] **Step 3: Add the two functions** (after `switchOutOfOrg`):

```typescript
  async function impersonate(userId: string): Promise<void> {
    const result = await apiFetch(
      `/auth/impersonate/${userId}`,
      { method: 'POST', body: JSON.stringify({}) },
      accessTokenRef.current ?? undefined,
    );
    applyToken(result.accessToken);
    queryClient.removeQueries({ queryKey: ['currentUser'] });
  }

  async function stopImpersonating(): Promise<void> {
    await apiFetch(
      '/auth/impersonate/stop',
      { method: 'POST', body: JSON.stringify({}) },
      accessTokenRef.current ?? undefined,
    ).catch(() => undefined);
    await silentRefresh();
    queryClient.removeQueries({ queryKey: ['currentUser'] });
  }
```

- [ ] **Step 4: Add all four to the provider `value={{ ... }}`.**

- [ ] **Step 5: Write a test** asserting the token decode flips `impersonating` true (mirror the existing auth-context test setup if present; otherwise assert on a rendered consumer). Minimal example:

```typescript
// Render a consumer that shows auth.impersonating, seed a token whose payload has
// impersonatorUserId via the login() path, and assert the flag is 'true'.
```

Run: `cd apps/web && npx jest auth-context`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/auth-context.tsx apps/web/lib/auth-context.test.tsx
git commit -m "feat(web): impersonate/stopImpersonating in auth context"
```

---

## Task 9: ImpersonationBanner

**Files:**
- Create: `apps/web/components/ImpersonationBanner.tsx`
- Modify: the same file(s) that render `<SuperAdminActingBanner />` (find with `grep -rl "SuperAdminActingBanner" apps/web/app`) — mount `<ImpersonationBanner />` beside it.
- Test: `apps/web/components/ImpersonationBanner.test.tsx`

**Interfaces:**
- Consumes: `useAuth()` → `impersonating`, `impersonatorEmail`, `stopImpersonating`; `useCurrentUser()` → the impersonated user's `email`.
- Produces: a fixed top bar rendered only when `impersonating` is true.

- [ ] **Step 1: Write the failing test**:

```typescript
import { render, screen } from '@testing-library/react';
import { ImpersonationBanner } from './ImpersonationBanner';

jest.mock('../lib/auth-context', () => ({
  useAuth: () => ({ impersonating: true, impersonatorEmail: 'admin@x.com', stopImpersonating: jest.fn() }),
}));
jest.mock('../lib/hooks/useCurrentUser', () => ({ useCurrentUser: () => ({ data: { email: 'target@x.com' } }) }));

it('shows who you are logged in as and a return control', () => {
  render(<ImpersonationBanner />);
  expect(screen.getByText(/target@x.com/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /return to admin/i })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/web && npx jest ImpersonationBanner`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the component** (model on `components/SuperAdminActingBanner.tsx`):

```typescript
'use client';

import { useAuth } from '../lib/auth-context';
import { useCurrentUser } from '../lib/hooks/useCurrentUser';

export function ImpersonationBanner() {
  const { impersonating, impersonatorEmail, stopImpersonating } = useAuth();
  const { data: currentUser } = useCurrentUser();
  if (!impersonating) return null;
  return (
    <div className="flex items-center justify-center gap-3 bg-amber-500 px-4 py-2 text-sm font-medium text-white print:hidden">
      <span>
        You are logged in as <strong>{currentUser?.email ?? 'another user'}</strong>
        {impersonatorEmail ? ` (as ${impersonatorEmail})` : ''}
      </span>
      <button
        type="button"
        onClick={() => void stopImpersonating()}
        className="rounded bg-white/20 px-2 py-0.5 font-semibold hover:bg-white/30"
      >
        Return to admin
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Mount it** beside every `<SuperAdminActingBanner />` (recruiter/org-admin/panel layouts). Add the import and place `<ImpersonationBanner />` immediately above/below the existing acting banner.

- [ ] **Step 5: Run tests**

Run: `cd apps/web && npx jest ImpersonationBanner`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/ImpersonationBanner.tsx apps/web/components/ImpersonationBanner.test.tsx apps/web/app
git commit -m "feat(web): impersonation banner with return-to-admin"
```

---

## Task 10: useUsers mutation hooks

**Files:**
- Modify: `apps/web/lib/hooks/useUsers.ts`
- Test: `apps/web/lib/hooks/useUsers.test.tsx` (create if absent)

**Interfaces:**
- Produces: `useUpdateUser()`, `useDeactivateUser()`, `useReactivateUser()`, `useResetUserPassword()`, `useBulkCreateUsers()` — each a React Query mutation that invalidates `['users']` on success.

- [ ] **Step 1: Add the hooks** (mirror the existing `useCreateUser` shape):

```typescript
export function useUpdateUser() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; role?: string; name?: string }) =>
      apiFetch(`/users/${input.id}`, { method: 'PATCH', body: JSON.stringify({ role: input.role, name: input.name }) }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });
}

function usersAction(path: (id: string) => string, method: 'POST') {
  return function useAction() {
    const { accessToken } = useAuth();
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (id: string) => apiFetch(path(id), { method, body: JSON.stringify({}) }, accessToken ?? undefined),
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
    });
  };
}

export const useDeactivateUser = usersAction((id) => `/users/${id}/deactivate`, 'POST');
export const useReactivateUser = usersAction((id) => `/users/${id}/reactivate`, 'POST');
export const useResetUserPassword = usersAction((id) => `/users/${id}/reset-password`, 'POST');

export function useBulkCreateUsers() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { emails: string[]; role: string }) =>
      apiFetch('/users/bulk', { method: 'POST', body: JSON.stringify(input) }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });
}
```

- [ ] **Step 2: Write one smoke test** that `useUpdateUser().mutate({ id, role })` calls `apiFetch` with `PATCH /users/:id` (mock `apiFetch`). Run: `cd apps/web && npx jest useUsers` → PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/hooks/useUsers.ts apps/web/lib/hooks/useUsers.test.tsx
git commit -m "feat(web): user-management mutation hooks"
```

---

## Task 11: StaffUsersTable — columns, filters, row actions

> **AMENDED 2026-07-31 — shared shell.** A concurrent workstream, the Platform Admin
> list view (`docs/superpowers/plans/2026-07-31-platform-admin-list-view.md`), builds a
> generic `ListView` shell and a `RowActions` menu for the three `(platform)` tabs. Both
> plans were independently building a Salesforce-style table; unifying them now, while
> neither has written any frontend, avoids shipping two different table shells in one app.
>
> **What changed in this task:** `StaffUsersTable` renders `ListView` instead of `Table`
> directly, and its row menu is `RowActions` instead of a bespoke `DropdownMenu`. The page
> header, item count, search box and column chooser now come from `ListView`.
>
> **What did not change:** the columns, the permission matrix, the visible **Login as**
> button, and every mutation hook from Task 10. The domain logic is unaffected.
>
> **Blocking dependency:** Tasks 4, 5 and 6 of the Platform Admin plan (`Table`
> `onSortChange`, `ListView`, `RowActions`) must be merged before starting this task.
> Verify with `ls apps/web/app/\(platform\)/components/ListView.tsx`. If it is absent,
> report BLOCKED rather than rebuilding a local table — a second shell is the exact
> outcome this amendment exists to prevent.

**Files:**
- Create: `apps/web/components/StaffUsersTable.tsx`
- Modify: `apps/web/app/(org-admin)/users/page.tsx` (drop `CardGrid`, `Pagination`, the page `<h1>` and the loading/error blocks — `ListView` owns all four)
- Test: `apps/web/components/StaffUsersTable.test.tsx`

**Interfaces:**
- Consumes: `StaffUser[]`, `useAuth()` (`role`, `actingSuperAdmin`, `impersonate`), the Task 10 hooks, and from the Platform Admin plan: `ListView` (`apps/web/app/(platform)/components/ListView.tsx`) and `RowActions` (`.../components/RowActions.tsx`).
- Produces: `<StaffUsersTable users={StaffUser[]} currentUserRole={string|null} isActingSuperAdmin={boolean} currentUserId={string} isLoading={boolean} isError={boolean} totalCount={number|undefined} actions={ReactNode|undefined} />` rendering a `ListView` with columns Full Name, Email, Role, Status, Last Login, Created, Actions. `actions` is forwarded straight to `ListView`'s action-bar slot — Task 12 uses it for the **New User** button.
- **`StaffUsersTable` owns the Role and Status filter state** and passes the controls into `ListView`'s `filters` slot, filtering `users` itself before handing rows to `ListView`. `ListView` holds no filter state.
- Row-action visibility mirrors the server matrix: **Login as** shown when `isActingSuperAdmin` (target not super_admin) or (`currentUserRole==='org_admin'` and target role ∈ {recruiter,panel}); Edit/Deactivate/Reset shown when `isActingSuperAdmin || currentUserRole==='org_admin'` and target is not super_admin and not self.

- [ ] **Step 1: Write the failing test**:

```typescript
import { render, screen } from '@testing-library/react';
import { StaffUsersTable } from './StaffUsersTable';

const users = [
  { id: 't1', organizationId: 'o1', email: 'rec@x.com', name: 'Rec One', role: 'recruiter', status: 'active', lastLoginAt: null, createdAt: '2026-01-01T00:00:00Z' },
];

jest.mock('../lib/auth-context', () => ({ useAuth: () => ({ impersonate: jest.fn() }) }));
jest.mock('../lib/hooks/useUsers', () => ({
  useUpdateUser: () => ({ mutate: jest.fn() }), useDeactivateUser: () => ({ mutate: jest.fn() }),
  useReactivateUser: () => ({ mutate: jest.fn() }), useResetUserPassword: () => ({ mutate: jest.fn() }),
}));

// ListView persists column visibility in localStorage; clear it so one test's
// hidden column does not leak into the next.
beforeEach(() => localStorage.clear());

it('renders a staff user row with a Login-as action for an org_admin', () => {
  render(<StaffUsersTable users={users} currentUserRole="org_admin" isActingSuperAdmin={false} currentUserId="admin1" />);
  expect(screen.getByText('rec@x.com')).toBeInTheDocument();
  expect(screen.getByText('Rec One')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /login as/i })).toBeInTheDocument();
});

it('shows no row menu for a user the current user cannot manage', () => {
  const selfRow = [{ ...users[0], id: 'admin1', email: 'admin@x.com', role: 'org_admin' }];
  render(<StaffUsersTable users={selfRow} currentUserRole="org_admin" isActingSuperAdmin={false} currentUserId="admin1" />);
  // RowActions renders null for an empty action list, so gating produces no menu.
  expect(screen.queryByRole('button', { name: /actions for/i })).not.toBeInTheDocument();
});

it('filters rows by role and the item count follows', async () => {
  const mixed = [
    { ...users[0] },
    { ...users[0], id: 't2', email: 'admin@x.com', name: 'Admin Two', role: 'org_admin' },
  ];
  render(<StaffUsersTable users={mixed} currentUserRole="org_admin" isActingSuperAdmin={false} currentUserId="admin1" />);
  expect(screen.getByText(/2 items/)).toBeInTheDocument();

  await userEvent.selectOptions(screen.getAllByRole('combobox')[0], 'recruiter');

  expect(screen.getByText('rec@x.com')).toBeInTheDocument();
  expect(screen.queryByText('admin@x.com')).not.toBeInTheDocument();
  expect(screen.getByText(/1 item(?!s)/)).toBeInTheDocument();
});
```

Add `import userEvent from '@testing-library/user-event';` to the test file.

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/web && npx jest StaffUsersTable`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `StaffUsersTable.tsx`** rendering `ListView` (not `Table` directly), with `RowActions` for the `▾` menu, `StatusBadge` for role/status, and a `confirm()`-guarded Login-as button that calls `useAuth().impersonate(user.id)`. Compute `canManage(target)` and `canImpersonate(target)` from the props per the matrix above.

The component shape:

```tsx
'use client';

import { useMemo, useState } from 'react';
import { UsersRound } from 'lucide-react';
import { StatusBadge, Select, type Column, type StatusTone } from './ui';
import { ListView } from '../app/(platform)/components/ListView';
import { RowActions } from '../app/(platform)/components/RowActions';
import { StaffUser } from '../lib/types';

// Lifted from users/page.tsx — this component now owns them.
const ROLE_TONE: Record<string, StatusTone> = { org_admin: 'purple', recruiter: 'info', panel: 'neutral' };
const ROLE_LABEL: Record<string, string> = { org_admin: 'Org Admin', recruiter: 'Recruiter', panel: 'Interview Panel' };

const ROLE_FILTER_OPTIONS = [
  { value: '', label: 'All roles' },
  { value: 'org_admin', label: 'Org Admin' },
  { value: 'recruiter', label: 'Recruiter' },
  { value: 'panel', label: 'Interview Panel' },
];
const STATUS_FILTER_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'deactivated', label: 'Deactivated' },
];

export function StaffUsersTable({ users, currentUserRole, isActingSuperAdmin, currentUserId, isLoading, isError, totalCount }: StaffUsersTableProps) {
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // ListView holds no filter state -- it renders whatever rows it is given, and
  // its item count follows them. Filter here, before handing rows over.
  const rows = useMemo(
    () => users.filter((u) => (!roleFilter || u.role === roleFilter) && (!statusFilter || u.status === statusFilter)),
    [users, roleFilter, statusFilter],
  );

  const columns: Column<StaffUser>[] = useMemo(() => [ /* the seven columns below */ ], []);

  return (
    <ListView<StaffUser>
      title="Staff Users"
      icon={<UsersRound size={22} />}
      columns={columns}
      rows={rows}
      rowKey={(u) => u.id}
      searchMatch={(u, query) => u.email.toLowerCase().includes(query) || (u.name ?? '').toLowerCase().includes(query)}
      storageKey="staff-users"
      searchPlaceholder="Search staff users…"
      emptyMessage="No staff users yet."
      isLoading={isLoading}
      isError={isError}
      totalCount={totalCount}
      filters={
        <>
          <Select label="" value={roleFilter} onChange={setRoleFilter} options={ROLE_FILTER_OPTIONS} />
          <Select label="" value={statusFilter} onChange={setStatusFilter} options={STATUS_FILTER_OPTIONS} />
        </>
      }
    />
  );
}
```

Columns:

```typescript
const columns: Column<StaffUser>[] = [
  { key: 'name', header: 'Full Name', render: (u) => u.name ?? '—', sortValue: (u) => u.name ?? '' },
  { key: 'email', header: 'Email', render: (u) => u.email, sortValue: (u) => u.email },
  { key: 'role', header: 'Role', render: (u) => <StatusBadge tone={ROLE_TONE[u.role] ?? 'neutral'}>{ROLE_LABEL[u.role] ?? u.role}</StatusBadge>, sortValue: (u) => u.role },
  { key: 'status', header: 'Status', render: (u) => <StatusBadge tone={u.status === 'active' ? 'success' : 'neutral'}>{u.status}</StatusBadge>, sortValue: (u) => u.status },
  { key: 'lastLoginAt', header: 'Last Login', render: (u) => u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : 'Never', sortValue: (u) => u.lastLoginAt ?? '' },
  { key: 'createdAt', header: 'Created', render: (u) => new Date(u.createdAt).toLocaleDateString(), sortValue: (u) => u.createdAt },
  { key: 'actions', header: '', render: (u) => renderActions(u) },
];
```

`renderActions` renders, per gating:

1. A visible **Login as** `<button>` — `confirm('Log in as ' + u.email + '? You will act as this user until you return.')` → `impersonate(u.id)`. This stays a visible button, not a menu item: it is the primary action, and Salesforce's own Users list surfaces Login-as the same way.
2. A `RowActions` menu for the rest:

```tsx
<RowActions
  label={`Actions for ${u.email}`}
  actions={[
    ...(canManage(u) ? [{ label: 'Edit', onSelect: () => setEditing(u) }] : []),
    ...(canManage(u)
      ? [u.status === 'active'
          ? { label: 'Deactivate', onSelect: () => deactivateUser.mutate(u.id), danger: true }
          : { label: 'Reactivate', onSelect: () => reactivateUser.mutate(u.id) }]
      : []),
    ...(canManage(u) ? [{ label: 'Reset password', onSelect: () => resetPassword.mutate(u.id) }] : []),
  ]}
/>
```

`RowActions` renders `null` for an empty action list, so a row the current user cannot manage shows no menu — which is the gating behaviour, for free. Each mutation fires a success toast as before. **Edit** opens the same role-`<Select>`-plus-name-`<Input>` `Modal` submitting `useUpdateUser().mutate`.

- [ ] **Step 4: Update `users/page.tsx`** — the page shrinks to data fetching plus the create form. `ListView` now supplies the `<h1>`, the loading and error states, the search box and the item count, so all four come out of the page:

```tsx
export default function UsersPage() {
  const { role, actingSuperAdmin } = useAuth();
  const { data: currentUser } = useCurrentUser();
  const { data: usersResponse, isLoading, isError } = useUsers({ pageSize: 200 });

  return (
    <>
      {/* The inline create form stays here until Task 12 moves it into NewUserModal
          behind ListView's `actions` slot. */}
      <StaffUsersTable
        users={usersResponse?.data ?? []}
        currentUserRole={role}
        isActingSuperAdmin={actingSuperAdmin}
        currentUserId={currentUser?.id ?? ''}
        isLoading={isLoading}
        isError={isError}
        totalCount={usersResponse?.total}
      />
    </>
  );
}
```

Drop the local `page` state and `Pagination`: `ListView` sorts and filters the rows it is handed, and sorting a paginated slice would sort only the visible page. Fetch one large page instead, matching how the Platform Admin tabs do it. Move `ROLE_TONE` and `ROLE_LABEL` into `StaffUsersTable.tsx`; `ROLE_OPTIONS` stays here for the create form until Task 12 takes it.

- [ ] **Step 5: Run tests + existing page test**

Run: `cd apps/web && npx jest StaffUsersTable "(org-admin)/users"`
Expected: PASS (update `users/page.test.tsx` if it asserted on the old card layout).

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/StaffUsersTable.tsx apps/web/app/(org-admin)/users/
git commit -m "feat(web): Salesforce-style staff users table with row actions"
```

---

## Task 12: NewUserModal — single + bulk tabs

**Files:**
- Create: `apps/web/components/NewUserModal.tsx`
- Modify: `apps/web/app/(org-admin)/users/page.tsx` (replace the inline add-form with a "New User" button + modal)
- Test: `apps/web/components/NewUserModal.test.tsx`

**Interfaces:**
- Consumes: `useCreateUser`, `useBulkCreateUsers`, `Modal`, `Tabs`.
- Produces: `<NewUserModal open={boolean} onClose={() => void} />`. **Single** tab: email + role + password (min 8) OR a "Send set-password link instead" checkbox (when checked, omit password — for a single link, POST `/users/bulk` with `{ emails:[email], role }`). **Multiple** tab: a `<textarea>` (one email per line) + role `<Select>` → `useBulkCreateUsers().mutate`, then show a `created N / skipped M` summary.

- [ ] **Step 1: Write the failing test**:

```typescript
import { render, screen } from '@testing-library/react';
import { NewUserModal } from './NewUserModal';

jest.mock('../lib/hooks/useUsers', () => ({
  useCreateUser: () => ({ mutate: jest.fn() }),
  useBulkCreateUsers: () => ({ mutate: jest.fn(), data: undefined }),
}));

it('shows Single and Multiple tabs when open', () => {
  render(<NewUserModal open onClose={() => {}} />);
  expect(screen.getByRole('tab', { name: /single/i })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: /multiple/i })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd apps/web && npx jest NewUserModal`
Expected: FAIL.

- [ ] **Step 3: Implement `NewUserModal.tsx`** with `Modal` + `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent`. Single-tab submit calls `useCreateUser().mutate({ email, password, role })` (or the bulk endpoint with one email when "send link" is checked); Multiple-tab splits the textarea on newlines, trims/filters blanks, and calls `useBulkCreateUsers().mutate({ emails, role })`, rendering the returned `{ created, skipped }` summary and a toast.

- [ ] **Step 4: Wire into `users/page.tsx`** — remove the inline `<form>`, and put the button in the action bar.

**Amended 2026-07-31:** after Task 11 the page has no header row of its own — `ListView` renders the object header and its right-aligned action bar. Pass the button through instead of placing it on the page:

```tsx
const [showNew, setShowNew] = useState(false);

<StaffUsersTable
  users={usersResponse?.data ?? []}
  currentUserRole={role}
  isActingSuperAdmin={actingSuperAdmin}
  currentUserId={currentUser?.id ?? ''}
  isLoading={isLoading}
  isError={isError}
  totalCount={usersResponse?.total}
  actions={<Button onClick={() => setShowNew(true)}>New User</Button>}
/>
<NewUserModal open={showNew} onClose={() => setShowNew(false)} />
```

This requires `StaffUsersTable` to accept an `actions?: ReactNode` prop and forward it to `ListView`'s `actions` slot — add it in Task 11.

- [ ] **Step 5: Run tests**

Run: `cd apps/web && npx jest NewUserModal "(org-admin)/users"`
Expected: PASS.

- [ ] **Step 6: Full web suite + typecheck**

Run: `cd apps/web && npx jest && npx tsc --noEmit -p tsconfig.json`
Expected: PASS (pre-existing unrelated test-mock type errors in other files are acceptable; nothing new from these files).

- [ ] **Step 7: Commit**

```bash
git add apps/web/components/NewUserModal.tsx apps/web/app/(org-admin)/users/
git commit -m "feat(web): New User modal with single + bulk-paste creation"
```

---

## Final verification (before the post-Saturday deploy window)

- [ ] `cd apps/api && npx jest && npx tsc --noEmit -p tsconfig.json` — all green.
- [ ] `cd apps/web && npx jest` — all green (no new failures).
- [ ] Manual smoke against a local/staging stack: create a user, edit role, deactivate (confirm that user can no longer log in), reactivate, reset-password (confirm email link), bulk-paste two emails, and Login-as a recruiter then Return to admin — confirm the banner appears and clears.
- [ ] Deploy per the standard VM recipe (scp changed files individually; `npm run build` for `api`; for `web` remember the standalone `.next/static` + `public` copy step; `pm2 restart api web`). **Not before Saturday's exam.**

## Self-review notes (addressed)

- **Spec coverage:** table (T11), filters/sort (T11 + `Table`), edit (T2), deactivate/reactivate + login rejection (T1, T3), reset (T4), bulk (T5), impersonation full-takeover + authz matrix + banner + return (T6–T9), single/bulk creation (T12). All spec sections map to a task.
- **Impersonation path:** implemented under `/auth/impersonate/*` (not `/users/:id/impersonate` as the spec sketched) to mirror the existing `switch-into`/`switch-out` token model — behavior is identical; only the route prefix differs. Noted here so the reviewer isn't surprised.
- **Type consistency:** `setStatus(context, id, status, actorUserId)`, `impersonate(caller, targetUserId)`, `UpdateUserDto{role?,name?}`, `BulkCreateUsersDto{emails,role}`, and the `{created,skipped}` bulk shape are used identically across their producing and consuming tasks.
