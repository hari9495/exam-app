# Super Admin Creation & Promotion — Design

## Problem

The just-shipped Organization & Admin Account Bootstrap feature (`docs/superpowers/specs/2026-07-18-account-bootstrap-design.md`) closed the gap for onboarding new tenant organizations, but explicitly scoped `super_admin` creation out:

> "Creating additional super_admin accounts via API (still seed-script-only — a platform has few of these, and adding self-service creation of the most privileged role is a materially different, higher-stakes decision than onboarding a tenant org)."

That gap is still real: today the only way any `super_admin` account gets created is by running `apps/api/prisma/seed.ts` directly against the database, or hand-inserting a row. There is no API endpoint and no UI for it — not even for an existing `super_admin`. Deploying to a fresh environment or adding a second platform admin both require out-of-band database access.

## Scope

Add two additive capabilities, both `super_admin`-only: **invite a brand-new `super_admin`** by email, and **promote an existing staff user** (`org_admin`/`recruiter`/`panel`) to `super_admin`. No demotion/removal, and no cross-org user browsing — both explicitly deferred (see Out of scope).

## Backend

Both new endpoints live on the existing `UsersController`/`UsersService`, gated by the existing `platform:manage_organizations` permission (already held only by `super_admin` — no new permission is introduced).

**`GET /users/super-admins`** — lists all `super_admin` users (`{id, email, createdAt}`, ordered by `createdAt` desc). Queried through `TenantPrismaService.forTenant({ organizationId: null, isSuperAdmin: true }, ...)` filtering `role: 'super_admin'`, the same super-admin-bypass idiom used throughout this codebase for queries with no pre-existing tenant session to scope to.

**`POST /users/super-admins/invite`** — body `{ email: string }` (`@IsEmail()`). Sequence:
1. Reject if a user with this email already exists under `organizationId: null` (409 Conflict) — the DB's `(organizationId, email)` unique index would also catch this, but a typed 409 beats a raw constraint error.
2. Create the `User` row: `organizationId: null, role: 'super_admin'`, password = `argon2.hash(randomBytes(32).toString('hex'))` (locked, unguessable, nobody — including the inviting `super_admin` — ever sees it). Routed through the same `forTenant({ organizationId: null, isSuperAdmin: true }, ...)` bypass.
3. In the same transaction, create a `PasswordResetToken` for the new user, reusing the existing model and 15-minute `PASSWORD_RESET_EXPIRY_MINUTES` policy verbatim (no new token type or expiry constant).
4. Fire-and-forget a welcome email to the given address, pointing at `${FRONTEND_URL}/reset-password/${rawToken}` — the exact same page the Forgot Password and org-admin-onboarding flows already use. No new frontend page needed for activation.
5. Record an `admin.invited` audit event (`entityType: 'user'`, `entityId: newUser.id`) via the existing `AuditService`.

**`POST /users/super-admins/promote`** — body `{ email: string }` (`@IsEmail()`). Sequence:
1. Look up a user by email across all orgs via the `forTenant({ organizationId: null, isSuperAdmin: true }, ...)` bypass (a plain `prisma.user.findFirst` would be blocked by the RLS filter predicate on `dbo.users` outside a super-admin session context). 404 if no user with that email exists anywhere.
2. 409 Conflict if the found user's `role` is already `super_admin`.
3. Update that user's row: `organizationId: null, role: 'super_admin'`. This does **not** touch `passwordHash` — the user keeps logging in with their existing password, just with elevated, org-less access from their next login onward. Their old `organizationId` and whatever org-scoped data belonged to them (their old role, org membership) is simply gone from their user row; this is treated as an accepted, intentional consequence of promotion, not a bug to work around.
4. Fire-and-forget a plain notification email to the user's address ("Your account now has platform administrator access") — no token, no link, no action required. Reuses `EmailService`'s existing send capability; no new email template infrastructure beyond one more static message.
5. Record an `admin.promoted` audit event (`entityType: 'user'`, `entityId: user.id`) via `AuditService`.

**Accepted edge case:** if step 3/4 of `invite` fails after step 2 succeeds (e.g. a transient DB error on the token write), the new `super_admin` user exists but got no reset token — an account that's created but not yet activatable by its owner. Not rolled back automatically, mirroring the identical accepted risk already documented for org-admin onboarding in the account-bootstrap spec. A `super_admin` would need to notice (via the `GET /users/super-admins` list showing an account with no successful login) and manually intervene. Not worth building distributed-transaction rollback for a rare, low-volume, `super_admin`-only action.

## Frontend

**New page**, `apps/web/app/(platform)/platform-admins/page.tsx`, using the same design-system primitives (`Input`/`Button`/`Table`/`Card`, `useToast`) as the existing `organizations/page.tsx`:
- A table listing current super_admins: email, created date.
- Two email-input forms: "Invite new admin" and "Promote existing user by email." Each submit triggers a confirm dialog ("Grant super_admin access to `<email>`? This cannot be undone from this screen.") before the mutation fires, given the stakes of the action.

**Nav link**: `apps/web/app/(platform)/layout.tsx` currently has a bare header with just a logout button and no navigation. Add a simple two-link nav ("Organizations" / "Platform Admins") to that header so both pages are reachable without typing a URL.

**New hooks**, `apps/web/lib/hooks/useSuperAdmins.ts`, matching the existing `useOrganizations.ts` pattern:
- `useSuperAdmins()` — `GET /users/super-admins`.
- `useInviteSuperAdmin()` — `POST /users/super-admins/invite`, invalidates the list on success.
- `usePromoteSuperAdmin()` — `POST /users/super-admins/promote`, invalidates the list on success.

## Out of scope

- Demoting or removing a `super_admin` (including any "last super_admin" guard) — a separate, higher-stakes design, same reasoning that split this feature out of account bootstrap in the first place.
- Browsing or searching all users across every org — promotion is by exact email only, no user picker/table.
- Any change to how the very first `super_admin` gets created on a fresh environment — `apps/api/prisma/seed.ts` remains the bootstrap mechanism for a brand-new deployment with zero existing `super_admin` rows. This feature only helps once at least one `super_admin` already exists to invite/promote through it.
- Re-granting org access to a user after they've been promoted away from their org (not supported; would require a separate "assign to org" flow that doesn't exist today for any role).
