# AI Question Generation — Stage 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the already-built AI question generation reachable from the Question Bank, with a review step, so a recruiter can generate MCQ questions from a topic and publish only the ones they approve.

**Architecture:** The generation pipeline already exists end to end (endpoint → `AiJob` → worker → provider → questions written as `status:'draft'`). This stage fixes four defects in the processor, then builds the missing UI: a generate modal, job polling, and a Drafts view over the existing list and publish endpoints. No new pipeline, no new job type.

**Tech Stack:** NestJS + Prisma + Azure SQL (`apps/api`), Next.js 16 + React Query + Testing Library (`apps/web`). Existing: `AiJob` queue/worker, `AiProvider.generateStructured`, `validateQuestionPayload`, `ai_credit_usage`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-12-ai-question-generation-design.md`. **Stage 1 only.**
- **NOT in this stage:** code questions, job-description input, seed-question input, "your own material" upload. All later stages.
- **Generated questions are NEVER auto-published.** They are written `status: 'draft'` and only a human publishing them makes them usable.
- **A draft must never be addable to an exam.** `validateSectionQuestionsReplace` (`apps/api/src/exams/exam-section-question-validation.ts:26`) already enforces this by refusing any newly-added question whose status is not `active`. This guard is load-bearing — do not weaken it, and Task 10 pins it with a test.
- **Question types in this stage:** `single_mcq`, `multi_mcq`, `true_false` only. The existing DTO already restricts to these — do not add `code`.
- Endpoints already exist and must be reused, not rebuilt: `POST /questions/ai-generate`, `GET /ai-jobs/:id` (note: `ai-jobs`, not `jobs`), `POST /questions/:id/publish`, `GET /questions?status=draft`.
- The `ai_jobs:view` permission is already seeded and granted to `recruiter` (`apps/api/prisma/seed.ts:36`). No RBAC changes needed.
- **Migrations:** write the SQL by hand and never run `prisma migrate dev` (no shadow-DB permission on this project). `npx prisma generate` is fine. Timestamp defaults use `GETUTCDATE()`, never `CURRENT_TIMESTAMP`.
- **Paths in command examples say `D:/exam app`; that is the path this plan was written against, not
  necessarily where you are working.** Run every command from the root of YOUR checkout. If you are
  in a worktree, stay in it -- never `cd` into another checkout, because they share junctioned
  `node_modules` and built workspace packages.
- Run the changed workspace's `npx jest` (`--maxWorkers=2` for the two Nest apps — the default OOMs V8 on this machine) and `npx tsc --noEmit` before every commit. Run the `apps/web` suite from inside `apps/web` with `-w 2`.

---

## File structure

| File | Responsibility |
|---|---|
| `apps/api/prisma/schema.prisma` | Add `Question.aiJobId` + the `AiJob.questions` back-relation. |
| `apps/api/prisma/migrations/20260813000000_question_ai_job/migration.sql` | The additive column + FK. |
| `apps/api/src/jobs/processors/job-processor.interface.ts` | Widen `process()` to receive the job id. |
| `apps/api/src/jobs/ai-jobs.worker.service.ts` | Pass the job id through. |
| `apps/api/src/jobs/processors/echo.processor.ts` | Signature update only. |
| `apps/api/src/jobs/processors/ai-question-generation.processor.ts` | The four fixes: requested marks/tags, `aiJobId`, `sourceId`, keep dropped reasons. |
| `apps/api/src/questions/dto/ai-generate-questions.dto.ts` | Accept `marks`, `negativeMarks`, `tagIds`. |
| `apps/api/src/questions/questions.service.ts` | Thread the new fields into the job input. |
| `apps/web/lib/hooks/useQuestions.ts` | `useGenerateQuestions`, `useAiJob`. Discard reuses the existing `useArchiveQuestion` — see below. |
| `apps/web/components/GenerateQuestionsModal.tsx` | The generate form + job progress + result summary. |
| `apps/web/app/(recruiter)/questions/page.tsx` | Drafts status option, badge, row actions, bulk actions. |

---

### Task 1: Stage 0 — quality probe (GATE, no production code)

**This task can change the rest of the plan.** Nobody has ever run this endpoint. Do it first and report before writing any feature code.

**Files:**
- Create: `docs/superpowers/notes/2026-08-12-question-generation-quality.md`

**Interfaces:**
- Produces: a written judgement on generation quality. No code.

- [ ] **Step 1: Find an organization with an AI key configured**

Run against the local dev database:

```bash
cd "D:/exam app/apps/api" && npx prisma studio
```

Look at the `organizations` table for a row where `ai_api_key_encrypted` is not null. Note its `id` and `ai_provider`. If no organization has a key, STOP and report — the probe cannot run and Task 2 onward is building on an untested prompt.

- [ ] **Step 2: Trigger generation through the real endpoint**

Log in as a recruiter in that org and call the endpoint (replace `<TOKEN>`):

```bash
curl -s -X POST http://localhost:3001/api/v1/questions/ai-generate \
  -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  -d '{"topic":"SQL joins","difficulty":"medium","questionTypes":["single_mcq"],"count":5}'
```

Expected: `{"aiJobId":"<uuid>"}`.

- [ ] **Step 3: Poll the job until it completes**

```bash
curl -s http://localhost:3001/api/v1/ai-jobs/<aiJobId> -H "Authorization: Bearer <TOKEN>"
```

Expected: `status` moves `pending` → `completed`, and `outputJson` contains `{"requested":5,"created":N,"dropped":[...],"questionIds":[...]}`.

- [ ] **Step 4: Read the actual questions**

```bash
curl -s "http://localhost:3001/api/v1/questions?status=draft&pageSize=20" -H "Authorization: Bearer <TOKEN>"
```

- [ ] **Step 5: Write the judgement**

Create `docs/superpowers/notes/2026-08-12-question-generation-quality.md` recording, for each generated question: is it factually correct, is exactly one option correct for `single_mcq`, are the distractors plausible rather than obviously wrong, and would you put it in front of a candidate. Then a plain verdict: **usable as-is / needs prompt work / unusable**.

Also record how many of the 5 were dropped and why — that number tells you whether the prompt or the validator is the problem.

- [ ] **Step 6: Decide and report**

If the verdict is "needs prompt work" or "unusable", STOP and report before continuing. The prompt lives in `apps/api/src/jobs/processors/question-generation.client.ts` and fixing it is cheaper now than after a UI is built on top.

- [ ] **Step 7: Commit**

```bash
git add docs/superpowers/notes/2026-08-12-question-generation-quality.md
git commit -m "docs: record AI question generation quality probe"
```

---

### Task 2: Schema — link a generated question to its job

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (`model Question` ~line 234, `model AiJob` ~line 649)
- Create: `apps/api/prisma/migrations/20260813000000_question_ai_job/migration.sql`

**Interfaces:**
- Produces: `Question.aiJobId: string | null`, readable through the existing `toResponse` spread (no mapper change needed).

- [ ] **Step 1: Add the field to `model Question`**

In `apps/api/prisma/schema.prisma`, inside `model Question`, after the `aiGenerated` line:

```prisma
  aiJobId          String?               @map("ai_job_id") @db.UniqueIdentifier
