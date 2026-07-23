# Recruiter Console Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the recruiter console (shell, Dashboard, Exams, Question Bank, Candidates) into a dense, ATS-standard visual language, backed by three new/extended backend aggregation endpoints.

**Architecture:** Extend the existing 12 `apps/web/components/ui/*` primitives in place (no parallel component set), add one new primitive (`StatusBadge`), retrofit the 4 list pages onto a shared dense-table pattern, and add the backend aggregation the expanded Dashboard and Exams-list-progress-column require. Backend work lives in `apps/api` only — no schema migration needed.

**Tech Stack:** Next.js 16 (App Router) + Tailwind + `@radix-ui/react-*` + `lucide-react` (already a dependency) on the frontend; NestJS + Prisma (SQL Server) on the backend.

## Global Constraints

- Org branding stays a single override point: `--color-primary`/`--color-accent` CSS variables, mapped to Tailwind `primary`/`accent`. No new branding override is introduced anywhere in this plan.
- New design tokens live under two new Tailwind color namespaces: `recruiter.*` (neutrals: border/text tiers/subtle background) and `status.*` (badge tones: success/warning/danger/neutral/info/purple) — see Task 1 for exact hex values.
- Icons: `lucide-react` only, replacing every unicode glyph touched by this plan. No other icon library is added.
- Elevation & shape: `rounded-lg` (cards/tables), `rounded-md` (buttons/inputs), `rounded-full` (badges/pills), `border` + `shadow-sm` on containers.
- Extend `apps/web/components/ui/*` primitives in place — do not create a parallel `recruiter/*` component set.
- Out of scope: `(panel)`, `(org-admin)`, the exam builder/editor, staff login page, Live Monitoring tab.
- Test conventions: frontend page/component tests use `@testing-library/react` with `QueryProvider` + `ToastProvider` + `AuthProvider` wrappers and a mocked `global.fetch` (see `apps/web/app/(recruiter)/exams/page.test.tsx` for the exact pattern — every list-page test in this plan follows it). Backend service tests use `Test.createTestingModule` with manually-stubbed providers (see `apps/api/src/invitations/invitations.service.spec.ts`). Backend e2e tests use `supertest` against a real `INestApplication` with seeded `Plan`/`Organization`/`User` rows (see `apps/api/test/audit-log.e2e-spec.ts`).

---

### Task 1: Design tokens + StatusBadge primitive

**Files:**
- Modify: `apps/web/tailwind.config.ts`
- Create: `apps/web/components/ui/StatusBadge.tsx`
- Create: `apps/web/components/ui/StatusBadge.test.tsx`
- Modify: `apps/web/components/ui/index.ts`

**Interfaces:**
- Produces: Tailwind classes `text-recruiter-border`, `text-recruiter-text`, `text-recruiter-text-secondary`, `text-recruiter-text-tertiary`, `bg-recruiter-bg-subtle` (and `border-recruiter-*`/`bg-recruiter-*` equivalents); `bg-status-{success,warning,danger,neutral,info,purple}` and `bg-status-{success,warning,danger,neutral,info,purple}-bg`. Component `StatusBadge({ tone, children }: { tone: 'success' | 'warning' | 'danger' | 'neutral' | 'info' | 'purple'; children: ReactNode })`, exported from `apps/web/components/ui/index.ts`.

- [ ] **Step 1: Add the new color tokens to Tailwind config**

Edit `apps/web/tailwind.config.ts` — add `recruiter` and `status` alongside the existing `candidate` key inside `theme.extend.colors`:

```ts
import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: 'var(--color-primary, #1a73e8)',
        accent: 'var(--color-accent, #fbbc04)',
        candidate: {
          primary: '#2F6F5E',
          'primary-light': '#F0F7F4',
          bg: '#F4F7F6',
          review: '#B8860B',
          'review-bg': '#FBF3DD',
          'review-border': '#E8D8A8',
          danger: '#B23B3B',
          'danger-bg': '#FBEAEA',
          'danger-border': '#F0C9C9',
          border: '#E4E7E5',
          text: '#1A1F1D',
          'text-secondary': '#57615B',
          'text-tertiary': '#6B7570',
          'text-faint': '#9AA5A0',
        },
        recruiter: {
          border: '#E4E7E5',
          text: '#1A1F1D',
          'text-secondary': '#57615B',
          'text-tertiary': '#9AA5A0',
          'bg-subtle': '#F7F9F8',
        },
        status: {
          success: '#2F6F5E',
          'success-bg': '#EAF5EF',
          warning: '#8A5A00',
          'warning-bg': '#FBF3DD',
          danger: '#B23B3B',
          'danger-bg': '#FBEAEA',
          neutral: '#6B7570',
          'neutral-bg': '#F3F5F4',
          info: '#2955A3',
          'info-bg': '#EAF0FB',
          purple: '#6B2FA3',
          'purple-bg': '#F3EAFB',
        },
      },
      spacing: {
        4.5: '18px',
      },
    },
  },
  plugins: [],
};

export default config;
```

- [ ] **Step 2: Write the failing test for StatusBadge**

Create `apps/web/components/ui/StatusBadge.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { StatusBadge } from './StatusBadge';

describe('StatusBadge', () => {
  it('renders its label with the tone-specific background and text classes', () => {
    render(<StatusBadge tone="success">Published</StatusBadge>);
    const badge = screen.getByText('Published');
    expect(badge.className).toContain('bg-status-success-bg');
    expect(badge.className).toContain('text-status-success');
  });

  it('supports every tone without throwing', () => {
    const tones = ['success', 'warning', 'danger', 'neutral', 'info', 'purple'] as const;
    for (const tone of tones) {
      render(<StatusBadge tone={tone}>{tone}</StatusBadge>);
      expect(screen.getByText(tone)).toBeInTheDocument();
    }
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/web && npx jest components/ui/StatusBadge.test.tsx`
Expected: FAIL with "Cannot find module './StatusBadge'"

- [ ] **Step 4: Implement StatusBadge**

Create `apps/web/components/ui/StatusBadge.tsx`:

```tsx
import { ReactNode } from 'react';
import clsx from 'clsx';

export type StatusTone = 'success' | 'warning' | 'danger' | 'neutral' | 'info' | 'purple';

const TONE_CLASSES: Record<StatusTone, string> = {
  success: 'bg-status-success-bg text-status-success',
  warning: 'bg-status-warning-bg text-status-warning',
  danger: 'bg-status-danger-bg text-status-danger',
  neutral: 'bg-status-neutral-bg text-status-neutral',
  info: 'bg-status-info-bg text-status-info',
  purple: 'bg-status-purple-bg text-status-purple',
};

export function StatusBadge({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  return (
    <span className={clsx('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold', TONE_CLASSES[tone])}>
      {children}
    </span>
  );
}
```

- [ ] **Step 5: Export StatusBadge from the barrel file**

Read `apps/web/components/ui/index.ts` first to see the existing export list, then add a line exporting `StatusBadge` (and its `StatusTone` type) from `./StatusBadge`, following the same `export { X } from './X'` pattern already used for the other 12 primitives in that file.

- [ ] **Step 6: Run test to verify it passes**

Run: `cd apps/web && npx jest components/ui/StatusBadge.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 7: Commit**

```bash
git add apps/web/tailwind.config.ts apps/web/components/ui/StatusBadge.tsx apps/web/components/ui/StatusBadge.test.tsx apps/web/components/ui/index.ts
git commit -m "feat: add recruiter/status design tokens and StatusBadge primitive"
```

---

### Task 2: Retrofit existing shared primitives (tokens + icons + bug fix)

**Files:**
- Modify: `apps/web/components/ui/Badge.tsx`
- Modify: `apps/web/components/ui/Badge.test.tsx`
- Modify: `apps/web/components/ui/Card.tsx`
- Modify: `apps/web/components/ui/Button.tsx`
- Modify: `apps/web/components/ui/Table.tsx`
- Modify: `apps/web/components/ui/Select.tsx`
- Modify: `apps/web/components/ui/DropdownMenu.tsx`

**Interfaces:**
- Consumes: `StatusTone` colors from Task 1 (Tailwind config already updated).
- Produces: `Table`'s `<tr>` elements now carry a `group` class (existing `Column<T>.render` callers can rely on `group-hover:opacity-100` inside their own cell JSX — used by Tasks 7-9's row-actions column). No prop/type signature changes to `Table`, `Select`, `DropdownMenu`, `Button`, `Card`, or `Badge` — visual/token changes only.

- [ ] **Step 1: Write the failing test for the Badge bug fix**

Read `apps/web/components/ui/Badge.test.tsx` first (it currently asserts the buggy behavior — the raw variant name being present as its own class is what we're removing). Replace its content with:

```tsx
import { render, screen } from '@testing-library/react';
import { Badge } from './Badge';

