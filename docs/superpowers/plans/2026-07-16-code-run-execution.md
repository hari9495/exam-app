# Code Run Execution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a candidate click "Run" on a code-type question and see the real stdout/stderr/compile-error output from actually executing their code in a sandbox, with no effect on grading.

**Architecture:** A new `POST /attempt/run-code` endpoint on `apps/exam-runtime`'s public app validates the attempt/question, enforces a per-question run cap via Redis, forwards the code to a self-hosted Piston sandbox (a new Docker container) over HTTP, and returns the raw result. Nothing is persisted. The candidate frontend adds a Run button, an optional stdin box, and an output panel below the existing Monaco editor.

**Tech Stack:** NestJS (apps/exam-runtime), Prisma/SQL Server, ioredis (already a dependency), Piston (new Docker service), native `fetch`, Next.js/React (apps/web), Monaco editor (already in use).

## Global Constraints

- Real sandboxed execution via Piston — never AI-simulated output.
- All 8 existing `codeLanguage` values supported: javascript, typescript, python, java, csharp, cpp, go, ruby.
- `Question.allowStdin` (boolean, default `false`) gates whether the candidate's stdin box appears; set by the recruiter on the code-question form.
- No test cases, no pass/fail verdicts — raw output only.
- Nothing is persisted: no new Answer/Attempt fields, no run-history table.
- Synchronous request/response — no job queue.
- 30 runs per question per attempt (Redis counter, 24h TTL), plus a `STRICT_CODE_RUN_THROTTLE` rate-limit tier (10 req/60s) on the endpoint.
- `compileError` is populated only for compiled languages (java, csharp, cpp, go) when Piston's compile stage fails; always `null` for interpreted languages (javascript, typescript, python, ruby).
- Piston reached via `PISTON_API_URL` env var, default `http://localhost:2000`.

---

### Task 1: Schema + recruiter-side `allowStdin` plumbing

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (Question model, ~line 115-138)
- Modify: `apps/api/src/questions/dto/create-question.dto.ts`
- Modify: `apps/api/src/questions/questions.service.ts` (`create()` and `update()` methods)
- Test: `apps/api/src/questions/questions.service.spec.ts`
- Modify: `apps/web/lib/types.ts` (`Question` interface, ~line 60-76)
- Modify: `apps/web/lib/hooks/useQuestions.ts` (`QuestionInput` interface, ~line 46-58)
- Modify: `apps/web/components/QuestionForm.tsx`
- Test: `apps/web/components/QuestionForm.test.tsx`

**Interfaces:**
- Produces: `Question.allowStdin: boolean` (Prisma field, default `false`), `CreateQuestionDto.allowStdin?: boolean`, `QuestionInput.allowStdin?: boolean`, `Question.allowStdin: boolean` (frontend type).

- [ ] **Step 1: Add the `allowStdin` column to the schema**

In `apps/api/prisma/schema.prisma`, find the `Question` model and add the field right after `starterCode`:

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
  codeLanguage   String?               @map("code_language")
  starterCode    String?               @map("starter_code") @db.NVarChar(Max)
  allowStdin     Boolean               @default(false) @map("allow_stdin")
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

- [ ] **Step 2: Generate the migration**

Run from `apps/api`:
```bash
npx prisma migrate dev --name add_code_run_execution_allow_stdin
```
Expected: a new folder under `apps/api/prisma/migrations/` containing an `ALTER TABLE [questions] ADD [allow_stdin] BIT NOT NULL CONSTRAINT ... DEFAULT 0;` (SQL Server syntax, matching the existing migration style). Prisma Client regenerates automatically.

- [ ] **Step 3: Add `allowStdin` to `CreateQuestionDto`**

In `apps/api/src/questions/dto/create-question.dto.ts`, add alongside the existing `codeLanguage`/`starterCode` fields:

```ts
  @IsOptional()
  @IsBoolean()
  allowStdin?: boolean;
```

(Add `IsBoolean` to the existing `class-validator` import if not already present.) `UpdateQuestionDto extends CreateQuestionDto` picks this up automatically — no change needed there.

- [ ] **Step 4: Write the failing test for service plumbing**

In `apps/api/src/questions/questions.service.spec.ts`, add inside the existing top-level `describe('QuestionsService', ...)`:

```ts
  it('passes allowStdin through to the created question', async () => {
    const created = { id: 'q-1', organizationId: 'org-1', ...validDto, allowStdin: true, options: validDto.options, tags: [] };
    const tx = { tag: { upsert: jest.fn() }, question: { create: jest.fn().mockResolvedValue(created) } };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await service.create(context, 'user-1', { ...validDto, allowStdin: true });

    expect(tx.question.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ allowStdin: true }) }),
    );
  });
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `cd apps/api && npx jest src/questions/questions.service.spec.ts -t "passes allowStdin"`
Expected: FAIL — `tx.question.create` was not called with `allowStdin: true` (the service doesn't pass it yet).

- [ ] **Step 6: Wire `allowStdin` through `create()`/`update()`**

In `apps/api/src/questions/questions.service.ts`, find the `create()` and `update()` methods' `tx.question.create({ data: {...} })` / `tx.question.update({ data: {...} })` calls (they currently include `codeLanguage: dto.codeLanguage, starterCode: dto.starterCode`) and add:

```ts
        allowStdin: dto.allowStdin ?? false,
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `cd apps/api && npx jest src/questions/questions.service.spec.ts`
Expected: PASS, all tests in the file green.

- [ ] **Step 8: Add `allowStdin` to the frontend `Question` and `QuestionInput` types**

In `apps/web/lib/types.ts`, add to the `Question` interface (after `starterCode`):

```ts
  allowStdin: boolean;
```

In `apps/web/lib/hooks/useQuestions.ts`, add to the `QuestionInput` interface (after `starterCode`):

```ts
  allowStdin?: boolean;
```

- [ ] **Step 9: Write the failing test for the recruiter form checkbox**

