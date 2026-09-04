# Zoho Recruit → our product: adopt inventory

Competitive walkthrough of Zoho Recruit's **Setup**, section by section, capturing feature
*ideas* to adopt (not their UI/copy — we build in our own Workfox-Azure design language).
Trial org: `yukthix consulting` (org60086190213). Started 2026-09-04.

**Method:** walk EVERY sub-tab AND drill into sub-pages/editors (not just top-level labels) — the real detail (field builders, stage config, per-type templates) lives one or two levels down.

**How to read the Verdict column:**
- **Adopt** — worth building; tier = rough effort (T1 cheap/extends existing · T2 moderate · T3 large subsystem).
- **Partial** — we have most of it; adopt only a slice.
- **Have** — already covered.
- **Skip** — YAGNI for our market.

---

## Prioritized adopt backlog (running, best-first)

| # | Item | From | Tier | Why |
|---|------|------|------|-----|
| 1 | **Notification preferences + email channel** | General → Notification Settings | T1–2 | Extends `NotificationsService` + the bell; approvals already wants email as a fast-follow |
| 2 | **Business Hours + Holidays** (org) | General → Company Details | T1 | Small org-settings; makes interview scheduling + time-to-fill accurate |
| 3 | **Per-user locale/timezone + email signature** | General → Personal Settings | T1–2 | Profile additions; timezone matters for interview slots |
| 4 | **User Groups** | Users & Control → Users | T2 | Named user sets for assignment + notification targeting; reuses users+notifications |
| 5 | **Field-level permissions** (e.g. hide salary/PII by role) | Security Control (Profiles) / Modules → Fields → **Field Permissions** | T3 (cherry-pick) | Highest-value slice of custom profiles; governance for panelists/contractors. **Concrete model (verified):** pick a **Profile** → per **Field** choose **Read-Write / Read-Only / Don't Show** |
| 6 | **Custom permission profiles** (admin-defined permission sets) | Users & Control → Security Control (Profiles) | T3 | Orgs assign permissions without code; big lift |
| 7 | **Record-level visibility** (per-module default access + sharing rules) | Users & Control → Data Sharing | T3 | Recruiters see only their own reqs/candidates by default; major change to our tenant-only RLS. "My candidates" is today's lightweight stand-in |
| 8 | **2-way calendar sync + Meet/Teams links + candidate booking page** | General → Calendar Settings | T2–3 | Net-new; big scheduling UX win |
| 9 | **Email open/click insights + deliverability (SPF/DKIM/DMARC) config** | General → Email Settings | T2 | Trust + engagement metrics on candidate emails |

Skip for our market: **Territory Management** (geo routing), **Zoho Mail Add-on** (Zoho-specific), per-feature *daily* usage limits (fold into existing billing only if needed).

---

## Setup → General
<!-- ✓ validated live page-by-page 2026-09-04 (user-driven walkthrough of every sub-page + sub-tab) -->

