# Custom Fields (Candidate + Job) — Design Spec

**Date:** 2026-09-06
**Status:** Approved design, ready for implementation planning.
**Source:** Zoho adopt inventory #8 (custom fields on candidate/job records). See `docs/ats/zoho-adopt-inventory.md`.

## Goal

Let org admins define their own fields on **Candidate** and **Job** records (types: text, number, date, single-select), rendered on the create/edit forms and detail views, plus candidate fields optionally shown on the **public apply form**. Values are stored in a queryable EAV table so they can be filtered/reported on later.

## Why

Every org tracks something the fixed schema doesn't — a candidate's visa status, a job's cost center, a referral source. Today that lives in notes or nowhere. Admin-defined custom fields cover it without a schema change per org, and an EAV value store keeps them reportable rather than trapped in an opaque JSON blob.

## Decisions (locked during brainstorming)

1. **Both entities** — `Candidate` and `Job` both get custom fields, served by one definition table discriminated by `entityType`.
2. **EAV value store** (not a JSON blob) — a `CustomFieldValue` table with **typed value columns** (`valueText`/`valueNumber`/`valueDate`) so numbers and dates sort/filter correctly in SQL. Chosen specifically for future filter/report use.
3. **Four field types** — `text` (single-line), `number`, `date`, `select` (single-select, admin-defined options).
4. **Public apply form** — candidate custom fields flagged `showOnApply` render on the public apply form and are validated server-side at that trust boundary. Job custom fields are **internal-only**.
5. **Reuse `org:manage_settings`** — no new permission; org_admin already holds it, so no seed/grandfather step.
6. **Polymorphic value rows** — `entityType` + `entityId`, no hard FK (only two entity types); erase/delete paths clear values explicitly.
7. **Soft archive** — definitions carry `archivedAt`; archiving hides inputs but preserves stored values.

## Existing code this builds on

Closest end-to-end pattern to copy is **configurable pipelines** (admin defines rows that drive UI):

- **Schema:** `apps/api/prisma/schema.prisma` — `model Candidate` (~L510) and `model Job` (~L843); tenant convention `organizationId String @map("organization_id") @db.UniqueIdentifier` on every tenant-scoped model, enforced by row-level security. No `Json` Prisma type exists — JSON is emulated as `String @db.NVarChar(Max)`.
- **Migrations:** `apps/api/prisma/migrations/` — hand-authored additive raw SQL (mssql). Latest is `20260905140000_user_timezone_signature`. New tenant-scoped tables need a **paired `_rls` migration** (see `20260905120001_user_notification_preferences_rls`) because `ALTER SECURITY POLICY` can't share a `CREATE TABLE` batch. Next timestamp: `20260906xxxxxx`.
- **Config controller pattern:** `apps/api/src/pipeline/pipelines-config.controller.ts` — `@UseGuards(JwtAuthGuard, PermissionsGuard)`, `@RequirePermissions(...)`, `@CurrentTenant()`/`@CurrentUserId()`. Service `apps/api/src/pipeline/pipelines.service.ts` wraps every write in `this.tenantPrisma.forTenant(context, tx => …)`.
- **DTO pattern:** `apps/api/src/pipeline/dto/create-stage.dto.ts` — class-validator (`@IsString`, `@IsIn`, `@IsInt`, `@MaxLength`).
- **Permissions:** DB rows seeded from `apps/api/prisma/seed.ts` (`PERMISSIONS`, `ROLE_PERMISSIONS`). `org:manage_settings` already granted to org_admin. Decorator `apps/api/src/rbac/permissions.decorator.ts`; guard `apps/api/src/rbac/permissions.guard.ts` (short-circuits for `actingSuperAdmin`).
- **Web hook pattern:** `apps/web/lib/hooks/usePipelines.ts` — TanStack Query over `apiFetch(...)`, mutations `invalidateQueries`.
- **Settings page pattern:** `apps/web/app/v2/(org-admin)/settings/pipelines/page.tsx` (`'use client'`); route-group gate `apps/web/app/v2/(org-admin)/layout.tsx`. Nav registered in **both** `apps/web/lib/super-admin-nav.ts` (`SUPER_ADMIN_FULL_NAV`) and `apps/web/lib/staff-nav.ts` (`V2_ROUTES` Set — the href must be in the Set to get the `/v2` prefix).
- **Injection points (web):**
  - Candidate create+edit: `apps/web/app/v2/(recruiter)/candidates/CandidateFormDialog.tsx` (used for add & edit from `candidates/page.tsx`).
  - Candidate display: `apps/web/app/v2/(recruiter)/jobs/CandidateDrawer.tsx` (no dedicated `/candidates/[id]` route).
  - Job create: inline "New job" dialog in `apps/web/app/v2/(recruiter)/jobs/page.tsx`.
  - Job edit + detail: `apps/web/app/v2/(recruiter)/jobs/[jobId]/page.tsx` + `apps/web/app/v2/(recruiter)/jobs/RequisitionSection.tsx`.
  - Public apply form: the `/apply/[applyToken]` page (candidate-facing; uses `Job.applyToken`).
