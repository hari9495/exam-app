# Custom Permission Profiles (Zoho #6) — Design

**Date:** 2026-09-08
**Status:** Approved (design), pending spec review
**Zoho adopt:** #6 (Users & Control → Security Control / Profiles). Closes the **admin-defined permission sets** gap — today permissions are fixed per global role (`super_admin`/`org_admin`/`recruiter`/`panel`) via the seeded `RolePermission` map; orgs cannot tailor what a user can do without code.
**Branch:** `feat/permission-profiles` (off origin/main @ `08ae024e`, built in an isolated git worktree due to concurrent sessions on the shared checkout — see [[feedback_shared_checkout_concurrent_sessions]]).

## Goal

Let an org admin define named **permission profiles** (a curated set of permission keys) and assign one to a user; when assigned, the profile **replaces** that user's role-derived permissions. Additive and off-by-default: a user with no profile behaves exactly as their role does today.

## Scope

**In:** an org-scoped `PermissionProfile` model (+ RLS); a nullable `User.permissionProfileId`; a server-defined **assignable-permission allowlist**; profile CRUD + an assignable-catalog GET (gated `org:manage_users`); per-user profile assignment through the existing user-management path; the `PermissionsGuard` resolving effective permissions from an assigned profile; `permissionProfileId` carried in the JWT; a web profiles settings page + a per-user profile selector + nav.

