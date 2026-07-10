# Phase 5b — AI Question Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a recruiter generate a batch of draft MCQ questions from a topic via the LLM, landing them in the existing question bank as `status: 'draft'` rows for review/edit before publishing — the first real consumer of Phase 5a's async job infrastructure.

**Architecture:** A new `ai-question-generation` job type plugs into the existing `JobProcessor`/`AI_JOB_PROCESSORS` registry from Phase 5a. `POST /api/v1/questions/ai-generate` enqueues a job via the existing `JobsService.enqueue()`; the worker dispatches to a new processor that calls a thin Anthropic client (mirroring the existing `ClaudeProctoringClient` precedent) and inserts valid results as `Question` rows via the existing `TenantPrismaService`. Recruiters review/edit/publish drafts through the existing question-bank endpoints plus one new `POST /questions/:id/publish` action.

**Tech Stack:** NestJS 10, Prisma 5 (SQL Server), BullMQ (existing), `@anthropic-ai/sdk` (new to `apps/api`, already used by `apps/exam-runtime`).

## Global Constraints

- `questionTypes` must be a non-empty subset of `['single_mcq', 'multi_mcq', 'true_false']`; `count` must be an integer in `[1, 20]` — a hard cap on job cost/size.
- Generation is gated by the existing `question_bank:manage` permission — no new permission, no `seed.ts` change.
- LLM model: `claude-sonnet-5` (not the `claude-haiku-4-5` used by proctoring's risk classification).
- `JobProcessor.process(input)` widens to `process(input: unknown, context: TenantContext): Promise<unknown>` — the worker now passes the reconstructed tenant context to every processor. `EchoProcessor` (Phase 5a) is updated to the same signature; this is the only other implementer.
- Generated questions default to `marks: 1, negativeMarks: 0` — generation input doesn't collect per-question marks; the recruiter can edit any draft's marks before publishing, same as any hand-written question.
- If the LLM call itself fails (timeout, malformed/missing tool response, rate limit), the whole job fails and **zero** questions are inserted.
- If the LLM call succeeds but individual questions fail `validateQuestionPayload()` (existing function, unchanged), those are dropped and the job still **completes** with whatever valid questions it produced (even zero) — partial success is still success.
- No new table links a `Question` back to the `AiJob` that created it. The job's own `outputJson` carries the created question IDs.
- No changes needed to `exam-section-question-validation.ts` — it already rejects attaching any `status !== 'active'` question to a section for the first time, so drafts can never leak into a live exam by construction.

---

## File Structure

- **Modify** `apps/api/prisma/schema.prisma` — add `Question.aiGenerated`.
- **Create** `apps/api/prisma/migrations/20260711090000_question_ai_generated_column/migration.sql`.
- **Modify** `apps/api/package.json` — add `@anthropic-ai/sdk`.
- **Modify** `apps/api/src/jobs/processors/job-processor.interface.ts` — widen `process()` signature.
- **Modify** `apps/api/src/jobs/processors/echo.processor.ts` — match the new signature.
- **Modify** `apps/api/src/jobs/processors/echo.processor.spec.ts` — pass a context arg.
- **Modify** `apps/api/src/jobs/ai-jobs.worker.service.ts` — pass `context` into `processor.process()`.
- **Create** `apps/api/src/jobs/processors/claude-question-generation.client.ts` — thin Anthropic wrapper.
- **Create** `apps/api/src/jobs/processors/claude-question-generation.client.spec.ts`.
- **Create** `apps/api/src/jobs/processors/ai-question-generation.processor.ts` — the new `JobProcessor`.
- **Create** `apps/api/src/jobs/processors/ai-question-generation.processor.spec.ts`.
- **Modify** `apps/api/src/jobs/jobs.module.ts` — register the new client + processor.
- **Create** `apps/api/src/questions/dto/ai-generate-questions.dto.ts`.
- **Modify** `apps/api/src/questions/questions.service.ts` — add `aiGenerate()` + `publish()`.
- **Modify** `apps/api/src/questions/questions.service.spec.ts`.
- **Modify** `apps/api/src/questions/questions.controller.ts` — add the two new routes.
- **Modify** `apps/api/src/questions/questions.module.ts` — import `JobsModule`.
- **Create** `apps/api/test/ai-question-generation.e2e-spec.ts`.

---

### Task 1: Schema — `Question.aiGenerated` column

**Files:**
- Modify: `apps/api/prisma/schema.prisma:103-123` (the `Question` model)
- Create: `apps/api/prisma/migrations/20260711090000_question_ai_generated_column/migration.sql`

**Interfaces:**
- Consumes: nothing from earlier tasks (this is Task 1).
- Produces: `Question.aiGenerated: boolean` (default `false`) — Task 2's processor sets this to `true` on insert; Task 3's e2e test asserts it indirectly via the draft/active list split.

- [ ] **Step 1: Add the `aiGenerated` field**

Modify `apps/api/prisma/schema.prisma` — replace the `Question` model with:

```prisma
model Question {
  id             String                @id @default(uuid()) @db.UniqueIdentifier
  organizationId String                @map("organization_id") @db.UniqueIdentifier
  type           String
  text           String                @db.NVarChar(Max)
  topic          String?
  category       String?
  difficulty     String
  marks          Int
  negativeMarks  Int                   @default(0) @map("negative_marks")
  status         String                @default("active")
  aiGenerated    Boolean               @default(false) @map("ai_generated")
  createdBy      String                @map("created_by") @db.UniqueIdentifier
  createdAt      DateTime              @default(now()) @map("created_at")
  options        QuestionOption[]
  examLinks      ExamSectionQuestion[]
  answers        Answer[]
  tags           QuestionTag[]

  @@index([organizationId, topic, difficulty])
  @@map("questions")
}
```

- [ ] **Step 2: Write the migration by hand**

`npx prisma migrate dev --create-only` is expected to fail with a P3014 shadow-database permission error — the same well-documented issue every prior schema-touching phase has hit. Hand-write the migration instead.

Create `apps/api/prisma/migrations/20260711090000_question_ai_generated_column/migration.sql`:

```sql
-- AlterTable
ALTER TABLE [dbo].[questions] ADD [ai_generated] BIT NOT NULL CONSTRAINT [questions_ai_generated_df] DEFAULT 0;
```

No RLS migration is needed: `questions` is already RLS-registered from Phase 0 (it has an `organization_id` column and existing filter/block predicates) — adding a column to an already-registered table needs no new predicate, matching the precedent set by `20260710110000_section_target_duration_schema` (a plain `ALTER TABLE ADD COLUMN` with no companion RLS migration).

- [ ] **Step 3: Apply the migration and regenerate the Prisma client**

Run: `cd apps/api && npx prisma migrate deploy && npx prisma generate && cd ../..`
Expected: exit 0, `20260711090000_question_ai_generated_column` listed as applied.

If `npx prisma generate` fails with `EPERM` on the query-engine DLL, check for and kill any leftover `node`/`jest` process holding the file locked (a now-familiar issue in this project), then retry.

- [ ] **Step 4: Verify directly against the database**

Run against the dev database (via `sqlcmd`, Azure Data Studio, or an ad hoc Prisma script):
```sql
SELECT COLUMN_NAME, DATA_TYPE, COLUMN_DEFAULT FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'questions' AND COLUMN_NAME = 'ai_generated';
```
Expected: one row, `DATA_TYPE = 'bit'`.

- [ ] **Step 5: Confirm the build is still clean**

Run: `npm run build --workspace=apps/api`
Expected: exit 0 — the new field exists in the generated Prisma client but nothing references it yet.

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat: add aiGenerated column to Question model"
```

---

### Task 2: Claude question-generation client + processor + widened `JobProcessor`

**Files:**
- Modify: `apps/api/package.json`
- Modify: `apps/api/src/jobs/processors/job-processor.interface.ts`
- Modify: `apps/api/src/jobs/processors/echo.processor.ts`
- Modify: `apps/api/src/jobs/processors/echo.processor.spec.ts`
- Modify: `apps/api/src/jobs/ai-jobs.worker.service.ts`
- Create: `apps/api/src/jobs/processors/claude-question-generation.client.ts`
- Create: `apps/api/src/jobs/processors/claude-question-generation.client.spec.ts`
- Create: `apps/api/src/jobs/processors/ai-question-generation.processor.ts`
- Create: `apps/api/src/jobs/processors/ai-question-generation.processor.spec.ts`
- Modify: `apps/api/src/jobs/jobs.module.ts`

**Interfaces:**
- Consumes: `Question.aiGenerated` from Task 1. `TenantContext`, `TenantPrismaService` from `@exam-platform/shared`. `validateQuestionPayload(input): void` from `apps/api/src/questions/question-validation.ts` (existing, unchanged).
- Produces: `JobProcessor.process(input: unknown, context: TenantContext): Promise<unknown>` (widened — every future job type implements this shape). `ClaudeQuestionGenerationClient.generate(topic: string, difficulty: string, questionTypes: string[], count: number): Promise<GeneratedQuestion[]>` where `GeneratedQuestion = { type: string; text: string; options: { text: string; isCorrect: boolean }[] }`. `AiQuestionGenerationProcessor` with `type = 'ai-question-generation'`, registered into `AI_JOB_PROCESSORS` — Task 3's `QuestionsService.aiGenerate()` calls `JobsService.enqueue(context, 'ai-question-generation', inputJson, userId)` and relies on this registration existing. The processor's output shape `{ requested: number; created: number; dropped: { reason: string }[]; questionIds: string[] }` is what Task 3's e2e test parses out of `AiJob.outputJson`.

- [ ] **Step 1: Add the `@anthropic-ai/sdk` dependency**

Modify `apps/api/package.json` — add this line to `"dependencies"` (alphabetical, after `"@exam-platform/shared"`):

```json
    "@anthropic-ai/sdk": "^0.32.1",
```

(Matches the exact version already used by `apps/exam-runtime`.)

Run: `npm install --workspace=apps/api`
Expected: exit 0, `apps/api/node_modules/@anthropic-ai/sdk` present.

- [ ] **Step 2: Widen the `JobProcessor` interface**

Modify `apps/api/src/jobs/processors/job-processor.interface.ts`:

```typescript
import { TenantContext } from '@exam-platform/shared';

export interface JobProcessor {
  readonly type: string;
  process(input: unknown, context: TenantContext): Promise<unknown>;
}

export const AI_JOB_PROCESSORS = 'AI_JOB_PROCESSORS';
```

- [ ] **Step 3: Update `EchoProcessor` and its test to match**

Modify `apps/api/src/jobs/processors/echo.processor.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { TenantContext } from '@exam-platform/shared';
import { JobProcessor } from './job-processor.interface';

@Injectable()
export class EchoProcessor implements JobProcessor {
  readonly type = 'echo';

  async process(input: unknown, _context: TenantContext): Promise<unknown> {
    return { echoed: input };
  }
}
```

Modify `apps/api/src/jobs/processors/echo.processor.spec.ts`:

```typescript
import { EchoProcessor } from './echo.processor';

describe('EchoProcessor', () => {
  it('returns the input wrapped in an echoed field', async () => {
    const processor = new EchoProcessor();
    const context = { organizationId: 'org-1', isSuperAdmin: false };

    const result = await processor.process({ message: 'hello' }, context);

    expect(result).toEqual({ echoed: { message: 'hello' } });
  });
});
```

- [ ] **Step 4: Pass `context` through in the worker**

Modify `apps/api/src/jobs/ai-jobs.worker.service.ts` — in `handle()`, change:

```typescript
      const output = await processor.process(JSON.parse(aiJob.inputJson));
```

to:

```typescript
      const output = await processor.process(JSON.parse(aiJob.inputJson), context);
```

- [ ] **Step 5: Run the existing jobs unit tests to confirm the refactor didn't break anything**

Run: `npm run test:api -- jobs`
Expected: `echo.processor.spec.ts` and `jobs.service.spec.ts` both pass (`AiJobsWorkerService` has no dedicated spec — this is a plan-mandated gap carried over from Phase 5a, not introduced here).

- [ ] **Step 6: Write the failing test for `ClaudeQuestionGenerationClient`**

Create `apps/api/src/jobs/processors/claude-question-generation.client.spec.ts`:

```typescript
jest.mock('@anthropic-ai/sdk');

import Anthropic from '@anthropic-ai/sdk';
import { ClaudeQuestionGenerationClient } from './claude-question-generation.client';

describe('ClaudeQuestionGenerationClient', () => {
  let client: ClaudeQuestionGenerationClient;
  let mockCreate: jest.Mock;

  beforeEach(() => {
    mockCreate = jest.fn();
    (Anthropic as unknown as jest.Mock).mockImplementation(() => ({
      messages: { create: mockCreate },
    }));
    process.env.ANTHROPIC_API_KEY = 'test-key';
    client = new ClaudeQuestionGenerationClient();
  });

  const validQuestions = [
    {
      type: 'single_mcq',
      text: 'What is 2+2?',
      options: [
        { text: '3', isCorrect: false },
        { text: '4', isCorrect: true },
      ],
    },
  ];

  it('returns the generated questions from a valid tool_use response', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'tool_use', name: 'report_generated_questions', input: { questions: validQuestions } }],
    });

    const result = await client.generate('arithmetic', 'easy', ['single_mcq'], 1);

    expect(result).toEqual(validQuestions);
  });

  it('forces the report_generated_questions tool via tool_choice, using the sonnet model', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'tool_use', name: 'report_generated_questions', input: { questions: validQuestions } }],
    });

    await client.generate('arithmetic', 'easy', ['single_mcq'], 1);

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-sonnet-5',
        tool_choice: { type: 'tool', name: 'report_generated_questions' },
        tools: [expect.objectContaining({ name: 'report_generated_questions' })],
      }),
    );
  });

  it('throws when the response contains no tool_use block', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'I cannot help with that.' }] });

    await expect(client.generate('arithmetic', 'easy', ['single_mcq'], 1)).rejects.toThrow(
      'Claude did not return a valid report_generated_questions tool call',
    );
  });

  it('throws when the tool_use input is missing a questions array', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'tool_use', name: 'report_generated_questions', input: {} }],
    });

    await expect(client.generate('arithmetic', 'easy', ['single_mcq'], 1)).rejects.toThrow(
      'Claude returned malformed generated questions',
    );
  });

  it('propagates an error thrown by the Anthropic API call', async () => {
    mockCreate.mockRejectedValue(new Error('rate limited'));

    await expect(client.generate('arithmetic', 'easy', ['single_mcq'], 1)).rejects.toThrow('rate limited');
  });
});
```

- [ ] **Step 7: Run the test to verify it fails**

Run: `npm run test:api -- claude-question-generation.client`
Expected: FAIL — `Cannot find module './claude-question-generation.client'`.

- [ ] **Step 8: Implement `ClaudeQuestionGenerationClient`**

Create `apps/api/src/jobs/processors/claude-question-generation.client.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';

