# Custom Fields (Candidate + Job) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Org admins define custom fields (text/number/date/single-select) on Candidate and Job records; values render on the internal create/edit forms + detail views, and candidate fields flagged `showOnApply` render on the public apply form, all validated server-side.

**Architecture:** Two new tenant-scoped tables — `CustomFieldDefinition` (admin-defined fields, discriminated by `entityType`) and `CustomFieldValue` (EAV, typed value columns). A config API (`org:manage_settings`) does definition CRUD. Values are not a standalone surface: they ride the existing candidate/job create+update endpoints and the public apply endpoint via one shared `upsertCustomFieldValues` helper. Web renders a single reusable `<CustomFieldsInputs>` component in all form surfaces.

**Tech Stack:** NestJS + Prisma + SQL Server (mssql, row-level security), Next.js App Router (v2 UI), TanStack Query, class-validator, jest.

**Spec:** `docs/superpowers/specs/2026-09-06-custom-fields-design.md`

## Global Constraints

- **NEVER run `npm install`/`npm ci`/`npm update`** (worktree junction disk-fill hazard). Use only `npx prisma generate` / `npx prisma migrate deploy` and the existing `npx jest` / `npx tsc`.
- **Migrations are hand-authored additive raw SQL** (SQL Server). A new tenant-scoped table needs a **paired `_rls` migration** — `ALTER SECURITY POLICY dbo.TenantAccessPolicy` cannot share a `CREATE TABLE` batch. Policy name `dbo.TenantAccessPolicy`; predicate `dbo.fn_tenant_access_predicate(organization_id)`. Long/JSON text → `NVARCHAR(Max)`.
- **apps/web CANNOT import `@exam-platform/shared` VALUES at runtime** (Next standalone bundling + jest). Web imports TYPES only (erased); inline any needed types/constants web-side.
- **Tenant scoping:** every service write wraps `this.tenantPrisma.forTenant(context, async (tx) => …)`; every tenant table row carries `organizationId String @map("organization_id") @db.UniqueIdentifier`. `TenantContext = { organizationId: string | null; isSuperAdmin: boolean }`.
- **Public-endpoint org resolution:** no JWT; resolve org from the token, then use `{ organizationId: <resolved>, isSuperAdmin: true }` for writes (LOOKUP_ORG pattern already in `public-applications.service.ts`).
- **Config permission is `org:manage_settings`** (already granted to org_admin — no seed change). Value writes ride the record endpoints and inherit their permissions (`candidate:manage`, `pipeline:manage`).
- **No new npm dependency.** Slugify with a small inline function.
- Commit after each task (TDD: red → green → commit).

---

## File Structure

**API (new):** `apps/api/src/custom-fields/` — `custom-fields.module.ts`, `custom-fields-config.controller.ts`, `custom-fields.service.ts`, `custom-field-values.ts` (shared value helper), `dto/create-custom-field.dto.ts`, `dto/update-custom-field.dto.ts`, plus `*.spec.ts`.
**API (modified):** `apps/api/prisma/schema.prisma`; new migrations; `candidates.service.ts` + candidate DTOs + erase; `pipeline.service.ts` + job DTOs (`pipeline/dto/`) + deleteJob; `public-applications.service.ts` + `apply.dto.ts`; `app.module.ts`.
**Web (new):** `apps/web/lib/hooks/useCustomFields.ts`; `apps/web/app/v2/(org-admin)/settings/custom-fields/page.tsx`; `apps/web/components/CustomFieldsInputs.tsx` (+ `CustomFieldsDisplay`).
**Web (modified):** `apps/web/lib/types.ts`; `apps/web/lib/super-admin-nav.ts`; `apps/web/lib/staff-nav.ts`; `candidates/CandidateFormDialog.tsx`; `jobs/CandidateDrawer.tsx`; `jobs/page.tsx`; `jobs/RequisitionSection.tsx`; `jobs/[jobId]/page.tsx`; `app/(candidate)/apply/[applyToken]/apply-form.tsx` + `page.tsx`.

---

