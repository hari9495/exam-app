# Integrations 2a — Integration Foundation + Chat (Slack/Teams) — Design Spec

**Date:** 2026-08-19
**Status:** Approved design, ready for implementation plan
**Feature:** #2 of the commercialization set (Integrations), sub-slice **2a** of the integrations roadmap.
**Branch:** `feat/integrations-chat` off `origin/main` @ `f09a3570`.

---

## 1. Goal

Let an organization push high-signal recruiting events into their Slack and Microsoft Teams
channels, and — in doing so — lay down the **minimal reusable integration foundation** (a typed
per-org integration table, a single event fan-out point, a retrying delivery worker, and a
"Connected Apps" settings surface) that the later integration slices ride on:

- **2b** Zapier / enhanced multi-endpoint webhooks
- **2c** Calendar sync (Google/Outlook, first OAuth2 connector)
- **2d** Job distribution (LinkedIn/Indeed/Naukri/Google-for-Jobs)
- **2e** ATS/HRIS sync (Greenhouse/Lever/Workday)

The foundation is deliberately **thin** — proven by one real connector, not built speculatively.
No OAuth in 2a: the admin pastes an **incoming-webhook URL** (Slack Incoming Webhooks; Teams
Workflows / incoming webhook), matching the existing "paste a secret" pattern used for SMTP and
webhooks today.

## 2. Roadmap context (out of scope here, recorded for continuity)

The user wants the full integrations platform including job-posting sites. It is decomposed into
2a–2e (above); each is its own spec → plan → build. **Hard external constraint:** several later
providers (LinkedIn Talent, Indeed, Workday, Greenhouse) gate their APIs behind partner approval /
OAuth apps requiring business sign-up that the implementer cannot create or pay for; those
connectors will be built against user-supplied credentials/test apps. 2a has no such blocker.

## 3. What already exists (reused, not rebuilt)

- **Per-org encrypted secrets:** `OrgSecretsCryptoService` (`packages/shared/src/crypto/org-secrets-crypto.service.ts`),
  AES-256-GCM, `encrypt(str)/decrypt(str)`, key from env `ORG_SECRETS_ENCRYPTION_KEY`. Secrets are
  stored as encrypted columns today (SMTP password, AI key, webhook secret on `Organization`).
- **Outbound webhook pipeline:** `WebhooksService.enqueue(orgId, eventType, data)`
  (`apps/api/src/webhooks/webhooks.service.ts`, provided by `JobsModule`), writes a
  `WebhookDelivery` row, enqueues a BullMQ job (`attempts:3`, exponential backoff 30s); delivered by
  `apps/api/src/jobs/webhook-delivery.worker.service.ts` (HMAC-SHA256 signed, `fetch` POST). Only two
  event strings exist today: `invitation.created`, `attempt.settled`.
- **Exam-runtime → API internal path:** exam-runtime posts to `apps/api/src/internal/internal.controller.ts`
  (`internal-auth.guard.ts`, shared secret) which currently calls `WebhooksService.enqueue`. DTO
  hardcodes `@IsIn(['attempt.settled'])`.
- **BullMQ:** shared Redis connection `apps/api/src/jobs/redis-connection.ts` (`REDIS_CONNECTION`);
  queue/worker pattern in `apps/api/src/jobs/`.
- **Org-admin Integrations page:** `apps/web/app/(org-admin)/settings/integrations/page.tsx` already
  has SMTP / AI-key / Public-API / Webhooks collapsible sections; hooks in
  `apps/web/lib/hooks/useIntegrations.ts`; backend under `organizations.controller.ts`
  `integrations/*`. Nav entry at `apps/web/lib/super-admin-nav.ts` (and `BASE_NAV_ITEMS` in the
  layout).
- **AuditService**, **RLS** via `TenantPrismaService.forTenant`, super-admin bootstrap pattern in the
  webhook worker.

**Absent (new in 2a):** any OAuth2 client (SAML-only today); any chat/Slack/Teams path (email-only).

## 4. Data model

