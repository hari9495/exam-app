# Live Exam Monitoring Dashboard — Design Spec

## 1. Context & Scope

All backend and frontend phases through the Interview Panel Console are shipped: five role consoles (Recruiter, Org Admin, Candidate, Panel) all exist and are read-only/post-hoc where they touch exam results — nothing in the product today shows what's happening *during* an active exam session in real time.

**Existing real-time backend surface, confirmed by direct codebase survey before scoping:**

- `apps/exam-runtime/src/monitoring/monitoring.gateway.ts` is a fully built Socket.IO gateway at namespace `/monitoring`, already covered end-to-end by `apps/api/test/live-monitoring.e2e-spec.ts` (4 passing scenarios: roster + live events, recruiter messaging, force-submit exactly-once, auth/tenant isolation).
- **Auth:** `handleConnection` verifies `client.handshake.auth.token` as a staff JWT (same access token used for REST calls) and disconnects immediately if absent/invalid.
- **`join-exam` (client → server):** body `{ examId }`. Requires the caller's role to hold `exam:manage` (checked manually inside the gateway against `RolePermission`, independently of `PermissionsGuard` but against the identical data). On success, joins room `exam:${examId}` and emits `roster:snapshot`. On failure, emits `error` — either `{ message: 'Missing required permission: exam:manage' }` or `{ message: 'Exam ${examId} not found' }` (org-scoped 404-style leak prevention, not a 403).
- **`roster:snapshot` (server → client, once on join):** `RosterRow[]`, where `RosterRow = { candidateId, candidateName, invitationId, attemptId: string | null, status, online: boolean, remainingSeconds: number | null, answeredCount: number | null, totalQuestions: number | null }`. `online` reflects `lastSeenAt` within a 30-second threshold at snapshot time.
- **`roster:presence` (server → client, on change only):** `{ attemptId, candidateId, online: boolean }`, emitted by a 15-second server-side tick that diffs presence and only fires on an actual online/offline transition.
- **`attempt:status` (server → client):** `{ attemptId, candidateId, status }`, fired on attempt start (`in_progress`) and on force-submit (`force_submitted`), among other lifecycle transitions.
- **`proctoring:flag` (server → client):** `{ attemptId, candidateId, eventType, severity, occurredAt }`, fired whenever a candidate posts a proctoring event.
- **`message:sent` (server → client):** `{ attemptId, candidateId, sentAt }` — fired when a recruiter sends a candidate a message via the existing `POST /attempts/:id/message` REST route. Not consumed by this phase (see Scope Decisions).
- **Confirmed gap:** no REST endpoint exposes roster/presence/freshness data — `GET /exams/:id/results` (`results:view`) returns settled/in-progress rows but with no `online`/heartbeat field at all. The only path to live roster data is the WebSocket gateway.
- **Confirmed gap:** `apps/web` has zero WebSocket client infrastructure today — no `socket.io-client` dependency, no usage anywhere in the codebase.
- **Confirmed permission boundary:** `join-exam` and all four "live action" REST routes on `apps/api/src/attempts-admin/attempts-admin.controller.ts` (`force-submit`, `message`, `messages`, `proctoring-events`, `reanalyze`) require `exam:manage`. Panel (`org:view` + `results:view` only) cannot reach any of them — confirmed directly from the `@RequirePermissions` decorators and the seed data. This phase does not change that boundary.

## 2. Scope Decisions

- **Recruiter only.** No backend change needed — the gateway and every relevant REST route already gate on `exam:manage`, which only `recruiter` holds. Extending this to panel (view-only or full-parity) was considered and explicitly deferred: it would require either widening `join-exam`'s permission check or building a separate read-only path, and panel currently has no precedent for live/in-progress data at all — a decision for a future phase, not bundled into this one.
- **Roster + live proctoring alert feed**, not roster alone. The alert feed reuses `proctoring:flag` events the gateway already emits — no new backend work, just a second client-side accumulator alongside the roster state.
- **A small live stat-tile row** (Online now / In progress / Submitted / Alerts in the last 5 minutes) sits above the roster table, computed client-side from state already streaming in (roster + feed) — not a new data source, just a derived summary render.
- **View-only this phase.** Force-submit and messaging both have working, tested REST routes today, but wiring them into this UI is deferred as a fast-follow once the live view itself is proven out — keeps this phase focused on the harder, novel part (a real-time client) rather than bundling it with REST mutation UI that's comparatively low-risk to add later.
- **Per-exam, not cross-exam.** Matches the backend exactly (`join-exam` takes one `examId`); a cross-exam "everything live right now" overview was considered and rejected because the backend has no way to answer "which exams currently have candidates in progress" without a new aggregate query — out of scope for a phase whose backend work is intentionally zero.
- **Lives as a new "Live" tab** on the existing exam edit page (`/exams/[id]/edit`), reusing the `Tabs` component already there (`Details` / `Sections & Questions` / **`Live`**) rather than a new top-level route — recruiter has no separate exam-detail/view page today, so this is the natural existing entry point.
- **No token-refresh-over-socket.** If the recruiter's access token expires mid-session, the socket simply won't reconnect successfully — acceptable for v1 given typical session lengths; flagged, not built.

