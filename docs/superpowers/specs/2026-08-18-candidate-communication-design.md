# Candidate Communication — Design Spec

**Date:** 2026-08-18
**Status:** Approved (design), pending implementation plan
**Feature:** candidate-facing templated email (ATS-depth set, feature #1 of 4)

## Goal

Give recruiters a way to actively email candidates as they move through the
ATS pipeline — templated, merge-field emails (moving to interview, offer,
rejection, etc.) sent via the existing per-org SMTP. Today only the public
tokenized status page exists; there is no way to message a candidate. This
feature ships a reusable **template + send + log** layer that the next three
ATS-depth features (offer letters, interview scheduling) reuse.

## Anchoring decisions (from brainstorming)

1. **All three trigger modes, chosen per template.** A template carries a
   trigger: `manual` (only sent on explicit action), `prompt` (pops
   pre-filled for review when a candidate enters its stage — confirm-and-send),
   or `auto` (sends silently on stage entry). Any template can also be sent
   manually regardless of its mode.
2. **Editable per-org templates with built-in defaults.** Defaults live in
   code and work day one; editing one materializes an editable per-org row.
   No per-org seed migration.
3. **Fire-and-forget send + per-send log + manual resend.** Each send writes a
   `CandidateMessage` row (status `sent`/`failed`), shown as a per-candidate
   comms timeline; failures can be resent. Matches the existing
   invitation-email pattern.

## Global constraints

- **Reuse, don't reinvent.** Send through `EmailService.send({ to, subject,
  html, organizationId })` (`apps/api/src/email/email.service.ts:71`) — it
  never throws and returns `{ success, previewUrl? }`. Generalize the branded
  HTML shell from `buildAssessmentEmailHtml`
  (`apps/api/src/invitations/invitations.service.ts:81`) rather than writing a
  new one; the org logo is a SAS-signed blob URL
  (`blobStorage.signIfOurs(org.logoPath, ...)`).
- **Single stage-move hook point.** `PipelineService.patchEntry`
  (`apps/api/src/pipeline/pipeline.service.ts:239`) is the only place `stage`/
  `rejected` change by user action; it already loads the existing entry, so
  old and new stage are both in scope. Fire the stage-triggered send **after**
  the `forTenant` transaction commits, fire-and-forget (the invitation dispatch
  pattern, `invitations.service.ts:206-216`).
- **Org-scoped.** All new tables carry `organizationId`; all writes go through
  `TenantPrismaService.forTenant` (RLS enforced), matching `PipelineEntry`.
- **Permission:** reuse **`pipeline:manage`** for both sending messages and
  template CRUD — no new permission.
- **Stages are strings, not an enum.** Canonical values in
  `apps/api/src/pipeline/pipeline-stages.ts`:
  `['applied','screened','interview','offer','hired']`. `rejected` is an
  orthogonal boolean, surfaced as a pseudo trigger event `'rejected'`.
- **GDPR:** never email a candidate with `erasedAt != null` (invitations
  already excludes these); the `CandidateMessage` log is scrubbed on erase
  alongside other candidate PII.
- `FRONTEND_URL` (env, default `http://localhost:3000`) is the base for
  candidate-facing links, matching invitation/reset links.

## Data model

Two new per-org tables. `stage`/trigger values are unconstrained strings (no
new Prisma enum), consistent with `PipelineEntry.stage`.

### `CandidateMessageTemplate`

| field | type | notes |
|---|---|---|
| id | uuid PK | |
| organizationId | uuid FK → Organization | RLS-scoped |
| name | string | recruiter-facing label |
| triggerEvent | string? | one of the 5 stages, or `'rejected'`, or null = manual-only |
| triggerMode | string | `'manual'` \| `'prompt'` \| `'auto'` |
| subject | string | may contain `{{tokens}}` |
| body | string (text) | plain text authored with `{{tokens}}` + line breaks |
| enabled | bool | default true |
| createdAt / updatedAt | datetime | |

Unique `[organizationId, triggerEvent]` **where triggerEvent is not null and
enabled** is enforced in application logic (a filtered unique index is avoided
to keep disabled/superseded rows around): at most one enabled auto/prompt
template may resolve for a given event — `resolveTemplateForEvent` picks the
most-recently-updated enabled match and the templates UI warns on conflicts.

