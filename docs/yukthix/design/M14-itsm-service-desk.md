# M14 · YukthiX Service Desk (ITSM + ESM)

> **Status:** 📝 Scope agreed with the founder, 6 Oct 2026. Detailed design (rules, data model, decisions) to be written before the build, in the same format as the other M docs.
> **Founder decision:** build our own full ITSM tool instead of buying one (Zoho Desk, Freshservice, Jira Service Management). One engine serves three uses:
> 1. **Inside YukthiX**: employees raise tickets to their company's HR, IT, Admin, Finance and Facilities teams (extends M08 helpdesk).
> 2. **YukthiX's own customer support**: customer companies raise tickets to YukthiX staff, worked in the platform console (P14). We use our own product first.
> 3. **Sold as its own product**: works for a company that has not bought YukthiX HR (light people list only), or as an add-on.
>
> **Build:** roadmap **step 3b**, right after the platform console. Until then, YukthiX support runs from a support@ mailbox.
> **Bar:** every feature below is in scope. Features can be phased inside step 3b, but none is dropped. Same quality bar as the rest: forced RLS per tenant, OWASP ASVS L2, proven libraries, audit on every change.

## Relation to existing docs

- **M08** keeps grievance, POSH, disciplinary, whistleblower, accidents and policies. Its helpdesk part (queues, tickets, SLA, KB; YX-HD-01..05) becomes the base of this module. The confidentiality rules of M08 still apply to sensitive categories.
- **M01 assets** (simple register, issue/return) is replaced by the M14 asset and CMDB model; onboarding and exit checklists create and return assets through it.
- Reuses **P03** workflow and approvals, **P04** notifications (email, SMS, WhatsApp, push), **P05** documents, **P08** audit, **P09** metrics, **P10** AI layer, **P11** APIs, **P17** search, **P18** custom fields and forms, **P19** policy rules, **P22** workflow studio.

## Full feature scope (ITIL 4 practices)

### 1. Incident management
- Tickets from portal, email, chat, phone (agent logs), WhatsApp, Microsoft Teams / Slack, API and monitoring alerts.
- Categories, sub-categories, impact × urgency → priority matrix; auto-routing by rules, skills, location and round-robin / load-based assignment.
- Status flow with pause states; reopen; merge duplicates; parent / child tickets; linked tickets.
- **Major incident**: declaration, war-room (bridge), stakeholder updates on a schedule, post-incident review.
- Internal notes, @mentions, collision detection (two agents on one ticket), canned responses, time tracking per ticket.

### 2. Service request management and service catalogue
- Catalogue of request items per team (IT, HR, Admin, Facilities, Finance) with their own forms (P18), visibility by audience, and costs.
- Multi-step approvals (manager, cost centre owner, asset owner) through P03; bundles (one request → several tasks to several teams).
- Fulfilment tasks with their own SLAs; onboarding / offboarding request templates linked to M01.

### 3. Problem management
- Problems from repeated incidents (auto-suggested by similarity), root-cause analysis (5 whys, fishbone notes), known-error database with workarounds shown to agents.
- Link incidents ↔ problem ↔ change; close incidents in bulk when the problem is fixed.

### 4. Change enablement
- Change types: standard (pre-approved templates), normal, emergency.
- Risk assessment questionnaire → risk score; Change Advisory Board (CAB) approvals and meetings; change calendar with blackout / freeze windows and conflict detection.
- Implementation, back-out and test plans; post-implementation review; link to affected CIs and to releases.

### 5. Release and deployment
- Releases grouping changes, release calendar, deployment tasks and sign-offs.

### 6. Asset management (IT and non-IT)
- Hardware, software, mobile, furniture, vehicles, access cards; lifecycle (ordered → in stock → assigned → in repair → retired / disposed) with a full history.
- Assign to person, location or department; check-in / check-out; barcode / QR tags and mobile scan (M04).
- Warranty, AMC and lease tracking with expiry reminders; depreciation (straight line and written-down value) for finance.
- Software licences: entitlements vs installations, compliance alerts, renewals.
- Discovery: lightweight agent (Windows / macOS / Linux) and network scan, plus import from MDM (Intune, Jamf, Google Workspace) and CSV.

### 7. Configuration management (CMDB)
- Configuration items (CIs) with types and custom attributes; relationships (runs on, depends on, connected to) and a visual dependency map.
- Impact analysis for incidents and changes; CI history and baselines.

### 8. Knowledge management
- Articles with versions, review / approval flow, expiry review dates, audiences (internal agent-only vs public), multiple languages (4 at launch, per P21).
- Suggested while typing (deflection), feedback per article, article from a resolved ticket in one click.
- Public help centre for the standalone product and for YukthiX's own customers.

### 9. Service level management
- SLAs per priority, category, customer or contract; OLAs between internal teams; underpinning contracts with vendors.
- Business-hours and holiday calendars per team / location (P03); pause conditions; breach warnings and escalation chains (M08 YX-HD-02).
- SLA reports and customer-facing SLA dashboards.

### 10. Self-service portal and channels
- Branded portal per company (and white-label for the standalone product); mobile app (M04); in-app help drawer in YukthiX.
- Email-to-ticket with threading, multiple support addresses per team, spam / loop protection, attachment scanning.
- Live chat and chat-to-ticket; WhatsApp; Teams / Slack bots; voice (call logging, later click-to-call integration).
- Requesters can be **employees, external customers or guests** (needed for uses 2 and 3).

### 11. Automation and AI
- No-code rules (on create / update / time-based): assign, set fields, notify, escalate, create tasks, call webhooks (P22 workflow studio).
- AI (P10): auto-categorise and route, suggested replies and articles, ticket summaries, sentiment / urgency detection, duplicate detection, virtual agent that answers from KB and policies and raises the ticket when it cannot.

### 12. Monitoring and event management
- Inbound alert webhooks (Prometheus / Grafana, Datadog, Azure Monitor, CloudWatch, Uptime tools); dedupe, correlate and auto-create / auto-close incidents.

### 13. On-call and escalation
- On-call schedules and rotations, escalation policies, SMS / call / push paging through P04, acknowledgement tracking.

