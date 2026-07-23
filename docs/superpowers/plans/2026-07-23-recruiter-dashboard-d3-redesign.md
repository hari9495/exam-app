# Recruiter Dashboard D3 Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the recruiter dashboard's fake sparklines and basic Recharts funnel with real, D3-computed, React-rendered charts backed by three new backend endpoints, plus add a new exam-performance chart — all with independent per-card filter dropdowns.

**Architecture:** Three new `GET /api/v1/dashboard/*` endpoints (`trend`, `exam-performance`, `funnel`) each back one dashboard card; the existing `funnel` field is removed from `/dashboard/summary`. Three new presentational chart components (`Sparkline`, `FunnelChart`, `GroupedBarChart`) under `apps/web/components/charts/` use `d3-scale`/`d3-shape` purely for math (domains, scales, path generators) and render plain JSX `<svg>` elements — no `d3.select()`, no D3 owning the DOM. Each dashboard card owns its own filter state via `useState` and its own React Query hook, so changing one card's filter never refetches another card.

**Tech Stack:** NestJS + Prisma (backend), Next.js + React Query + `d3-scale`/`d3-shape` (frontend), Jest + Testing Library (tests).

## Global Constraints

- Palette: teal `#0d9488`, charcoal `#334155`, coral `#f2765f`, gold `#d4a017` — do not use Recharts' default blue or the blue/green/purple/orange combination from either reference screenshot shown during design.
- New dependencies are `d3-scale` and `d3-shape` (plus their `@types/*` packages) only — not the full `d3` bundle.
- Every filter dropdown is independent per-card local state (`useState`); no shared/global filter state, no URL persistence.
- Stat cards: the big number is always the true all-time total from `/dashboard/summary`; the trend-window filter affects only the sparkline underneath it.
- `/dashboard/summary`'s `funnel` field is removed entirely — the funnel card exclusively uses the new `/dashboard/funnel` endpoint.
- All three new endpoints are guarded by `@UseGuards(JwtAuthGuard, PermissionsGuard)` (class-level, already present) and `@RequireAnyPermission('exam:manage', 'results:view')` (same as the existing `summary` route).
- Package manager commands use the existing monorepo convention: `npm run test --workspace=apps/web -- <args>` / `npm run test --workspace=apps/api -- <args>` / `npm install <pkg> --workspace=apps/web`.

---

### Task 1: Backend — `GET /dashboard/trend`

**Files:**
- Modify: `apps/api/src/dashboard/dashboard.service.ts`
- Modify: `apps/api/src/dashboard/dashboard.controller.ts`
- Modify: `apps/api/src/dashboard/dashboard.service.spec.ts`
- Create: `apps/api/src/dashboard/dashboard.controller.spec.ts`

**Interfaces:**
- Produces: `DashboardService.getTrend(context: TenantContext, metric: 'candidates' | 'invitations' | 'attempts' | 'pendingGrading', days: 7 | 14 | 30): Promise<DashboardTrend>` where `DashboardTrend = { points: { date: string; value: number }[] }` (one point per day, oldest first, `date` as `YYYY-MM-DD`).
- Produces: `DashboardController.getTrend(tenant, metric?: string, days?: string)` bound to `GET /dashboard/trend?metric=...&days=...`.
- Consumes: `TenantPrismaService.forTenant` (existing), `Attempt.startedAt`/`submittedAt`/`status`, `Invitation.invitedAt`, `Candidate.createdAt`/`erasedAt` (all confirmed present in `apps/api/prisma/schema.prisma`).

- [ ] **Step 1: Write the failing service tests**

Add to the top of `apps/api/src/dashboard/dashboard.service.spec.ts` (after the existing imports), and add a new `describe('getTrend', ...)` block at the end of the file, before the final closing `});` of the outer `describe('DashboardService', ...)`:

```ts
  describe('getTrend', () => {
    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(new Date('2026-07-23T12:00:00Z'));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('buckets candidate counts by day over the requested window', async () => {
      const tx = stubTx({
        candidate: {
          count: jest.fn().mockResolvedValue(0),
          findMany: jest.fn().mockResolvedValue([
            { createdAt: new Date('2026-07-22T09:00:00Z') },
            { createdAt: new Date('2026-07-22T15:00:00Z') },
            { createdAt: new Date('2026-07-20T09:00:00Z') },
          ]),
        },
      });
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.getTrend(context, 'candidates', 7);

      expect(result.points).toHaveLength(7);
      expect(result.points[result.points.length - 1]).toEqual({ date: '2026-07-23', value: 0 });
      expect(result.points.find((p) => p.date === '2026-07-22')).toEqual({ date: '2026-07-22', value: 2 });
      expect(result.points.find((p) => p.date === '2026-07-20')).toEqual({ date: '2026-07-20', value: 1 });
      expect(tx.candidate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ organizationId: 'org-1', erasedAt: null, createdAt: { gte: new Date('2026-07-16T12:00:00Z') } }),
        }),
      );
    });

    it('buckets invitation counts by invitedAt for the invitations metric', async () => {
      const tx = stubTx({
        invitation: {
          count: jest.fn().mockResolvedValue(0),
          findMany: jest.fn().mockResolvedValue([{ invitedAt: new Date('2026-07-23T08:00:00Z') }]),
        },
      });
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.getTrend(context, 'invitations', 14);

      expect(result.points).toHaveLength(14);
      expect(result.points[result.points.length - 1]).toEqual({ date: '2026-07-23', value: 1 });
    });

    it('buckets attempt-started counts by startedAt for the attempts metric', async () => {
      const tx = stubTx({
        attempt: {
          count: jest.fn().mockResolvedValue(0),
          groupBy: jest.fn().mockResolvedValue([]),
          findMany: jest.fn().mockResolvedValue([{ startedAt: new Date('2026-07-21T08:00:00Z') }]),
        },
      });
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.getTrend(context, 'attempts', 30);

      expect(result.points).toHaveLength(30);
      expect(result.points.find((p) => p.date === '2026-07-21')).toEqual({ date: '2026-07-21', value: 1 });
    });

    it('buckets pending-grading counts by submittedAt for attempts still awaiting manual grading', async () => {
      const tx = stubTx({
        attempt: {
          count: jest.fn().mockResolvedValue(0),
          groupBy: jest.fn().mockResolvedValue([]),
          findMany: jest.fn().mockResolvedValue([{ submittedAt: new Date('2026-07-23T08:00:00Z') }]),
        },
      });
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.getTrend(context, 'pendingGrading', 7);

      expect(tx.attempt.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ status: 'pending_manual_grade' }) }),
      );
      expect(result.points[result.points.length - 1]).toEqual({ date: '2026-07-23', value: 1 });
    });

    it('returns all-zero points for a metric with no matching rows', async () => {
      const tx = stubTx();
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.getTrend(context, 'candidates', 7);

      expect(result.points.every((p) => p.value === 0)).toBe(true);
    });
  });
```

Also extend the shared `stubTx` helper (near the top of the file) so every test's default mock has the new `findMany` methods the trend queries call, without changing any existing test's behavior:

```ts
  function stubTx(overrides: Partial<Record<string, any>> = {}) {
    return {
      exam: {
        findMany: jest.fn().mockResolvedValueOnce([{ id: 'exam-1', title: 'Backend Round' }]).mockResolvedValue([]),
      },
      candidate: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
      invitation: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
      attempt: { count: jest.fn().mockResolvedValue(0), groupBy: jest.fn().mockResolvedValue([]), findMany: jest.fn().mockResolvedValue([]) },
      result: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
      proctoringEvent: { findMany: jest.fn().mockResolvedValue([]) },
      auditLog: { findMany: jest.fn().mockResolvedValue([]) },
      ...overrides,
    };
  }
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test --workspace=apps/api -- dashboard.service.spec.ts`
Expected: FAIL — `service.getTrend is not a function`

- [ ] **Step 3: Implement `getTrend` in `dashboard.service.ts`**

Add these two module-level helpers directly below the existing `RECENT_PROCTORING_LIMIT`/`UPCOMING_EXAMS_LIMIT` constants, and add the `DashboardTrend`/`DashboardTrendPoint` interfaces directly below the existing `DashboardSummary` interface:

```ts
export interface DashboardTrendPoint {
  date: string;
  value: number;
}

export interface DashboardTrend {
  points: DashboardTrendPoint[];
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function bucketByDay(timestamps: Date[], days: number): DashboardTrendPoint[] {
  const counts = new Map<string, number>();
  for (const timestamp of timestamps) {
    const key = timestamp.toISOString().slice(0, 10);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const points: DashboardTrendPoint[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - offset);
    const key = date.toISOString().slice(0, 10);
    points.push({ date: key, value: counts.get(key) ?? 0 });
  }
  return points;
}
```

Add this method inside the `DashboardService` class, after `getSummary`:

