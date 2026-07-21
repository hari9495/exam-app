# Recruiter Console Motion & Visual Redesign — Design

## Context

The recruiter console (`apps/web/app/(recruiter)`) already went through one redesign pass this
session ("Recruiter Console Redesign") that established a design-token system
(`recruiter-*` Tailwind colors, `status-*` semantic colors) and a `StatusBadge` primitive,
retrofitted onto `Card`, `Button`, `Table`, `Pagination` shared components. That pass fixed
structure and consistency; it did not add motion or visual depth. The user's complaint —
"it's like a normal old-school product" — is accurate against that baseline: the console is
functionally solid but static. `framer-motion` (^12.42.2) is already an installed dependency,
used in exactly one place in the whole app (`LeaderboardWidget.tsx`).

This spec covers a second pass, scoped to **visual/motion polish plus two specific layout
changes**, informed by a visual-companion brainstorming session where the user compared
mockups directly in a browser and converged on a concrete direction.

## Goal

Make the recruiter console feel like a modern, alive SaaS product — motion on load and on
interaction, richer data visualization on the dashboard, and a denser visual (not tabular)
presentation for list pages — without touching candidate-facing pages or restructuring the
console's navigation.

## Scope

**In scope — recruiter console only** (`apps/web/app/(recruiter)/**`):
- Dashboard (`dashboard/page.tsx`) — expanded layout with a candidate funnel chart and an
  upcoming-exams widget, motion on stat cards
- Exams list (`exams/page.tsx`) — table → card grid
- Candidates list (`candidates/page.tsx`) — table → card grid
- Question Bank list (`questions/page.tsx`) — table → card grid
- Sidebar/nav shell (`layout.tsx`) — motion polish only (hover/active-state transitions), no
  structural change

**Explicitly out of scope:**
- Candidate-facing pages (`app/(candidate)/**`) — deliberately different "Calm Focus" design
  system for a low-distraction, timed-exam experience; just received its own branding pass
  this session (Candidate Color Re-theming).
- Org-admin, panel, and platform-admin consoles — separate consoles, would each get their own
  spec/plan if pursued later.
- Any change to exam-builder question-authoring screens, candidate detail/report screens, or
  audit log — not part of the dashboard/list-page/nav surface this spec targets.

## Visual Direction (validated via visual-companion mockups)

A hybrid of two reference styles the user compared side-by-side:
- **Base look** (Notion/Stripe direction): light background, white cards, soft multi-layer
  box-shadows (`0 1px 2px rgba(0,0,0,0.04), 0 8px 20px rgba(0,0,0,0.05)`), 14–16px border
  radius, generous padding, `-apple-system`/Inter-style sans-serif.
- **Data density** (dashboard-heavy direction): stat cards carry a small sparkline/trend
  visualization rather than a bare number, a left accent border per card
  (`border-left: 3px solid <accent>`) using the existing `status-*` palette
  (indigo/green/amber/pink) to differentiate metrics at a glance.
- **Motion**, confirmed via a live animated mockup (approved as "yes, this energy"):
  - Cards fade up + slide in on mount, staggered (~50ms offset per card)
  - Sparkline/chart bars grow from baseline on mount
  - Cards lift slightly on hover (`translateY(-2px to -3px)` + shadow deepen)
  - List rows/cards highlight background on hover
  - All via Framer Motion (`motion.div` + `variants`, or `AnimatePresence` where content
    changes), not raw CSS `@keyframes` in component files — keeps motion declarative and
    consistent with how a future page would add it.

## New Dependency: Recharts

Approved explicitly over the CSS-only alternative. Recharts is SVG-based (styles compose with
Tailwind/CSS custom properties, unlike canvas-based libraries), is the most widely-adopted
React charting library, and ships a built-in `<FunnelChart>` component that maps directly onto
the candidate-funnel widget. Add `recharts` to `apps/web/package.json`.

- **Funnel widget:** `<FunnelChart>` + `<Funnel>` with 4 stages (see Data Flow below).
- **Stat-card sparklines:** `<BarChart>` or `<AreaChart>` in "sparkline mode" — no axes, no
  grid, no tooltip, sized to fit inside a stat card (roughly 60×20px), colored via the same
  `status-*` accent as the card's left border.

**Named tradeoff:** Recharts adds real bundle weight (~100KB+ gzipped). Acceptable for a
staff-only console where this isn't the case for candidate-facing pages (where load time
matters more during a timed exam) — but it's a permanent addition, not a free upgrade, and is
explicitly not proposed for candidate pages.

## Backend Changes

`apps/api/src/dashboard/dashboard.service.ts`'s `DashboardSummary` interface gains two new
top-level fields, both computed the same way the existing `pendingGradingGroups` /
`staleInvitationCount` aggregates are — additional `Promise.all` entries in `getSummary()`,
scoped to the same `examIds` already resolved in that method:

```typescript
export interface DashboardSummary {
  stats: { /* unchanged */ };
  attention: { /* unchanged */ };
  activity: { /* unchanged */ }[];
  funnel: {
    invited: number;
    started: number;
    submitted: number;
    passed: number;
  };
  upcomingExams: {
    examId: string;
    examTitle: string;
    availabilityWindowStart: string;
  }[];
}
```

**`funnel` — four independent counts**, each scoped to `examId: { in: examIds }` exactly like
the existing queries in this method:
- `invited` — `tx.invitation.count({ where: { examId: { in: examIds } } })`
- `started` — `tx.attempt.count({ where: { examId: { in: examIds } } })` (an `Attempt` row
  only exists once a candidate has started, per the 1:1 `Invitation.attempt` relation)
