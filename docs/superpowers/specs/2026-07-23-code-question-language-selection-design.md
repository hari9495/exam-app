# Code Question Language Selection — Design Spec

## 1. Context & Scope

The already-shipped Code Run Execution feature (`type: 'code'` questions, Piston sandbox) locks every candidate answering a question to the ONE language the recruiter picked at authoring time, from a hardcoded 8-language list (`javascript`, `typescript`, `python`, `java`, `csharp`, `cpp`, `go`, `ruby`) duplicated between `apps/api` and `apps/exam-runtime`. This phase replaces that with: a recruiter-chosen per-question mode — **Fixed** (a curated subset of languages) or **Any** (every language the sandbox supports) — and a real candidate-facing language dropdown, so the candidate picks their own language before writing code.

**Root-cause fix, not just a feature add:** the current 8-language list is a self-imposed wiring gap, not a Piston capability limit — the actual Piston container (`ghcr.io/engineer-man/piston`, `docker-compose.yml:6-19`) supports 60+ runtimes, and the app never asks it what's installed (`GET /api/v2/runtimes`). `piston-languages.ts`'s own comment already anticipated this. This phase fixes that at the source: the live Piston runtime list becomes the single source of truth for every language list in the app (recruiter authoring, candidate selection, execution) — no more hand-maintained, driftable lists.

**What's explicitly out of scope:**
- No automatic language *detection* from typed code (decided during brainstorming — inherently unreliable for short/ambiguous snippets; a manual dropdown is deterministic and simpler).
- No per-language starter code. `Question.starterCode` continues to work exactly as today, but only when Fixed mode has exactly one language selected (the case where "one boilerplate" is unambiguous). Any other case (Fixed with 2+ languages, or Any mode) starts the candidate from a blank editor.

## 2. Data Model

**`Question`** — the single-language field is fully replaced (not left dangling alongside the new one):
- Remove: `codeLanguage` (superseded).
- Add: `languageMode: String @default("fixed") @map("language_mode")` — `'fixed' | 'any'`.
- Add: `allowedLanguages: String? @map("allowed_languages") @db.NVarChar(Max)` — JSON-stringified array of language ids (e.g. `["python","java"]`), set only when `languageMode === 'fixed'`; `null`/ignored when `'any'`.
- `starterCode` and `allowStdin` are unchanged in shape; `starterCode` is only meaningful (and only shown to the candidate) when `languageMode === 'fixed'` and `allowedLanguages` has exactly one entry.

**Migration** (one hand-authored migration, matching this repo's convention): backfill every existing `type: 'code'` row — `UPDATE questions SET language_mode = 'fixed', allowed_languages = '["' + code_language + '"]' WHERE type = 'code' AND code_language IS NOT NULL`, then `ALTER TABLE questions DROP COLUMN code_language`. Existing questions therefore become "Fixed, one language" — the candidate's dropdown has exactly one pre-selected option, so already-published exams behave identically to today.

**`Answer`** gains one nullable column:
- `codeLanguage: String? @map("code_language")` — the language the candidate actually picked for this answer (short value like `Question.codeLanguage` was, not free text — no `@db.NVarChar(Max)`). This is the record of what the candidate used, independent of how many languages the question allowed; it's what the recruiter's grading queue and the AI code-review feature now display (see §5).

## 3. Dynamic Piston Runtime Discovery

**`PistonClient`** (`apps/exam-runtime/src/code-execution/piston-client.ts`) gains one new method, `listRuntimes(): Promise<{ language: string; version: string; aliases: string[] }[]>`, calling `GET ${PISTON_API_URL}/api/v2/runtimes` (no body) — same `fetch`-based pattern as the existing `execute()` method, no new HTTP library.

**New `PistonRuntimesService`** (`apps/exam-runtime/src/code-execution/piston-runtimes.service.ts`) wraps it with an in-memory cache (TTL 1 hour — this practically never changes on a fixed sandbox container) and exposes:
- `getAvailableLanguages(): Promise<{ language: string; version: string }[]>` — one entry per language, deduped to the newest version if Piston lists multiple (mirrors today's one-pinned-version-per-language behavior).
- `resolveLanguage(language: string): Promise<{ language: string; version: string } | null>` — cache lookup by id, used by `runCode` instead of the static `PISTON_LANGUAGE_MAP` (which is deleted).

This is exam-runtime-internal — `runCode` and answer validation call it directly. `apps/api` (recruiter authoring, which runs in a different process) needs the same list; since every existing apps/api ↔ exam-runtime "internal" call is POST-only (`exam-runtime-internal.client.ts`, confirmed no GET precedent exists), this phase adds the **first GET** to that pattern: `GET /api/v1/internal/code-execution/languages` (exam-runtime, same `x-internal-secret` header auth as every other internal route) → `apps/api`'s `ExamRuntimeInternalClient.listAvailableLanguages()` → `GET /questions/code-languages` (apps/api, recruiter-only, `question_bank:manage`) for the authoring form to call. GET is the right call here (it's a pure read, no side effects) even though it's a first for this client — noted as a deliberate, justified deviation from the all-POST convention, not an oversight.

## 4. Question Authoring & Validation

`question-validation.ts`'s `'code'` branch changes from "requires exactly one valid `codeLanguage`" to: `languageMode` must be `'fixed'` or `'any'`; if `'fixed'`, `allowedLanguages` must be a non-empty array where every entry is a real language id (validated against the live Piston list, passed in from the caller — the validator itself stays pure/synchronous, taking the live list as a parameter rather than fetching it, matching this file's existing pure-function shape); if `'any'`, `allowedLanguages` must be empty/absent.

