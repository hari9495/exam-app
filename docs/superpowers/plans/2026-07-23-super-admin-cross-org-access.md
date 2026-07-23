# Super Admin Cross-Org Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let `super_admin` switch into any single organization and, while inside it, operate with the combined powers of that org's recruiter + org_admin + panel roles through the existing screens unmodified, plus a new platform-wide read-only user directory.

**Architecture:** A new pair of endpoints mint/exit a short-lived, org-scoped "acting" access token carrying an `actingSuperAdmin: true` claim; `PermissionsGuard` short-circuits to allow-all when that claim is present, so every existing controller's `@RequirePermissions` decorator needs no change. The three staff frontend route-group layouts get one extra allowed condition in their role gate, plus a shared banner and cross-shell nav links, so every existing page renders completely unmodified.

**Tech Stack:** NestJS (`apps/api`), `@nestjs/jwt`, Prisma + SQL Server RLS (`packages/shared`), Next.js App Router (`apps/web`), React Testing Library, Jest, Playwright.

## Global Constraints

- No new permanent RBAC permission rows. Elevation is a session-scoped JWT claim (`actingSuperAdmin: true`) plus one guard short-circuit — never a `RolePermission` table grant.
- The acting token's `organizationId` claim is the only mechanism used to scope requests. No new header-based scoping, no per-request "act as org" body/query parameter.
- Existing recruiter/org-admin/panel pages are reused completely unmodified — only their layout's role-gate `useEffect`/render condition changes, never the page components beneath them.
- The platform-wide user directory is read-only. It deep-links into switch-in + the existing org_admin Users screen for edits — no new cross-org write/edit endpoints.
- Every switch-in and switch-out writes an audit log entry via the existing `AuditService.record(...)` pattern (see `apps/api/src/auth/auth.service.ts`'s `login.success` entry for the exact call shape).
- The switch-in/switch-out flow never touches the refresh-token httpOnly cookie — only a new access token is minted or discarded. The underlying real `super_admin` session is untouched by switching in or out.
- Acting tokens use the same TTL as normal access tokens (`ACCESS_TOKEN_TTL_SECONDS`, default 900s) — no separate expiry configuration.

---

### Task 1: Backend — acting-token minting, permission bypass, audit trail

**Files:**
- Modify: `apps/api/src/auth/jwt.strategy.ts`
- Modify: `apps/api/src/rbac/permissions.guard.ts`
- Modify: `apps/api/src/auth/auth.service.ts`
- Modify: `apps/api/src/auth/auth.controller.ts`
- Test: `apps/api/src/auth/auth.service.spec.ts`
- Test: `apps/api/src/rbac/permissions.guard.spec.ts`

**Interfaces:**
- Consumes: `AuditService.record(context: TenantContext, entry: AuditEntry)` (`@exam-platform/shared`), `PrismaService.organization.findUnique`, existing `JwtService` sign/verify config (`JWT_ACCESS_SECRET`, `ACCESS_TOKEN_TTL_SECONDS`).
- Produces: `AuthService.switchIntoOrg(actorUserId: string, targetOrgId: string): Promise<string>` (returns the new access token), `AuthService.recordSwitchOut(actorUserId: string, exitedOrgId: string | null): Promise<void>`, JWT payload field `actingSuperAdmin?: boolean` and `actingOrgName?: string` — later tasks read these off the decoded token.

- [ ] **Step 1: Write the failing tests for `PermissionsGuard`'s new bypass**

Add to `apps/api/src/rbac/permissions.guard.spec.ts`, after the last existing `it(...)` block, before the closing `});`:

```typescript
  it('bypasses the permission check entirely when actingSuperAdmin is true, even for an unrelated permission', async () => {
    const reflector = { get: jest.fn().mockReturnValue(['candidate:manage']) } as unknown as Reflector;
    const prisma = { rolePermission: { findMany: jest.fn() } };
    const guard = new PermissionsGuard(reflector, prisma as any);

    const result = await guard.canActivate(mockContext({ role: 'super_admin', actingSuperAdmin: true }));
    expect(result).toBe(true);
    expect(prisma.rolePermission.findMany).not.toHaveBeenCalled();
  });

  it('still enforces the normal permission table for a super_admin session that is not acting', async () => {
    const reflector = { get: jest.fn().mockReturnValue(['candidate:manage']) } as unknown as Reflector;
    const prisma = { rolePermission: { findMany: jest.fn().mockResolvedValue([]) } };
    const guard = new PermissionsGuard(reflector, prisma as any);

    await expect(guard.canActivate(mockContext({ role: 'super_admin' }))).rejects.toThrow(ForbiddenException);
  });
```

- [ ] **Step 2: Run the guard tests to verify they fail**

Run: `cd "D:\exam app\apps\api" && npx jest --clearCache && npx jest rbac/permissions.guard.spec --no-cache`
Expected: FAIL — the first new test's `result` is currently computed from `rolePermission.findMany`, so `expect(result).toBe(true)` fails (grants is empty, guard throws before returning), and `findMany` IS called (contradicting the `not.toHaveBeenCalled()` assertion in the same test).

- [ ] **Step 3: Implement the guard bypass**

In `apps/api/src/rbac/permissions.guard.ts`, replace the body of `canActivate` from the `const request = ...` line through the `if (!user)` check:

```typescript
    const request = context.switchToHttp().getRequest();
    const user = request.user as { role: string; actingSuperAdmin?: boolean } | undefined;
    if (!user) {
      throw new ForbiddenException('Not authenticated');
    }
    if (user.actingSuperAdmin) {
      return true;
    }
```

(Everything below this, from `const allKeys = ...` onward, is unchanged.)

- [ ] **Step 4: Run the guard tests to verify they pass**

Run: `cd "D:\exam app\apps\api" && npx jest rbac/permissions.guard.spec --no-cache`
Expected: all tests pass (7/7 — the 5 pre-existing plus the 2 new ones).

- [ ] **Step 5: Widen `JwtPayload` and pass the new claims through `JwtStrategy`**

In `apps/api/src/auth/jwt.strategy.ts`, replace the `JwtPayload` interface and `validate` method:

```typescript
export interface JwtPayload {
  sub: string;
  organizationId: string | null;
  role: string;
  actingSuperAdmin?: boolean;
  actingOrgName?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_ACCESS_SECRET!,
    });
  }

  validate(payload: JwtPayload) {
    return {
      userId: payload.sub,
      organizationId: payload.organizationId,
      role: payload.role,
      actingSuperAdmin: payload.actingSuperAdmin ?? false,
    };
  }
}
```

(`actingOrgName` is carried on the JWT for the frontend to decode directly — the backend's `request.user` never needs to read it, only `PermissionsGuard` and `CurrentTenant` care about `role`/`organizationId`/`actingSuperAdmin`, so it's deliberately left off the `validate()` return value.)

- [ ] **Step 6: Write the failing tests for `AuthService.switchIntoOrg` / `recordSwitchOut`**

Add to `apps/api/src/auth/auth.service.spec.ts`, after the last existing `it(...)` block inside the `describe('AuthService', ...)`, before its closing `});`:

```typescript
  describe('switchIntoOrg', () => {
    it('throws when the target org does not exist', async () => {
      prisma.organization.findUnique.mockResolvedValue(null);

      await expect(service.switchIntoOrg('super-admin-1', 'no-such-org')).rejects.toThrow(NotFoundException);
    });

    it('audit-logs the switch-in against the target org and returns an acting access token', async () => {
      prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', name: 'Acme Inc' });

      const token = await service.switchIntoOrg('super-admin-1', 'org-1');

      expect(audit.record).toHaveBeenCalledWith(
        { organizationId: 'org-1', isSuperAdmin: true },
        { actorUserId: 'super-admin-1', action: 'super_admin.org_switch_in', entityType: 'organization', entityId: 'org-1' },
      );
      const payload = jwt.verify(token, { secret: 'test-secret' }) as {
        sub: string; organizationId: string; role: string; actingSuperAdmin: boolean; actingOrgName: string;
      };
      expect(payload).toMatchObject({
        sub: 'super-admin-1', organizationId: 'org-1', role: 'super_admin', actingSuperAdmin: true, actingOrgName: 'Acme Inc',
      });
    });
  });

  describe('recordSwitchOut', () => {
    it('is a no-op when there is no org to exit', async () => {
      await service.recordSwitchOut('super-admin-1', null);

      expect(audit.record).not.toHaveBeenCalled();
    });

    it('audit-logs the switch-out against the exited org', async () => {
      await service.recordSwitchOut('super-admin-1', 'org-1');

      expect(audit.record).toHaveBeenCalledWith(
        { organizationId: 'org-1', isSuperAdmin: true },
        { actorUserId: 'super-admin-1', action: 'super_admin.org_switch_out', entityType: 'organization', entityId: 'org-1' },
      );
    });
  });
```

Add `NotFoundException` to the existing `@nestjs/common` import at the top of the file:

```typescript
import { UnauthorizedException, NotFoundException } from '@nestjs/common';
```

- [ ] **Step 7: Run the new tests to verify they fail**

Run: `cd "D:\exam app\apps\api" && npx jest --clearCache && npx jest auth/auth.service.spec --no-cache`
Expected: FAIL with `service.switchIntoOrg is not a function` and `service.recordSwitchOut is not a function`.

- [ ] **Step 8: Implement `switchIntoOrg` / `recordSwitchOut`, refactoring the shared access-token signing**

In `apps/api/src/auth/auth.service.ts`, add `NotFoundException` to the `@nestjs/common` import:

```typescript
import { BadRequestException, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
```

Replace `private async issueTokenPair(...)` with a version that extracts access-token signing into a reusable private method, and add the two new public methods directly above it:

```typescript
  async switchIntoOrg(actorUserId: string, targetOrgId: string): Promise<string> {
    const org = await this.prisma.organization.findUnique({ where: { id: targetOrgId } });
    if (!org) {
      throw new NotFoundException(`Organization ${targetOrgId} not found`);
    }

    await this.audit.record(
      { organizationId: targetOrgId, isSuperAdmin: true },
      { actorUserId, action: 'super_admin.org_switch_in', entityType: 'organization', entityId: targetOrgId },
    );

    return this.signAccessToken({
      sub: actorUserId,
      organizationId: targetOrgId,
      role: 'super_admin',
      actingSuperAdmin: true,
      actingOrgName: org.name,
    });
  }

  async recordSwitchOut(actorUserId: string, exitedOrgId: string | null): Promise<void> {
    if (!exitedOrgId) {
      return;
    }
    await this.audit.record(
      { organizationId: exitedOrgId, isSuperAdmin: true },
      { actorUserId, action: 'super_admin.org_switch_out', entityType: 'organization', entityId: exitedOrgId },
    );
  }

  private signAccessToken(payload: {
    sub: string;
    organizationId: string | null;
    role: string;
    actingSuperAdmin?: boolean;
    actingOrgName?: string;
  }): string {
    return this.jwt.sign(payload, {
      secret: process.env.JWT_ACCESS_SECRET,
      expiresIn: `${process.env.ACCESS_TOKEN_TTL_SECONDS ?? 900}s` as `${number}s`,
    });
  }

  private async issueTokenPair(
    userId: string,
    organizationId: string | null,
    role: string,
    familyId: string = randomUUID(),
  ): Promise<TokenPair> {
    const accessToken = this.signAccessToken({ sub: userId, organizationId, role });
    const refreshToken = this.jwt.sign(
      { sub: userId, familyId },
      { secret: process.env.JWT_REFRESH_SECRET, expiresIn: `${process.env.REFRESH_TOKEN_TTL_DAYS ?? 30}d` as `${number}d` },
    );
    const tokenHash = await argon2.hash(refreshToken);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + Number(process.env.REFRESH_TOKEN_TTL_DAYS ?? 30));

    await this.prisma.refreshToken.create({
      data: { userId, tokenHash, familyId, expiresAt },
    });

    return { accessToken, refreshToken };
  }
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `cd "D:\exam app\apps\api" && npx jest auth/auth.service.spec --no-cache`
Expected: all tests pass (pre-existing count plus 4 new).

- [ ] **Step 10: Add the two new HTTP routes**

In `apps/api/src/auth/auth.controller.ts`, add these imports:

```typescript
import { Body, Controller, HttpCode, Param, Post, Req, Res, UnauthorizedException, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentUserId } from './current-user-id.decorator';
```

(`Param` and `UseGuards` are new additions to the existing `@nestjs/common` import line; the four new imports below it are new lines.)

Add these two routes to the `AuthController` class, after the existing `logout` method, before the closing `}`:

```typescript
  @Post('super-admin/switch-into/:orgId')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('platform:manage_organizations')
  async switchIntoOrg(@CurrentUserId() userId: string, @Param('orgId') orgId: string) {
    const accessToken = await this.authService.switchIntoOrg(userId, orgId);
    return { accessToken };
  }

  @Post('super-admin/switch-out')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  async switchOutOfOrg(@CurrentUserId() userId: string, @Req() req: Request) {
    const user = req.user as { organizationId: string | null; actingSuperAdmin?: boolean };
    await this.authService.recordSwitchOut(userId, user.actingSuperAdmin ? user.organizationId : null);
    return { success: true };
  }
