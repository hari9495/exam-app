# Org Admin Console Motion & Visual Redesign — Design

## Context

The recruiter console received a motion & visual redesign (Feature #6598): Framer Motion
entrance/hover animation, `CardGrid` replacing `Table` on list pages, and sidebar nav hover
transitions. The org-admin console (`apps/web/app/(org-admin)/**`) still has only the earlier
"structural redesign" from an even earlier pass (design tokens, `StatusBadge`, dense `Table`
layout) — no motion, no card grids. This spec brings the org-admin console up to the same
visual/motion standard, scoped to what actually fits its content: unlike the recruiter console,
org-admin has no dashboard and no data worth charting, so this is motion + card-grid work only,
no Recharts, no new backend endpoints.

## Goal

Give the org-admin console the same "alive, modern SaaS" feel as the recruiter console —
consistent with its established design system — without adding scope beyond what its actual
pages support.

## Scope

**In scope — org-admin console only** (`apps/web/app/(org-admin)/**`):
- Sidebar nav (`layout.tsx`) — hover/active-state motion polish, no structural change (same
  treatment as the recruiter console's Task 7).
- **Staff Users** (`users/page.tsx`) — `Table` → `CardGrid`.
- **Audit Log** (`audit-log/page.tsx`) — `Table` → `CardGrid`. The existing cursor-based
  "Load more" pattern (not the recruiter's page-based `Pagination`) is unchanged.
- **Integrations** (`settings/integrations/page.tsx`) — the small embedded "Recent deliveries"
  webhook-history table → `CardGrid`; the 4 settings forms (SMTP, AI key, Public API, Webhooks)
  on the same page are untouched structurally, just gain entrance motion (see below).
- **Settings/Branding, Settings/SSO, Data Rights** — motion polish only (entrance fade-up on
  existing `Card` components, matching the recruiter dashboard's widget-card treatment). No
  structural change — these pages are settings forms / a search-and-modal flow, not lists.

**Explicitly out of scope:**
- No new dashboard/landing page for org-admin, no Recharts, no new backend aggregate — confirmed
  with the user: org-admin is a settings console, not an analytics console.
- No sort toolbar on the new card grids (Staff Users, Audit Log, Integrations deliveries) — the
  recruiter console got sort as a separate follow-up feature after its own card-grid conversion
  shipped; the same sequencing applies here if wanted later.
- Recruiter console, candidate-facing pages, platform-admin console, interview panel console —
  untouched.

## Design

### CardGrid conversions

All three conversions reuse the existing `CardGrid` component (`components/ui/CardGrid.tsx`,
already shipped and in production use on 3 recruiter pages) exactly as-is — no changes to
`CardGrid` itself are needed for this spec.

- **Staff Users:** each card shows email, a role `StatusBadge`, a status `StatusBadge`, and last
  login (or "Never"). The existing "Add staff member" form and search input above the grid are
  unchanged.
- **Audit Log:** each card shows the "When" timestamp, actor email (or "System"), an action
  `StatusBadge` (tone derived from the action-verb suffix, same logic as today), and entity
  type. The filter form and "Load more" button above/below the grid are unchanged — "Load more"
  keeps appending to the same `entries` array, which now renders as cards instead of rows.
- **Integrations → Recent deliveries:** each card shows event type, delivery status, HTTP status
  code (or "—"), and timestamp — nested inside the existing "Webhooks" settings `Card`, replacing
  just that one embedded `Table`.

### Motion polish (no structural change)

Matches the pattern already used for the recruiter dashboard's "Needs your attention"/"Recent
activity" widget cards: wrap each existing `Card` instance in a local `motion.div` with a fade-up
entrance (`initial={{ opacity: 0, y: 10 }}`, `animate={{ opacity: 1, y: 0 }}`,
`transition={{ duration: 0.3, ease: 'easeOut' }}`) — no change to `components/ui/Card.tsx` itself,
since that shared component is also used by candidate-facing pages (out of scope). Applies to:
Settings/Branding's one `Card`, Settings/SSO's one `Card`, Settings/Integrations' 4 settings
`Card`s (SMTP, AI key, Public API, Webhooks), and Data Rights' up-to-2 conditionally-rendered
`Card`s (candidate lookup result, export data).

### Sidebar nav polish

Same three-className treatment as the recruiter console's Task 7: add `transition-colors
duration-150` to the nav item `Link`, the profile `Link`, and the logout `button` in
`(org-admin)/layout.tsx` (none of the three currently have a transition class).

## Error Handling & Fallback

No new error states — all three card-grid conversions keep their existing `isLoading`/`isError`
branches and empty-message strings unchanged; `CardGrid`'s existing empty-state rendering
(`emptyMessage` prop) is reused exactly as the recruiter conversions used it.

## Testing

- Existing page tests (`users/page.test.tsx`, `audit-log/page.test.tsx`,
  `settings/branding/page.test.tsx`, `settings/integrations/page.test.tsx`,
  `settings/sso/page.test.tsx`) are expected to need no changes, following the same
  text/role-based assertion pattern the recruiter conversions confirmed holds. Verify at
  implementation time; only touch a test file if a real assertion actually breaks (e.g. the same
  class of `getByText`-isolation issue the recruiter Exams conversion hit once).
- No new tests required for the motion-only pages (matches this project's existing precedent —
  Framer Motion usage has no motion-specific tests anywhere in the codebase, only behavioral
  assertions).
- Live browser verification pass for all affected surfaces once implemented (nav, Staff Users,
  Audit Log, Integrations, Branding, SSO, Data Rights), following the same pattern used for the
  recruiter and card-grid-sort features.
