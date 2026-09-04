# Notification Email Channel — Design Spec

**Date:** 2026-09-04
**Status:** Approved design, ready for implementation planning.
**Source:** Zoho adopt inventory #1 — Notification Settings (per-user event × channel matrix + email channel). See `docs/ats/zoho-adopt-inventory.md`.

## Goal

Deliver in-app staff notifications by **email** as well as the bell, controlled by a **per-user, per-notification-type** preference (email defaults **ON**). Email is a purely additive channel over the existing `NotificationsService` — the in-app bell is unchanged.

## Why

Mentions, teammate assignment, and approval requests/decisions today only create an in-app `UserNotification` (the bell). Anyone not actively looking at the app never learns of them. Adding an email channel activates the day-to-day value of already-shipped collaboration and approvals features. It reuses the existing `EmailService` (per-org SMTP, working in prod) and the single `notify()` choke point, so the change is small.

## Decisions (locked during brainstorming)

1. **Granularity:** per-notification-**type** email preference. Toggles grouped in the UI as Mentions / Assignments / Approvals.
2. **Default:** email **ON**. New and existing users receive email until they opt a type out (sparse storage — only opt-OUT rows are stored).
3. **Cadence:** **immediate**, one email per event (1:1 with the bell). No digest, no burst-coalescing in v1.
4. **Delivery mechanism:** **inline, best-effort, after the notification transaction commits** (Approach A). No new queue/worker. `EmailService` already catches its own errors and refuses undeliverable mail.

## Existing code this builds on

- `apps/api/src/notifications/notifications.service.ts` — `NotificationsService.notify(context, actorUserId, recipientUserIds, type, target)` is the **single choke point**: every notification (bell) is created here inside `tenantPrisma.forTenant(context, tx => …)`, which already does `tx.user.findMany({ where: { id: { in: ids }, organizationId }, select: { id } })` and creates one `UserNotification` per valid recipient. It also drops the actor from their own recipient list.
- `apps/api/src/email/email.service.ts` — `EmailService.send({ to, subject, html, organizationId }): Promise<{ success, previewUrl? }>`. Resolves the org's SMTP (falls back to platform SMTP); **never throws** (returns `{ success: false }` on failure) and refuses to relay undeliverable mail. This is the delivery primitive; reuse verbatim.
- `apps/api/prisma/schema.prisma` — `User` has `email` (line ~147) and `name`; `UserNotification` model (line ~599) with `type`, `entityType`, `entityId`, `contextText`, `linkPath`, `readAt`.
- Notification call sites / the full type catalog (all route through `notify()`):
  - `pipeline.service.ts:893` → `createMentions` → `mention`
  - `pipeline.service.ts:933` → `notify(..., 'assigned', ...)`
  - `approvals.service.ts:307/309/311` → `approval.requested` / `approval.approved` / `approval.rejected` (`APPROVAL_NOTIFICATION_TYPES`)
  - `approvals.service.ts:204` → `approval.step_skipped`
  - `approvals.service.ts:506` → current-step approver re-notify (an `approval.requested`-class notification)
- RLS: tenant tables carry `organization_id` and a companion `_rls` migration adding `dbo.fn_tenant_access_predicate(organization_id)` to `dbo.TenantAccessPolicy` (same pattern as `user_notifications`).
- Absolute links in outbound mail: reuse the same app base-URL construction the candidate-email link rendering already uses (`apps/api/src/candidate-emails/candidate-email-render.ts`). The implementation must pin the exact env var it reads rather than introducing a new one.

## Architecture

### 1. Data model — `UserNotificationPreference`

New Prisma model (table `user_notification_preferences`):

| Field | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `organizationId` | uuid, `@map("organization_id")` | for RLS |
| `userId` | uuid, `@map("user_id")` | the owner |
| `type` | String | a value from the type catalog |
| `emailEnabled` | Boolean | |
| `createdAt` / `updatedAt` | DateTime | |

- **`@@unique([userId, type])`**, `@@index` as needed.
- **Sparse / default-ON semantics:** a missing row means email is ON for that type. A row exists only when a user has set a non-default value (i.e. `emailEnabled = false`). Effective value = `row?.emailEnabled ?? true`.
- No seed, no backfill (absence of rows = everyone ON).

### 2. Type catalog — single source of truth

A shared constant (co-located with `NotificationsService`, e.g. `notification-types.ts`) — one entry per notification type:

```ts
export interface NotificationTypeDef { type: string; group: 'mentions' | 'assignments' | 'approvals'; label: string; }
export const NOTIFICATION_TYPES: NotificationTypeDef[] = [
  { type: 'mention',                group: 'mentions',    label: 'You are @mentioned in feedback' },
  { type: 'assigned',               group: 'assignments', label: 'A candidate is assigned to you' },
  { type: 'approval.requested',     group: 'approvals',   label: 'A request needs your approval' },
  { type: 'approval.approved',      group: 'approvals',   label: 'Your submission was approved' },
  { type: 'approval.rejected',      group: 'approvals',   label: 'Your submission was rejected' },
  { type: 'approval.step_skipped',  group: 'approvals',   label: 'An approval step was skipped' },
];
```

