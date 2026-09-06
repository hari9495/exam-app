# Candidate Portal Self-Service — Design Spec

**Date:** 2026-09-05
**Status:** Approved design, ready for implementation planning.
**Source:** Zoho adopt inventory #17 (Candidate Portal self-service). See `docs/ats/zoho-adopt-inventory.md` — the magic-link portal exists but is read-only; this adds candidate self-service writes.

## Goal

Let a candidate, authenticated only by their existing portal magic-link token, **update their own name/phone** and **replace their résumé** from the portal page — turning the read-only status portal into a self-service one.

## Why

The portal (`GET /public/portal/:portalToken`) already aggregates a candidate's applications/interviews/offers read-only. Candidates can't fix a wrong phone number or upload an updated résumé without recruiter help. This is the missing slice that "finishes" the portal feature. No schema change, no new model — it reuses the résumé-upload pipeline the apply flow already has.

## Decisions (locked during brainstorming)

1. **Documents = résumé replace only.** Update the single `CandidateProfile.resumePath`; no multi-document store (deferred).
2. **Editable profile fields = `name`, `phone` only.** Email is **read-only** — it is the org-unique identity key (`@@unique([organizationId, email])`) and the comms-thread key; allowing change risks unique collisions and identity spoofing.
3. **Auth = the portal token is the bearer.** Same trust model as the existing offer/interview `respondPublic` public-token writes. No login, no session.
4. **No schema change / no migration.**

## Existing code this builds on

- `apps/api/src/public-applications/public-applications.service.ts`
  - `apply()` (lines ~124-222): the résumé pipeline to mirror — `Buffer.from(dto.resumeBase64,'base64')` → `validatePdfUpload(buf)` (PDF-only, 5 MB; returns `{ok}`/`{reason:'too_large'|...}`) → `this.blobStorage.upload('candidates/<orgId>/<uuid>.pdf', buf, 'application/pdf')` **outside** the tenant tx (blob I/O inside a tx is the known mistake — ADO #6810) → `candidateProfile.upsert` writing `resumePath` and **resetting** `parseStatus:'pending'` + nulling `parsedSummary/parsedSkills/parsedTitle/parsedYearsExperience/parsedAt` → `this.jobsService.enqueue(context, 'resume_parse', JSON.stringify({ candidateId }), <userId>)`.
  - `getPortal(portalToken)` (line ~227): resolves the candidate by token under a cross-tenant lookup context `{ organizationId: this.LOOKUP_ORG, isSuperAdmin: true }`, then scopes to the candidate's `organizationId`. Read-only aggregation shape the web page already renders.
- `apps/api/src/public-applications/public-applications.controller.ts` — public controller; `@Get('portal/:portalToken')` today. Add the two write routes here.
- `apps/api/src/public-applications/public-applications.throttler.guard.ts` — the existing rate-limit guard for public endpoints; apply it to the new writes.
- `validatePdfUpload` (used by apply; reuse verbatim).
- Prisma: `Candidate` (`name`, `phone`, `email`, `portalToken`, `erasedAt`, `organizationId`); `CandidateProfile` (`resumePath`, parse fields). No changes.
- Web: `apps/web/app/(candidate)/portal/[portalToken]/page.tsx` (read-only portal today) + its data hook.
- Precedent for public-token writes: `apps/api/src/offers/offers.service.ts` `respondPublic` + `public-offers.controller.ts`.

## Architecture

### API — two public, token-scoped, rate-limited endpoints

Both resolve the candidate by `portalToken` (cross-tenant lookup like `getPortal`), then use the resolved `candidate.organizationId` to build the tenant context for the write. Return **404** if the token matches no candidate **or** the candidate's `erasedAt` is set — an erased candidate is treated as not-found (same response as an unknown token, so the endpoint never reveals that an erased candidate existed). This must match how `getPortal` already handles an erased/unknown token; mirror it. Both routes carry the `public-applications` throttler guard.

1. **`PATCH /public/portal/:portalToken/profile`**
   - Body DTO `UpdatePortalProfileDto { name?: string; phone?: string }` — class-validator: both optional strings, `@MaxLength` (name ≤200, phone ≤50), `@IsOptional`. At least one field required (reject an empty body).
   - Effect: `forTenant(context, tx => tx.candidate.update({ where:{id}, data:{ ...(name!==undefined?{name}:{}) , ...(phone!==undefined?{phone}:{}) } }))`. Never touches email. `name` must be non-empty if provided (trim; reject blank — `name` is non-null in schema).
   - Returns the refreshed portal payload (same shape as `getPortal`) so the UI re-renders in one round trip.
   - **Self-edit is intentional here** (unlike `apply()`'s anti-tamper name/phone skip): the token is the candidate's own secret, so writing name/phone from the request body is authorized. Note this in code so the divergence from `apply()` is not "fixed" later.

2. **`POST /public/portal/:portalToken/resume`**
   - Body DTO `UploadPortalResumeDto { resumeBase64: string }` (`@IsString`, non-empty).
   - Effect mirrors `apply()`'s résumé path exactly: decode → `validatePdfUpload` (throw `BadRequestException('Résumé exceeds 5 MB' | 'Résumé must be a PDF')`) → `blobStorage.upload(...)` **outside the tx** → `forTenant` `candidateProfile.upsert` (create if somehow absent; on update set `resumePath` + reset all parse fields to pending/null) → enqueue `resume_parse` for the candidate.
   - `enqueue` needs a user id (apply passes `job.createdById`); here there is no acting user — pass the candidate's org system/`null` per the enqueue signature (implementer: match how other system-initiated enqueues supply the actor; if a non-null id is required, use the org's first admin or a documented `SYSTEM` id — decide and note it).
   - Returns the refreshed portal payload.

### Web UI — extend the portal page

In `apps/web/app/(candidate)/portal/[portalToken]/page.tsx`:
- **"Your details" card:** inputs for name + phone (prefilled from the portal payload), email shown **disabled/read-only**, a Save button → `PATCH …/profile`. Reuse the page's existing candidate/portal styling.
- **"Résumé" card:** show current résumé state (has one / parse status), an upload/replace control (file → base64) → `POST …/resume`, with the same PDF/5 MB validation messaging as the apply page. On success, reflect the refreshed payload.
- Two small hooks (`useUpdatePortalProfile`, `useUploadPortalResume`) mirroring the existing portal data hook + `apiFetch`; invalidate/refresh the portal query on success.
- Optimistic-free: just refetch/replace with the returned payload.

## Testing

- **API unit:** profile update writes only name/phone to the token's own candidate and never email; empty body rejected; blank name rejected; résumé upload validates PDF + 5 MB (both failure messages), resets parse fields, enqueues `resume_parse`, uploads outside the tx; unknown token → 404; `erasedAt` candidate → rejected. Throttler guard present on both routes.
- **Web:** the details form submits name/phone (not email); the résumé control rejects a non-PDF / oversized file and calls the upload on a valid one.

## Out of scope (v1)

- Multi-document store (résumé-replace only chosen).
- Email change; new profile fields (location, LinkedIn — would need columns).
- Portal login/password (magic-link only, unchanged).
- Résumé download from the portal (view/replace only).

## Deploy notes

- **No migration, no seed** — additive endpoints + UI only. Nothing for the deferred-deploy migration chain; ships whenever the web/api build ships.
- Requires blob storage configured (already used by apply) and the résumé-parse worker running (already the case). With the AI key absent in prod, parsing degrades exactly as apply already does — no new dependency.
