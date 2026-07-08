# Phase 2a (Session Enforcement & Anti-Cheat Event Ingestion) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the "share your login with a friend" loophole by making single-active-session enforcement kill a candidate's old session live (not just on its next refresh), and give the system a durable place to record anti-cheat signals, with a recruiter-facing read endpoint and a force-submit admin override.

**Architecture:** `Invitation` gains a live "current session" pointer (`activeSessionFamilyId`) that `CandidateJwtStrategy` checks on every request — a bug in the old refresh-only revocation would leave a shared access token valid for its full 4-hour TTL, so this is a genuinely new enforcement point, not a refinement of Task 4's fix. A new `ProctoringEvent` table (no RLS of its own, same precedent as `Answer`/`Result`) records client-reported anti-cheat signals plus one system-generated `multi_login` event. A new staff-facing `AttemptsController`/`AttemptsAdminService` pair (distinct from the candidate-facing `AttemptController`, mirroring the plural/singular URL split the product spec already uses) exposes the recruiter-facing read and force-submit routes.

**Tech Stack:** Same as Phase 0/1a-1d — NestJS, Prisma (`sqlserver` provider), SQL Server, Jest/Supertest. No new npm dependencies.

## Global Constraints

- All primary keys and organization-scoping foreign keys are `@db.UniqueIdentifier` in Prisma — never a plain `String` with no native-type annotation.
- **`proctoring_events` has no `organization_id` column and no Row-Level Security policy of its own.** It is reached only through `Attempt` → `Invitation` → `Exam`, exactly like `Answer`/`Result` from Phase 1d. Every service method touching it must resolve ownership through that chain inside the same unit of work.
- **Severity is always server-computed from a fixed `eventType → severity` map, never accepted from the request body.** The DTO for the ingestion endpoint has no `severity` field at all — this is a security property (a candidate's own browser reports these events; it must never be able to self-declare its own severity), not a convenience default.
- **`multi_login` is system-generated only.** The ingestion endpoint's DTO validates `eventType` against the *client-reportable* enum, which deliberately excludes `multi_login` — a client sending it directly must be rejected with `400`.
- **Session-kill must be live, not refresh-only.** `CandidateJwtStrategy.validate()` must perform a DB check on every request comparing the token's `familyId` claim against `Invitation.activeSessionFamilyId` — this is what actually closes the sharing loophole within a single exam window, since the access token's own TTL (`CANDIDATE_ACCESS_TOKEN_TTL_SECONDS`, default 4 hours) would otherwise remain fully valid regardless of a newer login.
- **`CandidateAuthService.refresh()` and `logout()` require NO changes in this plan.** An old, killed session's refresh token is already marked `revokedAt` by the new redeem-time revocation logic, so any attempt to refresh it fails via the *existing* reuse-detection path built in Phase 1d. Do not add redundant logic there.
- **A missing device fingerprint never blocks anything.** It is an optional field on `POST /attempt/start`; if absent, the column stays `null` and nothing else changes. No validation requires its presence.
- Both new recruiter-facing routes (`GET /attempts/:id/proctoring-events`, `POST /attempts/:id/force-submit`) reuse the existing `exam:manage` permission — no new RBAC permission is introduced.
- `force-submit` must write an `AuditLog` entry via the existing `AuditService` (`action: 'attempt.force_submit'`) — the product spec calls this out explicitly as "admin override, audited."
- Migrations are applied with `npx prisma migrate deploy`, **never** `npx prisma migrate dev` (the `examapp_dev` database login lacks `CREATE DATABASE` permission needed for `migrate dev`'s shadow database). `migrate dev --create-only` reliably fails with a P3014 shadow-database permission error in this environment — hand-write the migration SQL instead.
- Every timestamp-style column default must use `DEFAULT GETUTCDATE()`, never `DEFAULT CURRENT_TIMESTAMP`.
- **Never edit an already-applied migration file's SQL text in place.** If a mistake needs fixing, write a NEW migration.
- Required (non-optional) `class-validator` DTO properties must use a definite-assignment assertion (`eventType!: string;`).
- **`CandidateJwtStrategy` gets a real unit test in this plan**, breaking with the earlier convention that Passport strategies aren't unit-tested — that convention held only while the strategy was a static payload check with no conditional logic. It now performs a live DB lookup and a security-critical comparison, which is exactly the kind of logic this project's test suite exists to protect.
- No new npm dependencies, no new infrastructure (no Redis, no WebSocket) — this sub-phase is deliberately backend-REST-only, deferring real-time infrastructure to Phase 2b.
- Full spec: `docs/superpowers/specs/2026-07-08-phase-2a-session-enforcement-anti-cheat-design.md`. Full prior context: `docs/superpowers/plans/2026-07-08-phase-1d-exam-taking-runtime.md`.

---

## File Structure

```
apps/api/
  prisma/
    schema.prisma                                        # Modify: Attempt.deviceFingerprint, Invitation.activeSessionFamilyId, add ProctoringEvent
    migrations/
      20260708120000_session_enforcement_anti_cheat/
        migration.sql                                     # Create: 2 column additions + proctoring_events table
  src/
    candidate-auth/
      candidate-auth.service.ts                           # Modify: redeem() session-kill logic, issueTokenPair() familyId claim
      candidate-auth.service.spec.ts                       # Modify: add session-kill tests
      candidate-jwt.strategy.ts                            # Modify: async validate() with live DB check
      candidate-jwt.strategy.spec.ts                       # Create: first test file for this strategy
    attempts/
      dto/
        start-attempt.dto.ts                               # Create: optional deviceFingerprint
        report-proctoring-event.dto.ts                     # Create: eventType (enum) + optional metadata
      proctoring-severity.ts                                # Create: pure function, eventType -> severity
      proctoring-severity.spec.ts                           # Create
      attempt.service.ts                                    # Modify: start() accepts dto, add reportProctoringEvent()
      attempt.service.spec.ts                               # Modify: update start() tests, add reportProctoringEvent tests
      attempt.controller.ts                                 # Modify: start() takes @Body(), add POST proctoring-event route
      attempts-admin.service.ts                             # Create: listProctoringEvents/forceSubmit (staff-facing)
      attempts-admin.service.spec.ts                        # Create
      attempts.controller.ts                                # Create: staff-facing, @Controller('attempts')
      attempt.module.ts                                     # Modify: register AttemptsController/AttemptsAdminService
    grading/
      attempt-settlement.service.ts                         # Modify: finalize()'s status param widens to include 'force_submitted'
  test/
    session-enforcement-anti-cheat.e2e-spec.ts              # Create
```

---

### Task 1: Schema for device fingerprint, active session tracking, and proctoring events

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260708120000_session_enforcement_anti_cheat/migration.sql`

**Interfaces:**
- Produces: `Attempt.deviceFingerprint: string | null`, `Invitation.activeSessionFamilyId: string | null`, Prisma model `ProctoringEvent` (fields: `id`, `attemptId`, `eventType`, `severity`, `occurredAt`, `metadataJson`, relation `attempt`) — every later task relies on these exact field names.

- [ ] **Step 1: Modify `Attempt` and `Invitation`, add `ProctoringEvent` to schema.prisma**

In `apps/api/prisma/schema.prisma`, add one field to `Attempt` (after `submittedAt`):
```prisma
model Attempt {
  id                String     @id @default(uuid()) @db.UniqueIdentifier
  invitationId      String     @unique @map("invitation_id") @db.UniqueIdentifier
  candidateId       String     @map("candidate_id") @db.UniqueIdentifier
  examId            String     @map("exam_id") @db.UniqueIdentifier
  status            String     @default("in_progress")
  questionOrderJson String     @map("question_order_json") @db.NVarChar(Max)
  startedAt         DateTime   @default(now()) @map("started_at")
  submittedAt       DateTime?  @map("submitted_at")
  deviceFingerprint String?    @map("device_fingerprint")
  invitation        Invitation @relation(fields: [invitationId], references: [id], onDelete: Cascade)
  answers           Answer[]
  result            Result?
  proctoringEvents  ProctoringEvent[]

  @@index([examId, status])
  @@map("attempts")
}
```

Add one field to `Invitation` (after `revokedAt`):
```prisma
model Invitation {
  id                     String                  @id @default(uuid()) @db.UniqueIdentifier
  examId                 String                  @map("exam_id") @db.UniqueIdentifier
  candidateId            String                  @map("candidate_id") @db.UniqueIdentifier
  token                  String                  @unique
  status                 String                  @default("invited")
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

Add a new model at the end of the file (after `CandidateRefreshToken`):
```prisma
model ProctoringEvent {
  id           String   @id @default(uuid()) @db.UniqueIdentifier
  attemptId    String   @map("attempt_id") @db.UniqueIdentifier
  eventType    String   @map("event_type")
  severity     String
  occurredAt   DateTime @default(now()) @map("occurred_at")
  metadataJson String?  @map("metadata_json") @db.NVarChar(Max)
  attempt      Attempt  @relation(fields: [attemptId], references: [id], onDelete: Cascade)

  @@index([attemptId, occurredAt])
  @@map("proctoring_events")
}
```

- [ ] **Step 2: Generate the migration**

Run (from `apps/api/`): `npx prisma migrate dev --create-only --name session_enforcement_anti_cheat`
Expected: fails with a P3014 shadow-database permission error, same as every prior schema task in this project. Hand-write the migration SQL directly (Step 3).

- [ ] **Step 3: Write the migration SQL by hand**

`apps/api/prisma/migrations/20260708120000_session_enforcement_anti_cheat/migration.sql`:
```sql
-- AlterTable: attempts gains an optional device fingerprint, recorded (not enforced) at start.
-- A missing fingerprint is never a validation error -- see this plan's Global Constraints.
ALTER TABLE [dbo].[attempts] ADD [device_fingerprint] NVARCHAR(1000);

-- AlterTable: invitations gains the currently-active session's refresh-token family id. Checked
-- live on every candidate request (CandidateJwtStrategy) so a newer redeem kills an older
-- session's access token immediately, not just on its next refresh attempt.
ALTER TABLE [dbo].[invitations] ADD [active_session_family_id] NVARCHAR(1000);

-- CreateTable
CREATE TABLE [dbo].[proctoring_events] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [attempt_id] UNIQUEIDENTIFIER NOT NULL,
    [event_type] NVARCHAR(1000) NOT NULL,
    [severity] NVARCHAR(1000) NOT NULL,
    [occurred_at] DATETIME2 NOT NULL CONSTRAINT [proctoring_events_occurred_at_df] DEFAULT GETUTCDATE(),
    [metadata_json] NVARCHAR(MAX),
    CONSTRAINT [proctoring_events_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [proctoring_events_attempt_id_occurred_at_idx] ON [dbo].[proctoring_events]([attempt_id], [occurred_at]);

-- AddForeignKey
ALTER TABLE [dbo].[proctoring_events] ADD CONSTRAINT [proctoring_events_attempt_id_fkey] FOREIGN KEY ([attempt_id]) REFERENCES [dbo].[attempts]([id]) ON DELETE CASCADE ON UPDATE CASCADE;
```

Note: `proctoring_events` gets no RLS policy — same reasoning as `answers`/`results` from Phase 1d: it is always reached through the RLS-protected `Attempt` → `Invitation` → `Exam` chain, never queried standalone by an unverified id.

- [ ] **Step 4: Apply the migration**

Run: `npx prisma migrate deploy` (never `migrate dev` for applying), then `npx prisma generate`.
Expected: migration applies cleanly; `@prisma/client` types now include `ProctoringEvent`, `Attempt.deviceFingerprint`, `Invitation.activeSessionFamilyId`.

- [ ] **Step 5: Verify against the real database**

Run: `sqlcmd -S localhost,1433 -U examapp_dev -P 'DevPassw0rd!2026' -d examapp -Q "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'proctoring_events'" -C`
Expected: one row returned.

Run: `sqlcmd -S localhost,1433 -U examapp_dev -P 'DevPassw0rd!2026' -d examapp -Q "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='invitations' AND COLUMN_NAME='active_session_family_id'" -C`
Expected: one row returned.

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat: add device fingerprint, active session tracking, and proctoring events schema"
```

---

### Task 2: CandidateAuthService session-kill logic

**Files:**
- Modify: `apps/api/src/candidate-auth/candidate-auth.service.ts`
- Modify: `apps/api/src/candidate-auth/candidate-auth.service.spec.ts`

**Interfaces:**
- Produces: `CandidateAuthService.redeem()`'s behavior now also revokes any prior active session and sets `Invitation.activeSessionFamilyId`; `issueTokenPair()`'s access token payload now includes `familyId` — Task 3's `CandidateJwtStrategy` relies on this claim existing.

- [ ] **Step 1: Write the failing tests**

In `apps/api/src/candidate-auth/candidate-auth.service.spec.ts`, add `attempt: { findUnique: jest.Mock }`, `proctoringEvent: { create: jest.Mock }`, and `invitation: { findUnique: jest.Mock, update: jest.Mock }` to the `prisma` mock shape in `beforeEach` (the object literal already has `invitation: { findUnique: jest.fn() }` — extend it to also include `update: jest.fn()`, and add the two new top-level keys):

```typescript
  let prisma: {
    invitation: { findUnique: jest.Mock; update: jest.Mock };
    candidateRefreshToken: { findFirst: jest.Mock; create: jest.Mock; update: jest.Mock; updateMany: jest.Mock };
    attempt: { findUnique: jest.Mock };
    proctoringEvent: { create: jest.Mock };
  };
```
```typescript
    prisma = {
      invitation: { findUnique: jest.fn(), update: jest.fn() },
      candidateRefreshToken: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
      attempt: { findUnique: jest.fn() },
      proctoringEvent: { create: jest.fn() },
    };
```

Then add these tests inside the existing `describe('redeem', ...)` block, after the `"issues a candidate access and refresh token pair..."` test:

```typescript
    it('sets activeSessionFamilyId on a first-ever redeem with nothing to revoke', async () => {
      prisma.invitation.findUnique.mockResolvedValue({
        id: 'inv-1', status: 'invited', expiresAt: new Date(Date.now() + 86_400_000), examId: 'exam-1', activeSessionFamilyId: null,
      });
      tenantPrisma.forTenant.mockResolvedValue({ id: 'exam-1', status: 'published' });
      prisma.candidateRefreshToken.create.mockResolvedValue({});
      prisma.invitation.update.mockResolvedValue({});

      await service.redeem('token');

      expect(prisma.candidateRefreshToken.updateMany).not.toHaveBeenCalled();
      expect(prisma.proctoringEvent.create).not.toHaveBeenCalled();
      expect(prisma.invitation.update).toHaveBeenCalledWith({
        where: { id: 'inv-1' },
        data: { activeSessionFamilyId: expect.any(String) },
      });
    });

    it('revokes the prior active session family on a second redeem, without logging an event when no attempt exists yet', async () => {
      prisma.invitation.findUnique.mockResolvedValue({
        id: 'inv-1', status: 'invited', expiresAt: new Date(Date.now() + 86_400_000), examId: 'exam-1', activeSessionFamilyId: 'old-family',
      });
      tenantPrisma.forTenant.mockResolvedValue({ id: 'exam-1', status: 'published' });
      prisma.candidateRefreshToken.updateMany.mockResolvedValue({});
      prisma.attempt.findUnique.mockResolvedValue(null);
      prisma.candidateRefreshToken.create.mockResolvedValue({});
      prisma.invitation.update.mockResolvedValue({});

      await service.redeem('token');

      expect(prisma.candidateRefreshToken.updateMany).toHaveBeenCalledWith({
        where: { invitationId: 'inv-1', familyId: 'old-family' },
        data: { revokedAt: expect.any(Date) },
      });
      expect(prisma.proctoringEvent.create).not.toHaveBeenCalled();
    });

    it('logs a multi_login proctoring event when a prior session is kicked and an attempt already exists', async () => {
      prisma.invitation.findUnique.mockResolvedValue({
        id: 'inv-1', status: 'invited', expiresAt: new Date(Date.now() + 86_400_000), examId: 'exam-1', activeSessionFamilyId: 'old-family',
      });
      tenantPrisma.forTenant.mockResolvedValue({ id: 'exam-1', status: 'published' });
      prisma.candidateRefreshToken.updateMany.mockResolvedValue({});
      prisma.attempt.findUnique.mockResolvedValue({ id: 'attempt-1' });
      prisma.proctoringEvent.create.mockResolvedValue({});
      prisma.candidateRefreshToken.create.mockResolvedValue({});
      prisma.invitation.update.mockResolvedValue({});

      await service.redeem('token');

      expect(prisma.proctoringEvent.create).toHaveBeenCalledWith({
        data: { attemptId: 'attempt-1', eventType: 'multi_login', severity: 'high' },
      });
    });

    it('includes a familyId claim in the issued access token', async () => {
      prisma.invitation.findUnique.mockResolvedValue({
        id: 'inv-1', status: 'invited', expiresAt: new Date(Date.now() + 86_400_000), examId: 'exam-1', activeSessionFamilyId: null,
      });
      tenantPrisma.forTenant.mockResolvedValue({ id: 'exam-1', status: 'published' });
      prisma.candidateRefreshToken.create.mockResolvedValue({});
      prisma.invitation.update.mockResolvedValue({});

      const result = await service.redeem('token');

      const decoded = jwt.decode(result.accessToken) as { familyId: string };
      expect(decoded.familyId).toEqual(expect.any(String));
    });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:api -- candidate-auth.service`
Expected: FAIL — `prisma.invitation.update`/`prisma.attempt.findUnique`/`prisma.proctoringEvent.create` are never called yet, and the access token has no `familyId` claim.

- [ ] **Step 3: Implement the session-kill logic**

In `apps/api/src/candidate-auth/candidate-auth.service.ts`, replace the `redeem` method:
```typescript
  async redeem(token: string): Promise<CandidateTokenPair> {
    const invitation = await this.prisma.invitation.findUnique({ where: { token } });
    if (!invitation) {
      throw new NotFoundException('This invitation link is invalid');
    }
    if (invitation.status === 'revoked') {
      throw new BadRequestException('This invitation was revoked');
    }
    if (invitation.expiresAt < new Date()) {
      throw new BadRequestException('This invitation has expired');
    }

    const exam = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) =>
      tx.exam.findUniqueOrThrow({ where: { id: invitation.examId } }),
    );
    if (exam.status !== 'published') {
      throw new BadRequestException('This exam is not currently available');
    }

    if (invitation.activeSessionFamilyId) {
      await this.prisma.candidateRefreshToken.updateMany({
        where: { invitationId: invitation.id, familyId: invitation.activeSessionFamilyId },
        data: { revokedAt: new Date() },
      });
      const existingAttempt = await this.prisma.attempt.findUnique({ where: { invitationId: invitation.id } });
      if (existingAttempt) {
        await this.prisma.proctoringEvent.create({
          data: { attemptId: existingAttempt.id, eventType: 'multi_login', severity: 'high' },
        });
      }
    }

    const familyId = randomUUID();
    const tokens = await this.issueTokenPair(invitation.id, familyId);
    await this.prisma.invitation.update({ where: { id: invitation.id }, data: { activeSessionFamilyId: familyId } });
    return tokens;
  }
```

Replace the `issueTokenPair` method's access token signing line to add the `familyId` claim:
```typescript
  private async issueTokenPair(invitationId: string, familyId: string = randomUUID()): Promise<CandidateTokenPair> {
    const accessToken = this.jwt.sign(
      { sub: invitationId, subjectType: 'candidate', familyId },
      { secret: process.env.CANDIDATE_JWT_ACCESS_SECRET, expiresIn: `${process.env.CANDIDATE_ACCESS_TOKEN_TTL_SECONDS ?? 14400}s` },
    );
    const refreshToken = this.jwt.sign(
      { sub: invitationId, familyId },
      { secret: process.env.CANDIDATE_JWT_REFRESH_SECRET, expiresIn: `${process.env.CANDIDATE_REFRESH_TOKEN_TTL_DAYS ?? 1}d` },
    );
    const tokenHash = await argon2.hash(refreshToken);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + Number(process.env.CANDIDATE_REFRESH_TOKEN_TTL_DAYS ?? 1));

    await this.prisma.candidateRefreshToken.create({ data: { invitationId, tokenHash, familyId, expiresAt } });

    return { accessToken, refreshToken };
  }