**Built-in defaults (code, not seeded):** `DEFAULT_TEMPLATES` array —
*Application received* (`applied`, `manual`), *Moving to interview*
(`interview`, `prompt`), *Offer* (`offer`, `prompt`), *Not moving forward*
(`rejected`, `prompt`). The list endpoint returns the org's saved rows unioned
with the code defaults for events the org hasn't customized; editing a default
upserts a real row. So defaults are present and editable day one with no seed
migration.

### `CandidateMessage` (send log)

| field | type | notes |
|---|---|---|
| id | uuid PK | |
| organizationId | uuid FK → Organization | RLS-scoped |
| candidateId | uuid FK → Candidate | onDelete Cascade (with candidate) |
| pipelineEntryId | uuid? FK → PipelineEntry | onDelete SetNull |
| templateId | uuid? FK → CandidateMessageTemplate | null for ad-hoc/default sends; onDelete SetNull |
| toEmail | string | snapshot of the address sent to |
| subject | string | rendered |
| renderedBody | string (text) | rendered (pre-shell) body, for the timeline |
| status | string | `'sent'` \| `'failed'` |
| source | string | `'manual'` \| `'stage_prompt'` \| `'stage_auto'` |
| sentByUserId | uuid? FK → User | null for `stage_auto` |
| errorDetail | string? | populated on failure |
| createdAt | datetime | |

Indexes: `[organizationId, candidateId]` (timeline query), `[pipelineEntryId]`.

