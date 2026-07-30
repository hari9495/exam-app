# Platform Admin List View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Platform Admin console around a Salesforce-style list view, and give platform admins real per-organization actions: edit, suspend, and soft delete.

**Architecture:** A generic `ListView` shell (object header, action bar, metadata line, search, column chooser, table) is extracted once and adopted by all three Platform Admin tabs. The Organizations list endpoint gains an explicit `select`, the primary admin, and two counts. Suspend and delete both write to the already-existing, currently-unread `Organization.status` column, so no migration is needed anywhere in this plan.

**Tech Stack:** NestJS + Prisma (SQL Server) in `apps/api` and `apps/exam-runtime`; Next.js App Router + React Query + Tailwind in `apps/web`; shared code in `packages/shared`. Tests are Jest, with React Testing Library on the web side.

**Spec:** `docs/superpowers/specs/2026-07-31-platform-admin-list-view-design.md`

## Global Constraints

- **No Prisma migration in this plan.** `Organization.status` already exists as `String @default("active")` and is read by nothing. All three states — `active`, `suspended`, `deleted` — use it.
- **`users`, `exams` and `attempts` are RLS-protected; `organizations` is not.** `OrganizationsService.list()` uses the raw `PrismaService`, which sets no session context. Any query against `user`, `exam` or `attempt` MUST go through `this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) => …)` or it will silently return zero rows.
- **No N+1 against the connection pool.** Every `forTenant` call opens an interactive transaction and holds a pool connection. Counts and admin lookups are one query each across all organizations (`groupBy` / a single `findMany`), never one query per organization.
- **The list response must never contain secrets.** No key matching `/encrypted|hash|certificate|secret/i` may appear in `GET /organizations`.
- **Slug is immutable.** It appears in invitation URLs and SAML entity IDs.
- **Candidate-facing errors must not disclose organization state.** A candidate whose organization is suspended or deleted sees exactly `'This exam is not currently available'` — the same string an unpublished exam produces.
- **All four new/changed platform endpoints require `@RequirePermissions('platform:manage_organizations')`**, matching the existing handlers.
- **Deviation from the spec's mockup, deliberate:** the metadata line reads `N items • Sorted by <Column>` only because Task 4 adds an optional `onSortChange` callback to the shared `Table`. It does not show "Filtered by …" — there are no filter chips in this plan, so the clause would always be absent.

**Task order note:** the spec lists Phase 1 (frontend list view) before Phase 2 (the real columns). This plan inverts them — the backend list shape lands first (Tasks 1–2) so the frontend builds every column once, rather than building a table and immediately widening it.

## Coordination with the Staff Users console

A second workstream is running concurrently on this branch: **Staff Users Admin Console**
(`docs/superpowers/plans/2026-07-31-staff-users-admin-console.md`, ledger at
`.superpowers/sdd/progress.md`). It is also Salesforce-styled, for the `/users` page. As of
2026-07-31 its Tasks 1–4 are complete and all four were backend-only; no frontend exists on
either side. The two plans were reconciled at that point.

**This plan owns the shared shell.** `ListView`, `RowActions` and the `Table`
`onSortChange` callback are built here (Tasks 4–6) and consumed by four pages: the three
`(platform)` tabs and the staff users page. That plan's Task 11 was amended to render
`ListView` rather than build a second table, and carries a BLOCKED instruction if
`ListView` is not yet present.

Two consequences for execution:

1. **Tasks 4, 5 and 6 are on another team's critical path.** They are frontend-only and
   depend on nothing else in this plan, so they can run before Tasks 1–3 if the staff-users
   workstream reaches its Task 11 first. Nothing else here needs reordering.
2. **`apps/api/src/auth/auth.service.ts` and `auth.controller.ts` have two writers.** That
   plan adds per-*user* deactivation guards; this plan's Task 12 adds per-*organization*
   suspension guards, in the same functions. Task 12 quotes the file as of commit
   `1177461`. Re-read before editing — an exact-match edit against a stale quote is how one
   of the two guards gets silently deleted.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `apps/api/src/organizations/organizations.service.ts` | List query: `select`, primary admin, counts. Edit, status, delete. | 1, 2, 9, 11, 14 |
| `apps/api/src/organizations/organizations.controller.ts` | Three new routes. | 9, 11, 14 |
| `apps/api/src/organizations/dto/update-organization.dto.ts` (new) | `UpdateOrganizationDto`, `UpdateOrganizationStatusDto`. | 9, 11 |
| `packages/shared/src/organizations/organization-status.ts` (new) | `isOrganizationActive`, the shared status constants. Both apps import it. | 11 |
| `apps/api/src/auth/auth.service.ts` | Suspend guard on password login and refresh rotation. | 12 |
| `apps/api/src/auth/auth.controller.ts` | Suspend guard on SSO exchange. | 12 |
| `apps/exam-runtime/src/candidate-auth/candidate-auth.service.ts` | Suspend guard on invite redemption. | 12 |
| `apps/web/components/ui/Table.tsx` | Additive `onSortChange` prop. | 4 |
| `apps/web/app/(platform)/components/ListView.tsx` (new) | The shell. Generic over row type. Owns search + column visibility. | 5 |
| `apps/web/app/(platform)/components/RowActions.tsx` (new) | The per-row `▾` menu. | 6 |
| `apps/web/app/(platform)/organizations/CreateOrganizationModal.tsx` (new) | The current inline create form, moved into a modal. | 7 |
| `apps/web/app/(platform)/organizations/EditOrganizationModal.tsx` (new) | Name + region edit. | 10 |
| `apps/web/app/(platform)/organizations/DeleteOrganizationDialog.tsx` (new) | Typed-slug confirmation. | 15 |
| `apps/web/app/(platform)/organizations/page.tsx` | Composes the above. Drops `CardGrid` and `Pagination`. | 8, 10, 13, 15 |
| `apps/web/lib/hooks/useOrganizations.ts` | `pageSize: 200`; update, status and delete mutations. | 3, 9, 11, 14 |
| `apps/web/lib/types.ts` | `Organization` widened. | 3 |
| `apps/web/app/(platform)/platform-admins/page.tsx` | Adopts `ListView`. | 16 |
| `apps/web/app/(platform)/all-users/page.tsx` | Adopts `ListView`; reads `?org=` from the URL. | 16 |

---

### Task 1: Stop `GET /organizations` returning encrypted secrets

`OrganizationsService.list()` calls `findMany` with no `select`, so the controller returns every scalar column — including `smtpPasswordEncrypted`, `aiApiKeyEncrypted`, `apiKeyHash`, `webhookSecretEncrypted` and `samlIdpCertificate` — to the browser on every platform-admin page load. This is a standalone security fix and does not depend on any other task.

**Files:**
- Modify: `apps/api/src/organizations/organizations.service.ts:146-156`
- Test: `apps/api/src/organizations/organizations.service.spec.ts`

**Interfaces:**
- Produces: `OrganizationListItem` — `{ id: string; name: string; slug: string; region: string; status: string; createdAt: Date }`, exported from `organizations.service.ts`. Task 2 widens it.
- Produces: `list()` returns `Promise<PaginatedResponse<OrganizationListItem>>`.

- [ ] **Step 1: Write the failing test**

The prisma mock in this spec file returns whatever it is told, so asserting on the *response* would only test the mock. Assert on the **call** instead — that is the real contract.

Add to `apps/api/src/organizations/organizations.service.spec.ts`, inside the top-level `describe('OrganizationsService', …)`:

```ts
  describe('list', () => {
    it('selects only non-sensitive columns', async () => {
      prisma.organization.findMany.mockResolvedValue([]);
      prisma.organization.count.mockResolvedValue(0);

      await service.list({});

      const select = prisma.organization.findMany.mock.calls[0][0].select;
      expect(select).toEqual({
        id: true,
        name: true,
        slug: true,
        region: true,
        status: true,
        createdAt: true,
      });
      for (const key of Object.keys(select)) {
        expect(key).not.toMatch(/encrypted|hash|certificate|secret/i);
      }
    });
  });
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx jest --config apps/api/jest.config.js -t "selects only non-sensitive columns" --maxWorkers=2`

Expected: FAIL — `select` is `undefined`, so `Object.keys(undefined)` throws `TypeError`.

- [ ] **Step 3: Add the explicit select**

In `apps/api/src/organizations/organizations.service.ts`, add above the class:

```ts
const ORGANIZATION_LIST_SELECT = {
  id: true,
  name: true,
  slug: true,
  region: true,
  status: true,
  createdAt: true,
} as const;

export interface OrganizationListItem {
  id: string;
  name: string;
  slug: string;
  region: string;
  status: string;
  createdAt: Date;
}
```

Replace the body of `list()` (currently lines 146-156) with:

```ts
  async list(filters: { page?: string; pageSize?: string; search?: string } = {}): Promise<PaginatedResponse<OrganizationListItem>> {
    const { page, pageSize, skip, take } = resolvePaginationParams(filters.page, filters.pageSize);
    const where = filters.search
      ? { OR: [{ name: { contains: filters.search } }, { slug: { contains: filters.search } }] }
      : {};
    const [organizations, total] = await Promise.all([
      this.prisma.organization.findMany({ where, select: ORGANIZATION_LIST_SELECT, orderBy: { createdAt: 'desc' }, skip, take }),
      this.prisma.organization.count({ where }),
    ]);
    return buildPaginatedResponse(organizations, total, page, pageSize);
  }
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npx jest --config apps/api/jest.config.js -t "selects only non-sensitive columns" --maxWorkers=2`

Expected: PASS

- [ ] **Step 5: Run the whole organizations suite for regressions**

Run: `npx jest --config apps/api/jest.config.js organizations.service --maxWorkers=2`

Expected: all tests pass. If any existing test asserted on a field now excluded by the select, that test was asserting on leaked data — remove the assertion, do not widen the select.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/organizations/organizations.service.ts apps/api/src/organizations/organizations.service.spec.ts
git commit -m "fix: stop returning encrypted org secrets from GET /organizations"
```

---

### Task 2: Add primary admin and user/exam counts to the list

**Files:**
- Modify: `apps/api/src/organizations/organizations.service.ts` (the `list()` method and `OrganizationListItem` from Task 1)
- Test: `apps/api/src/organizations/organizations.service.spec.ts`

**Interfaces:**
- Consumes: `ORGANIZATION_LIST_SELECT` and `OrganizationListItem` from Task 1.
- Produces: `OrganizationListItem` widened with `primaryAdminName: string | null`, `primaryAdminEmail: string | null`, `userCount: number`, `examCount: number`.

**Critical:** `users` and `exams` are RLS-protected and `this.prisma` sets no session context — a raw query returns zero rows for every organization with no error. All three lookups go through `this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, …)`. All three are single queries across all organizations, never one per organization.

- [ ] **Step 1: Extend the prisma mock**

In `apps/api/src/organizations/organizations.service.spec.ts`, the `prisma` mock object declared in `beforeEach` needs `user` and `exam`. Update the type declaration and the assignment:

```ts
  let prisma: {
    organization: { findUnique: jest.Mock; create: jest.Mock; update: jest.Mock; findMany: jest.Mock; count: jest.Mock };
    plan: { findFirst: jest.Mock };
    webhookDelivery: { findMany: jest.Mock };
    user: { findMany: jest.Mock; groupBy: jest.Mock };
    exam: { groupBy: jest.Mock };
  };
```

```ts
    prisma = {
      organization: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), findMany: jest.fn(), count: jest.fn() },
      plan: { findFirst: jest.fn() },
      webhookDelivery: { findMany: jest.fn() },
      user: { findMany: jest.fn(), groupBy: jest.fn() },
      exam: { groupBy: jest.fn() },
    };
```

- [ ] **Step 2: Write the failing tests**

Add inside the `describe('list', …)` block created in Task 1:

```ts
    function seedListMocks() {
      prisma.organization.findMany.mockResolvedValue([
        { id: 'org-1', name: 'Acme', slug: 'acme', region: 'us', status: 'active', createdAt: new Date('2026-01-01') },
        { id: 'org-2', name: 'Beta', slug: 'beta', region: 'eu', status: 'active', createdAt: new Date('2026-01-02') },
      ]);
      prisma.organization.count.mockResolvedValue(2);
      prisma.user.findMany.mockResolvedValue([
        { organizationId: 'org-1', name: 'Ada', email: 'ada@acme.test', createdAt: new Date('2026-01-01') },
        { organizationId: 'org-1', name: 'Bob', email: 'bob@acme.test', createdAt: new Date('2026-02-01') },
      ]);
      prisma.user.groupBy.mockResolvedValue([{ organizationId: 'org-1', _count: { _all: 5 } }]);
      prisma.exam.groupBy.mockResolvedValue([{ organizationId: 'org-1', _count: { _all: 3 } }]);
      // forTenant runs its callback against the mocked client.
      tenantPrisma.forTenant.mockImplementation((_ctx: unknown, fn: (tx: unknown) => unknown) => fn(prisma));
    }

    it('returns the earliest org_admin as the primary admin', async () => {
      seedListMocks();

      const result = await service.list({});

      expect(result.data[0]).toMatchObject({
        id: 'org-1',
        primaryAdminName: 'Ada',
        primaryAdminEmail: 'ada@acme.test',
      });
    });

    it('returns null primary admin for an organization with no org_admin', async () => {
      seedListMocks();

      const result = await service.list({});

      expect(result.data[1]).toMatchObject({
        id: 'org-2',
        primaryAdminName: null,
        primaryAdminEmail: null,
      });
    });

    it('returns user and exam counts, defaulting to zero', async () => {
      seedListMocks();

      const result = await service.list({});

      expect(result.data[0]).toMatchObject({ userCount: 5, examCount: 3 });
      expect(result.data[1]).toMatchObject({ userCount: 0, examCount: 0 });
    });

    it('issues a constant number of queries regardless of organization count', async () => {
      seedListMocks();
      prisma.organization.findMany.mockResolvedValue(
        Array.from({ length: 25 }, (_, i) => ({
          id: `org-${i}`, name: `Org ${i}`, slug: `org-${i}`, region: 'us', status: 'active', createdAt: new Date('2026-01-01'),
        })),
      );

      await service.list({});

      expect(prisma.user.groupBy).toHaveBeenCalledTimes(1);
      expect(prisma.exam.groupBy).toHaveBeenCalledTimes(1);
      expect(prisma.user.findMany).toHaveBeenCalledTimes(1);
    });

    it('reads RLS-protected tables through the super-admin bypass', async () => {
      seedListMocks();

      await service.list({});

      expect(tenantPrisma.forTenant).toHaveBeenCalledWith(
        { organizationId: null, isSuperAdmin: true },
        expect.any(Function),
      );
    });
