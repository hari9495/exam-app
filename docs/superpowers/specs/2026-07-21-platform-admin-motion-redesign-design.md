# Platform Admin Console Motion & Visual Redesign — Design

## Context

The recruiter console (Feature #6598) and the org-admin console (Feature #6626) have both
received a motion & visual redesign: Framer Motion entrance animation, `CardGrid` replacing
`Table` on list pages, and nav hover transitions. The platform-admin console
(`apps/web/app/(platform)/**`) is the smallest of the three staff consoles — a top-bar nav plus
two pages (Organizations, Platform Admins) — and has never received the design-token migration
(`recruiter-*`/`status-*` classes, `StatusBadge`) that the other two consoles use; it is styled
entirely with plain Tailwind gray classes (`gray-900`/`gray-500`/`gray-200`).

The user has explicitly decided **not** to migrate platform-admin onto the design-token system as
part of this pass — the existing gray palette stays exactly as-is. This spec is scoped narrowly:
layer `CardGrid` and Framer Motion entrance motion on top of the existing gray styling, nothing
else.

## Goal

Give the platform-admin console the same "alive, modern SaaS" motion feel as the other two
consoles, without touching its color palette or design system.

## Scope

**In scope — platform-admin console only** (`apps/web/app/(platform)/**`):
- **Top nav** (`layout.tsx`) — hover-transition polish on the two nav links (`Organizations`,
  `Platform Admins`) and the logout button (none currently have a `transition-colors` class), plus
  a `MotionConfig reducedMotion="user"` wrap around the layout's returned JSX tree (built in from
  the start this time, rather than added as a final-review fix — the same gap was caught on both
  the recruiter and org-admin final reviews).
- **Organizations** (`organizations/page.tsx`) — the `Table` (Name, Slug, Region, Created) →
  `CardGrid`; the "Create organization" `Card` (Name, Slug, Region, Admin email, submit, error)
  above it gains entrance motion only, no structural change. Search `Input` and `Pagination`
  unchanged.
- **Platform Admins** (`platform-admins/page.tsx`) — the `Table` (Email, Created) → `CardGrid`;
  the two side-by-side `Card`s ("Invite new admin", "Promote existing user") gain staggered
  entrance motion only. Search `Input` and `Pagination` unchanged. The confirm `Modal` (Cancel/
  Confirm for invite or promote) is explicitly untouched — same rule applied to the Data Rights
  erase-confirmation `Modal` in the org-admin pass.

**Explicitly out of scope:**
- No design-token migration — `gray-900`/`gray-500`/`gray-200` classes, plain buttons/inputs, and
  the absence of `StatusBadge` all stay exactly as they are. Confirmed with the user.
- No sort toolbar on the two new card grids — same sequencing precedent as recruiter and
  org-admin (sort was a separate follow-up feature after the recruiter card-grid conversion).
- No new dashboard, no Recharts, no new backend endpoints.
- Recruiter console, candidate-facing pages, org-admin console, interview panel console —
  untouched.

## Design

### CardGrid conversions

Both conversions reuse the existing `CardGrid` component (`components/ui/CardGrid.tsx`) exactly
as-is. `CardGrid`'s own card chrome (`border-recruiter-border`, `text-recruiter-text-tertiary`)
is a hardcoded token class baked into the shared component — accepted as-is per the user's
"leave the grays" decision; only the *card body content* (what `renderCard` returns) uses
platform-admin's plain gray classes, matching the plain-gray text used elsewhere on these two
pages.

- **Organizations:** each card shows the organization name (bold), slug (secondary text), region
  (uppercase, secondary text), and created date. Same four columns the table showed today, in
  the same order.
- **Platform Admins:** each card shows the admin's email (bold) and created date (secondary
  text) — the table's only two columns.

### Motion polish (no structural change)

Same fade-up entrance pattern used on the recruiter dashboard's widget cards and every org-admin
settings card: wrap each existing `Card` instance in a local `motion.div` —
`initial={{ opacity: 0, y: 10 }}`, `animate={{ opacity: 1, y: 0 }}`,
`transition={{ duration: 0.3, ease: 'easeOut' }}`. No change to `components/ui/Card.tsx` itself.

- **Organizations:** the single "Create organization" `Card` — no stagger needed (one card).
- **Platform Admins:** the two side-by-side `Card`s ("Invite new admin", "Promote existing
  user") — staggered `transition.delay` of `0` and `0.05`.

### Nav polish + reduced-motion

Same three-className treatment as the recruiter and org-admin layouts: add `transition-colors
duration-150` to the two nav item links and the logout button in `(platform)/layout.tsx` (none
currently have a transition class). Additionally, wrap the layout's returned JSX tree in
`<MotionConfig reducedMotion="user">` (imported from `framer-motion`) from the start — this
closes the accessibility gap that was caught as a final-review finding on both prior consoles,
so this console ships with it correctly the first time.

## Error Handling & Fallback

No new error states — both card-grid conversions keep their existing `isLoading`/`isError`
branches and empty-message strings unchanged; `CardGrid`'s existing empty-state rendering
(`emptyMessage` prop) is reused exactly as the recruiter and org-admin conversions used it.

## Testing

- Existing page tests (`organizations/page.test.tsx`, `platform-admins/page.test.tsx`) are
  expected to need no changes, following the same text/role-based assertion pattern the prior
  conversions confirmed holds. Verify at implementation time; only touch a test file if a real
  assertion breaks (e.g. a `getByRole('table')`-style structural query with no card equivalent —
  fix the test to target the card via `.closest('.group')` — or a text-isolation issue from a
  combined text node — fix the markup to re-isolate the value, per this project's established
  convention from the org-admin Integrations fix).
- No new tests required for the motion-only cards (matches existing precedent — no
  motion-specific tests anywhere in the codebase).
- Live browser verification pass for all affected surfaces (nav, Organizations, Platform Admins)
  once implemented, logged in as `super@platform.test` / `DevSuper123!`.
