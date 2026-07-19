# Public API + Webhooks — Design

## Problem

Competitor research identified integration with external ATS platforms (Greenhouse, Lever) as a priority gap: customers today can only interact with this platform through its built-in recruiter/panel/org-admin consoles. There is no way for an org to programmatically pull candidate/exam/result data into their own tooling, or to be notified in real time when something happens (a candidate is invited, an attempt is settled) without polling.

This is the second feature in the competitor-research-driven roadmap, following Integrity & Anti-Cheating (Feature #6486, shipped) and the Candidate UX Pack (shipped). It is explicitly scoped as the *prerequisite* for future named ATS integrations, not those integrations themselves — this spec ships a general-purpose public API and webhook mechanism; a Greenhouse- or Lever-specific connector is out of scope and would be a later feature built on top of this one.

## Scope

Two tightly-coupled pieces, both owned by `apps/api` (no new service):

1. **A versioned, read-only public REST API**, authenticated by a per-org API key, covering candidates, exams, invitations, and results.
2. **Webhooks** for two events — `invitation.created` and `attempt.settled` — with HMAC-signed delivery, retry via the existing BullMQ infrastructure, and a delivery log visible in org-admin.

## Architecture

Both pieces live entirely inside `apps/api` as new modules, reusing existing infrastructure rather than introducing a new service:

- **Tenant scoping**: every public-API query and webhook dispatch goes through the existing `TenantPrismaService.forTenant()` (RLS via `sp_set_session_context`), exactly as every other `apps/api` query does today. An API key resolves to an `organizationId`, which becomes the tenant context — there is no new authorization model to build beyond that resolution step.
- **Secrets**: the API key and the webhook signing secret both live as new columns on `Organization`, following the exact pattern already established for `smtpPasswordEncrypted`/`aiApiKeyEncrypted` (`apps/api/prisma/schema.prisma`). The webhook secret is reversibly encrypted via the existing `OrgSecretsCryptoService` (`packages/shared/src/crypto/org-secrets-crypto.service.ts`), because `apps/api` must decrypt it on every delivery to compute the signature. The API key is different: it is only ever *verified*, never sent anywhere, so it is stored as a one-way SHA-256 hash — the standard pattern for bearer API keys (GitHub PATs, Stripe restricted keys), and simpler than reversible encryption for this case.
- **Delivery queue**: a new BullMQ queue (`webhook-deliveries`), consumed by a new `WebhookDeliveryWorkerService` structurally parallel to the existing `AiJobsWorkerService` (`apps/api/src/jobs/ai-jobs.worker.service.ts`) — same dequeue-dispatch-update-row shape, same reliance on BullMQ's built-in retry/backoff rather than hand-rolled retry logic.
- **Cross-service trigger**: `attempt.settled` fires in `apps/exam-runtime` (`AttemptSettlementService.finalize()`), a separate service from `apps/api`. `apps/api` has only ever been the *caller* of internal routes before (into exam-runtime's `InternalController`, guarded by exam-runtime's `InternalAuthGuard`) — this is the first case of the reverse direction. A new internal-only endpoint on `apps/api` (`POST /internal/webhooks/dispatch`) is guarded by a new `InternalAuthGuard` on `apps/api`'s side, built as an exact mirror of exam-runtime's existing one: same `X-Internal-Secret` header convention, same `INTERNAL_SERVICE_SECRET` env var (already exists, already shared between the two services), same `timingSafeEqual` comparison (`apps/exam-runtime/src/internal/internal-auth.guard.ts`).

## 1. API keys

New nullable columns on `Organization`: `apiKeyHash String?`, `apiKeyPrefix String?`, `apiKeyCreatedAt DateTime?`. No new table — "one active key per org, revoke + regenerate" maps directly onto overwriting these three columns; there is no history to preserve.

Key format: `pk_live_<64 hex chars>` (32 random bytes via `crypto.randomBytes`). The `pk_live_` prefix is stored in `apiKeyPrefix` and shown in the UI so an org can recognize which key is active without ever seeing the secret again; the full value is shown exactly once, at generation time, and is never retrievable after that (the API only ever has the hash). Regenerating overwrites all three columns, immediately invalidating the previous key — no grace period. Revoking clears all three columns to `null`.

A new `ApiKeyAuthGuard` (`apps/api/src/public-api/api-key-auth.guard.ts`) reads `Authorization: Bearer pk_live_...`, hashes the provided value, and looks up the `Organization` row where `apiKeyHash` matches. This lookup has no tenant context yet — the organization is exactly what it's trying to resolve — so it uses the same super-admin-bypass bootstrap pattern already established for resolving tenant from an opaque credential elsewhere in the codebase (e.g. `AttemptService.resolveContext()` in exam-runtime, which calls `tenantPrisma.forTenant({ organizationId: null, isSuperAdmin: true }, ...)` to resolve a candidate's invitation/org from their JWT before any tenant-scoped query can run). Every subsequent query in the request then uses the resolved `organizationId` for normal tenant-scoped access. No match (missing header, wrong key, or a revoked key with `apiKeyHash: null`) → 401. On success, it attaches `{ organizationId }` to the request the same way `JwtAuthGuard` attaches `req.user` — public-API controllers read this via a new `@CurrentApiKeyOrg()` decorator, parallel to the existing `@CurrentTenant()`. Because the key implies full read access to everything in scope (no roles, no per-key scopes — an explicit v1 simplification), `PermissionsGuard` is not applied to these routes at all.

