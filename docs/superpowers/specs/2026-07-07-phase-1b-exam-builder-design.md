# Phase 1b — Exam Builder Design Spec

**Status:** Approved, ready for implementation planning.
**Date:** 2026-07-07
**Depends on:** Phase 0 (Foundation) and Phase 1a (Question Bank) — both merged to `main`. See `memory.md` for full prior context, `docs/superpowers/specs/2026-07-07-phase-1a-question-bank-design.md` for the question bank this sub-phase builds on.

---

## 1. Context and Scope

This is the second sub-phase of Phase 1 ("Core Exam MVP") from the product roadmap (`docs/superpowers/specs/2026-07-07-online-mcq-exam-platform-design.md`, Development Roadmap section). Phase 1 is being built as a sequence of sub-phases:

1a. Question Bank — done
1b. **Exam Builder** (this spec)
1c. Candidates & Invitations
1d. Exam-Taking Runtime
1e. Grading & Results

**Goal of this sub-phase:** a Recruiter can create an exam, organize it into sections, and assign specific questions from their organization's question bank into those sections, in order — via a tested API, with the same tenant-isolation guarantees established in Phase 0 and extended in Phase 1a.

### In scope
- Exam CRUD: create, list, view, update, soft-delete (archive)
- Sections within an exam: create, update (title only), delete
- Assigning questions to a section by **fixed selection** — a recruiter explicitly picks which questions go in which section, in what order
- Soft delete for exams (status flag); hard delete for sections (see Section 2 for why the asymmetry is deliberate)
- Backend API only (NestJS), RBAC-guarded, RLS-protected
- Full test coverage (unit + e2e)

### Explicitly out of scope (deferred to later sub-phases or the product roadmap's later phases)
- **Random-pool question selection** (`section_pool_criteria`: pull N questions matching tag/difficulty at exam-taking time) — the roadmap places this in a dedicated later "Randomization" phase, not Phase 1. Only fixed assignment is built here.
- **Exam-level settings tied to later sub-phases**: `duration_minutes`, `pass_criteria_percent`, `negative_marking_default`, `schedule_start`/`schedule_end`, `proctoring_level`. Nothing in this sub-phase would enforce or use any of these yet (enforcement belongs to 1d Exam-Taking Runtime, 1c Invitations, or Phase 2 Anti-Cheat/Proctoring respectively) — adding them now would be dead schema. Each is a small, additive migration when its owning sub-phase actually needs it.
- **Publish/archive status lifecycle, clone, preview** — the exam has only a minimal `active`/`archived` flag for soft-delete, not a `draft → published → archived` lifecycle. Publishing conceptually gates whether candidates can be invited, which is 1c's concern. Clone and preview are convenience features with no dependent consumer yet.
- **Section-level timers/locks** — the roadmap places "section timers/locks" enforcement in the same later "Randomization, Question Pools & Reporting Depth" phase as pooling. No `duration_minutes` column on sections in this sub-phase.
- Any frontend UI — same precedent as Phase 1a; no screen exists yet that needs one.
- Blocking question archival when in-use — a question can always be archived in Phase 1a's API regardless of whether any exam section references it (see Section 3).

---

## 2. Data Model

Three new tables, added via a new Prisma migration on top of the existing Phase 0 + Phase 1a schema (`apps/api/prisma/schema.prisma`):

```prisma
model Exam {
  id             String        @id @default(uuid()) @db.UniqueIdentifier
  organizationId String        @map("organization_id") @db.UniqueIdentifier
  title          String
  instructions   String?       @db.NVarChar(Max)
  status         String        @default("active") // 'active' | 'archived'
  createdBy      String        @map("created_by") @db.UniqueIdentifier
  createdAt      DateTime      @default(now()) @map("created_at")
  sections       ExamSection[]

  @@index([organizationId, status])
  @@map("exams")
}

model ExamSection {
  id         String                @id @default(uuid()) @db.UniqueIdentifier
  examId     String                @map("exam_id") @db.UniqueIdentifier
  title      String
  orderIndex Int                   @map("order_index")
  exam       Exam                  @relation(fields: [examId], references: [id], onDelete: Cascade)
  questions  ExamSectionQuestion[]

  @@index([examId])
  @@map("exam_sections")
}

model ExamSectionQuestion {
  sectionId  String      @map("section_id") @db.UniqueIdentifier
  questionId String      @map("question_id") @db.UniqueIdentifier
  orderIndex Int         @map("order_index")
  section    ExamSection @relation(fields: [sectionId], references: [id], onDelete: Cascade)
  question   Question    @relation(fields: [questionId], references: [id])

  @@id([sectionId, questionId])
  @@map("exam_section_questions")
}
```

