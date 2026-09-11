# Interview Self-Booking (Zoho #22 slice) — Design

**Status:** approved in chat 2026-09-09. Ready for implementation planning.

## Goal

Let a candidate self-book an interview time (Calendly-style) from a
recruiter-defined availability window, instead of the recruiter hand-picking
discrete slots. The candidate opens the existing `/interview/[token]` page,
sees a computed list of open times, and books one — creating a confirmed
`Interview` on the pipeline entry.

## Why

Adopt candidate #22 (Calendar → Booking) from
`docs/ats/zoho-adopt-inventory.md`: "per-recruiter personal booking pages
(candidate self-books a slot, Calendly-style)". Today the platform only does
recruiter-proposes-discrete-slots → candidate-confirms-one. This slice adds
true self-service booking while staying inside the existing interview flow.
The external-calendar-sync / Meet-Teams-links half of #22 is out of scope
(needs OAuth credentials).

## Design decisions (settled in brainstorming)

1. **Scope:** per-interview self-book link (not a standing per-recruiter
   public page). The recruiter opens a self-book interview for a specific
   candidate/pipeline entry; it reuses `interviewToken` and stays
   ATS-integrated (a booking becomes a confirmed `Interview` on that entry).
2. **Availability:** a date-range window + a meeting duration, sliced into
   duration-sized slots, honoring the already-built org business hours +
   holidays (Zoho #2). No recurring-weekly-schedule engine.
3. **Conflicts:** a slot is bookable only if no panelist already has a
   confirmed interview overlapping it (and it is within business hours, not a
   holiday, and in the future).

## Existing flow this extends

- `Interview` (RLS) has `status`, `interviewToken @unique`, `timeZone`,
  `confirmedSlotId`, `slots InterviewSlot[]`, `panelists InterviewPanelist[]`.
- Recruiter creates an interview with discrete `InterviewSlot`s
  (`ScheduleInterviewModal`); `sendInvite()` mints `interviewToken` and emails
  `${FRONTEND_URL}/interview/:token`.
- Public: `GET /interview/:token` → `getPublicInterview` (returns slots +
  status); `POST` → `respondPublic` with `action: 'confirm' | 'reschedule'`.
  `confirm` sets `confirmedSlotId`.
- Business hours + holidays already exist (Zoho #2,
  `project_business_hours_holidays`) — an org-level config + a slot-evaluation
  helper. NOTE: `apps/web` cannot import `@exam-platform/shared` VALUES, so
  that project duplicated `evaluateSlot` web-side. This spec AVOIDS that trap
  (see "Web" — the web renders API-computed slots, never recomputes).

## Schema — additive columns on `Interview` (no new table, no `_rls`)

`interviews` is already an RLS table, so these additive columns need NO paired
`_rls` migration.

```prisma
model Interview {
  // ... existing fields ...
  bookingMode          String    @default("proposed") @map("booking_mode") // 'proposed' | 'self_book'
  bookingWindowStart   DateTime? @map("booking_window_start")
  bookingWindowEnd     DateTime? @map("booking_window_end")
  slotDurationMinutes  Int?      @map("slot_duration_minutes")
}
```

- `bookingMode` default `'proposed'` → every existing interview keeps today's
  behavior byte-for-byte; self-book is opt-in per interview.
- No new model: a booked time is stored as an ordinary `InterviewSlot`
  (created at booking) with the interview's `confirmedSlotId` pointing at it —
  identical to how a confirmed proposed-slot already looks downstream (ICS,
  panel view, cancel-notice all keep working unchanged).
- Migration `20260909260000_interview_self_booking` — additive columns only,
  **no `_rls`, no seed**. Numbered after the parked agency-portal `250000/1`
  to keep the chain linear across unmerged siblings.

## Slot generation — the trust boundary (pure server-side function)

A pure function `generateBookableSlots(input): { startsAt, endsAt }[]`:

- Input: `bookingWindowStart`, `bookingWindowEnd`, `slotDurationMinutes`, the
  interview `timeZone`, the org business-hours config, the org holiday list,
  the panelists' busy intervals (their other interviews' confirmed slots), and
  `now` (+ a small lead time, e.g. must start ≥ 1 hour out).
