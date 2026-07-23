# Code Question Type Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fourth question type, `code`, where candidates write source code in an in-browser editor instead of selecting options, graded manually by a recruiter with an optional AI-assisted review — no code execution anywhere.

**Architecture:** Additive changes throughout the existing MCQ pipeline: `Question`/`Answer` gain a few new nullable columns (no side tables, matching this codebase's flat-column convention), `Attempt.status` gains a `pending_manual_grade` value that settlement enters when an attempt contains an ungraded `code` question, and a new recruiter-only HTTP surface (mirroring the existing `attempts-admin` → `ExamRuntimeInternalClient` → exam-runtime `internal` controller pattern already used for force-submit/reanalyze) lets a recruiter enter marks and trigger an optional Claude-based review (mirroring `AttemptInsightService`/`ClaudeInsightClient` exactly). Frontend gains a `code` branch in question authoring and candidate exam-taking (both currently have zero type-dispatch for non-MCQ content) plus a new, minimal recruiter grading screen.

**Tech Stack:** `@monaco-editor/react` (new dependency, CDN-loaded Monaco — no local bundling/webpack changes needed), existing NestJS/Prisma/Next.js/React Query stack.

## Global Constraints

- No code execution, ever. Grading is manual; AI review is a suggestion only and never writes `Answer.marksAwarded`.
- No new "round"/linked-exam concept — out of scope entirely, not touched by this plan.
- Fixed `codeLanguage` list: `javascript`, `typescript`, `python`, `java`, `csharp`, `cpp`, `go`, `ruby`.
- No "test cases" data structure — the problem statement lives entirely in the existing `text` field.
- `Attempt.status` gains exactly one new value: `'pending_manual_grade'`.
- "Finalize grade" is always an explicit, separate recruiter action — never automatic.
- Blank code submissions are not auto-zeroed — every `code` question in a pending attempt always requires an explicit recruiter grading action before finalization.
- AI review endpoints are gated `exam:manage` (recruiter-only) — panel's involvement was not scoped by the spec, so this plan does not touch panel's permissions or screens at all.
- Reuse the existing recruiter design system (`Table`, `Badge`, `Card`, `Button`, `Toast`) — no new visual identity.

---

### Task 1: Schema — code-question columns, `CodeAnswerReview` model

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: a new Prisma migration under `apps/api/prisma/migrations/`

**Interfaces:**
- Consumes: nothing from earlier tasks (first task).
- Produces: `Question.codeLanguage: String?`, `Question.starterCode: String?`, `Answer.answerText: String?`, `Answer.gradingFeedback: String?`, model `CodeAnswerReview { id, answerId, status, suggestedMarks, summary, generatedAt }` — every later backend task relies on these exact field names.

- [ ] **Step 1: Add the new columns and model**

In `apps/api/prisma/schema.prisma`, find the `Question` model and add two fields after `aiGenerated`:

```prisma
  aiGenerated    Boolean               @default(false) @map("ai_generated")
  codeLanguage   String?               @map("code_language")
  starterCode    String?               @map("starter_code") @db.NVarChar(Max)
```

Find the `Answer` model and add two fields after `marksAwarded`:

```prisma
  marksAwarded          Int?     @map("marks_awarded")
  answerText            String?  @map("answer_text") @db.NVarChar(Max)
  gradingFeedback       String?  @map("grading_feedback") @db.NVarChar(Max)
  codeReview            CodeAnswerReview?
```

Add a new model directly after the `Answer` model's closing `}`:

```prisma
model CodeAnswerReview {
  id             String   @id @default(uuid()) @db.UniqueIdentifier
  answerId       String   @unique @map("answer_id") @db.UniqueIdentifier
  status         String
  suggestedMarks Int?     @map("suggested_marks")
  summary        String?  @db.NVarChar(Max)
  generatedAt    DateTime @default(now()) @map("generated_at")
  answer         Answer   @relation(fields: [answerId], references: [id], onDelete: Cascade)

  @@map("code_answer_reviews")
}
```

- [ ] **Step 2: Generate and apply the migration**

Run: `cd apps/api && npx prisma migrate dev --name add_code_question_type`
Expected: a new timestamped folder appears under `apps/api/prisma/migrations/` containing a `migration.sql` with `ALTER TABLE questions ADD code_language ...`, `ALTER TABLE answers ADD answer_text ...`, `CREATE TABLE code_answer_reviews ...`, and the command exits with `Your database is now in sync with your schema.`

- [ ] **Step 3: Regenerate the Prisma client**

Run: `cd apps/api && npx prisma generate`
Expected: completes without error, `@prisma/client` types now include `codeLanguage`/`starterCode`/`answerText`/`gradingFeedback`/`CodeAnswerReview`.

- [ ] **Step 4: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat: schema for code question type — Question/Answer columns, CodeAnswerReview model"
```

---

### Task 2: Question authoring backend — validation, DTOs, service

**Files:**
- Modify: `apps/api/src/questions/question-validation.ts`
- Test: `apps/api/src/questions/question-validation.spec.ts`
- Modify: `apps/api/src/questions/dto/create-question.dto.ts`
- Modify: `apps/api/src/questions/questions.service.ts`
- Test: `apps/api/src/questions/questions.service.spec.ts`

**Interfaces:**
- Consumes: `Question.codeLanguage`/`Question.starterCode` from Task 1.
- Produces: `validateQuestionPayload` accepts `type: 'code'` with zero options and a required `codeLanguage`; `CreateQuestionDto`/`UpdateQuestionDto` accept optional `codeLanguage`/`starterCode` and no longer require at least one option — Task 3+ and the frontend (Task 7) rely on this exact DTO shape.

- [ ] **Step 1: Write the failing validation tests**

Add to `apps/api/src/questions/question-validation.spec.ts` (append inside the existing `describe` block, matching its current structure — read the file first to match its exact `describe`/`it` nesting before inserting):

```ts
  it('accepts a code question with zero options and a valid codeLanguage', () => {
    expect(() =>
      validateQuestionPayload({
        type: 'code',
        difficulty: 'medium',
        marks: 10,
        negativeMarks: 0,
        options: [],
        codeLanguage: 'python',
      }),
    ).not.toThrow();
  });

  it('rejects a code question with any options', () => {
    expect(() =>
      validateQuestionPayload({
        type: 'code',
        difficulty: 'medium',
        marks: 10,
        negativeMarks: 0,
        options: [{ text: 'irrelevant', isCorrect: false }],
        codeLanguage: 'python',
      }),
    ).toThrow('code questions must not have options');
  });

  it('rejects a code question with a missing codeLanguage', () => {
    expect(() =>
      validateQuestionPayload({
        type: 'code',
        difficulty: 'medium',
        marks: 10,
        negativeMarks: 0,
        options: [],
      }),
    ).toThrow('Unknown or missing codeLanguage');
  });

  it('rejects a code question with an unsupported codeLanguage', () => {
    expect(() =>
      validateQuestionPayload({
        type: 'code',
        difficulty: 'medium',
        marks: 10,
        negativeMarks: 0,
        options: [],
        codeLanguage: 'cobol',
      }),
    ).toThrow('Unknown or missing codeLanguage');
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && npx jest questions/question-validation.spec.ts`
Expected: FAIL — `type: 'code'` is rejected by `Unknown question type: code` (the new `it` blocks assert different error messages / non-throwing, so they fail against current behavior).

- [ ] **Step 3: Implement the `'code'` validation branch**

Replace the full contents of `apps/api/src/questions/question-validation.ts`:

```ts
import { BadRequestException } from '@nestjs/common';

export interface QuestionOptionInput {
  text: string;
  isCorrect: boolean;
}

export interface QuestionValidationInput {
  type: string;
  difficulty: string;
  marks: number;
  negativeMarks: number;
  options: QuestionOptionInput[];
  codeLanguage?: string;
}

const VALID_TYPES = ['single_mcq', 'multi_mcq', 'true_false', 'code'];
const VALID_DIFFICULTIES = ['easy', 'medium', 'hard'];
export const VALID_CODE_LANGUAGES = ['javascript', 'typescript', 'python', 'java', 'csharp', 'cpp', 'go', 'ruby'];

export function validateQuestionPayload(input: QuestionValidationInput): void {
  const { type, difficulty, marks, negativeMarks, options, codeLanguage } = input;

  if (!VALID_TYPES.includes(type)) {
    throw new BadRequestException(`Unknown question type: ${type}`);
  }
  if (!VALID_DIFFICULTIES.includes(difficulty)) {
    throw new BadRequestException(`Unknown difficulty: ${difficulty}`);
  }
  if (marks <= 0) {
    throw new BadRequestException('marks must be greater than 0');
  }
  if (negativeMarks < 0) {
    throw new BadRequestException('negativeMarks must be 0 or greater');
  }
  if (negativeMarks > marks) {
    throw new BadRequestException('negativeMarks cannot exceed marks');
  }

  const correctCount = options.filter((o) => o.isCorrect).length;

  if (type === 'code') {
    if (options.length !== 0) {
      throw new BadRequestException('code questions must not have options');
    }
    if (!codeLanguage || !VALID_CODE_LANGUAGES.includes(codeLanguage)) {
      throw new BadRequestException(`Unknown or missing codeLanguage: ${codeLanguage}`);
    }
  } else if (type === 'true_false') {
    if (options.length !== 2) {
      throw new BadRequestException('true_false questions must have exactly 2 options');
    }
    if (correctCount !== 1) {
      throw new BadRequestException('true_false questions must have exactly 1 correct option');
    }
  } else if (type === 'single_mcq') {
    if (options.length < 2) {
      throw new BadRequestException('single_mcq questions must have at least 2 options');
    }
    if (correctCount !== 1) {
      throw new BadRequestException('single_mcq questions must have exactly 1 correct option');
    }
  } else if (type === 'multi_mcq') {
    if (options.length < 2) {
      throw new BadRequestException('multi_mcq questions must have at least 2 options');
    }
    if (correctCount < 1) {
      throw new BadRequestException('multi_mcq questions must have at least 1 correct option');
    }
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/api && npx jest questions/question-validation.spec.ts`
Expected: all tests pass, including the 4 new ones.

- [ ] **Step 5: Update `CreateQuestionDto`**

Replace the full contents of `apps/api/src/questions/dto/create-question.dto.ts`:

```ts
import { IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { VALID_CODE_LANGUAGES } from '../question-validation';

export class QuestionOptionDto {
  @IsString()
  text!: string;

  @IsBoolean()
  isCorrect!: boolean;
}

export class CreateQuestionDto {
  @IsIn(['single_mcq', 'multi_mcq', 'true_false', 'code'])
  type!: string;

  @IsString()
  text!: string;

  @IsOptional()
  @IsString()
  topic?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsIn(['easy', 'medium', 'hard'])
  difficulty!: string;

  @IsInt()
  @Min(1)
  marks!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  negativeMarks?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsIn(VALID_CODE_LANGUAGES)
  codeLanguage?: string;

  @IsOptional()
  @IsString()
  starterCode?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuestionOptionDto)
  options!: QuestionOptionDto[];
}
```

(Note: `@ArrayMinSize(1)` is intentionally dropped from `options` — a `code` question sends an empty array, and per-type minimums for the MCQ types are already enforced by `validateQuestionPayload`, called before this DTO's data ever reaches persistence.)

- [ ] **Step 6: Wire `codeLanguage`/`starterCode` through `QuestionsService`**

In `apps/api/src/questions/questions.service.ts`, update the `create` method's `validateQuestionPayload` call:

```ts
    validateQuestionPayload({
      type: dto.type,
      difficulty: dto.difficulty,
      marks: dto.marks,
      negativeMarks: dto.negativeMarks ?? 0,
      options: dto.options,
      codeLanguage: dto.codeLanguage,
    });
```

and its `tx.question.create({ data: {...} })` call — add two lines after `negativeMarks: dto.negativeMarks ?? 0,`:

```ts
          negativeMarks: dto.negativeMarks ?? 0,
          codeLanguage: dto.codeLanguage,
          starterCode: dto.starterCode,
          createdBy: userId,
```

Apply the identical two changes to the `update` method (same `validateQuestionPayload` call shape, same two new lines in the `tx.question.update({ data: {...} })` call, inserted after its `negativeMarks: dto.negativeMarks ?? 0,` line).

- [ ] **Step 7: Write the failing service test**

Add to `apps/api/src/questions/questions.service.spec.ts` (append inside the existing `describe('create', ...)` or top-level `describe` block — read the file first to match its exact mocking setup for `tenantPrisma`/`jobsService` before inserting):

```ts
  it('creates a code question with zero options and persists codeLanguage/starterCode', async () => {
    const result = await service.create(tenantContext, 'user-1', {
      type: 'code',
      text: 'Write a function that reverses a string.',
      difficulty: 'medium',
      marks: 10,
      codeLanguage: 'javascript',
      starterCode: 'function reverse(str) {\n  \n}',
      options: [],
    });

    expect(result.type).toBe('code');
    expect(result.codeLanguage).toBe('javascript');
    expect(result.starterCode).toBe('function reverse(str) {\n  \n}');
    expect(result.options).toEqual([]);
  });
```

(Match the exact mock-setup variable names — e.g. `service`, `tenantContext` — already used by the surrounding tests in this file; do not invent new ones.)

- [ ] **Step 8: Run the test to verify it fails, then implement, then verify it passes**

Run: `cd apps/api && npx jest questions/questions.service.spec.ts`
Expected before Step 6: FAIL (`Unknown question type: code` thrown by `validateQuestionPayload`, or `codeLanguage`/`starterCode` missing from the mock's create-data assertion). After Step 6's changes: `Tests: <N+1> passed`.

- [ ] **Step 9: Run the full questions test suite**

Run: `cd apps/api && npx jest questions/`
Expected: all suites pass, including `question-validation.spec.ts`, `questions.service.spec.ts`, `tags.service.spec.ts`.

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/questions/question-validation.ts apps/api/src/questions/question-validation.spec.ts apps/api/src/questions/dto/create-question.dto.ts apps/api/src/questions/questions.service.ts apps/api/src/questions/questions.service.spec.ts
git commit -m "feat: code question type validation, DTO, and service wiring"
```

---

### Task 3: Candidate answer backend — `AnswerDto`, `attempt.service.ts`

**Files:**
- Modify: `apps/exam-runtime/src/attempts/dto/answer.dto.ts`
- Modify: `apps/exam-runtime/src/attempts/attempt.service.ts`
- Test: `apps/exam-runtime/src/attempts/attempt.service.spec.ts`

**Interfaces:**
- Consumes: `Answer.answerText` from Task 1.
- Produces: `AnswerDto.answerText?: string`; `AttemptService.answer()` now returns `{ questionId, selectedOptionIds, answerText, isMarkedForReview }`; `AttemptService.getCurrent()`'s `AttemptAnswerSummary` now includes `answerText` — Task 8 (frontend candidate page) relies on this exact response shape.

- [ ] **Step 1: Add `answerText` to `AnswerDto`**

Replace the full contents of `apps/exam-runtime/src/attempts/dto/answer.dto.ts`:

```ts
import { IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';

export class AnswerDto {
  @IsString()
  questionId!: string;

  // ponytail: empty array allowed — represents "mark for review before answering"
  @IsArray()
  @IsString({ each: true })
  selectedOptionIds!: string[];

  @IsOptional()
  @IsString()
  answerText?: string;

  @IsOptional()
  @IsBoolean()
  markedForReview?: boolean;
}
```

- [ ] **Step 2: Write the failing test for code-answer submission**

Add to `apps/exam-runtime/src/attempts/attempt.service.spec.ts` (find the existing `describe('answer', ...)` block and add inside it — read the file first to match its exact mock-setup pattern for `question`/`attempt` fixtures before inserting):

```ts
  it('stores answerText for a code question without validating it against options', async () => {
    const result = await service.answer(session, { questionId: 'code-question-1', selectedOptionIds: [], answerText: 'function reverse(s) { return s; }' });

    expect(result.answerText).toBe('function reverse(s) { return s; }');
    expect(result.selectedOptionIds).toEqual([]);
  });
```

(Adjust `session`/`service`/fixture identifiers to match this file's existing conventions; the fixture question referenced by `'code-question-1'` must have `type: 'code'` and empty `options` in whatever mock `tx.question.findFirstOrThrow` returns — mirror how existing `it` blocks in this `describe('answer', ...)` set up their question fixture.)

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd apps/exam-runtime && npx jest attempts/attempt.service.spec.ts -t "code question"`
Expected: FAIL — current `answer()` has no `answerText` handling, `result.answerText` is `undefined`, and/or `validateSelection` throws for the empty `selectedOptionIds` against a non-code question path.

- [ ] **Step 4: Implement the code-question branch in `answer()`**

In `apps/exam-runtime/src/attempts/attempt.service.ts`, replace the `answer` method (lines 181-225) with:

```ts
  async answer(
    session: CandidateSession,
    dto: AnswerDto,
  ): Promise<{ questionId: string; selectedOptionIds: string[]; answerText: string | null; isMarkedForReview: boolean }> {
    const { organizationId, exam, invitation } = await this.resolveContext(session.invitationId);

    return this.tenantPrisma.forTenant({ organizationId, isSuperAdmin: false }, async (tx) => {
      const attempt = await tx.attempt.findUnique({ where: { invitationId: invitation.id } });
      if (!attempt) {
        throw new NotFoundException('No attempt has been started');
      }
      const settled = await this.attemptSettlement.settleIfExpired(tx, exam, attempt);
      if (settled.status !== 'in_progress') {
        throw new BadRequestException(`Cannot answer — attempt status is "${settled.status}"`);
      }

      const questionIds: string[] = JSON.parse(settled.questionOrderJson);
      if (!questionIds.includes(dto.questionId)) {
        throw new BadRequestException(`Question ${dto.questionId} is not part of this attempt`);
      }
      const question = await tx.question.findFirstOrThrow({ where: { id: dto.questionId }, include: { options: true } });
      const isMarkedForReview = dto.markedForReview ?? false;

      if (question.type === 'code') {
        await tx.answer.upsert({
          where: { attemptId_questionId: { attemptId: settled.id, questionId: dto.questionId } },
          create: {
            attemptId: settled.id,
            questionId: dto.questionId,
            selectedOptionIdsJson: JSON.stringify([]),
            answerText: dto.answerText ?? null,
            isMarkedForReview,
          },
          update: {
            answerText: dto.answerText ?? null,
            isMarkedForReview,
            answeredAt: new Date(),
          },
        });
        return { questionId: dto.questionId, selectedOptionIds: [], answerText: dto.answerText ?? null, isMarkedForReview };
      }

      // An empty selection means "no answer yet, possibly just toggling markedForReview" — skip option validation.
      if (dto.selectedOptionIds.length > 0) {
        this.validateSelection(question, dto.selectedOptionIds);
      }

      await tx.answer.upsert({
        where: { attemptId_questionId: { attemptId: settled.id, questionId: dto.questionId } },
        create: {
          attemptId: settled.id,
          questionId: dto.questionId,
          selectedOptionIdsJson: JSON.stringify(dto.selectedOptionIds),
          isMarkedForReview,
        },
        update: {
          selectedOptionIdsJson: JSON.stringify(dto.selectedOptionIds),
          isMarkedForReview,
          answeredAt: new Date(),
        },
      });

      return { questionId: dto.questionId, selectedOptionIds: dto.selectedOptionIds, answerText: null, isMarkedForReview };
    });
  }
```

- [ ] **Step 5: Update `getCurrent()`'s answer mapping**

In the same file, `getCurrent()` (around line 91-101), update the `answers.map(...)` call:

```ts
        answers: answers.map((answer) => ({
          questionId: answer.questionId,
          selectedOptionIds: JSON.parse(answer.selectedOptionIdsJson),
          answerText: answer.answerText,
          isMarkedForReview: answer.isMarkedForReview,
        })),
```

Update the `AttemptAnswerSummary` interface (near the top of the file) to include the new field:

```ts
interface AttemptAnswerSummary {
  questionId: string;
  selectedOptionIds: string[];
  answerText: string | null;
  isMarkedForReview: boolean;
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd apps/exam-runtime && npx jest attempts/attempt.service.spec.ts`
Expected: all tests pass, including the new one — existing MCQ-focused tests are unaffected since `answerText` is simply `null` for them, matching their existing assertions (which don't check `answerText`).

- [ ] **Step 7: Commit**

```bash
git add apps/exam-runtime/src/attempts/dto/answer.dto.ts apps/exam-runtime/src/attempts/attempt.service.ts apps/exam-runtime/src/attempts/attempt.service.spec.ts
git commit -m "feat: candidate code-answer submission (answerText) in attempt service"
```

---

### Task 4: Settlement backend — pending-manual-grade branch, `finalizeManualGrade`

**Files:**
- Modify: `apps/exam-runtime/src/grading/attempt-settlement.service.ts`
- Test: create `apps/exam-runtime/src/grading/attempt-settlement.service.spec.ts` (if it doesn't already exist — check first with `find apps/exam-runtime/src/grading -name "*.spec.ts"`; if a spec file already exists, add to it instead of creating a new one, matching its existing mock-setup pattern for `tenantPrisma`/`tx`)

**Interfaces:**
- Consumes: `gradeAnswer`/`computeResult` from `grading.ts` (unchanged, Task 1's schema).
- Produces: `AttemptSettlementService.finalize()` now sets `Attempt.status = 'pending_manual_grade'` when the attempt contains any `type: 'code'` question, leaving that question's `Answer.marksAwarded` as `null`; new method `AttemptSettlementService.finalizeManualGrade(tx, exam, attempt): Promise<Attempt>` — Task 5 calls this directly.

- [ ] **Step 1: Check for an existing spec file**

Run: `find apps/exam-runtime/src/grading -name "*.spec.ts"`
If `attempt-settlement.service.spec.ts` exists, read it fully to match its exact mock conventions before writing the tests below into it. If it doesn't exist, create it fresh using the pattern shown in Step 2.

- [ ] **Step 2: Write the failing tests**

Add (or create the file with) these test cases, adapting the `tx`/`exam`/`attempt` mock fixtures to match whatever convention this file (or a sibling spec file in the same directory, e.g. `grading.spec.ts`) already uses for mocking `Prisma.TransactionClient`:

```ts
  it('sets Attempt.status to pending_manual_grade when the attempt contains a code question, leaving its marksAwarded null', async () => {
    // Arrange: tx.question.findMany returns one MCQ question (already answered correctly)
    // and one code question with a submitted answerText but no marksAwarded yet.
    // Act: await service.finalize(tx, exam, attempt, 'submitted')
    // Assert: the returned Attempt has status === 'pending_manual_grade'; the code
    // question's Answer row was NOT updated with isCorrect/marksAwarded (still null);
    // the MCQ question's Answer row WAS graded normally.
  });

  it('settles normally (no pending_manual_grade) when the attempt has no code questions', async () => {
    // Arrange: tx.question.findMany returns only MCQ questions.
    // Act: await service.finalize(tx, exam, attempt, 'submitted')
    // Assert: status === 'submitted' (the passed-in status, unchanged from today's behavior).
  });

  it('finalizeManualGrade throws when a code question still has no marksAwarded', async () => {
    // Arrange: attempt.status === 'pending_manual_grade'; one code question's Answer has marksAwarded: null.
    // Act/Assert: await expect(service.finalizeManualGrade(tx, exam, attempt)).rejects.toThrow(/still need grading/);
  });

  it('finalizeManualGrade recomputes the Result and settles the attempt once every code question is graded', async () => {
    // Arrange: attempt.status === 'pending_manual_grade'; one MCQ question already graded (marksAwarded: 5);
    // one code question with Answer.marksAwarded: 8 (already recruiter-graded).
    // Act: const finalized = await service.finalizeManualGrade(tx, exam, attempt);
    // Assert: finalized.status === 'submitted'; tx.result.update was called with score: 13 and a real passFail
    // (not null) computed from the full question set.
  });
```

(These are described as comments rather than literal assertions because the exact mock shape depends on this file's/sibling file's established `Prisma.TransactionClient` mocking convention, which must be read first per Step 1 — write the real `expect(...)` assertions matching that convention, using the exact behavior described in each comment.)

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd apps/exam-runtime && npx jest grading/attempt-settlement.service.spec.ts`
Expected: FAIL — `finalizeManualGrade` doesn't exist yet, and `finalize()` has no pending-grade branch.

- [ ] **Step 4: Implement the pending-grade branch in `finalize()`**

In `apps/exam-runtime/src/grading/attempt-settlement.service.ts`, replace the body of `finalize()` (lines 40-115) with:

```ts
  async finalize(
    tx: Prisma.TransactionClient,
    exam: SettlementExam,
    attempt: Attempt,
    status: 'submitted' | 'auto_submitted' | 'force_submitted',
  ): Promise<Attempt> {
    const existingResult = await tx.result.findUnique({ where: { attemptId: attempt.id } });
    if (existingResult) {
      // A concurrent settlement (e.g. another request racing on the same expired attempt) already
      // created the Result for this attempt. Don't grade/create again — just return the current attempt.
      return tx.attempt.findUniqueOrThrow({ where: { id: attempt.id } });
    }

    const questionIds: string[] = JSON.parse(attempt.questionOrderJson);
    const questions = await tx.question.findMany({ where: { id: { in: questionIds } }, include: { options: true } });
    const existingAnswers = await tx.answer.findMany({ where: { attemptId: attempt.id } });
    const answersByQuestionId = new Map(existingAnswers.map((answer) => [answer.questionId, answer]));

    const hasCodeQuestions = questions.some((question) => question.type === 'code');
    const gradedAnswers: { marksAwarded: number }[] = [];
    for (const question of questions) {
      if (question.type === 'code') {
        // Manual grading only — never auto-graded, never contributes to gradedAnswers until a
        // recruiter enters marks via finalizeManualGrade().
        continue;
      }
      const answer = answersByQuestionId.get(question.id);
      const selectedOptionIds: string[] = answer ? JSON.parse(answer.selectedOptionIdsJson) : [];
      const correctOptionIds = question.options.filter((option) => option.isCorrect).map((option) => option.id);
      const { isCorrect, marksAwarded } = gradeAnswer(
        { marks: question.marks, negativeMarks: question.negativeMarks, correctOptionIds },
        selectedOptionIds,
      );
      gradedAnswers.push({ marksAwarded });
      if (answer) {
        await tx.answer.update({ where: { id: answer.id }, data: { isCorrect, marksAwarded } });
      }
    }

    const scoredQuestions = hasCodeQuestions ? questions.filter((question) => question.type !== 'code') : questions;
    const summary = computeResult(gradedAnswers, scoredQuestions, exam.passCriteriaPercent);
    await tx.result.create({
      data: {
        attemptId: attempt.id,
        score: summary.score,
        maxScore: summary.maxScore,
        percentage: summary.percentage,
        passFail: hasCodeQuestions ? null : summary.passFail,
      },
    });

    const finalStatus = hasCodeQuestions ? 'pending_manual_grade' : status;
    const finalized = await tx.attempt.update({ where: { id: attempt.id }, data: { status: finalStatus, submittedAt: new Date() } });
    await tx.auditLog.create({
      data: {
        organizationId: exam.organizationId,
        actorUserId: null,
        action: 'attempt.settled',
        entityType: 'attempt',
        entityId: finalized.id,
        metadataJson: JSON.stringify({ status, score: summary.score, maxScore: summary.maxScore, percentage: summary.percentage, passFail: summary.passFail }),
      },
    });
    void this.broadcaster
      .emitAttemptStatus(attempt.examId, {
        attemptId: finalized.id,
        candidateId: attempt.candidateId,
        status: finalized.status,
      })
      .catch((error) => this.logger.error('Failed to broadcast attempt status', error as Error));
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
  }
```

- [ ] **Step 5: Implement `finalizeManualGrade()`**

Add a new public method to the same class, directly after `finalize()`:

```ts
  async finalizeManualGrade(tx: Prisma.TransactionClient, exam: SettlementExam, attempt: Attempt): Promise<Attempt> {
    if (attempt.status !== 'pending_manual_grade') {
      throw new BadRequestException(`Cannot finalize grading — attempt status is "${attempt.status}"`);
    }

    const questionIds: string[] = JSON.parse(attempt.questionOrderJson);
    const questions = await tx.question.findMany({ where: { id: { in: questionIds } } });
    const answers = await tx.answer.findMany({ where: { attemptId: attempt.id } });
    const answersByQuestionId = new Map(answers.map((answer) => [answer.questionId, answer]));

    const codeQuestions = questions.filter((question) => question.type === 'code');
    const ungraded = codeQuestions.filter((question) => {
      const answer = answersByQuestionId.get(question.id);
      return !answer || answer.marksAwarded === null;
    });
    if (ungraded.length > 0) {
      throw new BadRequestException(`${ungraded.length} code question(s) still need grading before this attempt can be finalized`);
    }

    const gradedAnswers = questions.map((question) => ({ marksAwarded: answersByQuestionId.get(question.id)?.marksAwarded ?? 0 }));
    const summary = computeResult(gradedAnswers, questions, exam.passCriteriaPercent);

    await tx.result.update({
      where: { attemptId: attempt.id },
      data: { score: summary.score, maxScore: summary.maxScore, percentage: summary.percentage, passFail: summary.passFail },
    });

    const finalized = await tx.attempt.update({ where: { id: attempt.id }, data: { status: 'submitted' } });
    await tx.auditLog.create({
      data: {
        organizationId: exam.organizationId,
        actorUserId: null,
        action: 'attempt.manually_graded',
        entityType: 'attempt',
        entityId: finalized.id,
        metadataJson: JSON.stringify({ score: summary.score, maxScore: summary.maxScore, percentage: summary.percentage, passFail: summary.passFail }),
      },
    });
    void this.broadcaster
      .emitAttemptStatus(attempt.examId, { attemptId: finalized.id, candidateId: attempt.candidateId, status: finalized.status })
      .catch((error) => this.logger.error('Failed to broadcast attempt status', error as Error));
    return finalized;
  }
```

Add the missing import at the top of the file:

```ts
import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd apps/exam-runtime && npx jest grading/attempt-settlement.service.spec.ts`
Expected: all tests pass, including the 4 new ones.

- [ ] **Step 7: Run the full grading suite**

Run: `cd apps/exam-runtime && npx jest grading/`
Expected: all suites pass (`grading.spec.ts` untouched/still passing — `gradeAnswer`/`computeResult` were not modified).

- [ ] **Step 8: Commit**

```bash
git add apps/exam-runtime/src/grading/attempt-settlement.service.ts apps/exam-runtime/src/grading/attempt-settlement.service.spec.ts
git commit -m "feat: pending-manual-grade settlement branch and finalizeManualGrade"
```

---

### Task 5: Grading + finalize HTTP surface

**Files:**
- Modify: `apps/exam-runtime/src/internal/internal.controller.ts`
- Create: `apps/exam-runtime/src/internal/dto/grade-code-answer.dto.ts`
- Test: `apps/exam-runtime/src/internal/internal.controller.spec.ts`
- Modify: `apps/api/src/exam-runtime-client/exam-runtime-internal.client.ts`
- Test: `apps/api/src/exam-runtime-client/exam-runtime-internal.client.spec.ts`
- Modify: `apps/api/src/attempts-admin/attempts-admin.controller.ts`
- Modify: `apps/api/src/attempts-admin/attempts-admin.service.ts`
- Create: `apps/api/src/attempts-admin/dto/grade-code-answer.dto.ts`
- Test: `apps/api/test/exam-code-grading.e2e-spec.ts`

**Interfaces:**
- Consumes: `AttemptSettlementService.finalizeManualGrade` from Task 4.
- Produces: `POST /attempts/:id/answers/:questionId/grade` (recruiter, `exam:manage`) and `POST /attempts/:id/finalize-manual-grade` (recruiter, `exam:manage`) and `GET /exams/:id/pending-grading` (recruiter, `exam:manage`) on `apps/api` — Task 9 (recruiter grading screen) consumes these three endpoints directly by path.

- [ ] **Step 1: Create the internal DTO**

Create `apps/exam-runtime/src/internal/dto/grade-code-answer.dto.ts`:

```ts
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class GradeCodeAnswerDto {
  @IsInt()
  @Min(0)
  marksAwarded!: number;

  @IsOptional()
  @IsString()
  feedback?: string;
}
```

- [ ] **Step 2: Write the failing internal-controller tests**

Add to `apps/exam-runtime/src/internal/internal.controller.spec.ts` (read the file first to match its existing mock-setup for `tenantPrisma`/`attemptSettlement` before inserting):

```ts
  it('grades a code answer and caps marksAwarded at the question marks', async () => {
    // Arrange: tx.answer.findFirst resolves an Answer row for a 'code' question with marks: 10.
    // Act: await controller.gradeCodeAnswer('attempt-1', 'question-1', { marksAwarded: 8, feedback: 'Good approach' });
    // Assert: tx.answer.update called with { marksAwarded: 8, gradingFeedback: 'Good approach' }.
  });

  it('rejects grading a code answer with marksAwarded exceeding the question marks', async () => {
    // Arrange: same question fixture, marks: 10.
    // Act/Assert: await expect(controller.gradeCodeAnswer('attempt-1', 'question-1', { marksAwarded: 15 })).rejects.toThrow(BadRequestException);
  });

  it('finalizes manual grading via AttemptSettlementService.finalizeManualGrade', async () => {
    // Arrange: tx.attempt.findUnique resolves an attempt with status 'pending_manual_grade' and its exam.
    // Act: await controller.finalizeManualGrade('attempt-1');
    // Assert: attemptSettlement.finalizeManualGrade was called with (tx, exam, attempt); the returned { status } matches.
  });
```

(Match this file's exact mocking convention for `tenantPrisma.forTenant`, `Prisma.TransactionClient`, and constructing the `InternalController` test instance — mirror the existing `forceSubmit`/`reanalyze` test blocks already in this file.)

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd apps/exam-runtime && npx jest internal/internal.controller.spec.ts`
Expected: FAIL — `gradeCodeAnswer`/`finalizeManualGrade` don't exist on `InternalController` yet.

- [ ] **Step 4: Add the two new internal routes**

In `apps/exam-runtime/src/internal/internal.controller.ts`, add the import:

```ts
import { GradeCodeAnswerDto } from './dto/grade-code-answer.dto';
```

Add two new methods, directly after `forceSubmit`:

```ts
  @Post('attempts/:id/answers/:questionId/grade')
  async gradeCodeAnswer(@Param('id') id: string, @Param('questionId') questionId: string, @Body() dto: GradeCodeAnswerDto) {
    return this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, async (tx) => {
      const answer = await tx.answer.findFirst({ where: { attemptId: id, questionId }, include: { question: true } });
      if (!answer) {
        throw new NotFoundException(`No answer found for attempt ${id}, question ${questionId}`);
      }
      if (answer.question.type !== 'code') {
        throw new BadRequestException(`Question ${questionId} is not a code question`);
      }
      if (dto.marksAwarded > answer.question.marks) {
        throw new BadRequestException(`marksAwarded (${dto.marksAwarded}) cannot exceed the question's marks (${answer.question.marks})`);
      }
      const updated = await tx.answer.update({
        where: { id: answer.id },
        data: { marksAwarded: dto.marksAwarded, gradingFeedback: dto.feedback ?? null },
      });
      return { questionId, marksAwarded: updated.marksAwarded, gradingFeedback: updated.gradingFeedback };
    });
  }

  @Post('attempts/:id/finalize-manual-grade')
  async finalizeManualGrade(@Param('id') id: string) {
    const finalized = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, async (tx) => {
      const attempt = await tx.attempt.findUnique({ where: { id }, include: { invitation: { include: { exam: true } } } });
      if (!attempt) {
        throw new NotFoundException(`Attempt ${id} not found`);
      }
      return this.attemptSettlement.finalizeManualGrade(tx, attempt.invitation.exam, attempt);
    });
    return { status: finalized.status };
  }
```

Add `BadRequestException` to the existing `@nestjs/common` import line at the top of the file (it currently imports `BadRequestException` already for `forceSubmit` — confirm and reuse, no duplicate import).

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd apps/exam-runtime && npx jest internal/internal.controller.spec.ts`
Expected: all tests pass, including the 3 new ones.

- [ ] **Step 6: Add the two client methods**

In `apps/api/src/exam-runtime-client/exam-runtime-internal.client.ts`, add two new interfaces after `ForceSubmitResult`:

```ts
interface GradeCodeAnswerPayload {
  marksAwarded: number;
  feedback?: string;
}

interface GradeCodeAnswerResult {
  questionId: string;
  marksAwarded: number;
  gradingFeedback: string | null;
}

interface FinalizeManualGradeResult {
  status: string;
}
```

Add two new methods, directly after `forceSubmit`:

```ts
  async gradeCodeAnswer(attemptId: string, questionId: string, payload: GradeCodeAnswerPayload): Promise<GradeCodeAnswerResult> {
    const response = await this.fetchWithTimeout(`${this.baseUrl()}/api/v1/internal/attempts/${attemptId}/answers/${questionId}/grade`, {
      method: 'POST',
      headers: { ...this.headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    await this.throwIfNotOk(response);
    return response.json();
  }

  async finalizeManualGrade(attemptId: string): Promise<FinalizeManualGradeResult> {
    const response = await this.fetchWithTimeout(`${this.baseUrl()}/api/v1/internal/attempts/${attemptId}/finalize-manual-grade`, {
      method: 'POST',
      headers: this.headers(),
    });
    await this.throwIfNotOk(response);
    return response.json();
  }
```

- [ ] **Step 7: Write the failing client tests**

Add to `apps/api/src/exam-runtime-client/exam-runtime-internal.client.spec.ts` (matching its existing `fetch`-mocking convention — read it first):

```ts
  it('gradeCodeAnswer POSTs to the internal grade endpoint and returns the parsed result', async () => {
    // Mirror the existing forceSubmit test's fetch-mock setup, asserting the URL
    // `.../internal/attempts/attempt-1/answers/question-1/grade`, method POST, and
    // JSON body { marksAwarded: 8, feedback: 'Nice' }.
  });

  it('finalizeManualGrade POSTs to the internal finalize endpoint', async () => {
    // Mirror the existing forceSubmit test's fetch-mock setup, asserting the URL
    // `.../internal/attempts/attempt-1/finalize-manual-grade`, method POST.
  });
```

- [ ] **Step 8: Run the client tests to verify they pass**

Run: `cd apps/api && npx jest exam-runtime-client/exam-runtime-internal.client.spec.ts`
Expected: all tests pass.

- [ ] **Step 9: Create the apps/api DTO**

Create `apps/api/src/attempts-admin/dto/grade-code-answer.dto.ts`:

```ts
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class GradeCodeAnswerDto {
  @IsInt()
  @Min(0)
  marksAwarded!: number;

  @IsOptional()
  @IsString()
  feedback?: string;
}
```

- [ ] **Step 10: Add the three new attempts-admin/exams endpoints**

In `apps/api/src/attempts-admin/attempts-admin.controller.ts`, add the import and two new endpoints directly after `forceSubmit`:

```ts
import { GradeCodeAnswerDto } from './dto/grade-code-answer.dto';
```

```ts
  @Post(':id/answers/:questionId/grade')
  @RequirePermissions('exam:manage')
  gradeCodeAnswer(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Param('questionId') questionId: string,
    @Body() dto: GradeCodeAnswerDto,
  ) {
    return this.attemptsAdminService.gradeCodeAnswer(tenant, id, questionId, userId, dto.marksAwarded, dto.feedback);
  }

  @Post(':id/finalize-manual-grade')
  @RequirePermissions('exam:manage')
  finalizeManualGrade(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Param('id') id: string) {
    return this.attemptsAdminService.finalizeManualGrade(tenant, id, userId);
  }
```

In `apps/api/src/attempts-admin/attempts-admin.service.ts`, add two new methods directly after `forceSubmit`:

```ts
  async gradeCodeAnswer(
    context: TenantContext,
    attemptId: string,
    questionId: string,
    actorUserId: string,
    marksAwarded: number,
    feedback?: string,
  ): Promise<{ questionId: string; marksAwarded: number; gradingFeedback: string | null }> {
    await this.requireOwnedAttempt(context, attemptId);

    const result = await this.examRuntime.gradeCodeAnswer(attemptId, questionId, { marksAwarded, feedback });

    await this.audit.record(context, {
      actorUserId,
      action: 'attempt.answer_graded',
      entityType: 'attempt',
      entityId: attemptId,
      metadata: { questionId, marksAwarded },
    });

    return result;
  }

  async finalizeManualGrade(context: TenantContext, attemptId: string, actorUserId: string): Promise<{ status: string }> {
    await this.requireOwnedAttempt(context, attemptId);

    const result = await this.examRuntime.finalizeManualGrade(attemptId);

    await this.audit.record(context, {
      actorUserId,
      action: 'attempt.manually_graded',
      entityType: 'attempt',
      entityId: attemptId,
    });

    return result;
  }
```

- [ ] **Step 11: Add the pending-grading queue endpoint**

Find `apps/api/src/exams/exams.controller.ts` and its `getResults` method (the existing `GET /exams/:id/results` route). Add a new endpoint directly after it:

```ts
  @Get(':id/pending-grading')
  @RequirePermissions('exam:manage')
  getPendingGrading(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.examsService.getPendingGrading(tenant, id);
  }
```

Find `apps/api/src/exams/exams.service.ts` and add a new method (place it near the existing `getResults` method, reusing whatever `tenantPrisma`/query conventions that method already uses):

```ts
  async getPendingGrading(context: TenantContext, examId: string): Promise<PendingGradingRow[]> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const exam = await tx.exam.findFirst({ where: { id: examId, organizationId: context.organizationId as string } });
      if (!exam) {
        throw new NotFoundException(`Exam ${examId} not found`);
      }

      const attempts = await tx.attempt.findMany({
        where: { examId, status: 'pending_manual_grade' },
        include: { invitation: { include: { candidate: true } }, answers: { include: { question: true } } },
      });

      return attempts.map((attempt) => ({
        attemptId: attempt.id,
        candidateId: attempt.invitation.candidateId,
        candidateName: attempt.invitation.candidate.name,
        codeQuestions: attempt.answers
          .filter((answer) => answer.question.type === 'code')
          .map((answer) => ({
            questionId: answer.questionId,
            questionText: answer.question.text,
            starterCode: answer.question.starterCode,
            codeLanguage: answer.question.codeLanguage,
            answerText: answer.answerText,
            marks: answer.question.marks,
            marksAwarded: answer.marksAwarded,
            gradingFeedback: answer.gradingFeedback,
          })),
      }));
    });
  }
```

Add the `PendingGradingRow` interface near the top of `exams.service.ts`, alongside any existing exported row interfaces (e.g. `ExamResultRow`, if present in this file — otherwise near the top of the file):

```ts
export interface PendingGradingCodeQuestion {
  questionId: string;
  questionText: string;
  starterCode: string | null;
  codeLanguage: string | null;
  answerText: string | null;
  marks: number;
  marksAwarded: number | null;
  gradingFeedback: string | null;
}

export interface PendingGradingRow {
  attemptId: string;
  candidateId: string;
  candidateName: string;
  codeQuestions: PendingGradingCodeQuestion[];
}
```

- [ ] **Step 12: Write the e2e test**

Create `apps/api/test/exam-code-grading.e2e-spec.ts`, following the exact `bootAdminApp`/`bootRuntimeApp` dual-app setup pattern already used in `apps/api/test/live-monitoring.e2e-spec.ts` (recruiter creates a `code` question, an exam, invites a candidate; candidate redeems and submits `POST /attempt/start` then `POST /attempt/answer` with `answerText` then `POST /attempt/submit`; recruiter then calls `GET /exams/:id/pending-grading` and asserts the attempt appears with the submitted code; recruiter calls `POST /attempts/:id/answers/:questionId/grade`; recruiter calls `POST /attempts/:id/finalize-manual-grade` and asserts `{ status: 'submitted' }`; a final `GET /exams/:id/results` call confirms the attempt's `passFail` is no longer `null`).

- [ ] **Step 13: Run the e2e test**

Run: `cd apps/api && npx jest --config ./test/jest-e2e.json --runInBand exam-code-grading.e2e-spec.ts`
Expected: passes.

- [ ] **Step 14: Commit**

```bash
git add apps/exam-runtime/src/internal apps/api/src/exam-runtime-client apps/api/src/attempts-admin apps/api/src/exams/exams.controller.ts apps/api/src/exams/exams.service.ts apps/api/test/exam-code-grading.e2e-spec.ts
git commit -m "feat: manual code-grading HTTP surface (grade, finalize, pending-grading queue)"
```

---

### Task 6: AI-assisted code review

**Files:**
- Create: `apps/exam-runtime/src/code-review/claude-code-review.client.ts`
- Create: `apps/exam-runtime/src/code-review/code-review.service.ts`
- Create: `apps/exam-runtime/src/code-review/code-review.module.ts`
- Test: `apps/exam-runtime/src/code-review/claude-code-review.client.spec.ts`
- Test: `apps/exam-runtime/src/code-review/code-review.service.spec.ts`
- Modify: `apps/exam-runtime/src/internal/internal.controller.ts`
- Modify: `apps/exam-runtime/src/internal/internal.module.ts`
- Modify: `apps/api/src/exam-runtime-client/exam-runtime-internal.client.ts`
- Modify: `apps/api/src/attempts-admin/attempts-admin.controller.ts`
- Modify: `apps/api/src/attempts-admin/attempts-admin.service.ts`

**Interfaces:**
- Consumes: `CodeAnswerReview` model from Task 1.
- Produces: `GET /attempts/:id/answers/:questionId/code-review` and `POST /attempts/:id/answers/:questionId/code-review/regenerate` (recruiter, `exam:manage`) — Task 9 consumes both directly.

- [ ] **Step 1: Write the failing Claude client test**

Create `apps/exam-runtime/src/code-review/claude-code-review.client.spec.ts`:

```ts
import { ClaudeCodeReviewClient } from './claude-code-review.client';

const createMock = jest.fn();
jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({ messages: { create: createMock } }));
});

describe('ClaudeCodeReviewClient', () => {
  afterEach(() => jest.clearAllMocks());

  it('returns the suggested marks and summary from a valid tool_use response', async () => {
    createMock.mockResolvedValue({
      content: [{ type: 'tool_use', input: { suggestedMarks: 7, summary: 'Correct logic, minor style issues.' } }],
    });

    const client = new ClaudeCodeReviewClient();
    const result = await client.review({
      questionText: 'Write a function that reverses a string.',
      starterCode: 'function reverse(str) {}',
      codeLanguage: 'javascript',
      answerText: 'function reverse(str) { return str.split("").reverse().join(""); }',
      marks: 10,
    });

    expect(result).toEqual({ suggestedMarks: 7, summary: 'Correct logic, minor style issues.' });
  });

  it('throws when Claude does not return a tool_use block', async () => {
    createMock.mockResolvedValue({ content: [{ type: 'text', text: 'no tool call' }] });

    const client = new ClaudeCodeReviewClient();
    await expect(
      client.review({ questionText: 'x', starterCode: null, codeLanguage: 'python', answerText: 'y', marks: 5 }),
    ).rejects.toThrow('Claude did not return a valid report_code_review tool call');
  });

  it('throws when the returned suggestedMarks is not a number', async () => {
    createMock.mockResolvedValue({ content: [{ type: 'tool_use', input: { suggestedMarks: 'seven', summary: 'ok' } }] });

    const client = new ClaudeCodeReviewClient();
    await expect(
      client.review({ questionText: 'x', starterCode: null, codeLanguage: 'python', answerText: 'y', marks: 5 }),
    ).rejects.toThrow('Claude returned a malformed code review');
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/exam-runtime && npx jest code-review/claude-code-review.client.spec.ts`
Expected: FAIL — `Cannot find module './claude-code-review.client'`.

- [ ] **Step 3: Implement `ClaudeCodeReviewClient`**

Create `apps/exam-runtime/src/code-review/claude-code-review.client.ts`:

```ts
import { Injectable } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';

export interface CodeReviewInput {
  questionText: string;
  starterCode: string | null;
  codeLanguage: string;
  answerText: string;
  marks: number;
}

export interface CodeReviewResult {
  suggestedMarks: number;
  summary: string;
}

const REPORT_CODE_REVIEW_TOOL = {
  name: 'report_code_review',
  description: 'Report a suggested score and written critique for a candidate code submission.',
  input_schema: {
    type: 'object' as const,
    properties: {
      suggestedMarks: {
        type: 'integer',
        description: 'A suggested marks value between 0 and the question\'s total marks, based on correctness and quality.',
      },
      summary: {
        type: 'string',
        description: 'A short (2-4 sentence) critique for a recruiter, covering correctness, style, and any issues found.',
      },
    },
    required: ['suggestedMarks', 'summary'],
  },
};

@Injectable()
export class ClaudeCodeReviewClient {
  private readonly client: Anthropic;

  constructor() {
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  async review(input: CodeReviewInput): Promise<CodeReviewResult> {
    const response = await this.client.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 512,
      tools: [REPORT_CODE_REVIEW_TOOL],
      tool_choice: { type: 'tool', name: 'report_code_review' },
      messages: [
        {
          role: 'user',
          content:
            `Review this candidate's code submission for a coding question worth ${input.marks} marks.\n\n` +
            `Question:\n${input.questionText}\n\n` +
            (input.starterCode ? `Starter code:\n${input.starterCode}\n\n` : '') +
            `Candidate's submission (${input.codeLanguage}):\n${input.answerText}`,
        },
      ],
    });

    const toolUse = response.content.find(
      (block: { type: string }) => block.type === 'tool_use',
    ) as { type: 'tool_use'; input: unknown } | undefined;

    if (!toolUse || typeof toolUse.input !== 'object' || toolUse.input === null) {
      throw new Error('Claude did not return a valid report_code_review tool call');
    }

    const parsed = toolUse.input as { suggestedMarks?: unknown; summary?: unknown };
    if (typeof parsed.suggestedMarks !== 'number' || typeof parsed.summary !== 'string' || parsed.summary.trim() === '') {
      throw new Error('Claude returned a malformed code review');
    }

    return { suggestedMarks: parsed.suggestedMarks, summary: parsed.summary };
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/exam-runtime && npx jest code-review/claude-code-review.client.spec.ts`
Expected: `Tests: 3 passed, 3 total`.

- [ ] **Step 5: Write the failing `CodeReviewService` test**

Create `apps/exam-runtime/src/code-review/code-review.service.spec.ts`:

```ts
import { CodeReviewService } from './code-review.service';

describe('CodeReviewService', () => {
  function buildService(claudeResult: { suggestedMarks: number; summary: string } | Error) {
    const tx = {
      answer: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'answer-1',
          answerText: 'function reverse(s) { return s; }',
          question: { text: 'Reverse a string', starterCode: null, codeLanguage: 'javascript', marks: 10 },
          attempt: { invitation: { exam: { organizationId: 'org-1' } } },
        }),
      },
      codeAnswerReview: { upsert: jest.fn().mockResolvedValue({}) },
      aiCreditUsage: { create: jest.fn().mockResolvedValue({}) },
    };
    const tenantPrisma = { forTenant: jest.fn((_context, callback) => callback(tx)) };
    const claudeClient = {
      review: claudeResult instanceof Error ? jest.fn().mockRejectedValue(claudeResult) : jest.fn().mockResolvedValue(claudeResult),
    };
    return { service: new CodeReviewService(tenantPrisma as never, claudeClient as never), tx, tenantPrisma };
  }

  it('generates a review, upserts CodeAnswerReview as completed, and records AI credit usage', async () => {
    const { service, tx } = buildService({ suggestedMarks: 8, summary: 'Solid solution.' });

    await service.analyze('answer-1');

    expect(tx.codeAnswerReview.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ answerId: 'answer-1', status: 'completed', suggestedMarks: 8, summary: 'Solid solution.' }),
      }),
    );
    expect(tx.aiCreditUsage.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ source: 'code_review', sourceId: 'answer-1' }) }),
    );
  });

  it('upserts CodeAnswerReview as failed and records no credit usage when Claude throws', async () => {
    const { service, tx } = buildService(new Error('Claude unavailable'));

    await service.analyze('answer-1');

    expect(tx.codeAnswerReview.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ status: 'failed', suggestedMarks: null, summary: null }) }),
    );
    expect(tx.aiCreditUsage.create).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `cd apps/exam-runtime && npx jest code-review/code-review.service.spec.ts`
