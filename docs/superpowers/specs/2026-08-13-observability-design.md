# Production Observability — Design

**Status:** approved, not yet implemented
**Date:** 2026-08-13
**Roadmap position:** item 1 of the "next level" roadmap. Prerequisite for SOC 2, and the fix for the fact that production incidents are currently discovered by users.

## Problem

The platform has no telemetry of any kind. Concretely, as of `cfe9e26d`:

- No external error tracking, no APM, no metrics. No `@sentry/*`, OpenTelemetry, Application Insights, pino or winston anywhere in the tree.
- **No health endpoint exists.** `/api/v1/health` returns 404 because it was never built. Every verification to date has used `/api/v1/auth/saml/<slug>/status` as a stand-in.
- 30 files use Nest's `Logger`, writing unstructured text to pm2 logs.
- **pm2 logs are unbounded** — 24MB and growing, no `pm2-logrotate` installed.
- Frontend errors are entirely invisible.

**What already exists, and which this design builds on rather than replaces.** `packages/shared/src/system-events/system-events-exception.filter.ts` defines `SystemEventsExceptionFilter`, a `@Catch()` catch-all registered as an `APP_FILTER` in **both** `apps/api` and `apps/exam-runtime`. It records unhandled exceptions — and deliberate `HttpException`s with status ≥ 500 — into a `system_events` table, viewable in the admin console, with a retention service alongside it. It is already fire-and-forget, already never throws, already WebSocket-safe, and its `contextFrom()` already builds an **allow-list** of `status`, `method`, `route`, `invitationId`, `userId` and a 1500-char truncated stack.

Its limits are what motivate this work: it writes to the same database that is often the thing failing, it has no alerting, nothing watches it, it cannot see frontend errors, and it cannot tell you the process is down. It is a good audit trail, not a monitoring system.

The cost of this is documented in the deployment history: on 2026-08-06 production served 502s for 18 minutes because a deploy stopped `web` and never restarted it. Nothing detected it.

## Constraints

1. **Budget is effectively zero.** VM and Azure SQL already dominate spend. The design must cost $0/month recurring.
2. **The VM's bottleneck is disk I/O**, not CPU — burst-credit exhaustion on the P6 OS disk is a recurring, reproducible failure mode. Nothing in this design may add sustained disk writes.
3. **Two-person shared rota.** Alerts must reach both people; there is no 24/7 pager.
4. **No stated data-residency requirement.** Chosen on engineering merit, with compliance implications recorded below.
5. Candidate PII — names, emails, answer text — must not leave the infrastructure.

## Decisions

### Chosen stack

| Need | Tool | Cost |
|---|---|---|
| Error tracking, all 3 apps | Sentry, hosted free tier | $0 |
| External uptime | UptimeRobot free tier | $0 |
| Log growth | `pm2-logrotate` | $0 |
| APM / metrics / tracing | **nothing** | $0 |

**Why two tools rather than one.** Sentry and UptimeRobot answer different questions and neither substitutes for the other: a dead process reports no errors, and a successful ping says nothing about a 500-loop. The uptime check must run *outside* the VM, because anything hosted on the VM reports nothing during exactly the outage it exists to catch.

**Why hosted rather than self-hosted.** Self-hosted Sentry requires Kafka and ClickHouse and will not fit an 8GB box already running three Node services, Redis and Piston. GlitchTip (open-source, Sentry-API-compatible) *would* fit, but it runs a Postgres on the same disk whose burst-credit exhaustion is the standing failure mode, and it dies when the VM dies — adding operational burden to save nothing, since the hosted free tier already costs zero. Revisit only if a future requirement forbids candidate data leaving the infrastructure entirely; because both speak the same SDK protocol, that migration is a DSN change rather than a rewrite.

**Why no APM.** There is no performance question currently unanswerable. Adding tracing now is cost and noise with no consumer.

### Sentry project layout

Three separate Sentry projects — `exam-api`, `exam-runtime`, `exam-web` — so alert routing can differ per service without per-rule tag filtering.

### Accepted limitations

