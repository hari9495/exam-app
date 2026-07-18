# Staff "My Profile" Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every logged-in staff user (recruiter, org_admin, panel) a self-service page to view their account, edit their display name, and change their password without logging out.

**Architecture:** Add a nullable `name` column to `User`. Add three self-service endpoints (`GET/PATCH /users/me`, `POST /users/me/change-password`) to the existing `UsersController`, gated by `JwtAuthGuard` only (no permission check — every role manages its own account). One shared `<ProfileForm>` component is rendered from three thin pages, one per staff route group, since Next.js route groups can't share one literal URL. A new `useCurrentUser()` hook feeds both the profile page and — as a side effect that fixes an already-flagged bug — the sidebar footers, which currently hardcode a fake name.

**Tech Stack:** NestJS + Prisma (SQL Server) backend, Next.js App Router + React Query frontend, `argon2` for password hashing, `@nestjs/jwt` for refresh-token family verification, existing `Input`/`Button`/`Card`/`useToast` design-system primitives.

## Global Constraints

- `name` is a new nullable `String` column on `User`, no backfill, no default.
- Email, role, and organization are read-only on the profile page — never accepted by `PATCH /users/me`.
- Changing password requires re-entering the current password (`argon2.verify` against the stored hash before allowing the change).
- Changing password revokes every *other* active `RefreshToken` for the user (matching the forgot-password reset flow's `revokedAt` mechanism), but explicitly excludes the caller's own current session (identified by the `familyId` in their own `refresh_token` cookie) — the user making the request must stay logged in.
- All `users`/`refresh_tokens` reads/writes go through `TenantPrismaService.forTenant(...)` — this table is RLS-protected and secure-by-default (see the Forgot Password feature's RLS bug fix for why a bare `this.prisma.user.*` call silently no-ops).
- One shared `<ProfileForm>` component, not three duplicated forms.
- The sidebar footer's avatar+name block becomes a link to `/profile` in all three layouts; the logout button stays a separate sibling control, unchanged.
- Out of scope: email editing, avatar upload, account deletion, and any change to the existing Staff Users (list-other-users) screen.

---

### Task 1: Schema — `User.name` column

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260718060000_add_user_name/migration.sql`
- Modify: `apps/api/src/users/users.service.ts:16-24` (the `SAFE_USER_SELECT` constant)
- Test: `apps/api/src/users/users.service.spec.ts`

**Interfaces:**
- Produces: `User.name: string | null` on the Prisma model, and `name: true` added to `SAFE_USER_SELECT`, so `SafeUser` (already `Omit<User, 'passwordHash'>`) now carries `name` for every consumer of `UsersService` (`create`, `list`, and the new `getMe`/`updateMe` added in Task 2).

- [ ] **Step 1: Add the column to the Prisma schema**

In `apps/api/prisma/schema.prisma`, find the `User` model and add `name` right after `email`:

```prisma
model User {
  id             String         @id @default(uuid()) @db.UniqueIdentifier
  organizationId String?        @map("organization_id") @db.UniqueIdentifier
  organization   Organization?  @relation(fields: [organizationId], references: [id])
  email          String
  name           String?
  passwordHash   String         @map("password_hash")
  role           String
  status         String         @default("active")
  lastLoginAt    DateTime?      @map("last_login_at")
  createdAt           DateTime            @default(now()) @map("created_at")
  refreshTokens       RefreshToken[]
  passwordResetTokens PasswordResetToken[]
  auditLogs           AuditLog[]

  @@unique([organizationId, email])
  @@map("users")
}
```

- [ ] **Step 2: Write the migration**

Create `apps/api/prisma/migrations/20260718060000_add_user_name/migration.sql`:

```sql
ALTER TABLE [dbo].[users] ADD [name] NVARCHAR(1000) NULL;
```

- [ ] **Step 3: Validate the schema**

Run: `cd apps/api && npx prisma validate`
Expected: `The schema at prisma/schema.prisma is valid 🚀`

- [ ] **Step 4: Apply the migration to the local dev database**

Run: `cd apps/api && npx prisma migrate deploy`
Expected: exactly 1 pending migration applied (`20260718060000_add_user_name`).

- [ ] **Step 5: Regenerate the Prisma client**

Run: `cd apps/api && npx prisma generate`
Expected: completes without error; `PrismaClient`'s `User` type now includes `name: string | null`.

- [ ] **Step 6: Add `name` to `SAFE_USER_SELECT`**

In `apps/api/src/users/users.service.ts`, update the constant:

```typescript
const SAFE_USER_SELECT = {
  id: true,
  organizationId: true,
  email: true,
  name: true,
  role: true,
  status: true,
  lastLoginAt: true,
  createdAt: true,
} as const;
```

- [ ] **Step 7: Write a failing test proving `name` is returned**

Add to `apps/api/src/users/users.service.spec.ts`, inside the existing `describe('UsersService', ...)` block:

```typescript
  it('includes name in the created user response', async () => {
    tenantPrisma.forTenant.mockResolvedValue({
      id: 'user-1',
      email: 'a@b.com',
      name: null,
      organizationId: 'org-1',
      role: 'recruiter',
      status: 'active',
      lastLoginAt: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    const result = await service.create(
      { organizationId: 'org-1', isSuperAdmin: false },
      { email: 'a@b.com', password: 'password1', role: 'recruiter' },
    );

    expect(result).toHaveProperty('name', null);
  });
```

- [ ] **Step 8: Run the test and confirm it passes**

Run: `cd apps/api && npx jest users.service.spec.ts`
Expected: PASS, 4/4 tests (the 3 existing + this new one) — `name: true` in `SAFE_USER_SELECT` means the mocked return value (which already includes `name: null`) passes straight through.

- [ ] **Step 9: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260718060000_add_user_name apps/api/src/users/users.service.ts apps/api/src/users/users.service.spec.ts
git commit -m "feat: add User.name column"
```

---

### Task 2: Backend — `GET /users/me` and `PATCH /users/me`

**Files:**
- Create: `apps/api/src/users/dto/update-profile.dto.ts`
- Modify: `apps/api/src/users/users.service.ts`
- Modify: `apps/api/src/users/users.controller.ts`
- Test: `apps/api/src/users/users.service.spec.ts`

**Interfaces:**
- Consumes: `SAFE_USER_SELECT` and `SafeUser` from Task 1 (now includes `name`); `CurrentTenant` decorator (`apps/api/src/auth/current-tenant.decorator.ts`, returns `TenantContext`); `CurrentUserId` decorator (`apps/api/src/auth/current-user-id.decorator.ts`, returns the JWT's `sub` as a string).
- Produces: `UsersService.getMe(context: TenantContext, userId: string): Promise<SafeUser>` and `UsersService.updateMe(context: TenantContext, userId: string, dto: UpdateProfileDto): Promise<SafeUser>` — Task 5 (frontend) relies on the exact response shape `{ id, organizationId, email, name, role, status, lastLoginAt, createdAt }`.

- [ ] **Step 1: Write the failing service tests**

Add to `apps/api/src/users/users.service.spec.ts`:

```typescript
  it('getMe returns the caller\'s own user record', async () => {
    tenantPrisma.forTenant.mockResolvedValue({
      id: 'user-1',
      email: 'a@b.com',
      name: 'Jane Recruiter',
      organizationId: 'org-1',
      role: 'recruiter',
      status: 'active',
      lastLoginAt: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    const result = await service.getMe({ organizationId: 'org-1', isSuperAdmin: false }, 'user-1');

    expect(result.name).toBe('Jane Recruiter');
    expect(tenantPrisma.forTenant).toHaveBeenCalledWith(
      { organizationId: 'org-1', isSuperAdmin: false },
      expect.any(Function),
    );
  });

  it('updateMe updates only the name field', async () => {
    tenantPrisma.forTenant.mockResolvedValue({
      id: 'user-1',
      email: 'a@b.com',
      name: 'New Name',
      organizationId: 'org-1',
      role: 'recruiter',
      status: 'active',
      lastLoginAt: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    const result = await service.updateMe({ organizationId: 'org-1', isSuperAdmin: false }, 'user-1', {
      name: 'New Name',
    });

    expect(result.name).toBe('New Name');
    expect(tenantPrisma.forTenant).toHaveBeenCalledWith(
      { organizationId: 'org-1', isSuperAdmin: false },
      expect.any(Function),
    );
  });
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `cd apps/api && npx jest users.service.spec.ts`
Expected: FAIL — `service.getMe is not a function` / `service.updateMe is not a function`.

- [ ] **Step 3: Write `UpdateProfileDto`**

Create `apps/api/src/users/dto/update-profile.dto.ts`:

```typescript
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class UpdateProfileDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;
}
```

- [ ] **Step 4: Implement `getMe` and `updateMe`**

In `apps/api/src/users/users.service.ts`, add the import and two methods (add this below the existing `list` method):

```typescript
import { UpdateProfileDto } from './dto/update-profile.dto';
```

```typescript
  async getMe(context: TenantContext, userId: string): Promise<SafeUser> {
    return this.tenantPrisma.forTenant(context, (tx) =>
      tx.user.findUniqueOrThrow({ where: { id: userId }, select: SAFE_USER_SELECT }),
    );
  }

  async updateMe(context: TenantContext, userId: string, dto: UpdateProfileDto): Promise<SafeUser> {
    return this.tenantPrisma.forTenant(context, (tx) =>
      tx.user.update({ where: { id: userId }, data: { name: dto.name }, select: SAFE_USER_SELECT }),
    );
  }
```

- [ ] **Step 5: Run the tests and verify they pass**

Run: `cd apps/api && npx jest users.service.spec.ts`
Expected: PASS, 6/6 tests.

- [ ] **Step 6: Wire the routes**

In `apps/api/src/users/users.controller.ts`, replace the full file:

```typescript
import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { TenantContext } from '@exam-platform/shared';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Controller('users')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @RequirePermissions('org:manage_users')
  create(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateUserDto) {
    return this.usersService.create(tenant, dto);
  }

  @Get()
  @RequirePermissions('org:view')
  list(@CurrentTenant() tenant: TenantContext) {
    return this.usersService.list(tenant);
  }

  @Get('me')
  getMe(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string) {
    return this.usersService.getMe(tenant, userId);
  }

  @Patch('me')
  updateMe(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateMe(tenant, userId, dto);
  }
}
```

Note: `@Get('me')` is registered after the bare `@Get()` — this is fine, NestJS matches `GET /users/me` and `GET /users` as distinct literal routes, not a wildcard collision (unlike Express path params, there's no `:id` route here to collide with).

- [ ] **Step 7: Run `tsc --noEmit` to confirm no type errors**

Run: `cd apps/api && npx tsc --noEmit`
Expected: no new errors from `users.controller.ts` or `users.service.ts`.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/users/dto/update-profile.dto.ts apps/api/src/users/users.service.ts apps/api/src/users/users.controller.ts apps/api/src/users/users.service.spec.ts
git commit -m "feat: add GET/PATCH /users/me self-service profile endpoints"
```

---

### Task 3: Backend — `POST /users/me/change-password`

**Files:**
- Create: `apps/api/src/users/dto/change-password.dto.ts`
- Modify: `apps/api/src/users/users.service.ts`
- Modify: `apps/api/src/users/users.controller.ts`
- Modify: `apps/api/src/users/users.module.ts`
- Test: `apps/api/src/users/users.service.spec.ts`

**Interfaces:**
- Consumes: `argon2.hash`/`argon2.verify` (already imported in `users.service.ts` from Task-1-era code); `AuditService.record(context, entry)` (already injected); the `RefreshToken` Prisma model's `familyId` field (`apps/api/prisma/schema.prisma:77-89`).
- Produces: `UsersService.changePassword(context: TenantContext, userId: string, dto: ChangePasswordDto, currentRefreshToken: string | undefined): Promise<void>` — throws `UnauthorizedException` if `dto.currentPassword` doesn't match. Task 6 (frontend) only needs to know this throws on wrong-current-password and otherwise succeeds with `200`.

- [ ] **Step 1: Write the failing service tests**

Add to `apps/api/src/users/users.service.spec.ts`. First, add `JwtService` to the test module's providers (update the existing `beforeEach`):

```typescript
import { UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
```

```typescript
  let jwt: { verify: jest.Mock };

  beforeEach(async () => {
    tenantPrisma = { forTenant: jest.fn() };
    audit = { record: jest.fn() };
    jwt = { verify: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: TenantPrismaService, useValue: tenantPrisma },
        { provide: AuditService, useValue: audit },
        { provide: JwtService, useValue: jwt },
      ],
    }).compile();
    service = moduleRef.get(UsersService);
  });
```

(This replaces the existing `beforeEach` block — same body, with `jwt` added.)

Then add the tests:

```typescript
  it('changePassword rejects a wrong current password', async () => {
    const storedHash = await argon2.hash('correct-password');
    tenantPrisma.forTenant.mockImplementation(async (_context: unknown, fn: (tx: unknown) => unknown) =>
      fn({ user: { findUniqueOrThrow: async () => ({ id: 'user-1', passwordHash: storedHash }) } }),
    );

    await expect(
      service.changePassword(
        { organizationId: 'org-1', isSuperAdmin: false },
        'user-1',
        { currentPassword: 'wrong-password', newPassword: 'NewPassw0rd!' },
        undefined,
      ),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('changePassword updates the hash and revokes other sessions, keeping the caller\'s own session alive', async () => {
    const storedHash = await argon2.hash('correct-password');
    const userUpdate = jest.fn();
    const refreshTokenUpdateMany = jest.fn();
    tenantPrisma.forTenant.mockImplementation(async (_context: unknown, fn: (tx: unknown) => unknown) =>
      fn({
        user: {
          findUniqueOrThrow: async () => ({ id: 'user-1', passwordHash: storedHash }),
          update: userUpdate,
        },
        refreshToken: { updateMany: refreshTokenUpdateMany },
      }),
    );
    jwt.verify.mockReturnValue({ sub: 'user-1', familyId: 'family-current' });

    await service.changePassword(
      { organizationId: 'org-1', isSuperAdmin: false },
      'user-1',
      { currentPassword: 'correct-password', newPassword: 'NewPassw0rd!' },
      'raw-refresh-token',
    );

    expect(userUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'user-1' }, data: expect.objectContaining({ passwordHash: expect.any(String) }) }),
    );
    expect(refreshTokenUpdateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', revokedAt: null, familyId: { not: 'family-current' } },
      data: { revokedAt: expect.any(Date) },
    });
    expect(audit.record).toHaveBeenCalledWith(
      { organizationId: 'org-1', isSuperAdmin: false },
      { actorUserId: 'user-1', action: 'password.changed', entityType: 'user', entityId: 'user-1' },
    );
  });
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `cd apps/api && npx jest users.service.spec.ts`
Expected: FAIL — `service.changePassword is not a function`.

- [ ] **Step 3: Write `ChangePasswordDto`**

Create `apps/api/src/users/dto/change-password.dto.ts`:

```typescript
import { IsString, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  currentPassword!: string;

  @IsString()
  @MinLength(8)
  newPassword!: string;
}
```

- [ ] **Step 4: Implement `changePassword`**

In `apps/api/src/users/users.service.ts`:

Update the imports at the top of the file:

```typescript
import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import * as argon2 from 'argon2';
import { TenantPrismaService } from '@exam-platform/shared';
import { TenantContext } from '@exam-platform/shared';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { AuditService } from '@exam-platform/shared';
```

Update the constructor to inject `JwtService`:

```typescript
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly audit: AuditService,
    private readonly jwt: JwtService,
  ) {}
```

Add the method below `updateMe`:

```typescript
  async changePassword(
    context: TenantContext,
    userId: string,
    dto: ChangePasswordDto,
    currentRefreshToken: string | undefined,
  ): Promise<void> {
    const user = await this.tenantPrisma.forTenant(context, (tx) =>
      tx.user.findUniqueOrThrow({ where: { id: userId } }),
    );

    if (!(await argon2.verify(user.passwordHash, dto.currentPassword))) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const passwordHash = await argon2.hash(dto.newPassword);

    // Preserve the session making this request: decode its own refresh-token
    // family so the revoke-others write below can exclude it. A voluntary
    // in-session password change shouldn't log the requester out, unlike the
    // forgot-password reset flow (which has no "current session" to keep).
    let currentFamilyId: string | null = null;
    if (currentRefreshToken) {
      try {
        const payload = this.jwt.verify<{ sub: string; familyId: string }>(currentRefreshToken, {
          secret: process.env.JWT_REFRESH_SECRET,
        });
        currentFamilyId = payload.familyId;
      } catch {
        currentFamilyId = null;
      }
    }

    await this.tenantPrisma.forTenant(context, async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { passwordHash } });
      await tx.refreshToken.updateMany({
        where: {
          userId,
          revokedAt: null,
          ...(currentFamilyId ? { familyId: { not: currentFamilyId } } : {}),
        },
        data: { revokedAt: new Date() },
      });
    });

    await this.audit.record(context, {
      actorUserId: userId,
      action: 'password.changed',
      entityType: 'user',
      entityId: userId,
    });
  }
