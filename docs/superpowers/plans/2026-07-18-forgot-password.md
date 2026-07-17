# Forgot Password Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a self-service password-reset flow for staff accounts (recruiter/org-admin/panel) — a "Forgot password?" link on the login page, an org-scoped reset request, and a token-based reset-password page.

**Architecture:** Two new backend endpoints (`POST /auth/forgot-password`, `POST /auth/reset-password`) on the existing `AuthController`/`AuthService`, backed by a new `PasswordResetToken` table storing sha256-hashed single-use tokens. Two new frontend pages (`/forgot-password`, `/reset-password/[token]`) reusing the split-screen shell and primitives from the recently-redesigned login page.

**Tech Stack:** NestJS + Prisma (SQL Server), argon2 (password hashing), Node's built-in `crypto` (token generation/hashing), nodemailer (existing `EmailService`), Next.js App Router + React, Tailwind CSS, `lucide-react`.

## Global Constraints

- Email is only unique per organization (`@@unique([organizationId, email])` on `User`), not globally — the forgot-password request always takes `organizationSlug` + `email` together, exactly like login.
- Reset tokens are hashed at rest with sha256; the raw token exists only in the emailed link and briefly in request memory, never persisted.
- Tokens expire 15 minutes after creation and are single-use (`usedAt` set on successful reset).
- `POST /auth/forgot-password` always returns the same generic success message regardless of whether the org/email matched a real account — this is the actual enumeration defense (response content). Exact response-timing parity is not attempted: email dispatch is fire-and-forget (matching the existing invitation-email pattern in `apps/api/src/invitations/invitations.service.ts`), so the dominant cost (SMTP round-trip) never blocks the response in either branch; the residual timing delta is a handful of extra DB queries in the found-path, an impractical side channel not worth the complexity of simulating.
- On a successful reset, every non-revoked `RefreshToken` row for that user is revoked (`revokedAt` set), forcing re-login everywhere else — reusing the exact revocation pattern in `apps/api/src/auth/auth.service.ts:119-122`.
- New password validated with `@MinLength(8)`, matching `apps/api/src/users/dto/create-user.dto.ts`.
- No changes to candidate authentication — candidates use invite links, not passwords, and are entirely out of scope.
- No new e2e golden-path spec — this is additive to login, not a change to any of the 7 existing golden-path fixtures.

---

### Task 1: Schema — `PasswordResetToken` model

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (add `PasswordResetToken` model, add back-relation on `User`)
- Create: `apps/api/prisma/migrations/20260718020000_password_reset_tokens/migration.sql`

**Interfaces:**
- Produces: Prisma model `PasswordResetToken` with fields `id: String`, `userId: String`, `tokenHash: String` (unique), `expiresAt: DateTime`, `usedAt: DateTime | null`, `createdAt: DateTime`. Accessed in later tasks as `this.prisma.passwordResetToken.{create,findUnique,update}`.

- [ ] **Step 1: Add the model to `schema.prisma`**

Find the `User` model (starts at line 40) and add a back-relation field. The current model ends with:

```prisma
model User {
  id             String         @id @default(uuid()) @db.UniqueIdentifier
  organizationId String?        @map("organization_id") @db.UniqueIdentifier
  organization   Organization?  @relation(fields: [organizationId], references: [id])
  email          String
  passwordHash   String         @map("password_hash")
  role           String
  status         String         @default("active")
  lastLoginAt    DateTime?      @map("last_login_at")
  createdAt      DateTime       @default(now()) @map("created_at")
  refreshTokens  RefreshToken[]
  auditLogs      AuditLog[]

  @@unique([organizationId, email])
  @@map("users")
}
```

Add `passwordResetTokens PasswordResetToken[]` right after `refreshTokens  RefreshToken[]`:

```prisma
model User {
  id                  String                @id @default(uuid()) @db.UniqueIdentifier
  organizationId      String?               @map("organization_id") @db.UniqueIdentifier
  organization        Organization?         @relation(fields: [organizationId], references: [id])
  email               String
  passwordHash        String                @map("password_hash")
  role                String
  status              String                @default("active")
  lastLoginAt         DateTime?             @map("last_login_at")
  createdAt           DateTime              @default(now()) @map("created_at")
  refreshTokens       RefreshToken[]
  passwordResetTokens PasswordResetToken[]
  auditLogs           AuditLog[]

  @@unique([organizationId, email])
  @@map("users")
}
```

Then add the new model right after the existing `RefreshToken` model (which ends at line 88 with `@@map("refresh_tokens")\n}`):

```prisma
model PasswordResetToken {
  id        String    @id @default(uuid()) @db.UniqueIdentifier
  userId    String    @map("user_id") @db.UniqueIdentifier
  user      User      @relation(fields: [userId], references: [id])
  tokenHash String    @unique @map("token_hash")
  expiresAt DateTime  @map("expires_at")
  usedAt    DateTime? @map("used_at")
  createdAt DateTime  @default(now()) @map("created_at")

  @@index([userId])
  @@map("password_reset_tokens")
}
```

