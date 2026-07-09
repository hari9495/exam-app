# Phase 3c — Internal Exam-Runtime Surface Hardening Design Spec

**Status:** Approved, ready for implementation planning.
**Date:** 2026-07-09
**Depends on:** Phase 3b (Exam Runtime Service Isolation) — merged to `main` (commit `6698200`). This spec directly addresses the four "Phase 3c entry criteria" that Phase 3b's final whole-branch review recorded in its own design doc's Open Items section.

---

## 1. Context and Scope

Phase 3b split candidate exam-taking into its own service, `apps/exam-runtime`, and gave `apps/api` (the admin/recruiter backend) an internal HTTP surface to call for force-submit, reanalyze, settle-if-expired, and monitoring-notification actions. Its final review found the implementation architecturally sound but flagged four assumptions that only hold because nothing is deployed to a real network yet:

1. The internal surface has no network isolation of its own — same Nest app, same port, same `api/v1` prefix as public candidate routes; only a shared-secret header separates `/internal/*` from the public surface.
2. `ExamRuntimeInternalClient`'s `fetch()` calls have no timeout or abort handling.
3. `ExamsService.getResults` settles expired attempts via a sequential, one-call-per-attempt loop against the internal surface.
4. `InternalAuthGuard`'s secret comparison uses `!==`, which is not constant-time.

**Goal of this sub-phase:** close all four gaps at the code level, so that whichever future phase actually stands up real cloud infrastructure inherits a surface that's already safe to expose, not one that needs a rewrite first.

### In scope
- Split `apps/exam-runtime`'s bootstrap into two Nest application contexts: a public app (unchanged routes/port) and a new internal-only app bound to `127.0.0.1` by default, on its own port.
- Add request timeout/abort handling to every `ExamRuntimeInternalClient` method, with network-error translation to a proper HTTP exception.
- Replace the sequential per-attempt settle-if-expired loop in `ExamsService.getResults` with a single batch call to a new internal endpoint.
- Replace `InternalAuthGuard`'s secret comparison with a constant-time comparison.
- Update the e2e test harness (`apps/api/test/dual-app.ts`) so the four existing dual-app e2e specs keep passing unchanged against the new dual-listener topology.

### Explicitly out of scope (deferred to later sub-phases)
- **Custom domain + SSL automation, email domain verification** — a distinct subsystem with its own infrastructure decisions (DNS provider, Cloudflare account), not addressed here.
- **Region-sharded deployment (2nd region)** — requires real multi-region cloud infrastructure that doesn't exist yet.
- **Load testing to 10K+ concurrent, autoscaling tuning** — the roadmap's stated capstone validation for all of Phase 3; meaningless to run until the platform is actually deployed somewhere.
- **Real network-edge enforcement (firewall/security group blocking `/internal/*`)** — not implementable without real cloud infrastructure. This phase's `127.0.0.1` binding is the code-level substitute available today; a future deployment phase adds the actual network policy on top of it.
- **Any change to the internal surface's authorization model beyond the secret comparison fix** — e.g. mTLS, per-caller API keys, request signing. The single shared secret remains the auth mechanism; only how it's compared changes.

---

## 2. Dual-Listener Network Isolation

`apps/exam-runtime/src/main.ts` currently does one `NestFactory.create(AppModule)` where `AppModule` imports `InternalModule` as a sibling of `CandidateAuthModule`, `AttemptModule`, `MonitoringModule`, `ProctoringAnalysisModule`, and `GradingModule` — one Nest app, one HTTP listener, one port (`EXAM_RUNTIME_PORT`, default 3002, bound to all interfaces).

**New shape:**

- `AppModule` (`apps/exam-runtime/src/app.module.ts`) drops `InternalModule` from its imports — it now contains only the candidate-facing modules.
- A new `InternalAppModule` (`apps/exam-runtime/src/internal-app.module.ts`) imports `ConfigModule.forRoot({ isGlobal: true })`, `PrismaModule`, and `InternalModule` (which already imports its own dependencies — `GradingModule`, `MonitoringModule`, `ProctoringAnalysisModule` — unchanged).
- `main.ts`'s `bootstrap()` creates and starts **two** Nest applications in the same process:
  - The public app: unchanged behavior, `EXAM_RUNTIME_PORT` (default 3002), bound to all interfaces (`0.0.0.0`), CORS enabled for `WEB_ORIGIN`.
  - The internal app: new `EXAM_RUNTIME_INTERNAL_PORT` (default 3003), bound to `EXAM_RUNTIME_INTERNAL_HOST` (default `127.0.0.1`, overridable via env). No CORS needed — it's never called from a browser.
  - Both get the same `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })` and `api/v1` global prefix, matching today's public app's configuration.

