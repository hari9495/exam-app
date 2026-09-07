# Org Sender Addresses (Zoho #9, slice 3) — Design

**Date:** 2026-09-07
**Status:** Approved (design), pending spec review
**Zoho adopt:** #9 (Templates), slice 3 of 4. Slices 1 (offer templates) + 2 (approval-email templates) are on their own parked branches. Remaining after this: unsubscribe/opt-out.
**Branch:** `feat/org-sender-addresses` (off origin/main @ `fec52f3c`)

## Goal

Replace the single per-org `emailFromAddress` with a managed list of named sender addresses (one default), used as the email From. The org default becomes the effective From for all org emails; recruiters composing a manual candidate email can pick a specific sender. Behavior-preserving when no senders are configured.

## Scope

**In:** `OrgSenderAddress` table (label + address + isDefault, exactly one default); central From resolution in `EmailService` (default sender → existing `emailFromAddress` fallback); a per-send picker on the manual candidate-email compose path; org-admin CRUD API + settings page + nav.

**Out (deferred / not this slice):**
- **No sender verification** (SPF/DKIM/send-as verification) — v1 trusts the org to enter addresses their own SMTP is permitted to send as. A wrong one fails at send (logged), exactly like a wrong `emailFromAddress` today.
- Per-send picker on **offers** and any other send path — v1 picks only on manual candidate emails; every other caller uses the org default. (Offers picker = fast-follow.)
- No removal/migration of `emailFromAddress` — it remains the base fallback.
- Other #9 slices (unsubscribe/opt-out).

## Decisions (rulings baked in)

1. **Org default sender = effective From for ALL org emails.** `EmailService.resolveTransporter` resolves the From with precedence: `input.fromAddress` (validated per-send choice) → org default `OrgSenderAddress.address` → `org.emailFromAddress` → `org.smtpUser` → platform. Fully behavior-preserving: no sender rows → falls through to today's `emailFromAddress`/`smtpUser`/platform chain unchanged.
2. **Per-send picker = manual candidate emails only (v1).** `candidate-emails.service.sendMessage` accepts an optional `senderAddressId`; it resolves that id against the org's own `OrgSenderAddress` rows (404/400 if not the org's — no arbitrary From injection) and passes the resolved `address` as `SendEmailInput.fromAddress`. The other nine `emailService.send` callers are unchanged and use the org default automatically.
3. **No verification (v1).** The address must be one the org's SMTP account can send-as (the code already notes Office365 `550 5.7.60 SendAsDenied` for a mismatched From). A wrong address fails at send and is logged — same failure mode as today's mis-set `emailFromAddress`. Documented.
4. **Keep `emailFromAddress`** as the base fallback (wired into SMTP settings + the send-as fallback). The sender list overrides it when a default exists; no rip-out, no data migration.
5. **Exactly-one-default, auto-maintained** (same pattern as offer templates): setting a sender default clears the others; the first sender created is forced default; deleting the default promotes the most-recently-updated survivor; deleting the last leaves none (→ `emailFromAddress` fallback).
6. **New tenant table → paired `_rls` migration.** Config gated `org:manage_settings` (no new permission, no seed change).

## Architecture

### Schema (new tenant table)

```prisma
model OrgSenderAddress {
  id             String   @id @default(uuid()) @db.UniqueIdentifier
  organizationId String   @map("organization_id") @db.UniqueIdentifier
  label          String   @db.NVarChar(200)
  address        String   @db.NVarChar(320) // max email length
  isDefault      Boolean  @default(false) @map("is_default")
  createdAt      DateTime @default(now()) @map("created_at")
  updatedAt      DateTime @updatedAt @map("updated_at")

  @@unique([organizationId, address])
  @@index([organizationId])
  @@map("org_sender_addresses")
}
```
Migrations: `20260907180000_org_sender_addresses` (CREATE TABLE + unique index on (organization_id, address)) + `20260907180001_org_sender_addresses_rls` (ALTER SECURITY POLICY dbo.TenantAccessPolicy ADD FILTER + AFTER INSERT/UPDATE BLOCK predicates on org_sender_addresses via `fn_tenant_access_predicate(organization_id)` — matching the prior new-tenant-table `_rls` shape, e.g. user_groups_rls / approval_email_templates_rls). No seed.

### EmailService (central resolution)

