# Per-Organization Email & AI API Key Configuration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an org_admin configure their own SMTP credentials and AI (Anthropic) API key from a Settings screen, so their organization's emails and AI features use their own accounts instead of the platform's shared ones — falling back transparently to platform defaults when unconfigured.

**Architecture:** New encrypted nullable columns on `Organization`. A shared `OrgSecretsCryptoService` (AES-256-GCM) and `AiApiKeyResolverService` in `packages/shared`, usable by both `apps/api` and the separate `apps/exam-runtime` service since they share one database/schema. `EmailService` and all four Claude client call sites become org-aware, resolving per-org credentials when set and falling back to the existing platform-wide env vars otherwise. New `org:manage_settings`-gated endpoints let an org_admin save validated credentials from a new Integrations settings page.

**Tech Stack:** NestJS, Prisma (SQL Server), Node's built-in `crypto` module, `nodemailer`, `@anthropic-ai/sdk` (v0.32.1), Next.js App Router, React Query.

## Global Constraints

- `Organization` gains nullable columns only — an org with none of them set is functionally unchanged from today (spec: "opt-in... transparently falling back").
- Encryption: AES-256-GCM via Node's `crypto`, master key from `ORG_SECRETS_ENCRYPTION_KEY` (32-byte, hex-encoded), duplicated into both `apps/api/.env` and `apps/exam-runtime/.env`.
- The org's own `super_admin`-created welcome email (`OrganizationsService.create()`) and the platform-level `super_admin` invite/promote emails (`UsersService`) always use the platform default SMTP — never pass `organizationId` to `EmailService.send()`.
- SMTP save is validated via `nodemailer`'s `transporter.verify()` before persisting. AI key save is validated via one real `messages.create()` call with `max_tokens: 1` before persisting (no free metadata endpoint exists in the installed SDK version).
- Saved secrets are never returned by any API response, never logged, never included in audit metadata — only booleans (`smtpConfigured`, `aiKeyConfigured`) and the non-secret SMTP fields (`host`, `port`, `fromAddress`) are readable back.
- New endpoints gated by the existing `org:manage_settings` permission (same as branding).

---

## File Structure

- `apps/api/prisma/schema.prisma` (modify) — add SMTP + AI key columns to `Organization`.
- `apps/api/prisma/migrations/20260718190000_organization_integrations/migration.sql` (new).
- `packages/shared/src/crypto/org-secrets-crypto.service.ts` (new) — AES-256-GCM encrypt/decrypt.
- `packages/shared/src/crypto/ai-api-key-resolver.service.ts` (new) — per-org key lookup with platform fallback.
- `packages/shared/src/crypto/crypto.module.ts` (new).
- `packages/shared/src/index.ts` (modify) — export the three new files.
- `apps/api/src/email/email.service.ts` (modify) — org-aware transporter resolution.
- `apps/api/src/email/email.module.ts` (modify) — import `CryptoModule`.
- `apps/api/src/auth/auth.service.ts` (modify) — thread `organizationId` into the forgot-password email dispatch.
- `apps/api/src/jobs/processors/claude-question-generation.client.ts` (modify) — accept `apiKey` per call instead of a constructor-level client.
- `apps/api/src/jobs/processors/ai-question-generation.processor.ts` (modify) — resolve and pass the org's key.
- `apps/api/src/jobs/jobs.module.ts` (modify) — import `CryptoModule`.
- `apps/exam-runtime/src/proctoring-analysis/claude-proctoring.client.ts`, `apps/exam-runtime/src/attempt-insight/claude-insight.client.ts`, `apps/exam-runtime/src/code-review/claude-code-review.client.ts` (modify) — same per-call `apiKey` change.
- `apps/exam-runtime/src/proctoring-analysis/attempt-analysis.service.ts`, `apps/exam-runtime/src/attempt-insight/attempt-insight.service.ts`, `apps/exam-runtime/src/code-review/code-review.service.ts` (modify) — resolve and pass the org's key.
- `apps/exam-runtime/src/proctoring-analysis/proctoring-analysis.module.ts`, `apps/exam-runtime/src/attempt-insight/attempt-insight.module.ts`, `apps/exam-runtime/src/code-review/code-review.module.ts`, `apps/exam-runtime/src/app.module.ts` (modify) — import `CryptoModule`.
- `apps/api/src/organizations/dto/update-smtp-settings.dto.ts`, `apps/api/src/organizations/dto/update-ai-key.dto.ts` (new).
- `apps/api/src/organizations/organizations.service.ts` (modify) — `getIntegrations`/`updateSmtpSettings`/`updateAiKey`.
- `apps/api/src/organizations/organizations.controller.ts` (modify) — three new routes.
- `apps/api/src/organizations/organizations.module.ts` (modify) — import `CryptoModule`.
- `apps/web/lib/types.ts` (modify) — `IntegrationsResponse` type.
- `apps/web/lib/hooks/useIntegrations.ts` (new).
- `apps/web/app/(org-admin)/settings/integrations/page.tsx` (new).
- `apps/web/app/(org-admin)/layout.tsx` (modify) — nav link.

---

### Task 1: Schema — Organization integration columns + migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260718190000_organization_integrations/migration.sql`

**Interfaces:**
- Produces: `Organization.smtpHost`, `.smtpPort`, `.smtpUser`, `.smtpPasswordEncrypted`, `.emailFromAddress`, `.aiApiKeyEncrypted` — all nullable, accessible via `prisma.organization` in every later task.

- [ ] **Step 1: Add the columns to schema.prisma**

In `apps/api/prisma/schema.prisma`, in the `Organization` model, add these lines immediately after `accentColor String? @map("accent_color")`:

```prisma
  smtpHost              String?    @map("smtp_host")
  smtpPort              Int?       @map("smtp_port")
  smtpUser              String?    @map("smtp_user")
  smtpPasswordEncrypted String?    @map("smtp_password_encrypted")
  emailFromAddress      String?    @map("email_from_address")
  aiApiKeyEncrypted     String?    @map("ai_api_key_encrypted")
```

- [ ] **Step 2: Validate the schema**

Run: `cd apps/api && npx prisma validate`
Expected: `The schema at prisma\schema.prisma is valid 🚀`

- [ ] **Step 3: Create the migration**

Create `apps/api/prisma/migrations/20260718190000_organization_integrations/migration.sql`:

```sql
-- AlterTable: organizations gains optional per-org email/SMTP and AI API key configuration.
-- All nullable with no default -- an org with nothing set falls back to the platform's
-- shared SMTP account / ANTHROPIC_API_KEY exactly as before this migration.
ALTER TABLE [dbo].[organizations] ADD [smtp_host] NVARCHAR(1000);
ALTER TABLE [dbo].[organizations] ADD [smtp_port] INT;
ALTER TABLE [dbo].[organizations] ADD [smtp_user] NVARCHAR(1000);
ALTER TABLE [dbo].[organizations] ADD [smtp_password_encrypted] NVARCHAR(1000);
ALTER TABLE [dbo].[organizations] ADD [email_from_address] NVARCHAR(1000);
ALTER TABLE [dbo].[organizations] ADD [ai_api_key_encrypted] NVARCHAR(1000);
```

- [ ] **Step 4: Apply the migration and regenerate the client**

Run: `cd apps/api && npx prisma migrate deploy`
Expected: `The following migration(s) have been applied: ... 20260718190000_organization_integrations`

Run: `cd apps/api && npx prisma generate`
Expected: `Generated Prisma Client` with no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260718190000_organization_integrations
git commit -m "feat: add per-org SMTP and AI API key columns to Organization"
```

---

### Task 2: Shared encryption + AI key resolution

**Files:**
- Create: `packages/shared/src/crypto/org-secrets-crypto.service.ts`
- Create: `packages/shared/src/crypto/org-secrets-crypto.service.spec.ts`
- Create: `packages/shared/src/crypto/ai-api-key-resolver.service.ts`
- Create: `packages/shared/src/crypto/ai-api-key-resolver.service.spec.ts`
- Create: `packages/shared/src/crypto/crypto.module.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Consumes: `PrismaService` (`packages/shared/src/prisma/prisma.service.ts`), `process.env.ORG_SECRETS_ENCRYPTION_KEY`, `process.env.ANTHROPIC_API_KEY`.
- Produces: `OrgSecretsCryptoService.encrypt(plaintext: string): string`, `OrgSecretsCryptoService.decrypt(blob: string): string`, `AiApiKeyResolverService.resolve(organizationId: string): Promise<string>`, `CryptoModule` (NestJS module exporting both). Every later backend task imports `CryptoModule` and injects one or both services.

- [ ] **Step 1: Write the failing tests**

Create `packages/shared/src/crypto/org-secrets-crypto.service.spec.ts`:

```typescript
import { OrgSecretsCryptoService } from './org-secrets-crypto.service';

describe('OrgSecretsCryptoService', () => {
  let service: OrgSecretsCryptoService;

  beforeEach(() => {
    process.env.ORG_SECRETS_ENCRYPTION_KEY = '0'.repeat(64);
    service = new OrgSecretsCryptoService();
  });

  it('round-trips a plaintext value through encrypt then decrypt', () => {
    const blob = service.encrypt('sk-ant-super-secret-key');
    expect(service.decrypt(blob)).toBe('sk-ant-super-secret-key');
  });

  it('produces a different ciphertext each time (random IV)', () => {
    const first = service.encrypt('same-plaintext');
    const second = service.encrypt('same-plaintext');
    expect(first).not.toBe(second);
  });

  it('throws when the encryption key env var is missing', () => {
    delete process.env.ORG_SECRETS_ENCRYPTION_KEY;
    expect(() => service.encrypt('anything')).toThrow('ORG_SECRETS_ENCRYPTION_KEY is not set');
  });

  it('throws when decrypting a tampered blob (auth tag mismatch)', () => {
    const blob = service.encrypt('sensitive-value');
    const [iv, authTag, ciphertext] = blob.split('.');
    const tampered = [iv, authTag, ciphertext.slice(0, -4) + 'AAAA'].join('.');
    expect(() => service.decrypt(tampered)).toThrow();
  });
});
```

