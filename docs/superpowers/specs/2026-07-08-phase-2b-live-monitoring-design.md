# Phase 2b — Live Monitoring (Realtime Monitoring Service) Design Spec

**Status:** Approved, ready for implementation planning.
**Date:** 2026-07-08
**Depends on:** Phase 0 (Foundation), Phase 1a-1d (Core Exam MVP), Phase 2a (Session Enforcement & Anti-Cheat Event Ingestion) — all merged to `main`. See `docs/superpowers/specs/2026-07-08-phase-2a-session-enforcement-anti-cheat-design.md` for the `ProctoringEvent`/`AttemptsController`/`AttemptsAdminService` surface this sub-phase builds on.

---

## 1. Context and Scope

This is the second sub-phase of Phase 2 ("Anti-Cheat & Live Monitoring") from the product roadmap (`docs/superpowers/specs/2026-07-07-online-mcq-exam-platform-design.md`, Development Roadmap section). Phase 2 is being built as a sequence of sub-phases, mirroring how Phase 1 was split into 1a-1d:

2a. Session Enforcement & Anti-Cheat Event Ingestion — done
2b. **Live Monitoring (Realtime Monitoring Service)** (this spec)
2c. AI Proctoring (third-party integration)

**Goal of this sub-phase:** give a recruiter a live view of an exam in progress — who's online, their progress and remaining time, proctoring flags as they happen, and submission events — plus a way to message a candidate mid-exam. This is the first sub-phase in the entire project that introduces real-time infrastructure (a WebSocket gateway); every prior phase, including 2a, deliberately stayed REST-only.

### In scope

