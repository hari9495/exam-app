# Organization & Admin Account Bootstrap — Design

## Problem

There is no live, in-app path to onboard a new organization today. The only way any `Organization` or `User` row (including the seeded `demo-org` and its admin) ever gets created is by running `apps/api/prisma/seed.ts` directly against the database. Three concrete, compounding gaps make this true:

1. `POST /organizations` exists (`apps/api/src/organizations/organizations.controller.ts:20-24`, gated by `platform:manage_organizations`, held only by `super_admin`) but creates an `Organization` row and **zero** `User` rows. No admin is ever created for the new org.
2. `UsersService.create()` (`apps/api/src/users/users.service.ts:38-41`) throws if the caller's `TenantContext.organizationId` is `null`. A `super_admin`'s context is **always** `organizationId: null` (`current-tenant.decorator.ts:8-9`, since the seed creates `super_admin` with no org). So a `super_admin` cannot call `POST /users` to create the first admin for the org they just made — the two capabilities are disjoint with no bridging endpoint.
3. There is no `super_admin`-facing frontend at all. The login page's post-login redirect (`apps/web/app/login/page.tsx:38`) has no `super_admin` branch — a `super_admin` who logs in today (which already technically works, since the "Organization slug" field is optional and omitting it triggers the backend's existing `isSuperAdminLookup` path) gets silently routed to `/dashboard` (the recruiter route), which immediately bounces them back to `/login` since they hold no recruiter permissions.

## Scope

Medium: one atomic bootstrap endpoint, plus the minimum frontend needed to reach it without curl — fixing the login-redirect bug and adding one bare "Organizations" screen. Explicitly **not** in scope: a full platform-admin console (org editing, cross-org user management, plan/billing selection UI). Only one `Plan` row exists in the whole system (the seeded `trial` plan) and there is no billing model to speak of, so plan selection is out of scope entirely — every new org is assigned the trial plan automatically.

## Backend

**Extend `POST /organizations`** (currently has zero real consumers, so extending its contract is safe):

- `CreateOrganizationDto` (`apps/api/src/organizations/dto/create-organization.dto.ts`): drop `planId` entirely (server-assigned, not caller-supplied); add `adminEmail: @IsEmail()`.
- `OrganizationsService.create()` rewritten to, in sequence:
  1. Check slug uniqueness (existing behavior, unchanged).
  2. Look up the trial plan by name (`prisma.plan.findFirst({ where: { name: 'trial' } })`) rather than trusting a caller-supplied id or a hardcoded UUID — fails loudly if the environment has no trial plan seeded (a genuine misconfiguration, not a user-facing validation error).
  3. Create the `Organization` row (unchanged shape, minus accepting `planId` from the request).
  4. Create the first `org_admin` `User` for the new org **immediately**, locked with a random, unguessable password (`argon2.hash(randomBytes(32).toString('hex'))`) that nobody — including the `super_admin` who triggered this — ever sees. Routed through `TenantPrismaService.forTenant({ organizationId: newOrg.id, isSuperAdmin: true }, ...)`, the same super-admin-bypass idiom the password-reset flow already established, since there is no pre-existing tenant session to scope to for a brand-new org.
  5. In the same `forTenant` transaction, generate a `PasswordResetToken` for that user — reusing the existing model and the existing 15-minute `PASSWORD_RESET_EXPIRY_MINUTES` policy verbatim, no new token model or expiry constant.
  6. Fire-and-forget email a welcome link to `dto.adminEmail`, pointing at `${FRONTEND_URL}/reset-password/${rawToken}` — **the exact same page and endpoint the Forgot Password feature already built.** The new admin's very first action is the already-existing, already-tested "set your password" flow; no new frontend page is needed for account activation.
  7. Record the existing `organization.created` audit event, unchanged.

**New `GET /organizations`** (same `platform:manage_organizations` permission; does not exist today) — returns all organizations (`id, name, slug, region, createdAt`), for the new frontend list. No pagination — organization count is expected to stay small.

**Accepted edge case:** if step 3 succeeds but steps 4-6 fail (e.g. a transient DB error), the org is created with no admin — an orphaned, unreachable-by-anyone-but-`super_admin` organization. This is not rolled back automatically; the `super_admin` would need to notice and manually clean it up (or a future fix could add real cross-write rollback). This mirrors an already-accepted risk pattern elsewhere in this codebase (e.g. the profile page's `change-password` audit write isn't rolled back if it fails after the password already changed) and is judged acceptable for a rare, `super_admin`-only, low-volume action — not worth building distributed-transaction rollback for.

## Frontend

**Login redirect fix** (`apps/web/app/login/page.tsx:38`): add a `super_admin` branch to the existing ternary chain, routing to `/organizations` instead of falling through to `/dashboard`.

**New minimal route group**, `apps/web/app/(platform)/`:
- `layout.tsx` — role-gated (redirect to `/login` if not authenticated or `role !== 'super_admin'`, matching the existing 3 staff layouts' guard pattern exactly), a bare header (no full sidebar nav — there's only one page) with a logout button (reusing the existing `useAuth().logout()` pattern from the other three shells).
- `organizations/page.tsx` — the sole page: a create-organization form (name, slug, region select, admin email) above a table listing existing organizations (name, slug, region, created date), using the existing `Input`/`Button`/`Select`/`Table`/`Card` design-system primitives and `useToast` for success/error feedback.

**New hooks** (`apps/web/lib/hooks/useOrganizations.ts`, matching the established `useUsers.ts`/`useBranding.ts` pattern): `useOrganizations()` (GET list) and `useCreateOrganization()` (POST create, invalidates the list query on success).

## Out of scope

- Plan/billing selection (only one plan exists; always auto-assigned).
- Editing or deleting organizations.
- Any cross-org user management or oversight beyond seeing the org list.
- Creating additional `super_admin` accounts via API (still seed-script-only — a platform has few of these, and adding self-service creation of the most privileged role is a materially different, higher-stakes decision than onboarding a tenant org).
- Distributed-transaction rollback for the org-created-but-admin-creation-failed edge case (see Accepted edge case above).
