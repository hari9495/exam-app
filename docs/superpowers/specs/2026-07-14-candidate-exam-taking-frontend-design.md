# Candidate Exam-Taking Frontend — Design Spec

## 1. Context & Scope

Frontend Phase 1 (Recruiter Console) and Frontend Phase 2 (Org Admin Console) are both shipped. `apps/web` has no frontend for the fifth and final role console: the **Candidate**. `apps/exam-runtime` already fully supports exam-taking (session enforcement, anti-cheat event logging, attempt runtime with grading/settlement, live-monitoring gateway for staff, proctoring-events capture, candidate JWT auth) — confirmed by direct codebase survey — but zero UI exists for a candidate to redeem an invitation and actually take an exam.

**Current backend surface, confirmed by direct codebase survey before scoping** (all routes on `apps/exam-runtime`, prefixed `/api/v1`, default port `3002`; a separate internal app on port `3003` is system-to-system only and irrelevant to this frontend):

- **Candidate auth** (`candidate-auth.controller.ts`): `POST /candidate-auth/redeem` (body `{ token }` → `{ accessToken, refreshToken }`), `POST /candidate-auth/refresh`, `POST /candidate-auth/logout`. JWT payload is `{ sub: invitationId, subjectType: 'candidate', familyId }` — no `candidateId`/`attemptId` in the token; everything downstream is resolved server-side from the invitation. Secrets (`CANDIDATE_JWT_ACCESS_SECRET`/`CANDIDATE_JWT_REFRESH_SECRET`) are entirely distinct from staff auth's. Single-session enforcement is fully backend-enforced: redeeming the same invitation again immediately invalidates the previous session (401 on next call) — no frontend action needed for this.
- **Attempt runtime** (`attempts` module, all routes under `/attempt`, guarded by `CandidateJwtAuthGuard`, throttled 30 req/min): `GET /attempt/current` (full state, or pre-start exam preview), `POST /attempt/start` (idempotent), `POST /attempt/answer` (upsert, one question at a time), `POST /attempt/submit` (idempotent, returns only `{ status }` — never a score). Options in `current`'s response never include `isCorrect`. The timer is purely server-computed (`remainingSeconds = max(0, deadline - now)`); there is no server-push "time's up" event — an expired attempt only actually flips to `auto_submitted` the next time any `/attempt/*` call touches it (lazy settlement).
- **Proctoring** (`POST /attempt/proctoring-event`, body `{ eventType, metadata? }`): the only existing frontend-reporting contract. Allowed client-submitted `eventType`s: `tab_switch`, `fullscreen_exit`, `copy_paste`, `right_click`, `dev_tools_detected`, `refresh_warning`, `idle_timeout` — severity is computed server-side, not trusted from the client. **No webcam/mic/screenshot capture exists anywhere in the codebase**, and no server-side enforcement (forced fullscreen, blocked copy/paste) exists — today's contract is detection-and-reporting only.
- **Live monitoring gateway** (`MonitoringGateway`, Socket.IO `/monitoring`) is staff-only — authenticates against the staff JWT secret and requires `exam:manage`. A candidate token cannot and should not connect to it. The gateway's `roster:presence` is driven passively by `Attempt.lastSeenAt`, which any authenticated `/attempt/*` call updates as a side effect (`LastSeenInterceptor`) — no explicit heartbeat endpoint exists or is needed.
- **Grading/results are never exposed to the candidate.** `submit()` returns only `{ status }`; results are retrievable exclusively via `apps/api`'s staff-only `GET /exams/:examId/results`. The post-submit screen is necessarily a static confirmation, not a results view.
- **Existing e2e coverage** (`apps/api/test/exam-taking-runtime.e2e-spec.ts`, `session-enforcement-anti-cheat.e2e-spec.ts`) already exercises this full backend flow and is the source of truth for exact request/response shapes referenced above.

## 2. Scope Decisions

- **Anti-cheat: detection + reporting only, no enforcement.** The frontend listens for browser signals and reports them via the existing `proctoring-event` contract; it does not attempt to force fullscreen, block copy/paste, or otherwise restrict the browser. Matches what the backend already supports today; enforcement is explicitly deferred, not silently dropped.
- **No webcam/media capture.** Out of scope — no backend contract exists for it, and none is being added this phase.
- **Question navigation: one question per screen + sidebar/drawer navigator**, showing answered/unanswered/marked-for-review state across all sections, with jump-to-question support.
- **Responsive**: desktop, tablet, and mobile are all in scope. The sidebar navigator collapses into a tap-to-open drawer below a breakpoint; the question card and Prev/Next controls remain full-width and reachable on mobile.
- **Visual identity is distinct from the recruiter/org-admin consoles** — a new "Calm Focus" palette (sage green `#2F6F5E` primary, off-white `#F4F7F6` background, generous whitespace, rounded corners), chosen deliberately to keep a candidate calm under timed/monitored conditions rather than reusing the staff tools' visual language.
- **New backend addition**: `apps/exam-runtime`'s `candidate-auth` endpoints (`redeem`, `refresh`, `logout`) also set an httpOnly refresh-token cookie, mirroring the exact existing pattern in `apps/api/src/auth/auth.controller.ts` (`res.cookie(REFRESH_COOKIE, tokens.refreshToken, { httpOnly: true, sameSite: 'lax', secure: false })`; refresh reads `dto.refreshToken ?? req.cookies?.[REFRESH_COOKIE]`). The response body is unchanged (still includes `refreshToken`, for parity with the existing pattern and any future non-browser client), but **the candidate frontend never stores that body value anywhere** — it relies entirely on the cookie for silent refresh. This means a browser crash or accidental tab close doesn't cost the candidate their exam (re-opening the invitation link and redeeming again resumes the existing in-progress attempt, since `start` is idempotent), without the XSS exposure of keeping a refresh token in `localStorage`/`sessionStorage`.
- **No results screen for candidates** — confirmed as a backend constraint, not a scope choice. The post-submit screen is a static confirmation only.
- **No candidate → recruiter reply UI.** Messaging is one-way today (recruiter → candidate, surfaced passively via the `messages` array in `attempt/current`); building a reply endpoint is out of scope.

