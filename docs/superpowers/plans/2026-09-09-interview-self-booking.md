# Interview Self-Booking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a candidate self-book an interview time (Calendly-style) from a recruiter-defined window, reusing the existing interview token + public page + confirm/ICS machinery.

**Architecture:** Additive `bookingMode`/window/duration columns on `Interview` (no new table). A pure server-side slot generator (window sliced by duration, honoring org business hours + holidays + panelist conflicts) is the trust boundary; the public GET returns computed `availableSlots` and the public POST `book` re-derives + re-checks at commit (409 on race). Recruiter modal gets a mode toggle; the candidate page renders API-computed slots (never recomputes).

**Tech Stack:** NestJS + Prisma (SQL Server) API, Next.js (apps/web), `@exam-platform/shared` (business-hours helper), Jest.

**Spec:** docs/superpowers/specs/2026-09-09-interview-self-booking-design.md

## Global Constraints

- All interview reads/writes via `TenantPrismaService.forTenant`. The public path resolves org via the interview token (as today) — do not change that resolution.
- Additive columns on the already-RLS `interviews` table ⇒ **NO `_rls` migration**. Migration `20260909260000_interview_self_booking` (after parked agency-portal `250000/1` — keep the chain linear). **No seed.**
- **NEVER `npm install`/`ci`/`update`** in the worktree. Only Task 1 runs `prisma migrate deploy` / `prisma generate`.
- The public interview URL is a Next page (`/interview/:token`) → `FRONTEND_URL` (unchanged; `sendInvite` already builds it).
- `apps/web` cannot import `@exam-platform/shared` VALUES at runtime — the web renders API-computed slots and NEVER recomputes availability. (types-only shared import OK.) No `ui-v2` barrel import in new web files.
- Do NOT change or weaken the existing proposed-mode create/confirm/reschedule behavior or authorization. `bookingMode` defaults `'proposed'` so every existing interview is byte-identical.
- Reuse the shared `evaluateSlot(startsAtIso, businessHours, holidays)` from `packages/shared/src/scheduling/business-hours.ts` for the hours/holiday checks — do not reimplement business-hours logic.
- Every commit verifies `git branch --show-current` == `feat/interview-self-booking` in the same command.

---

### Task 1: Schema + migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (Interview model — 4 additive columns)
- Create: `apps/api/prisma/migrations/20260909260000_interview_self_booking/migration.sql`

**Interfaces:**
- Produces: `Interview.bookingMode` (String, default `'proposed'`), `bookingWindowStart`/`bookingWindowEnd` (DateTime?), `slotDurationMinutes` (Int?) — consumed by T3/T4.

- [ ] **Step 1: Add the columns to the `Interview` model**

```prisma
  bookingMode          String    @default("proposed") @map("booking_mode")
  bookingWindowStart   DateTime? @map("booking_window_start")
  bookingWindowEnd     DateTime? @map("booking_window_end")
  slotDurationMinutes  Int?      @map("slot_duration_minutes")
```

- [ ] **Step 2: Write the migration SQL**

Create `20260909260000_interview_self_booking/migration.sql` — an `ALTER TABLE [interviews] ADD` of the four columns, matching SQL-Server conventions of a recent additive migration (grep the migrations dir for an `ALTER TABLE ... ADD` example; use `NVARCHAR(1000)` for `booking_mode` with a named `DEFAULT 'proposed'` constraint, `DATETIME2 NULL` for the two windows, `INT NULL` for duration). **No `_rls` file** (interviews is already RLS; additive columns need none). No seed.

- [ ] **Step 3: Apply + regenerate**

From `apps/api`: `npx prisma migrate deploy` then `npx prisma generate`. (Only this task runs these.) If `prisma generate` hits a DLL file lock from another session's `node dist/main`, do not kill a process you can't confirm is yours — report + retry.

- [ ] **Step 4: Verify tsc**

