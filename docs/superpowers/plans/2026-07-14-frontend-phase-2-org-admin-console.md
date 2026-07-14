# Frontend Phase 2: Org Admin Console Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Org Admin console (staff users, org settings/branding, audit log, GDPR candidate data rights) plus the role-aware frontend routing it depends on.

**Architecture:** A new `(org-admin)` Next.js route group parallel to the existing `(recruiter)` group, gated on a `role` field decoded client-side from the already-issued access JWT (no backend auth change needed). One new backend endpoint (`GET /candidates/lookup?email=`) closes the one real capability gap; every other screen consumes backend endpoints that already exist and are already stable.

**Tech Stack:** Next.js App Router, TanStack Query, Radix UI + Tailwind component library (all from Frontend Phase 1), NestJS/Prisma backend.

## Global Constraints

- Role exposure is a client-side JWT payload decode (base64url, no signature verification) — it is a UI routing hint only; every real permission check stays server-side via `PermissionsGuard`, unchanged by this phase.
- "Invite a staff member" is direct account creation: the org_admin sets the new user's initial password themselves via `POST /users` (`CreateUserDto.password`, min 8 chars). There is no email-invite-with-token flow for staff.
- No user edit/deactivate — the backend has no endpoint for it and none is added this phase.
- Audit log ships full filter UI: `actorUserId`, `action`, `entityType`, `from`, `to`, plus cursor-based "Load more" pagination — matching every param `GET /audit-logs` already supports.
- GDPR export renders in-page (profile, invitations, attempts) with a "Download JSON" button that serializes the already-fetched response client-side — no second network call.
- The new `GET /candidates/lookup?email=` endpoint is gated on `candidate:data_rights` only — it must not be reachable with `candidate:manage`, and must not let a caller browse the full candidate list (only exact-email match).
- No dedicated Roles/permissions screen — the invite-user role dropdown hardcodes `org_admin` / `recruiter` / `panel` (the exact set `CreateUserDto` accepts).
- `/users` is the org_admin landing route (post-login redirect target) — no separate dashboard this phase.
- Testing matches Frontend Phase 1's established pattern: Jest + React Testing Library per component/screen (real fetch mocking, not hook mocking), one Playwright e2e suite against real dev-mode servers.

---

### Task 1: Backend — Candidate lookup-by-email endpoint

**Files:**
- Modify: `apps/api/src/candidates/candidates.controller.ts`
- Modify: `apps/api/src/candidates/candidates.service.ts`
- Modify: `apps/api/test/candidate-data-rights.e2e-spec.ts`

**Interfaces:**
- Consumes: nothing new — reuses `TenantContext`, `TenantPrismaService`, existing `Candidate` Prisma type, existing `RequirePermissions` decorator.
- Produces: `GET /candidates/lookup?email=<email>` — requires `candidate:data_rights` — returns the full `Candidate` record (`{ id, organizationId, email, name, phone, createdAt, erasedAt }`) on match, `404` on no match, `400` if `email` query param is missing. Consumed by Task 6's `useLookupCandidate` hook.

- [ ] **Step 1: Write the failing e2e test**

Open `apps/api/test/candidate-data-rights.e2e-spec.ts`. Add these three `it` blocks immediately before the final closing `});` of the `describe('Candidate data subject rights (GDPR export + erasure)', ...)` block (i.e., after the existing `'records both data-rights actions in the audit log'` test):

```ts
  it('looks up a candidate by exact email match for an org_admin', async () => {
    const response = await request(adminHttp)
      .get('/api/v1/candidates/lookup')
      .query({ email: `erased-${candidateId}@redacted.invalid` })
      .set('Authorization', `Bearer ${orgAdminAccessToken}`)
      .expect(200);

    expect(response.body.id).toBe(candidateId);
  });

  it('returns 404 for an email with no match, and 400 when email is omitted', async () => {
    await request(adminHttp)
      .get('/api/v1/candidates/lookup')
      .query({ email: 'nobody@nowhere.test' })
      .set('Authorization', `Bearer ${orgAdminAccessToken}`)
      .expect(404);

    await request(adminHttp)
      .get('/api/v1/candidates/lookup')
      .set('Authorization', `Bearer ${orgAdminAccessToken}`)
      .expect(400);
  });

  it('rejects recruiter (no candidate:data_rights) on lookup with 403', async () => {
    await request(adminHttp)
      .get('/api/v1/candidates/lookup')
      .query({ email: `erased-${candidateId}@redacted.invalid` })
      .set('Authorization', `Bearer ${recruiterAccessToken}`)
      .expect(403);
  });
```

Note: this suite's existing `'erases the candidate...'` test runs before these new tests in file order and leaves `candidateId`'s email set to `erased-${candidateId}@redacted.invalid` — that's why the lookup test searches for that exact redacted email rather than the original `gina@gdpr-a.test` (Jest runs `it` blocks within a `describe` in declaration order, so this is deterministic).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd "D:\exam app" && export DATABASE_URL='sqlserver://localhost:1433;database=examapp;user=examapp_dev;password=DevPassw0rd!2026;trustServerCertificate=true' && npm run test:api:e2e -- --runInBand -t "Candidate data subject rights"`

Expected: FAIL — the three new tests get `404 Not Found` (from Nest's default unmatched-route handler, not the app's own `NotFoundException`) on the first two, since `GET /candidates/lookup` doesn't exist yet, and the third also fails since there's no route to reject.

- [ ] **Step 3: Implement the endpoint**

In `apps/api/src/candidates/candidates.controller.ts`, change the import line to add `BadRequestException`:

```ts
import { BadRequestException, Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
```

Add a new route immediately after the existing `list()` method (before `bulkUpload`):

```ts
  @Get('lookup')
  @RequirePermissions('candidate:data_rights')
  lookupByEmail(@CurrentTenant() tenant: TenantContext, @Query('email') email?: string) {
    if (!email) {
      throw new BadRequestException('email query parameter is required');
    }
    return this.candidatesService.lookupByEmail(tenant, email);
  }
```

In `apps/api/src/candidates/candidates.service.ts`, add this method right after `list()`:

```ts
  async lookupByEmail(context: TenantContext, email: string): Promise<Candidate> {
    const candidate = await this.tenantPrisma.forTenant(context, (tx) =>
      tx.candidate.findFirst({
        where: { organizationId: context.organizationId as string, email },
      }),
    );
    if (!candidate) {
      throw new NotFoundException(`No candidate found with email ${email}`);
    }
    return candidate;
  }
```

`NotFoundException` and `Candidate` are already imported at the top of this file (used by `exportData`/`erase` and the Prisma type import respectively) — no new imports needed there.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd "D:\exam app" && export DATABASE_URL='sqlserver://localhost:1433;database=examapp;user=examapp_dev;password=DevPassw0rd!2026;trustServerCertificate=true' && npm run test:api:e2e -- --runInBand -t "Candidate data subject rights"`

Expected: PASS — all tests in the suite (the pre-existing 5 plus these 3 new ones = 8) green.

- [ ] **Step 5: Run the full backend unit + e2e suites to confirm no regressions**

Run: `npm run test:api` — expected 214/214 unchanged (no unit tests touched).
Run: `npm run test:api:e2e -- --runInBand` (with `DATABASE_URL` exported as above) — expected 83 + 3 = 86/86.

- [ ] **Step 6: Commit**

```bash
cd "D:\exam app"
git add apps/api/src/candidates/candidates.controller.ts apps/api/src/candidates/candidates.service.ts apps/api/test/candidate-data-rights.e2e-spec.ts
git commit -m "feat: add GET /candidates/lookup by-email endpoint for org admin data rights"
```

---

### Task 2: Frontend — Role exposure, recruiter role gate, login redirect

**Files:**
- Create: `apps/web/lib/jwt.ts`
- Create: `apps/web/lib/jwt.test.ts`
- Create: `apps/web/lib/test-utils/fake-jwt.ts`
- Modify: `apps/web/lib/auth-context.tsx`
- Modify: `apps/web/app/(recruiter)/layout.tsx`
- Modify: `apps/web/app/(recruiter)/layout.test.tsx`
- Modify: `apps/web/app/login/page.tsx`
- Modify: `apps/web/app/login/page.test.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks in this phase.
- Produces: `decodeJwtPayload(token: string): Record<string, unknown> | null` from `lib/jwt.ts` — consumed by `auth-context.tsx` and `login/page.tsx`. `useAuth()` gains a `role: string | null` field on `AuthContextValue` — consumed by Task 3's `(org-admin)/layout.tsx`. `fakeJwt(payload: Record<string, unknown>): string` from `lib/test-utils/fake-jwt.ts` — a test-only helper, consumed by every later task's tests that need a role-bearing token.

