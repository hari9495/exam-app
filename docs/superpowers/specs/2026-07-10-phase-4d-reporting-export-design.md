# Phase 4d — Reporting Depth & Export Design Spec

**Status:** Approved, ready for implementation planning.
**Date:** 2026-07-10
**Depends on:** Phase 4a (negative marking, `Question.marks`/`negativeMarks`) and Phase 4b (pool-based section selection, `Attempt.questionOrderJson`) — both merged to `main`. Reuses the existing `ExamsService.getResults()` (`apps/api/src/exams/exams.service.ts:303-342`) as the source of per-candidate rows.

---

## 1. Context and Scope

The fourth sub-phase of Phase 4. The original roadmap bullet bundles two independent subsystems: "full analytics dashboard (pass rate, difficulty/time analysis, question accuracy), CSV/Excel/PDF export" and a separate "Interview Panel role (view + compare)." Scoping conversation split these — Phase 4d covers only the reporting/export half; the Interview Panel role (a new RBAC role with its own auth/permission surface) is deferred to a later sub-phase.

A pre-scoping survey of the current codebase confirmed:
- Exactly one results endpoint exists today: `GET /exams/:id/results` → `ExamsService.getResults()`, returning one row per candidate/invitation for a single exam (score, percentage, pass/fail, status, proctoring summary). No aggregate stats, no question-level breakdown, no export, no dedicated `reports`/`analytics` module anywhere in the repo.
- No export library is installed anywhere in the monorepo (no `xlsx`/`exceljs`/`pdfkit`/`json2csv`/etc. in any `package.json`). Only `csv-parse` exists, and only for candidate-CSV *import*.
- No `CandidateGroup`/batch concept exists in the schema — `Candidate` and `Invitation` have no group/batch FK. Batch-wise reporting named in the original master spec has no backing data model.
- No per-question or per-section timing data is captured anywhere — only `Attempt.startedAt`/`submittedAt` (whole-attempt duration) and `Answer.answeredAt` (last-updated timestamp, not first-viewed, since candidates can freely revisit and change answers).
- `Attempt`/`Answer`/`Result`/`Invitation` are **not** RLS-registered tables (no `organizationId` column); tenant scoping for this data is done manually in application code via `Invitation → Exam.organizationId`, matching `getResults()`'s existing pattern.

**Goal of this sub-phase:** give a recruiter aggregate exam-level analytics (pass rate, score distribution, question accuracy, attempt duration) alongside the existing per-candidate result rows, and let them export those rows as CSV, Excel, or PDF.

### In scope
- `GET /exams/:id/results/summary` — aggregate exam-level stats.
- `GET /exams/:id/results/question-accuracy` — per-question accuracy, correctly scoped to pool-based sections (not every candidate necessarily received every question).
- `GET /exams/:id/results/export?format=csv|xlsx|pdf` — synchronous export of the existing per-candidate result rows.
- No schema changes, no new migration — every number above is computed from data that already exists.

### Explicitly out of scope (deferred to future sub-phases)
- **Candidate-group/batch-wise reporting** — no `CandidateGroup` model exists; building it is a separate, larger piece of work (schema + group-management CRUD + batch-scoped queries) than reporting itself.
- **Interview Panel role** — a new RBAC role, new auth/permission surface, panel dashboard, and candidate-comparison view. Deliberately split out as its own future sub-phase.
- **Rank-within-exam** — named in the original master spec, never implemented; not needed for this sub-phase's stats.
- **Per-section/per-question time-spent analysis** — would require new instrumentation in the candidate-facing `apps/exam-runtime` (a section-entry/question-view event), not just new reporting queries in `apps/api`. This phase reports only whole-attempt duration, which needs no new tracking.
- **Async/queued export generation** — this project has no job queue (BullMQ/Redis) set up. Exam-level result sets are bounded (one row per candidate in one exam), so synchronous generation is sufficient; queued exports are a future concern if/when result sets grow large enough to matter.
- **A new dedicated permission key** — reuses the existing `exam:manage` permission, matching every other results/attempts-admin endpoint today.

