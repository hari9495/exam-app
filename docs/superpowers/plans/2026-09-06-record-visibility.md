# Record-Level Visibility (Zoho #18-B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an org restrict which pipeline entries a recruiter can see (assigned-to-me / my-group / unassigned), enforced airtight via a new RLS filter policy on `pipeline_entries`.

**Architecture:** Additive org toggle column; `TenantContext` + `forTenant` carry the acting user id and a governed-role bit into `SESSION_CONTEXT`; a new `SCHEMABINDING` predicate function + a separate FILTER security policy on `pipeline_entries` filter every read and write at the DB. No pipeline read-method changes.

**Tech Stack:** NestJS, Prisma, SQL Server (RLS via SESSION_CONTEXT + security policies), Next.js (apps/web), Jest.

**Spec:** docs/superpowers/specs/2026-09-06-record-visibility-design.md

## Global Constraints

- **Base:** branch `feat/record-visibility` off origin/main @ `fec52f3c`. Work in the main checkout, NOT a worktree (junction disk-fill hazard).
- **NEVER** run `npm install` / `npm ci` / `npm update` (worktree/junction hazard). Use only `npx prisma generate` / `npx prisma migrate deploy` / existing `jest` / `tsc`.
- **`packages/shared` has its OWN jest runner.** apps/api jest does NOT cover shared specs — run `packages/shared` jest whenever shared code changes (T2). After changing shared source, rebuild its dist (`npm run build` inside packages/shared is a build, not an install — allowed).
- **Web CANNOT import `@exam-platform/shared` VALUES at runtime** — types-only imports OK; inline any needed constant web-side.
- **SQL-Server RLS gotchas:** a security-policy statement cannot share a batch with unrelated DDL → RLS lives in its own `_rls` migration (T3). Additive columns on an already-RLS table need NO `_rls` (T1). Use `BIT` for booleans, `NVARCHAR(Max)` for JSON.
- **Migrations are hand-authored additive raw SQL.** Numbers: `20260906140000` (column), `20260906140001` (rls). These sort after everything on origin/main and the parked branches.
- **No new permission / no seed change** — `org:manage_settings` already exists.
- **Governed role = `recruiter` only** (not panel). Admins/super-admin/system/public paths are exempt (see fail-open).
- **Fail-open on absent principal:** no `userId`/governed-role in context → governed bit unset → predicate returns all rows. Required for public apply + workers.
- **Do not weaken the existing tenant RLS.** The record-visibility policy is a SEPARATE new policy object; the tenant policy and `fn_tenant_access_predicate` are left byte-for-byte untouched.
- Attribution footer on every commit: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

### Task 1: Config column + migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (model `Organization`)
- Create: `apps/api/prisma/migrations/20260906140000_organization_record_visibility/migration.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: `Organization.recordVisibilityEnabled: boolean` (Prisma), column `organizations.record_visibility_enabled BIT NOT NULL DEFAULT 0`.

- [ ] **Step 1: Add the field to the `Organization` model.** Place next to other org-level config columns:

```prisma
recordVisibilityEnabled Boolean @default(false) @map("record_visibility_enabled")
```

- [ ] **Step 2: Author the migration SQL.** `apps/api/prisma/migrations/20260906140000_organization_record_visibility/migration.sql`:

```sql
ALTER TABLE [dbo].[organizations]
  ADD [record_visibility_enabled] BIT NOT NULL
  CONSTRAINT [DF_organizations_record_visibility_enabled] DEFAULT 0;
```

- [ ] **Step 3: Apply + regenerate.**

Run: `npx prisma migrate deploy` then `npx prisma generate` (both from `apps/api`).
Expected: migration `20260906140000_organization_record_visibility` applied; client regenerated with `recordVisibilityEnabled`.

- [ ] **Step 4: Typecheck.**

Run: `npx tsc -p apps/api/tsconfig.json --noEmit` (or the repo's api typecheck script).
Expected: clean.

- [ ] **Step 5: Commit.**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260906140000_organization_record_visibility
git commit -m "feat(record-visibility): organizations.record_visibility_enabled column"
```

