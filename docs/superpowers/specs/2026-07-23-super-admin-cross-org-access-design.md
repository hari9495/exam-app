# Super Admin Cross-Org Access — Design Spec

## Overview

Today `super_admin` is a platform-only role: it can create/list organizations and manage other `super_admin` accounts, but is structurally walled off from every organization's operational data (questions, exams, candidates, results, settings) — both by the RBAC permission table and by every frontend route group hard-redirecting it away.

This feature turns `super_admin` into a true top-level, CRM-style admin: it can **switch into any single organization** and, while inside it, get the combined powers of that org's recruiter, org_admin, and panel roles at once (no per-role switching), reusing every existing screen unmodified. It also gets a new **platform-wide user directory** across all organizations.

This is a deliberate, audited relaxation of the tenant-isolation boundary the platform was originally built with — not an accident to undo carefully, but a real security-relevant change the design below treats as such (short-lived elevation, full audit trail, visible on-screen indicator whenever active).

## Background — current state (verified against code)

- `super_admin` users have `organizationId: null`. The RBAC table (`apps/api/prisma/seed.ts`) grants it only `platform:manage_organizations`, `org:manage_users`, `org:manage_settings`, `org:view`, `audit:view` — none of `question_bank:manage`, `exam:manage`, `candidate:manage`, `results:view`, `ai_jobs:view`, `candidate:data_rights`.
- Even the two grants it does hold (`org:manage_users`, `org:manage_settings`) are dead in practice: every service method behind them calls `requireOrganizationId(context)`, which throws because `context.organizationId` is always `null` for a `super_admin` JWT (`apps/api/src/organizations/organizations.service.ts`, `apps/api/src/users/users.service.ts`).
- The database's row-level-security layer already has an `is_super_admin` bypass predicate that returns all rows regardless of org — but it's never reached today because the permission guard blocks the request before any tenant-scoped query runs.
- Every frontend route group — `(recruiter)`, `(org-admin)`, `(panel)` — hard-redirects any session whose role isn't the group's exact expected role, including `super_admin`, straight back to `/login`.
- The original platform spec (`docs/superpowers/specs/2026-07-07-online-mcq-exam-platform-design.md`) explicitly scoped `super_admin` to "cross-tenant platform analytics — not exam content," and planned but never built an "audited support impersonation into a tenant" feature — this spec is that feature, generalized.

## Non-goals

- No simultaneous multi-org unified view. Super_admin operates inside one org at a time.
- No new permanent RBAC permission rows and no new "mega-role." Elevation is a session-scoped flag, not a standing grant — `super_admin`'s baseline permissions stay exactly as narrow as today when not actively switched into an org.
- No changes to what recruiter/org_admin/panel screens show or how they behave — they are reused completely unmodified.
- No impersonation of a specific staff *user's* identity. This is org-level context switching only; the audit trail and every write action always attributes to the real `super_admin` account, never to a borrowed user identity.
- No new write/edit endpoints duplicated for the platform-wide user directory — editing a specific org's users happens by switching into that org and using the existing org_admin Users screen (see "Platform-wide user directory" below).

## Architecture

### Switching into an org