- Walks the window in `slotDurationMinutes` steps (step == duration; no
  buffer — out of scope). Keeps a candidate slot `[s, s+duration)` only if:
  1. `s >= now + leadTime`;
  2. the whole slot lies within that weekday's org business-hours open/close
     window (reuse the Zoho #2 business-hours logic; a day with no hours →
     no slots);
  3. the slot's date is not an org holiday;
  4. the slot does not overlap ANY panelist busy interval (a panelist's other
     confirmed interview's confirmed slot).
- Deterministic, timezone-correct (business hours are org-local; compute in
  the interview `timeZone`), pure and unit-testable. Lives API-side (e.g.
  `apps/api/src/interviews/booking-slots.ts`) alongside `interview-render.ts`.

**Re-validation on book (anti-tamper + anti-race):** the candidate's chosen
slot is NEVER trusted. On `book`, the server re-derives the current available
set (same function, fresh conflict read inside the tx) and confirms the chosen
`{startsAt,endsAt}` is still a member; if not → `409 Conflict` ("that time was
just taken"). Only then is the `InterviewSlot` created and confirmed.

## Endpoints

### Recruiter (authenticated, existing gating)

- `createInterview` / update: accept `bookingMode`. When `'self_book'`, require
  `bookingWindowStart < bookingWindowEnd` (both future-ish) and a
  `slotDurationMinutes` from an allowlist (e.g. 15/30/45/60); a self-book
  interview carries NO discrete `slots`. When `'proposed'` (default),
  behavior + validation exactly as today (requires slots). Same permission
  gate as the current create/update.
- `sendInvite`: unchanged — mints `interviewToken`, emails
  `${FRONTEND_URL}/interview/:token`.

### Public (unauthenticated, via `interviewToken`)

- `GET /interview/:token` (`getPublicInterview`): for `bookingMode:'self_book'`
  AND not yet confirmed, return `availableSlots: {startsAt,endsAt}[]` (from the
  generator) plus `bookingMode`, `slotDurationMinutes`, `timeZone`. For
  `'proposed'` (or an already-confirmed self-book), return exactly today's
  shape (discrete `slots` + `confirmedSlotId`). Same anti-oracle token
  resolution as today (unknown/!state → generic 404/consistent error).
- `POST /interview/:token` (`respondPublic`): add `action:'book'` with
  `{ startsAt, endsAt }`. Only valid when `bookingMode:'self_book'` and not
  already confirmed. Re-derive + re-check conflicts inside the tenant tx;
  member → create `InterviewSlot`, set `confirmedSlotId`, `status:'confirmed'`,
  `respondedAt`; non-member/taken → `409`. Existing `confirm`/`reschedule`
  actions (proposed mode) untouched; `book` on a proposed interview → 400.

## Web

- **Recruiter `ScheduleInterviewModal`:** a mode toggle — "Propose specific
  times" (today) vs "Let candidate pick a time" (self-book). Self-book shows a
  date-range picker + a duration `<select>` (15/30/45/60). Proposed mode
  unchanged. Sends `bookingMode` + the relevant fields.
- **Candidate `/interview/[token]` page:** for self-book (unconfirmed), render
  `availableSlots` grouped by day (Calendly-style list), each a Book button →
  `POST action:'book'` with that slot; on 409 refetch the list and show "that
  time was just taken". For proposed mode or an already-confirmed interview,
  render exactly today's UI. **The page renders API-provided slots only — it
  does NOT recompute availability** (this is why business-hours/holidays logic
  is not duplicated web-side here).
- Authenticated surfaces use `apiFetch`; the public interview page uses its
  existing raw-fetch pattern. No `@exam-platform/shared` VALUE import; no
  `ui-v2` barrel import in new files.

## Out of scope (deliberate)

- Recurring weekly availability / standing per-recruiter public booking pages.
- External calendar sync (Google/O365) + Meet/Teams link creation — the OAuth
  half of #22.
- Buffers/padding between meetings; per-panelist individual availability
  (uses the shared window + collective panelist busy-intervals).
- Notifying panelists of a new booking beyond existing interview mechanics.

## Testing focus

- **Slot generator (pure, exhaustive unit tests):** window slicing; a slot
  straddling the business-hours close is excluded; holiday days excluded;
  past/lead-time slots excluded; a slot overlapping a panelist's confirmed
  interview excluded; empty when no business hours that day; timezone
  correctness (business hours are org-local).
- **Anti-tamper/anti-race on book:** booking a slot NOT in the current set →
  409; booking a slot that a concurrent booking just filled (conflict at
  commit) → 409, no `InterviewSlot` created; a valid book creates exactly one
  slot + confirms.
- **Mode isolation:** a `proposed` interview still confirms/reschedules
  exactly as today (regression); `book` on proposed → 400; `confirm` on
  self-book behaves sanely.
- **Behavior-preserving:** existing interviews (bookingMode defaults
  `'proposed'`) are byte-identical through create/invite/confirm/ICS/cancel.

## Global constraints

- Multi-tenant: all interview reads/writes via `TenantPrismaService.forTenant`
  (public path resolves org via the interview token, as today).
- Additive columns on the already-RLS `interviews` table ⇒ NO `_rls`
  migration. Migration `20260909260000`, after parked siblings. No seed.
- Public URL is a Next page (`/interview/:token`) → `FRONTEND_URL` (unchanged;
  `sendInvite` already does this).
- `apps/web` cannot import `@exam-platform/shared` VALUES — the web renders
  API-computed slots and never recomputes availability.
- No new npm dependency. No `npm install` in the worktree.
- Do not weaken or change the existing proposed-mode confirm/reschedule
  authorization or behavior.