```

- [ ] **Step 5: Run the tests and verify they pass**

Run: `cd apps/api && npx jest users.service.spec.ts`
Expected: PASS, 8/8 tests.

- [ ] **Step 6: Wire `JwtModule` into `UsersModule`**

Replace `apps/api/src/users/users.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { AuditModule } from '@exam-platform/shared';

@Module({
  imports: [JwtModule.register({}), AuditModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
```

(`JwtModule.register({})` mirrors `AuthModule`'s own registration — the secret is passed per-call via `process.env.JWT_REFRESH_SECRET`, not module-level config, so this is a second independent registration, not a conflict.)

- [ ] **Step 7: Wire the route**

In `apps/api/src/users/users.controller.ts`, add the route. Update the imports:

```typescript
import { Body, Controller, Get, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
```

Add below `updateMe`:

```typescript
  @Post('me/change-password')
  changePassword(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUserId() userId: string,
    @Body() dto: ChangePasswordDto,
    @Req() req: Request,
  ) {
    return this.usersService.changePassword(tenant, userId, dto, req.cookies?.['refresh_token']);
  }
```

And import `ChangePasswordDto` at the top:

```typescript
import { ChangePasswordDto } from './dto/change-password.dto';
```

- [ ] **Step 8: Run `tsc --noEmit`**

Run: `cd apps/api && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/users/dto/change-password.dto.ts apps/api/src/users/users.service.ts apps/api/src/users/users.controller.ts apps/api/src/users/users.module.ts apps/api/src/users/users.service.spec.ts
git commit -m "feat: add POST /users/me/change-password with other-session revocation"
```

---

### Task 4: Frontend — `useCurrentUser` hook + sidebar wiring

**Files:**
- Modify: `apps/web/lib/types.ts` (add `name` to `StaffUser`)
- Create: `apps/web/lib/hooks/useCurrentUser.ts`
- Modify: `apps/web/app/(recruiter)/layout.tsx`
- Modify: `apps/web/app/(org-admin)/layout.tsx`
- Modify: `apps/web/app/(panel)/layout.tsx`
- Test: `apps/web/app/(recruiter)/layout.test.tsx`, `apps/web/app/(org-admin)/layout.test.tsx`, `apps/web/app/(panel)/layout.test.tsx`

**Interfaces:**
- Consumes: `apiFetch` (`apps/web/lib/api-client.ts`), `useAuth()` (`apps/web/lib/auth-context.tsx`), `GET /users/me` / `PATCH /users/me` from Task 2.
- Produces: `useCurrentUser(): UseQueryResult<StaffUser>`, `useUpdateProfile(): UseMutationResult<StaffUser, Error, { name: string }>` — Task 5 consumes both by these exact names.

- [ ] **Step 1: Add `name` to `StaffUser`**

In `apps/web/lib/types.ts`, update the interface:

```typescript
export interface StaffUser {
  id: string;
  organizationId: string | null;
  email: string;
  name: string | null;
  role: string;
  status: string;
  lastLoginAt: string | null;
  createdAt: string;
}
```

- [ ] **Step 2: Write the failing test for `useCurrentUser`**

Create `apps/web/lib/hooks/useCurrentUser.test.tsx`:

```tsx
import { renderHook, waitFor } from '@testing-library/react';
import { QueryProvider } from '../query-provider';
import { AuthProvider } from '../auth-context';
import { useCurrentUser } from './useCurrentUser';
import { fakeJwt } from '../test-utils/fake-jwt';

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      <AuthProvider>{children}</AuthProvider>
    </QueryProvider>
  );
}

describe('useCurrentUser', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('fetches the current user from /users/me', async () => {
    const token = fakeJwt({ sub: 'u1', organizationId: 'org1', role: 'recruiter' });
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: token }), { status: 200 });
      }
      if (String(url).endsWith('/users/me')) {
        return new Response(
          JSON.stringify({ id: 'u1', email: 'a@b.com', name: 'Jane Recruiter', role: 'recruiter' }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    const { result } = renderHook(() => useCurrentUser(), { wrapper });

    await waitFor(() => expect(result.current.data?.name).toBe('Jane Recruiter'));
  });
});
```

- [ ] **Step 3: Run the test and verify it fails**

Run: `cd apps/web && npx jest useCurrentUser.test.tsx`
Expected: FAIL — `Cannot find module './useCurrentUser'`.

- [ ] **Step 4: Implement `useCurrentUser.ts`**

Create `apps/web/lib/hooks/useCurrentUser.ts`:

```typescript
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { StaffUser } from '../types';
import { useAuth } from '../auth-context';

