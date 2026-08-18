# Recruiter Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A dedicated "Hiring Analytics" page reporting the hiring funnel, time-to-hire, source effectiveness, and a per-job rollup — read-only, derived from `PipelineEntry`.

**Architecture:** A pure `pipeline-analytics.ts` module does all the math; a new `pipeline-analytics` NestJS module (shaped like `apps/api/src/analytics/*` item-analytics) fetches the org-scoped cohort + a job title/status map and calls the pure module behind one `GET /analytics/hiring` endpoint. The frontend is a dedicated page reusing the existing `FunnelChart`, `Card`, and `Table` components — no new charting dependency, no schema change, no migration, no new npm dep.

**Tech Stack:** NestJS 11, Prisma + Azure SQL, Next.js 16 (see `apps/web/AGENTS.md`), React Query, jest + Testing Library. Reuses `apps/web/components/charts/FunnelChart.tsx`.

## Global Constraints

- **Read-only. No schema change, no migration, no new dependency, no writes.** Pure aggregation over `PipelineEntry` (+ a `Job` join for the jobs table).
- **Org-scoped** via one `forTenant` block; queries filter `organizationId` explicitly.
- **Never errors on empty** — an empty cohort returns zeroed/empty structures, not a 500.
- **Stage order (verbatim):** `['applied','screened','interview','offer','hired']`.
- **"reached k"** for k∈{applied(0),screened(1),interview(2),offer(3)} = `stageIndex ≥ k` (rejected entries count up to their preserved stage). **`reached[hired] = count(stage==='hired' && !rejected)`** — the terminal/"hired" definition used by ALL panels.
- **`conversionFromPrev = reached[k]/reached[k-1]`**, null for `applied`, and **null/0 (never NaN) when `reached[k-1]===0`**.
- **Time-to-hire** on hired entries: `durationDays = (updatedAt − createdAt)/86_400_000`; `avgDays`/`medianDays` null when 0 hired.
- **Cohort** = `PipelineEntry` with `createdAt` in `[from,to]` (+ `jobId` if given). `jobId` scopes funnel/timeToHire/sources; `jobs` table is ALWAYS org-wide.
- `results:view` gates the endpoint (no new permission).
- **Windows/Next.js:** don't remove the auto-generated block in `apps/web/AGENTS.md`; commit it if it appears.

---

## File Structure

**Backend (`apps/api/src/analytics/` — extend the existing analytics dir):**
- `pipeline-analytics.ts` — pure `computeHiringAnalytics(entries, jobMeta)` + `HiringAnalytics` types + `STAGE_ORDER`.
- `pipeline-analytics.service.ts` — fetch cohort + job map, call the pure module.
- `pipeline-analytics.controller.ts` — `GET /analytics/hiring`.
- `pipeline-analytics.module.ts` — module (or extend the existing analytics module — see Task 2).
- `*.spec.ts` for pure module, service, controller.
- Modify `apps/api/src/app.module.ts` (register, if a new module).

**Frontend (`apps/web/`):**
- `lib/types.ts` — `HiringAnalytics`, `HiringFunnelRow`, `HiringTimeToHire`, `HiringSourceRow`, `HiringJobRow`.
- `lib/hooks/useHiringAnalytics.ts` — the React Query hook.
- `app/(recruiter)/analytics/hiring/page.tsx` — the page.
- `app/(recruiter)/analytics/hiring/page.test.tsx`.
- `lib/recruiter-nav.ts` + `lib/super-admin-nav.ts` — nav link.

---

## Task 1: Pure analytics module

**Files:**
- Create: `apps/api/src/analytics/pipeline-analytics.ts`
- Test: `apps/api/src/analytics/pipeline-analytics.spec.ts`

