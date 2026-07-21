# Walk-In Candidate Registration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a recruiter open one or more published exams for same-day, on-site self-registration — a candidate fills a short public form (name, email, phone), picks an exam if more than one is open, and lands directly in the existing consent/exam-start flow with no email round-trip.

**Architecture:** A new `walk_in_enabled` boolean on `Exam` (recruiter-controlled, same shape as the existing `scheduling_enabled` toggle) gates a new public, unauthenticated `WalkInModule` in `apps/api` (`GET /public/walk-in/:orgSlug/exams`, `POST /public/walk-in/:orgSlug/register`). Registration upserts a `Candidate` and creates-or-reuses an `Invitation` (tagged `source: 'walk_in'`), then returns the invitation token. The candidate-facing frontend page collects the form, then hands the returned token to the **existing, unmodified** `/start?token=...` page — redemption, session-kick-on-resume, and the `/welcome` → consent → attempt flow are all reused as-is.

**Tech Stack:** NestJS + Prisma + SQL Server (`apps/api`), Next.js + React Query (`apps/web`), Jest (unit tests, both apps), Playwright (e2e).

## Global Constraints

- Walk-in registration never sends an invitation email — unlike `InvitationsService.bulkInvite`, it must not call `dispatchInvitationEmail`.
- Only exams with `status === 'published' && walkInEnabled === true` are reachable through the public endpoints — this is the sole gate preventing a stranger from starting an arbitrary exam.
- Duplicate submissions (same email + exam) must resume the existing live invitation rather than create a second one, mirroring `InvitationsService.bulkInvite`'s live-invitation dedup check.
- Field validation is format-only (valid email, non-empty name, optional phone format) — no identity verification (OTP, ID upload, etc.) is in scope.
- The candidate-facing walk-in page must redirect into the **existing, unmodified** `/start?token=...` page rather than duplicating token redemption/session-issuance logic.
- IP restriction and screen-share/third-party-tool detection are explicitly out of scope for this plan (separate future specs).

---

### Task 1: Schema — `Exam.walkInEnabled` + `Invitation.source`

**Files:**
- Modify: `apps/api/prisma/schema.prisma:243-263` (Exam model), `apps/api/prisma/schema.prisma:317-336` (Invitation model)
- Create: `apps/api/prisma/migrations/20260722100000_walk_in_registration/migration.sql`

**Interfaces:**
- Produces: `Exam.walkInEnabled: boolean` and `Invitation.source: string` on the generated Prisma Client, consumed by every later task.

- [ ] **Step 1: Add the two fields to the schema**

In `apps/api/prisma/schema.prisma`, in the `Exam` model, add `walkInEnabled` right after `availabilityWindowEnd` (line 255) and before `createdBy`:

```prisma
model Exam {
  id                      String        @id @default(uuid()) @db.UniqueIdentifier
  organizationId          String        @map("organization_id") @db.UniqueIdentifier
  title                   String
  instructions            String?       @db.NVarChar(Max)
  status                  String        @default("draft")
  durationMinutes         Int           @default(60) @map("duration_minutes")
  passCriteriaPercent     Int           @default(40) @map("pass_criteria_percent")
  randomizeOrder          Boolean       @default(false) @map("randomize_order")
  feedbackVisibility      String        @default("pass_fail") @map("feedback_visibility")
  schedulingEnabled       Boolean       @default(false) @map("scheduling_enabled")
  availabilityWindowStart DateTime?     @map("availability_window_start")
  availabilityWindowEnd   DateTime?     @map("availability_window_end")
  walkInEnabled           Boolean       @default(false) @map("walk_in_enabled")
  createdBy               String        @map("created_by") @db.UniqueIdentifier
  createdAt               DateTime      @default(now()) @map("created_at")
  sections                ExamSection[]
  invitations             Invitation[]

  @@index([organizationId, status])
  @@map("exams")
}
```

In the `Invitation` model, add `source` right after `status` (line 322):

```prisma
model Invitation {
  id                     String                  @id @default(uuid()) @db.UniqueIdentifier
  examId                 String                  @map("exam_id") @db.UniqueIdentifier
  candidateId            String                  @map("candidate_id") @db.UniqueIdentifier
  token                  String                  @unique
  status                 String                  @default("invited")
  source                 String                  @default("invited") @map("source")
  extraTimePercent       Int                     @default(0) @map("extra_time_percent")
  invitedAt              DateTime                @default(now()) @map("invited_at")
  expiresAt              DateTime                @map("expires_at")
  revokedAt              DateTime?               @map("revoked_at")
  activeSessionFamilyId  String?                 @map("active_session_family_id")
  exam                   Exam                    @relation(fields: [examId], references: [id], onDelete: Cascade)
  candidate              Candidate               @relation(fields: [candidateId], references: [id], onDelete: Cascade)
  notifications          Notification[]
  attempt                Attempt?
  candidateRefreshTokens CandidateRefreshToken[]

  @@index([examId, status])
  @@map("invitations")
}
```

- [ ] **Step 2: Generate the migration SQL (create-only, no shadow DB touch)**

Run (from `apps/api/`): `npx prisma migrate dev --create-only --name walk_in_registration`

This creates `apps/api/prisma/migrations/20260722100000_walk_in_registration/migration.sql` (the exact timestamp prefix is generated by Prisma — rename the folder to `20260722100000_walk_in_registration` if Prisma picks a different timestamp, to keep migrations in chronological order after `20260719180000_saml_sso`).

- [ ] **Step 3: Verify/replace the generated SQL to match this project's exact style**

Open the generated `migration.sql` and replace its contents with:

