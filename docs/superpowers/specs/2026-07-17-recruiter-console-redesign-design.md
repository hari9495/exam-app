# Recruiter Console Redesign — Design Spec

## Context & Scope

The recruiter console (`apps/web/app/(recruiter)/`: dashboard, exams, questions, candidates + shared layout/shell) is functionally complete but visually undeveloped — the same gap the candidate exam flow had before its own redesign (`docs/superpowers/specs/2026-07-17-candidate-exam-flow-redesign-design.md`). The shell is a flat `w-56 bg-gray-50` sidebar with four unstyled nav links; the 12 shared primitives in `components/ui/*` (Button, Card, Input, Select, Checkbox, Radio, Badge, Modal, Toast, Tabs, DropdownMenu, Table) are bare-bones, mostly stock Tailwind grays; the `primary`/`accent` brand tokens (`#1a73e8`/`#fbbc04`, dynamically overridden per-organization via `--color-primary`/`--color-accent` CSS variables for white-label branding) are used in only ~4 of the 12 primitives, and `accent` is used nowhere. Icons are unicode glyphs (`▾`, `✓`, `✕`, `↑`/`↓`) throughout. The dashboard today is 48 lines showing two stat cards computed client-side from the full `GET /exams` response — no dedicated backend support.

**In scope**: shell (sidebar nav + org branding + user menu), Dashboard (existing 2 stats + 4 new sections), Exams list, Question Bank list, Candidates list. Shared primitive components get extended in place as needed to support these screens.

**Out of scope**: Reports (`(panel)` route group), Org Admin (`(org-admin)` route group), Live Monitoring (a tab inside the exam-builder edit page, not a standalone route), the exam builder/editor itself, staff login page. All explicitly deferred as a deliberate first-pass boundary — this is the recruiter's daily-use surface, not every screen a staff member can reach.

## Visual Direction

**"ATS/recruiting-tool standard"** — dense, scanable, data-forward, matching the conventions of Greenhouse/Lever/Workable: real data tables (not cards) for list views, status badges as the primary state indicator, an icon sidebar with active-state highlighting, hover-revealed row actions to keep rows calm at rest.

**Palette**: reuse the existing `primary`/`accent` tokens as-is — no new tokens, no new override points. This is a hard constraint, not a preference: `--color-primary` is the org's single branding lever today, and this redesign must not add a second one. What changes is *where* `primary` gets applied — consistently across all 12 shared primitives instead of ~4 — and a real neutral scale (borders, text tiers, backgrounds) to replace ad hoc Tailwind grays, mirroring the `candidate.border`/`candidate.text*` pattern from the candidate-flow redesign but under the recruiter console's own namespace:

| Token | Value | Use |
|---|---|---|
| `primary` | `#1a73e8` (org-overridable) | existing — brand accent, primary buttons, active nav state, links |
| `accent` | `#fbbc04` (org-overridable) | existing — first real use: attention/warning indicators where amber reads as "needs review" rather than "error" |
| `recruiter.border` | `#E4E7E5` | **new** — card/table/divider borders, replacing default `border-gray-200` |
| `recruiter.text` / `text-secondary` / `text-tertiary` | `#1A1F1D` / `#57615B` / `#9AA5A0` | **new** — real text-color scale, replacing ad hoc `text-gray-900`/`-600`/`-400` |
| `recruiter.bg-subtle` | `#F7F9F8` | **new** — table header background, sidebar/page background |
| `status.success` / `success-bg` | `#2F6F5E` / `#EAF5EF` | **new** — status badges: published, completed |
| `status.warning` / `warning-bg` | `#8A5A00` / `#FBF3DD` | **new** — status badges: draft, in-progress, attention items |
| `status.danger` / `danger-bg` | `#B23B3B` / `#FBEAEA` | **new** — status badges: archived, flagged |

The `status.*` tier is neutral (not tied to `primary`), matching the ATS convention that badge colors mean the same thing regardless of org branding — a "published" badge stays green even for an org whose brand color is red.