| Zoho item | Capability | We have | Verdict |
|---|---|---|---|
| Personal Settings (6 blocks, fully drilled 2026-09-04) | 1. Profile (avatar, name, role badge, title, email); 2. **Locale** (language, country/region, date fmt, time fmt, timezone); 3. **Reporting Hierarchy** (reporting manager + subordinates); 4. email **Signature**; 5. **Name Format** (orderable Salutation/First/Last — minor); 6. **Themes** (per-user UI accent color — minor) | Profile basics; `User.managerId` (built) | **Adopt T1–2:** per-user locale/timezone + signature; surface manager/subordinates on a profile. Name Format + personal Theme = minor/skip |
| Company Details (5 sub-tabs drilled) | Org profile+logo, Access URL, currency/tz. **Fiscal Year** (reporting periods, minor). **Business Hours** (org working hours → keep hiring activity in-hours, SLA base). **Holidays** (location-based holiday lists → interview scheduling avoids holidays). **Hierarchy Preference** (choose data-sharing driver: **Role Hierarchy** vs **Reporting Hierarchy** [manager chain], + fallback for users w/o a manager) | Org branding, slug; `User.managerId` | **Adopt T1:** Business Hours + Holidays (scheduling/SLA). **Hierarchy Preference** makes the record-visibility *source* configurable (roles vs reporting) — ties to Data Sharing #7. Fiscal Year minor |
| Calendar Settings (2 sub-tabs drilled) | **Calendar Settings**: 2-way Google/O365 sync + auto **Meet/Teams** links. **Calendar Booking**: per-recruiter **personal booking pages** (candidate self-books a slot, Calendly-style) | Interview slots + candidate self-confirm; ICS export | **Adopt T2–3:** calendar sync, video links, **booking page** |
| Email Settings (5 sub-tabs drilled) | **Email Settings** = Compose (default font family/size) + Configure (connect IMAP inbox → 2-way sync/send/receive candidate mail in Recruit). **BCC Dropbox** = unique BCC address that auto-files mail sent from your own client into the matching candidate — with a configurable **Search Pattern** (match recipient in Candidates; auto-create if none) + up to **10 verified "Approved Email" sender accounts**. **Email Insights** (open/click tracking + **template analytics & version performance comparison** + email status filters). **Email Authentication** (add domain → **SPF + DKIM** DNS for deliverability). **Email Relay** (send via own SMTP relay) | Candidate emails+templates; working SMTP | **Adopt T2:** open/click insights + template analytics; SPF/DKIM deliverability. IMAP inbox sync = T3. BCC dropbox (+ search-pattern/approved-senders) + relay optional |
| Notification Settings (fully drilled 2026-09-04) | Per-user **event × channel (Alert=in-app / Email)** matrix, **grouped by module**: **Candidate** (Change Status, SMS Sent/Received, Candidate→Contact/Employee, Merge Record, Submit to Hiring Manager, Change Rating, Assessment Submission), **Job Opening** (Association, Candidate Job Apply, Change Status, Job Unpublish, Job Publish), **To-Do** (Task Closed, Create Interview, Create Event), **General** (Change Owner, Note Added/Updated, Create Record, Update Record, Tagged in a note, Hiring Manager Review), **Application** (Change Status, Change Rating). Each group has a master toggle. Scoping: sent only to **record owners/creators**, and **never for your own actions** (self-filter — same idiom as our `notify()` actor-drop) | Fixed in-app bell (mentions/assign/approvals) | **Adopt T1–2 (#1):** per-user event×channel preference matrix + email channel. Group-by-module + master toggles is the shape to copy |

## Setup → Users and Control
<!-- ✓ validated live page-by-page 2026-09-04 (user-driven walkthrough of every sub-page + sub-tab) -->
<!-- General + Users&Control: every sub-tab AND deeper editor drilled & verified (Fiscal Year, Email→Configure/BCC Dropbox/Email Relay, Notification Settings, Users→Activate/Free Trial, Profiles editor grid). No new adopt items beyond those below. -->


| Zoho item | Capability | We have | Verdict |
|---|---|---|---|
| Users (4 sub-tabs drilled) | **Users** (list + add + per-user detail); **Groups** (named public user groups — Create New Group — for sharing/assignment/notification targeting); **Activate Users** (activation mgmt, minor); **Free Trial** (trial status, minor) | Staff Users (CRUD, roles, manager, login-as) | **Have** (list); **Adopt T2:** User Groups |
| Subscriptions (fully drilled 2026-09-04) | Plan overview (Current Plan, Support Plan, Billing Cycle, Next Renewal, Upgrade); **Users Limit** + **Employee Limit** (used/available bars); **Usage Details** with 2 tabs: **Daily Limits** (per-feature/day: Resume Extractor, Resume Parser, Mass Mail 750, Individual Mail 20) and **One-Time Limits** (cumulative caps: File Storage 256MB, Active Jobs 60, Record Storage, Portal Users 10, Video Interview 1) — each row shows Default/Additional/Total/Used/Remaining | Billing usage meters (seats/candidates/AI/proctoring) | **Partial T3 (deferred):** the Daily-vs-One-Time meter split + per-feature Default/Additional/Total/Used/Remaining columns are a good model for our billing usage UI |
| Security Control (5 sub-tabs drilled) | **Profiles** = **3-layer** permission sets (Administrator/Standard/Hiring Manager/Employee + custom). *Profile detail re-verified 2026-09-04:* **(1) Module-level** grid — columns **Entity · Tab Visibility · View · Create · Edit · Delete** (rows: Home, Job Openings, Candidates, Applications, Referrals, Interviews, Departments, Analytics→Metrics/Dashboards/Reports, Campaigns, Reviews, Submissions, Offers); **(2) Feature-Action** groups — Document (view/modify/create/delete + folders), Reports & Dashboards (manage/schedule/compliance), Import, **Export** (per-module toggles), **Candidate management** (Import Resume, Resume Parser Mapping, tags, Manage ResumeInbox, Convert as Employee, Associate/Unassociate to job, Change status, Submit to Hiring Manager, Add/Edit Reviews); **(3) Field-level** (per-field, in Edit mode). **Clone / + New Profile** = admin-defined custom profiles (no code); note "org features [Users&Perms, Company Settings, Job Board Hub, Data Admin, Social] are Administrator-only". **Roles** = hierarchy tree driving data sharing; **Data Sharing Settings** = per-module **Default Organization Permissions** (Private / Public Read-Only / Public Read-Write-Delete; drilled defaults: **Candidates=Private**, Applications/Offers/Vendors/Reviews/Submissions/To-Dos/Campaigns=Private, Job Openings/Interviews/Departments=Public RO, Assessments=Public RWD) + **Compute/Compute All** to apply + a per-module **Sharing Rules** section ("+ New Sharing Rule" = role↔role / role→subordinates / group exceptions). Candidates=Private is the "recruiters see only their own candidates" model our tenant-only RLS lacks; **Attachment Permissions** = per-Profile × Module × attachment-category matrix of View/Create/Edit/Delete/Download; **Zoho Mail Add-on Users** (Zoho-specific) | Fixed role→permission-key RBAC + org-scoped RLS; `User.managerId` | **Adopt T3 selectively:** field-level perms (#5), custom profiles (#6), record-level visibility (#7). Attachment perms = part of custom-profiles (minor). Zoho Mail Add-on = **Skip** |
| Territory Management | Geo territory routing + reporting | Assignee + "My candidates" | **Skip (YAGNI)** |

## Setup → Customization
<!-- ✓ validated live page-by-page 2026-09-04 (user-driven walkthrough of every sub-page + sub-tab) -->

| Zoho item | Capability | We have | Verdict |
|---|---|---|---|
| Hiring Pipeline (2 sub-tabs drilled; pipeline editor re-verified 2026-09-04) | **Tab 1 Hiring Pipeline:** 2-LEVEL **Stage → Statuses**, kanban editor, **8 stages** in the Standard Pipeline: Screening[In Review/Qualified/Junk/Associated/Applied] · Submissions[Submitted-to-hiring-mgr/Approved by hiring mgr] · Interview[to-be-scheduled/scheduled/in-progress/on-hold/rejected-hirable] · Offered[planned/accepted/made/declined/withdrawn] · Hired[8 statuses] · **Rejected[Unqualified/Rejected/Rejected by hiring mgr/Rejected for interview]** · **Archived[Archived]**. Each stage: **+ add status** and **Map Status** (map to canonical status). **Manage Stage** + **Manage Status** global editors + **Create Pipeline** = **multiple named pipelines per role**. **Tab 2 Applications:** **Single vs Multiple Applications** (candidate → many jobs) + a **candidate-level GLOBAL stage** distinct from per-job pipeline: New → In Review (emailed/SMS'd, not associated) → Engaged (associated) → **Available** (job filled, not hired/rejected → freed for future jobs) / Hired / Offered / Rejected (Hired/Offered/Rejected auto-derived when the application moves into that pipeline stage's statuses). Plus an **Application Status** setting: when a candidate is hired for one job (or a job is locked), their **sibling applications** either **auto-archive** or **remain in current status** (configurable) | Hardcoded **flat single-level** per-entry stages (`applied→…→hired`); per-(job,candidate) entries (multi-application OK); NO candidate-level global stage | **Adopt T2–3 (strong):** (a) pipeline = **stage + status** (2-level), configurable, multiple named pipelines; (b) **candidate-level global stage** — esp. **"Available" = re-engageable talent pool**. Biggest pipeline gap |
| Modules (drilled: Module Builder) | Sub-tabs: **Layouts** (drag-drop, multiple layouts/module), **Fields** (~20 types: single/multi-line, email, phone, picklist, multiselect, date, number, currency, formula, lookup, checkbox, user…; **299 custom fields** allowed), **Tabular**, **Layout Rules** (conditional show/hide), **Validation Rules**, **Links & Buttons** (custom actions), **Tags**, **Summary**, **Cooling-off Period** (re-apply waiting rule); module list has Tab Groups (per-role workspaces, up to 10), Web Tabs (embed external pages), **Attachment Category** (named attachment types per module — Resume/Cover Letter/JD — each with **Mandatory** + **Publish in Career Site / Employee Portal** flags), Note Type | Fixed objects/schema; per-role consoles | **Adopt T3 (slice): custom fields on candidate/job** (+ maybe layout/validation rules). **Skip** full low-code module builder (platform scale). **Cooling-off Period = T2 neat niche.** Tab rename/reorder = T2 |
| Templates (all 8 sub-tabs drilled) | **1. Email** — library + merge fields + **per-template open-rate/stats** + folders. **2. Mail Merge** — doc generation from Zoho Writer / imported **MS Word** templates → per-record docs, folders. **3. SMS** — text templates (needs SMS gateway). **4. Job Templates** — reusable JDs (Accountant/Nurse/… pre-filled dept/industry/skills/experience) + folders. **5. Offer Templates** — **multiple** Word offer-letters (Employment/Contract) + folders. **6. Approval Email** — Requested/Completed/Rejected/**Delegated**. **7. Organizational Email** — verified **From/Reply-To** sender addresses (+display name). **8. Unsubscribe Link** — opt-out footer + `${Unsubscribe Link}` merge field + suppression (CAN-SPAM) | Candidate email + message + **single** offer template | **Adopt:** Approval-email templates (T1–2, 4 events incl. delegated→hints a delegation feature); Job templates (T2); **multiple offer-letter templates** (T2, we have one); per-template open-rate stats (T2 w/ email insights); **Organizational sender addresses** (T2); **Unsubscribe/opt-out compliance** (T2, needed for bulk candidate mail); Mail-merge doc-gen (T3, generalizes our offer-PDF); SMS templates (T2–3 w/ SMS gateway) |
| Customize Home page (drilled) | No sub-tabs; per-role list → each opens a **drag-drop home builder** (add Dashboard / Custom View / Others components: pipeline kanban, time-to-fill/hire widgets) | Fixed per-role consoles | **Partial/Skip:** we have role consoles; user-customizable home/dashboard builder is T3, later |
| Translations (2 sub-tabs) | Translation Settings (**27-language** field/picklist i18n via export→edit→import round-trip; Add Language/Import) + Language Import History (upload audit log) | English-only | **Skip** until multi-language market (T3) |

**New backlog entries (append to prioritized list):**
- **Configurable pipeline stages (2-level stage+status) + multiple pipelines** — T2–3, high value (core pipeline upgrade)
- **Candidate-level global stage** (New/In Review/Engaged/**Available**/Hired/Offered/Rejected) — T2–3; "Available" = re-engageable **talent pool** (distinct from per-job pipeline stage)
- **Custom fields on candidate/job** — T3, high-demand extensibility
- **Approval-email templates** — T1–2, dovetails with the just-built approvals feature
- **Job (JD) templates** — T2

## Setup → Parser Management
<!-- ✓ validated live page-by-page 2026-09-04 (user-driven walkthrough of every sub-page + sub-tab) -->

| Zoho item | Capability | We have | Verdict |
|---|---|---|---|
| Parser Mapping | Resume auto-parse → extract fields across 6 sections (Basic/Address/Professional/Social/Education/Experience), configurable **Recruit-field → parser-field mapping**, **Parsing Review** gate (preview/verify before creating candidate) | Resumes stored, not parsed | **Adopt T2 — real gap.** AI resume parsing on upload → structured fields + review step. Reuse existing AI key + candidate-fit AI pattern |
| Resume Inbox (fully drilled 2026-09-04) | Dedicated email address (`resumes@…zohorecruitmail.in`) → emailed/forwarded resumes auto-parsed into candidates. **Configured Accounts** (per-account: Process Email=Attachment, Parse Folder, Owner, Status) + **Parsing Results** tabs. **Parsing Mode** = configurable parse strictness trading success-rate vs accuracy (Lenient: Resume + name/email → High success/Low accuracy; Moderate: + phone/email → Balanced; likely a stricter mode too) | — | **Adopt T2–3 (follow-on):** email-to-candidate ingestion once parsing exists. The **Parsing Mode strictness knob** (which fields must be present to auto-create) is a good idea for our parser too |

**New backlog entry:** **AI resume parsing** (upload → structured fields + review) — T2, reuses AI infra; **Resume Inbox** email ingestion as follow-on.

## Setup → Portal Setup
<!-- ✓ validated live page-by-page 2026-09-04 (user-driven walkthrough of every sub-page + sub-tab) -->

**Correction (2026-09-04 live pass):** most of Portal Setup IS reachable — earlier "all verification-gated" was too broad. Portal config (domain/branding), Manage Portal Users, Cooling-off Period, the Candidate/Vendor/Employee portal toggles, and the Employee referral/application forms all opened fine; only the *fully published external portal* needs company verification. The pattern: Recruit exposes **external-party portals**, each a separate authenticated surface with its own subdomain, branding, and scoped record access.

| Zoho item | Capability | We have | Verdict |
|---|---|---|---|
| Portal (drilled 2026-09-04) | The **shared domain + branding foundation** for all candidate-facing surfaces (Career Site, Candidate Portal, Webforms): **Choose a Domain** (Default `…zohorecruit.in` OR custom **Subdomain**), **Company Details** (name/website/primary-contact), **Portal URL** (`/careers`), **Brand Color** (+ logo). 3 tabs: Portal / Manage Portal Users / Cooling-off Period. (Full external-portal features still need company verification) | Org branding/slug | **Adopt T1–2 (foundation):** domain/subdomain + brand color/logo + portal URL is the shared config our careers-site/webform/candidate-portal adopts all sit on |
| Custom Portal | Build-your-own branded portal — pick modules/fields/tabs an external user sees; low-code portal builder | — | **Skip** (platform-scale low-code; YAGNI) |
| Portal → tabs | Portal config has 3 tabs: **Portal** (verification-gated), **Manage Portal Users** (accessible), **Cooling-off Period** = prevents a candidate reapplying/being referred for a job within a set duration after last application (toggle) | — | **Cooling-off = Adopt T2** (re-apply waiting rule — neat governance) |
| Candidate Portal | Candidates get a **logged-in account** (own subdomain) to track application status, see interview schedule, upload/update documents & profile, receive messages | **Have (lite):** magic-link candidate portal (feature #4 — view applications/interviews/offers, no login/upload) | **Adopt T2 (slice):** add candidate **self-service** to our portal — doc upload + profile update + interview view. Keep magic-link (no passwords) vs Zoho's account login |
| Vendor Portal | External **staffing vendors/agencies** log in to view assigned reqs and **submit their own candidates** into your pipeline; scoped so vendors see only their own submissions | — | **Adopt T3 — real gap, on-market.** Yukthix is a staffing/consulting shop; agency-submission collaboration is a genuine new surface (vendor org + scoped visibility + submission attribution). Ties to record-level visibility (#7) |
| Employee Portal (3 tabs, drilled 2026-09-04) | Internal employees log in for **both referrals AND internal job applications**. 3 tabs: **Employee Portal** (config + live Portal URL, branding), **Employee Referral Form** (employees submit referrals), **Employee Application Form** (employees apply to internal jobs = **internal mobility**) | Referrals exist as a module concept; no employee-facing portal | **Adopt T2–3:** employee **referral portal** (submit + track) **+ internal-mobility applications**; dovetails with Referrals + notifications |

**New backlog entries (append to prioritized list):**
- **Vendor/agency portal** — T3; external agencies submit candidates into scoped pipelines (staffing-market fit); needs record-level visibility (#7)
- **Candidate portal self-service** — T2; extend our magic-link portal with doc upload + profile update + interview view
- **Employee referral portal** — T2–3; internal referral submission + tracking

## Setup → Career Website
<!-- ✓ validated live page-by-page 2026-09-04 (user-driven walkthrough of every sub-page + sub-tab) -->

**Correction (2026-09-04 live pass):** reachable, not fully gated. Both sub-pages opened.

| Zoho item | Capability | We have | Verdict |
|---|---|---|---|
| Career Site (2 tabs) | Hosted, **themeable public careers microsite**: **multiple** career sites (+ New Career Site), each with a live URL + **per-language**; branded job listings, apply flow, branding. 2nd tab **Candidate Application Form** = the configurable apply form (with conditional **Rules**) candidates fill during application | Public jobs list + public apply flow (basic) | **Adopt T2 (slice):** branded/themeable careers page + job search/filter + SEO + per-language. We have the apply plumbing; the gap is presentation + discoverability |
| Webforms (2 tabs) | **Embeddable form snippet** compatible with **Google Sites / Facebook / Joomla / WordPress** — per-form **Get Code/Share** (embed), **Submission Limit**, **Expiry Date**, conditional **Rules**, Status; 2nd tab **Auto-Response Rules** (auto-reply to submissions). Submissions create candidate records. (Also an "advanced Zoho Forms integration" upsell) | Public apply on our own pages only | **Adopt T2:** embeddable apply/referral webform → creates candidate from any external site (lead capture) **+ submission limit/expiry + auto-response**. Reuses candidate-create + resume-parse (once built) |

**New backlog entries:**
- **Themeable careers site** (search/filter + SEO) — T2; presentation layer over existing jobs+apply
- **Embeddable webforms** (apply/referral snippet → candidate) — T2

## Setup → Job Board Hub
<!-- ✓ validated live page-by-page 2026-09-04 (user-driven walkthrough of every sub-page + sub-tab) -->

| Zoho item | Capability | We have | Verdict |
|---|---|---|---|
| Job Boards | **Multichannel job distribution**: one catalog of **49+ paid boards** (Indeed, Adzuna, Apna, Bayt…) + free + social networks; filter by Country / Paid·Sponsor·Free·Social; per-board **enable toggle** to publish an opening; "Request New Job Board" | Integrations roadmap **2d job-boards** slice shipped (un-gated part); no broad catalog | **Partial → Adopt T2–3:** expand to a **board catalog** with per-board enable + social posting. Each board is gated on its own API/credentials (like our deferred OAuth pieces) — build the catalog/enable UX now, wire boards as creds arrive |
| Quick Apply | **One-click apply / autofill from job boards**: Apply with LinkedIn (+ LinkedIn Apply Connect = apply without leaving LinkedIn), Apply with Indeed, Apply with Seek — auto-populates the application from the board profile to cut drop-off; per-provider toggles | Own apply form only | **Adopt (slice) T2, rest T3/defer:** the achievable slice is **resume-autofill on apply** (parse uploaded resume → prefill form; reuses resume-parsing backlog). LinkedIn/Indeed one-click needs per-provider OAuth/partnership → defer |

**New backlog entries:**
- **Job-board catalog + per-board publish toggle** — T2–3; distribution UX now, boards wired as credentials land (extends Integrations 2d)
- **Resume-autofill on apply** — T2; parse uploaded resume to prefill the application (reuses AI resume parsing)

## Setup → Automation
<!-- ✓ validated live page-by-page 2026-09-04 (user-driven walkthrough of every sub-page + sub-tab) -->

The strategic section — a full **no-code automation platform**. 5 sub-tabs, all drilled.

| Zoho item | Capability | We have | Verdict |
|---|---|---|---|
| Workflow Rules | Visual rule builder: **WHEN** (trigger = record create / edit / field-change / **status-change**, per module) → **CONDITION(s)** (filter criteria) → **Instant Actions** + a parallel **Scheduled Actions** (time-delayed) branch. Seeded rules: Job Opening status-change, Cancel Interview, Hired/Rejected Application | Hardcoded notify() on fixed events (mentions/assign/approvals) | **Adopt T3 (targeted).** Near-term achievable slice: **status-change-triggered email/notification** (small trigger table → NotificationsService) rather than a full visual builder. Full engine later |
| Actions (5 types) | Reusable action library invoked by rules/blueprints/approvals: **Alerts** (templated email to candidate/interviewer/users), **Tasks** (auto-create todo), **Field Updates** (auto-set a field), **Webhooks** (POST to external URL, wired into rules, **30-day delivery-failure tracking**), **Functions** (custom Deluge code) | Notifications+email templates (≈Alerts); **Webhooks = built (Integrations 2b)**; no Tasks/Field-Updates/Functions | **Partial → Adopt T2:** Alerts (reuse notifications), Field Updates + Tasks are the new cheap wins; add **webhook failure-tracking/retry visibility** to our webhooks; Functions = **Skip** (low-code platform) |
| Blueprint (editor drilled 2026-09-04) | **State-machine "Recruitment Path"** on a status field (seeded: Applications→Application Status). Visual canvas: **States** (nodes) connected by **named transitions that ARE the user actions** (e.g. "Submit to Hiring Manager", "Approved", "Rejected", "Schedule Interview", "On-Hold") — each transition enforces per-transition requirements (mandatory fields, checklist, actions). **Blueprint Criteria** scopes which records it applies to; draggable **Available States**; Publish/Save-as-Draft. **Usage tab = process analytics**: records per state, transition counts, **avg time per blueprint (cycle time)** + **avg time per state (time-in-stage)** — i.e. pipeline-velocity/bottleneck reporting | Fixed flat stage machine, no per-transition rules | **Adopt T3:** guided transitions w/ per-step mandatory fields/actions — the **enforcement layer** on top of the configurable-pipeline backlog |
| Approval Processes | Rules-based approval: seeded **"Job Requisition Approval"** on Job Openings (Execute On: Create, criteria rules, approver by reporting-manager, post-approval email actions) | **Have — we BUILT our own from this** (requisitions + offer approvals, Phase 1+2, browser-verified) | **Have.** Direct ancestor of our approvals feature. We adopted approver-by-relationship; deliberately CUT criteria/conditional routing, parallel steps, SLA timers, email actions (in-app v1) — see [[project-ats-requisitions-approvals]] spec §10 |
| Schedules | Cron-triggered custom-function jobs to integrate Recruit data with external apps | Job runners exist server-side | **Skip** (dev-facing custom-function scheduler) |

**New backlog entries:**
- **Status-change → email/notification triggers** — T2; the achievable slice of Workflow Rules (trigger table + NotificationsService), no visual builder
- **Field-Update + Task auto-actions** — T2; cheap additions to the action set (webhooks already built)
- **Blueprint / guided stage transitions** (per-transition mandatory fields + actions) — T3; enforcement layer over configurable pipeline
- **Pipeline-velocity analytics** (avg time-in-stage, cycle time / time-to-fill, bottleneck detection) — T2; from Blueprint Usage, pairs with configurable pipeline + reports

## Setup → Marketplace
<!-- ✓ validated live page-by-page 2026-09-04 (user-driven walkthrough of every sub-page + sub-tab) -->

5 sub-items: **Marketplace** (extension store — All Extensions/Installed, filter by Category/Edition/Price/Rating/Deployment; featured: Zoho CRM, **Zoho Sign**, **HackerRank**), **Zoho** (other Zoho apps), **Google** (Workspace), **Microsoft** (O365/Teams), **Zapier** (5000+ apps). Each non-store item = a "connect to X" OAuth page.

| Theme | We have | Verdict |
|---|---|---|
| Third-party **extension marketplace** (install apps) | — | **Skip** — platform-scale play, YAGNI for our market |
| Google/Microsoft/Zapier connectors | Integrations roadmap (2a–2e) shipped some | **Partial/Have** — already our Integrations feature; expand as creds land |
| Featured: **HackerRank** (coding assessments) | **Have — our proctored code-exec exam engine is the moat** | **Have/moat** — don't integrate a competitor, we ARE this |
| Featured: **Zoho Sign / e-signature on offer letters** | Offer PDF generation only | **Adopt T2–3 — real gap.** E-sign flow on offers (candidate signs → status→signed). Integrate a provider (DocuSign/Zoho-Sign-equiv) or lightweight click-to-accept first |

**General ideas surfaced by the Zoho-app connectors** (the connectors themselves are Zoho-specific → Skip, but the capabilities are worth building natively):
- **Candidate nurture / drip email campaigns** (Zoho Campaigns) — bulk/scheduled marketing to the talent pool (esp. the "Available" re-engageable pool) — **Adopt T2–3**
- **Candidate-experience / feedback surveys** (Zoho Survey) — send surveys to candidates (post-interview, candidate NPS) + view responses — **Adopt T2**
- **Hired → HRIS/onboarding handoff** (Zoho People) — we already emit a hired-event (Integrations 2e); wire it to onboarding — **Have (extend)**
- **Advanced analytics / custom BI dashboards** (Zoho Analytics) — beyond fixed reports; user-built dashboards — **T3 (later)**

**New backlog entries:**
- **E-signature on offer letters** — T2–3; candidate e-signs the generated offer → captured/audited. Start with click-to-accept, provider integration later.
- **Candidate nurture campaigns** (drip email to talent pool) — T2–3
- **Candidate-experience surveys** — T2

## Setup → Data Administration
<!-- ✓ validated live page-by-page 2026-09-04 (user-driven walkthrough of every sub-page + sub-tab) -->

7 sub-items drilled/known.

| Zoho item | Capability | We have | Verdict |
|---|---|---|---|
| Data Migration | Import from other ATS / CSV with field mapping | Candidate CSV import (Integrations 2e) | **Partial/Have** — expand mapping if needed |
| Export | Bulk export module data (CSV) | CSV export in reports | **Partial/Have** |
| Data Backup | On-demand/scheduled full-org backup download | Infra-level DB backups | **Skip** (ops-level, not app feature) |
| Storage | Storage usage vs plan limit | Billing usage meters | **Have** |
| **Recycle Bin** (drilled 2026-09-04) | **Soft-delete + restore**: deleted records held **60 days** then auto-purged; **admin-only permanent delete**; non-admins **restore their own** records (others' by permission); shows Name/Type/Deleted By/Deleted Time | Hard delete (mostly) | **Adopt T2 — genuine gap.** Concrete model: 60-day retention window + permission-gated restore + admin-only purge = accidental-deletion governance |
| Audit Log | **Chronological user-action trail** (timestamp · user · action), **Filter by** + **Export** | `AuditService.record` on backend (approvals etc.) — no admin-facing viewer | **Adopt T1–2 — surface a filterable/exportable Audit Log UI** over existing AuditService |
| Activity Log | Login/session activity (who logged in when) | — | **Adopt T1–2:** login/session activity for security/compliance |

**New backlog entries:**
- **Recycle Bin (soft-delete + restore)** — T2; retention-windowed restore for candidates/jobs
- **Audit Log admin UI** — T1–2; filter + export over existing AuditService
- **Login/session activity log** — T1–2; security/compliance

## Setup → Developer Space
<!-- ✓ validated live page-by-page 2026-09-04 (user-driven walkthrough of every sub-page + sub-tab) -->

Dev-platform section. 3 sub-items.

| Zoho item | Capability | We have | Verdict |
|---|---|---|---|
| Functions (4 sub-tabs) | Standalone custom **Deluge** functions (callable from buttons/workflows/schedules; can expose as REST API). Sub-tabs: **Functions** (list), **Gallery** (pre-built templates), **Dashboard** (execution stats), **Failures** (error tracking) | — | **Skip** (low-code platform; not our product) |
| Recruit Variables | Org-level constants (env-var style) usable inside Functions | — | **Skip** (only useful with Functions) |
| APIs | Customer-facing **public REST API** + **API-name registration** + **usage metering** dashboard (calls/day vs credit limits) | Internal NestJS API; no public/customer API + keys | **Adopt T2–3 (enterprise tier):** documented public API + per-org API keys + usage metering. Fits the billing/commercialization thread |

**New backlog entry:** **Public API + per-org keys + usage metering** — T2–3; enterprise-tier programmatic access (ties to billing).

## Setup → Telephony
<!-- ✓ validated live page-by-page 2026-09-04 (user-driven walkthrough of every sub-page + sub-tab) -->

Candidate-communication channels. 4 items.

| Zoho item | Capability | We have | Verdict |
|---|---|---|---|
| Instant Messaging | **WhatsApp / chat** integration for candidate messaging | — | **Adopt T3 — high value for India market** (Yukthix is India-based; WhatsApp is the dominant channel). Needs WhatsApp Business API |
| SMS Gateway | Connect an SMS provider (Twilio etc.) → send **SMS to candidates** (reminders, status) | — | **Adopt T2–3 — real gap.** Ties to the SMS-templates backlog (Templates §3). Interview reminders + status SMS |
| PhoneBridge | **Click-to-call + call logging** via a cloud telephony provider | — | **Adopt T3 / defer:** for high-volume phone recruiting; needs telephony provider |
| Mobile Apps | Links/config for Zoho's native mobile apps | — | **Skip** — a native mobile app is its own project, not a setting to replicate |

**New backlog entries:**
- **SMS to candidates** (gateway + reminders/status) — T2–3; pairs with SMS templates
- **WhatsApp candidate messaging** — T3; India-market channel (WhatsApp Business API)

## Setup → Compliance
<!-- ✓ validated live page-by-page 2026-09-04 (user-driven walkthrough of every sub-page + sub-tab) -->

5 items. Candidate-data privacy & anti-discrimination compliance.

| Zoho item | Capability | We have | Verdict |
|---|---|---|---|
| GDPR (3 sub-tabs drilled 2026-09-04) | Master GDPR toggle, then: **Preferences** (enable GDPR mode per module, e.g. Candidates); **Consent Form** (candidate consent capture + lawful basis, gated behind the toggle); **Privacy** (editable **privacy notice** shown to candidates on the careers page, linked via `{URL}`). Data-subject rights (erasure/export) are handled as per-candidate record actions once GDPR is on, not a Setup page | Candidate PII stored; no consent/erasure flow | **Adopt T2–3 — real compliance gap.** Consent capture on apply + careers-page privacy notice + **right-to-erasure/export** per candidate. Needed for EU/enterprise sales. Ties to soft-delete (Recycle Bin) + candidate portal |
| Sub Processors | Transparency list of sub-processors | — | **Skip** (legal doc, not a product feature) |
| EEO Compliance (drilled 2026-09-04) | US EEOC anti-discrimination mode (protects on race/ethnicity, religion, sex, national origin, age, disability, genetic info). Enabling it enforces a **1-year record-retention lock** (can't delete Job Openings / Associated Candidates / Departments / Interviews / To-Dos with last-activity under a year) + demographic capture/reporting | — | **Adopt T3 / defer** (US-market; the **retention-lock** mechanic is a reusable idea for any legal-hold requirement) |
| OFCCP | US federal-contractor affirmative-action applicant tracking | — | **Defer/Skip** (US-federal niche) |
| HIPAA Compliance (drilled 2026-09-04) | Mark fields as **personal health data**, then restrict their egress: **Restrict Data Transfer to Zoho Apps / Third-party Apps / API access / Export** (toggles) | — | **Skip/defer as HIPAA**, BUT the underlying mechanic — **flag a field sensitive → block it from export/API/integrations** — is a **reusable PII-egress control** worth T2–3 (pairs with field-level perms #5) |

**New backlog entry:** **GDPR candidate-consent + data-subject rights** (consent form on apply · right-to-erasure/export) — T2–3; EU/enterprise compliance, pairs with soft-delete + candidate portal.

## Setup → Zia (AI)
<!-- ✓ validated live page-by-page 2026-09-04 (user-driven walkthrough of every sub-page + sub-tab) -->

5 items. Zoho's AI layer. **Note:** our AI infra (AI key + candidate-fit + proctoring screen-analysis) already exists, but **prod has no AI key** ([[project-remote-access-detection-deploy-pending]]) — every Zia-equivalent adopt depends on provisioning a prod AI key first.

| Zoho item | Capability | We have | Verdict |
|---|---|---|---|
| Zia Matches | **Bidirectional AI candidate↔job matching**: LLM + auto-parsed skills (Skillset Template Library), top-20 ranked, "Find Matching Candidates" / "Find Matching Job Openings" | Candidate-fit AI | **Partial/Have — formalize:** ranked bidirectional matching + a skills taxonomy over our fit AI |
| AI Assist (drilled 2026-09-04) | Generative AI (pre-defined + **custom prompts**) to instantly generate **job descriptions, emails, texts/SMS, and assessments** — embedded in Template editors, job creation, and email/SMS composers. Zoho uses a **BYO ChatGPT/OpenAI Secret Key** model (customer's own key); English-only; admin+permission gated | — | **Adopt T2 — cheap win:** JD + candidate-email + SMS generation in composers (we use our OWN AI, no BYO key needed). **AI assessment/question generation** is a bonus that feeds our exam engine |
| Zia Summary (drilled 2026-09-04) | 4 AI summary types (each toggle): **Profile Summary** (candidate at a glance), **Record Summary** (key updates/context/insights), **Email Summary** (email key points), **Notes Summary** (structure detailed notes) | — | **Adopt T2:** candidate profile/resume summary first; email + notes summaries are easy follow-ons (reuse AI) |
| AI Interview Insights (drilled 2026-09-04) | **Transcribe recorded one-way/async video interviews → transcript + AI summary** (9 languages; one-way recorded only) | Proctoring + screen analysis (our moat) | **Partial → Adopt T2–3:** if/when we have async video interviews, add transcript + AI summary; our proctored exam engine stays the differentiator |
| Chatbot (drilled 2026-09-04) | Candidate-facing AI chatbot on career site/portal: **find matching jobs** (LLM), **register to portal** (passive talent-pool growth), **track applications/saved jobs**, **take pre-screening tests** via chat. Two modes: **Sourcing Bot** (gather candidate data, filter junk apps) + **Screening Bot** (screen profiles, store results on candidate) | — | **Adopt T3 / defer** (conversational pre-screen is lighter than our proctored exam engine — keep the exam engine as the moat) |

**New backlog entries:**
- **AI Assist** (JD + email generation) — T2; needs prod AI key
- **AI candidate/interview summaries** — T2; reuses AI + resume parsing
- **Formalized bidirectional AI matching + skills taxonomy** — T2–3; builds on candidate-fit AI

---

## ✅ Walkthrough complete — all 14 Setup sections drilled + LIVE page-by-page re-validation (2026-09-04)

General · Users & Control · Customization · Parser Management · Portal Setup · Career Website · Job Board Hub · Automation · Marketplace · Data Administration · Developer Space · Telephony · Compliance · Zia — every sub-tab and the representative deeper editors captured.

**All 14 sections carry a `✓ validated live page-by-page 2026-09-04` marker** — a second, exhaustive pass where the user opened every single sub-page and sub-tab one-by-one and each was reconciled against this doc. New detail found in that pass (not in the first drill): Personal Settings Name-Format/Themes · Email BCC Search-Pattern + Approved-Senders · full Notification event matrix (5 groups) · Subscriptions Daily/One-Time meter model · Profiles 3-layer grid (+ Tab-Visibility column + all feature-action groups) · Data-Sharing per-module defaults · Field-Permissions RW/RO/Don't-Show · Attachment-Category Mandatory/publish flags · Pipeline Rejected+Archived stages (8 total) · Applications sibling-behavior setting · Approval-email Delegated event · Resume-Inbox Parsing-Mode strictness · Portal = shared domain/branding foundation · Employee Portal = referrals **+ internal mobility** · Webforms submission-limit/expiry/auto-response · Blueprint Usage = pipeline-velocity analytics · Webhook 30-day failure tracking · Recycle-Bin 60-day model · EEO retention-lock · HIPAA PII-egress control · AI-Assist assessment generation · Zia Summary 4 types · AI Interview Insights = async-video transcription.

**Additional adopt candidates surfaced in the live pass** (fold into the tiers above): pipeline-velocity/time-in-stage analytics (T2) · candidate nurture/drip campaigns (T2–3) · candidate-experience surveys (T2) · PII-egress field controls (T2–3) · legal-hold retention lock (T3) · webhook failure-tracking (T1–2) · internal-mobility employee applications (T2–3).

### Consolidated top adopt candidates (across all sections)

**Tier 1 / quick (extend what exists):**
1. Notification preferences + **email channel** (General → Notification Settings) — approvals already wants email
2. Business Hours + Holidays (General → Company Details) — scheduling/SLA accuracy
3. Per-user locale/timezone + email signature (Personal Settings)
4. **Audit Log admin UI** + login/session activity (Data Admin) — surface existing AuditService

**Tier 2 (moderate, high demand):**
5. **AI resume parsing** on upload → structured fields + review (Parser Mgmt) — reuses AI infra
6. **Configurable pipeline (2-level stage+status) + multiple pipelines** (Customization → Hiring Pipeline) — biggest pipeline gap
7. **Candidate-level global stage** incl. **"Available" = re-engageable talent pool** (Hiring Pipeline)
8. **Custom fields** on candidate/job (Modules)
9. **Approval-email templates** + **multiple offer-letter templates** + **organizational sender addresses** + **unsubscribe/opt-out** (Templates)
10. **User Groups** (Users & Control) — assignment + notification targeting
11. **Status-change → email/notification triggers** (Automation) — the achievable slice of Workflow Rules
12. **Recycle Bin (soft-delete + restore)** (Data Admin)
13. **E-signature on offer letters** (Marketplace) — start click-to-accept
14. **Embeddable webforms** + themeable careers site (Career Website)
15. **AI Assist / AI summaries** (Zia) — needs prod AI key
16. **SMS to candidates** (Telephony) — reminders/status
17. **Candidate portal self-service** (doc upload + profile update) — extend our magic-link portal

**Tier 3 (large subsystems, selective/deferred):**
18. Field-level permissions + custom permission profiles + record-level visibility (Security Control) — governance
19. **Blueprint / guided stage transitions** (Automation) — enforcement over configurable pipeline
20. **Vendor/agency portal** (Portal Setup) — staffing-market fit; needs record-level visibility
21. **GDPR consent + data-subject rights** (Compliance) — EU/enterprise
22. Calendar 2-way sync + Meet/Teams links + candidate booking page (Calendar Settings)
23. Job-board catalog + per-board publish (Job Board Hub)
24. WhatsApp candidate messaging (Telephony) — India market
25. Public API + per-org keys + usage metering (Developer Space) — enterprise tier

**Explicitly Skip:** Territory Management · full low-code Module/Portal builders · Custom Functions/Deluge/Recruit Variables/Schedules · Zoho Mail Add-on · Marketplace extension store · Data Backup (infra) · Sub Processors (legal doc) · Mobile Apps · HackerRank (we ARE the exam engine) · Translations (until multi-language market).

**Moat (do NOT replace):** our **proctored, code-execution exam engine** — Zoho Assessments are just questionnaires.












