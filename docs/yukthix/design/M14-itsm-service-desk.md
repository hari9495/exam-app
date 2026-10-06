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

## Still to decide (in the detailed design)
- Pricing and packaging for the standalone product (per agent / month like the market, or bundled).
- Discovery agent: build vs a proven open-source agent (e.g. osquery) — library-first preferred.
- Live chat transport (WebSocket gateway already in the API vs a managed service).
- Phasing inside step 3b (suggested: core ticketing + catalogue + KB + SLA + email + portal first; then problem / change / CMDB / assets; then on-call, events, status page, procurement).