- `SendEmailInput` gains `fromAddress?: string` (a fully-resolved address supplied by a caller that has already validated it; EmailService does NOT look up sender rows itself — it just prefers `input.fromAddress` when present).
- `resolveTransporter(organizationId)` becomes `resolveTransporter(organizationId, fromAddressOverride?)`; when an org SMTP is configured, resolve the From as: `fromAddressOverride ?? (default OrgSenderAddress for the org)?.address ?? org.emailFromAddress ?? org.smtpUser ?? platformFromAddress()`. Add `org_sender_addresses` default lookup to the existing org query (or a second cheap `findFirst` for the default). The `deliverable`/transporter logic and the platform-fallback branch are unchanged.
- Preserve the existing transporter cache keying (keyed by organizationId) — the From address is not part of the transporter, so caching is unaffected.

### candidate-emails.service (the one per-send picker)

- `sendMessage(...)` gains an optional `senderAddressId?: string` (from its DTO). When present: `findFirst` the org's `OrgSenderAddress` by `{ id, organizationId }`; if not found → BadRequest/NotFound; else pass its `address` as `emailService.send({ ..., fromAddress })`. When absent: unchanged (org default applies).
- Its controller DTO gains an optional `senderAddressId`.

### Config API

New `org-sender-addresses` controller + service (mirror an existing config module), all gated per-method `@RequirePermissions('org:manage_settings')`:
- `GET /org-sender-addresses` → the org's senders (default first).
- `POST /org-sender-addresses` → create `{ label, address, isDefault? }` (validate address is a valid email; enforce the default invariant; first one forced default).
- `PATCH /org-sender-addresses/:id` → update `{ label?, address?, isDefault? }` (default invariant).
- `DELETE /org-sender-addresses/:id` → delete + auto-promote if it was default.
- Audit `org_sender_address.created/updated/deleted`.

### Web

- Hook `useOrgSenderAddresses` (list) + create/update/delete mutations.
- Settings page `/settings/sender-addresses`: list (label + address + default badge) + Create/Edit/Delete/Mark-default; note that the default is used for all emails and each address must be one the org's mail server can send as. Mirror an existing settings page shell.
- Nav registration (super-admin-nav + staff-nav V2_ROUTES).
- Manual candidate-email compose UI: an optional sender `<select>` from `useOrgSenderAddresses()` defaulting to the org default, setting `senderAddressId` on the send call. Additive — omitted → server uses the default.

## Data flow

1. Org admin adds senders `Careers <careers@acme.com>` (default) and `Recruiting <talent@acme.com>`.
2. Any automated email (invitation, approval, notification) → `resolveTransporter` uses the default `careers@acme.com` as From.
3. A recruiter composes a candidate email, picks `talent@acme.com` → `sendMessage(senderAddressId)` resolves + validates it → `send({ fromAddress: 'talent@acme.com' })`.
4. An org with no senders configured → From falls through to `emailFromAddress`/`smtpUser`/platform exactly as today.

## Error handling

- `senderAddressId` not one of the org's rows → 400/404 from candidate-emails.service (before send).
- A configured address the SMTP can't send-as → the send fails at `transporter.sendMail` and is logged (existing best-effort behavior); not a crash.
- Invalid email format on create/update → 400 (class-validator `@IsEmail`).
- Duplicate address per org → 409 (unique constraint).

## Testing

- **Schema/RLS:** table + paired `_rls` applied; tenant-scoped.
- **EmailService:** From precedence — per-send override wins; else org default sender; else `emailFromAddress`; else `smtpUser`; else platform. No-senders-configured path is byte-for-byte the current behavior. Default-sender lookup only affects the From, not the transporter cache.
- **Service (senders):** CRUD + exactly-one-default invariant (create forces first default; set clears siblings; delete promotes/last→none); unique-address 409; audit.
- **candidate-emails:** `senderAddressId` present → resolves org sender + passes fromAddress; not-the-org's id → rejected; absent → unchanged.
- **Config API:** routes gated `org:manage_settings`; validation; shapes.
- **Web:** senders page CRUD + mark-default; compose picker sets senderAddressId; nav present.
- Full api + shared jest green; tsc clean.

## Deploy notes

- Two additive migrations (table + `_rls`); no seed change (`org:manage_settings` exists). Behavior-preserving: no senders configured = today's From behavior. Ships with any api build; web needs any web build. No exam-day deploy.
