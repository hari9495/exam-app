# Recruiter Dashboard Global Date-Range Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the recruiter dashboard's 10 independent per-card filter dropdowns with one global date-range selector that also changes the 4 stat cards' headline numbers, not just their sparklines.

**Architecture:** Widen the existing `window`/`days` query-param enums already used by `/dashboard/trend`, `/dashboard/funnel`, and `/dashboard/exam-performance` to a shared `7d|14d|30d|90d|all` set, add that same `window` param to `/dashboard/summary` (whose stats are currently all-time-only), then collapse the dashboard page's per-card filter state into one `useState` at the page level that every card reads as a prop instead of owning its own dropdown.

**Tech Stack:** NestJS + Prisma (backend), Next.js + React Query (frontend), Jest + Testing Library (tests). No new dependencies.

## Global Constraints

- Shared window enum across `summary`, `funnel`, and `exam-performance`: `7d | 14d | 30d | 90d | all`. `trend`'s `days` param stays numeric but widens to `7 | 14 | 30 | 90`.
- Global date-range `Select` options: **7 days / 14 days / 30 days / 90 days / All time**, defaulting to **14 days**.
- "All time" for the trend/sparkline endpoint is capped to a 90-day daily lookback (`days=90`); the headline stat numbers themselves (from `/dashboard/summary?window=all`) remain truly all-time with no cap.
- Removed entirely (not just visually): the funnel's exam picker (always `examId=all` now) and the exam-performance card's top-N picker (always `limit=5` now). Their backend params stay flexible/tested; only the frontend UI for them is removed.
- The stat card's `pendingGradingCount` (windowed) and the "Needs your attention" pending-grading list (unwindowed, unchanged) must come from two independently-filtered queries — never the same query reused for both.
- Package manager commands: `npm run test --workspace=apps/api -- <args>`, `npm run test --workspace=apps/web -- <args>` (or `npx jest <pattern>` from `apps/web`/`apps/api` directly if the workspace form has shell-quoting issues with parenthesized paths).

---

### Task 1: Backend — widen the window/days enums on trend, funnel, and exam-performance

**Files:**
- Modify: `apps/api/src/dashboard/dashboard.service.ts`
- Modify: `apps/api/src/dashboard/dashboard.controller.ts`
- Modify: `apps/api/src/dashboard/dashboard.service.spec.ts`
- Modify: `apps/api/src/dashboard/dashboard.controller.spec.ts`

**Interfaces:**
- Produces: a local `type Window = 'all' | '7d' | '14d' | '30d' | '90d'` and `function resolveWindowStart(window: Window): Date | null` in `dashboard.service.ts`, used by `getExamPerformance`/`getFunnel` now and by `getSummary` in Task 2.
- Consumes: existing `daysAgo(days: number): Date` (already in `dashboard.service.ts`).

- [ ] **Step 1: Write the failing service tests**

Add to the `getExamPerformance` describe block in `apps/api/src/dashboard/dashboard.service.spec.ts` (after the existing `'returns an empty exams list...'` test):

```ts
    it('accepts a 7-day window', async () => {
      const tx = stubTx();
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await service.getExamPerformance(context, 'all', '7d');

      expect(tx.result.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ attempt: expect.objectContaining({ submittedAt: expect.objectContaining({ gte: expect.any(Date) }) }) }),
        }),
      );
    });
```

Add to the `getFunnel` describe block (after the existing `'filters by invitation invitedAt when a window is given'` test):

```ts
    it('accepts a 14-day window', async () => {
      const tx = stubTx();
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await service.getFunnel(context, 'all', '14d');

      expect(tx.invitation.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ invitedAt: expect.objectContaining({ gte: expect.any(Date) }) }) }),
      );
    });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test --workspace=apps/api -- dashboard.service.spec.ts`
Expected: FAIL — TypeScript error / runtime mismatch, since `getExamPerformance`/`getFunnel` don't yet accept `'7d'`/`'14d'` as valid `window` values.

- [ ] **Step 3: Extract the shared `Window` type and `resolveWindowStart` helper in `dashboard.service.ts`**

Add this type and function directly below the existing `daysAgo` function:

```ts
type Window = 'all' | '7d' | '14d' | '30d' | '90d';

function resolveWindowStart(window: Window): Date | null {
  switch (window) {
    case '7d':
      return daysAgo(7);
    case '14d':
      return daysAgo(14);
    case '30d':
      return daysAgo(30);
    case '90d':
      return daysAgo(90);
    case 'all':
      return null;
  }
}
```

In `getExamPerformance`, change the signature's `window` parameter type from `'all' | '30d' | '90d'` to `Window`, and replace this line:

```ts
      const windowStart = window === '30d' ? daysAgo(30) : window === '90d' ? daysAgo(90) : null;
```

with:

```ts
      const windowStart = resolveWindowStart(window);
```

In `getFunnel`, make the identical two changes: signature's `window` parameter type from `'all' | '30d' | '90d'` to `Window`, and replace:

```ts
      const windowStart = window === '30d' ? daysAgo(30) : window === '90d' ? daysAgo(90) : null;
```

with:

```ts
      const windowStart = resolveWindowStart(window);
```

Also widen `getTrend`'s `days` parameter type from `7 | 14 | 30` to `7 | 14 | 30 | 90` (no other change needed there — `daysAgo`/`bucketByDay` already work for any day count).

- [ ] **Step 4: Run the service tests to verify they pass**

Run: `npm run test --workspace=apps/api -- dashboard.service.spec.ts`
Expected: PASS (all tests, including the 2 new ones)

- [ ] **Step 5: Write the failing controller tests**

Add to the `getTrend` describe block in `apps/api/src/dashboard/dashboard.controller.spec.ts` (after the existing `'passes a valid metric and days through to the service'` test):

```ts
    it('accepts 90 days', () => {
      controller.getTrend(tenant, 'candidates', '90');
      expect(service.getTrend).toHaveBeenCalledWith(tenant, 'candidates', 90);
    });
```

Add to the `getExamPerformance` describe block (after the existing `'passes limit "all" through unchanged'` test):

