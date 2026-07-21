# Interview Panel Layout Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the interview panel console's layout shell from a full-height vertical sidebar (with only one nav item) into a horizontal top bar matching platform-admin's pattern, and fix a header/toolbar vertical-alignment bug on the exam results page — both pure layout/markup changes with no behavior change.

**Architecture:** Two independent, sequential tasks: the layout shell restructure (`apps/web/app/(panel)/layout.tsx`) and the one-line alignment fix (`apps/web/app/(panel)/reports/[examId]/page.tsx`). A final verification task runs the full suite and a live browser pass.

**Tech Stack:** Next.js (App Router), React, Tailwind CSS, Jest + React Testing Library, `clsx`, `lucide-react` (`LogOut` icon) — no new dependencies.

## Global Constraints

- No behavior change anywhere in this plan — same nav destination, same profile info, same logout handler, same toolbar buttons and their `onClick` handlers. Only JSX structure and classNames change.
- Do NOT touch any other console (recruiter, org-admin, platform-admin) or any other panel page (Exams list, candidate detail, compare page).
- Do NOT migrate any `gray-*` color class onto the `recruiter-*`/`status-*` design-token system — this console keeps its existing plain-gray palette, per the standing decision for this whole redesign initiative.
- Do NOT add a sort toolbar or any new dependency.

---

### Task 1: Panel layout — sidebar → horizontal top bar

**Files:**
- Modify: `apps/web/app/(panel)/layout.tsx`
- Test: `apps/web/app/(panel)/layout.test.tsx` (verify only — no change expected)

**Interfaces:**
- Consumes: nothing from other tasks in this plan.
- Produces: nothing consumed by later tasks — Task 2 is an independent file.

The current file (104 lines) renders a full-height sidebar: a logo block, a single-item `<ul>` of nav links, and a bottom profile/logout block, inside `<div className="flex min-h-screen">` next to `<main className="flex-1 p-8">`. This task restructures the returned JSX into a single horizontal bar (logo + nav on the left, profile + logout on the right), matching the shell already shipped in `apps/web/app/(platform)/layout.tsx`. The `NAV_ITEMS` array (previously mapped over for a `<ul>`) is removed since there is exactly one nav destination — this is a direct simplification of the file being restructured, not a separate concern.

- [ ] **Step 1: Remove the now-unnecessary `NAV_ITEMS` array**

Change:

```tsx
const NAV_ITEMS = [{ href: '/reports', label: 'Exams' }];

export default function PanelLayout({ children }: { children: React.ReactNode }) {
```

to:

```tsx
export default function PanelLayout({ children }: { children: React.ReactNode }) {
```

- [ ] **Step 2: Replace the sidebar return block with a horizontal top bar**

Change the whole `return` block from:

```tsx
  return (
    <MotionConfig reducedMotion="user">
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
                    'block rounded px-3 py-2 text-sm font-medium transition-colors duration-150',
                    pathname?.startsWith(item.href) ? 'bg-primary text-white' : 'text-gray-700 hover:bg-gray-100',
                  )}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between gap-2 border-t border-gray-200 px-3.5 py-3">
            <Link
              href="/profile"
              className="flex min-w-0 items-center gap-2 rounded-md px-1 py-0.5 transition-colors duration-150 hover:bg-gray-100"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-white">
                {initials}
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-gray-900">{displayName}</p>
                <p className="text-[10.5px] text-gray-500">Panel</p>
              </div>
            </Link>
            <button
              type="button"
              aria-label="Log out"
              onClick={handleLogout}
              className="shrink-0 rounded-md p-1.5 text-gray-500 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-900"
            >
              <LogOut size={16} />
            </button>
          </div>
        </nav>
        <main className="flex-1 p-8">{children}</main>
      </div>
    </MotionConfig>
  );
```

to:

```tsx
  return (
    <MotionConfig reducedMotion="user">
      <div style={themeStyle} className="min-h-screen bg-gray-50">
        <div className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
          <div className="flex items-center gap-4">
            {branding?.logoUrl && <img src={branding.logoUrl} alt="Organization logo" className="max-h-8" />}
            <Link
              href="/reports"
              className={clsx(
                'rounded px-3 py-2 text-sm font-medium transition-colors duration-150',
                pathname?.startsWith('/reports') ? 'bg-primary text-white' : 'text-gray-700 hover:bg-gray-100',
              )}
            >
              Exams
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/profile"
              className="flex min-w-0 items-center gap-2 rounded-md px-1 py-0.5 transition-colors duration-150 hover:bg-gray-100"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-white">
                {initials}
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-gray-900">{displayName}</p>
                <p className="text-[10.5px] text-gray-500">Panel</p>
              </div>
            </Link>
            <button
              type="button"
              aria-label="Log out"
              onClick={handleLogout}
              className="shrink-0 rounded-md p-1.5 text-gray-500 transition-colors duration-150 hover:bg-gray-100 hover:text-gray-900"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
        <main className="p-8">{children}</main>
      </div>
    </MotionConfig>
  );
```

