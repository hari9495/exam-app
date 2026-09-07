# Field-Level Permissions (read-side) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Org admins hide governed candidate/job fields (candidate email/phone; job salary×3 + headcount) from `recruiter`/`panel` roles; enforced by nulling those fields on every authenticated read path that returns them.

**Architecture:** A shared governed-field registry + a pure `redactFields` helper + a `FieldPermissionsService.getHiddenFields(context, role, entity)` resolver (reads `Organization.fieldPermissionsJson`; admins → empty set → no-op). Each governed read method threads the caller's `role` (via a new `@CurrentUserRole()` decorator) and redacts its response. Config via an `org:manage_settings` GET/PUT + a `/settings/field-permissions` matrix UI.

**Tech Stack:** NestJS + Prisma + SQL Server (mssql, RLS), Next.js App Router (v2 UI), class-validator, jest.

**Spec:** `docs/superpowers/specs/2026-09-06-field-permissions-design.md`

## Global Constraints

- **NEVER run `npm install`/`npm ci`/`npm update`** (worktree junction hazard). Use only `npx prisma generate`/`npx prisma migrate deploy`, `npx tsc`, `npx jest`. The shared package emits a dist consumed via node_modules → after editing `packages/shared`, rebuild it via `npx tsc` in `packages/shared`, and **run its own jest** (`cd packages/shared && npx jest`) — apps/api's jest does NOT cover shared specs (a prior feature shipped a red shared spec by forgetting this).
- **apps/web CANNOT import `@exam-platform/shared` VALUES at runtime** — inline the registry/types web-side. (Read `apps/web/AGENTS.md` before web edits.)
- **Migration:** one additive nullable column on `Organization` (already RLS-covered) → no `_rls`, no seed. `20260906130000_organization_field_permissions`.
- **Reuse `org:manage_settings`** for config (no new permission/seed).
- **Admins exempt:** `getHiddenFields` returns an empty set for any role ∉ `['recruiter','panel']` (org_admin/super_admin/actingSuperAdmin see all).
- **Hidden = null** (not delete); widen the governed response fields to nullable.
- Commit after each task (TDD: red → green → commit; end messages with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`).

---

## File Structure

**New:** `packages/shared/src/field-permissions/field-permissions.ts` (+ spec); `apps/api/src/field-permissions/redact.ts` (+ spec), `field-permissions.service.ts`, `field-permissions-config.controller.ts`, `field-permissions.module.ts`, `dto/update-field-permissions.dto.ts`; `apps/api/src/auth/current-user-role.decorator.ts`; `apps/web/lib/hooks/useFieldPermissions.ts`; `apps/web/app/v2/(org-admin)/settings/field-permissions/page.tsx`.
**Modified:** `apps/api/prisma/schema.prisma` + migration; `apps/api/src/app.module.ts`; `candidates.service.ts` + `candidates.controller.ts` + candidate response types; `pipeline.service.ts` + `pipeline.controller.ts` + `BoardRow`; their modules (import FieldPermissionsModule); `apps/web/lib/types.ts`, `super-admin-nav.ts`, `staff-nav.ts`.
**NOT touched:** `reports.service.ts` (recon confirmed it returns no governed fields).

---

### Task 1: Schema + migration (Organization.fieldPermissionsJson)

**Files:** Modify `apps/api/prisma/schema.prisma`; Create `apps/api/prisma/migrations/20260906130000_organization_field_permissions/migration.sql`.

- [ ] **Step 1:** Add to `model Organization` (near `businessHoursJson`, schema ~L59): `fieldPermissionsJson String? @map("field_permissions_json") @db.NVarChar(Max)`.
- [ ] **Step 2:** migration.sql: `ALTER TABLE [dbo].[organizations] ADD [field_permissions_json] NVARCHAR(MAX) NULL;` (verify Organization `@@map` is `organizations`).
- [ ] **Step 3:** `cd apps/api && npx prisma migrate deploy && npx prisma generate` (no `_rls`/seed); `npx tsc --noEmit` clean. (If migrate deploy errors → capture verbatim + DONE_WITH_CONCERNS; no npm install.)
- [ ] **Step 4:** Commit `feat(field-perms): add Organization.fieldPermissionsJson`.

---

### Task 2: Shared governed-field registry (pure, unit-tested)

**Files:** Create `packages/shared/src/field-permissions/field-permissions.ts` (+ `.spec.ts`); export it from the shared index if the package uses a barrel (check `packages/shared/src/index.ts`).

**Interfaces (Produces):**
```ts
export const GOVERNABLE_ROLES = ['recruiter', 'panel'] as const;
export const GOVERNED_FIELDS = {
  candidate: ['email', 'phone'] as const,
  job: ['salaryMin', 'salaryMax', 'salaryCurrency', 'headcount'] as const,
} as const;
export type FieldEntity = keyof typeof GOVERNED_FIELDS;
export type FieldPermissionConfig = Partial<Record<FieldEntity, Record<string, string[]>>>;
export function parseFieldPermissions(json: string | null | undefined): FieldPermissionConfig;
export function validateFieldPermissions(input: unknown): FieldPermissionConfig; // throws Error on bad shape
export function hiddenFieldsFor(cfg: FieldPermissionConfig, entity: FieldEntity, role: string): Set<string>;
```

- [ ] **Step 1: Write failing tests** (`field-permissions.spec.ts`): `parseFieldPermissions` null/`''`/invalid-JSON/non-object → `{}`; `validateFieldPermissions` accepts a valid `{candidate:{panel:['email']}}`, throws on unknown entity, unknown role (not in GOVERNABLE_ROLES), unknown field (not in GOVERNED_FIELDS[entity]), non-array value; `hiddenFieldsFor` → empty Set for an admin/unknown role, else the config's fields ∩ GOVERNED_FIELDS[entity] (drops any stale field not in the registry).
- [ ] **Step 2: Run red** `cd packages/shared && npx jest field-permissions`.
- [ ] **Step 3: Implement**
```ts
export function parseFieldPermissions(json: string | null | undefined): FieldPermissionConfig {
  if (!json) return {};
  try { const o = JSON.parse(json); return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; }
  catch { return {}; }
}
export function validateFieldPermissions(input: unknown): FieldPermissionConfig {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('config must be an object');
  const out: FieldPermissionConfig = {};
  for (const [entity, byRole] of Object.entries(input as Record<string, unknown>)) {
    if (!(entity in GOVERNED_FIELDS)) throw new Error(`unknown entity ${entity}`);
    if (!byRole || typeof byRole !== 'object' || Array.isArray(byRole)) throw new Error(`invalid roles map for ${entity}`);
    const allowed = GOVERNED_FIELDS[entity as FieldEntity] as readonly string[];
    const roleMap: Record<string, string[]> = {};
    for (const [role, fields] of Object.entries(byRole as Record<string, unknown>)) {
      if (!(GOVERNABLE_ROLES as readonly string[]).includes(role)) throw new Error(`role ${role} is not governable`);
      if (!Array.isArray(fields) || !fields.every((f) => typeof f === 'string')) throw new Error(`fields for ${entity}.${role} must be strings`);
      for (const f of fields) if (!allowed.includes(f)) throw new Error(`field ${f} is not governable on ${entity}`);
      roleMap[role] = [...new Set(fields as string[])];
    }
    out[entity as FieldEntity] = roleMap;
  }
  return out;
}
export function hiddenFieldsFor(cfg: FieldPermissionConfig, entity: FieldEntity, role: string): Set<string> {
  if (!(GOVERNABLE_ROLES as readonly string[]).includes(role)) return new Set();
  const allowed = GOVERNED_FIELDS[entity] as readonly string[];
  const fields = cfg[entity]?.[role] ?? [];
  return new Set(fields.filter((f) => allowed.includes(f)));
}
```
- [ ] **Step 4: Run green** `cd packages/shared && npx jest field-permissions`; rebuild dist `cd packages/shared && npx tsc`; **Step 5: Commit** `feat(field-perms): shared governed-field registry`.

---

### Task 3: API foundation — role decorator + redact helper + service + config API

**Files:** Create `current-user-role.decorator.ts`, `field-permissions/redact.ts` (+ spec), `field-permissions.service.ts`, `field-permissions-config.controller.ts`, `field-permissions.module.ts`, `dto/update-field-permissions.dto.ts`; modify `app.module.ts`.

**Interfaces (Produces):**
- `@CurrentUserRole()` → `request.user?.role` (string).
- `redactFields<T>(row, hidden: Set<string>, alias?: Record<string,string>): T`, `redactMany`.
- `FieldPermissionsService.getHiddenFields(context, role, entity): Promise<Set<string>>`; `getConfig(context)`; `setConfig(context, actorUserId, input)`.

- [ ] **Step 1: `@CurrentUserRole()`** — mirror `apps/api/src/auth/current-user-id.decorator.ts`:
```ts
export const CurrentUserRole = createParamDecorator((_d, ctx: ExecutionContext): string => {
  const req = ctx.switchToHttp().getRequest();
  return req.user?.role ?? '';
});
```
- [ ] **Step 2: redact helper + failing tests** `apps/api/src/field-permissions/redact.ts`:
```ts
export function redactFields<T extends Record<string, any>>(row: T, hidden: Set<string>, alias?: Record<string, string>): T {
  if (hidden.size === 0) return row;
  const out: any = { ...row };
  for (const key of hidden) { const prop = alias?.[key] ?? key; if (prop in out) out[prop] = null; }
  return out;
}
export function redactMany<T extends Record<string, any>>(rows: T[], hidden: Set<string>, alias?: Record<string, string>): T[] {
  return hidden.size === 0 ? rows : rows.map((r) => redactFields(r, hidden, alias));
}
```
Tests: nulls hidden (with + without alias); empty set = same ref (no-op); leaves non-hidden untouched; array variant; doesn't mutate the input object.
- [ ] **Step 3: `FieldPermissionsService`** (mirror `organizations.service` business-hours: plain `this.prisma`, `context.organizationId`, `audit.record` on write):
```ts
async getHiddenFields(context: TenantContext, role: string, entity: FieldEntity): Promise<Set<string>> {
  if (!(GOVERNABLE_ROLES as readonly string[]).includes(role)) return new Set();
  const org = await this.prisma.organization.findUnique({ where: { id: context.organizationId as string }, select: { fieldPermissionsJson: true } });
  return hiddenFieldsFor(parseFieldPermissions(org?.fieldPermissionsJson), entity, role);
}
getConfig(context) // → parseFieldPermissions(org.fieldPermissionsJson)
async setConfig(context, actorUserId, input) { const cfg = validateFieldPermissions(input); persist JSON.stringify(cfg); audit.record 'organization.field_permissions_updated'; return cfg; }
```
Import the shared registry values from `@exam-platform/shared` (API-side, allowed).
- [ ] **Step 4: DTO + controller** — `UpdateFieldPermissionsDto` permissive (`@IsObject() config?` or accept the raw body); the service's `validateFieldPermissions` is the real gate. Controller `@Controller('organizations')` addition OR a dedicated `field-permissions-config.controller.ts` — `GET /organizations/field-permissions` + `PUT /organizations/field-permissions`, BOTH `@RequirePermissions('org:manage_settings')`, `@CurrentTenant()`(+`@CurrentUserId()` on PUT). Register `FieldPermissionsModule` in `app.module.ts` (exports `FieldPermissionsService`).
- [ ] **Step 5: Tests** — redact spec (Step 2); service getHiddenFields (admin→empty; governed role→parsed set; unknown field in stored JSON dropped); config GET/PUT (validate rejects unknown field→error/400; round-trip); controller gated `org:manage_settings`. Run `cd apps/api && npx jest field-permissions`.
- [ ] **Step 6: tsc + commit** `feat(field-perms): role decorator + redact helper + service + config API`.

---

### Task 4: Enforce in candidates.service

**Files:** Modify `candidates.service.ts` (`list`, `lookupByEmail`, `exportData`), `candidates.controller.ts` (thread role), candidate response types, `candidates.module.ts` (import FieldPermissionsModule). Test: extend `candidates.service.spec.ts`.

- [ ] **Step 1: Failing tests** — a `panel` role with `{candidate:{panel:['email','phone']}}`: `list` items have `email`/`phone` null; `lookupByEmail` result has them null; `exportData().candidate` has them null. `org_admin` (or a role with no rule) → values intact. Mock `FieldPermissionsService.getHiddenFields`.
- [ ] **Step 2: Implement** — inject `FieldPermissionsService`. Add a `role: string` param to `list`, `lookupByEmail`, `exportData` (controller passes `@CurrentUserRole()`; `exportData` already has actorUserId — add role too). In each, after building the response: `const hidden = await this.fieldPerms.getHiddenFields(context, role, 'candidate');` then `page.data = redactMany(page.data, hidden)` / `result = redactFields(result, hidden)` / `export.candidate = redactFields(export.candidate, hidden)`. No alias (props are `email`/`phone`). **Widen types:** `CandidateListItem.email` → `string | null`; `lookupByEmail` return type → a `RedactedCandidate = Omit<Candidate,'email'|'phone'> & { email: string | null; phone: string | null }` (phone already nullable, but keep the mapped type uniform); `CandidateDataExport.candidate.email` → `string | null`.
- [ ] **Step 3: Run tests + tsc. Step 4: Commit** `feat(field-perms): enforce candidate field hiding`.

---

### Task 5: Enforce in pipeline.service

**Files:** Modify `pipeline.service.ts` (`getBoard`, `listJobs`, `getJob`, `exportJobCandidatesCsv`), `pipeline.controller.ts` (thread role), `BoardRow` type, `pipeline.module.ts` (import FieldPermissionsModule). Test: extend `pipeline.service.spec.ts`.

- [ ] **Step 1: Failing tests** — `panel` with `{candidate:{panel:['email']}}` → `getBoard` rows have `candidateEmail` null; `panel` with `{job:{panel:['salaryMin','salaryMax','salaryCurrency','headcount']}}` → `listJobs`/`getJob` have those null; `exportJobCandidatesCsv` blanks the Email/Phone cells when candidate email/phone hidden. Admin → intact.
- [ ] **Step 2: Implement** — inject `FieldPermissionsService`; add `role: string` param to the four methods (controller passes `@CurrentUserRole()`).
  - `getBoard`: `const hiddenC = await getHiddenFields(context, role, 'candidate');` redact rows with alias `{ email: 'candidateEmail' }` (board has no phone); widen `BoardRow.candidateEmail` → `string | null`. (No job fields on BoardRow.)
  - `listJobs`/`getJob`: `const hiddenJ = await getHiddenFields(context, role, 'job');` `redactMany`/`redactFields` (no alias; salary/headcount already nullable).
  - `exportJobCandidatesCsv`: compute `hiddenC`; when building each row array, if `hidden has 'email'` emit `''` for the Email cell (index 1), if `'phone'` emit `''` for Phone (index 2) — before `csvEscape`.
- [ ] **Step 3: Run tests + tsc. Step 4: Commit** `feat(field-perms): enforce job/board field hiding`.

---

### Task 6: Web — hook + settings matrix + nav

**Files:** Create `apps/web/lib/hooks/useFieldPermissions.ts`, `apps/web/app/v2/(org-admin)/settings/field-permissions/page.tsx`; modify `apps/web/lib/types.ts`, `super-admin-nav.ts`, `staff-nav.ts`. Test: a settings-page render/save test.

- [ ] **Step 1: Types + hook** — inline in `types.ts`: `GOVERNABLE_ROLES`/`GOVERNED_FIELDS` (mirror shared) + `FieldPermissionConfig` type. `useFieldPermissions()` (GET `/organizations/field-permissions`) + `useUpdateFieldPermissions()` (PUT + invalidate) — mirror `useBusinessHours.ts`.
- [ ] **Step 2: Settings page** `/settings/field-permissions` (`'use client'`, mirror `business-hours/page.tsx`; `Button` imported directly, not the barrel): for each entity (candidate, job), a matrix — rows = `GOVERNED_FIELDS[entity]`, columns = `GOVERNABLE_ROLES`, a checkbox at (field,role) = "hidden". Hydrate from `useFieldPermissions`, edit local state, Save → PUT the assembled `{candidate:{role:[fields]}, job:{...}}` (only include checked). Success/error Notice.
- [ ] **Step 3: Nav** — `super-admin-nav.ts` `SUPER_ADMIN_FULL_NAV`: `{ href: '/settings/field-permissions', label: 'Field permissions', icon: <lucide, e.g. EyeOff> }` (import it). Add `'/settings/field-permissions'` to `V2_ROUTES` in `staff-nav.ts`.
- [ ] **Step 4: Test** — render page with hooks mocked; toggling a (field,role) checkbox + Save calls the PUT with the right config; seeded config renders checked boxes. `npx jest field-permissions` (web).
- [ ] **Step 5: tsc + commit** `feat(field-perms): web settings matrix + hook + nav`.

---

## Self-Review Notes (author)

- **Spec coverage:** column+migration (T1); registry (T2); decorator+redact+service+config API (T3); candidate enforcement (T4); job/board/CSV enforcement (T5); web matrix (T6). `reports.service` correctly excluded (recon: no governed fields). Write-side + record-visibility remain out-of-scope fast-follows.
- **Role plumbing:** `@CurrentUserRole()` (new, reads `request.user.role`) threaded as a `role` param into the 7 governed read methods; admins → `getHiddenFields` empty → `redact` no-op (zero overhead).
- **Type widening (the one non-mechanical bit):** `email` is non-nullable in Prisma, so nulling it forces widening `CandidateListItem.email`, the `lookupByEmail` return type, `CandidateDataExport.candidate.email`, and `BoardRow.candidateEmail` to `string | null`. Job salary/headcount + candidate phone are already nullable.
- **Registry consistency:** `GOVERNED_FIELDS`/`GOVERNABLE_ROLES` are the single source (shared, T2); the web copy (T6) is an inlined duplicate per the no-shared-VALUES rule — keep them in sync.
- **Shared-jest reminder** baked into T2 (a prior feature shipped a red shared spec by only running apps/api jest).
- **No-leak:** every authenticated path that carries a governed field is covered — candidate `list`/`lookupByEmail`/`exportData`, pipeline `getBoard`/`listJobs`/`getJob`/`exportJobCandidatesCsv`. Exempt (documented): org-API-key + public/token paths; `reports.service` (no governed fields); `getProfile` (résumé data only).
- **Migration** `20260906130000` additive, no RLS/seed, sorts last.
