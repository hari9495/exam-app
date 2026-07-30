# Staff Users Admin Console (Salesforce-style) — Design

**Date:** 2026-07-31
**Status:** Approved design, pending implementation plan
**Area:** `apps/web` (`/users` page), `apps/api` (`users`, `auth` modules)

## Summary

Replace the current minimal Staff Users screen (inline add-form + card grid) with a
Salesforce-Users-style admin console: a sortable/filterable columnar table, per-row
actions (Edit, Login-as, Deactivate/Reactivate, Reset password), a "New User" modal with
single and bulk-paste tabs, and full-session-takeover impersonation with a return path.

The page already serves both `org_admin` (their own org) and `super_admin` (any org, via
the unified nav shipped 2026-07-30). All new actions are role-gated in the UI **and**
re-authorized server-side.

## Goals

- A columnar table for staff users, sortable per column, filterable by role and status,
  searchable by name/email.
- Manage existing staff: change role/name, deactivate/reactivate, trigger a password reset.
- "Login as" full session takeover with a persistent return-to-admin banner and audit trail.
- Add users one at a time (email + role + password-or-reset-link) or in bulk (paste emails +
  one role → each emailed a set-password link).

## Non-goals (explicitly dropped)

- Salesforce columns with no meaning here: **Alias, Profile, User Type, Record ID**
  (Role already is the "profile").
- **Saved custom list views / "Create New View"** — built-in role/status filters + sort cover
  the real need. No persisted view storage, no view-builder.
- Hard-deleting staff users. Deactivation is the off-switch; delete stays out of scope.
- Nested impersonation (impersonating while already impersonating).

## Current state

- **Page:** `apps/web/app/(org-admin)/users/page.tsx` — inline `<form>` (email/password/role) +
  search `<Input>` + `CardGrid`, backed by `useUsers` / `useCreateUser`
  (`apps/web/lib/hooks/useUsers.ts`).
- **Type:** `StaffUser { id, organizationId, email, name, role, status, lastLoginAt, createdAt }`
  (`apps/web/lib/types.ts`). `status` is an unconstrained string; only `'active'` exists today.
- **API:** `apps/api/src/users/users.controller.ts` exposes `POST /users` (create),
  `GET /users` (paginated + search), plus super-admin endpoints. **No** per-user edit /
  deactivate / reset / impersonate endpoint exists yet.
- **Existing infra to reuse:**
  - `AuthService.switchIntoOrg` / `signAccessToken` — the super_admin org-switch token model
    (short-lived, access-only, restored on return via the normal refresh cookie).
  - `OrganizationsService.create` → `dispatchWelcomeEmail` — the reset-token + email pattern
    (`PasswordResetToken` model, `EmailService`, `/reset-password/:token` link).
  - `AuditService.record(context, { actorUserId, action, entityType, entityId })`.
  - `TenantPrismaService.forTenant({ organizationId, isSuperAdmin }, tx => ...)` super-admin bypass.
  - `argon2` for password hashing.
  - UI: `Pagination`, `StatusBadge`, `Select`, `Input`, `Button`, `useToast`.

## Data model

- **`User.status`** — keep the existing column; formalize the two values used by this feature:
  `'active'` and `'deactivated'`. No enum/check constraint change required (stays a string),
  but code treats these as the closed set for staff. No migration needed unless we want a
  default; existing rows are already `'active'`.
- No new tables. Impersonation is stateless (encoded in the JWT); reset reuses
  `PasswordResetToken`.

## API — new endpoints (all under `/users`, JWT-guarded, RLS/tenant-scoped)

### `PATCH /users/:id`
Update a staff user's `role` and/or `name`.
- Auth: `org_admin` (own org, target is recruiter/panel/org_admin in-org) or `super_admin` (any).
- Guard: cannot change a `super_admin`'s role via this endpoint; cannot escalate a user to
  `super_admin` here (platform-user creation stays separate).
- Audit: `user.updated`.

### `POST /users/:id/deactivate` and `POST /users/:id/reactivate`
Flip `status` between `active` and `deactivated`.
- Auth: same matrix as PATCH. Cannot deactivate yourself; cannot deactivate a `super_admin`.
- **Login-path change (net-new):** `AuthService` credential validation must reject a user
  whose `status !== 'active'` with a clear "account deactivated" error — for both password and
  SSO login. This is the one change that touches the live login path.
- Audit: `user.deactivated` / `user.reactivated`.

### `POST /users/:id/reset-password`
Issue a `PasswordResetToken` for the target and email them the `/reset-password/:token` link
(reuses the `OrganizationsService` welcome/reset email pattern). Does not set or return a password.
- Auth: same matrix as PATCH.
- Audit: `user.password_reset_requested`.