describe('Badge', () => {
  it('renders its label and applies only the mapped variant classes', () => {
    render(<Badge variant="success">Published</Badge>);
    const badge = screen.getByText('Published');
    expect(badge.className).toContain('bg-green-100');
    expect(badge.className).toContain('text-green-800');
    // The old implementation also added the raw variant name ("success") as its own,
    // unstyled class -- a leftover bug. Assert it's gone.
    expect(badge.className.split(' ')).not.toContain('success');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx jest components/ui/Badge.test.tsx`
Expected: FAIL — `badge.className.split(' ')` still contains `"success"`

- [ ] **Step 3: Fix the Badge bug**

In `apps/web/components/ui/Badge.tsx`, change line 15 from:

```tsx
    <span className={clsx('inline-block rounded-full px-2 py-0.5 text-xs font-medium', variant, VARIANT_CLASSES[variant])}>
```

to:

```tsx
    <span className={clsx('inline-block rounded-full px-2 py-0.5 text-xs font-medium', VARIANT_CLASSES[variant])}>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx jest components/ui/Badge.test.tsx`
Expected: PASS

- [ ] **Step 5: Update Card's border token**

In `apps/web/components/ui/Card.tsx`, change:

```tsx
  return <div className={clsx('rounded-lg border border-gray-200 bg-white p-4 shadow-sm', className)}>{children}</div>;
```

to:

```tsx
  return <div className={clsx('rounded-lg border border-recruiter-border bg-white p-4 shadow-sm', className)}>{children}</div>;
```

- [ ] **Step 6: Update Button's border radius**

In `apps/web/components/ui/Button.tsx`, change the `'rounded px-4 py-2 ...'` base class (line 20) to `'rounded-md px-4 py-2 ...'` (matches the plan's `rounded-md` button/input convention). No other change to `Button.tsx` — its `primary`/`secondary`/`danger` variants already read `bg-primary`, which is correct per the Global Constraints (org-brand override stays intact).

- [ ] **Step 7: Retint and re-icon Table.tsx**

In `apps/web/components/ui/Table.tsx`:

1. Add `import { ArrowUp, ArrowDown } from 'lucide-react';` to the imports.
2. Change the header `<tr>` (line 59) from `className="border-b border-gray-200 text-left"` to `className="border-b border-recruiter-border bg-recruiter-bg-subtle text-left"`.
3. Change the `<th>` `clsx` call (line 63) from `'px-3 py-2 font-medium text-gray-600', ...` to `'px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-recruiter-text-tertiary', ...`.
4. Replace the sort-indicator text (line 71) — currently `{sortKey === column.key && (sortDir === 'asc' ? ' ↑' : ' ↓')}` — with:
   ```tsx
   {sortKey === column.key &&
     (sortDir === 'asc' ? (
       <ArrowUp size={12} className="ml-1 inline" />
     ) : (
       <ArrowDown size={12} className="ml-1 inline" />
     ))}
   ```
5. Change the body `<tr>` (line 78) from `className="border-b border-gray-100 last:border-0"` to `className="group border-b border-recruiter-border/60 last:border-0 hover:bg-recruiter-bg-subtle"` — the `group` class lets consuming pages mark a hover-revealed actions cell with `opacity-0 group-hover:opacity-100` (used in Tasks 7-9), and is a no-op for any existing consumer page that doesn't use `group-hover:`.
6. Change the `<td>` `className="px-3 py-2"` (line 80) to `className="px-3 py-2.5 text-recruiter-text"`.
7. Change the empty-state message (line 45) from `className="py-8 text-center text-sm text-gray-500"` to `className="py-8 text-center text-sm text-recruiter-text-tertiary"`.

- [ ] **Step 8: Re-icon Select.tsx**

In `apps/web/components/ui/Select.tsx`:

1. Add `import { ChevronDown } from 'lucide-react';`.
2. Replace line 28, `<RadixSelect.Icon>▾</RadixSelect.Icon>`, with `<RadixSelect.Icon><ChevronDown size={14} /></RadixSelect.Icon>`.
3. Change the trigger's `border-gray-300` (line 25) to `border-recruiter-border`, and the content's `border-gray-200` (line 31) to `border-recruiter-border`.

- [ ] **Step 9: Re-icon DropdownMenu.tsx trigger border**

In `apps/web/components/ui/DropdownMenu.tsx`, change `border-gray-300` (line 12) to `border-recruiter-border` and `border-gray-200` (line 21) to `border-recruiter-border`. (`DropdownMenu` has no glyph of its own to replace — its trigger content is caller-supplied children.)

- [ ] **Step 10: Run the full shared-primitives test suite**

Run: `cd apps/web && npx jest components/ui`
Expected: All existing + new tests PASS (Badge, StatusBadge, Table, Select, DropdownMenu, Button, Card, plus the other untouched primitives' existing suites).

- [ ] **Step 11: Commit**

```bash
git add apps/web/components/ui/Badge.tsx apps/web/components/ui/Badge.test.tsx apps/web/components/ui/Card.tsx apps/web/components/ui/Button.tsx apps/web/components/ui/Table.tsx apps/web/components/ui/Select.tsx apps/web/components/ui/DropdownMenu.tsx
git commit -m "fix: remove stray Badge variant class; retint shared primitives to recruiter tokens and lucide icons"
```

---

### Task 3: Sidebar shell redesign

**Files:**
- Modify: `apps/web/app/(recruiter)/layout.tsx`
- Modify: `apps/web/app/(recruiter)/layout.test.tsx`

**Interfaces:**
- Consumes: `recruiter.*` tokens (Task 1). No change to `useAuth()`/`useBranding()` hook signatures.
- Produces: no exported interface — this is a leaf layout component.

- [ ] **Step 1: Read the existing layout test**

Read `apps/web/app/(recruiter)/layout.test.tsx` in full first, to see its exact mocking setup for `useAuth`/`useBranding`/`usePathname`, and preserve that setup while updating assertions below.

- [ ] **Step 2: Write the failing test for the new nav icons + user footer**

Add these two cases to `apps/web/app/(recruiter)/layout.test.tsx` (adjust the existing mock setup already in the file to render them — reuse whatever `renderLayout`/mock-provider helper the file already defines):

```tsx
  it('renders each nav item with an icon and marks the active route', () => {
    renderLayout({ pathname: '/exams' });
    const examsLink = screen.getByRole('link', { name: /Exams/i });
    expect(examsLink.className).toContain('text-primary');
    const dashboardLink = screen.getByRole('link', { name: /Dashboard/i });
    expect(dashboardLink.className).not.toContain('text-primary');
  });

  it('renders a user footer with the current user name and role', () => {
    renderLayout({ pathname: '/dashboard' });
    expect(screen.getByText(/Recruiter/i)).toBeInTheDocument();
  });
```

(If the existing file's mock for `useAuth` does not already expose a user name/role, extend the mock's returned object with `{ userName: 'Hari Mada', role: 'recruiter' }` at the same place `accessToken`/`organizationSlug` are mocked — matching whatever shape `useAuth()` already returns elsewhere in this file.)

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/web && npx jest "app/(recruiter)/layout.test.tsx"`
Expected: FAIL — no `text-primary` class on the active link (current code uses `bg-primary text-white`), no user-footer text present.

- [ ] **Step 4: Rewrite the layout**

Replace `apps/web/app/(recruiter)/layout.tsx` in full:

```tsx
'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import clsx from 'clsx';
import { LayoutDashboard, FileText, BookOpen, Users } from 'lucide-react';
import { useAuth } from '../../lib/auth-context';
import { useBranding } from '../../lib/hooks/useBranding';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/exams', label: 'Exams', icon: FileText },
  { href: '/questions', label: 'Question Bank', icon: BookOpen },
  { href: '/candidates', label: 'Candidates', icon: Users },
];

export default function RecruiterLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { accessToken, organizationSlug, role, isLoading, userName } = useAuth();
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
    return <p className="p-8 text-sm text-recruiter-text-tertiary">Loading…</p>;
  }

  const initials = (userName ?? 'Recruiter')
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  const orgInitial = (branding?.organizationName ?? organizationSlug ?? 'O')[0]?.toUpperCase();

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
          <span className="truncate text-sm font-bold text-recruiter-text">{branding?.organizationName ?? organizationSlug}</span>
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
                      ? 'border-l-[3px] border-primary bg-primary/10 pl-[7px] font-semibold text-primary'
                      : 'text-recruiter-text-secondary hover:bg-recruiter-bg-subtle',
                  )}
                >
                  <Icon size={16} />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="flex items-center gap-2 border-t border-recruiter-border px-3.5 py-3">
          <div className="flex h-6.5 w-6.5 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-white">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-recruiter-text">{userName ?? 'Recruiter'}</p>
            <p className="text-[10.5px] text-recruiter-text-tertiary">Recruiter</p>
          </div>
        </div>
      </nav>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
```

Note: this step assumes `useAuth()` exposes a `userName` field. If it does not yet (check `apps/web/lib/auth-context.tsx`), fall back to always rendering `'Recruiter'` as both the initials source and the footer name — do not widen `useAuth()`'s contract as part of this task, since that would touch session/auth code outside this redesign's scope. Confirm which case applies, then keep the layout and its test consistent with the real `useAuth()` shape.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/web && npx jest "app/(recruiter)/layout.test.tsx"`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/\(recruiter\)/layout.tsx apps/web/app/\(recruiter\)/layout.test.tsx
git commit -m "feat: redesign recruiter sidebar shell with icons, brand-accent active state, and user footer"
```

---

### Task 4: Backend — `invitation.created` audit event

**Files:**
- Modify: `apps/api/src/invitations/invitations.service.ts`
- Modify: `apps/api/src/invitations/invitations.service.spec.ts`

**Interfaces:**
- Produces: an `AuditLog` row with `action: 'invitation.created'`, `entityType: 'invitation'`, `metadata: { count: number, examTitle: string }` written once per `bulkInvite()` call (covers both the single-add UI path and true bulk/CSV-upload paths, since both funnel through `bulkInvite()`). Task 6 (Dashboard summary) consumes this action name and metadata shape for the "recent activity" feed.

- [ ] **Step 1: Write the failing test**

Add this test to `apps/api/src/invitations/invitations.service.spec.ts`, in the `describe('InvitationsService', ...)` block, alongside the existing `bulkInvite` tests:

```ts
  it('records an invitation.created audit entry with the invited count and exam title', async () => {
    const createTx = {
      exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1', title: 'Backend Round', status: 'published' }) },
      candidate: { findMany: jest.fn().mockResolvedValue([{ id: 'cand-1', email: 'a@test.com', name: 'Alice', erasedAt: null }]) },
      invitation: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 'inv-1', examId: 'exam-1', candidateId: 'cand-1', status: 'invited' }),
      },
    };
    const notifTx = { notification: { create: jest.fn().mockResolvedValue({ id: 'notif-1' }) } };
    tenantPrisma.forTenant
      .mockImplementationOnce((_ctx, fn) => fn(createTx))
      .mockImplementationOnce((_ctx, fn) => fn(notifTx));

    await service.bulkInvite(context, 'exam-1', ['cand-1']);

    expect(audit.record).toHaveBeenCalledWith(context, {
      actorUserId: null,
      action: 'invitation.created',
      entityType: 'invitation',
      metadata: { count: 1, examTitle: 'Backend Round' },
    });
  });

  it('does not record an invitation.created audit entry when every candidate is skipped', async () => {
    const tx = {
      exam: { findFirst: jest.fn().mockResolvedValue({ id: 'exam-1', title: 'Backend Round', status: 'published' }) },
      candidate: { findMany: jest.fn().mockResolvedValue([{ id: 'cand-1', email: 'a@test.com', name: 'Alice', erasedAt: null }]) },
      invitation: {
        findMany: jest.fn().mockResolvedValue([{ candidateId: 'cand-1' }]),
        create: jest.fn(),
      },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    await service.bulkInvite(context, 'exam-1', ['cand-1']);

    expect(audit.record).not.toHaveBeenCalled();
  });
```

`actorUserId` is `null` here because `bulkInvite()` has no `actorUserId` parameter today (unlike `revoke()`) — matching the exam-runtime convention of `actorUserId: null` for events not tied to an explicit acting-user parameter already threaded through the call.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest src/invitations/invitations.service.spec.ts`
Expected: FAIL — `audit.record` was not called (current `bulkInvite()` never calls it).

- [ ] **Step 3: Add the audit call**

In `apps/api/src/invitations/invitations.service.ts`, in `bulkInvite()`, insert the audit call right after the fire-and-forget email-dispatch loop (after line 120, before the `return` on line 122):

```ts
    for (const { invitation, candidate } of createdWithCandidate) {
      this.dispatchInvitationEmail(context, examTitle, invitation, candidate).catch((error) =>
        this.logger.error(`Failed to dispatch invitation email for candidate ${candidate.id}`, error as Error),
      );
    }

    if (createdWithCandidate.length > 0) {
      await this.audit.record(context, {
        actorUserId: null,
        action: 'invitation.created',
        entityType: 'invitation',
        metadata: { count: createdWithCandidate.length, examTitle },
      });
    }

    return { created: createdWithCandidate.map((c) => c.invitation), skipped };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx jest src/invitations/invitations.service.spec.ts`
Expected: PASS (all existing + 2 new tests)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/invitations/invitations.service.ts apps/api/src/invitations/invitations.service.spec.ts
git commit -m "feat: record invitation.created audit event on candidate invite"
```

---

### Task 5: Backend — Exams list attempt/invitation aggregate

**Files:**
- Modify: `apps/api/src/exams/exams.service.ts`
- Modify: `apps/api/src/exams/exams.service.spec.ts`
- Modify: `apps/web/lib/types.ts`

**Interfaces:**
- Consumes: `SETTLED_ATTEMPT_STATUSES` (exported from `apps/api/src/reports/reports.service.ts`, value `['submitted', 'auto_submitted', 'force_submitted']`).
- Produces: `ExamsService.list()` now returns `(Exam & { invitationCount: number; attemptSettledCount: number; attemptTotalCount: number })[]`. Frontend `Exam` type gains the same 3 fields (all `number`, always present). Task 7 (Exams list page) consumes these three fields for the progress bar and candidate count.

- [ ] **Step 1: Write the failing test**

Add this test to `apps/api/src/exams/exams.service.spec.ts`, in the `describe('list', ...)` (or top-level `describe`) block — read the file first to match its existing mock-setup style for `tenantPrisma.forTenant`, then add:

```ts
  it('returns invitation and attempt-progress counts alongside each exam', async () => {
    const tx = {
      exam: {
        findMany: jest.fn().mockResolvedValue([{ id: 'exam-1', title: 'Backend Round', status: 'published', organizationId: 'org-1' }]),
      },
      invitation: {
        groupBy: jest.fn().mockResolvedValue([{ examId: 'exam-1', _count: { _all: 20 } }]),
      },
      attempt: {
        groupBy: jest.fn().mockResolvedValue([
          { examId: 'exam-1', status: 'submitted', _count: { _all: 12 } },
          { examId: 'exam-1', status: 'auto_submitted', _count: { _all: 2 } },
          { examId: 'exam-1', status: 'in_progress', _count: { _all: 3 } },
        ]),
      },
    };
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    const result = await service.list(context, {});

    expect(result).toEqual([
      expect.objectContaining({
        id: 'exam-1',
        invitationCount: 20,
        attemptSettledCount: 14,
        attemptTotalCount: 17,
      }),
    ]);
  });
```

(`context`/`tenantPrisma` here reuse whatever variable names the file's existing `beforeEach` already sets up — mirror them exactly rather than introducing new ones.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest src/exams/exams.service.spec.ts`
Expected: FAIL — `result[0].invitationCount` is `undefined` (current `list()` returns bare exam rows, and `tx.invitation.groupBy`/`tx.attempt.groupBy` are never called).

- [ ] **Step 3: Import SETTLED_ATTEMPT_STATUSES and rewrite list()**

In `apps/api/src/exams/exams.service.ts`, add the import at the top:

```ts
import { SETTLED_ATTEMPT_STATUSES } from '../reports/reports.service';
```

Replace the `list()` method (lines 100–110) with:

```ts
  async list(context: TenantContext, filters: ExamFilters): Promise<(Exam & { invitationCount: number; attemptSettledCount: number; attemptTotalCount: number })[]> {
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const exams = await tx.exam.findMany({
        where: {
          organizationId: context.organizationId as string,
          ...(filters.status ? { status: filters.status } : { status: { not: 'archived' } }),
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
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

      return exams.map((exam) => ({
        ...exam,
        invitationCount: invitationCountByExam.get(exam.id) ?? 0,
        attemptSettledCount: settledByExam.get(exam.id) ?? 0,
        attemptTotalCount: totalByExam.get(exam.id) ?? 0,
      }));
    });
  }
```

If `apps/api/src/reports/reports.service.ts` does not export `SETTLED_ATTEMPT_STATUSES` as a named `export const` (re-check — it was confirmed as `export const SETTLED_ATTEMPT_STATUSES = [...]` at its line 5 during planning), add `export` to that declaration first; it is a plain constant with no circular-import risk since `exams.service.ts` does not export anything `reports.service.ts` needs back.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx jest src/exams/exams.service.spec.ts`
Expected: PASS (all existing + new test)

- [ ] **Step 5: Widen the frontend Exam type**

In `apps/web/lib/types.ts`, change the `Exam` interface (lines 91–104) to add the three new fields:

```ts
export interface Exam {
  id: string;
  title: string;
  instructions: string | null;
  status: ExamStatus;
  durationMinutes: number;
  passCriteriaPercent: number;
  randomizeOrder: boolean;
  schedulingEnabled: boolean;
  availabilityWindowStart: string | null;
  availabilityWindowEnd: string | null;
  createdAt: string;
  sections: ExamSection[];
  invitationCount: number;
  attemptSettledCount: number;
  attemptTotalCount: number;
}
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/exams/exams.service.ts apps/api/src/exams/exams.service.spec.ts apps/web/lib/types.ts
git commit -m "feat: add invitation/attempt progress counts to the exams list endpoint"
```

---

### Task 6: Backend — Dashboard summary endpoint

**Files:**
- Create: `apps/api/src/dashboard/dashboard.module.ts`
- Create: `apps/api/src/dashboard/dashboard.controller.ts`
- Create: `apps/api/src/dashboard/dashboard.service.ts`
- Create: `apps/api/src/dashboard/dashboard.service.spec.ts`
- Modify: `apps/api/src/app.module.ts`
- Create: `apps/api/test/dashboard-summary.e2e-spec.ts`
- Modify: `apps/web/lib/types.ts`
- Create: `apps/web/lib/hooks/useDashboard.ts`

**Interfaces:**
- Consumes: `AuditService`/`TenantPrismaService` from `@exam-platform/shared`; the `invitation.created` audit action from Task 4; `SETTLED_ATTEMPT_STATUSES`-independent — this task counts `in_progress`/`pending_manual_grade` directly by status string, not via the settled-status list.
- Produces: `GET /dashboard/summary` → `DashboardSummary` (shape below). Task 10 (Dashboard page) consumes this via the new `useDashboardSummary()` hook.

```ts
export interface DashboardSummary {
  stats: {
    totalCandidates: number;
    invitationsSent: number;
    attemptsInProgress: number;
    pendingGradingCount: number;
  };
  attention: {
    pendingGrading: { examId: string; examTitle: string; count: number }[];
    recentProctoringFlags: { examId: string; examTitle: string; occurredAt: string }[];
    staleInvitationCount: number;
  };
  activity: { id: string; description: string; occurredAt: string }[];
}
```

- [ ] **Step 1: Write the failing service test**

Create `apps/api/src/dashboard/dashboard.service.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { DashboardService } from './dashboard.service';
import { TenantPrismaService } from '@exam-platform/shared';

describe('DashboardService', () => {
  let service: DashboardService;
  let tenantPrisma: { forTenant: jest.Mock };
  const context = { organizationId: 'org-1', isSuperAdmin: false };

  beforeEach(async () => {
    tenantPrisma = { forTenant: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [DashboardService, { provide: TenantPrismaService, useValue: tenantPrisma }],
    }).compile();
    service = moduleRef.get(DashboardService);
  });

  function stubTx(overrides: Partial<Record<string, any>> = {}) {
    return {
      exam: { findMany: jest.fn().mockResolvedValue([{ id: 'exam-1', title: 'Backend Round' }]) },
      candidate: { count: jest.fn().mockResolvedValue(0) },
      invitation: { count: jest.fn().mockResolvedValue(0) },
      attempt: { count: jest.fn().mockResolvedValue(0), groupBy: jest.fn().mockResolvedValue([]) },
      proctoringEvent: { findMany: jest.fn().mockResolvedValue([]) },
      auditLog: { findMany: jest.fn().mockResolvedValue([]) },
      ...overrides,
    };
  }

  it('aggregates stats, attention items, and activity into one summary', async () => {
    const tx = stubTx({
      candidate: { count: jest.fn().mockResolvedValue(248) },
      invitation: {
        count: jest.fn().mockResolvedValue(312),
      },
      attempt: {
        count: jest.fn().mockResolvedValue(17),
        groupBy: jest.fn().mockResolvedValue([{ examId: 'exam-1', _count: { _all: 4 } }]),
      },
      auditLog: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'log-1', action: 'exam.published', entityType: 'exam', entityId: 'exam-1', metadataJson: null, createdAt: new Date('2026-07-17T10:00:00Z') },
        ]),
      },
    });
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    const result = await service.getSummary(context);

    expect(result.stats).toEqual({
      totalCandidates: 248,
      invitationsSent: 312,
      attemptsInProgress: 17,
      pendingGradingCount: 4,
    });
    expect(result.attention.pendingGrading).toEqual([{ examId: 'exam-1', examTitle: 'Backend Round', count: 4 }]);
    expect(result.activity).toEqual([
      { id: 'log-1', description: 'Backend Round was published', occurredAt: '2026-07-17T10:00:00.000Z' },
    ]);
  });

  it('counts an invitation as stale when invited 5+ days ago with no attempt', async () => {
    const tx = stubTx({ invitation: { count: jest.fn().mockResolvedValue(6) } });
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn(tx));

    const result = await service.getSummary(context);

    expect(tx.invitation.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'invited', attempt: null }),
      }),
    );
    expect(result.attention.staleInvitationCount).toBe(6);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npx jest src/dashboard/dashboard.service.spec.ts`
Expected: FAIL with "Cannot find module './dashboard.service'"

- [ ] **Step 3: Implement DashboardService**

Create `apps/api/src/dashboard/dashboard.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { TenantContext, TenantPrismaService } from '@exam-platform/shared';

