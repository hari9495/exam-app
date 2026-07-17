# Org Admin Console Redesign — Design Spec

## Context & Scope

The Org Admin Console (`apps/web/app/(org-admin)/`: Staff Users, Audit Log, Candidate Data Rights, Org Settings/Branding + shared shell) is functionally complete but visually untouched by either of the two prior redesign passes (candidate exam flow, recruiter console). It runs a separate, independently hand-rolled shell (`apps/web/app/(org-admin)/layout.tsx`) that duplicates the recruiter shell's auth/branding logic but with the pre-redesign look: `bg-gray-50` sidebar, no icons, plain-text nav labels, a filled `bg-primary text-white` active state (not the recruiter shell's left-border-accent + tinted-background treatment), no org logo/name header text, no user footer. All 4 screens use raw Tailwind grays (`text-gray-500`, `text-red-600`, etc.), no `recruiter.*`/`status.*` tokens, no `StatusBadge`, no `lucide-react` icons — confirmed via grep that zero usages of any recruiter-console-redesign primitive exist anywhere in `(org-admin)`.

**In scope**: shell (sidebar nav + org branding + user menu) and all 4 screens — Staff Users, Audit Log, Candidate Data Rights, Org Settings/Branding. Two non-visual issues found during the audit are also in scope (see "Behavioral Fixes" below).

**Out of scope**: everything outside `(org-admin)` — no changes to `(recruiter)`, `(panel)`, `(candidate)`, or the backend beyond what "Behavioral Fixes" requires (none — see Data & Backend Requirements).

## Visual Direction

Match the recruiter console's shell and dense-table pattern exactly — no new tokens, no new primitives, no distinct "admin" visual identity. This was a deliberate choice, confirmed with the user: org-admin becomes a direct visual sibling of the recruiter console rather than inventing a second design language, and it's the cheapest path since it's pure component/token reuse from work already shipped.

**Palette/tokens**: `recruiter.*` (neutrals: border/text tiers/subtle background) and `status.*` (badge tones: success/warning/danger/neutral/info/purple) — both already defined in `apps/web/tailwind.config.ts`, unchanged by this spec.

**Icons**: `lucide-react`, already a dependency. New icon usages for this spec's nav items: `Users` (Staff Users), `History` (Audit Log), `ShieldCheck` (Candidate Data Rights), `Settings` (Org Settings/Branding).

**Elevation & shape**: identical to the recruiter console — `rounded-lg` (cards/tables), `rounded-md` (buttons/inputs), `rounded-full` (badges), `border` + `shadow-sm` on containers.

## Component Strategy

Continue extending `apps/web/components/ui/*` in place — no new primitives are needed for this spec. Every element required (dense `Table`, `StatusBadge`, `Card`, `Input`, `Button`, `Modal`) already exists from the candidate-flow and recruiter-console passes. This is the payoff the recruiter console's Component Strategy section predicted: primitives built for one console compound into the next for free.

## Screen-by-Screen Design

### 1. Shell

Direct port of `(recruiter)/layout.tsx`'s structure onto `(org-admin)`'s own nav items and `org_admin`-role gate (unchanged auth/redirect logic — only the visual shell changes): org logo-badge + org name header row, 4 icon+label nav items (Staff Users / Audit Log / Candidate Data Rights / Org Settings), brand-accent left-border + `color-mix()`-tinted active state, user avatar/name/role footer. The two shells remain separate files/components (different nav items, different role gate) — this is a copy-and-adapt, not a shared-component extraction, matching how `(recruiter)/layout.tsx` and `(org-admin)/layout.tsx` were already two independent files before this redesign.

### 2. Staff Users