```

And in the relations block of the same model, after `tags QuestionTag[]`:

```prisma
  aiJob            AiJob?                @relation(fields: [aiJobId], references: [id], onDelete: SetNull)
```

- [ ] **Step 2: Add the back-relation to `model AiJob`**

In `model AiJob`, after the `updatedAt` line:

```prisma
  questions      Question[]
```

- [ ] **Step 3: Write the migration by hand**

Create `apps/api/prisma/migrations/20260813000000_question_ai_job/migration.sql`:

```sql
ALTER TABLE [dbo].[questions] ADD [ai_job_id] UNIQUEIDENTIFIER NULL;

ALTER TABLE [dbo].[questions]
  ADD CONSTRAINT [questions_ai_job_id_fkey]
  FOREIGN KEY ([ai_job_id]) REFERENCES [dbo].[ai_jobs]([id])
  ON DELETE SET NULL ON UPDATE CASCADE;
```

`ON UPDATE CASCADE` is not arbitrary: it is what Prisma generates by default for an optional
relation with no explicit `onUpdate`, which is what the schema above declares. Two existing
migrations in this repo confirm it (`exams_walk_in_group_id_fkey`, `users_organization_id_fkey` --
both `SetNull` with no explicit `onUpdate`, both compiled to `ON UPDATE CASCADE`). The one place
this repo uses `NO ACTION` on a `SetNull` relation (`audit_logs_actor_user_id_fkey`) carries a
comment explaining a real SQL Server multiple-cascade-paths conflict, which does not exist here.
Writing `NO ACTION` would be silent drift from the schema -- invisible to tsc and CI, and surfacing
only when someone with shadow-DB access next runs `prisma migrate diff`.

- [ ] **Step 4: Regenerate the Prisma client**

Run: `cd "D:/exam app" && npx prisma generate --schema=apps/api/prisma/schema.prisma`
Expected: `✔ Generated Prisma Client`.

**Do NOT run `prisma migrate dev` or `migrate deploy`.**

- [ ] **Step 5: Typecheck**

Run: `cd "D:/exam app" && npx tsc --noEmit -p apps/api`
Expected: exit 0, no output.

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260813000000_question_ai_job/migration.sql
git commit -m "feat(questions): link a generated question to the AI job that produced it"
```

---

### Task 3: Give processors their own job id

**Files:**
- Modify: `apps/api/src/jobs/processors/job-processor.interface.ts`
- Modify: `apps/api/src/jobs/ai-jobs.worker.service.ts:50`
- Modify: `apps/api/src/jobs/processors/echo.processor.ts`
- Modify: `apps/api/src/jobs/processors/ai-question-generation.processor.ts` (signature only in this task)
- Test: `apps/api/src/jobs/processors/echo.processor.spec.ts`

**Interfaces:**
- Produces: `JobProcessor.process(input: unknown, context: TenantContext, aiJobId: string): Promise<unknown>`.

The worker already has `aiJobId` in scope; the processor needs it to stamp `Question.aiJobId` and `aiCreditUsage.sourceId`. Passing it explicitly is clearer than merging it into the parsed input JSON, where a reader could not tell it apart from a caller-supplied field.

- [ ] **Step 1: Write the failing test**

Add to `apps/api/src/jobs/processors/echo.processor.spec.ts`:

```ts
  it('receives the id of the job it is processing', async () => {
    const processor = new EchoProcessor();
    const result = await processor.process({ hello: 'world' }, {} as never, 'job-123');
    expect(result).toBeDefined();
  });
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd "D:/exam app" && npx jest --config apps/api/jest.config.js echo.processor --maxWorkers=2`
Expected: FAIL — TypeScript rejects the third argument (`Expected 2 arguments, but got 3`).

- [ ] **Step 3: Widen the interface**

In `apps/api/src/jobs/processors/job-processor.interface.ts`:

```ts
import { TenantContext } from '@exam-platform/shared';

export interface JobProcessor {
  readonly type: string;
  // aiJobId is passed explicitly rather than merged into `input`, so a processor that stamps
  // provenance onto the rows it writes cannot confuse it with a caller-supplied field.
  process(input: unknown, context: TenantContext, aiJobId: string): Promise<unknown>;
}

export const AI_JOB_PROCESSORS = 'AI_JOB_PROCESSORS';
```

- [ ] **Step 4: Pass it from the worker**

In `apps/api/src/jobs/ai-jobs.worker.service.ts`, change line 50 from:

```ts
      const output = await processor.process(JSON.parse(aiJob.inputJson), context);
```

to:

```ts
      const output = await processor.process(JSON.parse(aiJob.inputJson), context, aiJobId);
```

- [ ] **Step 5: Update both implementations' signatures**

In `apps/api/src/jobs/processors/echo.processor.ts`, add the third parameter to `process`. If the body does not use it, name it `_aiJobId` so lint does not flag it.

In `apps/api/src/jobs/processors/ai-question-generation.processor.ts`, change the signature to:

```ts
  async process(input: unknown, context: TenantContext, aiJobId: string): Promise<AiQuestionGenerationOutput> {
```

It is unused until Task 4 — reference it there, not here.

- [ ] **Step 6: Run the tests**

Run: `cd "D:/exam app" && npx jest --config apps/api/jest.config.js processors --maxWorkers=2`
Expected: PASS.

- [ ] **Step 7: Typecheck and commit**

```bash
cd "D:/exam app" && npx tsc --noEmit -p apps/api
git add apps/api/src/jobs
git commit -m "refactor(jobs): pass the job id to processors"
```

---

### Task 4: Fix the four processor defects

**Files:**
- Modify: `apps/api/src/jobs/processors/ai-question-generation.processor.ts`
- Test: `apps/api/src/jobs/processors/ai-question-generation.processor.spec.ts`

**Interfaces:**
- Consumes: `aiJobId` from Task 3, `Question.aiJobId` from Task 2.
- Produces: input shape `{ topic, difficulty, questionTypes, count, marks, negativeMarks, tagIds, requestedBy }`; output shape unchanged — `{ requested, created, dropped, questionIds }` where `dropped: { reason: string }[]`.

Four defects, all in one file, all verified in the current code:

1. `marks: 1, negativeMarks: 0` hardcoded at lines 74–75 — every generated question lands worth one mark.
2. No tags assigned — a bank of untagged questions is exactly the manual cleanup this feature exists to remove.
3. `aiJobId` not stamped — provenance is underivable.
4. `sourceId: null` at line 88 — a credit charge cannot be traced to its job.

