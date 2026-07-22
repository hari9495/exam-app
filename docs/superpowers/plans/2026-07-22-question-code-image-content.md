# Question Code Snippet & Image Content Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the three existing auto-graded question types (`single_mcq`, `multi_mcq`, `true_false`) optionally show a decorative code snippet and/or images (question-stem and per-option) in the prompt, with zero changes to grading.

**Architecture:** Four new nullable flat columns (`Question.snippetCode`, `Question.snippetLanguage`, `Question.imageUrl`, `QuestionOption.imageUrl`) pass straight through the existing create/update/read pipeline exactly like `topic`/`category` do today. A new generic `POST /questions/images` endpoint (mirroring the existing org-logo upload) lets the recruiter's authoring form get an image URL before the question itself exists. The candidate-facing exam-runtime response gets the same four fields added to its hand-built `AttemptQuestion`/`AttemptQuestionOption` shape. Frontend renders the snippet as a plain monospace block and images as `<img>` tags — no new dependency.

**Tech Stack:** NestJS/Prisma/SQL Server (apps/api), NestJS/Prisma (apps/exam-runtime), Next.js/React (apps/web). No new npm dependencies anywhere.

## Global Constraints

- No new question type. `type === 'code'` (the already-shipped Code Run Execution type — Piston sandbox, zero options, uses its own unrelated `codeLanguage`/`starterCode`/`allowStdin` columns) is excluded from all four new fields: if a `code`-type question's create/update payload includes `snippetCode`/`snippetLanguage`/`imageUrl`, they are silently not persisted (stored as `null`), not rejected with an error.
- The new column names are `snippetCode`/`snippetLanguage` (Question) — deliberately distinct from the existing `codeLanguage`/`starterCode` columns, which belong to the Code Run Execution feature and must not be touched or reused.
- Code snippet is question-stem only (not per-option), plain text, no execution, no new frontend dependency — rendered as a `<pre>` monospace block with the language shown as a small text label above it (no syntax-highlighting colors).
- Images (question-stem AND per-option) are stored as files on local disk via the exact pattern already used for org-logo upload: 2MB size cap, `image/png`/`image/jpeg`/`image/svg+xml` only, written under the existing `UPLOADS_ROOT` (already served statically at `/uploads` with security headers — no new serving wiring needed), NOT base64-in-column.
- One generic upload endpoint, `POST /questions/images` (recruiter, `question_bank:manage` permission, `MODERATE_UPLOAD_THROTTLE` tier — the same tier used by the existing org-logo and bulk-upload endpoints), decoupled from any specific question ID — it returns `{ imageUrl }` for the frontend to include in a later question create/update payload, since a question may not exist yet during authoring.
- Option `text` remains required regardless of whether an option has an image. No changes to any existing per-type option-count/correct-count validation in `question-validation.ts`.
- Removing an already-uploaded image in the authoring form just clears the URL from form state before save — no orphan-file cleanup on disk (matches the existing org-logo behavior exactly, explicitly accepted as-is, not a gap to fix here).
- Bulk question upload (CSV/XLSX via `POST /questions/bulk-upload`) is **not** extended with these fields — images can't be attached via a spreadsheet row, and keeping the two authoring paths' scope distinct avoids a half-supported bulk case.

---

### Task 1: Schema — snippet and image columns

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260722140000_question_code_snippet_image_content/migration.sql`

**Interfaces:**
- Consumes: nothing from earlier tasks (first task).
- Produces: `Question.snippetCode: String?`, `Question.snippetLanguage: String?`, `Question.imageUrl: String?`, `QuestionOption.imageUrl: String?` — every later task relies on these exact field names.

- [ ] **Step 1: Add the new columns to `Question`**

In `apps/api/prisma/schema.prisma`, find the `Question` model (currently starting at line 183) and insert three new fields directly after the existing `allowStdin` line:

```prisma
  allowStdin     Boolean               @default(false) @map("allow_stdin")
  snippetCode    String?               @map("snippet_code") @db.NVarChar(Max)
  snippetLanguage String?              @map("snippet_language")
  imageUrl       String?               @map("image_url")
  createdBy      String                @map("created_by") @db.UniqueIdentifier
```

- [ ] **Step 2: Add the new column to `QuestionOption`**

In the same file, find the `QuestionOption` model and insert one new field directly after `orderIndex`:

```prisma
model QuestionOption {
  id         String   @id @default(uuid()) @db.UniqueIdentifier
  questionId String   @map("question_id") @db.UniqueIdentifier
  text       String
  isCorrect  Boolean  @map("is_correct")
  orderIndex Int      @map("order_index")
  imageUrl   String?  @map("image_url")
  question   Question @relation(fields: [questionId], references: [id], onDelete: Cascade)

  @@index([questionId])
  @@map("question_options")
}
```

- [ ] **Step 3: Create the migration folder and SQL by hand**

Create `apps/api/prisma/migrations/20260722140000_question_code_snippet_image_content/migration.sql`:

```sql
ALTER TABLE [dbo].[questions] ADD [snippet_code] NVARCHAR(MAX), [snippet_language] NVARCHAR(1000), [image_url] NVARCHAR(1000);