**Interfaces:**
- Produces:
  - `STAGE_ORDER = ['applied','screened','interview','offer','hired'] as const`
  - `interface EntryRow { stage: string; rejected: boolean; enteredVia: string; createdAt: Date; updatedAt: Date; jobId: string }`
  - `interface JobMeta { title: string; status: string }`
  - `interface HiringAnalytics { funnel: HiringFunnelRow[]; timeToHire: HiringTimeToHire; sources: HiringSourceRow[]; jobs: HiringJobRow[] }`
  - `HiringFunnelRow = { stage: string; reached: number; conversionFromPrev: number | null }`
  - `HiringTimeToHire = { avgDays: number | null; medianDays: number | null; hiredCount: number }`
  - `HiringSourceRow = { source: string; entered: number; hired: number; hireRate: number }`
  - `HiringJobRow = { jobId: string; title: string; status: string; entered: number; hired: number; conversionPct: number; avgTimeToHireDays: number | null }`
  - `computeHiringAnalytics(entries: EntryRow[], jobMeta: Map<string, JobMeta>): HiringAnalytics`

- [ ] **Step 1: Write the failing test**

`pipeline-analytics.spec.ts`:
```ts
import { computeHiringAnalytics, EntryRow, JobMeta } from './pipeline-analytics';

const d = (iso: string) => new Date(iso);
const row = (o: Partial<EntryRow>): EntryRow => ({
  stage: 'applied', rejected: false, enteredVia: 'manual',
  createdAt: d('2026-08-01T00:00:00Z'), updatedAt: d('2026-08-01T00:00:00Z'), jobId: 'job-1', ...o,
});

describe('computeHiringAnalytics', () => {
  it('empty cohort returns zeroed structures, never throwing', () => {
    const out = computeHiringAnalytics([], new Map());
    expect(out.funnel.map((f) => f.reached)).toEqual([0, 0, 0, 0, 0]);
    expect(out.timeToHire).toEqual({ avgDays: null, medianDays: null, hiredCount: 0 });
    expect(out.sources).toEqual([]);
    expect(out.jobs).toEqual([]);
  });

  it('cumulative funnel counts rejected up to its preserved stage; hired excludes rejected', () => {
    const entries = [
      row({ stage: 'applied' }),
      row({ stage: 'interview' }),                 // reached applied,screened,interview
      row({ stage: 'interview', rejected: true }), // rejected AT interview -> still reached interview
      row({ stage: 'hired' }),                     // reached all + is a hire
      row({ stage: 'hired', rejected: true }),     // degenerate: NOT counted as hired
    ];
    const out = computeHiringAnalytics(entries, new Map([['job-1', { title: 'Backend', status: 'open' }]]));
    // reached: applied=5, screened=4 (idx>=1: two interviews, two hired), interview=4, offer=2 (two hired), hired=1 (only the non-rejected hire)
    expect(out.funnel.find((f) => f.stage === 'applied')!.reached).toBe(5);
    expect(out.funnel.find((f) => f.stage === 'screened')!.reached).toBe(4);
    expect(out.funnel.find((f) => f.stage === 'interview')!.reached).toBe(4);
    expect(out.funnel.find((f) => f.stage === 'offer')!.reached).toBe(2);
    expect(out.funnel.find((f) => f.stage === 'hired')!.reached).toBe(1);
    // conversionFromPrev: applied null; screened 4/5=0.8
    expect(out.funnel.find((f) => f.stage === 'applied')!.conversionFromPrev).toBeNull();
    expect(out.funnel.find((f) => f.stage === 'screened')!.conversionFromPrev).toBeCloseTo(0.8);
  });

  it('conversion is null, not NaN, when the previous stage reached zero', () => {
    const out = computeHiringAnalytics([row({ stage: 'applied' })], new Map());
    // reached applied=1, screened=0, interview=0... conversion screened = 0/1 = 0; interview = 0/0 -> null
    expect(out.funnel.find((f) => f.stage === 'interview')!.conversionFromPrev).toBeNull();
  });

  it('time-to-hire averages/medians hired durations; null when none', () => {
    const entries = [
      row({ stage: 'hired', createdAt: d('2026-08-01T00:00:00Z'), updatedAt: d('2026-08-05T00:00:00Z') }), // 4d
      row({ stage: 'hired', createdAt: d('2026-08-01T00:00:00Z'), updatedAt: d('2026-08-03T00:00:00Z') }), // 2d
      row({ stage: 'hired', rejected: true, updatedAt: d('2026-09-01T00:00:00Z') }),                       // excluded
    ];
    const out = computeHiringAnalytics(entries, new Map());
    expect(out.timeToHire.hiredCount).toBe(2);
    expect(out.timeToHire.avgDays).toBeCloseTo(3);
    expect(out.timeToHire.medianDays).toBeCloseTo(3);
  });

  it('source effectiveness reports per-channel hire rate, sorted desc', () => {
    const entries = [
      row({ enteredVia: 'application', stage: 'applied' }),
      row({ enteredVia: 'application', stage: 'hired' }),
      row({ enteredVia: 'exam', stage: 'hired' }),
    ];
    const out = computeHiringAnalytics(entries, new Map());
    expect(out.sources[0]).toEqual({ source: 'exam', entered: 1, hired: 1, hireRate: 1 });
    expect(out.sources.find((s) => s.source === 'application')).toEqual({ source: 'application', entered: 2, hired: 1, hireRate: 0.5 });
  });

  it('jobs rollup joins title/status and computes per-job conversion + avg time-to-hire', () => {
    const entries = [
      row({ jobId: 'job-1', stage: 'applied' }),
      row({ jobId: 'job-1', stage: 'hired', createdAt: d('2026-08-01T00:00:00Z'), updatedAt: d('2026-08-04T00:00:00Z') }), // 3d
    ];
    const out = computeHiringAnalytics(entries, new Map([['job-1', { title: 'Backend', status: 'open' }]]));
    expect(out.jobs[0]).toMatchObject({ jobId: 'job-1', title: 'Backend', status: 'open', entered: 2, hired: 1, conversionPct: 50, avgTimeToHireDays: 3 });
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd "D:/exam app" && npx jest --config apps/api/jest.config.js src/analytics/pipeline-analytics
```