Expected: FAIL — `Cannot find module './code-review.service'`.

- [ ] **Step 7: Implement `CodeReviewService`**

Create `apps/exam-runtime/src/code-review/code-review.service.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { TenantPrismaService } from '@exam-platform/shared';
import { ClaudeCodeReviewClient } from './claude-code-review.client';

@Injectable()
export class CodeReviewService {
  private readonly logger = new Logger(CodeReviewService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly claudeCodeReviewClient: ClaudeCodeReviewClient,
  ) {}

  async analyze(answerId: string): Promise<void> {
    const answer = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) =>
      tx.answer.findUniqueOrThrow({
        where: { id: answerId },
        include: { question: true, attempt: { include: { invitation: { include: { exam: true } } } } },
      }),
    );
    const organizationId = answer.attempt.invitation.exam.organizationId;

    let result: { status: string; suggestedMarks: number | null; summary: string | null };
    try {
      const review = await this.claudeCodeReviewClient.review({
        questionText: answer.question.text,
        starterCode: answer.question.starterCode,
        codeLanguage: answer.question.codeLanguage ?? 'plaintext',
        answerText: answer.answerText ?? '',
        marks: answer.question.marks,
      });
      result = { status: 'completed', suggestedMarks: review.suggestedMarks, summary: review.summary };
    } catch (error) {
      this.logger.error(`Code review generation failed for answer ${answerId}`, error as Error);
      result = { status: 'failed', suggestedMarks: null, summary: null };
    }

    await this.tenantPrisma.forTenant({ organizationId, isSuperAdmin: false }, async (tx) => {
      await tx.codeAnswerReview.upsert({
        where: { answerId },
        create: { answerId, ...result },
        update: { ...result, generatedAt: new Date() },
      });
      if (result.status === 'completed') {
        await tx.aiCreditUsage.create({
          data: { organizationId, source: 'code_review', credits: 1, sourceId: answerId },
        });
      }
    });
  }
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `cd apps/exam-runtime && npx jest code-review/code-review.service.spec.ts`
Expected: `Tests: 2 passed, 2 total`.

- [ ] **Step 9: Create the module**

Create `apps/exam-runtime/src/code-review/code-review.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { CodeReviewService } from './code-review.service';
import { ClaudeCodeReviewClient } from './claude-code-review.client';