- **~30-day retention** and roughly **5k events/month**. Exceeding the event quota is itself a signal.
- **One user seat**, so a shared login. Alerts route to a shared email/Slack destination, meaning both responders are notified regardless of who holds the seat. An auditor will eventually want individual accountability here; nothing today depends on it.
- **No acknowledgement mechanism** on the free tiers. The rota agrees a convention (reply-all claiming the incident). Low-tech, and honest about what it is.
- **Sentry's browser SDK adds ~30–40KB gzipped** to the candidate exam page. Accepted: candidate-side errors are both the highest-value and currently the only completely invisible class.

### Compliance implications (recorded, not resolved here)

Sentry becomes a **sub-processor** and needs disclosure plus a DPA before any customer contract that enumerates sub-processors. This is the price of the chosen option; the all-Azure alternative avoided it at the cost of materially worse error triage. Log retention for SOC 2 is answered locally by `pm2-logrotate`'s 30-day window at no cost.

## Architecture

```
                    ┌─ UptimeRobot (external) ──────┐
                    │  3 monitors, 5-min interval    │
                    └────────────┬───────────────────┘
                                 │ GET /health
   ┌─────────────────────────────▼──────────────────────────┐
   │  VM 20.219.132.226                                     │
   │   api :3001      exam-runtime :3003     web :3000      │
   │     │                  │                    │          │
   │     └──── Sentry SDK ──┴────────────────────┘          │
   │              │ (scrubbed, rate-limited, async)         │
   │   pm2-logrotate ── local logs, capped + retained       │
   └──────────────┼─────────────────────────────────────────┘
                  ▼
            Sentry (hosted)
```

Three independent layers on purpose. No layer depends on another being healthy.

## Components

### 1. Health endpoint

**Routes.** `GET /api/v1/health` on api and exam-runtime; `GET /health` on web (a Next.js route — nginx sends `/` to web and `/api/v1` to api, so the paths do not collide).

**Response.** `200 {"status":"ok"}` or `503 {"status":"degraded"}`. **The body never names the failing dependency.** Which check failed goes to logs and Sentry. A public endpoint reporting `db: down` is free reconnaissance for an attacker.

**Checks.** `SELECT 1` against the database and a Redis `PING`, each with a **2-second timeout** so a hung dependency fails the check rather than hanging it. Deliberately **outside** the RLS tenant transaction — this is not tenant-scoped work, and `forTenant` would consume a pooled connection from the pool that is already the concurrency ceiling.

**Caching.** The computed result is cached for **10 seconds**. The endpoint is public and touches the database; without a cache it is a free DB-load amplifier for anyone who finds the URL.

**Web's check** is liveness only — that the standalone server responds. It has no database of its own. This is the monitor that would have caught the 2026-08-06 incident.

**Monitors.** Three, all hitting the public TLS surface so they exercise nginx as well as the app:

| Monitor | URL |
|---|---|
| api | `https://prudenthire.prudentconsulting.com/api/v1/health` |
| web | `https://prudenthire.prudentconsulting.com/health` |
| exam-runtime | `https://prudenthire.prudentconsulting.com:3002/api/v1/health` |

exam-runtime is reached on `:3002` because nginx serves it on its own TLS port rather than path-proxying — Socket.io namespace semantics break under path-proxying, so this is deliberate and must not be "simplified" into a path.

At a 5-minute interval with two consecutive failures required, **worst-case detection is ~10 minutes**. That is a deliberate trade against alert flapping on a single dropped packet. It would have surfaced the 2026-08-06 outage in roughly 10 minutes rather than by chance after 18.

### 2. Error capture — extend the existing filter, add nothing parallel

**Backends: `SystemEventsExceptionFilter` gains a second sink.** Where it today calls `void this.systemEvents.record(...)`, it additionally reports to Sentry. One shared file, both apps, no new filter and no interceptor.

This is the load-bearing decision of the whole design, and it is worth stating why. Adding a separate catch-all filter would have to be registered in each app's `APP_FILTER` chain, and `apps/exam-runtime` registers `SystemEventsExceptionFilter` **before** `ServerBusyRetryAfterFilter` on purpose — Nest matches global filters in reverse registration order, so a naively-appended catch-all would shadow the `@Catch(HttpException)` filter and silently break the `server_busy` 503 + `Retry-After` contract. Extending the existing filter sidesteps that entirely: the ordering is already correct and already documented in the file.