- [ ] **Step 3: Implement `pipeline-analytics.ts`**

```ts
export const STAGE_ORDER = ['applied', 'screened', 'interview', 'offer', 'hired'] as const;
export type Stage = (typeof STAGE_ORDER)[number];

export interface EntryRow { stage: string; rejected: boolean; enteredVia: string; createdAt: Date; updatedAt: Date; jobId: string; }
export interface JobMeta { title: string; status: string; }
export interface HiringFunnelRow { stage: string; reached: number; conversionFromPrev: number | null; }
export interface HiringTimeToHire { avgDays: number | null; medianDays: number | null; hiredCount: number; }
export interface HiringSourceRow { source: string; entered: number; hired: number; hireRate: number; }
export interface HiringJobRow { jobId: string; title: string; status: string; entered: number; hired: number; conversionPct: number; avgTimeToHireDays: number | null; }
export interface HiringAnalytics { funnel: HiringFunnelRow[]; timeToHire: HiringTimeToHire; sources: HiringSourceRow[]; jobs: HiringJobRow[]; }

const DAY_MS = 86_400_000;
const isHired = (e: EntryRow) => e.stage === 'hired' && !e.rejected;
const stageIndex = (s: string) => STAGE_ORDER.indexOf(s as Stage);
const durationDays = (e: EntryRow) => (e.updatedAt.getTime() - e.createdAt.getTime()) / DAY_MS;

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
function avg(xs: number[]): number | null {
  return xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function computeHiringAnalytics(entries: EntryRow[], jobMeta: Map<string, JobMeta>): HiringAnalytics {
  // Funnel: reached[k] = count(stageIndex >= k) for k<4; reached[hired] = count(isHired)
  const reached = STAGE_ORDER.map((_, k) =>
    k === STAGE_ORDER.length - 1
      ? entries.filter(isHired).length
      : entries.filter((e) => stageIndex(e.stage) >= k).length,
  );
  const funnel: HiringFunnelRow[] = STAGE_ORDER.map((stage, k) => ({
    stage,
    reached: reached[k],
    conversionFromPrev: k === 0 ? null : reached[k - 1] === 0 ? null : reached[k] / reached[k - 1],
  }));

  const hiredDurations = entries.filter(isHired).map(durationDays);
  const timeToHire: HiringTimeToHire = { avgDays: avg(hiredDurations), medianDays: median(hiredDurations), hiredCount: hiredDurations.length };

  const bySource = new Map<string, EntryRow[]>();
  for (const e of entries) { (bySource.get(e.enteredVia) ?? bySource.set(e.enteredVia, []).get(e.enteredVia)!).push(e); }
  const sources: HiringSourceRow[] = [...bySource.entries()]
    .map(([source, rows]) => {
      const hired = rows.filter(isHired).length;
      return { source, entered: rows.length, hired, hireRate: rows.length === 0 ? 0 : hired / rows.length };
    })
    .sort((a, b) => b.hireRate - a.hireRate);

  const byJob = new Map<string, EntryRow[]>();
  for (const e of entries) { (byJob.get(e.jobId) ?? byJob.set(e.jobId, []).get(e.jobId)!).push(e); }
  const jobs: HiringJobRow[] = [...byJob.entries()].map(([jobId, rows]) => {
    const hiredRows = rows.filter(isHired);
    const meta = jobMeta.get(jobId);
    return {
      jobId,
      title: meta?.title ?? '(unknown)',
      status: meta?.status ?? 'unknown',
      entered: rows.length,
      hired: hiredRows.length,
      conversionPct: rows.length === 0 ? 0 : (hiredRows.length / rows.length) * 100,
      avgTimeToHireDays: avg(hiredRows.map(durationDays)),
    };
  });

  return { funnel, timeToHire, sources, jobs };
}
```

