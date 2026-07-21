# Walk-In Candidate Registration — Design

## Problem

Candidate onboarding today is invite-only: a recruiter creates a `Candidate` row and an `Invitation` (with a token), and an email is sent linking to `/start?token=...`. This doesn't work for walk-in exams, where a large crowd arrives on-site with no time to wait on email delivery (and sometimes no inbox access at the venue at all).

## Goal

Let a recruiter open one or more published exams for same-day, on-site self-registration. A candidate fills a short form (name, email, phone) at a public page scoped to their organization, picks an exam if more than one is open, and is dropped straight into the existing consent/instructions flow — no email round-trip.

## Scope

In scope: the self-registration page, the exam-side "walk-in enabled" toggle, the backend registration endpoint, and reuse of all existing exam-start/consent/attempt machinery.

Explicitly out of scope (to be designed separately, after this ships):
- **IP restriction** on exam access (recruiter-configured allowed IP/range per exam) — this is a general exam-access control affecting invited and walk-in candidates alike, not specific to walk-in registration.
- **Screen-sharing / third-party-tool detection** — this extends the existing Integrity & Anti-Cheating system (telemetry, similarity engine, integrity levels) and is a proctoring concern, not a registration concern.
- **Identity verification** (OTP, ID upload, etc.) — walk-in registration validates field *format* only (valid email syntax, required name, phone format if provided). It does not verify the candidate is who they claim to be. For a real event, that's an operational control (staff glancing at ID at the check-in desk), not a software gate — adding OTP/verification would reintroduce the waiting problem this feature exists to remove.

## Data Model Changes

`apps/api/prisma/schema.prisma`:

- `Exam.walkInEnabled Boolean @default(false)` — same shape as the existing `schedulingEnabled` flag. A recruiter may only enable it on a `published` exam (enforced app-side, matching the existing invite-send gate). Recruiter can flip it on/off at any time (e.g., on the morning of the event, off once the queue closes).
- `Invitation.source String @default("invited")` — new values: `"invited"` | `"walk_in"`. Lets Candidates/Audit Log screens distinguish origin later. No new screens are required now; this is forward-compatible tagging only.

No changes to `Candidate` — the existing `@@unique([organizationId, email])` constraint is the exact mechanism walk-in registration relies on for upsert/dedup.

## Recruiter-Facing Changes

- **Exam edit page** (`apps/web/app/(recruiter)/exams/[id]/edit/page.tsx`): a new checkbox "Enable walk-in registration for this exam", placed next to the existing `schedulingEnabled`/`randomizeOrder` toggles. Same form, same save action — no new endpoint needed beyond extending the existing exam-update DTO/handler with the new field.
- **Exams list** (`apps/web/app/(recruiter)/exams/page.tsx`): a small "Walk-in" badge on cards where `walkInEnabled` is true, using the existing `StatusBadge`/`CardGrid` pattern — lets a recruiter see at a glance which exams are currently open for self-registration.

## Backend: Registration Endpoints

New `WalkInModule` in `apps/api`, public routes (no auth), org-scoped by slug, rate-limited using the existing throttler module's strictest tier (already installed, Phase 6b).

### `GET /public/walk-in/:orgSlug/exams`

Returns the list of currently walk-in-enabled, published exams for that org: `{ id, title, durationMinutes }[]`. No sensitive data — only what's needed for the picker. Resolves org by slug; 404 if the slug doesn't match any organization.

### `POST /public/walk-in/:orgSlug/register`

Body: `{ examId: string, name: string, email: string, phone?: string }`.

Steps:
1. Resolve org by slug (404 if unknown).
2. Load the exam by `examId` scoped to that org. Reject with 400 unless `status === 'published' && walkInEnabled === true`. This is the hard gate: even if someone guesses or replays an `examId`, only exams the recruiter explicitly enabled are reachable — nothing else in that org's exam list is exposed.
3. Validate input: `name` required non-empty, `email` valid format, `phone` format-checked if present — reusing the existing `class-validator` DTO conventions already used for candidate creation.
4. Upsert `Candidate` by `(organizationId, email)` — create if new, otherwise reuse the existing row (same upsert pattern already used in `bulkUploadAndInvite`).
5. Duplicate/resume check, mirroring `InvitationsService.bulkInvite`'s existing logic: if a **live** invitation (`status: 'invited'`, `expiresAt > now`) already exists for `(candidateId, examId)`, reuse its token instead of creating a new one — this is what makes a retry/back-button/shared-kiosk resubmission resume seamlessly rather than erroring or duplicating. Otherwise, create a new `Invitation` with `source: 'walk_in'`, using the existing `generateToken()` and `resolveInvitationExpiry(exam)` helpers unchanged.
6. Return `{ token }`. Unlike `bulkInvite`, this path never calls `dispatchInvitationEmail` — the candidate is standing at the registration page already, so no email is sent for a walk-in invitation.

No new session/auth logic is introduced. The frontend takes the returned token and hands off entirely to the existing `/start?token=...` page, which already performs redemption, resume-session-kick, and routing to `/welcome` → consent → attempt start, unchanged.

## Candidate-Facing Flow

New page: `apps/web/app/walk-in/[orgSlug]/page.tsx` — public route, no auth wrapper, alongside `/login` and `/start`.

1. On load, call `GET /public/walk-in/:orgSlug/exams`.
2. **Zero exams enabled** → show "No exams are currently open for walk-in registration right now." No form is rendered.
3. **One exam enabled** → skip the picker; the form only asks for name/email/phone, with the single exam implied.
4. **Two or more enabled** → show the name/email/phone form, then an exam picker (reusing `CardGrid`/`Select` conventions from the recruiter invite UI), then a single "Start" submit.
5. On submit, `POST /public/walk-in/:orgSlug/register`. On success, `router.push('/start?token=' + token)` — from here the flow is 100% existing code.

## Error Handling

- **Field validation errors** (bad email format, missing name): inline field errors, same `Input`/error-text pattern as the existing `CandidateInviteForm`.
- **Unknown org slug / zero exams enabled**: friendly full-page message, not a raw 404/500.
- **Exam disabled mid-queue**: if a recruiter flips `walkInEnabled` off while candidates are still mid-form, the register call re-validates `walkInEnabled` server-side (step 2 above), so anyone with a stale page open gets a clear "this exam is no longer accepting walk-in registrations" error on submit — never a silent success against a closed exam.
- **Rate limit hit**: standard throttler 429, shown as "too many attempts, please wait."

## Results & Reporting

No new reporting surface is needed. Walk-in candidates are real `Candidate` + `Invitation` + `Attempt` rows, identical in shape to invited candidates (just `source: 'walk_in'` on the invitation). They appear in the existing recruiter Candidates list, the Interview Panel exam results page (stat cards, pass/fail badges), and the candidate detail report — searchable by the exact name/email entered at check-in — with no separate code path.

## Testing

- Backend: unit tests for the registration endpoint covering — exam not published, exam not walk-in-enabled, wrong org slug, new candidate creation, existing-candidate reuse, live-invitation reuse (resume path), expired-invitation replacement (new token issued), and validation failures.
- Frontend: tests for the three exam-count branches (0/1/2+), form validation errors, and the redirect-to-`/start`-on-success behavior.
- E2E (Playwright): one golden path — enable walk-in on a published exam as a recruiter, register as a new walk-in candidate, confirm landing on `/welcome`, complete the exam, and confirm the result appears in the recruiter's exam results page with the correct name/email and a `walk_in` source tag.