- [ ] **Step 1: Write the failing test for the JWT decode utility**

Create `apps/web/lib/test-utils/fake-jwt.ts`:

```ts
export function fakeJwt(payload: Record<string, unknown>): string {
  const base64url = (obj: Record<string, unknown>) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  return `${base64url({ alg: 'none', typ: 'JWT' })}.${base64url(payload)}.sig`;
}
```

Create `apps/web/lib/jwt.test.ts`:

```ts
import { decodeJwtPayload } from './jwt';
import { fakeJwt } from './test-utils/fake-jwt';

describe('decodeJwtPayload', () => {
  it('decodes a well-formed JWT payload', () => {
    const token = fakeJwt({ sub: 'u1', organizationId: 'org1', role: 'org_admin' });
    expect(decodeJwtPayload(token)).toEqual({ sub: 'u1', organizationId: 'org1', role: 'org_admin' });
  });

  it('returns null for a malformed token', () => {
    expect(decodeJwtPayload('not-a-jwt')).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(decodeJwtPayload('')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test --workspace=apps/web -- jwt.test`
Expected: FAIL with "Cannot find module './jwt'" (the file doesn't exist yet).

- [ ] **Step 3: Implement the JWT decode utility**

Create `apps/web/lib/jwt.ts`:

```ts
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const payload = token.split('.')[1];
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test --workspace=apps/web -- jwt.test`
Expected: PASS, 3/3.

- [ ] **Step 5: Expose role from AuthProvider**

Replace the full contents of `apps/web/lib/auth-context.tsx`:

```tsx
'use client';

import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { apiFetch, setUnauthorizedHandler } from './api-client';
import { decodeJwtPayload } from './jwt';

interface AuthContextValue {
  accessToken: string | null;
  organizationSlug: string | null;
  role: string | null;
  isLoading: boolean;
  login: (organizationSlug: string, accessToken: string) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const SLUG_STORAGE_KEY = 'organizationSlug';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [organizationSlug, setOrganizationSlug] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const accessTokenRef = useRef<string | null>(null);
  accessTokenRef.current = accessToken;

  function applyToken(token: string | null) {
    setAccessToken(token);
    const payload = token ? decodeJwtPayload(token) : null;
    setRole(payload && typeof payload.role === 'string' ? payload.role : null);
  }

  async function silentRefresh(): Promise<string | null> {
    try {
      const result = await apiFetch('/auth/refresh', { method: 'POST', body: JSON.stringify({}) });
      applyToken(result.accessToken);
      return result.accessToken;
    } catch {
      applyToken(null);
      return null;
    }
  }

  useEffect(() => {
    setUnauthorizedHandler(silentRefresh);
    const storedSlug = typeof window !== 'undefined' ? window.sessionStorage.getItem(SLUG_STORAGE_KEY) : null;
    if (storedSlug) {
      setOrganizationSlug(storedSlug);
    }
    silentRefresh().finally(() => setIsLoading(false));
    return () => setUnauthorizedHandler(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function login(slug: string, token: string) {
    setOrganizationSlug(slug);
    applyToken(token);
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(SLUG_STORAGE_KEY, slug);
    }
  }

  async function logout() {
    await apiFetch('/auth/logout', { method: 'POST', body: JSON.stringify({}) }).catch(() => undefined);
    applyToken(null);
    setOrganizationSlug(null);
    if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem(SLUG_STORAGE_KEY);
    }
  }

  return (
    <AuthContext.Provider value={{ accessToken, organizationSlug, role, isLoading, login, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
```

- [ ] **Step 6: Write the failing test for the recruiter role gate**

Open `apps/web/app/(recruiter)/layout.test.tsx`. Replace the top of the file (imports and the `jest.mock` line) with:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import RecruiterLayout from './layout';
import { AuthProvider } from '../../lib/auth-context';
import { QueryProvider } from '../../lib/query-provider';
import { fakeJwt } from '../../lib/test-utils/fake-jwt';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }), usePathname: () => '/dashboard' }));
```

Change the `describe` block's `afterEach` to also clear the mock:

```tsx
describe('Recruiter layout', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    mockPush.mockClear();
  });
```

Add a new test right after the existing `'renders the sidebar nav links'` test, before the closing `});` of the `describe` block:

```tsx
  it('redirects an org_admin (wrong role) to /login instead of rendering the recruiter shell', async () => {
    const orgAdminToken = fakeJwt({ sub: 'u1', organizationId: 'org1', role: 'org_admin' });
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: orgAdminToken }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    render(
      <QueryProvider>
        <AuthProvider>
          <RecruiterLayout>
            <p>Page content</p>
          </RecruiterLayout>
        </AuthProvider>
      </QueryProvider>,
    );

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/login'));
    expect(screen.queryByRole('link', { name: 'Dashboard' })).not.toBeInTheDocument();
  });
```

- [ ] **Step 7: Run the test to verify it fails**

Run: `npm run test --workspace=apps/web -- "app/(recruiter)/layout"`
Expected: FAIL — the new test times out waiting for `mockPush` to have been called with `/login`, since the layout doesn't check role yet.

- [ ] **Step 8: Add the role gate to the recruiter layout**

In `apps/web/app/(recruiter)/layout.tsx`, change the destructuring and the `useEffect`/render-guard:

```tsx
  const { accessToken, organizationSlug, role, isLoading } = useAuth();
  const { data: branding } = useBranding(organizationSlug);

  useEffect(() => {
    if (!isLoading && !accessToken) {
      router.push('/login');
    } else if (!isLoading && accessToken && role && role !== 'recruiter') {
      router.push('/login');
    }
  }, [isLoading, accessToken, role, router]);

  const themeStyle = {
    ...(branding?.primaryColor ? { '--color-primary': branding.primaryColor } : {}),
    ...(branding?.accentColor ? { '--color-accent': branding.accentColor } : {}),
  } as React.CSSProperties;

  if (isLoading || !accessToken || (role !== null && role !== 'recruiter')) {
    return <p className="p-8 text-sm text-gray-500">Loading…</p>;
  }
```

Every other line in this file is unchanged.

- [ ] **Step 9: Run the test to verify it passes**

Run: `npm run test --workspace=apps/web -- "app/(recruiter)/layout"`
Expected: PASS, 2/2 (both the pre-existing nav-links test and the new redirect test).

- [ ] **Step 10: Write the failing test for role-based login redirect**

Open `apps/web/app/login/page.test.tsx`. Add the import and replace the `jest.mock` line:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoginPage from './page';
import { AuthProvider } from '../../lib/auth-context';
import { QueryProvider } from '../../lib/query-provider';
import { fakeJwt } from '../../lib/test-utils/fake-jwt';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }));
```

Add `mockPush.mockClear();` to the existing `afterEach`:

```tsx
describe('LoginPage', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    mockPush.mockClear();
  });
```