const STALE_INVITATION_DAYS = 5;
const ACTIVITY_ACTIONS = ['exam.published', 'invitation.created', 'attempt.settled', 'attempt.manually_graded'];
const ACTIVITY_LIMIT = 10;
const RECENT_PROCTORING_LIMIT = 5;

export interface DashboardSummary {
  stats: {
    totalCandidates: number;
    invitationsSent: number;
    attemptsInProgress: number;
    pendingGradingCount: number;
  };
  attention: {
    pendingGrading: { examId: string; examTitle: string; count: number }[];
    recentProctoringFlags: { examId: string; examTitle: string; occurredAt: string }[];
    staleInvitationCount: number;
  };
  activity: { id: string; description: string; occurredAt: string }[];
}

function describeActivity(action: string, entityId: string | null, metadata: Record<string, unknown> | null, examTitleById: Map<string, string>): string {
  switch (action) {
    case 'exam.published':
      return `${(entityId && examTitleById.get(entityId)) ?? 'An exam'} was published`;
    case 'invitation.created': {
      const count = typeof metadata?.count === 'number' ? metadata.count : 0;
      const examTitle = typeof metadata?.examTitle === 'string' ? metadata.examTitle : 'an exam';
      return `${count} candidate${count === 1 ? '' : 's'} invited to ${examTitle}`;
    }
    case 'attempt.settled':
      return 'An attempt was submitted';
    case 'attempt.manually_graded':
      return 'An attempt was manually graded';
    default:
      return action;
  }
}

