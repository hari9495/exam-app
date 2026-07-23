# Recruiter Dashboard D3 Redesign — Design

## Goal

Replace the recruiter dashboard's charting (currently `recharts`, currently partly fake) with real, D3-rendered, interactive, "BI-tool style" visualizations backed by real data, plus per-card filter controls — while building a small reusable D3 chart foundation other consoles (panel Reports, a future org-admin dashboard) can build on later.

## Current State

`apps/web/app/(recruiter)/dashboard/page.tsx` uses `recharts` (`BarChart`, `FunnelChart`) and has two real problems:
1. The 4 stat-card "sparklines" are hardcoded fake arrays unrelated to any real metric (e.g. `sparkline={[3, 5, 4, 7, 6]}` passed regardless of the actual stat) — non-functional decoration.
2. The "Candidate funnel" chart IS wired to real data (`GET /api/v1/dashboard/summary`'s `funnel` field) but uses Recharts' default styling: small (`h-40`), no tooltips, no legend, no interactivity.

The rest of the dashboard (stat card numbers, Upcoming exams, Needs your attention, Recent activity lists) works correctly today and is out of scope — this redesign only touches charting.

The backend (`apps/api/src/dashboard/dashboard.service.ts`) currently returns only current point-in-time totals — no historical/time-series data, no per-exam breakdown, no filtering support of any kind.

## Scope

Recruiter dashboard only (`apps/web/app/(recruiter)/dashboard/page.tsx`). Org-admin has no dashboard page today; panel's Reports pages have no charts today — both are explicitly out of scope for this pass, but the D3 chart components built here (`apps/web/components/charts/`) are designed to be reusable there later without rework.

## Visualizations & Filters

Confirmed via mockup iteration (teal `#0d9488` / charcoal `#334155` / coral `#f2765f` / gold `#d4a017` palette, replacing the default Recharts blue and explicitly not matching either reference screenshot's palette):

### 1. Stat cards (4: Total candidates, Invitations sent, Attempts in progress, Pending grading)
- Bold gradient-filled cards (not thin-bordered), each with an icon, the big number, a trend-direction pill (▲/▼ + %), and a real D3 line+area sparkline underneath.
- **Filter**: a trend-window dropdown per card (7 / 14 / 30 days, default 14) — changes ONLY the sparkline's data window. The big number is always the true current all-time total, never affected by this filter.
- Sparkline data: new daily-bucketed counts for that specific metric over the selected window.

### 2. Exam performance (new chart, replaces nothing — additive)
- Grouped/dual bar chart: for each exam, one bar for pass rate %, one bar for average score %, both from settled (`submittedAt` not null, has a `Result`) attempts only. Value labels rendered above each bar.
- **Filters**: "Top N exams" dropdown (5 / 10 / All, default 5, ranked by candidate volume) and a time-range dropdown (All time / Last 30 days / Last 90 days, default All time, filtering by `Result`'s underlying attempt's `submittedAt`).

### 3. Candidate funnel
- Horizontal bar-style funnel (Invited → Started → Submitted → Passed), each stage showing its count and the %-drop from the previous stage, real hover tooltip with exact counts.
- **Filters**: an exam dropdown (All exams aggregate, default, or one specific exam) and a time-range dropdown (All time / Last 30 days / Last 90 days, default All time, filtering by invitation `invitedAt`).

## Architecture

### D3-for-math, React-for-render

Rather than letting D3 own the DOM (the common "D3 tutorial" pattern of `d3.select(ref.current)` imperatively building SVG in a `useEffect`), this uses D3's scale/shape/interpolation functions purely for the math, and renders actual `<svg>`/`<path>`/`<rect>` JSX elements. This is the standard way to combine D3 with React: no fighting over DOM ownership, works naturally with hooks/state/Tailwind, and each chart is a normal, testable React component.

New files under `apps/web/components/charts/` (new directory — first reusable chart components in this codebase):
- `Sparkline.tsx` — line + gradient-fill area chart. Props: `data: { date: string; value: number }[]`, `color: string`. Uses `d3-scale`'s `scaleLinear`/`scaleTime` and `d3-shape`'s `line`/`area` to compute the SVG path `d` attributes.
- `FunnelChart.tsx` — horizontal bar-style funnel. Props: `stages: { label: string; value: number }[]`. Computes each stage's bar width via `d3-scale`'s `scaleLinear`, renders real `<rect>`s with hover state (React `onMouseEnter`/`onMouseLeave` driving a tooltip, not a D3-attached listener) and computes %-drop between adjacent stages in plain JS (no D3 needed for that part).
- `GroupedBarChart.tsx` — grouped/dual bar chart. Props: `groups: { label: string; series: { key: string; value: number; color: string }[] }[]`. Uses `d3-scale`'s `scaleBand` (outer, per-group) + a nested `scaleBand` (inner, per-series) + `scaleLinear` (value axis), with value labels rendered as SVG `<text>` above each bar.

New dependency: `d3-scale`, `d3-shape`, plus their `@types/*` packages (scoped D3 sub-packages, not the full `d3` bundle — this project only needs scales and shape generators, not the rest of D3's DOM/selection/data-loading utilities it will never use).

### Backend: one endpoint per independently-filterable card

Rather than cramming every card's filter combination into `/dashboard/summary`'s query params, each filterable card gets its own endpoint, matching "every card has its own filter state" — a card's filter change only ever refetches that card's own data, not the whole dashboard.

`apps/api/src/dashboard/dashboard.controller.ts` gains three new `@Get` routes (same guards/permissions as the existing `summary` route: `@UseGuards(JwtAuthGuard, PermissionsGuard)`, `@RequireAnyPermission('exam:manage', 'results:view')`):

1. **`GET /api/v1/dashboard/trend?metric=candidates|invitations|attempts|pendingGrading&days=7|14|30`**
   Returns `{ points: { date: string; value: number }[] }` — one point per day in the window, `date` as `YYYY-MM-DD`, `value` as that day's count for the given metric (candidates created that day, invitations sent that day, attempts started that day, or answers newly requiring manual grading that day). Invalid/missing `metric` → 400. `days` defaults to 14 if omitted, clamped to {7, 14, 30}.

2. **`GET /api/v1/dashboard/exam-performance?limit=5|10|all&window=all|30d|90d`**
   Returns `{ exams: { examId: string; examTitle: string; passRate: number; avgScore: number; candidateCount: number }[] }`, one entry per exam with at least one settled attempt in the window, sorted by `candidateCount` descending, truncated to `limit` (or all, if `limit=all`). `passRate`/`avgScore` are 0–100 percentages, computed from that exam's `Result` rows (`passFail`/`percentage`) whose attempt fell in the window.

3. **`GET /api/v1/dashboard/funnel?examId=all|<uuid>&window=all|30d|90d`**
   Returns `{ invited: number; started: number; submitted: number; passed: number }`, scoped to one exam (or aggregated across all of the org's exams if `examId=all`) and to invitations created within the window (or all-time). Existing `funnel` field on `/dashboard/summary`'s response is removed — replaced entirely by this endpoint (the frontend's default view calls it with `examId=all&window=all`, reproducing today's numbers exactly).

`DashboardService` (`apps/api/src/dashboard/dashboard.service.ts`) gains three new methods (`getTrend`, `getExamPerformance`, `getFunnel`) implementing the above; the existing `getSummary` loses its `funnel` computation (now dead code there) and its return type drops the `funnel` field.

### Frontend: one hook per endpoint

`apps/web/lib/hooks/useDashboard.ts` gains `useDashboardTrend(metric, days)`, `useDashboardExamPerformance(limit, window)`, `useDashboardFunnel(examId, window)` — each a `useQuery` keyed on its own parameters (so changing one card's filter only invalidates/refetches that card, via React Query's normal per-key caching), following the exact pattern of the existing `useDashboardSummary`.

The dashboard page's 4 `StatCard` instances and the funnel/exam-performance cards each own their own filter dropdown state (`useState`) and pass it into their respective hook — no shared/global filter state needed, since every card filters independently per the "simple dropdown filters" decision.

## Testing

- Each new D3 chart component gets its own test file (`Sparkline.test.tsx`, `FunnelChart.test.tsx`, `GroupedBarChart.test.tsx`) verifying: correct number of rendered SVG elements for given data, tooltip appears on hover, empty-data renders without crashing.
- `DashboardService`'s three new methods get unit tests mirroring `dashboard.service.spec.ts`'s existing style: correct aggregation math, correct window filtering, correct handling of an org with zero exams/attempts (no crashes, sensible zeroed output).
- `DashboardController`'s three new routes get tests confirming query param validation (bad `metric`/`limit`/`window` → 400) and guard/permission inheritance.
- Dashboard page test (`page.test.tsx`) gets new tests confirming: changing a stat card's trend-window dropdown calls `useDashboardTrend` with the new `days` value; changing the exam-performance or funnel filters calls their hooks with the new params; existing tests for the lists (Upcoming exams, Needs attention, Recent activity) are untouched since those aren't part of this redesign.

## Out of Scope

- Org-admin dashboard (doesn't exist yet) and panel Reports charts (no charts today) — the D3 components are reusable there later, but building new pages/charts for those consoles is a separate future effort.
- Full cross-filtering (clicking a bar/legend in one chart filtering others) — explicitly declined in favor of simple independent per-card dropdowns.
- Persisting filter selections (e.g. in the URL) across page reloads — each card's filter resets to its default on navigation/reload, matching this session's YAGNI preference; not asked for.
- Any change to the non-chart parts of the dashboard (stat card numbers themselves, Upcoming exams, Needs your attention, Recent activity) — these already work correctly and aren't part of the charting problem this redesign solves.