Add a new test after the existing one, before the closing `});` of the `describe` block:

```tsx
  it('redirects org_admin to /users after login', async () => {
    const orgAdminToken = fakeJwt({ sub: 'u1', organizationId: 'org1', role: 'org_admin' });
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ message: 'no session' }), { status: 401 });
      }
      if (String(url).endsWith('/auth/staff/login')) {
        return new Response(JSON.stringify({ accessToken: orgAdminToken }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    render(
      <QueryProvider>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </QueryProvider>,
    );

    await userEvent.type(screen.getByLabelText(/organization slug/i), 'demo-org');
    await userEvent.type(screen.getByLabelText(/email/i), 'admin@demo-org.test');
    await userEvent.type(screen.getByLabelText(/password/i), 'DevAdmin123!');
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/users'));
  });
```

- [ ] **Step 11: Run the test to verify it fails**

Run: `npm run test --workspace=apps/web -- login/page.test`
Expected: FAIL — `mockPush` is called with `/dashboard`, not `/users` (login always redirects to `/dashboard` today).

- [ ] **Step 12: Add role-branching redirect to the login page**

In `apps/web/app/login/page.tsx`, add the import:

```tsx
import { decodeJwtPayload } from '../../lib/jwt';
```

Replace the body of `handleSubmit`:

```tsx
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const result = await apiFetch('/auth/staff/login', {
        method: 'POST',
        body: JSON.stringify({ organizationSlug: organizationSlug || undefined, email, password }),
      });
      login(organizationSlug, result.accessToken);
      const payload = decodeJwtPayload(result.accessToken);
      router.push(payload?.role === 'org_admin' ? '/users' : '/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    }
  }
```

- [ ] **Step 13: Run the test to verify it passes**

Run: `npm run test --workspace=apps/web -- login/page.test`
Expected: PASS, 2/2.

- [ ] **Step 14: Run the full frontend unit suite**

Run: `npm run test --workspace=apps/web`
Expected: PASS, 44 + 3 (jwt.test) + 2 (new layout/login cases) = 49/49.

- [ ] **Step 15: Commit**

```bash
cd "D:\exam app"
git add apps/web/lib/jwt.ts apps/web/lib/jwt.test.ts apps/web/lib/test-utils/fake-jwt.ts apps/web/lib/auth-context.tsx apps/web/app/\(recruiter\)/layout.tsx "apps/web/app/(recruiter)/layout.test.tsx" apps/web/app/login/page.tsx apps/web/app/login/page.test.tsx
git commit -m "feat: expose user role client-side, gate recruiter shell, branch login redirect by role"
```

---

### Task 3: Frontend — Org-admin shell + Staff Users screen

**Files:**
- Create: `apps/web/app/(org-admin)/layout.tsx`
- Create: `apps/web/app/(org-admin)/layout.test.tsx`
- Create: `apps/web/lib/hooks/useUsers.ts`
- Create: `apps/web/app/(org-admin)/users/page.tsx`
- Create: `apps/web/app/(org-admin)/users/page.test.tsx`
- Modify: `apps/web/lib/types.ts`

**Interfaces:**
- Consumes: `useAuth()`'s `role` field (Task 2), `useBranding` (Frontend Phase 1), `Table`/`Input`/`Select`/`Button`/`useToast` from `components/ui` (Frontend Phase 1).
- Produces: `StaffUser` type in `lib/types.ts` — consumed by Task 5 (audit log entries reference `actorEmail`, not `StaffUser` directly, so no cross-task dependency there). `useUsers()` / `useCreateUser()` from `lib/hooks/useUsers.ts` — used only within this task. The `(org-admin)` route group and its nav (`Staff Users` / `Org Settings` / `Audit Log` / `Candidate Data Rights`) — Tasks 4-6 each add one more page under this same layout; no code dependency, just directory placement.

- [ ] **Step 1: Add the StaffUser type**

In `apps/web/lib/types.ts`, add after the `Tag` interface (near the top):

```ts
export interface StaffUser {
  id: string;
  organizationId: string | null;
  email: string;
  role: string;
  status: string;
  lastLoginAt: string | null;
  createdAt: string;
}
```

- [ ] **Step 2: Write the failing test for the org-admin layout**

Create `apps/web/app/(org-admin)/layout.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import OrgAdminLayout from './layout';
import { AuthProvider } from '../../lib/auth-context';
import { QueryProvider } from '../../lib/query-provider';
import { fakeJwt } from '../../lib/test-utils/fake-jwt';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }), usePathname: () => '/users' }));

describe('Org admin layout', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    mockPush.mockClear();
  });

  it('renders the org-admin sidebar nav links for an org_admin', async () => {
    const orgAdminToken = fakeJwt({ sub: 'u1', organizationId: 'org1', role: 'org_admin' });
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: orgAdminToken }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    render(
      <QueryProvider>
        <AuthProvider>
          <OrgAdminLayout>
            <p>Page content</p>
          </OrgAdminLayout>
        </AuthProvider>
      </QueryProvider>,
    );

    expect(await screen.findByRole('link', { name: 'Staff Users' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Org Settings' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Audit Log' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Candidate Data Rights' })).toBeInTheDocument();
  });

  it('redirects a recruiter (wrong role) to /login instead of rendering the org-admin shell', async () => {
    const recruiterToken = fakeJwt({ sub: 'u1', organizationId: 'org1', role: 'recruiter' });
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: recruiterToken }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    render(
      <QueryProvider>
        <AuthProvider>
          <OrgAdminLayout>
            <p>Page content</p>
          </OrgAdminLayout>
        </AuthProvider>
      </QueryProvider>,
    );

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/login'));
    expect(screen.queryByRole('link', { name: 'Staff Users' })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm run test --workspace=apps/web -- "app/(org-admin)/layout"`