@Injectable()
export class DashboardService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async getSummary(context: TenantContext): Promise<DashboardSummary> {
    const organizationId = context.organizationId as string;

    return this.tenantPrisma.forTenant(context, async (tx) => {
      const exams = await tx.exam.findMany({ where: { organizationId }, select: { id: true, title: true } });
      const examIds = exams.map((exam) => exam.id);
      const examTitleById = new Map(exams.map((exam) => [exam.id, exam.title]));

      const staleThreshold = new Date(Date.now() - STALE_INVITATION_DAYS * 24 * 60 * 60 * 1000);

      const [
        totalCandidates,
        invitationsSent,
        attemptsInProgress,
        pendingGradingGroups,
        staleInvitationCount,
        recentProctoringEvents,
        auditRows,
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
      ]);

      const pendingGradingCount = pendingGradingGroups.reduce((sum, group) => sum + group._count._all, 0);

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
      };
    });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npx jest src/dashboard/dashboard.service.spec.ts`
Expected: PASS

- [ ] **Step 5: Create the controller and module**

Create `apps/api/src/dashboard/dashboard.controller.ts`:

```ts
import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequireAnyPermission } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { TenantContext } from '@exam-platform/shared';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  @RequireAnyPermission('exam:manage', 'results:view')
  getSummary(@CurrentTenant() tenant: TenantContext) {
    return this.dashboardService.getSummary(tenant);
  }
}
```

Create `apps/api/src/dashboard/dashboard.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
```

- [ ] **Step 6: Register the module**

In `apps/api/src/app.module.ts`, add the import `import { DashboardModule } from './dashboard/dashboard.module';` alongside the other feature-module imports, and add `DashboardModule` to the `imports` array (e.g. right after `ReportsModule`).

- [ ] **Step 7: Write the failing e2e test**

Create `apps/api/test/dashboard-summary.e2e-spec.ts`, following `apps/api/test/audit-log.e2e-spec.ts`'s exact setup pattern (same `Plan`/`Organization`/`User` seeding, same staff-login flow):

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';

describe('Dashboard summary', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let planId: string;
  let orgId: string;
  let recruiterToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);

    const plan = await prisma.plan.create({
      data: { name: `dashboard-plan-${randomUUID()}`, candidateLimit: 10, aiCreditLimit: 1, proctoringMinutesLimit: 1 },
    });
    planId = plan.id;

    const org = await prisma.organization.create({ data: { name: 'Dashboard Org', slug: `dashboard-org-${randomUUID()}`, planId } });
    orgId = org.id;

    const recruiterHash = await argon2.hash('RecruiterPassw0rd!');
    await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) =>
      tx.user.create({ data: { organizationId: orgId, email: 'recruiter@dashboard.test', passwordHash: recruiterHash, role: 'recruiter' } }),
    );

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/staff/login')
      .send({ organizationSlug: org.slug, email: 'recruiter@dashboard.test', password: 'RecruiterPassw0rd!' })
      .expect(200);
    recruiterToken = login.body.accessToken;
  });

  afterAll(async () => {
    await tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) =>
      tx.auditLog.deleteMany({ where: { organizationId: orgId } }),
    );
    await tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, (tx) =>
      tx.user.deleteMany({ where: { organizationId: orgId } }),
    );
    await prisma.organization.delete({ where: { id: orgId } });
    await prisma.plan.delete({ where: { id: planId } });
    await app.close();
  });

  it('reflects a real invited candidate in stats and the activity feed', async () => {
    const examResponse = await request(app.getHttpServer())
      .post('/api/v1/exams')
      .set('Authorization', `Bearer ${recruiterToken}`)
      .send({ title: 'Dashboard Exam' })
      .expect(201);
    const examId = examResponse.body.id;

    const sectionResponse = await request(app.getHttpServer())
      .post(`/api/v1/exams/${examId}/sections`)
      .set('Authorization', `Bearer ${recruiterToken}`)
      .send({ title: 'Section 1' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/questions')
      .set('Authorization', `Bearer ${recruiterToken}`)
      .send({ text: 'Q1', type: 'single_mcq', marks: 1, options: [{ text: 'A', isCorrect: true }, { text: 'B', isCorrect: false }] })
      .expect(201)
      .then(async (questionResponse) => {
        await request(app.getHttpServer())
          .put(`/api/v1/exams/${examId}/sections/${sectionResponse.body.id}/questions`)
          .set('Authorization', `Bearer ${recruiterToken}`)
          .send({ questionIds: [questionResponse.body.id] })
          .expect(200);
      });

    await request(app.getHttpServer())
      .post(`/api/v1/exams/${examId}/publish`)
      .set('Authorization', `Bearer ${recruiterToken}`)
      .expect(201);

    const candidateResponse = await request(app.getHttpServer())
      .post('/api/v1/candidates')
      .set('Authorization', `Bearer ${recruiterToken}`)
      .send({ email: `candidate-${randomUUID()}@test.com`, name: 'Dana Candidate' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/exams/${examId}/invitations`)
      .set('Authorization', `Bearer ${recruiterToken}`)
      .send({ candidateIds: [candidateResponse.body.id] })
      .expect(201);

    const summaryResponse = await request(app.getHttpServer())
      .get('/api/v1/dashboard/summary')
      .set('Authorization', `Bearer ${recruiterToken}`)
      .expect(200);

    expect(summaryResponse.body.stats.totalCandidates).toBeGreaterThanOrEqual(1);
    expect(summaryResponse.body.stats.invitationsSent).toBeGreaterThanOrEqual(1);
    expect(summaryResponse.body.activity).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ description: expect.stringContaining('invited to Dashboard Exam') }),
      ]),
    );
  });
});
```

- [ ] **Step 8: Run the e2e test**

Run: `cd apps/api && npx jest --config test/jest-e2e.json dashboard-summary.e2e-spec.ts`
Expected: PASS. (If the exact request body shape for `POST /questions` or `PUT .../questions` differs from what's assumed above, check `apps/api/test/exam-builder.e2e-spec.ts` or `apps/api/test/question-bank.e2e-spec.ts` for the real shape and correct this test before it will pass — those files are the source of truth for those two endpoints' payloads, which are outside this task's own scope.)

- [ ] **Step 9: Add the frontend type and hook**

In `apps/web/lib/types.ts`, add:

```ts
export interface DashboardSummary {
  stats: {
    totalCandidates: number;
    invitationsSent: number;
    attemptsInProgress: number;
    pendingGradingCount: number;
  };
  attention: {
    pendingGrading: { examId: string; examTitle: string; count: number }[];
    recentProctoringFlags: { examId: string; examTitle: string; occurredAt: string }[];
    staleInvitationCount: number;
  };
  activity: { id: string; description: string; occurredAt: string }[];
}
```

Create `apps/web/lib/hooks/useDashboard.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../api-client';
import { DashboardSummary } from '../types';
import { useAuth } from '../auth-context';