- [ ] **Step 2: Write the migration SQL by hand**

This project writes SQL Server migration files by hand rather than running `prisma migrate dev` against a live dev database (see the existing `apps/api/prisma/migrations/*/migration.sql` files for the convention). Create `apps/api/prisma/migrations/20260718020000_password_reset_tokens/migration.sql`:

```sql
-- CreateTable
CREATE TABLE [dbo].[password_reset_tokens] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [user_id] UNIQUEIDENTIFIER NOT NULL,
    [token_hash] NVARCHAR(1000) NOT NULL,
    [expires_at] DATETIME2 NOT NULL,
    [used_at] DATETIME2,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [password_reset_tokens_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [password_reset_tokens_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE UNIQUE NONCLUSTERED INDEX [password_reset_tokens_token_hash_key] ON [dbo].[password_reset_tokens]([token_hash]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [password_reset_tokens_user_id_idx] ON [dbo].[password_reset_tokens]([user_id]);

-- AddForeignKey
ALTER TABLE [dbo].[password_reset_tokens] ADD CONSTRAINT [password_reset_tokens_user_id_fkey] FOREIGN KEY ([user_id]) REFERENCES [dbo].[users]([id]) ON DELETE NO ACTION ON UPDATE CASCADE;
```

The `ON DELETE NO ACTION ON UPDATE CASCADE` matches the existing `refresh_tokens_user_id_fkey` constraint's convention exactly (both are auth-adjacent, user-keyed tables).

- [ ] **Step 3: Regenerate the Prisma client and verify**

Run: `cd apps/api && npx prisma validate`
Expected: `The schema at prisma\schema.prisma is valid 🚀`

Run: `cd apps/api && npx prisma generate`
Expected: completes without error, regenerates `@prisma/client` types including `PasswordResetToken`.

- [ ] **Step 4: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260718020000_password_reset_tokens/migration.sql
git commit -m "feat: add PasswordResetToken schema for staff password reset"
```

---

### Task 2: Backend — `POST /auth/forgot-password`

**Files:**
- Create: `apps/api/src/auth/dto/forgot-password.dto.ts`
- Modify: `apps/api/src/auth/auth.service.ts`
- Modify: `apps/api/src/auth/auth.controller.ts`
- Modify: `apps/api/src/auth/auth.module.ts`
- Test: `apps/api/src/auth/auth.service.spec.ts`

**Interfaces:**
- Consumes: `PasswordResetToken` model (Task 1), `EmailService.send({to, subject, html}): Promise<{success: boolean, previewUrl?: string}>` (`apps/api/src/email/email.service.ts`, already exists), `EmailModule` (`apps/api/src/email/email.module.ts`, already exists, exports `EmailService`).
- Produces: `AuthService.forgotPassword(dto: ForgotPasswordDto): Promise<void>`. `POST /auth/forgot-password` route, `@Throttle(STRICT_AUTH_THROTTLE)`, always responds `200 { message: string }`.

- [ ] **Step 1: Create the DTO**

Create `apps/api/src/auth/dto/forgot-password.dto.ts`:

```typescript
import { IsEmail, IsString } from 'class-validator';

export class ForgotPasswordDto {
  @IsString()
  organizationSlug!: string;

  @IsEmail()
  email!: string;
}
```

- [ ] **Step 2: Write the failing tests**

Open `apps/api/src/auth/auth.service.spec.ts`. First, update the `beforeEach` block to add `EmailService` and `PasswordResetToken`/`Organization`/`User` mocks the new tests need. Replace the entire `beforeEach` block (and the `prisma`/`tenantPrisma`/`audit` variable declarations above it) with:

```typescript
describe('AuthService', () => {
  let service: AuthService;
  let prisma: {
    organization: { findUnique: jest.Mock };
    refreshToken: { create: jest.Mock; findFirst: jest.Mock; update: jest.Mock; updateMany: jest.Mock };
    user: { findUnique: jest.Mock };
    passwordResetToken: { create: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
    $transaction: jest.Mock;
  };
  let tenantPrisma: { forTenant: jest.Mock };
  let audit: { record: jest.Mock };
  let emailService: { send: jest.Mock };
  let jwt: JwtService;

  beforeEach(async () => {
    prisma = {
      organization: { findUnique: jest.fn() },
      refreshToken: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
      user: { findUnique: jest.fn() },
      passwordResetToken: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
      $transaction: jest.fn(async (callback: (tx: unknown) => unknown) => callback(prisma)),
    };
    tenantPrisma = { forTenant: jest.fn() };
    audit = { record: jest.fn() };
    emailService = { send: jest.fn().mockResolvedValue({ success: true }) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: TenantPrismaService, useValue: tenantPrisma },
        { provide: AuditService, useValue: audit },
        { provide: EmailService, useValue: emailService },
        JwtService,
      ],
    }).compile();

    service = moduleRef.get(AuthService);
    jwt = moduleRef.get(JwtService);
    process.env.JWT_ACCESS_SECRET = 'test-secret';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
  });