```sql
ALTER TABLE [dbo].[exams] ADD [walk_in_enabled] BIT NOT NULL CONSTRAINT [exams_walk_in_enabled_df] DEFAULT 0;
ALTER TABLE [dbo].[invitations] ADD [source] NVARCHAR(1000) NOT NULL CONSTRAINT [invitations_source_df] DEFAULT 'invited';
```

(This matches the exact `ALTER TABLE ... ADD ... CONSTRAINT ... DEFAULT` style used by every prior migration in this repo, e.g. `20260719120000_candidate_ux_pack/migration.sql`.)

- [ ] **Step 4: Apply the migration and regenerate the Prisma Client**

Run (from `apps/api/`): `npx prisma migrate deploy`
Expected: `1 migration found... Applying migration 20260722100000_walk_in_registration... The following migration(s) have been applied: 20260722100000_walk_in_registration`

Then run: `npx prisma generate`
Expected: `Generated Prisma Client` with no errors — `walkInEnabled` and `source` are now typed on the `Exam`/`Invitation` Prisma models.

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260722100000_walk_in_registration
git commit -m "feat: add Exam.walkInEnabled and Invitation.source columns"
```

---

### Task 2: Backend — exam `walkInEnabled` toggle (recruiter-controlled)

**Files:**
- Modify: `apps/api/src/exams/dto/create-exam.dto.ts`
- Modify: `apps/api/src/exams/exams.service.ts:202-215` (the `update()` method's data object)
- Test: `apps/api/src/exams/exams.service.spec.ts`

**Interfaces:**
- Consumes: `Exam.walkInEnabled` from Task 1.
- Produces: `walkInEnabled?: boolean` on `CreateExamDto`/`UpdateExamDto` (the latter extends the former), consumed by Task 4's recruiter frontend form.

- [ ] **Step 1: Write the failing test**

Add to `apps/api/src/exams/exams.service.spec.ts` (near the existing "updates an exam's title and instructions" test):

```ts
  it('persists walkInEnabled when provided', async () => {
    const tx = {
      exam: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'exam-1',
          schedulingEnabled: false,
          availabilityWindowStart: null,
          availabilityWindowEnd: null,
          walkInEnabled: false,
        }),
        update: jest.fn().mockResolvedValue({ id: 'exam-1', walkInEnabled: true, schedulingEnabled: false }),
      },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await service.update(context, 'exam-1', { title: 'Exam', walkInEnabled: true });

    expect(tx.exam.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ walkInEnabled: true }) }),
    );
  });

  it('leaves walkInEnabled untouched when omitted from the update', async () => {
    const tx = {
      exam: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'exam-1',
          schedulingEnabled: false,
          availabilityWindowStart: null,
          availabilityWindowEnd: null,
          walkInEnabled: true,
        }),
        update: jest.fn().mockResolvedValue({ id: 'exam-1', walkInEnabled: true, schedulingEnabled: false }),
      },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await service.update(context, 'exam-1', { title: 'Exam' });

    expect(tx.exam.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.not.objectContaining({ walkInEnabled: expect.anything() }) }),
    );
  });
```

- [ ] **Step 2: Run tests to verify the first one fails**

Run: `cd apps/api && npx jest exams.service.spec.ts -t "walkInEnabled"`
Expected: FAIL — `CreateExamDto` has no `walkInEnabled` property, and `update()` never writes it, so the mock's `update` call won't include it.

- [ ] **Step 3: Add `walkInEnabled` to the DTO**

In `apps/api/src/exams/dto/create-exam.dto.ts`, add after the `schedulingEnabled` field:

```ts
import { IsBoolean, IsIn, IsInt, IsISO8601, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';

const FEEDBACK_VISIBILITY_VALUES = ['none', 'pass_fail', 'score', 'breakdown'] as const;

export class CreateExamDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsOptional()
  @IsString()
  instructions?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  durationMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  passCriteriaPercent?: number;

  @IsOptional()
  @IsBoolean()
  randomizeOrder?: boolean;

  @IsOptional()
  @IsIn(FEEDBACK_VISIBILITY_VALUES)
  feedbackVisibility?: string;

  @IsOptional()
  @IsBoolean()
  schedulingEnabled?: boolean;

  @IsOptional()
  @IsISO8601()
  availabilityWindowStart?: string;

  @IsOptional()
  @IsISO8601()
  availabilityWindowEnd?: string;

  @IsOptional()
  @IsBoolean()
  walkInEnabled?: boolean;
}
```

- [ ] **Step 4: Wire it into `update()`**

In `apps/api/src/exams/exams.service.ts`, inside the `update()` method's `tx.exam.update({ ... data: { ... } })` call (lines 202-215), add one line after the `feedbackVisibility` conditional and before `schedulingEnabled`:

```ts
      const updated = await tx.exam.update({
        where: { id },
        data: {
          title: dto.title,
          instructions: dto.instructions,
          ...(dto.durationMinutes !== undefined ? { durationMinutes: dto.durationMinutes } : {}),
          ...(dto.passCriteriaPercent !== undefined ? { passCriteriaPercent: dto.passCriteriaPercent } : {}),
          ...(dto.randomizeOrder !== undefined ? { randomizeOrder: dto.randomizeOrder } : {}),
          ...(dto.feedbackVisibility !== undefined ? { feedbackVisibility: dto.feedbackVisibility } : {}),
          ...(dto.walkInEnabled !== undefined ? { walkInEnabled: dto.walkInEnabled } : {}),
          schedulingEnabled: scheduling.schedulingEnabled,
          availabilityWindowStart: scheduling.availabilityWindowStart,
          availabilityWindowEnd: scheduling.availabilityWindowEnd,
        },
      });
