# Phase 2c (AI Proctoring) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every settled exam attempt an AI-generated risk assessment (`riskLevel` + short `summary`) computed from its proctoring-event timeline via Claude, surfaced alongside grading results — without touching Phase 2b's WebSocket surface or requiring any new candidate-facing UI.

**Architecture:** A new leaf module `ProctoringAnalysisModule` holds two pieces: `ClaudeProctoringClient` (a pure `@anthropic-ai/sdk` wrapper, no DB access) and `AttemptAnalysisService` (the DB-aware orchestrator — fetches events, skips the LLM call for a clean attempt, calls the client, persists a `ProctoringAnalysis` row, upserted on retry). `AttemptSettlementService.finalize()` — already the single place all three settlement paths (candidate submit, lazy auto-submit, staff force-submit) funnel through, per Phase 2b's whole-branch review — fires the analysis as a non-awaited, `.catch()`-guarded call immediately after its existing `attempt:status` emit, so a slow external API call never extends the settlement transaction.

**Tech Stack:** NestJS, Prisma (`sqlserver` provider), SQL Server, Jest/Supertest — plus `@anthropic-ai/sdk` (new).

## Global Constraints

- **`ProctoringAnalysisModule` must be a leaf module** — it imports nothing from `GradingModule`, `AttemptModule`, `CandidateAuthModule`, or `MonitoringModule`. `GradingModule` and `AttemptModule` import it (never the reverse), mirroring the exact discipline Phase 2b established for `MonitoringModule`.
- **The LLM call must never run inside a Prisma transaction.** `AttemptSettlementService.finalize()` triggers `AttemptAnalysisService.analyze()` as `void ...analyze(...).catch(...)` — not awaited, so it cannot extend or block the settlement transaction. `analyze()` opens its own separate `forTenant` transactions internally.
- **`analyze()` must never throw.** Every failure path (API error, timeout, malformed tool response, attempt not found) is caught internally and either persisted as `status: 'failed'` or logged — callers rely on this to safely fire-and-forget it.
- **No PII, and no `ProctoringEvent.metadataJson`, is ever sent to the LLM.** Only `eventType`, `severity`, and elapsed-seconds-since-`startedAt` leave the process — never candidate name/email, exam content, or raw wall-clock timestamps.
- **The LLM response must be structured, not parsed from free text.** Force Anthropic's tool-use with a single `report_risk_assessment` tool and `tool_choice` pinned to it; a response that doesn't produce a valid tool call is a failure, never guessed at.
- **`ProctoringAnalysis` has no Row-Level Security policy of its own** — same precedent as `ProctoringEvent`/`CandidateMessage`, reached only through `Attempt` → `Invitation` → `Exam`.
- **This phase stays fully decoupled from Phase 2b's `MonitoringGateway`.** No new WebSocket event is added; the risk assessment is exposed only via `GET /exams/:id/results`.
- Migrations are applied with `npx prisma migrate deploy`, **never** `npx prisma migrate dev` (`migrate dev --create-only` reliably fails with P3014 in this environment — hand-write the migration SQL, as every prior schema task in this project has done).
- Every timestamp-style column default must use `DEFAULT GETUTCDATE()`, never `DEFAULT CURRENT_TIMESTAMP`.
- **Never edit an already-applied migration file's SQL text in place.**
- Required (non-optional) `class-validator` DTO properties must use a definite-assignment assertion (`body!: string;`) — not applicable to this plan (no new DTOs), noted for completeness.
- Automated tests must never make a real, billed call to the Anthropic API — `ClaudeProctoringClient` is mocked at the module level in unit tests (`jest.mock('@anthropic-ai/sdk')`) and replaced with a fake provider override in the e2e spec, mirroring how `live-monitoring.e2e-spec.ts` already overrides `EmailService`.
- Full spec: `docs/superpowers/specs/2026-07-09-phase-2c-ai-proctoring-design.md`. Full prior context: `docs/superpowers/plans/2026-07-08-phase-2b-live-monitoring.md`.

---

## File Structure

```
apps/api/
  package.json                                            # Modify: add @anthropic-ai/sdk
  prisma/
    schema.prisma                                          # Modify: add ProctoringAnalysis model + Attempt relation
    migrations/
      20260709120000_proctoring_analysis_schema/
        migration.sql                                       # Create
  src/
    proctoring-analysis/
      claude-proctoring.client.ts                           # Create: pure Anthropic SDK wrapper
      claude-proctoring.client.spec.ts                       # Create
      attempt-analysis.service.ts                            # Create: orchestrator (skip-clean, call client, persist)
      attempt-analysis.service.spec.ts                        # Create
      proctoring-analysis.module.ts                           # Create
    grading/
      attempt-settlement.service.ts                          # Modify: inject AttemptAnalysisService, fire-and-forget trigger
      attempt-settlement.service.spec.ts                     # Modify
      grading.module.ts                                       # Modify: import ProctoringAnalysisModule
    attempts/
      attempts-admin.service.ts                              # Modify: add reanalyze()
      attempts-admin.service.spec.ts                          # Modify
      attempts.controller.ts                                  # Modify: add POST /:id/reanalyze
      attempt.module.ts                                       # Modify: import ProctoringAnalysisModule
    exams/
      exams.service.ts                                        # Modify: getResults gains proctoringAnalysis field
      exams.service.spec.ts                                   # Modify
  test/
    ai-proctoring.e2e-spec.ts                                # Create
.env.example                                                 # Modify: add ANTHROPIC_API_KEY
```

---

