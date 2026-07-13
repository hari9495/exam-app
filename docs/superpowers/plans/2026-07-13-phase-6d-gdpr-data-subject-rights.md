# Phase 6d: GDPR Data Subject Rights Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add admin-triggered right-to-access (`GET /candidates/:id/export`) and right-to-erasure (`POST /candidates/:id/erase`, anonymize-in-place) endpoints for candidates, gated by a new `candidate:data_rights` permission.

**Architecture:** Two new methods on the existing `CandidatesService`/`CandidatesController`, both tenant-scoped via `TenantPrismaService.forTenant()` and audited via the existing `AuditService` (`candidate.data_exported` / `candidate.erased` — the first `candidate` entityType usage). Erasure scrubs PII fields in one atomic transaction while keeping `Attempt`/`Answer`/`Result` rows intact under the candidate's pseudonymous UUID; a new `Candidate.erasedAt` column provides idempotency and lets `bulkInvite` reject erased candidates.

**Tech Stack:** NestJS, Prisma (SQL Server, hand-written migrations), existing RLS/`TenantContext` patterns — no new libraries.

## Global Constraints

- New permission key: `candidate:data_rights`, granted to **`org_admin` only** — not `recruiter`, not `panel`, not `super_admin`.
- Exact audit action strings: `candidate.data_exported`, `candidate.erased` (entityType `candidate`, entityId = candidate UUID, actor via `@CurrentUserId()`).
- Erasure scrub values (exact): `Candidate.name` → `"Redacted"`; `Candidate.email` → `` `erased-${candidateId}@redacted.invalid` `` (unique per candidate — the `(organizationId, email)` unique index forbids a fixed literal); `Candidate.phone` → `null`; `Attempt.deviceFingerprint` → `null`; `CandidateMessage.body` → `"[redacted]"`; `ProctoringEvent.metadataJson` → `null`; `ProctoringAnalysis.summary` → `"[redacted]"` (only where currently non-null); `AttemptInsight.summary` → `"[redacted]"` (only where currently non-null).
- Erasure also deletes all `CandidateRefreshToken` rows reachable via the candidate's invitations, and sets any still-`invited` invitation to `status: 'revoked'` + `revokedAt`.
- Erasure is atomic (one `forTenant()` transaction) and idempotent (already-erased → no-op, no re-scrub, no second audit entry — same pattern as invitation revoke).
- `Attempt`/`Answer`/`Result` rows, scores, and the candidate UUID stay untouched.
- `bulkInvite` rejects erased candidates with a `BadRequestException` naming the candidate id(s). No other endpoint changes behavior for erased candidates.
- Export response excludes `Notification` and `CandidateRefreshToken` data entirely.
- No frontend work; no staff-user rights; no consent capture; no retention jobs (all explicitly out of scope per the spec).

---

### Task 1: Schema — Candidate.erasedAt + candidate:data_rights permission

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (the `Candidate` model)
- Create: `apps/api/prisma/migrations/20260713150000_candidate_erased_at/migration.sql`
- Modify: `apps/api/prisma/seed.ts`

**Interfaces:**
- Consumes: nothing from an earlier task (first task).
- Produces: `Candidate.erasedAt: Date | null` on the generated Prisma client (consumed by Tasks 2-3), and the seeded `candidate:data_rights` permission (consumed by Task 2-3's `@RequirePermissions` and Task 4's e2e).

- [ ] **Step 1: Add `erasedAt` to the Candidate model**

In `apps/api/prisma/schema.prisma`, the `Candidate` model currently reads:

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
```

Replace it with:

```prisma
model Candidate {
  id             String       @id @default(uuid()) @db.UniqueIdentifier
  organizationId String       @map("organization_id") @db.UniqueIdentifier
  email          String
  name           String
  phone          String?
  createdAt      DateTime     @default(now()) @map("created_at")
  erasedAt       DateTime?    @map("erased_at")
  invitations    Invitation[]

  @@unique([organizationId, email])
  @@map("candidates")
}
```

- [ ] **Step 2: Write the migration**

Create `apps/api/prisma/migrations/20260713150000_candidate_erased_at/migration.sql`:

```sql
-- AlterTable
-- Nullable erasure marker for GDPR right-to-erasure (Phase 6d): set once when a candidate's
-- PII is anonymized in place. Provides idempotency for the erase endpoint and a rejection
-- flag so an erased candidate cannot be re-invited.
ALTER TABLE [dbo].[candidates] ADD [erased_at] DATETIME2;
```

- [ ] **Step 3: Add the permission to the seed script**

In `apps/api/prisma/seed.ts`, the `PERMISSIONS` array currently ends with:

```ts
  { key: 'audit:view', description: 'View the audit log and role/permission mappings' },
];
```

Change it to:

```ts
  { key: 'audit:view', description: 'View the audit log and role/permission mappings' },
  { key: 'candidate:data_rights', description: 'Process GDPR data subject requests: export or erase a candidate\'s personal data' },
];
```

And in `ROLE_PERMISSIONS`, change the `org_admin` line from:

```ts
  org_admin: ['org:manage_users', 'org:manage_settings', 'org:view', 'audit:view'],
```

to:

```ts
  org_admin: ['org:manage_users', 'org:manage_settings', 'org:view', 'audit:view', 'candidate:data_rights'],