- [ ] **Step 1: Write the failing tests**

Add to `apps/api/src/jobs/processors/ai-question-generation.processor.spec.ts`:

```ts
  it('applies the requested marks, negative marks and tags to every generated question', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'q1' });
    const creditCreate = jest.fn().mockResolvedValue({});
    const tenantPrisma = {
      forTenant: jest.fn((_c: unknown, fn: (tx: unknown) => unknown) =>
        fn({ question: { create }, aiCreditUsage: { create: creditCreate } }),
      ),
    };
    const client = {
      generate: jest.fn().mockResolvedValue([
        { type: 'single_mcq', text: 'Q', options: [{ text: 'a', isCorrect: true }, { text: 'b', isCorrect: false }] },
      ]),
    };
    const processor = new AiQuestionGenerationProcessor(
      client as never,
      tenantPrisma as never,
      { resolve: jest.fn().mockResolvedValue({}) } as never,
    );

    await processor.process(
      { topic: 'SQL', difficulty: 'medium', questionTypes: ['single_mcq'], count: 1, marks: 5, negativeMarks: 2, tagIds: ['tag-1'], requestedBy: 'user-1' },
      { organizationId: 'org-1', isSuperAdmin: false } as never,
      'job-1',
    );

    expect(create).toHaveBeenCalledTimes(1);
    const data = create.mock.calls[0][0].data;
    expect(data.marks).toBe(5);
    expect(data.negativeMarks).toBe(2);
    expect(data.tags).toEqual({ create: [{ tagId: 'tag-1' }] });
  });

  it('stamps the job id on each question and on the credit usage row, so a charge can be traced back', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'q1' });
    const creditCreate = jest.fn().mockResolvedValue({});
    const tenantPrisma = {
      forTenant: jest.fn((_c: unknown, fn: (tx: unknown) => unknown) =>
        fn({ question: { create }, aiCreditUsage: { create: creditCreate } }),
      ),
    };
    const client = {
      generate: jest.fn().mockResolvedValue([
        { type: 'single_mcq', text: 'Q', options: [{ text: 'a', isCorrect: true }, { text: 'b', isCorrect: false }] },
      ]),
    };
    const processor = new AiQuestionGenerationProcessor(
      client as never,
      tenantPrisma as never,
      { resolve: jest.fn().mockResolvedValue({}) } as never,
    );

    await processor.process(
      { topic: 'SQL', difficulty: 'medium', questionTypes: ['single_mcq'], count: 1, marks: 1, negativeMarks: 0, tagIds: [], requestedBy: 'user-1' },
      { organizationId: 'org-1', isSuperAdmin: false } as never,
      'job-42',
    );

    expect(create.mock.calls[0][0].data.aiJobId).toBe('job-42');
    expect(creditCreate.mock.calls[0][0].data.sourceId).toBe('job-42');
  });

  it('validates against the requested marks, not a hardcoded 1', async () => {
    // negativeMarks greater than marks is invalid; if the processor validated against a
    // hardcoded marks:1 it would wrongly accept this and write an unusable question.
    const create = jest.fn().mockResolvedValue({ id: 'q1' });
    const tenantPrisma = {
      forTenant: jest.fn((_c: unknown, fn: (tx: unknown) => unknown) =>
        fn({ question: { create }, aiCreditUsage: { create: jest.fn() } }),
      ),
    };
    const client = {
      generate: jest.fn().mockResolvedValue([
        { type: 'single_mcq', text: 'Q', options: [{ text: 'a', isCorrect: true }, { text: 'b', isCorrect: false }] },
      ]),
    };
    const processor = new AiQuestionGenerationProcessor(
      client as never,
      tenantPrisma as never,
      { resolve: jest.fn().mockResolvedValue({}) } as never,
    );

    const result = await processor.process(
      { topic: 'SQL', difficulty: 'medium', questionTypes: ['single_mcq'], count: 1, marks: 1, negativeMarks: 99, tagIds: [], requestedBy: 'user-1' },
      { organizationId: 'org-1', isSuperAdmin: false } as never,
      'job-1',
    ) as { created: number; dropped: { reason: string }[] };

    expect(result.created).toBe(0);
    expect(result.dropped).toHaveLength(1);
  });
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd "D:/exam app" && npx jest --config apps/api/jest.config.js ai-question-generation --maxWorkers=2`
Expected: FAIL — `data.marks` is `1` not `5`, `data.aiJobId` is `undefined`, `sourceId` is `null`.

- [ ] **Step 3: Update the input interface**

In `apps/api/src/jobs/processors/ai-question-generation.processor.ts`, replace the `AiQuestionGenerationInput` interface:

```ts
interface AiQuestionGenerationInput {
  topic: string;
  difficulty: string;
  questionTypes: string[];
  count: number;
  marks: number;
  negativeMarks: number;
  tagIds: string[];
  requestedBy: string;
}
```

- [ ] **Step 4: Destructure the new fields**

Replace the first line of `process`:

```ts
    const { topic, difficulty, questionTypes, count, marks, negativeMarks, tagIds, requestedBy } =
      input as AiQuestionGenerationInput;
```

- [ ] **Step 5: Validate against the requested marks**

In the validation loop, replace the hardcoded values:

```ts
        validateQuestionPayload({
          type: question.type,
          difficulty,
          marks,
          negativeMarks,
          options: question.options,
        });
```

- [ ] **Step 6: Write the requested values, the tags and the provenance**

Replace the `tx.question.create` call:

```ts
        const created = await tx.question.create({
          data: {
            organizationId: context.organizationId as string,
            type: question.type,
            text: question.text,
            topic,
            difficulty,
            marks,
            negativeMarks,
            status: 'draft',
            aiGenerated: true,
            aiJobId,
            createdBy: requestedBy,
            options: {
              create: question.options.map((o, index) => ({ text: o.text, isCorrect: o.isCorrect, orderIndex: index })),
            },
            ...(tagIds.length > 0 ? { tags: { create: tagIds.map((tagId) => ({ tagId })) } } : {}),
          },
        });
```

- [ ] **Step 7: Trace the credit charge to its job**

Replace the `aiCreditUsage.create` call:

```ts
        await tx.aiCreditUsage.create({
          data: {
            organizationId: context.organizationId as string,
            source: 'question_generation',
            credits: ids.length,
            sourceId: aiJobId,
          },
        });
```

- [ ] **Step 8: Run the tests**

Run: `cd "D:/exam app" && npx jest --config apps/api/jest.config.js ai-question-generation --maxWorkers=2`
Expected: PASS, all tests in the file.

- [ ] **Step 9: Prove the tests bite**

Temporarily change `marks,` back to `marks: 1,` in the create call and re-run. Expected: the first test FAILS. Revert and re-run: PASS. Report what you observed.

