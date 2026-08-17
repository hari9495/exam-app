# Candidate Experience — Design Spec

**Date:** 2026-08-17
**Status:** Approved (design), pending implementation plan
**Feature:** Public job application form + résumé upload + AI parsing + tokenized status page (feature #2 of 4; attaches to the ATS-lite Jobs pipeline)

## Goal

Let candidates apply to a job themselves through a public form, upload a résumé
that is auto-parsed into a profile the recruiter sees, and check their
application status through a private link — without introducing candidate
accounts or an external parsing service.

## Context & anchoring decisions

The app already provides everything this needs except a PDF text extractor:

- **ATS pipeline (feature #1, live):** `Job`, `PipelineEntry` (single source of
  truth for stage, `@@unique([jobId,candidateId])`, `enteredVia` ∈
  `manual`|`exam`), `Candidate` (org-scoped, `@@unique([organizationId,email])`).
  This feature adds a **third entry point: `enteredVia='application'`**.
- **Per-org AI infrastructure** (`packages/shared/src/ai/*`, `ai-api-key-resolver`)
  already used by AI question-generation — reused for résumé parsing, so **no new
  external service**. Inert (résumé stored but unparsed) for an org with no AI key.
- **Blob storage** (`BlobStorageService.upload` + `signIfOurs` signed URLs) —
  reused for résumé files (private container).
- **`AiJob` + BullMQ** generic background-job infra — reused with a new
  `type: 'resume_parse'`.
- **Candidates have no accounts** — they reach the app only via invitation tokens
  (`/start?token=`). The status page follows the same tokenized, password-less
  pattern; **no candidate auth surface is added.**

**Decisions locked in brainstorming:**
1. Self-service = **tokenized status page** (no accounts).
2. Discovery = **per-job public link** + an explicit per-job **enable toggle**
   (default off). No careers page in v1.
3. Résumé = **PDF only**, **async parse** via `AiJob`, **candidate-level**
   `CandidateProfile` (latest upload wins). Accept the one new dep `pdf-parse`.
4. Parsing extracts **summary + skills + title + yearsExperience**; surfaced in
   the ATS `CandidateDrawer`.
5. Status page shows **friendly buckets** (never the raw internal stage), with
   softened terminal outcomes.

## Global constraints

- **No candidate accounts / no passwords.** Status access is a long random token
  only, read-only.
- **No new external service.** Résumé parsing reuses the per-org AI provider;
  degrades to `parseStatus='unavailable'` when the org has no AI key.
- **One new dependency:** `pdf-parse` (pure JS, no native build). No others.
- **Public endpoints are org-pinned from the job token** and run all writes inside
  that org's `forTenant` context (RLS). No authenticated user is involved; no
  cross-org write is possible.
- **Public endpoints return a generic 404** for unknown / closed / disabled jobs
  and unknown status tokens — no enumeration oracle.
- **Public uploads are guarded:** PDF magic-byte check + size cap (5 MB) at the
  endpoint before any write; extracted text truncated before the AI call.
- Résumé/profile is candidate-level, latest résumé wins (per-application résumés
  out of scope).
- All new tables org-scoped with RLS (the `candidates`/`exams` pattern; a schema
  migration + a separate RLS migration, because SQL Server cannot `ALTER SECURITY
  POLICY` against a table created in the same batch).

## Data model

All additive.

### `Job` (existing) — two new columns
| field | type | notes |
|---|---|---|
| publicApplyEnabled | Boolean @default(false) | recruiter toggle |
| applyToken | String? @unique | minted when publicApplyEnabled first turned on; never rotated |

Public form URL: `/apply/:applyToken`.

### `PipelineEntry` (existing) — one new column
| field | type | notes |
|---|---|---|
| applicationToken | String? @unique | set only on `enteredVia='application'` entries; the candidate's status-page token. Null for manual/exam entries. |

### `CandidateProfile` (`candidate_profiles`) — new, 1:1 with Candidate
| field | type | notes |
|---|---|---|
| id | uuid PK | |
| organizationId | uuid | RLS scope |
| candidateId | uuid FK → Candidate, @unique | onDelete Cascade |
| resumePath | String? | blob path (private container) |
| parseStatus | String @default('pending') | `pending`\|`parsing`\|`done`\|`failed`\|`unavailable` |
| parsedSummary | String? @db.NVarChar(Max) | 2–3 sentence AI précis |
| parsedSkills | String? @db.NVarChar(Max) | JSON array string |
| parsedTitle | String? | current/most-recent title |
| parsedYearsExperience | Int? | rough integer |
| parsedAt | DateTime? | |

### `AiJob` (existing) — reused
New `type: 'resume_parse'`. `inputJson` carries `{ candidateId }`. `createdBy` is
set to the **job's `createdById`** (no staff user in a public submission).
`outputJson` stores the parsed result. No schema change.

## The apply flow

`POST /public/jobs/:applyToken/apply`, body `{ name, email, phone?, resumeBase64 }`:
1. Look up the job by `applyToken`; **generic 404** unless it exists, is `open`,
   and `publicApplyEnabled`.
2. Validate the upload: PDF magic-byte (`%PDF`), size ≤ 5 MB — reject before any
   write.
3. Resolve `organizationId` from the job; inside that org's `forTenant`:
   - upsert `Candidate` by `[organizationId,email]` (name/phone updated);
   - store the PDF in blob storage → `resumePath`;
   - upsert `CandidateProfile` (`parseStatus='pending'`, new `resumePath`);
   - upsert `PipelineEntry` (`where [jobId,candidateId]`, `create`
     `{ stage:'applied', enteredVia:'application', applicationToken: <new> }`,
     `update:{}` — stamp-if-absent, so re-applying reuses the existing entry and
     its token);
   - enqueue a `resume_parse` `AiJob`.
4. Return `{ statusToken }` (the entry's `applicationToken` — the freshly created
   one, or the existing one on re-apply).

**Blob upload ordering:** upload the résumé to blob storage OUTSIDE the DB
transaction (blob I/O in a `forTenant` tx is the mistake fixed in #6810); write
`resumePath` in the tx after the upload resolves.

## Résumé parse pipeline (`resume_parse` AiJob processor)

1. Load `resumePath` from blob → PDF buffer.
2. Extract text with `pdf-parse`.
3. Resolve the org AI provider (`ai-api-key-resolver`). **No key → `parseStatus =
   'unavailable'`, stop** (résumé remains stored + downloadable).
4. Truncate text to a character budget, send with a structured-output prompt
   (JSON schema: `summary`, `skills[]`, `title`, `yearsExperience`) — same
   mechanism as AI question-generation.
5. Write the four fields + `parsedAt`, `parseStatus='done'`.
6. Any failure (bad PDF, AI error, malformed JSON) → `parseStatus='failed'`, error
   on the `AiJob`. Résumé stays downloadable.

## Status bucket mapping (pure function)

`applicationStatusBucket(stage, rejected)`:
| internal | candidate-facing bucket |
|---|---|
| rejected (any stage) | "A decision has been made; the team will follow up" |
| applied | "Application received" |
| screened, interview | "Under review" |
| offer, hired | "Moving forward — the team will be in touch" |

Rejected takes precedence over stage. Unit-tested in isolation. The status page
shows job title, applied date, and this bucket only — never the raw stage, never
parse status.

## API surface

**Public** (unauthenticated, guard-exempt controller `public-applications`,
rate-limited via the existing throttler, no CAPTCHA):
- `GET /public/jobs/:applyToken` → `{ jobTitle, jobDescription, orgName, orgLogo }`;
  generic 404 unless open + enabled.
- `POST /public/jobs/:applyToken/apply` → the apply flow → `{ statusToken }`.
- `GET /public/applications/:statusToken` → `{ jobTitle, appliedAt, statusBucket }`;
  404 on unknown token.

**Recruiter** (authenticated):
- `PATCH /jobs/:id` (existing `updateJob`, `pipeline:manage`) — accepts
  `publicApplyEnabled`; enabling mints `applyToken` if absent (idempotent, never
  rotates). `getJob` returns `publicApplyEnabled` + `applyToken`.
- `GET /candidates/:id/profile` (`results:view`) → `CandidateProfile` (summary,
  skills, title, years, parseStatus); empty/404 when none.
- `GET /candidates/:id/resume` (`results:view`) → short-lived signed blob URL
  (`signIfOurs`), 404 if no résumé. Raw path never returned.

Public endpoints pin the org from the job token; recruiter endpoints use the
caller's tenant context + RLS.

## Frontend

**Public routes** (candidate-facing tier, same public shell as `/start?token=`,
mobile-friendly, org-branded):
- `/apply/[applyToken]` — header from `GET /public/jobs/:applyToken`; form (name,
  email, phone?, PDF file input with client-side type+size check); on success a
  confirmation with the **status link**. Generic "not accepting applications" on
  404.
- `/application/[statusToken]` — job title, "Applied on {date}", the friendly
  **status bucket** badge. Read-only.

**Recruiter:**
- Job detail (`/jobs/[jobId]`) — a "Public applications" control near LinkedExams:
  `publicApplyEnabled` toggle (`useUpdateJob`) + the copyable `/apply/{applyToken}`
  link when on. `pipeline:manage` only.
- `CandidateDrawer` — a **Profile section**: AI summary, skills chips, title,
  years, a **"Download résumé"** button (`GET /candidates/:id/resume` → open signed
  URL), and a parse-status hint (`Parsing…`/`Parse failed`/`No résumé`). New hook
  `useCandidateProfile(candidateId)`. `results:view`.

Public pages use plain `fetch` (no auth token); recruiter pages use `apiFetch`.

## Edge cases

- Re-apply to same job → idempotent entry (unique), status token reused.
- Apply to a second job → second entry + token; one shared `CandidateProfile`.
- Existing (invited/manual) candidate applies → `Candidate` upsert by email
  attaches résumé to the known person.
- No AI key → `unavailable`, résumé still downloadable.
- Corrupt/non-PDF/oversized → rejected pre-write; bad PDF passing byte check but
  failing extraction → `failed`, résumé downloadable.
- Job closed / toggle off after link shared → generic 404 on fetch + apply.
- GDPR erase → `CandidateProfile` cascades with `Candidate`; **résumé blob deleted
  before the row** (added to the candidate-erase blob-cleanup list, same ordering
  rule as webcam/face evidence).

## Testing

- **Backend unit:** status-bucket mapper; apply transaction (upsert candidate +
  profile + idempotent entry + enqueue, org pinned from token); 404 guards;
  magic-byte + size rejection; parse processor (success; `unavailable` no-key;
  `failed` bad-PDF/AI-error); toggle mints `applyToken` once; signed-résumé-URL
  endpoint; GDPR blob-before-row deletion.
- **Frontend unit:** apply form validates + posts + shows status link; status page
  renders each bucket; drawer Profile section renders fields + parse-status states
  + download; recruiter toggle + copy-link.
- **Browser smoke (post-deploy):** enable public apply → open public link → submit
  a real PDF → status page → candidate appears at `applied` (`enteredVia=application`)
  → (with AI key) parsed profile fills the drawer → download résumé → delete test
  data.

## Out of scope (v1)

Careers page / job listing; `.docx`; candidate accounts/login; per-application
résumés; work-history/education parsing; edit/withdraw an application; candidate
email notifications on status change; CAPTCHA/bot-defense beyond rate-limiting;
recruiter-triggered re-parse.
