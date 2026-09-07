# Field-Level Permissions (read-side) — Design Spec

**Date:** 2026-09-06
**Status:** Approved design, ready for implementation planning.
**Source:** Zoho adopt inventory #18 (field-level perms / record-level visibility). #18 decomposes into two independent subsystems; **this spec is subsystem A (field-level permissions), read-side.** Subsystem B (record-level visibility) and A's write-side enforcement are documented fast-follows.

## Goal

Let org admins hide sensitive **fields** on candidate/job records from specific staff roles (classically: interviewers on the `panel` role shouldn't see candidate contact info or job compensation). Enforced server-side on every authenticated read path that returns a governed field.

## Why

Authorization today is purely coarse route-level RBAC — within an org, any user holding a route's permission sees every field of every row it returns. Interview panelists hold `results:view`/`interview:view_assigned` and thus see candidate email/phone and job salary, which many orgs want withheld. Field-level hiding fills that gap without a new access axis.

## Decisions (locked during brainstorming)

1. **Read-side only in v1.** Write-side ("this role can't *edit* field X") is a documented fast-follow.
2. **Org-configurable**, stored in one `Organization.fieldPermissionsJson` column, edited on a new `/settings/field-permissions` page. No new permission (reuses `org:manage_settings`), no seed.
3. **Governed-field registry (curated allow-list)** — only fields safe to hide (the UI still functions):
   - `candidate`: `email`, `phone`
   - `job`: `salaryMin`, `salaryMax`, `salaryCurrency`, `headcount`
   The settings UI + server validation only accept these keys.
4. **Admins exempt.** `org_admin` and acting `super_admin` always see all fields; only `recruiter` and `panel` are governable.
5. **Hidden = null, not deleted.** Governed fields are set to `null` and their response types widen to nullable; deleting would break typed consumers. The web renders a hidden field as blank/"—".
6. **All authenticated read paths that surface a governed field enforce it** (no leak of a hidden field via another endpoint). Org-API-key path is exempt (admin-scoped); public/token apply endpoints don't return governed internal fields.

## Existing code this builds on

- **No field-level restriction exists today.** RBAC guard (`apps/api/src/rbac/permissions.guard.ts`) is role→permission, route-level only; `actingSuperAdmin` bypasses. Precedent for by-identity field omission: `SafeUser`/`SAFE_USER_SELECT` vs `PROFILE_USER_SELECT` in `apps/api/src/users/users.service.ts` (select-list omission) — but that's per-query; this feature adds a post-query redaction step because responses are hand-shaped with **no shared serializer**.
- **`TenantContext` carries the caller's role?** — verify: the guard loads `user.role`; the request user/role is available to controllers (via the auth decorators). The redaction resolver needs `role` + `organizationId` (both on the authenticated request/context). (Confirm how role reaches the service layer — likely a `@CurrentUser()`/request field; if only `@CurrentUserId()` is available, the resolver loads the user's role, or the controller passes role down.)
- **Config storage precedent:** `Organization.businessHoursJson`/`holidaysJson` (NVARCHAR(Max) JSON on Organization). Add `fieldPermissionsJson` the same way. `Organization` is already RLS-covered → additive column, no `_rls`, no seed.
- **Config-controller pattern:** `pipelines-config`/`custom-fields-config`/`approvals-config` controllers, each gated on a config permission; org settings mutations otherwise use `org:manage_settings` (org controller). A new `field-permissions-config` controller uses `org:manage_settings`.
- **Read paths to enforce at (from recon — ~the governed-field-bearing authenticated sites):**
  - `apps/api/src/candidates/candidates.service.ts`: `list` (~L194), `getProfile`, `lookupByEmail`, `exportData` (GDPR, ~L409).
  - `apps/api/src/pipeline/pipeline.service.ts`: `getBoard` (~L570, `BoardRow.candidateEmail`), `listJobs` (~L241), `getJob` (~L309), `exportJobCandidatesCsv` (~L525).
  - `apps/api/src/reports/reports.service.ts`: `getCandidateDetail` (~L330), `compareCandidates` (~L551), `getExportRows` (~L308).
  - Exempt: `public-api.service.ts` (org-API-key, admin-scoped); `public-applications.service.ts` (unauthenticated token — returns no governed internal fields).
- **Response field names differ across shapes** (the rename wrinkle): `Candidate.email`/`phone` vs `BoardRow.candidateEmail`; job salary fields keep their names on `JobWithCounts`/`getJob`. The registry uses **canonical keys**; each enforcement site supplies an alias map when its shape renames.
- **User Groups / settings UI / nav:** settings pages register in `apps/web/lib/super-admin-nav.ts` (`SUPER_ADMIN_FULL_NAV`) + `apps/web/lib/staff-nav.ts` (`V2_ROUTES`). Web can't import `@exam-platform/shared` VALUES → inline the registry/types web-side.
- **Migration:** latest `20260906120000_approval_step_group_id`; next `20260906130000_organization_field_permissions`.

## Architecture

