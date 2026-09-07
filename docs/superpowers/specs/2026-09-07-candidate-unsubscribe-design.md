# Candidate Unsubscribe / Opt-Out (Zoho #9, slice 4) — Design

**Date:** 2026-09-07
**Status:** Approved (design), pending spec review
**Zoho adopt:** #9 (Templates), slice 4 of 4 (final). Slices 1 (offer templates), 2 (approval-email templates), 3 (sender addresses) are on their own parked branches.
**Branch:** `feat/candidate-unsubscribe` (off origin/main @ `fec52f3c`)

## Goal

Give candidates a one-click unsubscribe from a recruiting-org's **communication** emails, honored on the candidate-communications send path, with a token-based public unsubscribe page (reversible). Essential/process emails (exam invites, interviews, offers, portal auth) always send.

## Scope

**In:** `Candidate.unsubscribeToken` + `emailOptedOutAt`; an unsubscribe footer link on candidate-communication emails; an opt-out check in `candidate-emails.service.sendMessage` (manual → blocked; triggered → skipped); a public `GET`/`POST /public/unsubscribe/:token` (opt out / opt back in); a public web unsubscribe page.

**Out (deferred / not this slice):**
- **No exempt-list maintenance** — suppression is scoped to `candidate-emails.service` by construction; exam-invitation / interview / offer / portal-auth emails go through other services and are exempt automatically. No change to those services.
- Admin "clear opt-out" UI — v1 relies on the candidate's public re-subscribe link. (Surface a read-only "unsubscribed" indicator only where cheap.)
- No opt-out categories/preferences (single all-comms flag); no double-opt-in.

## Decisions (rulings baked in)

1. **Suppression scoped to the candidate-communications path only.** The `emailOptedOutAt` check lives solely in `candidate-emails.service.sendMessage`, which handles manual recruiter messages + `stage_prompt`/`stage_auto` triggered status emails. Every other email (invitations, interviews, offers, portal magic-link, auth) flows through a different service and is **exempt by construction** — no per-service allow/deny list.
2. **Manual send to an opted-out candidate is BLOCKED** with a clear error (`ConflictException`/`BadRequestException`: "This candidate has unsubscribed from emails") so the recruiter knows. **Triggered sends (`stage_prompt`/`stage_auto`) are SKIPPED silently + logged** (never break the pipeline).
3. **Reversible.** The public page toggles: opt out sets `emailOptedOutAt = now`; opt back in clears it. A mis-click is recoverable by the candidate.
4. **Dedicated `unsubscribeToken`** (not reuse `portalToken` — an unsubscribe link is scanned/forwarded and must not expose the read-only portal). Minted lazily on the first candidate-email send when null.
5. Additive columns on `candidates` (already tenant-RLS) → **no `_rls` migration, no seed change.**

## Architecture

### Schema (additive)

```prisma
// model Candidate
unsubscribeToken String?   @unique @map("unsubscribe_token")
emailOptedOutAt  DateTime? @map("email_opted_out_at")
```
Migration `20260907190000_candidate_unsubscribe`: `ALTER TABLE [dbo].[candidates] ADD [unsubscribe_token] NVARCHAR(...) NULL, [email_opted_out_at] DATETIME2 NULL;` + a unique index on `unsubscribe_token` (filtered `WHERE unsubscribe_token IS NOT NULL` if the repo's other `@unique` nullable columns use filtered indexes — check `portal_token`'s migration and match it). No `_rls` (candidates already RLS).

### candidate-emails.service (the one enforcement point)

- `sendMessage(context, userId, entryId, input)` — after resolving the candidate/entry, before `emailService.send`:
  - If `candidate.emailOptedOutAt` is set:
    - `input.source === 'manual'` → throw a clear `ConflictException` ("This candidate has unsubscribed from emails"); do NOT send, do NOT create a CandidateEmail row.
    - `input.source === 'stage_prompt' | 'stage_auto'` → skip the send, log a grep-able line, return a `{ suppressed: true }`-style result (or the existing result shape with a suppressed flag); do NOT create a delivered CandidateEmail row. Never throw (pipeline-safe).
  - Else (not opted out): mint `unsubscribeToken` if null (`update candidate` with a random token), and send as today.