---

## 2. Module Structure & API Surface

New module: `apps/api/src/reports/`.

- `reports.module.ts` — registered in `AppModule` alongside the existing `ExamsModule`. Imports `ExamsModule` to reuse `ExamsService.getResults()`.
- `reports.controller.ts` — new routes below, reusing the existing guard stack: `@UseGuards(JwtAuthGuard, PermissionsGuard)` at class level, `@RequirePermissions('exam:manage')` per route, `@CurrentTenant() tenant: TenantContext` param — identical convention to `ExamsController`/`AttemptsAdminController`.
- `reports.service.ts` — computes summary stats and question accuracy. Calls `ExamsService.getResults()` internally to get per-candidate rows (which already force-settles any expired in-progress attempts before returning), rather than re-querying `Invitation`/`Attempt`/`Result` directly — this guarantees summary/accuracy/export are never computed against stale data, and avoids duplicating the settlement-triggering logic in a second place.
- `exporters/csv-exporter.ts`, `exporters/xlsx-exporter.ts`, `exporters/pdf-exporter.ts` — pure functions of the form `(rows: ExamResultRow[]) => Buffer`, no NestJS or database dependency, independently unit-testable.

**New routes** (all under the existing `exams/:id/...` path family for discoverability):

| Route | Returns |
|---|---|
| `GET /exams/:id/results/summary` | `{ totalCandidates, settledCount, inProgressCount, notStartedCount, passRate, averagePercentage, scoreDistribution: [{ rangeLabel, count }], attemptDuration: { avgMinutes, minMinutes, maxMinutes } \| null }` |
| `GET /exams/:id/results/question-accuracy` | `[{ questionId, questionText, timesIncluded, timesAttempted, timesSkipped, timesCorrect, accuracyPercentage }]` |
| `GET /exams/:id/results/export?format=csv\|xlsx\|pdf` | File stream, `Content-Disposition: attachment; filename="<exam-title>-results.<ext>"`, correct `Content-Type` per format |

`format` is validated via a DTO/query-param enum (`csv`/`xlsx`/`pdf`); an unsupported value returns `400 Bad Request`, not a silent fallback.

---

## 3. Calculation Details & Edge Cases

