# Vendor/Agency Portal (Zoho #20) — Design

**Status:** approved in chat 2026-09-08. Ready for implementation planning.

## Goal

Let an org invite external staffing agencies to submit candidates against
specific open jobs, through a passwordless magic-link portal, with every
submission landing in a recruiter review queue before it enters the pipeline.
Submitted candidates carry the agency as their source for attribution.

## Why

Adopt candidate from `docs/ats/zoho-adopt-inventory.md` #20 (vendor/agency
portal) — the last genuinely-unbuilt collaboration surface. Agencies are a
real sourcing channel; today an org has no way to give an external agency
scoped, credential-free access to submit candidates, and no gate to keep an
external party from writing straight into the pipeline.

## Design decisions (settled in brainstorming)

1. **Job scope:** an agency can submit only against jobs explicitly assigned
   to it (a per-agency job allowlist an admin manages), and only while those
   jobs are open. Not "all open jobs" — an external party should not see the
   org's entire open-req list.
2. **Submission flow:** review gate. A submission lands as `pending`; a
   recruiter accepts (→ candidate + pipeline entry) or rejects. External
   agencies never write directly into the pipeline.
3. **Duplicates:** a submission whose email already exists in the org is
   accepted but flagged `isDuplicate`; the recruiter decides. On accept, a
   duplicate attaches to the existing candidate rather than creating a new
   one. Not blocked — blocking would leak which emails are already in the
   system (enumeration oracle).

## Auth model

Each agency has an opaque `portalToken` (`randomUUID`, `@unique`) — the same
passwordless magic-link pattern as `Candidate.portalToken`. The agency portal
is a **Next public page at `FRONTEND_URL/agency/:token`** (like `/apply/:t`
and `/offer/:t`), so the admin-facing "copy portal link" URL is built from
`FRONTEND_URL` — NOT `API_ORIGIN`. (This is the inverse of the job-boards
feed, which is an API route under `/api/v1` and therefore uses `API_ORIGIN`.
The distinction: a Next page → `FRONTEND_URL`; an API-served endpoint →
`API_ORIGIN` + `/api/v1`.)

An agency with `active = false` is a kill switch: its portal returns 404 and
it accepts no submissions, without deleting history.

## Schema — 3 new tenant tables (all RLS)

All three are tenant tables (`organizationId`) and each needs a paired `_rls`
migration, following the `org_sender_addresses_rls` shape.

```prisma
model Agency {
  id             String             @id @default(uuid()) @db.UniqueIdentifier
  organizationId String             @map("organization_id") @db.UniqueIdentifier
  name           String             @db.NVarChar(200)
  contactEmail   String?            @map("contact_email")
  portalToken    String             @unique @map("portal_token")
  active         Boolean            @default(true)
  createdAt      DateTime           @default(now()) @map("created_at")
  updatedAt      DateTime           @updatedAt @map("updated_at")
  agencyJobs     AgencyJob[]
  submissions    AgencySubmission[]

  @@unique([organizationId, name])
  @@index([organizationId])
  @@map("agencies")
}

model AgencyJob {
  agencyId       String   @map("agency_id") @db.UniqueIdentifier
  jobId          String   @map("job_id") @db.UniqueIdentifier
  organizationId String   @map("organization_id") @db.UniqueIdentifier
  createdAt      DateTime @default(now()) @map("created_at")
  agency         Agency   @relation(fields: [agencyId], references: [id], onDelete: Cascade, onUpdate: NoAction)
  job            Job      @relation(fields: [jobId], references: [id], onDelete: Cascade, onUpdate: NoAction)

  @@id([agencyId, jobId])
  @@index([jobId])
  @@index([organizationId])
  @@map("agency_jobs")
}

model AgencySubmission {
  id             String    @id @default(uuid()) @db.UniqueIdentifier
  organizationId String    @map("organization_id") @db.UniqueIdentifier
  agencyId       String    @map("agency_id") @db.UniqueIdentifier
  jobId          String    @map("job_id") @db.UniqueIdentifier
  candidateName  String    @map("candidate_name")
  candidateEmail String    @map("candidate_email")
  candidatePhone String?   @map("candidate_phone")
  resumePath     String    @map("resume_path")
  isDuplicate    Boolean   @default(false) @map("is_duplicate")
  status         String    @default("pending") // 'pending' | 'accepted' | 'rejected'
  candidateId    String?   @map("candidate_id") @db.UniqueIdentifier
  reviewedByUserId String? @map("reviewed_by_user_id") @db.UniqueIdentifier
  reviewedAt     DateTime? @map("reviewed_at")
  createdAt      DateTime  @default(now()) @map("created_at")
  agency         Agency    @relation(fields: [agencyId], references: [id], onDelete: Cascade, onUpdate: NoAction)
  job            Job       @relation(fields: [jobId], references: [id], onDelete: Cascade, onUpdate: NoAction)

  @@index([organizationId, status])
  @@index([agencyId])
  @@map("agency_submissions")
}
```