`QuestionForm.tsx`'s "Question type" field is a Radix `Select` (`<Select label="Question type" .../>`), not a native `<select>` or radio group — it renders `role="combobox"` (trigger) and `role="option"` (items), the same pattern established elsewhere in this codebase's tests. In `apps/web/components/QuestionForm.test.tsx`, add a new test (matching the file's existing `render(<QuestionForm tags={[]} submitLabel="Create question" onSubmit={onSubmit} />)` pattern):

```ts
  it('includes allowStdin in the submitted payload when checked, for code questions only', async () => {
    const onSubmit = jest.fn();
    render(<QuestionForm tags={[]} submitLabel="Create question" onSubmit={onSubmit} />);

    await userEvent.click(screen.getByRole('combobox', { name: 'Question type' }));
    await userEvent.click(screen.getByRole('option', { name: 'Code' }));
    await userEvent.click(screen.getByLabelText('Allow candidates to provide input (stdin)'));
    await userEvent.type(screen.getByLabelText('Question text'), 'Read a line and print it.');
    await userEvent.click(screen.getByRole('button', { name: 'Create question' }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ allowStdin: true }));
  });
```

- [ ] **Step 10: Run the test to verify it fails**

Run: `cd apps/web && npx jest components/QuestionForm.test.tsx -t "allowStdin"`
Expected: FAIL — no element with label "Allow candidates to provide input (stdin)" exists yet.

- [ ] **Step 11: Add the checkbox to the code-question form section**

In `apps/web/components/QuestionForm.tsx`, add state and wire it into the submit payload and the code-type JSX block:

```tsx
  const [allowStdin, setAllowStdin] = useState(initialQuestion?.allowStdin ?? false);
```

In `handleSubmit`'s `onSubmit({...})` call, add:
```tsx
    allowStdin: type === 'code' ? allowStdin : undefined,
```

In the `type === 'code'` JSX block, after the starter-code textarea:
```tsx
    <label className="flex items-center gap-2 text-sm text-gray-700">
      <input
        type="checkbox"
        checked={allowStdin}
        onChange={(e) => setAllowStdin(e.target.checked)}
        aria-label="Allow candidates to provide input (stdin)"
      />
      Allow candidates to provide input (stdin)
    </label>
```

- [ ] **Step 12: Run the test to verify it passes**

Run: `cd apps/web && npx jest components/QuestionForm.test.tsx`
Expected: PASS, all tests in the file green.

- [ ] **Step 13: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations apps/api/src/questions/dto/create-question.dto.ts apps/api/src/questions/questions.service.ts apps/api/src/questions/questions.service.spec.ts apps/web/lib/types.ts apps/web/lib/hooks/useQuestions.ts apps/web/components/QuestionForm.tsx apps/web/components/QuestionForm.test.tsx
git commit -m "feat: add Question.allowStdin field and recruiter form checkbox"
```

---

### Task 2: Candidate-side `allowStdin` read-path plumbing

**Files:**
- Modify: `apps/exam-runtime/src/attempts/attempt.service.ts` (`AttemptQuestion` interface + `loadSections()` method)
- Test: `apps/exam-runtime/src/attempts/attempt.service.spec.ts`
- Modify: `apps/web/lib/types.ts` (`AttemptQuestion` interface, ~line 150-158)

**Interfaces:**
- Consumes: `Question.allowStdin` (from Task 1's migration).
- Produces: `AttemptQuestion.allowStdin: boolean` on both the exam-runtime response and the frontend type — later tasks (5, 6) read this field to gate the stdin box.

- [ ] **Step 1: Write the failing test**

In `apps/exam-runtime/src/attempts/attempt.service.spec.ts`, find the existing test(s) covering `getCurrent()`'s question mapping (search for `codeLanguage` in the mocked question data) and add an assertion, or add a new test if none directly targets this. Add a code question to whatever mock question list an existing `getCurrent()` test already sets up, with `allowStdin: true`, then assert:

```ts
    expect(result.sections[0].questions.find((q) => q.type === 'code')?.allowStdin).toBe(true);
```

(Match the exact mock/setup shape of the nearest existing `getCurrent()` test in that file — it already mocks `tx.question.findMany` returning question rows and asserts on the shape of `result.sections`.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/exam-runtime && npx jest src/attempts/attempt.service.spec.ts -t "allowStdin"`
Expected: FAIL — `allowStdin` is `undefined` on the returned question (property doesn't exist yet).

- [ ] **Step 3: Add `allowStdin` to the `AttemptQuestion` interface and `loadSections()` mapping**

In `apps/exam-runtime/src/attempts/attempt.service.ts`, update the interface (lines 18-26):

```ts
interface AttemptQuestion {
  id: string;
  text: string;
  type: string;
  marks: number;
  codeLanguage: string | null;
  starterCode: string | null;
  allowStdin: boolean;
  options: AttemptQuestionOption[];
}
```

And in `loadSections()`'s mapping (around line 388-396), add the field to the returned object:

```ts
            return {
              id: question.id,
              text: question.text,
              type: question.type,
              marks: question.marks,
              codeLanguage: question.codeLanguage,
              starterCode: question.starterCode,
              allowStdin: question.allowStdin,
              options: orderedOptions.map((option) => ({ id: option.id, text: option.text })),
            };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/exam-runtime && npx jest src/attempts/attempt.service.spec.ts`
Expected: PASS, all tests in the file green.

- [ ] **Step 5: Add `allowStdin` to the frontend `AttemptQuestion` type**

In `apps/web/lib/types.ts`, update the `AttemptQuestion` interface (lines 150-158):

```ts
export interface AttemptQuestion {
  id: string;
  text: string;
  type: QuestionType;
  marks: number;
  codeLanguage: CodeLanguage | null;
  starterCode: string | null;
  allowStdin: boolean;
  options: AttemptQuestionOption[];
}
```

No test needed for this step — it's a pure type addition with no logic; Task 6's frontend tests exercise the field's actual use.

- [ ] **Step 6: Commit**

```bash
git add apps/exam-runtime/src/attempts/attempt.service.ts apps/exam-runtime/src/attempts/attempt.service.spec.ts apps/web/lib/types.ts
git commit -m "feat: surface Question.allowStdin through the candidate attempt response"
```

---

### Task 3: Piston client, language mapping, and docker-compose service

**Files:**
- Create: `apps/exam-runtime/src/code-execution/piston-languages.ts`
- Create: `apps/exam-runtime/src/code-execution/piston-client.ts`
- Test: `apps/exam-runtime/src/code-execution/piston-client.spec.ts`
- Modify: `docker-compose.yml` (repo root)

**Interfaces:**
- Produces: `PISTON_LANGUAGE_MAP: Record<string, {language: string; version: string}>`, `PistonClient.execute(params: PistonExecuteParams): Promise<PistonExecuteResult>` where `PistonExecuteParams = {language: string; version: string; code: string; stdin?: string}` and `PistonExecuteResult = {stdout: string; stderr: string; exitCode: number; compileError: string | null; timedOut: boolean}`.

- [ ] **Step 1: Add the Piston service to docker-compose**

In `docker-compose.yml` (repo root), add a new service alongside the existing `redis`:

```yaml
services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
  piston:
    image: ghcr.io/engineer-man/piston
    ports:
      - "2000:2000"
    tmpfs:
      - /piston/jobs:exec
```

- [ ] **Step 2: Create the language mapping**

Create `apps/exam-runtime/src/code-execution/piston-languages.ts`:

```ts
export interface PistonLanguageEntry {
  language: string;
  version: string;
}

// Versions pinned against ghcr.io/engineer-man/piston's default package set as of this
// feature's implementation. If a version is unavailable on the running Piston instance,
// its GET /api/v2/runtimes endpoint lists what's actually installed.
export const PISTON_LANGUAGE_MAP: Record<string, PistonLanguageEntry> = {
  javascript: { language: 'javascript', version: '18.15.0' },
  typescript: { language: 'typescript', version: '5.0.3' },
  python: { language: 'python', version: '3.10.0' },
  java: { language: 'java', version: '15.0.2' },
  csharp: { language: 'csharp', version: '6.12.0' },
  cpp: { language: 'cpp', version: '10.2.0' },
  go: { language: 'go', version: '1.16.2' },
  ruby: { language: 'ruby', version: '3.0.1' },
};

// Compiled languages have a distinct "compile" stage in Piston's response; interpreted
// languages don't, so compileError should always be null for them (see PistonClient).
export const COMPILED_LANGUAGES = new Set(['java', 'csharp', 'cpp', 'go']);
```

- [ ] **Step 3: Write the failing test for the Piston client**

Create `apps/exam-runtime/src/code-execution/piston-client.spec.ts`:

```ts
import { PistonClient } from './piston-client';

describe('PistonClient', () => {
  const originalFetch = global.fetch;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('executes code for an interpreted language and returns stdout/stderr/exitCode', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        run: { stdout: 'hello\n', stderr: '', code: 0, signal: null },
      }),
    });

    const client = new PistonClient();
    const result = await client.execute({ language: 'python', version: '3.10.0', code: 'print("hello")' });

    expect(result).toEqual({ stdout: 'hello\n', stderr: '', exitCode: 0, compileError: null, timedOut: false });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/v2/execute'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          language: 'python',
          version: '3.10.0',
          files: [{ content: 'print("hello")' }],
          stdin: '',
          run_timeout: 5000,
        }),
      }),
    );
  });

  it('surfaces a compile-stage failure as compileError for a compiled language', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        compile: { stdout: '', stderr: 'error: expected \';\'', code: 1 },
        run: { stdout: '', stderr: '', code: 0, signal: null },
      }),
    });

    const client = new PistonClient();
    const result = await client.execute({ language: 'cpp', version: '10.2.0', code: 'int main() { return 0 }' });

    expect(result).toEqual({ stdout: '', stderr: '', exitCode: 0, compileError: "error: expected ';'", timedOut: false });
  });

  it('passes stdin through when provided', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ run: { stdout: 'Alice\n', stderr: '', code: 0, signal: null } }) });

    const client = new PistonClient();
    await client.execute({ language: 'python', version: '3.10.0', code: 'print(input())', stdin: 'Alice' });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ body: expect.stringContaining('"stdin":"Alice"') }),
    );
  });

  it('marks the result as timedOut when the run stage was killed by a signal', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ run: { stdout: '', stderr: '', code: null, signal: 'SIGKILL' } }),
    });

    const client = new PistonClient();
    const result = await client.execute({ language: 'python', version: '3.10.0', code: 'while True: pass' });

    expect(result.timedOut).toBe(true);
  });

  it('throws when the Piston request itself fails', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 502 });

    const client = new PistonClient();
    await expect(client.execute({ language: 'python', version: '3.10.0', code: 'print(1)' })).rejects.toThrow('Piston request failed with status 502');
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `cd apps/exam-runtime && npx jest src/code-execution/piston-client.spec.ts`
Expected: FAIL with a module-not-found error for `./piston-client`.

- [ ] **Step 5: Implement the Piston client**

Create `apps/exam-runtime/src/code-execution/piston-client.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { COMPILED_LANGUAGES } from './piston-languages';

export interface PistonExecuteParams {
  language: string;
  version: string;
  code: string;
  stdin?: string;
}

export interface PistonExecuteResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  compileError: string | null;
  timedOut: boolean;
}

interface PistonStageResult {
  stdout: string;
  stderr: string;
  code: number | null;
  signal?: string | null;
}

interface PistonApiResponse {
  compile?: PistonStageResult;
  run: PistonStageResult;
}

const RUN_TIMEOUT_MS = 5000;

@Injectable()
export class PistonClient {
  private readonly baseUrl = process.env.PISTON_API_URL ?? 'http://localhost:2000';

  async execute(params: PistonExecuteParams): Promise<PistonExecuteResult> {
    const response = await fetch(`${this.baseUrl}/api/v2/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        language: params.language,
        version: params.version,
        files: [{ content: params.code }],
        stdin: params.stdin ?? '',
        run_timeout: RUN_TIMEOUT_MS,
      }),
    });

    if (!response.ok) {
      throw new Error(`Piston request failed with status ${response.status}`);
    }

    const body = (await response.json()) as PistonApiResponse;

    const compileError =
      COMPILED_LANGUAGES.has(params.language) && body.compile && body.compile.code !== 0 ? body.compile.stderr : null;

    return {
      stdout: body.run.stdout,
      stderr: body.run.stderr,
      exitCode: body.run.code ?? -1,
      compileError,
      timedOut: body.run.signal === 'SIGKILL',
    };
  }
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd apps/exam-runtime && npx jest src/code-execution/piston-client.spec.ts`
Expected: PASS, all 5 tests green.

- [ ] **Step 7: Commit**

```bash
git add docker-compose.yml apps/exam-runtime/src/code-execution/piston-languages.ts apps/exam-runtime/src/code-execution/piston-client.ts apps/exam-runtime/src/code-execution/piston-client.spec.ts
git commit -m "feat: add Piston client and language mapping for code execution"
```

---

### Task 4: Redis run-cap limiter

**Files:**
- Create: `apps/exam-runtime/src/code-execution/run-limiter.ts`
- Test: `apps/exam-runtime/src/code-execution/run-limiter.spec.ts`

**Interfaces:**
- Produces: `RunLimiter.checkAndIncrement(attemptId: string, questionId: string): Promise<{allowed: boolean; remaining: number}>`, `MAX_RUNS_PER_QUESTION = 30` (exported constant, consumed by Task 5's e2e test for the cap-exceeded case).

- [ ] **Step 1: Write the failing test**

Create `apps/exam-runtime/src/code-execution/run-limiter.spec.ts`:

```ts
import { RunLimiter, MAX_RUNS_PER_QUESTION, RunCounterStore } from './run-limiter';

describe('RunLimiter', () => {
  function fakeStore(startingCount = 0): RunCounterStore & { calls: { incr: string[]; expire: [string, number][] } } {
    let count = startingCount;
    const calls = { incr: [] as string[], expire: [] as [string, number][] };
    return {
      calls,
      incr: async (key: string) => {
        calls.incr.push(key);
        count += 1;
        return count;
      },
      expire: async (key: string, seconds: number) => {
        calls.expire.push([key, seconds]);
        return 1;
      },
    };
  }

  it('allows a run when the count is under the cap', async () => {
    const store = fakeStore(0);
    const limiter = new RunLimiter(store);

    const result = await limiter.checkAndIncrement('attempt-1', 'question-1');

    expect(result).toEqual({ allowed: true, remaining: MAX_RUNS_PER_QUESTION - 1 });
    expect(store.calls.incr).toEqual([`code-run:attempt-1:question-1`]);
  });

  it('sets an expiry only on the first increment for a key', async () => {
    const store = fakeStore(0);
    const limiter = new RunLimiter(store);

    await limiter.checkAndIncrement('attempt-1', 'question-1');

    expect(store.calls.expire).toEqual([[`code-run:attempt-1:question-1`, 86400]]);
  });

  it('does not re-set the expiry on subsequent increments', async () => {
    const store = fakeStore(1);
    const limiter = new RunLimiter(store);

    await limiter.checkAndIncrement('attempt-1', 'question-1');

    expect(store.calls.expire).toEqual([]);
  });

  it('rejects a run once the cap is reached', async () => {
    const store = fakeStore(MAX_RUNS_PER_QUESTION);
    const limiter = new RunLimiter(store);

    const result = await limiter.checkAndIncrement('attempt-1', 'question-1');

    expect(result).toEqual({ allowed: false, remaining: 0 });
  });

  it('scopes the counter independently per attempt and per question', async () => {
    const store = fakeStore(0);
    const limiter = new RunLimiter(store);

    await limiter.checkAndIncrement('attempt-1', 'question-1');
    await limiter.checkAndIncrement('attempt-1', 'question-2');
    await limiter.checkAndIncrement('attempt-2', 'question-1');

    expect(store.calls.incr).toEqual([
      'code-run:attempt-1:question-1',
      'code-run:attempt-1:question-2',
      'code-run:attempt-2:question-1',
    ]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/exam-runtime && npx jest src/code-execution/run-limiter.spec.ts`
Expected: FAIL with a module-not-found error for `./run-limiter`.

- [ ] **Step 3: Implement the run limiter**

Create `apps/exam-runtime/src/code-execution/run-limiter.ts`:

```ts
import { Injectable, Optional } from '@nestjs/common';
import Redis from 'ioredis';

export const MAX_RUNS_PER_QUESTION = 30;
const RUN_COUNTER_TTL_SECONDS = 86400;

export interface RunCounterStore {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
}

@Injectable()
export class RunLimiter {
  private readonly store: RunCounterStore;

  // RunCounterStore is a TypeScript interface, so Nest's DI has no runtime token to resolve it
  // against — with @Optional(), that's fine: Nest injects undefined here in normal app wiring
  // (no RunCounterStore provider is ever registered in attempt.module.ts), so this constructor
  // always falls through to a real ioredis connection when instantiated by Nest. Unit tests
  // bypass DI entirely and call `new RunLimiter(fakeStore)` directly (see run-limiter.spec.ts).
  constructor(@Optional() store?: RunCounterStore) {
    this.store = store ?? new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
  }

  async checkAndIncrement(attemptId: string, questionId: string): Promise<{ allowed: boolean; remaining: number }> {
    const key = `code-run:${attemptId}:${questionId}`;
    const count = await this.store.incr(key);
    if (count === 1) {
      await this.store.expire(key, RUN_COUNTER_TTL_SECONDS);
    }
    return { allowed: count <= MAX_RUNS_PER_QUESTION, remaining: Math.max(0, MAX_RUNS_PER_QUESTION - count) };
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/exam-runtime && npx jest src/code-execution/run-limiter.spec.ts`
Expected: PASS, all 5 tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/exam-runtime/src/code-execution/run-limiter.ts apps/exam-runtime/src/code-execution/run-limiter.spec.ts
git commit -m "feat: add Redis-backed per-question run cap"
```

---

### Task 5: Run-code endpoint

**Files:**
- Create: `apps/exam-runtime/src/attempts/dto/run-code.dto.ts`
- Modify: `apps/exam-runtime/src/attempts/attempt.controller.ts`
- Modify: `apps/exam-runtime/src/attempts/attempt.service.ts`
- Modify: `apps/exam-runtime/src/attempts/attempt.module.ts`
- Modify: `apps/exam-runtime/src/rate-limit-tiers.ts`
- Test: `apps/exam-runtime/src/attempts/attempt.service.spec.ts`
- Test: `apps/api/test/code-run-execution.e2e-spec.ts` (new, self-contained — see Step 9)

**Interfaces:**
- Consumes: `PistonClient.execute()` (Task 3), `RunLimiter.checkAndIncrement()` (Task 4), `AttemptQuestion.allowStdin` (Task 2).
- Produces: `POST /api/v1/attempt/run-code` returning `PistonExecuteResult` (Task 3's shape) on success, or `{error: 'sandbox_unavailable'}` (502) on Piston failure.

- [ ] **Step 1: Add the rate-limit tier**

In `apps/exam-runtime/src/rate-limit-tiers.ts`, add:

```ts
export const STRICT_CODE_RUN_THROTTLE = { default: { limit: isTest ? 10_000 : 10, ttl: seconds(60) } };
```

- [ ] **Step 2: Create the DTO**

Create `apps/exam-runtime/src/attempts/dto/run-code.dto.ts`:

```ts
import { IsOptional, IsString } from 'class-validator';

export class RunCodeDto {
  @IsString()
  questionId!: string;

  @IsString()
  code!: string;

  @IsOptional()
  @IsString()
  stdin?: string;
}
```

- [ ] **Step 3: Write the failing unit tests for `runCode()`**

In `apps/exam-runtime/src/attempts/attempt.service.spec.ts`, add `pistonClient` and `runLimiter` declarations and provider overrides to the file's existing `beforeEach`/`Test.createTestingModule` setup (mirroring how `settlement`/`monitoringGateway` are already declared and registered at lines 12-31):

```ts
  let pistonClient: { execute: jest.Mock };
  let runLimiter: { checkAndIncrement: jest.Mock };
```
```ts
    pistonClient = { execute: jest.fn() };
    runLimiter = { checkAndIncrement: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AttemptService,
        { provide: TenantPrismaService, useValue: tenantPrisma },
        { provide: AttemptSettlementService, useValue: settlement },
        { provide: MonitoringGateway, useValue: monitoringGateway },
        { provide: PistonClient, useValue: pistonClient },
        { provide: RunLimiter, useValue: runLimiter },
      ],
    }).compile();
```

Add `import { PistonClient } from '../code-execution/piston-client';` and `import { RunLimiter } from '../code-execution/run-limiter';` to the file's existing imports.

Then add a new `describe('runCode', ...)` block, using the file's existing `session` constant and `mockBootstrapThenScoped()` helper (defined at line 37, already used by every `answer()`/`submit()` test in this file — `resolveContext()`'s bootstrap lookup is the first `forTenant` call, the method's own scoped transaction is the second):

```ts
  describe('runCode', () => {
    const codeQuestion = { id: 'q-code-1', type: 'code', codeLanguage: 'python', allowStdin: false };

    function setupTx(overrides: Partial<{ status: string; questionOrderJson: string; question: typeof codeQuestion }> = {}) {
      const attempt = {
        id: 'attempt-1',
        status: overrides.status ?? 'in_progress',
        questionOrderJson: overrides.questionOrderJson ?? JSON.stringify(['q-code-1']),
      };
      return {
        attempt: { findUnique: jest.fn().mockResolvedValue(attempt) },
        question: { findFirstOrThrow: jest.fn().mockResolvedValue(overrides.question ?? codeQuestion) },
      };
    }

    it('runs code for a valid code question and returns the Piston result', async () => {
      const tx = setupTx();
      settlement.settleIfExpired.mockResolvedValue({ id: 'attempt-1', status: 'in_progress', questionOrderJson: JSON.stringify(['q-code-1']) });
      mockBootstrapThenScoped(tx);
      pistonClient.execute.mockResolvedValue({ stdout: 'hi\n', stderr: '', exitCode: 0, compileError: null, timedOut: false });
      runLimiter.checkAndIncrement.mockResolvedValue({ allowed: true, remaining: 29 });

      const result = await service.runCode(session, { questionId: 'q-code-1', code: 'print("hi")' });

      expect(result).toEqual({ stdout: 'hi\n', stderr: '', exitCode: 0, compileError: null, timedOut: false });
      expect(pistonClient.execute).toHaveBeenCalledWith({ language: 'python', version: '3.10.0', code: 'print("hi")', stdin: undefined });
    });

    it('rejects a non-code question', async () => {
      const tx = setupTx({ question: { ...codeQuestion, type: 'single_mcq' } });
      settlement.settleIfExpired.mockResolvedValue({ id: 'attempt-1', status: 'in_progress', questionOrderJson: JSON.stringify(['q-code-1']) });
      mockBootstrapThenScoped(tx);

      await expect(service.runCode(session, { questionId: 'q-code-1', code: 'x' })).rejects.toThrow(BadRequestException);
    });

    it('ignores stdin when the question does not allow it', async () => {
      const tx = setupTx();
      settlement.settleIfExpired.mockResolvedValue({ id: 'attempt-1', status: 'in_progress', questionOrderJson: JSON.stringify(['q-code-1']) });
      mockBootstrapThenScoped(tx);
      pistonClient.execute.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0, compileError: null, timedOut: false });
      runLimiter.checkAndIncrement.mockResolvedValue({ allowed: true, remaining: 29 });

      await service.runCode(session, { questionId: 'q-code-1', code: 'x', stdin: 'ignored' });

      expect(pistonClient.execute).toHaveBeenCalledWith(expect.objectContaining({ stdin: undefined }));
    });

    it('passes stdin through when the question allows it', async () => {
      const tx = setupTx({ question: { ...codeQuestion, allowStdin: true } });
      settlement.settleIfExpired.mockResolvedValue({ id: 'attempt-1', status: 'in_progress', questionOrderJson: JSON.stringify(['q-code-1']) });
      mockBootstrapThenScoped(tx);
      pistonClient.execute.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0, compileError: null, timedOut: false });
      runLimiter.checkAndIncrement.mockResolvedValue({ allowed: true, remaining: 29 });

      await service.runCode(session, { questionId: 'q-code-1', code: 'x', stdin: 'Alice' });

      expect(pistonClient.execute).toHaveBeenCalledWith(expect.objectContaining({ stdin: 'Alice' }));
    });

    it('rejects with 429 once the run cap is exceeded', async () => {
      const tx = setupTx();
      settlement.settleIfExpired.mockResolvedValue({ id: 'attempt-1', status: 'in_progress', questionOrderJson: JSON.stringify(['q-code-1']) });
      mockBootstrapThenScoped(tx);
      runLimiter.checkAndIncrement.mockResolvedValue({ allowed: false, remaining: 0 });

      await expect(service.runCode(session, { questionId: 'q-code-1', code: 'x' })).rejects.toMatchObject({ status: 429 });
      expect(pistonClient.execute).not.toHaveBeenCalled();
    });

    it('rejects when the attempt is not in progress', async () => {
      const tx = setupTx({ status: 'submitted' });
      settlement.settleIfExpired.mockResolvedValue({ id: 'attempt-1', status: 'submitted', questionOrderJson: JSON.stringify(['q-code-1']) });
      mockBootstrapThenScoped(tx);

      await expect(service.runCode(session, { questionId: 'q-code-1', code: 'x' })).rejects.toThrow(BadRequestException);
    });

    it('translates a Piston failure into a 502 sandbox_unavailable error', async () => {
      const tx = setupTx();
      settlement.settleIfExpired.mockResolvedValue({ id: 'attempt-1', status: 'in_progress', questionOrderJson: JSON.stringify(['q-code-1']) });
      mockBootstrapThenScoped(tx);
      runLimiter.checkAndIncrement.mockResolvedValue({ allowed: true, remaining: 29 });
      pistonClient.execute.mockRejectedValue(new Error('network error'));

      await expect(service.runCode(session, { questionId: 'q-code-1', code: 'x' })).rejects.toMatchObject({ status: 502 });
    });
  });
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `cd apps/exam-runtime && npx jest src/attempts/attempt.service.spec.ts -t "runCode"`
Expected: FAIL — `service.runCode` is not a function.

