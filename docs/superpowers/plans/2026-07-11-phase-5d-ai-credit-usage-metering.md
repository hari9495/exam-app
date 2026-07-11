# Phase 5d — AI Credit Usage Metering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record AI credit consumption from Phase 5b's question generation and Phase 5c's insight generation into a new ledger table, and expose current usage vs. the org's plan limit via a read-only endpoint — metering only, no blocking, matching the master spec's explicit split between Phase 5 (metering) and Phase 7 (billing/enforcement).

**Architecture:** A new `AiCreditUsage` table (RLS-registered, append-only) gets one row inserted at each of two existing write sites — `AiQuestionGenerationProcessor.process()` (Phase 5b, `apps/api`) and `AttemptInsightService.analyze()` (Phase 5c, `apps/exam-runtime`) — inside their existing tenant-scoped transactions, no new triggers or job types. A new `GET /api/v1/organizations/usage` on the existing `OrganizationsController` sums it against the org's `Plan.aiCreditLimit`.

**Tech Stack:** NestJS 10, Prisma 5 (SQL Server) — no new dependencies.

## Global Constraints

- Metering only — no request is ever blocked or rejected based on credit usage. `JobsService.enqueue()` and `AttemptInsightService.analyze()`'s control flow are otherwise unmodified; this phase only adds a write *after* success.
- Question generation charges `credits: questionIds.length` (what was actually delivered, not the `count` requested) — zero rows inserted if zero questions were created.
- Insight generation charges a flat `credits: 1`, only in the success branch (`status: 'completed'`) — zero rows inserted on failure.
- `sourceId` is populated for `insight_generation` rows (the `attemptId`, already in scope) and left `null` for `question_generation` rows (`AiQuestionGenerationProcessor` has no `AiJob` id in scope under the current `JobProcessor` interface, and widening that interface again purely for this optional field isn't worth it).
- `AiCreditUsage` is RLS-registered like every other operational table with an `organizationId` column (unlike `ProctoringAnalysis`/`AttemptInsight`, which deliberately are not) — two migrations (schema + RLS).
- The usage endpoint is gated by the existing `org:manage_settings` permission — no new permission, no `seed.ts` change.
- No changes to the `Plan` model and no billing-period/reset concept — usage is cumulative since the organization's creation.

---

## File Structure

- **Modify** `apps/api/prisma/schema.prisma` — add the `AiCreditUsage` model.
- **Create** `apps/api/prisma/migrations/20260711140000_ai_credit_usage_schema/migration.sql`.
- **Create** `apps/api/prisma/migrations/20260711140001_ai_credit_usage_rls/migration.sql`.
- **Modify** `apps/api/src/jobs/processors/ai-question-generation.processor.ts` — record usage after inserting valid questions.
- **Modify** `apps/exam-runtime/src/attempt-insight/attempt-insight.service.ts` — record usage on successful generation.
- **Modify** `apps/api/src/organizations/organizations.service.ts` — add `getUsage()`.
- **Modify** `apps/api/src/organizations/organizations.controller.ts` — add the route.
- **Modify** `apps/api/test/ai-question-generation.e2e-spec.ts` — extend the existing completion test.
- **Modify** `apps/api/test/ai-evaluation-insight.e2e-spec.ts` — extend the existing completion test.
- **Create** `apps/api/test/ai-credit-usage.e2e-spec.ts` — permission gating + zero-usage baseline.

---

### Task 1: Schema — `AiCreditUsage` model + RLS

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (append after `AttemptInsight`)
- Create: `apps/api/prisma/migrations/20260711140000_ai_credit_usage_schema/migration.sql`
- Create: `apps/api/prisma/migrations/20260711140001_ai_credit_usage_rls/migration.sql`

**Interfaces:**
- Consumes: nothing from earlier tasks (this is Task 1).
- Produces: the `AiCreditUsage` Prisma model (`id`, `organizationId`, `source`, `credits`, `sourceId`, `occurredAt`) — Task 2's two write sites and Task 3's aggregation query both depend on this exact shape.

- [ ] **Step 1: Add the `AiCreditUsage` model**

Modify `apps/api/prisma/schema.prisma` — append this model at the end of the file, after `AttemptInsight`:

```prisma
model AiCreditUsage {
  id             String   @id @default(uuid()) @db.UniqueIdentifier
  organizationId String   @map("organization_id") @db.UniqueIdentifier
  source         String
  credits        Int
  sourceId       String?  @map("source_id") @db.UniqueIdentifier
  occurredAt     DateTime @default(now()) @map("occurred_at")

  @@index([organizationId])
  @@map("ai_credit_usage")
}
```

- [ ] **Step 2: Write the schema migration by hand**

`npx prisma migrate dev --create-only` is expected to fail with a P3014 shadow-database permission error — the same well-documented issue every prior schema-touching phase has hit. Hand-write the migration instead.

Create `apps/api/prisma/migrations/20260711140000_ai_credit_usage_schema/migration.sql`:

```sql
-- CreateTable
CREATE TABLE [dbo].[ai_credit_usage] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [organization_id] UNIQUEIDENTIFIER NOT NULL,
    [source] NVARCHAR(1000) NOT NULL,
    [credits] INT NOT NULL,
    [source_id] UNIQUEIDENTIFIER,
    [occurred_at] DATETIME2 NOT NULL CONSTRAINT [ai_credit_usage_occurred_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [ai_credit_usage_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ai_credit_usage_organization_id_idx] ON [dbo].[ai_credit_usage]([organization_id]);
```

- [ ] **Step 3: Write the RLS migration**

Create `apps/api/prisma/migrations/20260711140001_ai_credit_usage_rls/migration.sql`:

```sql
-- Extend the tenant isolation security policy created in Phase 0
-- (20260707110005_tenant_rls_policy) to also cover dbo.ai_credit_usage.
-- Reuses the existing dbo.fn_tenant_access_predicate function unchanged;
-- this adds predicates to the existing policy, it does not create a new
-- policy or function. The policy is already WITH (STATE = ON), so no
-- state change is needed here.
ALTER SECURITY POLICY dbo.TenantAccessPolicy
ADD FILTER PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.ai_credit_usage,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.ai_credit_usage AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.ai_credit_usage AFTER UPDATE;
```

- [ ] **Step 4: Apply the migrations and regenerate the Prisma client**

Run: `cd apps/api && npx prisma migrate deploy && npx prisma generate && cd ../..`
Expected: exit 0, both migrations listed as applied.

If `npx prisma generate` fails with `EPERM` on the query-engine DLL, check for and kill any leftover `node`/`jest` process holding the file locked (a now-familiar issue in this project), then retry.

- [ ] **Step 5: Verify directly against the database**

```sql
SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'ai_credit_usage';
SELECT * FROM sys.security_predicates WHERE OBJECT_NAME(target_object_id) = 'ai_credit_usage';
```
Expected: 6 columns matching the model; 3 security predicates (1 filter, 2 block) targeting `ai_credit_usage`.

- [ ] **Step 6: Confirm both apps still build cleanly**

Run: `npm run build --workspace=apps/api && npm run build --workspace=apps/exam-runtime`
Expected: exit 0 for both — the new model exists in the generated Prisma client (shared by both apps) but nothing references it yet.

- [ ] **Step 7: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat: add AiCreditUsage schema"
```

---

### Task 2: Record credit usage at both consumption points

**Files:**
- Modify: `apps/api/src/jobs/processors/ai-question-generation.processor.ts`
- Modify: `apps/api/src/jobs/processors/ai-question-generation.processor.spec.ts`
- Modify: `apps/exam-runtime/src/attempt-insight/attempt-insight.service.ts`
- Modify: `apps/exam-runtime/src/attempt-insight/attempt-insight.service.spec.ts`

**Interfaces:**
- Consumes: `AiCreditUsage` model from Task 1.
- Produces: nothing new consumed by later tasks — Task 3 reads `AiCreditUsage` rows via its own aggregation query, not through any function this task exports.

- [ ] **Step 1: Write the failing test for question-generation usage recording**

Modify `apps/api/src/jobs/processors/ai-question-generation.processor.spec.ts`. First, the production code change in Step 3 below will call `tx.aiCreditUsage.create(...)` inside the *same* `tenantPrisma.forTenant` callback every existing test already exercises — so four pre-existing tests whose `tx` mock only stubs `{ question: { create } }` will start throwing `Cannot read properties of undefined (reading 'create')` unless their mocks are widened too. Update each of these four `tenantPrisma.forTenant.mockImplementation` calls (leave everything else in each test unchanged) from:

```typescript
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn({ question: { create } }));
```

to:

```typescript
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn({ question: { create }, aiCreditUsage: { create: jest.fn() } }));
```

in these four tests specifically (identifiable by their `it(...)` titles — each currently has exactly this one-line mock setup):
- `'inserts every valid generated question as a draft, ai-generated row'`
- `'drops questions that fail validation and still completes with the valid ones'`
- `'truncates generated questions to the requested count before validating and inserting'`
- `'drops a generated question whose type is not in the requested questionTypes, without inserting it'`

The other two existing tests (`'completes with zero created questions when every generated question fails validation'` and `'propagates an error thrown by the Claude client, failing the whole job with zero inserts'`) need no change — the new code path is guarded by `if (ids.length > 0)`, and neither test ever produces a nonzero `ids.length`.

Then add these two new tests after the (now-updated) `'inserts every valid generated question as a draft, ai-generated row'` test:

```typescript
  it('records AiCreditUsage with credits equal to the number of questions actually created', async () => {
    claudeClient.generate.mockResolvedValue([
      {
        type: 'single_mcq',
        text: 'Valid question',
        options: [
          { text: 'A', isCorrect: true },
          { text: 'B', isCorrect: false },
        ],
      },
    ]);
    const create = jest.fn().mockResolvedValueOnce({ id: 'q-1' });
    const aiCreditUsageCreate = jest.fn();
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) =>
      fn({ question: { create }, aiCreditUsage: { create: aiCreditUsageCreate } }),
    );

    await processor.process(input, context);

    expect(aiCreditUsageCreate).toHaveBeenCalledWith({
      data: { organizationId: 'org-1', source: 'question_generation', credits: 1, sourceId: null },
    });
  });

  it('does not record AiCreditUsage when zero questions are created', async () => {
    claudeClient.generate.mockResolvedValue([
      {
        type: 'single_mcq',
        text: 'Invalid',
        options: [
          { text: 'A', isCorrect: true },
          { text: 'B', isCorrect: true },
        ],
      },
    ]);
    const aiCreditUsageCreate = jest.fn();
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) =>
      fn({ question: { create: jest.fn() }, aiCreditUsage: { create: aiCreditUsageCreate } }),
    );

    await processor.process(input, context);

    expect(aiCreditUsageCreate).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:api -- ai-question-generation.processor`
Expected: FAIL — `Cannot read properties of undefined (reading 'create')` (the test's mock `tx` has `aiCreditUsage.create`, but nothing in the processor calls it yet).

- [ ] **Step 3: Record usage in `AiQuestionGenerationProcessor`**

Modify `apps/api/src/jobs/processors/ai-question-generation.processor.ts` — inside the existing `this.tenantPrisma.forTenant(context, async (tx) => { ... })` block, after the `for (const question of valid)` loop finishes (i.e. right before `return ids;`), add:

```typescript
      if (ids.length > 0) {
        await tx.aiCreditUsage.create({
          data: { organizationId: context.organizationId as string, source: 'question_generation', credits: ids.length, sourceId: null },
        });
      }
