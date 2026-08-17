# ATS-lite Candidate Pipeline — Design Spec

**Date:** 2026-08-17
**Status:** Approved (design), pending implementation plan
**Feature:** Recruiter-facing candidate pipeline (jobs, stages, board, feedback)

## Goal

Give recruiters a lightweight applicant-tracking pipeline: create **jobs**, move
**candidates** through fixed **stages** on a board, and record **feedback** (notes +
ratings). This is the backbone that the later candidate-experience and
recruiter-analytics features attach to — so the data model is chosen for them to
build on, not just for this feature.

## Anchor decision (why a Job entity)

The app has no "job/requisition" concept today. A `Candidate` is org-scoped with
its own `status` and has **many** `Invitation`s (one per exam). Three ways to
anchor a pipeline stage were considered:

- **A. Per-candidate (org-wide)** — one stage per candidate. Collapses when a
  person is considered for two roles.
- **B. Job/Position entity** — a candidate moves through stages *per job*.
- **C. Anchor to Exam/Drive** — stage tracked per existing hiring context.

**Decision: build B; A and C become entry points, not rival mechanisms.**
The `PipelineEntry` (candidate-in-a-job) is the single source of truth for stage.
A plain candidate not in any pipeline is just an ordinary candidate row (A falls
out for free). An exam is *linked* to a job so that running candidates through it
places them in that job's pipeline (C is an entry point, not a separate stage
store). This avoids three contradictory stage fields on one candidate.

## Global constraints

- **Stages are a fixed enum** (v1): `applied → screened → interview → offer → hired`.
  `rejected` is a terminal *outcome flag*, orthogonal to stage — not a sixth stage.
  Configurable stages are deferred until a customer asks.
- **Movement is manual.** The recruiter owns every stage transition. Exam results
  are *shown* on the card but never auto-move a candidate in v1.
- **Exam result is derived at read time**, never stored on the entry (same pattern
  as `deriveDriveState`) — always fresh, nothing to keep in sync.
- **Entry points in v1:** manual add + from-exam. Drive→job linking is deferred to
  the Drives-deepening feature.
- **Permissions:** `pipeline:manage` (structure) seeded to recruiter + org-admin;
  feedback gated behind `results:view` (adds panel members).
- All new tables are org-scoped with RLS, following the existing pattern.

## Data model

Four new tables (Prisma + Azure SQL, RLS on each via the existing
`sp_set_session_context` pattern).

### `Job` (`jobs`)
| field | type | notes |
|---|---|---|
| id | uuid PK | |
| organizationId | uuid | RLS scope |
| title | string | required |
| description | string? | nvarchar(max) |
| status | string | `open` \| `closed`, default `open` |
| createdById | uuid | staff user |
| createdAt | datetime | default now |
| closedAt | datetime? | set when status→closed |

Relations: `entries PipelineEntry[]`, `examLinks JobExam[]`.

### `PipelineEntry` (`pipeline_entries`) — owns the stage
| field | type | notes |
|---|---|---|
| id | uuid PK | |
| organizationId | uuid | RLS scope |
| jobId | uuid FK → Job | onDelete Cascade |
| candidateId | uuid FK → Candidate | onDelete Cascade |
| stage | string | `applied`\|`screened`\|`interview`\|`offer`\|`hired`, default `applied` |
| rejected | bool | default false |
| rejectedReason | string? | free text |
| rejectedAt | datetime? | |
| enteredVia | string | `manual` \| `exam` |
| createdAt | datetime | default now |
| updatedAt | datetime | @updatedAt |

**`@@unique([jobId, candidateId])`** — one entry per candidate per job. This is
what lets the same person sit in two different jobs (two entries) without
contradiction, and makes "add candidate" idempotent.

Relations: `feedback PipelineFeedback[]`.