- [ ] **Step 5: Implement `runCode()` on `AttemptService`**

In `apps/exam-runtime/src/attempts/attempt.service.ts`, add the imports:

```ts
import { PistonClient } from '../code-execution/piston-client';
import { RunLimiter } from '../code-execution/run-limiter';
import { PISTON_LANGUAGE_MAP } from '../code-execution/piston-languages';
import { RunCodeDto } from './dto/run-code.dto';
```

Add `pistonClient` and `runLimiter` to the constructor's injected dependencies (alongside the existing `tenantPrisma`, `attemptSettlement`, etc.):

```ts
    private readonly pistonClient: PistonClient,
    private readonly runLimiter: RunLimiter,
```

Add the method (place it near `answer()`, reusing the same `resolveContext`/`forTenant`/`settleIfExpired` pattern):

```ts
  async runCode(session: CandidateSession, dto: RunCodeDto): Promise<PistonExecuteResult> {
    const { organizationId, exam, invitation } = await this.resolveContext(session.invitationId);

    const { question } = await this.tenantPrisma.forTenant({ organizationId, isSuperAdmin: false }, async (tx) => {
      const attempt = await tx.attempt.findUnique({ where: { invitationId: invitation.id } });
      if (!attempt) {
        throw new NotFoundException('No attempt has been started');
      }
      const settled = await this.attemptSettlement.settleIfExpired(tx, exam, attempt);
      if (settled.status !== 'in_progress') {
        throw new BadRequestException(`Cannot run code — attempt status is "${settled.status}"`);
      }

      const questionIds: string[] = JSON.parse(settled.questionOrderJson);
      if (!questionIds.includes(dto.questionId)) {
        throw new BadRequestException(`Question ${dto.questionId} is not part of this attempt`);
      }
      const question = await tx.question.findFirstOrThrow({ where: { id: dto.questionId } });
      if (question.type !== 'code') {
        throw new BadRequestException(`Question ${dto.questionId} is not a code question`);
      }
      return { question };
    });

    const { allowed } = await this.runLimiter.checkAndIncrement(invitation.id, dto.questionId);
    if (!allowed) {
      throw new HttpException('You have used all 30 runs for this question', HttpStatus.TOO_MANY_REQUESTS);
    }

    const languageEntry = PISTON_LANGUAGE_MAP[question.codeLanguage as string];
    if (!languageEntry) {
      throw new BadRequestException(`Unsupported code language: ${question.codeLanguage}`);
    }

    try {
      return await this.pistonClient.execute({
        language: languageEntry.language,
        version: languageEntry.version,
        code: dto.code,
        stdin: question.allowStdin ? dto.stdin : undefined,
      });
    } catch {
      // `message` (not just `error`) is deliberate: apps/web's candidateApiFetch surfaces a
      // failed response's body.message as the thrown Error's .message, and Task 6's frontend
      // displays that message directly rather than a hardcoded string — so this exact text is
      // what the candidate sees. Keeping `error: 'sandbox_unavailable'` too for any future
      // machine-readable handling.
      throw new HttpException(
        { error: 'sandbox_unavailable', message: "Couldn't run your code right now, try again." },
        HttpStatus.BAD_GATEWAY,
      );
    }
  }
```

