# Candidate SMS Channel (Zoho #16) — Design

**Status:** approved in chat 2026-09-09. Ready for implementation planning.

## Goal

Give recruiters an SMS channel to candidates that mirrors the existing candidate-email
channel: manual sends (optionally from a saved template) AND stage-triggered
auto/prompt SMS, with a separate SMS opt-out. Provider-agnostic (Twilio adapter),
**gated and inert-but-honest without credentials** — it never fabricates delivery.

## Why

Adopt candidate #16 (SMS to candidates) from `docs/ats/zoho-adopt-inventory.md`. The
platform already has a full candidate-email channel (manual + templates +
stage-triggers + opt-out); SMS is the parallel channel. It needs an external SMS
provider credential (Twilio), so it ships inert until configured — the same posture
as the "prod has no AI key → screen analysis inert" precedent.

## Design decisions (settled in brainstorming)

1. **Scope:** full email parity — manual sends + reusable SMS templates + stage-triggered
   auto/prompt SMS (not manual-only).
2. **Opt-out:** a SEPARATE `Candidate.smsOptedOutAt` (SMS consent is legally distinct from
   email). No inbound STOP webhook in v1 (deferred).
3. **Provider:** Twilio via its REST API called through global `fetch` — **NO new npm
   dependency** (respects the never-`npm install`-in-worktree constraint). A thin
   `twilio-transport.ts` mirrors `smtp-transport.ts`.

## Reference: the email channel this mirrors (read these)

- `apps/api/src/email/email.service.ts` — the `deliverable` gate: when no transport is
  configured it REFUSES + logs and returns `{success:false}` rather than relaying/faking
  a send. The SMS provider copies this posture exactly.
- `apps/api/src/candidate-emails/candidate-emails.service.ts` — `sendMessage`: 3-phase
  (short tx prep → send outside tx → short tx log), opt-out enforcement (manual→409,
  triggered→skip-silently), `{{var}}` render, log a row.
- `apps/api/src/candidate-emails/candidate-email-templates.service.ts` — template CRUD +
  `resolveForStage(context, stageId)` returning `{id, subject, body, triggerMode}` (saved
  row → code default fallback).
- `apps/api/src/pipeline/pipeline.service.ts` (~line 897-915) — the post-commit stage-move
  comms hook: `templates.resolveForStage` → `triggerMode:'auto'` fire-and-forget
  `sendMessage(source:'stage_auto')`; `'prompt'` → returns `pendingMessage`. Wrapped so a
  comms failure never fails the (already-committed) stage move.
- `apps/api/src/candidate-emails/candidate-email-render.ts` — `renderTemplate(subject,body,vars)`.
- `OrgSecretsCryptoService` (used for `smtpPasswordEncrypted`) — encrypt the Twilio auth token.

## Schema

**Additive on `Organization` (already a table, no `_rls`):**
```prisma
  smsEnabled            Boolean @default(false) @map("sms_enabled")
  smsAccountSid         String? @map("sms_account_sid")
  smsAuthTokenEncrypted String? @map("sms_auth_token_encrypted")
  smsFromNumber         String? @map("sms_from_number")
```

**Additive on `Candidate` (already RLS, no `_rls`):**
```prisma
  smsOptedOutAt DateTime? @map("sms_opted_out_at")
```

**New RLS tenant table `CandidateSms`** (mirrors `CandidateEmail`):
```prisma
model CandidateSms {
  id              String   @id @default(uuid()) @db.UniqueIdentifier
  organizationId  String   @map("organization_id") @db.UniqueIdentifier
  candidateId     String   @map("candidate_id") @db.UniqueIdentifier
  pipelineEntryId String?  @map("pipeline_entry_id") @db.UniqueIdentifier
  templateId      String?  @map("template_id") @db.UniqueIdentifier
  toPhone         String   @map("to_phone")
  renderedBody    String   @map("rendered_body") @db.NVarChar(Max)
  status          String   // 'sent' | 'failed'
  source          String   // 'manual' | 'stage_prompt' | 'stage_auto'
  sentByUserId    String?  @map("sent_by_user_id") @db.UniqueIdentifier
  errorDetail     String?  @map("error_detail") @db.NVarChar(Max)
  createdAt       DateTime @default(now()) @map("created_at")
  candidate       Candidate @relation(fields: [candidateId], references: [id], onDelete: NoAction, onUpdate: NoAction)
  @@index([organizationId, candidateId])
  @@index([pipelineEntryId])
  @@map("candidate_sms")
}
```
(Add the `candidateSms CandidateSms[]` back-relation to `Candidate`. `pipelineEntryId`
and `templateId` are plain columns, NOT relations — matches how `CandidateEmail` keeps
`templateId` a soft pointer / uses SetNull; keep it simplest: plain nullable columns, no
FK, so a template/entry delete never blocks. Match the existing CandidateEmail relation
choices exactly where practical.)

