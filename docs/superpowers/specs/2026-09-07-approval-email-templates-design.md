# Approval-Email Templates (Zoho #9, slice 2) — Design

**Date:** 2026-09-07
**Status:** Approved (design), pending spec review
**Zoho adopt:** #9 (Templates), slice 2 of 4. Slice 1 (named offer templates) is on branch feat/offer-templates. Remaining after this: sender addresses, unsubscribe/opt-out.
**Branch:** `feat/approval-email-templates` (off origin/main @ `fec52f3c`)

## Goal

Let an org customize the EMAIL copy for approval-workflow events (a request needs approval / approved / rejected / cancelled), replacing the generic auto-rendered email with an org-authored subject + body that supports variable substitution. Behavior-preserving when an org configures nothing.

## Scope

**In:** A per-org, per-event `ApprovalEmailTemplate` (subject/body/enabled) for the four approver/submitter-facing approval events; variable substitution (`{{actorName}}`, `{{subjectLabel}}`, `{{contextText}}`, `{{link}}`); a render branch in the notification email path with a generic fallback; org-admin CRUD API + settings page + nav.

**Out (deferred / not this slice):**
- The admin-facing `approval.step_skipped` email stays generic (internal ops notice).
- The **in-app** notification is unchanged (label-based); templates affect the **email channel only**.
- No new variables beyond the four; no rich HTML editor / no per-recipient personalization beyond the four vars.
- Other #9 slices (sender addresses, unsubscribe).

## Decisions (rulings baked in)