export function useCurrentUser() {
  const { accessToken } = useAuth();
  return useQuery<StaffUser>({
    queryKey: ['currentUser'],
    queryFn: () => apiFetch('/users/me', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}

interface UpdateProfileInput {
  name: string;
}

export function useUpdateProfile() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateProfileInput): Promise<StaffUser> =>
      apiFetch('/users/me', { method: 'PATCH', body: JSON.stringify(input) }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['currentUser'] }),
  });
}
```

- [ ] **Step 5: Run the test and verify it passes**

Run: `cd apps/web && npx jest useCurrentUser.test.tsx`
Expected: PASS.

- [ ] **Step 6: Wire the recruiter layout**

In `apps/web/app/(recruiter)/layout.tsx`:

Add the import:

```typescript
import { useCurrentUser } from '../../lib/hooks/useCurrentUser';
```

Add the hook call right after the `useBranding` line:

```typescript
  const { data: currentUser } = useCurrentUser();
```

Replace the fallback-name block:

```typescript
  // Real name from useCurrentUser() once loaded; falls back to a per-role
  // placeholder only while loading or if the user has never set one.
  const displayName = currentUser?.name || 'Recruiter';
  const initials = displayName
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
```

Replace the footer identity block (keep the sibling logout `<button>` exactly as-is):

```tsx
        <div className="flex items-center justify-between gap-2 border-t border-recruiter-border px-3.5 py-3">
          <Link
            href="/profile"
            className="flex min-w-0 items-center gap-2 rounded-md px-1 py-0.5 hover:bg-recruiter-bg-subtle"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-white">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-recruiter-text">{displayName}</p>
              <p className="text-[10.5px] text-recruiter-text-tertiary">Recruiter</p>
            </div>
          </Link>
          <button
            type="button"
            aria-label="Log out"
            onClick={handleLogout}
            className="shrink-0 rounded-md p-1.5 text-recruiter-text-tertiary hover:bg-recruiter-bg-subtle hover:text-recruiter-text"
          >
            <LogOut size={16} />
          </button>
        </div>
