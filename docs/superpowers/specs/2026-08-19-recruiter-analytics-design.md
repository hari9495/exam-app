# Recruiter Analytics — Design Spec

**Date:** 2026-08-19
**Status:** Approved (design), pending implementation plan
**Feature:** Hiring-funnel analytics over the ATS pipeline (feature #3 of 4)

## Goal

Give recruiters a dedicated "Hiring Analytics" page that reports, for a chosen
date window and (optionally) a single job: the **hiring funnel** (stage
conversion), **time-to-hire**, **source/entry-point effectiveness**, and a
**per-job overview** — all derived read-only from the existing `PipelineEntry`
data. No new write model, no new external dependency.

## Anchoring decisions (from brainstorming)

1. **Snapshot-derived, from current `PipelineEntry` rows.** No per-stage
   transition history is stored, but stages are ordered AND a rejected entry
   *preserves* the stage it reached, so a cumulative conversion funnel is
   derivable from the snapshot. Time-to-hire is **approximate** (`updatedAt −
   createdAt` on hired entries) — accepted. (A precise `StageTransition` table
   is the deferred upgrade.)
2. **Metric set:** hiring funnel + time-to-hire + source effectiveness +
   jobs-overview table. **Exam pass-rate is OUT** — the existing recruiter
   dashboard (`dashboard.service.getExamPerformance`) already reports it.
3. **Dedicated `/analytics/hiring` page** (new recruiter nav item), with a
   **date-window filter** (reusing the dashboard's `Window` convention) + a
   **job filter** (all / one). Gated on `results:view` (no new permission).
4. **Single cohort definition:** `PipelineEntry` with `createdAt` in the window
   (+ matching `jobId` if set). All panels operate on that cohort — one
   coherent "candidates who entered the pipeline in this window."

## Global constraints

- **Read-only.** No schema change, no new table, no writes. Pure aggregation
  over `PipelineEntry` (+ a `Job` join for the jobs table).
- **Org-scoped** via one `forTenant` block; every query filters `organizationId`
  explicitly (RLS + belt-and-suspenders, matching the codebase).
- **Never errors on empty** — an empty cohort returns zeroed/empty structures,
  not a 500.
- **No new charting dependency** — reuse the existing dashboard's D3
  chart/stat-tile components.
- Pure derivation lives in a unit-tested `pipeline-analytics.ts` module; the
  service only fetches rows and calls it.
- Approximate time-to-hire and the "moved-backward understates reached" case are
  the two known, documented imprecisions of the snapshot model.

## Metric derivation (`pipeline-analytics.ts`, pure)

`STAGE_ORDER = ['applied','screened','interview','offer','hired']` (index 0–4).
For an entry, `stageIndex = STAGE_ORDER.indexOf(entry.stage)`.

- **Hiring funnel.** For the intermediate stages k ∈ {applied(0), screened(1),
  interview(2), offer(3)}: "reached k" = `stageIndex ≥ k` — counts active,
  hired, and rejected-at-or-past entries (a rejected entry preserves its stage,
  so it genuinely counts toward every stage up to where it stopped).
  `reached[applied]` = whole cohort. For the **terminal** stage `hired(4)`:
  `reached[hired] = count(stage == 'hired' && !rejected)` — a successful hire,
  explicitly excluding the rare/degenerate rejected-at-hired case (reject
  preserves stage, so `stage == 'hired'` alone is not sufficient). Per stage
  output `{ stage, reached, conversionFromPrev }` where `conversionFromPrev =
  reached[k]/reached[k-1]` (null for `applied`; **0/null, never NaN, when
  `reached[k-1] == 0`**). `hired = reached[hired]` (the same value, reused by
  time-to-hire and the jobs table so every panel's "hired" agrees).
- **Time-to-hire.** For hired entries (`stage == 'hired' && !rejected` — same
  definition as the funnel): `durationDays = (updatedAt − createdAt) /
  86_400_000`. Output `{ avgDays, medianDays, hiredCount }`;
  `avgDays`/`medianDays` are `null` when `hiredCount == 0`.
- **Source effectiveness.** Group cohort by `enteredVia` (`manual` | `exam` |
  `application`). Per source `{ source, entered, hired, hireRate }` where `hired`
  uses the same `stage == 'hired' && !rejected` rule and `hireRate =
  hired/entered` (0 when `entered == 0`). Sorted by `hireRate` desc.
- **Jobs overview.** Group cohort by `jobId`, join `Job` for `title`/`status`.
  Per job `{ jobId, title, status, entered, hired, conversionPct,
  avgTimeToHireDays }` — `hired` uses the same rule, `conversionPct =
  hired/entered * 100`, `avgTimeToHireDays` = avg of that job's hired-entry
  durations (null if none).

All inputs are the fetched `PipelineEntry` rows (with `stage`, `rejected`,
`enteredVia`, `createdAt`, `updatedAt`, `jobId`) plus a `{jobId → {title,status}}`
map. Deterministic and side-effect-free.

## API surface

New `pipeline-analytics` NestJS module (separate from the exam-focused
`dashboard` module).

- **`GET /analytics/hiring?from=<iso>&to=<iso>&jobId=<uuid?>`** (`results:view`):
  ```
  {
    funnel:     { stage: string; reached: number; conversionFromPrev: number | null }[]  // 5 rows
    timeToHire: { avgDays: number | null; medianDays: number | null; hiredCount: number }
    sources:    { source: string; entered: number; hired: number; hireRate: number }[]
    jobs:       { jobId: string; title: string; status: string; entered: number;
                  hired: number; conversionPct: number; avgTimeToHireDays: number | null }[]
  }
  ```
  - `from`/`to`: window bounds; default to the last 90 days when absent (matching
    the dashboard's `Window` convention). Cohort = `PipelineEntry` with
    `createdAt` in `[from, to]`, `organizationId` scoped.
  - `jobId` (optional): scopes **funnel / timeToHire / sources** to one job.
    **`jobs`** is ALWAYS the org-wide per-job rollup (it is the cross-job
    comparison), independent of `jobId`.
  - Empty cohort → `funnel` with all-zero `reached`, `timeToHire`
    `{null,null,0}`, `sources: []`, `jobs: []`.

- The job-filter dropdown reuses the **existing `useJobs` hook** — no new
  list endpoint.

Runs inside one `forTenant`; the service fetches the cohort rows + the job
title/status map, then calls the pure module.

## Frontend

Dedicated **`/analytics/hiring`** page (recruiter console), reusing existing
components — layout + wiring, no new visual primitives.

- **Filter bar:** the dashboard's existing date-`Window` selector +
  a job dropdown (`useJobs`: "All jobs" | one job). Either change refetches via
  `useHiringAnalytics({ from, to, jobId })`.
- **Funnel panel:** horizontal bar/funnel of the 5 stages with counts +
  `conversionFromPrev` %, drop-off called out. Reuses the dashboard's D3 bar
  chart.
- **Time-to-hire panel:** stat tiles (avg days / median days / hired count),
  matching the dashboard stat-tile style.
- **Source effectiveness panel:** compact table/bar (source, entered, hired,
  hire-rate), sorted by hire-rate desc.
- **Jobs overview table:** shared `Table` — title (links `/jobs/:id`), status
  `StatusBadge`, entered, hired, conversion %, avg time-to-hire; row click sets
  the job filter; hidden when a single job is already selected.
- **States:** honest zeros/empties for a new org; loading skeleton while
  fetching; `results:view`-gated.
- **Nav:** add "Hiring Analytics" to `lib/recruiter-nav.ts` AND
  `lib/super-admin-nav.ts` (both, per that file's convention).
- **Hooks/types:** `useHiringAnalytics` in `lib/hooks/`; response types in
  `lib/types.ts` mirroring the API shape.

## Edge cases

- Empty cohort → zeroed/empty panels, no 500.
- `reached[k-1] == 0` → `conversionFromPrev` null/0, never NaN.
- Zero hired → `avgDays`/`medianDays`/`avgTimeToHireDays` null.
- Rejected entry → counted in cumulative "reached" to its preserved stage;
  excluded from `hired`.
- Moved-backward entry → `stageIndex` reflects current stage, slightly
  understating "reached" (documented imprecision).
- `jobId` scopes funnel/timeToHire/sources; `jobs` stays org-wide.

## Testing

- **Backend unit** (`pipeline-analytics.ts`): cumulative funnel counts
  (rejected-preserves-stage; hired excludes rejected); conversion zero-guard;
  time-to-hire avg + median (empty → null); source hire-rates; jobs rollup.
  **Service**: org-scoped cohort query with window + `jobId` filtering;
  empty-cohort → zeroed; **controller**: `results:view` gate proven by 401.
- **Frontend unit**: page renders all four panels from a mocked hook; date/job
  change refetches; jobs-table row-click sets the job filter; empty state.
- **Browser smoke (post-deploy)**: open `/analytics/hiring`; funnel +
  time-to-hire + source + jobs render against real pipeline data; date + job
  filters re-scope.

## Out of scope (v1)

Precise time-to-hire / per-stage dwell times (`StageTransition` table); exam
pass-rate (exam dashboard already has it); per-job analytics strip on the job
page; CSV/PDF export; funnel-over-time trend charts (snapshot, not time-series);
rejection-reason text analysis; drive-specific analytics (feature #4);
cross-org benchmarks.