```ts
  async getTrend(
    context: TenantContext,
    metric: 'candidates' | 'invitations' | 'attempts' | 'pendingGrading',
    days: 7 | 14 | 30,
  ): Promise<DashboardTrend> {
    const organizationId = context.organizationId as string;

    return this.tenantPrisma.forTenant(context, async (tx) => {
      const exams = await tx.exam.findMany({ where: { organizationId }, select: { id: true } });
      const examIds = exams.map((exam) => exam.id);
      const windowStart = daysAgo(days);

      let timestamps: Date[];
      switch (metric) {
        case 'candidates': {
          const rows = await tx.candidate.findMany({
            where: { organizationId, erasedAt: null, createdAt: { gte: windowStart } },
            select: { createdAt: true },
          });
          timestamps = rows.map((row) => row.createdAt);
          break;
        }
        case 'invitations': {
          const rows = await tx.invitation.findMany({
            where: { examId: { in: examIds }, invitedAt: { gte: windowStart } },
            select: { invitedAt: true },
          });
          timestamps = rows.map((row) => row.invitedAt);
          break;
        }
        case 'attempts': {
          const rows = await tx.attempt.findMany({
            where: { examId: { in: examIds }, startedAt: { gte: windowStart } },
            select: { startedAt: true },
          });
          timestamps = rows.map((row) => row.startedAt);
          break;
        }
        case 'pendingGrading': {
          const rows = await tx.attempt.findMany({
            where: { examId: { in: examIds }, status: 'pending_manual_grade', submittedAt: { gte: windowStart } },
            select: { submittedAt: true },
          });
          timestamps = rows.map((row) => row.submittedAt as Date);
          break;
        }
      }

      return { points: bucketByDay(timestamps, days) };
    });
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test --workspace=apps/api -- dashboard.service.spec.ts`
Expected: PASS (all `getTrend` tests plus all pre-existing tests)

- [ ] **Step 5: Write the failing controller tests**

Create `apps/api/src/dashboard/dashboard.controller.spec.ts`:

```ts
import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

describe('DashboardController', () => {
  let controller: DashboardController;
  let service: { getSummary: jest.Mock; getTrend: jest.Mock; getExamPerformance: jest.Mock; getFunnel: jest.Mock };
  const tenant = { organizationId: 'org-1', isSuperAdmin: false } as any;

  beforeEach(async () => {
    service = {
      getSummary: jest.fn(),
      getTrend: jest.fn().mockResolvedValue({ points: [] }),
      getExamPerformance: jest.fn().mockResolvedValue({ exams: [] }),
      getFunnel: jest.fn().mockResolvedValue({ invited: 0, started: 0, submitted: 0, passed: 0 }),
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [DashboardController],
      providers: [{ provide: DashboardService, useValue: service }],
    }).compile();
    controller = moduleRef.get(DashboardController);
  });

  describe('getTrend', () => {
    it('rejects an invalid metric', () => {
      expect(() => controller.getTrend(tenant, 'bogus', '14')).toThrow(BadRequestException);
    });

    it('rejects a missing metric', () => {
      expect(() => controller.getTrend(tenant, undefined, '14')).toThrow(BadRequestException);
    });

    it('defaults days to 14 when omitted', () => {
      controller.getTrend(tenant, 'candidates', undefined);
      expect(service.getTrend).toHaveBeenCalledWith(tenant, 'candidates', 14);
    });

    it('defaults days to 14 when given a value outside {7, 14, 30}', () => {
      controller.getTrend(tenant, 'candidates', '99');
      expect(service.getTrend).toHaveBeenCalledWith(tenant, 'candidates', 14);
    });

    it('passes a valid metric and days through to the service', () => {
      controller.getTrend(tenant, 'invitations', '30');
      expect(service.getTrend).toHaveBeenCalledWith(tenant, 'invitations', 30);
    });
  });
});
```

- [ ] **Step 6: Run the controller tests to verify they fail**

Run: `npm run test --workspace=apps/api -- dashboard.controller.spec.ts`
Expected: FAIL — `controller.getTrend is not a function`

- [ ] **Step 7: Implement the `trend` route in `dashboard.controller.ts`**

Replace the full file contents with:

```ts
import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequireAnyPermission } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { TenantContext } from '@exam-platform/shared';
import { DashboardService } from './dashboard.service';

const TREND_METRICS = ['candidates', 'invitations', 'attempts', 'pendingGrading'] as const;
const TREND_DAYS = [7, 14, 30] as const;

type TrendMetric = (typeof TREND_METRICS)[number];
type TrendDays = (typeof TREND_DAYS)[number];

@Controller('dashboard')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  @RequireAnyPermission('exam:manage', 'results:view')
  getSummary(@CurrentTenant() tenant: TenantContext) {
    return this.dashboardService.getSummary(tenant);
  }

  @Get('trend')
  @RequireAnyPermission('exam:manage', 'results:view')
  getTrend(@CurrentTenant() tenant: TenantContext, @Query('metric') metric?: string, @Query('days') days?: string) {
    if (!metric || !(TREND_METRICS as readonly string[]).includes(metric)) {
      throw new BadRequestException(`metric must be one of ${TREND_METRICS.join(', ')}`);
    }
    const parsedDays = Number(days);
    const resolvedDays: TrendDays = (TREND_DAYS as readonly number[]).includes(parsedDays) ? (parsedDays as TrendDays) : 14;
    return this.dashboardService.getTrend(tenant, metric as TrendMetric, resolvedDays);
  }
}
```

- [ ] **Step 8: Run the controller tests to verify they pass**

Run: `npm run test --workspace=apps/api -- dashboard.controller.spec.ts`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/dashboard/dashboard.service.ts apps/api/src/dashboard/dashboard.controller.ts apps/api/src/dashboard/dashboard.service.spec.ts apps/api/src/dashboard/dashboard.controller.spec.ts
git commit -m "feat: add dashboard trend endpoint for time-series metrics"
```

---

### Task 2: Backend — `GET /dashboard/exam-performance`

**Files:**
- Modify: `apps/api/src/dashboard/dashboard.service.ts`
- Modify: `apps/api/src/dashboard/dashboard.controller.ts`
- Modify: `apps/api/src/dashboard/dashboard.service.spec.ts`
- Modify: `apps/api/src/dashboard/dashboard.controller.spec.ts`

**Interfaces:**
- Consumes: `daysAgo(days: number): Date` (from Task 1, same file).
- Produces: `DashboardService.getExamPerformance(context: TenantContext, limit: 5 | 10 | 'all', window: 'all' | '30d' | '90d'): Promise<DashboardExamPerformance>` where `DashboardExamPerformance = { exams: { examId: string; examTitle: string; passRate: number; avgScore: number; candidateCount: number }[] }`, sorted by `candidateCount` descending, truncated to `limit`.
- Produces: `DashboardController.getExamPerformance(tenant, limit?: string, window?: string)` bound to `GET /dashboard/exam-performance?limit=...&window=...`.

- [ ] **Step 1: Write the failing service tests**

Add a new `describe('getExamPerformance', ...)` block to `apps/api/src/dashboard/dashboard.service.spec.ts`, after the `getTrend` block:

```ts
  describe('getExamPerformance', () => {
    it('aggregates pass rate, average score, and candidate count per exam from Result rows', async () => {
      const tx = stubTx({
        exam: {
          findMany: jest
            .fn()
            .mockResolvedValueOnce([
              { id: 'exam-1', title: 'Backend Round' },
              { id: 'exam-2', title: 'Frontend Round' },
            ])
            .mockResolvedValue([]),
        },
        result: {
          count: jest.fn().mockResolvedValue(0),
          findMany: jest.fn().mockResolvedValue([
            { passFail: 'pass', percentage: 80, attempt: { examId: 'exam-1', candidateId: 'cand-1' } },
            { passFail: 'fail', percentage: 40, attempt: { examId: 'exam-1', candidateId: 'cand-2' } },
            { passFail: 'pass', percentage: 90, attempt: { examId: 'exam-2', candidateId: 'cand-3' } },
          ]),
        },
      });
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.getExamPerformance(context, 10, 'all');

      expect(result.exams).toEqual([
        { examId: 'exam-1', examTitle: 'Backend Round', passRate: 50, avgScore: 60, candidateCount: 2 },
        { examId: 'exam-2', examTitle: 'Frontend Round', passRate: 100, avgScore: 90, candidateCount: 1 },
      ]);
    });

    it('sorts by candidate count descending and truncates to the given limit', async () => {
      const tx = stubTx({
        exam: {
          findMany: jest
            .fn()
            .mockResolvedValueOnce([
              { id: 'exam-1', title: 'Small' },
              { id: 'exam-2', title: 'Big' },
            ])
            .mockResolvedValue([]),
        },
        result: {
          count: jest.fn().mockResolvedValue(0),
          findMany: jest.fn().mockResolvedValue([
            { passFail: 'pass', percentage: 70, attempt: { examId: 'exam-1', candidateId: 'cand-1' } },
            { passFail: 'pass', percentage: 70, attempt: { examId: 'exam-2', candidateId: 'cand-2' } },
            { passFail: 'pass', percentage: 70, attempt: { examId: 'exam-2', candidateId: 'cand-3' } },
          ]),
        },
      });
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.getExamPerformance(context, 1, 'all');

      expect(result.exams).toEqual([{ examId: 'exam-2', examTitle: 'Big', passRate: 100, avgScore: 70, candidateCount: 2 }]);
    });

    it('filters settled attempts by window using the underlying attempt submittedAt', async () => {
      const tx = stubTx();
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await service.getExamPerformance(context, 'all', '30d');

      expect(tx.result.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            attempt: expect.objectContaining({ submittedAt: expect.objectContaining({ gte: expect.any(Date) }) }),
          }),
        }),
      );
    });

    it('returns an empty exams list for an org with no settled attempts', async () => {
      const tx = stubTx();
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.getExamPerformance(context, 5, 'all');

      expect(result.exams).toEqual([]);
    });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test --workspace=apps/api -- dashboard.service.spec.ts`
Expected: FAIL — `service.getExamPerformance is not a function`

- [ ] **Step 3: Implement `getExamPerformance` in `dashboard.service.ts`**

Add the interfaces directly below `DashboardTrend`:

```ts
export interface DashboardExamPerformanceRow {
  examId: string;
  examTitle: string;
  passRate: number;
  avgScore: number;
  candidateCount: number;
}