```

- [ ] **Step 11: Manually verify the routes are wired (backend e2e touches this in Task 6, but confirm the module boots first)**

Run: `cd "D:\exam app\apps\api" && npx tsc --noEmit -p tsconfig.json`
Expected: no new errors versus the pre-existing baseline.

- [ ] **Step 12: Commit**

```bash
git add apps/api/src/rbac/permissions.guard.ts apps/api/src/rbac/permissions.guard.spec.ts apps/api/src/auth/jwt.strategy.ts apps/api/src/auth/auth.service.ts apps/api/src/auth/auth.service.spec.ts apps/api/src/auth/auth.controller.ts
git commit -m "feat: super_admin switch-into/switch-out org endpoints with acting-token permission bypass"
```

---

### Task 2: Backend — platform-wide user directory endpoint

**Files:**
- Modify: `apps/api/src/users/users.service.ts`
- Modify: `apps/api/src/users/users.controller.ts`
- Test: `apps/api/src/users/users.service.spec.ts`

**Interfaces:**
- Consumes: `resolvePaginationParams`/`buildPaginatedResponse`/`PaginatedResponse` (`../common/paginated-response`), `SafeUser` type, `SAFE_USER_SELECT` (both already defined in `users.service.ts`), `TenantPrismaService.forTenant`.
- Produces: `UsersService.listDirectory(context: TenantContext, filters: { page?: string; pageSize?: string; search?: string }): Promise<PaginatedResponse<SafeUser & { organizationName: string | null }>>` — Task 5's frontend hook calls `GET /users/directory` which returns this shape.

- [ ] **Step 1: Write the failing test**

Add to `apps/api/src/users/users.service.spec.ts`, inside the top-level `describe('UsersService', ...)` block (match whatever mocking setup the file's existing `list` tests already use for `tenantPrisma.forTenant`/`tx.user.findMany`/`tx.user.count`):

```typescript
  describe('listDirectory', () => {
    it('queries across all organizations with no organizationId filter, and includes each user\'s org name', async () => {
      tx.user.findMany.mockResolvedValue([
        { id: 'u1', organizationId: 'org-1', email: 'a@acme.test', name: 'A', role: 'recruiter', status: 'active', lastLoginAt: null, createdAt: new Date(), organization: { name: 'Acme Inc' } },
        { id: 'u2', organizationId: null, email: 'b@platform.test', name: 'B', role: 'super_admin', status: 'active', lastLoginAt: null, createdAt: new Date(), organization: null },
      ]);
      tx.user.count.mockResolvedValue(2);

      const result = await service.listDirectory({ organizationId: null, isSuperAdmin: true }, {});

      expect(tx.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
      expect(result.data).toEqual([
        expect.objectContaining({ id: 'u1', organizationName: 'Acme Inc' }),
        expect.objectContaining({ id: 'u2', organizationName: null }),
      ]);
    });
  });
```

If the file's existing tests reference a `tx` mock object differently (e.g. as part of a `prisma` mock passed into `tenantPrisma.forTenant`'s callback rather than a standalone `tx` variable), adapt the test to that exact convention — read the file's existing `describe('list', ...)` block first and mirror its mock wiring precisely, since this new test must exercise the same `forTenant` plumbing.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd "D:\exam app\apps\api" && npx jest --clearCache && npx jest users/users.service.spec --no-cache`
Expected: FAIL with `service.listDirectory is not a function`.

- [ ] **Step 3: Implement `listDirectory`**

In `apps/api/src/users/users.service.ts`, add this method directly after the existing `async list(...)` method:

```typescript
  async listDirectory(
    context: TenantContext,
    filters: { page?: string; pageSize?: string; search?: string } = {},
  ): Promise<PaginatedResponse<SafeUser & { organizationName: string | null }>> {
    const { page, pageSize, skip, take } = resolvePaginationParams(filters.page, filters.pageSize);
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const where = filters.search ? { email: { contains: filters.search } } : {};
      const [users, total] = await Promise.all([
        tx.user.findMany({
          where,
          select: { ...SAFE_USER_SELECT, organization: { select: { name: true } } },
          orderBy: { createdAt: 'desc' },
          skip,
          take,
        }),
        tx.user.count({ where }),
      ]);
      const data = users.map(({ organization, ...user }) => ({
        ...user,
        organizationName: organization?.name ?? null,
      }));
      return buildPaginatedResponse(data, total, page, pageSize);
    });
  }
```

This deliberately has no `organizationId` filter in `where` — every other method in this file (`list`, etc.) filters by `context.organizationId`; this one intentionally doesn't, because it's only ever reachable via the `platform:manage_organizations` permission (real `super_admin`) or an acting session (guard bypass, `context.isSuperAdmin` still true), both of which the `is_super_admin` RLS bypass on `users` already covers regardless of the session's current org.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd "D:\exam app\apps\api" && npx jest users/users.service.spec --no-cache`
Expected: all tests pass (pre-existing count plus 1 new).

- [ ] **Step 5: Add the controller route**

In `apps/api/src/users/users.controller.ts`, add this route to `UsersController`, directly after the existing `list(...)` method:

```typescript
  @Get('directory')
  @RequirePermissions('platform:manage_organizations')
  listDirectory(
    @CurrentTenant() tenant: TenantContext,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('search') search?: string,
  ) {
    return this.usersService.listDirectory(tenant, { page, pageSize, search });
  }
```

Place it before the existing `@Get('super-admins')` route so `GET /users/directory` doesn't get shadowed by any broader path-matching (NestJS matches routes in declaration order within a controller; this repo's existing `GET /users/super-admins` already sits above the bare `GET /users/:id`-shaped routes for the same reason — though this controller has no `:id` route today, keep the more specific literal paths grouped together for readability).