`Question` (Phase 1a) gains one required back-relation field for the new FK — a mechanical Prisma pairing, not a behavior change:

```prisma
model Question {
  // ...existing fields unchanged...
  examLinks ExamSectionQuestion[]
}
```

**Deliberately minimal, matching Phase 1a's "genuinely absent, not deferred-but-present" schema philosophy:** no `question_selection_mode`/`pool_question_count` on `ExamSection` (fixed-only, no pooling concept exists yet to select between), no `duration_minutes` on either `Exam` or `ExamSection`, no `status` enum beyond `active`/`archived` on `Exam`.

**Delete semantics are deliberately asymmetric, and this is worth stating explicitly:**
- `Exam` is soft-delete only (status flag), matching `Question`'s precedent — an exam is a durable artifact that later sub-phases (invitations, attempts, results) will reference.
- `ExamSection` is hard-delete. A section has no existence independent of its parent exam and nothing in the current or planned schema (attempts/answers key off `question_id`/`exam_id` per the original ERD, never `section_id`) ever holds a dangling reference to a deleted section. `onDelete: Cascade` on both the `Exam → ExamSection` and `ExamSection → ExamSectionQuestion` relations means deleting a section (or archiving/deleting its parent exam later) cleanly removes its question links with no orphaned rows.

**RLS:** only `exams` gets a Row-Level Security policy extension (it has `organization_id` directly, and reuses the existing `fn_tenant_access_predicate` — no new predicate function). `exam_sections` and `exam_section_questions` get **no policy of their own** — this exactly mirrors `question_options` in Phase 1a (no `organization_id` column, no independent policy), protected transitively because the app only ever reaches them by joining through the already-RLS-scoped `Exam`.

---

## 3. Validation Rules

**Exam / Section:** `title` required, non-empty, on both.

**Section-question assignment (`PUT .../sections/:sectionId/questions`, full ordered array of `questionId`s):**

| Rule | Detail |
|---|---|
| Cross-tenant reference | Every `questionId` must resolve via a tenant-scoped lookup (same `organizationId` as the exam, enforced implicitly by RLS inside the same `forTenant` call). A reference to another org's question — or a nonexistent one — fails as `NotFoundException`. |
| No duplicates | The same `questionId` cannot appear twice in one section's list. |
| Ordering | `orderIndex` is derived from array position, never client-supplied — same convention as Phase 1a's option ordering. |
| **Archived-question retention rule** | Compute the diff against the section's *current* membership before replacing. A `questionId` newly entering the section (not previously linked) must have `status: 'active'` — reject with 400 otherwise. A `questionId` that was *already* linked to this section is allowed through unchanged even if it has since been archived. This is what "archiving a question doesn't break exams that already reference it" means operationalized against a full-replace API: it blocks new attachment, never retention. |

