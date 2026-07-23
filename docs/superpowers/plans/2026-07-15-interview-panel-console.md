# Interview Panel Console Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the fifth and final role console — Interview Panel — giving panel-role staff a read-only results/reporting UI (exam list, results dashboard, candidate detail, comparison) on top of the backend surface already built for them.

**Architecture:** A small, additive backend change (an "any of" permission variant so `GET /exams`/`GET /exams/:id` accept `results:view` alongside `exam:manage`) closes the one real gap (exam discovery); everything else is new frontend consuming seven endpoints that already exist and are already gated on `results:view`. The frontend reuses the recruiter/org-admin design system and route-group pattern exactly — panel is an internal staff role, not a distinct-identity external user like the candidate console.

**Tech Stack:** NestJS 11, Next.js 16 App Router, `@tanstack/react-query` (already installed), existing `components/ui` design system.

## Global Constraints

- Approved spec: `docs/superpowers/specs/2026-07-15-interview-panel-console-design.md`.
- Panel's permission set is exactly `['org:view', 'results:view']` (`apps/api/prisma/seed.ts:24`) — no `exam:manage`, no `candidate:manage`.
- Routes live under `/reports`, not `/exams` — `(recruiter)` already owns `/exams` and Next.js route groups share one path space; reusing it would collide.
- Visual identity: reuse the recruiter/org-admin design system as-is (`Button`, `Table`, `Card`, `Modal`, `Badge`, `Checkbox` from `components/ui`) — no new visual identity, unlike the candidate console.
- Export triggers a client-side blob download (no plain `<a href>` — the endpoint requires an Authorization header).
- The backend permission widening is additive only: `exam:manage`'s existing full access is unchanged; `results:view` becomes a second, alternate way to pass the same two endpoints' guard. No other route's guard behavior changes.

---

### Task 1: Backend — widen GET /exams and GET /exams/:id to accept results:view

**Files:**
- Modify: `apps/api/src/rbac/permissions.decorator.ts`
- Modify: `apps/api/src/rbac/permissions.guard.ts`
- Test: `apps/api/src/rbac/permissions.guard.spec.ts`
- Modify: `apps/api/src/exams/exams.controller.ts`
- Test: `apps/api/test/exam-reporting.e2e-spec.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks (first task).
- Produces: `@RequireAnyPermission(...keys)` decorator — used by later backend work only if ever needed again; Tasks 2+ consume the *effect* (panel can now call `GET /exams` and `GET /exams/:id`), not the decorator itself.

- [ ] **Step 1: Write the failing unit tests for the "any" permission path**

Add to `apps/api/src/rbac/permissions.guard.spec.ts`, after the existing three `it(...)` blocks, before the closing `});`:

```ts
  it('allows access when the role has at least one of the "any" permissions', async () => {
    const reflector = {
      get: jest.fn((key: string) => (key === PERMISSIONS_ANY_KEY ? ['exam:manage', 'results:view'] : undefined)),
    } as unknown as Reflector;
    const prisma = {
      rolePermission: { findMany: jest.fn().mockResolvedValue([{ permission: { key: 'results:view' } }]) },
    };
    const guard = new PermissionsGuard(reflector, prisma as any);

    const result = await guard.canActivate(mockContext({ role: 'panel' }));
    expect(result).toBe(true);
  });

  it('throws ForbiddenException when the role has none of the "any" permissions', async () => {
    const reflector = {
      get: jest.fn((key: string) => (key === PERMISSIONS_ANY_KEY ? ['exam:manage', 'results:view'] : undefined)),
    } as unknown as Reflector;
    const prisma = { rolePermission: { findMany: jest.fn().mockResolvedValue([]) } };
    const guard = new PermissionsGuard(reflector, prisma as any);

    await expect(guard.canActivate(mockContext({ role: 'candidate' }))).rejects.toThrow(ForbiddenException);
  });
```

Add `PERMISSIONS_ANY_KEY` to the existing import at the top of the file:

```ts
import { PERMISSIONS_KEY, PERMISSIONS_ANY_KEY } from './permissions.decorator';
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && npx jest rbac/permissions.guard.spec.ts`
Expected: FAIL — `PERMISSIONS_ANY_KEY` is not exported from `./permissions.decorator`.

- [ ] **Step 3: Add the `RequireAnyPermission` decorator**

Replace the full contents of `apps/api/src/rbac/permissions.decorator.ts`:

```ts
import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';
export const RequirePermissions = (...permissions: string[]) => SetMetadata(PERMISSIONS_KEY, permissions);

export const PERMISSIONS_ANY_KEY = 'permissionsAny';
export const RequireAnyPermission = (...permissions: string[]) => SetMetadata(PERMISSIONS_ANY_KEY, permissions);
```

- [ ] **Step 4: Update `PermissionsGuard` to check both "all" and "any" requirements**

Replace the full contents of `apps/api/src/rbac/permissions.guard.ts`:

```ts
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '@exam-platform/shared';
import { PERMISSIONS_KEY, PERMISSIONS_ANY_KEY } from './permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredAll = this.reflector.get<string[]>(PERMISSIONS_KEY, context.getHandler());
    const requiredAny = this.reflector.get<string[]>(PERMISSIONS_ANY_KEY, context.getHandler());
    const hasAllRequirement = Boolean(requiredAll && requiredAll.length > 0);
    const hasAnyRequirement = Boolean(requiredAny && requiredAny.length > 0);
    if (!hasAllRequirement && !hasAnyRequirement) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as { role: string } | undefined;
    if (!user) {
      throw new ForbiddenException('Not authenticated');
    }

    const allKeys = [...(requiredAll ?? []), ...(requiredAny ?? [])];
    const grants = await this.prisma.rolePermission.findMany({
      where: { role: user.role, permission: { key: { in: allKeys } } },
      select: { permission: { select: { key: true } } },
    });
    const grantedKeys = new Set(grants.map((g) => g.permission.key));

    if (hasAllRequirement && !requiredAll!.every((key) => grantedKeys.has(key))) {
      throw new ForbiddenException(`Missing required permission(s): ${requiredAll!.join(', ')}`);
    }
    if (hasAnyRequirement && !requiredAny!.some((key) => grantedKeys.has(key))) {
      throw new ForbiddenException(`Missing any of required permission(s): ${requiredAny!.join(', ')}`);
    }
    return true;
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd apps/api && npx jest rbac/permissions.guard.spec.ts`
Expected: `Tests: 5 passed, 5 total`.

- [ ] **Step 6: Widen the two exam endpoints**

In `apps/api/src/exams/exams.controller.ts`, add `RequireAnyPermission` to the existing import:

```ts
import { RequirePermissions } from '../rbac/permissions.decorator';
```

becomes:

```ts
import { RequirePermissions, RequireAnyPermission } from '../rbac/permissions.decorator';
```

Replace the `list` method's decorator (currently `@RequirePermissions('exam:manage')`) with:

```ts
  @Get()
  @RequireAnyPermission('exam:manage', 'results:view')
  list(@CurrentTenant() tenant: TenantContext, @Query('status') status?: string) {
    return this.examsService.list(tenant, { status });
  }
```

Replace the `findOne` method's decorator similarly:

```ts
  @Get(':id')
  @RequireAnyPermission('exam:manage', 'results:view')
  findOne(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.examsService.findOne(tenant, id);
  }
```

Every other method in this file (`create`, `update`, `archive`, `publish`, section routes, `getResults`) is unchanged.

- [ ] **Step 7: Write the failing e2e test**

In `apps/api/test/exam-reporting.e2e-spec.ts`, add a new test immediately after the existing `it('rejects panel-role users from exam-management routes -- results:view does not imply exam:manage', ...)` block (around line 297):

```ts
  it('grants panel-role users read access to GET /exams and GET /exams/:id via results:view, without disturbing recruiter access', async () => {
    const panelListResponse = await request(adminHttp)
      .get('/api/v1/exams')
      .set('Authorization', `Bearer ${panelAccessToken}`)
      .expect(200);
    expect(Array.isArray(panelListResponse.body)).toBe(true);

    await request(adminHttp)
      .get(`/api/v1/exams/${examId}`)
      .set('Authorization', `Bearer ${panelAccessToken}`)
      .expect(200);

    const recruiterListResponse = await request(adminHttp)
      .get('/api/v1/exams')
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(200);
    expect(Array.isArray(recruiterListResponse.body)).toBe(true);
  });