```

Add `import { EmailService } from '../email/email.service';` to the top of the file, alongside the other imports.

Now append these two new tests at the end of the `describe('AuthService', ...)` block, right before its closing `});`:

```typescript
  describe('forgotPassword', () => {
    it('creates a hashed reset token and emails a link when the org and user match', async () => {
      prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', slug: 'demo-org' });
      tenantPrisma.forTenant.mockResolvedValue({ id: 'user-1', email: 'admin@demo-org.test', organizationId: 'org-1' });
      prisma.passwordResetToken.create.mockResolvedValue({});

      await service.forgotPassword({ organizationSlug: 'demo-org', email: 'admin@demo-org.test' });

      expect(prisma.passwordResetToken.create).toHaveBeenCalledTimes(1);
      const createCall = prisma.passwordResetToken.create.mock.calls[0][0];
      expect(createCall.data.userId).toBe('user-1');
      expect(createCall.data.tokenHash).toEqual(expect.any(String));
      expect(createCall.data.tokenHash).not.toBe(''); // a hash was computed, not the raw token stored directly
      expect(createCall.data.expiresAt.getTime()).toBeGreaterThan(Date.now());

      // Email dispatch is fire-and-forget; give the microtask queue a tick to run it.
      await new Promise((resolve) => setImmediate(resolve));
      expect(emailService.send).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'admin@demo-org.test', subject: expect.any(String) }),
      );
    });

    it('does not create a token or send an email when the org slug does not resolve, and does not throw', async () => {
      prisma.organization.findUnique.mockResolvedValue(null);

      await expect(
        service.forgotPassword({ organizationSlug: 'no-such-org', email: 'a@b.com' }),
      ).resolves.toBeUndefined();

      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
      expect(emailService.send).not.toHaveBeenCalled();
    });

    it('does not create a token or send an email when the email does not match a user in that org, and does not throw', async () => {
      prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', slug: 'demo-org' });
      tenantPrisma.forTenant.mockResolvedValue(null);

      await expect(
        service.forgotPassword({ organizationSlug: 'demo-org', email: 'nobody@demo-org.test' }),
      ).resolves.toBeUndefined();

      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
      expect(emailService.send).not.toHaveBeenCalled();
    });
  });
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd apps/api && npx jest auth/auth.service.spec.ts -v`
Expected: the 3 new tests FAIL with `service.forgotPassword is not a function`. The pre-existing tests should still pass (the `beforeEach` change is additive).

- [ ] **Step 4: Implement `forgotPassword` on `AuthService`**

Open `apps/api/src/auth/auth.service.ts`. Update the import block at the top: change `import { randomUUID } from 'crypto';` to `import { randomBytes, createHash, randomUUID } from 'crypto';`, and add `import { EmailService } from '../email/email.service';` and `import { ForgotPasswordDto } from './dto/forgot-password.dto';`.

Add this constant right after the `TokenPair` interface (before `@Injectable()`):

```typescript
const PASSWORD_RESET_EXPIRY_MINUTES = 15;
```

Update the constructor to inject `EmailService`:

```typescript
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
    private readonly emailService: EmailService,
  ) {}
```

Add the `forgotPassword` method right after `login()` (before `refresh()`):

```typescript
  async forgotPassword(dto: ForgotPasswordDto): Promise<void> {
    const org = await this.prisma.organization.findUnique({ where: { slug: dto.organizationSlug } });
    if (!org) {
      return;
    }

    const user = await this.tenantPrisma.forTenant({ organizationId: org.id, isSuperAdmin: false }, (tx) =>
      tx.user.findFirst({ where: { email: dto.email, organizationId: org.id } }),
    );
    if (!user) {
      return;
    }

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + PASSWORD_RESET_EXPIRY_MINUTES);

    await this.prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash, expiresAt } });

    // Fire-and-forget, matching the invitation-email pattern in InvitationsService:
    // email delivery is a notification side effect, not something the caller should
    // wait on (or that should make forgotPassword() throw on SMTP failure).
    this.dispatchResetEmail(user.email, rawToken).catch((error) =>
      this.logger.error(`Failed to dispatch password reset email to ${user.email}`, error as Error),
    );
  }

  private async dispatchResetEmail(email: string, rawToken: string): Promise<void> {
    const link = `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/reset-password/${rawToken}`;
    await this.emailService.send({
      to: email,
      subject: 'Reset your password',
      html: `<p>Click the link below to reset your password. This link expires in 15 minutes.</p><p><a href="${link}">${link}</a></p>`,
    });
  }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/api && npx jest auth/auth.service.spec.ts -v`
Expected: all tests pass (the 3 new `forgotPassword` tests plus every pre-existing test).

- [ ] **Step 6: Wire the controller endpoint**

Open `apps/api/src/auth/auth.controller.ts`. Add `import { ForgotPasswordDto } from './dto/forgot-password.dto';` to the imports. Add this endpoint right after the `login()` method (before `refresh()`):

```typescript
  @Post('forgot-password')
  @HttpCode(200)
  @Throttle(STRICT_AUTH_THROTTLE)
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.authService.forgotPassword(dto);
    return { message: 'If an account with that organization and email exists, a reset link has been sent.' };
  }