Add `HttpException`, `HttpStatus` to the file's existing `@nestjs/common` import if not already present, and import `PistonExecuteResult` as a type from `../code-execution/piston-client`.

Note the run-cap check uses `invitation.id` (stable per attempt) rather than the attempt's own id, since it's already in scope from `resolveContext` and uniquely identifies the candidate's attempt — consistent with how `answer()` scopes lookups by `invitation.id`.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd apps/exam-runtime && npx jest src/attempts/attempt.service.spec.ts`
Expected: PASS, all tests in the file green (existing `answer()`/`getCurrent()` tests plus the new `runCode()` tests).

- [ ] **Step 7: Wire the controller route**

In `apps/exam-runtime/src/attempts/attempt.controller.ts`, add the import and route:

```ts
import { RunCodeDto } from './dto/run-code.dto';
import { STRICT_CODE_RUN_THROTTLE } from '../rate-limit-tiers';
```

```ts
  @Post('run-code')
  @Throttle(STRICT_CODE_RUN_THROTTLE)
  runCode(@CurrentCandidate() candidate: CandidateSession, @Body() dto: RunCodeDto) {
    return this.attemptService.runCode(candidate, dto);
  }
```

- [ ] **Step 8: Register the new providers in the module**

In `apps/exam-runtime/src/attempts/attempt.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { GradingModule } from '../grading/grading.module';
import { MonitoringModule } from '../monitoring/monitoring.module';
import { AttemptController } from './attempt.controller';
import { AttemptService } from './attempt.service';
import { PistonClient } from '../code-execution/piston-client';
import { RunLimiter } from '../code-execution/run-limiter';

@Module({
  imports: [GradingModule, MonitoringModule],
  controllers: [AttemptController],
  providers: [AttemptService, PistonClient, RunLimiter],
})
export class AttemptModule {}
```

