# Login Page Redesign — Design Spec

## Context & Scope

The platform has exactly one login page, `apps/web/app/login/page.tsx`, shared by the recruiter, org-admin, and panel consoles (candidates authenticate via invite links and never see it). It predates the recruiter/org-admin console redesigns and was never touched: a plain `bg-gray-50` page background, a bare white `Card`, a generic "Staff Login" heading, no icons, no visual hierarchy. It already fetches org branding live as the org slug is typed (`useBranding(organizationSlug || null)`) but does nothing visually interesting with it beyond a logo `<img>` and a heading color. Compared to the polished sidebars/tokens now behind it on every console, it reads as an unfinished, generic form.

**In scope**: `apps/web/app/login/page.tsx` and its test, plus two small additive props on shared primitives (`Input`'s optional `icon`, `Button`'s optional `loading`).

**Out of scope**: auth logic, the `/auth/staff/login` endpoint, redirect-by-role logic, candidate authentication (no login page exists for candidates — invite-link only, unaffected by this spec), any other page.

## Visual Direction

Split-screen layout, collapsing to a single column on mobile:

- **Left panel** (`hidden md:flex` — hidden below the `md:` breakpoint, full column at `md:` and up): a full-height gradient panel built from the existing `--color-primary`/`--color-accent` CSS variables — defaults to `#1a73e8` → `#fbbc04` when no org is resolved yet, and swaps live to the org's own `primaryColor`/`accentColor` once `useBranding` resolves a match for the typed slug. Shows the org's `logoUrl` if present; otherwise a plain wordmark reading "Examination Platform" (no invented brand name) plus a short static tagline. A subtle decorative pattern — soft translucent circles via CSS `radial-gradient`/`box-shadow`, no image asset — keeps the panel from reading as a flat color block.
- **Right panel**: white background, the login form vertically centered, `max-w-sm`, generous spacing (replacing today's boxed `Card` — the split-screen itself provides the framing now).
- **Mobile** (below `md:`): left panel collapses to a compact top banner (org/platform wordmark + logo only, no decorative pattern, fixed height) above the form, so mobile users reach the fields without scrolling past a full-height panel.

## Component Changes

- `Input.tsx` gains an optional `icon?: ReactNode` prop, rendered inside the field's left padding (`pl-9` when present, unchanged otherwise). Backward compatible — every existing call site omits it and renders exactly as today.
- `Button.tsx` gains an optional `loading?: boolean` prop: when true, renders a small spinner before the label and forces `disabled`. Backward compatible — omitted everywhere else, renders exactly as today.
- Password field adds a show/hide toggle: an icon button (`Eye`/`EyeOff` from `lucide-react`, already a dependency) inside the field, flipping the input's `type` between `password` and `text`. Local component state, no new primitive.
- Login form fields use `Building2` (org slug), `Mail` (email), `Lock` (password) icons via the new `Input` `icon` prop.
- Submit button uses the new `Button` `loading` prop while the request is in flight.
- Error display changes from a plain `text-red-600` line to a small icon+text banner (`AlertCircle` icon, `status.danger`-toned background strip) — matching the tone-badge visual language already used across the redesigned consoles.

## Behavior — Unchanged

Same `apiFetch('/auth/staff/login', ...)` call, same role-based redirect (`org_admin` → `/users`, `panel` → `/reports`, else `/dashboard`), same `useBranding(organizationSlug || null)` live-lookup driving the left panel's branding swap. This is a visual/UX pass only; no auth logic, validation rules, or API contract changes.

## Error & Loading States

- **Submitting**: submit button shows its `loading` spinner and is disabled; fields remain editable (matches existing behavior — no new field-locking).
- **Login failure**: existing `catch` block's `err.message` renders in the new icon+banner style instead of a plain red line; content and triggering logic unchanged.
- **No org slug yet**: left panel shows the default platform-identity gradient (never a loading spinner) — `useBranding(null)` today already no-ops until a slug exists, so there's no new empty/loading state to design.

## Testing Approach

- `page.test.tsx` updated in place for the new markup: same assertions on submit call shape, redirect-by-role, and error-message display, re-queried against the new structure (icon+banner error, split-screen regions).
- New test: clicking the password field's visibility toggle flips its `type` from `password` to `text` and back.
- `Input.test.tsx` / `Button.test.tsx` each get one new case covering the added `icon` / `loading` prop; all existing cases stay unchanged since both props are optional and additive.

## Out of Scope / Explicitly Deferred

- No "forgot password" flow — doesn't exist today, not introduced here.
- No "remember me" — not requested, no session-duration change.
- No new backend fields or endpoints — `useBranding`'s existing shape (`logoUrl`, `primaryColor`, `accentColor`) is sufficient for the left panel.
