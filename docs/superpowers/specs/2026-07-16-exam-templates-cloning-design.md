# Exam Templates/Cloning — Design Spec

## Context & Scope

Recruiters currently rebuild similar exams from scratch every time — re-entering title, instructions, duration, pass criteria, and re-picking every section's questions or pool tags. This feature adds a one-click **"Duplicate"** action that creates a new draft exam from any existing exam's configuration, eliminating that repeated setup work.

This is exam-to-exam duplication only. No new "template" entity or concept is introduced — every exam is already a valid starting point for a clone, so a separate template list would just be a second copy of the same list with extra bookkeeping. Out of scope: cross-organization cloning (the existing tenant-scoping model doesn't support it and there's no use case for it), bulk/multi-select duplication, and any UI to preview a clone's contents before creating it (the recruiter lands straight on the new exam's edit page, which already shows everything).

## Scope Decisions

- Duplication is a single **"Duplicate"** action, not a distinct "Template" entity or an `isTemplate` flag on `Exam`.
- The clone always resets `schedulingEnabled` to `false` and both window fields to `null`, regardless of the source exam's scheduling state — a copied window is virtually always stale on a brand-new draft.
- Any exam can be duplicated regardless of its own status (`draft`, `published`, or `archived`). The clone itself always starts as `draft`.
- The action lives only on the exams list page (`apps/web/app/(recruiter)/exams/page.tsx`), as a row-level link next to "Edit" — not also on the exam edit page.
- No title-entry dialog. The clone is created immediately with title `"<Original Title> (Copy)"`, and the recruiter renames it (if they want to) from the edit page they land on, the same way they'd fix any other field.
- Same permission gate as every other exam-mutating action: `exam:manage`.

## Data Model

No schema changes. `Question` and `Tag` are already organization-scoped, shared resources (`ExamSectionQuestion`/`ExamSectionPoolTag` are join tables, not owners) — cloning an exam re-links to the *same* `Question`/`Tag` rows under new `ExamSection`/`ExamSectionQuestion`/`ExamSectionPoolTag` rows. It never copies `Question` or `Tag` data itself.

New `Exam` row copies from the source: `instructions`, `durationMinutes`, `passCriteriaPercent`, `randomizeOrder`. Does not copy: `status` (forced to `'draft'`), `schedulingEnabled`/`availabilityWindowStart`/`availabilityWindowEnd` (forced to `false`/`null`/`null`), `createdBy` (set to the current user), `createdAt` (set to now). `title` is derived, not copied verbatim (`"<Original> (Copy)"`).

New `ExamSection` rows (one per source section, same order) copy: `title`, `orderIndex`, `selectionMode`, `poolSize`, `poolDifficulty`, `targetDurationMinutes`.

New `ExamSectionQuestion` rows (for `selectionMode: 'fixed'` sections) copy: `questionId`, `orderIndex`, under the new `sectionId`.

New `ExamSectionPoolTag` rows (for `selectionMode: 'pool'` sections) copy: `tagId`, under the new `sectionId`.

Nothing under `Invitation` (→ `Notification`, `Attempt`, `CandidateRefreshToken`) or `Attempt` (→ `Answer`, `AttemptInsight`, `Result`, `ProctoringAnalysis`) is ever read or copied — duplication only touches the source exam's configuration tables.

## API

`POST /exams/:id/duplicate`, guarded by `JwtAuthGuard` + `PermissionsGuard` + `RequirePermissions('exam:manage')`, matching every other exam-mutating route in `ExamsController`.

`ExamsService.duplicate(context, userId, id)`:
1. Inside one `forTenant` transaction, load the source exam scoped to `organizationId` (same `findFirst` pattern as `findOne`/`update`), including its sections with their fixed question links and pool tags. Throws `NotFoundException` if missing or cross-org — identical behavior to every other `:id` route today.
2. Create the new `Exam` row per the Data Model section above.
3. For each source section in order, create the new `ExamSection`, then its `ExamSectionQuestion` or `ExamSectionPoolTag` rows as applicable.
4. Record an `exam.duplicated` audit entry via the existing `AuditService.record` pattern (matching `exam.archived`/`exam.published`), with the new exam as `entityId` and `metadata: { sourceExamId: id }` (the `AuditEntry.metadata` field already exists for exactly this).
5. Return the new `Exam` row (same shape `create()` returns — the frontend re-fetches the full nested exam via `GET /exams/:id` once it lands on the edit page).

## Frontend

`apps/web/lib/hooks/useExams.ts` gains `useDuplicateExam()`, a mutation wrapping `POST /exams/:id/duplicate`, mirroring `useCreateExam()`'s shape.

`apps/web/app/(recruiter)/exams/page.tsx` gains a `useRouter()` call and a "Duplicate" action alongside the existing "Edit" link in the table's row actions. Clicking it fires the mutation immediately (no confirmation dialog, no title prompt):
- `onSuccess`: toast `"Exam duplicated."`, then `router.push('/exams/<new-id>/edit')` — identical to the "New exam" page's existing `onSuccess` pattern.
- `onError`: toast the error's `.message` (falling back to a generic string), matching the `onError` pattern already established on the create/edit exam mutations.

## Error Handling

No new error paths. Duplicating a nonexistent or cross-org exam id returns 404, identical to every other `:id`-scoped exam route. The only new failure surface is the mutation-level network/validation error, already covered by the `onError` toast above — there is nothing to validate client-side before submitting, since the source data is already valid.

## Testing

**Backend unit** (`apps/api/src/exams/exams.service.spec.ts`): clone lands in `draft` with scheduling off regardless of source scheduling state; `instructions`/`durationMinutes`/`passCriteriaPercent`/`randomizeOrder` copied; a fixed section's questions and a pool section's tags both re-link to the same ids under new section ids with `orderIndex` preserved; source exam and its sections/links are completely unmodified; cross-org id throws `NotFoundException`.

**Backend e2e** (`apps/api/test/`): one spec calling `POST /exams/:id/duplicate` against a real exam with both a fixed and a pool section, then asserting the full shape of the clone via `GET /exams/:id`.

**Frontend unit**: coverage for the exams list page's "Duplicate" action — calls the mutation with the correct exam id, navigates on success, toasts on error. Whether this extends an existing test file or needs a new one is confirmed at plan-writing time by reading the current state of `apps/web/app/(recruiter)/exams/page.tsx`'s test coverage (if any exists yet).

**Playwright**: extends `apps/web/e2e/recruiter-golden-path.spec.ts` with one additional step — duplicate the exam already created earlier in that same spec run, and assert the clone appears in the exams list as a `draft`. No new dedicated golden-path file.
