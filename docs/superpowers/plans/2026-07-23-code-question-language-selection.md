# Code Question Language Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Code Run Execution feature's single-language lock-in with a recruiter-chosen Fixed (curated set) or Any (every sandbox language) mode, and a real candidate-facing language picker — backed by dynamically querying Piston's own runtime list instead of a hardcoded 8-language map.

**Architecture:** A new `PistonRuntimesService` (exam-runtime) caches Piston's live `GET /api/v2/runtimes` list and becomes the single source of truth for every language list in the app. `Question.codeLanguage` is fully replaced by `languageMode`/`allowedLanguages`; `Answer` gains `codeLanguage` to record what the candidate actually picked. The first-ever GET routes are added to the previously all-POST apps/api↔exam-runtime internal-client pattern, since these are pure reads.

**Tech Stack:** NestJS/Prisma/SQL Server (apps/api, apps/exam-runtime), Next.js/React/Monaco (apps/web). No new npm dependencies.

## Global Constraints

- No automatic language detection from typed code — the candidate always picks from an explicit selector.
- No per-language starter code. `Question.starterCode` is only submitted/shown when `languageMode === 'fixed'` and `allowedLanguages` has exactly one entry; blank editor otherwise.
- The live Piston runtime list (`GET /api/v2/runtimes`, cached ~1hr TTL) is the single source of truth for every language list in the app after this ships — no hardcoded/duplicated language list may remain for the Code Run Execution path (the QCIC feature's separate, purely-decorative `snippetLanguage` field is explicitly out of scope and keeps its own small static list unchanged — it's a display label with no execution/highlighting behavior, unrelated to this feature).
- Existing published code questions must migrate to `languageMode: 'fixed'` with a one-item `allowedLanguages`, and behave identically to today for candidates (auto-selected, zero extra clicks) — hard backward-compatibility requirement, verified by a dedicated test.
- `question-validation.ts`'s language-set check stays a pure/synchronous function — it takes the live language list as a parameter, it must never perform its own HTTP fetch.
- The two new read-only endpoints (`GET /api/v1/internal/code-execution/languages` on exam-runtime, `GET /attempt/code-languages` for candidates) are deliberately GET, even though the existing apps/api↔exam-runtime internal-client pattern has been all-POST until now — this is intentional, not an inconsistency to "fix" back to POST.

---

### Task 1: Schema — languageMode/allowedLanguages/Answer.codeLanguage + migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260723090000_code_question_language_selection/migration.sql`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `Question.languageMode: String` (default `"fixed"`), `Question.allowedLanguages: String?` (JSON-stringified array), `Answer.codeLanguage: String?`. `Question.codeLanguage` is removed entirely — every later task relies on it being gone.

- [ ] **Step 1: Update the `Question` model**

In `apps/api/prisma/schema.prisma`, find the `Question` model and replace the `codeLanguage` line with `languageMode`/`allowedLanguages`:

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
  languageMode   String                @default("fixed") @map("language_mode")
  allowedLanguages String?             @map("allowed_languages") @db.NVarChar(Max)
  starterCode    String?               @map("starter_code") @db.NVarChar(Max)
  allowStdin     Boolean               @default(false) @map("allow_stdin")
  snippetCode    String?               @map("snippet_code") @db.NVarChar(Max)
  snippetLanguage String?              @map("snippet_language")
  imageUrl       String?               @map("image_url")
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

- [ ] **Step 2: Add `codeLanguage` to `Answer`**

In the same file, find the `Answer` model and add one field directly after `gradingFeedback`:

```prisma
model Answer {
  id                    String            @id @default(uuid()) @db.UniqueIdentifier
  attemptId             String            @map("attempt_id") @db.UniqueIdentifier
  questionId            String            @map("question_id") @db.UniqueIdentifier
  selectedOptionIdsJson String            @map("selected_option_ids_json") @db.NVarChar(Max)
  isMarkedForReview     Boolean           @default(false) @map("is_marked_for_review")
  answeredAt            DateTime          @default(now()) @map("answered_at")
  isCorrect             Boolean?          @map("is_correct")
  marksAwarded          Int?              @map("marks_awarded")
  answerText            String?           @map("answer_text") @db.NVarChar(Max)
  gradingFeedback       String?           @map("grading_feedback") @db.NVarChar(Max)
  codeLanguage          String?           @map("code_language")
  telemetryJson         String?           @map("telemetry_json") @db.NVarChar(Max)
  attempt               Attempt           @relation(fields: [attemptId], references: [id], onDelete: Cascade)
  question              Question          @relation(fields: [questionId], references: [id])
  codeReview            CodeAnswerReview?

  @@unique([attemptId, questionId])
  @@map("answers")
}
```

- [ ] **Step 3: Create the migration by hand**

Create `apps/api/prisma/migrations/20260723090000_code_question_language_selection/migration.sql`. The order matters: add the new columns first, backfill from the old one while it still exists, THEN drop it — never drop before backfilling.

```sql
-- 1. Add the new Question columns.
ALTER TABLE [dbo].[questions] ADD [language_mode] NVARCHAR(1000) NOT NULL CONSTRAINT [questions_language_mode_default] DEFAULT 'fixed';
ALTER TABLE [dbo].[questions] ADD [allowed_languages] NVARCHAR(MAX) NULL;

-- 2. Backfill: every existing code question's single code_language becomes a one-item
--    allowed_languages set in Fixed mode (language_mode already defaults to 'fixed').
UPDATE [dbo].[questions]
SET [allowed_languages] = '["' + [code_language] + '"]'
WHERE [type] = 'code' AND [code_language] IS NOT NULL;

-- 3. Drop the superseded column now that its data has been migrated.
ALTER TABLE [dbo].[questions] DROP COLUMN [code_language];

-- 4. Answer gains the candidate's chosen language for their code answer.
ALTER TABLE [dbo].[answers] ADD [code_language] NVARCHAR(1000) NULL;
```

- [ ] **Step 4: Apply the migration**

```bash
cd "D:\exam app\apps\api" && npx prisma migrate dev --name code_question_language_selection
```

If `migrate dev` fails on the shadow-database permission (known in this environment), fall back to:

```bash
npx prisma db push
npx prisma migrate resolve --applied 20260723090000_code_question_language_selection
```

...then re-apply the `audit_logs_actor_user_id_fkey` fix (`db push` reverts it to `NO_ACTION`):

```sql
ALTER TABLE [dbo].[audit_logs] DROP CONSTRAINT [audit_logs_actor_user_id_fkey];
ALTER TABLE [dbo].[audit_logs] ADD CONSTRAINT [audit_logs_actor_user_id_fkey] FOREIGN KEY ([actor_user_id]) REFERENCES [dbo].[users]([id]) ON DELETE SET NULL ON UPDATE NO ACTION;
```

...then regenerate the client:

```bash
npx prisma generate
```

Expected either way: `npx prisma migrate status` reports "Database schema is up to date!" and `@prisma/client`'s `Question` type has `languageMode`/`allowedLanguages` (no `codeLanguage`), `Answer` type has `codeLanguage`.

- [ ] **Step 5: Verify the backfill against a live row**

If any `type: 'code'` questions already exist in the dev database, spot-check one:

```bash
cd "D:\exam app\apps\api" && node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.question.findFirst({ where: { type: 'code' } }).then((q) => { console.log(q); return p.\$disconnect(); });
"
```

Expected: `languageMode: 'fixed'`, `allowedLanguages` is a JSON string containing exactly one language id, `codeLanguage` key does not exist on the object at all. If no code questions exist yet in this environment, this step is a no-op — just confirm the query runs without error.

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations
git commit -m "feat: schema for code question fixed/any language modes"
```

---

### Task 2: PistonRuntimesService — dynamic runtime discovery + caching

**Files:**
- Modify: `apps/exam-runtime/src/code-execution/piston-client.ts`
- Modify: `apps/exam-runtime/src/code-execution/piston-languages.ts`
- Create: `apps/exam-runtime/src/code-execution/piston-runtimes.service.ts`
- Test: `apps/exam-runtime/src/code-execution/piston-runtimes.service.spec.ts`
- Create: `apps/exam-runtime/src/code-execution/code-execution.module.ts`
- Modify: `apps/exam-runtime/src/attempts/attempt.module.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `PistonClient.listRuntimes(): Promise<{language: string; version: string; aliases: string[]}[]>`; `PistonRuntimesService.getAvailableLanguages(): Promise<{language: string; version: string}[]>` and `.resolveLanguage(language: string): Promise<{language: string; version: string} | null>`; `CodeExecutionModule` exporting `PistonClient`, `RunLimiter`, `PistonRuntimesService` — Task 3 injects `PistonRuntimesService` into both `InternalController` and `AttemptController`'s owning modules via this module; Task 5 calls `resolveLanguage()` from `AttemptService`.

- [ ] **Step 1: Add `listRuntimes()` to `PistonClient`**

In `apps/exam-runtime/src/code-execution/piston-client.ts`, add a new method to the `PistonClient` class, directly after `execute()`:

```ts
  async listRuntimes(): Promise<{ language: string; version: string; aliases: string[] }[]> {
    const response = await fetch(`${this.baseUrl}/api/v2/runtimes`);
    if (!response.ok) {
      throw new Error(`Piston runtimes request failed with status ${response.status}`);
    }
    return response.json();
  }
```

- [ ] **Step 2: Remove the static language map, keep `COMPILED_LANGUAGES`**

Replace the full contents of `apps/exam-runtime/src/code-execution/piston-languages.ts`:

```ts
// Compiled languages have a distinct "compile" stage in Piston's response; interpreted
// languages don't, so compileError should always be null for them (see PistonClient).
export const COMPILED_LANGUAGES = new Set(['java', 'csharp', 'cpp', 'go']);
```

(`PistonLanguageEntry` and `PISTON_LANGUAGE_MAP` are removed — the live runtime list from `PistonRuntimesService` replaces them everywhere.)

- [ ] **Step 3: Write the failing `PistonRuntimesService` tests**

