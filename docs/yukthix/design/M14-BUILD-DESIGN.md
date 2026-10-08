# M14 · Service Desk · Build design (roadmap step 3b)

> **Status:** 📝 Draft for founder review, 8 Oct 2026. Docs only, no code yet.
> **Scope:** the detailed build design for [M14](M14-itsm-service-desk.md) (scope, gap check, decisions Q1–Q10). It turns M14 into tables, permissions, APIs, jobs, screens, tests and a build order of small pull requests.
> **Order:** four phases, built one after the other: **3b-1 Core → 3b-2 ESM → 3b-3 ITIL → 3b-4 Operations** (M14 Q5).
> **Backlog:** every slice in §16 names its stories. Base stories are `US-B-085…174` (B.json, epic EP-B-2). Gap-check stories are `US-G-001…209` (G.json). A few step-3b stories live in A.json and E.json and are linked too.
> **Clean-room:** all features are described in our own words. No competitor text, screens or field names are copied.

---

## 1. How to read this doc

- **§2** lists the founder decisions we follow. Nothing in this doc changes them.
- **§3–§4** explain the big idea: one engine, three uses, built on the code we already have.
- **§5** is the data model. **§6** is roles, permission keys and who pays.
- **§7–§11** are the engines: tickets, SLA, channels, automation, events.
- **§12** is the API. **§13** is screens. **§14** is security. **§15** is tests.
- **§16** is the build order: small, PR-sized slices with stable IDs (`SD-1.01` …).
- **§17** is the list of things that are still open.

Words used in this doc:

| Word | Meaning |
|---|---|
| **Desk** | One service team's workspace (IT, HR, Admin, Facilities, Finance, Legal, Customer support…). Has its own agents, categories, SLAs, catalogue and privacy. |
| **Record** | Anything worked on a desk: incident, service request, question, problem, change, release. All share one core table (`sd_tickets`). |
| **Requester** | The person who asks for help. An employee, an external customer contact or a guest. Always free. |
| **Agent** | A person who can own, be assigned and answer records. Paid (₹999), except HR desk agents in an HRMS company (Q2). |
| **Collaborator** | Can see records they are added to, add internal notes and do tasks given to them. Cannot own or answer. Free (Q10). |
| **Desk admin** | Sets up one desk. |
| **Platform tenant** | The YukthiX company's own tenant. Our own customer support desk lives here. |

---

## 2. Founder decisions this design follows

| # | Decision (short) | Where it shows in this design |
|---|---|---|
| Q1 | ₹999 / agent / month in India ($10 elsewhere). One plan, every feature. Requesters, assets and approvers free. 30-day trial, no free tier. | §6.3 licensing, SD-1.13 |
| Q2 | Employee → HR helpdesk stays inside the ₹99 HRMS price. Other desk agents pay ₹999. | §6.3, desk `billing_class` |
| Q3 | Device discovery with **osquery** (our API implements its TLS endpoints), MDM import (Intune, Jamf, Google Workspace), optional read-only office probe (SNMP + ARP, not nmap). | §5.4, §14.6, SD-3.13…3.14 |
| Q4 | **No remote actions on devices, ever.** Fixed read-only query pack. | §14.6 (no live-query endpoints) |
| Q5 | Build order 3b-1 → 3b-4. | §16 |
| Q6 | Read-only device data + a button that opens the company's own MDM console. Launch links to the company's own remote-support tool are allowed. | SD-4.23, SD-4.33 |
| Q7 | Identity actions in Entra ID / Google Workspace allowed: off by default, company's own app registration, fewest permissions, approval per action, **step-up for the agent**, full audit, no stored passwords. | §14.7, SD-4.31…4.32 |
| Q8 | One plan. No free tier, no add-on SKUs, no day passes, cloud only. | §6.3 |
| Q9 | AI not in the ₹999. Bring-your-own key = free. YukthiX AI = paid credits (pack sizes set in P14 before 3b-4). | §10.4, SD-4.09 |
| Q10 | Collaborators are free. | §6.3 |

Also followed: M08 (cases stay in M08; its YX-HD-01…05 become the starter rules here), P02 (scopes, restricted areas, external logins, support sessions), P03 (approvals), P04 (notifications, quiet hours, no sensitive data outside the app), P08 (audit), P10 (AI registry, connectors), P11 (API rules), P12 (MFA, step-up), P14 (meter ledger, support tiers, console).

---

## 3. One engine, three uses

There is **one** Service Desk engine. The three uses are only different set-ups of the same tables and code.

| Use | Tenant | Desks | Requesters | Who pays |
|---|---|---|---|---|
| **1. Inside YukthiX HR** | A customer company | HR desk (from M08) + IT, Admin, Facilities, Finance, Legal… | Employees (P01 persons with an employee role) | HR desk agents free with HRMS (Q2). Agents on any other desk ₹999. |
| **2. YukthiX's own support** | The **platform tenant** (YukthiX itself) | "YukthiX Support" desk, worked from the platform console (P14) | Admins and users of customer companies, as contacts of **customer accounts** linked to their tenant | Nobody (our own tenant is not billed). |
| **3. Standalone product** | A company with only the Service Desk product | Any desks | A **light people list** (P01 persons + departments + locations, CSV import, directory sync) plus external customers and guests | ₹999 per agent, every desk. |

How use 2 works (in simple steps):
1. A customer admin clicks **Help → Contact YukthiX** in their own tenant.
2. Their API call goes to one narrow database function, `sd_support_intake()`. It can **only** insert a ticket and its first message into the platform tenant, for the caller's own customer account. It cannot read anything else.
3. The ticket lands in the YukthiX Support desk queue in the console (US-B-116).
4. The console agent sees a side panel with company, products, support tier, health and billing status (P14). **No HR data** (YX-CONSOLE-01).
5. The customer reads their own tickets through a second narrow function, `sd_support_my_tickets()`, filtered to their account.
6. If the agent needs to look inside the customer's tenant, they click **Request access**. This starts a P02 support session with the ticket as the reason (US-B-119, YX-SEC-20).

Why narrow functions: no customer session and no console agent ever gets broad cross-tenant rights. Each function is `SECURITY DEFINER`, takes only the fields it needs, and is covered by tests (§15).

When a standalone company later buys YukthiX HR, nothing moves: its people are already P01 `persons`. HR employee records link to the same persons (US-B-121).

---

## 4. Where it lives and what we reuse

**Code:** a new NestJS area `apps/api/src/service-desk/`, one module per part (`desks`, `tickets`, `sla`, `channels`, `kb`, `catalog`, `rules`, `assets`, `cmdb`, `changes`, `ops`, `ai`). Prisma models in the existing `schema.prisma`. Migrations follow the existing pattern (forced RLS + `tenant_isolation` policy in every migration). Screens come from `packages/yx-ui` and are wired to real APIs (US-A-058).

**Reuse first.** We build only what does not exist.

| Need | Reuse | Status today |
|---|---|---|
| Tenant isolation | `app_current_org()`, `app_is_super_admin()`, forced RLS, `tenant_isolation` policy, `TenantPrismaService.forTenant` | Built (step 0) |
| Current user in SQL | `app_current_user_id()`; restrictive policies (pattern in `pipeline_entries`) | Built |
| People | P01 `persons`, `person_roles`, departments, locations, legal entities, cost centres | Built (step 2) |
| Permissions and scopes | P02 keys, `role_grants`, `permission_profiles`, `ROLE_TEMPLATES`, `resolveScopedGrants`, `RequirePermissions` guard, field redaction | Built (step 2) |
| Login, MFA, step-up, SSO, OTP sign-in | P12 (step 1) | Built |
| Bot check | `assertHuman()` (Cloudflare Turnstile) in `auth/bot-challenge.ts` | Built |
| SSRF guard for outbound URLs | `common/ssrf.ts` | Built |
| Files | `packages/shared/src/storage/blob-storage.service.ts` | Built |
| Jobs | BullMQ (`bullmq` 5.x) + Redis, queue pattern in `hris-exports.queue.ts` | Built |
| Real-time | socket.io gateway pattern with session re-check (`exam-runtime/.../monitoring.gateway.ts`) | Built (exam runtime) |
| Outbound email | nodemailer SMTP transport (`email/smtp-transport.ts`) | Built |
| SMS / WhatsApp sending | `channel_accounts`, `notification_deliveries`, `channel_consents` | Built (step 1+) |
| Audit | `audit_logs` | Built (hash chain from P08 when P08 lands) |
| Custom fields | `custom_field_definitions` / values | Built (old shape; P18 extends) |
| Effective dating | `dated_fact_guard()` and the P06 pattern | Built (step 2) |
| Settings | `settings` (scope + `valid_from`) | Built |
| Approvals engine | P03 | **Built first time needed** (3b-2 catalogue), as a shared engine, not desk-only |
| Notification engine (pipeline, templates, inbox) | P04 | Partly built; finished in 3b-1 as a shared engine |
| Rule / expression engine | P19 | **Built first time needed** (3b-2 automation), shared |
| Forms and custom objects | P18 | Extended in 3b-2 |
| Meter ledger | P14 `meter_events`, `meter_snapshots` | Built with the console (step 3); desk adds meter `sd_agents` |
| AI registry, credits, BYO key | P10 (`AiCreditUsage`, US-E-287) | Extended in 3b-4 |

**New libraries** (all widely used, open source, maintained):

| Library | Use | Why this one |
|---|---|---|
| `mailparser` | Parse incoming MIME email | From the Nodemailer project we already use |
| `mailauth` | Check SPF, DKIM, DMARC, ARC on incoming mail | Same authors; full RFC checks in Node |
| `imapflow` | Read a company mailbox over IMAP | Same authors; modern IMAP client |
| `@azure/msal-node`, `@microsoft/microsoft-graph-client` | Microsoft 365 mailbox, Teams, Entra ID actions | Official Microsoft SDKs |
| `googleapis` | Gmail mailbox, Google Workspace actions | Official Google SDK |
| `email-reply-parser` | Cut quoted history out of replies | Port of a long-used open-source parser |
| `sanitize-html` | Clean HTML from email and the rich editor | Allow-list based |
| `file-type` | Detect the real file type from its bytes | Stops renamed files |
| ClamAV (`clamd`, called over its socket) | Virus scan of every attachment | Standard open-source scanner, runs as a side container |
| `luxon` | Time zones and business-hours maths | Mature time-zone library |
| `rrule`, `ical-generator` | Repeating schedules (recurring tickets, on-call, change windows) and iCal feeds | Standard RFC 5545 tools |
| `@socket.io/redis-adapter` | Live chat and presence across several API servers | Official socket.io adapter (only if §17 D1 picks option A) |
| `ldapts` | Directory sync for standalone desks (AD / LDAP) | Maintained LDAP client |
| `bwip-js` | Barcode and QR labels | Pure JS, many symbologies |

---

## 5. Data model

### 5.1 Rules for every desk table

- Name prefix `sd_`. Primary key `id uuid`. Every row has `organization_id`.
- **Forced RLS** with the standard `tenant_isolation` policy (same SQL block as the people-core migration). A CI test fails if a new `sd_` table has no policy (extends `rls-raw-client-guard.spec.ts`).
- Foreign keys are **composite** `(organization_id, id)`, as in the people tables. A row can never point at another company's row.
- `created_at`, `updated_at`, `created_by`. Records that agents edit have a `version int` for optimistic locking (two agents saving at once: the second gets "this changed, reload").
- Every change to a record, asset or setting writes an audit row in the same transaction (YX-AUD-01). Business events also go to the record's own timeline table (YX-AUD-05).
- **No hard delete** of records. Spam can be purged by a desk admin (audited). Retention jobs follow the company retention schedule (US-B-113, YX-SEC-31).
- Free text that the system searches gets a `tsvector` column with a GIN index. Similar-record search uses `pg_trgm`.
- **Effective-dated** tables (§5.6) use `valid_from` / `valid_to` with `dated_fact_guard()` (no overlaps).

### 5.2 Phase 3b-1 · Core tables

**Desks and people**

| Table | Key fields | Notes |
|---|---|---|
| `sd_desks` | key (e.g. `IT`, used as number prefix), name, kind (`hr`, `it`, `admin`, `facilities`, `finance`, `legal`, `security`, `customer_support`, `custom`), `billing_class` (`hrms_included` / `service_desk`), privacy (`standard` / `restricted`), default calendar, brand, status | `billing_class = hrms_included` only for kind `hr` in a company that has HRMS (§6.3) |
| `sd_desk_members` | desk, user, role (`agent`, `lead`, `admin`, `collaborator`), tier (L1/L2/L3), skills, `valid_from`, `valid_to` | **Effective-dated.** Drives access and billing. |
| `sd_groups`, `sd_group_members` | desk, name, tier, assignment method (manual / round-robin / load / capacity), max open per agent | Assignment groups inside a desk |
| `sd_categories` | desk, parent, name, sensitive flag, default group, default priority, form, active | Two levels at least |
| `sd_ticket_types` | desk, kind (`incident`, `request`, `question`, later `problem`, `change`, `release`), form, lifecycle | US-G-001 |
| `sd_statuses` | desk, ticket type, label, `system_state` (`new`, `open`, `pending`, `on_hold`, `solved`, `closed`), order | Custom labels always map to one system state (US-G-001). SLA and reports use only `system_state`. |
| `sd_priority_matrix` | desk, impact (1–4), urgency (1–4), priority (P1–P4) | Impact × urgency → priority |
| `sd_counters` | desk, kind, next number | `UPDATE … RETURNING` gives gap-free numbers like `IT-10423` |

**Records (one core for all kinds)**