## 3. Screens & Flow

New `apps/web/app/(candidate)` route group with its own layout — no shared chrome with the recruiter/org-admin shells (this is a focus-mode, external-user surface).

| Route | Purpose | Backend endpoints consumed |
|---|---|---|
| `/candidate/start?token=...` | Invitation-link landing page; redeems the token immediately. Shows a static error screen (no retry) if the invitation is revoked/expired or the exam isn't published. | `POST /candidate-auth/redeem` |
| `/candidate/welcome` | Pre-start screen: exam title, instructions, duration, and a monitoring disclosure (tab-switch/copy-paste/etc. will be reported). If an attempt already exists (resume case), this screen is skipped entirely. | `GET /attempt/current` (pre-start shape), `POST /attempt/start` |
| `/candidate/exam` | The exam session: one question per screen, sidebar/drawer navigator, countdown timer, mark-for-review, Prev/Next, and a "Review & Submit" flow with an unanswered-count confirmation modal before the actual submit call. | `GET /attempt/current`, `POST /attempt/answer`, `POST /attempt/submit`, `POST /attempt/proctoring-event` |
| `/candidate/submitted` | Static confirmation ("Your exam has been submitted. Results will be reviewed by the recruiter.") — no results shown, per the backend constraint above. | none |
| `/candidate/session-ended` | Shown on any `401` from `/attempt/*` or `/candidate-auth/*` — covers both "your session was redeemed elsewhere" and "your refresh expired." No retry; the candidate must use their invitation link again if the exam is still open. | none |

## 4. Client Architecture

Builds on `@tanstack/react-query`, already installed and in use by the existing recruiter/org-admin consoles — no new dependency.

- **`CandidateAuthProvider`**: parallel to (not shared with) the existing staff `AuthProvider`, scoped to `apps/exam-runtime`'s base URL. Access token in memory only (React state); refresh handled transparently via the httpOnly cookie described in Section 2 — the candidate frontend never persists a refresh token client-side.
- **`useAttemptQuery`**: `GET /attempt/current` via React Query, `refetchInterval: 30000` plus `refetchOnWindowFocus: true` (so returning from a tab-switch immediately reconciles state and the timer rather than waiting out the interval). This call is also what keeps the candidate "online" in the staff live-monitoring roster, as a side effect of `LastSeenInterceptor` — no separate heartbeat needed.
- **`useAnswerMutation`**: debounced 800ms per `questionId` (independent debounce timers per question, so flipping between two questions quickly doesn't cancel either one's pending save) — coalesces rapid option-clicking into one request and stays well under the shared 30 req/min throttle.
- **`useCountdown(remainingSeconds)`**: ticks locally every second for display; re-seeds itself from the server's `remainingSeconds` on every successful poll, correcting any client-clock drift without depending on constant server round-trips. At 0, shows "Time's up — submitting..." and fires `POST /attempt/submit` itself, since the server only auto-settles lazily on the next touch.
- **Proctoring event listeners**, registered once at the `/candidate/exam` screen root, each debounced per-event-type before calling `reportProctoringEvent(type, metadata)` (fire-and-forget, `.catch()`'d — a failed report must never block the candidate's exam):
  - `visibilitychange` → `tab_switch` (5s debounce)
  - `fullscreenchange` (only when exiting a fullscreen state the app itself entered) → `fullscreen_exit`
  - `copy`/`paste` document listeners → `copy_paste`
  - `contextmenu` → `right_click`
  - `keydown` (F12 / Ctrl+Shift+I) → `dev_tools_detected`
  - outer-vs-inner window dimension check, polled every 2s → `dev_tools_detected` (catches docked devtools panels that don't fire the keyboard shortcut)
  - inactivity timer (no mouse/keyboard input for 5 minutes) → `idle_timeout`

## 5. Error Handling

- **401 on any `/attempt/*` or `/candidate-auth/*` call**: redirect to `/candidate/session-ended` — never silently retried, since this can mean the session was legitimately killed by a re-redemption elsewhere.
- **Network failure on an answer save**: retry with exponential backoff (3 attempts) before surfacing a small non-blocking toast ("couldn't save your last answer, retrying...") — must never block question navigation.
- **Network failure on submit**: blocking retry dialog. Submit is idempotent server-side, so retrying is always safe, and silently losing a submit is far worse than a delayed answer save.
- **429 (throttled)**: silent backoff-and-retry for answer/proctoring calls; the same blocking retry dialog as above if it occurs on submit.
- **Invitation redemption failure** (revoked, expired, exam not published): static error screen, no retry — these are not transient failures.

## 6. Testing

- Component/unit tests (Jest + Testing Library, matching the existing `apps/web` convention) for `useCountdown`, the per-question debounce logic, and each screen's render states (loading, error, resume-in-progress, terminal states).
- A Playwright e2e golden path (`apps/web/e2e/candidate-golden-path.spec.ts`, matching the existing `recruiter-golden-path.spec.ts` / org-admin e2e convention already established in this repo): redeem invitation → start → answer questions across multiple sections → mark one for review → submit → confirmation screen.
