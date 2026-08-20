# Integrations 2e (part 2) — Bidirectional ATS/HRIS Connector — Design + Plan

Status: DESIGN ONLY. Deferred until an integration credential exists. 2e-part-1 (un-gated) is MERGED: the `candidate.hired` event + candidate/pipeline CSV export, on top of the already-shipped outbound path (2a events + 2b generic webhooks + Zapier). Those already let a customer push applications/hires/CSV into Greenhouse/Lever/Workday/BambooHR **today** with no code from us. This part is the genuinely-new capability: **inbound + structured bidirectional sync**.

## 1. Goal

Two-way sync between our pipeline and an external ATS/HRIS: pull open reqs / candidates FROM the system, and push our stage changes / hires TO it, as first-class structured data (not just fire-and-forget webhooks). Primary use cases: (a) HRIS onboarding on hire (push the hired candidate to Workday/BambooHR), (b) ATS candidate/req sync (Greenhouse/Lever).

## 2. Recommended approach — a UNIFIED connector (Merge.dev / Finch), not per-provider

Per-provider (Greenhouse Harvest, Lever, Workday) each need their own API + partner/app onboarding + a distinct object model — 3+ separate multi-week builds. **A unified ATS/HRIS API aggregator (Merge.dev or Finch) gives ONE integration for 50+ providers**: the customer authorizes their ATS/HRIS through Merge's Link UI, and we call Merge's normalized API (Candidates, Jobs, Applications for ATS; Employees for HRIS). This is the ponytail-correct call: one connector, all providers, one normalized object model.
- **External dependency (the blocker):** a Merge.dev (or Finch) account + API key (a paid third-party). Buildable against their sandbox key; not usable in prod without the account.
- Fallback if we reject a paid aggregator: build per-provider starting with **Greenhouse** (simplest — a customer-generated Harvest API key, no partner approval), then Lever (OAuth), then Workday (heavily gated — last).

## 3. What already exists (reused)

- `OrgSecretsCryptoService` — encrypt the Merge/provider account token at rest.
- The OAuth base from **2c-part-2** (for Lever/Merge-Link OAuth-style flows).
- `candidate.hired` + the 8 other events (2a) — the outbound triggers; this connector consumes them to PUSH, and adds INBOUND polling/webhooks.
- `Job`, `PipelineEntry`, `Candidate`, stages — our side of the mapping. `Job.location`/`employmentType` (2d) map to the ATS job object.
- RLS pattern, `AuditService`, per-tenant isolation.

## 4. Data model

### `AtsConnection` → `@@map("ats_connections")` (per org)
`id`, `organizationId` (RLS), `provider` (`'merge' | 'finch' | 'greenhouse' | 'lever' | 'workday'`), `accountTokenEncrypted` (Merge `account_token` / provider key), `linkedProviderName` (the real ATS behind Merge, display), `status`, `lastSyncedAt`, `lastError`, `createdAt`/`updatedAt`. `@@unique([organizationId, provider])`.

### `AtsSyncMap` → `@@map("ats_sync_map")`
Cross-reference: `organizationId`, `localType` (`'candidate' | 'job' | 'application'`), `localId`, `provider`, `externalId`, `lastSyncedAt`. `@@unique([organizationId, localType, localId, provider])`. Prevents duplicate creates on re-sync (idempotency).

Additive migrations + RLS on both.

## 5. Flow

- **Connect:** `GET /integrations/ats/link-token` → mint a Merge Link token → the web opens Merge Link → callback stores the `account_token` (encrypted) in `AtsConnection`. (Per-provider variants: OAuth for Lever, key-paste for Greenhouse.)
- **Outbound push:** on `candidate.hired` (and optionally stage changes / `offer.accepted`), upsert the candidate/application into the ATS/HRIS via the connector, recording the `externalId` in `AtsSyncMap`. Runs on the existing BullMQ worker path (reuse `IntegrationEventsService` fan-out → a new `ats-sync` consumer).
- **Inbound pull:** a scheduled poll (or Merge webhooks where available) imports new candidates/applications from the ATS into our pipeline as `PipelineEntry`s (stamp-if-absent via `AtsSyncMap`), and reflects external stage changes. MVP: poll on an interval + manual "Sync now".
- **Disconnect:** revoke + delete connection + optionally purge sync map.

## 6. Connector abstraction

`AtsConnector` interface (Merge impl first; per-provider impls satisfy the same shape → justified): `pushCandidateHired(conn, payload) -> externalId`, `listCandidatesSince(conn, cursor) -> Candidate[]`, `listJobs(conn) -> Job[]`, `disconnect(conn)`. `MergeAtsConnector` normalizes across providers; optional `GreenhouseConnector` etc. later. HTTP to fixed vendor hosts (`api.merge.dev`), `redirect:'error'`.

## 7. Web UI

- Org settings "ATS / HRIS" card: Connect (opens Merge Link) / connected-provider + status / Disconnect / "Sync now" + last-synced. Mirrors 2c's calendar + 2b's connected-apps cards.
- Optional: a per-candidate "synced to <ATS>" badge.

## 8. Security

- Account tokens encrypted at rest, never returned to any client.
- Org isolation via RLS; connect/sync perm-gated (`org:manage_settings`).
- Merge Link token is short-lived + server-minted; no provider secrets ever reach the browser.
- Inbound data validated/sanitized before persist (treat external candidate data as untrusted — same discipline as the public apply form).
- Outbound to constant vendor host; `redirect:'error'`.
- Idempotent via `AtsSyncMap` (no duplicate candidates on re-sync).

## 9. Config (external dependency — the blocker)
`MERGE_API_KEY` (+ webhook secret) or per-provider keys, from secure config. Unset → the ATS card is hidden + routes 404 (ships dark). Buildable + unit-testable against a sandbox key; real end-to-end sync needs the account.

## 10. Plan (ordered; ~10 tasks, reuses 2c OAuth + 2a fan-out)
1. `AtsConnection` + `AtsSyncMap` schema + RLS migrations.
2. `AtsConnector` interface + `MergeAtsConnector` (push/list/disconnect; HTTP mocked).
3. `AtsConnectionsService` (encrypt token, connect/disconnect, per-org, status). 
4. Link-token + callback controller (Merge Link) + audit.
5. Outbound: an `ats-sync` consumer on the fan-out — push on `candidate.hired`, idempotent via `AtsSyncMap`.
6. Inbound: `syncNow` + a scheduled poll importing candidates/applications (stamp-if-absent). 
7. `AtsModule` + `app.module` wiring; DI check.
8. Web: ATS/HRIS settings card (connect via Merge Link, status, Sync now, disconnect).
9. Optional: per-candidate synced badge.
10. Config + dark-ship guard + a manual smoke checklist for when the Merge account exists.
Verification gate: security review (token-at-rest, isolation, inbound-data sanitization, idempotency) + a manual sandbox smoke once `MERGE_API_KEY` is provisioned — the only step that can't pass in CI.

## 11. Explicitly out of scope
- Full HRIS payroll/benefits sync (only the hire→onboarding push).
- Real-time bidirectional conflict resolution (last-writer-wins on stage; note the limitation).
- Providers Merge doesn't cover (build a per-provider connector only if a customer needs one Merge lacks).
