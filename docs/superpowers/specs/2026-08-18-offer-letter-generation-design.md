# Offer-Letter Generation — Design Spec

**Date:** 2026-08-18
**Status:** Approved (design), pending implementation plan
**Feature:** offer-letter generation + tracked accept/decline (ATS-depth set, feature #2 of 4)

## Goal

At the pipeline `offer` stage, let a recruiter generate a formal offer letter
(a PDF built from an editable per-org template + per-offer terms), send it to
the candidate as a branded email, and **track the candidate's accept/decline**
via a public tokenized page. Builds directly on the candidate-communication
layer (feature #1, live): reuse its send path, render helpers, branded shell,
blob storage, and the public tokenized-action pattern.

## Anchoring decisions (from brainstorming)

1. **PDF document + HTML email.** Generate a formal offer-letter **PDF**
   (blob-stored) AND send a branded **HTML email** summarizing the terms with an
   accept/decline link; the PDF is also **attached** to that email.
2. **Tokenized public accept/decline.** The email links to a public (no-login)
   offer page — view terms, download the PDF, **Accept** / **Decline**. The
   click stamps the offer status and timestamps it. This tracked response is the
   feature's core value over "email with a PDF".
3. **Record status + notify recruiter; recruiter drives the pipeline.** On a
   response, stamp the offer and email the sending recruiter; the recruiter
   decides the pipeline move (no auto-advance) — matches feature #1's
   "confirm, don't silently automate" philosophy.
4. **Free-text compensation.** The three per-offer terms (compensation, start
   date, expiry) live on a new `Offer` record because `Job` has no such fields;
   compensation is a free-text string (no currency / structured-comp modeling).

## Global constraints

- **No new dependency.** `pdfkit@^0.15.0` is already installed
  (`apps/api/package.json`); model the PDF builder on
  `apps/api/src/reports/exporters/pdf-exporter.ts` (`exportResultsToPdf` →
  collects `doc.on('data')` chunks → resolves a `Buffer`).
- **Reuse the send layer.** Deliver via the feature-1 path —
  `CandidateEmailsService.sendMessage` (`apps/api/src/candidate-emails/candidate-emails.service.ts:26`)
  and `buildCandidateEmailHtml` / `renderTemplate`
  (`apps/api/src/candidate-emails/candidate-email-render.ts`). **SMTP send stays
  OUTSIDE the tenant transaction** (feature-1 lesson): render + blob + send
  between short read/write transactions, never inside one `forTenant`.
- **Reuse the public-action pattern.** The public respond endpoint mirrors
  `PublicApplicationsController`/`Service`
  (`apps/api/src/public-applications/`): no `JwtAuthGuard`, throttled
  (`PublicApplicationsThrottlerGuard` + `STRICT_WALK_IN_THROTTLE`), org-pinned
  via token using `forTenant({ organizationId: LOOKUP_ORG, isSuperAdmin: true })`,
  and a deliberately generic `NotFoundException` so token state is not an oracle.
- **Org-scoped, no Organization FK.** `Offer` / `OfferTemplate` carry a plain
  `organizationId` column (RLS via `TenantPrismaService.forTenant`), matching
  `CandidateEmail`/`PipelineEntry` — this avoids SQL Server P1012. RLS predicates
  for the new tables are added in a **separate** migration (`ALTER SECURITY
  POLICY` cannot share a batch with `CREATE TABLE`).
- **Permission:** recruiter routes gated **`pipeline:manage`**; the public
  respond + view routes are unauthenticated + throttled.
- **Blob storage:** `BlobStorageService.upload(path, buffer, 'application/pdf')`
  to store, `signIfOurs(path, ttlMs)` for the SAS download link (long TTL for an
  emailed link, as candidate-emails does for the logo).
- **GDPR:** an erased candidate's offers are scrubbed on erase (PDF blob deleted,
  terms redacted) alongside the existing candidate PII scrub
  (`apps/api/src/candidates/candidates.service.ts` `erase()`); never send an
  offer to an `erasedAt != null` candidate.
- `FRONTEND_URL` is the base for the public offer link
  (`${FRONTEND_URL}/offer/<offerToken>`).

## Data model

Two new per-org tables (plain `organizationId` column, no Org relation).

### `Offer`

| field | type | notes |
|---|---|---|
| id | uuid PK | |
| organizationId | uuid (plain col) | RLS-scoped |
| pipelineEntryId | uuid FK → PipelineEntry | `onDelete: Cascade` (offer belongs to the entry) |
| candidateId | uuid (plain col) | denormalized for the erase scrub + timeline query |
| compensation | string | free text, e.g. "$120,000 / year" |
| startDate | date | proposed start |
| expiresAt | date | offer expiry; past → cannot accept |
| status | string | `'draft'` \| `'sent'` \| `'accepted'` \| `'declined'` \| `'expired'` \| `'withdrawn'` |
| offerToken | string? @unique | minted on send (`randomUUID()`); its OWN token, not `applicationToken` |
| pdfPath | string? | blob path of the generated PDF |
| letterSubject | string | rendered subject snapshot at send |
| letterBody | string (text) | rendered letter body snapshot at send (drives PDF + email) |
| sentByUserId | uuid? (plain col) | recruiter who sent |
| sentAt | datetime? | |
| respondedAt | datetime? | |
| createdAt / updatedAt | datetime | |

Index `[organizationId, pipelineEntryId]` and `[organizationId, candidateId]`.
`status` transitions: `draft → sent → (accepted | declined | expired | withdrawn)`.
`expired` is derived at read/respond time (`expiresAt < now` while `sent`), not a
background job.

### `OfferTemplate`

One editable letter template per org, code-default-with-override (mirrors
feature #1's templates):

| field | type | notes |
|---|---|---|
| id | uuid PK | |
| organizationId | uuid (plain col) | RLS-scoped |
| subject | string | with tokens |
| body | string (text) | the offer-letter body, with tokens |
| updatedAt | datetime | |

Code default `DEFAULT_OFFER_TEMPLATE` (subject + a standard offer-letter body)
is returned when the org has no saved row; editing upserts the org's row. At
most one per org.

## Merge tokens

`renderOfferTemplate(subject, body, ctx)` — a small pure renderer (either a new
function or `renderTemplate` extended with an offer superset context). Tokens:
`{{candidateName}}`, `{{jobTitle}}`, `{{orgName}}`, `{{recruiterName}}`,
`{{compensation}}`, `{{startDate}}`, `{{offerExpiry}}`, `{{offerLink}}`. Unknown
`{{tokens}}` pass through untouched (feature-1 convention). Dates are formatted
to a human string (e.g. `startDate.toLocaleDateString('en-US', {dateStyle:'long'})`).

## Components

### Backend

- **`offer-pdf.ts`** (pure) — `buildOfferPdf(data: { orgName, logoBuffer?, letterBody, candidateName, jobTitle, compensation, startDate, expiresAt }): Promise<Buffer>` using `pdfkit` (model on `exportResultsToPdf`). A clean single-page letter: org name/logo header, greeting, the rendered `letterBody`, a terms block (compensation / start date / expiry), signature line. Returns a `Buffer`.
- **`OffersService`**:
  - `createOffer(context, actorUserId, entryId, { compensation, startDate, expiresAt, subject?, body? })` — validates the entry is org-scoped (no hard stage gate — the UI surfaces this at the `offer` stage but the server does not require it, so a recruiter can prep an offer freely); persists a `draft` `Offer` with the terms + the letter subject/body (from the org's `OfferTemplate`, or the provided override). **No PDF or blob write happens at create time** — the PDF is generated on demand by `previewPdf` and finalized by `sendOffer`. Returns the offer.
  - `previewPdf(context, offerId): Promise<Buffer>` — generate the PDF from the draft's current terms/body for recruiter review (streamed to the browser; not persisted to blob).
  - `sendOffer(context, actorUserId, offerId)` — the three-phase send (feature-1 pattern): (1) short tx: load offer+entry+candidate (guard erased, guard not-already-sent), mint `offerToken`; (2) OUTSIDE tx: render, `buildOfferPdf`, `blob.upload` the PDF, `EmailService.send` (HTML body via `buildCandidateEmailHtml` incl. the `{{offerLink}}` + PDF **attachment**); (3) short tx: set `status:'sent'`, `pdfPath`, `sentAt`, snapshot `letterSubject`/`letterBody`, write a `CandidateEmail` log row (reuse), audit `offer.sent`.
  - `respondPublic(token, action: 'accept'|'decline')` — public path: resolve offer by `offerToken` (LOOKUP_ORG + super-admin bypass, generic NotFound); guard `status==='sent'` and `expiresAt >= now` (else 409/expired); stamp `status` + `respondedAt`; audit `offer.accepted`/`.declined` (`actorUserId:null`); **outside the response tx**, email the `sentByUserId` recruiter ("Candidate X accepted/declined the offer for {{jobTitle}}").
  - `withdraw(context, actorUserId, offerId)` — `sent → withdrawn`, audit `offer.withdrawn`.
  - `listForCandidate(context, candidateId)` / `getForEntry(context, entryId)` — recruiter surface.
  - `getPublicOffer(token)` — public read for the offer page (terms + a signed PDF URL + status), generic NotFound.
- **`EmailService.send` gains `attachments?: { filename: string; content: Buffer }[]`** (`apps/api/src/email/email.service.ts`) — extend `SendEmailInput` and spread into the `sendMail` call; deliverability guard + SMTP resolution unchanged.
- **Controllers:**
  - Recruiter (`pipeline:manage`): `POST /pipeline/entries/:id/offers` (create), `GET /pipeline/entries/:id/offers` (list for entry), `GET /offers/:id/pdf` (preview/download stream), `POST /offers/:id/send`, `POST /offers/:id/withdraw`, `GET/PUT /offer-template`.
  - Public (unauthenticated, throttled): `GET /public/offers/:token` (view), `POST /public/offers/:token/respond` (accept/decline).
- **GDPR scrub:** in `candidates.service.ts` `erase()`, delete offer PDFs from blob (read `pdfPath`s BEFORE nulling) and redact `Offer` rows (`compensation`, `letterBody`, `pdfPath` nulled) for the candidate, org-scoped.

### Frontend

- **Candidate drawer / pipeline:** an **Offers** section on `CandidateDrawer` — list offers (status badge, compensation, sent/responded time), a **Create offer** button (opens a modal: compensation, start date, expiry, editable letter body pulled from the template, a **Preview PDF** action, **Send**), **Withdraw** on a sent offer, and the response status when it comes back.
- **Public offer page** `apps/web/app/(candidate)/offer/[token]/page.tsx` (clone the apply page's fetch-then-POST shape, reuse `(candidate)/components` `TerminalCard`/`CandidateButton`): fetch `GET /public/offers/:token`, render terms + **Download PDF** + **Accept**/**Decline**; on submit `POST .../respond`, swap to a confirmation state; handle already-responded / expired / withdrawn states with a clear message.
- **Offer template admin:** a small editor (subject + body with offer-token insert buttons) — either its own page or a tab alongside the message-templates page from feature #1. Gated `canManage`.

## Data flow

1. Recruiter (candidate at the `offer` stage) → opens Create offer → fills terms, edits body, **Preview PDF** (streamed, not persisted), **Send**.
2. `sendOffer`: mint token, render, build PDF, upload to blob, email candidate (HTML summary + `/offer/<token>` link + PDF attachment), status `sent`, log + audit `offer.sent`.
3. Candidate opens the link → public page → **Accept** → `POST /public/offers/:token/respond` → status `accepted`, `respondedAt`, audit, recruiter emailed.
4. Recruiter sees the accepted badge on the drawer and moves the pipeline to `hired` themselves.

## Error handling

- Send with no candidate email / erased candidate → blocked (surfaced in UI).
- Blob upload or SMTP failure during `sendOffer` → offer stays `draft` (nothing half-committed: the status flip to `sent` is in the final short tx, after the PDF+email succeed); the `CandidateEmail` log records a `failed` row if send failed; recruiter retries.
- Public respond on an expired / already-responded / withdrawn offer → generic 409 with a friendly page state; never leaks whether the token exists vs is in a bad state beyond the friendly message.
- Deliverability guard (org without SMTP) → the offer email no-ops `success:false` (logged), same as feature #1; surfaced via the existing no-SMTP banner reused in the create-offer modal.

## Testing

- **Backend unit:** `buildOfferPdf` returns a non-empty Buffer with expected text; `renderOfferTemplate` (all tokens incl. dates, unknown passthrough); `sendOffer` three-phase (token minted, PDF uploaded, email sent with attachment, status/pdfPath/sentAt set, log+audit) with send OUTSIDE the tx; erased-candidate guard; `respondPublic` (accept/decline stamps status+respondedAt+audit+recruiter email; expired → rejected; already-responded → rejected; wrong token → generic NotFound); `withdraw`; permission gates (`pipeline:manage` 401/403); public routes unauthenticated+throttled; `EmailService.send` attachment plumbing; GDPR erase deletes offer PDFs + redacts rows.
- **Frontend unit:** create-offer modal (fill terms, preview calls the pdf endpoint, send calls create+send); offers list + withdraw; public offer page (renders terms + PDF link, Accept/Decline posts the action, confirmation state, expired/withdrawn/responded states); template editor.
- **Browser smoke (post-deploy):** create + preview + send an offer for a test candidate (org with SMTP); open the public link; download the PDF; Accept; confirm status flips, recruiter is emailed, audit rows exist; withdraw a separate offer and confirm the public page blocks it.

## Out of scope (v1)

E-signature / countersigning; multiple offer versions/revisions with diffs;
structured compensation breakdown (base + bonus + equity); an offer-approval /
manager-sign-off workflow before send; automatic reminder emails on pending
offers; auto-advancing the pipeline on accept/decline (recruiter drives it);
negotiation / counter-offer threads.