---

### Task 2: Shared — governed-role const, TenantContext, @CurrentTenant, forTenant session keys

**Files:**
- Create: `packages/shared/src/record-visibility/record-visibility.ts`
- Modify: `packages/shared/src/index.ts` (barrel export)
- Modify: `packages/shared/src/prisma/tenant-context.ts`
- Modify: `packages/shared/src/prisma/tenant-prisma.service.ts` (`forTenant`, `resetSessionContext`)
- Modify: `apps/api/src/auth/current-tenant.decorator.ts`
- Test: `packages/shared/src/record-visibility/record-visibility.spec.ts`
- Test: `packages/shared/src/prisma/tenant-prisma.service.spec.ts` (extend existing if present; else create)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `RECORD_VISIBILITY_GOVERNED_ROLES: readonly string[]` = `['recruiter']`
  - `isRecordVisibilityGoverned(role: string | null | undefined): boolean`
  - `TenantContext` gains `userId?: string | null` and `role?: string | null`
  - `forTenant` sets `SESSION_CONTEXT` keys `app_current_user` and `app_record_visibility_governed` when derivable, and resets them.

- [ ] **Step 1: Write the failing shared test** `record-visibility.spec.ts`:

```ts
import { RECORD_VISIBILITY_GOVERNED_ROLES, isRecordVisibilityGoverned } from './record-visibility';

describe('record-visibility governed roles', () => {
  it('governs recruiter only', () => {
    expect(RECORD_VISIBILITY_GOVERNED_ROLES).toEqual(['recruiter']);
    expect(isRecordVisibilityGoverned('recruiter')).toBe(true);
  });
  it('does not govern admins, panel, super_admin, or an absent role', () => {
    for (const r of ['org_admin', 'panel', 'super_admin', '', null, undefined]) {
      expect(isRecordVisibilityGoverned(r as string | null | undefined)).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Run it, verify it fails.**

Run (packages/shared jest): `npx jest record-visibility --config packages/shared/jest.config.js` (use the repo's shared jest invocation).
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `record-visibility.ts`:**

```ts
// Roles whose members are restricted to pipeline entries assigned to them,
// their groups, or unassigned, when an org enables record-level visibility.
// Recruiter only: panel access is scoped by interview assignment, not pipeline
// ownership, so hiding entries would strand panelists on candidates they are
// set to interview. Admins/super-admin are exempt.
export const RECORD_VISIBILITY_GOVERNED_ROLES = ['recruiter'] as const;