Create `apps/exam-runtime/src/code-execution/piston-runtimes.service.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { PistonRuntimesService } from './piston-runtimes.service';
import { PistonClient } from './piston-client';

describe('PistonRuntimesService', () => {
  let service: PistonRuntimesService;
  let pistonClient: { listRuntimes: jest.Mock };

  beforeEach(async () => {
    pistonClient = { listRuntimes: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [PistonRuntimesService, { provide: PistonClient, useValue: pistonClient }],
    }).compile();
    service = moduleRef.get(PistonRuntimesService);
  });

  it('fetches and dedupes to the newest version per language on first call', async () => {
    pistonClient.listRuntimes.mockResolvedValue([
      { language: 'python', version: '2.7.16', aliases: [] },
      { language: 'python', version: '3.10.0', aliases: [] },
      { language: 'javascript', version: '18.15.0', aliases: ['node'] },
    ]);

    const result = await service.getAvailableLanguages();

    expect(result).toEqual(
      expect.arrayContaining([
        { language: 'python', version: '3.10.0' },
        { language: 'javascript', version: '18.15.0' },
      ]),
    );
    expect(result).toHaveLength(2);
  });

  it('serves the cached result on a second call within the TTL without refetching', async () => {
    pistonClient.listRuntimes.mockResolvedValue([{ language: 'python', version: '3.10.0', aliases: [] }]);

    await service.getAvailableLanguages();
    await service.getAvailableLanguages();

    expect(pistonClient.listRuntimes).toHaveBeenCalledTimes(1);
  });

  it('serves a stale cache instead of throwing if a refresh fails after the cache already has data', async () => {
    pistonClient.listRuntimes.mockResolvedValueOnce([{ language: 'python', version: '3.10.0', aliases: [] }]);
    await service.getAvailableLanguages();

    pistonClient.listRuntimes.mockRejectedValueOnce(new Error('Piston unreachable'));
    // Force a refresh by resetting the internal clock — simplest way without a fake timer here
    // is to call the private cache-buster the class exposes for tests via a short TTL override.
    (service as unknown as { ttlMs: number }).ttlMs = 0;

    const result = await service.getAvailableLanguages();

    expect(result).toEqual([{ language: 'python', version: '3.10.0' }]);
  });

  it('throws if the very first fetch fails with no cache to fall back on', async () => {
    pistonClient.listRuntimes.mockRejectedValue(new Error('Piston unreachable'));

    await expect(service.getAvailableLanguages()).rejects.toThrow('Piston unreachable');
  });

  it('resolveLanguage returns the matching entry for a known language', async () => {
    pistonClient.listRuntimes.mockResolvedValue([{ language: 'python', version: '3.10.0', aliases: [] }]);

    const result = await service.resolveLanguage('python');

    expect(result).toEqual({ language: 'python', version: '3.10.0' });
  });

  it('resolveLanguage returns null for an unknown language', async () => {
    pistonClient.listRuntimes.mockResolvedValue([{ language: 'python', version: '3.10.0', aliases: [] }]);

    const result = await service.resolveLanguage('cobol');

    expect(result).toBeNull();
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `cd "D:\exam app\apps\exam-runtime" && npx jest code-execution/piston-runtimes.service.spec.ts`
Expected: FAIL — `Cannot find module './piston-runtimes.service'`.

- [ ] **Step 5: Implement `PistonRuntimesService`**

Create `apps/exam-runtime/src/code-execution/piston-runtimes.service.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { PistonClient } from './piston-client';

export interface PistonLanguage {
  language: string;
  version: string;
}