### 1. Governed-field registry (shared, single source of truth)
`packages/shared/src/field-permissions/field-permissions.ts`:
```ts
export const GOVERNABLE_ROLES = ['recruiter', 'panel'] as const;      // admins never governed
export const GOVERNED_FIELDS = {
  candidate: ['email', 'phone'] as const,
  job: ['salaryMin', 'salaryMax', 'salaryCurrency', 'headcount'] as const,
};
export type FieldEntity = 'candidate' | 'job';
// config shape: { candidate?: { [role]: string[] }, job?: { [role]: string[] } }
export type FieldPermissionConfig = Partial<Record<FieldEntity, Partial<Record<string, string[]>>>>;
export function parseFieldPermissions(json: string | null | undefined): FieldPermissionConfig; // tolerant
export function validateFieldPermissions(input: unknown): FieldPermissionConfig; // throws on unknown entity/role/field
export function hiddenFieldsFor(cfg: FieldPermissionConfig, entity: FieldEntity, role: string): Set<string>; // admins → empty (caller decides), else cfg[entity][role] ∩ GOVERNED_FIELDS[entity]
```
(API imports the values; web inlines an equivalent copy — the no-shared-VALUES rule.)

### 2. Redaction helper (API, pure, unit-tested)
`apps/api/src/field-permissions/redact.ts`:
```ts
// Nulls each hidden canonical field on `row`, honoring an optional alias map (canonicalKey -> responsePropName).
export function redactFields<T extends Record<string, any>>(row: T, hidden: Set<string>, alias?: Record<string, string>): T;
export function redactMany<T>(rows: T[], hidden: Set<string>, alias?: Record<string, string>): T[];
```
Sets `row[prop] = null` for each hidden field (prop = `alias[key] ?? key`). Returns the same object (mutates a shallow copy). No-op when `hidden` is empty (the admin/no-config common path → zero overhead).

### 3. Resolver service (API)
`FieldPermissionsService` (in a new `field-permissions` module):
- `getHiddenFields(context, role, entity): Promise<Set<string>>` — if role ∉ GOVERNABLE_ROLES (i.e. admin) → empty set; else read `organization.fieldPermissionsJson` (via `forTenant`), `parseFieldPermissions`, `hiddenFieldsFor`. Cache within the request if cheap (optional).
- `getConfig(context)` / `setConfig(context, actorUserId, input)` — read/validate/persist the org JSON (config API).
- Exported so candidate/pipeline/reports services inject it.

### 4. Enforcement wiring
Each read path in the list above, after building its response, resolves the caller's hidden set for the entity and applies `redactFields`/`redactMany`:
- **candidate** sites: `hiddenFieldsFor(..., 'candidate', role)` → redact `email`/`phone` (alias `email→candidateEmail` on `BoardRow`; report rows per their shape).
- **job** sites: `hiddenFieldsFor(..., 'job', role)` → redact salary/headcount.
- The caller's `role` must reach these services (via context/request). Where a service method lacks role today, thread it from the controller (the controller has the authenticated user).
- Response interfaces widen the governed fields to nullable (`email: string | null`, `phone: string | null`, `salaryMin: number | null` — several are already nullable).
- **CSV exports**: redact the row objects before CSV encoding (so a hidden field emits blank).
- **GDPR `exportData`**: this is the data-subject's OWN data export (candidate-facing) — governed-field hiding is about STAFF roles viewing others' data; the GDPR export is invoked by staff with `candidate:data_rights` (admin-ish). RULING to confirm in plan: apply the same role-based redaction (a non-admin with data_rights still gets redacted) OR treat data_rights as admin-exempt. Default: redact by the caller's role like everything else (safe).

### 5. Config API + web
- `field-permissions-config.controller.ts` gated `@RequirePermissions('org:manage_settings')`: `GET /organizations/field-permissions` → current config (parsed); `PUT /organizations/field-permissions` → `validateFieldPermissions` then persist to `fieldPermissionsJson`.
- Web: `useFieldPermissions()` hook (GET/PUT); settings page `/settings/field-permissions` — a matrix per entity (rows = governed fields, columns = governable roles, checkbox = hidden), Save. Nav in both files. Inline the registry web-side.

## Testing

- **Registry/helpers:** `validateFieldPermissions` rejects unknown entity/role/field, accepts valid; `hiddenFieldsFor` intersects with the registry + returns empty for admin roles; `parseFieldPermissions` tolerates null/garbage.
- **redactFields:** nulls hidden fields (with + without alias); leaves non-hidden untouched; empty set = no-op; array variant.
- **Enforcement (per representative site):** a `panel` user with `{candidate:{panel:['email','phone']}}` gets `email`/`phone` null on candidate list + board (`candidateEmail`) + profile + report detail + CSV export (blank); an `org_admin` gets them in full (exempt); a `recruiter` with no rule gets them in full. Job salary hidden from a governed role on list/detail/board/export.
- **Config API:** GET returns parsed config; PUT validates (unknown field → 400) + persists + round-trips; gated `org:manage_settings`.
- **No-leak check:** a field hidden for a role is null on EVERY covered path for that role (list, board, profile, detail, compare, export, GDPR export).
- **Web:** matrix renders governed fields × roles, toggling + save calls PUT.

## Out of scope (v1)

- **Write-side field permissions** (can't-edit-field) — documented fast-follow; enforce in the update methods' conditional `data` spreads.
- **Record-level visibility** (#18-B) — separate spec.
- Governing fields beyond the curated registry, per-USER (vs per-role) rules, field-level rules on entities other than candidate/job.
- Hiding fields from `org_admin`/`super_admin`.
- The org-API-key and public/token paths (exempt as above).
- Distinguishing "hidden" from "genuinely null" in the response (v1 both read as null).

## Deploy notes

- One additive nullable column (`organization.field_permissions_json`) — no new table, no RLS, no seed. Ships with any api/web build. An org with no config = today's behavior exactly (empty hidden set → redact is a no-op). Depends only on the current `main`. Migration `20260906130000` sorts last.