A question may be attached to multiple sections across multiple exams simultaneously — no uniqueness constraint exists or is needed beyond "no duplicate within one section's own list" (matches the original design's many-to-many `QUESTIONS ||--o{ EXAM_SECTION_QUESTIONS : used_in` relationship).

---

## 4. API Design

Mirrors the Questions module pattern from Phase 1a (NestJS controller + service + DTOs, RBAC-guarded, tenant-scoped via `TenantPrismaService`), nested resources rather than flat, matching the original product design spec's API listing:

```
POST   /api/v1/exams                                    create (title, instructions?)
GET    /api/v1/exams?status=                             list, org-scoped, defaults to status=active
GET    /api/v1/exams/:id                                 detail, with nested sections + each section's questions
PATCH  /api/v1/exams/:id                                 update (title, instructions?)
DELETE /api/v1/exams/:id                                 soft-delete (status -> 'archived')

POST   /api/v1/exams/:id/sections                        create section (title) -- appended at end, orderIndex = current max(orderIndex) + 1 (not row count, so a deleted section never leaves a colliding gap for the next one)
PATCH  /api/v1/exams/:id/sections/:sectionId             update section (title only)
DELETE /api/v1/exams/:id/sections/:sectionId             hard delete (cascades to its question links)

PUT    /api/v1/exams/:id/sections/:sectionId/questions   full-replace ordered array of questionIds (see Section 3)
```

No individual attach/detach endpoints, no separate reorder endpoint — the bulk full-replace on the section-questions link covers add, remove, and reorder in one call, mirroring Phase 1a's `UpdateQuestionDto` full-replace convention for a question's options (deliberate consistency, not a new pattern).

**New RBAC permission:** `exam:manage` — granted to the `recruiter` role in seed data, same mechanism as `question_bank:manage`. Required on every endpoint above, including reads, for the same reason Phase 1a gave: no separate view-only tier exists yet (a Panel-role concern for a later phase).

**Visibility:** org-wide shared, like the question bank — any user with `exam:manage` (i.e. any `recruiter`) can list/view/edit/delete any exam in their organization, not just ones they created. `createdBy` is still recorded (same loosely-tracked-reference pattern as `Question.createdBy` — a plain `UniqueIdentifier` column, no `@relation` to `User`), but it is audit metadata, not an access-control boundary.

---

## 5. Security: Tenant Isolation & RBAC

Follows the exact Phase 0/1a pattern established for `users`/`audit_logs`/`questions`:

- A new migration adds a SQL Server Row-Level Security Security Policy on `exams`: FILTER + BLOCK predicates using the existing `fn_tenant_access_predicate` function — no new predicate function.
- Every service method touching `exams`, `exam_sections`, or `exam_section_questions` goes through `TenantPrismaService.forTenant()` — never the raw `PrismaService`. Any unit of work that needs to check-then-mutate (verify an exam/section exists and belongs to the caller's org, then update/delete/replace-questions) happens inside a **single** `forTenant` call. This is the same lesson restated for a third feature area — it recurred three times in Phase 0 and was caught once in Phase 1a's own plan; the implementation and review for this sub-phase must explicitly check for it again.
- Cross-entity ownership (does this question belong to the same org as this exam?) requires no manual comparison: both lookups run inside the same `forTenant` call with the caller's org already pinned as session context, so a cross-org reference simply returns zero rows via RLS, surfacing as `NotFoundException` rather than needing an explicit `organizationId === organizationId` check anywhere in application code.

---

## 6. Testing Approach

- **Unit tests** (mocked `TenantPrismaService`) for `ExamsService`: create/list/get/update/archive exam; create/update/delete section; the bulk-replace diff logic specifically — new question must be active, retained question can be archived, duplicate rejected, cross-org question rejected.
- **RLS isolation test** (its own describe block, e2e, real database): a query against `exams` with no tenant context returns zero rows; one organization never sees another organization's exams. `exam_sections`/`exam_section_questions` isolation is proven *transitively* through this — no direct query path bypasses the parent `Exam`, so no separate isolation test is needed for those two tables, consistent with `question_options` never getting one in Phase 1a.
- **End-to-end HTTP flow** (real server + real database): create exam → add 2 sections → bulk-attach questions to each (verifying order is preserved) → archive a question that's attached to a section → confirm it survives in a re-fetch of that section → attempt to add that same archived question to a *different* section → expect 400 → RBAC denial (a role without `exam:manage` gets 403) → delete a section (hard) → archive the exam (soft) and confirm it drops from the default `status=active` listing.

---

## 7. Open Items / Deferred to Future Sub-Phases

- Random-pool question selection (`section_pool_criteria`) — a dedicated later "Randomization" phase per the roadmap.
- `duration_minutes`, `pass_criteria_percent`, `negative_marking_default`, `schedule_start`/`schedule_end`, `proctoring_level` — added as small additive migrations when 1c/1d/Phase 2 actually need them.
- Publish/draft lifecycle, clone, preview endpoints — no dependent consumer yet; publish specifically waits on 1c (invitations).
- Section reordering, individual attach/detach of a single question — no consumer (no frontend UI yet) that would benefit from the finer granularity over the bulk-replace approach.
- Blocking question archival when in-use by an exam — an explicit product decision (Section 3), not an oversight.
- Frontend UI — arrives whenever a sub-phase's spec calls for an actual screen (likely once 1c/1d exist and there's something for a recruiter to preview/manage end-to-end).