@Module({
  providers: [CodeReviewService, ClaudeCodeReviewClient],
  exports: [CodeReviewService],
})
export class CodeReviewModule {}
```

- [ ] **Step 10: Wire into `InternalModule` and add the internal route**

In `apps/exam-runtime/src/internal/internal.module.ts`, add the import and register it in `imports`:

```ts
import { CodeReviewModule } from '../code-review/code-review.module';
```

```ts
@Module({
  imports: [GradingModule, ProctoringAnalysisModule, AttemptInsightModule, CodeReviewModule],
  controllers: [InternalController],
})
export class InternalModule {}
```

In `apps/exam-runtime/src/internal/internal.controller.ts`, add the constructor param and import:

```ts
import { CodeReviewService } from '../code-review/code-review.service';
```

```ts
    private readonly codeReviewService: CodeReviewService,
```

(add as a new constructor parameter, directly after `attemptInsight`)

Add a new route, directly after `regenerateInsight`:

```ts
  @Post('attempts/answers/:answerId/generate-code-review')
  @HttpCode(204)
  async generateCodeReview(@Param('answerId') answerId: string): Promise<void> {
    await this.codeReviewService.analyze(answerId);
  }
```

- [ ] **Step 11: Add the client method**

In `apps/api/src/exam-runtime-client/exam-runtime-internal.client.ts`, add a new method directly after `regenerateInsight`:

```ts
  async generateCodeReview(answerId: string): Promise<void> {
    const response = await this.fetchWithTimeout(`${this.baseUrl()}/api/v1/internal/attempts/answers/${answerId}/generate-code-review`, {
      method: 'POST',
      headers: this.headers(),
    });
    await this.throwIfNotOk(response);
  }