ALTER TABLE [dbo].[question_options] ADD [image_url] NVARCHAR(1000);
```

- [ ] **Step 4: Apply the migration**

```bash
cd "D:\exam app\apps\api" && npx prisma migrate dev --name question_code_snippet_image_content
```

If `migrate dev` fails on the shadow-database permission (known in this environment), fall back to:

```bash
npx prisma db push
npx prisma migrate resolve --applied 20260722140000_question_code_snippet_image_content
```

...then re-apply the `audit_logs_actor_user_id_fkey` fix (a `db push` reverts it to `NO_ACTION`):

```sql
ALTER TABLE [dbo].[audit_logs] DROP CONSTRAINT [audit_logs_actor_user_id_fkey];
ALTER TABLE [dbo].[audit_logs] ADD CONSTRAINT [audit_logs_actor_user_id_fkey] FOREIGN KEY ([actor_user_id]) REFERENCES [dbo].[users]([id]) ON DELETE SET NULL ON UPDATE NO ACTION;
```

...then regenerate the client:

```bash
npx prisma generate
```

Expected either way: `npx prisma migrate status` reports "Database schema is up to date!" and `@prisma/client`'s `Question`/`QuestionOption` types now include `snippetCode`/`snippetLanguage`/`imageUrl`.

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat: schema for question code-snippet and image content"
```

---

### Task 2: Backend authoring surface — DTOs, service wiring, image upload endpoint

**Files:**
- Modify: `apps/api/src/questions/dto/create-question.dto.ts`
- Modify: `apps/api/src/questions/questions.service.ts`
- Test: `apps/api/src/questions/questions.service.spec.ts`
- Modify: `apps/api/src/questions/questions.controller.ts`

**Interfaces:**
- Consumes: `Question.snippetCode`/`snippetLanguage`/`imageUrl`, `QuestionOption.imageUrl` from Task 1.
- Produces: `CreateQuestionDto`/`UpdateQuestionDto` accept optional `snippetCode`, `snippetLanguage`, `imageUrl`; `QuestionOptionDto` accepts optional `imageUrl`; `QuestionsService.create`/`update` persist all four, excluded (stored `null`) when `type === 'code'`; new `POST /questions/images` returns `{ imageUrl: string }` — Task 4 (recruiter authoring form) calls this endpoint directly by path.

- [ ] **Step 1: Extend `CreateQuestionDto` and `QuestionOptionDto`**

In `apps/api/src/questions/dto/create-question.dto.ts`, replace the full contents:

```ts
import { IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { VALID_CODE_LANGUAGES } from '../question-validation';

export class QuestionOptionDto {
  @IsString()
  text!: string;

  @IsBoolean()
  isCorrect!: boolean;

  @IsOptional()
  @IsString()
  imageUrl?: string;
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

  @IsOptional()
  @IsBoolean()
  allowStdin?: boolean;

  @IsOptional()
  @IsString()
  snippetCode?: string;

  @IsOptional()
  @IsIn(VALID_CODE_LANGUAGES)
  snippetLanguage?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuestionOptionDto)
  options!: QuestionOptionDto[];
}
```

- [ ] **Step 2: Write the failing service tests**

