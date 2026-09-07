# Candidate Consent Capture (Zoho #21) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an org require a configurable consent statement on the public apply form + walk-in registration, recording `consentedAt`/`consentVersion` on the candidate. Behavior-preserving when no consent text is configured.

**Architecture:** Additive `Candidate` + `Organization` columns; server-side conditional enforcement in `public-applications.apply` + `walk-in.register`; consent text surfaced on the existing public apply/walk-in GET payloads; an org-admin GET/PUT config; consent checkbox on both public web forms + a settings page.

**Tech Stack:** NestJS, Prisma, SQL Server, Next.js (apps/web), Jest.

**Spec:** docs/superpowers/specs/2026-09-07-consent-capture-design.md

## Global Constraints

- **Base:** branch `feat/consent-capture` off origin/main @ `fec52f3c`. Work in the main checkout, NOT a worktree (junction disk-fill hazard).
- **NEVER** run `npm install` / `npm ci` / `npm update`. Use only `npx prisma generate` / `npx prisma migrate deploy` / existing `jest` / `tsc`. Run jest FROM `apps/api` or `apps/web` (repo-root `npx jest` mis-resolves into a stale sibling worktree; kill stale jest processes if a locked-DLL EPERM occurs).
- **Additive columns on `candidates` + `organizations` (both already tenant-RLS) → NO `_rls` migration, no seed.** Migration `20260907200000`.
- **Conditional, server-side enforcement:** consent is required ONLY when `org.applyConsentText` is non-null AND non-empty (empty string treated as not-configured). When required and `dto.consentAccepted !== true` → `BadRequestException`. When configured, stamp `candidate.consentedAt = new Date()`, `consentVersion = org.applyConsentVersion` on BOTH the new-candidate create AND the existing-candidate update paths. When not configured → no field, no stamp, unchanged behavior. The public form cannot bypass (server re-validates).
- **Behavior-preserving:** existing orgs (no consent text) see zero change on apply/walk-in.
- Config routes per-method `@RequirePermissions('org:manage_settings')` (guard is handler-only). No new permission/seed.
- Attribution footer on every commit: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

### Task 1: Schema — consent columns + migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (models `Candidate`, `Organization`)
- Create: `apps/api/prisma/migrations/20260907200000_consent_capture/migration.sql`

**Interfaces:**
- Produces: `Candidate.consentedAt: Date|null`, `Candidate.consentVersion: number|null`; `Organization.applyConsentText: string|null`, `Organization.applyConsentVersion: number` (default 1).

- [ ] **Step 1: Add fields.**
```prisma
// Candidate
consentedAt    DateTime? @map("consented_at")
consentVersion Int?      @map("consent_version")
// Organization
applyConsentText    String? @map("apply_consent_text") @db.NVarChar(Max)
applyConsentVersion Int     @default(1) @map("apply_consent_version")
```