### Task 1: Prisma models + migrations (tables + RLS)

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260906090000_custom_fields/migration.sql`
- Create: `apps/api/prisma/migrations/20260906090001_custom_fields_rls/migration.sql`

**Interfaces:**
- Produces: Prisma models `CustomFieldDefinition`, `CustomFieldValue` (field names/types below); tables `custom_field_definitions`, `custom_field_values` with RLS.

- [ ] **Step 1: Add both models to `schema.prisma`** (place near the other config models, e.g. after the Pipeline models)

```prisma
model CustomFieldDefinition {
  id             String    @id @default(dbgenerated("newid()")) @db.UniqueIdentifier
  organizationId String    @map("organization_id") @db.UniqueIdentifier
  entityType     String    @map("entity_type") @db.NVarChar(20)
  key            String    @db.NVarChar(100)
  label          String    @db.NVarChar(200)
  fieldType      String    @map("field_type") @db.NVarChar(20)
  optionsJson    String?   @map("options_json") @db.NVarChar(Max)
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
  entityType     String    @map("entity_type") @db.NVarChar(20)
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

- [ ] **Step 2: Write the CREATE TABLE migration** `20260906090000_custom_fields/migration.sql`

```sql
CREATE TABLE [dbo].[custom_field_definitions] (
  [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [custom_field_definitions_pkey] PRIMARY KEY CONSTRAINT [custom_field_definitions_id_df] DEFAULT newid(),
  [organization_id] UNIQUEIDENTIFIER NOT NULL,
  [entity_type] NVARCHAR(20) NOT NULL,
  [key] NVARCHAR(100) NOT NULL,
  [label] NVARCHAR(200) NOT NULL,
  [field_type] NVARCHAR(20) NOT NULL,
  [options_json] NVARCHAR(max),
  [required] BIT NOT NULL CONSTRAINT [custom_field_definitions_required_df] DEFAULT 0,
  [show_on_apply] BIT NOT NULL CONSTRAINT [custom_field_definitions_show_on_apply_df] DEFAULT 0,
  [position] INT NOT NULL CONSTRAINT [custom_field_definitions_position_df] DEFAULT 0,
  [archived_at] DATETIME2,
  [created_at] DATETIME2 NOT NULL CONSTRAINT [custom_field_definitions_created_at_df] DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX [custom_field_definitions_org_entity_key] ON [dbo].[custom_field_definitions]([organization_id], [entity_type], [key]);
CREATE INDEX [custom_field_definitions_org_entity_idx] ON [dbo].[custom_field_definitions]([organization_id], [entity_type]);

CREATE TABLE [dbo].[custom_field_values] (
  [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [custom_field_values_pkey] PRIMARY KEY CONSTRAINT [custom_field_values_id_df] DEFAULT newid(),
  [organization_id] UNIQUEIDENTIFIER NOT NULL,
  [definition_id] UNIQUEIDENTIFIER NOT NULL,
  [entity_type] NVARCHAR(20) NOT NULL,
  [entity_id] UNIQUEIDENTIFIER NOT NULL,
  [value_text] NVARCHAR(max),
  [value_number] FLOAT(53),
  [value_date] DATETIME2,
  [updated_at] DATETIME2 NOT NULL CONSTRAINT [custom_field_values_updated_at_df] DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX [custom_field_values_org_def_entity] ON [dbo].[custom_field_values]([organization_id], [definition_id], [entity_id]);
CREATE INDEX [custom_field_values_org_entity_idx] ON [dbo].[custom_field_values]([organization_id], [entity_type], [entity_id]);
```

- [ ] **Step 3: Write the RLS migration** `20260906090001_custom_fields_rls/migration.sql`

```sql
ALTER SECURITY POLICY dbo.TenantAccessPolicy
ADD FILTER PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.custom_field_definitions,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.custom_field_definitions AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.custom_field_definitions AFTER UPDATE;

ALTER SECURITY POLICY dbo.TenantAccessPolicy
ADD FILTER PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.custom_field_values,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.custom_field_values AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.custom_field_values AFTER UPDATE;
```

- [ ] **Step 4: Apply + regenerate client**

Run: `cd apps/api && npx prisma migrate deploy && npx prisma generate`
Expected: both migrations applied; client regenerated with the two new models. (If `migrate deploy` reports the shadow-DB CREATE DATABASE error, that is the known SQL-Server gotcha — the migrations are hand-authored and applied directly; `migrate deploy` does not use a shadow DB, so it should succeed.)

- [ ] **Step 5: Verify tsc** `cd apps/api && npx tsc --noEmit` — Expected: clean (models resolve).

- [ ] **Step 6: Commit** `git add apps/api/prisma && git commit -m "feat(custom-fields): add CustomFieldDefinition + CustomFieldValue tables + RLS"`

---

### Task 2: Value helper — coerce + upsert + serialize (pure/unit-tested core)

**Files:**
- Create: `apps/api/src/custom-fields/custom-field-values.ts`
- Test: `apps/api/src/custom-fields/custom-field-values.spec.ts`

**Interfaces:**
- Consumes: `Prisma.TransactionClient` (tx).
- Produces:
  - `type CustomFieldEntity = 'candidate' | 'job'`
  - `interface CustomFieldDefinitionLite { id: string; key: string; label: string; fieldType: 'text'|'number'|'date'|'select'; optionsJson: string | null; required: boolean }`
  - `interface CustomFieldRead { definitionId: string; key: string; label: string; fieldType: string; value: string | number | null }`
  - `function coerceCustomFieldValue(def, raw): { valueText: string|null; valueNumber: number|null; valueDate: Date|null; isEmpty: boolean }` (throws `BadRequestException` on invalid)
  - `async function upsertCustomFieldValues(tx, organizationId, entityType, entityId, definitions, input): Promise<void>`
  - `function serializeCustomFieldValues(rows, definitions): CustomFieldRead[]`

- [ ] **Step 1: Write the failing tests** `custom-field-values.spec.ts`

```ts
import { BadRequestException } from '@nestjs/common';
import { coerceCustomFieldValue, upsertCustomFieldValues, serializeCustomFieldValues, CustomFieldDefinitionLite } from './custom-field-values';

const textDef: CustomFieldDefinitionLite = { id: 'd1', key: 'visa', label: 'Visa', fieldType: 'text', optionsJson: null, required: false };
const numDef: CustomFieldDefinitionLite = { id: 'd2', key: 'years', label: 'Years', fieldType: 'number', optionsJson: null, required: true };
const dateDef: CustomFieldDefinitionLite = { id: 'd3', key: 'avail', label: 'Available', fieldType: 'date', optionsJson: null, required: false };
const selDef: CustomFieldDefinitionLite = { id: 'd4', key: 'source', label: 'Source', fieldType: 'select', optionsJson: JSON.stringify(['LinkedIn', 'Referral']), required: false };

describe('coerceCustomFieldValue', () => {
  it('text: stores trimmed string in valueText', () => {
    expect(coerceCustomFieldValue(textDef, '  H1B ')).toEqual({ valueText: 'H1B', valueNumber: null, valueDate: null, isEmpty: false });
  });
  it('text: empty string is empty', () => {
    expect(coerceCustomFieldValue(textDef, '').isEmpty).toBe(true);
  });
  it('number: accepts numeric string and number', () => {
    expect(coerceCustomFieldValue(numDef, '5').valueNumber).toBe(5);
    expect(coerceCustomFieldValue(numDef, 3.5).valueNumber).toBe(3.5);
  });
  it('number: rejects non-numeric', () => {
    expect(() => coerceCustomFieldValue(numDef, 'abc')).toThrow(BadRequestException);
  });
  it('date: parses YYYY-MM-DD', () => {
    const r = coerceCustomFieldValue(dateDef, '2026-01-15');
    expect(r.valueDate?.toISOString().slice(0, 10)).toBe('2026-01-15');
  });
  it('date: rejects garbage', () => {
    expect(() => coerceCustomFieldValue(dateDef, 'not-a-date')).toThrow(BadRequestException);
  });
  it('select: accepts a current option', () => {
    expect(coerceCustomFieldValue(selDef, 'Referral').valueText).toBe('Referral');
  });
  it('select: rejects a non-option', () => {
    expect(() => coerceCustomFieldValue(selDef, 'Twitter')).toThrow(BadRequestException);
  });
});

describe('upsertCustomFieldValues', () => {
  function fakeTx() {
    const calls: any[] = [];
    return {
      calls,
      customFieldValue: {
        deleteMany: jest.fn((args) => { calls.push(['deleteMany', args]); return Promise.resolve({ count: 1 }); }),
        upsert: jest.fn((args) => { calls.push(['upsert', args]); return Promise.resolve({}); }),
      },
    } as any;
  }

  it('enforces required across the passed definitions', async () => {
    const tx = fakeTx();
    await expect(
      upsertCustomFieldValues(tx, 'org1', 'candidate', 'c1', [numDef], {}),
    ).rejects.toThrow(BadRequestException);
  });
  it('rejects an unknown definition id', async () => {
    const tx = fakeTx();
    await expect(
      upsertCustomFieldValues(tx, 'org1', 'candidate', 'c1', [textDef], { unknownId: 'x', d2: '1' }),
    ).rejects.toThrow(BadRequestException);
  });
  it('upserts provided values and deletes cleared ones', async () => {
    const tx = fakeTx();
    await upsertCustomFieldValues(tx, 'org1', 'candidate', 'c1', [textDef, numDef], { d1: 'H1B', d2: '5' });
    expect(tx.customFieldValue.upsert).toHaveBeenCalledTimes(2);
  });
  it('clearing a value deletes its row (no upsert)', async () => {
    const tx = fakeTx();
    await upsertCustomFieldValues(tx, 'org1', 'candidate', 'c1', [textDef], { d1: '' });
    expect(tx.customFieldValue.deleteMany).toHaveBeenCalledTimes(1);
    expect(tx.customFieldValue.upsert).not.toHaveBeenCalled();
  });
});

describe('serializeCustomFieldValues', () => {
  it('maps rows to definitions by type', () => {
    const rows = [
      { definitionId: 'd1', valueText: 'H1B', valueNumber: null, valueDate: null },
      { definitionId: 'd2', valueText: null, valueNumber: 5, valueDate: null },
    ] as any;
    const out = serializeCustomFieldValues(rows, [textDef, numDef]);
    expect(out).toEqual([
      { definitionId: 'd1', key: 'visa', label: 'Visa', fieldType: 'text', value: 'H1B' },
      { definitionId: 'd2', key: 'years', label: 'Years', fieldType: 'number', value: 5 },
    ]);
  });
  it('returns null value for a definition with no row', () => {
    const out = serializeCustomFieldValues([], [textDef]);
    expect(out[0].value).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests, verify they fail** `cd apps/api && npx jest custom-field-values` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement `custom-field-values.ts`**

```ts
import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export type CustomFieldEntity = 'candidate' | 'job';

export interface CustomFieldDefinitionLite {
  id: string;
  key: string;
  label: string;
  fieldType: 'text' | 'number' | 'date' | 'select';
  optionsJson: string | null;
  required: boolean;
}

export interface CustomFieldRead {
  definitionId: string;
  key: string;
  label: string;
  fieldType: string;
  value: string | number | null;
}

const TEXT_MAX = 4000;

function parseOptions(optionsJson: string | null): string[] {
  if (!optionsJson) return [];
  try {
    const arr = JSON.parse(optionsJson);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function coerceCustomFieldValue(
  def: CustomFieldDefinitionLite,
  raw: unknown,
): { valueText: string | null; valueNumber: number | null; valueDate: Date | null; isEmpty: boolean } {
  const empty = { valueText: null, valueNumber: null, valueDate: null, isEmpty: true };
  if (raw === undefined || raw === null || raw === '') return empty;

  switch (def.fieldType) {
    case 'text': {
      if (typeof raw !== 'string') throw new BadRequestException(`Field "${def.label}" must be text`);
      const v = raw.trim();
      if (v === '') return empty;
      if (v.length > TEXT_MAX) throw new BadRequestException(`Field "${def.label}" is too long`);
      return { valueText: v, valueNumber: null, valueDate: null, isEmpty: false };
    }
    case 'number': {
      const n = typeof raw === 'number' ? raw : Number(raw);
      if (!Number.isFinite(n)) throw new BadRequestException(`Field "${def.label}" must be a number`);
      return { valueText: null, valueNumber: n, valueDate: null, isEmpty: false };
    }
    case 'date': {
      if (typeof raw !== 'string') throw new BadRequestException(`Field "${def.label}" must be a date`);
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) throw new BadRequestException(`Field "${def.label}" is not a valid date`);
      return { valueText: null, valueNumber: null, valueDate: d, isEmpty: false };
    }
    case 'select': {
      if (typeof raw !== 'string') throw new BadRequestException(`Field "${def.label}" must be a choice`);
      const v = raw.trim();
      if (v === '') return empty;
      if (!parseOptions(def.optionsJson).includes(v)) throw new BadRequestException(`Field "${def.label}" has an invalid choice`);
      return { valueText: v, valueNumber: null, valueDate: null, isEmpty: false };
    }
    default:
      throw new BadRequestException(`Unsupported field type ${def.fieldType}`);
  }
}

export async function upsertCustomFieldValues(
  tx: Prisma.TransactionClient,
  organizationId: string,
  entityType: CustomFieldEntity,
  entityId: string,
  definitions: CustomFieldDefinitionLite[],
  input: Record<string, unknown>,
): Promise<void> {
  const byId = new Map(definitions.map((d) => [d.id, d]));
  for (const key of Object.keys(input)) {
    if (!byId.has(key)) throw new BadRequestException(`Unknown custom field ${key}`);
  }
  for (const def of definitions) {
    const coerced = coerceCustomFieldValue(def, input[def.id]);
    if (coerced.isEmpty) {
      if (def.required) throw new BadRequestException(`Field "${def.label}" is required`);
      await tx.customFieldValue.deleteMany({ where: { organizationId, definitionId: def.id, entityId } });
      continue;
    }
    await tx.customFieldValue.upsert({
      where: { organizationId_definitionId_entityId: { organizationId, definitionId: def.id, entityId } },
      create: {
        organizationId, definitionId: def.id, entityType, entityId,
        valueText: coerced.valueText, valueNumber: coerced.valueNumber, valueDate: coerced.valueDate,
      },
      update: {
        valueText: coerced.valueText, valueNumber: coerced.valueNumber, valueDate: coerced.valueDate,
        updatedAt: new Date(),
      },
    });
  }
}

export function serializeCustomFieldValues(
  rows: { definitionId: string; valueText: string | null; valueNumber: number | null; valueDate: Date | null }[],
  definitions: CustomFieldDefinitionLite[],
): CustomFieldRead[] {
  const byDef = new Map(rows.map((r) => [r.definitionId, r]));
  return definitions.map((def) => {
    const row = byDef.get(def.id);
    let value: string | number | null = null;
    if (row) {
      if (def.fieldType === 'number') value = row.valueNumber;
      else if (def.fieldType === 'date') value = row.valueDate ? row.valueDate.toISOString().slice(0, 10) : null;
      else value = row.valueText;
    }
    return { definitionId: def.id, key: def.key, label: def.label, fieldType: def.fieldType, value };
  });
}
```

Note the composite where-key name `organizationId_definitionId_entityId` — Prisma derives it from the `@@unique([organizationId, definitionId, entityId])`. Verify the generated name after `prisma generate`; adjust if Prisma names it differently.

- [ ] **Step 4: Run tests, verify pass** `cd apps/api && npx jest custom-field-values` — Expected: PASS.

- [ ] **Step 5: Commit** `git add apps/api/src/custom-fields && git commit -m "feat(custom-fields): value coerce/upsert/serialize helper"`

---

### Task 3: Config service — definition CRUD

**Files:**
- Create: `apps/api/src/custom-fields/custom-fields.service.ts`
- Test: `apps/api/src/custom-fields/custom-fields.service.spec.ts`

**Interfaces:**
- Consumes: `TenantPrismaService`, `custom-field-values.ts` types.
- Produces: `CustomFieldsService` with:
  - `list(context, entityType, includeArchived=false): Promise<CustomFieldDefinition[]>`
  - `create(context, dto): Promise<CustomFieldDefinition>`
  - `update(context, id, dto): Promise<CustomFieldDefinition>`
  - `archive(context, id): Promise<{ id: string; archivedAt: Date }>`
  - static/exported `slugify(label): string`

- [ ] **Step 1: Write failing tests** — cover: `create` slugifies label→key and uniquifies on collision (`visa`, `visa-2`); `create` with `fieldType:'select'` and no options throws `BadRequestException`; `update` ignores `entityType`/`key`/`fieldType` (immutable) even if passed; `archive` sets `archivedAt`; `list` returns active only unless `includeArchived`, ordered by `position`. Use a mocked `TenantPrismaService.forTenant` that runs the callback against a `tx` mock exposing `customFieldDefinition.{findMany,findFirst,create,update}`.

```ts
// sketch of the key cases
it('slugifies and uniquifies key on create', async () => {
  // findFirst returns an existing {key:'visa'} once, then null → expect created key 'visa-2'
});
it('rejects select without options', async () => {
  await expect(service.create(ctx, { entityType: 'candidate', label: 'Src', fieldType: 'select' } as any)).rejects.toThrow(BadRequestException);
});
it('update never changes fieldType/entityType/key', async () => {
  // pass those in dto; assert tx.update called with data lacking them
});
```

- [ ] **Step 2: Run, verify fail** `npx jest custom-fields.service`.

- [ ] **Step 3: Implement `custom-fields.service.ts`**

```ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CustomFieldDefinition } from '@prisma/client';
import { TenantPrismaService, TenantContext } from '@exam-platform/shared';
import { CreateCustomFieldDto } from './dto/create-custom-field.dto';
import { UpdateCustomFieldDto } from './dto/update-custom-field.dto';

export function slugify(label: string): string {
  return label.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 90) || 'field';
}