### Task 1: Schema for ProctoringAnalysis

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260709120000_proctoring_analysis_schema/migration.sql`

**Interfaces:**
- Produces: Prisma model `ProctoringAnalysis` (fields: `id`, `attemptId` (unique), `status`, `riskLevel`, `summary`, `analyzedAt`, relation `attempt`) — every later task relies on these exact field names.

- [ ] **Step 1: Add `ProctoringAnalysis` to schema.prisma, and the back-relation on `Attempt`**

In `apps/api/prisma/schema.prisma`, add `proctoringAnalysis` to the `Attempt` model (after `messages`):
```prisma
model Attempt {
  // ...existing fields unchanged...
  messages           CandidateMessage[]
  proctoringAnalysis ProctoringAnalysis?

  @@index([examId, status])
  @@map("attempts")
}
```

Add a new model at the end of the file (after `CandidateMessage`):
```prisma
model ProctoringAnalysis {
  id         String    @id @default(uuid()) @db.UniqueIdentifier
  attemptId  String    @unique @map("attempt_id") @db.UniqueIdentifier
  status     String
  riskLevel  String?   @map("risk_level")
  summary    String?   @db.NVarChar(Max)
  analyzedAt DateTime  @default(now()) @map("analyzed_at")
  attempt    Attempt   @relation(fields: [attemptId], references: [id], onDelete: Cascade)

  @@map("proctoring_analyses")
}
```

`status` is one of `'completed' | 'failed' | 'skipped_clean'`. `riskLevel`/`summary` are non-null for both `'completed'` and `'skipped_clean'` (a clean attempt still gets a deterministic `'low'`/fixed summary) — null only when `status='failed'`.

- [ ] **Step 2: Generate the migration**

Run (from `apps/api/`): `npx prisma migrate dev --create-only --name proctoring_analysis_schema`
Expected: fails with a P3014 shadow-database permission error, same as every prior schema task in this project. Hand-write the migration SQL directly (Step 3).

- [ ] **Step 3: Write the migration SQL by hand**

`apps/api/prisma/migrations/20260709120000_proctoring_analysis_schema/migration.sql`:
```sql
-- CreateTable
CREATE TABLE [dbo].[proctoring_analyses] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [attempt_id] UNIQUEIDENTIFIER NOT NULL,
    [status] NVARCHAR(1000) NOT NULL,
    [risk_level] NVARCHAR(1000),
    [summary] NVARCHAR(MAX),
    [analyzed_at] DATETIME2 NOT NULL CONSTRAINT [proctoring_analyses_analyzed_at_df] DEFAULT GETUTCDATE(),
    CONSTRAINT [proctoring_analyses_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE UNIQUE NONCLUSTERED INDEX [proctoring_analyses_attempt_id_key] ON [dbo].[proctoring_analyses]([attempt_id]);

-- AddForeignKey
ALTER TABLE [dbo].[proctoring_analyses] ADD CONSTRAINT [proctoring_analyses_attempt_id_fkey] FOREIGN KEY ([attempt_id]) REFERENCES [dbo].[attempts]([id]) ON DELETE CASCADE ON UPDATE CASCADE;
```

Note: no RLS policy for `proctoring_analyses` — matches the `ProctoringEvent`/`CandidateMessage` precedent (reached only through `attempt → invitation → exam`). The unique index on `attempt_id` is what makes an `upsert({ where: { attemptId } })` in later tasks safe and race-free at the database level.

- [ ] **Step 4: Apply the migration**

Run: `npx prisma migrate deploy`, then `npx prisma generate`.
Expected: migration applies cleanly; `@prisma/client` types now include `ProctoringAnalysis` and `Attempt.proctoringAnalysis`.

- [ ] **Step 5: Verify against the real database**

Run: `sqlcmd -S localhost,1433 -U examapp_dev -P 'DevPassw0rd!2026' -d examapp -Q "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'proctoring_analyses'" -C`
Expected: one row returned.

Run: `sqlcmd -S localhost,1433 -U examapp_dev -P 'DevPassw0rd!2026' -d examapp -Q "SELECT COUNT(*) FROM sys.indexes WHERE name = 'proctoring_analyses_attempt_id_key' AND is_unique = 1" -C`
Expected: count of 1.

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat: add ProctoringAnalysis schema (one risk assessment per attempt)"
```

---

### Task 2: ClaudeProctoringClient

**Files:**
- Modify: `apps/api/package.json`
- Modify: `.env.example`
- Create: `apps/api/src/proctoring-analysis/claude-proctoring.client.ts`
- Create: `apps/api/src/proctoring-analysis/claude-proctoring.client.spec.ts`

**Interfaces:**
- Produces: `ProctoringTimelineEvent` (`{ eventType: string; severity: string; elapsedSeconds: number }`), `RiskAssessment` (`{ riskLevel: 'low' | 'medium' | 'high'; summary: string }`), `ClaudeProctoringClient.assessRisk(events: ProctoringTimelineEvent[]): Promise<RiskAssessment>` — throws on any API error or malformed response. Task 3's `AttemptAnalysisService` consumes this exact method name and shape.

- [ ] **Step 1: Add the dependency and env var**

In `apps/api/package.json`, add to `dependencies`:
```json
    "@anthropic-ai/sdk": "^0.32.1",
```

Run (from repo root): `npm install`
Expected: installs cleanly, `package-lock.json` updated.

In `.env.example` (repo root), add:
```
ANTHROPIC_API_KEY="sk-ant-dev-key-change-me"
```

- [ ] **Step 2: Write the failing tests**

`apps/api/src/proctoring-analysis/claude-proctoring.client.spec.ts`:
```typescript
jest.mock('@anthropic-ai/sdk');

import Anthropic from '@anthropic-ai/sdk';
import { ClaudeProctoringClient } from './claude-proctoring.client';

describe('ClaudeProctoringClient', () => {
  let client: ClaudeProctoringClient;
  let mockCreate: jest.Mock;

  beforeEach(() => {
    mockCreate = jest.fn();
    (Anthropic as unknown as jest.Mock).mockImplementation(() => ({
      messages: { create: mockCreate },
    }));
    process.env.ANTHROPIC_API_KEY = 'test-key';
    client = new ClaudeProctoringClient();
  });

  const events = [{ eventType: 'tab_switch', severity: 'medium', elapsedSeconds: 120 }];

  it('returns the risk assessment from a valid tool_use response', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'tool_use', name: 'report_risk_assessment', input: { riskLevel: 'medium', summary: 'One tab switch mid-exam.' } }],
    });

    const result = await client.assessRisk(events);

    expect(result).toEqual({ riskLevel: 'medium', summary: 'One tab switch mid-exam.' });
  });

  it('forces the report_risk_assessment tool via tool_choice', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'tool_use', name: 'report_risk_assessment', input: { riskLevel: 'low', summary: 'Nothing notable.' } }],
    });

    await client.assessRisk(events);

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        tool_choice: { type: 'tool', name: 'report_risk_assessment' },
        tools: [expect.objectContaining({ name: 'report_risk_assessment' })],
      }),
    );
  });

  it('throws when the response contains no tool_use block', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'I cannot help with that.' }] });

    await expect(client.assessRisk(events)).rejects.toThrow('Claude did not return a valid report_risk_assessment tool call');
  });

  it('throws when the tool_use input has an invalid riskLevel', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'tool_use', name: 'report_risk_assessment', input: { riskLevel: 'extreme', summary: 'Bad value.' } }],
    });

    await expect(client.assessRisk(events)).rejects.toThrow('Claude returned a malformed risk assessment');
  });

  it('throws when the tool_use input is missing a summary', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'tool_use', name: 'report_risk_assessment', input: { riskLevel: 'high' } }],
    });

    await expect(client.assessRisk(events)).rejects.toThrow('Claude returned a malformed risk assessment');
  });

  it('propagates an error thrown by the Anthropic API call', async () => {
    mockCreate.mockRejectedValue(new Error('rate limited'));

    await expect(client.assessRisk(events)).rejects.toThrow('rate limited');
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm run test:api -- claude-proctoring.client`
Expected: FAIL — `ClaudeProctoringClient` is not defined yet.

- [ ] **Step 4: Implement the client**

`apps/api/src/proctoring-analysis/claude-proctoring.client.ts`:
```typescript
import { Injectable } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';

export interface ProctoringTimelineEvent {
  eventType: string;
  severity: string;
  elapsedSeconds: number;
}

export interface RiskAssessment {
  riskLevel: 'low' | 'medium' | 'high';
  summary: string;
}

const RISK_ASSESSMENT_TOOL = {
  name: 'report_risk_assessment',
  description: 'Report a risk assessment for a candidate exam attempt based on its proctoring event timeline.',
  input_schema: {
    type: 'object' as const,
    properties: {
      riskLevel: { type: 'string', enum: ['low', 'medium', 'high'] },
      summary: { type: 'string', description: 'A short (1-2 sentence) human-readable explanation for a recruiter.' },
    },
    required: ['riskLevel', 'summary'],
  },
};

const VALID_RISK_LEVELS = ['low', 'medium', 'high'];

@Injectable()
export class ClaudeProctoringClient {
  private readonly client: Anthropic;

  constructor() {
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  async assessRisk(events: ProctoringTimelineEvent[]): Promise<RiskAssessment> {
    const response = await this.client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      tools: [RISK_ASSESSMENT_TOOL],
      tool_choice: { type: 'tool', name: 'report_risk_assessment' },
      messages: [
        {
          role: 'user',
          content:
            'Analyze this exam attempt\'s proctoring event timeline and assess cheating risk. ' +
            'Consider event severity, frequency, and clustering in time.\n\n' +
            `Events (chronological, seconds elapsed since attempt start):\n${JSON.stringify(events, null, 2)}`,
        },
      ],
    });

    const toolUse = response.content.find(
      (block: { type: string }) => block.type === 'tool_use',
    ) as { type: 'tool_use'; input: unknown } | undefined;

    if (!toolUse || typeof toolUse.input !== 'object' || toolUse.input === null) {
      throw new Error('Claude did not return a valid report_risk_assessment tool call');
    }

    const input = toolUse.input as { riskLevel?: unknown; summary?: unknown };
    if (!VALID_RISK_LEVELS.includes(input.riskLevel as string) || typeof input.summary !== 'string' || input.summary.trim() === '') {
      throw new Error('Claude returned a malformed risk assessment');
    }

    return { riskLevel: input.riskLevel as RiskAssessment['riskLevel'], summary: input.summary };
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test:api -- claude-proctoring.client`
Expected: `6 passed`.

Run: `npm run test:api` (from repo root)
Expected: all suites passing, no regressions.

- [ ] **Step 6: Commit**

```bash
git add apps/api/package.json package-lock.json .env.example apps/api/src/proctoring-analysis/claude-proctoring.client.ts apps/api/src/proctoring-analysis/claude-proctoring.client.spec.ts
git commit -m "feat: add ClaudeProctoringClient (structured tool-use risk assessment)"
```

---

### Task 3: AttemptAnalysisService and ProctoringAnalysisModule

**Files:**
- Create: `apps/api/src/proctoring-analysis/attempt-analysis.service.ts`
- Create: `apps/api/src/proctoring-analysis/attempt-analysis.service.spec.ts`
- Create: `apps/api/src/proctoring-analysis/proctoring-analysis.module.ts`

**Interfaces:**
- Consumes: `TenantPrismaService.forTenant` (Phase 0), `ClaudeProctoringClient.assessRisk` (Task 2, exact signature).
- Produces: `AttemptAnalysisService.analyze(attemptId: string): Promise<void>` — never throws. Task 4 (fire-and-forget trigger) and Task 5 (on-demand `reanalyze`) both call this exact method.

- [ ] **Step 1: Write the failing tests**

`apps/api/src/proctoring-analysis/attempt-analysis.service.spec.ts`:
```typescript
import { Test } from '@nestjs/testing';
import { AttemptAnalysisService } from './attempt-analysis.service';
import { ClaudeProctoringClient } from './claude-proctoring.client';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';

describe('AttemptAnalysisService', () => {
  let service: AttemptAnalysisService;
  let tenantPrisma: { forTenant: jest.Mock };
  let claudeClient: { assessRisk: jest.Mock };

  const startedAt = new Date('2026-07-09T10:00:00Z');
  const attemptWithExam = {
    id: 'attempt-1',
    startedAt,
    invitation: { exam: { organizationId: 'org-1' } },
  };

  beforeEach(async () => {
    tenantPrisma = { forTenant: jest.fn() };
    claudeClient = { assessRisk: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        AttemptAnalysisService,
        { provide: TenantPrismaService, useValue: tenantPrisma },
        { provide: ClaudeProctoringClient, useValue: claudeClient },
      ],
    }).compile();
    service = moduleRef.get(AttemptAnalysisService);
  });

  it('resolves without doing anything when the attempt cannot be found', async () => {
    tenantPrisma.forTenant.mockResolvedValueOnce(null);

    await expect(service.analyze('missing-attempt')).resolves.toBeUndefined();

    expect(tenantPrisma.forTenant).toHaveBeenCalledTimes(1);
    expect(claudeClient.assessRisk).not.toHaveBeenCalled();
  });

  it('skips the LLM call and records skipped_clean when there are no proctoring events', async () => {
    const scopedTx = { proctoringEvent: { findMany: jest.fn().mockResolvedValue([]) }, proctoringAnalysis: { upsert: jest.fn() } };
    tenantPrisma.forTenant.mockResolvedValueOnce(attemptWithExam).mockImplementationOnce((_ctx, fn) => fn(scopedTx));

    await service.analyze('attempt-1');

    expect(claudeClient.assessRisk).not.toHaveBeenCalled();
    expect(scopedTx.proctoringAnalysis.upsert).toHaveBeenCalledWith({
      where: { attemptId: 'attempt-1' },
      create: { attemptId: 'attempt-1', status: 'skipped_clean', riskLevel: 'low', summary: 'No proctoring events were recorded during this attempt.' },
      update: { status: 'skipped_clean', riskLevel: 'low', summary: 'No proctoring events were recorded during this attempt.', analyzedAt: expect.any(Date) },
    });
  });

  it('calls the LLM with elapsed-second timestamps and persists a completed analysis', async () => {
    const events = [{ eventType: 'tab_switch', severity: 'medium', occurredAt: new Date('2026-07-09T10:02:00Z') }];
    const scopedTx = {
      proctoringEvent: { findMany: jest.fn().mockResolvedValue(events) },
      proctoringAnalysis: { upsert: jest.fn() },
    };
    tenantPrisma.forTenant.mockResolvedValueOnce(attemptWithExam).mockImplementationOnce((_ctx, fn) => fn(scopedTx));
    claudeClient.assessRisk.mockResolvedValue({ riskLevel: 'medium', summary: 'One tab switch.' });

    await service.analyze('attempt-1');

    expect(claudeClient.assessRisk).toHaveBeenCalledWith([{ eventType: 'tab_switch', severity: 'medium', elapsedSeconds: 120 }]);
    expect(scopedTx.proctoringAnalysis.upsert).toHaveBeenCalledWith({
      where: { attemptId: 'attempt-1' },
      create: { attemptId: 'attempt-1', status: 'completed', riskLevel: 'medium', summary: 'One tab switch.' },
      update: { status: 'completed', riskLevel: 'medium', summary: 'One tab switch.', analyzedAt: expect.any(Date) },
    });
  });

  it('persists a failed analysis when the LLM client throws, and does not re-throw', async () => {
    const events = [{ eventType: 'tab_switch', severity: 'medium', occurredAt: new Date('2026-07-09T10:02:00Z') }];
    const scopedTx = {
      proctoringEvent: { findMany: jest.fn().mockResolvedValue(events) },
      proctoringAnalysis: { upsert: jest.fn() },
    };
    tenantPrisma.forTenant.mockResolvedValueOnce(attemptWithExam).mockImplementationOnce((_ctx, fn) => fn(scopedTx));
    claudeClient.assessRisk.mockRejectedValue(new Error('rate limited'));

    await expect(service.analyze('attempt-1')).resolves.toBeUndefined();

    expect(scopedTx.proctoringAnalysis.upsert).toHaveBeenCalledWith({
      where: { attemptId: 'attempt-1' },
      create: { attemptId: 'attempt-1', status: 'failed', riskLevel: null, summary: null },
      update: { status: 'failed', riskLevel: null, summary: null, analyzedAt: expect.any(Date) },
    });
  });

  it('never throws even if the bootstrap lookup itself rejects', async () => {
    tenantPrisma.forTenant.mockRejectedValueOnce(new Error('DB connection lost'));

    await expect(service.analyze('attempt-1')).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:api -- attempt-analysis.service`
Expected: FAIL — `AttemptAnalysisService` is not defined yet.

- [ ] **Step 3: Implement the service**

`apps/api/src/proctoring-analysis/attempt-analysis.service.ts`:
```typescript
import { Injectable, Logger } from '@nestjs/common';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { ClaudeProctoringClient } from './claude-proctoring.client';

const CLEAN_SUMMARY = 'No proctoring events were recorded during this attempt.';

@Injectable()
export class AttemptAnalysisService {
  private readonly logger = new Logger(AttemptAnalysisService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly claudeProctoringClient: ClaudeProctoringClient,
  ) {}

  async analyze(attemptId: string): Promise<void> {
    try {
      const attempt = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) =>
        tx.attempt.findUnique({
          where: { id: attemptId },
          include: { invitation: { include: { exam: true } } },
        }),
      );
      if (!attempt) {
        this.logger.warn(`Attempt ${attemptId} not found, skipping proctoring analysis`);
        return;
      }

      const organizationId = attempt.invitation.exam.organizationId;
      await this.tenantPrisma.forTenant({ organizationId, isSuperAdmin: false }, async (tx) => {
        const events = await tx.proctoringEvent.findMany({ where: { attemptId }, orderBy: { occurredAt: 'asc' } });

        if (events.length === 0) {
          await tx.proctoringAnalysis.upsert({
            where: { attemptId },
            create: { attemptId, status: 'skipped_clean', riskLevel: 'low', summary: CLEAN_SUMMARY },
            update: { status: 'skipped_clean', riskLevel: 'low', summary: CLEAN_SUMMARY, analyzedAt: new Date() },
          });
          return;
        }

        const timeline = events.map((event) => ({
          eventType: event.eventType,
          severity: event.severity,
          elapsedSeconds: Math.max(0, Math.round((event.occurredAt.getTime() - attempt.startedAt.getTime()) / 1000)),
        }));

        try {
          const assessment = await this.claudeProctoringClient.assessRisk(timeline);
          await tx.proctoringAnalysis.upsert({
            where: { attemptId },
            create: { attemptId, status: 'completed', riskLevel: assessment.riskLevel, summary: assessment.summary },
            update: { status: 'completed', riskLevel: assessment.riskLevel, summary: assessment.summary, analyzedAt: new Date() },
          });
        } catch (error) {
          this.logger.error(`Proctoring analysis failed for attempt ${attemptId}`, error as Error);
          await tx.proctoringAnalysis.upsert({
            where: { attemptId },
            create: { attemptId, status: 'failed', riskLevel: null, summary: null },
            update: { status: 'failed', riskLevel: null, summary: null, analyzedAt: new Date() },
          });
        }
      });
    } catch (error) {
      this.logger.error(`Proctoring analysis could not run for attempt ${attemptId}`, error as Error);
    }
  }
}
```

The outer `try/catch` covers the bootstrap lookup and the entire scoped transaction (e.g. a `forTenant` connection failure); the inner `try/catch` covers only the LLM call and its own persistence, so a bootstrap-level failure never leaves a half-written row and an LLM-level failure is always recorded as `'failed'` rather than merely logged.

- [ ] **Step 4: Write the module**

`apps/api/src/proctoring-analysis/proctoring-analysis.module.ts`:
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

Deliberately has no `imports` array — it is a leaf module, matching `MonitoringModule`'s discipline from Phase 2b. `TenantPrismaService` resolves via the existing `@Global()` `PrismaModule`, so no explicit import is needed for it to be injectable here.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test:api -- attempt-analysis.service`
Expected: `5 passed`.

Run: `npm run test:api` (from repo root)
Expected: all suites passing.

Run: `npx nest build` (from `apps/api/`)
Expected: clean build.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/proctoring-analysis/attempt-analysis.service.ts apps/api/src/proctoring-analysis/attempt-analysis.service.spec.ts apps/api/src/proctoring-analysis/proctoring-analysis.module.ts
git commit -m "feat: add AttemptAnalysisService (skip-clean, LLM call, persist) and ProctoringAnalysisModule"
```

---

### Task 4: Wire the fire-and-forget trigger into AttemptSettlementService.finalize()

**Files:**
- Modify: `apps/api/src/grading/grading.module.ts`
- Modify: `apps/api/src/grading/attempt-settlement.service.ts`
- Modify: `apps/api/src/grading/attempt-settlement.service.spec.ts`

**Interfaces:**
- Consumes: `AttemptAnalysisService.analyze` (Task 3, exact signature).
- Produces: `AttemptSettlementService.finalize()` now also triggers proctoring analysis, fire-and-forget, immediately after its existing `attempt:status` emit.

- [ ] **Step 1: Update GradingModule to import ProctoringAnalysisModule**

`apps/api/src/grading/grading.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { MonitoringModule } from '../monitoring/monitoring.module';
import { ProctoringAnalysisModule } from '../proctoring-analysis/proctoring-analysis.module';
import { AttemptSettlementService } from './attempt-settlement.service';

@Module({
  imports: [MonitoringModule, ProctoringAnalysisModule],
  providers: [AttemptSettlementService],
  exports: [AttemptSettlementService],
})
export class GradingModule {}
```

- [ ] **Step 2: Write the failing test**

In `apps/api/src/grading/attempt-settlement.service.spec.ts`, add the import and update the `beforeEach`:
```typescript
import { AttemptAnalysisService } from '../proctoring-analysis/attempt-analysis.service';
```
```typescript
describe('AttemptSettlementService', () => {
  let service: AttemptSettlementService;
  let monitoringGateway: { emitAttemptStatus: jest.Mock };
  let attemptAnalysis: { analyze: jest.Mock };
  const exam = { id: 'exam-1', durationMinutes: 30, passCriteriaPercent: 50 };

  beforeEach(() => {
    monitoringGateway = { emitAttemptStatus: jest.fn() };
    attemptAnalysis = { analyze: jest.fn().mockResolvedValue(undefined) };
    service = new AttemptSettlementService(monitoringGateway as unknown as MonitoringGateway, attemptAnalysis as unknown as AttemptAnalysisService);
  });
```

Add this test inside the `describe('finalize', ...)` block:
```typescript
    it('triggers proctoring analysis for the finalized attempt without awaiting it', async () => {
      const attempt = { id: 'attempt-1', candidateId: 'cand-1', examId: 'exam-1', questionOrderJson: JSON.stringify(['q1']) };
      const tx = {
        question: { findMany: jest.fn().mockResolvedValue([{ id: 'q1', marks: 5, options: [{ id: 'opt-a', isCorrect: true }] }]) },
        answer: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
        result: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() },
        attempt: { update: jest.fn().mockResolvedValue({ id: 'attempt-1', status: 'submitted' }) },
      };

      await service.finalize(tx as unknown as Prisma.TransactionClient, exam, attempt as any, 'submitted');

      expect(attemptAnalysis.analyze).toHaveBeenCalledWith('attempt-1');
    });

    it('does not let a rejected analysis trigger propagate out of finalize', async () => {
      attemptAnalysis.analyze.mockRejectedValue(new Error('should never surface'));
      const attempt = { id: 'attempt-1', candidateId: 'cand-1', examId: 'exam-1', questionOrderJson: JSON.stringify(['q1']) };
      const tx = {
        question: { findMany: jest.fn().mockResolvedValue([{ id: 'q1', marks: 5, options: [{ id: 'opt-a', isCorrect: true }] }]) },
        answer: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
        result: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() },
        attempt: { update: jest.fn().mockResolvedValue({ id: 'attempt-1', status: 'submitted' }) },
      };

      await expect(
        service.finalize(tx as unknown as Prisma.TransactionClient, exam, attempt as any, 'submitted'),
      ).resolves.toBeDefined();
    });
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm run test:api -- attempt-settlement.service`
Expected: FAIL — the constructor doesn't accept a second argument yet, and `analyze` is never called.

- [ ] **Step 4: Implement the trigger**

In `apps/api/src/grading/attempt-settlement.service.ts`, add the import, constructor parameter, and the fire-and-forget call:
```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Attempt, Prisma } from '@prisma/client';
import { gradeAnswer, computeResult, computeRemainingSeconds } from './grading';
import { MonitoringGateway } from '../monitoring/monitoring.gateway';
import { AttemptAnalysisService } from '../proctoring-analysis/attempt-analysis.service';