function compareVersions(a: string, b: string): number {
  const partsA = a.split('.').map((part) => parseInt(part, 10) || 0);
  const partsB = b.split('.').map((part) => parseInt(part, 10) || 0);
  const length = Math.max(partsA.length, partsB.length);
  for (let i = 0; i < length; i++) {
    const diff = (partsA[i] ?? 0) - (partsB[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

@Injectable()
export class PistonRuntimesService {
  private readonly logger = new Logger(PistonRuntimesService.name);
  private cache: PistonLanguage[] | null = null;
  private cachedAt = 0;
  private readonly ttlMs = 60 * 60 * 1000;

  constructor(private readonly pistonClient: PistonClient) {}

  async getAvailableLanguages(): Promise<PistonLanguage[]> {
    const now = Date.now();
    if (this.cache && now - this.cachedAt < this.ttlMs) {
      return this.cache;
    }
    try {
      const runtimes = await this.pistonClient.listRuntimes();
      const byLanguage = new Map<string, PistonLanguage>();
      for (const runtime of runtimes) {
        const existing = byLanguage.get(runtime.language);
        if (!existing || compareVersions(runtime.version, existing.version) > 0) {
          byLanguage.set(runtime.language, { language: runtime.language, version: runtime.version });
        }
      }
      this.cache = [...byLanguage.values()];
      this.cachedAt = now;
      return this.cache;
    } catch (error) {
      if (this.cache) {
        this.logger.warn(`Failed to refresh Piston runtime list, serving stale cache: ${(error as Error).message}`);
        return this.cache;
      }
      throw error;
    }
  }

  async resolveLanguage(language: string): Promise<PistonLanguage | null> {
    const languages = await this.getAvailableLanguages();
    return languages.find((entry) => entry.language === language) ?? null;
  }
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd "D:\exam app\apps\exam-runtime" && npx jest code-execution/piston-runtimes.service.spec.ts`
Expected: all 6 tests pass.

- [ ] **Step 7: Create `CodeExecutionModule` and wire it into `AttemptModule`**

Create `apps/exam-runtime/src/code-execution/code-execution.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { PistonClient } from './piston-client';
import { RunLimiter } from './run-limiter';
import { PistonRuntimesService } from './piston-runtimes.service';

@Module({
  providers: [PistonClient, RunLimiter, PistonRuntimesService],
  exports: [PistonClient, RunLimiter, PistonRuntimesService],
})
export class CodeExecutionModule {}
```

Replace the full contents of `apps/exam-runtime/src/attempts/attempt.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { AuditModule } from '@exam-platform/shared';
import { GradingModule } from '../grading/grading.module';
import { MonitoringModule } from '../monitoring/monitoring.module';
import { LeaderboardModule } from '../leaderboard/leaderboard.module';
import { CodeExecutionModule } from '../code-execution/code-execution.module';
import { AttemptController } from './attempt.controller';
import { AttemptService } from './attempt.service';

@Module({
  imports: [GradingModule, MonitoringModule, LeaderboardModule, AuditModule, CodeExecutionModule],
  controllers: [AttemptController],
  providers: [AttemptService],
})
export class AttemptModule {}
```

(`PistonClient`/`RunLimiter` are no longer provided directly here — they now come from the imported `CodeExecutionModule`, which `AttemptService` already consumes via constructor injection unchanged.)

- [ ] **Step 8: Run the full exam-runtime suite**

Run: `cd "D:\exam app\apps\exam-runtime" && npx jest`
Expected: all suites pass — `AttemptService`'s existing tests construct it directly via `Test.createTestingModule` with mocked providers, so this module-wiring change doesn't affect them.

- [ ] **Step 9: Commit**

```bash
git add apps/exam-runtime/src/code-execution apps/exam-runtime/src/attempts/attempt.module.ts
git commit -m "feat: dynamic Piston runtime discovery service"
```

---

### Task 3: Internal + candidate GET language-list endpoints

**Files:**
- Modify: `apps/exam-runtime/src/internal/internal.controller.ts`
- Modify: `apps/exam-runtime/src/internal/internal.module.ts`
- Test: `apps/exam-runtime/src/internal/internal.controller.spec.ts`
- Modify: `apps/exam-runtime/src/attempts/attempt.controller.ts`
- Modify: `apps/exam-runtime/src/attempts/attempt.service.ts`
- Test: `apps/exam-runtime/src/attempts/attempt.service.spec.ts`
- Modify: `apps/api/src/exam-runtime-client/exam-runtime-internal.client.ts`
- Test: `apps/api/src/exam-runtime-client/exam-runtime-internal.client.spec.ts`

**Interfaces:**
- Consumes: `PistonRuntimesService.getAvailableLanguages()` from Task 2.
- Produces: `GET /api/v1/internal/code-execution/languages` (exam-runtime) returning `{ languages: {language: string; version: string}[] }`; `GET /attempt/code-languages` (candidate) returning the same shape; `ExamRuntimeInternalClient.listAvailableLanguages(): Promise<{languages: {language: string; version: string}[]}>` — Task 4 (apps/api question authoring) calls this client method directly.

- [ ] **Step 1: Write the failing `InternalController` test**

Add to `apps/exam-runtime/src/internal/internal.controller.spec.ts` (read the file first to match its exact mock-setup convention for constructing the controller and its other injected services):

```ts
  it('lists available code-execution languages from PistonRuntimesService', async () => {
    pistonRuntimes.getAvailableLanguages.mockResolvedValue([{ language: 'python', version: '3.10.0' }]);

    const result = await controller.listCodeLanguages();

    expect(result).toEqual({ languages: [{ language: 'python', version: '3.10.0' }] });
  });
```

Add `pistonRuntimes: { getAvailableLanguages: jest.Mock }` to this file's mock declarations and pass `{ provide: PistonRuntimesService, useValue: pistonRuntimes }` into the `Test.createTestingModule` providers list, mirroring how the file already provides mocks for `AttemptSettlementService`/`AttemptAnalysisService`/etc.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd "D:\exam app\apps\exam-runtime" && npx jest internal/internal.controller.spec.ts`
Expected: FAIL — `controller.listCodeLanguages` is not a function, and `PistonRuntimesService` isn't a recognized provider token in the test module yet.

- [ ] **Step 3: Add the internal route**

In `apps/exam-runtime/src/internal/internal.controller.ts`, add the import:

```ts
import { PistonRuntimesService } from '../code-execution/piston-runtimes.service';
```

Add `PistonRuntimesService` to the constructor's injected dependencies (after `codeReviewService`):

```ts
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly attemptSettlement: AttemptSettlementService,
    private readonly attemptAnalysis: AttemptAnalysisService,
    private readonly attemptInsight: AttemptInsightService,
    private readonly codeReviewService: CodeReviewService,
    private readonly pistonRuntimes: PistonRuntimesService,
    @Inject(ATTEMPT_STATUS_BROADCASTER) private readonly broadcaster: AttemptStatusBroadcaster,
  ) {}
```

Add a new endpoint, and import `Get` alongside the file's existing `@nestjs/common` imports:

```ts
  @Get('code-execution/languages')
  async listCodeLanguages() {
    const languages = await this.pistonRuntimes.getAvailableLanguages();
    return { languages };
  }
```

- [ ] **Step 4: Wire `CodeExecutionModule` into `InternalModule`**

Replace the full contents of `apps/exam-runtime/src/internal/internal.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { GradingModule } from '../grading/grading.module';
import { ProctoringAnalysisModule } from '../proctoring-analysis/proctoring-analysis.module';
import { AttemptInsightModule } from '../attempt-insight/attempt-insight.module';
import { CodeReviewModule } from '../code-review/code-review.module';
import { CodeExecutionModule } from '../code-execution/code-execution.module';
import { InternalController } from './internal.controller';

// No MonitoringModule import — this app has no real MonitoringGateway/WebSocket
// connections of its own. ATTEMPT_STATUS_BROADCASTER (used by InternalController
// and, transitively, AttemptSettlementService inside GradingModule) is supplied
// globally by RemoteMonitoringBridgeModule at the InternalAppModule level.
@Module({
  imports: [GradingModule, ProctoringAnalysisModule, AttemptInsightModule, CodeReviewModule, CodeExecutionModule],
  controllers: [InternalController],
})
export class InternalModule {}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd "D:\exam app\apps\exam-runtime" && npx jest internal/internal.controller.spec.ts`
Expected: all tests pass, including the new one.

- [ ] **Step 6: Write the failing `AttemptService.getCodeLanguages` test**

Add to `apps/exam-runtime/src/attempts/attempt.service.spec.ts` (find the `describe('runCode', ...)` block or create a new top-level `describe('getCodeLanguages', ...)`, matching the file's existing `pistonClient`/service-construction mock convention — read the file's top-of-file `beforeEach` first):

```ts
  describe('getCodeLanguages', () => {
    it('returns the live Piston language list', async () => {
      pistonRuntimes.getAvailableLanguages.mockResolvedValue([{ language: 'python', version: '3.10.0' }]);

      const result = await service.getCodeLanguages();

      expect(result).toEqual({ languages: [{ language: 'python', version: '3.10.0' }] });
    });
  });
```

Add `pistonRuntimes: { getAvailableLanguages: jest.Mock, resolveLanguage: jest.Mock }` to this file's mock declarations (the `resolveLanguage` mock is unused until Task 5 but declare it now so Task 5 doesn't need to re-touch this setup block), and provide it alongside the existing `pistonClient`/`runLimiter` mocks in `Test.createTestingModule`.

- [ ] **Step 7: Run the test to verify it fails**

Run: `cd "D:\exam app\apps\exam-runtime" && npx jest attempts/attempt.service.spec.ts -t "getCodeLanguages"`
Expected: FAIL — `service.getCodeLanguages` is not a function.

- [ ] **Step 8: Implement `AttemptService.getCodeLanguages` and inject `PistonRuntimesService`**

In `apps/exam-runtime/src/attempts/attempt.service.ts`, add the import:

```ts
import { PistonRuntimesService } from '../code-execution/piston-runtimes.service';
```

Add `PistonRuntimesService` to the constructor (after `pistonClient`):

```ts
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly attemptSettlement: AttemptSettlementService,
    private readonly monitoringGateway: MonitoringGateway,
    private readonly pistonClient: PistonClient,
    private readonly pistonRuntimes: PistonRuntimesService,
    private readonly runLimiter: RunLimiter,
    private readonly leaderboardService: LeaderboardService,
    private readonly audit: AuditService,
  ) {}
```

Add a new public method, directly after `getCurrent`:

```ts
  async getCodeLanguages(): Promise<{ languages: { language: string; version: string }[] }> {
    const languages = await this.pistonRuntimes.getAvailableLanguages();
    return { languages };
  }
```

- [ ] **Step 9: Run the test to verify it passes**

Run: `cd "D:\exam app\apps\exam-runtime" && npx jest attempts/attempt.service.spec.ts`
Expected: all tests pass, including the new one. (Existing tests are unaffected — `pistonRuntimes` is a new, separately-provided mock that nothing else references yet.)

- [ ] **Step 10: Add the candidate route**

In `apps/exam-runtime/src/attempts/attempt.controller.ts`, add a new endpoint directly after `getLeaderboard`:

```ts
  @Get('code-languages')
  getCodeLanguages() {
    return this.attemptService.getCodeLanguages();
  }
```

- [ ] **Step 11: Write the failing `ExamRuntimeInternalClient` test**

Add to `apps/api/src/exam-runtime-client/exam-runtime-internal.client.spec.ts` (mirror the existing `forceSubmit` test's fetch-mock setup):

```ts
  it('listAvailableLanguages GETs the internal languages endpoint and returns the parsed result', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ languages: [{ language: 'python', version: '3.10.0' }] }),
    });

    const result = await client.listAvailableLanguages();

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/internal/code-execution/languages'),
      expect.objectContaining({ method: 'GET' }),
    );
    expect(result).toEqual({ languages: [{ language: 'python', version: '3.10.0' }] });
  });
```

- [ ] **Step 12: Run the client test to verify it fails**

Run: `cd "D:\exam app\apps\api" && npx jest exam-runtime-client/exam-runtime-internal.client.spec.ts`
Expected: FAIL — `client.listAvailableLanguages` is not a function.

- [ ] **Step 13: Implement the client method**

In `apps/api/src/exam-runtime-client/exam-runtime-internal.client.ts`, add a new interface near the top (after `FinalizeManualGradeResult`):

```ts
interface ListAvailableLanguagesResult {
  languages: { language: string; version: string }[];
}
```

Add a new method, directly after `notifyMessageSent`:

```ts
  async listAvailableLanguages(): Promise<ListAvailableLanguagesResult> {
    const response = await this.fetchWithTimeout(`${this.baseUrl()}/api/v1/internal/code-execution/languages`, {
      method: 'GET',
      headers: this.headers(),
    });
    await this.throwIfNotOk(response);
    return response.json();
  }
```

- [ ] **Step 14: Run the client test to verify it passes**

Run: `cd "D:\exam app\apps\api" && npx jest exam-runtime-client/exam-runtime-internal.client.spec.ts`
Expected: all tests pass.

- [ ] **Step 15: Run both full suites**

```bash
cd "D:\exam app\apps\exam-runtime" && npx jest
cd "D:\exam app\apps\api" && npx jest
```

Expected: both green.

- [ ] **Step 16: Commit**

```bash
git add apps/exam-runtime/src/internal apps/exam-runtime/src/attempts/attempt.controller.ts apps/exam-runtime/src/attempts/attempt.service.ts apps/exam-runtime/src/attempts/attempt.service.spec.ts apps/api/src/exam-runtime-client
git commit -m "feat: internal + candidate GET endpoints for the live code-language list"
```

---

### Task 4: apps/api question authoring — DTOs, validation, service, recruiter GET endpoint

**Files:**
- Modify: `apps/api/src/questions/question-validation.ts`
- Test: `apps/api/src/questions/question-validation.spec.ts`
- Modify: `apps/api/src/questions/dto/create-question.dto.ts`
- Modify: `apps/api/src/questions/questions.service.ts`
- Test: `apps/api/src/questions/questions.service.spec.ts`
- Modify: `apps/api/src/questions/questions.controller.ts`
- Modify: `apps/api/src/questions/questions.module.ts`

**Interfaces:**
- Consumes: `Question.languageMode`/`allowedLanguages` from Task 1; `ExamRuntimeInternalClient.listAvailableLanguages()` from Task 3.
- Produces: `CreateQuestionDto`/`UpdateQuestionDto` accept `languageMode?: 'fixed' | 'any'`, `allowedLanguages?: string[]` (no more `codeLanguage`); `validateQuestionPayload(input, availableLanguages: string[])` — the second parameter is new; `QuestionsService.listAvailableLanguages()`; new `GET /questions/code-languages` — Task 7 (recruiter authoring form) calls this endpoint directly by path.

- [ ] **Step 1: Write the failing validation tests**

In `apps/api/src/questions/question-validation.spec.ts`, replace the four existing `'code'`-related tests (the ones starting `'accepts a code question with zero options and a valid codeLanguage'` through `'rejects a code question with an unsupported codeLanguage'`) with:

```ts
  it('accepts a fixed-mode code question with zero options and an allowed language', () => {
    expect(() =>
      validateQuestionPayload(
        {
          type: 'code',
          difficulty: 'medium',
          marks: 10,
          negativeMarks: 0,
          options: [],
          languageMode: 'fixed',
          allowedLanguages: ['python'],
        },
        ['python', 'javascript'],
      ),
    ).not.toThrow();
  });

  it('accepts a fixed-mode code question with multiple allowed languages', () => {
    expect(() =>
      validateQuestionPayload(
        {
          type: 'code',
          difficulty: 'medium',
          marks: 10,
          negativeMarks: 0,
          options: [],
          languageMode: 'fixed',
          allowedLanguages: ['python', 'java'],
        },
        ['python', 'java', 'javascript'],
      ),
    ).not.toThrow();
  });

  it('accepts an any-mode code question with no allowedLanguages', () => {
    expect(() =>
      validateQuestionPayload(
        { type: 'code', difficulty: 'medium', marks: 10, negativeMarks: 0, options: [], languageMode: 'any' },
        ['python', 'javascript'],
      ),
    ).not.toThrow();
  });

  it('rejects a code question with any options', () => {
    expect(() =>
      validateQuestionPayload(
        {
          type: 'code',
          difficulty: 'medium',
          marks: 10,
          negativeMarks: 0,
          options: [{ text: 'irrelevant', isCorrect: false }],
          languageMode: 'fixed',
          allowedLanguages: ['python'],
        },
        ['python'],
      ),
    ).toThrow('code questions must not have options');
  });

  it('rejects a code question with an unknown languageMode', () => {
    expect(() =>
      validateQuestionPayload(
        { type: 'code', difficulty: 'medium', marks: 10, negativeMarks: 0, options: [], languageMode: 'sometimes' },
        ['python'],
      ),
    ).toThrow('Unknown languageMode');
  });

  it('rejects a fixed-mode code question with no allowedLanguages', () => {
    expect(() =>
      validateQuestionPayload(
        { type: 'code', difficulty: 'medium', marks: 10, negativeMarks: 0, options: [], languageMode: 'fixed', allowedLanguages: [] },
        ['python'],
      ),
    ).toThrow('Fixed-mode code questions must specify at least one allowed language');
  });

  it('rejects a fixed-mode code question with a language not on the live Piston list', () => {
    expect(() =>
      validateQuestionPayload(
        { type: 'code', difficulty: 'medium', marks: 10, negativeMarks: 0, options: [], languageMode: 'fixed', allowedLanguages: ['cobol'] },
        ['python', 'javascript'],
      ),
    ).toThrow('Unsupported language(s): cobol');
  });

  it('rejects an any-mode code question that also specifies allowedLanguages', () => {
    expect(() =>
      validateQuestionPayload(
        { type: 'code', difficulty: 'medium', marks: 10, negativeMarks: 0, options: [], languageMode: 'any', allowedLanguages: ['python'] },
        ['python'],
      ),
    ).toThrow('Any-mode code questions must not specify allowedLanguages');
  });
```

Leave every non-`code` test in this file (single_mcq/multi_mcq/true_false cases) exactly as they are — they call `validateQuestionPayload` with only one argument, which must keep working (the new second parameter needs a default).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd "D:\exam app\apps\api" && npx jest questions/question-validation.spec.ts`
Expected: FAIL — `codeLanguage` is still the only recognized field, `languageMode`/`allowedLanguages` are ignored, and the old codeLanguage-shaped tests you just removed are gone so their absence itself isn't a failure, but the new tests fail against current behavior.

- [ ] **Step 3: Implement the new `'code'` validation branch**

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
  languageMode?: string;
  allowedLanguages?: string[];
}

const VALID_TYPES = ['single_mcq', 'multi_mcq', 'true_false', 'code'];
const VALID_DIFFICULTIES = ['easy', 'medium', 'hard'];
// Purely a cosmetic label list for the QCIC feature's decorative `snippetLanguage` field
// (shown as plain text above a read-only <pre> block, no execution, no highlighting) — NOT
// related to the Code Run Execution feature's actual language capability, which is now driven
// entirely by the live Piston runtime list passed into validateQuestionPayload below.
export const VALID_CODE_LANGUAGES = ['javascript', 'typescript', 'python', 'java', 'csharp', 'cpp', 'go', 'ruby'];

export function validateQuestionPayload(input: QuestionValidationInput, availableLanguages: string[] = []): void {
  const { type, difficulty, marks, negativeMarks, options, languageMode, allowedLanguages } = input;

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
    if (languageMode !== 'fixed' && languageMode !== 'any') {
      throw new BadRequestException(`Unknown languageMode: ${languageMode}`);
    }
    if (languageMode === 'fixed') {
      if (!allowedLanguages || allowedLanguages.length === 0) {
        throw new BadRequestException('Fixed-mode code questions must specify at least one allowed language');
      }
      const unsupported = allowedLanguages.filter((lang) => !availableLanguages.includes(lang));
      if (unsupported.length > 0) {
        throw new BadRequestException(`Unsupported language(s): ${unsupported.join(', ')}`);
      }
    } else if (allowedLanguages && allowedLanguages.length > 0) {
      throw new BadRequestException('Any-mode code questions must not specify allowedLanguages');
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

Run: `cd "D:\exam app\apps\api" && npx jest questions/question-validation.spec.ts`
Expected: all tests pass.

- [ ] **Step 5: Update `CreateQuestionDto`**

In `apps/api/src/questions/dto/create-question.dto.ts`, replace the `codeLanguage` field (keep `starterCode`/`allowStdin`/the snippet fields exactly as they are):

```ts
  @IsOptional()
  @IsIn(['fixed', 'any'])
  languageMode?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedLanguages?: string[];

  @IsOptional()
  @IsString()
  starterCode?: string;

  @IsOptional()
  @IsBoolean()
  allowStdin?: boolean;
```

(This replaces the old `@IsOptional() @IsIn(VALID_CODE_LANGUAGES) codeLanguage?: string;` block — `VALID_CODE_LANGUAGES` is still imported and still used a few lines below for `snippetLanguage`, so keep that import.)

- [ ] **Step 6: Write the failing service tests**

In `apps/api/src/questions/questions.service.spec.ts`, replace the existing `'creates a code question with zero options and persists codeLanguage/starterCode'` test and the `'passes allowStdin through to the created question'` test's setup with the new shape, and add new cases. First, add a helper near the top of the `describe('QuestionsService', ...)` block (after the existing `tenantPrisma`/`jobsService` mock declarations) for the new `ExamRuntimeInternalClient` mock:

```ts
  let examRuntime: { listAvailableLanguages: jest.Mock };
```

Update the `beforeEach`'s `Test.createTestingModule` call to also provide it:

```ts
    examRuntime = { listAvailableLanguages: jest.fn().mockResolvedValue({ languages: [{ language: 'javascript', version: '18.15.0' }, { language: 'python', version: '3.10.0' }] }) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        QuestionsService,
        { provide: TenantPrismaService, useValue: tenantPrisma },
        { provide: JobsService, useValue: jobsService },
        { provide: ExamRuntimeInternalClient, useValue: examRuntime },
      ],
    }).compile();
```

Add the import at the top of the file: `import { ExamRuntimeInternalClient } from '../exam-runtime-client/exam-runtime-internal.client';`

Replace the existing code-question create test:

```ts
  it('creates a fixed-mode code question with one language and persists languageMode/allowedLanguages/starterCode', async () => {
    const codeDto = {
      type: 'code',
      text: 'Write a function that reverses a string.',
      difficulty: 'medium',
      marks: 10,
      languageMode: 'fixed',
      allowedLanguages: ['javascript'],
      starterCode: 'function reverse(str) {\n  \n}',
      options: [],
    };
    const created = { id: 'q-1', organizationId: 'org-1', ...codeDto, allowedLanguages: JSON.stringify(['javascript']), tags: [] };
    const questionCreate = jest.fn().mockResolvedValue(created);
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn({ tag: { upsert: jest.fn() }, question: { create: questionCreate } }));

    const result = await service.create(context, 'user-1', codeDto);

    expect(result.type).toBe('code');
    expect(result.options).toEqual([]);
    expect(examRuntime.listAvailableLanguages).toHaveBeenCalled();
    expect(questionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          languageMode: 'fixed',
          allowedLanguages: JSON.stringify(['javascript']),
          starterCode: 'function reverse(str) {\n  \n}',
        }),
      }),
    );
  });

  it('creates an any-mode code question without fetching languages for validation of allowedLanguages, but still stores languageMode', async () => {
    const codeDto = {
      type: 'code',
      text: 'Solve this in any language.',
      difficulty: 'hard',
      marks: 15,
      languageMode: 'any',
      options: [],
    };
    const created = { id: 'q-2', organizationId: 'org-1', ...codeDto, allowedLanguages: null, tags: [] };
    const questionCreate = jest.fn().mockResolvedValue(created);
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn({ tag: { upsert: jest.fn() }, question: { create: questionCreate } }));

    const result = await service.create(context, 'user-1', codeDto);

    expect(result.type).toBe('code');
    expect(questionCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ languageMode: 'any', allowedLanguages: null }) }),
    );
  });

  it('rejects creating a fixed-mode code question with a language the live Piston list does not have', async () => {
    const codeDto = {
      type: 'code',
      text: 'x',
      difficulty: 'easy',
      marks: 5,
      languageMode: 'fixed',
      allowedLanguages: ['cobol'],
      options: [],
    };

    await expect(service.create(context, 'user-1', codeDto)).rejects.toThrow(BadRequestException);
    expect(tenantPrisma.forTenant).not.toHaveBeenCalled();
  });
