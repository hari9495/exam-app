# Phase 4e — Interview Panel Role Design Spec

**Status:** Approved, ready for implementation planning.
**Date:** 2026-07-10
**Depends on:** Phase 4b (per-attempt section snapshot, `Attempt.sectionSnapshotJson`) and Phase 4d (`apps/api/src/reports/` module: `ReportsService`/`ReportsController`, `ExamsService.getResults()` as the shared source of per-candidate rows). Both merged to `main`.

---

## 1. Context and Scope

The fifth and final sub-phase of Phase 4. Per the original master spec, the Interview Panel role is "view-only in v1 (no formal evaluation workflow yet)" — panel members can view candidate performance and compare candidates side-by-side, with no ratings/notes/hire-recommendation workflow (explicitly deferred in the master spec's own Future Enhancements list).

A pre-scoping survey of the current codebase confirmed:
- The `panel` role already exists as a full first-class role: it's seeded (`apps/api/prisma/seed.ts`), it's already assignable via `POST /users`'s `CreateUserDto` (`@IsIn(['org_admin', 'recruiter', 'panel'])`), and its only current grant is `org:view` — a placeholder from Phase 0 with no actual results access.
- No per-user assignment concept exists anywhere in the schema. `Exam.createdBy` is write-only/audit-only — no query anywhere filters by it. Every role that can see exams today (recruiter, via `exam:manage`) sees *all* exams in its organization, not a subset. Access control in this project has always been purely org-scoped, never per-user-scoped.
- `PermissionsGuard` (`apps/api/src/rbac/permissions.guard.ts`) resolves a user's permissions from the DB fresh on every request (`RolePermission` joined to `Permission`, keyed by the user's role string) — no code change is needed to grant a role a new permission, only a `seed.ts` data change.
- All results/report routes today (`GET /exams/:id/results`, and Phase 4d's `/results/summary`, `/results/question-accuracy`, `/results/export`) are gated by `exam:manage` — there is no separate read-only permission distinguishing "can manage exams" from "can view results." Since `panel` doesn't hold `exam:manage`, it currently has zero access to any of this.
- `Result` stores only an exam-wide `score`/`maxScore`/`percentage`/`passFail` — no per-section breakdown. Phase 4b's `Attempt.sectionSnapshotJson` (an array of `{ sectionId, title, targetDurationMinutes, questionIds }`, captured once at attempt-start) is the only place section membership is recorded per-attempt, and it correctly reflects each candidate's own drawn questions even for pool sections (Phase 4b) where candidates in the same exam don't necessarily receive the same questions.

**Goal of this sub-phase:** give `panel` (and, without regressing anything, `recruiter`) read access to exam results, a full per-candidate report with section/question breakdown, and a side-by-side candidate comparison — all computed from data that already exists, no schema changes.

### In scope
- A new `results:view` permission, granted to `panel` (its only grant beyond `org:view`) and additionally to `recruiter` (alongside its existing `exam:manage`).
- Every existing results/report route switches from `exam:manage` to `results:view`.
- `GET /exams/:id/candidates/:candidateId/report` — full per-candidate detail, grouped by section, including question text, the candidate's answer, correctness, marks awarded, the correct answer, and proctoring flags.
- `GET /exams/:id/candidates/compare?candidateIds=a,b,c` — section-wise score comparison for 2+ candidates from the same exam.
- Org-wide visibility for `panel` — every panel member sees every exam/candidate in their organization, matching how every other role already works.

### Explicitly out of scope (deferred)
- **Per-panel-member assignment** (a `PanelAssignment` join table, an admin endpoint to assign panel members to specific exams, per-assignment filtering) — the master spec's literal "assigned exams/candidates" wording is not built; org-wide visibility ships instead, matching this project's existing org-scoped-only access-control pattern. Assignment can be added later as its own feature if a real need emerges.
- **Formal evaluation workflow** (structured ratings, notes, hire recommendations) — explicitly deferred in the master spec's own Future Enhancements list, not part of "view-only v1."
- **Cross-exam candidate comparison** — comparison is scoped to candidates within a single exam only, since section-wise comparison is only meaningful when the section structure is shared.
- **Adding OR/alternative-permission-set semantics to `PermissionsGuard`** — resolved instead by granting `recruiter` both `exam:manage` and `results:view`, requiring zero guard code changes.
- **Any frontend/UI** — this project has been backend-only across every phase to date; unchanged here.
- **Any candidate-facing change** — results remain never shown to candidates.

---

## 2. Permission Model

No schema changes — `Permission`/`RolePermission` are seed-driven data tables, not migrated schema. Changes are entirely within `apps/api/prisma/seed.ts`:

- `PERMISSIONS` gains one entry: `results:view` — "View exam results, reports, and candidate comparisons".
- `ROLE_PERMISSIONS.panel` changes from `['org:view']` to `['org:view', 'results:view']`.
- `ROLE_PERMISSIONS.recruiter` changes from `['org:view', 'question_bank:manage', 'exam:manage', 'candidate:manage']` to the same list plus `results:view`.

Every existing results/report route's `@RequirePermissions('exam:manage')` becomes `@RequirePermissions('results:view')`:
- `GET /exams/:id/results` (`apps/api/src/exams/exams.controller.ts`)
- `GET /exams/:id/results/summary`, `/results/question-accuracy`, `/results/export` (`apps/api/src/reports/reports.controller.ts`)

Since `recruiter` gains `results:view` in the same change, this is a pure permission-swap with zero recruiter-facing behavior change — every existing e2e test exercising these routes as a recruiter continues to pass unchanged, since `recruiter` now holds the permission each route actually checks. `super_admin`/`org_admin` are unaffected (they hold neither `exam:manage` nor `results:view` today, and still hold neither after this change — this phase does not add results access to platform/org-admin roles).

---

## 3. New Endpoints

Both new routes live in `apps/api/src/reports/reports.controller.ts` (extending the same `ReportsController`/`ReportsService` from Phase 4d), gated by `results:view`.

### `GET /exams/:id/candidates/:candidateId/report`

Full per-candidate detail, grouped by section. Resolves the candidate's `Invitation` for this exam, then (if an `Attempt` exists) parses `sectionSnapshotJson` to group questions by section — correctly reflecting that specific candidate's own drawn questions, including for pool sections where different candidates draw different questions under the same `sectionId`.

```json
{
  "candidateId": "...", "candidateName": "...",
  "status": "submitted", "score": 8, "maxScore": 10, "percentage": 80, "passFail": "pass",
  "submittedAt": "2026-...",
  "proctoringAnalysis": { "status": "...", "riskLevel": "...", "summary": "..." },
  "sections": [
    {
      "sectionId": "...", "title": "Section One", "score": 8, "maxScore": 10,
      "questions": [
        {
          "questionId": "...", "questionText": "...", "type": "single_mcq", "marks": 10, "negativeMarks": 0,
          "options": [{ "id": "...", "text": "..." }],
          "selectedOptionIds": ["..."], "correctOptionIds": ["..."],
          "isCorrect": true, "marksAwarded": 10
        }
      ]
    }
  ]
}
```

A candidate with no `Attempt` yet (not started, or an invitation that was never redeemed) returns the same shape with `score`/`maxScore`/`percentage`/`passFail`/`submittedAt`/`proctoringAnalysis` all `null` and `sections: []` — consistent with `ExamsService.getResults()`'s existing pattern of never throwing for a missing attempt, only nulling the fields. A candidate not invited to this exam, or an exam belonging to a different organization, returns `404`, matching every existing results route's tenant-scoping pattern.

### `GET /exams/:id/candidates/compare?candidateIds=a,b,c`

Compact side-by-side comparison — section-level scores only, not full question detail (that's what the detail endpoint above is for) — for 2 or more candidates from the same exam.

```json
[
  {
    "candidateId": "...", "candidateName": "...",
    "status": "submitted", "score": 8, "maxScore": 10, "percentage": 80, "passFail": "pass",
    "proctoringAnalysis": { "status": "...", "riskLevel": "...", "summary": "..." },
    "sectionScores": [{ "sectionId": "...", "title": "Section One", "score": 8, "maxScore": 10 }]
  }
]
```

`candidateIds` is a required, comma-separated query param. Fewer than 2 IDs, or any ID not actually invited to this exam, returns `400 Bad Request` with a specific message identifying the problem — the endpoint never silently drops a requested candidate from the response.

### Shared helper

Both endpoints use a new private `ReportsService.computeSectionScores(sectionSnapshot, answers, questions)` method: parses a `SectionSnapshotEntry[]`, sums `Answer.marksAwarded` and `Question.marks` per section from the given answers/questions. Written once, used by both — avoiding the duplication risk of two independent per-section aggregation implementations drifting apart.

---

## 4. Testing Approach

- **Unit** (`reports.service.spec.ts`): `computeSectionScores` math against mocked snapshot/answer/question data, including a pool-section case (two attempts' snapshots referencing different `questionIds` under the same `sectionId`, proving section identity — not question identity — drives the grouping); `getCandidateDetail`'s not-started/no-attempt null-shape case; `compareCandidates`'s validation (fewer than 2 IDs; an ID not invited to the exam).
- **e2e** (extending `apps/api/test/exam-reporting.e2e-spec.ts`): a real candidate report-detail round trip against the shared exam fixture, asserting question-level content and section grouping; a real 3-candidate comparison round trip; a `panel`-role user successfully hitting all results/report routes (proving `results:view` actually grants access) and being rejected (`403`) from exam-management routes it still shouldn't touch (e.g. `POST /exams`) — proving `panel` didn't accidentally gain `exam:manage`; a `recruiter`-role user re-confirming zero regression on the existing routes now gated by `results:view` instead of `exam:manage`.
- **Migration/seed:** no migration to verify (seed-data-only change); a focused check that the reseeded `results:view` permission and both role mappings apply correctly, matching this project's standard schema-touching-phase verification depth even though there's no actual `.prisma` change this time.

---

## 5. Open Items / Deferred to Future Sub-Phases

- Per-panel-member assignment (`PanelAssignment`), if a real product need emerges — org-wide visibility is the deliberate v1 choice, not an oversight.
- Formal evaluation workflow (ratings/notes/hire recommendations) — explicitly out of v1 per the master spec.
- With this sub-phase complete, every item in Phase 4's master-spec roadmap bullet is shipped: randomization/pools (4b), negative marking (4a), section timers re-scoped to target duration (4c), analytics dashboard + export (4d), Interview Panel role (this phase). Epic #5924 can close once this phase's Feature closes.