export function useDashboardSummary() {
  const { accessToken } = useAuth();
  return useQuery<DashboardSummary>({
    queryKey: ['dashboard-summary'],
    queryFn: () => apiFetch('/dashboard/summary', {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}
```

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/dashboard apps/api/src/app.module.ts apps/api/test/dashboard-summary.e2e-spec.ts apps/web/lib/types.ts apps/web/lib/hooks/useDashboard.ts
git commit -m "feat: add GET /dashboard/summary aggregation endpoint"
```

---

### Task 7: Frontend — Exams list page redesign

**Files:**
- Modify: `apps/web/app/(recruiter)/exams/page.tsx`
- Modify: `apps/web/app/(recruiter)/exams/page.test.tsx`

**Interfaces:**
- Consumes: `Exam.invitationCount`/`attemptSettledCount`/`attemptTotalCount` (Task 5), `StatusBadge` (Task 1), `Table`'s `group` row class (Task 2).
- Produces: no exported interface — leaf page component.

- [ ] **Step 1: Write the failing test for the redesigned columns**

Add this test to `apps/web/app/(recruiter)/exams/page.test.tsx` (reusing the file's existing `global.fetch` mock pattern):

```tsx
  it('shows a status badge and a settled/total progress readout for each exam', async () => {
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).includes('/exams')) {
        return new Response(
          JSON.stringify([
            {
              id: 'exam-1',
              title: 'Backend Round',
              status: 'published',
              sections: [],
              invitationCount: 20,
              attemptSettledCount: 14,
              attemptTotalCount: 17,
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
            <ExamsPage />
          </AuthProvider>
        </ToastProvider>
      </QueryProvider>,
    );

    await waitFor(() => expect(screen.getByText('Backend Round')).toBeInTheDocument());
    expect(screen.getByText('Published')).toBeInTheDocument();
    expect(screen.getByText('14/17')).toBeInTheDocument();
    expect(screen.getByText('20')).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && npx jest "app/(recruiter)/exams/page.test.tsx" -t "settled/total"`
Expected: FAIL — `'14/17'` is not rendered (current page has no Progress or Candidates column).

- [ ] **Step 3: Rewrite the page**

Replace `apps/web/app/(recruiter)/exams/page.tsx` in full:

```tsx
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Plus, Search, MoreHorizontal } from 'lucide-react';
import { useExams, useDuplicateExam } from '../../../lib/hooks/useExams';
import { Table, StatusBadge, Button, useToast, type Column, type StatusTone } from '../../../components/ui';
import { Exam, ExamStatus } from '../../../lib/types';

const STATUS_TONE: Record<ExamStatus, StatusTone> = {
  draft: 'neutral',
  published: 'success',
  archived: 'danger',
};

const STATUS_LABEL: Record<ExamStatus, string> = {
  draft: 'Draft',
  published: 'Published',
  archived: 'Archived',
};

export default function ExamsPage() {
  const { data: exams, isLoading, isError } = useExams();
  const router = useRouter();
  const { toast } = useToast();
  const duplicateExam = useDuplicateExam();
  const [search, setSearch] = useState('');

  function handleDuplicate(examId: string) {
    duplicateExam.mutate(examId, {
      onSuccess: (created) => {
        toast('Exam duplicated.');
        router.push(`/exams/${created.id}/edit`);
      },
      onError: (error) => toast(error instanceof Error ? error.message : 'Failed to duplicate exam.', 'error'),
    });
  }

  const columns: Column<Exam>[] = [
    {
      key: 'title',
      header: 'Exam',
      render: (exam) => (
        <div>
          <div className="font-semibold text-recruiter-text">{exam.title}</div>
          <div className="text-xs text-recruiter-text-tertiary">{exam.durationMinutes} min · {exam.sections.length} section{exam.sections.length === 1 ? '' : 's'}</div>
        </div>
      ),
      sortValue: (exam) => exam.title,
    },
    {
      key: 'status',
      header: 'Status',
      render: (exam) => <StatusBadge tone={STATUS_TONE[exam.status]}>{STATUS_LABEL[exam.status]}</StatusBadge>,
    },
    {
      key: 'progress',
      header: 'Progress',
      render: (exam) =>
        exam.attemptTotalCount === 0 ? (
          <span className="text-xs text-recruiter-text-tertiary">—</span>
        ) : (
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-[70px] overflow-hidden rounded-full bg-recruiter-bg-subtle">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.round((exam.attemptSettledCount / exam.attemptTotalCount) * 100)}%` }}
              />
            </div>
            <span className="text-xs text-recruiter-text-tertiary">
              {exam.attemptSettledCount}/{exam.attemptTotalCount}
            </span>
          </div>
        ),
    },
    { key: 'candidates', header: 'Candidates', render: (exam) => exam.invitationCount },
    {
      key: 'created',
      header: 'Created',
      render: (exam) => <span className="text-recruiter-text-tertiary">{new Date(exam.createdAt).toLocaleDateString()}</span>,
      sortValue: (exam) => exam.createdAt,
    },
    {
      key: 'actions',
      header: '',
      render: (exam) => (
        <div className="flex items-center justify-end gap-2 opacity-0 transition-opacity group-hover:opacity-100">
          <Link href={`/exams/${exam.id}/edit`} className="text-xs font-medium text-primary">
            Edit
          </Link>
          <button
            type="button"
            onClick={() => handleDuplicate(exam.id)}
            disabled={duplicateExam.isPending}
            aria-label="More actions"
            className="rounded p-1 text-recruiter-text-tertiary hover:bg-recruiter-bg-subtle"
          >
            <MoreHorizontal size={16} />
          </button>
        </div>
      ),
    },
  ];

  if (isLoading) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-semibold text-recruiter-text">Exams</h1>
        <p className="text-sm text-recruiter-text-tertiary">Loading…</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-semibold text-recruiter-text">Exams</h1>
        <p role="alert" className="text-sm text-status-danger">
          Failed to load exams.
        </p>
      </div>
    );
  }

  const filtered = (exams ?? []).filter((exam) => exam.title.toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      <div className="mb-4.5 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-recruiter-text">Exams</h1>
        <Link href="/exams/new">
          <Button className="inline-flex items-center gap-1.5">
            <Plus size={14} />
            New exam
          </Button>
        </Link>
      </div>
      <div className="mb-3 flex items-center gap-2">
        <div className="relative max-w-xs flex-1">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-recruiter-text-tertiary" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search exams…"
            aria-label="Search exams"
            className="w-full rounded-md border border-recruiter-border py-1.5 pl-8 pr-3 text-sm"
          />
        </div>
      </div>
      <Table columns={columns} rows={filtered} rowKey={(exam) => exam.id} emptyMessage="No exams yet." />
    </div>
  );
}
```

Note: `duplicateExam.isPending` gates a `<button>` (icon-only, `MoreHorizontal`), not the earlier `<Button>Duplicate</Button>` — this removes the `getByRole('button', { name: 'Duplicate' })` query the two duplicate-flow tests already in `page.test.tsx` rely on. Update those two existing tests' `fireEvent.click(...)` calls to target the new control instead: `fireEvent.click(screen.getByRole('link', { name: 'Edit' }))` does not trigger duplication, so replace `screen.getByRole('button', { name: 'Duplicate' })` with `screen.getByRole('button', { name: 'More actions' })` in both the "duplicates an exam..." and "shows an error toast when duplicating..." tests — clicking the icon button alone does not call `handleDuplicate` in this version (it's a bare button with no dropdown yet, so wire its `onClick` directly to `handleDuplicate(exam.id)` as shown above, keeping the existing two tests' intent — click the row's action control to trigger duplication — satisfied by the new `aria-label="More actions"` button).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && npx jest "app/(recruiter)/exams/page.test.tsx"`
Expected: PASS (all tests, including the 2 pre-existing duplicate-flow tests updated in Step 3 and the new progress-column test)

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/\(recruiter\)/exams/page.tsx apps/web/app/\(recruiter\)/exams/page.test.tsx
git commit -m "feat: redesign Exams list as a dense ATS-style table with status badges and progress bars"
```

---

### Task 8: Frontend — Question Bank list page redesign

**Files:**
- Modify: `apps/web/app/(recruiter)/questions/page.tsx`
- Modify: `apps/web/app/(recruiter)/questions/page.test.tsx`

**Interfaces:**
- Consumes: `StatusBadge` (Task 1), `Table`'s `group` row class (Task 2). `Question.difficulty` (existing `Difficulty` type: `'easy' | 'medium' | 'hard'`).
- Produces: no exported interface — leaf page component.

- [ ] **Step 1: Read the existing test file**

Read `apps/web/app/(recruiter)/questions/page.test.tsx` in full first to see its current fixture shape and assertions, since the rewrite changes what's rendered (type/difficulty display) and existing tests may need matching updates, not just additions.

- [ ] **Step 2: Write the failing test for the new type/difficulty display**

Add to `apps/web/app/(recruiter)/questions/page.test.tsx` (reuse the file's existing fetch-mock/provider pattern):

```tsx
  it('shows a type badge and difficulty indicator for each question', async () => {
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).includes('/questions')) {
        return new Response(
          JSON.stringify([{ id: 'q-1', text: 'Two Sum', type: 'code', difficulty: 'medium', marks: 5 }]),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }) as unknown as typeof fetch;

    render(
      <QueryProvider>
        <ToastProvider>
          <AuthProvider>
            <QuestionsPage />
          </AuthProvider>
        </ToastProvider>
      </QueryProvider>,
    );

    await waitFor(() => expect(screen.getByText('Two Sum')).toBeInTheDocument());
    expect(screen.getByText('Code')).toBeInTheDocument();
  });