- [ ] **Step 6: Run the full users test file and tsc to confirm no regressions**

Run: `cd "D:\exam app\apps\api" && npx jest users/ --no-cache && npx tsc --noEmit -p tsconfig.json`
Expected: all users tests pass; tsc shows no new errors.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/users/users.service.ts apps/api/src/users/users.service.spec.ts apps/api/src/users/users.controller.ts
git commit -m "feat: platform-wide user directory endpoint for super_admin"
```

---

### Task 3: Frontend — auth-context extension, switch-in/out, acting banner

**Files:**
- Modify: `apps/web/lib/auth-context.tsx`
- Create: `apps/web/components/SuperAdminActingBanner.tsx`
- Modify: `apps/web/app/layout.tsx`
- Test: `apps/web/lib/auth-context.test.tsx`
- Test: `apps/web/components/SuperAdminActingBanner.test.tsx`

**Interfaces:**
- Consumes: `POST /auth/super-admin/switch-into/:orgId` → `{ accessToken: string }`, `POST /auth/super-admin/switch-out` → `{ success: true }` (both from Task 1), `decodeJwtPayload` (`apps/web/lib/jwt.ts`).
- Produces: `useAuth()` gains `actingSuperAdmin: boolean`, `actingOrgName: string | null`, `switchIntoOrg: (orgId: string) => Promise<void>`, `switchOutOfOrg: () => Promise<void>` — Tasks 4 and 5 consume all four.

- [ ] **Step 1: Write the failing tests**

Read `apps/web/lib/auth-context.test.tsx` in full first to match its exact existing mock/render conventions (how it mocks `apiFetch`, wraps `AuthProvider`, and asserts on `useAuth()`'s returned value via a test consumer component). Add these test cases, following that same pattern:

```tsx
  it('decodes actingSuperAdmin and actingOrgName off the access token after switchIntoOrg', async () => {
    // Arrange: same login-then-assert pattern the file's existing tests use to get an
    // authenticated accessToken into context, then call switchIntoOrg and assert the new
    // token's claims are reflected in useAuth()'s actingSuperAdmin/actingOrgName fields.
    // Mock POST /auth/super-admin/switch-into/:orgId to resolve { accessToken: <a token
    // encoding { role: 'super_admin', actingSuperAdmin: true, actingOrgName: 'Acme Inc' }> }.
  });

  it('switchOutOfOrg calls the switch-out endpoint and restores a non-acting token via silent refresh', async () => {
    // Mock POST /auth/super-admin/switch-out to resolve { success: true }, and
    // POST /auth/refresh to resolve { accessToken: <a token with no actingSuperAdmin claim> }.
    // Assert switchOutOfOrg() results in actingSuperAdmin becoming false.
  });