Two new Prisma models. Both are tenant-owned → RLS `FILTER` + `AFTER INSERT/UPDATE BLOCK`
predicates on `organization_id` in a **separate** migration (per the SQL-Server RLS rule). Additive
table creation migration first. `organization_id` is a plain `UniqueIdentifier` RLS-filtered column
(no FK to `organizations`, matching the billing-notices pattern).

### `OrgIntegration` → `@@map("org_integrations")`

| field | type | notes |
|---|---|---|
| `id` | `String @db.UniqueIdentifier @default(...)` | PK |
| `organizationId` | `String @map("organization_id") @db.UniqueIdentifier` | RLS |
| `type` | `String` | `'slack'` \| `'msteams'` (v1) |
| `label` | `String` | admin's channel name, e.g. `#recruiting` |
| `targetUrlEncrypted` | `String @map("target_url_encrypted") @db.NVarChar(Max)` | incoming-webhook URL, AES-256-GCM |
| `events` | `String @db.NVarChar(Max)` | JSON array of subscribed event-type strings |
| `status` | `String @default("active")` | `'active'` \| `'disabled'` |
| `lastDeliveryAt` | `DateTime? @map("last_delivery_at")` | last successful send |
| `lastError` | `String? @map("last_error")` | last failure summary (for UI) |
| `createdAt` | `DateTime @default(now()) @map("created_at")` | |
| `updatedAt` | `DateTime @updatedAt @map("updated_at")` | |

### `IntegrationDelivery` → `@@map("integration_deliveries")`

Mirrors `WebhookDelivery`; the per-attempt log powering the "recent activity" UI.

| field | type | notes |
|---|---|---|
| `id` | `String @db.UniqueIdentifier @default(...)` | PK |
| `organizationId` | `String @map("organization_id") @db.UniqueIdentifier` | RLS |
| `integrationId` | `String @map("integration_id") @db.UniqueIdentifier` | plain column (which channel) |
| `eventType` | `String @map("event_type")` | |
| `status` | `String @default("pending")` | `'pending'` \| `'delivered'` \| `'failed'` |
| `httpStatusCode` | `Int? @map("http_status_code")` | |
| `attemptCount` | `Int @default(0) @map("attempt_count")` | |
| `errorDetail` | `String? @map("error_detail") @db.NVarChar(Max)` | |
| `createdAt` | `DateTime @default(now()) @map("created_at")` | |
| `lastAttemptAt` | `DateTime? @map("last_attempt_at")` | |

## 5. Event catalog (8 events)

Shared constant (in `packages/shared`, so API + exam-runtime + web agree):

```
INTEGRATION_EVENT_TYPES = [
  'invitation.created',    // candidate invited to an exam        (exists as webhook)
  'attempt.submitted',     // candidate finished the exam         (NEW)
  'attempt.settled',       // results graded/ready                (exists as webhook)
  'integrity.flagged',     // proctoring / anti-cheat violation   (NEW)
  'interview.confirmed',   // candidate confirmed an interview slot
  'offer.accepted',        // candidate accepted / signed an offer
  'candidate.applied',     // new walk-in / public applicant
  'candidate.fit_scored',  // AI candidate-fit score ready
]
```

Each event's payload is a small, serializable object with the identifiers and human labels needed to
render a message and a deep link (see §8). Payloads never contain secrets.

## 6. Event fan-out — `IntegrationEventsService` (the foundation)

`IntegrationEventsService.emit(orgId, eventType, payload)`:

1. **Webhook (preserve today's behavior):** call the existing `WebhooksService.enqueue(orgId, eventType, payload)`
   so the existing single-endpoint signed webhook keeps working and now fires for the 6 new event
   types too (free benefit to 2b).
2. **Chat fan-out:** load `OrgIntegration`s for the org where `status='active'` and `events` (parsed
   JSON) includes `eventType`; enqueue one `integration-deliveries` job `{ integrationId, eventType, payload }`
   per match. No matches → no-op.

**Transaction discipline:** `emit` is invoked **post-commit, outside any `forTenant` write
transaction** (it does Redis enqueues + a read; keep it off the 5s interactive-tx budget). Each call
site calls `emit` after its domain write commits.

**Call-site wiring (8 points):**

| event | where to emit |
|---|---|
| `invitation.created` | `invitations.service.ts` + `walk-in.service.ts` (replace/augment the existing `webhooksService.enqueue` with `integrationEvents.emit`) |
| `attempt.submitted` | exam-runtime attempt submit → internal endpoint → `emit` |
| `attempt.settled` | exam-runtime settlement → internal endpoint → `emit` (currently webhook-only) |
| `integrity.flagged` | exam-runtime integrity/proctoring flag → internal endpoint → `emit` |
| `interview.confirmed` | `interviews.service.ts` `respondPublic` (confirm branch) |
| `offer.accepted` | offers accept path |
| `candidate.applied` | walk-in + public-apply paths |
| `candidate.fit_scored` | candidate-fit processor completion |

**Exam-runtime events:** broaden the internal endpoint from "dispatch webhook (attempt.settled only)"
to a generic `emitEvent(type, payload)` that calls `IntegrationEventsService.emit`. Update the
internal DTO `@IsIn([...])` to the three exam-runtime event types (`attempt.submitted`,
`attempt.settled`, `integrity.flagged`). Exam-runtime stays thin; the API owns fan-out. **Module DI:**
`IntegrationEventsService`'s module must be explicitly imported by every consumer module (JobsModule,
InternalModule, InterviewsModule, OffersModule, etc.) — do not rely on `@Global` alone (prod DI-boot
lesson).

## 7. Delivery worker — `integration-deliveries` queue

New BullMQ queue + `Worker` (mirror the webhook worker: `attempts:3`, exponential backoff 30s,
`REDIS_CONNECTION`). Per job:

1. Super-admin `forTenant` bootstrap → load the `OrgIntegration` (skip if missing/disabled), decrypt
   `targetUrlEncrypted`.
2. **SSRF guard (revalidate on send):** URL must be `https` and host must match the provider
   allowlist for its `type`:
   - `slack` → host `hooks.slack.com`
   - `msteams` → host ends with `.webhook.office.com` **or** `.logic.azure.com` (Workflows)
   Reject otherwise → mark delivery `failed` with a clear error, do not retry (config error).
3. Render the body via the pure formatter for `type` (§8).
4. `fetch` POST JSON. Success = 2xx (Slack returns `200 "ok"`; Teams `200/202`). Non-2xx → throw so
   BullMQ retries; on final attempt mark `IntegrationDelivery.status='failed'`, set
   `OrgIntegration.lastError`.
5. On success: `IntegrationDelivery.status='delivered'` + `httpStatusCode`, set
   `OrgIntegration.lastDeliveryAt`, clear `lastError`.

A **test message** (§9 `POST …/test`) enqueues a normal job with a synthetic payload flagged
`isTest` so the admin sees it flow through the same path.

## 8. Message formatting

Pure, unit-testable. A shared summariser then per-provider render:

```
buildEventSummary(eventType, payload) -> { title: string, fields: {label,value}[], url: string }
```

`url` = `<APP_BASE_URL>` + the console deep link for the entity (e.g. `/candidates/:id`,
`/exams/:id/results`, `/interviews/:id`). `APP_BASE_URL` from config/env.

- **Slack:** `{ text: <title fallback>, blocks: [ header, section(fields), actions("View in console" → url) ] }`.
- **Teams:** Adaptive Card (`type: message` + `attachments[0].content` adaptive card) with a title
  `TextBlock`, a `FactSet` of fields, and an `Action.OpenUrl` → url.

**Injection safety:** untrusted values (candidate names, exam titles) are placed only in
JSON string fields (Slack `text`/field `value`, Teams `TextBlock.text`/`Fact.value`) — never
interpolated into `mrkdwn` control syntax or block structure. Values are passed as data, JSON-encoded
by `JSON.stringify`; no manual string concatenation into markup.

## 9. API (org-admin, under existing `/organizations/integrations`)

Reuse the guard/permission that protects today's integrations controller (org-admin scope). All via
`forTenant`/RLS. `AuditService` on mutations.

