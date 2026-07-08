# Phase 3a — White-Label Branding Design Spec

**Status:** Approved, ready for implementation planning.
**Date:** 2026-07-09
**Depends on:** Phase 0 (Foundation), Phase 1 (Core Exam MVP), Phase 2a-2c (Anti-Cheat, Live Monitoring, AI Proctoring) — all merged to `main`.

---

## 1. Context and Scope

This is the first sub-phase of Phase 3 ("White-Label & Scale") from the product roadmap (`docs/superpowers/specs/2026-07-07-online-mcq-exam-platform-design.md`, Section 15). Phase 3's full roadmap scope (org branding, custom domain + SSL automation, email domain verification, multi-region deployment, service isolation, load testing) spans multiple independent subsystems and is being split the same way Phase 1 (1a-1d) and Phase 2 (2a-2c) were:

3a. **White-Label Branding** (this spec)
3b. Exam Runtime Service Isolation
3c. Multi-Region Deployment & Scale

**Infrastructure gap driving this split:** this codebase has no cloud infrastructure at all as of Phase 2c — no Terraform, no CI/CD, no Dockerfile for deployment, no cloud provider account or config. Every phase through 2c has been local development against a Docker SQL Server instance. Custom domain routing, SSL automation (Cloudflare for SaaS), and email domain verification all inherently require a real cloud deployment target and DNS/Cloudflare account to integrate against and test meaningfully. Building them now would mean designing against infrastructure that doesn't exist and can't be verified. Org branding (logo + colors), by contrast, is achievable entirely within the current local-dev architecture — so this sub-phase scopes to branding only, with custom domains/SSL/email-verification deferred to a future sub-phase once real cloud infrastructure exists as a prerequisite.

**Goal of this sub-phase:** let an organization set a logo and two brand colors, visibly applied on the login page and dashboard — the first sub-phase in this project to touch the frontend beyond its Phase 0 skeleton.

### In scope

- `Organization` gains `logoPath`, `primaryColor`, `accentColor` — all nullable, so an org with nothing set keeps today's unstyled look
- Real file upload (via `multer`) for the logo, stored on local disk under the API server and served via a static route — the first file-upload/storage subsystem in this codebase
- Four endpoints: authenticated read/update of the caller's own org branding, a logo upload endpoint, and one deliberately **public** endpoint (`GET /organizations/by-slug/:slug/branding`) so the login page can theme itself before authentication
- Frontend: a new branding settings page, plus the existing login and dashboard pages rendering the logo and applying the colors

### Explicitly out of scope (deferred)

- **Custom domain + SSL automation (Cloudflare for SaaS)** and **email domain verification** — both require real cloud/DNS infrastructure that doesn't exist yet; deferred to a future sub-phase once that infrastructure is a prerequisite.
- **Cloud object storage (S3/Azure Blob/Cloudflare R2).** Local disk storage is used for now, matching this project's established "simplest thing that works for the current single-instance deployment" posture (e.g. Phase 2b's in-process presence timer, no Redis until multi-instance is real). Revisited when Phase 3c's multi-region work makes a shared store necessary — local disk would not survive across regions/instances.
- **Automated frontend tests.** No test tooling (Jest/RTL or otherwise) exists in `apps/web` as of Phase 2c — the frontend has been a manually-verified skeleton since Phase 0. This sub-phase follows that same precedent: full automated coverage on the API side, frontend pieces verified manually.
- **Per-organization theming beyond colors + logo** (fonts, layout, custom CSS) — not requested, would be scope creep.
- **Client-side role gating on the branding settings page.** The backend's `org:manage_settings` permission check is the actual enforcement; the frontend just surfaces a 403 as an error if an unauthorized user reaches the page.

---

## 2. Data Model

**`Organization` gains three nullable fields**, additive, no default needed:

```prisma
model Organization {
  // ...existing fields unchanged...
  logoPath     String? @map("logo_path")
  primaryColor String? @map("primary_color")
  accentColor  String? @map("accent_color")
}
```

`logoPath` stores a relative path (e.g. `logos/{orgId}.png`), not a full URL — the API resolves it to a servable URL at read time. This keeps the stored value portable if the storage backend changes later (e.g. to cloud object storage in a future phase) without a data migration. `primaryColor`/`accentColor` are hex color strings (e.g. `#1a73e8`), validated at the API boundary, not enforced by a DB constraint (consistent with how other string-typed fields in this schema, e.g. `status` enums, rely on application-level validation rather than DB check constraints).

No new table, no Row-Level Security change — these are plain columns on an already-RLS-protected table.

---

## 3. API Surface

An `OrganizationsController`/`OrganizationsService` already exists (`apps/api/src/organizations/`), currently handling only platform-level org creation (`POST /organizations`, gated on `platform:manage_organizations`). All four branding routes extend this same controller/service — the base path (`/organizations`) already fits, and there's no reason to introduce a sibling module for what is still fundamentally an organization-settings concern.