- [ ] **Step 10: Typecheck and commit**

```bash
cd "D:/exam app" && npx tsc --noEmit -p apps/api
git add apps/api/src/jobs/processors
git commit -m "fix(questions): honour requested marks and tags, and record generation provenance"
```

---

### Task 5: Accept marks, negative marks and tags on the request

**Files:**
- Modify: `apps/api/src/questions/dto/ai-generate-questions.dto.ts`
- Modify: `apps/api/src/questions/questions.service.ts:284-294`
- Test: `apps/api/src/questions/questions.service.spec.ts`

**Interfaces:**
- Produces: `POST /questions/ai-generate` body gains `marks: number` (1–100), `negativeMarks: number` (0–100), `tagIds: string[]` (may be empty). Response unchanged: `{ aiJobId: string }`.

- [ ] **Step 1: Write the failing test**

Add to `apps/api/src/questions/questions.service.spec.ts`:

```ts
  it('passes marks, negative marks and tags through to the generation job', async () => {
    const enqueue = jest.fn().mockResolvedValue({ id: 'job-9' });
    const service = buildService({ jobsService: { enqueue } });

    const result = await service.aiGenerate(
      { organizationId: 'org-1', isSuperAdmin: false } as never,
      'user-1',
      { topic: 'SQL', difficulty: 'medium', questionTypes: ['single_mcq'], count: 3, marks: 4, negativeMarks: 1, tagIds: ['t1'] } as never,
    );

    expect(result).toEqual({ aiJobId: 'job-9' });
    const input = JSON.parse(enqueue.mock.calls[0][2]);
    expect(input.marks).toBe(4);
    expect(input.negativeMarks).toBe(1);
    expect(input.tagIds).toEqual(['t1']);
  });
```

If `buildService` does not exist in that spec, follow whatever construction helper the neighbouring tests already use.

- [ ] **Step 2: Run it and watch it fail**

Run: `cd "D:/exam app" && npx jest --config apps/api/jest.config.js questions.service --maxWorkers=2`
Expected: FAIL — `input.marks` is `undefined`.

- [ ] **Step 3: Extend the DTO**

Replace `apps/api/src/questions/dto/ai-generate-questions.dto.ts`:

```ts
import { ArrayMinSize, IsArray, IsIn, IsInt, IsString, IsUUID, Max, Min } from 'class-validator';

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

  // Applied to every question in the batch. Without these the processor used to hardcode
  // marks: 1 / negativeMarks: 0, leaving the recruiter to fix every generated row by hand.
  @IsInt()
  @Min(1)
  @Max(100)
  marks!: number;

  @IsInt()
  @Min(0)
  @Max(100)
  negativeMarks!: number;

  @IsArray()
  @IsUUID('4', { each: true })
  tagIds!: string[];
}
```

- [ ] **Step 4: Thread them into the job input**

In `apps/api/src/questions/questions.service.ts`, replace the body of `aiGenerate`:

```ts
  async aiGenerate(context: TenantContext, userId: string, dto: AiGenerateQuestionsDto): Promise<{ aiJobId: string }> {
    const inputJson = JSON.stringify({
      topic: dto.topic,
      difficulty: dto.difficulty,
      questionTypes: dto.questionTypes,
      count: dto.count,
      marks: dto.marks,
      negativeMarks: dto.negativeMarks,
      tagIds: dto.tagIds,
      requestedBy: userId,
    });
    const aiJob = await this.jobsService.enqueue(context, 'ai-question-generation', inputJson, userId);
    return { aiJobId: aiJob.id };
  }
```

- [ ] **Step 5: Write the failing test for the no-AI-key case**

Without this, an organization with no AI key configured gets a job that is enqueued, picked up, and fails — burning a worker slot and showing the recruiter a failure minutes later instead of immediately.

```ts
  it('refuses to enqueue when the organization has no AI provider configured', async () => {
    const enqueue = jest.fn();
    const service = buildService({
      jobsService: { enqueue },
      aiApiKeyResolver: { resolve: jest.fn().mockRejectedValue(new Error('No AI provider configured')) },
    });

    await expect(
      service.aiGenerate(
        { organizationId: 'org-1', isSuperAdmin: false } as never,
        'user-1',
        { topic: 'SQL', difficulty: 'medium', questionTypes: ['single_mcq'], count: 3, marks: 1, negativeMarks: 0, tagIds: [] } as never,
      ),
    ).rejects.toThrow(/AI provider/i);
    expect(enqueue).not.toHaveBeenCalled();
  });
```

- [ ] **Step 6: Run it and watch it fail**

Run: `cd "D:/exam app" && npx jest --config apps/api/jest.config.js questions.service --maxWorkers=2`
Expected: FAIL — the job is enqueued regardless.

- [ ] **Step 6b: Reject negativeMarks greater than marks, before spending anything**

The DTO permits `marks: 1, negativeMarks: 99`. `validateQuestionPayload` rejects `negativeMarks > marks` (`question-validation.ts:41`), so such a request would call the AI provider, charge credits, and then drop **every** generated question — with correct reasons, but after the money was spent. Reject it up front.

Test:

```ts
  it('rejects negative marks greater than marks before calling the provider', async () => {
    const enqueue = jest.fn();
    const service = buildService({ jobsService: { enqueue } });

    await expect(
      service.aiGenerate(
        { organizationId: 'org-1', isSuperAdmin: false } as never,
        'user-1',
        { topic: 'SQL', difficulty: 'medium', questionTypes: ['single_mcq'], count: 3, marks: 1, negativeMarks: 99, tagIds: [] } as never,
      ),
    ).rejects.toThrow(/negativeMarks cannot exceed marks/);
    expect(enqueue).not.toHaveBeenCalled();
  });
```

Implementation, immediately before the AI-key check in the next step:

```ts
    if (dto.negativeMarks > dto.marks) {
      // Every generated question would fail validateQuestionPayload and be dropped -- after the
      // provider call had already been paid for.
      throw new BadRequestException('negativeMarks cannot exceed marks');
    }
```

- [ ] **Step 6c: Reject tag ids that are not this organization's**

`@IsUUID('4', { each: true })` catches a malformed id but not a stale one or one belonging to
another organization. The processor now resolves tags org-scoped and skips what it cannot resolve --
deliberately, because losing a whole paid-for batch over one stale tag is worse than a question
landing with fewer tags. But that means a recruiter who picks a stale tag gets untagged drafts and
**no signal anywhere they can see**: the warning is server-side, and the job output has no channel
for it. Catch it here instead, before anything is enqueued or billed.

Test:

```ts
  it('rejects tag ids that do not belong to the caller organization, before anything is billed', async () => {
    const enqueue = jest.fn();
    const service = buildService({
      jobsService: { enqueue },
      // Only one of the two requested tags resolves within this organization.
      tenantPrisma: { forTenant: jest.fn((_c: unknown, fn: (tx: unknown) => unknown) => fn({ tag: { findMany: jest.fn().mockResolvedValue([{ id: 't1' }]) } })) },
    });

    await expect(
      service.aiGenerate(
        { organizationId: 'org-1', isSuperAdmin: false } as never,
        'user-1',
        { topic: 'SQL', difficulty: 'medium', questionTypes: ['single_mcq'], count: 3, marks: 1, negativeMarks: 0, tagIds: ['t1', 't2'] } as never,
      ),
    ).rejects.toThrow(/tag/i);
    expect(enqueue).not.toHaveBeenCalled();
  });
```

Implementation, before the AI-key check: when `tagIds` is non-empty, resolve them inside
`tenantPrisma.forTenant` with `tx.tag.findMany({ where: { id: { in: tagIds }, organizationId }, select: { id: true } })`
and throw `BadRequestException` naming the unresolved ids if any are missing. Match the surrounding
service's existing style for tenant reads.

The processor's skip-and-warn then correctly degrades to what it should be: a defence against a tag
deleted in the window between enqueue and processing.

- [ ] **Step 7: Check the key before enqueueing**

Inject `AiApiKeyResolverService` into `QuestionsService` (it is exported from `@exam-platform/shared` and already injected into `AiQuestionGenerationProcessor`, so follow that constructor pattern), and resolve before enqueueing:

```ts
  async aiGenerate(context: TenantContext, userId: string, dto: AiGenerateQuestionsDto): Promise<{ aiJobId: string }> {
    // Fail fast. Without this the job is enqueued, picked up, and fails minutes later -- the
    // recruiter waits for a result that was never possible.
    await this.aiApiKeyResolver.resolve(context.organizationId as string);

    const inputJson = JSON.stringify({
      topic: dto.topic,
      difficulty: dto.difficulty,
      questionTypes: dto.questionTypes,
      count: dto.count,
      marks: dto.marks,
      negativeMarks: dto.negativeMarks,
      tagIds: dto.tagIds,
      requestedBy: userId,
    });
    const aiJob = await this.jobsService.enqueue(context, 'ai-question-generation', inputJson, userId);
    return { aiJobId: aiJob.id };
  }
```

Register the provider in `apps/api/src/questions/questions.module.ts` if it is not already available there.

- [ ] **Step 8: Run the tests**

Run: `cd "D:/exam app" && npx jest --config apps/api/jest.config.js questions.service --maxWorkers=2`
Expected: PASS, both new tests.

- [ ] **Step 9: Typecheck and commit**

```bash
cd "D:/exam app" && npx tsc --noEmit -p apps/api
git add apps/api/src/questions
git commit -m "feat(questions): let the recruiter set marks and tags, and fail fast without an AI key"
```

---

### Task 6: Web hooks — generate and poll

**Files:**
- Modify: `apps/web/lib/hooks/useQuestions.ts`
- Test: `apps/web/lib/hooks/useQuestions.test.tsx` (create if absent, following the pattern of the nearest existing hook test)

**Interfaces:**
- Produces:
  - `useGenerateQuestions()` → mutation, `mutateAsync(payload: GenerateQuestionsPayload) => Promise<{ aiJobId: string }>`
  - `useAiJob(aiJobId: string | null)` → query returning `AiJobStatus`, polls every 2s while `pending`/`processing`, stops when `completed`/`failed`
  - types `GenerateQuestionsPayload`, `AiJobStatus`, `GenerationOutput`

**Discard is archive, not delete.** `questions.controller.ts` exposes only `@Post(':id/archive')` and `@Post(':id/publish')` — **there is no DELETE endpoint for a question**, and this task must not add one. Discarding a draft therefore calls the existing `useArchiveQuestion`, which flips it to `archived` and out of both the Drafts and Active views. That is also the better behaviour: a soft delete keeps the row for audit and cost reconciliation, and matches how the rest of the bank already works.

- [ ] **Step 1: Write the failing test**

```tsx
import { renderHook, waitFor } from '@testing-library/react';
import { useAiJob } from './useQuestions';

jest.mock('../api-client', () => ({ apiFetch: jest.fn(), apiFetchBlob: jest.fn() }));
jest.mock('../auth-context', () => ({ useAuth: () => ({ accessToken: 'tok' }) }));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { apiFetch } = require('../api-client');

it('stops polling once the job has completed', async () => {
  (apiFetch as jest.Mock).mockResolvedValue({ id: 'j1', type: 'ai-question-generation', status: 'completed', outputJson: '{"requested":3,"created":3,"dropped":[],"questionIds":[]}', error: null });
  const { result } = renderHook(() => useAiJob('j1'), { wrapper: makeQueryWrapper() });
  await waitFor(() => expect(result.current.data?.status).toBe('completed'));
  const callsAfterComplete = (apiFetch as jest.Mock).mock.calls.length;
  await new Promise((r) => setTimeout(r, 2500));
  expect((apiFetch as jest.Mock).mock.calls.length).toBe(callsAfterComplete);
});
```

`makeQueryWrapper` is whatever QueryClientProvider wrapper the existing web hook tests use — reuse it, do not write a second one.

- [ ] **Step 2: Run it and watch it fail**

Run: `cd "D:/exam app/apps/web" && npx jest lib/hooks/useQuestions -w 2`
Expected: FAIL — `useAiJob` is not exported.

- [ ] **Step 3: Add the types and hooks**

Append to `apps/web/lib/hooks/useQuestions.ts`:

```ts
export interface GenerateQuestionsPayload {
  topic: string;
  difficulty: Difficulty;
  questionTypes: QuestionType[];
  count: number;
  marks: number;
  negativeMarks: number;
  tagIds: string[];
}

export interface GenerationOutput {
  requested: number;
  created: number;
  dropped: { reason: string }[];
  questionIds: string[];
}

export interface AiJobStatus {
  id: string;
  type: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  outputJson: string | null;
  error: string | null;
}

export function useGenerateQuestions() {
  const { accessToken } = useAuth();
  return useMutation<{ aiJobId: string }, Error, GenerateQuestionsPayload>({
    mutationFn: (payload) =>
      apiFetch('/questions/ai-generate', { method: 'POST', body: JSON.stringify(payload) }, accessToken ?? undefined),
  });
}

// Note the path: the controller is mounted at `ai-jobs`, not `jobs`.
export function useAiJob(aiJobId: string | null) {
  const { accessToken } = useAuth();
  return useQuery<AiJobStatus>({
    queryKey: ['ai-job', aiJobId],
    queryFn: () => apiFetch(`/ai-jobs/${aiJobId}`, {}, accessToken ?? undefined),
    enabled: Boolean(accessToken && aiJobId),
    // Poll while the job is still running, then stop. Without the false branch this polls
    // forever after completion, once per open modal, for as long as the tab is open.
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'pending' || status === 'processing' ? 2000 : false;
    },
  });
}

```