@Injectable()
export class CustomFieldsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  list(context: TenantContext, entityType: 'candidate' | 'job', includeArchived = false): Promise<CustomFieldDefinition[]> {
    return this.tenantPrisma.forTenant(context, (tx) =>
      tx.customFieldDefinition.findMany({
        where: {
          organizationId: context.organizationId as string,
          entityType,
          ...(includeArchived ? {} : { archivedAt: null }),
        },
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      }),
    );
  }

  async create(context: TenantContext, dto: CreateCustomFieldDto): Promise<CustomFieldDefinition> {
    if (dto.fieldType === 'select' && (!dto.options || dto.options.length === 0)) {
      throw new BadRequestException('A select field needs at least one option');
    }
    const orgId = context.organizationId as string;
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const base = slugify(dto.label);
      let key = base;
      for (let i = 2; ; i++) {
        const clash = await tx.customFieldDefinition.findFirst({
          where: { organizationId: orgId, entityType: dto.entityType, key },
          select: { id: true },
        });
        if (!clash) break;
        key = `${base}-${i}`;
      }
      return tx.customFieldDefinition.create({
        data: {
          organizationId: orgId,
          entityType: dto.entityType,
          key,
          label: dto.label,
          fieldType: dto.fieldType,
          optionsJson: dto.fieldType === 'select' ? JSON.stringify(dedupe(dto.options ?? [])) : null,
          required: dto.required ?? false,
          showOnApply: dto.entityType === 'candidate' ? (dto.showOnApply ?? false) : false,
          position: dto.position ?? 0,
        },
      });
    });
  }

  async update(context: TenantContext, id: string, dto: UpdateCustomFieldDto): Promise<CustomFieldDefinition> {
    const orgId = context.organizationId as string;
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const existing = await tx.customFieldDefinition.findFirst({ where: { id, organizationId: orgId } });
      if (!existing) throw new NotFoundException(`Custom field ${id} not found`);
      if (existing.fieldType === 'select' && dto.options !== undefined && dto.options.length === 0) {
        throw new BadRequestException('A select field needs at least one option');
      }
      return tx.customFieldDefinition.update({
        where: { id },
        data: {
          ...(dto.label !== undefined ? { label: dto.label } : {}),
          ...(dto.required !== undefined ? { required: dto.required } : {}),
          ...(dto.position !== undefined ? { position: dto.position } : {}),
          ...(existing.entityType === 'candidate' && dto.showOnApply !== undefined ? { showOnApply: dto.showOnApply } : {}),
          ...(existing.fieldType === 'select' && dto.options !== undefined ? { optionsJson: JSON.stringify(dedupe(dto.options)) } : {}),
          // entityType, key, fieldType are immutable — never written here.
        },
      });
    });
  }

  async archive(context: TenantContext, id: string): Promise<{ id: string; archivedAt: Date }> {
    const orgId = context.organizationId as string;
    return this.tenantPrisma.forTenant(context, async (tx) => {
      const existing = await tx.customFieldDefinition.findFirst({ where: { id, organizationId: orgId }, select: { id: true } });
      if (!existing) throw new NotFoundException(`Custom field ${id} not found`);
      const archivedAt = new Date();
      await tx.customFieldDefinition.update({ where: { id }, data: { archivedAt } });
      return { id, archivedAt };
    });
  }
}