- [ ] **Step 4: Run — expect PASS**, then commit

```bash
cd "D:/exam app" && npx jest --config apps/api/jest.config.js src/analytics/pipeline-analytics
git add apps/api/src/analytics/pipeline-analytics.ts apps/api/src/analytics/pipeline-analytics.spec.ts
git commit -m "feat(analytics): pure hiring-analytics module (funnel, time-to-hire, sources, jobs)"
```

---

## Task 2: Service + controller + module

**Files:**
- Create: `apps/api/src/analytics/pipeline-analytics.service.ts`, `pipeline-analytics.controller.ts`, `pipeline-analytics.module.ts`
- Test: `pipeline-analytics.service.spec.ts`, `pipeline-analytics.controller.spec.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `computeHiringAnalytics`, `HiringAnalytics`, `EntryRow`, `JobMeta` (Task 1); `TenantPrismaService` (inject exactly like `apps/api/src/analytics/item-analytics.service.ts`).
- Produces: `PipelineAnalyticsService.getHiring(ctx, { from: Date; to: Date; jobId?: string }): Promise<HiringAnalytics>`; route `GET /analytics/hiring?from=&to=&jobId=`.

- [ ] **Step 1: Write failing service test** — mock `tenantPrisma.forTenant` to run its callback against a `tx` whose `pipelineEntry.findMany` returns cohort rows and `job.findMany` returns the title/status list. Assert `getHiring` filters `createdAt` in `[from,to]` + `organizationId`, applies `jobId` when given, builds the job map, and returns `computeHiringAnalytics`'s output. Assert an empty cohort returns the zeroed shape.

```ts
it('fetches the org-scoped createdAt-window cohort and returns computed analytics', async () => {
  const findMany = jest.fn().mockResolvedValue([
    { stage: 'hired', rejected: false, enteredVia: 'manual', createdAt: new Date('2026-08-01'), updatedAt: new Date('2026-08-04'), jobId: 'job-1' },
  ]);
  const jobFindMany = jest.fn().mockResolvedValue([{ id: 'job-1', title: 'Backend', status: 'open' }]);
  const tx = { pipelineEntry: { findMany }, job: { findMany: jobFindMany } };
  tenantPrisma.forTenant.mockImplementation((_c, fn) => fn(tx));
  const from = new Date('2026-08-01'), to = new Date('2026-08-31');
  const out = await service.getHiring(context, { from, to });
  expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: { organizationId: 'org-1', createdAt: { gte: from, lte: to } },
    select: { stage: true, rejected: true, enteredVia: true, createdAt: true, updatedAt: true, jobId: true },
  }));
  expect(out.timeToHire.hiredCount).toBe(1);
  expect(out.jobs[0].title).toBe('Backend');
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd "D:/exam app" && npx jest --config apps/api/jest.config.js src/analytics/pipeline-analytics.service
```

- [ ] **Step 3: Implement service**

```ts
import { Injectable } from '@nestjs/common';
import { TenantPrismaService, TenantContext } from '@exam-platform/shared';
import { computeHiringAnalytics, HiringAnalytics, EntryRow, JobMeta } from './pipeline-analytics';