Dense table: search box (name/email, case-insensitive) above a `Table` with columns Email, Role (`StatusBadge`), Status (`StatusBadge`), Last login (relative or formatted date, em-dash if never logged in). Role tone mapping: `purple` for `org_admin`, `info` for `recruiter`, `neutral` for `panel` (the three roles this screen's inline add-form already offers). Status tone mapping is confirmed during planning once the real `StaffUser.status` enum values are read from `apps/api/src/users/`. The inline "add staff" form (email/password/role) stays an always-visible form above the table, not a modal — restyled onto `recruiter.*` tokens, no functional change.

### 3. Audit Log

Dense table: the existing 5-field filter row (actor ID, action, entity type, from/to date) restyled as inline filter inputs above the table, matching the search/filter-row convention from the recruiter console's list pages. Table columns: Action (`StatusBadge`, tone mapped by verb suffix — `success` for `*.published`/`*.created`, `danger` for `*.erased`/`*.revoked`/`*.archived`, `neutral` default for anything else), Entity Type, Actor (email or "System" if `actorUserId` is null), Timestamp. The existing manual "Load more" cursor-pagination button is kept functionally as-is (no infinite-scroll/virtualization work in this pass) — restyled only.

### 4. Candidate Data Rights

Lookup-by-email form restyled onto tokens. Result `Card`(s) — candidate profile, export section (invitations/attempts listing), erase section — restyled onto tokens, same structural layout (no new sections added). The erase flow's confirmation gains one new step: a text `Input` where the admin must type the candidate's exact email before the destructive "Erase" `Button` (still `variant="danger"`, still inside the existing `Modal`) becomes enabled. This directly addresses the audit's finding that an irreversible GDPR-erasure action was gated by only a generic confirm-modal with no typed acknowledgment.

### 5. Org Settings/Branding

Form `Card` (color pickers for primary/accent, logo file upload) restyled onto tokens. The raw `<input type="file">` (currently unstyled, with only a plain-text label) gets the same visual treatment as the rest of the form's inputs — border/radius/focus-state consistency, still a native file input (no custom drag-and-drop widget; that would be new scope, not a token pass). The screen's data-fetching moves off its current ad-hoc `apiFetch`-in-component pattern (the only one of the 4 screens not using a `lib/hooks/*` query hook) onto React Query: the existing `useBranding(organizationSlug)` read hook stays, and a new `useUpdateBranding()` mutation hook is added (`PATCH /organizations/branding`, invalidating the `useBranding` query key on success), matching the pattern every other screen in both consoles already follows.

## Behavioral Fixes

Two non-visual issues surfaced during the audit, both explicitly confirmed in scope by the user (not silently absorbed scope creep):

1. **Settings/Branding's data-fetch pattern** — currently bypasses React Query entirely (raw `apiFetch` calls + local `useState`, no caching/shared invalidation). Fixed via the new `useUpdateBranding()` hook described above. No backend change — the endpoint already exists.
2. **Candidate-erase typed confirmation** — described above under screen 4. No backend change — this is purely a frontend gate on when the existing "Erase" button becomes clickable; the backend `POST /candidates/:id/erase` endpoint's behavior is unchanged.

## Data & Backend Requirements

**None.** Every screen's data already comes from existing endpoints with shapes that already support this redesign:
- Staff Users: `GET /users` (`org:view`), `POST /users` (`org:manage_users`)
- Audit Log: `GET /audit-logs` (`audit:view`)
- Candidate Data Rights: `GET /candidates/lookup`, `GET /candidates/:id/export`, `POST /candidates/:id/erase` (all `candidate:data_rights`)
- Org Settings/Branding: `GET`/`PATCH /organizations/branding`

No new fields, no new aggregation, no new endpoints — this is the smallest of the three console redesigns by backend footprint (the recruiter console needed 3 new/extended endpoints; this needs zero).

## Error & Empty States

Same conventions as the recruiter console: tables use a consistent empty state (centered message, no per-page bespoke copy), loading states avoid layout jump. No new error-handling patterns beyond what `components/ui` already does for network failures.

## Testing Approach

Existing per-screen test files (`apps/web/app/(org-admin)/**/*.test.tsx`) get updated in place for the new markup/tokens, same convention as every prior redesign task in this codebase. Two genuinely new behaviors need real (not just visual) test coverage: the typed-confirmation erase flow (assert the Erase button stays disabled until the typed value matches the candidate's email, and fires the existing erase mutation once enabled and clicked) and the new `useUpdateBranding()` hook (assert the mutation call shape and that it invalidates/refetches `useBranding`'s query key on success).
