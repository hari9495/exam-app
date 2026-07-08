# Phase 2a — Session Enforcement & Anti-Cheat Event Ingestion Design Spec

**Status:** Approved, ready for implementation planning.
**Date:** 2026-07-08
**Depends on:** Phase 0 (Foundation), Phase 1a-1d (Core Exam MVP) — all merged to `main`. See `docs/superpowers/specs/2026-07-08-phase-1d-exam-taking-runtime-design.md` for the candidate auth and attempt runtime this sub-phase extends.

---

## 1. Context and Scope

This is the first sub-phase of Phase 2 ("Anti-Cheat & Live Monitoring") from the product roadmap (`docs/superpowers/specs/2026-07-07-online-mcq-exam-platform-design.md`, Development Roadmap section). Phase 2 bundles several independent subsystems (browser-level anti-cheat, device/session enforcement, third-party AI proctoring, real-time live monitoring) — too large for one design/plan cycle, so it is being built as a sequence of sub-phases, mirroring how Phase 1 was split into 1a-1d:

2a. **Session Enforcement & Anti-Cheat Event Ingestion** (this spec)
2b. Live Monitoring (Realtime/Monitoring Service — WebSocket roster + flag feed, Redis Streams)
2c. AI Proctoring (third-party integration)

**Goal of this sub-phase:** close the "share your login with a friend" loophole the product spec calls out explicitly, by making single-active-session enforcement a *live* guarantee (not just a refresh-time one), and give the system a place to durably record anti-cheat signals as they happen — even though the browser-side detection logic that produces those signals is frontend work for a UI that doesn't exist yet. A recruiter gets a way to see those signals and to force-submit a candidate's attempt.

### In scope

- Single active session enforcement: redeeming a new session immediately invalidates the previous one's refresh token **and** its already-issued access token, checked on every attempt-runtime request — not just on refresh
- Device fingerprint: recorded on `Attempt` if the client sends one, never required, no mismatch detection
- `POST /attempt/proctoring-event`: candidate-facing ingestion endpoint for anti-cheat signals, validated against a fixed enum of event types, with severity computed server-side (never client-supplied)
- A system-generated `multi_login` event, auto-logged whenever session enforcement kicks an old session out while an attempt already exists
- `GET /attempts/:id/proctoring-events`: recruiter-facing read endpoint
- `POST /attempts/:id/force-submit`: recruiter admin override, audited via the existing Phase 0 `AuditService`
- Backend API only (NestJS), RLS/ownership-guarded where applicable, full unit + e2e test coverage

### Explicitly out of scope (deferred to 2b/2c or later)

