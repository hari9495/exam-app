# Pluggable SMS Providers (extends Zoho #16) — Design

**Status:** approved in chat 2026-09-09. Ready for implementation planning.

## Goal

Generalize the candidate SMS channel from Twilio-only to a pluggable-provider model:
an org picks its SMS provider and supplies that provider's credentials. Ship two
adapters — **Twilio** (the existing one, refactored behind the abstraction) and a
generic **configurable-HTTP** adapter that covers virtually any REST SMS gateway.
Everything stays inert-but-honest without configuration, and all secrets stay
encrypted at rest and are never returned to any client.

## Why

The candidate SMS channel ([[project_candidate_sms]], Zoho #16) hard-codes Twilio: the
org config columns are Twilio's exact credential shape and `SmsService` has one Twilio
transport. Customers use different SMS providers. This slice makes the provider a
per-org choice without a rewrite, using the `SmsService` seam the #16 design already
established.

## Dependency & base branch

**This feature builds on the UNMERGED `feat/candidate-sms` branch** (`@ 69ffba71`) — it
reshapes code that exists only there. It branches off `feat/candidate-sms`, and the two
merge in order (candidate-sms first, then this). Because candidate-sms is not deployed,
this slice can cleanly DROP the Twilio-shaped columns rather than data-migrate them.

## Design decisions (settled in brainstorming)

1. **Config storage:** a `smsProvider` selector + a single encrypted JSON blob
   (`smsConfigEncrypted`) holding the selected provider's fields — no per-provider column
   explosion. Replaces the three Twilio columns.
2. **Adapters shipped:** Twilio (refactored) + one generic configurable-HTTP adapter.
   No other named vendors (none can be live-tested here; the HTTP adapter is the escape
   hatch for any REST gateway).
3. **Per-org, single provider** (one active provider per org; multi-provider-per-org is
   YAGNI).

## Reference (what exists on the candidate-sms branch, being reshaped)

- `apps/api/src/sms/sms.service.ts` — `SmsService.send({to,body,organizationId})` reads
  the 4 Twilio columns, has the deliverable gate (`SMS_NOT_SENT` refuse+log, never
  fabricate), decrypts `smsAuthTokenEncrypted`, calls `sendTwilioSms`, logs
  `SMS_SEND_FAILED` on `!ok`.
- `apps/api/src/sms/twilio-transport.ts` — `sendTwilioSms({accountSid,authToken,from,to,body}, fetchImpl=fetch) → {ok, status?}`. **KEPT** — the Twilio adapter calls it.
- `apps/api/src/organizations/organizations.service.ts` + `.controller.ts` — `getSmsConfig`
  / `putSmsConfig` (encrypt token on write, GET returns `{smsEnabled, smsAccountSid,
  smsFromNumber, configured}`, never the token; blank token keeps existing) + DTO
  `update-sms-config.dto.ts`.
- `apps/web` — `SmsConfigSection` (Integrations card: enabled, SID, write-only token,
  from).
- `OrgSecretsCryptoService.encrypt/decrypt` — used for the blob.

## Schema reshape

Migration `20260909280000_sms_providers` (on top of candidate-sms `270000/270001`):
- **DROP** `organizations.sms_account_sid`, `sms_auth_token_encrypted`, `sms_from_number`
  (safe — candidate-sms undeployed; no data).
- **ADD** `smsProvider String @default("twilio") @map("sms_provider")` and
  `smsConfigEncrypted String? @map("sms_config_encrypted")` (NVARCHAR(Max); encrypted JSON).
- `smsEnabled` stays. Additive/drop on the existing `organizations` table → **no `_rls`**.
  No seed. Numbered after `270000/1`.

Prisma model: remove the three Twilio fields, add the two new ones.

## Provider abstraction

New `apps/api/src/sms/providers/`:

```ts
export interface SmsConfigField {
  key: string;
  label: string;
  secret: boolean;     // secret fields are never returned by GET; blank-on-PUT keeps existing
  required: boolean;
  placeholder?: string;
}
export interface SmsSendArgs { to: string; body: string }
export interface SmsProviderAdapter {
  id: string;                              // 'twilio' | 'http'
  label: string;                           // 'Twilio' | 'Generic HTTP'
  configFields: SmsConfigField[];
  validateConfig(config: Record<string, unknown>): void;  // throw BadRequestException on invalid
  send(config: Record<string, unknown>, args: SmsSendArgs, fetchImpl?: typeof fetch): Promise<{ ok: boolean; status?: number }>;
}
```

- **`twilio-provider.ts`** — `id:'twilio'`, fields `accountSid`(req), `authToken`(req,
  secret), `from`(req). `validateConfig` requires the three. `send` delegates to the
  existing `sendTwilioSms`.
- **`http-provider.ts`** — `id:'http'`, fields `url`(req), `method`(optional, default POST),
  `authHeader`(secret, optional — sent as the `Authorization` header), `contentType`
  (optional, default `application/json`), `bodyTemplate`(req — a string with `{{to}}` and
  `{{body}}` placeholders). `send`: substitute placeholders in `bodyTemplate` (and any
  `{{to}}`/`{{body}}` in the URL), `fetch(url, { method, headers, body })`, success = 2xx;
  never throws (catch → `{ok:false}`). **SSRF guard in `validateConfig`:** the `url` must
  parse, be `https:`, and its host must not be a loopback/private/link-local address
  (reject `localhost`, `127.0.0.0/8`, `10/8`, `172.16/12`, `192.168/16`, `169.254/16`,
  `::1`, unique-local `fc00::/7`) — an org admin sets this, but the server must not be
  coerced into POSTing candidate PII to an internal address.
- **`sms-providers.ts`** — `SMS_PROVIDERS: Record<string, SmsProviderAdapter>` registry +
  `getSmsProvider(id): SmsProviderAdapter | undefined`.

Placeholder substitution must be injection-safe for the body: values are inserted into a
JSON/string template — document that `bodyTemplate` is org-authored and the substitution
does a plain string replace of `{{to}}`/`{{body}}` (the org owns the template; escape
`{{body}}` for JSON when `contentType` is JSON — replace with `JSON.stringify(value)`
minus the outer quotes, or require the template author to quote it; keep it simple and
document the exact substitution rule chosen).

## `SmsService.send` reshape

- Resolve org `{ smsEnabled, smsProvider, smsConfigEncrypted }`.
- **Deliverable gate (same posture):** if `!smsEnabled || !smsConfigEncrypted ||
  !getSmsProvider(smsProvider)` → `SMS_NOT_SENT` log (org id + `to` + body preview; NO
  secret) + `return {success:false}`; the adapter is NEVER called.
- Else: `const config = JSON.parse(cryptoService.decrypt(smsConfigEncrypted))`; guard the
  parse (malformed → log + `{success:false}`, never throw out); `adapter.validateConfig`
  (defense-in-depth; on throw → log + `{success:false}`); `const r = await
  adapter.send(config, { to, body })`; `SMS_SEND_FAILED` log on `!r.ok` (provider id +
  to + status, NO secret); return `{success: r.ok}`. Outer try/catch → log + `{success:false}`.
- NEVER log the decrypted config or any secret field.

## Config controller reshape

- **`GET /organizations/sms-config`** → `{ smsEnabled, smsProvider, configured, config }`
  where `config` is the decrypted blob with **every `secret:true` field removed** (per the
  selected adapter's `configFields`), so non-secret fields (from, url, bodyTemplate) pre-fill
  on edit but the token/authHeader never leave the server. `configured` = the adapter's
  `validateConfig` passes on the stored blob. If no config yet → `config:{}`,
  `configured:false`.
- **`PUT /organizations/sms-config`** body `{ smsEnabled?, smsProvider?, config? }`:
  - Determine the effective provider (incoming `smsProvider` or existing). If
    `smsProvider` changes, the incoming `config` is treated as the full new config for that
    provider (don't merge across different providers).
  - **Merge (same-provider):** start from the existing decrypted config; overlay incoming
    `config`; for any `secret:true` field whose incoming value is blank/absent, keep the
    existing value (the SMTP write-only pattern). Non-secret fields overwrite.
  - `adapter.validateConfig(merged)` → `BadRequestException` on invalid.
  - `smsConfigEncrypted = encrypt(JSON.stringify(merged))`; set `smsProvider`, `smsEnabled`.
  - Returns `getSmsConfig()` (never echoes secrets).
- **`GET /organizations/sms-providers`** → the catalog: `[{ id, label, configFields }]`
  (metadata only, no secrets) so the web renders the right fields per provider.
- All per-method `@RequirePermissions('org:manage_settings')`.

## Web — `SmsConfigSection` reshape

- Fetch the provider catalog (`/organizations/sms-providers`) + current config.
- A provider `<select>` (Twilio | Generic HTTP). Selecting a provider renders THAT
  provider's `configFields` dynamically: `secret` fields → write-only inputs showing
  "Configured" when set (blank keeps existing); non-secret fields → normal inputs
  pre-filled from `config`.
- Enabled toggle. `apiFetch`. No `@exam-platform/shared` VALUE import; no `ui-v2` barrel in
  new files. Never render a secret value.

## Out of scope (deliberate)

- Named vendor adapters beyond Twilio (Vonage/SNS/MessageBird/Plivo) — the HTTP adapter
  covers them; add named ones later if demanded.
- Per-message / per-template provider selection (one provider per org).
- Inbound/webhook (still #16's deferred STOP work).
- Provider-side delivery receipts.

## Testing focus

- **Secret never leaks (crux):** GET strips every `secret` field for BOTH providers (token,
  authHeader); a test asserts the response JSON contains no secret value. PUT with a blank
  secret keeps the existing encrypted value; PUT with a new secret re-encrypts it.
- **Provider dispatch:** `SmsService.send` routes to the selected adapter; unknown/absent
  provider or absent config → deliverable gate `{success:false}`, adapter NOT called, never
  fabricates.
- **HTTP adapter SSRF guard:** `validateConfig` rejects http (non-https), `localhost`,
  private/loopback/link-local IPs (v4 + v6); accepts a public https URL. Load-bearing.
- **HTTP adapter send:** placeholder substitution correct; 2xx→ok, non-2xx/throw→not-ok
  (no throw escaping). `fetch` mocked.
- **Twilio adapter:** delegates to `sendTwilioSms` with the mapped config; unchanged
  behavior vs the pre-reshape Twilio path.
- **Migration:** the three columns dropped, the two added; existing sends still work via
  the Twilio provider default.

## Global constraints

- Config reads/writes on the non-RLS `organization` row (as today). No new tenant table;
  drop/add columns → no `_rls`. Migration `280000`, after candidate-sms `270000/1`. No seed.
- **No new npm dependency** (HTTP via `fetch`; keep `twilio-transport.ts`).
- All provider secrets encrypted via `OrgSecretsCryptoService` inside the JSON blob; NEVER
  returned by any endpoint; NEVER logged.
- The provider NEVER fabricates delivery (keep the deliverable gate).
- SSRF guard on the HTTP adapter URL is mandatory.
- `PermissionsGuard` is handler-only → `@RequirePermissions` per method.
- Web cannot import `@exam-platform/shared` VALUES at runtime.
- Do NOT change the send-flow/opt-out/templates/trigger behavior from #16 — only the
  provider resolution + config surface change. `SmsService.send`'s public signature
  (`{to,body,organizationId} → {success}`) stays identical so `CandidateSmsService` is
  untouched.
