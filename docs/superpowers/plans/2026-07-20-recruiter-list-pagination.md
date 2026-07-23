# Recruiter List Pagination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix Exams/Question Bank/Candidates having no working pagination (Exams has none at all; Questions/Candidates have unused backend cursor pagination that's silently truncating real data today) by standardizing all three on offset-based pagination with server-side search.

**Architecture:** One shared backend pagination helper (`apps/api/src/common/paginated-response.ts`) used by `exams`, `questions`, and `candidates` services, all returning the same `{ data, total, page, pageSize, totalPages }` envelope. One shared frontend `Pagination` UI component sits below the existing `Table` primitive on the three recruiter list screens. Every other caller of these three endpoints (invite-target dropdowns, the exam builder's question picker, the panel report screen) is updated to read `.data` and request the maximum page size, since the response shape changes for them regardless.

Deviation from the spec's "one shared frontend hook" idea: grounding this in the actual codebase (Task 6-8's research) found `useExams`, `useQuestions`, and `useCandidates` don't actually share a common shape today — they take different argument styles (`status` string, a filters object, no args at all) and none uses a common query-builder abstraction. Forcing them into one generic wrapper hook would be new complexity this codebase doesn't otherwise have. Instead, each hook is individually extended with `page`/`pageSize`/`search` params following its own existing per-hook `URLSearchParams` convention — the genuinely reusable pieces (the `PaginatedResponse<T>` type and the `Pagination` UI component, Task 5) are still shared across all three, which is what the spec's intent (one consistent contract, not three divergent ones) actually required.