| method | path | body / notes |
|---|---|---|
| `GET` | `…/connected-apps` | list: `{id,type,label,events,status,lastDeliveryAt,lastError, urlHint}` — **never** the URL secret; `urlHint` is a masked tail (e.g. `…/T0000/B0000/****`) |
| `POST` | `…/connected-apps` | `{type,label,targetUrl,events[]}` → validate `type∈{slack,msteams}`, `events⊆catalog`, **URL host allowlist** (§7.2), encrypt URL, audit `integration.connected` |
| `PATCH` | `…/connected-apps/:id` | update `label`/`events`/`status` (and `targetUrl` optional, re-validated + re-encrypted); audit `integration.updated` |
| `DELETE` | `…/connected-apps/:id` | remove; audit `integration.removed` |
| `POST` | `…/connected-apps/:id/test` | enqueue a synthetic test delivery; returns `{queued:true}` |
| `GET` | `…/connected-apps/:id/deliveries` | recent `IntegrationDelivery` rows for that channel |

Validation rejects a non-allowlisted URL host **at save time** (defence in depth with the worker
check), so a bad URL never persists.

## 10. Web UI

New **"Connected Apps (Slack & Teams)"** `CollapsibleSection` on
`settings/integrations/page.tsx`:

- **List:** each channel shows type badge (Slack/Teams), `label`, subscribed-event chips, a
  status toggle (active/disabled), last delivery time / last error, and **Test** / **Edit** /
  **Remove** actions.
- **Add / Edit modal:** choose Slack or Teams → paste webhook URL (with an inline "how to get this
  URL" helper link per provider) → name it → checkbox list of the 8 events (labelled in plain
  English) → save.
- **Deliveries:** expanding a channel shows its recent `IntegrationDelivery` rows (event, time,
  status, http code).

Hooks mirror `useIntegrations.ts`: `useConnectedApps`, `useCreateConnectedApp`,
`useUpdateConnectedApp`, `useDeleteConnectedApp`, `useTestConnectedApp`, `useConnectedAppDeliveries`.
Reuse the existing `CollapsibleSection` + design system. No new nav entry (lives on the existing
Integrations page).

## 11. Security

- **Secrets at rest:** webhook URLs encrypted (`OrgSecretsCryptoService`); never returned to the
  client (masked `urlHint` only).
- **SSRF:** provider host allowlist enforced at save **and** send; `https`-only; no redirects
  followed to off-allowlist hosts.
- **Injection:** message values are data-only, JSON-encoded (§8).
- **Tenant isolation:** RLS on both tables; super-admin bypass confined to the worker bootstrap.
- **RBAC:** managed by org-admin (existing integrations permission); recruiters/panelists cannot
  configure.

## 12. Testing

- **Pure formatter** unit tests: Slack + Teams body shape for each of the 8 events; injection-safety
  (a candidate name with markup characters stays inert).
- **`IntegrationEventsService`**: only matching active integrations are enqueued; event-filter
  correctness; webhook path still fires; runs outside the write tx.
- **Delivery worker**: success path, retry on 5xx, final-failure marking, **SSRF reject** (off-allowlist
  host → failed, no retry), disabled/missing integration skip.
- **API**: validation (bad type/event/URL host), secret never leaked in `GET`, audit emitted, RLS
  scoping, test-message enqueue.
- **Web**: hook fetch/mutation tests; add/edit modal validation; list render.

## 13. Explicitly out of scope (YAGNI / later slices)

- OAuth Slack app (bot token, channel picker) — v1 is paste-a-URL, no OAuth. (Calendar slice 2c
  introduces the OAuth2 stack.)
- Per-event message templating / customization.
- Digest/batching, quiet hours, rate shaping.
- Providers beyond Slack/Teams (Discord, Google Chat).
- Multi-endpoint raw webhooks + Zapier app — that is slice **2b**, which reuses this foundation.
- **Billing seam (noted, not built):** chat isn't a metered cost driver, so no quota gate. Plan-gating
  "integrations are a paid feature" is billing's concern; when desired, it hooks the existing
  quota/plan machinery, not this spec.
