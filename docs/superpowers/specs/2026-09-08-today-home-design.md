# Today home — Design

**Date:** 2026-09-08
**Status:** Approved (design), pending spec review
**Why:** The recruiter dashboard reads as a generated template (see the canvas: https://claude.ai/code/artifact/cadde746-7cde-4f75-b527-fba5b73d1485 and the "Information design" chapter of `docs/brand/workfox-ui-review-checklist.md`). The fix is a home built around the recruiter's obligations — a person + context + one next action — not a restyle.
**Branch:** `feat/today-home` (off `docs/design-voice` @ `3fb282b4`, which is `main` @ `08ae024e` + the design-voice docs commit; fast-forwards `main` and carries the rulebook into the working tree).

## Goal

A new landing page, **Today**, that answers "what needs me right now" for the signed-in recruiter: feedback they owe, their interviews today, offers about to expire, approvals waiting on them; plus a short org-wide "worth a look" rail and a quiet week strip. No new tables. The existing dashboard is untouched and stays reachable.

## Scope

**In:** `GET /dashboard/today` (one tenant-scoped, per-user aggregate on the existing `DashboardModule`); the `/v2/today` page in the recruiter route group; "Today" as the first nav item (recruiter + super-admin nav, `V2_ROUTES`); the recruiter landing redirect → `/v2/today` (both `staff-landing.ts` and its unit-tested mirror `staff-routing.ts`, and the platform "act into org" push); tests.

**Out (deferred):** removing or changing the old dashboard; retoning other v2 pages; dark-mode polish beyond the tokens; per-item dismiss/snooze; org-admin or panel landing changes (org_admin keeps `/v2/users`, panel keeps `/v2/panel/reports`); notifications/real-time refresh (the page fetches on load; a manual refresh is enough for v1).

## Decisions (rulings baked in)

1. **Today is added, not swapped** (user decision): new route `/v2/today`; Dashboard remains as the second nav item. Only the recruiter landing branch changes.
2. **One endpoint, one payload.** The page never computes obligations; the server decides what is owed and what comes first. No client-side joins across five endpoints.
3. **"Today" is the user's day:** boundaries from `User.timeZone` (fallback `UTC`), computed server-side. The payload returns `today.iso` (YYYY-MM-DD) and `today.timeZone` so the client only formats.
4. **Group definitions (exact):**
   - **Feedback you owe** — interviews where the user is a panelist (`InterviewPanelist.userId = user`), `status = 'confirmed'`, the confirmed slot's `endsAt` is within the last 14 days and before now, and the candidate's pipeline entry has **no** `PipelineFeedback` with `authorUserId = user`. Erased candidates excluded. Oldest first (most overdue at the top).
   - **Interviews today** — the user's panelist interviews, `status = 'confirmed'`, confirmed slot `startsAt` within [dayStart, dayEnd) in the user's timezone, and has not yet ended (`endsAt >= now`). Soonest first. An interview belongs to exactly one group: once it ends it moves to "Feedback you owe" (or drops off once rated), never both.
   - **Offers expiring** — `Offer.status = 'sent'`, `respondedAt IS NULL`, `expiresAt` in (now, now + 3 days]. Soonest first. Org-wide (offers are not owned by a user).
   - **Approvals waiting on you** — `ApprovalRequest.status = 'pending_approval'` and the current step of the frozen chain (`JSON.parse(chainSnapshotJson)[currentStepPosition].approverUserIds`) includes the user — the same predicate the approvals inbox already uses; reuse it, do not re-derive. Oldest submitted first.
   - **Worth a look** (org-wide): stale invitations = the summary's exact rule (`status 'invited'`, `invitedAt <= now − STALE_INVITATION_DAYS`, no attempt) as a count; proctoring flags = the summary's recent-flags rule as a count; next drive = the soonest `DriveSession` with `endsAt > now` (name, group name, `startsAt`, `registered = count(Invitation where driveSessionId)`), or null.
   - **This week** — the existing summary for window `7d`: `newApplicants = stats.totalCandidates`, `invited = stats.invitationsSent`, `awaitingGrading = stats.pendingGradingCount`; `passRate` (0–100, nullable) only if `DashboardService` already exposes a 7-day pass rate cheaply — otherwise `null` and the page omits the sentence.
5. **Gating:** identical to `GET /dashboard/summary` — the same `@RequireAnyPermission('exam:manage', 'results:view')` on top of the class-level `JwtAuthGuard` + `PermissionsGuard`. A user with no interviews/approvals simply gets empty groups.
6. **No new dependency; no schema change; no seed.**
7. **Design rules apply verbatim** (`apps/web/AGENTS.md` block + the checklist's "Information design" chapter): person + context + one action per row; one focal point (the count in the greeting and the first owed action); groups with zero items are not rendered; dense rows; Bricolage only for the greeting; sentence case; no exclamation marks; no gradients, gauges or stat tiles; tokens only (`var(--org-primary)` is the accent slot); ui-v2 primitives only.

## Architecture

### API — `GET /dashboard/today`

`DashboardController.getToday(@CurrentTenant() tenant, @CurrentUserId() userId)` → `DashboardService.getToday(tenant, userId)`. One `forTenant` transaction; the per-user groups filter by `userId`, the org-wide parts do not.

```ts
export interface TodayItem {
  id: string;                 // interview / offer / approval id
  candidateId: string | null;
  candidateName: string;      // for approvals: the subject label (job title or offer candidate)
  subtitle: string;           // "Senior Backend Engineer · interviewed yesterday · scorecard due today"
  at: string | null;          // ISO instant when time-bound (interview start, offer expiry); null otherwise
  actionLabel: string;        // "Add feedback" | "Open brief" | "Nudge" | "Review"
  actionHref: string;         // existing surface for that entity (see below)
}
export interface TodayResponse {
  today: { iso: string; timeZone: string };
  needsYou: {
    feedbackOwed: TodayItem[];
    interviewsToday: TodayItem[];
    offersExpiring: TodayItem[];
    approvalsPending: TodayItem[];
    total: number;            // sum of the four, for the greeting
  };
  watch: {
    staleInvitations: number;
    proctoringFlags: number;
    nextDrive: { id: string; name: string; groupName: string; startsAt: string; registered: number } | null;
  };
  week: { newApplicants: number; invited: number; awaitingGrading: number; passRate: number | null };
}
```

`actionHref` targets the surface that already exists for each entity: an interview → its interview page; feedback owed → the candidate's pipeline entry (the board drawer for that job); an offer → the offers page filtered to that candidate; an approval → `/v2/approvals`. The plan resolves the exact routes from the codebase; the service builds hrefs from ids, never from user-supplied strings.

Subtitle copy follows Voice: fact, then state — "Senior Backend Engineer · interviewed yesterday · scorecard due today"; "2 days overdue" is rendered by the page from `at`/dates in the muted warn colour, not baked into the subtitle. Sentence case, no exclamation marks.

Timezone: `dayStart`/`dayEnd` for `User.timeZone ?? 'UTC'` computed with `Intl.DateTimeFormat` parts (no new dependency); reuse a helper from `packages/shared` scheduling if one already converts wall-clock ↔ instant for a zone.

### Web

- **Route:** `apps/web/app/v2/(recruiter)/today/page.tsx` (`'use client'`, reads `useToday()`).
- **Hook:** `apps/web/lib/hooks/useToday.ts` — `apiFetch<TodayResponse>('/dashboard/today')`, same query style as `useDashboard.ts`.
- **Types:** `TodayResponse` / `TodayItem` mirrored (types-only) in `apps/web/lib/types.ts`.
- **Nav:** `recruiter-nav.ts` and `super-admin-nav.ts` insert `{ href: '/today', label: 'Today', icon: Sun }` as the first item; `staff-nav.ts` `V2_ROUTES` adds `'/today'`. "Dashboard" stays as-is, second.
- **Landing:** `staff-landing.ts` and `staff-routing.ts` recruiter branch return `'/v2/today'`; their tests updated; `(platform)/organizations/page.tsx` "act into org" pushes `'/today'`.
- **Layout (from the canvas, in Azure tokens):** greeting block — kicker with the date (user tz), Bricolage "Good morning, {firstName}." (morning/afternoon/evening from the user's local hour), second line "**{N} things** need you today." with the count carrying the single accent-tint highlight (`inset` underline in the accent at ~28%); N = `needsYou.total`; singular "One thing needs you today." When N = 0 the second line reads **"Nothing needs you right now."**
- **Needs you card:** grouped sections in this order — Feedback you owe · Interviews today · Offers expiring · Approvals waiting on you — each header "Label · count" in the 11.5px uppercase muted style; rows = 36px initials avatar (from `candidateName`), name (14/600), subtitle (13 muted), optional `at` time (mono, tabular, in the user's tz), one action button. **Exactly one solid accent button on the page:** the first row of the first non-empty group; every other action is the outline style. Groups with zero items are not rendered; if all four are empty the card shows the single line "Nothing needs you right now." and the rail still renders.
- **Rail:** "Worth a look" (three rows: stale invitations → link "Resend" to the invitations surface; proctoring flags → "Review"; next drive → "Prepare"; each row hidden when its value is 0/null; the card hidden when all three are) and "This week" (three numbers in Bricolage 24/600 + 12px muted labels; the pass-rate sentence only when `passRate !== null`; "Full reports" link to `/v2/reports`).
- **Header link:** "Full reports" to `/v2/reports`.
- **States:** loading uses the existing "Loading…" pattern; error uses `role="alert"` + the existing danger style ("Couldn't load today. Try again."); reduced motion honored by the layout's `MotionConfig` (no extra motion added — one entrance is already provided by the shell).
- **Primitives only:** `components/ui-v2` (Card/Panel/Button deep-imported; row markup, no tables). No `@exam-platform/shared` runtime value import. No charting, no gauge, no stat tile.

## Data flow

1. Login (recruiter) → `staffLandingPath` → `/v2/today`. Nav "Today" is active.
2. Page mounts → `GET /dashboard/today` (JWT) → service resolves `User.timeZone`, computes the day window, runs the per-user + org-wide queries in one `forTenant`, builds items with hrefs → one JSON.
3. Page renders the greeting with `needsYou.total`, the grouped rows, the rail, the week strip. Clicking an action navigates to the existing surface for that entity.
4. Dashboard remains at `/v2/dashboard`, second in nav, unchanged.

## Error handling

- Unknown/invalid `User.timeZone` → fall back to `UTC` (log at debug), never 500.
- Any single group query failing fails the request (one aggregate; simpler than partial payloads) → page shows the error state. No partial rendering in v1.
- Malformed `chainSnapshotJson` on an approval → that request is skipped (matches how the inbox tolerates it), not a 500.
- Erased candidates never appear (`erasedAt` filtered on every candidate-bearing group).

## Testing

- **Service (unit, mocked tx):** each group's inclusion/exclusion — feedback owed excludes entries already rated by *this* user but includes ones rated only by others; only confirmed, panelist-of-user interviews; the 14-day / 3-day / 5-day windows; the timezone day boundary (e.g. `Asia/Kolkata`: an interview at 23:30 UTC yesterday is *today* locally); approvals use the current-step predicate; `total` is the sum; erased candidates excluded; an invalid timezone falls back to UTC; `week` mirrors the 7-day summary.
- **Controller:** delegates with `tenant` + `userId`; guarded like `summary` (the assertion mirrors the existing controller spec).
- **Web:** page renders groups from a mocked payload in the fixed order, hides empty groups, exactly one solid accent action, the all-clear line, times in the user's zone, the "Full reports" link; nav has Today first and Dashboard second; the `staff-routing` test asserts recruiter → `/v2/today` while org_admin/panel/super_admin are unchanged.
- Existing dashboard tests untouched and green. Full api + web jest green; tsc clean.

## Deploy notes

No migration, no seed, no new dependency. Behavior change is confined to: a new route, a new first nav item, and the recruiter landing target. Existing dashboard and all its routes unchanged. Ships with any api + web build. (Prod deploy is planned only once all development is complete — standing decision.)