```

- [ ] **Step 7: Wire `EmailModule` into `AuthModule`**

Open `apps/api/src/auth/auth.module.ts`. Add `import { EmailModule } from '../email/email.module';` and add `EmailModule` to the `imports` array:

```typescript
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { AuditModule } from '@exam-platform/shared';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [PassportModule, JwtModule.register({}), AuditModule, EmailModule],
  providers: [AuthService, JwtStrategy],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}
```

- [ ] **Step 8: Full backend build check**

Run: `cd apps/api && npx tsc --noEmit`
Expected: no new errors (the module now compiles with `EmailService` correctly wired end-to-end: `EmailModule` → `AuthModule` → `AuthService` constructor).

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/auth/dto/forgot-password.dto.ts apps/api/src/auth/auth.service.ts apps/api/src/auth/auth.service.spec.ts apps/api/src/auth/auth.controller.ts apps/api/src/auth/auth.module.ts
git commit -m "feat: add POST /auth/forgot-password"
```

---

### Task 3: Backend — `POST /auth/reset-password`

**Files:**
- Create: `apps/api/src/auth/dto/reset-password.dto.ts`
- Modify: `apps/api/src/auth/auth.service.ts`
- Modify: `apps/api/src/auth/auth.controller.ts`
- Test: `apps/api/src/auth/auth.service.spec.ts`

**Interfaces:**
- Consumes: `PasswordResetToken` model (Task 1), the `beforeEach` mock scaffolding added in Task 2 (reuses `prisma.passwordResetToken`, `prisma.$transaction`, `audit`).
- Produces: `AuthService.resetPassword(dto: ResetPasswordDto): Promise<void>`, throwing `BadRequestException` for an invalid/expired/used token. `POST /auth/reset-password` route, responds `200 { success: true }` on success.

- [ ] **Step 1: Create the DTO**

Create `apps/api/src/auth/dto/reset-password.dto.ts`:

```typescript
import { IsString, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @IsString()
  token!: string;

  @IsString()
  @MinLength(8)
  newPassword!: string;
}
```

- [ ] **Step 2: Write the failing tests**

Append this `describe` block to `apps/api/src/auth/auth.service.spec.ts`, right after the `forgotPassword` describe block added in Task 2 (still inside the outer `describe('AuthService', ...)`):

```typescript
  describe('resetPassword', () => {
    it('rejects a token that does not exist', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(null);

      await expect(
        service.resetPassword({ token: 'no-such-token', newPassword: 'NewPassw0rd!' }),
      ).rejects.toThrow('This reset link is invalid or has expired');
    });

    it('rejects an expired token', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 'prt-1', userId: 'user-1', usedAt: null, expiresAt: new Date(Date.now() - 1000),
      });

      await expect(
        service.resetPassword({ token: 'raw-token', newPassword: 'NewPassw0rd!' }),
      ).rejects.toThrow('This reset link is invalid or has expired');
    });

    it('rejects an already-used token', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 'prt-1', userId: 'user-1', usedAt: new Date(), expiresAt: new Date(Date.now() + 60_000),
      });

      await expect(
        service.resetPassword({ token: 'raw-token', newPassword: 'NewPassw0rd!' }),
      ).rejects.toThrow('This reset link is invalid or has expired');
    });

    it('updates the password, marks the token used, revokes other sessions, and audits the reset on a valid token', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 'prt-1', userId: 'user-1', usedAt: null, expiresAt: new Date(Date.now() + 60_000),
      });
      prisma.user.findUnique.mockResolvedValue({ id: 'user-1', organizationId: 'org-1', role: 'recruiter' });

      await service.resetPassword({ token: 'raw-token', newPassword: 'NewPassw0rd!' });

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { passwordHash: expect.any(String) },
      });
      expect(prisma.passwordResetToken.update).toHaveBeenCalledWith({
        where: { id: 'prt-1' },
        data: { usedAt: expect.any(Date) },
      });
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(audit.record).toHaveBeenCalledWith(
        { organizationId: 'org-1', isSuperAdmin: false },
        { actorUserId: 'user-1', action: 'password.reset', entityType: 'user', entityId: 'user-1' },
      );
    });
  });
```