```

- [ ] **Step 7: Wire the org-admin layout**

Apply the identical change to `apps/web/app/(org-admin)/layout.tsx`: same import, same `useCurrentUser()` call, same `displayName`/`initials` block (fallback string `'Org Admin'` instead of `'Recruiter'`), same `<Link href="/profile">` wrapper (role label stays `Org Admin`).

- [ ] **Step 8: Wire the panel layout**

Apply the identical change to `apps/web/app/(panel)/layout.tsx`: same import, same `useCurrentUser()` call, fallback string `'Panel'`, same `<Link href="/profile">` wrapper (role label stays `Panel`, footer border/background classes stay `border-gray-200`/`text-gray-500` etc., matching this layout's existing gray palette rather than the recruiter/org-admin `recruiter-*` tokens).

- [ ] **Step 9: Write the failing display-name test (recruiter)**

Add to `apps/web/app/(recruiter)/layout.test.tsx`, inside the existing `describe` block. First, update the `renderLayout` helper's mocked fetch to also answer `/users/me`:

```typescript
function renderLayout({ pathname = '/dashboard', userName = null }: { pathname?: string; userName?: string | null } = {}) {
  mockPathname = pathname;
  global.fetch = jest.fn(async (url) => {
    if (String(url).endsWith('/auth/refresh')) {
      return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
    }
    if (String(url).endsWith('/users/me')) {
      return new Response(JSON.stringify({ id: 'u1', email: 'a@b.com', name: userName, role: 'recruiter' }), {
        status: 200,
      });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  }) as unknown as typeof fetch;

  return render(
    <QueryProvider>
      <AuthProvider>
        <RecruiterLayout>
          <p>Page content</p>
        </RecruiterLayout>
      </AuthProvider>
    </QueryProvider>,
  );
}
```

(This replaces the existing `renderLayout` helper — same signature plus the new optional `userName` param and the `/users/me` branch.)

Then add two new tests:

```typescript
  it('renders the real name from /users/me when one is set', async () => {
    renderLayout({ userName: 'Jane Recruiter' });
    expect(await screen.findByText('Jane Recruiter')).toBeInTheDocument();
  });

  it('links the avatar/name block to /profile', async () => {
    renderLayout();
    const profileLink = await screen.findByRole('link', { name: /Recruiter/i });
    expect(profileLink).toHaveAttribute('href', '/profile');
  });
```

- [ ] **Step 10: Run the recruiter layout tests and verify the new ones fail, old ones still pass**

Run: `cd apps/web && npx jest --testPathPattern "recruiter.*layout.test"`
Expected: the two new tests FAIL (no `/profile` link exists yet, no real name rendered yet); the 4 pre-existing tests still PASS.

- [ ] **Step 11: Run the recruiter layout tests again after Step 6's edit**

Run: `cd apps/web && npx jest --testPathPattern "recruiter.*layout.test"`
Expected: PASS, 6/6.

- [ ] **Step 12: Mirror the same two tests for org-admin and panel**

In `apps/web/app/(org-admin)/layout.test.tsx`, add (mirroring the org-admin file's existing per-test inline-mock style, not a shared helper):

```typescript
  it('renders the real name from /users/me when one is set', async () => {
    const orgAdminToken = fakeJwt({ sub: 'u1', organizationId: 'org1', role: 'org_admin' });
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: orgAdminToken }), { status: 200 });
      }
      if (String(url).endsWith('/users/me')) {
        return new Response(JSON.stringify({ id: 'u1', email: 'a@b.com', name: 'Jane Admin', role: 'org_admin' }), {
          status: 200,
        });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    render(
      <QueryProvider>
        <AuthProvider>
          <OrgAdminLayout>
            <p>Page content</p>
          </OrgAdminLayout>
        </AuthProvider>
      </QueryProvider>,
    );

    expect(await screen.findByText('Jane Admin')).toBeInTheDocument();
  });

  it('links the avatar/name block to /profile', async () => {
    const orgAdminToken = fakeJwt({ sub: 'u1', organizationId: 'org1', role: 'org_admin' });
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: orgAdminToken }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    render(
      <QueryProvider>
        <AuthProvider>
          <OrgAdminLayout>
            <p>Page content</p>
          </OrgAdminLayout>
        </AuthProvider>
      </QueryProvider>,
    );

    const profileLink = await screen.findByRole('link', { name: /Org Admin/i });
    expect(profileLink).toHaveAttribute('href', '/profile');
  });