```

Note: `UpdateExamDto extends CreateExamDto` (see `apps/api/src/exams/dto/update-exam.dto.ts`), so no change is needed there — it inherits `walkInEnabled` automatically. `CreateExamDto` also backs `POST /exams`, so a recruiter can set `walkInEnabled` at creation time too, though the UI (Task 4) only exposes it on the edit form, matching how `schedulingEnabled` is handled today.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/api && npx jest exams.service.spec.ts -t "walkInEnabled"`
Expected: `PASS` — 2 passed, 2 total.

Run the full file to confirm no regression: `cd apps/api && npx jest exams.service.spec.ts`
Expected: all existing tests still pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/exams/dto/create-exam.dto.ts apps/api/src/exams/exams.service.ts apps/api/src/exams/exams.service.spec.ts
git commit -m "feat: let recruiters toggle walk-in registration on an exam"
```

---

### Task 3: Backend — walk-in registration module

**Files:**
- Modify: `apps/api/src/rate-limit-tiers.ts`
- Modify: `apps/api/src/app.module.ts`
- Create: `apps/api/src/walk-in/dto/register-walk-in.dto.ts`
- Create: `apps/api/src/walk-in/walk-in.service.ts`
- Create: `apps/api/src/walk-in/walk-in.controller.ts`
- Create: `apps/api/src/walk-in/walk-in.module.ts`
- Test: `apps/api/src/walk-in/walk-in.service.spec.ts`

**Interfaces:**
- Consumes: `Exam.walkInEnabled` and `Invitation.source` (Task 1); `generateToken()` and `resolveInvitationExpiry()` from `apps/api/src/invitations/invitations.service.ts:19-34` (both are module-level functions in that file — add `export` to each so this task can import them without duplicating token/expiry logic).
- Produces: `GET /public/walk-in/:orgSlug/exams` → `{ id: string; title: string; durationMinutes: number }[]`; `POST /public/walk-in/:orgSlug/register` → `{ token: string }`. Consumed by Task 5's frontend hooks.

- [ ] **Step 1: Export the two helpers `WalkInService` needs**

In `apps/api/src/invitations/invitations.service.ts`, add `export` to both function declarations (lines 19 and 29) — no other change to this file:

```ts
export function generateToken(): string {
  return randomBytes(32).toString('hex');
}
```

```ts
export function resolveInvitationExpiry(exam: { schedulingEnabled: boolean; availabilityWindowEnd: Date | null }): Date {
  if (exam.schedulingEnabled && exam.availabilityWindowEnd) {
    return exam.availabilityWindowEnd;
  }
  return addDays(new Date(), INVITATION_EXPIRY_DAYS);
}
```

- [ ] **Step 2: Add a rate-limit tier for the public endpoints**

In `apps/api/src/rate-limit-tiers.ts`, add after `PUBLIC_API_THROTTLE`:

```ts
export const STRICT_WALK_IN_THROTTLE = { default: { limit: isTest ? 10_000 : 20, ttl: seconds(60) } };
```

- [ ] **Step 3: Write the failing service test**

Create `apps/api/src/walk-in/walk-in.service.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { WalkInService } from './walk-in.service';
import { PrismaService, TenantPrismaService, AuditService } from '@exam-platform/shared';
import { WebhooksService } from '../webhooks/webhooks.service';

