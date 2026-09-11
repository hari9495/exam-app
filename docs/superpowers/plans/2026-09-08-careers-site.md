# Themeable Careers Site (Zoho #14) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A public, branded, opt-in careers page at `/careers/:orgSlug` listing the roles an org chooses to feature, each linking to the existing apply flow; org-admin controls enablement, headline/intro/banner, and per-job listing. Additive and off-by-default.

**Architecture:** Additive `Job.listOnCareers` + `Organization` careers columns; a public `GET /public/careers/:orgSlug` (portal-token/LOOKUP_ORG bypass) returning branding + listed jobs; careers config GET/PUT + banner upload on the organizations surface (mirroring branding/logo); a per-job `listOnCareers` flag through the existing job-update path; a public SSR careers page (branded, filterable, JobPosting JSON-LD) + an org-admin settings page + nav.

**Tech Stack:** NestJS 10, Prisma 5.22 (SQL Server), Next.js (apps/web) SSR, Jest.

**Spec:** docs/superpowers/specs/2026-09-08-careers-site-design.md

## Global Constraints

- **Base:** branch `feat/careers-site` off origin/main @ `08ae024e`. Work in the main checkout, NOT a worktree (junction disk-fill hazard).
- **NEVER** run `npm install` / `npm ci` / `npm update`. Use only `npx prisma generate` / `npx prisma migrate deploy` / existing `jest` / `tsc`. Run jest FROM `apps/api` or `apps/web` (repo-root jest mis-resolves into a stale sibling worktree; kill stale node/jest on a locked-DLL EPERM).
- **Additive columns on `jobs` + `organizations` (both already tenant-RLS) → NO `_rls` migration, no seed.** Migration `20260908220000_careers_site` — **the number MUST stay greater than the parked `feat/api-usage-metering` migrations `20260908210000`/`210001`** so the chain is linear when both merge.
- **Off-by-default / behavior-preserving:** `careersEnabled` + `listOnCareers` default false → no public careers page and no listed jobs until an org opts in. Existing apply flow + `jobs-feed.xml` unchanged.
- **Public route** (`GET /public/careers/:orgSlug`) is unauthenticated by absence of JwtAuthGuard, on the existing `@Controller('public')` (same throttle as the other public routes). Resolve via `forTenant({ organizationId: LOOKUP_ORG, isSuperAdmin: true }, …)` — `LOOKUP_ORG = '00000000-0000-0000-0000-000000000000'` (already defined in `public-applications.service.ts`). Reads of RLS tables (jobs) MUST go through `forTenant`.
- **Org-own-row config writes** use `this.prisma.organization.update({ where: { id: organizationId } })` (raw Prisma by PK — the established convention for org settings, same as `uploadLogo`/`updateBrandingColors`). Signed image URLs via `blobStorage.signIfOurs`.
- Config routes per-method `@RequirePermissions('org:manage_settings')` (guard is handler-only). Banner upload mirrors `uploadLogo` exactly.
- apps/web must NOT import `@exam-platform/shared` VALUES at runtime (types-only OK). The public page uses raw `fetch(API_BASE)` (mirror `/walk-in/[orgSlug]`), NOT the authed api-client. Deep-import ui components (ui-v2 barrel is a Jest hazard).
- Attribution footer on every commit: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

### Task 1: Schema — `Job.listOnCareers` + `Organization` careers columns

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (models `Job`, `Organization`)
- Create: `apps/api/prisma/migrations/20260908220000_careers_site/migration.sql`

**Interfaces:**
- Produces: `Job.listOnCareers: boolean` (default false); `Organization.careersEnabled: boolean` (default false), `careersHeadline: string|null`, `careersIntro: string|null`, `careersBannerPath: string|null`.

- [ ] **Step 1: Add fields.**
```prisma
// model Job (add near publicApplyEnabled)
listOnCareers Boolean @default(false) @map("list_on_careers")

// model Organization (add near the other careers-adjacent config)
careersEnabled    Boolean @default(false) @map("careers_enabled")
careersHeadline   String? @map("careers_headline")
careersIntro      String? @map("careers_intro") @db.NVarChar(Max)
careersBannerPath String? @map("careers_banner_path")
```