```

In `apps/web/app/(panel)/layout.test.tsx`, add the same two tests using `PanelLayout`, role `'panel'`, name `'Jane Panel'`, and link-name matcher `/Panel/i`.

- [ ] **Step 13: Run the full frontend layout test suite**

Run: `cd apps/web && npx jest --testPathPattern "layout.test"`
Expected: PASS, all suites (recruiter 6, org-admin 5, panel 5).

- [ ] **Step 14: Commit**

```bash
git add apps/web/lib/types.ts apps/web/lib/hooks/useCurrentUser.ts apps/web/lib/hooks/useCurrentUser.test.tsx apps/web/app/\(recruiter\)/layout.tsx apps/web/app/\(recruiter\)/layout.test.tsx apps/web/app/\(org-admin\)/layout.tsx apps/web/app/\(org-admin\)/layout.test.tsx apps/web/app/\(panel\)/layout.tsx apps/web/app/\(panel\)/layout.test.tsx
git commit -m "feat: fetch real display name via useCurrentUser, link sidebar avatar to /profile"
```

---

### Task 5: Frontend — `<ProfileForm>` and the three profile pages

**Files:**
- Create: `apps/web/components/ProfileForm.tsx`
- Modify: `apps/web/lib/hooks/useCurrentUser.ts` (add `useChangePassword`)
- Create: `apps/web/app/(recruiter)/profile/page.tsx`
- Create: `apps/web/app/(org-admin)/profile/page.tsx`
- Create: `apps/web/app/(panel)/profile/page.tsx`
- Test: `apps/web/components/ProfileForm.test.tsx`

**Interfaces:**
- Consumes: `useCurrentUser`, `useUpdateProfile` (Task 4); `Button`, `Input`, `Card`, `useToast` from `apps/web/components/ui`.
- Produces: `ProfileForm` (default export from `apps/web/components/ProfileForm.tsx`), rendered with no props.

- [ ] **Step 1: Add `useChangePassword` to the hooks file**

Append to `apps/web/lib/hooks/useCurrentUser.ts`:

```typescript
interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