export interface GeneratedQuestionOption {
  text: string;
  isCorrect: boolean;
}

export interface GeneratedQuestion {
  type: string;
  text: string;
  options: GeneratedQuestionOption[];
}

const GENERATE_QUESTIONS_TOOL = {
  name: 'report_generated_questions',
  description: 'Report a set of generated multiple-choice exam questions.',
  input_schema: {
    type: 'object' as const,
    properties: {
      questions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['single_mcq', 'multi_mcq', 'true_false'] },
            text: { type: 'string', description: 'The question stem.' },
            options: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  text: { type: 'string' },
                  isCorrect: { type: 'boolean' },
                },
                required: ['text', 'isCorrect'],
              },
            },
          },
          required: ['type', 'text', 'options'],
        },
      },
    },
    required: ['questions'],
  },
};

@Injectable()
export class ClaudeQuestionGenerationClient {
  private readonly client: Anthropic;

  constructor() {
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  async generate(topic: string, difficulty: string, questionTypes: string[], count: number): Promise<GeneratedQuestion[]> {
    const response = await this.client.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 4096,
      tools: [GENERATE_QUESTIONS_TOOL],
      tool_choice: { type: 'tool', name: 'report_generated_questions' },
      messages: [
        {
          role: 'user',
          content:
            `Generate ${count} multiple-choice exam question(s) about "${topic}" at "${difficulty}" difficulty. ` +
            `Use only these question types: ${questionTypes.join(', ')}. You decide how many questions to generate ` +
            'of each type, but the total must equal the requested count.\n\n' +
            'Follow these type rules exactly:\n' +
            '- single_mcq: exactly 1 correct option, at least 2 options total.\n' +
            '- multi_mcq: at least 1 correct option, at least 2 options total.\n' +
            '- true_false: exactly 2 options, exactly 1 correct.',
        },
      ],
    });