It also inherits, for free, four properties that would otherwise have to be rebuilt and retested: fire-and-forget so the response never waits, a `record()` that never throws, WebSocket-safety for the monitoring gateway where `switchToHttp()` yields no response, and the 4xx filter (only non-`HttpException` or status ≥ 500) that keeps expected request outcomes out of the signal.

**`apps/web`** uses the Next.js SDK for both server and browser runtimes. This is genuinely new — no equivalent exists.

### 3. PII scrubbing — `toSentryEvent(entry) => event | null`

Mostly already solved, and the design deliberately does not re-solve it. `contextFrom()` in the existing filter is **already an allow-list**: it emits `status`, `method`, `route`, `invitationId`, `userId` and a truncated stack, and nothing else. Request bodies, headers and cookies are never read, so answer text, candidate names, emails and `Authorization` bearer tokens cannot ride along.

The new work is therefore narrow: map that existing context onto a Sentry event and **pin the allow-list with a test**, so that a future field added to `contextFrom()` for the system-events console cannot silently start leaving the infrastructure. That test is the actual deliverable here — the risk being defended against is not today's code, it is next year's innocuous-looking addition.

`sendDefaultPii` is set to `false` explicitly rather than relying on the SDK default, because the SDK would otherwise attach request data the existing filter is careful never to touch.

**Fail closed:** if mapping throws, the event is dropped rather than sent raw, and the exception is swallowed so a telemetry bug cannot convert a handled error into an unhandled one.

**One addition to `contextFrom()`:** `attemptId`, when the request carries one. The severity classifier needs it, and it is an opaque identifier consistent with what the allow-list already emits. It also improves the system-events console independently.

### 4. Severity classification — `classifySeverity(service, hasAttempt) => level`

A pure function costing **zero extra queries**. Derived from the service plus whether the request carried an attempt context:

- `exam-runtime`, or any event carrying an `attemptId` → **immediate alert**. exam-runtime *is* the candidate path by construction, and an error carrying an `attemptId` is by definition hurting someone mid-exam, which is unrecoverable.
- api and web without attempt context → **daily digest**.

Querying for live attempts per error was rejected: it adds a database round trip to the error path, which is the worst possible place for one.

**How this is wired**, so the plan does not have to invent it. The classifier's output is attached to every event as a tag, `severity_band`, with values `immediate` or `digest`. Sentry alert rules then key off that tag rather than off project membership, which keeps the routing rule identical in all three projects and means an api error that *does* carry an `attemptId` still pages correctly:

| Sentry project | Rule |
|---|---|
| `exam-runtime`, `exam-api`, `exam-web` | new issue where `severity_band = immediate` → notify shared destination immediately |
| same three | new issue where `severity_band = digest` → daily summary |

Routing on a tag rather than a project is the decision worth keeping: project-based routing would silently misclassify the api errors that matter most.

### 5. Send-rate limiting

A client-side cap of **20 events per minute per process**, applied in `beforeSend`.

The free tier's 5k monthly events can be exhausted in an afternoon by a single 500-loop — precisely when observability matters most. Events over the cap are **dropped from the send but still written to the local log**, so information is preserved and only quota is saved. Sentry's server-side grouping makes noisy errors *readable*; it does not make them *free*. These are different problems.

### 6. Inert by default

No DSN configured means no telemetry and no crash. A `warn` is logged at boot so a silently-inert deployment is distinguishable from "no errors have occurred" — the same pattern `FaceEmbedderService` already uses for its missing embedding model, and for the same reason.

Configuration:

| App | Variables |
|---|---|
| `apps/api/.env` | `SENTRY_DSN`, `SENTRY_ENVIRONMENT` |
| `apps/exam-runtime/.env` | `SENTRY_DSN`, `SENTRY_ENVIRONMENT` |
| `apps/web/.env.local` | `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ENVIRONMENT` |

All are gitignored and must be re-applied after any redeploy that regenerates `.env` files.

### 7. Log rotation

`pm2 install pm2-logrotate`, configured to 10MB max size, 30 files retained, compression on. Caps the current unbounded growth and provides the local retention window.

## Data flow

