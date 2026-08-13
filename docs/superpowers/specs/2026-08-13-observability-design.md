# Production Observability — Design

**Status:** approved, not yet implemented
**Date:** 2026-08-13
**Roadmap position:** item 1 of the "next level" roadmap. Prerequisite for SOC 2, and the fix for the fact that production incidents are currently discovered by users.

## Problem

The platform has no telemetry of any kind. Concretely, as of `cfe9e26d`:

- No error tracking, no APM, no metrics. No `@sentry/*`, OpenTelemetry, Application Insights, pino or winston anywhere in the tree.
- **No health endpoint exists.** `/api/v1/health` returns 404 because it was never built. Every verification to date has used `/api/v1/auth/saml/<slug>/status` as a stand-in.
- **`apps/api` has no catch-all exception filter.** Unhandled errors become generic 500s and are recorded nowhere. `apps/exam-runtime` has two filters, but they are purpose-built (`ServerBusyRetryAfterFilter` and one registered ahead of it), not general capture.
- 30 files use Nest's `Logger`, writing unstructured text to pm2 logs.
- **pm2 logs are unbounded** — 24MB and growing, no `pm2-logrotate` installed.
- Frontend errors are entirely invisible.

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

### 2. Error capture

**`apps/api`** has no catch-all filter today and gets one.

**`apps/exam-runtime` is the integration risk.** It registers two global filters via `APP_FILTER` with an explicit ordering comment in `app.module.ts` about how Nest matches them. A naive catch-all Sentry filter would shadow them and silently break the `server_busy` 503 + `Retry-After` contract. **Decision: capture in exam-runtime via an interceptor that reports and re-throws**, leaving the filter chain untouched, with a regression test pinning that `ServerBusyRetryAfterFilter` still produces its 503 and header.

**`apps/web`** uses the Next.js SDK for both server and browser runtimes.

### 3. PII scrubbing — `scrubEvent(event) => event | null`

A pure function, **allow-list not deny-list**.

**Dropped wholesale:** request bodies, all headers, all cookies. These carry answer text, candidate names and emails, and `Authorization` bearer tokens.

**Retained:** opaque identifiers and request metadata only — `organizationId`, `attemptId`, `examId`, `userId`, route template, HTTP method, status code.

A deny-list would leak the first PII field someone adds and forgets to list. The allow-list fails safe by construction. `sendDefaultPii` is set to `false` explicitly rather than relying on the SDK default.

**Fail closed:** if the scrubber throws, the event is dropped entirely. A scrubber bug must never become a PII leak.

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

**Errors.** Request throws → interceptor or filter catches → event built → `scrubEvent()` → `classifySeverity()` → rate-limit check → async send → **re-throw**, so existing filters still produce the HTTP response. Sending never blocks the response. Nest's shutdown hook calls `Sentry.close(timeout)` so in-flight events flush instead of vanishing on every deploy restart.

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
| `scrubEvent` against a fixture carrying every known PII field — candidate email, name, answer text, `Authorization` header, cookies, request body | none survive; only opaque IDs remain |
| scrubber throws | event dropped, nothing sent |
| rate limiter, N+1 events in one window | overflow dropped from send, still logged |
| `classifySeverity` table test over (service × hasAttempt) | expected level per row |
| health: DB rejects / Redis rejects / both healthy | 503, 503, 200 |
| health 503 body | contains **no** dependency detail |
| health under repeated calls | dependencies checked once per cache window, not per request |
| exam-runtime with interceptor installed | `ServerBusyRetryAfterFilter` still returns 503 + `Retry-After` |
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