```ts
    it('accepts a 7d window', () => {
      controller.getExamPerformance(tenant, '5', '7d');
      expect(service.getExamPerformance).toHaveBeenCalledWith(tenant, 5, '7d');
    });
```

Add to the `getFunnel` describe block (after the existing `'passes examId "all" through unchanged'` test):

```ts
    it('accepts a 14d window', () => {
      controller.getFunnel(tenant, 'all', '14d');
      expect(service.getFunnel).toHaveBeenCalledWith(tenant, 'all', '14d');
    });
```

- [ ] **Step 6: Run the controller tests to verify they fail**

Run: `npm run test --workspace=apps/api -- dashboard.controller.spec.ts`
Expected: FAIL — `90`/`'7d'`/`'14d'` are currently rejected as invalid by the controller's validation arrays.

- [ ] **Step 7: Widen the controller's validation arrays in `dashboard.controller.ts`**

Replace:

```ts
const TREND_DAYS = [7, 14, 30] as const;

const PERFORMANCE_LIMITS = ['5', '10', 'all'] as const;
const WINDOWS = ['all', '30d', '90d'] as const;
```

with:

```ts
const TREND_DAYS = [7, 14, 30, 90] as const;

const PERFORMANCE_LIMITS = ['5', '10', 'all'] as const;
const WINDOWS = ['all', '7d', '14d', '30d', '90d'] as const;
```

- [ ] **Step 8: Run the controller tests to verify they pass**

Run: `npm run test --workspace=apps/api -- dashboard.controller.spec.ts`
Expected: PASS (all tests, including the 3 new ones)

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/dashboard/dashboard.service.ts apps/api/src/dashboard/dashboard.controller.ts apps/api/src/dashboard/dashboard.service.spec.ts apps/api/src/dashboard/dashboard.controller.spec.ts
git commit -m "feat: widen dashboard window/days enums to 7d/14d/90d"
```

---

### Task 2: Backend — add a `window` param to `GET /dashboard/summary`

**Files:**
- Modify: `apps/api/src/dashboard/dashboard.service.ts`
- Modify: `apps/api/src/dashboard/dashboard.controller.ts`
- Modify: `apps/api/src/dashboard/dashboard.service.spec.ts`
- Modify: `apps/api/src/dashboard/dashboard.controller.spec.ts`

**Interfaces:**
- Consumes: `type Window`, `function resolveWindowStart(window: Window): Date | null` (from Task 1, same file).
- Produces: `DashboardService.getSummary(context: TenantContext, window: Window): Promise<DashboardSummary>` (signature changed — now takes a required second argument). `DashboardController.getSummary(tenant, window?: string)` bound to `GET /dashboard/summary?window=...`.

- [ ] **Step 1: Write the failing/updated service tests**

In `apps/api/src/dashboard/dashboard.service.spec.ts`, update the 4 existing calls to `service.getSummary(context)` to pass `'all'` as a second argument, preserving their current all-time behavior:

1. In `'aggregates stats, attention items, and activity into one summary'`: change `const result = await service.getSummary(context);` to `const result = await service.getSummary(context, 'all');`.
2. In `'counts an invitation as stale when invited 5+ days ago with no attempt'`: same change.
3. In `'lists upcoming scheduled exams soonest-first, excluding exams without a future window'`: same change.
4. In `'returns an empty upcoming-exams list for an org with no data'`: same change.

Add a new `describe('getSummary window filtering', ...)` block at the end of the file, just before the final closing `});` of the outer `describe('DashboardService', ...)`:

```ts
  describe('getSummary window filtering', () => {
    it('filters totalCandidates by createdAt when a window is given', async () => {
      const tx = stubTx();
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await service.getSummary(context, '30d');

      expect(tx.candidate.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ createdAt: expect.objectContaining({ gte: expect.any(Date) }) }) }),
      );
    });

    it('filters invitationsSent by invitedAt when a window is given', async () => {
      const tx = stubTx();
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await service.getSummary(context, '30d');

      expect(tx.invitation.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ invitedAt: expect.objectContaining({ gte: expect.any(Date) }) }) }),
      );
    });

    it('filters attemptsInProgress by startedAt when a window is given', async () => {
      const tx = stubTx();
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await service.getSummary(context, '30d');

      expect(tx.attempt.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'in_progress', startedAt: expect.objectContaining({ gte: expect.any(Date) }) }),
        }),
      );
    });

    it('applies no date filter to any stat when window is "all"', async () => {
      const tx = stubTx();
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await service.getSummary(context, 'all');

      const candidateCountArgs = tx.candidate.count.mock.calls[0][0];
      expect(candidateCountArgs.where.createdAt).toBeUndefined();
      const invitationCountArgs = tx.invitation.count.mock.calls[0][0];
      expect(invitationCountArgs.where.invitedAt).toBeUndefined();
      const attemptCountArgs = tx.attempt.count.mock.calls[0][0];
      expect(attemptCountArgs.where.startedAt).toBeUndefined();
    });

    it('computes stats.pendingGradingCount from a window-filtered query, independent of the unfiltered attention.pendingGrading list', async () => {
      const tx = stubTx({
        attempt: {
          count: jest.fn().mockResolvedValue(0),
          groupBy: jest
            .fn()
            .mockResolvedValueOnce([{ examId: 'exam-1', _count: { _all: 2 } }])
            .mockResolvedValueOnce([{ examId: 'exam-1', _count: { _all: 9 } }]),
        },
      });
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.getSummary(context, '7d');

      expect(result.stats.pendingGradingCount).toBe(2);
      expect(result.attention.pendingGrading).toEqual([{ examId: 'exam-1', examTitle: 'Backend Round', count: 9 }]);
    });
  });
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `npm run test --workspace=apps/api -- dashboard.service.spec.ts`
Expected: FAIL — `getSummary` doesn't yet accept a second argument, and its queries have no date filtering.

- [ ] **Step 3: Implement the `window` param in `getSummary`**

Replace the full body of `getSummary` in `apps/api/src/dashboard/dashboard.service.ts`:

```ts
  async getSummary(context: TenantContext, window: Window): Promise<DashboardSummary> {
    const organizationId = context.organizationId as string;

    return this.tenantPrisma.forTenant(context, async (tx) => {
      const exams = await tx.exam.findMany({ where: { organizationId }, select: { id: true, title: true } });
      const examIds = exams.map((exam) => exam.id);
      const examTitleById = new Map(exams.map((exam) => [exam.id, exam.title]));

      const staleThreshold = new Date(Date.now() - STALE_INVITATION_DAYS * 24 * 60 * 60 * 1000);
      const windowStart = resolveWindowStart(window);

      const [
        totalCandidates,
        invitationsSent,
        attemptsInProgress,
        windowedPendingGradingGroups,
        pendingGradingGroups,
        staleInvitationCount,
        recentProctoringEvents,
        auditRows,
        upcomingExamRows,
      ] = await Promise.all([
        tx.candidate.count({
          where: { organizationId, erasedAt: null, ...(windowStart ? { createdAt: { gte: windowStart } } : {}) },
        }),
        tx.invitation.count({
          where: { examId: { in: examIds }, ...(windowStart ? { invitedAt: { gte: windowStart } } : {}) },
        }),
        tx.attempt.count({
          where: { examId: { in: examIds }, status: 'in_progress', ...(windowStart ? { startedAt: { gte: windowStart } } : {}) },
        }),
        tx.attempt.groupBy({
          by: ['examId'],
          where: {
            examId: { in: examIds },
            status: 'pending_manual_grade',
            ...(windowStart ? { submittedAt: { gte: windowStart } } : {}),
          },
          _count: { _all: true },
        }),
        tx.attempt.groupBy({ by: ['examId'], where: { examId: { in: examIds }, status: 'pending_manual_grade' }, _count: { _all: true } }),
        tx.invitation.count({
          where: { examId: { in: examIds }, status: 'invited', invitedAt: { lte: staleThreshold }, attempt: null },
        }),
        tx.proctoringEvent.findMany({
          where: { attempt: { examId: { in: examIds } } },
          orderBy: { occurredAt: 'desc' },
          take: RECENT_PROCTORING_LIMIT,
          include: { attempt: { select: { examId: true } } },
        }),
        tx.auditLog.findMany({
          where: { organizationId, action: { in: ACTIVITY_ACTIONS } },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: ACTIVITY_LIMIT,
        }),
        tx.exam.findMany({
          where: { organizationId, schedulingEnabled: true, availabilityWindowStart: { gt: new Date() } },
          select: { id: true, title: true, availabilityWindowStart: true },
          orderBy: { availabilityWindowStart: 'asc' },
          take: UPCOMING_EXAMS_LIMIT,
        }),
      ]);

      const pendingGradingCount = windowedPendingGradingGroups.reduce((sum, group) => sum + group._count._all, 0);

      return {
        stats: {
          totalCandidates,
          invitationsSent,
          attemptsInProgress,
          pendingGradingCount,
        },
        attention: {
          pendingGrading: pendingGradingGroups.map((group) => ({
            examId: group.examId,
            examTitle: examTitleById.get(group.examId) ?? 'Unknown exam',
            count: group._count._all,
          })),
          recentProctoringFlags: recentProctoringEvents.map((event) => ({
            examId: event.attempt.examId,
            examTitle: examTitleById.get(event.attempt.examId) ?? 'Unknown exam',
            occurredAt: event.occurredAt.toISOString(),
          })),
          staleInvitationCount,
        },
        activity: auditRows.map((row) => ({
          id: row.id,
          description: describeActivity(row.action, row.entityId, row.metadataJson ? JSON.parse(row.metadataJson) : null, examTitleById),
          occurredAt: row.createdAt.toISOString(),
        })),
        upcomingExams: upcomingExamRows.map((exam) => ({
          examId: exam.id,
          examTitle: exam.title,
          availabilityWindowStart: exam.availabilityWindowStart!.toISOString(),
        })),
      };
    });
  }
```

- [ ] **Step 4: Run the service tests to verify they pass**

Run: `npm run test --workspace=apps/api -- dashboard.service.spec.ts`
Expected: PASS (all tests, including the 5 new ones)

- [ ] **Step 5: Write the failing controller tests**

Add a new `describe('getSummary', ...)` block to `apps/api/src/dashboard/dashboard.controller.spec.ts`, as the FIRST describe block (before `describe('getTrend', ...)`):

```ts
  describe('getSummary', () => {
    it('rejects a missing window', () => {
      expect(() => controller.getSummary(tenant, undefined)).toThrow(BadRequestException);
    });

    it('rejects an invalid window', () => {
      expect(() => controller.getSummary(tenant, 'bogus')).toThrow(BadRequestException);
    });

    it('passes a valid window through to the service', () => {
      controller.getSummary(tenant, '30d');
      expect(service.getSummary).toHaveBeenCalledWith(tenant, '30d');
    });

    it('passes window "all" through unchanged', () => {
      controller.getSummary(tenant, 'all');
      expect(service.getSummary).toHaveBeenCalledWith(tenant, 'all');
    });
  });
```

- [ ] **Step 6: Run the controller tests to verify they fail**

Run: `npm run test --workspace=apps/api -- dashboard.controller.spec.ts`
Expected: FAIL — `controller.getSummary` doesn't yet accept a `window` argument.

- [ ] **Step 7: Implement the `window` param in the `summary` route**

Replace the `getSummary` method in `apps/api/src/dashboard/dashboard.controller.ts`:

```ts
  @Get('summary')
  @RequireAnyPermission('exam:manage', 'results:view')
  getSummary(@CurrentTenant() tenant: TenantContext, @Query('window') window?: string) {
    if (!window || !(WINDOWS as readonly string[]).includes(window)) {
      throw new BadRequestException(`window must be one of ${WINDOWS.join(', ')}`);
    }
    return this.dashboardService.getSummary(tenant, window as Window);
  }
```