```

The full method body's relevant tail now reads:

```typescript
    const questionIds = await this.tenantPrisma.forTenant(context, async (tx) => {
      const ids: string[] = [];
      for (const question of valid) {
        const created = await tx.question.create({
          data: {
            organizationId: context.organizationId as string,
            type: question.type,
            text: question.text,
            topic,
            difficulty,
            marks: 1,
            negativeMarks: 0,
            status: 'draft',
            aiGenerated: true,
            createdBy: requestedBy,
            options: {
              create: question.options.map((o, index) => ({ text: o.text, isCorrect: o.isCorrect, orderIndex: index })),
            },
          },
        });
        ids.push(created.id);
      }
      if (ids.length > 0) {
        await tx.aiCreditUsage.create({
          data: { organizationId: context.organizationId as string, source: 'question_generation', credits: ids.length, sourceId: null },
        });
      }
      return ids;
    });
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:api -- ai-question-generation.processor`
Expected: PASS, all specs including the 2 new ones.

- [ ] **Step 5: Write the failing test for insight-generation usage recording**

Modify `apps/exam-runtime/src/attempt-insight/attempt-insight.service.spec.ts`. As in Step 1 above, the production code change in Step 7 below will call `tx.aiCreditUsage.create(...)` inside the same `forTenant` callback that upserts `attemptInsight` — but only on the success path (`result.status === 'completed'`). Two pre-existing tests reach that success path with a `persistTx` mock that only stubs `{ attemptInsight: { upsert: jest.fn() } }`, so they'll throw `Cannot read properties of undefined (reading 'create')` unless widened. Update each of these two tests' `persistTx` declaration (leave everything else in each test unchanged) from:

```typescript
    const persistTx = { attemptInsight: { upsert: jest.fn() } };
