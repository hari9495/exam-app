# WhatsApp Candidate Messaging (Zoho #24) — Design

**Status:** approved in chat 2026-09-09. Ready for implementation planning.

## Goal

A WhatsApp channel to candidates that mirrors the candidate-email/SMS channel (manual +
templates + stage-triggered auto/prompt + separate opt-out), built **provider-pluggable
from day one** (Twilio WhatsApp + a generic configurable-HTTP adapter), gated and
inert-but-honest without configuration, secrets encrypted + never returned.

## Why

Adopt candidate #24 (WhatsApp candidate messaging). Customers use different WhatsApp
providers (Twilio, Meta Cloud API, 360dialog, MessageBird…), so — per the user's explicit
direction — this ships pluggable from the start rather than single-provider-then-refactor,
reusing the pattern proven in [[project_sms_providers]].

## Design decisions (settled in brainstorming)

1. **Feature:** #24 WhatsApp candidate messaging.
2. **Pluggability:** its OWN WhatsApp provider registry (mirrors the sms-providers adapter
   pattern), **independent, off `main`** — no dependency on the unmerged candidate-sms /
   sms-providers branches, independently mergeable.
3. **Message model:** free-text body in v1 (like SMS — works within the WhatsApp 24h
   session window and for generic providers); WhatsApp Business approved-template messages
   (templateName + language + params) are a documented fast-follow. A `templateName` field
   is reserved on adapter config for later.
4. **Opt-out:** a SEPARATE `Candidate.whatsappOptedOutAt` (WhatsApp opt-in is legally
   distinct from SMS/email). No inbound STOP webhook in v1.

## Base branch & migration numbering

Off `main @ 9359b5e2`, independent. Migrations `20260909290000_whatsapp` +
`20260909290001_whatsapp_rls`, numbered after ALL parked-unmerged siblings
(`210000`–`280000`) to keep the chain linear when everything eventually merges.

## Reference (patterns this mirrors — read them)

Since candidate-sms / sms-providers are NOT on `main`, this cannot import their code, but it
mirrors their SHAPE (structurally re-derived from the on-`main` candidate-email channel + the
design of sms-providers). On `main`, read for the mirror:
- `apps/api/src/candidate-emails/candidate-emails.service.ts` (`sendMessage` 3-phase, opt-out
  enforcement, row logging) and `candidate-email-templates.service.ts` (`resolveForStage`,
  upsert-by-stage) and `candidate-email-render.ts` (`renderTemplate` — reuse for the body).
- `apps/api/src/email/email.service.ts` (the deliverable gate / never-fabricate posture).
- `apps/api/src/pipeline/pipeline.service.ts` (~897-915) — the post-commit stage-move comms
  hook (email `resolveForStage` → auto fire / prompt return `pendingMessage`).
- `OrgSecretsCryptoService.encrypt/decrypt` (for the config blob).

## Schema

**Additive on `Organization`** (existing table → no `_rls`):
```prisma
  whatsappEnabled         Boolean @default(false) @map("whatsapp_enabled")
  whatsappProvider        String  @default("twilio") @map("whatsapp_provider")
  whatsappConfigEncrypted String? @map("whatsapp_config_encrypted") @db.NVarChar(Max)
```

**Additive on `Candidate`** (already RLS → no `_rls`):
```prisma
  whatsappOptedOutAt DateTime? @map("whatsapp_opted_out_at")
```
+ back-relation `candidateWhatsapp CandidateWhatsapp[]`.

**New RLS tenant table `CandidateWhatsapp`** (mirrors `CandidateEmail`/`CandidateSms`):
`id, organizationId, candidateId, pipelineEntryId?, templateId?, toPhone, renderedBody
(NVarChar Max), status ('sent'|'failed'), source ('manual'|'stage_prompt'|'stage_auto'),
sentByUserId?, errorDetail?, createdAt`. FK candidate→NoAction; `pipelineEntryId`/`templateId`
plain nullable (no FK). `@@index([organizationId, candidateId])`, `@@index([pipelineEntryId])`.

