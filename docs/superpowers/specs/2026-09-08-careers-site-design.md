# Themeable Careers Site (Zoho #14) — Design

**Date:** 2026-09-08
**Status:** Approved (design), pending spec review
**Zoho adopt:** #14 (Career Website). The embeddable per-job apply webform is already BUILT (`Job.applyToken`, `/apply/[applyToken]`) and there's a global Indeed-style XML feed (`getJobsFeed`). This closes the **themeable per-org careers site** gap — the `getJobsFeed` code even carries a `ponytail:` note: "if a per-org careers feed is ever needed, key it on a public org slug."
**Branch:** `feat/careers-site` (off origin/main @ `08ae024e`)

## Goal

Give each org a public, branded careers page at `/careers/:orgSlug` that lists the roles it chooses to feature, each linking to the existing apply flow. Org-admin controls whether the page is live, its headline/intro/banner, and which jobs appear. Additive and behavior-preserving: no careers page exists for any org until it opts in.

## Scope

**In:** a per-job `listOnCareers` flag; org careers config (`careersEnabled`, `careersHeadline`, `careersIntro`, `careersBannerPath`); a public `GET /public/careers/:orgSlug` endpoint; config GET/PUT + banner upload on the organizations surface; the public SSR careers page (branded, filterable, JobPosting JSON-LD); an org-admin careers settings page + nav; a per-job "List on careers" toggle.

**Out (deferred / not this slice):**
- Custom domains / vanity careers URLs (the page lives at `/careers/:orgSlug` on the app domain).
- Rich WYSIWYG/CMS content blocks — `careersIntro` is plain text (rendered as escaped paragraphs), not HTML.
- Per-job long-description theming beyond what the apply page already renders (careers cards show summary fields; the full description lives on the apply page).
- Application analytics for the careers page (source tracking) — out of scope; the existing apply pipeline is unchanged.
- Multiple banner images / galleries — one banner per org.

## Decisions (rulings baked in)

