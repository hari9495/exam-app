# Pluggable SMS Providers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generalize the Twilio-only candidate SMS channel into a pluggable-provider model — a per-org `smsProvider` + an encrypted JSON config blob, an `SmsProviderAdapter` abstraction, a refactored Twilio adapter, and a generic configurable-HTTP adapter (with an SSRF guard).

**Architecture:** Replace the three Twilio config columns with `smsProvider` + `smsConfigEncrypted` (encrypted JSON). Adapters implement a common interface behind the existing `SmsService` seam; `SmsService.send` resolves the org's provider and dispatches (public signature unchanged). The config controller stores the whole config as one encrypted blob, strips secret fields on GET, and merges (blank-secret-keeps-existing) on PUT; a catalog endpoint drives the dynamic web card.

**Tech Stack:** NestJS + Prisma (SQL Server), Next.js (apps/web), `@exam-platform/shared` (OrgSecretsCryptoService, PrismaService), Jest. HTTP via global `fetch` (no new dep).

**Spec:** docs/superpowers/specs/2026-09-09-sms-providers-design.md

**Base:** branches off `feat/candidate-sms @ 69ffba71` (this reshapes code that only exists there; merges after candidate-sms).

## Global Constraints

- Config reads/writes on the non-RLS `organization` row (as the existing SMS config does). Drop/add columns → **no `_rls`**. Migration `20260909280000_sms_providers`, after candidate-sms `270000/1`. **No seed.**
- **No new npm dependency** (HTTP adapter via global `fetch`; keep `twilio-transport.ts`). **NEVER `npm install`/`ci`/`update`.** Only Task 1 runs `prisma migrate deploy` / `prisma generate`.
- All provider secrets encrypted via `OrgSecretsCryptoService` inside the JSON blob; NEVER returned by any endpoint; NEVER logged.
- The provider NEVER fabricates delivery — keep the deliverable gate posture.
- SSRF guard on the HTTP adapter URL is mandatory (https-only; reject loopback/private/link-local v4+v6).
- `SmsService.send`'s public signature (`{to,body,organizationId} → {success}`) stays identical — do NOT touch `CandidateSmsService` or the send-flow/opt-out/templates/trigger behavior from #16.
- `PermissionsGuard` is handler-only → `@RequirePermissions` per method. Web cannot import `@exam-platform/shared` VALUES at runtime; no `ui-v2` barrel import in new web files.
- Every commit verifies `git branch --show-current` == `feat/sms-providers` in the same command.

---

### Task 1: Schema reshape

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (Organization: drop 3 Twilio SMS cols, add 2)
- Create: `apps/api/prisma/migrations/20260909280000_sms_providers/migration.sql`

**Interfaces:**
- Produces: `Organization.smsProvider` (String, default `'twilio'`), `Organization.smsConfigEncrypted` (String?), and REMOVES `smsAccountSid`/`smsAuthTokenEncrypted`/`smsFromNumber` — consumed by T3/T4.

- [ ] **Step 1: Edit the model**

In `Organization`, remove `smsAccountSid`, `smsAuthTokenEncrypted`, `smsFromNumber`; add `smsProvider String @default("twilio") @map("sms_provider")` and `smsConfigEncrypted String? @map("sms_config_encrypted") @db.NVarChar(Max)`. Keep `smsEnabled`.

- [ ] **Step 2: Migration SQL**

`ALTER TABLE [organizations] DROP CONSTRAINT` for the three columns' default constraints if any (the auth-token/sid/from are nullable NVARCHAR with no defaults, but check the candidate-sms migration `20260909270000` for exact constraint names) then `ALTER TABLE [organizations] DROP COLUMN [sms_account_sid], [sms_auth_token_encrypted], [sms_from_number]`; then `ALTER TABLE [organizations] ADD [sms_provider] NVARCHAR(1000) NOT NULL CONSTRAINT [DF_organizations_sms_provider] DEFAULT 'twilio', [sms_config_encrypted] NVARCHAR(MAX) NULL`. Match SQL-Server drop/add conventions of an existing migration. Safe: candidate-sms is undeployed, no data.

- [ ] **Step 3: Apply + regenerate**

