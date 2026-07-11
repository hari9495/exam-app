# Phase 5c — AI Evaluation Insight Summaries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-generate a narrative evaluation summary ("strong in SQL, weak in system design, 2 proctoring flags") for every settled attempt, cached and served exactly like the existing AI proctoring risk-assessment feature — not through Phase 5a/5b's BullMQ job queue.

**Architecture:** A new `AttemptInsightService` in `apps/exam-runtime` mirrors the existing `AttemptAnalysisService` exactly: fire-and-forget at settlement, self-contained (re-fetches everything by `attemptId`), caches its result in a dedicated table. `AttemptSettlementService.finalize()`'s existing single fire-and-forget proctoring-analysis call becomes a small sequenced async block — proctoring analysis completes first, then insight generation runs, so the insight always has real (or cleanly-absent) proctoring context. Recruiters read the result via `GET /api/v1/attempts/:id/ai-insight` on the existing `AttemptsAdminController`, with a `POST .../regenerate` action mirroring the existing `reanalyze` endpoint's cross-app-call shape.

**Tech Stack:** NestJS 10, Prisma 5 (SQL Server), `@anthropic-ai/sdk` (already a dependency of `apps/exam-runtime`, unchanged).

## Global Constraints

- No BullMQ/AiJob involvement anywhere in this phase — this feature is auto-generated at settlement, not recruiter-triggered-and-polled.
- `AttemptInsight` has **no `organizationId` column and no RLS registration** — deliberately mirrors `ProctoringAnalysis`'s existing precedent (only ever reached through an already-ownership-checked `Attempt`, never listed org-wide on its own). This is intentional, not an oversight — do not add RLS to this table.
- Insight generation is **sequenced after** proctoring analysis at settlement (await proctoring analysis to completion — success or logged failure, either way — then run insight generation), never parallel. Both remain fully async relative to the candidate's settlement response.
- Topic breakdown is grouped by `Question.topic` (not `tags`). Questions with a null/empty `topic` are excluded from the breakdown but still count toward the attempt's overall score.
- The insight's own LLM call (`ClaudeInsightClient`) never re-analyzes proctoring events — it receives the already-computed `ProctoringAnalysis.riskLevel`/`summary` as plain prompt input, or omits that section entirely if no `ProctoringAnalysis` row exists.
- Model is `claude-sonnet-5`, matching Phase 5b's question generation, not the `claude-haiku-4-5-20251001` proctoring precedent.
- Both new HTTP routes (`GET /attempts/:id/ai-insight`, `POST /attempts/:id/ai-insight/regenerate`) are gated by `results:view` — **not** `exam:manage`, which every other route on `AttemptsAdminController` uses. This is a deliberate, intentional divergence matching the reports module's permission for viewing results/insights — do not "fix" it to match the controller's other routes.
- No new permission, no `seed.ts` change.

---

## File Structure

- **Modify** `apps/api/prisma/schema.prisma` — add `AttemptInsight` model + `Attempt.insight` back-relation.
- **Create** `apps/exam-runtime/src/attempt-insight/claude-insight.client.ts` — thin Anthropic wrapper.
- **Create** `apps/exam-runtime/src/attempt-insight/attempt-insight.service.ts` — topic-breakdown computation + orchestration.
- **Create** `apps/exam-runtime/src/attempt-insight/attempt-insight.module.ts`.
- **Modify** `apps/exam-runtime/src/grading/attempt-settlement.service.ts` — sequence insight generation after proctoring analysis.
- **Modify** `apps/exam-runtime/src/grading/grading.module.ts` — import `AttemptInsightModule`.
- **Modify** `apps/exam-runtime/src/internal/internal.controller.ts` — add `POST internal/attempts/:id/regenerate-insight`.
- **Modify** `apps/exam-runtime/src/internal/internal.module.ts` — import `AttemptInsightModule`.
- **Modify** `apps/api/src/exam-runtime-client/exam-runtime-internal.client.ts` — add `regenerateInsight()`.
- **Modify** `apps/api/src/attempts-admin/attempts-admin.service.ts` — add `getInsight()` + `regenerateInsight()`.
- **Modify** `apps/api/src/attempts-admin/attempts-admin.controller.ts` — add the two new routes.
- **Create** `apps/api/test/ai-evaluation-insight.e2e-spec.ts`.

---

### Task 1: Schema — `AttemptInsight` model

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (the `Attempt` model at line 262, and append a new model)
- Create: `apps/api/prisma/migrations/20260711130000_attempt_insights_schema/migration.sql`

**Interfaces:**
- Consumes: nothing from earlier tasks (this is Task 1).
- Produces: the `AttemptInsight` Prisma model (`id`, `attemptId` unique, `status`, `summary`, `generatedAt`) — every later task's DB access goes through this exact shape.

- [ ] **Step 1: Add the `AttemptInsight` model and the `Attempt` back-relation**

Modify `apps/api/prisma/schema.prisma` — in the `Attempt` model, add one line after the existing `proctoringAnalysis  ProctoringAnalysis?` field (line 280):

```prisma
  insight             AttemptInsight?
```

Then append this new model at the end of the file, after `AiJob`:

```prisma
model AttemptInsight {
  id          String   @id @default(uuid()) @db.UniqueIdentifier
  attemptId   String   @unique @map("attempt_id") @db.UniqueIdentifier
  status      String
  summary     String?  @db.NVarChar(Max)
  generatedAt DateTime @default(now()) @map("generated_at")
  attempt     Attempt  @relation(fields: [attemptId], references: [id], onDelete: Cascade)

  @@map("attempt_insights")
}
```

- [ ] **Step 2: Write the migration by hand**

`npx prisma migrate dev --create-only` is expected to fail with a P3014 shadow-database permission error — the same well-documented issue every prior schema-touching phase has hit. Hand-write the migration instead.

Create `apps/api/prisma/migrations/20260711130000_attempt_insights_schema/migration.sql`:

```sql
-- CreateTable
CREATE TABLE [dbo].[attempt_insights] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [attempt_id] UNIQUEIDENTIFIER NOT NULL,
    [status] NVARCHAR(1000) NOT NULL,
    [summary] NVARCHAR(MAX),
    [generated_at] DATETIME2 NOT NULL CONSTRAINT [attempt_insights_generated_at_df] DEFAULT GETUTCDATE(),
    CONSTRAINT [attempt_insights_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE UNIQUE NONCLUSTERED INDEX [attempt_insights_attempt_id_key] ON [dbo].[attempt_insights]([attempt_id]);

-- AddForeignKey
ALTER TABLE [dbo].[attempt_insights] ADD CONSTRAINT [attempt_insights_attempt_id_fkey] FOREIGN KEY ([attempt_id]) REFERENCES [dbo].[attempts]([id]) ON DELETE CASCADE ON UPDATE CASCADE;
```

