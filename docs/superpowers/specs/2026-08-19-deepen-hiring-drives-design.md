# Deepen Hiring Drives — Design Spec

**Date:** 2026-08-19
**Status:** Approved (design), pending implementation plan
**Feature:** drive→job linking — the 4th ATS entry point (feature #4 of 4)

## Goal

Connect Hiring Drives to the ATS pipeline: link a `WalkInGroup` to a `Job` so
that anyone who registers via that group's walk-in/drive flow enters the job's
pipeline as a `drive`-sourced candidate — and, near-free, surfaces drives as a
fourth source in the existing recruiter analytics.

## Scope reality (from brainstorming)

The originally-imagined scope was three parts; two are already shipped:

- **QR / link self-registration — ALREADY BUILT.** `WalkInShareCard`
  (`apps/web/components/WalkInShareCard.tsx`) generates a QR (via the `qrcode`
  lib) + copy-link for `/walk-in/:orgSlug?group=<id>`, and the public
  `/walk-in/[orgSlug]` page registers candidates through
  `WalkInService.register`. **Out of scope — reuse as-is.**
- **Drive-sourced analytics — NEARLY AUTOMATIC.** Feature #3's
  source-effectiveness panel already groups by `enteredVia`; once
  `enteredVia='drive'` exists it appears there for free (one label add).

So the real new work is **drive→job linking + the `enteredVia='drive'` entry
point**. This is the deferred 4th ATS entry point (alongside `manual`, `exam`,
`application`).

## Anchoring decisions

1. **Link at the `WalkInGroup` level** (not `DriveSession`). A group is the
   durable container (holds exams, hosts dated sessions) and maps to "we run
   drives for role X." One `jobId` per group, set once. DriveSession-level
   linking is a deferred refinement.
2. **Trigger on ANY registration to a job-linked group** — not gated on a live
   `DriveSession`. Everyone who came through the drive channel is captured;
   `enteredVia='drive'` means "sourced via a hiring drive."
3. **Backfill on link.** Setting a group's `jobId` upserts entries for
   candidates who already registered via that group.

## Global constraints

- **Additive, read-mostly.** One nullable column (`WalkInGroup.jobId`); no new
  table. `enteredVia` gains the string value `'drive'` (no enum migration).
- **Stamp-if-absent everywhere.** The register hook and the backfill both
  `upsert` the `PipelineEntry` with `update:{}` — never reset an existing
  entry's `stage`/`enteredVia` (first-source-wins, consistent with feature #1's
  exam/application hooks).
- **Org-scoped.** `register` is already org-pinned (`forTenant`, resolved from
  the org slug); the pipeline upsert uses that same context. The recruiter
  link/unlink is authenticated + org-scoped.
- **`pipeline:manage`** gates the link/unlink (it configures an ATS entry
  point, matching the ATS exam-link permission).
- Reuse `PipelineService` (exported by `PipelineModule`) for the upsert — do not
  duplicate the upsert logic in `WalkInService`.
- SQL Server migration: `WalkInGroup.jobId` FK `onDelete: SetNull`,
  `onUpdate: NoAction`; schema migration + (if needed) an RLS check — but
  `walk_in_groups` already has its RLS policy, and adding a nullable column
  needs no new predicate.

## Data model

`WalkInGroup` (existing) — one new column:

| field | type | notes |
|---|---|---|
| jobId | uuid? FK → Job | `onDelete: SetNull` (deleting a job unlinks the group; the ATS cascade removes that job's entries separately), `onUpdate: NoAction` |

Back-relation on `Job`: `walkInGroups WalkInGroup[]`.

`enteredVia` on `PipelineEntry` gains the value `'drive'` (no schema change —
it's an unconstrained string).

## The drive entry point

**Register hook** — in `WalkInService.register`, inside the existing org-pinned
`forTenant` transaction, after the candidate is resolved/created:
- Resolve the linked job via the **registered exam's `walkInGroupId`** → that
  group's `jobId` (register is given `examId`; the exam belongs to the group, so
  `exam.walkInGroup.jobId` is the link). If that `jobId` is set, call the
  pipeline upsert:
  ```
  tx.pipelineEntry.upsert({
    where: { jobId_candidateId: { jobId, candidateId } },
    create: { organizationId, jobId, candidateId, stage: 'applied', enteredVia: 'drive' },
    update: {},   // stamp-if-absent: never reset stage/enteredVia on re-register
  })
  ```
  Expose this as a `PipelineService` method (e.g. `upsertDriveEntry(tx, ctx,
  jobId, candidateId)`) so the logic lives with the pipeline, and
  `InvitationsModule`/`WalkInModule` import `PipelineModule` (already exports
  `PipelineService`; watch for no circular dep — `PipelineModule` must not
  import `WalkInModule`).
- Runs inside `register`'s transaction — atomic with the candidate/invitation
  creation.

**Backfill on link** — when a group's `jobId` goes from null → a job:
- Find the **distinct candidates who registered via that group**: candidates
  with an invitation whose exam belongs to the group (`exam.walkInGroupId ===
  groupId`) or whose `driveSession.walkInGroupId === groupId`. Upsert a `drive`
  entry for each (stamp-if-absent).
- Clearing `jobId` (job → null) leaves existing entries untouched.

## API

- **`PATCH /walk-in-groups/:id`** (`pipeline:manage`) accepts `{ jobId: string |
  null }` — set (null → job, runs backfill) or clear. Idempotent; setting the
  same job again is a no-op backfill. The walk-in-group read responses include
  `jobId` so the UI shows the current link.
- No other new endpoints. The job-filter dropdown reuses `useJobs`.

## Frontend

- On the walk-in group management surface (`apps/web/app/(recruiter)/walk-in-groups`
  page / the group modal), an **"Attach job"** control: a dropdown of open jobs
  (`useJobs`) that sets `jobId`, showing the linked job with an unlink ✕. Gated
  on `canManage` (`role !== 'panel'`). This is the only new UI.
- **Analytics label:** add `'drive' → 'Drive'` to the frontend source-label map
  used by the hiring-analytics source panel, so drives render as "Drive." No new
  analytics view.
- Everything downstream (the candidate on the job's pipeline board as a `drive`
  entry; drives in the analytics source panel) is already rendered by features
  #1 and #3.

## Edge cases

- Candidate already in the pipeline (exam/manual/application) then registers via
  a drive → entry exists, `enteredVia` unchanged (first-source-wins).
- Unlink → entries stay (historical `drive` attribution preserved).
- Job deleted → `SetNull` unlinks the group; the ATS cascade removes that job's
  `PipelineEntry` rows separately.
- Backfill + re-register → idempotent via upsert; no duplicates.
- Group with no `jobId` → register hook is a no-op.
- GDPR erase → pipeline entries already cascade with the candidate.

## Testing

- **Backend unit:** register upserts a `drive` entry when `group.jobId` set;
  no-op when null; stamp-if-absent (an existing `interview`-stage entry isn't
  reset); `setJob` link + backfill upserts entries for existing group
  registrants; unlink leaves entries; the `PATCH /walk-in-groups/:id`
  permission gate (`pipeline:manage`, 401/403). No circular-dependency at module
  wiring.
- **Frontend unit:** the attach-job control sets/clears the link and shows the
  linked job; the analytics source panel renders "Drive" for the `drive` source.
- **Browser smoke (post-deploy):** link a group → a job; register via the public
  `/walk-in/:orgSlug?group=` link; confirm the candidate appears on the job's
  pipeline board with `enteredVia=drive`; confirm "Drive" shows in the
  hiring-analytics source panel; unlink and confirm the entry remains.

## Out of scope (v1)

DriveSession-level linking (group-level only); a dedicated per-drive/per-group
analytics dashboard (drive live board/results + the source panel cover it);
a reciprocal "drive groups feeding this job" panel on the job page;
auto-advance from drive results; retroactive re-attribution of `enteredVia`;
any change to the already-shipped QR/self-registration flow.