1. **Four event types:** `approval.requested`, `approval.approved`, `approval.rejected`, `approval.cancelled` (the values already in `APPROVAL_NOTIFICATION_TYPES`, `packages/shared/src/approvals/approval-types.ts`). `approval.step_skipped` is excluded (admin/internal).
2. **Fallback = behavior-preserving.** If the org has no template for the event, or the template is disabled, the email uses the existing `renderNotificationEmail` generic path — orgs that configure nothing see zero change.
3. **Thread `subjectLabel`.** Approval emails currently can't name what's being approved (only `actorName`/`contextText`/`link` reach the renderer). `approvals.service` resolves a `subjectLabel` (requisition → job title; offer → candidate name) and threads it through the notify `target` into the email input. Without it templates are near-useless.
4. **Email-only, variable set fixed** to `{{actorName}}`, `{{subjectLabel}}`, `{{contextText}}`, `{{link}}`. A small shared `{{var}}` substitution helper (mirroring the offer/candidate render approach); unknown `{{tokens}}` render as empty (documented), never throw.
5. **Config gated `approvals:configure`** (the permission the approvals config already uses — no new permission, no seed change).
6. **New tenant table** → paired `_rls` migration (a security-policy statement can't share the CREATE TABLE batch).

## Architecture

### Schema (new tenant table)

```prisma
model ApprovalEmailTemplate {
  id             String   @id @default(uuid()) @db.UniqueIdentifier
  organizationId String   @map("organization_id") @db.UniqueIdentifier
  eventType      String   @map("event_type") @db.NVarChar(50) // one of the 4 approval.* types
  subject        String   @db.NVarChar(Max)
  body           String   @db.NVarChar(Max)
  enabled        Boolean  @default(true)
  createdAt      DateTime @default(now()) @map("created_at")
  updatedAt      DateTime @updatedAt @map("updated_at")

  @@unique([organizationId, eventType])
  @@index([organizationId])
  @@map("approval_email_templates")
}
```
Migrations: `20260907170000_approval_email_templates` (CREATE TABLE) + `20260907170001_approval_email_templates_rls` (ALTER SECURITY POLICY dbo.TenantAccessPolicy ADD FILTER PREDICATE + the BLOCK predicates on `organization_id`, matching the pattern of prior new-tenant-table `_rls` migrations, e.g. user_groups/custom_fields). No seed.

### Shared

- `packages/shared/src/approvals/approval-types.ts` (existing): add `APPROVAL_EMAIL_EVENT_TYPES` = the four values (single source; reuse the existing `APPROVAL_NOTIFICATION_TYPES` constants) + `isApprovalEmailEventType(type): boolean`.
- Substitution: a tiny pure helper `renderTemplateString(tpl: string, vars: Record<string,string>): string` replacing `{{key}}` with `vars[key] ?? ''` (HTML-escaping is the caller's concern — see render path). If an equivalent already exists for offer/candidate templates, reuse it instead of adding a second.

### Notify path enrichment (apps/api/src/notifications)

- `notify(context, actorUserId, recipientUserIds, type, target)` — extend the `target` type (MentionTarget) with optional `subjectLabel?: string`.
- Inside the existing pre-commit `forTenant` block: when `isApprovalEmailEventType(type)`, also fetch the org's `ApprovalEmailTemplate` for `type` (a single `findFirst`), and return it alongside `{ outbox, actorName }`.
- In the post-commit send: for each recipient whose pref allows the email, if an enabled approval template was fetched, render subject/body via `renderTemplateString` with vars `{ actorName: actorName ?? 'Someone', subjectLabel: target.subjectLabel ?? '', contextText: target.contextText ?? '', link: `${appBaseUrl}${target.linkPath}` }`, wrap the body in the same minimal HTML shell + footer `renderNotificationEmail` uses (HTML-escape the substituted values in the HTML rendering; the subject is plain text). Otherwise call `renderNotificationEmail` as today. The email-pref check (`resolveEmailEnabledByType`) and best-effort post-commit semantics are unchanged.

### approvals.service (resolve + pass subjectLabel)

At each approval `notify(...)` call for the four events (submit → `requested`; decide → `approved`/`rejected`; cancel → `cancelled`), resolve a `subjectLabel`:
- requisition (`subjectType === 'job'`) → the job's `title`.
- offer (`subjectType === 'offer'`) → the offer's candidate `name` (via the offer's pipeline entry → candidate).
Resolve within the existing tenant reads (no extra round-trips where the row is already loaded; one cheap lookup otherwise) and pass it as `target.subjectLabel`. Do NOT change `decide()`'s authorization or the approval engine — only enrich the notification target.

### Config API

New `approval-email-templates` controller + service (or fold into the approvals config module — mirror the existing approvals-config controller):
- `GET /approval-email-templates` → the four event slots, each with the org's template (or a null/default indicator) — so the UI can render all four even when unset.
- `PUT /approval-email-templates/:eventType` → upsert-by-(org,eventType) `{ subject, body, enabled }`; validate `eventType` ∈ the four (400 otherwise); audit `approval_email_template.saved`.
- Both gated `@RequirePermissions('approvals:configure')` (per-method — the guard is handler-only).

### Web

- Hook `useApprovalEmailTemplates` (list) + `useUpsertApprovalEmailTemplate`.
- Settings page `/settings/approval-emails` (or under the existing approvals settings): the four event slots, each an editor (subject, body, enabled) with a note listing the available `{{variables}}`. Mirror an existing settings page shell (message-templates / business-hours).
- Nav registration in super-admin-nav + staff-nav V2_ROUTES.

## Data flow

1. Org admin saves a template for `approval.approved` with body `Your requisition for {{subjectLabel}} was approved by {{actorName}}. {{link}}`.
2. A submitter's requisition is approved → `approvals.service.decide` resolves `subjectLabel = job.title`, calls `notify(..., approval.approved, { ..., subjectLabel })`.
3. `notify` (in-tx) fetches the org's enabled `approval.approved` template; (post-commit) renders it with the vars and emails it.
4. An org with no `approval.approved` template → the generic `renderNotificationEmail` email (unchanged).

## Error handling

- Unknown `{{token}}` → empty string (never throws).
- Template fetch failure or render error inside the best-effort post-commit block → logged, falls back to nothing sent for that email (same best-effort semantics as today; never surfaces out of notify).
- `eventType` not in the four → 400 on the config PUT.
- Disabled template → treated as no template (generic fallback).

## Testing

- **Shared:** `APPROVAL_EMAIL_EVENT_TYPES` contents + `isApprovalEmailEventType`; `renderTemplateString` ({{var}} substitution, missing-var→empty, no-throw) — its own jest if in packages/shared.
- **notify path (api):** with an enabled template → email uses the rendered subject/body (vars substituted, HTML-escaped); without/disabled → generic `renderNotificationEmail` (assert the fallback); non-approval types never hit the template lookup; the in-tx template fetch only runs for approval types; email-pref off → no send (unchanged). Assert `subjectLabel` flows into the rendered output.
- **approvals.service:** submit/decide/cancel pass the correct `subjectLabel` (job title / offer candidate name) into the notify target; `decide()` authorization untouched (existing tests stay green).
- **Config:** GET returns four slots; PUT upserts + validates eventType (400) + audits; gated `approvals:configure`.
- **Web:** page renders four editors, save fires upsert; nav present.
- Full api + shared jest green; tsc clean.

## Deploy notes

- Two migrations (table + `_rls`); no seed change (`approvals:configure` already exists). Behavior-preserving: no templates configured = today's generic approval emails. Ships with any api build; web page needs any web build. No exam-day deploy.