**New RLS tenant table `CandidateSmsTemplate`** (mirrors `CandidateEmailTemplate`):
```prisma
model CandidateSmsTemplate {
  id             String   @id @default(uuid()) @db.UniqueIdentifier
  organizationId String   @map("organization_id") @db.UniqueIdentifier
  name           String   @db.NVarChar(200)
  triggerStageId String?  @map("trigger_stage_id") @db.UniqueIdentifier
  triggerMode    String   @default("manual") @map("trigger_mode") // 'manual' | 'prompt' | 'auto'
  body           String   @db.NVarChar(Max)
  enabled        Boolean  @default(true)
  createdAt      DateTime @default(now()) @map("created_at")
  updatedAt      DateTime @updatedAt @map("updated_at")
  @@index([organizationId])
  @@map("candidate_sms_templates")
}
```
(SMS has no subject. Upsert-by-stage semantics — at most one saved row per
`(organizationId, triggerStageId)` — match `CandidateEmailTemplate`; enforce the same way
that service does, not necessarily a DB unique.)

**Migrations:** `20260909270000_candidate_sms` (Organization cols + Candidate col + the 2
tables) + `20260909270001_candidate_sms_rls` (RLS on `candidate_sms` +
`candidate_sms_templates` only — the additive Organization/Candidate columns need none).
Numbered after parked self-booking `260000` (linear). **No seed** (defaults are code).

## Provider — `SmsService` + `twilio-transport.ts`

`SmsService.send(input: { to: string; body: string; organizationId: string }):
Promise<{ success: boolean }>`:
- Resolve org SMS config: `smsEnabled`, `smsAccountSid`, `smsAuthTokenEncrypted`
  (decrypt via `OrgSecretsCryptoService`), `smsFromNumber`.
