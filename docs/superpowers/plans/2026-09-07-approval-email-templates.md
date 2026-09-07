# Approval-Email Templates (Zoho #9, slice 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let orgs customize the EMAIL copy for the four approver/submitter-facing approval events, with `{{variable}}` substitution, falling back to today's generic email when unconfigured.

**Architecture:** New per-org/per-event `ApprovalEmailTemplate`; the notification email path (`notify()`) fetches the org's enabled template for approval events and renders it with substitution, else uses the existing `renderNotificationEmail`; `approvals.service` threads a `subjectLabel` (job title / offer candidate name) into the notify target so templates can name the subject. In-app notifications and `decide()` authorization are untouched.

**Tech Stack:** NestJS, Prisma, SQL Server (RLS), Next.js (apps/web), Jest.

**Spec:** docs/superpowers/specs/2026-09-07-approval-email-templates-design.md

## Global Constraints

- **Base:** branch `feat/approval-email-templates` off origin/main @ `fec52f3c`. Work in the main checkout, NOT a worktree (junction disk-fill hazard).
- **NEVER** run `npm install` / `npm ci` / `npm update`. Use only `npx prisma generate` / `npx prisma migrate deploy` / existing `jest` / `tsc`. Rebuild the shared dist with its BUILD script when shared code changes.
- **`packages/shared` has its OWN jest runner** — run it for shared changes (T2), and rebuild the dist after.
- **New tenant table → paired `_rls` migration** (a security-policy statement can't share the CREATE TABLE batch). Migration numbers `20260907170000` (table) + `20260907170001` (rls). `NVARCHAR(Max)` for subject/body, `NVARCHAR(50)` for eventType. No seed change.
- **Four event types only:** `approval.requested`, `approval.approved`, `approval.rejected`, `approval.cancelled` (the values in `APPROVAL_NOTIFICATION_TYPES`, packages/shared/src/approvals/approval-types.ts). `approval.step_skipped` excluded.
- **Behavior-preserving fallback:** no template for the event, or disabled → the existing `renderNotificationEmail` generic email. Orgs that configure nothing see no change.
- **Email channel only.** The in-app `UserNotification` row and its rendering are unchanged. `notify()`'s best-effort post-commit semantics, `resolveEmailEnabledByType` pref check, and the actor-drop behavior are all preserved.
- **Do NOT change `decide()` authorization or the approval engine** — only enrich the notification `target` with `subjectLabel`.
- **Gating:** config routes carry per-method `@RequirePermissions('approvals:configure')` (this repo's PermissionsGuard reads handler-level only). No new permission, no seed.
- **Substitution:** unknown `{{token}}` → empty string, never throws. HTML-escape substituted values in the HTML body; subject is plain text.
- Attribution footer on every commit: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

### Task 1: Schema — ApprovalEmailTemplate + migration + _rls

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260907170000_approval_email_templates/migration.sql`
- Create: `apps/api/prisma/migrations/20260907170001_approval_email_templates_rls/migration.sql`

**Interfaces:**
- Produces: `ApprovalEmailTemplate` model + `approval_email_templates` table (tenant-scoped, RLS-protected).

- [ ] **Step 1: Add the model** (exact fields from the spec): id, organizationId, eventType (`@db.NVarChar(50)`), subject/body (`@db.NVarChar(Max)`), enabled (`@default(true)`), createdAt, updatedAt; `@@unique([organizationId, eventType])`, `@@index([organizationId])`, `@@map("approval_email_templates")`.

- [ ] **Step 2: Table migration** `20260907170000_approval_email_templates/migration.sql` — `CREATE TABLE [dbo].[approval_email_templates] (...)` with the columns, PK, and the unique index on (organization_id, event_type). Model it on a recent new-tenant-table CREATE (e.g. `20260906100000_user_groups`).

- [ ] **Step 3: RLS migration** `20260907170001_approval_email_templates_rls/migration.sql` — `ALTER SECURITY POLICY [dbo].[TenantAccessPolicy] ADD FILTER PREDICATE dbo.fn_tenant_access_predicate([organization_id]) ON [dbo].[approval_email_templates], ADD BLOCK PREDICATE ... AFTER INSERT, ADD BLOCK PREDICATE ... AFTER UPDATE ...` — copy the EXACT predicate shape + statement/batch convention from a prior new-tenant-table `_rls` migration (e.g. `20260906100001_user_groups_rls`). Do not weaken the existing policy; only ADD predicates for the new table.

- [ ] **Step 4: Apply + regenerate.** From `apps/api`: `npx prisma migrate deploy` then `npx prisma generate`. Then `npx tsc -p apps/api/tsconfig.json --noEmit`. Expected: both migrations applied, client has the model, tsc clean.

- [ ] **Step 5: Commit.**
```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260907170000_approval_email_templates apps/api/prisma/migrations/20260907170001_approval_email_templates_rls
git commit -m "feat(approval-email-templates): ApprovalEmailTemplate table + RLS"
```

---

### Task 2: Shared — event-type registry + substitution helper

**Files:**
- Modify: `packages/shared/src/approvals/approval-types.ts`
- Possibly create: `packages/shared/src/templates/render-template-string.ts` (only if no reusable helper exists — see Step 1)
- Modify: `packages/shared/src/index.ts` (barrel, if a new file is added)
- Test: shared spec(s) for the above

**Interfaces:**
- Produces: `APPROVAL_EMAIL_EVENT_TYPES: readonly string[]` (the four), `isApprovalEmailEventType(type: string): boolean`, and a `{{var}}` substitution function (reused or new).

- [ ] **Step 1: Substitution helper — reuse or add.** Inspect `apps/api/src/offers/offer-render.ts` (`renderOfferTemplate`). If its core is a generic `{{key}}` → value replace, extract/expose a shared `renderTemplateString(tpl, vars)` (in packages/shared) and have the offer renderer keep working (don't break it — if extraction is risky, DON'T refactor the offer path; just add the new shared helper). If it's offer-specific, add `renderTemplateString(tpl: string, vars: Record<string,string>): string` in packages/shared that replaces `{{\s*key\s*}}` with `vars[key] ?? ''` (missing → empty, never throws). Keep it pure and HTML-agnostic (escaping is the caller's job).

- [ ] **Step 2: Write failing shared tests** for `renderTemplateString` (substitutes known vars; missing var → empty; leaves non-`{{}}` text intact; no throw on unmatched braces) and for `APPROVAL_EMAIL_EVENT_TYPES`/`isApprovalEmailEventType` (contains exactly the four; false for `approval.step_skipped`, mentions, empty, null).

Run (shared jest): `npx jest render-template-string approval-types --config packages/shared/jest.config.js` (adjust to the repo's shared-jest invocation). Expected: FAIL.

- [ ] **Step 3: Implement** `APPROVAL_EMAIL_EVENT_TYPES` (derive from the existing `APPROVAL_NOTIFICATION_TYPES` values — single source, don't hardcode a second copy of the strings) + `isApprovalEmailEventType`, and the helper. Barrel-export any new file.

- [ ] **Step 4: Run shared tests GREEN**, rebuild the shared dist, then `npx tsc -p apps/api/tsconfig.json --noEmit`. Expected: PASS + clean.

- [ ] **Step 5: Commit.**
```bash
git add packages/shared/src
git commit -m "feat(approval-email-templates): shared event-type registry + template substitution"
```

---

### Task 3: notify() enrichment — subjectLabel + template render branch

**Files:**
- Modify: `apps/api/src/notifications/notifications.service.ts` (`MentionTarget`, `notify`)
- Possibly modify: `apps/api/src/notifications/notification-email-render.ts` (reuse its HTML shell/footer for the template body)
- Test: `apps/api/src/notifications/notifications.service.spec.ts`

**Interfaces:**
- Consumes: `ApprovalEmailTemplate` (T1), `isApprovalEmailEventType` + `renderTemplateString` (T2).
- Produces: `MentionTarget.subjectLabel?: string`; approval emails render from an enabled org template when present.

- [ ] **Step 1: Extend `MentionTarget`** with `subjectLabel?: string`.

- [ ] **Step 2: Fetch the template in-tx.** In the existing pre-commit `forTenant` block, when `isApprovalEmailEventType(type)`, `findFirst` the org's `approvalEmailTemplate` for `{ organizationId, eventType: type }`; return it alongside `{ outbox, actorName }` (e.g. `approvalTemplate`). Only fetch for approval event types (no extra query otherwise).

- [ ] **Step 3: Render branch in the post-commit send.** For each recipient whose pref allows the email: if `approvalTemplate` is present AND `approvalTemplate.enabled`, build `vars = { actorName: actorName ?? 'Someone', subjectLabel: target.subjectLabel ?? '', contextText: target.contextText ?? '', link: `${appBaseUrl}${target.linkPath}` }`; `subject = renderTemplateString(approvalTemplate.subject, vars)` (plain text); `html = <shell>` + `renderTemplateString(approvalTemplate.body, htmlEscapedVars)` + the same footer `renderNotificationEmail` uses (HTML-escape each var value before substituting into the HTML body). Else call `renderNotificationEmail(typeDef, {...})` exactly as today. Preserve the pref filter, best-effort try/catch, and actor-drop.

- [ ] **Step 4: Write/extend tests** (write the failing assertions first where practical): enabled template → email uses rendered subject/body with vars substituted and HTML-escaped, subjectLabel included; no template → generic `renderNotificationEmail` (assert fallback path/output unchanged); disabled template → generic fallback; a non-approval type (e.g. a mention) → template lookup NOT performed and generic render used; pref off → no send. Mirror the existing notifications.service.spec mocking of `forTenant`/`emailService`.

Run: `npx jest notifications.service`. Expected: PASS.

- [ ] **Step 5: tsc + commit.** `npx tsc -p apps/api/tsconfig.json --noEmit`.
```bash
git add apps/api/src/notifications
git commit -m "feat(approval-email-templates): render org approval template in notify email path"
```

---

### Task 4: approvals.service — resolve + pass subjectLabel

**Files:**
- Modify: `apps/api/src/approvals/approvals.service.ts`
- Test: `apps/api/src/approvals/approvals.service.spec.ts`

**Interfaces:**
- Consumes: `MentionTarget.subjectLabel?` (T3).

- [ ] **Step 1: Resolve `subjectLabel` at each approval notify site.** For the four events (submit → `requested`; decide → `approved`/`rejected`; cancel → `cancelled`): resolve the label — requisition (`subjectType === 'job'`) → job `title`; offer (`subjectType === 'offer'`) → the offer's candidate `name` (offer → pipelineEntry → candidate). Use rows already loaded where possible; otherwise one cheap `findFirst`/`select` within the existing `forTenant` scope. Pass it as `target.subjectLabel` on each `notify(...)` call. Locate all approval `notify` sites (grep `APPROVAL_NOTIFICATION_TYPES` / `this.notifications.notify` in the file — submit ~line 188, decide ~307, and the cancel path).

- [ ] **Step 2: Do NOT touch `decide()` authorization** or `resolveSteps`/the engine — only add the label resolution + target field. Existing approval tests must stay green.

- [ ] **Step 3: Tests** — assert submit/decide/cancel call `notify` with the correct `subjectLabel` (job title for requisition, candidate name for offer). Extend the existing approvals.service.spec; keep all prior assertions (esp. decide authorization) intact.

Run: `npx jest approvals.service`. Expected: PASS.

- [ ] **Step 4: tsc + full api suite + commit.** `npx tsc -p apps/api/tsconfig.json --noEmit` + `npx jest` (apps/api).
```bash
git add apps/api/src/approvals
git commit -m "feat(approval-email-templates): thread subjectLabel into approval notifications"
```

---

### Task 5: Config API — CRUD (list + upsert)

**Files:**
- Create: `apps/api/src/approvals/approval-email-templates.service.ts`
- Modify: `apps/api/src/approvals/approvals-config.controller.ts` (add the routes) OR create a dedicated controller — mirror the existing ApprovalsConfigController.
- Create: `apps/api/src/approvals/dto/upsert-approval-email-template.dto.ts`
- Modify: the approvals module (register the service)
- Test: controller spec + service spec

**Interfaces:**
- Consumes: `ApprovalEmailTemplate` (T1), `APPROVAL_EMAIL_EVENT_TYPES`/`isApprovalEmailEventType` (T2).
- Produces: `GET /approval-email-templates` (four slots), `PUT /approval-email-templates/:eventType`.

- [ ] **Step 1: Service.** `list(context)` → for each of the four event types, the org's template or a null indicator (return all four slots so the UI can render them). `upsert(context, actorUserId, eventType, dto)` → validate `isApprovalEmailEventType(eventType)` (else BadRequest), upsert-by-(org,eventType) `{ subject, body, enabled }`, audit `approval_email_template.saved`. Tenant-scoped via `forTenant`.

- [ ] **Step 2: DTO.** `UpsertApprovalEmailTemplateDto { @IsString() subject; @IsString() body; @IsOptional() @IsBoolean() enabled? }`.

- [ ] **Step 3: Write failing controller spec** — GET → list (four slots); PUT `/:eventType` → upsert; both carry per-method `@RequirePermissions('approvals:configure')` (assert via Reflector); bad eventType → 400. Run `npx jest approval-email-templates`. Expected: FAIL.

- [ ] **Step 4: Controller + module.** Add the two routes (per-method `@RequirePermissions('approvals:configure')`, `@CurrentTenant()`/`@CurrentUserId()`); register the service in the approvals module. Route path: mount so the paths are `/approval-email-templates` and `/approval-email-templates/:eventType` (check the controller's existing route prefix and adjust so these resolve as intended; avoid `:eventType` shadowing the list route — different verb/path so fine).

- [ ] **Step 5: Run specs + tsc + commit.** `npx jest approval-email-templates` + `npx tsc -p apps/api/tsconfig.json --noEmit`.
```bash
git add apps/api/src/approvals
git commit -m "feat(approval-email-templates): CRUD config API gated approvals:configure"
```

---

### Task 6: Web — settings page + hook + nav

**Files:**
- Create: `apps/web/lib/hooks/useApprovalEmailTemplates.ts`
- Create: `apps/web/app/v2/(org-admin)/settings/approval-emails/page.tsx`
- Modify: `apps/web/lib/super-admin-nav.ts` + `apps/web/lib/staff-nav.ts`
- Test: `apps/web/app/v2/(org-admin)/settings/approval-emails/page.test.tsx`

**Interfaces:**
- Consumes: the T5 endpoints.

- [ ] **Step 1: Hook** — `useApprovalEmailTemplates()` (GET four slots) + `useUpsertApprovalEmailTemplate()` (PUT `/:eventType` `{subject,body,enabled}`; invalidate the list on success). Mirror an existing settings hook; no `@exam-platform/shared` runtime-value import (inline the four event labels web-side if needed for display).

- [ ] **Step 2: Failing page test** — renders the four event editors from a mocked list; editing + Save fires upsert with the right eventType + body; enable toggle included. Mirror an existing settings page test. Run `npx jest approval-emails` (web). Expected: FAIL.

- [ ] **Step 3: Page** — four labeled sections (one per event), each with subject/body fields + enabled toggle + Save, and a note listing the `{{variables}}` (`{{actorName}}`, `{{subjectLabel}}`, `{{contextText}}`, `{{link}}`). Use existing v2 primitives + the established settings-page shell (message-templates / business-hours). Import Button/TextField directly if the ui-v2 barrel is a Jest hazard (known pattern).

- [ ] **Step 4: Nav** — `super-admin-nav.ts`: add `{ href: '/settings/approval-emails', label: 'Approval Emails', icon: <a lucide icon, imported> }`; `staff-nav.ts`: add `'/settings/approval-emails'` to `V2_ROUTES`.

- [ ] **Step 5: Run tests + tsc + commit.** `npx jest approval-emails` (web); web suite (note only the known pre-existing ImpersonationBanner failure); `npx tsc -p apps/web/tsconfig.json --noEmit` (ignore pre-existing stale `.next/types` noise; no NEW errors).
```bash
git add apps/web/lib apps/web/app/v2/'(org-admin)'/settings/approval-emails
git commit -m "feat(approval-email-templates): settings page + hook + nav"
```

---

## Self-Review

**Spec coverage:** table+RLS (T1) ✓; event-type registry + substitution helper (T2) ✓; notify render branch + subjectLabel field + fallback (T3) ✓; approvals.service subjectLabel resolution (T4) ✓; CRUD API (T5) ✓; web (T6) ✓. In-app unchanged + decide() untouched are constraints honored in T3/T4.

**Placeholder scan:** No TBD. T2's helper is "reuse offer-render's mechanism if generic, else add a pure shared fn" (concrete, with a don't-break-offers guard). T1's `_rls` says "copy the exact predicate shape from user_groups_rls." T4 says "locate all approval notify sites (grep)" with the known line numbers as hints.

**Type/name consistency:** `APPROVAL_EMAIL_EVENT_TYPES` single-sources the four from `APPROVAL_NOTIFICATION_TYPES` (T2), consumed by T3 (fetch gate), T5 (validation). `MentionTarget.subjectLabel?` defined T3, set T4. Endpoints `GET /approval-email-templates` + `PUT /:eventType` match T5↔T6. `renderTemplateString` defined T2, used T3. Migrations 170000/170001 unique/ordered.

**Load-bearing risks:** (a) fallback must be exact — T3 asserts the generic path for no/disabled/non-approval; (b) decide() authorization must not change — T4 keeps existing tests green + doesn't touch the engine; (c) the in-tx template fetch must be gated to approval types only (no extra query for mentions/assignments) — T3 Step 2.