describe('WalkInService', () => {
  let service: WalkInService;
  let prisma: { organization: { findUnique: jest.Mock } };
  let tenantPrisma: { forTenant: jest.Mock };
  let audit: { record: jest.Mock };
  let webhooksService: { enqueue: jest.Mock };

  beforeEach(async () => {
    prisma = { organization: { findUnique: jest.fn() } };
    tenantPrisma = { forTenant: jest.fn() };
    audit = { record: jest.fn() };
    webhooksService = { enqueue: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        WalkInService,
        { provide: PrismaService, useValue: prisma },
        { provide: TenantPrismaService, useValue: tenantPrisma },
        { provide: AuditService, useValue: audit },
        { provide: WebhooksService, useValue: webhooksService },
      ],
    }).compile();
    service = moduleRef.get(WalkInService);
  });

  describe('listExams', () => {
    it('throws NotFoundException for an unknown org slug', async () => {
      prisma.organization.findUnique.mockResolvedValue(null);
      await expect(service.listExams('nope')).rejects.toThrow(NotFoundException);
    });

    it('returns only published, walk-in-enabled exams for the org', async () => {
      prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', slug: 'demo-org' });
      const tx = {
        exam: { findMany: jest.fn().mockResolvedValue([{ id: 'exam-1', title: 'Backend Round', durationMinutes: 60 }]) },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.listExams('demo-org');

      expect(tx.exam.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: 'org-1', status: 'published', walkInEnabled: true } }),
      );
      expect(result).toEqual([{ id: 'exam-1', title: 'Backend Round', durationMinutes: 60 }]);
    });
  });

  describe('register', () => {
    const dto = { examId: 'exam-1', name: 'Alice', email: 'alice@test.com' };

    it('throws NotFoundException for an unknown org slug', async () => {
      prisma.organization.findUnique.mockResolvedValue(null);
      await expect(service.register('nope', dto)).rejects.toThrow(NotFoundException);
    });

    it('rejects when the exam is not walk-in-enabled', async () => {
      prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', slug: 'demo-org' });
      const tx = {
        exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1', status: 'published', walkInEnabled: false }) },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.register('demo-org', dto)).rejects.toThrow(BadRequestException);
    });

    it('creates a new candidate and invitation for a first-time registrant', async () => {
      prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', slug: 'demo-org' });
      const tx = {
        exam: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'exam-1', status: 'published', walkInEnabled: true, schedulingEnabled: false, availabilityWindowEnd: null,
          }),
        },
        candidate: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({ id: 'cand-1', email: 'alice@test.com' }),
        },
        invitation: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({ id: 'inv-1', examId: 'exam-1', candidateId: 'cand-1', status: 'invited', token: 'raw-token' }),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.register('demo-org', dto);

      expect(tx.candidate.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ organizationId: 'org-1', email: 'alice@test.com', name: 'Alice' }) }),
      );
      expect(tx.invitation.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ examId: 'exam-1', candidateId: 'cand-1', source: 'walk_in' }) }),
      );
      expect(result).toEqual({ token: 'raw-token' });
      expect(webhooksService.enqueue).toHaveBeenCalledWith('org-1', 'invitation.created', expect.objectContaining({ id: 'inv-1' }));
    });

    it('reuses the existing candidate and a live invitation instead of creating a duplicate', async () => {
      prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', slug: 'demo-org' });
      const tx = {
        exam: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'exam-1', status: 'published', walkInEnabled: true, schedulingEnabled: false, availabilityWindowEnd: null,
          }),
        },
        candidate: {
          findFirst: jest.fn().mockResolvedValue({ id: 'cand-1', email: 'alice@test.com' }),
          update: jest.fn().mockResolvedValue({ id: 'cand-1', email: 'alice@test.com' }),
        },
        invitation: {
          findFirst: jest.fn().mockResolvedValue({ id: 'inv-1', examId: 'exam-1', candidateId: 'cand-1', status: 'invited', token: 'existing-token' }),
          create: jest.fn(),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.register('demo-org', dto);

      expect(tx.invitation.create).not.toHaveBeenCalled();
      expect(tx.candidate.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'cand-1' } }),
      );
      expect(result).toEqual({ token: 'existing-token' });
    });

    it('issues a new token for an existing candidate whose prior invitation has expired', async () => {
      // The live-invitation query filters on `expiresAt: { gt: now }`, so an expired invitation
      // never matches it -- findFirst resolving null here is exactly what "expired" looks like
      // from this service's point of view, same as "never invited to this exam before".
      prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', slug: 'demo-org' });
      const tx = {
        exam: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'exam-1', status: 'published', walkInEnabled: true, schedulingEnabled: false, availabilityWindowEnd: null,
          }),
        },
        candidate: {
          findFirst: jest.fn().mockResolvedValue({ id: 'cand-1', email: 'alice@test.com' }),
          update: jest.fn().mockResolvedValue({ id: 'cand-1', email: 'alice@test.com' }),
        },
        invitation: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({ id: 'inv-2', examId: 'exam-1', candidateId: 'cand-1', status: 'invited', token: 'fresh-token' }),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.register('demo-org', dto);

      expect(tx.invitation.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ candidateId: 'cand-1', source: 'walk_in' }) }),
      );
      expect(result).toEqual({ token: 'fresh-token' });
    });
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `cd apps/api && npx jest walk-in.service.spec.ts`
Expected: FAIL with "Cannot find module './walk-in.service'".

- [ ] **Step 5: Create the DTO**

Create `apps/api/src/walk-in/dto/register-walk-in.dto.ts`:

```ts
import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class RegisterWalkInDto {
  @IsString()
  @IsNotEmpty()
  examId!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  phone?: string;
}
```

- [ ] **Step 6: Create the service**

Create `apps/api/src/walk-in/walk-in.service.ts`:

```ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService, TenantPrismaService, AuditService } from '@exam-platform/shared';
import { WebhooksService } from '../webhooks/webhooks.service';
import { generateToken, resolveInvitationExpiry } from '../invitations/invitations.service';
import { RegisterWalkInDto } from './dto/register-walk-in.dto';

export interface WalkInExamOption {
  id: string;
  title: string;
  durationMinutes: number;
}

@Injectable()
export class WalkInService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly audit: AuditService,
    private readonly webhooks: WebhooksService,
  ) {}

  private async resolveOrg(orgSlug: string): Promise<{ id: string }> {
    const org = await this.prisma.organization.findUnique({ where: { slug: orgSlug } });
    if (!org) {
      throw new NotFoundException(`Organization "${orgSlug}" not found`);
    }
    return org;
  }

  async listExams(orgSlug: string): Promise<WalkInExamOption[]> {
    const org = await this.resolveOrg(orgSlug);
    const context = { organizationId: org.id, isSuperAdmin: true };
    return this.tenantPrisma.forTenant(context, (tx) =>
      tx.exam.findMany({
        where: { organizationId: org.id, status: 'published', walkInEnabled: true },
        select: { id: true, title: true, durationMinutes: true },
        orderBy: { title: 'asc' },
      }),
    );
  }

  async register(orgSlug: string, dto: RegisterWalkInDto): Promise<{ token: string }> {
    const org = await this.resolveOrg(orgSlug);
    const context = { organizationId: org.id, isSuperAdmin: true };

    const invitation = await this.tenantPrisma.forTenant(context, async (tx) => {
      const exam = await tx.exam.findFirst({ where: { id: dto.examId, organizationId: org.id } });
      if (!exam || exam.status !== 'published' || !exam.walkInEnabled) {
        throw new BadRequestException('This exam is not currently open for walk-in registration');
      }

      const existingCandidate = await tx.candidate.findFirst({ where: { organizationId: org.id, email: dto.email } });
      const candidate = existingCandidate
        ? await tx.candidate.update({ where: { id: existingCandidate.id }, data: { name: dto.name, phone: dto.phone } })
        : await tx.candidate.create({
            data: { organizationId: org.id, email: dto.email, name: dto.name, phone: dto.phone },
          });

      const liveInvitation = await tx.invitation.findFirst({
        where: { examId: exam.id, candidateId: candidate.id, status: 'invited', expiresAt: { gt: new Date() } },
      });
      if (liveInvitation) {
        return liveInvitation;
      }
      return tx.invitation.create({
        data: {
          examId: exam.id,
          candidateId: candidate.id,
          token: generateToken(),
          expiresAt: resolveInvitationExpiry(exam),
          source: 'walk_in',
        },
      });
    });

    await this.audit.record(context, {
      actorUserId: null,
      action: 'invitation.created',
      entityType: 'invitation',
      metadata: { count: 1, source: 'walk_in' },
    });
    await this.webhooks.enqueue(org.id, 'invitation.created', {
      id: invitation.id,
      examId: invitation.examId,
      candidateId: invitation.candidateId,
      status: invitation.status,
    });

    return { token: invitation.token };
  }
}
```