Create `packages/shared/src/crypto/ai-api-key-resolver.service.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { AiApiKeyResolverService } from './ai-api-key-resolver.service';
import { OrgSecretsCryptoService } from './org-secrets-crypto.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AiApiKeyResolverService', () => {
  let service: AiApiKeyResolverService;
  let prisma: { organization: { findUnique: jest.Mock } };
  let cryptoService: { decrypt: jest.Mock };

  beforeEach(async () => {
    prisma = { organization: { findUnique: jest.fn() } };
    cryptoService = { decrypt: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        AiApiKeyResolverService,
        { provide: PrismaService, useValue: prisma },
        { provide: OrgSecretsCryptoService, useValue: cryptoService },
      ],
    }).compile();
    service = moduleRef.get(AiApiKeyResolverService);
  });

  it("returns the org's own decrypted key when configured", async () => {
    prisma.organization.findUnique.mockResolvedValue({ aiApiKeyEncrypted: 'encrypted-blob' });
    cryptoService.decrypt.mockReturnValue('sk-ant-org-own-key');

    const result = await service.resolve('org-1');

    expect(cryptoService.decrypt).toHaveBeenCalledWith('encrypted-blob');
    expect(result).toBe('sk-ant-org-own-key');
  });

  it('falls back to the platform ANTHROPIC_API_KEY when the org has none configured', async () => {
    prisma.organization.findUnique.mockResolvedValue({ aiApiKeyEncrypted: null });
    process.env.ANTHROPIC_API_KEY = 'sk-ant-platform-key';

    const result = await service.resolve('org-1');

    expect(cryptoService.decrypt).not.toHaveBeenCalled();
    expect(result).toBe('sk-ant-platform-key');
  });

  it('throws when neither an org key nor a platform key is available', async () => {
    prisma.organization.findUnique.mockResolvedValue({ aiApiKeyEncrypted: null });
    delete process.env.ANTHROPIC_API_KEY;

    await expect(service.resolve('org-1')).rejects.toThrow(
      'No AI API key configured for this organization, and no platform-wide ANTHROPIC_API_KEY is set',
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/shared && npx jest crypto`
Expected: FAIL — `Cannot find module './org-secrets-crypto.service'`

- [ ] **Step 3: Implement the crypto service**

Create `packages/shared/src/crypto/org-secrets-crypto.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH_BYTES = 12;

@Injectable()
export class OrgSecretsCryptoService {
  private getKey(): Buffer {
    const hexKey = process.env.ORG_SECRETS_ENCRYPTION_KEY;
    if (!hexKey) {
      throw new Error('ORG_SECRETS_ENCRYPTION_KEY is not set');
    }
    const key = Buffer.from(hexKey, 'hex');
    if (key.length !== 32) {
      throw new Error('ORG_SECRETS_ENCRYPTION_KEY must be a 32-byte (64 hex character) key');
    }
    return key;
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.getKey(), iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return [iv.toString('base64'), authTag.toString('base64'), ciphertext.toString('base64')].join('.');
  }

  decrypt(blob: string): string {
    const [ivB64, authTagB64, ciphertextB64] = blob.split('.');
    if (!ivB64 || !authTagB64 || !ciphertextB64) {
      throw new Error('Malformed encrypted blob');
    }
    const decipher = createDecipheriv(ALGORITHM, this.getKey(), Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(authTagB64, 'base64'));
    const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextB64, 'base64')), decipher.final()]);
    return plaintext.toString('utf8');
  }
}
```

Create `packages/shared/src/crypto/ai-api-key-resolver.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OrgSecretsCryptoService } from './org-secrets-crypto.service';

@Injectable()
export class AiApiKeyResolverService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cryptoService: OrgSecretsCryptoService,
  ) {}

  async resolve(organizationId: string): Promise<string> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { aiApiKeyEncrypted: true },
    });
    if (org?.aiApiKeyEncrypted) {
      return this.cryptoService.decrypt(org.aiApiKeyEncrypted);
    }
    const platformKey = process.env.ANTHROPIC_API_KEY;
    if (!platformKey) {
      throw new Error('No AI API key configured for this organization, and no platform-wide ANTHROPIC_API_KEY is set');
    }
    return platformKey;
  }
}
```

Note: `Organization` has no row-level-security policy (confirmed this session — RLS is applied only to `dbo.users` and `dbo.audit_logs`), so a plain `prisma.organization.findUnique(...)` is correct here — no `TenantPrismaService` bypass is needed, unlike every `dbo.users` read/write elsewhere in this codebase.

Create `packages/shared/src/crypto/crypto.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { OrgSecretsCryptoService } from './org-secrets-crypto.service';
import { AiApiKeyResolverService } from './ai-api-key-resolver.service';

@Module({
  providers: [OrgSecretsCryptoService, AiApiKeyResolverService],
  exports: [OrgSecretsCryptoService, AiApiKeyResolverService],
})
export class CryptoModule {}
```

- [ ] **Step 4: Export the new files from the package index**

In `packages/shared/src/index.ts`, add these lines after the existing `export * from './audit/audit.service';`:

```typescript
export * from './crypto/crypto.module';
export * from './crypto/org-secrets-crypto.service';
export * from './crypto/ai-api-key-resolver.service';
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/shared && npx jest crypto`
Expected: PASS, all 7 tests (4 in `org-secrets-crypto.service.spec.ts`, 3 in `ai-api-key-resolver.service.spec.ts`).

- [ ] **Step 6: Run type-check**

Run: `cd packages/shared && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/crypto packages/shared/src/index.ts
git commit -m "feat: add OrgSecretsCryptoService and AiApiKeyResolverService to shared package"
```

---

### Task 3: Backend — org-aware EmailService

**Files:**
- Modify: `apps/api/src/email/email.service.ts`
- Modify: `apps/api/src/email/email.module.ts`
- Modify: `apps/api/src/auth/auth.service.ts`
- Test: `apps/api/src/email/email.service.spec.ts` (new)
- Test: `apps/api/src/auth/auth.service.spec.ts` (modify — add one assertion)

**Interfaces:**
- Consumes: `OrgSecretsCryptoService`, `CryptoModule` (Task 2), `PrismaService`.
- Produces: `EmailService.send(input: SendEmailInput)` where `SendEmailInput` gains an optional `organizationId?: string` field. No other task depends on new exports from this task, but `OrganizationsService.create()` and `UsersService`'s two email dispatchers are verified (not modified) to still call `send()` without `organizationId`, preserving the "always platform default" rule for those two flows.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/email/email.service.spec.ts`. This mocks `nodemailer` entirely (no real network calls — fast and deterministic), which also lets it assert on the exact transporter arguments and caching behavior, not just success/failure:

```typescript
const mockVerify = jest.fn();
const mockSendMail = jest.fn();
const mockCreateTransport = jest.fn(() => ({ verify: mockVerify, sendMail: mockSendMail }));
const mockCreateTestAccount = jest.fn();

jest.mock('nodemailer', () => ({
  createTransport: (...args: unknown[]) => mockCreateTransport(...args),
  createTestAccount: (...args: unknown[]) => mockCreateTestAccount(...args),
  getTestMessageUrl: jest.fn(() => undefined),
}));

import { EmailService } from './email.service';
import { PrismaService, OrgSecretsCryptoService } from '@exam-platform/shared';

describe('EmailService', () => {
  let service: EmailService;
  let prisma: { organization: { findUnique: jest.Mock } };
  let cryptoService: { decrypt: jest.Mock };

  beforeEach(() => {
    mockCreateTransport.mockClear();
    mockSendMail.mockReset().mockResolvedValue({});
    mockVerify.mockReset();
    mockCreateTestAccount.mockReset().mockResolvedValue({
      user: 'ethereal-user',
      pass: 'ethereal-pass',
      smtp: { host: 'smtp.ethereal.email', port: 587, secure: false },
    });
    prisma = { organization: { findUnique: jest.fn() } };
    cryptoService = { decrypt: jest.fn() };
    service = new EmailService(prisma as never, cryptoService as never);
    delete process.env.SMTP_HOST;
  });

  it('uses the org-specific SMTP transporter and from-address when the org has one configured', async () => {
    prisma.organization.findUnique.mockResolvedValue({
      smtpHost: 'smtp.customer.test',
      smtpPort: 465,
      smtpUser: 'customer-user',
      smtpPasswordEncrypted: 'encrypted-blob',
      emailFromAddress: 'no-reply@customer.test',
    });
    cryptoService.decrypt.mockReturnValue('customer-smtp-password');

    await service.send({ to: 'a@b.com', subject: 'Test', html: '<p>Test</p>', organizationId: 'org-1' });

    expect(prisma.organization.findUnique).toHaveBeenCalledWith({
      where: { id: 'org-1' },
      select: { smtpHost: true, smtpPort: true, smtpUser: true, smtpPasswordEncrypted: true, emailFromAddress: true },
    });
    expect(cryptoService.decrypt).toHaveBeenCalledWith('encrypted-blob');
    expect(mockCreateTransport).toHaveBeenCalledWith({
      host: 'smtp.customer.test',
      port: 465,
      auth: { user: 'customer-user', pass: 'customer-smtp-password' },
    });
    expect(mockSendMail).toHaveBeenCalledWith(expect.objectContaining({ from: 'no-reply@customer.test', to: 'a@b.com' }));
  });

  it('falls back to the platform transporter when no organizationId is given', async () => {
    const result = await service.send({ to: 'a@b.com', subject: 'Test', html: '<p>Test</p>' });

    expect(prisma.organization.findUnique).not.toHaveBeenCalled();
    expect(mockCreateTestAccount).toHaveBeenCalledTimes(1);
    expect(mockSendMail).toHaveBeenCalledWith(expect.objectContaining({ from: 'no-reply@exam-platform.test' }));
    expect(result.success).toBe(true);
  });

  it('falls back to the platform transporter when the given organizationId has no SMTP configured', async () => {
    prisma.organization.findUnique.mockResolvedValue({
      smtpHost: null,
      smtpPort: null,
      smtpUser: null,
      smtpPasswordEncrypted: null,
      emailFromAddress: null,
    });

    const result = await service.send({ to: 'a@b.com', subject: 'Test', html: '<p>Test</p>', organizationId: 'org-1' });

    expect(cryptoService.decrypt).not.toHaveBeenCalled();
    expect(mockCreateTestAccount).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
  });

  it('caches the platform transporter across multiple sends (built only once)', async () => {
    await service.send({ to: 'a@b.com', subject: 'Test', html: '<p>Test</p>' });
    await service.send({ to: 'c@d.com', subject: 'Test 2', html: '<p>Test 2</p>' });

    expect(mockCreateTestAccount).toHaveBeenCalledTimes(1);
    expect(mockSendMail).toHaveBeenCalledTimes(2);
  });

  it("caches a given organization's transporter across multiple sends (built only once)", async () => {
    prisma.organization.findUnique.mockResolvedValue({
      smtpHost: 'smtp.customer.test',
      smtpPort: 465,
      smtpUser: 'customer-user',
      smtpPasswordEncrypted: 'encrypted-blob',
      emailFromAddress: 'no-reply@customer.test',
    });
    cryptoService.decrypt.mockReturnValue('customer-smtp-password');

    await service.send({ to: 'a@b.com', subject: 'Test', html: '<p>Test</p>', organizationId: 'org-1' });
    await service.send({ to: 'c@d.com', subject: 'Test 2', html: '<p>Test 2</p>', organizationId: 'org-1' });

    expect(mockCreateTransport).toHaveBeenCalledTimes(1);
    expect(prisma.organization.findUnique).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/api && npx jest email.service.spec.ts`