export function useChangePassword() {
  const { accessToken } = useAuth();
  return useMutation({
    mutationFn: (input: ChangePasswordInput) =>
      apiFetch(
        '/users/me/change-password',
        { method: 'POST', body: JSON.stringify(input) },
        accessToken ?? undefined,
      ),
  });
}
```

- [ ] **Step 2: Write the failing tests for `ProfileForm`**

Create `apps/web/components/ProfileForm.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProfileForm } from './ProfileForm';
import { AuthProvider } from '../lib/auth-context';
import { QueryProvider } from '../lib/query-provider';
import { fakeJwt } from '../lib/test-utils/fake-jwt';

function renderProfileForm() {
  const token = fakeJwt({ sub: 'u1', organizationId: 'org1', role: 'recruiter' });
  global.fetch = jest.fn(async (url, options) => {
    if (String(url).endsWith('/auth/refresh')) {
      return new Response(JSON.stringify({ accessToken: token }), { status: 200 });
    }
    if (String(url).endsWith('/users/me') && (!options || options.method === undefined)) {
      return new Response(
        JSON.stringify({ id: 'u1', email: 'jane@demo-org.test', name: 'Jane Recruiter', role: 'recruiter' }),
        { status: 200 },
      );
    }
    if (String(url).endsWith('/users/me') && options?.method === 'PATCH') {
      return new Response(
        JSON.stringify({ id: 'u1', email: 'jane@demo-org.test', name: 'New Name', role: 'recruiter' }),
        { status: 200 },
      );
    }
    if (String(url).endsWith('/users/me/change-password')) {
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  }) as unknown as typeof fetch;

  return render(
    <QueryProvider>
      <AuthProvider>
        <ProfileForm />
      </AuthProvider>
    </QueryProvider>,
  );
}

describe('ProfileForm', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('shows the read-only email and role, and the current display name', async () => {
    renderProfileForm();
    expect(await screen.findByDisplayValue('Jane Recruiter')).toBeInTheDocument();
    expect(screen.getByDisplayValue('jane@demo-org.test')).toBeInTheDocument();
    expect(screen.getByDisplayValue('recruiter')).toBeInTheDocument();
  });

  it('disables Save name until the current user has loaded', async () => {
    renderProfileForm();
    const saveButton = screen.getByRole('button', { name: 'Save name' });
    expect(saveButton).toBeDisabled();
    await waitFor(() => expect(saveButton).not.toBeDisabled());
  });

  it('submits the new name via PATCH /users/me', async () => {
    renderProfileForm();
    const nameInput = await screen.findByDisplayValue('Jane Recruiter');
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'New Name');
    await userEvent.click(screen.getByRole('button', { name: 'Save name' }));

    await waitFor(() => {
      const patchCall = (global.fetch as jest.Mock).mock.calls.find(
        ([url, options]) => String(url).endsWith('/users/me') && options?.method === 'PATCH',
      );
      expect(patchCall).toBeDefined();
      expect(JSON.parse(patchCall[1].body)).toEqual({ name: 'New Name' });
    });
  });

  it('submits current and new password via POST /users/me/change-password', async () => {
    renderProfileForm();
    await screen.findByDisplayValue('Jane Recruiter');
    await userEvent.type(screen.getByLabelText('Current password'), 'OldPassw0rd!');
    await userEvent.type(screen.getByLabelText('New password'), 'NewPassw0rd!');
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'NewPassw0rd!');
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }));

    await waitFor(() => {
      const changeCall = (global.fetch as jest.Mock).mock.calls.find(([url]) =>
        String(url).endsWith('/users/me/change-password'),
      );
      expect(changeCall).toBeDefined();
      expect(JSON.parse(changeCall[1].body)).toEqual({
        currentPassword: 'OldPassw0rd!',
        newPassword: 'NewPassw0rd!',
      });
    });
  });

  it('disables Change password until the two new-password fields match', async () => {
    renderProfileForm();
    await screen.findByDisplayValue('Jane Recruiter');
    await userEvent.type(screen.getByLabelText('Current password'), 'OldPassw0rd!');
    await userEvent.type(screen.getByLabelText('New password'), 'NewPassw0rd!');
    expect(screen.getByRole('button', { name: 'Change password' })).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'Mismatch!');
    expect(screen.getByRole('button', { name: 'Change password' })).toBeDisabled();
  });
});
```

- [ ] **Step 3: Run the tests and verify they fail**

Run: `cd apps/web && npx jest ProfileForm.test.tsx`
Expected: FAIL — `Cannot find module './ProfileForm'`.

- [ ] **Step 4: Implement `ProfileForm`**

Create `apps/web/components/ProfileForm.tsx`:

```tsx
'use client';

