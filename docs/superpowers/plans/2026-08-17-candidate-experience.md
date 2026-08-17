# Candidate Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let candidates apply to a job via a public form, upload a PDF résumé that is auto-parsed into a profile the recruiter sees, and check their status through a tokenized page — no candidate accounts, no external parsing service.

**Architecture:** New guard-exempt `public-applications` NestJS module (modeled on `apps/api/src/walk-in/*`) whose endpoints resolve the org from the job's `applyToken` and write inside that org's `forTenant({isSuperAdmin:true})` context. Résumé parsing is a `resume_parse` `AiJob` processor (modeled on `apps/api/src/jobs/processors/ai-question-generation.processor.ts`) that runs `pdf-parse` → the per-org AI provider. Recruiter-facing profile/résumé reads extend the existing pipeline (feature #1) `CandidateDrawer` and the candidates module. Frontend public pages live in the candidate-facing tier (like `/start`).

**Tech Stack:** NestJS 11, Prisma + Azure SQL, BullMQ (`AiJob`), Blob storage (`BlobStorageService`), per-org AI (`packages/shared/src/ai/*`), Next.js 16 (see `apps/web/AGENTS.md`), React Query, jest + Testing Library. One new dependency: `pdf-parse`.

## Global Constraints

- **No candidate accounts / no passwords.** Status access is the `applicationToken` only, read-only.
- **No new external service.** Parsing reuses the per-org AI provider; **no AI key → `parseStatus='unavailable'`** (résumé still stored + downloadable), never an error.
- **Exactly one new dependency:** `pdf-parse` (pure JS). No others.
- **Public endpoints resolve org from the job token** and run every write inside that org's `forTenant({ organizationId: job.organizationId, isSuperAdmin: true })` — the walk-in public-write pattern. No authenticated user; no cross-org write possible.
- **Generic 404** from public endpoints for unknown / closed / disabled jobs and unknown status tokens (no enumeration oracle).
- **Public upload guards:** PDF magic-byte (`%PDF`) + size ≤ 5 MB, rejected before any write. Extracted text truncated (40000 chars) before the AI call.
- **Résumé/profile is candidate-level, latest résumé wins.**
- **Blob upload happens OUTSIDE the `forTenant` transaction** (ADO #6810 — blob I/O inside a tenant tx is the mistake being avoided); write `resumePath` in the tx after the upload resolves.
- **New tables org-scoped with RLS**: a schema migration + a separate RLS migration (SQL Server cannot `ALTER SECURITY POLICY` against a table created in the same batch — the split pattern used by candidates/pipeline).
- **GDPR:** the résumé blob is added to the candidate-erase blob-cleanup list, deleted **before** the DB rows (same ordering as webcam/face evidence).
- Permissions reuse feature #1's keys: `pipeline:manage` (the toggle) / `results:view` (profile + résumé reads). No new permission.
- **Windows/Next.js:** do not remove the auto-generated block in `apps/web/AGENTS.md`; commit it if it appears.

---

## File Structure

**Backend (`apps/api/src/`):**
- `public-applications/` — new module: `public-applications.controller.ts` (guard-exempt), `public-applications.service.ts`, `public-applications.module.ts`, `public-applications.throttler.guard.ts`, `dto/apply.dto.ts`, `application-status.ts` (pure mapper), `pdf-validation.ts` (magic-byte + size), `*.spec.ts`.
- `jobs/processors/resume-parse.processor.ts` (+ spec) — new `AiJob` processor; registered in `jobs/jobs.module.ts` (`AI_JOB_PROCESSORS` array).
- `pipeline/pipeline.service.ts` + `dto/update-job.dto.ts` — extend `updateJob` for `publicApplyEnabled` (mint `applyToken`), `getJob` returns the two fields.
- `candidates/candidates.controller.ts` + `candidates.service.ts` — `GET /candidates/:id/profile`, `GET /candidates/:id/resume`; add `resumePath` to the erase blob-cleanup collection.
- `prisma/schema.prisma` + two migrations.
- `app.module.ts` — register `PublicApplicationsModule`.

**Frontend (`apps/web/`):**
- `app/apply/[applyToken]/page.tsx` — public application form (candidate tier).
- `app/application/[statusToken]/page.tsx` — public status page.
- `components/pipeline/CandidateDrawer.tsx` — add a Profile section.
- `app/(recruiter)/jobs/[jobId]/page.tsx` — public-apply toggle + copy-link.
- `lib/hooks/usePipeline.ts` (or a new `useCandidateProfile.ts`) — `useCandidateProfile(candidateId)`.
- `lib/types.ts` — `CandidateProfile`, status-bucket types.
- `*.test.tsx`.

---

## Task 1: Schema, migrations, dependency

**Files:**
- Modify: `apps/api/prisma/schema.prisma`, `apps/api/package.json`
- Create: `apps/api/prisma/migrations/20260819090000_candidate_experience/migration.sql`, `apps/api/prisma/migrations/20260819090001_candidate_experience_rls/migration.sql`

**Interfaces:**
- Produces: `Job.publicApplyEnabled`, `Job.applyToken`; `PipelineEntry.applicationToken`; model `CandidateProfile`.

- [ ] **Step 1: Add the `pdf-parse` dependency**

```bash
cd "D:/exam app/apps/api" && npm install pdf-parse@1.1.1 && npm install -D @types/pdf-parse
```
Confirm `apps/api/package.json` lists `pdf-parse` under dependencies and `@types/pdf-parse` under devDependencies. (monaco stays pinned — this only touches apps/api.)

- [ ] **Step 2: Edit `schema.prisma`**

On `model Job` add:
```prisma
  publicApplyEnabled Boolean @default(false) @map("public_apply_enabled")
  applyToken         String? @unique @map("apply_token")
```
On `model PipelineEntry` add:
```prisma
  applicationToken String? @unique @map("application_token")
```
On `model Candidate` add the back-relation:
```prisma
  profile CandidateProfile?
```
Add the new model:
```prisma
model CandidateProfile {
  id                    String    @id @default(uuid()) @db.UniqueIdentifier
  organizationId        String    @map("organization_id") @db.UniqueIdentifier
  candidateId           String    @unique @map("candidate_id") @db.UniqueIdentifier
  resumePath            String?   @map("resume_path")
  parseStatus           String    @default("pending") @map("parse_status")
  parsedSummary         String?   @map("parsed_summary") @db.NVarChar(Max)
  parsedSkills          String?   @map("parsed_skills") @db.NVarChar(Max)
  parsedTitle           String?   @map("parsed_title")
  parsedYearsExperience Int?      @map("parsed_years_experience")
  parsedAt              DateTime? @map("parsed_at")
  createdAt             DateTime  @default(now()) @map("created_at")
  updatedAt             DateTime  @updatedAt @map("updated_at")
  candidate             Candidate @relation(fields: [candidateId], references: [id], onDelete: Cascade, onUpdate: NoAction)

  @@map("candidate_profiles")
}
```

- [ ] **Step 3: Hand-write `20260819090000_candidate_experience/migration.sql`**

Model it on `apps/api/prisma/migrations/20260818090000_ats_pipeline/migration.sql` (read it). It must:
- `CREATE TABLE [dbo].[candidate_profiles]` with the columns above (`resume_path`/`parsed_*` nullable, `parse_status NVARCHAR(1000) NOT NULL DEFAULT 'pending'`, `parsed_summary`/`parsed_skills` `NVARCHAR(MAX)`, `parsed_years_experience INT`), PK on `id`, a UNIQUE index on `candidate_id`, and FK `candidate_id → candidates(id) ON DELETE CASCADE ON UPDATE NO ACTION`.
- `ALTER TABLE [dbo].[jobs] ADD [public_apply_enabled] BIT NOT NULL CONSTRAINT [jobs_public_apply_enabled_df] DEFAULT 0, [apply_token] NVARCHAR(1000) NULL;` then a filtered UNIQUE index `CREATE UNIQUE NONCLUSTERED INDEX [jobs_apply_token_key] ON [dbo].[jobs]([apply_token]) WHERE [apply_token] IS NOT NULL;`
- `ALTER TABLE [dbo].[pipeline_entries] ADD [application_token] NVARCHAR(1000) NULL;` then `CREATE UNIQUE NONCLUSTERED INDEX [pipeline_entries_application_token_key] ON [dbo].[pipeline_entries]([application_token]) WHERE [application_token] IS NOT NULL;`

(SQL Server requires the filtered `WHERE ... IS NOT NULL` unique index for a nullable unique column — a plain unique index rejects multiple NULLs. Verify the generated form against how other nullable `@unique` columns in this schema were migrated, e.g. `invitations.drive_session_id` was not unique, but check `applyToken` behaves; if `prisma migrate diff` emits a plain unique index that fails on multiple NULLs at runtime, switch to the filtered form above.)

- [ ] **Step 4: Hand-write `20260819090001_candidate_experience_rls/migration.sql`**

Model on `20260818090001_ats_pipeline_rls/migration.sql`. Only `candidate_profiles` is a NEW table needing RLS (jobs/pipeline_entries already have policies):
```sql
ALTER SECURITY POLICY dbo.TenantAccessPolicy
ADD FILTER PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.candidate_profiles,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.candidate_profiles AFTER INSERT,
ADD BLOCK PREDICATE dbo.fn_tenant_access_predicate(organization_id) ON dbo.candidate_profiles AFTER UPDATE;
```

- [ ] **Step 5: Apply + verify**

```bash
cd "D:/exam app/apps/api" && DB_URL=$(grep "^DATABASE_URL=" .env | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//') && DATABASE_URL="$DB_URL" npx prisma migrate deploy --schema=prisma/schema.prisma && DATABASE_URL="$DB_URL" npx prisma generate --schema=prisma/schema.prisma
```
Expected: both migrations apply; the client exposes `candidateProfile` and the new `Job`/`PipelineEntry` fields.

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260819090000_candidate_experience apps/api/prisma/migrations/20260819090001_candidate_experience_rls apps/api/package.json apps/api/package-lock.json
git commit -m "feat(candidate-exp): schema + migrations + pdf-parse dep"
```

---

## Task 2: Pure helpers — status mapper + PDF validation

**Files:**
- Create: `apps/api/src/public-applications/application-status.ts`, `apps/api/src/public-applications/pdf-validation.ts`
- Test: `application-status.spec.ts`, `pdf-validation.spec.ts`

**Interfaces:**
- Produces:
  - `applicationStatusBucket(stage: string, rejected: boolean): string`
  - `MAX_RESUME_BYTES = 5 * 1024 * 1024`
  - `validatePdfUpload(buffer: Buffer): { ok: true } | { ok: false; reason: 'too_large' | 'not_pdf' }`

- [ ] **Step 1: Failing tests for the status mapper**

```ts
import { applicationStatusBucket } from './application-status';

describe('applicationStatusBucket', () => {
  it('maps each stage to its candidate-facing bucket', () => {
    expect(applicationStatusBucket('applied', false)).toBe('Application received');
    expect(applicationStatusBucket('screened', false)).toBe('Under review');
    expect(applicationStatusBucket('interview', false)).toBe('Under review');
    expect(applicationStatusBucket('offer', false)).toBe('Moving forward — the team will be in touch');
    expect(applicationStatusBucket('hired', false)).toBe('Moving forward — the team will be in touch');
  });
  it('rejected overrides any stage', () => {
    expect(applicationStatusBucket('interview', true)).toBe('A decision has been made; the team will follow up');
    expect(applicationStatusBucket('applied', true)).toBe('A decision has been made; the team will follow up');
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd "D:/exam app" && npx jest --config apps/api/jest.config.js src/public-applications/application-status
```

- [ ] **Step 3: Implement `application-status.ts`**

```ts
// Candidate-facing translation of the internal pipeline stage. Rejected wins over stage so a
// rejected candidate never sees a stage label. Never expose the raw stage to candidates.
export function applicationStatusBucket(stage: string, rejected: boolean): string {
  if (rejected) return 'A decision has been made; the team will follow up';
  switch (stage) {
    case 'applied':
      return 'Application received';
    case 'screened':
    case 'interview':
      return 'Under review';
    case 'offer':
    case 'hired':
      return 'Moving forward — the team will be in touch';
    default:
      return 'Application received';
  }
}
```

- [ ] **Step 4: Failing tests for PDF validation**

```ts
import { validatePdfUpload, MAX_RESUME_BYTES } from './pdf-validation';

describe('validatePdfUpload', () => {
  it('accepts a PDF-magic-byte buffer within the size cap', () => {
    expect(validatePdfUpload(Buffer.from('%PDF-1.7\n...'))).toEqual({ ok: true });
  });
  it('rejects a non-PDF buffer', () => {
    expect(validatePdfUpload(Buffer.from('PK\x03\x04 zip'))).toEqual({ ok: false, reason: 'not_pdf' });
  });
  it('rejects an oversized buffer', () => {
    const big = Buffer.alloc(MAX_RESUME_BYTES + 1, 0x25);
    expect(validatePdfUpload(big)).toEqual({ ok: false, reason: 'too_large' });
  });
});
```

- [ ] **Step 5: Run — expect FAIL**, then implement `pdf-validation.ts`

```ts
export const MAX_RESUME_BYTES = 5 * 1024 * 1024;

// Magic-byte check: a real PDF starts with "%PDF". Size cap checked first so a huge upload is
// rejected before we inspect bytes. This runs on a PUBLIC endpoint, so it is the trust boundary.
export function validatePdfUpload(buffer: Buffer): { ok: true } | { ok: false; reason: 'too_large' | 'not_pdf' } {
  if (buffer.length > MAX_RESUME_BYTES) return { ok: false, reason: 'too_large' };
  const header = buffer.subarray(0, 5).toString('latin1');
  if (!header.startsWith('%PDF')) return { ok: false, reason: 'not_pdf' };
  return { ok: true };
}
```

- [ ] **Step 6: Run both — expect PASS**, commit

```bash
cd "D:/exam app" && npx jest --config apps/api/jest.config.js src/public-applications/application-status src/public-applications/pdf-validation
git add apps/api/src/public-applications/application-status.ts apps/api/src/public-applications/application-status.spec.ts apps/api/src/public-applications/pdf-validation.ts apps/api/src/public-applications/pdf-validation.spec.ts
git commit -m "feat(candidate-exp): status-bucket mapper + PDF upload validation"
```

---

## Task 3: Public-applications service (apply flow + status + public job)

**Files:**
- Create: `apps/api/src/public-applications/public-applications.service.ts`, `apps/api/src/public-applications/dto/apply.dto.ts`
- Test: `public-applications.service.spec.ts`

**Interfaces:**
- Consumes: `TenantPrismaService`, `PrismaService`, `BlobStorageService`, `JobsService.enqueue(context, type, inputJson, userId)`. `applicationStatusBucket`, `validatePdfUpload`, `MAX_RESUME_BYTES` from Task 2.
- Produces on `PublicApplicationsService`:
  - `getPublicJob(applyToken: string): Promise<{ jobTitle: string; jobDescription: string | null; orgName: string; orgLogo: string | null }>` — throws `NotFoundException` unless open + enabled.
  - `apply(applyToken: string, dto: ApplyDto): Promise<{ statusToken: string }>`
  - `getApplicationStatus(statusToken: string): Promise<{ jobTitle: string; appliedAt: Date; statusBucket: string }>`
  - `ApplyDto = { name: string; email: string; phone?: string; resumeBase64: string }`

- [ ] **Step 1: Failing tests** — mock `tenantPrisma.forTenant`, `prisma` (for the org read), `blobStorage.upload`, `jobsService.enqueue`. Cover: `getPublicJob` throws NotFound when the job is missing / not open / not enabled, and returns header fields when valid; `apply` rejects a non-PDF/oversized `resumeBase64` with `BadRequestException` before any write; `apply` on a valid submission upserts candidate + profile (`parseStatus='pending'`, `resumePath`) + entry (`enteredVia='application'`, fresh `applicationToken`, `update:{}`) and enqueues a `resume_parse` job with `{candidateId}` and `createdBy = job.createdById`, returning the entry's token; re-apply returns the EXISTING token (upsert `update:{}`); `getApplicationStatus` maps stage→bucket and throws NotFound on an unknown token.

Example (apply happy path shape):
```ts
it('apply stores résumé, upserts candidate/profile/entry, enqueues parse, returns token', async () => {
  const bootstrapTx = { job: { findUnique: jest.fn().mockResolvedValue({ id: 'job-1', organizationId: 'org-1', createdById: 'user-1', status: 'open', publicApplyEnabled: true, title: 'Backend' }) } };
  const writeTx = {
    candidate: { upsert: jest.fn().mockResolvedValue({ id: 'cand-1' }) },
    candidateProfile: { upsert: jest.fn().mockResolvedValue({ id: 'prof-1' }) },
    pipelineEntry: { upsert: jest.fn().mockResolvedValue({ id: 'en-1', applicationToken: 'tok-generated' }) },
  };
  tenantPrisma.forTenant
    .mockImplementationOnce((_c, fn) => fn(bootstrapTx))   // job lookup (super-admin)
    .mockImplementationOnce((_c, fn) => fn(writeTx));       // writes (org pinned)
  blobStorage.upload.mockResolvedValue('candidates/cand-1/resume.pdf');
  jobsService.enqueue.mockResolvedValue({ id: 'aijob-1' });

  const pdf = Buffer.from('%PDF-1.7 hello').toString('base64');
  const out = await service.apply('valid-token', { name: 'A', email: 'a@x.com', resumeBase64: pdf });

  expect(blobStorage.upload).toHaveBeenCalled();               // upload BEFORE the write tx
  expect(writeTx.pipelineEntry.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: {} }));
  expect(jobsService.enqueue).toHaveBeenCalledWith(expect.objectContaining({ organizationId: 'org-1' }), 'resume_parse', expect.stringContaining('cand-1'), 'user-1');
  expect(out).toEqual({ statusToken: 'tok-generated' });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd "D:/exam app" && npx jest --config apps/api/jest.config.js src/public-applications/public-applications.service
```

- [ ] **Step 3: DTO**

`dto/apply.dto.ts`:
```ts
import { IsBase64, IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class ApplyDto {
  @IsString() @MinLength(1) @MaxLength(200) name!: string;
  @IsEmail() email!: string;
  @IsOptional() @IsString() @MaxLength(50) phone?: string;
  @IsBase64() resumeBase64!: string;
}
```

- [ ] **Step 4: Implement `public-applications.service.ts`**

Constructor injects `TenantPrismaService`, `PrismaService`, `BlobStorageService`, `JobsService`. Key methods:

```ts
// Bootstrap read: jobs is RLS-protected and we have no org yet. forTenant bypasses RLS when
// isSuperAdmin:true (the super-admin flag ignores the org predicate), so we read the one job by
// its globally-unique applyToken. The placeholder org is never used for filtering or written.
private readonly LOOKUP_ORG = '00000000-0000-0000-0000-000000000000';

private async resolveJob(applyToken: string) {
  const job = await this.tenantPrisma.forTenant(
    { organizationId: this.LOOKUP_ORG, isSuperAdmin: true },
    (tx) => tx.job.findUnique({ where: { applyToken }, select: { id: true, organizationId: true, createdById: true, status: true, publicApplyEnabled: true, title: true, description: true } }),
  );
  if (!job || job.status !== 'open' || !job.publicApplyEnabled) {
    throw new NotFoundException('This role is not accepting applications'); // generic — no oracle
  }
  return job;
}

async getPublicJob(applyToken: string) {
  const job = await this.resolveJob(applyToken);
  const org = await this.prisma.organization.findUnique({ where: { id: job.organizationId }, select: { name: true, logoPath: true } });
  return { jobTitle: job.title, jobDescription: job.description, orgName: org?.name ?? '', orgLogo: org?.logoPath ?? null };
}
```
`apply`:
1. `const job = await this.resolveJob(applyToken);`
2. Decode + validate: `const buf = Buffer.from(dto.resumeBase64, 'base64'); const v = validatePdfUpload(buf); if (!v.ok) throw new BadRequestException(v.reason === 'too_large' ? 'Résumé exceeds 5 MB' : 'Résumé must be a PDF');`
3. **Upload the blob OUTSIDE the tx** (ADO #6810): `const resumePath = await this.blobStorage.upload(\`candidates/${job.organizationId}/${randomUUID()}.pdf\`, buf, 'application/pdf');` (import `randomUUID` from `crypto`).
4. Writes in the org's tenant context:
```ts
const context = { organizationId: job.organizationId, isSuperAdmin: true };
const entry = await this.tenantPrisma.forTenant(context, async (tx) => {
  const candidate = await tx.candidate.upsert({
    where: { organizationId_email: { organizationId: job.organizationId, email: dto.email } },
    create: { organizationId: job.organizationId, email: dto.email, name: dto.name, phone: dto.phone ?? null },
    update: { name: dto.name, phone: dto.phone ?? null },
  });
  await tx.candidateProfile.upsert({
    where: { candidateId: candidate.id },
    create: { organizationId: job.organizationId, candidateId: candidate.id, resumePath, parseStatus: 'pending' },
    update: { resumePath, parseStatus: 'pending', parsedSummary: null, parsedSkills: null, parsedTitle: null, parsedYearsExperience: null, parsedAt: null },
  });
  return tx.pipelineEntry.upsert({
    where: { jobId_candidateId: { jobId: job.id, candidateId: candidate.id } },
    create: { organizationId: job.organizationId, jobId: job.id, candidateId: candidate.id, stage: 'applied', enteredVia: 'application', applicationToken: randomUUID() },
    update: {}, // stamp-if-absent: re-applying keeps the existing entry + token (but the profile above IS refreshed)
  });
});
await this.jobsService.enqueue(context, 'resume_parse', JSON.stringify({ candidateId: entry.candidateId ?? '' }), job.createdById);
return { statusToken: entry.applicationToken! };
```
(Note the candidateId for enqueue: capture `candidate.id` in the tx and return it alongside the entry, e.g. return `{ entry, candidateId: candidate.id }`; enqueue with that.)

`getApplicationStatus`:
```ts
async getApplicationStatus(statusToken: string) {
  const row = await this.tenantPrisma.forTenant(
    { organizationId: this.LOOKUP_ORG, isSuperAdmin: true },
    (tx) => tx.pipelineEntry.findUnique({ where: { applicationToken: statusToken }, select: { stage: true, rejected: true, createdAt: true, job: { select: { title: true } } } }),
  );
  if (!row) throw new NotFoundException('Application not found');
  return { jobTitle: row.job.title, appliedAt: row.createdAt, statusBucket: applicationStatusBucket(row.stage, row.rejected) };
}
```

- [ ] **Step 5: Run — expect PASS**, commit

```bash
cd "D:/exam app" && npx jest --config apps/api/jest.config.js src/public-applications/public-applications.service
git add apps/api/src/public-applications/public-applications.service.ts apps/api/src/public-applications/dto/apply.dto.ts apps/api/src/public-applications/public-applications.service.spec.ts
git commit -m "feat(candidate-exp): public applications service (apply flow + status)"
```

---

## Task 4: Public controller, throttler, module

**Files:**
- Create: `apps/api/src/public-applications/public-applications.controller.ts`, `public-applications.throttler.guard.ts`, `public-applications.module.ts`, `public-applications.controller.spec.ts`
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: `PublicApplicationsService` (Task 3), `JobsModule` (exports `JobsService`).
- Produces routes (NO `JwtAuthGuard` — guard-exempt, like `WalkInController`):
  - `GET /public/jobs/:applyToken` → `getPublicJob`
  - `POST /public/jobs/:applyToken/apply` (body `ApplyDto`) → `apply`
  - `GET /public/applications/:statusToken` → `getApplicationStatus`

- [ ] **Step 1: Failing controller test** — mirror `apps/api/src/walk-in/walk-in.controller.spec.ts`: mock the service, assert each handler delegates with the right args. (No 401 test — these are intentionally public.)

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

Throttler guard: copy `apps/api/src/walk-in/walk-in-throttler.guard.ts`'s shape but key off `req.params.applyToken` (falling back to a constant for the status route). Controller:
```ts
import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PublicApplicationsService } from './public-applications.service';
import { ApplyDto } from './dto/apply.dto';
import { PublicApplicationsThrottlerGuard } from './public-applications.throttler.guard';
import { STRICT_WALK_IN_THROTTLE } from '../rate-limit-tiers';

@Controller('public')
@UseGuards(PublicApplicationsThrottlerGuard)
@Throttle(STRICT_WALK_IN_THROTTLE)
export class PublicApplicationsController {
  constructor(private readonly service: PublicApplicationsService) {}

  @Get('jobs/:applyToken')
  getJob(@Param('applyToken') applyToken: string) { return this.service.getPublicJob(applyToken); }

  @Post('jobs/:applyToken/apply')
  apply(@Param('applyToken') applyToken: string, @Body() dto: ApplyDto) { return this.service.apply(applyToken, dto); }

  @Get('applications/:statusToken')
  status(@Param('statusToken') statusToken: string) { return this.service.getApplicationStatus(statusToken); }
}
```
Module provides the controller + service + guard, imports `JobsModule`. Register `PublicApplicationsModule` in `app.module.ts` (it must NOT be behind any global auth — confirm the only APP_GUARD is `FailOpenThrottlerGuard`).

- [ ] **Step 4: Run — expect PASS**, then api suite + typecheck

```bash
cd "D:/exam app" && npx jest --config apps/api/jest.config.js src/public-applications && npx tsc -p apps/api/tsconfig.json --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/public-applications/public-applications.controller.ts apps/api/src/public-applications/public-applications.throttler.guard.ts apps/api/src/public-applications/public-applications.module.ts apps/api/src/public-applications/public-applications.controller.spec.ts apps/api/src/app.module.ts
git commit -m "feat(candidate-exp): guard-exempt public applications controller + module"
```

---

## Task 5: resume_parse AiJob processor

**Files:**
- Create: `apps/api/src/jobs/processors/resume-parse.processor.ts`, `resume-parse.processor.spec.ts`
- Modify: `apps/api/src/jobs/jobs.module.ts`

**Interfaces:**
- Consumes: `JobProcessor` interface (`{ readonly type; process(input, context, aiJobId) }`), `TenantPrismaService`, `BlobStorageService`, the per-org AI resolver + provider (`ai-api-key-resolver.service` + an AI provider), `pdf-parse`.
- Produces: `ResumeParseProcessor` with `type = 'resume_parse'`, registered in `AI_JOB_PROCESSORS`. Writes `CandidateProfile` fields; sets `parseStatus`.

- [ ] **Step 1: Failing tests** — mock the AI resolver, blob storage (returns a PDF buffer via a mocked download), and `pdf-parse`. Cover: happy path writes `parsedSummary/parsedSkills/parsedTitle/parsedYearsExperience` + `parseStatus='done'`; **no AI key → `parseStatus='unavailable'`, no AI call**; a `pdf-parse` throw or AI error → `parseStatus='failed'`. Read `ai-question-generation.processor.spec.ts` for how it mocks the AI provider + resolver.

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

```ts
import pdfParse from 'pdf-parse';
// ... (mirror ai-question-generation.processor.ts for AI-provider resolution + structured call)

export class ResumeParseProcessor implements JobProcessor {
  readonly type = 'resume_parse';
  constructor(/* tenantPrisma, blobStorage, aiKeyResolver, providerFactory */) {}

  async process(input: unknown, context: TenantContext, _aiJobId: string): Promise<unknown> {
    const { candidateId } = input as { candidateId: string };
    const profile = await this.tenantPrisma.forTenant(context, (tx) =>
      tx.candidateProfile.findUnique({ where: { candidateId } }));
    if (!profile?.resumePath) { return this.setStatus(context, candidateId, 'failed'); }

    const apiKey = await this.aiKeyResolver.resolve(context.organizationId);   // null when unconfigured
    if (!apiKey) { return this.setStatus(context, candidateId, 'unavailable'); }

    try {
      const buf = await this.blobStorage.download(profile.resumePath);         // add if not present; else read via signed URL fetch
      const text = (await pdfParse(buf)).text.slice(0, 40000);                 // truncate before AI
      const parsed = await this.callAi(apiKey, text);                          // { summary, skills[], title, yearsExperience }
      await this.tenantPrisma.forTenant(context, (tx) => tx.candidateProfile.update({
        where: { candidateId },
        data: { parseStatus: 'done', parsedSummary: parsed.summary, parsedSkills: JSON.stringify(parsed.skills ?? []), parsedTitle: parsed.title ?? null, parsedYearsExperience: parsed.yearsExperience ?? null, parsedAt: new Date() },
      }));
      return { ok: true };
    } catch {
      return this.setStatus(context, candidateId, 'failed');
    }
  }
  private setStatus(context, candidateId, parseStatus) {
    return this.tenantPrisma.forTenant(context, (tx) => tx.candidateProfile.update({ where: { candidateId }, data: { parseStatus } }));
  }
}
```
Register in `jobs.module.ts`'s `AI_JOB_PROCESSORS` array alongside `AiQuestionGenerationProcessor`. If `BlobStorageService` has no `download`, add one (`downloadToBuffer(path): Promise<Buffer>` using the block-blob client's `downloadToBuffer`) in `packages/shared/src/storage/blob-storage.service.ts` with a unit test — this is a small, in-scope addition (the parse processor needs the bytes, not a signed URL).

- [ ] **Step 4: Run — expect PASS**, commit

```bash
cd "D:/exam app" && npx jest --config apps/api/jest.config.js src/jobs/processors/resume-parse
git add apps/api/src/jobs/processors/resume-parse.processor.ts apps/api/src/jobs/processors/resume-parse.processor.spec.ts apps/api/src/jobs/jobs.module.ts packages/shared/src/storage/blob-storage.service.ts
git commit -m "feat(candidate-exp): resume_parse AiJob processor"
```

---

## Task 6: Recruiter endpoints — toggle, profile, résumé, GDPR

**Files:**
- Modify: `apps/api/src/pipeline/pipeline.service.ts`, `apps/api/src/pipeline/dto/update-job.dto.ts`
- Modify: `apps/api/src/candidates/candidates.controller.ts`, `apps/api/src/candidates/candidates.service.ts`
- Modify their `*.spec.ts`

**Interfaces:**
- Produces:
  - `updateJob` accepts `publicApplyEnabled?: boolean`; when set true and `applyToken` is null, mint one (`randomUUID()`); never rotate an existing token; never clear it when toggled off. `getJob` returns `publicApplyEnabled` + `applyToken`.
  - `GET /candidates/:id/profile` (`results:view`) → `CandidateProfile | null` (org-scoped).
  - `GET /candidates/:id/resume` (`results:view`) → `{ url: string }` signed blob URL, or 404 when no résumé.
  - Candidate erase includes `candidate_profiles.resumePath` in the blob-cleanup collection, deleted before rows.

- [ ] **Step 1: Failing tests** — `update-job` with `publicApplyEnabled:true` mints `applyToken` once and is idempotent on re-enable; `getJob` surfaces both fields; `GET /candidates/:id/profile` returns the org-scoped profile; `GET /candidates/:id/resume` returns a signed URL and 404 when `resumePath` is null; candidate-erase collects the résumé blob URL. Read `candidates.service.spec.ts`'s erase test (around the PII-scrub test) for the collection shape.

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

`update-job.dto.ts` — add `@IsOptional() @IsBoolean() publicApplyEnabled?: boolean;`
`pipeline.service.ts` `updateJob` — when `dto.publicApplyEnabled === true`, load the job's current `applyToken`; if null, include `applyToken: randomUUID()` in the update data. Add `publicApplyEnabled`/`applyToken` to `getJob`'s returned shape.
`candidates.controller.ts` — two `@RequirePermissions('results:view')` GET routes delegating to the service.
`candidates.service.ts` — `getProfile(context, candidateId)` (org-scoped `candidateProfile.findFirst`); `getResumeUrl(context, candidateId)` → look up `resumePath`, `NotFoundException` if null, else `blobStorage.signIfOurs(resumePath)` → `{ url }`. In the erase path, `SELECT resume_path` for the candidate and add it to the same blob-URL collection the webcam/face evidence uses (delete before rows).

- [ ] **Step 4: Run — expect PASS**, then api suite + typecheck

```bash
cd "D:/exam app" && npx jest --config apps/api/jest.config.js src/pipeline src/candidates && npx tsc -p apps/api/tsconfig.json --noEmit
git add apps/api/src/pipeline apps/api/src/candidates
git commit -m "feat(candidate-exp): public-apply toggle + candidate profile/résumé endpoints + GDPR cleanup"
```

---

## Task 7: Frontend — public apply form + status page

**Files:**
- Create: `apps/web/app/apply/[applyToken]/page.tsx`, `apps/web/app/application/[statusToken]/page.tsx`
- Create: `apps/web/app/apply/[applyToken]/apply-form.test.tsx`
- Modify: `apps/web/lib/types.ts`

**Interfaces:**
- Consumes: the three public endpoints (plain `fetch` against `${NEXT_PUBLIC_API_BASE}/public/...` — NOT `apiFetch`, since there is no auth token). Types `PublicJob = { jobTitle; jobDescription: string|null; orgName; orgLogo: string|null }`, `ApplicationStatus = { jobTitle; appliedAt: string; statusBucket: string }`.

- [ ] **Step 1: Read `apps/web/AGENTS.md`**, and read the existing public candidate page (`apps/web/app/start/*` or the walk-in public page) for the candidate-tier layout + how it reads `NEXT_PUBLIC_*` API base without auth.

- [ ] **Step 2: Failing test** (`apply-form.test.tsx`) — mock `fetch`: GET returns a `PublicJob`, POST returns `{ statusToken }`. Render, assert the job title renders, fill name/email + attach a PDF `File`, submit, assert the POST fires and the status link (`/application/{statusToken}`) shows. (Use `DriveResults.test.tsx` for the fetch-mock pattern.)

- [ ] **Step 3: Run — expect FAIL**

```bash
cd "D:/exam app/apps/web" && npx jest "app/apply"
```

- [ ] **Step 4: Implement both pages**

`/apply/[applyToken]/page.tsx`: `useParams` → `applyToken`; on mount `fetch` the public job (generic "not accepting applications" on non-200); a form with name/email/phone + a `<input type="file" accept="application/pdf">`; on submit read the file as base64 (`FileReader`), client-side check type `application/pdf` + size ≤ 5 MB, POST `{ name, email, phone, resumeBase64 }`; on success render a confirmation with a link to `/application/${statusToken}`. Org-branded header (logo + name), mobile-friendly, candidate-tier styling.
`/application/[statusToken]/page.tsx`: `fetch` the status; render job title, "Applied on {formatted date}", and the `statusBucket` in a badge. Read-only.

- [ ] **Step 5: Run — expect PASS**, then web typecheck, commit

```bash
cd "D:/exam app/apps/web" && npx jest "app/apply" && npx tsc --noEmit
git add "apps/web/app/apply" "apps/web/app/application" apps/web/lib/types.ts
git commit -m "feat(candidate-exp): public apply form + status page"
```

---

## Task 8: Frontend — recruiter toggle + CandidateDrawer profile

**Files:**
- Modify: `apps/web/app/(recruiter)/jobs/[jobId]/page.tsx`, `apps/web/components/pipeline/CandidateDrawer.tsx`, `apps/web/lib/hooks/usePipeline.ts`, `apps/web/lib/types.ts`
- Create: `apps/web/components/pipeline/CandidateProfile.test.tsx` (or extend `CandidateDrawer.test.tsx`)

**Interfaces:**
- Consumes: `GET /candidates/:id/profile`, `GET /candidates/:id/resume`, `PATCH /jobs/:id` (`publicApplyEnabled`); `JobDetail` now carries `publicApplyEnabled` + `applyToken`.
- Produces: `useCandidateProfile(candidateId)`, `useCandidateResumeUrl(candidateId)` hooks; a Profile section in `CandidateDrawer`; a public-apply control on the job page.

- [ ] **Step 1: Failing test** — `CandidateDrawer` renders the Profile section: summary, skills chips, title, years, a "Download résumé" button, and the parse-status states (`Parsing…`/`Parse failed`/`No résumé`) driven by `parseStatus`. Mock `useCandidateProfile`.

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

Add `CandidateProfile` type to `lib/types.ts` (`{ resumePath: string|null; parseStatus: 'pending'|'parsing'|'done'|'failed'|'unavailable'; parsedSummary: string|null; parsedSkills: string|null; parsedTitle: string|null; parsedYearsExperience: number|null }`) and `publicApplyEnabled: boolean; applyToken: string | null` to `JobDetail`. Add `useCandidateProfile`/`useCandidateResumeUrl` to `usePipeline.ts` (React Query, `enabled` on candidateId). In `CandidateDrawer.tsx` add a Profile section: when `parseStatus==='done'` show summary + skills chips (`JSON.parse(parsedSkills)`) + title + years; otherwise a status hint; a "Download résumé" button that fetches the résumé URL and opens it (only when a résumé exists). On `jobs/[jobId]/page.tsx`, near LinkedExams and gated on `canManage`, a "Public applications" toggle (`useUpdateJob({ publicApplyEnabled })`) and, when on, a read-only copy field showing `${window.location.origin}/apply/${applyToken}`.

- [ ] **Step 4: Run — expect PASS**, then web drives/pipeline suites + typecheck, commit

```bash
cd "D:/exam app/apps/web" && npx jest components/pipeline "app/(recruiter)/jobs" && npx tsc --noEmit
git add apps/web/components/pipeline "apps/web/app/(recruiter)/jobs/[jobId]" apps/web/lib
git commit -m "feat(candidate-exp): recruiter public-apply toggle + CandidateDrawer profile"
```

---

## Task 9: Whole-feature verification

**Files:** none.

- [ ] **Step 1: Full backend suite + typecheck**

```bash
cd "D:/exam app" && npx jest --config apps/api/jest.config.js && npx tsc -p apps/api/tsconfig.json --noEmit
```
Expected: all green; exam-runtime untouched.

- [ ] **Step 2: Full web suite + typecheck**

```bash
cd "D:/exam app/apps/web" && npx jest --maxWorkers=2 && npx tsc --noEmit
```

- [ ] **Step 3: Browser smoke (post-deploy)** — enable public applications on a job → open `/apply/{token}` → submit a real PDF → land on the status page → confirm the candidate appears at `applied` (`enteredVia=application`) on the board → (with an org AI key) the parsed profile fills the drawer, else `unavailable` with the résumé still downloadable → download the résumé → delete the test data.

- [ ] **Step 4: Proceed to the final whole-branch review + finishing-a-development-branch.**

---

## Self-Review

**Spec coverage:**
- `Job.publicApplyEnabled/applyToken`, `PipelineEntry.applicationToken`, `CandidateProfile` + RLS → Task 1. ✅
- Status-bucket mapper + PDF guards → Task 2. ✅
- Public apply flow (org-pinned, upsert candidate/profile/entry, blob-outside-tx, enqueue, generic 404) → Task 3. ✅
- Guard-exempt public controller + throttler → Task 4. ✅
- resume_parse processor (pdf-parse → per-org AI, `unavailable`/`failed`) → Task 5. ✅
- Recruiter toggle (mint applyToken), profile + résumé endpoints, GDPR blob cleanup → Task 6. ✅
- Public apply form + status page → Task 7. ✅
- Recruiter toggle/link + drawer Profile section → Task 8. ✅
- Third entry point `enteredVia='application'` → Task 3 (entry upsert). ✅
- Edge cases (re-apply idempotent, second job, existing candidate, no-key, bad PDF, closed job, GDPR) → Tasks 3/5/6 tests. ✅
- Out-of-scope items → not planned. ✅

**Placeholder scan:** the résumé-bytes fetch in Task 5 notes a conditional (`blobStorage.download` add-if-absent) — it names the exact method to add and its signature, not a vague "handle it." No TBD/TODO logic.

**Type consistency:** `applyToken`, `applicationToken`, `parseStatus` values (`pending`/`parsing`/`done`/`failed`/`unavailable`), `CandidateProfile` fields, `applicationStatusBucket(stage, rejected)`, `validatePdfUpload` return shape, and the `resume_parse` job type string are used identically across tasks and match the spec.

**Note on the super-admin bootstrap read (Tasks 3):** `resolveJob`/`getApplicationStatus` read RLS-protected tables with `isSuperAdmin:true` and a placeholder org because there is no org context until the token resolves. The super-admin flag bypasses the RLS predicate (per `tenant-prisma.service.ts:39`); the placeholder org is never written. This is the one deliberate RLS-bypass in the feature and is flagged for the reviewer — it is safe because the lookup is by a globally-unique token and all *writes* use the real, job-derived org.
