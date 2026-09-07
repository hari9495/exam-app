# Org Sender Addresses (Zoho #9, slice 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give orgs a managed list of named sender addresses (one default); the default becomes the effective email From for all org emails, and recruiters can pick a sender when composing a manual candidate email. Behavior-preserving when no senders are configured.

**Architecture:** New `OrgSenderAddress` table; `EmailService` resolves the From centrally (per-send override → org default sender → existing `emailFromAddress` → `smtpUser` → platform); the manual candidate-email send path validates + passes a chosen sender; org-admin CRUD manages the list.

**Tech Stack:** NestJS, Prisma, SQL Server (RLS), Next.js (apps/web), Jest, nodemailer.

**Spec:** docs/superpowers/specs/2026-09-07-org-sender-addresses-design.md

## Global Constraints

- **Base:** branch `feat/org-sender-addresses` off origin/main @ `fec52f3c`. Work in the main checkout, NOT a worktree (junction disk-fill hazard).
- **NEVER** run `npm install` / `npm ci` / `npm update`. Use only `npx prisma generate` / `npx prisma migrate deploy` / existing `jest` / `tsc`. Run jest FROM `apps/api` or `apps/web` (repo-root `npx jest` mis-resolves into a stale sibling worktree on this machine).
- **New tenant table → paired `_rls` migration.** Migration numbers `20260907180000` (table) + `20260907180001` (rls). `NVARCHAR(320)` for address, `NVARCHAR(200)` label, `BIT` isDefault. No seed change.
- **Behavior-preserving From resolution (LOAD-BEARING):** with no `OrgSenderAddress` rows, the From must be byte-for-byte what it is today — `org.emailFromAddress ?? org.smtpUser ?? platformFromAddress()`. The default-sender lookup only changes the From when a default row exists. Do NOT change the transporter/`deliverable` logic, the transporter cache keying (by organizationId), or the platform-fallback branch.
- **Keep `emailFromAddress`** as the base fallback (do not remove; it's wired into SMTP settings + the send-as fallback). The sender list overrides it only when a default exists. No data migration.
- **No arbitrary From injection:** `EmailService` prefers `input.fromAddress` only; it never looks up sender rows from a raw client value. The caller (candidate-emails) resolves a `senderAddressId` against the org's own `OrgSenderAddress` rows before passing the resolved `address`.
- **Exactly-one-default invariant, auto-maintained** (same pattern as offer templates on feat/offer-templates: a single `clearOrgDefault`-style helper; first sender forced default; set clears siblings; delete promotes most-recently-updated / last→none).
- **Gating:** sender-CRUD routes per-method `@RequirePermissions('org:manage_settings')` (guard is handler-only). The candidate-email compose send stays `pipeline:manage` (recruiters pick from the org's configured senders but don't manage the list).
- Attribution footer on every commit: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

### Task 1: Schema — OrgSenderAddress + migration + _rls

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260907180000_org_sender_addresses/migration.sql`
- Create: `apps/api/prisma/migrations/20260907180001_org_sender_addresses_rls/migration.sql`

**Interfaces:**
- Produces: `OrgSenderAddress` model + `org_sender_addresses` table (tenant-scoped, RLS-protected).

- [ ] **Step 1: Add the model** (exact fields from the spec): id, organizationId, label (NVarChar(200)), address (NVarChar(320)), isDefault (@default(false) @map("is_default")), createdAt, updatedAt; `@@unique([organizationId, address])`, `@@index([organizationId])`, `@@map("org_sender_addresses")`.

- [ ] **Step 2: Table migration** `20260907180000_org_sender_addresses/migration.sql` — CREATE TABLE + unique index on (organization_id, address). Mirror a recent new-tenant-table CREATE (e.g. `20260906100000_user_groups` or `20260907170000_approval_email_templates`).

- [ ] **Step 3: RLS migration** `20260907180001_org_sender_addresses_rls/migration.sql` — ALTER SECURITY POLICY dbo.TenantAccessPolicy ADD FILTER PREDICATE + AFTER INSERT/AFTER UPDATE BLOCK predicates on `org_sender_addresses` via `fn_tenant_access_predicate(organization_id)`. Copy the exact shape/batch convention from `20260907170001_approval_email_templates_rls` (or user_groups_rls). Only ADD for the new table; leave other tables' predicates and the tenant function unchanged.

- [ ] **Step 4: Apply + regenerate + typecheck.** From `apps/api`: `npx prisma migrate deploy`, `npx prisma generate`, `npx tsc -p apps/api/tsconfig.json --noEmit`. Expected: both applied, client has the model, tsc clean.

- [ ] **Step 5: Commit.**
```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260907180000_org_sender_addresses apps/api/prisma/migrations/20260907180001_org_sender_addresses_rls
git commit -m "feat(sender-addresses): OrgSenderAddress table + RLS"
```

---

### Task 2: EmailService — central From resolution (behavior-preserving)

**Files:**
- Modify: `apps/api/src/email/email.service.ts`
- Test: `apps/api/src/email/email.service.spec.ts`

**Interfaces:**
- Consumes: `OrgSenderAddress` (T1).
- Produces: `SendEmailInput.fromAddress?: string`; From precedence in `resolveTransporter`.

- [ ] **Step 1: Add `fromAddress?: string` to `SendEmailInput`.**

- [ ] **Step 2: Thread the override + default-sender lookup.** `send()` passes `input.fromAddress` to `resolveTransporter`. In `resolveTransporter`, for the org-SMTP branch, resolve the From as:
  `fromAddressOverride ?? (org's default OrgSenderAddress).address ?? org.emailFromAddress ?? org.smtpUser ?? platformFromAddress()`.
  Fetch the default sender with a cheap `findFirst({ where: { organizationId, isDefault: true }, select: { address: true } })` (or add to the existing org select via relation — keep it one extra query at most). Do NOT alter the transporter build, the cache (keyed by organizationId — the From is not part of the transporter), the `deliverable` flag, or the platform-fallback branch (which has no org and thus no sender/override → unchanged).

- [ ] **Step 3: Tests (extend email.service.spec.ts).** Assert the From precedence with mocked prisma/transporter: (a) `input.fromAddress` wins over everything; (b) no override but a default OrgSenderAddress → its address; (c) no override, no sender rows → `org.emailFromAddress`; (d) none of those → `org.smtpUser`; (e) no org SMTP → platform branch unchanged (no sender lookup, byte-for-byte today's behavior). Assert `sendMail` is called with the resolved `from`. Verify the transporter cache still keys by organizationId only.

Run: `npx jest email.service` (from apps/api). Expected: PASS.

- [ ] **Step 4: tsc + commit.** `npx tsc -p apps/api/tsconfig.json --noEmit`.
```bash
git add apps/api/src/email
git commit -m "feat(sender-addresses): resolve From via org default sender + per-send override"
```

---

### Task 3: Sender CRUD service + config API

**Files:**
- Create: `apps/api/src/organizations/org-sender-addresses.service.ts`
- Create: `apps/api/src/organizations/org-sender-addresses.controller.ts`
- Create: `apps/api/src/organizations/dto/create-sender-address.dto.ts`, `dto/update-sender-address.dto.ts`
- Modify: the organizations module (register controller + service)
- Test: controller spec + service spec

**Interfaces:**
- Consumes: `OrgSenderAddress` (T1).
- Produces: `GET/POST /org-sender-addresses`, `PATCH/DELETE /org-sender-addresses/:id`.

- [ ] **Step 1: DTOs.** `CreateSenderAddressDto { @IsString() @MaxLength(200) label; @IsEmail() @MaxLength(320) address; @IsOptional() @IsBoolean() isDefault? }`. `UpdateSenderAddressDto` — all optional (`@IsOptional()` each), same validators.

- [ ] **Step 2: Failing controller spec.** GET→list, POST→create, PATCH/:id→update, DELETE/:id→remove; all four carry per-method `@RequirePermissions('org:manage_settings')` (assert via Reflector). Run `npx jest org-sender-addresses` (from apps/api). Expected: FAIL.

- [ ] **Step 3: Service** (tenant-scoped via forTenant; reuse the offer-templates exactly-one-default pattern — a single `clearOrgDefault` helper): `list` (default first, then label); `create` (first sender forced default; if isDefault, clear siblings first; unique-address → ConflictException 409); `update(id)` (isDefault:true clears siblings; ignore isDefault:false); `remove(id)` (delete; if was default and others remain, promote most-recently-updated; last→none). Audit `org_sender_address.created/updated/deleted`.

- [ ] **Step 4: Controller + module.** Four routes, per-method `@RequirePermissions('org:manage_settings')` + guards + `@CurrentTenant()`/`@CurrentUserId()`; register in the organizations module.

- [ ] **Step 5: Run specs + tsc + commit.** `npx jest org-sender-addresses` (apps/api) + `npx tsc -p apps/api/tsconfig.json --noEmit`.
```bash
git add apps/api/src/organizations
git commit -m "feat(sender-addresses): CRUD config API gated org:manage_settings"
```

---

### Task 4: candidate-emails — per-send sender picker

**Files:**
- Modify: `apps/api/src/candidate-emails/dto/send-message.dto.ts`
- Modify: `apps/api/src/candidate-emails/candidate-emails.service.ts` (`sendMessage`, and the `SendMessageInput` type)
- Test: `apps/api/src/candidate-emails/candidate-emails.service.spec.ts`

**Interfaces:**
- Consumes: `OrgSenderAddress` (T1); `SendEmailInput.fromAddress` (T2).

- [ ] **Step 1: DTO + input type.** Add `@IsOptional() @IsString() senderAddressId?: string` to `SendMessageDto`; add `senderAddressId?: string` to the `SendMessageInput` type used by `sendMessage`.

- [ ] **Step 2: Resolve + pass in `sendMessage`.** When `input.senderAddressId` is set: `findFirst` the org's `OrgSenderAddress` by `{ id: input.senderAddressId, organizationId: orgId }` (within the existing forTenant scope); if not found → `NotFoundException`/`BadRequestException`; else pass its `address` as `emailService.send({ ..., fromAddress })`. When absent: unchanged (org default applies via T2). Do not change the rest of sendMessage (template resolution, logging row, etc.).

- [ ] **Step 3: Tests.** `senderAddressId` present + valid → send called with `fromAddress = the sender's address`; `senderAddressId` not the org's → rejected (no send); absent → send called WITHOUT fromAddress (unchanged). Extend candidate-emails.service.spec.ts.

Run: `npx jest candidate-emails.service` (apps/api). Expected: PASS.

- [ ] **Step 4: Full api suite + tsc + commit.** `npx jest` (from apps/api) + `npx tsc -p apps/api/tsconfig.json --noEmit`.
```bash
git add apps/api/src/candidate-emails
git commit -m "feat(sender-addresses): pick sender on manual candidate email"
```

---

### Task 5: Web — senders settings page + compose picker + nav

**Files:**
- Create: `apps/web/lib/hooks/useOrgSenderAddresses.ts`
- Create: `apps/web/app/v2/(org-admin)/settings/sender-addresses/page.tsx`
- Modify: `apps/web/lib/super-admin-nav.ts` + `apps/web/lib/staff-nav.ts`
- Modify: the manual candidate-email compose UI (find the component using `useCandidateMessages` send mutation) to add a sender `<select>`
- Test: `apps/web/app/v2/(org-admin)/settings/sender-addresses/page.test.tsx`

**Interfaces:**
- Consumes: T3 endpoints (CRUD) + T4 (`senderAddressId` on the send call).

- [ ] **Step 1: Hook.** `useOrgSenderAddresses()` (list) + create/update/delete mutations (invalidate list on success). Mirror an existing settings hook (useUserGroups/useBusinessHours). No `@exam-platform/shared` runtime-value import.

- [ ] **Step 2: Failing page test.** Renders a mocked list (2 senders, one default) with default badge; Create/Edit/Delete fire the right mutations; Mark-default fires update `isDefault:true`. Mirror an existing settings page test. Run `npx jest sender-addresses` (from apps/web). Expected: FAIL.

- [ ] **Step 3: Settings page** `/settings/sender-addresses`: list (label + address + default badge) + Create/Edit/Delete/Mark-default + editor (label, address). Note that the default is used for all emails and each address must be one the org's mail server can send as. Existing v2 primitives; deep-import Button/TextField if the ui-v2 barrel is a Jest hazard (known pattern). Empty state.

- [ ] **Step 4: Compose picker.** In the manual candidate-email compose UI (locate via `useCandidateMessages` send mutation usage), add an optional sender `<select>` from `useOrgSenderAddresses()` defaulting to the org default, that sets `senderAddressId` on the send call. Additive — omitted → server uses default. If the compose UI is complex/not clearly located, ship the settings page + report the picker as DONE_WITH_CONCERNS with findings — do not force a fragile change.

- [ ] **Step 5: Nav.** super-admin-nav: `{ href: '/settings/sender-addresses', label: 'Sender Addresses', icon: <a lucide icon, imported> }`; staff-nav: add `'/settings/sender-addresses'` to V2_ROUTES.

- [ ] **Step 6: Run tests + tsc + commit.** `npx jest sender-addresses` (apps/web); web suite (note only the known pre-existing ImpersonationBanner failure); `npx tsc -p apps/web/tsconfig.json --noEmit` (ignore pre-existing stale `.next/types` noise; no NEW errors).
```bash
git add apps/web/lib apps/web/app/v2/'(org-admin)'/settings/sender-addresses <compose-component-path>
git commit -m "feat(sender-addresses): settings page + compose picker + nav"
```

---

## Self-Review

**Spec coverage:** table+RLS (T1) ✓; central From resolution + override + behavior-preserving fallback (T2) ✓; CRUD + default invariant (T3) ✓; per-send picker on manual candidate emails (T4) ✓; web settings + compose picker + nav (T5) ✓. `emailFromAddress` kept as fallback (T2). No arbitrary From injection (T4 resolves against org rows; T2 only honors `input.fromAddress`).

**Placeholder scan:** No TBD. T1's `_rls` says "copy the exact shape from approval_email_templates_rls". T5's compose picker has a locate-or-report fallback. T2's precedence chain is spelled out explicitly.

**Type/name consistency:** `SendEmailInput.fromAddress?` (T2) consumed by T4's `send({fromAddress})`. `senderAddressId?` on SendMessageDto + SendMessageInput (T4) ↔ web send call (T5). Endpoints `GET/POST/PATCH/DELETE /org-sender-addresses` match T3↔T5. Default invariant mirrors offer-templates. Migrations 180000/180001 unique/ordered.

**Load-bearing risks:** (a) behavior-preservation — T2 tests the no-senders path is byte-for-byte today's From chain, and that the transporter cache/deliverable logic is untouched; (b) no-arbitrary-From — T4 validates senderAddressId against the org's own rows before EmailService sees any address; (c) exactly-one-default — T3 tests create/set/delete paths.