- [ ] **Step 7: Create the controller**

Create `apps/api/src/walk-in/walk-in.controller.ts`:

```ts
import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { WalkInService } from './walk-in.service';
import { RegisterWalkInDto } from './dto/register-walk-in.dto';
import { STRICT_WALK_IN_THROTTLE } from '../rate-limit-tiers';

@Controller('public/walk-in')
export class WalkInController {
  constructor(private readonly walkInService: WalkInService) {}

  @Get(':orgSlug/exams')
  @Throttle(STRICT_WALK_IN_THROTTLE)
  listExams(@Param('orgSlug') orgSlug: string) {
    return this.walkInService.listExams(orgSlug);
  }

  @Post(':orgSlug/register')
  @Throttle(STRICT_WALK_IN_THROTTLE)
  register(@Param('orgSlug') orgSlug: string, @Body() dto: RegisterWalkInDto) {
    return this.walkInService.register(orgSlug, dto);
  }
}
```

Note: no `@UseGuards(...)` on this controller — matching `OrganizationsPublicController`'s and `SamlController`'s existing pattern, the absence of a guard is what makes this route public.

- [ ] **Step 8: Create the module and register it**

Create `apps/api/src/walk-in/walk-in.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { WalkInController } from './walk-in.controller';
import { WalkInService } from './walk-in.service';

@Module({
  imports: [WebhooksModule],
  controllers: [WalkInController],
  providers: [WalkInService],
})
export class WalkInModule {}
```

In `apps/api/src/app.module.ts`, add the import and register it in the `imports` array (after `InvitationsModule`):

```ts
import { InvitationsModule } from './invitations/invitations.module';
import { WalkInModule } from './walk-in/walk-in.module';
```

```ts
    InvitationsModule,
    WalkInModule,
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `cd apps/api && npx jest walk-in.service.spec.ts`
Expected: `PASS` — 7 passed, 7 total.

Run the full apps/api unit suite to confirm no regressions: `cd apps/api && npx jest`
Expected: all suites pass.

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/invitations/invitations.service.ts apps/api/src/rate-limit-tiers.ts apps/api/src/app.module.ts apps/api/src/walk-in
git commit -m "feat: add public walk-in candidate registration endpoints"
```

---

### Task 4: Frontend — recruiter walk-in toggle + exam list badge

**Files:**
- Modify: `apps/web/lib/types.ts` (add `walkInEnabled` to `Exam`)
- Modify: `apps/web/lib/hooks/useExams.ts` (add `walkInEnabled` to `CreateExamInput`)
- Modify: `apps/web/components/ExamDetailsForm.tsx`
- Modify: `apps/web/components/ExamDetailsForm.test.tsx`
- Modify: `apps/web/app/(recruiter)/exams/page.tsx` (Walk-in badge)

**Interfaces:**
- Consumes: `walkInEnabled?: boolean` on the exam update payload (Task 2).
- Produces: recruiter can set `Exam.walkInEnabled` via the exam edit form; the exams list surfaces it as a badge — consumed visually by recruiters, not by later tasks' code.

- [ ] **Step 1: Add `walkInEnabled` to the shared `Exam` type**

In `apps/web/lib/types.ts`, add the field to the `Exam` interface right after `schedulingEnabled`:

```ts
export interface Exam {
  id: string;
  title: string;
  instructions: string | null;
  status: ExamStatus;
  durationMinutes: number;
  passCriteriaPercent: number;
  randomizeOrder: boolean;
  feedbackVisibility: FeedbackVisibility;
  schedulingEnabled: boolean;
  availabilityWindowStart: string | null;
  availabilityWindowEnd: string | null;
  walkInEnabled: boolean;
  createdAt: string;
  sections: ExamSection[];
}
```

Also add a new exported type for the public walk-in exam picker (used by Task 5), right after the `Organization` interface:

```ts
export interface WalkInExamOption {
  id: string;
  title: string;
  durationMinutes: number;
}
```

- [ ] **Step 2: Add `walkInEnabled` to `CreateExamInput`**

In `apps/web/lib/hooks/useExams.ts`, add the field to the `CreateExamInput` interface:

```ts
interface CreateExamInput {
  title: string;
  instructions?: string;
  durationMinutes?: number;
  passCriteriaPercent?: number;
  randomizeOrder?: boolean;
  schedulingEnabled?: boolean;
  availabilityWindowStart?: string;
  availabilityWindowEnd?: string;
  walkInEnabled?: boolean;
}
```

- [ ] **Step 3: Write the failing form test**

Add to `apps/web/components/ExamDetailsForm.test.tsx`:

```ts
  it('includes walkInEnabled in the submitted value, defaulting to false for a new exam', async () => {
    const onSubmit = jest.fn();
    render(<ExamDetailsForm onSubmit={onSubmit} submitLabel="Save details" />);

    await userEvent.type(screen.getByLabelText('Title'), 'New Exam');
    await userEvent.click(screen.getByRole('button', { name: 'Save details' }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ walkInEnabled: false }));
  });

  it('lets the recruiter enable walk-in registration', async () => {
    const onSubmit = jest.fn();
    render(<ExamDetailsForm onSubmit={onSubmit} submitLabel="Save details" />);

    await userEvent.type(screen.getByLabelText('Title'), 'New Exam');
    await userEvent.click(screen.getByLabelText('Enable walk-in registration for this exam'));
    await userEvent.click(screen.getByRole('button', { name: 'Save details' }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ walkInEnabled: true }));
  });
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `cd apps/web && npx jest ExamDetailsForm.test.tsx --verbose`
Expected: FAIL — `getByLabelText('Enable walk-in registration for this exam')` finds no element, and `walkInEnabled` is never in the submitted value.

- [ ] **Step 5: Add the checkbox and wire it into submit**

In `apps/web/components/ExamDetailsForm.tsx`, add `walkInEnabled` to the `ExamDetailsValue` interface:

```ts
export interface ExamDetailsValue {
  title: string;
  instructions?: string;
  durationMinutes: number;
  passCriteriaPercent: number;
  randomizeOrder: boolean;
  feedbackVisibility: FeedbackVisibility;
  schedulingEnabled: boolean;
  availabilityWindowStart?: string;
  availabilityWindowEnd?: string;
  walkInEnabled: boolean;
}
```

Add the state and include it in `onSubmit`'s payload:

```ts
  const [walkInEnabled, setWalkInEnabled] = useState(initialExam?.walkInEnabled ?? false);
```

```ts
    onSubmit({
      title,
      instructions: instructions || undefined,
      durationMinutes: Number(durationMinutes),
      passCriteriaPercent: Number(passCriteriaPercent),
      randomizeOrder,
      feedbackVisibility,
      schedulingEnabled,
      availabilityWindowStart: schedulingEnabled ? new Date(availabilityWindowStart).toISOString() : undefined,
      availabilityWindowEnd: schedulingEnabled ? new Date(availabilityWindowEnd).toISOString() : undefined,
      walkInEnabled,
    });
```

Add the checkbox in the JSX, right after the `schedulingEnabled` block and before the closing `<Button>`:

```tsx
      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" checked={walkInEnabled} onChange={(e) => setWalkInEnabled(e.target.checked)} />
        Enable walk-in registration for this exam
      </label>
      <Button type="submit">{submitLabel}</Button>
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd apps/web && npx jest ExamDetailsForm.test.tsx --verbose`
Expected: `PASS` — 10 passed, 10 total (8 pre-existing + 2 new).

- [ ] **Step 7: Add the "Walk-in" badge to the exams list**

In `apps/web/app/(recruiter)/exams/page.tsx`, in `renderCard`, add the badge next to the status badge (inside the same header `div`, lines 61-67):

```tsx
        <div className="mb-2 flex items-start justify-between gap-2">
          <div>
            <div className="font-semibold text-recruiter-text">{exam.title}</div>
            <div className="text-xs text-recruiter-text-tertiary">{exam.durationMinutes} min</div>
          </div>
          <div className="flex items-center gap-1.5">
            {exam.walkInEnabled && <StatusBadge tone="info">Walk-in</StatusBadge>}
            <StatusBadge tone={STATUS_TONE[exam.status]}>{STATUS_LABEL[exam.status]}</StatusBadge>
          </div>
        </div>
```

- [ ] **Step 8: Manually verify the badge (no dedicated test — exams list has no per-card test)**

Run: `cd apps/web && npx jest ExamDetailsForm.test.tsx exams` (confirms nothing else broke; the exams list page has no existing unit test suite to extend, so live verification happens in Task 6's e2e test instead).

- [ ] **Step 9: Commit**

```bash
git add apps/web/lib/types.ts apps/web/lib/hooks/useExams.ts apps/web/components/ExamDetailsForm.tsx apps/web/components/ExamDetailsForm.test.tsx "apps/web/app/(recruiter)/exams/page.tsx"
git commit -m "feat: recruiter-facing walk-in registration toggle and badge"
```

---

### Task 5: Frontend — candidate walk-in registration page

**Files:**
- Create: `apps/web/lib/hooks/useWalkIn.ts`
- Create: `apps/web/app/walk-in/[orgSlug]/page.tsx`

**Interfaces:**
- Consumes: `GET /public/walk-in/:orgSlug/exams` and `POST /public/walk-in/:orgSlug/register` (Task 3); `WalkInExamOption` type (Task 4, Step 1); `apiFetch` from `apps/web/lib/api-client.ts`.
- Produces: the public `/walk-in/:orgSlug` page, which on success redirects to the existing `/start?token=...` page — no new interface consumed downstream.

- [ ] **Step 1: Create the hooks**

Create `apps/web/lib/hooks/useWalkIn.ts`:

```ts
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { WalkInExamOption } from '../types';

export function useWalkInExams(orgSlug: string) {
  return useQuery<WalkInExamOption[]>({
    queryKey: ['walk-in-exams', orgSlug],
    queryFn: () => apiFetch(`/public/walk-in/${orgSlug}/exams`),
  });
}

interface WalkInRegisterInput {
  examId: string;
  name: string;
  email: string;
  phone?: string;
}

export function useWalkInRegister(orgSlug: string) {
  return useMutation({
    mutationFn: (input: WalkInRegisterInput): Promise<{ token: string }> =>
      apiFetch(`/public/walk-in/${orgSlug}/register`, { method: 'POST', body: JSON.stringify(input) }),
  });
}
```

These deliberately do not use `useAuth()`/`accessToken` — the walk-in endpoints are public, and `apiFetch`'s `accessToken` parameter is optional (see `apps/web/lib/api-client.ts:28`).

- [ ] **Step 2: Create the page**

Create `apps/web/app/walk-in/[orgSlug]/page.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion, MotionConfig } from 'framer-motion';
import { AlertCircle } from 'lucide-react';
import { Button, Input, Select } from '../../../components/ui';
import { useWalkInExams, useWalkInRegister } from '../../../lib/hooks/useWalkIn';