**Errors.** Request throws → `SystemEventsExceptionFilter.catch()` → existing DB sink (`void record(...)`, unchanged) **and** the new Sentry sink in parallel → `toSentryEvent()` → `classifySeverity()` → rate-limit check → async send → `super.catch()` produces the HTTP response exactly as today.

Both sinks are fire-and-forget, so neither can delay the response and neither can fail the other: a Sentry outage must not stop the DB audit trail, and a database outage — the case where external reporting matters most — must not stop the Sentry send. `apps/api` calls `enableShutdownHooks()` already (`main.ts:16`), so Nest's shutdown hook can call `Sentry.close(timeout)` to flush in-flight events instead of losing them on every deploy restart.

**Health.** UptimeRobot → nginx → app → cached dependency checks → 200/503. Two consecutive failures before alerting, to avoid flapping on a single dropped packet.

**Logs.** pm2 writes as today; logrotate caps and retains.

## Failure handling

The governing rule: **observability must never be able to hurt the thing it observes.**

| Failure | Behaviour |
|---|---|
| Sentry unreachable | SDK buffers then drops. Request handling unchanged. |
| Scrubber throws | Event dropped entirely — fail closed, never send raw. |
| Any telemetry bug | Capture path is wrapped; a telemetry error must never convert a handled error into an unhandled one. |
| Health endpoint flooded | 10-second cache absorbs it; no DB amplification. |
| Dependency hung | 2-second per-check timeout fails fast rather than holding a pooled connection. |
| Event quota exhausted | Rate limiter prevents it; overflow still lands in local logs. |
| logrotate over-prunes | 30 days retained — forensic window and retention answer both. |

## Testing

The logic lives in pure functions specifically so it is testable. "Did Sentry receive it" is not unit-testable; everything that matters is.

| Test | Asserts |
|---|---|
| `toSentryEvent` against a context built from a request carrying every known PII field — candidate email, name, answer text, `Authorization` header, cookies, request body | none survive; only opaque IDs remain |
| `toSentryEvent` given a context containing an unexpected extra key | the key is **not** forwarded — pins the allow-list against future additions to `contextFrom()` |
| mapping throws | event dropped, nothing sent, exception swallowed |
| rate limiter, N+1 events in one window | overflow dropped from send, still logged |
| `classifySeverity` table test over (service × hasAttempt) | expected level per row |
| health: DB rejects / Redis rejects / both healthy | 503, 503, 200 |
| health 503 body | contains **no** dependency detail |
| health under repeated calls | dependencies checked once per cache window, not per request |
| exam-runtime with Sentry reporting added to `SystemEventsExceptionFilter` | `ServerBusyRetryAfterFilter` still returns 503 + `Retry-After` — the filter ordering is unchanged, and this pins it |
| existing `system-events-exception.filter.spec.ts` suite | still passes unmodified — the DB sink's behaviour is not altered by adding the second sink |
| no DSN configured | init does not throw; warn logged |
| DSN pointed at an unreachable host | request handling unchanged |

**The scrubber test is the one to mutation-test hardest.** A scrubber that passes because the fixture happens to omit the field it misses is worse than no scrubber — it buys false confidence about PII.

**One manual verification belongs in the plan as an explicit step**, since delivery cannot be unit-tested: trigger a deliberate error in production, confirm it arrives in Sentry, and confirm the payload contains no PII.

## Out of scope

- APM, distributed tracing, custom metrics
- Off-box log aggregation
- Azure Key Vault migration (separate spec, deferred)
- The two outstanding credential rotations — SQL password and Azure AI key (separate ops task, tracked independently)
- SOC 2 policy documentation, risk assessment, and the audit itself
- Structured-logging migration of the existing 30 `Logger` call sites

## Known gaps, accepted for now

**No acknowledgement or escalation.** If both responders assume the other took an alert, it is silently dropped. Free tiers offer no ack primitive. Mitigated by convention only.

**No synthetic transaction monitoring.** The health checks prove the services answer and their dependencies respond; they do not prove a candidate can actually complete an exam. A synthetic golden-path check would, and is the natural next increment.

**Retention is 30 days.** Sufficient for operations. If an auditor requires a year for security-relevant events, the local pm2 logs are the answer, not Sentry.