Expected: FAIL with "Cannot find module './layout'" (the layout doesn't exist yet).

- [ ] **Step 4: Implement the org-admin layout**

Create `apps/web/app/(org-admin)/layout.tsx`:

```tsx
'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import clsx from 'clsx';
import { useAuth } from '../../lib/auth-context';
import { useBranding } from '../../lib/hooks/useBranding';

const NAV_ITEMS = [
  { href: '/users', label: 'Staff Users' },
  { href: '/settings/branding', label: 'Org Settings' },
  { href: '/audit-log', label: 'Audit Log' },
  { href: '/data-rights', label: 'Candidate Data Rights' },
];

export default function OrgAdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { accessToken, organizationSlug, role, isLoading } = useAuth();
  const { data: branding } = useBranding(organizationSlug);

  useEffect(() => {
    if (!isLoading && !accessToken) {
      router.push('/login');
    } else if (!isLoading && accessToken && role && role !== 'org_admin') {
      router.push('/login');
    }
  }, [isLoading, accessToken, role, router]);

  const themeStyle = {
    ...(branding?.primaryColor ? { '--color-primary': branding.primaryColor } : {}),
    ...(branding?.accentColor ? { '--color-accent': branding.accentColor } : {}),
  } as React.CSSProperties;

  if (isLoading || !accessToken || (role !== null && role !== 'org_admin')) {
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

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test --workspace=apps/web -- "app/(org-admin)/layout"`
Expected: PASS, 2/2.

- [ ] **Step 6: Write the failing test for the Users screen**

Create `apps/web/app/(org-admin)/users/page.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import UsersPage from './page';
import { AuthProvider } from '../../../lib/auth-context';
import { QueryProvider } from '../../../lib/query-provider';
import { ToastProvider } from '../../../components/ui';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));

describe('UsersPage', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('lists staff users and adds a new one', async () => {
    const fetchMock = jest.fn(async (url, options) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).endsWith('/users') && options?.method === 'POST') {
        return new Response(
          JSON.stringify({
            id: 'user-2', organizationId: 'org-1', email: 'new@demo-org.test', role: 'recruiter',
            status: 'active', lastLoginAt: null, createdAt: '2026-07-14T00:00:00.000Z',
          }),
          { status: 201 },
        );
      }
      if (String(url).endsWith('/users')) {
        return new Response(
          JSON.stringify([
            {
              id: 'user-1', organizationId: 'org-1', email: 'admin@demo-org.test', role: 'org_admin',
              status: 'active', lastLoginAt: '2026-07-10T00:00:00.000Z', createdAt: '2026-07-01T00:00:00.000Z',
            },
          ]),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(
      <QueryProvider>
        <ToastProvider>
          <AuthProvider>
            <UsersPage />
          </AuthProvider>
        </ToastProvider>
      </QueryProvider>,
    );

    await waitFor(() => expect(screen.getByText('admin@demo-org.test')).toBeInTheDocument());

    await userEvent.type(screen.getByLabelText('Email'), 'new@demo-org.test');
    await userEvent.type(screen.getByLabelText('Password'), 'Passw0rd!2026');
    await userEvent.click(screen.getByRole('button', { name: 'Add staff member' }));

    await waitFor(() =>
      expect(fetchMock.mock.calls.some((call) => String(call[0]).endsWith('/users') && call[1]?.method === 'POST')).toBe(true),
    );
    const createCall = fetchMock.mock.calls.find((call) => String(call[0]).endsWith('/users') && call[1]?.method === 'POST');
    expect(JSON.parse((createCall![1] as RequestInit).body as string)).toEqual({
      email: 'new@demo-org.test',
      password: 'Passw0rd!2026',
      role: 'recruiter',
    });
  });

  it('shows error state when the user list fails to load', async () => {
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).endsWith('/users')) {
        return new Response(JSON.stringify({ message: 'Server error' }), { status: 500 });
      }
      return new Response(JSON.stringify([]), { status: 200 });
    }) as unknown as typeof fetch;

    render(
      <QueryProvider>
        <ToastProvider>
          <AuthProvider>
            <UsersPage />
          </AuthProvider>
        </ToastProvider>
      </QueryProvider>,
    );

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument(), { timeout: 2000 });
    expect(screen.getByText('Failed to load users.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 7: Run the test to verify it fails**

Run: `npm run test --workspace=apps/web -- "app/(org-admin)/users/page"`
Expected: FAIL with "Cannot find module './page'" (neither the hook nor the page exist yet).

- [ ] **Step 8: Implement the useUsers hooks**

Create `apps/web/lib/hooks/useUsers.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { StaffUser } from '../types';
import { useAuth } from '../auth-context';

export function useUsers() {
  const { accessToken } = useAuth();
  return useQuery<StaffUser[]>({
    queryKey: ['users'],
    queryFn: () => apiFetch('/users', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}

interface CreateUserInput {
  email: string;
  password: string;
  role: string;
}

export function useCreateUser() {
  const { accessToken } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateUserInput) =>
      apiFetch('/users', { method: 'POST', body: JSON.stringify(input) }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });
}
```

- [ ] **Step 9: Implement the Users page**

Create `apps/web/app/(org-admin)/users/page.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useUsers, useCreateUser } from '../../../lib/hooks/useUsers';
import { Table, Input, Select, Button, useToast, type Column } from '../../../components/ui';
import { StaffUser } from '../../../lib/types';

const ROLE_OPTIONS = [
  { value: 'org_admin', label: 'Org Admin' },
  { value: 'recruiter', label: 'Recruiter' },
  { value: 'panel', label: 'Interview Panel' },
];

export default function UsersPage() {
  const { data: users, isLoading, isError } = useUsers();
  const createUser = useCreateUser();
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('recruiter');
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    createUser.mutate(
      { email, password, role },
      {
        onSuccess: () => {
          toast(`Added ${email} as ${role}.`);
          setEmail('');
          setPassword('');
          setRole('recruiter');
        },
        onError: (err) => setError(err instanceof Error ? err.message : 'Failed to add user'),
      },
    );
  }

  const columns: Column<StaffUser>[] = [
    { key: 'email', header: 'Email', render: (user) => user.email, sortValue: (user) => user.email },
    { key: 'role', header: 'Role', render: (user) => user.role, sortValue: (user) => user.role },
    { key: 'status', header: 'Status', render: (user) => user.status },
    {
      key: 'lastLoginAt',
      header: 'Last login',
      render: (user) => (user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : 'Never'),
    },
  ];

  if (isLoading) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-semibold">Staff Users</h1>
        <p className="text-sm text-gray-500">Loading…</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-semibold">Staff Users</h1>
        <p role="alert" className="text-sm text-red-600">
          Failed to load users.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Staff Users</h1>
      <form onSubmit={handleSubmit} className="mb-6 flex items-end gap-2">
        <Input label="Email" type="email" value={email} onChange={setEmail} required />
        <Input label="Password" type="password" value={password} onChange={setPassword} required minLength={8} />
        <Select label="Role" value={role} onChange={setRole} options={ROLE_OPTIONS} />
        <Button type="submit">Add staff member</Button>
      </form>
      {error && (
        <p role="alert" className="mb-4 text-sm text-red-600">
          {error}
        </p>
      )}
      <Table columns={columns} rows={users ?? []} rowKey={(user) => user.id} emptyMessage="No staff users yet." />
    </div>
  );
}
```

- [ ] **Step 10: Run the test to verify it passes**

Run: `npm run test --workspace=apps/web -- "app/(org-admin)/users/page"`
Expected: PASS, 2/2.

- [ ] **Step 11: Run the full frontend unit suite and the frontend build**

Run: `npm run test --workspace=apps/web` — expected 49 + 2 (layout) + 2 (users page) = 53/53.
Run: `npm run build --workspace=apps/web` — expected exit 0, with `/users` appearing in the route list.

- [ ] **Step 12: Commit**

```bash
cd "D:\exam app"
git add "apps/web/app/(org-admin)/layout.tsx" "apps/web/app/(org-admin)/layout.test.tsx" apps/web/lib/hooks/useUsers.ts "apps/web/app/(org-admin)/users/page.tsx" "apps/web/app/(org-admin)/users/page.test.tsx" apps/web/lib/types.ts
git commit -m "feat: org-admin shell layout and staff users list/create screen"
```

---

### Task 4: Frontend — Relocate Org Settings/Branding to the org-admin section

**Files:**
- Create: `apps/web/app/(org-admin)/settings/branding/page.tsx` (moved content)
- Create: `apps/web/app/(org-admin)/settings/branding/page.test.tsx`
- Delete: `apps/web/app/(recruiter)/settings/branding/page.tsx`

**Interfaces:**
- Consumes: nothing new — this page's own logic is unchanged from Frontend Phase 1, only its route-group location changes (fixing the bug where it was reachable, and broken, under `(recruiter)`).
- Produces: nothing new for later tasks.

- [ ] **Step 1: Move the file**

```bash
cd "D:\exam app"
mkdir -p "apps/web/app/(org-admin)/settings/branding"
git mv "apps/web/app/(recruiter)/settings/branding/page.tsx" "apps/web/app/(org-admin)/settings/branding/page.tsx"
rmdir "apps/web/app/(recruiter)/settings" 2>/dev/null || true
```

The file's import paths (`'../../../../lib/api-client'`, etc.) are unchanged — both `(recruiter)/settings/branding/page.tsx` and `(org-admin)/settings/branding/page.tsx` sit 4 directories below `apps/web`, so the relative depth is identical. Confirm by opening the moved file: it should still read exactly as it did before the move, no edits needed.

- [ ] **Step 2: Write the test this page never had**

Create `apps/web/app/(org-admin)/settings/branding/page.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BrandingSettingsPage from './page';
import { AuthProvider } from '../../../../lib/auth-context';
import { QueryProvider } from '../../../../lib/query-provider';
import { ToastProvider } from '../../../../components/ui';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));