export default function WalkInPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const router = useRouter();
  const { data: exams, isLoading, isError } = useWalkInExams(orgSlug);
  const register = useWalkInRegister(orgSlug);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [examId, setExamId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const resolvedExamId = exams && exams.length === 1 ? exams[0].id : examId;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    register.mutate(
      { name, email, phone: phone || undefined, examId: resolvedExamId },
      {
        onSuccess: (result) => router.push(`/start?token=${result.token}`),
        onError: (err) => setError(err instanceof Error ? err.message : 'Registration failed.'),
      },
    );
  }

  return (
    <MotionConfig reducedMotion="user">
      <main className="grid md:min-h-screen md:grid-cols-2">
        <div
          className="relative hidden overflow-hidden md:flex md:flex-col md:items-start md:justify-center md:gap-4 md:px-16 md:py-12"
          style={{ backgroundImage: 'linear-gradient(135deg, var(--color-primary, #1a73e8), var(--color-accent, #fbbc04))' }}
        >
          <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/10" aria-hidden="true" />
          <div className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-white/10" aria-hidden="true" />
          <p className="relative z-10 text-2xl font-bold text-white">Examination Platform</p>
          <p className="relative z-10 max-w-sm text-sm text-white/90">Register on the spot and start your exam right away.</p>
        </div>

        <div className="flex flex-col items-center justify-center gap-4 bg-white px-6 py-12 md:hidden">
          <p className="text-lg font-bold text-primary">Examination Platform</p>
        </div>

        <div className="flex flex-1 items-center justify-center bg-white px-6 py-12">
          <div className="w-full max-w-sm">
            <h1 className="mb-6 text-xl font-semibold text-recruiter-text">Walk-in registration</h1>

            {isLoading && <p className="text-sm text-recruiter-text-tertiary">Loading&hellip;</p>}

            {isError && (
              <p role="alert" className="text-sm text-status-danger">
                This registration page isn&apos;t available right now.
              </p>
            )}

            {!isLoading && !isError && exams && exams.length === 0 && (
              <p className="text-sm text-recruiter-text-secondary">
                No exams are currently open for walk-in registration.
              </p>
            )}

            {!isLoading && !isError && exams && exams.length > 0 && (
              <motion.form
                onSubmit={handleSubmit}
                className="flex flex-col gap-3"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
              >
                <Input label="Name" value={name} onChange={setName} required />
                <Input label="Email" type="email" value={email} onChange={setEmail} required />
                <Input label="Phone" value={phone} onChange={setPhone} />
                {exams.length > 1 && (
                  <Select
                    label="Exam"
                    value={examId}
                    onChange={setExamId}
                    options={exams.map((exam) => ({ value: exam.id, label: exam.title }))}
                  />
                )}
                <Button type="submit" loading={register.isPending} disabled={!resolvedExamId}>
                  Start exam
                </Button>
                {error && (
                  <p role="alert" className="flex items-center gap-2 rounded-md bg-status-danger-bg px-3 py-2 text-sm text-status-danger">
                    <AlertCircle size={16} />
                    {error}
                  </p>
                )}
              </motion.form>
            )}
          </div>
        </div>
      </main>
    </MotionConfig>
  );
}
```

This follows the exact split-screen/gradient/`MotionConfig` layout already used by `apps/web/app/login/page.tsx` and `apps/web/app/reset-password/[token]/page.tsx`, so the walk-in page looks and animates consistently with the rest of the staff portal's public pages.

- [ ] **Step 3: Manually verify with the dev servers**

Start `web` and `api` (via the project's dev-server tooling), log in as a recruiter, enable walk-in on a published exam (Task 4's checkbox), then navigate to `http://localhost:3002/walk-in/demo-org` and confirm: the form renders, submitting with a new name/email redirects to `/start?token=...`, and that page redirects to `/welcome`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/hooks/useWalkIn.ts "apps/web/app/walk-in"
git commit -m "feat: candidate-facing walk-in registration page"
```

---

### Task 6: E2E golden path + final verification

**Files:**
- Create: `apps/web/e2e/walk-in-registration.spec.ts`

**Interfaces:**
- Consumes: everything from Tasks 1-5 end to end.

- [ ] **Step 1: Write the e2e test**

Create `apps/web/e2e/walk-in-registration.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

const ORG_SLUG = process.env.E2E_ORG_SLUG ?? 'demo-org';
const RECRUITER_EMAIL = process.env.E2E_RECRUITER_EMAIL ?? 'recruiter@demo-org.test';
const RECRUITER_PASSWORD = process.env.E2E_RECRUITER_PASSWORD ?? 'Passw0rd!2026';

