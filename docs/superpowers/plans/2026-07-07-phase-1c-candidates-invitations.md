# Phase 1c — Candidates & Invitations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a Recruiter a tested API to add candidates (manually or via CSV), publish an exam once it has real content, invite candidates to a published exam, and manage those invitations (list/resend/revoke), with real SMTP email delivery and the same database-level tenant isolation established in Phase 0 and extended through Phase 1a/1b.

**Architecture:** Three new Prisma models (`Candidate`, `Invitation`, `Notification`). Only `Candidate` gets a Row-Level Security policy extension (it's queried directly, has `organization_id`); `Invitation` and `Notification` have none of their own — protected transitively, reached only through their RLS-protected parent (`Exam`/`Candidate` for `Invitation`, `Invitation` for `Notification`). `Exam.status` changes meaning from `active`/`archived` to `draft`/`published`/`archived`, with a new `publish()` action on the existing `ExamsService`/`ExamsController`. A new `EmailService` (Nodemailer) sends real SMTP email via Ethereal in dev. Three new/extended NestJS modules: `EmailModule`, `CandidatesModule`, `InvitationsModule`.

**Tech Stack:** Same as Phase 0/1a/1b — NestJS, Prisma (`sqlserver` provider), SQL Server, Jest/Supertest. New dependencies: `nodemailer` (SMTP send), `csv-parse` (CSV bulk upload parsing), `@types/nodemailer` (dev).

## Global Constraints

- All primary keys and organization-scoping foreign keys are `@db.UniqueIdentifier` in Prisma — never a plain `String` with no native-type annotation.
- **Every service method that queries `candidates` MUST go through `TenantPrismaService.forTenant()`** (`apps/api/src/prisma/tenant-prisma.service.ts`), never the raw `PrismaService` directly. If a single unit of work needs to check a row exists AND then mutate it, both steps must be inside the SAME `forTenant` callback.
- **`invitations` and `notifications` have no `organization_id` column and no Row-Level Security policy of their own.** RLS only protects `candidates` (and, from Phase 1b, `exams`). Every service method that touches `Invitation` or `Notification` MUST first verify ownership through an RLS-protected parent — either the parent `Exam`'s `organizationId` (for exam-scoped invitation lookups) or, for a bare `:id` lookup with no exam in the URL, by joining `invitation.exam.organizationId` inside the same `forTenant` call. Skipping this check is a real cross-tenant data leak, not a theoretical one.
- Migrations are applied with `npx prisma migrate deploy`, **never** `npx prisma migrate dev` (the `examapp_dev` database login lacks `CREATE DATABASE` permission needed for `migrate dev`'s shadow database). `migrate dev --create-only` is safe to use for *generating* migration SQL; the actual apply step must be `migrate deploy`, followed by an explicit `npx prisma generate`.
- Every `created_at`-style column default must use `DEFAULT GETUTCDATE()`, never `DEFAULT CURRENT_TIMESTAMP` (which is OS-local time in SQL Server, not UTC) — a real, previously-shipped bug (see `memory.md` Section 4).
- **Never edit an already-applied migration file's SQL text in place.** If a mistake needs fixing, write a NEW migration. This includes the `exams.status` default change in this plan — it's a NEW migration altering an existing constraint, not an edit to the Phase 1b migration file.
- Required (non-optional) `class-validator` DTO properties must use a definite-assignment assertion (`title!: string;`), not a bare `title: string;` — `tsconfig.base.json`'s `strict: true` enables `strictPropertyInitialization`.
- No hard `DELETE` anywhere in this phase — candidates have no archive/delete endpoint at all (out of scope, see design spec), invitations move through `status` (`invited`/`revoked`), exams gain `published` between `draft` and `archived`.
- **Email is real, not stubbed** — `EmailService` performs an actual SMTP send via Nodemailer. In dev (no `SMTP_HOST` env var set), it auto-creates a free Ethereal test account on first use and logs a preview URL. e2e tests override `EmailService` with a recording test double (no network calls in the standard test run) — see Task 10.
- No candidate-facing login, no candidate groups/batches, no real production email provider account, no multipart CSV file upload, no frontend UI — see the design spec's "Open Items" section for what's deferred and why.
- Full spec: `docs/superpowers/specs/2026-07-07-phase-1c-candidates-invitations-design.md`. Full prior context: `memory.md` at repo root, `docs/superpowers/plans/2026-07-07-phase-1b-exam-builder.md`.

---

## File Structure

```
apps/api/
  package.json                                          # Modify: add nodemailer, csv-parse deps; @types/nodemailer devDep
  prisma/
    schema.prisma                                        # Modify: add Candidate, Invitation, Notification; Exam gains invitations relation + draft default
    migrations/
      20260707150000_candidates_invitations_schema/
        migration.sql                                    # Create: candidates, invitations, notifications tables; exams status default change + data migration
      20260707150001_candidates_rls/
        migration.sql                                    # Create: extend TenantAccessPolicy to candidates
    seed.ts                                               # Modify: add candidate:manage permission + grant to recruiter
  src/
    email/
      email.service.ts                                   # Create: Nodemailer wrapper, Ethereal auto-account
      email.service.spec.ts                               # Create: unit tests, mocked nodemailer
      email.module.ts                                     # Create
    candidates/
      csv-parser.ts                                       # Create: pure function, CSV text -> validated rows + row errors
      csv-parser.spec.ts                                  # Create
      dto/
        create-candidate.dto.ts                           # Create
        bulk-upload-candidates.dto.ts                     # Create
      candidates.service.ts                               # Create: create/list/bulkUpload via TenantPrismaService
      candidates.service.spec.ts                          # Create
      candidates.controller.ts                            # Create
      candidates.module.ts                                # Create
    exams/
      exams.service.ts                                    # Modify: add publish(); fix list() default filter for new status model
      exams.service.spec.ts                               # Modify: update stale test, add publish() tests
      exams.controller.ts                                 # Modify: add POST :id/publish route
    invitations/
      dto/
        create-invitations.dto.ts                         # Create
      invitations.service.ts                               # Create: bulkInvite/list/resend/revoke
      invitations.service.spec.ts                          # Create
      invitations.controller.ts                            # Create
      invitations.module.ts                                # Create
    app.module.ts                                          # Modify: register CandidatesModule, InvitationsModule
  scripts/
    verify-email-manual.ts                                # Create: one-off manual Ethereal delivery check (not part of automated suite)
  test/
    candidates-invitations.e2e-spec.ts                     # Create in Task 2 (isolation only), completed in Task 10
```

---

### Task 1: Prisma schema and migration for Candidate/Invitation/Notification, exam publish status model

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260707150000_candidates_invitations_schema/migration.sql`

**Interfaces:**
- Produces: Prisma models `Candidate` (fields: `id`, `organizationId`, `email`, `name`, `phone`, `createdAt`, relation `invitations`), `Invitation` (fields: `id`, `examId`, `candidateId`, `token`, `status`, `invitedAt`, `expiresAt`, `revokedAt`, relations `exam`, `candidate`, `notifications`), `Notification` (fields: `id`, `invitationId`, `channel`, `status`, `sentAt`, `createdAt`, relation `invitation`) — every later task relies on these exact field names. `Exam.status` now takes values `draft`/`published`/`archived` (was `active`/`archived`).

- [ ] **Step 1: Add the models to schema.prisma**

Modify the existing `Exam` model in `apps/api/prisma/schema.prisma` — change the `status` default and add the new back-relation:

```prisma
model Exam {
  id             String        @id @default(uuid()) @db.UniqueIdentifier
  organizationId String        @map("organization_id") @db.UniqueIdentifier
  title          String
  instructions   String?       @db.NVarChar(Max)
  status         String        @default("draft")
  createdBy      String        @map("created_by") @db.UniqueIdentifier
  createdAt      DateTime      @default(now()) @map("created_at")
  sections       ExamSection[]
  invitations    Invitation[]

  @@index([organizationId, status])
  @@map("exams")
}
```

Then add three new models (after the existing `ExamSectionQuestion` model):

```prisma
model Candidate {
  id             String       @id @default(uuid()) @db.UniqueIdentifier
  organizationId String       @map("organization_id") @db.UniqueIdentifier
  email          String
  name           String
  phone          String?
  createdAt      DateTime     @default(now()) @map("created_at")
  invitations    Invitation[]

  @@unique([organizationId, email])
  @@map("candidates")
}

model Invitation {
  id            String         @id @default(uuid()) @db.UniqueIdentifier
  examId        String         @map("exam_id") @db.UniqueIdentifier
  candidateId   String         @map("candidate_id") @db.UniqueIdentifier
  token         String         @unique
  status        String         @default("invited")
  invitedAt     DateTime       @default(now()) @map("invited_at")
  expiresAt     DateTime       @map("expires_at")
  revokedAt     DateTime?      @map("revoked_at")
  exam          Exam           @relation(fields: [examId], references: [id], onDelete: Cascade)
  candidate     Candidate      @relation(fields: [candidateId], references: [id], onDelete: Cascade)
  notifications Notification[]

  @@index([examId, status])
  @@map("invitations")
}

model Notification {
  id           String     @id @default(uuid()) @db.UniqueIdentifier
  invitationId String     @map("invitation_id") @db.UniqueIdentifier
  channel      String     @default("email")
  status       String
  sentAt       DateTime?  @map("sent_at")
  createdAt    DateTime   @default(now()) @map("created_at")
  invitation   Invitation @relation(fields: [invitationId], references: [id], onDelete: Cascade)

  @@index([invitationId])
  @@map("notifications")
}
```

- [ ] **Step 2: Generate the migration**

Run (from `apps/api/`): `npx prisma migrate dev --create-only --name candidates_invitations_schema`
Expected: fails with a P3014 shadow-database permission error, same as every prior schema task in this project (the `examapp_dev` login lacks `CREATE DATABASE`). This is the documented, expected fallback — hand-write the migration SQL directly (Step 3). If it unexpectedly succeeds, use the generated SQL instead, but verify it matches the same table/column/constraint shape below.

- [ ] **Step 3: Write the migration SQL by hand (fallback if Step 2 hit P3014)**

`apps/api/prisma/migrations/20260707150000_candidates_invitations_schema/migration.sql`:
```sql
-- CreateTable
CREATE TABLE [dbo].[candidates] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organization_id] UNIQUEIDENTIFIER NOT NULL,
    [email] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [phone] NVARCHAR(1000),
    [created_at] DATETIME2 NOT NULL CONSTRAINT [candidates_created_at_df] DEFAULT GETUTCDATE(),
    CONSTRAINT [candidates_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[invitations] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [exam_id] UNIQUEIDENTIFIER NOT NULL,
    [candidate_id] UNIQUEIDENTIFIER NOT NULL,
    [token] NVARCHAR(1000) NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [invitations_status_df] DEFAULT 'invited',
    [invited_at] DATETIME2 NOT NULL CONSTRAINT [invitations_invited_at_df] DEFAULT GETUTCDATE(),
    [expires_at] DATETIME2 NOT NULL,
    [revoked_at] DATETIME2,
    CONSTRAINT [invitations_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[notifications] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [invitation_id] UNIQUEIDENTIFIER NOT NULL,
    [channel] NVARCHAR(1000) NOT NULL CONSTRAINT [notifications_channel_df] DEFAULT 'email',
    [status] NVARCHAR(1000) NOT NULL,
    [sent_at] DATETIME2,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [notifications_created_at_df] DEFAULT GETUTCDATE(),
    CONSTRAINT [notifications_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE UNIQUE NONCLUSTERED INDEX [candidates_organization_id_email_key] ON [dbo].[candidates]([organization_id], [email]);

-- CreateIndex
CREATE UNIQUE NONCLUSTERED INDEX [invitations_token_key] ON [dbo].[invitations]([token]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [invitations_exam_id_status_idx] ON [dbo].[invitations]([exam_id], [status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [notifications_invitation_id_idx] ON [dbo].[notifications]([invitation_id]);

-- AddForeignKey
ALTER TABLE [dbo].[invitations] ADD CONSTRAINT [invitations_exam_id_fkey] FOREIGN KEY ([exam_id]) REFERENCES [dbo].[exams]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[invitations] ADD CONSTRAINT [invitations_candidate_id_fkey] FOREIGN KEY ([candidate_id]) REFERENCES [dbo].[candidates]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[notifications] ADD CONSTRAINT [notifications_invitation_id_fkey] FOREIGN KEY ([invitation_id]) REFERENCES [dbo].[invitations]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: exams.status changes meaning from active/archived to draft/published/archived.
-- The default becomes 'draft'. Any pre-existing row using the old 'active' meaning is
-- migrated to 'published' so it keeps behaving the way it did before this migration --
-- an exam that was already usable is not retroactively downgraded to draft.
ALTER TABLE [dbo].[exams] DROP CONSTRAINT [exams_status_df];
ALTER TABLE [dbo].[exams] ADD CONSTRAINT [exams_status_df] DEFAULT 'draft' FOR [status];
UPDATE [dbo].[exams] SET [status] = 'published' WHERE [status] = 'active';
```

Note: both `invitations` foreign keys (`exam_id`, `candidate_id`) use `ON DELETE CASCADE` — unlike `exam_section_questions_question_id_fkey` in Phase 1b (which needed `NO ACTION` to avoid a multiple-cascade-path conflict), `Invitation` has no shared descendant between its two parents (`Exam` and `Candidate` don't cascade into each other), so both cascades are safe here.

- [ ] **Step 4: Apply the migration**

Run: `npx prisma migrate deploy` (never `migrate dev` for applying), then `npx prisma generate`.
Expected: migration applies cleanly; `@prisma/client` types now include `Candidate`, `Invitation`, `Notification`, and `Exam.invitations`.

- [ ] **Step 5: Verify against the real database**

Run: `sqlcmd -S localhost,1433 -U examapp_dev -P 'DevPassw0rd!2026' -d examapp -Q "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME IN ('candidates','invitations','notifications')" -C`
Expected: all three table names returned.

Run: `sqlcmd -S localhost,1433 -U examapp_dev -P 'DevPassw0rd!2026' -d examapp -Q "SELECT dc.name, dc.definition FROM sys.default_constraints dc JOIN sys.columns c ON dc.parent_object_id=c.object_id AND dc.parent_column_id=c.column_id WHERE c.name='created_at' AND OBJECT_NAME(dc.parent_object_id)='candidates'" -C`
Expected: one row, `definition` = `(getutcdate())`.

Run: `sqlcmd -S localhost,1433 -U examapp_dev -P 'DevPassw0rd!2026' -d examapp -Q "SELECT dc.name, dc.definition FROM sys.default_constraints dc JOIN sys.columns c ON dc.parent_object_id=c.object_id AND dc.parent_column_id=c.column_id WHERE c.name='status' AND OBJECT_NAME(dc.parent_object_id)='exams'" -C`
Expected: one row, `definition` = `('draft')` — confirming the default actually changed from `'active'`.

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat: add Candidate, Invitation, and Notification schema; exams gain draft/published/archived status for Phase 1c"
```

---

### Task 2: Row-Level Security on the candidates table

**Files:**
- Create: `apps/api/prisma/migrations/20260707150001_candidates_rls/migration.sql`
- Create: `apps/api/test/candidates-invitations.e2e-spec.ts` (isolation-only portion; completed in Task 10)

**Interfaces:**
- Consumes: the existing `dbo.fn_tenant_access_predicate(@OrgId UNIQUEIDENTIFIER)` function and `dbo.TenantAccessPolicy` security policy.
- Produces: `candidates` is now RLS-protected — a query with no tenant session context set returns zero rows; a query scoped to the wrong organization never sees another organization's candidates.

- [ ] **Step 1: Write the migration**

`apps/api/prisma/migrations/20260707150001_candidates_rls/migration.sql`:
```sql
-- Extend the tenant isolation security policy created in Phase 0
-- (20260707110005_tenant_rls_policy) to also cover dbo.candidates. Reuses
-- the existing dbo.fn_tenant_access_predicate function unchanged; this
-- adds predicates to the existing policy, it does not create a new
-- policy or function. The policy is already WITH (STATE = ON), so no
-- state change is needed here.
ALTER SECURITY POLICY dbo.TenantAccessPolicy
ADD FILTER PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.candidates,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.candidates AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.candidates AFTER UPDATE;
```

Since Prisma can't diff a raw `ALTER SECURITY POLICY` statement, create this migration folder and file by hand.

Note: `invitations` and `notifications` deliberately get NO predicates here — see this plan's Global Constraints for why, and why every service method touching them must compensate with an explicit application-level ownership check.

- [ ] **Step 2: Apply the migration**

Run: `npx prisma migrate deploy` (from `apps/api/`)
Expected: applies cleanly. Run `npx prisma migrate status` to confirm — all migrations applied, no drift.

- [ ] **Step 3: Write a failing isolation test to verify the policy works**

`apps/api/test/candidates-invitations.e2e-spec.ts` (this file is completed fully in Task 10 — for this step, write ONLY the isolation-proving portion below and run it standalone):

```typescript
import { Test } from '@nestjs/testing';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantPrismaService } from '../src/prisma/tenant-prisma.service';
import { PrismaModule } from '../src/prisma/prisma.module';
import { randomUUID } from 'crypto';

describe('Candidates Row-Level Security', () => {
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let planId: string;
  let orgAId: string;
  let orgBId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [PrismaModule] }).compile();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);

    const plan = await prisma.plan.create({
      data: { name: `ci-rls-plan-${randomUUID()}`, candidateLimit: 10, aiCreditLimit: 1, proctoringMinutesLimit: 1 },
    });
    planId = plan.id;

    const orgA = await prisma.organization.create({ data: { name: 'CI Org A', slug: `ci-org-a-${randomUUID()}`, planId } });
    const orgB = await prisma.organization.create({ data: { name: 'CI Org B', slug: `ci-org-b-${randomUUID()}`, planId } });
    orgAId = orgA.id;
    orgBId = orgB.id;

    await tenantPrisma.forTenant({ organizationId: orgAId, isSuperAdmin: false }, (tx) =>
      tx.candidate.create({ data: { organizationId: orgAId, email: 'candidate@org-a.test', name: 'Org A Candidate' } }),
    );
  });

  afterAll(async () => {
    await tenantPrisma.forTenant({ organizationId: orgAId, isSuperAdmin: false }, (tx) =>
      tx.candidate.deleteMany({ where: { organizationId: orgAId } }),
    );
    await prisma.organization.deleteMany({ where: { id: { in: [orgAId, orgBId] } } });
    await prisma.plan.delete({ where: { id: planId } });
    await prisma.$disconnect();
  });

  it("never returns another tenant's candidates", async () => {
    const orgBCandidates = await tenantPrisma.forTenant({ organizationId: orgBId, isSuperAdmin: false }, (tx) =>
      tx.candidate.findMany(),
    );
    expect(orgBCandidates).toHaveLength(0);
  });

  it('returns zero rows when no tenant context has been set', async () => {
    const rows = await prisma.candidate.findMany({ where: { organizationId: orgAId } });
    expect(rows).toHaveLength(0);
  });
});
```

- [ ] **Step 4: Run it to confirm the RLS policy actually works**

Run: `npm run test:api:e2e -- candidates-invitations`
Expected: `2 passed`. If either fails, the policy did not apply correctly — re-check Step 1 before continuing.

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/migrations apps/api/test/candidates-invitations.e2e-spec.ts
git commit -m "feat: extend Row-Level Security policy to the candidates table"
```

---

### Task 3: EmailService (Nodemailer + Ethereal)

**Files:**
- Modify: `apps/api/package.json`
- Create: `apps/api/src/email/email.service.ts`
- Create: `apps/api/src/email/email.service.spec.ts`
- Create: `apps/api/src/email/email.module.ts`

**Interfaces:**
- Produces: `EmailService.send(input: { to: string; subject: string; html: string }): Promise<{ success: boolean; previewUrl?: string }>` — Task 8's `InvitationsService` consumes this exact signature. `EmailModule` exports `EmailService`.

- [ ] **Step 1: Add dependencies**

In `apps/api/package.json`, add to `dependencies`:
```json
    "csv-parse": "^7.0.1",
    "nodemailer": "^9.0.3",
```

And to `devDependencies`:
```json
    "@types/nodemailer": "^8.0.1",
```

Run (from repo root): `npm install`
Expected: installs cleanly, `package-lock.json` updated.

- [ ] **Step 2: Write the failing tests**

`apps/api/src/email/email.service.spec.ts`:
```typescript
import { Test } from '@nestjs/testing';
import { EmailService } from './email.service';

jest.mock('nodemailer', () => ({
  createTestAccount: jest.fn(),
  createTransport: jest.fn(),
  getTestMessageUrl: jest.fn(),
}));

import * as nodemailer from 'nodemailer';

describe('EmailService', () => {
  let service: EmailService;
  const originalEnv = process.env;

  beforeEach(async () => {
    jest.resetAllMocks();
    process.env = { ...originalEnv };
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_PORT;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;

    const moduleRef = await Test.createTestingModule({ providers: [EmailService] }).compile();
    service = moduleRef.get(EmailService);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('sends via an Ethereal test account when SMTP_HOST is not configured', async () => {
    (nodemailer.createTestAccount as jest.Mock).mockResolvedValue({
      user: 'ethereal-user',
      pass: 'ethereal-pass',
      smtp: { host: 'smtp.ethereal.email', port: 587, secure: false },
    });
    const sendMail = jest.fn().mockResolvedValue({ messageId: '123' });
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });
    (nodemailer.getTestMessageUrl as jest.Mock).mockReturnValue('https://ethereal.email/message/123');

    const result = await service.send({ to: 'candidate@test.com', subject: 'Invite', html: '<p>hi</p>' });

    expect(nodemailer.createTestAccount).toHaveBeenCalledTimes(1);
    expect(nodemailer.createTransport).toHaveBeenCalledWith({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: { user: 'ethereal-user', pass: 'ethereal-pass' },
    });
    expect(sendMail).toHaveBeenCalledWith({
      from: 'no-reply@exam-platform.test',
      to: 'candidate@test.com',
      subject: 'Invite',
      html: '<p>hi</p>',
    });
    expect(result).toEqual({ success: true, previewUrl: 'https://ethereal.email/message/123' });
  });

  it('sends via configured SMTP without creating an Ethereal test account when SMTP_HOST is set', async () => {
    process.env.SMTP_HOST = 'smtp.real-provider.test';
    process.env.SMTP_PORT = '2525';
    process.env.SMTP_USER = 'real-user';
    process.env.SMTP_PASS = 'real-pass';
    const sendMail = jest.fn().mockResolvedValue({ messageId: '456' });
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });
    (nodemailer.getTestMessageUrl as jest.Mock).mockReturnValue(false);

    await service.send({ to: 'candidate@test.com', subject: 'Invite', html: '<p>hi</p>' });

    expect(nodemailer.createTestAccount).not.toHaveBeenCalled();
    expect(nodemailer.createTransport).toHaveBeenCalledWith({
      host: 'smtp.real-provider.test',
      port: 2525,
      auth: { user: 'real-user', pass: 'real-pass' },
    });
  });

  it('returns success: false and does not throw when sendMail fails', async () => {
    (nodemailer.createTestAccount as jest.Mock).mockResolvedValue({
      user: 'ethereal-user',
      pass: 'ethereal-pass',
      smtp: { host: 'smtp.ethereal.email', port: 587, secure: false },
    });
    const sendMail = jest.fn().mockRejectedValue(new Error('SMTP connection refused'));
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });

    const result = await service.send({ to: 'candidate@test.com', subject: 'Invite', html: '<p>hi</p>' });

    expect(result).toEqual({ success: false });
  });

  it('reuses the same transporter across multiple sends instead of recreating it', async () => {
    (nodemailer.createTestAccount as jest.Mock).mockResolvedValue({
      user: 'ethereal-user',
      pass: 'ethereal-pass',
      smtp: { host: 'smtp.ethereal.email', port: 587, secure: false },
    });
    const sendMail = jest.fn().mockResolvedValue({ messageId: '789' });
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });
    (nodemailer.getTestMessageUrl as jest.Mock).mockReturnValue(false);

    await service.send({ to: 'a@test.com', subject: 'One', html: '<p>1</p>' });
    await service.send({ to: 'b@test.com', subject: 'Two', html: '<p>2</p>' });

    expect(nodemailer.createTestAccount).toHaveBeenCalledTimes(1);
    expect(sendMail).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm run test:api -- email.service`
Expected: FAIL — `EmailService` is not defined yet.

- [ ] **Step 4: Implement the service**

`apps/api/src/email/email.service.ts`:
```typescript
import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
}

export interface SendEmailResult {
  success: boolean;
  previewUrl?: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporterPromise: Promise<Transporter> | null = null;

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    try {
      const transporter = await this.getTransporter();
      const info = await transporter.sendMail({
        from: 'no-reply@exam-platform.test',
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

  private async getTransporter(): Promise<Transporter> {
    if (!this.transporterPromise) {
      this.transporterPromise = this.createTransporter();
    }
    return this.transporterPromise;
  }

  private async createTransporter(): Promise<Transporter> {
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

`apps/api/src/email/email.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { EmailService } from './email.service';

@Module({
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test:api -- email.service`
Expected: `4 passed`.

- [ ] **Step 6: Commit**

```bash
git add apps/api/package.json package-lock.json apps/api/src/email
git commit -m "feat: add EmailService (Nodemailer + Ethereal) for invitation delivery"
```

---

### Task 4: Candidate CSV parsing and row validation

**Files:**
- Create: `apps/api/src/candidates/csv-parser.ts`
- Create: `apps/api/src/candidates/csv-parser.spec.ts`

**Interfaces:**
- Produces: `parseCandidateCsv(csvContent: string): { rows: CandidateCsvRow[]; errors: CandidateCsvError[] }`, where `CandidateCsvRow = { email: string; name: string; phone?: string }` and `CandidateCsvError = { row: number; reason: string }`. `row` is 1-indexed against data rows only (header excluded). Consumed by Task 5's `CandidatesService.bulkUpload`.

- [ ] **Step 1: Write the failing tests**

`apps/api/src/candidates/csv-parser.spec.ts`:
```typescript
import { parseCandidateCsv } from './csv-parser';

describe('parseCandidateCsv', () => {
  it('parses valid rows including an optional phone column', () => {
    const csv = 'email,name,phone\nalice@test.com,Alice,555-1234\nbob@test.com,Bob,';
    const result = parseCandidateCsv(csv);

    expect(result.errors).toHaveLength(0);
    expect(result.rows).toEqual([
      { email: 'alice@test.com', name: 'Alice', phone: '555-1234' },
      { email: 'bob@test.com', name: 'Bob', phone: undefined },
    ]);
  });

  it('flags a row with a missing email', () => {
    const csv = 'email,name,phone\n,Alice,555-1234';
    const result = parseCandidateCsv(csv);

    expect(result.rows).toHaveLength(0);
    expect(result.errors).toEqual([{ row: 1, reason: 'Invalid or missing email: ""' }]);
  });

  it('flags a row with a malformed email', () => {
    const csv = 'email,name,phone\nnot-an-email,Alice,';
    const result = parseCandidateCsv(csv);

    expect(result.rows).toHaveLength(0);
    expect(result.errors).toEqual([{ row: 1, reason: 'Invalid or missing email: "not-an-email"' }]);
  });

  it('flags a row with a missing name', () => {
    const csv = 'email,name,phone\nalice@test.com,,';
    const result = parseCandidateCsv(csv);

    expect(result.rows).toHaveLength(0);
    expect(result.errors).toEqual([{ row: 1, reason: 'Missing name' }]);
  });

  it('continues processing subsequent rows after an earlier row fails, with correct row numbers', () => {
    const csv = 'email,name,phone\nbad-email,Alice,\nbob@test.com,Bob,';
    const result = parseCandidateCsv(csv);

    expect(result.errors).toEqual([{ row: 1, reason: 'Invalid or missing email: "bad-email"' }]);
    expect(result.rows).toEqual([{ email: 'bob@test.com', name: 'Bob', phone: undefined }]);
  });

  it('returns no rows and no errors for a header-only CSV', () => {
    const result = parseCandidateCsv('email,name,phone');
    expect(result.rows).toEqual([]);
    expect(result.errors).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:api -- csv-parser`
Expected: FAIL — `parseCandidateCsv` is not defined yet.

- [ ] **Step 3: Write the implementation**

`apps/api/src/candidates/csv-parser.ts`:
```typescript
import { parse } from 'csv-parse/sync';

export interface CandidateCsvRow {
  email: string;
  name: string;
  phone?: string;
}

export interface CandidateCsvError {
  row: number;
  reason: string;
}

export interface ParsedCandidateCsv {
  rows: CandidateCsvRow[];
  errors: CandidateCsvError[];
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseCandidateCsv(csvContent: string): ParsedCandidateCsv {
  const records: Record<string, string>[] = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  const rows: CandidateCsvRow[] = [];
  const errors: CandidateCsvError[] = [];

  records.forEach((record, index) => {
    const rowNumber = index + 1;
    const email = record.email ?? '';
    const name = record.name ?? '';
    const phone = record.phone?.trim() || undefined;

    if (!EMAIL_PATTERN.test(email)) {
      errors.push({ row: rowNumber, reason: `Invalid or missing email: "${email}"` });
      return;
    }
    if (!name) {
      errors.push({ row: rowNumber, reason: 'Missing name' });
      return;
    }

    rows.push({ email, name, phone });
  });

  return { rows, errors };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:api -- csv-parser`
Expected: `6 passed`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/candidates/csv-parser.ts apps/api/src/candidates/csv-parser.spec.ts
git commit -m "feat: add candidate CSV parsing and row validation"
```

---

### Task 5: CandidatesService

**Files:**
- Create: `apps/api/src/candidates/dto/create-candidate.dto.ts`
- Create: `apps/api/src/candidates/dto/bulk-upload-candidates.dto.ts`
- Create: `apps/api/src/candidates/candidates.service.ts`
- Create: `apps/api/src/candidates/candidates.service.spec.ts`

**Interfaces:**
- Consumes: `TenantPrismaService.forTenant` (Phase 0), `parseCandidateCsv` (Task 4, exact signature above).
- Produces: `CandidatesService.create(context, dto)`, `.list(context, filters)`, `.bulkUpload(context, csvContent)` — Task 6's controller calls these exact method names. `BulkUploadResult = { created: number; updated: number; errors: { row: number; reason: string }[] }`.

- [ ] **Step 1: Write the DTOs**

`apps/api/src/candidates/dto/create-candidate.dto.ts`:
```typescript
import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateCandidateDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  phone?: string;
}
```

`apps/api/src/candidates/dto/bulk-upload-candidates.dto.ts`:
```typescript
import { IsNotEmpty, IsString } from 'class-validator';

export class BulkUploadCandidatesDto {
  @IsString()
  @IsNotEmpty()
  csvContent!: string;
}
```

- [ ] **Step 2: Write the failing unit tests for the service**

`apps/api/src/candidates/candidates.service.spec.ts`:
```typescript
import { Test } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { CandidatesService } from './candidates.service';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';

describe('CandidatesService', () => {
  let service: CandidatesService;
  let tenantPrisma: { forTenant: jest.Mock };
  const context = { organizationId: 'org-1', isSuperAdmin: false };

  beforeEach(async () => {
    tenantPrisma = { forTenant: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [CandidatesService, { provide: TenantPrismaService, useValue: tenantPrisma }],
    }).compile();
    service = moduleRef.get(CandidatesService);
  });

  it("creates a candidate scoped to the caller's organization", async () => {
    const tx = {
      candidate: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'cand-1', email: 'a@test.com', name: 'Alice' }),
      },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    const result = await service.create(context, { email: 'a@test.com', name: 'Alice' });

    expect(result.id).toBe('cand-1');
    expect(tx.candidate.create).toHaveBeenCalledWith({
      data: { organizationId: 'org-1', email: 'a@test.com', name: 'Alice', phone: undefined },
    });
  });

  it('rejects creating a candidate whose email already exists in the organization', async () => {
    const tx = {
      candidate: { findFirst: jest.fn().mockResolvedValue({ id: 'cand-1', email: 'a@test.com' }) },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await expect(service.create(context, { email: 'a@test.com', name: 'Alice' })).rejects.toThrow(ConflictException);
  });

  it("lists candidates scoped to the caller's organization", async () => {
    tenantPrisma.forTenant.mockResolvedValue([{ id: 'cand-1' }]);

    const result = await service.list(context, {});

    expect(result).toHaveLength(1);
    expect(tenantPrisma.forTenant).toHaveBeenCalledWith(context, expect.any(Function));
  });

  it('creates new candidates and updates existing ones from a CSV bulk upload, reporting row errors', async () => {
    const existingCandidate = { id: 'cand-existing', email: 'bob@test.com' };
    const tx = {
      candidate: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(existingCandidate),
        create: jest.fn().mockResolvedValue({ id: 'cand-new' }),
        update: jest.fn().mockResolvedValue({ id: 'cand-existing' }),
      },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    const csv = 'email,name,phone\nbad-email,Bad,\nalice@test.com,Alice,\nbob@test.com,Bob Updated,';
    const result = await service.bulkUpload(context, csv);

    expect(result.errors).toEqual([{ row: 1, reason: 'Invalid or missing email: "bad-email"' }]);
    expect(result.created).toBe(1);
    expect(result.updated).toBe(1);
    expect(tx.candidate.create).toHaveBeenCalledWith({
      data: { organizationId: 'org-1', email: 'alice@test.com', name: 'Alice', phone: undefined },
    });
    expect(tx.candidate.update).toHaveBeenCalledWith({
      where: { id: 'cand-existing' },
      data: { name: 'Bob Updated', phone: undefined },
    });
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm run test:api -- candidates.service`
Expected: FAIL — `CandidatesService` is not defined yet.

- [ ] **Step 4: Implement the service**

`apps/api/src/candidates/candidates.service.ts`:
```typescript
import { ConflictException, Injectable } from '@nestjs/common';
import { Candidate } from '@prisma/client';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { TenantContext } from '../prisma/tenant-context';
import { CreateCandidateDto } from './dto/create-candidate.dto';
import { parseCandidateCsv } from './csv-parser';

interface CandidateFilters {
  limit?: number;
  cursor?: string;
}

export interface BulkUploadResult {
  created: number;
  updated: number;
  errors: { row: number; reason: string }[];
}

@Injectable()
export class CandidatesService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async create(context: TenantContext, dto: CreateCandidateDto): Promise<Candidate> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const existing = await tx.candidate.findFirst({
        where: { organizationId: context.organizationId as string, email: dto.email },
      });
      if (existing) {
        throw new ConflictException(`A candidate with email ${dto.email} already exists`);
      }
      return tx.candidate.create({
        data: {
          organizationId: context.organizationId as string,
          email: dto.email,
          name: dto.name,
          phone: dto.phone,
        },
      });
    });
  }

  async list(context: TenantContext, filters: CandidateFilters): Promise<Candidate[]> {
    const limit = filters.limit && filters.limit > 0 && filters.limit <= 100 ? filters.limit : 20;
    return this.tenantPrisma.forTenant(context, (tx) =>
      tx.candidate.findMany({
        where: { organizationId: context.organizationId as string },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit,
        ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
      }),
    );
  }

  async bulkUpload(context: TenantContext, csvContent: string): Promise<BulkUploadResult> {
    const { rows, errors } = parseCandidateCsv(csvContent);

    return this.tenantPrisma.forTenant(context, async (tx) => {
      let created = 0;
      let updated = 0;

      for (const row of rows) {
        const existing = await tx.candidate.findFirst({
          where: { organizationId: context.organizationId as string, email: row.email },
        });
        if (existing) {
          await tx.candidate.update({
            where: { id: existing.id },
            data: { name: row.name, phone: row.phone },
          });
          updated += 1;
        } else {
          await tx.candidate.create({
            data: {
              organizationId: context.organizationId as string,
              email: row.email,
              name: row.name,
              phone: row.phone,
            },
          });
          created += 1;
        }
      }

      return { created, updated, errors };
    });
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test:api -- candidates.service`
Expected: `4 passed`.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/candidates/dto apps/api/src/candidates/candidates.service.ts apps/api/src/candidates/candidates.service.spec.ts
git commit -m "feat: add CandidatesService with tenant-scoped create/list/CSV bulk upsert"
```

---

### Task 6: CandidatesController, RBAC wiring, and seed permission

**Files:**
- Create: `apps/api/src/candidates/candidates.controller.ts`
- Create: `apps/api/src/candidates/candidates.module.ts`
- Modify: `apps/api/prisma/seed.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `CandidatesService` (Task 5), `JwtAuthGuard`/`PermissionsGuard`/`RequirePermissions`/`CurrentTenant` (Phase 0/1a).
- Produces: HTTP routes under `/candidates`, gated by a new `candidate:manage` permission, granted to the `recruiter` role. This permission is reused (not duplicated) by `InvitationsController` in Task 9.

- [ ] **Step 1: Write the controller**

`apps/api/src/candidates/candidates.controller.ts`:
```typescript
import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { TenantContext } from '../prisma/tenant-context';
import { CandidatesService } from './candidates.service';
import { CreateCandidateDto } from './dto/create-candidate.dto';
import { BulkUploadCandidatesDto } from './dto/bulk-upload-candidates.dto';

@Controller('candidates')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CandidatesController {
  constructor(private readonly candidatesService: CandidatesService) {}

  @Post()
  @RequirePermissions('candidate:manage')
  create(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateCandidateDto) {
    return this.candidatesService.create(tenant, dto);
  }

  @Get()
  @RequirePermissions('candidate:manage')
  list(@CurrentTenant() tenant: TenantContext, @Query('limit') limit?: string, @Query('cursor') cursor?: string) {
    return this.candidatesService.list(tenant, { limit: limit ? parseInt(limit, 10) : undefined, cursor });
  }

  @Post('bulk')
  @RequirePermissions('candidate:manage')
  bulkUpload(@CurrentTenant() tenant: TenantContext, @Body() dto: BulkUploadCandidatesDto) {
    return this.candidatesService.bulkUpload(tenant, dto.csvContent);
  }
}
```

- [ ] **Step 2: Write the module**

`apps/api/src/candidates/candidates.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { CandidatesController } from './candidates.controller';
import { CandidatesService } from './candidates.service';

@Module({
  controllers: [CandidatesController],
  providers: [CandidatesService],
  exports: [CandidatesService],
})
export class CandidatesModule {}
```

- [ ] **Step 3: Add the permission to the seed script**

In `apps/api/prisma/seed.ts`, add `'candidate:manage'` to the `PERMISSIONS` array:
```typescript
const PERMISSIONS = [
  { key: 'platform:manage_organizations', description: 'Create and manage organizations (Super Admin only)' },
  { key: 'org:manage_users', description: 'Invite and manage users within an organization' },
  { key: 'org:manage_settings', description: 'Edit organization branding/domain/security settings' },
  { key: 'org:view', description: 'View organization dashboard and data' },
  { key: 'question_bank:manage', description: 'Create, edit, and archive questions in the organization\'s question bank' },
  { key: 'exam:manage', description: 'Create, edit, and archive exams and their sections in the organization' },
  { key: 'candidate:manage', description: 'Add candidates and manage invitations in the organization' },
];
```

And add it to the `recruiter` entry in `ROLE_PERMISSIONS`:
```typescript
const ROLE_PERMISSIONS: Record<string, string[]> = {
  super_admin: ['platform:manage_organizations', 'org:manage_users', 'org:manage_settings', 'org:view'],
  org_admin: ['org:manage_users', 'org:manage_settings', 'org:view'],
  recruiter: ['org:view', 'question_bank:manage', 'exam:manage', 'candidate:manage'],
  panel: ['org:view'],
};
```

Run: `npx prisma db seed` (from `apps/api/`) to apply the new permission to the existing seeded database.
Expected: runs without error (idempotent — existing `upsert` calls handle the new permission/grant cleanly).

- [ ] **Step 4: Register the module in AppModule**

In `apps/api/src/app.module.ts`, add `CandidatesModule` to the imports:
```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { RbacModule } from './rbac/rbac.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { UsersModule } from './users/users.module';
import { QuestionsModule } from './questions/questions.module';
import { ExamsModule } from './exams/exams.module';
import { CandidatesModule } from './candidates/candidates.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    RbacModule,
    AuditModule,
    AuthModule,
    OrganizationsModule,
    UsersModule,
    QuestionsModule,
    ExamsModule,
    CandidatesModule,
  ],
})
export class AppModule {}
```

- [ ] **Step 5: Run the full unit suite and build check**

Run: `npm run test:api` (from repo root) — expect all suites passing, no regressions.
Run: `npx nest build` (from `apps/api/`) — expect a clean build with `CandidatesModule` wired in.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/candidates/candidates.controller.ts apps/api/src/candidates/candidates.module.ts apps/api/prisma/seed.ts apps/api/src/app.module.ts
git commit -m "feat: add CandidatesController with RBAC, seed candidate:manage permission, wire into AppModule"
```

---

### Task 7: Exam publish lifecycle (draft -> published)

**Files:**
- Modify: `apps/api/src/exams/exams.service.ts`
- Modify: `apps/api/src/exams/exams.service.spec.ts`
- Modify: `apps/api/src/exams/exams.controller.ts`

**Interfaces:**
- Produces: `ExamsService.publish(context, id): Promise<Exam>` — Task 8's `InvitationsService` checks `exam.status === 'published'` before inviting; `POST /exams/:id/publish`.

- [ ] **Step 1: Update the misleading test and add publish() tests**

In `apps/api/src/exams/exams.service.spec.ts`, replace the existing `"lists exams scoped to the caller's organization, defaulting to active status"` test (its name and mock data are stale now that `'active'` is no longer a real exam status):

```typescript
  it("lists exams scoped to the caller's organization, excluding archived by default", async () => {
    tenantPrisma.forTenant.mockResolvedValue([{ id: 'exam-1', status: 'draft' }]);

    const result = await service.list(context, {});

    expect(result).toHaveLength(1);
    expect(tenantPrisma.forTenant).toHaveBeenCalledWith(context, expect.any(Function));
  });
```

Then add these five tests at the end of the `describe('ExamsService', ...)` block, just before the closing `});`:

```typescript
  it('publishes a draft exam that has at least one section with at least one question in each', async () => {
    const tx = {
      exam: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'exam-1',
          status: 'draft',
          sections: [{ id: 'section-1', title: 'Section One', questions: [{ questionId: 'q1' }] }],
        }),
        update: jest.fn().mockResolvedValue({ id: 'exam-1', status: 'published' }),
      },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    const result = await service.publish(context, 'exam-1');

    expect(result.status).toBe('published');
    expect(tx.exam.update).toHaveBeenCalledWith({ where: { id: 'exam-1' }, data: { status: 'published' } });
  });

  it('throws NotFoundException when publishing an exam that does not exist', async () => {
    const tx = { exam: { findFirst: jest.fn().mockResolvedValue(null) } };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await expect(service.publish(context, 'missing-id')).rejects.toThrow(NotFoundException);
  });

  it('throws BadRequestException when publishing an exam that is not in draft status', async () => {
    const tx = {
      exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1', status: 'published', sections: [] }) },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await expect(service.publish(context, 'exam-1')).rejects.toThrow(BadRequestException);
  });

  it('throws BadRequestException when publishing an exam with no sections', async () => {
    const tx = {
      exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1', status: 'draft', sections: [] }) },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await expect(service.publish(context, 'exam-1')).rejects.toThrow(BadRequestException);
  });

  it('throws BadRequestException when publishing an exam with a section that has no questions', async () => {
    const tx = {
      exam: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'exam-1',
          status: 'draft',
          sections: [
            { id: 'section-1', title: 'Section One', questions: [{ questionId: 'q1' }] },
            { id: 'section-2', title: 'Section Two', questions: [] },
          ],
        }),
      },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await expect(service.publish(context, 'exam-1')).rejects.toThrow(BadRequestException);
  });
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `npm run test:api -- exams.service`
Expected: FAIL — `service.publish` is not a function yet.

- [ ] **Step 3: Implement publish() and fix list()'s default filter**

In `apps/api/src/exams/exams.service.ts`, change the import line to include `BadRequestException`:
```typescript
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
```

Replace the `list` method — the old default (`status: filters.status ?? 'active'`) is now wrong, since no exam is ever `'active'` under the new draft/published/archived model:
```typescript
  async list(context: TenantContext, filters: ExamFilters): Promise<Exam[]> {
    return this.tenantPrisma.forTenant(context, (tx) =>
      tx.exam.findMany({
        where: {
          organizationId: context.organizationId as string,
          ...(filters.status ? { status: filters.status } : { status: { not: 'archived' } }),
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
    );
  }
```

Add a new `publish` method, placed after `archive`:
```typescript
  async publish(context: TenantContext, id: string): Promise<Exam> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const exam = await tx.exam.findFirst({
        where: { id, organizationId: context.organizationId as string },
        include: { sections: { include: { questions: true } } },
      });
      if (!exam) {
        throw new NotFoundException(`Exam ${id} not found`);
      }
      if (exam.status !== 'draft') {
        throw new BadRequestException(`Exam ${id} cannot be published from status "${exam.status}"`);
      }
      if (exam.sections.length === 0) {
        throw new BadRequestException('Exam must have at least one section before it can be published');
      }
      const emptySection = exam.sections.find((section) => section.questions.length === 0);
      if (emptySection) {
        throw new BadRequestException(`Section "${emptySection.title}" has no questions attached`);
      }
      return tx.exam.update({ where: { id }, data: { status: 'published' } });
    });
  }
```

- [ ] **Step 4: Add the controller route**

In `apps/api/src/exams/exams.controller.ts`, add this route after `archive`:
```typescript
  @Post(':id/publish')
  @RequirePermissions('exam:manage')
  publish(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.examsService.publish(tenant, id);
  }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test:api -- exams.service`
Expected: `19 passed`.

Run: `npm run test:api` (from repo root)
Expected: all suites passing, no regressions to `questions.service`, `candidates.service`, `email.service`, `exam-section-question-validation`, `csv-parser`.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/exams/exams.service.ts apps/api/src/exams/exams.service.spec.ts apps/api/src/exams/exams.controller.ts
git commit -m "feat: add exam publish lifecycle gate (draft -> published)"
```

---

### Task 8: InvitationsService

**Files:**
- Create: `apps/api/src/invitations/invitations.service.ts`
- Create: `apps/api/src/invitations/invitations.service.spec.ts`

**Interfaces:**
- Consumes: `TenantPrismaService.forTenant` (Phase 0), `EmailService.send` (Task 3, exact signature).
- Produces: `InvitationsService.bulkInvite(context, examId, candidateIds): Promise<BulkInviteResult>`, `.list(context, examId): Promise<Invitation[]>`, `.resend(context, invitationId): Promise<Invitation>`, `.revoke(context, invitationId): Promise<Invitation>` — Task 9's controller calls these exact method names. `BulkInviteResult = { created: Invitation[]; skipped: { candidateId: string; reason: string }[] }`.

- [ ] **Step 1: Write the failing unit tests**

`apps/api/src/invitations/invitations.service.spec.ts`:
```typescript
import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { InvitationsService } from './invitations.service';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { EmailService } from '../email/email.service';

describe('InvitationsService', () => {
  let service: InvitationsService;
  let tenantPrisma: { forTenant: jest.Mock };
  let emailService: { send: jest.Mock };
  const context = { organizationId: 'org-1', isSuperAdmin: false };

  beforeEach(async () => {
    tenantPrisma = { forTenant: jest.fn() };
    emailService = { send: jest.fn().mockResolvedValue({ success: true, previewUrl: 'https://ethereal.email/x' }) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        InvitationsService,
        { provide: TenantPrismaService, useValue: tenantPrisma },
        { provide: EmailService, useValue: emailService },
      ],
    }).compile();
    service = moduleRef.get(InvitationsService);
  });

  it('invites every requested candidate to a published exam and sends an email for each', async () => {
    const createTx = {
      exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1', title: 'Backend Round', status: 'published' }) },
      candidate: { findMany: jest.fn().mockResolvedValue([{ id: 'cand-1', email: 'a@test.com', name: 'Alice' }]) },
      invitation: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 'inv-1', examId: 'exam-1', candidateId: 'cand-1', status: 'invited' }),
      },
    };
    const notifTx = { notification: { create: jest.fn().mockResolvedValue({ id: 'notif-1' }) } };
    tenantPrisma.forTenant
      .mockImplementationOnce((_ctx, fn) => fn(createTx))
      .mockImplementationOnce((_ctx, fn) => fn(notifTx));

    const result = await service.bulkInvite(context, 'exam-1', ['cand-1']);

    expect(result.created).toHaveLength(1);
    expect(result.skipped).toHaveLength(0);
    expect(emailService.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'a@test.com', subject: "You've been invited to an exam" }),
    );
    expect(notifTx.notification.create).toHaveBeenCalledWith({
      data: { invitationId: 'inv-1', status: 'sent', sentAt: expect.any(Date) },
    });
  });

  it('throws NotFoundException when the exam does not exist', async () => {
    const tx = { exam: { findFirst: jest.fn().mockResolvedValue(null) } };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await expect(service.bulkInvite(context, 'missing-exam', ['cand-1'])).rejects.toThrow(NotFoundException);
  });

  it('throws BadRequestException when the exam is not published', async () => {
    const tx = { exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1', status: 'draft' }) } };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await expect(service.bulkInvite(context, 'exam-1', ['cand-1'])).rejects.toThrow(BadRequestException);
  });

  it('throws NotFoundException when a candidateId does not resolve in this organization', async () => {
    const tx = {
      exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1', status: 'published' }) },
      candidate: { findMany: jest.fn().mockResolvedValue([]) },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await expect(service.bulkInvite(context, 'exam-1', ['missing-cand'])).rejects.toThrow(NotFoundException);
  });

  it('skips a candidate who already has a live invitation instead of creating a duplicate', async () => {
    const tx = {
      exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1', title: 'Backend Round', status: 'published' }) },
      candidate: { findMany: jest.fn().mockResolvedValue([{ id: 'cand-1', email: 'a@test.com', name: 'Alice' }]) },
      invitation: {
        findMany: jest.fn().mockResolvedValue([{ candidateId: 'cand-1' }]),
        create: jest.fn(),
      },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    const result = await service.bulkInvite(context, 'exam-1', ['cand-1']);

    expect(result.created).toHaveLength(0);
    expect(result.skipped).toEqual([{ candidateId: 'cand-1', reason: 'Candidate already has a live invitation for this exam' }]);
    expect(tx.invitation.create).not.toHaveBeenCalled();
    expect(emailService.send).not.toHaveBeenCalled();
  });

  it('lists invitations for an exam', async () => {
    const tx = {
      exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1' }) },
      invitation: { findMany: jest.fn().mockResolvedValue([{ id: 'inv-1' }]) },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    const result = await service.list(context, 'exam-1');

    expect(result).toHaveLength(1);
  });

  it('throws NotFoundException when listing invitations for an exam that does not exist', async () => {
    const tx = { exam: { findFirst: jest.fn().mockResolvedValue(null) } };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await expect(service.list(context, 'missing-exam')).rejects.toThrow(NotFoundException);
  });

  it('resends an invitation with a new token and re-sends the email', async () => {
    const existing = {
      id: 'inv-1',
      status: 'invited',
      exam: { title: 'Backend Round', organizationId: 'org-1' },
      candidate: { email: 'a@test.com', name: 'Alice' },
    };
    const updated = { id: 'inv-1', token: 'new-token', status: 'invited' };
    const resendTx = {
      invitation: {
        findFirst: jest.fn().mockResolvedValue(existing),
        update: jest.fn().mockResolvedValue(updated),
      },
    };
    const notifTx = { notification: { create: jest.fn().mockResolvedValue({ id: 'notif-2' }) } };
    tenantPrisma.forTenant
      .mockImplementationOnce((_ctx, fn) => fn(resendTx))
      .mockImplementationOnce((_ctx, fn) => fn(notifTx));

    const result = await service.resend(context, 'inv-1');

    expect(result).toEqual(updated);
    expect(resendTx.invitation.update).toHaveBeenCalledWith({
      where: { id: 'inv-1' },
      data: { token: expect.any(String), expiresAt: expect.any(Date) },
    });
    expect(emailService.send).toHaveBeenCalledWith(expect.objectContaining({ to: 'a@test.com' }));
  });

  it('throws NotFoundException when resending an invitation that does not exist', async () => {
    const tx = { invitation: { findFirst: jest.fn().mockResolvedValue(null) } };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await expect(service.resend(context, 'missing-inv')).rejects.toThrow(NotFoundException);
  });

  it('throws BadRequestException when resending a revoked invitation', async () => {
    const tx = {
      invitation: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'inv-1',
          status: 'revoked',
          exam: { title: 'Backend Round' },
          candidate: { email: 'a@test.com' },
        }),
      },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await expect(service.resend(context, 'inv-1')).rejects.toThrow(BadRequestException);
  });

  it('revokes a live invitation', async () => {
    const tx = {
      invitation: {
        findFirst: jest.fn().mockResolvedValue({ id: 'inv-1', status: 'invited' }),
        update: jest.fn().mockResolvedValue({ id: 'inv-1', status: 'revoked' }),
      },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    const result = await service.revoke(context, 'inv-1');

    expect(result.status).toBe('revoked');
    expect(tx.invitation.update).toHaveBeenCalledWith({
      where: { id: 'inv-1' },
      data: { status: 'revoked', revokedAt: expect.any(Date) },
    });
  });

  it('revoking an already-revoked invitation is a no-op, not an error', async () => {
    const tx = {
      invitation: {
        findFirst: jest.fn().mockResolvedValue({ id: 'inv-1', status: 'revoked' }),
        update: jest.fn(),
      },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    const result = await service.revoke(context, 'inv-1');

    expect(result.status).toBe('revoked');
    expect(tx.invitation.update).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when revoking an invitation that does not exist', async () => {
    const tx = { invitation: { findFirst: jest.fn().mockResolvedValue(null) } };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await expect(service.revoke(context, 'missing-inv')).rejects.toThrow(NotFoundException);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:api -- invitations.service`
Expected: FAIL — `InvitationsService` is not defined yet.

- [ ] **Step 3: Implement the service**

`apps/api/src/invitations/invitations.service.ts`:
```typescript
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { Candidate, Invitation } from '@prisma/client';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { TenantContext } from '../prisma/tenant-context';
import { EmailService } from '../email/email.service';

const INVITATION_EXPIRY_DAYS = 7;

function generateToken(): string {
  return randomBytes(32).toString('hex');
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export interface BulkInviteResult {
  created: Invitation[];
  skipped: { candidateId: string; reason: string }[];
}

@Injectable()
export class InvitationsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly emailService: EmailService,
  ) {}

  async bulkInvite(context: TenantContext, examId: string, candidateIds: string[]): Promise<BulkInviteResult> {
    const uniqueCandidateIds = [...new Set(candidateIds)];

    const { examTitle, createdWithCandidate, skipped } = await this.tenantPrisma.forTenant(context, async (tx) => {
      const exam = await tx.exam.findFirst({ where: { id: examId, organizationId: context.organizationId as string } });
      if (!exam) {
        throw new NotFoundException(`Exam ${examId} not found`);
      }
      if (exam.status !== 'published') {
        throw new BadRequestException(`Exam ${examId} must be published before candidates can be invited`);
      }

      const candidates = await tx.candidate.findMany({
        where: { id: { in: uniqueCandidateIds }, organizationId: context.organizationId as string },
      });
      const foundIds = new Set(candidates.map((c) => c.id));
      const missingIds = uniqueCandidateIds.filter((id) => !foundIds.has(id));
      if (missingIds.length > 0) {
        throw new NotFoundException(`One or more candidates were not found in this organization: ${missingIds.join(', ')}`);
      }

      const liveInvitations = await tx.invitation.findMany({
        where: { examId, candidateId: { in: uniqueCandidateIds }, status: 'invited', expiresAt: { gt: new Date() } },
        select: { candidateId: true },
      });
      const alreadyInvitedIds = new Set(liveInvitations.map((i) => i.candidateId));

      const createdWithCandidate: { invitation: Invitation; candidate: Candidate }[] = [];
      const skipped: { candidateId: string; reason: string }[] = [];

      for (const candidate of candidates) {
        if (alreadyInvitedIds.has(candidate.id)) {
          skipped.push({ candidateId: candidate.id, reason: 'Candidate already has a live invitation for this exam' });
          continue;
        }
        const invitation = await tx.invitation.create({
          data: {
            examId,
            candidateId: candidate.id,
            token: generateToken(),
            expiresAt: addDays(new Date(), INVITATION_EXPIRY_DAYS),
          },
        });
        createdWithCandidate.push({ invitation, candidate });
      }

      return { examTitle: exam.title, createdWithCandidate, skipped };
    });

    for (const { invitation, candidate } of createdWithCandidate) {
      await this.dispatchInvitationEmail(context, examTitle, invitation, candidate);
    }

    return { created: createdWithCandidate.map((c) => c.invitation), skipped };
  }

  async list(context: TenantContext, examId: string): Promise<Invitation[]> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const exam = await tx.exam.findFirst({ where: { id: examId, organizationId: context.organizationId as string } });
      if (!exam) {
        throw new NotFoundException(`Exam ${examId} not found`);
      }
      return tx.invitation.findMany({
        where: { examId },
        include: { candidate: true },
        orderBy: [{ invitedAt: 'desc' }, { id: 'desc' }],
      });
    });
  }

  async resend(context: TenantContext, invitationId: string): Promise<Invitation> {
    const { invitation, examTitle, candidate } = await this.tenantPrisma.forTenant(context, async (tx) => {
      const existing = await tx.invitation.findFirst({
        where: { id: invitationId, exam: { organizationId: context.organizationId as string } },
        include: { exam: true, candidate: true },
      });
      if (!existing) {
        throw new NotFoundException(`Invitation ${invitationId} not found`);
      }
      if (existing.status !== 'invited') {
        throw new BadRequestException(`Invitation ${invitationId} cannot be resent from status "${existing.status}"`);
      }
      const updated = await tx.invitation.update({
        where: { id: invitationId },
        data: { token: generateToken(), expiresAt: addDays(new Date(), INVITATION_EXPIRY_DAYS) },
      });
      return { invitation: updated, examTitle: existing.exam.title, candidate: existing.candidate };
    });

    await this.dispatchInvitationEmail(context, examTitle, invitation, candidate);
    return invitation;
  }

  async revoke(context: TenantContext, invitationId: string): Promise<Invitation> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const existing = await tx.invitation.findFirst({
        where: { id: invitationId, exam: { organizationId: context.organizationId as string } },
      });
      if (!existing) {
        throw new NotFoundException(`Invitation ${invitationId} not found`);
      }
      if (existing.status === 'revoked') {
        return existing;
      }
      return tx.invitation.update({ where: { id: invitationId }, data: { status: 'revoked', revokedAt: new Date() } });
    });
  }

  private async dispatchInvitationEmail(
    context: TenantContext,
    examTitle: string,
    invitation: Invitation,
    candidate: Candidate,
  ): Promise<void> {
    const link = `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/invite/${invitation.token}`;
    const result = await this.emailService.send({
      to: candidate.email,
      subject: "You've been invited to an exam",
      html: `<p>You have been invited to take "${examTitle}".</p><p><a href="${link}">${link}</a></p>`,
    });
    await this.tenantPrisma.forTenant(context, (tx) =>
      tx.notification.create({
        data: {
          invitationId: invitation.id,
          status: result.success ? 'sent' : 'failed',
          sentAt: result.success ? new Date() : null,
        },
      }),
    );
  }
}
```

Note: `resend` and `revoke` resolve ownership by joining `invitation.exam.organizationId` inside the `forTenant` call (Prisma translates the `exam: { organizationId: ... }` where-clause into a JOIN) — this is the compensating application-level check required because `invitations` has no RLS policy of its own, per this plan's Global Constraints.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:api -- invitations.service`
Expected: `13 passed`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/invitations/invitations.service.ts apps/api/src/invitations/invitations.service.spec.ts
git commit -m "feat: add InvitationsService with bulk invite, resend, and revoke"
```

---

### Task 9: InvitationsController, module, and AppModule wiring

**Files:**
- Create: `apps/api/src/invitations/dto/create-invitations.dto.ts`
- Create: `apps/api/src/invitations/invitations.controller.ts`
- Create: `apps/api/src/invitations/invitations.module.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `InvitationsService` (Task 8), `EmailModule` (Task 3).
- Produces: HTTP routes `POST/GET /exams/:examId/invitations`, `POST /invitations/:id/resend`, `POST /invitations/:id/revoke`, gated by the existing `candidate:manage` permission (Task 6) — no new permission is added in this task.

- [ ] **Step 1: Write the DTO**

`apps/api/src/invitations/dto/create-invitations.dto.ts`:
```typescript
import { ArrayMinSize, IsArray, IsString } from 'class-validator';

export class CreateInvitationsDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  candidateIds!: string[];
}
```

- [ ] **Step 2: Write the controller**

`apps/api/src/invitations/invitations.controller.ts`:
```typescript
import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { TenantContext } from '../prisma/tenant-context';
import { InvitationsService } from './invitations.service';
import { CreateInvitationsDto } from './dto/create-invitations.dto';

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class InvitationsController {
  constructor(private readonly invitationsService: InvitationsService) {}

  @Post('exams/:examId/invitations')
  @RequirePermissions('candidate:manage')
  bulkInvite(@CurrentTenant() tenant: TenantContext, @Param('examId') examId: string, @Body() dto: CreateInvitationsDto) {
    return this.invitationsService.bulkInvite(tenant, examId, dto.candidateIds);
  }

  @Get('exams/:examId/invitations')
  @RequirePermissions('candidate:manage')
  list(@CurrentTenant() tenant: TenantContext, @Param('examId') examId: string) {
    return this.invitationsService.list(tenant, examId);
  }

  @Post('invitations/:id/resend')
  @RequirePermissions('candidate:manage')
  resend(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.invitationsService.resend(tenant, id);
  }

  @Post('invitations/:id/revoke')
  @RequirePermissions('candidate:manage')
  revoke(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.invitationsService.revoke(tenant, id);
  }
}
```

Note: no controller-level `@Controller('...')` prefix — each route declares its own full path, since this controller straddles two URL namespaces (`exams/:examId/invitations` and `invitations/:id/...`), unlike every prior controller in this project which owns a single resource prefix.

- [ ] **Step 3: Write the module**

`apps/api/src/invitations/invitations.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { EmailModule } from '../email/email.module';
import { InvitationsController } from './invitations.controller';
import { InvitationsService } from './invitations.service';

@Module({
  imports: [EmailModule],
  controllers: [InvitationsController],
  providers: [InvitationsService],
  exports: [InvitationsService],
})
export class InvitationsModule {}
```

- [ ] **Step 4: Register the module in AppModule**

In `apps/api/src/app.module.ts`, add `InvitationsModule` to the imports:
```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { RbacModule } from './rbac/rbac.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { UsersModule } from './users/users.module';
import { QuestionsModule } from './questions/questions.module';
import { ExamsModule } from './exams/exams.module';
import { CandidatesModule } from './candidates/candidates.module';
import { InvitationsModule } from './invitations/invitations.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    RbacModule,
    AuditModule,
    AuthModule,
    OrganizationsModule,
    UsersModule,
    QuestionsModule,
    ExamsModule,
    CandidatesModule,
    InvitationsModule,
  ],
})
export class AppModule {}
```

- [ ] **Step 5: Run the full unit suite and build check**

Run: `npm run test:api` (from repo root) — expect all suites passing, no regressions.
Run: `npx nest build` (from `apps/api/`) — expect a clean build with `InvitationsModule` wired in.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/invitations apps/api/src/app.module.ts
git commit -m "feat: add InvitationsController with RBAC, wire into AppModule"
```

---

### Task 10: End-to-end test and manual Ethereal verification

**Files:**
- Modify: `apps/api/test/candidates-invitations.e2e-spec.ts` (Task 2 already created this file with the isolation-only tests; this task completes it with the full HTTP flow)
- Create: `apps/api/scripts/verify-email-manual.ts`

**Interfaces:**
- Consumes: the full `CandidatesController`/`InvitationsController`/`ExamsController.publish` HTTP surface (Tasks 6/7/9), the real `AuthService` login flow (Phase 0), `EmailService` (Task 3, overridden with a test double for the automated run).

- [ ] **Step 1: Replace the e2e spec file with the complete test**

`apps/api/test/candidates-invitations.e2e-spec.ts` (full replacement — includes the Task 2 isolation tests plus the new HTTP flow tests):
```typescript
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantPrismaService } from '../src/prisma/tenant-prisma.service';
import { EmailService } from '../src/email/email.service';

describe('Candidates Row-Level Security', () => {
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let planId: string;
  let orgAId: string;
  let orgBId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [PrismaModule] }).compile();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);

    const plan = await prisma.plan.create({
      data: { name: `ci-rls-plan-${randomUUID()}`, candidateLimit: 10, aiCreditLimit: 1, proctoringMinutesLimit: 1 },
    });
    planId = plan.id;

    const orgA = await prisma.organization.create({ data: { name: 'CI Org A', slug: `ci-org-a-${randomUUID()}`, planId } });
    const orgB = await prisma.organization.create({ data: { name: 'CI Org B', slug: `ci-org-b-${randomUUID()}`, planId } });
    orgAId = orgA.id;
    orgBId = orgB.id;

    await tenantPrisma.forTenant({ organizationId: orgAId, isSuperAdmin: false }, (tx) =>
      tx.candidate.create({ data: { organizationId: orgAId, email: 'candidate@org-a.test', name: 'Org A Candidate' } }),
    );
  });

  afterAll(async () => {
    await tenantPrisma.forTenant({ organizationId: orgAId, isSuperAdmin: false }, (tx) =>
      tx.candidate.deleteMany({ where: { organizationId: orgAId } }),
    );
    await prisma.organization.deleteMany({ where: { id: { in: [orgAId, orgBId] } } });
    await prisma.plan.delete({ where: { id: planId } });
    await prisma.$disconnect();
  });

  it("never returns another tenant's candidates", async () => {
    const orgBCandidates = await tenantPrisma.forTenant({ organizationId: orgBId, isSuperAdmin: false }, (tx) =>
      tx.candidate.findMany(),
    );
    expect(orgBCandidates).toHaveLength(0);
  });

  it('returns zero rows when no tenant context has been set', async () => {
    const rows = await prisma.candidate.findMany({ where: { organizationId: orgAId } });
    expect(rows).toHaveLength(0);
  });
});