Expected: FAIL — `EmailService` constructor takes 0 arguments (current signature has none).

- [ ] **Step 3: Rewrite EmailService**

Replace the full contents of `apps/api/src/email/email.service.ts`:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { PrismaService, OrgSecretsCryptoService } from '@exam-platform/shared';

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  organizationId?: string;
}

export interface SendEmailResult {
  success: boolean;
  previewUrl?: string;
}

const PLATFORM_FROM_ADDRESS = 'no-reply@exam-platform.test';
const PLATFORM_CACHE_KEY = '__platform__';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly transporterPromises = new Map<string, Promise<Transporter>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly cryptoService: OrgSecretsCryptoService,
  ) {}

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    try {
      const { transporter, fromAddress } = await this.resolveTransporter(input.organizationId);
      const info = await transporter.sendMail({
        from: fromAddress,
        to: input.to,
        subject: input.subject,
        html: input.html,
      });
      const previewUrl = nodemailer.getTestMessageUrl(info) || undefined;
      if (previewUrl) {
        this.logger.log(`Email sent, preview: ${previewUrl}`);
      }
      return { success: true, previewUrl };
    } catch (error) {
      this.logger.error(`Failed to send email to ${input.to}`, error as Error);
      return { success: false };
    }
  }

  private async resolveTransporter(organizationId: string | undefined): Promise<{ transporter: Transporter; fromAddress: string }> {
    if (organizationId) {
      const org = await this.prisma.organization.findUnique({
        where: { id: organizationId },
        select: { smtpHost: true, smtpPort: true, smtpUser: true, smtpPasswordEncrypted: true, emailFromAddress: true },
      });
      if (org?.smtpHost && org.smtpUser && org.smtpPasswordEncrypted) {
        const transporter = await this.getOrBuildTransporter(organizationId, () =>
          Promise.resolve(
            nodemailer.createTransport({
              host: org.smtpHost as string,
              port: org.smtpPort ?? 587,
              auth: { user: org.smtpUser as string, pass: this.cryptoService.decrypt(org.smtpPasswordEncrypted as string) },
            }),
          ),
        );
        return { transporter, fromAddress: org.emailFromAddress ?? PLATFORM_FROM_ADDRESS };
      }
    }
    const transporter = await this.getOrBuildTransporter(PLATFORM_CACHE_KEY, () => this.createPlatformTransporter());
    return { transporter, fromAddress: PLATFORM_FROM_ADDRESS };
  }

  private async getOrBuildTransporter(cacheKey: string, build: () => Promise<Transporter>): Promise<Transporter> {
    let promise = this.transporterPromises.get(cacheKey);
    if (!promise) {
      promise = build().catch((error) => {
        this.transporterPromises.delete(cacheKey);
        throw error;
      });
      this.transporterPromises.set(cacheKey, promise);
    }
    return promise;
  }

  private async createPlatformTransporter(): Promise<Transporter> {
    if (process.env.SMTP_HOST) {
      return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587,
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
      });
    }
    const testAccount = await nodemailer.createTestAccount();
    this.logger.log(`No SMTP_HOST configured - using Ethereal test account: ${testAccount.user}`);
    return nodemailer.createTransport({
      host: testAccount.smtp.host,
      port: testAccount.smtp.port,
      secure: testAccount.smtp.secure,
      auth: { user: testAccount.user, pass: testAccount.pass },
    });
  }
}
```

Note: `EmailService`'s per-org transporters are cached the same way the single platform transporter always was (`transporterPromises`, now keyed by organization id instead of being a single field) — an org's SMTP transporter is built once and reused, exactly like the existing platform-transporter caching behavior, just keyed per-org now.

- [ ] **Step 4: Wire the new constructor dependency**

In `apps/api/src/email/email.module.ts`, replace the full contents:

```typescript
import { Module } from '@nestjs/common';
import { CryptoModule } from '@exam-platform/shared';
import { EmailService } from './email.service';

