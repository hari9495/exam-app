# Code Question Type — Design Spec

## 1. Context & Scope

The platform today supports exactly three question types — `single_mcq`, `multi_mcq`, `true_false` — all built on the same `Question` + `QuestionOption` model, with fully automatic, deterministic, synchronous grading at settlement time. There is no code-execution or sandboxing infrastructure anywhere in the codebase (confirmed by direct survey: no Docker orchestration, no `child_process` sandboxing, no Judge0/Piston-style integration, nothing).

This phase adds a fourth question type, `code`: a candidate writes source code in an in-browser editor instead of selecting options. Grading is **manual** (a recruiter reads the code and assigns marks), with an **optional AI-assisted review** to help the recruiter — the AI never grades authoritatively.

**How this gets used:** the platform gains no new "round" or "stage" concept. A recruiter who wants a two-stage hiring process (MCQ screening, then a coding round) simply builds a second, ordinary exam composed of `code` questions and invites the candidates who passed round one, using the invitation flow that already exists. This keeps the entire feature additive to the existing `Question`/`Exam`/`Answer`/`Attempt` model rather than requiring a new linked-exam concept.

**Existing infrastructure this reuses directly, confirmed by codebase survey:**
- **AI call pattern**: `ClaudeInsightClient` (`apps/exam-runtime/src/attempt-insight/claude-insight.client.ts`) and `ClaudeQuestionGenerationClient` (`apps/api/src/jobs/processors/claude-question-generation.client.ts`) both follow an identical recipe — `new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })`, forced tool-use via `tool_choice: { type: 'tool', name: ... }` with a hand-written JSON `input_schema`, extract and validate the `tool_use` block, throw descriptive errors on malformed responses. This phase's AI review follows the same recipe.
- **AI credit tracking**: `AiCreditUsage` (`schema.prisma`) is a free-string-`source` + optional-`sourceId` table already used by both existing AI features (`source: 'insight_generation'`, `source: 'question_generation'`) — trivially extended with `source: 'code_review'`, no schema change needed.
- **Settle-then-enrich-async pattern**: `attempt-settlement.service.ts`'s `finalize()` already demonstrates "settle now, enrich after" — it fires (unawaited) post-commit calls to `attemptAnalysis.analyze()` and `attemptInsight.analyze()` that populate separate tables without blocking or altering the `Result` row. This phase's "settle MCQ now, code questions pending" flow is architecturally the same shape, extended to actually gate `Result.passFail`.
- **JSON-string-on-flat-column convention**: this codebase consistently stores question/answer content as flat nullable columns on `Question`/`Answer` (e.g. `Question.topic`, `Question.category`), not side tables or JSON blobs, for anything that isn't inherently a list. This phase follows that convention rather than introducing a new pattern.

## 2. Scope Decisions