export interface DashboardExamPerformance {
  exams: DashboardExamPerformanceRow[];
}
```

Add this method inside `DashboardService`, after `getTrend`:

```ts
  async getExamPerformance(
    context: TenantContext,
    limit: 5 | 10 | 'all',
    window: 'all' | '30d' | '90d',
  ): Promise<DashboardExamPerformance> {
    const organizationId = context.organizationId as string;

    return this.tenantPrisma.forTenant(context, async (tx) => {
      const exams = await tx.exam.findMany({ where: { organizationId }, select: { id: true, title: true } });
      const examIds = exams.map((exam) => exam.id);
      const examTitleById = new Map(exams.map((exam) => [exam.id, exam.title]));
      const windowStart = window === '30d' ? daysAgo(30) : window === '90d' ? daysAgo(90) : null;

      const results = await tx.result.findMany({
        where: {
          attempt: {
            examId: { in: examIds },
            ...(windowStart ? { submittedAt: { gte: windowStart } } : {}),
          },
        },
        select: { passFail: true, percentage: true, attempt: { select: { examId: true, candidateId: true } } },
      });

      const byExam = new Map<string, { passCount: number; scoreSum: number; total: number; candidateIds: Set<string> }>();
      for (const result of results) {
        const examId = result.attempt.examId;
        const bucket = byExam.get(examId) ?? { passCount: 0, scoreSum: 0, total: 0, candidateIds: new Set<string>() };
        bucket.total += 1;
        bucket.scoreSum += result.percentage;
        if (result.passFail === 'pass') bucket.passCount += 1;
        bucket.candidateIds.add(result.attempt.candidateId);
        byExam.set(examId, bucket);
      }

      const rows = Array.from(byExam.entries())
        .map(([examId, bucket]) => ({
          examId,
          examTitle: examTitleById.get(examId) ?? 'Unknown exam',
          passRate: Math.round((bucket.passCount / bucket.total) * 100),
          avgScore: Math.round(bucket.scoreSum / bucket.total),
          candidateCount: bucket.candidateIds.size,
        }))
        .sort((a, b) => b.candidateCount - a.candidateCount);

      const limited = limit === 'all' ? rows : rows.slice(0, limit);
      return { exams: limited };
    });
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test --workspace=apps/api -- dashboard.service.spec.ts`
Expected: PASS

- [ ] **Step 5: Write the failing controller tests**

Add a new `describe('getExamPerformance', ...)` block to `apps/api/src/dashboard/dashboard.controller.spec.ts`, after the `getTrend` block:

```ts
  describe('getExamPerformance', () => {
    it('rejects an invalid limit', () => {
      expect(() => controller.getExamPerformance(tenant, 'bogus', 'all')).toThrow(BadRequestException);
    });

    it('rejects a missing limit', () => {
      expect(() => controller.getExamPerformance(tenant, undefined, 'all')).toThrow(BadRequestException);
    });

    it('rejects an invalid window', () => {
      expect(() => controller.getExamPerformance(tenant, '5', 'bogus')).toThrow(BadRequestException);
    });

    it('passes a numeric limit and window through to the service', () => {
      controller.getExamPerformance(tenant, '10', '30d');
      expect(service.getExamPerformance).toHaveBeenCalledWith(tenant, 10, '30d');
    });

    it('passes limit "all" through unchanged', () => {
      controller.getExamPerformance(tenant, 'all', 'all');
      expect(service.getExamPerformance).toHaveBeenCalledWith(tenant, 'all', 'all');
    });
  });
```

- [ ] **Step 6: Run the controller tests to verify they fail**

Run: `npm run test --workspace=apps/api -- dashboard.controller.spec.ts`
Expected: FAIL — `controller.getExamPerformance is not a function`

- [ ] **Step 7: Implement the `exam-performance` route in `dashboard.controller.ts`**

Add these constants/types near the top of the file, below the existing `TREND_DAYS` line:

```ts
const PERFORMANCE_LIMITS = ['5', '10', 'all'] as const;
const WINDOWS = ['all', '30d', '90d'] as const;

type PerformanceLimit = 5 | 10 | 'all';
type Window = (typeof WINDOWS)[number];
```

Add this method inside `DashboardController`, after `getTrend`:

```ts
  @Get('exam-performance')
  @RequireAnyPermission('exam:manage', 'results:view')
  getExamPerformance(
    @CurrentTenant() tenant: TenantContext,
    @Query('limit') limit?: string,
    @Query('window') window?: string,
  ) {
    if (!limit || !(PERFORMANCE_LIMITS as readonly string[]).includes(limit)) {
      throw new BadRequestException(`limit must be one of ${PERFORMANCE_LIMITS.join(', ')}`);
    }
    if (!window || !(WINDOWS as readonly string[]).includes(window)) {
      throw new BadRequestException(`window must be one of ${WINDOWS.join(', ')}`);
    }
    const resolvedLimit: PerformanceLimit = limit === 'all' ? 'all' : (Number(limit) as 5 | 10);
    return this.dashboardService.getExamPerformance(tenant, resolvedLimit, window as Window);
  }
```

- [ ] **Step 8: Run the controller tests to verify they pass**

Run: `npm run test --workspace=apps/api -- dashboard.controller.spec.ts`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/dashboard/dashboard.service.ts apps/api/src/dashboard/dashboard.controller.ts apps/api/src/dashboard/dashboard.service.spec.ts apps/api/src/dashboard/dashboard.controller.spec.ts
git commit -m "feat: add dashboard exam-performance endpoint"
```

---

### Task 3: Backend — `GET /dashboard/funnel` and remove `funnel` from `/dashboard/summary`

**Files:**
- Modify: `apps/api/src/dashboard/dashboard.service.ts`
- Modify: `apps/api/src/dashboard/dashboard.controller.ts`
- Modify: `apps/api/src/dashboard/dashboard.service.spec.ts`
- Modify: `apps/api/src/dashboard/dashboard.controller.spec.ts`

**Interfaces:**
- Consumes: `daysAgo(days: number): Date` (from Task 1, same file).
- Produces: `DashboardService.getFunnel(context: TenantContext, examId: string, window: 'all' | '30d' | '90d'): Promise<DashboardFunnel>` where `DashboardFunnel = { invited: number; started: number; submitted: number; passed: number }`.
- Produces: `DashboardController.getFunnel(tenant, examId?: string, window?: string)` bound to `GET /dashboard/funnel?examId=...&window=...`.
- Removes: the `funnel` field from `DashboardSummary` and from `DashboardService.getSummary`'s return value and internal query list.

- [ ] **Step 1: Write the failing/updated service tests**

In `apps/api/src/dashboard/dashboard.service.spec.ts`:

1. Delete the entire `it('computes the candidate funnel from invitation/attempt/result counts', ...)` test (the one asserting on `result.funnel`).
2. In `it('returns an empty funnel and upcoming-exams list for an org with no data', ...)`, rename it and remove the funnel assertion:

```ts
  it('returns an empty upcoming-exams list for an org with no data', async () => {
    const tx = stubTx({ invitation: { count: jest.fn().mockResolvedValue(0) }, result: { count: jest.fn().mockResolvedValue(0) } });
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    const result = await service.getSummary(context);

    expect(result.upcomingExams).toEqual([]);
  });
```

3. Add a new `describe('getFunnel', ...)` block, after the `getExamPerformance` block:

```ts
  describe('getFunnel', () => {
    it('computes invited/started/submitted/passed across all of the org exams by default', async () => {
      const tx = stubTx({
        exam: {
          findMany: jest
            .fn()
            .mockResolvedValueOnce([
              { id: 'exam-1', title: 'Backend Round' },
              { id: 'exam-2', title: 'Frontend Round' },
            ])
            .mockResolvedValue([]),
        },
        invitation: { count: jest.fn().mockResolvedValue(100) },
        attempt: { count: jest.fn().mockResolvedValue(60), groupBy: jest.fn().mockResolvedValue([]) },
        result: { count: jest.fn().mockResolvedValue(22) },
      });
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.getFunnel(context, 'all', 'all');

      expect(result).toEqual({ invited: 100, started: 60, submitted: 60, passed: 22 });
      expect(tx.invitation.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ examId: { in: ['exam-1', 'exam-2'] } }) }),
      );
    });

    it('scopes to a single exam when examId is not "all"', async () => {
      const tx = stubTx({
        exam: {
          findMany: jest
            .fn()
            .mockResolvedValueOnce([
              { id: 'exam-1', title: 'Backend Round' },
              { id: 'exam-2', title: 'Frontend Round' },
            ])
            .mockResolvedValue([]),
        },
        invitation: { count: jest.fn().mockResolvedValue(40) },
      });
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await service.getFunnel(context, 'exam-1', 'all');

      expect(tx.invitation.count).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ examId: { in: ['exam-1'] } }) }));
    });

    it('scopes to zero results when examId does not belong to the organization', async () => {
      const tx = stubTx({
        exam: {
          findMany: jest.fn().mockResolvedValueOnce([{ id: 'exam-1', title: 'Backend Round' }]).mockResolvedValue([]),
        },
      });
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      const result = await service.getFunnel(context, 'someone-elses-exam', 'all');

      expect(result).toEqual({ invited: 0, started: 0, submitted: 0, passed: 0 });
    });

    it('filters by invitation invitedAt when a window is given', async () => {
      const tx = stubTx();
      tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

      await service.getFunnel(context, 'all', '30d');

      expect(tx.invitation.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ invitedAt: expect.objectContaining({ gte: expect.any(Date) }) }) }),
      );
      expect(tx.attempt.count).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ invitation: expect.objectContaining({ invitedAt: expect.objectContaining({ gte: expect.any(Date) }) }) }) }),
      );
    });
  });
```

- [ ] **Step 2: Run the tests to verify the new/updated tests fail**

Run: `npm run test --workspace=apps/api -- dashboard.service.spec.ts`
Expected: FAIL — `service.getFunnel is not a function`; the renamed test still passes since `funnel` is still on `getSummary` at this point.

- [ ] **Step 3: Implement `getFunnel` and remove `funnel` from `getSummary` in `dashboard.service.ts`**

Add the interface directly below `DashboardExamPerformance`:

```ts
export interface DashboardFunnel {
  invited: number;
  started: number;
  submitted: number;
  passed: number;
}
```

Remove the `funnel` field from the `DashboardSummary` interface (delete these 5 lines):

```ts
  funnel: {
    invited: number;
    started: number;
    submitted: number;
    passed: number;
  };
```

In `getSummary`, remove `submittedCount` and `passedCount` from the destructured `Promise.all` result and from the array itself (they are no longer used anywhere in `getSummary` once `funnel` is removed):

```ts
      const [
        totalCandidates,
        invitationsSent,
        attemptsInProgress,
        startedCount,
        pendingGradingGroups,
        staleInvitationCount,
        recentProctoringEvents,
        auditRows,
        upcomingExamRows,
      ] = await Promise.all([
        tx.candidate.count({ where: { organizationId, erasedAt: null } }),
        tx.invitation.count({ where: { examId: { in: examIds } } }),
        tx.attempt.count({ where: { examId: { in: examIds }, status: 'in_progress' } }),
        tx.attempt.count({ where: { examId: { in: examIds } } }),
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
```

Note `startedCount` is now unused by the return object too (it was only used for `funnel.started`) — remove it from the destructure and from `Promise.all` as well, leaving:

```ts
      const [
        totalCandidates,
        invitationsSent,
        attemptsInProgress,
        pendingGradingGroups,
        staleInvitationCount,
        recentProctoringEvents,
        auditRows,
        upcomingExamRows,
      ] = await Promise.all([
        tx.candidate.count({ where: { organizationId, erasedAt: null } }),
        tx.invitation.count({ where: { examId: { in: examIds } } }),
        tx.attempt.count({ where: { examId: { in: examIds }, status: 'in_progress' } }),
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
          take: UPCOMING_EXAMS_LIMIT,
        }),
        tx.exam.findMany({
          where: { organizationId, schedulingEnabled: true, availabilityWindowStart: { gt: new Date() } },
          select: { id: true, title: true, availabilityWindowStart: true },
          orderBy: { availabilityWindowStart: 'asc' },
          take: UPCOMING_EXAMS_LIMIT,
        }),
      ]);
```

(Keep the `auditLog.findMany`'s own `take: ACTIVITY_LIMIT` — the line above is illustrative of the array shape only; do not actually change `ACTIVITY_LIMIT` to `UPCOMING_EXAMS_LIMIT`. The exact final block is:)

```ts
      const [
        totalCandidates,
        invitationsSent,
        attemptsInProgress,
        pendingGradingGroups,
        staleInvitationCount,
        recentProctoringEvents,
        auditRows,
        upcomingExamRows,
      ] = await Promise.all([
        tx.candidate.count({ where: { organizationId, erasedAt: null } }),
        tx.invitation.count({ where: { examId: { in: examIds } } }),
        tx.attempt.count({ where: { examId: { in: examIds }, status: 'in_progress' } }),
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
```

Remove the `funnel: { ... }` block from the object `getSummary` returns.

Add this method inside `DashboardService`, after `getExamPerformance`:

```ts
  async getFunnel(context: TenantContext, examId: string, window: 'all' | '30d' | '90d'): Promise<DashboardFunnel> {
    const organizationId = context.organizationId as string;

    return this.tenantPrisma.forTenant(context, async (tx) => {
      const exams = await tx.exam.findMany({ where: { organizationId }, select: { id: true } });
      const examIds = exams.map((exam) => exam.id);
      const targetExamIds = examId === 'all' ? examIds : examIds.filter((id) => id === examId);
      const windowStart = window === '30d' ? daysAgo(30) : window === '90d' ? daysAgo(90) : null;
      const invitationFilter = windowStart ? { invitedAt: { gte: windowStart } } : {};

      const [invited, started, submitted, passed] = await Promise.all([
        tx.invitation.count({ where: { examId: { in: targetExamIds }, ...invitationFilter } }),
        tx.attempt.count({
          where: { examId: { in: targetExamIds }, ...(windowStart ? { invitation: invitationFilter } : {}) },
        }),
        tx.attempt.count({
          where: {
            examId: { in: targetExamIds },
            submittedAt: { not: null },
            ...(windowStart ? { invitation: invitationFilter } : {}),
          },
        }),
        tx.result.count({
          where: {
            attempt: { examId: { in: targetExamIds }, ...(windowStart ? { invitation: invitationFilter } : {}) },
            passFail: 'pass',
          },
        }),
      ]);

      return { invited, started, submitted, passed };
    });
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test --workspace=apps/api -- dashboard.service.spec.ts`
Expected: PASS

- [ ] **Step 5: Write the failing controller tests**

Add a new `describe('getFunnel', ...)` block to `apps/api/src/dashboard/dashboard.controller.spec.ts`, after the `getExamPerformance` block:

```ts
  describe('getFunnel', () => {
    it('rejects a missing examId', () => {
      expect(() => controller.getFunnel(tenant, undefined, 'all')).toThrow(BadRequestException);
    });

    it('rejects an invalid window', () => {
      expect(() => controller.getFunnel(tenant, 'all', 'bogus')).toThrow(BadRequestException);
    });

    it('passes examId and window through to the service', () => {
      controller.getFunnel(tenant, 'exam-1', '90d');
      expect(service.getFunnel).toHaveBeenCalledWith(tenant, 'exam-1', '90d');
    });

    it('passes examId "all" through unchanged', () => {
      controller.getFunnel(tenant, 'all', 'all');
      expect(service.getFunnel).toHaveBeenCalledWith(tenant, 'all', 'all');
    });
  });
```

- [ ] **Step 6: Run the controller tests to verify they fail**

Run: `npm run test --workspace=apps/api -- dashboard.controller.spec.ts`
Expected: FAIL — `controller.getFunnel is not a function`

- [ ] **Step 7: Implement the `funnel` route in `dashboard.controller.ts`**

Add this method inside `DashboardController`, after `getExamPerformance`:

```ts
  @Get('funnel')
  @RequireAnyPermission('exam:manage', 'results:view')
  getFunnel(@CurrentTenant() tenant: TenantContext, @Query('examId') examId?: string, @Query('window') window?: string) {
    if (!examId) {
      throw new BadRequestException('examId query parameter is required');
    }
    if (!window || !(WINDOWS as readonly string[]).includes(window)) {
      throw new BadRequestException(`window must be one of ${WINDOWS.join(', ')}`);
    }
    return this.dashboardService.getFunnel(tenant, examId, window as Window);
  }
```

- [ ] **Step 8: Run the controller tests to verify they pass**

Run: `npm run test --workspace=apps/api -- dashboard.controller.spec.ts`
Expected: PASS

- [ ] **Step 9: Run the full backend test suite to confirm nothing else broke**

Run: `npm run test:api`
Expected: PASS (all suites, including `dashboard.service.spec.ts` and `dashboard.controller.spec.ts`)

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/dashboard/dashboard.service.ts apps/api/src/dashboard/dashboard.controller.ts apps/api/src/dashboard/dashboard.service.spec.ts apps/api/src/dashboard/dashboard.controller.spec.ts
git commit -m "feat: add dashboard funnel endpoint, remove funnel from summary"
```

---

### Task 4: Frontend — D3 dependencies, updated types, and new dashboard hooks

**Files:**
- Modify: `apps/web/package.json` (via `npm install`)
- Modify: `apps/web/lib/types.ts`
- Modify: `apps/web/lib/hooks/useDashboard.ts`

**Interfaces:**
- Consumes: nothing new (uses existing `apiFetch`, `useAuth`).
- Produces: `DashboardTrendMetric`, `DashboardTrendDays`, `DashboardPerformanceLimit`, `DashboardWindow`, `DashboardTrend`, `DashboardExamPerformance`, `DashboardFunnel` types in `apps/web/lib/types.ts`; `useDashboardTrend(metric, days)`, `useDashboardExamPerformance(limit, window)`, `useDashboardFunnel(examId, window)` hooks in `apps/web/lib/hooks/useDashboard.ts`. All three later tasks (8, 9, 10) consume these hooks and types by these exact names.
- Removes: the `funnel` field from `DashboardSummary` in `apps/web/lib/types.ts`.

This task has no new tests of its own — types and hooks are exercised by the component/page tests in later tasks. This matches the existing `useDashboardSummary` hook, which also has no dedicated test file.

- [ ] **Step 1: Install the new dependencies**

Run: `npm install d3-scale d3-shape --workspace=apps/web`
Run: `npm install --save-dev @types/d3-scale @types/d3-shape --workspace=apps/web`

Expected: `apps/web/package.json` gains `d3-scale` and `d3-shape` under `dependencies`, and `@types/d3-scale`/`@types/d3-shape` under `devDependencies`; the root `package-lock.json` updates.

- [ ] **Step 2: Update `apps/web/lib/types.ts`**

Find the `DashboardSummary` interface and remove its `funnel` field:

```ts
export interface DashboardSummary {
  stats: { totalCandidates: number; invitationsSent: number; attemptsInProgress: number; pendingGradingCount: number; };
  attention: {
    pendingGrading: { examId: string; examTitle: string; count: number }[];
    recentProctoringFlags: { examId: string; examTitle: string; occurredAt: string }[];
    staleInvitationCount: number;
  };
  activity: { id: string; description: string; occurredAt: string }[];
  upcomingExams: { examId: string; examTitle: string; availabilityWindowStart: string }[];
}
```

Add these new types directly below the (now-shorter) `DashboardSummary` interface:

```ts
export type DashboardTrendMetric = 'candidates' | 'invitations' | 'attempts' | 'pendingGrading';
export type DashboardTrendDays = 7 | 14 | 30;
export type DashboardPerformanceLimit = 5 | 10 | 'all';
export type DashboardWindow = 'all' | '30d' | '90d';

export interface DashboardTrend {
  points: { date: string; value: number }[];
}

export interface DashboardExamPerformance {
  exams: { examId: string; examTitle: string; passRate: number; avgScore: number; candidateCount: number }[];
}

export interface DashboardFunnel {
  invited: number;
  started: number;
  submitted: number;
  passed: number;
}
```

- [ ] **Step 3: Add the new hooks to `apps/web/lib/hooks/useDashboard.ts`**

Replace the full file contents with:

```ts
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import {
  DashboardExamPerformance,
  DashboardFunnel,
  DashboardPerformanceLimit,
  DashboardSummary,
  DashboardTrend,
  DashboardTrendDays,
  DashboardTrendMetric,
  DashboardWindow,
} from '../types';
import { useAuth } from '../auth-context';

export function useDashboardSummary() {
  const { accessToken } = useAuth();
  return useQuery<DashboardSummary>({
    queryKey: ['dashboard-summary'],
    queryFn: () => apiFetch('/dashboard/summary', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}

export function useDashboardTrend(metric: DashboardTrendMetric, days: DashboardTrendDays) {
  const { accessToken } = useAuth();
  return useQuery<DashboardTrend>({
    queryKey: ['dashboard-trend', metric, days],
    queryFn: () => apiFetch(`/dashboard/trend?metric=${metric}&days=${days}`, {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}

export function useDashboardExamPerformance(limit: DashboardPerformanceLimit, window: DashboardWindow) {
  const { accessToken } = useAuth();
  return useQuery<DashboardExamPerformance>({
    queryKey: ['dashboard-exam-performance', limit, window],
    queryFn: () => apiFetch(`/dashboard/exam-performance?limit=${limit}&window=${window}`, {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}

export function useDashboardFunnel(examId: string, window: DashboardWindow) {
  const { accessToken } = useAuth();
  return useQuery<DashboardFunnel>({
    queryKey: ['dashboard-funnel', examId, window],
    queryFn: () => apiFetch(`/dashboard/funnel?examId=${examId}&window=${window}`, {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}
```

- [ ] **Step 4: Run the frontend TypeScript build to confirm no type errors from the removed `funnel` field**

Run: `npm run build --workspace=apps/web`
Expected: FAILS at this point, because `apps/web/app/(recruiter)/dashboard/page.tsx` still reads `summary.funnel` (fixed in Task 10) and `apps/web/app/(recruiter)/dashboard/page.test.tsx` still sends a `funnel` field in its mock summaries (harmless extra field, fixed in Task 10). This is expected — do not fix `page.tsx` in this task. Confirm the only errors reported are in `dashboard/page.tsx` referencing `summary.funnel`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/package.json package-lock.json apps/web/lib/types.ts apps/web/lib/hooks/useDashboard.ts
git commit -m "feat: add d3-scale/d3-shape deps and dashboard trend/exam-performance/funnel hooks"
```

---

### Task 5: Frontend — `Sparkline` chart component

**Files:**
- Create: `apps/web/components/charts/Sparkline.tsx`
- Create: `apps/web/components/charts/Sparkline.test.tsx`

**Interfaces:**
- Produces: `Sparkline({ data, color }: { data: { date: string; value: number }[]; color: string })` — a React component rendering an `<svg>` line+gradient-area chart. Consumed by Task 8.
- Consumes: `d3-scale`'s `scalePoint`/`scaleLinear`, `d3-shape`'s `line`/`area`/`curveMonotoneX` (installed in Task 4).

- [ ] **Step 1: Write the failing test**

Create `apps/web/components/charts/Sparkline.test.tsx`:

```tsx
import { render } from '@testing-library/react';
import { Sparkline } from './Sparkline';

describe('Sparkline', () => {
  it('renders an area path and a line path for the given data', () => {
    const { container } = render(
      <Sparkline
        data={[
          { date: '2026-07-01', value: 3 },
          { date: '2026-07-02', value: 7 },
          { date: '2026-07-03', value: 5 },
        ]}
        color="#0d9488"
      />,
    );
    expect(container.querySelectorAll('path')).toHaveLength(2);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('renders without crashing and with no paths for empty data', () => {
    const { container } = render(<Sparkline data={[]} color="#0d9488" />);
    expect(container.querySelector('svg')).toBeInTheDocument();
    expect(container.querySelectorAll('path')).toHaveLength(0);
  });

  it('renders a flat line without crashing when every value is zero', () => {
    const { container } = render(
      <Sparkline
        data={[
          { date: '2026-07-01', value: 0 },
          { date: '2026-07-02', value: 0 },
        ]}
        color="#0d9488"
      />,
    );
    expect(container.querySelectorAll('path')).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test --workspace=apps/web -- components/charts/Sparkline.test.tsx`
Expected: FAIL — cannot find module `./Sparkline`

- [ ] **Step 3: Implement `Sparkline.tsx`**

Create `apps/web/components/charts/Sparkline.tsx`:

```tsx
'use client';

import { useId } from 'react';
import { scaleLinear, scalePoint } from 'd3-scale';
import { area, curveMonotoneX, line } from 'd3-shape';

export interface SparklinePoint {
  date: string;
  value: number;
}

interface SparklineProps {
  data: SparklinePoint[];
  color: string;
}

const WIDTH = 200;
const HEIGHT = 48;

export function Sparkline({ data, color }: SparklineProps) {
  const gradientId = useId();

  if (data.length === 0) {
    return <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-full w-full" role="img" aria-label="No trend data" />;
  }

  const x = scalePoint<string>()
    .domain(data.map((point) => point.date))
    .range([0, WIDTH]);

  const maxValue = Math.max(...data.map((point) => point.value), 1);
  const y = scaleLinear().domain([0, maxValue]).range([HEIGHT - 2, 2]);

  const lineGenerator = line<SparklinePoint>()
    .x((point) => x(point.date) ?? 0)
    .y((point) => y(point.value))
    .curve(curveMonotoneX);

  const areaGenerator = area<SparklinePoint>()
    .x((point) => x(point.date) ?? 0)
    .y0(HEIGHT)
    .y1((point) => y(point.value))
    .curve(curveMonotoneX);

  const linePath = lineGenerator(data) ?? '';
  const areaPath = areaGenerator(data) ?? '';

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-full w-full" preserveAspectRatio="none" role="img" aria-label="Trend sparkline">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.35} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradientId})`} stroke="none" />
      <path d={linePath} fill="none" stroke={color} strokeWidth={2} />
    </svg>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test --workspace=apps/web -- components/charts/Sparkline.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/charts/Sparkline.tsx apps/web/components/charts/Sparkline.test.tsx
git commit -m "feat: add D3-backed Sparkline chart component"
```

---

### Task 6: Frontend — `FunnelChart` chart component

**Files:**
- Create: `apps/web/components/charts/FunnelChart.tsx`
- Create: `apps/web/components/charts/FunnelChart.test.tsx`

**Interfaces:**
- Produces: `FunnelChart({ stages }: { stages: { label: string; value: number }[] })` — a React component rendering a horizontal bar-style funnel with hover tooltips. Consumed by Task 10.
- Consumes: `d3-scale`'s `scaleLinear` (installed in Task 4).

Note: this component is named `FunnelChart` and lives at `apps/web/components/charts/FunnelChart.tsx`, distinct from Recharts' `FunnelChart` import removed from the dashboard page in Task 10 — there is no naming collision because the old Recharts import is deleted in the same task that adds this one.

- [ ] **Step 1: Write the failing test**

Create `apps/web/components/charts/FunnelChart.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { FunnelChart } from './FunnelChart';

describe('FunnelChart', () => {
  const stages = [
    { label: 'Invited', value: 100 },
    { label: 'Started', value: 60 },
    { label: 'Submitted', value: 55 },
    { label: 'Passed', value: 22 },
  ];

  it('renders one bar per stage labeled with its exact count', () => {
    render(<FunnelChart stages={stages} />);
    expect(screen.getByLabelText('Invited: 100')).toBeInTheDocument();
    expect(screen.getByLabelText('Started: 60')).toBeInTheDocument();
    expect(screen.getByLabelText('Submitted: 55')).toBeInTheDocument();
    expect(screen.getByLabelText('Passed: 22')).toBeInTheDocument();
  });

  it('shows a tooltip with the exact count on hover', () => {
    render(<FunnelChart stages={stages} />);
    expect(screen.queryByText('Started: 60')).not.toBeInTheDocument();
    fireEvent.mouseEnter(screen.getByLabelText('Started: 60'));
    expect(screen.getByText('Started: 60')).toBeInTheDocument();
    fireEvent.mouseLeave(screen.getByLabelText('Started: 60'));
    expect(screen.queryByText('Started: 60')).not.toBeInTheDocument();
  });

  it('renders without crashing for empty stages', () => {
    const { container } = render(<FunnelChart stages={[]} />);
    expect(container.firstChild).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test --workspace=apps/web -- components/charts/FunnelChart.test.tsx`
Expected: FAIL — cannot find module `./FunnelChart`

- [ ] **Step 3: Implement `FunnelChart.tsx`**

Create `apps/web/components/charts/FunnelChart.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { scaleLinear } from 'd3-scale';

export interface FunnelStage {
  label: string;
  value: number;
}

interface FunnelChartProps {
  stages: FunnelStage[];
}

export function FunnelChart({ stages }: FunnelChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  if (stages.length === 0) {
    return <div />;
  }

  const maxValue = Math.max(...stages.map((stage) => stage.value), 1);
  const widthScale = scaleLinear().domain([0, maxValue]).range([0, 100]);

  return (
    <div className="flex flex-col gap-3">
      {stages.map((stage, index) => {
        const previousValue = index > 0 ? stages[index - 1].value : null;
        const dropPercent = previousValue && previousValue > 0 ? Math.round(((previousValue - stage.value) / previousValue) * 100) : null;
        const widthPercent = widthScale(stage.value);
        return (
          <div key={stage.label} className="relative">
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="font-medium text-recruiter-text">{stage.label}</span>
              <span className="text-recruiter-text-tertiary">
                {stage.value}
                {dropPercent !== null && dropPercent > 0 && <span className="ml-1 text-status-danger">-{dropPercent}%</span>}
              </span>
            </div>
            <div
              className="h-9 rounded-md bg-[#0d9488] transition-opacity"
              style={{ width: `${widthPercent}%`, opacity: hoveredIndex === null || hoveredIndex === index ? 1 : 0.5 }}
              onMouseEnter={() => setHoveredIndex(index)}
              onMouseLeave={() => setHoveredIndex(null)}
              role="img"
              aria-label={`${stage.label}: ${stage.value}`}
            >
              {hoveredIndex === index && (
                <div className="absolute -top-8 left-0 whitespace-nowrap rounded bg-recruiter-text px-2 py-1 text-xs text-white shadow-md">
                  {stage.label}: {stage.value}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test --workspace=apps/web -- components/charts/FunnelChart.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/charts/FunnelChart.tsx apps/web/components/charts/FunnelChart.test.tsx
git commit -m "feat: add D3-backed FunnelChart component"
```

---

### Task 7: Frontend — `GroupedBarChart` chart component

**Files:**
- Create: `apps/web/components/charts/GroupedBarChart.tsx`
- Create: `apps/web/components/charts/GroupedBarChart.test.tsx`

**Interfaces:**
- Produces: `GroupedBarChart({ groups }: { groups: { label: string; series: { key: string; value: number; color: string }[] }[] })` — a React component rendering a grouped/dual bar chart with value labels. Consumed by Task 9.
- Consumes: `d3-scale`'s `scaleBand`/`scaleLinear` (installed in Task 4).

- [ ] **Step 1: Write the failing test**

Create `apps/web/components/charts/GroupedBarChart.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { GroupedBarChart } from './GroupedBarChart';

describe('GroupedBarChart', () => {
  const groups = [
    {
      label: 'Backend Round',
      series: [
        { key: 'passRate', value: 70, color: '#0d9488' },
        { key: 'avgScore', value: 62, color: '#d4a017' },
      ],
    },
    {
      label: 'Frontend Round',
      series: [
        { key: 'passRate', value: 55, color: '#0d9488' },
        { key: 'avgScore', value: 48, color: '#d4a017' },
      ],
    },
  ];

  it('renders one bar per series per group', () => {
    const { container } = render(<GroupedBarChart groups={groups} />);
    expect(container.querySelectorAll('rect')).toHaveLength(4);
  });

  it('renders a value label above each bar', () => {
    render(<GroupedBarChart groups={groups} />);
    expect(screen.getByText('70')).toBeInTheDocument();
    expect(screen.getByText('62')).toBeInTheDocument();
    expect(screen.getByText('55')).toBeInTheDocument();
    expect(screen.getByText('48')).toBeInTheDocument();
  });

  it('renders without crashing for empty groups', () => {
    const { container } = render(<GroupedBarChart groups={[]} />);
    expect(container.querySelector('svg')).toBeInTheDocument();
    expect(container.querySelectorAll('rect')).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test --workspace=apps/web -- components/charts/GroupedBarChart.test.tsx`
Expected: FAIL — cannot find module `./GroupedBarChart`

- [ ] **Step 3: Implement `GroupedBarChart.tsx`**

Create `apps/web/components/charts/GroupedBarChart.tsx`:

```tsx
'use client';

import { scaleBand, scaleLinear } from 'd3-scale';

export interface GroupedBarSeries {
  key: string;
  value: number;
  color: string;
}

export interface GroupedBarGroup {
  label: string;
  series: GroupedBarSeries[];
}

interface GroupedBarChartProps {
  groups: GroupedBarGroup[];
}

const WIDTH = 600;
const HEIGHT = 260;
const MARGIN = { top: 24, right: 16, bottom: 32, left: 16 };

export function GroupedBarChart({ groups }: GroupedBarChartProps) {
  if (groups.length === 0) {
    return <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-full w-full" role="img" aria-label="No exam performance data" />;
  }

  const innerWidth = WIDTH - MARGIN.left - MARGIN.right;
  const innerHeight = HEIGHT - MARGIN.top - MARGIN.bottom;

  const outerScale = scaleBand()
    .domain(groups.map((group) => group.label))
    .range([0, innerWidth])
    .padding(0.3);

  const seriesKeys = groups[0].series.map((series) => series.key);
  const innerScale = scaleBand()
    .domain(seriesKeys)
    .range([0, outerScale.bandwidth()])
    .padding(0.15);

  const valueScale = scaleLinear().domain([0, 100]).range([innerHeight, 0]);

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-full w-full" role="img" aria-label="Exam performance chart">
      <g transform={`translate(${MARGIN.left}, ${MARGIN.top})`}>
        {groups.map((group) => (
          <g key={group.label} transform={`translate(${outerScale(group.label) ?? 0}, 0)`}>
            {group.series.map((series) => {
              const barX = innerScale(series.key) ?? 0;
              const barWidth = innerScale.bandwidth();
              const barY = valueScale(series.value);
              const barHeight = innerHeight - barY;
              return (
                <g key={series.key}>
                  <rect x={barX} y={barY} width={barWidth} height={barHeight} fill={series.color} rx={2} />
                  <text x={barX + barWidth / 2} y={barY - 4} textAnchor="middle" fontSize={10} fill="#334155">
                    {series.value}
                  </text>
                </g>
              );
            })}
            <text x={outerScale.bandwidth() / 2} y={innerHeight + 16} textAnchor="middle" fontSize={11} fill="#334155">
              {group.label.length > 14 ? `${group.label.slice(0, 14)}…` : group.label}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test --workspace=apps/web -- components/charts/GroupedBarChart.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/charts/GroupedBarChart.tsx apps/web/components/charts/GroupedBarChart.test.tsx
git commit -m "feat: add D3-backed GroupedBarChart component"
```

---

### Task 8: Frontend — dashboard page stat cards use real sparklines and a trend-window filter

**Files:**
- Modify: `apps/web/app/(recruiter)/dashboard/page.tsx`
- Modify: `apps/web/app/(recruiter)/dashboard/page.test.tsx`

**Interfaces:**
- Consumes: `useDashboardTrend` (Task 4), `Sparkline` (Task 5), `Select`/`SelectOption` from `apps/web/components/ui`.
- Produces: an updated `StatCard` component taking `{ icon, value, label, metric, color, delay }` (replacing the old `sparkline`/`barColor`/`iconBg`/`iconColor`/`accentBorder`/`prefersReducedMotion` props) — consumed only within `page.tsx` itself, not by other tasks.

- [ ] **Step 1: Write the failing/updated page tests**

In `apps/web/app/(recruiter)/dashboard/page.test.tsx`:

1. Remove the `funnel: { ... }` field from every `mockSummaryFetch(...)` call's object literal in the file (7 occurrences) — the mocked `/dashboard/summary` response no longer includes it. For example, the first one becomes:

```ts
    mockSummaryFetch({
      stats: { totalCandidates: 248, invitationsSent: 312, attemptsInProgress: 17, pendingGradingCount: 9 },
      attention: { pendingGrading: [], recentProctoringFlags: [], staleInvitationCount: 0 },
      activity: [],
      upcomingExams: [],
    });
```

Apply the same removal to the other 6 occurrences (in the `'renders attention items with their counts'`, `'links proctoring-flag attention items to their exam'`, `'renders the recent activity feed'`, `'renders the candidate funnel and upcoming exams widgets'`, and `'shows an empty-state message when there are no upcoming exams'` tests). Also delete the now-unused `funnel: { invited: 100, started: 60, submitted: 55, passed: 22 }` line from `'renders the candidate funnel and upcoming exams widgets'` — that test is renamed and reworked in Task 10, so leave everything else about it as-is for this task.

2. Extend `mockSummaryFetch` so it also stubs the three new endpoints with harmless defaults, since `page.tsx` will now call the trend hook on render:

```ts
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
```

3. Add a new test, after `'renders the 4 stat cards from the summary endpoint'`:

```ts
  it('refetches a stat card trend when its window dropdown changes', async () => {
    mockSummaryFetch({
      stats: { totalCandidates: 248, invitationsSent: 312, attemptsInProgress: 17, pendingGradingCount: 9 },
      attention: { pendingGrading: [], recentProctoringFlags: [], staleInvitationCount: 0 },
      activity: [],
      upcomingExams: [],
    });
    renderPage();

    await waitFor(() => expect(screen.getByText('248')).toBeInTheDocument());
    const fetchMock = global.fetch as jest.Mock;
    const trendCallsBefore = fetchMock.mock.calls.filter(([url]) => String(url).includes('/dashboard/trend?metric=candidates')).length;
    expect(trendCallsBefore).toBeGreaterThan(0);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('days=14'))).toBe(true);

    const trigger = screen.getAllByLabelText('Trend window')[0];
    fireEvent.click(trigger);
    const option = await screen.findByText('30 days');
    fireEvent.click(option);

    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/dashboard/trend?metric=candidates&days=30'))).toBe(true),
    );
  });
```

Add `fireEvent` to the existing `@testing-library/react` import at the top of the file:

```ts
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
```

- [ ] **Step 2: Run the tests to verify the new test fails and confirm the current failure mode**

Run: `npm run test --workspace=apps/web -- "app/(recruiter)/dashboard/page.test.tsx"`
Expected: FAIL — `screen.getAllByLabelText('Trend window')` finds no elements (page.tsx not yet updated); other tests still pass since `page.tsx` doesn't read `summary.funnel` for rendering, only for building `funnelData` (unused by assertions in this task's untouched tests).

- [ ] **Step 3: Rewrite the stat-card section of `apps/web/app/(recruiter)/dashboard/page.tsx`**

Replace the top of the file (imports through the `StatCard` component, i.e. everything from line 1 through the closing `}` of the old `StatCard` function) with:

```tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Users, Mail, Play, FileEdit, AlertTriangle, Clock, CheckCircle2, FileEdit as FileEditIcon, Plus, CalendarClock } from 'lucide-react';
import { useDashboardSummary, useDashboardTrend } from '../../../lib/hooks/useDashboard';
import { DashboardTrendMetric } from '../../../lib/types';
import { Card, Button, Select, type SelectOption } from '../../../components/ui';
import { Sparkline } from '../../../components/charts/Sparkline';

function activityIconFor(description: string) {
  if (description.includes('invited')) return Mail;
  if (description.includes('published')) return CheckCircle2;
  if (description.includes('graded')) return FileEditIcon;
  return CheckCircle2;
}

const TREND_WINDOW_OPTIONS: SelectOption[] = [
  { value: '7', label: '7 days' },
  { value: '14', label: '14 days' },
  { value: '30', label: '30 days' },
];

interface StatCardProps {
  icon: typeof Users;
  value: number;
  label: string;
  metric: DashboardTrendMetric;
  color: string;
  delay: number;
}

function StatCard({ icon: Icon, value, label, metric, color, delay }: StatCardProps) {
  const [days, setDays] = useState('14');
  const { data: trend } = useDashboardTrend(metric, Number(days) as 7 | 14 | 30);
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
            <Sparkline data={points} color={color} />
          </div>
        </div>
        <div className="border-t border-recruiter-border px-4 py-1.5">
          <Select label="Trend window" value={days} onChange={setDays} options={TREND_WINDOW_OPTIONS} />
        </div>
      </Card>
    </motion.div>
  );
}
```

Replace the 4 `StatCard` JSX call sites (inside the `grid-cols-4` container) with:

```tsx
        <StatCard icon={Users} value={summary.stats.totalCandidates} label="Total candidates" metric="candidates" color="#0d9488" delay={0} />
        <StatCard icon={Mail} value={summary.stats.invitationsSent} label="Invitations sent" metric="invitations" color="#334155" delay={0.04} />
        <StatCard icon={Play} value={summary.stats.attemptsInProgress} label="Attempts in progress" metric="attempts" color="#d4a017" delay={0.08} />
        <StatCard icon={FileEdit} value={summary.stats.pendingGradingCount} label="Pending grading" metric="pendingGrading" color="#f2765f" delay={0.12} />
```

Remove the now-unused `useReducedMotion` import/usage: delete `const prefersReducedMotion = useReducedMotion();` from `DashboardPage` (the `motion` import stays; `useReducedMotion` is dropped from the `framer-motion` import).

Do not touch the `funnelData` variable, the "Candidate funnel" card's JSX, or the recharts imports yet — those are removed in Task 10. `page.tsx` will still reference `summary.funnel` at this point; leave it — Task 10 removes it.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test --workspace=apps/web -- "app/(recruiter)/dashboard/page.test.tsx"`
Expected: This still FAILS on TypeScript/compile because `summary.funnel` no longer exists on the `DashboardSummary` type (removed in Task 4) — Jest's ts-jest transform will report a type error for the `funnelData` block reading `summary.funnel`. This is expected and resolved in Task 10; to confirm this task's own change is correct in isolation, run only the new test with the type error visible and verify the failure is exactly the `summary.funnel` type error and not a `StatCard`/`Sparkline`/`Select` runtime error. Note the error and proceed — Task 10 removes `funnelData` and fixes this.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/(recruiter)/dashboard/page.tsx" "apps/web/app/(recruiter)/dashboard/page.test.tsx"
git commit -m "feat: wire recruiter dashboard stat cards to real D3 sparklines and trend filter"
```

---

### Task 9: Frontend — new exam-performance card

**Files:**
- Modify: `apps/web/app/(recruiter)/dashboard/page.tsx`
- Modify: `apps/web/app/(recruiter)/dashboard/page.test.tsx`

**Interfaces:**
- Consumes: `useDashboardExamPerformance` (Task 4), `GroupedBarChart` (Task 7), `Select`/`SelectOption` from `apps/web/components/ui`.

- [ ] **Step 1: Write the failing test**

Add to `apps/web/app/(recruiter)/dashboard/page.test.tsx`, after the trend-refetch test added in Task 8:

```ts
  it('renders the exam performance chart and refetches when its filters change', async () => {
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
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/dashboard/exam-performance?limit=5&window=all'))).toBe(true);

    const limitTrigger = screen.getByLabelText('Top exams');
    fireEvent.click(limitTrigger);
    const tenOption = await screen.findByText('Top 10');
    fireEvent.click(tenOption);

    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/dashboard/exam-performance?limit=10&window=all'))).toBe(true),
    );
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test --workspace=apps/web -- "app/(recruiter)/dashboard/page.test.tsx"`
Expected: FAIL — no element with text `'Exam performance'` (card doesn't exist yet); note the pre-existing `summary.funnel` type error from Task 8 is still present and expected until Task 10.

- [ ] **Step 3: Add the exam-performance card to `page.tsx`**

Add these imports to the top of `apps/web/app/(recruiter)/dashboard/page.tsx`, alongside the existing ones:

```tsx
import { useDashboardExamPerformance, useDashboardSummary, useDashboardTrend } from '../../../lib/hooks/useDashboard';
import { GroupedBarChart } from '../../../components/charts/GroupedBarChart';
```

(This replaces the Task 8 import line that only listed `useDashboardSummary, useDashboardTrend` — add `useDashboardExamPerformance` to that same import.)

Add this component definition below `StatCard`, before `export default function DashboardPage()`:

```tsx
const PERFORMANCE_LIMIT_OPTIONS: SelectOption[] = [
  { value: '5', label: 'Top 5' },
  { value: '10', label: 'Top 10' },
  { value: 'all', label: 'All' },
];

const WINDOW_OPTIONS: SelectOption[] = [
  { value: 'all', label: 'All time' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
];

function ExamPerformanceCard() {
  const [limit, setLimit] = useState('5');
  const [windowValue, setWindowValue] = useState('all');
  const { data } = useDashboardExamPerformance(limit === 'all' ? 'all' : (Number(limit) as 5 | 10), windowValue as 'all' | '30d' | '90d');
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
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-bold text-recruiter-text">Exam performance</h2>
        <div className="flex gap-2">
          <Select label="Top exams" value={limit} onChange={setLimit} options={PERFORMANCE_LIMIT_OPTIONS} />
          <Select label="Performance window" value={windowValue} onChange={setWindowValue} options={WINDOW_OPTIONS} />
        </div>
      </div>
      {groups.length === 0 ? (
        <p className="text-sm text-recruiter-text-tertiary">No settled attempts yet.</p>
      ) : (
        <div className="h-64 w-full">
          <GroupedBarChart groups={groups} />
        </div>
      )}
    </Card>
  );
}
```

Add `<ExamPerformanceCard />` as a new full-width row in the page's returned JSX, directly below the closing `</div>` of the `grid-cols-2` (stat cards / funnel+upcoming) section and above the `grid-cols-[1.3fr_1fr]` section:

```tsx
      <div className="mb-5">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.2 }}>
          <ExamPerformanceCard />
        </motion.div>
      </div>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test --workspace=apps/web -- "app/(recruiter)/dashboard/page.test.tsx"`
Expected: The new exam-performance test PASSES. The `summary.funnel` type error from Task 8 is still present and still expected until Task 10.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/(recruiter)/dashboard/page.tsx" "apps/web/app/(recruiter)/dashboard/page.test.tsx"
git commit -m "feat: add exam performance grouped-bar chart card to recruiter dashboard"
```

---

### Task 10: Frontend — rewire the funnel card to the new endpoint and D3 `FunnelChart`

**Files:**
- Modify: `apps/web/app/(recruiter)/dashboard/page.tsx`
- Modify: `apps/web/app/(recruiter)/dashboard/page.test.tsx`

**Interfaces:**
- Consumes: `useDashboardFunnel` (Task 4), `useExams` (existing, `apps/web/lib/hooks/useExams.ts`), the D3 `FunnelChart` (Task 6).
- Removes: the `recharts` import (`BarChart, Bar, FunnelChart, Funnel, LabelList, ResponsiveContainer`), the `funnelData` variable, and all reads of `summary.funnel` from `page.tsx`. After this task, `recharts` is no longer imported anywhere in `page.tsx` (it may remain a dependency in `package.json` if used elsewhere in the app — do not uninstall it).

- [ ] **Step 1: Write the failing/updated test**

In `apps/web/app/(recruiter)/dashboard/page.test.tsx`, replace the `'renders the candidate funnel and upcoming exams widgets'` test with two separate tests — one for upcoming exams (unaffected by this task) and one for the funnel card (rewired):

```ts
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

  it('renders the candidate funnel from the funnel endpoint and refetches when its filters change', async () => {
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
      if (String(url).includes('/exams')) {
        return new Response(JSON.stringify({ data: [{ id: 'exam-1', title: 'Backend Round' }], total: 1, page: 1, pageSize: 100, totalPages: 1 }), {
          status: 200,
        });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;
    renderPage();

    await waitFor(() => expect(screen.getByLabelText('Invited: 100')).toBeInTheDocument());
    expect(screen.getByLabelText('Started: 60')).toBeInTheDocument();
    expect(screen.getByLabelText('Submitted: 55')).toBeInTheDocument();
    expect(screen.getByLabelText('Passed: 22')).toBeInTheDocument();

    const fetchMock = global.fetch as jest.Mock;
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/dashboard/funnel?examId=all&window=all'))).toBe(true);

    const examTrigger = screen.getByLabelText('Funnel exam');
    fireEvent.click(examTrigger);
    const examOption = await screen.findByText('Backend Round');
    fireEvent.click(examOption);

    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/dashboard/funnel?examId=exam-1&window=all'))).toBe(true),
    );
  });
```

Also remove the `funnel: { ... }` field from the remaining `mockSummaryFetch(...)` call bodies in the file if any are still present (this should already be done from Task 8's Step 1 — verify none remain by this point).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test --workspace=apps/web -- "app/(recruiter)/dashboard/page.test.tsx"`
Expected: FAIL — the `summary.funnel` type error from Task 8 blocks compilation, and `screen.getByLabelText('Invited: 100')` finds nothing since the page still renders the old Recharts funnel.

- [ ] **Step 3: Rewire the funnel card in `page.tsx`**

Update the imports at the top of the file: remove the `recharts` import line entirely (`import { BarChart, Bar, FunnelChart, Funnel, LabelList, ResponsiveContainer } from 'recharts';`), and add:

```tsx
import { useDashboardExamPerformance, useDashboardFunnel, useDashboardSummary, useDashboardTrend } from '../../../lib/hooks/useDashboard';
import { useExams } from '../../../lib/hooks/useExams';
import { FunnelChart } from '../../../components/charts/FunnelChart';
```

(Combine this with Task 9's `useDashboardExamPerformance` import into one `useDashboard` import line, and keep the `GroupedBarChart`/`Sparkline` imports from Tasks 7/9/5.)

Delete the `funnelData` variable entirely (the block starting `const funnelData = [...]` inside `DashboardPage`).

Add this component definition below `ExamPerformanceCard`, before `export default function DashboardPage()`:

```tsx
const FUNNEL_WINDOW_OPTIONS: SelectOption[] = [
  { value: 'all', label: 'All time' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
];

function CandidateFunnelCard() {
  const [examId, setExamId] = useState('all');
  const [windowValue, setWindowValue] = useState('all');
  const { data: exams } = useExams(undefined, { pageSize: 100 });
  const { data: funnel } = useDashboardFunnel(examId, windowValue as 'all' | '30d' | '90d');

  const examOptions: SelectOption[] = [{ value: 'all', label: 'All exams' }, ...(exams?.data ?? []).map((exam) => ({ value: exam.id, label: exam.title }))];

  const stages = [
    { label: 'Invited', value: funnel?.invited ?? 0 },
    { label: 'Started', value: funnel?.started ?? 0 },
    { label: 'Submitted', value: funnel?.submitted ?? 0 },
    { label: 'Passed', value: funnel?.passed ?? 0 },
  ];

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-bold text-recruiter-text">Candidate funnel</h2>
        <div className="flex gap-2">
          <Select label="Funnel exam" value={examId} onChange={setExamId} options={examOptions} />
          <Select label="Funnel window" value={windowValue} onChange={setWindowValue} options={FUNNEL_WINDOW_OPTIONS} />
        </div>
      </div>
      <FunnelChart stages={stages} />
    </Card>
  );
}
```

Replace the old "Candidate funnel" `<Card>` block (the first `motion.div` inside the `grid-cols-2` section, containing the `<h2>Candidate funnel</h2>` and the Recharts `FunnelChart`/`Funnel`/`ResponsiveContainer` JSX) with:

```tsx
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.16 }}>
          <CandidateFunnelCard />
        </motion.div>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test --workspace=apps/web -- "app/(recruiter)/dashboard/page.test.tsx"`
Expected: PASS (all tests, including the ones from Tasks 8 and 9)

- [ ] **Step 5: Run the full frontend test suite and typecheck to confirm nothing else broke**

Run: `npm run test --workspace=apps/web`
Expected: PASS

Run: `npm run build --workspace=apps/web`
Expected: PASS (no more `summary.funnel` type error; confirms the whole page compiles cleanly)

- [ ] **Step 6: Commit**

```bash
git add "apps/web/app/(recruiter)/dashboard/page.tsx" "apps/web/app/(recruiter)/dashboard/page.test.tsx"
git commit -m "feat: rewire candidate funnel card to dedicated endpoint and D3 FunnelChart"
```

---

## Self-Review Notes

- **Spec coverage:** Stat-card real sparklines + trend-window filter → Task 8. Exam-performance grouped bar chart + filters → Task 9. Candidate funnel D3 chart + filters → Task 10. Backend one-endpoint-per-card → Tasks 1–3. D3-for-math/React-for-render architecture, new `d3-scale`/`d3-shape` deps, one-hook-per-endpoint → Task 4. Three new reusable chart components with their own tests → Tasks 5–7. Removal of `funnel` from `/dashboard/summary` → Task 3 (backend) and Task 4/10 (frontend type + page). Palette (teal/charcoal/coral/gold) → used directly in Tasks 8–10's color props. KPI semantics (big number always all-time total, filter affects only sparkline) → Task 8's `StatCard` passes `summary.stats.*` as `value` unconditionally and only threads `days` into the trend hook.
- **Out of scope confirmed untouched:** org-admin/panel dashboards, cross-filtering, URL-persisted filters, and the non-chart dashboard sections (Upcoming exams, Needs your attention, Recent activity) — no task modifies their logic; Task 10 only relocates the upcoming-exams test, not its behavior.
- **Type consistency check:** `DashboardTrendMetric`/`DashboardWindow`/`DashboardPerformanceLimit` (Task 4, `types.ts`) are the exact types threaded through `useDashboardTrend`/`useDashboardExamPerformance`/`useDashboardFunnel` (Task 4, hooks) and consumed with matching literal values in `StatCard` (Task 8), `ExamPerformanceCard` (Task 9), and `CandidateFunnelCard` (Task 10). `Sparkline`'s `data` prop shape (`{date, value}[]`) matches `DashboardTrend.points`. `FunnelChart`'s `stages` prop shape (`{label, value}[]`) matches how `CandidateFunnelCard` maps `DashboardFunnel`. `GroupedBarChart`'s `groups` prop shape matches how `ExamPerformanceCard` maps `DashboardExamPerformance.exams`.
- **Placeholder scan:** no task contains "TBD"/"similar to Task N"/unshown code — every step has complete, copy-pasteable code.