### `POST /users/:id/impersonate`  → "Login as"
Return a short-lived **access-only** token that logs the caller in *as* the target user.
- Token payload: `{ sub: targetUserId, organizationId: targetOrgId, role: targetRole,
  impersonatorUserId, impersonatorRole }` signed via `signAccessToken` (same TTL as org-switch).
- **Authorization (server-enforced):**
  - `super_admin` → any **non-super_admin** target, any org.
  - `org_admin` → **recruiter / panel** targets **in their own org only** (never another
    org_admin, never a super_admin).
  - Never self; target must be `active`; caller must not already be impersonating (no nesting —
    reject if the caller's token carries `impersonatorUserId`).
- The caller's real session (httpOnly refresh cookie / token family) is left intact, so
  **return-to-admin** = the existing refresh call, which reissues the admin's own token.
- Audit: `user.impersonate_start` (on issue) and `user.impersonate_stop` (on return, mirroring
  `recordSwitchOut`).

### `POST /users/bulk`
Create multiple staff users from a pasted email list + one role. Each user is created with a
random password hash and emailed a set-password link (no password handling). Duplicates
(existing email in the org) are skipped, not errored.
- Request: `{ emails: string[], role: string }`.
- Response: `{ created: [...], skipped: [{ email, reason }] }` for a per-row summary.
- Auth: `org_admin` (own org) / `super_admin`. Bulk cannot create `super_admin`s.
- Audit: one `user.created` per created user (same action the single-create path already records),
  so the audit log reads uniformly regardless of how a user was added.

## JWT / guard changes

- `signAccessToken` payload type gains optional `impersonatorUserId?` / `impersonatorRole?`.
- `JwtStrategy.validate` surfaces `impersonatorUserId` on the request user so guards/controllers
  can (a) block nested impersonation and (b) let the frontend render the banner.
- Permission behavior while impersonating: the caller has the **target's** role and org, so they
  see exactly what that user sees. `actingSuperAdmin` is NOT set during impersonation (that flag
  is for org-switch, which is a different mode).

## Frontend

Rework `apps/web/app/(org-admin)/users/page.tsx`:

- **Table** (new `StaffUsersTable` component): columns Full Name, Email, Role, Status, Last Login,
  Created, Actions. Client-side sort on the current page; role + status filter dropdowns and the
  existing search feed the `useUsers` query. Keep `Pagination`.
- **Row actions:** an Edit inline/modal (role + name), a `⋯` menu (Deactivate/Reactivate, Reset
  password), and a **Login as** button — each rendered only when the current user is authorized
  for that target (mirrors the server matrix; server is the real gate).
- **New User modal:** tabs — *Single* (email + role + password-or-"send reset link") and
  *Multiple* (paste emails + role → summary of created/skipped).
- **Impersonation banner:** a persistent top bar ("You are logged in as {email} — Return to
  admin") shown whenever the session token carries `impersonatorUserId`; "Return" calls refresh
  and records `impersonate_stop`.
- New hooks in `useUsers.ts`: `useUpdateUser`, `useDeactivateUser`/`useReactivateUser`,
  `useResetUserPassword`, `useImpersonateUser`, `useBulkCreateUsers` — all invalidate `['users']`.

## Security considerations

- Impersonation is the highest-risk surface: authorization is re-checked on the server for every
  action, not trusted from the UI. Every start/stop is audited with actor + target.
- Deactivated users are rejected at login (password and SSO) — deactivation is a real lockout,
  not just a UI flag.
- Bulk and single creation never let a caller mint a `super_admin` (that path stays the separate
  platform-user provisioning).
- No password ever crosses the wire for reset or bulk — only emailed set-password links.

## Testing

- **API unit tests** for the authorization matrix of PATCH / deactivate / reactivate / reset /
  impersonate / bulk (esp. org_admin cannot touch out-of-org or admin/super_admin targets;
  no self-impersonation; no nested impersonation; deactivated-login rejection for both password
  and SSO).
- **Frontend tests** for table render + role/status filtering + sort, the New User modal (single
  + bulk summary), and the impersonation banner appearing/clearing from the token claim.

## Rollout / deployment

⚠️ This is net-new backend plus a **live-login-path change** (deactivated-user rejection),
landing the day before the Saturday ~1000-candidate exam. **Build and review now; do NOT deploy
to production until after Saturday.** The exam runs on the current, proven login path. Ship this
in the first post-exam deploy window, with the standard web standalone `.next/static`/`public`
copy step and `api` restart.

## Open questions

None — scope decided during brainstorming (full parity, minus saved views and the meaningless
Salesforce columns; impersonation = full takeover with super_admin→anyone / org_admin→own-org
recruiter+panel; bulk = paste emails → reset links).