**Typography**: same rationale as the candidate-flow spec — no new font, system-ui stack. Scale: 11px (table header labels, uppercase, 700 weight), 12–13px (table cell/meta text), 13–14px (body/buttons), 15–16px (card titles), 19px (page title).

**Icons**: `lucide-react` (already a dependency, confirmed unused anywhere under `(recruiter)`/`(panel)`/`(org-admin)`/`components/ui` today). Replaces every unicode glyph in the shared primitives and console:

| Current glyph | Lucide icon | Used in |
|---|---|---|
| `▾` | `ChevronDown` | Select, DropdownMenu |
| `✓` | `Check` | Checkbox, success badges |
| `✕` | `X` | Modal close, error states |
| `↑`/`↓` | `ArrowUp`/`ArrowDown` | Table sort indicators |
| (nav items) | `LayoutDashboard`, `FileText`, `BookOpen`, `Users` | sidebar: Dashboard, Exams, Question Bank, Candidates |
| (new) | `Search` | table search inputs |
| (new) | `Plus` | "New exam" / "New question" / "Add candidate" buttons |
| (new) | `MoreHorizontal` | hover row-action trigger |
| (new) | `Mail`, `Play`, `FileEdit`, `AlertTriangle`, `Clock` | dashboard attention/activity icons |

**Elevation & shape**: matches the candidate-flow conventions for consistency across the app — `rounded-lg` (8px) cards/tables, `rounded-md` (6px) buttons/inputs/badges-as-pills use `rounded-full`, `border` + `shadow-sm` on containers, no shadow on table rows (flat, hover = subtle `bg-subtle` background shift only).

## Component Strategy

Extend the existing 12 `components/ui/*` primitives in place rather than building a parallel `recruiter/*` component set. Two new primitives are needed: `Table` gets a dense-mode variant (current `Table` is presentational only — no built-in status-badge or hover-action-column support), and a new `StatusBadge` component wraps `Badge` with the `status.*` token mapping so every screen renders badges identically instead of each page hand-rolling badge colors.

Reasoning: the shared primitives already have the org-branding override wired through `primary`/`accent`; a parallel component set would either duplicate that wiring or fragment it. This also means the improvements compound for free into `(org-admin)` and `(panel)` when those get their own redesign passes later, since they already consume `components/ui/*`.

## Screen-by-Screen Design

All mockups referenced below were built and approved interactively via the brainstorming visual companion; this section is the written record of what was confirmed.

### 1. Shell — sidebar + branding

White sidebar (`bg-white`, `border-r recruiter.border`) — **not** dark and **not** fully brand-colored. Two alternatives were mocked (a fully brand-colored sidebar background, and this one); the fully-colored option was rejected because a poorly-chosen org color could hurt readability at that scale, and it doubles as a second de facto branding surface beyond the intended single override point.

