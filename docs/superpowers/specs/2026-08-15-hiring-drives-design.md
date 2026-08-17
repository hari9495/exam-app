# Hiring Drives — Design

**Status:** approved, not yet implemented
**Date:** 2026-08-15
**Origin:** market-readiness review. Walk-in registration is 36% of all candidate volume (116 registrations, 87% completion) yet ships as a peripheral feature. This turns it into a named, first-class product surface — a live operational view of a hiring event — which is the platform's genuine differentiator against generic assessment tools.

## Problem

Recruiters already run hiring drives on this platform: a room of candidates registering at a QR kiosk and taking assessments. The pieces exist — a public kiosk page, a self-register endpoint, "Walk-In Groups" (QR-shareable exam bundles) — but there is no event, and no way to *see the room*. A recruiter running 50 candidates has no single screen showing who has arrived, who is mid-exam, who has finished, who passed. That situational awareness is the thing a generic assessment tool cannot give, and it is what "run the drive" actually needs.

## Decisions

### A Drive is a dated session against a reusable group

Two concepts, chosen for orgs that run the same assessment repeatedly (campus drives each semester on one bundle):

- **Walk-In Group** — unchanged. The reusable, always-on, QR-shareable bundle of exams.
- **Drive Session (new)** — a dated event held against a group: a name and a `[startsAt, endsAt]` window. A group can host many sessions over time.

### Status is derived, never stored

A session is `scheduled` when `now < startsAt`, `live` between the two, `ended` after `endsAt`. Derived from the window at read time — no cron flipping states, no stored status that can drift from reality. (Same "read the truth, don't cache a copy" principle as the integrity-panel fix. A manual early-close is a future nullable `endedAt` override, out of scope for the MVP.)

### The board's states, and that registration IS check-in

**Five** derived states per roster entry, from a pure function that sees only the row's own data:

| State | Derived from |
|---|---|
| Registered | invitation exists, no attempt |
| In progress | attempt `status = 'in_progress'` |
| Submitted | attempt `submitted_at` set, no result yet |
| Passed | result exists, `pass_fail = 'pass'` |
| Failed | result exists, `pass_fail = 'fail'` |

"Did not attempt" is **not** a sixth state — it is the *presentation* of `Registered` on an ended drive (someone who registered but never started is a no-show once the window closes). Keeping it out of the derive function is deliberate: the function stays pure and knows nothing about drive status, and the relabel lives in the results view, which already knows the drive has ended.

No separate check-in step: a walk-in candidate registers at the kiosk on arrival, so registering already means present.

### One link column drives the whole roster

`Invitation.driveSessionId` (new nullable FK). The roster is exactly "invitations stamped with this session id." Two stamping paths, below. The live board is then a single scoped read — invitations for the session, left-joined to attempt and result — with each row's state derived. This is the entire backend of the feature.

### Polling, not websockets

`GET /drives/:id/live` returns the roster; the frontend polls every ~5s via React Query `refetchInterval` (a pattern already used in the app). Rejected: reusing the exam-scoped websocket `MonitoringGateway`, because re-scoping delicate candidate-facing real-time code to span a multi-exam drive is high risk for latency a hiring board does not need. The websocket path remains a later upgrade if sub-5s ever matters.

## Architecture

### Data model

**New table `DriveSession`** (`drive_sessions`): `id`, `organizationId`, `walkInGroupId` (FK → `walk_in_groups`), `name`, `startsAt`, `endsAt`, `createdAt`. RLS-scoped by org like every other tenant table.

**New column `Invitation.driveSessionId`** (nullable FK → `drive_sessions`, `ON DELETE SET NULL`). The single roster link.

One migration for both, applied with `migrate status` → `migrate deploy` → verify.

### Two stamping paths, both additive

1. **Walk-in (main path).** `WalkInService.register()` — which exists — gains one lookup before creating the invitation: is there a `live` session for this group right now (a `drive_sessions` row for `walkInGroupId` where `startsAt ≤ now ≤ endsAt`)? If yes, stamp the new invitation's `driveSessionId`. If no, behave exactly as today (ungrouped walk-in). The existing "reuse a live invitation" branch also carries the stamp. Nothing about the candidate flow changes.
2. **Pre-invite.** The existing bulk-invite flow (`InvitationsService.bulkInvite`) gains an optional `driveSessionId` passed through to the created invitations, so known candidates appear as `Registered` before arrival.