```

to:

```typescript
    const persistTx = { attemptInsight: { upsert: jest.fn() }, aiCreditUsage: { create: jest.fn() } };
```

in these two tests specifically:
- `'computes a per-topic breakdown, excludes untopic-ed questions, and persists a completed insight'`
- `'passes the ProctoringAnalysis result as plain context when it exists'`

The existing `'persists a failed insight when the LLM client throws, and does not re-throw'` test needs no change — its `result.status` is `'failed'`, so the new code path never executes and `persistTx.aiCreditUsage` is never dereferenced.

Then add these two new tests after the (now-updated) `'computes a per-topic breakdown, excludes untopic-ed questions, and persists a completed insight'` test:

```typescript
  it('records AiCreditUsage with a flat 1 credit when generation succeeds', async () => {
    const readTx = {
      answer: { findMany: jest.fn().mockResolvedValue([]) },
      proctoringAnalysis: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const persistTx = { attemptInsight: { upsert: jest.fn() }, aiCreditUsage: { create: jest.fn() } };
    tenantPrisma.forTenant
      .mockResolvedValueOnce(attemptWithResult)
      .mockImplementationOnce((_ctx, fn) => fn(readTx))
      .mockImplementationOnce((_ctx, fn) => fn(persistTx));
    claudeClient.generate.mockResolvedValue('Solid performance.');

    await service.analyze('attempt-1');

    expect(persistTx.aiCreditUsage.create).toHaveBeenCalledWith({
      data: { organizationId: 'org-1', source: 'insight_generation', credits: 1, sourceId: 'attempt-1' },
    });
  });

  it('does not record AiCreditUsage when the LLM client throws', async () => {
    const readTx = {
      answer: { findMany: jest.fn().mockResolvedValue([]) },
      proctoringAnalysis: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const persistTx = { attemptInsight: { upsert: jest.fn() }, aiCreditUsage: { create: jest.fn() } };
    tenantPrisma.forTenant
      .mockResolvedValueOnce(attemptWithResult)
      .mockImplementationOnce((_ctx, fn) => fn(readTx))
      .mockImplementationOnce((_ctx, fn) => fn(persistTx));
    claudeClient.generate.mockRejectedValue(new Error('rate limited'));

    await service.analyze('attempt-1');

    expect(persistTx.aiCreditUsage.create).not.toHaveBeenCalled();
  });
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `npm run test:exam-runtime -- attempt-insight.service`
Expected: FAIL — `persistTx.aiCreditUsage.create` was never called.

- [ ] **Step 7: Record usage in `AttemptInsightService`**

Modify `apps/exam-runtime/src/attempt-insight/attempt-insight.service.ts` — replace the final `await this.tenantPrisma.forTenant(...)` block (the one that upserts `attemptInsight`) with:

```typescript
      await this.tenantPrisma.forTenant({ organizationId, isSuperAdmin: false }, async (tx) => {
        await tx.attemptInsight.upsert({
          where: { attemptId },
          create: { attemptId, ...result },
          update: { ...result, generatedAt: new Date() },
        });
        if (result.status === 'completed') {
          await tx.aiCreditUsage.create({
            data: { organizationId, source: 'insight_generation', credits: 1, sourceId: attemptId },
          });
        }
      });
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npm run test:exam-runtime -- attempt-insight.service`
Expected: PASS, all specs including the 2 new ones.

- [ ] **Step 9: Confirm both apps build cleanly and their full unit suites pass**

Run: `npm run build --workspace=apps/api && npm run build --workspace=apps/exam-runtime`
Expected: exit 0 for both.

Run: `npm run test:api && npm run test:exam-runtime`
Expected: PASS, all suites in both apps.

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/jobs/processors/ai-question-generation.processor.ts apps/api/src/jobs/processors/ai-question-generation.processor.spec.ts apps/exam-runtime/src/attempt-insight/attempt-insight.service.ts apps/exam-runtime/src/attempt-insight/attempt-insight.service.spec.ts
git commit -m "feat: record AI credit usage on question and insight generation"
```

---

### Task 3: Usage endpoint on `OrganizationsController`

**Files:**
- Modify: `apps/api/src/organizations/organizations.service.ts`
- Modify: `apps/api/src/organizations/organizations.service.spec.ts`
- Modify: `apps/api/src/organizations/organizations.controller.ts`

**Interfaces:**
- Consumes: `AiCreditUsage` model from Task 1. `TenantPrismaService` (already `@Global()`-exported from `packages/shared`'s `PrismaModule`, needs no new module import).
- Produces: `GET /api/v1/organizations/usage` → `AiCreditUsageResponse = { aiCreditLimit: number; totalUsed: number; breakdown: { questionGeneration: number; insightGeneration: number } }`.

- [ ] **Step 1: Write the failing service tests**

Modify `apps/api/src/organizations/organizations.service.spec.ts` — add the `TenantPrismaService` import and update the `beforeEach` block:

```typescript
import { TenantPrismaService } from '@exam-platform/shared';
```

Replace the `beforeEach` block with:

```typescript
  let tenantPrisma: { forTenant: jest.Mock };

  beforeEach(async () => {
    prisma = { organization: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() } };
    tenantPrisma = { forTenant: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        OrganizationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: TenantPrismaService, useValue: tenantPrisma },
      ],
    }).compile();
    service = moduleRef.get(OrganizationsService);
  });