Add to `apps/api/src/questions/questions.service.spec.ts` (append after the existing `'creates a code question with zero options...'` test, matching this file's exact `tenantPrisma.forTenant.mockImplementation` convention already used by the surrounding tests):

```ts
  it('persists snippetCode/snippetLanguage/imageUrl and per-option imageUrl for a single_mcq question', async () => {
    const dto = {
      type: 'single_mcq',
      text: 'What does this code print?',
      difficulty: 'easy',
      marks: 5,
      snippetCode: 'x = [1, 2, 3]\nprint(x[::-1])',
      snippetLanguage: 'python',
      imageUrl: 'question-images/stem.png',
      options: [
        { text: '[3, 2, 1]', isCorrect: true, imageUrl: 'question-images/opt-a.png' },
        { text: '[1, 2, 3]', isCorrect: false },
      ],
    };
    const questionCreate = jest.fn().mockResolvedValue({ id: 'q-1', organizationId: 'org-1', ...dto, tags: [] });
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn({ tag: { upsert: jest.fn() }, question: { create: questionCreate } }));

    await service.create(context, 'user-1', dto);

    expect(questionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          snippetCode: 'x = [1, 2, 3]\nprint(x[::-1])',
          snippetLanguage: 'python',
          imageUrl: 'question-images/stem.png',
          options: {
            create: [
              { text: '[3, 2, 1]', isCorrect: true, orderIndex: 0, imageUrl: 'question-images/opt-a.png' },
              { text: '[1, 2, 3]', isCorrect: false, orderIndex: 1, imageUrl: undefined },
            ],
          },
        }),
      }),
    );
  });

  it('does not persist snippetCode/snippetLanguage/imageUrl for a code question even if sent', async () => {
    const dto = {
      type: 'code',
      text: 'Write a function that reverses a string.',
      difficulty: 'medium',
      marks: 10,
      codeLanguage: 'javascript',
      starterCode: 'function reverse(str) {}',
      snippetCode: 'this should be ignored',
      snippetLanguage: 'python',
      imageUrl: 'question-images/should-be-ignored.png',
      options: [],
    };
    const questionCreate = jest.fn().mockResolvedValue({ id: 'q-1', organizationId: 'org-1', ...dto, tags: [] });
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn({ tag: { upsert: jest.fn() }, question: { create: questionCreate } }));

    await service.create(context, 'user-1', dto);

    expect(questionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ snippetCode: null, snippetLanguage: null, imageUrl: null }),
      }),
    );
  });
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd "D:\exam app\apps\api" && npx jest questions/questions.service.spec.ts`
Expected: FAIL — `snippetCode`/`snippetLanguage`/`imageUrl` are `undefined` in the actual create-call data (not yet wired), and per-option `imageUrl` is missing from the mapped options.

- [ ] **Step 4: Wire the fields through `QuestionsService.create` and `.update`**

In `apps/api/src/questions/questions.service.ts`, replace the `create` method's `tx.question.create` call:

```ts
      return tx.question.create({
        data: {
          organizationId: context.organizationId as string,
          type: dto.type,
          text: dto.text,
          topic: dto.topic,
          category: dto.category,
          difficulty: dto.difficulty,
          marks: dto.marks,
          negativeMarks: dto.negativeMarks ?? 0,
          codeLanguage: dto.codeLanguage,
          starterCode: dto.starterCode,
          allowStdin: dto.allowStdin ?? false,
          snippetCode: dto.type === 'code' ? null : dto.snippetCode ?? null,
          snippetLanguage: dto.type === 'code' ? null : dto.snippetLanguage ?? null,
          imageUrl: dto.type === 'code' ? null : dto.imageUrl ?? null,
          createdBy: userId,
          options: {
            create: dto.options.map((o, index) => ({ text: o.text, isCorrect: o.isCorrect, orderIndex: index, imageUrl: o.imageUrl })),
          },
          tags: {
            create: tagIds.map((tagId) => ({ tagId })),
          },
        },
        include: { options: true, tags: { include: { tag: true } } },
      });
```

Replace the `update` method's `tx.question.update` call identically (same four new lines, same `options.create` mapping):

```ts
      const updated = await tx.question.update({
        where: { id },
        data: {
          type: dto.type,
          text: dto.text,
          topic: dto.topic,
          category: dto.category,
          difficulty: dto.difficulty,
          marks: dto.marks,
          negativeMarks: dto.negativeMarks ?? 0,
          codeLanguage: dto.codeLanguage,
          starterCode: dto.starterCode,
          allowStdin: dto.allowStdin ?? false,
          snippetCode: dto.type === 'code' ? null : dto.snippetCode ?? null,
          snippetLanguage: dto.type === 'code' ? null : dto.snippetLanguage ?? null,
          imageUrl: dto.type === 'code' ? null : dto.imageUrl ?? null,
          options: {
            create: dto.options.map((o, index) => ({ text: o.text, isCorrect: o.isCorrect, orderIndex: index, imageUrl: o.imageUrl })),
          },
          tags: {
            create: tagIds.map((tagId) => ({ tagId })),
          },
        },
        include: { options: true, tags: { include: { tag: true } } },
      });
```

Note: the first test's expectation for the second option uses `imageUrl: undefined` — this is correct because `o.imageUrl` is simply not present on that plain-object test fixture, and the mapping passes it through as-is (Prisma treats an `undefined` field as "don't set", which is fine for `create`).

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd "D:\exam app\apps\api" && npx jest questions/questions.service.spec.ts`
Expected: all tests pass, including the 2 new ones.

- [ ] **Step 6: Write the failing image-upload service test**

Add a new `describe` block to the end of `apps/api/src/questions/questions.service.spec.ts`:

```ts
describe('QuestionsService.uploadImage', () => {
  let service: QuestionsService;
  let tenantPrisma: { forTenant: jest.Mock };
  let jobsService: { enqueue: jest.Mock };

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
    process.env.API_ORIGIN = 'http://localhost:3001';
  });

  it('writes a valid PNG to question-images/ and returns its URL', async () => {
    const file = { mimetype: 'image/png', size: 1024, buffer: Buffer.from('fake-png-bytes') } as Express.Multer.File;

    const result = await service.uploadImage(file);

    expect(result.imageUrl).toMatch(/^http:\/\/localhost:3001\/uploads\/question-images\/[0-9a-f-]+\.png$/);
  });

  it('rejects a non-image mimetype', async () => {
    const file = { mimetype: 'application/pdf', size: 1024, buffer: Buffer.from('x') } as Express.Multer.File;

    await expect(service.uploadImage(file)).rejects.toThrow(BadRequestException);
  });

  it('rejects a file over 2MB', async () => {
    const file = { mimetype: 'image/png', size: 2 * 1024 * 1024 + 1, buffer: Buffer.from('x') } as Express.Multer.File;

    await expect(service.uploadImage(file)).rejects.toThrow(BadRequestException);
  });
});
```

Add the missing `BadRequestException` import to this spec file's existing `@nestjs/common` import line if not already present (it already imports `BadRequestException`, `NotFoundException` at the top — reuse, no duplicate import).

- [ ] **Step 7: Run the test to verify it fails**

Run: `cd "D:\exam app\apps\api" && npx jest questions/questions.service.spec.ts`
Expected: FAIL — `service.uploadImage` is not a function yet.

- [ ] **Step 8: Implement `QuestionsService.uploadImage`**

In `apps/api/src/questions/questions.service.ts`, add these imports at the top (alongside the existing ones):

```ts
import { randomUUID } from 'crypto';
import { dirname, join } from 'path';
import * as fs from 'fs/promises';
import { UPLOADS_ROOT } from '../organizations/uploads-path';
```

Add these two local constants directly above the `@Injectable()` class declaration (mirroring `organizations.service.ts`'s `ALLOWED_LOGO_MIME_TYPES`/`MAX_LOGO_SIZE_BYTES` — this codebase's established convention is each service owns its own small local constants rather than sharing them cross-module):

```ts
const ALLOWED_QUESTION_IMAGE_MIME_TYPES: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/svg+xml': '.svg',
};
const MAX_QUESTION_IMAGE_SIZE_BYTES = 2 * 1024 * 1024;
```

Add a new public method to the `QuestionsService` class, directly after `create`:

```ts
  async uploadImage(file: Express.Multer.File): Promise<{ imageUrl: string }> {
    const extension = ALLOWED_QUESTION_IMAGE_MIME_TYPES[file.mimetype];
    if (!extension) {
      throw new BadRequestException('Image must be a PNG, JPEG, or SVG image');
    }
    if (file.size > MAX_QUESTION_IMAGE_SIZE_BYTES) {
      throw new BadRequestException('Image file must be 2MB or smaller');
    }

    const imagePath = `question-images/${randomUUID()}${extension}`;
    const fullPath = join(UPLOADS_ROOT, imagePath);
    await fs.mkdir(dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, file.buffer);

    return { imageUrl: `${process.env.API_ORIGIN}/uploads/${imagePath}` };
  }
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `cd "D:\exam app\apps\api" && npx jest questions/questions.service.spec.ts`
Expected: all tests pass, including the 3 new upload tests.