```

(`super_admin`/`recruiter`/`panel` lines stay untouched.)

- [ ] **Step 4: Apply the migration, regenerate the client, re-seed**

Run (with `DATABASE_URL` exported — value in `apps/api/.env`):

```bash
npx prisma migrate deploy --schema apps/api/prisma/schema.prisma
npx prisma generate --schema apps/api/prisma/schema.prisma
cd apps/api && npx prisma db seed && cd ../..
```

Expected: all exit 0. The generated client's `Candidate` type now has `erasedAt: Date | null`.

- [ ] **Step 5: Build both apps**

Run: `npm run build --workspace=apps/api && npm run build --workspace=apps/exam-runtime`
Expected: both exit 0 (nothing consumes the new column yet — this proves the widened type breaks nothing).

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260713150000_candidate_erased_at apps/api/prisma/seed.ts
git commit -m "feat: add Candidate.erasedAt column and candidate:data_rights permission

erasedAt marks a candidate whose PII has been anonymized in place (GDPR
right-to-erasure, Phase 6d): it makes the erase endpoint idempotent and
gives bulkInvite a flag to reject re-inviting an erased candidate.
candidate:data_rights is granted to org_admin only -- processing legal
data-subject requests is a different job than day-to-day candidate
management (recruiter), and super_admin holds no candidate:* permissions."
```

---

### Task 2: Right to access — GET /candidates/:id/export

**Files:**
- Modify: `apps/api/src/candidates/candidates.service.ts`
- Modify: `apps/api/src/candidates/candidates.controller.ts`
- Test: `apps/api/src/candidates/candidates.service.spec.ts`

**Interfaces:**
- Consumes: `Candidate.erasedAt` from Task 1 (only incidentally — export works on erased candidates too, returning the redacted values).
- Produces: `CandidatesService.exportData(context: TenantContext, actorUserId: string, candidateId: string): Promise<CandidateDataExport>` and the exported `CandidateDataExport` interface. Task 4's e2e exercises the route.

- [ ] **Step 1: Update the spec file's setup and write the failing tests**

In `apps/api/src/candidates/candidates.service.spec.ts`, `AuditService` must now be provided (the service gains it as a constructor dependency in Step 3). Change the header from:

```ts
import { Test } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { CandidatesService } from './candidates.service';
import { TenantPrismaService } from '@exam-platform/shared';

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
```

to:

```ts
import { Test } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { CandidatesService } from './candidates.service';
import { TenantPrismaService, AuditService } from '@exam-platform/shared';

describe('CandidatesService', () => {
  let service: CandidatesService;
  let tenantPrisma: { forTenant: jest.Mock };
  let audit: { record: jest.Mock };
  const context = { organizationId: 'org-1', isSuperAdmin: false };

  beforeEach(async () => {
    tenantPrisma = { forTenant: jest.fn() };
    audit = { record: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        CandidatesService,
        { provide: TenantPrismaService, useValue: tenantPrisma },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    service = moduleRef.get(CandidatesService);
  });
```

Then add a new `describe` block at the end of the file, before the outer `describe`'s closing `});`:

```ts

  describe('exportData', () => {
    it('assembles the candidate\'s full data footprint with human-readable joins', async () => {
      const tx = {
        candidate: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'cand-1', email: 'a@test.com', name: 'Alice', phone: '555-1234', createdAt: new Date('2026-01-01'),
          }),
        },
        invitation: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'inv-1', status: 'completed', invitedAt: new Date('2026-01-02'),
              expiresAt: new Date('2026-01-09'), revokedAt: null,
              exam: { title: 'Backend Round' },
              attempt: {
                id: 'attempt-1', status: 'submitted', startedAt: new Date('2026-01-03'),
                submittedAt: new Date('2026-01-03'), deviceFingerprint: 'fp-abc',
                result: { score: 5, maxScore: 10, percentage: 50, passFail: 'pass' },
                answers: [
                  {
                    selectedOptionIdsJson: JSON.stringify(['opt-a']),
                    isCorrect: true, marksAwarded: 5,
                    question: { text: 'What is 2+2?', options: [{ id: 'opt-a', text: '4' }, { id: 'opt-b', text: '5' }] },
                  },
                ],
                proctoringEvents: [
                  { eventType: 'tab_switch', severity: 'medium', occurredAt: new Date('2026-01-03'), metadataJson: JSON.stringify({ count: 2 }) },
                ],
                proctoringAnalysis: { status: 'completed', riskLevel: 'low', summary: 'No issues observed.' },
                insight: { status: 'completed', summary: 'Strong fundamentals.' },
                messages: [{ body: 'Please stay in frame', sentAt: new Date('2026-01-03'), readAt: null }],
              },
            },
          ]),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.exportData(context, 'user-1', 'cand-1');

      expect(result.candidate).toEqual({
        id: 'cand-1', email: 'a@test.com', name: 'Alice', phone: '555-1234', createdAt: new Date('2026-01-01'),
      });
      expect(result.invitations).toEqual([
        { id: 'inv-1', examTitle: 'Backend Round', status: 'completed', invitedAt: new Date('2026-01-02'), expiresAt: new Date('2026-01-09'), revokedAt: null },
      ]);
      expect(result.attempts).toHaveLength(1);
      expect(result.attempts[0].examTitle).toBe('Backend Round');
      expect(result.attempts[0].result).toEqual({ score: 5, maxScore: 10, percentage: 50, passFail: 'pass' });
      expect(result.attempts[0].answers).toEqual([
        { questionText: 'What is 2+2?', selectedOptions: ['4'], isCorrect: true, marksAwarded: 5 },
      ]);
      expect(result.attempts[0].proctoringEvents).toEqual([
        { eventType: 'tab_switch', severity: 'medium', occurredAt: new Date('2026-01-03'), metadata: { count: 2 } },
      ]);
      expect(result.attempts[0].messages).toEqual([
        { body: 'Please stay in frame', sentAt: new Date('2026-01-03'), readAt: null },
      ]);
      expect(audit.record).toHaveBeenCalledWith(context, {
        actorUserId: 'user-1', action: 'candidate.data_exported', entityType: 'candidate', entityId: 'cand-1',
      });
    });

    it('handles an invitation with no attempt yet', async () => {
      const tx = {
        candidate: {
          findFirst: jest.fn().mockResolvedValue({ id: 'cand-1', email: 'a@test.com', name: 'Alice', phone: null, createdAt: new Date('2026-01-01') }),
        },
        invitation: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'inv-1', status: 'invited', invitedAt: new Date('2026-01-02'), expiresAt: new Date('2026-01-09'), revokedAt: null,
              exam: { title: 'Backend Round' }, attempt: null,
            },
          ]),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.exportData(context, 'user-1', 'cand-1');

      expect(result.invitations).toHaveLength(1);
      expect(result.attempts).toEqual([]);
    });

    it('throws NotFoundException (and does not audit) for a candidate outside the caller organization', async () => {
      const tx = { candidate: { findFirst: jest.fn().mockResolvedValue(null) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.exportData(context, 'user-1', 'cand-x')).rejects.toThrow(NotFoundException);
      expect(audit.record).not.toHaveBeenCalled();
    });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:api -- --testPathPattern=candidates.service`
