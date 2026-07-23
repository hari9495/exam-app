# Recruiter Dashboard Global Date-Range Filter — Design

## Goal

Replace the recruiter dashboard's 10 independent per-card filter controls with a single, dashboard-wide date-range selector that also changes the 4 stat cards' headline numbers — not just their sparklines — so the whole page reflects one selected time period.

## Current State

`apps/web/app/(recruiter)/dashboard/page.tsx` (built earlier this session, see `docs/superpowers/specs/2026-07-23-recruiter-dashboard-d3-redesign-design.md`) currently has:

- 4 stat cards, each with its own "trend window" dropdown (7/14/30 days) that filters only the sparkline underneath a fixed, always-all-time headline number (`totalCandidates`, `invitationsSent`, `attemptsInProgress`, `pendingGradingCount` from `GET /dashboard/summary`, which has no date parameter at all).
- A "Candidate funnel" card with its own "Funnel exam" (all exams / one specific exam) and "Funnel window" (all time / 30d / 90d) dropdowns, backed by `GET /dashboard/funnel?examId=&window=`.
- An "Exam performance" card with its own "Top exams" (5/10/all) and "Performance window" (all time / 30d / 90d) dropdowns, backed by `GET /dashboard/exam-performance?limit=&window=`.

That's 10 separate controls across 6 cards, each independently stateful.

## Scope

Recruiter dashboard only, same as the D3 redesign this extends. This is a breaking simplification of that redesign's filter model — approved explicitly, including the loss of per-exam funnel drill-down and the 5/10/all exam-performance choice (see "Removed Functionality" below).

## What Changes

### 1. One control replaces ten

A single `Select` next to the "Dashboard" `<h1>`, options **7 days / 14 days / 30 days / 90 days / All time**, defaulting to **14 days** on load. It is the dashboard's only filter control.

### 2. Removed functionality

These disappear entirely — not just visually, but as capabilities:

- Each stat card's own trend-window dropdown.
- "Funnel exam" — the funnel always aggregates **all exams**; there is no way to view a single exam's funnel from this dashboard anymore.
- "Funnel window" — driven by the global range instead.
- "Top exams" — exam performance always shows **top 5** (by candidate volume, same tiebreak as today); there is no way to see 10 or all exams from this dashboard anymore.
- "Performance window" — driven by the global range instead.

### 3. What each number means under a selected range

Every headline number and every chart becomes "count of X whose defining date falls within the selected range," so a stat's big number and its own sparkline are always mutually consistent (the number is the sum of exactly what the sparkline draws). "All time" means no lower date bound — identical to today's numbers.

| Card / stage | Filtered by |
|---|---|
| Total candidates | `Candidate.createdAt` in range |
| Invitations sent | `Invitation.invitedAt` in range |
| Attempts in progress | `Attempt.startedAt` in range **and** `status = 'in_progress'` (an attempt started 40 days ago that's still open won't count under "Last 14 days" — this is a deliberate, approved semantic: the number answers "of what started in this window, how much is still open," not "how many are open right now regardless of age") |
| Pending grading (stat card only) | `Attempt.submittedAt` in range **and** `status = 'pending_manual_grade'` |
| Candidate funnel, all 4 stages | `Invitation.invitedAt` in range (unchanged from today's `getFunnel` — just gains 7d/14d as selectable windows alongside the existing 30d/90d/all) |
| Exam performance | settled attempt's `submittedAt` in range (unchanged from today's `getExamPerformance` — same 7d/14d addition) |

**Explicitly NOT windowed by the global filter** (unchanged from today, on purpose):

- **"Needs your attention" → pending-grading list**: stays an unfiltered, all-time "what needs grading right now" operational to-do list. This is deliberately a *different query* from the stat card's windowed `pendingGradingCount` — conflating them would mean picking "Last 7 days" hides a 3-week-old ungraded answer that still genuinely needs attention, which would be an operational hazard, not a simplification.
- **"Needs your attention" → proctoring flags and stale-invitation count**: both already operate on their own fixed recency logic (5 most recent flags; invited 5+ days ago with no attempt), independent of any selected window. Unchanged.
- **"Recent activity" feed**: already a fixed most-recent-10 log. Unchanged.
- **"Upcoming exams"**: already filtered by a *future* availability window, which is a different axis than "when did this happen." Unchanged.