```

(Read the rest of the file first — if `'passes allowStdin through to the created question'` or any other pre-existing test constructs a code-type DTO using the old `codeLanguage` field, update it to the new `languageMode`/`allowedLanguages` shape following the pattern above, rather than leaving it broken.)

- [ ] **Step 7: Run the tests to verify they fail**

Run: `cd "D:\exam app\apps\api" && npx jest questions/questions.service.spec.ts`
Expected: FAIL — `ExamRuntimeInternalClient` isn't injected into `QuestionsService` yet, `languageMode`/`allowedLanguages` aren't read from the DTO.

- [ ] **Step 8: Wire `languageMode`/`allowedLanguages` through `QuestionsService`**

In `apps/api/src/questions/questions.service.ts`, add the import:

```ts
import { ExamRuntimeInternalClient } from '../exam-runtime-client/exam-runtime-internal.client';
```

Add `ExamRuntimeInternalClient` to the constructor:

```ts
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly jobsService: JobsService,
    private readonly examRuntime: ExamRuntimeInternalClient,
  ) {}
```

Add a private helper, directly above `create`:

```ts
  private async fetchAvailableLanguagesIfNeeded(type: string, languageMode: string | undefined): Promise<string[]> {
    if (type !== 'code' || languageMode !== 'fixed') {
      return [];
    }
    const { languages } = await this.examRuntime.listAvailableLanguages();
    return languages.map((entry) => entry.language);
  }
```

Replace `create`'s `validateQuestionPayload` call and its `tx.question.create` data block:

```ts
  async create(context: TenantContext, userId: string, dto: CreateQuestionDto): Promise<QuestionResponse> {
    const availableLanguages = await this.fetchAvailableLanguagesIfNeeded(dto.type, dto.languageMode);
    validateQuestionPayload(
      {
        type: dto.type,
        difficulty: dto.difficulty,
        marks: dto.marks,
        negativeMarks: dto.negativeMarks ?? 0,
        options: dto.options,
        languageMode: dto.languageMode,
        allowedLanguages: dto.allowedLanguages,
      },
      availableLanguages,
    );

    const question = await this.tenantPrisma.forTenant(context, async (tx) => {
      const tagIds = await this.resolveTagIds(tx, context.organizationId as string, dto.tags ?? []);
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
          languageMode: dto.languageMode ?? 'fixed',
          allowedLanguages: dto.allowedLanguages ? JSON.stringify(dto.allowedLanguages) : null,
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
    });
    return this.toResponse(question as QuestionWithRelations);
  }
```

Apply the identical two changes to `update` (same `fetchAvailableLanguagesIfNeeded`/`validateQuestionPayload` shape, same `languageMode`/`allowedLanguages` lines in the `tx.question.update` data block, in place of the old `codeLanguage: dto.codeLanguage,` line):

```ts
  async update(context: TenantContext, id: string, dto: UpdateQuestionDto): Promise<QuestionResponse> {
    const availableLanguages = await this.fetchAvailableLanguagesIfNeeded(dto.type, dto.languageMode);
    validateQuestionPayload(
      {
        type: dto.type,
        difficulty: dto.difficulty,
        marks: dto.marks,
        negativeMarks: dto.negativeMarks ?? 0,
        options: dto.options,
        languageMode: dto.languageMode,
        allowedLanguages: dto.allowedLanguages,
      },
      availableLanguages,
    );

    return this.tenantPrisma.forTenant(context, async (tx) => {
      const existing = await tx.question.findFirst({ where: { id, organizationId: context.organizationId as string } });
      if (!existing) {
        throw new NotFoundException(`Question ${id} not found`);
      }

      const tagIds = await this.resolveTagIds(tx, context.organizationId as string, dto.tags ?? []);

      await tx.questionOption.deleteMany({ where: { questionId: id } });
      await tx.questionTag.deleteMany({ where: { questionId: id } });

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
          languageMode: dto.languageMode ?? 'fixed',
          allowedLanguages: dto.allowedLanguages ? JSON.stringify(dto.allowedLanguages) : null,
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
      return this.toResponse(updated as QuestionWithRelations);
    });
  }
```

Add a new public method, directly after `uploadImage`:

```ts
  async listAvailableLanguages(): Promise<{ language: string; version: string }[]> {
    const { languages } = await this.examRuntime.listAvailableLanguages();
    return languages;
  }
```

In `bulkUpload`, replace the two `codeLanguage: row.codeLanguage,` references (one in the `validateQuestionPayload` call, one in the `tx.question.create` data block) — the CSV column name `codeLanguage` on `BulkQuestionRow` stays unchanged (it's the external file format, not touched by this plan), but a bulk-uploaded code row now maps to Fixed mode with that one language:

```ts
    const availableLanguages = validRows.some((row) => row.type === 'code')
      ? (await this.examRuntime.listAvailableLanguages()).languages.map((entry) => entry.language)
      : [];
```

(Insert this line once, before the `for (const row of rows)` validation loop, replacing the per-row need to refetch.) Then inside that same loop's `validateQuestionPayload` call:

```ts
        validateQuestionPayload(
          {
            type: row.type,
            difficulty: row.difficulty,
            marks: row.marks,
            negativeMarks: row.negativeMarks,
            options: row.options,
            languageMode: row.type === 'code' ? 'fixed' : undefined,
            allowedLanguages: row.type === 'code' && row.codeLanguage ? [row.codeLanguage] : undefined,
          },
          availableLanguages,
        );
```

And in the `tx.question.create` data block inside the creation loop:

```ts
            languageMode: row.type === 'code' ? 'fixed' : 'fixed',
            allowedLanguages: row.type === 'code' && row.codeLanguage ? JSON.stringify([row.codeLanguage]) : null,
```

(Read the actual current `bulkUpload` method in full before editing — confirm the exact surrounding lines match what's shown here, since the file may have shifted since this brief was written, and apply these three changes in their real locations.)

- [ ] **Step 9: Run the tests to verify they pass**

Run: `cd "D:\exam app\apps\api" && npx jest questions/questions.service.spec.ts`
Expected: all tests pass, including the 3 new ones.

- [ ] **Step 10: Add the recruiter-facing GET endpoint**

In `apps/api/src/questions/questions.controller.ts`, add a new endpoint directly after `list` and before `findOne` (placement matters — `code-languages` is a literal path segment and must be declared before the `:id` param route so Nest matches it correctly):

```ts
  @Get('code-languages')
  @RequirePermissions('question_bank:manage')
  listCodeLanguages() {
    return this.questionsService.listAvailableLanguages();
  }
```

- [ ] **Step 11: Wire `ExamRuntimeClientModule` into `QuestionsModule`**

Replace the full contents of `apps/api/src/questions/questions.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { QuestionsController } from './questions.controller';
import { QuestionsService } from './questions.service';
import { TagsController } from './tags.controller';
import { TagsService } from './tags.service';
import { JobsModule } from '../jobs/jobs.module';
import { ExamRuntimeClientModule } from '../exam-runtime-client/exam-runtime-client.module';

@Module({
  imports: [JobsModule, ExamRuntimeClientModule],
  controllers: [QuestionsController, TagsController],
  providers: [QuestionsService, TagsService],
  exports: [QuestionsService],
})
export class QuestionsModule {}
```

- [ ] **Step 12: Run the full questions test suite**

Run: `cd "D:\exam app\apps\api" && npx jest questions/`
Expected: all suites pass.

- [ ] **Step 13: Commit**

```bash
git add apps/api/src/questions apps/api/src/exam-runtime-client
git commit -m "feat: recruiter-facing fixed/any language authoring surface"
```

---

### Task 5: exam-runtime execution — runCode/answer language validation + candidate exposure

**Files:**
- Modify: `apps/exam-runtime/src/attempts/dto/run-code.dto.ts`
- Modify: `apps/exam-runtime/src/attempts/dto/answer.dto.ts`
- Modify: `apps/exam-runtime/src/attempts/attempt.service.ts`
- Test: `apps/exam-runtime/src/attempts/attempt.service.spec.ts`

**Interfaces:**
- Consumes: `PistonRuntimesService.resolveLanguage()` from Task 2 (already injected into `AttemptService` in Task 3).
- Produces: `AttemptQuestion` gains `languageMode: string`, `allowedLanguages: string[]` (replacing `codeLanguage`); `AttemptAnswerSummary` gains `codeLanguage: string | null`; `RunCodeDto.codeLanguage: string` (required); `AnswerDto.codeLanguage?: string` — Task 8 (candidate frontend) consumes these exact field names.

- [ ] **Step 1: Update the DTOs**

Replace the full contents of `apps/exam-runtime/src/attempts/dto/run-code.dto.ts`:

```ts
import { IsOptional, IsString } from 'class-validator';

