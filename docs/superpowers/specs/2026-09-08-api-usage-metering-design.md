# Per-Key API Usage Metering (Zoho #25) — Design

**Date:** 2026-09-08
**Status:** Approved (design), pending spec review
**Zoho adopt:** #25 (Developer Space → API usage). Public-API module + per-org API keys are already BUILT; throttling exists. This closes the **usage metering + reporting** gap.
**Branch:** `feat/api-usage-metering` (off origin/main @ `08ae024e`)

## Goal

Record every authenticated public-API call and surface an org-admin usage report next to the API key. There is one API key per org today, so "per-key" == per-org. Additive and behavior-preserving: metering is a side effect that can never fail or slow a real API request.

## Scope

**In:** a new tenant table `ApiUsageDaily` (daily per-endpoint aggregate) + RLS; a write path that increments it (processed requests via an interceptor on the public-API controllers, throttled 429s via the throttler guard); a reporting endpoint `GET /organizations/api-usage`; a usage section in the existing Integrations settings web page; a scheduled 365-day retention purge.

**Out (deferred / not this slice):**
- Full per-request request log (timestamp/latency/status per call) — the chosen model is daily aggregate, not audit-grade per-request.
- Multiple API keys per org / per-key breakdown beyond the single org key (the model is per-org; if multi-key is added later, `ApiUsageDaily` can gain a `keyId` column).
- Billing/quota enforcement off these numbers (reporting only; throttling is unchanged and remains the enforcement mechanism).
- Real-time/streaming usage; the report is daily-granular.

## Decisions (rulings baked in)

1. **Granularity:** daily per-endpoint aggregate. One row per `(organizationId, day, endpoint)` with two counters: `requestCount` (authenticated, non-throttled requests that reached a handler) and `throttledCount` (429 rate-limit rejections). Chosen over a per-request log (write volume + retention/PII) and over a daily-total-only row (no endpoint breakdown).
2. **What is counted:**
   - `requestCount` — any request that passed `ApiKeyAuthGuard` **and** `PublicApiThrottlerGuard`, i.e. an authenticated request that reached the handler. Counted whether the handler returns 2xx or throws (the caller consumed a request either way).
   - `throttledCount` — a request rejected by the rate limiter (429). The org is already known at that point (`ApiKeyAuthGuard` ran first and set `request.apiKeyOrg`).
   - Unauthenticated requests (401, bad/missing key) are **not** counted — there is no known org to attribute them to.