This exactly mirrors `20260709120000_proctoring_analysis_schema/migration.sql`'s structure (separate `CREATE UNIQUE NONCLUSTERED INDEX` rather than an inline `UNIQUE` constraint, `GETUTCDATE()` rather than `CURRENT_TIMESTAMP` for the default) — matching the specific sibling table this model is designed after, not the `AiJob` migration's slightly different style. No RLS migration — per the Global Constraints, this table deliberately follows `ProctoringAnalysis`'s no-RLS precedent, not the RLS-first pattern most other tables use.

- [ ] **Step 3: Apply the migration and regenerate the Prisma client**

Run: `cd apps/api && npx prisma migrate deploy && npx prisma generate && cd ../..`
Expected: exit 0, `20260711130000_attempt_insights_schema` listed as applied.

If `npx prisma generate` fails with `EPERM` on the query-engine DLL, check for and kill any leftover `node`/`jest` process holding the file locked (a now-familiar issue in this project), then retry.

- [ ] **Step 4: Verify directly against the database**

```sql
SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'attempt_insights';
SELECT * FROM sys.security_predicates WHERE OBJECT_NAME(target_object_id) = 'attempt_insights';
```
Expected: 5 columns matching the model; **zero** rows from the security_predicates query (confirming no RLS registration, as intended).

- [ ] **Step 5: Confirm both apps still build cleanly**

Run: `npm run build --workspace=apps/api && npm run build --workspace=apps/exam-runtime`
Expected: exit 0 for both — the new model exists in the generated Prisma client (shared by both apps) but nothing references it yet.

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat: add AttemptInsight schema"
```

---

### Task 2: `ClaudeInsightClient` + `AttemptInsightService`

**Files:**
- Create: `apps/exam-runtime/src/attempt-insight/claude-insight.client.ts`
- Create: `apps/exam-runtime/src/attempt-insight/claude-insight.client.spec.ts`
- Create: `apps/exam-runtime/src/attempt-insight/attempt-insight.service.ts`
- Create: `apps/exam-runtime/src/attempt-insight/attempt-insight.service.spec.ts`
- Create: `apps/exam-runtime/src/attempt-insight/attempt-insight.module.ts`

**Interfaces:**
- Consumes: `AttemptInsight` model from Task 1. `TenantPrismaService`, `TenantContext` from `@exam-platform/shared`.
- Produces: `ClaudeInsightClient.generate(input: InsightInput): Promise<string>` where `InsightInput = { percentage: number; passFail: string; topicBreakdown: { topic: string; correct: number; total: number }[]; proctoring: { riskLevel: string; summary: string } | null }`. `AttemptInsightService.analyze(attemptId: string): Promise<void>` — Task 3's `AttemptSettlementService` calls this and Task 3's `InternalController`'s new route also calls it directly. `AttemptInsightModule` exporting `AttemptInsightService` — Task 3's `GradingModule` and `InternalModule` both import it.

- [ ] **Step 1: Write the failing test for `ClaudeInsightClient`**

Create `apps/exam-runtime/src/attempt-insight/claude-insight.client.spec.ts`:

```typescript
jest.mock('@anthropic-ai/sdk');

import Anthropic from '@anthropic-ai/sdk';
import { ClaudeInsightClient } from './claude-insight.client';

describe('ClaudeInsightClient', () => {
  let client: ClaudeInsightClient;
  let mockCreate: jest.Mock;

  beforeEach(() => {
    mockCreate = jest.fn();
    (Anthropic as unknown as jest.Mock).mockImplementation(() => ({
      messages: { create: mockCreate },
    }));
    process.env.ANTHROPIC_API_KEY = 'test-key';
    client = new ClaudeInsightClient();
  });

  const input = {
    percentage: 80,
    passFail: 'pass',
    topicBreakdown: [{ topic: 'SQL', correct: 4, total: 5 }],
    proctoring: null,
  };

  it('returns the summary from a valid tool_use response', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'tool_use', name: 'report_insight', input: { summary: 'Strong in SQL overall.' } }],
    });

    const result = await client.generate(input);

    expect(result).toBe('Strong in SQL overall.');
  });

  it('forces the report_insight tool via tool_choice, using the sonnet model', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'tool_use', name: 'report_insight', input: { summary: 'Solid performance.' } }],
    });

    await client.generate(input);

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-sonnet-5',
        tool_choice: { type: 'tool', name: 'report_insight' },
        tools: [expect.objectContaining({ name: 'report_insight' })],
      }),
    );
  });

  it('includes proctoring context in the prompt when present', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'tool_use', name: 'report_insight', input: { summary: 'Solid, one flag.' } }],
    });

    await client.generate({ ...input, proctoring: { riskLevel: 'medium', summary: 'One tab switch.' } });

    const call = mockCreate.mock.calls[0][0];
    expect(call.messages[0].content).toContain('medium risk');
    expect(call.messages[0].content).toContain('One tab switch.');
  });

  it('throws when the response contains no tool_use block', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'I cannot help with that.' }] });

    await expect(client.generate(input)).rejects.toThrow('Claude did not return a valid report_insight tool call');
  });

  it('throws when the tool_use input is missing a summary', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'tool_use', name: 'report_insight', input: {} }],
    });

    await expect(client.generate(input)).rejects.toThrow('Claude returned a malformed insight summary');
  });

  it('propagates an error thrown by the Anthropic API call', async () => {
    mockCreate.mockRejectedValue(new Error('rate limited'));

    await expect(client.generate(input)).rejects.toThrow('rate limited');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:exam-runtime -- claude-insight.client`
Expected: FAIL — `Cannot find module './claude-insight.client'`.

- [ ] **Step 3: Implement `ClaudeInsightClient`**

Create `apps/exam-runtime/src/attempt-insight/claude-insight.client.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';

export interface TopicBreakdownEntry {
  topic: string;
  correct: number;
  total: number;
}

export interface ProctoringContext {
  riskLevel: string;
  summary: string;
}

export interface InsightInput {
  percentage: number;
  passFail: string;
  topicBreakdown: TopicBreakdownEntry[];
  proctoring: ProctoringContext | null;
}

const REPORT_INSIGHT_TOOL = {
  name: 'report_insight',
  description: 'Report a narrative evaluation summary for a candidate exam attempt.',
  input_schema: {
    type: 'object' as const,
    properties: {
      summary: {
        type: 'string',
        description:
          'A short (2-4 sentence) human-readable evaluation summary for a recruiter, covering topic strengths/weaknesses and, if present, proctoring signals.',
      },
    },
    required: ['summary'],
  },
};

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
      model: 'claude-sonnet-5',
      max_tokens: 512,
      tools: [REPORT_INSIGHT_TOOL],
      tool_choice: { type: 'tool', name: 'report_insight' },
      messages: [
        {
          role: 'user',
          content:
            "Write a short evaluation summary for a recruiter reviewing this candidate's exam attempt. " +
            `Overall result: ${input.percentage}% (${input.passFail}).\n\n` +
            `Per-topic performance:\n${JSON.stringify(input.topicBreakdown, null, 2)}${proctoringLine}`,
        },
      ],
    });

    const toolUse = response.content.find(
      (block: { type: string }) => block.type === 'tool_use',
    ) as { type: 'tool_use'; input: unknown } | undefined;

    if (!toolUse || typeof toolUse.input !== 'object' || toolUse.input === null) {
      throw new Error('Claude did not return a valid report_insight tool call');
    }

    const parsed = toolUse.input as { summary?: unknown };
    if (typeof parsed.summary !== 'string' || parsed.summary.trim() === '') {
      throw new Error('Claude returned a malformed insight summary');
    }

    return parsed.summary;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:exam-runtime -- claude-insight.client`
Expected: PASS, 6/6.

- [ ] **Step 5: Write the failing test for `AttemptInsightService`**

Create `apps/exam-runtime/src/attempt-insight/attempt-insight.service.spec.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { AttemptInsightService } from './attempt-insight.service';
import { ClaudeInsightClient } from './claude-insight.client';
import { TenantPrismaService } from '@exam-platform/shared';