```

Since this file's exact mocking helpers (how it constructs a fake JWT, how `apiFetch` is mocked, whether it uses a rendered test-consumer component or `renderHook`) aren't known until read, write the two tests' full bodies using whatever helper this file already exports/imports for building a fake token — reuse `apps/web/lib/test-utils/fake-jwt.ts`'s `fakeJwt()` if `auth-context.test.tsx` doesn't already have its own, matching the pattern seen in `apps/web/app/login/page.test.tsx` (`fakeJwt({ sub: 'u1', organizationId: 'org1', role: 'org_admin' })`) — extend that call with `actingSuperAdmin: true, actingOrgName: 'Acme Inc'` for the acting-token fixture.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd "D:\exam app\apps\web" && npx jest --clearCache && npx jest lib/auth-context.test --no-cache`
Expected: FAIL — `switchIntoOrg`/`switchOutOfOrg` don't exist on the context value yet, and `actingSuperAdmin`/`actingOrgName` are undefined.

- [ ] **Step 3: Implement the auth-context changes**

In `apps/web/lib/auth-context.tsx`, update the `AuthContextValue` interface:

```typescript
interface AuthContextValue {
  accessToken: string | null;
  organizationSlug: string | null;
  role: string | null;
  actingSuperAdmin: boolean;
  actingOrgName: string | null;
  isLoading: boolean;
  login: (organizationSlug: string, accessToken: string) => void;
  logout: () => Promise<void>;
  switchIntoOrg: (orgId: string) => Promise<void>;
  switchOutOfOrg: () => Promise<void>;
}
```

Add state and widen `applyToken` inside `AuthProvider`:

```typescript
  const [actingSuperAdmin, setActingSuperAdmin] = useState(false);
  const [actingOrgName, setActingOrgName] = useState<string | null>(null);

  function applyToken(token: string | null) {
    setAccessToken(token);
    const payload = token ? decodeJwtPayload(token) : null;
    setRole(payload && typeof payload.role === 'string' ? payload.role : null);
    setActingSuperAdmin(Boolean(payload?.actingSuperAdmin));
    setActingOrgName(payload && typeof payload.actingOrgName === 'string' ? payload.actingOrgName : null);
  }
```

Add the two new functions inside `AuthProvider`, after `logout`:

```typescript
  async function switchIntoOrg(orgId: string): Promise<void> {
    const result = await apiFetch(
      `/auth/super-admin/switch-into/${orgId}`,
      { method: 'POST', body: JSON.stringify({}) },
      accessTokenRef.current ?? undefined,
    );
    applyToken(result.accessToken);
  }

  async function switchOutOfOrg(): Promise<void> {
    await apiFetch(
      '/auth/super-admin/switch-out',
      { method: 'POST', body: JSON.stringify({}) },
      accessTokenRef.current ?? undefined,
    ).catch(() => undefined);
    await silentRefresh();
  }
```

Update the provider's returned value:

```tsx
  return (
    <AuthContext.Provider
      value={{
        accessToken,
        organizationSlug,
        role,
        actingSuperAdmin,
        actingOrgName,
        isLoading,
        login,
        logout,
        switchIntoOrg,
        switchOutOfOrg,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd "D:\exam app\apps\web" && npx jest lib/auth-context.test --no-cache`
Expected: all tests pass (pre-existing count plus 2 new).

- [ ] **Step 5: Write the failing test for the banner component**

