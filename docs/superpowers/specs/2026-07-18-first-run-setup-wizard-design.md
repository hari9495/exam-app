# First-Run Setup Wizard — Design

## Problem

The just-shipped Super Admin Creation & Promotion feature (`docs/superpowers/specs/2026-07-18-super-admin-management-design.md`) lets an *existing* `super_admin` invite or promote another one — but it explicitly cannot help with the very first `super_admin` on a brand-new deployment, since there's nobody logged in yet to do the inviting. Today that first account can only be created by hand-editing `apps/api/prisma/seed.ts`, which hardcodes credentials (`super@platform.test` / `DevSuper123!`, apps/api/prisma/seed.ts:74,80,85-90) directly in source control. That's fine for local development — it's a dev fixture, not meant for anything else — but it means standing up a real deployment requires someone to remember to edit that script correctly before running it, and if it's ever run as-is against a real environment it creates a `super_admin` account with a publicly-known password.

Note what this feature is **not**: it has nothing to do with customer onboarding. `super_admin` is the platform-operator role — the team running this SaaS, not any customer company. A new customer's first admin (`org_admin`) is already fully handled, non-technically, by the existing Account Bootstrap feature (welcome email → password-reset link, no backend access needed). This feature closes the one remaining gap: bootstrapping the *first-ever* `super_admin`, once, per environment, for whoever deploys the platform.

## Scope

A first-run setup wizard, modeled on the pattern WordPress/Ghost/Discourse use: an unauthenticated web page and two backend endpoints that only function while zero `super_admin` accounts exist anywhere in the database, protected by a random token that's only visible to someone with access to the server's console logs at boot time. The instant the first `super_admin` is created through it, the wizard permanently stops working — it can never be used to create a second one.

`apps/api/prisma/seed.ts` is untouched. It remains the local-dev convenience script it already is (hardcoded demo org, demo `super_admin`, demo `org_admin`/`recruiter`). Since seeding already creates a `super_admin`, the wizard simply never activates in a seeded dev environment — no conflict, no coordination needed between the two.

## Backend

**New Prisma model, `SetupToken`** — same shape as the existing `PasswordResetToken`: `{id, tokenHash, createdAt, expiresAt}`. No RLS policy applied (consistent with `PasswordResetToken`/`Organization` — this table holds no tenant data).

**Boot-time generation.** A new `SetupService`, wired via `onModuleInit()`, runs once at server startup:
1. Check whether any `super_admin` exists, via `TenantPrismaService.forTenant({organizationId: null, isSuperAdmin: true}, tx => tx.user.count({where: {role: 'super_admin'}}))`. This bypass is required, not optional: `dbo.users` carries a row-level-security filter predicate, and a plain unscoped query would silently see zero rows regardless of the table's real contents — which would make the wizard falsely believe setup is always needed, even after a real `super_admin` exists.
2. If the count is zero: generate a random token (`randomBytes(32).toString('hex')`), delete any existing `SetupToken` rows, create a new one holding a SHA-256 hash of the token with a 24-hour expiry (`SETUP_TOKEN_EXPIRY_HOURS = 24`, a local constant following this codebase's existing per-service-constant convention), and log the raw token to the console at `warn` level so it stands out.
3. Every server restart while setup is still pending regenerates the token, invalidating whatever was printed on the previous boot. The operator must use the token from the *most recent* boot's logs.

**Two new public endpoints**, on a new `SetupController`/`SetupModule` — deliberately **not** behind `JwtAuthGuard`, the one intentional exception to this codebase's "everything requires authentication" rule, because nothing can be authenticated before the first account exists. The token itself is the authentication.

- **`GET /setup/status`** → `{needsSetup: boolean}`, using the same RLS-safe bypass count from step 1. The frontend polls this once on page load to decide whether to show the form or redirect away.
- **`POST /setup/complete`** — body `{token: string, email: string, password: string}` (`@IsString`, `@IsEmail`, `@MinLength(8)` matching `CreateUserDto`'s existing password rule). Sequence:
  1. Re-check the zero-`super_admin` condition via the same bypass, at write time — closing the race window between two people (or two tabs) submitting concurrently, rather than trusting the boot-time snapshot.
  2. Look up the live `SetupToken` row (plain `prisma`, no bypass needed), reject with 401 if none exists, it's expired, or its hash doesn't match the submitted token.
  3. Create the `User` (`organizationId: null, role: 'super_admin'`, `argon2.hash(password)`) via the same `forTenant({organizationId: null, isSuperAdmin: true}, ...)` bypass `OrganizationsService.create()` already uses for writing a brand-new account with no pre-existing session to scope to.
  4. Delete the `SetupToken` row — single-use, so even a leaked raw token can't be replayed after success.
  5. Record an audit event (`user.setup_wizard_completed`, `entityType: 'user'`, `actorUserId`: the new user's own id — there is no other actor at this point).
  6. Return `{success: true}`. No session/JWT is issued here — the operator logs in through the existing `/login` page afterward, keeping this endpoint's blast radius small and avoiding duplicating login logic.

## Frontend

One new standalone page, `apps/web/app/setup/page.tsx`, outside every route group (matching how `/login` and `/profile` are standalone). On mount, calls `GET /setup/status`: if `needsSetup` is `false`, redirects immediately to `/login` (no dead-end wizard page lingering once setup is done or was never needed). Otherwise renders a form — token, email, password fields, using the existing `Input`/`Button`/`Card` primitives in the same shell style as the login page — with a submit handler that calls `POST /setup/complete` and, on success, shows a confirmation message with a link to `/login`. Errors (bad/expired/already-used token, email already taken, validation failures) render inline the same way every other form in this codebase does (`role="alert"` paragraph).

## Testing

Unit tests for `SetupService`/`SetupController` covering: needs-setup true and false; a valid token succeeds; an invalid, expired, or already-used token is rejected; and the race case — a technically-valid token is still rejected if a `super_admin` now exists (proving the write-time re-check, not just the boot-time snapshot, is what actually gates creation). Live verification mirrors every other feature this session: reset to a database with zero `super_admin` rows (or a fresh Docker volume), boot the API, read the token out of the console log, and drive the actual wizard page in the browser end-to-end, including confirming the page redirects to `/login` and the wizard endpoints refuse a second attempt once the first account exists.

## Out of scope

- Any change to `apps/api/prisma/seed.ts` — it stays exactly as it is today, for local dev only.
- Auto-login after wizard completion (operator logs in normally afterward).
- Any UI for regenerating/re-displaying a lost token — if the console log is gone, restart the server to get a fresh one.
- Any wizard step beyond creating the single first `super_admin` (no org creation, no branding, no further setup) — the newly-created `super_admin` uses the already-shipped Organizations and Platform Admins pages for everything else.