- **The actual browser-side detection logic** (noticing a tab-switch, fullscreen-exit, dev-tools open, etc. actually happened) — this is client/frontend work for whenever the exam-taking UI exists. 2a only builds what receives and stores the signal once a future frontend reports it; this is the same "backend proves the mechanism, frontend consumes it later" precedent every prior sub-phase has followed.
- **Device fingerprint mismatch flagging** — recording only. A missing fingerprint never blocks anything (matches the product spec's principle that proctoring signals are advisory, never blocking — even a full AI-proctoring-vendor outage doesn't stop an exam). Mismatch detection is a small, self-contained addition for later if it's ever needed.
- **Live/real-time monitoring** (WebSocket roster, live proctoring flag feed, disconnection/reconnection alerts) — Phase 2b, which introduces the Realtime/Monitoring Service and Redis Streams the roadmap's architecture calls for. 2a deliberately introduces zero new infrastructure.
- **Candidate messaging** (paired with force-submit in the product spec's API list) — needs a delivery channel that doesn't exist without live monitoring; deferred to 2b.
- **AI proctoring** (webcam monitoring, face presence/match, multiple-face detection, gaze/attention, audio anomaly, screen recording) — Phase 2c, a third-party vendor integration behind a pluggable interface.
- **A distinct error code/message for "kicked by a newer session"** vs. a generic 401 — minor UX polish; the strategy throws a clear message, but no dedicated error envelope is built until a frontend needs to distinguish it from other auth failures.
- Frontend UI — same precedent as every prior sub-phase.

---

## 2. Data Model

**`Attempt` gains one field**, additive with no default needed since it is optional:

```prisma
model Attempt {
  // ...existing fields unchanged...
  deviceFingerprint String? @map("device_fingerprint")
}
```

`Attempt.status` gains one new possible value, `'force_submitted'`, alongside the existing `in_progress` / `submitted` / `auto_submitted` — no schema change, since `status` is already a plain string column; this is a new value the application layer now writes, distinguishing "the recruiter ended this" from a normal or timeout-triggered submission.

**`Invitation` gains one field**, the mechanism that makes session-kill live rather than refresh-only:

```prisma
model Invitation {
  // ...existing fields unchanged...
  activeSessionFamilyId String? @map("active_session_family_id")
}
```

Set every time `CandidateAuthService.redeem()` succeeds, to the new session's refresh-token family id. Checked on **every** attempt-runtime request via `CandidateJwtStrategy`, not just on refresh — this is what actually closes the sharing loophole within a single exam window (an already-issued 4-hour access token would otherwise stay fully valid regardless of a newer login).

**One new table**, following the exact no-RLS-of-its-own precedent Phase 1d established for `Attempt` / `Answer` / `Result` (reached only transitively through `Attempt` → `Invitation` → `Exam`):

```prisma
model ProctoringEvent {
  id           String   @id @default(uuid()) @db.UniqueIdentifier
  attemptId    String   @map("attempt_id") @db.UniqueIdentifier
  eventType    String   @map("event_type")
  severity     String   // 'low' | 'medium' | 'high' -- server-computed, never client-supplied
  occurredAt   DateTime @default(now()) @map("occurred_at")
  metadataJson String?  @map("metadata_json") @db.NVarChar(Max)
  attempt      Attempt  @relation(fields: [attemptId], references: [id], onDelete: Cascade)

  @@index([attemptId, occurredAt])
  @@map("proctoring_events")
}
```

**Why severity is server-computed, not client-supplied:** a candidate's own browser is what reports these events. If severity were a client-sent field, a malicious script could self-report "low severity" for something that should alarm a recruiter. A fixed `eventType → severity` map lives in the service layer (Section 3) — the same "never trust client input for anything that matters" posture the codebase already applies to grading, permissions, and tenant scoping.

**Event type enum**, validated via `class-validator @IsIn` (matching the project's existing style for question types/difficulty): `tab_switch`, `fullscreen_exit`, `copy_paste`, `right_click`, `dev_tools_detected`, `refresh_warning`, `idle_timeout` (all client-reported) plus `multi_login` (system-generated only — a client attempting to submit this type directly is rejected, since it is not something a browser can legitimately detect about itself).

**Why `ProctoringEvent` is keyed to `Attempt`, not `Invitation`, and what that means for pre-start session-kicks:** the product spec's own schema (Section 10) keys `proctoring_events` to `attempt_id`, and every meaningful anti-cheat signal (tab-switch, fullscreen-exit, etc.) can only happen once an attempt is actually in progress. The one exception is `multi_login`, which could in principle happen before a candidate ever starts (two tabs redeeming the same invite before starting). In that pre-start case, the session-kill itself still happens (the old session is invalidated), but no `ProctoringEvent` is logged, since there is no `Attempt` to attach it to and nothing graded/timed is at stake yet. Once an `Attempt` exists, a subsequent `multi_login` is logged against it.

---

## 3. Business Rules

**Severity map** (server-side constant, not stored per-org, not configurable in this phase):

| Event type | Severity |
|---|---|
| `dev_tools_detected` | high |
| `multi_login` | high |
| `tab_switch` | medium |
| `fullscreen_exit` | medium |
| `copy_paste` | medium |
| `right_click` | low |
| `refresh_warning` | low |
| `idle_timeout` | low |

**Proctoring event ingestion (`POST /attempt/proctoring-event`):**

| Rule | Detail |
|---|---|
| No attempt exists yet for this invitation | `404` — a candidate can only report events during an active attempt, matching the runtime's existing "no attempt started" pattern from 1d |
| `eventType` not in the fixed enum | `400` |
| `eventType === 'multi_login'` | `400` — rejected explicitly; this type is system-generated only |
| Otherwise | Creates a `ProctoringEvent` with server-computed `severity` from the map above; never blocks, never mutates `Attempt.status` — purely observational, per the product spec's "no automatic disqualification" principle |

**Session enforcement (`CandidateAuthService.redeem()`):**

1. Validate the token/invitation/exam exactly as Phase 1d already does (unknown/revoked/expired invitation, unpublished exam — no changes to this logic).
2. Look up `invitation.activeSessionFamilyId`. If one is already set:
   - Revoke every `CandidateRefreshToken` row in that family (`updateMany` on `revokedAt`, the same shape 1d's reuse-detection already uses).
   - If an `Attempt` already exists for this invitation, create a `ProctoringEvent` with `eventType: 'multi_login'`, `severity: 'high'` against it.
3. Issue new tokens under a freshly generated family id. **Both** the access token and refresh token payloads now carry this `familyId` (the access token does not carry it today — this is a small, necessary extension over 1d's shape).
4. Set `invitation.activeSessionFamilyId` to the new family id.
5. Persist the new `CandidateRefreshToken` row exactly as 1d already does, using the new family id.

A first-ever redeem (no prior active session) behaves exactly as it does today, plus recording the new `activeSessionFamilyId` — step 2 finds nothing to revoke and logs nothing.

**Live session validation (`CandidateJwtStrategy.validate()`):** after decoding the JWT, look up the `Invitation` by `payload.sub` and compare `payload.familyId` to `invitation.activeSessionFamilyId`. A mismatch (or a missing invitation) throws `UnauthorizedException` immediately — this is what kills an old session's access token mid-request, not just on its next refresh attempt.

**Why `refresh()` needs no changes:** an old, killed session's refresh token is already marked `revokedAt` by step 2 above, so any attempt to refresh it fails via the *existing* reuse-detection path in `CandidateAuthService.refresh()` (a `stored` lookup with `revokedAt: null` finds nothing, triggering the already-built family-revocation-on-reuse branch). No new logic is needed there.

**Force-submit (`POST /attempts/:id/force-submit`):**

| Rule | Detail |
|---|---|
| Attempt not `in_progress` | `400` — cannot force-submit something already terminal |
| Otherwise | Delegates to `AttemptSettlementService.finalize(tx, exam, attempt, 'force_submitted')`, grading whatever was answered so far exactly like a normal or auto-submit; writes an `AuditLog` entry via the existing `AuditService` (`action: 'attempt.force_submit'`, `entityType: 'attempt'`, `entityId`) |

---

## 4. API Design

```
POST /api/v1/attempt/proctoring-event      candidate, { eventType: string; metadata?: object }
                                             -> ProctoringEvent (severity computed server-side, never from the request)

GET  /api/v1/attempts/:id/proctoring-events  recruiter (exam:manage) -> ProctoringEvent[]
                                             ownership resolved via attempt -> invitation -> exam.organizationId,
                                             the same pattern as every other recruiter-facing read in this codebase

POST /api/v1/attempts/:id/force-submit       recruiter (exam:manage) -> { status: 'force_submitted' }
```

Both new recruiter-facing routes reuse the existing `exam:manage` permission — no new RBAC permission is introduced, consistent with how `GET /exams/:id/results` reused it in 1d (this is the recruiter acting on their own exam's data, not a new capability class).

**Module structure:** `ProctoringEvent` ingestion and the recruiter read endpoint live in the existing `AttemptModule`/`ExamsModule` split established in 1d — the candidate-facing `POST /attempt/proctoring-event` route belongs on `AttemptController` (guarded by `CandidateJwtAuthGuard`, alongside `current`/`start`/`answer`/`submit`); the two recruiter-facing routes (`GET .../proctoring-events`, `POST .../force-submit`) live on `ExamsController` or a small new controller within the existing exam-management surface, gated by `PermissionsGuard` + `exam:manage`, matching how `getResults` was added directly to `ExamsController` rather than spun into a new module.

---

## 5. Security: Session Isolation & Tenant Isolation

- **`CandidateJwtStrategy` gains a new dependency: raw `PrismaService`.** It was previously a pure Passport strategy with no DI beyond static config; it now performs a live DB check on every request, the same "guard does a live DB lookup" pattern `PermissionsGuard` already established for staff RBAC. `invitations` has no RLS policy of its own (established in 1c), so this is a direct, unscoped lookup by the invitation's own primary key — safe because the id comes from a JWT this service itself signed, not from arbitrary client input.
- **`ProctoringEvent` has no RLS of its own** — reached only through `Attempt` → `Invitation` → `Exam`, exactly like `Answer`/`Result`. Every service method touching it must resolve ownership through that chain inside the same unit of work, per the Phase 1d precedent.
- **`force-submit`'s ownership check** follows the identical tenant-scoped pattern every other recruiter-facing mutation in this codebase uses: load the attempt through `TenantPrismaService.forTenant(context, ...)`, joined through to its exam's `organizationId`.
- **Severity is computed server-side only** (Section 3) — the ingestion endpoint's DTO does not accept a `severity` field at all, so there is no code path where client input could influence it, not even accidentally.

---

## 6. Testing Approach

- **Unit tests:** `CandidateAuthService.redeem()` (revokes the prior family and logs `multi_login` when an attempt already exists; skips logging when none exists; sets `activeSessionFamilyId` correctly on both a first-ever redeem and a subsequent one), `CandidateJwtStrategy.validate()` (accepts a matching `familyId`, rejects a mismatched or missing one), the proctoring-event ingestion path (enum validation, rejects a client-submitted `multi_login`, requires an existing attempt, computes severity from the fixed map), the force-submit path (rejects a non-`in_progress` attempt, delegates to `AttemptSettlementService.finalize`, writes the audit log entry).
- **Ownership/isolation test:** a recruiter from organization A cannot read organization B's `proctoring-events` or force-submit organization B's attempt — the same cross-tenant test shape every prior phase has run.
- **End-to-end HTTP flow:** candidate redeems, starts, reports a `tab_switch` event → recruiter's `GET /attempts/:id/proctoring-events` shows it with `severity: 'medium'`; the *same* invitation token is redeemed again (simulating a second device) → the first session's next request (e.g. `GET /attempt/current`) now returns `401`, and a `multi_login` / `high`-severity event appears in the recruiter's view; recruiter force-submits the second (now-active) session's attempt and confirms `status: 'force_submitted'` plus a corresponding `AuditLog` row; a client attempting to `POST` a `multi_login` event directly is rejected with `400`.

---

## 7. Open Items / Deferred to Future Sub-Phases

- Browser-side anti-cheat detection logic — frontend work, whenever the UI exists.
- Device fingerprint mismatch flagging — recording only for now; a small, self-contained addition later if needed.
- Live/real-time monitoring (WebSocket roster, live proctoring flag feed, disconnection/reconnection alerts) and candidate messaging — Phase 2b.
- AI proctoring (webcam/face/gaze/audio/screen) — Phase 2c.
- A distinct error code for "session replaced by a newer login" vs. a generic 401 — minor UX polish, tightened later once a frontend needs to tell the difference.
- Frontend UI — same precedent as every prior sub-phase.