From `apps/api`: `npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260909260000_interview_self_booking
git commit -m "feat(self-booking): additive Interview booking-mode + window + duration columns"
```

---

### Task 2: Pure slot generator + exhaustive unit tests

**Files:**
- Create: `apps/api/src/interviews/booking-slots.ts`
- Create: `apps/api/src/interviews/booking-slots.spec.ts`

**Interfaces:**
- Produces: `generateBookableSlots(input: BookableSlotsInput): { startsAt: string; endsAt: string }[]` and the `BookableSlotsInput` type — consumed by T4.

```ts
export interface BusyInterval { startsAt: string; endsAt: string } // ISO
export interface BookableSlotsInput {
  windowStart: string;            // ISO
  windowEnd: string;              // ISO
  slotDurationMinutes: number;
  businessHours: BusinessHours | null;   // from @exam-platform/shared
  holidays: Holiday[];                   // from @exam-platform/shared
  busyIntervals: BusyInterval[];   // panelists' confirmed slots
  now: string;                     // ISO (injected for testability)
  leadTimeMinutes?: number;        // default 60
}
```

- [ ] **Step 1: Write failing tests**

`booking-slots.spec.ts` — cover, with fixed `now` and a simple 9-to-17 Mon–Fri `BusinessHours`:
- window sliced into N duration-sized slots (e.g. a 9:00–11:00 window, 30 min → 09:00,09:30,10:00,10:30 starts).
- a slot whose END exceeds business-hours close is excluded (10:45 start, 30 min, close 11:00-ok; but 10:45 start w/ close 11:00 and 30min → end 11:15 excluded).
- a slot on a holiday date is excluded.
- a slot starting before `now + leadTime` is excluded.
- a slot overlapping a `busyIntervals` entry is excluded (partial overlap on either edge, and full-contain both ways).
- a weekday with `enabled:false` yields no slots.
- `businessHours: null` → hours check is a no-op (only lead-time + conflicts + window apply).
- timezone: business hours are evaluated in `businessHours.timeZone` (a slot at 08:30 local excluded when open is 09:00 even if the ISO UTC hour differs).

Run: `npx jest --testPathPattern "src/interviews/booking-slots"` → FAIL.

- [ ] **Step 2: Implement `generateBookableSlots`**

Pure function. Import `evaluateSlot`, `BusinessHours`, `Holiday` from `@exam-platform/shared` (the API can import shared values). Algorithm:
- Step from `windowStart` in `slotDurationMinutes` increments while `start + duration <= windowEnd`.
- For each candidate `[start, end)`:
  - skip if `start < now + leadTime` (leadTime default 60).
  - **hours/holiday:** compute `hoursStart = evaluateSlot(startIso, businessHours, holidays)` and `hoursEnd = evaluateSlot((end − 1 minute) ISO, businessHours, holidays)`; skip unless `!hoursStart.outsideHours && !hoursEnd.outsideHours && hoursStart.holiday === null && hoursEnd.holiday === null`. (Evaluating `end − 1 min` — not `end` — makes a slot ending exactly at close valid while rejecting one that spills past close; reusing the shared helper for both edges also catches a slot straddling a holiday/day boundary.)
  - **conflicts:** skip if `[start,end)` overlaps any `busyIntervals` entry (`start < b.endsAt && end > b.startsAt`).
  - else emit `{ startsAt: startIso, endsAt: endIso }`.
- Return the list (chronological).