- [ ] **Step 10: Add the controller route**

In `apps/api/src/questions/questions.controller.ts`, add a new endpoint directly after `bulkUpload`:

```ts
  @Post('images')
  @RequirePermissions('question_bank:manage')
  @UseInterceptors(FileInterceptor('file'))
  @Throttle(MODERATE_UPLOAD_THROTTLE)
  uploadImage(@UploadedFile() file: Express.Multer.File) {
    return this.questionsService.uploadImage(file);
  }
```

(`FileInterceptor`, `UploadedFile`, `Throttle`, and `MODERATE_UPLOAD_THROTTLE` are already imported in this file for the existing `bulkUpload` endpoint — reuse, no new imports needed.)

- [ ] **Step 11: Run the full questions test suite**

Run: `cd "D:\exam app\apps\api" && npx jest questions/`
Expected: all suites pass (`question-validation.spec.ts`, `questions.service.spec.ts`, `tags.service.spec.ts`).

- [ ] **Step 12: Commit**

```bash
git add apps/api/src/questions/dto/create-question.dto.ts apps/api/src/questions/questions.service.ts apps/api/src/questions/questions.service.spec.ts apps/api/src/questions/questions.controller.ts
git commit -m "feat: backend authoring surface for question code-snippet and image content"
```

---

### Task 3: Candidate-facing exposure (exam-runtime)

**Files:**
- Modify: `apps/exam-runtime/src/attempts/attempt.service.ts`
- Test: `apps/exam-runtime/src/attempts/attempt.service.spec.ts`

**Interfaces:**
- Consumes: `Question.snippetCode`/`snippetLanguage`/`imageUrl`, `QuestionOption.imageUrl` from Task 1.
- Produces: `AttemptQuestion` gains `snippetCode: string | null`, `snippetLanguage: string | null`, `imageUrl: string | null`; `AttemptQuestionOption` gains `imageUrl: string | null` — Task 5 (candidate exam page) relies on these exact field names in `getCurrent()`'s response.

- [ ] **Step 1: Write the failing test**

Add to `apps/exam-runtime/src/attempts/attempt.service.spec.ts`, directly after the existing `'includes codeLanguage and starterCode for a code question...'` test (matching its exact mock-setup conventions — `tx.attempt.findUnique`, `tx.question.findMany`, `mockBootstrapWithLogoThenScoped`):

```ts
    it('includes snippetCode, snippetLanguage, and imageUrl (question + option) for an mcq question', async () => {
      const attempt = {
        id: 'attempt-1', status: 'in_progress', startedAt: new Date(),
        questionOrderJson: JSON.stringify(['mcq-q1']),
        sectionSnapshotJson: JSON.stringify([{ sectionId: 'section-1', title: 'Section One', targetDurationMinutes: null, questionIds: ['mcq-q1'] }]),
        optionOrderJson: null,
      };
      const tx = {
        attempt: { findUnique: jest.fn().mockResolvedValue(attempt) },
        question: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'mcq-q1', text: 'What does this code print?', type: 'single_mcq', marks: 5,
              codeLanguage: null, starterCode: null, allowStdin: false,
              snippetCode: 'x = [1, 2, 3]\nprint(x[::-1])', snippetLanguage: 'python', imageUrl: 'http://localhost:3001/uploads/question-images/stem.png',
              options: [
                { id: 'opt-a', text: '[3, 2, 1]', imageUrl: 'http://localhost:3001/uploads/question-images/opt-a.png' },
                { id: 'opt-b', text: '[1, 2, 3]', imageUrl: null },
              ],
            },
          ]),
        },
      };
      const session = { invitationId: 'inv-1' };
      settlement.settleIfExpired.mockResolvedValue(attempt);
      settlement.remainingSeconds.mockReturnValue(3300);
      mockBootstrapWithLogoThenScoped(tx);

      const result = await service.getCurrent(session);

      expect((result as any).sections[0].questions[0]).toEqual({
        id: 'mcq-q1', text: 'What does this code print?', type: 'single_mcq', marks: 5,
        codeLanguage: null, starterCode: null, allowStdin: false,
        snippetCode: 'x = [1, 2, 3]\nprint(x[::-1])', snippetLanguage: 'python', imageUrl: 'http://localhost:3001/uploads/question-images/stem.png',
        options: [
          { id: 'opt-a', text: '[3, 2, 1]', imageUrl: 'http://localhost:3001/uploads/question-images/opt-a.png' },
          { id: 'opt-b', text: '[1, 2, 3]', imageUrl: null },
        ],
      });
    });
```