@Injectable()
export class PipelineAnalyticsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async getHiring(context: TenantContext, filter: { from: Date; to: Date; jobId?: string }): Promise<HiringAnalytics> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const orgId = context.organizationId as string;
      const where: Record<string, unknown> = { organizationId: orgId, createdAt: { gte: filter.from, lte: filter.to } };
      if (filter.jobId) where.jobId = filter.jobId;
      const entries = (await tx.pipelineEntry.findMany({
        where,
        select: { stage: true, rejected: true, enteredVia: true, createdAt: true, updatedAt: true, jobId: true },
      })) as EntryRow[];
      // jobs table is always org-wide: fetch title/status for every job referenced in the FULL org cohort,
      // not just this filtered set. Fetch all org jobs' meta (small) so the map covers every jobId.
      const jobRows = await tx.job.findMany({ where: { organizationId: orgId }, select: { id: true, title: true, status: true } });
      const jobMeta = new Map<string, JobMeta>(jobRows.map((j) => [j.id, { title: j.title, status: j.status }]));
      return computeHiringAnalytics(entries, jobMeta);
    });
  }
}
```

**Important nuance for the `jobs` table being org-wide:** the spec says `jobs` is ALWAYS the org-wide per-job rollup, independent of `jobId`. But `computeHiringAnalytics` groups only the `entries` it's given, and when `jobId` is set the cohort is one job. Resolve this in the service: fetch **two** entry sets when `jobId` is set — the filtered set (for funnel/timeToHire/sources) and the unfiltered org-window set (for the jobs table) — then merge. Simplest correct implementation:
```ts
// Always fetch the org-wide window cohort for the jobs table; fetch the filtered cohort for the other panels.
const orgWindowWhere = { organizationId: orgId, createdAt: { gte: filter.from, lte: filter.to } };
const filteredWhere = filter.jobId ? { ...orgWindowWhere, jobId: filter.jobId } : orgWindowWhere;
const [filtered, orgWide] = await Promise.all([
  tx.pipelineEntry.findMany({ where: filteredWhere, select: {...} }),
  filter.jobId ? tx.pipelineEntry.findMany({ where: orgWindowWhere, select: {...} }) : Promise.resolve(null),
]);
const full = computeHiringAnalytics(filtered as EntryRow[], jobMeta);
const jobsSource = orgWide ? computeHiringAnalytics(orgWide as EntryRow[], jobMeta) : full;
return { funnel: full.funnel, timeToHire: full.timeToHire, sources: full.sources, jobs: jobsSource.jobs };
```
Add a service test asserting that with `jobId` set, `funnel` reflects only that job but `jobs` still lists all jobs in the window.

- [ ] **Step 4: Implement controller + module**

`pipeline-analytics.controller.ts` (mirror `item-analytics.controller.ts`'s guards/decorators):
```ts
import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { TenantContext } from '@exam-platform/shared';
import { PipelineAnalyticsService } from './pipeline-analytics.service';

