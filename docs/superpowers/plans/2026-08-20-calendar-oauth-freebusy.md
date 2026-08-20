# Integrations 2c (part 2) — Calendar OAuth2 Free/Busy — Implementation Plan

Design: `docs/superpowers/specs/2026-08-20-calendar-oauth-freebusy-design.md`. DEFERRED until Google Cloud + Azure AD OAuth apps exist. Tasks are ordered; each is independently reviewable (same SDD/subagent flow as 2a). Unit tests mock providers — everything except the live handshake is verifiable pre-creds.

## Prereqs (org operator, blocking end-to-end verification — NOT the build)
- Google Cloud project → OAuth consent screen + OAuth client (Web) with the `calendar.freebusy` scope; register the redirect URI.
- Azure AD app registration → Graph `Calendars.Read` + `offline_access`; register the redirect URI; note tenant.
- Populate the section-9 env vars in each environment.

## Task 1 — `CalendarConnection` schema + RLS migrations
`schema.prisma` model (section 4) + `prisma generate`. Two migrations: `..._calendar_connections` (CREATE TABLE) + `..._calendar_connections_rls` (FILTER+BLOCK on organization_id). Verify: `prisma validate`; migration applies additively. Depends on: none.

## Task 2 — `state` sign/verify util
`calendar-oauth-state.ts`: `signState({userId,organizationId})` → HMAC(`CALENDAR_STATE_SECRET`) + issued-at; `verifyState(token)` → validate signature + TTL, return payload or throw. Single-use enforced by a short TTL + a nonce (in-memory or a tiny `used_states` check — MVP: short TTL only, note the replay-window ceiling). Tests: valid round-trip, tampered sig rejected, expired rejected. Depends on: none.

## Task 3 — `CalendarProvider` interface + Google impl
`calendar-provider.ts` (interface, `BusyInterval`), `google-calendar.provider.ts`: `buildAuthUrl`, `exchangeCode`, `refresh`, `getFreeBusy` (POST freeBusy), `revoke`. All HTTP mocked in tests. Tests: auth URL has offline+consent+scope; code exchange parses tokens; free/busy request body + response parse; refresh. Depends on: none.

## Task 4 — Microsoft Graph impl
`microsoft-graph.provider.ts`: same interface; token endpoint `login.microsoftonline.com/{tenant}/oauth2/v2.0/token`; free/busy via `POST /me/calendar/getSchedule`. Tests mirror Task 3. Depends on: Task 3 (interface).

## Task 5 — `CalendarConnectionsService` (tokens + refresh + provider registry)
Encrypt/persist tokens (`OrgSecretsCryptoService`); `getValidAccessToken(connection)` (refresh-on-expiry, re-encrypt, mark revoked on failure); provider registry keyed by `provider`; connect-upsert, disconnect(+revoke), `listForUser` (view: provider/accountEmail/status only — NO tokens). Per-user isolation: all queries `where:{userId}`. Tests: view never leaks tokens; refresh path; revoked handling; can't read another user's connection. Depends on: Tasks 1–4.

## Task 6 — OAuth controller (connect / callback / disconnect)
`calendar.controller.ts` under `/integrations/calendar`: `GET :provider/connect` (auth'd → consent URL, signed state), `GET :provider/callback` (verify state, exchange, upsert, audit, redirect to settings), `DELETE :provider`. Unset-client-id provider → 404 (ships dark). Audit connect/disconnect. Tests: connect builds URL w/ bound state; callback rejects bad/expired state (CSRF); disconnect revokes+deletes. Depends on: Task 5.

## Task 7 — Availability endpoint + scheduling hook
`POST /interviews/availability` (recruiter): for each panelist with an active connection, `getFreeBusy` over the window, return per-window conflicts. Batches one provider call per panelist. Non-connected panelists omitted. Tests: conflict computation (overlap math), unconnected panelist omitted, provider error for one panelist doesn't fail the whole response. Depends on: Task 5.

## Task 8 — `CalendarModule` wiring
Module (imports `CryptoModule`, `AuditModule`; declares controller + service + providers); register in `app.module.ts`. DI check: resolves. Depends on: Tasks 5–7.

## Task 9 — Web: per-user Calendar settings card
`useCalendarConnections` hook (list/connect-URL/disconnect) + a Calendar card in staff settings: Connect Google / Connect Outlook (hidden when provider unconfigured — a `GET .../providers` capability flag), connected-account + status, Disconnect, reconnect-needed state. Tests: renders connected/disconnected/revoked; disconnect calls the hook. Depends on: Tasks 6, 8.

## Task 10 — Web: conflict badges in scheduling UI
Call `POST /interviews/availability` as slots are chosen; show ⚠ busy badges per slot/panelist; non-blocking. Tests: badges render from mocked availability; no-connection → no badge. Depends on: Tasks 7, 8.

## Task 11 — Config + docs + dark-ship guard
Env wiring (section 9), a `GET /integrations/calendar/providers` returning which providers are enabled (client id present), and a manual smoke checklist for post-creds verification (the live handshake + real free/busy). Depends on: Tasks 6–8.

## Verification gate (final, whole-branch)
Security review focus: token-at-rest never leaked; `state` CSRF/replay; per-user isolation; scope minimization; refresh-failure degradation; redirect-URI allowlist. Then the manual OAuth smoke test **once creds are provisioned** — this is the only step that cannot pass in CI.

## Sizing
~11 tasks, comparable to 2a. The provider abstraction (Tasks 3–4) is the reusable OAuth base for 2d/2e. No new npm deps expected (raw `fetch` to token/API endpoints; existing crypto). Confirm `google-auth-library`/`@microsoft/microsoft-graph-client` are NOT needed — raw HTTP keeps the dependency surface flat and avoids their transitive weight (revisit only if token/PKCE handling proves fiddly).