```

- [ ] **Step 3: Run the tests and verify they fail**

Run: `npx jest --config apps/api/jest.config.js organizations.service -t "list" --maxWorkers=2`

Expected: FAIL — `primaryAdminName`, `userCount` and `examCount` are all `undefined`; `prisma.user.groupBy` was never called.

- [ ] **Step 4: Implement**

In `apps/api/src/organizations/organizations.service.ts`, widen the interface added in Task 1:

```ts
export interface OrganizationListItem {
  id: string;
  name: string;
  slug: string;
  region: string;
  status: string;
  createdAt: Date;
  primaryAdminName: string | null;
  primaryAdminEmail: string | null;
  userCount: number;
  examCount: number;
}
```

Replace `list()` with:

```ts
  async list(filters: { page?: string; pageSize?: string; search?: string } = {}): Promise<PaginatedResponse<OrganizationListItem>> {
    const { page, pageSize, skip, take } = resolvePaginationParams(filters.page, filters.pageSize);
    const where = filters.search
      ? { OR: [{ name: { contains: filters.search } }, { slug: { contains: filters.search } }] }
      : {};
    const [organizations, total] = await Promise.all([
      this.prisma.organization.findMany({ where, select: ORGANIZATION_LIST_SELECT, orderBy: { createdAt: 'desc' }, skip, take }),
      this.prisma.organization.count({ where }),
    ]);

    const organizationIds = organizations.map((org) => org.id);
    // `users` and `exams` carry RLS policies and `this.prisma` sets no session
    // context, so a direct query here returns zero rows for every organization
    // without raising -- the counts would silently all read 0. One bypass
    // transaction covers all three reads; issuing them per organization would
    // hold 3N pool connections, and the pool is this platform's known ceiling.
    const { admins, userCounts, examCounts } = await this.tenantPrisma.forTenant(
      { organizationId: null, isSuperAdmin: true },
      async (tx) => ({
        admins: await tx.user.findMany({
          where: { organizationId: { in: organizationIds }, role: 'org_admin' },
          select: { organizationId: true, name: true, email: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        }),
        userCounts: await tx.user.groupBy({
          by: ['organizationId'],
          where: { organizationId: { in: organizationIds } },
          _count: { _all: true },
        }),
        examCounts: await tx.exam.groupBy({
          by: ['organizationId'],
          where: { organizationId: { in: organizationIds } },
          _count: { _all: true },
        }),
      }),
    );

    // `admins` is ordered by createdAt ascending, so the first entry seen for an
    // organization is its earliest org_admin.
    const primaryAdmins = new Map<string, { name: string | null; email: string }>();
    for (const admin of admins) {
      if (admin.organizationId && !primaryAdmins.has(admin.organizationId)) {
        primaryAdmins.set(admin.organizationId, { name: admin.name, email: admin.email });
      }
    }
    const userCountByOrg = new Map(userCounts.map((row) => [row.organizationId, row._count._all]));
    const examCountByOrg = new Map(examCounts.map((row) => [row.organizationId, row._count._all]));

    const items: OrganizationListItem[] = organizations.map((org) => ({
      ...org,
      primaryAdminName: primaryAdmins.get(org.id)?.name ?? null,
      primaryAdminEmail: primaryAdmins.get(org.id)?.email ?? null,
      userCount: userCountByOrg.get(org.id) ?? 0,
      examCount: examCountByOrg.get(org.id) ?? 0,
    }));

    return buildPaginatedResponse(items, total, page, pageSize);
  }
```

- [ ] **Step 5: Run the tests and verify they pass**

Run: `npx jest --config apps/api/jest.config.js organizations.service --maxWorkers=2`

Expected: all pass, including Task 1's select test — `ORGANIZATION_LIST_SELECT` is unchanged.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/organizations/organizations.service.ts apps/api/src/organizations/organizations.service.spec.ts
git commit -m "feat: return primary admin and user/exam counts from GET /organizations"
```

---

### Task 3: Widen the frontend Organization type and fetch every organization

**Files:**
- Modify: `apps/web/lib/types.ts:173-179`
- Modify: `apps/web/lib/hooks/useOrganizations.ts`
- Test: `apps/web/lib/hooks/useOrganizations.test.ts` (create)

**Interfaces:**
- Consumes: the `OrganizationListItem` shape from Task 2.
- Produces: the widened `Organization` interface, and `ORGANIZATION_PAGE_SIZE = 200` exported from `useOrganizations.ts`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/lib/hooks/useOrganizations.test.ts`:

```ts
import { renderHook, waitFor } from '@testing-library/react';
import { ReactNode } from 'react';
import { useOrganizations, ORGANIZATION_PAGE_SIZE } from './useOrganizations';
import { AuthProvider } from '../auth-context';
import { QueryProvider } from '../query-provider';
import { fakeJwt } from '../test-utils/fake-jwt';

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryProvider>
      <AuthProvider>{children}</AuthProvider>
    </QueryProvider>
  );
}

