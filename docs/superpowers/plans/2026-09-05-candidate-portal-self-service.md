# Candidate Portal Self-Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a candidate, authenticated by their portal magic-link token, update their own name/phone and replace their résumé from the portal page.

**Architecture:** Two public, token-scoped, rate-limited write endpoints added to the existing `public-applications` controller/service, reusing the apply flow's résumé pipeline. No schema change. The web `(candidate)` portal page gains an editable details card and a résumé card.

**Tech Stack:** NestJS + Prisma + SQL Server (apps/api); Next.js `(candidate)` app with inline `fetch` + Tailwind `candidate-*` theme (apps/web).

**Spec:** `docs/superpowers/specs/2026-09-05-candidate-portal-self-service-design.md`

## Global Constraints

- **Auth = the portal token is the bearer.** Resolve the candidate by `portalToken` via the cross-tenant lookup context `{ organizationId: this.LOOKUP_ORG, isSuperAdmin: true }`, then scope every write to the resolved `candidate.organizationId` with `tenantPrisma.forTenant`. An unknown token **or** a candidate with `erasedAt` set → `NotFoundException` (identical response; never reveal an erased candidate existed) — mirror the existing `getPortal` behavior.
- **Email is never mutated.** Only `Candidate.name` / `Candidate.phone` are writable.
- **Résumé pipeline = reuse apply()'s exactly:** `validatePdfUpload` (PDF-only, 5 MB) → `blobStorage.upload('candidates/<orgId>/<uuid>.pdf', buf, 'application/pdf')` **OUTSIDE** the tenant tx → `candidateProfile.upsert` writing `resumePath` and resetting `parseStatus:'pending'` + nulling `parsedSummary/parsedSkills/parsedTitle/parsedYearsExperience/parsedAt` → `jobsService.enqueue`.
- **Rate limiting is automatic:** the controller class already has `@UseGuards(PublicApplicationsThrottlerGuard)` + `@Throttle(STRICT_WALK_IN_THROTTLE)`, so new routes inherit it. Do not add per-route guards.
- **No schema change, no migration, no seed.**
- **NEVER run `npm install`/`ci`/`update`** (worktree junction hazard); work in the main checkout. This machine sometimes reports spurious mass jest failures under load — re-run a single spec isolated before concluding.
- **Web `(candidate)` app conventions:** inline `fetch` against `API_BASE` (NOT React Query, NOT `apiFetch` with a token), `candidate-*` Tailwind classes, `TerminalCard` for status states — match `apps/web/app/(candidate)/portal/[portalToken]/page.tsx`.

---

## File Structure

- Modify `apps/api/src/public-applications/public-applications.service.ts` — extract `resolvePortalCandidate`; extend `getPortal` return; add `updatePortalProfile` + `uploadPortalResume`.
- Create `apps/api/src/public-applications/dto/update-portal-profile.dto.ts` and `dto/upload-portal-resume.dto.ts`.
- Modify `apps/api/src/public-applications/public-applications.controller.ts` — add `PATCH portal/:portalToken/profile` and `POST portal/:portalToken/resume`.
- Modify `apps/web/lib/types.ts` — extend `PortalView` (add `candidatePhone`, `resume`).
- Modify `apps/web/app/(candidate)/portal/[portalToken]/page.tsx` — details + résumé cards.
- Tests: `public-applications.service.spec.ts`, `public-applications.controller.spec.ts`, `apps/web/app/(candidate)/portal/[portalToken]/page.test.tsx`.

---

### Task 1: `resolvePortalCandidate` helper + extend `getPortal` (phone + résumé state) + `PortalView` type

**Files:**
- Modify: `apps/api/src/public-applications/public-applications.service.ts`
- Modify: `apps/web/lib/types.ts`
- Test: `apps/api/src/public-applications/public-applications.service.spec.ts`

**Interfaces:**
- Produces: `private resolvePortalCandidate(portalToken: string): Promise<{ id: string; organizationId: string }>` — LOOKUP_ORG lookup; throws `NotFoundException('Portal not found')` if missing or `erasedAt` set.
- `getPortal` return gains `candidatePhone: string | null` and `resume: { hasResume: boolean; parseStatus: string | null }`.