- [ ] **Step 8: Run the controller tests to verify they pass**

Run: `npm run test --workspace=apps/api -- dashboard.controller.spec.ts`
Expected: PASS (all tests, including the 4 new ones)

- [ ] **Step 9: Run the full backend test suite to confirm nothing else broke**

Run: `npm run test:api`
Expected: PASS (all suites)

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/dashboard/dashboard.service.ts apps/api/src/dashboard/dashboard.controller.ts apps/api/src/dashboard/dashboard.service.spec.ts apps/api/src/dashboard/dashboard.controller.spec.ts
git commit -m "feat: add window param to dashboard summary endpoint"
```

---

### Task 3: Frontend — widen shared types and add a `window` param to `useDashboardSummary`

**Files:**
- Modify: `apps/web/lib/types.ts`
- Modify: `apps/web/lib/hooks/useDashboard.ts`

**Interfaces:**
- Produces: `DashboardWindow` widened to `'all' | '7d' | '14d' | '30d' | '90d'`; `DashboardTrendDays` widened to `7 | 14 | 30 | 90`; `useDashboardSummary(window: DashboardWindow)` (signature changed — now requires an argument). Task 4 is the only consumer of these changes.

This task has no new tests of its own, matching `useDashboardSummary`'s existing precedent (no dedicated hook test file) — it's exercised by `page.test.tsx` in Task 4.

- [ ] **Step 1: Widen the shared types in `apps/web/lib/types.ts`**

Replace:

```ts
export type DashboardTrendDays = 7 | 14 | 30;
export type DashboardPerformanceLimit = 5 | 10 | 'all';
export type DashboardWindow = 'all' | '30d' | '90d';
```

with:

```ts
export type DashboardTrendDays = 7 | 14 | 30 | 90;
export type DashboardPerformanceLimit = 5 | 10 | 'all';
export type DashboardWindow = 'all' | '7d' | '14d' | '30d' | '90d';
```

- [ ] **Step 2: Add the `window` param to `useDashboardSummary` in `apps/web/lib/hooks/useDashboard.ts`**

Replace:

```ts
export function useDashboardSummary() {
  const { accessToken } = useAuth();
  return useQuery<DashboardSummary>({
    queryKey: ['dashboard-summary'],
    queryFn: () => apiFetch('/dashboard/summary', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}
```

with:

```ts
export function useDashboardSummary(window: DashboardWindow) {
  const { accessToken } = useAuth();
  return useQuery<DashboardSummary>({
    queryKey: ['dashboard-summary', window],
    queryFn: () => apiFetch(`/dashboard/summary?window=${window}`, {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}
```

(`DashboardWindow` is already imported in this file's existing import list — no import changes needed.)

- [ ] **Step 3: Confirm the expected, temporary type error**

Run: `npx tsc --noEmit -p tsconfig.json` from `apps/web`
Expected: FAILS with exactly one new error — `apps/web/app/(recruiter)/dashboard/page.tsx` calling `useDashboardSummary()` with no arguments, since `window` is now required. This is expected and fixed in Task 4; do not fix `page.tsx` in this task.

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/types.ts apps/web/lib/hooks/useDashboard.ts
git commit -m "feat: widen dashboard window/days types, add window param to useDashboardSummary"
```

---

### Task 4: Frontend — replace all per-card filters with one global date-range selector

**Files:**
- Modify: `apps/web/app/(recruiter)/dashboard/page.tsx`
- Modify: `apps/web/app/(recruiter)/dashboard/page.test.tsx`

**Interfaces:**
- Consumes: `useDashboardSummary(window)` (Task 3), `useDashboardTrend`, `useDashboardExamPerformance`, `useDashboardFunnel` (all pre-existing), `DashboardWindow`/`DashboardTrendMetric` types.
- Removes: `useExams` import/usage (the funnel exam-picker is gone, so `CandidateFunnelCard` no longer needs the exams list); every per-card `useState` and `Select` for filters; `TREND_WINDOW_OPTIONS`, `PERFORMANCE_LIMIT_OPTIONS`, `WINDOW_OPTIONS`, `FUNNEL_WINDOW_OPTIONS` constants.

- [ ] **Step 1: Write the failing/updated page tests**

Replace the full contents of `apps/web/app/(recruiter)/dashboard/page.test.tsx` with:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import DashboardPage from './page';
import { AuthProvider } from '../../../lib/auth-context';
import { QueryProvider } from '../../../lib/query-provider';
import { ToastProvider } from '../../../components/ui';

describe('DashboardPage', () => {
  const originalFetch = global.fetch;
  const originalResizeObserver = globalThis.ResizeObserver;
  const originalGetBoundingClientRect = Element.prototype.getBoundingClientRect;

  beforeEach(() => {
    globalThis.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
    Element.prototype.getBoundingClientRect = () =>
      ({ width: 400, height: 300, top: 0, left: 0, right: 400, bottom: 300, x: 0, y: 0, toJSON() {} }) as DOMRect;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    globalThis.ResizeObserver = originalResizeObserver;
    Element.prototype.getBoundingClientRect = originalGetBoundingClientRect;
  });

  function mockSummaryFetch(summary: any) {
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).includes('/dashboard/summary')) {
        return new Response(JSON.stringify(summary), { status: 200 });
      }
      if (String(url).includes('/dashboard/trend')) {
        return new Response(JSON.stringify({ points: [] }), { status: 200 });
      }
      if (String(url).includes('/dashboard/exam-performance')) {
        return new Response(JSON.stringify({ exams: [] }), { status: 200 });
      }
      if (String(url).includes('/dashboard/funnel')) {
        return new Response(JSON.stringify({ invited: 0, started: 0, submitted: 0, passed: 0 }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;
  }

  function renderPage() {
    render(
      <QueryProvider>
        <ToastProvider>
          <AuthProvider>
            <DashboardPage />
          </AuthProvider>
        </ToastProvider>
      </QueryProvider>,
    );
  }

  it('renders the 4 stat cards from the summary endpoint', async () => {
    mockSummaryFetch({
      stats: { totalCandidates: 248, invitationsSent: 312, attemptsInProgress: 17, pendingGradingCount: 9 },
      attention: { pendingGrading: [], recentProctoringFlags: [], staleInvitationCount: 0 },
      activity: [],
      upcomingExams: [],
    });
    renderPage();

    await waitFor(() => expect(screen.getByText('248')).toBeInTheDocument());
    expect(screen.getByText('312')).toBeInTheDocument();
    expect(screen.getByText('17')).toBeInTheDocument();
    expect(screen.getByText('9')).toBeInTheDocument();
  });

  it('defaults to a 14-day range and refetches summary, trends, funnel, and exam performance when the global range changes', async () => {
    mockSummaryFetch({
      stats: { totalCandidates: 248, invitationsSent: 312, attemptsInProgress: 17, pendingGradingCount: 9 },
      attention: { pendingGrading: [], recentProctoringFlags: [], staleInvitationCount: 0 },
      activity: [],
      upcomingExams: [],
    });
    renderPage();

    await waitFor(() => expect(screen.getByText('248')).toBeInTheDocument());
    const fetchMock = global.fetch as jest.Mock;
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/dashboard/summary?window=14d'))).toBe(true);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/dashboard/trend?metric=candidates&days=14'))).toBe(true);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/dashboard/funnel?examId=all&window=14d'))).toBe(true);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/dashboard/exam-performance?limit=5&window=14d'))).toBe(true);

    const trigger = screen.getByLabelText('Date range');
    fireEvent.click(trigger);
    const option = await screen.findByText('30 days');
    fireEvent.click(option);

    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/dashboard/summary?window=30d'))).toBe(true));
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/dashboard/trend?metric=candidates&days=30'))).toBe(true);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/dashboard/trend?metric=invitations&days=30'))).toBe(true);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/dashboard/trend?metric=attempts&days=30'))).toBe(true);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/dashboard/trend?metric=pendingGrading&days=30'))).toBe(true);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/dashboard/funnel?examId=all&window=30d'))).toBe(true);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/dashboard/exam-performance?limit=5&window=30d'))).toBe(true);
  });

  it('caps stat-card trend requests to 90 days when "All time" is selected, while summary/funnel/exam-performance use window=all', async () => {
    mockSummaryFetch({
      stats: { totalCandidates: 0, invitationsSent: 0, attemptsInProgress: 0, pendingGradingCount: 0 },
      attention: { pendingGrading: [], recentProctoringFlags: [], staleInvitationCount: 0 },
      activity: [],
      upcomingExams: [],
    });
    renderPage();

    await waitFor(() => expect(screen.getByLabelText('Date range')).toBeInTheDocument());
    const fetchMock = global.fetch as jest.Mock;

    const trigger = screen.getByLabelText('Date range');
    fireEvent.click(trigger);
    const option = await screen.findByText('All time');
    fireEvent.click(option);

    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/dashboard/summary?window=all'))).toBe(true));
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/dashboard/trend?metric=candidates&days=90'))).toBe(true);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/dashboard/funnel?examId=all&window=all'))).toBe(true);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/dashboard/exam-performance?limit=5&window=all'))).toBe(true);
  });

  it('renders the exam performance chart', async () => {
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).includes('/dashboard/summary')) {
        return new Response(
          JSON.stringify({
            stats: { totalCandidates: 0, invitationsSent: 0, attemptsInProgress: 0, pendingGradingCount: 0 },
            attention: { pendingGrading: [], recentProctoringFlags: [], staleInvitationCount: 0 },
            activity: [],
            upcomingExams: [],
          }),
          { status: 200 },
        );
      }
      if (String(url).includes('/dashboard/trend')) {
        return new Response(JSON.stringify({ points: [] }), { status: 200 });
      }
      if (String(url).includes('/dashboard/exam-performance')) {
        return new Response(
          JSON.stringify({ exams: [{ examId: 'exam-1', examTitle: 'Backend Round', passRate: 70, avgScore: 62, candidateCount: 12 }] }),
          { status: 200 },
        );
      }
      if (String(url).includes('/dashboard/funnel')) {
        return new Response(JSON.stringify({ invited: 0, started: 0, submitted: 0, passed: 0 }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;
    renderPage();

    await waitFor(() => expect(screen.getByText('Exam performance')).toBeInTheDocument());

    const fetchMock = global.fetch as jest.Mock;
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/dashboard/exam-performance?limit=5&window=14d'))).toBe(true);
  });

  it('renders attention items with their counts', async () => {
    mockSummaryFetch({
      stats: { totalCandidates: 0, invitationsSent: 0, attemptsInProgress: 0, pendingGradingCount: 4 },
      attention: {
        pendingGrading: [{ examId: 'exam-1', examTitle: 'Backend Round — Python', count: 4 }],
        recentProctoringFlags: [],
        staleInvitationCount: 6,
      },
      activity: [],
      upcomingExams: [],
    });
    renderPage();

    await waitFor(() => expect(screen.getByText(/Backend Round — Python/)).toBeInTheDocument());
    expect(screen.getByText('6')).toBeInTheDocument();
    expect(screen.getByText(/Backend Round — Python/).closest('a')).toHaveAttribute('href', '/exams/exam-1/edit');
  });

  it('links proctoring-flag attention items to their exam', async () => {
    mockSummaryFetch({
      stats: { totalCandidates: 0, invitationsSent: 0, attemptsInProgress: 0, pendingGradingCount: 0 },
      attention: {
        pendingGrading: [],
        recentProctoringFlags: [{ examId: 'exam-2', examTitle: 'Frontend Round — React', occurredAt: '2026-07-17T10:00:00Z' }],
        staleInvitationCount: 0,
      },
      activity: [],
      upcomingExams: [],
    });
    renderPage();

    await waitFor(() => expect(screen.getByText(/Frontend Round — React/)).toBeInTheDocument());
    expect(screen.getByText(/Frontend Round — React/).closest('a')).toHaveAttribute('href', '/exams/exam-2/edit');
  });

  it('renders the recent activity feed', async () => {
    mockSummaryFetch({
      stats: { totalCandidates: 0, invitationsSent: 0, attemptsInProgress: 0, pendingGradingCount: 0 },
      attention: { pendingGrading: [], recentProctoringFlags: [], staleInvitationCount: 0 },
      activity: [{ id: 'log-1', description: '3 candidates invited to Backend Round', occurredAt: '2026-07-17T10:00:00Z' }],
      upcomingExams: [],
    });
    renderPage();

    await waitFor(() => expect(screen.getByText('3 candidates invited to Backend Round')).toBeInTheDocument());
  });

  it('renders the upcoming exams widget', async () => {
    mockSummaryFetch({
      stats: { totalCandidates: 0, invitationsSent: 0, attemptsInProgress: 0, pendingGradingCount: 0 },
      attention: { pendingGrading: [], recentProctoringFlags: [], staleInvitationCount: 0 },
      activity: [],
      upcomingExams: [{ examId: 'exam-3', examTitle: 'Scheduled Round', availabilityWindowStart: '2026-08-01T09:00:00.000Z' }],
    });
    renderPage();

    await waitFor(() => expect(screen.getByText('Scheduled Round')).toBeInTheDocument());
    expect(screen.getByText(/Scheduled Round/).closest('a')).toHaveAttribute('href', '/exams/exam-3/edit');
  });

  it('renders the candidate funnel from the funnel endpoint', async () => {
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).includes('/dashboard/summary')) {
        return new Response(
          JSON.stringify({
            stats: { totalCandidates: 0, invitationsSent: 0, attemptsInProgress: 0, pendingGradingCount: 0 },
            attention: { pendingGrading: [], recentProctoringFlags: [], staleInvitationCount: 0 },
            activity: [],
            upcomingExams: [],
          }),
          { status: 200 },
        );
      }
      if (String(url).includes('/dashboard/trend')) {
        return new Response(JSON.stringify({ points: [] }), { status: 200 });
      }
      if (String(url).includes('/dashboard/exam-performance')) {
        return new Response(JSON.stringify({ exams: [] }), { status: 200 });
      }
      if (String(url).includes('/dashboard/funnel')) {
        return new Response(JSON.stringify({ invited: 100, started: 60, submitted: 55, passed: 22 }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;
    renderPage();

    await waitFor(() => expect(screen.getByLabelText('Invited: 100')).toBeInTheDocument());
    expect(screen.getByLabelText('Started: 60')).toBeInTheDocument();
    expect(screen.getByLabelText('Submitted: 55')).toBeInTheDocument();
    expect(screen.getByLabelText('Passed: 22')).toBeInTheDocument();

    const fetchMock = global.fetch as jest.Mock;
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/dashboard/funnel?examId=all&window=14d'))).toBe(true);
  });

  it('shows an empty-state message when there are no upcoming exams', async () => {
    mockSummaryFetch({
      stats: { totalCandidates: 0, invitationsSent: 0, attemptsInProgress: 0, pendingGradingCount: 0 },
      attention: { pendingGrading: [], recentProctoringFlags: [], staleInvitationCount: 0 },
      activity: [],
      upcomingExams: [],
    });
    renderPage();

    await waitFor(() => expect(screen.getByText('No upcoming exams.')).toBeInTheDocument());
  });

  it('shows an error state when the summary fetch fails', async () => {
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).includes('/dashboard/summary')) {
        return new Response(JSON.stringify({ message: 'Server error' }), { status: 500 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;
    renderPage();

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest "dashboard/page.test.tsx"` from `apps/web`
Expected: FAIL — `page.tsx` still has per-card filters and calls `useDashboardSummary()` with no argument; there is no "Date range" label anywhere yet.

- [ ] **Step 3: Replace the full contents of `apps/web/app/(recruiter)/dashboard/page.tsx`**

```tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Users, Mail, Play, FileEdit, AlertTriangle, Clock, CheckCircle2, FileEdit as FileEditIcon, Plus, CalendarClock } from 'lucide-react';
import { useDashboardExamPerformance, useDashboardFunnel, useDashboardSummary, useDashboardTrend } from '../../../lib/hooks/useDashboard';
import { DashboardTrendMetric, DashboardWindow } from '../../../lib/types';
import { Card, Button, Select, type SelectOption } from '../../../components/ui';
import { Sparkline } from '../../../components/charts/Sparkline';
import { GroupedBarChart } from '../../../components/charts/GroupedBarChart';
import { FunnelChart } from '../../../components/charts/FunnelChart';

function activityIconFor(description: string) {
  if (description.includes('invited')) return Mail;
  if (description.includes('published')) return CheckCircle2;
  if (description.includes('graded')) return FileEditIcon;
  return CheckCircle2;
}

const GLOBAL_RANGE_OPTIONS: SelectOption[] = [
  { value: '7d', label: '7 days' },
  { value: '14d', label: '14 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
  { value: 'all', label: 'All time' },
];

const RANGE_TO_TREND_DAYS: Record<DashboardWindow, 7 | 14 | 30 | 90> = {
  '7d': 7,
  '14d': 14,
  '30d': 30,
  '90d': 90,
  all: 90,
};

const TREND_UNIT_LABELS: Record<DashboardTrendMetric, string> = {
  candidates: 'new candidates',
  invitations: 'invitations sent',
  attempts: 'attempts started',
  pendingGrading: 'newly pending grading',
};

interface StatCardProps {
  icon: typeof Users;
  value: number;
  label: string;
  metric: DashboardTrendMetric;
  color: string;
  delay: number;
  range: DashboardWindow;
}

function StatCard({ icon: Icon, value, label, metric, color, delay, range }: StatCardProps) {
  const { data: trend } = useDashboardTrend(metric, RANGE_TO_TREND_DAYS[range]);
  const points = trend?.points ?? [];
  const firstValue = points[0]?.value ?? 0;
  const lastValue = points[points.length - 1]?.value ?? 0;
  const changePercent = firstValue > 0 ? Math.round(((lastValue - firstValue) / firstValue) * 100) : lastValue > 0 ? 100 : 0;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay, ease: 'easeOut' }} whileHover={{ y: -3 }}>
      <Card className="overflow-hidden p-0">
        <div className="p-4" style={{ background: `linear-gradient(135deg, ${color}1a, transparent)` }}>
          <div className="mb-2 flex items-center justify-between">
            <div className="flex h-8 w-8 items-center justify-center rounded-md" style={{ backgroundColor: `${color}26`, color }}>
              <Icon size={16} />
            </div>
            <span className={`text-xs font-semibold ${changePercent >= 0 ? 'text-status-success' : 'text-status-danger'}`}>
              {changePercent >= 0 ? '▲' : '▼'} {Math.abs(changePercent)}%
            </span>
          </div>
          <p className="text-2xl font-bold text-recruiter-text">{value}</p>
          <p className="text-xs text-recruiter-text-tertiary">{label}</p>
          <div className="mt-2 h-10 w-full">
            <Sparkline data={points} color={color} unit={TREND_UNIT_LABELS[metric]} />
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

function ExamPerformanceCard({ range }: { range: DashboardWindow }) {
  const { data } = useDashboardExamPerformance(5, range);
  const exams = data?.exams ?? [];

  const groups = exams.map((exam) => ({
    label: exam.examTitle,
    series: [
      { key: 'passRate', value: exam.passRate, color: '#0d9488' },
      { key: 'avgScore', value: exam.avgScore, color: '#d4a017' },
    ],
  }));

  return (
    <Card>
      <h2 className="mb-3 text-sm font-bold text-recruiter-text">Exam performance</h2>
      {groups.length === 0 ? (
        <p className="text-sm text-recruiter-text-tertiary">No settled attempts yet.</p>
      ) : (
        <div className="h-64 w-full">
          <GroupedBarChart
            groups={groups}
            legend={[
              { label: 'Pass rate', color: '#0d9488' },
              { label: 'Avg score', color: '#d4a017' },
            ]}
          />
        </div>
      )}
    </Card>
  );
}

function CandidateFunnelCard({ range }: { range: DashboardWindow }) {
  const { data: funnel } = useDashboardFunnel('all', range);

  const stages = [
    { label: 'Invited', value: funnel?.invited ?? 0 },
    { label: 'Started', value: funnel?.started ?? 0 },
    { label: 'Submitted', value: funnel?.submitted ?? 0 },
    { label: 'Passed', value: funnel?.passed ?? 0 },
  ];

  return (
    <Card>
      <h2 className="mb-3 text-sm font-bold text-recruiter-text">Candidate funnel</h2>
      <FunnelChart stages={stages} />
    </Card>
  );
}

export default function DashboardPage() {
  const [range, setRange] = useState<DashboardWindow>('14d');
  const { data: summary, isLoading, isError } = useDashboardSummary(range);

  if (isLoading) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-semibold text-recruiter-text">Dashboard</h1>
        <p className="text-sm text-recruiter-text-tertiary">Loading…</p>
      </div>
    );
  }

  if (isError || !summary) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-semibold text-recruiter-text">Dashboard</h1>
        <p role="alert" className="text-sm text-status-danger">
          Failed to load dashboard.
        </p>
      </div>
    );
  }

  const hasAttention =
    summary.attention.pendingGrading.length > 0 || summary.attention.recentProctoringFlags.length > 0 || summary.attention.staleInvitationCount > 0;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-recruiter-text">Dashboard</h1>
        <Select label="Date range" value={range} onChange={(value) => setRange(value as DashboardWindow)} options={GLOBAL_RANGE_OPTIONS} />
      </div>

      <div className="mb-5 grid grid-cols-4 gap-3">
        <StatCard icon={Users} value={summary.stats.totalCandidates} label="Total candidates" metric="candidates" color="#0d9488" delay={0} range={range} />
        <StatCard icon={Mail} value={summary.stats.invitationsSent} label="Invitations sent" metric="invitations" color="#334155" delay={0.04} range={range} />
        <StatCard
          icon={Play}
          value={summary.stats.attemptsInProgress}
          label="Attempts in progress"
          metric="attempts"
          color="#d4a017"
          delay={0.08}
          range={range}
        />
        <StatCard
          icon={FileEdit}
          value={summary.stats.pendingGradingCount}
          label="Pending grading"
          metric="pendingGrading"
          color="#f2765f"
          delay={0.12}
          range={range}
        />
      </div>

      <div className="mb-5 grid grid-cols-2 gap-4">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.16 }}>
          <CandidateFunnelCard range={range} />
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.2 }}>
          <Card>
            <h2 className="mb-3 flex items-center gap-1.5 text-sm font-bold text-recruiter-text">
              <CalendarClock size={14} />
              Upcoming exams
            </h2>
            {summary.upcomingExams.length === 0 ? (
              <p className="text-sm text-recruiter-text-tertiary">No upcoming exams.</p>
            ) : (
              <ul>
                {summary.upcomingExams.map((exam) => (
                  <li key={exam.examId} className="border-b border-recruiter-border last:border-0">
                    <Link href={`/exams/${exam.examId}/edit`} className="flex items-center gap-2.5 py-2.5 text-sm hover:bg-recruiter-bg-subtle">
                      <span className="flex-1 text-recruiter-text">{exam.examTitle}</span>
                      <span className="text-xs text-recruiter-text-tertiary">{new Date(exam.availabilityWindowStart).toLocaleDateString()}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </motion.div>
      </div>

      <div className="mb-5">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.2 }}>
          <ExamPerformanceCard range={range} />
        </motion.div>
      </div>

      <div className="grid grid-cols-[1.3fr_1fr] gap-4">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.24 }}>
          <Card>
            <h2 className="mb-3 text-sm font-bold text-recruiter-text">Needs your attention</h2>
            {!hasAttention ? (
              <p className="text-sm text-recruiter-text-tertiary">Nothing needs attention right now.</p>
            ) : (
              <ul>
                {summary.attention.pendingGrading.map((item) => (
                  <li key={item.examId} className="border-b border-recruiter-border last:border-0">
                    <Link href={`/exams/${item.examId}/edit`} className="flex items-center gap-2.5 py-2.5 text-sm hover:bg-recruiter-bg-subtle">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-status-danger" />
                      <span className="flex-1 text-recruiter-text">
                        {item.examTitle}{' '}
                        <span className="text-recruiter-text-tertiary">has {item.count} answer{item.count === 1 ? '' : 's'} awaiting manual grading</span>
                      </span>
                      <span className="rounded-full bg-recruiter-bg-subtle px-2 py-0.5 text-xs font-bold text-recruiter-text-secondary">{item.count}</span>
                    </Link>
                  </li>
                ))}
                {summary.attention.recentProctoringFlags.map((flag, index) => (
                  <li key={`${flag.examId}-${index}`} className="border-b border-recruiter-border last:border-0">
                    <Link href={`/exams/${flag.examId}/edit`} className="flex items-center gap-2.5 py-2.5 text-sm hover:bg-recruiter-bg-subtle">
                      <AlertTriangle size={13} className="shrink-0 text-status-warning" />
                      <span className="flex-1 text-recruiter-text">
                        {flag.examTitle} <span className="text-recruiter-text-tertiary">flagged a proctoring violation</span>
                      </span>
                    </Link>
                  </li>
                ))}
                {summary.attention.staleInvitationCount > 0 && (
                  <li className="flex items-center gap-2.5 py-2.5 text-sm">
                    <Clock size={13} className="shrink-0 text-recruiter-text-tertiary" />
                    <span className="flex-1 text-recruiter-text">
                      Candidates <span className="text-recruiter-text-tertiary">invited 5+ days ago, haven&apos;t started</span>
                    </span>
                    <span className="rounded-full bg-recruiter-bg-subtle px-2 py-0.5 text-xs font-bold text-recruiter-text-secondary">
                      {summary.attention.staleInvitationCount}
                    </span>
                  </li>
                )}
              </ul>
            )}

            <div className="mt-4 grid grid-cols-2 gap-2.5">
              <Link href="/exams/new">
                <Button variant="secondary" className="flex w-full items-center justify-center gap-1.5">
                  <Plus size={14} />
                  Create exam
                </Button>
              </Link>
              <Link href="/candidates">
                <Button variant="secondary" className="flex w-full items-center justify-center gap-1.5">
                  <Mail size={14} />
                  Invite candidates
                </Button>
              </Link>
            </div>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.28 }}>
          <Card>
            <h2 className="mb-3 text-sm font-bold text-recruiter-text">Recent activity</h2>
            {summary.activity.length === 0 ? (
              <p className="text-sm text-recruiter-text-tertiary">No recent activity.</p>
            ) : (
              <ul>
                {summary.activity.map((item) => {
                  const Icon = activityIconFor(item.description);
                  return (
                    <li key={item.id} className="flex items-start gap-2.5 border-b border-recruiter-border py-2.5 text-sm last:border-0">
                      <span className="mt-0.5 flex h-5.5 w-5.5 shrink-0 items-center justify-center rounded-full bg-status-success-bg text-status-success">
                        <Icon size={12} />
                      </span>
                      <div>
                        <p className="text-recruiter-text">{item.description}</p>
                        <p className="text-xs text-recruiter-text-tertiary">{new Date(item.occurredAt).toLocaleString()}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest "dashboard/page.test.tsx"` from `apps/web`
Expected: PASS (all tests)

- [ ] **Step 5: Run the full frontend test suite and typecheck to confirm nothing else broke**

Run: `npx jest` from `apps/web`
Expected: PASS (no regressions in other suites)

Run: `npx tsc --noEmit -p tsconfig.json` from `apps/web`
Expected: 0 new errors (only the same pre-existing baseline errors from unrelated files that existed before this plan)

- [ ] **Step 6: Commit**

```bash
git add "apps/web/app/(recruiter)/dashboard/page.tsx" "apps/web/app/(recruiter)/dashboard/page.test.tsx"
git commit -m "feat: replace per-card dashboard filters with one global date-range selector"
```

---

## Self-Review Notes

- **Spec coverage:** "One control replaces ten" → Task 4 (single `Select`, all per-card `Select`s/`useState`s removed). Stat-number semantics table (candidates/invitations/attempts/pendingGrading filtered by their respective timestamp fields) → Task 2's `getSummary` rewrite. "Attempts in progress" compound semantic (started-in-range AND still in-progress) → Task 2's `attemptsInProgress` query. Pending-grading stat/attention-list independence → Task 2's two separate `groupBy` calls + dedicated test. Funnel/exam-performance widened to 7d/14d → Task 1. Trend widened to 90 days, "All time" capped to `days=90` → Task 1 (enum) + Task 4 (`RANGE_TO_TREND_DAYS` mapping). Removed functionality (funnel exam-picker, exam-performance top-N picker) → Task 4 (hardcoded `'all'`/`5`, no UI). Default 14 days → Task 4 (`useState<DashboardWindow>('14d')`). Preset options 7/14/30/90/All time → Task 4 (`GLOBAL_RANGE_OPTIONS`). "Needs your attention," "Recent activity," "Upcoming exams" untouched → confirmed no task modifies their queries or rendering beyond the already-described pending-grading list split.
- **Type consistency check:** `Window` (backend, Task 1) is used identically by `getSummary` (Task 2), `getExamPerformance`, and `getFunnel`. `DashboardWindow` (frontend, Task 3) matches the backend `Window`'s exact string values and is used identically by `useDashboardSummary`, `useDashboardFunnel`, `useDashboardExamPerformance`, and the page's own `range` state (Task 4). `RANGE_TO_TREND_DAYS`'s keys are exactly `DashboardWindow`'s 5 values; its values are exactly `DashboardTrendDays`'s 4 values (all-time mapped to 90).
- **Placeholder scan:** no task contains "TBD"/"similar to Task N"/unshown code — every step has complete, copy-pasteable code, including the full replaced contents of both `page.tsx` and `page.test.tsx`.