(Read the file first to confirm the exact `session`/`settlement`/`mockBootstrapWithLogoThenScoped` identifiers already used by the neighboring test — mirror them exactly rather than inventing new ones if they differ from what's shown above.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd "D:\exam app\apps\exam-runtime" && npx jest attempts/attempt.service.spec.ts -t "snippetCode"`
Expected: FAIL — `snippetCode`/`snippetLanguage`/`imageUrl` are `undefined` in the actual result (not yet mapped), and `options[0].imageUrl` is missing.

- [ ] **Step 3: Extend the `AttemptQuestion`/`AttemptQuestionOption` interfaces**

In `apps/exam-runtime/src/attempts/attempt.service.ts`, replace the two interfaces near the top of the file:

```ts
interface AttemptQuestionOption {
  id: string;
  text: string;
  imageUrl: string | null;
}

interface AttemptQuestion {
  id: string;
  text: string;
  type: string;
  marks: number;
  codeLanguage: string | null;
  starterCode: string | null;
  allowStdin: boolean;
  snippetCode: string | null;
  snippetLanguage: string | null;
  imageUrl: string | null;
  options: AttemptQuestionOption[];
}
```

- [ ] **Step 4: Extend the question-mapping code**

In the same file, find the question-mapping block inside `getCurrent()` (around line 640) and replace its returned object:

```ts
          return {
            id: question.id,
            text: question.text,
            type: question.type,
            marks: question.marks,
            codeLanguage: question.codeLanguage,
            starterCode: question.starterCode,
            allowStdin: question.allowStdin,
            snippetCode: question.snippetCode,
            snippetLanguage: question.snippetLanguage,
            imageUrl: question.imageUrl,
            options: orderedOptions.map((option) => ({ id: option.id, text: option.text, imageUrl: option.imageUrl })),
          };
```

(Do not change anything else in this block — `orderedOptions` and every other field are computed exactly as they are today.)

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd "D:\exam app\apps\exam-runtime" && npx jest attempts/attempt.service.spec.ts`
Expected: all tests pass, including the new one — every other existing test in this file is unaffected since the new fields are simply additional properties on the same returned object.

- [ ] **Step 6: Run the full exam-runtime suite**

Run: `cd "D:\exam app\apps\exam-runtime" && npx jest`
Expected: all suites pass, no new failures.

- [ ] **Step 7: Commit**

```bash
git add apps/exam-runtime/src/attempts/attempt.service.ts apps/exam-runtime/src/attempts/attempt.service.spec.ts
git commit -m "feat: expose question code-snippet and image content to candidates"
```

---

### Task 4: Frontend types + recruiter authoring form

**Files:**
- Modify: `apps/web/lib/types.ts`
- Modify: `apps/web/lib/hooks/useQuestions.ts`
- Modify: `apps/web/components/QuestionForm.tsx`
- Test: `apps/web/components/QuestionForm.test.tsx` (extend if it exists — check first with `find apps/web/components -iname "QuestionForm.test.*"`; if it doesn't exist, create it fresh using the pattern shown in Step 2)

**Interfaces:**
- Consumes: nothing new from earlier tasks beyond the API surface (`POST /questions/images`, and `snippetCode`/`snippetLanguage`/`imageUrl` on question create/update) from Task 2.
- Produces: `Question`/`QuestionOption` types gain the four fields; `QuestionInput` gains `snippetCode`/`snippetLanguage`/`imageUrl` and `options[].imageUrl`; new hook `useUploadQuestionImage()` — Task 5 does not consume this hook (candidate side never uploads), but keeping it in `useQuestions.ts` alongside the other question-authoring hooks matches this file's existing organization.

- [ ] **Step 1: Extend `apps/web/lib/types.ts`**

Replace the `QuestionOption` and `Question` interfaces:

```ts
export interface QuestionOption {
  id: string;
  text: string;
  isCorrect: boolean;
  imageUrl: string | null;
}

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
  allowStdin: boolean;
  snippetCode: string | null;
  snippetLanguage: CodeLanguage | null;
  imageUrl: string | null;
  createdAt: string;
  options: QuestionOption[];
  tags?: Tag[];
}
```

- [ ] **Step 2: Write the failing form test**

Check first: `find "D:\exam app\apps\web\components" -iname "QuestionForm.test.*"`. If it exists, read it fully first to match its exact render/mock conventions before inserting. Add these two cases (adapting only the render/mock boilerplate to match whatever convention the file already uses — the assertions and interactions below are exact):

```tsx
  it('lets the recruiter enter a code snippet and language for a single_mcq question', () => {
    const onSubmit = jest.fn();
    render(<QuestionForm tags={[]} onSubmit={onSubmit} submitLabel="Create" />);

    fireEvent.change(screen.getByLabelText('Question text'), { target: { value: 'What does this print?' } });
    fireEvent.change(screen.getByLabelText('Code snippet'), { target: { value: 'print(1+1)' } });
    fireEvent.change(screen.getByLabelText('Option 1 text'), { target: { value: 'A' } });
    fireEvent.change(screen.getByLabelText('Option 2 text'), { target: { value: 'B' } });
    fireEvent.click(screen.getByLabelText('Option 1 correct'));
    fireEvent.click(screen.getByText('Create'));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ snippetCode: 'print(1+1)', snippetLanguage: 'javascript' }),
    );
  });

  it('omits snippetCode/snippetLanguage/imageUrl for a code (execution) question', () => {
    const onSubmit = jest.fn();
    render(<QuestionForm tags={[]} onSubmit={onSubmit} submitLabel="Create" />);

    fireEvent.change(screen.getByLabelText('Question type'), { target: { value: 'code' } });
    fireEvent.change(screen.getByLabelText('Question text'), { target: { value: 'Reverse a string' } });
    fireEvent.click(screen.getByText('Create'));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ snippetCode: undefined, snippetLanguage: undefined, imageUrl: undefined }),
    );
  });
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd "D:\exam app\apps\web" && npx jest QuestionForm.test`
Expected: FAIL — no "Code snippet" labeled field exists yet, and `onSubmit`'s payload has no `snippetCode`/`snippetLanguage`/`imageUrl` keys at all.

- [ ] **Step 4: Add snippet/image state and submission wiring**

In `apps/web/components/QuestionForm.tsx`, add three new pieces of state directly after the existing `allowStdin` state:

```ts
  const [snippetCode, setSnippetCode] = useState(initialQuestion?.snippetCode ?? '');
  const [snippetLanguage, setSnippetLanguage] = useState<CodeLanguage>(initialQuestion?.snippetLanguage ?? 'javascript');
  const [imageUrl, setImageUrl] = useState(initialQuestion?.imageUrl ?? '');