function dedupe(arr: string[]): string[] {
  return [...new Set(arr.map((s) => s.trim()).filter(Boolean))];
}
```

- [ ] **Step 4: Run tests, verify pass.** **Step 5: Commit** `feat(custom-fields): definition CRUD service`.

---

### Task 4: Config controller + DTOs + module wiring

**Files:**
- Create: `apps/api/src/custom-fields/dto/create-custom-field.dto.ts`, `dto/update-custom-field.dto.ts`
- Create: `apps/api/src/custom-fields/custom-fields-config.controller.ts`
- Create: `apps/api/src/custom-fields/custom-fields.module.ts`
- Modify: `apps/api/src/app.module.ts` (register `CustomFieldsModule`)
- Test: `apps/api/src/custom-fields/custom-fields-config.controller.spec.ts`

**Interfaces:**
- Consumes: `CustomFieldsService`.
- Produces: routes under `@Controller('custom-fields')` gated `org:manage_settings`.

- [ ] **Step 1: DTOs**

```ts
// create-custom-field.dto.ts
import { IsArray, IsBoolean, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';
export const CF_ENTITY_TYPES = ['candidate', 'job'] as const;
export const CF_FIELD_TYPES = ['text', 'number', 'date', 'select'] as const;

export class CreateCustomFieldDto {
  @IsIn(CF_ENTITY_TYPES) entityType!: 'candidate' | 'job';
  @IsString() @IsNotEmpty() @MaxLength(200) label!: string;
  @IsIn(CF_FIELD_TYPES) fieldType!: 'text' | 'number' | 'date' | 'select';
  @IsOptional() @IsArray() @IsString({ each: true }) @MaxLength(200, { each: true }) options?: string[];
  @IsOptional() @IsBoolean() required?: boolean;
  @IsOptional() @IsBoolean() showOnApply?: boolean;
  @IsOptional() @IsInt() @Min(0) position?: number;
}
```
```ts
// update-custom-field.dto.ts  (entityType/key/fieldType intentionally absent — immutable)
import { IsArray, IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';
export class UpdateCustomFieldDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(200) label?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) @MaxLength(200, { each: true }) options?: string[];
  @IsOptional() @IsBoolean() required?: boolean;
  @IsOptional() @IsBoolean() showOnApply?: boolean;
  @IsOptional() @IsInt() @Min(0) position?: number;
}
```

- [ ] **Step 2: Controller**

```ts
import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../rbac/permissions.guard';
import { RequirePermissions } from '../rbac/permissions.decorator';
import { CurrentTenant } from '../auth/current-tenant.decorator';
import { TenantContext } from '@exam-platform/shared';
import { CustomFieldsService } from './custom-fields.service';
import { CreateCustomFieldDto, CF_ENTITY_TYPES } from './dto/create-custom-field.dto';
import { UpdateCustomFieldDto } from './dto/update-custom-field.dto';
import { BadRequestException } from '@nestjs/common';