Back-relations on `Job`: `agencyJobs AgencyJob[]` and
`agencySubmissions AgencySubmission[]`.

`AgencySubmission.candidateId` is deliberately NOT a FK relation to
`Candidate` — it is a soft pointer set on accept, and a FK would complicate
candidate soft-delete/purge. It stores the accepted candidate's id for
traceability only.

**Attribution:** no new `Candidate` column. Accept sets `Candidate.source =
'agency'` (the existing free-text source string, default `'invited'`), and the
`AgencySubmission` row carries the specific `agencyId` + `jobId` — that row is
the per-agency attribution record.

**Migrations:** `20260908250000_agency_portal` (3 tables) +
`20260908250001_agency_portal_rls` (RLS on all 3). Numbered after the parked
job-boards `240000/240001` to keep the chain linear across unmerged siblings.
No seed. New empty tables → RLS is safe to apply anytime.

## Public portal endpoints (unauthenticated)

Live in a new `agency-portal` public module. Both resolve the agency by token
via `TenantPrismaService.forTenant({ organizationId: LOOKUP_ORG,
isSuperAdmin: true }, ...)` — the portal-token public-read bypass idiom
(`LOOKUP_ORG = '00000000-0000-0000-0000-000000000000'`) used by careers and
job-boards. Both are throttled with the public-applications throttler guard.
An unknown token OR an `active = false` agency → `NotFoundException` (no
oracle distinguishing the two).

### `GET /public/agency-portal/:token`

Returns:
- agency `name`
- assigned **open** jobs: `AgencyJob` rows for this agency joined to `Job`
  where `status = 'open'` — `{ jobId, title, location, department }`
- this agency's own submission history:
  `{ id, jobId, jobTitle, candidateName, status, isDuplicate, createdAt }`,
  newest first (only this agency's rows — never another agency's).

### `POST /public/agency-portal/:token/submissions`

Body: `{ jobId: string, name: string, email: string, phone?: string,
resumeBase64: string }`.

- `jobId` must be in this agency's `AgencyJob` allowlist AND the job must be
  `status = 'open'` — else `BadRequestException` (a job not assigned to this
  agency is indistinguishable from a nonexistent one to the caller).