`prisma.user.update` needs to exist on the mock for the transaction callback to call it — add `update: jest.fn()` to the `user` mock object in the `beforeEach` block updated in Task 2:

```typescript
    user: { findUnique: jest.fn(), update: jest.fn() },
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd apps/api && npx jest auth/auth.service.spec.ts -v`
Expected: the 4 new `resetPassword` tests FAIL with `service.resetPassword is not a function`. All other tests (including the 3 `forgotPassword` tests from Task 2) still pass.

- [ ] **Step 4: Implement `resetPassword` on `AuthService`**

Open `apps/api/src/auth/auth.service.ts`. Add `BadRequestException` to the existing `import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';` line (making it `import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';`), and add `import { ResetPasswordDto } from './dto/reset-password.dto';`.

Add the `resetPassword` method right after `forgotPassword`/`dispatchResetEmail` (before `refresh()`):

```typescript
  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const tokenHash = createHash('sha256').update(dto.token).digest('hex');
    const resetToken = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash } });

    if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
      throw new BadRequestException('This reset link is invalid or has expired');
    }

    const passwordHash = await argon2.hash(dto.newPassword);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: resetToken.userId }, data: { passwordHash } });
      await tx.passwordResetToken.update({ where: { id: resetToken.id }, data: { usedAt: new Date() } });
      await tx.refreshToken.updateMany({
        where: { userId: resetToken.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });

    const user = await this.prisma.user.findUnique({ where: { id: resetToken.userId } });
    await this.audit.record(
      { organizationId: user?.organizationId ?? null, isSuperAdmin: user?.role === 'super_admin' },
      { actorUserId: resetToken.userId, action: 'password.reset', entityType: 'user', entityId: resetToken.userId },
    );
  }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/api && npx jest auth/auth.service.spec.ts -v`
Expected: all tests pass (the 4 new `resetPassword` tests, the 3 `forgotPassword` tests, and every pre-existing test).

- [ ] **Step 6: Wire the controller endpoint**

Open `apps/api/src/auth/auth.controller.ts`. Add `import { ResetPasswordDto } from './dto/reset-password.dto';`. Add this endpoint right after `forgotPassword()` (before `refresh()`):

```typescript
  @Post('reset-password')
  @HttpCode(200)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto);
    return { success: true };
  }
```

- [ ] **Step 7: Full backend verification**

Run: `cd apps/api && npx jest auth/ -v`
Expected: all `auth/` suite tests pass.

Run: `cd apps/api && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/auth/dto/reset-password.dto.ts apps/api/src/auth/auth.service.ts apps/api/src/auth/auth.service.spec.ts apps/api/src/auth/auth.controller.ts
git commit -m "feat: add POST /auth/reset-password"
```

---

### Task 4: Frontend — Forgot-password page + login link

**Files:**
- Create: `apps/web/app/forgot-password/page.tsx`
- Create: `apps/web/app/forgot-password/page.test.tsx`
- Modify: `apps/web/app/login/page.tsx`
- Modify: `apps/web/app/login/page.test.tsx`

**Interfaces:**
- Consumes: `apiFetch` (`apps/web/lib/api-client.ts`, unchanged signature), `useBranding(organizationSlug: string | null)` (`apps/web/lib/hooks/useBranding.ts`, unchanged), `Input`/`Button` from `apps/web/components/ui` (both already have `icon`/`loading` props from the login redesign).
- Produces: nothing consumed by later tasks in this plan.

- [ ] **Step 1: Write the failing test for the new page**

Create `apps/web/app/forgot-password/page.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ForgotPasswordPage from './page';
import { QueryProvider } from '../../lib/query-provider';

describe('ForgotPasswordPage', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('submits organization slug and email, then shows the generic success message', async () => {
    const fetchMock = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/forgot-password')) {
        return new Response(JSON.stringify({ message: 'If an account exists...' }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(
      <QueryProvider>
        <ForgotPasswordPage />
      </QueryProvider>,
    );

    await userEvent.type(screen.getByLabelText(/organization slug/i), 'demo-org');
    await userEvent.type(screen.getByLabelText(/email/i), 'recruiter@demo-org.test');
    await userEvent.click(screen.getByRole('button', { name: 'Send reset link' }));

    const call = fetchMock.mock.calls.find((c) => String(c[0]).endsWith('/auth/forgot-password'));
    expect(call).toBeDefined();
    expect(JSON.parse((call![1] as RequestInit).body as string)).toEqual({
      organizationSlug: 'demo-org',
      email: 'recruiter@demo-org.test',
    });

    await waitFor(() =>
      expect(screen.getByText(/we've sent a reset link/i)).toBeInTheDocument(),
    );
    expect(screen.getByRole('link', { name: 'Back to login' })).toHaveAttribute('href', '/login');
  });

  it('shows an error banner when the request fails', async () => {
    global.fetch = jest.fn(async () => new Response(JSON.stringify({ message: 'Too many requests' }), { status: 429 })) as unknown as typeof fetch;

    render(
      <QueryProvider>
        <ForgotPasswordPage />
      </QueryProvider>,
    );

    await userEvent.type(screen.getByLabelText(/organization slug/i), 'demo-org');
    await userEvent.type(screen.getByLabelText(/email/i), 'recruiter@demo-org.test');
    await userEvent.click(screen.getByRole('button', { name: 'Send reset link' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Too many requests');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx jest app/forgot-password/page.test.tsx`
