# Platform Admin Console Motion & Visual Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Framer Motion entrance animation and `CardGrid` list layouts to the platform-admin console (`apps/web/app/(platform)/**`), matching the motion feel already shipped on the recruiter and org-admin consoles — without touching the platform-admin console's existing plain-gray Tailwind styling or design system.

**Architecture:** Three independent, sequential tasks, each touching one file (plus its test file where needed): the shared layout (nav polish + `MotionConfig` wrap), the Organizations page (`Table` → `CardGrid`, Create-organization card motion), and the Platform Admins page (`Table` → `CardGrid`, two-card motion). A final verification task runs the full suite and a live browser pass.

**Tech Stack:** Next.js (App Router), React, Framer Motion (`motion.div`, `MotionConfig`), Tailwind CSS, Jest + React Testing Library, the existing shared `CardGrid` component (`apps/web/components/ui/CardGrid.tsx` — unmodified in this plan).

## Global Constraints

- Do NOT migrate any `gray-900`/`gray-500`/`gray-200` class in `apps/web/app/(platform)/**` onto the `recruiter-*`/`status-*` design-token system. Leave the existing gray palette exactly as-is — this was an explicit user decision.
- Do NOT add a sort toolbar to either new `CardGrid` (no `sortOptions` prop) — sort is out of scope for this pass, matching the recruiter/org-admin precedent of shipping card grids first and sort as a separate follow-up.
- Do NOT touch the confirm `Modal` in `platform-admins/page.tsx` (invite/promote confirmation) — motion and CardGrid changes apply only to the list and the two form cards.
- Motion entrance values are fixed across this whole plan: `initial={{ opacity: 0, y: 10 }}`, `animate={{ opacity: 1, y: 0 }}`, `transition={{ duration: 0.3, ease: 'easeOut' }}` (add `delay` only where a task specifies staggering).
- No new backend endpoints, no new dashboard, no Recharts — this plan only touches `apps/web/app/(platform)/**`.

---

### Task 1: Platform layout — nav motion polish + reduced-motion wrap

**Files:**
- Modify: `apps/web/app/(platform)/layout.tsx`

**Interfaces:**
- Consumes: nothing from other tasks in this plan.
- Produces: nothing consumed by later tasks — Tasks 2 and 3 are independent page files.

The current file (69 lines) has a top-bar nav with two links, a logout button, and no `transition-colors` class on any of them, and no `MotionConfig` wrapper. `apps/web/app/(org-admin)/layout.tsx` already has this exact `MotionConfig` wrap (see its lines 64/129) — this task applies the same pattern here.

- [ ] **Step 1: Add the `MotionConfig` import**

In `apps/web/app/(platform)/layout.tsx`, change:

```tsx
import { LogOut } from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../../lib/auth-context';
```

to:

```tsx
import { LogOut } from 'lucide-react';
import { MotionConfig } from 'framer-motion';
import clsx from 'clsx';
import { useAuth } from '../../lib/auth-context';
```

- [ ] **Step 2: Add `transition-colors duration-150` to the nav link, and wrap the return tree in `MotionConfig`**

Change the whole `return` block from:

```tsx
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center gap-6">
          <span className="text-sm font-bold text-gray-900">Platform Admin</span>
          <nav className="flex items-center gap-4">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={clsx(
                  'text-sm font-medium',
                  pathname === link.href ? 'text-primary' : 'text-gray-500 hover:text-gray-900',
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <button
          type="button"
          aria-label="Log out"
          onClick={handleLogout}
          className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
        >
          <LogOut size={16} />
        </button>
      </div>
      <main className="p-8">{children}</main>
    </div>
  );
```

to:

```tsx
  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen bg-gray-50">
        <div className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
          <div className="flex items-center gap-6">
            <span className="text-sm font-bold text-gray-900">Platform Admin</span>
            <nav className="flex items-center gap-4">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={clsx(
                    'text-sm font-medium transition-colors duration-150',
                    pathname === link.href ? 'text-primary' : 'text-gray-500 hover:text-gray-900',
                  )}
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>
          <button
            type="button"
            aria-label="Log out"
            onClick={handleLogout}
            className="rounded-md p-1.5 text-gray-500 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-900"
          >
            <LogOut size={16} />
          </button>
        </div>
        <main className="p-8">{children}</main>
      </div>
    </MotionConfig>
  );
```

- [ ] **Step 3: Run the existing layout test to confirm no regression**

Run (from `apps/web`): `npx jest "app/(platform)/layout.test" -v`

