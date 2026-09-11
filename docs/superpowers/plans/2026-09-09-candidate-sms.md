# Candidate SMS Channel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An SMS-to-candidate channel mirroring the candidate-email channel (manual + templates + stage-triggered auto/prompt), with a separate SMS opt-out, provider-agnostic (Twilio via `fetch`), gated and inert-but-honest without credentials.

**Architecture:** `SmsService` (parallel to `EmailService`, with the same never-fabricate-delivery gate; Twilio REST via `fetch`, thin `twilio-transport.ts`). `CandidateSms` + `CandidateSmsTemplate` RLS tables mirror their email counterparts. `CandidateSmsService.sendSms` mirrors `sendMessage`. A fail-open SMS resolution is added beside the email trigger in `patchEntry`. Org config (encrypted Twilio token, write-only) + templates CRUD + manual send + opt-out surfaces, then web.

**Tech Stack:** NestJS + Prisma (SQL Server), Next.js (apps/web), `@exam-platform/shared` (TenantPrismaService, AuditService, OrgSecretsCryptoService), Jest. Twilio via global `fetch` (no new dep).

**Spec:** docs/superpowers/specs/2026-09-09-candidate-sms-design.md

## Global Constraints

- All `candidate_sms` / `candidate_sms_templates` reads+writes via `TenantPrismaService.forTenant`. Org-config reads may use raw `PrismaService` on the non-RLS `organization` table (exactly as `EmailService` does).
- New tenant tables ⇒ paired `_rls` migration. Additive `Organization`/`Candidate` columns ⇒ NONE. Migrations `20260909270000_candidate_sms` (cols + 2 tables) + `20260909270001_candidate_sms_rls` (RLS on the 2 tables), after parked self-booking `260000`. **No seed** (defaults are code).
- **No new npm dependency** — Twilio via global `fetch`. **NEVER `npm install`/`ci`/`update`** in the worktree. Only Task 1 runs `prisma migrate deploy` / `prisma generate`.
- The Twilio auth token is encrypted at rest via `OrgSecretsCryptoService` and NEVER returned to any client (write-only, like `smtpPasswordEncrypted`).
- The provider NEVER fabricates delivery — copy `EmailService`'s deliverable gate (refuse + log + `{success:false}` when unconfigured).
- `PermissionsGuard` is handler-only → `@RequirePermissions` per method.
- Web cannot import `@exam-platform/shared` VALUES at runtime; no `ui-v2` barrel import in new files.
- Do NOT change existing email-trigger behavior; the SMS trigger hook is additive + fail-open.
- Every commit verifies `git branch --show-current` == `feat/candidate-sms` in the same command.

---

### Task 1: Schema + migrations

**Files:**
- Modify: `apps/api/prisma/schema.prisma` (Organization +4 cols; Candidate +1 col + back-relation; 2 new models)
- Create: `apps/api/prisma/migrations/20260909270000_candidate_sms/migration.sql`
- Create: `apps/api/prisma/migrations/20260909270001_candidate_sms_rls/migration.sql`

**Interfaces:**
- Produces: `Organization.smsEnabled/smsAccountSid/smsAuthTokenEncrypted/smsFromNumber`; `Candidate.smsOptedOutAt` + `candidateSms` back-relation; models `CandidateSms`, `CandidateSmsTemplate` — consumed by T2-T6.

- [ ] **Step 1: Add columns + models to `schema.prisma`**

Copy the `Organization` additive cols, `Candidate.smsOptedOutAt`, and the two model blocks (`CandidateSms`, `CandidateSmsTemplate`) verbatim from the spec "Schema" section. Add `candidateSms CandidateSms[]` back-relation to `Candidate`. `CandidateSms.pipelineEntryId`/`templateId` are plain nullable columns (no relation). Look at the existing `CandidateEmail` + `CandidateEmailTemplate` models for the exact idioms (NVarChar(Max) bodies, index shapes).

- [ ] **Step 2: Write the table migration**