describe('BrandingSettingsPage (org-admin)', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('loads current branding and saves updated colors', async () => {
    const fetchMock = jest.fn(async (url, options) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).endsWith('/organizations/branding') && options?.method === 'PATCH') {
        return new Response(JSON.stringify({ logoUrl: null, primaryColor: '#123456', accentColor: '#fbbc04' }), { status: 200 });
      }
      if (String(url).endsWith('/organizations/branding')) {
        return new Response(JSON.stringify({ logoUrl: null, primaryColor: '#1a73e8', accentColor: '#fbbc04' }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(
      <QueryProvider>
        <ToastProvider>
          <AuthProvider>
            <BrandingSettingsPage />
          </AuthProvider>
        </ToastProvider>
      </QueryProvider>,
    );

    await waitFor(() =>
      expect(fetchMock.mock.calls.some((call) => String(call[0]).endsWith('/organizations/branding') && !call[1]?.method)).toBe(true),
    );

    await userEvent.click(screen.getByRole('button', { name: 'Save colors' }));

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some((call) => String(call[0]).endsWith('/organizations/branding') && call[1]?.method === 'PATCH'),
      ).toBe(true),
    );
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm run test --workspace=apps/web -- "app/(org-admin)/settings/branding/page"`
Expected: If Step 1's `git mv` already happened, this should actually PASS immediately, since the page's logic is unchanged from Phase 1 and this is a fresh test against working code. Run it now to confirm — if it fails, the failure must be a real defect (e.g. a path typo from the move), not a missing-feature failure, since the feature already exists. Fix any such defect before proceeding; there is no "write minimal implementation" step for this task since the implementation was already built in Frontend Phase 1.

- [ ] **Step 4: Run the full frontend unit suite and the frontend build**

Run: `npm run test --workspace=apps/web` — expected 53 + 1 = 54/54.
Run: `npm run build --workspace=apps/web` — expected exit 0, `/settings/branding` still appears in the route list (now served from the org-admin group).

- [ ] **Step 5: Commit**

```bash
cd "D:\exam app"
git add -A "apps/web/app/(org-admin)/settings" "apps/web/app/(recruiter)/settings"
git commit -m "fix: move org settings/branding page from recruiter to org-admin section

The page has always called the authenticated GET/PATCH /organizations/branding
endpoints, which require org:manage_settings -- a permission recruiter does
not have. Any recruiter reaching this route got 403s on every call. It
belongs under the org-admin shell, whose role gate now makes that the only
place it's reachable from."
```

---

### Task 5: Frontend — Audit Log screen

**Files:**
- Create: `apps/web/lib/hooks/useAuditLogs.ts`
- Create: `apps/web/app/(org-admin)/audit-log/page.tsx`
- Create: `apps/web/app/(org-admin)/audit-log/page.test.tsx`
- Modify: `apps/web/lib/types.ts`

**Interfaces:**
- Consumes: `Table`/`Input`/`Button` from `components/ui`, `useAuth()`.
- Produces: `AuditLogEntry` type in `lib/types.ts`, `useAuditLogs(filters)` hook — used only within this task.

- [ ] **Step 1: Add the AuditLogEntry type**

In `apps/web/lib/types.ts`, add after `StaffUser`:

```ts
export interface AuditLogEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actorUserId: string | null;
  actorEmail: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}
```

- [ ] **Step 2: Write the failing test**

Create `apps/web/app/(org-admin)/audit-log/page.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AuditLogPage from './page';
import { AuthProvider } from '../../../lib/auth-context';
import { QueryProvider } from '../../../lib/query-provider';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));

const ENTRY_1 = {
  id: 'log-1', action: 'user.created', entityType: 'user', entityId: 'user-2',
  actorUserId: 'user-1', actorEmail: 'admin@demo-org.test', metadata: null, createdAt: '2026-07-14T10:00:00.000Z',
};
const ENTRY_2 = {
  id: 'log-2', action: 'candidate.erased', entityType: 'candidate', entityId: 'cand-1',
  actorUserId: 'user-1', actorEmail: 'admin@demo-org.test', metadata: null, createdAt: '2026-07-13T10:00:00.000Z',
};