- [ ] **Step 3: Run the existing layout test to confirm no regression**

Run (from `apps/web`): `npx jest "panel.*layout.test" --verbose`

Expected: `5 passed, 5 total` — the five existing tests query by role/text
(`getByRole('link', { name: 'Exams' })`, logout button, real display name, avatar/name link
`href="/profile"`, wrong-role redirect), none of which depend on sidebar-vs-top-bar DOM
structure, so all should pass unchanged.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/app/(panel)/layout.tsx"
git commit -m "feat: restructure interview panel layout from sidebar to top bar"
```

---

### Task 2: Exam results page — Candidates header alignment fix

**Files:**
- Modify: `apps/web/app/(panel)/reports/[examId]/page.tsx`
- Test: `apps/web/app/(panel)/reports/[examId]/page.test.tsx` (verify only — no change expected)

**Interfaces:**
- Consumes: nothing from other tasks in this plan.
- Produces: nothing consumed by later tasks.

The Candidates section header row currently uses `items-center`, which vertically centers the
single-line "Candidates" heading against a toolbar made taller by the Integrity `Select`'s own
label. This task changes that one class to `items-end`.

- [ ] **Step 1: Change `items-center` to `items-end` on the Candidates header row**

Change:

```tsx
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-medium">Candidates</h2>
          <div className="flex items-end gap-2">
```

to:

```tsx
        <div className="mb-2 flex items-end justify-between">
          <h2 className="text-lg font-medium">Candidates</h2>
          <div className="flex items-end gap-2">
```

- [ ] **Step 2: Run the existing page test to confirm no regression**

Run (from `apps/web`): `npx jest "panel.*reports/.examId./page.test" --verbose`

Expected: `5 passed, 5 total`. This is a pure alignment class change with no effect on any
text/role query, so all five existing tests should pass unchanged.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/app/(panel)/reports/[examId]/page.tsx"
git commit -m "fix: align Candidates heading with its toolbar on interview panel exam results page"
```

---

### Task 3: Final verification

**Files:** none (verification only).

**Interfaces:**
- Consumes: the complete state of `apps/web/app/(panel)/**` after Tasks 1-2.
- Produces: nothing — this is the plan's terminal task.

- [ ] **Step 1: Run the full apps/web test suite**

Run (from `apps/web`): `npx jest`

Expected: all suites pass, including `app/(panel)/layout.test.tsx` and
`app/(panel)/reports/[examId]/page.test.tsx`.

- [ ] **Step 2: Run the TypeScript compiler**

Run (from `apps/web`): `npx tsc --noEmit`

Expected: no new errors in either modified file. Any pre-existing unrelated errors (e.g. in
candidate-facing or auth test files) are out of scope for this plan.

- [ ] **Step 3: Live browser verification**

Start the dev server and, logged in as `panel@demo-org.test` / `Passw0rd!2026` (org slug
`demo-org`):
- Confirm the panel console now shows a horizontal top bar (logo + "Exams" link on the left,
  profile block + logout on the right) instead of a sidebar, on both `/reports` and an exam
  results page.
- Confirm the "Exams" link still shows its active-state highlight when on `/reports` or a
  sub-route, and the hover transition still works on all three interactive elements (nav link,
  profile link, logout button).
- Confirm clicking the profile block still navigates to `/profile` and logout still works.
- Open an exam results page for an exam with at least one settled candidate and confirm the
  "Candidates" heading now visually lines up with the toolbar buttons (Integrity dropdown, Export
  buttons, Compare selected) instead of floating above them.

- [ ] **Step 4: Commit any fixes found during verification**

If Steps 1-3 surface any issue, fix it, re-run the relevant command from this task, and commit:

```bash
git add -A
git commit -m "fix: address final verification findings for interview panel layout fixes"
```

If no issues are found, skip this step — there is nothing to commit.
