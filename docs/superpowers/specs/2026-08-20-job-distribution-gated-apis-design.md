# Integrations 2d (part 2) — Gated Job-Board Posting APIs — Design + Plan

Status: DESIGN ONLY. Direct posting to LinkedIn / Indeed (sponsored) / Naukri requires each board's **partner approval + a registered OAuth app / API key** — provisioning is outside our control, and none of it is testable end-to-end without those credentials. 2d-part-1 (un-gated: `JobPosting` JSON-LD → Google for Jobs + the `/public/jobs-feed.xml` aggregator feed) is MERGED and already distributes to the largest channels with zero approval.

## 1. Goal

Let an org publish a `Job` directly to a gated board (LinkedIn Jobs, Indeed sponsored, Naukri) from the recruiter UI, and reflect the posting's status back. This is a per-provider connector on the same OAuth + provider-abstraction base introduced for 2c (calendar).

## 2. What already exists (reused)

- `Job` model incl. `location` + `employmentType` (from 2d-part-1) — the fields these APIs require.
- `OrgSecretsCryptoService` — encrypt provider API keys / OAuth tokens at rest.
- The `/public/jobs-feed.xml` feed + JSON-LD — some "gated" boards (Indeed organic) actually ingest these, so a subset of distribution is already covered without an API.
- The OAuth flow + `state` util + provider abstraction from **2c-part-2** (`docs/.../2026-08-20-calendar-oauth-freebusy-design.md`) — the *same* machinery; this connector is a second consumer of it. Build 2c's OAuth base first, then this rides on it.
- `AuditService`, RLS pattern, per-tenant isolation.

## 3. Provider reality (why gated)

- **LinkedIn** — Job Posting via the Talent Solutions "Job Posting" API; requires LinkedIn partner approval + an OAuth app with the job-posting scopes. Hard-gated.
- **Indeed** — sponsored/API posting is gated (organic listing already covered by the feed/JSON-LD; no API needed for organic).
- **Naukri** — partner API, India; key-based, partner-gated.
- Each provider ships **dark** (routes 404 / UI hidden) until its credentials are configured — same "lights up per provider" pattern as 2c.

## 4. Data model

### `JobPosting` (external posting record) → `@@map("job_postings")`
- `id`, `organizationId` (RLS), `jobId` (FK → Job), `provider` (`'linkedin' | 'indeed' | 'naukri'`), `externalId` (the board's posting id), `status` (`'pending' | 'live' | 'rejected' | 'closed' | 'error'`), `externalUrl`, `lastError`, `postedByUserId`, `createdAt`/`updatedAt`. `@@unique([jobId, provider])` (one live posting per board per job).
- Provider **credentials** live on a per-org connection row (mirror 2c's `CalendarConnection`: `JobBoardConnection` per (org, provider) with encrypted token/key) — org-level, not per-user (posting is an org action).
- Additive migration + RLS on both tables.

## 5. Flow

- `POST /jobs/:jobId/distribute` (recruiter, `org:manage_settings` or a posting perm): body `{ provider }` → map the Job (title, description, location, employmentType, apply URL) to the provider's schema, call its post API with the org's stored credential, persist a `JobPosting` row with `externalId`/`externalUrl`, audit `job.posted`.
- `DELETE /jobs/:jobId/distribute/:provider` → close/expire the external posting, mark `closed`.
- Status refresh: a small poll (or the provider's webhook, where offered) updates `status`/`externalUrl`. MVP: on-demand refresh when the recruiter opens the job.
- Org connects a board under settings (OAuth or API-key paste) → `JobBoardConnection`, tokens encrypted.

## 6. Provider abstraction

`JobBoardProvider` interface (**≥2 impls → justified**): `post(job, credential) -> {externalId, externalUrl, status}`, `close(externalId, credential)`, `getStatus(externalId, credential)`. Impls: `LinkedInProvider`, `IndeedProvider`, `NaukriProvider`. HTTP to fixed vendor hosts (no SSRF surface); `redirect:'error'`.

## 7. Web UI

- Job detail page: a "Distribute" panel — per connected board, a Post/Remove button + live status + external link. Boards without a connection show a "connect in settings" hint.
- Org settings: a "Job boards" card to connect/disconnect each provider (OAuth or key), mirroring 2c's calendar card.

## 8. Security

- Credentials/tokens encrypted at rest, never returned to any client.
- OAuth `state` HMAC-bound (reuse 2c util); redirect-URI allowlist.
- Org isolation via RLS; posting perm-gated.
- Outbound only to constant vendor hosts.

## 9. Config (external dependency — the blocker)

Per provider: OAuth client id/secret or API key + any partner account id, from secure config. Unset → provider hidden + routes 404.

## 10. Plan (ordered; ~9 tasks, after 2c's OAuth base exists)
1. `JobPosting` + `JobBoardConnection` schema + RLS migrations.
2. `JobBoardProvider` interface + `LinkedInProvider` (post/close/status; HTTP mocked in tests).
3. `IndeedProvider`. 4. `NaukriProvider`.
5. `JobBoardConnectionsService` (encrypt creds, provider registry, per-org) — reuses 2c token/refresh where OAuth.
6. `JobDistributionService` + `POST/DELETE /jobs/:jobId/distribute` (+ audit).
7. Connect/callback controller (OAuth) or key-paste (Naukri/Indeed).
8. `JobBoardsModule` + `app.module` wiring; DI check.
9. Web: distribute panel on job detail + connect card in settings.
Verification gate: security review (creds-at-rest, isolation, perm-gating) + the manual per-provider smoke **once each board's partner approval + credentials land** — the only steps that can't pass in CI.

## 11. Explicitly out of scope
- Applicant sync back FROM the boards (candidates apply via our own public page/feed; boards deep-link to it).
- Sponsored-spend/budget management.
- Any provider whose partner approval we don't hold — build per-provider as approvals arrive.