describe('AuditLogPage', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('lists audit entries and applies an action filter', async () => {
    const fetchMock = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      const urlStr = String(url);
      if (urlStr.includes('/audit-logs') && urlStr.includes('action=user.created')) {
        return new Response(JSON.stringify([ENTRY_1]), { status: 200 });
      }
      if (urlStr.includes('/audit-logs')) {
        return new Response(JSON.stringify([ENTRY_1, ENTRY_2]), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(
      <QueryProvider>
        <AuthProvider>
          <AuditLogPage />
        </AuthProvider>
      </QueryProvider>,
    );

    await waitFor(() => expect(screen.getByText('candidate.erased')).toBeInTheDocument());
    expect(screen.getByText('user.created')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Action'), 'user.created');
    await userEvent.click(screen.getByRole('button', { name: 'Apply filters' }));

    await waitFor(() => expect(screen.queryByText('candidate.erased')).not.toBeInTheDocument());
    expect(screen.getByText('user.created')).toBeInTheDocument();

    const filteredCall = fetchMock.mock.calls.find((call) => String(call[0]).includes('action=user.created'));
    expect(filteredCall).toBeDefined();
  });

  it('shows error state when the audit log fails to load', async () => {
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).includes('/audit-logs')) {
        return new Response(JSON.stringify({ message: 'Server error' }), { status: 500 });
      }
      return new Response(JSON.stringify([]), { status: 200 });
    }) as unknown as typeof fetch;

    render(
      <QueryProvider>
        <AuthProvider>
          <AuditLogPage />
        </AuthProvider>
      </QueryProvider>,
    );

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument(), { timeout: 2000 });
    expect(screen.getByText('Failed to load audit log.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm run test --workspace=apps/web -- "app/(org-admin)/audit-log/page"`
Expected: FAIL with "Cannot find module './page'".

- [ ] **Step 4: Implement the useAuditLogs hook**

Create `apps/web/lib/hooks/useAuditLogs.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { AuditLogEntry } from '../types';
import { useAuth } from '../auth-context';

export interface AuditLogFilters {
  entityType?: string;
  actorUserId?: string;
  action?: string;
  from?: string;
  to?: string;
  cursor?: string;
}

function buildQuery(filters: AuditLogFilters): string {
  const params = new URLSearchParams();
  if (filters.entityType) params.set('entityType', filters.entityType);
  if (filters.actorUserId) params.set('actorUserId', filters.actorUserId);
  if (filters.action) params.set('action', filters.action);
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  if (filters.cursor) params.set('cursor', filters.cursor);
  const query = params.toString();
  return query ? `?${query}` : '';
}

export function useAuditLogs(filters: AuditLogFilters) {
  const { accessToken } = useAuth();
  return useQuery<AuditLogEntry[]>({
    queryKey: ['audit-logs', filters],
    queryFn: () => apiFetch(`/audit-logs${buildQuery(filters)}`, {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}
```

- [ ] **Step 5: Implement the Audit Log page**

Create `apps/web/app/(org-admin)/audit-log/page.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useAuditLogs, type AuditLogFilters } from '../../../lib/hooks/useAuditLogs';
import { Input, Button, Table, type Column } from '../../../components/ui';
import { AuditLogEntry } from '../../../lib/types';

export default function AuditLogPage() {
  const [filters, setFilters] = useState<AuditLogFilters>({});
  const [formFilters, setFormFilters] = useState<AuditLogFilters>({});
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const { data, isLoading, isError } = useAuditLogs({ ...filters, cursor });

  useEffect(() => {
    if (!data) return;
    setEntries((current) => (cursor ? [...current, ...data] : data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  function handleApplyFilters(e: React.FormEvent) {
    e.preventDefault();
    setEntries([]);
    setCursor(undefined);
    setFilters(formFilters);
  }

  function handleLoadMore() {
    if (entries.length === 0) return;
    setCursor(entries[entries.length - 1].id);
  }

  const columns: Column<AuditLogEntry>[] = [
    {
      key: 'createdAt',
      header: 'When',
      render: (entry) => new Date(entry.createdAt).toLocaleString(),
      sortValue: (entry) => entry.createdAt,
    },
    { key: 'actorEmail', header: 'Actor', render: (entry) => entry.actorEmail ?? 'System' },
    { key: 'action', header: 'Action', render: (entry) => entry.action },
    { key: 'entityType', header: 'Entity', render: (entry) => entry.entityType },
  ];

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Audit Log</h1>
      <form onSubmit={handleApplyFilters} className="mb-6 flex flex-wrap items-end gap-2">
        <Input
          label="Actor user ID"
          value={formFilters.actorUserId ?? ''}
          onChange={(value) => setFormFilters((f) => ({ ...f, actorUserId: value || undefined }))}
        />
        <Input
          label="Action"
          value={formFilters.action ?? ''}
          onChange={(value) => setFormFilters((f) => ({ ...f, action: value || undefined }))}
        />
        <Input
          label="Entity type"
          value={formFilters.entityType ?? ''}
          onChange={(value) => setFormFilters((f) => ({ ...f, entityType: value || undefined }))}
        />
        <Input
          label="From"
          type="date"
          value={formFilters.from ?? ''}
          onChange={(value) => setFormFilters((f) => ({ ...f, from: value || undefined }))}
        />
        <Input
          label="To"
          type="date"
          value={formFilters.to ?? ''}
          onChange={(value) => setFormFilters((f) => ({ ...f, to: value || undefined }))}
        />
        <Button type="submit">Apply filters</Button>
      </form>
      {isError && (
        <p role="alert" className="text-sm text-red-600">
          Failed to load audit log.
        </p>
      )}
      {isLoading && entries.length === 0 ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : (
        !isError && (
          <>
            <Table columns={columns} rows={entries} rowKey={(entry) => entry.id} emptyMessage="No audit events found." />
            {entries.length > 0 && (
              <div className="mt-4">
                <Button variant="secondary" onClick={handleLoadMore} disabled={isLoading}>
                  Load more
                </Button>
              </div>
            )}
          </>
        )
      )}
    </div>
  );
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm run test --workspace=apps/web -- "app/(org-admin)/audit-log/page"`
Expected: PASS, 2/2.

- [ ] **Step 7: Run the full frontend unit suite and the frontend build**

Run: `npm run test --workspace=apps/web` — expected 54 + 2 = 56/56.
Run: `npm run build --workspace=apps/web` — expected exit 0, `/audit-log` in the route list.

- [ ] **Step 8: Commit**

```bash
cd "D:\exam app"
git add apps/web/lib/hooks/useAuditLogs.ts "apps/web/app/(org-admin)/audit-log" apps/web/lib/types.ts
git commit -m "feat: org-admin audit log screen with full filter UI and cursor pagination"
```

---

### Task 6: Frontend — Candidate Data Rights screen

**Files:**
- Create: `apps/web/lib/hooks/useCandidateDataRights.ts`
- Create: `apps/web/app/(org-admin)/data-rights/page.tsx`
- Create: `apps/web/app/(org-admin)/data-rights/page.test.tsx`
- Modify: `apps/web/lib/types.ts`

**Interfaces:**
- Consumes: `Candidate` type (Frontend Phase 1), `Button`/`Input`/`Card`/`Modal`/`useToast` from `components/ui`.
- Produces: `CandidateDataExport` type in `lib/types.ts`, `useLookupCandidate()` / `useExportCandidate()` / `useEraseCandidate()` hooks — used only within this task.

- [ ] **Step 1: Add the CandidateDataExport type**

In `apps/web/lib/types.ts`, add after `AuditLogEntry`:

```ts
export interface CandidateDataExport {
  candidate: { id: string; email: string; name: string; phone: string | null; createdAt: string };
  invitations: { id: string; examTitle: string; status: string; invitedAt: string; expiresAt: string; revokedAt: string | null }[];
  attempts: {
    id: string;
    examTitle: string;
    status: string;
    startedAt: string;
    submittedAt: string | null;
    deviceFingerprint: string | null;
    result: { score: number; maxScore: number; percentage: number; passFail: string } | null;
    answers: { questionText: string; selectedOptions: string[]; isCorrect: boolean | null; marksAwarded: number | null }[];
    proctoringEvents: { eventType: string; severity: string; occurredAt: string; metadata: Record<string, unknown> | null }[];
    proctoringAnalysis: { status: string; riskLevel: string | null; summary: string | null } | null;
    insight: { status: string; summary: string | null } | null;
    messages: { body: string; sentAt: string; readAt: string | null }[];
  }[];
}
```

- [ ] **Step 2: Write the failing test**

Create `apps/web/app/(org-admin)/data-rights/page.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DataRightsPage from './page';
import { AuthProvider } from '../../../lib/auth-context';
import { QueryProvider } from '../../../lib/query-provider';
import { ToastProvider } from '../../../components/ui';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));

const CANDIDATE = { id: 'cand-1', email: 'gina@example.com', name: 'Gina GDPR', phone: null, createdAt: '2026-01-01T00:00:00.000Z', erasedAt: null };
const EXPORT_DATA = {
  candidate: { id: 'cand-1', email: 'gina@example.com', name: 'Gina GDPR', phone: null, createdAt: '2026-01-01T00:00:00.000Z' },
  invitations: [{ id: 'inv-1', examTitle: 'Backend Round', status: 'invited', invitedAt: '2026-01-02T00:00:00.000Z', expiresAt: '2026-02-01T00:00:00.000Z', revokedAt: null }],
  attempts: [],
};

describe('DataRightsPage', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('looks up, exports, and erases a candidate', async () => {
    const fetchMock = jest.fn(async (url, options) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      const urlStr = String(url);
      if (urlStr.includes('/candidates/lookup')) {
        return new Response(JSON.stringify(CANDIDATE), { status: 200 });
      }
      if (urlStr.endsWith('/candidates/cand-1/export')) {
        return new Response(JSON.stringify(EXPORT_DATA), { status: 200 });
      }
      if (urlStr.endsWith('/candidates/cand-1/erase') && options?.method === 'POST') {
        return new Response(JSON.stringify({ id: 'cand-1', erasedAt: '2026-07-14T12:00:00.000Z' }), { status: 201 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    render(
      <QueryProvider>
        <ToastProvider>
          <AuthProvider>
            <DataRightsPage />
          </AuthProvider>
        </ToastProvider>
      </QueryProvider>,
    );

    await userEvent.type(screen.getByLabelText('Candidate email'), 'gina@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Look up' }));
    await waitFor(() => expect(screen.getByText('Gina GDPR')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: 'Export data' }));
    await waitFor(() => expect(screen.getByText('Backend Round — invited')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: 'Erase candidate' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirm erase' }));

    await waitFor(() => expect(screen.getByText(/Erased at/)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Erase candidate' })).not.toBeInTheDocument();
  });

  it('shows an error when no candidate matches the email', async () => {
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).includes('/candidates/lookup')) {
        return new Response(JSON.stringify({ message: 'No candidate found with email nobody@nowhere.test' }), { status: 404 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    render(
      <QueryProvider>
        <ToastProvider>
          <AuthProvider>
            <DataRightsPage />
          </AuthProvider>
        </ToastProvider>
      </QueryProvider>,
    );

    await userEvent.type(screen.getByLabelText('Candidate email'), 'nobody@nowhere.test');
    await userEvent.click(screen.getByRole('button', { name: 'Look up' }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm run test --workspace=apps/web -- "app/(org-admin)/data-rights/page"`
Expected: FAIL with "Cannot find module './page'".

- [ ] **Step 4: Implement the candidate data-rights hooks**

Create `apps/web/lib/hooks/useCandidateDataRights.ts`:

```ts
import { useMutation } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { Candidate, CandidateDataExport } from '../types';
import { useAuth } from '../auth-context';

export function useLookupCandidate() {
  const { accessToken } = useAuth();
  return useMutation({
    mutationFn: (email: string) =>
      apiFetch(`/candidates/lookup?email=${encodeURIComponent(email)}`, {}, accessToken ?? undefined) as Promise<Candidate>,
  });
}

export function useExportCandidate() {
  const { accessToken } = useAuth();
  return useMutation({
    mutationFn: (candidateId: string) =>
      apiFetch(`/candidates/${candidateId}/export`, {}, accessToken ?? undefined) as Promise<CandidateDataExport>,
  });
}

export function useEraseCandidate() {
  const { accessToken } = useAuth();
  return useMutation({
    mutationFn: (candidateId: string) =>
      apiFetch(`/candidates/${candidateId}/erase`, { method: 'POST', body: JSON.stringify({}) }, accessToken ?? undefined) as Promise<{
        id: string;
        erasedAt: string;
      }>,
  });
}
```

- [ ] **Step 5: Implement the Data Rights page**

Create `apps/web/app/(org-admin)/data-rights/page.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useLookupCandidate, useExportCandidate, useEraseCandidate } from '../../../lib/hooks/useCandidateDataRights';
import { Button, Input, Card, Modal, useToast } from '../../../components/ui';
import { Candidate, CandidateDataExport } from '../../../lib/types';

export default function DataRightsPage() {
  const [email, setEmail] = useState('');
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [exportData, setExportData] = useState<CandidateDataExport | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lookupCandidate = useLookupCandidate();
  const exportCandidate = useExportCandidate();
  const eraseCandidate = useEraseCandidate();
  const { toast } = useToast();

  function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCandidate(null);
    setExportData(null);
    lookupCandidate.mutate(email, {
      onSuccess: (result) => setCandidate(result),
      onError: (err) => setError(err instanceof Error ? err.message : 'Candidate not found'),
    });
  }

  function handleExport() {
    if (!candidate) return;
    exportCandidate.mutate(candidate.id, {
      onSuccess: (result) => setExportData(result),
    });
  }

  function handleDownload() {
    if (!exportData || !candidate) return;
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `candidate-${candidate.id}-export.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function handleErase() {
    if (!candidate) return;
    eraseCandidate.mutate(candidate.id, {
      onSuccess: (result) => {
        setCandidate({ ...candidate, erasedAt: result.erasedAt });
        setConfirmOpen(false);
        toast('Candidate data erased.');
      },
    });
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Candidate Data Rights</h1>
      <form onSubmit={handleLookup} className="mb-6 flex items-end gap-2">
        <Input label="Candidate email" type="email" value={email} onChange={setEmail} required />
        <Button type="submit">Look up</Button>
      </form>
      {error && (
        <p role="alert" className="mb-4 text-sm text-red-600">
          {error}
        </p>
      )}
      {candidate && (
        <Card className="mb-6">
          <p className="font-medium">{candidate.name}</p>
          <p className="text-sm text-gray-600">{candidate.email}</p>
          {candidate.phone && <p className="text-sm text-gray-600">{candidate.phone}</p>}
          {candidate.erasedAt ? (
            <p className="mt-2 text-sm text-gray-500">Erased at {new Date(candidate.erasedAt).toLocaleString()}</p>
          ) : (
            <div className="mt-4 flex gap-2">
              <Button onClick={handleExport}>Export data</Button>
              <Button variant="secondary" onClick={() => setConfirmOpen(true)}>
                Erase candidate
              </Button>
            </div>
          )}
        </Card>
      )}
      {exportData && (
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Export data</h2>
            <Button variant="secondary" onClick={handleDownload}>
              Download JSON
            </Button>
          </div>
          <section className="mb-4">
            <h3 className="font-medium">Profile</h3>
            <p className="text-sm text-gray-600">
              {exportData.candidate.name} — {exportData.candidate.email}
            </p>
          </section>
          <section className="mb-4">
            <h3 className="font-medium">Invitations ({exportData.invitations.length})</h3>
            <ul className="text-sm text-gray-600">
              {exportData.invitations.map((invitation) => (
                <li key={invitation.id}>
                  {invitation.examTitle} — {invitation.status}
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h3 className="font-medium">Attempts ({exportData.attempts.length})</h3>
            <ul className="text-sm text-gray-600">
              {exportData.attempts.map((attempt) => (
                <li key={attempt.id}>
                  {attempt.examTitle} —{' '}
                  {attempt.result ? `${attempt.result.score}/${attempt.result.maxScore} (${attempt.result.passFail})` : attempt.status}
                </li>
              ))}
            </ul>
          </section>
        </Card>
      )}
      <Modal open={confirmOpen} title="Erase candidate data?" onClose={() => setConfirmOpen(false)}>
        <p className="mb-4 text-sm text-gray-600">This permanently redacts {candidate?.name}&apos;s personal data. This cannot be undone.</p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirmOpen(false)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleErase}>
            Confirm erase
          </Button>
        </div>
      </Modal>
    </div>
  );
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm run test --workspace=apps/web -- "app/(org-admin)/data-rights/page"`
Expected: PASS, 2/2.

- [ ] **Step 7: Run the full frontend unit suite and the frontend build**

Run: `npm run test --workspace=apps/web` — expected 56 + 2 = 58/58.
Run: `npm run build --workspace=apps/web` — expected exit 0, `/data-rights` in the route list.

- [ ] **Step 8: Commit**

```bash
cd "D:\exam app"
git add apps/web/lib/hooks/useCandidateDataRights.ts "apps/web/app/(org-admin)/data-rights" apps/web/lib/types.ts
git commit -m "feat: org-admin candidate data rights screen (email lookup, export, erase)"
```

---

### Task 7: Playwright e2e — Org Admin golden path

**Files:**
- Create: `apps/web/e2e/org-admin-golden-path.spec.ts`

**Interfaces:**
- Consumes: the fully wired org-admin console from Tasks 1-6, and the seeded `admin@demo-org.test` / `DevAdmin123!` fixture (already exists from Phase 0 — see `apps/api/prisma/seed.ts:104-114`).
- Produces: nothing (terminal task for the UI).

- [ ] **Step 1: Write the e2e spec**

Create `apps/web/e2e/org-admin-golden-path.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

const ORG_SLUG = process.env.E2E_ORG_SLUG ?? 'demo-org';
const RECRUITER_EMAIL = process.env.E2E_RECRUITER_EMAIL ?? 'recruiter@demo-org.test';
const RECRUITER_PASSWORD = process.env.E2E_RECRUITER_PASSWORD ?? 'Passw0rd!2026';
const ORG_ADMIN_EMAIL = process.env.E2E_ORG_ADMIN_EMAIL ?? 'admin@demo-org.test';
const ORG_ADMIN_PASSWORD = process.env.E2E_ORG_ADMIN_PASSWORD ?? 'DevAdmin123!';

test('org admin adds a staff member, reviews the audit log, and exports/erases a candidate', async ({ page }) => {
  // Seed a fresh candidate as the recruiter so this test doesn't depend on data from other suites.
  const candidateEmail = `org-admin-e2e-${Date.now()}@example.com`;
  await page.goto('/login');
  await page.getByLabel('Organization slug').fill(ORG_SLUG);
  await page.getByLabel('Email').fill(RECRUITER_EMAIL);
  await page.getByLabel('Password').fill(RECRUITER_PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await page.getByRole('link', { name: 'Candidates' }).click();
  await page.getByLabel('Name').fill('Org Admin E2E Candidate');
  await page.getByLabel('Email').fill(candidateEmail);
  await page.getByRole('button', { name: 'Add candidate' }).click();
  await expect(page.getByText(candidateEmail)).toBeVisible();

  // Switch to the org admin.
  await page.goto('/login');
  await page.getByLabel('Organization slug').fill(ORG_SLUG);
  await page.getByLabel('Email').fill(ORG_ADMIN_EMAIL);
  await page.getByLabel('Password').fill(ORG_ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/users/);

  // Add a staff member.
  const staffEmail = `org-admin-e2e-staff-${Date.now()}@example.com`;
  await page.getByLabel('Email').fill(staffEmail);
  await page.getByLabel('Password').fill('Passw0rd!2026');
  await page.getByLabel('Role').click();
  await page.getByRole('option', { name: 'Recruiter' }).click();
  await page.getByRole('button', { name: 'Add staff member' }).click();
  await expect(page.getByText(staffEmail)).toBeVisible();

  // Confirm the new staff member shows up in the audit log.
  await page.getByRole('link', { name: 'Audit Log' }).click();
  await page.getByLabel('Action').fill('user.created');
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page.getByText('user.created').first()).toBeVisible();

  // Look up, export, and erase the candidate seeded above.
  await page.getByRole('link', { name: 'Candidate Data Rights' }).click();
  await page.getByLabel('Candidate email').fill(candidateEmail);
  await page.getByRole('button', { name: 'Look up' }).click();
  await expect(page.getByText('Org Admin E2E Candidate')).toBeVisible();
  await page.getByRole('button', { name: 'Export data' }).click();
  await expect(page.getByText('Profile')).toBeVisible();
  await page.getByRole('button', { name: 'Erase candidate' }).click();
  await page.getByRole('button', { name: 'Confirm erase' }).click();
  await expect(page.getByText(/Erased at/)).toBeVisible();
});
```

- [ ] **Step 2: Run it against real dev servers**

Start both dev servers (adjust ports if 3000/3001 are occupied, matching the workaround established in Frontend Phase 1 — see `.superpowers/sdd/task-11-report.md` if that happens again):

```bash
cd "D:\exam app" && npm run dev:api
cd "D:\exam app" && npm run dev:web
```

Run: `cd "D:\exam app" && WEB_BASE_URL=<web dev server URL> npm run test:e2e --workspace=apps/web -- org-admin-golden-path`

Expected: PASS, 1/1. If any locator ambiguity surfaces (e.g. `getByLabel('Email')` matching more than one field, or a generic string colliding with data left over from a prior run in the persistent dev DB), apply the same disambiguation techniques already established in `apps/web/e2e/recruiter-golden-path.spec.ts` (`{ exact: true }`, `.first()`, row-scoping by unique generated data) — do not weaken what the test asserts about the product.

- [ ] **Step 3: Run the existing recruiter e2e spec too, to confirm no regression**

Run: `cd "D:\exam app" && WEB_BASE_URL=<web dev server URL> npm run test:e2e --workspace=apps/web`

Expected: PASS, 2/2 (both e2e specs).

- [ ] **Step 4: Commit**

```bash
cd "D:\exam app"
git add apps/web/e2e/org-admin-golden-path.spec.ts
git commit -m "test: Playwright golden-path e2e suite for the org admin console"
```

---

### Task 8: Final verification

**Files:** none modified — verification only.

**Interfaces:**
- Consumes: the fully wired role-gated shell + org-admin console from Tasks 1-7.
- Produces: nothing (terminal task).

- [ ] **Step 1: Full clean install and build, all workspaces**

```bash
npm ci
npm run build --workspace=apps/api
npm run build --workspace=apps/exam-runtime
npm run build --workspace=apps/web
```
Expected: all exit 0.

- [ ] **Step 2: Full backend unit + e2e suites**

```bash
npm run test:api
npm run test:exam-runtime
npm run test:shared
```
Expected: PASS. `apps/api` unit baseline entering this phase was 214/214 — unaffected by Task 1 (e2e-only addition). `exam-runtime` and `shared` untouched — 166/166 and 2/2.

```bash
npm run test:api:e2e -- --runInBand
```
(with `DATABASE_URL` exported per Task 1, Step 2)
Expected: PASS — baseline 83/83 + Task 1's 3 new tests = 86/86.

- [ ] **Step 3: Full frontend unit suite**

Run: `npm run test --workspace=apps/web`
Expected: PASS, 58/58 (per the running count across Tasks 2-6: 44 baseline + 3 jwt + 2 layout/login + 2 layout + 2 users + 1 branding + 2 audit-log + 2 data-rights = 58).

- [ ] **Step 4: Full frontend e2e suite**

With `apps/api` and `apps/web` both running in dev mode:
```bash
npm run test:e2e --workspace=apps/web
```
Expected: PASS, 2/2.

- [ ] **Step 5: Manual verification in a live browser**

Per this project's UI-testing convention, start both dev servers and click through the golden path by hand:
1. Log in as `recruiter@demo-org.test` — confirm still lands on `/dashboard`, sidebar shows only recruiter nav items, no `/users` or `/audit-log` links present.
2. Attempt to navigate directly to `/users` while logged in as recruiter (type the URL) — confirm it redirects to `/login` rather than rendering.
3. Log in as `admin@demo-org.test` — confirm it lands on `/users`, sidebar shows Staff Users / Org Settings / Audit Log / Candidate Data Rights, and none of the recruiter's nav items (Dashboard / Exams / Question Bank / Candidates).
4. Add a staff member on `/users`, confirm it appears in the list.
5. Open Org Settings, confirm branding colors load and can be saved (this exercises the exact endpoints that were broken under `(recruiter)` — confirm zero 403s in the network tab).
6. Open Audit Log, apply a filter, confirm results narrow correctly; click Load more if there are enough entries to page.
7. Open Candidate Data Rights, look up a candidate that exists (e.g. one created by the recruiter earlier), export their data, then erase them and confirm the UI reflects the erased state.
8. Attempt to navigate directly to `/dashboard` while logged in as org_admin — confirm it redirects to `/login` rather than rendering (mirrors check #2 for the other direction).

Confirm no console errors and no broken layouts at both desktop and tablet widths (resize to ~768px and re-check the org-admin sidebar/table layouts, matching the same check performed at the end of Frontend Phase 1).

- [ ] **Step 6: Record the result**

No code changes from this task. If any step shows an unexpected failure, stop and report — do not close out the phase with unverified behavior.

---

### Final whole-branch review

After Task 8, dispatch a broad review across the full diff range (from the commit immediately before Task 1 through Task 7's final commit) covering: plan alignment against `docs/superpowers/specs/2026-07-14-frontend-phase-2-org-admin-console-design.md`, code quality and accessibility (Radix usage, keyboard navigation, `aria-label`s — pay particular attention to the Audit Log filter form and the Data Rights erase-confirmation flow, both new interaction patterns this phase), correctness of the role-gating logic in both `(recruiter)/layout.tsx` and `(org-admin)/layout.tsx` (a bug here is a real cross-tenant/cross-role access concern, not just a UX papercut), and confirmation that no out-of-scope screens (Super Admin, Interview Panel, candidate exam-taking UI, Live Monitoring, Reports & Analytics, AI Question Generator, Bulk Import, user edit/deactivate, a Roles reference screen) were built. Matches the same final-review pattern used at the end of Frontend Phase 1.