export class RunCodeDto {
  @IsString()
  questionId!: string;

  @IsString()
  code!: string;

  @IsString()
  codeLanguage!: string;

  @IsOptional()
  @IsString()
  stdin?: string;
}
```

In `apps/exam-runtime/src/attempts/dto/answer.dto.ts`, add one field to `AnswerDto`, directly after `answerText`:

```ts
  @IsOptional()
  @IsString()
  codeLanguage?: string;
```

- [ ] **Step 2: Write the failing tests**

Read `apps/exam-runtime/src/attempts/attempt.service.spec.ts`'s existing `'includes codeLanguage and starterCode for a code question...'` test (in the `getCurrent`/`loadSections` describe area) and the `runCode` describe block's `codeQuestion` fixture (`{ id: 'q-code-1', type: 'code', codeLanguage: 'python', allowStdin: false }`) in full before writing anything — every fixture in this file that sets `codeLanguage` on a mock question needs to change to the new shape (`languageMode: 'fixed', allowedLanguages: '["python"]'` — stored as a JSON string, matching how Prisma actually returns it) since `AttemptQuestion`/the mapping code no longer reads `codeLanguage` at all.

Replace the existing `'includes codeLanguage and starterCode for a code question...'` test with:

```ts
    it('includes languageMode and allowedLanguages for a code question so the candidate can pick a language', async () => {
      const attempt = {
        id: 'attempt-1', status: 'in_progress', startedAt: new Date(),
        questionOrderJson: JSON.stringify(['code-q1']),
        sectionSnapshotJson: JSON.stringify([{ sectionId: 'section-1', title: 'Section One', targetDurationMinutes: null, questionIds: ['code-q1'] }]),
        optionOrderJson: null,
      };
      const tx = {
        attempt: { findUnique: jest.fn().mockResolvedValue(attempt) },
        question: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'code-q1', text: 'Reverse a string', type: 'code', marks: 10,
              languageMode: 'fixed', allowedLanguages: JSON.stringify(['python', 'java']),
              starterCode: 'def reverse(s):\n    pass', allowStdin: true,
              snippetCode: null, snippetLanguage: null, imageUrl: null,
              options: [],
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
        id: 'code-q1', text: 'Reverse a string', type: 'code', marks: 10,
        languageMode: 'fixed', allowedLanguages: ['python', 'java'],
        starterCode: 'def reverse(s):\n    pass', allowStdin: true,
        snippetCode: null, snippetLanguage: null, imageUrl: null,
        options: [],
      });
    });

    it('reports an empty allowedLanguages array for an any-mode code question', async () => {
      const attempt = {
        id: 'attempt-1', status: 'in_progress', startedAt: new Date(),
        questionOrderJson: JSON.stringify(['code-q2']),
        sectionSnapshotJson: JSON.stringify([{ sectionId: 'section-1', title: 'Section One', targetDurationMinutes: null, questionIds: ['code-q2'] }]),
        optionOrderJson: null,
      };
      const tx = {
        attempt: { findUnique: jest.fn().mockResolvedValue(attempt) },
        question: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'code-q2', text: 'Solve in any language', type: 'code', marks: 15,
              languageMode: 'any', allowedLanguages: null,
              starterCode: null, allowStdin: false,
              snippetCode: null, snippetLanguage: null, imageUrl: null,
              options: [],
            },
          ]),
        },
      };
      const session = { invitationId: 'inv-1' };
      settlement.settleIfExpired.mockResolvedValue(attempt);
      settlement.remainingSeconds.mockReturnValue(3300);
      mockBootstrapWithLogoThenScoped(tx);

      const result = await service.getCurrent(session);

      expect((result as any).sections[0].questions[0].languageMode).toBe('any');
      expect((result as any).sections[0].questions[0].allowedLanguages).toEqual([]);
    });
```

(Match this file's exact `session`/`settlement`/`mockBootstrapWithLogoThenScoped` identifiers — read the file first rather than assuming these names if they differ.)

Update the `runCode` describe block's `codeQuestion` fixture and add new run-code tests. Find `const codeQuestion = { id: 'q-code-1', type: 'code', codeLanguage: 'python', allowStdin: false };` and replace it with:

```ts
    const codeQuestion = { id: 'q-code-1', type: 'code', languageMode: 'fixed', allowedLanguages: JSON.stringify(['python']), allowStdin: false };
```

Every existing `runCode` test that calls `service.runCode(session, { questionId: 'q-code-1', code: '...', stdin: ... })` needs `codeLanguage: 'python'` added to the DTO argument (since it's now a required field) — read each existing test in this describe block and add it. Add these new test cases:

```ts
    it('rejects a run with a language not in the question\'s allowedLanguages (fixed mode)', async () => {
      const tx = setupTx({ question: codeQuestion });
      settlement.settleIfExpired.mockResolvedValue({ id: 'attempt-1', status: 'in_progress', questionOrderJson: JSON.stringify(['q-code-1']) });
      mockBootstrapThenScoped(tx);
      runLimiter.checkAndIncrement.mockResolvedValue({ allowed: true, remaining: 29 });

      await expect(
        service.runCode(session, { questionId: 'q-code-1', code: 'x', codeLanguage: 'ruby' }),
      ).rejects.toThrow('ruby is not an allowed language for this question');
    });

    it('resolves the language via PistonRuntimesService instead of a static map', async () => {
      const tx = setupTx({ question: codeQuestion });
      settlement.settleIfExpired.mockResolvedValue({ id: 'attempt-1', status: 'in_progress', questionOrderJson: JSON.stringify(['q-code-1']) });
      mockBootstrapThenScoped(tx);
      runLimiter.checkAndIncrement.mockResolvedValue({ allowed: true, remaining: 29 });
      pistonRuntimes.resolveLanguage.mockResolvedValue({ language: 'python', version: '3.10.0' });
      pistonClient.execute.mockResolvedValue({ stdout: 'ok', stderr: '', exitCode: 0, compileError: null, timedOut: false });

      await service.runCode(session, { questionId: 'q-code-1', code: 'print(1)', codeLanguage: 'python' });

      expect(pistonRuntimes.resolveLanguage).toHaveBeenCalledWith('python');
      expect(pistonClient.execute).toHaveBeenCalledWith(expect.objectContaining({ language: 'python', version: '3.10.0' }));
    });

    it('allows any language for an any-mode question as long as Piston resolves it', async () => {
      const anyModeQuestion = { id: 'q-code-2', type: 'code', languageMode: 'any', allowedLanguages: null, allowStdin: false };
      const tx = setupTx({ question: anyModeQuestion });
      settlement.settleIfExpired.mockResolvedValue({ id: 'attempt-1', status: 'in_progress', questionOrderJson: JSON.stringify(['q-code-2']) });
      mockBootstrapThenScoped(tx);
      runLimiter.checkAndIncrement.mockResolvedValue({ allowed: true, remaining: 29 });
      pistonRuntimes.resolveLanguage.mockResolvedValue({ language: 'rust', version: '1.68.0' });
      pistonClient.execute.mockResolvedValue({ stdout: 'ok', stderr: '', exitCode: 0, compileError: null, timedOut: false });

      const result = await service.runCode(session, { questionId: 'q-code-2', code: 'fn main() {}', codeLanguage: 'rust' });

      expect(result.stdout).toBe('ok');
    });
```

(Match this describe block's exact `setupTx`/`mockBootstrapThenScoped`/`session`/`runLimiter`/`pistonClient` identifiers — read the actual current test file for the real names before inserting; add `pistonRuntimes: { getAvailableLanguages: jest.Mock; resolveLanguage: jest.Mock }` to the top-level mock declarations if Task 3's step 6 didn't already add it to this file's shared setup.)

Finally, add one test for `answer()` persisting `codeLanguage`:

```ts
  it('persists the candidate\'s chosen codeLanguage on a code answer', async () => {
    const result = await service.answer(session, { questionId: 'code-question-1', selectedOptionIds: [], answerText: 'print(1)', codeLanguage: 'python' });

    expect(result.answerText).toBe('print(1)');
  });
```

(Read the existing `answer()` describe block's fixture for `'code-question-1'` — mirror its exact `tx.question.findFirstOrThrow` mock shape, updating it from the old `codeLanguage`-on-Question shape to `languageMode`/`allowedLanguages` if it sets those fields at all.)

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd "D:\exam app\apps\exam-runtime" && npx jest attempts/attempt.service.spec.ts`
Expected: FAIL — multiple tests fail on the old `codeLanguage` shape, missing `codeLanguage` in `RunCodeDto` calls, and `service.runCode`'s language resolution still uses the deleted `PISTON_LANGUAGE_MAP`.

- [ ] **Step 4: Implement the `AttemptQuestion`/`AttemptQuestionOption`/`AttemptAnswerSummary` interface changes**

In `apps/exam-runtime/src/attempts/attempt.service.ts`, replace the `AttemptQuestion` interface:

```ts
interface AttemptQuestion {
  id: string;
  text: string;
  type: string;
  marks: number;
  languageMode: string;
  allowedLanguages: string[];
  starterCode: string | null;
  allowStdin: boolean;
  snippetCode: string | null;
  snippetLanguage: string | null;
  imageUrl: string | null;
  options: AttemptQuestionOption[];
}
```

Replace the `AttemptAnswerSummary` interface:

```ts
interface AttemptAnswerSummary {
  questionId: string;
  selectedOptionIds: string[];
  answerText: string | null;
  codeLanguage: string | null;
  isMarkedForReview: boolean;
}
```

Remove the now-unused import `import { PISTON_LANGUAGE_MAP } from '../code-execution/piston-languages';`.

- [ ] **Step 5: Update `getCurrent()`'s answers mapping and `loadSections`'s question mapping**

In `getCurrent()`, update the `answers.map(...)` call:

```ts
        answers: answers.map((answer) => ({
          questionId: answer.questionId,
          selectedOptionIds: JSON.parse(answer.selectedOptionIdsJson),
          answerText: answer.answerText,
          codeLanguage: answer.codeLanguage,
          isMarkedForReview: answer.isMarkedForReview,
        })),
```

In `loadSections`, replace the question-mapping return object:

```ts
          return {
            id: question.id,
            text: question.text,
            type: question.type,
            marks: question.marks,
            languageMode: question.languageMode,
            allowedLanguages: question.allowedLanguages ? JSON.parse(question.allowedLanguages) : [],
            starterCode: question.starterCode,
            allowStdin: question.allowStdin,
            snippetCode: question.snippetCode,
            snippetLanguage: question.snippetLanguage,
            imageUrl: question.imageUrl,
            options: orderedOptions.map((option) => ({ id: option.id, text: option.text, imageUrl: option.imageUrl })),
          };
```

- [ ] **Step 6: Implement language validation + resolution in `runCode`, and persistence in `answer`**

Replace `runCode`'s body from the run-limiter check onward:

```ts
    const { allowed, remaining } = await this.runLimiter.checkAndIncrement(invitation.id, dto.questionId);
    if (!allowed) {
      throw new HttpException('You have used all 30 runs for this question', HttpStatus.TOO_MANY_REQUESTS);
    }

    this.validateChosenLanguage(question, dto.codeLanguage);
    const languageEntry = await this.pistonRuntimes.resolveLanguage(dto.codeLanguage);
    if (!languageEntry) {
      throw new BadRequestException(`Unsupported code language: ${dto.codeLanguage}`);
    }

    try {
      const result = await this.pistonClient.execute({
        language: languageEntry.language,
        version: languageEntry.version,
        code: dto.code,
        stdin: question.allowStdin ? dto.stdin : undefined,
      });
      return { ...result, runsRemaining: remaining };
    } catch (error) {
      this.logger.error(`Piston execute failed for question ${dto.questionId}`, error as Error);
      throw new HttpException(
        { error: 'sandbox_unavailable', message: "Couldn't run your code right now, try again." },
        HttpStatus.BAD_GATEWAY,
      );
    }
  }
```

Add a new private helper, directly after `runCode`:

```ts
  private validateChosenLanguage(question: { languageMode: string; allowedLanguages: string | null }, chosen: string): void {
    if (question.languageMode === 'fixed') {
      const allowed: string[] = question.allowedLanguages ? JSON.parse(question.allowedLanguages) : [];
      if (!allowed.includes(chosen)) {
        throw new BadRequestException(`${chosen} is not an allowed language for this question`);
      }
    }
  }
```

In `answer()`'s `question.type === 'code'` branch, add language validation and persist `codeLanguage`:

```ts
      if (question.type === 'code') {
        if (dto.codeLanguage) {
          this.validateChosenLanguage(question, dto.codeLanguage);
        }
        const telemetryPatch = dto.telemetry ? { telemetryJson: JSON.stringify(dto.telemetry) } : {};
        await tx.answer.upsert({
          where: { attemptId_questionId: { attemptId: settled.id, questionId: dto.questionId } },
          create: {
            attemptId: settled.id,
            questionId: dto.questionId,
            selectedOptionIdsJson: JSON.stringify([]),
            answerText: dto.answerText ?? null,
            codeLanguage: dto.codeLanguage ?? null,
            isMarkedForReview,
            ...telemetryPatch,
          },
          update: {
            answerText: dto.answerText ?? null,
            codeLanguage: dto.codeLanguage ?? null,
            isMarkedForReview,
            answeredAt: new Date(),
            ...telemetryPatch,
          },
        });
        return {
          response: { questionId: dto.questionId, selectedOptionIds: [], answerText: dto.answerText ?? null, isMarkedForReview },
          isAutoGradable: false,
        };
      }
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cd "D:\exam app\apps\exam-runtime" && npx jest attempts/attempt.service.spec.ts`
Expected: all tests pass.

- [ ] **Step 8: Run the full exam-runtime suite**

Run: `cd "D:\exam app\apps\exam-runtime" && npx jest`
Expected: all suites pass.

- [ ] **Step 9: Commit**

```bash
git add apps/exam-runtime/src/attempts
git commit -m "feat: dynamic language validation and resolution in code run/answer"
```

---

### Task 6: Downstream display consumers — grading queue + AI code review

**Files:**
- Modify: `apps/api/src/exams/exams.service.ts`
- Test: `apps/api/src/exams/exams.service.spec.ts`
- Modify: `apps/exam-runtime/src/code-review/code-review.service.ts`
- Test: `apps/exam-runtime/src/code-review/code-review.service.spec.ts`