Expected: `3 passed, 3 total` — the three existing tests (renders children for a super_admin, redirects wrong role, logs out on click) require no changes; `MotionConfig` is a transparent wrapper with no DOM output of its own, and the `transition-colors duration-150` addition is a pure class-string change.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/app/(platform)/layout.tsx"
git commit -m "feat: add motion polish and reduced-motion support to platform admin nav"
```

---

### Task 2: Organizations page — Create-organization card motion + Table → CardGrid

**Files:**
- Modify: `apps/web/app/(platform)/organizations/page.tsx`
- Test: `apps/web/app/(platform)/organizations/page.test.tsx` (verify only — no change expected)

**Interfaces:**
- Consumes: `CardGrid` from `../../../components/ui` (existing component, props `{ items, cardKey, renderCard, emptyMessage }` — see `apps/web/components/ui/CardGrid.tsx`). `Organization` type from `../../../lib/types` (existing fields used: `id`, `name`, `slug`, `region`, `createdAt`).
- Produces: nothing consumed by later tasks — Task 3 is an independent file.

The current file (96 lines) renders one `Card` (create-organization form) above a `Table` with columns Name, Slug, Region, Created. This task wraps the `Card` in a `motion.div` and replaces the `Table` with `CardGrid`.

- [ ] **Step 1: Update imports**

Change:

```tsx
import { useState } from 'react';
import { useOrganizations, useCreateOrganization } from '../../../lib/hooks/useOrganizations';
import { Table, Input, Select, Button, Card, useToast, Pagination, type Column } from '../../../components/ui';
import { Organization } from '../../../lib/types';
```

to:

```tsx
import { useState } from 'react';
import { motion } from 'framer-motion';
import { useOrganizations, useCreateOrganization } from '../../../lib/hooks/useOrganizations';
import { CardGrid, Input, Select, Button, Card, useToast, Pagination } from '../../../components/ui';
import { Organization } from '../../../lib/types';
```

- [ ] **Step 2: Replace the `columns` array with a `renderCard` function**

Change:

```tsx
  const columns: Column<Organization>[] = [
    { key: 'name', header: 'Name', render: (org) => org.name, sortValue: (org) => org.name },
    { key: 'slug', header: 'Slug', render: (org) => org.slug, sortValue: (org) => org.slug },
    { key: 'region', header: 'Region', render: (org) => org.region.toUpperCase() },
    {
      key: 'createdAt',
      header: 'Created',
      render: (org) => new Date(org.createdAt).toLocaleDateString(),
      sortValue: (org) => org.createdAt,
    },
  ];
```

to:

```tsx
  function renderCard(org: Organization) {
    return (
      <div className="flex flex-col gap-1">
        <p className="truncate text-sm font-semibold text-gray-900">{org.name}</p>
        <p className="text-xs text-gray-500">{org.slug}</p>
        <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
          <span>{org.region.toUpperCase()}</span>
          <span>{new Date(org.createdAt).toLocaleDateString()}</span>
        </div>
      </div>
    );
  }
```

- [ ] **Step 3: Wrap the Create-organization `Card` in a `motion.div`, and swap `Table` for `CardGrid`**

Change:

```tsx
      <Card className="max-w-lg">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Create organization</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <Input label="Name" value={name} onChange={setName} required />
          <Input label="Slug" value={slug} onChange={setSlug} required />
          <Select label="Region" value={region} onChange={setRegion} options={REGION_OPTIONS} />
          <Input label="Admin email" type="email" value={adminEmail} onChange={setAdminEmail} required />
          <Button type="submit">Create organization</Button>
        </form>
        {error && (
          <p role="alert" className="mt-3 text-sm text-status-danger">
            {error}
          </p>
        )}
      </Card>
```

to:

```tsx
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
      >
        <Card className="max-w-lg">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Create organization</h2>
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <Input label="Name" value={name} onChange={setName} required />
            <Input label="Slug" value={slug} onChange={setSlug} required />
            <Select label="Region" value={region} onChange={setRegion} options={REGION_OPTIONS} />
            <Input label="Admin email" type="email" value={adminEmail} onChange={setAdminEmail} required />
            <Button type="submit">Create organization</Button>
          </form>
          {error && (
            <p role="alert" className="mt-3 text-sm text-status-danger">
              {error}
            </p>
          )}
        </Card>
      </motion.div>
```

Then, further down in the same return block, change:

```tsx
      {!isLoading && !isError && (
        <>
          <Table columns={columns} rows={organizationsResponse?.data ?? []} rowKey={(org) => org.id} emptyMessage="No organizations yet." />
          <Pagination page={organizationsResponse?.page ?? 1} totalPages={organizationsResponse?.totalPages ?? 1} onPageChange={setPage} />
        </>
      )}