describe('useOrganizations', () => {
  it('requests every organization in one page', async () => {
    const token = fakeJwt({ sub: 'u1', organizationId: null, role: 'super_admin' });
    const fetchMock = jest.fn(async (url: string) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: token }), { status: 200 });
      }
      return new Response(JSON.stringify({ data: [], total: 0, page: 1, pageSize: 200, totalPages: 1 }), { status: 200 });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    renderHook(() => useOrganizations(), { wrapper });

    await waitFor(() => {
      const listCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/organizations'));
      expect(listCall).toBeDefined();
      expect(String(listCall![0])).toContain(`pageSize=${ORGANIZATION_PAGE_SIZE}`);
    });
    expect(ORGANIZATION_PAGE_SIZE).toBe(200);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx jest --config apps/web/jest.config.js useOrganizations --maxWorkers=2`

Expected: FAIL — `ORGANIZATION_PAGE_SIZE` is not exported.

- [ ] **Step 3: Widen the type**

In `apps/web/lib/types.ts`, replace the `Organization` interface at lines 173-179:

Do not declare an `OrganizationStatus` alias here — Task 11 exports one from `@exam-platform/shared` with a third member (`'deleted'`), and two same-named types with different members is exactly the confusion that produces a wrong guard later. Deleted organizations never reach the client, so inline the two-member union:

```ts
export interface Organization {
  id: string;
  name: string;
  slug: string;
  region: string;
  status: 'active' | 'suspended';
  createdAt: string;
  primaryAdminName: string | null;
  primaryAdminEmail: string | null;
  userCount: number;
  examCount: number;
}
```

- [ ] **Step 4: Default the hook to one large page**

In `apps/web/lib/hooks/useOrganizations.ts`, add the export and default:

```ts
// Under ~50 organizations, fetching everything lets the browser sort and filter
// the whole list. Sorting a paginated slice would sort only the visible page,
// which reads as a broken sort. If `total` ever exceeds what came back, the
// page says so rather than silently showing a subset.
export const ORGANIZATION_PAGE_SIZE = 200;
```

and change `useOrganizations` to default `pageSize`:

```ts
export function useOrganizations(params: UseOrganizationsParams = {}) {
  const { accessToken } = useAuth();
  const resolved = { pageSize: ORGANIZATION_PAGE_SIZE, ...params };
  return useQuery<PaginatedResponse<Organization>>({
    queryKey: ['organizations', resolved],
    queryFn: () => apiFetch(`/organizations${buildOrganizationsQuery(resolved)}`, {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}
```

- [ ] **Step 5: Run the test and verify it passes**

Run: `npx jest --config apps/web/jest.config.js useOrganizations --maxWorkers=2`

Expected: PASS

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit -p apps/web/tsconfig.json`

Expected: errors only in `apps/web/app/(platform)/organizations/page.tsx` and its test if they construct `Organization` literals without the new required fields. Fix those literals by adding `status: 'active'`, `primaryAdminName: null`, `primaryAdminEmail: null`, `userCount: 0`, `examCount: 0`. Do not make the new fields optional.

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/types.ts apps/web/lib/hooks/useOrganizations.ts apps/web/lib/hooks/useOrganizations.test.ts "apps/web/app/(platform)/organizations/page.test.tsx"
git commit -m "feat: widen Organization type and fetch the full list in one page"
```

---

### Task 4: Let `Table` report its sort state

`ListView`'s metadata line needs to say `Sorted by Name`, but sort state lives inside `Table`. This adds one optional callback. It is purely additive — every existing `Table` consumer keeps working untouched.

**Files:**
- Modify: `apps/web/components/ui/Table.tsx`
- Test: `apps/web/components/ui/Table.test.tsx` (create if absent; otherwise extend)

**Interfaces:**
- Produces: `TableProps<T>.onSortChange?: (sort: { key: string; header: string; direction: 'asc' | 'desc' } | null) => void`, invoked whenever the user changes the sort.

- [ ] **Step 1: Write the failing test**

Add to `apps/web/components/ui/Table.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Table } from './Table';

describe('Table onSortChange', () => {
  const columns = [
    { key: 'name', header: 'Name', render: (r: { name: string }) => r.name, sortValue: (r: { name: string }) => r.name },
    { key: 'plain', header: 'Plain', render: () => 'x' },
  ];
  const rows = [{ name: 'b' }, { name: 'a' }];

  it('reports the column and direction as the user cycles the sort', async () => {
    const onSortChange = jest.fn();
    render(<Table columns={columns} rows={rows} rowKey={(r) => r.name} onSortChange={onSortChange} />);

    await userEvent.click(screen.getByRole('button', { name: /Name/ }));
    expect(onSortChange).toHaveBeenLastCalledWith({ key: 'name', header: 'Name', direction: 'asc' });

    await userEvent.click(screen.getByRole('button', { name: /Name/ }));
    expect(onSortChange).toHaveBeenLastCalledWith({ key: 'name', header: 'Name', direction: 'desc' });
  });

  it('does not fire for a column with no sortValue', async () => {
    const onSortChange = jest.fn();
    render(<Table columns={columns} rows={rows} rowKey={(r) => r.name} onSortChange={onSortChange} />);

    await userEvent.click(screen.getByText('Plain'));

    expect(onSortChange).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx jest --config apps/web/jest.config.js components/ui/Table --maxWorkers=2`

Expected: FAIL — `onSortChange` is never called.

- [ ] **Step 3: Implement**

In `apps/web/components/ui/Table.tsx`, add to `TableProps<T>`:

```ts
  onSortChange?: (sort: { key: string; header: string; direction: 'asc' | 'desc' } | null) => void;
```

Add `onSortChange` to the destructured props, and replace `handleSort` with:

```tsx
  function handleSort(column: Column<T>) {
    if (!column.sortValue) return;
    const nextDir = sortKey === column.key && sortDir === 'asc' ? 'desc' : 'asc';
    setSortKey(column.key);
    setSortDir(nextDir);
    onSortChange?.({ key: column.key, header: column.header, direction: nextDir });
  }
```

This preserves the existing behaviour exactly: clicking the active column toggles direction, clicking a new column selects it ascending.

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npx jest --config apps/web/jest.config.js components/ui/Table --maxWorkers=2`

Expected: PASS

- [ ] **Step 5: Verify no existing Table consumer regressed**

Run: `npx jest --config apps/web/jest.config.js --maxWorkers=2`

Expected: the full web suite passes. Run with `--maxWorkers=2`; higher concurrency on this machine causes unrelated suites to fail on resource contention.

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/ui/Table.tsx apps/web/components/ui/Table.test.tsx
git commit -m "feat: add optional onSortChange callback to Table"
```

---

### Task 5: The `ListView` shell

**Files:**
- Create: `apps/web/app/(platform)/components/ListView.tsx`
- Test: `apps/web/app/(platform)/components/ListView.test.tsx`

**Interfaces:**
- Consumes: `Table`, `Column` and the `onSortChange` prop from Task 4; `Input`, `Button`, `DropdownMenu*` from `apps/web/components/ui`.
- Produces:

```ts
interface ListViewProps<T> {
  title: string;
  icon: ReactNode;
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  searchMatch: (row: T, query: string) => boolean;
  storageKey: string;
  actions?: ReactNode;
  filters?: ReactNode;
  defaultHiddenColumns?: string[];
  searchPlaceholder?: string;
  emptyMessage?: string;
  isLoading?: boolean;
  isError?: boolean;
  totalCount?: number;
}
export function ListView<T>(props: ListViewProps<T>): JSX.Element;
```

`searchMatch` receives the query already lowercased and trimmed. `storageKey` namespaces column visibility in `localStorage`. `totalCount` is the server-reported total; when it exceeds `rows.length`, the metadata line says so rather than implying the list is complete.

`filters` renders caller-supplied controls beside the search box. `ListView` does **not** own filter state — the caller filters `rows` before passing them in. A generic filter model would have to know each page's field names and value sets; a slot costs one prop and no coupling. This slot exists because the Staff Users console (`docs/superpowers/plans/2026-07-31-staff-users-admin-console.md`, Task 11) needs Role and Status dropdowns here.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/app/(platform)/components/ListView.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Building2 } from 'lucide-react';
import { ListView } from './ListView';

interface Row {
  id: string;
  name: string;
  region: string;
}

const rows: Row[] = [
  { id: '1', name: 'Acme', region: 'us' },
  { id: '2', name: 'Beta', region: 'eu' },
];

const columns = [
  { key: 'name', header: 'Name', render: (r: Row) => r.name, sortValue: (r: Row) => r.name },
  { key: 'region', header: 'Region', render: (r: Row) => r.region, sortValue: (r: Row) => r.region },
];

function renderListView(overrides: Partial<React.ComponentProps<typeof ListView<Row>>> = {}) {
  return render(
    <ListView<Row>
      title="Organizations"
      icon={<Building2 />}
      columns={columns}
      rows={rows}
      rowKey={(r) => r.id}
      searchMatch={(r, q) => r.name.toLowerCase().includes(q)}
      storageKey="test-list"
      {...overrides}
    />,
  );
}

beforeEach(() => localStorage.clear());

describe('ListView', () => {
  it('shows the item count', () => {
    renderListView();
    expect(screen.getByText(/2 items/)).toBeInTheDocument();
  });

  it('filters rows by the search box and updates the count', async () => {
    renderListView();

    await userEvent.type(screen.getByPlaceholderText('Search…'), 'acme');

    expect(screen.getByText('Acme')).toBeInTheDocument();
    expect(screen.queryByText('Beta')).not.toBeInTheDocument();
    expect(screen.getByText(/1 item(?!s)/)).toBeInTheDocument();
  });

  it('names the sorted column once the user sorts', async () => {
    renderListView();

    await userEvent.click(screen.getByRole('button', { name: /Name/ }));

    expect(screen.getByText(/Sorted by Name/)).toBeInTheDocument();
  });

  it('hides columns listed in defaultHiddenColumns and restores them from the chooser', async () => {
    renderListView({ defaultHiddenColumns: ['region'] });

    expect(screen.queryByRole('button', { name: /Region/ })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Choose columns' }));
    await userEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Region' }));

    expect(screen.getByRole('button', { name: /Region/ })).toBeInTheDocument();
  });

  it('persists column visibility across remounts', async () => {
    const { unmount } = renderListView();

    await userEvent.click(screen.getByRole('button', { name: 'Choose columns' }));
    await userEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Region' }));
    unmount();
    renderListView();

    expect(screen.queryByRole('button', { name: /Region/ })).not.toBeInTheDocument();
  });

  it('warns when the server has more rows than were fetched', () => {
    renderListView({ totalCount: 250 });
    expect(screen.getByText(/showing 2 of 250/i)).toBeInTheDocument();
  });

  it('does not warn when the fetched rows are the whole set', () => {
    renderListView({ totalCount: 2 });
    expect(screen.queryByText(/showing 2 of/i)).not.toBeInTheDocument();
  });

  it('renders the action bar', () => {
    renderListView({ actions: <button type="button">New</button> });
    expect(screen.getByRole('button', { name: 'New' })).toBeInTheDocument();
  });

  it('renders caller-supplied filters beside the search box', () => {
    renderListView({ filters: <button type="button">Role: All</button> });
    expect(screen.getByRole('button', { name: 'Role: All' })).toBeInTheDocument();
  });

  it('counts the rows it was given, so a caller-side filter is reflected', () => {
    // Filtering is the caller's job; the count must follow `rows`, not some
    // internal unfiltered copy, or a filtered page would report the wrong total.
    renderListView({ rows: [rows[0]] });
    expect(screen.getByText(/1 item(?!s)/)).toBeInTheDocument();
  });

  it('shows an error message instead of the table when isError', () => {
    renderListView({ isError: true });
    expect(screen.getByRole('alert')).toHaveTextContent('Failed to load Organizations.');
    expect(screen.queryByText('Acme')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npx jest --config apps/web/jest.config.js ListView --maxWorkers=2`

Expected: FAIL — `Cannot find module './ListView'`.

- [ ] **Step 3: Implement `ListView`**

Create `apps/web/app/(platform)/components/ListView.tsx`:

```tsx
'use client';

import { ReactNode, useEffect, useMemo, useState } from 'react';
import { Settings2 } from 'lucide-react';
import {
  Table,
  type Column,
  Input,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
} from '../../../components/ui';

interface ListViewProps<T> {
  title: string;
  icon: ReactNode;
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** `query` arrives already lowercased and trimmed, and is never empty. */
  searchMatch: (row: T, query: string) => boolean;
  storageKey: string;
  actions?: ReactNode;
  /** Caller-supplied filter controls, rendered beside the search box. The caller
   *  filters `rows` itself — ListView holds no filter state. */
  filters?: ReactNode;
  defaultHiddenColumns?: string[];
  searchPlaceholder?: string;
  emptyMessage?: string;
  isLoading?: boolean;
  isError?: boolean;
  /** Server-reported total. When it exceeds `rows.length`, the shortfall is stated. */
  totalCount?: number;
}

function readHiddenColumns(storageKey: string, fallback: string[]): string[] {
  if (typeof window === 'undefined') return fallback;
  const raw = window.localStorage.getItem(`listview:${storageKey}:hidden`);
  if (raw === null) return fallback;
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : fallback;
  } catch {
    // A hand-edited or half-written value must not blank the whole console.
    return fallback;
  }
}

export function ListView<T>({
  title,
  icon,
  columns,
  rows,
  rowKey,
  searchMatch,
  storageKey,
  actions,
  filters,
  defaultHiddenColumns = [],
  searchPlaceholder = 'Search…',
  emptyMessage = 'Nothing here yet.',
  isLoading = false,
  isError = false,
  totalCount,
}: ListViewProps<T>) {
  const [search, setSearch] = useState('');
  const [hidden, setHidden] = useState<string[]>(defaultHiddenColumns);
  const [sort, setSort] = useState<{ key: string; header: string; direction: 'asc' | 'desc' } | null>(null);

  // Read on mount rather than in useState's initializer: this component renders
  // on the server too, where localStorage does not exist, and seeding state from
  // it directly would make the first client render disagree with the server's.
  useEffect(() => {
    setHidden(readHiddenColumns(storageKey, defaultHiddenColumns));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- defaultHiddenColumns is a literal at every call site; depending on it would re-read on every render
  }, [storageKey]);

  function toggleColumn(key: string) {
    setHidden((current) => {
      const next = current.includes(key) ? current.filter((k) => k !== key) : [...current, key];
      window.localStorage.setItem(`listview:${storageKey}:hidden`, JSON.stringify(next));
      return next;
    });
  }

  const visibleColumns = useMemo(() => columns.filter((c) => !hidden.includes(c.key)), [columns, hidden]);

  const query = search.trim().toLowerCase();
  const visibleRows = useMemo(() => (query ? rows.filter((row) => searchMatch(row, query)) : rows), [rows, query, searchMatch]);

  const truncated = totalCount !== undefined && totalCount > rows.length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-gray-900">
          <span aria-hidden="true">{icon}</span>
          {title}
        </h1>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-recruiter-border pb-2">
        <p className="text-xs text-recruiter-text-tertiary">
          {visibleRows.length} {visibleRows.length === 1 ? 'item' : 'items'}
          {sort && ` • Sorted by ${sort.header}`}
          {truncated && ` • showing ${rows.length} of ${totalCount} — narrow your search to see the rest`}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {filters}
          <Input label="" placeholder={searchPlaceholder} value={search} onChange={setSearch} />
          <DropdownMenu>
            <DropdownMenuTrigger aria-label="Choose columns" className="rounded border border-recruiter-border p-2">
              <Settings2 size={16} />
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {columns.map((column) => (
                <label
                  key={column.key}
                  role="menuitemcheckbox"
                  aria-checked={!hidden.includes(column.key)}
                  aria-label={column.header}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-recruiter-bg-subtle"
                >
                  <input
                    type="checkbox"
                    checked={!hidden.includes(column.key)}
                    onChange={() => toggleColumn(column.key)}
                  />
                  {column.header}
                </label>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {isLoading && <p className="text-sm text-gray-500">Loading…</p>}
      {isError && (
        <p role="alert" className="text-sm text-status-danger">
          Failed to load {title}.
        </p>
      )}
      {!isLoading && !isError && (
        <Table
          columns={visibleColumns}
          rows={visibleRows}
          rowKey={rowKey}
          emptyMessage={query ? 'No matches.' : emptyMessage}
          onSortChange={setSort}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npx jest --config apps/web/jest.config.js ListView --maxWorkers=2`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/(platform)/components/ListView.tsx" "apps/web/app/(platform)/components/ListView.test.tsx"
git commit -m "feat: add generic ListView shell for platform admin tabs"
```

---

### Task 6: The `RowActions` menu

**Files:**
- Create: `apps/web/app/(platform)/components/RowActions.tsx`
- Test: `apps/web/app/(platform)/components/RowActions.test.tsx`

**Interfaces:**
- Produces:

```ts
export interface RowAction {
  label: string;
  onSelect: () => void;
  danger?: boolean;
}
export function RowActions({ actions, label }: { actions: RowAction[]; label: string }): JSX.Element | null;
```

`label` becomes the trigger's accessible name (e.g. `Actions for Acme`), so tests and screen readers can tell one row's menu from another's. Renders `null` for an empty action list — a menu with nothing in it is a dead control.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/app/(platform)/components/RowActions.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RowActions } from './RowActions';

describe('RowActions', () => {
  it('invokes the chosen action', async () => {
    const onSelect = jest.fn();
    render(<RowActions label="Actions for Acme" actions={[{ label: 'Switch into', onSelect }]} />);

    await userEvent.click(screen.getByRole('button', { name: 'Actions for Acme' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Switch into' }));

    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('renders nothing when there are no actions', () => {
    const { container } = render(<RowActions label="Actions for Acme" actions={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npx jest --config apps/web/jest.config.js RowActions --maxWorkers=2`

Expected: FAIL — `Cannot find module './RowActions'`.

- [ ] **Step 3: Implement**

Create `apps/web/app/(platform)/components/RowActions.tsx`:

```tsx
'use client';

import { ChevronDown } from 'lucide-react';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '../../../components/ui';

export interface RowAction {
  label: string;
  onSelect: () => void;
  danger?: boolean;
}

export function RowActions({ actions, label }: { actions: RowAction[]; label: string }) {
  if (actions.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label={label} className="rounded border border-recruiter-border p-1.5">
        <ChevronDown size={14} />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {actions.map((action) => (
          <DropdownMenuItem
            key={action.label}
            onSelect={action.onSelect}
            className={action.danger ? 'text-status-danger' : undefined}
          >
            {action.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npx jest --config apps/web/jest.config.js RowActions --maxWorkers=2`

Expected: PASS. If `DropdownMenuItem` does not accept `className`, add it as an optional prop in `apps/web/components/ui/DropdownMenu.tsx` — it already destructures `className` in its props type.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/(platform)/components/RowActions.tsx" "apps/web/app/(platform)/components/RowActions.test.tsx"
git commit -m "feat: add RowActions dropdown for platform admin list rows"
```

---

### Task 7: Move the create form into a modal

**Files:**
- Create: `apps/web/app/(platform)/organizations/CreateOrganizationModal.tsx`
- Test: `apps/web/app/(platform)/organizations/CreateOrganizationModal.test.tsx`

**Interfaces:**
- Consumes: `useCreateOrganization` from `apps/web/lib/hooks/useOrganizations.ts`; `Modal`, `Input`, `Select`, `Button`, `useToast` from `apps/web/components/ui`.
- Produces: `export function CreateOrganizationModal({ open, onClose }: { open: boolean; onClose: () => void }): JSX.Element`

The form logic is lifted verbatim from `page.tsx` (currently lines 24-49 and 78-91). Behaviour is unchanged except that a successful create closes the modal.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/app/(platform)/organizations/CreateOrganizationModal.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CreateOrganizationModal } from './CreateOrganizationModal';
import { AuthProvider } from '../../../lib/auth-context';
import { QueryProvider } from '../../../lib/query-provider';
import { ToastProvider } from '../../../components/ui';
import { fakeJwt } from '../../../lib/test-utils/fake-jwt';

function renderModal(onClose = jest.fn()) {
  const token = fakeJwt({ sub: 'u1', organizationId: null, role: 'super_admin' });
  global.fetch = jest.fn(async (url: string, options?: RequestInit) => {
    if (String(url).endsWith('/auth/refresh')) {
      return new Response(JSON.stringify({ accessToken: token }), { status: 200 });
    }
    if (String(url).endsWith('/organizations') && options?.method === 'POST') {
      return new Response(JSON.stringify({ id: 'org-2', name: 'Beta', slug: 'beta' }), { status: 200 });
    }
    return new Response('{}', { status: 200 });
  }) as unknown as typeof fetch;

  render(
    <QueryProvider>
      <AuthProvider>
        <ToastProvider>
          <CreateOrganizationModal open onClose={onClose} />
        </ToastProvider>
      </AuthProvider>
    </QueryProvider>,
  );
  return onClose;
}

describe('CreateOrganizationModal', () => {
  it('posts the form and closes on success', async () => {
    const onClose = renderModal();

    await userEvent.type(screen.getByLabelText('Name'), 'Beta');
    await userEvent.type(screen.getByLabelText('Slug'), 'beta');
    await userEvent.type(screen.getByLabelText('Admin email'), 'admin@beta.test');
    await userEvent.click(screen.getByRole('button', { name: 'Create organization' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const post = (global.fetch as jest.Mock).mock.calls.find(([, o]) => o?.method === 'POST');
    expect(JSON.parse(post[1].body)).toEqual({ name: 'Beta', slug: 'beta', region: 'us', adminEmail: 'admin@beta.test' });
  });

  it('shows the server error and stays open on failure', async () => {
    const onClose = jest.fn();
    const token = fakeJwt({ sub: 'u1', organizationId: null, role: 'super_admin' });
    global.fetch = jest.fn(async (url: string, options?: RequestInit) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: token }), { status: 200 });
      }
      if (options?.method === 'POST') {
        return new Response(JSON.stringify({ message: 'Slug already taken' }), { status: 409 });
      }
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;

    render(
      <QueryProvider>
        <AuthProvider>
          <ToastProvider>
            <CreateOrganizationModal open onClose={onClose} />
          </ToastProvider>
        </AuthProvider>
      </QueryProvider>,
    );

    await userEvent.type(screen.getByLabelText('Name'), 'Beta');
    await userEvent.type(screen.getByLabelText('Slug'), 'beta');
    await userEvent.type(screen.getByLabelText('Admin email'), 'admin@beta.test');
    await userEvent.click(screen.getByRole('button', { name: 'Create organization' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Slug already taken'));
    expect(onClose).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npx jest --config apps/web/jest.config.js CreateOrganizationModal --maxWorkers=2`

Expected: FAIL — `Cannot find module './CreateOrganizationModal'`.

- [ ] **Step 3: Implement**

Create `apps/web/app/(platform)/organizations/CreateOrganizationModal.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useCreateOrganization } from '../../../lib/hooks/useOrganizations';
import { Modal, Input, Select, Button, useToast } from '../../../components/ui';

const REGION_OPTIONS = [
  { value: 'us', label: 'US' },
  { value: 'eu', label: 'EU' },
];

export function CreateOrganizationModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const createOrganization = useCreateOrganization();
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [region, setRegion] = useState('us');
  const [adminEmail, setAdminEmail] = useState('');
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    createOrganization.mutate(
      { name, slug, region, adminEmail },
      {
        onSuccess: () => {
          toast(`Created ${name}. A setup email was sent to ${adminEmail}.`);
          setName('');
          setSlug('');
          setRegion('us');
          setAdminEmail('');
          onClose();
        },
        onError: (err) => setError(err instanceof Error ? err.message : 'Failed to create organization'),
      },
    );
  }

  return (
    <Modal open={open} title="New organization" onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <Input label="Name" value={name} onChange={setName} required />
        <Input label="Slug" value={slug} onChange={setSlug} required />
        <Select label="Region" value={region} onChange={setRegion} options={REGION_OPTIONS} />
        <Input label="Admin email" type="email" value={adminEmail} onChange={setAdminEmail} required />
        <Button type="submit" disabled={createOrganization.isPending}>
          Create organization
        </Button>
      </form>
      {error && (
        <p role="alert" className="mt-3 text-sm text-status-danger">
          {error}
        </p>
      )}
    </Modal>
  );
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npx jest --config apps/web/jest.config.js CreateOrganizationModal --maxWorkers=2`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/(platform)/organizations/CreateOrganizationModal.tsx" "apps/web/app/(platform)/organizations/CreateOrganizationModal.test.tsx"
git commit -m "feat: extract organization create form into a modal"
```

---

### Task 8: Rebuild the Organizations page on `ListView`

**Files:**
- Modify: `apps/web/app/(platform)/organizations/page.tsx` (full rewrite)
- Modify: `apps/web/app/(platform)/organizations/page.test.tsx`

**Interfaces:**
- Consumes: `ListView` (Task 5), `RowActions` (Task 6), `CreateOrganizationModal` (Task 7), the widened `Organization` type and `useOrganizations` (Task 3).
- Produces: nothing consumed by later tasks except the page itself, which Tasks 10, 13 and 15 extend with more row actions.

`CardGrid` and `Pagination` are no longer used here. Leave both components in place — other pages use them.

- [ ] **Step 1: Rewrite the page test**

Replace `apps/web/app/(platform)/organizations/page.test.tsx` with:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OrganizationsPage from './page';
import { AuthProvider } from '../../../lib/auth-context';
import { QueryProvider } from '../../../lib/query-provider';
import { ToastProvider } from '../../../components/ui';
import { fakeJwt } from '../../../lib/test-utils/fake-jwt';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }));

const ORGS = [
  {
    id: 'org-1', name: 'Acme', slug: 'acme', region: 'us', status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    primaryAdminName: 'Ada', primaryAdminEmail: 'ada@acme.test', userCount: 12, examCount: 8,
  },
  {
    id: 'org-2', name: 'Beta', slug: 'beta', region: 'eu', status: 'active',
    createdAt: '2026-01-02T00:00:00.000Z',
    primaryAdminName: null, primaryAdminEmail: 'admin@beta.test', userCount: 0, examCount: 0,
  },
];

function renderPage() {
  localStorage.clear();
  mockPush.mockClear();
  const token = fakeJwt({ sub: 'u1', organizationId: null, role: 'super_admin' });
  const actingToken = fakeJwt({ sub: 'u1', organizationId: 'org-1', role: 'super_admin', actingSuperAdmin: true, actingOrgName: 'Acme' });
  global.fetch = jest.fn(async (url: string, options?: RequestInit) => {
    if (String(url).endsWith('/auth/refresh')) {
      return new Response(JSON.stringify({ accessToken: token }), { status: 200 });
    }
    if (String(url).includes('/auth/switch-org')) {
      return new Response(JSON.stringify({ accessToken: actingToken }), { status: 200 });
    }
    if (String(url).includes('/organizations') && options?.method === undefined) {
      return new Response(
        JSON.stringify({ data: ORGS, total: ORGS.length, page: 1, pageSize: 200, totalPages: 1 }),
        { status: 200 },
      );
    }
    return new Response('{}', { status: 200 });
  }) as unknown as typeof fetch;

  return render(
    <QueryProvider>
      <AuthProvider>
        <ToastProvider>
          <OrganizationsPage />
        </ToastProvider>
      </AuthProvider>
    </QueryProvider>,
  );
}

describe('OrganizationsPage', () => {
  it('renders organizations as table rows with admin and counts', async () => {
    renderPage();

    expect(await screen.findByText('Acme')).toBeInTheDocument();
    expect(screen.getByText('ada@acme.test')).toBeInTheDocument();
    expect(screen.getByText('Ada')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
  });

  it('renders an em dash when the primary admin has no name yet', async () => {
    renderPage();

    await screen.findByText('Beta');
    expect(screen.getByText('admin@beta.test')).toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('hides the exam count column by default and reveals it from the chooser', async () => {
    renderPage();
    await screen.findByText('Acme');

    expect(screen.queryByRole('button', { name: /Exams/ })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Choose columns' }));
    await userEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Exams' }));

    expect(screen.getByRole('button', { name: /Exams/ })).toBeInTheDocument();
  });

  it('does not show the create form until New is pressed', async () => {
    renderPage();
    await screen.findByText('Acme');

    expect(screen.queryByLabelText('Slug')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'New' }));

    expect(screen.getByLabelText('Slug')).toBeInTheDocument();
  });

  it('switches into an organization from the row menu', async () => {
    renderPage();
    await screen.findByText('Acme');

    await userEvent.click(screen.getByRole('button', { name: 'Actions for Acme' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Switch into' }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/dashboard'));
  });

  it('links View users to the all-users tab filtered by organization name', async () => {
    renderPage();
    await screen.findByText('Acme');

    await userEvent.click(screen.getByRole('button', { name: 'Actions for Acme' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'View users' }));

    // The All Users directory rows carry `organizationName`, not a slug, so the
    // filter must be the name or it would match nothing.
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/all-users?org=Acme'));
  });

  it('filters the table by the search box', async () => {
    renderPage();
    await screen.findByText('Acme');

    await userEvent.type(screen.getByPlaceholderText('Search organizations…'), 'beta');

    expect(screen.getByText('Beta')).toBeInTheDocument();
    expect(screen.queryByText('Acme')).not.toBeInTheDocument();
  });

  it('sorts across the whole list, not just the first 20 rows', async () => {
    // The old page size was 20. Sorting a paginated slice would put the first
    // row of page one at the top instead of the global first -- the exact bug
    // fetching everything is meant to remove.
    const many = Array.from({ length: 45 }, (_, i) => ({
      ...ORGS[0],
      id: `org-${i}`,
      // Descending names, so the global first ascending is the LAST row fetched.
      name: `Org ${String(45 - i).padStart(2, '0')}`,
      slug: `org-${i}`,
    }));
    renderPage(many);
    await screen.findByText('Org 45');

    await userEvent.click(screen.getByRole('button', { name: /Name/ }));

    const firstCell = screen.getAllByRole('row')[1].querySelector('td');
    expect(firstCell).toHaveTextContent('Org 01');
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npx jest --config apps/web/jest.config.js "(platform)/organizations/page" --maxWorkers=2`

Expected: FAIL — the page still renders cards; there is no `New` button and no `Actions for Acme` menu.

- [ ] **Step 3: Rewrite the page**

Replace the whole of `apps/web/app/(platform)/organizations/page.tsx` with:

```tsx
'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2 } from 'lucide-react';
import { useOrganizations } from '../../../lib/hooks/useOrganizations';
import { Button, type Column } from '../../../components/ui';
import { Organization } from '../../../lib/types';
import { useAuth } from '../../../lib/auth-context';
import { ListView } from '../components/ListView';
import { RowActions } from '../components/RowActions';
import { CreateOrganizationModal } from './CreateOrganizationModal';

export default function OrganizationsPage() {
  const router = useRouter();
  const { switchIntoOrg } = useAuth();
  const { data, isLoading, isError } = useOrganizations();
  const [createOpen, setCreateOpen] = useState(false);

  const organizations = useMemo(() => data?.data ?? [], [data]);

  async function handleSwitchInto(orgId: string) {
    await switchIntoOrg(orgId);
    router.push('/dashboard');
  }

  const columns: Column<Organization>[] = useMemo(
    () => [
      { key: 'name', header: 'Name', render: (org) => <span className="font-medium text-gray-900">{org.name}</span>, sortValue: (org) => org.name },
      { key: 'slug', header: 'Slug', render: (org) => org.slug, sortValue: (org) => org.slug },
      { key: 'primaryAdmin', header: 'Primary admin', render: (org) => org.primaryAdminName ?? '—', sortValue: (org) => org.primaryAdminName ?? '' },
      { key: 'adminEmail', header: 'Admin email', render: (org) => org.primaryAdminEmail ?? '—', sortValue: (org) => org.primaryAdminEmail ?? '' },
      { key: 'region', header: 'Region', render: (org) => org.region.toUpperCase(), sortValue: (org) => org.region },
      { key: 'users', header: 'Users', render: (org) => org.userCount, sortValue: (org) => org.userCount },
      { key: 'exams', header: 'Exams', render: (org) => org.examCount, sortValue: (org) => org.examCount },
      { key: 'created', header: 'Created', render: (org) => new Date(org.createdAt).toLocaleDateString(), sortValue: (org) => org.createdAt },
      {
        key: 'actions',
        header: '',
        render: (org) => (
          <RowActions
            label={`Actions for ${org.name}`}
            actions={[
              { label: 'Switch into', onSelect: () => void handleSwitchInto(org.id) },
              // The All Users directory rows carry `organizationName`, not a slug.
              { label: 'View users', onSelect: () => router.push(`/all-users?org=${encodeURIComponent(org.name)}`) },
            ]}
          />
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handleSwitchInto and router are stable for this page's lifetime
    [],
  );

  return (
    <>
      <ListView<Organization>
        title="Organizations"
        icon={<Building2 size={22} />}
        columns={columns}
        rows={organizations}
        rowKey={(org) => org.id}
        searchMatch={(org, query) =>
          org.name.toLowerCase().includes(query) ||
          org.slug.toLowerCase().includes(query) ||
          (org.primaryAdminEmail ?? '').toLowerCase().includes(query)
        }
        storageKey="organizations"
        defaultHiddenColumns={['exams']}
        searchPlaceholder="Search organizations…"
        emptyMessage="No organizations yet."
        isLoading={isLoading}
        isError={isError}
        totalCount={data?.total}
        actions={<Button onClick={() => setCreateOpen(true)}>New</Button>}
      />
      <CreateOrganizationModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </>
  );
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npx jest --config apps/web/jest.config.js "(platform)" --maxWorkers=2`

Expected: PASS

- [ ] **Step 5: Verify in a real browser**

Start the dev server via the preview tooling (never `npm run dev` through Bash), sign in as the platform admin, and confirm on `/organizations`: the table renders, `New` opens the modal, the search box filters, clicking `Name` sorts and the metadata line reads `Sorted by Name`, and the row menu's `Switch into` still lands on the dashboard.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/app/(platform)/organizations/page.tsx" "apps/web/app/(platform)/organizations/page.test.tsx"
git commit -m "feat: rebuild Organizations page as a sortable list view"
```

---

### Task 9: `PATCH /organizations/:id` — edit name and region

**Files:**
- Create: `apps/api/src/organizations/dto/update-organization.dto.ts`
- Modify: `apps/api/src/organizations/organizations.controller.ts`
- Modify: `apps/api/src/organizations/organizations.service.ts`
- Test: `apps/api/src/organizations/organizations.service.spec.ts`

**Interfaces:**
- Produces: `OrganizationsService.updatePlatform(actorUserId: string, id: string, dto: UpdateOrganizationDto): Promise<OrganizationListItem>`.

Named `updatePlatform` because the class already has org-scoped update methods (`updateBrandingColors` and friends); a bare `update` would be ambiguous. Slug is absent from the DTO by design — it appears in invitation URLs and SAML entity IDs.

- [ ] **Step 1: Write the failing tests**

Add to `apps/api/src/organizations/organizations.service.spec.ts`:

```ts
  describe('updatePlatform', () => {
    it('updates name and region and audits the change', async () => {
      prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', name: 'Acme', slug: 'acme', region: 'us', status: 'active' });
      prisma.organization.update.mockResolvedValue({
        id: 'org-1', name: 'Acme Inc', slug: 'acme', region: 'eu', status: 'active', createdAt: new Date('2026-01-01'),
      });

      const result = await service.updatePlatform('actor-1', 'org-1', { name: 'Acme Inc', region: 'eu' });

      expect(prisma.organization.update).toHaveBeenCalledWith({
        where: { id: 'org-1' },
        data: { name: 'Acme Inc', region: 'eu' },
        select: expect.objectContaining({ id: true, name: true, slug: true }),
      });
      expect(result.name).toBe('Acme Inc');
      expect(audit.record).toHaveBeenCalledWith(
        { organizationId: 'org-1', isSuperAdmin: true },
        { actorUserId: 'actor-1', action: 'platform.organization_updated', entityType: 'organization', entityId: 'org-1' },
      );
    });

    it('omits fields the caller did not send', async () => {
      prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', name: 'Acme', slug: 'acme', region: 'us', status: 'active' });
      prisma.organization.update.mockResolvedValue({
        id: 'org-1', name: 'Acme Inc', slug: 'acme', region: 'us', status: 'active', createdAt: new Date('2026-01-01'),
      });

      await service.updatePlatform('actor-1', 'org-1', { name: 'Acme Inc' });

      expect(prisma.organization.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { name: 'Acme Inc' } }),
      );
    });

    it('throws NotFound for an unknown organization', async () => {
      prisma.organization.findUnique.mockResolvedValue(null);

      await expect(service.updatePlatform('actor-1', 'nope', { name: 'X' })).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.organization.update).not.toHaveBeenCalled();
    });
  });
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npx jest --config apps/api/jest.config.js organizations.service -t "updatePlatform" --maxWorkers=2`

Expected: FAIL — `service.updatePlatform is not a function`.

- [ ] **Step 3: Create the DTO**

Create `apps/api/src/organizations/dto/update-organization.dto.ts`:

```ts
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateOrganizationDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsIn(['us', 'eu'])
  region?: string;
}
```

- [ ] **Step 4: Implement the service method**

Add to `apps/api/src/organizations/organizations.service.ts`:

```ts
  async updatePlatform(actorUserId: string, id: string, dto: UpdateOrganizationDto): Promise<OrganizationListItem> {
    const existing = await this.prisma.organization.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Organization ${id} not found`);
    }

    const updated = await this.prisma.organization.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.region !== undefined && { region: dto.region }),
      },
      select: ORGANIZATION_LIST_SELECT,
    });

    await this.audit.record(
      { organizationId: id, isSuperAdmin: true },
      { actorUserId, action: 'platform.organization_updated', entityType: 'organization', entityId: id },
    );

    // The list view's extra fields are not affected by a name or region change,
    // and the client refetches the list on success -- returning them here would
    // mean duplicating Task 2's aggregation for no consumer.
    return { ...updated, primaryAdminName: null, primaryAdminEmail: null, userCount: 0, examCount: 0 };
  }
```

Add `UpdateOrganizationDto` to the file's imports.

- [ ] **Step 5: Add the route**

In `apps/api/src/organizations/organizations.controller.ts`, add after the `@Get()` list handler:

```ts
  @Patch(':id')
  @RequirePermissions('platform:manage_organizations')
  updatePlatform(@CurrentUserId() userId: string, @Param('id') id: string, @Body() dto: UpdateOrganizationDto) {
    return this.organizationsService.updatePlatform(userId, id, dto);
  }
```

Add `Param` to the `@nestjs/common` import and `UpdateOrganizationDto` to the DTO imports.

**Route-ordering check:** this controller already has literal routes such as `@Get('branding')` and `@Patch('integrations/smtp')`. A `@Patch(':id')` placed before a literal `@Patch('…')` would swallow it. Place this handler after the `@Get()` list handler but confirm every existing literal `@Patch` route still resolves — Step 6 covers this.

- [ ] **Step 6: Run the tests and verify they pass**

Run: `npx jest --config apps/api/jest.config.js organizations --maxWorkers=2`

Expected: PASS, including the existing controller tests for `integrations/smtp`, `integrations/ai-key`, `integrations/webhook`, `sso` and `branding`. If any now 404 or hit the wrong handler, move `@Patch(':id')` below every literal `@Patch`.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/organizations/
git commit -m "feat: add PATCH /organizations/:id for platform admin edits"
```

---

### Task 10: Edit modal and row action

**Files:**
- Create: `apps/web/app/(platform)/organizations/EditOrganizationModal.tsx`
- Modify: `apps/web/lib/hooks/useOrganizations.ts`
- Modify: `apps/web/app/(platform)/organizations/page.tsx`
- Test: `apps/web/app/(platform)/organizations/EditOrganizationModal.test.tsx`

**Interfaces:**
- Consumes: `Organization` (Task 3), `PATCH /organizations/:id` (Task 9), `Modal`/`Input`/`Select`/`Button` from the UI kit.
- Produces: `useUpdateOrganization()` in `useOrganizations.ts`, and `EditOrganizationModal({ organization, onClose })` where a `null` organization renders the modal closed.

- [ ] **Step 1: Write the failing test**

Create `apps/web/app/(platform)/organizations/EditOrganizationModal.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EditOrganizationModal } from './EditOrganizationModal';
import { AuthProvider } from '../../../lib/auth-context';
import { QueryProvider } from '../../../lib/query-provider';
import { ToastProvider } from '../../../components/ui';
import { fakeJwt } from '../../../lib/test-utils/fake-jwt';
import { Organization } from '../../../lib/types';

const ORG: Organization = {
  id: 'org-1', name: 'Acme', slug: 'acme', region: 'us', status: 'active',
  createdAt: '2026-01-01T00:00:00.000Z',
  primaryAdminName: 'Ada', primaryAdminEmail: 'ada@acme.test', userCount: 1, examCount: 0,
};

function renderModal(onClose = jest.fn()) {
  const token = fakeJwt({ sub: 'u1', organizationId: null, role: 'super_admin' });
  global.fetch = jest.fn(async (url: string) => {
    if (String(url).endsWith('/auth/refresh')) {
      return new Response(JSON.stringify({ accessToken: token }), { status: 200 });
    }
    return new Response(JSON.stringify({ ...ORG, name: 'Acme Inc' }), { status: 200 });
  }) as unknown as typeof fetch;

  render(
    <QueryProvider>
      <AuthProvider>
        <ToastProvider>
          <EditOrganizationModal organization={ORG} onClose={onClose} />
        </ToastProvider>
      </AuthProvider>
    </QueryProvider>,
  );
  return onClose;
}

describe('EditOrganizationModal', () => {
  it('prefills from the organization and shows the slug as read-only', () => {
    renderModal();
    expect(screen.getByLabelText('Name')).toHaveValue('Acme');
    expect(screen.getByText('acme')).toBeInTheDocument();
    expect(screen.queryByLabelText('Slug')).not.toBeInTheDocument();
  });

  it('patches only name and region, then closes', async () => {
    const onClose = renderModal();

    await userEvent.clear(screen.getByLabelText('Name'));
    await userEvent.type(screen.getByLabelText('Name'), 'Acme Inc');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const patch = (global.fetch as jest.Mock).mock.calls.find(([, o]) => o?.method === 'PATCH');
    expect(String(patch[0])).toContain('/organizations/org-1');
    expect(JSON.parse(patch[1].body)).toEqual({ name: 'Acme Inc', region: 'us' });
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx jest --config apps/web/jest.config.js EditOrganizationModal --maxWorkers=2`

Expected: FAIL — `Cannot find module './EditOrganizationModal'`.

- [ ] **Step 3: Add the mutation hook**

Add to `apps/web/lib/hooks/useOrganizations.ts`:

```ts
interface UpdateOrganizationInput {
  id: string;
  name?: string;
  region?: string;
}

export function useUpdateOrganization() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateOrganizationInput): Promise<Organization> =>
      apiFetch(`/organizations/${id}`, { method: 'PATCH', body: JSON.stringify(body) }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['organizations'] }),
  });
}
```

- [ ] **Step 4: Implement the modal**

Create `apps/web/app/(platform)/organizations/EditOrganizationModal.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useUpdateOrganization } from '../../../lib/hooks/useOrganizations';
import { Modal, Input, Select, Button, useToast } from '../../../components/ui';
import { Organization } from '../../../lib/types';

const REGION_OPTIONS = [
  { value: 'us', label: 'US' },
  { value: 'eu', label: 'EU' },
];

export function EditOrganizationModal({
  organization,
  onClose,
}: {
  organization: Organization | null;
  onClose: () => void;
}) {
  const updateOrganization = useUpdateOrganization();
  const { toast } = useToast();
  const [name, setName] = useState(organization?.name ?? '');
  const [region, setRegion] = useState(organization?.region ?? 'us');
  const [error, setError] = useState<string | null>(null);

  // The modal stays mounted across row selections, so the fields must re-seed
  // when a different organization is chosen -- otherwise the second row opened
  // would show the first row's values.
  useEffect(() => {
    setName(organization?.name ?? '');
    setRegion(organization?.region ?? 'us');
    setError(null);
  }, [organization]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!organization) return;
    setError(null);
    updateOrganization.mutate(
      { id: organization.id, name, region },
      {
        onSuccess: () => {
          toast(`Updated ${name}.`);
          onClose();
        },
        onError: (err) => setError(err instanceof Error ? err.message : 'Failed to update organization'),
      },
    );
  }

  return (
    <Modal open={organization !== null} title="Edit organization" onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <Input label="Name" value={name} onChange={setName} required />
        <div className="text-sm">
          <span className="block text-xs font-medium text-recruiter-text-tertiary">Slug</span>
          <span className="text-gray-900">{organization?.slug}</span>
          <p className="mt-1 text-xs text-recruiter-text-tertiary">
            The slug cannot be changed — it appears in invitation links and SSO configuration.
          </p>
        </div>
        <Select label="Region" value={region} onChange={setRegion} options={REGION_OPTIONS} />
        <Button type="submit" disabled={updateOrganization.isPending}>
          Save
        </Button>
      </form>
      {error && (
        <p role="alert" className="mt-3 text-sm text-status-danger">
          {error}
        </p>
      )}
    </Modal>
  );
}
```

- [ ] **Step 5: Wire it into the page**

In `apps/web/app/(platform)/organizations/page.tsx`, add the state and the row action:

```tsx
  const [editing, setEditing] = useState<Organization | null>(null);
```

Add to the `actions` array in the `actions` column, after `Switch into`:

```tsx
              { label: 'Edit', onSelect: () => setEditing(org) },
```

And render the modal alongside `CreateOrganizationModal`:

```tsx
      <EditOrganizationModal organization={editing} onClose={() => setEditing(null)} />
```

Import `EditOrganizationModal` at the top.

- [ ] **Step 6: Run the tests and verify they pass**

Run: `npx jest --config apps/web/jest.config.js "(platform)" --maxWorkers=2`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add "apps/web/app/(platform)/organizations/" apps/web/lib/hooks/useOrganizations.ts
git commit -m "feat: edit an organization's name and region from the row menu"
```

---

### Task 11: Shared status helper and `PATCH /organizations/:id/status`

**Files:**
- Create: `packages/shared/src/organizations/organization-status.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `apps/api/src/organizations/dto/update-organization.dto.ts`
- Modify: `apps/api/src/organizations/organizations.controller.ts`
- Modify: `apps/api/src/organizations/organizations.service.ts`
- Test: `packages/shared/src/organizations/organization-status.spec.ts`
- Test: `apps/api/src/organizations/organizations.service.spec.ts`

**Interfaces:**
- Produces, from `@exam-platform/shared`:

```ts
export const ORGANIZATION_STATUSES = ['active', 'suspended', 'deleted'] as const;
export type OrganizationStatus = (typeof ORGANIZATION_STATUSES)[number];
export const ORGANIZATION_INACTIVE_MESSAGE = 'This organization is not currently active';
export function isOrganizationActive(status: string | null | undefined): boolean;
```

- Produces: `OrganizationsService.setStatus(actorUserId: string, id: string, status: 'active' | 'suspended'): Promise<OrganizationListItem>`.

- [ ] **Step 1: Write the failing shared test**

Create `packages/shared/src/organizations/organization-status.spec.ts`:

```ts
import { isOrganizationActive, ORGANIZATION_STATUSES } from './organization-status';

describe('isOrganizationActive', () => {
  it('is true only for the exact string "active"', () => {
    expect(isOrganizationActive('active')).toBe(true);
    expect(isOrganizationActive('suspended')).toBe(false);
    expect(isOrganizationActive('deleted')).toBe(false);
  });

  it('treats a missing or unrecognised status as inactive', () => {
    // Fail closed: an unreadable status must never grant access.
    expect(isOrganizationActive(null)).toBe(false);
    expect(isOrganizationActive(undefined)).toBe(false);
    expect(isOrganizationActive('')).toBe(false);
    expect(isOrganizationActive('ACTIVE')).toBe(false);
    expect(isOrganizationActive('whatever')).toBe(false);
  });

  it('enumerates exactly the three known statuses', () => {
    expect(ORGANIZATION_STATUSES).toEqual(['active', 'suspended', 'deleted']);
  });
});
```

- [ ] **Step 2: Run it and verify it fails**

Run: `npx jest --config packages/shared/jest.config.js organization-status --maxWorkers=2`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the shared helper**

Create `packages/shared/src/organizations/organization-status.ts`:

```ts
export const ORGANIZATION_STATUSES = ['active', 'suspended', 'deleted'] as const;

export type OrganizationStatus = (typeof ORGANIZATION_STATUSES)[number];

/** Shown to staff. Candidates must never see this — see the candidate-auth guard. */
export const ORGANIZATION_INACTIVE_MESSAGE = 'This organization is not currently active';

/**
 * Fails closed: anything that is not exactly 'active' — including null, an
 * unreadable value, or a status added later — denies access. A new status must
 * be an explicit decision here, not an accidental grant.
 */
export function isOrganizationActive(status: string | null | undefined): boolean {
  return status === 'active';
}
```

Export it from `packages/shared/src/index.ts`:

```ts
export * from './organizations/organization-status';
```

- [ ] **Step 4: Run the shared test and verify it passes**

Run: `npx jest --config packages/shared/jest.config.js organization-status --maxWorkers=2`

Expected: PASS

- [ ] **Step 5: Write the failing service tests**

Add to `apps/api/src/organizations/organizations.service.spec.ts`:

```ts
  describe('setStatus', () => {
    it('suspends an organization and audits it', async () => {
      prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', name: 'Acme', slug: 'acme', status: 'active' });
      prisma.organization.update.mockResolvedValue({
        id: 'org-1', name: 'Acme', slug: 'acme', region: 'us', status: 'suspended', createdAt: new Date('2026-01-01'),
      });

      const result = await service.setStatus('actor-1', 'org-1', 'suspended');

      expect(prisma.organization.update).toHaveBeenCalledWith({
        where: { id: 'org-1' },
        data: { status: 'suspended' },
        select: expect.objectContaining({ status: true }),
      });
      expect(result.status).toBe('suspended');
      expect(audit.record).toHaveBeenCalledWith(
        { organizationId: 'org-1', isSuperAdmin: true },
        { actorUserId: 'actor-1', action: 'platform.organization_suspended', entityType: 'organization', entityId: 'org-1' },
      );
    });

    it('records a distinct audit action when reactivating', async () => {
      prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', name: 'Acme', slug: 'acme', status: 'suspended' });
      prisma.organization.update.mockResolvedValue({
        id: 'org-1', name: 'Acme', slug: 'acme', region: 'us', status: 'active', createdAt: new Date('2026-01-01'),
      });

      await service.setStatus('actor-1', 'org-1', 'active');

      expect(audit.record).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ action: 'platform.organization_reactivated' }),
      );
    });

    it('refuses to reactivate a deleted organization', async () => {
      prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', name: 'Acme', slug: 'acme', status: 'deleted' });

      await expect(service.setStatus('actor-1', 'org-1', 'active')).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.organization.update).not.toHaveBeenCalled();
    });

    it('throws NotFound for an unknown organization', async () => {
      prisma.organization.findUnique.mockResolvedValue(null);

      await expect(service.setStatus('actor-1', 'nope', 'suspended')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
```

- [ ] **Step 6: Run and verify they fail**

Run: `npx jest --config apps/api/jest.config.js organizations.service -t "setStatus" --maxWorkers=2`

Expected: FAIL — `service.setStatus is not a function`.

- [ ] **Step 7: Implement**

Add to `apps/api/src/organizations/dto/update-organization.dto.ts`:

```ts
export class UpdateOrganizationStatusDto {
  @IsIn(['active', 'suspended'])
  status!: 'active' | 'suspended';
}
```

Add to `apps/api/src/organizations/organizations.service.ts`:

```ts
  async setStatus(actorUserId: string, id: string, status: 'active' | 'suspended'): Promise<OrganizationListItem> {
    const existing = await this.prisma.organization.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Organization ${id} not found`);
    }
    // Reactivating a deleted organization through the suspend endpoint would be a
    // silent undelete that bypasses whatever restore flow we eventually build.
    if (existing.status === 'deleted') {
      throw new ConflictException('This organization has been deleted');
    }

    const updated = await this.prisma.organization.update({
      where: { id },
      data: { status },
      select: ORGANIZATION_LIST_SELECT,
    });

    await this.audit.record(
      { organizationId: id, isSuperAdmin: true },
      {
        actorUserId,
        action: status === 'suspended' ? 'platform.organization_suspended' : 'platform.organization_reactivated',
        entityType: 'organization',
        entityId: id,
      },
    );

    return { ...updated, primaryAdminName: null, primaryAdminEmail: null, userCount: 0, examCount: 0 };
  }
```

Add the route to `apps/api/src/organizations/organizations.controller.ts`, **above** `@Patch(':id')` so the literal segment wins:

```ts
  @Patch(':id/status')
  @RequirePermissions('platform:manage_organizations')
  setStatus(@CurrentUserId() userId: string, @Param('id') id: string, @Body() dto: UpdateOrganizationStatusDto) {
    return this.organizationsService.setStatus(userId, id, dto.status);
  }
```

- [ ] **Step 8: Run the tests and verify they pass**

Run: `npx jest --config apps/api/jest.config.js organizations --maxWorkers=2` and `npx jest --config packages/shared/jest.config.js --maxWorkers=2`

Expected: both pass.

- [ ] **Step 9: Commit**

```bash
git add packages/shared/src/organizations/ packages/shared/src/index.ts apps/api/src/organizations/
git commit -m "feat: add organization suspend/reactivate endpoint and shared status helper"
```

---

### Task 12: Enforce suspension on every login path

A status column that blocks nothing is decoration. Four paths must check it. All four are in this one task because they are one behaviour, and shipping three of four is a hole.

**Files:**
- Modify: `apps/api/src/auth/auth.service.ts` (`login`, `refresh`)
- Modify: `apps/api/src/auth/auth.controller.ts` (`ssoExchange`)
- Modify: `apps/exam-runtime/src/candidate-auth/candidate-auth.service.ts` (`redeem`)
- Test: `apps/api/src/auth/auth.service.spec.ts`
- Test: `apps/api/src/auth/auth.controller.spec.ts`
- Test: `apps/exam-runtime/src/candidate-auth/candidate-auth.service.spec.ts`

**Interfaces:**
- Consumes: `isOrganizationActive` and `ORGANIZATION_INACTIVE_MESSAGE` from `@exam-platform/shared` (Task 11).

**Two rules that must not be conflated:**
1. Staff (`login`, `refresh`, `ssoExchange`) get `ORGANIZATION_INACTIVE_MESSAGE` in a `401`.
2. Candidates (`redeem`) get exactly `'This exam is not currently available'` — the same string an unpublished exam produces. A candidate must not learn that their prospective employer is suspended.

A super admin has `organizationId: null` and is never blocked — there is no organization to suspend.

- [ ] **Step 1: Write the failing tests**

Add to `apps/api/src/auth/auth.service.spec.ts`:

```ts
  it('rejects password login when the organization is suspended', async () => {
    // Follow this spec file's existing helper for seeding a valid user + password.
    // The organization lookup is the only new mock: it must return status 'suspended'.
    prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', slug: 'acme', status: 'suspended' });

    await expect(service.login({ email: 'ada@acme.test', password: 'correct-horse', organizationSlug: 'acme' }))
      .rejects.toThrow('This organization is not currently active');
  });

  it('allows password login when the organization is active', async () => {
    prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', slug: 'acme', status: 'active' });

    await expect(service.login({ email: 'ada@acme.test', password: 'correct-horse', organizationSlug: 'acme' }))
      .resolves.toHaveProperty('accessToken');
  });

  it('rejects refresh rotation when the user\'s organization is suspended', async () => {
    // Without this, suspended staff keep working until their token expires and
    // the suspension appears not to have taken effect.
    prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', status: 'suspended' });

    await expect(service.refresh(validRefreshToken)).rejects.toThrow('This organization is not currently active');
  });

  it('does not block a super admin, who belongs to no organization', async () => {
    await expect(service.login({ email: 'root@platform.test', password: 'correct-horse' }))
      .resolves.toHaveProperty('accessToken');
    expect(prisma.organization.findUnique).not.toHaveBeenCalled();
  });
```

Add to `apps/exam-runtime/src/candidate-auth/candidate-auth.service.spec.ts`:

```ts
  it('refuses redemption when the exam\'s organization is suspended', async () => {
    prisma.invitation.findUnique.mockResolvedValue(validInvitation);
    tenantPrisma.forTenant.mockResolvedValue({ ...publishedExam, organizationId: 'org-1' });
    prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', status: 'suspended' });

    await expect(service.redeem('tok', '1.2.3.4')).rejects.toThrow('This exam is not currently available');
  });

  it('does not disclose organization state to the candidate', async () => {
    prisma.invitation.findUnique.mockResolvedValue(validInvitation);
    tenantPrisma.forTenant.mockResolvedValue({ ...publishedExam, organizationId: 'org-1' });
    prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', status: 'suspended' });

    await expect(service.redeem('tok', '1.2.3.4')).rejects.toThrow(/^This exam is not currently available$/);
  });
```

Add to `apps/api/src/auth/auth.controller.spec.ts`:

```ts
  it('rejects SSO exchange when the organization is suspended', async () => {
    prisma.ssoLoginCode.findUnique.mockResolvedValue({ id: 'code-1', userId: 'u1', codeHash: 'h', expiresAt: new Date(Date.now() + 60_000) });
    prisma.ssoLoginCode.delete.mockResolvedValue({});
    tenantPrisma.forTenant.mockResolvedValue({ id: 'u1', organizationId: 'org-1', role: 'org_admin', status: 'active' });
    prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', status: 'suspended' });

    await expect(controller.ssoExchange({ code: 'c' }, mockResponse))
      .rejects.toThrow('This organization is not currently active');
  });
```

Adapt each test's surrounding mock setup to whatever the existing spec file already uses for that method — only the organization lookup and the assertion are new.

- [ ] **Step 2: Run and verify they fail**

Run:
```
npx jest --config apps/api/jest.config.js auth --maxWorkers=2
npx jest --config apps/exam-runtime/jest.config.js candidate-auth --maxWorkers=2
```

Expected: FAIL — every new test resolves instead of rejecting.

- [ ] **Step 3: Guard password login**

In `apps/api/src/auth/auth.service.ts`, `login()` already fetches the organization when `dto.organizationSlug` is present. Extend that block (currently lines 38-45):

```ts
    if (dto.organizationSlug) {
      const org = await this.prisma.organization.findUnique({ where: { slug: dto.organizationSlug } });
      if (!org) {
        throw new UnauthorizedException('Invalid credentials');
      }
      if (!isOrganizationActive(org.status)) {
        throw new UnauthorizedException(ORGANIZATION_INACTIVE_MESSAGE);
      }
      organizationId = org.id;
    }
```

Import at the top of the file:

```ts
import { isOrganizationActive, ORGANIZATION_INACTIVE_MESSAGE } from '@exam-platform/shared';
```

- [ ] **Step 4: Guard refresh rotation**

The Staff Users console shipped a **per-user** deactivation guard into this exact block (commit `40ed775`, its Task 3). Do not remove it — the new check goes immediately after it. Both are needed and they are different things: that one blocks a deactivated *person*, this one blocks an active person in a suspended *organization*.

The block currently reads:

```ts
    const user = await this.tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) =>
      tx.user.findUniqueOrThrow({ where: { id: payload.sub } }),
    );

    if (user.status !== 'active') {
      throw new UnauthorizedException('This account has been deactivated');
    }

    return this.issueTokenPair(user.id, user.organizationId, user.role, payload.familyId);
```

Insert between the existing guard and the return:

```ts
    if (user.status !== 'active') {
      throw new UnauthorizedException('This account has been deactivated');
    }

    // A super admin has no organization to suspend. For everyone else, checking
    // only at login would let a suspended organization's staff keep rotating
    // tokens indefinitely, so the suspension would appear not to have applied.
    if (user.organizationId) {
      const org = await this.prisma.organization.findUnique({ where: { id: user.organizationId } });
      if (!isOrganizationActive(org?.status)) {
        throw new UnauthorizedException(ORGANIZATION_INACTIVE_MESSAGE);
      }
    }

    return this.issueTokenPair(user.id, user.organizationId, user.role, payload.familyId);
```

**If this block no longer matches, stop and re-read the file.** `auth.service.ts` is being edited by a second workstream; an exact-match edit against a stale quote is how one of the two guards gets silently deleted.

- [ ] **Step 5: Guard SSO exchange**

In `apps/api/src/auth/auth.controller.ts`, in `ssoExchange`, after the existing `user.status !== 'active'` check:

```ts
    if (user.status !== 'active') {
      throw new UnauthorizedException('This account has been deactivated');
    }

    if (user.organizationId) {
      const org = await this.prisma.organization.findUnique({ where: { id: user.organizationId } });
      if (!isOrganizationActive(org?.status)) {
        throw new UnauthorizedException(ORGANIZATION_INACTIVE_MESSAGE);
      }
    }
```

Import `isOrganizationActive` and `ORGANIZATION_INACTIVE_MESSAGE` from `@exam-platform/shared`.

- [ ] **Step 6: Guard candidate redemption**

In `apps/exam-runtime/src/candidate-auth/candidate-auth.service.ts`, in `redeem()`, immediately after the existing exam-status check (currently lines 42-44):

```ts
    if (exam.status !== 'published') {
      throw new BadRequestException('This exam is not currently available');
    }

    // Deliberately the same message as an unpublished exam: a candidate must not
    // learn that their prospective employer's account is suspended or deleted.
    const organization = await this.prisma.organization.findUnique({ where: { id: exam.organizationId } });
    if (!isOrganizationActive(organization?.status)) {
      throw new BadRequestException('This exam is not currently available');
    }
```

Import `isOrganizationActive` from `@exam-platform/shared` (the file already imports `PrismaService` and `TenantPrismaService` from there).

**Note:** `organizations` carries no RLS policy, so the raw `this.prisma` is correct here — unlike `users` and `exams`.

- [ ] **Step 7: Run all three suites and verify they pass**

Run:
```
npx jest --config apps/api/jest.config.js auth --maxWorkers=2
npx jest --config apps/exam-runtime/jest.config.js candidate-auth --maxWorkers=2
```

Expected: PASS. Existing login and redeem tests may now need `prisma.organization.findUnique` to resolve `{ status: 'active' }` — add it to their setup; do not weaken the guard.

- [ ] **Step 8: Verify an in-progress attempt survives suspension**

The spec requires that suspending an organization does not fail a candidate already sitting an exam. `redeem` is the only guarded candidate path; `/attempt/current`, `/attempt/answer` and `/attempt/submit` are deliberately unguarded. Confirm this holds by inspection: grep for `isOrganizationActive` in `apps/exam-runtime/src` and verify the only hit is in `candidate-auth.service.ts`.

Run: `npx jest --config apps/exam-runtime/jest.config.js --maxWorkers=2`

Expected: the full runtime suite passes, with no attempt-lifecycle test newly failing.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/auth/ apps/exam-runtime/src/candidate-auth/
git commit -m "feat: block login and invite redemption for suspended organizations"
```

---

### Task 13: Suspend and reactivate from the list

**Files:**
- Modify: `apps/web/lib/hooks/useOrganizations.ts`
- Modify: `apps/web/app/(platform)/organizations/page.tsx`
- Modify: `apps/web/app/(platform)/organizations/page.test.tsx`

**Interfaces:**
- Consumes: `PATCH /organizations/:id/status` (Task 11), `StatusBadge` from the UI kit.
- Produces: `useSetOrganizationStatus()` in `useOrganizations.ts`.

- [ ] **Step 1: Write the failing tests**

Add to `apps/web/app/(platform)/organizations/page.test.tsx`:

```tsx
  it('shows a status badge per row', async () => {
    renderPage();
    await screen.findByText('Acme');
    expect(screen.getAllByText('Active').length).toBe(2);
  });

  it('suspends an organization from the row menu', async () => {
    renderPage();
    await screen.findByText('Acme');

    await userEvent.click(screen.getByRole('button', { name: 'Actions for Acme' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Suspend' }));

    await waitFor(() => {
      const patch = (global.fetch as jest.Mock).mock.calls.find(([u, o]) => o?.method === 'PATCH' && String(u).includes('/status'));
      expect(patch).toBeDefined();
      expect(String(patch[0])).toContain('/organizations/org-1/status');
      expect(JSON.parse(patch[1].body)).toEqual({ status: 'suspended' });
    });
  });

  it('offers Reactivate, not Suspend, for a suspended organization', async () => {
    renderPage([{ ...ORGS[0], status: 'suspended' as const }]);
    await screen.findByText('Acme');

    await userEvent.click(screen.getByRole('button', { name: 'Actions for Acme' }));

    expect(screen.getByRole('menuitem', { name: 'Reactivate' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Suspend' })).not.toBeInTheDocument();
  });
```

Change `renderPage` to accept an optional row override:

```tsx
function renderPage(orgs = ORGS) {
```

and use `orgs` in place of `ORGS` in the list response and its `total`.

- [ ] **Step 2: Run and verify they fail**

Run: `npx jest --config apps/web/jest.config.js "(platform)/organizations/page" --maxWorkers=2`

Expected: FAIL — no status badge, no Suspend menu item.

- [ ] **Step 3: Add the mutation hook**

Add to `apps/web/lib/hooks/useOrganizations.ts`:

```ts
export function useSetOrganizationStatus() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'active' | 'suspended' }): Promise<Organization> =>
      apiFetch(`/organizations/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['organizations'] }),
  });
}
```

- [ ] **Step 4: Add the column and the action**

In `apps/web/app/(platform)/organizations/page.tsx`, add the hook and a handler:

```tsx
  const setStatus = useSetOrganizationStatus();
  const { toast } = useToast();

  function handleSetStatus(org: Organization, status: 'active' | 'suspended') {
    setStatus.mutate(
      { id: org.id, status },
      {
        onSuccess: () => toast(status === 'suspended' ? `${org.name} suspended.` : `${org.name} reactivated.`),
        onError: (err) => toast(err instanceof Error ? err.message : 'Failed to change status', 'error'),
      },
    );
  }
```

Add a `status` column between `region` and `users`:

```tsx
      {
        key: 'status',
        header: 'Status',
        render: (org) => (
          <StatusBadge tone={org.status === 'active' ? 'success' : 'warning'}>
            {org.status === 'active' ? 'Active' : 'Suspended'}
          </StatusBadge>
        ),
        sortValue: (org) => org.status,
      },
```

Add to the row actions, after `Edit`:

```tsx
              org.status === 'active'
                ? { label: 'Suspend', onSelect: () => handleSetStatus(org, 'suspended') }
                : { label: 'Reactivate', onSelect: () => handleSetStatus(org, 'active') },
```

Import `StatusBadge` and `useToast` from `../../../components/ui`, and `useSetOrganizationStatus` from the hooks module. Add `setStatus` and `toast` to the `columns` `useMemo` dependency array, or move the actions column out of the memo — a stale closure here would suspend the wrong organization.

**Check `StatusBadge`'s actual `tone` values** in `apps/web/components/ui/StatusBadge.tsx` before using `'success'` / `'warning'`; the exported `StatusTone` union is the authority.

- [ ] **Step 5: Run the tests and verify they pass**

Run: `npx jest --config apps/web/jest.config.js "(platform)" --maxWorkers=2`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add "apps/web/app/(platform)/organizations/" apps/web/lib/hooks/useOrganizations.ts
git commit -m "feat: suspend and reactivate organizations from the list view"
```

---

### Task 14: `DELETE /organizations/:id` — soft delete with a live-exam guard

**Files:**
- Modify: `apps/api/src/organizations/organizations.controller.ts`
- Modify: `apps/api/src/organizations/organizations.service.ts`
- Test: `apps/api/src/organizations/organizations.service.spec.ts`

**Interfaces:**
- Produces: `OrganizationsService.softDelete(actorUserId: string, id: string): Promise<{ id: string; status: string }>`.

Soft delete only: sets `status = 'deleted'`. Nothing is destroyed. `list()` gains a filter excluding deleted rows — Task 1 deliberately left this out because the state did not exist yet.

- [ ] **Step 1: Write the failing tests**

Add to `apps/api/src/organizations/organizations.service.spec.ts`:

```ts
  describe('softDelete', () => {
    beforeEach(() => {
      prisma.attempt = { count: jest.fn().mockResolvedValue(0) } as never;
      tenantPrisma.forTenant.mockImplementation((_ctx: unknown, fn: (tx: unknown) => unknown) => fn(prisma));
    });

    it('marks the organization deleted and audits it', async () => {
      prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', name: 'Acme', slug: 'acme', status: 'active' });
      prisma.organization.update.mockResolvedValue({ id: 'org-1', status: 'deleted' });

      const result = await service.softDelete('actor-1', 'org-1');

      expect(prisma.organization.update).toHaveBeenCalledWith({
        where: { id: 'org-1' },
        data: { status: 'deleted' },
        select: { id: true, status: true },
      });
      expect(result).toEqual({ id: 'org-1', status: 'deleted' });
      expect(audit.record).toHaveBeenCalledWith(
        { organizationId: 'org-1', isSuperAdmin: true },
        { actorUserId: 'actor-1', action: 'platform.organization_deleted', entityType: 'organization', entityId: 'org-1' },
      );
    });

    it('refuses while an exam is in progress and leaves the status unchanged', async () => {
      prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', name: 'Acme', slug: 'acme', status: 'active' });
      (prisma.attempt.count as jest.Mock).mockResolvedValue(2);

      await expect(service.softDelete('actor-1', 'org-1')).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.organization.update).not.toHaveBeenCalled();
    });

    it('counts in-progress attempts through the super-admin bypass', async () => {
      prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', name: 'Acme', slug: 'acme', status: 'active' });
      prisma.organization.update.mockResolvedValue({ id: 'org-1', status: 'deleted' });

      await service.softDelete('actor-1', 'org-1');

      // `attempts` is RLS-protected; a raw count would return 0 and the guard
      // would never fire.
      expect(tenantPrisma.forTenant).toHaveBeenCalledWith(
        { organizationId: 'org-1', isSuperAdmin: true },
        expect.any(Function),
      );
      expect(prisma.attempt.count).toHaveBeenCalledWith({
        where: { status: 'in_progress', exam: { organizationId: 'org-1' } },
      });
    });

    it('is idempotent for an already-deleted organization', async () => {
      prisma.organization.findUnique.mockResolvedValue({ id: 'org-1', name: 'Acme', slug: 'acme', status: 'deleted' });

      const result = await service.softDelete('actor-1', 'org-1');

      expect(result).toEqual({ id: 'org-1', status: 'deleted' });
      expect(prisma.organization.update).not.toHaveBeenCalled();
    });

    it('throws NotFound for an unknown organization', async () => {
      prisma.organization.findUnique.mockResolvedValue(null);

      await expect(service.softDelete('actor-1', 'nope')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  it('excludes deleted organizations from the list', async () => {
    prisma.organization.findMany.mockResolvedValue([]);
    prisma.organization.count.mockResolvedValue(0);
    tenantPrisma.forTenant.mockImplementation(() => ({ admins: [], userCounts: [], examCounts: [] }));

    await service.list({});

    expect(prisma.organization.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: { not: 'deleted' } }) }),
    );
  });
```

- [ ] **Step 2: Run and verify they fail**

Run: `npx jest --config apps/api/jest.config.js organizations.service --maxWorkers=2`

Expected: FAIL — `service.softDelete is not a function`, and the list `where` has no status filter.

- [ ] **Step 3: Implement `softDelete`**

Add to `apps/api/src/organizations/organizations.service.ts`:

```ts
  async softDelete(actorUserId: string, id: string): Promise<{ id: string; status: string }> {
    const existing = await this.prisma.organization.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Organization ${id} not found`);
    }
    if (existing.status === 'deleted') {
      return { id: existing.id, status: existing.status };
    }

    // `attempts` is RLS-protected; a count on the raw client returns 0 for every
    // organization, so this guard would pass while an exam was live.
    const liveAttempts = await this.tenantPrisma.forTenant({ organizationId: id, isSuperAdmin: true }, (tx) =>
      tx.attempt.count({ where: { status: 'in_progress', exam: { organizationId: id } } }),
    );
    if (liveAttempts > 0) {
      throw new ConflictException(
        `Cannot delete this organization while ${liveAttempts} exam${liveAttempts === 1 ? ' is' : 's are'} in progress`,
      );
    }

    // Soft delete: the organization owns exams, attempts, results and audit logs.
    // A cascade would destroy the audit trail recording this very deletion, and a
    // partial failure would strand rows behind an RLS boundary. Physical erasure
    // belongs with the GDPR erase flow.
    const updated = await this.prisma.organization.update({
      where: { id },
      data: { status: 'deleted' },
      select: { id: true, status: true },
    });

    await this.audit.record(
      { organizationId: id, isSuperAdmin: true },
      { actorUserId, action: 'platform.organization_deleted', entityType: 'organization', entityId: id },
    );

    return updated;
  }
```

- [ ] **Step 4: Exclude deleted rows from the list**

In `list()`, replace the `where` construction:

```ts
    const where = {
      status: { not: 'deleted' },
      ...(filters.search
        ? { OR: [{ name: { contains: filters.search } }, { slug: { contains: filters.search } }] }
        : {}),
    };
```

- [ ] **Step 5: Add the route**

In `apps/api/src/organizations/organizations.controller.ts`, add **after** the existing `@Delete('integrations/api-key')` so the literal route is matched first:

```ts
  @Delete(':id')
  @RequirePermissions('platform:manage_organizations')
  softDelete(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.organizationsService.softDelete(userId, id);
  }
```

- [ ] **Step 6: Run the tests and verify they pass**

Run: `npx jest --config apps/api/jest.config.js organizations --maxWorkers=2`

Expected: PASS, including the existing `DELETE /organizations/integrations/api-key` test. If that route now resolves to `softDelete`, move `@Delete(':id')` below it.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/organizations/
git commit -m "feat: soft delete an organization, refused while an exam is live"
```

---

### Task 15: Delete from the list, behind a typed-slug confirmation

**Files:**
- Create: `apps/web/app/(platform)/organizations/DeleteOrganizationDialog.tsx`
- Modify: `apps/web/lib/hooks/useOrganizations.ts`
- Modify: `apps/web/app/(platform)/organizations/page.tsx`
- Test: `apps/web/app/(platform)/organizations/DeleteOrganizationDialog.test.tsx`

**Interfaces:**
- Consumes: `DELETE /organizations/:id` (Task 14).
- Produces: `useDeleteOrganization()`, and `DeleteOrganizationDialog({ organization, onClose })` where `null` renders it closed.

- [ ] **Step 1: Write the failing tests**

Create `apps/web/app/(platform)/organizations/DeleteOrganizationDialog.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeleteOrganizationDialog } from './DeleteOrganizationDialog';
import { AuthProvider } from '../../../lib/auth-context';
import { QueryProvider } from '../../../lib/query-provider';
import { ToastProvider } from '../../../components/ui';
import { fakeJwt } from '../../../lib/test-utils/fake-jwt';
import { Organization } from '../../../lib/types';

const ORG: Organization = {
  id: 'org-1', name: 'Acme', slug: 'acme', region: 'us', status: 'active',
  createdAt: '2026-01-01T00:00:00.000Z',
  primaryAdminName: 'Ada', primaryAdminEmail: 'ada@acme.test', userCount: 12, examCount: 8,
};

function renderDialog(onClose = jest.fn(), deleteResponse?: Response) {
  const token = fakeJwt({ sub: 'u1', organizationId: null, role: 'super_admin' });
  global.fetch = jest.fn(async (url: string, options?: RequestInit) => {
    if (String(url).endsWith('/auth/refresh')) {
      return new Response(JSON.stringify({ accessToken: token }), { status: 200 });
    }
    if (options?.method === 'DELETE') {
      return deleteResponse ?? new Response(JSON.stringify({ id: 'org-1', status: 'deleted' }), { status: 200 });
    }
    return new Response('{}', { status: 200 });
  }) as unknown as typeof fetch;

  render(
    <QueryProvider>
      <AuthProvider>
        <ToastProvider>
          <DeleteOrganizationDialog organization={ORG} onClose={onClose} />
        </ToastProvider>
      </AuthProvider>
    </QueryProvider>,
  );
  return onClose;
}

describe('DeleteOrganizationDialog', () => {
  it('keeps Delete disabled until the slug is typed exactly', async () => {
    renderDialog();
    const confirm = screen.getByRole('button', { name: 'Delete organization' });

    expect(confirm).toBeDisabled();

    await userEvent.type(screen.getByLabelText(/Type acme to confirm/), 'acm');
    expect(confirm).toBeDisabled();

    await userEvent.type(screen.getByLabelText(/Type acme to confirm/), 'e');
    expect(confirm).toBeEnabled();
  });

  it('states what will happen, including the row counts', () => {
    renderDialog();
    expect(screen.getByText(/12 users/)).toBeInTheDocument();
    expect(screen.getByText(/8 exams/)).toBeInTheDocument();
  });

  it('sends the delete and closes', async () => {
    const onClose = renderDialog();

    await userEvent.type(screen.getByLabelText(/Type acme to confirm/), 'acme');
    await userEvent.click(screen.getByRole('button', { name: 'Delete organization' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const del = (global.fetch as jest.Mock).mock.calls.find(([, o]) => o?.method === 'DELETE');
    expect(String(del[0])).toContain('/organizations/org-1');
  });

  it('surfaces the live-exam conflict and stays open', async () => {
    const onClose = renderDialog(
      jest.fn(),
      new Response(JSON.stringify({ message: 'Cannot delete this organization while 2 exams are in progress' }), { status: 409 }),
    );

    await userEvent.type(screen.getByLabelText(/Type acme to confirm/), 'acme');
    await userEvent.click(screen.getByRole('button', { name: 'Delete organization' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('2 exams are in progress'));
    expect(onClose).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run and verify they fail**

Run: `npx jest --config apps/web/jest.config.js DeleteOrganizationDialog --maxWorkers=2`

Expected: FAIL — module not found.

- [ ] **Step 3: Add the mutation hook**

Add to `apps/web/lib/hooks/useOrganizations.ts`:

```ts
export function useDeleteOrganization() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string): Promise<{ id: string; status: string }> =>
      apiFetch(`/organizations/${id}`, { method: 'DELETE' }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['organizations'] }),
  });
}
```

- [ ] **Step 4: Implement the dialog**

Create `apps/web/app/(platform)/organizations/DeleteOrganizationDialog.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useDeleteOrganization } from '../../../lib/hooks/useOrganizations';
import { Modal, Input, Button, useToast } from '../../../components/ui';
import { Organization } from '../../../lib/types';

export function DeleteOrganizationDialog({
  organization,
  onClose,
}: {
  organization: Organization | null;
  onClose: () => void;
}) {
  const deleteOrganization = useDeleteOrganization();
  const { toast } = useToast();
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);

  // The dialog stays mounted between rows; without this, a slug typed for one
  // organization would leave the button armed for the next one opened.
  useEffect(() => {
    setTyped('');
    setError(null);
  }, [organization]);

  function handleDelete() {
    if (!organization) return;
    setError(null);
    deleteOrganization.mutate(organization.id, {
      onSuccess: () => {
        toast(`${organization.name} deleted.`);
        onClose();
      },
      onError: (err) => setError(err instanceof Error ? err.message : 'Failed to delete organization'),
    });
  }

  return (
    <Modal open={organization !== null} title="Delete organization" onClose={onClose}>
      {organization && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-gray-700">
            <strong>{organization.name}</strong> will be removed from the console and nobody in it will be able to
            sign in. Its {organization.userCount} users and {organization.examCount} exams are retained, not erased,
            so this can be reversed.
          </p>
          <Input
            label={`Type ${organization.slug} to confirm`}
            value={typed}
            onChange={setTyped}
          />
          <Button
            variant="secondary"
            onClick={handleDelete}
            disabled={typed !== organization.slug || deleteOrganization.isPending}
            className="text-status-danger"
          >
            Delete organization
          </Button>
          {error && (
            <p role="alert" className="text-sm text-status-danger">
              {error}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
```

- [ ] **Step 5: Wire it into the page**

In `apps/web/app/(platform)/organizations/page.tsx`:

```tsx
  const [deleting, setDeleting] = useState<Organization | null>(null);
```

Add as the last row action:

```tsx
              { label: 'Delete', onSelect: () => setDeleting(org), danger: true },
```

Render it:

```tsx
      <DeleteOrganizationDialog organization={deleting} onClose={() => setDeleting(null)} />
```

- [ ] **Step 6: Run the tests and verify they pass**

Run: `npx jest --config apps/web/jest.config.js "(platform)" --maxWorkers=2`

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add "apps/web/app/(platform)/organizations/" apps/web/lib/hooks/useOrganizations.ts
git commit -m "feat: delete an organization behind a typed-slug confirmation"
```

---

### Task 16: Platform Admins and All Users adopt `ListView`

Three tabs that look like three different products is what makes the console feel unfinished. This is what makes the redesign a console rather than one good page.

**Files:**
- Modify: `apps/web/app/(platform)/platform-admins/page.tsx`
- Modify: `apps/web/app/(platform)/all-users/page.tsx`
- Modify: `apps/web/app/(platform)/platform-admins/page.test.tsx`
- Modify: `apps/web/app/(platform)/all-users/page.test.tsx`

**Interfaces:**
- Consumes: `ListView` (Task 5), `RowActions` (Task 6).
- Produces: nothing.

All Users additionally honours `?org=<slug>` from the URL as its initial search term — this is the destination of the Organizations row menu's `View users` (Task 8).

**What each page has today, all of which must survive the conversion:**

| Page | Data hook | Row type | Existing actions |
|---|---|---|---|
| `platform-admins` | `useSuperAdmins({ page, pageSize, search })` | `SuperAdminSummary` — `{ id, email, createdAt }` | Invite-by-email form; Promote-by-email form; a shared confirm `Modal` before either fires |
| `all-users` | `useUserDirectory({ page, pageSize, search })` | `DirectoryUser` — `{ id, email, name, role, organizationId, organizationName, status }` | A per-row `Manage` button, shown only when `organizationId` is set, which switches into the org and pushes `/users` |

- [ ] **Step 1: Write the failing test for the org filter**

Add to `apps/web/app/(platform)/all-users/page.test.tsx`, and mock `useSearchParams` alongside the existing `next/navigation` mock:

```tsx
  it('pre-fills the search box from the org query parameter', async () => {
    renderPage({ org: 'Acme' });

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Search/)).toHaveValue('Acme');
    });
  });

  it('filters the directory by organization name', async () => {
    // This is what makes "View users" on the Organizations tab actually work.
    renderPage({ org: 'Acme' });

    expect(await screen.findByText('ada@acme.test')).toBeInTheDocument();
    expect(screen.queryByText('bob@beta.test')).not.toBeInTheDocument();
  });
```

Extend the file's `next/navigation` mock:

```tsx
let searchParams = new URLSearchParams();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => searchParams,
}));
```

and have `renderPage` accept `(params: Record<string, string> = {})` and set `searchParams = new URLSearchParams(params)` before rendering.

- [ ] **Step 3: Add an `initialSearch` prop to `ListView`**

In `apps/web/app/(platform)/components/ListView.tsx`, add to `ListViewProps<T>`:

```ts
  initialSearch?: string;
```

destructure it with `initialSearch = ''`, and change the search state:

```ts
  const [search, setSearch] = useState(initialSearch);
```

- [ ] **Step 4: Run the test and verify it fails**

Run: `npx jest --config apps/web/jest.config.js all-users --maxWorkers=2`

Expected: FAIL — the search box is empty.

The `all-users` fixture in that test file must contain at least two rows for the filter assertion to mean anything — one with `organizationName: 'Acme'` and email `ada@acme.test`, one with `organizationName: 'Beta'` and email `bob@beta.test`.

- [ ] **Step 5: Convert `all-users/page.tsx`**

Replace the whole file with:

```tsx
'use client';

import { useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Users } from 'lucide-react';
import { useUserDirectory } from '../../../lib/hooks/useUserDirectory';
import { useAuth } from '../../../lib/auth-context';
import { type Column } from '../../../components/ui';
import { DirectoryUser } from '../../../lib/types';
import { ListView } from '../components/ListView';
import { RowActions } from '../components/RowActions';

const DIRECTORY_PAGE_SIZE = 200;

export default function UsersDirectoryPage() {
  const router = useRouter();
  const { switchIntoOrg } = useAuth();
  const searchParams = useSearchParams();
  const { data, isLoading, isError } = useUserDirectory({ pageSize: DIRECTORY_PAGE_SIZE });

  const users = useMemo(() => data?.data ?? [], [data]);

  async function handleManage(user: DirectoryUser) {
    if (!user.organizationId) return;
    await switchIntoOrg(user.organizationId);
    router.push('/users');
  }

  const columns: Column<DirectoryUser>[] = useMemo(
    () => [
      { key: 'email', header: 'Email', render: (u) => <span className="font-medium text-gray-900">{u.email}</span>, sortValue: (u) => u.email },
      { key: 'name', header: 'Name', render: (u) => u.name ?? '—', sortValue: (u) => u.name ?? '' },
      { key: 'role', header: 'Role', render: (u) => u.role, sortValue: (u) => u.role },
      { key: 'organization', header: 'Organization', render: (u) => u.organizationName ?? '—', sortValue: (u) => u.organizationName ?? '' },
      { key: 'status', header: 'Status', render: (u) => u.status, sortValue: (u) => u.status },
      {
        key: 'actions',
        header: '',
        render: (u) => (
          <RowActions
            label={`Actions for ${u.email}`}
            // A user with no organization has nothing to manage; RowActions
            // renders nothing for an empty list, matching today's hidden button.
            actions={u.organizationId ? [{ label: 'Manage', onSelect: () => void handleManage(u) }] : []}
          />
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handleManage and router are stable for this page's lifetime
    [],
  );

  return (
    <ListView<DirectoryUser>
      title="All Users"
      icon={<Users size={22} />}
      columns={columns}
      rows={users}
      rowKey={(u) => u.id}
      searchMatch={(u, query) =>
        u.email.toLowerCase().includes(query) ||
        (u.name ?? '').toLowerCase().includes(query) ||
        (u.organizationName ?? '').toLowerCase().includes(query)
      }
      storageKey="all-users"
      searchPlaceholder="Search users…"
      emptyMessage="No users found."
      isLoading={isLoading}
      isError={isError}
      totalCount={data?.total}
      initialSearch={searchParams.get('org') ?? ''}
    />
  );
}
```

The organization name is included in `searchMatch` — that is what makes the Task 8 `View users` link filter to anything.

- [ ] **Step 6: Convert `platform-admins/page.tsx`**

Replace the whole file with:

```tsx
'use client';

import { useMemo, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useSuperAdmins, useInviteSuperAdmin, usePromoteSuperAdmin } from '../../../lib/hooks/useSuperAdmins';
import { Input, Button, Modal, useToast, type Column } from '../../../components/ui';
import { SuperAdminSummary } from '../../../lib/types';
import { ListView } from '../components/ListView';

const SUPER_ADMIN_PAGE_SIZE = 200;

type GrantKind = 'invite' | 'promote';

export default function PlatformAdminsPage() {
  const { data, isLoading, isError } = useSuperAdmins({ pageSize: SUPER_ADMIN_PAGE_SIZE });
  const inviteSuperAdmin = useInviteSuperAdmin();
  const promoteSuperAdmin = usePromoteSuperAdmin();
  const { toast } = useToast();

  // One modal serves both grants: the form and its confirmation are the same
  // two fields, and the only difference is which mutation fires.
  const [openForm, setOpenForm] = useState<GrantKind | null>(null);
  const [email, setEmail] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const superAdmins = useMemo(() => data?.data ?? [], [data]);

  function closeAll() {
    setOpenForm(null);
    setConfirming(false);
    setEmail('');
    setError(null);
  }

  function confirmGrant() {
    if (!openForm) return;
    setError(null);
    const mutation = openForm === 'invite' ? inviteSuperAdmin : promoteSuperAdmin;
    mutation.mutate(
      { email },
      {
        onSuccess: () => {
          toast(`Granted super_admin access to ${email}.`);
          closeAll();
        },
        onError: (err) => {
          setError(err instanceof Error ? err.message : 'Action failed');
          setConfirming(false);
        },
      },
    );
  }

  const columns: Column<SuperAdminSummary>[] = useMemo(
    () => [
      { key: 'email', header: 'Email', render: (sa) => <span className="font-medium text-gray-900">{sa.email}</span>, sortValue: (sa) => sa.email },
      { key: 'created', header: 'Created', render: (sa) => new Date(sa.createdAt).toLocaleDateString(), sortValue: (sa) => sa.createdAt },
    ],
    [],
  );

  return (
    <>
      <ListView<SuperAdminSummary>
        title="Platform Admins"
        icon={<ShieldCheck size={22} />}
        columns={columns}
        rows={superAdmins}
        rowKey={(sa) => sa.id}
        searchMatch={(sa, query) => sa.email.toLowerCase().includes(query)}
        storageKey="platform-admins"
        searchPlaceholder="Search platform admins…"
        emptyMessage="No platform admins yet."
        isLoading={isLoading}
        isError={isError}
        totalCount={data?.total}
        actions={
          <>
            <Button onClick={() => setOpenForm('invite')}>Invite admin</Button>
            <Button variant="secondary" onClick={() => setOpenForm('promote')}>
              Promote user
            </Button>
          </>
        }
      />

      <Modal
        open={openForm !== null && !confirming}
        title={openForm === 'promote' ? 'Promote existing user' : 'Invite new admin'}
        onClose={closeAll}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setConfirming(true);
          }}
          className="flex flex-col gap-3"
        >
          <Input
            label={openForm === 'promote' ? 'Promote by email' : 'Invite by email'}
            type="email"
            value={email}
            onChange={setEmail}
            required
          />
          <Button type="submit">{openForm === 'promote' ? 'Promote' : 'Invite'}</Button>
        </form>
        {error && (
          <p role="alert" className="mt-3 text-sm text-status-danger">
            {error}
          </p>
        )}
      </Modal>

      <Modal open={confirming} title="Confirm" onClose={() => setConfirming(false)}>
        <p className="mb-4 text-sm text-gray-700">
          Grant super_admin access to {email}? This cannot be undone from this screen.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirming(false)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={confirmGrant} loading={inviteSuperAdmin.isPending || promoteSuperAdmin.isPending}>
            Confirm
          </Button>
        </div>
      </Modal>
    </>
  );
}
```

Both pages drop `Pagination` and their local `page` state, matching Task 3's reasoning: sorting a paginated slice sorts only the visible page. `CardGrid` is no longer imported by either page — leave the component in place, other pages still use it.

**Existing tests in both page test files will need updating**, because the invite and promote forms are now behind buttons rather than always visible. Add the `userEvent.click(screen.getByRole('button', { name: 'Invite admin' }))` step before each assertion that reaches for the email field. Do not delete an assertion to make it pass.

- [ ] **Step 7: Run every platform test**

Run: `npx jest --config apps/web/jest.config.js "(platform)" --maxWorkers=2`

Expected: PASS, including every pre-existing assertion in both page tests. A test that only passes after being deleted means an action was dropped in the conversion — restore it.

- [ ] **Step 8: Verify all three tabs in a real browser**

Start the dev server through the preview tooling. Confirm on each of `/organizations`, `/platform-admins` and `/all-users`: the object header, item count, search box and column chooser all render and behave the same way. From `/organizations`, use a row menu's `View users` and confirm All Users opens filtered to that organization.

- [ ] **Step 9: Run the full suite across all three apps**

Run each separately — running them concurrently on this machine causes unrelated suites to fail on resource contention:

```
npx jest --config apps/api/jest.config.js --maxWorkers=2
npx jest --config apps/exam-runtime/jest.config.js --maxWorkers=2
npx jest --config apps/web/jest.config.js --maxWorkers=2
npx jest --config packages/shared/jest.config.js --maxWorkers=2
```

Expected: all green. If a suite fails, re-run that suite alone before diagnosing — contention produces failures that vanish in isolation.

- [ ] **Step 10: Commit**

```bash
git add "apps/web/app/(platform)/"
git commit -m "feat: adopt the shared ListView across all Platform Admin tabs"
```

---

## Deployment note

This plan touches `apps/api`, `apps/exam-runtime`, `apps/web` and `packages/shared`, so a deploy rebuilds and restarts all three services. It carries **no Prisma migration**.

Deployment is gated on explicit user approval and must not proceed without checking for live in-progress attempts immediately beforehand. After building `apps/web`, `.next/static` and `public` must be copied into `.next/standalone/apps/web/` or the browser will 404 on client chunks. Re-verify `connection_limit`, `pool_timeout`, `TRUST_PROXY` and `EXAM_RUNTIME_INTERNAL_URL` in both `.env` files afterwards — they are gitignored and any redeploy that regenerates them silently drops the settings.