export function isRecordVisibilityGoverned(role: string | null | undefined): boolean {
  return role != null && (RECORD_VISIBILITY_GOVERNED_ROLES as readonly string[]).includes(role);
}
```

- [ ] **Step 4: Barrel export** in `packages/shared/src/index.ts`:

```ts
export * from './record-visibility/record-visibility';
```

- [ ] **Step 5: Run the shared test, verify it passes.**

Run: `npx jest record-visibility --config packages/shared/jest.config.js`.
Expected: PASS.

- [ ] **Step 6: Extend `TenantContext`** (`packages/shared/src/prisma/tenant-context.ts`):

```ts
export interface TenantContext {
  organizationId: string | null;
  isSuperAdmin: boolean;
  userId?: string | null;
  role?: string | null;
}
```

- [ ] **Step 7: Enrich `@CurrentTenant`** (`apps/api/src/auth/current-tenant.decorator.ts`). `request.user` is `{ userId, organizationId, role }` (JWT strategy: `userId = payload.sub`):

```ts
const user = request.user as { userId?: string; organizationId: string | null; role: string } | undefined;
return {
  organizationId: user?.organizationId ?? null,
  isSuperAdmin: user?.role === 'super_admin',
  userId: user?.userId ?? null,
  role: user?.role ?? null,
};
```

- [ ] **Step 8: Write the failing `forTenant` test.** Extend the tenant-prisma spec: mock `tx.$executeRaw` and assert that for a context with `userId: 'U1', role: 'recruiter'`, `forTenant` issues `sp_set_session_context` for `app_current_user` (= 'U1') and `app_record_visibility_governed` (= 1), and in the finally issues resets (`app_record_visibility_governed` = 0, `app_current_user` = NULL). Also assert that for `role: 'org_admin'` the governed key is set to 0, and for a context with no `userId` the `app_current_user` set is skipped (or NULL). Match the existing spec's mocking style for `$transaction`/`$executeRaw`.

Run: `npx jest tenant-prisma --config packages/shared/jest.config.js`.
Expected: FAIL.

- [ ] **Step 9: Implement the `forTenant` changes.** In the `$transaction` callback, after the existing two `sp_set_session_context` calls, add (using `Prisma.sql`-safe interpolation exactly as the existing calls do):

```ts
if (context.userId) {
  await tx.$executeRaw`EXEC sp_set_session_context @key = N'app_current_user', @value = ${context.userId}`;
}
await tx.$executeRaw`EXEC sp_set_session_context @key = N'app_record_visibility_governed', @value = ${isRecordVisibilityGoverned(context.role) ? 1 : 0}`;
```

In `resetSessionContext`, clear the governed bit FIRST (more dangerous → mirrors the existing "clear super-admin first" ordering), then the user id — prepend to the existing resets:

```ts
await tx.$executeRaw`EXEC sp_set_session_context @key = N'app_record_visibility_governed', @value = 0`;
await tx.$executeRaw`EXEC sp_set_session_context @key = N'app_current_user', @value = NULL`;
// ...existing app_is_super_admin=0 and app_current_org=NULL resets follow
```

Import `isRecordVisibilityGoverned` from `../record-visibility/record-visibility`.

- [ ] **Step 10: Run the forTenant test, verify it passes.**

Run: `npx jest tenant-prisma --config packages/shared/jest.config.js`.
Expected: PASS.

- [ ] **Step 11: Rebuild shared dist + typecheck consumers.**

Run: build `packages/shared` (its build script, NOT install) so the dist symlinked into node_modules reflects the new exports + TenantContext; then `npx tsc -p apps/api/tsconfig.json --noEmit`.
Expected: shared builds; api typechecks clean.

- [ ] **Step 12: Commit.**

```bash
git add packages/shared/src apps/api/src/auth/current-tenant.decorator.ts
git commit -m "feat(record-visibility): thread user id + governed-role bit into session context"
```

---

### Task 3: RLS predicate function + FILTER policy migration

**Files:**
- Create: `apps/api/prisma/migrations/20260906140001_record_visibility_rls/migration.sql`

**Interfaces:**
- Consumes: `organizations.record_visibility_enabled` (T1); session keys `app_current_user`, `app_record_visibility_governed`, `app_is_super_admin` (T2); `user_group_members(user_id, group_id)`; `pipeline_entries(organization_id, assigned_user_id, assigned_group_id)`.
- Produces: `dbo.fn_record_visibility_predicate`, `dbo.RecordVisibilityPolicy` (FILTER predicate on `pipeline_entries`).

- [ ] **Step 1: Author the migration SQL.** Function and policy are separate batches (the migration runner splits on `GO` if supported; if not, this project's convention is one statement per migration file — check a prior `_rls` migration, e.g. `20260906100001_user_groups_rls`, and match its batch-separation convention exactly). Content:

```sql
CREATE FUNCTION dbo.fn_record_visibility_predicate(
  @OrgId          UNIQUEIDENTIFIER,
  @AssignedUser   UNIQUEIDENTIFIER,
  @AssignedGroup  UNIQUEIDENTIFIER
)
RETURNS TABLE
WITH SCHEMABINDING
AS
RETURN SELECT 1 AS fn_result
WHERE
  CONVERT(BIT, ISNULL(SESSION_CONTEXT(N'app_is_super_admin'), 0)) = 1
  OR CONVERT(BIT, ISNULL(SESSION_CONTEXT(N'app_record_visibility_governed'), 0)) = 0
  OR NOT EXISTS (
       SELECT 1 FROM dbo.organizations o
       WHERE o.id = @OrgId AND o.record_visibility_enabled = 1
     )
  OR @AssignedUser = TRY_CONVERT(UNIQUEIDENTIFIER, SESSION_CONTEXT(N'app_current_user'))
  OR @AssignedGroup IN (
       SELECT gm.group_id FROM dbo.user_group_members gm
       WHERE gm.user_id = TRY_CONVERT(UNIQUEIDENTIFIER, SESSION_CONTEXT(N'app_current_user'))
     )
  OR (@AssignedUser IS NULL AND @AssignedGroup IS NULL);