Consumed by both the preferences UI (grouped rendering) and the renderer (subject/body). **Registering a new `notify()` type here is a required step whenever a new notification type is added** — a type absent from the catalog still creates a bell row and, by default-ON, sends a generic email; the catalog gives it a real label and grouping.

### 3. Delivery — extend `notify()`

Inside `NotificationsService.notify()`:

1. (unchanged) create the `UserNotification` rows in the tenant transaction. **Extend the existing recipient `user.findMany` select to include `email` and `name`.** Also resolve the actor's `name` (one lookup).
2. **After the transaction commits**, for each valid recipient:
   - resolve the effective email preference for `type` (default ON; one query for the recipients' opt-out rows for this `type`);
   - if ON and the recipient has a non-empty `email`, render (§4) and call `EmailService.send({ to, subject, html, organizationId })`.
3. Sends run concurrently via `Promise.allSettled`; a failed/again-undeliverable send only logs (EmailService already handles this) and **never affects the in-app notification or the caller.** All callers already wrap `notify()` in try/catch; that contract is preserved.

`createMentions` and every existing caller are unchanged (they route through `notify()`).

### 4. Rendering — pure function

`renderNotificationEmail(typeDef, { actorName, contextText, linkPath, appBaseUrl }): { subject, html }`:

- Subject/body derived from the type's `label` + `actorName` + `contextText` (e.g. *"Asha Rao mentioned you on Ravi Kumar"*).
- A minimal shared HTML shell (org-neutral; branding is a later refinement). A primary button/link to `appBaseUrl + linkPath`.
- Footer line: **"Manage your notification emails"** linking to the preferences page (`/v2/profile` or wherever §5 lands).
- Pure and unit-testable; no I/O.

### 5. API + UI

- **API** (self-scoped, authenticated staff user):
  - `GET /notifications/preferences` → the full catalog with each type's effective `emailEnabled` (default ON where no row).
  - `PATCH /notifications/preferences` → body `{ type, emailEnabled }` (one type per call, matching the per-toggle UI): **upsert** a row when `emailEnabled = false`, **delete** the row when set back to `true` (keeps storage sparse). Reject a `type` not in the catalog. Self-only: a user edits only their own preferences.
- **UI:** a "Notification emails" section on the existing v2 profile/settings page (`apps/web/app/v2/**/profile` — the Sidebar footer "Settings" → `/profile` link). Per-type toggles grouped under Mentions / Assignments / Approvals headers, each defaulting ON. Uses the existing v2 form/toggle primitives and data-fetch hooks; format only, reuse existing patterns.

### 6. Migration + RLS

- One additive migration creating `user_notification_preferences`, plus its companion `_rls` migration adding the table to `dbo.TenantAccessPolicy` via `dbo.fn_tenant_access_predicate(organization_id)` — mirror the `user_notifications` migrations exactly.
- Additive only: no destructive DDL, no seed, no backfill. Safe for the deferred-deploy chain.

## Testing

- **Unit — preference resolution:** no row ⇒ ON; `emailEnabled=false` row ⇒ OFF; PATCH true deletes the row, PATCH false upserts it.
- **Unit — renderer:** each catalog type produces a sensible subject + body + absolute link; unknown type falls back to a generic label without throwing.
- **Unit — `notify()`:** emails only opted-in recipients; skips recipients with no email; a `EmailService.send` failure (returns `{success:false}` or rejects) does **not** throw out of `notify()` and does not affect created bell rows; actor is still excluded.
- **API:** `GET` returns full catalog with effective values; `PATCH` is self-only (cannot edit another user's prefs).

## Out of scope (v1)

- Digest / periodic batching; burst debounce/coalescing.
- Candidate-facing email (separate `candidate-emails` system).
- CAN-SPAM/unsubscribe compliance (internal staff, not marketing — a manage-prefs link suffices).
- Org-branded email templates (minimal shell now; branding later).
- Additional channels (SMS, in-app push), and the full Zoho group master-toggles / "self-action" matrix beyond what per-type + the existing actor-drop already give.
- Moving delivery to the BullMQ worker (Approach B) — the upgrade path if volume grows.

## Deploy notes

- Additive migration + RLS only; folds into the existing deferred-deploy chain (see `docs/deploy/2026-09-04-backlog-deploy-runbook.md`). No seed, no grandfathering.
- Requires deliverable SMTP (already true in prod); with no SMTP configured, `EmailService` refuses sends and the bell still works — no regression.