### 14. Status page
- Public and private status pages with components, incident updates and subscriber notifications (also used for YukthiX's own status, P20).

### 15. Vendor, contract and procurement
- Vendors and contracts (renewal dates, values, SLAs), purchase requests and purchase orders for assets, receiving into stock.

### 16. Project and task work
- Simple projects and tasks for IT work that is not a ticket (links to M12 where the company has it).

### 17. Enterprise service management (beyond IT)
- Separate workspaces for HR, Admin, Facilities, Finance, Legal, each with its own catalogue, SLAs, agents and privacy (sensitive categories follow M08 confidentiality).
- Facilities: room / desk booking, visitor requests, maintenance requests.

### 18. Customer satisfaction and feedback
- CSAT per ticket, NPS surveys, follow-up on bad ratings.

### 19. Reporting and analytics
- Ready dashboards (backlog, ageing, SLA, first-contact resolution, agent performance, deflection, change success rate, MTTA / MTTR), custom reports (P09), scheduled email reports, exports.

### 20. Platform, security and admin
- Roles: requester, agent, team lead, change manager, CAB member, asset manager, admin; field and record permissions (P02).
- SSO and MFA from P12; audit of every change (P08); data retention rules; GDPR / DPDP data requests.
- Multi-tenant with forced RLS; per-tenant branding, custom domain for the portal, custom fields / forms (P18).
- REST and webhooks API (P11); integrations marketplace (P23): Teams, Slack, Google Workspace, Microsoft 365, Intune, Jamf, Jira / GitHub, monitoring tools.
- Sandbox for config changes (P15); import from other tools (Zoho Desk, Freshservice, Jira SM, CSV).

### 21. YukthiX support specifics (use 2)
- Tickets from customers land in the platform console; agents see company, plan and health (P14 / P20).
- Support sessions with tenant approval (P02 Q8) launched from the ticket.

## Gap check (7 Oct 2026)

> **Method:** we compared the scope above with 16 products (ServiceNow, BMC Helix, Ivanti, SolarWinds, Freshservice, ManageEngine SDP, Zoho Desk, Jira SM, Zendesk, HaloITSM, TOPdesk, SysAid, GLPI, osTicket, ConnectWise PSA, Atera; two findings also from Spiceworks) and the ITIL 4 practice guides. Public sources only (product pages, help centres, pricing pages); everything is written in our own words. 475 raw findings were merged (same capability from several products = one line, highest priority kept), giving **257 distinct items**: **238 added** below, **11 already covered** by planned stories, **8 need a founder decision**. Decisions Q1–Q5 are unchanged.
> **Backlog:** every added line is in at least one story in `tracker/stories/G.json` (US-G-*, under epic EP-B-2). Priority: 1 must, 2 should, 3 could. Phase: the step 3b build phase (Q5). "Seen in" lists products where we found it.

### 1. Incident management

| Added capability | Pri | Phase | Seen in |
|---|---|---|---|
| Ticket templates that pre-fill fields, set required or hidden fields and add task checklists; one-off checklist items per ticket. | 1 | 3b-1 | ServiceNow, BMC Helix, SolarWinds, SysAid, GLPI |
| Ticket types (incident, request, question) with their own form and status flow; convert a ticket from one type to another and keep its history. | 1 | 3b-1 | ServiceNow, SolarWinds, Ivanti |
| Bulk actions on many tickets and one-click scenario actions (a saved bundle of field changes, note and reply). | 1 | 3b-1 | ServiceNow, SolarWinds, Ivanti, BMC Helix, osTicket, GLPI, SysAid, Freshservice, Zoho Desk |
| Configurable list views (columns, filters, custom-field sort), saved personal and shared views, board view, focus lists and CSV export. | 1 | 3b-1 | SolarWinds, ServiceNow, ManageEngine SDP, Zoho Desk, TOPdesk, osTicket, GLPI |
| Context panel beside the ticket: requester's other tickets, assets and CIs, similar incidents and matching known errors; several tickets open as tabs. | 1 | 3b-1 | ServiceNow, BMC Helix |
| VIP requesters whose tickets are flagged and get higher priority or special routing. | 1 | 3b-1 | ServiceNow, BMC Helix, Ivanti, SysAid, GLPI |
| Watchers and CC on tickets (added by requester or agent, email CCs added automatically, internal-only or external). | 1 | 3b-1 | ServiceNow, SolarWinds, BMC Helix, Freshservice, Zoho Desk, ManageEngine SDP, Zendesk, Jira SM, GLPI, osTicket, SysAid |
| Raise a ticket or request for someone else, keeping both 'opened by' and 'requested for'. | 1 | 3b-1 | ServiceNow, BMC Helix, Ivanti, SolarWinds, Jira SM, Zendesk, HaloITSM, SysAid, GLPI, ITIL 4 |
| Assignment skips agents who are away, on approved leave or off shift (uses YukthiX HR leave and shift data when present). | 1 | 3b-1 | ServiceNow, Freshservice, Zoho Desk, SysAid, ConnectWise |
| Side conversations from a ticket with another team or a vendor by email, Teams / Slack or a child ticket; the requester never sees them. | 1 | 3b-1 | Zendesk |
| Custom status labels per desk, each mapped to a fixed system state so SLA pause and reports still work. | 2 | 3b-1 | Zendesk, Jira SM, HaloITSM |
| Reopen rules per desk or category (who, which states, how long), and a linked follow-up ticket once the reopen window has passed. | 2 | 3b-1 | SolarWinds, Zendesk |
| Agent reminders and snooze on tickets, personal to-do list and a desk calendar with an iCal feed. | 2 | 3b-1 | ServiceNow, SolarWinds, Freshservice, ManageEngine SDP, GLPI |
| Email commands: agents and approved requesters update status, priority, assignee or approve by keywords in a reply. | 2 | 3b-1 | ManageEngine SDP, osTicket, SysAid |
| Tasks inside incidents (assignee, due date, status) and standalone internal tasks with their own list. | 2 | 3b-1 | osTicket, GLPI, SysAid, SolarWinds |
| Resolution and closure codes and a required resolution note before resolving. | 2 | 3b-1 | GLPI, SysAid |
| Tiered escalation between L1, L2 and L3 with each step and reason recorded. | 2 | 3b-1 | ITIL 4, SysAid |
| Rich text editor with drag-and-drop attachments, inline images and embedded videos. | 3 | 3b-1 | SolarWinds |
| Free-form tags on tickets, usable in filters, rules and reports. | 3 | 3b-1 | Freshservice, Zoho Desk |
| Create a new ticket or task from one message, and split a ticket in two. | 3 | 3b-1 | osTicket |
| Visual lifecycle designer: statuses, allowed moves, fields required before a move and who may make it, per ticket type or desk. | 1 | 3b-2 | ManageEngine SDP, Zoho Desk |
| Runbooks for agents: step-by-step checklists on tickets with form fields and show / hide logic (guidance only, nothing runs on devices). | 1 | 3b-2 | SolarWinds, ServiceNow |
| Capacity-based push routing: each agent has a capacity per channel and work is pushed to the best available agent. | 1 | 3b-2 | ServiceNow, BMC Helix, Zoho Desk, Freshservice |
| Move or forward a ticket to another desk with field mapping, re-applying the new desk's privacy, SLA and category, with audit. | 1 | 3b-2 | SolarWinds, BMC Helix, SysAid, osTicket |
| Escalate a ticket to Jira, GitHub or Azure DevOps and sync status and comments both ways. | 1 | 3b-2 | Jira SM, HaloITSM, SolarWinds, ServiceNow, BMC Helix, SysAid |
| Interaction records for chats, calls and walk-ups that can close without a ticket or be promoted to one. | 2 | 3b-2 | ServiceNow |
| Only the assignee or their group can complete a task or approval. | 2 | 3b-2 | SolarWinds |
| Share a ticket with another team or desk (view, comment or full) without giving up ownership. | 2 | 3b-2 | Zoho Desk, osTicket |
| Ad-hoc approvals on any ticket, problem or task, not only on catalogue requests. | 2 | 3b-2 | Zoho Desk, Freshservice |
| Recurring tickets and tasks on a schedule from a template, with tracking of missed runs. | 2 | 3b-2 | ManageEngine SDP, Freshservice, GLPI, ServiceNow, SolarWinds, Ivanti, TOPdesk, HaloITSM |
| Multi-site set-up: each branch has its own hours, holidays, groups, workflows and admins inside one company. | 3 | 3b-2 | ManageEngine SDP |
| Archive of old closed tickets: read-only, still searchable and reportable, keeps live tables fast. | 3 | 3b-3 | ManageEngine SDP |
| Walk-up IT desk and appointment booking: check-in by QR or kiosk, live walk-up queue, calendar-synced time slots and wait-time metrics. | 2 | 3b-4 | ServiceNow, HaloITSM |
| Swarming: suggest experts from past similar tickets and open a linked Teams or Slack conversation with them. | 2 | 3b-4 | BMC Helix, ServiceNow |
| Major incident proposal and accept step, and a workbench with timeline, communication plan by audience and channel, and task board. | 2 | 3b-4 | ServiceNow, BMC Helix |
| Launch a session in the company's own third-party remote-support tool from the ticket and log link and duration (we never control the device). | 2 | 3b-4 | ManageEngine SDP, Ivanti, BMC Helix, SolarWinds, HaloITSM, Zendesk, Atera, SysAid, ConnectWise |
| Incident response templates: responders, channel, bridge, stakeholders and checklist set in advance per incident type. | 2 | 3b-4 | Jira SM |
| Incident timeline built automatically from alerts, status changes, chat, pages and recent changes; it seeds the review draft. | 2 | 3b-4 | Jira SM |
| One click creates a Teams / Slack channel and a video bridge for an incident and copies the chat back. | 2 | 3b-4 | Jira SM |
| 'What changed?' view on an incident: recent changes and deployments on the affected services and CIs. | 2 | 3b-4 | Jira SM |
| Outlook / Microsoft 365 add-in to create or update tickets from a mail. | 3 | 3b-4 | ManageEngine SDP |

### 2. Service request management and service catalogue

| Added capability | Pri | Phase | Seen in |
|---|---|---|---|
| Dynamic form rules (show, hide, require, lock, defaults, filtered choices) and reusable questionnaires shared from a company-level library. | 1 | 3b-2 | SolarWinds, BMC Helix, ServiceNow, ManageEngine SDP, Freshservice, Zoho Desk, Jira SM, Zendesk, TOPdesk |
| Approval reminders, auto-approve or reject on timeout, and delegation taken from approved leave. | 1 | 3b-2 | SolarWinds, ServiceNow, SysAid, GLPI |
| Approve or reject from a Teams or Slack card or a mobile push (email and app already planned). | 1 | 3b-2 | ManageEngine SDP, Freshservice, Jira SM, Zendesk, SysAid, GLPI |
| Forms with live data: pick 'my devices', people, locations, cost centres or CMDB objects; cascading choices. | 2 | 3b-2 | SysAid, GLPI, Jira SM, Zendesk, TOPdesk |
| Rich catalogue item pages: images, video, documents, delivery time, ratings and reviews. | 2 | 3b-2 | BMC Helix |
| Cart: several items with quantities in one checkout; each item keeps its own approvals and tasks. | 2 | 3b-2 | ServiceNow, BMC Helix, Freshservice, HaloITSM, SysAid, ITIL 4 |
| Order guides: a few questions assemble the right items and tasks. | 2 | 3b-2 | ServiceNow |
| Group approvals with a quorum: any one, all, N of M or a percentage. | 2 | 3b-2 | ServiceNow, BMC Helix, Ivanti |
| Request stage tracker for the requester, with cancel before fulfilment. | 2 | 3b-2 | ServiceNow, SolarWinds |
| Employee journeys beyond joining and exit: transfer, promotion, move, leave and return, with tasks across teams. | 2 | 3b-2 | ServiceNow, BMC Helix, Freshservice |
| Documents made from templates inside a request (hand-over form, NOC) with e-signature. | 2 | 3b-2 | Freshservice |
| Catalogue items tied to asset models and stock: show stock, reserve an asset, or raise a purchase when out of stock. | 2 | 3b-3 | ManageEngine SDP, Zendesk, HaloITSM, TOPdesk, ServiceNow |
| AI builds a draft catalogue item and workflow from an uploaded procedure document. | 3 | 3b-4 | SolarWinds |

### 3. Problem management

| Added capability | Pri | Phase | Seen in |
|---|---|---|---|
| Problem tasks for several groups, 'risk accepted' and 'fix deferred' states, priority and business-impact estimate. | 2 | 3b-3 | ServiceNow, BMC Helix, ITIL 4 |
| Problem trends: recurring categories, CIs and alert clusters with a 'create problem' action and incidents avoided after the fix. | 2 | 3b-3 | BMC Helix, SolarWinds, ITIL 4, GLPI |
| Known errors and bug status shown to requesters on portal and tickets, with a notice when the fix ships. | 3 | 3b-3 | ITIL 4 |

### 4. Change enablement

| Added capability | Pri | Phase | Seen in |
|---|---|---|---|
| CI/CD pipelines create change records and wait for approval; standard changes approve and close by policy. | 1 | 3b-3 | ServiceNow, BMC Helix, Jira SM, ITIL 4, SysAid |
| Change success score per team and model; proven low-risk changes are auto-approved. | 2 | 3b-3 | ServiceNow, Jira SM |
| Wider clash checks: CI maintenance windows, dependent CIs and busy business days (e.g. payroll day). | 2 | 3b-3 | BMC Helix, ServiceNow |
| Unauthorised change and drift detection: discovery finds a change with no approved record or a CI off its baseline. | 2 | 3b-3 | ServiceNow, BMC Helix, ITIL 4 |
| Visual workflow per change model (stages, gates, approvers); approvers picked from CI and service owners. | 2 | 3b-3 | ManageEngine SDP, Freshservice, SysAid, ITIL 4 |
| Planned outage notices to affected users through the CMDB, status page and portal banner; per-component uptime history. | 2 | 3b-3 | ITIL 4 |
| Change tasks with order and dependencies, recurring changes, and an iCal feed of the change calendar. | 3 | 3b-3 | ServiceNow, SolarWinds, BMC Helix, GLPI, SysAid |
| Change catalogue: standard changes ordered by technical staff like catalogue items. | 3 | 3b-3 | SolarWinds |
| AI change-risk prediction from past changes and incidents, with reasons. | 2 | 3b-4 | BMC Helix, ServiceNow, Jira SM |

### 5. Release and deployment

| Added capability | Pri | Phase | Seen in |
|---|---|---|---|
| Release types, phases, readiness checklist and a go / no-go record; links to Jira or GitHub versions. | 2 | 3b-3 | ServiceNow, BMC Helix, ITIL 4 |
| Deployments per environment and commits, pull requests and builds shown on changes and releases. | 2 | 3b-3 | Jira SM, ITIL 4 |
| Library of approved software versions and release notes published to the portal. | 3 | 3b-3 | ITIL 4 |
| Test plans, test results and user acceptance sign-off linked to changes and releases. | 3 | 3b-3 | ITIL 4 |

### 6. Asset management (IT and non-IT)

| Added capability | Pri | Phase | Seen in |
|---|---|---|---|
| Software normalisation: discovered names mapped to one publisher, product, version and edition. | 1 | 3b-3 | SolarWinds, ServiceNow, GLPI |
| SaaS management: find apps through SSO sign-ins and spend, seats and last use, reclaim at exit, renewal alerts. | 1 | 3b-3 | ServiceNow, Ivanti, Freshservice, SysAid |
| Physical verification campaigns by location with mobile scan and a found / missing / unexpected report. | 1 | 3b-3 | ServiceNow, BMC Helix, TOPdesk, ITIL 4 |
| Multi-source matching rules with source priority per field, import rules for owner or location, conflicts and data-quality score. | 1 | 3b-3 | Jira SM, GLPI, ITIL 4, ServiceNow, BMC Helix |
| 'My assets' in the portal: see, report an issue, ask for replacement, confirm still held. | 1 | 3b-3 | ServiceNow, Ivanti, BMC Helix |
| Licence metrics beyond installs (user, device, core, concurrent, subscription) and reclaim of unused seats with approval. | 2 | 3b-3 | ServiceNow, Ivanti, SysAid |
| Stock rooms, model catalogue and consumables by quantity, reorder levels, transfers and draft purchase requests. | 2 | 3b-3 | ServiceNow, BMC Helix, Ivanti, ManageEngine SDP, HaloITSM, TOPdesk, GLPI, ConnectWise |
| Loaner pool: lend with a due date, reminders, overdue escalation and condition notes. | 2 | 3b-3 | SolarWinds, ManageEngine SDP, GLPI |
| Disposal: data-wipe certificate, e-waste vendor certificate (India E-Waste Rules), sale value and write-off. | 2 | 3b-3 | ServiceNow, BMC Helix, ITIL 4, GLPI |
| Warranty looked up by serial number from the maker, with an "unknown warranty" state. | 2 | 3b-3 | SolarWinds |
| TLS certificates and domains with issuer, expiry, owner and automatic renewal tickets. | 2 | 3b-3 | ServiceNow, SolarWinds |
| Read-only patch, vulnerability and security status on assets (from osquery or the company's tools) turned into tickets, never fixed remotely. | 2 | 3b-3 | SolarWinds, Ivanti, ServiceNow, Atera, SysAid, ManageEngine SDP, Zendesk, HaloITSM, ITIL 4 |
| Total cost of ownership per asset and model: purchase, repairs, contracts, ticket time and depreciation. | 2 | 3b-3 | GLPI, Ivanti, BMC Helix, ServiceNow |
| Read-only import of AWS, Azure, GCP and VMware resources and other inventory tools as assets and CIs. | 2 | 3b-3 | Freshservice, Jira SM, HaloITSM, SysAid, ITIL 4, ServiceNow, BMC Helix |
| Allowed and banned software lists with tickets when banned software is found. | 2 | 3b-3 | ManageEngine SDP, Freshservice, SysAid, GLPI |
| Asset object model designer: types with inheritance, references, several schemas and saved queries. | 2 | 3b-3 | Jira SM, Zendesk, HaloITSM |
| Employee e-signs a hand-over form with condition photos when an asset is issued or returned. | 2 | 3b-3 | ITIL 4 |
| IP address management: subnets, IP per device, unique IPs and use per subnet. | 3 | 3b-3 | Freshservice |
| Print barcode / QR labels singly or in batches from label templates. | 3 | 3b-3 | TOPdesk |
| More asset and CI types: network ports, racks, SIMs, phone lines, databases, clusters. | 3 | 3b-3 | GLPI |
| Pull devices and alerts from the company's RMM tool (NinjaOne, Datto, N-able) as assets and tickets. | 2 | 3b-4 | HaloITSM, Atera, SysAid, ConnectWise |
| Fleet: vehicles with drivers, lease, mileage, service history and insurance expiry. | 3 | 3b-4 | TOPdesk |
| Keys, access passes, parking and lockers as assignable or bookable items with overdue and lost handling. | 3 | 3b-4 | TOPdesk, GLPI |
| AI flags idle, failing or overused devices. | 3 | 3b-4 | SysAid |

### 7. Configuration management (CMDB)

| Added capability | Pri | Phase | Seen in |
|---|---|---|---|
| Business and technical services as CIs with owner, criticality and a service map; "affected service" drives priority and routing. | 1 | 3b-3 | ServiceNow, BMC Helix, Ivanti, ITIL 4, Jira SM |
| CMDB health dashboard: missing fields, duplicates, orphans and stale CIs, with tasks to owners. | 2 | 3b-3 | ServiceNow, BMC Helix, ITIL 4 |
| Dependency maps built automatically from discovery data. | 2 | 3b-3 | Freshservice |
| Non-IT assets linked to CIs and attached to tickets. | 3 | 3b-3 | SolarWinds |

### 8. Knowledge management

| Added capability | Pri | Phase | Seen in |
|---|---|---|---|
| Insert an article into a reply in one click, record which article solved it, flag outdated articles, reuse counts. | 1 | 3b-1 | ServiceNow, BMC Helix, SolarWinds, ITIL 4, SysAid |
| Content-gap report from searches with no result or no click and tickets with no article. | 2 | 3b-1 | ITIL 4, ServiceNow, BMC Helix |
| Article templates, featured articles and reusable content blocks updated once. | 3 | 3b-1 | Zendesk, GLPI, osTicket |
| KCS quality: article states, quality index, coaching notes to authors. | 2 | 3b-2 | BMC Helix, ServiceNow |
| Article audience by department, location, role or desk. | 2 | 3b-2 | ServiceNow, BMC Helix, Ivanti |
| Federated search over SharePoint, Confluence, Google Drive and Notion with source permissions respected. | 1 | 3b-4 | ServiceNow, BMC Helix, Freshservice, ManageEngine SDP, Zendesk, Jira SM, SysAid |
| AI drafts articles from clusters of resolved tickets, finds gaps and suggests updates. | 2 | 3b-4 | Ivanti, ServiceNow, SolarWinds, SysAid, Zendesk, Zoho Desk, Freshservice |
| Community Q&A forum with moderation, best answers and promotion to articles. | 3 | 3b-4 | Zoho Desk, Zendesk, ServiceNow, Spiceworks |
| More languages: machine-translated drafts with human review for the help centre, and more agent UI languages. | 3 | 3b-4 | Zoho Desk, Freshservice, ManageEngine SDP |

### 9. Service level management

| Added capability | Pri | Phase | Seen in |
|---|---|---|---|
| Several SLA targets on one ticket: time to assign, first response, next response, resolution and custom measures. | 1 | 3b-1 | SolarWinds, ServiceNow, BMC Helix, GLPI, osTicket, Jira SM |
| Start, pause and stop conditions per SLA policy on any field, with retroactive start. | 1 | 3b-1 | ServiceNow, SolarWinds, BMC Helix |
| Business hours per SLA policy, with the requester's, team's or site's time zone. | 1 | 3b-1 | SolarWinds, ServiceNow |
| SLA milestones at any percentage, each with several actions. | 1 | 3b-1 | BMC Helix, ServiceNow, GLPI, osTicket |
| Compliance targets per period (e.g. '95 % of P2 in 8 h each month') with at-risk warnings. | 1 | 3b-1 | BMC Helix, ServiceNow |
| SLA scope by a condition builder (AND / OR on any field). | 2 | 3b-1 | SolarWinds |
| SLA timeline on the ticket showing running, paused and breached parts with reasons. | 2 | 3b-1 | ServiceNow, BMC Helix |
| Breach reasons from the agent and approved exclusions, with audit. | 2 | 3b-1 | ITIL 4 |
| Service credits and penalties from contract SLAs, per period and per customer or vendor. | 2 | 3b-3 | BMC Helix |
| Experience score (XLA) from timeliness, updates, CSAT, reopens and effort, per ticket, service and customer. | 2 | 3b-4 | Freshservice, ITIL 4 |

### 10. Self-service portal and channels

| Added capability | Pri | Phase | Seen in |
|---|---|---|---|
| Known-issue and maintenance banners targeted by audience, with a 'me too' button that links to the open incident. | 1 | 3b-1 | ServiceNow, BMC Helix, SysAid, GLPI |
| Send from the company's own domain: SPF, DKIM, DMARC set-up check and a self-service bounce list. | 1 | 3b-1 | SolarWinds, Zendesk, osTicket, SysAid |
| Connect the company's own mailbox by OAuth (Microsoft 365, Gmail) or SMTP / IMAP for receiving and sending. | 1 | 3b-1 | Freshservice, Zoho Desk, osTicket, GLPI |
| Email filters and parsing rules: route, tag, reject and fill fields from subject or body. | 2 | 3b-1 | ServiceNow, BMC Helix, osTicket, GLPI |
| Auto-acknowledgement email per team with ticket number and suggested articles. | 2 | 3b-1 | osTicket, SysAid |
| Every date and SLA time shown in the viewer's own time zone and locale. | 2 | 3b-1 | SolarWinds |
| Open portal without an account using email-link check, bot check and rate limits; sign-up limited to allowed domains. | 2 | 3b-1 | TOPdesk, Jira SM, osTicket, Freshservice |
| Reading aids: dyslexia-friendly font, reading mask, zoom and focus highlight. | 2 | 3b-1 | Zoho Desk |
| Branded login screen and portal themes. | 3 | 3b-1 | SysAid |
| Agent and approver mobile app: queue, reply, approve, SLA alerts, asset scan, offline drafts, manager KPIs. | 1 | 3b-2 | ServiceNow, SolarWinds, Ivanti, BMC Helix, Freshservice, ManageEngine SDP, Zoho Desk, Jira SM, TOPdesk, Zendesk, SysAid, Atera |
| One personalised employee centre across desks with campaigns, my to-dos and a page builder by role or location. | 1 | 3b-2 | ServiceNow, BMC Helix, Ivanti, HaloITSM |
| Embeddable help widget and mobile SDK for the company's own sites and apps. | 1 | 3b-2 | Zoho Desk, Freshservice, Zendesk, Jira SM, HaloITSM, SysAid, Atera |
| Several brands in one company, each with its own help centre, domain, address, theme and templates. | 2 | 3b-2 | Zendesk, Jira SM, Zoho Desk |
| Agents work tickets in Teams or Slack; bots message agents and users for alerts and approvals. | 2 | 3b-2 | BMC Helix, SolarWinds, ServiceNow, SysAid |
| Two-way SMS as a ticket channel. | 2 | 3b-2 | Ivanti, BMC Helix, HaloITSM, TOPdesk, SysAid |
| Proactive chat messages on page or user triggers. | 3 | 3b-2 | Zendesk |
| Chat extras: pre-chat form, buttons and cards, file transfer, rating, hand-over to another team. | 3 | 3b-2 | Zendesk, HaloITSM |
| Telephony (incl. Exotel, Knowlarity): caller pop-up, IVR, recordings, voicemail tickets, click-to-call. | 2 | 3b-4 | Ivanti, BMC Helix, ServiceNow, Zoho Desk, ManageEngine SDP, Zendesk, HaloITSM, SysAid, ConnectWise, ITIL 4 |
| Social channels (Facebook, Instagram, X, Telegram) as ticket sources. | 3 | 3b-4 | Zoho Desk, HaloITSM, Zendesk, SysAid |
| Small helper app that raises a ticket with a screenshot and basic system details. | 3 | 3b-4 | SysAid, Atera |

### 11. Automation and AI

| Added capability | Pri | Phase | Seen in |
|---|---|---|---|
| No-code integration steps: HTTP calls with stored credentials, field mapping, conditions and retries, used by rules, fulfilment and AI. | 1 | 3b-2 | TOPdesk, Zendesk, HaloITSM, SolarWinds, BMC Helix, ServiceNow, Ivanti, Freshservice, ManageEngine SDP |
| Ready automation recipes and a rule trace that shows why each condition passed or failed. | 2 | 3b-2 | Jira SM, TOPdesk, Zendesk |
| Timed multi-step message sequences to requesters. | 3 | 3b-2 | HaloITSM |
| AI resolution help: similar solved tickets with steps, draft resolution notes and hand-over summaries. | 1 | 3b-4 | ServiceNow, SolarWinds, Freshservice, BMC Helix |
| Virtual agent that completes tasks (status, catalogue request, approvals) with defined topics and no-code guided flows on every channel. | 1 | 3b-4 | ServiceNow, Ivanti, SolarWinds, BMC Helix, Jira SM, Zendesk, TOPdesk, Zoho Desk, SysAid |
| AI admin hub: switches per desk, provider or own key, data scope, usage, cost, accuracy, answer review and ROI. | 1 | 3b-4 | Ivanti, ServiceNow, ManageEngine SDP, Zoho Desk, Zendesk, SysAid |
| Desk triggers and actions in Zapier, Make, Power Automate and Workato. | 2 | 3b-4 | SysAid, ManageEngine SDP |
| MCP server and Copilot / ChatGPT connectors so the company's AI assistants use desk data under the user's rights. | 2 | 3b-4 | Freshservice, ManageEngine SDP |
| AI writing help in the reply box: tone, shorten, expand, grammar. | 2 | 3b-4 | SolarWinds, Ivanti, ServiceNow, Zendesk, Jira SM, SysAid |
| AI answers new emails at once from KB and policies with 'solved' / 'still need help'. | 2 | 3b-4 | BMC Helix |
| AI agent studio: multi-step AI agents with guardrails, human approval and action logs (desk records and approved connectors only). | 2 | 3b-4 | ServiceNow, BMC Helix, Freshservice, ManageEngine SDP, Zoho Desk, SysAid |
| Ask your data in plain language, anomaly alerts and trend insights that suggest problems. | 2 | 3b-4 | Ivanti, BMC Helix, Freshservice, Zoho Desk, Zendesk, Jira SM |
| Procedure-guided assist: AI proposes the next reply or action from admin-written steps; agent approves. | 2 | 3b-4 | Zendesk, TOPdesk |
| Operations AI: group alerts, suggest responders, draft stakeholder updates and the review. | 2 | 3b-4 | Jira SM |
| Two-way live translation of tickets and chats, original kept. | 2 | 3b-4 | Ivanti, ServiceNow, Zendesk, SysAid |
| Sandboxed custom script functions and custom action buttons that call an outside API. | 3 | 3b-4 | ManageEngine SDP, Zoho Desk |
| AI helps the requester write a clear description and asks for missing details. | 3 | 3b-4 | SolarWinds |
| Process mining of ticket flow and per-company trained models. | 3 | 3b-4 | ServiceNow, BMC Helix |
| Topic extraction, auto-tags and sentiment trends from tickets and survey comments. | 3 | 3b-4 | Zoho Desk, ServiceNow, Ivanti |
| Admin copilot that reviews desk set-up and drafts rules from plain language. | 3 | 3b-4 | Zendesk |
| Plain-language search and filter of ticket queues. | 3 | 3b-4 | SysAid |

### 12. Monitoring and event management

| Added capability | Pri | Phase | Seen in |
|---|---|---|---|
| Event rules: map fields and CIs, classify, correlate by topology, suppress in maintenance windows from the change calendar. | 2 | 3b-4 | ServiceNow, SolarWinds, Jira SM, ITIL 4 |
| Heartbeat checks and simple built-in uptime checks (HTTP, ping, TLS expiry). | 2 | 3b-4 | Jira SM, Spiceworks |
| Digital employee experience: read-only device health (boot time, crashes, disk) and score, with proactive tickets and pulse surveys. | 3 | 3b-4 | Ivanti, ServiceNow, Freshservice |
| Log anomaly detection that raises alerts. | 3 | 3b-4 | ServiceNow |
| Service health tiles (alerts, incidents, changes) that feed the status page. | 3 | 3b-4 | Freshservice |
| Large catalogue of ready alert integrations plus email-to-alert. | 3 | 3b-4 | Jira SM |

### 13. On-call and escalation

| Added capability | Pri | Phase | Seen in |
|---|---|---|---|
| Two-way link with PagerDuty, Opsgenie or Squadcast. | 2 | 3b-4 | SolarWinds, ServiceNow |
| On-call overrides made from approved leave, with coverage gaps flagged early. | 2 | 3b-4 | ServiceNow |
| Personal paging rules, swaps, follow-the-sun rotations and on-call load reports. | 2 | 3b-4 | Jira SM |
| Acknowledge, escalate and close alerts from Teams or Slack. | 2 | 3b-4 | Jira SM |
| Phone number that rings whoever is on call, voicemail becomes an alert. | 3 | 3b-4 | Jira SM |

### 15. Vendor, contract and procurement

| Added capability | Pri | Phase | Seen in |
|---|---|---|---|
| Vendor scorecards and vendor risk reviews. | 2 | 3b-3 | ServiceNow, BMC Helix, ITIL 4, ConnectWise |
| Push POs, goods receipts and vendor invoices with GST to Tally, Zoho Books or YukthiX finance. | 2 | 3b-3 | ServiceNow, BMC Helix, ManageEngine SDP, Freshservice |
| Vendor escalation from a ticket: vendor case number, vendor SLA clock, email out and replies parsed back. | 2 | 3b-3 | TOPdesk, Zendesk, ITIL 4, GLPI |
| Fuller procurement: approval limits, price lists, quote comparison, invoice matching, payment status. | 3 | 3b-3 | ManageEngine SDP, Freshservice, ConnectWise |
| Self-service ordering of goods and services such as stationery or catering. | 3 | 3b-3 | TOPdesk, HaloITSM |

### 16. Project and task work

| Added capability | Pri | Phase | Seen in |
|---|---|---|---|
| Demand management: ideas scored on value, cost and risk, turned into a project or change. | 3 | 3b-4 | ServiceNow, Ivanti |
| Fuller projects: Gantt, board, milestones, dependencies, resource load, timesheets. | 3 | 3b-4 | Freshservice, ManageEngine SDP, GLPI, ConnectWise, HaloITSM, TOPdesk |

### 17. Enterprise service management (beyond IT)

| Added capability | Pri | Phase | Seen in |
|---|---|---|---|
| HR agent sees the employee's HR summary (grade, manager, location, tenure) beside a case, with field hiding. | 2 | 3b-2 | ServiceNow |
| Clone a desk set-up, move tickets between desks and delegate admin of one desk. | 2 | 3b-2 | Freshservice, Jira SM, Zendesk |
| Planned preventive maintenance for facility assets with checklists and meter readings on mobile. | 2 | 3b-4 | ServiceNow, Ivanti, GLPI, ITIL 4 |
| Dispatch board: book technicians to sites by skill, place and travel time; parts and sign-off on mobile. | 2 | 3b-4 | ServiceNow, ConnectWise, GLPI |
| Space and property: sites, buildings, floors, floor plans, occupancy and move requests. | 2 | 3b-4 | ServiceNow, Ivanti, ManageEngine SDP, TOPdesk |
| Ready industry template packs (schools, hospitals, factories, banks). | 3 | 3b-4 | ManageEngine SDP |
| Room bookings with catering and AV services that create tasks. | 3 | 3b-4 | TOPdesk, HaloITSM |
| Reception desk: expected today, on site now, check-in / out and badge print. | 3 | 3b-4 | TOPdesk |

### 18. Customer satisfaction and feedback

| Added capability | Pri | Phase | Seen in |
|---|---|---|---|
| Survey builder: several questions, CES, branching, per desk or item, throttling, delay, surveys not tied to a ticket. | 2 | 3b-2 | BMC Helix, SolarWinds, ServiceNow, ManageEngine SDP, Zoho Desk, Freshservice, TOPdesk, HaloITSM, GLPI, ConnectWise |

### 19. Reporting and analytics

| Added capability | Pri | Phase | Seen in |
|---|---|---|---|
| Daily KPI snapshots with targets, red / amber / green thresholds, scorecards, trends and forecasts. | 1 | 3b-1 | ServiceNow, BMC Helix, Ivanti, ITIL 4, GLPI, HaloITSM, Jira SM |
| Ready report library per practice, with 360 views per agent, group and requester. | 2 | 3b-1 | SolarWinds, BMC Helix, SysAid, GLPI, HaloITSM, Jira SM |
| Time-in-status and bottleneck reports, including skipped or overridden steps. | 2 | 3b-1 | TOPdesk, Zoho Desk |
| Wallboard / TV mode and live dashboards with threshold alerts. | 2 | 3b-1 | ServiceNow, BMC Helix, Zendesk, ITIL 4, GLPI |
| BI access: Power BI connector, read-only reporting dataset or scheduled export, custom fields included. | 2 | 3b-2 | SolarWinds, Ivanti, ManageEngine SDP, Zoho Desk, Jira SM, Zendesk, SysAid |
| Agent availability, productivity and utilisation reports. | 2 | 3b-2 | Zoho Desk, Atera, ConnectWise |
| Anonymous peer benchmarks for MTTR, CSAT and FCR. | 3 | 3b-4 | ServiceNow, Zendesk |

### 20. Platform, security and admin

| Added capability | Pri | Phase | Seen in |
|---|---|---|---|
| Find and mask personal data (Aadhaar, PAN, bank, card, health, passwords) in ticket text and before AI; encrypt chosen custom fields. | 1 | 3b-1 | SolarWinds, Zendesk, Ivanti |
| Read access log (who viewed or searched what) and fuller audit detail and filters. | 1 | 3b-1 | SolarWinds, Zendesk |
| Standalone desk: directory sync from AD / LDAP, group-to-team mapping and group look-ups (SCIM already planned). | 1 | 3b-1 | ManageEngine SDP, Freshservice, HaloITSM, Jira SM, GLPI, osTicket, SysAid, SolarWinds, ServiceNow, Ivanti |
| In-app set-up checklist, desk set-up wizard and product updates feed. | 1 | 3b-1 | SolarWinds |
| Allowed attachment file types per company, on top of virus scan. | 2 | 3b-1 | SolarWinds |
| More field types with validation (dependent lists, reference to user, asset or CI) and form layout elements. | 2 | 3b-2 | SolarWinds, ServiceNow |
| Custom record types with forms, lists, links to tickets and permissions. | 2 | 3b-2 | ServiceNow, BMC Helix, Ivanti, Zoho Desk, Freshservice, Zendesk, HaloITSM |
| Stream the audit log to the company's SIEM. | 2 | 3b-2 | osTicket, SysAid |
| Ticket screen layout that changes by ticket type, desk or brand. | 3 | 3b-2 | Zendesk |
| Extension SDK for partner apps with widgets, events and app review. | 2 | 3b-4 | Freshservice, Zoho Desk, Zendesk, Jira SM |
| Attachments stored in the company's own storage bucket. | 3 | 3b-4 | osTicket |
| Export and import configuration packages between companies with a diff view. | 3 | 3b-4 | GLPI |

### 21. YukthiX support specifics (use 2)

| Added capability | Pri | Phase | Seen in |
|---|---|---|---|
| Proactive support ticket when customer health signals drop. | 3 | 3b-4 | ServiceNow, Ivanti |

### New · Customer accounts

| Added capability | Pri | Phase | Seen in |
|---|---|---|---|
| Customer organisations with contacts (one contact in several), account owner and organisation-wide ticket view. | 1 | 3b-1 | ServiceNow, BMC Helix, SolarWinds, Zoho Desk, Freshservice, Jira SM, Zendesk, HaloITSM, osTicket, Atera, ConnectWise, GLPI |
| Support plans and entitlements per account (tier, hours or tickets, channels, expiry) driving SLA and routing. | 2 | 3b-1 | Zoho Desk, ManageEngine SDP, Jira SM, HaloITSM |
| Products module: tickets tagged to a product with product KB, SLAs and reports. | 3 | 3b-1 | Zoho Desk |
| CRM connectors (Salesforce, HubSpot, Zoho CRM) for account context on tickets. | 2 | 3b-4 | Zoho Desk |
| Service reviews and customer health for the standalone desk. | 3 | 3b-4 | ITIL 4, ConnectWise |

### New · MSP / multi-client

| Added capability | Pri | Phase | Seen in |
|---|---|---|---|
| Company groups: sub-companies inside one company with inherited settings and agents limited to some companies. | 1 | 3b-1 | GLPI, SysAid |
| Client contracts of several types and prepaid hour or money blocks with low-balance alerts. | 2 | 3b-2 | Atera, ConnectWise |
| Billable time with work types and rate cards, auto timers and timesheets with approval. | 2 | 3b-2 | ConnectWise, Atera, GLPI, BMC Helix, SolarWinds, ManageEngine SDP, Zoho Desk, HaloITSM, TOPdesk |
| Billing runs to invoice batches, recurring invoices, export to accounting. | 2 | 3b-3 | Atera, ConnectWise, ManageEngine SDP, Zoho Desk, HaloITSM |
| Client portal pages for contract balance, time used and invoices. | 2 | 3b-3 | ConnectWise, Atera |
| Profitability per client, contract and agent and an MSP business dashboard. | 2 | 3b-3 | ConnectWise, Atera, ManageEngine SDP |
| Parts and expenses on tickets with cost and sell price. | 3 | 3b-3 | ConnectWise, Atera, GLPI |
| MSP mode: one provider serves many client companies, each with its own portal, SLAs, KB and catalogue. | 2 | 3b-4 | ManageEngine SDP, BMC Helix, SolarWinds, ServiceNow |
| Desk-to-desk exchange: two-way ticket sync with another YukthiX desk or another ITSM tool. | 2 | 3b-4 | ServiceNow, BMC Helix, Zendesk |
| Light sales: opportunities and quotes that become contracts. | 3 | 3b-4 | ConnectWise, HaloITSM |
| Reconcile recurring cloud subscriptions (e.g. Microsoft 365 seats) per client. | 3 | 3b-4 | ConnectWise |

### New · Availability

| Added capability | Pri | Phase | Seen in |
|---|---|---|---|
| Outage records and availability targets per service, uptime, MTBF and MTRS, availability SLAs that exclude planned maintenance. | 2 | 3b-3 | ServiceNow, BMC Helix, ITIL 4 |

### New · Capacity and performance

| Added capability | Pri | Phase | Seen in |
|---|---|---|---|
| Capacity thresholds and trends per CI or service, and capacity plans. | 3 | 3b-4 | ITIL 4 |

### New · Continuity

| Added capability | Pri | Phase | Seen in |
|---|---|---|---|
| Business impact analysis (RTO, RPO), continuity plans and DR test schedule. | 3 | 3b-4 | ITIL 4 |

### New · Risk

| Added capability | Pri | Phase | Seen in |
|---|---|---|---|
| Risk register linked to services, changes, assets and vendors. | 2 | 3b-3 | SolarWinds, Ivanti, ServiceNow, ITIL 4 |

### New · Information security

| Added capability | Pri | Phase | Seen in |
|---|---|---|---|
| Security incident desk with restricted access and evidence log; scanner findings become tickets with fix SLAs. | 2 | 3b-4 | Ivanti, ServiceNow, ITIL 4, SysAid |
| Periodic access reviews as desk tasks for managers. | 3 | 3b-4 | ITIL 4 |

### New · Service financial management

| Added capability | Pri | Phase | Seen in |
|---|---|---|---|
| Budgets per cost centre with spend from POs, contracts, tickets and assets, overspend alerts and forecasts. | 2 | 3b-3 | GLPI, ITIL 4, Ivanti, ServiceNow |
| Cost lines on tickets and changes (time, fixed, material). | 2 | 3b-3 | GLPI |
| Chargeback / showback statements of service and catalogue costs to departments. | 2 | 3b-3 | Ivanti, BMC Helix, ServiceNow, HaloITSM, TOPdesk |

### New · Continual improvement

| Added capability | Pri | Phase | Seen in |
|---|---|---|---|
| Continual improvement register with ideas portal, voting and measured outcomes. | 2 | 3b-4 | ServiceNow, Ivanti, ITIL 4 |

### New · Workforce management

| Added capability | Pri | Phase | Seen in |
|---|---|---|---|
| Agent shift rosters, live team capacity and forecasts of volume and staff needed. | 2 | 3b-2 | Jira SM, Zendesk, TOPdesk, HaloITSM, ITIL 4, ConnectWise |
| Agent skills matrix with levels and training records. | 3 | 3b-4 | ITIL 4, ConnectWise, ServiceNow |
| Optional gamification: points, badges, leaderboards. | 3 | 3b-4 | Freshservice, ServiceNow |

### New · Quality assurance

| Added capability | Pri | Phase | Seen in |
|---|---|---|---|
| Conversation reviews with scorecards, AI scoring, disputes and coaching. | 2 | 3b-4 | Zendesk, ServiceNow |

### New · Service portfolio

| Added capability | Pri | Phase | Seen in |
|---|---|---|---|
| Business service catalogue and portfolio: services with lifecycle, owner, hours, team, SLA, cost and consumers. | 1 | 3b-2 | ITIL 4, ServiceNow, Ivanti |

### New · Developer services

| Added capability | Pri | Phase | Seen in |
|---|---|---|---|
| Catalogue of software components linked to repos with scorecards and delivery metrics. | 3 | 3b-4 | Jira SM |

### New · Licensing & packaging

| Added capability | Pri | Phase | Seen in |
|---|---|---|---|
| Collaborator role: view, internal notes and assigned tasks, cannot own or answer tickets. | 1 | 3b-1 | ServiceNow, Ivanti, Freshservice, Zoho Desk, Zendesk |

### Already covered (not added)

| Capability | Where |
|---|---|
| IP allow-lists and session limits for agents and admins | US-A-016, US-A-010, US-A-015 |
| WCAG 2.2 AA and VPAT | P21 R19 and the design system |
| Dark mode | design system |
| Data region choice | US-A-197 |
| Customer-managed keys (BYOK) | US-A-161 |
| Trust package: certifications, DPA, sub-processors | US-A-169, US-A-168 |
| Notification template editor | US-C-015 |
| Admin view of failed jobs | US-E-278 |
| Per-user notification preferences | US-C-017 |
| @mention notifications | US-B-089, US-C-015 |
| Published uptime commitment with service credits; premium support tier | APX-G, P13, US-B-117/118 |

### Founder decisions on the gap check

> **Decided 7 Oct 2026:** D1 → Q6, D2 → Q7, D3 / D4 / D5 / D7 → Q8, D6 → Q9, D8 → Q10 (see Decisions).

These clash with Q1 or Q4, or touch systems Q4 did not cover. No stories are made for them (D8 only decides the price of a role that is built).

| # | Topic | What others offer | Recommendation |
|---|---|---|---|
| D1 | Actions on devices | Lock or wipe through the MDM from a ticket, self-healing bots, runbooks that run on customer machines. | Keep Q4. Show read-only device data and a deep link that opens the company's own MDM console; the person acts there, not YukthiX. Launch links to the company's own remote-support tool and read-only device data are not a conflict and are added above. |
| D2 | Identity-provider actions | Password reset, account unlock, create / disable users, group and licence changes in Entra ID or Google Workspace by API. | Allow (they act on identity systems, not devices): off by default, company's own app registration with least scopes, approval per action, step-up for the requester, full audit, no stored passwords. |
| D3 | Free plan | A free edition for small teams as a funnel. | Keep Q1: no free tier; the 30-day trial stays. |
| D4 | Add-on SKUs | SaaS management, asset management or project seats sold on their own. | Keep Q1: one plan with every feature, no add-ons. |
| D5 | Day passes for occasional agents | Part-time agents pay per day used. | No for now: it splits the one price; revisit only if trial data shows many part-time agents. |
| D6 | Metered AI and top-up packs | AI resolutions, orchestration calls, SMS or e-sign credits capped, with paid top-ups. | Publish fair-use limits inside the plan, no paid packs; SMS, WhatsApp and e-sign go through the company's own provider accounts. |
| D7 | On-premises edition | Customer-hosted or private-cloud install. | No: cloud only; offer data region choice and BYOK (already planned). |
| D8 | Are collaborators free? | Light seats for people who only add notes or do assigned tasks. | Build the role (US-G-033); make it free like approvers, since collaborators cannot own or answer tickets. |

## Decisions

| # | Topic | Decision (6 Oct 2026) |
|---|---|---|
| Q1 | Price | **₹999 per agent per month** in India, **$10** elsewhere; one all-inclusive plan with every feature above, no add-ons. Free: unlimited requesters (employees, customers, guests), unlimited assets, approvers. Annual prepay 10 months for 12; founding offer ₹799 locked 36 months for the first 100 companies; minimum ₹999 a month; 30-day trial, no card, no free tier (same rules as PRICING-UNIT-ECONOMICS §2). Market check 6 Oct 2026: Freshservice India ₹1,799–10,499, ManageEngine SDP Cloud $13–67, Jira SM $20–51, Zoho Desk India ₹420–2,400 per agent. |
| Q2 | YukthiX HR bundle | The employee → HR helpdesk (M08: tickets, KB, SLA) stays inside the ₹99 HRMS price. IT, Admin, Facilities and other agents on the full Service Desk pay ₹999 per agent. |
| Q3 | Device discovery | **osquery** (open source, Apache 2.0, Linux Foundation) packaged with the company's enrolment key; our API implements osquery's built-in TLS enrol / config / logger endpoints, so no agent code of our own runs on devices. Plus imports from Intune, Jamf and Google Workspace, and an optional office probe (read-only SNMP + ARP; **not nmap**, whose licence forbids bundling in a paid product). Per-company enrolment secret, per-device key (revocable), TLS with our certificate pinned, code-signed Windows / macOS installers (go-live item), no personal data (no browsing history or files). |
| Q4 | Remote actions | **None, ever: inventory only.** The agent runs only our fixed read-only query pack; no remote commands, scripts or ad-hoc live queries. A breach of YukthiX can never control customer devices. Remote control stays with the company's own MDM. |
| Q5 | Build order inside step 3b | Every feature is built; order only. **3b-1 Core:** incidents / tickets, queues, SLA / OLA + business hours, portal + in-app help drawer, email-to-ticket, knowledge base + public help centre, CSAT, external requesters, YukthiX's own support in the platform console (we use it first), core reports. **3b-2 ESM:** service catalogue with forms and approvals, HR / Admin / Facilities / Finance desks, automation rules, live chat, WhatsApp, Teams / Slack. **3b-3 ITIL:** problem, change / CAB + calendar, release, assets + CMDB, osquery discovery + MDM import + office probe, licences, vendors / contracts / procurement. **3b-4 Operations:** monitoring events, on-call + paging, status page, major incident, AI (routing, suggested replies, virtual agent), projects, facilities booking, importers, integrations marketplace. |
| Q6 | Actions on devices (gap D1) | **Q4 stays.** The desk shows read-only device data and a button that opens the company's own MDM console (Intune, Jamf…) on that device; the person acts there. No lock, wipe, script or runbook is ever run by YukthiX. Launch links to the company's own remote-support tool are allowed (the session runs in their tool). |
| Q7 | Identity-provider actions (gap D2) | **Allowed with controls:** password reset, account unlock, create / disable users, group and licence changes in Microsoft Entra ID or Google Workspace, from approved requests. Off by default; uses the company's own app registration with the fewest permissions; approval per action, step-up for the agent, full audit, no passwords stored by YukthiX. They act on identity systems, never on devices. |
| Q8 | Packaging (gaps D3, D4, D5, D7) | **One plan stays:** no free tier (30-day trial), no add-on SKUs sold alone, no day passes for now, cloud only (data region choice and bring-your-own-key encryption instead of an on-premises edition). |
| Q9 | AI (gap D6) | **AI is not inside the ₹999 price.** A company can **bring its own AI key** (P10 BYO key) and use every AI feature at no extra charge from YukthiX; to use **YukthiX's AI** it **buys AI credits** (P10 metering, YX-AI-03). This is the one priced extra on top of the single plan. Credit pack sizes and prices: set in P14 before the build of 3b-4. |
| Q10 | Collaborators (gap D8) | **Free**, like approvers: unlimited collaborator seats who can view tickets they are added to, add internal notes and complete tasks assigned to them, but cannot own, be assigned or answer tickets (role in US-G-033). Only agents pay ₹999. |

## Still to decide (in the detailed design)
- Live chat transport (WebSocket gateway already in the API vs a managed service).