```

Then (separate batch):

```sql
CREATE SECURITY POLICY dbo.RecordVisibilityPolicy
  ADD FILTER PREDICATE dbo.fn_record_visibility_predicate(
    organization_id, assigned_user_id, assigned_group_id
  ) ON dbo.pipeline_entries
  WITH (STATE = ON);
```

- [ ] **Step 2: Apply the migration.**

Run: `npx prisma migrate deploy` (from `apps/api`).
Expected: `20260906140001_record_visibility_rls` applied with no error (function + policy created).

- [ ] **Step 3: Validate the nested org-config read under RLS.** In a throwaway sql/psql-equivalent check (or a quick jest integration in T5), with `app_current_org` set to an org and `app_record_visibility_governed=1`, `app_current_user` set to a recruiter, confirm a `SELECT COUNT(*) FROM pipeline_entries` returns the visible subset (i.e. the `NOT EXISTS(organizations ...)` branch correctly reads the org row under tenant RLS). If the org row is NOT readable from inside the predicate (feature would wrongly appear "on"/"off"), STOP and apply the fallback:
  - Fallback: drop the `NOT EXISTS(organizations...)` branch; instead set `app_record_visibility_on` in `forTenant` (computed app-side as `context.recordVisibilityEnabled` — requiring an org-flag read once per request in the enforcement path) and add `OR CONVERT(BIT, ISNULL(SESSION_CONTEXT(N'app_record_visibility_on'),0)) = 0` to the predicate. Record the choice as a ledger ruling. (Primary path preferred; this validation exists to confirm it.)

- [ ] **Step 4: Commit.**

```bash
git add apps/api/prisma/migrations/20260906140001_record_visibility_rls
git commit -m "feat(record-visibility): RLS predicate + filter policy on pipeline_entries"
```

---

### Task 4: Config API (GET/PUT + DTO + audit)

**Files:**
- Create: `apps/api/src/organizations/record-visibility-config.controller.ts`
- Create: `apps/api/src/organizations/dto/update-record-visibility.dto.ts`
- Modify: `apps/api/src/organizations/organizations.service.ts` (add `getRecordVisibility` / `setRecordVisibility`) — or a small dedicated service if that file is large; follow the field-permissions precedent (`field-permissions.service.ts` + `field-permissions-config.controller.ts`).
- Modify: `apps/api/src/organizations/organizations.module.ts` (register controller/provider)
- Test: `apps/api/src/organizations/record-visibility-config.controller.spec.ts`
- Test: service spec alongside whichever service owns the methods.

**Interfaces:**
- Consumes: `Organization.recordVisibilityEnabled` (T1); `TenantPrismaService.forTenant`; `AuditService`; `@RequirePermissions`, `PermissionsGuard`, `@CurrentTenant`.
- Produces: `GET /organizations/record-visibility` → `{ enabled: boolean }`; `PUT /organizations/record-visibility` body `{ enabled: boolean }` → `{ enabled: boolean }`. Both gated `org:manage_settings`.

- [ ] **Step 1: Write the DTO.** `update-record-visibility.dto.ts`:

```ts
import { IsBoolean } from 'class-validator';
export class UpdateRecordVisibilityDto {
  @IsBoolean()
  enabled!: boolean;
}
```

(Body is the DTO object `{ enabled }` — the global ValidationPipe `whitelist` rejects a raw top-level scalar, same reason field-permissions wraps its body as `{ config }`.)

- [ ] **Step 2: Write the failing controller spec.** Assert: GET returns `{ enabled }` from the service; PUT calls `setRecordVisibility(context, dto.enabled)` and returns `{ enabled }`; BOTH routes carry `@RequirePermissions('org:manage_settings')` metadata (mirror the assertion style in `field-permissions-config.controller.spec.ts`).

Run: `npx jest record-visibility-config.controller`.
Expected: FAIL.

- [ ] **Step 3: Implement the service methods.** `getRecordVisibility(context)` reads `organization.findFirstOrThrow` (tenant-scoped via `forTenant`) → `{ enabled: org.recordVisibilityEnabled }`. `setRecordVisibility(context, enabled)` updates the org row and writes audit `organization.record_visibility_updated` (audit OUTSIDE the write tx if that is the established pattern — check `field-permissions.service.setConfig`), returns `{ enabled }`.

- [ ] **Step 4: Implement the controller** — GET + PUT, both `@UseGuards(...PermissionsGuard)` + `@RequirePermissions('org:manage_settings')`, `@CurrentTenant()` context, PUT `@Body() dto: UpdateRecordVisibilityDto`.

- [ ] **Step 5: Register** the controller (+ service if new) in `organizations.module.ts`.

- [ ] **Step 6: Run specs + typecheck.**

Run: `npx jest record-visibility` (api) and `npx tsc -p apps/api/tsconfig.json --noEmit`.
Expected: PASS + clean.

- [ ] **Step 7: Commit.**

```bash
git add apps/api/src/organizations
git commit -m "feat(record-visibility): GET/PUT config endpoints, gated org:manage_settings"
```

---

### Task 5: Enforcement verification (integration tests, no product code)

**Files:**
- Create/modify: `apps/api/src/pipeline/pipeline.service.spec.ts` (or a dedicated `record-visibility.integration.spec.ts` if the suite uses a real DB harness) — match how existing pipeline specs exercise `getBoard` (mocked tx vs real DB).

**Interfaces:**
- Consumes: everything from T1-T4. No new product code.

**Note on approach:** If pipeline specs mock the Prisma tx (no real RLS engine), a mock cannot exercise a SQL policy. In that case, assert the *plumbing* instead: (a) `forTenant` receives a context with `userId`+`role` on the board read path (proves the session keys will be set), and (b) add a real-DB integration spec ONLY if the repo already has a real-DB test harness. If there is NO real-DB harness, record a ledger ruling that RLS enforcement is validated by the T3 manual SQL check + the T2 session-key unit test, and keep T5 to the plumbing assertion. Do NOT stand up a new DB test harness.

- [ ] **Step 1: Determine the test harness.** Inspect `pipeline.service.spec.ts` and any `*.e2e-spec.ts` / test DB setup. Decide: real-DB integration vs plumbing-only. Record the decision.

- [ ] **Step 2 (real-DB path): Write RLS integration tests.** Seed one org (feature ON), two recruiters R1/R2, one group G with R1 as member, and entries: E_r1 (assigned R1), E_g (assigned G), E_r2 (assigned R2), E_unassigned. Assert via `forTenant` with each principal:
  - R1 (recruiter) sees E_r1, E_g, E_unassigned; NOT E_r2.
  - R2 (recruiter) sees E_r2, E_unassigned; NOT E_r1, E_g.
  - org_admin sees all four.
  - Same org with feature OFF → R1 sees all four.
  - A system/no-principal context (`forTenant` with no userId/role) → all four.
  - Public-apply-style INSERT into `pipeline_entries` succeeds under a no-principal context.

- [ ] **Step 2 (plumbing-only path): Write plumbing assertions.** Assert the board read path builds/forwards a `TenantContext` carrying `userId` + `role`, so `forTenant` will set the governed session keys. Keep the T3 SQL check as the RLS proof.

- [ ] **Step 3: Run.**

Run: `npx jest pipeline` (+ the new spec).
Expected: PASS.

- [ ] **Step 4: Full api + shared suite.**

Run: `npx jest` (apps/api) and `npx jest --config packages/shared/jest.config.js` (shared).
Expected: green (allow only known pre-existing unrelated failures; note any in the report).

- [ ] **Step 5: Commit.**

```bash
git add apps/api/src/pipeline
git commit -m "test(record-visibility): enforcement + fail-open verification"
```

---

### Task 6: Web — settings toggle, hooks, nav

**Files:**
- Create: `apps/web/lib/hooks/useRecordVisibility.ts`
- Create: `apps/web/app/v2/(org-admin)/settings/record-visibility/page.tsx`
- Modify: `apps/web/lib/super-admin-nav.ts` (nav item + icon import)
- Modify: `apps/web/lib/staff-nav.ts` (`V2_ROUTES` set)
- Test: `apps/web/app/v2/(org-admin)/settings/record-visibility/page.test.tsx`

**Interfaces:**
- Consumes: `GET/PUT /organizations/record-visibility` (T4).
- Produces: a settings page at `/settings/record-visibility`.

- [ ] **Step 1: Hooks** `useRecordVisibility.ts` — a query hook (GET → `{ enabled }`) and a mutation hook (PUT body `{ enabled }`), following `useFieldPermissions.ts`'s client + patterns (same api client, same query-key conventions).

- [ ] **Step 2: Write the failing page test.** Render the page: it shows the current toggle state from the hook (mock GET → `{ enabled: false }`), and toggling + Save calls the PUT mutation with `{ enabled: true }`. Mirror `settings/field-permissions/page.test.tsx` setup.

Run: `npx jest record-visibility` (web).
Expected: FAIL.

- [ ] **Step 3: Implement the page** — a single labeled toggle (checkbox/switch) + explanatory copy ("When on, recruiters see only candidates assigned to them or their groups, plus unassigned candidates"), a Save button firing the mutation. Match the field-permissions settings page's shell, loading, and Save affordances. Use existing v2 UI primitives.

- [ ] **Step 4: Nav registration.**
  - `super-admin-nav.ts`: add `{ href: '/settings/record-visibility', label: 'Record Visibility', icon: <ShieldQuestion or EyeOff-adjacent lucide icon> }` (pick an unused lucide icon; import it in the top import line).
  - `staff-nav.ts`: add `'/settings/record-visibility'` to the `V2_ROUTES` set.

- [ ] **Step 5: Run the page test + web suite.**

Run: `npx jest record-visibility` (web) then the web suite (`npx jest` in apps/web).
Expected: PASS (allow the known pre-existing ImpersonationBanner failure; note it).

- [ ] **Step 6: Typecheck web.**

Run: `npx tsc -p apps/web/tsconfig.json --noEmit`.
Expected: clean (ignore pre-existing stale `.next/types` noise if present; confirm no NEW errors from this task).

- [ ] **Step 7: Commit.**

```bash
git add apps/web/lib apps/web/app/v2/'(org-admin)'/settings/record-visibility
git commit -m "feat(record-visibility): org-admin settings toggle + hooks + nav"
```

---

## Self-Review

**Spec coverage:** Config column (T1) ✓; session enrichment + governed const (T2) ✓; RLS predicate + policy (T3) ✓; config API (T4) ✓; enforcement/fail-open verification (T5) ✓; web toggle + nav (T6) ✓. Automatic enforcement of getBoard/exports/counts/reports/analytics is a *consequence* of T3 (no per-path code) — covered by T5 verification.

**Placeholder scan:** No TBD/TODO. The two "check the prior convention" notes (T3 batch separation via a real `_rls` migration; T4 audit-outside-tx via `field-permissions.service`) point at concrete existing files, not vague guidance. T5's harness branch is a real decision with both paths specified.

**Type consistency:** `TenantContext.userId`/`role` (T2) match `@CurrentTenant` output (T2) and `forTenant` reads (T2). `isRecordVisibilityGoverned` (T2) is the single source for the governed bit. Session keys `app_current_user` / `app_record_visibility_governed` are spelled identically in T2 (set) and T3 (predicate). API shape `{ enabled }` matches across T4 (server) and T6 (hooks/page). Migration numbers 140000/140001 are unique and ordered.

**Load-bearing risk (T3 nested org read):** mitigated by an explicit validation step with a specified fallback and a ledger-ruling instruction.