- **Web import constraint (repo convention):** `apps/web` CANNOT import `@exam-platform/shared` VALUES at runtime (Next standalone bundling + jest). Inline the types web-side.

## Architecture

### 1. Data model — two tables

```prisma
model CustomFieldDefinition {
  id             String    @id @default(dbgenerated("newid()")) @db.UniqueIdentifier
  organizationId String    @map("organization_id") @db.UniqueIdentifier
  entityType     String    @map("entity_type") @db.NVarChar(20)   // 'candidate' | 'job'
  key            String    @db.NVarChar(100)                       // immutable slug
  label          String    @db.NVarChar(200)
  fieldType      String    @map("field_type") @db.NVarChar(20)     // 'text'|'number'|'date'|'select'
  optionsJson    String?   @map("options_json") @db.NVarChar(Max)  // JSON string[] for select
  required       Boolean   @default(false)
  showOnApply    Boolean   @default(false) @map("show_on_apply")
  position       Int       @default(0)
  archivedAt     DateTime? @map("archived_at")
  createdAt      DateTime  @default(now()) @map("created_at")

  @@unique([organizationId, entityType, key])
  @@index([organizationId, entityType])
  @@map("custom_field_definitions")
}

model CustomFieldValue {
  id             String    @id @default(dbgenerated("newid()")) @db.UniqueIdentifier
  organizationId String    @map("organization_id") @db.UniqueIdentifier
  definitionId   String    @map("definition_id") @db.UniqueIdentifier
  entityType     String    @map("entity_type") @db.NVarChar(20)   // 'candidate' | 'job'
  entityId       String    @map("entity_id") @db.UniqueIdentifier
  valueText      String?   @map("value_text") @db.NVarChar(Max)
  valueNumber    Float?    @map("value_number")
  valueDate      DateTime? @map("value_date")
  updatedAt      DateTime  @default(now()) @updatedAt @map("updated_at")

  @@unique([organizationId, definitionId, entityId])
  @@index([organizationId, entityType, entityId])
  @@map("custom_field_values")
}
```

- One migration creates both tables; a paired `_rls` migration adds both to the tenant security policy (filter + block predicate on `organization_id`).
- `key` is generated from the label at create time (slugified, uniqued per org+entityType) and is immutable thereafter; `label`, `required`, `showOnApply`, `position`, `optionsJson` are editable.
- Value typing: `text`/`select` → `valueText`; `number` → `valueNumber`; `date` → `valueDate`. Exactly one is populated per row; the others are null.

### 2. Config API (admin)

New `apps/api/src/custom-fields/` module: `custom-fields.module.ts`, `custom-fields-config.controller.ts`, `custom-fields.service.ts`, DTOs. Controller gated `@UseGuards(JwtAuthGuard, PermissionsGuard)` + `@RequirePermissions('org:manage_settings')`.