- **Deliverable gate (copy EmailService's posture):** if `!smsEnabled` OR any of
  accountSid/authToken/fromNumber missing → log an explicit `SMS_NOT_SENT: no Twilio
  configured for organization <id> — "<body preview>" to <to> was NOT sent` and return
  `{success:false}`. NEVER attempt a send, NEVER fabricate success.
- When configured → `twilio-transport.ts` builds + performs the request: POST
  `https://api.twilio.com/2010-04-01/Accounts/{accountSid}/Messages.json`, header
  `Authorization: Basic base64(accountSid:authToken)`, `Content-Type:
  application/x-www-form-urlencoded`, body `To=<to>&From=<fromNumber>&Body=<body>`. 2xx →
  `{success:true}`; non-2xx or throw → log + `{success:false}`. Isolated + unit-testable
  (inject/mock `fetch`).
- No inbound webhook, no delivery-status callback (deferred).

## Send service — `CandidateSmsService.sendSms`

Mirror `CandidateEmailsService.sendMessage`, 3 phases:
- **Phase 1 (short tx):** load the pipeline entry + candidate + job (org-scoped);
  `candidate.erasedAt` → BadRequest; **no phone** (`candidate.phone` null/empty) → manual:
  BadRequest ("candidate has no phone number"); triggered: skip silently (log).
  `candidate.smsOptedOutAt` → manual: `ConflictException`; triggered: skip silently.
  Read org name + the candidate/job/recruiter vars.
- **Phase 2 (outside tx):** render the body with `{{candidateName}}/{{jobTitle}}/{{orgName}}/
  {{recruiterName}}` (reuse the email render's body substitution — no subject, no
  status/unsubscribe link, no HTML), then `SmsService.send`.
- **Phase 3 (short tx):** create the `CandidateSms` row (`status` sent/failed, `source`,
  `sentByUserId`, `errorDetail`). **Does NOT call `recomputeGlobalStage`** (deliberate v1
  scope — SMS doesn't feed "contacted"; avoids touching that shared counter).
- Audit `candidate_sms.sent` / `candidate_sms.failed`.
- `listMessages(context, candidateId)`; `resend(context, actor, smsId)` (source manual,
  re-send the stored `renderedBody`).
- `SendSmsInput { templateId?: string|null; body: string; source: 'manual'|'stage_prompt'|'stage_auto' }`.

## Templates — `CandidateSmsTemplatesService`

Mirror `CandidateEmailTemplatesService`: list (saved rows merged with code defaults from a
new `default-sms-templates.ts`), upsert (per-method gated), `resolveForStage(context,
stageId) → { id, body, triggerMode } | null` (saved enabled row for that stage → code
default → null). Upsert-by-stage dedupe as the email service does.

## Trigger hook — `pipeline.service.ts` `patchEntry`

Beside the existing email comms hook (post-commit, same try/fail-open wrapper), add an
INDEPENDENT SMS resolution:
- `const smsTpl = await this.smsTemplates.resolveForStage(context, commsStageId);`
- `smsTpl?.triggerMode === 'auto'` → fire-and-forget
  `this.candidateSms.sendSms(context, null, entryId, { templateId: smsTpl.id, body:
  smsTpl.body, source: 'stage_auto' }).catch(log)`.
- `smsTpl?.triggerMode === 'prompt'` → include `pendingSmsMessage: { templateId, body }`
  in the return alongside any `pendingMessage` (email). Both prompts can be present.
- The email hook is unchanged; the SMS resolution must not alter email behavior, and a
  thrown SMS resolution must not fail the stage move (same wrapping). Inject the two new
  deps (`smsTemplates`, `candidateSms`) into `PipelineService` the same way `templates` /
  `messages` are injected today.

## Config / send / opt-out surfaces (authenticated)

- **Org SMS config** `GET/PUT /organizations/sms-config` (per-method `org:manage_settings`,
  mirror the SMTP/email config controller): PUT sets `smsEnabled`, `smsAccountSid`,
  `smsFromNumber`, and `smsAuthToken` (plaintext in → encrypted at rest via
  `OrgSecretsCryptoService`; omitted/blank → keep existing). GET returns `{ smsEnabled,
  smsAccountSid, smsFromNumber, configured: boolean }` — **never the auth token** (mirror
  how SMTP password is write-only).
- **SMS templates CRUD** — controller mirroring `candidate-email-templates.controller`, same
  gating.
- **Manual send** `POST /candidate-sms/:entryId` (source forced `'manual'`), `GET
  /candidate-sms/:candidateId` (list), resend — mirror `candidate-emails.controller`, same
  gating.
- **Opt-out toggle** — set/clear `Candidate.smsOptedOutAt` (recruiter-facing; a small
  endpoint or fold into an existing candidate-update path). Manual send honors it (409).

## Web

- **Integrations settings:** an SMS config card (enabled toggle, Account SID, Auth Token
  [write-only, shows "configured"], From number) — mirror the email/SMTP config card.
- **SMS templates editor** — mirror the email templates editor (no subject field).
- **Candidate drawer:** a Send-SMS action (body / pick template; disabled with a hint when
  the candidate has no phone or is opted out), an SMS history list, an opt-out toggle, and
  the stage-move SMS prompt (when `pendingSmsMessage` is returned).
- Authed surfaces use `apiFetch`; no `@exam-platform/shared` VALUE import at runtime; no
  `ui-v2` barrel import in new files.

## Out of scope (deliberate)

- Inbound SMS / STOP-keyword auto-opt-out (needs a Twilio webhook) — recruiter-set opt-out
  only in v1.
- Delivery-status callbacks / read receipts.
- SMS feeding `recomputeGlobalStage` "contacted".
- Multiple SMS providers (one Twilio adapter behind the `SmsService` seam; add others later).
- Per-user/per-number sender selection (single org from-number).

## Testing focus

- **Provider deliverable gate:** `smsEnabled:false` or missing creds → `{success:false}`,
  NO fetch attempted, an explicit not-sent log (never fabricates success). Configured +
  Twilio 2xx → success; non-2xx/throw → `{success:false}` + log. `fetch` mocked.
- **Secret handling:** auth token encrypted at rest; GET config never returns it; a blank
  token on PUT keeps the existing one.
- **Opt-out:** manual send to `smsOptedOutAt` → 409; triggered → skipped (no row / a
  skipped outcome); no-phone → manual BadRequest, triggered skip.
- **Trigger hook:** an `auto` SMS template on the moved-to stage fires `sendSms(stage_auto)`;
  `prompt` returns `pendingSmsMessage`; the EXISTING email trigger still fires unchanged in
  the same move; a thrown SMS resolution does not fail the stage move.
- **Render:** `{{var}}` substitution in the SMS body.

## Global constraints

- Multi-tenant: all candidate_sms / candidate_sms_templates reads+writes via
  `TenantPrismaService.forTenant`; org config reads may use raw PrismaService on
  `organization` (non-RLS) exactly as EmailService does.
- New tenant tables ⇒ paired `_rls` (270001). Additive Organization/Candidate columns ⇒
  none. Migrations `270000/270001`, after parked self-booking `260000`. No seed.
- **No new npm dependency** (Twilio via `fetch`). No `npm install` in the worktree.
- Auth token encrypted via `OrgSecretsCryptoService`; never returned to any client.
- The provider NEVER fabricates delivery (copy EmailService's `deliverable` gate).
- `PermissionsGuard` is handler-only → `@RequirePermissions` per method.
- Web cannot import `@exam-platform/shared` VALUES at runtime.
- Do NOT change the existing email trigger behavior; the SMS hook is additive and fail-open.