- [ ] **Step 1: Failing tests.** In the service spec: (a) `getPortal` returns `candidatePhone` and `resume: { hasResume, parseStatus }` from the candidate + its profile; (b) an unknown token and an `erasedAt` candidate both throw `NotFoundException`.

- [ ] **Step 2: Run, verify RED.**

- [ ] **Step 3: Implement.** Extract the candidate resolution `getPortal` does today into:
```ts
private async resolvePortalCandidate(portalToken: string): Promise<{ id: string; organizationId: string }> {
  const candidate = await this.tenantPrisma.forTenant(
    { organizationId: this.LOOKUP_ORG, isSuperAdmin: true },
    (tx) => tx.candidate.findUnique({ where: { portalToken }, select: { id: true, organizationId: true, erasedAt: true } }),
  );
  if (!candidate || candidate.erasedAt) throw new NotFoundException('Portal not found');
  return { id: candidate.id, organizationId: candidate.organizationId };
}
```
Refactor `getPortal` to call it, and extend its candidate select to include `phone`, plus load the profile’s résumé state. Add to the returned object:
```ts
candidatePhone: candidate.phone ?? null,
resume: { hasResume: Boolean(profile?.resumePath), parseStatus: profile?.parseStatus ?? null },
```
(Load `profile` via `tx.candidateProfile.findUnique({ where: { candidateId: candidate.id }, select: { resumePath: true, parseStatus: true } })` inside the org-scoped `forTenant` block `getPortal` already opens for entries — keep `getPortal` a read.)

- [ ] **Step 4: Extend `PortalView` in `apps/web/lib/types.ts`** — add `candidatePhone: string | null;` and `resume: { hasResume: boolean; parseStatus: string | null };`.

- [ ] **Step 5: Run tests (GREEN).** Run: `cd apps/api && npx jest src/public-applications/public-applications.service.spec.ts`

- [ ] **Step 6: Commit** `feat(portal): resolvePortalCandidate helper + phone/résumé in getPortal`

---

### Task 2: `PATCH /public/portal/:portalToken/profile`

**Files:**
- Create: `apps/api/src/public-applications/dto/update-portal-profile.dto.ts`
- Modify: `apps/api/src/public-applications/public-applications.service.ts`
- Modify: `apps/api/src/public-applications/public-applications.controller.ts`
- Test: `public-applications.service.spec.ts`, `public-applications.controller.spec.ts`

**Interfaces:**
- Consumes: Task 1 `resolvePortalCandidate`, `getPortal`.
- Produces: `updatePortalProfile(portalToken: string, dto: UpdatePortalProfileDto)` → returns the `getPortal` payload.

- [ ] **Step 1: DTO** `update-portal-profile.dto.ts`:
```ts
import { IsOptional, IsString, MaxLength } from 'class-validator';
export class UpdatePortalProfileDto {
  @IsOptional() @IsString() @MaxLength(200) name?: string;
  @IsOptional() @IsString() @MaxLength(50) phone?: string;
}
```

- [ ] **Step 2: Failing tests.** Service: `updatePortalProfile` updates only name/phone on the token's candidate (never email); a blank/whitespace `name` (when provided) is rejected with `BadRequestException`; an empty body (neither field) is rejected; unknown/erased token → `NotFoundException` (via the helper). Controller: `PATCH portal/:portalToken/profile` delegates to `service.updatePortalProfile(token, dto)`.

- [ ] **Step 3: Run, verify RED.**

