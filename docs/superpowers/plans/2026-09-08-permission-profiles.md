# Custom Permission Profiles (Zoho #6) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Org admins define named permission profiles (a curated permission-key set) and assign one to a user; an assigned profile REPLACES that user's role-derived permissions. Additive, off-by-default: a user with no profile behaves exactly as their role does today.

**Architecture:** Org-scoped `PermissionProfile` (JSON key set) + RLS; nullable `User.permissionProfileId`; a server-defined assignable-permission allowlist (catalog minus 3 escalation keys); profile CRUD + assignment gated `org:manage_users`; `permissionProfileId` carried in the JWT; `PermissionsGuard` resolves an assigned profile via `forTenant` (RLS-safe), else the unchanged role path, failing closed on a missing profile.

**Tech Stack:** NestJS 10, Prisma 5.22 (SQL Server), passport-jwt, Next.js (apps/web), Jest.

**Spec:** docs/superpowers/specs/2026-09-08-permission-profiles-design.md

## Global Constraints

- **Worktree build:** this branch is built in an isolated git worktree (`.claude/worktrees/permission-profiles`) because another session shares the main checkout (see the SDD ledger's setup notes). Run ALL commands from the worktree. **NEVER `npm install`/`ci`/`update`** (junction node_modules → disk-fill hazard). Node resolves the root `node_modules` by parent walk; nested (`apps/api/node_modules`, `packages/shared/node_modules`) are junctioned; `packages/shared/dist` is built in-worktree with `npx tsc`. Run jest/tsc from `apps/api`/`apps/web` inside the worktree.
- **Base:** branch `feat/permission-profiles` off origin/main @ `08ae024e`.
- **Prisma in a worktree:** `prisma generate` writes the SHARED `node_modules/@prisma/client` via the junction. Only Task 1 changes the schema, so ONLY Task 1 runs `npx prisma migrate deploy` + `npx prisma generate` (additive; adds `permission_profiles` + `users.permission_profile_id`). Later tasks must NOT re-run generate. If a concurrent session's client seems stale after T1, that's expected additive regeneration — do not "fix" it.
- **Additive + off-by-default:** no user has a profile until assigned → role authorization is unchanged; the guard's no-profile path stays byte-for-byte identical. Old JWTs without `permissionProfileId` are treated as no-profile (role default) — no forced re-login.
- **Migrations:** `20260908230000_permission_profiles` (table + `users` column + FK) and `20260908230001_permission_profiles_rls`. **Numbering MUST stay after the parked `feat/api-usage-metering` (210000/1) and `feat/careers-site` (220000)** so the chain is linear when they merge. No seed.
- **Security (load-bearing):** an assigned profile REPLACES role perms; profile keys validated ⊆ `ASSIGNABLE_PERMISSION_KEYS` (catalog minus `platform:manage_organizations`, `org:manage_users`, `org:manage_billing`); guard reads the RLS profile via `TenantPrismaService.forTenant` (a raw read would 0-row → wrongly deny); guard fails CLOSED (missing profile → deny, never fall back to role). `actingSuperAdmin` bypass unchanged.
- Config + assignment routes per-method `@RequirePermissions('org:manage_users')` (guard is handler-only).
- apps/web: no `@exam-platform/shared` runtime VALUE import; deep-import ui (ui-v2 barrel is a Jest hazard).
- Attribution footer on every commit: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Verify `git branch --show-current` == `feat/permission-profiles` in the SAME command as each commit (shared-checkout hazard).

---

### Task 1: Schema — `PermissionProfile` + `User.permissionProfileId`

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (new model `PermissionProfile`; `User` gains the FK field)
- Create: `apps/api/prisma/migrations/20260908230000_permission_profiles/migration.sql`
- Create: `apps/api/prisma/migrations/20260908230001_permission_profiles_rls/migration.sql`

**Interfaces:**
- Produces: `PermissionProfile { id, organizationId, name, permissionsJson, createdAt, updatedAt }` unique `(organizationId, name)`; `User.permissionProfileId: string|null`.

- [ ] **Step 1: schema.prisma** — add the model + the `User` field/relation exactly as the spec's Architecture block gives (`permissionsJson String @db.NVarChar(Max)`; `User.permissionProfileId String? @db.UniqueIdentifier` + `permissionProfile PermissionProfile? @relation(..., onDelete: NoAction, onUpdate: NoAction)`; back-relation `users User[]` on the profile).

- [ ] **Step 2: table migration** `20260908230000_permission_profiles/migration.sql`:
```sql
CREATE TABLE [dbo].[permission_profiles] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [permission_profiles_id_df] DEFAULT newid(),
    [organization_id] UNIQUEIDENTIFIER NOT NULL,
    [name] NVARCHAR(200) NOT NULL,
    [permissions_json] NVARCHAR(MAX) NOT NULL,
    [created_at] DATETIME2 NOT NULL CONSTRAINT [permission_profiles_created_at_df] DEFAULT CURRENT_TIMESTAMP,
    [updated_at] DATETIME2 NOT NULL,
    CONSTRAINT [permission_profiles_pkey] PRIMARY KEY CLUSTERED ([id])
);
CREATE UNIQUE NONCLUSTERED INDEX [permission_profiles_organization_id_name_key] ON [dbo].[permission_profiles]([organization_id], [name]);
CREATE NONCLUSTERED INDEX [permission_profiles_organization_id_idx] ON [dbo].[permission_profiles]([organization_id]);
ALTER TABLE [dbo].[users] ADD [permission_profile_id] UNIQUEIDENTIFIER NULL;
ALTER TABLE [dbo].[users] ADD CONSTRAINT [users_permission_profile_id_fkey] FOREIGN KEY ([permission_profile_id]) REFERENCES [dbo].[permission_profiles]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
```
(Match the exact conventions of a recent table migration, e.g. `20260907180000_org_sender_addresses`. Confirm the generated SQL from `prisma migrate diff`/`dev` matches this shape; hand-adjust only to match repo conventions.)

- [ ] **Step 3: RLS migration** `20260908230001_permission_profiles_rls/migration.sql` — verbatim shape of `20260907180001_org_sender_addresses_rls`, retargeted to `permission_profiles` (ADD FILTER PREDICATE + ADD BLOCK PREDICATE AFTER INSERT + AFTER UPDATE via `dbo.fn_tenant_access_predicate(organization_id)`). Only `permission_profiles` gets RLS (the `users` column is on an already-RLS table).

- [ ] **Step 4: apply + generate + typecheck.** From `apps/api` (in the worktree): `npx prisma migrate deploy`, `npx prisma generate`, `npx tsc --noEmit`. Expected: applied, client has `apiUsageDaily`... `permissionProfile` + `user.permissionProfileId`, tsc clean.

- [ ] **Step 5: commit.**
```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260908230000_permission_profiles apps/api/prisma/migrations/20260908230001_permission_profiles_rls
git commit -m "feat(perm-profiles): PermissionProfile table + RLS + User.permissionProfileId"
```

---

### Task 2: Assignable catalog + profile CRUD API

**Files:**
- Create: `apps/api/src/rbac/assignable-permissions.ts` (the allowlist constant + a helper)
- Create: `apps/api/src/permission-profiles/permission-profiles.service.ts` + `.controller.ts` + `.module.ts`
- Create: `apps/api/src/permission-profiles/dto/upsert-permission-profile.dto.ts`
- Modify: `apps/api/src/app.module.ts` (register `PermissionProfilesModule`)
- Test: service + controller specs

**Interfaces:**
- Consumes: `PermissionProfile` (T1); the DB `Permission` catalog.
- Produces: `NON_ASSIGNABLE_PERMISSION_KEYS` + an `assignablePermissions(prisma)` helper; `PermissionProfilesService` (list/create/update/remove/assignable); endpoints under `/organizations/permission-profiles`.

- [ ] **Step 1: allowlist** `assignable-permissions.ts`:
```ts
export const NON_ASSIGNABLE_PERMISSION_KEYS = [
  'platform:manage_organizations',
  'org:manage_users',
  'org:manage_billing',
] as const;
export function isAssignableKey(key: string): boolean {
  return !(NON_ASSIGNABLE_PERMISSION_KEYS as readonly string[]).includes(key);
}
```

- [ ] **Step 2: failing service tests** (`permission-profiles.service.spec.ts`, mocking `TenantPrismaService.forTenant` + the raw `PrismaService` for the catalog read):
  - `list(context)` → profiles with `permissions` (parsed from `permissionsJson`) + `assignedUserCount` (count of users with that `permissionProfileId`).
  - `create` persists `permissionsJson`; rejects a key ∈ NON_ASSIGNABLE (BadRequest); rejects an unknown key not in the Permission catalog (BadRequest); rejects duplicate name (surface unique violation as 409/400); audit `permission_profile.created`.
  - `update` same validation; audit `permission_profile.updated`.
  - `remove` → if any user has `permissionProfileId = id` → **ConflictException** naming the count; else delete; audit `permission_profile.deleted`.
  - `assignablePermissions()` → the DB Permission catalog minus the 3 non-assignable keys (`{key, description}[]`).
  - All reads/writes via `forTenant` (tenant-scoped).

- [ ] **Step 3: implement** the service (tenant-scoped via `forTenant`; validate `permissions ⊆ assignable` by loading the catalog once and checking membership + `isAssignableKey`; `remove` counts assignees first). DTO `UpsertPermissionProfileDto { @IsString @MaxLength(200) name; @IsArray @IsString({each:true}) permissions: string[] }` (create requires both; a `PATCH` variant may make them optional — use `@IsOptional` on a shared DTO or a dedicated update DTO).

- [ ] **Step 4: failing controller spec** — `GET /organizations/permission-profiles`, `POST`, `PATCH :id`, `DELETE :id`, `GET .../assignable-permissions`; every route per-method `@RequirePermissions('org:manage_users')` (Reflector assertion). Run `npx jest permission-profiles` → FAIL.

- [ ] **Step 5: controller + module.** Routes delegate to the service (`@CurrentTenant()`, `@CurrentUserId()`). Register `PermissionProfilesModule` in `app.module.ts`.

- [ ] **Step 6: tests + tsc + commit.** `npx jest permission-profiles` (apps/api) + `npx tsc --noEmit`.
```bash
git add apps/api/src/rbac/assignable-permissions.ts apps/api/src/permission-profiles apps/api/src/app.module.ts
git commit -m "feat(perm-profiles): assignable catalog + profile CRUD gated org:manage_users"
```

---

### Task 3: JWT carries `permissionProfileId`

**Files:**
- Modify: `apps/api/src/auth/jwt.strategy.ts` (`JwtPayload` + `validate`)
- Modify: `apps/api/src/auth/auth.service.ts` (`signAccessToken` payload + every caller: login, `issueTokensForSso`, refresh re-issue, impersonation/act-into-org)
- Test: `auth.service.spec.ts` / `jwt.strategy.spec.ts`

**Interfaces:**
- Consumes: `User.permissionProfileId` (T1).
- Produces: `JwtPayload.permissionProfileId: string | null`; `request.user.permissionProfileId` (T4 consumes this).

- [ ] **Step 1: failing tests** — (a) `jwt.strategy.validate` surfaces `permissionProfileId` on the returned user object; (b) the access token minted at login carries the user's `permissionProfileId`; (c) a refresh re-issue reflects the CURRENT user row's `permissionProfileId` (so a refresh picks up an assignment change); (d) impersonation / act-into-org tokens set it to `null` (guard bypasses via `actingSuperAdmin` regardless).

- [ ] **Step 2: implement.**
  - `JwtPayload` gains `permissionProfileId: string | null`. `validate` returns `permissionProfileId: payload.permissionProfileId ?? null` (old tokens → null).
  - `signAccessToken`'s payload type gains `permissionProfileId: string | null`; it passes it straight into `this.jwt.sign`.
  - Each caller that resolves a real end-user (login, SSO, refresh) passes `permissionProfileId: user.permissionProfileId ?? null` from the user row it already loads. Impersonation/act-into-org callers pass `null`.
  - `issueTokensForSso` signature: add `permissionProfileId` param (or re-read the user); thread it from the SAML/SSO login path.

- [ ] **Step 3: tests + tsc + commit.** `npx jest auth` (apps/api) + `npx tsc --noEmit`.
```bash
git add apps/api/src/auth
git commit -m "feat(perm-profiles): carry permissionProfileId in the JWT"
```

---

### Task 4: PermissionsGuard resolves an assigned profile (the authorization change)

**Files:**
- Modify: `apps/api/src/rbac/permissions.guard.ts`
- Modify: `apps/api/src/rbac/rbac.module.ts` (ensure `TenantPrismaService` is injectable here)
- Test: `apps/api/src/rbac/permissions.guard.spec.ts` (extend heavily)

**Interfaces:**
- Consumes: `request.user.permissionProfileId` (T3) + `request.user.organizationId`; `PermissionProfile` (T1).

- [ ] **Step 1: failing tests** (the critical suite):
  - **Regression:** a user with `permissionProfileId = null` → the EXISTING role→rolePermission behavior, unchanged (keep/port the current guard tests).
  - **Profile grant:** a user WITH a profile whose keys include the required key → allowed; role default is NOT consulted (assert the rolePermission query is not what grants it — e.g. mock role perms to lack the key, profile to have it → allowed).
  - **Profile deny (REPLACE):** a user WITH a profile whose keys LACK the required key → Forbidden, even if their role default would have granted it (mock role perms to include the key, profile to lack it → Forbidden). This proves REPLACE, not additive.
  - **Fail-closed:** `permissionProfileId` set but the profile read returns null (deleted/race) → Forbidden (empty grant set), never role fallback.
  - **Tenant-scoped read:** the profile is read via `TenantPrismaService.forTenant` with `{ organizationId: user.organizationId, isSuperAdmin: false }` (assert forTenant is used, not a raw `prisma.permissionProfile` read).
  - **actingSuperAdmin** → allow, no profile/role lookup (unchanged).
  - Both `requiredAll` and `requiredAny` semantics hold against the profile-derived grant set.

- [ ] **Step 2: implement** per the spec's guard pseudocode: inject `TenantPrismaService`; after the `actingSuperAdmin` early-return, branch on `user.permissionProfileId`; profile path resolves keys via `forTenant(...).permissionProfile.findUnique({ where:{id}, select:{permissionsJson} })` → `new Set(JSON.parse(permissionsJson))` (or empty set → deny if null); else the existing raw `rolePermission` query. Keep the final all/any checks identical.

- [ ] **Step 3: tests + tsc + commit.** `npx jest permissions.guard rbac` (apps/api) + `npx tsc --noEmit`.
```bash
git add apps/api/src/rbac
git commit -m "feat(perm-profiles): guard resolves assigned profile (replaces role), fail-closed"
```

---

### Task 5: Per-user profile assignment

**Files:**
- Modify: `apps/api/src/users/dto/update-user.dto.ts` (add `permissionProfileId?`)
- Modify: `apps/api/src/users/users.service.ts` (the `update` path)
- Test: `users.service.spec.ts`

**Interfaces:**
- Consumes: `PermissionProfile` (T1) + `User.permissionProfileId`.
- Produces: `PATCH /users/:id` accepts `permissionProfileId: string | null`.

- [ ] **Step 1: DTO.** Add `@IsOptional() @ValidateIf(o => o.permissionProfileId !== null) @IsUUID() permissionProfileId?: string | null` (allow explicit `null` to clear; a UUID otherwise). If the codebase's DTO style doesn't support nullable-UUID cleanly, accept `string | null` with a custom validator — mirror how other nullable-id fields are handled.

- [ ] **Step 2: failing tests** in `users.service.spec.ts`: updating a user with a `permissionProfileId` for a profile in the SAME org persists it + audits `user.permission_profile_assigned`; a profile id from ANOTHER org (or unknown) → BadRequest/NotFound (validated via a same-org `forTenant` lookup); `permissionProfileId: null` clears it; omitting the field leaves it untouched.

- [ ] **Step 3: implement** in `users.service.update`: when `permissionProfileId !== undefined`, if non-null validate it resolves to a `PermissionProfile` in the caller's org (via `forTenant`), else 400/404; set `data.permissionProfileId` (or null); audit the assignment. Keep existing role/name/managerId handling intact.

- [ ] **Step 4: tests + tsc + commit.** `npx jest users` (apps/api) + `npx tsc --noEmit`.
```bash
git add apps/api/src/users
git commit -m "feat(perm-profiles): assign/clear a user's permission profile"
```

---

### Task 6: Web — profiles settings page + user selector + nav

**Files:**
- Create: `apps/web/lib/hooks/usePermissionProfiles.ts`
- Create: `apps/web/app/v2/(org-admin)/settings/permission-profiles/page.tsx`
- Modify: `apps/web/lib/super-admin-nav.ts` + `apps/web/lib/staff-nav.ts`
- Modify: the user-management edit UI (locate via `grep -rl "UpdateUserDto\|/users/" apps/web` + the user edit form/drawer) to add a profile selector
- Modify: `apps/web/lib/types.ts` (types-only)
- Test: settings page test + (if a user-form test exists) the selector

**Interfaces:**
- Consumes: `/organizations/permission-profiles` (+ `/assignable-permissions`) (T2); `PATCH /users/:id { permissionProfileId }` (T5).

- [ ] **Step 1: hook** `usePermissionProfiles.ts` — authed apiFetch: list/create/update/delete profiles + fetch assignable permissions; mirror an existing settings hook (e.g. `useIntegrations`).
- [ ] **Step 2: failing settings-page test** — renders profiles list; create/edit shows the assignable-permission checkboxes (with descriptions); Save → POST/PATCH; delete surfaces the 409 "N users assigned" message. Run `npx jest permission-profiles` (apps/web).
- [ ] **Step 3: settings page** `/v2/(org-admin)/settings/permission-profiles/page.tsx` (mirror an existing settings page shell; org_admin group). Checkbox grid of assignable permissions keyed by the catalog GET. Deep-import ui; no shared VALUE import.
- [ ] **Step 4: user selector** — in the user edit UI, a "Permission profile" dropdown (org's profiles + a "Role default" option that sends `null`); include `permissionProfileId` in the update payload; show a "takes effect on the user's next login" note.
- [ ] **Step 5: nav** — `/settings/permission-profiles` in `super-admin-nav.ts` (icon) + `staff-nav.ts` `V2_ROUTES`.
- [ ] **Step 6: tests + tsc + commit.** `npx jest permission-profiles users` (apps/web); web suite (note only the known pre-existing ImpersonationBanner failure); `npx tsc -p apps/web/tsconfig.json --noEmit` (ignore stale `.next/types`; no NEW errors).
```bash
git add apps/web/lib apps/web/app/v2/'(org-admin)'/settings/permission-profiles apps/web/lib/super-admin-nav.ts apps/web/lib/staff-nav.ts
# plus the user-form files touched in Step 4
git commit -m "feat(perm-profiles): profiles settings page + user assignment selector + nav"
```

---

## Self-Review

**Spec coverage:** schema+RLS+User FK (T1) ✓; assignable allowlist + CRUD (T2) ✓; JWT field (T3) ✓; guard REPLACE resolution, fail-closed, tenant-scoped (T4) ✓; assignment via user update (T5) ✓; web profiles page + selector + nav (T6) ✓. Off-by-default via nullable `permissionProfileId` + the guard's unchanged no-profile path.

**Placeholder scan:** No TBD. T6 locates the user-form file via grep (path may move). Migration SQL given concretely; DTO nullable-id notes a fallback.

**Type/name consistency:** `permissionProfileId`, `permissionsJson`, `PermissionProfile` spelled identically across T1 schema, T2 service, T3 JWT, T4 guard, T5 assignment, T6 web. `ASSIGNABLE`/`NON_ASSIGNABLE_PERMISSION_KEYS` single-source in T2, referenced by T6's catalog GET. Migration `230000/1` > parked 210000/1 (api-usage) + 220000 (careers).

**Load-bearing risks:** (a) guard REPLACE + fail-closed + forTenant read (raw would 0-row-deny then arguably fall through — the impl must deny, not fall back) — T4 tests all four cases; (b) no-profile regression — T4 keeps the current guard tests green; (c) allowlist excludes the 3 escalation keys — T2 tests each rejection; (d) delete-while-assigned 409 — T2 tests it; (e) JWT staleness is intended (applies next login/refresh) — documented, and refresh re-reads so it's not permanent; (f) every token-mint path includes the field — T3 enumerates them.