```

No other method in this file changes — `refresh()` and `logout()` are untouched, per this plan's Global Constraints.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:api -- candidate-auth.service`
Expected: `14 passed` (10 existing + 4 new).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/candidate-auth/candidate-auth.service.ts apps/api/src/candidate-auth/candidate-auth.service.spec.ts
git commit -m "feat: revoke prior session and log multi_login on redeem, add familyId claim to access tokens"
```

---

### Task 3: CandidateJwtStrategy live session validation

**Files:**
- Modify: `apps/api/src/candidate-auth/candidate-jwt.strategy.ts`
- Create: `apps/api/src/candidate-auth/candidate-jwt.strategy.spec.ts`

**Interfaces:**
- Consumes: `PrismaService` (Phase 0, raw — `invitations` has no RLS), `Invitation.activeSessionFamilyId` (Task 1).
- Produces: `CandidateJwtStrategy.validate(payload)` now async, throws `UnauthorizedException` on a stale/mismatched session — every request through `CandidateJwtAuthGuard` (both `AttemptController` and the new `AttemptsController` do NOT use this guard — only candidate-facing routes do) is now subject to this live check.

- [ ] **Step 1: Write the failing tests**

`apps/api/src/candidate-auth/candidate-jwt.strategy.spec.ts`:
```typescript
import { Test } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { CandidateJwtStrategy } from './candidate-jwt.strategy';
import { PrismaService } from '../prisma/prisma.service';