`CreateQuestionDto`/`UpdateQuestionDto`: `codeLanguage`/`VALID_CODE_LANGUAGES`-based `@IsIn` validation is removed; add `languageMode: 'fixed' | 'any'` and `allowedLanguages?: string[]`.

**Recruiter authoring form** (`QuestionForm.tsx`, `type === 'code'` branch): a Fixed/Any radio toggle. Fixed shows a checkbox multi-select populated from `GET /questions/code-languages` (fetched once, cached client-side via React Query like every other list in this app). `starterCode`'s textarea is only rendered when Fixed + exactly one language is checked.

## 5. Candidate Execution & Answering

**exam-runtime candidate-facing surface** gains a new read endpoint for Any-mode questions: `GET /attempt/code-languages` (candidate JWT, same auth as every other attempt route) → `PistonRuntimesService.getAvailableLanguages()`. Fixed-mode questions don't need this call — `AttemptQuestion` already carries `allowedLanguages` directly (see below), so the candidate page only calls this endpoint when the current question's `languageMode === 'any'`.

`AttemptQuestion` (exam-runtime's hand-built candidate-facing type, `attempt.service.ts`) replaces `codeLanguage: string | null` with `languageMode: 'fixed' | 'any'` and `allowedLanguages: string[]` (empty for Any-mode — the candidate page fetches the live list separately for that case, per above).

**`RunCodeDto`/`AnswerDto`** both gain a required-for-code-questions `codeLanguage: string` field (`AnswerDto`'s is `@IsOptional()` at the DTO level since non-code questions never send it, but the service layer requires it whenever the target question is `type === 'code'`). Both `runCode` and `answer` validate the submitted language: for a Fixed-mode question, it must be in `question.allowedLanguages`; for Any-mode, it must resolve via `PistonRuntimesService.resolveLanguage()`. `runCode` uses the resolved `{language, version}` for the Piston call (replacing the static-map lookup); `answer` persists it to the new `Answer.codeLanguage` column.

**Candidate exam page** (`apps/web/app/(candidate)/exam/page.tsx`): for a `code` question, a language `<Select>` renders above the editor — options from `question.allowedLanguages` (Fixed) or the fetched live list (Any). Fixed-with-one-language auto-selects that language (zero friction, matches today's UX exactly). Otherwise the candidate must pick before the editor/Run button activate. The selected language drives the Monaco `language` prop via a small Piston-id → Monaco-id lookup table (most ids match directly; unmapped ids fall back to `'plaintext'` for highlighting only — execution is unaffected since Piston doesn't care about Monaco's highlighting grammar).

## 6. Downstream Display Consumers

Two existing read-only consumers of "what language did they use" switch from `Question.codeLanguage` (now removed) to `Answer.codeLanguage` (the candidate's actual choice, which is the more correct value now that a question can allow several):
- The recruiter grading-queue payload (`apps/api/src/exams/exams.service.ts`'s pending-grading row).
- The AI code-review payload (`apps/exam-runtime/src/code-review/code-review.service.ts`).

Both are pure pass-through display/context fields already (confirmed via codebase survey — neither branches logic on the value), so this is a one-line source change in each, no behavior redesign.

## 7. Error Handling & Empty States

| Condition | Behavior |
|---|---|
| Candidate submits/runs a code answer without a valid `codeLanguage` | 400 — same shape as today's other validation errors |
| Candidate's `codeLanguage` isn't in the question's `allowedLanguages` (Fixed) or isn't a real Piston language (Any) | 400 — rejects a tampered/stale request |
| Recruiter tries to create/update a Fixed-mode code question with an empty or invalid `allowedLanguages` | 400, same validation-error shape as every other `question-validation.ts` rejection |
| Piston's runtime list is unreachable when the recruiter's authoring form loads | Inline error in the form; recruiter can't create/edit code questions until the sandbox is reachable — matches today's existing "no execution infra to fall back on" reality |
| Piston's runtime list is unreachable when a candidate opens an Any-mode question | The exam-runtime cache (1-hour TTL) serves a stale-but-recent list if one exists; on a cold cache with no successful fetch yet, the language selector shows an inline error and Run is disabled — same class of failure as today's existing `sandbox_unavailable` Run error |
| Existing published exam with a pre-migration code question | Unaffected — migrated to Fixed + one language, dropdown pre-selects it, identical candidate experience to before this feature shipped |

## 8. Testing

- **Unit — `PistonRuntimesService`**: cache hit/miss/TTL-expiry behavior; dedup-to-newest-version when Piston lists multiple versions of one language; `resolveLanguage()` for a known vs. unknown id.
- **Unit — `question-validation.ts`**: Fixed mode requires a non-empty, all-valid `allowedLanguages`; Any mode requires it empty/absent; the two error messages are distinct and specific.
- **Unit — `runCode`/`answer`**: language validated against the right source per mode; rejects an out-of-set language; `Answer.codeLanguage` persisted correctly.
- **Backend e2e**: full flow for both modes — (a) Fixed question with 2 languages, candidate picks one, runs code, answer stores that language; (b) Any-mode question, candidate fetches the live list, picks an uncommon one, runs and submits; (c) a pre-migration-shaped Fixed+1 question behaves identically to today (auto-selected, no candidate action needed).
- **Frontend component**: `QuestionForm`'s Fixed/Any toggle and multi-select; candidate page's language selector (Fixed-one auto-select, Fixed-many requires a pick, Any fetches and requires a pick) and the Monaco-language fallback-to-plaintext path.
- **Playwright**: extend the existing code-question golden-path spec to cover picking a non-default language and confirming Run/output still works — the one thing only a real browser proves for this feature (a real Monaco instance actually switching highlighting language on selection).