- [ ] **Step 9: Write a self-contained e2e spec for the run-code endpoint**

This follows the same structure as the existing `apps/api/test/exam-code-grading.e2e-spec.ts` (its own org/recruiter/exam/code-question fixtures, not shared with other spec files) rather than extending a larger shared-fixture file. Create `apps/api/test/code-run-execution.e2e-spec.ts`:

```ts
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { bootAdminApp, bootRuntimeApp } from './dual-app';
import { PrismaService } from '@exam-platform/shared';
import { TenantPrismaService } from '@exam-platform/shared';
import { EmailService } from '../src/email/email.service';
import { PistonClient } from '../../exam-runtime/src/code-execution/piston-client';

describe('Code Run Execution HTTP flow', () => {
  let adminApp: INestApplication;
  let runtimeApp: INestApplication;
  let adminHttp: any;
  let runtimeHttp: any;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let planId: string;
  let orgId: string;
  let recruiterAccessToken: string;
  let examId: string;
  let codeQuestionId: string;
  let singleMcqId: string;
  let accessToken: string;
  const fakeEmailService = { send: jest.fn().mockResolvedValue({ success: true, previewUrl: 'https://ethereal.email/fake' }) };
  const fakePistonClient = {
    execute: jest.fn().mockResolvedValue({ stdout: 'hi\n', stderr: '', exitCode: 0, compileError: null, timedOut: false }),
  };

  beforeAll(async () => {
    adminApp = await bootAdminApp((builder) => builder.overrideProvider(EmailService).useValue(fakeEmailService));
    ({ app: runtimeApp } = await bootRuntimeApp((builder) => builder.overrideProvider(PistonClient).useValue(fakePistonClient)));
    adminHttp = adminApp.getHttpServer();
    runtimeHttp = runtimeApp.getHttpServer();

    prisma = adminApp.get(PrismaService);
    tenantPrisma = adminApp.get(TenantPrismaService);

    const plan = await prisma.plan.create({
      data: { name: `ci-code-run-plan-${randomUUID()}`, candidateLimit: 10, aiCreditLimit: 1, proctoringMinutesLimit: 1 },
    });
    planId = plan.id;

    const org = await prisma.organization.create({ data: { name: 'CI Code Run Org', slug: `ci-code-run-org-${randomUUID()}`, planId } });
    orgId = org.id;

    const recruiterHash = await argon2.hash('RecruiterPassw0rd!');
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) =>
      tx.user.create({ data: { organizationId: orgId, email: 'recruiter@ci-code-run.test', passwordHash: recruiterHash, role: 'recruiter' } }),
    );

    recruiterAccessToken = (
      await request(adminHttp)
        .post('/api/v1/auth/staff/login')
        .send({ organizationSlug: org.slug, email: 'recruiter@ci-code-run.test', password: 'RecruiterPassw0rd!' })
        .expect(200)
    ).body.accessToken;

    const examResponse = await request(adminHttp)
      .post('/api/v1/exams')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ title: 'Code Run Round', durationMinutes: 60 })
      .expect(201);
    examId = examResponse.body.id;

    const sectionResponse = await request(adminHttp)
      .post(`/api/v1/exams/${examId}/sections`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ title: 'Section One' })
      .expect(201);

    const codeQuestionResponse = await request(adminHttp)
      .post('/api/v1/questions')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({
        type: 'code',
        text: 'Print "hi".',
        difficulty: 'easy',
        marks: 5,
        codeLanguage: 'python',
        starterCode: 'print("hi")',
        options: [],
      })
      .expect(201);
    codeQuestionId = codeQuestionResponse.body.id;

    const singleMcqResponse = await request(adminHttp)
      .post('/api/v1/questions')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({
        type: 'single_mcq', text: 'What is 2+2?', difficulty: 'easy', marks: 5,
        options: [{ text: '4', isCorrect: true }, { text: '5', isCorrect: false }],
      })
      .expect(201);
    singleMcqId = singleMcqResponse.body.id;

    await request(adminHttp)
      .put(`/api/v1/exams/${examId}/sections/${sectionResponse.body.id}/questions`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ questionIds: [codeQuestionId, singleMcqId] })
      .expect(200);

    await request(adminHttp)
      .post(`/api/v1/exams/${examId}/publish`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(201);

    const candidateResponse = await request(adminHttp)
      .post('/api/v1/candidates')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ email: 'alice@ci-code-run.test', name: 'Alice' })
      .expect(201);

    const inviteResponse = await request(adminHttp)
      .post(`/api/v1/exams/${examId}/invitations`)
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .send({ candidateIds: [candidateResponse.body.id] })
      .expect(201);
    const token = inviteResponse.body.created[0].token;

    accessToken = (await request(runtimeHttp).post('/api/v1/candidate-auth/redeem').send({ token }).expect(200)).body.accessToken;
    await request(runtimeHttp).post('/api/v1/attempt/start').set('Authorization', `Bearer ${accessToken}`).send({}).expect(201);
  });

  afterAll(async () => {
    try {
      await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) => tx.exam.deleteMany({ where: { organizationId: orgId } }));
      await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) => tx.question.deleteMany({ where: { organizationId: orgId } }));
      await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) => tx.candidate.deleteMany({ where: { organizationId: orgId } }));
      await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: true }, (tx) => tx.refreshToken.deleteMany({ where: { user: { organizationId: orgId } } }));
      await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) => tx.user.deleteMany({ where: { organizationId: orgId } }));
      await prisma.organization.delete({ where: { id: orgId } }).catch(() => undefined);
      await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    } finally {
      await adminApp.close();
      await runtimeApp.close();
    }
  });

  it('runs code for a code question and returns the sandbox result', async () => {
    const runResponse = await request(runtimeHttp)
      .post('/api/v1/attempt/run-code')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ questionId: codeQuestionId, code: 'print("hi")' })
      .expect(201);

    expect(runResponse.body).toEqual({ stdout: 'hi\n', stderr: '', exitCode: 0, compileError: null, timedOut: false });
    expect(fakePistonClient.execute).toHaveBeenCalledWith({ language: 'python', version: '3.10.0', code: 'print("hi")', stdin: undefined });
  });

  it('rejects run-code for a non-code question with 400', async () => {
    await request(runtimeHttp)
      .post('/api/v1/attempt/run-code')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ questionId: singleMcqId, code: 'x' })
      .expect(400);
  });

  it('rejects run-code with a clean 429, not a crash, once the run cap is exceeded', async () => {
    fakePistonClient.execute.mockClear();
    // MAX_RUNS_PER_QUESTION is 30; this question has already been run once by the first
    // test above, so 29 more exhausts it.
    for (let i = 0; i < 29; i++) {
      await request(runtimeHttp)
        .post('/api/v1/attempt/run-code')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ questionId: codeQuestionId, code: 'print("hi")' })
        .expect(201);
    }

    const cappedResponse = await request(runtimeHttp)
      .post('/api/v1/attempt/run-code')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ questionId: codeQuestionId, code: 'print("hi")' })
      .expect(429);

    expect(cappedResponse.body.message).toBe('You have used all 30 runs for this question');
  });
});
```