test('a walk-in candidate registers and starts the exam without an email invite', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Organization slug').fill(ORG_SLUG);
  await page.getByLabel('Email').fill(RECRUITER_EMAIL);
  await page.getByLabel('Password').fill(RECRUITER_PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  await page.getByRole('link', { name: 'Question Bank' }).click();
  await page.getByRole('link', { name: 'New question' }).click();
  await page.getByLabel('Question text').fill('Walk-in test question: 2 + 2?');
  await page.getByLabel('Marks', { exact: true }).fill('5');
  const optionInputs = page.getByLabel(/Option \d text/);
  await optionInputs.nth(0).fill('4');
  await optionInputs.nth(1).fill('5');
  await page.getByRole('radio', { name: 'Option 1 correct' }).click();
  await page.getByRole('button', { name: 'Create question' }).click();
  await expect(page).toHaveURL(/\/questions$/);

  await page.getByRole('link', { name: 'Exams' }).click();
  await page.getByRole('link', { name: 'New exam' }).click();
  const examTitle = `Walk-in E2E Exam ${Date.now()}`;
  await page.getByLabel('Title').fill(examTitle);
  await page.getByRole('button', { name: 'Create exam' }).click();
  await expect(page).toHaveURL(/\/exams\/.+\/edit$/);

  await page.getByLabel('Enable walk-in registration for this exam').click();
  await page.getByRole('button', { name: 'Save details' }).click();

  await page.getByRole('tab', { name: 'Sections & Questions' }).click();
  await page.getByLabel('New section title').fill('Section One');
  await page.getByRole('button', { name: 'Add section' }).click();
  await page.getByRole('button', { name: 'Manage questions' }).click();
  await page.getByRole('checkbox', { name: /Walk-in test question: 2 \+ 2\?/ }).first().click();
  await page.getByRole('button', { name: 'Save questions' }).click();
  await page.getByRole('button', { name: 'Publish' }).click();
  await expect(page).toHaveURL(/\/exams$/);
  await expect(page.getByText('Walk-in').first()).toBeVisible();

  await page.addInitScript(() => {
    // ponytail: real Chromium exposes navigator.mediaDevices as a non-configurable accessor,
    // so plain assignment silently no-ops -- Object.defineProperty is required to override it.
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: async () => ({ getTracks: () => [{ stop: () => undefined }] }) },
      configurable: true,
    });
    (window as unknown as { __DISABLE_WEBCAM_MONITOR__?: boolean }).__DISABLE_WEBCAM_MONITOR__ = true;
  });

  await page.goto(`/walk-in/${ORG_SLUG}`);
  const candidateEmail = `walk-in-${Date.now()}@example.com`;
  await page.getByLabel('Name', { exact: true }).fill('Walk In Person');
  await page.getByLabel('Email').fill(candidateEmail);
  // This org's dev DB accumulates walk-in-enabled exams across e2e runs, so the picker may or
  // may not appear depending on how many are currently enabled -- select this test's exam only
  // when the picker is actually rendered (i.e. more than one walk-in exam exists right now).
  const examSelect = page.getByLabel('Exam', { exact: true });
  if (await examSelect.isVisible().catch(() => false)) {
    await examSelect.click();
    await page.getByRole('option', { name: examTitle, exact: true }).click();
  }
  await page.getByRole('button', { name: 'Start exam' }).click();

  await expect(page).toHaveURL(/\/welcome$/);
  await page.getByRole('button', { name: /skip practice/i }).click();
  await expect(page.getByText(examTitle)).toBeVisible();
  await page.getByRole('button', { name: 'Enable camera' }).click();
  await page.getByRole('checkbox', { name: /i understand and consent to monitoring/i }).click();
  await page.getByRole('button', { name: 'Start exam' }).click();
  await expect(page).toHaveURL(/\/exam$/);
  await expect(page.getByText('Walk-in test question: 2 + 2?')).toBeVisible();
});

test('registering twice with the same email for the same exam resumes rather than duplicates', async ({ page, request }) => {
  await page.goto('/login');
  await page.getByLabel('Organization slug').fill(ORG_SLUG);
  await page.getByLabel('Email').fill(RECRUITER_EMAIL);
  await page.getByLabel('Password').fill(RECRUITER_PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  await page.getByRole('link', { name: 'Exams' }).click();
  await page.getByRole('link', { name: 'New exam' }).click();
  const examTitle = `Walk-in Resume Exam ${Date.now()}`;
  await page.getByLabel('Title').fill(examTitle);
  await page.getByRole('button', { name: 'Create exam' }).click();
  await expect(page).toHaveURL(/\/exams\/.+\/edit$/);
  const examId = page.url().match(/\/exams\/([^/]+)\/edit$/)?.[1];

  await page.getByLabel('Enable walk-in registration for this exam').click();
  await page.getByRole('button', { name: 'Save details' }).click();
  await page.getByRole('button', { name: 'Publish' }).click();
  await expect(page).toHaveURL(/\/exams$/);

  const email = `resume-${Date.now()}@example.com`;
  const apiBase = process.env.E2E_API_BASE ?? 'http://localhost:3001/api/v1';

  const first = await request.post(`${apiBase}/public/walk-in/${ORG_SLUG}/register`, {
    data: { examId, name: 'Resume Person', email },
  });
  const firstBody = await first.json();

  const second = await request.post(`${apiBase}/public/walk-in/${ORG_SLUG}/register`, {
    data: { examId, name: 'Resume Person', email },
  });
  const secondBody = await second.json();

  expect(secondBody.token).toBe(firstBody.token);
});
```

- [ ] **Step 2: Run the new e2e spec**

Run: `cd apps/web && npx playwright test walk-in-registration.spec.ts`
Expected: both tests pass. (If `E2E_API_BASE` isn't set and the api dev server isn't on `localhost:3001`, set it to match this repo's `.env.local`/launch config before running.)

- [ ] **Step 3: Final verification — run everything touched by this plan**

Run: `cd apps/api && npx jest`
Expected: all suites pass, including `exams.service.spec.ts` and `walk-in.service.spec.ts`.

Run: `cd apps/web && npx jest`
Expected: all suites pass, including `ExamDetailsForm.test.tsx`.

Run: `cd apps/web && npx playwright test`
Expected: all e2e specs pass, including both new walk-in tests and the pre-existing candidate/recruiter golden paths (confirms the reused `/start` page and `/welcome` flow are unaffected).

- [ ] **Step 4: Commit**

```bash
git add apps/web/e2e/walk-in-registration.spec.ts
git commit -m "test: e2e coverage for walk-in candidate registration"
```