@Module({
  imports: [CryptoModule],
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd apps/api && npx jest email.service.spec.ts`
Expected: PASS, all 5 tests.

- [ ] **Step 6: Thread organizationId through AuthService.forgotPassword**

In `apps/api/src/auth/auth.service.ts`, change the `dispatchResetEmail` private method signature and its one call site. Replace:

```typescript
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

with:

```typescript
    this.dispatchResetEmail(user.email, rawToken, org.id).catch((error) =>
      this.logger.error(`Failed to dispatch password reset email to ${user.email}`, error as Error),
    );
  }

  private async dispatchResetEmail(email: string, rawToken: string, organizationId: string): Promise<void> {
    const link = `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/reset-password/${rawToken}`;
    await this.emailService.send({
      to: email,
      subject: 'Reset your password',
      html: `<p>Click the link below to reset your password. This link expires in 15 minutes.</p><p><a href="${link}">${link}</a></p>`,
      organizationId,
    });
  }
```

`org` (the looked-up `Organization` row) is already in scope at the `dispatchResetEmail(...)` call site inside `forgotPassword()` — no other change needed in that method.

Add this test case to `apps/api/src/auth/auth.service.spec.ts`, inside the existing `describe('forgotPassword', ...)` block, after the first `it(...)`:

```typescript
    it("passes the organization's id through to EmailService.send so org-specific SMTP can be used", async () => {
      prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', slug: 'demo-org' });
      tenantPrisma.forTenant.mockResolvedValue({ id: 'user-1', email: 'admin@demo-org.test', organizationId: 'org-1' });
      prisma.passwordResetToken.create.mockResolvedValue({});

      await service.forgotPassword({ organizationSlug: 'demo-org', email: 'admin@demo-org.test' });
      await new Promise((resolve) => setImmediate(resolve));

      expect(emailService.send).toHaveBeenCalledWith(expect.objectContaining({ organizationId: 'org-1' }));
    });
```

Note: `OrganizationsService.create()`'s `dispatchWelcomeEmail` and `UsersService`'s `dispatchInviteEmail`/`dispatchPromotionEmail` (Super Admin Management feature) are **not modified** in this task — they already call `emailService.send({...})` without an `organizationId` field, so they automatically keep using the platform default transporter under the new `send()` signature. This is the "always platform default" rule from the spec, and it falls out of the existing code with zero changes needed — verify this by inspection, don't add unnecessary `organizationId` arguments to either of those three call sites.

- [ ] **Step 7: Run the auth test to verify it passes**

Run: `cd apps/api && npx jest auth.service.spec.ts`
Expected: PASS, including the new test.

- [ ] **Step 8: Run full API package type-check**

Run: `cd apps/api && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/email/email.service.ts apps/api/src/email/email.module.ts apps/api/src/email/email.service.spec.ts apps/api/src/auth/auth.service.ts apps/api/src/auth/auth.service.spec.ts
git commit -m "feat: make EmailService organization-aware with platform fallback"
```

---

### Task 4: Backend — per-org AI key for apps/api's question generation

**Files:**
- Modify: `apps/api/src/jobs/processors/claude-question-generation.client.ts`
- Modify: `apps/api/src/jobs/processors/claude-question-generation.client.spec.ts`
- Modify: `apps/api/src/jobs/processors/ai-question-generation.processor.ts`
- Modify: `apps/api/src/jobs/jobs.module.ts`

**Interfaces:**
- Consumes: `AiApiKeyResolverService`, `CryptoModule` (Task 2).
- Produces: `ClaudeQuestionGenerationClient.generate(topic, difficulty, questionTypes, count, apiKey: string): Promise<GeneratedQuestion[]>` — the `apiKey` parameter is new; every caller must now pass it explicitly.

- [ ] **Step 1: Update the client to take a per-call API key**

In `apps/api/src/jobs/processors/claude-question-generation.client.ts`, replace:

```typescript
@Injectable()
export class ClaudeQuestionGenerationClient {
  private readonly client: Anthropic;

  constructor() {
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  async generate(topic: string, difficulty: string, questionTypes: string[], count: number): Promise<GeneratedQuestion[]> {
    const response = await this.client.messages.create({
```

with:

```typescript
@Injectable()
export class ClaudeQuestionGenerationClient {
  async generate(topic: string, difficulty: string, questionTypes: string[], count: number, apiKey: string): Promise<GeneratedQuestion[]> {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
```

- [ ] **Step 2: Update its existing test file**

In `apps/api/src/jobs/processors/claude-question-generation.client.spec.ts`:

Replace the `beforeEach` block:

```typescript
  beforeEach(() => {
    mockCreate = jest.fn();
    (Anthropic as unknown as jest.Mock).mockImplementation(() => ({
      messages: { create: mockCreate },
    }));
    client = new ClaudeQuestionGenerationClient();
  });
```

(This removes the `process.env.ANTHROPIC_API_KEY = 'test-key'` line — the key is now passed explicitly per call, not read from env.)

Then update every `client.generate(...)` call in the file to add `'test-key'` as the 5th argument. There are 6 call sites in this file, all of the exact form `client.generate('arithmetic', 'easy', ['single_mcq'], 1)` or `client.generate('arithmetic', 'easy', ['single_mcq'], 7)` — change each to add `, 'test-key'` before the closing paren, e.g. `client.generate('arithmetic', 'easy', ['single_mcq'], 1, 'test-key')` and `client.generate('arithmetic', 'easy', ['single_mcq'], 7, 'test-key')`.

- [ ] **Step 3: Run the client test to verify it passes**

Run: `cd apps/api && npx jest claude-question-generation.client.spec.ts`
Expected: PASS, all 6 tests.

- [ ] **Step 4: Wire the resolver into the processor**

In `apps/api/src/jobs/processors/ai-question-generation.processor.ts`, replace:

```typescript
import { Injectable } from '@nestjs/common';
import { TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { JobProcessor } from './job-processor.interface';
import { ClaudeQuestionGenerationClient, GeneratedQuestion } from './claude-question-generation.client';
import { validateQuestionPayload } from '../../questions/question-validation';
```

with:

```typescript
import { Injectable } from '@nestjs/common';
import { TenantContext, TenantPrismaService, AiApiKeyResolverService } from '@exam-platform/shared';
import { JobProcessor } from './job-processor.interface';
import { ClaudeQuestionGenerationClient, GeneratedQuestion } from './claude-question-generation.client';
import { validateQuestionPayload } from '../../questions/question-validation';
```

Replace:

```typescript
  constructor(
    private readonly claudeClient: ClaudeQuestionGenerationClient,
    private readonly tenantPrisma: TenantPrismaService,
  ) {}

  async process(input: unknown, context: TenantContext): Promise<AiQuestionGenerationOutput> {
    const { topic, difficulty, questionTypes, count, requestedBy } = input as AiQuestionGenerationInput;

    const generated = (await this.claudeClient.generate(topic, difficulty, questionTypes, count)).slice(0, count);
```

with:

```typescript
  constructor(
    private readonly claudeClient: ClaudeQuestionGenerationClient,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly aiApiKeyResolver: AiApiKeyResolverService,
  ) {}

  async process(input: unknown, context: TenantContext): Promise<AiQuestionGenerationOutput> {
    const { topic, difficulty, questionTypes, count, requestedBy } = input as AiQuestionGenerationInput;

    const apiKey = await this.aiApiKeyResolver.resolve(context.organizationId as string);
    const generated = (await this.claudeClient.generate(topic, difficulty, questionTypes, count, apiKey)).slice(0, count);
```

There is no existing unit test file for `AiQuestionGenerationProcessor` (only for its `ClaudeQuestionGenerationClient` dependency) — no test file changes needed for this step.

- [ ] **Step 5: Wire CryptoModule into JobsModule**

In `apps/api/src/jobs/jobs.module.ts`, add the import:

```typescript
import { CryptoModule } from '@exam-platform/shared';
```

Add `CryptoModule` to the `@Module({...})` decorator's `imports` array (create one if none exists — currently this module has no `imports` key):

```typescript
@Module({
  imports: [CryptoModule],
  controllers: [JobsController],
  providers: [
```

- [ ] **Step 6: Run full API package type-check**

Run: `cd apps/api && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/jobs/processors/claude-question-generation.client.ts apps/api/src/jobs/processors/claude-question-generation.client.spec.ts apps/api/src/jobs/processors/ai-question-generation.processor.ts apps/api/src/jobs/jobs.module.ts
git commit -m "feat: resolve per-org AI API key for question generation"
```

---

### Task 5: Backend — per-org AI key for apps/exam-runtime's three AI call sites

**Files:**
- Modify: `apps/exam-runtime/src/proctoring-analysis/claude-proctoring.client.ts`, `apps/exam-runtime/src/proctoring-analysis/claude-proctoring.client.spec.ts`, `apps/exam-runtime/src/proctoring-analysis/attempt-analysis.service.ts`, `apps/exam-runtime/src/proctoring-analysis/attempt-analysis.service.spec.ts`, `apps/exam-runtime/src/proctoring-analysis/proctoring-analysis.module.ts`
- Modify: `apps/exam-runtime/src/attempt-insight/claude-insight.client.ts`, `apps/exam-runtime/src/attempt-insight/claude-insight.client.spec.ts`, `apps/exam-runtime/src/attempt-insight/attempt-insight.service.ts`, `apps/exam-runtime/src/attempt-insight/attempt-insight.service.spec.ts`, `apps/exam-runtime/src/attempt-insight/attempt-insight.module.ts`
- Modify: `apps/exam-runtime/src/code-review/claude-code-review.client.ts`, `apps/exam-runtime/src/code-review/claude-code-review.client.spec.ts`, `apps/exam-runtime/src/code-review/code-review.service.ts`, `apps/exam-runtime/src/code-review/code-review.service.spec.ts`, `apps/exam-runtime/src/code-review/code-review.module.ts`
- Modify: `apps/exam-runtime/src/app.module.ts`

**Interfaces:**
- Consumes: `AiApiKeyResolverService`, `CryptoModule` (Task 2).
- Produces: `ClaudeProctoringClient.assessRisk(events, apiKey: string)`, `ClaudeInsightClient.generate(input, apiKey: string)`, `ClaudeCodeReviewClient.review(input, apiKey: string)` — all gain a required trailing `apiKey` parameter.

- [ ] **Step 1: Update the three clients to take a per-call API key**

In `apps/exam-runtime/src/proctoring-analysis/claude-proctoring.client.ts`, replace:

```typescript
@Injectable()
export class ClaudeProctoringClient {
  private readonly client: Anthropic;

  constructor() {
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  async assessRisk(events: ProctoringTimelineEvent[]): Promise<RiskAssessment> {
    const response = await this.client.messages.create({
```

with:

```typescript
@Injectable()
export class ClaudeProctoringClient {
  async assessRisk(events: ProctoringTimelineEvent[], apiKey: string): Promise<RiskAssessment> {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
```

In `apps/exam-runtime/src/attempt-insight/claude-insight.client.ts`, replace:

```typescript
@Injectable()
export class ClaudeInsightClient {
  private readonly client: Anthropic;

  constructor() {
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  async generate(input: InsightInput): Promise<string> {
    const proctoringLine = input.proctoring
      ? `\n\nProctoring risk assessment: ${input.proctoring.riskLevel} risk. ${input.proctoring.summary}`
      : '';

    const response = await this.client.messages.create({
```

with:

```typescript
@Injectable()
export class ClaudeInsightClient {
  async generate(input: InsightInput, apiKey: string): Promise<string> {
    const client = new Anthropic({ apiKey });
    const proctoringLine = input.proctoring
      ? `\n\nProctoring risk assessment: ${input.proctoring.riskLevel} risk. ${input.proctoring.summary}`
      : '';

    const response = await client.messages.create({
```

In `apps/exam-runtime/src/code-review/claude-code-review.client.ts`, replace:

```typescript
@Injectable()
export class ClaudeCodeReviewClient {
  private readonly client: Anthropic;

  constructor() {
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  async review(input: CodeReviewInput): Promise<CodeReviewResult> {
    const response = await this.client.messages.create({
```

with:

```typescript
@Injectable()
export class ClaudeCodeReviewClient {
  async review(input: CodeReviewInput, apiKey: string): Promise<CodeReviewResult> {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
```

- [ ] **Step 2: Update the three clients' existing test files**

In `apps/exam-runtime/src/proctoring-analysis/claude-proctoring.client.spec.ts`: remove the line `process.env.ANTHROPIC_API_KEY = 'test-key';` from `beforeEach`, and add `, 'test-key'` as a second argument to every `client.assessRisk(events)` call (5 call sites, all of the form `client.assessRisk(events)` → `client.assessRisk(events, 'test-key')`).

In `apps/exam-runtime/src/attempt-insight/claude-insight.client.spec.ts`: remove the line `process.env.ANTHROPIC_API_KEY = 'test-key';` from `beforeEach`, and add `, 'test-key'` as a second argument to every `client.generate(...)` call (5 call sites: `client.generate(input)` → `client.generate(input, 'test-key')`, and `client.generate({ ...input, proctoring: {...} })` → `client.generate({ ...input, proctoring: {...} }, 'test-key')`).

In `apps/exam-runtime/src/code-review/claude-code-review.client.spec.ts`: remove the line `process.env.ANTHROPIC_API_KEY = 'test-key';` from `beforeEach`, and add `, 'test-key'` as a second argument to every `client.review(...)` call (4 call sites).

- [ ] **Step 3: Run the three client tests to verify they pass**

Run: `cd apps/exam-runtime && npx jest claude-proctoring.client.spec.ts claude-insight.client.spec.ts claude-code-review.client.spec.ts`
Expected: PASS, all tests (5 + 6 + 5 = 16 tests across the three files).

- [ ] **Step 4: Wire the resolver into the three calling services**

In `apps/exam-runtime/src/proctoring-analysis/attempt-analysis.service.ts`, replace:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { TenantPrismaService } from '@exam-platform/shared';
import { ClaudeProctoringClient } from './claude-proctoring.client';

const CLEAN_SUMMARY = 'No proctoring events were recorded during this attempt.';

@Injectable()
export class AttemptAnalysisService {
  private readonly logger = new Logger(AttemptAnalysisService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly claudeProctoringClient: ClaudeProctoringClient,
  ) {}
```

with:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { TenantPrismaService, AiApiKeyResolverService } from '@exam-platform/shared';
import { ClaudeProctoringClient } from './claude-proctoring.client';

const CLEAN_SUMMARY = 'No proctoring events were recorded during this attempt.';

@Injectable()
export class AttemptAnalysisService {
  private readonly logger = new Logger(AttemptAnalysisService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly claudeProctoringClient: ClaudeProctoringClient,
    private readonly aiApiKeyResolver: AiApiKeyResolverService,
  ) {}
```

Then replace:

```typescript
        try {
          const assessment = await this.claudeProctoringClient.assessRisk(timeline);
          result = { status: 'completed', riskLevel: assessment.riskLevel, summary: assessment.summary };
```

with:

```typescript
        try {
          const apiKey = await this.aiApiKeyResolver.resolve(organizationId);
          const assessment = await this.claudeProctoringClient.assessRisk(timeline, apiKey);
          result = { status: 'completed', riskLevel: assessment.riskLevel, summary: assessment.summary };
```

In `apps/exam-runtime/src/attempt-insight/attempt-insight.service.ts`, replace:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { TenantPrismaService } from '@exam-platform/shared';
import { ClaudeInsightClient, TopicBreakdownEntry } from './claude-insight.client';

@Injectable()
export class AttemptInsightService {
  private readonly logger = new Logger(AttemptInsightService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly claudeInsightClient: ClaudeInsightClient,
  ) {}
```

with:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { TenantPrismaService, AiApiKeyResolverService } from '@exam-platform/shared';
import { ClaudeInsightClient, TopicBreakdownEntry } from './claude-insight.client';

@Injectable()
export class AttemptInsightService {
  private readonly logger = new Logger(AttemptInsightService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly claudeInsightClient: ClaudeInsightClient,
    private readonly aiApiKeyResolver: AiApiKeyResolverService,
  ) {}
```

Then replace:

```typescript
      let result: { status: string; summary: string | null };
      try {
        const summary = await this.claudeInsightClient.generate({
          percentage: attempt.result.percentage,
          // ponytail: Result.passFail can now be null (pending manual grade of a code question);
          // insight generation is narrative-only, so fall back to a plain label rather than gating it.
          passFail: attempt.result.passFail ?? 'pending',
          topicBreakdown,
          proctoring,
        });
        result = { status: 'completed', summary };
```

with:

```typescript
      let result: { status: string; summary: string | null };
      try {
        const apiKey = await this.aiApiKeyResolver.resolve(organizationId);
        const summary = await this.claudeInsightClient.generate(
          {
            percentage: attempt.result.percentage,
            // ponytail: Result.passFail can now be null (pending manual grade of a code question);
            // insight generation is narrative-only, so fall back to a plain label rather than gating it.
            passFail: attempt.result.passFail ?? 'pending',
            topicBreakdown,
            proctoring,
          },
          apiKey,
        );
        result = { status: 'completed', summary };
```

In `apps/exam-runtime/src/code-review/code-review.service.ts`, replace:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { TenantPrismaService } from '@exam-platform/shared';
import { ClaudeCodeReviewClient } from './claude-code-review.client';

@Injectable()
export class CodeReviewService {
  private readonly logger = new Logger(CodeReviewService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly claudeCodeReviewClient: ClaudeCodeReviewClient,
  ) {}
```

with:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { TenantPrismaService, AiApiKeyResolverService } from '@exam-platform/shared';
import { ClaudeCodeReviewClient } from './claude-code-review.client';

@Injectable()
export class CodeReviewService {
  private readonly logger = new Logger(CodeReviewService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly claudeCodeReviewClient: ClaudeCodeReviewClient,
    private readonly aiApiKeyResolver: AiApiKeyResolverService,
  ) {}
```

Then replace:

```typescript
      try {
        const review = await this.claudeCodeReviewClient.review({
          questionText: answer.question.text,
          starterCode: answer.question.starterCode,
          codeLanguage: answer.question.codeLanguage ?? 'plaintext',
          answerText: answer.answerText,
          marks: answer.question.marks,
        });
        result = { status: 'completed', suggestedMarks: review.suggestedMarks, summary: review.summary };
```

with:

```typescript
      try {
        const apiKey = await this.aiApiKeyResolver.resolve(organizationId);
        const review = await this.claudeCodeReviewClient.review(
          {
            questionText: answer.question.text,
            starterCode: answer.question.starterCode,
            codeLanguage: answer.question.codeLanguage ?? 'plaintext',
            answerText: answer.answerText,
            marks: answer.question.marks,
          },
          apiKey,
        );
        result = { status: 'completed', suggestedMarks: review.suggestedMarks, summary: review.summary };
```

- [ ] **Step 5: Update the three services' existing test files**

In `apps/exam-runtime/src/proctoring-analysis/attempt-analysis.service.spec.ts`:
- Add `let aiApiKeyResolver: { resolve: jest.Mock };` to the `let` declarations.
- In `beforeEach`, add `aiApiKeyResolver = { resolve: jest.fn().mockResolvedValue('test-api-key') };` and add `{ provide: AiApiKeyResolverService, useValue: aiApiKeyResolver },` to the `providers` array.
- Add the import: `import { AiApiKeyResolverService } from '@exam-platform/shared';` (alongside the existing `TenantPrismaService` import from the same package — combine into one import line: `import { TenantPrismaService, AiApiKeyResolverService } from '@exam-platform/shared';`).
- In the test `'calls the LLM with elapsed-second timestamps and persists a completed analysis'`, change the assertion `expect(claudeClient.assessRisk).toHaveBeenCalledWith([{ eventType: 'tab_switch', severity: 'medium', elapsedSeconds: 120 }]);` to `expect(claudeClient.assessRisk).toHaveBeenCalledWith([{ eventType: 'tab_switch', severity: 'medium', elapsedSeconds: 120 }], 'test-api-key');`.

In `apps/exam-runtime/src/attempt-insight/attempt-insight.service.spec.ts`:
- Add `let aiApiKeyResolver: { resolve: jest.Mock };` to the `let` declarations.
- In `beforeEach`, add `aiApiKeyResolver = { resolve: jest.fn().mockResolvedValue('test-api-key') };` and add `{ provide: AiApiKeyResolverService, useValue: aiApiKeyResolver },` to the `providers` array.
- Change the import line to `import { TenantPrismaService, AiApiKeyResolverService } from '@exam-platform/shared';`.
- In the test `'computes a per-topic breakdown, excludes untopic-ed questions, and persists a completed insight'`, change the assertion:
```typescript
    expect(claudeClient.generate).toHaveBeenCalledWith({
      percentage: 80,
      passFail: 'pass',
      topicBreakdown: [{ topic: 'SQL', correct: 1, total: 2 }],
      proctoring: null,
    });
```
to:
```typescript
    expect(claudeClient.generate).toHaveBeenCalledWith(
      {
        percentage: 80,
        passFail: 'pass',
        topicBreakdown: [{ topic: 'SQL', correct: 1, total: 2 }],
        proctoring: null,
      },
      'test-api-key',
    );
```
- In the test `'passes the ProctoringAnalysis result as plain context when it exists'`, change:
```typescript
    expect(claudeClient.generate).toHaveBeenCalledWith(
      expect.objectContaining({ proctoring: { riskLevel: 'medium', summary: 'One tab switch.' } }),
    );
```
to:
```typescript
    expect(claudeClient.generate).toHaveBeenCalledWith(
      expect.objectContaining({ proctoring: { riskLevel: 'medium', summary: 'One tab switch.' } }),
      'test-api-key',
    );
```

In `apps/exam-runtime/src/code-review/code-review.service.spec.ts`:
- In the `buildService` helper function, add an `aiApiKeyResolver` mock and pass it as the third constructor argument. Replace:
```typescript
    const tenantPrisma = { forTenant: jest.fn((_context, callback) => callback(tx)) };
    const claudeClient = {
      review: claudeResult instanceof Error ? jest.fn().mockRejectedValue(claudeResult) : jest.fn().mockResolvedValue(claudeResult),
    };
    return { service: new CodeReviewService(tenantPrisma as never, claudeClient as never), tx, tenantPrisma, claudeClient };
```
with:
```typescript
    const tenantPrisma = { forTenant: jest.fn((_context, callback) => callback(tx)) };
    const claudeClient = {
      review: claudeResult instanceof Error ? jest.fn().mockRejectedValue(claudeResult) : jest.fn().mockResolvedValue(claudeResult),
    };
    const aiApiKeyResolver = { resolve: jest.fn().mockResolvedValue('test-api-key') };
    return {
      service: new CodeReviewService(tenantPrisma as never, claudeClient as never, aiApiKeyResolver as never),
      tx,
      tenantPrisma,
      claudeClient,
      aiApiKeyResolver,
    };
```
- In the test `'generates a review, upserts CodeAnswerReview as completed, and records AI credit usage'`, add an assertion that `claudeClient.review` was called with the resolved key, right after the existing assertions:
```typescript
    expect(tx.aiCreditUsage.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ source: 'code_review', sourceId: 'answer-1' }) }),
    );
    expect(claudeClient.review).toHaveBeenCalledWith(expect.anything(), 'test-api-key');
```

- [ ] **Step 6: Run the three service tests to verify they pass**

Run: `cd apps/exam-runtime && npx jest attempt-analysis.service.spec.ts attempt-insight.service.spec.ts code-review.service.spec.ts`
Expected: PASS, all tests (5 + 8 + 4 = 17 tests across the three files).

- [ ] **Step 7: Wire CryptoModule into the three feature modules and the app module**

In `apps/exam-runtime/src/proctoring-analysis/proctoring-analysis.module.ts`, replace:

```typescript
import { Module } from '@nestjs/common';
import { AttemptAnalysisService } from './attempt-analysis.service';
import { ClaudeProctoringClient } from './claude-proctoring.client';

@Module({
  providers: [AttemptAnalysisService, ClaudeProctoringClient],
  exports: [AttemptAnalysisService],
})
export class ProctoringAnalysisModule {}
```

with:

```typescript
import { Module } from '@nestjs/common';
import { CryptoModule } from '@exam-platform/shared';
import { AttemptAnalysisService } from './attempt-analysis.service';
import { ClaudeProctoringClient } from './claude-proctoring.client';

@Module({
  imports: [CryptoModule],
  providers: [AttemptAnalysisService, ClaudeProctoringClient],
  exports: [AttemptAnalysisService],
})
export class ProctoringAnalysisModule {}
```

In `apps/exam-runtime/src/attempt-insight/attempt-insight.module.ts`, replace:

```typescript
import { Module } from '@nestjs/common';
import { AttemptInsightService } from './attempt-insight.service';
import { ClaudeInsightClient } from './claude-insight.client';

@Module({
  providers: [AttemptInsightService, ClaudeInsightClient],
  exports: [AttemptInsightService],
})
export class AttemptInsightModule {}
```

with:

```typescript
import { Module } from '@nestjs/common';
import { CryptoModule } from '@exam-platform/shared';
import { AttemptInsightService } from './attempt-insight.service';
import { ClaudeInsightClient } from './claude-insight.client';

@Module({
  imports: [CryptoModule],
  providers: [AttemptInsightService, ClaudeInsightClient],
  exports: [AttemptInsightService],
})
export class AttemptInsightModule {}
```

In `apps/exam-runtime/src/code-review/code-review.module.ts`, replace:

```typescript
import { Module } from '@nestjs/common';
import { CodeReviewService } from './code-review.service';
import { ClaudeCodeReviewClient } from './claude-code-review.client';

@Module({
  providers: [CodeReviewService, ClaudeCodeReviewClient],
  exports: [CodeReviewService],
})
export class CodeReviewModule {}
```

with:

```typescript
import { Module } from '@nestjs/common';
import { CryptoModule } from '@exam-platform/shared';
import { CodeReviewService } from './code-review.service';
import { ClaudeCodeReviewClient } from './claude-code-review.client';

@Module({
  imports: [CryptoModule],
  providers: [CodeReviewService, ClaudeCodeReviewClient],
  exports: [CodeReviewService],
})
export class CodeReviewModule {}
```

`apps/exam-runtime/src/app.module.ts` needs no import change — `PrismaModule` is already `@Global()` and already imported there, and the three feature modules above now import `CryptoModule` themselves directly, which is the established pattern in this codebase (feature modules explicitly import the shared modules they need, rather than the app module importing everything).

- [ ] **Step 8: Run full exam-runtime package type-check**

Run: `cd apps/exam-runtime && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add apps/exam-runtime/src/proctoring-analysis apps/exam-runtime/src/attempt-insight apps/exam-runtime/src/code-review
git commit -m "feat: resolve per-org AI API key for proctoring, insight, and code review analysis"
```

---

### Task 6: Backend — Integrations settings endpoints

**Files:**
- Create: `apps/api/src/organizations/dto/update-smtp-settings.dto.ts`
- Create: `apps/api/src/organizations/dto/update-ai-key.dto.ts`
- Modify: `apps/api/src/organizations/organizations.service.ts`
- Modify: `apps/api/src/organizations/organizations.service.spec.ts`
- Modify: `apps/api/src/organizations/organizations.controller.ts`
- Modify: `apps/api/src/organizations/organizations.module.ts`

**Interfaces:**
- Consumes: `OrgSecretsCryptoService`, `CryptoModule` (Task 2).
- Produces: `OrganizationsService.getIntegrations(context): Promise<IntegrationsResponse>`, `.updateSmtpSettings(context, actorUserId, dto): Promise<{smtpConfigured: boolean}>`, `.updateAiKey(context, actorUserId, dto): Promise<{aiKeyConfigured: boolean}>`; routes `GET/PATCH /organizations/integrations`, `PATCH /organizations/integrations/smtp`, `PATCH /organizations/integrations/ai-key`. Task 7's frontend hooks call these three routes directly, and `IntegrationsResponse`'s field names must match Task 7's frontend type exactly.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/organizations/dto/update-smtp-settings.dto.ts`:

```typescript
import { IsEmail, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

export class UpdateSmtpSettingsDto {
  @IsString()
  @MinLength(1)
  host!: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  port!: number;

  @IsString()
  @MinLength(1)
  user!: string;

  @IsString()
  @MinLength(1)
  password!: string;

  @IsOptional()
  @IsEmail()
  fromAddress?: string;
}
```

Create `apps/api/src/organizations/dto/update-ai-key.dto.ts`:

```typescript
import { IsString, MinLength } from 'class-validator';

export class UpdateAiKeyDto {
  @IsString()
  @MinLength(1)
  apiKey!: string;
}
```

Add this block to `apps/api/src/organizations/organizations.service.spec.ts`, at the end of the file, just before the final closing `});` of the outer `describe('OrganizationsService', ...)`:

```typescript

  describe('getIntegrations', () => {
    it('reports both as unconfigured for an org with nothing set', async () => {
      prisma.organization.findUnique.mockResolvedValue({
        smtpHost: null, smtpPort: null, emailFromAddress: null, aiApiKeyEncrypted: null, smtpPasswordEncrypted: null,
      });

      const result = await service.getIntegrations({ organizationId: 'org-1', isSuperAdmin: false });

      expect(result).toEqual({
        smtpConfigured: false, aiKeyConfigured: false, smtpHost: null, smtpPort: null, emailFromAddress: null,
      });
    });

    it('reports configured booleans and the non-secret SMTP fields, never the secrets themselves', async () => {
      prisma.organization.findUnique.mockResolvedValue({
        smtpHost: 'smtp.customer.test', smtpPort: 465, emailFromAddress: 'no-reply@customer.test',
        aiApiKeyEncrypted: 'encrypted-blob', smtpPasswordEncrypted: 'also-encrypted',
      });

      const result = await service.getIntegrations({ organizationId: 'org-1', isSuperAdmin: false });

      expect(result).toEqual({
        smtpConfigured: true, aiKeyConfigured: true,
        smtpHost: 'smtp.customer.test', smtpPort: 465, emailFromAddress: 'no-reply@customer.test',
      });
      expect(result).not.toHaveProperty('smtpPasswordEncrypted');
      expect(result).not.toHaveProperty('aiApiKeyEncrypted');
    });

    it('throws BadRequestException when the caller has no organization context', async () => {
      await expect(service.getIntegrations({ organizationId: null, isSuperAdmin: true })).rejects.toThrow(BadRequestException);
      expect(prisma.organization.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('updateSmtpSettings', () => {
    const dto = { host: 'smtp.customer.test', port: 587, user: 'customer-user', password: 'customer-pass', fromAddress: 'no-reply@customer.test' };

    it('validates via a real transporter.verify() call, then encrypts and persists on success', async () => {
      mockTransporterVerify.mockResolvedValue(true);
      cryptoService.encrypt.mockReturnValue('encrypted-password-blob');
      prisma.organization.update.mockResolvedValue({});

      const result = await service.updateSmtpSettings({ organizationId: 'org-1', isSuperAdmin: false }, 'user-1', dto);

      expect(mockTransporterVerify).toHaveBeenCalledTimes(1);
      expect(cryptoService.encrypt).toHaveBeenCalledWith('customer-pass');
      expect(prisma.organization.update).toHaveBeenCalledWith({
        where: { id: 'org-1' },
        data: {
          smtpHost: 'smtp.customer.test', smtpPort: 587, smtpUser: 'customer-user',
          smtpPasswordEncrypted: 'encrypted-password-blob', emailFromAddress: 'no-reply@customer.test',
        },
      });
      expect(audit.record).toHaveBeenCalledWith(
        { organizationId: 'org-1', isSuperAdmin: false },
        { actorUserId: 'user-1', action: 'organization.smtp_configured', entityType: 'organization', entityId: 'org-1' },
      );
      expect(result).toEqual({ smtpConfigured: true });
    });

    it('rejects with BadRequestException and persists nothing when verify() fails', async () => {
      mockTransporterVerify.mockRejectedValue(new Error('Invalid login'));

      await expect(
        service.updateSmtpSettings({ organizationId: 'org-1', isSuperAdmin: false }, 'user-1', dto),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.organization.update).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the caller has no organization context', async () => {
      await expect(
        service.updateSmtpSettings({ organizationId: null, isSuperAdmin: true }, 'user-1', dto),
      ).rejects.toThrow(BadRequestException);
      expect(mockTransporterVerify).not.toHaveBeenCalled();
    });
  });

  describe('updateAiKey', () => {
    const dto = { apiKey: 'sk-ant-customer-key' };

    it('validates via a real minimal messages.create() call, then encrypts and persists on success', async () => {
      mockAnthropicCreate.mockResolvedValue({ content: [] });
      cryptoService.encrypt.mockReturnValue('encrypted-key-blob');
      prisma.organization.update.mockResolvedValue({});

      const result = await service.updateAiKey({ organizationId: 'org-1', isSuperAdmin: false }, 'user-1', dto);

      expect(mockAnthropicCreate).toHaveBeenCalledWith(
        expect.objectContaining({ max_tokens: 1, messages: [{ role: 'user', content: 'Hi' }] }),
      );
      expect(cryptoService.encrypt).toHaveBeenCalledWith('sk-ant-customer-key');
      expect(prisma.organization.update).toHaveBeenCalledWith({
        where: { id: 'org-1' },
        data: { aiApiKeyEncrypted: 'encrypted-key-blob' },
      });
      expect(audit.record).toHaveBeenCalledWith(
        { organizationId: 'org-1', isSuperAdmin: false },
        { actorUserId: 'user-1', action: 'organization.ai_key_configured', entityType: 'organization', entityId: 'org-1' },
      );
      expect(result).toEqual({ aiKeyConfigured: true });
    });

    it('rejects with BadRequestException and persists nothing when the API call fails', async () => {
      mockAnthropicCreate.mockRejectedValue(new Error('authentication_error'));

      await expect(
        service.updateAiKey({ organizationId: 'org-1', isSuperAdmin: false }, 'user-1', dto),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.organization.update).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the caller has no organization context', async () => {
      await expect(
        service.updateAiKey({ organizationId: null, isSuperAdmin: true }, 'user-1', dto),
      ).rejects.toThrow(BadRequestException);
      expect(mockAnthropicCreate).not.toHaveBeenCalled();
    });
  });
```

Also add the required mocks and imports at the top of `apps/api/src/organizations/organizations.service.spec.ts`. Add this `jest.mock` block as the very first lines of the file (before the existing `jest.mock('fs/promises', ...)`):

```typescript
const mockTransporterVerify = jest.fn();
jest.mock('nodemailer', () => ({
  createTransport: () => ({ verify: mockTransporterVerify }),
}));

const mockAnthropicCreate = jest.fn();
jest.mock('@anthropic-ai/sdk', () => jest.fn().mockImplementation(() => ({ messages: { create: mockAnthropicCreate } })));
```

Add `OrgSecretsCryptoService` to the existing imports (currently `import { PrismaService, TenantPrismaService, AuditService } from '@exam-platform/shared';`) — change it to `import { PrismaService, TenantPrismaService, AuditService, OrgSecretsCryptoService } from '@exam-platform/shared';`.

Add `let cryptoService: { encrypt: jest.Mock; decrypt: jest.Mock };` to the `let` declarations, and inside `beforeEach`, add `cryptoService = { encrypt: jest.fn(), decrypt: jest.fn() };` and add `{ provide: OrgSecretsCryptoService, useValue: cryptoService },` to the `providers` array. Also add `mockTransporterVerify.mockReset(); mockAnthropicCreate.mockReset();` at the start of `beforeEach`, since these are module-level mocks shared across all tests in the file.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/api && npx jest organizations.service.spec.ts`
Expected: FAIL — `service.getIntegrations is not a function`.

- [ ] **Step 3: Implement the three service methods**

In `apps/api/src/organizations/organizations.service.ts`, add these imports at the top, alongside the existing ones:

```typescript
import * as nodemailer from 'nodemailer';
import Anthropic from '@anthropic-ai/sdk';
import { OrgSecretsCryptoService } from '@exam-platform/shared';
```

Add `OrgSecretsCryptoService` to the constructor:

```typescript
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly audit: AuditService,
    private readonly emailService: EmailService,
    private readonly cryptoService: OrgSecretsCryptoService,
  ) {}
```

Add this interface near the top of the file, alongside the existing `BrandingResponse`/`AiCreditUsageResponse` interfaces:

```typescript
export interface IntegrationsResponse {
  smtpConfigured: boolean;
  aiKeyConfigured: boolean;
  smtpHost: string | null;
  smtpPort: number | null;
  emailFromAddress: string | null;
}
```

Add these three methods to the class, after `getUsage()` and before the private helper methods at the end:

```typescript
  async getIntegrations(context: TenantContext): Promise<IntegrationsResponse> {
    const organizationId = this.requireOrganizationId(context);
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { smtpHost: true, smtpPort: true, emailFromAddress: true, aiApiKeyEncrypted: true, smtpPasswordEncrypted: true },
    });
    return {
      smtpConfigured: Boolean(org?.smtpPasswordEncrypted),
      aiKeyConfigured: Boolean(org?.aiApiKeyEncrypted),
      smtpHost: org?.smtpHost ?? null,
      smtpPort: org?.smtpPort ?? null,
      emailFromAddress: org?.emailFromAddress ?? null,
    };
  }

  async updateSmtpSettings(context: TenantContext, actorUserId: string, dto: UpdateSmtpSettingsDto): Promise<{ smtpConfigured: boolean }> {
    const organizationId = this.requireOrganizationId(context);

    const transporter = nodemailer.createTransport({
      host: dto.host,
      port: dto.port,
      auth: { user: dto.user, pass: dto.password },
    });
    try {
      await transporter.verify();
    } catch (error) {
      throw new BadRequestException(`Could not connect to that SMTP server: ${(error as Error).message}`);
    }

    await this.prisma.organization.update({
      where: { id: organizationId },
      data: {
        smtpHost: dto.host,
        smtpPort: dto.port,
        smtpUser: dto.user,
        smtpPasswordEncrypted: this.cryptoService.encrypt(dto.password),
        emailFromAddress: dto.fromAddress ?? null,
      },
    });
    await this.audit.record(context, {
      actorUserId,
      action: 'organization.smtp_configured',
      entityType: 'organization',
      entityId: organizationId,
    });
    return { smtpConfigured: true };
  }

  async updateAiKey(context: TenantContext, actorUserId: string, dto: UpdateAiKeyDto): Promise<{ aiKeyConfigured: boolean }> {
    const organizationId = this.requireOrganizationId(context);

    try {
      const client = new Anthropic({ apiKey: dto.apiKey });
      await client.messages.create({ model: 'claude-haiku-4-5-20251001', max_tokens: 1, messages: [{ role: 'user', content: 'Hi' }] });
    } catch (error) {
      throw new BadRequestException(`That API key was rejected by Anthropic: ${(error as Error).message}`);
    }

    await this.prisma.organization.update({
      where: { id: organizationId },
      data: { aiApiKeyEncrypted: this.cryptoService.encrypt(dto.apiKey) },
    });
    await this.audit.record(context, {
      actorUserId,
      action: 'organization.ai_key_configured',
      entityType: 'organization',
      entityId: organizationId,
    });
    return { aiKeyConfigured: true };
  }
```

Add the two DTO imports near the top of the file, alongside the existing DTO imports:

```typescript
import { UpdateSmtpSettingsDto } from './dto/update-smtp-settings.dto';
import { UpdateAiKeyDto } from './dto/update-ai-key.dto';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/api && npx jest organizations.service.spec.ts`
Expected: PASS, all tests (existing tests plus the 9 new ones across `getIntegrations`/`updateSmtpSettings`/`updateAiKey`).

- [ ] **Step 5: Add the controller endpoints**

In `apps/api/src/organizations/organizations.controller.ts`, add the two DTO imports:

```typescript
import { UpdateSmtpSettingsDto } from './dto/update-smtp-settings.dto';
import { UpdateAiKeyDto } from './dto/update-ai-key.dto';
```

Add these three methods inside `OrganizationsController`, after `getUsage()` and before `updateBrandingColors()`:

```typescript
  @Get('integrations')
  @RequirePermissions('org:manage_settings')
  getIntegrations(@CurrentTenant() tenant: TenantContext) {
    return this.organizationsService.getIntegrations(tenant);
  }

  @Patch('integrations/smtp')
  @RequirePermissions('org:manage_settings')
  updateSmtpSettings(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Body() dto: UpdateSmtpSettingsDto) {
    return this.organizationsService.updateSmtpSettings(tenant, userId, dto);
  }

  @Patch('integrations/ai-key')
  @RequirePermissions('org:manage_settings')
  updateAiKey(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Body() dto: UpdateAiKeyDto) {
    return this.organizationsService.updateAiKey(tenant, userId, dto);
  }
```

- [ ] **Step 6: Wire CryptoModule into OrganizationsModule**

In `apps/api/src/organizations/organizations.module.ts`, replace:

```typescript
import { Module } from '@nestjs/common';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsPublicController } from './organizations-public.controller';
import { OrganizationsService } from './organizations.service';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [EmailModule],
```

with:

```typescript
import { Module } from '@nestjs/common';
import { CryptoModule } from '@exam-platform/shared';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsPublicController } from './organizations-public.controller';
import { OrganizationsService } from './organizations.service';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [EmailModule, CryptoModule],
```

- [ ] **Step 7: Run full API package type-check**

Run: `cd apps/api && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/organizations
git commit -m "feat: add GET/PATCH /organizations/integrations endpoints with save-time validation"
```

---

### Task 7: Frontend — Integrations settings page

**Files:**
- Modify: `apps/web/lib/types.ts`
- Create: `apps/web/lib/hooks/useIntegrations.ts`
- Create: `apps/web/app/(org-admin)/settings/integrations/page.tsx`
- Create: `apps/web/app/(org-admin)/settings/integrations/page.test.tsx`
- Modify: `apps/web/app/(org-admin)/layout.tsx`

**Interfaces:**
- Consumes: `apiFetch` (`apps/web/lib/api-client.ts`), `Input`/`Button`/`Card`/`useToast` (`apps/web/components/ui`), matching the exact structure of `apps/web/app/(org-admin)/settings/branding/page.tsx` and `apps/web/lib/hooks/useBranding.ts`.
- Produces: nothing consumed by a later task — this is the final implementation task before verification.

- [ ] **Step 1: Add the type**

In `apps/web/lib/types.ts`, add after the existing `BrandingResponse` interface:

```typescript
export interface IntegrationsResponse {
  smtpConfigured: boolean;
  aiKeyConfigured: boolean;
  smtpHost: string | null;
  smtpPort: number | null;
  emailFromAddress: string | null;
}
```

- [ ] **Step 2: Write the failing test**

Create `apps/web/app/(org-admin)/settings/integrations/page.test.tsx`:

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import IntegrationsSettingsPage from './page';
import { ToastProvider } from '../../../../components/ui';
import * as authContext from '../../../../lib/auth-context';
import * as apiClient from '../../../../lib/api-client';

jest.mock('../../../../lib/auth-context');
jest.mock('../../../../lib/api-client');

const mockedUseAuth = authContext.useAuth as jest.Mock;
const mockedApiFetch = apiClient.apiFetch as jest.Mock;

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <IntegrationsSettingsPage />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('IntegrationsSettingsPage', () => {
  beforeEach(() => {
    mockedUseAuth.mockReturnValue({ accessToken: 'token' });
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === '/organizations/integrations') {
        return Promise.resolve({ smtpConfigured: false, aiKeyConfigured: false, smtpHost: null, smtpPort: null, emailFromAddress: null });
      }
      return Promise.resolve({});
    });
  });

  it('shows both integrations as not configured initially', async () => {
    renderPage();
    expect(await screen.findAllByText(/not configured/i)).toHaveLength(2);
  });

  it('submits SMTP settings and shows a success toast on save', async () => {
    renderPage();
    await screen.findByLabelText('SMTP host');

    fireEvent.change(screen.getByLabelText('SMTP host'), { target: { value: 'smtp.customer.test' } });
    fireEvent.change(screen.getByLabelText('SMTP port'), { target: { value: '587' } });
    fireEvent.change(screen.getByLabelText('SMTP username'), { target: { value: 'customer-user' } });
    fireEvent.change(screen.getByLabelText('SMTP password'), { target: { value: 'customer-pass' } });

    mockedApiFetch.mockResolvedValueOnce({ smtpConfigured: true });
    fireEvent.click(screen.getByRole('button', { name: 'Save SMTP settings' }));

    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith(
        '/organizations/integrations/smtp',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ host: 'smtp.customer.test', port: 587, user: 'customer-user', password: 'customer-pass', fromAddress: '' }),
        }),
        'token',
      ),
    );
  });

  it('shows an inline error when saving the AI key fails validation', async () => {
    renderPage();
    await screen.findByLabelText('AI API key');

    fireEvent.change(screen.getByLabelText('AI API key'), { target: { value: 'sk-ant-bad-key' } });
    mockedApiFetch.mockRejectedValueOnce(new Error('That API key was rejected by Anthropic: authentication_error'));
    fireEvent.click(screen.getByRole('button', { name: 'Save AI API key' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('That API key was rejected by Anthropic: authentication_error');
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd apps/web && npx jest settings/integrations/page.test.tsx`
Expected: FAIL — `Cannot find module './page'`