Structure top-to-bottom:
- Org header: 28px logo badge (brand-colored background, org initial) + org name, bottom border.
- Nav: `LayoutDashboard`/`FileText`/`BookOpen`/`Users` + label, one per route. Active state: `bg` = brand-tinted light wash (derived from `primary` at low opacity, not a fixed color — so it re-tints correctly per org), 3px left border in `primary`, `text` = `primary`, `font-weight: 600`. Inactive: `recruiter.text-secondary`, hover = `recruiter.bg-subtle`.
- User footer (new — doesn't exist today): avatar (brand-colored circle, initials) + name + role, top border, pinned to sidebar bottom.

### 2. Dashboard — expanded scope

Confirmed as "one combined project" alongside the visual redesign, not split into a follow-up spec.

**Stats row**: 4 cards (existing 2 — active exams, draft exams — replaced with 4: total candidates, invitations sent, attempts in progress, pending grading), each an icon-in-tinted-circle + number + label, single row, equal width.

**Two-column body below the stats row:**
- Left — "Needs your attention" card: a list of items each with a colored dot (danger/warning/neutral) + description + optional count badge. Confirmed content: exams with pending manual grading (count), exams with a recent proctoring flag, candidates invited 5+ days ago who haven't started (count). Below the list, two quick-action buttons: "Create exam", "Invite candidates".
- Right — "Recent activity" card: a reverse-chronological feed, each row an icon-in-circle + one-line description + relative timestamp. Confirmed event types: exam published, candidates invited (batched — "N candidates invited to X"), candidate submitted, grade finalized.

User explicitly confirmed no further additions beyond these two cards + stats row for this pass ("we will see later") — a quick-search bar, trend charts, and an upcoming-exams strip were proposed and deliberately deferred, not rejected on merit.

### 3. Exams list

Top bar: page title + "New exam" button (`primary`, `Plus` icon). Toolbar: search input (`Search` icon), status filter select. Table columns: Exam (title + `meta` subtext: duration · question count), Status (`StatusBadge`: published/draft/archived), Progress (a 70px track + fill bar in `primary`, showing "settled/total" attempt count as text — draft exams with 0 candidates show an em-dash instead of a bar), Candidates (count), Created (date), row-actions (hidden until row hover, `MoreHorizontal` trigger).

### 4. Question Bank list

Same table shell as Exams. Columns: Question (title + truncated body preview), Type (`StatusBadge`-style tag: MCQ/Code/Free text, using distinct hues from the status palette since these aren't state indicators — informational categories), Difficulty (three dots, filled count = difficulty level), Used in (exam count), row-actions. Toolbar adds a second filter (tag) alongside search and type filter.

### 5. Candidates list

Same table shell, with two differences: a leading checkbox column (reuses the existing bulk-invite selection flow — `useBulkInvite`, unchanged), and two header buttons ("Upload & invite" — the existing bulk-upload feature, secondary style; "Add candidate" — primary style, existing single-add form). Columns: Candidate (avatar + name + email), Status (`StatusBadge`: completed/in-progress/invited/flagged), Exam (title), Score (percentage, em-dash if not yet scored), Invited (date), row-actions.

## Data & Backend Requirements

Confirmed via a reuse-vs-build audit before mockups began (`AuditLog`/`GET /audit-logs`, `ExamResultsSummary`/`getPendingGrading()`, `ProctoringEvent` listing, `GET /candidates` were all checked for reuse first). Three real gaps, all newly required by the expanded Dashboard scope and the Exams list's progress column — nothing else in this spec needs new backend work:

1. **Dashboard stats + attention aggregation** — no endpoint returns org-wide counts today; `getPendingGrading()` and proctoring-event listing are strictly per-exam/per-attempt. Needs a new endpoint aggregating: total candidate count, invitation count, in-progress attempt count, pending-grading count (sum across exams), stale-invitation count (invited N+ days ago, no attempt started).
2. **Recent activity feed** — the audit log has no `invitation.created` event today (confirmed via grep — every other major action is logged, this one isn't). Needs that event added at the point invitations are created, so the feed isn't missing the single most common recruiter action. The feed endpoint itself can then read from `AuditLog` directly, filtered to the actor's org and a small set of action types (exam.published, invitation.created, attempt.submitted, grade.finalized).
3. **Exams list progress column** — `GET /exams` returns no attempt-count data; today's per-exam progress lookup is a separate call per exam. Needs a lightweight aggregate (settled/total attempt counts) added to the list endpoint response, computed in one query rather than N+1.

These three are implementation-plan tasks, not open questions — the shape of each is settled; only the query/index details remain for the plan.

## Error & Empty States

Tables use a consistent empty state (centered icon + one-line message + primary CTA where applicable — e.g. no exams yet → "Create your first exam"), matching the pattern rather than each page inventing its own. Loading state is a skeleton-row table (not a spinner) so the dense-table layout doesn't jump on load. No new error-handling patterns beyond what the existing `components/ui` primitives already do for network failures (unchanged).

## Testing Approach

Existing component and page-level test suites (`apps/web/app/(recruiter)/**/*.test.tsx`, `components/ui/**/*.test.tsx`) get updated in place per task, same convention as the candidate-flow redesign — no new testing infrastructure. New backend aggregation endpoints get unit + e2e coverage following the existing `apps/api`/`apps/exam-runtime` test conventions.
