# Integrations 2c (part 2) — Calendar OAuth2 Free/Busy Connector — Design Spec

Status: DESIGN ONLY. Implementation deferred until the org provisions its own Google Cloud + Azure AD OAuth apps (client id/secret/redirect). Nothing here is buildable end-to-end without those.

## 1. Goal

Let a recruiter/panelist connect their **Google** or **Microsoft (Outlook)** calendar via OAuth2 so that, when interview slots are being proposed, the system reads their **free/busy** and surfaces which candidate slots collide with an existing commitment — so recruiters propose only conflict-free times. Read-only free/busy; no event creation (ICS invites — part 1 — already put interviews on calendars).

## 2. Roadmap context

Integrations feature #7053. 2c-part-1 (ICS invite + `METHOD:CANCEL` retraction) is MERGED (`4d97b79d`). This is **2c-part-2**. This is the roadmap's FIRST OAuth2 connector; the OAuth-app-registration + encrypted-token + refresh + provider-abstraction machinery it introduces is the reusable base for 2d/2e (job boards, ATS) that also use OAuth. Out of scope here: 2d/2e providers.

## 3. What already exists (reused, not rebuilt)

- `OrgSecretsCryptoService` (`@exam-platform/shared`, `CryptoModule`) — `encrypt`/`decrypt` for tokens at rest. Same primitive that stores webhook URL secrets.
- `assertAllowedWebhookUrl`/allowlist patterns — not directly reused, but the redirect-URI allowlisting mirrors it.
- `AuditService` — record connect/disconnect.
- Interview scheduling: `interviews.service.ts` `createInterview` + the slot-proposal UI. Free/busy checking hooks in *before* slots are sent, and/or as a pre-send availability call.
- Per-user auth context (`@CurrentUserId()`), guards (`JwtAuthGuard`), tenant context (`@CurrentTenant()`).
- The RLS pattern (`fn_tenant_access_predicate` FILTER+BLOCK) for the new table.

## 4. Data model

### `CalendarConnection` → `@@map("calendar_connections")`
Per (user, provider) connection. Tokens encrypted at rest.

- `id` UUID PK
- `organizationId` UUID — RLS scope
- `userId` UUID — the owning staff user (a connection is personal; only its owner reads/uses it)
- `provider` string — `'google' | 'microsoft'`
- `accountEmail` string — the connected calendar's account (display only)
- `accessTokenEncrypted` NVARCHAR(Max)
- `refreshTokenEncrypted` NVARCHAR(Max)
- `tokenExpiresAt` DateTime — when the access token expires (drives refresh)
- `scopes` string — granted scopes (space-joined), for drift detection
- `status` string default `'active'` — `'active' | 'revoked' | 'error'`
- `lastSyncedAt` DateTime? / `lastError` NVARCHAR(Max)?
- `createdAt` / `updatedAt`
- `@@unique([userId, provider])` — one connection per user per provider
- RLS: FILTER + BLOCK(INSERT/UPDATE) on `organization_id` (migration mirrors `20260826100001_integrations_rls`). NOTE: RLS scopes to org; per-USER isolation (a user can't use a colleague's tokens) is enforced in the service layer by always querying `where: { userId: currentUserId }`.

Migration: additive `CREATE TABLE` + separate RLS `ALTER` (two files, same convention as 2a).

## 5. OAuth2 flow

Provider apps are org-operator-registered (config, section 9). Authorization-code flow with PKCE where supported.