## 2. Public API endpoints

Mounted under `/api/v1/public/*` — a distinct sub-path under the existing global `api/v1` prefix (`apps/api/src/main.ts`), so staff-facing and public routes are unambiguous in logs, rate-limit tiers, and API-key-vs-JWT guard wiring, without introducing a second global prefix.

All routes read-only, all org-scoped via `ApiKeyAuthGuard` + `TenantPrismaService.forTenant()`:

- `GET /public/candidates` — paginated list (`id`, `name`, `email`, `createdAt`)
- `GET /public/candidates/:id` — single candidate
- `GET /public/exams` — paginated list (`id`, `title`, `status`, `durationMinutes`, `passCriteriaPercent`, `createdAt`) — metadata only
- `GET /public/exams/:id` — single exam, same shape. **No question or option content is ever included** — the public API must not become a channel for extracting an org's question bank.
- `GET /public/invitations` — paginated list, filterable by `examId`, `candidateId`, `status` query params (`id`, `examId`, `candidateId`, `status`, `invitedAt`, `expiresAt`)
- `GET /public/exams/:id/results` — paginated list of settled results for that exam (`candidateId`, `candidateName`, `status`, `score`, `maxScore`, `percentage`, `passFail`, `submittedAt`). Proctoring and integrity data are deliberately excluded — those are staff-only signals, not for external consumption.

Pagination: `page` (default 1) and `pageSize` (default 50, max 200) query params on every list endpoint, response envelope `{ data: [...], page, pageSize, total }`.

Rate limiting: a new, separate throttler tier (reusing the existing `@nestjs/throttler` + Redis-backed `ThrottlerStorageRedisService` already wired in `apps/api`) keyed on the resolved `organizationId` rather than IP — a per-org API must not be limited by shared egress infrastructure on the caller's side. Default: 60 requests/minute per org. Exceeding it returns 429 with a `Retry-After` header. Unlike the console's existing `FailOpenThrottlerGuard` (which fails open on a Redis outage, appropriate for not locking staff out of their own console), the public-API tier fails **closed** on a Redis outage — safer default for an external-facing surface, at the cost of the public API being briefly unavailable if Redis is down (acceptable, since the console itself would also be degraded at that point).

## 3. Webhooks

New model `WebhookDelivery`:

```prisma
model WebhookDelivery {
  id              String    @id @default(uuid()) @db.UniqueIdentifier
  organizationId  String    @map("organization_id") @db.UniqueIdentifier
  organization    Organization @relation(fields: [organizationId], references: [id])
  eventType       String    @map("event_type")
  payloadJson     String    @map("payload_json") @db.NVarChar(Max)
  status          String    @default("pending")
  httpStatusCode  Int?      @map("http_status_code")
  attemptCount    Int       @default(0) @map("attempt_count")
  lastAttemptAt   DateTime? @map("last_attempt_at")
  createdAt       DateTime  @default(now()) @map("created_at")

  @@index([organizationId, createdAt])
  @@map("webhook_deliveries")
}
```