- `MonitoringGateway`: a socket.io-based WebSocket gateway (NestJS's default WS adapter), staff-authenticated, with per-exam rooms (`exam:{examId}`)
- Real-time push to a connected recruiter: a roster snapshot on joining an exam's room, presence changes (online/offline), proctoring flags as `ProctoringEvent` rows are created, and attempt status transitions (started/submitted/auto_submitted/force_submitted)
- Presence detection via a new `Attempt.lastSeenAt` field, updated automatically by an interceptor on every successful candidate request (not manually in each service method), plus a lightweight in-process timer (a plain `setInterval` inside the existing Nest process — not a distributed job, not new infrastructure) that diffs presence on each tick and pushes only actual changes
- Candidate messaging: a recruiter sends a message via REST; it is stored and delivered — and marked read — the next time the candidate calls the existing `GET /attempt/current` endpoint
- Backend only, verified via a raw WebSocket test client (`socket.io-client`) in e2e tests, the same precedent as REST-via-`supertest` before any frontend UI existed for any prior phase

### Explicitly out of scope (deferred to 2c or later)

- **Redis Streams / multi-instance event fan-out.** The roadmap's system architecture section calls for Redis Streams, but nothing about this project's current single-instance deployment requires cross-instance fan-out today. Redis becomes a well-justified addition exactly when the API needs a second instance — not before, matching the "no new infrastructure until proven necessary" posture every prior phase (including 2a's REST-only anti-cheat ingestion) has held to.
- **A candidate-side WebSocket connection.** Candidates stay REST-only. No frontend exists yet for either side of this feature, so a persistent candidate-side socket can't actually be exercised end-to-end today regardless of how it's built. Presence is inferred from `lastSeenAt`, and messages are delivered on the candidate's next request rather than pushed live. This can be upgraded later without reworking the data model (`CandidateMessage` already models a message as a stored row with a `readAt` side effect, independent of *how* it eventually gets delivered).
- **Any dashboard UI.** Same precedent as every prior sub-phase.
- **AI proctoring** (webcam monitoring, face presence/match, multiple-face detection, gaze/attention flagging, audio anomaly detection, screen recording) — Phase 2c, a third-party vendor integration.
- **A configurable online/offline threshold or timer interval.** Hardcoded constants for this phase (matching how e.g. proctoring-event severity or exam duration defaults are hardcoded elsewhere), not a per-organization setting.
- **A recruiter-facing REST fallback for the roster** (i.e., no `GET /exams/:id/roster` REST endpoint in this phase) — the roster snapshot is delivered exclusively via the WebSocket `join-exam` flow. A REST equivalent can be added later if a use case needs one outside a live-connected dashboard.

---

## 2. Data Model

**`Attempt` gains one field**, additive, nullable, no default needed:

```prisma
model Attempt {
  // ...existing fields unchanged...
  lastSeenAt DateTime? @map("last_seen_at")
}
```

Updated to `now()` automatically by a NestJS interceptor applied alongside `CandidateJwtAuthGuard` — after every successful candidate request, if an `Attempt` exists for the caller's invitation, its `lastSeenAt` is bumped. This is deliberately NOT done inside each `AttemptService` method individually: a single interceptor means a future new candidate-facing route can never forget to update presence, and keeps `AttemptService`'s methods focused on their own business logic. "Online" is never persisted as a boolean — it is always derived at read/broadcast time as `lastSeenAt` within the last ~30 seconds (a hardcoded constant, see Section 3).

**One new table**, following the exact no-RLS-of-its-own precedent Phase 2a established for `ProctoringEvent` (reached only through `Attempt` → `Invitation` → `Exam`):

```prisma
model CandidateMessage {
  id           String    @id @default(uuid()) @db.UniqueIdentifier
  attemptId    String    @map("attempt_id") @db.UniqueIdentifier
  sentByUserId String    @map("sent_by_user_id") @db.UniqueIdentifier
  body         String    @db.NVarChar(Max)
  sentAt       DateTime  @default(now()) @map("sent_at")
  readAt       DateTime? @map("read_at")
  attempt      Attempt   @relation(fields: [attemptId], references: [id], onDelete: Cascade)

  @@index([attemptId, sentAt])
  @@map("candidate_messages")
}
```

A message can only be sent to an attempt that already exists — a recruiter is watching a specific in-progress exam session, the same scoping `force-submit` already uses. `sentByUserId` is a plain denormalized column (not a Prisma relation to `User`), matching how `Attempt.candidateId`/`Attempt.examId` are already plain denormalized columns with no enforced FK, since the real ownership path for this table runs through `attemptId` → `Invitation` → `Exam`, not through the staff user who happened to send a given message. `readAt` is set as a side effect of the candidate's next `GET /attempt/current` call — no separate acknowledgment endpoint is introduced.

---

## 3. WebSocket Architecture & Event Catalog

**`MonitoringGateway`** (`@WebSocketGateway({ namespace: '/monitoring', cors: {...} })`, using NestJS's default socket.io adapter — no adapter swap needed, and per-exam rooms map directly onto socket.io's built-in room support).

**Authentication on connect:** `handleConnection(socket)` extracts the staff JWT from `socket.handshake.auth.token` and verifies it against `JWT_ACCESS_SECRET`, using the same verification logic `JwtStrategy` already applies for REST — extracted into one small shared verifier function so the HTTP guard and this gateway are never two independent copies of the same security-critical check. A missing or invalid token disconnects the socket immediately, before any room can be joined.

**`join-exam` message** (client emits `{ examId }`): the gateway loads the exam via `TenantPrismaService.forTenant`, confirms it belongs to the connecting staff user's own organization and that they hold `exam:manage` (rejecting with a WS error event otherwise — the exact same ownership/permission check every REST route in this project already performs, just invoked from a socket handler instead of an HTTP guard). On success, the socket joins room `exam:{examId}` and receives a `roster:snapshot` event (to that socket only) containing the current roster.

**Server-initiated broadcasts to room `exam:{examId}`:**

| Event | Trigger | Payload |
|---|---|---|
| `roster:snapshot` | A recruiter's socket successfully joins the room | Full roster array (see `MonitoringService.getRosterSnapshot` below), sent only to the joining socket |
| `attempt:status` | An attempt transitions status: `start()` → `in_progress`; `AttemptSettlementService.finalize()` → `submitted`/`auto_submitted`/`force_submitted` | `{ attemptId, candidateId, status }` |
| `proctoring:flag` | A `ProctoringEvent` row is created — both client-reported events (`AttemptService.reportProctoringEvent`) and the system-generated `multi_login` (`CandidateAuthService.redeem()`) | `{ attemptId, candidateId, eventType, severity, occurredAt }` |
| `roster:presence` | The in-process timer's periodic diff detects an online/offline change since its last tick | `{ attemptId, candidateId, online }` |
| `message:sent` | A recruiter sends a candidate message via REST | `{ attemptId, candidateId, sentAt }` (not the message body — this is a dashboard notification for other recruiters watching the same exam, not a duplicate delivery channel to the candidate) |

**`MonitoringService`** (a plain injectable service, not itself WebSocket-aware) owns `getRosterSnapshot(context, examId): Promise<RosterRow[]>` — one row per invitation, the same base shape `ExamsService.getResults` already produces (`candidateId`, `candidateName`, `invitationId`, `attemptId`, `status`), extended with `online: boolean` (derived from `lastSeenAt`), `remainingSeconds` (via the existing `AttemptSettlementService.remainingSeconds`, for `in_progress` attempts only), and `answeredCount`/`totalQuestions` (progress, derived from the `Answer` rows for the attempt against its `questionOrderJson` length). This one method is the single source of truth for "what does the roster look like right now" — called both by the gateway's `join-exam` handler and by the periodic timer's diff pass, so there is exactly one place that computes roster state, never two implementations that could drift.

**In-process presence timer:** a single `setInterval` (started once, e.g. in the gateway's `afterInit` lifecycle hook) running every ~10-15 seconds. On each tick, for every exam room with at least one connected socket, it calls `MonitoringService.getRosterSnapshot`, diffs each candidate's `online` value against what was broadcast last tick, and emits `roster:presence` only for the candidates whose value actually changed. This is a plain in-memory JavaScript timer living inside the existing Nest process — it holds no persisted state, requires no configuration, and disappears on a process restart with zero data-integrity consequence, which is why it does not carry the same "avoid schedulers" caution this project has applied to correctness-critical operations like exam auto-submission (Phase 1d's lazy-check-on-access design). A missed or delayed presence tick means a recruiter's dashboard is briefly stale — never a wrong grade, a lost answer, or a security gap.

**Wiring:** `AttemptService`, `CandidateAuthService`, `AttemptSettlementService`, and `AttemptsAdminService` each get `MonitoringGateway` injected (a new `MonitoringModule` provides and exports it, imported by `AttemptModule`, `CandidateAuthModule`, and `GradingModule`) and call one small, specific emit method immediately after their existing DB write already happens today. There is no event bus or pub/sub abstraction introduced — each call site directly invokes the gateway, matching the "simplest thing that works for a single-instance app" decision from Section 1. This is a real new dependency edge (four existing services now depend on the gateway), accepted as the cost of avoiding a heavier abstraction that isn't needed yet.

**Candidate messaging (REST):**

```
POST /api/v1/attempts/:id/message      recruiter (exam:manage) -> creates a CandidateMessage row,
                                        emits `message:sent` to the exam room, audited via the existing
                                        Phase 0 AuditService (action: 'attempt.message_sent')
GET  /api/v1/attempts/:id/messages     recruiter (exam:manage) -> full message history for that attempt,
                                        mirroring the existing GET .../proctoring-events read endpoint
```

`GET /attempt/current` (the existing candidate-facing route from Phase 1d) gains a `messages` field: every `CandidateMessage` row with `readAt: null` for this attempt. The same call marks those rows read as a side effect — a candidate "checking in" via their next poll is what implicitly acknowledges any pending message; no separate read-receipt endpoint is introduced.

---

## 4. Testing Approach

- **Unit tests:** `MonitoringService.getRosterSnapshot` (correct `online`/`offline` derivation from `lastSeenAt` against the hardcoded threshold, correct progress/remaining-time computation for `in_progress` attempts, candidates with no attempt yet reported with nulls for the attempt-dependent fields — the same "always one row per invitation" contract `getResults` already established), the `lastSeenAt` interceptor (updates only when an `Attempt` exists for the caller's invitation, no-ops otherwise), `AttemptsAdminService.sendMessage` (creates the row correctly, rejects for a non-existent or cross-tenant attempt), the `GET /attempt/current` message-read side effect (unread messages returned exactly once with `readAt` then set, absent on the subsequent call).
- **Gateway auth/ownership tests:** a connection with a missing or invalid JWT is disconnected immediately, before any `join-exam` is possible; a valid staff token attempting to join an exam outside their own organization is rejected with a WS error, never a silent no-op; a valid recruiter holding `exam:manage` on their own exam successfully joins and receives a snapshot.
- **End-to-end WebSocket flow** (new `socket.io-client` dev dependency, used alongside the existing `supertest`-based REST calls in one e2e spec): a recruiter connects and joins an exam's room, receiving the initial roster snapshot; a candidate starts an attempt via the existing REST flow and the recruiter's socket receives `attempt:status`; the candidate reports a `tab_switch` proctoring event via REST and the recruiter's socket receives `proctoring:flag`; the recruiter sends a message via REST and the candidate's next `GET /attempt/current` call shows it in `messages`, with a subsequent call confirming it no longer appears; the presence timer is exercised by backdating a candidate's `Attempt.lastSeenAt` directly via the test's own DB access (the same technique Phase 1d's e2e test used to backdate `startedAt` for its auto-submit test) and waiting past one timer tick to confirm `roster:presence` fires with `online: false`; a socket attempting to join an exam belonging to a different organization is rejected.

---

## 5. Open Items / Deferred to Future Sub-Phases or Later Roadmap Phases

- Redis Streams / multi-instance event fan-out — added when the API genuinely needs a second instance.
- A candidate-side WebSocket connection, replacing the "delivered on next request" message model with true live push.
- A live dashboard UI — same precedent as every prior sub-phase.
- AI proctoring (webcam/face/gaze/audio/screen) — Phase 2c.
- A configurable online/offline threshold and timer interval, if this ever needs to be tuned per organization.
- A REST fallback for the roster snapshot outside of an active WebSocket connection.
