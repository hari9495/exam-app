# Vendor/Agency Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an org invite external staffing agencies to submit candidates against assigned open jobs via a passwordless magic-link portal, with a recruiter review gate before anything enters the pipeline.

**Architecture:** Three new RLS tenant tables (`Agency`, `AgencyJob`, `AgencySubmission`). Agency CRUD + job-allowlist on the authed side (`org:manage_settings`); a public unauth portal module (LOOKUP_ORG `forTenant`, throttled, anti-oracle 404) for the agency to read its jobs and post submissions; a submission review surface (`pipeline:manage`) whose accept reuses the existing `apply()` candidate-upsert/resurrect/placement rules. Web: settings page, submissions queue, and a public Next page at `/agency/[token]`.

**Tech Stack:** NestJS + Prisma (SQL Server) API, Next.js (apps/web), `@exam-platform/shared` (types only in web), Jest.

**Spec:** docs/superpowers/specs/2026-09-08-agency-portal-design.md

## Global Constraints

- All agency-table access via `TenantPrismaService.forTenant(context, tx => …)` — a raw `PrismaService` read of an RLS table returns 0 rows silently.
- `PermissionsGuard` is HANDLER-ONLY → `@RequirePermissions(...)` on every method, never the class.
- Each new tenant table needs a paired `_rls` migration (shape: copy `*_org_sender_addresses_rls` / `job_board_publications_rls`). Migrations numbered `20260908250000_agency_portal` (tables) + `20260908250001_agency_portal_rls` (RLS). These sort AFTER the parked-unmerged siblings (`210000/1`, `220000`, `230000/1`, `240000/1`) — keep the chain linear.
- **No seed.**
- **NEVER `npm install` / `npm ci` / `npm update`** in the worktree. Build shared dist with `npx tsc` if needed. Only Task 1 runs `prisma migrate` / `prisma generate`.
- Public **API-served** URLs use `API_ORIGIN + /api/v1`; the agency portal is a **Next page** → its URL uses `FRONTEND_URL`.
- Web cannot import `@exam-platform/shared` VALUES at runtime (types-only OK). No `ui-v2` barrel imports in new web files — deep-import components.
- Do not weaken any existing authorization.
- Every commit verifies `git branch --show-current` == `feat/agency-portal` in the same command.
- Blob I/O (résumé upload) happens OUTSIDE any tenant transaction (holding a tx open across a storage network call is the known mistake — ADO #6810).

---

### Task 1: Schema + migrations

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (add 3 models + 2 `Job` back-relations)
- Create: `apps/api/prisma/migrations/20260908250000_agency_portal/migration.sql`
- Create: `apps/api/prisma/migrations/20260908250001_agency_portal_rls/migration.sql`

**Interfaces:**
- Produces: Prisma models `Agency`, `AgencyJob`, `AgencySubmission` (field names as in the spec) consumed by T2/T3/T4; `Job.agencyJobs` and `Job.agencySubmissions` back-relations.

- [ ] **Step 1: Add the three models to `schema.prisma`**

Copy the three model blocks verbatim from the spec's "Schema" section (`Agency`, `AgencyJob`, `AgencySubmission`). Add to the `Job` model the two back-relations:

```prisma
  agencyJobs         AgencyJob[]
  agencySubmissions  AgencySubmission[]
```

Key points from the spec: `Agency.name @db.NVarChar(200)`, `Agency.portalToken String @unique`, `Agency.active Boolean @default(true)`, `@@unique([organizationId, name])`; `AgencyJob` composite `@@id([agencyId, jobId])`, both FKs `onDelete: Cascade, onUpdate: NoAction`; `AgencySubmission.status` free string default `"pending"`, `candidateId` is a plain column (NOT a relation), `@@index([organizationId, status])`.

- [ ] **Step 2: Generate the table migration SQL**

Run (from `apps/api`): `npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script` to sanity-check, then create `20260908250000_agency_portal/migration.sql` by hand mirroring the CREATE TABLE style of an existing table migration (e.g. `20260908240000_job_boards`). Match existing conventions: `UNIQUEIDENTIFIER`, `NVARCHAR`, `BIT` for booleans with `CONSTRAINT ... DEFAULT`, `DATETIME2` with `DEFAULT CURRENT_TIMESTAMP`, named FK constraints with `ON DELETE CASCADE`, the `@@unique`/`@@index` as `CREATE UNIQUE INDEX`/`CREATE INDEX`. Note: like `jobs`/`job_boards`, the `id` columns have no DB-side `DEFAULT newid()` (Prisma supplies the uuid).

- [ ] **Step 3: Write the RLS migration**

Create `20260908250001_agency_portal_rls/migration.sql` applying the org-scoped row-level security policy + FILTER predicate to all three tables (`agencies`, `agency_jobs`, `agency_submissions`), copying the exact pattern from `20260908240001_job_boards_rls` (which does two tables) — extend to three. Each table gets the same `organization_id`-based security policy the other tenant tables use.

- [ ] **Step 4: Apply migrations + regenerate client**

From `apps/api`: `npx prisma migrate deploy` then `npx prisma generate`. (Only this task runs these.) If `prisma generate` fails on a DLL file lock, a stray `node dist/main` from another session holds the query engine — do NOT kill a process you cannot confirm is yours; report it and retry.

- [ ] **Step 5: Verify tsc**

Run (from `apps/api`): `npx tsc --noEmit`. Expected: clean (the generated client now has the three delegates).

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260908250000_agency_portal apps/api/prisma/migrations/20260908250001_agency_portal_rls
git commit -m "feat(agency-portal): Agency, AgencyJob, AgencySubmission tables + RLS"
```

---

### Task 2: Agency CRUD + job allowlist (authed, org:manage_settings)

**Files:**
- Create: `apps/api/src/agencies/agencies.service.ts`
- Create: `apps/api/src/agencies/agencies.controller.ts`
- Create: `apps/api/src/agencies/agencies.module.ts`
- Create: `apps/api/src/agencies/dto/upsert-agency.dto.ts`
- Create: `apps/api/src/agencies/agencies.service.spec.ts`
- Create: `apps/api/src/agencies/agencies.controller.spec.ts`
- Modify: `apps/api/src/app.module.ts` (register `AgenciesModule`)

**Interfaces:**
- Consumes: `Agency`, `AgencyJob` models (T1); `TenantPrismaService`; the audit service; `PermissionsGuard` + `@RequirePermissions`.
- Produces: `AgenciesService.buildPortalUrl(portalToken)` (used by T5 shape only via the API response); REST routes `GET/POST/PATCH/DELETE /agencies`, `POST /agencies/:id/regenerate-token`.

Model this module on `apps/api/src/job-boards/` (CRUD via `forTenant`, per-method gating, audit, dup-name 409) and reuse the assigned-jobs replace-set logic from the pipeline job-boards assignment.

- [ ] **Step 1: Write the DTO**

`upsert-agency.dto.ts`:
```ts
import { IsOptional, IsString, IsBoolean, IsEmail, IsArray, IsUUID, MaxLength, MinLength } from 'class-validator';

export class UpsertAgencyDto {
  @IsString() @MinLength(1) @MaxLength(200)
  name!: string;

  @IsOptional() @IsEmail()
  contactEmail?: string;

  @IsOptional() @IsBoolean()
  active?: boolean;

  @IsOptional() @IsArray() @IsUUID('4', { each: true })
  jobIds?: string[];
}
// PATCH uses a PartialType-style variant: name optional. Create a
// UpdateAgencyDto extending PartialType(UpsertAgencyDto), or reuse with all-optional
// and guard blank-name on rename (dto.name !== undefined && dto.name.trim() === '' → BadRequest).
```

- [ ] **Step 2: Write the failing service test (create + dup name + allowlist validation)**

`agencies.service.spec.ts` — mirror `job-boards.service.spec.ts` setup (mock `TenantPrismaService.forTenant` to run the callback against a mocked `tx`). Assert:
- `create` mints a `portalToken` and calls `tx.agency.create` with `organizationId` + name; returns shape including `portalUrl` built from `FRONTEND_URL`.
- dup name (`tx.agency.create` throws Prisma `P2002`) → `ConflictException`.
- `jobIds` with an id not returned by `tx.job.findMany({ where: { id: { in }, organizationId } })` → `BadRequestException` (cross-org rejected).

Run: `npx jest --testPathPattern agencies.service` — Expected: FAIL (service not implemented).

- [ ] **Step 3: Implement `AgenciesService`**

Key methods (all via `this.tenantPrisma.forTenant(context, tx => …)`):
- `list(context)`: `tx.agency.findMany` + counts (`assignedJobCount` from `agencyJobs`, `pendingSubmissionCount` from `submissions where status:'pending'` — use `_count` select or a grouped count); map each to `{ id, name, contactEmail, active, portalUrl, assignedJobCount, pendingSubmissionCount }`.
- `create(context, dto)`: `portalToken = randomUUID()`; create the agency; if `dto.jobIds` set, validate + create `AgencyJob` rows in the same tx (see allowlist helper below); audit `agency.created`; return the mapped agency. Catch `P2002` → `ConflictException('An agency with this name already exists')`.
- `update(context, id, dto)`: fetch (404 if missing); if `dto.name !== undefined` guard non-blank; update scalar fields present; if `dto.jobIds !== undefined` reconcile the allowlist; audit `agency.updated`.
- `remove(context, id)`: 404 if missing; if `tx.agencySubmission.count({ where: { agencyId: id } }) > 0` → `ConflictException('Cannot delete an agency with submissions')`; else `tx.agency.delete` (cascades `AgencyJob`); audit `agency.deleted`.
- `regenerateToken(context, id)`: 404 if missing; `tx.agency.update({ data: { portalToken: randomUUID() } })`; audit `agency.token_regenerated`; return `{ portalUrl }`.
- Private `buildPortalUrl(token)`: `` `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/agency/${token}` `` (FRONTEND_URL — matches the offers/careers idiom; NOT API_ORIGIN).
- Private `setAllowlist(tx, context, agencyId, jobIds)`: `const jobs = await tx.job.findMany({ where: { id: { in: jobIds }, organizationId: context.organizationId }, select: { id: true } });` if `jobs.length !== new Set(jobIds).size` → `BadRequestException`; delete `AgencyJob` rows for this agency not in `jobIds`, create the missing ones (each with `organizationId`).

Run the test: PASS.

- [ ] **Step 4: Write + pass the controller test**

`agencies.controller.spec.ts` — mirror `job-boards.controller.spec.ts`: override `PermissionsGuard`, assert every route method carries `@RequirePermissions('org:manage_settings')` (Reflector.get on the handler) and delegates to the service.

- [ ] **Step 5: Implement controller + module + register**

Controller: `@Controller('agencies')`, each method `@RequirePermissions('org:manage_settings')`. Routes: `GET '/'`, `POST '/'`, `PATCH ':id'`, `DELETE ':id'`, `POST ':id/regenerate-token'`. Inject `AgenciesService`, pass the tenant context from the request (same accessor other authed controllers use, e.g. job-boards).
Module: standard NestJS, provide+export `AgenciesService`, imported by `app.module.ts`.

- [ ] **Step 6: tsc + full scoped suite**

Run: `npx tsc --noEmit` and `npx jest --testPathPattern agencies`. Expected: clean + green.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/agencies apps/api/src/app.module.ts
git commit -m "feat(agency-portal): agency CRUD + job allowlist (org:manage_settings)"
```

---

### Task 3: Public agency portal (unauth)

**Files:**
- Create: `apps/api/src/agency-portal/agency-portal.service.ts`
- Create: `apps/api/src/agency-portal/agency-portal.controller.ts`
- Create: `apps/api/src/agency-portal/agency-portal.module.ts`
- Create: `apps/api/src/agency-portal/dto/create-submission.dto.ts`
- Create: `apps/api/src/agency-portal/agency-portal.service.spec.ts`
- Modify: `apps/api/src/app.module.ts` (register `AgencyPortalModule`)

**Interfaces:**
- Consumes: `Agency`, `AgencyJob`, `AgencySubmission` (T1); `TenantPrismaService`; `LOOKUP_ORG` const; `validatePdfUpload` (from public-applications common); `BlobStorageService`; the public-applications throttler guard.
- Produces: `GET /public/agency-portal/:token`, `POST /public/agency-portal/:token/submissions`.

Model on `apps/api/src/public-applications/` (the careers/job-boards public read via `forTenant({ organizationId: LOOKUP_ORG, isSuperAdmin: true }, …)`, throttler guard, anti-oracle 404, `apply()` blob-outside-tx).

- [ ] **Step 1: DTO**

```ts
export class CreateSubmissionDto {
  @IsUUID() jobId!: string;
  @IsString() @MinLength(1) @MaxLength(200) name!: string;
  @IsEmail() email!: string;
  @IsOptional() @IsString() @MaxLength(50) phone?: string;
  @IsString() resumeBase64!: string;
}
```

- [ ] **Step 2: Failing service test — leak filter + anti-oracle + duplicate**

`agency-portal.service.spec.ts`. Seed (via mocked `forTenant` tx) an agency with token `T`, `active:true`, two assigned jobs (one open one closed), plus another agency's job. Assert:
- `getPortal('T')` returns only the OPEN assigned job and only this agency's submissions.
- unknown token → `NotFoundException`; `active:false` agency → `NotFoundException` (same error, anti-oracle).
- `submit('T', { jobId: <closed or unassigned> })` → `BadRequestException`. **Mutation guard:** removing the allowlist condition from the job lookup must make this test fail.
- `submit` with an email already in the org → created submission has `isDuplicate:true`; a brand-new email → `false`. No candidate/pipeline row is written on submit.

Run: `npx jest --testPathPattern agency-portal.service` — Expected: FAIL.

- [ ] **Step 3: Implement `AgencyPortalService`**

- `private resolveAgency(tx, token)`: `tx.agency.findFirst({ where: { portalToken: token, active: true } })`; null → `NotFoundException('Portal not available')`.
- `getPortal(token)`: in `forTenant({ organizationId: LOOKUP_ORG, isSuperAdmin: true }, tx => …)` resolve agency, then:
  - jobs: `tx.agencyJob.findMany({ where: { agencyId: agency.id, job: { status: 'open' } }, select: { job: { select: { id, title, location, department } } } })` → flatten.
  - submissions: `tx.agencySubmission.findMany({ where: { agencyId: agency.id }, orderBy: { createdAt: 'desc' }, select: { id, jobId, status, isDuplicate, candidateName, createdAt, job: { select: { title } } } })`.
  - return `{ agencyName: agency.name, jobs, submissions }`.
- `submit(token, dto)`:
  1. Resolve agency (a cheap read to get `organizationId` — use `forTenant` LOOKUP then read agency; or resolve inside the main tx after validating the blob). Validate PDF first: `const buf = Buffer.from(dto.resumeBase64, 'base64'); const v = validatePdfUpload(buf); if (!v.ok) throw new BadRequestException(...)`.
  2. Resolve the agency + assert `jobId` is in its allowlist AND open — in a `forTenant` LOOKUP tx: agency by token+active (404), then `tx.agencyJob.findFirst({ where: { agencyId, jobId, job: { status: 'open' } } })` → null → `BadRequestException`.
  3. Upload résumé OUTSIDE the tx: `resumePath = await this.blobStorage.upload('candidates/' + organizationId + '/' + randomUUID() + '.pdf', buf, 'application/pdf')`.
  4. In a `forTenant(context={ organizationId, isSuperAdmin:true })` tx: `isDuplicate = !!(await tx.candidate.findUnique({ where: { organizationId_email: { organizationId, email: dto.email } } }))`; then `tx.agencySubmission.create({ data: { organizationId, agencyId, jobId: dto.jobId, candidateName: dto.name, candidateEmail: dto.email, candidatePhone: dto.phone ?? null, resumePath, isDuplicate } })`.
  5. return `{ id, isDuplicate }`.

(Steps 2 and 4 can share one `forTenant` block once `organizationId` is known — the blob upload must sit between the validate and the DB write, i.e. outside the tx. Structure: LOOKUP-resolve agency+validate allowlist → upload → open the write tx.)

Run test: PASS.

- [ ] **Step 4: Controller + module + register**

Controller `@Controller('public/agency-portal')`, `@UseGuards(PublicApplicationsThrottlerGuard)` (the existing public throttler — reuse, do not invent), routes `@Get(':token')` and `@Post(':token/submissions')`. No `@RequirePermissions` (public). Register `AgencyPortalModule` in `app.module.ts` (import `BlobStorage` provider the same way public-applications does).

- [ ] **Step 5: tsc + scoped suite + confirm the public route is reachable**

Run: `npx tsc --noEmit` and `npx jest --testPathPattern agency-portal`. Expected: clean + green.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/agency-portal apps/api/src/app.module.ts
git commit -m "feat(agency-portal): public portal read + submission (LOOKUP_ORG, throttled, anti-oracle)"
```

---

### Task 4: Submission review — accept / reject (authed, pipeline:manage)

**Files:**
- Create: `apps/api/src/agency-submissions/agency-submissions.service.ts`
- Create: `apps/api/src/agency-submissions/agency-submissions.controller.ts`
- Create: `apps/api/src/agency-submissions/agency-submissions.module.ts`
- Create: `apps/api/src/agency-submissions/agency-submissions.service.spec.ts`
- Create: `apps/api/src/agency-submissions/agency-submissions.controller.spec.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `AgencySubmission`, `Agency`, `Candidate`, `CandidateProfile`, `PipelineEntry` (T1 + existing); `TenantPrismaService`; the candidate résumé-download URL mechanism; the `apply()` upsert/placement rules (read `public-applications.service.ts` `apply()` for the exact idiom).
- Produces: `GET /agency-submissions`, `POST /agency-submissions/:id/accept`, `POST /agency-submissions/:id/reject`.

- [ ] **Step 1: Failing service test — review gate, duplicate attach, idempotent entry, resurrection**

`agency-submissions.service.spec.ts`. Assert:
- `list(context, 'pending')` returns pending submissions with agency/job names + `resumeUrl`.
- `accept` on a non-pending submission → `ConflictException`.
- `accept` of a NEW-email submission: creates a candidate (`source:'agency'`, `portalToken` set), a `CandidateProfile` with the submission's `resumePath`, one pipeline entry on the job's first stage; sets submission `status:'accepted'`, `candidateId`, `reviewedByUserId`, `reviewedAt`.
- `accept` of a DUPLICATE-email submission: attaches to the EXISTING candidate (no second candidate.create), does NOT overwrite the existing candidate's name/phone, and does NOT create a second pipeline entry if one already exists on that job (idempotent).
- `accept` where the existing candidate is soft-deleted: clears `deletedAt`/`deletedByUserId` (resurrection).
- `reject` sets `status:'rejected'` + reviewer fields; creates no candidate/entry.

Run: `npx jest --testPathPattern agency-submissions.service` — Expected: FAIL.

- [ ] **Step 2: Implement `AgencySubmissionsService`**

- `list(context, status='pending')`: `forTenant` → `tx.agencySubmission.findMany({ where: { status }, orderBy: { createdAt: 'desc' }, include: { agency: { select: { name } }, job: { select: { title } } } })`; map to the response shape incl. `resumeUrl` (build via the same résumé-URL helper recruiters use for `CandidateProfile.resumePath` — locate it in the candidate/profile read path and reuse; do not invent a new signing route).
- `accept(context, id, userId)`: `forTenant` tx:
  - fetch submission (404); if `status !== 'pending'` → `ConflictException`.
  - upsert candidate by `organizationId_email` following `apply()` verbatim: `create` sets `{ organizationId, email, name, phone, portalToken: randomUUID(), source: 'agency' }`; `update` sets `{ ...(expandedName ? { name } : {}), deletedAt: null, deletedByUserId: null }` (NO phone/name overwrite beyond the placeholder-expansion exception). Import/reuse `expandedName` from the public-applications helper if exported; otherwise replicate its one-line rule.
  - upsert `CandidateProfile` with `resumePath` from the submission, resetting parse fields (same as apply's re-apply reset).
  - pipeline entry: check `tx.pipelineEntry.findFirst({ where: { candidateId, jobId } })`; if none, create on the job's pipeline first active-category stage first status (reuse the placement rule — factor from `apply()` or `PipelineService.addEntry`; if not exported, replicate the documented rule).
  - update submission: `{ status: 'accepted', candidateId: candidate.id, reviewedByUserId: userId, reviewedAt: new Date() }`.
  - audit `agency_submission.accepted`.
- `reject(context, id, userId)`: fetch (404); non-pending → `ConflictException`; update `{ status: 'rejected', reviewedByUserId: userId, reviewedAt: new Date() }`; audit `agency_submission.rejected`.

Run test: PASS.

- [ ] **Step 3: Controller test + implementation**

Controller `@Controller('agency-submissions')`, each method `@RequirePermissions('pipeline:manage')`. `GET '/'` (optional `?status=` query, validated to the 3 values, default `pending`), `POST ':id/accept'`, `POST ':id/reject'`. Pull `userId` from the authed request user. Controller spec asserts per-method `pipeline:manage` gating + delegation. Register module in `app.module.ts`.

- [ ] **Step 4: tsc + scoped suite + no-regression on apply()**

Run: `npx tsc --noEmit`, `npx jest --testPathPattern "agency-submissions"`, and `npx jest --testPathPattern "public-applications"` (confirm the apply() path still passes if you factored any shared helper). Expected: clean + green.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/agency-submissions apps/api/src/app.module.ts
git commit -m "feat(agency-portal): submission review accept/reject (pipeline:manage)"
```

---

### Task 5: Web — settings page, submissions queue, public portal page, nav

**Files:**
- Create: `apps/web/src/hooks/useAgencies.ts` (mirror `useJobBoards.ts`)
- Create: `apps/web/src/app/v2/settings/agencies/page.tsx`
- Create: `apps/web/src/app/v2/agency-submissions/page.tsx`
- Create: `apps/web/src/app/agency/[token]/page.tsx` (public, raw fetch)
- Modify: the settings/admin nav + recruiter nav (locate via `grep` for the job-boards / careers nav entries)
- Create: `apps/web/src/app/v2/settings/agencies/page.test.tsx` (mirror the job-boards settings test)

**Interfaces:**
- Consumes: the T2/T3/T4 endpoints. Authed pages use `apiFetch`; the public page uses raw `fetch(API_BASE ...)`. Types-only import from `@exam-platform/shared` if needed.

- [ ] **Step 1: `useAgencies` hook**

Mirror `apps/web/src/hooks/useJobBoards.ts` exactly (authed `apiFetch`): `list`, `create`, `update`, `remove`, `regenerateToken`. Expose loading/error + a refetch. Response types match the API shapes.

- [ ] **Step 2: Settings page + its test**

`/v2/settings/agencies`: table (name, assignedJobCount, pendingSubmissionCount, active badge, copy-portal-URL button); create/edit dialog (name, contactEmail, active toggle, assigned-jobs multi-select — reuse the `JobBoardsControl` selector shape / a jobs list from the existing jobs hook); regenerate-token button with a confirm ("the old link stops working"); delete button surfacing the 409 message. Deep-import UI components (no `ui-v2` barrel). Write `page.test.tsx` mirroring the job-boards settings test (mock `useAgencies`, assert render + copy button shows the `portalUrl` verbatim from the hook — do NOT rebuild the URL in the test).

Run: `npx jest --testPathPattern "settings/agencies"` — Expected: green.

- [ ] **Step 3: Submissions queue page**

`/v2/agency-submissions`: fetch `GET /agency-submissions?status=pending` via `apiFetch`; table (agency, job, candidate name/email, duplicate badge, résumé link, Accept / Reject buttons wired to the accept/reject endpoints, optimistic remove on success). A status filter (pending/accepted/rejected) is a nice-to-have; pending default is required.

- [ ] **Step 4: Public portal page**

`/agency/[token]/page.tsx` (Next public route, like `/apply/[applyToken]`): raw `fetch(`${API_BASE}/public/agency-portal/${token}`)`. Render agency name, the assigned-open-jobs list, a submit form (job `<select>`, name, email, phone, résumé `<input type=file accept=application/pdf>` → read as base64), POST to `/public/agency-portal/${token}/submissions`, then show the returned duplicate note + refresh the submission-history list. A 404 → a generic "This portal is not available" state. No shared-value import, no authed helpers.

- [ ] **Step 5: Nav**

Add the settings link (Agencies) next to the job-boards/careers settings entries, and the submissions-queue link in the recruiter nav. Grep the nav files for `job-boards` to find both.

- [ ] **Step 6: tsc + web suite**

Run: `npx tsc --noEmit` (web) and `npx jest --testPathPattern "agencies|agency"` in apps/web. Expected: clean + green (allow only known pre-existing failures like the ImpersonationBanner one).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src
git commit -m "feat(agency-portal): web settings, submissions queue, public portal page, nav"
```

---

## Self-review notes

- **Spec coverage:** T1 schema+RLS+numbering; T2 agency CRUD + allowlist + regenerate + FRONTEND_URL + delete-409; T3 public read/submit + LOOKUP_ORG + anti-oracle + duplicate + blob-outside-tx + throttle; T4 review gate + accept-reuses-apply + idempotent entry + resurrection + attribution; T5 all three web surfaces + nav. All spec sections mapped.
- **Load-bearing / correctness-critical (extra review scrutiny):** T3 (leak/allowlist filter + anti-oracle — mutation-test it) and T4 (candidate upsert/resurrect/idempotent entry — must match `apply()`; adversarial: no tampering with existing candidates, no privilege on accept).
- **Migration numbering:** 250000/250001 > parked 240000/1 — linear.
- **URL rule:** portal is a Next page → FRONTEND_URL (T2 buildPortalUrl, T5 pages). Do NOT use API_ORIGIN here (that rule is only for API-served endpoints).