export interface SettlementExam {
  id: string;
  durationMinutes: number;
  passCriteriaPercent: number;
}

@Injectable()
export class AttemptSettlementService {
  private readonly logger = new Logger(AttemptSettlementService.name);

  constructor(
    private readonly monitoringGateway: MonitoringGateway,
    private readonly attemptAnalysis: AttemptAnalysisService,
  ) {}
```
(The rest of the class — `remainingSeconds`, `isExpired`, `settleIfExpired` — is unchanged.)

Replace `finalize()`'s final block:
```typescript
    const finalized = await tx.attempt.update({ where: { id: attempt.id }, data: { status, submittedAt: new Date() } });
    this.monitoringGateway.emitAttemptStatus(attempt.examId, {
      attemptId: finalized.id,
      candidateId: attempt.candidateId,
      status: finalized.status,
    });
    void this.attemptAnalysis.analyze(finalized.id).catch((error) => this.logger.error('Proctoring analysis failed to start', error as Error));
    return finalized;
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test:api -- attempt-settlement.service`
Expected: full file passes (existing tests + 2 new).

Run: `npm run test:api` (from repo root)
Expected: all suites passing.

Run: `npx nest build` (from `apps/api/`)
Expected: clean build.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/grading/grading.module.ts apps/api/src/grading/attempt-settlement.service.ts apps/api/src/grading/attempt-settlement.service.spec.ts
git commit -m "feat: trigger proctoring analysis fire-and-forget from AttemptSettlementService.finalize"
```

---

### Task 5: On-demand reanalyze endpoint

**Files:**
- Modify: `apps/api/src/attempts/attempts-admin.service.ts`
- Modify: `apps/api/src/attempts/attempts-admin.service.spec.ts`
- Modify: `apps/api/src/attempts/attempts.controller.ts`
- Modify: `apps/api/src/attempts/attempt.module.ts`

**Interfaces:**
- Consumes: `AttemptAnalysisService.analyze` (Task 3, exact signature).
- Produces: `AttemptsAdminService.reanalyze(context, attemptId): Promise<ProctoringAnalysis>`, `POST /attempts/:id/reanalyze` (`exam:manage`).

Unlike Task 4's fire-and-forget trigger, this endpoint is explicitly user-requested, so it **awaits** `analyze()` and returns the fresh row — a recruiter clicking "retry" wants to see the result, not just a 202-style acknowledgment.

- [ ] **Step 1: Write the failing tests**

In `apps/api/src/attempts/attempts-admin.service.spec.ts`, add the import and extend the `beforeEach`:
```typescript
import { AttemptAnalysisService } from '../proctoring-analysis/attempt-analysis.service';
```
```typescript
  let attemptAnalysisService: { analyze: jest.Mock };

  beforeEach(async () => {
    tenantPrisma = { forTenant: jest.fn() };
    attemptSettlement = { finalize: jest.fn() };
    audit = { record: jest.fn() };
    monitoringGateway = { emitAttemptStatus: jest.fn(), emitMessageSent: jest.fn() };
    attemptAnalysisService = { analyze: jest.fn().mockResolvedValue(undefined) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        AttemptsAdminService,
        { provide: TenantPrismaService, useValue: tenantPrisma },
        { provide: AttemptSettlementService, useValue: attemptSettlement },
        { provide: AuditService, useValue: audit },
        { provide: MonitoringGateway, useValue: monitoringGateway },
        { provide: AttemptAnalysisService, useValue: attemptAnalysisService },
      ],
    }).compile();
    service = moduleRef.get(AttemptsAdminService);
  });
```

Add a new `describe('reanalyze', ...)` block:
```typescript
  describe('reanalyze', () => {
    it('re-invokes analysis and returns the fresh row', async () => {
      const ownershipTx = { attempt: { findFirst: jest.fn().mockResolvedValue({ id: 'attempt-1' }) } };
      const fetchTx = {
        proctoringAnalysis: {
          findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'analysis-1', attemptId: 'attempt-1', status: 'completed', riskLevel: 'low', summary: 'ok' }),
        },
      };
      tenantPrisma.forTenant
        .mockImplementationOnce((_ctx, fn) => fn(ownershipTx))
        .mockImplementationOnce((_ctx, fn) => fn(fetchTx));

      const result = await service.reanalyze(context, 'attempt-1');

      expect(attemptAnalysisService.analyze).toHaveBeenCalledWith('attempt-1');
      expect(fetchTx.proctoringAnalysis.findUniqueOrThrow).toHaveBeenCalledWith({ where: { attemptId: 'attempt-1' } });
      expect(result).toEqual({ id: 'analysis-1', attemptId: 'attempt-1', status: 'completed', riskLevel: 'low', summary: 'ok' });
    });

    it('throws NotFoundException when the attempt does not belong to the caller organization, without triggering analysis', async () => {
      const ownershipTx = { attempt: { findFirst: jest.fn().mockResolvedValue(null) } };
      tenantPrisma.forTenant.mockImplementationOnce((_ctx, fn) => fn(ownershipTx));

      await expect(service.reanalyze(context, 'attempt-1')).rejects.toThrow(NotFoundException);
      expect(attemptAnalysisService.analyze).not.toHaveBeenCalled();
    });
  });
```

(`context` is the same fixture object already used by this file's other `describe` blocks — check the top of the file for its exact declaration and reuse it, don't redeclare it.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:api -- attempts-admin.service`
Expected: FAIL — the constructor doesn't accept `AttemptAnalysisService` yet, and `reanalyze` doesn't exist.

- [ ] **Step 3: Implement**

In `apps/api/src/attempts/attempts-admin.service.ts`, add the import and constructor parameter:
```typescript
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CandidateMessage, ProctoringAnalysis, ProctoringEvent } from '@prisma/client';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { TenantContext } from '../prisma/tenant-context';
import { AttemptSettlementService } from '../grading/attempt-settlement.service';
import { AuditService } from '../audit/audit.service';
import { MonitoringGateway } from '../monitoring/monitoring.gateway';
import { AttemptAnalysisService } from '../proctoring-analysis/attempt-analysis.service';

@Injectable()
export class AttemptsAdminService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly attemptSettlement: AttemptSettlementService,
    private readonly audit: AuditService,
    private readonly monitoringGateway: MonitoringGateway,
    private readonly attemptAnalysisService: AttemptAnalysisService,
  ) {}