Expected: FAIL — `./page` does not exist yet.

- [ ] **Step 3: Write the page**

Create `apps/web/app/forgot-password/page.tsx`:

```tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Building2, Mail, AlertCircle } from 'lucide-react';
import { apiFetch } from '../../lib/api-client';
import { Button, Input } from '../../components/ui';
import { useBranding } from '../../lib/hooks/useBranding';

export default function ForgotPasswordPage() {
  const [organizationSlug, setOrganizationSlug] = useState('');
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data: branding } = useBranding(organizationSlug || null);

  const primaryColor = branding?.primaryColor ?? undefined;
  const accentColor = branding?.accentColor ?? undefined;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiFetch('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ organizationSlug, email }),
      });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="grid md:min-h-screen md:grid-cols-2">
      <div
        className="relative hidden overflow-hidden md:flex md:flex-col md:items-start md:justify-center md:gap-4 md:px-16 md:py-12"
        style={{
          backgroundImage: `linear-gradient(135deg, ${primaryColor ?? 'var(--color-primary, #1a73e8)'}, ${accentColor ?? 'var(--color-accent, #fbbc04)'})`,
        }}
      >
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/10" aria-hidden="true" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-white/10" aria-hidden="true" />
        {branding?.logoUrl ? (
          <img src={branding.logoUrl} alt="Organization logo" className="relative z-10 max-h-14" />
        ) : (
          <p className="relative z-10 text-2xl font-bold text-white">Examination Platform</p>
        )}
        <p className="relative z-10 max-w-sm text-sm text-white/90">Sign in to manage exams, candidates, and results.</p>
      </div>

      <div className="flex flex-col items-center justify-center gap-4 bg-white px-6 py-12 md:hidden">
        {branding?.logoUrl ? (
          <img src={branding.logoUrl} alt="Organization logo" className="max-h-10" />
        ) : (
          <p className="text-lg font-bold text-primary">Examination Platform</p>
        )}
      </div>

      <div className="flex flex-1 items-center justify-center bg-white px-6 py-12">
        <div className="w-full max-w-sm">
          <h1 className="mb-2 text-xl font-semibold text-gray-900">Forgot password</h1>
          {submitted ? (
            <>
              <p className="mb-6 text-sm text-gray-600">
                If an account with that organization and email exists, we&apos;ve sent a reset link to that email.
              </p>
              <Link href="/login" className="text-sm font-medium text-primary hover:underline">
                Back to login
              </Link>
            </>
          ) : (
            <>
              <p className="mb-6 text-sm text-gray-600">
                Enter your organization slug and email, and we&apos;ll send you a link to reset your password.
              </p>
              <form onSubmit={handleSubmit} className="flex flex-col gap-3">
                <Input
                  label="Organization slug"
                  value={organizationSlug}
                  onChange={setOrganizationSlug}
                  required
                  icon={<Building2 size={16} />}
                />
                <Input label="Email" type="email" value={email} onChange={setEmail} required icon={<Mail size={16} />} />
                <Button type="submit" loading={submitting}>
                  Send reset link
                </Button>
                {error && (
                  <p role="alert" className="flex items-center gap-2 rounded-md bg-status-danger-bg px-3 py-2 text-sm text-status-danger">
                    <AlertCircle size={16} />
                    {error}
                  </p>
                )}
              </form>
              <Link href="/login" className="mt-4 inline-block text-sm font-medium text-primary hover:underline">
                Back to login
              </Link>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx jest app/forgot-password/page.test.tsx`
Expected: PASS — both tests green.

- [ ] **Step 5: Add the "Forgot password?" link to the login page**

Open `apps/web/app/login/page.tsx`. Add `import Link from 'next/link';` to the imports (right after the `useRouter` import). Insert a link right after the password field's closing `</div>` (the one wrapping the password `Input` and its show/hide toggle button) and before the submit `Button`:

```tsx
            <div className="relative">
              <Input
                label="Password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={setPassword}
                required
                icon={<Lock size={16} />}
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
            <Link href="/forgot-password" className="text-right text-sm font-medium text-primary hover:underline">
              Forgot password?
            </Link>
            <Button type="submit" loading={submitting}>
              Log in
            </Button>
```

- [ ] **Step 6: Update the login page test**