```

to:

```tsx
      {!isLoading && !isError && (
        <>
          <CardGrid items={organizationsResponse?.data ?? []} cardKey={(org) => org.id} renderCard={renderCard} emptyMessage="No organizations yet." />
          <Pagination page={organizationsResponse?.page ?? 1} totalPages={organizationsResponse?.totalPages ?? 1} onPageChange={setPage} />
        </>
      )}
```

- [ ] **Step 4: Run the existing page test to confirm no regression**

Run (from `apps/web`): `npx jest "app/(platform)/organizations/page.test" -v`

Expected: `2 passed, 2 total`. Both existing tests use `getByText('Acme')` / `getByText('acme')` and `getByLabelText`/`getByRole('button', ...)` queries — the new card markup renders `org.name` and `org.slug` each in their own `<p>`, so both text queries still resolve to single, isolated text nodes. If either assertion unexpectedly fails, check whether it is a structural query with no card equivalent (fix the test to target `.closest('.group')`) or a text-isolation issue from a combined text node (fix the markup to re-isolate the value) — do not weaken the assertion's expected string.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/(platform)/organizations/page.tsx"
git commit -m "feat: add motion polish and card grid to platform admin organizations list"
```

---

### Task 3: Platform Admins page — two-card motion + Table → CardGrid

**Files:**
- Modify: `apps/web/app/(platform)/platform-admins/page.tsx`
- Test: `apps/web/app/(platform)/platform-admins/page.test.tsx` (verify only — no change expected)

**Interfaces:**
- Consumes: `CardGrid` from `../../../components/ui` (same component as Task 2). `SuperAdminSummary` type from `../../../lib/types` (existing fields used: `id`, `email`, `createdAt`).
- Produces: nothing consumed by later tasks.

The current file (135 lines) renders two side-by-side `Card`s (Invite, Promote) above a `Table` with columns Email, Created, then a confirm `Modal`. This task wraps the two `Card`s in staggered `motion.div`s and replaces the `Table` with `CardGrid`. The `Modal` is untouched.

- [ ] **Step 1: Update imports**

Change:

```tsx
import { useState } from 'react';
import { useSuperAdmins, useInviteSuperAdmin, usePromoteSuperAdmin } from '../../../lib/hooks/useSuperAdmins';
import { Table, Input, Button, Card, Modal, useToast, Pagination, type Column } from '../../../components/ui';
import { SuperAdminSummary } from '../../../lib/types';
```

to:

```tsx
import { useState } from 'react';
import { motion } from 'framer-motion';
import { useSuperAdmins, useInviteSuperAdmin, usePromoteSuperAdmin } from '../../../lib/hooks/useSuperAdmins';
import { CardGrid, Input, Button, Card, Modal, useToast, Pagination } from '../../../components/ui';
import { SuperAdminSummary } from '../../../lib/types';
```

- [ ] **Step 2: Replace the `columns` array with a `renderCard` function**

Change:

```tsx
  const columns: Column<SuperAdminSummary>[] = [
    { key: 'email', header: 'Email', render: (sa) => sa.email, sortValue: (sa) => sa.email },
    {
      key: 'createdAt',
      header: 'Created',
      render: (sa) => new Date(sa.createdAt).toLocaleDateString(),
      sortValue: (sa) => sa.createdAt,
    },
  ];
```

to:

```tsx
  function renderCard(sa: SuperAdminSummary) {
    return (
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-sm font-semibold text-gray-900">{sa.email}</p>
        <p className="shrink-0 text-xs text-gray-500">{new Date(sa.createdAt).toLocaleDateString()}</p>
      </div>
    );
  }
```

- [ ] **Step 3: Wrap the two form `Card`s in staggered `motion.div`s, and swap `Table` for `CardGrid`**

Change:

```tsx
      <div className="grid max-w-3xl grid-cols-1 gap-6 sm:grid-cols-2">
        <Card>
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Invite new admin</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setPending({ kind: 'invite', email: inviteEmail });
            }}
            className="flex flex-col gap-3"
          >
            <Input label="Invite by email" type="email" value={inviteEmail} onChange={setInviteEmail} required />
            <Button type="submit">Invite</Button>
          </form>
        </Card>
        <Card>
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Promote existing user</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setPending({ kind: 'promote', email: promoteEmail });
            }}
            className="flex flex-col gap-3"
          >
            <Input label="Promote by email" type="email" value={promoteEmail} onChange={setPromoteEmail} required />
            <Button type="submit">Promote</Button>
          </form>
        </Card>
      </div>
```