```

- [ ] **Step 12: Add the apps/api endpoints**

In `apps/api/src/attempts-admin/attempts-admin.controller.ts`, add two new endpoints directly after `regenerateInsight`:

```ts
  @Get(':id/answers/:questionId/code-review')
  @RequirePermissions('exam:manage')
  getCodeReview(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Param('questionId') questionId: string) {
    return this.attemptsAdminService.getCodeReview(tenant, id, questionId);
  }

  @Post(':id/answers/:questionId/code-review/regenerate')
  @RequirePermissions('exam:manage')
  regenerateCodeReview(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Param('questionId') questionId: string,
  ) {
    return this.attemptsAdminService.regenerateCodeReview(tenant, userId, id, questionId);
  }
```

In `apps/api/src/attempts-admin/attempts-admin.service.ts`, add two new methods directly after `regenerateInsight`:

```ts
  async getCodeReview(context: TenantContext, attemptId: string, questionId: string): Promise<CodeAnswerReview> {
    await this.requireOwnedAttempt(context, attemptId);

    const review = await this.tenantPrisma.forTenant(context, (tx) =>
      tx.codeAnswerReview.findFirst({ where: { answer: { attemptId, questionId } } }),
    );
    if (!review) {
      throw new NotFoundException(`Code review not yet generated for attempt ${attemptId}, question ${questionId}`);
    }
    return review;
  }

  async regenerateCodeReview(context: TenantContext, actorUserId: string, attemptId: string, questionId: string): Promise<CodeAnswerReview> {
    const answer = await this.tenantPrisma.forTenant(context, (tx) =>
      tx.answer.findFirst({ where: { attemptId, questionId } }),
    );
    if (!answer) {
      throw new NotFoundException(`No answer found for attempt ${attemptId}, question ${questionId}`);
    }

    await this.examRuntime.generateCodeReview(answer.id);

    await this.audit.record(context, {
      actorUserId,
      action: 'attempt.code_review_regenerated',
      entityType: 'attempt',
      entityId: attemptId,
      metadata: { questionId },
    });

    return this.tenantPrisma.forTenant(context, (tx) => tx.codeAnswerReview.findFirstOrThrow({ where: { answerId: answer.id } }));
  }