- `GET /custom-fields?entityType=candidate|job` — list definitions for the org+entity (includes archived? no — active only by default; `?includeArchived=true` optional). Ordered by `position`.
- `POST /custom-fields` — body: `entityType`, `label`, `fieldType`, `options?` (required when `fieldType='select'`, non-empty), `required?`, `showOnApply?`, `position?`. Server slugifies `label`→`key`, enforces `(org, entityType, key)` uniqueness (append `-2`, `-3` on collision).
- `PATCH /custom-fields/:id` — body: any of `label`, `options`, `required`, `showOnApply`, `position`. `entityType`, `key`, `fieldType` are immutable (changing a field's type would orphan stored values). Changing `select` options that would drop an in-use option is allowed but does not rewrite existing values.
- `DELETE /custom-fields/:id` — soft archive (`archivedAt = now()`). Values are retained.

DTO validation (`class-validator`): `entityType @IsIn(['candidate','job'])`; `fieldType @IsIn(['text','number','date','select'])`; `label @IsString @IsNotEmpty @MaxLength(200)`; `options @IsArray @ArrayNotEmpty @IsString({each})` when select (each `@MaxLength(200)`, deduped); `required`/`showOnApply` `@IsBoolean @IsOptional`; `position @IsInt @Min(0) @IsOptional`.

### 3. Value read/write — piggyback on candidate/job endpoints

Custom-field **values** are not a standalone CRUD surface; they ride the existing record endpoints.

- **Write:** the candidate create/update DTO and the job create/update DTO each gain `customFields?: Record<string, string | number | null>` — the key is the definition id, the value is the **raw scalar** the client holds (text/select → string, number → number, date → ISO `YYYY-MM-DD` string, cleared → `null` or `''`). There is no per-value wrapper object; the service picks the typed column from the definition's `fieldType`. The record service, inside its existing `forTenant` tx, calls a shared helper `upsertCustomFieldValues(tx, org, entityType, entityId, definitions, input)` that:
  - loads active definitions for `(org, entityType)`,
  - rejects unknown definition ids and definitions whose `entityType` mismatches,
  - enforces `required` (present + non-empty) for active fields,
  - coerces/validates by type (number → finite float; date → valid ISO → `DATETIME2`; select → must be a current option; text → `MaxLength` guard, e.g. 4000),
  - upserts one `CustomFieldValue` row per provided field (unique on `(org, definitionId, entityId)`), writing the matching typed column and nulling the others; a field cleared to empty deletes its value row.
- **Read:** candidate GET (list/drawer payload) and job GET (detail payload) include a `customFields` array: `[{ definitionId, key, label, fieldType, value }]` for that record's **active** definitions (archived-but-valued fields are excluded from the normal payload; still in the DB).

### 4. Public apply form (trust boundary)

The public `/apply/[applyToken]` submission (candidate self-creates against a job) accepts custom-field values, but the server **re-derives** the allowed set: only `entityType='candidate' && showOnApply=true && archivedAt=null` definitions for the job's org. Any definition id not in that set is rejected (400). Required apply-visible fields are enforced. The same `upsertCustomFieldValues` helper runs after the candidate row is created, scoped to the apply-visible subset. Job custom fields never appear here.

The apply page (`GET`) returns the apply-visible candidate definitions so the form can render them; the `POST` validates independently (never trusts the client's field list).

### 5. Web

- **Settings page** `apps/web/app/v2/(org-admin)/settings/custom-fields/page.tsx` (`'use client'`), registered in `super-admin-nav.ts` (`SUPER_ADMIN_FULL_NAV`, a suitable icon) and `staff-nav.ts` (`V2_ROUTES` Set with `/settings/custom-fields`). A Candidate/Job toggle switches the list. Each list is drag-or-position-ordered rows with label, type, required, show-on-apply (candidate only), and an options editor for select. Add/edit via a dialog; archive via row action. Hook `apps/web/lib/hooks/useCustomFields.ts` (TanStack Query; `['custom-fields', entityType]`; mutations invalidate).
- **Shared input component** `apps/web/components/CustomFieldsInputs.tsx` — props `{ entityType, values, onChange, definitions }`; renders one control per active definition by type (text input, number input, `<input type="date">`, select). A sibling read-only `CustomFieldsDisplay` renders label/value pairs. Types inlined in `apps/web/lib/types.ts` (`CustomFieldDefinition`, `CustomFieldValueInput`).
- **Wiring:** inject `<CustomFieldsInputs entityType="candidate">` into `CandidateFormDialog`; `<CustomFieldsDisplay>` into `CandidateDrawer`. Inject `<CustomFieldsInputs entityType="job">` into the job-create dialog (`jobs/page.tsx`) and `RequisitionSection` (edit), and `<CustomFieldsDisplay>` into `jobs/[jobId]/page.tsx`. Inject the apply-visible candidate inputs into the public apply page. Each form collects a `customFields` map and passes it through the existing create/update mutation.

## Testing

- **API config:** create definition slugifies + uniquifies `key`; select without options rejected; `fieldType`/`entityType`/`key` immutable on PATCH; archive sets `archivedAt` and hides from default list; list ordered by position.
- **Value upsert helper:** required enforced; type coercion (number/date/select-membership) accepts valid + rejects invalid; unknown definition id rejected; entityType mismatch rejected; clearing a field deletes its row; upsert is idempotent (one row per field per record).
- **Piggyback endpoints:** candidate/job create+update persist and return `customFields`; omitting `customFields` leaves existing values untouched (partial).
- **Public apply trust boundary:** a value for a non-`showOnApply` or archived or job definition is rejected; only apply-visible candidate fields are accepted; required apply fields enforced; the server ignores the client-supplied field list and re-derives it.
- **GDPR/delete:** candidate erase and job delete clear that record's `CustomFieldValue` rows.
- **RLS:** a value/definition row is invisible cross-tenant (policy predicate).
- **Web:** settings CRUD renders + calls the hook; `CustomFieldsInputs` renders the right control per type and reports changes; required/select validation surfaces inline.

## Out of scope (v1)

- Filtering/sorting/reporting UI over custom fields (the typed EAV columns make it *possible* later; no consumer built now).
- Field types beyond the four: multi-select, checkbox/boolean, long-text/rich-text, file/attachment, formula/lookup, user-picker.
- Per-field-level permissions or role-based visibility (that's inventory #18).
- Custom fields on entities other than Candidate/Job (interviews, offers, etc.).
- Conditional/dependent fields, sections/tabs, per-field help text.
- Reordering options after creation rewriting historical values.

## Deploy notes

- Two additive tables + one paired RLS migration; **no seed change** (reuses `org:manage_settings`). Ships with any api/web build, independent of the deferred migration chain. An org with no defined fields sees today's behavior exactly (no extra inputs, empty `customFields`).
- Migration ordering: use `20260906xxxxxx` (sorts after `20260905140000`); a later merge alongside the parked business-hours (`20260905130000`) / timezone (`20260905140000`) branches keeps the chain linear.