- [ ] **Step 4: Implement service:**
```ts
async updatePortalProfile(portalToken: string, dto: UpdatePortalProfileDto) {
  const hasName = dto.name !== undefined;
  const hasPhone = dto.phone !== undefined;
  if (!hasName && !hasPhone) throw new BadRequestException('Nothing to update');
  if (hasName && !dto.name!.trim()) throw new BadRequestException('Name cannot be empty');
  const candidate = await this.resolvePortalCandidate(portalToken);
  await this.tenantPrisma.forTenant({ organizationId: candidate.organizationId, isSuperAdmin: true }, (tx) =>
    tx.candidate.update({
      where: { id: candidate.id },
      data: { ...(hasName ? { name: dto.name!.trim() } : {}), ...(hasPhone ? { phone: dto.phone || null } : {}) },
    }),
  );
  return this.getPortal(portalToken);
}
```
Add a code comment: self-edit of name/phone is intentional here (the token is the candidate's own secret) — do NOT copy `apply()`'s anti-tamper skip.

- [ ] **Step 5: Controller route** (after the existing `@Get('portal/:portalToken')`):
```ts
@Patch('portal/:portalToken/profile')
updatePortalProfile(@Param('portalToken') portalToken: string, @Body() dto: UpdatePortalProfileDto) {
  return this.service.updatePortalProfile(portalToken, dto);
}
```
Add `Patch` to the `@nestjs/common` import and import the DTO.

- [ ] **Step 6: Run tests (GREEN).**
- [ ] **Step 7: Commit** `feat(portal): PATCH profile self-service endpoint`

---

### Task 3: `POST /public/portal/:portalToken/resume`

**Files:**
- Create: `apps/api/src/public-applications/dto/upload-portal-resume.dto.ts`
- Modify: `apps/api/src/public-applications/public-applications.service.ts`
- Modify: `apps/api/src/public-applications/public-applications.controller.ts`
- Test: `public-applications.service.spec.ts`, `public-applications.controller.spec.ts`

**Interfaces:**
- Consumes: Task 1 `resolvePortalCandidate`, `getPortal`; `validatePdfUpload`, `blobStorage`, `jobsService.enqueue`.
- Produces: `uploadPortalResume(portalToken: string, dto: UploadPortalResumeDto)` → returns the `getPortal` payload.

- [ ] **Step 1: DTO** `upload-portal-resume.dto.ts`:
```ts
import { IsString, IsNotEmpty } from 'class-validator';
export class UploadPortalResumeDto {
  @IsString() @IsNotEmpty() resumeBase64!: string;
}
```

- [ ] **Step 2: Failing tests.** Service: a non-PDF buffer → `BadRequestException('Résumé must be a PDF')`; an over-5 MB buffer → `BadRequestException('Résumé exceeds 5 MB')`; a valid PDF uploads via `blobStorage.upload` and upserts the profile with the new `resumePath` and reset parse fields, then enqueues `resume_parse` for the candidate; unknown/erased token → `NotFoundException`. Assert `blobStorage.upload` is called (proving upload happens) and that it is not called from within a `forTenant` callback (upload before the tx — assert call order: upload resolves before `candidateProfile.upsert`). Controller: `POST portal/:portalToken/resume` delegates to `service.uploadPortalResume`.

- [ ] **Step 3: Run, verify RED.**

- [ ] **Step 4: Implement service** (mirror `apply()` lines ~127-178):
```ts
async uploadPortalResume(portalToken: string, dto: UploadPortalResumeDto) {
  const candidate = await this.resolvePortalCandidate(portalToken);
  const buf = Buffer.from(dto.resumeBase64, 'base64');
  const validated = validatePdfUpload(buf);
  if (!validated.ok) {
    throw new BadRequestException(validated.reason === 'too_large' ? 'Résumé exceeds 5 MB' : 'Résumé must be a PDF');
  }
  // Upload OUTSIDE the tenant tx (blob I/O in a tx holds it open on a network call).
  const resumePath = await this.blobStorage.upload(`candidates/${candidate.organizationId}/${randomUUID()}.pdf`, buf, 'application/pdf');
  const context = { organizationId: candidate.organizationId, isSuperAdmin: true };
  // Attribute the re-parse AiJob to the recruiter who owns the candidate's most-recent
  // application (AiJob.createdBy is a required uuid; the portal has no acting user).
  const attributionUserId = await this.tenantPrisma.forTenant(context, async (tx) => {
    await tx.candidateProfile.upsert({
      where: { candidateId: candidate.id },
      create: { organizationId: candidate.organizationId, candidateId: candidate.id, resumePath, parseStatus: 'pending' },
      update: { resumePath, parseStatus: 'pending', parsedSummary: null, parsedSkills: null, parsedTitle: null, parsedYearsExperience: null, parsedAt: null },
    });
    const recent = await tx.pipelineEntry.findFirst({
      where: { candidateId: candidate.id },
      orderBy: { createdAt: 'desc' },
      select: { job: { select: { createdById: true } } },
    });
    return recent?.job.createdById ?? null;
  });
  // A portal token only exists after an application, so attributionUserId is normally set;
  // if somehow absent, save the résumé but skip parse rather than fail the upload.
  if (attributionUserId) {
    await this.jobsService.enqueue(context, 'resume_parse', JSON.stringify({ candidateId: candidate.id }), attributionUserId);
  }
  return this.getPortal(portalToken);
}
```

- [ ] **Step 5: Controller route:**
```ts
@Post('portal/:portalToken/resume')
uploadPortalResume(@Param('portalToken') portalToken: string, @Body() dto: UploadPortalResumeDto) {
  return this.service.uploadPortalResume(portalToken, dto);
}
```
Import the DTO (`Post`, `Body`, `Param` already imported).

- [ ] **Step 6: Run tests (GREEN).** Also run the existing `public-applications` suite to confirm `apply()` is untouched.
- [ ] **Step 7: Commit** `feat(portal): POST résumé-replace self-service endpoint`

---

### Task 4: Web portal UI — details + résumé cards

**Files:**
- Modify: `apps/web/app/(candidate)/portal/[portalToken]/page.tsx`
- Test: `apps/web/app/(candidate)/portal/[portalToken]/page.test.tsx`

**Interfaces:**
- Consumes: Task 1 `PortalView` (`candidatePhone`, `resume`), Task 2/3 endpoints.

- [ ] **Step 1: Failing test.** Extend `page.test.tsx` (mock `fetch`): the details form renders name + phone prefilled and email disabled; submitting `PATCH`es `/public/portal/<token>/profile` with `{ name, phone }` (never email) and updates the view from the response; the résumé card shows current state and a valid PDF selection `POST`s `/public/portal/<token>/resume`. Keep the existing read tests passing.

- [ ] **Step 2: Run, verify RED.**

- [ ] **Step 3: Implement.** In `PortalPage`, below the header (before/after the applications list — a "Your details" card then a "Résumé" card, matching the page's `candidate-*` card styling from `ApplicationCard`):
  - **Your details:** controlled inputs seeded from `portal.candidateName` / `portal.candidatePhone`; email shown in a disabled input (`portal.candidateEmail`). A Save button → `fetch(`${API_BASE}/public/portal/${portalToken}/profile`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ name, phone }) })`; on ok, `setPortal(await res.json())`; show a saved/failed inline message.
  - **Résumé:** show `portal.resume.hasResume ? 'Résumé on file' + parseStatus : 'No résumé uploaded'`. An `<input type="file" accept="application/pdf">`; on select, read the file to base64 (FileReader → strip the `data:...;base64,` prefix), guard client-side for PDF + ≤5 MB with the same messages as apply, then `POST` `/resume` with `{ resumeBase64 }`; on ok, `setPortal(await res.json())`.
  - Keep everything client-side inline `fetch` (no React Query); reuse `TerminalCard` only for the page-level loading/error states already present.

- [ ] **Step 4: Run tests (GREEN)** and `npx tsc -p apps/web/tsconfig.json --noEmit 2>&1 | grep -v "\.next/types"` (must be clean of this task's files; ignore pre-existing `.next/types/validator.ts` errors).
- [ ] **Step 5: Commit** `feat(portal): candidate details + résumé self-service UI`

---

## Self-review notes

- **Spec coverage:** phone/résumé in payload (T1), profile write (T2), résumé write (T3), UI (T4). Auth/404/erased handled once in `resolvePortalCandidate` (T1) and reused. No email mutation (T2). Résumé pipeline mirrors apply (T3).
- **Type consistency:** `getPortal` return shape (`candidatePhone`, `resume:{hasResume,parseStatus}`) matches the `PortalView` type (T1) and is what both write endpoints return (T2/T3) and the UI consumes (T4).
- **No schema change / migration / seed.** Rate limiting inherited from the controller class. Ships with any web/api build.