**New RLS tenant table `CandidateWhatsappTemplate`** (mirrors `CandidateSmsTemplate`):
`id, organizationId, name (NVarChar 200), triggerStageId?, triggerMode ('manual'|'prompt'|
'auto', default 'manual'), body (NVarChar Max), enabled (default true), createdAt, updatedAt`.
`@@index([organizationId])`.

Migrations `20260909290000_whatsapp` (Org cols + Candidate col + 2 tables) +
`20260909290001_whatsapp_rls` (RLS on `candidate_whatsapp` + `candidate_whatsapp_templates`
only). No seed (defaults are code).

## Provider pluggability

### Reusable SSRF guard — `apps/api/src/common/ssrf.ts`

A faithful copy of the twice-opus-reviewed sms-providers HTTP guard (it is NOT on `main`, so
copy the validated logic; this lands it in a reusable location so WhatsApp's HTTP adapter
uses one guard and a later refactor can point the SMS side here too):
- `assertPublicHttpsUrl(url: URL): void` — throw `BadRequestException` unless: protocol is
  `https:`; host is not `localhost`/`0.0.0.0`; not an IPv4 loopback/private/link-local
  (`127.`, `10.`, `172.16-31.`, `192.168.`, `169.254.`); not an IPv6 loopback/unique-local/
  link-local (`::1`, `fc`/`fd` = fc00::/7, `fe[89ab]` = fe80::/10); IPv4-mapped IPv6
  (`::ffff:<dotted>` AND the hex-compressed `::ffff:hhhh:hhhh` form `new URL()` produces) →
  extract embedded IPv4 and range-check. IP-literal-gated (don't apply IP-range rules to a
  plain DNS hostname, so `fc-gateway.com` is accepted). Lowercase + bracket-strip first.
  Rely on `new URL()` canonicalization to neutralize octal/decimal/hex/shorthand IPv4.
- Keep it a pure function with unit tests (v4+v6 private/loopback/link-local, IPv4-mapped
  both forms, public-DNS accepted, non-https rejected). Documented limitation: DNS rebinding
  (a public host resolving to a private IP at fetch time) — not catchable at validate time.

### `apps/api/src/whatsapp/providers/`

- `types.ts` — `WhatsappConfigField {key,label,secret,required,placeholder?}`,
  `WhatsappSendArgs {to,body}`, `WhatsappSendResult {ok,status?}`, `WhatsappProviderAdapter
  {id,label,configFields,validateConfig(cfg),send(cfg,args,fetchImpl?)}`. (Same shape as the
  SMS adapter; separate type since this is an independent registry.)
- `twilio-whatsapp-transport.ts` — `sendTwilioWhatsapp({accountSid,authToken,from,to,body},
  fetchImpl=fetch)`: POST `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/
  Messages.json`, Basic auth, form body `To=whatsapp:${to}&From=whatsapp:${from}&Body=${body}`
  (the `whatsapp:` prefix is what makes it WhatsApp vs SMS). 2xx→ok. Never throws.
- `twilio-whatsapp-provider.ts` — `id:'twilio'`, fields `accountSid`(req), `authToken`
  (req,secret), `from`(req). `validateConfig` requires the three. `send` → the transport.
- `http-provider.ts` — `id:'http'`, fields `url`(req), `method`(opt), `authHeader`
  (secret,opt), `contentType`(opt), `bodyTemplate`(req). `validateConfig` → require url +
  bodyTemplate, `assertPublicHttpsUrl(new URL(url))`. `send` → substitute `{{to}}`/`{{body}}`
  (JSON-escaped when contentType is json) in body + a copy of the url; **re-run
  `assertPublicHttpsUrl` on the FINAL substituted url before fetch**; `fetch(url,{method,
  headers,body,redirect:'manual'})`; success 2xx; never throws. (Both runtime SSRF guards
  from the sms-providers final fix are baked in from the start here.)
