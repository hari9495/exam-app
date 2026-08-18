# Interview Scheduling — Design Spec

**Date:** 2026-08-18
**Status:** Approved (design), pending implementation plan
**Feature:** interview scheduling + tracked candidate confirmation + panel view (ATS-depth set, feature #3 of 4)

## Goal

At the pipeline `interview` stage, let a recruiter schedule an interview —
propose one or more time slots, assign panel interviewer(s), set a
location/video link — and email the candidate an invite (they confirm / decline
/ request-reschedule via a public tokenized page) and the panel. On
confirmation, everyone gets an ICS calendar invite. Assigned interviewers also
get an in-app "My interviews" view. Builds directly on the offers feature (#2,
live): reuse its token/public-confirm skeleton, three-phase send, and the
candidate-communication render/send layer.

## Anchoring decisions (from brainstorming)

1. **Unified "recruiter proposes 1–N slots, candidate confirms/picks".** One
   slot → confirm/decline/reschedule; multiple → the candidate picks one. Same
   model + public page either way. Full calendar/availability sync is a
   **deferred separate project** (out of scope).
2. **Panel gets email + an in-app view.** Assigned interviewers are emailed
   (with ICS on confirmation) AND get a read-only `(panel)/interviews` page,
   gated by a new `interview:view_assigned` permission.
3. **ICS attachment, no new dependency.** A hand-written `VCALENDAR/VEVENT`
   string, delivered via `EmailService.send`'s `attachments` support (added in
   feature #2), emitted on confirmation with `DTSTART/DTEND` in UTC.
4. **Timezone is explicit.** The codebase has no timezone handling; interview
   times are timezone-sensitive. Store slot times UTC; the interview carries an
   IANA `timeZone`; render with `Intl.DateTimeFormat(locale, { timeZone })`.

## Global constraints

- **Reuse the offers skeleton** (`apps/api/src/offers/offers.service.ts`): the
  three-phase send (short tx read/mint → **email/network OUTSIDE any
  `forTenant`** → short tx status write); `LOOKUP_ORG` + `isSuperAdmin`
  token resolution with a **generic** `NotFoundException` (no oracle); the
  atomic `updateMany({ where: { …, status } })` transition with a generic
  `ConflictException` on `count === 0`. Public controller pattern:
  `@Controller('public')` + `PublicApplicationsThrottlerGuard` +
  `@Throttle(STRICT_WALK_IN_THROTTLE)`, NO `JwtAuthGuard`
  (`apps/api/src/offers/public-offers.controller.ts`).
- **SMTP + ICS attachment send stays OUTSIDE the tenant tx** (feature-1/2
  lesson).
- **Reuse the render/send layer:** `buildCandidateEmailHtml` + `renderTemplate`
  (`apps/api/src/candidate-emails/candidate-email-render.ts` — extend
  `MergeContext`/`TOKEN` with interview tokens); `EmailService.send`
  (`apps/api/src/email/email.service.ts:71`, with `attachments`). Panel/recruiter
  notifications email the staff `User.email` directly (no `CandidateEmail` log —
  that model is candidate-scoped), same as the offers recruiter-notify.
- **Org-scoped, no Organization/User FK on the new tables:** plain
  `organizationId` / `candidateId` / `userId` columns (RLS via `forTenant`),
  matching `Offer`/`CandidateEmail`. The only relations are the intra-feature
  FKs (`InterviewSlot.interviewId`, `InterviewPanelist.interviewId`,
  `Interview.pipelineEntryId`), all `onDelete: Cascade`. RLS predicates for the
  three new tables in a **separate** migration.
- **Permissions:** recruiter routes `@RequirePermissions('pipeline:manage')`;
  the panel view route `@RequirePermissions('interview:view_assigned')` (new
  key, seeded onto the `panel` role — and `org_admin`/`recruiter` — via the
  migration, idempotent INSERT into `permissions` + `role_permissions`, since
  `seed.ts` does not run on deploy — same pattern as `pipeline:manage`); public
  routes unauthenticated + throttled.
- **GDPR:** an erased candidate's interviews are scrubbed on erase (times/notes
  redacted, token cleared) alongside existing candidate PII scrub; never send an
  invite to an `erasedAt != null` candidate.
- `FRONTEND_URL` → the public link `${FRONTEND_URL}/interview/<interviewToken>`.
- **Interviewer list:** reuse `GET /users` / `useUsers()` (org-scoped,
  `org:view`); the panel multi-select filters staff client-side.

## Data model

Three new per-org tables (plain `organizationId` column, no Org relation).

### `Interview`