**Tech Stack:** NestJS, Prisma (`skip`/`take`, SQL Server provider — no `mode: 'insensitive'` on string filters, that's Postgres-only), Next.js, `@tanstack/react-query`.

## Global Constraints

- Offset-based pagination (`page`, `pageSize`), not cursor-based — confirmed decision, needed for true numbered-page jumping.
- `pageSize` default `20`, capped at `100` server-side (matches the spec's realistic-scale assumption — hundreds to low-thousands of records per org).
- Search is a substring match (`contains`) on the entity's display field (exam title, question text, candidate name/email) — server-side, not client-side array filtering.
- Response envelope for all three endpoints: `{ data: T[], total: number, page: number, pageSize: number, totalPages: number }`.
- Every existing caller of `GET /exams`, `GET /questions`, `GET /candidates` is updated in this plan (not just the 3 main list screens) — the response shape change affects them regardless of whether they get Pagination UI.
- Follow this codebase's existing convention: controllers pass raw `@Query()` strings straight through to services; services do their own parsing/validation (matches how `questions.controller.ts`/`candidates.controller.ts` already handle `limit`/`cursor` today).
- Sorting stays client-side-per-page via the existing `Table` primitive, unchanged — sorting only affects the currently-loaded page, an explicitly accepted limitation (spec's Out of Scope).

---

### Task 1: Shared backend pagination helper

**Files:**
- Create: `apps/api/src/common/paginated-response.ts`
- Test: `apps/api/src/common/paginated-response.spec.ts`

**Interfaces:**
- Produces: `PaginatedResponse<T>` interface, `resolvePaginationParams(page?: string, pageSize?: string): { page: number; pageSize: number; skip: number; take: number }`, `buildPaginatedResponse<T>(data: T[], total: number, page: number, pageSize: number): PaginatedResponse<T>`. Tasks 2-4 import all three from this file.

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/api/src/common/paginated-response.spec.ts
import { resolvePaginationParams, buildPaginatedResponse } from './paginated-response';

describe('resolvePaginationParams', () => {
  it('defaults to page 1, pageSize 20 when neither is provided', () => {
    expect(resolvePaginationParams(undefined, undefined)).toEqual({ page: 1, pageSize: 20, skip: 0, take: 20 });
  });

  it('computes skip from page and pageSize', () => {
    expect(resolvePaginationParams('3', '10')).toEqual({ page: 3, pageSize: 10, skip: 20, take: 10 });
  });

  it('caps pageSize at 100', () => {
    expect(resolvePaginationParams('1', '500')).toEqual({ page: 1, pageSize: 100, skip: 0, take: 100 });
  });

  it('falls back to defaults for invalid (non-positive, non-integer) values', () => {
    expect(resolvePaginationParams('0', '-5')).toEqual({ page: 1, pageSize: 20, skip: 0, take: 20 });
    expect(resolvePaginationParams('abc', 'xyz')).toEqual({ page: 1, pageSize: 20, skip: 0, take: 20 });
  });
});

describe('buildPaginatedResponse', () => {
  it('computes totalPages from total and pageSize, rounding up', () => {
    expect(buildPaginatedResponse(['a', 'b'], 45, 1, 20)).toEqual({
      data: ['a', 'b'],
      total: 45,
      page: 1,
      pageSize: 20,
      totalPages: 3,
    });
  });

  it('reports totalPages as at least 1 even when total is 0', () => {
    expect(buildPaginatedResponse([], 0, 1, 20).totalPages).toBe(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && npx jest common/paginated-response.spec.ts`
Expected: FAIL with "Cannot find module './paginated-response'"

- [ ] **Step 3: Write the implementation**

```typescript
// apps/api/src/common/paginated-response.ts
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ResolvedPaginationParams {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
}

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export function resolvePaginationParams(page?: string, pageSize?: string): ResolvedPaginationParams {
  const parsedPage = page ? parseInt(page, 10) : NaN;
  const parsedPageSize = pageSize ? parseInt(pageSize, 10) : NaN;

  const resolvedPage = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const resolvedPageSize =
    Number.isInteger(parsedPageSize) && parsedPageSize > 0
      ? Math.min(parsedPageSize, MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE;

  return {
    page: resolvedPage,
    pageSize: resolvedPageSize,
    skip: (resolvedPage - 1) * resolvedPageSize,
    take: resolvedPageSize,
  };
}

export function buildPaginatedResponse<T>(data: T[], total: number, page: number, pageSize: number): PaginatedResponse<T> {
  return { data, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/api && npx jest common/paginated-response.spec.ts`
Expected: PASS, 6/6

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/common/paginated-response.ts apps/api/src/common/paginated-response.spec.ts
git commit -m "feat: shared pagination helper for list endpoints"
```

---

### Task 2: Exams backend pagination + search

**Files:**
- Modify: `apps/api/src/exams/exams.controller.ts:26-30`
- Modify: `apps/api/src/exams/exams.service.ts:17-19` (interface), `:119-152` (`list` method)
- Modify: `apps/api/src/exams/exams.service.spec.ts` (existing `list` test needs updating for the new response shape)

**Interfaces:**
- Consumes: `resolvePaginationParams`, `buildPaginatedResponse`, `PaginatedResponse` from Task 1's `apps/api/src/common/paginated-response.ts`.
- Produces: `ExamsService.list()` now returns `Promise<PaginatedResponse<Exam & { invitationCount: number; attemptSettledCount: number; attemptTotalCount: number }>>` instead of a bare array. Task 6 (frontend `useExams`) depends on this exact shape.

- [ ] **Step 1: Find and update the existing `list` test to expect the new shape**

Find the current test in `apps/api/src/exams/exams.service.spec.ts` that calls `service.list(...)` (search for `.list(`). Update its assertions to expect `{ data, total, page, pageSize, totalPages }` instead of a bare array, and mock `tx.exam.count` alongside the existing `tx.exam.findMany` mock (the new implementation calls both). Also add this new test proving search and pagination actually work:

```typescript
it('paginates results and filters by search on title', async () => {
  const tx = {
    exam: {
      findMany: jest.fn().mockResolvedValue([{ id: 'exam-2', title: 'Backend Interview', createdAt: new Date() }]),
      count: jest.fn().mockResolvedValue(1),
    },
    invitation: { groupBy: jest.fn().mockResolvedValue([]) },
    attempt: { groupBy: jest.fn().mockResolvedValue([]) },
  };
  tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

  const result = await service.list(context, { page: '2', pageSize: '1', search: 'Backend' });

  expect(tx.exam.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({ title: { contains: 'Backend' } }),
      skip: 1,
      take: 1,
    }),
  );
  expect(result).toEqual(
    expect.objectContaining({ total: 1, page: 2, pageSize: 1, totalPages: 1 }),
  );
  expect(result.data).toHaveLength(1);
});
```

(Match the existing spec file's mock setup style for `tenantPrisma`/`context` — reuse whatever `beforeEach` already establishes rather than redeclaring it.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && npx jest exams/exams.service.spec.ts`
Expected: FAIL — the updated assertions don't match the current bare-array return shape, and the new search test fails since `search` isn't handled yet.

- [ ] **Step 3: Update `exams.controller.ts`**

```typescript
  @Get()
  @RequireAnyPermission('exam:manage', 'results:view')
  list(
    @CurrentTenant() tenant: TenantContext,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('search') search?: string,
  ) {
    return this.examsService.list(tenant, { status, page, pageSize, search });
  }
```

- [ ] **Step 4: Update `exams.service.ts`**

Add the import at the top of the file:

```typescript
import { resolvePaginationParams, buildPaginatedResponse, PaginatedResponse } from '../common/paginated-response';
```

Update the `ExamFilters` interface (currently `interface ExamFilters { status?: string; }`):

```typescript
interface ExamFilters {
  status?: string;
  page?: string;
  pageSize?: string;
  search?: string;
}
```

Replace the `list` method body:

```typescript
  async list(
    context: TenantContext,
    filters: ExamFilters,
  ): Promise<PaginatedResponse<Exam & { invitationCount: number; attemptSettledCount: number; attemptTotalCount: number }>> {
    const { page, pageSize, skip, take } = resolvePaginationParams(filters.page, filters.pageSize);
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const where = {
        organizationId: context.organizationId as string,
        ...(filters.status ? { status: filters.status } : { status: { not: 'archived' } }),
        ...(filters.search ? { title: { contains: filters.search } } : {}),
      };
      const [exams, total] = await Promise.all([
        tx.exam.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip, take }),
        tx.exam.count({ where }),
      ]);
      const examIds = exams.map((exam) => exam.id);

      const [invitationGroups, attemptGroups] = await Promise.all([
        tx.invitation.groupBy({ by: ['examId'], where: { examId: { in: examIds } }, _count: { _all: true } }),
        tx.attempt.groupBy({ by: ['examId', 'status'], where: { examId: { in: examIds } }, _count: { _all: true } }),
      ]);

      const invitationCountByExam = new Map(invitationGroups.map((group) => [group.examId, group._count._all]));
      const settledByExam = new Map<string, number>();
      const totalByExam = new Map<string, number>();
      for (const group of attemptGroups) {
        totalByExam.set(group.examId, (totalByExam.get(group.examId) ?? 0) + group._count._all);
        if ((SETTLED_ATTEMPT_STATUSES as string[]).includes(group.status)) {
          settledByExam.set(group.examId, (settledByExam.get(group.examId) ?? 0) + group._count._all);
        }
      }

      const data = exams.map((exam) => ({
        ...exam,
        invitationCount: invitationCountByExam.get(exam.id) ?? 0,
        attemptSettledCount: settledByExam.get(exam.id) ?? 0,
        attemptTotalCount: totalByExam.get(exam.id) ?? 0,
      }));
      return buildPaginatedResponse(data, total, page, pageSize);
    });
  }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd apps/api && npx jest exams/exams.service.spec.ts exams/exams.controller.spec.ts`
Expected: PASS. If `exams.controller.spec.ts` doesn't exist or has no test covering `list`, that's fine — this is a controller passthrough with no branching logic, consistent with how `questions.controller.ts`/`candidates.controller.ts`'s equivalent passthroughs aren't separately unit-tested either (their behavior is covered via the service tests + e2e).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/exams/exams.controller.ts apps/api/src/exams/exams.service.ts apps/api/src/exams/exams.service.spec.ts
git commit -m "feat: paginate and add search to GET /exams"
```

---

### Task 3: Questions backend pagination + search (replace cursor)

**Files:**
- Modify: `apps/api/src/questions/questions.controller.ts:55-67`
- Modify: `apps/api/src/questions/questions.service.ts:22-29` (interface), `:82-100` (`list` method)
- Modify: `apps/api/src/questions/questions.service.spec.ts`

**Interfaces:**
- Consumes: `resolvePaginationParams`, `buildPaginatedResponse`, `PaginatedResponse` from Task 1.
- Produces: `QuestionsService.list()` now returns `Promise<PaginatedResponse<QuestionResponse>>`, replacing the `limit`/`cursor` cursor-pagination contract entirely — `limit`/`cursor` params are removed, not kept alongside `page`/`pageSize`. Task 7 (frontend `useQuestions`) depends on this exact shape.

- [ ] **Step 1: Update the existing list test(s) in `questions.service.spec.ts` and add a search/pagination test**

Find the existing test(s) exercising `service.list(...)` with `limit`/`cursor` and update them to use `page`/`pageSize` instead, expecting the new `{ data, total, page, pageSize, totalPages }` shape, mocking `tx.question.count` alongside `tx.question.findMany`. Add:

```typescript
it('paginates and filters by search on question text', async () => {
  const tx = {
    question: {
      findMany: jest.fn().mockResolvedValue([{ id: 'q-2', text: 'Reverse a linked list', options: [], tags: [] }]),
      count: jest.fn().mockResolvedValue(1),
    },
  };
  tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

  const result = await service.list(context, { page: '1', pageSize: '10', search: 'linked list' });

  expect(tx.question.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({ text: { contains: 'linked list' } }),
      skip: 0,
      take: 10,
    }),
  );
  expect(result.total).toBe(1);
  expect(result.data).toHaveLength(1);
});
```

(Match the existing file's mock/import style — reuse its `tenantPrisma`/`context` setup.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && npx jest questions/questions.service.spec.ts`
Expected: FAIL — old tests expect a bare array and `cursor`/`limit` behavior that no longer exists after Step 4; new search test fails since `search` isn't wired yet.

- [ ] **Step 3: Update `questions.controller.ts`**

Replace the `list` method (currently takes `limit`/`cursor`):

```typescript
  @Get()
  @RequirePermissions('question_bank:manage')
  list(
    @CurrentTenant() tenant: TenantContext,
    @Query('topic') topic?: string,
    @Query('difficulty') difficulty?: string,
    @Query('status') status?: string,
    @Query('tagId') tagId?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('search') search?: string,
  ) {
    return this.questionsService.list(tenant, { topic, difficulty, status, tagId, page, pageSize, search });
  }
```

- [ ] **Step 4: Update `questions.service.ts`**

Add the import:

```typescript
import { resolvePaginationParams, buildPaginatedResponse, PaginatedResponse } from '../common/paginated-response';
```

Replace the `QuestionFilters` interface (currently has `limit?: number; cursor?: string;`):

```typescript
interface QuestionFilters {
  topic?: string;
  difficulty?: string;
  status?: string;
  tagId?: string;
  page?: string;
  pageSize?: string;
  search?: string;
}
```

Replace the `list` method body:

```typescript
  async list(context: TenantContext, filters: QuestionFilters): Promise<PaginatedResponse<QuestionResponse>> {
    const { page, pageSize, skip, take } = resolvePaginationParams(filters.page, filters.pageSize);
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const where = {
        organizationId: context.organizationId as string,
        ...(filters.topic ? { topic: filters.topic } : {}),
        ...(filters.difficulty ? { difficulty: filters.difficulty } : {}),
        ...(filters.tagId ? { tags: { some: { tagId: filters.tagId } } } : {}),
        status: filters.status ?? 'active',
        ...(filters.search ? { text: { contains: filters.search } } : {}),
      };
      const [questions, total] = await Promise.all([
        tx.question.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip,
          take,
          include: { tags: { include: { tag: true } } },
        }),
        tx.question.count({ where }),
      ]);
      const data = questions.map((q) => this.toResponse(q as unknown as QuestionWithRelations));
      return buildPaginatedResponse(data, total, page, pageSize);
    });
  }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd apps/api && npx jest questions/questions.service.spec.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/questions/questions.controller.ts apps/api/src/questions/questions.service.ts apps/api/src/questions/questions.service.spec.ts
git commit -m "feat: paginate and add search to GET /questions, replacing unused cursor pagination"
```

---

### Task 4: Candidates backend pagination + search (replace cursor)

**Files:**
- Modify: `apps/api/src/candidates/candidates.controller.ts:23-27`
- Modify: `apps/api/src/candidates/candidates.service.ts:9-12` (interface), `:62-72` (`list` method)
- Modify: `apps/api/src/candidates/candidates.service.spec.ts`

**Interfaces:**
- Consumes: `resolvePaginationParams`, `buildPaginatedResponse`, `PaginatedResponse` from Task 1.
- Produces: `CandidatesService.list()` now returns `Promise<PaginatedResponse<Candidate>>`. Task 8 (frontend `useCandidates`) depends on this exact shape.

- [ ] **Step 1: Update the existing `list` test and add a search/pagination test**

The existing test at `candidates.service.spec.ts` (around the `"lists candidates scoped to the caller's organization"` test) currently does `tenantPrisma.forTenant.mockResolvedValue([{ id: 'cand-1' }])` and asserts `result` has length 1 directly. Update it to match the new shape — `forTenant`'s mock now needs to invoke the callback against a `tx` with both `findMany` and `count`, and the assertion changes to `result.data`:

```typescript
it("lists candidates scoped to the caller's organization", async () => {
  const tx = {
    candidate: {
      findMany: jest.fn().mockResolvedValue([{ id: 'cand-1' }]),
      count: jest.fn().mockResolvedValue(1),
    },
  };
  tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

  const result = await service.list(context, {});

  expect(result.data).toHaveLength(1);
  expect(result.total).toBe(1);
  expect(tenantPrisma.forTenant).toHaveBeenCalledWith(context, expect.any(Function));
});

it('paginates and filters by search on name or email', async () => {
  const tx = {
    candidate: {
      findMany: jest.fn().mockResolvedValue([{ id: 'cand-2', name: 'Alice Smith', email: 'alice@test.com' }]),
      count: jest.fn().mockResolvedValue(1),
    },
  };
  tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

  const result = await service.list(context, { page: '1', pageSize: '10', search: 'alice' });

  expect(tx.candidate.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({
        OR: [{ name: { contains: 'alice' } }, { email: { contains: 'alice' } }],
      }),
      skip: 0,
      take: 10,
    }),
  );
  expect(result.data).toHaveLength(1);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && npx jest candidates/candidates.service.spec.ts`
Expected: FAIL — old-style mock/assertions don't match the new `{data, total, ...}` shape; search test fails since `search` isn't wired yet.

- [ ] **Step 3: Update `candidates.controller.ts`**

```typescript
  @Get()
  @RequirePermissions('candidate:manage')
  list(
    @CurrentTenant() tenant: TenantContext,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('search') search?: string,
  ) {
    return this.candidatesService.list(tenant, { page, pageSize, search });
  }
```

- [ ] **Step 4: Update `candidates.service.ts`**

Add the import:

```typescript
import { resolvePaginationParams, buildPaginatedResponse, PaginatedResponse } from '../common/paginated-response';
```

Replace the `CandidateFilters` interface (currently `{ limit?: number; cursor?: string; }`):

```typescript
interface CandidateFilters {
  page?: string;
  pageSize?: string;
  search?: string;
}
```

Replace the `list` method body:

```typescript
  async list(context: TenantContext, filters: CandidateFilters): Promise<PaginatedResponse<Candidate>> {
    const { page, pageSize, skip, take } = resolvePaginationParams(filters.page, filters.pageSize);
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const where = {
        organizationId: context.organizationId as string,
        ...(filters.search ? { OR: [{ name: { contains: filters.search } }, { email: { contains: filters.search } }] } : {}),
      };
      const [candidates, total] = await Promise.all([
        tx.candidate.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip, take }),
        tx.candidate.count({ where }),
      ]);
      return buildPaginatedResponse(candidates, total, page, pageSize);
    });
  }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd apps/api && npx jest candidates/candidates.service.spec.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/candidates/candidates.controller.ts apps/api/src/candidates/candidates.service.ts apps/api/src/candidates/candidates.service.spec.ts
git commit -m "feat: paginate and add search to GET /candidates, replacing unused cursor pagination"
```

---

### Task 5: Shared frontend Pagination component and type

**Files:**
- Modify: `apps/web/lib/types.ts` (add `PaginatedResponse<T>`)
- Create: `apps/web/components/ui/Pagination.tsx`
- Modify: `apps/web/components/ui/index.ts` (export it)
- Test: `apps/web/components/ui/Pagination.test.tsx`

**Interfaces:**
- Produces: `PaginatedResponse<T>` type (mirrors the backend envelope from Task 1); `Pagination` component with props `{ page: number; totalPages: number; onPageChange: (page: number) => void }`. Tasks 6-8 render this component and consume the type.

- [ ] **Step 1: Add `PaginatedResponse<T>` to `apps/web/lib/types.ts`**

Add near the top of the file, alongside the other shared response-shape types:

```typescript
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
```

- [ ] **Step 2: Write the failing test for `Pagination`**

```typescript
// apps/web/components/ui/Pagination.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { Pagination } from './Pagination';

describe('Pagination', () => {
  it('renders Prev/Next and numbered page buttons, disabling Prev on page 1', () => {
    render(<Pagination page={1} totalPages={3} onPageChange={jest.fn()} />);
    expect(screen.getByRole('button', { name: /prev/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /next/i })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: '2' })).toBeInTheDocument();
  });

  it('disables Next on the last page', () => {
    render(<Pagination page={3} totalPages={3} onPageChange={jest.fn()} />);
    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled();
  });

  it('calls onPageChange with the clicked page number', () => {
    const onPageChange = jest.fn();
    render(<Pagination page={1} totalPages={3} onPageChange={onPageChange} />);
    fireEvent.click(screen.getByRole('button', { name: '2' }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it('calls onPageChange with page - 1 / page + 1 for Prev/Next', () => {
    const onPageChange = jest.fn();
    render(<Pagination page={2} totalPages={3} onPageChange={onPageChange} />);
    fireEvent.click(screen.getByRole('button', { name: /prev/i }));
    expect(onPageChange).toHaveBeenCalledWith(1);
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  it('renders nothing when there is only one page', () => {
    const { container } = render(<Pagination page={1} totalPages={1} onPageChange={jest.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd apps/web && npx jest components/ui/Pagination.test.tsx`
Expected: FAIL with "Cannot find module './Pagination'"

- [ ] **Step 4: Write `Pagination.tsx`**

Follows the same primitive style as `Table.tsx` (plain function component, `clsx` for conditional classes, no external state management):

```typescript
'use client';

import clsx from 'clsx';

interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, totalPages, onPageChange }: PaginationProps) {
  if (totalPages <= 1) return null;

  const pages = Array.from({ length: totalPages }, (_, index) => index + 1);

  return (
    <nav className="mt-3 flex items-center justify-center gap-1" aria-label="Pagination">
      <button
        type="button"
        onClick={() => onPageChange(page - 1)}
        disabled={page === 1}
        className="rounded-md border border-recruiter-border px-2.5 py-1.5 text-sm text-recruiter-text disabled:cursor-not-allowed disabled:opacity-40"
      >
        Prev
      </button>
      {pages.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onPageChange(p)}
          aria-current={p === page ? 'page' : undefined}
          className={clsx(
            'min-w-[2rem] rounded-md px-2.5 py-1.5 text-sm',
            p === page ? 'bg-recruiter-accent text-white' : 'text-recruiter-text hover:bg-recruiter-bg-subtle',
          )}
        >
          {p}
        </button>
      ))}
      <button
        type="button"
        onClick={() => onPageChange(page + 1)}
        disabled={page === totalPages}
        className="rounded-md border border-recruiter-border px-2.5 py-1.5 text-sm text-recruiter-text disabled:cursor-not-allowed disabled:opacity-40"
      >
        Next
      </button>
    </nav>
  );
}
```

Note: `bg-recruiter-accent` is used elsewhere in this codebase's recruiter design tokens (check `apps/web/tailwind.config.js` or an existing primitive like `Button.tsx` if this exact token name doesn't resolve — substitute the equivalent existing accent-color token, don't introduce a new one).

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd apps/web && npx jest components/ui/Pagination.test.tsx`
Expected: PASS, 5/5

- [ ] **Step 6: Export it from the barrel file**

Add to `apps/web/components/ui/index.ts`:

```typescript
export { Pagination } from './Pagination';
```

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/types.ts apps/web/components/ui/Pagination.tsx apps/web/components/ui/Pagination.test.tsx apps/web/components/ui/index.ts
git commit -m "feat: shared Pagination component and PaginatedResponse type"
```

---

### Task 6: Wire up Exams — hook, main list page, and every other caller

**Files:**
- Modify: `apps/web/lib/hooks/useExams.ts:1-13`
- Modify: `apps/web/app/(recruiter)/exams/page.tsx`
- Modify: `apps/web/app/(recruiter)/candidates/page.tsx:15` (the `useExams('published')` dropdown call)
- Modify: `apps/web/app/(recruiter)/candidates/bulk-upload-invite/page.tsx` (same dropdown pattern)
- Modify: `apps/web/app/(panel)/reports/page.tsx`
- Test: `apps/web/app/(recruiter)/exams/page.test.tsx` (existing file — update for the new hook shape)

**Interfaces:**
- Consumes: `PaginatedResponse<ExamListItem>` (Task 5), `Pagination` component (Task 5).
- Produces: `useExams(status?: string, params?: { page?: number; pageSize?: number; search?: string }): UseQueryResult<PaginatedResponse<ExamListItem>>`. This is a breaking change to `useExams`'s return shape — every caller in this task must be updated in the same commit, or the app won't build.

- [ ] **Step 1: Update `useExams` in `apps/web/lib/hooks/useExams.ts`**

Replace the `useExams` function (lines 6-13):

```typescript
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { Exam, ExamListItem, PaginatedResponse } from '../types';
import { useAuth } from '../auth-context';

interface UseExamsParams {
  page?: number;
  pageSize?: number;
  search?: string;
}

function buildExamsQuery(status: string | undefined, params: UseExamsParams): string {
  const query = new URLSearchParams();
  if (status) query.set('status', status);
  if (params.page) query.set('page', String(params.page));
  if (params.pageSize) query.set('pageSize', String(params.pageSize));
  if (params.search) query.set('search', params.search);
  const queryString = query.toString();
  return queryString ? `?${queryString}` : '';
}

export function useExams(status?: string, params: UseExamsParams = {}) {
  const { accessToken } = useAuth();
  return useQuery<PaginatedResponse<ExamListItem>>({
    queryKey: ['exams', status ?? 'default', params],
    queryFn: () => apiFetch(`/exams${buildExamsQuery(status, params)}`, {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}
```

Leave `useExam`, `useCreateExam`, `useUpdateExam`, `usePublishExam`, `useDuplicateExam` (the rest of the file) unchanged — they don't call the list endpoint.

- [ ] **Step 2: Update `apps/web/app/(recruiter)/exams/page.tsx` for pagination + server-side search**

Replace the top of the component (search state, data destructuring, and the filtering line):

```typescript
export default function ExamsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const { data: examsResponse, isLoading, isError } = useExams(undefined, { page, pageSize: 20, search: search || undefined });
  const router = useRouter();
  const { toast } = useToast();
  const duplicateExam = useDuplicateExam();
```

Remove the old `const filtered = (exams ?? []).filter(...)` line entirely — search now happens server-side.

Update the search input's `onChange` to also reset to page 1 (a new search should always start from the first page of results):

```typescript
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
```

Replace the final render (currently `<Table columns={columns} rows={filtered} ... />`) with:

```typescript
      <Table columns={columns} rows={examsResponse?.data ?? []} rowKey={(exam) => exam.id} emptyMessage="No exams yet." />
      <Pagination page={examsResponse?.page ?? 1} totalPages={examsResponse?.totalPages ?? 1} onPageChange={setPage} />
    </div>
  );
}
```

Add `Pagination` to the existing import from `'../../../components/ui'`.

- [ ] **Step 3: Fix the invite-target dropdown callers (need the full list, not one page)**

In `apps/web/app/(recruiter)/candidates/page.tsx`, change:

```typescript
const { data: publishedExams } = useExams('published');
```

to:

```typescript
const { data: publishedExamsResponse } = useExams('published', { pageSize: 100 });
const publishedExams = publishedExamsResponse?.data;
```

(`100` is the server-side max from Task 1 — this raises the effective cap from the previous silently-broken `20` to `100`, matching this platform's realistic-scale assumption; it does not make the dropdown fully unbounded, which is an accepted limitation, not silently glossed over.)

Every other use of `publishedExams` later in the file (the `.length === 1` check, the `<Select>` options mapping) stays as-is — it already treats `publishedExams` as `ExamListItem[] | undefined`, which is still true after this change.

Apply the identical change to `apps/web/app/(recruiter)/candidates/bulk-upload-invite/page.tsx` — find its `useExams('published')` call and apply the same `{ pageSize: 100 }` + `.data` fix.

- [ ] **Step 4: Fix the panel reports exam list**

In `apps/web/app/(panel)/reports/page.tsx`, change:

```typescript
const { data: exams, isLoading, isError } = useExams();
```

to:

```typescript
const { data: examsResponse, isLoading, isError } = useExams(undefined, { pageSize: 100 });
const exams = examsResponse?.data;
```

The rest of the file already reads `exams ?? []` when passing to `Table`'s `rows` — no further change needed there.

- [ ] **Step 5: Update the existing exams page test, and add a test proving search hits the server, not a local filter**

Open `apps/web/app/(recruiter)/exams/page.test.tsx` and find wherever it mocks `useExams`'s return value (likely mocking the query hook to resolve an array). Update the mock to resolve `{ data: [...], total: N, page: 1, pageSize: 20, totalPages: 1 }` instead of a bare array — match whatever mocking convention (`jest.mock('../../../lib/hooks/useExams')` or a test-query-client wrapper) the file already uses; do not introduce a new mocking pattern.

This is exactly the class of bug that shipped silently before (client-side filtering looked correct in every test that only checked "the right rows render," since a mock providing all rows up front makes local filtering and server filtering look identical). Add a test that would fail if `page.tsx` reverted to local `.filter(...)`: mock `useExams` (via whatever module-mock the file already uses) and assert it is called with a `search` value that changes as the user types, proving the query hook — and therefore a real network request — receives the typed text, rather than asserting only on what's rendered:

```typescript
it('passes the typed search text to useExams instead of filtering client-side', () => {
  const useExamsMock = jest.requireMock('../../../lib/hooks/useExams').useExams as jest.Mock;
  render(<ExamsPage />);

  fireEvent.change(screen.getByLabelText('Search exams'), { target: { value: 'onboarding' } });

  expect(useExamsMock).toHaveBeenLastCalledWith(undefined, expect.objectContaining({ search: 'onboarding' }));
});
```

(Adjust the exact mock-access syntax to match this file's existing `jest.mock(...)` setup — the assertion's intent, that `useExams` itself receives the search text as an argument rather than the component filtering its own already-fetched `data`, is what matters.)

- [ ] **Step 6: Run the tests**

Run: `cd apps/web && npx jest exams/page.test.tsx candidates/page.test.tsx candidates/bulk-upload-invite/page.test.tsx`
Expected: PASS. If `(panel)/reports/page.test.tsx` exists, run it too and fix its `useExams` mock the same way.

- [ ] **Step 7: Run TypeScript check to catch any other broken caller**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no new errors beyond this project's existing pre-existing baseline (per this session's established convention, apps/web has had a small number of pre-existing baseline `tsc` errors unrelated to any single feature — confirm the count hasn't grown, don't chase pre-existing ones down). If `tsc` reports an error at any `useExams(...)` call site not covered by Steps 3-4, that's a caller this plan missed — fix it the same way (destructure `.data`).

- [ ] **Step 8: Commit**

```bash
git add apps/web/lib/hooks/useExams.ts apps/web/app/\(recruiter\)/exams/page.tsx apps/web/app/\(recruiter\)/exams/page.test.tsx apps/web/app/\(recruiter\)/candidates/page.tsx apps/web/app/\(recruiter\)/candidates/bulk-upload-invite/page.tsx apps/web/app/\(panel\)/reports/page.tsx
git commit -m "feat: paginated Exams list + fix silent truncation in all other useExams callers"
```

---

### Task 7: Wire up Question Bank — hook, main list page, and SectionQuestionPicker

**Files:**
- Modify: `apps/web/lib/hooks/useQuestions.ts:6-26`
- Modify: `apps/web/app/(recruiter)/questions/page.tsx`
- Modify: `apps/web/components/SectionQuestionPicker.tsx:17`
- Test: `apps/web/app/(recruiter)/questions/page.test.tsx`

**Interfaces:**
- Consumes: `PaginatedResponse<Question>` (Task 5), `Pagination` component (Task 5).
- Produces: `useQuestions(filters?): UseQueryResult<PaginatedResponse<Question>>` — same breaking-change caveat as Task 6.

- [ ] **Step 1: Update `useQuestions` in `apps/web/lib/hooks/useQuestions.ts`**

Replace the `QuestionFilters` interface, `buildQuery`, and `useQuestions` (lines 6-26):

```typescript
interface QuestionFilters {
  difficulty?: Difficulty;
  tagId?: string;
  page?: number;
  pageSize?: number;
  search?: string;
}

function buildQuery(filters: QuestionFilters): string {
  const params = new URLSearchParams();
  if (filters.difficulty) params.set('difficulty', filters.difficulty);
  if (filters.tagId) params.set('tagId', filters.tagId);
  if (filters.page) params.set('page', String(filters.page));
  if (filters.pageSize) params.set('pageSize', String(filters.pageSize));
  if (filters.search) params.set('search', filters.search);
  const query = params.toString();
  return query ? `?${query}` : '';
}

export function useQuestions(filters: QuestionFilters = {}) {
  const { accessToken } = useAuth();
  return useQuery<PaginatedResponse<Question>>({
    queryKey: ['questions', filters],
    queryFn: () => apiFetch(`/questions${buildQuery(filters)}`, {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}
```

Add `PaginatedResponse` to the existing `import { Question, QuestionType, Difficulty, Tag } from '../types';` line.

- [ ] **Step 2: Update `apps/web/app/(recruiter)/questions/page.tsx`**

Same pattern as Task 6 Step 2: add `page` state, pass `{ page, pageSize: 20, search: search || undefined }` to `useQuestions`, remove the client-side `.filter(...)` line, reset `page` to 1 on search change, render `questions?.data` in the `Table` and add a `Pagination` component below it reading `questions?.page`/`questions?.totalPages`.

- [ ] **Step 3: Fix `SectionQuestionPicker.tsx`**

Find the current `const { data: questions } = useQuestions();` call and change it to:

```typescript
const { data: questionsResponse } = useQuestions({ pageSize: 100 });
const questions = questionsResponse?.data;
```

The rest of the component already treats `questions` as `Question[] | undefined` — no further changes needed there.

- [ ] **Step 4: Update the existing questions page test**

Same as Task 6 Step 5 — update `apps/web/app/(recruiter)/questions/page.test.tsx`'s `useQuestions` mock to resolve the new paginated envelope shape, and add the same kind of test Task 6 Step 5 added for Exams: assert `useQuestions` is called with `expect.objectContaining({ search: 'typed text' })` after typing into the search box, proving search reaches the hook (and therefore the server) instead of filtering an already-fetched array.

- [ ] **Step 5: Run the tests**

Run: `cd apps/web && npx jest questions/page.test.tsx`
Expected: PASS. Also run any existing test file for `SectionQuestionPicker` if one exists (`find apps/web -iname "SectionQuestionPicker*.test.tsx"`) and fix its mock the same way.

- [ ] **Step 6: Run TypeScript check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no new errors beyond the pre-existing baseline.

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/hooks/useQuestions.ts apps/web/app/\(recruiter\)/questions/page.tsx apps/web/app/\(recruiter\)/questions/page.test.tsx apps/web/components/SectionQuestionPicker.tsx
git commit -m "feat: paginated Question Bank list + fix silent truncation in SectionQuestionPicker"
```

---

### Task 8: Wire up Candidates — hook and list page

**Files:**
- Modify: `apps/web/lib/hooks/useCandidates.ts:6-13`
- Modify: `apps/web/app/(recruiter)/candidates/page.tsx`
- Test: `apps/web/app/(recruiter)/candidates/page.test.tsx`

**Interfaces:**
- Consumes: `PaginatedResponse<Candidate>` (Task 5), `Pagination` component (Task 5).
- Produces: `useCandidates(params?: { page?: number; pageSize?: number; search?: string }): UseQueryResult<PaginatedResponse<Candidate>>`.
- Note: Task 6 already changed this same file's `useExams('published')` call for the invite dropdown — this task's edits are to the *candidates* data fetch in the same file, a separate hook.

- [ ] **Step 1: Update `useCandidates` in `apps/web/lib/hooks/useCandidates.ts`**

```typescript
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { Candidate, PaginatedResponse } from '../types';
import { useAuth } from '../auth-context';

interface UseCandidatesParams {
  page?: number;
  pageSize?: number;
  search?: string;
}

function buildCandidatesQuery(params: UseCandidatesParams): string {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.pageSize) query.set('pageSize', String(params.pageSize));
  if (params.search) query.set('search', params.search);
  const queryString = query.toString();
  return queryString ? `?${queryString}` : '';
}

export function useCandidates(params: UseCandidatesParams = {}) {
  const { accessToken } = useAuth();
  return useQuery<PaginatedResponse<Candidate>>({
    queryKey: ['candidates', params],
    queryFn: () => apiFetch(`/candidates${buildCandidatesQuery(params)}`, {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}
```

Leave `useCreateCandidate` unchanged.

- [ ] **Step 2: Update `apps/web/app/(recruiter)/candidates/page.tsx`**

Add `page` state, pass `{ page, pageSize: 20, search: search || undefined }` to `useCandidates()`, remove the client-side `.filter(...)` line, reset `page` to 1 on search change, render `candidatesResponse?.data` in `Table` and add `Pagination` below it. This is the same pattern as Task 6 Step 2 and Task 7 Step 2, applied to the candidates data (not the `publishedExams` dropdown data Task 6 already fixed in this same file).

- [ ] **Step 3: Update the existing candidates page test**

Update `apps/web/app/(recruiter)/candidates/page.test.tsx`'s `useCandidates` mock to resolve the paginated envelope, and add the same search-reaches-the-hook test as Task 6 Step 5 / Task 7 Step 4: assert `useCandidates` is called with `expect.objectContaining({ search: 'typed text' })` after typing into the search box. (Its `useExams` mock was already addressed in Task 6.)

- [ ] **Step 4: Run the tests**

Run: `cd apps/web && npx jest candidates/page.test.tsx`
Expected: PASS

- [ ] **Step 5: Run TypeScript check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no new errors beyond the pre-existing baseline.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/hooks/useCandidates.ts apps/web/app/\(recruiter\)/candidates/page.tsx apps/web/app/\(recruiter\)/candidates/page.test.tsx
git commit -m "feat: paginated Candidates list"
```

---

### Task 9: Final verification

**Files:**
- None (verification only).

- [ ] **Step 1: Run the full backend test suite**

Run: `cd apps/api && npx jest`
Expected: all pass, no regressions in files this plan didn't touch.

- [ ] **Step 2: Run the full frontend test suite**

Run: `cd apps/web && npx jest`
Expected: all pass.

- [ ] **Step 3: Run both TypeScript checks one more time**

Run: `cd apps/api && npx tsc --noEmit && cd ../web && npx tsc --noEmit`
Expected: apps/api clean; apps/web at its pre-existing baseline only.

- [ ] **Step 4: Live-verify against the running dev servers that the original bug is actually fixed**

This project's dev servers (api on 3501, exam-runtime on 3502, web on 3002) may still be running from the live UI testing pass that found this bug — reuse them if so, otherwise start them per `.claude/launch.json`. Log in as `recruiter@demo-org.test` / `Passw0rd!2026` (org slug `demo-org`) and confirm, in a real browser, not just via curl:
- The Candidates screen's `GET /candidates` network response now returns a `{ data, total, page, pageSize, totalPages }` envelope with `total` matching the real count (206 in this dev DB as of the original bug report) — and that a `Pagination` control appears and clicking page 2 shows different rows than page 1.
- The Exams screen behaves the same way.
- The Question Bank screen behaves the same way, and that the exam builder's question picker (open any exam's section editor) now lists more than 20 questions if this dev DB has more than 20 active questions.
- Typing into each screen's search box actually triggers a new network request (visible in the browser's network panel) rather than instant client-side filtering.

- [ ] **Step 5: Write the final verification summary**

Record in the task report: full test counts (before/after this plan, confirming no regression in unrelated suites), the live-verification results from Step 4, and confirmation that every caller identified during planning (`exams/page.tsx`, `questions/page.tsx`, `candidates/page.tsx`, `candidates/page.tsx`'s invite dropdown, `candidates/bulk-upload-invite/page.tsx`, `(panel)/reports/page.tsx`, `SectionQuestionPicker.tsx`) was actually updated — cross-check against `grep -rn "useExams(\|useQuestions(\|useCandidates(" apps/web --include=*.tsx` to confirm no caller was missed.