```

Update `options` state's initializer to carry through `imageUrl`, and update the `OptionDraft` interface:

```ts
interface OptionDraft {
  text: string;
  isCorrect: boolean;
  imageUrl?: string;
}
```

```ts
  const [options, setOptions] = useState<OptionDraft[]>(
    initialQuestion
      ? initialQuestion.options.map((option) => ({ text: option.text, isCorrect: option.isCorrect, imageUrl: option.imageUrl ?? undefined }))
      : defaultOptionsFor(type),
  );
```

Add an option-image setter next to `updateOptionText`:

```ts
  function updateOptionImage(index: number, value: string) {
    setOptions((current) => current.map((option, i) => (i === index ? { ...option, imageUrl: value || undefined } : option)));
  }
```

Replace `handleSubmit` to include the three new fields (only for non-`code` types, per the Global Constraints) and each option's `imageUrl`:

```ts
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
      allowStdin: type === 'code' ? allowStdin : undefined,
      snippetCode: type === 'code' ? undefined : snippetCode || undefined,
      snippetLanguage: type === 'code' ? undefined : (snippetCode ? snippetLanguage : undefined),
      imageUrl: type === 'code' ? undefined : imageUrl || undefined,
      options: options.map((option) => ({ text: option.text, isCorrect: option.isCorrect, imageUrl: option.imageUrl })),
    });
  }