- [ ] **Step 2: Migration** `20260908220000_careers_site/migration.sql` (BIT NOT NULL DEFAULT idiom matches `20260906140000_organization_record_visibility`):
```sql
ALTER TABLE [dbo].[jobs] ADD [list_on_careers] BIT NOT NULL CONSTRAINT [DF_jobs_list_on_careers] DEFAULT 0;
ALTER TABLE [dbo].[organizations] ADD [careers_enabled] BIT NOT NULL CONSTRAINT [DF_organizations_careers_enabled] DEFAULT 0, [careers_headline] NVARCHAR(1000) NULL, [careers_intro] NVARCHAR(MAX) NULL, [careers_banner_path] NVARCHAR(1000) NULL;
```
(No `_rls` — both tables already carry the tenant policy. No seed.)

- [ ] **Step 3: Apply + regenerate + typecheck.** From `apps/api`: `npx prisma migrate deploy`, `npx prisma generate`, `npx tsc --noEmit`. Expected: applied, client has the fields, tsc clean.

- [ ] **Step 4: Commit.**
```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260908220000_careers_site
git commit -m "feat(careers): listOnCareers + org careers config columns"
```

---

### Task 2: Public careers endpoint — `GET /public/careers/:orgSlug`

**Files:**
- Modify: `apps/api/src/public-applications/public-applications.service.ts` (add `getCareers`)
- Modify: `apps/api/src/public-applications/public-applications.controller.ts` (add route)
- Test: `apps/api/src/public-applications/public-applications.service.spec.ts` (+ controller spec if it asserts routing)

**Interfaces:**
- Consumes: the careers columns (T1); `LOOKUP_ORG`; `blobStorage.signIfOurs`.
- Produces: `GET /public/careers/:orgSlug` → `CareersPageResponse`:
  ```ts
  interface CareersPageResponse {
    orgName: string;
    headline: string | null;
    intro: string | null;
    logoUrl: string | null;
    bannerUrl: string | null;
    primaryColor: string | null;
    accentColor: string | null;
    textColor: string | null;
    jobs: { applyToken: string; title: string; location: string | null; employmentType: string | null; department: string | null; salaryMin: number | null; salaryMax: number | null; salaryCurrency: string | null }[];
  }
  ```

- [ ] **Step 1: Failing test** in `public-applications.service.spec.ts`: mock `forTenant` to invoke the callback with a `tx` whose `organization.findFirst` returns an enabled org (with branding/careers fields) and `job.findMany` returns 2 listed jobs; mock `blobStorage.signIfOurs`. Assert:
  - `getCareers('acme')` returns the branding + `jobs` mapped to the response shape (signed logoUrl/bannerUrl);
  - `job.findMany` was called with `where: { organizationId: <org.id>, status: 'open', publicApplyEnabled: true, listOnCareers: true, applyToken: { not: null } }`;
  - when `organization.findFirst` returns null OR an org with `careersEnabled: false` → throws `NotFoundException` (two cases).

- [ ] **Step 2: Implement `getCareers`** (mirror `getJobsFeed`'s LOOKUP_ORG tx + `getPublicJob`'s signed-logo pattern):
```ts
async getCareers(orgSlug: string): Promise<CareersPageResponse> {
  const result = await this.tenantPrisma.forTenant(
    { organizationId: this.LOOKUP_ORG, isSuperAdmin: true },
    async (tx) => {
      const org = await tx.organization.findFirst({
        where: { slug: orgSlug },
        select: {
          id: true, name: true, careersEnabled: true, careersHeadline: true, careersIntro: true,
          careersBannerPath: true, logoPath: true, primaryColor: true, accentColor: true, textColor: true,
        },
      });
      if (!org || !org.careersEnabled) return null;
      const jobs = await tx.job.findMany({
        where: { organizationId: org.id, status: 'open', publicApplyEnabled: true, listOnCareers: true, applyToken: { not: null } },
        select: {
          applyToken: true, title: true, location: true, employmentType: true, department: true,
          salaryMin: true, salaryMax: true, salaryCurrency: true, createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
      });
      return { org, jobs };
    },
  );
  if (!result) throw new NotFoundException('Careers page not found');
  const { org, jobs } = result;
  return {
    orgName: org.name,
    headline: org.careersHeadline ?? null,
    intro: org.careersIntro ?? null,
    logoUrl: org.logoPath ? ((await this.blobStorage.signIfOurs(org.logoPath)) as string | null) : null,
    bannerUrl: org.careersBannerPath ? ((await this.blobStorage.signIfOurs(org.careersBannerPath)) as string | null) : null,
    primaryColor: org.primaryColor ?? null,
    accentColor: org.accentColor ?? null,
    textColor: org.textColor ?? null,
    jobs: jobs.map((j) => ({
      applyToken: j.applyToken as string,
      title: j.title, location: j.location, employmentType: j.employmentType, department: j.department,
      salaryMin: j.salaryMin, salaryMax: j.salaryMax, salaryCurrency: j.salaryCurrency,
    })),
  };
}
```
(Export the `CareersPageResponse` interface from the service file so the controller + tests can use it.)