```
(Existing methods — `listProctoringEvents`, `forceSubmit`, `sendMessage`, `listMessages` — are unchanged.)

Add a new method at the end of the class:
```typescript
  async reanalyze(context: TenantContext, attemptId: string): Promise<ProctoringAnalysis> {
    await this.tenantPrisma.forTenant(context, async (tx) => {
      const attempt = await tx.attempt.findFirst({
        where: { id: attemptId, invitation: { exam: { organizationId: context.organizationId as string } } },
      });
      if (!attempt) {
        throw new NotFoundException(`Attempt ${attemptId} not found`);
      }
    });

    await this.attemptAnalysisService.analyze(attemptId);

    return this.tenantPrisma.forTenant(context, (tx) => tx.proctoringAnalysis.findUniqueOrThrow({ where: { attemptId } }));
  }
```

- [ ] **Step 4: Add the controller route**

In `apps/api/src/attempts/attempts.controller.ts`, add:
```typescript
  @Post(':id/reanalyze')
  @RequirePermissions('exam:manage')
  reanalyze(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.attemptsAdminService.reanalyze(tenant, id);
  }
```
(Add this method to the existing class body — no new imports are needed, every decorator/type used here is already imported by this file.)

- [ ] **Step 5: Register ProctoringAnalysisModule in AttemptModule**

`apps/api/src/attempts/attempt.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { GradingModule } from '../grading/grading.module';
import { MonitoringModule } from '../monitoring/monitoring.module';
import { ProctoringAnalysisModule } from '../proctoring-analysis/proctoring-analysis.module';
import { AttemptController } from './attempt.controller';
import { AttemptService } from './attempt.service';
import { AttemptsController } from './attempts.controller';
import { AttemptsAdminService } from './attempts-admin.service';