```

Add the `CodeAnswerReview` import to the top of the file's existing `@prisma/client` import line:

```ts
import { AttemptInsight, CandidateMessage, CodeAnswerReview, ProctoringAnalysis, ProctoringEvent } from '@prisma/client';
```

- [ ] **Step 13: Run the full exam-runtime and attempts-admin suites**

Run: `cd apps/exam-runtime && npx jest code-review/ internal/`
Run: `cd apps/api && npx jest attempts-admin/ exam-runtime-client/`
Expected: all pass.

- [ ] **Step 14: Write the AI-review e2e test with a mocked Claude client**

Create `apps/api/test/ai-code-review.e2e-spec.ts`, following the exact dual-app + `overrideProvider` mocking convention already used in `apps/api/test/ai-evaluation-insight.e2e-spec.ts` (confirmed by reading that file): `bootAdminApp`/`bootRuntimeApp` from `./dual-app`, a `const fakeClaudeCodeReviewClient = { review: jest.fn() };`, and `({ app: runtimeApp } = await bootRuntimeApp((builder) => builder.overrideProvider(ClaudeCodeReviewClient).useValue(fakeClaudeCodeReviewClient)));` in `beforeAll`. The test: recruiter creates a `code` question and exam, invites a candidate, candidate submits `answerText` via `/attempt/answer` then `/attempt/submit` (landing the attempt in `pending_manual_grade`); recruiter calls `POST /attempts/:id/answers/:questionId/code-review/regenerate` with `fakeClaudeCodeReviewClient.review.mockResolvedValueOnce({ suggestedMarks: 7, summary: 'Correct logic, minor style issues.' })` set beforehand, and asserts the response body matches `{ status: 'completed', suggestedMarks: 7, summary: 'Correct logic, minor style issues.' }`; a follow-up `GET /attempts/:id/answers/:questionId/code-review` returns the same persisted row. A second test sets `fakeClaudeCodeReviewClient.review.mockRejectedValueOnce(new Error('Claude unavailable'))` and asserts the regenerate call still returns 200 with `{ status: 'failed', suggestedMarks: null, summary: null }` (matching `CodeReviewService`'s try/catch degrade-gracefully behavior from Task 6 Step 7), and that the recruiter can still call `POST /attempts/:id/answers/:questionId/grade` and finalize normally afterward.

- [ ] **Step 15: Run the e2e test**

Run: `cd apps/api && npx jest --config ./test/jest-e2e.json --runInBand ai-code-review.e2e-spec.ts`
Expected: passes.

- [ ] **Step 16: Commit**

```bash
git add apps/exam-runtime/src/code-review apps/exam-runtime/src/internal apps/api/src/exam-runtime-client apps/api/src/attempts-admin apps/api/test/ai-code-review.e2e-spec.ts
git commit -m "feat: AI-assisted code review (Claude client, service, HTTP surface, e2e)"
```

---

### Task 7: Frontend — types, `@monaco-editor/react`, `QuestionForm` code branch

**Files:**
- Modify: `apps/web/package.json`
- Modify: `apps/web/lib/types.ts`
- Modify: `apps/web/lib/hooks/useQuestions.ts`
- Modify: `apps/web/components/QuestionForm.tsx`
- Test: `apps/web/components/QuestionForm.test.tsx` (check first whether this file already exists — if so, add to it; if not, create it)

**Interfaces:**
- Consumes: nothing from earlier tasks (first frontend task).
- Produces: `Question.codeLanguage`/`Question.starterCode` on the `Question` type; `QuestionInput.codeLanguage`/`starterCode`; a reusable `CODE_LANGUAGE_OPTIONS` constant — Task 8 and Task 9 both import this same constant for consistency.

- [ ] **Step 1: Add the dependency**

In `apps/web/package.json`, add to `dependencies` (alphabetically):

```json
    "@monaco-editor/react": "^4.6.0",
```

Run: `cd apps/web && npm install`
Expected: installs cleanly.

- [ ] **Step 2: Add types**

In `apps/web/lib/types.ts`, update the `QuestionType` union:

```ts
export type QuestionType = 'single_mcq' | 'multi_mcq' | 'true_false' | 'code';
```

Add a new exported constant near the top of the file, after the type unions:

```ts
export const CODE_LANGUAGE_OPTIONS = ['javascript', 'typescript', 'python', 'java', 'csharp', 'cpp', 'go', 'ruby'] as const;
export type CodeLanguage = (typeof CODE_LANGUAGE_OPTIONS)[number];
```

Update the `Question` interface to add two fields after `aiGenerated`:

```ts
export interface Question {
  id: string;
  type: QuestionType;
  text: string;
  topic: string | null;
  category: string | null;
  difficulty: Difficulty;
  marks: number;
  negativeMarks: number;
  status: 'active' | 'archived';
  aiGenerated: boolean;
  codeLanguage: CodeLanguage | null;
  starterCode: string | null;
  createdAt: string;
  options: QuestionOption[];
  tags?: Tag[];
}
```

Update `AttemptQuestion` (used by the candidate exam page) to add the same two fields:

```ts
export interface AttemptQuestion {
  id: string;
  text: string;
  type: QuestionType;
  marks: number;
  codeLanguage: CodeLanguage | null;
  starterCode: string | null;
  options: AttemptQuestionOption[];
}
```

Update `AttemptAnswerSummary` to add `answerText`:

```ts
export interface AttemptAnswerSummary {
  questionId: string;
  selectedOptionIds: string[];
  answerText: string | null;
  isMarkedForReview: boolean;
}
```

- [ ] **Step 3: Update `useQuestions.ts`'s `QuestionInput`**

In `apps/web/lib/hooks/useQuestions.ts`, update the `QuestionInput` interface:

```ts
export interface QuestionInput {
  type: QuestionType;
  text: string;
  topic?: string;
  category?: string;
  difficulty: Difficulty;
  marks: number;
  negativeMarks?: number;
  tags?: string[];
  codeLanguage?: string;
  starterCode?: string;
  options: { text: string; isCorrect: boolean }[];
}
```

- [ ] **Step 4: Check for an existing `QuestionForm.test.tsx`**

Run: `find apps/web/components -iname "QuestionForm.test.tsx"`
If it exists, read it fully to match its existing mock/render conventions before inserting the new test below. If it doesn't exist, create it fresh with the render/import pattern shown in Step 5.

- [ ] **Step 5: Write the failing test for the code branch**

Add this test (creating the file fresh with a minimal `render(<QuestionForm tags={[]} onSubmit={onSubmit} submitLabel="Create" />)` setup if no file exists yet, matching this project's existing Jest + Testing Library convention):

```tsx
  it('submits a code question with codeLanguage, starterCode, and zero options when type is code', async () => {
    const onSubmit = jest.fn();
    render(<QuestionForm tags={[]} onSubmit={onSubmit} submitLabel="Create" />);

    await userEvent.selectOptions(screen.getByLabelText('Question type'), 'code');
    await userEvent.type(screen.getByLabelText('Question text'), 'Reverse a string');
    await userEvent.selectOptions(screen.getByLabelText('Language'), 'python');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'code', codeLanguage: 'python', options: [] }),
    );
  });

  it('does not show the options editor when type is code', async () => {
    render(<QuestionForm tags={[]} onSubmit={jest.fn()} submitLabel="Create" />);

    await userEvent.selectOptions(screen.getByLabelText('Question type'), 'code');

    expect(screen.queryByText('Options')).not.toBeInTheDocument();
  });
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `cd apps/web && npx jest components/QuestionForm.test.tsx`
Expected: FAIL — `'code'` is not a valid `<option>` value in the current `TYPE_OPTIONS`, and there's no "Language" field.

- [ ] **Step 7: Implement the `'code'` branch in `QuestionForm`**