| Table | Key fields | Notes |
|---|---|---|
| `sd_tickets` | desk, number, kind, type, status, `system_state`, priority, impact, urgency, category, subject, requester (person), requested_for (person), opened_by (user), customer account, product, brand, assignee (user), group, channel, sensitive, private, vip, major, parent, merged_into, tags `text[]`, custom `jsonb`, first_response_at, resolved_at, closed_at, reopen_count, resolution_code, resolution_note, version, search `tsvector` | One table for incidents, requests and questions in 3b-1. Problems, changes and releases join in 3b-3 with extension tables. Indexes on (desk, system_state, priority), (assignee, system_state), (requester). |
| `sd_ticket_messages` | ticket, author user or person, kind (`reply`, `note`, `system`, `side`), body_html (cleaned), body_text, channel, email message-id, in-reply-to, sensitive (copied from ticket) | Public replies can't be edited. Notes can, with audit. |
| `sd_attachments` | ticket, message, blob key, file name, sniffed type, size, sha256, scan status (`pending`, `clean`, `blocked`, `infected`), scanned_at | Never served until `clean` (§14.2) |
| `sd_ticket_links` | from, to, kind (`related`, `duplicate`, `blocks`, `caused_by`, `child`) | Merge = `duplicate` + `merged_into` |
| `sd_ticket_watchers` | ticket, person or user, internal / external | CCs from email are added here (US-G-004) |
| `sd_ticket_collaborators` | ticket, user, added_by | The only way a collaborator reaches a record |
| `sd_tasks` | ticket (nullable for standalone tasks), title, assignee, group, due_at, state, order, checklist item flag | Fulfilment tasks, checklists, standalone tasks (US-G-006) |
| `sd_ticket_events` | ticket, kind (state, assign, priority, escalate tier, field), from, to, reason, by, at | Business timeline (YX-AUD-05) |
| `sd_time_entries` | ticket, user, minutes, note, at | Time tracking (US-B-091). 3b-2 adds billable, work type, rate. |
| `sd_side_conversations` | ticket, channel (email / chat / child ticket), with whom, subject | Never visible to the requester (US-G-005) |
| `sd_templates` | desk, ticket type, field defaults, required / hidden fields, checklist | US-G-001 |
| `sd_canned_responses` | desk or personal, title, body with variables | Saved replies |
| `sd_scenarios` | desk, name, list of field changes, note, reply | One-click bundles (US-G-002) |
| `sd_views` | owner or shared, desk, filters `jsonb`, columns, sort, layout (list / board) | Saved views |
| `sd_reminders` | user, ticket, remind_at, note, snoozed_until | US-G-009 |

**SLA**

| Table | Key fields | Notes |
|---|---|---|
| `business_calendars` | name, time zone | **Shared** with P03 approvals (not desk-only) |
| `business_calendar_hours` | calendar, weekday, start, end, `valid_from`, `valid_to` | **Effective-dated** working hours |
| `business_calendar_holidays` | calendar, date, name, half day | Can be filled from a location's holiday list |
| `sd_sla_policies` | desk, name, order, kind (`sla`, `ola`, `uc`), active | |
| `sd_sla_policy_versions` | policy, version, `valid_from`, scope condition (P19 expression, AND / OR), calendar source (`desk`, `requester_location`, `site`), targets `jsonb`, pause rules `jsonb`, milestones `jsonb` | **Effective-dated.** A ticket pins the version it started with (like P03 snapshots). |
| `sd_sla_timers` | ticket, policy version, metric (`assign`, `first_response`, `next_response`, `resolution`, custom), kind, group (for OLA), state (`running`, `paused`, `met`, `breached`, `cancelled`), started_at, business_seconds_used, target_seconds, due_at, paused_since, next_milestone_at, job_version, breached_at, met_at, breach_reason, exclusion approved by | One row per measure per ticket |
| `sd_sla_timer_events` | timer, kind (`start`, `pause`, `resume`, `milestone`, `breach`, `stop`, `restart`), percent, job_version, at, reason | Unique `(timer, kind, percent, job_version)` makes milestone actions run once |
| `sd_sla_compliance_targets` | desk, metric, priority, period (`month`), target % | US-G-015 |

**Email and portal**

| Table | Key fields | Notes |
|---|---|---|
| `sd_mailboxes` | desk, address, kind (`hosted`, `forward`, `m365_oauth`, `gmail_oauth`, `imap`), credentials (encrypted, like `channel_accounts.config_encrypted`), sending domain, SPF / DKIM / DMARC check result, status | US-G-017 |
| `sd_sending_domains` | domain, DKIM key reference (in secrets manager), check results, last checked | Send from the company's own domain |
| `sd_inbound_emails` | mailbox, raw MIME blob key, message-id, from, to, subject, auth results (SPF, DKIM, DMARC, ARC), verdict (`accepted`, `held`, `rejected`, `loop`, `spam`), reason, ticket, processed_at | Raw mail kept for 30 days for proof, then only metadata |
| `sd_email_rules` | mailbox, order, condition, action (`route`, `tag`, `reject`, `set_field`), stop | US-G-018 |
| `sd_portals` | brand, host name (custom domain), theme, sign-up mode (`closed`, `allowed_domains`, `open`), allowed domains, reading aids on | US-B-099, US-G-021 |
| `sd_banners` | portal / desk, audience rule, text, severity, linked incident, starts, ends | Known-issue banners (US-G-020) |
| `sd_banner_votes` | banner, person | One "me too" per person |

**Knowledge and feedback**

| Table | Key fields | Notes |
|---|---|---|
| `sd_kb_spaces` | desk or help centre, audience (`agents`, `requesters`, `public`), languages | |
| `sd_kb_articles` | space, slug, language, state (`draft`, `in_review`, `published`, `retired`), owner, review_due_on, current version, featured, outdated flag, reuse count, search `tsvector` | |
| `sd_kb_article_versions` | article, version, title, body (cleaned HTML), summary, author, approved_by, published_at | Every edit is a new version |
| `sd_kb_blocks` | name, body | Reusable content blocks (US-G-025) |
| `sd_kb_templates` | name, body | Article templates |
| `sd_kb_links` | article, ticket, kind (`linked`, `solved`, `suggested`), by | "This solved it" = deflection (YX-HD-04) |
| `sd_kb_feedback` | article, person, helpful, comment | |
| `sd_kb_searches` | space, query (masked), result count, clicked article, then raised ticket | Content-gap report (US-G-024) |
| `sd_ratings` | ticket, score (1–5), comment, at | CSAT (US-B-108) |
| `sd_surveys`, `sd_survey_responses` | NPS now; full builder in 3b-2 | Separate from the candidate `survey_definitions` table (different subject and rules) |

**Customers, products, sub-companies**

| Table | Key fields | Notes |
|---|---|---|
| `sd_customer_accounts` | name, email domains, account owner, parent account (company groups), `linked_tenant_id` (**platform tenant only**, enforced by a trigger), status | US-G-035, US-G-037 |
| `sd_customer_contacts` | account, person, role (`primary`, `billing`, `technical`) | One person can be in several accounts |
| `sd_entitlements` | account, plan / tier, hours or ticket allowance, channels, `valid_from`, `valid_to` | **Effective-dated.** Drives SLA and routing (US-G-036). For use 2 it mirrors the P14 support tier. |
| `sd_products` | name, KB space, SLA policy | US-G-038 |
| `sd_agent_account_scope` | user, account | Limits an agent to some sub-companies (US-G-037) |

**Reporting, privacy, set-up**

| Table | Key fields | Notes |
|---|---|---|
| `sd_kpi_daily` | date, desk, group, agent, metric, value, target, RAG | Daily KPI snapshots (US-G-026), feeds P09 |
| `sd_sensitive_values` | ticket, message, kind (`aadhaar`, `pan`, `card`, `bank`, `health`, `password`), encrypted value | PII found in text is masked in the message and kept here encrypted (US-G-029) |
| `sd_directory_sources` | kind (`ldap`, `scim`, `entra`, `google`), connector, group → desk / group mapping, last sync | Standalone directory sync (US-G-032) |
| `sd_setup_progress` | step, done_at, by | Set-up checklist (US-G-034) |

### 5.3 Phase 3b-2 · ESM tables

| Table | Key fields | Notes |
|---|---|---|
| `sd_catalog_items` | desk, category, name, short text, rich body, media, audience rule, form (P18), cost, delivery days, state | US-B-124 |
| `sd_catalog_item_versions` | item, version, form version, fulfilment plan `jsonb` (tasks, groups, order, OLAs), approval policy (P03), `valid_from` | Orders pin the version |
| `sd_order_guides` | name, questions, rules → items | US-G-041 |
| `sd_request_items` | ticket (kind `request`), item version, quantity, answers `jsonb`, stage, state | A cart = one request ticket with several items. Each item keeps its own approvals and tasks. |
| `sd_questionnaires` | name, questions, rules | Company-wide reusable question sets (US-G-039) |
| `sd_journeys`, `sd_journey_steps` | kind (`join`, `exit`, `transfer`, `promotion`, `move`, `leave_out`, `return`), trigger (M01 event), steps → catalogue items / tasks per desk | US-B-127, US-G-049 |
| `sd_lifecycles`, `sd_lifecycle_versions` | desk, ticket type, states, allowed moves, fields required per move, who may move | Visual lifecycle designer (US-G-062) |
| `sd_runbooks`, `sd_runbook_versions`, `sd_runbook_runs` | steps with form fields and show / hide rules; run answers per ticket | Guidance only, nothing runs on devices (US-G-055) |
| `sd_rules`, `sd_rule_versions` | desk, trigger (`event`, `field_change`, `time`), condition (P19), actions `jsonb`, order, stop flag, active | US-B-130 |
| `sd_rule_runs` | rule version, ticket, trigger event, per-condition results, actions done, error, at | Rule trace (US-G-051); kept 30 days |
| `sd_recurring` | template, `rrule`, next_run_at, last_run_at, missed runs | US-G-052 |
| `sd_sequences`, `sd_sequence_runs` | steps (delay, message), stop condition | US-G-053 |
| `sd_http_actions` | connector, method, URL template, mapping, retries, timeout | No-code integration steps (US-G-060); URL checked by `ssrf.ts` |
| `sd_external_links` | ticket, system (`jira`, `github`, `azure_devops`), external key, sync state, last sync | US-G-061 |
| `sd_ticket_shares` | ticket, desk or group, level (`view`, `comment`, `full`) | US-G-046 |
| `sd_interactions` | channel (`chat`, `call`, `walk_up`), person, agent, started, ended, outcome, ticket | US-G-056 |
| `sd_chat_sessions` | channel (`web`, `widget`, `whatsapp`, `teams`, `slack`, `sms`), person, agent, state (`queued`, `active`, `ended`), queue, ticket, rating | US-B-132 |
| `sd_chat_messages` | session, author, body, attachment, at | |
| `sd_widgets` | key, allowed origins, identity secret (for signed user tokens), brand | US-G-069 |
| `sd_agent_presence` | user, status (`online`, `away`, `busy`, `offline`), since | Live state in Redis; this table keeps history for reports |
| `sd_agent_capacity` | user, channel, max at once | US-G-075 |
| `sd_shifts` | user, start, end, desk | Uses M02 rosters when the company has YukthiX HR (US-G-076) |
| `sd_brands` | name, help-centre host, sending address, theme, templates | US-G-071 |
| `sd_portal_pages` | brand, audience rule, blocks `jsonb` | Employee centre page builder (US-G-070) |
| `sd_kb_reviews` | article, reviewer, quality checks, score, coaching note | KCS (US-G-072) |
| `sd_contracts` (client) | account, type (`retainer`, `prepaid_hours`, `prepaid_money`, `time_and_material`), amounts, `valid_from`, `valid_to`, low-balance alert | **Effective-dated** (US-G-078) |
| `sd_contract_ledger` | contract, delta, reason, time entry | Append-only balance |
| `sd_rate_cards`, `sd_work_types` | work type, rate, currency | |
| `sd_timesheets` | user, week, state, approver | US-G-079 |
| `sd_services` | name, owner, lifecycle, hours calendar, SLA, cost, consumers, criticality | Business service portfolio (US-G-080). Gets a CI in 3b-3. |

### 5.4 Phase 3b-3 · ITIL tables

**Problem, change, release** (extensions of `sd_tickets`, so they share messages, tasks, links, approvals, timers and numbering)

| Table | Key fields | Notes |
|---|---|---|
| `sd_problem_details` | ticket, root cause, RCA notes (5 whys, fishbone) `jsonb`, workaround, known error, state extra (`risk_accepted`, `fix_deferred`), business impact | US-B-139, US-G-081 |
| `sd_change_details` | ticket, model (`standard`, `normal`, `emergency`), template, risk answers, risk score, planned start / end, actual start / end, implementation / back-out / test plans, outcome, PIR | US-B-141…145 |
| `sd_change_models`, `sd_change_model_versions` | stages, gates, approvers (incl. CI / service owners) | US-G-088 |
| `sd_risk_questionnaires` | questions, weights, score bands | US-B-142 |
| `sd_cab_boards`, `sd_cab_members` | name, members, quorum | CAB members are approvers (free) |
| `sd_cab_meetings`, `sd_cab_agenda` | date, board, changes, decisions | US-B-143 |
| `sd_change_windows` | kind (`blackout`, `freeze`, `maintenance`, `busy_day`), CI / service / global, `rrule`, start, end | Conflict checks (US-B-144, US-G-086) |
| `sd_change_success` | team, model, period, success % | Auto-approve proven low-risk changes (US-G-084) |
| `sd_release_details` | ticket, type, phase, readiness checklist, go / no-go record | US-G-092 |
| `sd_deployments` | release / change, environment, status, commits / PRs / builds refs | US-G-093 |
| `sd_software_library` | product, approved version, release notes, published to portal | US-G-094 |

**Assets**