`20260909270000_candidate_sms/migration.sql`: an `ALTER TABLE [organizations] ADD` (sms_enabled BIT NOT NULL named-DEFAULT 0, sms_account_sid/sms_auth_token_encrypted/sms_from_number NVARCHAR NULL) + `ALTER TABLE [candidates] ADD sms_opted_out_at DATETIME2 NULL` + `CREATE TABLE [candidate_sms]` + `CREATE TABLE [candidate_sms_templates]` with indexes/FK (candidate_sms → candidates NoAction, matching CandidateEmail's FK choices). Grep the `candidate_emails` + `candidate_email_templates` CREATE TABLE migrations for the exact SQL-Server conventions and copy them.

- [ ] **Step 3: Write the RLS migration**

`20260909270001_candidate_sms_rls/migration.sql`: apply the org-scoped security policy + FILTER/BLOCK predicates to `candidate_sms` AND `candidate_sms_templates` only (NOT the organization/candidate additive columns). Copy the exact pattern from an existing two-table `_rls` migration (e.g. `job_board_publications_rls` or the candidate_emails rls if present).

- [ ] **Step 4: Apply + regenerate**

From `apps/api`: `npx prisma migrate deploy` then `npx prisma generate`. If a DLL lock from another session's `node dist/main` blocks generate, do NOT kill an unconfirmed process; report + retry.

- [ ] **Step 5: tsc + commit**

`npx tsc --noEmit` clean, then:
```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260909270000_candidate_sms apps/api/prisma/migrations/20260909270001_candidate_sms_rls
git commit -m "feat(candidate-sms): Organization/Candidate cols + CandidateSms + CandidateSmsTemplate tables + RLS"
```

---

### Task 2: SMS provider — `SmsService` + `twilio-transport.ts`

**Files:**
- Create: `apps/api/src/sms/twilio-transport.ts`
- Create: `apps/api/src/sms/sms.service.ts`
- Create: `apps/api/src/sms/sms.module.ts`
- Create: `apps/api/src/sms/twilio-transport.spec.ts`
- Create: `apps/api/src/sms/sms.service.spec.ts`

**Interfaces:**
- Consumes: T1 Organization SMS cols; `PrismaService`; `OrgSecretsCryptoService`.
- Produces: `SmsService.send(input: { to: string; body: string; organizationId: string }): Promise<{ success: boolean }>` — consumed by T3.

Model on `apps/api/src/email/email.service.ts` (deliverable gate + org-config resolve) and `apps/api/src/email/smtp-transport.ts` (isolated transport builder).

- [ ] **Step 1: `twilio-transport.ts` + failing tests**

Pure-ish transport: `sendTwilioSms({ accountSid, authToken, from, to, body }): Promise<{ ok: boolean; status?: number }>` — POST `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, header `Authorization: Basic ${base64(accountSid+':'+authToken)}`, `Content-Type: application/x-www-form-urlencoded`, body `new URLSearchParams({ To: to, From: from, Body: body })`. Return `{ ok: res.ok, status: res.status }`; catch → `{ ok:false }`. Take `fetch` via a parameter default (`fetchImpl = fetch`) so the spec injects a mock. Tests (mock fetch): correct URL/method/auth header/form body; 2xx → ok:true; 4xx/5xx → ok:false; network throw → ok:false. Run `npx jest --testPathPattern "src/sms/twilio-transport"` → FAIL then PASS.

- [ ] **Step 2: `SmsService` + failing tests**

`send(input)`:
- read org: `prisma.organization.findUnique({ where:{id: organizationId}, select:{ smsEnabled, smsAccountSid, smsAuthTokenEncrypted, smsFromNumber }})`.
- **deliverable gate:** if `!org?.smsEnabled || !org.smsAccountSid || !org.smsAuthTokenEncrypted || !org.smsFromNumber` → `logger.error('SMS_NOT_SENT: no Twilio configured for organization <id> ...')` and `return { success:false }` (NEVER call the transport).
- else decrypt token (`cryptoService.decrypt`), call `sendTwilioSms(...)`; return `{ success: result.ok }`; wrap in try/catch → log + `{success:false}`.
Tests (mock the transport + crypto): unconfigured (each missing field, and smsEnabled:false) → success:false AND transport NOT called; configured + transport ok → success:true, token decrypted, correct args; transport not-ok/throw → success:false. Run `npx jest --testPathPattern "src/sms/sms.service"` → green.

- [ ] **Step 3: module + tsc + commit**

`SmsModule` provides+exports `SmsService` (imports whatever module supplies `OrgSecretsCryptoService`/`PrismaService` — check how `EmailModule` wires them). `npx tsc --noEmit`. Commit:
```bash
git add apps/api/src/sms
git commit -m "feat(candidate-sms): SmsService + Twilio transport (deliverable gate, no fabricated delivery)"
```

---

### Task 3: `CandidateSmsService.sendSms` + manual send controller

**Files:**
- Create: `apps/api/src/candidate-sms/candidate-sms.service.ts` (+ `.spec.ts`)
- Create: `apps/api/src/candidate-sms/candidate-sms.controller.ts` (+ `.spec.ts`)
- Create: `apps/api/src/candidate-sms/candidate-sms.module.ts`
- Create: `apps/api/src/candidate-sms/dto/send-sms.dto.ts`
- Create: `apps/api/src/candidate-sms/sms-render.ts` (or reuse the email body renderer — see below)
- Modify: `apps/api/src/app.module.ts`

**Interfaces:**
- Consumes: T2 `SmsService`; T1 `CandidateSms`; `TenantPrismaService`, `AuditService`.
- Produces: `CandidateSmsService.sendSms(context, actorUserId, entryId, input: SendSmsInput)`, `listMessages`, `resend` — `sendSms` consumed by T6. `SendSmsInput { templateId?: string|null; body: string; source: 'manual'|'stage_prompt'|'stage_auto' }`.

Model on `apps/api/src/candidate-emails/candidate-emails.service.ts` (3-phase) + `.controller.ts`.

- [ ] **Step 1: Render helper**

SMS body needs `{{candidateName}}/{{jobTitle}}/{{orgName}}/{{recruiterName}}` substitution, no subject/links/HTML. Reuse `renderTemplate` from `candidate-emails/candidate-email-render.ts` if it can render a body alone (pass a dummy subject and use `.body`), OR add a tiny `renderSmsBody(body, vars)` in `sms-render.ts`. Prefer reuse; only add a helper if reuse is awkward. (Keep DRY.)

- [ ] **Step 2: Failing service tests**

Mirror `candidate-emails.service.spec.ts` mocking. Assert: opted-out (`smsOptedOutAt`) + manual → `ConflictException`; opted-out + `stage_auto` → returns null/skipped, NO row, NO SmsService.send; no phone + manual → `BadRequestException`; no phone + triggered → skipped; erased candidate → BadRequest; happy path → renders body, calls `SmsService.send`, creates a `CandidateSms` row (status from result, source, sentByUserId, toPhone), audits; does NOT call recomputeGlobalStage. Run `npx jest --testPathPattern "src/candidate-sms/candidate-sms.service"` → FAIL then PASS.

- [ ] **Step 3: Implement service**

3-phase (short tx prep → send outside tx → short tx log), copying `sendMessage`'s structure minus subject/links/unsubscribe/logo/signature and minus `recomputeGlobalStage`. Phase-1 loads entry+candidate+job, enforces erased/opt-out/no-phone. Phase-2 renders + `SmsService.send`. Phase-3 creates the row + audits. `resend` re-sends stored `renderedBody` as manual.

- [ ] **Step 4: Controller + module + register + tests**

Controller mirrors `candidate-emails.controller.ts`: `POST /candidate-sms/:entryId` (dto → `{...dto, source:'manual'}`), `GET /candidate-sms/:candidateId` (list), resend route — same permission gates as the email controller uses. `CandidateSmsModule` imports `SmsModule`; register in `app.module.ts`. Controller spec mirrors the email one. `npx tsc --noEmit`; `npx jest --testPathPattern "src/candidate-sms"` green.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/candidate-sms apps/api/src/app.module.ts
git commit -m "feat(candidate-sms): CandidateSmsService.sendSms + manual send controller"
```

---

### Task 4: SMS templates — service + defaults + controller

**Files:**
- Create: `apps/api/src/candidate-sms/candidate-sms-templates.service.ts` (+ `.spec.ts`)
- Create: `apps/api/src/candidate-sms/candidate-sms-templates.controller.ts` (+ `.spec.ts`)
- Create: `apps/api/src/candidate-sms/default-sms-templates.ts`
- Create: `apps/api/src/candidate-sms/dto/upsert-sms-template.dto.ts`
- Modify: `apps/api/src/candidate-sms/candidate-sms.module.ts` (provide+export the templates service)

**Interfaces:**
- Consumes: T1 `CandidateSmsTemplate`; `TenantPrismaService`.
- Produces: `CandidateSmsTemplatesService.resolveForStage(context, stageId): Promise<{ id: string|null; body: string; triggerMode: string } | null>`, plus list/upsert — `resolveForStage` consumed by T6.

Model on `apps/api/src/candidate-emails/candidate-email-templates.service.ts` + `default-templates.ts` + `dto/upsert-template.dto.ts` + the templates controller. Drop the `subject` field throughout (SMS has body only).

- [ ] **Step 1: Failing tests + defaults**

`default-sms-templates.ts`: a small set of code defaults keyed by trigger (mirror `default-templates.ts` shape, body-only, sensible short SMS copy). Template service spec mirrors the email one: list merges saved + defaults; upsert-by-stage dedupe; `resolveForStage` returns saved enabled row → default → null. Upsert DTO: `name`, `triggerStageId: string|null`, `triggerMode @IsIn(['manual','prompt','auto'])`, `body`. Run `npx jest --testPathPattern "src/candidate-sms/candidate-sms-templates"` → FAIL then implement → PASS.

- [ ] **Step 2: Implement service + controller + register**

Service mirrors `CandidateEmailTemplatesService` (list/upsert/resolveForStage), body-only. Controller mirrors `candidate-email-templates.controller.ts`, same per-method gating. Provide+export both from `CandidateSmsModule`. `npx tsc --noEmit`; scoped jest green.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/candidate-sms
git commit -m "feat(candidate-sms): SMS templates service + defaults + controller (resolveForStage)"
```

---

### Task 5: Org SMS config + opt-out endpoints

**Files:**
- Modify: `apps/api/src/organizations/organizations.service.ts` (+ `.spec.ts`) — SMS config get/put + candidate opt-out toggle (or the candidates service for opt-out — pick the module that already owns the analogous email-config / candidate-update path)
- Modify: `apps/api/src/organizations/organizations.controller.ts` (+ `.spec.ts`)
- Create: `apps/api/src/organizations/dto/update-sms-config.dto.ts`

**Interfaces:**
- Consumes: T1 Organization SMS cols + `Candidate.smsOptedOutAt`; `OrgSecretsCryptoService`.
- Produces: `GET/PUT /organizations/sms-config`; a candidate SMS opt-out toggle endpoint.

Model the config on how the existing SMTP/email org config is read/written (grep `smtpPasswordEncrypted` / `emailFromAddress` in `organizations.service.ts` for the encrypt-on-write / never-return-secret pattern).

- [ ] **Step 1: Failing tests**

- `getSmsConfig` returns `{ smsEnabled, smsAccountSid, smsFromNumber, configured }` and NEVER `smsAuthTokenEncrypted`/the token. `configured` = all of accountSid+token+fromNumber present.
- `putSmsConfig`: a non-blank `smsAuthToken` → stored encrypted (`cryptoService.encrypt` called; ciphertext persisted, not plaintext); a blank/omitted token → existing `smsAuthTokenEncrypted` unchanged; sets enabled/accountSid/fromNumber.
- opt-out toggle sets/clears `Candidate.smsOptedOutAt` (org-scoped via forTenant).
Run the org service spec scoped → FAIL then PASS.

- [ ] **Step 2: Implement + gate + tests**

DTO `update-sms-config.dto.ts`: `smsEnabled?: boolean`, `smsAccountSid?: string`, `smsFromNumber?: string`, `smsAuthToken?: string`. Service methods as above (config reads raw org; opt-out via forTenant on candidates — RLS). Controller routes per-method gated `org:manage_settings` (config) and the appropriate existing gate for the candidate opt-out (match how other candidate mutations are gated). Controller specs assert gating + delegation + that GET never includes the token.

- [ ] **Step 3: tsc + commit**

`npx tsc --noEmit`; `npx jest --testPathPattern "src/organizations"` green. Commit:
```bash
git add apps/api/src/organizations
git commit -m "feat(candidate-sms): org SMS config (encrypted, write-only token) + candidate opt-out"
```

---

### Task 6: Pipeline stage-trigger SMS hook

**Files:**
- Modify: `apps/api/src/pipeline/pipeline.service.ts` (+ `.spec.ts`)
- Modify: `apps/api/src/pipeline/pipeline.module.ts` (inject the two new deps if needed)

**Interfaces:**
- Consumes: T4 `CandidateSmsTemplatesService.resolveForStage`, T3 `CandidateSmsService.sendSms`.
- Produces: `pendingSmsMessage` on `patchEntry`'s return (alongside `pendingMessage`).

- [ ] **Step 1: Failing tests**

Extend `pipeline.service.spec.ts` (it already mocks `templates.resolveForStage` + `messages.sendMessage`). Add mocked `smsTemplates.resolveForStage` + `candidateSms.sendSms`. Assert, on a stage move to a comms stage: an `auto` SMS template → `candidateSms.sendSms(context, null, entryId, { templateId, body, source:'stage_auto' })` fired; a `prompt` SMS template → return includes `pendingSmsMessage:{templateId,body}` and `sendSms` NOT called; null SMS template → neither; **the EXISTING email trigger (auto fires sendMessage / prompt returns pendingMessage) still behaves exactly as today in the same move** (regression — keep the existing trigger tests passing and add a test where BOTH an email prompt and an SMS prompt are returned); a thrown `smsTemplates.resolveForStage` does NOT fail the stage move (fail-open). Run `npx jest --testPathPattern "src/pipeline/pipeline.service"` → FAIL then implement → PASS.

- [ ] **Step 2: Implement**

In `patchEntry`, in the SAME post-commit try block (or a sibling try with identical fail-open wrapping) as the email hook, add: `const smsTpl = await this.smsTemplates.resolveForStage(context, commsStageId);` then `auto` → fire-and-forget `this.candidateSms.sendSms(context, null, entryId, {templateId: smsTpl.id, body: smsTpl.body, source:'stage_auto'}).catch(log)`; `prompt` → merge `pendingSmsMessage` into the return. Do NOT alter the email resolution/return. Inject `CandidateSmsTemplatesService` + `CandidateSmsService` into `PipelineService` (constructor) and wire `PipelineModule` imports the same way `templates`/`messages` are wired. Watch for a circular import (pipeline ↔ candidate-sms): if `CandidateSmsService` needs nothing from pipeline, a one-way import is fine; else use `forwardRef` as the email side does if it does.

- [ ] **Step 3: tsc + full pipeline suite + commit**

`npx tsc --noEmit`; `npx jest --testPathPattern "src/pipeline"` (all green — no email-trigger regression). Commit:
```bash
git add apps/api/src/pipeline
git commit -m "feat(candidate-sms): stage-trigger SMS hook in patchEntry (fail-open, additive to email)"
```

---

### Task 7: Web — config card, templates editor, send/history/opt-out, stage prompt

**Files:**
- Create: `apps/web/src/hooks/useCandidateSms.ts` (or the app's hook location — mirror `useCandidateEmails`/the email hook)
- Modify/Create: the Integrations settings SMS config card
- Modify/Create: the SMS templates editor (mirror the email templates editor)
- Modify: the candidate drawer (Send-SMS action + history + opt-out toggle + stage-prompt)
- Tests mirroring the email equivalents where they exist

**Interfaces:** consumes the T3/T4/T5 endpoints.

- [ ] **Step 1: Locate the email-web equivalents**

Grep `apps/web` for the candidate-email send UI, the email templates editor, and the email/SMTP config card. Mirror each for SMS (body-only templates; write-only auth token showing "Configured"; Send-SMS disabled with a hint when no phone or opted out).

- [ ] **Step 2: Config card + templates editor**

Integrations SMS config card (enabled toggle, Account SID, Auth Token [write-only], From number) via `apiFetch` to `/organizations/sms-config`. SMS templates editor mirroring the email one (no subject). Deep-import UI components (no ui-v2 barrel). Add a test mirroring the email templates/config test if one exists.

- [ ] **Step 3: Candidate drawer**

Send-SMS action (body / pick template; POST `/candidate-sms/:entryId`), SMS history list (`GET /candidate-sms/:candidateId`), opt-out toggle, and render the stage-move SMS prompt when `pendingSmsMessage` is returned by the patch-entry response (alongside the existing email prompt).

- [ ] **Step 4: tsc + scoped web tests + commit**

`npx tsc --noEmit` (web); scoped jest green (allow only the known pre-existing ImpersonationBanner failure). Commit:
```bash
git add apps/web
git commit -m "feat(candidate-sms): web SMS config, templates, send/history/opt-out, stage prompt"
```

---

## Self-review notes

- **Spec coverage:** T1 schema (cols no _rls + 2 tables _rls); T2 provider+transport (deliverable gate, no fabricated delivery); T3 sendSms (opt-out/no-phone/render/log, no recompute); T4 templates+defaults+resolveForStage; T5 encrypted config + opt-out; T6 fail-open trigger hook additive to email; T7 web. All spec sections mapped.
- **Correctness/security-critical (extra review scrutiny, opus):** T2 (never-fabricate + secret decrypt), T5 (token encryption, never-leak), T6 (must not break email triggers; fail-open).
- **No new dep** (Twilio via fetch); **no seed**; migrations `270000/270001` linear after parked `260000`.
- **Type/name consistency:** `SendSmsInput` (T3) used by T6; `resolveForStage` return `{id,body,triggerMode}` (T4) used by T6; `SmsService.send` shape (T2) used by T3.