```

Add this `describe` block at the end of the file, immediately before the final closing `});`:

```typescript
  describe('getUsage', () => {
    const context = { organizationId: 'org-1', isSuperAdmin: false };

    it('returns the plan limit alongside a zero breakdown for an org with no usage yet', async () => {
      prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', plan: { aiCreditLimit: 100 } });
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) =>
        fn({ aiCreditUsage: { groupBy: jest.fn().mockResolvedValue([]) } }),
      );

      const result = await service.getUsage(context);

      expect(result).toEqual({
        aiCreditLimit: 100,
        totalUsed: 0,
        breakdown: { questionGeneration: 0, insightGeneration: 0 },
      });
    });

    it('sums usage per source into the breakdown', async () => {
      prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', plan: { aiCreditLimit: 100 } });
      const groupBy = jest.fn().mockResolvedValue([
        { source: 'question_generation', _sum: { credits: 7 } },
        { source: 'insight_generation', _sum: { credits: 3 } },
      ]);
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn({ aiCreditUsage: { groupBy } }));

      const result = await service.getUsage(context);

      expect(result).toEqual({
        aiCreditLimit: 100,
        totalUsed: 10,
        breakdown: { questionGeneration: 7, insightGeneration: 3 },
      });
      expect(groupBy).toHaveBeenCalledWith({
        by: ['source'],
        where: { organizationId: 'org-1' },
        _sum: { credits: true },
      });
    });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:api -- organizations.service`
Expected: FAIL — `service.getUsage is not a function`.

- [ ] **Step 3: Implement `getUsage()`**

Modify `apps/api/src/organizations/organizations.service.ts` — add the import:

```typescript
import { TenantContext, TenantPrismaService } from '@exam-platform/shared';
```

(This replaces the existing `import { TenantContext } from '@exam-platform/shared';` line — merge `TenantPrismaService` into the same import.)

Widen the constructor:

```typescript
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantPrisma: TenantPrismaService,
  ) {}