**Pass rate / average percentage denominator.** "Settled" means `Attempt.status` is one of the three terminal values the grading code actually produces — `submitted`, `auto_submitted` (expired-deadline auto-settle), or `force_submitted` (recruiter-forced via `attempts-admin`'s force-submit route) — each of which has a corresponding `Result` row. Only settled attempts count toward `passRate`, `averagePercentage`, `scoreDistribution`, and `attemptDuration`. In-progress (`Attempt.status === 'in_progress'`) and not-yet-started (no `Attempt` row at all — status derived from `Invitation.status`, e.g. `invited`) candidates have no score or duration to report, but are still visible via `settledCount`/`inProgressCount`/`notStartedCount` so the denominator itself isn't hidden. This mirrors `getResults()`'s own existing distinction (`exams.service.ts:318`, which already filters on `attempt.status === 'in_progress'` for its force-settle step) rather than inventing a new status taxonomy.

**Score distribution.** Five fixed buckets by percentage: `0–20`, `20–40`, `40–60`, `60–80`, `80–100`, counting only settled results.

**Question accuracy — pool-selection interaction.** Since Phase 4b introduced pool-based section selection, candidates in the same exam do not necessarily all receive the same questions. Per-question accuracy must therefore be scoped to only the attempts whose `Attempt.questionOrderJson` actually contains that question ID, not naively divided across every attempt in the exam:
- `timesIncluded` = count of settled attempts whose `questionOrderJson` contains the question.
- `timesAttempted` = of those, count with an `Answer` row whose `selectedOptionIdsJson` is non-empty.
- `timesSkipped` = `timesIncluded - timesAttempted`.
- `timesCorrect` = count of `Answer` rows with `isCorrect: true`.
- `accuracyPercentage` = `timesCorrect / timesIncluded * 100` — skipping a question counts against its accuracy, consistent with how skipping already counts against a candidate's own score elsewhere in this platform (no credit either way).

**Zero-data guards.** An exam with zero settled attempts returns `passRate: 0`, `averagePercentage: 0`, `attemptDuration: null`, all-zero `scoreDistribution` buckets, and `question-accuracy: []` — no division by zero, no thrown error.

**Export content.** All three formats export exactly the same rows `getResults()` already returns today (candidate name, status, score, maxScore, percentage, pass/fail, submittedAt, proctoring summary), plus the new attempt-duration-in-minutes field. No aggregate stats are embedded in the export files — summary/accuracy stay separate, queryable endpoints.

**Export libraries** (new dependencies, none currently installed):
- `csv-stringify` for CSV — pairs naturally with the already-installed `csv-parse` (candidate-CSV import) for a consistent import/export library choice.
- `exceljs` for `.xlsx`.
- `pdfkit` for PDF — a single simple table (one row per candidate) with a title header; no charts, no tenant branding, no multi-page pagination logic beyond `pdfkit`'s own automatic page breaks. v1 is deliberately plain.

**Tenant isolation.** Every new route resolves the exam the same way `getResults()` does today — `tx.exam.findFirst({ where: { id: examId, organizationId } })` — so a request for an exam belonging to a different org 404s, matching existing behavior exactly. No new RLS migration needed since no new tables are introduced.

---

## 4. Testing Approach

- **Unit** (`reports.service.spec.ts`): pass-rate/average/distribution math against mocked `getResults()` output; the pool-aware question-accuracy scoping (an attempt whose `questionOrderJson` excludes a question must not count toward that question's `timesIncluded`); all zero-data edge cases (zero settled attempts, a question included in zero attempts).
- **Exporter unit tests** (`csv-exporter.spec.ts`, `xlsx-exporter.spec.ts`, `pdf-exporter.spec.ts`): feed a small fixed `ExamResultRow[]`, assert the buffer round-trips correctly — CSV parsed back via `csv-parse` and compared field-by-field, `.xlsx` read back via `exceljs` and compared, PDF asserted on `%PDF` header/non-trivial byte size and that generation doesn't throw (full PDF text-content assertions are brittle and not attempted).
- **e2e** (`apps/api/test/exam-reporting.e2e-spec.ts`): a real exam with a deliberate mix of settled, in-progress, and not-started candidates (reusing the existing exam-builder + candidate-invitation e2e helpers), asserting real HTTP round trips for `/results/summary`, `/results/question-accuracy`, and all three `/results/export?format=` variants (`Content-Type`/`Content-Disposition` headers, non-empty parseable body). Includes at least one pool-based section to exercise the question-accuracy scoping for real, not just against mocks.
- **Tenant isolation** re-verified directly (not just trusted): a report/export request for an exam belonging to a different org must 404, matching `getResults()`'s existing e2e coverage.

---

## 5. Open Items / Deferred to Future Sub-Phases

- Candidate-group/batch-wise reporting and the `CandidateGroup` data model — a separate future sub-phase.
- The Interview Panel role (new RBAC role, panel dashboard, candidate-comparison view) — a separate future sub-phase, and arguably wants this sub-phase's reporting depth to exist first so there's something substantive to view/compare.
- Rank-within-exam, per-section/per-question time-spent analysis, async/queued export generation — all named above as explicitly deferred; none block this sub-phase's value.
- If a future phase adds real per-question/section timing instrumentation to `apps/exam-runtime`, this module's summary stats would be a natural place to surface the resulting time-analysis data — not blocking today.