```

(Reuse whichever import aliases — `QueryProvider`, `ToastProvider`, `AuthProvider`, `QuestionsPage` — the existing tests in the file already use.)

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/web && npx jest "app/(recruiter)/questions/page.test.tsx" -t "type badge"`
Expected: FAIL — `'Code'` is not rendered (current page renders the raw `q.type` value `'code'`, lowercase, via plain text not a badge).

- [ ] **Step 4: Rewrite the page**

Replace `apps/web/app/(recruiter)/questions/page.tsx` in full:

```tsx
'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Plus, Search, MoreHorizontal } from 'lucide-react';
import { useQuestions } from '../../../lib/hooks/useQuestions';
import { Table, StatusBadge, Button, type Column, type StatusTone } from '../../../components/ui';
import { Question, QuestionType, Difficulty } from '../../../lib/types';

const TYPE_TONE: Record<QuestionType, StatusTone> = {
  single_mcq: 'info',
  multi_mcq: 'info',
  true_false: 'info',
  code: 'purple',
};

const TYPE_LABEL: Record<QuestionType, string> = {
  single_mcq: 'MCQ',
  multi_mcq: 'MCQ',
  true_false: 'True/False',
  code: 'Code',
};

const DIFFICULTY_LEVEL: Record<Difficulty, number> = { easy: 1, medium: 2, hard: 3 };

function DifficultyDots({ difficulty }: { difficulty: Difficulty }) {
  const level = DIFFICULTY_LEVEL[difficulty];
  return (
    <div className="flex gap-0.5" aria-label={`Difficulty: ${difficulty}`}>
      {[1, 2, 3].map((dot) => (
        <span key={dot} className={dot <= level ? 'h-1.5 w-1.5 rounded-full bg-primary' : 'h-1.5 w-1.5 rounded-full bg-recruiter-border'} />
      ))}
    </div>
  );
}

export default function QuestionsPage() {
  const { data: questions, isLoading, isError } = useQuestions();
  const [search, setSearch] = useState('');

  const columns: Column<Question>[] = [
    { key: 'text', header: 'Question', render: (q) => <span className="font-semibold text-recruiter-text">{q.text}</span>, sortValue: (q) => q.text },
    { key: 'type', header: 'Type', render: (q) => <StatusBadge tone={TYPE_TONE[q.type]}>{TYPE_LABEL[q.type]}</StatusBadge> },
    { key: 'difficulty', header: 'Difficulty', render: (q) => <DifficultyDots difficulty={q.difficulty} />, sortValue: (q) => DIFFICULTY_LEVEL[q.difficulty] },
    { key: 'marks', header: 'Marks', render: (q) => String(q.marks), sortValue: (q) => q.marks },
    {
      key: 'actions',
      header: '',
      render: (q) => (
        <div className="flex items-center justify-end gap-2 opacity-0 transition-opacity group-hover:opacity-100">
          <Link href={`/questions/${q.id}/edit`} className="text-xs font-medium text-primary">
            Edit
          </Link>
          <button type="button" aria-label="More actions" className="rounded p-1 text-recruiter-text-tertiary hover:bg-recruiter-bg-subtle">
            <MoreHorizontal size={16} />
          </button>
        </div>
      ),
    },
  ];

  if (isLoading) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-semibold text-recruiter-text">Question Bank</h1>
        <p className="text-sm text-recruiter-text-tertiary">Loading…</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-semibold text-recruiter-text">Question Bank</h1>
        <p role="alert" className="text-sm text-status-danger">
          Failed to load questions.
        </p>
      </div>
    );
  }

  const filtered = (questions ?? []).filter((q) => q.text.toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      <div className="mb-4.5 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-recruiter-text">Question Bank</h1>
        <div className="flex gap-2">
          <Link href="/questions/bulk-upload">
            <Button variant="secondary">Bulk upload</Button>
          </Link>
          <Link href="/questions/new">
            <Button className="inline-flex items-center gap-1.5">
              <Plus size={14} />
              New question
            </Button>
          </Link>
        </div>
      </div>
      <div className="mb-3 flex items-center gap-2">
        <div className="relative max-w-xs flex-1">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-recruiter-text-tertiary" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search questions…"
            aria-label="Search questions"
            className="w-full rounded-md border border-recruiter-border py-1.5 pl-8 pr-3 text-sm"
          />
        </div>
      </div>
      <Table columns={columns} rows={filtered} rowKey={(q) => q.id} emptyMessage="No questions yet." />
    </div>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/web && npx jest "app/(recruiter)/questions/page.test.tsx"`
