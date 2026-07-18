# First-Run Setup Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let whoever deploys this platform for the first time create the very first `super_admin` account through a normal web form, gated by a random token only visible in the server's boot logs — no hand-editing `seed.ts`, no hardcoded credentials in source control.

**Architecture:** A new `SetupToken` Prisma model (mirrors `PasswordResetToken`). A new `SetupService` generates a fresh token at server boot (only if zero `super_admin` rows exist) and logs it; two new public endpoints (`GET /setup/status`, `POST /setup/complete`) let the frontend check whether setup is needed and submit the token + new admin's email/password. A new standalone `/setup` frontend page drives the flow.

**Tech Stack:** NestJS (`@nestjs/common` `OnModuleInit`, `class-validator`, `argon2`), Prisma (SQL Server, RLS via `TenantPrismaService`), Next.js App Router, existing design-system primitives (`Input`/`Button`).

## Global Constraints

- The wizard only functions while zero `super_admin` rows exist anywhere in the database — checked via the RLS-safe `TenantPrismaService.forTenant({organizationId: null, isSuperAdmin: true}, ...)` bypass, never a plain unscoped query (a plain query would silently see zero rows regardless of the table's real contents, since `dbo.users` carries a row-level-security filter predicate).
- `apps/api/prisma/seed.ts` is not modified. It stays exactly as-is for local dev.
- The setup endpoints are the one deliberate exception to "everything requires `JwtAuthGuard`" in this codebase — nothing can be authenticated before the first account exists. The token is the authentication.
- Every server restart while setup is still pending regenerates the token (deletes the old one, creates a fresh one), invalidating whatever was printed on the previous boot.
- No auto-login/session is issued on wizard completion — the operator logs in through the existing `/login` page afterward.

---

## File Structure

- `apps/api/prisma/schema.prisma` (modify) — add the `SetupToken` model.
- `apps/api/prisma/migrations/20260718180000_setup_tokens/migration.sql` (new) — `CREATE TABLE`.
- `apps/api/src/setup/dto/complete-setup.dto.ts` (new) — request body validation for `POST /setup/complete`.
- `apps/api/src/setup/setup.service.ts` (new) — boot-time token generation, `needsSetup()`, `completeSetup()`.
- `apps/api/src/setup/setup.service.spec.ts` (new) — unit tests.
- `apps/api/src/setup/setup.controller.ts` (new) — `GET /setup/status`, `POST /setup/complete`.
- `apps/api/src/setup/setup.module.ts` (new) — wires the above together.
- `apps/api/src/app.module.ts` (modify) — import `SetupModule`.
- `apps/web/app/setup/page.tsx` (new) — the wizard form.
- `apps/web/app/setup/page.test.tsx` (new).

---

### Task 1: Schema — SetupToken model + migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260718180000_setup_tokens/migration.sql`

**Interfaces:**
- Produces: the `SetupToken` Prisma model — `{id: string, tokenHash: string, expiresAt: Date, createdAt: Date}`, accessible as `prisma.setupToken` / `tx.setupToken` in later tasks.

- [ ] **Step 1: Add the model to schema.prisma**

Open `apps/api/prisma/schema.prisma` and add this model after the existing `PasswordResetToken` model (around line 102, right after its closing `}`):

```prisma
model SetupToken {
  id        String   @id @default(uuid()) @db.UniqueIdentifier
  tokenHash String   @unique @map("token_hash")
  expiresAt DateTime @map("expires_at")
  createdAt DateTime @default(now()) @map("created_at")

  @@map("setup_tokens")
}
```

- [ ] **Step 2: Validate the schema**

Run: `cd apps/api && npx prisma validate`
Expected: `The schema at prisma/schema.prisma is valid 🚀`

- [ ] **Step 3: Create the migration directory and SQL file**

Create `apps/api/prisma/migrations/20260718180000_setup_tokens/migration.sql`:

```sql
-- CreateTable
CREATE TABLE [dbo].[setup_tokens] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [token_hash] NVARCHAR(1000) NOT NULL,
    [expires_at] DATETIME2 NOT NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [setup_tokens_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [setup_tokens_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE UNIQUE NONCLUSTERED INDEX [setup_tokens_token_hash_key] ON [dbo].[setup_tokens]([token_hash]);
```

- [ ] **Step 4: Apply the migration against the real dev database**

Run: `cd apps/api && npx prisma migrate deploy`
Expected: `The following migration(s) have been applied: ... 20260718180000_setup_tokens`

- [ ] **Step 5: Regenerate the Prisma client**

Run: `cd apps/api && npx prisma generate`
Expected: `Generated Prisma Client` with no errors — this makes `prisma.setupToken`/`tx.setupToken` available with correct TypeScript types for Task 2.

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260718180000_setup_tokens
git commit -m "feat: add SetupToken schema for first-run setup wizard"
```

---

### Task 2: Backend — SetupService + unit tests

**Files:**
- Create: `apps/api/src/setup/dto/complete-setup.dto.ts`
- Create: `apps/api/src/setup/setup.service.ts`
- Test: `apps/api/src/setup/setup.service.spec.ts`

**Interfaces:**
- Consumes: `PrismaService`, `TenantPrismaService.forTenant(context, fn)`, `AuditService.record(context, {actorUserId, action, entityType, entityId})` (all from `@exam-platform/shared`), the `SetupToken` model from Task 1.
- Produces: `SetupService.needsSetup(): Promise<boolean>`, `SetupService.completeSetup(dto: CompleteSetupDto): Promise<void>` (throws `BadRequestException` on any invalid/expired/already-used-setup case), and the `onModuleInit()` lifecycle hook that runs the boot-time token generation. Task 3's controller calls `needsSetup()` and `completeSetup()` directly.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/setup/dto/complete-setup.dto.ts` first (needed by the test file's imports):

```typescript
import { IsEmail, IsString, MinLength } from 'class-validator';

export class CompleteSetupDto {
  @IsString()
  token!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}
```

Create `apps/api/src/setup/setup.service.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { createHash } from 'crypto';
import { SetupService } from './setup.service';
import { PrismaService, TenantPrismaService, AuditService } from '@exam-platform/shared';

describe('SetupService', () => {
  let service: SetupService;
  let prisma: { setupToken: { deleteMany: jest.Mock; create: jest.Mock; findUnique: jest.Mock } };
  let tenantPrisma: { forTenant: jest.Mock };
  let audit: { record: jest.Mock };

  beforeEach(async () => {
    prisma = {
      setupToken: { deleteMany: jest.fn(), create: jest.fn(), findUnique: jest.fn() },
    };
    tenantPrisma = { forTenant: jest.fn() };
    audit = { record: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        SetupService,
        { provide: PrismaService, useValue: prisma },
        { provide: TenantPrismaService, useValue: tenantPrisma },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    service = moduleRef.get(SetupService);
  });

  it('needsSetup returns true when zero super_admins exist', async () => {
    tenantPrisma.forTenant.mockImplementation(async (_context: unknown, fn: (tx: unknown) => unknown) =>
      fn({ user: { count: async () => 0 } }),
    );

    await expect(service.needsSetup()).resolves.toBe(true);
    expect(tenantPrisma.forTenant).toHaveBeenCalledWith({ organizationId: null, isSuperAdmin: true }, expect.any(Function));
  });

  it('needsSetup returns false when a super_admin already exists', async () => {
    tenantPrisma.forTenant.mockImplementation(async (_context: unknown, fn: (tx: unknown) => unknown) =>
      fn({ user: { count: async () => 1 } }),
    );

    await expect(service.needsSetup()).resolves.toBe(false);
  });

  it('onModuleInit generates and logs a token when setup is needed', async () => {
    tenantPrisma.forTenant.mockImplementation(async (_context: unknown, fn: (tx: unknown) => unknown) =>
      fn({ user: { count: async () => 0 } }),
    );

    await service.onModuleInit();

    expect(prisma.setupToken.deleteMany).toHaveBeenCalledWith({});
    expect(prisma.setupToken.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tokenHash: expect.any(String), expiresAt: expect.any(Date) }) }),
    );
  });

  it('onModuleInit does nothing when a super_admin already exists', async () => {
    tenantPrisma.forTenant.mockImplementation(async (_context: unknown, fn: (tx: unknown) => unknown) =>
      fn({ user: { count: async () => 1 } }),
    );

    await service.onModuleInit();

    expect(prisma.setupToken.deleteMany).not.toHaveBeenCalled();
    expect(prisma.setupToken.create).not.toHaveBeenCalled();
  });

  it('completeSetup rejects when a super_admin already exists, even with a technically valid token', async () => {
    tenantPrisma.forTenant.mockImplementation(async (_context: unknown, fn: (tx: unknown) => unknown) =>
      fn({
        user: { count: async () => 1, create: jest.fn() },
        setupToken: { findUnique: async () => ({ tokenHash: 'irrelevant', expiresAt: new Date(Date.now() + 100000) }), deleteMany: jest.fn() },
      }),
    );

    await expect(
      service.completeSetup({ token: 'raw-token', email: 'ops@example.com', password: 'password1' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('completeSetup rejects an invalid token', async () => {
    tenantPrisma.forTenant.mockImplementation(async (_context: unknown, fn: (tx: unknown) => unknown) =>
      fn({
        user: { count: async () => 0, create: jest.fn() },
        setupToken: { findUnique: async () => null, deleteMany: jest.fn() },
      }),
    );

    await expect(
      service.completeSetup({ token: 'wrong-token', email: 'ops@example.com', password: 'password1' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('completeSetup rejects an expired token', async () => {
    tenantPrisma.forTenant.mockImplementation(async (_context: unknown, fn: (tx: unknown) => unknown) =>
      fn({
        user: { count: async () => 0, create: jest.fn() },
        setupToken: { findUnique: async () => ({ expiresAt: new Date(Date.now() - 1000) }), deleteMany: jest.fn() },
      }),
    );

    await expect(
      service.completeSetup({ token: 'raw-token', email: 'ops@example.com', password: 'password1' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('completeSetup creates the super_admin, deletes the token, and records an audit event', async () => {
    const userCreate = jest.fn(async () => ({ id: 'new-admin-id', email: 'ops@example.com' }));
    const tokenDeleteMany = jest.fn();
    tenantPrisma.forTenant.mockImplementation(async (_context: unknown, fn: (tx: unknown) => unknown) =>
      fn({
        user: { count: async () => 0, create: userCreate },
        setupToken: { findUnique: async () => ({ expiresAt: new Date(Date.now() + 100000) }), deleteMany: tokenDeleteMany },
      }),
    );

    await service.completeSetup({ token: 'raw-token', email: 'ops@example.com', password: 'password1' });

    expect(userCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ organizationId: null, email: 'ops@example.com', role: 'super_admin' }) }),
    );
    expect(tokenDeleteMany).toHaveBeenCalledWith({});
    expect(audit.record).toHaveBeenCalledWith(
      { organizationId: null, isSuperAdmin: true },
      { actorUserId: 'new-admin-id', action: 'user.setup_wizard_completed', entityType: 'user', entityId: 'new-admin-id' },
    );
  });
});
```

Note: the mocked `setupToken.findUnique` results above don't need a real `tokenHash` field for the "reject" tests, since the service only checks `expiresAt`/existence in those paths — `createHash('sha256').update(dto.token).digest('hex')` is computed by the service internally and passed into the mocked `findUnique`, but the mock doesn't need to assert on that argument for these tests to be valid.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && npx jest setup/setup.service.spec.ts`
Expected: FAIL — `Cannot find module './setup.service'`

- [ ] **Step 3: Implement SetupService**

Create `apps/api/src/setup/setup.service.ts`:

```typescript
import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as argon2 from 'argon2';
import { randomBytes, createHash } from 'crypto';
import { PrismaService, TenantPrismaService, AuditService } from '@exam-platform/shared';
import { CompleteSetupDto } from './dto/complete-setup.dto';

// A generous window compared to the 15-minute PASSWORD_RESET_EXPIRY_MINUTES used elsewhere --
// this token is for a one-time operator/deploy action, not an end-user flow, and the operator
// may not act on it immediately after boot. Every restart while setup is pending regenerates it
// anyway, so this expiry is a defense-in-depth bound, not the primary control.
const SETUP_TOKEN_EXPIRY_HOURS = 24;

@Injectable()
export class SetupService implements OnModuleInit {
  private readonly logger = new Logger(SetupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly audit: AuditService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!(await this.needsSetup())) {
      return;
    }

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + SETUP_TOKEN_EXPIRY_HOURS);

    await this.prisma.setupToken.deleteMany({});
    await this.prisma.setupToken.create({ data: { tokenHash, expiresAt } });

    const setupUrl = `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/setup`;
    this.logger.warn(
      `No super_admin account exists yet. Visit ${setupUrl} and complete setup with this one-time token: ${rawToken}`,
    );
  }

  async needsSetup(): Promise<boolean> {
    // dbo.users carries an RLS filter predicate -- a plain unscoped query would silently see
    // zero rows regardless of the table's real contents, permanently reporting "needs setup"
    // even after a real super_admin exists. This bypass context is required, not optional.
    const count = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) =>
      tx.user.count({ where: { role: 'super_admin' } }),
    );
    return count === 0;
  }

  async completeSetup(dto: CompleteSetupDto): Promise<void> {
    const tokenHash = createHash('sha256').update(dto.token).digest('hex');
    const context = { organizationId: null, isSuperAdmin: true };

    const admin = await this.tenantPrisma.forTenant(context, async (tx) => {
      // Re-check at write time, not just trusting the boot-time snapshot -- closes the race
      // window between two concurrent submissions.
      const stillNeedsSetup = (await tx.user.count({ where: { role: 'super_admin' } })) === 0;
      if (!stillNeedsSetup) {
        throw new BadRequestException('Setup has already been completed');
      }

      const setupToken = await tx.setupToken.findUnique({ where: { tokenHash } });
      if (!setupToken || setupToken.expiresAt < new Date()) {
        throw new BadRequestException('This setup token is invalid or has expired');
      }

      const passwordHash = await argon2.hash(dto.password);
      const created = await tx.user.create({
        data: { organizationId: null, email: dto.email, passwordHash, role: 'super_admin' },
      });

      await tx.setupToken.deleteMany({});
      return created;
    });

    await this.audit.record(context, {
      actorUserId: admin.id,
      action: 'user.setup_wizard_completed',
      entityType: 'user',
      entityId: admin.id,
    });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/api && npx jest setup/setup.service.spec.ts`
Expected: PASS, all 7 tests.

- [ ] **Step 5: Run full API package type-check**

Run: `cd apps/api && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/setup/dto/complete-setup.dto.ts apps/api/src/setup/setup.service.ts apps/api/src/setup/setup.service.spec.ts
git commit -m "feat: add SetupService with boot-time token generation and completion logic"
```

---

### Task 3: Backend — SetupController + SetupModule + wiring + live verification

**Files:**
- Create: `apps/api/src/setup/setup.controller.ts`
- Create: `apps/api/src/setup/setup.module.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `SetupService.needsSetup()`, `SetupService.completeSetup(dto)` (Task 2), `CompleteSetupDto` (Task 2), `STRICT_AUTH_THROTTLE` from `apps/api/src/rate-limit-tiers.ts`.
- Produces: `GET /setup/status` → `{needsSetup: boolean}`; `POST /setup/complete` → `{success: true}` on success, throws on failure. Task 4's frontend page calls both directly.

- [ ] **Step 1: Create the controller**

Create `apps/api/src/setup/setup.controller.ts`:

```typescript
import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { SetupService } from './setup.service';
import { CompleteSetupDto } from './dto/complete-setup.dto';
import { STRICT_AUTH_THROTTLE } from '../rate-limit-tiers';

@Controller('setup')
export class SetupController {
  constructor(private readonly setupService: SetupService) {}

  @Get('status')
  async status() {
    return { needsSetup: await this.setupService.needsSetup() };
  }

  @Post('complete')
  @HttpCode(200)
  @Throttle(STRICT_AUTH_THROTTLE)
  async complete(@Body() dto: CompleteSetupDto) {
    await this.setupService.completeSetup(dto);
    return { success: true };
  }
}
```

Note there is no `@UseGuards(...)` on this controller — this is deliberate and matches the plan's Global Constraints. `AuthController` (`apps/api/src/auth/auth.controller.ts`) is the existing precedent for a controller with no class-level guards.

- [ ] **Step 2: Create the module**

Create `apps/api/src/setup/setup.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { AuditModule } from '@exam-platform/shared';
import { SetupService } from './setup.service';
import { SetupController } from './setup.controller';

@Module({
  imports: [AuditModule],
  controllers: [SetupController],
  providers: [SetupService],
})
export class SetupModule {}
```

- [ ] **Step 3: Wire SetupModule into AppModule**

In `apps/api/src/app.module.ts`, add the import:

```typescript
import { SetupModule } from './setup/setup.module';
```

And add `SetupModule` to the `imports` array (after `AuthModule` works well, keeping auth-adjacent modules together):

```typescript
    AuthModule,
    SetupModule,
    OrganizationsModule,
```

- [ ] **Step 4: Run full API package type-check**

Run: `cd apps/api && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Live-verify against the real dev database**

This step requires the database to genuinely have zero `super_admin` rows, which it normally won't (the seed script creates one). Do this against a way to observe the behavior without destroying real dev data:

First, confirm the current dev DB already has a `super_admin` (from seeding) and the wizard correctly refuses to activate:

```bash
cd apps/api && npm run start:dev
```

Wait ~15-20 seconds for boot, then check the server log — it should **not** contain a "No super_admin account exists yet" warning (since the seeded `super@platform.test` already exists). Confirm via curl:

```bash
curl -s http://localhost:3501/api/v1/setup/status
```

Expected: `{"needsSetup":false}`

```bash
curl -s -X POST http://localhost:3501/api/v1/setup/complete -H "Content-Type: application/json" -d '{"token":"anything","email":"should-fail@test.local","password":"password1"}'
```

Expected: `400` with a message like `"Setup has already been completed"`.

Now simulate the true "fresh deployment" case by temporarily deleting the seeded `super_admin` row directly (safe — this is local dev data, and the seed script re-creates it on the next `npx prisma db seed` if needed). Run this one-off script from `apps/api` (it uses the same Prisma client the app itself uses, so no separate SQL tooling is required):

```bash
cd apps/api && node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.\$transaction(async (tx) => {
  // Session context must be set on the SAME pooled connection the delete runs on --
  // \$transaction guarantees that; two separate top-level calls would not (this is the
  // same reason TenantPrismaService.forTenant wraps both in one transaction).
  await tx.\$executeRawUnsafe(\`EXEC sp_set_session_context @key = N'app_is_super_admin', @value = 1\`);
  return tx.user.deleteMany({ where: { email: 'super@platform.test', organizationId: null } });
})
  .then((result) => console.log('Deleted rows:', result.count))
  .finally(() => prisma.\$disconnect());
"
```

Expected: `Deleted rows: 1`. Then restart the dev server:

```bash
# stop the running dev server (Ctrl+C or kill its PID), then:
cd apps/api && npm run start:dev
```

Wait for boot, then check the log for a line like: `No super_admin account exists yet. Visit http://localhost:3000/setup and complete setup with this one-time token: <64-hex-char-token>`. Copy that token.

```bash
curl -s http://localhost:3501/api/v1/setup/status
```

Expected: `{"needsSetup":true}`

```bash
curl -s -X POST http://localhost:3501/api/v1/setup/complete -H "Content-Type: application/json" -d '{"token":"<paste-the-token>","email":"ops@test.local","password":"SetupVerify123!"}'
```

Expected: `200` with `{"success":true}`.

```bash
curl -s http://localhost:3501/api/v1/setup/status
```

Expected: `{"needsSetup":false}` (the wizard has now permanently disabled itself).

```bash
curl -s -X POST http://localhost:3501/api/v1/setup/complete -H "Content-Type: application/json" -d '{"token":"<the-same-token-again>","email":"attacker@test.local","password":"password1"}'
```

Expected: `400` — the token was already deleted on first use, so this must fail even with the correct raw token value.

Finally, confirm the newly-created account can log in:

```bash
curl -s -X POST http://localhost:3501/api/v1/auth/staff/login -H "Content-Type: application/json" -d '{"email":"ops@test.local","password":"SetupVerify123!"}'
```

Expected: `200` with an `accessToken`.

Stop the dev server. Re-run `cd apps/api && npx prisma db seed` to restore the local dev environment's usual seeded data (demo org, demo `super_admin`, etc.) for whoever uses this checkout next.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/setup/setup.controller.ts apps/api/src/setup/setup.module.ts apps/api/src/app.module.ts
git commit -m "feat: add GET/POST /setup endpoints for the first-run setup wizard"
```

---

### Task 4: Frontend — /setup page

**Files:**
- Create: `apps/web/app/setup/page.tsx`
- Test: `apps/web/app/setup/page.test.tsx`

**Interfaces:**
- Consumes: `apiFetch` (`apps/web/lib/api-client.ts`), `Input`/`Button` from `apps/web/components/ui`, matching the exact structure of `apps/web/app/reset-password/[token]/page.tsx` (the closest existing precedent: an unauthenticated, standalone, token-driven form page).
- Produces: nothing consumed by a later task — this is the final implementation task before verification.

- [ ] **Step 1: Write the failing test**

Create `apps/web/app/setup/page.test.tsx`:

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SetupPage from './page';
import * as apiClient from '../../lib/api-client';

jest.mock('../../lib/api-client');
const mockedApiFetch = apiClient.apiFetch as jest.Mock;

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }));

describe('SetupPage', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockedApiFetch.mockReset();
  });

  it('redirects to /login when setup is already complete', async () => {
    mockedApiFetch.mockResolvedValueOnce({ needsSetup: false });
    render(<SetupPage />);
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/login'));
  });

  it('shows the form when setup is needed, and submits token/email/password', async () => {
    mockedApiFetch.mockResolvedValueOnce({ needsSetup: true });
    render(<SetupPage />);

    const tokenInput = await screen.findByLabelText('Setup token');
    fireEvent.change(tokenInput, { target: { value: 'raw-token-value' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ops@test.local' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'SetupVerify123!' } });

    mockedApiFetch.mockResolvedValueOnce({ success: true });
    fireEvent.click(screen.getByRole('button', { name: 'Complete setup' }));

    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith(
        '/setup/complete',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ token: 'raw-token-value', email: 'ops@test.local', password: 'SetupVerify123!' }),
        }),
      ),
    );
  });

  it('shows an error message when completion fails', async () => {
    mockedApiFetch.mockResolvedValueOnce({ needsSetup: true });
    render(<SetupPage />);

    await screen.findByLabelText('Setup token');
    fireEvent.change(screen.getByLabelText('Setup token'), { target: { value: 'wrong-token' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'ops@test.local' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'SetupVerify123!' } });

    mockedApiFetch.mockRejectedValueOnce(new Error('This setup token is invalid or has expired'));
    fireEvent.click(screen.getByRole('button', { name: 'Complete setup' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('This setup token is invalid or has expired');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && npx jest setup/page.test.tsx`
Expected: FAIL — `Cannot find module './page'`

- [ ] **Step 3: Implement the page**

Create `apps/web/app/setup/page.tsx`:

```typescript
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, Mail, Lock, AlertCircle } from 'lucide-react';
import { apiFetch } from '../../lib/api-client';
import { Button, Input } from '../../components/ui';

export default function SetupPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [token, setToken] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    apiFetch('/setup/status')
      .then((result: { needsSetup: boolean }) => {
        if (!result.needsSetup) {
          router.push('/login');
        } else {
          setChecking(false);
        }
      })
      .catch(() => setChecking(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiFetch('/setup/complete', { method: 'POST', body: JSON.stringify({ token, email, password }) });
      setSuccess(true);
      setTimeout(() => router.push('/login'), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (checking) {
    return <p className="p-8 text-sm text-gray-500">Loading…</p>;
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-6 py-12">
      <div className="w-full max-w-sm">
        <h1 className="mb-2 text-xl font-semibold text-gray-900">Platform setup</h1>
        <p className="mb-6 text-sm text-gray-600">
          Create the first platform administrator account. Use the one-time token printed to the server log at startup.
        </p>
        {success ? (
          <p className="text-sm text-gray-600">Setup complete. Redirecting to login&hellip;</p>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <Input label="Setup token" value={token} onChange={setToken} required icon={<KeyRound size={16} />} />
            <Input label="Email" type="email" value={email} onChange={setEmail} required icon={<Mail size={16} />} />
            <Input
              label="Password"
              type="password"
              value={password}
              onChange={setPassword}
              required
              icon={<Lock size={16} />}
            />
            <Button type="submit" loading={submitting}>
              Complete setup
            </Button>
            {error && (
              <p role="alert" className="flex items-center gap-2 text-sm text-status-danger">
                <AlertCircle size={16} />
                {error}
              </p>
            )}
          </form>
        )}
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/web && npx jest setup/page.test.tsx`
Expected: PASS, all 3 tests.

- [ ] **Step 5: Run frontend type-check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no NEW errors (10 pre-existing baseline errors in unrelated test files are expected and fine — confirmed unrelated across every prior feature this session).

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/setup/page.tsx apps/web/app/setup/page.test.tsx
git commit -m "feat: add /setup first-run wizard page"
```

---

### Task 5: Final verification

**Files:** none (verification only).

**Interfaces:** none — this task exercises the full stack built in Tasks 1-4.

- [ ] **Step 1: Run the full test suites**

Run: `cd apps/api && npx jest`
Expected: all tests pass, including the 7 new `setup.service.spec.ts` tests.

Run: `cd apps/web && npx jest`
Expected: all tests pass, including the 3 new `setup/page.test.tsx` tests.

- [ ] **Step 2: Type-check both packages**

Run: `cd apps/api && npx tsc --noEmit && cd ../web && npx tsc --noEmit`
Expected: no errors in `apps/api`; only the same 10 pre-existing baseline errors in `apps/web`.

- [ ] **Step 3: Live browser verification**

Using the same technique as Task 3 Step 5:

1. Delete the seeded `super_admin` row so the dev DB has zero `super_admin` accounts, using the exact one-off script from Task 3 Step 5 (`node -e "..."` wrapping the session-context `EXEC` and the delete in one `$transaction`).
2. Start both the API (`cd apps/api && npm run start:dev`) and web (`cd apps/web && npx next dev -p 3002`) dev servers.
3. In a browser, navigate to `http://localhost:3002/setup`. Confirm the form renders (not an immediate redirect to `/login`).
4. Copy the token from the API server's console log.
5. Fill in the form (token, a real email, a password) and submit. Confirm the success message appears and the page redirects to `/login` after ~2 seconds.
6. Log in on `/login` with the email/password just created and no organization slug. Confirm it redirects to `/organizations` (the existing `super_admin` login redirect), proving the new account really is a working `super_admin`.
7. Navigate back to `http://localhost:3002/setup` directly. Confirm it immediately redirects to `/login` (setup is already done — no dead-end form).
8. Restart the API dev server once more with the `super_admin` still present. Confirm the server log does **not** print a new setup token (setup no longer needed).

Restore the dev environment afterward: stop both servers, run `cd apps/api && npx prisma db seed` to restore the usual seeded demo data, and revert `apps/web/next-env.d.ts` if the dev server regenerated it (`git checkout -- apps/web/next-env.d.ts`).

- [ ] **Step 4: Update the progress ledger**

Append to `.superpowers/sdd/progress.md`:

```
=== FIRST-RUN SETUP WIZARD FEATURE COMPLETE — ready for final whole-branch review ===
```