### `PipelineFeedback` (`pipeline_feedback`) — unified note+rating timeline
| field | type | notes |
|---|---|---|
| id | uuid PK | |
| organizationId | uuid | RLS scope |
| entryId | uuid FK → PipelineEntry | onDelete Cascade |
| authorUserId | uuid | staff user (current user) |
| note | string? | nvarchar(max) |
| rating | int? | 1..5 |
| createdAt | datetime | default now |

Service enforces **at least one of `note`/`rating`** present. Append-only in v1
(edit/delete-own is a deferred nice-to-have).

### `JobExam` (`job_exams`) — links an exam to a job (C entry point)
| field | type | notes |
|---|---|---|
| id | uuid PK | |
| organizationId | uuid | RLS scope |
| jobId | uuid FK → Job | onDelete Cascade |
| examId | uuid FK → Exam | onDelete Cascade — removes the *link row* when the exam is deleted; `PipelineEntry` has no exam FK, so entries are untouched |
| createdAt | datetime | default now |

**`@@unique([jobId, examId])`**. Deleting an exam removes its link rows but leaves
`PipelineEntry` rows intact (the candidate stays in the pipeline; that exam's
derived result simply stops appearing).

> **SQL Server cascade caveat (plan must verify):** `pipeline_entries` has cascade
> FKs from both `jobs` and `candidates`, and `job_exams` from both `jobs` and
> `exams` — but these are independent roots, so no single delete reaches one table
> by two cascade paths (no P1012). The migration task must still confirm this at
> `migrate deploy` time; if a path conflict surfaces, drop the offending FK to
> `NoAction` and clean up in the service (the fix used for the Drives migration).

### Derived exam result (read-time, not stored)
For a `PipelineEntry`: join `candidate` → that candidate's `Invitation`s whose
`examId` is in the job's linked exams → most-recent `Attempt`/`Result` per exam →
`{ examTitle, passFail, score }[]`. Computed by a pure helper, surfaced on the card
and in the drawer. No column, no stamping.

## Stage machine & entry logic

- `PIPELINE_STAGES = ['applied','screened','interview','offer','hired']` (ordered).
  A pure `isValidStage(s)` guard is the entire "machine." Movement to **any** stage
  is allowed (forward or back) — recruiters skip and backtrack.
- **Reject:** `PATCH` sets `rejected=true`, `rejectedReason?`, `rejectedAt=now`,
  leaving `stage` untouched (records *where* they were when rejected).
- **Un-reject:** any stage move clears `rejected`/`rejectedReason`/`rejectedAt` in
  the same operation.
- **Manual add (A):** upsert `PipelineEntry(jobId, candidateId, stage=applied,
  enteredVia=manual)`. The `@@unique` makes re-adding a no-op.
- **From-exam (C):**
  - *Link:* creating a `JobExam` triggers a **backfill** — every candidate already
    invited to that exam gets an upserted `PipelineEntry(enteredVia=exam,
    stage=applied)`.
  - *Going forward:* a hook in `invitations.service` `create`/`bulkInvite` upserts
    an entry for each job the exam is linked to. Mirrors Drives' `register()`
    stamping `driveSessionId`.
  - **Stamp-if-absent, never reassign:** upsert never overwrites an existing
    entry's stage (an `interview`-stage candidate re-invited to a linked exam is
    not yanked back to `applied`). `enteredVia` records the *first* reason the
    candidate entered and is likewise never rewritten (a manually-added candidate
    later invited to a linked exam stays `enteredVia=manual`).

## API surface

New `pipeline` module (api), org-scoped via `TenantContext`/RLS, shaped like the
`drives` module. Every structural write records an `audit` entry.

**Jobs**
- `POST /jobs` — `{title, description?}` — `pipeline:manage`
- `GET /jobs?status=open|closed` — list w/ per-stage entry counts — `results:view`
- `GET /jobs/:id` — job + linked exams — `results:view`
- `PATCH /jobs/:id` — title/description/status — `pipeline:manage`
- `DELETE /jobs/:id` — cascades entries/links/feedback — `pipeline:manage`