| field | type | notes |
|---|---|---|
| id | uuid PK | |
| organizationId | uuid (plain col) | RLS-scoped |
| pipelineEntryId | uuid FK → PipelineEntry | `onDelete: Cascade` |
| candidateId | uuid (plain col) | denormalized for erase scrub + timeline |
| status | string | `'proposed'` \| `'confirmed'` \| `'declined'` \| `'reschedule_requested'` \| `'cancelled'` |
| interviewToken | string? @unique | minted on send (`randomUUID()`) |
| location | string | free text — video link or physical address |
| timeZone | string | IANA, e.g. `"America/New_York"` |
| recruiterNote | string (text) | optional per-interview note shown to candidate |
| confirmedSlotId | uuid? | the slot the candidate chose (set on confirm) |
| candidateReschedNote | string? (text) | optional note from a reschedule request |
| sentByUserId | uuid? (plain col) | recruiter who sent |
| sentAt / respondedAt | datetime? | |
| createdAt / updatedAt | datetime | `createdAt` default `GETUTCDATE()` |

Index `[organizationId, pipelineEntryId]`, `[organizationId, candidateId]`.

### `InterviewSlot`

| field | type | notes |
|---|---|---|
| id | uuid PK | |
| organizationId | uuid (plain col) | |
| interviewId | uuid FK → Interview | `onDelete: Cascade` |
| startsAt | datetime (UTC) | proposed start |
| endsAt | datetime (UTC) | proposed end |

Index `[interviewId]`. At least one per interview (enforced in the service).

### `InterviewPanelist`

| field | type | notes |
|---|---|---|
| id | uuid PK | |
| organizationId | uuid (plain col) | |
| interviewId | uuid FK → Interview | `onDelete: Cascade` |
| userId | uuid (plain col) | an org staff user (interviewer) |

Index `[interviewId]`, `[organizationId, userId]` (for the "my interviews"
query). Unique `[interviewId, userId]` (no duplicate assignment).

## Merge tokens

Extend the render context (or a dedicated interview render fn) with:
`{{candidateName}}`, `{{jobTitle}}`, `{{orgName}}`, `{{recruiterName}}`,
`{{interviewTimes}}` (the formatted slot list, or the confirmed time),
`{{interviewLocation}}`, `{{panelNames}}`, `{{confirmLink}}`. Dates are
formatted with `Intl.DateTimeFormat('en-US', { dateStyle:'full',
timeStyle:'short', timeZone })` including the zone label.

## Components

### Backend

- **`interview-ics.ts`** (pure) — `buildInterviewIcs(data: { uid, startsAt: Date, endsAt: Date, summary, location, description }): string` → a `VCALENDAR` with one `VEVENT`, `DTSTART`/`DTEND` as UTC basic-format (`YYYYMMDDTHHMMSSZ`), CRLF-joined, properly escaped (commas/semicolons/newlines in text fields). Delivered as `attachments: [{ filename: 'interview.ics', content: Buffer.from(ics) }]`.
- **`interview-render.ts`** (pure) — `renderInterviewTemplate(subject, body, ctx)` (token replacement) + `formatSlot(startsAt, endsAt, timeZone)` helper. Or extend the shared render module; keep interview tokens in one place.
- **`InterviewsService`**:
  - `createInterview(context, actorUserId, entryId, { slots: {startsAt,endsAt}[], panelistUserIds: string[], location, timeZone, recruiterNote? })` — validate entry org-scoped; require ≥1 slot; validate each `panelistUserId` is an org user (org-scoped `user.findMany`); create the `Interview` (status `proposed`) + `InterviewSlot`s + `InterviewPanelist`s in one tx; audit `interview.created`. Returns the interview with slots + panel.
  - `sendInvite(context, actorUserId, interviewId)` — three-phase: (1) short tx load interview+entry+candidate+slots+panel (guard erased, **guard status `proposed`**), mint `interviewToken` if absent; (2) OUTSIDE tx render + `emailService.send` to the candidate (slot list + `confirmLink`) and to each panelist (details, "pending confirmation"); (3) short tx set `sentAt` + `sentByUserId`, audit `interview.invited`. Status stays `proposed` (the interview is publicly reachable once a token exists); re-sending a still-`proposed` interview just re-emails. A `declined`/`reschedule_requested`/`cancelled` interview is terminal — to try again the recruiter **schedules a new interview** (see reschedule below).
  - `getPublicInterview(token)` — resolve via `LOOKUP_ORG` bypass, generic NotFound; return safe display fields (job title, org name, slots, location, timeZone, panel first names, status, confirmedSlotId).
  - `respondPublic(token, { action: 'confirm'|'decline'|'reschedule', slotId?, note? })` — resolve; guard `status === 'proposed'` (else generic Conflict); on `confirm` require a valid `slotId` belonging to the interview; atomic `updateMany({ where: { id, organizationId, status:'proposed' }, data: { status, confirmedSlotId?, candidateReschedNote?, respondedAt } })`, `count===0 → Conflict`; audit `interview.confirmed`/`.declined`/`.reschedule_requested` (`actorUserId: null`). THEN OUTSIDE the tx: notify the `sentByUserId` recruiter; on `confirm`, also email the candidate a confirmation **with the ICS** for the chosen slot and email each panelist the final time **with the ICS**.
  - `cancel(context, actorUserId, interviewId)` — `→ 'cancelled'`, audit; the public page then shows a closed state.
  - `listForCandidate(context, candidateId)` / `getForEntry(context, entryId)` — recruiter surface.
  - `listMine(context, userId)` — interviews where `InterviewPanelist.userId === userId` (org-scoped), with confirmed slot + candidate/job — the panel view.