import { useState, useEffect } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useCurrentUser, useUpdateProfile, useChangePassword } from '../lib/hooks/useCurrentUser';
import { useAuth } from '../lib/auth-context';
import { Button, Input, Card, useToast } from './ui';

export function ProfileForm() {
  const { organizationSlug } = useAuth();
  const { data: user } = useCurrentUser();
  const updateProfile = useUpdateProfile();
  const changePassword = useChangePassword();
  const { toast } = useToast();

  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  useEffect(() => {
    if (user?.name) setName(user.name);
  }, [user]);

  function handleNameSubmit(e: React.FormEvent) {
    e.preventDefault();
    setNameError(null);
    updateProfile.mutate(
      { name },
      {
        onSuccess: () => toast('Name updated.'),
        onError: (err) => setNameError(err instanceof Error ? err.message : 'Failed to update name'),
      },
    );
  }

  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword;

  function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError(null);
    changePassword.mutate(
      { currentPassword, newPassword },
      {
        onSuccess: () => {
          toast('Password changed. Other sessions have been signed out.');
          setCurrentPassword('');
          setNewPassword('');
          setConfirmPassword('');
        },
        onError: (err) => setPasswordError(err instanceof Error ? err.message : 'Failed to change password'),
      },
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="max-w-md">
        <h1 className="mb-4 text-xl font-semibold text-recruiter-text">My Profile</h1>
        {!user && <p className="mb-4 text-sm text-recruiter-text-secondary">Loading…</p>}
        <form onSubmit={handleNameSubmit} className="mb-4 flex flex-col gap-3">
          <Input label="Display name" value={name} onChange={setName} disabled={!user} />
          <Input label="Email" value={user?.email ?? ''} onChange={() => {}} disabled readOnly />
          <Input label="Role" value={user?.role ?? ''} onChange={() => {}} disabled readOnly />
          <Input label="Organization" value={organizationSlug ?? ''} onChange={() => {}} disabled readOnly />
          <Button type="submit" disabled={!user || name.trim().length === 0}>
            Save name
          </Button>
        </form>
        {nameError && (
          <p role="alert" className="mt-3 text-sm text-status-danger">
            {nameError}
          </p>
        )}
      </Card>

      <Card className="max-w-md">
        <h2 className="mb-4 text-lg font-semibold text-recruiter-text">Change password</h2>
        <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-3">
          <Input
            label="Current password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            value={currentPassword}
            onChange={setCurrentPassword}
            required
          />
          <div className="relative">
            <Input
              label="New password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              value={newPassword}
              onChange={setNewPassword}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? 'Hide characters' : 'Show characters'}
              className="absolute bottom-2 right-3 text-gray-400 hover:text-gray-600"
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <Input
            label="Confirm new password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            value={confirmPassword}
            onChange={setConfirmPassword}
            required
          />
          <Button type="submit" disabled={!passwordsMatch || currentPassword.length === 0}>
            Change password
          </Button>
          {!passwordsMatch && confirmPassword.length > 0 && (
            <p className="text-xs text-recruiter-text-tertiary">Passwords must match.</p>
          )}
        </form>
        {passwordError && (
          <p role="alert" className="mt-3 text-sm text-status-danger">
            {passwordError}
          </p>
        )}
      </Card>
    </div>
  );
}
```

- [ ] **Step 5: Run the tests and verify they pass**

Run: `cd apps/web && npx jest ProfileForm.test.tsx`
Expected: PASS, 5/5.

- [ ] **Step 6: Create the three thin page files**

Create `apps/web/app/(recruiter)/profile/page.tsx`:

```tsx
import { ProfileForm } from '../../../components/ProfileForm';