Replace the full contents of `apps/web/components/QuestionForm.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { Button, Input, Select, Checkbox, RadioGroup, RadioGroupItem } from '../components/ui';
import { Question, QuestionType, Difficulty, Tag, CodeLanguage, CODE_LANGUAGE_OPTIONS } from '../lib/types';
import { QuestionInput } from '../lib/hooks/useQuestions';

const TYPE_OPTIONS = [
  { value: 'single_mcq', label: 'Single-correct MCQ' },
  { value: 'multi_mcq', label: 'Multiple-correct MCQ' },
  { value: 'true_false', label: 'True / False' },
  { value: 'code', label: 'Code' },
];

const DIFFICULTY_OPTIONS = [
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
];

const LANGUAGE_OPTIONS = CODE_LANGUAGE_OPTIONS.map((value) => ({ value, label: value }));

interface OptionDraft {
  text: string;
  isCorrect: boolean;
}

interface QuestionFormProps {
  initialQuestion?: Question;
  tags: Tag[];
  onSubmit: (input: QuestionInput) => void;
  submitLabel: string;
}

function defaultOptionsFor(type: QuestionType): OptionDraft[] {
  if (type === 'code') {
    return [];
  }
  if (type === 'true_false') {
    return [
      { text: 'True', isCorrect: true },
      { text: 'False', isCorrect: false },
    ];
  }
  return [
    { text: '', isCorrect: false },
    { text: '', isCorrect: false },
  ];
}

export function QuestionForm({ initialQuestion, tags, onSubmit, submitLabel }: QuestionFormProps) {
  const [type, setType] = useState<QuestionType>(initialQuestion?.type ?? 'single_mcq');
  const [text, setText] = useState(initialQuestion?.text ?? '');
  const [difficulty, setDifficulty] = useState<Difficulty>(initialQuestion?.difficulty ?? 'easy');
  const [marks, setMarks] = useState(String(initialQuestion?.marks ?? 1));
  const [negativeMarks, setNegativeMarks] = useState(String(initialQuestion?.negativeMarks ?? 0));
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>(initialQuestion?.tags?.map((tag) => tag.id) ?? []);
  const [codeLanguage, setCodeLanguage] = useState<CodeLanguage>(initialQuestion?.codeLanguage ?? 'javascript');
  const [starterCode, setStarterCode] = useState(initialQuestion?.starterCode ?? '');
  const [options, setOptions] = useState<OptionDraft[]>(
    initialQuestion ? initialQuestion.options.map((option) => ({ text: option.text, isCorrect: option.isCorrect })) : defaultOptionsFor(type),
  );

  function handleTypeChange(nextType: string) {
    const typed = nextType as QuestionType;
    setType(typed);
    setOptions(defaultOptionsFor(typed));
  }

  function updateOptionText(index: number, value: string) {
    setOptions((current) => current.map((option, i) => (i === index ? { ...option, text: value } : option)));
  }

  function setSingleCorrect(index: number) {
    setOptions((current) => current.map((option, i) => ({ ...option, isCorrect: i === index })));
  }

  function toggleMultiCorrect(index: number, checked: boolean) {
    setOptions((current) => current.map((option, i) => (i === index ? { ...option, isCorrect: checked } : option)));
  }

  function addOption() {
    setOptions((current) => [...current, { text: '', isCorrect: false }]);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({
      type,
      text,
      difficulty,
      marks: Number(marks),
      negativeMarks: Number(negativeMarks),
      tags: selectedTagIds,
      codeLanguage: type === 'code' ? codeLanguage : undefined,
      starterCode: type === 'code' ? starterCode : undefined,
      options,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-w-xl flex-col gap-4">
      <Select label="Question type" value={type} onChange={handleTypeChange} options={TYPE_OPTIONS} />
      <div className="flex flex-col gap-1">
        <label htmlFor="question-text" className="text-sm font-medium text-gray-700">
          Question text
        </label>
        <textarea
          id="question-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="rounded border border-gray-300 px-3 py-2 text-sm"
          rows={3}
          required
        />
      </div>
      <Select label="Difficulty" value={difficulty} onChange={(value) => setDifficulty(value as Difficulty)} options={DIFFICULTY_OPTIONS} />
      <div className="flex gap-4">
        <Input label="Marks" type="number" min={1} value={marks} onChange={setMarks} />
        <Input label="Negative marks" type="number" min={0} value={negativeMarks} onChange={setNegativeMarks} />
      </div>

      {type === 'code' ? (
        <div className="flex flex-col gap-2">
          <Select label="Language" value={codeLanguage} onChange={(value) => setCodeLanguage(value as CodeLanguage)} options={LANGUAGE_OPTIONS} />
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-gray-700">Starter code</span>
            <textarea
              aria-label="Starter code"
              value={starterCode}
              onChange={(e) => setStarterCode(e.target.value)}
              className="rounded border border-gray-300 px-3 py-2 font-mono text-sm"
              rows={6}
            />
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-gray-700">Options</span>
          {type === 'single_mcq' || type === 'true_false' ? (
            <RadioGroup
              value={String(options.findIndex((option) => option.isCorrect))}
              onChange={(value) => setSingleCorrect(Number(value))}
            >
              {options.map((option, index) => (
                <div key={index} className="flex items-center gap-2">
                  <RadioGroupItem value={String(index)} label={`Option ${index + 1} correct`} />
                  <input
                    aria-label={`Option ${index + 1} text`}
                    value={option.text}
                    onChange={(e) => updateOptionText(index, e.target.value)}
                    className="rounded border border-gray-300 px-2 py-1 text-sm"
                    readOnly={type === 'true_false'}
                  />
                </div>
              ))}
            </RadioGroup>
          ) : (
            options.map((option, index) => (
              <div key={index} className="flex items-center gap-2">
                <Checkbox label={`Option ${index + 1} correct`} checked={option.isCorrect} onChange={(checked) => toggleMultiCorrect(index, checked)} />
                <input
                  aria-label={`Option ${index + 1} text`}
                  value={option.text}
                  onChange={(e) => updateOptionText(index, e.target.value)}
                  className="rounded border border-gray-300 px-2 py-1 text-sm"
                />
              </div>
            ))
          )}
          {type !== 'true_false' && (
            <Button type="button" variant="secondary" onClick={addOption}>
              Add option
            </Button>
          )}
        </div>
      )}

      {tags.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-gray-700">Tags</span>
          {tags.map((tag) => (
            <Checkbox
              key={tag.id}
              label={tag.name}
              checked={selectedTagIds.includes(tag.id)}
              onChange={(checked) =>
                setSelectedTagIds((current) => (checked ? [...current, tag.id] : current.filter((id) => id !== tag.id)))
              }
            />
          ))}
        </div>
      )}

      <Button type="submit">{submitLabel}</Button>
    </form>
  );
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `cd apps/web && npx jest components/QuestionForm.test.tsx`
Expected: all tests pass, including the 2 new ones and every pre-existing test in this file (unaffected — the MCQ/true_false branches are untouched, just moved under an `else` of the new `type === 'code'` check).

- [ ] **Step 9: Commit**

```bash
git add apps/web/package.json apps/web/lib/types.ts apps/web/lib/hooks/useQuestions.ts apps/web/components/QuestionForm.tsx apps/web/components/QuestionForm.test.tsx
git commit -m "feat: code question authoring — types, dependency, QuestionForm code branch"
```

---

### Task 8: Frontend — candidate exam page code-question renderer

**Files:**
- Modify: `apps/web/lib/hooks/useAttempt.ts`
- Modify: `apps/web/app/(candidate)/exam/page.tsx`
- Test: `apps/web/app/(candidate)/exam/page.test.tsx` (check first whether this file already exists — if so, add to it; if not, create it minimally, matching this project's other candidate-page test conventions)

**Interfaces:**
- Consumes: `AttemptQuestion.codeLanguage`/`starterCode`, `AttemptAnswerSummary.answerText` from Task 7; `AttemptService.answer()`'s `answerText` support from Task 3.
- Produces: nothing consumed by later tasks — this is the last piece of the candidate-facing path.

- [ ] **Step 1: Extend `useAnswerMutation`'s `saveAnswer` to accept `answerText`**

In `apps/web/lib/hooks/useAttempt.ts`, update the `PendingAnswer` interface:

```ts
interface PendingAnswer {
  selectedOptionIds: string[];
  answerText?: string;
  markedForReview?: boolean;
}
```

Update `saveAnswer`'s signature:

```ts
  function saveAnswer(questionId: string, selectedOptionIds: string[], markedForReview?: boolean, answerText?: string) {
    pending.current[questionId] = { selectedOptionIds, markedForReview, answerText };
    if (timers.current[questionId]) {
      clearTimeout(timers.current[questionId]);
    }
    timers.current[questionId] = setTimeout(() => fire(questionId), ANSWER_DEBOUNCE_MS);
  }
```

- [ ] **Step 2: Check for an existing `page.test.tsx`**

Run: `find "apps/web/app/(candidate)/exam" -iname "page.test.tsx"`
If it exists, read it fully to match its existing mock conventions (for `useAttemptQuery`, `useAnswerMutation`, `useCandidateAuth`, etc.) before inserting the new tests below. If it doesn't exist, this task's frontend behavior is still covered end-to-end by Task 10's Playwright spec — skip creating a new unit test file here rather than inventing test infrastructure/mocking conventions this project doesn't already establish for this specific page, and note this as a self-review deferral (Playwright is the actual coverage for this page's new branch).

- [ ] **Step 3: Implement the code-question branch**

In `apps/web/app/(candidate)/exam/page.tsx`, add the import:

```ts
import Editor from '@monaco-editor/react';
```

Update the `toggleOption` function's caller context — leave `toggleOption`/`toggleMarkForReview` as-is, and add a new function directly after `toggleMarkForReview`:

```tsx
  function handleCodeChange(value: string | undefined) {
    saveAnswer(question!.id, [], existingAnswer?.isMarkedForReview, value ?? '');
  }
```

Update `toggleMarkForReview` to pass through the current `answerText` for code questions so it isn't lost on a review-toggle-only save:

```tsx
  function toggleMarkForReview() {
    if (question!.type === 'code') {
      saveAnswer(question!.id, [], !existingAnswer?.isMarkedForReview, existingAnswer?.answerText ?? undefined);
    } else {
      saveAnswer(question!.id, selectedOptionIds, !existingAnswer?.isMarkedForReview);
    }
  }
```

Replace the question-type label line:

```tsx
            <span className="text-xs font-semibold text-gray-500">
              {question.type === 'code' ? 'CODE' : question.type === 'multi_mcq' ? 'MULTIPLE CHOICE' : 'SINGLE CHOICE'} · {question.marks} MARKS
            </span>
```

Replace the options-rendering block:

```tsx
          <p className="mb-4 text-sm text-gray-800">{question.text}</p>
          {question.type === 'code' ? (
            <Editor
              height="400px"
              language={question.codeLanguage ?? 'plaintext'}
              value={existingAnswer?.answerText ?? question.starterCode ?? ''}
              onChange={handleCodeChange}
              options={{ minimap: { enabled: false }, fontSize: 13 }}
            />
          ) : (
            <div className="flex flex-col gap-2">
              {question.options.map((option) => (
                <button key={option.id} onClick={() => toggleOption(option.id)} className={optionClasses(selectedOptionIds.includes(option.id))}>
                  {selectedOptionIds.includes(option.id) ? '◉' : '○'} {option.text}
                </button>
              ))}
            </div>
          )}
```

Update the `unansweredCount` computation to treat a code question as answered when it has non-empty `answerText` rather than a non-empty `selectedOptionIds`:

```tsx
  const unansweredCount = questions.filter((q) => {
    const a = answers.find((ans) => ans.questionId === q.id);
    if (q.type === 'code') {
      return !a || !a.answerText || a.answerText.trim() === '';
    }
    return !a || a.selectedOptionIds.length === 0;
  }).length;
```

- [ ] **Step 4: Add the dependency-free-of-charge check**

Since `@monaco-editor/react` was already added to `apps/web/package.json` in Task 7, no new dependency step is needed here — confirm it's present: `grep monaco-editor apps/web/package.json` should show the line added in Task 7.

- [ ] **Step 5: Run the full apps/web unit suite**

Run: `cd apps/web && npm test`
Expected: all suites pass — this page's other existing behavior (MCQ toggling, submit flow, countdown, proctoring) is untouched since every change here is additive (new `type === 'code'` branches) or defends the exact same MCQ path that existed before (the `unansweredCount`/`toggleMarkForReview` changes both fall through to the original logic for non-code question types).

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/hooks/useAttempt.ts "apps/web/app/(candidate)/exam/page.tsx"
git commit -m "feat: candidate code-question editor on the exam-taking page"
```

---

### Task 9: Frontend — recruiter grading queue and detail screen

**Files:**
- Create: `apps/web/lib/hooks/useCodeGrading.ts`
- Test: `apps/web/lib/hooks/useCodeGrading.test.tsx`
- Create: `apps/web/components/GradingQueuePanel.tsx`
- Test: `apps/web/components/GradingQueuePanel.test.tsx`
- Modify: `apps/web/app/(recruiter)/exams/[id]/edit/page.tsx`

**Interfaces:**
- Consumes: `GET /exams/:id/pending-grading`, `POST /attempts/:id/answers/:questionId/grade`, `POST /attempts/:id/finalize-manual-grade`, `GET /attempts/:id/answers/:questionId/code-review`, `POST /attempts/:id/answers/:questionId/code-review/regenerate` from Task 5/6; `Question`/`CodeLanguage` types from Task 7.
- Produces: a new "Grading" tab on the exam edit page — nothing consumed by later tasks (last frontend screen task).