- [ ] **Step 2: Migration** `20260907200000_consent_capture/migration.sql`:
```sql
ALTER TABLE [dbo].[candidates] ADD [consented_at] DATETIME2 NULL, [consent_version] INT NULL;
ALTER TABLE [dbo].[organizations] ADD [apply_consent_text] NVARCHAR(MAX) NULL, [apply_consent_version] INT NOT NULL CONSTRAINT [DF_organizations_apply_consent_version] DEFAULT 1;
```
(No `_rls` — both tables already carry the tenant policy. Match a recent additive-column migration's conventions.)

- [ ] **Step 3: Apply + regenerate + typecheck.** From `apps/api`: `npx prisma migrate deploy`, `npx prisma generate`, `npx tsc -p apps/api/tsconfig.json --noEmit`. Expected: applied, client has the fields, tsc clean.

- [ ] **Step 4: Commit.**
```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260907200000_consent_capture
git commit -m "feat(consent): candidate consent + org apply-consent columns"
```

---

### Task 2: API — enforcement on apply + walk-in, and public GET exposure

**Files:**
- Modify: `apps/api/src/public-applications/dto/apply.dto.ts` (add `consentAccepted?`)
- Modify: `apps/api/src/public-applications/public-applications.service.ts` (`apply`, and the public job GET payload `getPublicJob`/`resolveJob` return ~line 92)
- Modify: `apps/api/src/walk-in/dto/register-walk-in.dto.ts` (add `consentAccepted?`)
- Modify: `apps/api/src/walk-in/walk-in.service.ts` (`register`, and `listExams` payload — the walk-in page GET)
- Test: `public-applications.service.spec.ts`, `walk-in.service.spec.ts`

**Interfaces:**
- Consumes: the consent columns (T1).
- Produces: enforced consent + stamping; `applyConsentText`/`applyConsentVersion` on the apply + walk-in GET payloads; `consentAccepted?: boolean` on both DTOs.

- [ ] **Step 1: DTOs.** Add `@IsOptional() @IsBoolean() consentAccepted?: boolean` to `ApplyDto` and `RegisterWalkInDto`.

- [ ] **Step 2: Enforcement helper.** A small shared check: given `applyConsentText` (string|null) + `applyConsentVersion` + `dto.consentAccepted`, return either the stamp `{ consentedAt: new Date(), consentVersion }` or throw `BadRequestException('Consent is required to apply')` when text is set (non-empty) and the flag isn't true, or `{}` when not configured. Treat empty/whitespace-only `applyConsentText` as not-configured. (Keep it a tiny pure function reused by both services — no duplication.)

- [ ] **Step 3: apply().** Fetch `applyConsentText` + `applyConsentVersion` for the job's org (the org is loaded / cheaply loadable via `job.organizationId`). Compute the stamp via the helper; merge it into BOTH the candidate `create` data and the existing-candidate `update` data (so new AND returning candidates get stamped when consent is required). Unchanged when not configured.

- [ ] **Step 4: register().** Same: the walk-in `org` is already resolved; compute the stamp; merge into the candidate create + reuse-update paths.

- [ ] **Step 5: Public GET exposure.** Add `applyConsentText` + `applyConsentVersion` to the apply job payload (`getPublicJob`/`resolveJob` return, ~line 92) and to the walk-in `listExams` return object. No OTHER new org fields exposed.

- [ ] **Step 6: Tests.** For BOTH apply + walk-in: org with consent text + consentAccepted:true → candidate stamped (consentedAt set, consentVersion = org version) on new AND returning candidate; consentAccepted missing/false → BadRequest, no candidate write; org without consent text (null or empty) → no stamp, succeeds; GET payload includes applyConsentText/version. Extend both service specs.

Run: `npx jest public-applications walk-in` (from apps/api). Expected: PASS.

- [ ] **Step 7: Full api suite + tsc + commit.** `npx jest` (apps/api) + `npx tsc -p apps/api/tsconfig.json --noEmit`.
```bash
git add apps/api/src/public-applications apps/api/src/walk-in
git commit -m "feat(consent): enforce + stamp consent on apply/walk-in; expose text on public GETs"
```

---

### Task 3: Config API — GET/PUT apply-consent (admin)

**Files:**
- Modify: `apps/api/src/organizations/organizations.controller.ts` (add routes) + the org settings service (or a small dedicated service) — mirror an existing org-settings config (e.g. business-hours).
- Create: `apps/api/src/organizations/dto/update-apply-consent.dto.ts`
- Test: controller + service spec

**Interfaces:**
- Consumes: the org consent columns (T1).
- Produces: `GET /organizations/apply-consent` → `{ text: string|null, version: number }`; `PUT /organizations/apply-consent` `{ text: string|null }`.

- [ ] **Step 1: Service.** `getApplyConsent(context)` → `{ text: org.applyConsentText, version: org.applyConsentVersion }`. `setApplyConsent(context, actorUserId, text)`: normalize empty/whitespace → null; if the normalized text DIFFERS from the stored value → also `applyConsentVersion: { increment: 1 }`; else leave the version. Audit `organization.apply_consent_updated`. Tenant-scoped via forTenant.

- [ ] **Step 2: DTO.** `UpdateApplyConsentDto { @IsOptional() @IsString() @MaxLength(...) text?: string | null }` (nullable allowed to clear).

- [ ] **Step 3: Failing controller spec** — GET → service; PUT → service with the text; both carry per-method `@RequirePermissions('org:manage_settings')` (Reflector assertion). Run `npx jest apply-consent` (apps/api). Expected: FAIL.

- [ ] **Step 4: Controller.** GET + PUT, per-method gated, `@CurrentTenant()`/`@CurrentUserId()`.

- [ ] **Step 5: Tests + tsc + commit.** Service: version bump ONLY on change; empty→null; audit. `npx jest apply-consent` + api tsc.
```bash
git add apps/api/src/organizations
git commit -m "feat(consent): GET/PUT apply-consent config gated org:manage_settings"
```

---

### Task 4: Web — apply + walk-in consent checkbox + settings page

**Files:**
- Modify: `apps/web/app/(candidate)/apply/[applyToken]/apply-form.tsx` (+ the page that fetches the job payload, to pass consent text through)
- Modify: `apps/web/app/walk-in/[orgSlug]/page.tsx` (walk-in registration form)
- Create: `apps/web/lib/hooks/useApplyConsent.ts` + settings page `apps/web/app/v2/(org-admin)/settings/apply-consent/page.tsx`
- Modify: `apps/web/lib/super-admin-nav.ts` + `staff-nav.ts`
- Test: `apply-form.test.tsx` (extend) + settings page test

**Interfaces:**
- Consumes: the T2 GET payloads (consent text) + T2 apply/register DTOs (`consentAccepted`) + T3 config endpoints.

- [ ] **Step 1: Apply form.** When the job payload includes a non-empty `applyConsentText`, render it + a **required** consent checkbox; disable/block submit until checked; include `consentAccepted: true` in the apply POST. When absent → no checkbox (unchanged). Extend `apply-form.test.tsx`: checkbox required + blocks submit + sends the flag; absent → no checkbox.

- [ ] **Step 2: Walk-in form.** Same consent checkbox on `walk-in/[orgSlug]/page.tsx` when the walk-in payload includes consent text; send `consentAccepted` on register. (This is a public unauthenticated page — use its existing fetch approach, not the authed api-client.)

- [ ] **Step 3: Settings page + hook.** `useApplyConsent` (GET + PUT `{ text }`, invalidate on success); `/settings/apply-consent` page — a textarea + Save (gated org:manage_settings; org_admin route group), with a note that saving bumps the version and re-prompts applicants. Mirror an existing settings page shell. Nav: super-admin-nav entry (icon) + staff-nav V2_ROUTES. No `@exam-platform/shared` runtime-value import.

- [ ] **Step 4: Failing settings page test** first (renders current text, Save fires PUT). Run `npx jest apply-consent` (apps/web).

- [ ] **Step 5: Run tests + tsc + commit.** `npx jest apply-consent apply-form` (apps/web); web suite (note only the known pre-existing ImpersonationBanner failure); `npx tsc -p apps/web/tsconfig.json --noEmit` (ignore pre-existing stale `.next/types` noise; no NEW errors).
```bash
git add apps/web/app/'(candidate)'/apply apps/web/app/walk-in apps/web/lib apps/web/app/v2/'(org-admin)'/settings/apply-consent
git commit -m "feat(consent): apply + walk-in consent checkbox + settings page"
```

---

## Self-Review

**Spec coverage:** columns (T1) ✓; enforcement + stamp on both paths + public GET exposure (T2) ✓; config GET/PUT with version-bump-on-change (T3) ✓; web checkboxes on both forms + settings (T4) ✓. Behavior-preserving-when-unconfigured is enforced server-side (T2) and mirrored client-side (T4).

**Placeholder scan:** No TBD. T2's enforcement is a named tiny helper (no duplication across the two services). T3 says "mirror business-hours settings." T4 says "mirror an existing settings page / the public fetch approach." Exposure points are concrete (getPublicJob return ~line 92; walk-in listExams).

**Type/name consistency:** `consentAccepted?` on both DTOs (T2) ↔ web POSTs (T4). `applyConsentText`/`applyConsentVersion` spelled identically across T1 schema, T2 enforce/expose, T3 config. `{ text, version }` config shape matches T3↔T4. Migration `20260907200000` unique/ordered.

**Load-bearing risks:** (a) enforcement must be server-side + conditional (empty=off) and stamp BOTH new+returning candidates — T2 tests both; (b) behavior-preserving when unconfigured — T2 tests the no-text path unchanged; (c) version bump ONLY on actual text change — T3 tests it.