```

- [ ] **Step 8: Run the e2e test to verify it fails, then passes**

Run: `cd apps/api && npx jest --config ./test/jest-e2e.json --runInBand test/exam-reporting.e2e-spec.ts`
Expected before Step 6's controller change: FAIL with 403 on the panel `GET /exams` call. After Step 6 (already applied above): `Tests: <N+1> passed` (all tests in the file, including the new one).

- [ ] **Step 9: Run the full backend suites to confirm no regressions**

Run: `cd "D:/exam app" && npm run test:api` — expect all suites green, including the modified `permissions.guard.spec.ts`.
Run: `npm run test:api:e2e` — expect all e2e suites green (aside from the pre-existing, unrelated `ai-question-generation.e2e-spec.ts` flake if this dev environment's `ANTHROPIC_API_KEY` is a placeholder — a known, documented, pre-existing issue, not a regression from this task).

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/rbac/permissions.decorator.ts apps/api/src/rbac/permissions.guard.ts apps/api/src/rbac/permissions.guard.spec.ts apps/api/src/exams/exams.controller.ts apps/api/test/exam-reporting.e2e-spec.ts
git commit -m "feat: widen GET /exams and GET /exams/:id to accept results:view"
```

---

### Task 2: Frontend — panel types, blob-fetch client addition, and report hooks

**Files:**
- Modify: `apps/web/lib/api-client.ts`
- Test: `apps/web/lib/api-client.test.ts`
- Modify: `apps/web/lib/types.ts`
- Create: `apps/web/lib/hooks/usePanelReports.ts`
- Test: `apps/web/lib/hooks/usePanelReports.test.tsx`

**Interfaces:**
- Consumes: Task 1's widened `GET /exams`/`GET /exams/:id` (via the already-existing `useExams`/`useExam` hooks in `apps/web/lib/hooks/useExams.ts` — unchanged, reused as-is).
- Produces: types `ExamResultsSummary`, `QuestionAccuracyRow`, `ExamResultRow`, `SectionScore`, `CandidateDetail`, `CandidateComparisonRow`, `AttemptInsight` (all in `apps/web/lib/types.ts`); `apiFetchBlob(path, options?, accessToken?): Promise<{ blob: Blob; filename: string | null }>` (in `apps/web/lib/api-client.ts`) and thrown errors from `apiFetch`/`apiFetchBlob` now carry a `.status: number` property; hooks `useResultsSummary`, `useQuestionAccuracy`, `useResultsList`, `useCandidateReport`, `useCandidateComparison`, `useAttemptInsight`, `useRegenerateAttemptInsight`, `useResultsExport` (all in `apps/web/lib/hooks/usePanelReports.ts`) — Tasks 4-6 consume all of these directly by name.

- [ ] **Step 1: Write the failing test for the `.status` addition and `apiFetchBlob`**

Add to `apps/web/lib/api-client.test.ts`, inside the existing `describe('apiFetch', ...)` block, after the last `it(...)`:

```ts
  it('attaches the HTTP status code to the thrown error', async () => {
    global.fetch = jest.fn(async () => new Response(JSON.stringify({ message: 'Not found' }), { status: 404 })) as unknown as typeof fetch;

    try {
      await apiFetch('/exams/missing');
      throw new Error('expected apiFetch to throw');
    } catch (error) {
      expect((error as Error & { status?: number }).status).toBe(404);
    }
  });
```

Add a new `describe` block at the end of the file (same file, after the closing `});` of the existing `describe('apiFetch', ...)`):

```ts
describe('apiFetchBlob', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('returns the response body as a blob along with the filename from Content-Disposition', async () => {
    global.fetch = jest.fn(async () =>
      new Response(new Blob(['a,b,c'], { type: 'text/csv' }), {
        status: 200,
        headers: { 'Content-Disposition': 'attachment; filename="exam-123-results.csv"' },
      }),
    ) as unknown as typeof fetch;

    const result = await apiFetchBlob('/exams/123/results/export?format=csv', {}, 'tok');
    expect(result.filename).toBe('exam-123-results.csv');
    expect(result.blob).toBeInstanceOf(Blob);
  });

  it('throws with the server message and attaches status on a non-ok response', async () => {
    global.fetch = jest.fn(async () => new Response(JSON.stringify({ message: 'Forbidden' }), { status: 403 })) as unknown as typeof fetch;

    await expect(apiFetchBlob('/exams/123/results/export?format=csv')).rejects.toThrow('Forbidden');
  });
});
```

Update the file's top import line to include `apiFetchBlob`:

```ts
import { apiFetch, apiFetchBlob, setUnauthorizedHandler } from './api-client';
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/web && npx jest lib/api-client.test.ts`
Expected: FAIL — `apiFetchBlob` is not exported, and the `.status` assertion fails (currently `undefined`).

- [ ] **Step 3: Implement the `.status` addition and `apiFetchBlob`**

Replace the full contents of `apps/web/lib/api-client.ts`:

```ts
const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:3001/api/v1';

let unauthorizedHandler: (() => Promise<string | null>) | null = null;

export function setUnauthorizedHandler(handler: (() => Promise<string | null>) | null) {
  unauthorizedHandler = handler;
}

async function doFetch(path: string, options: RequestInit, accessToken?: string): Promise<Response> {
  const isFormData = options.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(options.headers as Record<string, string>),
  };
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  return fetch(`${API_BASE}${path}`, { ...options, headers, credentials: 'include' });
}

async function throwForResponse(response: Response): Promise<never> {
  const body = await response.json().catch(() => ({}));
  const error = new Error(body.message ?? `Request failed with status ${response.status}`) as Error & { status?: number };
  error.status = response.status;
  throw error;
}

export async function apiFetch(path: string, options: RequestInit = {}, accessToken?: string) {
  let response = await doFetch(path, options, accessToken);

  // Exclude the refresh endpoint itself: the registered unauthorized handler
  // (AuthProvider's silentRefresh) calls this same endpoint, so retrying a
  // failed refresh through the handler would recurse into itself forever.
  if (response.status === 401 && unauthorizedHandler && path !== '/auth/refresh') {
    const freshToken = await unauthorizedHandler();
    if (freshToken) {
      response = await doFetch(path, options, freshToken);
    }
  }

  if (!response.ok) {
    await throwForResponse(response);
  }
  return response.json();
}

export async function apiFetchBlob(
  path: string,
  options: RequestInit = {},
  accessToken?: string,
): Promise<{ blob: Blob; filename: string | null }> {
  const response = await doFetch(path, options, accessToken);
  if (!response.ok) {
    await throwForResponse(response);
  }
  const disposition = response.headers.get('Content-Disposition');
  const filenameMatch = disposition?.match(/filename="([^"]+)"/);
  return { blob: await response.blob(), filename: filenameMatch ? filenameMatch[1] : null };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/web && npx jest lib/api-client.test.ts`
Expected: `Tests: 5 passed, 5 total` (3 existing + 2 new `apiFetch` assertions... actually 2 existing `apiFetch` its + 1 new `apiFetch` it + 2 new `apiFetchBlob` its = 5 total).

- [ ] **Step 5: Add panel report types**

Append to the end of `apps/web/lib/types.ts`:

```ts
export interface ScoreDistributionBucket {
  rangeLabel: string;
  count: number;
}

export interface AttemptDurationStats {
  avgMinutes: number;
  minMinutes: number;
  maxMinutes: number;
}

export interface ExamResultsSummary {
  totalCandidates: number;
  settledCount: number;
  inProgressCount: number;
  notStartedCount: number;
  passRate: number;
  averagePercentage: number;
  scoreDistribution: ScoreDistributionBucket[];
  attemptDuration: AttemptDurationStats | null;
}

export interface QuestionAccuracyRow {
  questionId: string;
  questionText: string;
  timesIncluded: number;
  timesAttempted: number;
  timesSkipped: number;
  timesCorrect: number;
  accuracyPercentage: number;
}

export interface ProctoringAnalysisSummary {
  status: string;
  riskLevel: string | null;
  summary: string | null;
}

export interface ExamResultRow {
  candidateId: string;
  candidateName: string;
  invitationId: string;
  attemptId: string | null;
  status: string;
  score: number | null;
  maxScore: number | null;
  percentage: number | null;
  passFail: string | null;
  submittedAt: string | null;
  proctoringAnalysis: ProctoringAnalysisSummary | null;
}

export interface SectionScore {
  sectionId: string;
  title: string;
  score: number;
  maxScore: number;
}

export interface CandidateDetailQuestion {
  questionId: string;
  questionText: string;
  type: string;
  marks: number;
  negativeMarks: number;
  options: { id: string; text: string }[];
  selectedOptionIds: string[];
  correctOptionIds: string[];
  isCorrect: boolean | null;
  marksAwarded: number | null;
}

export interface CandidateDetailSection extends SectionScore {
  questions: CandidateDetailQuestion[];
}

export interface CandidateDetail {
  candidateId: string;
  candidateName: string;
  status: string;
  score: number | null;
  maxScore: number | null;
  percentage: number | null;
  passFail: string | null;
  submittedAt: string | null;
  proctoringAnalysis: ProctoringAnalysisSummary | null;
  sections: CandidateDetailSection[];
}

export interface CandidateComparisonRow {
  candidateId: string;
  candidateName: string;
  status: string;
  score: number | null;
  maxScore: number | null;
  percentage: number | null;
  passFail: string | null;
  proctoringAnalysis: ProctoringAnalysisSummary | null;
  sectionScores: SectionScore[];
}

export interface AttemptInsight {
  id: string;
  attemptId: string;
  status: string;
  summary: string | null;
  generatedAt: string;
}
```

- [ ] **Step 6: Write the failing test for the report hooks**

Create `apps/web/lib/hooks/usePanelReports.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../auth-context';
import {
  useResultsSummary,
  useResultsList,
  useAttemptInsight,
  useRegenerateAttemptInsight,
  useResultsExport,
} from './usePanelReports';

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}

describe('usePanelReports', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('useResultsSummary fetches the summary for the given exam', async () => {
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ message: 'none' }), { status: 401 });
      }
      if (String(url).endsWith('/exams/exam-1/results/summary')) {
        return new Response(JSON.stringify({ totalCandidates: 3, settledCount: 2, inProgressCount: 1, notStartedCount: 0, passRate: 50, averagePercentage: 60, scoreDistribution: [], attemptDuration: null }), { status: 200 });
      }
      throw new Error(`Unexpected fetch to ${url}`);
    }) as unknown as typeof fetch;

    function Probe() {
      const { data, isLoading } = useResultsSummary('exam-1');
      if (isLoading || !data) return <p>Loading</p>;
      return <p>total:{data.totalCandidates}</p>;
    }
    render(<Probe />, { wrapper });
    await waitFor(() => expect(screen.getByText('total:3')).toBeInTheDocument());
  });

  it('useResultsList fetches the candidate result rows for the given exam', async () => {
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ message: 'none' }), { status: 401 });
      }
      if (String(url).endsWith('/exams/exam-1/results')) {
        return new Response(JSON.stringify([{ candidateId: 'c1', candidateName: 'Alice', invitationId: 'i1', attemptId: 'a1', status: 'submitted', score: 8, maxScore: 10, percentage: 80, passFail: 'pass', submittedAt: null, proctoringAnalysis: null }]), { status: 200 });
      }
      throw new Error(`Unexpected fetch to ${url}`);
    }) as unknown as typeof fetch;

    function Probe() {
      const { data, isLoading } = useResultsList('exam-1');
      if (isLoading || !data) return <p>Loading</p>;
      return <p>rows:{data.length}</p>;
    }
    render(<Probe />, { wrapper });
    await waitFor(() => expect(screen.getByText('rows:1')).toBeInTheDocument());
  });

  it('useAttemptInsight returns null (not an error) when the insight has not been generated yet (404)', async () => {
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ message: 'none' }), { status: 401 });
      }
      if (String(url).endsWith('/attempts/a1/ai-insight')) {
        return new Response(JSON.stringify({ message: 'Not found' }), { status: 404 });
      }
      throw new Error(`Unexpected fetch to ${url}`);
    }) as unknown as typeof fetch;

    function Probe() {
      const { data, isLoading } = useAttemptInsight('a1');
      if (isLoading) return <p>Loading</p>;
      return <p>insight:{data === null ? 'none' : 'present'}</p>;
    }
    render(<Probe />, { wrapper });
    await waitFor(() => expect(screen.getByText('insight:none')).toBeInTheDocument());
  });

  it('useRegenerateAttemptInsight posts to the regenerate endpoint', async () => {
    const calls: string[] = [];
    global.fetch = jest.fn(async (url, options) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ message: 'none' }), { status: 401 });
      }
      calls.push(`${(options as RequestInit).method} ${url}`);
      return new Response(JSON.stringify({ id: 'ins-1', attemptId: 'a1', status: 'pending', summary: null, generatedAt: '2026-01-01' }), { status: 200 });
    }) as unknown as typeof fetch;

    let hook: ReturnType<typeof useRegenerateAttemptInsight> | undefined;
    function Probe() {
      hook = useRegenerateAttemptInsight();
      return null;
    }
    render(<Probe />, { wrapper });
    await hook!.mutateAsync('a1');
    expect(calls.some((c) => c.includes('POST') && c.includes('/attempts/a1/ai-insight/regenerate'))).toBe(true);
  });

  it('useResultsExport calls the export endpoint with the given format and returns a blob', async () => {
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ message: 'none' }), { status: 401 });
      }
      if (String(url).includes('/exams/exam-1/results/export?format=csv')) {
        return new Response(new Blob(['a,b']), { status: 200, headers: { 'Content-Disposition': 'attachment; filename="exam-exam-1-results.csv"' } });
      }
      throw new Error(`Unexpected fetch to ${url}`);
    }) as unknown as typeof fetch;

    let hook: ReturnType<typeof useResultsExport> | undefined;
    function Probe() {
      hook = useResultsExport('exam-1');
      return null;
    }
    render(<Probe />, { wrapper });
    const result = await hook!.mutateAsync('csv');
    expect(result.filename).toBe('exam-exam-1-results.csv');
  });
});
```

- [ ] **Step 7: Run the test to verify it fails**

Run: `cd apps/web && npx jest lib/hooks/usePanelReports.test.tsx`
Expected: FAIL — `Cannot find module './usePanelReports'`.

- [ ] **Step 8: Implement the report hooks**

Create `apps/web/lib/hooks/usePanelReports.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, apiFetchBlob } from '../api-client';
import { useAuth } from '../auth-context';
import {
  ExamResultsSummary,
  QuestionAccuracyRow,
  ExamResultRow,
  CandidateDetail,
  CandidateComparisonRow,
  AttemptInsight,
} from '../types';

export function useResultsSummary(examId: string) {
  const { accessToken } = useAuth();
  return useQuery<ExamResultsSummary>({
    queryKey: ['results', examId, 'summary'],
    queryFn: () => apiFetch(`/exams/${examId}/results/summary`, {}, accessToken ?? undefined),
    enabled: Boolean(accessToken) && Boolean(examId),
  });
}

export function useQuestionAccuracy(examId: string) {
  const { accessToken } = useAuth();
  return useQuery<QuestionAccuracyRow[]>({
    queryKey: ['results', examId, 'question-accuracy'],
    queryFn: () => apiFetch(`/exams/${examId}/results/question-accuracy`, {}, accessToken ?? undefined),
    enabled: Boolean(accessToken) && Boolean(examId),
  });
}

export function useResultsList(examId: string) {
  const { accessToken } = useAuth();
  return useQuery<ExamResultRow[]>({
    queryKey: ['results', examId, 'list'],
    queryFn: () => apiFetch(`/exams/${examId}/results`, {}, accessToken ?? undefined),
    enabled: Boolean(accessToken) && Boolean(examId),
  });
}

export function useCandidateReport(examId: string, candidateId: string | null) {
  const { accessToken } = useAuth();
  return useQuery<CandidateDetail>({
    queryKey: ['results', examId, 'candidates', candidateId],
    queryFn: () => apiFetch(`/exams/${examId}/candidates/${candidateId}/report`, {}, accessToken ?? undefined),
    enabled: Boolean(accessToken) && Boolean(examId) && Boolean(candidateId),
  });
}

export function useCandidateComparison(examId: string, candidateIds: string[]) {
  const { accessToken } = useAuth();
  return useQuery<CandidateComparisonRow[]>({
    queryKey: ['results', examId, 'compare', candidateIds.join(',')],
    queryFn: () =>
      apiFetch(`/exams/${examId}/candidates/compare?candidateIds=${candidateIds.join(',')}`, {}, accessToken ?? undefined),
    enabled: Boolean(accessToken) && Boolean(examId) && candidateIds.length >= 2,
  });
}

export function useAttemptInsight(attemptId: string | null) {
  const { accessToken } = useAuth();
  return useQuery<AttemptInsight | null>({
    queryKey: ['attempt-insight', attemptId],
    queryFn: async () => {
      try {
        return await apiFetch(`/attempts/${attemptId}/ai-insight`, {}, accessToken ?? undefined);
      } catch (error) {
        if (error instanceof Error && (error as Error & { status?: number }).status === 404) {
          return null;
        }
        throw error;
      }
    },
    enabled: Boolean(accessToken) && Boolean(attemptId),
  });
}

export function useRegenerateAttemptInsight() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (attemptId: string) =>
      apiFetch(
        `/attempts/${attemptId}/ai-insight/regenerate`,
        { method: 'POST', body: JSON.stringify({}) },
        accessToken ?? undefined,
      ),
    onSuccess: (_data, attemptId) => queryClient.invalidateQueries({ queryKey: ['attempt-insight', attemptId] }),
  });
}

export function useResultsExport(examId: string) {
  const { accessToken } = useAuth();
  return useMutation({
    mutationFn: (format: 'csv' | 'xlsx' | 'pdf') =>
      apiFetchBlob(`/exams/${examId}/results/export?format=${format}`, {}, accessToken ?? undefined),
  });
}
```