describe('CandidateJwtStrategy', () => {
  let strategy: CandidateJwtStrategy;
  let prisma: { invitation: { findUnique: jest.Mock } };

  beforeEach(async () => {
    prisma = { invitation: { findUnique: jest.fn() } };
    process.env.CANDIDATE_JWT_ACCESS_SECRET = 'test-candidate-access-secret';

    const moduleRef = await Test.createTestingModule({
      providers: [CandidateJwtStrategy, { provide: PrismaService, useValue: prisma }],
    }).compile();
    strategy = moduleRef.get(CandidateJwtStrategy);
  });

  it('throws UnauthorizedException when subjectType is not candidate', async () => {
    await expect(
      strategy.validate({ sub: 'inv-1', subjectType: 'staff' as never, familyId: 'family-1' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException when the invitation no longer exists', async () => {
    prisma.invitation.findUnique.mockResolvedValue(null);

    await expect(
      strategy.validate({ sub: 'inv-1', subjectType: 'candidate', familyId: 'family-1' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException when the token family no longer matches the invitation active session', async () => {
    prisma.invitation.findUnique.mockResolvedValue({ activeSessionFamilyId: 'family-old' });

    await expect(
      strategy.validate({ sub: 'inv-1', subjectType: 'candidate', familyId: 'family-new' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('returns the invitation id when the family matches the current active session', async () => {
    prisma.invitation.findUnique.mockResolvedValue({ activeSessionFamilyId: 'family-1' });

    const result = await strategy.validate({ sub: 'inv-1', subjectType: 'candidate', familyId: 'family-1' });

    expect(result).toEqual({ invitationId: 'inv-1' });
    expect(prisma.invitation.findUnique).toHaveBeenCalledWith({
      where: { id: 'inv-1' },
      select: { activeSessionFamilyId: true },
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:api -- candidate-jwt.strategy`
Expected: FAIL — `validate` does not accept a `familyId` field and never queries Prisma yet.

- [ ] **Step 3: Implement the live validation**

`apps/api/src/candidate-auth/candidate-jwt.strategy.ts`:
```typescript
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';

export interface CandidateJwtPayload {
  sub: string;
  subjectType: 'candidate';
  familyId: string;
}

@Injectable()
export class CandidateJwtStrategy extends PassportStrategy(Strategy, 'candidate-jwt') {
  constructor(private readonly prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.CANDIDATE_JWT_ACCESS_SECRET,
    });
  }

  async validate(payload: CandidateJwtPayload) {
    if (payload.subjectType !== 'candidate') {
      throw new UnauthorizedException('Invalid token subject type');
    }
    const invitation = await this.prisma.invitation.findUnique({
      where: { id: payload.sub },
      select: { activeSessionFamilyId: true },
    });
    if (!invitation || invitation.activeSessionFamilyId !== payload.familyId) {
      throw new UnauthorizedException('This session has been replaced by a newer login');
    }
    return { invitationId: payload.sub };
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:api -- candidate-jwt.strategy`
Expected: `4 passed`.

Run: `npm run test:api` (from repo root)
Expected: all suites passing, no regressions.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/candidate-auth/candidate-jwt.strategy.ts apps/api/src/candidate-auth/candidate-jwt.strategy.spec.ts
git commit -m "feat: live per-request session validation in CandidateJwtStrategy"
```

---

### Task 4: Device fingerprint capture on attempt start

**Files:**
- Create: `apps/api/src/attempts/dto/start-attempt.dto.ts`
- Modify: `apps/api/src/attempts/attempt.service.ts`
- Modify: `apps/api/src/attempts/attempt.service.spec.ts`
- Modify: `apps/api/src/attempts/attempt.controller.ts`

**Interfaces:**
- Produces: `AttemptService.start(session, dto?: StartAttemptDto)` — `dto` is optional (defaults to `{}`), so no existing call site breaks.

- [ ] **Step 1: Write the DTO**

`apps/api/src/attempts/dto/start-attempt.dto.ts`:
```typescript
import { IsOptional, IsString } from 'class-validator';

export class StartAttemptDto {
  @IsOptional()
  @IsString()
  deviceFingerprint?: string;
}
```

- [ ] **Step 2: Write the failing tests**

In `apps/api/src/attempts/attempt.service.spec.ts`, update the existing `"creates a new attempt snapshotting the question order when none exists"` test's assertion to include the new field (it will now always be present, `undefined` when not provided):
```typescript
      expect(tx.attempt.create).toHaveBeenCalledWith({
        data: { invitationId: 'inv-1', candidateId: 'cand-1', examId: 'exam-1', questionOrderJson: JSON.stringify(['q1', 'q2']), deviceFingerprint: undefined },
      });
```

Add a new test directly after it, inside the `describe('start', ...)` block:
```typescript
    it('records a device fingerprint on the attempt when the client provides one', async () => {
      const tx = {
        attempt: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'attempt-1', status: 'in_progress' }) },
        examSection: { findMany: jest.fn().mockResolvedValue([{ questions: [{ questionId: 'q1' }] }]) },
      };
      mockBootstrapThenScoped(tx);

      await service.start(session, { deviceFingerprint: 'fp-abc123' });

      expect(tx.attempt.create).toHaveBeenCalledWith({
        data: { invitationId: 'inv-1', candidateId: 'cand-1', examId: 'exam-1', questionOrderJson: JSON.stringify(['q1']), deviceFingerprint: 'fp-abc123' },
      });
    });
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm run test:api -- attempt.service`
Expected: FAIL — `tx.attempt.create` is called without `deviceFingerprint` in its data.

- [ ] **Step 4: Implement**

In `apps/api/src/attempts/attempt.service.ts`, add the import:
```typescript
import { StartAttemptDto } from './dto/start-attempt.dto';
```

Replace the `start` method:
```typescript
  async start(session: CandidateSession, dto: StartAttemptDto = {}): Promise<{ id: string; status: string }> {
    const { organizationId, exam, invitation } = await this.resolveContext(session.invitationId);

    return this.tenantPrisma.forTenant({ organizationId, isSuperAdmin: false }, async (tx) => {
      const existing = await tx.attempt.findUnique({ where: { invitationId: invitation.id } });
      if (existing) {
        return { id: existing.id, status: existing.status };
      }

      const sections = await tx.examSection.findMany({
        where: { examId: exam.id },
        orderBy: { orderIndex: 'asc' },
        include: { questions: { orderBy: { orderIndex: 'asc' } } },
      });
      const questionIds = sections.flatMap((section) => section.questions.map((link) => link.questionId));

      const attempt = await tx.attempt.create({
        data: {
          invitationId: invitation.id,
          candidateId: invitation.candidateId,
          examId: exam.id,
          questionOrderJson: JSON.stringify(questionIds),
          deviceFingerprint: dto.deviceFingerprint,
        },
      });
      return { id: attempt.id, status: attempt.status };
    });
  }
```

In `apps/api/src/attempts/attempt.controller.ts`, add the import and update the `start` route:
```typescript
import { StartAttemptDto } from './dto/start-attempt.dto';
```
```typescript
  @Post('start')
  start(@CurrentCandidate() candidate: CandidateSession, @Body() dto: StartAttemptDto) {
    return this.attemptService.start(candidate, dto);
  }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test:api -- attempt.service`
Expected: `19 passed` (18 existing + 1 new).

Run: `npm run test:api` (from repo root)
Expected: all suites passing.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/attempts/dto/start-attempt.dto.ts apps/api/src/attempts/attempt.service.ts apps/api/src/attempts/attempt.service.spec.ts apps/api/src/attempts/attempt.controller.ts
git commit -m "feat: capture optional device fingerprint on attempt start"
```

---

### Task 5: Proctoring event severity map

**Files:**
- Create: `apps/api/src/attempts/proctoring-severity.ts`
- Create: `apps/api/src/attempts/proctoring-severity.spec.ts`

**Interfaces:**
- Produces: `CLIENT_REPORTABLE_EVENT_TYPES: readonly string[]`, `getProctoringEventSeverity(eventType: string): 'low' | 'medium' | 'high'` — Task 6's `ReportProctoringEventDto` and `AttemptService.reportProctoringEvent` consume these exact names.

- [ ] **Step 1: Write the failing tests**

`apps/api/src/attempts/proctoring-severity.spec.ts`:
```typescript
import { CLIENT_REPORTABLE_EVENT_TYPES, getProctoringEventSeverity } from './proctoring-severity';

describe('CLIENT_REPORTABLE_EVENT_TYPES', () => {
  it('does not include multi_login (system-generated only)', () => {
    expect(CLIENT_REPORTABLE_EVENT_TYPES).not.toContain('multi_login');
  });

  it('includes every browser-level anti-cheat event from the product spec', () => {
    expect(CLIENT_REPORTABLE_EVENT_TYPES).toEqual(
      expect.arrayContaining(['tab_switch', 'fullscreen_exit', 'copy_paste', 'right_click', 'dev_tools_detected', 'refresh_warning', 'idle_timeout']),
    );
  });
});

describe('getProctoringEventSeverity', () => {
  it('maps dev_tools_detected to high', () => {
    expect(getProctoringEventSeverity('dev_tools_detected')).toBe('high');
  });

  it('maps multi_login to high', () => {
    expect(getProctoringEventSeverity('multi_login')).toBe('high');
  });

  it('maps tab_switch to medium', () => {
    expect(getProctoringEventSeverity('tab_switch')).toBe('medium');
  });

  it('maps fullscreen_exit to medium', () => {
    expect(getProctoringEventSeverity('fullscreen_exit')).toBe('medium');
  });

  it('maps copy_paste to medium', () => {
    expect(getProctoringEventSeverity('copy_paste')).toBe('medium');
  });

  it('maps right_click to low', () => {
    expect(getProctoringEventSeverity('right_click')).toBe('low');
  });

  it('maps refresh_warning to low', () => {
    expect(getProctoringEventSeverity('refresh_warning')).toBe('low');
  });

  it('maps idle_timeout to low', () => {
    expect(getProctoringEventSeverity('idle_timeout')).toBe('low');
  });

  it('defaults an unrecognized event type to low rather than throwing', () => {
    expect(getProctoringEventSeverity('something_unmapped')).toBe('low');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:api -- proctoring-severity`
Expected: FAIL — the module does not exist yet.

- [ ] **Step 3: Implement**

`apps/api/src/attempts/proctoring-severity.ts`:
```typescript
export const CLIENT_REPORTABLE_EVENT_TYPES = [
  'tab_switch',
  'fullscreen_exit',
  'copy_paste',
  'right_click',
  'dev_tools_detected',
  'refresh_warning',
  'idle_timeout',
] as const;

type Severity = 'low' | 'medium' | 'high';

const SEVERITY_BY_EVENT_TYPE: Record<string, Severity> = {
  dev_tools_detected: 'high',
  multi_login: 'high',
  tab_switch: 'medium',
  fullscreen_exit: 'medium',
  copy_paste: 'medium',
  right_click: 'low',
  refresh_warning: 'low',
  idle_timeout: 'low',
};

export function getProctoringEventSeverity(eventType: string): Severity {
  return SEVERITY_BY_EVENT_TYPE[eventType] ?? 'low';
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:api -- proctoring-severity`
Expected: `11 passed`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/attempts/proctoring-severity.ts apps/api/src/attempts/proctoring-severity.spec.ts
git commit -m "feat: add server-side proctoring event severity map"
```

---

### Task 6: Proctoring-event ingestion endpoint

**Files:**
- Create: `apps/api/src/attempts/dto/report-proctoring-event.dto.ts`
- Modify: `apps/api/src/attempts/attempt.service.ts`
- Modify: `apps/api/src/attempts/attempt.service.spec.ts`
- Modify: `apps/api/src/attempts/attempt.controller.ts`

**Interfaces:**
- Consumes: `CLIENT_REPORTABLE_EVENT_TYPES`, `getProctoringEventSeverity` (Task 5, exact names).
- Produces: `AttemptService.reportProctoringEvent(session, dto): Promise<{ id: string; eventType: string; severity: string }>`, `POST /attempt/proctoring-event`.

- [ ] **Step 1: Write the DTO**

`apps/api/src/attempts/dto/report-proctoring-event.dto.ts`:
```typescript
import { IsIn, IsObject, IsOptional } from 'class-validator';
import { CLIENT_REPORTABLE_EVENT_TYPES } from '../proctoring-severity';

export class ReportProctoringEventDto {
  @IsIn(CLIENT_REPORTABLE_EVENT_TYPES)
  eventType!: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
```

- [ ] **Step 2: Write the failing tests**

In `apps/api/src/attempts/attempt.service.spec.ts`, add the import and a new `describe` block at the end of the file, just before the final closing `});`:
```typescript
import { getProctoringEventSeverity } from './proctoring-severity';
```
```typescript
  describe('reportProctoringEvent', () => {
    it('creates a proctoring event with server-computed severity', async () => {
      const tx = { attempt: { findUnique: jest.fn().mockResolvedValue({ id: 'attempt-1' }) }, proctoringEvent: { create: jest.fn().mockResolvedValue({ id: 'evt-1', eventType: 'tab_switch', severity: 'medium' }) } };
      mockBootstrapThenScoped(tx);

      const result = await service.reportProctoringEvent(session, { eventType: 'tab_switch' });

      expect(result).toEqual({ id: 'evt-1', eventType: 'tab_switch', severity: 'medium' });
      expect(tx.proctoringEvent.create).toHaveBeenCalledWith({
        data: { attemptId: 'attempt-1', eventType: 'tab_switch', severity: getProctoringEventSeverity('tab_switch'), metadataJson: null },
      });
    });

    it('serializes optional metadata to JSON', async () => {
      const tx = { attempt: { findUnique: jest.fn().mockResolvedValue({ id: 'attempt-1' }) }, proctoringEvent: { create: jest.fn().mockResolvedValue({}) } };
      mockBootstrapThenScoped(tx);

      await service.reportProctoringEvent(session, { eventType: 'idle_timeout', metadata: { idleSeconds: 45 } });

      expect(tx.proctoringEvent.create).toHaveBeenCalledWith({
        data: { attemptId: 'attempt-1', eventType: 'idle_timeout', severity: 'low', metadataJson: JSON.stringify({ idleSeconds: 45 }) },
      });
    });

    it('throws NotFoundException when no attempt has been started', async () => {
      const tx = { attempt: { findUnique: jest.fn().mockResolvedValue(null) } };
      mockBootstrapThenScoped(tx);

      await expect(service.reportProctoringEvent(session, { eventType: 'tab_switch' })).rejects.toThrow(NotFoundException);
    });
  });
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm run test:api -- attempt.service`
Expected: FAIL — `service.reportProctoringEvent` is not a function yet.

- [ ] **Step 4: Implement**

In `apps/api/src/attempts/attempt.service.ts`, add the imports:
```typescript
import { getProctoringEventSeverity } from './proctoring-severity';
import { ReportProctoringEventDto } from './dto/report-proctoring-event.dto';
```

Add the method, placed after `answer`:
```typescript
  async reportProctoringEvent(
    session: CandidateSession,
    dto: ReportProctoringEventDto,
  ): Promise<{ id: string; eventType: string; severity: string }> {
    const { organizationId, invitation } = await this.resolveContext(session.invitationId);

    return this.tenantPrisma.forTenant({ organizationId, isSuperAdmin: false }, async (tx) => {
      const attempt = await tx.attempt.findUnique({ where: { invitationId: invitation.id } });
      if (!attempt) {
        throw new NotFoundException('No attempt has been started');
      }

      const event = await tx.proctoringEvent.create({
        data: {
          attemptId: attempt.id,
          eventType: dto.eventType,
          severity: getProctoringEventSeverity(dto.eventType),
          metadataJson: dto.metadata ? JSON.stringify(dto.metadata) : null,
        },
      });
      return { id: event.id, eventType: event.eventType, severity: event.severity };
    });
  }
```

In `apps/api/src/attempts/attempt.controller.ts`, add the import and the new route:
```typescript
import { ReportProctoringEventDto } from './dto/report-proctoring-event.dto';
```
```typescript
  @Post('proctoring-event')
  reportProctoringEvent(@CurrentCandidate() candidate: CandidateSession, @Body() dto: ReportProctoringEventDto) {
    return this.attemptService.reportProctoringEvent(candidate, dto);
  }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test:api -- attempt.service`
Expected: `22 passed` (19 existing + 3 new).

Run: `npm run test:api` (from repo root)
Expected: all suites passing.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/attempts/dto/report-proctoring-event.dto.ts apps/api/src/attempts/attempt.service.ts apps/api/src/attempts/attempt.service.spec.ts apps/api/src/attempts/attempt.controller.ts
git commit -m "feat: add candidate-facing proctoring event ingestion endpoint"
```

---

### Task 7: Staff-facing proctoring-events read and force-submit

**Files:**
- Modify: `apps/api/src/grading/attempt-settlement.service.ts`
- Create: `apps/api/src/attempts/attempts-admin.service.ts`
- Create: `apps/api/src/attempts/attempts-admin.service.spec.ts`
- Create: `apps/api/src/attempts/attempts.controller.ts`
- Modify: `apps/api/src/attempts/attempt.module.ts`

**Interfaces:**
- Consumes: `AttemptSettlementService.finalize` (Task 3 of Phase 1d, signature widened here), `AuditService.record` (Phase 0, exact signature `record(context: TenantContext, entry: { actorUserId, action, entityType, entityId?, metadata? })`).
- Produces: `AttemptsAdminService.listProctoringEvents(context, attemptId): Promise<ProctoringEvent[]>`, `.forceSubmit(context, attemptId, actorUserId): Promise<{ status: string }>`; HTTP routes `GET /attempts/:id/proctoring-events`, `POST /attempts/:id/force-submit`, both gated by the existing `exam:manage` permission on a new `AttemptsController` (staff-facing, plural, distinct from the candidate-facing singular `AttemptController`).

- [ ] **Step 1: Widen `AttemptSettlementService.finalize`'s status type**

In `apps/api/src/grading/attempt-settlement.service.ts`, change the `finalize` method's signature:
```typescript
  async finalize(
    tx: Prisma.TransactionClient,
    exam: SettlementExam,
    attempt: Attempt,
    status: 'submitted' | 'auto_submitted' | 'force_submitted',
  ): Promise<Attempt> {
```
No other change to this file — the method body already writes whatever `status` string it's given, so no behavioral change, only a wider accepted type. Run `npm run test:api -- attempt-settlement` to confirm the existing 6 tests still pass unaffected (they don't test this parameter's type, only its runtime behavior).

- [ ] **Step 2: Write the failing tests for AttemptsAdminService**

`apps/api/src/attempts/attempts-admin.service.spec.ts`:
```typescript
import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AttemptsAdminService } from './attempts-admin.service';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { AttemptSettlementService } from '../grading/attempt-settlement.service';
import { AuditService } from '../audit/audit.service';

describe('AttemptsAdminService', () => {
  let service: AttemptsAdminService;
  let tenantPrisma: { forTenant: jest.Mock };
  let attemptSettlement: { finalize: jest.Mock };
  let audit: { record: jest.Mock };
  const context = { organizationId: 'org-1', isSuperAdmin: false };

  beforeEach(async () => {
    tenantPrisma = { forTenant: jest.fn() };
    attemptSettlement = { finalize: jest.fn() };
    audit = { record: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        AttemptsAdminService,
        { provide: TenantPrismaService, useValue: tenantPrisma },
        { provide: AttemptSettlementService, useValue: attemptSettlement },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    service = moduleRef.get(AttemptsAdminService);
  });

  describe('listProctoringEvents', () => {
    it('returns proctoring events for an attempt owned by the caller organization', async () => {
      const tx = {
        attempt: { findFirst: jest.fn().mockResolvedValue({ id: 'attempt-1' }) },
        proctoringEvent: { findMany: jest.fn().mockResolvedValue([{ id: 'evt-1' }]) },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.listProctoringEvents(context, 'attempt-1');

      expect(result).toEqual([{ id: 'evt-1' }]);
      expect(tx.attempt.findFirst).toHaveBeenCalledWith({
        where: { id: 'attempt-1', invitation: { exam: { organizationId: 'org-1' } } },
      });
      expect(tx.proctoringEvent.findMany).toHaveBeenCalledWith({
        where: { attemptId: 'attempt-1' },
        orderBy: { occurredAt: 'asc' },
      });
    });

    it('throws NotFoundException when the attempt does not belong to the caller organization', async () => {
      const tx = { attempt: { findFirst: jest.fn().mockResolvedValue(null) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.listProctoringEvents(context, 'attempt-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('forceSubmit', () => {
    const exam = { id: 'exam-1', durationMinutes: 60, passCriteriaPercent: 40 };
    const attempt = { id: 'attempt-1', status: 'in_progress', invitation: { exam } };

    it('finalizes an in-progress attempt as force_submitted and writes an audit log', async () => {
      const tx = { attempt: { findFirst: jest.fn().mockResolvedValue(attempt) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));
      attemptSettlement.finalize.mockResolvedValue({ id: 'attempt-1', status: 'force_submitted' });

      const result = await service.forceSubmit(context, 'attempt-1', 'user-1');

      expect(result).toEqual({ status: 'force_submitted' });
      expect(attemptSettlement.finalize).toHaveBeenCalledWith(tx, exam, attempt, 'force_submitted');
      expect(audit.record).toHaveBeenCalledWith(context, {
        actorUserId: 'user-1',
        action: 'attempt.force_submit',
        entityType: 'attempt',
        entityId: 'attempt-1',
      });
    });

    it('throws BadRequestException when the attempt is not in_progress', async () => {
      const tx = { attempt: { findFirst: jest.fn().mockResolvedValue({ ...attempt, status: 'submitted' }) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.forceSubmit(context, 'attempt-1', 'user-1')).rejects.toThrow(BadRequestException);
      expect(attemptSettlement.finalize).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the attempt does not belong to the caller organization', async () => {
      const tx = { attempt: { findFirst: jest.fn().mockResolvedValue(null) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.forceSubmit(context, 'attempt-1', 'user-1')).rejects.toThrow(NotFoundException);
    });
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm run test:api -- attempts-admin.service`
Expected: FAIL — `AttemptsAdminService` is not defined yet.

- [ ] **Step 4: Implement the service**

`apps/api/src/attempts/attempts-admin.service.ts`:
```typescript
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ProctoringEvent } from '@prisma/client';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { TenantContext } from '../prisma/tenant-context';
import { AttemptSettlementService } from '../grading/attempt-settlement.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class AttemptsAdminService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly attemptSettlement: AttemptSettlementService,
    private readonly audit: AuditService,
  ) {}

  async listProctoringEvents(context: TenantContext, attemptId: string): Promise<ProctoringEvent[]> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const attempt = await tx.attempt.findFirst({
        where: { id: attemptId, invitation: { exam: { organizationId: context.organizationId as string } } },
      });
      if (!attempt) {
        throw new NotFoundException(`Attempt ${attemptId} not found`);
      }
      return tx.proctoringEvent.findMany({ where: { attemptId }, orderBy: { occurredAt: 'asc' } });
    });
  }

  async forceSubmit(context: TenantContext, attemptId: string, actorUserId: string): Promise<{ status: string }> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const attempt = await tx.attempt.findFirst({
        where: { id: attemptId, invitation: { exam: { organizationId: context.organizationId as string } } },
        include: { invitation: { include: { exam: true } } },
      });
      if (!attempt) {
        throw new NotFoundException(`Attempt ${attemptId} not found`);
      }
      if (attempt.status !== 'in_progress') {
        throw new BadRequestException(`Attempt ${attemptId} cannot be force-submitted from status "${attempt.status}"`);
      }

      const exam = attempt.invitation.exam;
      const finalized = await this.attemptSettlement.finalize(tx, exam, attempt, 'force_submitted');

      await this.audit.record(context, {
        actorUserId,
        action: 'attempt.force_submit',
        entityType: 'attempt',
        entityId: attemptId,
      });

      return { status: finalized.status };
    });
  }
}
```

Note: `attempt.invitation.exam.organizationId` in the `where` clause is a nested-relation filter — Prisma translates this to a JOIN, the same pattern 1c's `InvitationsService.resend`/`revoke` already used (`exam: { organizationId: ... }`) to resolve ownership for a bare `:id` route with no parent id in the URL.

- [ ] **Step 5: Write the controller**

`apps/api/src/attempts/attempts.controller.ts`:
```typescript
import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { TenantContext } from '../prisma/tenant-context';
import { AttemptsAdminService } from './attempts-admin.service';

@Controller('attempts')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AttemptsController {
  constructor(private readonly attemptsAdminService: AttemptsAdminService) {}

  @Get(':id/proctoring-events')
  @RequirePermissions('exam:manage')
  listProctoringEvents(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.attemptsAdminService.listProctoringEvents(tenant, id);
  }

  @Post(':id/force-submit')
  @RequirePermissions('exam:manage')
  forceSubmit(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Param('id') id: string) {
    return this.attemptsAdminService.forceSubmit(tenant, id, userId);
  }
}
```

This is a staff-facing controller (`JwtAuthGuard`/`PermissionsGuard`, plural `attempts`), entirely distinct from the candidate-facing `AttemptController` (`CandidateJwtAuthGuard`, singular `attempt`) — the two controllers share a directory but never share a guard or a route prefix.

- [ ] **Step 6: Register both in AttemptModule**

`apps/api/src/attempts/attempt.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { GradingModule } from '../grading/grading.module';
import { AttemptController } from './attempt.controller';
import { AttemptService } from './attempt.service';
import { AttemptsController } from './attempts.controller';
import { AttemptsAdminService } from './attempts-admin.service';

@Module({
  imports: [GradingModule],
  controllers: [AttemptController, AttemptsController],
  providers: [AttemptService, AttemptsAdminService],
})
export class AttemptModule {}
```

`AuditService` needs no explicit import here — `AuditModule` is `@Global()` (see `apps/api/src/audit/audit.module.ts`), so `AuditService` is already available for injection anywhere in the app, the same way `ExamsService` and other existing services consume it without a module import.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npm run test:api -- attempts-admin.service`
Expected: `5 passed`.

Run: `npm run test:api` (from repo root)
Expected: all suites passing.

Run: `npx nest build` (from `apps/api/`)
Expected: clean build with both new files wired in.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/grading/attempt-settlement.service.ts apps/api/src/attempts/attempts-admin.service.ts apps/api/src/attempts/attempts-admin.service.spec.ts apps/api/src/attempts/attempts.controller.ts apps/api/src/attempts/attempt.module.ts
git commit -m "feat: add staff-facing proctoring-events read and force-submit endpoints"
```

---

### Task 8: End-to-end test

**Files:**
- Create: `apps/api/test/session-enforcement-anti-cheat.e2e-spec.ts`

**Interfaces:**
- Consumes: the full `CandidateAuthController`/`AttemptController`/`AttemptsController` HTTP surface (Tasks 2-7), the existing exam/candidate/invitation setup flow from Phase 1c/1d's e2e specs.

- [ ] **Step 1: Write the e2e spec**

`apps/api/test/session-enforcement-anti-cheat.e2e-spec.ts`:
```typescript
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantPrismaService } from '../src/prisma/tenant-prisma.service';
import { EmailService } from '../src/email/email.service';

describe('Session Enforcement & Anti-Cheat HTTP flow', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let planId: string;
  let orgId: string;
  let recruiterAccessToken: string;
  let orgAdminAccessToken: string;
  let examId: string;
  const fakeEmailService = { send: jest.fn().mockResolvedValue({ success: true, previewUrl: 'https://ethereal.email/fake' }) };

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
      data: { name: `ci-anticheat-plan-${randomUUID()}`, candidateLimit: 10, aiCreditLimit: 1, proctoringMinutesLimit: 1 },
    });
    planId = plan.id;

    const org = await prisma.organization.create({ data: { name: 'CI Anti-Cheat Org', slug: `ci-anticheat-org-${randomUUID()}`, planId } });
    orgId = org.id;

    const recruiterHash = await argon2.hash('RecruiterPassw0rd!');
    const orgAdminHash = await argon2.hash('OrgAdminPassw0rd!');
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) =>
      Promise.all([
        tx.user.create({ data: { organizationId: orgId, email: 'recruiter@ci-anticheat.test', passwordHash: recruiterHash, role: 'recruiter' } }),
        tx.user.create({ data: { organizationId: orgId, email: 'orgadmin@ci-anticheat.test', passwordHash: orgAdminHash, role: 'org_admin' } }),
      ]),
    );

    recruiterAccessToken = (
      await request(app.getHttpServer())
        .post('/api/v1/auth/staff/login')
        .send({ organizationSlug: org.slug, email: 'recruiter@ci-anticheat.test', password: 'RecruiterPassw0rd!' })
        .expect(200)
    ).body.accessToken;

    orgAdminAccessToken = (
      await request(app.getHttpServer())
        .post('/api/v1/auth/staff/login')
        .send({ organizationSlug: org.slug, email: 'orgadmin@ci-anticheat.test', password: 'OrgAdminPassw0rd!' })
        .expect(200)
    ).body.accessToken;

    const examResponse = await request(app.getHttpServer())
      .post('/api/v1/exams')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ title: 'Anti-Cheat Round' })
      .expect(201);
    examId = examResponse.body.id;

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
        type: 'true_false', text: 'Is this a test question?', difficulty: 'easy', marks: 5,
        options: [{ text: 'True', isCorrect: true }, { text: 'False', isCorrect: false }],
      })
      .expect(201);

    await request(app.getHttpServer())
      .put(`/api/v1/exams/${examId}/sections/${sectionId}/questions`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ questionIds: [questionResponse.body.id] })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/api/v1/exams/${examId}/publish`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(201);
  });

  afterAll(async () => {
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) => tx.exam.deleteMany({ where: { organizationId: orgId } }));
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) => tx.question.deleteMany({ where: { organizationId: orgId } }));
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) => tx.candidate.deleteMany({ where: { organizationId: orgId } }));
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: true }, (tx) => tx.refreshToken.deleteMany({ where: { user: { organizationId: orgId } } }));
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) => tx.user.deleteMany({ where: { organizationId: orgId } }));
    await prisma.organization.delete({ where: { id: orgId } }).catch(() => undefined);
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  async function inviteAndGetToken(email: string, name: string): Promise<string> {
    const candidateResponse = await request(app.getHttpServer())
      .post('/api/v1/candidates')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ email, name })
      .expect(201);

    const inviteResponse = await request(app.getHttpServer())
      .post(`/api/v1/exams/${examId}/invitations`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ candidateIds: [candidateResponse.body.id] })
      .expect(201);

    return inviteResponse.body.created[0].token;
  }

  it('kills an old session live when the same invitation is redeemed again, and logs a multi_login event once an attempt exists', async () => {
    const token = await inviteAndGetToken('alice@ci-anticheat.test', 'Alice');

    const firstRedeem = await request(app.getHttpServer()).post('/api/v1/candidate-auth/redeem').send({ token }).expect(200);
    const firstAccessToken = firstRedeem.body.accessToken;

    const startResponse = await request(app.getHttpServer())
      .post('/api/v1/attempt/start')
      .set('Authorization', `Bearer ${firstAccessToken}`)
      .send({ deviceFingerprint: 'fp-first-device' })
      .expect(201);
    const attemptId = startResponse.body.id;

    const secondRedeem = await request(app.getHttpServer()).post('/api/v1/candidate-auth/redeem').send({ token }).expect(200);
    const secondAccessToken = secondRedeem.body.accessToken;

    await request(app.getHttpServer())
      .get('/api/v1/attempt/current')
      .set('Authorization', `Bearer ${firstAccessToken}`)
      .expect(401);

    await request(app.getHttpServer())
      .get('/api/v1/attempt/current')
      .set('Authorization', `Bearer ${secondAccessToken}`)
      .expect(200);

    const eventsResponse = await request(app.getHttpServer())
      .get(`/api/v1/attempts/${attemptId}/proctoring-events`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(200);
    const multiLoginEvent = eventsResponse.body.find((event: { eventType: string }) => event.eventType === 'multi_login');
    expect(multiLoginEvent).toBeDefined();
    expect(multiLoginEvent.severity).toBe('high');
  });

  it('records client-reported proctoring events with server-computed severity, and rejects a client-submitted multi_login', async () => {
    const token = await inviteAndGetToken('bob@ci-anticheat.test', 'Bob');
    const accessToken = (await request(app.getHttpServer()).post('/api/v1/candidate-auth/redeem').send({ token }).expect(200)).body.accessToken;
    const attemptId = (await request(app.getHttpServer()).post('/api/v1/attempt/start').set('Authorization', `Bearer ${accessToken}`).expect(201)).body.id;

    await request(app.getHttpServer())
      .post('/api/v1/attempt/proctoring-event')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ eventType: 'tab_switch' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/attempt/proctoring-event')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ eventType: 'multi_login' })
      .expect(400);

    const eventsResponse = await request(app.getHttpServer())
      .get(`/api/v1/attempts/${attemptId}/proctoring-events`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(200);
    const tabSwitchEvent = eventsResponse.body.find((event: { eventType: string }) => event.eventType === 'tab_switch');
    expect(tabSwitchEvent.severity).toBe('medium');

    await request(app.getHttpServer())
      .get(`/api/v1/attempts/${attemptId}/proctoring-events`)
      .set('Authorization', `Bearer ${orgAdminAccessToken}`)
      .expect(403);
  });

  it('force-submits an in-progress attempt and records an audit log entry', async () => {
    const token = await inviteAndGetToken('carol@ci-anticheat.test', 'Carol');
    const accessToken = (await request(app.getHttpServer()).post('/api/v1/candidate-auth/redeem').send({ token }).expect(200)).body.accessToken;
    const attemptId = (await request(app.getHttpServer()).post('/api/v1/attempt/start').set('Authorization', `Bearer ${accessToken}`).expect(201)).body.id;

    const forceSubmitResponse = await request(app.getHttpServer())
      .post(`/api/v1/attempts/${attemptId}/force-submit`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(201);
    expect(forceSubmitResponse.body).toEqual({ status: 'force_submitted' });

    await request(app.getHttpServer())
      .post(`/api/v1/attempts/${attemptId}/force-submit`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(400);

    const auditRows = await prisma.auditLog.findMany({ where: { entityType: 'attempt', entityId: attemptId, action: 'attempt.force_submit' } });
    expect(auditRows).toHaveLength(1);
  });

  it('starts an attempt successfully with no device fingerprint provided', async () => {
    const token = await inviteAndGetToken('dave@ci-anticheat.test', 'Dave');
    const accessToken = (await request(app.getHttpServer()).post('/api/v1/candidate-auth/redeem').send({ token }).expect(200)).body.accessToken;

    await request(app.getHttpServer())
      .post('/api/v1/attempt/start')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(201);
  });
});
```

- [ ] **Step 2: Run the full e2e suite**

Run: `npm run test:api:e2e` (from repo root)
Expected: all suites pass, including all 4 tests in `session-enforcement-anti-cheat.e2e-spec.ts`, with no regressions to any other e2e spec file.

- [ ] **Step 3: Run the full unit suite one more time**

Run: `npm run test:api` (from repo root)
Expected: all suites still passing.

- [ ] **Step 4: Commit**

```bash
git add apps/api/test/session-enforcement-anti-cheat.e2e-spec.ts
git commit -m "test: add full session enforcement and anti-cheat event ingestion e2e coverage"
```

---

## Self-Review Notes

- **Spec coverage:** live session-kill (Tasks 2-3), device fingerprint capture (Task 4), proctoring event severity map + ingestion (Tasks 5-6), staff-facing read + force-submit with audit logging (Task 7) — all covered. Deferred items (browser-side detection logic, fingerprint mismatch flagging, live/real-time monitoring, AI proctoring, frontend UI) are explicitly out of scope per the design spec and not included here.
- **Placeholder scan:** no TBD/TODO markers; every step has complete, runnable code.
- **Type consistency:** `CandidateJwtPayload` (Task 3) gains `familyId`, matching what Task 2's `issueTokenPair` now signs into both tokens. `AttemptSettlementService.finalize`'s widened status union (Task 7, Step 1) matches the exact literal `'force_submitted'` string used in `AttemptsAdminService.forceSubmit` (Task 7) and asserted in the e2e test (Task 8). `CLIENT_REPORTABLE_EVENT_TYPES`/`getProctoringEventSeverity` (Task 5) are imported by name into both `ReportProctoringEventDto` and `AttemptService.reportProctoringEvent` (Task 6) without renaming.
- **Cross-task dependency flagged explicitly:** Task 7 widens `AttemptSettlementService.finalize`'s status parameter type — a one-line, behavior-preserving change to a file two tasks (`AttemptService.submit`, `ExamsService.getResults`) from Phase 1d already depend on; Step 1 calls out explicitly that no runtime behavior changes and the existing 6 tests in `attempt-settlement.service.spec.ts` are unaffected.
