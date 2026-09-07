# Named Offer Templates (Zoho #9, slice 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the singleton `OfferTemplate` into multiple NAMED templates with one default per org, and let offer creation pick which template seeds the offer letter (defaulting to the org default).

**Architecture:** `OfferTemplate` gains `name` + `isDefault` (additive); the singleton `upsert`-by-org service becomes full CRUD with an auto-maintained exactly-one-default invariant; `getDefault` (replacing `getWithDefault`) returns the default (falling back to the existing `DEFAULT_OFFER_TEMPLATE` const when the org has none); offer creation accepts an optional `templateId` and seeds `letterSubject`/`letterBody` from that template (or the default), preserving the existing `dto.subject ?? template.subject` precedence. Offers still SNAPSHOT subject/body onto the `Offer` row, so nothing references a template after send — deleting a template is always safe.

**Tech Stack:** NestJS, Prisma, SQL Server, Next.js (apps/web), Jest.

**Design:** captured in this plan (no separate spec doc — bounded slice of #9, approved in chat 2026-09-07).

## Global Constraints

- **Base:** branch `feat/offer-templates` off origin/main @ `fec52f3c`. Work in the main checkout, NOT a worktree (junction disk-fill hazard).
- **NEVER** run `npm install` / `npm ci` / `npm update`. Use only `npx prisma generate` / `npx prisma migrate deploy` / existing `jest` / `tsc`.
- **SQL Server:** `offer_templates` already carries the tenant RLS policy → additive columns need NO `_rls` migration. Migration number `20260907160000` (sorts after everything on origin/main + all parked branches). Use `NVARCHAR`/`BIT` appropriately; backfill in the same migration.
- **Preserve existing behavior:** the `DEFAULT_OFFER_TEMPLATE` hardcoded fallback (used when an org has no template) stays; the offer-send precedence `letterSubject = dto.subject ?? template.subject` (explicit body wins over the template) stays; offers keep snapshotting subject/body onto the `Offer` row (do NOT add a template FK to `Offer`).
- **Exactly-one-default invariant** (auto-maintained, never zero-or-many when ≥1 template exists): setting a template's `isDefault=true` clears it on all others in the same transaction; deleting the default auto-promotes the most-recently-updated remaining template; deleting the last template leaves none (→ `DEFAULT_OFFER_TEMPLATE` fallback).
- **Gating unchanged:** the new offer-template CRUD routes keep whatever `@RequirePermissions`/guards the current `GET`/`PUT offer-template` routes use in `offers.controller.ts` — copy them verbatim onto the new routes (per-METHOD, since this repo's PermissionsGuard reads handler-level only).
- `name` is unique per org (`@@unique([organizationId, name])`).
- Attribution footer on every commit: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

### Task 1: Schema — name + isDefault + migration/backfill

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (model `OfferTemplate`)
- Create: `apps/api/prisma/migrations/20260907160000_named_offer_templates/migration.sql`

**Interfaces:**
- Produces: `OfferTemplate.name: string`, `OfferTemplate.isDefault: boolean`; columns `offer_templates.name NVARCHAR(...) NOT NULL`, `is_default BIT NOT NULL DEFAULT 0`; `@@unique([organizationId, name])`.

- [ ] **Step 1: Add fields to `OfferTemplate`:**
```prisma
name      String   @default("Offer letter")
isDefault Boolean  @default(false) @map("is_default")
```
and add `@@unique([organizationId, name])` alongside the existing `@@index([organizationId])`.

- [ ] **Step 2: Author the migration** at `apps/api/prisma/migrations/20260907160000_named_offer_templates/migration.sql`. Add the columns, backfill existing rows (each org currently has ≤1 template → make it the default), then add the unique index. Example SQL (adjust to match this repo's migration conventions — check a recent additive migration):
```sql
ALTER TABLE [dbo].[offer_templates] ADD [name] NVARCHAR(200) NOT NULL CONSTRAINT [DF_offer_templates_name] DEFAULT (N'Default offer letter');
ALTER TABLE [dbo].[offer_templates] ADD [is_default] BIT NOT NULL CONSTRAINT [DF_offer_templates_is_default] DEFAULT 0;
GO
UPDATE [dbo].[offer_templates] SET [is_default] = 1;
GO
CREATE UNIQUE INDEX [offer_templates_organization_id_name_key] ON [dbo].[offer_templates] ([organization_id], [name]);
```
(Every existing row is its org's only template, so `SET is_default = 1` for all is correct. If this repo's Prisma runner has no `GO` separator — check a prior migration — split into separate `EXEC` batches or the repo's convention. Match an existing additive+backfill migration exactly.)

- [ ] **Step 3: Apply + regenerate.** From `apps/api`: `npx prisma migrate deploy` then `npx prisma generate`. Expected: applied; client has `name`/`isDefault`.

- [ ] **Step 4: Typecheck.** `npx tsc -p apps/api/tsconfig.json --noEmit`. NOTE: this will surface type errors in `offer-templates.service.ts` (the `create`/`update` `data` now needs `name`) — that's expected; Task 2 fixes the service. If you want a green tsc at this task boundary, add `name: dto ... ` minimally, but it's acceptable to leave the service to Task 2. Report the tsc state honestly.

- [ ] **Step 5: Commit.**
```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260907160000_named_offer_templates
git commit -m "feat(offer-templates): name + isDefault columns with default backfill"
```

---

### Task 2: Service — singleton upsert → CRUD + default invariant

**Files:**
- Modify: `apps/api/src/offers/offer-templates.service.ts`
- Create: `apps/api/src/offers/dto/create-offer-template.dto.ts`, `apps/api/src/offers/dto/update-offer-template.dto.ts`
- (Delete or repurpose `apps/api/src/offers/dto/upsert-offer-template.dto.ts` once no longer referenced — Task 3 removes the last controller reference; coordinate.)
- Test: `apps/api/src/offers/offer-templates.service.spec.ts`

**Interfaces:**
- Consumes: `OfferTemplate.name`/`isDefault` (T1); `DEFAULT_OFFER_TEMPLATE` const (existing).
- Produces:
  - `list(context): Promise<OfferTemplateView[]>` — all org templates, default first then by name.
  - `getDefault(context): Promise<OfferTemplateView>` — the `isDefault` row, else `{ id: null, ...DEFAULT_OFFER_TEMPLATE }` (replaces `getWithDefault`; keep the same return shape but include `name`/`isDefault`).
  - `getById(context, id): Promise<OfferTemplateView>` — throws NotFound if not in org.
  - `create(context, actorUserId, dto: CreateOfferTemplateDto)`, `update(context, actorUserId, id, dto: UpdateOfferTemplateDto)`, `remove(context, actorUserId, id)`.
  - `OfferTemplateView` gains `name: string` and `isDefault: boolean`.

- [ ] **Step 1: Write failing service tests** covering: `list` returns all (default first); `create` with `isDefault: true` clears the default flag on siblings (same tx); `update` setting `isDefault: true` clears siblings; the FIRST template created for an org is forced `isDefault: true` regardless of input (an org with templates always has exactly one default); `remove` of the default auto-promotes another (most-recently-updated) to default; `remove` of the last template leaves none and `getDefault` then returns the `DEFAULT_OFFER_TEMPLATE` fallback; `getById` throws NotFound cross-org; unique-name violation surfaces cleanly. Assert audit calls.

Run: `npx jest offer-templates.service`. Expected: FAIL.

- [ ] **Step 2: DTOs.**
```ts
// create-offer-template.dto.ts
export class CreateOfferTemplateDto {
  @IsString() name!: string;
  @IsString() subject!: string;
  @IsString() body!: string;
  @IsOptional() @IsBoolean() isDefault?: boolean;
}
// update-offer-template.dto.ts — all optional (partial update)
export class UpdateOfferTemplateDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() subject?: string;
  @IsOptional() @IsString() body?: string;
  @IsOptional() @IsBoolean() isDefault?: boolean;
}
```

- [ ] **Step 3: Implement the service.** Replace `getWithDefault` with `getDefault` (find `where: { organizationId, isDefault: true }`, fallback to `{ id: null, name: DEFAULT_OFFER_TEMPLATE name, ...DEFAULT_OFFER_TEMPLATE, isDefault: true }`). Add `list`, `getById`, `create`, `update`, `remove`. Encapsulate the invariant in a helper used by create/update/remove (all within one `forTenant` tx):
  - create: if the org has zero templates, force `isDefault = true`; if `dto.isDefault` (or forced), `updateMany({ where: { organizationId, isDefault: true }, data: { isDefault: false } })` before creating the new one as default.
  - update: if `dto.isDefault === true`, clear siblings first; do NOT allow setting `isDefault: false` on the current default directly (ignore a false, or require promoting another — simplest: ignore `isDefault: false`, since exactly-one-default is auto-maintained).
  - remove: delete; if the removed row was the default and others remain, set the most-recently-updated remaining `isDefault = true`.
  - Audit each mutation (reuse the existing `offer_template.*` action naming, e.g. `offer_template.created/updated/deleted`).

- [ ] **Step 4: Run tests GREEN.** `npx jest offer-templates.service`. Expected: PASS.

- [ ] **Step 5: tsc.** `npx tsc -p apps/api/tsconfig.json --noEmit` — note it may still fail on the controller/offers.service until Task 3; report honestly (service file itself must be clean).

- [ ] **Step 6: Commit.**
```bash
git add apps/api/src/offers/offer-templates.service.ts apps/api/src/offers/offer-templates.service.spec.ts apps/api/src/offers/dto/create-offer-template.dto.ts apps/api/src/offers/dto/update-offer-template.dto.ts
git commit -m "feat(offer-templates): CRUD service with auto-maintained single default"
```

---

### Task 3: Controller CRUD + offer-send template selection

**Files:**
- Modify: `apps/api/src/offers/offers.controller.ts` (replace the singleton `GET`/`PUT offer-template` with CRUD)
- Modify: `apps/api/src/offers/offers.service.ts` (createOffer: honor `dto.templateId`)
- Modify: `apps/api/src/offers/dto/create-offer.dto.ts` (add optional `templateId`)
- Remove: `apps/api/src/offers/dto/upsert-offer-template.dto.ts` (once unreferenced)
- Test: `apps/api/src/offers/offers.controller.spec.ts` (+ offers.service spec for the templateId path)

**Interfaces:**
- Consumes: the T2 service methods; `CreateOfferTemplateDto`/`UpdateOfferTemplateDto`.
- Produces: `GET /offer-template` (list), `GET /offer-template/default` (the default — for the offer-send picker's initial value; optional if the picker uses the list), `POST /offer-template`, `PATCH /offer-template/:id`, `DELETE /offer-template/:id`; `CreateOfferDto.templateId?`.

- [ ] **Step 1: Write failing controller spec** — assert: `GET /offer-template` → `list`; `POST` → `create`; `PATCH /offer-template/:id` → `update`; `DELETE /offer-template/:id` → `remove`; every route carries the SAME per-method `@RequirePermissions(...)` the current offer-template routes use (copy verbatim); `create-offer` with `templateId` passes it to `offers.service.createOffer`. Run `npx jest offers.controller`. Expected: FAIL.

- [ ] **Step 2: Controller.** Replace `@Get('offer-template')`/`@Put('offer-template')` with: `@Get('offer-template')` → `list`; `@Post('offer-template')` → `create`; `@Patch('offer-template/:id')` → `update`; `@Delete('offer-template/:id')` → `remove`. Keep the identical guards/`@RequirePermissions` + `@CurrentTenant()`/`@CurrentUserId()`. (Keep or add `@Get('offer-template/default')` → `getDefault` if the web picker wants a dedicated default endpoint; otherwise the list suffices.)

- [ ] **Step 3: Offer-send wiring.** Add `@IsOptional() @IsString() templateId?: string;` to `CreateOfferDto`. In `offers.service.createOffer`, replace `const template = await this.offerTemplates.getWithDefault(context)` with: `const template = dto.templateId ? await this.offerTemplates.getById(context, dto.templateId) : await this.offerTemplates.getDefault(context);` — keep the exact precedence `letterSubject = dto.subject ?? template.subject; letterBody = dto.body ?? template.body`. A bad `templateId` → NotFound (from getById), which is correct.

- [ ] **Step 4: Remove the dead DTO.** Delete `upsert-offer-template.dto.ts` and its imports.

- [ ] **Step 5: Run tests + tsc.** `npx jest offers` + `npx tsc -p apps/api/tsconfig.json --noEmit`. Expected: PASS + clean.

- [ ] **Step 6: Full api suite.** `npx jest` (apps/api). Expected: green (note any known pre-existing failures).

- [ ] **Step 7: Commit.**
```bash
git add apps/api/src/offers
git commit -m "feat(offer-templates): CRUD routes + offer-send template selection"
```

---

### Task 4: Web — template management page + offer-send picker

**Files:**
- Modify: `apps/web/lib/hooks/useOffers.ts` (offer-template hooks → list/create/update/delete; offer-create gains templateId)
- Modify: `apps/web/app/v2/(recruiter)/offer-template/page.tsx` (single editor → list + CRUD + mark-default)
- Modify: the offer-create UI component (locate via `useCreateOffer`/`CreateOffer` usage — grep) to add a template picker
- Test: `apps/web/app/v2/(recruiter)/offer-template/page.test.tsx`

**Interfaces:**
- Consumes: the T3 endpoints.

- [ ] **Step 1: Hooks.** In `useOffers.ts`, replace the single get/put offer-template hooks with: `useOfferTemplates()` (list), `useCreateOfferTemplate()`, `useUpdateOfferTemplate()`, `useDeleteOfferTemplate()` (invalidate the list on success); ensure the create-offer mutation accepts `templateId`. Mirror existing hook conventions in this file / `useUserGroups.ts`. No `@exam-platform/shared` runtime-value import.

- [ ] **Step 2: Write the failing page test.** Render the page with a mocked list (2 templates, one default): asserts both render with the default marked; create/edit/delete fire the right mutations; "mark default" fires update with `isDefault: true`. Mirror an existing settings page test. Run `npx jest offer-template` (web). Expected: FAIL.

- [ ] **Step 3: Page.** Convert the single-editor page to a list of templates (name + default badge) with Create / Edit / Delete / Mark-default actions and an editor (name, subject, body). Use existing v2 primitives + the established row-action button convention (see user-groups/business-hours pages). Empty state when none.

- [ ] **Step 4: Offer-send picker.** Locate the offer-create form (grep for the create-offer mutation usage / `CreateOfferDto` consumer in apps/web). Add a template `<select>` populated from `useOfferTemplates()`, defaulting to the default template, that sets `templateId` on the create-offer call. Keep it additive — if the picker is omitted/untouched, `templateId` stays undefined and the server uses the default (current behavior). If the offer-create UI is complex or not clearly located, implement the management page fully and report the picker as DONE_WITH_CONCERNS with what you found — do not force a fragile change.

- [ ] **Step 5: Run tests + tsc.** `npx jest offer-template` (web); web suite (note only the known pre-existing ImpersonationBanner failure); `npx tsc -p apps/web/tsconfig.json --noEmit` (ignore pre-existing stale `.next/types` noise; no NEW errors).

- [ ] **Step 6: Commit.**
```bash
git add apps/web/lib/hooks/useOffers.ts apps/web/app/v2/'(recruiter)'/offer-template
git commit -m "feat(offer-templates): management page + offer-send template picker"
```

---

## Self-Review

**Spec coverage:** name+isDefault+backfill (T1) ✓; CRUD service + default invariant + getDefault fallback (T2) ✓; CRUD routes + offer-send templateId with preserved precedence (T3) ✓; web management + picker (T4) ✓. Snapshot model preserved (no Offer template FK); deleting a template is always safe.

**Placeholder scan:** No TBD. T1's migration SQL says "match a prior additive+backfill migration's batch convention" (concrete existing reference, not vague). T4's picker has an explicit locate-or-report fallback. tsc-red-at-task-boundary (T1/T2) is called out honestly rather than hidden.

**Type/name consistency:** `OfferTemplateView` gains `name`/`isDefault` in T2 and is consumed by T3/T4. `getDefault` replaces `getWithDefault` consistently (T2 defines, T3 calls). `templateId` optional on `CreateOfferDto` (T3) matches the hook (T4). Migration `20260907160000` unique/ordered. Endpoints `GET/POST/PATCH/DELETE /offer-template[...]` match between T3 and T4.

**Load-bearing risks:** the exactly-one-default invariant is the correctness core — T2 tests it directly (create/update/delete paths + first-template-forced-default + last-delete fallback). Gating must be copied verbatim from the existing routes (handler-level) — called out in Global Constraints + T3 Step 1.