Run tests → PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/interviews/booking-slots.ts apps/api/src/interviews/booking-slots.spec.ts
git commit -m "feat(self-booking): pure bookable-slot generator (hours/holiday/conflict/lead-time)"
```

---

### Task 3: Recruiter create/update — self-book mode

**Files:**
- Modify: `apps/api/src/interviews/interviews.service.ts` (`createInterview` + any update path)
- Modify: `apps/api/src/interviews/dto/*` (the create/update DTO)
- Modify: `apps/api/src/interviews/interviews.service.spec.ts`

**Interfaces:**
- Consumes: T1 columns.
- Produces: interviews persisted with `bookingMode:'self_book'` + window + duration (no discrete slots) — consumed by T4.

- [ ] **Step 1: Failing test**

Extend `interviews.service.spec.ts`: creating with `bookingMode:'self_book'` + `bookingWindowStart/End` + `slotDurationMinutes` persists those and NO slots; `self_book` without a window or duration → `BadRequestException`; `self_book` with `windowStart >= windowEnd` → `BadRequestException`; a duration not in the allowlist (15/30/45/60) → `BadRequestException`; **proposed mode (default / explicit) still requires + persists discrete slots exactly as today** (regression assertion). Run: `npx jest --testPathPattern "src/interviews/interviews.service"` → FAIL on the new cases.

- [ ] **Step 2: Implement**

In the create/update DTO add optional `bookingMode?: 'proposed' | 'self_book'`, `bookingWindowStart?`, `bookingWindowEnd?` (ISO date-time), `slotDurationMinutes?` (`@IsIn([15,30,45,60])`). In `createInterview` (and update): if `bookingMode === 'self_book'` → require window + duration, validate `start < end`, persist the columns, do NOT create slots; else (proposed, the default) → existing path verbatim (require slots). Keep the same permission gate and tenant scoping. Do not change `sendInvite`.

Run tests → PASS.

- [ ] **Step 3: tsc + commit**

`npx tsc --noEmit`; then:
```bash
git add apps/api/src/interviews
git commit -m "feat(self-booking): recruiter create self-book interview (window + duration)"
```

---

### Task 4: Public read + book (trust boundary)

**Files:**
- Modify: `apps/api/src/interviews/interviews.service.ts` (`getPublicInterview`, `respondPublic`)
- Modify: `apps/api/src/interviews/dto/*` (respond DTO — add `action:'book'` + `startsAt`/`endsAt`)
- Modify: `apps/api/src/interviews/public-interviews.controller.ts` (if needed for the DTO)
- Modify: `apps/api/src/interviews/interviews.service.spec.ts`

**Interfaces:**
- Consumes: T2 `generateBookableSlots`, T1 columns, T3-created self-book interviews.
- Produces: public `availableSlots` on GET; `book` action on POST.

- [ ] **Step 1: Failing tests**

Add to the interviews service spec (mock `forTenant`/tx + inject a fixed `now`):
- `getPublicInterview` on a `self_book`, unconfirmed interview returns `bookingMode:'self_book'`, `slotDurationMinutes`, `timeZone`, and `availableSlots` from the generator (seed business hours/holidays + a panelist busy interval and assert the busy slot is absent). On a `proposed` interview it returns today's shape (slots + confirmedSlotId) unchanged.
- `respondPublic` `action:'book'` with a slot IN the available set → creates one `InterviewSlot`, sets `confirmedSlotId` + `status:'confirmed'` + `respondedAt`; returns confirmed.
- `book` with a slot NOT in the current set → `ConflictException` (409), NO `InterviewSlot` created.
- `book` where a conflict appears at commit (a panelist busy interval now covers it) → 409, nothing created.
- `book` on a `proposed` interview → `BadRequestException`.
- existing `confirm`/`reschedule` on proposed still pass (regression).

Run → FAIL.

- [ ] **Step 2: Implement**

- `getPublicInterview`: after resolving the interview by token, if `bookingMode === 'self_book'` and not yet confirmed, gather inputs and call `generateBookableSlots`:
  - business hours + holidays: read the org config (same source the slot picker / Zoho #2 uses — locate it, e.g. `organizations.service` business-hours getter) via the token-resolved org context.
  - `busyIntervals`: the confirmed slots of the panelists' OTHER interviews — query interviews where a panelist userId is in this interview's panelists, `status:'confirmed'`, `confirmedSlotId` not null, excluding this interview; map each confirmed slot to `{startsAt,endsAt}`.
  - return `{ ...baseFields, bookingMode, slotDurationMinutes, timeZone, availableSlots }`. For proposed/confirmed → today's response shape (do not add availableSlots).
- `respondPublic`: add `action:'book'`. Guard: only when `bookingMode==='self_book'` and not already confirmed (else 400/409 as appropriate; `book` on proposed → 400). Inside the tenant tx: re-derive `generateBookableSlots` with a FRESH busy-intervals read; assert the posted `{startsAt,endsAt}` is a member (exact ISO match) → else `ConflictException`. Create the `InterviewSlot` (`interviewId`, `organizationId`, startsAt/endsAt), set `confirmedSlotId` to it, `status:'confirmed'`, `respondedAt`. Return the same shape existing responses use.
- Keep `confirm`/`reschedule` (proposed) branches untouched.

Run tests → PASS.

- [ ] **Step 3: tsc + full interviews suite + commit**

`npx tsc --noEmit`; `npx jest --testPathPattern "src/interviews"` (all green — generator, service, controllers, ics, render). Commit:
```bash
git add apps/api/src/interviews
git commit -m "feat(self-booking): public availableSlots + book action (re-validate, anti-race 409)"
```

---

### Task 5: Web — recruiter modal toggle + candidate booking page

**Files:**
- Modify: `apps/web/app/v2/(recruiter)/jobs/ScheduleInterviewModal.tsx` (+ its test)
- Modify: `apps/web/app/(candidate)/interview/[token]/page.tsx` (+ its test)
- Modify: the web interview types (grep for the interview response type in `apps/web/lib/types.ts`)

**Interfaces:**
- Consumes: the T3/T4 endpoints.

- [ ] **Step 1: Recruiter modal**

Add a mode toggle to `ScheduleInterviewModal`: "Propose specific times" (existing) vs "Let candidate pick a time". Self-book shows a date-range (start/end datetime) + a duration `<select>` (15/30/45/60) and sends `bookingMode:'self_book'` + `bookingWindowStart/End` + `slotDurationMinutes` (no slots). Proposed mode unchanged. Update `ScheduleInterviewModal.test.tsx` to cover the toggle → self-book payload, and keep the existing proposed-mode test green.

- [ ] **Step 2: Candidate page**

In `/interview/[token]/page.tsx`: when the GET response has `bookingMode:'self_book'` and is unconfirmed, render `availableSlots` grouped by day (reuse the page's existing date/time formatting) with a Book button per slot → `POST { action:'book', startsAt, endsAt }`; on 409 refetch and show "that time was just taken". Proposed mode and already-confirmed interviews render exactly today's UI. Do NOT recompute availability client-side. Update `page.test.tsx`: a self-book fixture renders slots + books; keep the existing proposed-mode test green.

- [ ] **Step 3: tsc + scoped web tests + commit**

`npx tsc --noEmit` (web); `npx jest --testPathPattern "ScheduleInterviewModal|interview/\\[token\\]"` green (allow only the known pre-existing ImpersonationBanner failure). Commit:
```bash
git add apps/web
git commit -m "feat(self-booking): recruiter self-book toggle + candidate booking page"
```

---

## Self-review notes

- **Spec coverage:** T1 columns+migration (no _rls); T2 the pure generator (hours/holiday/conflict/lead-time — the correctness core); T3 recruiter self-book create + validation + proposed regression; T4 public availableSlots + book re-validate/anti-race (the trust boundary); T5 both web surfaces. All spec sections mapped.
- **Correctness-critical (extra review scrutiny):** T2 (generator — exhaustive unit tests) and T4 (book trust boundary — re-derive + conflict re-check at commit, never trust the client slot; proposed-mode regression).
- **No _rls** (additive on RLS table); migration `260000` linear after parked `250000/1`; no seed.
- **Web dodges the shared-values trap:** renders API-computed slots, never recomputes — so `evaluateSlot` is NOT duplicated web-side.
- **Behavior-preserving:** `bookingMode` defaults `'proposed'`; every existing interview path is untouched.
