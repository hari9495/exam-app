# Interview Panel Layout Fixes — Design

## Context

Live UI testing after the just-shipped Interview Panel Console Motion & Visual Redesign
(Feature #6652) surfaced two pre-existing layout issues in `apps/web/app/(panel)/**`, neither
introduced by that motion pass:

1. **Sparse sidebar.** The panel console's `layout.tsx` renders a full-height vertical sidebar
   containing exactly one nav item ("Exams"), because the panel role genuinely has only one
   function — viewing exam results. There is no dashboard, candidates page, or settings screen
   for this role. A full-height sidebar for a single link looks visually unbalanced. The
   platform-admin console solved the identical problem (it also has few nav items — 2) by using
   a horizontal top bar instead of a sidebar (`apps/web/app/(platform)/layout.tsx`).
2. **Misaligned Candidates header.** On the exam results page
   (`reports/[examId]/page.tsx:145-166`), the "Candidates" heading and its toolbar (Integrity
   filter `Select` + 3 export `Button`s + "Compare selected" `Button`) sit in one flex row with
   `items-center`. The `Select` renders its own "Integrity" label above its control, making the
   toolbar taller than the single-line heading — so "Candidates" ends up vertically centered
   against a taller sibling and visually floats up near the "Integrity" label instead of lining
   up with the buttons.

## Goal

Fix both issues without changing any panel console behavior, data flow, or the content already
shown — this is a pure layout/markup correction.

## Scope

**In scope:**
- `apps/web/app/(panel)/layout.tsx` — restructure from a vertical sidebar to a horizontal top bar.
- `apps/web/app/(panel)/reports/[examId]/page.tsx` — one-line alignment fix on the Candidates
  header row.

**Explicitly out of scope:**
- No change to any other console (recruiter, org-admin, platform-admin).
- No change to what the panel console shows or how it behaves — same nav item, same profile
  info, same logout, same toolbar buttons and their handlers.
- No change to the Compare page or candidate detail page.
- No sort toolbar, no new dependencies, no design-token migration (this console stays on its
  existing plain-gray palette, per the standing decision for this whole redesign initiative).

## Design

### 1. Panel layout shell → horizontal top bar

Restructure `PanelLayout`'s return JSX from the current sidebar layout into a single horizontal
bar, styled like platform-admin's top bar (`border-b border-gray-200 bg-white`, `flex
items-center justify-between px-6 py-4`) but carrying panel's richer content — nothing is
dropped, only repositioned:

- **Left side:** the branding logo (`branding?.logoUrl`, unchanged conditional) followed by the
  "Exams" `Link`, both inline in a `flex items-center gap-4` group. The nav `Link` keeps its
  exact existing classes (`transition-colors duration-150`, active/inactive color logic) —  only
  the outer `<ul>`/`<li>` wrapper is dropped since there's one link, not a list.
- **Right side:** the profile `Link` (avatar circle + name + "Panel" label) immediately followed
  by the logout `button`, in a `flex items-center gap-3` group — same elements, same classes,
  same `handleLogout`, just no longer stacked at a sidebar's bottom.
- `<main>` changes from `flex-1 p-8` (sidebar companion) to plain `p-8`, matching
  platform-admin's `<main className="p-8">`.
- The outer wrapping `<div>` drops `flex min-h-screen` (no longer a flex row of sidebar+main) in
  favor of `min-h-screen bg-gray-50`, matching platform-admin's outer shell.
- `MotionConfig reducedMotion="user"`, the role-redirect `useEffect`, the loading-state early
  return, and `handleLogout` are all unchanged — this task only touches the JSX returned once
  loading/auth checks pass.

### 2. Candidates header alignment fix

Change the Candidates header row's outer flex from `items-center` to `items-end`
(`reports/[examId]/page.tsx:146`), so the "Candidates" heading bottom-aligns with the toolbar
instead of vertically centering against a toolbar made taller by the Integrity `Select`'s label.
No other line changes.

## Error Handling & Fallback

No new error states. The panel layout's existing `isLoading`/`!accessToken`/wrong-role early
return (`<p className="p-8 text-sm text-gray-500">Loading…</p>`) is unchanged.

## Testing

- `apps/web/app/(panel)/layout.test.tsx`'s existing 5 tests query by role/text
  (`getByRole('link', {name: 'Exams'})`, logout button, real name text, avatar-link href) — none
  depend on sidebar-vs-top-bar DOM structure, so they should need no changes. Verify at
  implementation time; if a test unexpectedly breaks, fix the test to match the new markup only
  if the query was structural with no equivalent — do not weaken any assertion.
- No test exists for the Candidates header alignment (pure CSS, no behavioral change) and none is
  needed, matching this project's precedent of not writing motion/layout-only tests.
- Live browser verification: confirm the top bar renders correctly (logo, nav link, profile
  block, logout, all functional), and confirm the Candidates heading now visually lines up with
  the toolbar buttons on an exam with settled candidates.