- **Controllers:**
  - Recruiter (`pipeline:manage`): `POST /pipeline/entries/:id/interviews` (create), `GET /pipeline/entries/:id/interviews`, `GET /candidates/:id/interviews`, `POST /interviews/:id/send`, `POST /interviews/:id/cancel`.
  - Panel (`interview:view_assigned`): `GET /interviews/mine`.
  - Public (unauthenticated, throttled): `GET /public/interviews/:token`, `POST /public/interviews/:token/respond`.
- **New permission** `interview:view_assigned` seeded (migration) onto `panel`, `recruiter`, `org_admin`.
- **GDPR erase:** in `candidates.service.ts` erase(), redact the candidate's interviews (clear `interviewToken`, null `recruiterNote`/`candidateReschedNote`, set `location`/notes to 'Redacted'), org-scoped, in the tx.

### Frontend

- **Candidate drawer:** an **Interviews** section (list: status badge, confirmed/proposed time, location) + a **Schedule interview** modal — repeatable slot rows (date+start+end), a **panel multi-select** from `useUsers()` (staff), location/link, timezone `<select>` (a curated IANA list), an optional note, **Send invite**.
- **Public interview page** `apps/web/app/(candidate)/interview/[token]/page.tsx` — clone the offer page: fetch on mount, render slots + location + panel; **Confirm** (radio-select a slot when >1) / **Decline** / **Request reschedule** (with an optional note); closed-state gating for non-`proposed`/`cancelled`.
- **Panel page** `apps/web/app/(panel)/interviews/page.tsx` — `GET /interviews/mine` list (candidate, job, confirmed time in the interview's timezone, location). Read-only. Add a nav entry in the panel nav.

## Data flow

1. Recruiter schedules (2 slots, 2 panelists, a Meet link, `America/New_York`) → `createInterview` → `sendInvite`: candidate emailed the two slots + confirm link; both panelists emailed "pending confirmation".
2. Candidate opens the link → picks slot #1 → **Confirm** → `respondPublic` sets `confirmedSlotId`, status `confirmed`; candidate gets a confirmation + `interview.ics`, panelists get the final time + `interview.ics`, recruiter notified.
3. Panelists see it on `(panel)/interviews`; the recruiter sees `confirmed` on the drawer and moves the pipeline as they choose.

## Error handling

- No candidate email / erased candidate → invite blocked (surfaced in UI).
- Slot/panelist validation: ≥1 slot; every panelist must be an org user (else 400); `confirm` requires a `slotId` that belongs to the interview (else generic Conflict — no oracle).
- SMTP/ICS send failure during `sendInvite` → status unchanged (`proposed`), audit `interview.send_failed`; recruiter retries. (Send is post-mint, outside the tx.)
- Public respond on a non-`proposed`/`cancelled` interview → generic Conflict + friendly closed page state.
- Deliverability guard (org without SMTP) → invite no-ops `success:false` (logged); reuse the no-SMTP banner in the schedule modal.

## Testing

- **Backend unit:** `buildInterviewIcs` (valid VCALENDAR, UTC DTSTART, escaped text); `renderInterviewTemplate`/`formatSlot` (timezone-correct formatting, tokens); `createInterview` (≥1 slot, panelist org-validation, tx creates slots+panel, audit); `sendInvite` three-phase with send OUTSIDE the tx (invocation-order), erased guard, candidate + panel emails; `respondPublic` (confirm sets slot+ICS to candidate+panel, decline/reschedule notify recruiter, atomic transition + generic Conflict on lost race + wrong-slot, anti-oracle NotFound); `listMine` (only the caller's assigned interviews, org-scoped); `cancel`; permission gates (`pipeline:manage`, `interview:view_assigned`, public throttled); GDPR erase scrub.
- **Frontend unit:** schedule modal (add/remove slots, panel multi-select, send); interviews drawer section; public page (single-slot confirm vs multi-slot pick, decline, reschedule-with-note, closed states); panel "my interviews" list.
- **Browser smoke (post-deploy):** schedule with 2 slots + a panelist (org with SMTP); open the public link; pick a slot + confirm; verify the candidate + panelist get the ICS, the recruiter is notified, and `(panel)/interviews` shows it; decline a second interview and confirm the closed state.

## Out of scope (v1)

External calendar sync (Google/Outlook) + interviewer availability/conflict
detection (the deferred "calendar" project); recurring interviews; candidate
proposing their own arbitrary times (they pick from offered slots); in-app
interviewer scorecards/feedback capture (the pipeline feedback timeline already
exists); SMS reminders; automatic reminder emails before the interview;
per-panelist individual accept/decline (panelists are informational recipients
in v1).