- [ ] **Step 1: Add response types**

Append to `apps/web/lib/types.ts`:

```ts
export interface PendingGradingCodeQuestion {
  questionId: string;
  questionText: string;
  starterCode: string | null;
  codeLanguage: CodeLanguage | null;
  answerText: string | null;
  marks: number;
  marksAwarded: number | null;
  gradingFeedback: string | null;
}

export interface PendingGradingRow {
  attemptId: string;
  candidateId: string;
  candidateName: string;
  codeQuestions: PendingGradingCodeQuestion[];
}

export interface CodeAnswerReview {
  id: string;
  answerId: string;
  status: string;
  suggestedMarks: number | null;
  summary: string | null;
  generatedAt: string;
}
```

- [ ] **Step 2: Write the failing hook test**

Create `apps/web/lib/hooks/useCodeGrading.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../auth-context';
import { usePendingGrading, useGradeCodeAnswer, useFinalizeManualGrade, useCodeReview, useRegenerateCodeReview } from './useCodeGrading';

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}

describe('useCodeGrading hooks', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('usePendingGrading fetches the queue for the given exam', async () => {
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) return new Response(JSON.stringify({ message: 'none' }), { status: 401 });
      if (String(url).endsWith('/exams/exam-1/pending-grading')) {
        return new Response(
          JSON.stringify([{ attemptId: 'a1', candidateId: 'c1', candidateName: 'Alice', codeQuestions: [] }]),
          { status: 200 },
        );
      }
      throw new Error(`Unexpected fetch to ${url}`);
    }) as unknown as typeof fetch;

    function Probe() {
      const { data, isLoading } = usePendingGrading('exam-1');
      if (isLoading || !data) return <p>Loading</p>;
      return <p>rows:{data.length}</p>;
    }
    render(<Probe />, { wrapper });
    await waitFor(() => expect(screen.getByText('rows:1')).toBeInTheDocument());
  });

  it('useGradeCodeAnswer POSTs marksAwarded and feedback', async () => {
    const calls: string[] = [];
    global.fetch = jest.fn(async (url, options) => {
      if (String(url).endsWith('/auth/refresh')) return new Response(JSON.stringify({ message: 'none' }), { status: 401 });
      calls.push(`${(options as RequestInit).method} ${url}`);
      return new Response(JSON.stringify({ questionId: 'q1', marksAwarded: 8, gradingFeedback: 'Good' }), { status: 200 });
    }) as unknown as typeof fetch;

    let hook: ReturnType<typeof useGradeCodeAnswer> | undefined;
    function Probe() {
      hook = useGradeCodeAnswer('a1');
      return null;
    }
    render(<Probe />, { wrapper });
    await hook!.mutateAsync({ questionId: 'q1', marksAwarded: 8, feedback: 'Good' });
    expect(calls.some((c) => c.includes('POST') && c.includes('/attempts/a1/answers/q1/grade'))).toBe(true);
  });

  it('useFinalizeManualGrade POSTs to the finalize endpoint', async () => {
    const calls: string[] = [];
    global.fetch = jest.fn(async (url, options) => {
      if (String(url).endsWith('/auth/refresh')) return new Response(JSON.stringify({ message: 'none' }), { status: 401 });
      calls.push(`${(options as RequestInit).method} ${url}`);
      return new Response(JSON.stringify({ status: 'submitted' }), { status: 200 });
    }) as unknown as typeof fetch;

    let hook: ReturnType<typeof useFinalizeManualGrade> | undefined;
    function Probe() {
      hook = useFinalizeManualGrade();
      return null;
    }
    render(<Probe />, { wrapper });
    await hook!.mutateAsync('a1');
    expect(calls.some((c) => c.includes('POST') && c.includes('/attempts/a1/finalize-manual-grade'))).toBe(true);
  });

  it('useCodeReview returns null (not an error) when no review has been generated yet (404)', async () => {
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) return new Response(JSON.stringify({ message: 'none' }), { status: 401 });
      if (String(url).endsWith('/attempts/a1/answers/q1/code-review')) {
        return new Response(JSON.stringify({ message: 'Not found' }), { status: 404 });
      }
      throw new Error(`Unexpected fetch to ${url}`);
    }) as unknown as typeof fetch;

    function Probe() {
      const { data, isLoading } = useCodeReview('a1', 'q1');
      if (isLoading) return <p>Loading</p>;
      return <p>review:{data === null ? 'none' : 'present'}</p>;
    }
    render(<Probe />, { wrapper });
    await waitFor(() => expect(screen.getByText('review:none')).toBeInTheDocument());
  });

  it('useRegenerateCodeReview POSTs to the regenerate endpoint', async () => {
    const calls: string[] = [];
    global.fetch = jest.fn(async (url, options) => {
      if (String(url).endsWith('/auth/refresh')) return new Response(JSON.stringify({ message: 'none' }), { status: 401 });
      calls.push(`${(options as RequestInit).method} ${url}`);
      return new Response(JSON.stringify({ id: 'r1', answerId: 'answer-1', status: 'completed', suggestedMarks: 7, summary: 'ok', generatedAt: '2026-01-01' }), { status: 200 });
    }) as unknown as typeof fetch;

    let hook: ReturnType<typeof useRegenerateCodeReview> | undefined;
    function Probe() {
      hook = useRegenerateCodeReview();
      return null;
    }
    render(<Probe />, { wrapper });
    await hook!.mutateAsync({ attemptId: 'a1', questionId: 'q1' });
    expect(calls.some((c) => c.includes('POST') && c.includes('/attempts/a1/answers/q1/code-review/regenerate'))).toBe(true);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd apps/web && npx jest lib/hooks/useCodeGrading.test.tsx`
Expected: FAIL — `Cannot find module './useCodeGrading'`.

- [ ] **Step 4: Implement the hooks**

Create `apps/web/lib/hooks/useCodeGrading.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { useAuth } from '../auth-context';
import { PendingGradingRow, CodeAnswerReview } from '../types';

export function usePendingGrading(examId: string) {
  const { accessToken } = useAuth();
  return useQuery<PendingGradingRow[]>({
    queryKey: ['pending-grading', examId],
    queryFn: () => apiFetch(`/exams/${examId}/pending-grading`, {}, accessToken ?? undefined),
    enabled: Boolean(accessToken) && Boolean(examId),
  });
}

export function useGradeCodeAnswer(attemptId: string) {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ questionId, marksAwarded, feedback }: { questionId: string; marksAwarded: number; feedback?: string }) =>
      apiFetch(
        `/attempts/${attemptId}/answers/${questionId}/grade`,
        { method: 'POST', body: JSON.stringify({ marksAwarded, feedback }) },
        accessToken ?? undefined,
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pending-grading'] }),
  });
}

export function useFinalizeManualGrade() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (attemptId: string) =>
      apiFetch(`/attempts/${attemptId}/finalize-manual-grade`, { method: 'POST', body: JSON.stringify({}) }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pending-grading'] }),
  });
}

export function useCodeReview(attemptId: string, questionId: string) {
  const { accessToken } = useAuth();
  return useQuery<CodeAnswerReview | null>({
    queryKey: ['code-review', attemptId, questionId],
    queryFn: async () => {
      try {
        return await apiFetch(`/attempts/${attemptId}/answers/${questionId}/code-review`, {}, accessToken ?? undefined);
      } catch (error) {
        if (error instanceof Error && (error as Error & { status?: number }).status === 404) {
          return null;
        }
        throw error;
      }
    },
    enabled: Boolean(accessToken) && Boolean(attemptId) && Boolean(questionId),
  });
}

export function useRegenerateCodeReview() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ attemptId, questionId }: { attemptId: string; questionId: string }) =>
      apiFetch(
        `/attempts/${attemptId}/answers/${questionId}/code-review/regenerate`,
        { method: 'POST', body: JSON.stringify({}) },
        accessToken ?? undefined,
      ),
    onSuccess: (_data, { attemptId, questionId }) => queryClient.invalidateQueries({ queryKey: ['code-review', attemptId, questionId] }),
  });
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd apps/web && npx jest lib/hooks/useCodeGrading.test.tsx`
Expected: `Tests: 5 passed, 5 total`.

- [ ] **Step 6: Write the failing component test**

Create `apps/web/components/GradingQueuePanel.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from './ui';
import { usePendingGrading, useGradeCodeAnswer, useFinalizeManualGrade, useCodeReview, useRegenerateCodeReview } from '../lib/hooks/useCodeGrading';
import { GradingQueuePanel } from './GradingQueuePanel';

jest.mock('../lib/hooks/useCodeGrading', () => ({
  usePendingGrading: jest.fn(),
  useGradeCodeAnswer: jest.fn(),
  useFinalizeManualGrade: jest.fn(),
  useCodeReview: jest.fn(),
  useRegenerateCodeReview: jest.fn(),
}));

function renderPanel() {
  return render(
    <ToastProvider>
      <GradingQueuePanel examId="exam-1" />
    </ToastProvider>,
  );
}

const pendingRow = {
  attemptId: 'a1',
  candidateId: 'c1',
  candidateName: 'Alice',
  codeQuestions: [
    { questionId: 'q1', questionText: 'Reverse a string', starterCode: null, codeLanguage: 'python', answerText: 'def reverse(s): return s[::-1]', marks: 10, marksAwarded: null, gradingFeedback: null },
  ],
};

describe('GradingQueuePanel', () => {
  const gradeMutateAsync = jest.fn().mockResolvedValue({});
  const finalizeMutateAsync = jest.fn().mockResolvedValue({ status: 'submitted' });
  const regenerateMutateAsync = jest.fn().mockResolvedValue({});

  beforeEach(() => {
    gradeMutateAsync.mockClear();
    finalizeMutateAsync.mockClear();
    (usePendingGrading as jest.Mock).mockReturnValue({ data: [pendingRow], isLoading: false });
    (useGradeCodeAnswer as jest.Mock).mockReturnValue({ mutateAsync: gradeMutateAsync, isPending: false });
    (useFinalizeManualGrade as jest.Mock).mockReturnValue({ mutateAsync: finalizeMutateAsync, isPending: false });
    (useCodeReview as jest.Mock).mockReturnValue({ data: null, isLoading: false });
    (useRegenerateCodeReview as jest.Mock).mockReturnValue({ mutateAsync: regenerateMutateAsync, isPending: false });
  });

  it('shows an empty state when there is nothing pending', () => {
    (usePendingGrading as jest.Mock).mockReturnValue({ data: [], isLoading: false });
    renderPanel();
    expect(screen.getByText('No attempts pending manual grading.')).toBeInTheDocument();
  });

  it('lists the candidate and their submitted code', () => {
    renderPanel();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('def reverse(s): return s[::-1]')).toBeInTheDocument();
  });

  it('the Finalize grade button is disabled until every code question has a saved marksAwarded', () => {
    renderPanel();
    expect(screen.getByRole('button', { name: 'Finalize grade' })).toBeDisabled();
  });

  it('grading a question calls useGradeCodeAnswer with the entered marks', async () => {
    renderPanel();
    await userEvent.type(screen.getByLabelText('Marks for Reverse a string'), '8');
    await userEvent.click(screen.getByRole('button', { name: 'Save grade' }));
    expect(gradeMutateAsync).toHaveBeenCalledWith({ questionId: 'q1', marksAwarded: 8, feedback: undefined });
  });

  it('enables Finalize grade once every code question already has marksAwarded, and clicking it finalizes', async () => {
    (usePendingGrading as jest.Mock).mockReturnValue({
      data: [{ ...pendingRow, codeQuestions: [{ ...pendingRow.codeQuestions[0], marksAwarded: 8 }] }],
      isLoading: false,
    });
    renderPanel();

    const finalizeButton = screen.getByRole('button', { name: 'Finalize grade' });
    expect(finalizeButton).toBeEnabled();
    await userEvent.click(finalizeButton);
    expect(finalizeMutateAsync).toHaveBeenCalledWith('a1');
  });

  it('clicking Generate AI Review calls useRegenerateCodeReview', async () => {
    renderPanel();
    await userEvent.click(screen.getByRole('button', { name: 'Generate AI Review' }));
    expect(regenerateMutateAsync).toHaveBeenCalledWith({ attemptId: 'a1', questionId: 'q1' });
  });
});
```

- [ ] **Step 7: Run the test to verify it fails**

Run: `cd apps/web && npx jest components/GradingQueuePanel.test.tsx`
Expected: FAIL — `Cannot find module './GradingQueuePanel'`.

- [ ] **Step 8: Implement `GradingQueuePanel`**

