# Exam Scheduling — Design Spec

## 1. Context & Scope

Today, sending a candidate an invitation means "start whenever, within a hardcoded 7-day expiry" — `apps/api/src/invitations/invitations.service.ts`'s `bulkInvite()` sets `Invitation.expiresAt = addDays(now(), INVITATION_EXPIRY_DAYS)` (7 days, a hardcoded constant), and nothing else gates when a candidate can begin their attempt.

This phase adds an optional per-exam **availability window**: a recruiter can turn scheduling on for a specific exam and set an open/close datetime range. Candidates invited to that exam can only *start* their attempt inside that window — everything after starting (duration, auto-submit-on-timeout, grading) is completely unaffected.

**A real gap found during design research:** the candidate-facing attempt-start endpoint (`apps/exam-runtime/src/attempts/attempt.service.ts`'s `start()`, via `resolveContext()`) currently performs **zero** validity check on the invitation — no status check, no expiry check. The only validity check in the whole candidate flow today is a one-time check inside `candidate-auth.service.ts`'s `redeem()`. Once a candidate holds a valid access token (issued at redeem time, 4-hour TTL), they can call `start()` at any later moment with no further server-side gate, even past the invitation's `expiresAt` or after a recruiter revokes it. This phase adds the first real-time validity check on that endpoint, but **only for scheduled exams** (see §4) — non-scheduled exams keep today's zero-check behavior unchanged, since closing that gap generally is a separate, unscoped concern.

**Existing pattern this reuses directly:** `Exam.randomizeOrder: Boolean @default(false)` is the only existing per-exam boolean toggle, and its five-file plumbing (schema field → `CreateExamDto`/update DTO → `exams.service.ts` create/update → `Exam` type + hook payload type in `apps/web` → checkbox in `ExamDetailsForm.tsx`) is the exact template this feature follows for `schedulingEnabled`.

## 2. Scope Decisions

- **Per-exam toggle, recruiter-controlled** — not an org-level admin default. Any recruiter building an exam can turn scheduling on/off for that exam, the same way they already control `randomizeOrder`. No new permission, no org-admin involvement.
- **One shared window per exam, not per-invitation.** Every candidate invited to a scheduled exam sees the same open/close window. No per-candidate override exists in this phase — explicitly chosen over per-invitation windows for simplicity, with the accepted tradeoff described in §5.
- **"Any time within a window," not fixed bookable slots and not recruiter-proposed times.** A recruiter sets one open datetime and one close datetime; a candidate can start any time in between (subject to the exam's normal duration, unaffected by window edges — see §3). No slot capacity, no booking calendar, no meeting-style time proposals.
- **The window only gates the *start* moment, never the finish.** Once a candidate starts (anywhere inside the window), they get the exam's full normal duration and today's existing auto-submit-on-timeout behavior, completely unchanged — even if the window closes while they're mid-attempt.
- **The window's close time *is* the invitation's expiry for a scheduled exam — no separate 7-day rule stacked on top.** Avoids two independent clocks that could disagree. Non-scheduled exams are entirely unaffected and keep today's 7-day hardcoded expiry.
- **A candidate can redeem their invite (log in) any time before the window opens** and sees a waiting screen with the open date, rather than being blocked from logging in at all. Confirms the invite is valid ahead of time without letting them start early.
- **No self-service candidate rescheduling.** If the window closes and a candidate never started, their invitation becomes unusable and they see a "contact the recruiter" message. The recruiter's only recovery lever is editing the exam's window (which reopens it for every candidate on that exam — see §5) or, in practice, coordinating a new exam/window outside this phase's scope. No request/approve workflow.

## 3. Data Model

`Exam` (`apps/api/prisma/schema.prisma`) gains three fields, following `randomizeOrder`'s exact convention (plain fields, `@map` snake_case, no side table):

```prisma
model Exam {
  // ...existing fields...
  schedulingEnabled        Boolean   @default(false) @map("scheduling_enabled")
  availabilityWindowStart  DateTime? @map("availability_window_start")
  availabilityWindowEnd    DateTime? @map("availability_window_end")
}
```

Both window fields are `NULL` when `schedulingEnabled` is `false`, and both are required together when it's `true` — validated server-side on exam create/update: both present, `availabilityWindowEnd` strictly after `availabilityWindowStart`.

`Invitation.expiresAt` (unchanged column) becomes a **synced cache, not the source of truth**, for scheduled exams:
- `bulkInvite()`/`resend()` set `expiresAt = exam.availabilityWindowEnd` at send/resend time (instead of `addDays(now(), 7)`) when `exam.schedulingEnabled` is true.
- Editing a scheduled exam's window re-syncs `expiresAt` on every invitation for that exam that is still `status: 'invited'` **and has no associated `Attempt`** (i.e. genuinely not yet started) to the new `availabilityWindowEnd`. Invitations whose candidate already started (or completed) are deliberately excluded from the sync — their `expiresAt` is no longer meaningful to them and re-syncing it would just be misleading noise in the candidates list.
- The actual runtime gates (below) never trust the cached `expiresAt` for a scheduled exam — they read `exam.schedulingEnabled`/`availabilityWindowStart`/`availabilityWindowEnd` live, so a window edit takes effect immediately for every not-yet-started candidate with zero migration step, even if the `expiresAt` sync were somehow skipped.

Non-scheduled exams are entirely unaffected: `expiresAt` keeps meaning exactly what it means today, and no window fields are ever read for them.

## 4. Enforcement Points

**`candidate-auth.service.ts`'s `redeem()`** — unchanged logic, but its existing `expiresAt < now()` check now correctly reflects the window's end for scheduled exams (via the synced `expiresAt`). Per §2, redeeming *before* the window opens must still succeed (tokens are minted normally) — "not open yet" is a state the candidate sees *after* redeeming, not a redeem-time block.

**`attempt.service.ts`'s `start()` (via `resolveContext()`)** — the actual new gate, and the fix for the zero-validation gap described in §1. When `exam.schedulingEnabled` is true, `start()` rejects with a `BadRequestException` if:
- `now() < exam.availabilityWindowStart` — message distinguishes this as "window not open yet."
- `now() > exam.availabilityWindowEnd` — message distinguishes this as "window closed."

An already-existing `Attempt` is still returned idempotently regardless of window state (today's behavior, unchanged) — the window only ever gates the very first `start()` call that creates the `Attempt` row. A candidate already mid-attempt or already submitted is never affected by the window.

Non-scheduled exams: `start()` continues to perform no time-based check at all — this phase does not add a general expiry check for unscheduled exams, only for scheduled ones. (The zero-validation gap for non-scheduled exams is a pre-existing characteristic, not something this phase is scoped to fix.)

## 5. Screens

**Recruiter — `ExamDetailsForm.tsx`:** gains an "Enable scheduling" checkbox alongside the existing duration/pass-criteria/randomize-order fields. When checked, two datetime pickers appear (window opens / window closes), with the same client-side validation as the server (both required, end after start). The window is editable at any time the exam itself is editable today — no new "locked after publish" rule. Editing it after invitations are sent takes effect immediately for every invited candidate who hasn't started yet (§3/§4), and re-syncs `expiresAt` for display accuracy.

**Recovering one missed candidate (accepted tradeoff, stated plainly):** because the window is shared per-exam, not per-invitation, there is no way to grant a single candidate a different window in this phase. The recruiter's only lever is editing the exam's window, which reopens access for every candidate on that exam, not just the one who missed it. A fresh invitation to the same exam does not help on its own, since it still points at the same shared window.

**Candidate — pre-attempt preview screen**, driven by extending the existing pre-attempt response (`AttemptPreview`) with `schedulingEnabled`/`availabilityWindowStart`/`availabilityWindowEnd` when `schedulingEnabled` is true:
1. **Before the window opens:** the welcome screen shows "Your exam opens on [date/time]" in place of the Start button.
2. **Within the window:** today's normal welcome → start flow, entirely unchanged.
3. **After the window closes, attempt never started:** a distinct "This exam's availability window has closed — contact the recruiter" screen, deliberately different from today's "invitation revoked" message so candidates and recruiters aren't confused about which happened.
4. **Already started or submitted:** entirely unaffected by the window — today's in-progress/submitted screens, unchanged.

## 6. Error Handling & Empty States

- `start()` outside the window: `BadRequestException`, with a message distinguishing "not open yet" from "window closed" so the candidate frontend can render the correct one of states 1/3 above.
- `redeem()`: unchanged behavior otherwise — still rejects on `expiresAt < now()` (now driven by the window end for scheduled exams), `revoked` status, or a non-`published` exam, exactly as today.
- Exam create/update: rejects `schedulingEnabled: true` submitted with a missing window field, or `availabilityWindowEnd <= availabilityWindowStart`, with a clear validation message — mirrors how other exam-field validation already surfaces errors in `ExamDetailsForm`.
- No interaction with proctoring, grading, AI review, or the code-question-type feature — scheduling exclusively gates the moment before an `Attempt` row is created, nothing after.
- Toggling `schedulingEnabled` off on an exam that already has scheduled invitations: those invitations' `expiresAt` stays at its last-synced value (no further syncing happens once scheduling is off) and the runtime gate stops applying entirely — candidates can start any time from then on, matching non-scheduled behavior. This is a deliberate simplification: turning scheduling off is an explicit recruiter action and reverts the exam fully to today's "start whenever" behavior.

## 7. Testing

- **Backend unit:** `attempt.service.ts`'s `start()` — rejects before window open, rejects after window close, allows within window, idempotently returns an existing attempt regardless of window state; `exams.service.ts`'s create/update validation for the new fields (missing window with `schedulingEnabled: true`, `end <= start`).
- **Backend e2e:** full flow — recruiter creates a scheduled exam with a window, invites a candidate, the candidate cannot start before the window opens, can start and complete normally once inside it, and a second candidate who never started can no longer start once the window closes. A separate case confirms editing the exam's window immediately changes access for a not-yet-started invitation (no restart of the app/process needed, proving the live-read behavior from §3).
- **Frontend component:** `ExamDetailsForm`'s new fields and validation; the candidate welcome screen's three new states (waiting / normal / closed).
- **Playwright:** extend or add a golden-path spec covering the "starts before window opens → blocked, starts after window opens → succeeds" transition — the one behavior only a real time-dependent flow proves, matching this project's existing convention of using Playwright for the one thing unit/e2e specs can't.