**Pipeline board & entries**
- `GET /jobs/:id/pipeline` — entries grouped by stage + `rejected` bucket, each with
  candidate info, derived exam results, avg rating, feedback count — `results:view`
- `POST /jobs/:id/entries` — `{candidateId}` or `{newCandidate:{name,email,phone?}}`;
  idempotent upsert at `applied` — `pipeline:manage`
- `PATCH /entries/:id` — `{stage}` move **or** `{rejected:true, reason?}`; a stage
  move clears reject fields — `pipeline:manage`
- `DELETE /entries/:id` — remove candidate from this pipeline (not delete candidate)
  — `pipeline:manage`

**Exam links** (`pipeline:manage`)
- `POST /jobs/:id/exams` — `{examId}` + backfill
- `DELETE /jobs/:id/exams/:examId` — unlink (entries remain)

**Feedback** (`results:view` — panelists included)
- `POST /entries/:id/feedback` — `{note?, rating?}`, ≥1 required; author = current user
- `GET /entries/:id/feedback` — full timeline

## Frontend (recruiter console)

Follows existing recruiter patterns (`Table`, `Card`, `StatusBadge`, React Query
hooks; the drives pages are the closest template).

- **Jobs list `/jobs`:** table (title link, status badge, compact stage-count
  summary, created date), create-job `Card` (title + optional description), status
  filter, delete via trash + `confirm()`.
- **Job board `/jobs/[jobId]`:** header with title/status/edit/close and a
  "Linked exams" chip row + "Attach exam" picker (`pipeline:manage`). Board has five
  stage columns of candidate cards; a card shows name, derived exam result chip(s),
  average star rating, feedback count, entered-via hint. **Moving uses a stage
  `<select>` on each card (plus reject), not drag-and-drop** — accessible,
  platform-native, one `PATCH`. "Add candidate" modal (search existing or create
  new). A **Rejected tab** lists rejected entries with reason + "move back."
- **Candidate drawer:** candidate details, full derived exam results, and the
  **feedback timeline** (author, time, note, stars) with a compose box (note +
  optional star) visible to `results:view` so panelists can rate.
- **Hooks:** `useJobs`, `useJob`, `useJobPipeline`, `useCreateJob`, `usePatchJob`,
  `useDeleteJob`, `useAddEntry`, `usePatchEntry`, `useLinkExam`, `useUnlinkExam`,
  `useFeedback`, `useAddFeedback`. No polling — React Query invalidation on mutation.

## Edge cases

- Same candidate, two jobs → two entries (`@@unique` is per-job).
- Re-invite an advanced candidate to a linked exam → upsert never resets stage.
- Link an exam mid-hunt → backfill pulls in already-invited candidates.
- Exam deleted after linking → link rows gone, entries stay, that result stops showing.
- Candidate erased (GDPR) → entries cascade with candidate; feedback cascades with entries.
- Rejected then reconsidered → any stage move clears reject flags.
- Feedback with neither note nor rating → rejected by service.

## Testing

- **Backend unit (jest):** `isValidStage` guard; entry upsert idempotency +
  stamp-if-absent; reject/un-reject transitions; feedback ≥1-required; derived
  exam-result join; exam-link backfill; per-endpoint permission gate
  (`pipeline:manage` vs `results:view`) proven by 401/403.
- **Frontend unit (jest + RTL):** board groups by stage; card renders derived
  result + avg rating; stage-select fires PATCH; reject moves card to Rejected tab;
  feedback compose posts + appends.
- **Manual/browser at deploy:** create job → link exam → invite candidate → appears
  at `applied` → move → leave starred feedback → reject + un-reject.

## Out of scope (v1)

Auto-advance on exam results (fast-follow); drive→job linking (Drives-deepening);
configurable stages; fixed reason lists; drag-and-drop; headcount/richer job fields
(analytics); public application forms & resume parsing (candidate-experience);
pipeline analytics/funnel charts (analytics); email/calendar notifications; bulk
stage moves; edit/delete-own feedback.