Open `apps/web/app/login/page.test.tsx`. Add this test inside the `describe('LoginPage', ...)` block, after the last existing `it`:

```tsx
  it('links to the forgot-password page', async () => {
    render(
      <QueryProvider>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </QueryProvider>,
    );

    expect(screen.getByRole('link', { name: 'Forgot password?' })).toHaveAttribute('href', '/forgot-password');
  });
```

- [ ] **Step 7: Run both test files to verify they pass**

Run: `cd apps/web && npx jest app/login/page.test.tsx app/forgot-password/page.test.tsx`
Expected: all tests pass (5 in `login/page.test.tsx`: 4 pre-existing + 1 new; 2 in `forgot-password/page.test.tsx`).

- [ ] **Step 8: Commit**

```bash
git add apps/web/app/forgot-password/page.tsx apps/web/app/forgot-password/page.test.tsx apps/web/app/login/page.tsx apps/web/app/login/page.test.tsx
git commit -m "feat: add forgot-password page and link it from login"
```

---

### Task 5: Frontend — Reset-password page

**Files:**
- Create: `apps/web/app/reset-password/[token]/page.tsx`
- Create: `apps/web/app/reset-password/[token]/page.test.tsx`

**Interfaces:**
- Consumes: `apiFetch`, `Input`/`Button` (same as Task 4). Uses `useParams<{ token: string }>()` from `next/navigation` to read the dynamic route segment — this project's established convention for client-component dynamic routes (e.g. `apps/web/app/(panel)/reports/[examId]/page.tsx`).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the failing test**

Create `apps/web/app/reset-password/[token]/page.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ResetPasswordPage from './page';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useParams: () => ({ token: 'raw-test-token' }),
  useRouter: () => ({ push: mockPush }),
}));

describe('ResetPasswordPage', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    mockPush.mockClear();
  });

  it('keeps submit disabled until the two password fields match', async () => {
    render(<ResetPasswordPage />);

    const submit = screen.getByRole('button', { name: 'Reset password' });
    expect(submit).toBeDisabled();

    await userEvent.type(screen.getByLabelText('New password'), 'NewPassw0rd!');
    expect(submit).toBeDisabled();

    await userEvent.type(screen.getByLabelText('Confirm new password'), 'NewPassw0rd!');
    expect(submit).not.toBeDisabled();
  });

  it('submits the token and new password, then shows a success message', async () => {
    const fetchMock = jest.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 }));
    global.fetch = fetchMock as unknown as typeof fetch;

    render(<ResetPasswordPage />);

    await userEvent.type(screen.getByLabelText('New password'), 'NewPassw0rd!');
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'NewPassw0rd!');
    await userEvent.click(screen.getByRole('button', { name: 'Reset password' }));

    const call = fetchMock.mock.calls.find((c) => String(c[0]).endsWith('/auth/reset-password'));
    expect(call).toBeDefined();
    expect(JSON.parse((call![1] as RequestInit).body as string)).toEqual({
      token: 'raw-test-token',
      newPassword: 'NewPassw0rd!',
    });

    await waitFor(() => expect(screen.getByText(/password has been reset/i)).toBeInTheDocument());
  });

  it('shows an invalid/expired error and a link to request a new one when the reset fails', async () => {
    global.fetch = jest.fn(
      async () => new Response(JSON.stringify({ message: 'This reset link is invalid or has expired' }), { status: 400 }),
    ) as unknown as typeof fetch;

    render(<ResetPasswordPage />);

    await userEvent.type(screen.getByLabelText('New password'), 'NewPassw0rd!');
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'NewPassw0rd!');
    await userEvent.click(screen.getByRole('button', { name: 'Reset password' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('This reset link is invalid or has expired');
    expect(screen.getByRole('link', { name: 'Request a new reset link' })).toHaveAttribute('href', '/forgot-password');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx jest "app/reset-password/\[token\]/page.test.tsx"`
Expected: FAIL — `./page` does not exist yet.

- [ ] **Step 3: Write the page**

