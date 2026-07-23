# Staff Logout Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every logged-in staff user (recruiter, org_admin, panel) a working logout button in their sidebar footer.

**Architecture:** `useAuth().logout()` and `POST /auth/logout` already exist and work end-to-end — this plan only wires a UI control to the already-working `logout()` function, then calls `router.push('/login')`. Recruiter and org-admin already have a sidebar footer (avatar initials + name/role); this plan adds a small icon button to it. Panel has no footer at all today, so its task also builds one, matching the other two's structure, before adding the button.

**Tech Stack:** Next.js (App Router), React, `lucide-react` icons (already a dependency), Jest + React Testing Library + `@testing-library/user-event` (already the project's test stack for these files).

## Global Constraints

- Logout button uses the `LogOut` icon from `lucide-react`, sized 16px — matches the existing nav items' icon size in these same files.
- Button is a plain `<button>` element (not the shared `Button` component — nav chrome in these layouts already uses raw styled elements, not `Button`, which is built for padded/colored form actions).
- Button has `aria-label="Log out"` (icon-only, no visible text).
- Click handler: `await logout()` (from `useAuth()`) then `router.push('/login')`. No confirmation dialog.
- Panel's new footer reuses the exact same fallback pattern already established in recruiter/org-admin: `useAuth()` has no `userName` field, so the name line renders a hardcoded per-role fallback string ("Panel" for this layout) via the same `ponytail:`-commented rationale already present in the other two files — copy that comment verbatim, changing only the role string.
- All three roles redirect to `/login` on logout (the same page each layout already redirects to when `accessToken` is missing).

---

### Task 1: Recruiter layout — logout button

**Files:**
- Modify: `apps/web/app/(recruiter)/layout.tsx`
- Test: `apps/web/app/(recruiter)/layout.test.tsx`

**Interfaces:**
- Consumes: `useAuth()` (existing, `apps/web/lib/auth-context.tsx`) — specifically its already-implemented `logout: () => Promise<void>` field, and its existing `router.push` pattern already used in this file's `useEffect`.
- Produces: nothing new consumed by later tasks — Task 1 and Task 2 are independent siblings, both consumed only by Task 3 for visual parity reference (no shared code).

- [ ] **Step 1: Write the failing test**

Add this test to `apps/web/app/(recruiter)/layout.test.tsx`, inside the existing `describe('Recruiter layout', ...)` block (add `userEvent` to the imports at the top of the file: `import userEvent from '@testing-library/user-event';`):

```tsx
  it('logs out and redirects to /login when the logout button is clicked', async () => {
    renderLayout();
    const logoutButton = await screen.findByRole('button', { name: 'Log out' });

    await userEvent.click(logoutButton);

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/login'));
    const logoutCall = (global.fetch as jest.Mock).mock.calls.find(([url]) => String(url).endsWith('/auth/logout'));
    expect(logoutCall).toBeDefined();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx jest app/\(recruiter\)/layout.test.tsx -t "logs out and redirects"`
Expected: FAIL — `Unable to find role="button" with name "Log out"` (the button doesn't exist yet).

- [ ] **Step 3: Add the logout button to the layout**

In `apps/web/app/(recruiter)/layout.tsx`:

Add `LogOut` to the existing `lucide-react` import (line 7):
```tsx
import { LayoutDashboard, FileText, BookOpen, Users, LogOut } from 'lucide-react';
```

Add `logout` to the existing `useAuth()` destructure (line 21):
```tsx
  const { accessToken, organizationSlug, role, isLoading, logout } = useAuth();
```

Add a handler function right after the `themeStyle` block (after line 35, before the loading-state `if`):
```tsx
  async function handleLogout() {
    await logout();
    router.push('/login');
  }
```

Replace the footer `<div>` (lines 92-100) to add the button alongside the existing identity block:
```tsx
        <div className="flex items-center justify-between gap-2 border-t border-recruiter-border px-3.5 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-white">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-recruiter-text">Recruiter</p>
              <p className="text-[10.5px] text-recruiter-text-tertiary">Recruiter</p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Log out"
            onClick={handleLogout}
            className="shrink-0 rounded-md p-1.5 text-recruiter-text-tertiary hover:bg-recruiter-bg-subtle hover:text-recruiter-text"
          >
            <LogOut size={16} />
          </button>
        </div>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx jest app/\(recruiter\)/layout.test.tsx`
Expected: PASS — all tests in the file, including the new one.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/\(recruiter\)/layout.tsx apps/web/app/\(recruiter\)/layout.test.tsx
git commit -m "feat: add logout button to recruiter sidebar footer"
```

---

### Task 2: Org-admin layout — logout button

**Files:**
- Modify: `apps/web/app/(org-admin)/layout.tsx`
- Test: `apps/web/app/(org-admin)/layout.test.tsx`

**Interfaces:**
- Consumes: same as Task 1 — `useAuth().logout()` and the existing `router.push` pattern.
- Produces: nothing new for later tasks.

- [ ] **Step 1: Write the failing test**

The existing `apps/web/app/(org-admin)/layout.test.tsx` doesn't have a `renderLayout` helper like recruiter's — each test inlines its own render. Add `userEvent` to the imports (`import userEvent from '@testing-library/user-event';`), and add this test inside the existing `describe('Org admin layout', ...)` block:

```tsx
  it('logs out and redirects to /login when the logout button is clicked', async () => {
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

    const logoutButton = await screen.findByRole('button', { name: 'Log out' });
    await userEvent.click(logoutButton);

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/login'));
    const logoutCall = (global.fetch as jest.Mock).mock.calls.find(([url]) => String(url).endsWith('/auth/logout'));
    expect(logoutCall).toBeDefined();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx jest app/\(org-admin\)/layout.test.tsx -t "logs out and redirects"`
Expected: FAIL — `Unable to find role="button" with name "Log out"`.

- [ ] **Step 3: Add the logout button to the layout**

In `apps/web/app/(org-admin)/layout.tsx`:

Add `LogOut` to the existing `lucide-react` import (line 7):
```tsx
import { Users, History, ShieldCheck, Settings, LogOut } from 'lucide-react';
```

Add `logout` to the existing `useAuth()` destructure (line 21):
```tsx
  const { accessToken, organizationSlug, role, isLoading, logout } = useAuth();
```

Add a handler function right after the `themeStyle` block (after line 35, before the loading-state `if`):
```tsx
  async function handleLogout() {
    await logout();
    router.push('/login');
  }
```

Replace the footer `<div>` (lines 93-101) to add the button alongside the existing identity block:
```tsx
        <div className="flex items-center justify-between gap-2 border-t border-recruiter-border px-3.5 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-white">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-recruiter-text">Org Admin</p>
              <p className="text-[10.5px] text-recruiter-text-tertiary">Org Admin</p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Log out"
            onClick={handleLogout}
            className="shrink-0 rounded-md p-1.5 text-recruiter-text-tertiary hover:bg-recruiter-bg-subtle hover:text-recruiter-text"
          >
            <LogOut size={16} />
          </button>
        </div>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx jest app/\(org-admin\)/layout.test.tsx`
Expected: PASS — all tests in the file, including the new one.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/\(org-admin\)/layout.tsx apps/web/app/\(org-admin\)/layout.test.tsx
git commit -m "feat: add logout button to org-admin sidebar footer"
```

---

### Task 3: Panel layout — footer + logout button

**Files:**
- Modify: `apps/web/app/(panel)/layout.tsx`
- Create: `apps/web/app/(panel)/layout.test.tsx`

**Interfaces:**
- Consumes: `useAuth().logout()`, same handler shape as Tasks 1 and 2 (`async function handleLogout() { await logout(); router.push('/login'); }`).
- Produces: nothing consumed by later tasks — this is the last task in the plan.

Panel's layout currently has no footer, no `useAuth()` destructure beyond what's already there, and no test file. This task both builds the footer (matching recruiter/org-admin's structure) and adds the button, in one TDD cycle, since the footer only exists to hold the button — there is no separate reviewable deliverable for "footer with no logout control."

- [ ] **Step 1: Write the failing test**

Create `apps/web/app/(panel)/layout.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PanelLayout from './layout';
import { AuthProvider } from '../../lib/auth-context';
import { QueryProvider } from '../../lib/query-provider';
import { fakeJwt } from '../../lib/test-utils/fake-jwt';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }), usePathname: () => '/reports' }));

describe('Panel layout', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    mockPush.mockClear();
  });

  function renderLayout(role = 'panel') {
    const token = fakeJwt({ sub: 'u1', organizationId: 'org1', role });
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: token }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    return render(
      <QueryProvider>
        <AuthProvider>
          <PanelLayout>
            <p>Page content</p>
          </PanelLayout>
        </AuthProvider>
      </QueryProvider>,
    );
  }

  it('renders the sidebar nav links for a panel user', async () => {
    renderLayout();
    expect(await screen.findByRole('link', { name: 'Exams' })).toBeInTheDocument();
  });

  it('redirects a recruiter (wrong role) to /login instead of rendering the panel shell', async () => {
    renderLayout('recruiter');
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/login'));
    expect(screen.queryByRole('link', { name: 'Exams' })).not.toBeInTheDocument();
  });

  it('logs out and redirects to /login when the logout button is clicked', async () => {
    renderLayout();
    const logoutButton = await screen.findByRole('button', { name: 'Log out' });

    await userEvent.click(logoutButton);

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/login'));
    const logoutCall = (global.fetch as jest.Mock).mock.calls.find(([url]) => String(url).endsWith('/auth/logout'));
    expect(logoutCall).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx jest app/\(panel\)/layout.test.tsx`
Expected: FAIL — `Cannot find module './layout.test'` resolves fine (file exists), but `Unable to find role="button" with name "Log out"` on the third test; the first two tests should already PASS since the nav/redirect logic already exists.

- [ ] **Step 3: Add the footer and logout button to the layout**

Replace the full contents of `apps/web/app/(panel)/layout.tsx`:

```tsx
'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import clsx from 'clsx';
import { LogOut } from 'lucide-react';
import { useAuth } from '../../lib/auth-context';
import { useBranding } from '../../lib/hooks/useBranding';

const NAV_ITEMS = [{ href: '/reports', label: 'Exams' }];

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { accessToken, organizationSlug, role, isLoading, logout } = useAuth();
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

  async function handleLogout() {
    await logout();
    router.push('/login');
  }

  // ponytail: useAuth() has no userName field yet; always render the 'Panel' fallback
  // rather than widening the auth contract (out of scope for this task) — matches the
  // recruiter/org-admin shells' identical fallback for the same reason.
  const initials = 'Panel'
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div style={themeStyle} className="flex min-h-screen">
      <nav className="flex w-56 shrink-0 flex-col border-r border-gray-200 bg-gray-50">
        <div className="p-4">
          {branding?.logoUrl && <img src={branding.logoUrl} alt="Organization logo" className="mb-4 max-h-10" />}
        </div>
        <ul className="flex flex-1 flex-col gap-1 px-4">
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
        <div className="flex items-center justify-between gap-2 border-t border-gray-200 px-3.5 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-white">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-gray-900">Panel</p>
              <p className="text-[10.5px] text-gray-500">Panel</p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Log out"
            onClick={handleLogout}
            className="shrink-0 rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
          >
            <LogOut size={16} />
          </button>
        </div>
      </nav>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
```

Note: this moves the nav `<ul>`'s padding from the outer `<nav className="... p-4">` (old version) to per-section padding (`p-4` on the logo wrapper, `px-4` on the `<ul>`), so the new footer can sit flush against the sidebar's bottom border like recruiter/org-admin's footers do — same layout technique already used in those two files (`flex flex-col` nav with a `flex-1` middle section and a bordered footer).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx jest app/\(panel\)/layout.test.tsx`
Expected: PASS — all 3 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/\(panel\)/layout.tsx apps/web/app/\(panel\)/layout.test.tsx
git commit -m "feat: add sidebar footer with logout button to panel layout"
```

---

### Task 4: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full frontend test suite**

Run: `cd apps/web && npx jest`
Expected: All suites pass, including the 3 modified/created layout test files.

- [ ] **Step 2: Run frontend typecheck**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No new errors introduced by this feature (compare against the pre-existing baseline if any unrelated errors already exist).

- [ ] **Step 3: Manual verification in the browser**

Start the dev servers (api + web), log in as each of the 3 roles using the seeded dev accounts (`apps/api/prisma/seed.ts`: `org_admin`/`recruiter`/`panel` users on `demo-org`), and for each:
1. Confirm the logout icon button is visible in the sidebar footer, next to the avatar/name block.
2. Click it.
3. Confirm the browser navigates to `/login`.
4. Confirm the session is actually gone: navigate directly back to the role's protected route (e.g. `/dashboard` for recruiter) and confirm it redirects to `/login` again rather than showing the page (proves the access token was actually cleared, not just a client-side redirect with a stale session still valid).

- [ ] **Step 4: Commit if any fixes were needed**

Only if Steps 1-3 surfaced a bug requiring a code change. If everything passed as implemented, there is nothing to commit here.

---

## Notes for the controller (not implementer-facing)

- Tasks 1 and 2 are independent of each other (different files) and can be dispatched in either order, but per this session's established subagent-driven-development practice, dispatch implementer subagents sequentially, not in parallel, even for independent tasks.
- Task 3 depends on nothing from Tasks 1-2 functionally, but reuses their exact visual/structural pattern — the implementer brief should point to the already-committed Task 1/2 diffs as the reference pattern once they exist, so Panel's footer doesn't drift stylistically.
- This is a small enough feature that ADO tracking can be a single User Story + 4 Tasks (one per plan task) under the existing Epic #6084 "Frontend Development", rather than a full Feature — but follow whatever ADO granularity the user requests at execution time, matching this session's established pattern of asking before creating the hierarchy.