Expected: FAIL — `service.exportData is not a function`.

- [ ] **Step 3: Implement `exportData` in `apps/api/src/candidates/candidates.service.ts`**

Change the header from:

```ts
import { ConflictException, Injectable } from '@nestjs/common';
import { Candidate } from '@prisma/client';
import { TenantPrismaService } from '@exam-platform/shared';
import { TenantContext } from '@exam-platform/shared';
import { CreateCandidateDto } from './dto/create-candidate.dto';
import { parseCandidateCsv } from './csv-parser';
```

to:

```ts
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Candidate } from '@prisma/client';
import { TenantPrismaService } from '@exam-platform/shared';
import { TenantContext } from '@exam-platform/shared';
import { AuditService } from '@exam-platform/shared';
import { CreateCandidateDto } from './dto/create-candidate.dto';
import { parseCandidateCsv } from './csv-parser';
```

After the existing `BulkUploadResult` interface, add:

```ts

export interface CandidateDataExport {
  candidate: { id: string; email: string; name: string; phone: string | null; createdAt: Date };
  invitations: {
    id: string; examTitle: string; status: string; invitedAt: Date; expiresAt: Date; revokedAt: Date | null;
  }[];
  attempts: {
    id: string; examTitle: string; status: string; startedAt: Date; submittedAt: Date | null; deviceFingerprint: string | null;
    result: { score: number; maxScore: number; percentage: number; passFail: string } | null;
    answers: { questionText: string; selectedOptions: string[]; isCorrect: boolean | null; marksAwarded: number | null }[];
    proctoringEvents: { eventType: string; severity: string; occurredAt: Date; metadata: Record<string, unknown> | null }[];
    proctoringAnalysis: { status: string; riskLevel: string | null; summary: string | null } | null;
    insight: { status: string; summary: string | null } | null;
    messages: { body: string; sentAt: Date; readAt: Date | null }[];
  }[];
}
```

Change the constructor from:

```ts
  constructor(private readonly tenantPrisma: TenantPrismaService) {}
```

to:

```ts
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly audit: AuditService,
  ) {}
```