| Table | Key fields | Notes |
|---|---|---|
| `sd_asset_types` | parent, name, attribute schema `jsonb`, is CI, is bookable | Types with inheritance (US-G-108). Starter types: laptop, desktop, phone, monitor, furniture, vehicle, access card, key, locker, SIM, rack, network port, … |
| `sd_asset_models` | type, maker, model, consumable flag, default life, depreciation method | |
| `sd_assets` | type, model, tag, serial, status (`ordered`, `in_stock`, `assigned`, `in_repair`, `on_loan`, `retired`, `disposed`), location, stock room, cost, purchase date, vendor, PO line, warranty end, AMC / lease refs, custom `jsonb`, CI | US-B-147 |
| `sd_asset_assignments` | asset, to person / location / department, `valid_from`, `valid_to`, condition out / in, photos, hand-over document (P05) | **Effective-dated.** Replaces the M01 asset register (US-D-054, US-D-055 use it). |
| `sd_asset_events` | asset, kind, from, to, by, at | Full lifecycle history |
| `sd_depreciation` | asset, method (`straight_line`, `wdv`), life, salvage, start; monthly rows (period, opening, charge, closing) | US-B-149 |
| `sd_stock_rooms`, `sd_stock_levels`, `sd_stock_moves` | room, model, quantity, reorder level | Consumables and transfers (US-G-099) |
| `sd_loans` | asset, borrower, due, returned, condition | US-G-100 |
| `sd_verification_campaigns`, `sd_verification_items` | location, expected assets, result (`found`, `missing`, `unexpected`) | US-G-101 |
| `sd_disposals` | asset, method, data-wipe certificate, e-waste certificate, sale value, write-off | US-G-102 |
| `sd_certificates_domains` | kind (`tls`, `domain`), name, issuer, expiry, owner | US-G-103 |
| `sd_ip_subnets`, `sd_ip_addresses` | CIDR, IP, asset | US-G-110 |
| `sd_asset_security_status` | asset, source, patch level, findings, read at | Read-only (US-G-104) |

**Software, licences, SaaS**

| Table | Key fields | Notes |
|---|---|---|
| `sd_software_titles` | publisher, product, version, edition | Normalised names (US-G-095) |
| `sd_software_aliases` | raw name pattern → title | |
| `sd_software_installs` | asset, title, raw name, version, first seen, last seen | |
| `sd_software_policies` | title, `allowed` / `banned` | Banned found → ticket (US-G-107) |
| `sd_licences` | title, metric (`user`, `device`, `core`, `concurrent`, `subscription`), quantity, contract, renewal date | US-B-153, US-G-097 |
| `sd_licence_allocations` | licence, person / asset, from, to | |
| `sd_saas_apps`, `sd_saas_usage` | app, source (SSO sign-ins, spend), seats, last use per person | US-G-098 |

**Discovery**

| Table | Key fields | Notes |
|---|---|---|
| `sd_osquery_enrolment` | company enrolment secret (hash), rotated_at, status | One per company, rotatable |
| `sd_osquery_nodes` | node key (hash), host identifier, asset, platform, last config, last log, revoked | Per-device key, revocable |
| `sd_discovery_sources` | kind (`osquery`, `intune`, `jamf`, `google`, `csv`, `probe`, `aws`, `azure`, `gcp`, `vmware`, `rmm`), connector, field priority `jsonb` | US-G-096 |
| `sd_discovery_records` | source, external id, payload `jsonb`, matched asset, match rule, conflicts, seen_at | Multi-source matching and data-quality score |
| `sd_probes` | name, site, key (hash), last seen | Office probe registration |

**CMDB**

| Table | Key fields | Notes |
|---|---|---|
| `sd_ci_classes` | parent, name, attributes | Includes `business_service`, `technical_service` |
| `sd_cis` | class, name, owner, criticality, status, asset, service, attributes `jsonb` | US-B-156 |
| `sd_ci_relations` | from CI, to CI, type (`runs_on`, `depends_on`, `connected_to`, `uses`), `valid_from`, `valid_to`, source | **Effective-dated.** Impact = recursive query with a depth limit (US-B-157). |
| `sd_ci_baselines` | CI, snapshot `jsonb`, taken_at | Drift checks (US-G-087) |
| `sd_ticket_cis` | ticket, CI, role (`affected`, `caused_by`) | |

**Vendors, procurement, money, risk**

| Table | Key fields | Notes |
|---|---|---|
| `sd_vendors`, `sd_vendor_contacts` | name, GSTIN, contacts, scorecard | |
| `sd_vendor_contracts` | vendor, kind (`amc`, `lease`, `licence`, `support`), value, `valid_from`, `valid_to`, renewal notice days, SLA (underpinning) | **Effective-dated** |
| `sd_purchase_requests`, `sd_purchase_orders`, `sd_po_lines`, `sd_goods_receipts` | items, approvals (P03), receiving into stock / assets | US-B-159 |
| `sd_vendor_escalations` | ticket, vendor, vendor case no., UC timer | US-G-119 |
| `sd_service_credits` | contract, period, measure, credit / penalty | US-G-120 |
| `sd_outages` | service CI, start, end, planned, cause ticket | US-G-121 |
| `sd_budgets` | cost centre (existing table), period, amount | US-G-122 |
| `sd_cost_lines` | ticket, kind (`time`, `fixed`, `material`), amount | US-G-123 |
| `sd_chargeback_statements` | department, period, lines | US-G-124 |
| `sd_risks` | title, owner, likelihood, impact, links (services, changes, assets, vendors), treatment | US-G-125 |
| `sd_client_invoices`, `sd_billing_runs` | account, period, lines from contracts / time / parts | Client billing (US-G-126); these are the company's invoices to its clients, not YukthiX invoices |
| `sd_parts_used` | ticket, item, cost, sell price | US-G-128 |
| `sd_tickets_archive` | same columns as `sd_tickets` | Closed records older than the company setting move here. Read-only, still searchable (US-G-130). |

### 5.5 Phase 3b-4 · Operations tables

| Area | Tables (key fields) |
|---|---|
| Monitoring | `sd_alert_sources` (kind, signing secret, field mapping), `sd_alerts` (source, fingerprint, severity, state `firing` / `acked` / `resolved`, CI, incident, first / last seen, count), `sd_event_rules` (map, classify, correlate, suppress), `sd_heartbeats` (name, interval, last beat), `sd_uptime_checks` (kind `http` / `tcp` / `tls`, target, interval, last result) |
| On-call | `sd_oncall_schedules`, `sd_oncall_layers` (members, `rrule`, hand-off time, time zone), `sd_oncall_overrides` (user, from, to, reason, source `manual` / `leave`), `sd_escalation_policies`, `sd_escalation_steps` (wait, target), `sd_paging_rules` (per person: channels and delays), `sd_pages` (alert / ticket, user, channel, sent, acked, escalated) |
| Status pages | `sd_status_pages` (public / private, host, theme), `sd_status_components` (service CI), `sd_status_incidents`, `sd_status_updates`, `sd_status_subscribers` (email verified by double opt-in, component filter) |
| Major incident | `sd_major_incidents` (ticket, state `proposed` / `accepted` / `resolved`, comms plan, bridge link, chat channel), `sd_incident_timeline` (auto entries), `sd_response_templates`, `sd_reviews` (post-incident review) |
| AI | `sd_ai_settings` (desk, feature on / off, provider mode `byo_key` / `yukthix_credits`, data scope), `sd_va_topics`, `sd_va_flows`; calls go to P10 `ai_calls` |
| Projects | `sd_projects`, `sd_project_tasks` (dependencies, milestones), `sd_demands` (value, cost, risk score) |
| Facilities | `sd_spaces` (site, building, floor, room, desk; floor plan file; capacity; bookable), `sd_bookings` (space, person, start, end, services → tasks), `sd_maintenance_plans` (asset, `rrule`, checklist, meter readings), `sd_dispatch` (technician, site, slot, travel) |
| Telephony and walk-up | `sd_calls` (provider, call id, from, recording blob, voicemail), `sd_walkup_queue`, `sd_appointments` |
| MSP and exchange | `sd_exchange_links` (remote desk, shared secret, mapping), `sd_opportunities`, `sd_quotes` |
| Security desk | Desk with `kind = security`, `privacy = restricted`; `sd_evidence` (append-only, sha256 per item) |
| Experience and quality | `sd_xla_scores`, `sd_improvements`, `sd_bia` (RTO, RPO), `sd_dr_tests`, `sd_qa_scorecards`, `sd_qa_reviews`, `sd_skills`, `sd_points` |
| Customer health | `sd_account_health` (score, signals, at) |
| Identity actions | `sd_idp_connections` (provider `entra` / `google`, app registration, scopes, admin unit / OU limit, credentials encrypted, status), `sd_identity_actions` (ticket, action, target account, approved_by, run_by, step-up at, provider request id, result, error) |
| Config packages | `sd_config_packages` (export, diff, import log) |

### 5.6 Effective-dated tables

These keep history with `valid_from` / `valid_to`. Past facts never change. A change makes a new row.

| Table | Why dated |
|---|---|
| `sd_desk_members` | Who was an agent on which day (billing, reports, audit) |
| `business_calendar_hours` | Hours change; old tickets keep old maths |
| `sd_sla_policy_versions` | A ticket keeps the targets it started with |
| `sd_entitlements` | Customer tier on the ticket's date |
| `sd_contracts`, `sd_vendor_contracts` | Balance, renewals, credits by period |
| `sd_asset_assignments` | Who held the asset on a date (exit, audits, loss) |
| `sd_ci_relations` | Impact at the time of an incident; change reviews |
| `sd_catalog_item_versions`, `sd_lifecycle_versions`, `sd_rule_versions`, `sd_change_model_versions` | An open record keeps the version it started with |
| `sd_oncall_layers`, `sd_oncall_overrides` | Who was on call when a page went out |

### 5.7 Sensitive records and restricted desks (RLS detail)

Two layers, both in the database, not only in the app:

1. **Tenant layer:** the standard `tenant_isolation` policy on every table.
2. **Visibility layer:** a `RESTRICTIVE` policy on `sd_tickets` and on its child tables (messages, attachments, events, tasks, timers). Child tables carry copies of `desk_id`, `sensitive` and `private` (kept in step by a trigger) so the policy is a fast column check.

The visibility policy, in words:
- A record that is **not** sensitive, **not** private and on a **standard** desk passes the database check. The app then applies P02 scopes (which desks a user may see).
- A **sensitive or private** record, or any record on a **restricted** desk, is visible only to:
  - its requester and requested-for person (via a new SQL helper `app_current_person_id()`, set by the API next to the user id);
  - active `agent` / `lead` members of that desk;
  - collaborators added to that record;
  - members of a desk it is shared with (`sd_ticket_shares`), when the share allows it.
- **Never** by role alone. Not by a company admin, not by a desk admin who is not an agent there, not by YukthiX staff, not by a super-admin session (YX-SEC-10). The restrictive policy has **no** super-admin escape.

M08 confidential categories (payroll, medical, personal) map to `sensitive = true` (YX-HD-03). Grievance, POSH, disciplinary, whistleblower and accident cases stay in M08 case tables; a desk agent can only **convert** a ticket into an M08 case (one-way, audited), never see cases.

---

## 6. Roles, permission keys and licensing

### 6.1 Roles

Roles are P02 role templates in `ROLE_TEMPLATES` (data, not code names, YX-SEC-02). A company can copy and edit them. Desk reach comes from `sd_desk_members`.

| Role | Who | Can | Cannot | Paid? |
|---|---|---|---|---|
| **Requester** (implicit, no grant) | Every employee; external contacts and guests via OTP external login (P02 §4.7) | Raise, follow, reply, rate own records; use portal, catalogue, KB, bookings | See others' records (except organisation-wide view for customer contacts who are allowed it) | Free |
| **Approver** (implicit, from P03) | Anyone named by a policy; CAB members | Approve / reject what is sent to them | Work records | Free |
| **Collaborator** | Any staff user added to a record | View records they are added to, internal notes, their tasks | Own, be assigned, reply to the requester, see other records | **Free** (Q10) |
| **Agent** | Desk member with role `agent` | Work records on their desks: own, assign, reply, notes, merge, link, time, KB drafts | Desk set-up | **₹999** (except §6.3 HR rule) |
| **Team lead** | Desk member `lead` | Agent + assign others, bulk, reports, approve breach exclusions | Desk set-up | ₹999 |
| **Desk admin** | Desk member `admin` | Set up one desk: categories, SLA, rules, catalogue, mailboxes, portal pieces | See restricted records unless also agent there | See §17 D3 |
| **Service Desk admin** | Company-wide | Create desks, grant agent seats (with cost shown), brands, portals, billing view | Restricted records | See §17 D3 |
| 3b-3: **Problem manager**, **Change manager**, **Release manager**, **Asset manager**, **CMDB owner**, **CAB member** | Desk members with these duties | Their practice's records and set-up | — | CAB = free (approver). Others: §17 D3 |
| 3b-4: **On-call responder**, **Status page editor**, **Identity action operator** | Named users | Their duty only | — | §17 D3 |

### 6.2 Permission keys

Same style as today (`employee.profile.view`). Every endpoint declares one (YX-SEC-01). Scope for desk keys = the desks where the user is a member, read from `sd_desk_members`, so `role_grants` needs **no** new scope type.

| Phase | Keys |
|---|---|
| 3b-1 | `desk.ticket.view`, `desk.ticket.work` (own, be assigned, reply: **the paid key**), `desk.ticket.note`, `desk.ticket.assign`, `desk.ticket.bulk`, `desk.ticket.merge`, `desk.ticket.export`, `desk.ticket.purge_spam`, `desk.task.work`, `desk.kb.view_internal`, `desk.kb.author`, `desk.kb.publish`, `desk.sla.manage`, `desk.settings.manage`, `desk.member.manage`, `desk.desk.create`, `desk.portal.manage`, `desk.mailbox.manage`, `desk.customer.manage`, `desk.report.view`, `desk.report.manage`, `desk.audit.view`, `desk.pii.unmask` (step-up, audited), `desk.directory.manage`; reuse `request.raise_on_behalf` (P02) for "raise for someone else" |
| 3b-2 | `desk.catalog.manage`, `desk.lifecycle.manage`, `desk.rule.manage`, `desk.integration.manage` (step-up), `desk.channel.manage`, `desk.chat.work`, `desk.survey.manage`, `desk.service.manage`, `desk.contract.manage`, `desk.time.approve`, `desk.hr_summary.view`, `desk.ticket.move` |
| 3b-3 | `desk.problem.manage`, `desk.change.raise`, `desk.change.manage`, `desk.change.approve`, `desk.release.manage`, `desk.asset.view`, `desk.asset.manage`, `desk.discovery.manage` (step-up: enrolment secret, connectors), `desk.licence.manage`, `desk.cmdb.manage`, `desk.vendor.manage`, `desk.purchase.raise`, `desk.purchase.approve`, `desk.finance.view`, `desk.risk.manage`, `desk.client_billing.manage` |
| 3b-4 | `desk.alert.manage`, `desk.oncall.manage`, `desk.oncall.respond`, `desk.statuspage.manage`, `desk.major_incident.declare`, `desk.ai.manage`, `desk.project.manage`, `desk.facility.manage`, `desk.import.run`, `desk.marketplace.manage`, `desk.idp.connect` (step-up), `desk.identity_action.run` (step-up), `desk.identity_action.approve` |