describe('AttemptInsightService', () => {
  let service: AttemptInsightService;
  let tenantPrisma: { forTenant: jest.Mock };
  let claudeClient: { generate: jest.Mock };

  const attemptWithResult = {
    id: 'attempt-1',
    result: { percentage: 80, passFail: 'pass' },
    invitation: { exam: { organizationId: 'org-1' } },
  };

  beforeEach(async () => {
    tenantPrisma = { forTenant: jest.fn() };
    claudeClient = { generate: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        AttemptInsightService,
        { provide: TenantPrismaService, useValue: tenantPrisma },
        { provide: ClaudeInsightClient, useValue: claudeClient },
      ],
    }).compile();
    service = moduleRef.get(AttemptInsightService);
  });

  it('resolves without doing anything when the attempt cannot be found', async () => {
    tenantPrisma.forTenant.mockResolvedValueOnce(null);

    await expect(service.analyze('missing-attempt')).resolves.toBeUndefined();

    expect(tenantPrisma.forTenant).toHaveBeenCalledTimes(1);
    expect(claudeClient.generate).not.toHaveBeenCalled();
  });

  it('resolves without doing anything when the attempt has no Result yet', async () => {
    tenantPrisma.forTenant.mockResolvedValueOnce({ ...attemptWithResult, result: null });

    await expect(service.analyze('attempt-1')).resolves.toBeUndefined();

    expect(claudeClient.generate).not.toHaveBeenCalled();
  });

  it('computes a per-topic breakdown, excludes untopic-ed questions, and persists a completed insight', async () => {
    const readTx = {
      answer: {
        findMany: jest.fn().mockResolvedValue([
          { isCorrect: true, question: { topic: 'SQL' } },
          { isCorrect: false, question: { topic: 'SQL' } },
          { isCorrect: true, question: { topic: null } },
        ]),
      },
      proctoringAnalysis: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const persistTx = { attemptInsight: { upsert: jest.fn() } };
    tenantPrisma.forTenant
      .mockResolvedValueOnce(attemptWithResult)
      .mockImplementationOnce((_ctx, fn) => fn(readTx))
      .mockImplementationOnce((_ctx, fn) => fn(persistTx));
    claudeClient.generate.mockResolvedValue('Solid SQL performance.');

    await service.analyze('attempt-1');

    expect(claudeClient.generate).toHaveBeenCalledWith({
      percentage: 80,
      passFail: 'pass',
      topicBreakdown: [{ topic: 'SQL', correct: 1, total: 2 }],
      proctoring: null,
    });
    expect(persistTx.attemptInsight.upsert).toHaveBeenCalledWith({
      where: { attemptId: 'attempt-1' },
      create: { attemptId: 'attempt-1', status: 'completed', summary: 'Solid SQL performance.' },
      update: { status: 'completed', summary: 'Solid SQL performance.', generatedAt: expect.any(Date) },
    });
  });

  it('passes the ProctoringAnalysis result as plain context when it exists', async () => {
    const readTx = {
      answer: { findMany: jest.fn().mockResolvedValue([]) },
      proctoringAnalysis: {
        findUnique: jest.fn().mockResolvedValue({ status: 'completed', riskLevel: 'medium', summary: 'One tab switch.' }),
      },
    };
    const persistTx = { attemptInsight: { upsert: jest.fn() } };
    tenantPrisma.forTenant
      .mockResolvedValueOnce(attemptWithResult)
      .mockImplementationOnce((_ctx, fn) => fn(readTx))
      .mockImplementationOnce((_ctx, fn) => fn(persistTx));
    claudeClient.generate.mockResolvedValue('Solid, one flag.');

    await service.analyze('attempt-1');

    expect(claudeClient.generate).toHaveBeenCalledWith(
      expect.objectContaining({ proctoring: { riskLevel: 'medium', summary: 'One tab switch.' } }),
    );
  });

  it('persists a failed insight when the LLM client throws, and does not re-throw', async () => {
    const readTx = {
      answer: { findMany: jest.fn().mockResolvedValue([]) },
      proctoringAnalysis: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const persistTx = { attemptInsight: { upsert: jest.fn() } };
    tenantPrisma.forTenant
      .mockResolvedValueOnce(attemptWithResult)
      .mockImplementationOnce((_ctx, fn) => fn(readTx))
      .mockImplementationOnce((_ctx, fn) => fn(persistTx));
    claudeClient.generate.mockRejectedValue(new Error('rate limited'));

    await expect(service.analyze('attempt-1')).resolves.toBeUndefined();

    expect(persistTx.attemptInsight.upsert).toHaveBeenCalledWith({
      where: { attemptId: 'attempt-1' },
      create: { attemptId: 'attempt-1', status: 'failed', summary: null },
      update: { status: 'failed', summary: null, generatedAt: expect.any(Date) },
    });
  });

  it('never throws even if the bootstrap lookup itself rejects', async () => {
    tenantPrisma.forTenant.mockRejectedValueOnce(new Error('DB connection lost'));

    await expect(service.analyze('attempt-1')).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npm run test:exam-runtime -- attempt-insight.service`
Expected: FAIL — `Cannot find module './attempt-insight.service'`.

- [ ] **Step 7: Implement `AttemptInsightService`**

Create `apps/exam-runtime/src/attempt-insight/attempt-insight.service.ts`:

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

  async analyze(attemptId: string): Promise<void> {
    try {
      const attempt = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) =>
        tx.attempt.findUnique({
          where: { id: attemptId },
          include: { invitation: { include: { exam: true } }, result: true },
        }),
      );
      if (!attempt || !attempt.result) {
        this.logger.warn(`Attempt ${attemptId} not found or not yet graded, skipping insight generation`);
        return;
      }

      const organizationId = attempt.invitation.exam.organizationId;
      const { answer, proctoringAnalysis } = await this.tenantPrisma.forTenant(
        { organizationId, isSuperAdmin: false },
        async (tx) => ({
          answer: await tx.answer.findMany({ where: { attemptId }, include: { question: true } }),
          proctoringAnalysis: await tx.proctoringAnalysis.findUnique({ where: { attemptId } }),
        }),
      );

      const topicBreakdown = this.computeTopicBreakdown(answer);
      const proctoring =
        proctoringAnalysis && proctoringAnalysis.riskLevel && proctoringAnalysis.summary
          ? { riskLevel: proctoringAnalysis.riskLevel, summary: proctoringAnalysis.summary }
          : null;

      let result: { status: string; summary: string | null };
      try {
        const summary = await this.claudeInsightClient.generate({
          percentage: attempt.result.percentage,
          passFail: attempt.result.passFail,
          topicBreakdown,
          proctoring,
        });
        result = { status: 'completed', summary };
      } catch (error) {
        this.logger.error(`Insight generation failed for attempt ${attemptId}`, error as Error);
        result = { status: 'failed', summary: null };
      }

      await this.tenantPrisma.forTenant({ organizationId, isSuperAdmin: false }, (tx) =>
        tx.attemptInsight.upsert({
          where: { attemptId },
          create: { attemptId, ...result },
          update: { ...result, generatedAt: new Date() },
        }),
      );
    } catch (error) {
      this.logger.error(`Insight generation could not run for attempt ${attemptId}`, error as Error);
    }
  }

  private computeTopicBreakdown(
    answers: { isCorrect: boolean | null; question: { topic: string | null } }[],
  ): TopicBreakdownEntry[] {
    const byTopic = new Map<string, { correct: number; total: number }>();
    for (const answer of answers) {
      const topic = answer.question.topic;
      if (!topic) {
        continue;
      }
      const entry = byTopic.get(topic) ?? { correct: 0, total: 0 };
      entry.total += 1;
      if (answer.isCorrect) {
        entry.correct += 1;
      }
      byTopic.set(topic, entry);
    }
    return [...byTopic.entries()].map(([topic, counts]) => ({ topic, ...counts }));
  }
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npm run test:exam-runtime -- attempt-insight.service`
Expected: PASS, 6/6.

- [ ] **Step 9: Create the module**

Create `apps/exam-runtime/src/attempt-insight/attempt-insight.module.ts`:

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

- [ ] **Step 10: Confirm the build is clean**

Run: `npm run build --workspace=apps/exam-runtime`
Expected: exit 0. (This module isn't registered into `AppModule` yet — that's Task 3 — so nothing consumes it, and this build check just confirms the new files compile.)

- [ ] **Step 11: Commit**

```bash
git add apps/exam-runtime/src/attempt-insight
git commit -m "feat: add Claude insight client and AttemptInsightService"
```

---

### Task 3: exam-runtime wiring — settlement sequencing + internal regenerate route

**Files:**
- Modify: `apps/exam-runtime/src/grading/attempt-settlement.service.ts`
- Modify: `apps/exam-runtime/src/grading/attempt-settlement.service.spec.ts`
- Modify: `apps/exam-runtime/src/grading/grading.module.ts`
- Modify: `apps/exam-runtime/src/internal/internal.controller.ts`
- Modify: `apps/exam-runtime/src/internal/internal.controller.spec.ts`
- Modify: `apps/exam-runtime/src/internal/internal.module.ts`

**Interfaces:**
- Consumes: `AttemptInsightService.analyze(attemptId): Promise<void>` and `AttemptInsightModule` from Task 2.
- Produces: `AttemptSettlementService.finalize()` now triggers insight generation (sequenced after proctoring analysis) for every later consumer of settlement. `POST internal/attempts/:id/regenerate-insight` on `InternalController` — Task 4's `ExamRuntimeInternalClient.regenerateInsight()` calls this exact route.

- [ ] **Step 1: Update the failing settlement-service tests for the new dependency and sequencing**

Modify `apps/exam-runtime/src/grading/attempt-settlement.service.spec.ts` — add the import and update `beforeEach`:

```typescript
import { AttemptInsightService } from '../attempt-insight/attempt-insight.service';
```

Replace the `beforeEach` block:

```typescript
  let attemptInsight: { analyze: jest.Mock };

  beforeEach(() => {
    broadcaster = { emitAttemptStatus: jest.fn().mockResolvedValue(undefined), emitMessageSent: jest.fn().mockResolvedValue(undefined) };
    attemptAnalysis = { analyze: jest.fn().mockResolvedValue(undefined) };
    attemptInsight = { analyze: jest.fn().mockResolvedValue(undefined) };
    service = new AttemptSettlementService(
      broadcaster as unknown as AttemptStatusBroadcaster,
      attemptAnalysis as unknown as AttemptAnalysisService,
      attemptInsight as unknown as AttemptInsightService,
    );
  });
```

Add these three tests inside the existing `describe('finalize', ...)` block, after the existing `'does not let a rejected analysis trigger propagate out of finalize'` test:

```typescript
    it('triggers insight generation for the finalized attempt after proctoring analysis completes', async () => {
      const callOrder: string[] = [];
      attemptAnalysis.analyze.mockImplementation(async () => {
        callOrder.push('proctoring');
      });
      attemptInsight.analyze.mockImplementation(async () => {
        callOrder.push('insight');
      });
      const attempt = { id: 'attempt-1', candidateId: 'cand-1', examId: 'exam-1', questionOrderJson: JSON.stringify(['q1']) };
      const tx = {
        question: { findMany: jest.fn().mockResolvedValue([{ id: 'q1', marks: 5, negativeMarks: 0, options: [{ id: 'opt-a', isCorrect: true }] }]) },
        answer: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
        result: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() },
        attempt: { update: jest.fn().mockResolvedValue({ id: 'attempt-1', status: 'submitted' }) },
      };

      await service.finalize(tx as unknown as Prisma.TransactionClient, exam, attempt as any, 'submitted');
      await new Promise((resolve) => setImmediate(resolve));

      expect(attemptInsight.analyze).toHaveBeenCalledWith('attempt-1');
      expect(callOrder).toEqual(['proctoring', 'insight']);
    });

    it('still triggers insight generation even when proctoring analysis rejects', async () => {
      attemptAnalysis.analyze.mockRejectedValue(new Error('proctoring analysis unavailable'));
      const attempt = { id: 'attempt-1', candidateId: 'cand-1', examId: 'exam-1', questionOrderJson: JSON.stringify(['q1']) };
      const tx = {
        question: { findMany: jest.fn().mockResolvedValue([{ id: 'q1', marks: 5, negativeMarks: 0, options: [{ id: 'opt-a', isCorrect: true }] }]) },
        answer: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
        result: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() },
        attempt: { update: jest.fn().mockResolvedValue({ id: 'attempt-1', status: 'submitted' }) },
      };

      await service.finalize(tx as unknown as Prisma.TransactionClient, exam, attempt as any, 'submitted');
      await new Promise((resolve) => setImmediate(resolve));

      expect(attemptInsight.analyze).toHaveBeenCalledWith('attempt-1');
    });

    it('does not let a rejected insight generation trigger propagate out of finalize', async () => {
      attemptInsight.analyze.mockRejectedValue(new Error('should never surface'));
      const attempt = { id: 'attempt-1', candidateId: 'cand-1', examId: 'exam-1', questionOrderJson: JSON.stringify(['q1']) };
      const tx = {
        question: { findMany: jest.fn().mockResolvedValue([{ id: 'q1', marks: 5, negativeMarks: 0, options: [{ id: 'opt-a', isCorrect: true }] }]) },
        answer: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
        result: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() },
        attempt: { update: jest.fn().mockResolvedValue({ id: 'attempt-1', status: 'submitted' }) },
      };

      await expect(
        service.finalize(tx as unknown as Prisma.TransactionClient, exam, attempt as any, 'submitted'),
      ).resolves.toBeDefined();
    });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:exam-runtime -- attempt-settlement.service`
Expected: FAIL — `AttemptSettlementService` constructor called with 3 arguments but only accepts 2 (TypeScript compile error, or the new tests fail because `attemptInsight.analyze` is never called).

- [ ] **Step 3: Update `AttemptSettlementService`**

Modify `apps/exam-runtime/src/grading/attempt-settlement.service.ts` — add the import:

```typescript
import { AttemptInsightService } from '../attempt-insight/attempt-insight.service';
```

Update the constructor:

```typescript
  constructor(
    @Inject(ATTEMPT_STATUS_BROADCASTER) private readonly broadcaster: AttemptStatusBroadcaster,
    private readonly attemptAnalysis: AttemptAnalysisService,
    private readonly attemptInsight: AttemptInsightService,
  ) {}
```

Replace the final line of `finalize()`:

```typescript
    void this.attemptAnalysis.analyze(finalized.id).catch((error) => this.logger.error('Proctoring analysis failed to start', error as Error));
    return finalized;
```

with:

```typescript
    void (async () => {
      try {
        await this.attemptAnalysis.analyze(finalized.id);
      } catch (error) {
        this.logger.error('Proctoring analysis failed to start', error as Error);
      }
      try {
        await this.attemptInsight.analyze(finalized.id);
      } catch (error) {
        this.logger.error('Insight generation failed to start', error as Error);
      }
    })();
    return finalized;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:exam-runtime -- attempt-settlement.service`
Expected: PASS, all specs including the 3 new ones.

- [ ] **Step 5: Wire `AttemptInsightModule` into `GradingModule`**

Modify `apps/exam-runtime/src/grading/grading.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { ProctoringAnalysisModule } from '../proctoring-analysis/proctoring-analysis.module';
import { AttemptInsightModule } from '../attempt-insight/attempt-insight.module';
import { AttemptSettlementService } from './attempt-settlement.service';

// No MonitoringModule import — AttemptSettlementService depends on the
// ATTEMPT_STATUS_BROADCASTER token instead, supplied globally by whichever
// app boots this module (LocalMonitoringBridgeModule for the public app,
// RemoteMonitoringBridgeModule for the internal app).
@Module({
  imports: [ProctoringAnalysisModule, AttemptInsightModule],
  providers: [AttemptSettlementService],
  exports: [AttemptSettlementService],
})
export class GradingModule {}
```

- [ ] **Step 6: Write the failing test for the new internal route**

Modify `apps/exam-runtime/src/internal/internal.controller.spec.ts` — add the import and update `beforeEach`:

```typescript
import { AttemptInsightService } from '../attempt-insight/attempt-insight.service';
```

```typescript
  let attemptInsight: { analyze: jest.Mock };

  beforeEach(async () => {
    tenantPrisma = { forTenant: jest.fn() };
    attemptSettlement = { finalize: jest.fn(), settleIfExpired: jest.fn() };
    attemptAnalysis = { analyze: jest.fn() };
    attemptInsight = { analyze: jest.fn() };
    broadcaster = { emitMessageSent: jest.fn().mockResolvedValue(undefined) };

    const moduleRef = await Test.createTestingModule({
      controllers: [InternalController],
      providers: [
        { provide: TenantPrismaService, useValue: tenantPrisma },
        { provide: AttemptSettlementService, useValue: attemptSettlement },
        { provide: AttemptAnalysisService, useValue: attemptAnalysis },
        { provide: AttemptInsightService, useValue: attemptInsight },
        { provide: ATTEMPT_STATUS_BROADCASTER, useValue: broadcaster },
      ],
    }).compile();
    controller = moduleRef.get(InternalController);
  });
```

Add this test after the existing `describe('reanalyze', ...)` block:

```typescript
  describe('regenerateInsight', () => {
    it('delegates to AttemptInsightService.analyze', async () => {
      await controller.regenerateInsight('attempt-1');

      expect(attemptInsight.analyze).toHaveBeenCalledWith('attempt-1');
    });
  });
```

- [ ] **Step 7: Run the test to verify it fails**

Run: `npm run test:exam-runtime -- internal.controller`
Expected: FAIL — `controller.regenerateInsight is not a function`.

- [ ] **Step 8: Add the route to `InternalController`**

Modify `apps/exam-runtime/src/internal/internal.controller.ts` — add the import:

```typescript
import { AttemptInsightService } from '../attempt-insight/attempt-insight.service';
```

Add the constructor parameter:

```typescript
    private readonly attemptInsight: AttemptInsightService,
```

Add the route (after the existing `reanalyze` method):

```typescript
  @Post('attempts/:id/regenerate-insight')
  @HttpCode(204)
  async regenerateInsight(@Param('id') id: string): Promise<void> {
    await this.attemptInsight.analyze(id);
  }
```

- [ ] **Step 9: Wire `AttemptInsightModule` into `InternalModule`**

Modify `apps/exam-runtime/src/internal/internal.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { GradingModule } from '../grading/grading.module';
import { ProctoringAnalysisModule } from '../proctoring-analysis/proctoring-analysis.module';
import { AttemptInsightModule } from '../attempt-insight/attempt-insight.module';
import { InternalController } from './internal.controller';

// No MonitoringModule import — this app has no real MonitoringGateway/WebSocket
// connections of its own. ATTEMPT_STATUS_BROADCASTER (used by InternalController
// and, transitively, AttemptSettlementService inside GradingModule) is supplied
// globally by RemoteMonitoringBridgeModule at the InternalAppModule level.
@Module({
  imports: [GradingModule, ProctoringAnalysisModule, AttemptInsightModule],
  controllers: [InternalController],
})
export class InternalModule {}
```

- [ ] **Step 10: Run the test to verify it passes**

Run: `npm run test:exam-runtime -- internal.controller`
Expected: PASS, all specs including the new one.

- [ ] **Step 11: Confirm the build is clean and the full exam-runtime unit suite passes**

Run: `npm run build --workspace=apps/exam-runtime`
Expected: exit 0.

Run: `npm run test:exam-runtime`
Expected: PASS, all suites.

- [ ] **Step 12: Commit**

```bash
git add apps/exam-runtime/src/grading apps/exam-runtime/src/internal
git commit -m "feat: sequence insight generation after proctoring analysis, add internal regenerate route"
```

---

### Task 4: apps/api HTTP surface — `GET`/`POST regenerate` on `AttemptsAdminController`, e2e test

**Files:**
- Modify: `apps/api/src/exam-runtime-client/exam-runtime-internal.client.ts`
- Modify: `apps/api/src/exam-runtime-client/exam-runtime-internal.client.spec.ts`
- Modify: `apps/api/src/attempts-admin/attempts-admin.service.ts`
- Modify: `apps/api/src/attempts-admin/attempts-admin.service.spec.ts`
- Modify: `apps/api/src/attempts-admin/attempts-admin.controller.ts`
- Create: `apps/api/test/ai-evaluation-insight.e2e-spec.ts`

**Interfaces:**
- Consumes: `POST internal/attempts/:id/regenerate-insight` (Task 3) — this task's `ExamRuntimeInternalClient.regenerateInsight()` calls it.
- Produces: `GET /api/v1/attempts/:id/ai-insight` → the `AttemptInsight` row. `POST /api/v1/attempts/:id/ai-insight/regenerate` → the fresh `AttemptInsight` row.

- [ ] **Step 1: Write the failing test for `ExamRuntimeInternalClient.regenerateInsight()`**

Modify `apps/api/src/exam-runtime-client/exam-runtime-internal.client.spec.ts` — add this `describe` block after the existing `describe('reanalyze', ...)` block:

```typescript
  describe('regenerateInsight', () => {
    it('POSTs to the internal regenerate-insight endpoint', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({}) });

      await client.regenerateInsight('attempt-1');

      expect(global.fetch).toHaveBeenCalledWith('http://localhost:3002/api/v1/internal/attempts/attempt-1/regenerate-insight', {
        method: 'POST',
        headers: { 'x-internal-secret': 'test-internal-secret' },
        signal: expect.any(AbortSignal),
      });
    });
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:api -- exam-runtime-internal.client`
Expected: FAIL — `client.regenerateInsight is not a function`.

- [ ] **Step 3: Implement `regenerateInsight()`**

Modify `apps/api/src/exam-runtime-client/exam-runtime-internal.client.ts` — add this method (after the existing `reanalyze` method):

```typescript
  async regenerateInsight(attemptId: string): Promise<void> {
    const response = await this.fetchWithTimeout(`${this.baseUrl()}/api/v1/internal/attempts/${attemptId}/regenerate-insight`, {
      method: 'POST',
      headers: this.headers(),
    });
    await this.throwIfNotOk(response);
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:api -- exam-runtime-internal.client`
Expected: PASS, all specs including the new one.

- [ ] **Step 5: Write the failing tests for `AttemptsAdminService`**

Modify `apps/api/src/attempts-admin/attempts-admin.service.spec.ts` — update the import and the `examRuntime` mock shape in `beforeEach`:

```typescript
    examRuntime = { forceSubmit: jest.fn(), reanalyze: jest.fn(), notifyMessageSent: jest.fn(), regenerateInsight: jest.fn() };
```

Add these two `describe` blocks after the existing `describe('reanalyze', ...)` block:

```typescript
  describe('getInsight', () => {
    it('throws NotFoundException when the attempt is not in the caller organization', async () => {
      const tx = { attempt: { findFirst: jest.fn().mockResolvedValue(null) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.getInsight(context, 'attempt-1')).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when the attempt is owned but no insight has been generated yet', async () => {
      let call = 0;
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => {
        call += 1;
        if (call === 1) {
          return fn({ attempt: { findFirst: jest.fn().mockResolvedValue({ id: 'attempt-1' }) } });
        }
        return fn({ attemptInsight: { findFirst: jest.fn().mockResolvedValue(null) } });
      });

      await expect(service.getInsight(context, 'attempt-1')).rejects.toThrow(NotFoundException);
    });

    it('returns the AttemptInsight row for an owned attempt', async () => {
      const insight = { attemptId: 'attempt-1', status: 'completed', summary: 'Strong in SQL.' };
      let call = 0;
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => {
        call += 1;
        if (call === 1) {
          return fn({ attempt: { findFirst: jest.fn().mockResolvedValue({ id: 'attempt-1' }) } });
        }
        return fn({ attemptInsight: { findFirst: jest.fn().mockResolvedValue(insight) } });
      });

      const result = await service.getInsight(context, 'attempt-1');

      expect(result).toBe(insight);
    });
  });

  describe('regenerateInsight', () => {
    it('throws NotFoundException without calling the internal client when the attempt is not owned', async () => {
      const tx = { attempt: { findFirst: jest.fn().mockResolvedValue(null) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.regenerateInsight(context, 'attempt-1')).rejects.toThrow(NotFoundException);
      expect(examRuntime.regenerateInsight).not.toHaveBeenCalled();
    });

    it('triggers regeneration via the internal client, then reads back the fresh AttemptInsight row', async () => {
      const insight = { attemptId: 'attempt-1', status: 'completed', summary: 'Fresh summary.' };
      let call = 0;
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => {
        call += 1;
        if (call === 1) {
          return fn({ attempt: { findFirst: jest.fn().mockResolvedValue({ id: 'attempt-1' }) } });
        }
        return fn({ attemptInsight: { findUniqueOrThrow: jest.fn().mockResolvedValue(insight) } });
      });

      const result = await service.regenerateInsight(context, 'attempt-1');

      expect(examRuntime.regenerateInsight).toHaveBeenCalledWith('attempt-1');
      expect(result).toBe(insight);
    });
  });
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `npm run test:api -- attempts-admin.service`
Expected: FAIL — `service.getInsight is not a function` / `service.regenerateInsight is not a function`.

- [ ] **Step 7: Implement `getInsight()` and `regenerateInsight()`**

Modify `apps/api/src/attempts-admin/attempts-admin.service.ts` — update the import line:

```typescript
import { AttemptInsight, CandidateMessage, ProctoringAnalysis, ProctoringEvent } from '@prisma/client';
```

Add these two methods (after the existing `reanalyze` method, before the `private requireOwnedAttempt` method):

```typescript
  async getInsight(context: TenantContext, attemptId: string): Promise<AttemptInsight> {
    await this.requireOwnedAttempt(context, attemptId);

    const insight = await this.tenantPrisma.forTenant(context, (tx) => tx.attemptInsight.findFirst({ where: { attemptId } }));
    if (!insight) {
      throw new NotFoundException(`AI insight not yet generated for attempt ${attemptId}`);
    }
    return insight;
  }

  async regenerateInsight(context: TenantContext, attemptId: string): Promise<AttemptInsight> {
    await this.requireOwnedAttempt(context, attemptId);

    await this.examRuntime.regenerateInsight(attemptId);

    return this.tenantPrisma.forTenant(context, (tx) => tx.attemptInsight.findUniqueOrThrow({ where: { attemptId } }));
  }
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npm run test:api -- attempts-admin.service`
Expected: PASS, all specs including the 5 new ones.

- [ ] **Step 9: Add the controller routes**

Modify `apps/api/src/attempts-admin/attempts-admin.controller.ts` — add these two handlers (after the existing `reanalyze` handler):

```typescript
  @Get(':id/ai-insight')
  @RequirePermissions('results:view')
  getInsight(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.attemptsAdminService.getInsight(tenant, id);
  }

  @Post(':id/ai-insight/regenerate')
  @RequirePermissions('results:view')
  regenerateInsight(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.attemptsAdminService.regenerateInsight(tenant, id);
  }
```

- [ ] **Step 10: Confirm the build is clean**

Run: `npm run build --workspace=apps/api`
Expected: exit 0.

- [ ] **Step 11: Write the e2e test**

Create `apps/api/test/ai-evaluation-insight.e2e-spec.ts`:

```typescript
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { bootAdminApp, bootRuntimeApp } from './dual-app';
import { PrismaService } from '@exam-platform/shared';
import { TenantPrismaService } from '@exam-platform/shared';
import { EmailService } from '../src/email/email.service';
import { ClaudeProctoringClient } from '../../exam-runtime/src/proctoring-analysis/claude-proctoring.client';
import { ClaudeInsightClient } from '../../exam-runtime/src/attempt-insight/claude-insight.client';

describe('AI Evaluation Insight flow', () => {
  let adminApp: INestApplication;
  let runtimeApp: INestApplication;
  let adminHttp: any;
  let runtimeHttp: any;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let planId: string;
  let orgId: string;
  let recruiterAccessToken: string;
  let orgAdminAccessToken: string;
  let examId: string;
  const fakeEmailService = { send: jest.fn().mockResolvedValue({ success: true, previewUrl: 'https://ethereal.email/fake' }) };
  const fakeClaudeProctoringClient = { assessRisk: jest.fn() };
  const fakeClaudeInsightClient = { generate: jest.fn() };

  beforeAll(async () => {
    adminApp = await bootAdminApp((builder) => builder.overrideProvider(EmailService).useValue(fakeEmailService));
    ({ app: runtimeApp } = await bootRuntimeApp((builder) =>
      builder
        .overrideProvider(ClaudeProctoringClient)
        .useValue(fakeClaudeProctoringClient)
        .overrideProvider(ClaudeInsightClient)
        .useValue(fakeClaudeInsightClient),
    ));
    adminHttp = adminApp.getHttpServer();
    runtimeHttp = runtimeApp.getHttpServer();

    prisma = adminApp.get(PrismaService);
    tenantPrisma = adminApp.get(TenantPrismaService);

    const plan = await prisma.plan.create({
      data: { name: `ci-ai-insight-plan-${randomUUID()}`, candidateLimit: 10, aiCreditLimit: 1, proctoringMinutesLimit: 1 },
    });
    planId = plan.id;

    const org = await prisma.organization.create({ data: { name: 'CI AI Insight Org', slug: `ci-ai-insight-org-${randomUUID()}`, planId } });
    orgId = org.id;

    const recruiterHash = await argon2.hash('RecruiterPassw0rd!');
    const orgAdminHash = await argon2.hash('OrgAdminPassw0rd!');
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) =>
      Promise.all([
        tx.user.create({ data: { organizationId: orgId, email: 'recruiter@ci-ai-insight.test', passwordHash: recruiterHash, role: 'recruiter' } }),
        tx.user.create({ data: { organizationId: orgId, email: 'orgadmin@ci-ai-insight.test', passwordHash: orgAdminHash, role: 'org_admin' } }),
      ]),
    );

    recruiterAccessToken = (
      await request(adminHttp)
        .post('/api/v1/auth/staff/login')
        .send({ organizationSlug: org.slug, email: 'recruiter@ci-ai-insight.test', password: 'RecruiterPassw0rd!' })
        .expect(200)
    ).body.accessToken;

    orgAdminAccessToken = (
      await request(adminHttp)
        .post('/api/v1/auth/staff/login')
        .send({ organizationSlug: org.slug, email: 'orgadmin@ci-ai-insight.test', password: 'OrgAdminPassw0rd!' })
        .expect(200)
    ).body.accessToken;

    const examResponse = await request(adminHttp)
      .post('/api/v1/exams')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ title: 'AI Insight Round', durationMinutes: 60 })
      .expect(201);
    examId = examResponse.body.id;

    const sectionResponse = await request(adminHttp)
      .post(`/api/v1/exams/${examId}/sections`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ title: 'Section One' })
      .expect(201);

    const questionResponse = await request(adminHttp)
      .post('/api/v1/questions')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({
        type: 'true_false', text: 'Is this an AI insight test?', topic: 'SQL', difficulty: 'easy', marks: 5,
        options: [{ text: 'True', isCorrect: true }, { text: 'False', isCorrect: false }],
      })
      .expect(201);

    await request(adminHttp)
      .put(`/api/v1/exams/${examId}/sections/${sectionResponse.body.id}/questions`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ questionIds: [questionResponse.body.id] })
      .expect(200);

    await request(adminHttp)
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
    await adminApp.close();
    await runtimeApp.close();
  });

  async function inviteStartAndSubmit(email: string, name: string): Promise<string> {
    const candidateResponse = await request(adminHttp)
      .post('/api/v1/candidates')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ email, name })
      .expect(201);
    const inviteResponse = await request(adminHttp)
      .post(`/api/v1/exams/${examId}/invitations`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ candidateIds: [candidateResponse.body.id] })
      .expect(201);
    const token = inviteResponse.body.created[0].token;

    const accessToken = (await request(runtimeHttp).post('/api/v1/candidate-auth/redeem').send({ token }).expect(200)).body.accessToken;
    await request(runtimeHttp).post('/api/v1/attempt/start').set('Authorization', `Bearer ${accessToken}`).send({}).expect(201);
    await request(runtimeHttp).post('/api/v1/attempt/submit').set('Authorization', `Bearer ${accessToken}`).expect(201);

    const results = await request(adminHttp)
      .get(`/api/v1/exams/${examId}/results`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(200);
    const row = results.body.find((r: any) => r.candidateName === name);
    return row.attemptId;
  }

  async function pollForInsight(attemptId: string, timeoutMs = 5000): Promise<any> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const response = await request(adminHttp)
        .get(`/api/v1/attempts/${attemptId}/ai-insight`)
        .set('Authorization', `Bearer ${recruiterAccessToken}`);
      if (response.status === 200) {
        return response.body;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Timed out waiting for AI insight for attempt ${attemptId}`);
  }

  it('generates a completed insight after settlement, sequenced after proctoring analysis', async () => {
    fakeClaudeProctoringClient.assessRisk.mockClear();
    fakeClaudeInsightClient.generate.mockResolvedValueOnce('Strong in SQL overall.');

    const attemptId = await inviteStartAndSubmit('alice@ci-ai-insight.test', 'Alice');

    const insight = await pollForInsight(attemptId);

    expect(insight).toEqual(expect.objectContaining({ status: 'completed', summary: 'Strong in SQL overall.' }));
    expect(fakeClaudeInsightClient.generate).toHaveBeenCalledWith(
      expect.objectContaining({ topicBreakdown: [{ topic: 'SQL', correct: 1, total: 1 }] }),
    );
  });

  it('regenerates an insight on demand and returns a fresh row', async () => {
    fakeClaudeInsightClient.generate.mockResolvedValueOnce('Initial summary.');
    const attemptId = await inviteStartAndSubmit('carol@ci-ai-insight.test', 'Carol');
    const initial = await pollForInsight(attemptId);

    fakeClaudeInsightClient.generate.mockResolvedValueOnce('Regenerated summary.');
    const regenerateResponse = await request(adminHttp)
      .post(`/api/v1/attempts/${attemptId}/ai-insight/regenerate`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(201);

    expect(regenerateResponse.body.summary).toBe('Regenerated summary.');
    expect(new Date(regenerateResponse.body.generatedAt).getTime()).toBeGreaterThanOrEqual(new Date(initial.generatedAt).getTime());
  });

  it('returns 404 for an attempt with no insight yet generated', async () => {
    await request(adminHttp)
      .get(`/api/v1/attempts/${randomUUID()}/ai-insight`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(404);
  });

  it('rejects a role without results:view from reading the insight', async () => {
    fakeClaudeInsightClient.generate.mockResolvedValueOnce('Org admin should not see this.');
    const attemptId = await inviteStartAndSubmit('dave@ci-ai-insight.test', 'Dave');
    await pollForInsight(attemptId);

    await request(adminHttp)
      .get(`/api/v1/attempts/${attemptId}/ai-insight`)
      .set('Authorization', `Bearer ${orgAdminAccessToken}`)
      .expect(403);
  });
});
```

- [ ] **Step 12: Run the new e2e file**

Run: `npm run test:api:e2e -- ai-evaluation-insight`
Expected: PASS, 4/4. (Requires Redis reachable at `localhost:6379`, same standing requirement every `apps/api` e2e test has had since Phase 5a.)

- [ ] **Step 13: Commit**

```bash
git add apps/api/src/exam-runtime-client apps/api/src/attempts-admin apps/api/test/ai-evaluation-insight.e2e-spec.ts
git commit -m "feat: add AI evaluation insight read/regenerate endpoints"
```

---

### Task 5: Final verification

**Files:** none — verification only, no code changes.

- [ ] **Step 1: Run the full `apps/exam-runtime` unit suite**

Run: `npm run test:exam-runtime`
Expected: all suites pass, including every new/modified spec from Tasks 2-3 (`claude-insight.client.spec.ts`, `attempt-insight.service.spec.ts`, `attempt-settlement.service.spec.ts`, `internal.controller.spec.ts`).

- [ ] **Step 2: Run the full `apps/api` unit suite**

Run: `npm run test:api`
Expected: all suites pass, including `exam-runtime-internal.client.spec.ts` and `attempts-admin.service.spec.ts`.

- [ ] **Step 3: Run the full `apps/api` e2e suite serially**

Run: `npm run test:api:e2e -- --runInBand`
Expected: every suite passes, including the new `ai-evaluation-insight.e2e-spec.ts`, with Redis reachable.

- [ ] **Step 4: Confirm both apps build cleanly**

Run: `npm run build --workspace=apps/api && npm run build --workspace=apps/exam-runtime`
Expected: exit 0 for both.

- [ ] **Step 5: Confirm migration status**

Run: `npx prisma migrate status --schema=apps/api/prisma/schema.prisma`
Expected: `20260711130000_attempt_insights_schema` listed as applied, database up to date, nothing pending.

- [ ] **Step 6: Confirm no unintended cross-workspace changes**

Run: `git status --short`
Expected: only files under `apps/api/` (schema, migrations, `src/exam-runtime-client/`, `src/attempts-admin/`, `test/`) and `apps/exam-runtime/` (`src/attempt-insight/`, `src/grading/`, `src/internal/`) show as changed — `packages/shared` and `apps/web` are untouched by this phase.

No commit for this task — verification only, matching the Phase 5a/5b Task 4 precedent.