Add the method after `bulkUpload()` (before the class's closing brace):

```ts

  async exportData(context: TenantContext, actorUserId: string, candidateId: string): Promise<CandidateDataExport> {
    const exportPayload = await this.tenantPrisma.forTenant(context, async (tx) => {
      const candidate = await tx.candidate.findFirst({
        where: { id: candidateId, organizationId: context.organizationId as string },
      });
      if (!candidate) {
        throw new NotFoundException(`Candidate ${candidateId} not found`);
      }

      const invitations = await tx.invitation.findMany({
        where: { candidateId },
        orderBy: { invitedAt: 'desc' },
        include: {
          exam: { select: { title: true } },
          attempt: {
            include: {
              result: true,
              answers: { include: { question: { select: { text: true, options: { select: { id: true, text: true } } } } } },
              proctoringEvents: { orderBy: { occurredAt: 'asc' } },
              proctoringAnalysis: true,
              insight: true,
              messages: { orderBy: { sentAt: 'asc' } },
            },
          },
        },
      });

      return {
        candidate: {
          id: candidate.id, email: candidate.email, name: candidate.name, phone: candidate.phone, createdAt: candidate.createdAt,
        },
        invitations: invitations.map((invitation) => ({
          id: invitation.id, examTitle: invitation.exam.title, status: invitation.status,
          invitedAt: invitation.invitedAt, expiresAt: invitation.expiresAt, revokedAt: invitation.revokedAt,
        })),
        attempts: invitations
          .filter((invitation) => invitation.attempt !== null)
          .map((invitation) => {
            const attempt = invitation.attempt!;
            return {
              id: attempt.id, examTitle: invitation.exam.title, status: attempt.status,
              startedAt: attempt.startedAt, submittedAt: attempt.submittedAt, deviceFingerprint: attempt.deviceFingerprint,
              result: attempt.result
                ? { score: attempt.result.score, maxScore: attempt.result.maxScore, percentage: attempt.result.percentage, passFail: attempt.result.passFail }
                : null,
              answers: attempt.answers.map((answer) => {
                const selectedIds: string[] = JSON.parse(answer.selectedOptionIdsJson);
                const optionTextById = new Map(answer.question.options.map((option) => [option.id, option.text]));
                return {
                  questionText: answer.question.text,
                  selectedOptions: selectedIds.map((optionId) => optionTextById.get(optionId) ?? optionId),
                  isCorrect: answer.isCorrect,
                  marksAwarded: answer.marksAwarded,
                };
              }),
              proctoringEvents: attempt.proctoringEvents.map((event) => ({
                eventType: event.eventType, severity: event.severity, occurredAt: event.occurredAt,
                metadata: event.metadataJson ? JSON.parse(event.metadataJson) : null,
              })),
              proctoringAnalysis: attempt.proctoringAnalysis
                ? { status: attempt.proctoringAnalysis.status, riskLevel: attempt.proctoringAnalysis.riskLevel, summary: attempt.proctoringAnalysis.summary }
                : null,
              insight: attempt.insight ? { status: attempt.insight.status, summary: attempt.insight.summary } : null,
              messages: attempt.messages.map((message) => ({ body: message.body, sentAt: message.sentAt, readAt: message.readAt })),
            };
          }),
      };
    });

    await this.audit.record(context, {
      actorUserId,
      action: 'candidate.data_exported',
      entityType: 'candidate',
      entityId: candidateId,
    });

    return exportPayload;
  }
```

- [ ] **Step 4: Add the route to `apps/api/src/candidates/candidates.controller.ts`**

Replace the full file with:

```ts
import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { TenantContext } from '@exam-platform/shared';
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

  @Get(':id/export')
  @RequirePermissions('candidate:data_rights')
  exportData(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Param('id') id: string) {
    return this.candidatesService.exportData(tenant, userId, id);
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test:api -- --testPathPattern=candidates.service`
Expected: PASS — all pre-existing tests plus the 3 new `exportData` tests.

- [ ] **Step 6: Run the full apps/api unit suite**

Run: `npm run test:api`
Expected: PASS, no regression (the `AuditService` constructor addition only affects this service's own spec, updated in Step 1).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/candidates/candidates.service.ts apps/api/src/candidates/candidates.controller.ts apps/api/src/candidates/candidates.service.spec.ts
git commit -m "feat: add GET /candidates/:id/export (GDPR right to access)

Assembles the candidate's complete data footprint -- candidate record,
invitations, attempts with answers/results/proctoring/messages/insights --
as one human-readable JSON document (exam titles and option text joined
in, not bare UUIDs). Notification and CandidateRefreshToken rows are
deliberately excluded (technical/delivery records; exporting token hashes
would be a security anti-pattern). Gated by the new candidate:data_rights
permission; audited as candidate.data_exported."
```

---

### Task 3: Right to erasure — POST /candidates/:id/erase + bulkInvite rejection

**Files:**
- Modify: `apps/api/src/candidates/candidates.service.ts`
- Modify: `apps/api/src/candidates/candidates.controller.ts`
- Modify: `apps/api/src/invitations/invitations.service.ts`
- Test: `apps/api/src/candidates/candidates.service.spec.ts`
- Test: `apps/api/src/invitations/invitations.service.spec.ts`

**Interfaces:**
- Consumes: `Candidate.erasedAt` (Task 1), `AuditService` already injected into `CandidatesService` (Task 2).
- Produces: `CandidatesService.erase(context: TenantContext, actorUserId: string, candidateId: string): Promise<{ id: string; erasedAt: Date }>`. Task 4's e2e exercises the route.

- [ ] **Step 1: Write the failing erase tests**

In `apps/api/src/candidates/candidates.service.spec.ts`, add a new `describe` block after the `exportData` block:

```ts

  describe('erase', () => {
    function makeEraseTx(overrides: { candidate?: Record<string, unknown> } = {}) {
      return {
        candidate: {
          findFirst: jest.fn().mockResolvedValue(
            overrides.candidate ?? { id: 'cand-1', email: 'a@test.com', name: 'Alice', phone: '555-1234', erasedAt: null },
          ),
          update: jest.fn(),
        },
        invitation: {
          findMany: jest.fn().mockResolvedValue([{ id: 'inv-1' }, { id: 'inv-2' }]),
          updateMany: jest.fn(),
        },
        attempt: {
          findMany: jest.fn().mockResolvedValue([{ id: 'attempt-1' }]),
          updateMany: jest.fn(),
        },
        candidateMessage: { updateMany: jest.fn() },
        proctoringEvent: { updateMany: jest.fn() },
        proctoringAnalysis: { updateMany: jest.fn() },
        attemptInsight: { updateMany: jest.fn() },
        candidateRefreshToken: { deleteMany: jest.fn() },
      };
    }

    it('scrubs every PII-bearing field, deletes session tokens, and revokes live invitations atomically', async () => {
      const tx = makeEraseTx();
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.erase(context, 'user-1', 'cand-1');

      expect(tx.candidate.update).toHaveBeenCalledWith({
        where: { id: 'cand-1' },
        data: { name: 'Redacted', email: 'erased-cand-1@redacted.invalid', phone: null, erasedAt: expect.any(Date) },
      });
      expect(tx.attempt.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['attempt-1'] } }, data: { deviceFingerprint: null },
      });
      expect(tx.candidateMessage.updateMany).toHaveBeenCalledWith({
        where: { attemptId: { in: ['attempt-1'] } }, data: { body: '[redacted]' },
      });
      expect(tx.proctoringEvent.updateMany).toHaveBeenCalledWith({
        where: { attemptId: { in: ['attempt-1'] } }, data: { metadataJson: null },
      });
      expect(tx.proctoringAnalysis.updateMany).toHaveBeenCalledWith({
        where: { attemptId: { in: ['attempt-1'] }, summary: { not: null } }, data: { summary: '[redacted]' },
      });
      expect(tx.attemptInsight.updateMany).toHaveBeenCalledWith({
        where: { attemptId: { in: ['attempt-1'] }, summary: { not: null } }, data: { summary: '[redacted]' },
      });
      expect(tx.candidateRefreshToken.deleteMany).toHaveBeenCalledWith({
        where: { invitationId: { in: ['inv-1', 'inv-2'] } },
      });
      expect(tx.invitation.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['inv-1', 'inv-2'] }, status: 'invited' },
        data: { status: 'revoked', revokedAt: expect.any(Date) },
      });
      expect(result.id).toBe('cand-1');
      expect(result.erasedAt).toEqual(expect.any(Date));
      expect(audit.record).toHaveBeenCalledWith(context, {
        actorUserId: 'user-1', action: 'candidate.erased', entityType: 'candidate', entityId: 'cand-1',
      });
    });

    it('is idempotent: an already-erased candidate is a no-op with no re-scrub and no second audit entry', async () => {
      const previouslyErasedAt = new Date('2026-06-01');
      const tx = makeEraseTx({
        candidate: { id: 'cand-1', email: 'erased-cand-1@redacted.invalid', name: 'Redacted', phone: null, erasedAt: previouslyErasedAt },
      });
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.erase(context, 'user-1', 'cand-1');

      expect(result).toEqual({ id: 'cand-1', erasedAt: previouslyErasedAt });
      expect(tx.candidate.update).not.toHaveBeenCalled();
      expect(tx.candidateRefreshToken.deleteMany).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('throws NotFoundException (and touches nothing) for a candidate outside the caller organization', async () => {
      const tx = makeEraseTx();
      tx.candidate.findFirst.mockResolvedValue(null);
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.erase(context, 'user-1', 'cand-x')).rejects.toThrow(NotFoundException);
      expect(tx.candidate.update).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });
  });
