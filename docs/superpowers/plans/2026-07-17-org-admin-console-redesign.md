# Org Admin Console Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Org Admin Console (shell, Staff Users, Audit Log, Candidate Data Rights, Org Settings/Branding) to match the recruiter console's shell and dense-table pattern exactly, plus two confirmed non-visual fixes — Settings/Branding's data-fetch pattern moved onto React Query, and a typed-confirmation step added to candidate erase.

**Architecture:** Pure component/token reuse from the already-shipped recruiter console redesign — no new Tailwind tokens, no new `components/ui/*` primitives. Zero backend changes; every screen's data already comes from existing endpoints with shapes that already support this redesign.

**Tech Stack:** Next.js 16 (App Router) + Tailwind + `@radix-ui/react-*` + `lucide-react` (already dependencies) + `@tanstack/react-query`.

## Global Constraints

- No new Tailwind tokens or `components/ui/*` primitives — reuse `recruiter.*`/`status.*` tokens and `StatusBadge`/`Table`/`Card`/`Modal`/`Input`/`Select`/`Button` exactly as they exist today.
- Icons: `lucide-react` only.
- Zero backend changes — confirmed in the spec's Data & Backend Requirements section; every endpoint this plan touches already exists with a shape that supports this redesign.
- `StaffUser.status` is an unconstrained `string` column (Prisma: `status String @default("active")`, no enum/check constraint) whose only real-world value today is `'active'` — any status-badge tone mapping must default unknown values to a neutral tone, not assume a closed set.
- `StaffUser.role` IS a closed set at the API validation layer (`CreateUserDto`'s `@IsIn(['org_admin', 'recruiter', 'panel'])`) — safe to hardcode a 3-value tone map.
- The candidate-erase typed-confirmation requires an exact (case-sensitive, trimmed) match against the candidate's real email before the destructive button enables.
- Test conventions: identical to the recruiter console plan — `@testing-library/react` with `QueryProvider`/`ToastProvider`/`AuthProvider` wrappers and a mocked `global.fetch`; `userEvent` for interactions.

---

### Task 1: Shell redesign

**Files:**
- Modify: `apps/web/app/(org-admin)/layout.tsx`
- Modify: `apps/web/app/(org-admin)/layout.test.tsx`

**Interfaces:**
- Consumes: `recruiter.*` tokens (already in `apps/web/tailwind.config.ts`, no change needed). No change to `useAuth()`/`useBranding()` hook signatures.
- Produces: no exported interface — leaf layout component.

- [ ] **Step 1: Write the failing test for the new nav icons**

Read `apps/web/app/(org-admin)/layout.test.tsx` in full first (reproduced above — its mock setup mocks `next/navigation` inline and uses `fakeJwt` for auth state). Add this test alongside the existing two:

```tsx
  it('renders each nav item with an icon and marks the active route via text-primary', async () => {
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

    const usersLink = await screen.findByRole('link', { name: 'Staff Users' });
    expect(usersLink.className).toContain('text-primary');
    const auditLink = screen.getByRole('link', { name: 'Audit Log' });
    expect(auditLink.className).not.toContain('text-primary');
  });
```

(The test file's own `jest.mock('next/navigation', ...)` at the top returns `usePathname: () => '/users'` — this is why `usersLink` is asserted active and `auditLink` is not.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx jest --testPathPattern="\(org-admin\)/layout.test.tsx"`
Expected: FAIL — current active-link styling is `bg-primary text-white`, not `text-primary`.

- [ ] **Step 3: Rewrite the layout**

Replace `apps/web/app/(org-admin)/layout.tsx` in full — direct port of `apps/web/app/(recruiter)/layout.tsx`'s current (post-redesign) structure, swapping nav items/icons and the role gate:

```tsx
'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import clsx from 'clsx';
import { Users, History, ShieldCheck, Settings } from 'lucide-react';
import { useAuth } from '../../lib/auth-context';
import { useBranding } from '../../lib/hooks/useBranding';

const NAV_ITEMS = [
  { href: '/users', label: 'Staff Users', icon: Users },
  { href: '/audit-log', label: 'Audit Log', icon: History },
  { href: '/data-rights', label: 'Candidate Data Rights', icon: ShieldCheck },
  { href: '/settings/branding', label: 'Org Settings', icon: Settings },
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
    return <p className="p-8 text-sm text-recruiter-text-tertiary">Loading…</p>;
  }

  // ponytail: useAuth() has no userName field yet; always render the 'Org Admin' fallback
  // rather than widening the auth contract (out of scope for this task) — matches the
  // recruiter shell's identical fallback for the same reason.
  const initials = 'Org Admin'
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  // ponytail: BrandingResponse has no organizationName field; fall back to the org slug.
  const orgInitial = (organizationSlug ?? 'O')[0]?.toUpperCase();

  return (
    <div style={themeStyle} className="flex min-h-screen">
      <nav className="flex w-56 shrink-0 flex-col border-r border-recruiter-border bg-white">
        <div className="flex items-center gap-2 border-b border-recruiter-border px-4 py-4">
          {branding?.logoUrl ? (
            <img src={branding.logoUrl} alt="Organization logo" className="max-h-7 max-w-7 rounded" />
          ) : (
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-xs font-bold text-white">
              {orgInitial}
            </div>
          )}
          <span className="truncate text-sm font-bold text-recruiter-text">{organizationSlug}</span>
        </div>
        <ul className="flex flex-1 flex-col gap-0.5 p-2.5">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = pathname?.startsWith(item.href) ?? false;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={clsx(
                    'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium',
                    isActive
                      ? 'border-l-[3px] border-primary pl-[7px] font-semibold text-primary'
                      : 'text-recruiter-text-secondary hover:bg-recruiter-bg-subtle',
                  )}
                  style={
                    isActive
                      ? { backgroundColor: 'color-mix(in srgb, var(--color-primary, #1a73e8) 12%, white)' }
                      : undefined
                  }
                >
                  <Icon size={16} />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="flex items-center gap-2 border-t border-recruiter-border px-3.5 py-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-white">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-recruiter-text">Org Admin</p>
            <p className="text-[10.5px] text-recruiter-text-tertiary">Org Admin</p>
          </div>
        </div>
      </nav>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx jest --testPathPattern="\(org-admin\)/layout.test.tsx"`
Expected: PASS (all 3 tests)

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/\(org-admin\)/layout.tsx apps/web/app/\(org-admin\)/layout.test.tsx
git commit -m "feat: redesign org-admin sidebar shell with icons and brand-accent active state"
```

---

### Task 2: Branding mutation hooks + Settings/Branding screen redesign

**Files:**
- Modify: `apps/web/lib/hooks/useBranding.ts`
- Create: `apps/web/lib/hooks/useBranding.test.ts`
- Modify: `apps/web/app/(org-admin)/settings/branding/page.tsx`
- Modify: `apps/web/app/(org-admin)/settings/branding/page.test.tsx`

**Interfaces:**
- Consumes: `apiFetch` from `apps/web/lib/api-client.ts`, `useAuth()` for `accessToken`/`organizationSlug`.
- Produces: `useUpdateBranding(): UseMutationResult` — `mutate({ primaryColor, accentColor }: { primaryColor?: string; accentColor?: string })`, invalidates `['branding', organizationSlug]` on success. `useUpdateBrandingLogo(): UseMutationResult` — `mutate(file: File)`, invalidates the same query key on success. Both exported from `apps/web/lib/hooks/useBranding.ts` alongside the existing `useBranding()`.

- [ ] **Step 1: Write the failing test for the two new mutation hooks**

Create `apps/web/lib/hooks/useBranding.test.ts`:

```ts
import { renderHook, waitFor } from '@testing-library/react';
import { useUpdateBranding, useUpdateBrandingLogo } from './useBranding';
import { AuthProvider } from '../auth-context';
import { QueryProvider } from '../query-provider';
import { fakeJwt } from '../test-utils/fake-jwt';
import { ReactNode } from 'react';

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryProvider>
      <AuthProvider>{children}</AuthProvider>
    </QueryProvider>
  );
}