- [ ] **Step 10: Run the e2e test**

Run: `cd apps/api && NODE_ENV=test npx jest --config ./test/jest-e2e.json code-run-execution --runInBand`
Expected: PASS, all 3 tests green.

- [ ] **Step 11: Commit**

```bash
git add apps/exam-runtime/src/attempts/dto/run-code.dto.ts apps/exam-runtime/src/attempts/attempt.controller.ts apps/exam-runtime/src/attempts/attempt.service.ts apps/exam-runtime/src/attempts/attempt.service.spec.ts apps/exam-runtime/src/attempts/attempt.module.ts apps/exam-runtime/src/rate-limit-tiers.ts apps/api/test/code-run-execution.e2e-spec.ts
git commit -m "feat: add POST /attempt/run-code endpoint"
```

---

### Task 6: Candidate frontend — Run button, stdin box, output panel

**Files:**
- Modify: `apps/web/lib/hooks/useAttempt.ts`
- Modify: `apps/web/app/(candidate)/exam/page.tsx`
- Test: `apps/web/app/(candidate)/exam/page.test.tsx`

**Interfaces:**
- Consumes: `POST /attempt/run-code` (Task 5), `candidateApiFetch` (existing), `AttemptQuestion.allowStdin` (Task 2).
- Produces: `useRunCode()` hook returning a mutation with `{stdout, stderr, exitCode, compileError, timedOut}` on success.