Create `apps/web/components/SuperAdminActingBanner.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SuperAdminActingBanner } from './SuperAdminActingBanner';
import { useAuth } from '../lib/auth-context';

jest.mock('../lib/auth-context', () => ({ useAuth: jest.fn() }));

describe('SuperAdminActingBanner', () => {
  it('renders nothing when not acting as super_admin', () => {
    (useAuth as jest.Mock).mockReturnValue({ actingSuperAdmin: false, actingOrgName: null, switchOutOfOrg: jest.fn() });

    const { container } = render(<SuperAdminActingBanner />);

    expect(container).toBeEmptyDOMElement();
  });

  it('shows the org name and calls switchOutOfOrg when Exit is clicked', async () => {
    const switchOutOfOrg = jest.fn().mockResolvedValue(undefined);
    (useAuth as jest.Mock).mockReturnValue({ actingSuperAdmin: true, actingOrgName: 'Acme Inc', switchOutOfOrg });

    render(<SuperAdminActingBanner />);

    expect(screen.getByText(/viewing as super_admin/i)).toHaveTextContent('Acme Inc');
    await userEvent.click(screen.getByRole('button', { name: /exit to platform admin/i }));

    expect(switchOutOfOrg).toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `cd "D:\exam app\apps\web" && npx jest components/SuperAdminActingBanner.test --no-cache`
Expected: FAIL — the module `./SuperAdminActingBanner` doesn't exist yet.

- [ ] **Step 7: Implement the banner**

Create `apps/web/components/SuperAdminActingBanner.tsx`:

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '../lib/auth-context';

export function SuperAdminActingBanner() {
  const router = useRouter();
  const { actingSuperAdmin, actingOrgName, switchOutOfOrg } = useAuth();

  if (!actingSuperAdmin) {
    return null;
  }

  async function handleExit() {
    await switchOutOfOrg();
    router.push('/organizations');
  }

  return (
    <div className="flex items-center justify-between bg-amber-500 px-4 py-2 text-sm font-medium text-white">
      <span>
        Viewing as super_admin — <strong>{actingOrgName}</strong>
      </span>
      <button
        type="button"
        onClick={handleExit}
        className="rounded-md border border-white/40 px-3 py-1 text-xs font-semibold hover:bg-white/10"
      >
        Exit to platform admin
      </button>
    </div>
  );
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `cd "D:\exam app\apps\web" && npx jest components/SuperAdminActingBanner.test --no-cache`
Expected: both tests pass.

- [ ] **Step 9: Mount the banner once in the root layout**

In `apps/web/app/layout.tsx`:

```tsx
import './globals.css';
import { AuthProvider } from '../lib/auth-context';
import { QueryProvider } from '../lib/query-provider';
import { ToastProvider } from '../components/ui';
import { SuperAdminActingBanner } from '../components/SuperAdminActingBanner';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <QueryProvider>
          <ToastProvider>
            <AuthProvider>
              <SuperAdminActingBanner />
              {children}
            </AuthProvider>
          </ToastProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
```

Since `SuperAdminActingBanner` reads `actingSuperAdmin` from `useAuth()` (which is `false` for every session type other than an active super_admin acting session — including all candidate-facing pages, which use a completely separate `CandidateAuthProvider`/context, never this one), mounting it once at the root is safe and shows up automatically on every staff page while acting, with zero effect on any other session.

- [ ] **Step 10: Run the full web test suite to confirm no regressions**

Run: `cd "D:\exam app\apps\web" && npx jest --no-cache`
Expected: all suites pass (pre-existing count plus the 4 new tests across the two new/modified test files).

- [ ] **Step 11: Commit**

```bash
git add apps/web/lib/auth-context.tsx apps/web/lib/auth-context.test.tsx apps/web/components/SuperAdminActingBanner.tsx apps/web/components/SuperAdminActingBanner.test.tsx apps/web/app/layout.tsx
git commit -m "feat: super_admin switch-into/out client state, acting banner"
```

---

### Task 4: Frontend — widen route-group gates, cross-shell nav links, Switch-into button

**Files:**
- Modify: `apps/web/app/(recruiter)/layout.tsx`
- Modify: `apps/web/app/(org-admin)/layout.tsx`
- Modify: `apps/web/app/(panel)/layout.tsx`
- Modify: `apps/web/app/(platform)/organizations/page.tsx`
- Test: `apps/web/app/(platform)/organizations/page.test.tsx`

**Interfaces:**
- Consumes: `useAuth()`'s `actingSuperAdmin` (Task 3), `useOrganizations()`/`Organization` type (`apps/web/lib/hooks/useOrganizations.ts`, `apps/web/lib/types.ts` — both pre-existing, unchanged).
- Produces: nothing new consumed by later tasks — this task is purely gate-widening plus one new button.

- [ ] **Step 1: Widen the three route-group gates**

In `apps/web/app/(recruiter)/layout.tsx`, change the destructure and both gate checks:

```typescript
  const { accessToken, organizationSlug, role, actingSuperAdmin, isLoading, logout } = useAuth();
```

```typescript
  useEffect(() => {
    if (!isLoading && !accessToken) {
      router.push('/login');
    } else if (!isLoading && accessToken && role && role !== 'recruiter' && !actingSuperAdmin) {
      router.push('/login');
    }
  }, [isLoading, accessToken, role, actingSuperAdmin, router]);
```

```typescript
  if (isLoading || !accessToken || (role !== null && role !== 'recruiter' && !actingSuperAdmin)) {
    return <p className="p-8 text-sm text-recruiter-text-tertiary">Loading…</p>;
  }
```

Apply the identical pattern (same three edits — destructure, `useEffect` condition, render-guard condition) to `apps/web/app/(org-admin)/layout.tsx` (substituting `'org_admin'` for `'recruiter'`) and `apps/web/app/(panel)/layout.tsx` (substituting `'panel'` for `'recruiter'`).

- [ ] **Step 2: Add cross-shell nav links, shown only while acting**

In `apps/web/app/(recruiter)/layout.tsx`, change the `NAV_ITEMS` constant to a function of `actingSuperAdmin` so the acting case sees every destination from all three shells:

```typescript
import { LayoutDashboard, FileText, BookOpen, Users, History, ShieldCheck, Settings, KeyRound } from 'lucide-react';

const BASE_NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/exams', label: 'Exams', icon: FileText },
  { href: '/questions', label: 'Question Bank', icon: BookOpen },
  { href: '/candidates', label: 'Candidates', icon: Users },
];

const ACTING_EXTRA_NAV_ITEMS = [
  { href: '/reports', label: 'Reports', icon: FileText },
  { href: '/users', label: 'Staff Users', icon: Users },
  { href: '/audit-log', label: 'Audit Log', icon: History },
  { href: '/data-rights', label: 'Candidate Data Rights', icon: ShieldCheck },
  { href: '/settings/branding', label: 'Org Settings', icon: Settings },
  { href: '/settings/sso', label: 'Single Sign-On', icon: KeyRound },
];
```

Inside the component, compute the actual list to render:

```typescript
  const navItems = actingSuperAdmin ? [...BASE_NAV_ITEMS, ...ACTING_EXTRA_NAV_ITEMS] : BASE_NAV_ITEMS;