Create `apps/web/components/GradingQueuePanel.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { Button, Card, Input, useToast } from './ui';
import { usePendingGrading, useGradeCodeAnswer, useFinalizeManualGrade, useCodeReview, useRegenerateCodeReview } from '../lib/hooks/useCodeGrading';
import { PendingGradingRow, PendingGradingCodeQuestion } from '../lib/types';

function CodeQuestionGrader({ attemptId, question }: { attemptId: string; question: PendingGradingCodeQuestion }) {
  const [marks, setMarks] = useState(question.marksAwarded !== null ? String(question.marksAwarded) : '');
  const [feedback, setFeedback] = useState(question.gradingFeedback ?? '');
  const gradeAnswer = useGradeCodeAnswer(attemptId);
  const { data: review, isLoading: reviewLoading } = useCodeReview(attemptId, question.questionId);
  const regenerateReview = useRegenerateCodeReview();
  const { toast } = useToast();

  async function handleSaveGrade() {
    const marksAwarded = Number(marks);
    if (Number.isNaN(marksAwarded) || marksAwarded < 0 || marksAwarded > question.marks) {
      toast(`Marks must be between 0 and ${question.marks}.`, 'error');
      return;
    }
    await gradeAnswer.mutateAsync({ questionId: question.questionId, marksAwarded, feedback: feedback || undefined });
    toast('Grade saved.');
  }

  return (
    <Card className="mb-3">
      <p className="mb-2 text-sm font-medium text-gray-800">{question.questionText}</p>
      <pre className="mb-3 overflow-x-auto rounded bg-gray-50 p-3 text-xs">{question.answerText ?? '(no submission)'}</pre>

      <div className="mb-3">
        {reviewLoading ? (
          <p className="text-xs text-gray-500">Loading AI review…</p>
        ) : review?.status === 'completed' ? (
          <p className="rounded border border-gray-200 p-2 text-xs text-gray-700">
            AI suggested {review.suggestedMarks} / {question.marks} — {review.summary}
          </p>
        ) : (
          <Button
            type="button"
            variant="secondary"
            disabled={regenerateReview.isPending}
            onClick={() => regenerateReview.mutateAsync({ attemptId, questionId: question.questionId })}
          >
            Generate AI Review
          </Button>
        )}
      </div>

      <div className="flex items-end gap-3">
        <Input
          label={`Marks for ${question.questionText}`}
          type="number"
          min={0}
          max={question.marks}
          value={marks}
          onChange={setMarks}
        />
        <Button type="button" disabled={gradeAnswer.isPending} onClick={handleSaveGrade}>
          Save grade
        </Button>
      </div>
      <textarea
        aria-label={`Feedback for ${question.questionText}`}
        value={feedback}
        onChange={(e) => setFeedback(e.target.value)}
        placeholder="Optional feedback"
        className="mt-2 w-full rounded border border-gray-300 px-2 py-1 text-sm"
        rows={2}
      />
    </Card>
  );
}

function AttemptGrader({ row }: { row: PendingGradingRow }) {
  const finalizeManualGrade = useFinalizeManualGrade();
  const { toast } = useToast();
  const allGraded = row.codeQuestions.every((question) => question.marksAwarded !== null);

  async function handleFinalize() {
    await finalizeManualGrade.mutateAsync(row.attemptId);
    toast('Attempt finalized.');
  }

  return (
    <div className="mb-6">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-base font-medium">{row.candidateName}</h3>
        <Button disabled={!allGraded || finalizeManualGrade.isPending} onClick={handleFinalize}>
          Finalize grade
        </Button>
      </div>
      {row.codeQuestions.map((question) => (
        <CodeQuestionGrader key={question.questionId} attemptId={row.attemptId} question={question} />
      ))}
    </div>
  );
}

export function GradingQueuePanel({ examId }: { examId: string }) {
  const { data: rows, isLoading } = usePendingGrading(examId);

  if (isLoading) {
    return <p className="text-sm text-gray-500">Loading…</p>;
  }

  if (!rows || rows.length === 0) {
    return <p className="text-sm text-gray-500">No attempts pending manual grading.</p>;
  }

  return (
    <div>
      {rows.map((row) => (
        <AttemptGrader key={row.attemptId} row={row} />
      ))}
    </div>
  );
}
```

- [ ] **Step 9: Run the test to verify it passes**

Run: `cd apps/web && npx jest components/GradingQueuePanel.test.tsx`
Expected: `Tests: 6 passed, 6 total`.

- [ ] **Step 10: Wire the "Grading" tab into the exam edit page**

In `apps/web/app/(recruiter)/exams/[id]/edit/page.tsx`, add the import:

```tsx
import { GradingQueuePanel } from '../../../../../components/GradingQueuePanel';
```

Add a fourth tab, directly after the `"live"` `TabsTrigger`/`TabsContent` pair added by the Live Exam Monitoring Dashboard plan:

```tsx
          <TabsTrigger value="grading">Grading</TabsTrigger>
```

```tsx
        <TabsContent value="grading">
          <GradingQueuePanel examId={exam.id} />
        </TabsContent>
```

- [ ] **Step 11: Run the full apps/web unit suite**

Run: `cd apps/web && npm test`
Expected: all suites pass.

- [ ] **Step 12: Commit**

```bash
git add apps/web/lib/types.ts apps/web/lib/hooks/useCodeGrading.ts apps/web/lib/hooks/useCodeGrading.test.tsx apps/web/components/GradingQueuePanel.tsx apps/web/components/GradingQueuePanel.test.tsx "apps/web/app/(recruiter)/exams/[id]/edit/page.tsx"
git commit -m "feat: recruiter code-grading queue and detail screen"
```

---

### Task 10: Playwright end-to-end scenario

**Files:**
- Create: `apps/web/e2e/code-question-golden-path.spec.ts`

**Interfaces:**
- Consumes: the full recruiter exam-creation flow (existing pattern from `apps/web/e2e/recruiter-golden-path.spec.ts`), the candidate exam-start flow (existing pattern from `apps/web/e2e/candidate-golden-path.spec.ts`), and the Grading tab from Task 9.
- Produces: end-to-end proof that a candidate can write and submit code in a real Monaco editor, and a recruiter can grade and finalize it.

- [ ] **Step 1: Write the e2e spec**

Create `apps/web/e2e/code-question-golden-path.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

const ORG_SLUG = process.env.E2E_ORG_SLUG ?? 'demo-org';
const RECRUITER_EMAIL = process.env.E2E_RECRUITER_EMAIL ?? 'recruiter@demo-org.test';
const RECRUITER_PASSWORD = process.env.E2E_RECRUITER_PASSWORD ?? 'Passw0rd!2026';

test('candidate writes and submits code, recruiter grades and finalizes the attempt', async ({ page, browser }) => {
  // Recruiter: create a code question, an exam, invite a candidate
  await page.goto('/login');
  await page.getByLabel('Organization slug').fill(ORG_SLUG);
  await page.getByLabel('Email').fill(RECRUITER_EMAIL);
  await page.getByLabel('Password').fill(RECRUITER_PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  await page.getByRole('link', { name: 'Question Bank' }).click();
  await page.getByRole('link', { name: 'New question' }).click();
  await page.getByLabel('Question type').selectOption('code');
  await page.getByLabel('Question text').fill('Write a function that reverses a string.');
  await page.getByLabel('Marks', { exact: true }).fill('10');
  await page.getByLabel('Language').selectOption('javascript');
  await page.getByLabel('Starter code').fill('function reverse(str) {\n  \n}');
  await page.getByRole('button', { name: 'Create question' }).click();
  await expect(page).toHaveURL(/\/questions$/);

  await page.getByRole('link', { name: 'Exams' }).click();
  await page.getByRole('link', { name: 'New exam' }).click();
  const examTitle = `Code Path Exam ${Date.now()}`;
  await page.getByLabel('Title').fill(examTitle);
  await page.getByRole('button', { name: 'Create exam' }).click();
  await expect(page).toHaveURL(/\/exams\/.+\/edit$/);
  const examUrl = page.url();

  await page.getByRole('tab', { name: 'Sections & Questions' }).click();
  await page.getByLabel('New section title').fill('Section One');
  await page.getByRole('button', { name: 'Add section' }).click();
  await page.getByRole('button', { name: 'Manage questions' }).click();
  await page.getByRole('checkbox', { name: /Write a function that reverses a string\./ }).first().click();
  await page.getByRole('button', { name: 'Save questions' }).click();
  await page.getByRole('button', { name: 'Publish' }).click();
  await expect(page).toHaveURL(/\/exams$/);

  await page.getByRole('link', { name: 'Candidates' }).click();
  const candidateEmail = `code-path-${Date.now()}@example.com`;
  await page.getByLabel('Name').fill('Code Path Candidate');
  await page.getByLabel('Email').fill(candidateEmail);
  await page.getByRole('button', { name: 'Add candidate' }).click();
  await expect(page.getByText(candidateEmail)).toBeVisible();

  await page.getByLabel('Exam to invite to').click();
  await page.getByRole('option', { name: examTitle, exact: true }).click();
  await page.getByRole('row', { name: candidateEmail }).getByRole('checkbox', { name: 'Code Path Candidate' }).click();
  const invitePromise = page.waitForResponse((response) => response.url().includes('/invitations') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Send invitations' }).click();
  const inviteResponse = await invitePromise;
  const inviteToken: string = (await inviteResponse.json()).created[0].token;

  // Candidate: redeem the invite in a second, independent browser context, write code, submit
  const candidateContext = await browser.newContext();
  const candidatePage = await candidateContext.newPage();
  await candidatePage.goto(`/start?token=${inviteToken}`);
  await expect(candidatePage).toHaveURL(/\/welcome/);
  await candidatePage.getByRole('button', { name: /start/i }).click();
  await expect(candidatePage).toHaveURL(/\/exam/);

  await expect(candidatePage.getByText('Write a function that reverses a string.')).toBeVisible();
  const editor = candidatePage.locator('.monaco-editor textarea').first();
  await editor.click();
  await editor.fill('function reverse(str) {\n  return str.split("").reverse().join("");\n}');
  // Wait for the debounced autosave to fire before submitting.
  await candidatePage.waitForResponse((response) => response.url().includes('/attempt/answer') && response.request().method() === 'POST');

  await candidatePage.getByRole('button', { name: 'Review & Submit' }).click();
  await candidatePage.getByRole('button', { name: 'Submit' }).click();
  await expect(candidatePage).toHaveURL(/\/submitted/);
  await candidateContext.close();

  // Recruiter: open the Grading tab, grade the submission, finalize
  await page.goto(examUrl);
  await page.getByRole('tab', { name: 'Grading' }).click();
  await expect(page.getByText('Code Path Candidate')).toBeVisible();
  await expect(page.getByText(/return str\.split/)).toBeVisible();

  await page.getByLabel(/Marks for Write a function/).fill('9');
  await page.getByRole('button', { name: 'Save grade' }).click();

  const finalizeButton = page.getByRole('button', { name: 'Finalize grade' });
  await expect(finalizeButton).toBeEnabled();
  await finalizeButton.click();
  await expect(page.getByText('No attempts pending manual grading.')).toBeVisible();
});
```

- [ ] **Step 2: Confirm dev servers and run the spec**

Ensure `apps/api`, `apps/exam-runtime`, and `apps/web` dev servers are running (see this project's documented Docker/WSL2 port-reclaim workaround if the default ports 3000-3002 are unavailable).

Run: `cd apps/web && npx playwright test e2e/code-question-golden-path.spec.ts`
Expected: `1 passed`.

- [ ] **Step 3: Run it a second time to confirm it isn't flaky**

Run: `cd apps/web && npx playwright test e2e/code-question-golden-path.spec.ts`
Expected: `1 passed`, consistent with the first run.

- [ ] **Step 4: Commit**

```bash
git add apps/web/e2e/code-question-golden-path.spec.ts
git commit -m "test: Playwright code question golden-path e2e spec"
```

---

### Task 11: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Full backend suites**

Run from repo root: `npm run test:api && npm run test:api:e2e && npm run test:exam-runtime && npm run test:shared`
Expected: all pass, including every new test from Tasks 1-6. The pre-existing `ai-question-generation.e2e-spec.ts` flake (missing `ANTHROPIC_API_KEY` in this dev environment) is documented and unrelated.

- [ ] **Step 2: Full frontend unit suite**

Run: `cd apps/web && npm test`
Expected: all suites pass, including every new test from Tasks 7-9.

- [ ] **Step 3: Full Playwright suite**

Run: `cd apps/web && npx playwright test`
Expected: every existing golden path (recruiter, org-admin, candidate, panel, live-monitoring) plus the new `code-question-golden-path.spec.ts` all pass.

- [ ] **Step 4: Manual smoke check**

With dev servers running: as recruiter, create a `code` question, build an exam with it, publish, invite a candidate. As that candidate (second browser/incognito), redeem the invite, confirm the Monaco editor loads with the starter code, write a solution, submit. Back as recruiter, open the exam's Grading tab, confirm the submission appears, click "Generate AI Review" and confirm it either shows a suggestion or a graceful failure (expected in this dev environment's placeholder `ANTHROPIC_API_KEY`), enter marks, save, and finalize — confirm the attempt disappears from the queue and the exam's results screen (panel's dashboard) now shows a real score/pass-fail for that candidate.

- [ ] **Step 5: Update the SDD progress ledger**

Append to `.superpowers/sdd/progress.md`:

```
## Code Question Type
Task 1: complete (schema — Question/Answer columns, CodeAnswerReview model)
Task 2: complete (question authoring backend — validation, DTOs, service)
Task 3: complete (candidate answer backend — AnswerDto, attempt.service.ts)
Task 4: complete (settlement backend — pending-manual-grade, finalizeManualGrade)
Task 5: complete (grading + finalize HTTP surface)
Task 6: complete (AI-assisted code review)
Task 7: complete (frontend types, dependency, QuestionForm code branch)
Task 8: complete (candidate exam page code-question renderer)
Task 9: complete (recruiter grading queue and detail screen)
Task 10: complete (Playwright code question golden-path e2e)
Task 11: complete (final verification)
```