- [ ] **Step 4: Create the hooks**

Create `apps/web/lib/hooks/useIntegrations.ts`:

```typescript
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { IntegrationsResponse } from '../types';
import { useAuth } from '../auth-context';

export function useIntegrations() {
  const { accessToken } = useAuth();
  return useQuery<IntegrationsResponse>({
    queryKey: ['integrations'],
    queryFn: () => apiFetch('/organizations/integrations', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}

interface UpdateSmtpInput {
  host: string;
  port: number;
  user: string;
  password: string;
  fromAddress: string;
}

export function useUpdateSmtpSettings() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateSmtpInput): Promise<{ smtpConfigured: boolean }> =>
      apiFetch('/organizations/integrations/smtp', { method: 'PATCH', body: JSON.stringify(input) }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['integrations'] }),
  });
}

export function useUpdateAiKey() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (apiKey: string): Promise<{ aiKeyConfigured: boolean }> =>
      apiFetch('/organizations/integrations/ai-key', { method: 'PATCH', body: JSON.stringify({ apiKey }) }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['integrations'] }),
  });
}
```

- [ ] **Step 5: Implement the page**

Create `apps/web/app/(org-admin)/settings/integrations/page.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { useIntegrations, useUpdateSmtpSettings, useUpdateAiKey } from '../../../../lib/hooks/useIntegrations';
import { Input, Button, Card, useToast } from '../../../../components/ui';

export default function IntegrationsSettingsPage() {
  const { data: integrations } = useIntegrations();
  const updateSmtp = useUpdateSmtpSettings();
  const updateAiKey = useUpdateAiKey();
  const { toast } = useToast();

  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('587');
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPassword, setSmtpPassword] = useState('');
  const [fromAddress, setFromAddress] = useState('');
  const [smtpError, setSmtpError] = useState<string | null>(null);

  const [aiApiKey, setAiApiKey] = useState('');
  const [aiKeyError, setAiKeyError] = useState<string | null>(null);

  function handleSmtpSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSmtpError(null);
    updateSmtp.mutate(
      { host: smtpHost, port: parseInt(smtpPort, 10), user: smtpUser, password: smtpPassword, fromAddress },
      {
        onSuccess: () => {
          toast('SMTP settings saved.');
          setSmtpHost('');
          setSmtpPort('587');
          setSmtpUser('');
          setSmtpPassword('');
          setFromAddress('');
        },
        onError: (err) => setSmtpError(err instanceof Error ? err.message : 'Failed to save SMTP settings'),
      },
    );
  }

  function handleAiKeySubmit(e: React.FormEvent) {
    e.preventDefault();
    setAiKeyError(null);
    updateAiKey.mutate(aiApiKey, {
      onSuccess: () => {
        toast('AI API key saved.');
        setAiApiKey('');
      },
      onError: (err) => setAiKeyError(err instanceof Error ? err.message : 'Failed to save AI API key'),
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-recruiter-text">Integrations</h1>

      <Card className="max-w-md">
        <h2 className="mb-1 text-lg font-semibold text-recruiter-text">Email (SMTP)</h2>
        <p className="mb-4 text-sm text-recruiter-text-secondary">
          {integrations?.smtpConfigured
            ? `Configured — ${integrations.smtpHost}:${integrations.smtpPort}${integrations.emailFromAddress ? `, from ${integrations.emailFromAddress}` : ''}`
            : 'Not configured — invites and password resets currently use the platform default.'}
        </p>
        <form onSubmit={handleSmtpSubmit} className="flex flex-col gap-3">
          <Input label="SMTP host" value={smtpHost} onChange={setSmtpHost} required />
          <Input label="SMTP port" type="number" value={smtpPort} onChange={setSmtpPort} required />
          <Input label="SMTP username" value={smtpUser} onChange={setSmtpUser} required />
          <Input label="SMTP password" type="password" value={smtpPassword} onChange={setSmtpPassword} required />
          <Input label="From address (optional)" type="email" value={fromAddress} onChange={setFromAddress} />
          <Button type="submit" loading={updateSmtp.isPending}>
            {integrations?.smtpConfigured ? 'Replace SMTP settings' : 'Save SMTP settings'}
          </Button>
        </form>
        {smtpError && (
          <p role="alert" className="mt-3 text-sm text-status-danger">
            {smtpError}
          </p>
        )}
      </Card>

      <Card className="max-w-md">
        <h2 className="mb-1 text-lg font-semibold text-recruiter-text">AI API key</h2>
        <p className="mb-4 text-sm text-recruiter-text-secondary">
          {integrations?.aiKeyConfigured
            ? 'Configured — AI features use this organization\'s own Anthropic key.'
            : 'Not configured — AI features currently use the platform default key.'}
        </p>
        <form onSubmit={handleAiKeySubmit} className="flex flex-col gap-3">
          <Input label="AI API key" type="password" value={aiApiKey} onChange={setAiApiKey} required />
          <Button type="submit" loading={updateAiKey.isPending}>
            {integrations?.aiKeyConfigured ? 'Replace AI API key' : 'Save AI API key'}
          </Button>
        </form>
        {aiKeyError && (
          <p role="alert" className="mt-3 text-sm text-status-danger">
            {aiKeyError}
          </p>
        )}
      </Card>
    </div>
  );
}
```