- [ ] **Step 1: Write the failing test for the hook**

In `apps/web/lib/hooks/useAttempt.test.tsx`, add a new `describe` block after the existing `useAnswerMutation` one, following the same `global.fetch` mocking + `wrapper` pattern already used in this file:

```tsx
describe('useRunCode', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('posts the code and stdin to /attempt/run-code and returns the sandbox result', async () => {
    const calls: { url: string; body: unknown }[] = [];
    global.fetch = jest.fn(async (url, options) => {
      if (String(url).endsWith('/candidate-auth/refresh')) {
        return new Response(JSON.stringify({ message: 'none' }), { status: 401 });
      }
      calls.push({ url: String(url), body: JSON.parse((options as RequestInit).body as string) });
      return new Response(
        JSON.stringify({ stdout: 'hi\n', stderr: '', exitCode: 0, compileError: null, timedOut: false }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    let hook: ReturnType<typeof useRunCode> | undefined;
    function Probe() {
      hook = useRunCode();
      return null;
    }
    render(<Probe />, { wrapper });

    const result = await hook!.mutateAsync({ questionId: 'q-1', code: 'print("hi")', stdin: 'Alice' });

    expect(result).toEqual({ stdout: 'hi\n', stderr: '', exitCode: 0, compileError: null, timedOut: false });
    expect(calls[0].url).toContain('/attempt/run-code');
    expect(calls[0].body).toEqual({ questionId: 'q-1', code: 'print("hi")', stdin: 'Alice' });
  });
});
```

Add `useRunCode` to the file's existing import from `./useAttempt` (line 5).

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && npx jest lib/hooks/useAttempt.test.tsx -t "useRunCode"`
Expected: FAIL — `useRunCode` is not exported from `useAttempt.ts`.

- [ ] **Step 3: Add the `useRunCode()` hook**

In `apps/web/lib/hooks/useAttempt.ts`, add:

```ts
export interface RunCodeResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  compileError: string | null;
  timedOut: boolean;
}

export function useRunCode() {
  const { accessToken } = useCandidateAuth();
  return useMutation({
    mutationFn: ({ questionId, code, stdin }: { questionId: string; code: string; stdin?: string }): Promise<RunCodeResult> =>
      candidateApiFetch('/attempt/run-code', { method: 'POST', body: JSON.stringify({ questionId, code, stdin }) }, accessToken ?? undefined),
  });
}
```

(Match the existing `useCandidateAuth`/`candidateApiFetch` import style already at the top of this file.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/web && npx jest lib/hooks/useAttempt.test.tsx -t "useRunCode"`
Expected: PASS.

- [ ] **Step 5: Write the failing test for the Run button/output panel UI**

In `apps/web/app/(candidate)/exam/page.test.tsx`:

1. Add `useRunCode` to the import from `'../../../lib/hooks/useAttempt'` (line 4) and to the `jest.mock('../../../lib/hooks/useAttempt', ...)` factory (lines 11-15), so it becomes:

```ts
import { useAttemptQuery, useAnswerMutation, useSubmitAttempt, useRunCode } from '../../../lib/hooks/useAttempt';
...
jest.mock('../../../lib/hooks/useAttempt', () => ({
  useAttemptQuery: jest.fn(),
  useAnswerMutation: jest.fn(),
  useSubmitAttempt: jest.fn(),
  useRunCode: jest.fn(),
}));
```

2. Add `allowStdin: false` to `codeAttemptState`'s question object (line 57, alongside the existing `options: []`), and add a second fixture right after it for the stdin-enabled case:

```ts
const codeAttemptStateWithStdin = {
  ...codeAttemptState,
  sections: [{ ...codeAttemptState.sections[0], questions: [{ ...codeAttemptState.sections[0].questions[0], allowStdin: true }] }],
};
```

3. Inside the `describe('CandidateExamPage', ...)` block, add a `runCodeMutate` mock alongside the existing `push`/`saveAnswer`/`mutateAsync` mocks and wire it into `beforeEach`:

```ts
  const runCodeMutate = jest.fn();
```
```ts
    runCodeMutate.mockClear();
    (useRunCode as jest.Mock).mockReturnValue({ mutate: runCodeMutate, isPending: false });
```

4. Add the new tests (each overrides `useAttemptQuery` to return the code-question fixture first):

```ts
  it('runs code and displays the output panel', async () => {
    (useAttemptQuery as jest.Mock).mockReturnValue({ data: codeAttemptState, isError: false });
    runCodeMutate.mockImplementation((_payload, { onSuccess }) =>
      onSuccess({ stdout: 'hi\n', stderr: '', exitCode: 0, compileError: null, timedOut: false }),
    );
    render(<CandidateExamPage />);

    await userEvent.click(screen.getByRole('button', { name: 'Run' }));

    expect(await screen.findByText('hi')).toBeInTheDocument();
    expect(screen.getByText('Exit code: 0')).toBeInTheDocument();
  });

  it('shows the stdin box only when the question allows it', () => {
    (useAttemptQuery as jest.Mock).mockReturnValue({ data: codeAttemptState, isError: false });
    render(<CandidateExamPage />);
    expect(screen.queryByLabelText('Standard input (optional)')).not.toBeInTheDocument();
  });

  it('shows the stdin box when the question allows it', () => {
    (useAttemptQuery as jest.Mock).mockReturnValue({ data: codeAttemptStateWithStdin, isError: false });
    render(<CandidateExamPage />);
    expect(screen.getByLabelText('Standard input (optional)')).toBeInTheDocument();
  });

  it('shows the server-provided message when the sandbox is unavailable', async () => {
    // This exact string is what apps/exam-runtime's runCode() sends as the HttpException
    // message for a Piston failure (see Task 5, Step 5) — candidateApiFetch surfaces a failed
    // response's body.message as the thrown Error's .message, and the page displays it as-is
    // rather than a hardcoded string, so this test exercises the real end-to-end message path.
    (useAttemptQuery as jest.Mock).mockReturnValue({ data: codeAttemptState, isError: false });
    runCodeMutate.mockImplementation((_payload, { onError }) => onError(new Error("Couldn't run your code right now, try again.")));
    render(<CandidateExamPage />);

    await userEvent.click(screen.getByRole('button', { name: 'Run' }));

    expect(await screen.findByText("Couldn't run your code right now, try again.")).toBeInTheDocument();
  });

  it('shows the run-cap message when the cap is exceeded', async () => {
    (useAttemptQuery as jest.Mock).mockReturnValue({ data: codeAttemptState, isError: false });
    runCodeMutate.mockImplementation((_payload, { onError }) => onError(new Error('You have used all 30 runs for this question')));
    render(<CandidateExamPage />);

    await userEvent.click(screen.getByRole('button', { name: 'Run' }));

    expect(await screen.findByText('You have used all 30 runs for this question')).toBeInTheDocument();
  });
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `cd apps/web && npx jest "app/(candidate)/exam/page.test.tsx" -t "Run"`
Expected: FAIL — no "Run" button exists yet, and `useRunCode` is not yet a real export.

- [ ] **Step 7: Add the Run button, stdin box, and output panel**

In `apps/web/app/(candidate)/exam/page.tsx`, add the import and local state:

```tsx
import { useAttemptQuery, useAnswerMutation, useSubmitAttempt, useRunCode, RunCodeResult } from '../../../lib/hooks/useAttempt';
```

```tsx
  const runCode = useRunCode();
  const [stdinValue, setStdinValue] = useState('');
  const [runResult, setRunResult] = useState<RunCodeResult | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  function handleRun() {
    if (!question) return;
    setRunError(null);
    runCode.mutate(
      { questionId: question.id, code: codeValue, stdin: question.allowStdin ? stdinValue : undefined },
      {
        onSuccess: (result) => setRunResult(result),
        // error.message carries the server's real message (e.g. the run-cap or
        // sandbox_unavailable text set in apps/exam-runtime's runCode()) rather than a
        // hardcoded string here, matching this codebase's established onError convention.
        onError: (error) => setRunError(error instanceof Error ? error.message : "Couldn't run your code right now, try again."),
      },
    );
  }
