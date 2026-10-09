# P11 · API-First (Headless) Architecture

> **Status:** ✅ Decided (8/8), 25 Sep 2026 — TR1 (Salesforce-style extensibility) open for team review. **Extended 26 Sep 2026** (gap-register user decision): custom-object APIs cross-reference to P18 (B20), YX-API-16, §11 row B20.
> **Covers:** the "headless" direction the user raised on 25 Sep 2026.
> - All business logic sits behind one versioned API.
> - Our web app, mobile app, client portal and partners are all *clients* of that API.
> - Spec §2.1.13 (integrations / API) and §2.1.18 (mobile).
>
> **Builds on:**
> - P01: tenancy, RLS.
> - P02: roles, field classes, API-key grants YX-SEC-22, external logins YX-SEC-21.
> - P03: request types.
> - P04: events.
> - P08: audit.
> - P10: integration hub, Accounting API.
> - M04: mobile uses the same API.
> - M10: client portal.
>
> **Build wave:** the conventions start in **wave 1**. Every module after that ships with its API. The public developer portal opens with the pilot in **wave 3**.

---

## 1. Purpose & scope
**API-first, with our own UI as the first client.**
- Every capability is built as an API first. Screens only call that API.
- Customers and partners can then:
  - build their own portals and apps;
  - connect their own systems (ERP, BI, biometric, payroll bureaus);
  - later embed YukthiX pieces in their intranet.

Customers who just want the ready app lose nothing.

This is **not** a "pure headless" product without a UI: SMB customers need the ready app.

## 2. What exists today (exam app, `origin/main`)

| Asset | Today | P11 |
|---|---|---|
| NestJS API separate from Next.js web | `apps/api`, `apps/web`; global prefix `api/v1`; separate internal app | **Keep** — becomes the single API for all clients |
| Public API | `public-api` module: API-key guard, Redis-backed throttler, read-only candidates endpoints, pagination DTO | **Generalise** to all modules (Q2) |
| API key | **One key per organisation** (`apiKeyHash`, `apiKeyPrefix` on `Organization`) | **Replace** with multiple named, scoped, rotatable keys (P02 YX-SEC-22, Q4) |
| Webhooks | **One URL + secret per organisation**, `WebhookDelivery` log; `IntegrationEventsService.emit()` (post-commit, retries, never breaks the domain call); Slack/Teams `OrgIntegration` | **Extend** to multiple endpoints with an event catalogue and replay (Q5) |
| API docs | None (no OpenAPI / Swagger) | **Add** OpenAPI 3.1 generated from code (Q1) |
| Throttling | `@nestjs/throttler` + Redis storage, fail-open guard | **Keep**; per-plan / per-key limits (Q8) |
| Auth | JWT (web session), SAML SSO, refresh tokens | **Add** OAuth 2.0 for partner apps (Q4) |

## 3. Concepts
- **API surface:** one REST API, `https://api.<region>.yukthix.com/v1/...`, region per P02 Q7.
  - Resources follow the design docs: `/employees`, `/leave-requests`, `/payroll-runs/{id}/payslips`, and so on.
  - Every route is classified as one of the following:

  | Class | Who can call it |
  |---|---|
  | **Public** | Documented and stable; available to customers and partners |
  | **First-party** | Used by our apps, not yet documented, e.g. heavy UI aggregations |
  | **Internal** | Platform operations only |

- **Contract:** the OpenAPI spec is generated from NestJS DTOs and decorators and checked into the repo. The TypeScript SDK and docs are generated from it (Q6).
- **Two transports, one domain (Q1):** **REST** (`/v1/...`, OpenAPI) and **GraphQL** (`/graphql`, code-first NestJS schema, published SDL) both call the **same NestJS service layer**. Permission checks (P02 incl. field classes), validation, P03 approvals, P08 locks and audit run in that layer, never in a transport. GraphQL mutations map one-to-one to the REST write operations (same idempotency, same scopes).
- **Client types:**
  - our web and mobile apps, using a user session;
  - server integrations, using API keys;
  - partner apps acting for a user, using OAuth 2.0;
  - external logins such as the client portal and trainers, using OTP sessions (P02 YX-SEC-21).
