# Integrity & Anti-Cheating Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Per-attempt integrity evidence — consent gate, editor telemetry, cross-candidate code similarity, deterministic flags rolled into a `clear`/`review`/`high_concern` level with an AI-written narrative — surfaced on recruiter reports, exports, and live monitoring.

**Architecture:** Extends the existing settlement pipeline (Approach A from the spec). Telemetry aggregates ride on the existing answer-save call; large pastes reuse the proctoring-event pipeline (new `editor_paste` type) so live monitoring works for free. A new `IntegrityAnalysisService` in `apps/exam-runtime` runs at settlement alongside `AttemptAnalysisService`, using pure-function rule/similarity modules; only the narrative touches Claude (per-org key, best-effort). `apps/api` reports read the stored result.

**Tech Stack:** NestJS 11, Prisma 5 (SQL Server), Next.js 16 + Monaco editor, `@anthropic-ai/sdk` 0.32.1, Jest.

**Spec:** `docs/superpowers/specs/2026-07-18-integrity-anti-cheating-design.md` — binding. Read it first.

## Global Constraints

- Evidence for human judgment only: NO automatic rejection/blocking from integrity level. Existing webcam 3-strike pause/block behavior unchanged.
- No AI verdicts on authorship: flags come only from deterministic rules; Claude writes ONLY the narrative and its failure must never lose flags/level (analysis persists with `narrative: null`).
- Telemetry is aggregates only — never raw keystrokes or content beyond the stored answer.
- Level values exactly: `clear` | `review` | `high_concern`. Status values exactly: `completed` | `failed`.
- Thresholds are named constants in `apps/exam-runtime/src/integrity/integrity-rules.ts` (values in Task 4) — no org configurability.
- Similarity scope: same question, same exam, settled attempts only; threshold 0.70; skip answers < 150 normalized chars; flag BOTH attempts (counterpart's stored analysis updated in place, level re-derived).
- Consent: server-enforced at attempt start (400 without `consent: true`); recorded as `Attempt.consentAt`; existing/started attempts unaffected.
- Multi-tenant discipline: all reads/writes through `TenantPrismaService.forTenant` with the attempt's `organizationId` (mirror `AttemptAnalysisService`); `Organization` lookups (AI key) use plain `PrismaService` via `AiApiKeyResolverService`.
- Windows/PowerShell environment; run commands from the package directory shown in each step.
- After any `prisma db push` in this repo, re-apply the `audit_logs_actor_user_id_fkey` `ON DELETE SET NULL` fix (Task 1 Step 4) — `db push` silently reverts it.

---

### Task 1: Schema — consentAt, telemetryJson, IntegrityAnalysis

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260718230000_integrity_analysis/migration.sql`

**Interfaces:**
- Produces: `Attempt.consentAt DateTime?`, `Answer.telemetryJson String?`, model `IntegrityAnalysis` (fields exactly as below) with back-relation `Attempt.integrityAnalysis IntegrityAnalysis?`.

- [ ] **Step 1: Edit schema**

In `apps/api/prisma/schema.prisma`:

Add to `model Attempt` (after `pausedDurationMs`): `consentAt DateTime? @map("consent_at")` and to its relation list (after `insight`): `integrityAnalysis IntegrityAnalysis?`.

Add to `model Answer` (after `gradingFeedback`): `telemetryJson String? @map("telemetry_json") @db.NVarChar(Max)`.

Add after `model ProctoringAnalysis`:

```prisma
model IntegrityAnalysis {
  id         String   @id @default(uuid()) @db.UniqueIdentifier
  attemptId  String   @unique @map("attempt_id") @db.UniqueIdentifier
  status     String
  level      String?
  flagsJson  String?  @map("flags_json") @db.NVarChar(Max)
  narrative  String?  @db.NVarChar(Max)
  analyzedAt DateTime @default(now()) @map("analyzed_at")
  attempt    Attempt  @relation(fields: [attemptId], references: [id], onDelete: Cascade)

  @@map("integrity_analyses")
}
```

- [ ] **Step 2: Validate + migration file**

Run: `cd apps/api && npx prisma validate` → expect "schema is valid".

Create `apps/api/prisma/migrations/20260718230000_integrity_analysis/migration.sql`:

```sql
ALTER TABLE [dbo].[attempts] ADD [consent_at] DATETIME2;
ALTER TABLE [dbo].[answers] ADD [telemetry_json] NVARCHAR(max);

CREATE TABLE [dbo].[integrity_analyses] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [integrity_analyses_id_df] DEFAULT newid(),
    [attempt_id] UNIQUEIDENTIFIER NOT NULL,
    [status] NVARCHAR(1000) NOT NULL,
    [level] NVARCHAR(1000),
    [flags_json] NVARCHAR(max),
    [narrative] NVARCHAR(max),
    [analyzed_at] DATETIME2 NOT NULL CONSTRAINT [integrity_analyses_analyzed_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [integrity_analyses_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [integrity_analyses_attempt_id_key] UNIQUE NONCLUSTERED ([attempt_id]),
    CONSTRAINT [integrity_analyses_attempt_id_fkey] FOREIGN KEY ([attempt_id]) REFERENCES [dbo].[attempts]([id]) ON DELETE CASCADE ON UPDATE CASCADE
);
```

- [ ] **Step 3: Apply + regenerate**

Run: `cd apps/api && npx prisma db push && npx prisma generate` (then `cd ../../packages/shared && npx prisma generate --schema ../../apps/api/prisma/schema.prisma` is NOT needed — shared re-exports the same client; just rebuild: `cd packages/shared && npm run build`).
Expected: push succeeds, client regenerated, shared dist rebuilt.

- [ ] **Step 4: Re-apply audit FK fix (mandatory after db push)**

```sql
ALTER TABLE [dbo].[audit_logs] DROP CONSTRAINT [audit_logs_actor_user_id_fkey];
ALTER TABLE [dbo].[audit_logs] ADD CONSTRAINT [audit_logs_actor_user_id_fkey] FOREIGN KEY ([actor_user_id]) REFERENCES [dbo].[users]([id]) ON DELETE SET NULL ON UPDATE NO ACTION;
```
Apply via `sqlcmd` against the active `DATABASE_URL` DB; verify `SELECT delete_referential_action_desc FROM sys.foreign_keys WHERE name='audit_logs_actor_user_id_fkey'` returns `SET_NULL`.

- [ ] **Step 5: Type-check both backends, commit**

Run: `cd apps/api && npx tsc --noEmit` and `cd apps/exam-runtime && npx tsc --noEmit` → both clean.

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260718230000_integrity_analysis/migration.sql
git commit -m "feat: add consentAt, answer telemetry, and IntegrityAnalysis schema"
```

---

### Task 2: Consent gate + telemetry persistence + editor_paste event type (exam-runtime)

**Files:**
- Modify: `apps/exam-runtime/src/attempts/dto/start-attempt.dto.ts`
- Modify: `apps/exam-runtime/src/attempts/dto/answer.dto.ts`
- Modify: `apps/exam-runtime/src/attempts/proctoring-severity.ts`
- Modify: `apps/exam-runtime/src/attempts/attempt.service.ts` (`start()` ~line 143, `answer()` ~line 227)
- Test: `apps/exam-runtime/src/attempts/attempt.service.spec.ts`

**Interfaces:**
- Consumes: Task 1 schema fields.
- Produces: `StartAttemptDto.consent?: boolean` (start of a NEW attempt 400s unless `consent === true`; sets `consentAt: new Date()` in the create); `AnswerDto.telemetry?: AnswerTelemetry` where `AnswerTelemetry = { keystrokeChars: number; pastedChars: number; pasteCount: number; largestPasteChars: number; secondsToFirstEdit: number; activeSeconds: number; runCount: number }` (exported from `answer.dto.ts` as a class `AnswerTelemetryDto` with `@IsInt() @Min(0)` on every field, attached via `@IsOptional() @ValidateNested() @Type(() => AnswerTelemetryDto)`); `answer()` persists `telemetryJson: JSON.stringify(dto.telemetry)` on the code-question upsert (create and update branches) when `dto.telemetry` is present; `'editor_paste'` added to `CLIENT_REPORTABLE_EVENT_TYPES` and `SEVERITY_BY_EVENT_TYPE` with severity `'medium'`.

- [ ] **Step 1: Write failing tests** in `attempt.service.spec.ts`, following the file's existing mock patterns (`tenantPrisma.forTenant` mockImplementation with a `tx` object):
  1. `start()` with no existing attempt and `dto.consent` undefined → rejects `BadRequestException` (message contains "consent"); `tx.attempt.create` not called.
  2. `start()` with `consent: true` → `tx.attempt.create` called with `data` containing `consentAt: expect.any(Date)`.
  3. `start()` when attempt already exists → returns existing regardless of consent (no exception).
  4. `answer()` for a code question with `telemetry: {keystrokeChars: 10, pastedChars: 500, pasteCount: 1, largestPasteChars: 500, secondsToFirstEdit: 5, activeSeconds: 60, runCount: 2}` → upsert `create`/`update` include `telemetryJson: JSON.stringify(dto.telemetry)`.
  5. `answer()` without telemetry → upsert data has no `telemetryJson` key (use `expect.not.objectContaining`).
  6. `getProctoringEventSeverity('editor_paste')` returns `'medium'` (in `proctoring-severity.spec.ts` if it exists, else alongside).

- [ ] **Step 2: Run to verify failures** — `cd apps/exam-runtime && npx jest src/attempts/attempt.service.spec.ts` → new tests FAIL.

- [ ] **Step 3: Implement.** In `start()`, immediately after the `existing` early-return: `if (dto.consent !== true) { throw new BadRequestException('You must consent to exam monitoring before starting.'); }` and add `consentAt: new Date()` to the `tx.attempt.create` data. In `answer()`'s code-question branch, build `const telemetryPatch = dto.telemetry ? { telemetryJson: JSON.stringify(dto.telemetry) } : {};` and spread into both `create` and `update`. DTO and severity-map edits per Interfaces.

- [ ] **Step 4: Run tests** — full `npx jest src/attempts` → all pass. **Step 5: `npx tsc --noEmit`** clean. **Step 6: Commit** `feat: consent gate at attempt start, answer telemetry persistence, editor_paste event type`.

---

### Task 3: Similarity engine (pure functions)

**Files:**
- Create: `apps/exam-runtime/src/integrity/similarity.ts`
- Test: `apps/exam-runtime/src/integrity/similarity.spec.ts`

**Interfaces:**
- Produces (all exported): `normalizeCode(code: string): string` (strip `//…`, `/*…*/`, `#…` comments and string literals `'…' "…" \`…\`` → collapse whitespace to single spaces → lowercase); `fingerprint(normalized: string): Set<string>` (tokenize on `\w+|[^\w\s]` matches, join consecutive 5-token windows with ` `, return the set — fewer than 5 tokens → empty set); `jaccard(a: Set<string>, b: Set<string>): number` (0 when both empty); `similarityScore(codeA: string, codeB: string): number` (compose the three); `MIN_NORMALIZED_LENGTH = 150`, `SIMILARITY_THRESHOLD = 0.70`, `SIMILARITY_HIGH = 0.85`.

- [ ] **Step 1: Failing tests** covering: identical code → 1.0; identical-after-identifier-rename NOT caught by naive equality but ≥ 0.70 when only comments/whitespace/casing differ; a genuinely different solution (different algorithm, ~same length) → < 0.5; comments and string literals ignored (`same code + different comments` → 1.0); `normalizeCode` output has no double spaces and is lowercase; `fingerprint('a b')` (2 tokens) → empty set; `jaccard(empty, empty)` → 0.
- [ ] **Step 2: Verify FAIL.** **Step 3: Implement** (~50 lines, no dependencies). **Step 4: Verify PASS.** **Step 5: Commit** `feat: code similarity engine (normalize + 5-gram fingerprint + jaccard)`.

---

### Task 4: Integrity rules + level derivation (pure functions)

**Files:**
- Create: `apps/exam-runtime/src/integrity/integrity-rules.ts`
- Test: `apps/exam-runtime/src/integrity/integrity-rules.spec.ts`

**Interfaces:**
- Consumes: `AnswerTelemetry` shape from Task 2 (redeclare locally as an interface — no import from DTO).
- Produces:

```typescript
export interface IntegrityFlag {
  type: 'large_paste' | 'paste_dominant' | 'implausible_speed' | 'no_iteration'
      | 'similarity_match' | 'webcam_violations' | 'proctoring_events';
  severity: 'medium' | 'high';
  detail: string;            // human-readable factual sentence
  questionId?: string;
  counterpartAttemptId?: string;  // similarity_match only
  similarity?: number;            // similarity_match only, 0-1 two-decimal
}
export type IntegrityLevel = 'clear' | 'review' | 'high_concern';

export const LARGE_PASTE_CHARS = 200;
export const LARGE_PASTE_HIGH_CHARS = 800;
export const PASTE_DOMINANT_MIN_CHARS = 300;
export const IMPLAUSIBLE_CHARS_PER_SECOND = 8;
export const IMPLAUSIBLE_MIN_CHARS = 300;
export const MEDIUM_EVENT_COUNT_FLAG = 5;

export function deriveTelemetryFlags(input: { questionId: string; telemetry: AnswerTelemetry; finalCodeLength: number; scoredFullMarks: boolean }): IntegrityFlag[];
export function deriveAttemptFlags(input: { webcamViolationCount: number; blocked: boolean; events: { eventType: string; severity: string }[] }): IntegrityFlag[];
export function deriveLevel(flags: IntegrityFlag[]): IntegrityLevel;
```

Rules (spec §4 table, implement exactly): `large_paste` when `largestPasteChars >= 200` (severity high when `>= 800`); `paste_dominant` when `pastedChars > keystrokeChars && pastedChars + keystrokeChars >= 300` (high); `implausible_speed` when `activeSeconds > 0 && finalCodeLength >= 300 && finalCodeLength / activeSeconds > 8` (high); `no_iteration` when `runCount === 0 && scoredFullMarks` (medium). Attempt-level: `webcam_violations` when count ≥ 1 (high when `blocked`); `proctoring_events` when any event has `severity === 'high'` OR ≥ 5 events with `severity === 'medium'` (flag severity high when any event's `eventType` is `dev_tools_detected` or `multi_login`, else medium). `deriveLevel`: any high flag → `high_concern`; any flag → `review`; else `clear`. Each `detail` states the numbers, e.g. `` `Pasted ${largestPasteChars} characters in a single paste` ``.

- [ ] **Step 1: Failing tests** — trigger + non-trigger (boundary) case per rule; `deriveLevel` for all three outcomes; `no_iteration` not fired when marks not full or runCount > 0.
- [ ] **Step 2: FAIL. Step 3: Implement. Step 4: PASS. Step 5: Commit** `feat: deterministic integrity rule flags and level derivation`.

---

### Task 5: IntegrityAnalysisService + ClaudeIntegrityClient + settlement wiring

**Files:**
- Create: `apps/exam-runtime/src/integrity/claude-integrity.client.ts`
- Create: `apps/exam-runtime/src/integrity/integrity-analysis.service.ts`
- Create: `apps/exam-runtime/src/integrity/integrity.module.ts`
- Modify: `apps/exam-runtime/src/grading/attempt-settlement.service.ts` (`finalize()` fire-and-forget block ~line 130; constructor)
- Modify: `apps/exam-runtime/src/grading/grading.module.ts` (import `IntegrityModule`)
- Modify: `apps/exam-runtime/src/app.module.ts` only if grading.module import graph requires it (check first — `CryptoModule` import pattern from the three existing AI modules)
- Test: `apps/exam-runtime/src/integrity/integrity-analysis.service.spec.ts`, `claude-integrity.client.spec.ts`

**Interfaces:**
- Consumes: Tasks 3-4 functions/constants; `AiApiKeyResolverService` + `TenantPrismaService` from `@exam-platform/shared`; `IntegrityFlag`, `deriveLevel`.
- Produces: `IntegrityAnalysisService.analyze(attemptId: string): Promise<void>` (called from settlement, never throws — top-level try/catch logs, mirroring `AttemptAnalysisService.analyze`); `ClaudeIntegrityClient.writeNarrative(flags: IntegrityFlag[], context: { examTitle: string; level: string }, apiKey: string): Promise<string>`.

**`ClaudeIntegrityClient`** mirrors `claude-proctoring.client.ts` exactly: per-call `new Anthropic({ apiKey })`, model `claude-haiku-4-5-20251001`, `max_tokens: 512`, tool-forced call `report_integrity_narrative` with schema `{ narrative: string }` (3-5 sentences, plain language for a recruiter, describing the evidence factually without accusing); validate non-empty string else throw.

**`IntegrityAnalysisService.analyze(attemptId)`** algorithm:
1. Load attempt (super-admin bypass like `AttemptAnalysisService` line 19-24) incl. `invitation.exam`, get `organizationId`.
2. In org-scoped `forTenant`: load answers (with `question: { select: { id, type, marks } }`), proctoring events, and the attempt's `result`.
3. Telemetry flags: for each answer whose `question.type === 'code'` and `telemetryJson` non-null → parse, call `deriveTelemetryFlags` with `finalCodeLength: (answer.answerText ?? '').length`, `scoredFullMarks: answer.marksAwarded !== null && answer.marksAwarded >= question.marks`. Absent/unparseable telemetry → skip silently (never a flag).
4. Attempt flags: `deriveAttemptFlags({ webcamViolationCount: attempt.webcamViolationCount, blocked: attempt.webcamViolationCount >= 3, events })`.
5. Similarity: for each code answer with `answerText` and `normalizeCode(answerText).length >= MIN_NORMALIZED_LENGTH` → load counterpart answers for the same `questionId` where `attempt.examId` matches, attempt status in `['submitted','auto_submitted','force_submitted','pending_manual_grade']`, `attemptId != attempt.id`, `answerText != null` (query via `tx.answer.findMany({ where: { questionId, attempt: { examId, status: { in: [...] }, id: { not: attemptId } }, answerText: { not: null } }, include: { attempt: { select: { id: true } } } })`). Compute `similarityScore`; pairs ≥ `SIMILARITY_THRESHOLD` → `similarity_match` flag (severity high when ≥ `SIMILARITY_HIGH`, else medium; `similarity` rounded to 2 decimals) AND counterpart update (step 7).
6. `level = deriveLevel(flags)`. Narrative: if `flags.length === 0` → `'No integrity concerns detected.'` without any AI call; else resolve key via `aiApiKeyResolver.resolve(organizationId)` and call `writeNarrative` — on ANY error, log and keep `narrative = null`. Upsert `integrityAnalysis` `{ status: 'completed', level, flagsJson: JSON.stringify(flags), narrative }` (update branch also sets `analyzedAt: new Date()`). When (and only when) the narrative AI call succeeded, record credit usage in the same `forTenant` transaction as the upsert, mirroring `attempt-insight.service.ts:69-73`: `await tx.aiCreditUsage.create({ data: { organizationId, source: 'integrity_narrative', credits: 1, sourceId: attemptId } })` — no credit on the zero-flag skip or the AI-failure path. A failure before flags are computed (e.g. attempt load fails) upserts nothing — the outer catch just logs, matching `AttemptAnalysisService`.
7. Counterpart update (in its own try/catch — failure logs, never fails the current analysis): for each matched counterpart attempt id, load its existing `integrityAnalysis`; if present, parse `flagsJson`, append a mirrored `similarity_match` flag (pointing back at the current attempt) **unless an identical `{counterpartAttemptId, questionId}` flag already exists**, re-run `deriveLevel`, update row. If the counterpart has no analysis yet (settles later), do nothing — its own settlement run will discover the pair.

**Settlement wiring:** in `finalize()`'s existing fire-and-forget IIFE, after the `attemptAnalysis.analyze` call add the same pattern: `try { await this.integrityAnalysis.analyze(finalized.id); } catch (error) { this.logger.error('Integrity analysis failed to start', error as Error); }` — unconditional (unlike insight, it runs for `pending_manual_grade` too; telemetry/paste/similarity evidence doesn't depend on grading). Also add the same call in `finalizeManualGrade()`'s IIFE so `no_iteration` (which needs marks) is re-evaluated after manual grading — the upsert makes re-running safe.

- [ ] **Step 1: Failing tests.** Client spec mirrors `claude-proctoring.client.spec.ts` (mock `@anthropic-ai/sdk`; valid tool_use → narrative; missing/empty → throws). Service spec (mock tenantPrisma/client/resolver, mirror `attempt-analysis.service.spec.ts` style): zero-flag path upserts `{status:'completed', level:'clear', flagsJson:'[]', narrative:'No integrity concerns detected.'}` and never calls resolver/client; flagged path calls `writeNarrative` and stores its narrative + `level:'review'` or `'high_concern'` per fixture; AI-failure path stores flags + level with `narrative: null` and `status: 'completed'` and does NOT create `aiCreditUsage`; successful narrative path creates `aiCreditUsage` with `{source: 'integrity_narrative', credits: 1, sourceId: attemptId}`; zero-flag path creates no `aiCreditUsage`; similarity fixture (two answers same question ≥ 0.70) produces `similarity_match` on current AND updates counterpart's existing analysis with re-derived level; counterpart-update failure doesn't reject.
- [ ] **Step 2: FAIL. Step 3: Implement (module: providers/exports the service + client, imports `CryptoModule` from `@exam-platform/shared`). Step 4: PASS + full `npx jest` for the package + `npx tsc --noEmit`. Step 5: Commit** `feat: integrity analysis at settlement with similarity, rules, and AI narrative`.

---

### Task 6: apps/api report surfaces (service + exporters)

**Files:**
- Modify: `apps/api/src/reports/reports.service.ts` (types at lines 51-91 and the three assembly sites at ~269/~355/~386)
- Modify: `apps/api/src/exams/exams.service.ts` — `getResults()` rows gain integrity fields (find where `proctoringAnalysis` or result fields are selected; mirror it)
- Modify: `apps/api/src/reports/exporters/csv-exporter.ts`, `xlsx-exporter.ts`, `pdf-exporter.ts` + their specs
- Test: `apps/api/src/reports/reports.service.spec.ts`

**Interfaces:**
- Produces: `IntegritySummary = { status: string; level: string | null; flags: IntegrityFlagDto[]; narrative: string | null } | null` where `IntegrityFlagDto = { type: string; severity: string; detail: string; questionId?: string; counterpartAttemptId?: string; similarity?: number }` — added as `integrityAnalysis` to `CandidateDetail`, `CandidateComparisonRow`, and the results-list row type (results list additionally exposes `integrityLevel: string | null` and `integrityFlagCount: number` for the dashboard column). `flags` parsed from `flagsJson` (`[]` on null/parse failure). Exports: two new columns appended — header `Integrity level` (empty string when null) and `Integrity flags` (count, `0` when no analysis) — in all three exporters, consistent order.
- Consumes: Prisma `integrityAnalysis` relation (Task 1); include it wherever `proctoringAnalysis` is included in the same queries.

- [ ] **Step 1: Failing tests** — candidate detail includes parsed `integrityAnalysis` (fixture with 2 flags → `flags.length === 2`); null row → `integrityAnalysis: null`; malformed `flagsJson` → `flags: []`; exporter specs assert the two new columns with values and with empty/0 defaults.
- [ ] **Step 2: FAIL. Step 3: Implement (one private `toIntegritySummary(row)` helper in reports.service, reused at all three sites). Step 4: PASS + `npx tsc --noEmit`. Step 5: Commit** `feat: surface integrity analysis on reports and exports`.

---

### Task 7: Candidate frontend — consent screen + editor telemetry

**Files:**
- Modify: `apps/web/app/(candidate)/welcome/page.tsx`
- Modify: `apps/web/lib/hooks/useAttempt.ts` (`useStartAttempt` ~line 41, `useAnswerMutation` ~line 56, `PendingAnswer` type)
- Create: `apps/web/lib/hooks/useEditorTelemetry.ts`
- Modify: `apps/web/app/(candidate)/exam/page.tsx` (Monaco `<Editor>` ~line 234; code save + run call sites)
- Modify: `apps/web/lib/types.ts` (add `AnswerTelemetry` interface — same 7 fields as Task 2)
- Test: `apps/web/lib/hooks/useEditorTelemetry.test.ts`, `apps/web/app/(candidate)/welcome/page.test.tsx` (create if absent, following sibling page tests' mock style)

**Interfaces:**
- Consumes: Task 2's `consent`/`telemetry` request fields; existing `useStartAttempt`, `useAnswerMutation.saveAnswer`, `useReportProctoringEvent`, `useRunCode`.
- Produces: `useStartAttempt` body becomes `JSON.stringify({ consent: true })` (the UI gate guarantees it's only callable after consent). `saveAnswer` gains optional 5th arg `telemetry?: AnswerTelemetry` stored in `PendingAnswer` and spread into the POST body. `useEditorTelemetry(questionId: string | null)` returns `{ onEditorMount(editor: MonacoEditor): void; recordRun(): void; snapshot(): AnswerTelemetry | undefined }` maintaining per-question aggregates in a ref map.

**Consent screen:** extend the existing "Camera monitoring" card on `welcome/page.tsx` into a "Monitoring & consent" card listing exactly: webcam snapshots and face-presence checks; browser activity (tab switches, fullscreen exits, copy/paste, right-click, developer tools); code-editor activity (paste sizes, typing-volume aggregates); "Seen by the hiring organization's staff and stored with your attempt." Below it a labeled checkbox `I understand and consent to monitoring during this exam` (`useState(false)`); the existing Start button renders as today but `disabled` until `cameraStatus === 'granted' && consentChecked`. Under the checkbox, muted text: `If you do not consent, close this page and contact your recruiter.`

**Telemetry capture (`useEditorTelemetry`):** per-question record `{ keystrokeChars, pastedChars, pasteCount, largestPasteChars, secondsToFirstEdit, activeSeconds, runCount, openedAt, lastTickAt, firstEditAt }`. `onEditorMount` wires Monaco: `editor.onDidPaste(e => …)` marks the next content change as a paste; `editor.onDidChangeModelContent(e)` sums inserted `change.text.length` — into `pastedChars`/`pasteCount`/`largestPasteChars` when flagged as paste (or single change > 20 chars as fallback), else `keystrokeChars`; first change sets `secondsToFirstEdit` from `openedAt`. `activeSeconds` accrues via a 5-second interval while the hook's `questionId` is unchanged and `document.visibilityState === 'visible'`; question switch closes out the old record. `recordRun()` increments `runCount` (call beside the existing `useRunCode` mutate). On every paste with `chars >= 200`, call the existing `useReportProctoringEvent()('editor_paste', { chars, questionId })`. Exam page passes `telemetry: snapshot()` as the new `saveAnswer` arg for code questions only.

- [ ] **Step 1: Failing tests** — hook: typing accumulates `keystrokeChars`; a paste-marked change accumulates `pastedChars`/`pasteCount`/`largestPasteChars` and fires the proctoring-event callback at ≥ 200 chars but not below; `recordRun` increments; `snapshot` returns integers. Welcome page: Start button disabled with camera granted but checkbox unchecked; enabled when both; start POST body contains `consent: true`.
- [ ] **Step 2: FAIL. Step 3: Implement. Step 4: PASS (`npx jest` for touched files) + `npx tsc --noEmit` (only the 10 pre-existing baseline errors). Step 5: Commit** `feat: consent gate UI and code editor telemetry capture`.

---

### Task 8: Recruiter frontend — report badge/evidence, results column, live tile count

**Files:**
- Modify: `apps/web/lib/types.ts` (`IntegritySummary`, `IntegrityFlag` mirroring Task 6 response shapes; extend the existing candidate-report and results-row types)
- Modify: recruiter results dashboard page (exam results list — locate via `rg "proctoringAnalysis" apps/web/app` and extend the same components) and candidate report detail page(s) used by recruiter + panel consoles
- Modify: `apps/web/components/LiveMonitoringPanel.tsx`
- Test: colocated `.test.tsx` files following each page's existing test style

**Interfaces:**
- Consumes: Task 6 API fields (`integrityAnalysis`, `integrityLevel`, `integrityFlagCount`).
- Produces: `IntegrityBadge` component (in the report detail file or `components/ui` if both consoles share it): `clear` → green "Integrity: Clear", `review` → amber "Integrity: Review recommended", `high_concern` → red "Integrity: High concern", null analysis → gray "Integrity: —". Report detail: badge + narrative paragraph + evidence list (`flag.detail`, severity chip, question reference when present; `similarity_match` renders a link to the counterpart candidate's report using `counterpartAttemptId`). Results list: badge column, client-side filter by level reusing the page's existing filter pattern. LiveMonitoringPanel: per-roster-row chip showing the count of received alerts for that `attemptId` with severity `medium` or `high` (derive from the existing `alerts` state by `attemptId` — no new socket wiring).

- [ ] **Step 1: Failing tests** — badge renders correct label/color per level and the null state; report page shows narrative + one list item per flag; results row shows badge; LiveMonitoringPanel shows count 2 for a roster row after two medium alerts for its attemptId.
- [ ] **Step 2: FAIL. Step 3: Implement. Step 4: PASS + `npx tsc --noEmit` (baseline-only). Step 5: Commit** `feat: integrity level surfaces on reports, results list, and live monitoring`.

---

### Task 9: E2E + final verification

- [ ] **Step 0: Automated e2e** — add `apps/exam-runtime/test/integrity.e2e-spec.ts` following the structure/cleanup discipline of the existing exam-runtime e2e specs (bounded timeout wrapper, `afterAll` deletes everything it created, RLS-bypass patterns as used by siblings; mock the Anthropic SDK at module level so no real AI call). Scenarios: (1) start without `consent: true` → 400, with it → attempt row has `consentAt`; (2) code answer saved with telemetry containing `largestPasteChars: 900` → submit → poll `integrity_analyses` → `level: 'high_concern'` with a `large_paste` flag; (3) a second candidate submits identical `answerText` to the same question → its analysis AND the first attempt's updated analysis both contain `similarity_match`. Run it twice consecutively — row counts stable (no fixture leaks).
- [ ] **Step 1:** Full suites: `packages/shared`, `apps/api`, `apps/exam-runtime`, `apps/web` — all pass; `tsc --noEmit` all packages (web: only the 10 pre-existing baseline errors).
- [ ] **Step 2: Live verification** (dev servers via launch config; recruiter `recruiter@demo-org.test` / `Passw0rd!2026`, org `demo-org`):
  1. Candidate flow: redeem an invite → welcome page shows the consent card; Start disabled until camera + checkbox; start succeeds; DB shows `consent_at` set.
  2. `curl` the start endpoint directly for a fresh invitation WITHOUT `consent: true` → 400.
  3. In a code question: paste a ≥ 200-char block → live monitoring shows an `editor_paste` alert; the roster chip count increments.
  4. Submit; after settlement check `integrity_analyses` row: `level` reflects the paste flag (`review` or `high_concern` if ≥ 800 chars), `flags_json` populated; narrative present or null (dev key may fail — either is acceptable, status must be `completed`).
  5. Second candidate submits identical code to the same question → both attempts' analyses contain `similarity_match` (verify the earlier one was updated in place).
  6. Recruiter report detail shows the badge, evidence list, and similarity link; results list shows the badge column; CSV export contains the two new columns.
  7. Clean up test rows (attempts/invitations/candidates created for this verification) via a transaction-safe script.
- [ ] **Step 3:** Update `.superpowers/sdd/progress.md`; close ADO items.