- `submitted` — `tx.attempt.count({ where: { examId: { in: examIds }, submittedAt: { not: null } } })`
  (uses the `submittedAt` timestamp field directly, not a `status` string match, so it's
  correct regardless of what post-submission status the attempt is currently in — e.g.
  `pending_manual_grade`)
- `passed` — `tx.result.count({ where: { attempt: { examId: { in: examIds } }, passFail: 'pass' } })`

**`upcomingExams` — exams with a future scheduling window:**
```typescript
tx.exam.findMany({
  where: { organizationId, schedulingEnabled: true, availabilityWindowStart: { gt: new Date() } },
  select: { id: true, title: true, availabilityWindowStart: true },
  orderBy: { availabilityWindowStart: 'asc' },
  take: 5,
})
```
(Reuses `Exam.schedulingEnabled` / `Exam.availabilityWindowStart`, the same fields the
scheduling-window feature already added earlier this session — no schema change needed.)

Both additions join the existing `Promise.all([...])` array in `getSummary()`; no new
`forTenant` call, no new round trip beyond the two new queries themselves.

`apps/web/lib/types.ts`'s `DashboardSummary` type mirrors the same two new fields (frontend
type already exists, matching the backend interface field-for-field per existing convention).

## Frontend Changes

### Dashboard (`app/(recruiter)/dashboard/page.tsx`)

Current structure (4 stat cards in a row, then a 2-column "attention" + "activity" grid) is
kept as the skeleton; each piece gets motion and the two new widgets are added:
- The 4 stat cards (`Card` components) become `motion.div`-wrapped with the fade-up-staggered
  entrance, a sparkline added under each number, left accent border added per the visual
  direction.
- A new funnel widget card, using `<FunnelChart>`, placed either as a 5th stat-row item or a
  new row below — implementer's call based on how it reads once built with real data (not
  prescribing exact grid placement here, since that's a layout-fit judgment better made
  against the actual rendered numbers).
- A new "Upcoming exams" widget card (simple list, not a chart) — exam title + formatted date,
  reusing the existing `Link href={`/exams/${examId}/edit`}` pattern already used for
  "Needs your attention" list items.
- "Needs your attention" and "Recent activity" cards keep their current content, gain entrance
  motion and hover states matching the rest.

### List pages (Exams, Candidates, Question Bank)

All three currently render via the shared `Table` component with `Column<T>[]` definitions
(see `exams/page.tsx` for the reference pattern — `Column` render functions,
`StatusBadge`, row-hover action reveal via `opacity-0 group-hover:opacity-100`). Each becomes
a card grid instead:
- New shared component `components/ui/CardGrid.tsx` (or similar — exact naming/location is an
  implementation detail for the plan) takes the same shape of column/render definitions the
  `Table` component already uses, so the existing `columns` arrays in each page can mostly be
  reused/adapted rather than rewritten from scratch — avoids duplicating the status-tone /
  progress-bar / date-formatting logic that already exists per page.
- Grid layout: 2–3 cards per row depending on viewport (matches the mockup's 2-column density
  at the mockup's fixed width; exact breakpoint tuning is implementation detail).
  cards.
- Pagination, search, and the existing `useExams`/`useCandidates`/`useQuestions` hooks are
  **unchanged** — this is a rendering-layer change only, not a data-layer change. The
  paginated response shape already returned by each hook (`PaginatedResponse<T>`) is exactly
  what a card grid needs.
- Row-hover action reveal (edit link, dropdown menu) becomes card-hover, using the same
  Framer Motion hover-lift pattern as the dashboard stat cards for visual consistency across
  the whole console.

### Sidebar/nav shell (`app/(recruiter)/layout.tsx`)

Motion polish only: hover/active-state background-color transitions on nav items (currently
likely instant/no-transition — confirm against current code at implementation time), no
change to the nav item list, ordering, or the shell's overall structure.

## Error Handling & Fallback

- `funnel` and `upcomingExams` follow the same error/loading handling already in place for the
  rest of `DashboardSummary` — the whole dashboard query either succeeds or the existing
  `isError` branch renders (no per-widget error states needed, consistent with how
  "attention"/"activity" already behave).
- An org with zero exams/candidates renders the funnel with all-zero stages and an empty
  upcoming-exams list — `FunnelChart` and empty-state list rendering both need to handle the
  zero-data case without erroring (Recharts renders an empty funnel fine with all-zero values;
  the upcoming-exams widget shows the existing empty-state pattern already used elsewhere on
  this page, e.g. "Nothing needs attention right now.").
- Card grids reuse the existing `Pagination` component's behavior for zero/one-page results —
  no new logic needed there.

## Testing

- Backend: new unit tests for the `funnel` and `upcomingExams` aggregates in
  `dashboard.service.spec.ts`, following the existing test structure for
  `pendingGradingGroups`/`staleInvitationCount` — assert correct counts against seeded
  invitation/attempt/result fixtures, including a zero-data case.
- Frontend: existing page-level tests (`dashboard/page.test.tsx`,
  `exams/page.test.tsx`, etc.) get updated for the new markup/structure (card grid instead of
  table rows in list-page tests; new funnel/upcoming-exams sections asserted in the dashboard
  test) — same update-in-place approach used when these pages were built originally, not a
  parallel test suite.
- Framer Motion animations are not asserted via snapshot/timing tests (matches this project's
  existing precedent — `LeaderboardWidget`'s Framer Motion usage has no motion-specific test
  today, only behavioral assertions) — tests verify the underlying data/markup renders
  correctly, not the animation curve itself.
- Live browser verification pass for all 5 surfaces once implemented, following this session's
  established pattern (screenshot + interaction check, not just automated tests).