- [ ] **Step 3: Route** in `public-applications.controller.ts` (distinct segment `careers/:orgSlug`, no collision with `jobs`):
```ts
@Get('careers/:orgSlug')
getCareers(@Param('orgSlug') orgSlug: string) {
  return this.service.getCareers(orgSlug);
}
```

- [ ] **Step 4: Tests + tsc + commit.** `npx jest public-applications` (apps/api) + `npx tsc --noEmit`.
```bash
git add apps/api/src/public-applications
git commit -m "feat(careers): GET /public/careers/:orgSlug returns branding + listed jobs"
```

---

### Task 3: Careers config API — GET/PUT + banner upload

**Files:**
- Modify: `apps/api/src/organizations/organizations.service.ts` (`getCareers`, `setCareers`, `uploadCareersBanner` + a `CareersSettingsResponse`)
- Modify: `apps/api/src/organizations/organizations.controller.ts` (routes)
- Create: `apps/api/src/organizations/dto/update-careers.dto.ts`
- Test: organizations service + controller specs

**Interfaces:**
- Consumes: the careers columns (T1); `blobStorage`; `ALLOWED_LOGO_MIME_TYPES` / `MAX_LOGO_SIZE_BYTES` (reuse the logo constants for the banner).
- Produces: `GET /organizations/careers` → `CareersSettingsResponse { enabled: boolean; headline: string | null; intro: string | null; bannerUrl: string | null }`; `PUT /organizations/careers` `{ enabled, headline?, intro? }`; `POST /organizations/careers/banner` (multipart `file`) → `{ bannerUrl }`.

- [ ] **Step 1: DTO** `update-careers.dto.ts`:
```ts
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateCareersDto {
  @IsBoolean() enabled!: boolean;
  @IsOptional() @IsString() @MaxLength(200) headline?: string | null;
  @IsOptional() @IsString() @MaxLength(5000) intro?: string | null;
}
```

- [ ] **Step 2: Failing service tests** in `organizations.service.spec.ts`:
  - `getCareers(context)` returns `{ enabled, headline, intro, bannerUrl }` from the org row (bannerUrl signed via signIfOurs; null when no banner).
  - `setCareers(context, userId, dto)`: persists `careersEnabled`, and normalizes empty/whitespace `headline`/`intro` → null; audit `organization.careers_updated`.
  - `uploadCareersBanner(context, userId, file)`: rejects a non-image mimetype (BadRequest); on a valid PNG, calls `blobStorage.upload` and sets `careersBannerPath`, returns signed `{ bannerUrl }`; audit `organization.careers_banner_updated`.