describe('Candidates & Invitations HTTP flow', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let planId: string;
  let orgId: string;
  let recruiterAccessToken: string;
  let orgAdminAccessToken: string;
  let examId: string;
  const fakeEmailService = {
    send: jest.fn().mockResolvedValue({ success: true, previewUrl: 'https://ethereal.email/fake' }),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EmailService)
      .useValue(fakeEmailService)
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);

    const plan = await prisma.plan.create({
      data: { name: `ci-http-plan-${randomUUID()}`, candidateLimit: 10, aiCreditLimit: 1, proctoringMinutesLimit: 1 },
    });
    planId = plan.id;

    const org = await prisma.organization.create({ data: { name: 'CI HTTP Org', slug: `ci-http-org-${randomUUID()}`, planId } });
    orgId = org.id;

    const recruiterHash = await argon2.hash('RecruiterPassw0rd!');
    const orgAdminHash = await argon2.hash('OrgAdminPassw0rd!');
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) =>
      Promise.all([
        tx.user.create({ data: { organizationId: orgId, email: 'recruiter@ci-http.test', passwordHash: recruiterHash, role: 'recruiter' } }),
        tx.user.create({ data: { organizationId: orgId, email: 'orgadmin@ci-http.test', passwordHash: orgAdminHash, role: 'org_admin' } }),
      ]),
    );

    const recruiterLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/staff/login')
      .send({ organizationSlug: org.slug, email: 'recruiter@ci-http.test', password: 'RecruiterPassw0rd!' })
      .expect(200);
    recruiterAccessToken = recruiterLogin.body.accessToken;

    const orgAdminLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/staff/login')
      .send({ organizationSlug: org.slug, email: 'orgadmin@ci-http.test', password: 'OrgAdminPassw0rd!' })
      .expect(200);
    orgAdminAccessToken = orgAdminLogin.body.accessToken;
  });

  afterAll(async () => {
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) =>
      tx.exam.deleteMany({ where: { organizationId: orgId } }),
    );
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) =>
      tx.question.deleteMany({ where: { organizationId: orgId } }),
    );
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) =>
      tx.candidate.deleteMany({ where: { organizationId: orgId } }),
    );
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: true }, (tx) =>
      tx.refreshToken.deleteMany({ where: { user: { organizationId: orgId } } }),
    );
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) =>
      tx.user.deleteMany({ where: { organizationId: orgId } }),
    );
    await prisma.organization.delete({ where: { id: orgId } }).catch(() => undefined);
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('rejects a non-permitted role from creating a candidate', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/candidates')
      .set('Authorization', `Bearer ${orgAdminAccessToken}`)
      .send({ email: 'blocked@test.com', name: 'Blocked' })
      .expect(403);
  });

  it('adds candidates manually and via CSV bulk upload, then rejects publishing an empty exam', async () => {
    const aliceResponse = await request(app.getHttpServer())
      .post('/api/v1/candidates')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ email: 'alice@ci-http.test', name: 'Alice' })
      .expect(201);
    const aliceId = aliceResponse.body.id;

    await request(app.getHttpServer())
      .post('/api/v1/candidates')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ email: 'bob@ci-http.test', name: 'Bob' })
      .expect(201);

    const csvContent = [
      'email,name,phone',
      'not-an-email,Bad Row,',
      `alice@ci-http.test,Alice Updated,555-0001`,
      'carol@ci-http.test,Carol,',
      'dave@ci-http.test,Dave,',
      'erin@ci-http.test,Erin,',
    ].join('\n');

    const bulkResponse = await request(app.getHttpServer())
      .post('/api/v1/candidates/bulk')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ csvContent })
      .expect(201);
    expect(bulkResponse.body.created).toBe(3);
    expect(bulkResponse.body.updated).toBe(1);
    expect(bulkResponse.body.errors).toEqual([{ row: 1, reason: 'Invalid or missing email: "not-an-email"' }]);

    const listResponse = await request(app.getHttpServer())
      .get('/api/v1/candidates')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(200);
    expect(listResponse.body).toHaveLength(5);
    const updatedAlice = listResponse.body.find((c: { id: string }) => c.id === aliceId);
    expect(updatedAlice.name).toBe('Alice Updated');

    const examResponse = await request(app.getHttpServer())
      .post('/api/v1/exams')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ title: 'Backend Round' })
      .expect(201);
    examId = examResponse.body.id;
    expect(examResponse.body.status).toBe('draft');

    await request(app.getHttpServer())
      .post(`/api/v1/exams/${examId}/publish`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(400);
  });

  it('publishes an exam once it has content, then runs the full invitation lifecycle', async () => {
    const sectionResponse = await request(app.getHttpServer())
      .post(`/api/v1/exams/${examId}/sections`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ title: 'Section One' })
      .expect(201);
    const sectionId = sectionResponse.body.id;

    const questionResponse = await request(app.getHttpServer())
      .post('/api/v1/questions')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({
        type: 'true_false',
        text: 'Is this a test question?',
        difficulty: 'easy',
        marks: 1,
        options: [
          { text: 'True', isCorrect: true },
          { text: 'False', isCorrect: false },
        ],
      })
      .expect(201);
    const questionId = questionResponse.body.id;

    await request(app.getHttpServer())
      .put(`/api/v1/exams/${examId}/sections/${sectionId}/questions`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ questionIds: [questionId] })
      .expect(200);

    const publishResponse = await request(app.getHttpServer())
      .post(`/api/v1/exams/${examId}/publish`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(201);
    expect(publishResponse.body.status).toBe('published');

    const candidatesResponse = await request(app.getHttpServer())
      .get('/api/v1/candidates')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(200);
    const candidateIds = candidatesResponse.body.map((c: { id: string }) => c.id);
    expect(candidateIds).toHaveLength(5);

    const inviteResponse = await request(app.getHttpServer())
      .post(`/api/v1/exams/${examId}/invitations`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ candidateIds })
      .expect(201);
    expect(inviteResponse.body.created).toHaveLength(5);
    expect(inviteResponse.body.skipped).toHaveLength(0);
    expect(fakeEmailService.send).toHaveBeenCalledTimes(5);

    const reinviteResponse = await request(app.getHttpServer())
      .post(`/api/v1/exams/${examId}/invitations`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ candidateIds })
      .expect(201);
    expect(reinviteResponse.body.created).toHaveLength(0);
    expect(reinviteResponse.body.skipped).toHaveLength(5);

    const listInvitationsResponse = await request(app.getHttpServer())
      .get(`/api/v1/exams/${examId}/invitations`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(200);
    expect(listInvitationsResponse.body).toHaveLength(5);
    const firstInvitation = listInvitationsResponse.body[0];
    const originalToken = firstInvitation.token;

    const resendResponse = await request(app.getHttpServer())
      .post(`/api/v1/invitations/${firstInvitation.id}/resend`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(201);
    expect(resendResponse.body.token).not.toBe(originalToken);

    const secondInvitation = listInvitationsResponse.body[1];
    const revokeResponse = await request(app.getHttpServer())
      .post(`/api/v1/invitations/${secondInvitation.id}/revoke`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(201);
    expect(revokeResponse.body.status).toBe('revoked');

    await request(app.getHttpServer())
      .post(`/api/v1/exams/${examId}/invitations`)
      .set('Authorization', `Bearer ${orgAdminAccessToken}`)
      .send({ candidateIds: [candidateIds[0]] })
      .expect(403);
  });
});
```

- [ ] **Step 2: Run the full e2e suite**

Run: `npm run test:api:e2e` (from repo root)
Expected: all suites pass, including both `describe` blocks in `candidates-invitations.e2e-spec.ts` (2 RLS tests + 3 HTTP flow tests = 5 tests in this file), with no regressions to `tenant-isolation.e2e-spec.ts`, `health.e2e-spec.ts`, `auth-flow.e2e-spec.ts`, `question-bank.e2e-spec.ts`, or `exam-builder.e2e-spec.ts`.

- [ ] **Step 3: Run the full unit suite one more time**

Run: `npm run test:api` (from repo root)
Expected: all suites still passing.

- [ ] **Step 4: Write and run the one-off manual Ethereal verification script**

This confirms real SMTP delivery actually works end-to-end — deliberately kept out of the automated suite (Task 3's tests mock `nodemailer`; Task 10's e2e tests override `EmailService` entirely) since real network sends would make `npm run test:api:e2e` flaky.

`apps/api/scripts/verify-email-manual.ts`:
```typescript
import { EmailService } from '../src/email/email.service';