export default function RecruiterProfilePage() {
  return <ProfileForm />;
}
```

Create `apps/web/app/(org-admin)/profile/page.tsx`:

```tsx
import { ProfileForm } from '../../../components/ProfileForm';

export default function OrgAdminProfilePage() {
  return <ProfileForm />;
}
```

Create `apps/web/app/(panel)/profile/page.tsx`:

```tsx
import { ProfileForm } from '../../../components/ProfileForm';

export default function PanelProfilePage() {
  return <ProfileForm />;
}
```

- [ ] **Step 7: Run `tsc --noEmit`**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no new errors from the 3 new page files or `ProfileForm.tsx`.

- [ ] **Step 8: Commit**

```bash
git add apps/web/lib/hooks/useCurrentUser.ts apps/web/components/ProfileForm.tsx apps/web/components/ProfileForm.test.tsx apps/web/app/\(recruiter\)/profile apps/web/app/\(org-admin\)/profile apps/web/app/\(panel\)/profile
git commit -m "feat: add My Profile page (name edit, change password) for all 3 staff roles"
```

---

### Task 6: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full backend test suite**

Run: `cd apps/api && npx jest`
Expected: all suites pass, including the 4 new/updated tests in `users.service.spec.ts` (8 total in that file).

- [ ] **Step 2: Run backend typecheck**

Run: `cd apps/api && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Run the full frontend test suite**

Run: `cd apps/web && npx jest`
Expected: all suites pass, including the new `useCurrentUser.test.tsx` and `ProfileForm.test.tsx`, and the updated layout test files.

- [ ] **Step 4: Run frontend typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no new errors beyond the pre-existing, already-documented fetch-mock-tuple-indexing errors in unrelated test files (`forgot-password`, `login`, `reset-password` page tests — same class noted in the Forgot Password feature's own final verification).

- [ ] **Step 5: Manual verification in the browser**

Start the API and web dev servers, log in as each of the 3 seeded roles (`admin@demo-org.test` / `DevAdmin123!` for org_admin, `panel@demo-org.test` / `Passw0rd!2026` for panel; recruiter's seeded password may have drifted from prior live-testing this session — use whichever currently works, or skip and rely on that role's automated coverage same as the logout-button feature's final verification did), and for each:
1. Confirm the sidebar shows the per-role hardcoded fallback name (since no `name` has been set yet for these seed accounts) — this proves the fallback path still works.
2. Click the avatar/name block, confirm it navigates to `/profile`.
3. Confirm the profile page shows the correct read-only email and role, and an empty (or fallback-driven) display name field.
4. Type a display name, click "Save name", confirm a success toast appears, then navigate back to any other page in that shell and confirm the sidebar now shows the real name instead of the hardcoded fallback — this proves the `useCurrentUser` cache invalidation on save actually propagates to the sidebar, not just the profile page's own local state.
5. Attempt "Change password" with a wrong current password, confirm an error message appears and the password is unchanged (re-login with the old password still works).
6. Change the password correctly, confirm the success toast mentions other sessions being signed out, then confirm via a second browser tab/session (if one was logged in before the change) that it is now logged out on its next request — mirroring the exact revocation check the Forgot Password feature's final verification already performed for its own reset flow.
7. Confirm the *current* tab/session (the one that made the change-password request) is still logged in — proving the "exclude my own session" logic works, not just "revoke everything."

- [ ] **Step 6: Commit if any fixes were needed**

Only if Steps 1-5 surfaced a bug requiring a code change. If everything passed as implemented, there is nothing to commit here.