- [ ] **Step 6: Add the nav link**

In `apps/web/app/(org-admin)/layout.tsx`, replace:

```typescript
const NAV_ITEMS = [
  { href: '/users', label: 'Staff Users', icon: Users },
  { href: '/audit-log', label: 'Audit Log', icon: History },
  { href: '/data-rights', label: 'Candidate Data Rights', icon: ShieldCheck },
  { href: '/settings/branding', label: 'Org Settings', icon: Settings },
];
```

with:

```typescript
const NAV_ITEMS = [
  { href: '/users', label: 'Staff Users', icon: Users },
  { href: '/audit-log', label: 'Audit Log', icon: History },
  { href: '/data-rights', label: 'Candidate Data Rights', icon: ShieldCheck },
  { href: '/settings/branding', label: 'Org Settings', icon: Settings },
  { href: '/settings/integrations', label: 'Integrations', icon: Plug },
];
```

Add `Plug` to the existing `lucide-react` import:

```typescript
import { Users, History, ShieldCheck, Settings, Plug, LogOut } from 'lucide-react';
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `cd apps/web && npx jest settings/integrations/page.test.tsx`
Expected: PASS, all 3 tests.

- [ ] **Step 8: Run frontend type-check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no NEW errors (10 pre-existing baseline errors in unrelated test files are expected and fine, confirmed unrelated across every prior feature this session).

- [ ] **Step 9: Commit**

```bash
git add apps/web/lib/types.ts apps/web/lib/hooks/useIntegrations.ts "apps/web/app/(org-admin)/settings/integrations" "apps/web/app/(org-admin)/layout.tsx"
git commit -m "feat: add Integrations settings page for per-org SMTP and AI API key"
```

---

### Task 8: Final verification

**Files:** none (verification only), except adding the new env var to both `.env` files.

**Interfaces:** none — this task exercises the full stack built in Tasks 1-7.

- [ ] **Step 1: Generate the encryption key and add it to both .env files**

Run: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` — copy the printed 64-character hex string.