**Out (deferred / not this slice):**
- Field-level / record-level permissions inside a profile — those are separate already-built features (#18-A field permissions, #18-B record visibility). A profile here governs the coarse permission-key set only.
- Editing the built-in role → permission defaults (the seeded `RolePermission` map stays code-owned).
- Profile inheritance / composition (a profile is a flat key set).
- Bulk re-assignment tooling; assignment is per-user in v1.
- Changing `super_admin` / `actingSuperAdmin` behavior (they bypass permission checks and ignore profiles).

## Decisions (rulings baked in)

1. **Assigned profile REPLACES role permissions.** While a user has a profile, their effective permission set is exactly the profile's keys (role default ignored for authorization). Role still drives UI/landing/other role-based logic. This lets an admin grant *less* than a role (the primary use case: a limited/read-only recruiter), not only more.
2. **Assignable allowlist (security guardrail).** A profile may contain any permission key EXCEPT `platform:manage_organizations`, `org:manage_users`, and `org:manage_billing`. This prevents an org-admin-authored profile from minting/elevating users, touching billing, or reaching platform scope. Enforced server-side: profile writes reject any key not in `ASSIGNABLE_PERMISSION_KEYS` (400).
3. **`permissionProfileId` is carried in the JWT** (minted at login, alongside `role`). Staleness semantics are therefore identical to `role`'s today: an assignment change takes effect on the user's next login/token refresh. This is consistent with the existing model (changing a user's role is likewise not retroactive to a live token) and keeps the guard off the RLS-protected `users` table on the hot path.
4. **Guard resolution path.** `PermissionsGuard.canActivate`: (a) `actingSuperAdmin` → allow (unchanged); (b) else if `request.user.permissionProfileId` is set → resolve the profile's keys via `TenantPrismaService.forTenant` (the profile is an RLS table) and treat them as the complete granted set; (c) else → the existing `role → rolePermission` raw read (unchanged, no added cost). Only profiled users incur the extra tenant read.
5. **Storage = JSON key array** on the profile (`permissionsJson`), matching the existing org-config JSON pattern (field-permissions/business-hours). No `PermissionProfilePermission` join table (the global `RolePermission` is normalized because it's platform-seeded; a per-org flat key set is simpler as JSON and is what the guard needs).
6. **Delete a profile that is assigned → 409** (block), not a silent cascade to null. Silently nulling assignees would quietly widen their permissions back to the role default — a surprising authorization change. The admin must reassign/clear those users first (the error names the count).
7. **RLS:** `PermissionProfile` is a tenant table → paired `_rls` migration. `User.permissionProfileId` is an additive column on the already-RLS `users` table → no `_rls` for that. No seed (reuses `org:manage_users`).

## Architecture

### Schema (additive)

```prisma
model PermissionProfile {
  id              String   @id @default(uuid()) @db.UniqueIdentifier
  organizationId  String   @map("organization_id") @db.UniqueIdentifier
  name            String
  permissionsJson String   @map("permissions_json") @db.NVarChar(Max) // JSON string[] of permission keys
  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")
  users           User[]

  @@unique([organizationId, name])
  @@index([organizationId])
  @@map("permission_profiles")
}

// model User
permissionProfileId String?            @map("permission_profile_id") @db.UniqueIdentifier
permissionProfile   PermissionProfile? @relation(fields: [permissionProfileId], references: [id], onDelete: NoAction, onUpdate: NoAction)
```
Migration `20260908230000_permission_profiles` (table + `users.permission_profile_id` column + FK) and `20260908230001_permission_profiles_rls` (tenant policy on `permission_profiles`, verbatim shape of an existing new-table `_rls`). **Numbering:** `230000` — deliberately past the parked `feat/api-usage-metering` (`210000/1`) and `feat/careers-site` (`220000`) migrations so the chain stays linear when they merge. No seed. (`onDelete: NoAction` because deletion is blocked in app code per Decision 6, so a returning-FK never orphans.)

### Assignable-permission catalog

A server constant (co-located with the permission catalog, e.g. `apps/api/src/rbac/assignable-permissions.ts`):
```ts
export const NON_ASSIGNABLE_PERMISSION_KEYS = ['platform:manage_organizations', 'org:manage_users', 'org:manage_billing'] as const;
// ASSIGNABLE = every key in the Permission catalog minus NON_ASSIGNABLE.
```
The assignable list is derived from the DB `Permission` table (keys + descriptions) minus the non-assignable set, so it stays in sync with the catalog. `GET /organizations/permission-profiles/assignable-permissions` → `{ key, description }[]` for the web picker.

### API — profile config (gated `org:manage_users`, per-method)

On a new `PermissionProfilesController` (or folded into organizations) — all tenant-scoped via `forTenant`:
- `GET /organizations/permission-profiles` → `{ id, name, permissions: string[], assignedUserCount }[]`.
- `POST /organizations/permission-profiles` `{ name, permissions: string[] }` → validate name non-empty + unique per org; validate `permissions ⊆ ASSIGNABLE` (else 400); persist `permissionsJson`; audit `permission_profile.created`.
- `PATCH /organizations/permission-profiles/:id` `{ name?, permissions? }` → same validation; audit `permission_profile.updated`.
- `DELETE /organizations/permission-profiles/:id` → if any user has `permissionProfileId = :id` → **409** with the count; else delete; audit `permission_profile.deleted`.
- `GET .../assignable-permissions` → the catalog above.

### API — assignment

Extend the existing user-management update (the endpoint org admins already use to edit a user, gated `org:manage_users`) with `permissionProfileId?: string | null`:
- `null` clears the assignment (user reverts to role default).
- A non-null id is validated to be a `PermissionProfile` in the **same org** (else 400/404) before persisting.
- Audit `user.permission_profile_assigned` (with the profile id / null).
- **Token note:** because `permissionProfileId` lives in the JWT, the assignment takes effect on the user's next login — same as a role change. The admin UI states this.

### JWT + guard

- `JwtPayload` + `jwt.strategy.validate` gain `permissionProfileId: string | null`. Every token-mint path sets it from the user row: password login, SAML login, super-admin impersonation/act-into-org (there `actingSuperAdmin` short-circuits anyway), and any refresh/re-issue. `request.user` gains `permissionProfileId`.
- `PermissionsGuard.canActivate` (the one authorization change — reviewed hard):
  ```
  if (!requirements) return true;
  if (!user) throw Forbidden;
  if (user.actingSuperAdmin) return true;
  let grantedKeys: Set<string>;
  if (user.permissionProfileId) {
    const profile = await tenantPrisma.forTenant(
      { organizationId: user.organizationId, isSuperAdmin: false },
      (tx) => tx.permissionProfile.findUnique({ where: { id: user.permissionProfileId }, select: { permissionsJson: true } }),
    );
    grantedKeys = new Set(profile ? (JSON.parse(profile.permissionsJson) as string[]) : []);
    // profile missing/deleted → empty set → deny (fail closed). Deletion is blocked while assigned (Decision 6), so this is only reachable via a race; denying is the safe outcome.
  } else {
    // unchanged: role → rolePermission raw read
    grantedKeys = <existing role query>;
  }
  // unchanged all/any checks against grantedKeys
  ```
  The guard gains a `TenantPrismaService` dependency (keeps `PrismaService` for the role path). The no-profile path is byte-for-byte the current behavior.

### Web

- **Settings page** `apps/web/app/v2/(org-admin)/settings/permission-profiles/page.tsx` + `usePermissionProfiles` hook (authed apiFetch): list profiles (name, key count, assigned-user count), create/edit (name + a checkbox grid of assignable permissions with their descriptions), delete (surfacing the 409 "N users assigned" message). Gated to the org_admin route group.
- **User management:** add a "Permission profile" selector (dropdown of the org's profiles + "Role default") to the user edit UI; sends `permissionProfileId` (or null). Show the "applies on next login" note.
- Nav: super-admin-nav entry + staff-nav `V2_ROUTES` (`/settings/permission-profiles`). No `@exam-platform/shared` runtime VALUE import; deep-import ui.

## Data flow

1. Org admin creates profile "Interviewer" = `['org:view','results:view','interview:view_assigned']`.
2. Admin assigns it to user U (edit user → profile "Interviewer"). Audited; U's live token unchanged.
3. U logs in → JWT carries `permissionProfileId`. On a gated request, the guard reads the profile's keys via forTenant and authorizes against exactly those (role ignored).
4. Admin clears U's profile → U reverts to role default on next login.
5. Admin tries to delete an assigned profile → 409 "3 users are assigned; reassign them first."

## Error handling

- Profile key not in the assignable allowlist → 400 (names the offending key).
- Duplicate profile name in the org → 409/400.
- Assigning a profile from another org (or unknown id) → 404/400.
- Deleting an assigned profile → 409 with the assignee count.
- Guard: profile missing at request time (race after delete) → empty grant set → deny (fail closed), never fall back to the role (which would silently broaden).

## Testing

- **Schema:** table + `@@unique(org,name)` + `_rls`; `users.permission_profile_id` nullable FK; no seed.
- **Guard (critical):** no-profile user → role path unchanged (regression tests still green); profiled user → authorized against profile keys only, role ignored (both a grant and a deny case); `actingSuperAdmin` bypass unchanged; profile read is tenant-scoped (forTenant, not raw — a raw read would 0-row and wrongly deny); missing profile → deny.
- **Allowlist:** profile write rejects each of the 3 non-assignable keys; accepts assignable ones; assignable-catalog GET excludes exactly the 3.
- **CRUD/assignment:** create/edit/delete; unique-name; delete-while-assigned → 409; assign validates same-org; clear reverts; all gated `org:manage_users` (Reflector).
- **JWT:** every mint path includes `permissionProfileId`; `validate` surfaces it on `request.user`.
- **Web:** profiles page create/edit/delete (+409 surfacing); user selector sends `permissionProfileId`; "applies next login" note present.
- Full api + web jest green; tsc clean; packages/shared jest if shared code touched (JwtPayload may live in shared — run it if so).

## Deploy notes

- Two additive migrations (table + `_rls`) + one additive `users` column (in the table migration), no seed. Behavior-preserving: no user has a profile until assigned → role authorization unchanged; the guard's no-profile path is untouched. **The JWT payload gains a field** — old tokens without it are fine (treated as no profile → role default); no forced re-login needed. Ships with any api build; web needs any web build. Migration `20260908230000/1` must remain after the parked api-usage/careers numbers. (Prod deploy deferred until all dev done — standing decision.)