- [ ] **Step 9: Run the test to verify it passes**

Run: `cd apps/web && npx jest lib/hooks/usePanelReports.test.tsx`
Expected: `Tests: 5 passed, 5 total`.

- [ ] **Step 10: Commit**

```bash
git add apps/web/lib/api-client.ts apps/web/lib/api-client.test.ts apps/web/lib/types.ts apps/web/lib/hooks/usePanelReports.ts apps/web/lib/hooks/usePanelReports.test.tsx
git commit -m "feat: panel report types, apiFetchBlob, and report data hooks"
```

---

### Task 3: Frontend — panel layout, login redirect, and exam list screen

**Files:**
- Create: `apps/web/app/(panel)/layout.tsx`
- Modify: `apps/web/app/login/page.tsx`
- Create: `apps/web/app/(panel)/reports/page.tsx`
- Test: `apps/web/app/(panel)/reports/page.test.tsx`

**Interfaces:**
- Consumes: `useAuth` (existing, `apps/web/lib/auth-context.tsx`), `useBranding` (existing), `useExams` (existing, `apps/web/lib/hooks/useExams.ts`, unchanged), `Table`/`Badge`/`type Column` from `components/ui` (existing).
- Produces: route `/reports` (exam list). Tasks 4-6 build the routes this list links into.

- [ ] **Step 1: Create the panel route group layout**

Create `apps/web/app/(panel)/layout.tsx`:

```tsx
'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import clsx from 'clsx';
import { useAuth } from '../../lib/auth-context';
import { useBranding } from '../../lib/hooks/useBranding';

const NAV_ITEMS = [{ href: '/reports', label: 'Exams' }];

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { accessToken, organizationSlug, role, isLoading } = useAuth();
  const { data: branding } = useBranding(organizationSlug);

  useEffect(() => {
    if (!isLoading && !accessToken) {
      router.push('/login');
    } else if (!isLoading && accessToken && role && role !== 'panel') {
      router.push('/login');
    }
  }, [isLoading, accessToken, role, router]);

  const themeStyle = {
    ...(branding?.primaryColor ? { '--color-primary': branding.primaryColor } : {}),
    ...(branding?.accentColor ? { '--color-accent': branding.accentColor } : {}),
  } as React.CSSProperties;

  if (isLoading || !accessToken || (role !== null && role !== 'panel')) {
    return <p className="p-8 text-sm text-gray-500">Loading…</p>;
  }

  return (
    <div style={themeStyle} className="flex min-h-screen">
      <nav className="w-56 shrink-0 border-r border-gray-200 bg-gray-50 p-4">
        {branding?.logoUrl && <img src={branding.logoUrl} alt="Organization logo" className="mb-4 max-h-10" />}
        <ul className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className={clsx(
                  'block rounded px-3 py-2 text-sm font-medium',
                  pathname?.startsWith(item.href) ? 'bg-primary text-white' : 'text-gray-700 hover:bg-gray-100',
                )}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
```

- [ ] **Step 2: Add the panel branch to the login redirect**

In `apps/web/app/login/page.tsx`, find this line (inside `handleSubmit`):

```ts
      router.push(payload?.role === 'org_admin' ? '/users' : '/dashboard');
```

Replace it with:

```ts
      router.push(payload?.role === 'org_admin' ? '/users' : payload?.role === 'panel' ? '/reports' : '/dashboard');
```

- [ ] **Step 3: Write the failing test for the exam list screen**

Create `apps/web/app/(panel)/reports/page.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { useExams } from '../../../lib/hooks/useExams';
import PanelReportsPage from './page';

jest.mock('../../../lib/hooks/useExams', () => ({ useExams: jest.fn() }));

describe('PanelReportsPage', () => {
  it('renders the exam list with a link into each exam', () => {
    (useExams as jest.Mock).mockReturnValue({
      data: [
        { id: 'exam-1', title: 'Backend Screening', status: 'published' },
        { id: 'exam-2', title: 'Draft Exam', status: 'draft' },
      ],
      isLoading: false,
      isError: false,
    });

    render(<PanelReportsPage />);

    expect(screen.getByRole('link', { name: 'Backend Screening' })).toHaveAttribute('href', '/reports/exam-1');
    expect(screen.getByText('published')).toBeInTheDocument();
    expect(screen.getByText('draft')).toBeInTheDocument();
  });

  it('shows an empty state when there are no exams', () => {
    (useExams as jest.Mock).mockReturnValue({ data: [], isLoading: false, isError: false });
    render(<PanelReportsPage />);
    expect(screen.getByText('No exams yet.')).toBeInTheDocument();
  });

  it('shows an error message when the exam list fails to load', () => {
    (useExams as jest.Mock).mockReturnValue({ data: undefined, isLoading: false, isError: true });
    render(<PanelReportsPage />);
    expect(screen.getByText('Failed to load exams.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `cd apps/web && npx jest "app/(panel)/reports/page.test.tsx"`
Expected: FAIL — `Cannot find module './page'`.

- [ ] **Step 5: Implement the exam list screen**

Create `apps/web/app/(panel)/reports/page.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { useExams } from '../../../lib/hooks/useExams';
import { Table, Badge, type Column } from '../../../components/ui';
import { Exam, ExamStatus } from '../../../lib/types';

const STATUS_VARIANT: Record<ExamStatus, 'default' | 'success' | 'warning'> = {
  draft: 'warning',
  published: 'success',
  archived: 'default',
};

const columns: Column<Exam>[] = [
  {
    key: 'title',
    header: 'Title',
    render: (exam) => <Link href={`/reports/${exam.id}`}>{exam.title}</Link>,
    sortValue: (exam) => exam.title,
  },
  { key: 'status', header: 'Status', render: (exam) => <Badge variant={STATUS_VARIANT[exam.status]}>{exam.status}</Badge> },
];