No discard hook is added: `useArchiveQuestion` already exists in this file and already invalidates the `['questions']` query, which is exactly what discarding a draft needs.

- [ ] **Step 4: Run the test**

Run: `cd "D:/exam app/apps/web" && npx jest lib/hooks/useQuestions -w 2`
Expected: PASS.

- [ ] **Step 5: Typecheck and commit**

```bash
cd "D:/exam app" && npx tsc --noEmit -p apps/web
git add apps/web/lib/hooks/useQuestions.ts apps/web/lib/hooks/useQuestions.test.tsx
git commit -m "feat(web): hooks for question generation and AI job polling"
```

---

### Task 7: The generate modal

**Files:**
- Create: `apps/web/components/GenerateQuestionsModal.tsx`
- Test: `apps/web/components/GenerateQuestionsModal.test.tsx`

**Interfaces:**
- Consumes: `useGenerateQuestions`, `useAiJob`, `GenerationOutput` from Task 6; `Modal`, `Button`, `Select`, `useToast` from `../components/ui`.
- Produces: `<GenerateQuestionsModal open={boolean} onClose={() => void} onCompleted={() => void} />`. `onCompleted` fires once when the job completes so the page can invalidate its list.

- [ ] **Step 1: Write the failing tests**

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GenerateQuestionsModal } from './GenerateQuestionsModal';

jest.mock('../lib/hooks/useQuestions', () => ({
  useGenerateQuestions: jest.fn(),
  useAiJob: jest.fn(),
  useTags: () => ({ data: [] }),
}));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { useGenerateQuestions, useAiJob } = require('../lib/hooks/useQuestions');