    const toolUse = response.content.find(
      (block: { type: string }) => block.type === 'tool_use',
    ) as { type: 'tool_use'; input: unknown } | undefined;

    if (!toolUse || typeof toolUse.input !== 'object' || toolUse.input === null) {
      throw new Error('Claude did not return a valid report_generated_questions tool call');
    }

    const input = toolUse.input as { questions?: unknown };
    if (!Array.isArray(input.questions)) {
      throw new Error('Claude returned malformed generated questions');
    }

    return input.questions as GeneratedQuestion[];
  }
}
```

- [ ] **Step 9: Run the test to verify it passes**

Run: `npm run test:api -- claude-question-generation.client`
Expected: PASS, 5/5.

- [ ] **Step 10: Write the failing test for `AiQuestionGenerationProcessor`**

Create `apps/api/src/jobs/processors/ai-question-generation.processor.spec.ts`:

```typescript
import { AiQuestionGenerationProcessor } from './ai-question-generation.processor';

describe('AiQuestionGenerationProcessor', () => {
  let processor: AiQuestionGenerationProcessor;
  let claudeClient: { generate: jest.Mock };
  let tenantPrisma: { forTenant: jest.Mock };
  const context = { organizationId: 'org-1', isSuperAdmin: false };
  const input = { topic: 'JavaScript closures', difficulty: 'medium', questionTypes: ['single_mcq'], count: 2, requestedBy: 'user-1' };

  beforeEach(() => {
    claudeClient = { generate: jest.fn() };
    tenantPrisma = { forTenant: jest.fn() };
    processor = new AiQuestionGenerationProcessor(claudeClient as any, tenantPrisma as any);
  });

  it('inserts every valid generated question as a draft, ai-generated row', async () => {
    claudeClient.generate.mockResolvedValue([
      {
        type: 'single_mcq',
        text: 'What does a closure capture?',
        options: [
          { text: 'Its enclosing scope', isCorrect: true },
          { text: 'Nothing', isCorrect: false },
        ],
      },
      {
        type: 'true_false',
        text: 'Closures are unique to JavaScript.',
        options: [
          { text: 'True', isCorrect: false },
          { text: 'False', isCorrect: true },
        ],
      },
    ]);
    const create = jest.fn().mockResolvedValueOnce({ id: 'q-1' }).mockResolvedValueOnce({ id: 'q-2' });
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn({ question: { create } }));

    const result = await processor.process(input, context);

    expect(result).toEqual({ requested: 2, created: 2, dropped: [], questionIds: ['q-1', 'q-2'] });
    expect(create).toHaveBeenNthCalledWith(1, {
      data: {
        organizationId: 'org-1',
        type: 'single_mcq',
        text: 'What does a closure capture?',
        topic: 'JavaScript closures',
        difficulty: 'medium',
        marks: 1,
        negativeMarks: 0,
        status: 'draft',
        aiGenerated: true,
        createdBy: 'user-1',
        options: {
          create: [
            { text: 'Its enclosing scope', isCorrect: true, orderIndex: 0 },
            { text: 'Nothing', isCorrect: false, orderIndex: 1 },
          ],
        },
      },
    });
  });

  it('drops questions that fail validation and still completes with the valid ones', async () => {
    claudeClient.generate.mockResolvedValue([
      {
        type: 'single_mcq',
        text: 'Valid question',
        options: [
          { text: 'A', isCorrect: true },
          { text: 'B', isCorrect: false },
        ],
      },
      {
        type: 'single_mcq',
        text: 'Invalid: two correct answers',
        options: [
          { text: 'A', isCorrect: true },
          { text: 'B', isCorrect: true },
        ],
      },
    ]);
    const create = jest.fn().mockResolvedValue({ id: 'q-1' });
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn({ question: { create } }));

    const result = await processor.process(input, context);

    expect(result.created).toBe(1);
    expect(result.dropped).toHaveLength(1);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('completes with zero created questions when every generated question fails validation', async () => {
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
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn({ question: { create: jest.fn() } }));

    const result = await processor.process(input, context);

    expect(result).toEqual({ requested: 2, created: 0, dropped: [{ reason: expect.any(String) }], questionIds: [] });
  });

  it('propagates an error thrown by the Claude client, failing the whole job with zero inserts', async () => {
    claudeClient.generate.mockRejectedValue(new Error('rate limited'));

    await expect(processor.process(input, context)).rejects.toThrow('rate limited');
    expect(tenantPrisma.forTenant).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 11: Run the test to verify it fails**

Run: `npm run test:api -- ai-question-generation.processor`
Expected: FAIL — `Cannot find module './ai-question-generation.processor'`.

- [ ] **Step 12: Implement `AiQuestionGenerationProcessor`**

Create `apps/api/src/jobs/processors/ai-question-generation.processor.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { JobProcessor } from './job-processor.interface';
import { ClaudeQuestionGenerationClient, GeneratedQuestion } from './claude-question-generation.client';
import { validateQuestionPayload } from '../../questions/question-validation';

interface AiQuestionGenerationInput {
  topic: string;
  difficulty: string;
  questionTypes: string[];
  count: number;
  requestedBy: string;
}

interface DroppedQuestion {
  reason: string;
}

interface AiQuestionGenerationOutput {
  requested: number;
  created: number;
  dropped: DroppedQuestion[];
  questionIds: string[];
}

@Injectable()
export class AiQuestionGenerationProcessor implements JobProcessor {
  readonly type = 'ai-question-generation';

  constructor(
    private readonly claudeClient: ClaudeQuestionGenerationClient,
    private readonly tenantPrisma: TenantPrismaService,
  ) {}

  async process(input: unknown, context: TenantContext): Promise<AiQuestionGenerationOutput> {
    const { topic, difficulty, questionTypes, count, requestedBy } = input as AiQuestionGenerationInput;

    const generated = await this.claudeClient.generate(topic, difficulty, questionTypes, count);

    const valid: GeneratedQuestion[] = [];
    const dropped: DroppedQuestion[] = [];
    for (const question of generated) {
      try {
        validateQuestionPayload({
          type: question.type,
          difficulty,
          marks: 1,
          negativeMarks: 0,
          options: question.options,
        });
        valid.push(question);
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'Unknown validation error';
        dropped.push({ reason });
      }
    }

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
      return ids;
    });

    return { requested: count, created: questionIds.length, dropped, questionIds };
  }
}
```

- [ ] **Step 13: Run the test to verify it passes**

Run: `npm run test:api -- ai-question-generation.processor`
Expected: PASS, 4/4.

- [ ] **Step 14: Wire the new client and processor into `JobsModule`**

Modify `apps/api/src/jobs/jobs.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { REDIS_CONNECTION, createRedisConnection } from './redis-connection';
import { AI_JOBS_QUEUE, createAiJobsQueue } from './ai-jobs.queue';
import { AI_JOB_PROCESSORS } from './processors/job-processor.interface';
import { EchoProcessor } from './processors/echo.processor';
import { ClaudeQuestionGenerationClient } from './processors/claude-question-generation.client';
import { AiQuestionGenerationProcessor } from './processors/ai-question-generation.processor';
import { AiJobsWorkerService } from './ai-jobs.worker.service';
import { JobsService } from './jobs.service';
import { JobsController } from './jobs.controller';

@Module({
  controllers: [JobsController],
  providers: [
    { provide: REDIS_CONNECTION, useFactory: createRedisConnection },
    { provide: AI_JOBS_QUEUE, useFactory: createAiJobsQueue, inject: [REDIS_CONNECTION] },
    EchoProcessor,
    ClaudeQuestionGenerationClient,
    AiQuestionGenerationProcessor,
    {
      provide: AI_JOB_PROCESSORS,
      useFactory: (echo: EchoProcessor, aiQuestionGeneration: AiQuestionGenerationProcessor) => [echo, aiQuestionGeneration],
      inject: [EchoProcessor, AiQuestionGenerationProcessor],
    },
    AiJobsWorkerService,
    JobsService,
  ],
  exports: [JobsService],
})
export class JobsModule {}
```

- [ ] **Step 15: Confirm the build is clean and the full jobs unit suite passes**

Run: `npm run build --workspace=apps/api`
Expected: exit 0.

Run: `npm run test:api -- jobs`
Expected: PASS, all specs under `src/jobs/` including the two new files and the updated `echo.processor.spec.ts`.

- [ ] **Step 16: Commit**

```bash
git add apps/api/package.json apps/api/package-lock.json apps/api/src/jobs
git commit -m "feat: add Claude question-generation client and processor"
```

---

### Task 3: HTTP surface — `ai-generate` + `publish` endpoints, e2e test

**Files:**
- Create: `apps/api/src/questions/dto/ai-generate-questions.dto.ts`
- Modify: `apps/api/src/questions/questions.service.ts`
- Modify: `apps/api/src/questions/questions.service.spec.ts`
- Modify: `apps/api/src/questions/questions.controller.ts`
- Modify: `apps/api/src/questions/questions.module.ts`
- Create: `apps/api/test/ai-question-generation.e2e-spec.ts`

**Interfaces:**
- Consumes: `JobsService.enqueue(context, type, inputJson, userId): Promise<AiJob>` (Phase 5a). `'ai-question-generation'` job type and its output shape `{ requested, created, dropped, questionIds }` (Task 2). `GET /api/v1/ai-jobs/:id` (Phase 5a, unchanged) for polling.
- Produces: `POST /api/v1/questions/ai-generate` → `{ aiJobId: string }`. `POST /api/v1/questions/:id/publish` → the same `QuestionResponse` shape every other question-bank endpoint returns, with `status: 'active'`.

- [ ] **Step 1: Write the failing service tests**

Modify `apps/api/src/questions/questions.service.spec.ts` — add the `JobsService` import and mock, and two new `describe` blocks. Replace the top of the file (imports through `beforeEach`) with:

```typescript
import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { QuestionsService } from './questions.service';
import { TenantPrismaService } from '@exam-platform/shared';
import { JobsService } from '../jobs/jobs.service';

describe('QuestionsService', () => {
  let service: QuestionsService;
  let tenantPrisma: { forTenant: jest.Mock };
  let jobsService: { enqueue: jest.Mock };
  const context = { organizationId: 'org-1', isSuperAdmin: false };

  beforeEach(async () => {
    tenantPrisma = { forTenant: jest.fn() };
    jobsService = { enqueue: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        QuestionsService,
        { provide: TenantPrismaService, useValue: tenantPrisma },
        { provide: JobsService, useValue: jobsService },
      ],
    }).compile();
    service = moduleRef.get(QuestionsService);
  });
```

(Everything after this in the existing file — `validDto` through the closing `});` — is unchanged.)

Add these two `describe` blocks at the end of the file, immediately before the final closing `});`:

```typescript
  describe('aiGenerate', () => {
    it('enqueues an ai-question-generation job with the request fields plus the requesting user', async () => {
      jobsService.enqueue.mockResolvedValue({ id: 'job-1' });

      const result = await service.aiGenerate(context, 'user-1', {
        topic: 'React hooks',
        difficulty: 'medium',
        questionTypes: ['single_mcq'],
        count: 5,
      });

      expect(result).toEqual({ aiJobId: 'job-1' });
      expect(jobsService.enqueue).toHaveBeenCalledWith(
        context,
        'ai-question-generation',
        JSON.stringify({ topic: 'React hooks', difficulty: 'medium', questionTypes: ['single_mcq'], count: 5, requestedBy: 'user-1' }),
        'user-1',
      );
    });
  });

  describe('publish', () => {
    it('publishes a draft question by setting status to active', async () => {
      const tx = {
        question: {
          findFirst: jest.fn().mockResolvedValue({ id: 'q-1' }),
          update: jest.fn().mockResolvedValue({ id: 'q-1', status: 'active', tags: [] }),
        },
      };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.publish(context, 'q-1');

      expect(result.status).toBe('active');
      expect(tx.question.update).toHaveBeenCalledWith({
        where: { id: 'q-1' },
        data: { status: 'active' },
        include: { options: true, tags: { include: { tag: true } } },
      });
    });

    it('throws NotFoundException when publishing a question that does not exist', async () => {
      const tx = { question: { findFirst: jest.fn().mockResolvedValue(null) } };
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await expect(service.publish(context, 'missing-id')).rejects.toThrow(NotFoundException);
    });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:api -- questions.service`
Expected: FAIL — `service.aiGenerate is not a function` / `service.publish is not a function`.

- [ ] **Step 3: Create the DTO**

Create `apps/api/src/questions/dto/ai-generate-questions.dto.ts`:

```typescript
import { ArrayMinSize, IsArray, IsIn, IsInt, IsString, Max, Min } from 'class-validator';

export class AiGenerateQuestionsDto {
  @IsString()
  topic!: string;

  @IsIn(['easy', 'medium', 'hard'])
  difficulty!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsIn(['single_mcq', 'multi_mcq', 'true_false'], { each: true })
  questionTypes!: string[];

  @IsInt()
  @Min(1)
  @Max(20)
  count!: number;
}
```

- [ ] **Step 4: Implement `aiGenerate()` and `publish()`**

Modify `apps/api/src/questions/questions.service.ts` — add the import and widen the constructor:

```typescript
import { JobsService } from '../jobs/jobs.service';
import { AiGenerateQuestionsDto } from './dto/ai-generate-questions.dto';
```

```typescript
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly jobsService: JobsService,
  ) {}
```

Add these two methods (after `archive()`, at the end of the class body):

```typescript
  async aiGenerate(context: TenantContext, userId: string, dto: AiGenerateQuestionsDto): Promise<{ aiJobId: string }> {
    const inputJson = JSON.stringify({
      topic: dto.topic,
      difficulty: dto.difficulty,
      questionTypes: dto.questionTypes,
      count: dto.count,
      requestedBy: userId,
    });
    const aiJob = await this.jobsService.enqueue(context, 'ai-question-generation', inputJson, userId);
    return { aiJobId: aiJob.id };
  }

  async publish(context: TenantContext, id: string): Promise<QuestionResponse> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const existing = await tx.question.findFirst({ where: { id, organizationId: context.organizationId as string } });
      if (!existing) {
        throw new NotFoundException(`Question ${id} not found`);
      }
      const published = await tx.question.update({
        where: { id },
        data: { status: 'active' },
        include: { options: true, tags: { include: { tag: true } } },
      });
      return this.toResponse(published as QuestionWithRelations);
    });
  }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test:api -- questions.service`
Expected: PASS, all specs including the 3 new ones.

- [ ] **Step 6: Add the controller routes**

Modify `apps/api/src/questions/questions.controller.ts` — add the import:

```typescript
import { AiGenerateQuestionsDto } from './dto/ai-generate-questions.dto';
```

Add these two handlers (`ai-generate` after `create()`; `publish` after `archive()`):

```typescript
  @Post('ai-generate')
  @RequirePermissions('question_bank:manage')
  aiGenerate(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Body() dto: AiGenerateQuestionsDto) {
    return this.questionsService.aiGenerate(tenant, userId, dto);
  }
```

```typescript
  @Post(':id/publish')
  @RequirePermissions('question_bank:manage')
  publish(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.questionsService.publish(tenant, id);
  }
```

- [ ] **Step 7: Import `JobsModule` into `QuestionsModule`**

Modify `apps/api/src/questions/questions.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { QuestionsController } from './questions.controller';
import { QuestionsService } from './questions.service';
import { TagsController } from './tags.controller';
import { TagsService } from './tags.service';
import { JobsModule } from '../jobs/jobs.module';

@Module({
  imports: [JobsModule],
  controllers: [QuestionsController, TagsController],
  providers: [QuestionsService, TagsService],
  exports: [QuestionsService],
})
export class QuestionsModule {}
```

- [ ] **Step 8: Confirm the build is clean**

Run: `npm run build --workspace=apps/api`
Expected: exit 0. (`QuestionsModule` importing `JobsModule` and `JobsModule` never importing `QuestionsModule` back — no circular dependency, since the new processor writes `Question` rows directly via `TenantPrismaService`, not through `QuestionsService`.)

- [ ] **Step 9: Write the e2e test**

Create `apps/api/test/ai-question-generation.e2e-spec.ts`:

```typescript
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { bootAdminApp } from './dual-app';
import { PrismaService } from '@exam-platform/shared';
import { TenantPrismaService } from '@exam-platform/shared';
import { ClaudeQuestionGenerationClient } from '../src/jobs/processors/claude-question-generation.client';

describe('AI Question Generation flow', () => {
  let adminApp: INestApplication;
  let adminHttp: any;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let planId: string;
  let orgId: string;
  let recruiterAccessToken: string;
  const fakeClaudeClient = { generate: jest.fn() };

  beforeAll(async () => {
    adminApp = await bootAdminApp((builder) => builder.overrideProvider(ClaudeQuestionGenerationClient).useValue(fakeClaudeClient));
    adminHttp = adminApp.getHttpServer();
    prisma = adminApp.get(PrismaService);
    tenantPrisma = adminApp.get(TenantPrismaService);

    const plan = await prisma.plan.create({
      data: { name: `ci-ai-questiongen-plan-${randomUUID()}`, candidateLimit: 10, aiCreditLimit: 1, proctoringMinutesLimit: 1 },
    });
    planId = plan.id;

    const org = await prisma.organization.create({
      data: { name: 'CI AI QuestionGen Org', slug: `ci-ai-questiongen-org-${randomUUID()}`, planId },
    });
    orgId = org.id;

    const recruiterHash = await argon2.hash('RecruiterPassw0rd!');
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) =>
      tx.user.create({ data: { organizationId: orgId, email: 'recruiter@ci-ai-questiongen.test', passwordHash: recruiterHash, role: 'recruiter' } }),
    );

    recruiterAccessToken = (
      await request(adminHttp)
        .post('/api/v1/auth/staff/login')
        .send({ organizationSlug: org.slug, email: 'recruiter@ci-ai-questiongen.test', password: 'RecruiterPassw0rd!' })
        .expect(200)
    ).body.accessToken;
  });

  afterAll(async () => {
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) => tx.aiJob.deleteMany({ where: { organizationId: orgId } }));
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) => tx.question.deleteMany({ where: { organizationId: orgId } }));
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: true }, (tx) => tx.refreshToken.deleteMany({ where: { user: { organizationId: orgId } } }));
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) => tx.user.deleteMany({ where: { organizationId: orgId } }));
    await prisma.organization.delete({ where: { id: orgId } }).catch(() => undefined);
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await adminApp.close();
  });

  async function pollJob(aiJobId: string): Promise<{ status: string; outputJson: string | null }> {
    let statusBody: { status: string; outputJson: string | null } = { status: 'pending', outputJson: null };
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const statusResponse = await request(adminHttp)
        .get(`/api/v1/ai-jobs/${aiJobId}`)
        .set('Authorization', `Bearer ${recruiterAccessToken}`)
        .expect(200);
      statusBody = statusResponse.body;
      if (statusBody.status === 'completed' || statusBody.status === 'failed') {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    return statusBody;
  }

  it('generates draft questions end-to-end, keeps them out of the active list, and publishes one', async () => {
    fakeClaudeClient.generate.mockResolvedValueOnce([
      {
        type: 'single_mcq',
        text: 'What is a closure?',
        options: [
          { text: 'A function bound to its lexical scope', isCorrect: true },
          { text: 'A loop', isCorrect: false },
        ],
      },
    ]);

    const generateResponse = await request(adminHttp)
      .post('/api/v1/questions/ai-generate')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ topic: 'JavaScript closures', difficulty: 'medium', questionTypes: ['single_mcq'], count: 1 })
      .expect(201);

    const { aiJobId } = generateResponse.body;
    const finalStatus = await pollJob(aiJobId);

    expect(finalStatus.status).toBe('completed');
    const output = JSON.parse(finalStatus.outputJson as string);
    expect(output.created).toBe(1);
    expect(output.questionIds).toHaveLength(1);
    const [questionId] = output.questionIds;

    const draftListResponse = await request(adminHttp)
      .get('/api/v1/questions?status=draft')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(200);
    expect(draftListResponse.body.map((q: { id: string }) => q.id)).toContain(questionId);

    const activeListResponse = await request(adminHttp)
      .get('/api/v1/questions')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(200);
    expect(activeListResponse.body.map((q: { id: string }) => q.id)).not.toContain(questionId);

    const publishResponse = await request(adminHttp)
      .post(`/api/v1/questions/${questionId}/publish`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(201);
    expect(publishResponse.body.status).toBe('active');

    const activeListAfterPublish = await request(adminHttp)
      .get('/api/v1/questions')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(200);
    expect(activeListAfterPublish.body.map((q: { id: string }) => q.id)).toContain(questionId);
  });

  it('fails the job with zero questions created when the Claude client throws', async () => {
    fakeClaudeClient.generate.mockRejectedValueOnce(new Error('rate limited'));

    const generateResponse = await request(adminHttp)
      .post('/api/v1/questions/ai-generate')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ topic: 'Networking', difficulty: 'hard', questionTypes: ['single_mcq'], count: 3 })
      .expect(201);

    const finalStatus = await pollJob(generateResponse.body.aiJobId);

    expect(finalStatus.status).toBe('failed');
  });

  it('rejects a count above the cap of 20', async () => {
    await request(adminHttp)
      .post('/api/v1/questions/ai-generate')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ topic: 'Networking', difficulty: 'hard', questionTypes: ['single_mcq'], count: 21 })
      .expect(400);
  });
});
```

- [ ] **Step 10: Run the new e2e file**

Run: `npm run test:api:e2e -- ai-question-generation`
Expected: PASS, 3/3. (Requires Redis reachable at `localhost:6379` — same dev-infra requirement Phase 5a introduced for the whole `apps/api` e2e suite; if the port is already occupied by another local container, reuse it as Phase 5a's own tasks did.)

- [ ] **Step 11: Commit**

```bash
git add apps/api/src/questions apps/api/test/ai-question-generation.e2e-spec.ts
git commit -m "feat: add AI question-generation and publish endpoints to the question bank"
```

---

### Task 4: Final verification

**Files:** none — verification only, no code changes.

- [ ] **Step 1: Run the full `apps/api` unit suite**

Run: `npm run test:api`
Expected: all suites pass, including every new/modified spec from Tasks 1-3 (`echo.processor.spec.ts`, `claude-question-generation.client.spec.ts`, `ai-question-generation.processor.spec.ts`, `questions.service.spec.ts`).

- [ ] **Step 2: Run the full `apps/api` e2e suite serially**

Run: `npm run test:api:e2e -- --runInBand`
Expected: every suite passes, including the new `ai-question-generation.e2e-spec.ts`, with Redis reachable. If port 6379 is occupied by an unrelated container on the dev machine (as happened repeatedly in Phase 5a), confirm it's reachable and reuse it rather than fighting the port conflict.

- [ ] **Step 3: Confirm the build is clean**

Run: `npm run build --workspace=apps/api`
Expected: exit 0.

- [ ] **Step 4: Confirm migration status**

Run: `npx prisma migrate status --schema=apps/api/prisma/schema.prisma`
Expected: `20260711090000_question_ai_generated_column` listed as applied, database up to date, nothing pending.

- [ ] **Step 5: Confirm no unintended cross-workspace changes**

Run: `git status --short`
Expected: only files under `apps/api/` (schema, migrations, package.json/package-lock.json, `src/jobs/`, `src/questions/`, `test/`) show as changed — `packages/shared`, `apps/exam-runtime`, and `apps/web` are untouched by this phase.

No commit for this task — verification only, matching the Phase 5a Task 4 precedent.
