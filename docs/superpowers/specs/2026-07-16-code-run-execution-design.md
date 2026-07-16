# Code Run Execution — Design Spec

## Context & Scope

Candidates answering a `code`-type question write their solution in a Monaco editor, but today have no way to check whether it actually runs before submitting. This feature adds a **Run** action, w3schools-"Try it"-style: the candidate clicks Run, their code executes for real in a sandbox, and stdout/stderr/compile errors come back and render in an output panel below the editor.

This is a **self-check tool only** — it has no effect on grading. The existing manual/AI-assisted code review (`CodeAnswerReview`) is untouched; Run results are never persisted, never shown to recruiters, and never factor into marks. That separation of concerns is deliberate: the original Code Question Type spec explicitly rejected building execution infrastructure for grading purposes, and this feature does not revisit that decision — it adds execution purely as a candidate convenience.

## Scope Decisions

- **Real sandboxed execution, not AI-simulated output.** An LLM predicting program output can be wrong (bugs, loops, edge cases), which would give candidates false confidence — the opposite of what a "does my code work" check is for.
- **Piston** (open-source, Docker-based, purpose-built for exactly this) is the execution engine. It handles sandboxing (per-language isolated runtimes, resource/time limits) so this feature does not implement its own container isolation. Runs as a single Docker container exposing an HTTP API, joining the existing local `docker compose` setup (alongside SQL Server/Redis). Production hosting of the Piston container is a deployment concern outside this spec's scope — the application talks to it via a `PISTON_API_URL` environment variable, the same convention already used for other external services.
- **All 8 existing `codeLanguage` values** are supported: javascript, typescript, python, java, csharp, cpp, go, ruby — matching what recruiters can already select when creating a code question.
- **Optional per-question stdin.** A new `Question.allowStdin` boolean (default `false`), set by the recruiter on the code-question form. When true, the candidate's Run panel shows a stdin textarea; when false, the box is hidden and code runs with no input.
- **No test cases, no pass/fail.** Consistent with the "no test-case data structure" decision in the original Code Question Type spec — this feature shows raw output, not correctness verdicts.
- **Nothing is persisted.** No new Answer/Attempt fields, no run-history table. Each Run is a stateless request/response; output is ephemeral, shown in the browser and discarded.
- **Synchronous, not queued.** Piston runs are sub-second to a few seconds. The endpoint calls Piston directly and returns the result in the same HTTP response — no AiJob queue involvement, since this isn't an LLM call and immediate feedback is the point.
- **Abuse controls:** a 30-runs-per-question-per-attempt cap (tracked via a Redis counter, TTL matching the attempt's time budget) plus a new per-minute rate-limit tier on the endpoint.

## Data Model

One schema change:

```prisma
model Question {
  // ...existing fields...
  allowStdin Boolean @default(false) @map("allow_stdin")
}
```

No changes to `Answer`, `Attempt`, or any other model. No new tables.

## Language Mapping

A code-level mapping table (not DB-backed) translates the platform's `codeLanguage` values to Piston's runtime name + version, e.g.:

```ts
export const PISTON_LANGUAGE_MAP: Record<string, { language: string; version: string }> = {
  javascript: { language: 'javascript', version: '18.15.0' },
  typescript: { language: 'typescript', version: '5.0.3' },
  python: { language: 'python', version: '3.10.0' },
  java: { language: 'java', version: '15.0.2' },
  csharp: { language: 'csharp', version: '6.12.0' },
  cpp: { language: 'cpp', version: '10.2.0' },
  go: { language: 'go', version: '1.16.2' },
  ruby: { language: 'ruby', version: '3.0.1' },
};
```

(Exact versions are validated against the running Piston instance's `/runtimes` endpoint at implementation time — the table above is illustrative of shape, the plan will pin real values.)

## API

New endpoint on `apps/exam-runtime` (candidate-facing, attempt-scoped — not `apps/api`):

```
POST /attempts/:attemptId/questions/:questionId/run
Auth: candidate JWT (same guard as save-answer/submit)
Body: { code: string, stdin?: string }
```

Processing order:
1. Validate the attempt belongs to the authenticated candidate and is still active (same checks as save-answer).
2. Validate the question belongs to this attempt's exam and `type === 'code'` — 400 otherwise.
3. Check the Redis run-count for `(attemptId, questionId)` against the 30-run cap — 429 with a clear message if exceeded.
4. Look up the question's `codeLanguage` in `PISTON_LANGUAGE_MAP` — 400 if unmapped (should not happen given the closed `VALID_CODE_LANGUAGES` list, but guarded).
5. If `question.allowStdin` is false, ignore any `stdin` in the request body (run with empty input) rather than erroring — simplest, most forgiving behavior.
6. Call Piston's `POST /execute` with the code, language/version, and stdin, under a fixed timeout (5s) and memory cap.
7. Increment the Redis run-count.
8. Return the result.

Response shape:

```json
{
  "stdout": "...",
  "stderr": "...",
  "exitCode": 0,
  "compileError": null,
  "timedOut": false
}
```

`compileError` is populated from Piston's separate compile-stage output for compiled languages (java, csharp, cpp, go) when that stage fails — Piston does not run the program if compilation fails, so `stdout`/`stderr` are empty in that case. For interpreted languages (javascript, typescript, python, ruby) there is no compile stage; `compileError` is always `null` for these, and any syntax error surfaces through `stderr`/`exitCode` instead.

If Piston itself is unreachable or errors unexpectedly, return a structured `{ "error": "sandbox_unavailable" }` with a 502 — never a raw 500.

Rate limiting: new `STRICT_CODE_RUN_THROTTLE` tier in `apps/exam-runtime/src/rate-limit-tiers.ts`, following the existing `{ default: { limit, ttl: seconds(60) } }` shape, set to 10 requests/60s.

## Frontend

**Candidate exam page** (`apps/web/app/(candidate)/exam/page.tsx`), below the existing Monaco editor for `code`-type questions:
- A **Run** button, disabled while a run is in flight.
- An optional **stdin** textarea, rendered only when `question.allowStdin` is true.
- An **output panel**: stdout in one block, stderr/compile errors visually distinct (e.g. red-tinted), exit code shown. Errors from the run itself (sandbox unavailable, timeout, cap exceeded) render inline in this same panel, not as a toast — keeps feedback scoped to the editor.

**Recruiter code-question form** (wherever `codeLanguage`/`starterCode` are currently set, in the question create/edit UI): a new checkbox, "Allow candidates to provide input (stdin)", visible only when the question type is `code`. Maps directly to `Question.allowStdin`.

## Error Handling

- Attempt/question validation failures (wrong owner, inactive attempt, non-code question) — 400/403/404, matching existing save-answer error conventions.
- Run-cap exceeded — 429, frontend shows "You've used all 30 runs for this question" inline in the output panel.
- Sandbox unavailable/timeout — 502, frontend shows a generic "Couldn't run your code right now, try again" inline, matching the same panel location so the candidate isn't jarred by a toast mid-edit.

## Testing

- **Backend unit**: language-mapping lookups (valid + unmapped), run-cap enforcement logic, `allowStdin` gating (stdin ignored when false), request validation (wrong attempt/question ownership, non-code question type).
- **Backend e2e**: a real run against an actual Piston container in the test environment, for at least one language producing real stdout, plus the run-cap 429 path and the non-code-question 400 path.
- **Frontend unit**: Run button loading/disabled states, output panel rendering for stdout/stderr/compile-error/timeout cases, stdin box visibility toggling based on `allowStdin`, recruiter form checkbox wiring.
- **Playwright**: extend the candidate exam-taking golden path with a Run step on a code question — write code, click Run, assert real output renders.