3. **Two write spots (forced by Nest's lifecycle):** guards run before interceptors, and the throttler is a guard that throws 429 before any interceptor's pre-handler phase. So an interceptor cannot observe a throttle. Therefore:
   - processed requests are counted in an **interceptor** on the public-API controllers, and
   - throttles are counted by overriding **`PublicApiThrottlerGuard.throwThrottlingException()`**.
4. **Metering must never break or slow the API:** every record write is fire-and-forget with swallowed errors (logged, not thrown). It runs through `TenantPrismaService.forTenant` (tenant table) using the resolved org context.
5. **Endpoint label** = `${method} ${route-path-template}` (e.g. `GET /public/candidates`, `GET /public/exams/:id`) — the matched route template, never interpolated with real ids, so cardinality stays bounded.
6. **Reporting** windows are 30 and 90 days; daily aggregate rows are retained ~365 days then purged by a scheduled job (rows are tiny; mirrors the recycle-bin purge's all-org/super-admin bypass).
7. **Gating:** the report endpoint is per-method `@RequirePermissions('org:manage_settings')` — the exact permission that already gates API-key create/revoke.
8. New tenant table → paired `_rls` migration; **no seed** (reuses an existing permission).

## Architecture

### Schema (additive)

```prisma
model ApiUsageDaily {
  id             String   @id @default(uuid()) @db.UniqueIdentifier
  organizationId String   @map("organization_id") @db.UniqueIdentifier
  day            DateTime @map("day") @db.Date
  endpoint       String   @map("endpoint")
  requestCount   Int      @default(0) @map("request_count")
  throttledCount Int      @default(0) @map("throttled_count")
  createdAt      DateTime @default(now()) @map("created_at")
  updatedAt      DateTime @updatedAt @map("updated_at")

  @@unique([organizationId, day, endpoint])
  @@index([organizationId, day])
  @@map("api_usage_daily")
}
```
Migration `20260908210000_api_usage_daily` (table) + `20260908210001_api_usage_daily_rls` (tenant policy). The `_rls` migration mirrors an existing new-tenant-table policy (e.g. `org_sender_addresses_rls`): add the table to the tenant security policy predicate. No FILTER swap (brand-new table) → safe to run anytime. No seed.

### API — write path

`ApiUsageService.record(context, endpoint, kind: 'request' | 'throttled')`:
- Computes `day` = today at UTC-midnight.
- Upserts `(organizationId, day, endpoint)`: on create, sets the matching counter to 1; on update, `{ [counter]: { increment: 1 } }`.
- Runs inside `forTenant(context, …)`; the whole call is fire-and-forget: the caller does `void this.record(...).catch(err => logger.warn(...))` and never awaits it in the response path.

`ApiUsageInterceptor` (applied to `PublicCandidatesController`, `PublicExamsController`, `PublicInvitationsController`):
- Reads `request.apiKeyOrg.organizationId` (set by `ApiKeyAuthGuard`) + the endpoint label.
- Uses RxJS `tap`/`finalize` so it records on both success and handler error (both are "processed" requests). Records `kind: 'request'`.
- If `apiKeyOrg` is somehow absent, records nothing (defensive).

`PublicApiThrottlerGuard.throwThrottlingException(context)` override:
- Before throwing the standard 429, reads `request.apiKeyOrg.organizationId` + endpoint label and fires `record(kind: 'throttled')` (fire-and-forget). Then `super.throwThrottlingException(context)`.

Endpoint label helper: from the Express request, `${req.method} ${req.route?.path ?? 'unknown'}`, prefixed with the controller base if `route.path` is relative — verified against how the 3 controllers declare their paths during implementation; the label must be the stable template, not the concrete URL.

### API — reporting

`ApiUsageService.report(context, window: 30 | 90)` — one service owns both `record()` and `report()` so all usage logic is cohesive; it's injected into `OrganizationsController` for the route (which lives under `/organizations` alongside the existing api-key routes):
- Reads `ApiUsageDaily` for the org where `day >= today - window`, via `forTenant`.
- Aggregates: `totals { requests, throttled }`, `byEndpoint [{ endpoint, requests, throttled }]` (desc by requests), `byDay [{ day, requests, throttled }]` (ascending; v1 returns only days with rows — no zero-fill).
- Controller `GET /organizations/api-usage?window=30|90` on `OrganizationsController` (default 30; validate the enum), per-method `@RequirePermissions('org:manage_settings')`, `@CurrentTenant()`, delegating to `ApiUsageService.report`.

### Retention (scheduled)

A daily scheduled task (`@Cron`, mirroring the recycle-bin purge job) deletes `ApiUsageDaily` rows with `day < today - 365`. Runs system-wide with the all-org/super-admin bypass the recycle-bin purge already uses (a scheduled job has no request tenant context). Best-effort; logged.

### Web

- Extend the Integrations settings page `apps/web/app/v2/(org-admin)/settings/integrations/page.tsx` (where the API key is shown): a new "API usage" card.
- Hook `useApiUsage(window)` (GET, authed api-client) with a 30/90-day toggle.
- Render: the two totals (requests, throttled), a per-endpoint table (endpoint · requests · throttled), and a simple daily bar/sparkline of `byDay`. Reuse existing table + chart primitives (deep imports, no ui-v2 barrel; no `@exam-platform/shared` value import).
- When the org has no API key configured / no usage yet, show an empty state ("No API usage recorded yet").

## Data flow

1. A client calls `GET /public/candidates` with `Authorization: Bearer <key>`.
2. `ApiKeyAuthGuard` resolves the org → `request.apiKeyOrg`. `PublicApiThrottlerGuard` checks the limit.
3a. Within limit → handler runs → `ApiUsageInterceptor` records `request` (+1 `requestCount` for `(org, today, "GET /public/candidates")`).
3b. Over limit → `PublicApiThrottlerGuard.throwThrottlingException` records `throttled` (+1 `throttledCount`) then throws 429.
4. Org admin opens Integrations settings → `GET /organizations/api-usage?window=30` → sees totals, per-endpoint breakdown, daily chart.
5. Nightly, rows older than 365 days are purged.

## Error handling

- A metering write failure (DB down, RLS misconfig, etc.) is caught and logged; the API request proceeds/returns unaffected. **Never** let `record` reject into the request path.
- Bad `window` value → 400 (validated to 30 | 90; default 30).
- Report reads are tenant-scoped via `forTenant` — an org only ever sees its own rows (RLS + query scoping).

## Testing

- **Schema:** table + unique `(org, day, endpoint)` + `_rls`; counters default 0.
- **record():** create path sets the right counter to 1; second call increments; distinct endpoints/days are distinct rows; a throwing `forTenant` is swallowed (no rejection escapes).
- **Interceptor:** records `request` on handler success AND on handler error; uses the org from `request.apiKeyOrg`; does nothing when absent; endpoint label is the route template, not the concrete URL.
- **Throttler override:** on 429, `throttledCount` is incremented and the 429 is still thrown (behavior-preserving); no double-count with the interceptor (interceptor never runs on a throttle).
- **Reporting:** totals + byEndpoint + byDay correct over the window; only the org's own rows; window validation; gated `org:manage_settings` (Reflector assertion); tenant-scoped.
- **Retention:** deletes rows older than 365 days, keeps newer; all-org bypass.
- **Web:** usage card renders totals/table/chart from the hook; 30/90 toggle refetches; empty state when no usage.
- Full api + web jest green; tsc clean; packages/shared jest if shared code is touched (not expected).

## Deploy notes

- Two additive migrations (table + `_rls`), no seed. The `_rls` migration adds a policy to a brand-new empty table (no FILTER swap) → safe to run anytime, no maintenance window. Behavior-preserving: existing public-API behavior is unchanged; metering is an additive side effect. Ships with any api build; web needs any web build. (Prod deploy is planned later, once all development is complete — see the standing decision.)