```

Change the `NAV_ITEMS.map(...)` call in the JSX to `navItems.map(...)`.

Apply the same pattern to `apps/web/app/(org-admin)/layout.tsx` and `apps/web/app/(panel)/layout.tsx`: each keeps its own existing items as `BASE_NAV_ITEMS`, and its `ACTING_EXTRA_NAV_ITEMS` is the *other two* shells' destinations (so from org-admin's chrome, acting mode adds Dashboard/Exams/Question Bank/Candidates/Reports; from panel's chrome, acting mode adds Dashboard/Question Bank/Candidates/Staff Users/Audit Log/Candidate Data Rights/Org Settings/Single Sign-On). Every `href` in every `ACTING_EXTRA_NAV_ITEMS` list must exactly match an existing route already defined elsewhere in this plan's Global Constraints ("existing pages reused unmodified") — do not invent new hrefs.

`(panel)/layout.tsx` renders its nav differently (a single top-bar link, not a `NAV_ITEMS.map`) — for that file specifically, wrap the acting-only extra links in the same `{pathname?.startsWith(...) ...}` `<Link>` pattern already used for its one existing `Exams` link, rendered conditionally on `actingSuperAdmin`, placed directly after that existing link inside the same `<div className="flex items-center gap-4">`.

- [ ] **Step 3: Write the failing test for the "Switch into" button**

Read `apps/web/app/(platform)/organizations/page.test.tsx` in full first to match its exact mocking conventions for `useOrganizations`/`apiFetch` (create this file if it doesn't exist yet, following the mocking style of `apps/web/app/(platform)/platform-admins/page.test.tsx` as the closest precedent in the same route group). Add:

```tsx
  it('switches into an organization when "Switch into" is clicked', async () => {
    const switchIntoOrg = jest.fn().mockResolvedValue(undefined);
    (useAuth as jest.Mock).mockReturnValue({ accessToken: 'token', switchIntoOrg });
    // mock useOrganizations to resolve one org: { id: 'org-1', name: 'Acme Inc', slug: 'acme', region: 'us', createdAt: '2026-01-01' }

    render(<OrganizationsPage />);

    await userEvent.click(await screen.findByRole('button', { name: /switch into/i }));

    expect(switchIntoOrg).toHaveBeenCalledWith('org-1');
    expect(mockPush).toHaveBeenCalledWith('/dashboard');
  });
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `cd "D:\exam app\apps\web" && npx jest --clearCache && npx jest "(platform)/organizations/page.test" --no-cache`
Expected: FAIL — no "Switch into" button exists yet.

- [ ] **Step 5: Implement the button**

In `apps/web/app/(platform)/organizations/page.tsx`, add imports:

```typescript
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../lib/auth-context';
```

Inside the component, add:

```typescript
  const router = useRouter();
  const { switchIntoOrg } = useAuth();

  async function handleSwitchInto(orgId: string) {
    await switchIntoOrg(orgId);
    router.push('/dashboard');
  }
```

Change `renderCard` to accept the switch-in action:

```typescript
  function renderCard(org: Organization) {
    return (
      <div className="flex flex-col gap-1">
        <p className="truncate text-sm font-semibold text-gray-900">{org.name}</p>
        <p className="text-xs text-gray-500">{org.slug}</p>
        <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
          <span>{org.region.toUpperCase()}</span>
          <span>{new Date(org.createdAt).toLocaleDateString()}</span>
        </div>
        <Button variant="secondary" onClick={() => handleSwitchInto(org.id)} className="mt-2">
          Switch into
        </Button>
      </div>
    );
  }
```

(`Button`'s `variant="secondary"` prop — confirm this matches the component's actual API by checking `apps/web/components/ui/Button.tsx`'s prop types before finalizing; adjust to whatever variant name that component exposes if `"secondary"` isn't one of them.)

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd "D:\exam app\apps\web" && npx jest "(platform)/organizations/page.test" --no-cache`
Expected: all tests pass.

- [ ] **Step 7: Run the full web suite and tsc**

Run: `cd "D:\exam app\apps\web" && npx jest --no-cache && npx tsc --noEmit -p tsconfig.json`
Expected: all suites pass; tsc shows no new errors versus the pre-existing baseline.

- [ ] **Step 8: Commit**

```bash
git add "apps/web/app/(recruiter)/layout.tsx" "apps/web/app/(org-admin)/layout.tsx" "apps/web/app/(panel)/layout.tsx" "apps/web/app/(platform)/organizations/page.tsx" "apps/web/app/(platform)/organizations/page.test.tsx"
git commit -m "feat: widen staff route gates for acting super_admin, add Switch-into action"
```

---

### Task 5: Frontend — platform-wide user directory page

**Files:**
- Create: `apps/web/lib/hooks/useUserDirectory.ts`
- Create: `apps/web/app/(platform)/users/page.tsx`
- Modify: `apps/web/app/(platform)/layout.tsx`
- Test: `apps/web/app/(platform)/users/page.test.tsx`

**Interfaces:**
- Consumes: `GET /users/directory` (Task 2), `StaffUser`/`PaginatedResponse` types (`apps/web/lib/types.ts`), `switchIntoOrg` (Task 3), `CardGrid`/`Input`/`Pagination` UI primitives (same as `apps/web/app/(platform)/organizations/page.tsx`).
- Produces: nothing consumed by a later task (final frontend surface).

- [ ] **Step 1: Add the frontend type**

In `apps/web/lib/types.ts`, add directly after the existing `StaffUser` interface:

```typescript
export interface DirectoryUser extends StaffUser {
  organizationName: string | null;
}
```

- [ ] **Step 2: Write the failing test for the hook**

Create `apps/web/lib/hooks/useUserDirectory.test.tsx` — mirror `apps/web/lib/hooks/useOrganizations.ts`'s consuming test conventions if one exists for it, otherwise mirror `apps/web/lib/hooks/useUsers.ts` (find `useUsers.test.tsx` if present and match its `renderHook`/`QueryProvider`/`AuthProvider` wrapping exactly). Test that `useUserDirectory({ page: 1 })` calls `apiFetch('/users/directory?page=1', {}, accessToken)`.

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd "D:\exam app\apps\web" && npx jest --clearCache && npx jest lib/hooks/useUserDirectory.test --no-cache`
Expected: FAIL — the module doesn't exist yet.