async function main() {
  const emailService = new EmailService();
  const result = await emailService.send({
    to: 'test-recipient@example.com',
    subject: 'Phase 1c manual verification',
    html: '<p>If you can see this in the Ethereal inbox, real SMTP delivery works.</p>',
  });
  console.log(result);
}

main();
```

Run (from `apps/api/`): `npx ts-node scripts/verify-email-manual.ts`
Expected: console prints `{ success: true, previewUrl: 'https://ethereal.email/message/...' }`. Open the printed `previewUrl` in a browser — expect to see the actual rendered email ("Phase 1c manual verification"), confirming a real SMTP send happened, not just a mocked one.

- [ ] **Step 5: Commit**

```bash
git add apps/api/test/candidates-invitations.e2e-spec.ts apps/api/scripts/verify-email-manual.ts
git commit -m "test: add full candidates & invitations e2e coverage - CSV upload, publish gate, invitation lifecycle, tenant isolation, RBAC denial"
```

---

## Self-Review Notes

- **Spec coverage:** candidate CRUD + CSV bulk upsert (Tasks 4-6), exam publish gate (Task 7), invitation bulk-create/list/resend/revoke (Tasks 8-9), real SMTP email via Nodemailer/Ethereal (Task 3), Notification send-audit trail (Task 8), RLS on `candidates` only with `invitations`/`notifications` protected transitively (Tasks 1-2), `candidate:manage` permission reused across both new controllers (Tasks 6, 9) — all covered. Deferred items (candidate login, groups, real provider, multipart upload, frontend) are explicitly out of scope per the design spec and not included here.
- **Placeholder scan:** no TBD/TODO markers; every step has complete, runnable code.
- **Type consistency:** `EmailService.send`'s `SendEmailInput`/`SendEmailResult` (Task 3) match every call site in `InvitationsService` (Task 8) and the e2e test double (Task 10). `parseCandidateCsv`'s `CandidateCsvRow`/`CandidateCsvError` (Task 4) match `CandidatesService.bulkUpload`'s usage (Task 5) and `BulkUploadResult`'s `errors` field. `InvitationsService`'s method names (`bulkInvite`, `list`, `resend`, `revoke`) match `InvitationsController`'s calls (Task 9) exactly.
- **Cross-task fix flagged explicitly:** Task 7 corrects `ExamsService.list()`'s default status filter (previously `'active'`, now meaningless) as part of introducing the draft/published/archived model — called out as a required fix, not silently bundled in.