Add a line `ORG_SECRETS_ENCRYPTION_KEY="<the generated hex string>"` to both `apps/api/.env` and `apps/exam-runtime/.env` (use the same value in both — this is a shared secret, matching how `INTERNAL_SERVICE_SECRET` is already duplicated across both files).

- [ ] **Step 2: Run the full test suites**

Run: `cd packages/shared && npx jest`
Expected: all tests pass, including the 7 new crypto tests.

Run: `cd apps/api && npx jest`
Expected: all tests pass, including the new/modified tests in `email.service.spec.ts`, `auth.service.spec.ts`, `claude-question-generation.client.spec.ts`, and `organizations.service.spec.ts`.

Run: `cd apps/exam-runtime && npx jest`
Expected: all tests pass, including the modified tests in the three Claude client specs and three service specs.

Run: `cd apps/web && npx jest`
Expected: all tests pass, including the 3 new `settings/integrations/page.test.tsx` tests.

- [ ] **Step 3: Type-check every package**

Run: `cd packages/shared && npx tsc --noEmit && cd ../../apps/api && npx tsc --noEmit && cd ../exam-runtime && npx tsc --noEmit && cd ../web && npx tsc --noEmit`
Expected: no errors in `packages/shared`, `apps/api`, or `apps/exam-runtime`; only the same 10 pre-existing baseline errors in `apps/web`.