- [ ] **Step 3: Implement** in `organizations.service.ts` (mirror `updateBrandingColors` + `uploadLogo`; use `this.requireOrganizationId(context)` + `this.prisma.organization.update` by id; `this.audit.record`):
```ts
export interface CareersSettingsResponse { enabled: boolean; headline: string | null; intro: string | null; bannerUrl: string | null; }

async getCareers(context: TenantContext): Promise<CareersSettingsResponse> {
  const organizationId = this.requireOrganizationId(context);
  const org = await this.prisma.organization.findUnique({
    where: { id: organizationId },
    select: { careersEnabled: true, careersHeadline: true, careersIntro: true, careersBannerPath: true },
  });
  return {
    enabled: org?.careersEnabled ?? false,
    headline: org?.careersHeadline ?? null,
    intro: org?.careersIntro ?? null,
    bannerUrl: org?.careersBannerPath ? ((await this.blobStorage.signIfOurs(org.careersBannerPath)) as string | null) : null,
  };
}

async setCareers(context: TenantContext, actorUserId: string, dto: UpdateCareersDto): Promise<CareersSettingsResponse> {
  const organizationId = this.requireOrganizationId(context);
  const norm = (s: string | null | undefined) => { const t = (s ?? '').trim(); return t.length ? t : null; };
  await this.prisma.organization.update({
    where: { id: organizationId },
    data: {
      careersEnabled: dto.enabled,
      ...(dto.headline !== undefined && { careersHeadline: norm(dto.headline) }),
      ...(dto.intro !== undefined && { careersIntro: norm(dto.intro) }),
    },
  });
  await this.audit.record(context, { actorUserId, action: 'organization.careers_updated', entityType: 'organization', entityId: organizationId });
  return this.getCareers(context);
}

async uploadCareersBanner(context: TenantContext, actorUserId: string, file: Express.Multer.File): Promise<{ bannerUrl: string | null }> {
  const organizationId = this.requireOrganizationId(context);
  const extension = ALLOWED_LOGO_MIME_TYPES[file.mimetype];
  if (!extension) throw new BadRequestException('Banner must be a PNG, JPEG, or SVG image');
  if (file.size > MAX_LOGO_SIZE_BYTES) throw new BadRequestException('Banner file must be 2MB or smaller');
  const blobPath = `careers-banners/${organizationId}-${Date.now()}${extension}`;
  const careersBannerPath = await this.blobStorage.upload(blobPath, file.buffer, file.mimetype);
  await this.prisma.organization.update({ where: { id: organizationId }, data: { careersBannerPath } });
  await this.audit.record(context, { actorUserId, action: 'organization.careers_banner_updated', entityType: 'organization', entityId: organizationId });
  return { bannerUrl: (await this.blobStorage.signIfOurs(careersBannerPath)) as string | null };
}
```
(If `ALLOWED_LOGO_MIME_TYPES`/`MAX_LOGO_SIZE_BYTES` are module-private, reuse them directly — they're in the same file; do not redefine.)

- [ ] **Step 4: Failing controller spec** — GET → service; PUT → service with the dto; POST banner → service (FileInterceptor); all three per-method `@RequirePermissions('org:manage_settings')` (Reflector assertions, mirroring the api-key/branding route assertions). Run `npx jest organizations.controller` → FAIL.

- [ ] **Step 5: Routes** in `organizations.controller.ts` (mirror the branding logo route for the banner):
```ts
@Get('careers')
@RequirePermissions('org:manage_settings')
getCareers(@CurrentTenant() tenant: TenantContext) { return this.organizationsService.getCareers(tenant); }

@Put('careers')
@RequirePermissions('org:manage_settings')
setCareers(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @Body() dto: UpdateCareersDto) {
  return this.organizationsService.setCareers(tenant, userId, dto);
}

@Post('careers/banner')
@RequirePermissions('org:manage_settings')
@UseInterceptors(FileInterceptor('file'))
uploadCareersBanner(@CurrentTenant() tenant: TenantContext, @CurrentUserId() userId: string, @UploadedFile() file: Express.Multer.File) {
  return this.organizationsService.uploadCareersBanner(tenant, userId, file);
}
```

- [ ] **Step 6: Tests + tsc + commit.** `npx jest organizations` (apps/api) + `npx tsc --noEmit`.
```bash
git add apps/api/src/organizations
git commit -m "feat(careers): GET/PUT /organizations/careers + banner upload gated org:manage_settings"
```

---

### Task 4: Per-job `listOnCareers` flag

**Files:**
- Modify: `apps/api/src/pipeline/dto/update-job.dto.ts` (add `listOnCareers?`)
- Modify: `apps/api/src/pipeline/pipeline.service.ts` (job-update path, alongside `publicApplyEnabled` ~L412)
- Test: `apps/api/src/pipeline/pipeline.service.spec.ts`

**Interfaces:**
- Consumes: `Job.listOnCareers` (T1).
- Produces: `UpdateJobDto.listOnCareers?: boolean`; the job-update path persists it.

- [ ] **Step 1: DTO.** Add to `UpdateJobDto`: `@IsOptional() @IsBoolean() listOnCareers?: boolean;`.

- [ ] **Step 2: Failing test** in `pipeline.service.spec.ts`: updating a job with `{ listOnCareers: true }` writes `data.listOnCareers = true`; a request without the field leaves it untouched (no `listOnCareers` key in the update data).

- [ ] **Step 3: Implement** — in the job-update method, after the `publicApplyEnabled` block:
```ts
if (dto.listOnCareers !== undefined) {
  data.listOnCareers = dto.listOnCareers;
}
```
(No cross-field validation: a job flagged for careers but not open/public is simply filtered out by `getCareers` server-side; the web UI hints at this in T6.)

- [ ] **Step 4: Tests + tsc + commit.** `npx jest pipeline` (apps/api) + `npx tsc --noEmit`.
```bash
git add apps/api/src/pipeline
git commit -m "feat(careers): per-job listOnCareers flag on job update"
```

---

### Task 5: Web — public SSR careers page

**Files:**
- Create: `apps/web/app/careers/[orgSlug]/page.tsx` (SSR server component)
- Create: `apps/web/app/careers/[orgSlug]/CareersJobList.tsx` (client filter subcomponent)
- Modify: `apps/web/lib/types.ts` (add `CareersPageResponse`, types-only)
- Test: `apps/web/app/careers/[orgSlug]/careers-page.test.tsx` (or a CareersJobList test)

**Interfaces:**
- Consumes: `GET /public/careers/:orgSlug` (T2) → `CareersPageResponse`.

- [ ] **Step 1: Type** in `types.ts` — `CareersPageResponse` matching T2's response EXACTLY (field names verbatim; `jobs[]` as specified).

- [ ] **Step 2: Page** `careers/[orgSlug]/page.tsx` — a server component (mirror the public patterns in `/walk-in/[orgSlug]` + `/apply/[applyToken]`):
  - Fetch `${API_BASE}/public/careers/${orgSlug}` with raw `fetch` (NOT the authed api-client). On a 404 response → render the not-found state ("This careers page isn't available"). Do not throw.
  - Render: a banner hero (`bannerUrl` as the background/image when present) with the org logo + `headline` (fallback to a sensible default like `${orgName} — Open roles` when headline null) + `intro` (as escaped paragraphs; split on newlines). Theme via inline CSS variables from `primaryColor`/`accentColor`/`textColor`.
  - Render `<CareersJobList jobs={data.jobs} />` (client component) for the filterable list.
  - `generateMetadata({ params })`: fetch (or reuse) the page data and set `<title>` = `Careers — ${orgName}` + a description; on 404 return a generic title.
  - Inject a `JobPosting` JSON-LD `<script type="application/ld+json">` per role (title, hiringOrganization=orgName, jobLocation from `location`, employmentType, baseSalary from salaryMin/Max/Currency when present, url=`${SITE}/apply/${applyToken}`). Mirror the apply page's JSON-LD approach.

- [ ] **Step 3: Client list** `CareersJobList.tsx` — `'use client'`; renders the job cards (title, location, employmentType, department, salary range) each linking to `/apply/${applyToken}`; two filter controls (department, location) derived from the distinct values in `jobs`, filtering the rendered list client-side; an empty state ("No open roles right now") when `jobs` is empty or filters match nothing. Deep-import any ui primitive; do not import the ui-v2 barrel; no `@exam-platform/shared` value import.

- [ ] **Step 4: Failing test** first (`careers-page.test.tsx` / CareersJobList test): renders job cards from a mocked payload; department/location filters narrow the list; empty state shows when no jobs. Run `npx jest careers` (apps/web).

- [ ] **Step 5: Run tests + tsc + commit.** `npx jest careers` (apps/web); web suite (note only the known pre-existing ImpersonationBanner failure); `npx tsc -p apps/web/tsconfig.json --noEmit` (ignore pre-existing stale `.next/types` noise; no NEW errors).
```bash
git add apps/web/app/careers apps/web/lib/types.ts
git commit -m "feat(careers): public SSR careers page with filters + JobPosting JSON-LD"
```

---

### Task 6: Web — careers settings page + per-job toggle + nav

**Files:**
- Create: `apps/web/lib/hooks/useCareersSettings.ts`
- Create: `apps/web/app/v2/(org-admin)/settings/careers/page.tsx`
- Modify: `apps/web/lib/super-admin-nav.ts` + `apps/web/lib/staff-nav.ts` (nav entry)
- Modify: the job edit UI where the `publicApplyEnabled` toggle lives (add "List on careers" checkbox) — locate via `grep -rl publicApplyEnabled apps/web` (likely a jobs form/drawer + its hook `useJobs`/`usePipeline`); modify the update payload to carry `listOnCareers`.
- Test: settings page test + (if practical) the job-form toggle test

**Interfaces:**
- Consumes: `GET/PUT /organizations/careers` + `POST /organizations/careers/banner` (T3); `UpdateJobDto.listOnCareers` (T4).

- [ ] **Step 1: Hook** `useCareersSettings.ts` — mirror an existing authed settings hook (e.g. `useIntegrations`/branding): `useCareersSettings()` GETs `/organizations/careers`; a mutation PUTs `{ enabled, headline, intro }` (invalidate on success); a banner-upload mutation POSTs multipart to `/organizations/careers/banner` (mirror the branding logo upload call).

- [ ] **Step 2: Failing settings test** — renders current config (enable toggle, headline, intro, current banner), Save fires PUT with the values, banner upload fires POST. Run `npx jest careers` (apps/web).

- [ ] **Step 3: Settings page** `/v2/(org-admin)/settings/careers/page.tsx` (mirror the branding settings page shell): enable toggle, headline input, intro textarea, banner upload (reuse the logo-upload UI pattern), and a link to the public `/careers/:orgSlug` (using the org slug from existing session/branding data). Gated to the org_admin route group. No `@exam-platform/shared` value import; deep-import ui.

- [ ] **Step 4: Nav.** Add a "Careers site" entry to `super-admin-nav.ts` (icon) + `staff-nav.ts` `V2_ROUTES` (`/settings/careers`), mirroring the other settings entries.

- [ ] **Step 5: Per-job toggle.** In the job edit form/drawer, add a "List on careers" checkbox next to the public-apply toggle; include `listOnCareers` in the job update payload. When checked but the job isn't open+public, show an inline hint ("Also needs public apply + an open status to appear"). Extend the job form test if one exists.

- [ ] **Step 6: Run tests + tsc + commit.** `npx jest careers jobs` (apps/web); web suite (note only the pre-existing ImpersonationBanner failure); `npx tsc -p apps/web/tsconfig.json --noEmit` (no NEW errors).
```bash
git add apps/web/lib apps/web/app/v2/'(org-admin)'/settings/careers apps/web/lib/super-admin-nav.ts apps/web/lib/staff-nav.ts
# plus the job-form files touched in Step 5
git commit -m "feat(careers): careers settings page + per-job list toggle + nav"
```

---

## Self-Review

**Spec coverage:** columns (T1) ✓; public `GET /public/careers/:orgSlug` with branding + listed-jobs filter + 404-when-disabled (T2) ✓; config GET/PUT + banner upload gated org:manage_settings (T3) ✓; per-job `listOnCareers` (T4) ✓; public SSR page with filters + JobPosting JSON-LD + 404 state (T5) ✓; settings page + per-job toggle + nav (T6) ✓. Off-by-default enforced by the `careersEnabled`/`listOnCareers` defaults (T1) + the `getCareers` filter (T2).

**Placeholder scan:** No TBD. T6 Step 5 says "locate via grep" for the job-form file (concrete command) rather than guessing a path that may have moved. Banner reuses the logo mime/size constants (named), not new magic numbers. JSON-LD fields enumerated.

**Type/name consistency:** `listOnCareers`, `careersEnabled`, `careersHeadline`, `careersIntro`, `careersBannerPath` spelled identically across T1 schema, T2/T3 services, T4 dto, T5/T6 web. `CareersPageResponse` (T2) ↔ web type (T5) identical. `CareersSettingsResponse` (T3) ↔ hook (T6). Migration `20260908220000` > parked `210000/210001`. Route segments (`careers/:orgSlug` public vs `careers` config) don't collide (different controllers/prefixes).

**Load-bearing risks:** (a) public route must stay unauthenticated + resolve via LOOKUP_ORG forTenant (jobs is RLS) — T2 uses exactly that; (b) `getCareers` must filter on ALL of open+publicApplyEnabled+listOnCareers+applyToken so a merely-flagged job never leaks — T2 tests the exclusion; (c) 404 when `careersEnabled` false — T2 tests it, T5 renders it; (d) banner upload validated like the logo (no arbitrary file types) — T3 tests the non-image rejection.