- [ ] **Step 4: Implement the hook**

Create `apps/web/lib/hooks/useUserDirectory.ts`:

```typescript
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { DirectoryUser, PaginatedResponse } from '../types';
import { useAuth } from '../auth-context';

interface UseUserDirectoryParams {
  page?: number;
  pageSize?: number;
  search?: string;
}

function buildDirectoryQuery(params: UseUserDirectoryParams): string {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.pageSize) query.set('pageSize', String(params.pageSize));
  if (params.search) query.set('search', params.search);
  const queryString = query.toString();
  return queryString ? `?${queryString}` : '';
}

export function useUserDirectory(params: UseUserDirectoryParams = {}) {
  const { accessToken } = useAuth();
  return useQuery<PaginatedResponse<DirectoryUser>>({
    queryKey: ['users', 'directory', params],
    queryFn: () => apiFetch(`/users/directory${buildDirectoryQuery(params)}`, {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd "D:\exam app\apps\web" && npx jest lib/hooks/useUserDirectory.test --no-cache`
Expected: passes.

- [ ] **Step 6: Write the failing test for the directory page**

Create `apps/web/app/(platform)/users/page.test.tsx`, mirroring `apps/web/app/(platform)/organizations/page.tsx`'s test conventions:

```tsx
  it('lists users with their organization name and switches into an org via Manage', async () => {
    const switchIntoOrg = jest.fn().mockResolvedValue(undefined);
    (useAuth as jest.Mock).mockReturnValue({ accessToken: 'token', switchIntoOrg });
    // mock useUserDirectory to resolve one row:
    // { id: 'u1', organizationId: 'org-1', organizationName: 'Acme Inc', email: 'a@acme.test', name: 'A', role: 'recruiter', status: 'active', lastLoginAt: null, createdAt: '2026-01-01' }

    render(<UsersDirectoryPage />);

    expect(await screen.findByText('a@acme.test')).toBeInTheDocument();
    expect(screen.getByText('Acme Inc')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /manage/i }));

    expect(switchIntoOrg).toHaveBeenCalledWith('org-1');
    expect(mockPush).toHaveBeenCalledWith('/users');
  });

  it('shows a platform dash instead of an org name for other super_admin rows', async () => {
    (useAuth as jest.Mock).mockReturnValue({ accessToken: 'token', switchIntoOrg: jest.fn() });
    // mock useUserDirectory to resolve one row with organizationId: null, organizationName: null, role: 'super_admin'

    render(<UsersDirectoryPage />);

    expect(await screen.findByText('—')).toBeInTheDocument();
  });
```

- [ ] **Step 7: Run the tests to verify they fail**

Run: `cd "D:\exam app\apps\web" && npx jest "(platform)/users/page.test" --no-cache`
Expected: FAIL — the page module doesn't exist yet.

- [ ] **Step 8: Implement the page**

Create `apps/web/app/(platform)/users/page.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUserDirectory } from '../../../lib/hooks/useUserDirectory';
import { useAuth } from '../../../lib/auth-context';
import { Input, Pagination, Button } from '../../../components/ui';
import { DirectoryUser } from '../../../lib/types';

export default function UsersDirectoryPage() {
  const router = useRouter();
  const { switchIntoOrg } = useAuth();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const { data, isLoading, isError } = useUserDirectory({ page, pageSize: 20, search: search || undefined });

  async function handleManage(user: DirectoryUser) {
    if (!user.organizationId) {
      return;
    }
    await switchIntoOrg(user.organizationId);
    router.push('/users');
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-gray-900">All Users</h1>
      <Input
        label="Search users"
        placeholder="Email…"
        value={search}
        onChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
      />
      {isLoading && <p className="text-sm text-gray-500">Loading users…</p>}
      {isError && (
        <p role="alert" className="text-sm text-status-danger">
          Failed to load users.
        </p>
      )}
      {!isLoading && !isError && (
        <>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs font-medium uppercase text-gray-500">
                <th className="py-2">Email</th>
                <th className="py-2">Name</th>
                <th className="py-2">Role</th>
                <th className="py-2">Organization</th>
                <th className="py-2">Status</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {(data?.data ?? []).map((user) => (
                <tr key={user.id} className="border-b border-gray-100">
                  <td className="py-2">{user.email}</td>
                  <td className="py-2">{user.name ?? '—'}</td>
                  <td className="py-2">{user.role}</td>
                  <td className="py-2">{user.organizationName ?? '—'}</td>
                  <td className="py-2">{user.status}</td>
                  <td className="py-2">
                    {user.organizationId && (
                      <Button variant="secondary" onClick={() => handleManage(user)}>
                        Manage
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={data?.page ?? 1} totalPages={data?.totalPages ?? 1} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
```