- [ ] **Step 4: Live browser + live-service verification**

Start the API (`cd apps/api && npm run start:dev`) and web (`cd apps/web && npx next dev -p 3002`) dev servers. Log in as the seeded `admin@demo-org.test` / `DevAdmin123!` org_admin (organization slug `demo-org`).

1. Navigate to the new "Integrations" nav item. Confirm both cards show "Not configured" initially.
2. Submit the SMTP form with a deliberately wrong host (e.g. `smtp.does-not-exist.invalid`) and any port/user/password. Confirm the save fails with a clear inline error (proving `transporter.verify()` genuinely runs against the submitted values, not just accepting anything) and the card still shows "Not configured".
3. Submit the SMTP form with real, working credentials (Ethereal's `createTestAccount()` output works well here — call `node -e "require('nodemailer').createTestAccount().then(a => console.log(JSON.stringify(a)))"` to mint one, then use its `smtp.host`/`smtp.port`/`user`/`pass`). Confirm the save succeeds, the card updates to show "Configured — host:port".
4. Trigger a password-reset email for a user in `demo-org` (via the `/forgot-password` page) and confirm — via the API server's console log or by inspecting the sent mail through Ethereal's web viewer at the URL the Ethereal test account provides — that the email now goes through the organization's own SMTP account, not the platform's.
5. Submit the AI API key form with an obviously invalid key (e.g. `sk-ant-invalid`). Confirm the save fails with a clear inline error (proving the real `messages.create()` validation call genuinely ran) and the card still shows "Not configured".
6. If a real Anthropic API key is available for testing, submit it and confirm the save succeeds and the card updates to "Configured". If not available, skip this specific sub-step but note it was skipped in the final report — do not fabricate a successful run.
7. Confirm the secret values are never visible anywhere in the UI after saving — the SMTP password and AI key fields are always empty on page load/reload, never pre-filled with a masked or real value.

Stop both dev servers afterward. Revert `apps/web/next-env.d.ts` if the dev server regenerated it (`git checkout -- apps/web/next-env.d.ts`).

- [ ] **Step 5: Update the progress ledger**

Append to `.superpowers/sdd/progress.md`:

```
=== PER-ORG EMAIL & AI API KEY CONFIGURATION FEATURE COMPLETE — ready for final whole-branch review ===
```