Implicit (no key, computed like P02 Employee @ self): raise a record, see own records, order from catalogue, book a space, rate, read public / requester KB.

### 6.3 Who pays and how we enforce it

**Rules** (from Q1, Q2, Q10 and US-B-122 / US-B-123):

| # | Rule |
|---|---|
| L1 | A **paid agent** is a user who holds an active `agent` or `lead` membership (the `desk.ticket.work` key) on at least one desk with `billing_class = service_desk`. |
| L2 | A user is counted **once** per month, however many desks they are on (US-B-123). |
| L3 | **HR desk in an HRMS company:** the desk gets `billing_class = hrms_included`. Its agents are free. If the same person is also an agent on any other desk, they are paid once (L2). |
| L4 | HR desk in a standalone company (no HRMS): `service_desk` class, paid. |
| L5 | Requesters, approvers, CAB members, collaborators, external contacts, guests: free and unlimited. Assets free and unlimited. |
| L6 | The platform tenant (YukthiX's own support) is not billed. |
| L7 | Minimum ₹999 a month, annual 10 for 12, founding offer ₹799 for 36 months for the first 100 companies, 30-day trial with no card (Q1, YX-TEN-08). These live in P14 pricing, not in desk code. |

**Enforcement:**

| Where | How |
|---|---|
| Granting a seat | Only `desk.member.manage`. The screen shows "this adds ₹999 / month" (or "free: HR desk") before saving. Audited. |
| API | Assign, own, reply and chat-accept call one check: does the user hold `desk.ticket.work` on this desk today? Collaborators get `403 DESK_AGENT_SEAT_REQUIRED`. |
| Database | A trigger on `sd_tickets.assignee` and on reply messages checks an active agent membership on that desk (defence in depth). |
| HR class | `billing_class` is set by the system from the company's products, not by the admin. A change is audited. |
| Metering | A daily BullMQ job writes P14 `meter_events` (meter `sd_agents`, quantity, list of user ids). The monthly snapshot counts distinct users (§17 D2 for the exact counting rule). The company can download the list (YX-BILL-02). |
| Non-payment | A restricted / suspended company (P14) keeps requester access to their own records; agents become read-only (same spirit as YX-TEN-02). |

---

## 7. Ticket engine rules

New rule IDs `YX-SD-nn`. M08 YX-HD-01…05 become the **starter values** of these rules (a company can change them, D17 / P19).

| ID | Rule |
|---|---|
| YX-SD-01 | Every record belongs to exactly one desk and gets a gap-free number with the desk prefix. |
| YX-SD-02 | Status labels are free text, but each maps to one fixed system state. SLA, reports and rules use only the system state. |
| YX-SD-03 | Priority comes from the desk's impact × urgency matrix unless an agent sets it with a reason. VIP requesters can raise it one step (desk setting). |
| YX-SD-04 | Routing order: email / channel rule → category default group → rules (3b-2) → method of the group (manual, round-robin, load, capacity). |
| YX-SD-05 | Auto-assignment skips agents who are offline, away, on approved leave (M02 when present) or outside their shift (US-G-011). If nobody is free, the record waits in the group queue. |
| YX-SD-06 | Only a paid agent (§6.3) can own, be assigned or reply. Collaborators add notes and do their tasks only. |
| YX-SD-07 | Two agents on one record: the second sees who else is viewing or typing (live presence). A save on a stale version is refused with "changed by X, reload" (optimistic lock). |
| YX-SD-08 | Merge keeps every message, watcher and attachment on the surviving record. The merged record becomes `closed` with a link. Merge across desks needs both desks' rights. |
| YX-SD-09 | Converting a ticket type keeps its history and restarts SLA targets under the new type (US-G-001). |
| YX-SD-10 | A resolved record closes automatically after the desk's wait (starter: 3 days without reply, YX-HD-05). A requester can reopen within the desk's window (starter: 7 days). After that, a reply opens a linked follow-up record. |
| YX-SD-11 | Resolving needs a resolution code and note when the desk asks for them. |
| YX-SD-12 | Every move between L1 / L2 / L3 is a timeline event with a reason (US-G-007). |
| YX-SD-13 | Side conversations and internal notes never reach the requester by any channel. |
| YX-SD-14 | Sensitive and private records follow §5.7. Notifications about them outside the app say only that there is an update (P04 Q6). |
| YX-SD-15 | Personal data found in text (Aadhaar, PAN, card, bank account, passwords, health words) is masked on save; the original is stored encrypted and shown only with `desk.pii.unmask` + step-up, each view audited. Masked text is what goes to search, email and AI. |
| YX-SD-16 | A requester sees only their own records, plus records they watch, plus their customer account's records when the account allows organisation-wide view. |
| YX-SD-17 | Who read a record is logged (deduplicated per viewer × record × 30 min, YX-AUD-04) and shown to `desk.audit.view` holders (US-G-030). |
| YX-SD-18 | Bulk actions run each record through the same checks as a single edit; a failed record is listed, the rest go on. |
| YX-SD-19 | Records are never hard-deleted. Spam purge is audited and keeps a stub (number, date, purged by). |
| YX-SD-20 | A ticket in a sensitive category can be converted to an M08 case only by an agent of that desk; the conversion is one-way and the ticket keeps only a "moved to a confidential case" stub. |

---

## 8. SLA / OLA engine

### 8.1 What it measures

- **SLA:** promise to the requester. Measures: time to assign, first response, next response, resolution, and custom measures (US-G-012).
- **OLA:** promise between internal groups, attached to a group assignment or a fulfilment task (US-B-097).
- **UC (underpinning contract):** promise from a vendor, attached to a vendor escalation (3b-3, US-G-119).

All three use the same timer table and code (`kind` = `sla` / `ola` / `uc`).

### 8.2 Business hours

- A calendar = time zone + weekly hours (dated) + holidays.
- Which calendar a timer uses: the desk's, the requester's location, or the site's (policy setting, US-G-013).
- Business-time maths is one small pure module (`business-time.ts`, `luxon` for zones), shared with P03. Two functions: "add N business seconds to time T" and "business seconds between A and B". Heavy unit tests (§15).
- Every time is stored in UTC and shown in the viewer's own zone and locale (US-G-022).

### 8.3 Which policy applies

1. On create, policies are checked in order; the first whose scope condition matches wins (AND / OR on any field, US-G-013).
2. The ticket pins that **policy version**.
3. If priority, category, customer tier or type changes, the policy is checked again. The desk chooses: **keep elapsed time** (default) or **retroactive start** (recount from the original start time).

### 8.4 Timer states and pause rules

```
running → paused → running → met
   └──────────────→ breached (keeps running to show how late)
any → cancelled (ticket merged, converted, or policy no longer applies)
```

- Pause rules are part of the policy version. Starter rule: pause while the system state is `pending` (waiting on requester) or `on_hold` (waiting on vendor or change). A desk can add conditions on any field.
- Each pause / resume writes a timer event with the reason. The ticket's **SLA timeline** shows running, paused and breached parts (US-G-016).

### 8.5 Jobs on BullMQ

| Job | Queue | How |
|---|---|---|
| Milestone fire | `sd-sla` (delayed jobs) | Each running timer has one delayed job for its **next** milestone (50 %, 75 %, 100 %, any % the policy sets). Job id = `timer:milestone:job_version`. Any change to the timer bumps `job_version`; an old job wakes, sees a stale version, does nothing. |
| Safety sweep | `sd-sla-sweep` (repeat every 60 s) | `SELECT … WHERE state = 'running' AND next_milestone_at <= now() FOR UPDATE SKIP LOCKED` catches jobs lost in a Redis restart. |
| Exactly once | — | The milestone action first inserts into `sd_sla_timer_events` (unique key). If the insert conflicts, it was already done. Effects (notify, escalate, reassign, raise priority) go through the outbox (YX-NTF-01). |
| Compliance | `sd-sla-daily` (cron 01:00 company time) | Period % per desk / metric / priority vs target; "at risk" when the forecast for the month falls below target (US-G-015). |
| KPI snapshots | `sd-kpi-daily` | Writes `sd_kpi_daily` (US-G-026). |
| Auto-close | `sd-autoclose` (repeat 15 min) | YX-SD-10. |

Breach: the timer becomes `breached`, event `helpdesk.ticket.sla_breached`, escalation chain runs (lead, then next level, as set in the policy). The agent can add a **breach reason**; a lead can approve an **exclusion** (e.g. requester did not answer), audited (US-G-015).

---

## 9. Channels

### 9.1 Email in (3b-1)

**How mail reaches us** (three ways, one pipeline):

| Way | For | How |
|---|---|---|
| Hosted address | Quick start, YukthiX support@ | A desk address on our domain. The mail provider posts the **raw MIME** to `POST /desk/inbound/email/{mailboxToken}` (signed). Provider choice: §17 D5. |
| Forwarding | Company keeps its own address | Company forwards its address to the hosted address. |
| Company mailbox | Send and receive as the company (US-G-017) | OAuth to Microsoft 365 (Graph) or Gmail (Gmail API) with the fewest mail scopes; or IMAP / SMTP with an app password. Polled by job `sd-mail-poll` (every 1 min per mailbox, with push notifications where the provider offers them). |

**Pipeline** (job `sd-mail-in`, one message at a time, idempotent on Message-ID + mailbox):
1. Store the raw MIME in blob storage. Write `sd_inbound_emails` (`pending`).
2. **Authenticate** with `mailauth`: SPF, DKIM, DMARC, ARC. We never trust a provider's own verdict. Result stored (§14.3).
3. **Loop and auto-reply check:** drop or hold if `Auto-Submitted` is not `no`, `Precedence: bulk/junk/list`, `X-Autoreply`, our own sending address, or more than N mails from one sender in 10 minutes. No auto-acknowledgement is ever sent to these.
4. **Parse** with `mailparser`: text, HTML, attachments, inline images, headers.
5. **Clean** HTML with `sanitize-html` (allow-list; no scripts, no remote images by default, links get `rel="noopener noreferrer"`).
6. **Thread:** match in this order: (a) our signed reply-to token (`desk+t.<ticket>.<hmac>@…`), (b) `In-Reply-To` / `References` against stored message ids, (c) ticket number in the subject **only if** the sender is the requester or a watcher. Else a new record.
7. **Strip quoted history** with `email-reply-parser` (keep the full original as an attachment-like "show original").
8. **Email rules** (US-G-018): route, tag, reject, fill fields from subject or body.
9. **Email commands** (US-G-019): lines like `#status solved` or `#approve` work only for agents, or for approved requesters on their own records, and only when DMARC passed.
10. Attachments go to the scan queue (§14.2).
11. Create the record or add the message; add CCs as watchers.
12. Send the auto-acknowledgement with number and up to 3 suggested articles (US-G-019), unless step 3 blocked it.

**Unknown sender on YukthiX support:** the record is **held** for an agent to link to the right customer account (US-B-120).

### 9.2 Email out

- nodemailer, DKIM-signed with the company's key when they send from their own domain. The set-up screen checks SPF, DKIM and DMARC records and shows what to fix (US-G-017).
- Every outgoing mail carries `Message-ID`, `In-Reply-To`, `References`, our signed reply-to token, and `Auto-Submitted: auto-replied` on automatic mails.
- Bounces and complaints update the P04 channel status for that address (YX-NTF-11) and show in the desk's bounce list.

### 9.3 Portal and in-app help drawer (3b-1)

- Portal per brand with its own host name, theme and login screen (US-B-099, US-G-022). Custom domains get TLS through the hosting edge.
- In-app help drawer in YukthiX HR: raise, follow, KB (US-B-100). It calls the same API.
- Article suggestions while typing (search on subject + body, US-B-105).
- **Open portal** (US-G-021): raise without an account by confirming an email link; Turnstile check (`assertHuman`); rate limits (§14.4); sign-up only from allowed domains when the company sets it.
- External requesters sign in with OTP (P02 §4.7, YX-SEC-21): own records only, not billed, expire, audited (US-B-103).

### 9.4 Live chat and messaging (3b-2)

| Channel | How it comes in | Notes |
|---|---|---|
| Web chat (portal, drawer, widget) | Real-time transport (§17 D1) | Chat → ticket with transcript when it ends unresolved or no agent is free (US-B-132). Agents take several chats up to their capacity. |
| WhatsApp | The company's own WhatsApp Business number (P04 Q2), inbound webhook, signature checked | Business-started messages only with approved templates (YX-NTF-07); opt-in required (YX-NTF-14). |
| Microsoft Teams / Slack | P04 §4.9 apps; act only for linked users (YX-NTF-16, US-E-282) | Requesters raise and follow; agents can work records in chat (US-G-057). |
| SMS (two-way) | Company's own SMS gateway account (`channel_accounts`), inbound webhook | DLT templates for business-started SMS (US-G-058). |
| Phone | Agent logs the call as an interaction or ticket (US-B-135); telephony in 3b-4 | |

### 9.5 Later channels (3b-4)

Telephony (Exotel, Knowlarity and others via connectors: caller pop-up, recordings, voicemail tickets), social channels, helper app, Outlook add-in, walk-up kiosk. All of them create the same records through the same service layer (YX-API-02).

---

## 10. Automation and AI

### 10.1 Rules (3b-2)

- Built on **P19** (one expression language for the whole product). The desk registers its **policy points** and **automation triggers / actions** with P19. If P19 is not built by then, slice SD-2.01 builds its core as a shared package, not a desk-only engine.
- **Triggers:** an event (APX-B), a field change, or time ("2 hours with no reply", "3 days before warranty ends").
- **Conditions:** P19 no-code builder (AND / OR on any field, including custom fields).
- **Actions:** assign, set field, add tag, notify (P04), escalate, add task, apply template, start approval (P03), call webhook or HTTP step (P11, US-G-060), create linked record.
- **Safety:** a rule chain stops at depth 3; a rule never re-fires on the same record within one chain; per-company rule-run limit per minute; each run writes a **trace** (`sd_rule_runs`) that shows which condition passed or failed (US-G-051).
- Time rules: job `sd-rule-tick` every 5 minutes scans only records matching the rule's time window (indexed columns), with `SKIP LOCKED`.
- **Recipes:** ready rules shipped in code (US-G-051), installed as normal editable rules.

### 10.2 Recurring work (3b-2)

`rrule` schedules create records from templates (US-G-052). Job `sd-recurring` (every 5 min). A missed run (e.g. outage) is created late and marked "late".

### 10.3 Integrations (3b-2)

- All outside calls go through the P10 connector framework: owner, encrypted credentials, health, logs (US-E-279, YX-INT-01).
- Every URL passes `ssrf.ts` (no private IPs, no metadata endpoints, DNS re-checked at connect).
- Jira / GitHub / Azure DevOps two-way sync uses their webhooks + API; loops are stopped by an origin marker on every synced comment (US-G-061).

### 10.4 AI (3b-4)

- Every AI feature is a registered P10 feature (YX-AI-07) with eval gate, kill switch and data rules (US-E-287…293).
- **Q9:** the company chooses per desk: **bring your own key** (no YukthiX charge) or **YukthiX AI credits** (metered in P14). With neither, AI buttons are hidden with a reason (US-A-058 rule: never silent).
- Only masked text (YX-SD-15) goes to AI. Sensitive and restricted records are never sent (YX-AI-02).
- AI only **suggests**. A person accepts (YX-AI-01). The virtual agent may **raise** records and **start** requests the requester could start themselves; it never approves.
- Ticket and email content is untrusted input in prompts (YX-AI-05); tools are read-only desk APIs under the user's own rights.

---

## 11. Events and notifications

We keep the `helpdesk.` prefix already used in APX-B and APX-A, so M08 and M14 stay one family. All events go through the transactional outbox (YX-NTF-01). Sensitive records carry ids only (YX-API-10).

### 11.1 Events (APX-B additions)

| Phase | Events |
|---|---|
| 3b-1 | `helpdesk.ticket.created`, `.assigned`, `.replied`, `.note_added`, `.status_changed`, `.priority_changed`, `.merged`, `.reopened`, `.resolved`, `.closed`, `.sla_warning`, `.sla_breached`, `.sla_met`, `.rated`; `helpdesk.task.assigned`, `.completed`; `helpdesk.email.held`, `.rejected`; `helpdesk.kb.article.published`, `.review_due`; `helpdesk.banner.published`; `helpdesk.agent_seat.granted`, `.removed` |
| 3b-2 | `helpdesk.request.submitted`, `.approved`, `.rejected`, `.cancelled`, `.fulfilled`; `helpdesk.chat.started`, `.missed`, `.ended`; `helpdesk.rule.failed`; `helpdesk.ticket.moved`, `.shared`; `helpdesk.journey.started` |
| 3b-3 | `helpdesk.problem.created`, `.known_error_published`, `.resolved`; `helpdesk.change.submitted`, `.approved`, `.rejected`, `.scheduled`, `.implemented`, `.failed`, `.conflict_found`; `helpdesk.release.go_decision`; `helpdesk.asset.assigned`, `.returned`, `.warranty_expiring`, `.missing`, `.disposed`; `helpdesk.licence.over_used`, `.renewal_due`; `helpdesk.discovery.banned_software_found`, `.drift_found`; `helpdesk.contract.renewal_due`; `helpdesk.po.approved`, `.received` |
| 3b-4 | `helpdesk.alert.fired`, `.resolved`; `helpdesk.page.sent`, `.acked`, `.escalated`; `helpdesk.major_incident.proposed`, `.declared`, `.update_due`, `.resolved`; `helpdesk.status.incident_posted`; `helpdesk.identity_action.requested`, `.approved`, `.done`, `.failed`; `helpdesk.booking.created`, `.cancelled` |

Inbound from other modules: `employment.*` (M01 joins, exits, transfers → journeys), approved leave (M02 → assignment skips, on-call overrides), `policy.version.published` (M08 → KB / AI index).

### 11.2 Notifications (APX-A additions)

Existing ids `helpdesk.ticket.created.requester` … `helpdesk.ticket.resolved.requester` stay. New ones follow the same pattern `<event>.<audience>`.

| Phase | Notification (audience) | Channels | Notes |
|---|---|---|---|
| 3b-1 | ticket replied / status changed (requester, watchers), note mention (agent, collaborator), task assigned (assignee), SLA warning (agent), breach (lead, escalation chain), auto-close warning (requester), rating request (requester), email held (desk admin), article review due (owner), seat granted (user, billing contact) | In-app, push, email; requester by the channel the record came from | Sensitive records: neutral text only (YX-SD-14). Quiet hours (P04 Q7) except P1 breach to on-duty agent. |
| 3b-2 | approval needed (approver: in-app, push, email, Teams / Slack card), request stage changed (requester), chat waiting (agents online), rule failed (desk admin), contract low balance (account owner) | + WhatsApp / SMS where the company enabled them | Out-of-app approval links follow P03 Q4 (signed, single-use, 72 h, low-risk only) |
| 3b-3 | CAB agenda (CAB), change approved / rejected (change owner), outage notice (affected users), warranty / licence / contract expiring (owner), asset due back (borrower), verification task (location owner) | In-app, email | Outage notices go to people linked to the affected services (US-G-091) |
| 3b-4 | page (on-call: push, SMS, voice call), major incident update (stakeholders by audience), status page update (subscribers, email), identity action result (requester, agent) | Push, SMS, voice for paging bypass quiet hours (urgent type) | Paging uses the company's own SMS / voice provider accounts |

---

## 12. API endpoints

All under `/api/v1/desk`. P11 rules apply: tenant from session (YX-API-03), cursor lists with `fields=` (YX-API-06), `Idempotency-Key` on writes (YX-API-05), RFC 9457 errors (YX-API-07), OpenAPI generated in CI (YX-API-04), webhooks signed (YX-API-09). `{key}` = the permission key checked.

### 12.1 Phase 3b-1

| Method and path | Purpose | Key |
|---|---|---|
| `GET/POST /desks`, `GET/PATCH /desks/{id}` | List, create, edit desks | `desk.desk.create` / `desk.settings.manage` |
| `GET/POST/DELETE /desks/{id}/members` | Agents, leads, admins, collaborators (returns cost effect) | `desk.member.manage` |
| `GET/POST/PATCH /desks/{id}/groups`, `/categories`, `/ticket-types`, `/statuses`, `/priority-matrix`, `/templates`, `/canned-responses`, `/scenarios` | Desk set-up | `desk.settings.manage` |
| `GET /tickets` | List with filters, saved view, board grouping | `desk.ticket.view` (requesters: own) |
| `POST /tickets` | Create (portal, drawer, agent, API) | implicit / `request.raise_on_behalf` |
| `GET/PATCH /tickets/{id}` | Read, update fields (version checked) | `desk.ticket.view` / `desk.ticket.work` |
| `POST /tickets/{id}/messages` | Reply, note, side conversation | `desk.ticket.work` / `desk.ticket.note` |
| `POST /tickets/{id}/attachments` (+ `GET …/{aid}` signed link) | Upload, download (clean only) | as the message |
| `POST /tickets/{id}/assign`, `/merge`, `/split`, `/links`, `/convert`, `/escalate`, `/resolve`, `/reopen` | Actions | `desk.ticket.work` / `.assign` / `.merge` |
| `POST /tickets/bulk` | Bulk update or scenario | `desk.ticket.bulk` |
| `GET/POST /tickets/{id}/watchers`, `/collaborators`, `/tasks`, `/time-entries` | Sub-resources | `desk.ticket.work` / `desk.task.work` |
| `GET /tickets/{id}/timeline`, `/sla` | Timeline, SLA timeline | `desk.ticket.view` |
| `GET /tickets/{id}/context` | Requester's other records, assets, similar records | `desk.ticket.view` |
| `GET/POST /views`, `/reminders`, `GET /me/calendar.ics` (signed link) | Views, reminders, iCal | `desk.ticket.view` |
| `GET/POST /tasks` | Standalone tasks | `desk.task.work` |
| `GET/POST/PATCH /calendars`, `/sla-policies`, `/sla-policies/{id}/versions`, `/sla-targets` | Calendars and SLA | `desk.sla.manage` |
| `POST /tickets/{id}/sla/{timerId}/breach-reason`, `/exclusion` | Breach reason, exclusion | `desk.ticket.work` / lead |
| `GET/POST/PATCH /mailboxes`, `POST /mailboxes/{id}/verify-dns`, `/oauth/start`, `/oauth/callback` | Mailboxes and domains | `desk.mailbox.manage` |
| `POST /inbound/email/{mailboxToken}` | Raw MIME from provider (signature + IP allow-list, no session) | signed |
| `GET/POST /email-rules`, `GET /inbound-emails?state=held`, `POST /inbound-emails/{id}/release` | Rules, held mail | `desk.mailbox.manage` |
| `GET/POST/PATCH /portals`, `/banners`, `POST /banners/{id}/me-too` | Portals, banners | `desk.portal.manage` / implicit |
| `POST /portal/{host}/requests` (+ email-link confirm) | Open portal raise without account | public, Turnstile, rate-limited |
| `GET/POST/PATCH /kb/spaces`, `/kb/articles`, `/kb/articles/{id}/versions`, `/publish`, `/feedback`, `GET /kb/search`, `GET /kb/suggest` | Knowledge | `desk.kb.*` / implicit |
| `GET /help/{host}/…` | Public help centre (read-only, cached) | public |
| `POST /tickets/{id}/rating`, `GET/POST /surveys` | CSAT, NPS | implicit / `desk.survey.manage` |
| `GET /reports/{reportId}`, `GET /dashboards/{id}`, `GET /kpis` | Ready reports, dashboards, KPI | `desk.report.view` |
| `GET/POST /customer-accounts`, `/contacts`, `/entitlements`, `/products` | Customers | `desk.customer.manage` |
| `GET/POST /directory-sources`, `POST /directory-sources/{id}/sync` | Directory sync | `desk.directory.manage` |
| `GET /audit/reads?ticket=…` | Who read what | `desk.audit.view` |
| `POST /tickets/{id}/unmask` | Show a masked value (step-up) | `desk.pii.unmask` |
| `POST /privacy/requests` | Requester data access / erasure (P02 YX-SEC-30) | implicit |
| `POST /support/yukthix/tickets`, `GET /support/yukthix/tickets` | Customer → YukthiX support (calls `sd_support_intake()` / `sd_support_my_tickets()`) | tenant admin roles |
| Console: `GET /console/support/tickets/{id}/tenant-context`, `POST /console/support/tickets/{id}/support-session` | Tenant panel, request access | console support role |

### 12.2 Phase 3b-2

| Method and path | Purpose | Key |
|---|---|---|
| `GET/POST/PATCH /catalog/items`, `/catalog/items/{id}/versions`, `/order-guides`, `/questionnaires` | Catalogue | `desk.catalog.manage` |
| `GET /catalog` (audience-filtered), `POST /catalog/cart/checkout` | Order | implicit |
| `GET /requests/{id}/stages`, `POST /requests/{id}/cancel` | Requester tracking | implicit (own) |
| `POST /tickets/{id}/approvals` | Ad-hoc approval (P03) | `desk.ticket.work` |
| P03 shared: `GET /approvals/inbox`, `POST /approvals/{id}/decide` | Approve / reject | approver |
| `GET/POST/PATCH /lifecycles`, `/runbooks`, `POST /tickets/{id}/runbooks/{rid}/runs` | Lifecycles, runbooks | `desk.lifecycle.manage` / `desk.ticket.work` |
| `GET/POST/PATCH /rules`, `GET /rules/{id}/runs`, `GET /recipes`, `POST /recipes/{id}/install` | Automation | `desk.rule.manage` |
| `GET/POST /recurring`, `/sequences` | Recurring, sequences | `desk.rule.manage` |
| `GET/POST /http-actions`, `POST /http-actions/{id}/test` | No-code HTTP steps | `desk.integration.manage` |
| `POST /tickets/{id}/external-links` + `POST /webhooks/jira|github|azure-devops` | Dev tool escalation | `desk.ticket.work` / signed |
| `POST /tickets/{id}/move`, `/share` | Move or share | `desk.ticket.move` |
| `POST /desks/{id}/clone` | Clone desk | `desk.desk.create` |
| `GET /tickets/{id}/hr-summary` | HR panel (field-hidden per P02) | `desk.hr_summary.view` |
| `GET/POST /interactions`, `POST /interactions/{id}/promote` | Interactions | `desk.ticket.work` |
| `GET/POST /chat/sessions`, `POST /chat/sessions/{id}/accept|transfer|end`; socket namespace `/desk-chat` | Live chat | `desk.chat.work` / implicit |
| `POST /channels/whatsapp/webhook`, `/channels/sms/webhook`, `/channels/teams/messages`, `/channels/slack/events` | Inbound messaging (signature checked) | signed |
| `GET/POST /widgets`, `POST /widget/{key}/session` | Widget, signed user identity | `desk.channel.manage` / public |
| `PUT /me/presence`, `GET/PUT /agents/{id}/capacity`, `GET/POST /shifts` | Presence, capacity, shifts | agent / lead |
| `GET/POST /brands`, `/portal-pages` | Brands, employee centre | `desk.portal.manage` |
| `GET/POST /kb/reviews` | KCS | `desk.kb.publish` |
| `GET/POST /contracts`, `/rate-cards`, `/timesheets`, `POST /timesheets/{id}/approve` | Contracts and billable time | `desk.contract.manage` / `desk.time.approve` |
| `GET/POST/PATCH /services` | Service portfolio | `desk.service.manage` |
| P11 shared: `/webhooks`, API keys | Desk REST API and webhooks | API key scopes |

### 12.3 Phase 3b-3

| Method and path | Purpose | Key |
|---|---|---|
| `GET/POST/PATCH /problems`, `POST /problems/{id}/known-error`, `POST /problems/{id}/close-incidents` | Problems | `desk.problem.manage` |
| `GET /problems/suggestions` | Repeated-incident clusters | `desk.problem.manage` |
| `GET/POST/PATCH /changes`, `POST /changes/{id}/risk`, `/submit`, `/schedule`, `/implement`, `/review` | Changes | `desk.change.raise` / `.manage` |
| `GET/POST /cab/boards`, `/cab/meetings`, `POST /cab/meetings/{id}/decisions` | CAB | `desk.change.approve` |
| `GET /changes/calendar` (+ `.ics`), `GET /changes/{id}/conflicts`, `GET/POST /change-windows` | Calendar | `desk.change.manage` |
| `POST /pipeline/changes`, `GET /pipeline/changes/{id}/gate` | CI/CD gate (API key with `desk.change.raise`) | API key |
| `GET/POST/PATCH /releases`, `/deployments`, `/software-library` | Releases | `desk.release.manage` |
| `GET/POST/PATCH /assets`, `/asset-types`, `/asset-models`, `POST /assets/{id}/assign|return|loan|dispose`, `GET /assets/{id}/history`, `POST /assets/labels` | Assets | `desk.asset.manage` / `.view` |
| `GET /me/assets`, `POST /me/assets/{id}/report|confirm` | My assets | implicit |
| `GET/POST /stock-rooms`, `/stock-moves`, `/verification-campaigns`, `/certificates-domains`, `/ip-subnets` | Stock, verification, trackers | `desk.asset.manage` |
| `POST /osquery/enroll`, `POST /osquery/config`, `POST /osquery/log` | osquery TLS endpoints (node key auth, no session) | node key |
| `POST /discovery/enrolment/rotate`, `GET /discovery/installers` | Secrets, signed installers | `desk.discovery.manage` (step-up) |
| `GET/POST /discovery/sources`, `POST /discovery/sources/{id}/sync`, `POST /discovery/import-csv`, `POST /probe/report` | MDM, cloud, CSV, probe | `desk.discovery.manage` / probe key |
| `GET/POST /software`, `/licences`, `/saas-apps`, `/software-policies` | Software and licences | `desk.licence.manage` |
| `GET/POST/PATCH /cis`, `/ci-classes`, `/ci-relations`, `GET /cis/{id}/impact`, `GET /cis/{id}/map`, `GET /cmdb/health` | CMDB | `desk.cmdb.manage` / `desk.asset.view` |
| `GET/POST /vendors`, `/vendor-contracts`, `/purchase-requests`, `/purchase-orders`, `POST /purchase-orders/{id}/receive` | Vendors and buying | `desk.vendor.manage` / `desk.purchase.*` |
| `POST /tickets/{id}/vendor-escalations` | Vendor escalation with UC clock | `desk.ticket.work` |
| `GET/POST /outages`, `/risks`, `/budgets`, `/cost-lines`, `/chargeback` | Availability, risk, money | `desk.risk.manage` / `desk.finance.view` |
| `GET/POST /billing-runs`, `/client-invoices`, `/parts-used` | Client billing | `desk.client_billing.manage` |
| `GET /archive/tickets` | Archive search | `desk.ticket.view` |

### 12.4 Phase 3b-4

| Method and path | Purpose | Key |
|---|---|---|
| `POST /alerts/ingest/{sourceToken}` | Alert webhooks (signature, per-source format adapters) | signed |
| `GET/POST /alert-sources`, `/event-rules`, `/heartbeats`, `POST /heartbeats/{token}/beat`, `/uptime-checks` | Monitoring | `desk.alert.manage` |
| `GET/POST /oncall/schedules`, `/overrides`, `/escalation-policies`, `/paging-rules`, `GET /oncall/now`, `POST /pages/{id}/ack` | On-call | `desk.oncall.manage` / `.respond` |
| `GET/POST /status-pages`, `/status-pages/{id}/incidents`, `/updates`; public `GET /status/{host}`, `POST /status/{host}/subscribe` | Status pages | `desk.statuspage.manage` / public |
| `POST /tickets/{id}/major/propose|accept|update|resolve`, `GET /tickets/{id}/what-changed`, `POST /tickets/{id}/war-room` | Major incident | `desk.major_incident.declare` |
| `GET/PATCH /ai/settings`, `POST /ai/tickets/{id}/suggest|summarise|draft-resolution`, `POST /ai/va/sessions` | AI | `desk.ai.manage` / agent / implicit |
| `/mcp` (MCP server, OAuth as the user) | Company AI assistants read desk data under the user's rights | user token |
| `GET/POST /projects`, `/demands` | Projects | `desk.project.manage` |
| `GET/POST /spaces`, `/bookings`, `/maintenance-plans`, `/dispatch` | Facilities | `desk.facility.manage` / implicit |
| `POST /imports` (Zoho Desk, Freshservice, Jira SM, CSV), `GET /imports/{id}` | Importers (P15) | `desk.import.run` |
| `GET/POST /marketplace/installs`, `/config-packages` | Marketplace, config packages | `desk.marketplace.manage` |
| `POST /channels/telephony/{provider}/webhook`, `/channels/social/{provider}/webhook` | Telephony, social | signed |
| `GET/POST /exchange-links` | Desk-to-desk exchange | `desk.integration.manage` |
| `GET/POST /idp-connections` | Connect Entra / Google (step-up) | `desk.idp.connect` |
| `POST /tickets/{id}/identity-actions`, `POST /identity-actions/{id}/approve`, `/run` (step-up) | Identity actions | `desk.identity_action.*` |
| `GET /assets/{id}/mdm-link` | Deep link to the company's MDM console | `desk.asset.view` |

---

## 13. Screens

Existing prototype screens in `packages/yx-ui` are reused and extended. New screens are marked **new** and get prototype stories before their slice is wired.

| Phase | Screen | Prototype today | Notes |
|---|---|---|---|
| 3b-1 | Help centre (KB search, raise, my tickets with SLA, rate) | **HLP-01** `ops/helpdesk.tsx` `HelpCentreScreen`, `RaiseTicketForm`, `RateTicketCard` | Add portal branding, banners with "me too", open-portal email check |
| 3b-1 | Agent desk (queue, views, board, bulk) | **HLP-02** `AgentDeskScreen` | Add saved views, board, scenarios, CSV export |
| 3b-1 | Ticket workspace (reply, notes, macros, timeline, context panel, SLA timeline, tasks, time) | **HLP-03** `TicketWorkspaceScreen` | Add collision bar, side conversations, context panel, SLA timeline, collaborator mode |
| 3b-1 | KB editor | **HLP-04** `KbEditorScreen` | Add review flow, blocks, templates |
| 3b-1 | SLA dashboard | **HLP-05** `SlaDashboardScreen` | Add compliance targets, breach reasons |
| 3b-1 | In-app help drawer | — **new** (reuses HLP-01 parts) | |
| 3b-1 | Desk set-up (desks, members with seat cost, categories, statuses, matrix, SLA, calendars, mailboxes with DNS check, portal) | APX-D §5.8 settings group (no prototype yet) — **new** | Set-up checklist / wizard (US-G-034) |
| 3b-1 | Reports and wallboard | **ANL-02** dashboards, **ANL-05** report builder, **ANL-06** report library | Desk dashboards, TV mode **new** |
| 3b-1 | Public help centre editor and YukthiX support queue in console | **YX-11** help-centre editor, **YX-04** customer-success console | Console ticket queue with tenant panel **new** |
| 3b-1 | Customer accounts and contacts | — **new** | |
| 3b-2 | Service catalogue (browse, item page, cart, stage tracker) | — **new** | |
| 3b-2 | Catalogue and form builder, lifecycle designer, rule builder with trace | **PLT-55…64** Workflow Studio | Reuse studio canvas for lifecycles and rules |
| 3b-2 | Approvals inbox | P03 screens (shared) | |
| 3b-2 | Live chat console (agent) and chat widget | — **new** | |
| 3b-2 | Employee service centre / page builder | — **new** | |
| 3b-2 | Surveys builder and results | **ENG-04**, **ENG-06** | Reuse with desk subject |
| 3b-2 | Integrations and channels set-up | **Settings Group 7 · Integrations & Developers**, **T9-24** integrations directory | |
| 3b-3 | Problem, change (with risk, CAB, calendar), release | — **new** | |
| 3b-3 | Asset register | **PPL-25** asset register | Extend to the full asset model, stock, loans, verification |
| 3b-3 | Discovery set-up (enrolment, installers, sources, probe) | — **new** | |
| 3b-3 | CMDB and dependency map | — **new** | |
| 3b-3 | Vendors, contracts, purchasing | — **new** | |
| 3b-3 | My assets (portal) | — **new** (in HLP-01 shell) | |
| 3b-4 | Alerts, on-call schedule, paging | **YX-10** incidents, status admin and probes (for YukthiX) | Company version **new** from same parts |
| 3b-4 | Status page (public) | **T9-17** public status page | |
| 3b-4 | Major incident workbench | **PRC-17** incident workspace (layout idea only) | **new** |
| 3b-4 | AI hub | **YX-05** AI governance console (staff) | Company AI hub **new** |
| 3b-4 | Facilities: rooms, desks, visitors, reception | **VIS-01…04** visitors | Bookings and floor plans **new** |
| 3b-4 | Identity actions panel on ticket | — **new** | |

Screen rules (feedback from earlier reviews): single-choice fields use the joined Segment control, never toggle-looking chips; every clickable thing looks clickable (border or fill, hover, pointer, focus).

---

## 14. Security

Bar: OWASP ASVS L2, forced RLS, proven libraries, audit on every change (M14 header). Desk-specific controls:

### 14.1 Isolation and access

- Forced RLS on every `sd_` table; restrictive visibility policy (§5.7). CI checks both.
- The YukthiX support bridge uses two `SECURITY DEFINER` functions with fixed inputs (§3). No other cross-tenant path.
- Field classes from P02: hidden fields never leave the API (US-B-112).
- Requester sessions (employee, external, guest) can reach only their own records (YX-SD-16), checked in SQL and in the service.

### 14.2 Attachments

| Step | Control |
|---|---|
| Upload | Size limit per file and per message (company setting within our ceiling). Company allow-list of file types (US-G-031). |
| Type | Real type from bytes (`file-type`). Mismatch with the name or a type off the list → blocked. Archives with passwords → blocked (cannot scan). |
| Scan | ClamAV (`clamd`) side container, signatures updated by `freshclam` hourly. Status `pending` until scanned. Infected → `infected`, kept in quarantine 30 days for the admin, then deleted. Scanner down → stays `pending` (fail **closed** for downloads), retried by job. |
| Serve | Only `clean` files. Short-lived signed links. `Content-Disposition: attachment` for everything except safe images; `X-Content-Type-Options: nosniff`. Images re-served from our domain, never hot-linked. |
| Inline HTML | `sanitize-html` allow-list; remote images blocked by default (tracking pixels); CSP on the agent app forbids inline scripts. |

### 14.3 Email spoofing

| Check | Action |
|---|---|
| DMARC `fail` (policy reject / quarantine) | Mail is **held**, not turned into a record; desk admin can release. |
| DMARC `fail` with policy none, or no DMARC and SPF / DKIM both fail | Record created but marked **"sender not verified"** on screen; email commands and auto-linking to an existing record by subject are **off**; no auto-reply with content. |
| Pass | Normal. |
| Display-name tricks | A warning when the display name looks like an internal person but the address is outside. |
| Our own domains | Mail claiming to be from our domains that fails DKIM is rejected. |
| ARC | Trusted forwarders' ARC results are used only for forwarders the company lists. |
| Customer account linking (YukthiX support) | By verified sender domain only; else held for an agent (US-B-120). |

### 14.4 Portal and channel abuse limits

| Limit | Starter value (company can lower) |
|---|---|
| Open-portal raise without account | Turnstile + email link confirm; 5 per email per hour; 20 per IP per hour |
| OTP sign-in | P12 limits and lockout (reused) |
| Inbound email per sender | 20 per 10 min, then held |
| Chat sessions | 3 open per person; 30 messages per minute |
| Widget | Only allowed origins; signed user token for known users; anonymous mode is optional and rate-limited per IP |
| KB search (public) | 60 per minute per IP |
| Webhooks in (alerts, channels) | Signature + timestamp (5 min replay window), per-source rate limit, body size cap |
| API | P11 per key / user / tenant limits (YX-API-08) |

### 14.5 Data protection

- PII masking on save (YX-SD-15) before search, email, webhooks and AI.
- Sensitive records: neutral notifications, ids-only webhooks (YX-API-10), no AI.
- Requester data requests (access, erasure) through P02 privacy requests (US-B-115). Erasure replaces the person's name and contact on records with "Erased requester" and deletes attachments they sent, but keeps the record's facts for reports.
- Retention per company schedule; legal hold stops deletion (P14 YX-TEN-04).
- Audit stream to the company's SIEM (US-G-065).

### 14.6 Device discovery (Q3, Q4)

- We implement **only** osquery's enrol, config and logger TLS endpoints. We do **not** implement the distributed (live query) read / write endpoints, and the config turns off carving and distributed queries. So no one, including a YukthiX breach, can send a query or command to a device.
- The config serves one fixed, versioned query pack (hardware, OS, installed software, disks, network interfaces, patches). No browser history, no files, no user content.
- Company enrolment secret: shown once, stored hashed, rotatable (step-up). Each device gets its own node key (hashed), revocable from the asset page.
- TLS with our certificate pinned in the installer's config. Code-signed Windows and macOS installers (go-live item).
- Office probe: read-only SNMP (v3 preferred) and ARP table reads; no scanning tools; pushes results with its own key.
- MDM, cloud and RMM imports are read-only scopes only. Device actions happen in the company's own MDM console via the deep link (Q6).

### 14.7 Identity actions (Q7)

| Control | Design |
|---|---|
| Off by default | Each action type (reset password, unlock, create user, disable user, group change, licence change) is switched on separately by the Service Desk admin. |
| Company's own app | The company registers its own app in Entra ID / Google Workspace and grants only the scopes for the actions it switched on. Where the provider supports it, the app is limited to an administrative unit or OU. We store the credentials encrypted (secrets manager) and show the granted scopes. |
| Approval per action | Every run needs an approved P03 request (requester's manager by default; company can add IT security). No auto-approve for these types (high-risk in the P03 registry). |
| Step-up for the agent | The agent re-confirms with MFA (AAL2 within the last 15 min, YX-IAM-02) at run time. |
| No passwords stored | Reset uses the provider's own reset flow, or a one-time temporary password shown once to the requester in the app (never emailed, never stored, never shown to the agent). |
| Audit | Who asked, who approved, who ran it, target account, scopes used, provider request id, result. Failures are shown, never retried silently (US-G-207). |
| Blast limits | No bulk identity actions. Admin accounts and break-glass accounts cannot be targets (checked with the provider's role data before the run). |
| Requester proof | See §17 D6 (still open). |

### 14.8 Other

- All outbound HTTP (rules, webhooks, connectors, uptime checks) through `ssrf.ts`.
- Secrets in the secrets manager; tokens for mailboxes and connectors encrypted at rest.
- Socket connections re-check the session and MFA state like the exam-runtime gateway does.
- Independent security review at the end of each phase (roadmap rule).

---

## 15. Test plan

Every slice ships its tests. Every phase ends with a full green run and an independent security review before its pull request (roadmap rule). Testing follows "review in one go": automated checks + a fixed checklist + one verify pass.

### 15.1 Tests that run for every phase

| Kind | What |
|---|---|
| RLS guard | Every `sd_` table: forced RLS on, `tenant_isolation` present; a second-tenant session reads 0 rows and cannot insert. Generated from the migration list. |
| Permission guard | Every endpoint declares a key (YX-SEC-01); unannotated route fails CI. |
| OpenAPI | Contract generated and diffed (YX-API-04). |
| Audit | Each write endpoint writes one audit row in the same transaction. |
| UI | Playwright on wired screens; dead-button scan = 0 (US-A-058); accessibility checks. |

### 15.2 Per phase

| Phase | Key tests |
|---|---|
| **3b-1** | **Business time:** unit tests for add / between across weekends, holidays, half days, midnight, DST zones (Europe, US), calendar version change mid-ticket. **SLA:** pause / resume, retroactive start, policy change, milestones fire once when jobs are duplicated, lost Redis job caught by the sweep, 50k running timers sweep under 5 s. **Visibility:** sensitive / private / restricted records invisible to company admin, desk admin, super-admin session and other desks' agents, at SQL level. **Seats:** collaborator gets 403 on reply / assign; DB trigger blocks direct assignee update; HR-only agent not metered in HRMS company, metered in standalone; agent on HR + IT counted once. **Email:** fixtures for multipart, inline images, TNEF, wrong charsets, huge headers; threading by token / headers / subject; loop headers; auto-reply storms; DMARC fail held; spoofed display name flagged; EICAR test file blocked; renamed `.exe` blocked; password zip blocked. **Portal:** open-portal rate limits, Turnstile required, OTP requester sees only own records. **PII:** Aadhaar (Verhoeff), PAN, card (Luhn), IFSC + account detection, masked in search and email. **YukthiX bridge:** intake function cannot read, cannot write to another account, cannot write other tables. **Load:** 200 agents, 1,000 new records per minute, list p95 < 300 ms. |
| **3b-2** | **Approvals:** quorum any / all / N / %; timeout auto-actions only where enabled; delegation from leave; self-approval blocked. **Catalogue:** order pins version; cart items keep own approvals; cancel before fulfilment. **Rules:** chain depth limit, no self re-fire, trace shows each condition, time rules fire once. **Chat:** session re-check on reconnect, capacity limit, chat → ticket with transcript, widget only on allowed origins, forged user token refused. **Channels:** WhatsApp / SMS / Teams / Slack webhook signatures, opt-in required, unlinked chat user gets nothing. **Move / share:** privacy and SLA of the new desk applied; shared-view cannot reply. **Connectors:** SSRF blocked for private IPs, redirects to private IPs and DNS rebinding. |
| **3b-3** | **osquery:** enrol with right / wrong / rotated secret; revoked node key refused; config contains no distributed or carve settings; distributed endpoints return 404; logger accepts only pack queries. **Matching:** same device from osquery + Intune + CSV becomes one asset with source priority; conflicts listed. **Depreciation:** straight-line and WDV against worked examples. **CMDB:** impact query depth limit and cycles; relations as on a past date. **Change calendar:** blackout / freeze / CI window conflicts; `rrule` windows. **Pipeline gate:** API key scope, idempotent create. **Assets:** dated assignments never overlap; exit flow returns assets (US-D-055). |
| **3b-4** | **Alerts:** dedupe by fingerprint, auto-close on resolve, suppression in maintenance windows, per-source signatures. **On-call:** rotation hand-offs across time zones, overrides from leave, escalation when not acked, page bypasses quiet hours. **Status page:** subscriber double opt-in, unsubscribe link, private page needs login. **AI:** feature off = no call; BYO key path makes no credit charge; credits path meters; sensitive record never sent; prompt-injection fixtures in ticket text do not trigger tools. **Identity actions:** off by default; no run without approval; no run without fresh step-up; admin target refused; temporary password never in logs, email or API response after first view; failure shown, not retried. **Importers:** sample exports from each tool round-trip counts and links. |

---

## 16. Build order (PR-sized slices)

Each slice is one pull request with its migration, API, tests and (where listed) wired screen. IDs are stable; new slices get the next free number in their phase. "Stories" link to B.json (US-B), G.json (US-G), A.json (US-A), D.json (US-D) and E.json (US-E).

### 16.1 Phase 3b-1 · Core (32 slices)

| ID | Slice | Stories |
|---|---|---|
| SD-1.01 | Desk foundation: desks, members (dated), groups, categories, types, statuses, priority matrix; RLS; desk keys and role templates; desk set-up API | US-B-085, US-B-112, US-B-113 |
| SD-1.02 | Shared business calendars (hours dated, holidays) and the business-time module | US-B-095 |
| SD-1.03 | Ticket core: create / read / update, numbering, system states and custom labels, type convert, timeline, outbox events | US-B-086, US-B-088, US-G-001 |
| SD-1.04 | Requesters: persons as requesters, requested-for, watchers / CC, VIP | US-G-004 |
| SD-1.05 | Attachments: upload, type allow-list, ClamAV scan queue, signed downloads | US-B-102, US-G-031 |
| SD-1.06 | Assignment: manual, round-robin, load; skip away / leave / off shift | US-B-087, US-G-011 |
| SD-1.07 | Agent desk lists: saved views, filters, board, bulk, scenarios, tags, CSV export | US-B-089, US-G-002, US-G-010 |
| SD-1.08 | Ticket workspace: replies, notes, mentions, rich text, canned responses, collision presence, time tracking, requester context panel | US-B-090, US-B-091, US-G-003 |
| SD-1.09 | Merge, link, parent / child, split, side conversations | US-B-092, US-G-005 |
| SD-1.10 | Tasks and checklists, templates, resolution codes, tier escalation, reopen rules, auto-close | US-G-006, US-G-007, US-G-008 |
| SD-1.11 | Reminders, snooze, personal calendar with iCal feed | US-G-009 |
| SD-1.12 | Sensitive / private records (restrictive RLS), PII masking, read log | US-B-093, US-G-029, US-G-030 |
| SD-1.13 | Collaborator role, seat rules L1–L6, DB trigger, daily `sd_agents` meter | US-G-033, US-B-122, US-B-123 |
| SD-1.14 | SLA policies and versions: several targets, scope conditions, calendar source | US-B-094, US-G-012, US-G-013 |
| SD-1.15 | SLA timers, BullMQ milestone jobs, sweep, breach escalation | US-B-096, US-G-014 |
| SD-1.16 | SLA timeline on ticket, breach reasons, exclusions, monthly compliance targets | US-G-015, US-G-016 |
| SD-1.17 | OLA timers on group assignments and tasks (UC timers activate in SD-3.25) | US-B-097 |
| SD-1.18 | Email out: company domain, DNS check, DKIM signing, bounce list | US-G-017 |
| SD-1.19 | Email in: hosted / forward / M365 / Gmail / IMAP adapters, auth checks, parse, clean, threading, loop and spam guard | US-B-101, US-B-102, US-G-017 |
| SD-1.20 | Email rules, auto-acknowledgement with articles, email commands | US-G-018, US-G-019 |
| SD-1.21 | Portal and in-app help drawer: raise, my records, themes, login screen, time zones, reading aids | US-B-086, US-B-099, US-B-100, US-G-022 |
| SD-1.22 | Open portal and external requesters: OTP login, email-link check, Turnstile, limits, allowed domains | US-B-103, US-G-021 |
| SD-1.23 | Known-issue banners with "me too" | US-G-020 |
| SD-1.24 | Knowledge core: spaces, articles, versions, review, audiences, languages, suggest while typing, article from ticket | US-B-104, US-B-105, US-B-106 |
| SD-1.25 | Public help centre, insert article in reply, solved-by, outdated flag, content-gap report, templates, blocks | US-B-107, US-G-023, US-G-024, US-G-025 |
| SD-1.26 | CSAT on close and NPS surveys | US-B-108, US-B-109 |
| SD-1.27 | Reports: ready dashboards, KPI snapshots, report library, time-in-status, wallboard, custom and scheduled reports, SLA reports for customers | US-B-098, US-B-110, US-B-111, US-G-026, US-G-027, US-G-028 |
| SD-1.28 | Customer accounts, contacts, entitlements, products, company groups and agent account scope | US-G-035, US-G-036, US-G-037, US-G-038 |
| SD-1.29 | Standalone product: sign-up, light people list, CSV import, directory sync (LDAP, SCIM, group mapping), SSO / MFA reuse, set-up wizard | US-B-114, US-B-121, US-G-032, US-G-034 |
| SD-1.30 | Requester privacy requests and retention | US-B-115 |
| SD-1.31 | YukthiX support in the console: platform desk, intake / my-tickets functions, tenant panel, tiers and hours, Priority Support order, Sev-1 24×7, support-session request, support@ move | US-B-116, US-B-117, US-B-118, US-B-119, US-B-120 |
| SD-1.32 | Wire 3b-1 screens (HLP-01…05, drawer, set-up, console queue); dead-button scan | US-A-058 |

### 16.2 Phase 3b-2 · ESM (34 slices)

| ID | Slice | Stories |
|---|---|---|
| SD-2.01 | P19 conditions and P18 forms for desks: dynamic form rules, question library, more field types and layout (builds P19 core if missing) | US-B-137, US-G-039, US-G-063 |
| SD-2.02 | Live-data pickers: people, locations, cost centres (my devices and CMDB pickers switch on in 3b-3) | US-G-040 |
| SD-2.03 | Catalogue items: versions, audience, rich pages, stage tracker, cancel | US-B-124, US-G-042 |
| SD-2.04 | Cart, order guides, bundles → tasks for several teams with OLAs | US-B-126, US-G-041 |
| SD-2.05 | Approvals through P03: multi-step, quorum, reminders, timeout actions, leave delegation, ad-hoc approvals, assignee-only completion | US-B-125, US-G-043, US-G-044, US-G-054 |
| SD-2.06 | Approve from Teams / Slack cards and mobile push | US-G-043, US-E-282 |
| SD-2.07 | Documents and e-signature inside requests (P05) | US-G-045 |
| SD-2.08 | Join / exit requests from M01 and employee journeys | US-B-127, US-G-049 |
| SD-2.09 | ESM desks: HR, Admin, Facilities, Finance, Legal starter packs; sensitive categories with M08 rules; restricted desks | US-B-128, US-B-129, US-A-145 |
| SD-2.10 | HR summary panel, move / share records, clone desk, delegated desk admin, branches | US-G-046, US-G-047, US-G-048, US-G-050 |
| SD-2.11 | Lifecycle designer | US-G-062 |
| SD-2.12 | Automation rules: triggers, conditions, actions, trace, recipes | US-B-130, US-B-131, US-G-051 |
| SD-2.13 | Recurring records and timed message sequences | US-G-052, US-G-053 |
| SD-2.14 | Desk REST API and webhooks, connector framework, no-code HTTP steps | US-B-136, US-G-060, US-E-279 |
| SD-2.15 | Escalate to Jira, GitHub, Azure DevOps with two-way sync | US-G-061 |
| SD-2.16 | Runbooks on records | US-G-055 |
| SD-2.17 | Interactions (chat, call, walk-up) and phone logging | US-B-135, US-G-056 |
| SD-2.18 | Live chat transport (per §17 D1), sessions, queues, chat → ticket | US-B-132 |
| SD-2.19 | Chat extras: pre-chat form, cards, files, rating, hand-over, proactive prompts | US-G-059 |
| SD-2.20 | Help widget and mobile SDK | US-G-069 |
| SD-2.21 | WhatsApp channel | US-B-133 |
| SD-2.22 | Teams / Slack: requester bot and agent work in chat | US-B-134, US-G-057, US-E-282 |
| SD-2.23 | Two-way SMS | US-G-058 |
| SD-2.24 | Agent mailbox sync for matched threads | US-E-283 |
| SD-2.25 | Presence, capacity and push routing | US-G-075 |
| SD-2.26 | Shifts, volume forecast, availability and productivity reports | US-G-076, US-G-077 |
| SD-2.27 | Agent mobile app API (queue, reply, approve, SLA alerts, offline drafts) | US-G-068 |
| SD-2.28 | Employee service centre, page builder, several brands | US-G-070, US-G-071 |
| SD-2.29 | KCS quality, article audiences, survey builder | US-G-072, US-G-073, US-G-074 |
| SD-2.30 | Custom record types, layouts by type / desk / brand | US-G-064, US-G-066 |
| SD-2.31 | Audit stream to SIEM, BI reporting dataset | US-G-065, US-G-067 |
| SD-2.32 | Client contracts, prepaid blocks, billable time, rate cards, timesheets | US-G-078, US-G-079 |
| SD-2.33 | Business service portfolio | US-G-080 |
| SD-2.34 | Wire 3b-2 screens; dead-button scan | US-A-058 |

### 16.3 Phase 3b-3 · ITIL (30 slices)

| ID | Slice | Stories |
|---|---|---|
| SD-3.01 | Record core for problem, change, release (kinds + extension tables, shared timers, tasks, links) | US-B-138 |
| SD-3.02 | Problems: from repeated incidents, RCA, known errors and workarounds for agents, close incidents in bulk | US-B-138, US-B-139, US-B-140 |
| SD-3.03 | Problem tasks and states, trends, known errors on the portal | US-G-081, US-G-082, US-G-083 |
| SD-3.04 | Change core: types, risk questionnaire and score, plans, post-implementation review | US-B-141, US-B-142, US-B-145 |
| SD-3.05 | CAB boards and meetings; workflow per change model | US-B-143, US-G-088 |
| SD-3.06 | Change calendar: blackout / freeze, conflicts, CI windows, busy days, iCal, ordered and recurring change tasks | US-B-144, US-G-086, US-G-089 |
| SD-3.07 | Standard change catalogue; auto-approve proven low-risk changes | US-G-084, US-G-090 |
| SD-3.08 | CI/CD pipeline change gate | US-G-085 |
| SD-3.09 | Planned outage notices | US-G-091 |
| SD-3.10 | Releases: grouping, go / no-go, deployments, code links, tests, sign-off, software library | US-B-146, US-G-092, US-G-093, US-G-094 |
| SD-3.11 | Asset core: type designer, models, register, lifecycle history, dated assignments, check-in / out, labels, hand-over e-sign; M01 join / exit hooks | US-B-147, US-B-148, US-G-108, US-G-109, US-D-054, US-D-055 |
| SD-3.12 | Asset money: warranty, AMC, lease, depreciation, total cost | US-B-149, US-G-105 |
| SD-3.13 | osquery endpoints, fixed pack, enrolment secrets, node keys, signed installers | US-B-150, US-B-151, US-B-152 |
| SD-3.14 | MDM and CSV import, multi-source matching with field priority, office probe | US-B-154, US-B-155, US-G-096 |
| SD-3.15 | Software normalisation, installs, allowed / banned lists | US-G-095, US-G-107 |
| SD-3.16 | Licences, metrics, reclaim with approval | US-B-153, US-G-097 |
| SD-3.17 | SaaS management | US-G-098 |
| SD-3.18 | Stock rooms, consumables, loaners, catalogue stock and purchase link | US-G-099, US-G-100, US-G-112 |
| SD-3.19 | Verification, disposal, warranty lookup, certificates and domains, IP management, read-only security status, cloud imports | US-G-101, US-G-102, US-G-103, US-G-104, US-G-106, US-G-110 |
| SD-3.20 | My assets in the portal | US-G-111 |
| SD-3.21 | CMDB: classes, CIs, dated relations, map, impact, history, baselines | US-B-156, US-B-157 |
| SD-3.22 | Services as CIs, service map, CMDB health, discovery-built maps, non-IT links | US-G-113, US-G-114, US-G-115 |
| SD-3.23 | Drift and unauthorised change detection | US-G-087 |
| SD-3.24 | Vendors, contracts, purchase requests and orders, receiving into stock | US-B-158, US-B-159 |
| SD-3.25 | Vendor scorecards, vendor escalation with UC clock, service credits, accounting sync, fuller procurement | US-G-116, US-G-117, US-G-118, US-G-119, US-G-120 |
| SD-3.26 | Outages and availability; risk register | US-G-121, US-G-125 |
| SD-3.27 | Budgets, cost lines, chargeback | US-G-122, US-G-123, US-G-124 |
| SD-3.28 | Client billing runs, client portal balance, parts and expenses, profitability | US-G-126, US-G-127, US-G-128, US-G-129 |
| SD-3.29 | Ticket archive | US-G-130 |
| SD-3.30 | Wire 3b-3 screens; dead-button scan | US-A-058 |

### 16.4 Phase 3b-4 · Operations (34 slices)

| ID | Slice | Stories |
|---|---|---|
| SD-4.01 | Alert ingestion: sources, signatures, dedupe, auto-create and auto-close incidents | US-B-160 |
| SD-4.02 | Event rules (map, correlate, suppress), service health tiles, more sources, email-to-alert | US-G-131, US-G-133 |
| SD-4.03 | Heartbeats and uptime checks | US-G-132 |
| SD-4.04 | Log anomalies, experience scores, RMM import, capacity trends | US-G-134, US-G-135, US-G-136, US-G-137 |
| SD-4.05 | On-call schedules, rotations, overrides from leave | US-B-161, US-G-139 |
| SD-4.06 | Paging, acknowledge, escalation, personal rules, on-call phone number, ack from Teams / Slack, PagerDuty / Opsgenie / Squadcast link | US-B-162, US-G-138, US-G-140, US-G-141, US-G-142 |
| SD-4.07 | Status pages for companies (and YukthiX's own) | US-B-163 |
| SD-4.08 | Major incident: propose / accept, war-room, workbench, comms plan, templates, auto timeline, channel and bridge, what changed, swarming, review | US-B-164, US-B-165, US-G-143, US-G-144, US-G-145, US-G-146, US-G-147 |
| SD-4.09 | AI foundation for the desk: P10 registry entries, BYO key vs credits, AI hub, guardrails, kill switch, evals, EU notices | US-G-153, US-E-287, US-E-288, US-E-289, US-E-290, US-E-292, US-E-293 |
| SD-4.10 | AI triage: category, routing, duplicates; topics and sentiment | US-B-166, US-G-156 |
| SD-4.11 | AI agent help: replies, articles, summaries, resolution notes, writing help, translation, next step from procedures | US-B-167, US-G-148, US-G-149, US-G-157, US-G-161 |
| SD-4.12 | Virtual agent and instant AI answers to new emails | US-B-168, US-G-150, US-G-151 |
| SD-4.13 | AI drafts: KB articles, catalogue item from a procedure, admin copilot | US-G-158, US-G-163, US-G-164 |
| SD-4.14 | Plain-language queue search, data questions, process mining | US-G-154, US-G-155, US-G-160 |
| SD-4.15 | Predictions: change risk, unusual devices, operations AI | US-G-159, US-G-165, US-G-166 |
| SD-4.16 | AI agent studio (P22) and MCP server / assistant connectors | US-G-152, US-G-178 |
| SD-4.17 | Federated search over outside knowledge sources | US-G-162 |
| SD-4.18 | Projects, demand, software components catalogue | US-B-169, US-G-167, US-G-168, US-G-169 |
| SD-4.19 | Facilities: spaces, floor plans, room / desk booking with catering and AV, visitors, reception | US-B-170, US-B-171, US-G-172, US-G-173, US-G-174 |
| SD-4.20 | Preventive maintenance, dispatch board, vehicles, keys, parking, lockers | US-G-170, US-G-171, US-G-175 |
| SD-4.21 | Importers (Zoho Desk, Freshservice, Jira SM, CSV) and sandbox | US-B-172, US-B-173 |
| SD-4.22 | Marketplace, Zapier / Make / Power Automate, SDK, sandboxed scripts and action buttons, config packages | US-B-174, US-G-176, US-G-177, US-G-179, US-G-180 |
| SD-4.23 | Outlook add-in, launch links to the company's remote-support tool, helper app | US-G-181, US-G-182 |
| SD-4.24 | Telephony, social channels, walk-up and appointments | US-G-183, US-G-184, US-G-185 |
| SD-4.25 | MSP mode, desk-to-desk exchange, opportunities and quotes, cloud subscription check | US-G-186, US-G-187, US-G-188, US-G-189 |
| SD-4.26 | Security incident desk and access reviews | US-G-190, US-G-191 |
| SD-4.27 | Experience score, improvement register, continuity plans (peer benchmarks dropped, D7) | US-G-192, US-G-193, US-G-194 |
| SD-4.28 | Conversation quality reviews, skills matrix, gamification | US-G-196, US-G-197, US-G-198 |
| SD-4.29 | Customer health, proactive tickets, CRM context | US-G-199, US-G-200, US-G-201 |
| SD-4.30 | Company storage bucket, more languages, industry packs, community forum | US-G-202, US-G-203, US-G-204, US-G-205 |
| SD-4.31 | Connect Entra ID / Google Workspace with fewest permissions | US-G-206 |
| SD-4.32 | Identity actions: reset, unlock, create / disable, groups, licences, with approval, step-up and audit | US-G-207, US-G-208 |
| SD-4.33 | Open the device in the company's MDM console | US-G-209 |
| SD-4.34 | Wire 3b-4 screens; dead-button scan | US-A-058 |

**Total: 130 slices** (32 + 34 + 30 + 34). Every story `US-B-085…174` and `US-G-001…209` is in at least one slice.

---

## 17. Decisions D1–D7

**All decided by the founder on 8 Oct 2026** (the options below are kept as the record of what was weighed):

| # | Decision |
|---|---|
| D1 | Live chat: **A, our own socket.io server** (reuse the exam-runtime pattern, Redis adapter). |
| D2 | Agents counted **once per person if an agent on any day of the month**; same-day add-and-remove is free. |
| D3 | **Owners pay, setup is free:** desk admins who only configure and CAB members are free; problem / change / release managers, asset managers / CMDB owners, on-call responders, status-page editors and identity-action operators are paid (unless already agents). |
| D4 | **The whole engine on one HR desk** per company inside ₹99 HRMS; any second desk is a paid `service_desk`; a desk's kind cannot change after creation. |
| D5 | Inbound mail: **decide together with hosting (P13)**, behind our adapter; we re-check SPF / DKIM / DMARC ourselves. |
| D6 | Reset / unlock proof: **a. in-app with MFA**; if locked out, a one-time code to the phone or personal email on the HR record (never from the ticket) **plus manager approval**. |
| D7 | Peer benchmarks: **not built.** US-G-195 is dropped; no cross-company comparisons. |

### D1 · Live chat transport (open since M14 "Still to decide")

Live chat needs a fast two-way line between the requester's browser and the agent's screen.

| Option | What it means, simply | Good | Not so good |
|---|---|---|---|
| **A. Our own socket.io server** (recommended) | We run the chat line ourselves, like the live proctoring console already does in `exam-runtime`. Several servers share messages through Redis. | Code pattern already exists and is reviewed (session re-check, MFA). Data stays in the company's region (YX-SEC-19). No new sub-processor. No per-message bill. Falls back to long-polling by itself when a network blocks WebSockets. | We must run and watch it (sticky sessions or Redis adapter, connection limits). |
| B. Managed real-time service (e.g. Ably, Pusher) | A paid outside service carries the messages. Our API sends to them; browsers connect to them. | Less to run; scales by itself. | New sub-processor (APX-G list, 30-day notice), data leaves our servers, region limits, cost per connection and message, one more vendor outage risk. |
| C. Simple streaming (server-sent events + normal HTTP posts) | The browser keeps one open "listen" line; messages it sends are normal requests. | Simplest, works through most proxies. | Typing indicators and presence are clumsier; still needs the same Redis fan-out as A; we would rebuild what socket.io gives us. |

**Recommendation: A.** It reuses what we have, keeps data in region, and adds no vendor. Revisit B only if chat traffic grows past what a small server group handles.

### D2 · How agents are counted in a month

| Option | Meaning |
|---|---|
| **a. Any day (recommended)** | Counted if the person was an agent on any day of the month, once per person (like HRMS units, YX-BILL-02). A seat granted and removed on the same day is not counted (mistake fix). |
| b. Peak | The highest number of agents on any single day. |
| c. Month end | Agents on the last day only. Easy to game. |

### D3 · Which non-ticket roles are paid

Q1 and Q10 say agents pay; requesters, approvers and collaborators are free. Not yet decided: people who never answer records but do desk work.

| Role | Recommendation |
|---|---|
| Desk admin / Service Desk admin who only configures | Free (they cannot own or answer records). |
| CAB member | Free (approver). |
| Problem, change, release manager | Paid (they own records). |
| Asset manager, CMDB owner | Paid (daily operational work), unless the founder wants assets "free" to cover the people who run them too. |
| On-call responder who is not an agent | Paid (they acknowledge and work incidents). |
| Status page editor, identity action operator | Paid if they are not already agents (they act on records). |

### D4 · What the free HR desk includes (Q2 detail)

Q2 keeps the HR helpdesk (tickets, KB, SLA) inside ₹99 HRMS. Open: does the free HR desk also get 3b-2+ features (catalogue, automation, chat, WhatsApp)?
**Recommendation:** yes, the whole engine on **one** HR desk per company (simplest, no feature gates in code). Any second HR-like desk is `service_desk` class. A company cannot change a desk's kind after creation, so IT work cannot be moved onto the free desk without it showing in reports.

### D5 · Inbound mail provider for YukthiX-hosted addresses

Infrastructure choices are parked with the engineering team (P13). We need one provider that posts **raw MIME** to our webhook.
**Recommendation:** use the inbound mail feature of the cloud chosen in P13 (or a mail provider with a raw-MIME webhook), behind our adapter. We re-check SPF / DKIM / DMARC ourselves, so the provider choice does not change security.

### D6 · Proving the requester before a password reset or unlock

Q7 fixed approval, agent step-up and audit. Not yet fixed: how we know the **requester** is really the account owner. Help-desk resets are a known route for attackers who phone in pretending to be staff.

| Option | Meaning |
|---|---|
| **a. In-app with MFA (recommended)** | Requester asks from the app while signed in with MFA. If locked out: a one-time code to the phone or personal email **from the HR record** (never from the ticket), plus manager approval. |
| b. Manager approval only | Simpler; weaker if the manager is fooled too. |
| c. Video or in-person check by IT | Strong; slow, and needs a process outside the product. |

### D7 · Anonymous peer benchmarks (US-G-195)

Comparing a company's metrics with other companies uses other tenants' data, even when aggregated.
**Recommendation:** opt-in only (a company sees benchmarks only if it shares its own), at least 10 companies in every bucket, metrics only (no text), named in the privacy notice.

### Already scheduled elsewhere (not new decisions)

- AI credit pack sizes and prices: set in P14 before 3b-4 starts (Q9).
- Code-signing certificates for osquery installers: go-live checklist (Q3).

---

## 18. Change log

| Date | Change |
|---|---|
| 8 Oct 2026 | Founder decided D1–D7 (§17); D7 drops peer benchmarks (US-G-195). |
| 8 Oct 2026 | First draft: data model, roles and licensing, engines, API, screens, security, tests, 130 slices, open decisions D1–D7. |