From `apps/api`: `npx prisma migrate deploy` then `npx prisma generate`. (DLL-lock note: don't kill an unconfirmed process; report+retry.)

- [ ] **Step 4: tsc**

`npx tsc --noEmit`. Expected: **errors** in `sms.service.ts` + `organizations.service.ts` (they still reference the dropped columns) — that's fine, T3/T4 fix them. Confirm the ONLY errors are those known references (list them in the report); do not fix them here.

- [ ] **Step 5: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260909280000_sms_providers
git commit -m "feat(sms-providers): reshape org SMS config to provider selector + encrypted JSON blob"
```

---

### Task 2: Provider abstraction + Twilio & HTTP adapters + registry

**Files:**
- Create: `apps/api/src/sms/providers/types.ts` (the interface + field types)
- Create: `apps/api/src/sms/providers/twilio-provider.ts`
- Create: `apps/api/src/sms/providers/http-provider.ts`
- Create: `apps/api/src/sms/providers/index.ts` (registry: `SMS_PROVIDERS`, `getSmsProvider`, `listSmsProviders`)
- Create: `apps/api/src/sms/providers/http-provider.spec.ts`
- Create: `apps/api/src/sms/providers/twilio-provider.spec.ts`

**Interfaces:**
- Consumes: existing `sendTwilioSms` from `../twilio-transport`.
- Produces: `SmsProviderAdapter` interface, the two adapters, `getSmsProvider(id)`, `listSmsProviders()` — consumed by T3 (dispatch) + T4 (catalog + config field metadata).

- [ ] **Step 1: types.ts**

```ts
export interface SmsConfigField { key: string; label: string; secret: boolean; required: boolean; placeholder?: string }
export interface SmsSendArgs { to: string; body: string }
export interface SmsSendResult { ok: boolean; status?: number }
export interface SmsProviderAdapter {
  id: string; label: string; configFields: SmsConfigField[];
  validateConfig(config: Record<string, unknown>): void;                 // throw BadRequestException on invalid
  send(config: Record<string, unknown>, args: SmsSendArgs, fetchImpl?: typeof fetch): Promise<SmsSendResult>;
}
```

- [ ] **Step 2: Twilio adapter + test**

`twilio-provider.ts`: `id:'twilio'`, `label:'Twilio'`, fields `[{accountSid,req}, {authToken,req,secret}, {from,req}]`. `validateConfig` → require the 3 non-empty strings (else BadRequestException). `send(config, {to,body}, fetchImpl)` → `sendTwilioSms({ accountSid, authToken, from, to, body }, fetchImpl)`. Spec: validateConfig rejects missing fields; send maps config → sendTwilioSms args (mock the transport or fetch). Run `npx jest --testPathPattern "src/sms/providers/twilio-provider"` → green.

- [ ] **Step 3: HTTP adapter + test (SSRF guard is load-bearing)**

`http-provider.ts`: `id:'http'`, `label:'Generic HTTP'`, fields `[{url,req}, {method,optional}, {authHeader,secret,optional}, {contentType,optional}, {bodyTemplate,req}]`.
- `validateConfig`: require `url`, `bodyTemplate`. Parse `url` with `new URL()` (invalid → BadRequestException). **SSRF guard:** protocol must be `https:`; reject host that is `localhost`, an IPv4 loopback/private/link-local (`127.`, `10.`, `172.16-31.`, `192.168.`, `169.254.`), `0.0.0.0`, or IPv6 loopback/unique-local/link-local (`::1`, `fc00::/7` i.e. starts `fc`/`fd`, `fe80::/10`). Reject non-https or a private host with BadRequestException.
- `send(config, {to,body}, fetchImpl=fetch)`: build `body` by replacing `{{to}}`/`{{body}}` in `bodyTemplate`; substitute the same in a copy of `url`. **JSON-safety:** when `contentType` (default `application/json`) is JSON, substitute `{{to}}`/`{{body}}` with `JSON.stringify(value).slice(1,-1)` (escape for embedding inside JSON string quotes the template author wrote); document the rule in a comment. Headers: `Content-Type: <contentType default application/json>`, and if `authHeader` set → `Authorization: <authHeader>`. `await fetchImpl(url, { method: method ?? 'POST', headers, body })`; return `{ ok: res.ok, status: res.status }`; wrap in try/catch → `{ ok:false }` (never throw).
- Spec (mock fetch): validateConfig accepts a public https URL; rejects `http://…`, `https://localhost`, `https://127.0.0.1`, `https://10.0.0.5`, `https://192.168.1.1`, `https://169.254.1.1`, `https://[::1]`, `https://[fd00::1]`; a valid send substitutes placeholders + sets Authorization when authHeader present + 2xx→ok, 500→not-ok, throw→not-ok. Run `npx jest --testPathPattern "src/sms/providers/http-provider"` → green. **The SSRF rejections must each be asserted (load-bearing — the reviewer will check they fail if the guard is dropped).**

- [ ] **Step 4: registry**

`index.ts`: `SMS_PROVIDERS: Record<string, SmsProviderAdapter> = { twilio: twilioProvider, http: httpProvider }`; `getSmsProvider(id) => SMS_PROVIDERS[id]`; `listSmsProviders() => Object.values(SMS_PROVIDERS)`.

- [ ] **Step 5: tsc + suite + commit**

`npx tsc --noEmit` (providers dir compiles; sms.service/organizations still error from T1 — untouched here, note it). `npx jest --testPathPattern "src/sms/providers"` green. Commit:
```bash
git add apps/api/src/sms/providers
git commit -m "feat(sms-providers): adapter interface + Twilio & generic-HTTP adapters (SSRF-guarded) + registry"
```

---

### Task 3: `SmsService.send` reshape (provider dispatch)

**Files:**
- Modify: `apps/api/src/sms/sms.service.ts` (+ `.spec.ts`)

**Interfaces:**
- Consumes: T1 columns, T2 `getSmsProvider`.
- Produces: unchanged public `send({to,body,organizationId}) → {success}`.

- [ ] **Step 1: Update the spec tests**

Rewrite `sms.service.spec.ts` for the new model (mock PrismaService + OrgSecretsCryptoService + the adapters, or spy on the registry): 
- `smsEnabled:false` OR `smsConfigEncrypted` null OR `smsProvider` unknown → `{success:false}`, adapter NOT called, decrypt NOT called (for the enabled/config-null cases), `SMS_NOT_SENT` logged, never fabricates.
- configured (enabled + a known provider + a config blob): decrypts, JSON.parses, calls `adapter.send(config, {to,body})`; ok→success:true; not-ok→success:false + `SMS_SEND_FAILED` log; adapter.send throw / malformed JSON → success:false (no throw escapes).
- NEVER logs the decrypted config/secret.
Run → FAIL (old impl reads dropped columns).

- [ ] **Step 2: Implement**

`send`: `org = findUnique select { smsEnabled, smsProvider, smsConfigEncrypted }`; `const adapter = getSmsProvider(org?.smsProvider ?? '')`; gate `if (!org?.smsEnabled || !org.smsConfigEncrypted || !adapter) { log SMS_NOT_SENT; return {success:false} }`; `let config; try { config = JSON.parse(cryptoService.decrypt(org.smsConfigEncrypted)) } catch { log; return {success:false} }`; `try { adapter.validateConfig(config) } catch { log 'SMS config invalid'; return {success:false} }`; `const r = await adapter.send(config, { to: input.to, body: input.body })`; `if (!r.ok) log SMS_SEND_FAILED (provider id + to + status, NO secret)`; `return { success: r.ok }`. Keep the outer try/catch. Keep SmsModule wiring (it already provides SmsService; providers are plain imports, no DI needed unless you choose to).
Run tests → PASS.

- [ ] **Step 3: tsc + commit**

`npx tsc --noEmit` (sms.service now compiles; organizations.service still errors — T4). `npx jest --testPathPattern "src/sms"` green. Commit:
```bash
git add apps/api/src/sms/sms.service.ts apps/api/src/sms/sms.service.spec.ts
git commit -m "feat(sms-providers): SmsService resolves + dispatches by org provider (gate preserved)"
```

---

### Task 4: Config controller reshape + provider catalog

**Files:**
- Modify: `apps/api/src/organizations/organizations.service.ts` (+ `.spec.ts`) — getSmsConfig / putSmsConfig
- Modify: `apps/api/src/organizations/organizations.controller.ts` (+ `.spec.ts`) — add the catalog route
- Modify: `apps/api/src/organizations/dto/update-sms-config.dto.ts`

**Interfaces:**
- Consumes: T1 columns, T2 `getSmsProvider`/`listSmsProviders` + `configFields`.
- Produces: `GET/PUT /organizations/sms-config` (blob model) + `GET /organizations/sms-providers` (catalog).

- [ ] **Step 1: Failing tests (secret-strip + merge are the crux)**

Rewrite the SMS-config tests in `organizations.service.spec.ts`:
- `getSmsConfig`: decrypts the stored blob, returns `{ smsEnabled, smsProvider, configured, config }` where `config` OMITS every `secret:true` field for that provider (assert token/authHeader absent; assert `from`/`url` present); `configured` = adapter.validateConfig passes; no config → `{config:{}, configured:false}`. **Assert the response JSON string contains no secret value.**
- `putSmsConfig` same provider: merges incoming `config` over existing decrypted; a blank/absent `secret` field keeps the existing encrypted secret (assert the persisted blob still has the old token); a new secret value re-encrypts; non-secret fields overwrite; `encrypt` called with the merged JSON; invalid (adapter.validateConfig throws) → BadRequest, nothing persisted.
- `putSmsConfig` provider CHANGE: incoming config treated as the full new config for the new provider (no cross-provider merge); validated against the new adapter.
- catalog: `listSmsProviders()` → `[{id,label,configFields}]`, metadata only.
Run → FAIL.

- [ ] **Step 2: Implement**

- DTO `update-sms-config.dto.ts`: `smsEnabled?: boolean`, `smsProvider?: string` (`@IsIn` the known provider ids), `config?: Record<string,unknown>` (object; validate loosely — the adapter does the real validation).
- `getSmsConfig(context)`: read org `{smsEnabled, smsProvider, smsConfigEncrypted}`; `adapter = getSmsProvider(smsProvider)`; `raw = smsConfigEncrypted ? JSON.parse(decrypt(...)) : {}`; `config = omit(raw, adapter.configFields.filter(f=>f.secret).map(f=>f.key))`; `configured = smsConfigEncrypted ? tryValidate(adapter, raw) : false`; return `{smsEnabled, smsProvider, configured, config}`.
- `putSmsConfig(context, dto)`: `provider = dto.smsProvider ?? existing.smsProvider`; `adapter = getSmsProvider(provider)` (unknown → BadRequest); `existingCfg = (dto.smsProvider && dto.smsProvider !== existing.smsProvider) ? {} : (existing blob decrypted or {})`; `merged = { ...existingCfg, ...dto.config }` then for each `secret` field where `dto.config?.[key]` is blank/absent → `merged[key] = existingCfg[key]` (keep); `adapter.validateConfig(merged)`; persist `smsProvider=provider`, `smsConfigEncrypted=encrypt(JSON.stringify(merged))`, `smsEnabled=dto.smsEnabled ?? existing`; return `getSmsConfig()`.
- Controller: keep `GET/PUT /organizations/sms-config`; add `GET /organizations/sms-providers` → `listSmsProviders().map(({id,label,configFields})=>({id,label,configFields}))`. All per-method `org:manage_settings`.
Run tests → PASS.

- [ ] **Step 3: tsc + suites + commit**

`npx tsc --noEmit` (whole api now compiles). `npx jest --testPathPattern "src/organizations"` + `npx jest --testPathPattern "src/sms"` + `npx jest --testPathPattern "src/candidate-sms"` (no regression — the #16 send flow still works via the Twilio provider). Commit:
```bash
git add apps/api/src/organizations
git commit -m "feat(sms-providers): sms-config blob model (secret-strip GET, merge PUT) + provider catalog"
```

---

### Task 5: Web — dynamic provider config card

**Files:**
- Modify: the `SmsConfigSection` component (+ its test) and the `useSmsConfig` hook (grep `sms-config` in apps/web)

**Interfaces:** consumes `GET /organizations/sms-providers` + `GET/PUT /organizations/sms-config`.

- [ ] **Step 1: Fetch catalog + config**

Add a `useSmsProviders` hook (GET `/organizations/sms-providers`) and reshape `useSmsConfig` to the new response `{ smsEnabled, smsProvider, configured, config }`. `apiFetch`.

- [ ] **Step 2: Dynamic fields**

Reshape `SmsConfigSection`: an enabled toggle + a provider `<select>` (from the catalog). For the selected provider, render its `configFields`: `secret` fields → write-only inputs (show "Configured" when the field is set in the returned config's `configured` context; blank keeps existing), non-secret fields → normal inputs pre-filled from `config`. On save, PUT `{ smsEnabled, smsProvider, config: {only the fields the user entered} }`. Never render a secret value. Deep-import UI components; no shared VALUE import.

- [ ] **Step 3: Test + tsc + commit**

Update/extend the SmsConfigSection test: switching provider renders that provider's fields; the auth token / authHeader inputs never display a value; the PUT payload carries `smsProvider` + `config`. `npx tsc --noEmit` (web); scoped jest green (allow only the pre-existing ImpersonationBanner failure). Commit:
```bash
git add apps/web
git commit -m "feat(sms-providers): dynamic provider config card (catalog-driven fields, write-only secrets)"
```

---

## Self-review notes

- **Spec coverage:** T1 schema reshape (drop 3 + add 2, no _rls); T2 abstraction + Twilio + HTTP (SSRF guard) + registry; T3 SmsService dispatch (gate preserved, signature unchanged); T4 config blob (secret-strip GET / merge PUT) + catalog; T5 dynamic web card. All mapped.
- **Security-critical (opus review):** T2 http-provider SSRF guard; T4 secret-strip/merge in the blob model.
- **Signature stability:** `SmsService.send` public shape unchanged → T3 does not touch `CandidateSmsService`; T4/T3 run the candidate-sms suite to prove no #16 regression.
- **No new dep; no _rls; no seed;** migration `280000` after candidate-sms `270000/1`; base is `feat/candidate-sms` (merges after it).
- **Cross-task types:** `SmsProviderAdapter` + `getSmsProvider`/`listSmsProviders` (T2) consumed by T3 (dispatch) and T4 (catalog + secret-field metadata); the `configFields[].secret` flag is the single source of truth for what GET strips and what PUT preserves-on-blank.
