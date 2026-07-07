# Phase 1a — Question Bank Design Spec

**Status:** Approved, ready for implementation planning.
**Date:** 2026-07-07
**Depends on:** Phase 0 (Foundation) — merged to `main`, see `docs/superpowers/plans/2026-07-07-phase-0-foundation.md` and `memory.md` for full prior context.

---

## 1. Context and Scope

This is the first sub-phase of Phase 1 ("Core Exam MVP") from the product roadmap (`docs/superpowers/specs/2026-07-07-online-mcq-exam-platform-design.md`, Development Roadmap section). Phase 1 as originally scoped bundles several independent subsystems (question bank, exam builder, candidate management/invitations, exam-taking runtime, grading/results) — too large for a single spec/plan cycle, so it's being built as a sequence of sub-phases:

1a. **Question Bank** (this spec)
1b. Exam Builder
1c. Candidates & Invitations
1d. Exam-Taking Runtime
1e. Grading & Results

**Goal of this sub-phase:** a Recruiter can create, list, update, and archive MCQ questions in their organization's question bank via a tested API, with the same tenant-isolation guarantees established in Phase 0.

### In scope
- CRUD for questions of three types: Single-correct MCQ, Multiple-correct MCQ, True/False
- Plain-text question content (no rich text/HTML)
- Metadata: topic, category, difficulty (easy/medium/hard), marks, negative marks
- Per-type answer-option validation
- Soft delete via archiving (no hard delete)
- Backend API only (NestJS), RBAC-guarded, RLS-protected
- Full test coverage (unit + e2e)

### Explicitly out of scope (deferred to later sub-phases or future work)
- Rich text/HTML question content, image embedding, math equation support
- Bulk import/export
- AI-generated questions
- A reusable many-to-many tag system (topic/category/difficulty cover filtering needs for now)
- Question versioning history
- Any frontend UI (a real question-bank UI arrives with the Exam Builder sub-phase, once there's a screen that actually needs to list/pick questions)
- Fill-in-the-blank, coding, or subjective question types

---

## 2. Data Model

Two new tables, added via a new Prisma migration on top of the existing Phase 0 schema (`apps/api/prisma/schema.prisma`):

```prisma
model Question {
  id             String   @id @default(uuid()) @db.UniqueIdentifier
  organizationId String   @map("organization_id") @db.UniqueIdentifier
  type           String   // 'single_mcq' | 'multi_mcq' | 'true_false'
  text           String   @db.NVarChar(Max)
  topic          String?
  category       String?
  difficulty     String   // 'easy' | 'medium' | 'hard'
  marks          Int
  negativeMarks  Int      @default(0) @map("negative_marks")
  status         String   @default("active") // 'active' | 'archived'
  createdBy      String   @map("created_by") @db.UniqueIdentifier
  createdAt      DateTime @default(now()) @map("created_at")
  options        QuestionOption[]

  @@index([organizationId, topic, difficulty])
  @@map("questions")
}

model QuestionOption {
  id         String   @id @default(uuid()) @db.UniqueIdentifier
  questionId String   @map("question_id") @db.UniqueIdentifier
  text       String
  isCorrect  Boolean  @map("is_correct")
  orderIndex Int      @map("order_index")
  question   Question @relation(fields: [questionId], references: [id])

  @@map("question_options")
}
```

Deliberately dropped from the original design's `questions` table (not deferred-but-present, genuinely absent — added back only when the corresponding feature is actually built): `image_url`, `ai_generated`, `version`.

`question_options` has no independent RLS policy — it's only ever reached through a `Question` (same reasoning as `RefreshToken` needing none: no direct standalone query path exposes it to a caller).

---

## 3. Validation Rules

Enforced at the service layer before persisting (create and update both re-validate):

| Type | Option count | Correct-option count |
|---|---|---|
| `single_mcq` | ≥ 2 | exactly 1 |
| `multi_mcq` | ≥ 2 | ≥ 1 (can be more than one) |
| `true_false` | exactly 2 | exactly 1 |

Additional field rules:
- `marks` must be > 0
- `negativeMarks` must be ≥ 0 and ≤ `marks` (can't lose more than you'd gain for one question)
- `difficulty` restricted to `easy` | `medium` | `hard`
- `type` restricted to `single_mcq` | `multi_mcq` | `true_false`

---

## 4. API Design

Mirrors the Organizations/Users module pattern from Phase 0 (NestJS controller + service + DTOs, RBAC-guarded, tenant-scoped via `TenantPrismaService`):

```
GET    /api/v1/questions?topic=&difficulty=&status=&limit=&cursor=   list, filtered
POST   /api/v1/questions                                              create (question + nested options in one payload)
GET    /api/v1/questions/:id                                          single question detail
PATCH  /api/v1/questions/:id                                          update (re-validates option rules)
POST   /api/v1/questions/:id/archive                                  soft delete (status -> 'archived')
```

No hard `DELETE` endpoint. Options are managed as part of the question payload (whole question + its options created/updated together) — they have no independently addressable lifecycle or separate endpoint.

Pagination is `limit`/`cursor`-based, not offset-based — this was an explicit project-wide API convention established in the original product design spec (offset pagination degrades badly at scale on high-row-count tables), and this endpoint inherits it rather than introducing a new pattern.

**New RBAC permission:** `question_bank:manage` — granted to the `recruiter` role in seed data (mirroring how `org:manage_users` etc. were seeded in Phase 0). Required on all five endpoints, including read, since there's no separate view-only tier yet (that's a Panel-role concern for a later phase).

---

## 5. Security: Tenant Isolation

Follows the exact Phase 0 pattern established for `users`/`audit_logs`:

- A new migration adds a SQL Server Row-Level Security Security Policy on `questions`: FILTER + BLOCK predicates using the same `fn_tenant_access_predicate` function already created in Phase 0 (no new predicate function needed — it's generic over any table with an `organization_id` column).
- Every service method touching `questions` goes through `TenantPrismaService.forTenant()` — never the raw `PrismaService` directly. This is the single most important lesson carried forward from Phase 0 (see `memory.md` Section 4): any code that queries an RLS-protected table outside `forTenant`, or splits a session-context-setting call from its dependent query across separate top-level Prisma calls, reintroduces a proven connection-pooling security bug. This sub-phase's implementation and review must explicitly check for this.

---

## 6. Testing Approach

- **Unit tests** (mocked `TenantPrismaService`) for the per-type validation logic in Section 3 — this is the highest-value test surface here, since the option-correctness rules are the one place real bugs would hide. Cover: valid single/multi/true-false creation, invalid option counts, invalid correct-option counts, invalid marks/negativeMarks combinations.
- **E2E test** (real database) proving:
  - A question created by Organization A is invisible to Organization B (mirroring Phase 0's `tenant-isolation.e2e-spec.ts` pattern, extended to cover `questions`).
  - A full create → list → update → archive flow works end-to-end against the real API and database.

---

## 7. Open Items / Deferred to Future Sub-Phases

- Rich text, images, math equations — Exam Builder or a later "Question Bank v2" pass.
- Bulk import/export — needed before real-world usage at scale, but not blocking this MVP slice.
- AI-generated questions — a stated product differentiator, deferred here per explicit scope decision, not forgotten.
- Reusable tag system — topic/category/difficulty are sufficient for now; revisit if exam-builder search needs richer filtering.
- Frontend UI — arrives with 1b (Exam Builder).