- `index.ts` — registry `WHATSAPP_PROVIDERS = {twilio, http}`, `getWhatsappProvider(id)`,
  `listWhatsappProviders()`.
- A `templateName` (optional, non-secret) field MAY be reserved on the twilio adapter's
  configFields for the future approved-template fast-follow, but is unused by `send` in v1.

## Services & flow (mirror candidate-sms)

- **`WhatsappService.send({to,body,organizationId}) → {success}`**: resolve `{whatsappEnabled,
  whatsappProvider, whatsappConfigEncrypted}`; deliverable gate (`!enabled || !config ||
  !getWhatsappProvider(provider)` → `WHATSAPP_NOT_SENT` log + `{success:false}`, adapter
  NEVER called, never fabricate); decrypt+JSON.parse (guarded); `adapter.validateConfig`
  (guarded); `adapter.send`; `WHATSAPP_SEND_FAILED` log on `!ok` (provider+to+status, NO
  secret); outer try/catch. NEVER log the config/secret.
- **`CandidateWhatsappService.sendWhatsapp(context, actorUserId, entryId, input)`** (3-phase,
  mirrors `sendSms`): load entry+candidate+job; erased→BadRequest; no-phone manual→BadRequest
  / triggered→skip; `whatsappOptedOutAt` manual→Conflict / triggered→skip; render body with
  `{{candidateName}}/{{jobTitle}}/{{orgName}}/{{recruiterName}}` (reuse the email renderer's
  body path); `WhatsappService.send` OUTSIDE the tx; log a `CandidateWhatsapp` row; **NO
  `recomputeGlobalStage`**; audit `candidate_whatsapp.sent`/`.failed`. `listMessages`,
  `resend`. `SendWhatsappInput {templateId?, body, source}`.
- **`CandidateWhatsappTemplatesService`** (mirrors the SMS templates service): list
  (saved+code-defaults from `default-whatsapp-templates.ts`), upsert-by-stage,
  `resolveForStage(context,stageId)→{id,body,triggerMode}|null` (saved enabled→default→null),
  `setEnabled` (PATCH `:id/enabled`), `remove` (DELETE `:id`). Body-only.

## Config / opt-out surfaces (authenticated, per-method `org:manage_settings` unless noted)

- `GET /organizations/whatsapp-config` → `{whatsappEnabled, whatsappProvider, configured,
  config}` — config = decrypted blob MINUS every `secret:true` field (per the adapter's
  configFields); unknown provider → `config:{}`; `configured` = adapter.validateConfig passes.
  NEVER returns the token/authHeader.
- `PUT /organizations/whatsapp-config` `{whatsappEnabled?, whatsappProvider?, config?}` —
  merge incoming over decrypted existing; blank/absent secret keeps existing; provider change
  → no cross-provider merge; `adapter.validateConfig` before persist (invalid→BadRequest);
  encrypt whole blob. Returns `getWhatsappConfig`.
- `GET /organizations/whatsapp-providers` → catalog `[{id,label,configFields}]` (metadata).
- Opt-out: `PATCH /candidates/:id/whatsapp-opt-out {optedOut}` — set/clear
  `whatsappOptedOutAt`, org-scoped via `forTenant`, gated `candidate:manage` (match the SMS
  opt-out gate).
- **Manual send / list / resend:** `POST /candidate-whatsapp/:entryId` (source forced
  `manual`), `GET /candidate-whatsapp/:candidateId`, resend — gated like the candidate-email/
  SMS send controller.
- **Templates CRUD:** controller mirroring the SMS templates controller.

## Trigger hook — `pipeline.service.ts` `patchEntry`

Add a WhatsApp resolution BESIDE the existing email hook (this branch is off `main`, which has
only the email hook), same post-commit fail-open wrapping: `whatsappTemplates.resolveForStage`
→ `'auto'` fire-and-forget `candidateWhatsapp.sendWhatsapp(...source:'stage_auto').catch(log)`;
`'prompt'` → include `pendingWhatsappMessage:{templateId,body}` in the return alongside any
`pendingMessage`. Independent of + non-disturbing to the email hook; a thrown WhatsApp
resolution must not fail the committed stage move. Inject `whatsappTemplates` +
`candidateWhatsapp` into `PipelineService`; `PipelineModule` imports `WhatsappModule`
(→ no cycle; plain import).

