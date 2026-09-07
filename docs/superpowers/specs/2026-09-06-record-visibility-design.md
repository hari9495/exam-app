# Record-Level Visibility (Zoho #18-B) — Design

**Date:** 2026-09-06
**Status:** Approved (design), pending spec review
**Zoho adopt:** #18 subsystem B (record-level visibility). Fast-follow of #18-A (field-level permissions).
**Branch:** `feat/record-visibility` (off origin/main @ `fec52f3c`)

## Goal

Let an org restrict which **pipeline entries** (candidate-in-a-job) a governed staff role can see, on top of the existing tenant isolation. A governed user sees an entry iff it is assigned to them, assigned to one of their groups, or unassigned. Enforced airtight at the SQL layer so every read *and* write of `pipeline_entries` is filtered with no read-site enumeration.

## Scope

**In:** Record-level visibility on `pipeline_entries` only, enforced via a new Row-Level Security (RLS) filter policy. Per-org opt-in toggle. Config API + web settings toggle + nav.

**Out (deferred fast-follows):**
- Visibility on the standalone `Candidate` talent-pool list and `Job` list (neither carries a per-record owner today; would need a new ownership model + assignment UI).
- BLOCK predicate on writes (reassign-away rejection). v1 is FILTER-only.
- Panel-role record scoping (see Governed Roles).
- Configurable per-role governance (v1 governs recruiter only, fixed).

## Decisions (rulings baked in)

