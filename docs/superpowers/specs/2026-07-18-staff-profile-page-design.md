# Staff "My Profile" Page — Design

## Problem

No staff user (recruiter, org_admin, panel) can view or edit their own account details today. There is no `/profile`, `/account`, or equivalent route anywhere in `apps/web`. The org-admin Settings page only edits org-wide branding (logo/colors), not personal info. The only password-touching flow is forgot/reset-password, which only works while logged **out** — there is no way to change your password from an active session.

This is compounded by a real, already-flagged gap: the `User` model has no display-name field, so every staff layout's sidebar footer (recruiter/org-admin/panel) currently renders a hardcoded per-role fallback string ("Recruiter"/"Org Admin"/"Panel") instead of the user's actual name, called out with `ponytail:` comments in each layout file.

## Scope

Add a self-service profile page reachable from all three staff shells (recruiter, org-admin, panel), letting a logged-in user view their account and:
- Edit their display name.
- Change their password (with current-password re-entry).

Email, role, and organization are shown but not editable in this version.

## Data model

Add `name` to the `User` model (`apps/api/prisma/schema.prisma`): nullable `String`, no default, no backfill. Existing rows get `NULL`. A new hand-written migration adds the column (matching this repo's existing migration convention — no shadow-DB-dependent `prisma migrate dev`).

Once populated, `name` also fixes the sidebar's hardcoded-fallback footgun: the frontend fallback logic changes from "always hardcoded" to "hardcoded only when `name` is `null`" — a real fix that falls out of this feature rather than separate scope.

## Backend API

Three new endpoints on the existing `UsersController` (`apps/api/src/users/`), all behind `JwtAuthGuard` only — no `PermissionsGuard`/permission key, since every role manages only their own account, not anyone else's:

- **`GET /users/me`** → `{ id, name, email, role }` for the authenticated user (`req.user.sub` from the JWT payload). Read-only, org-scoped through `TenantPrismaService` the same way every other `users` read/write in this codebase must be (RLS is secure-by-default on this table — see the Forgot Password feature's RLS bug fix for why this is non-negotiable).
- **`PATCH /users/me`** → body `{ name: string }` (via a new `UpdateProfileDto`, `@IsString() @IsNotEmpty() @MaxLength(200)`). Updates `name` only. The email, role, and organizationId fields are never accepted from this body — they are server-controlled and cannot be changed via this endpoint.
- **`POST /users/me/change-password`** → body `{ currentPassword: string, newPassword: string }` (`ChangePasswordDto`, `newPassword` reuses the existing `@MinLength(8)` policy from `ResetPasswordDto`). Flow:
  1. Look up the caller's `passwordHash`, verify `currentPassword` against it via `argon2.verify`. Throw `UnauthorizedException` (401) if it doesn't match.
  2. `argon2.hash(newPassword)`, update `passwordHash`.
  3. Revoke all *other* active sessions: read the caller's own `refresh_token` httpOnly cookie from the request (same cookie `auth.controller.ts` already reads for `/auth/refresh` and `/auth/logout`), `jwt.verify` it to get its `familyId`, then `RefreshToken.updateMany({ where: { userId, revokedAt: null, familyId: { not: myFamilyId } }, data: { revokedAt: new Date() } })`. This mirrors the forgot-password reset flow's session-revocation pattern, but scoped to leave the *current* session alone — this is a voluntary in-session change, not an account-recovery event, so the user making the request shouldn't be logged out by their own action.
  4. Record an audit event (`password.changed`, matching the existing `password.reset` action naming from the forgot-password feature).

All three routes go through `TenantPrismaService.forTenant(...)` for any `users`/`refresh_tokens` writes, following the established pattern from the RLS bug fix.

## Frontend

**A shared data hook, feeding both the sidebar and the page.** A new `useCurrentUser(accessToken)` hook (`apps/web/lib/hooks/useCurrentUser.ts`), matching the existing `useBranding(organizationSlug)` pattern (same React Query shape), wraps `GET /users/me`. Two consumers:
1. All three sidebar footers (recruiter/org-admin/panel) call it to render the real name in place of the hardcoded fallback — falling back to the existing per-role hardcoded string only when `name` is `null`, not unconditionally.
2. `<ProfileForm>` calls the same hook instead of issuing its own separate fetch, so there is exactly one code path that knows how to load "the current user," not two.

**Shared component, three thin pages.** Next.js route groups can't have two groups resolve the same literal URL, so this is one real `<ProfileForm>` component (new file, e.g. `apps/web/components/ProfileForm.tsx`) imported by three near-empty page files:
- `apps/web/app/(recruiter)/profile/page.tsx`
- `apps/web/app/(org-admin)/profile/page.tsx`
- `apps/web/app/(panel)/profile/page.tsx`

Each page file's only job is to exist inside the right route group so the correct sidebar renders around the shared form — no duplicated form logic.

**`<ProfileForm>` contents:**
- Reads from `useCurrentUser()`.
- Read-only fields: Email, Role, Organization (organization shown via the existing `organizationSlug` already in `useAuth()` — no new lookup needed).
- Editable "Display name" field + Save button → `PATCH /users/me`.
- Separate "Change password" sub-form: Current password / New password / Confirm new password fields (reusing the same show/hide toggle pattern and `@MinLength(8)` policy already established in the reset-password page) → `POST /users/me/change-password`. On success, show a confirmation message inline (no redirect — the current session stays valid).

Uses the existing `Input`/`Button` design-system primitives, consistent with every other staff-facing form in this codebase.

## Sidebar entry point

The sidebar footer's avatar+name block — currently an inert `<div>` in all three layouts, sitting next to the just-shipped logout button — becomes a `<Link href="/profile">` wrapping the avatar+name (not the logout button, which stays a separate sibling control). Each layout calls the new `useCurrentUser()` hook (see Frontend section) to render the real name, falling back to the existing hardcoded per-role string only while `name` is `null` or still loading.

## Security notes

- Current-password re-entry on change-password blocks a hijacked-but-still-unlocked session from permanently taking over the account by just setting a new password.
- No enumeration concern here (unlike forgot-password): every route requires a valid JWT for an already-known user, not an anonymous lookup.
- Session revocation on password change explicitly excludes the requester's own session (contrast with forgot-password's reset flow, which revokes *everything* including the session that just authenticated via the reset token, since that flow is a recovery path with no "current session" to preserve).

## Out of scope

- Email editing (would need its own re-verification flow — separate feature if ever needed).
- Avatar/photo upload.
- Deleting one's own account.
- Widening this page to org-admin's Staff Users list (managing *other* users) — that already exists and is untouched.