`status` is one of `pending` / `delivered` / `failed`. Two new columns on `Organization`: `webhookUrl String?` and `webhookSecretEncrypted String?` (via `OrgSecretsCryptoService`, same AES-256-GCM scheme as the SMTP/AI-key columns). Generating/regenerating the webhook secret shows the plaintext value once, exactly like the API key.

**Emission points:**
- `invitation.created` — `InvitationsService.bulkInvite()` (`apps/api/src/invitations/invitations.service.ts`), immediately after the existing `audit.record({ action: 'invitation.created', ... })` call, in the same transaction. If `organization.webhookUrl` is null, this is a no-op — no row is created, no job enqueued.
- `attempt.settled` — `AttemptSettlementService.finalize()` (`apps/exam-runtime/src/grading/attempt-settlement.service.ts`), immediately after its existing `audit.record({ action: 'attempt.settled', ... })` call. exam-runtime makes an HTTP call to `apps/api`'s new `POST /internal/webhooks/dispatch` (guarded by the mirrored `InternalAuthGuard` described above), passing `{ organizationId, eventType: 'attempt.settled', data: {...} }`. This call is fire-and-forget from exam-runtime's perspective (matching the existing precedent in `AttemptSettlementService.finalize()`, where the post-settlement analysis kickoffs are already fire-and-forget `void (async () => {...})()` blocks) — a webhook-dispatch failure must never block or fail the settlement itself.

Both emission points funnel into a single `WebhooksService.enqueue(organizationId, eventType, data)` method: creates a `WebhookDelivery` row (`status: 'pending'`) and adds a job to the `webhook-deliveries` BullMQ queue carrying the delivery's `id`.

**Delivery worker** (`WebhookDeliveryWorkerService`, parallel to `AiJobsWorkerService`): on each job, loads the `WebhookDelivery` row and the org's `webhookUrl`/decrypted `webhookSecretEncrypted`, builds the payload envelope:

```json
{ "id": "<delivery id>", "type": "attempt.settled", "createdAt": "<ISO 8601>", "data": { ... } }
```

POSTs the JSON body to `webhookUrl` with header `X-Webhook-Signature: <hex HMAC-SHA256 of the raw body, using the decrypted secret>` — the same signing convention as Stripe/GitHub, so existing webhook-verification libraries on the receiving end work unmodified. Updates the `WebhookDelivery` row's `status`/`httpStatusCode`/`attemptCount`/`lastAttemptAt` after every attempt. Retries are BullMQ job options, not hand-rolled: 3 attempts, exponential backoff starting at 30 seconds. After the final failed attempt, `status` stays `failed` permanently — no automatic redelivery in v1.

## 4. Org-admin UI

Extends the existing Integrations settings page (`apps/web/app/(org-admin)/settings/integrations/page.tsx`) with a new "Public API" section, following that page's established pattern:

- **API key**: shows `apiKeyPrefix` + "created \<date\>" when a key exists, or "No API key generated" when not. "Generate" (or "Regenerate" if one exists) button reveals the full key value once, in a copy-to-clipboard field with a persistent "this won't be shown again" warning, matching how the existing SMTP/AI-key secrets are entered (write-only from the UI's perspective once saved). "Revoke" clears it immediately.
- **Webhook**: a URL input + save button. Once a URL is saved, a "Generate signing secret" (or "Regenerate") button reveals the secret once, same UX as the API key.
- **Delivery log**: a read-only table below, the last 50 `WebhookDelivery` rows for the org (event type, timestamp, status, HTTP status code), newest first. No pagination, no manual redeliver action — a v1 debugging aid, not a full operations console.

## 5. API reference documentation

A plain markdown reference doc (`docs/public-api.md`) is a required deliverable of this feature, not optional polish — without it, no external integrator (or internal team member) can use the API at all. Written alongside the implementation, one section per piece as it's built, covering:

- **Authentication**: how to generate a key in org-admin, the `Authorization: Bearer pk_live_...` header format, what a 401 means.
- **Every endpoint**: method, path, query params, response shape, one worked example (request + response) each, for all five `GET /public/*` routes.
- **Pagination**: the `page`/`pageSize`/`total` envelope, defaults and max.
- **Rate limits**: the 60 req/min per-org ceiling, the 429 + `Retry-After` behavior.
- **Webhooks**: how to configure a URL + generate a signing secret in org-admin, the payload envelope shape for each of the two event types with a real example body, and a worked signature-verification example (pseudocode or a short Node snippet computing HMAC-SHA256 over the raw body and comparing to `X-Webhook-Signature`) — this is the one piece that's actively unsafe to leave to guesswork, since an integrator who verifies signatures wrong either rejects everything or (worse) accepts unsigned requests.

This is intentionally lightweight — a single hand-written markdown file, not generated tooling. Auto-generated interactive documentation (OpenAPI/Swagger UI, a hosted docs site) stays out of scope per below; this reference doc is what makes the feature usable in the meantime, and remains useful as the source content for that tooling later.

## Error handling

- Missing/invalid/revoked API key on a public-API request → 401, no further detail (don't confirm/deny whether a key format was merely wrong vs a real key was revoked, to avoid aiding credential-guessing).
- Public-API rate limit exceeded → 429 with `Retry-After`.
- `attempt.settled` webhook-dispatch call from exam-runtime to apps/api fails (network error, apps/api down, wrong internal secret) → logged and swallowed in exam-runtime, exactly like the existing post-settlement analysis kickoffs; settlement itself always succeeds regardless.
- No `webhookUrl` configured for an org → webhook events for that org are silently not enqueued; this is expected steady-state for every org that hasn't opted in, not an error.
- Webhook delivery fails after 3 attempts → `WebhookDelivery.status: 'failed'` permanently, visible in the org-admin log. No alerting in v1 (an org must check the log to notice; automated alerting is a reasonable fast-follow, not blocking this spec).

## Testing

- **Unit**: `ApiKeyAuthGuard` (valid key, missing header, wrong key, revoked key all correctly rejected/accepted); each public-API endpoint's org-scoping (a key belonging to org A must never be able to see org B's candidates/exams/invitations/results, even by guessing IDs); HMAC signature computation correctness (known input/output vector); `WebhookDeliveryWorkerService` success path (200 response → `status: 'delivered'`) and failure path (non-2xx or network error → `status` stays `pending` until retries exhaust, then `failed`); the new `InternalAuthGuard` on `apps/api` (valid/missing/wrong `X-Internal-Secret`).
- **E2E**: generate an API key via the org-admin UI, call each public-API endpoint with it, confirm correctly-scoped data and a 401 with no key; configure a webhook URL + secret, invite a candidate, confirm a `WebhookDelivery` row is created and a delivery attempt fires against a mock HTTP endpoint with a verifiably-correct signature; separately, settle an attempt in exam-runtime and confirm the same for `attempt.settled` (proving the cross-service internal-endpoint path works end to end, not just the same-service `invitation.created` path).

## Out of scope

- Write endpoints on the public API (creating candidates/invitations externally) — v1 is read-only by explicit decision.
- Per-key scopes or multiple keys per org — v1 is one key, full read access.
- OAuth2 / client-credentials flow — API keys only.
- A manual "redeliver" button for failed webhook deliveries.
- Webhook event types beyond `invitation.created` and `attempt.settled`.
- A "test webhook" button in org-admin (send a synthetic event on demand).
- Auto-generated/interactive API documentation (OpenAPI spec generation, Swagger UI, a hosted docs site) — a natural fast-follow once the surface is stable. The hand-written `docs/public-api.md` reference described above is in scope and required; this bullet only excludes the generated-tooling layer on top of it.
- Automated alerting on repeated webhook delivery failures.
- Named ATS connectors (Greenhouse, Lever) — this spec is the general-purpose prerequisite; a specific connector is a later feature.