- `GET /integrations/calendar/:provider/connect` (auth'd) → builds the provider consent URL with:
  - `state` = a signed, short-TTL token binding `{ userId, organizationId, nonce }` (HMAC with a server secret; stored/validated to prevent CSRF + cross-user code injection). NOT a bare random in a cookie only — bind to the user.
  - `redirect_uri` = the single registered callback (exact-match allowlisted).
  - scopes: Google `https://www.googleapis.com/auth/calendar.freebusy` (minimal — free/busy only, NOT calendar.readonly); Microsoft Graph `Calendars.Read` + `offline_access` (Graph has no free/busy-only scope; `Calendars.Read` is the least that supports `getSchedule`).
  - Google: `access_type=offline&prompt=consent` to guarantee a refresh token.
  - Returns the URL (frontend redirects) or 302s.
- `GET /integrations/calendar/:provider/callback?code&state` → validate `state` (HMAC + TTL + not-replayed), exchange `code` → tokens, fetch account email, upsert `CalendarConnection` (encrypt tokens), audit `calendar.connected`. Redirect back to settings with success/failure.
- `DELETE /integrations/calendar/:provider` → revoke at provider (best-effort) + delete row, audit `calendar.disconnected`.
- **Token refresh**: a `getValidAccessToken(connection)` helper — if `tokenExpiresAt` is within a skew window, use the refresh token to mint a new access token, re-encrypt, persist. On refresh failure (revoked consent) → mark `status:'revoked'`, surface a reconnect prompt.

## 6. Provider abstraction

`CalendarProvider` interface — **two real implementations, so the interface is justified** (not a one-impl abstraction):

```
interface CalendarProvider {
  buildAuthUrl(state, redirectUri): string
  exchangeCode(code, redirectUri): { accessToken, refreshToken, expiresAt, accountEmail, scopes }
  refresh(refreshToken): { accessToken, expiresAt }
  getFreeBusy(accessToken, timeMin, timeMax): BusyInterval[]   // [{ start, end }]
  revoke(token): Promise<void>
}
```
- `GoogleCalendarProvider` — OAuth2 token endpoint; free/busy via `POST https://www.googleapis.com/calendar/v3/freeBusy` (body: timeMin/timeMax + `items:[{id:'primary'}]`).
- `MicrosoftGraphProvider` — Microsoft identity platform token endpoint; free/busy via `POST https://graph.microsoft.com/v1.0/me/calendar/getSchedule` (schedules: [accountEmail], startTime/endTime).
- HTTP calls go out to fixed vendor hosts (googleapis.com / graph.microsoft.com / oauth2.googleapis.com / login.microsoftonline.com) — **no SSRF surface** (unlike generic webhooks; hosts are constants), but still `redirect:'error'` on fetch.

## 7. Integration into interview scheduling

- New endpoint `POST /interviews/availability` (auth'd, recruiter): body `{ panelistUserIds: string[], windows: {startsAt,endsAt}[] }` → for each panelist WITH an active connection, fetch free/busy over the min→max window (one provider call per panelist, batched window), return per-window `{ startsAt, endsAt, conflicts: [{ userId }] }`.
- Panelists without a connection are simply omitted from conflict data (best-effort; absence of a connection ≠ available).
- The interview-scheduling UI calls this as slots are chosen and flags colliding slots (⚠ "Panelist X is busy") — non-blocking (recruiter may still send). This keeps free/busy **advisory**, avoiding hard dependencies on every panelist having connected.
- Reuse point for `createInterview`: optionally re-check at send and warn; MVP does it in the UI pre-send.

## 8. Web UI

- **Per-user setting** (NOT org-admin — each person connects their own calendar): a "Calendar" card in the staff profile/settings page with Connect Google / Connect Outlook buttons, connected-account display, Disconnect, and a "reconnect needed" state when `status:'revoked'`.
- **Scheduling UI**: conflict badges on candidate slots (from `POST /interviews/availability`), with a per-panelist busy indicator.

## 9. Configuration (the external dependency)

Per provider, from env/secure config — **the org operator must register these; not creatable by the build**:
- `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET`
- `MS_OAUTH_CLIENT_ID` / `MS_OAUTH_CLIENT_SECRET` / `MS_OAUTH_TENANT` (`common` for multi-tenant)
- `CALENDAR_OAUTH_REDIRECT_BASE` (the single registered callback origin)
- `CALENDAR_STATE_SECRET` (HMAC key for `state`)
A provider whose client id is unset is hidden in the UI + its routes 404 — so the feature ships dark and lights up per provider as creds arrive. This is why implementation can land before creds exist, but can't be end-to-end verified until they do.

## 10. Security

- Tokens encrypted at rest (`OrgSecretsCryptoService`); never returned to any client (the connection view exposes `provider`, `accountEmail`, `status` only).
- `state` is HMAC-signed + user-bound + single-use + short-TTL → CSRF + code-injection safe.
- Redirect URI exact-match allowlisted (registered value only).
- Per-user isolation: every read/use filters `userId = currentUser`; RLS scopes org.
- Minimal scopes (Google free/busy-only; Graph `Calendars.Read`).
- Refresh-token failure degrades to a reconnect prompt, never a crash.
- Provider HTTP to constant vendor hosts + `redirect:'error'`.

## 11. Testing (what's verifiable WITHOUT real creds)

- Unit: `state` sign/verify (tamper, expiry, replay); token encrypt/persist; refresh-on-expiry logic (mocked provider); each provider's free/busy request shaping + response parsing (mocked fetch); availability endpoint conflict computation; connection view never leaks tokens; per-user isolation (can't read another user's connection).
- NOT verifiable until creds: the live OAuth consent handshake, real token exchange, real free/busy round-trips. These get a manual smoke checklist for when creds land.

## 12. Explicitly out of scope (YAGNI / later)

- Writing/updating/cancelling events on the connected calendar (ICS invites already do this — part 1).
- Push-notification / webhook two-way sync (Google watch / Graph subscriptions).
- Choosing a non-primary calendar; multiple calendars per account.
- Availability-based auto-suggestion of slots (MVP flags conflicts on recruiter-chosen slots; auto-suggest is a later enhancement).
- Candidate-side calendar connection (candidates get ICS invites, not OAuth).