```

- [ ] **Step 2: Write the failing bulkInvite-rejection test**

In `apps/api/src/invitations/invitations.service.spec.ts`, add this test inside the top-level `describe('InvitationsService', ...)` block, immediately after the first (bulk-invite happy path) test:

```ts

  it('rejects inviting an erased candidate', async () => {
    const tx = {
      exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1', title: 'Backend Round', status: 'published' }) },
      candidate: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'cand-1', email: 'a@test.com', name: 'Alice', erasedAt: null },
          { id: 'cand-2', email: 'erased-cand-2@redacted.invalid', name: 'Redacted', erasedAt: new Date('2026-06-01') },
        ]),
      },
      invitation: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn() },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await expect(service.bulkInvite(context, 'exam-1', ['cand-1', 'cand-2'])).rejects.toThrow(BadRequestException);
    expect(tx.invitation.create).not.toHaveBeenCalled();
  });
```

(`BadRequestException` is already imported in that spec file.)

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm run test:api -- --testPathPattern="candidates.service|invitations.service"`
Expected: FAIL — `service.erase is not a function`, and the bulkInvite test fails because no erased-candidate check exists (it resolves instead of rejecting).

- [ ] **Step 4: Implement `erase` in `apps/api/src/candidates/candidates.service.ts`**