Expected: PASS (all tests — check whether any pre-existing test asserted on the old raw `q.type`/`Badge` difficulty text via `screen.getByText('code')`/`screen.getByText('medium')`; if so, update those assertions to `screen.getByText('Code')` / the dots-based `aria-label` query `screen.getByLabelText('Difficulty: medium')` to match this rewrite, per Step 1's read-first instruction)

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/\(recruiter\)/questions/page.tsx apps/web/app/\(recruiter\)/questions/page.test.tsx
git commit -m "feat: redesign Question Bank list with type badges and difficulty indicator"
```

---

### Task 9: Frontend — Candidates list page redesign

**Files:**
- Modify: `apps/web/app/(recruiter)/candidates/page.tsx`
- Modify: `apps/web/app/(recruiter)/candidates/page.test.tsx`

**Interfaces:**
- Consumes: `StatusBadge` (Task 1), `Table`'s `group` row class (Task 2). No change to `useBulkInvite`/`useCandidates`/`useCreateCandidate` hook signatures.
- Produces: no exported interface — leaf page component.

- [ ] **Step 1: Read the existing test file**

Read `apps/web/app/(recruiter)/candidates/page.test.tsx` in full first — the existing `Candidate` type has no per-candidate status/exam/score fields (per `apps/web/lib/types.ts`, `Candidate` is just `{id, email, name, phone, createdAt, erasedAt}`), so the mockup's Status/Exam/Score columns cannot be populated from `useCandidates()` alone without a backend change this task does not include (candidate-level attempt status is out of this plan's backend scope — Task 6's endpoints are dashboard/exam-list only). Confirm this gap before writing the redesign in Step 3.

- [ ] **Step 2: Write the failing test for the retained columns + new checkbox/search shell**

Add to `apps/web/app/(recruiter)/candidates/page.test.tsx` (reuse the file's existing fetch-mock/provider pattern):

```tsx
  it('filters the candidate list by the search box', async () => {
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).includes('/exams')) {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      if (String(url).includes('/candidates')) {
        return new Response(
          JSON.stringify([
            { id: 'cand-1', email: 'alice@test.com', name: 'Alice Chen', phone: null, createdAt: '2026-07-01T00:00:00Z', erasedAt: null },
            { id: 'cand-2', email: 'raj@test.com', name: 'Raj Kumar', phone: null, createdAt: '2026-07-02T00:00:00Z', erasedAt: null },
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
            <CandidatesPage />
          </AuthProvider>
        </ToastProvider>
      </QueryProvider>,
    );

    await waitFor(() => expect(screen.getByText('Alice Chen')).toBeInTheDocument());
    expect(screen.getByText('Raj Kumar')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Search candidates…'), { target: { value: 'alice' } });

    expect(screen.getByText('Alice Chen')).toBeInTheDocument();
    expect(screen.queryByText('Raj Kumar')).not.toBeInTheDocument();
  });
```

(Add `fireEvent` to the file's existing `@testing-library/react` import if it isn't already imported.)

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/web && npx jest "app/(recruiter)/candidates/page.test.tsx" -t "filters the candidate list"`
Expected: FAIL — no element with placeholder `'Search candidates…'` exists yet.

- [ ] **Step 4: Rewrite the page**

Replace `apps/web/app/(recruiter)/candidates/page.tsx` in full — this keeps every existing behavior (single-add form, exam picker, bulk-invite selection/mutation, bulk-upload-invite link) and layers the dense-table shell + search + name/email display on top, per the Step 1 finding that Status/Exam/Score columns aren't backed by data this plan adds:

```tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Search } from 'lucide-react';
import { useCandidates, useCreateCandidate } from '../../../lib/hooks/useCandidates';
import { useExams } from '../../../lib/hooks/useExams';
import { useBulkInvite } from '../../../lib/hooks/useInvitations';
import { CandidateInviteForm } from '../../../components/CandidateInviteForm';
import { Table, Checkbox, Select, Button, useToast, type Column } from '../../../components/ui';
import { Candidate } from '../../../lib/types';

export default function CandidatesPage() {
  const { data: candidates, isLoading, isError } = useCandidates();
  const { data: publishedExams } = useExams('published');
  const createCandidate = useCreateCandidate();
  const { toast } = useToast();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [examId, setExamId] = useState<string>('');
  const [search, setSearch] = useState('');
  const bulkInvite = useBulkInvite(examId);

  // ponytail: only auto-select when the choice is unambiguous (exactly one
  // published exam). With 0 or 2+ published exams, list order is
  // backend-determined and not meaningful to the recruiter -- silently
  // landing on exams[0] risked bulk-inviting candidates to the wrong exam.
  // Leave examId at '' so the disabled Send-invitations button forces an
  // explicit pick.
  useEffect(() => {
    if (!examId && publishedExams && publishedExams.length === 1) {
      setExamId(publishedExams[0].id);
    }
  }, [publishedExams, examId]);

  function toggle(id: string, checked: boolean) {
    setSelectedIds((current) => (checked ? [...current, id] : current.filter((existing) => existing !== id)));
  }

  function handleInvite() {
    bulkInvite.mutate(selectedIds, {
      onSuccess: (result) => {
        toast(`Invited ${result.created.length} candidate(s).${result.skipped.length ? ` ${result.skipped.length} skipped.` : ''}`);
        setSelectedIds([]);
      },
    });
  }

  const columns: Column<Candidate>[] = [
    {
      key: 'select',
      header: '',
      render: (candidate) => (
        <Checkbox label={candidate.name} checked={selectedIds.includes(candidate.id)} onChange={(checked) => toggle(candidate.id, checked)} />
      ),
    },
    {
      key: 'name',
      header: 'Candidate',
      render: (candidate) => (
        <div>
          <div className="font-semibold text-recruiter-text">{candidate.name}</div>
          <div className="text-xs text-recruiter-text-tertiary">{candidate.email}</div>
        </div>
      ),
      sortValue: (candidate) => candidate.name,
    },
    { key: 'phone', header: 'Phone', render: (candidate) => candidate.phone ?? '—' },
    {
      key: 'invited',
      header: 'Added',
      render: (candidate) => <span className="text-recruiter-text-tertiary">{new Date(candidate.createdAt).toLocaleDateString()}</span>,
      sortValue: (candidate) => candidate.createdAt,
    },
  ];

  if (isLoading) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-semibold text-recruiter-text">Candidates</h1>
        <p className="text-sm text-recruiter-text-tertiary">Loading…</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-semibold text-recruiter-text">Candidates</h1>
        <p role="alert" className="text-sm text-status-danger">
          Failed to load candidates.
        </p>
      </div>
    );
  }

  const filtered = (candidates ?? []).filter(
    (candidate) => candidate.name.toLowerCase().includes(search.toLowerCase()) || candidate.email.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div>
      <div className="mb-4.5 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-recruiter-text">Candidates</h1>
        <Link href="/candidates/bulk-upload-invite">
          <Button variant="secondary">Upload &amp; invite</Button>
        </Link>
      </div>
      <div className="mb-6">
        <CandidateInviteForm onSubmit={(input) => createCandidate.mutate(input)} />
      </div>
      <div className="mb-3 flex items-end gap-2">
        <div className="relative max-w-xs flex-1">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-recruiter-text-tertiary" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search candidates…"
            aria-label="Search candidates"
            className="w-full rounded-md border border-recruiter-border py-1.5 pl-8 pr-3 text-sm"
          />
        </div>
        <Select
          label="Exam to invite to"
          value={examId}
          onChange={setExamId}
          options={(publishedExams ?? []).map((exam) => ({ value: exam.id, label: exam.title }))}
        />
        <Button onClick={handleInvite} disabled={!examId || selectedIds.length === 0} className="inline-flex items-center gap-1.5">
          <Plus size={14} />
          Send invitations
        </Button>
      </div>
      <Table columns={columns} rows={filtered} rowKey={(candidate) => candidate.id} emptyMessage="No candidates yet." />
    </div>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/web && npx jest "app/(recruiter)/candidates/page.test.tsx"`
Expected: PASS (all tests — the pre-existing "Bulk upload & invite" link-text assertion, if any, must be updated to `'Upload & invite'` per this rewrite's button copy, matching the approved Candidates-table mockup)

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/\(recruiter\)/candidates/page.tsx apps/web/app/\(recruiter\)/candidates/page.test.tsx
git commit -m "feat: redesign Candidates list with search and dense-table shell"
```

---

### Task 10: Frontend — Dashboard page redesign

**Files:**
- Modify: `apps/web/app/(recruiter)/dashboard/page.tsx`
- Modify: `apps/web/app/(recruiter)/dashboard/page.test.tsx`

**Interfaces:**
- Consumes: `useDashboardSummary()` (Task 6), `DashboardSummary` type (Task 6), `Card` (Task 2 retint).
- Produces: no exported interface — leaf page component.

- [ ] **Step 1: Read the existing test file**

Read `apps/web/app/(recruiter)/dashboard/page.test.tsx` in full first — it currently mocks `useExams()`/`/exams`; the rewrite switches the page's data source to `useDashboardSummary()`/`/dashboard/summary`, so existing tests must be rewritten to mock the new endpoint, not merely extended.

- [ ] **Step 2: Replace the test file**

Replace `apps/web/app/(recruiter)/dashboard/page.test.tsx` in full, keeping the same provider-wrapping pattern the original file used (confirm the exact import paths from Step 1's read and reuse them here):

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import DashboardPage from './page';
import { AuthProvider } from '../../../lib/auth-context';
import { QueryProvider } from '../../../lib/query-provider';
import { ToastProvider } from '../../../components/ui';

describe('DashboardPage', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  function mockSummaryFetch(summary: any) {
    global.fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/auth/refresh')) {
        return new Response(JSON.stringify({ accessToken: 'token-1' }), { status: 200 });
      }
      if (String(url).includes('/dashboard/summary')) {
        return new Response(JSON.stringify(summary), { status: 200 });
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
    });
    renderPage();

    await waitFor(() => expect(screen.getByText('248')).toBeInTheDocument());
    expect(screen.getByText('312')).toBeInTheDocument();
    expect(screen.getByText('17')).toBeInTheDocument();
    expect(screen.getByText('9')).toBeInTheDocument();
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
    });
    renderPage();

    await waitFor(() => expect(screen.getByText(/Backend Round — Python/)).toBeInTheDocument());
    expect(screen.getByText('6')).toBeInTheDocument();
  });

  it('renders the recent activity feed', async () => {
    mockSummaryFetch({
      stats: { totalCandidates: 0, invitationsSent: 0, attemptsInProgress: 0, pendingGradingCount: 0 },
      attention: { pendingGrading: [], recentProctoringFlags: [], staleInvitationCount: 0 },
      activity: [{ id: 'log-1', description: '3 candidates invited to Backend Round', occurredAt: '2026-07-17T10:00:00Z' }],
    });
    renderPage();

    await waitFor(() => expect(screen.getByText('3 candidates invited to Backend Round')).toBeInTheDocument());
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

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/web && npx jest "app/(recruiter)/dashboard/page.test.tsx"`
Expected: FAIL — current page reads `useExams()`, not `useDashboardSummary()`, so none of the new assertions find matching text.

- [ ] **Step 4: Rewrite the page**

Replace `apps/web/app/(recruiter)/dashboard/page.tsx` in full:

```tsx
'use client';

import Link from 'next/link';
import { Users, Mail, Play, FileEdit, AlertTriangle, Clock, CheckCircle2, FileEdit as FileEditIcon, Plus } from 'lucide-react';
import { useDashboardSummary } from '../../../lib/hooks/useDashboard';
import { Card, Button } from '../../../components/ui';

const ACTIVITY_ICON: Record<string, typeof CheckCircle2> = {
  submitted: CheckCircle2,
  invited: Mail,
  published: CheckCircle2,
  graded: CheckCircle2,
};

function activityIconFor(description: string) {
  if (description.includes('invited')) return Mail;
  if (description.includes('published')) return CheckCircle2;
  if (description.includes('graded')) return FileEditIcon;
  return CheckCircle2;
}

export default function DashboardPage() {
  const { data: summary, isLoading, isError } = useDashboardSummary();

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
      <h1 className="mb-6 text-2xl font-semibold text-recruiter-text">Dashboard</h1>

      <div className="mb-5 grid grid-cols-4 gap-3">
        <Card>
          <div className="mb-2 flex h-7 w-7 items-center justify-center rounded-md bg-status-success-bg text-status-success">
            <Users size={15} />
          </div>
          <p className="text-2xl font-bold text-recruiter-text">{summary.stats.totalCandidates}</p>
          <p className="text-xs text-recruiter-text-tertiary">Total candidates</p>
        </Card>
        <Card>
          <div className="mb-2 flex h-7 w-7 items-center justify-center rounded-md bg-status-success-bg text-status-success">
            <Mail size={15} />
          </div>
          <p className="text-2xl font-bold text-recruiter-text">{summary.stats.invitationsSent}</p>
          <p className="text-xs text-recruiter-text-tertiary">Invitations sent</p>
        </Card>
        <Card>
          <div className="mb-2 flex h-7 w-7 items-center justify-center rounded-md bg-status-warning-bg text-status-warning">
            <Play size={15} />
          </div>
          <p className="text-2xl font-bold text-recruiter-text">{summary.stats.attemptsInProgress}</p>
          <p className="text-xs text-recruiter-text-tertiary">Attempts in progress</p>
        </Card>
        <Card>
          <div className="mb-2 flex h-7 w-7 items-center justify-center rounded-md bg-status-danger-bg text-status-danger">
            <FileEdit size={15} />
          </div>
          <p className="text-2xl font-bold text-recruiter-text">{summary.stats.pendingGradingCount}</p>
          <p className="text-xs text-recruiter-text-tertiary">Pending grading</p>
        </Card>
      </div>

      <div className="grid grid-cols-[1.3fr_1fr] gap-4">
        <Card>
          <h2 className="mb-3 text-sm font-bold text-recruiter-text">Needs your attention</h2>
          {!hasAttention ? (
            <p className="text-sm text-recruiter-text-tertiary">Nothing needs attention right now.</p>
          ) : (
            <ul>
              {summary.attention.pendingGrading.map((item) => (
                <li key={item.examId} className="flex items-center gap-2.5 border-b border-recruiter-border py-2.5 text-sm last:border-0">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-status-danger" />
                  <span className="flex-1 text-recruiter-text">
                    {item.examTitle} <span className="text-recruiter-text-tertiary">has {item.count} answer{item.count === 1 ? '' : 's'} awaiting manual grading</span>
                  </span>
                  <span className="rounded-full bg-recruiter-bg-subtle px-2 py-0.5 text-xs font-bold text-recruiter-text-secondary">{item.count}</span>
                </li>
              ))}
              {summary.attention.recentProctoringFlags.map((flag, index) => (
                <li key={`${flag.examId}-${index}`} className="flex items-center gap-2.5 border-b border-recruiter-border py-2.5 text-sm last:border-0">
                  <AlertTriangle size={13} className="shrink-0 text-status-warning" />
                  <span className="flex-1 text-recruiter-text">
                    {flag.examTitle} <span className="text-recruiter-text-tertiary">flagged a proctoring violation</span>
                  </span>
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
      </div>
    </div>
  );
}
```

(The unused `ACTIVITY_ICON` map declared above `activityIconFor` is dead — remove it; `activityIconFor`'s `if`-chain is the actual icon-selection logic used in the JSX.)

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/web && npx jest "app/(recruiter)/dashboard/page.test.tsx"`
Expected: PASS (all 4 tests)

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/\(recruiter\)/dashboard/page.tsx apps/web/app/\(recruiter\)/dashboard/page.test.tsx
git commit -m "feat: redesign Dashboard with stats row, attention list, quick actions, and activity feed"
```

---

### Task 11: Final verification

**Files:** none (verification only — no new production code).

**Interfaces:** none.

- [ ] **Step 1: Run the full frontend test suite**

Run: `cd apps/web && npx jest`
Expected: all suites pass, including every file touched or created in Tasks 1–10.

- [ ] **Step 2: Run the full backend unit test suite**

Run: `cd apps/api && npx jest`
Expected: all suites pass, including `exams.service.spec.ts`, `invitations.service.spec.ts`, and the new `dashboard.service.spec.ts`.

- [ ] **Step 3: Run the backend e2e suite**

Run: `cd apps/api && npx jest --config test/jest-e2e.json`
Expected: all suites pass, including the new `dashboard-summary.e2e-spec.ts` and the pre-existing `candidates-invitations.e2e-spec.ts`/`audit-log.e2e-spec.ts` (unaffected by Task 4's addition, but worth confirming no regression from the new `invitation.created` audit call inside `bulkInvite()`).

- [ ] **Step 4: Type-check both apps**

Run: `cd apps/web && npx tsc --noEmit` and `cd apps/api && npx tsc --noEmit`
Expected: no errors in either.

- [ ] **Step 5: Manual smoke check in the browser**

Start the dev servers (`apps/web` + `apps/api` + `apps/exam-runtime`, whatever the existing `npm run dev` convention is for this repo) and, as a recruiter user, visit `/dashboard`, `/exams`, `/questions`, `/candidates` in sequence. Confirm: the sidebar is white with a brand-accent active nav item and a user footer; each list page shows a dense table with status/type badges and hover-reveal row actions; the Dashboard shows the 4 stat cards, attention list, quick-action buttons, and activity feed with real (not placeholder) data reflecting whatever exams/candidates/invitations exist in the dev database. Confirm no console errors.

- [ ] **Step 6: Commit any fixes found during verification**

If Steps 1–5 surface any failures, fix them and commit with a message describing the specific fix (e.g. `fix: correct dashboard activity feed test mock for auth/refresh`) — do not bundle unrelated changes into this commit.