@Module({
  imports: [GradingModule, MonitoringModule, ProctoringAnalysisModule],
  controllers: [AttemptController, AttemptsController],
  providers: [AttemptService, AttemptsAdminService],
})
export class AttemptModule {}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm run test:api -- attempts-admin.service`
Expected: full file passes (existing tests + 2 new).

Run: `npm run test:api` (from repo root)
Expected: all suites passing.

Run: `npx nest build` (from `apps/api/`)
Expected: clean build.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/attempts/attempts-admin.service.ts apps/api/src/attempts/attempts-admin.service.spec.ts apps/api/src/attempts/attempts.controller.ts apps/api/src/attempts/attempt.module.ts
git commit -m "feat: add on-demand POST /attempts/:id/reanalyze endpoint"
```

---

### Task 6: Expose proctoringAnalysis on ExamsService.getResults

**Files:**
- Modify: `apps/api/src/exams/exams.service.ts`
- Modify: `apps/api/src/exams/exams.service.spec.ts`

**Interfaces:**
- Produces: `ExamResultRow` gains a `proctoringAnalysis: { status: string; riskLevel: string | null; summary: string | null } | null` field.

- [ ] **Step 1: Write the failing tests**

In `apps/api/src/exams/exams.service.spec.ts`, two existing tests in the `describe('getResults', ...)` block assert on the full row shape via `toEqual` and will break once `proctoringAnalysis` is added to every row — update both:

In `'returns one row per invitation, with nulls for candidates who have not started'`, add `proctoringAnalysis: null` to the expected row:
```typescript
      expect(result).toEqual([
        {
          candidateId: 'cand-1', candidateName: 'Alice', invitationId: 'inv-1', attemptId: null,
          status: 'invited', score: null, maxScore: null, percentage: null, passFail: null, submittedAt: null,
          proctoringAnalysis: null,
        },
      ]);
```

In `'returns the graded result for a submitted attempt'`, add `proctoringAnalysis: null` to that test's `attempt` fixture (it has no analysis yet) and to the expected row:
```typescript
              attempt: {
                id: 'attempt-1', status: 'submitted', submittedAt,
                result: { score: 8, maxScore: 10, percentage: 80, passFail: 'pass' },
                proctoringAnalysis: null,
              },
```
```typescript
      expect(result).toEqual([
        {
          candidateId: 'cand-1', candidateName: 'Alice', invitationId: 'inv-1', attemptId: 'attempt-1',
          status: 'submitted', score: 8, maxScore: 10, percentage: 80, passFail: 'pass', submittedAt,
          proctoringAnalysis: null,
        },
      ]);
```

The third existing test (`'settles an in-progress attempt past its deadline...'`) only asserts on `result[0].status`/`result[0].passFail`, not the full row via `toEqual` — it needs no change.

Then add this new test inside the `describe('getResults', ...)` block:
```typescript
    it('includes the proctoring analysis for a settled attempt, and null when none exists yet', async () => {
      const exam = { id: 'exam-1', passCriteriaPercent: 40 };
      const tx = {
        exam: { findFirst: jest.fn().mockResolvedValue(exam) },
        invitation: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'inv-1', candidateId: 'cand-1', status: 'invited', candidate: { name: 'Alice' },
              attempt: {
                id: 'attempt-1', status: 'submitted', submittedAt: new Date(),
                result: { score: 5, maxScore: 5, percentage: 100, passFail: 'pass' },
                proctoringAnalysis: { status: 'completed', riskLevel: 'low', summary: 'Nothing notable.' },
              },
            },
            {
              id: 'inv-2', candidateId: 'cand-2', status: 'invited', candidate: { name: 'Bob' },
              attempt: null,
            },
          ]),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.getResults(context, 'exam-1');

      expect(result[0].proctoringAnalysis).toEqual({ status: 'completed', riskLevel: 'low', summary: 'Nothing notable.' });
      expect(result[1].proctoringAnalysis).toBeNull();
    });
```