@Controller('analytics/hiring')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PipelineAnalyticsController {
  constructor(private readonly service: PipelineAnalyticsService) {}

  @Get()
  @RequirePermissions('results:view')
  getHiring(
    @CurrentTenant() tenant: TenantContext,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('jobId') jobId?: string,
  ) {
    // Default window: last 90 days.
    const toDate = to ? new Date(to) : new Date();
    const fromDate = from ? new Date(from) : new Date(toDate.getTime() - 90 * 86_400_000);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      throw new BadRequestException('Invalid from/to date');
    }
    return this.service.getHiring(tenant, { from: fromDate, to: toDate, jobId });
  }
}
```
`pipeline-analytics.module.ts`: providers `[PipelineAnalyticsService]`, controllers `[PipelineAnalyticsController]`. Register `PipelineAnalyticsModule` in `app.module.ts` (next to the item-analytics/`AnalyticsModule` registration).

Controller test (mirror `item-analytics.controller.spec.ts`): mock the service, assert delegation with parsed dates + jobId; assert `GET /analytics/hiring` is 401 when `JwtAuthGuard` rejects.

- [ ] **Step 5: Run pipeline-analytics suite + api typecheck — expect PASS**, commit

```bash
cd "D:/exam app" && npx jest --config apps/api/jest.config.js src/analytics/pipeline-analytics && npx tsc -p apps/api/tsconfig.json --noEmit
git add apps/api/src/analytics/pipeline-analytics.service.ts apps/api/src/analytics/pipeline-analytics.controller.ts apps/api/src/analytics/pipeline-analytics.module.ts apps/api/src/analytics/pipeline-analytics.service.spec.ts apps/api/src/analytics/pipeline-analytics.controller.spec.ts apps/api/src/app.module.ts
git commit -m "feat(analytics): hiring-analytics service, controller, module"
```

---

## Task 3: Frontend — types, hook, page, nav

**Files:**
- Modify: `apps/web/lib/types.ts`, `apps/web/lib/recruiter-nav.ts`, `apps/web/lib/super-admin-nav.ts`
- Create: `apps/web/lib/hooks/useHiringAnalytics.ts`, `apps/web/app/(recruiter)/analytics/hiring/page.tsx`, `apps/web/app/(recruiter)/analytics/hiring/page.test.tsx`

**Interfaces:**
- Consumes: the `GET /analytics/hiring` response (Task 2); `FunnelChart` (`apps/web/components/charts/FunnelChart.tsx`, props `{ stages: { label: string; value: number }[] }`); `useJobs` (`apps/web/lib/hooks/usePipeline.ts`); `Card`, `Table`, `StatusBadge` from `components/ui`; `DashboardWindow` (`lib/types.ts`) + the dashboard page's window→days mapping.
- Produces types in `lib/types.ts`: `HiringFunnelRow`, `HiringTimeToHire`, `HiringSourceRow`, `HiringJobRow`, `HiringAnalytics` (mirror Task 1's shapes exactly).

- [ ] **Step 1: Read `apps/web/AGENTS.md`**, then read the existing dashboard page (`apps/web/app/(recruiter)/dashboard/page.tsx`) for the `DashboardWindow`→from/to conversion and filter-bar pattern, and `FunnelChart.tsx` for its props.

- [ ] **Step 2: Write failing test** (`page.test.tsx`) — mock `useAuth`, `useJobs`, and `fetch` (or the `useHiringAnalytics` hook) to return a `HiringAnalytics` fixture; render the page; assert the funnel stages render (e.g. "Applied" + a count), the time-to-hire tiles render (avg/median/hired), the source table renders a row, and the jobs table renders a job title linking to `/jobs/:id`. Assert changing the job dropdown refetches (the hook is called with the new `jobId`). Use `apps/web/components/drives/DriveResults.test.tsx` for the fetch-mock pattern.

- [ ] **Step 3: Run — expect FAIL**

```bash
cd "D:/exam app/apps/web" && npx jest "analytics/hiring"
```

- [ ] **Step 4: Implement types + hook + page + nav**

Types in `lib/types.ts` (mirror Task 1). Hook `useHiringAnalytics.ts` (React Query, `apiFetch` + `useAuth`; query key `['analytics','hiring',{from,to,jobId}]`; builds the query string, `enabled` on accessToken):
```ts
export function useHiringAnalytics(params: { from: string; to: string; jobId?: string }) {
  const { accessToken } = useAuth();
  const qs = new URLSearchParams({ from: params.from, to: params.to, ...(params.jobId ? { jobId: params.jobId } : {}) }).toString();
  return useQuery<HiringAnalytics>({
    queryKey: ['analytics', 'hiring', params],
    queryFn: () => apiFetch(`/analytics/hiring?${qs}`, {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}
```
Page (`analytics/hiring/page.tsx`): a `DashboardWindow` selector (reuse the dashboard's window control or a simple `<select>` of 7d/14d/30d/90d) converted to `from`/`to` ISO (`to = now`, `from = now − Ndays`); a job `<select>` from `useJobs` ("All jobs" | one job); calls `useHiringAnalytics({from,to,jobId})`. Render: **funnel** via `<FunnelChart stages={data.funnel.map((f) => ({ label: STAGE_LABEL[f.stage], value: f.reached }))} />` (add a `STAGE_LABEL` map Applied/Screened/Interview/Offer/Hired); **time-to-hire** as three `Card` stat tiles (avg days, median days, hired count — render `—` for null); **sources** as a small `Table` (source, entered, hired, hire-rate% ); **jobs** as a `Table` (title→`/jobs/:id` link, `StatusBadge`, entered, hired, conversion%, avg time-to-hire) shown only when no single job is selected; loading + empty states. Add `{ href: '/analytics/hiring', label: 'Hiring Analytics', icon: <lucide icon e.g. TrendingUp> }` to BOTH `lib/recruiter-nav.ts` and `lib/super-admin-nav.ts` (the file comment says add to both).

- [ ] **Step 5: Run — expect PASS**, then web typecheck, commit

```bash
cd "D:/exam app/apps/web" && npx jest "analytics/hiring" && npx tsc --noEmit
git add apps/web/lib/types.ts apps/web/lib/hooks/useHiringAnalytics.ts "apps/web/app/(recruiter)/analytics/hiring" apps/web/lib/recruiter-nav.ts apps/web/lib/super-admin-nav.ts
git commit -m "feat(analytics): hiring analytics page, hook, nav"
```

---

## Task 4: Whole-feature verification

**Files:** none.

- [ ] **Step 1: Full backend suite + typecheck**

```bash
cd "D:/exam app" && npx jest --config apps/api/jest.config.js && npx tsc -p apps/api/tsconfig.json --noEmit
```
Expected: all green; exam-runtime untouched.

- [ ] **Step 2: Full web suite + typecheck**

```bash
cd "D:/exam app/apps/web" && npx jest --maxWorkers=2 && npx tsc --noEmit
```

- [ ] **Step 3: Browser smoke (post-deploy)** — open `/analytics/hiring`; confirm the funnel, time-to-hire tiles, source table, and jobs table render against real pipeline data; change the date window and the job filter and confirm all panels re-scope; click a jobs-table row and confirm it drills into that job.

- [ ] **Step 4: Proceed to the final whole-branch review + finishing-a-development-branch.**

---

## Self-Review

**Spec coverage:**
- Snapshot funnel (`stageIndex≥k`, rejected preserves stage, `hired = stage==='hired' && !rejected`) → Task 1. ✅
- Approx time-to-hire avg/median → Task 1. ✅
- Source hire-rates + jobs rollup → Task 1. ✅
- `GET /analytics/hiring?from&to&jobId` (`results:view`), org-scoped cohort, `jobs` always org-wide → Task 2. ✅
- Empty cohort → zeroed (not 500) → Task 1 (module) + Task 2 (service returns it). ✅
- Dedicated page + window + job filter + `FunnelChart`/`Card`/`Table` reuse + nav in both files → Task 3. ✅
- No schema/migration/dep → nothing in any task adds them. ✅

**Placeholder scan:** every code step carries full code; the STAGE_LABEL map and the nav icon are named concretely. No TBD/TODO.

**Type consistency:** `HiringAnalytics`/`HiringFunnelRow`/`HiringTimeToHire`/`HiringSourceRow`/`HiringJobRow`, `EntryRow`, `JobMeta`, `computeHiringAnalytics(entries, jobMeta)`, `getHiring(ctx, {from,to,jobId})`, and the `stage==='hired' && !rejected` "hired" rule are used identically across tasks and match the spec.

**Note on the org-wide `jobs` table:** Task 2 Step 3 flags that when `jobId` is set, the service must fetch a second (org-wide) cohort for the `jobs` table while the other panels use the filtered cohort — the one real subtlety, called out with the exact merge code so it isn't missed.