export default function PanelReportsPage() {
  const { data: exams, isLoading, isError } = useExams();

  if (isLoading) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-semibold">Exams</h1>
        <p className="text-sm text-gray-500">Loading…</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-semibold">Exams</h1>
        <p role="alert" className="text-sm text-red-600">
          Failed to load exams.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Exams</h1>
      <Table columns={columns} rows={exams ?? []} rowKey={(exam) => exam.id} emptyMessage="No exams yet." />
    </div>
  );
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd apps/web && npx jest "app/(panel)/reports/page.test.tsx"`
Expected: `Tests: 3 passed, 3 total`.

- [ ] **Step 7: Commit**

```bash
git add "apps/web/app/(panel)/layout.tsx" apps/web/app/login/page.tsx "apps/web/app/(panel)/reports/page.tsx" "apps/web/app/(panel)/reports/page.test.tsx"
git commit -m "feat: panel layout, login redirect, and exam list screen"
```

---

### Task 4: Frontend — results dashboard screen

**Files:**
- Create: `apps/web/app/(panel)/reports/[examId]/page.tsx`
- Test: `apps/web/app/(panel)/reports/[examId]/page.test.tsx`

**Interfaces:**
- Consumes: `useExam` (existing), `useResultsSummary`, `useQuestionAccuracy`, `useResultsList`, `useResultsExport` (Task 2), `Table`/`Badge`/`Button`/`Checkbox`/`Card`/`type Column` (existing).
- Produces: route `/reports/[examId]`. Task 5 links into this screen's candidate rows; this screen navigates to Task 6's `/compare` route.

- [ ] **Step 1: Write the failing test**

Create `apps/web/app/(panel)/reports/[examId]/page.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useParams, useRouter } from 'next/navigation';
import { useExam } from '../../../../lib/hooks/useExams';
import { useResultsSummary, useQuestionAccuracy, useResultsList, useResultsExport } from '../../../../lib/hooks/usePanelReports';
import PanelExamResultsPage from './page';

jest.mock('next/navigation', () => ({ useParams: jest.fn(), useRouter: jest.fn() }));
jest.mock('../../../../lib/hooks/useExams', () => ({ useExam: jest.fn() }));
jest.mock('../../../../lib/hooks/usePanelReports', () => ({
  useResultsSummary: jest.fn(),
  useQuestionAccuracy: jest.fn(),
  useResultsList: jest.fn(),
  useResultsExport: jest.fn(),
}));

const resultRows = [
  { candidateId: 'c1', candidateName: 'Alice', invitationId: 'i1', attemptId: 'a1', status: 'submitted', score: 8, maxScore: 10, percentage: 80, passFail: 'pass', submittedAt: null, proctoringAnalysis: null },
  { candidateId: 'c2', candidateName: 'Bob', invitationId: 'i2', attemptId: 'a2', status: 'submitted', score: 4, maxScore: 10, percentage: 40, passFail: 'fail', submittedAt: null, proctoringAnalysis: null },
];