```

- [ ] **Step 5: Add the snippet/image fields to the non-code branch of the form**

In the same file, inside the `) : (` branch that renders for non-`code` types (the `<div className="flex flex-col gap-2">` starting with `<span className="text-sm font-medium text-gray-700">Options</span>`), add the snippet and stem-image fields directly before that `<span>`:

```tsx
      {type !== 'code' && (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <Select
              label="Snippet language"
              value={snippetLanguage}
              onChange={(value) => setSnippetLanguage(value as CodeLanguage)}
              options={LANGUAGE_OPTIONS}
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-gray-700">Code snippet (optional)</span>
            <textarea
              aria-label="Code snippet"
              value={snippetCode}
              onChange={(e) => setSnippetCode(e.target.value)}
              className="rounded border border-gray-300 px-3 py-2 font-mono text-sm"
              rows={4}
            />
          </div>
          <QuestionImageUpload label="Question image (optional)" value={imageUrl} onChange={setImageUrl} />
        </div>
      )}
```

Add a small option-image upload control to each option row. For the `single_mcq`/`true_false` radio-group branch, change each mapped `<div>`:

```tsx
              {options.map((option, index) => (
                <div key={index} className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value={String(index)} label={`Option ${index + 1} correct`} />
                    <input
                      aria-label={`Option ${index + 1} text`}
                      value={option.text}
                      onChange={(e) => updateOptionText(index, e.target.value)}
                      className="rounded border border-gray-300 px-2 py-1 text-sm"
                      readOnly={type === 'true_false'}
                    />
                  </div>
                  <QuestionImageUpload label={`Option ${index + 1} image (optional)`} value={option.imageUrl ?? ''} onChange={(url) => updateOptionImage(index, url)} />
                </div>
              ))}
```

And for the `multi_mcq` branch's mapped `<div>`:

```tsx
            options.map((option, index) => (
              <div key={index} className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <Checkbox label={`Option ${index + 1} correct`} checked={option.isCorrect} onChange={(checked) => toggleMultiCorrect(index, checked)} />
                  <input
                    aria-label={`Option ${index + 1} text`}
                    value={option.text}
                    onChange={(e) => updateOptionText(index, e.target.value)}
                    className="rounded border border-gray-300 px-2 py-1 text-sm"
                  />
                </div>
                <QuestionImageUpload label={`Option ${index + 1} image (optional)`} value={option.imageUrl ?? ''} onChange={(url) => updateOptionImage(index, url)} />
              </div>
            ))
```

Add a small local component at the bottom of the same file, above the `QuestionForm` export (or below it — either is fine as long as it's defined once in this file):

```tsx
function QuestionImageUpload({ label, value, onChange }: { label: string; value: string; onChange: (url: string) => void }) {
  const upload = useUploadQuestionImage();
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-gray-600">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="file"
          accept="image/png,image/jpeg,image/svg+xml"
          aria-label={label}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            upload.mutate(file, { onSuccess: (result) => onChange(result.imageUrl) });
          }}
        />
        {value ? (
          <>
            <img src={value} alt="" className="h-10 w-10 rounded object-cover" />
            <Button type="button" variant="secondary" onClick={() => onChange('')}>
              Remove
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}
```

Add the `useUploadQuestionImage` import to this file's existing import line for `../lib/hooks/useQuestions`:

```ts
import { QuestionInput, useUploadQuestionImage } from '../lib/hooks/useQuestions';
```

- [ ] **Step 6: Extend `QuestionInput` and add `useUploadQuestionImage`**

In `apps/web/lib/hooks/useQuestions.ts`, replace the `QuestionInput` interface:

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
  allowStdin?: boolean;
  snippetCode?: string;
  snippetLanguage?: string;
  imageUrl?: string;
  options: { text: string; isCorrect: boolean; imageUrl?: string }[];
}
```

Add a new hook at the end of the file:

```ts
export function useUploadQuestionImage() {
  const { accessToken } = useAuth();
  return useMutation({
    mutationFn: (file: File): Promise<{ imageUrl: string }> => {
      const formData = new FormData();
      formData.append('file', file);
      return apiFetch('/questions/images', { method: 'POST', body: formData }, accessToken ?? undefined);
    },
  });
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cd "D:\exam app\apps\web" && npx jest QuestionForm.test`
Expected: all tests pass, including the 2 new ones.

- [ ] **Step 8: Run `tsc` to confirm no new type errors**

Run: `cd "D:\exam app\apps\web" && npx tsc --noEmit -p tsconfig.json`
Expected: no new errors versus whatever pre-existing baseline you observe (this codebase has a small number of known pre-existing unrelated errors in test files — confirm the count/files match before your change and after).

- [ ] **Step 9: Commit**

```bash
git add apps/web/lib/types.ts apps/web/lib/hooks/useQuestions.ts apps/web/components/QuestionForm.tsx apps/web/components/QuestionForm.test.tsx
git commit -m "feat: recruiter authoring UI for question code-snippet and image content"
```

---

### Task 5: Frontend candidate exam-page rendering

**Files:**
- Modify: `apps/web/lib/types.ts`
- Modify: `apps/web/app/(candidate)/exam/page.tsx`
- Test: `apps/web/app/(candidate)/exam/page.test.tsx` (extend — read it first to match its exact mock conventions for `useAttemptQuery`/`flattenQuestions` before inserting)

**Interfaces:**
- Consumes: `snippetCode`/`snippetLanguage`/`imageUrl` on `AttemptQuestion`, `imageUrl` on `AttemptQuestionOption` from Task 3.
- Produces: nothing consumed by a later task (last frontend task before final verification).

- [ ] **Step 1: Extend `AttemptQuestion`/`AttemptQuestionOption` in `apps/web/lib/types.ts`**

Replace the two interfaces:

```ts
export interface AttemptQuestionOption {
  id: string;
  text: string;
  imageUrl: string | null;
}

export interface AttemptQuestion {
  id: string;
  text: string;
  type: QuestionType;
  marks: number;
  codeLanguage: CodeLanguage | null;
  starterCode: string | null;
  allowStdin: boolean;
  snippetCode: string | null;
  snippetLanguage: CodeLanguage | null;
  imageUrl: string | null;
  options: AttemptQuestionOption[];
}
```

- [ ] **Step 2: Write the failing page test**

Read `apps/web/app/(candidate)/exam/page.test.tsx` in full first to match its exact `useAttemptQuery` mock shape (the mocked `attemptState.sections[0].questions[0]` object). Add a new test case that supplies a question fixture with `snippetCode`, `snippetLanguage`, `imageUrl`, and one option with `imageUrl` set, then asserts:

```tsx
  it('renders the code snippet, question image, and option images when present', () => {
    mockUseAttemptQuery.mockReturnValue({
      data: {
        status: 'in_progress',
        remainingSeconds: 600,
        webcamViolationCount: 0,
        exam: { title: 'Sample Exam' },
        sections: [
          {
            title: 'Section 1',
            targetDurationMinutes: null,
            questions: [
              {
                id: 'q1', text: 'What does this code print?', type: 'single_mcq', marks: 5,
                codeLanguage: null, starterCode: null, allowStdin: false,
                snippetCode: 'x = [1, 2, 3]\nprint(x[::-1])', snippetLanguage: 'python', imageUrl: 'http://localhost:3001/uploads/question-images/stem.png',
                options: [
                  { id: 'opt-a', text: '[3, 2, 1]', imageUrl: 'http://localhost:3001/uploads/question-images/opt-a.png' },
                  { id: 'opt-b', text: '[1, 2, 3]', imageUrl: null },
                ],
              },
            ],
          },
        ],
        answers: [],
        messages: [],
        feedback: null,
        organizationLogoUrl: null,
        organizationPrimaryColor: null,
      },
      isError: false,
    });

    renderExamPage();

    expect(screen.getByText('x = [1, 2, 3]')).toBeInTheDocument();
    expect(screen.getByText('python')).toBeInTheDocument();
    expect(screen.getByAltText('Question illustration')).toHaveAttribute('src', 'http://localhost:3001/uploads/question-images/stem.png');
    expect(screen.getByAltText('Option illustration')).toHaveAttribute('src', 'http://localhost:3001/uploads/question-images/opt-a.png');
  });
```

(Match the exact mock function name (`mockUseAttemptQuery` or whatever this file already uses) and any existing `renderExamPage()` helper — read the file first rather than assuming these exact identifiers.)

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd "D:\exam app\apps\web" && npx jest "app/(candidate)/exam/page.test.tsx"`
(If the parens-in-path pattern matches nothing under Jest, use the paren-free substring `exam/page.test`.)
Expected: FAIL — no code snippet, no question image, no option images are rendered yet.

- [ ] **Step 4: Render the snippet and images**

In `apps/web/app/(candidate)/exam/page.tsx`, directly after the existing `<p className="mb-4 text-sm text-candidate-text">{question.text}</p>` line, add:

```tsx
          {question.imageUrl ? (
            <img src={question.imageUrl} alt="Question illustration" className="mb-4 max-h-64 rounded-lg object-contain" />
          ) : null}
          {question.snippetCode ? (
            <div className="mb-4 overflow-hidden rounded-md">
              <div className="bg-[#1E1E1E] px-3 py-1.5">
                <span className="rounded bg-[#2D2D2D] px-2 py-0.5 text-[11px] font-semibold text-candidate-text-faint">
                  {question.snippetLanguage ?? 'plaintext'}
                </span>
              </div>
              <pre className="overflow-x-auto bg-[#1E1E1E] px-3 py-2 font-mono text-xs text-candidate-text-faint">{question.snippetCode}</pre>
            </div>
          ) : null}
```

In the MCQ options-rendering branch (the `question.options.map((option) => ...)` block), add the option image inside each option button, directly after the existing selection-indicator `<span aria-hidden="true" />` and before `{option.text}`:

```tsx
                    <span className="inline-flex items-center gap-2">
                      <span
                        className={clsx(
                          'inline-block h-3.5 w-3.5 flex-shrink-0 rounded-full border-2',
                          selected ? 'border-candidate-primary bg-candidate-primary shadow-[inset_0_0_0_2px_white]' : 'border-candidate-text-faint',
                        )}
                        aria-hidden="true"
                      />
                      {option.imageUrl ? (
                        <img src={option.imageUrl} alt="Option illustration" className="h-10 w-10 rounded object-cover" />
                      ) : null}
                      {option.text}
                    </span>
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd "D:\exam app\apps\web" && npx jest "exam/page.test"`
Expected: all tests pass, including the new one — existing tests are unaffected since a question/option with no `imageUrl`/`snippetCode` renders nothing extra (both new blocks are conditionally `null`).

- [ ] **Step 6: Run `tsc` to confirm no new type errors**

Run: `cd "D:\exam app\apps\web" && npx tsc --noEmit -p tsconfig.json`
Expected: no new errors versus the pre-existing baseline.

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/types.ts "apps/web/app/(candidate)/exam/page.tsx" "apps/web/app/(candidate)/exam/page.test.tsx"
git commit -m "feat: render question code-snippet and image content on the candidate exam page"
```

---

### Task 6: E2E coverage + final verification

**Files:**
- Test: `apps/api/test/question-code-image-content.e2e-spec.ts`

**Interfaces:**
- Consumes: the full stack from Tasks 1-5.
- Produces: nothing (final task).

- [ ] **Step 1: Write the e2e test**

Create `apps/api/test/question-code-image-content.e2e-spec.ts`, following the exact `bootAdminApp`/`bootRuntimeApp` dual-app setup pattern already used by an existing e2e spec in this directory (grep `apps/api/test/*.e2e-spec.ts` for the setup used by e.g. `exam-code-grading.e2e-spec.ts` or `live-monitoring.e2e-spec.ts` and mirror it exactly). The test flow:

1. Recruiter logs in, calls `POST /questions/images` with a small in-memory PNG buffer, gets back `{ imageUrl }`.
2. Recruiter creates a `single_mcq` question via `POST /questions` with `snippetCode`, `snippetLanguage`, the stem `imageUrl` from step 1, and one option carrying its own `imageUrl` (reuse the same uploaded URL — a second real upload isn't necessary to prove the field flows through).
3. Recruiter builds an exam with that question, invites a candidate.
4. Candidate redeems the invitation, calls `POST /attempt/start`, then `GET /attempt/current` — assert the response's question includes `snippetCode`, `snippetLanguage`, `imageUrl`, and the option's `imageUrl`, all matching what was set in step 2.
5. Candidate submits the MCQ answer and `POST /attempt/submit` — assert the attempt settles normally (status `submitted`, a real `passFail`), proving grading is completely unaffected by the new fields.

- [ ] **Step 2: Run the e2e test**

Run: `cd "D:\exam app\apps\api" && npx jest --config ./test/jest-e2e.json --runInBand question-code-image-content.e2e-spec.ts`
Expected: passes.

- [ ] **Step 3: Run the full regression sweep**

```bash
cd "D:\exam app\apps\api" && npx jest
cd "D:\exam app\apps\exam-runtime" && npx jest
cd "D:\exam app\apps\web" && npx jest
cd "D:\exam app\apps\web" && npx tsc --noEmit -p tsconfig.json
cd "D:\exam app\apps\web" && WEB_BASE_URL=http://localhost:3002 E2E_API_BASE=http://localhost:3501/api/v1 npx playwright test --reporter=list
```

Expected: apps/api + apps/exam-runtime + apps/web jest suites all green (including the new e2e spec); `tsc` shows zero new errors versus the pre-existing baseline; the full Playwright suite passes with an unchanged spec count (this feature adds no new candidate-facing interaction that Playwright can't already exercise through the existing recruiter/candidate golden-path specs — no new e2e spec needed there since the backend e2e spec in Step 1 already covers the field flow end-to-end).

- [ ] **Step 4: Commit**

```bash
git add apps/api/test/question-code-image-content.e2e-spec.ts
git commit -m "test: e2e coverage for question code-snippet and image content"
```

---

## Self-Review Notes

- **Spec coverage:** schema for all four fields + exclusion for `type === 'code'` (T1, T2); image upload endpoint reusing the org-logo pattern exactly (T2); candidate-facing exposure via exam-runtime's hand-built `AttemptQuestion` (T3, since apps/api's own question-bank read endpoints already pass the new Prisma columns through automatically via `toResponse`'s spread — no separate task needed there); recruiter authoring UI for snippet + stem/option images (T4); candidate rendering of snippet + images (T5); end-to-end proof the fields flow through without touching grading (T6). ✓
- **Placeholder scan:** every step shows complete code, not descriptions of code. The one deliberately loose spot (Task 6 Step 1's e2e narrative) mirrors this session's established convention of describing an e2e flow in prose while pointing at a concrete existing spec file to mirror for exact setup boilerplate — not a placeholder for logic. ✓
- **Type consistency:** `snippetCode`/`snippetLanguage`/`imageUrl` (Question) and `imageUrl` (QuestionOption) are spelled identically across the Prisma schema (T1), the DTOs and service (T2), exam-runtime's `AttemptQuestion`/`AttemptQuestionOption` (T3), `apps/web/lib/types.ts`'s `Question`/`QuestionOption`/`AttemptQuestion`/`AttemptQuestionOption` (T4/T5), and `QuestionInput` (T4). `useUploadQuestionImage()`'s return shape `{ imageUrl: string }` matches `QuestionsService.uploadImage()`'s return type exactly. ✓