**Interfaces:**
- Consumes: `Answer.codeLanguage` from Task 1 (populated by Task 5's `answer()`).
- Produces: nothing consumed by a later task — these are terminal display-only consumers.

- [ ] **Step 1: Write the failing test for the grading queue**

In `apps/api/src/exams/exams.service.spec.ts`, find the existing `getPendingGrading` test(s) and update the mock `answer` fixture to include a `codeLanguage` field directly on the answer (not on `answer.question`), then assert the returned row's `codeLanguage` matches it:

```ts
  it('reports the candidate\'s chosen codeLanguage from the Answer row, not the Question', async () => {
    const attempt = {
      id: 'attempt-1',
      invitation: { candidateId: 'cand-1', candidate: { name: 'Ada' } },
      answers: [
        {
          questionId: 'q-1',
          answerText: 'print(1)',
          codeLanguage: 'python',
          marksAwarded: null,
          gradingFeedback: null,
          question: { type: 'code', text: 'x', starterCode: null, marks: 10 },
        },
      ],
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) =>
      fn({ exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1' }) }, attempt: { findMany: jest.fn().mockResolvedValue([attempt]) } }),
    );

    const result = await service.getPendingGrading(context, 'exam-1');

    expect(result[0].codeQuestions[0].codeLanguage).toBe('python');
  });
```

(Read the file first to match its exact `tenantPrisma`/`context` mock conventions before inserting — adapt identifiers if they differ from this sketch.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd "D:\exam app\apps\api" && npx jest exams/exams.service.spec.ts -t "codeLanguage"`
Expected: FAIL — the current mapping reads `answer.question.codeLanguage`, which is `undefined` on this fixture.

- [ ] **Step 3: Switch the source field**

In `apps/api/src/exams/exams.service.ts`'s `getPendingGrading` method, change the one line:

```ts
            codeLanguage: answer.codeLanguage,
```

(replacing `codeLanguage: answer.question.codeLanguage,`).

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd "D:\exam app\apps\api" && npx jest exams/exams.service.spec.ts`
Expected: all tests pass.

- [ ] **Step 5: Write the failing test for the AI code review payload**

In `apps/exam-runtime/src/code-review/code-review.service.spec.ts`, find the existing test that asserts on `claudeCodeReviewClient.review`'s call arguments and update the mock `answer` fixture to set `codeLanguage` directly on the answer, then assert the review call receives it:

```ts
  it('sends the candidate\'s chosen codeLanguage (from the Answer, not the Question) to the review client', async () => {
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) =>
      fn({
        answer: {
          findUniqueOrThrow: jest.fn().mockResolvedValue({
            id: 'answer-1',
            answerText: 'print(1)',
            codeLanguage: 'python',
            question: { text: 'x', starterCode: null, marks: 10 },
            attempt: { invitation: { exam: { organizationId: 'org-1' } } },
          }),
        },
        codeAnswerReview: { upsert: jest.fn() },
        aiCreditUsage: { create: jest.fn() },
      }),
    );
    aiApiKeyResolver.resolve.mockResolvedValue('key');
    claudeCodeReviewClient.review.mockResolvedValue({ suggestedMarks: 5, summary: 'ok' });

    await service.analyze('answer-1');

    expect(claudeCodeReviewClient.review).toHaveBeenCalledWith(
      expect.objectContaining({ codeLanguage: 'python' }),
      'key',
    );
  });
```

(Read the file first to match its exact `tenantPrisma`/`aiApiKeyResolver`/`claudeCodeReviewClient` mock conventions before inserting.)

- [ ] **Step 6: Run the test to verify it fails**

Run: `cd "D:\exam app\apps\exam-runtime" && npx jest code-review/code-review.service.spec.ts -t "codeLanguage"`
Expected: FAIL — the current code reads `answer.question.codeLanguage`, which is `undefined` on this fixture.

- [ ] **Step 7: Switch the source field**

In `apps/exam-runtime/src/code-review/code-review.service.ts`'s `analyze` method, change the one line inside the `review()` call:

```ts
            codeLanguage: answer.codeLanguage ?? 'plaintext',
```

(replacing `codeLanguage: answer.question.codeLanguage ?? 'plaintext',`).

- [ ] **Step 8: Run the test to verify it passes**

Run: `cd "D:\exam app\apps\exam-runtime" && npx jest code-review/code-review.service.spec.ts`
Expected: all tests pass.

- [ ] **Step 9: Run both full suites**

```bash
cd "D:\exam app\apps\api" && npx jest
cd "D:\exam app\apps\exam-runtime" && npx jest
```

Expected: both green.

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/exams apps/exam-runtime/src/code-review
git commit -m "fix: grading queue and AI code review use the candidate's chosen language"
```

---

### Task 7: Recruiter authoring form — Fixed/Any toggle + multi-select

**Files:**
- Modify: `apps/web/lib/types.ts`
- Modify: `apps/web/lib/hooks/useQuestions.ts`
- Modify: `apps/web/components/QuestionForm.tsx`
- Test: `apps/web/components/QuestionForm.test.tsx`

**Interfaces:**
- Consumes: `GET /questions/code-languages` from Task 4.
- Produces: `Question`/`QuestionInput` gain `languageMode`/`allowedLanguages` (no more `codeLanguage`); new hook `useCodeLanguages(): UseQueryResult<{language: string; version: string}[]>` — Task 8 does not consume this hook (candidate side has its own).

- [ ] **Step 1: Update `apps/web/lib/types.ts`**

Replace the `Question` interface's `codeLanguage` field:

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
  languageMode: 'fixed' | 'any';
  allowedLanguages: string[];
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

(`CODE_LANGUAGE_OPTIONS`/`CodeLanguage` stay exactly as they are — they're still used by `Question.snippetLanguage`, an unrelated decorative field from a different feature.)

- [ ] **Step 2: Update `apps/web/lib/hooks/useQuestions.ts`**

Replace the `QuestionInput` interface's `codeLanguage` field:

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
  languageMode?: string;
  allowedLanguages?: string[];
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
export function useCodeLanguages() {
  const { accessToken } = useAuth();
  return useQuery<{ language: string; version: string }[]>({
    queryKey: ['questions', 'code-languages'],
    queryFn: () => apiFetch('/questions/code-languages', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
    staleTime: 60 * 60 * 1000,
  });
}
```

- [ ] **Step 3: Write the failing form tests**

Read `apps/web/components/QuestionForm.test.tsx` in full first to match its exact render/mock conventions (including how it mocks `../lib/hooks/useQuestions` for `useUploadQuestionImage`, established in a prior feature — extend that same `jest.mock` block to also provide `useCodeLanguages`). Add:

```tsx
  it('lets the recruiter pick Fixed mode with specific languages for a code question', async () => {
    const onSubmit = jest.fn();
    render(<QuestionForm tags={[]} onSubmit={onSubmit} submitLabel="Create" />);

    await userEvent.selectOptions(screen.getByLabelText('Question type'), 'code');
    fireEvent.change(screen.getByLabelText('Question text'), { target: { value: 'Reverse a string' } });
    fireEvent.click(await screen.findByLabelText('python'));
    fireEvent.click(screen.getByText('Create'));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ languageMode: 'fixed', allowedLanguages: ['python'] }),
    );
  });

  it('shows the starter code field only when exactly one fixed language is selected', async () => {
    render(<QuestionForm tags={[]} onSubmit={jest.fn()} submitLabel="Create" />);
    await userEvent.selectOptions(screen.getByLabelText('Question type'), 'code');

    expect(screen.queryByLabelText('Starter code')).not.toBeInTheDocument();

    fireEvent.click(await screen.findByLabelText('python'));
    expect(screen.getByLabelText('Starter code')).toBeInTheDocument();

    fireEvent.click(await screen.findByLabelText('java'));
    expect(screen.queryByLabelText('Starter code')).not.toBeInTheDocument();
  });

  it('lets the recruiter pick Any mode with no language selection required', async () => {
    const onSubmit = jest.fn();
    render(<QuestionForm tags={[]} onSubmit={onSubmit} submitLabel="Create" />);

    await userEvent.selectOptions(screen.getByLabelText('Question type'), 'code');
    fireEvent.change(screen.getByLabelText('Question text'), { target: { value: 'Solve in any language' } });
    await userEvent.selectOptions(screen.getByLabelText('Language mode'), 'any');
    fireEvent.click(screen.getByText('Create'));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ languageMode: 'any', allowedLanguages: undefined }));
  });
```

Mock `useCodeLanguages` to return a fixed test list, e.g. `{ data: [{ language: 'python', version: '3.10.0' }, { language: 'java', version: '15.0.2' }], isLoading: false }`, matching whatever mocking convention (`jest.mock` module factory vs. per-test `mockReturnValue`) the existing `useUploadQuestionImage` mock in this file already uses.

- [ ] **Step 4: Run the tests to verify they fail**

Run: `cd "D:\exam app\apps\web" && npx jest QuestionForm.test`
Expected: FAIL — no "Language mode" field, no per-language checkboxes exist yet.

- [ ] **Step 5: Replace the code-branch language UI**

In `apps/web/components/QuestionForm.tsx`, remove the `codeLanguage` state line and add two new pieces of state in its place:

```ts
  const [languageMode, setLanguageMode] = useState<'fixed' | 'any'>(initialQuestion?.languageMode ?? 'fixed');
  const [allowedLanguages, setAllowedLanguages] = useState<string[]>(initialQuestion?.allowedLanguages ?? []);
```

Add the import: `import { QuestionInput, useUploadQuestionImage, useCodeLanguages } from '../lib/hooks/useQuestions';` (replacing the existing import line).

Add near the top of the component body, after the existing state declarations:

```ts
  const codeLanguagesQuery = useCodeLanguages();
```

Replace `handleSubmit`'s `codeLanguage`/`starterCode` lines:

```ts
      languageMode: type === 'code' ? languageMode : undefined,
      allowedLanguages: type === 'code' && languageMode === 'fixed' ? allowedLanguages : undefined,
      starterCode: type === 'code' && languageMode === 'fixed' && allowedLanguages.length === 1 ? starterCode : undefined,
```

Replace the `type === 'code'` branch's JSX:

```tsx
      {type === 'code' ? (
        <div className="flex flex-col gap-2">
          <Select
            label="Language mode"
            value={languageMode}
            onChange={(value) => setLanguageMode(value as 'fixed' | 'any')}
            options={[
              { value: 'fixed', label: 'Fixed — choose specific languages' },
              { value: 'any', label: 'Any — every language the sandbox supports' },
            ]}
          />
          {languageMode === 'fixed' && (
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium text-gray-700">Allowed languages</span>
              {codeLanguagesQuery.isLoading ? (
                <span className="text-sm text-gray-500">Loading languages…</span>
              ) : (
                (codeLanguagesQuery.data ?? []).map((entry) => (
                  <Checkbox
                    key={entry.language}
                    label={entry.language}
                    checked={allowedLanguages.includes(entry.language)}
                    onChange={(checked) =>
                      setAllowedLanguages((current) =>
                        checked ? [...current, entry.language] : current.filter((lang) => lang !== entry.language),
                      )
                    }
                  />
                ))
              )}
            </div>
          )}
          {languageMode === 'fixed' && allowedLanguages.length === 1 && (
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
          )}
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={allowStdin}
              onChange={(e) => setAllowStdin(e.target.checked)}
              aria-label="Allow candidates to provide input (stdin)"
            />
            Allow candidates to provide input (stdin)
          </label>
        </div>
      ) : (
```

(Everything from `) : (` onward — the non-`code` branch with snippet/image/options fields — is untouched.)

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd "D:\exam app\apps\web" && npx jest QuestionForm.test`
Expected: all tests pass, including the 3 new ones.

- [ ] **Step 7: Run `tsc` to confirm no new type errors**

Run: `cd "D:\exam app\apps\web" && npx tsc --noEmit -p tsconfig.json`
Expected: no new errors versus the pre-existing baseline (confirm the count/files match before and after).

- [ ] **Step 8: Commit**

```bash
git add apps/web/lib/types.ts apps/web/lib/hooks/useQuestions.ts apps/web/components/QuestionForm.tsx apps/web/components/QuestionForm.test.tsx
git commit -m "feat: recruiter fixed/any language authoring UI"
```

---

### Task 8: Candidate exam page — language selector + Monaco language mapping

**Files:**
- Modify: `apps/web/lib/types.ts`
- Modify: `apps/web/lib/hooks/useAttempt.ts`
- Modify: `apps/web/app/(candidate)/exam/page.tsx`
- Test: `apps/web/app/(candidate)/exam/page.test.tsx`

**Interfaces:**
- Consumes: `AttemptQuestion.languageMode`/`allowedLanguages`, `AttemptAnswerSummary.codeLanguage` from Task 5; `GET /attempt/code-languages` from Task 3.
- Produces: nothing consumed by a later task.

- [ ] **Step 1: Update `apps/web/lib/types.ts`**

Replace `AttemptQuestion`'s `codeLanguage` field:

```ts
export interface AttemptQuestion {
  id: string;
  text: string;
  type: QuestionType;
  marks: number;
  languageMode: 'fixed' | 'any';
  allowedLanguages: string[];
  starterCode: string | null;
  allowStdin: boolean;
  snippetCode: string | null;
  snippetLanguage: CodeLanguage | null;
  imageUrl: string | null;
  options: AttemptQuestionOption[];
}
```

Add `codeLanguage` to `AttemptAnswerSummary`:

```ts
export interface AttemptAnswerSummary {
  questionId: string;
  selectedOptionIds: string[];
  answerText: string | null;
  codeLanguage: string | null;
  isMarkedForReview: boolean;
}
```

- [ ] **Step 2: Update `apps/web/lib/hooks/useAttempt.ts`**

Add a new hook, directly after `useLeaderboard`:

```ts
export function useCodeLanguages(enabled: boolean) {
  const { accessToken } = useCandidateAuth();
  return useQuery<{ language: string; version: string }[]>({
    queryKey: ['attempt', 'code-languages'],
    queryFn: () => candidateApiFetch('/attempt/code-languages', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken) && enabled,
    staleTime: 60 * 60 * 1000,
  });
}
```

Replace `useRunCode`'s mutation function signature to include `codeLanguage`:

```ts
export function useRunCode() {
  const { accessToken } = useCandidateAuth();
  return useMutation({
    mutationFn: ({ questionId, code, codeLanguage, stdin }: { questionId: string; code: string; codeLanguage: string; stdin?: string }): Promise<RunCodeResult> =>
      candidateApiFetch('/attempt/run-code', { method: 'POST', body: JSON.stringify({ questionId, code, codeLanguage, stdin }) }, accessToken ?? undefined),
  });
}
```

In `useAnswerMutation`, add `codeLanguage` to `PendingAnswer` and to `saveAnswer`'s signature (as a new trailing optional parameter, so every existing call site with fewer arguments keeps compiling):

```ts
interface PendingAnswer {
  selectedOptionIds: string[];
  answerText?: string;
  codeLanguage?: string;
  markedForReview?: boolean;
  telemetry?: AnswerTelemetry;
}
```

```ts
  function saveAnswer(
    questionId: string,
    selectedOptionIds: string[],
    markedForReview?: boolean,
    answerText?: string,
    telemetry?: AnswerTelemetry,
    codeLanguage?: string,
  ) {
    pending.current[questionId] = { selectedOptionIds, markedForReview, answerText, telemetry, codeLanguage };
    if (timers.current[questionId]) {
      clearTimeout(timers.current[questionId]);
    }
    timers.current[questionId] = setTimeout(() => fire(questionId), ANSWER_DEBOUNCE_MS);
  }
```

- [ ] **Step 3: Write the failing page test**

Read `apps/web/app/(candidate)/exam/page.test.tsx` in full first to match its exact mock conventions (`useAttemptQuery`, `useRunCode`, `useAnswerMutation`, any `renderExamPage()` helper, and how it mocks `useCodeLanguages` from `useAttempt` if any prior test already touches that module — add a mock for the new `useCodeLanguages` export alongside the existing ones, defaulting to an empty/loading state unless a specific test needs otherwise). Add:

```tsx
  it('auto-selects the language and shows the editor immediately for a fixed single-language question', () => {
    mockUseAttemptQuery.mockReturnValue({
      data: attemptStateWithQuestion({
        id: 'q1', type: 'code', text: 'Reverse a string', marks: 10,
        languageMode: 'fixed', allowedLanguages: ['python'],
        starterCode: 'def reverse(s):\n    pass', allowStdin: false,
        snippetCode: null, snippetLanguage: null, imageUrl: null, options: [],
      }),
      isError: false,
    });

    renderExamPage();

    expect(screen.getByText('python')).toBeInTheDocument();
    expect(screen.queryByLabelText('Choose a language before you start')).not.toBeInTheDocument();
  });

  it('requires a language pick before showing the editor for a fixed multi-language question', () => {
    mockUseAttemptQuery.mockReturnValue({
      data: attemptStateWithQuestion({
        id: 'q1', type: 'code', text: 'Reverse a string', marks: 10,
        languageMode: 'fixed', allowedLanguages: ['python', 'java'],
        starterCode: null, allowStdin: false,
        snippetCode: null, snippetLanguage: null, imageUrl: null, options: [],
      }),
      isError: false,
    });

    renderExamPage();

    expect(screen.getByLabelText('Choose a language before you start')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Choose a language before you start'), { target: { value: 'java' } });
    expect(screen.getByText('java')).toBeInTheDocument();
  });
```

(Write a small local `attemptStateWithQuestion(question)` helper in this test file if one doesn't already exist, building a minimal valid `AttemptState`-shaped object around the one question — mirror the full fixture shape used by this file's other existing tests, e.g. `status`, `remainingSeconds`, `webcamViolationCount`, `exam`, `sections: [{ title: 'S1', targetDurationMinutes: null, questions: [question] }]`, `answers: []`, `messages: []`, `feedback: null`, `organizationLogoUrl: null`, `organizationPrimaryColor: null`.)

- [ ] **Step 4: Run the tests to verify they fail**

Run: `cd "D:\exam app\apps\web" && npx jest "exam/page.test"`
Expected: FAIL — no language picker exists, the editor pill still reads `question.codeLanguage` which no longer exists on the type.

- [ ] **Step 5: Implement the language selector and Monaco mapping**

In `apps/web/app/(candidate)/exam/page.tsx`, add the import: `import { useAttemptQuery, useAnswerMutation, useSubmitAttempt, useRunCode, useCodeLanguages, useWebcamResume, RunCodeResult } from '../../../lib/hooks/useAttempt';` (adding `useCodeLanguages` to the existing import line).

Add a module-level mapping and helper, above the `CandidateExamPage` component:

```tsx
const PISTON_TO_MONACO_LANGUAGE: Record<string, string> = {
  javascript: 'javascript',
  typescript: 'typescript',
  python: 'python',
  java: 'java',
  csharp: 'csharp',
  cpp: 'cpp',
  go: 'go',
  ruby: 'ruby',
  // Piston exposes far more runtimes than Monaco has dedicated grammars for — anything not
  // listed here still executes correctly (this only controls syntax-highlighting), it just
  // falls back to plaintext coloring.
};

function monacoLanguageFor(pistonLanguage: string): string {
  return PISTON_TO_MONACO_LANGUAGE[pistonLanguage] ?? 'plaintext';
}
```

Add new state and a computed value, directly after the existing `runErrors` state:

```ts
  const [selectedLanguages, setSelectedLanguages] = useState<Record<string, string>>({});
```

After the existing `existingAnswer` computation, add:

```ts
  const currentCodeLanguage =
    question && question.type === 'code'
      ? selectedLanguages[question.id] ??
        (question.languageMode === 'fixed' && question.allowedLanguages.length === 1
          ? question.allowedLanguages[0]
          : (existingAnswer?.codeLanguage ?? ''))
      : '';
  const needsLanguagePick = question?.type === 'code' && !currentCodeLanguage;
  const codeLanguagesQuery = useCodeLanguages(Boolean(question && question.type === 'code' && question.languageMode === 'any'));
  const languageOptions = question?.type === 'code' ? (question.languageMode === 'fixed' ? question.allowedLanguages : (codeLanguagesQuery.data ?? []).map((entry) => entry.language)) : [];
```

Replace `handleCodeChange`:

```ts
  function handleCodeChange(value: string | undefined) {
    const next = value ?? '';
    setLocalCodeValues((prev) => ({ ...prev, [question!.id]: next }));
    saveAnswer(question!.id, [], existingAnswer?.isMarkedForReview, next, editorTelemetry.snapshot(), currentCodeLanguage);
  }
```

Replace `toggleMarkForReview`'s code branch:

```ts
  function toggleMarkForReview() {
    if (question!.type === 'code') {
      saveAnswer(question!.id, [], !existingAnswer?.isMarkedForReview, codeValue, editorTelemetry.snapshot(), currentCodeLanguage);
    } else {
      saveAnswer(question!.id, selectedOptionIds, !existingAnswer?.isMarkedForReview);
    }
  }
```

Replace `handleRun`:

```ts
  function handleRun() {
    if (!question || !currentCodeLanguage) return;
    const questionId = question.id;
    editorTelemetry.recordRun();
    setRunErrors((prev) => {
      const next = { ...prev };
      delete next[questionId];
      return next;
    });
    runCode.mutate(
      { questionId, code: codeValue, codeLanguage: currentCodeLanguage, stdin: question.allowStdin ? stdinValue : undefined },
      {
        onSuccess: (result) => setRunResults((prev) => ({ ...prev, [questionId]: result })),
        onError: (error) =>
          setRunErrors((prev) => ({
            ...prev,
            [questionId]: error instanceof Error ? error.message : "Couldn't run your code right now, try again.",
          })),
      },
    );
  }
```

Replace the `question.type === 'code'` rendering branch:

```tsx
          {question.type === 'code' ? (
            <>
              {needsLanguagePick ? (
                <div className="mb-3 flex flex-col gap-2 rounded-md border border-candidate-border bg-candidate-bg p-3">
                  <label htmlFor="code-language-select" className="text-xs font-medium text-candidate-text-secondary">
                    Choose a language before you start
                  </label>
                  <select
                    id="code-language-select"
                    aria-label="Choose a language before you start"
                    className="rounded border border-candidate-border px-2 py-1 text-sm"
                    value=""
                    onChange={(e) => {
                      const lang = e.target.value;
                      if (!lang) return;
                      setSelectedLanguages((prev) => ({ ...prev, [question.id]: lang }));
                    }}
                  >
                    <option value="" disabled>
                      Select a language…
                    </option>
                    {languageOptions.map((lang) => (
                      <option key={lang} value={lang}>
                        {lang}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <>
                  <div className="overflow-hidden rounded-t-md">
                    <div className="flex items-center justify-between bg-[#1E1E1E] px-3 py-1.5">
                      <span className="rounded bg-[#2D2D2D] px-2 py-0.5 text-[11px] font-semibold text-candidate-text-faint">
                        {currentCodeLanguage}
                      </span>
                    </div>
                    <Editor
                      height="400px"
                      path={question.id}
                      language={monacoLanguageFor(currentCodeLanguage)}
                      value={codeValue}
                      onChange={handleCodeChange}
                      onMount={(editor) => editorTelemetry.onEditorMount(editor)}
                      options={{ minimap: { enabled: false }, fontSize: 13 }}
                      theme="vs-dark"
                    />
                  </div>
                  {question.allowStdin ? (
                    <div className="mt-2 flex flex-col gap-1">
                      <label htmlFor="stdin-input" className="text-xs font-medium text-candidate-text-secondary">
                        Standard input (optional)
                      </label>
                      <textarea
                        id="stdin-input"
                        aria-label="Standard input (optional)"
                        value={stdinValue}
                        onChange={(e) => setStdinValues((prev) => ({ ...prev, [question.id]: e.target.value }))}
                        className="rounded border border-candidate-border px-2 py-1 font-mono text-xs"
                        rows={2}
                      />
                    </div>
                  ) : null}
                  <div className="mt-2 flex items-center gap-2">
                    <CandidateButton variant="secondary" onClick={handleRun} disabled={runCode.isPending}>
                      <span className="inline-flex items-center gap-1.5">
                        <Play className="h-3.5 w-3.5" aria-hidden="true" />
                        {runCode.isPending ? 'Running…' : 'Run'}
                      </span>
                    </CandidateButton>
                    {runResult ? <span className="text-xs text-candidate-text-faint">{runResult.runsRemaining} runs left</span> : null}
                  </div>
                  <CodeOutputPanel result={runResult} error={runError} />
                </>
              )}
            </>
          ) : (
```

(The `) : (` and everything after it — the MCQ options-rendering branch — is untouched.)

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd "D:\exam app\apps\web" && npx jest "exam/page.test"`
Expected: all tests pass, including the 2 new ones.

- [ ] **Step 7: Run `tsc` to confirm no new type errors**

Run: `cd "D:\exam app\apps\web" && npx tsc --noEmit -p tsconfig.json`
Expected: no new errors versus the pre-existing baseline.

- [ ] **Step 8: Commit**

```bash
git add apps/web/lib/types.ts apps/web/lib/hooks/useAttempt.ts "apps/web/app/(candidate)/exam/page.tsx" "apps/web/app/(candidate)/exam/page.test.tsx"
git commit -m "feat: candidate language selector for code questions"
```

---

### Task 9: E2E coverage + Playwright + final verification

**Files:**
- Modify: `apps/api/test/code-run-execution.e2e-spec.ts`
- Modify: `apps/web/e2e/code-question-golden-path.spec.ts`

**Interfaces:**
- Consumes: the full stack from Tasks 1-8.
- Produces: nothing (final task).

- [ ] **Step 1: Extend the backend e2e spec**

Read `apps/api/test/code-run-execution.e2e-spec.ts` in full first — it already covers the single-language golden path end-to-end (recruiter creates a code question, candidate runs and submits code). Update its existing question-creation payload(s) from the old `{ codeLanguage: '...' }` shape to `{ languageMode: 'fixed', allowedLanguages: ['...'] }`, and its `POST /attempt/run-code` call(s) to include the now-required `codeLanguage` field matching the question's one allowed language — this proves the backward-compatible "Fixed + one language, zero extra candidate action needed" path still works end-to-end.

Add two new test cases to the same file:

1. **Fixed mode with multiple languages**: recruiter creates a code question with `languageMode: 'fixed', allowedLanguages: ['python', 'javascript']`; candidate calls `GET /attempt/current` and asserts both languages appear in the question's `allowedLanguages`; candidate calls `POST /attempt/run-code` with `codeLanguage: 'javascript'` and asserts a successful execution; candidate calls `POST /attempt/run-code` with `codeLanguage: 'ruby'` (not in the allowed set) and asserts a 400.
2. **Any mode**: recruiter creates a code question with `languageMode: 'any'` and no `allowedLanguages`; candidate calls `GET /attempt/code-languages` and asserts it returns a non-empty live list; candidate calls `POST /attempt/run-code` with any language from that list and asserts a successful execution; candidate calls `POST /attempt/answer` with that `codeLanguage` and `answerText`, then submits, and confirms the attempt settles normally (proving `Answer.codeLanguage` round-trips and grading is unaffected).

- [ ] **Step 2: Run the e2e spec**

Run: `cd "D:\exam app\apps\api" && npx jest --config ./test/jest-e2e.json --runInBand code-run-execution.e2e-spec.ts`
Expected: all tests pass, including the 2 new ones and the updated existing golden-path test.

- [ ] **Step 3: Extend the Playwright spec**

Read `apps/web/e2e/code-question-golden-path.spec.ts` in full — it already covers a candidate writing and running code for a single-language question via a real browser and Monaco instance. Add one new step to its existing flow (or a new `test(...)` block in the same file, matching its existing setup/fixture conventions): create the exam's code question as Fixed mode with two languages instead of one, have the candidate select the non-default language from the picker, confirm the Monaco editor is visible and accepts keystrokes only after that selection, run the code, and confirm output appears — this is the one thing only a real browser proves for this feature (a genuine language-selection interaction gating a real Monaco instance).

- [ ] **Step 4: Run the Playwright spec**

Run: `cd "D:\exam app\apps\web" && WEB_BASE_URL=http://localhost:3002 E2E_API_BASE=http://localhost:3501/api/v1 npx playwright test code-question-golden-path --reporter=list`
Expected: passes (start the dev servers first per this repo's established e2e bootstrap process if they aren't already running).

- [ ] **Step 5: Run the full regression sweep**

```bash
cd "D:\exam app\apps\api" && npx jest
cd "D:\exam app\apps\exam-runtime" && npx jest
cd "D:\exam app\apps\web" && npx jest
cd "D:\exam app\apps\web" && npx tsc --noEmit -p tsconfig.json
cd "D:\exam app\apps\api" && npx jest --config ./test/jest-e2e.json --runInBand
cd "D:\exam app\apps\web" && WEB_BASE_URL=http://localhost:3002 E2E_API_BASE=http://localhost:3501/api/v1 npx playwright test --reporter=list
```

Expected: every suite green (report exact pass/total counts for each, not just "passed"); `tsc` shows zero new errors versus the pre-existing baseline; the full Playwright suite passes with an unchanged spec-file count (this feature only extended an existing spec, per Step 3, rather than adding a new file). If any pre-existing, feature-unrelated failure is encountered (matching this session's established pattern of environment-specific gaps like a placeholder AI API key), report it explicitly rather than silently working around it, and do not fix anything outside this plan's files.

- [ ] **Step 6: Commit**

```bash
git add apps/api/test/code-run-execution.e2e-spec.ts apps/web/e2e/code-question-golden-path.spec.ts
git commit -m "test: e2e and Playwright coverage for fixed/any code-question language selection"
```

---

## Self-Review Notes

- **Spec coverage:** dynamic Piston runtime discovery replacing the hardcoded 8-language map (T2); Fixed/Any recruiter authoring with the live list as validation source (T4, T7); candidate language selector with auto-select for the common Fixed+1 case (T8); no per-language starter code beyond Fixed+1 (T4 service gating, T7 form gating); `Answer.codeLanguage` as the new source of truth for downstream display, replacing `Question.codeLanguage` everywhere it was read (T5, T6); backward-compatible migration of existing published code questions verified end-to-end (T1's backfill + T9's extended e2e golden path). ✓
- **Placeholder scan:** every step shows complete code. The two spots that reference "read the file first, match its exact identifiers" (T5 Step 2, T7 Step 3, T8 Step 3) are this session's established convention for adapting to a test file's real current shape, not placeholders for logic — the actual test bodies and assertions are given in full. ✓
- **Type consistency:** `languageMode: 'fixed' | 'any'` and `allowedLanguages: string[]` are spelled identically across the Prisma schema (T1), `question-validation.ts`'s `QuestionValidationInput` (T4), `CreateQuestionDto` (T4), exam-runtime's `AttemptQuestion` (T5), and `apps/web/lib/types.ts`'s `Question`/`AttemptQuestion` (T7/T8). `PistonRuntimesService.getAvailableLanguages()`/`.resolveLanguage()` return shapes (`{language: string; version: string}`) match exactly what `ExamRuntimeInternalClient.listAvailableLanguages()` (T3) and the two new GET endpoints (T3) pass through. `Answer.codeLanguage` is spelled identically in the schema (T1), exam-runtime's `AttemptAnswerSummary`/`answer()` (T5), the two downstream consumers (T6), and `apps/web/lib/types.ts`'s `AttemptAnswerSummary` (T8). `RunCodeDto.codeLanguage`/`AnswerDto.codeLanguage` (T5) match `useRunCode`'s mutation payload and `saveAnswer`'s new parameter (T8) exactly. ✓