(As in Task 4 Step 5, confirm `Button`'s exact variant prop name against `apps/web/components/ui/Button.tsx` before finalizing.)

- [ ] **Step 9: Run the tests to verify they pass**

Run: `cd "D:\exam app\apps\web" && npx jest "(platform)/users/page.test" --no-cache`
Expected: both tests pass.

- [ ] **Step 10: Add the nav link**

In `apps/web/app/(platform)/layout.tsx`, add to `NAV_LINKS`:

```typescript
const NAV_LINKS = [
  { href: '/organizations', label: 'Organizations' },
  { href: '/platform-admins', label: 'Platform Admins' },
  { href: '/users', label: 'All Users' },
];
```

- [ ] **Step 11: Run the full web suite and tsc**

Run: `cd "D:\exam app\apps\web" && npx jest --no-cache && npx tsc --noEmit -p tsconfig.json`
Expected: all suites pass; tsc shows no new errors versus the pre-existing baseline.

- [ ] **Step 12: Commit**

```bash
git add apps/web/lib/types.ts apps/web/lib/hooks/useUserDirectory.ts apps/web/lib/hooks/useUserDirectory.test.tsx "apps/web/app/(platform)/users/page.tsx" "apps/web/app/(platform)/users/page.test.tsx" "apps/web/app/(platform)/layout.tsx"
git commit -m "feat: platform-wide user directory page for super_admin"
```

---

### Task 6: E2E + Playwright + final verification

**Files:**
- Modify: `apps/api/test/` — new e2e spec file `super-admin-cross-org-access.e2e-spec.ts`
- Modify: `apps/web/e2e/` — new Playwright spec file `super-admin-switch-into-org.spec.ts`

**Interfaces:**
- Consumes: the full stack from Tasks 1–5.
- Produces: nothing (final task).

- [ ] **Step 1: Write the backend e2e spec**

Read an existing e2e spec in `apps/api/test/` first (e.g. `saml-sso.e2e-spec.ts` or `code-run-execution.e2e-spec.ts`) to match this repo's `bootAdminApp`/`bootRuntimeApp` helper conventions and auth bootstrapping pattern. Create `apps/api/test/super-admin-cross-org-access.e2e-spec.ts` covering:

1. A `super_admin` logs in, calls `POST /auth/super-admin/switch-into/:orgId` for a real org, receives a 200 with an `accessToken`.
2. Using that acting token, `GET /questions` (a recruiter-only endpoint, `question_bank:manage`) succeeds with 200 — proving the guard bypass genuinely works for a permission `super_admin`'s base role doesn't hold.
3. Using that acting token, `GET /users` (an org_admin-only endpoint, `org:manage_users`) succeeds with 200 and returns only that org's users.
4. `POST /auth/super-admin/switch-out` with the acting token succeeds with 200.
5. Using the ORIGINAL (non-acting) super_admin token, the same `GET /questions` call now returns 403 — proving the elevation was genuinely temporary and scoped to the acting token, not a lasting change.
6. `GET /users/directory` with the real super_admin token returns users from at least two different organizations in one response (seed or create two orgs with one user each in the test setup) — proving the cross-org query genuinely has no org filter.

- [ ] **Step 2: Run the e2e spec**

Run: `cd "D:\exam app\apps\api" && npx jest --clearCache && npx jest --config ./test/jest-e2e.json --runInBand super-admin-cross-org-access.e2e-spec.ts --no-cache`
Expected: all new tests pass.

- [ ] **Step 3: Write the Playwright spec**

Read `apps/web/e2e/` for an existing spec that logs in as `super_admin` (or the closest precedent) to match this repo's Playwright fixture/setup conventions. Create `apps/web/e2e/super-admin-switch-into-org.spec.ts` covering: log in as super_admin → land on `/organizations` → click "Switch into" on a real org → confirm the amber "Viewing as super_admin" banner is visible and the recruiter dashboard renders → navigate via the acting nav to `/questions` (recruiter-only page) and confirm it renders (not redirected to `/login`) → navigate to `/users` (org-admin-only page) and confirm it renders → click "Exit to platform admin" → confirm redirect back to `/organizations` and the banner is gone → navigate directly to `/questions` and confirm it now redirects to `/login` (elevation genuinely ended).

- [ ] **Step 4: Run the Playwright spec**

Run: `cd "D:\exam app\apps\web" && WEB_BASE_URL=http://localhost:3002 E2E_API_BASE=http://localhost:3501/api/v1 npx playwright test super-admin-switch-into-org --reporter=list`
Expected: passes (start the dev servers first per this repo's established e2e bootstrap process if they aren't already running).

- [ ] **Step 5: Run the full regression sweep**

```bash
cd "D:\exam app\apps\api" && npx jest --clearCache && npx jest --no-cache
cd "D:\exam app\apps\exam-runtime" && npx jest --clearCache && npx jest --no-cache
cd "D:\exam app\apps\web" && npx jest --clearCache && npx jest --no-cache
cd "D:\exam app\apps\web" && npx tsc --noEmit -p tsconfig.json
cd "D:\exam app\apps\api" && npx jest --config ./test/jest-e2e.json --runInBand
cd "D:\exam app\apps\web" && WEB_BASE_URL=http://localhost:3002 E2E_API_BASE=http://localhost:3501/api/v1 npx playwright test --reporter=list
```

Expected: every suite green (report exact pass/total counts for each, not just "passed"); `tsc` shows zero new errors versus the pre-existing baseline; the full Playwright suite passes. Before running any of this, confirm no orphaned jest/e2e processes from earlier sessions are still running against the same live database (`Get-CimInstance Win32_Process -Filter "Name='node.exe'"` filtered for `jest` in the command line) — this repo has repeatedly hit false failures from exactly that in this session; kill any found before starting a clean run.

- [ ] **Step 6: Commit**

```bash
git add apps/api/test/super-admin-cross-org-access.e2e-spec.ts apps/web/e2e/super-admin-switch-into-org.spec.ts
git commit -m "test: e2e and Playwright coverage for super_admin cross-org access"
```

---

## Self-Review Notes

- **Spec coverage:** switch-in/out token mechanics + audit trail (Task 1); permission-guard bypass with no new RBAC rows (Task 1); the acting-token `organizationId` claim as the sole scoping mechanism, requiring zero changes to `TenantPrismaService`/RLS (verified in Task 1's design — no task touches that layer, confirming the spec's claim it needs no changes); the three unmodified route-group pages reused as-is with only their gate condition widened (Task 4); combined-nav "everything at once" via merged nav-item lists (Task 4); platform-wide read-only directory with deep-link-to-manage instead of duplicate write endpoints (Tasks 2 and 5); persistent banner for the whole acting duration (Task 3, mounted once at the root layout so it's structurally impossible to navigate away from it while acting); audit logging on both switch-in and switch-out (Task 1). ✓
- **Placeholder scan:** every step shows complete code, except the three spots that explicitly say "read the file first, match its exact conventions" (Task 2 Step 1's mock-shape adaptation, Task 3 Step 1's auth-context test helpers, Task 4 Step 3 / Task 5 Step 6's page-test conventions, Task 6's e2e/Playwright fixture conventions) — this session's established convention for adapting to a test file's real current shape rather than guessing at conventions not yet read, not a placeholder for logic. ✓
- **Type consistency:** `actingSuperAdmin`/`actingOrgName` are spelled identically across `JwtPayload` (Task 1), `JwtStrategy.validate()`'s returned shape, `PermissionsGuard`'s narrowed `user` type (Task 1), and `auth-context.tsx`'s `AuthContextValue`/`applyToken` (Task 3). `switchIntoOrg(orgId: string)` / `switchOutOfOrg()` signatures match exactly between `auth-context.tsx` (Task 3) and every consumer (`SuperAdminActingBanner`, the organizations page's Switch-into button, the directory page's Manage button — Tasks 3–5). `DirectoryUser` (Task 5) matches the backend's `SafeUser & { organizationName: string | null }` return shape (Task 2) field-for-field. ✓