Two separate Nest DI containers means `TenantPrismaService`/`PrismaService` are instantiated twice (once per app) — this is fine; each just opens its own connection pool against the same `DATABASE_URL`, with no shared in-memory state between the two apps that would need synchronizing.

`apps/api`'s `ExamRuntimeInternalClient` needs no code change — it already reads `EXAM_RUNTIME_INTERNAL_URL` fresh from the environment on every call; only the env var's *value* changes (now pointing at the internal port/host, e.g. `http://127.0.0.1:3003`, instead of the public one).

**Env vars added:** `EXAM_RUNTIME_INTERNAL_PORT` (default 3003), `EXAM_RUNTIME_INTERNAL_HOST` (default `127.0.0.1`). Documented in `apps/exam-runtime/.env.example` alongside the existing `EXAM_RUNTIME_PORT`.

### Test harness impact

`apps/api/test/dual-app.ts`'s `bootRuntimeApp()` currently boots one exam-runtime app on an ephemeral port and points `EXAM_RUNTIME_INTERNAL_URL` at that same port. It now needs to boot **both** the public and internal exam-runtime apps, each on its own ephemeral port (`app.listen(0, '127.0.0.1')` for the internal one, matching the new default-host behavior), and set `EXAM_RUNTIME_INTERNAL_URL` to the internal app's ephemeral address.

`bootRuntimeApp()`'s external contract is unchanged — it still returns `{ app, port }`, where `app`/`port` refer to the **public** app (the one the four existing e2e specs use directly via supertest for candidate-facing flows: `exam-taking-runtime.e2e-spec.ts`, `live-monitoring.e2e-spec.ts`, `session-enforcement-anti-cheat.e2e-spec.ts`, `ai-proctoring.e2e-spec.ts`). None of those four spec files need to change — they only observe the internal surface indirectly (through `apps/api` admin actions that call `ExamRuntimeInternalClient`, exactly as today), and the internal app's ephemeral port is wired in as a side effect the same way `EXAM_RUNTIME_INTERNAL_URL` already was.

---

## 3. Fetch Timeout, Abort, and Network-Error Translation

`ExamRuntimeInternalClient` (`apps/api/src/exam-runtime-client/exam-runtime-internal.client.ts`) gains a private helper:

```typescript
private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const timeoutMs = process.env.EXAM_RUNTIME_INTERNAL_TIMEOUT_MS
    ? parseInt(process.env.EXAM_RUNTIME_INTERNAL_TIMEOUT_MS, 10)
    : 5000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    throw new ServiceUnavailableException(
      error instanceof Error && error.name === 'AbortError'
        ? `Exam runtime internal call to ${url} timed out after ${timeoutMs}ms`
        : `Exam runtime internal call to ${url} failed: ${error instanceof Error ? error.message : 'unknown error'}`,
    );
  } finally {
    clearTimeout(timer);
  }
}
```

Every existing method (`forceSubmit`, `reanalyze`, `notifyMessageSent`) and the new `settleIfExpiredBatch` (Section 4) call `this.fetchWithTimeout(...)` instead of bare `fetch(...)`. `throwIfNotOk`'s existing 404/400/500 mapping is unchanged — it still only runs on a response that actually came back; `fetchWithTimeout` handles the case where no response ever arrives (timeout, connection refused, DNS failure) by translating it into a `ServiceUnavailableException` (503) before `throwIfNotOk` would ever see it.

Default timeout: **5000ms**, overridable via `EXAM_RUNTIME_INTERNAL_TIMEOUT_MS`.

---

## 4. Batch Settle-If-Expired

**New internal endpoint:** `POST /internal/attempts/settle-if-expired-batch`, body `{ attemptIds: string[] }`, response `204`.

`InternalController` (`apps/exam-runtime/src/internal/internal.controller.ts`) replaces the single-attempt `settle-if-expired` route with this batch one. Inside the existing super-admin `tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, ...)` bypass (unchanged — the internal surface's data-access pattern isn't part of this hardening pass), it fetches every matching attempt in one query:

```typescript
const attempts = await tx.attempt.findMany({
  where: { id: { in: dto.attemptIds } },
  include: { invitation: { include: { exam: true } } },
});
for (const attempt of attempts) {
  await this.attemptSettlement.settleIfExpired(tx, attempt.invitation.exam, attempt);
}
```

This replaces N separate `findUnique` calls (one per HTTP request, as today) with one `findMany`, and the settlement loop itself runs entirely in-process against the already-open `tx` — no network latency between iterations, since it's local DB work, not N separate round trips.