## Architecture

### Backend

`apps/api/src/dashboard/dashboard.service.ts` / `dashboard.controller.ts`:

- **`GET /dashboard/summary`** gains a `window` query param: `7d|14d|30d|90d|all` (same enum introduced below for funnel/exam-performance), validated the same way the existing `window` params are (invalid/missing → 400). `getSummary`'s stat queries switch from all-time to range-filtered per the table above. This requires **two separate pending-grading queries**: one windowed (feeds `stats.pendingGradingCount`) and one unwindowed (feeds `attention.pendingGrading`, unchanged) — they are not the same query reused, because their intended meanings differ (see table above).
- **`GET /dashboard/trend`** keeps its existing `metric`/`days` params, but `days` widens from `7|14|30` to `7|14|30|90`. "All time" is not a valid `days` value for this endpoint — the frontend caps it to `90` when the global range is "All time," so the sparkline shows the most recent 90 days of daily activity even when the headline number (from `/dashboard/summary?window=all`) is truly all-time. A year of daily points would be unreadable in a 200px-wide sparkline regardless; this keeps the chart meaningful without inventing weekly/monthly bucketing for a first version.
- **`GET /dashboard/funnel`** and **`GET /dashboard/exam-performance`**: their `window` enum widens from `all|30d|90d` to `7d|14d|30d|90d|all` (add the two missing branches to each service method's window-to-`daysAgo()` mapping and each controller's `WINDOWS` validation array — no other logic changes). Their `examId`/`limit` params are untouched server-side (still accept any value, still tested) — only the frontend stops exposing UI for anything other than `examId=all` and `limit=5`.

### Frontend

`apps/web/app/(recruiter)/dashboard/page.tsx`:

- One `useState` at the top of `DashboardPage`, e.g. `const [range, setRange] = useState('14d')`, rendered as a single `Select` next to the `<h1>Dashboard</h1>`.
- `StatCard` drops its own `useState('14')`/trend-window `Select` and instead receives `range` as a prop, converting it to `useDashboardTrend`'s `days` (mapping `'all'` → `90`) and to `useDashboardSummary`'s new `window` param.
- `useDashboardSummary` gains a `range` argument, threaded into its query key and URL (`/dashboard/summary?window=${range}`), matching the existing hook patterns.
- `CandidateFunnelCard` drops its `examId`/`windowValue` state and the `useExams` call (no longer needed without an exam picker) — always calls `useDashboardFunnel('all', range)`.
- `ExamPerformanceCard` drops its `limit`/`windowValue` state — always calls `useDashboardExamPerformance(5, range)`.
- `apps/web/lib/types.ts`: `DashboardWindow` widens from `'all' | '30d' | '90d'` to `'all' | '7d' | '14d' | '30d' | '90d'` (one shared type now covers summary/funnel/exam-performance's `window` param); `useDashboardTrend`'s `days` type widens to include `90`.

## Testing

- Backend: `dashboard.service.spec.ts` gains window-filtering tests for each of `getSummary`'s 4 stats (including a test proving the pending-grading stat and the attention-list pending-grading count come from independently-filtered queries) and 7d/14d window tests for `getFunnel`/`getExamPerformance`. `dashboard.controller.spec.ts` gains validation tests for `summary`'s new `window` param and the widened `WINDOWS` enum on the other two routes, plus a `trend` test confirming `days=90` is now accepted.
- Frontend: `page.test.tsx` updates every existing mock/assertion that referenced a per-card filter dropdown (removed) to instead exercise the single global range `Select`, confirming changing it triggers a refetch of all 4 stat trends, the summary, the funnel, and exam-performance with matching parameters.

## Out of Scope

- Any calendar-based custom date range (start/end date picking) — presets only, matching this app's existing filter convention everywhere else.
- Restoring a per-exam funnel view or a >5-exam performance view through any other mechanism (e.g. a link to a dedicated non-dashboard page) — not asked for.
- Weekly/monthly bucketing for long trend windows — the 90-day cap on "All time" sparklines is the accepted simplification for this pass.
- Any change to "Needs your attention," "Recent activity," or "Upcoming exams" beyond the pending-grading query split already described.