Add the method after `exportData()` (before the class's closing brace):

```ts

  async erase(context: TenantContext, actorUserId: string, candidateId: string): Promise<{ id: string; erasedAt: Date }> {
    const { erasedAt, didErase } = await this.tenantPrisma.forTenant(context, async (tx) => {
      const candidate = await tx.candidate.findFirst({
        where: { id: candidateId, organizationId: context.organizationId as string },
      });
      if (!candidate) {
        throw new NotFoundException(`Candidate ${candidateId} not found`);
      }
      if (candidate.erasedAt) {
        return { erasedAt: candidate.erasedAt, didErase: false };
      }

      const invitations = await tx.invitation.findMany({ where: { candidateId }, select: { id: true } });
      const invitationIds = invitations.map((invitation) => invitation.id);
      const attempts = await tx.attempt.findMany({ where: { invitationId: { in: invitationIds } }, select: { id: true } });
      const attemptIds = attempts.map((attempt) => attempt.id);

      const now = new Date();
      await tx.candidate.update({
        where: { id: candidateId },
        data: { name: 'Redacted', email: `erased-${candidateId}@redacted.invalid`, phone: null, erasedAt: now },
      });
      await tx.attempt.updateMany({ where: { id: { in: attemptIds } }, data: { deviceFingerprint: null } });
      await tx.candidateMessage.updateMany({ where: { attemptId: { in: attemptIds } }, data: { body: '[redacted]' } });
      await tx.proctoringEvent.updateMany({ where: { attemptId: { in: attemptIds } }, data: { metadataJson: null } });
      await tx.proctoringAnalysis.updateMany({
        where: { attemptId: { in: attemptIds }, summary: { not: null } },
        data: { summary: '[redacted]' },
      });
      await tx.attemptInsight.updateMany({
        where: { attemptId: { in: attemptIds }, summary: { not: null } },
        data: { summary: '[redacted]' },
      });
      await tx.candidateRefreshToken.deleteMany({ where: { invitationId: { in: invitationIds } } });
      await tx.invitation.updateMany({
        where: { id: { in: invitationIds }, status: 'invited' },
        data: { status: 'revoked', revokedAt: now },
      });

      return { erasedAt: now, didErase: true };
    });

    if (didErase) {
      await this.audit.record(context, {
        actorUserId,
        action: 'candidate.erased',
        entityType: 'candidate',
        entityId: candidateId,
      });
    }

    return { id: candidateId, erasedAt };
  }
```

- [ ] **Step 5: Add the route to `apps/api/src/candidates/candidates.controller.ts`**

Add after the `exportData` route (before the class's closing brace):

```ts

  @Post(':id/erase')
  @RequirePermissions('candidate:data_rights')
  erase(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Param('id') id: string) {
    return this.candidatesService.erase(tenant, userId, id);
  }
```

- [ ] **Step 6: Add the erased-candidate rejection to `apps/api/src/invitations/invitations.service.ts`**

In `bulkInvite()`, directly after the existing missing-candidates check:

```ts
      const foundIds = new Set(candidates.map((c) => c.id));
      const missingIds = uniqueCandidateIds.filter((id) => !foundIds.has(id));
      if (missingIds.length > 0) {
        throw new NotFoundException(`One or more candidates were not found in this organization: ${missingIds.join(', ')}`);
      }
```

add:

```ts
      const erasedIds = candidates.filter((c) => c.erasedAt !== null).map((c) => c.id);
      if (erasedIds.length > 0) {
        throw new BadRequestException(`One or more candidates have been erased and cannot be invited: ${erasedIds.join(', ')}`);
      }
```

(`BadRequestException` is already imported in that service file.)

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npm run test:api -- --testPathPattern="candidates.service|invitations.service"`
Expected: PASS — all pre-existing tests plus the 3 new erase tests and the 1 new bulkInvite test.

- [ ] **Step 8: Run the full apps/api unit suite and build**

Run: `npm run test:api && npm run build --workspace=apps/api`
Expected: PASS / exit 0, no regression.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/candidates/candidates.service.ts apps/api/src/candidates/candidates.controller.ts apps/api/src/candidates/candidates.service.spec.ts apps/api/src/invitations/invitations.service.ts apps/api/src/invitations/invitations.service.spec.ts
git commit -m "feat: add POST /candidates/:id/erase (GDPR right to erasure, anonymize-in-place)

Scrubs every PII-bearing field in one atomic transaction -- candidate
name/email/phone (email becomes a unique per-candidate placeholder since
(organizationId, email) is uniquely indexed), attempt device fingerprints,
message bodies, client-supplied proctoring event metadata, and AI-generated
proctoring/insight summaries -- while keeping Attempt/Answer/Result rows
intact under the candidate's pseudonymous UUID, so org aggregate reporting
survives. Deletes candidate session tokens outright and revokes any
still-live invitation. Idempotent via the new erasedAt marker (no re-scrub,
no second audit entry), mirroring invitation revoke's no-op pattern.
bulkInvite now rejects erased candidates. Audited as candidate.erased."
```

---

### Task 4: E2E coverage — candidate-data-rights.e2e-spec.ts

**Files:**
- Create: `apps/api/test/candidate-data-rights.e2e-spec.ts`

**Interfaces:**
- Consumes: both routes from Tasks 2-3, the `candidate:data_rights` permission from Task 1, and Phase 6c's `GET /audit-logs`.
- Produces: nothing (terminal coverage task).

- [ ] **Step 1: Write the e2e spec**

Create `apps/api/test/candidate-data-rights.e2e-spec.ts`. It uses the dual-app harness (the candidate must genuinely take an exam so the export has real answers/scores to show), modeled on `exam-taking-runtime.e2e-spec.ts`'s setup:

```ts
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { bootAdminApp, bootRuntimeApp } from './dual-app';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { EmailService } from '../src/email/email.service';

describe('Candidate data subject rights (GDPR export + erasure)', () => {
  let adminApp: INestApplication;
  let runtimeApp: INestApplication;
  let adminHttp: any;
  let runtimeHttp: any;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let planId: string;
  let orgId: string;
  let orgBId: string;
  let recruiterAccessToken: string;
  let orgAdminAccessToken: string;
  let orgBAdminAccessToken: string;
  let examId: string;
  let questionId: string;
  let questionOptions: { id: string; text: string }[];
  let candidateId: string;
  const fakeEmailService = { send: jest.fn().mockResolvedValue({ success: true, previewUrl: 'https://ethereal.email/fake' }) };

  beforeAll(async () => {
    adminApp = await bootAdminApp((builder) => builder.overrideProvider(EmailService).useValue(fakeEmailService));
    ({ app: runtimeApp } = await bootRuntimeApp());
    adminHttp = adminApp.getHttpServer();
    runtimeHttp = runtimeApp.getHttpServer();
    prisma = adminApp.get(PrismaService);
    tenantPrisma = adminApp.get(TenantPrismaService);

    const plan = await prisma.plan.create({
      data: { name: `gdpr-plan-${randomUUID()}`, candidateLimit: 10, aiCreditLimit: 1, proctoringMinutesLimit: 1 },
    });
    planId = plan.id;

    const org = await prisma.organization.create({ data: { name: 'GDPR Org A', slug: `gdpr-org-a-${randomUUID()}`, planId } });
    orgId = org.id;
    const orgB = await prisma.organization.create({ data: { name: 'GDPR Org B', slug: `gdpr-org-b-${randomUUID()}`, planId } });
    orgBId = orgB.id;

    const recruiterHash = await argon2.hash('RecruiterPassw0rd!');
    const orgAdminHash = await argon2.hash('OrgAdminPassw0rd!');
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) =>
      Promise.all([
        tx.user.create({ data: { organizationId: orgId, email: 'recruiter@gdpr-a.test', passwordHash: recruiterHash, role: 'recruiter' } }),
        tx.user.create({ data: { organizationId: orgId, email: 'orgadmin@gdpr-a.test', passwordHash: orgAdminHash, role: 'org_admin' } }),
      ]),
    );
    await tenantPrisma.forTenant({ organizationId: orgBId, isSuperAdmin: false }, (tx) =>
      tx.user.create({ data: { organizationId: orgBId, email: 'orgadmin@gdpr-b.test', passwordHash: orgAdminHash, role: 'org_admin' } }),
    );

    recruiterAccessToken = (
      await request(adminHttp).post('/api/v1/auth/staff/login')
        .send({ organizationSlug: org.slug, email: 'recruiter@gdpr-a.test', password: 'RecruiterPassw0rd!' }).expect(200)
    ).body.accessToken;
    orgAdminAccessToken = (
      await request(adminHttp).post('/api/v1/auth/staff/login')
        .send({ organizationSlug: org.slug, email: 'orgadmin@gdpr-a.test', password: 'OrgAdminPassw0rd!' }).expect(200)
    ).body.accessToken;
    orgBAdminAccessToken = (
      await request(adminHttp).post('/api/v1/auth/staff/login')
        .send({ organizationSlug: orgB.slug, email: 'orgadmin@gdpr-b.test', password: 'OrgAdminPassw0rd!' }).expect(200)
    ).body.accessToken;

    const examResponse = await request(adminHttp)
      .post('/api/v1/exams')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ title: 'GDPR Round' })
      .expect(201);
    examId = examResponse.body.id;

    const sectionResponse = await request(adminHttp)
      .post(`/api/v1/exams/${examId}/sections`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ title: 'Section One' })
      .expect(201);

    const question = await request(adminHttp)
      .post('/api/v1/questions')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({
        type: 'single_mcq', text: 'What is 2+2?', difficulty: 'easy', marks: 5,
        options: [{ text: '4', isCorrect: true }, { text: '5', isCorrect: false }],
      })
      .expect(201);
    questionId = question.body.id;
    questionOptions = question.body.options;

    await request(adminHttp)
      .put(`/api/v1/exams/${examId}/sections/${sectionResponse.body.id}/questions`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ questionIds: [questionId] })
      .expect(200);

    await request(adminHttp)
      .post(`/api/v1/exams/${examId}/publish`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(201);

    // The candidate whose data-subject rights this suite exercises: full exam flow so the
    // export has real answers and a real score to show.
    const candidateResponse = await request(adminHttp)
      .post('/api/v1/candidates')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ email: 'gina@gdpr-a.test', name: 'Gina GDPR', phone: '555-0100' })
      .expect(201);
    candidateId = candidateResponse.body.id;

    const inviteResponse = await request(adminHttp)
      .post(`/api/v1/exams/${examId}/invitations`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ candidateIds: [candidateId] })
      .expect(201);
    const candidateAccessToken = (
      await request(runtimeHttp).post('/api/v1/candidate-auth/redeem').send({ token: inviteResponse.body.created[0].token }).expect(200)
    ).body.accessToken;

    await request(runtimeHttp).post('/api/v1/attempt/start').set('Authorization', `Bearer ${candidateAccessToken}`).expect(201);
    const correctOptionId = questionOptions.find((option) => option.text === '4')!.id;
    await request(runtimeHttp)
      .post('/api/v1/attempt/answer')
      .set('Authorization', `Bearer ${candidateAccessToken}`)
      .send({ questionId, selectedOptionIds: [correctOptionId] })
      .expect(201);
    await request(runtimeHttp).post('/api/v1/attempt/submit').set('Authorization', `Bearer ${candidateAccessToken}`).expect(201);
  });

  afterAll(async () => {
    await tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) =>
      tx.auditLog.deleteMany({ where: { organizationId: { in: [orgId, orgBId] } } }),
    );
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) => tx.exam.deleteMany({ where: { organizationId: orgId } }));
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) => tx.question.deleteMany({ where: { organizationId: orgId } }));
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) => tx.candidate.deleteMany({ where: { organizationId: orgId } }));
    await tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) =>
      tx.refreshToken.deleteMany({ where: { user: { organizationId: { in: [orgId, orgBId] } } } }),
    );
    await tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) =>
      tx.user.deleteMany({ where: { organizationId: { in: [orgId, orgBId] } } }),
    );
    await prisma.organization.deleteMany({ where: { id: { in: [orgId, orgBId] } } }).catch(() => undefined);
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await adminApp.close();
    await runtimeApp.close();
  });

  it('exports the candidate\'s full data footprint with real values', async () => {
    const exportResponse = await request(adminHttp)
      .get(`/api/v1/candidates/${candidateId}/export`)
      .set('Authorization', `Bearer ${orgAdminAccessToken}`)
      .expect(200);

    expect(exportResponse.body.candidate.email).toBe('gina@gdpr-a.test');
    expect(exportResponse.body.candidate.name).toBe('Gina GDPR');
    expect(exportResponse.body.candidate.phone).toBe('555-0100');
    expect(exportResponse.body.invitations).toHaveLength(1);
    expect(exportResponse.body.invitations[0].examTitle).toBe('GDPR Round');
    expect(exportResponse.body.attempts).toHaveLength(1);
    expect(exportResponse.body.attempts[0].result.score).toBe(5);
    expect(exportResponse.body.attempts[0].answers).toEqual([
      expect.objectContaining({ questionText: 'What is 2+2?', selectedOptions: ['4'], isCorrect: true }),
    ]);
  });

  it('rejects recruiter (no candidate:data_rights) with 403 on both endpoints', async () => {
    await request(adminHttp)
      .get(`/api/v1/candidates/${candidateId}/export`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(403);
    await request(adminHttp)
      .post(`/api/v1/candidates/${candidateId}/erase`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(403);
  });

  it('rejects another organization\'s admin with 404 on both endpoints', async () => {
    await request(adminHttp)
      .get(`/api/v1/candidates/${candidateId}/export`)
      .set('Authorization', `Bearer ${orgBAdminAccessToken}`)
      .expect(404);
    await request(adminHttp)
      .post(`/api/v1/candidates/${candidateId}/erase`)
      .set('Authorization', `Bearer ${orgBAdminAccessToken}`)
      .expect(404);
  });

  it('erases the candidate: PII scrubbed in the list view and in a re-export, scores intact', async () => {
    await request(adminHttp)
      .post(`/api/v1/candidates/${candidateId}/erase`)
      .set('Authorization', `Bearer ${orgAdminAccessToken}`)
      .expect(201);

    const listResponse = await request(adminHttp)
      .get('/api/v1/candidates')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(200);
    const erased = listResponse.body.find((row: { id: string }) => row.id === candidateId);
    expect(erased.name).toBe('Redacted');
    expect(erased.email).toBe(`erased-${candidateId}@redacted.invalid`);
    expect(erased.phone).toBeNull();

    const reExportResponse = await request(adminHttp)
      .get(`/api/v1/candidates/${candidateId}/export`)
      .set('Authorization', `Bearer ${orgAdminAccessToken}`)
      .expect(200);
    expect(reExportResponse.body.candidate.name).toBe('Redacted');
    expect(reExportResponse.body.candidate.email).toBe(`erased-${candidateId}@redacted.invalid`);
    // Anonymize-in-place: the attempt's score survives under the pseudonymous UUID.
    expect(reExportResponse.body.attempts[0].result.score).toBe(5);
    expect(reExportResponse.body.attempts[0].deviceFingerprint).toBeNull();
  });

  it('records both data-rights actions in the audit log', async () => {
    const auditResponse = await request(adminHttp)
      .get('/api/v1/audit-logs')
      .query({ entityType: 'candidate' })
      .set('Authorization', `Bearer ${orgAdminAccessToken}`)
      .expect(200);

    const actions = auditResponse.body.map((entry: { action: string }) => entry.action);
    expect(actions).toContain('candidate.data_exported');
    expect(actions).toContain('candidate.erased');
    const erasedEntry = auditResponse.body.find((entry: { action: string }) => entry.action === 'candidate.erased');
    expect(erasedEntry.entityId).toBe(candidateId);
    expect(erasedEntry.actorEmail).toBe('orgadmin@gdpr-a.test');
  });
});
```

- [ ] **Step 2: Run the new spec in isolation**

Run (with `DATABASE_URL` exported — value in `apps/api/.env`):
```bash
npm run test:api:e2e -- --testPathPattern=candidate-data-rights
```
Expected: PASS, 5/5.

- [ ] **Step 3: Run the full apps/api e2e suite**

Run: `npm run test:api:e2e -- --runInBand` (same `DATABASE_URL` export)
Expected: PASS — 19 suites (18 baseline + this one), 81/81 tests (76 baseline + 5 new). Jest exits cleanly on its own.

- [ ] **Step 4: Commit**

```bash
git add apps/api/test/candidate-data-rights.e2e-spec.ts
git commit -m "test: e2e coverage for GDPR candidate export and erasure

Full dual-app flow: a real candidate takes a real exam, then org_admin
exports (real name/answers/score visible), recruiter gets 403 on both
endpoints, a cross-org admin gets 404 on both, erasure scrubs the PII in
both the list view and a re-export while the score survives under the
pseudonymous UUID, and both candidate.data_exported/candidate.erased
entries surface through Phase 6c's GET /audit-logs with the acting
admin's email."
```

---

### Task 5: Final verification

**Files:** none modified — verification only.

**Interfaces:**
- Consumes: the fully wired export/erasure surface from Tasks 1-4.
- Produces: nothing (terminal task).

- [ ] **Step 1: Full clean install and build, both apps**

Run:
```bash
npm ci
npm run build --workspace=apps/api
npm run build --workspace=apps/exam-runtime
```
Expected: all exit 0 (the Prisma client regenerates automatically via `packages/shared`'s `prepare` script).

- [ ] **Step 2: Full unit suites**

Run: `npm run test:api`
Expected: PASS. (Baseline before this phase was 207/207 across 26 suites — expect it higher given Tasks 2-3's ~7 new tests; record the actual count.)

Run: `npm run test:exam-runtime`
Expected: PASS at 166/166 (19 suites) — this phase makes zero changes to apps/exam-runtime.

Run: `npm run test:shared`
Expected: PASS, 2/2, unaffected.

- [ ] **Step 3: Full apps/api e2e suite**

Run (with `DATABASE_URL` exported, value in `apps/api/.env`):
```bash
npm run test:api:e2e -- --runInBand
```
Expected: PASS — 19 suites, 81 tests (76 baseline + 5 from Task 4). Confirm Jest exits cleanly on its own (no hang, no `--forceExit`).

No live manual check is planned, per the approved spec's Testing & Verification Approach (Section 5, item 4): read/scrub endpoints over standard request handling; the e2e suite exercises the real end-to-end paths, including the audit-trail round trip.

- [ ] **Step 4: Record the result**

No code changes from this task. If Step 2 or Step 3 shows anything unexpected, stop and report — do not close out the phase with an unverified data-rights surface.
