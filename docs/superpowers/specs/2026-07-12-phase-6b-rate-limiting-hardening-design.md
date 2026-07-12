# Phase 6b: Rate Limiting Hardening — Design Spec

## 1. Context & Scope

Phase 6 ("Compliance & Security Hardening") was decomposed into four sub-phases when first scoped: 6a (CI + dependency/secret scanning, shipped), 6b (this spec), 6c (audit log completeness + access review), 6d (GDPR data subject rights).

**Current state, confirmed by direct codebase survey before scoping:** no rate-limiting tooling exists anywhere in this repo — `throttl`/`rate-limit` matches zero results across every workspace's `package.json`. This remains true after Phase 6e's dependency migrations (re-verified, not assumed stale). `apps/api` already has `ioredis@5.10.1`/`bullmq@^5.34.0` (for its async-job queue, `apps/api/src/jobs/redis-connection.ts`); `apps/exam-runtime` — the more exposed, candidate-facing surface — has **no Redis client at all** today.

**Endpoints in scope, identified by direct code survey:**
- Staff auth (`apps/api`): `POST /auth/staff/login`, `POST /auth/refresh`, `POST /auth/logout`
- Candidate auth (`apps/exam-runtime`): `POST /candidate-auth/redeem`, `POST /candidate-auth/refresh`, `POST /candidate-auth/logout`
- Exam attempt flow (`apps/exam-runtime`): `GET /attempt/current`, `POST /attempt/start`, `POST /attempt/answer`, `POST /attempt/submit`, `POST /attempt/proctoring-event`
- AI question generation (`apps/api`): `POST /questions/ai-generate` — already credit-metered by Phase 5d (`AiCreditUsage`), but request-rate is a distinct concern from credit cost
- File upload (`apps/api`): `POST /organizations/branding/logo`

The master spec's own Phase 6 bullet ("rate limiting hardening") gives no further detail beyond the phase name — this spec's tier structure is a fresh design, not derived from a pre-existing requirement.

## 2. Architecture

`@nestjs/throttler@^6.5.0` (confirmed compatible with this repo's NestJS `11.1.28` via its own declared peer range `^11.0.0`) in both `apps/api` and `apps/exam-runtime`, backed by `@nest-lab/throttler-storage-redis@^1.2.0` (confirmed compatible: declares `@nestjs/throttler>=6.0.0`, `ioredis>=5.0.0`, matching this repo's `ioredis@5.10.1`).

Each app registers `ThrottlerModule.forRootAsync()` in its root module (`AppModule` for both — `apps/exam-runtime`'s `InternalAppModule` is not internet-facing and is out of scope, matching this project's established internal/public surface split from Phase 3c/3d), constructing `new ThrottlerStorageRedisService(new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379'))` — reusing the exact env-var pattern `apps/api`'s own BullMQ connection already uses, so no new Redis instance needs to be stood up locally or in any deployment; the same Redis serves both BullMQ and rate-limiting. `apps/exam-runtime` gains `ioredis` as a new direct dependency (it has none today).

The global `ThrottlerGuard` is registered app-wide via `APP_GUARD` in each `AppModule`, giving every route the default tier automatically. Routes needing a stricter or looser limit than the default get an explicit `@Throttle({ default: { limit, ttl } })` decorator, overriding the global default for that route only — no route needs to be individually wired into the guard itself, only annotated where it deviates from default.