## 3. Client Architecture

- **New dependency:** `socket.io-client`, added to `apps/web/package.json`.
- **New hook:** `apps/web/lib/hooks/useExamMonitoring.ts` — owns the socket lifecycle (connect with the recruiter's access token, `join-exam`, listen for `roster:snapshot`/`roster:presence`/`attempt:status`/`proctoring:flag`/`error`, disconnect on unmount) and exposes `{ roster: RosterRow[], alerts: ProctoringFlag[], connectionStatus: 'connecting' | 'connected' | 'disconnected', joinError: string | null }`. This is the only file that touches `socket.io-client` directly — every screen consumes the hook, mirroring how REST screens consume `usePanelReports.ts` hooks rather than calling `apiFetch` directly.
- **New types** in `apps/web/lib/types.ts`: `RosterRow`, `ProctoringFlag` (matching the gateway payload shapes above verbatim), `ConnectionStatus`.
- **New tab content component**, e.g. `apps/web/app/(recruiter)/exams/[id]/edit/LiveMonitoringPanel.tsx` (or inlined into the edit page if small enough once written), rendered inside a new `TabsContent value="live"` alongside the existing two tabs. Contains: the stat-tile row, the roster `Table`, and the alert feed list — all built from `components/ui` primitives (`Table`, `Badge`, `Card`), matching every other screen's reuse of the existing design system.
- **Socket URL / auth:** connects to the exam-runtime origin derived from the existing `NEXT_PUBLIC_EXAM_RUNTIME_API_BASE` env var (already used by `apps/web/lib/candidate-api-client.ts`, defaulting to `http://localhost:3002/api/v1`) with its `/api/v1` suffix stripped, since Socket.IO connects at the origin root (`/monitoring` is a namespace, not a REST path) — no new env var needed. Auth uses `{ token: accessToken }` from the existing recruiter `useAuth()` context — no new auth mechanism, reuses the same access token already used for REST calls.

## 4. Error Handling & Empty States

- **Socket connect failure:** `connectionStatus` shows `'disconnected'`; a one-time `Toast` (existing component) fires; socket.io's default automatic reconnection handles retry — no manual retry button in v1.
- **`join-exam` error event** (permission/not-found): the roster/feed area is replaced with an inline error message instead of an empty table — these are non-transient failures, not something a retry would fix.
- **No candidates invited yet:** roster area shows "No candidates invited yet." (mirrors the existing panel results-dashboard empty-state copy for consistency).
- **Leaving and returning to the tab:** clean disconnect on unmount, fresh `join-exam` (and therefore a fresh `roster:snapshot`) on remount — no attempt to preserve accumulated alert-feed history across unmounts; that's acceptable since the feed is a "what's happening right now" view, not a historical record (post-hoc proctoring review already exists via the results/candidate-detail screens).
- **Access token expiry mid-session:** out of scope, as noted in Scope Decisions — the socket will not reconnect successfully; no special handling beyond the existing disconnect/reconnect UI.

## 5. Testing

- **Unit/component tests** (Jest + Testing Library, matching existing convention): the roster table, alert feed, and stat-tile row's render logic, all with `useExamMonitoring`'s return value mocked directly (no real socket in these tests) — mirrors how `usePanelReports.test.tsx`-consuming screens mock the hook rather than the transport.
- **`useExamMonitoring` hook test**, with `socket.io-client` mocked, covering: initial connect + `join-exam` emission, applying `roster:snapshot`/`roster:presence`/`attempt:status`/`proctoring:flag` updates to state correctly, surfacing a `join-exam` `error` event, and disconnecting on unmount.
- **No new backend tests** — `live-monitoring.e2e-spec.ts` already exhaustively covers the gateway's real behavior; this phase is purely a frontend consumer of an already-tested surface.
- **Playwright addition**: a live-monitoring scenario (new spec, or an extension of the existing recruiter golden path) — recruiter opens the exam's Live tab, a candidate starts the exam in a second browser context, and the recruiter's screen is asserted to show the roster row flip to `in_progress` and the stat tiles update accordingly. This is the one piece of proof that the real wiring (not just mocks) works end-to-end.