@Controller('custom-fields')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('org:manage_settings')
export class CustomFieldsConfigController {
  constructor(private readonly service: CustomFieldsService) {}

  @Get()
  list(@CurrentTenant() tenant: TenantContext, @Query('entityType') entityType: string, @Query('includeArchived') includeArchived?: string) {
    if (!CF_ENTITY_TYPES.includes(entityType as any)) throw new BadRequestException('entityType must be candidate or job');
    return this.service.list(tenant, entityType as 'candidate' | 'job', includeArchived === 'true');
  }

  @Post()
  create(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateCustomFieldDto) {
    return this.service.create(tenant, dto);
  }

  @Patch(':id')
  update(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: UpdateCustomFieldDto) {
    return this.service.update(tenant, id, dto);
  }

  @Delete(':id')
  archive(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.service.archive(tenant, id);
  }
}
```
(Confirm the exact import paths/names for `JwtAuthGuard`, `PermissionsGuard`, `RequirePermissions`, `CurrentTenant` against `pipelines-config.controller.ts` — copy them verbatim from there.)

- [ ] **Step 3: Module + register**

```ts
// custom-fields.module.ts
import { Module } from '@nestjs/common';
import { CustomFieldsConfigController } from './custom-fields-config.controller';
import { CustomFieldsService } from './custom-fields.service';
@Module({ controllers: [CustomFieldsConfigController], providers: [CustomFieldsService], exports: [CustomFieldsService] })
export class CustomFieldsModule {}
```
Add `CustomFieldsModule` to `app.module.ts` imports. (If `TenantPrismaService` is provided by a shared/global module, no extra provider is needed — mirror how `PipelineModule` obtains it.)

- [ ] **Step 4: Controller test** — mock the service, assert `list` rejects a bad `entityType`, and each route delegates with the tenant. Run `npx jest custom-fields-config`.

- [ ] **Step 5: tsc** `npx tsc --noEmit`. **Step 6: Commit** `feat(custom-fields): config controller + DTOs + module`.

---

### Task 5: Wire values into Candidate create/update/read + erase cleanup

**Files:**
- Modify: `apps/api/src/candidates/dto/create-candidate.dto.ts`, `dto/update-candidate.dto.ts`
- Modify: `apps/api/src/candidates/candidates.service.ts` (`create` ~L148, `update` ~L200, `list` ~L169, `erase` ~L447)
- Modify: `apps/api/src/candidates/candidates.module.ts` (import `CustomFieldsModule` for `CustomFieldsService`, or import the helper directly — the helper is a free function, so no DI needed for upsert/serialize; only definition loading uses `tx`)
- Test: extend `apps/api/src/candidates/candidates.service.spec.ts`

**Interfaces:**
- Consumes: `upsertCustomFieldValues`, `serializeCustomFieldValues`, `CustomFieldDefinitionLite` from `../custom-fields/custom-field-values`.
- Produces: candidate create/update accept `customFields`; candidate list/detail payload gains `customFields: CustomFieldRead[]`.

**Convention (applies to Tasks 5–7):** `customFields` in a DTO is the **complete set** of that entity's active custom-field values. When present, the service loads active `candidate` definitions and calls `upsertCustomFieldValues` (which enforces required and deletes cleared rows). When **omitted** (`undefined`), values are left untouched.

- [ ] **Step 1: DTOs** — add to both:
```ts
@IsOptional() @IsObject() customFields?: Record<string, string | number | null>;
```
(import `IsObject` from class-validator.)

- [ ] **Step 2: Write failing tests** — `create` with `customFields` persists rows and the returned candidate includes `customFields`; `update` with a cleared field deletes the row; `update` omitting `customFields` leaves values untouched (no delete/upsert calls); `erase` deletes the candidate's `customFieldValue` rows. Mock `tx.customFieldDefinition.findMany` to return active defs and `tx.customFieldValue.*`.

- [ ] **Step 3: Implement** — inside `create`'s `forTenant` tx, after `tx.candidate.create`, if `dto.customFields !== undefined`:
```ts
const defs = await tx.customFieldDefinition.findMany({
  where: { organizationId: orgId, entityType: 'candidate', archivedAt: null },
  select: { id: true, key: true, label: true, fieldType: true, optionsJson: true, required: true },
});
await upsertCustomFieldValues(tx, orgId, 'candidate', created.id, defs as CustomFieldDefinitionLite[], dto.customFields);
```
Same block in `update` (after the candidate update, using the candidate id). For **read** (`list` items and any detail/get), load value rows + active defs and attach `customFields: serializeCustomFieldValues(rows, defs)`. For `list`, batch: load all active candidate defs once, and all value rows for the page's candidate ids (`where: { organizationId, entityType: 'candidate', entityId: { in: ids } }`), then group by `entityId`. In `erase`, inside the existing tx (near the `candidateFitAssessment.updateMany` block ~L545):
```ts
await tx.customFieldValue.deleteMany({ where: { organizationId: orgId, entityType: 'candidate', entityId: candidateId } });
```

- [ ] **Step 4: Run candidate tests + tsc.** **Step 5: Commit** `feat(custom-fields): candidate value read/write + erase cleanup`.

---

### Task 6: Wire values into Job create/update/read + deleteJob cleanup

**Files:**
- Modify: `apps/api/src/pipeline/dto/create-job.dto.ts`, `dto/update-job.dto.ts`
- Modify: `apps/api/src/pipeline/pipeline.service.ts` (`createJob` ~L137, `updateJob` ~L285, `getJob` ~L273, `deleteJob` ~L493)
- Modify: `apps/api/src/pipeline/pipeline.module.ts` if needed
- Test: extend the pipeline service spec

**Interfaces:**
- Consumes: same helper.
- Produces: job create/update accept `customFields`; `getJob` payload gains `customFields`.

- [ ] **Step 1: DTOs** — add `@IsOptional() @IsObject() customFields?: Record<string, string | number | null>;` to both job DTOs.
- [ ] **Step 2: Failing tests** — `createJob` persists values; `updateJob` upserts/clears; `getJob` returns `customFields`; `deleteJob` deletes the job's value rows.
- [ ] **Step 3: Implement** — mirror Task 5 with `entityType: 'job'`. In `createJob`/`updateJob`, after the job create/update and only when `dto.customFields !== undefined`, load active `job` defs and call `upsertCustomFieldValues(tx, orgId, 'job', job.id, defs, dto.customFields)`. In `getJob`, attach `customFields: serializeCustomFieldValues(rows, defs)`. In `deleteJob`, **before** `tx.job.delete` (L497):
```ts
await tx.customFieldValue.deleteMany({ where: { organizationId: orgId, entityType: 'job', entityId: jobId } });
```
- [ ] **Step 4: Run tests + tsc.** **Step 5: Commit** `feat(custom-fields): job value read/write + delete cleanup`.

---

### Task 7: Public apply — trust boundary

**Files:**
- Modify: `apps/api/src/public-applications/dto/apply.dto.ts`
- Modify: `apps/api/src/public-applications/public-applications.service.ts` (`getPublicJob` ~L62, `apply` ~L124)
- Test: extend the public-applications service spec

**Interfaces:**
- Produces: `getPublicJob` payload gains `customFields: { definitionId; key; label; fieldType; options?: string[]; required }[]` (apply-visible candidate defs only, ordered by position); `apply` accepts + validates `customFields`.

- [ ] **Step 1: DTO** — add `@IsOptional() @IsObject() customFields?: Record<string, string | number | null>;` to `ApplyDto`.

- [ ] **Step 2: Failing tests** — the server **re-derives** the allowed set (`entityType:'candidate' && showOnApply:true && archivedAt:null`) and:
  - accepts values for apply-visible fields (persisted on the created candidate);
  - **rejects** a value whose definition is a job field, archived, or `showOnApply:false` (400 — unknown-id path, since it isn't in the derived set);
  - enforces `required` among apply-visible fields;
  - ignores/does not trust the client field list (a definition not in the derived set is never written).

- [ ] **Step 3: Implement** —
  - `getPublicJob`: after resolving the job (which yields `organizationId`), load apply-visible candidate defs with the LOOKUP_ORG super-admin context (same cross-tenant read the token lookup uses), and return them (map `optionsJson`→`options` array) so the form can render.
  - `apply`: inside the existing `forTenant(context, …)` write tx, after the candidate `upsert` resolves the candidate id, load the apply-visible defs **within the same tx** and call:
```ts
const applyDefs = await tx.customFieldDefinition.findMany({
  where: { organizationId: job.organizationId, entityType: 'candidate', showOnApply: true, archivedAt: null },
  select: { id: true, key: true, label: true, fieldType: true, optionsJson: true, required: true },
});
await upsertCustomFieldValues(tx, job.organizationId, 'candidate', candidate.id, applyDefs as CustomFieldDefinitionLite[], dto.customFields ?? {});
```
Because `upsertCustomFieldValues` rejects any input key not in `applyDefs`, a non-apply/job/archived definition id → `BadRequestException`. Passing `?? {}` ensures required apply fields are enforced even if the client sends nothing.

- [ ] **Step 4: Run tests + tsc.** **Step 5: Commit** `feat(custom-fields): public apply trust-boundary validation`.

---

### Task 8: Web — hook + settings page + nav + types

**Files:**
- Modify: `apps/web/lib/types.ts` (inline types)
- Create: `apps/web/lib/hooks/useCustomFields.ts`
- Create: `apps/web/app/v2/(org-admin)/settings/custom-fields/page.tsx`
- Modify: `apps/web/lib/super-admin-nav.ts`, `apps/web/lib/staff-nav.ts`
- Test: `apps/web/app/v2/(org-admin)/settings/custom-fields/page.test.tsx` (light render + mutation-call test)

**Interfaces:**
- Produces: inline web types + hooks:
```ts
export interface CustomFieldDefinition {
  id: string; entityType: 'candidate' | 'job'; key: string; label: string;
  fieldType: 'text' | 'number' | 'date' | 'select'; options: string[] | null;
  required: boolean; showOnApply: boolean; position: number; archivedAt: string | null;
}
export interface CustomFieldRead { definitionId: string; key: string; label: string; fieldType: string; value: string | number | null; }
export type CustomFieldInputMap = Record<string, string | number | null>;
```
(Note: the API returns `optionsJson` on the definition. Either expose `options` in the config payload from the API — add a mapping in the config controller responses — or parse `optionsJson` web-side. Pick one in implementation; prefer returning parsed `options` from the config API to keep web dumb. If so, adjust Task 3/4 responses to map `optionsJson`→`options`.)

- [ ] **Step 1: Types** — add the above to `apps/web/lib/types.ts`.
- [ ] **Step 2: Hook** `useCustomFields.ts` — copy the `usePipelines.ts` shape exactly:
```ts
export function useCustomFields(entityType: 'candidate' | 'job') {
  const { accessToken } = useAuth();
  return useQuery<CustomFieldDefinition[]>({
    queryKey: ['custom-fields', entityType],
    queryFn: () => apiFetch(`/custom-fields?entityType=${entityType}`, {}, accessToken ?? undefined),
    enabled: Boolean(accessToken),
  });
}
// useCreateCustomField / useUpdateCustomField / useArchiveCustomField — POST/PATCH/DELETE, invalidate ['custom-fields', entityType]
```
- [ ] **Step 3: Settings page** — `'use client'`; a Candidate/Job toggle; list definitions (label, type, required, show-on-apply for candidate, position); an add/edit dialog (label, type select, options editor shown when type=select, required checkbox, showOnApply checkbox for candidate); archive row action. Follow `settings/pipelines/page.tsx` layout/toast conventions. Import `Button` directly (not the ui-v2 barrel) to dodge the known jest/DataTable ESM issue if a DataTable is used.
- [ ] **Step 4: Nav** — add to `SUPER_ADMIN_FULL_NAV` in `super-admin-nav.ts`: `{ href: '/settings/custom-fields', label: 'Custom Fields', icon: SlidersHorizontal }` (import `SlidersHorizontal` from lucide-react). Add `'/settings/custom-fields'` to the `V2_ROUTES` Set in `staff-nav.ts`.
- [ ] **Step 5: Test** — render the page with the hook mocked (QueryClient provider), assert both entity toggles list fields and that "Add field" calls the create mutation. Run `npx jest custom-fields` (web project).
- [ ] **Step 6: tsc + commit** `feat(custom-fields): web settings page + hook + nav`.

---

### Task 9: Web — CustomFieldsInputs/Display + wire all forms + apply page

**Files:**
- Create: `apps/web/components/CustomFieldsInputs.tsx` (exports `CustomFieldsInputs` + `CustomFieldsDisplay`)
- Modify: `candidates/CandidateFormDialog.tsx`, `jobs/CandidateDrawer.tsx`, `jobs/page.tsx` (new-job dialog), `jobs/RequisitionSection.tsx`, `jobs/[jobId]/page.tsx`, `app/(candidate)/apply/[applyToken]/apply-form.tsx` (+ `page.tsx` to pass server-fetched defs)
- Test: `apps/web/components/CustomFieldsInputs.test.tsx`

**Interfaces:**
- Consumes: `CustomFieldDefinition`, `CustomFieldInputMap`.
- Produces:
```tsx
export function CustomFieldsInputs(props: {
  definitions: CustomFieldDefinition[];
  values: CustomFieldInputMap;
  onChange: (next: CustomFieldInputMap) => void;
}): JSX.Element;
export function CustomFieldsDisplay(props: { fields: CustomFieldRead[] }): JSX.Element;
```

- [ ] **Step 1: Failing test** — render `CustomFieldsInputs` with one def of each type; assert it renders a text input, a number input, a `date` input, and a select with the given options; typing/selecting calls `onChange` with the definition id keyed to the new value; a `required` field renders the required marker.
- [ ] **Step 2: Implement `CustomFieldsInputs.tsx`** — map each active definition to a labeled control by `fieldType` (`text`→`<input type=text>`, `number`→`<input type=number>`, `date`→`<input type=date>`, `select`→`<select>` with `options`). Value read from `values[def.id] ?? ''`; onChange merges `{ ...values, [def.id]: v }` (empty string for cleared). `CustomFieldsDisplay` renders `fields` as label/value rows, skipping null values. No shared-value imports.
- [ ] **Step 3: Wire internal forms** — in each form: `const { data: defs } = useCustomFields('candidate'|'job')`; keep a `customFields` state map (seed from the record's `customFields` read on edit: map `definitionId`→`value`); render `<CustomFieldsInputs>`; include `customFields` in the existing create/update mutation body. `CandidateDrawer` and `jobs/[jobId]/page.tsx` render `<CustomFieldsDisplay fields={record.customFields}>`.
- [ ] **Step 4: Wire apply page** — `page.tsx` server component already fetches the public job (now including `customFields`); pass those defs into `apply-form.tsx`. In `apply-form.tsx` (plain `fetch`, no auth), keep a `customFields` state, render `<CustomFieldsInputs definitions={applyDefs} …>`, and include `customFields` in the JSON body of the `POST /public/jobs/${applyToken}/apply`. Client-side required validation mirrors the server (server remains authoritative).
- [ ] **Step 5: Run web tests + tsc.** **Step 6: Commit** `feat(custom-fields): shared inputs component + wire all forms + apply`.

---

## Self-Review Notes (author)

- **Spec coverage:** models+RLS (T1); config CRUD API (T2–T4); value read/write on candidate (T5) + job (T6); public-apply trust boundary (T7); settings UI + nav (T8); inputs component + all wiring incl. apply (T9). All spec sections mapped.
- **Type consistency:** the value input map is `Record<string, string | number | null>` everywhere (candidate DTO, job DTO, apply DTO, web `CustomFieldInputMap`). The read shape `CustomFieldRead` is identical API↔web. `CustomFieldDefinitionLite` (API internal) vs `CustomFieldDefinition` (web, with `options` parsed) — deliberately different; the config API maps `optionsJson`→`options` for web payloads (decide + apply in T4/T8).
- **Open implementation choice (flagged, non-blocking):** whether the config/read APIs return `optionsJson` (string) or parsed `options` (string[]). Recommendation: config API returns parsed `options` so web stays dumb; value-read payloads carry no options. Implementer picks one and keeps the web type in sync.
- **Migration ordering:** `20260906090000` / `..._090001` sort after everything on `origin/main` and after the parked branches' `20260905*` migrations — linear on any later merge.