`ExamRuntimeInternalClient` gains `settleIfExpiredBatch(attemptIds: string[]): Promise<void>`, using `fetchWithTimeout` (Section 3). The old single-attempt `settleIfExpired` client method and internal endpoint are removed — nothing else calls them.

`ExamsService.getResults` (`apps/api/src/exams/exams.service.ts`) replaces:
```typescript
for (const attemptId of attemptIdsToSettle) {
  await this.examRuntime.settleIfExpired(attemptId);
}
```
with:
```typescript
await this.examRuntime.settleIfExpiredBatch(attemptIdsToSettle);
```
The existing early-return when `attemptIdsToSettle.length === 0` is unchanged — the batch call is only made when there's actually something to settle.

---

## 5. Constant-Time Secret Comparison

`InternalAuthGuard` (`apps/exam-runtime/src/internal/internal-auth.guard.ts`) replaces:
```typescript
if (!process.env.INTERNAL_SERVICE_SECRET || providedSecret !== process.env.INTERNAL_SERVICE_SECRET) {
```
with a length-checked, `crypto.timingSafeEqual`-based comparison:
```typescript
import { timingSafeEqual } from 'crypto';

function secretsMatch(provided: string, expected: string): boolean {
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }
  return timingSafeEqual(providedBuffer, expectedBuffer);
}
```
`timingSafeEqual` throws if its two buffers differ in length, so the length check must happen first — this does leak the expected secret's length via timing, a materially smaller signal than character-by-character early-exit comparison, and the accepted standard mitigation for this class of check.

The guard also now explicitly rejects a non-string header value before comparing: `request.headers['x-internal-secret']` is typed `string | string[] | undefined` by Express (a client could send the header twice, producing an array), and the current code's `!==` comparison against a string would always be `true` (not equal) for an array anyway — but making the type check explicit removes any ambiguity and matches this hardening pass's intent.

---

## 6. Testing Approach

- **Unit tests:**
  - `ExamRuntimeInternalClient`: extend the existing mocked-`fetch` unit suite with cases for timeout (fake timers / a fetch mock that never resolves, confirm `AbortController.abort()` fires and a `ServiceUnavailableException` is thrown), connection error (fetch mock rejects with a `TypeError`, confirm translation to `ServiceUnavailableException`), and the new `settleIfExpiredBatch` method (correct URL/body, existing 404/400/500 mapping still applies when a response does come back).
  - `InternalController`: extend the existing mocked-collaborators unit suite with a `settle-if-expired-batch` test proving multiple attempt IDs are all settled from one call, and that the old single-attempt route no longer exists (or is genuinely removed from the controller, not just reachable another way).
  - `InternalAuthGuard`: extend the existing suite with a same-length-wrong-secret case and a different-length case, both rejected; keep the existing correct-secret/missing-header/wrong-secret cases passing under the new comparison.
  - `ExamsService.getResults`: update the existing mocked-`examRuntime` unit tests to assert `settleIfExpiredBatch` is called once with the full array of in-progress attempt IDs, replacing the old per-attempt-call assertions.
- **e2e:** the four existing dual-app specs (`exam-taking-runtime`, `live-monitoring`, `session-enforcement-anti-cheat`, `ai-proctoring`) must keep passing unchanged against the new dual-listener `bootRuntimeApp()` — this is the real proof that the internal surface split didn't break the cross-service boundary those tests already exercise. No new e2e spec file is needed solely for this phase; the dual-listener change is proven by the existing specs still working, plus the new/updated unit coverage above for the specific hardening behaviors (timeout, batch, constant-time comparison) that unit tests can exercise more precisely than an e2e test could.
- A manual sanity check (not part of the automated suite): start both `apps/exam-runtime` processes' listeners locally and confirm `curl http://127.0.0.1:<internal-port>/api/v1/internal/...` succeeds while a request from a non-loopback source (e.g. the machine's LAN IP) to the same port is refused at the OS level — proving the bind actually restricts reachability, not just that the code compiles.

---

## 7. Open Items / Deferred to Future Sub-Phases

- Real network-edge enforcement (firewall/security group rules blocking `/internal/*` from outside a deployment's private network) — waits on whichever future phase actually deploys to real cloud infrastructure. This phase's `127.0.0.1` binding is the available substitute until then.
- Custom domain + SSL automation, email domain verification, region-sharded deployment, load testing to 10K+ concurrent, autoscaling tuning — all separate, larger sub-phases per the original roadmap, each needing its own scoping session.
- Any change to the internal surface's authorization model beyond comparison timing (mTLS, per-caller keys, request signing) — not identified as a real gap for the current single-caller (apps/api only) topology; revisit only if a second internal caller is ever introduced.