1. **Visibility unit = `PipelineEntry`.** Assignment (`assigned_user_id`, `assigned_group_id`) lives on `pipeline_entries` (schema.prisma:929-930). The "my candidates" (Team Collab #3) and "my team's candidates" (User Groups #10) board filters already read these; this feature makes them *enforced* rather than optional.

2. **Enforcement = RLS filter policy** (not application-level where-building). Airtight: any query over `pipeline_entries` is filtered by the DB. Chosen over a shared where-builder because record-level no-leak completeness is the whole point and app-level enforcement across the (~getBoard/exports/counts/reports/analytics) read surface is leak-prone.

3. **Unassigned entries = visible to all** governed users. Only *assigned* entries become private. Keeps a shared intake queue workable; recruiters can still pick up new candidates.

4. **Governed roles = `recruiter` only.** Panel access is scoped by *interview* assignment, not pipeline ownership; hiding entries from panelists would strand them on candidates they are set to interview but do not own. Admins (`org_admin`, `super_admin`) and `actingSuperAdmin` are exempt. (Field-level #18-A governed panel too, but that concerned PII fields — a different axis.)

5. **Org opt-in, default off.** `Organization.recordVisibilityEnabled = false` → today's behavior for every existing org.

6. **Fail-open on absent principal.** System/public/worker requests build a `TenantContext` with no `userId`/`role` → governed bit unset → predicate returns all rows. Required so public apply (`pipeline_entries` INSERT) and background workers keep working. FILTER predicates do not gate INSERT, so applies are safe regardless.

7. **FILTER predicate only, no BLOCK.** Reassigning your own entry to another owner is not rejected; you simply cannot see/act on rows already invisible to you.

## Architecture

### Config storage

Additive column:

```prisma
// model Organization
recordVisibilityEnabled Boolean @default(false) @map("record_visibility_enabled")
```

Migration `20260906140000_organization_record_visibility`:
```sql
ALTER TABLE [dbo].[organizations] ADD [record_visibility_enabled] BIT NOT NULL CONSTRAINT [DF_organizations_record_visibility_enabled] DEFAULT 0;
```
(Organization already carries the tenant RLS policy → additive column needs no paired `_rls`.)

### Session-context enrichment

`TenantContext` gains two optional fields:

```ts
export interface TenantContext {
  organizationId: string | null;
  isSuperAdmin: boolean;
  userId?: string | null;                 // NEW
  role?: string | null;                   // NEW
}
```

`@CurrentTenant` populates them from `request.user`, which the JWT strategy shapes as `{ userId: payload.sub, organizationId, role }` (confirmed) — no DB read:

```ts
return {
  organizationId: user?.organizationId ?? null,
  isSuperAdmin: user?.role === 'super_admin',
  userId: user?.userId ?? null,
  role: user?.role ?? null,
};
```

`forTenant` sets two additional `SESSION_CONTEXT` keys (only when present) alongside the existing `app_current_org` / `app_is_super_admin`, and resets them in the same `finally`:

```
app_current_user               = context.userId            (when set)
app_record_visibility_governed = 1 if context.role === 'recruiter' else 0
```

Reset (mirroring the existing reset, clearing the governed bit before the user id):
```
app_record_visibility_governed = 0
app_current_user               = NULL
```

**Governed-role membership is defined once** in shared code (a `RECORD_VISIBILITY_GOVERNED_ROLES = ['recruiter']` const) so the bit computation has a single source. `forTenant` (in `packages/shared`) can import it directly.

### RLS predicate function

Migration `20260906140001_record_visibility_rls` (separate `_rls` migration per the SQL-Server gotcha: a security-policy statement cannot share a batch with unrelated DDL).

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
  -- super admin sees everything
  CONVERT(BIT, ISNULL(SESSION_CONTEXT(N'app_is_super_admin'), 0)) = 1
  -- non-governed role, or system/public/worker path (no governed bit): everything
  OR CONVERT(BIT, ISNULL(SESSION_CONTEXT(N'app_record_visibility_governed'), 0)) = 0
  -- feature off for this org: everything
  OR NOT EXISTS (
       SELECT 1 FROM dbo.organizations o
       WHERE o.id = @OrgId AND o.record_visibility_enabled = 1
     )
  -- assigned to me
  OR @AssignedUser = TRY_CONVERT(UNIQUEIDENTIFIER, SESSION_CONTEXT(N'app_current_user'))
  -- assigned to one of my groups
  OR @AssignedGroup IN (
       SELECT gm.group_id FROM dbo.user_group_members gm
       WHERE gm.user_id = TRY_CONVERT(UNIQUEIDENTIFIER, SESSION_CONTEXT(N'app_current_user'))
     )
  -- unassigned: visible to all
  OR (@AssignedUser IS NULL AND @AssignedGroup IS NULL);
```

Then a **separate, new** security policy adding only a FILTER predicate on `pipeline_entries` (the tenant policy object is left untouched):

```sql
CREATE SECURITY POLICY dbo.RecordVisibilityPolicy
  ADD FILTER PREDICATE dbo.fn_record_visibility_predicate(
    organization_id, assigned_user_id, assigned_group_id
  ) ON dbo.pipeline_entries
  WITH (STATE = ON);
```

**Validation to perform during implementation:** confirm the nested read of `dbo.organizations` (itself tenant-RLS-protected) from within this predicate returns the row under the same `app_current_org`. If nested RLS suppresses it, fall back to a precomputed `app_record_visibility_on` session bit set app-side (org flag read once per request) and drop the correlated `EXISTS`.

### Enforcement is automatic

No changes to pipeline read methods. `getBoard`, `exportJobCandidatesCsv`, per-job candidate counts (`listJobs`), `reports.service` rows built from entries, and `pipeline-analytics` all query `pipeline_entries` and are filtered by the policy. Writes (`patchEntry` etc.) can only affect visible rows. Verified by tests, not by hand-threading.

### Config API

`OrganizationsController` (or a small dedicated controller, matching the field-permissions precedent):
- `GET /organizations/record-visibility` → `{ enabled: boolean }` — gated `org:manage_settings`.
- `PUT /organizations/record-visibility` — body DTO-wrapped `{ enabled: boolean }` (global ValidationPipe whitelist rejects a raw top-level scalar), gated `org:manage_settings`. Persists `recordVisibilityEnabled`; audit `organization.record_visibility_updated`.

### Web

- Hook `useRecordVisibility` (GET) + `useUpdateRecordVisibility` (PUT `{ enabled }`).
- Settings page `/settings/record-visibility` — a single toggle with an explanatory line ("When on, recruiters see only candidates assigned to them or their groups, plus unassigned candidates").
- Nav registration in `super-admin-nav.ts` (icon) + `staff-nav.ts` `V2_ROUTES`.
- Existing "my candidates" / "my team" board filters unchanged (harmless; for a governed recruiter they now filter within an already-restricted set).

## Data flow

1. Org admin toggles the setting → PUT persists `record_visibility_enabled = 1`.
2. A recruiter loads the board → request builds `TenantContext { userId, role: 'recruiter' }` → `forTenant` sets `app_current_user` + `app_record_visibility_governed = 1`.
3. `getBoard` queries `pipeline_entries` → `RecordVisibilityPolicy` FILTER predicate evaluates per row → recruiter gets only their / their groups' / unassigned entries.
4. An org admin loads the board → governed bit = 0 → predicate short-circuits → all org entries.
5. Public apply INSERTs an entry → no governed bit + FILTER predicates don't gate INSERT → succeeds.

## Error handling

- Feature off (default) or non-governed principal → predicate returns all rows: exact current behavior.
- Malformed/absent `app_current_user` → `TRY_CONVERT` yields NULL → "assigned to me" and "my group" branches simply don't match; unassigned + org-off + non-governed branches still apply. No error, fail-safe.
- Reset in `finally` clears the governed bit first, then the user id (mirrors the existing "clear the more dangerous flag first" ordering).

## Testing

- **Shared:** `RECORD_VISIBILITY_GOVERNED_ROLES` const + the governed-bit derivation (recruiter → 1; org_admin/panel/super_admin/absent → 0). `forTenant` sets/reset the two new keys (unit test asserting the `sp_set_session_context` calls, mirroring existing tenant-prisma tests).
- **API (integration against the RLS policy):** with the feature on and a seeded recruiter + groups + entries — recruiter sees own + group + unassigned, not others'; org_admin sees all; feature-off org → recruiter sees all; public-apply INSERT succeeds; a worker/system context sees all. Assert via `getBoard` and a raw count.
- **Config:** GET/PUT gated `org:manage_settings`; PUT persists + audits; validation rejects a non-boolean.
- **Web:** settings toggle renders current state, PUT on save; nav present in both files.
- **Migration:** `prisma migrate deploy` applies both; `prisma generate` clean; `tsc` clean; full api + shared jest green.

## Deploy notes

- Two additive migrations; **no seed change** (no new permission — `org:manage_settings` already exists).
- Ships with any api build; empty/off config = current behavior. Web page needs any web build.
- No exam-day deploy.