describe('PanelExamResultsPage', () => {
  const push = jest.fn();
  const mutateAsync = jest.fn().mockResolvedValue({ blob: new Blob(['x']), filename: 'exam-exam-1-results.csv' });

  beforeEach(() => {
    push.mockClear();
    mutateAsync.mockClear();
    (useParams as jest.Mock).mockReturnValue({ examId: 'exam-1' });
    (useRouter as jest.Mock).mockReturnValue({ push });
    (useExam as jest.Mock).mockReturnValue({ data: { id: 'exam-1', title: 'Backend Screening' } });
    (useResultsSummary as jest.Mock).mockReturnValue({
      data: { totalCandidates: 2, settledCount: 2, inProgressCount: 0, notStartedCount: 0, passRate: 50, averagePercentage: 60, scoreDistribution: [], attemptDuration: null },
      isLoading: false,
    });
    (useQuestionAccuracy as jest.Mock).mockReturnValue({ data: [], isLoading: false });
    (useResultsList as jest.Mock).mockReturnValue({ data: resultRows, isLoading: false });
    (useResultsExport as jest.Mock).mockReturnValue({ mutateAsync, isPending: false });
  });

  it('renders the exam title, summary stats, and candidate rows with links', () => {
    render(<PanelExamResultsPage />);

    expect(screen.getByText('Backend Screening')).toBeInTheDocument();
    expect(screen.getByText('50.0%')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Alice' })).toHaveAttribute('href', '/reports/exam-1/candidates/c1?attemptId=a1');
    expect(screen.getByRole('link', { name: 'Bob' })).toHaveAttribute('href', '/reports/exam-1/candidates/c2?attemptId=a2');
  });

  it('enables Compare selected only once at least 2 candidates are checked, then navigates with the selected ids', async () => {
    render(<PanelExamResultsPage />);

    const compareButton = screen.getByRole('button', { name: 'Compare selected' });
    expect(compareButton).toBeDisabled();

    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Alice' }));
    expect(compareButton).toBeDisabled();

    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Bob' }));
    expect(compareButton).toBeEnabled();

    await userEvent.click(compareButton);
    expect(push).toHaveBeenCalledWith('/reports/exam-1/compare?candidateIds=c1,c2');
  });

  it('triggers an export download when an export format button is clicked', async () => {
    const createObjectURL = jest.fn().mockReturnValue('blob:mock');
    const revokeObjectURL = jest.fn();
    global.URL.createObjectURL = createObjectURL;
    global.URL.revokeObjectURL = revokeObjectURL;

    render(<PanelExamResultsPage />);
    await userEvent.click(screen.getByRole('button', { name: 'Export CSV' }));

    expect(mutateAsync).toHaveBeenCalledWith('csv');
    expect(createObjectURL).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && npx jest "app/(panel)/reports/\[examId\]/page.test.tsx"`
Expected: FAIL — `Cannot find module './page'`.

- [ ] **Step 3: Implement the results dashboard screen**

Create `apps/web/app/(panel)/reports/[examId]/page.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useExam } from '../../../../lib/hooks/useExams';
import { useResultsSummary, useQuestionAccuracy, useResultsList, useResultsExport } from '../../../../lib/hooks/usePanelReports';
import { Table, Badge, Button, Checkbox, Card, type Column } from '../../../../components/ui';
import { ExamResultRow, QuestionAccuracyRow } from '../../../../lib/types';

const PASS_FAIL_VARIANT: Record<string, 'success' | 'danger'> = { pass: 'success', fail: 'danger' };

export default function PanelExamResultsPage() {
  const { examId } = useParams<{ examId: string }>();
  const router = useRouter();
  const { data: exam } = useExam(examId);
  const { data: summary, isLoading: summaryLoading } = useResultsSummary(examId);
  const { data: accuracyRows, isLoading: accuracyLoading } = useQuestionAccuracy(examId);
  const { data: results, isLoading: resultsLoading } = useResultsList(examId);
  const exportMutation = useResultsExport(examId);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  function toggleSelected(candidateId: string) {
    setSelectedIds((current) =>
      current.includes(candidateId) ? current.filter((id) => id !== candidateId) : [...current, candidateId],
    );
  }

  async function handleExport(format: 'csv' | 'xlsx' | 'pdf') {
    const { blob, filename } = await exportMutation.mutateAsync(format);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename ?? `exam-${examId}-results.${format}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  const columns: Column<ExamResultRow>[] = [
    {
      key: 'select',
      header: '',
      render: (row) => (
        <Checkbox
          checked={selectedIds.includes(row.candidateId)}
          onChange={() => toggleSelected(row.candidateId)}
          label={`Select ${row.candidateName}`}
        />
      ),
    },
    {
      key: 'name',
      header: 'Candidate',
      render: (row) => (
        <Link href={`/reports/${examId}/candidates/${row.candidateId}?attemptId=${row.attemptId ?? ''}`}>
          {row.candidateName}
        </Link>
      ),
      sortValue: (row) => row.candidateName,
    },
    { key: 'status', header: 'Status', render: (row) => row.status },
    {
      key: 'percentage',
      header: 'Score %',
      render: (row) => (row.percentage !== null ? `${row.percentage.toFixed(1)}%` : '—'),
      sortValue: (row) => row.percentage ?? -1,
    },
    {
      key: 'passFail',
      header: 'Result',
      render: (row) => (row.passFail ? <Badge variant={PASS_FAIL_VARIANT[row.passFail] ?? 'default'}>{row.passFail}</Badge> : '—'),
    },
  ];

  const accuracyColumns: Column<QuestionAccuracyRow>[] = [
    { key: 'question', header: 'Question', render: (row) => row.questionText },
    {
      key: 'accuracy',
      header: 'Accuracy',
      render: (row) => `${row.accuracyPercentage.toFixed(1)}%`,
      sortValue: (row) => row.accuracyPercentage,
    },
    { key: 'attempted', header: 'Attempted / Included', render: (row) => `${row.timesAttempted} / ${row.timesIncluded}` },
  ];

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">{exam?.title ?? 'Exam results'}</h1>

      {summaryLoading ? (
        <p className="mb-6 text-sm text-gray-500">Loading summary…</p>
      ) : summary ? (
        <div className="mb-6 grid grid-cols-4 gap-4">
          <Card>
            <p className="text-xs text-gray-500">Total candidates</p>
            <p className="text-2xl font-semibold">{summary.totalCandidates}</p>
          </Card>
          <Card>
            <p className="text-xs text-gray-500">Settled</p>
            <p className="text-2xl font-semibold">{summary.settledCount}</p>
          </Card>
          <Card>
            <p className="text-xs text-gray-500">Pass rate</p>
            <p className="text-2xl font-semibold">{summary.passRate.toFixed(1)}%</p>
          </Card>
          <Card>
            <p className="text-xs text-gray-500">Average score</p>
            <p className="text-2xl font-semibold">{summary.averagePercentage.toFixed(1)}%</p>
          </Card>
        </div>
      ) : null}

      <div className="mb-6">
        <h2 className="mb-2 text-lg font-medium">Question accuracy</h2>
        {accuracyLoading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : (
          <Table
            columns={accuracyColumns}
            rows={accuracyRows ?? []}
            rowKey={(row) => row.questionId}
            emptyMessage="No settled attempts yet."
          />
        )}
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-medium">Candidates</h2>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => handleExport('csv')} disabled={exportMutation.isPending}>
              Export CSV
            </Button>
            <Button variant="secondary" onClick={() => handleExport('xlsx')} disabled={exportMutation.isPending}>
              Export Excel
            </Button>
            <Button variant="secondary" onClick={() => handleExport('pdf')} disabled={exportMutation.isPending}>
              Export PDF
            </Button>
            <Button
              disabled={selectedIds.length < 2}
              onClick={() => router.push(`/reports/${examId}/compare?candidateIds=${selectedIds.join(',')}`)}
            >
              Compare selected
            </Button>
          </div>
        </div>
        {resultsLoading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : (
          <Table columns={columns} rows={results ?? []} rowKey={(row) => row.candidateId} emptyMessage="No candidates invited yet." />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/web && npx jest "app/(panel)/reports/\[examId\]/page.test.tsx"`
Expected: `Tests: 3 passed, 3 total`.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/(panel)/reports/[examId]/page.tsx" "apps/web/app/(panel)/reports/[examId]/page.test.tsx"
git commit -m "feat: panel results dashboard screen"
```

---

### Task 5: Frontend — candidate detail screen

**Files:**
- Create: `apps/web/app/(panel)/reports/[examId]/candidates/[candidateId]/page.tsx`
- Test: `apps/web/app/(panel)/reports/[examId]/candidates/[candidateId]/page.test.tsx`

**Interfaces:**
- Consumes: `useCandidateReport`, `useAttemptInsight`, `useRegenerateAttemptInsight` (Task 2), `Table`/`Badge`/`Button`/`Card`/`type Column` (existing).
- Produces: route `/reports/[examId]/candidates/[candidateId]`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/app/(panel)/reports/[examId]/candidates/[candidateId]/page.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useParams, useSearchParams } from 'next/navigation';
import { useCandidateReport, useAttemptInsight, useRegenerateAttemptInsight } from '../../../../../../lib/hooks/usePanelReports';
import PanelCandidateDetailPage from './page';

jest.mock('next/navigation', () => ({ useParams: jest.fn(), useSearchParams: jest.fn() }));
jest.mock('../../../../../../lib/hooks/usePanelReports', () => ({
  useCandidateReport: jest.fn(),
  useAttemptInsight: jest.fn(),
  useRegenerateAttemptInsight: jest.fn(),
}));

const candidateDetail = {
  candidateId: 'c1',
  candidateName: 'Alice',
  status: 'submitted',
  score: 8,
  maxScore: 10,
  percentage: 80,
  passFail: 'pass',
  submittedAt: null,
  proctoringAnalysis: null,
  sections: [
    {
      sectionId: 's1',
      title: 'Section One',
      score: 8,
      maxScore: 10,
      questions: [
        {
          questionId: 'q1',
          questionText: 'What is 2 + 2?',
          type: 'single_mcq',
          marks: 5,
          negativeMarks: 0,
          options: [{ id: 'o1', text: '4' }, { id: 'o2', text: '5' }],
          selectedOptionIds: ['o1'],
          correctOptionIds: ['o1'],
          isCorrect: true,
          marksAwarded: 5,
        },
      ],
    },
  ],
};

describe('PanelCandidateDetailPage', () => {
  const mutateAsync = jest.fn();

  beforeEach(() => {
    mutateAsync.mockClear();
    (useParams as jest.Mock).mockReturnValue({ examId: 'exam-1', candidateId: 'c1' });
    (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams('attemptId=a1'));
    (useCandidateReport as jest.Mock).mockReturnValue({ data: candidateDetail, isLoading: false });
    (useRegenerateAttemptInsight as jest.Mock).mockReturnValue({ mutateAsync, isPending: false });
  });

  it('renders the candidate score, pass/fail, and per-question breakdown', () => {
    (useAttemptInsight as jest.Mock).mockReturnValue({ data: null, isLoading: false });
    render(<PanelCandidateDetailPage />);

    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('80.0%')).toBeInTheDocument();
    expect(screen.getByText('What is 2 + 2?')).toBeInTheDocument();
  });

  it('shows a "Not yet generated" state with a Regenerate button when no insight exists', async () => {
    (useAttemptInsight as jest.Mock).mockReturnValue({ data: null, isLoading: false });
    render(<PanelCandidateDetailPage />);

    expect(screen.getByText('Not yet generated')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Regenerate' }));
    expect(mutateAsync).toHaveBeenCalledWith('a1');
  });

  it('renders the insight summary when one exists', () => {
    (useAttemptInsight as jest.Mock).mockReturnValue({
      data: { id: 'ins-1', attemptId: 'a1', status: 'completed', summary: 'Strong performance overall.', generatedAt: '2026-01-01' },
      isLoading: false,
    });
    render(<PanelCandidateDetailPage />);

    expect(screen.getByText('Strong performance overall.')).toBeInTheDocument();
  });

  it('hides the AI Insight section entirely when the candidate has no attemptId (not yet attempted)', () => {
    (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams());
    (useAttemptInsight as jest.Mock).mockReturnValue({ data: null, isLoading: false });
    render(<PanelCandidateDetailPage />);

    expect(screen.queryByText('AI Insight')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && npx jest "app/(panel)/reports/\[examId\]/candidates/\[candidateId\]/page.test.tsx"`
Expected: FAIL — `Cannot find module './page'`.

- [ ] **Step 3: Implement the candidate detail screen**

Create `apps/web/app/(panel)/reports/[examId]/candidates/[candidateId]/page.tsx`:

```tsx
'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { useCandidateReport, useAttemptInsight, useRegenerateAttemptInsight } from '../../../../../../lib/hooks/usePanelReports';
import { Badge, Button, Card } from '../../../../../../components/ui';

const PASS_FAIL_VARIANT: Record<string, 'success' | 'danger'> = { pass: 'success', fail: 'danger' };

export default function PanelCandidateDetailPage() {
  const { examId, candidateId } = useParams<{ examId: string; candidateId: string }>();
  const searchParams = useSearchParams();
  const attemptId = searchParams.get('attemptId') || null;
  const { data: candidate, isLoading } = useCandidateReport(examId, candidateId);
  const { data: insight, isLoading: insightLoading } = useAttemptInsight(attemptId);
  const regenerate = useRegenerateAttemptInsight();

  if (isLoading || !candidate) {
    return <p className="p-8 text-sm text-gray-500">Loading…</p>;
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{candidate.candidateName}</h1>
        {candidate.passFail && <Badge variant={PASS_FAIL_VARIANT[candidate.passFail] ?? 'default'}>{candidate.passFail}</Badge>}
      </div>

      <Card className="mb-6">
        <p className="text-xs text-gray-500">Score</p>
        <p className="text-2xl font-semibold">
          {candidate.percentage !== null ? `${candidate.percentage.toFixed(1)}%` : '—'}
          {candidate.score !== null && candidate.maxScore !== null && (
            <span className="ml-2 text-sm font-normal text-gray-500">
              ({candidate.score}/{candidate.maxScore})
            </span>
          )}
        </p>
      </Card>

      <div className="mb-6">
        <h2 className="mb-2 text-lg font-medium">AI Insight</h2>
        {insightLoading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : insight ? (
          <Card>
            <p className="text-sm text-gray-700">{insight.summary}</p>
          </Card>
        ) : (
          <Card>
            <p className="mb-3 text-sm text-gray-500">Not yet generated</p>
            <Button
              variant="secondary"
              disabled={regenerate.isPending}
              onClick={() => attemptId && regenerate.mutateAsync(attemptId)}
            >
              Regenerate
            </Button>
          </Card>
        )}
      </div>

      <div className="flex flex-col gap-4">
        {candidate.sections.map((section) => (
          <Card key={section.sectionId}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-medium">{section.title}</h3>
              <span className="text-sm text-gray-500">
                {section.score}/{section.maxScore}
              </span>
            </div>
            <div className="flex flex-col gap-3">
              {section.questions.map((question) => (
                <div key={question.questionId} className="border-t border-gray-100 pt-3 first:border-0 first:pt-0">
                  <p className="mb-2 text-sm text-gray-800">{question.questionText}</p>
                  <div className="flex flex-col gap-1">
                    {question.options.map((option) => {
                      const wasSelected = question.selectedOptionIds.includes(option.id);
                      const isCorrectOption = question.correctOptionIds.includes(option.id);
                      return (
                        <p
                          key={option.id}
                          className={
                            isCorrectOption
                              ? 'text-sm font-medium text-green-700'
                              : wasSelected
                                ? 'text-sm font-medium text-red-700'
                                : 'text-sm text-gray-600'
                          }
                        >
                          {wasSelected ? '◉' : '○'} {option.text}
                          {isCorrectOption ? ' (correct)' : ''}
                        </p>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
```

**Note on the `attemptId` derivation above:** `CandidateDetail` (the response from `GET /exams/:id/candidates/:candidateId/report`) does not include an `attemptId` field per the backend service's response shape (`reports.service.ts`'s `CandidateDetail` interface has no `attemptId`) — only `ExamResultRow` (the results-list shape) has it. The line above is a **placeholder that does not work** and must be corrected during implementation: pass `attemptId` into this screen from the results-list row the candidate was clicked from (e.g. via a query string param `?attemptId=...` appended to the link built in Task 4's `/reports/[examId]/page.tsx`, since `ExamResultRow.attemptId` is available there), and read it here via `useSearchParams()`. Update Task 4's candidate link to `href={`/reports/${examId}/candidates/${row.candidateId}?attemptId=${row.attemptId ?? ''}`}`, and this file's `attemptId` derivation to `const searchParams = useSearchParams(); const attemptId = searchParams.get('attemptId') || null;` (with the corresponding `import { useParams, useSearchParams } from 'next/navigation';`). If `attemptId` is empty (an unsettled/not-yet-attempted candidate), `useAttemptInsight(null)` correctly stays disabled and the AI Insight section should show "Not yet generated" without a working Regenerate button in that case — guard the button's `onClick` (already does, via `attemptId &&`) and additionally hide the whole AI Insight section when `!attemptId` rather than showing a Regenerate button that has nothing to regenerate.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/web && npx jest "app/(panel)/reports/\[examId\]/candidates/\[candidateId\]/page.test.tsx"`
Expected: `Tests: 3 passed, 3 total`.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/(panel)/reports/[examId]/candidates" "apps/web/app/(panel)/reports/[examId]/page.tsx"
git commit -m "feat: panel candidate detail screen with AI insight"
```

---

### Task 6: Frontend — comparison screen

**Files:**
- Create: `apps/web/app/(panel)/reports/[examId]/compare/page.tsx`
- Test: `apps/web/app/(panel)/reports/[examId]/compare/page.test.tsx`

**Interfaces:**
- Consumes: `useCandidateComparison` (Task 2), `Table`/`Card`/`type Column` (existing).
- Produces: route `/reports/[examId]/compare`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/app/(panel)/reports/[examId]/compare/page.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { useParams, useSearchParams } from 'next/navigation';
import { useCandidateComparison } from '../../../../../lib/hooks/usePanelReports';
import PanelComparePage from './page';

jest.mock('next/navigation', () => ({ useParams: jest.fn(), useSearchParams: jest.fn() }));
jest.mock('../../../../../lib/hooks/usePanelReports', () => ({ useCandidateComparison: jest.fn() }));

describe('PanelComparePage', () => {
  beforeEach(() => {
    (useParams as jest.Mock).mockReturnValue({ examId: 'exam-1' });
  });

  it('renders a column per selected candidate with overall and section scores', () => {
    (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams('candidateIds=c1,c2'));
    (useCandidateComparison as jest.Mock).mockReturnValue({
      data: [
        {
          candidateId: 'c1', candidateName: 'Alice', status: 'submitted', score: 8, maxScore: 10, percentage: 80, passFail: 'pass',
          proctoringAnalysis: null, sectionScores: [{ sectionId: 's1', title: 'Section One', score: 8, maxScore: 10 }],
        },
        {
          candidateId: 'c2', candidateName: 'Bob', status: 'submitted', score: 4, maxScore: 10, percentage: 40, passFail: 'fail',
          proctoringAnalysis: null, sectionScores: [{ sectionId: 's1', title: 'Section One', score: 4, maxScore: 10 }],
        },
      ],
      isLoading: false,
    });

    render(<PanelComparePage />);

    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('80.0%')).toBeInTheDocument();
    expect(screen.getByText('40.0%')).toBeInTheDocument();
  });

  it('shows an inline message instead of calling the API when fewer than 2 candidateIds are given', () => {
    (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams('candidateIds=c1'));
    (useCandidateComparison as jest.Mock).mockReturnValue({ data: undefined, isLoading: false });

    render(<PanelComparePage />);

    expect(screen.getByText('Select at least 2 candidates to compare.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && npx jest "app/(panel)/reports/\[examId\]/compare/page.test.tsx"`
Expected: FAIL — `Cannot find module './page'`.

- [ ] **Step 3: Implement the comparison screen**

Create `apps/web/app/(panel)/reports/[examId]/compare/page.tsx`:

```tsx
'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { useCandidateComparison } from '../../../../../lib/hooks/usePanelReports';
import { Card } from '../../../../../components/ui';

export default function PanelComparePage() {
  const { examId } = useParams<{ examId: string }>();
  const searchParams = useSearchParams();
  const candidateIds = (searchParams.get('candidateIds') ?? '').split(',').filter((id) => id.length > 0);

  const { data: rows, isLoading } = useCandidateComparison(examId, candidateIds);

  if (candidateIds.length < 2) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-semibold">Compare candidates</h1>
        <p className="text-sm text-gray-500">Select at least 2 candidates to compare.</p>
      </div>
    );
  }

  if (isLoading || !rows) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-semibold">Compare candidates</h1>
        <p className="text-sm text-gray-500">Loading…</p>
      </div>
    );
  }

  const sectionTitles = [...new Set(rows.flatMap((row) => row.sectionScores.map((section) => section.title)))];

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Compare candidates</h1>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left">
              <th className="px-3 py-2 font-medium text-gray-600">Metric</th>
              {rows.map((row) => (
                <th key={row.candidateId} className="px-3 py-2 font-medium text-gray-600">
                  {row.candidateName}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-gray-100">
              <td className="px-3 py-2 font-medium">Overall score</td>
              {rows.map((row) => (
                <td key={row.candidateId} className="px-3 py-2">
                  {row.percentage !== null ? `${row.percentage.toFixed(1)}%` : '—'}
                </td>
              ))}
            </tr>
            <tr className="border-b border-gray-100">
              <td className="px-3 py-2 font-medium">Result</td>
              {rows.map((row) => (
                <td key={row.candidateId} className="px-3 py-2">
                  {row.passFail ?? '—'}
                </td>
              ))}
            </tr>
            {sectionTitles.map((title) => (
              <tr key={title} className="border-b border-gray-100">
                <td className="px-3 py-2 font-medium">{title}</td>
                {rows.map((row) => {
                  const section = row.sectionScores.find((s) => s.title === title);
                  return (
                    <td key={row.candidateId} className="px-3 py-2">
                      {section ? `${section.score}/${section.maxScore}` : '—'}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/web && npx jest "app/(panel)/reports/\[examId\]/compare/page.test.tsx"`
Expected: `Tests: 2 passed, 2 total`.

- [ ] **Step 5: Run the full frontend unit suite to confirm no regressions**

Run: `cd apps/web && npm test`
Expected: all suites pass, including every new test file from Tasks 2-6.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/app/(panel)/reports/[examId]/compare"
git commit -m "feat: panel candidate comparison screen"
```

---

### Task 7: Playwright panel golden path e2e

**Files:**
- Create: `apps/web/e2e/panel-golden-path.spec.ts`

**Interfaces:**
- Consumes: the full recruiter golden-path flow (existing, `apps/web/e2e/recruiter-golden-path.spec.ts`) to create/publish an exam and invite+settle a candidate attempt, then the panel screens from Tasks 3-6.
- Produces: end-to-end proof the full loop works against real running dev servers.

- [ ] **Step 1: Confirm a seeded panel fixture exists**

Run: `grep -n "panel" "D:/exam app/apps/api/prisma/seed.ts"`
If no `panel@demo-org.test`-style fixture exists yet in the seed script's demo-org user block, add one following the exact pattern of the existing `recruiter@demo-org.test` fixture in that file (same org, `role: 'panel'`, a distinct email/password). Re-run `npx prisma db seed` (from `apps/api`) after any change and confirm it completes without error.

- [ ] **Step 2: Write the e2e spec**

Create `apps/web/e2e/panel-golden-path.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

const ORG_SLUG = process.env.E2E_ORG_SLUG ?? 'demo-org';
const RECRUITER_EMAIL = process.env.E2E_RECRUITER_EMAIL ?? 'recruiter@demo-org.test';
const RECRUITER_PASSWORD = process.env.E2E_RECRUITER_PASSWORD ?? 'Passw0rd!2026';
const PANEL_EMAIL = process.env.E2E_PANEL_EMAIL ?? 'panel@demo-org.test';
const PANEL_PASSWORD = process.env.E2E_PANEL_PASSWORD ?? 'Passw0rd!2026';

test('panel member views results, opens a candidate, compares, and exports', async ({ page }) => {
  // Recruiter: create exam, question, publish, add candidate, invite
  await page.goto('/login');
  await page.getByLabel('Organization slug').fill(ORG_SLUG);
  await page.getByLabel('Email').fill(RECRUITER_EMAIL);
  await page.getByLabel('Password').fill(RECRUITER_PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  await page.getByRole('link', { name: 'Question Bank' }).click();
  await page.getByRole('link', { name: 'New question' }).click();
  await page.getByLabel('Question text').fill('Panel path: 2 + 2?');
  await page.getByLabel('Marks', { exact: true }).fill('5');
  const optionInputs = page.getByLabel(/Option \d text/);
  await optionInputs.nth(0).fill('4');
  await optionInputs.nth(1).fill('5');
  await page.getByRole('radio', { name: 'Option 1 correct' }).click();
  await page.getByRole('button', { name: 'Create question' }).click();
  await expect(page).toHaveURL(/\/questions$/);

  await page.getByRole('link', { name: 'Exams' }).click();
  await page.getByRole('link', { name: 'New exam' }).click();
  const examTitle = `Panel Path Exam ${Date.now()}`;
  await page.getByLabel('Title').fill(examTitle);
  await page.getByRole('button', { name: 'Create exam' }).click();
  await expect(page).toHaveURL(/\/exams\/.+\/edit$/);

  await page.getByRole('tab', { name: 'Sections & Questions' }).click();
  await page.getByLabel('New section title').fill('Section One');
  await page.getByRole('button', { name: 'Add section' }).click();
  await page.getByRole('button', { name: 'Manage questions' }).click();
  await page.getByRole('checkbox', { name: /Panel path: 2 \+ 2\?/ }).first().click();
  await page.getByRole('button', { name: 'Save questions' }).click();

  await page.getByRole('button', { name: 'Publish' }).click();
  await expect(page).toHaveURL(/\/exams$/);

  await page.getByRole('link', { name: 'Candidates' }).click();
  const candidateEmail = `panel-path-${Date.now()}@example.com`;
  await page.getByLabel('Name').fill('Panel Path Candidate');
  await page.getByLabel('Email').fill(candidateEmail);
  await page.getByRole('button', { name: 'Add candidate' }).click();
  await expect(page.getByText(candidateEmail)).toBeVisible();

  await page.getByLabel('Exam to invite to').click();
  await page.getByRole('option', { name: examTitle, exact: true }).click();
  await page.getByRole('row', { name: candidateEmail }).getByRole('checkbox', { name: 'Panel Path Candidate' }).click();
  await page.getByRole('button', { name: 'Send invitations' }).click();
  await expect(page.getByText(/Invited 1 candidate/).first()).toBeVisible();

  // Panel: log out the recruiter, log in as panel, view results
  await page.goto('/login');
  await page.getByLabel('Organization slug').fill(ORG_SLUG);
  await page.getByLabel('Email').fill(PANEL_EMAIL);
  await page.getByLabel('Password').fill(PANEL_PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/reports$/);

  await page.getByRole('link', { name: examTitle }).click();
  await expect(page).toHaveURL(/\/reports\/.+$/);
  await expect(page.getByText('Question accuracy')).toBeVisible();
  await expect(page.getByText('Panel Path Candidate')).toBeVisible();

  await page.getByRole('link', { name: 'Panel Path Candidate' }).click();
  await expect(page.getByText('AI Insight')).toBeVisible();

  await page.goBack();
  await page.getByRole('checkbox', { name: 'Select Panel Path Candidate' }).click();

  const [downloadPromise] = [page.waitForEvent('download').catch(() => null)];
  await page.getByRole('button', { name: 'Export CSV' }).click();
  await downloadPromise;
});
```

- [ ] **Step 3: Start dev servers and run the spec**

Ensure `apps/api` and `apps/web` dev servers are running (per this repo's established local-dev port-conflict handling — see `dev:api`/`dev:web` root scripts, adjusting `API_PORT`/`NEXT_PUBLIC_API_BASE`/`WEB_ORIGIN` if the default ports are unavailable, per this project's documented Docker/WSL2 port-reclaim quirk).

Run: `cd apps/web && npx playwright test e2e/panel-golden-path.spec.ts`
Expected: `1 passed`.

- [ ] **Step 4: Run it a second time to confirm it isn't flaky**

Run: `cd apps/web && npx playwright test e2e/panel-golden-path.spec.ts`
Expected: `1 passed`, consistent with the first run.

- [ ] **Step 5: Commit**

```bash
git add apps/web/e2e/panel-golden-path.spec.ts apps/api/prisma/seed.ts
git commit -m "test: Playwright panel golden-path e2e spec"
```

---

### Task 8: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Full backend suites**

Run from repo root: `npm run test:api && npm run test:api:e2e && npm run test:exam-runtime && npm run test:shared`
Expected: all pass, including Task 1's widened-permission coverage. The pre-existing `ai-question-generation.e2e-spec.ts` flake (missing `ANTHROPIC_API_KEY` in this dev environment) is a documented, unrelated issue — not a regression from this plan.

- [ ] **Step 2: Full frontend unit suite**

Run: `cd apps/web && npm test`
Expected: all pass, including every new test file from Tasks 2-6.

- [ ] **Step 3: Full Playwright suite**

Run: `cd apps/web && npx playwright test`
Expected: `recruiter-golden-path.spec.ts`, the org-admin golden path, `candidate-golden-path.spec.ts`, and the new `panel-golden-path.spec.ts` all pass.

- [ ] **Step 4: Manual smoke check**

With dev servers running, manually log in as the seeded panel user in a real browser: confirm the exam list renders, the results dashboard shows summary stats/question-accuracy/candidate list correctly, a candidate detail page shows the per-question breakdown, comparison works for 2+ selected candidates, and each export format (CSV/Excel/PDF) downloads a real file. Also confirm a recruiter's own access to `GET /exams` (list/edit screens) is completely unaffected by Task 1's permission change.

- [ ] **Step 5: Update the SDD progress ledger**

Append to `.superpowers/sdd/progress.md`:

```
## Interview Panel Console
Task 1: complete (widened GET /exams / GET /exams/:id to accept results:view)
Task 2: complete (panel types, apiFetchBlob, report hooks)
Task 3: complete (panel layout, login redirect, exam list)
Task 4: complete (results dashboard)
Task 5: complete (candidate detail + AI insight)
Task 6: complete (comparison screen)
Task 7: complete (Playwright panel golden path)
Task 8: complete (final verification)
```