**Limit tiers** (all windows expressed via `@nestjs/throttler`'s `seconds()` helper for readability):
| Tier | Endpoints | Limit |
|---|---|---|
| Strict (auth) | staff login, candidate redeem, both apps' `refresh` | 5 req / 60s per IP |
| Moderate (attempt actions) | `attempt/start`, `answer`, `submit`, `proctoring-event` | 30 req / 60s per IP |
| Strict (AI generation) | `questions/ai-generate` | 10 req / 60s per IP |
| Moderate (upload) | `organizations/branding/logo` | 10 req / 60s per IP |
| Default (everything else) | all other routes in both apps | 100 req / 60s per IP |

Keying is IP-based via `@nestjs/throttler`'s built-in tracker (default behavior, no custom `getTracker()` override) — user-based keying (post-authentication) is a reasonable future enhancement but adds real complexity (extracting the authenticated principal from the existing guard chain at the point the throttler guard runs) that this phase does not need to take on for its stated goal of blunting IP-based abuse/brute-force.

On limit exceeded, `@nestjs/throttler`'s own `ThrottlerException` fires, producing NestJS's standard `429 Too Many Requests` JSON response (`{"statusCode":429,"message":"ThrottlerException: Too Many Requests"}`) — this project has no global custom exception filter to integrate with (confirmed via search), so no additional response-shaping work is needed.

`InternalAppModule` (the internal, non-internet-facing listener in `apps/exam-runtime`, per the Phase 3c/3d dual-listener architecture) is explicitly excluded from throttling — it's bound to `127.0.0.1` only and reached exclusively by `apps/api`'s own internal client, not by any external actor a rate limiter would meaningfully protect against.

## 3. File Structure

- **Modify** `apps/api/package.json`, `apps/exam-runtime/package.json` — add `@nestjs/throttler`, `@nest-lab/throttler-storage-redis`; `apps/exam-runtime/package.json` additionally adds `ioredis`.
- **Modify** `apps/api/src/app.module.ts`, `apps/exam-runtime/src/app.module.ts` — register `ThrottlerModule.forRootAsync()` and the global `APP_GUARD` throttler guard.
- **Modify** `apps/api/src/auth/auth.controller.ts`, `apps/exam-runtime/src/candidate-auth/candidate-auth.controller.ts`, `apps/exam-runtime/src/attempts/attempt.controller.ts`, `apps/api/src/questions/questions.controller.ts` (the `ai-generate` route only), `apps/api/src/organizations/organizations.controller.ts` (the `branding/logo` route only) — add `@Throttle(...)` decorators per the tier table above.
- **Create** (small, colocated with existing Redis-connection precedent) a shared Redis-connection helper for `apps/exam-runtime`, mirroring `apps/api/src/jobs/redis-connection.ts`'s existing pattern, OR construct the connection inline in `app.module.ts` if the pattern doesn't warrant its own file (final call at implementation time, following this codebase's own established preference for small, focused files without premature abstraction).

## 4. Testing & Verification Approach

1. Unit tests: none anticipated beyond what `@Throttle()` decorators and module registration already cover declaratively — no custom guard logic is being written, so there's no bespoke unit-testable behavior beyond the library's own (already-tested) implementation.
2. E2e tests: for the two most security-relevant tiers (auth, AI generation), a test that fires `limit + 1` requests within the window and asserts the last one returns `429`, and that a request just outside the window succeeds again (proves the window actually resets, not just that a cap exists).
3. Full existing unit and e2e suites re-run to confirm no regression — a global guard is exactly the kind of change that could unexpectedly interact with existing tests if any test suite fires more than the default tier's request volume against the same IP within a 60s window; if that surfaces, the fix is either raising the default tier's limit or disabling throttling in the test environment's own bootstrap (final call at implementation time, based on what actually breaks, not assumed in advance).
4. A live manual check (matching this project's now-established practice, most recently proven valuable in the live-monitoring fix) — hit a real strict-tier endpoint past its limit against a running dev server and confirm a real `429` response, not just an automated test's assertion.

## 5. Open Items

- Exact numeric limits (5/60s, 30/60s, 10/60s, 100/60s) are a reasonable starting point, not empirically tuned against real traffic — revisit if they prove too strict/loose once observed in practice.
- User-based (post-auth) keying, per-organization rate limits, and any admin-facing rate-limit configuration UI are explicitly out of scope for this phase.
- Whether the test environment needs throttling disabled/relaxed is genuinely unknown until the existing suites are run against the new global guard — flagged as a real risk to check early in implementation, not deferred silently.