to:

```tsx
      <div className="grid max-w-3xl grid-cols-1 gap-6 sm:grid-cols-2">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0, ease: 'easeOut' }}
        >
          <Card>
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Invite new admin</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setPending({ kind: 'invite', email: inviteEmail });
              }}
              className="flex flex-col gap-3"
            >
              <Input label="Invite by email" type="email" value={inviteEmail} onChange={setInviteEmail} required />
              <Button type="submit">Invite</Button>
            </form>
          </Card>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.05, ease: 'easeOut' }}
        >
          <Card>
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Promote existing user</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setPending({ kind: 'promote', email: promoteEmail });
              }}
              className="flex flex-col gap-3"
            >
              <Input label="Promote by email" type="email" value={promoteEmail} onChange={setPromoteEmail} required />
              <Button type="submit">Promote</Button>
            </form>
          </Card>
        </motion.div>
      </div>
```

Then, further down in the same return block, change:

```tsx
      {!isLoading && !isError && (
        <>
          <Table columns={columns} rows={superAdminsResponse?.data ?? []} rowKey={(sa) => sa.id} emptyMessage="No platform admins yet." />
          <Pagination page={superAdminsResponse?.page ?? 1} totalPages={superAdminsResponse?.totalPages ?? 1} onPageChange={setPage} />
        </>
      )}
```

to:

```tsx
      {!isLoading && !isError && (
        <>
          <CardGrid items={superAdminsResponse?.data ?? []} cardKey={(sa) => sa.id} renderCard={renderCard} emptyMessage="No platform admins yet." />
          <Pagination page={superAdminsResponse?.page ?? 1} totalPages={superAdminsResponse?.totalPages ?? 1} onPageChange={setPage} />
        </>
      )}
```

Do not modify the `Modal` block below this (lines 116-132 in the original file) — it stays exactly as-is.

- [ ] **Step 4: Run the existing page test to confirm no regression**

Run (from `apps/web`): `npx jest "app/(platform)/platform-admins/page.test" -v`

Expected: `3 passed, 3 total`. The existing tests query `getByText('super@platform.test')` and `getByText(/Grant super_admin access to .../)` (the latter is inside the untouched `Modal`) — the new card renders `sa.email` in its own `<p>`, so the text query still resolves to a single isolated node. If either assertion unexpectedly fails, check whether it is a structural query with no card equivalent (fix the test to target `.closest('.group')`) or a text-isolation issue from a combined text node (fix the markup to re-isolate the value) — do not weaken the assertion's expected string.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/(platform)/platform-admins/page.tsx"
git commit -m "feat: add motion polish and card grid to platform admin admins list"
```

---

### Task 4: Final verification

**Files:** none (verification only).

**Interfaces:**
- Consumes: the complete state of `apps/web/app/(platform)/**` after Tasks 1-3.
- Produces: nothing — this is the plan's terminal task.

- [ ] **Step 1: Run the full apps/web test suite**

Run (from `apps/web`): `npx jest`

Expected: all suites pass, including `app/(platform)/layout.test.tsx`, `app/(platform)/organizations/page.test.tsx`, and `app/(platform)/platform-admins/page.test.tsx`.

- [ ] **Step 2: Run the TypeScript compiler**

Run (from `apps/web`): `npx tsc --noEmit`

Expected: no new errors in any of the three modified files. Any pre-existing unrelated errors (e.g. in candidate-facing test files) are out of scope for this plan.

- [ ] **Step 3: Live browser verification**

Start the dev server and, logged in as `super@platform.test` / `DevSuper123!`:
- Confirm the top nav links and logout button show a smooth color transition on hover.
- Confirm `/organizations` shows the Create-organization card fading up on load, and the organizations list rendering as a card grid (name, slug, region, created date all visible per card).
- Confirm `/platform-admins` shows the Invite and Promote cards fading up in a staggered sequence, and the admins list rendering as a card grid (email, created date visible per card).
- Confirm the invite/promote confirm modal still opens and behaves identically to before.
- In OS or browser dev tools, enable "prefers reduced motion" and reload both pages — confirm entrance animations no longer play (content appears immediately, no fade/slide).

- [ ] **Step 4: Commit any fixes found during verification**

If Steps 1-3 surface any issue, fix it, re-run the relevant command from this task, and commit:

```bash
git add -A
git commit -m "fix: address final verification findings for platform admin motion redesign"
```

If no issues are found, skip this step — there is nothing to commit.