**Status link minting:** `{{statusLink}}` resolves to
`${FRONTEND_URL}/application/<PipelineEntry.applicationToken>`. The column
already exists (`schema.prisma:775`, `@unique`) but is only minted on the
public-apply path. When a template using `{{statusLink}}` is sent for an entry
whose `applicationToken` is null, mint `randomUUID()` into it first (inside the
send's tenant tx).

## Components

### Backend

- **`candidate-message-render.ts`** (pure) — `renderTemplate(subject, body,
  ctx): { subject, body }` replacing the fixed token set
  (`{{candidateName}}`, `{{jobTitle}}`, `{{orgName}}`, `{{recruiterName}}`,
  `{{statusLink}}`). Unknown tokens are left as-is (visible, not blanked, so a
  typo is obvious). Plus `buildCandidateEmailHtml({ logoUrl, orgName,
  bodyHtml })` — the branded shell generalized from `buildAssessmentEmailHtml`
  (converts the rendered plain-text body's newlines to `<br>` / paragraphs).
- **`CandidateMessagesService`** — the reusable send layer:
  - `sendMessage(context, actorUserId, entryId, { templateId?, subject, body,
    source }): Promise<CandidateMessage>` — `subject`/`body` arrive as **raw
    template text (may still contain `{{tokens}}`)**; the server is the single
    source of truth for rendering. Loads entry+candidate+job+org (RLS), guards
    `candidate.erasedAt == null`, mints `applicationToken` if the raw
    subject/body references `{{statusLink}}` and it's absent, calls
    `renderTemplate` (idempotent — rendered output has no tokens left), wraps in
    the shell, `EmailService.send`, writes the `CandidateMessage` row (storing
    the **rendered** subject + body) with the resulting status, audits
    `candidate_message.sent`/`.failed`.
  - `resolveTemplateForEvent(context, event): CandidateMessageTemplate | null`
    — the org's enabled template for a stage/`rejected` event, else the code
    default, else null.
  - `listMessages(context, candidateId)`, `resend(context, actorUserId,
    messageId)` (re-sends a `failed` row's snapshot).
- **`CandidateMessageTemplatesService`** — CRUD (list-with-defaults, upsert,
  enable/disable, delete-reverts-to-default).
- **Controllers** (all `pipeline:manage`):
  - `POST /pipeline/entries/:id/messages` (manual/confirm send)
  - `GET /candidates/:id/messages` (timeline)
  - `POST /candidate-messages/:id/resend`
  - `GET/POST/PATCH/DELETE /candidate-message-templates`
- **`patchEntry` hook:** after the tx commits, if the stage/`rejected` change
  resolves a template: `auto` → `sendMessage(..., source:'stage_auto',
  actorUserId:null)` fire-and-forget; `prompt` → include `pendingMessage
  { templateId, subject, body }` carrying the template's **raw** subject/body
  (tokens intact — the compose modal edits raw text and the send endpoint
  renders authoritatively) in the `patchEntry` response so the web layer can
  open the confirm modal. `PipelineModule` imports `EmailModule` (and the new
  services); guard against circular deps.

### Frontend

- **Candidate drawer** (existing `CandidateDrawer`): a **Messages** section —
  the `CandidateMessage` timeline (subject, status badge, sent-by, time; resend
  on failed) + a **Send message** button opening a compose modal (template
  picker → editable **raw** subject/body with merge-token insert buttons and a
  live rendered preview → send; the server renders authoritatively).
- **Stage move:** when a move returns `pendingMessage`, open the same compose
  modal pre-filled; the recruiter edits/sends or dismisses.
- **Message Templates page** (recruiter settings, near org settings): table of
  templates (name, trigger event + mode, enabled); edit subject/body; set
  trigger; enable/disable; restore-default.
- **No-SMTP banner:** when the org has no SMTP configured, show an inline
  warning in the compose modal and templates page that candidate emails won't
  send.

## Data flow

1. Recruiter moves a candidate to *Interview* → `patchEntry` commits the stage,
   audits `entry.stage_changed`, resolves the *Moving to interview* template
   (`prompt`) → returns `pendingMessage`.
2. Web opens the compose modal pre-filled; recruiter tweaks and sends →
   `POST /pipeline/entries/:id/messages` → render → `EmailService.send` → log
   row `status:sent, source:stage_prompt` → audit `candidate_message.sent`.
3. Candidate receives a branded email with a `{{statusLink}}` to their status
   page.
4. The send appears in the candidate drawer's Messages timeline.

An `auto` template (e.g. an org that set *Offer* to auto) skips step 2 — the
send fires from the hook, logged `source:stage_auto`.

## Error handling

- `EmailService.send` returns `{ success:false }` on transporter failure or the
  deliverability guard (no org SMTP + no platform SMTP) → log
  `status:'failed'`, `errorDetail`, audit `candidate_message.failed`; the
  timeline shows a failed badge with **Resend**. The move itself is never
  rolled back by a failed email (send is post-commit, fire-and-forget).
- Missing candidate email or `erasedAt != null` → no send; surfaced as a
  disabled Send button / skipped auto-send (logged as skipped, not failed).
- Template resolution finding multiple enabled matches for one event → the
  most-recently-updated wins; the templates UI flags the conflict.

## Testing

- **Backend unit:** `renderTemplate` (all tokens, unknown-token passthrough,
  `{{statusLink}}` minting path); `buildCandidateEmailHtml` (newline→`<br>`,
  logo present/absent); `sendMessage` (success logs `sent`, failure logs
  `failed`+error, erased candidate skipped, token minted when absent);
  `resolveTemplateForEvent` (org row wins over default, disabled excluded,
  none→null); `patchEntry` hook (auto sends, prompt returns `pendingMessage`,
  none/manual does nothing); permission gate (`pipeline:manage`, 401/403); GDPR
  erase scrubs `CandidateMessage` PII.
- **Frontend unit:** compose modal renders template + sends with edits;
  timeline renders sent/failed + resend; stage-move `pendingMessage` opens the
  modal; templates page edits + restore-default; no-SMTP banner shows.
- **Browser smoke (post-deploy):** configure a template, move a candidate,
  confirm the email sends (org with SMTP) and appears in the timeline; verify
  the status link resolves; verify an org without SMTP shows the banner and
  logs `failed`.

## Out of scope (v1)

Inbound replies / threading (candidates can't reply into the system); SMS;
scheduled/send-later; WYSIWYG rich-text editor (plain textarea + merge-token
buttons only); bulk/segmented messaging; per-recruiter signatures; open/click
tracking; the reciprocal offer-letter document and interview-scheduling flows
(separate features #2 and #3 that reuse this send/template layer).