- The `resend` path (existing) also honors the opt-out (a resend to an opted-out candidate is blocked/skipped by the same rule).

### candidate-email-render.ts (footer link)

- `buildCandidateEmailHtml({ logoUrl, orgName, bodyText, unsubscribeUrl })` — append a footer: `To stop receiving these emails, unsubscribe: <a href="{unsubscribeUrl}">…</a>`. `unsubscribeUrl = ${FRONTEND_URL}/unsubscribe/{token}`. The token is threaded from the service (post-mint). Only the candidate-communications emails get this footer (essential emails use their own renderers, unchanged).

### Public API

`public-applications.controller.ts` (or a small dedicated public controller) — unauthenticated, token-only, mirroring `portal/:portalToken`:
- `GET /public/unsubscribe/:token` → resolve candidate by `unsubscribeToken`; return `{ optedOut: boolean, orgName }` (404 if no match). No PII beyond what's needed to render the page.
- `POST /public/unsubscribe/:token` body `{ optedOut: boolean }` → set/clear `emailOptedOutAt` accordingly; return the new state. Idempotent. (Resolve the candidate by token WITHOUT tenant context — the token is the authorization, like the portal; use `withoutTenantScope`/an unscoped read as the portal does, or a raw lookup by the unique token — mirror exactly how `portal/:portalToken` resolves its candidate to stay consistent with that security model.)

### Web

- Public page `apps/web/app/unsubscribe/[token]/page.tsx` (unauthenticated, like `/apply/[applyToken]`): shows org name + current state + a button to unsubscribe / re-subscribe; calls the public GET/POST. Confirmation copy.
- (Optional, if cheap) a small "Unsubscribed" indicator in the candidate drawer + a clearer blocked-send message in the compose modal when the API returns the opt-out error.

## Data flow

1. A candidate-communication email is sent → service mints `unsubscribeToken` if needed → footer link `…/unsubscribe/{token}`.
2. Candidate clicks it → public page → POST opt-out → `emailOptedOutAt = now`.
3. Next triggered status email for that candidate → `sendMessage` sees `emailOptedOutAt` → skips + logs.
4. A recruiter tries a manual message → `sendMessage` throws "unsubscribed" → compose UI shows the error.
5. An exam invitation / interview / offer for that candidate → sent normally (different service, exempt).
6. Candidate re-subscribes via the same link → `emailOptedOutAt` cleared → comms resume.

## Error handling

- `GET/POST /public/unsubscribe/:token` with an unknown token → 404 (no leak of whether an email exists beyond token validity).
- Manual send to opted-out → 409 with the clear message.
- Triggered send to opted-out → skip + log, no throw.
- Token mint is idempotent (only when null); a race that mints twice is prevented by the unique constraint (retry/ignore).

## Testing

- **Schema:** columns + unique token index applied; no `_rls`.
- **candidate-emails.service:** opted-out + manual → throws, no send, no row; opted-out + stage_prompt/stage_auto → skipped, no send, no throw, logged; not-opted-out → sends + mints token if null (idempotent when present); resend honors opt-out.
- **candidate-email-render:** footer contains the unsubscribe link with the token; essential-email renderers unchanged (no footer added there).
- **Public API:** GET returns state (404 unknown token); POST opt-out sets `emailOptedOutAt`, POST opt-in clears it; token resolution matches the portal's unscoped-by-token model.
- **Web:** unsubscribe page renders state + toggles; compose modal surfaces the blocked-send error.
- Full api + web jest green; tsc clean.

## Deploy notes

- One additive migration (2 columns + unique index), no `_rls`, no seed. Behavior-preserving: no candidate is opted out until they click, so all emails send as today. Ships with any api build; the public web page needs any web build. No exam-day deploy.