describe('GenerateQuestionsModal', () => {
  it('submits the form values, including marks and negative marks', async () => {
    const mutateAsync = jest.fn().mockResolvedValue({ aiJobId: 'j1' });
    (useGenerateQuestions as jest.Mock).mockReturnValue({ mutateAsync, isPending: false });
    (useAiJob as jest.Mock).mockReturnValue({ data: undefined });

    render(<GenerateQuestionsModal open onClose={jest.fn()} onCompleted={jest.fn()} />);
    await userEvent.type(screen.getByLabelText('Topic'), 'SQL joins');
    await userEvent.click(screen.getByRole('button', { name: 'Generate' }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    expect(mutateAsync.mock.calls[0][0]).toMatchObject({ topic: 'SQL joins', marks: 1, negativeMarks: 0 });
  });

  // The whole point of surfacing dropped reasons: "6 created" alone looks like the model being
  // stingy, when in fact the prompt is producing questions that fail validation every time.
  it('reports how many were dropped and why, not just how many were created', async () => {
    (useGenerateQuestions as jest.Mock).mockReturnValue({ mutateAsync: jest.fn().mockResolvedValue({ aiJobId: 'j1' }), isPending: false });
    (useAiJob as jest.Mock).mockReturnValue({
      data: {
        id: 'j1', type: 'ai-question-generation', status: 'completed', error: null,
        outputJson: JSON.stringify({ requested: 10, created: 6, dropped: [{ reason: 'Question must have exactly one correct option' }], questionIds: [] }),
      },
    });

    render(<GenerateQuestionsModal open onClose={jest.fn()} onCompleted={jest.fn()} />);
    expect(await screen.findByText(/10 requested/)).toBeInTheDocument();
    expect(screen.getByText(/6 created/)).toBeInTheDocument();
    expect(screen.getByText(/must have exactly one correct option/)).toBeInTheDocument();
  });

  it('shows the failure message when the job fails, rather than an empty result', async () => {
    (useGenerateQuestions as jest.Mock).mockReturnValue({ mutateAsync: jest.fn(), isPending: false });
    (useAiJob as jest.Mock).mockReturnValue({
      data: { id: 'j1', type: 'ai-question-generation', status: 'failed', outputJson: null, error: 'No AI provider configured' },
    });

    render(<GenerateQuestionsModal open onClose={jest.fn()} onCompleted={jest.fn()} />);
    expect(await screen.findByText(/No AI provider configured/)).toBeInTheDocument();
  });

  it('tells the recruiter the drafts land even if they close the modal', async () => {
    (useGenerateQuestions as jest.Mock).mockReturnValue({ mutateAsync: jest.fn(), isPending: false });
    (useAiJob as jest.Mock).mockReturnValue({ data: { id: 'j1', type: 'ai-question-generation', status: 'processing', outputJson: null, error: null } });

    render(<GenerateQuestionsModal open onClose={jest.fn()} onCompleted={jest.fn()} />);
    expect(await screen.findByText(/safe to close/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd "D:/exam app/apps/web" && npx jest GenerateQuestionsModal -w 2`
Expected: FAIL — module not found.

- [ ] **Step 3: Build the modal**

Create `apps/web/components/GenerateQuestionsModal.tsx`. Follow the structure of an existing modal in `apps/web/components` (e.g. the bulk-upload modal) for the `Modal` shell, spacing and button placement — do not invent a new layout.

Requirements the tests above pin:
- Fields: Topic (text, label exactly `Topic`), Difficulty (select: easy/medium/hard, default `medium`), Question types (checkboxes for single_mcq / multi_mcq / true_false, `single_mcq` checked by default, at least one required), Count (number, 1–20, default 5), Marks (number, min 1, default 1), Negative marks (number, min 0, default 0), Tags (multi-select from `useTags`, optional).
- Submit button labelled exactly `Generate`; disabled while `isPending` or while a job is running.
- On success, store the returned `aiJobId` in state and let `useAiJob` poll it.
- While `status` is `pending` or `processing`, show progress **and the sentence that it is safe to close the modal — the drafts will still land**. This is the property that made drafts the right choice over review-before-save; say it out loud.
- On `completed`, parse `outputJson` and render `"{requested} requested · {created} created · {dropped.length} dropped"` plus each distinct dropped reason.
- On `failed`, render `error`.
- Call `onCompleted()` exactly once when the status first becomes `completed`.

The field markup follows the existing modals; the parts worth spelling out are the job wiring and the summary, because both have a trap in them:

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { Modal, Button } from './ui';
import { useGenerateQuestions, useAiJob, useTags, type GenerationOutput } from '../lib/hooks/useQuestions';

export function GenerateQuestionsModal({
  open,
  onClose,
  onCompleted,
}: {
  open: boolean;
  onClose: () => void;
  onCompleted: () => void;
}) {
  const [aiJobId, setAiJobId] = useState<string | null>(null);
  const generate = useGenerateQuestions();
  const job = useAiJob(aiJobId);
  const { data: tags } = useTags();

  // onCompleted switches the page to the Drafts view. Firing it on every poll after completion
  // would yank the filter back while the recruiter is working, so latch it.
  const notified = useRef(false);
  useEffect(() => {
    if (job.data?.status === 'completed' && !notified.current) {
      notified.current = true;
      onCompleted();
    }
  }, [job.data?.status, onCompleted]);

  const running = job.data?.status === 'pending' || job.data?.status === 'processing';

  // outputJson is stored text written by the worker. Parse defensively: a malformed value must
  // not blank the modal, leaving the recruiter with no idea whether anything was generated.
  let output: GenerationOutput | null = null;
  if (job.data?.status === 'completed' && job.data.outputJson) {
    try {
      output = JSON.parse(job.data.outputJson) as GenerationOutput;
    } catch {
      output = null;
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Generate questions with AI">
      {/* fields here -- see the requirements above */}

      {running && (
        <p className="text-sm text-fg-muted">
          Generating… This is safe to close — the questions will appear in Drafts when it finishes.
        </p>
      )}

      {output && (
        <div className="space-y-2 text-sm">
          <p>
            {output.requested} requested · {output.created} created · {output.dropped.length} dropped
          </p>
          {output.dropped.length > 0 && (
            <ul className="list-disc pl-5 text-fg-muted">
              {[...new Set(output.dropped.map((d) => d.reason))].map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {job.data?.status === 'failed' && (
        <p role="alert" className="text-sm text-status-danger">
          {job.data.error ?? 'Generation failed.'}
        </p>
      )}

      <Button
        onClick={async () => {
          const result = await generate.mutateAsync({ topic, difficulty, questionTypes, count, marks, negativeMarks, tagIds });
          setAiJobId(result.aiJobId);
        }}
        disabled={generate.isPending || running}
      >
        Generate
      </Button>
    </Modal>
  );
}
```

Check `Modal`'s actual prop names in `apps/web/components/ui` before using `open`/`onClose`/`title` — match whatever the existing modals pass. Same for `Button`'s `disabled` handling and the `text-fg-muted` utility class.

- [ ] **Step 4: Run the tests**

Run: `cd "D:/exam app/apps/web" && npx jest GenerateQuestionsModal -w 2`
Expected: PASS, 4 tests.

- [ ] **Step 5: Typecheck and commit**

```bash
cd "D:/exam app" && npx tsc --noEmit -p apps/web
git add apps/web/components/GenerateQuestionsModal.tsx apps/web/components/GenerateQuestionsModal.test.tsx
git commit -m "feat(web): generate-questions modal with job progress and dropped reasons"
```

---

### Task 8: Drafts in the Question Bank

**Files:**
- Modify: `apps/web/app/(recruiter)/questions/page.tsx` (`STATUS_OPTIONS` at line 26, the status column at line 116, the actions column ~line 183)
- Test: `apps/web/app/(recruiter)/questions/page.test.tsx`

**Interfaces:**
- Consumes: `useGenerateQuestions`/`useAiJob` via `GenerateQuestionsModal` (Task 7), `useRestoreQuestion` (existing — it already POSTs `/questions/:id/publish`, so it publishes a draft unchanged), `useArchiveQuestion` (existing — used for Discard).

The page already has a `status` state defaulting to `'active'` and a `FilterableHeader` bound to `STATUS_OPTIONS`, and `useQuestions` already forwards `status` to the API, which already accepts it. So this task adds an option and the actions — no data plumbing.

- [ ] **Step 1: Write the failing tests**

Add to `apps/web/app/(recruiter)/questions/page.test.tsx`, following the existing mocking style in that file:

```tsx
  it('offers Drafts as a status filter', async () => {
    renderPage();
    expect(await screen.findByRole('option', { name: 'Drafts' })).toBeInTheDocument();
  });

  it('shows a Draft badge and a Publish action on a draft row', async () => {
    mockQuestions([{ ...baseQuestion, id: 'q1', status: 'draft', aiGenerated: true }]);
    renderPage({ status: 'draft' });
    expect(await screen.findByText('Draft')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publish' })).toBeInTheDocument();
  });

  it('publishes a draft through the existing publish endpoint', async () => {
    const mutate = jest.fn();
    mockPublish(mutate);
    mockQuestions([{ ...baseQuestion, id: 'q1', status: 'draft' }]);
    renderPage({ status: 'draft' });
    await userEvent.click(await screen.findByRole('button', { name: 'Publish' }));
    expect(mutate).toHaveBeenCalledWith('q1');
  });
```

`renderPage`, `mockQuestions`, `mockPublish` and `baseQuestion` are helpers — if the existing spec file has equivalents under different names, reuse those rather than adding duplicates.

- [ ] **Step 2: Run them and watch them fail**

Run: `cd "D:/exam app/apps/web" && npx jest "app/(recruiter)/questions" -w 2`
Expected: FAIL — no `Drafts` option.

- [ ] **Step 3: Add the status option**

In `apps/web/app/(recruiter)/questions/page.tsx`, replace `STATUS_OPTIONS`:

```tsx
const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'draft', label: 'Drafts' },
  { value: 'archived', label: 'Archived' },
];
```

- [ ] **Step 4: Render the draft badge**

Replace the status column's `render` (currently a two-way active/archived ternary, which shows any draft as "Archived" — wrong and misleading):

```tsx
      render: (question) => {
        const tone = question.status === 'active' ? 'success' : question.status === 'draft' ? 'warning' : 'neutral';
        const label = question.status === 'active' ? 'Active' : question.status === 'draft' ? 'Draft' : 'Archived';
        return <StatusBadge tone={tone}>{label}</StatusBadge>;
      },
```

`StatusBadge`'s `StatusTone` union already includes `warning` (`apps/web/components/ui/StatusBadge.tsx:4`), so no new tone is needed.

- [ ] **Step 5: Add the row actions**

In the actions column, add a `draft` branch alongside the existing `archived` branch. Label the actions exactly `Publish` and `Discard`. Keep the existing `archived` and `active` branches untouched.

```tsx
          {question.status === 'draft' ? (
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => restoreQuestion.mutate(question.id)}
                className="text-xs font-medium text-brand-primary hover:underline"
              >
                Publish
              </button>
              <button
                type="button"
                onClick={() => archiveQuestion.mutate(question.id)}
                className="text-xs font-medium text-status-danger hover:underline"
              >
                Discard
              </button>
            </div>
          ) : null}
```

`restoreQuestion` and `archiveQuestion` are the already-imported `useRestoreQuestion()` and `useArchiveQuestion()` results at the top of the component. Match the exact class names used by the neighbouring `archived` branch rather than the ones above if they differ.

- [ ] **Step 6: Add the Generate button and wire the modal**

Next to the existing page actions, add a `Generate with AI` button that opens `GenerateQuestionsModal`. On its `onCompleted`, switch the status filter to `'draft'` and reset the page to 1, so the recruiter lands on what was just generated instead of having to find it.

- [ ] **Step 7: Add the pending-drafts count**

Drafts are only reachable by changing a filter, which is the same invisibility problem this stage exists to fix — a recruiter who generated questions yesterday has no reason to look. Show the count wherever they already are.

Write the failing test first:

```tsx
  it('shows how many drafts are waiting, so they are not forgotten behind a filter', async () => {
    mockDraftCount(3);
    renderPage({ status: 'active' });
    expect(await screen.findByText('3 drafts awaiting review')).toBeInTheDocument();
  });
```

Then add a second, cheap query beside the main list and render it next to the Generate button:

```tsx
  // pageSize 1: we only want `total`, not the rows. Runs on every status view so the count is
  // visible from Active, which is where a recruiter actually is.
  const { data: draftCount } = useQuestions({ status: 'draft', pageSize: 1 });
  const pendingDrafts = draftCount?.total ?? 0;
```

```tsx
  {pendingDrafts > 0 && (
    <button type="button" onClick={() => { setStatus('draft'); setPage(1); }} className="text-sm font-medium text-brand-primary hover:underline">
      {pendingDrafts} drafts awaiting review
    </button>
  )}
```

Confirm the field on `PaginatedResponse` is named `total` before using it; if it differs, use the real name.

- [ ] **Step 8: Run the tests**

Run: `cd "D:/exam app/apps/web" && npx jest "app/(recruiter)/questions" -w 2`
Expected: PASS.

- [ ] **Step 9: Typecheck and commit**

```bash
cd "D:/exam app" && npx tsc --noEmit -p apps/web
git add "apps/web/app/(recruiter)/questions"
git commit -m "feat(web): Drafts view in the Question Bank with publish, discard and a pending count"
```

---

### Task 9: Bulk publish and discard

**Files:**
- Modify: `apps/web/app/(recruiter)/questions/page.tsx`
- Test: `apps/web/app/(recruiter)/questions/page.test.tsx`

**Interfaces:**
- Consumes: the same publish and discard hooks as Task 8.

Twenty generated questions reviewed one row at a time is the thing this feature exists to avoid.

- [ ] **Step 1: Write the failing tests**

```tsx
  it('publishes every selected draft', async () => {
    const mutate = jest.fn();
    mockPublish(mutate);
    mockQuestions([
      { ...baseQuestion, id: 'q1', status: 'draft' },
      { ...baseQuestion, id: 'q2', status: 'draft' },
    ]);
    renderPage({ status: 'draft' });
    await userEvent.click(await screen.findByLabelText('Select question q1'));
    await userEvent.click(screen.getByLabelText('Select question q2'));
    await userEvent.click(screen.getByRole('button', { name: 'Publish selected (2)' }));
    expect(mutate).toHaveBeenCalledTimes(2);
  });

  it('does not offer bulk actions outside the Drafts view', async () => {
    mockQuestions([{ ...baseQuestion, id: 'q1', status: 'active' }]);
    renderPage({ status: 'active' });
    await screen.findByText(baseQuestion.text);
    expect(screen.queryByLabelText('Select question q1')).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run them and watch them fail**

Run: `cd "D:/exam app/apps/web" && npx jest "app/(recruiter)/questions" -w 2`
Expected: FAIL — no checkbox.

- [ ] **Step 3: Implement selection**

Add a `selectedIds` state (a `Set<string>`), rendered as a leading checkbox column **only when `status === 'draft'`**, each with `aria-label={`Select question ${question.id}`}`. Add a bulk action bar shown only when the selection is non-empty, with buttons labelled `Publish selected (N)` and `Discard selected (N)`.

Clear the selection whenever the status filter or the page changes — a selection carried across a filter change would act on rows the recruiter can no longer see.

- [ ] **Step 4: Run the tests**

Run: `cd "D:/exam app/apps/web" && npx jest "app/(recruiter)/questions" -w 2`
Expected: PASS.

- [ ] **Step 5: Typecheck and commit**

```bash
cd "D:/exam app" && npx tsc --noEmit -p apps/web
git add "apps/web/app/(recruiter)/questions"
git commit -m "feat(web): bulk publish and discard for generated drafts"
```

---

### Task 10: Pin the safety property, then full verification

**Files:**
- Test: `apps/api/src/exams/exam-section-question-validation.spec.ts`

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Write the safety test**

The whole design rests on a draft being unable to reach a candidate. That is currently guaranteed by `validateSectionQuestionsReplace`, which predates this feature and has no test naming drafts specifically. Add to `apps/api/src/exams/exam-section-question-validation.spec.ts`:

```ts
  // Load-bearing for AI question generation: generated questions land as 'draft', and the only
  // thing stopping an unreviewed AI question reaching a real candidate is this guard. A future
  // refactor that relaxed it to "not archived" would silently open that path.
  it('refuses to add a draft question to a section', () => {
    expect(() =>
      validateSectionQuestionsReplace(['q1'], [], [{ id: 'q1', status: 'draft' }]),
    ).toThrow('is not active and cannot be added to a section for the first time');
  });
```

- [ ] **Step 2: Run it**

Run: `cd "D:/exam app" && npx jest --config apps/api/jest.config.js exam-section-question-validation --maxWorkers=2`
Expected: PASS immediately — the guard already exists; this test pins it.

- [ ] **Step 3: Prove it bites**

Temporarily change the guard at `apps/api/src/exams/exam-section-question-validation.ts:26` from `!== 'active'` to `=== 'archived'` and re-run. Expected: the new test FAILS. Revert, re-run, PASS. Report what you observed.

- [ ] **Step 4: Run everything**

```bash
cd "D:/exam app" && npx jest --config apps/api/jest.config.js --maxWorkers=2
cd "D:/exam app" && npx jest --config apps/exam-runtime/jest.config.js --maxWorkers=2
cd "D:/exam app/apps/web" && npx jest -w 2
cd "D:/exam app" && npx tsc --noEmit -p apps/api && npx tsc --noEmit -p apps/web && npx tsc --noEmit -p apps/exam-runtime && npx tsc --noEmit -p packages/shared
```

Expected: all suites pass, all four typechecks exit 0.

- [ ] **Step 5: Browser verification**

Start the dev server and confirm by hand, because none of the above proves the pieces connect:
1. Question Bank → `Generate with AI` opens the modal.
2. Submitting shows progress, and the message that closing is safe.
3. On completion the summary shows requested / created / dropped with reasons.
4. The view switches to Drafts and the new questions are there with a `Draft` badge.
5. Publishing one moves it to Active.
6. Selecting several and using `Publish selected (N)` moves them all.
7. Open an exam section's question picker and confirm **no draft is offered**.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/exams/exam-section-question-validation.spec.ts
git commit -m "test(exams): pin that a draft question cannot be added to a section"
```