- Résumé: decode base64, `validatePdfUpload(buf)` (reuse from public-apply;
  5 MB cap, PDF-only), then `blobStorage.upload(...)` **outside** the tenant
  tx (blob I/O in a tx holds it open — the established ADO #6810 rule).
- `isDuplicate` = a candidate with this `organizationId` + `email` already
  exists (checked inside the tenant tx).
- Create the `AgencySubmission` (`status = 'pending'`). No candidate/pipeline
  write yet.
- Returns `{ id, isDuplicate }`.

Email/name are stored verbatim on the submission (not upserted onto any
candidate) until a recruiter accepts — so an external party cannot tamper
with an existing candidate's stored details by submitting under their email.

## Recruiter / admin endpoints (authenticated)

### Agency CRUD — gated `org:manage_settings` (per-method)

Config surface, same gate as job-boards / careers config.

- `GET /agencies` → list `{ id, name, contactEmail, active, portalUrl,
  assignedJobCount, pendingSubmissionCount }`. `portalUrl` =
  `${FRONTEND_URL}/agency/${portalToken}` (guarded fallback to localhost like
  the offers/careers idiom — FRONTEND_URL, not API_ORIGIN).
- `POST /agencies` → `{ name, contactEmail?, active?, jobIds?: string[] }`.
  Mints `portalToken = randomUUID()`. Dup name → 409. `jobIds` sets the
  allowlist (replace-set, same-org validated — see below).
- `PATCH /agencies/:id` → update name / contactEmail / active / jobIds
  (any subset; omit = untouched). Blank-name-on-rename guarded.
- `POST /agencies/:id/regenerate-token` → new `portalToken` (rotates the
  link, invalidating the old one). Returns the new `portalUrl`.
- `DELETE /agencies/:id` → **409 if any submissions reference it** (preserve
  attribution history); otherwise deletes (cascades `AgencyJob`). No cascade
  to submissions.

**Job allowlist replace-set** (mirrors job-boards `jobBoardIds`): validate
every `jobId` is a same-org job via `forTenant` (`tx.job.findMany({ where: {
id: { in }, organizationId } })` — count mismatch → `BadRequestException`,
rolls back the whole tx, no partial persist); reconcile `AgencyJob` rows
(delete-missing + create-new, each with `organizationId`); empty array =
clear all, omit = untouched.

Audit `agency.created` / `agency.updated` / `agency.deleted` /
`agency.token_regenerated`.

### Submission review — gated `pipeline:manage` (per-method)

It mutates the pipeline, so it uses the pipeline gate, not the settings gate.

- `GET /agency-submissions?status=pending|accepted|rejected` (default
  `pending`) → `{ id, agencyId, agencyName, jobId, jobTitle, candidateName,
  candidateEmail, candidatePhone, isDuplicate, status, resumeUrl, createdAt }`,
  newest first. `resumeUrl` via the same résumé-download mechanism recruiters
  already use for candidate profiles (reuse, do not invent).
- `POST /agency-submissions/:id/accept` — only from `pending`, else 409.
  In one `forTenant` tx:
  - Upsert candidate by `organizationId_email` — exactly the `apply()` rule:
    an existing candidate's name/phone is NOT overwritten from the submission
    (`expandedName` narrow exception only), and the `update` branch clears
    `deletedAt`/`deletedByUserId` to resurrect a soft-deleted row. `create`
    branch sets `source: 'agency'`, `portalToken: randomUUID()`.
  - Upsert `CandidateProfile` with the submission's `resumePath` (reuse the
    résumé; do not re-upload). Reset parse fields so it gets re-parsed
    (same as apply's re-apply reset).
  - Create a pipeline entry on the job's pipeline first active-category stage
    first status (the shared `addEntry` placement rule) — **idempotent**: if
    the candidate already has an entry on this job, do not create a second.
  - Set submission `status = 'accepted'`, `candidateId`, `reviewedByUserId`,
    `reviewedAt`.
  - Audit `agency_submission.accepted`.
- `POST /agency-submissions/:id/reject` — only from `pending`, else 409.
  Sets `status = 'rejected'`, `reviewedByUserId`, `reviewedAt`. Audit
  `agency_submission.rejected`. (Résumé blob left in place — cheap; no
  cleanup job in scope.)

## Web

Authenticated surfaces use `apiFetch`; the public portal page uses raw
`fetch(API_BASE)` (candidate-page convention). No runtime import of
`@exam-platform/shared` VALUES (types-only OK). No `ui-v2` barrel imports in
new files (deep-import components).

- **Settings → Agencies** (`/v2/settings/agencies`): list (name, assigned-job
  count, pending-submission count, active badge, copy portal URL); create /
  edit dialog (name, contactEmail, active toggle, assigned-jobs multi-select
  reusing the job-boards selector shape); regenerate-token action (with a
  "the old link stops working" confirm); delete (surfaces the 409).
  `useAgencies` hook mirrors `useJobBoards` / `useOrgSenderAddresses`.
- **Agency submissions queue** (`/v2/agency-submissions`): pending list with
  agency / job / candidate / duplicate badge / résumé link / Accept / Reject.
  Nav entry.
- **Public agency portal** (`/agency/[token]` Next page): agency name,
  assigned open jobs, a submit form (job picker, name, email, phone, résumé
  upload → base64), and the agency's submission history with statuses. Raw
  `fetch`. Inactive/unknown token → a generic "portal not available" state
  (the API returns 404).

Nav: settings link in the settings/admin nav; submissions-queue link in the
recruiter nav.

## Out of scope (deliberate)

- Agency users/accounts, roles, or multiple contacts per agency (single
  magic link per agency).
- Agency-side status notifications / emails (they see status in the portal).
- Résumé-blob cleanup on reject (leave in place).
- Per-agency analytics/reporting dashboards (the submission rows carry the
  data; a report surface is a fast-follow).
- SMS/WhatsApp to agencies (#16/#24, separate features).

## Testing focus

- **Leak/isolation:** the portal GET returns only this agency's jobs and only
  this agency's submissions; a job not in the allowlist cannot be submitted
  against; another org's jobs never resolve. Mutation-test the allowlist
  filter (drop the condition → a test must fail).
- **Anti-oracle:** unknown token and inactive agency both 404 identically.
- **Review gate:** a submission creates no candidate/pipeline row until
  accept; reject creates none ever.
- **Duplicate:** submit with an existing email → `isDuplicate = true`; accept
  attaches to the existing candidate (no second candidate row) and is
  idempotent on the pipeline entry.
- **Soft-delete resurrection** on accept matches `apply()`.
- **Delete guard:** delete-while-submissions → 409.
- **Cross-org allowlist:** assigning another org's jobId → BadRequest, tx
  rolled back.

## Global constraints

- Multi-tenant: all agency-table reads/writes via `TenantPrismaService.
  forTenant` (raw `PrismaService` on an RLS table returns 0 rows silently).
- `PermissionsGuard` is handler-only → `@RequirePermissions` per method.
- New tenant table ⇒ paired `_rls` migration. Migrations numbered
  `250000/250001`, after parked siblings.
- No new npm dependency. No `npm install` in the worktree.
- Public API-served URLs use `API_ORIGIN + /api/v1`; Next-page URLs (this
  portal) use `FRONTEND_URL`.
- Web cannot import `@exam-platform/shared` values at runtime.
- Do not weaken existing authorization anywhere.