- **Events:** domain events from P04 / P10 published as webhooks from a catalogue (Q5). The catalogue is [Appendix B · Domain event catalogue](APX-B-events.md); the **public webhook events are exactly the rows marked "Webhook: Yes"** there (thin payloads where marked, YX-API-10).
- **Idempotency:** writes accept an `Idempotency-Key` header, so a retried call never duplicates. Critical for payroll, punches and offers (M10 YX-ATS-07).
- **Embeddables:** small UI pieces (careers widget, leave balance, apply-leave, org chart) that call the same API with the viewer's session (Q7).
- **Custom objects (B20, designed in P18):** every custom object a company defines gets an **auto-generated** REST resource (`/v1/custom/{object_api_name}`, in OpenAPI), GraphQL type with queries and mutations, and webhook events (`custom.{object}.created / updated / deleted`, added to the tenant's event catalogue) through the same service layer, permissions, field classes, idempotency, audit and limits as built-in resources. Object and field definitions themselves are P18's.

## 4. Data model (additions)

| Table | Purpose |
|---|---|
| `api_keys` | name, prefix, hash, owner (user / service), scopes, field classes (P02 YX-SEC-22), IP allow-list, expires_at, last_used_at, revoked_at |
| `oauth_clients` | partner app: client id, secret hash, redirect URIs, allowed scopes, publisher, status (review / approved / suspended) |
| `oauth_grants` / `oauth_tokens` | tenant consent per app, scopes granted, refresh tokens (hashed) |
| `webhook_endpoints` | URL (allow-listed per existing `webhook-url-allowlist`), secret (encrypted), subscribed event types, status, failure count |
| `webhook_deliveries` | extends today's `WebhookDelivery`: attempt count, response code, next retry, replayable |
| `event_catalogue` | event type, version, payload schema, sensitivity, first wave; content = [APX-B](APX-B-events.md) (plus producer, consumers, public flag, `metrics_only`), kept in sync by the CI registry check (APX-B §4) |
| `api_usage_daily` | tenant × key × route group: calls, errors, p95 latency (for limits, billing, support) |
| `idempotency_keys` | key, tenant, route, request hash, stored response, expiry (24 h) |

All tables carry `organization_id` + RLS, except `oauth_clients`, which is a platform catalogue (P07 YX-STAT-10 exemption).

## 5. Rules (YX-API)

| ID | Rule |
|---|---|
| YX-API-01 | **No hidden logic.** Business rules, validation, permissions and calculations run only in the API. The web and mobile apps never compute a figure that the API doesn't also enforce. |
| YX-API-02 | **Our UI uses the same API.** Every action in our apps goes through an API route. Public-class routes behave identically for our apps and for external clients. First-party routes may add UI aggregations, but never extra rights. |
| YX-API-03 | Every request is tenant-scoped via P01 RLS (`SET LOCAL app.current_org` from the session, key or token) and permission-checked via P02, including field classes. A key or token can never exceed its owner's or grant's rights. |
| YX-API-04 | The OpenAPI 3.1 spec is generated in CI. A build fails if a public route is undocumented, or if a change breaks the published contract without a new major version (Q3). |
| YX-API-05 | Writes support `Idempotency-Key`. Replaying the same key and body returns the original result; the same key with a different body gets 409. |
| YX-API-06 | Lists use cursor pagination, filtering and sorting on documented fields, and sparse fieldsets (`fields=`). Responses never include fields the caller's field classes don't allow; they are omitted, not nulled. |
| YX-API-07 | Errors use one format (RFC 9457 problem details) with a stable `code`, a human message, and field errors. Validation messages match the UI's. |
| YX-API-08 | Rate limits apply per key / token / user and per tenant, from the plan's fair-use limits or the limits add-on (Q8). Responses carry `RateLimit-*` headers. Limits never block our own apps' interactive traffic below the tenant quota. |
| YX-API-09 | Webhooks are signed (HMAC-SHA256 with a timestamp, replay window of 5 min or less) and retried with exponential backoff for up to 24 h. After repeated failure the endpoint is disabled and admins are notified. Deliveries can be replayed (Q5). |
| YX-API-10 | Webhook payloads for Confidential or Special entities (salary, payslips, bank, cases) carry IDs and change type only. The receiver fetches details through the API with a properly scoped key. |
| YX-API-11 | Every API write is audited (P08) with the caller identity: user, key name, or OAuth app + user. "Who accessed my data" (P08 Q6) includes API access by apps and keys. |
| YX-API-12 | Payroll and statutory **writes** through the public API (run approval, payment status, filings) require a key with an explicit payroll-write scope and still go through P03 approvals and maker ≠ checker. There is never an API bypass of approvals or period locks (P08). |
| YX-API-13 | A deprecated route or field returns `Deprecation` and `Sunset` headers for the whole notice period (Q3). Tenants using it are emailed. |
| YX-API-14 | REST and GraphQL are thin transports over one service layer: the same call through either returns the same data, errors (GraphQL `extensions.code` = problem `code`), permissions and audit. No business rule lives in a resolver or controller. |
| YX-API-15 | GraphQL is protected by depth and complexity limits, pagination on every list (connections), per-field authorisation from P02 field classes (unauthorised fields resolve to an error, never silently leak), disabled introspection in production for non-developer keys, and **persisted queries** for our own apps. Rate limits count query cost, not requests. |
| YX-API-16 | **Custom-object APIs (B20):** publishing a custom object (P18) generates its REST resource, GraphQL type and `custom.{object}.*` webhook events with no code release; they obey YX-API-03/05/06/09/10/14/15 like built-in resources (P02 scopes and field classes per custom field, thin payloads for Confidential / Special objects); renaming or deleting a published object or field follows the Q3 deprecation rules for keys that use it. |

## 6. Flows
1. **Build a module:**
   1. Design doc.
   2. API resources and events designed first (OpenAPI).
   3. Backend.
   4. Generated SDK.
   5. Web and mobile screens built on the SDK.
   6. Public docs are published when the route is marked public.
2. **Customer integration:**
   1. The admin creates a scoped API key (P02) or approves an OAuth app.
   2. The admin subscribes webhook endpoints.
   3. The developer builds in the sandbox tenant (Q6).
   4. The integration goes live.
   5. Usage is shown in Settings → Developers.
3. **Partner app (OAuth):**
   1. The partner registers and passes YukthiX review.
   2. The tenant admin clicks "Connect" and sees the requested scopes.
   3. The admin grants consent.
   4. The app gets a tenant-scoped token.
   5. The admin can revoke it at any time.

## 7. UI
- **Settings → Developers:**
  - API keys: create with scopes and field classes, rotate, revoke, last used.
  - OAuth apps: connected apps and their scopes.
  - Webhooks: endpoints, event picker, delivery log with replay, test event.
  - Usage charts.
- **Developer portal** (public site): API reference from OpenAPI, guides, changelog, status page, sandbox sign-up (Q6).

## 8. Migration & rollout
- **Wave 1:**
  - OpenAPI generation;
  - error format;
  - idempotency;
  - `api_keys` table replacing the single org key (existing keys migrated as one named key with the old scope);
  - `webhook_endpoints` replacing the single URL (migrated as one endpoint subscribed to today's events).
- **Waves 1–2:** core HR and org, leave and attendance APIs (incl. punch import for devices, P10 Q4).
- **Wave 3 (pilot):** developer portal and sandbox open; payroll read APIs and Accounting API (P10 Q7). Payroll writes stay first-party until Q2 allows them.
- **Later waves:** each module ships its public API with the module. Embeddables per Q7.

## 8b. P22 cross-reference (28 Sep 2026)
- **Script SDK surface ([P22](P22-workflow-studio-ai-assistant.md), wave 6):** a **sandbox-safe subset** of the TypeScript SDK for workflow script steps: typed record read / query / create / update, request start, notify, document generate, approved-connection call, workflow variables and logging. No file system, raw HTTP, timers beyond the step limit, or admin / platform routes. Calls carry the service identity's scopes and obey YX-API rate limits and P02 field classes (YX-WFS-13 / 14).
- **Inbound signed webhook trigger:** each workflow may expose `POST /v1/workflows/{id}/hooks` with its own secret; HMAC-SHA256 over timestamp + body (the Q5 outbound scheme), 5-minute replay window, secret rotation with overlap (YX-WFS-11).
- AI do-mode plans (P10 YX-AI-15) run only through public API routes, with the person's token.

## 9. Acceptance tests (samples)
- Leave requested through the API with a balance shortfall returns the same error code and message as the web form (YX-API-01/07).
- A key scoped to `employees:read` without the salary field class gets employee records without CTC fields, and 403 on `/payslips` (YX-API-06, YX-SEC-22).
- Posting the same punch batch twice with one `Idempotency-Key` creates punches once (YX-API-05).
- Approving a payroll run via the API with a key lacking `payroll:approve`, or by the maker, fails; with the right key and a different checker it passes P03 (YX-API-12).
- The `payslip.published` webhook carries IDs only; fetching the payslip needs a salary-scoped key (YX-API-10).
- Renaming a public field without a new major version fails CI (YX-API-04).
- A tampered webhook signature is rejected by the SDK's verify helper (YX-API-09).
- The same employee query via REST and GraphQL with a key lacking the salary field class returns no CTC in REST and an authorisation error for `ctc` in GraphQL; both audited identically (YX-API-14/15).
- A GraphQL query nested 12 levels deep or above the complexity budget is rejected before execution (YX-API-15).
- B20: a company publishes a custom object "Uniform issue"; `GET /v1/custom/uniform_issue` and the GraphQL type exist at once and appear in the tenant's OpenAPI; creating a record fires `custom.uniform_issue.created` to a subscribed endpoint; a key without the object's scope gets 403 (YX-API-16).

## 10. Open questions (answer one at a time)

| # | Question | Recommendation |
|---|---|---|
| Q1 | API style | **REST + OpenAPI 3.1** (generated from NestJS), JSON, cursor pagination; **no GraphQL at launch** (more security and caching work; revisit for analytics / BI reads). *(User chose C — see §11.)* |
| Q2 | What is public, when | **Grow with the modules:** Core HR, org, leave, attendance (incl. punch import) public from their waves; **payroll: read + journals public in wave 3, writes (run approval, payment status) public later** once stable, behind payroll-write scope; ATS and others public with their module; admin / platform routes never public. |
| Q3 | Versioning & deprecation | **Major version in the URL** (`/v1`); additive changes anytime; breaking changes only in a new major; **12 months notice** with Deprecation / Sunset headers and emails; at most 2 majors live. |
| Q4 | Auth for external clients | **Scoped API keys** (many per tenant, rotation, IP allow-list, expiry) for server-to-server + **OAuth 2.0 authorization code with PKCE** for partner apps acting for a user (and client-credentials for partner back-ends); partner apps reviewed by YukthiX before listing. |
| Q5 | Webhooks | **Event catalogue** (versioned, documented), multiple endpoints per tenant with event filters, HMAC signatures, retries 24 h, auto-disable + alert, **replay** from the delivery log; thin payloads for sensitive entities (YX-API-10). |
| Q6 | Developer experience | **Developer portal** (reference, guides, changelog, status) + **sandbox tenant with demo data** on request (self-serve sign-up) + **TypeScript SDK** generated from OpenAPI + Postman collection; more SDKs (Python, Java) on demand. |
| Q7 | Embeddables & white-label | **Wave 6:** embeddable web components (careers page — exists, leave balance / apply leave, org chart, payslip viewer with login) + **white-label** (custom domain, logo, colours, email sender) on higher plans; headless custom front-ends allowed any time via the API. |
| Q8 | Limits & pricing | **API access on all plans** with fair-use limits per plan (e.g. per-minute and daily calls); higher limits and more webhook endpoints on higher plans; partner marketplace listing later; no per-call charge at launch. |

## 11. Decisions
| # | Decision | Date |
|---|---|---|
| Q1 | **Both REST and GraphQL from day one**, as two thin transports over **one shared NestJS service layer** (YX-API-14): REST `/v1` with OpenAPI 3.1 for integrations and partners; GraphQL (code-first schema, published SDL) for our web / mobile apps and customers who prefer it. Guardrails: depth / complexity limits, per-field P02 authorisation, persisted queries for first-party apps, cost-based rate limits (YX-API-15). SDKs generated from both contracts. | 25 Sep 2026 |
| Q2 | **Public surface grows with the modules:** Core HR, org, leave, attendance (incl. punch import) public from their waves; payroll **read + journals public in wave 3**, payroll **writes** (run approval, payment status, filings) public later once stable, behind an explicit payroll-write scope (YX-API-12); ATS, expenses, performance etc. public with their module; admin / platform routes never public. Applies equally to REST and GraphQL. | 25 Sep 2026 |
| Q3 | **Major version in the URL** (`/v1`); additive changes any time; breaking changes only in a new major with **12 months notice** (Deprecation / Sunset headers, emails to tenants using the route, changelog); at most **2 majors live**. GraphQL: fields marked `@deprecated` and removed only after the same 12 months; no breaking schema change without the notice. | 25 Sep 2026 |
| Q4 | **Scoped API keys** for server-to-server (many per tenant, named, scopes + field classes per P02 YX-SEC-22, rotation with overlap, IP allow-list, expiry; replaces today's single org key) **+ OAuth 2.0** authorization code with PKCE for partner apps acting for a user, client-credentials for partner back-ends; tenant consent screen with scopes, revocable per app; partner apps reviewed by YukthiX before listing. | 25 Sep 2026 |
| Q5 | **Versioned event catalogue**; many endpoints per tenant with event filters; HMAC-SHA256 signatures with timestamp; retries with backoff for 24 h, auto-disable + admin alert; **replay** from the delivery log and a test-event button; **thin payloads (IDs + change type) for Confidential / Special entities** (YX-API-10), fuller payloads for non-sensitive events; GraphQL subscriptions not offered (webhooks are the event channel). | 25 Sep 2026 |
| Q6 | **Developer portal** (REST + GraphQL reference, guides, changelog, status page) + **self-serve sandbox tenant with demo data** + Postman collection + **SDKs in 4 languages from day one: TypeScript, Python, Java, .NET**. SDKs are **generated** from the OpenAPI / GraphQL contracts in CI (not hand-written), include the webhook-signature verify helper, and are published to npm, PyPI, Maven Central and NuGet with each release; a smoke test per SDK runs against the sandbox before publishing. | 25 Sep 2026 |
| Q7 | **Wave 6: embeddable web components** (careers page — exists; leave balance / apply leave; org chart; payslip viewer with login) **+ white-label included in the plan** (custom domain, logo, colours, email sender; spec D15); fully custom front-ends via the API allowed any time. **Ambition: Salesforce-style extensibility** — flagged for team review as TR1 below. | 25 Sep 2026 |
| Q8 | **One plan per product plus paid add-ons** (pricing model, spec D15). **API access is included in the plan** with fair-use limits (per-minute and daily calls, webhook endpoints); **higher limits / more endpoints are an add-on** (usage above fair-use); white-label, embeddables and the developer sandbox are **included** (spec D15); no per-call charge at launch; partner marketplace later with TR1. | 25 Sep 2026 |
| F2 | **Consistency fix — event catalogue appendix** (GAP-REGISTER F2): the `event_catalogue` content is [APX-B](APX-B-events.md): every domain event with key, version, producer, payload, P02 sensitivity, consumers (APX-A notification types, P09, modules), public-webhook flag and wave; public webhooks are the rows marked public; one producer per fact (statutory due dates from the compliance calendar only); CI checks that every emitted event is catalogued and consumed (or metrics-only) and every consumer references a catalogued event (APX-B §4). | 26 Sep 2026 |
| B20 | **Gap-register extension (user decision 26 Sep 2026): cross-reference for custom objects.** Custom objects (designed in **P18**) automatically get REST and GraphQL APIs and webhook events through the same service layer and guardrails as built-in resources; included (D18). §3, YX-API-16. TR1 piece (2) is covered by the B20 decision; the rest of TR1 follows P18. | 26 Sep 2026 |
| P22 | **Workflow Studio cross-reference (founder decision 28 Sep 2026):** sandbox-safe SDK subset for P22 script steps (wave 6) and an inbound HMAC-signed webhook trigger per workflow; AI plans execute through the public API only. | 28 Sep 2026 |

### Items for team review

| # | Item | What it would mean (Salesforce reference) | Decide in review |
|---|---|---|---|
| TR1 | **Salesforce-style extensibility platform** (user's direction, 25 Sep 2026) | Salesforce lets customers and partners extend the product: *Lightning Web Components* (a public UI component library customers build their own screens with), *custom objects and fields* with their own APIs, *Experience Cloud* (branded portals for employees / candidates / clients), *AppExchange* (a marketplace of partner apps installed into a tenant), and a metadata-driven UI where admins rearrange page layouts. For YukthiX this would mean: (1) publishing our `ui-v2` components as a documented **component SDK**; (2) **custom objects** (today we have custom fields) exposed automatically via REST / GraphQL and webhooks; (3) **page-layout builder** for admins; (4) **partner app marketplace** using the Q4 OAuth review process; (5) branded portals (candidate portal, client portal and alumni portal already exist as seeds). | Which pieces, in which wave, and the team size / cost; a separate design doc (P12) if approved. |