```

Add this interface near the top of the file, alongside the existing `BrandingResponse` interface:

```typescript
export interface AiCreditUsageResponse {
  aiCreditLimit: number;
  totalUsed: number;
  breakdown: { questionGeneration: number; insightGeneration: number };
}
```

Add this method (after `getPublicBrandingBySlug`, before the `private requireOrganizationId` method):

```typescript
  async getUsage(context: TenantContext): Promise<AiCreditUsageResponse> {
    const organizationId = this.requireOrganizationId(context);

    const org = await this.prisma.organization.findUnique({ where: { id: organizationId }, include: { plan: true } });

    const grouped = await this.tenantPrisma.forTenant(context, (tx) =>
      tx.aiCreditUsage.groupBy({ by: ['source'], where: { organizationId }, _sum: { credits: true } }),
    );

    const breakdown = { questionGeneration: 0, insightGeneration: 0 };
    for (const row of grouped) {
      const credits = row._sum.credits ?? 0;
      if (row.source === 'question_generation') {
        breakdown.questionGeneration = credits;
      } else if (row.source === 'insight_generation') {
        breakdown.insightGeneration = credits;
      }
    }

    return {
      aiCreditLimit: org!.plan.aiCreditLimit,
      totalUsed: breakdown.questionGeneration + breakdown.insightGeneration,
      breakdown,
    };
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test:api -- organizations.service`
Expected: PASS, all specs including the 2 new ones.

- [ ] **Step 5: Add the controller route**

Modify `apps/api/src/organizations/organizations.controller.ts` — add this handler (after `getBranding`, before `updateBrandingColors`):

```typescript
  @Get('usage')
  @RequirePermissions('org:manage_settings')
  getUsage(@CurrentTenant() tenant: TenantContext) {
    return this.organizationsService.getUsage(tenant);
  }
```

- [ ] **Step 6: Confirm the build is clean**

Run: `npm run build --workspace=apps/api`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/organizations
git commit -m "feat: add AI credit usage endpoint to OrganizationsController"
```

---

### Task 4: E2E coverage

**Files:**
- Modify: `apps/api/test/ai-question-generation.e2e-spec.ts`
- Modify: `apps/api/test/ai-evaluation-insight.e2e-spec.ts`
- Create: `apps/api/test/ai-credit-usage.e2e-spec.ts`

**Interfaces:**
- Consumes: `GET /api/v1/organizations/usage` (Task 3), the two existing e2e specs' full setup (recruiter/org-admin tokens, orgs, exams) from Phases 5b/5c.
- Produces: nothing new — this is the last task with real assertions; Task 5 is verification-only.

- [ ] **Step 1: Extend the question-generation e2e spec**

Modify `apps/api/test/ai-question-generation.e2e-spec.ts` — in the existing `it('generates draft questions end-to-end, keeps them out of the active list, and publishes one', ...)` test, add this block immediately after the `const [questionId] = output.questionIds;` line:

```typescript
    const usageResponse = await request(adminHttp)
      .get('/api/v1/organizations/usage')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(200);
    expect(usageResponse.body.breakdown.questionGeneration).toBe(1);
```

- [ ] **Step 2: Extend the insight-generation e2e spec**

Modify `apps/api/test/ai-evaluation-insight.e2e-spec.ts` — in the existing `it('generates a completed insight after settlement, sequenced after proctoring analysis', ...)` test, add this block at the very end, before the test's closing `});`:

```typescript

    const usageResponse = await request(adminHttp)
      .get('/api/v1/organizations/usage')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(200);
    expect(usageResponse.body.breakdown.insightGeneration).toBe(1);
```

- [ ] **Step 3: Run both extended e2e files**

Run: `npm run test:api:e2e -- ai-question-generation`
Expected: PASS, 3/3.

Run: `npm run test:api:e2e -- ai-evaluation-insight`
Expected: PASS, 4/4.

- [ ] **Step 4: Write the new usage-endpoint e2e spec**

Create `apps/api/test/ai-credit-usage.e2e-spec.ts`:

```typescript
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { bootAdminApp } from './dual-app';
import { PrismaService } from '@exam-platform/shared';
import { TenantPrismaService } from '@exam-platform/shared';

describe('AI Credit Usage endpoint', () => {
  let adminApp: INestApplication;
  let adminHttp: any;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let planId: string;
  let orgId: string;
  let orgAdminAccessToken: string;
  let recruiterAccessToken: string;

  beforeAll(async () => {
    adminApp = await bootAdminApp();
    adminHttp = adminApp.getHttpServer();
    prisma = adminApp.get(PrismaService);
    tenantPrisma = adminApp.get(TenantPrismaService);

    const plan = await prisma.plan.create({
      data: { name: `ci-ai-credit-usage-plan-${randomUUID()}`, candidateLimit: 10, aiCreditLimit: 50, proctoringMinutesLimit: 1 },
    });
    planId = plan.id;

    const org = await prisma.organization.create({
      data: { name: 'CI AI Credit Usage Org', slug: `ci-ai-credit-usage-org-${randomUUID()}`, planId },
    });
    orgId = org.id;

    const orgAdminHash = await argon2.hash('OrgAdminPassw0rd!');
    const recruiterHash = await argon2.hash('RecruiterPassw0rd!');
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) =>
      Promise.all([
        tx.user.create({ data: { organizationId: orgId, email: 'orgadmin@ci-ai-credit-usage.test', passwordHash: orgAdminHash, role: 'org_admin' } }),
        tx.user.create({ data: { organizationId: orgId, email: 'recruiter@ci-ai-credit-usage.test', passwordHash: recruiterHash, role: 'recruiter' } }),
      ]),
    );

    orgAdminAccessToken = (
      await request(adminHttp)
        .post('/api/v1/auth/staff/login')
        .send({ organizationSlug: org.slug, email: 'orgadmin@ci-ai-credit-usage.test', password: 'OrgAdminPassw0rd!' })
        .expect(200)
    ).body.accessToken;

    recruiterAccessToken = (
      await request(adminHttp)
        .post('/api/v1/auth/staff/login')
        .send({ organizationSlug: org.slug, email: 'recruiter@ci-ai-credit-usage.test', password: 'RecruiterPassw0rd!' })
        .expect(200)
    ).body.accessToken;
  });

  afterAll(async () => {
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: true }, (tx) => tx.refreshToken.deleteMany({ where: { user: { organizationId: orgId } } }));
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) => tx.user.deleteMany({ where: { organizationId: orgId } }));
    await prisma.organization.delete({ where: { id: orgId } }).catch(() => undefined);
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await adminApp.close();
  });

  it('returns the plan limit and a zero breakdown for an org that has never triggered either AI feature', async () => {
    const response = await request(adminHttp)
      .get('/api/v1/organizations/usage')
      .set('Authorization', `Bearer ${orgAdminAccessToken}`)
      .expect(200);

    expect(response.body).toEqual({
      aiCreditLimit: 50,
      totalUsed: 0,
      breakdown: { questionGeneration: 0, insightGeneration: 0 },
    });
  });

  it('rejects a role without org:manage_settings', async () => {
    await request(adminHttp)
      .get('/api/v1/organizations/usage')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(403);
  });
});
```

- [ ] **Step 5: Run the new e2e file**

Run: `npm run test:api:e2e -- ai-credit-usage`
Expected: PASS, 2/2.

- [ ] **Step 6: Commit**

```bash
git add apps/api/test/ai-question-generation.e2e-spec.ts apps/api/test/ai-evaluation-insight.e2e-spec.ts apps/api/test/ai-credit-usage.e2e-spec.ts
git commit -m "test: cover AI credit usage in question-gen, insight-gen, and a dedicated endpoint spec"
```

---

### Task 5: Final verification

**Files:** none — verification only, no code changes.

- [ ] **Step 1: Run the full `apps/api` unit suite**

Run: `npm run test:api`
Expected: all suites pass, including every new/modified spec from Tasks 2-3 (`ai-question-generation.processor.spec.ts`, `organizations.service.spec.ts`).

- [ ] **Step 2: Run the full `apps/exam-runtime` unit suite**

Run: `npm run test:exam-runtime`
Expected: all suites pass, including `attempt-insight.service.spec.ts`.

- [ ] **Step 3: Run the full `apps/api` e2e suite serially**

Run: `npm run test:api:e2e -- --runInBand`
Expected: every suite passes, including the extended `ai-question-generation.e2e-spec.ts`/`ai-evaluation-insight.e2e-spec.ts` and the new `ai-credit-usage.e2e-spec.ts`, with Redis reachable.

- [ ] **Step 4: Confirm both apps build cleanly**

Run: `npm run build --workspace=apps/api && npm run build --workspace=apps/exam-runtime`
Expected: exit 0 for both.

- [ ] **Step 5: Confirm migration status**

Run: `npx prisma migrate status --schema=apps/api/prisma/schema.prisma`
Expected: both `20260711140000_ai_credit_usage_schema` and `20260711140001_ai_credit_usage_rls` listed as applied, database up to date, nothing pending.

- [ ] **Step 6: Confirm no unintended cross-workspace changes**

Run: `git status --short`
Expected: only files under `apps/api/` (schema, migrations, `src/jobs/processors/`, `src/organizations/`, `test/`) and `apps/exam-runtime/` (`src/attempt-insight/`) show as changed — `packages/shared` and `apps/web` are untouched by this phase.

No commit for this task — verification only, matching this project's established Task-5/Task-4 final-verification precedent.