(`context` is the shared fixture already declared at the top of the file — reuse it. `exam` is declared locally per-test in this file's existing convention, as shown above — do not look for a shared one.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:api -- exams.service`
Expected: FAIL — `result[0].proctoringAnalysis` is `undefined`, not the expected object.

- [ ] **Step 3: Implement**

In `apps/api/src/exams/exams.service.ts`, update the `ExamResultRow` interface:
```typescript
export interface ExamResultRow {
  candidateId: string;
  candidateName: string;
  invitationId: string;
  attemptId: string | null;
  status: string;
  score: number | null;
  maxScore: number | null;
  percentage: number | null;
  passFail: string | null;
  submittedAt: Date | null;
  proctoringAnalysis: { status: string; riskLevel: string | null; summary: string | null } | null;
}
```

Update `getResults`'s `invitation.findMany` call to also include `proctoringAnalysis`, and map it into each row:
```typescript
      const invitations = await tx.invitation.findMany({
        where: { examId },
        include: { candidate: true, attempt: { include: { result: true, proctoringAnalysis: true } } },
        orderBy: [{ invitedAt: 'desc' }, { id: 'desc' }],
      });

      const rows: ExamResultRow[] = [];
      for (const invitation of invitations) {
        let attempt = invitation.attempt;
        if (attempt && attempt.status === 'in_progress') {
          await this.attemptSettlement.settleIfExpired(tx, exam, attempt);
          attempt = await tx.attempt.findUnique({ where: { id: attempt.id }, include: { result: true, proctoringAnalysis: true } });
        }
        rows.push({
          candidateId: invitation.candidateId,
          candidateName: invitation.candidate.name,
          invitationId: invitation.id,
          attemptId: attempt?.id ?? null,
          status: attempt?.status ?? invitation.status,
          score: attempt?.result?.score ?? null,
          maxScore: attempt?.result?.maxScore ?? null,
          percentage: attempt?.result?.percentage ?? null,
          passFail: attempt?.result?.passFail ?? null,
          submittedAt: attempt?.submittedAt ?? null,
          proctoringAnalysis: attempt?.proctoringAnalysis
            ? { status: attempt.proctoringAnalysis.status, riskLevel: attempt.proctoringAnalysis.riskLevel, summary: attempt.proctoringAnalysis.summary }
            : null,
        });
      }
      return rows;
```
(Only the `invitation.findMany`'s `include`, the re-fetch's `include`, and the pushed row object change — everything else in `getResults` is unchanged.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:api -- exams.service`
Expected: full file passes.

Run: `npm run test:api` (from repo root)
Expected: all suites passing.

Run: `npx nest build` (from `apps/api/`)
Expected: clean build.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/exams/exams.service.ts apps/api/src/exams/exams.service.spec.ts
git commit -m "feat: expose proctoringAnalysis on GET /exams/:id/results"
```

---

### Task 7: End-to-end test

**Files:**
- Create: `apps/api/test/ai-proctoring.e2e-spec.ts`

**Interfaces:**
- Consumes: the full `AttemptSettlementService` / `AttemptsController` / `ExamsController` HTTP surface (Tasks 1-6), the existing exam/candidate/invitation setup flow from prior e2e specs. Overrides `ClaudeProctoringClient` with a fake, mirroring `live-monitoring.e2e-spec.ts`'s `EmailService` override.

- [ ] **Step 1: Write the e2e spec**

`apps/api/test/ai-proctoring.e2e-spec.ts`:
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
import { ClaudeProctoringClient } from '../src/proctoring-analysis/claude-proctoring.client';

describe('AI Proctoring flow', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let planId: string;
  let orgId: string;
  let recruiterAccessToken: string;
  let examId: string;
  const fakeEmailService = { send: jest.fn().mockResolvedValue({ success: true, previewUrl: 'https://ethereal.email/fake' }) };
  const fakeClaudeProctoringClient = { assessRisk: jest.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EmailService)
      .useValue(fakeEmailService)
      .overrideProvider(ClaudeProctoringClient)
      .useValue(fakeClaudeProctoringClient)
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();

    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);

    const plan = await prisma.plan.create({
      data: { name: `ci-ai-proctoring-plan-${randomUUID()}`, candidateLimit: 10, aiCreditLimit: 1, proctoringMinutesLimit: 1 },
    });
    planId = plan.id;

    const org = await prisma.organization.create({ data: { name: 'CI AI Proctoring Org', slug: `ci-ai-proctoring-org-${randomUUID()}`, planId } });
    orgId = org.id;

    const recruiterHash = await argon2.hash('RecruiterPassw0rd!');
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) =>
      tx.user.create({ data: { organizationId: orgId, email: 'recruiter@ci-ai-proctoring.test', passwordHash: recruiterHash, role: 'recruiter' } }),
    );

    recruiterAccessToken = (
      await request(app.getHttpServer())
        .post('/api/v1/auth/staff/login')
        .send({ organizationSlug: org.slug, email: 'recruiter@ci-ai-proctoring.test', password: 'RecruiterPassw0rd!' })
        .expect(200)
    ).body.accessToken;

    const examResponse = await request(app.getHttpServer())
      .post('/api/v1/exams')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ title: 'AI Proctoring Round', durationMinutes: 60 })
      .expect(201);
    examId = examResponse.body.id;

    const sectionResponse = await request(app.getHttpServer())
      .post(`/api/v1/exams/${examId}/sections`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ title: 'Section One' })
      .expect(201);

    const questionResponse = await request(app.getHttpServer())
      .post('/api/v1/questions')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({
        type: 'true_false', text: 'Is this an AI proctoring test?', difficulty: 'easy', marks: 5,
        options: [{ text: 'True', isCorrect: true }, { text: 'False', isCorrect: false }],
      })
      .expect(201);

    await request(app.getHttpServer())
      .put(`/api/v1/exams/${examId}/sections/${sectionResponse.body.id}/questions`)
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

  async function pollForAnalysis(attemptCandidateEmail: string, timeoutMs = 5000): Promise<any> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const results = await request(app.getHttpServer())
        .get(`/api/v1/exams/${examId}/results`)
        .set('Authorization', `Bearer ${recruiterAccessToken}`)
        .expect(200);
      const row = results.body.find((r: any) => r.candidateName === attemptCandidateEmail);
      if (row?.proctoringAnalysis) {
        return row;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Timed out waiting for proctoring analysis for ${attemptCandidateEmail}`);
  }

  it('records a completed analysis with the LLM-provided risk level and summary for an attempt with proctoring events', async () => {
    fakeClaudeProctoringClient.assessRisk.mockResolvedValueOnce({ riskLevel: 'medium', summary: 'One tab switch mid-exam.' });

    const token = await inviteAndGetToken('alice@ci-ai-proctoring.test', 'Alice');
    const accessToken = (await request(app.getHttpServer()).post('/api/v1/candidate-auth/redeem').send({ token }).expect(200)).body.accessToken;
    await request(app.getHttpServer()).post('/api/v1/attempt/start').set('Authorization', `Bearer ${accessToken}`).send({}).expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/attempt/proctoring-event')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ eventType: 'tab_switch' })
      .expect(201);
    await request(app.getHttpServer()).post('/api/v1/attempt/submit').set('Authorization', `Bearer ${accessToken}`).expect(201);

    const row = await pollForAnalysis('Alice');

    expect(row.proctoringAnalysis).toEqual({ status: 'completed', riskLevel: 'medium', summary: 'One tab switch mid-exam.' });
    expect(fakeClaudeProctoringClient.assessRisk).toHaveBeenCalledWith([
      expect.objectContaining({ eventType: 'tab_switch', severity: 'medium' }),
    ]);
  });

  it('records skipped_clean without ever calling the LLM for an attempt with no proctoring events', async () => {
    const token = await inviteAndGetToken('bob@ci-ai-proctoring.test', 'Bob');
    const accessToken = (await request(app.getHttpServer()).post('/api/v1/candidate-auth/redeem').send({ token }).expect(200)).body.accessToken;
    await request(app.getHttpServer()).post('/api/v1/attempt/start').set('Authorization', `Bearer ${accessToken}`).send({}).expect(201);
    fakeClaudeProctoringClient.assessRisk.mockClear();

    await request(app.getHttpServer()).post('/api/v1/attempt/submit').set('Authorization', `Bearer ${accessToken}`).expect(201);

    const row = await pollForAnalysis('Bob');

    expect(row.proctoringAnalysis).toEqual({ status: 'skipped_clean', riskLevel: 'low', summary: 'No proctoring events were recorded during this attempt.' });
    expect(fakeClaudeProctoringClient.assessRisk).not.toHaveBeenCalled();
  });

  it('records a failed analysis when the LLM client throws, then replaces it with a completed one via reanalyze', async () => {
    fakeClaudeProctoringClient.assessRisk.mockRejectedValueOnce(new Error('rate limited'));

    const token = await inviteAndGetToken('carol@ci-ai-proctoring.test', 'Carol');
    const accessToken = (await request(app.getHttpServer()).post('/api/v1/candidate-auth/redeem').send({ token }).expect(200)).body.accessToken;
    await request(app.getHttpServer()).post('/api/v1/attempt/start').set('Authorization', `Bearer ${accessToken}`).send({}).expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/attempt/proctoring-event')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ eventType: 'copy_paste' })
      .expect(201);
    await request(app.getHttpServer()).post('/api/v1/attempt/submit').set('Authorization', `Bearer ${accessToken}`).expect(201);

    const failedRow = await pollForAnalysis('Carol');
    expect(failedRow.proctoringAnalysis).toEqual({ status: 'failed', riskLevel: null, summary: null });

    fakeClaudeProctoringClient.assessRisk.mockResolvedValueOnce({ riskLevel: 'high', summary: 'Copy-paste detected.' });
    await request(app.getHttpServer())
      .post(`/api/v1/attempts/${failedRow.attemptId}/reanalyze`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(201);

    const finalResults = await request(app.getHttpServer())
      .get(`/api/v1/exams/${examId}/results`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(200);
    const finalRow = finalResults.body.find((r: any) => r.candidateName === 'Carol');
    expect(finalRow.proctoringAnalysis).toEqual({ status: 'completed', riskLevel: 'high', summary: 'Copy-paste detected.' });
  });
});
```

Note: no endpoint in this plan returns an attempt id directly from starting an attempt or reporting a proctoring event — the `attemptId` used for the `reanalyze` call comes from `failedRow.attemptId`, already present on the `GET /exams/:id/results` row returned by `pollForAnalysis`.

- [ ] **Step 2: Run the full e2e suite**

Run: `npm run test:api:e2e` (from repo root)
Expected: all suites pass, including all 3 tests in `ai-proctoring.e2e-spec.ts`, with no regressions to any other e2e spec file. If the run shows intermittent, unrelated failures in other pre-existing suites with a SQL Server deadlock/transaction-timeout signature, that is a known pre-existing environmental characteristic (documented in Phase 2b's Task 10) — re-run once or use `--runInBand` to confirm this spec's own 3 tests are solid, and do not add sleeps/retries to any test to paper over it.

- [ ] **Step 3: Run the full unit suite one more time**

Run: `npm run test:api` (from repo root)
Expected: all suites still passing.

Run: `npx nest build` (from `apps/api/`)
Expected: clean build.

- [ ] **Step 4: Commit**

```bash
git add apps/api/test/ai-proctoring.e2e-spec.ts
git commit -m "test: add full AI proctoring e2e coverage - completed, skipped_clean, failed+reanalyze"
```

---

## Self-Review Notes

- **Spec coverage:** `ProctoringAnalysis` schema (Task 1), `ClaudeProctoringClient` with forced tool-use structured output (Task 2), `AttemptAnalysisService` with the skip-clean short-circuit and failure handling (Task 3), the fire-and-forget trigger centralized in `finalize()` (Task 4), the on-demand `reanalyze` endpoint (Task 5), exposure via `GET /exams/:id/results` (Task 6), full e2e coverage of all three terminal states (Task 7) — every in-scope item from the design spec is covered. Deferred items (webcam/CV proctoring, live-push via `MonitoringGateway`, per-org config, backfill, scheduled retry) are explicitly out of scope per the spec and not included here.
- **Placeholder scan:** no TBD/TODO markers; every step has complete, runnable code.
- **Type consistency:** `ProctoringTimelineEvent`/`RiskAssessment` (Task 2) are consumed by `AttemptAnalysisService` (Task 3) with the exact same field names. `AttemptAnalysisService.analyze(attemptId: string): Promise<void>` (Task 3) is called identically by Task 4 (fire-and-forget) and Task 5 (awaited) — same method, same signature, two different call disciplines as the spec requires. `ProctoringAnalysis`'s Prisma field names (`status`, `riskLevel`, `summary`, `analyzedAt`) are used identically across Tasks 3, 5, and 6.
- **Module dependency direction verified explicitly:** `ProctoringAnalysisModule` has zero imports — it is a leaf module, even more strictly than `MonitoringModule` (which needs `JwtModule` for JWT verification; this module needs nothing). `GradingModule` and `AttemptModule` both import it (Tasks 4-5), never the reverse.
- **Cross-task dependency flagged explicitly:** Task 4 changes `AttemptSettlementService`'s constructor (adds a required `AttemptAnalysisService` parameter) — the only existing test file that directly instantiates this class (`attempt-settlement.service.spec.ts`) is updated in that same task; `AttemptsAdminService`'s constructor (Task 5) gets the same treatment for its own test file. Every other consumer of `AttemptSettlementService`/`AttemptsAdminService` already mocks them as opaque providers via NestJS DI and is unaffected by the constructor change.