### The read model

`DrivesService.liveRoster(context, driveId)` → for each invitation with `driveSessionId = driveId`, left-join its attempt and result, and map to a roster row via a **pure** `deriveDriveState(attempt, result)` function returning one of the five states above (the invitation's mere existence is the `registered` baseline, so the function needs only the attempt and result). Counts are group-bys of the same rows. The live board and the ended-drive results view are the same read; only the presentation differs (grouped-by-state chips when live, sortable table when ended).

### Frontend

- **`DriveLiveBoard`** — a four-count strip (Registered / In progress / Submitted / Passed) over a state-grouped chip roster (design A). Polls `GET /drives/:id/live`. Each candidate links to the existing per-candidate report.
- **`DriveResults`** — the same roster as a sortable, searchable table (design B) for an ended drive, with "Did not attempt" surfaced, and a CSV export reusing the existing per-exam export shape scoped to the drive.
- **Drive setup** — from a Walk-In Group: "Schedule a drive" (name, start, end); a list of that group's past and upcoming drives.

### Access

Recruiters and org-admins of the owning org, scoped by the same RLS as every other query. No new role.

## Error handling

| Case | Behaviour | Why |
|---|---|---|
| No live session when the QR is scanned | Falls back to today's ungrouped walk-in registration | The drive layer is purely additive; walk-in without a drive is unchanged |
| Two live sessions on one group | Rejected at creation (overlap validation) | A registration must know which session to stamp |
| Window edited while live (extend `endsAt`) | Takes effect immediately | Status is derived; nothing to reconcile |
| Empty drive | Board renders zeroes + "waiting for first check-in" | Not an error state |
| Timezones | Store UTC, compare UTC for "is live now", display local | DB region and candidate location differ |
| Deleting a group that has drives | Blocked with a clear message | Don't orphan historical drive records |
| The 116 pre-existing walk-ins | Appear on no board (no `driveSessionId`) | Drives are forward-looking, not a retroactive reinterpretation — stated so it isn't mistaken for a bug |

## Testing

1. **`deriveDriveState(attempt, result)`** — pure, table-tested across every (attempt, result) combination, returning the five states. The board's entire correctness in one DB-free function. A separate test covers the results view relabelling `registered` → "Did not attempt" for an ended drive.
2. **`register()` stamps `driveSessionId` only when a session is live**, and falls back otherwise. Mutation check: removing the live-session lookup must turn a test red — it is the one line touching the candidate-facing flow.
3. **Overlap prevention** on drive creation.
4. **Live read** returns the correct roster + counts for a mixed-state session; **results export** produces the scoped CSV shape.
5. **Frontend** — board groups by state and polls (existing fetch-mock idiom); results table sorts and links to the per-candidate report.
6. **Production verification after deploy (read-only):** create a real drive against an existing group, register one test candidate through the kiosk, watch the state advance Registered → In progress → Submitted, then delete the test data. Confirm the 116 historical walk-ins stay off every board.

Baselines: api 900, exam-runtime 713, web per CI.

## Out of scope

- ATS integration (the other differentiator track; blocked on partner-account decisions).
- Websocket/real-time push (polling is the MVP; upgrade later only if needed).
- A distinct check-in step / seat assignment (registration is check-in; no fixed seats at a walk-in).
- Manual early-close of a drive (`endedAt` override) — add when asked.
- Retroactively attaching historical walk-ins to drives.
- Billing/plan gating of drives — belongs with the commercial track, not this feature.

## Known gaps, accepted for now

- **Polling means up to 5s staleness.** Imperceptible for "who's testing"; noted so it's a chosen trade-off, not a surprise.
- **A drive spans a group's exams, but each candidate is on the roster via the one exam they registered for.** The board is per-candidate, not per-exam-per-candidate; a candidate taking two exams in one drive is out of scope (the kiosk registers one exam at a time today).