- **No code execution, ever.** Grading is manual (recruiter-entered marks) with an optional AI-assisted review (suggested marks + written critique, never auto-applied). This was chosen explicitly over building sandboxed execution infrastructure (a real security-sensitive subsystem — container isolation, resource/time limits — that doesn't exist anywhere in this codebase today) and over pure human-only grading (AI assistance was explicitly wanted as an optional aid, reusing the existing Claude-call pattern at near-zero incremental risk).
- **No new "round"/"linked exam" concept.** A two-stage hiring flow (MCQ, then coding) is just two ordinary exams and the existing manual-invitation flow — explicitly rejected building any exam-to-exam linkage, auto-advancement, or combined-round reporting, since the recruiter-driven manual-selection workflow the user wants doesn't need it.
- **One phase, AI review included.** Not split into "manual grading first, AI review later" — the AI piece reuses an already-proven pattern (identical shape to `attempt-insight`) rather than being genuinely new risk, so there's no reason to defer it to a second spec/plan.
- **No "test cases" data structure.** Since nothing executes the code, structured input/output test cases would be purely decorative. The problem statement (including any example inputs/outputs) lives in the question's existing `text` field, exactly like every other question type's instructions.
- **Single fixed language per question**, chosen by the recruiter at authoring time from a fixed dropdown (driving the candidate editor's syntax highlighting) — not a candidate-selectable language, not multi-language support.
- **A new, minimal recruiter grading screen**, not a full results dashboard. Recruiter has no results-viewing screen today (a gap already noted when scoping the Panel Console) — rather than building recruiter's own full parallel of Panel's reporting suite, this phase adds only what's needed to grade pending code answers: a queue of attempts awaiting manual grading, and a per-question grading detail view.

## 3. Data Model

**`Question`** gains two new nullable columns:
- `codeLanguage: String?` — one of a fixed list: `javascript`, `typescript`, `python`, `java`, `csharp`, `cpp`, `go`, `ruby` (Monaco's built-in language identifiers for its most common presets); set only for `type: 'code'` questions, drives the candidate editor's syntax highlighting.
- `starterCode: String? @db.NVarChar(Max)` — boilerplate pre-filled into the candidate's editor when they open the question.

`type` gains a fourth valid value, `'code'`, validated the same way the existing three are (`IsIn([...])` on `CreateQuestionDto`, plus `question-validation.ts`'s per-type branching). The `'code'` branch in `question-validation.ts` requires **zero** `QuestionOption` rows — every existing branch requires at least one, so this is a genuinely new case, not a variation of an existing one.

**`Answer`** gains one new nullable column:
- `answerText: String? @db.NVarChar(Max)` — the candidate's submitted source code. `selectedOptionIdsJson` remains required for the three MCQ types and unused for `code`. `AnswerDto` gains an optional `answerText` field alongside the existing `selectedOptionIds`; validation requires exactly one of the two to be present, chosen by the referenced question's `type`.

**New model `CodeAnswerReview`** (shape mirrors `AttemptInsight` closely):
```prisma
model CodeAnswerReview {
  id             String   @id @default(uuid())
  answerId       String   @unique
  status         String   // 'pending' | 'completed' | 'failed'
  suggestedMarks Int?
  summary        String?  @db.NVarChar(Max)
  generatedAt    DateTime @default(now())
  answer         Answer   @relation(fields: [answerId], references: [id])
}
```
One row per `Answer`, regenerable (a new "Generate AI Review" call overwrites the existing row via upsert, same as `AttemptInsight`'s regenerate behavior). Never authoritative — the recruiter's own `marksAwarded` entry on `Answer` is the only thing that affects scoring.

**`Attempt.status`** gains a new value, `'pending_manual_grade'`, sitting between `submitted` and the normal fully-settled state. `attempt-settlement.service.ts`'s `finalize()` is extended: if any question in the attempt has `type: 'code'`, all auto-gradable (MCQ) questions are graded exactly as today, every `code`-question `Answer.marksAwarded` is left `null`, `Attempt.status` is set to `'pending_manual_grade'` instead of the normal settled value, and `Result.passFail` is computed as `null` (pending) rather than a real pass/fail — `Result.score`/`maxScore` still reflect the known (MCQ) portion. An attempt with zero `code`-type questions is completely unaffected; this whole branch is skipped, matching today's behavior exactly.

A new endpoint finalizes grading once every `code` question in an attempt has a recruiter-entered `marksAwarded`: it re-runs the existing `computeResult()` scoring function (now fed the manually-entered marks alongside the already-known MCQ marks) and flips `Attempt.status` to the normal settled value — from that point on, the candidate's submitted screen and every existing results/reporting screen (panel's dashboards, in particular) treat it identically to an auto-graded attempt, with no changes needed on the reporting side.

## 4. Screens

**Question authoring** (`apps/web/components/QuestionForm.tsx`): gains a `'code'` branch alongside the existing three. When `type === 'code'`, the options-editing UI is replaced with a language dropdown and a starter-code Monaco editor. `text` (problem statement) and `marks` behave exactly as they do for every other type today.

**Candidate exam-taking** (`apps/web/app/(candidate)/exam/page.tsx`): gains its first real `question.type` branch — today the page inlines MCQ rendering with no dispatch at all. For `'code'` questions: a read-only problem statement plus a Monaco editor pre-filled with `starterCode`, bound to `codeLanguage` for highlighting. Answer submission reuses the existing debounced-autosave hook, sending `{ questionId, answerText }` instead of `{ questionId, selectedOptionIds }`.

**Recruiter grading** (new): a `/exams/[id]/grading` tab on the existing exam edit page, alongside Details / Sections & Questions / Live. Lists attempts currently in `pending_manual_grade` for that exam. Opening one shows, per code question in that attempt: the candidate's submitted code (Monaco, read-only, syntax-highlighted), a bounded marks input (0 to the question's `marks`), an optional feedback textarea, and a "Generate AI Review" button. A "Finalize grade" button becomes enabled only once every code question in the attempt has a saved `marksAwarded`; finalizing is always an explicit, separate click, never automatic on the last question's save — consistent with this feature's human-in-the-loop principle that nothing scoring-related happens without a deliberate recruiter action.

## 5. AI-Assisted Review

"Generate AI Review" calls a new `apps/exam-runtime` endpoint (in-process direct call, matching `attempt-insight`'s pattern rather than the queued-job pattern in `apps/api`, since this is attempt-scoped work triggered synchronously by a recruiter action, not a background bulk operation like AI question generation). It sends the question's `text`, `starterCode`, and `codeLanguage`, plus the candidate's `answerText`, to Claude via the same forced-tool-use recipe as `ClaudeInsightClient`, receiving back a suggested marks value and a written critique. The result is upserted into `CodeAnswerReview` and displayed inline in the grading form as a suggestion only — clicking it never writes to `Answer.marksAwarded`. Each successful generation records one `AiCreditUsage` row with `source: 'code_review'`, `sourceId: answerId`, matching the existing convention exactly.

## 6. Error Handling & Empty States

- **Missing/placeholder `ANTHROPIC_API_KEY`** (already the case in this dev environment): "Generate AI Review" fails gracefully — `CodeAnswerReview.status` becomes `'failed'`, the recruiter sees an inline error and can still grade manually. Matches how `AttemptInsight` already degrades today under the same condition.
- **Marks entry out of bounds**: rejected both client-side and server-side if it exceeds the question's `marks` value.
- **Blank code submission**: `answerText` stays `null`; the recruiter must still explicitly grade it (typically 0) to finalize — blank answers are not auto-zeroed, keeping the finalize step uniform (every code question always requires an explicit recruiter action, no special-casing).
- **Mixed exam (code + MCQ questions together)**: MCQ portion settles normally at submission; the presence of any ungraded code question is what holds `Result.passFail` at `null` — already covered by the Data Model section, not a separate case.
- **No pending attempts for an exam**: the grading queue shows an empty state, consistent with every other list screen in this app.

## 7. Testing

- **Backend unit**: `question-validation.ts`'s new `'code'` branch (zero options required); `AnswerDto`'s type-conditional validation (exactly one of `selectedOptionIds`/`answerText`); `attempt-settlement.service.ts`'s new pending-grade branch (code question present → `pending_manual_grade`; MCQ-only attempts → unaffected, byte-identical to today's behavior).
- **Backend e2e**: full flow — recruiter creates a `code` question, builds an exam with it, a candidate submits code, the attempt lands in `pending_manual_grade`, a recruiter grades it via the new endpoint, the attempt settles, and the result reflects the manually-entered marks. A second e2e covers the AI-review endpoint with a mocked Claude client (matching how this project's existing AI-feature e2e tests already avoid making real API calls).
- **Frontend component**: `QuestionForm`'s new code branch; the candidate exam page's new code-question renderer; the new grading queue and grading-detail screens — all via Jest + Testing Library, matching this project's existing convention.
- **Playwright**: a golden-path spec (or an extension of the existing recruiter one) covering the one thing only a real browser proves — a Monaco editor genuinely accepting keystrokes and the debounced autosave actually firing, since no existing MCQ spec exercises this.