describe('useUpdateBranding / useUpdateBrandingLogo', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('PATCHes /organizations/branding and invalidates the branding query on success', async () => {
    const token = fakeJwt({ sub: 'u1', organizationId: 'org1', role: 'org_admin' });
    const fetchMock = jest.fn(async (url, options) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: token }), { status: 200 });
      }
      if (String(url).endsWith('/organizations/branding') && options?.method === 'PATCH') {
        return new Response(JSON.stringify({ logoUrl: null, primaryColor: '#123456', accentColor: '#fbbc04' }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const { result } = renderHook(() => useUpdateBranding(), { wrapper });
    result.current.mutate({ primaryColor: '#123456', accentColor: '#fbbc04' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const patchCall = fetchMock.mock.calls.find(
      (call) => String(call[0]).endsWith('/organizations/branding') && call[1]?.method === 'PATCH',
    );
    expect(JSON.parse((patchCall![1] as RequestInit).body as string)).toEqual({
      primaryColor: '#123456',
      accentColor: '#fbbc04',
    });
  });

  it('POSTs a FormData logo file to /organizations/branding/logo', async () => {
    const token = fakeJwt({ sub: 'u1', organizationId: 'org1', role: 'org_admin' });
    const fetchMock = jest.fn(async (url, options) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: token }), { status: 200 });
      }
      if (String(url).endsWith('/organizations/branding/logo') && options?.method === 'POST') {
        return new Response(JSON.stringify({ logoUrl: 'https://cdn.test/logo.png', primaryColor: null, accentColor: null }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const { result } = renderHook(() => useUpdateBrandingLogo(), { wrapper });
    const file = new File(['x'], 'logo.png', { type: 'image/png' });
    result.current.mutate(file);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const uploadCall = fetchMock.mock.calls.find(
      (call) => String(call[0]).endsWith('/organizations/branding/logo') && call[1]?.method === 'POST',
    );
    expect(uploadCall![1]?.body).toBeInstanceOf(FormData);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx jest --testPathPattern="useBranding.test.ts"`
Expected: FAIL with "useUpdateBranding is not a function" (or similar import error)

- [ ] **Step 3: Add the two mutation hooks**

Replace `apps/web/lib/hooks/useBranding.ts` in full:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { BrandingResponse } from '../types';
import { useAuth } from '../auth-context';

export function useBranding(organizationSlug: string | null) {
  return useQuery<BrandingResponse>({
    queryKey: ['branding', organizationSlug],
    queryFn: () => apiFetch(`/organizations/by-slug/${organizationSlug}/branding`),
    enabled: Boolean(organizationSlug),
  });
}

interface UpdateBrandingInput {
  primaryColor?: string;
  accentColor?: string;
}

export function useUpdateBranding() {
  const { accessToken, organizationSlug } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateBrandingInput): Promise<BrandingResponse> =>
      apiFetch('/organizations/branding', { method: 'PATCH', body: JSON.stringify(input) }, accessToken ?? undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['branding', organizationSlug] }),
  });
}

export function useUpdateBrandingLogo() {
  const { accessToken, organizationSlug } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File): Promise<BrandingResponse> => {
      const formData = new FormData();
      formData.append('file', file);
      return apiFetch('/organizations/branding/logo', { method: 'POST', body: formData }, accessToken ?? undefined);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['branding', organizationSlug] }),
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx jest --testPathPattern="useBranding.test.ts"`
Expected: PASS (2 tests)

- [ ] **Step 5: Write the failing test for the redesigned page's hook usage**

Read `apps/web/app/(org-admin)/settings/branding/page.test.tsx` in full first (reproduced above). Replace its single test with this rewritten version, which asserts against the new hook-driven fetch pattern (still hits the same 2 endpoints, same assertions, but the page no longer does its own `useEffect` fetch on mount — it reads via `useBranding` like the shell does):

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
      if (String(url).includes('/organizations/by-slug/')) {
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
      expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('/organizations/by-slug/'))).toBe(true),
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

- [ ] **Step 6: Run test to verify it fails**

Run: `cd apps/web && npx jest --testPathPattern="settings/branding/page.test.tsx"`
Expected: FAIL — current page fetches `/organizations/branding` directly on mount, not `/organizations/by-slug/...`.

- [ ] **Step 7: Rewrite the page**

Replace `apps/web/app/(org-admin)/settings/branding/page.tsx` in full:

```tsx
'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '../../../../lib/auth-context';
import { useBranding, useUpdateBranding, useUpdateBrandingLogo } from '../../../../lib/hooks/useBranding';
import { Button, Input, Card, useToast } from '../../../../components/ui';

export default function BrandingSettingsPage() {
  const { organizationSlug } = useAuth();
  const { data: branding } = useBranding(organizationSlug);
  const updateBranding = useUpdateBranding();
  const updateLogo = useUpdateBrandingLogo();
  const { toast } = useToast();
  const [primaryColor, setPrimaryColor] = useState('#1a73e8');
  const [accentColor, setAccentColor] = useState('#fbbc04');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (branding?.primaryColor) setPrimaryColor(branding.primaryColor);
    if (branding?.accentColor) setAccentColor(branding.accentColor);
  }, [branding]);

  function handleColorsSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    updateBranding.mutate(
      { primaryColor, accentColor },
      {
        onSuccess: () => toast('Colors updated.'),
        onError: (err) => setError(err instanceof Error ? err.message : 'Failed to update colors'),
      },
    );
  }

  function handleLogoSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!logoFile) return;
    updateLogo.mutate(logoFile, {
      onSuccess: () => toast('Logo updated.'),
      onError: (err) => setError(err instanceof Error ? err.message : 'Failed to upload logo'),
    });
  }

  return (
    <Card className="max-w-md">
      <h1 className="mb-4 text-xl font-semibold text-recruiter-text">Branding Settings</h1>
      {branding?.logoUrl && <img src={branding.logoUrl} alt="Organization logo" className="mb-4 max-h-20" />}
      <form onSubmit={handleColorsSubmit} className="mb-4 flex flex-col gap-3">
        <Input label="Primary color" type="color" value={primaryColor} onChange={setPrimaryColor} />
        <Input label="Accent color" type="color" value={accentColor} onChange={setAccentColor} />
        <Button type="submit">Save colors</Button>
      </form>
      <form onSubmit={handleLogoSubmit} className="flex flex-col gap-3">
        <label className="text-sm font-medium text-recruiter-text-secondary">
          Logo (PNG, JPEG, or SVG, max 2MB)
          <input
            type="file"
            accept="image/png,image/jpeg,image/svg+xml"
            onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
            className="mt-1 block w-full rounded-md border border-recruiter-border p-1.5 text-sm text-recruiter-text-secondary"
          />
        </label>
        <Button type="submit" variant="secondary">
          Upload logo
        </Button>
      </form>
      {error && (
        <p role="alert" className="mt-3 text-sm text-status-danger">
          {error}
        </p>
      )}
    </Card>
  );
}
```

Note: this rewrite reads via `useBranding(organizationSlug)` — the SAME query key (`['branding', organizationSlug]`) the shell already uses — instead of the old page's own current-org-scoped `/organizations/branding` GET. This is a deliberate consequence of Step 3's fix: the page and the shell now share one cache entry, and `useUpdateBranding`/`useUpdateBrandingLogo`'s invalidation refreshes both. If `/organizations/by-slug/{slug}/branding` returns a different shape or requires different auth than the old direct-org GET, that would be a real functional regression — confirm this by reading `apps/api/src/organizations/organizations.controller.ts`'s `by-slug/:slug/branding` route handler before finalizing this step, and if its response shape differs from `/organizations/branding`'s, adjust accordingly (this is a "read this first" checkpoint, not an assumption to skip).

- [ ] **Step 8: Run test to verify it passes**

Run: `cd apps/web && npx jest --testPathPattern="settings/branding/page.test.tsx"`
Expected: PASS

- [ ] **Step 9: Run both this task's test files together**

Run: `cd apps/web && npx jest --testPathPattern="useBranding.test.ts|settings/branding/page.test.tsx"`
Expected: PASS (3 tests total)

- [ ] **Step 10: Commit**

```bash
git add apps/web/lib/hooks/useBranding.ts apps/web/lib/hooks/useBranding.test.ts apps/web/app/\(org-admin\)/settings/branding/page.tsx apps/web/app/\(org-admin\)/settings/branding/page.test.tsx
git commit -m "feat: move branding settings onto React Query mutation hooks, redesign onto recruiter tokens"
```

---

### Task 3: Staff Users screen redesign

**Files:**
- Modify: `apps/web/app/(org-admin)/users/page.tsx`
- Modify: `apps/web/app/(org-admin)/users/page.test.tsx`

**Interfaces:**
- Consumes: `StatusBadge`/`StatusTone` (from Task 1 of the recruiter console plan, already shipped), `useUsers()`/`useCreateUser()` (unchanged).
- Produces: no exported interface — leaf page component.

- [ ] **Step 1: Write the failing test for the role/status badges**

Read `apps/web/app/(org-admin)/users/page.test.tsx` in full first (reproduced above). Add this test:

```tsx
  it('shows role and status as StatusBadge tags', async () => {
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).endsWith('/users')) {
        return new Response(
          JSON.stringify([
            {
              id: 'user-1', organizationId: 'org-1', email: 'admin@demo-org.test', role: 'org_admin',
              status: 'active', lastLoginAt: null, createdAt: '2026-07-01T00:00:00.000Z',
            },
          ]),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
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

    await waitFor(() => expect(screen.getByText('admin@demo-org.test')).toBeInTheDocument());
    expect(screen.getByText('Org Admin')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx jest --testPathPattern="\(org-admin\)/users/page.test.tsx" -t "StatusBadge"`
Expected: FAIL — current page renders the raw `role`/`status` strings (`'org_admin'`, `'active'`), not the human-readable badge labels (`'Org Admin'`, `'Active'`).

- [ ] **Step 3: Rewrite the page**

Replace `apps/web/app/(org-admin)/users/page.tsx` in full:

```tsx
'use client';

import { useState } from 'react';
import { useUsers, useCreateUser } from '../../../lib/hooks/useUsers';
import { Table, Input, Select, Button, StatusBadge, useToast, type Column, type StatusTone } from '../../../components/ui';
import { StaffUser } from '../../../lib/types';

const ROLE_OPTIONS = [
  { value: 'org_admin', label: 'Org Admin' },
  { value: 'recruiter', label: 'Recruiter' },
  { value: 'panel', label: 'Interview Panel' },
];

const ROLE_TONE: Record<string, StatusTone> = {
  org_admin: 'purple',
  recruiter: 'info',
  panel: 'neutral',
};

const ROLE_LABEL: Record<string, string> = {
  org_admin: 'Org Admin',
  recruiter: 'Recruiter',
  panel: 'Interview Panel',
};

// StaffUser.status is an unconstrained backend string (no enum/check constraint) whose
// only real value today is 'active' -- default unknown/future values to a neutral tone
// and a title-cased label rather than assuming a closed set.
function statusTone(status: string): StatusTone {
  return status === 'active' ? 'success' : 'neutral';
}

function statusLabel(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

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
    {
      key: 'role',
      header: 'Role',
      render: (user) => <StatusBadge tone={ROLE_TONE[user.role] ?? 'neutral'}>{ROLE_LABEL[user.role] ?? user.role}</StatusBadge>,
      sortValue: (user) => user.role,
    },
    {
      key: 'status',
      header: 'Status',
      render: (user) => <StatusBadge tone={statusTone(user.status)}>{statusLabel(user.status)}</StatusBadge>,
    },
    {
      key: 'lastLoginAt',
      header: 'Last login',
      render: (user) => (user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : 'Never'),
    },
  ];

  if (isLoading) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-semibold text-recruiter-text">Staff Users</h1>
        <p className="text-sm text-recruiter-text-tertiary">Loading…</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-semibold text-recruiter-text">Staff Users</h1>
        <p role="alert" className="text-sm text-status-danger">
          Failed to load users.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-recruiter-text">Staff Users</h1>
      <form onSubmit={handleSubmit} className="mb-6 flex items-end gap-2">
        <Input label="Email" type="email" value={email} onChange={setEmail} required />
        <Input label="Password" type="password" value={password} onChange={setPassword} required minLength={8} />
        <Select label="Role" value={role} onChange={setRole} options={ROLE_OPTIONS} />
        <Button type="submit">Add staff member</Button>
      </form>
      {error && (
        <p role="alert" className="mb-4 text-sm text-status-danger">
          {error}
        </p>
      )}
      <Table columns={columns} rows={users ?? []} rowKey={(user) => user.id} emptyMessage="No staff users yet." />
    </div>
  );
}
```

Note: `role` and `status` are typed as plain `string` on `StaffUser` (`apps/web/lib/types.ts`), so `ROLE_TONE[user.role]`/`ROLE_LABEL[user.role]` need the `?? 'neutral'`/`?? user.role` fallbacks shown above — TypeScript won't guarantee the API only ever sends the 3 known role values.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx jest --testPathPattern="\(org-admin\)/users/page.test.tsx"`
Expected: PASS (all 4 tests — 3 pre-existing + 1 new)

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/\(org-admin\)/users/page.tsx apps/web/app/\(org-admin\)/users/page.test.tsx
git commit -m "feat: redesign Staff Users with role/status StatusBadges"
```

---

### Task 4: Audit Log screen redesign

**Files:**
- Modify: `apps/web/app/(org-admin)/audit-log/page.tsx`
- Modify: `apps/web/app/(org-admin)/audit-log/page.test.tsx`

**Interfaces:**
- Consumes: `StatusBadge`/`StatusTone` (shipped), `useAuditLogs()` (unchanged).
- Produces: no exported interface — leaf page component.

- [ ] **Step 1: Write the failing test for the action badge**

Read `apps/web/app/(org-admin)/audit-log/page.test.tsx` in full first (reproduced above, including its `ENTRY_1`/`ENTRY_2` fixtures). Add this test:

```tsx
  it('renders the action column as a tone-mapped StatusBadge', async () => {
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).includes('/audit-logs')) {
        return new Response(JSON.stringify([ENTRY_1, ENTRY_2]), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    render(
      <QueryProvider>
        <AuthProvider>
          <AuditLogPage />
        </AuthProvider>
      </QueryProvider>,
    );

    await waitFor(() => expect(screen.getByText('user.created')).toBeInTheDocument());
    const createdBadge = screen.getByText('user.created');
    expect(createdBadge.className).toContain('bg-status-success-bg');
    const erasedBadge = screen.getByText('candidate.erased');
    expect(erasedBadge.className).toContain('bg-status-danger-bg');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx jest --testPathPattern="\(org-admin\)/audit-log/page.test.tsx" -t "tone-mapped"`
Expected: FAIL — current page renders `entry.action` as plain text, no `StatusBadge`, no `bg-status-*` class present.

- [ ] **Step 3: Rewrite the page**

Replace `apps/web/app/(org-admin)/audit-log/page.tsx` in full:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useAuditLogs, type AuditLogFilters } from '../../../lib/hooks/useAuditLogs';
import { Input, Button, Table, StatusBadge, type Column, type StatusTone } from '../../../components/ui';
import { AuditLogEntry } from '../../../lib/types';

// Action strings are open-ended ("<entity>.<verb>", e.g. "exam.published",
// "candidate.erased", "attempt.settled") -- tone by verb suffix rather than
// an exhaustive map, since new action types are added elsewhere in the app
// without this page's knowledge.
function actionTone(action: string): StatusTone {
  if (action.endsWith('.erased') || action.endsWith('.revoked') || action.endsWith('.archived')) return 'danger';
  if (action.endsWith('.published') || action.endsWith('.created') || action.endsWith('.settled')) return 'success';
  return 'neutral';
}

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
      render: (entry) => <span className="text-recruiter-text-tertiary">{new Date(entry.createdAt).toLocaleString()}</span>,
      sortValue: (entry) => entry.createdAt,
    },
    { key: 'actorEmail', header: 'Actor', render: (entry) => entry.actorEmail ?? 'System' },
    { key: 'action', header: 'Action', render: (entry) => <StatusBadge tone={actionTone(entry.action)}>{entry.action}</StatusBadge> },
    { key: 'entityType', header: 'Entity', render: (entry) => entry.entityType },
  ];

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-recruiter-text">Audit Log</h1>
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
        <p role="alert" className="text-sm text-status-danger">
          Failed to load audit log.
        </p>
      )}
      {isLoading && entries.length === 0 ? (
        <p className="text-sm text-recruiter-text-tertiary">Loading…</p>
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

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx jest --testPathPattern="\(org-admin\)/audit-log/page.test.tsx"`
Expected: PASS (all 4 tests — 3 pre-existing + 1 new)

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/\(org-admin\)/audit-log/page.tsx apps/web/app/\(org-admin\)/audit-log/page.test.tsx
git commit -m "feat: redesign Audit Log with tone-mapped action StatusBadges"
```

---

### Task 5: Candidate Data Rights screen redesign + typed-confirmation erase

**Files:**
- Modify: `apps/web/app/(org-admin)/data-rights/page.tsx`
- Modify: `apps/web/app/(org-admin)/data-rights/page.test.tsx`

**Interfaces:**
- Consumes: `Card`/`Modal`/`Input`/`Button` (unchanged props), `useLookupCandidate()`/`useExportCandidate()`/`useEraseCandidate()` (unchanged).
- Produces: no exported interface — leaf page component.

- [ ] **Step 1: Write the failing test for the typed-confirmation gate**

Read `apps/web/app/(org-admin)/data-rights/page.test.tsx` in full first (reproduced above, including its `CANDIDATE`/`EXPORT_DATA` fixtures and its 4 existing tests). Add this test, and update the existing "looks up, exports, and erases a candidate" test's erase step (see Step 1b below):

```tsx
  it('keeps the Confirm erase button disabled until the typed email matches exactly', async () => {
    const fetchMock = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).includes('/candidates/lookup')) {
        return new Response(JSON.stringify(CANDIDATE), { status: 200 });
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

    await userEvent.click(screen.getByRole('button', { name: 'Erase candidate' }));
    const confirmButton = screen.getByRole('button', { name: 'Confirm erase' });
    expect(confirmButton).toBeDisabled();

    await userEvent.type(screen.getByLabelText("Type the candidate's email to confirm"), 'wrong@example.com');
    expect(confirmButton).toBeDisabled();

    await userEvent.clear(screen.getByLabelText("Type the candidate's email to confirm"));
    await userEvent.type(screen.getByLabelText("Type the candidate's email to confirm"), 'gina@example.com');
    expect(confirmButton).toBeEnabled();
  });
```

**Step 1b — update the existing "looks up, exports, and erases a candidate" test** (it currently clicks "Confirm erase" immediately after opening the modal — with the new gate, that click would land on a disabled button and do nothing). Find this block in the existing test:

```tsx
    await userEvent.click(screen.getByRole('button', { name: 'Erase candidate' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirm erase' }));
```

Replace it with:

```tsx
    await userEvent.click(screen.getByRole('button', { name: 'Erase candidate' }));
    await userEvent.type(screen.getByLabelText("Type the candidate's email to confirm"), 'gina@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Confirm erase' }));
```

Apply this same two-line change to the OTHER two existing tests that also open the erase modal and click "Confirm erase" ("shows an error and keeps the modal open when erase fails", and "clears the error banner when a failed erase is retried and succeeds" — the latter has TWO "Confirm erase" clicks; type the confirmation email once, before the first click, since the modal and its typed-confirmation input stay open across the retry).

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx jest --testPathPattern="\(org-admin\)/data-rights/page.test.tsx"`
Expected: FAIL — no element with label "Type the candidate's email to confirm" exists yet, and the existing erase-flow tests' immediate "Confirm erase" click now has no gate to test against (they'll still pass against old code, which is exactly why the new test is the one that proves the gate doesn't exist yet).

- [ ] **Step 3: Rewrite the page**

Replace `apps/web/app/(org-admin)/data-rights/page.tsx` in full:

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
  const [confirmEmail, setConfirmEmail] = useState('');
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
      onSuccess: (result) => {
        setError(null);
        setExportData(result);
      },
      onError: (err) => setError(err instanceof Error ? err.message : 'Failed to export candidate data'),
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

  function handleOpenConfirm() {
    setConfirmEmail('');
    setConfirmOpen(true);
  }

  function handleCloseConfirm() {
    setConfirmOpen(false);
    setConfirmEmail('');
  }

  function handleErase() {
    if (!candidate) return;
    eraseCandidate.mutate(candidate.id, {
      onSuccess: (result) => {
        setError(null);
        setCandidate({ ...candidate, erasedAt: result.erasedAt });
        setConfirmOpen(false);
        setConfirmEmail('');
        toast('Candidate data erased.');
      },
      onError: (err) => setError(err instanceof Error ? err.message : 'Failed to erase candidate'),
    });
  }

  const eraseConfirmed = candidate !== null && confirmEmail.trim() === candidate.email;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-recruiter-text">Candidate Data Rights</h1>
      <form onSubmit={handleLookup} className="mb-6 flex items-end gap-2">
        <Input label="Candidate email" type="email" value={email} onChange={setEmail} required />
        <Button type="submit">Look up</Button>
      </form>
      {error && (
        <p role="alert" className="mb-4 text-sm text-status-danger">
          {error}
        </p>
      )}
      {candidate && (
        <Card className="mb-6">
          <p className="font-medium text-recruiter-text">{candidate.name}</p>
          <p className="text-sm text-recruiter-text-secondary">{candidate.email}</p>
          {candidate.phone && <p className="text-sm text-recruiter-text-secondary">{candidate.phone}</p>}
          {candidate.erasedAt ? (
            <p className="mt-2 text-sm text-recruiter-text-tertiary">Erased at {new Date(candidate.erasedAt).toLocaleString()}</p>
          ) : (
            <div className="mt-4 flex gap-2">
              <Button onClick={handleExport}>Export data</Button>
              <Button variant="secondary" onClick={handleOpenConfirm}>
                Erase candidate
              </Button>
            </div>
          )}
        </Card>
      )}
      {exportData && (
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-recruiter-text">Export data</h2>
            <Button variant="secondary" onClick={handleDownload}>
              Download JSON
            </Button>
          </div>
          <section className="mb-4">
            <h3 className="font-medium text-recruiter-text">Profile</h3>
            <p className="text-sm text-recruiter-text-secondary">
              {exportData.candidate.name} — {exportData.candidate.email}
            </p>
          </section>
          <section className="mb-4">
            <h3 className="font-medium text-recruiter-text">Invitations ({exportData.invitations.length})</h3>
            <ul className="text-sm text-recruiter-text-secondary">
              {exportData.invitations.map((invitation) => (
                <li key={invitation.id}>
                  {invitation.examTitle} — {invitation.status}
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h3 className="font-medium text-recruiter-text">Attempts ({exportData.attempts.length})</h3>
            <ul className="text-sm text-recruiter-text-secondary">
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
      <Modal open={confirmOpen} title="Erase candidate data?" onClose={handleCloseConfirm}>
        <p className="mb-4 text-sm text-recruiter-text-secondary">
          This permanently redacts {candidate?.name}&apos;s personal data. This cannot be undone.
        </p>
        <div className="mb-4">
          <Input
            label="Type the candidate's email to confirm"
            value={confirmEmail}
            onChange={setConfirmEmail}
            placeholder={candidate?.email}
          />
        </div>
        {error && (
          <p role="alert" className="mb-4 text-sm text-status-danger">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={handleCloseConfirm}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleErase} disabled={!eraseConfirmed}>
            Confirm erase
          </Button>
        </div>
      </Modal>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx jest --testPathPattern="\(org-admin\)/data-rights/page.test.tsx"`
Expected: PASS (all 5 tests — 4 pre-existing, updated per Step 1b, + 1 new)

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/\(org-admin\)/data-rights/page.tsx apps/web/app/\(org-admin\)/data-rights/page.test.tsx
git commit -m "feat: redesign Candidate Data Rights, add typed-email confirmation to erase"
```

---

### Task 6: Final verification

**Files:** none (verification only — no new production code).

**Interfaces:** none.

- [ ] **Step 1: Run the full frontend test suite**

Run: `cd apps/web && npx jest --runInBand`
Expected: all suites pass, including every file touched or created in Tasks 1–5. (`--runInBand` avoids the parallel-worker resource-contention flakiness documented from prior features on this machine — if a first parallel run shows scattered unrelated timeout failures, re-run with `--runInBand` before concluding anything is actually broken.)

- [ ] **Step 2: Type-check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no new errors. Only the 2 pre-existing, already-documented errors (`app/(candidate)/components/QuestionNavigator.test.tsx`, `app/login/page.test.tsx`) should remain — confirm by checking that neither error message mentions any file this plan touched.

- [ ] **Step 3: Manual smoke check in the browser**

Start the dev servers and, as an `org_admin` user, visit `/users`, `/audit-log`, `/data-rights`, `/settings/branding` in sequence. Confirm: the sidebar is white with icons, brand-accent active nav item, and an "Org Admin" user footer; Staff Users shows role/status badges; Audit Log shows tone-colored action badges; Data Rights' erase button stays disabled until the candidate's exact email is typed into the confirmation field, then successfully erases; Settings/Branding loads current colors/logo, and saving colors or uploading a logo updates the sidebar's branding without a full page reload (proving the shared `useBranding` query-key invalidation works). Confirm no console errors on any of the 4 screens.

- [ ] **Step 4: Commit any fixes found during verification**

If Steps 1–3 surface any failures, fix them and commit with a message describing the specific fix — do not bundle unrelated changes into this commit.
