# Candidate Consent Capture (Zoho #21) — Design

**Date:** 2026-09-07
**Status:** Approved (design), pending spec review
**Zoho adopt:** #21 (GDPR consent + data-subject rights). Erase + export are already BUILT (Candidate.erasedAt, export/erase endpoints); this closes the **consent-capture-on-apply** gap.
**Branch:** `feat/consent-capture` (off origin/main @ `fec52f3c`)

## Goal

Let an org require candidates to accept a configurable consent statement when applying (public apply form + walk-in registration), recording when they consented and to which version. Behavior-preserving when an org configures no consent text.

## Scope

**In:** `Candidate.consentedAt` + `consentVersion`; `Organization.applyConsentText` + `applyConsentVersion`; consent enforcement (server-side) on `public-applications.apply` + `walk-in.register`; the consent text exposed on the public apply + walk-in GET payloads; consent checkbox on both web forms; an org-admin settings page to edit the consent text.

**Out (deferred / not this slice):**
- Per-application (PipelineEntry) consent granularity — consent is stored per Candidate (org-scoped).
- No re-consent gating at apply time (the checkbox is shown/required on every apply when configured; the version is recorded for audit + a future re-consent flow).
- No consent for authenticated staff-created candidates (walk-in + public apply are the candidate-facing collection points; a recruiter manually adding a candidate is out of scope).
- No withdrawal-of-consent flow (that overlaps the separate unsubscribe/erase features).

## Decisions (rulings baked in)

1. **Consent stored on the Candidate** (`consentedAt DateTime?`, `consentVersion Int?`) — org-scoped, standard "consent to data processing" model.
2. **Org config:** `Organization.applyConsentText String?` (the statement; null = feature off) + `applyConsentVersion Int @default(1)`. Editing the text **bumps** `applyConsentVersion` (so a later re-consent flow can detect stale consent).
3. **Enforcement is server-side and conditional:** on `apply()` + `register()`, IF `org.applyConsentText` is set → require `dto.consentAccepted === true` (else `BadRequestException`) and stamp `candidate.consentedAt = now`, `consentVersion = org.applyConsentVersion`. IF not set → no requirement, no stamp (behavior-preserving; existing orgs unaffected).
4. **Checkbox required on every apply/walk-in when configured** (no per-candidate "already consented, skip"). Public applies are one-shot; walk-in re-registers re-consent harmlessly. The version field exists for audit, not for apply-time gating in v1.
5. **The public form cannot bypass** — the server re-validates against `org.applyConsentText` (a client omitting the field is rejected when consent is required).
6. Additive columns on `candidates` + `organizations` (both already tenant-RLS) → **no `_rls` migration, no seed.**

## Architecture

### Schema (additive)

```prisma
// model Candidate
consentedAt    DateTime? @map("consented_at")
consentVersion Int?      @map("consent_version")

// model Organization
applyConsentText    String? @map("apply_consent_text") @db.NVarChar(Max)
applyConsentVersion Int     @default(1) @map("apply_consent_version")
```
Migration `20260907200000_consent_capture`: `ALTER TABLE [dbo].[candidates] ADD [consented_at] DATETIME2 NULL, [consent_version] INT NULL;` + `ALTER TABLE [dbo].[organizations] ADD [apply_consent_text] NVARCHAR(MAX) NULL, [apply_consent_version] INT NOT NULL CONSTRAINT [DF_organizations_apply_consent_version] DEFAULT 1;`. No `_rls` (both tables already RLS). No seed.

### API — enforcement

- `ApplyDto` gains `@IsOptional() @IsBoolean() consentAccepted?: boolean`. `RegisterWalkInDto` likewise.
- `public-applications.service.apply(applyToken, dto)`: after resolving the job/org (org is already loaded or cheaply loadable — the job has `organizationId`; fetch `applyConsentText` + `applyConsentVersion`), inside the existing `forTenant` tx: if `applyConsentText` is non-null/non-empty → require `dto.consentAccepted === true` (else BadRequest) → include `consentedAt: new Date(), consentVersion: applyConsentVersion` in the candidate create AND the existing-candidate update path (stamp on both new + returning candidates). If not configured → unchanged.
- `walk-in.service.register(orgSlug, dto)`: same rule against the resolved `org` (already loaded); stamp on candidate create + reuse.
- **Public GET exposure:** the public apply job payload (`resolveJob`/the public job DTO returned by `GET /public/jobs/:applyToken`) and the walk-in GET include `applyConsentText` (+ `applyConsentVersion`) so the forms render the exact statement. (No other org fields newly exposed.)

### Config API

Add to the organizations config surface (mirror an existing org-settings controller/service, e.g. business-hours or the branding settings):
- `GET /organizations/apply-consent` → `{ text: string | null, version: number }`.
- `PUT /organizations/apply-consent` body `{ text: string | null }` → persist; if the text CHANGED (differs from stored), increment `applyConsentVersion`; audit `organization.apply_consent_updated`. Gated `@RequirePermissions('org:manage_settings')` (per-method).

### Web

- **Apply form** (`apps/web/app/(candidate)/apply/[applyToken]/apply-form.tsx`): when the job/org payload includes `applyConsentText`, render it + a **required** consent checkbox; block submit until checked; send `consentAccepted: true`. When absent → no checkbox (unchanged).
- **Walk-in registration form**: same consent checkbox when the walk-in GET payload includes consent text.
- **Org-admin settings page** `/settings/apply-consent` (or fold into an existing settings page): a textarea for the consent statement + Save (gated org:manage_settings); note that saving bumps the version and re-prompts future applicants. Nav registration.

## Data flow

1. Org admin sets `applyConsentText` → `applyConsentVersion` starts at 1 (bumps to 2 on the next edit).
2. Candidate opens the public apply form → sees the consent statement + required checkbox.
3. Submit with `consentAccepted:true` → server verifies org has consent text + the flag is true → stamps `candidate.consentedAt=now`, `consentVersion=1`.
4. A submit WITHOUT the flag (tampered client) → 400.
5. An org with no consent text → form shows no checkbox; apply proceeds as today; no stamp.

## Error handling

- Consent required (org has text) but `consentAccepted` missing/false → `BadRequestException('Consent is required to apply')`.
- Consent not configured → field ignored, no stamp, unchanged behavior.
- Text unchanged on PUT → no version bump (only bump on actual change).
- Empty-string consent text treated as "not configured" (null-equivalent) to avoid an empty required checkbox.

## Testing

- **Schema:** columns applied; org `apply_consent_version` defaults to 1; no `_rls`.
- **apply():** org with consent text + consentAccepted:true → candidate stamped (consentedAt + version) on new AND returning candidate; missing/false → 400; org without consent text → no stamp, apply succeeds; server rejects a bypass (no field) when required.
- **walk-in register():** same matrix.
- **Public GET:** apply + walk-in payloads include applyConsentText/version; no other new org fields leaked.
- **Config API:** GET shape; PUT persists + version bump only on change + audit; gated org:manage_settings; empty-string → treated as null.
- **Web:** apply form renders text + required checkbox, blocks submit until checked, sends consentAccepted; absent → no checkbox; settings page saves.
- Full api + web jest green; tsc clean.

## Deploy notes

- One additive migration (2 candidate cols + 2 org cols), no `_rls`, no seed. Behavior-preserving: no org has consent text until they configure it → apply/walk-in unchanged. Ships with any api build; web needs any web build. No exam-day deploy.