**Merge note (for the runbook):** candidate-sms also adds a hook beside email in `patchEntry`;
when both branches merge, `patchEntry` will have a small resolvable conflict (email + SMS +
WhatsApp hooks coexist). Documented, not a code defect here.

## Web

- Integrations **WhatsApp config card** — dynamic, catalog-driven (provider `<select>` from
  `/organizations/whatsapp-providers`; secret fields write-only showing "Configured";
  non-secret fields pre-filled), enabled toggle. `apiFetch`.
- **WhatsApp templates editor** (body-only; enable-toggle; delete).
- **Candidate drawer:** Send-WhatsApp action (body / pick template → `POST
  /candidate-whatsapp/:entryId`), WhatsApp history (`GET /candidate-whatsapp/:candidateId`),
  opt-out toggle, stage-move WhatsApp prompt (`pendingWhatsappMessage`). Disabled with a hint
  when the candidate has no phone or is opted out.
- No `@exam-platform/shared` VALUE import at runtime; no `ui-v2` barrel import in new files;
  never render a secret.

## Out of scope (deliberate)

- WhatsApp Business approved-template messages (templateName/language/params) — free-text v1;
  documented fast-follow (24h-session-window caveat).
- Inbound / STOP-keyword webhook (recruiter-set opt-out only).
- Delivery receipts / read status.
- Named providers beyond Twilio (the HTTP adapter is the escape hatch).
- WhatsApp feeding `recomputeGlobalStage` "contacted".
- Sharing the provider abstraction with the SMS channel (deliberately independent; a shared
  messaging-provider core is a future refactor once these land).

## Testing focus

- **SSRF guard** (`common/ssrf.ts`): the full v4+v6 private/loopback/link-local set,
  IPv4-mapped IPv6 (dotted + hex form), public-DNS accepted, non-https rejected — each
  asserted, load-bearing. HTTP adapter `send`: `redirect:'manual'` present; a template that
  substitutes to a private host → re-validation rejects → `{ok:false}`, fetch not called.
- **Never fabricates:** `WhatsappService.send` unconfigured/unknown-provider/unreadable →
  `{success:false}`, adapter not called.
- **Secret never leaks:** config GET strips secret fields (both providers); PUT blank-secret
  keeps existing; catalog metadata-only; web write-only; no secret logged. Grep no org-read
  path serializes the blob.
- **Opt-out / no-phone:** manual→Conflict/BadRequest, triggered→skip.
- **Trigger hook:** WhatsApp auto fires / prompt returns `pendingWhatsappMessage`; EXISTING
  email trigger unchanged in the same move; a thrown WhatsApp resolution doesn't fail the move.
- **Twilio WhatsApp transport:** To/From carry the `whatsapp:` prefix.

## Global constraints

- Config reads/writes on the non-RLS `organization` row; new tenant tables ⇒ paired `_rls`
  (290001); additive Org/Candidate cols ⇒ none. Migration `290000/290001` after all parked
  siblings. No seed.
- **No new npm dependency** (Twilio + HTTP via `fetch`). No `npm install` in the worktree.
- All provider secrets encrypted via `OrgSecretsCryptoService` inside the JSON blob; NEVER
  returned; NEVER logged.
- The provider NEVER fabricates delivery (deliverable gate). SSRF guard (save-time + runtime
  redirect:'manual' + post-substitution re-validation) mandatory on the HTTP adapter.
- `PermissionsGuard` handler-only → `@RequirePermissions` per method.
- Web cannot import `@exam-platform/shared` VALUES at runtime.
- Do NOT change existing email trigger / candidate flows; the WhatsApp additions are additive
  and fail-open.