```

In the `question.type === 'code'` JSX block, after the `<Editor>`:

```tsx
          {question.type === 'code' ? (
            <>
              <Editor
                height="400px"
                language={question.codeLanguage ?? 'plaintext'}
                value={codeValue}
                onChange={handleCodeChange}
                options={{ minimap: { enabled: false }, fontSize: 13 }}
              />
              {question.allowStdin ? (
                <div className="mt-2 flex flex-col gap-1">
                  <label htmlFor="stdin-input" className="text-xs font-medium text-gray-600">
                    Standard input (optional)
                  </label>
                  <textarea
                    id="stdin-input"
                    aria-label="Standard input (optional)"
                    value={stdinValue}
                    onChange={(e) => setStdinValue(e.target.value)}
                    className="rounded border border-gray-300 px-2 py-1 font-mono text-xs"
                    rows={2}
                  />
                </div>
              ) : null}
              <div className="mt-2 flex items-center gap-2">
                <CandidateButton variant="secondary" onClick={handleRun} disabled={runCode.isPending}>
                  {runCode.isPending ? 'Running…' : 'Run'}
                </CandidateButton>
              </div>
              {runError ? (
                <div className="mt-2 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">{runError}</div>
              ) : runResult ? (
                <div className="mt-2 rounded border border-gray-200 bg-gray-50 p-2 font-mono text-xs">
                  {runResult.compileError ? (
                    <div className="text-red-700">{runResult.compileError}</div>
                  ) : (
                    <>
                      {runResult.stdout ? <div className="whitespace-pre-wrap">{runResult.stdout}</div> : null}
                      {runResult.stderr ? <div className="whitespace-pre-wrap text-red-700">{runResult.stderr}</div> : null}
                      {runResult.timedOut ? <div className="text-amber-700">Your program was stopped for taking too long.</div> : null}
                    </>
                  )}
                  <div className="mt-1 text-gray-500">Exit code: {runResult.exitCode}</div>
                </div>
              ) : null}
            </>
          ) : (
```

(This replaces the existing single-line `<Editor .../>` block for the `code` case with the fragment above; the surrounding `question.type === 'code' ? (...) : (...)` ternary structure and the MCQ-options branch are otherwise unchanged.)

- [ ] **Step 8: Run the tests to verify they pass**

Run: `cd apps/web && npx jest lib/hooks/useAttempt.test.tsx "app/(candidate)/exam/page.test.tsx"`
Expected: PASS, all tests in both files green.

- [ ] **Step 9: Commit**

```bash
git add apps/web/lib/hooks/useAttempt.ts apps/web/lib/hooks/useAttempt.test.tsx "apps/web/app/(candidate)/exam/page.tsx" "apps/web/app/(candidate)/exam/page.test.tsx"
git commit -m "feat: add Run button, stdin box, and output panel to candidate code editor"
```

---

### Task 7: Playwright — extend the code-question golden path

**Files:**
- Modify: `apps/web/e2e/code-question-golden-path.spec.ts`

**Interfaces:**
- Consumes: the real `POST /attempt/run-code` endpoint (Task 5) against a real (or, if unavailable, gracefully skipped) Piston container.

- [ ] **Step 1: Add the Run step**

In `apps/web/e2e/code-question-golden-path.spec.ts`, immediately after the existing block that fills in the reverse-string code (the `insertText(...)` call shown in this plan's research notes) and before submitting, add:

```ts
    await candidatePage.getByRole('button', { name: 'Run' }).click();
    // Real Piston execution can take a second or two; wait for either a real result or the
    // sandbox_unavailable error panel, rather than a fixed sleep.
    await candidatePage.waitForResponse((response) => response.url().includes('/attempt/run-code'));
    const resultPanel = candidatePage.getByText(/Exit code:|Couldn't run your code right now/);
    await expect(resultPanel).toBeVisible({ timeout: 10000 });
```

This asserts the Run flow completes and *some* panel renders, without hard-asserting the exact stdout — real Piston output can vary slightly across environments/versions, and the goal here is proving the click-through wiring works end-to-end, matching how other Playwright specs in this session prioritize real navigation over brittle exact-output assertions.

- [ ] **Step 2: Run the spec**

Run (with the dev servers and `docker compose up -d piston redis` already running, and `WEB_BASE_URL=http://localhost:3002` set per this project's established Playwright convention):
```bash
cd apps/web && WEB_BASE_URL=http://localhost:3002 npx playwright test e2e/code-question-golden-path.spec.ts
```
Expected: PASS. If Piston isn't running locally, this step will show the `sandbox_unavailable` panel instead of real output — the assertion above accepts either, so the spec still passes and confirms the wiring; note in the task report which case actually occurred.

- [ ] **Step 3: Commit**

```bash
git add apps/web/e2e/code-question-golden-path.spec.ts
git commit -m "test: extend code-question golden path with a Run step"
```

---

### Task 8: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Full backend suites**

Run from repo root: `npm run test:api && npm run test:api:e2e && npm run test:exam-runtime && npm run test:shared`
Expected: all pass, including every new test from Tasks 1-5. The pre-existing `ai-question-generation.e2e-spec.ts` flake (missing `ANTHROPIC_API_KEY`) is documented and unrelated.

- [ ] **Step 2: Full frontend unit suite**

Run: `cd apps/web && npm test`
Expected: all suites pass, including every new test from Task 6.

- [ ] **Step 3: Full Playwright suite**

Run: `cd apps/web && npx playwright test`
Expected: every golden path passes, including the extended `code-question-golden-path.spec.ts` from Task 7.

- [ ] **Step 4: Manual smoke check**

With dev servers and `docker compose up -d` (Redis + Piston) running: as recruiter, create a code question with "Allow candidates to provide input (stdin)" checked, publish an exam with it, invite a candidate. As that candidate, open the exam, write working code, click Run, confirm real output renders; toggle in a deliberate syntax error and confirm a compile/runtime error renders instead; if the question has stdin enabled, confirm the stdin box appears and its value reaches the program's input. Click Run repeatedly (or adjust `MAX_RUNS_PER_QUESTION` temporarily) to confirm the cap message appears once exhausted.

- [ ] **Step 5: Update the SDD progress ledger**

Overwrite `.superpowers/sdd/progress.md` with:

```
# Code Run Execution — SDD Progress Ledger

## Tasks
Task 1: complete (schema + recruiter allowStdin plumbing)
Task 2: complete (candidate-side allowStdin read path)
Task 3: complete (Piston client + language mapping + docker-compose)
Task 4: complete (Redis run-cap limiter)
Task 5: complete (POST /attempt/run-code endpoint)
Task 6: complete (candidate frontend Run button/stdin/output panel)
Task 7: complete (Playwright extension)
Task 8: complete (final verification)
```