`POST /auth/super-admin/switch-into/:orgId` (requires a valid `super_admin` access token; 404 if the org doesn't exist):

1. Writes an audit log entry (`super_admin.org_switch_in`, actor = the real super_admin's user id, target org = `:orgId`).
2. Issues a new access token with the same TTL as a normal access token, carrying:
   - `organizationId`: the target org's id (in place of `null`)
   - `role`: unchanged, still `super_admin`
   - `actingSuperAdmin: true` — the elevation marker
3. Returns this token. The existing httpOnly refresh-token cookie (the super_admin's real session) is **not touched** — switching in never affects the underlying session.

The frontend swaps to the returned token for all subsequent API calls and navigates to `/dashboard` (the recruiter shell's default landing page).

Switching into a new org while already acting in another org is allowed without an explicit exit step: it audit-logs an implicit switch-out of the previous org followed by switch-in to the new one, and simply replaces the acting token.

### Switching out

`POST /auth/super-admin/switch-out` (requires an acting token): writes an audit log entry (`super_admin.org_switch_out`, actor, the org being left), and the caller discards the acting token. The frontend then calls the normal `/auth/refresh` flow against the still-valid refresh cookie to obtain a fresh, un-elevated `super_admin` access token, and navigates to `/organizations`.

### Permission elevation

`PermissionsGuard` (`apps/api/src/rbac/permissions.guard.ts`) gains one additional short-circuit: if the request's JWT carries `actingSuperAdmin: true`, the guard grants the request regardless of the endpoint's required permission — it does not consult the `RolePermission` table at all for that request. This is the only code change to the guard; every controller's existing `@RequirePermissions(...)` decorators are untouched.

Because the acting token's `organizationId` claim is genuinely the target org, `TenantPrismaService`/`CurrentTenant` need no changes — they already build tenant context from these exact claims, so every existing service method's `where: { organizationId: context.organizationId }` filtering, and the RLS `is_super_admin` bypass (still true, since `role` stays `super_admin`), both apply correctly and consistently with zero changes to that layer.

### Frontend: shared "acting" shell

A new layout, mounted only when `actingSuperAdmin` is present in the current session, wraps the existing pages rather than replacing them:

- A persistent top banner: **"Viewing as super_admin — *[Org Name]*"** with an **"Exit to platform admin"** button (calls switch-out).
- A single combined nav listing every destination the three existing shells expose: Dashboard, Exams, Question Bank, Candidates, Reports, Users, Settings (Branding/SSO/Integrations), Audit Log, Data Rights — each linking straight into the existing, unmodified page.
- The three existing route-group layouts (`(recruiter)`, `(org-admin)`, `(panel)`) each get their role-check widened by one condition: allow through if `actingSuperAdmin === true`, in addition to their existing exact-role check. No other change to those layouts or the pages beneath them.
- `/organizations` (the platform shell's org list) gains a "Switch into" action per row, calling the switch-in endpoint and redirecting.

### Platform-wide user directory

A new page under the platform shell (e.g. `/platform-admins` extended, or a new `/users` route) lists every user across every organization — name, email, role, org name, status — backed by a new endpoint that uses the existing RLS super_admin bypass to query across all orgs (no `organizationId` filter). This is a read-only directory with search/filter; each row's "Manage" action switches super_admin into that user's org and deep-links directly to that org's existing Users screen for the actual edit/deactivate/promote action — reusing that screen's existing write logic rather than duplicating it.

## Error handling

- Switch-into a non-existent org: `404`.
- Acting token expires mid-session: the normal 401 → silent-refresh flow refreshes against the real (un-elevated) super_admin session, which does not carry `actingSuperAdmin`. The next org-scoped request this yields a clean `403` from the now-un-elevated token. The frontend treats this specific case (banner state was active, then a 403 arrives) as "acting session expired," shows a toast, and redirects to `/organizations` — it does not attempt to silently re-elevate.
- Switch-out with no active acting session: no-op, `200`.

## Testing strategy

- Backend unit tests: switch-in/switch-out service methods (audit entries written, correct token claims), `PermissionsGuard`'s new `actingSuperAdmin` short-circuit (elevated request passes regardless of endpoint permission; non-elevated `super_admin` request still blocked as today).
- Backend e2e: full flow — super_admin switches into an org, successfully calls a recruiter-only endpoint and an org_admin-only endpoint, switches out, confirms the same calls are rejected again on the un-elevated token.
- Frontend unit tests: banner renders and exit button calls switch-out; the three route-group layouts admit an `actingSuperAdmin` session; the platform-wide user directory renders and its "Manage" action navigates through switch-in into the target org's Users page.
- Playwright: one golden-path spec covering login as super_admin → switch into an org → visit Exams/Candidates/Users → exit → back on `/organizations`.

## Self-review

- **Placeholder scan**: no TBDs remain; every decision point above has a concrete resolution.
- **Internal consistency**: the "no new permanent RBAC row" non-goal is consistent with the guard doing a session-flag short-circuit rather than a table grant; the "no duplicate write endpoints" non-goal is consistent with the user directory being read-only-plus-deep-link.
- **Scope check**: this is sized for one implementation plan — the backend pieces (2 endpoints + 1 guard change) and frontend pieces (1 new shell + 3 widened gates + 1 new directory page) are tightly coupled around one feature and don't need decomposition.
- **Ambiguity check**: "everything at once, unified" is made concrete as "one combined nav into unmodified existing pages," not a new merged data view; "control remaining users" is made concrete as "directory + deep-link into existing org_admin Users screen," not new cross-org CRUD endpoints.