1. **Explicit opt-in `careersEnabled`** (default false). The public page 404s unless the org exists AND `careersEnabled` is true — so nothing becomes public implicitly. Behavior-preserving.
2. **Separate per-job `listOnCareers`** (default false), distinct from `publicApplyEnabled`. A job must be BOTH publicly applyable AND flagged for careers to appear — so an org can keep a public-apply job link-only (referral/hidden) while curating the careers page. Existing public-apply jobs are NOT auto-listed (default false).
3. **Careers customization:** `careersHeadline` (short string), `careersIntro` (NVarChar(Max), plain text), `careersBannerPath` (a hero image, uploaded and served exactly like the org logo — `blobStorage.upload` → path → `signIfOurs` SAS). Existing org logo + colors (`primaryColor`/`accentColor`/`textColor`) are reused for theming.
4. **Public resolution by slug** uses the portal-token model: `forTenant({ organizationId: LOOKUP_ORG, isSuperAdmin: true }, tx => …)` to look up the org by its unique `slug` and its listed jobs, RLS-bypassed because the careers page is public by construction (mirrors `getJobsFeed` / `resolveJob`). No auth on the public route.
5. **Listing UX:** a single SSR list filterable client-side by **department** and **location**; each card shows title/location/employmentType/department/salary range and links to `/apply/:applyToken`. **SEO:** server-rendered with page title/meta + a **JobPosting JSON-LD** block per role (mirrors the apply page's JSON-LD; good for Google Jobs).
6. **Config gating:** careers config routes are per-method `@RequirePermissions('org:manage_settings')` (same as branding/api-key). The per-job `listOnCareers` flag is set through the existing job-update path, under its existing gate.
7. Additive columns on `jobs` + `organizations` (both already tenant-RLS) → **no `_rls` migration, no seed.** Migration `20260908220000_careers_site` — deliberately numbered AFTER the parked `feat/api-usage-metering` migrations (`20260908210000/210001`) to avoid a filename collision when both branches eventually merge.

## Architecture

### Schema (additive)

```prisma
// model Job
listOnCareers Boolean @default(false) @map("list_on_careers")

// model Organization
careersEnabled    Boolean @default(false) @map("careers_enabled")
careersHeadline   String? @map("careers_headline")
careersIntro      String? @map("careers_intro") @db.NVarChar(Max)
careersBannerPath String? @map("careers_banner_path")
```
Migration `20260908220000_careers_site`: `ALTER TABLE [dbo].[jobs] ADD [list_on_careers] BIT NOT NULL CONSTRAINT [DF_jobs_list_on_careers] DEFAULT 0;` + `ALTER TABLE [dbo].[organizations] ADD [careers_enabled] BIT NOT NULL CONSTRAINT [DF_organizations_careers_enabled] DEFAULT 0, [careers_headline] NVARCHAR(1000) NULL, [careers_intro] NVARCHAR(MAX) NULL, [careers_banner_path] NVARCHAR(1000) NULL;`. No `_rls` (both tables already carry the tenant policy). No seed. **Number must be > the parked api-usage `210000/210001`.**

### API — public careers endpoint

`PublicApplicationsService.getCareers(orgSlug)` (careers lives naturally alongside `getPublicJob`/`getJobsFeed`):
- Resolve the org by slug via `forTenant({ organizationId: LOOKUP_ORG, isSuperAdmin: true }, tx => tx.organization.findFirst({ where: { slug: orgSlug } }))` selecting `id, name, careersEnabled, careersHeadline, careersIntro, careersBannerPath, logoPath, primaryColor, accentColor, textColor`.
- If not found OR `!careersEnabled` → `NotFoundException` (the public page renders its 404).
- List jobs: `tx.job.findMany({ where: { organizationId: org.id, status: 'open', publicApplyEnabled: true, listOnCareers: true, applyToken: { not: null } }, select: { applyToken, title, location, employmentType, department, salaryMin, salaryMax, salaryCurrency, createdAt }, orderBy: { createdAt: 'desc' } })`.
- Return `{ orgName, headline, intro, logoUrl (signIfOurs), bannerUrl (signIfOurs), primaryColor, accentColor, textColor, jobs: [...] }`.
- Controller `GET /public/careers/:orgSlug` on the existing public-applications controller (unauthenticated by absence of JwtAuthGuard, same class throttle as the other public routes).

### API — careers config (org admin)

On `OrganizationsController` (mirror the branding endpoints), per-method `@RequirePermissions('org:manage_settings')`:
- `GET /organizations/careers` → `OrganizationsService.getCareers(context)` → `{ enabled, headline, intro, bannerUrl (signIfOurs) }`.
- `PUT /organizations/careers` body `UpdateCareersDto { enabled: boolean; headline?: string | null; intro?: string | null }` → normalize empty/whitespace headline/intro → null; persist; audit `organization.careers_updated`. Tenant-scoped.
- `POST /organizations/careers/banner` — `@UseInterceptors(FileInterceptor('file'))`, mirror `uploadLogo` exactly (validate it's an image, `blobStorage.upload(blobPath, file.buffer, file.mimetype)` → set `careersBannerPath`), returns `{ bannerUrl }`. (Banner delete can reuse PUT/careers clearing the path later; a dedicated delete is out of scope for v1 unless trivial.)

### API — per-job listOnCareers

- `UpdateJobDto` gains `@IsOptional() @IsBoolean() listOnCareers?: boolean`.
- The job-update path (`PipelineService` job patch, where `publicApplyEnabled` is handled ~L412) sets `data.listOnCareers` when provided. Same permission gate as the rest of job editing. (No extra validation coupling required; a job listed on careers but not public simply won't appear because `getCareers` filters on `publicApplyEnabled` too — the careers UI should surface that, see Web.)

### Web

- **Public page** `apps/web/app/careers/[orgSlug]/page.tsx` — SSR (server component) fetching `GET /public/careers/:orgSlug` via raw `fetch(API_BASE)` (NOT the authed api-client; mirrors `/walk-in/[orgSlug]`). On 404 → render the not-found state. Renders: banner hero (bannerUrl) + org logo + headline + intro (escaped paragraphs); a client subcomponent with the job list + department/location filter controls; each card links to `/apply/:applyToken`. Theme the page with the org colors via inline CSS variables. `generateMetadata` sets the page `<title>`/description; inject a `JobPosting` JSON-LD `<script type="application/ld+json">` per role. No `@exam-platform/shared` runtime VALUE import.
- **Settings page** `apps/web/app/v2/(org-admin)/settings/careers/page.tsx` + `useCareersSettings` hook (authed apiFetch GET/PUT + banner upload): enable toggle, headline input, intro textarea, banner upload (mirror the branding page's logo upload), and a link/preview to the public `/careers/:orgSlug`. Nav: super-admin-nav entry (icon) + staff-nav V2_ROUTES.
- **Per-job toggle:** add a "List on careers" checkbox next to the existing "public apply" toggle in the job edit UI; when on but the job isn't public, show a hint that it also needs public apply to appear.

## Data flow

1. Org admin enables careers, sets headline/intro, uploads a banner, and toggles "List on careers" on chosen open+public jobs.
2. A visitor opens `/careers/acme` → SSR fetches `GET /public/careers/acme` → branded page with the listed roles + JSON-LD.
3. Visitor clicks a role → existing `/apply/:applyToken` flow (unchanged).
4. Org with `careersEnabled=false` (or unknown slug) → `/careers/:slug` renders the 404 state; the API returns 404.

## Error handling

- Unknown slug or `careersEnabled=false` → `NotFoundException` → the page's not-found UI. Never leak whether the org exists beyond the public branding already exposed elsewhere.
- Banner upload: reject non-image / oversized files (mirror `uploadLogo`'s validation), 400 on invalid.
- Empty/whitespace headline or intro on PUT → normalized to null.
- A job with `listOnCareers=true` but not `publicApplyEnabled`/open → simply absent from the feed (filtered server-side); the config UI hints at this rather than erroring.

## Testing

- **Schema:** columns applied; `list_on_careers` + `careers_enabled` default 0; no `_rls`.
- **getCareers():** enabled org returns branding + only (open + publicApplyEnabled + listOnCareers + applyToken) jobs; disabled/unknown org → 404; logoUrl/bannerUrl signed; no other org's jobs (tenant/slug scoped); a listOnCareers-but-not-public job is excluded.
- **Config:** GET shape; PUT persists + normalizes empty→null + audit + gated org:manage_settings (Reflector); banner upload stores path + returns signed url + rejects non-image; gated.
- **Per-job flag:** UpdateJobDto accepts listOnCareers; job-update persists it; unrelated job fields unaffected.
- **Web:** public page renders banner/headline/intro + job cards + filters (department/location) + JSON-LD; 404 state when disabled; settings page saves config + uploads banner; per-job toggle sends listOnCareers.
- Full api + web jest green; tsc clean.

## Deploy notes

- One additive migration (`jobs` +1 col, `organizations` +4 cols), no `_rls`, no seed. Behavior-preserving: `careersEnabled`/`listOnCareers` default false → no public careers page and no listed jobs until an org opts in; existing apply flow + job feed unchanged. Ships with any api build; web needs any web build. **Migration number `20260908220000` must remain greater than the parked api-usage `210000/210001`** so the chain stays linear when both merge. (Prod deploy deferred until all dev done — standing decision.)