```
GET   /api/v1/organizations/branding              staff, authenticated -> the caller's own org's
                                                    current branding: { logoUrl: string | null,
                                                    primaryColor: string | null, accentColor: string | null }

PATCH /api/v1/organizations/branding              staff (org:manage_settings) -> body { primaryColor?,
                                                    accentColor? }, each validated as a hex color string
                                                    if present; updates only the fields provided

POST  /api/v1/organizations/branding/logo         staff (org:manage_settings), multipart/form-data ->
                                                    validates file type (PNG/JPEG/SVG only) and a 2MB size
                                                    limit via multer's fileFilter/limits; stores to
                                                    apps/api/uploads/logos/{orgId}.{ext} (overwriting any
                                                    prior logo for that org); updates Organization.logoPath;
                                                    returns the new { logoUrl }

GET   /api/v1/organizations/by-slug/:slug/branding  PUBLIC, unauthenticated -> { logoUrl, primaryColor,
                                                    accentColor } for the org with that slug, 404 if the
                                                    slug doesn't exist. Deliberately the one public endpoint
                                                    in this codebase — needed so the login page can theme
                                                    itself the moment someone types their org's slug, before
                                                    authentication. Exposes nothing beyond what a real
                                                    login page already shows visually (a logo, two colors) —
                                                    never email, user, or candidate data.
```

`logoUrl` in every response is derived from `logoPath` at read time (e.g. `${WEB_ORIGIN or API base}/uploads/${logoPath}`), never the raw stored path — so the storage layout can change without a client-visible contract change.

**`super_admin` edge case:** `org:manage_settings` is assigned to both `org_admin` and `super_admin` in the RBAC seed, but `super_admin` is platform-level — their JWT carries `organizationId: null` (confirmed in `CurrentTenant`, `apps/api/src/auth/current-tenant.decorator.ts`). Since these three authenticated routes act on "the caller's own organization," a `super_admin` calling them has no organization to act on. They get a `400 Bad Request` ("no organization context for this account") rather than a silent null-scoped query or a confusing 404 — the same failure mode any org-scoped endpoint would hit for a caller with no org, made explicit here since branding is the first endpoint in this codebase where a `super_admin`-permitted route can actually be called with no org context. Managing a *specific* other org's branding on a `super_admin`'s behalf is a distinct, unrequested feature and stays out of scope.

**Static file serving:** `@nestjs/serve-static` (new dependency) mounted at `/uploads`, pointing at the local uploads directory. The same "simplest thing that works for one instance" pattern already used elsewhere in this project.

---

## 4. Frontend Integration

- **New branding settings page** (`apps/web/app/settings/branding/page.tsx`): a plain form matching this frontend's existing minimal style (raw HTML elements, no design system) — a file input for the logo and two color inputs, prefilled from `GET /organizations/branding`. Color changes submit via `PATCH`; the logo submits via a separate multipart `POST`. No client-side role gating (see Section 1) — an unauthorized request's 403 is shown as a plain error, matching how the existing dashboard page surfaces fetch errors.
- **Login page theming** (`apps/web/app/login/page.tsx`): on the `organizationSlug` field's blur, fetch the public `GET /organizations/by-slug/:slug/branding`. If found, render the logo above the form and apply `primaryColor`/`accentColor` as inline styles on the heading and submit button. If the slug doesn't exist or has no branding set, silently keep today's unstyled look — never an error shown for this specific lookup.
- **Dashboard theming** (`apps/web/app/dashboard/page.tsx`): once authenticated, fetch the caller's own `GET /organizations/branding` and apply the same logo + color treatment to the dashboard header.

---

## 5. Testing Approach

- **Unit tests:** branding read/update validation (hex color format accepted/rejected, partial updates leave the other field untouched), logo upload validation (rejects non-image mimetypes, rejects files over the 2MB limit, accepts and correctly stores/overwrites a valid file), the public slug-lookup endpoint (returns branding for an existing slug, 404 for an unknown one, never leaks fields beyond `logoUrl`/`primaryColor`/`accentColor`).
- **Tenant isolation:** `GET`/`PATCH /organizations/branding` and the logo upload always act on the caller's own organization (derived from their JWT/tenant context), never a different org even if one were somehow specified — there is no org-id path parameter on the authenticated routes by design, exactly to remove that class of bug.
- **End-to-end:** a recruiter/org_admin logs in, uploads a logo, sets colors, confirms `GET /organizations/branding` reflects both; confirms the public slug-lookup endpoint returns the same branding without authentication; confirms an org with no branding set returns all-null fields and the public endpoint 404s for a nonexistent slug.
- **Frontend:** manually verified (see Section 1) — no automated frontend test suite exists in this codebase yet.

---

## 6. Open Items / Deferred to Future Sub-Phases

- Custom domain + SSL automation (Cloudflare for SaaS) — deferred until real cloud/DNS infrastructure exists as a prerequisite.
- Email domain verification — same infrastructure dependency.
- Cloud object storage for uploaded logos — revisited at Phase 3c (multi-region/scale), when local disk storage stops being viable across instances/regions.
- Per-organization theming beyond logo + two colors.
- Automated frontend testing infrastructure for `apps/web` — a cross-cutting gap not specific to this sub-phase.