Create `apps/web/app/reset-password/[token]/page.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Lock, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { apiFetch } from '../../../lib/api-client';
import { Button, Input } from '../../../components/ui';

export default function ResetPasswordPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiFetch('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, newPassword }),
      });
      setSuccess(true);
      setTimeout(() => router.push('/login'), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'This reset link is invalid or has expired.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="grid md:min-h-screen md:grid-cols-2">
      <div
        className="relative hidden overflow-hidden md:flex md:flex-col md:items-start md:justify-center md:gap-4 md:px-16 md:py-12"
        style={{ backgroundImage: 'linear-gradient(135deg, var(--color-primary, #1a73e8), var(--color-accent, #fbbc04))' }}
      >
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/10" aria-hidden="true" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-white/10" aria-hidden="true" />
        <p className="relative z-10 text-2xl font-bold text-white">Examination Platform</p>
        <p className="relative z-10 max-w-sm text-sm text-white/90">Sign in to manage exams, candidates, and results.</p>
      </div>

      <div className="flex flex-col items-center justify-center gap-4 bg-white px-6 py-12 md:hidden">
        <p className="text-lg font-bold text-primary">Examination Platform</p>
      </div>

      <div className="flex flex-1 items-center justify-center bg-white px-6 py-12">
        <div className="w-full max-w-sm">
          <h1 className="mb-6 text-xl font-semibold text-gray-900">Reset password</h1>
          {success ? (
            <p className="text-sm text-gray-600">Your password has been reset. Redirecting to login&hellip;</p>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <div className="relative">
                <Input
                  label="New password"
                  type={showPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={setNewPassword}
                  required
                  icon={<Lock size={16} />}
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
                value={confirmPassword}
                onChange={setConfirmPassword}
                required
                icon={<Lock size={16} />}
              />
              <Button type="submit" loading={submitting} disabled={!passwordsMatch}>
                Reset password
              </Button>
              {!passwordsMatch && confirmPassword.length > 0 && (
                <p className="text-xs text-gray-500">Passwords must match.</p>
              )}
              {error && (
                <div className="flex flex-col gap-2 rounded-md bg-status-danger-bg px-3 py-2 text-sm text-status-danger">
                  <p role="alert" className="flex items-center gap-2">
                    <AlertCircle size={16} />
                    {error}
                  </p>
                  <Link href="/forgot-password" className="font-medium underline">
                    Request a new reset link
                  </Link>
                </div>
              )}
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
```

Note: this page does not call `useBranding` — the reset link only carries a token, not an organization slug, so there is no way to resolve org-specific branding before the backend validates the token. The split-screen shell always shows the default platform gradient/wordmark here, matching the login/forgot-password pages' default (no-slug-yet) appearance.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx jest "app/reset-password/\[token\]/page.test.tsx"`
Expected: PASS — all 3 tests green.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/reset-password/[token]/page.tsx" "apps/web/app/reset-password/[token]/page.test.tsx"
git commit -m "feat: add reset-password page"
```

---

### Task 6: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Full backend unit suite**

Run: `cd apps/api && npx jest --runInBand`
Expected: every suite passes, including the updated `auth/auth.service.spec.ts` (10 tests: 3 pre-existing + 3 `forgotPassword` + 4 `resetPassword`).

- [ ] **Step 2: Full backend TypeScript check**

Run: `cd apps/api && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Full web unit suite**

Run: `cd apps/web && npx jest --runInBand`
Expected: every suite passes, including `login/page.test.tsx` (5 tests), `forgot-password/page.test.tsx` (2 tests), and `reset-password/[token]/page.test.tsx` (3 tests).

- [ ] **Step 4: Full web TypeScript check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no new errors (pre-existing unrelated errors, if any, are out of scope).

- [ ] **Step 5: Full Playwright suite**

Run: `cd apps/web && npx playwright test`
Expected: all specs pass exactly as they did before this feature — this plan adds new routes and one new link on the login page, and does not change any of the 7 golden-path specs' selectors or fixtures. If any golden-path spec fails, treat it as a real regression to investigate (e.g., confirm the "Forgot password?" link's accessible name doesn't collide with anything a spec queries by role/name), not something to edit around.

- [ ] **Step 6: Manual smoke check**

With `apps/api` and `apps/web` dev servers running: navigate to `/login`, click "Forgot password?", confirm it lands on `/forgot-password` with the same split-screen shell as login. Submit with a real seeded org/email (e.g. `demo-org` / `recruiter@demo-org.test`) and confirm the generic success message appears. Check the API server's console log for the Ethereal test-email preview URL (this project has no `SMTP_HOST` configured in dev, so `EmailService` falls back to Ethereal and logs a preview link — see `apps/api/src/email/email.service.ts:59-60`), open it, and confirm the emailed link points to `http://localhost:3000/reset-password/<a long hex token>` with a working "reset your password" message. Navigate to that link, confirm the reset-password page renders, type mismatched passwords and confirm the submit button stays disabled, then type matching passwords and submit — confirm the success message appears and it redirects to `/login` after ~2 seconds. Log in with the new password to confirm it actually took effect, and confirm logging in with the *old* password now fails. Also submit the forgot-password form a second time with an org slug that doesn't exist and confirm the exact same generic success message appears (no way to tell it apart from the real-account case).

- [ ] **Step 7: Update the SDD progress ledger**

Overwrite `.superpowers/sdd/progress.md` with:

```
# Forgot Password — SDD Progress Ledger

## Tasks
Task 1: complete (PasswordResetToken schema + migration)
Task 2: complete (POST /auth/forgot-password)
Task 3: complete (POST /auth/reset-password)
Task 4: complete (forgot-password page + login link)
Task 5: complete (reset-password page)
Task 6: complete (final verification)
```
