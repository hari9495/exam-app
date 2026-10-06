# YukthiX HR Suite — Working Spec

**Last updated:** 24 September 2026

---

## 1. Features

The suite ships as four products on a shared platform (§2.1).

| # | Product | Purpose | Status |
|---|---|---|---|
| 1.1 | Proctoring | Assessments and invigilation for hiring and training | Near ready |
| 1.2 | ATS | Applicant tracking — internal hiring and external staffing | To build |
| 1.3 | HRMS | Employee lifecycle from onboarding to alumni | To build |
| 1.4 | Analytics | Reporting across all products | To build |

---

### 1.1 Proctoring

Online assessment with invigilation. Serves three use cases:

| Use case | Description |
|---|---|
| Job screening | Assessment sent to a candidate against a specific job |
| Recruitment drive | Bulk assessment, e.g. fresher hiring |
| Internal training | Assessment for existing employees |

**Proctoring modes.** Declared per test. Every control below behaves differently depending on the mode selected.

| Mode | Behaviour | Typical use |
|---|---|---|
| Open | No proctoring | Low-stakes internal training |
| AI-only | Automated detection and flagging, no human | Volume screening |
| Record and review | Session recorded; human reviews flagged segments afterwards | Standard hiring |
| Live | Human invigilator watching in real time, 1 : 8–16 candidates | High-stakes, certification |

#### 1.1.1 Question Bank

**Question attributes**

| Attribute | Notes |
|---|---|
| Type | MCQ, multi-select, descriptive, coding with compiler, file upload, video response |
| Skill / category | Taxonomy — e.g. Java, Salesforce Development, AI/ML. Hierarchical: domain → skill → sub-skill |
| Difficulty | Level on a fixed scale, independent of marks |
| Default marks | Bank-level default, overridable per test |
| Negative marks | Optional, per question |
| Expected time | Used for duration calculation and adaptive pacing |
| Tags | Free-form, for reuse and filtering |
| Status | Draft, under review, approved, retired |
| Version | Edits create a new version; live tests stay pinned |
| Usage statistics | Times served, percentage correct — feeds psychometrics (§1.1.13) |

**Rich content**
- Images, audio and video in the question body
- Mathematical notation (LaTeX)
- Formatted code snippets with syntax highlighting
- Attachments and reference material

**Multi-language**
- Same question authored in multiple languages
- Candidate selects language at test start

**Bank management**
- Collections and folders, with ownership
- Author → reviewer → approver workflow before a question goes live
- Bulk import and export
- Duplicate detection
- Retirement without breaking historical results

> **Design note.** Marks and difficulty are separate fields even though they usually correlate. The same hard question may be worth 3 marks in a screening test and 5 in a certification test.

#### 1.1.2 Test Builder

**Test modes**

| Mode | Behaviour |
|---|---|
| Fixed | Every candidate sees the same questions in the same order |
| Randomised | Questions drawn from a pool against a blueprint |
| Adaptive | Difficulty adjusts to candidate performance |

**Blueprint**
- Questions per skill and per difficulty level
- Total marks and pass mark
- Duration, overall and sectional

**Adaptive rules**
- Starting difficulty
- Step up on a correct answer, step down on an incorrect one
- Floor and ceiling difficulty
- Step size and consecutive-answer rules
- Termination — fixed question count, time limit, or confidence threshold
- Minimum pool depth required per skill and difficulty before adaptive mode can run

**Common settings**
- Sections and sectional timing
- Randomisation and question pooling
- Negative marking
- Retake and reset policy
- Question navigation — forward-only or free movement, review and flag

**Lifecycle**
- Test templates and reusable library
- Versioning, with publish approval
- Archive and retirement

#### 1.1.3 Coding Assessment

- Supported languages and runtime versions
- Visible test cases and hidden test cases
- Partial scoring against test cases passed
- Execution sandbox — CPU, memory, wall-clock and network limits
- Editor features — syntax highlighting, autocomplete policy, theme
- Compile and run history retained as an integrity signal
- Database and SQL question support

#### 1.1.4 Scheduling & Invitations

**Invitations**
- Individual and bulk invites
- Access windows and deadlines
- Timezone handling — resolved in the candidate's local timezone, with the authoring timezone recorded on the test
- Reminder notifications and missed-test alerts

**Candidate scheduling**
- Self-scheduling into available slots
- Rescheduling rules and limits
- No-show handling

**Drive mode**
- Thousands of concurrent candidates
- Capacity and load planning
- Low-connectivity and offline handling

**Device policy**
- Per test: proctored desktop browser only, or any device
- Mobile delivery permitted only where the secure browser is not required

#### 1.1.5 Pre-Test Experience

- System readiness check — camera, microphone, bandwidth, CPU, browser version, blocked processes
- Practice or demo test, unscored
- Instructions and rules screen with explicit acknowledgement
- 360° room scan
- Optional second-device phone camera for high-stakes tests
- Consent capture → §1.1.15

#### 1.1.6 Proctoring Controls

**Secure browser**
- Proprietary proctored browser, downloaded and installed before the test
- Kiosk mode — no tab switching, no address bar, no developer tools
- Virtual machine and emulator detection

**Identity**
- ID document verification
- Face match against the ID at start
- Periodic re-authentication during the test to catch mid-session candidate swaps

**Environment monitoring**
- Face detection and multiple-person detection
- Audio monitoring for background voices
- Tab-switch and window-focus detection
- Copy, paste and print blocking
- Screenshot and screen-recording blocking

**Remote-access and screen-share detection**
- Active conferencing sessions — Teams, Zoom, Meet, Webex
- Remote-control tools — AnyDesk, TeamViewer, Chrome Remote Desktop, RDP, VNC
- Screen mirroring and casting
- Multiple-display detection
- Virtual camera and virtual audio driver detection
- Blocked-process list, checked at launch and polled during the test
- Configurable action per detection — warn, pause, or terminate

#### 1.1.7 AI-Assistance Detection

The defining integrity problem for assessments today. Every control in §1.1.6 is defeated by a candidate using an LLM on a second device.

- Response-time anomaly detection — answers returned faster than plausible
- Typing and paste-pattern analysis
- Stylometric comparison of descriptive answers against LLM output signatures
- Second-device detection on the local network
- Follow-up probe questions triggered by suspiciously strong answers
- Signals surfaced as weighted flags for review, never as an automatic fail

#### 1.1.8 Session Continuity

- Auto-save on every answer
- Recovery from power loss and network drop, resuming at the last question
- Time credit for lost time, configurable
- Admin-approved resume with re-authentication
- Scheduled and unscheduled breaks, with rules per test

#### 1.1.9 Monitoring & Review

**Live proctoring**
- Invigilator dashboard with multi-candidate view
- Chat and intervention with a candidate
- Pause or terminate a session

**Record and review**
- Session recording — screen, camera, audio
- Reviewer playback, jumping to flagged segments

**Proctor operations**
- Proctor accounts and roles
- Assignment, capacity and shift planning

**Retention**
- Recording retention period per tenant
- Data residency per tenant
- Chain of custody on all evidence

#### 1.1.10 Integrity Checks

- Plagiarism detection against external sources
- Code-similarity detection
- Cohort collusion — answer-pattern similarity between candidates in the same drive
- Question exposure monitoring → §1.1.13

#### 1.1.11 Incident Management

- Violation taxonomy with severity levels
- Evidence bundle per incident — clip, screenshot, timestamp, detection type
- Reviewer queue and verdict
- Override with recorded reason
- Candidate appeal process
- Tamper-evident audit trail, so a decision is defensible if challenged

#### 1.1.12 Scoring & Outcomes

**Automated scoring**
- Objective question auto-scoring
- Comparable scoring for adaptive tests — candidates see different questions, so raw totals are not comparable; score must weight difficulty
- Percentile and cut-offs
- Skill-level breakdown, not just a total

**Manual evaluation**
- Rubric-based evaluation for descriptive and video answers
- Multiple evaluators per response
- Blind evaluation and inter-rater agreement checks

**Outputs**
- Candidate score report, with configurable visibility
- Cohort comparison for drives
- Auto-shortlist into ATS → §1.2
- Certificates for internal training → §1.3.9

#### 1.1.13 Psychometrics & Item Analysis

- Item analysis — difficulty index and discrimination index
- Distractor analysis for MCQs
- Reliability measures (Cronbach's alpha)
- IRT calibration, which is what makes adaptive scoring statistically defensible
- Question exposure control — cap how often an item is served before rotation

#### 1.1.14 Accessibility & Accommodations

- Screen reader compatibility
- Extra-time accommodations
- Font scaling and contrast options
- Keyboard-only navigation
- Documented accommodation request and approval process

#### 1.1.15 Privacy, Consent & Fairness

Face and voice data are biometric data under GDPR Article 9, India's DPDP Act and Illinois BIPA. BIPA carries statutory damages per violation and has produced significant settlements against proctoring vendors specifically.

**Consent**
- Explicit, granular consent before any biometric capture
- Stated retention period with automatic deletion
- Documented lawful basis per jurisdiction
- Candidate right to withdraw and request erasure

**Fairness**
- Manual review fallback whenever face detection fails
- Published accuracy testing across skin tones and demographics
- No candidate auto-failed on a biometric signal alone

#### 1.1.16 Integrations

- Auto-shortlist handoff into ATS → §1.2
- LMS integration via SCORM and xAPI for the internal training use case
- Certificate issue → §1.3.9

---

### 1.2 ATS

Applicant tracking in two modes. Both share a common candidate and interview layer (§1.2.1).

| Mode | Hiring for | Example |
|---|---|---|
| Internal (§1.2.2) | The company's own departments | Prudent hiring developers for Data Science, Cybersecurity |
| External (§1.2.3) | External client companies | Prudent's staffing desk filling a client requirement |

#### 1.2.1 Shared Capabilities

**Candidate management**
- Resume parsing, deduplication, candidate merge
- Talent pool, hotlist, bench
- Candidate portal — application status, document upload
- Candidate consent and data retention (GDPR / DPDP)

**Interviewing**
- Scheduling with panel availability and calendar sync
- AI-conducted first round
- Panel interviews, scorecards and feedback

**Communication & verification**
- Templates and bulk actions
- Background verification integration

**Reporting**
- Recruiter productivity and pipeline dashboards

#### 1.2.2 Internal ATS

Departments raise their own hiring needs; a central recruitment team fulfils them.

**Flow**

| Step | Owner | Action |
|---|---|---|
| 1 | Department head | Opens a position against their department |
| 2 | Recruitment team | Sources profiles |
| 3 | Recruitment team | Screens and shortlists |
| 4 | AI | Conducts round-one interview |
| 5 | Interview panel | Conducts round-two interview |

**Capabilities**
- Manpower requisition against approved headcount budget
- Career page, branded per tenant
- Job board posting and distribution
- Employee referral management
- Offer management, approval and letter generation
- Handoff on offer acceptance → §1.3.2

#### 1.2.3 External ATS

Staffing delivery against client requirements.

**Flow**

| Step | Action |
|---|---|
| 1 | Register the customer — name, points of contact, source |
| 2 | Register jobs under the customer |
| 3 | Source candidates against a job; build profile and attach CV |
| 4 | Submit to the customer contact by email — individually or in bulk |
| 5 | Conduct interviews |
| 6 | Track status through submission, interview and outcome |

**Capabilities**
- Rate cards, margin and commission tracking
- Contract and placement management
- Contractor and deployed-employee lifecycle
- Timesheet → invoice → billing, sourced from §1.3.4
- Client SLA tracking

> Out of scope: vendor and sub-vendor management.

#### 1.2.4 Client Helpdesk

Ticketing for external ATS customers, raised by the customer's point of contact against their jobs or submissions.

---

### 1.3 HRMS

Employee lifecycle management, grouped into five areas.

| Area | Sections |
|---|---|
| Employee record | 1.3.1 – 1.3.2 |
| Time & pay | 1.3.3 – 1.3.7 |
| Growth | 1.3.8 – 1.3.9 |
| Service & support | 1.3.10 – 1.3.12 |
| Exit & governance | 1.3.13 – 1.3.16 |

#### Employee record

**1.3.1 Core HR**
- Employee master with custom fields — India identity fields (PAN, Aadhaar, UAN, ESIC IP, IFSC) validated and masked
- Locations with state (drives PT, LWF, holiday calendar)
- Org chart and reporting lines
- Probation and confirmation
- Transfers, promotions and job changes, with effective dating and history
- Headcount and workforce planning → feeds §1.2.2
- Succession planning
- Contingent workforce — people placed via §1.2.3
- Manager self-service

**1.3.2 Onboarding**
- Pre-boarding and document collection
- Background verification
- Asset issue → §1.3.10
- Induction and task checklists

#### Time & pay

**1.3.3 Leave Management**
- Leave types, accrual and balances — balances derived from a leave ledger, never stored as a single number
- Leave year configurable per company or legal entity — calendar, financial or custom start month
- Accrual — monthly, quarterly, half-yearly, yearly; per-type rounding with a year-end true-up; reduced by loss-of-pay days; by days worked (1 EL per 20 days, Factories Act)
- Carry forward with cap and expiry
- Sandwich rule per leave type — none, sandwich or always; weekly offs, holidays or both
- Half days — first half or second half; hourly and short leave (permission hours)
- Negative balance per leave type, with a limit; recovered from future accruals, else deducted in F&F → §1.3.13
- Eligibility rules — gender, marital status, employment type, probation
- Mandatory attachments, e.g. medical certificate beyond a set number of days
- Minimum notice and maximum applications per period
- Compensatory off for holiday work, with expiry
- Leave encashment — on exit, at year end, on request; rate from salary components ÷ 26, 30 or days in month → §1.3.5
- Leave adjustment by HR with recorded reason
- Block dates
- Optional holidays — choose N of M
- Approvals and delegation, with team availability shown to the approver
- Employee cancellation and withdrawal of approved leave
- Holiday calendars per location, with per-employee override
- Statutory templates — maternity (26 weeks), state Shops & Establishments rules, state holiday lists
- Year-end wizard — preview, then carry forward, encash and lapse in one run
- Balance projection to a future date

**1.3.4 Time & Attendance**
- Clock-in / clock-out, shifts, rosters
- Check-in controls — geofence per location, IP / Wi-Fi restriction, selfie / face match, offline check-in with later sync
- Split shifts and multiple shifts per day; flexi-time and core hours; minimum rest between shifts
- Break rules — unpaid break deduction
- Timesheets — billed to clients via §1.2.3
- Regularisation — missed-punch correction with actual times; WFH and on-duty requests with monthly limits
- Late-coming penalties with monthly grace count
- Overtime with pre-approval, shift and night allowance, Factories Act limits and registers (Form 25)
- Auto comp-off from holiday attendance → §1.3.3
- Attendance lock once payroll runs
- Attendance device and biometric integration

**1.3.5 Payroll**
- Salary structures and revisions — CTC builder; mid-month revisions split by days; arrears
- Payroll run and payslips — pre-run validation dashboard, maker-checker approval, month-over-month variance report, payroll lock
- Off-cycle and supplementary payroll
- Bank payment files in bank-specific formats
- Tax declarations, investment proofs with HR verification, Form 12BB, previous-employer income (Form 12B), Form 16
- Statutory packs — PF, ESI, PT, LWF, TDS, gratuity, returns and challans; statutory bonus; minimum-wage checks by state and skill
- Statutory rates maintained centrally as dated data — updated without a software release
- Compliance calendar — due dates, reminders, penalty estimates
- Gratuity provisioning
- Loans and advances
- Full and final settlement → §1.3.13

**1.3.6 Benefits Administration**
- Insurance enrolment
- Flexible benefit declarations

**1.3.7 Expense, Travel & Reimbursement**
- Expense claims, approvals and policy limits
- Receipt capture with OCR; receipts mandatory above a set amount
- Duplicate and fraud checks
- GST details per bill for input credit
- Mileage claims and per-diem
- Advances with settlement, return and instalment recovery from salary
- Travel requests and bookings
- Corporate card reconciliation

#### Growth

**1.3.8 Performance Management**
- Goals and OKRs
- Review cycles and appraisals — staged workflow; manager rating distinct from peer feedback
- Continuous feedback — 360° with nominated reviewers
- Competency framework and skills assessment
- Calibration and 9-box
- Ratings linked to increments, bonus and promotion
- Performance improvement plans (PIP)

**1.3.9 Learning & Development**
- Training programmes and enrolment — nominations with approval
- Completions and certifications — with expiry and renewal
- Training needs from skill gaps and appraisals → §1.3.8
- Assessments delivered through §1.1

#### Service & support

**1.3.10 Asset Management**
- Asset register
- Assignment and return, linked to §1.3.2 and §1.3.13

**1.3.11 Employee Self-Service**
- Profile, payslips and documents — Form 16 and letters download
- Profile change requests (address, bank, contacts) with approval
- Requests and approvals

**1.3.12 Employee Helpdesk**
- Tickets raised by employees to HR and IT

#### Exit & governance

**1.3.13 Offboarding**
- Resignation and notice period — employee-initiated, early release, buy-out, withdrawal
- Exit clearance
- Full and final settlement — calculated: last salary, notice pay or recovery, leave encashment, gratuity, bonus, deductions, TDS
- Exit interviews and rehire eligibility
- Experience and relieving letters

**1.3.14 Alumni Portal**
- Post-exit self-service — payslips, Form 16, experience and relieving letters

**1.3.15 Compliance & Documents**
- Policy management and acknowledgement
- Statutory registers and document expiry tracking
- Grievance, POSH and disciplinary case management — POSH: Internal Committee, confidential (optionally anonymous) complaints, 90-day inquiry tracking, annual report

**1.3.16 Engage — Engagement, Recognition & Internal Communication**
- Company announcements with audience targeting and read / acknowledge tracking (simple version ships with the notification engine, wave 1)
- Social feed: posts with text, photos and links to company / location / department / team feeds; comments and reactions
- Polls, surveys, pulse and eNPS (anonymous option)
- Kudos and recognition: peer and manager appreciation tied to company values, badges, optional rewards with approval; recognition visible in performance reviews
- Celebrations posted automatically: birthdays, work anniversaries, promotions, new joiners (respecting privacy opt-outs)
- Moderation: report, hide, admin rules, profanity filter; audit
- Engagement analytics: active users, participation, recognition by value and team

#### Data dependencies

| Source | Feeds | Why |
|---|---|---|
| §1.3.3 Leave | §1.3.5 Payroll | Loss of pay, encashment |
| §1.3.4 Attendance | §1.3.5 Payroll | Days payable, overtime |
| §1.3.4 Timesheets | §1.2.3 External ATS | Client invoicing |

---

### 1.4 Analytics

Cross-product reporting. Serves Proctoring, ATS and HRMS alike.

#### Delivery

**1.4.1 Report Builder** — self-service reports across any module

**1.4.2 Dashboards** — role-based for executives, HR, recruiters, department heads and managers

**1.4.3 Scheduled Reports & Exports** — subscriptions, scheduled delivery, Excel and PDF export

#### Domains

| # | Domain | Measures |
|---|---|---|
| 1.4.4 | Assessment | Score distribution, percentile, question performance, integrity flags |
| 1.4.5 | Recruitment | Time to hire, cost per hire, source effectiveness, pipeline conversion, offer acceptance |
| 1.4.6 | Staffing & revenue | Placements, margin, bench utilisation, SLA performance, billing vs collection |
| 1.4.7 | Workforce | Headcount, attrition, retention, diversity, cost, span of control |
| 1.4.8 | Payroll & compliance | Cost trends, statutory liability, audit-ready registers |

---

## 2. Architecture

### 2.1 Platform Foundation

Shared services every product depends on.

#### Identity & access

**2.1.1 Tenant & Organisation Setup** — company profile, legal entities, locations, departments, designations, grades

**2.1.2 Authentication & Security** — email/password, Google, Microsoft Entra SSO, SAML, MFA, session management, IP restrictions, login history, encryption at rest and in transit

**2.1.3 RBAC & Data Visibility** — roles, permissions, record-level visibility rules

#### Configuration

**2.1.4 Workflow & Approval Engine** — generic configurable approval chains, built once and reused by every module

**2.1.5 Custom Fields & Form Builder** — tenant-defined fields on any entity

**2.1.6 Localisation** — multi-language, multi-currency, timezones, date formats, per-country statutory packs

#### Content & communication

**2.1.7 Notification Engine** — email, SMS, WhatsApp, in-app, with per-tenant templates

**2.1.8 Document Management & E-Signature** — storage, versioning, access control, e-signature for offers, policies and contracts

**2.1.9 Letter & Template Generator** — offer, relieving, experience, address proof, salary certificate

**2.1.10 Global Search**

#### Data & integration

**2.1.11 Import, Export & Data Migration** — how a tenant leaves their current system; a deal-closer in sales

**2.1.12 Open API & Webhooks**

**2.1.13 Integration Hub** — calendar and email (Google, Microsoft), Teams and Slack, accounting (Zoho Books, Tally, QuickBooks), biometric devices, background verification providers

**2.1.14 AI Layer** — per-tenant BYOL key management, model routing and caching, usage metering per tenant and feature

#### Governance

**2.1.15 Audit Log** — who changed what and when; required for enterprise security review

**2.1.16 Privacy & Data Governance** — GDPR and DPDP consent, retention policies, right to erasure, data residency

#### Commercial & access

**2.1.17 Billing & Subscription** — plans, seats, metered AI, invoices, dunning

**2.1.18 Mobile App / PWA** — attendance, leave, approvals, self-service

**2.1.19 Sandbox Environment** — tenants test payroll and configuration before running live

---

## 3. Infrastructure

_(later)_

## 4. Timeline

Everything in this spec is in scope for the market launch. Waves set **build order**, not scope. A private pilot with one or two friendly companies starts once wave 3 is ready; public release follows wave 6. Dates are set once Phase 3 designs are sized.

| Step | Build |
|---|---|
| 1 | Platform foundation (§2.1) — tenancy and organisation, RBAC and privacy, audit, workflow engine, notification engine, letters and documents, effective-dated history, statutory rules as data, period locks — and Core HR §1.3.1 |
| 2 | Leave §1.3.3 and Time & Attendance §1.3.4, with basic mobile self-service |
| 3 | Payroll and India statutory §1.3.5 — private pilot starts |
| 4 | Onboarding, offboarding and F&F §1.3.2, §1.3.13, letters, POSH §1.3.15 |
| 5 | Expenses §1.3.7, Performance §1.3.8, Learning §1.3.9, Helpdesk §1.3.12, disciplinary and policies §1.3.15, Engage §1.3.16 |
| 6 | Differentiators — native apps, selfie and offline check-in, 9-box and enforced distribution (guided calibration ships in wave 5, M06 Q5), corporate cards, alumni portal §1.3.14 — then public release |
| 7 | ATS §1.2 on the same platform |

## 5. Decisions

| # | Decision | Date |
|---|---|---|
| D1 | YukthiX is a clean-room rewrite. Frappe HR and India Payroll (GPL-3) are used only as a functional reference, never copied. Reference documents: `reference/frappe-hrms-functional-spec/` | 23 Sep 2026 |
| D2 | Stack: TypeScript monorepo — Next.js, NestJS, PostgreSQL with Prisma, BullMQ on Redis, PWA | 23 Sep 2026 |
| D3 | Multi-tenancy: shared database with a tenant key on every row and PostgreSQL row-level security; regional deployments for data residency | 23 Sep 2026 |
| D4 | Infrastructure stays portable — containers, PostgreSQL, Redis, S3-compatible storage, Terraform. Cloud chosen later on credits and cost | 23 Sep 2026 |
| D5 | Launch market: Indian SMBs first, then global SMBs | 23 Sep 2026 |
| D6 | Leave: 6 design decisions and 18 added features — see §1.3.3 and the Leave reference document | 23 Sep 2026 |
| D7 | Scope: everything in this spec ships at market launch; P0 / P1 / P2 are build order only; private pilot during the build | 24 Sep 2026 |
| D8 | POSH case management is part of the first build wave for compliance | 24 Sep 2026 |
| D9 | Build waves as in §4; ATS is built after HRMS wave 5 | 24 Sep 2026 |
| D10 | The existing exam platform (`D:\exam app`, "Workfox" — Next.js, NestJS, Prisma, BullMQ; 93 models on `origin/main`) already covers much of Proctoring §1.1, ATS §1.2 and Platform §2.1 — see `reference/exam-app-reuse-inventory.md`. It is **not yet live**: the only deployment is a test environment with no customer data, so no data migration is needed. It moves from **SQL Server to PostgreSQL before HRMS work starts** — one fresh baseline migration, row-level security rewritten as PostgreSQL policies, raw SQL reviewed, full test suite re-run. D2 and D3 stand. | 24 Sep 2026 |
| D11 | **One codebase:** HRMS is built inside the exam-platform monorepo as its own module area, reusing the shared platform (§2.1) — one login, one tenant account, one bill; products switched on per tenant through billing plans. Services split out only where scaling differs (as the exam runtime already is). | 24 Sep 2026 |
| D13 | **UI approach:** HR screens take Frappe HR's screen layouts and flows as the blueprint (clean-room — no code, logos, icons or copied text) and are built in React in YukthiX's own visual design system, the same one used by Proctoring and ATS. A UI reference per module documents Frappe's screens first. | 24 Sep 2026 |
| D14 | **Engage (§1.3.16)** is expanded into a full internal-communication and recognition module — social feed, polls and surveys, kudos and recognition, automatic celebrations, moderation — built in **wave 5**. Simple company announcements ship earlier with the notification engine (design P04). | 24 Sep 2026 |
| D15 | **Pricing model: one plan per product + paid add-ons.** HRMS (per employee), ATS (per recruiter / job) and Proctoring (per test taken) each have a single plan with the full product; Analytics is included in each; bundles of several products get a discount. No Basic / Pro / Enterprise tiers. **Add-ons are only:** (1) partner services with a per-use cost — payout API, PAN / bank verification, TDS and PF/ESI partner filing, BGV, Aadhaar eSign, GST e-invoicing, travel booking; (2) usage above fair-use — SMS overage, AI credit top-ups, extra storage, higher API limits / webhook endpoints, YukthiX-provided live proctors (per proctored hour, T04 Q8), licensed question packs (T01 Q7), **Priority Support** (P14 Q8). **Included in the plan:** white-label, embeddable widgets, developer sandbox, standard support (business hours + 24×7 for critical incidents), and the ATS staffing desk. **Amended 26 Sep 2026 (P14 Q8):** a paid **Priority Support** add-on (priority queue, faster targets, phone / WhatsApp, named contact). **Architecture:** API-first (design P11) — REST + GraphQL over one service layer. | 25 Sep 2026 |
| D16 | **UI foundations:** the exam app's `ui-v2` becomes one shared `packages/ui` for all four products (also the base of a future component SDK, P11 TR1); designs live as coded components in **Storybook**, Figma added when a designer joins or for a major redesign (visual rules: D28 design system); **Workfox → YukthiX rename at public launch** (pilot customers in wave 3 still see Workfox). | 25 Sep 2026 |
| D17 | **Configurable by default.** Where HR policy varies between companies, YukthiX provides every option and each company sets its own policy (with per-case override where it makes sense). YukthiX ships only a clearly labelled **starter template** the company edits; it never hard-codes a policy. **Exceptions:** rules fixed by law (statutory calculations, caps, exemptions, consent requirements) are enforced, and the company can only be more generous where the law allows (e.g. maternity top-up). Applies to all design docs. | 26 Sep 2026 |
| D18 | **Price: $1 per user per month, per product** (market-disruption strategy; target market price is $5–6 per user). HRMS $1 per billable employee, ATS $1 per recruiter seat, Proctoring $1 per test attempt started; Analytics included; bundle discount on top. Cost drivers are **add-ons** (storage, AI credits, SMS / WhatsApp, proctoring video storage, partner services, Priority Support). **Small minimum monthly amount per product** (team sets, e.g. equal to 10 users) so tiny invoices don't lose money. Principle: the base price covers infrastructure and running costs only (the founders build the product); every decision must keep the per-user running cost well below $1, and anything that doesn't fit becomes an add-on. INR price set by the team (≈ ₹85). **Clarified by the founder (26 Sep 2026):** every feature YukthiX builds is included in the one price — never Base / Gold / Platinum tiers. Customers pay extra **only** for things from outside the product: (1) **storage** beyond fair use, (2) **AI credits**, (3) **third-party services** (partner pass-through: payout, verification, filing, BGV, eSign, e-invoicing, travel, SMS / WhatsApp message costs, YukthiX proctors, licensed content), (4) **custom third-party connections** built for one customer, (5) **customisation work** for one customer (special reports, letter designs, custom features), (6) **Priority Support**; and (7) **taxes** (GST and others) are added on top of all prices. | 26 Sep 2026 **Amended 27 Sep 2026:** the $1 price is a **market-capture strategy, not a profit price**: the founder builds several products and uses $1 to win customers, proof and investor attention first. India price = $1 equivalent in INR (₹96 at Sep 2026, published, changed only with the 90-day notice in D20). Minimums: HRMS ₹499, ATS ₹999, Proctoring ₹999 in active months. Default payment by bank auto-debit / NEFT with a 2 % bank-rail discount, never a card surcharge. Unit economics: PRICING-UNIT-ECONOMICS.md. |
| D19 | **Every company rule is editable, using any field.** All company-variable behaviour in the product (policy values, eligibility, validation, approval routing, automations, layout conditions, company pay components) is a rule the company can change or add in the shared **P19 rule builder** (no-code builder + formula editor), using any built-in, custom (P18) or related field. Field API names are fixed; labels can change. **Three layers:** law is a floor (company chooses legal options and applicability per entity with reason, may be more generous, results below the floor are corrected automatically with a warning); company policy is fully editable from a starter template; platform safety (security, audit, tenant isolation, period locks, employees' own documents, consent, statutory calculations) is never editable. Changes are versioned, effective-dated, previewed for impact before activation, and high-risk ones need a second approver. | 26 Sep 2026 |
| D20 | **Customer commitments (market analysis, 26 Sep 2026):** billing from go-live; ≥90 days' price-change notice, annual terms fixed mid-term; ≥6 months' feature-removal notice; renewal reminders 30/7 days; published price list incl. tiny per-product minimum; no planned maintenance in payroll-critical windows; employees keep own documents through exit; offline check-in in wave 2. (P14 YX-BILL-12–14, YX-TEN-07, YX-CONSOLE-07; M02 YX-AT-23/24; M04 YX-MOB-18; M03 YX-PAY-05; P15 YX-MIG-14.) | 26 Sep 2026 |
| D21 | **Brand (brand/BRAND-GUIDELINES.md v1.0, 27 Sep 2026):** promise **"Everything. Included."**; products named YukthiX HR / Hire / Assess / Analytics; personality straightforward, confident, warm, precise; brand colour Azure `#3B5FE3`; custom wordmark + X monogram by a professional designer; real Indian workplace photography and flat geometric illustration; tenant brand on employee and candidate surfaces with "Powered by YukthiX" on by default (white-label removes it; consent and Secure Client screens stay YukthiX-branded); name story *yukti* + X, pronounced YOOK-thee-eks. | 27 Sep 2026 |
| D22 | **Law-status corrections (validation pass 3, 28 Sep 2026):** the four Labour Codes are in force from 21 Nov 2025 (dated rule sets, transition by period, wage-definition add-back, floor wage, 2-working-day exit wages, fixed-term gratuity, retrenchment and re-skilling fund, GRC, 40+ health check, women night-shift guard); the Income-tax Act 2025 applies from 1 Apr 2026 (Form 130/131/138/140/144/121, old forms for periods to 31 Mar 2026, section cross-walk by the compliance owner); DPDP Rules 2025 milestones (consent managers Nov 2026, main duties 13 May 2027, 72-hour Board report, logs ≥ 1 year); EU AI Act employment duties from 2 Dec 2027 covering hiring and employee-side AI. | 28 Sep 2026 |
| D23 | **Validation pass 3 Musts (28 Sep 2026):** statutory accident & injury module; PF/ESI supplementary filings after filing; revised Form 130/131; migration imports current-year as-paid lines; one `persons` record per tenant with roles (DSAR, conversions, total workforce, billing once per person per month); identity chain + partner deepfake detection (flags only); own product analytics on the metric layer (no HR data); P20 growth, trial, help centre and incident messaging; export invoices zero-rated under LUT; synthetic probes; trial = 30 days + one 14-day extension, 30 days read-only, then deletion with certificate. | 28 Sep 2026 |
| D24 | **Validation pass 3 Shoulds (28 Sep 2026):** all included. Wave 3: coverage monitor, PT/LWF state change, ELI, disability field, actuarial export, GST per entity, e-invoice guard, **weekly/fortnightly pay and piece rate (moved from wave 6)**. Wave 4: industrial-relations pack, notice of change, agency CLRA duties, onboarding buddy. Wave 5: incentives/commissions, tips, on-call, BRSR and Board's-report packs, **one skills library (replaces the separate lists of T01 Q2)**, **AI agents that act only with human confirmation**, hybrid office policy, AI course authoring, appraisal-cycle rules, internal-hiring additions. Wave 6: BFSI pack, re-verification, licence gating, IT bench; growth features before public launch (referral = one month credit for both companies). Wave 7: staffing-desk additions. **Pay transparency for every company** (mandatory where law requires, starter ON elsewhere). US AI-hiring laws before the first US AI-interview customer. **New P21 Global readiness**: each global item built before the first customer in its region; accessibility evidence (WCAG 2.2 AA, VPAT) before public launch. | 28 Sep 2026 |
| D25 | **Starter defaults confirmed (28 Sep 2026):** referral credit expires after 12 months (reversed on refund); test result reuse 6 months; appraisal joining cut-off 3 months; permit reminders 90/60/30/7 days; salary split up to 3 accounts; mobile budgets (under 30 MB, cold start under 3 s, crash-free ≥ 99.5 %); injury pay starter full pay for non-ESI staff; talk-to-us threshold 200 employees / 3 entities / 10 recruiters / 2,000 attempts; staff trial extensions ≤ 30 days; probes every 5 minutes. List: design/research/validation-pass-3/SHOULD-DECISIONS.md. Legal "verify" figures stay with the compliance owner. | 28 Sep 2026 |
| D26 | **Workflow Studio and AI assistant (P22, 28 Sep 2026):** full multi-step no-code workflow builder in wave 2 (triggers incl. schedules, inbound email and signed webhooks; branches, waits, loops, approval steps, bulk actions; template gallery; test run, impact preview, versions, undo, limits, kill switch; P19 automations become one-step workflows). Sandboxed JavaScript/TypeScript **script step** in wave 6 (isolated, approved connections only, service identity never broader than the publisher, reviewed and versioned; amends P18's no-custom-code exclusion; component SDK stays TR1). **AI assistant** in wave 5: builds workflows from plain language (never auto-publishes) and runs multi-step jobs after **one plan approval**; money, filings, approvals, rejections, dismissals and pay changes always need a separate confirmation. Included; heavy use beyond fair use and AI credits are add-ons. | 28 Sep 2026 |
| D27 | **Employee & manager assistants and partner marketplaces (P23, 28 Sep 2026; founder selected 9 features; an earlier customer-acquisition P23 was removed the same day at the founder's request):** payslip explainer (rule-based wave 3, AI chat wave 5), AI policy & handbook writer (drafts only, law-floor checked, wave 5), timesheet auto-fill from calendar / Jira / GitHub metadata (never auto-submit, wave 5), AI manager coach (wave 5), review assistant with bias check (advisory, off for EU tenants), employee tax-regime comparison and salary structure optimiser (wave 3), group insurance for small companies only via an IRDAI-licensed partner (wave 5), employee perks marketplace (company switches on; off by default; wave 5). | 28 Sep 2026 |
| D28 | **Design system v1.0 (brand/DESIGN-SYSTEM.md, 28 Sep 2026):** quiet, precise, human-designed look with a banned list of AI-template patterns; IBM Plex Sans / Mono / Devanagari with Noto Tamil and Telugu (**replaces Bricolage Grotesque + Hanken Grotesk**); one Azure accent with Slate neutrals, fixed status and AI-purple meanings, 8-colour chart palette and dark mode; 4-px spacing scale, 12-column grid, radius 4/6/8/12, three shadows; functional motion plus five milestone delights; Lucide now, custom YukthiX icons later; two-tier sidebar, object pages with list / page / drawer views, person 360 page; full-featured data tables, org chart, dashboards, approvals inbox, Ctrl+K command palette, AI assistant panel with confirm-before-change, visual builders, careers page builder; WCAG 2.2 AA; tenant colour on employee and candidate surfaces only; three-layer tokens, Storybook with visual regression, design QA checklist before any screen ships. Component inventory in the same file. | 28 Sep 2026 |
| D12 | Product name is **YukthiX**. The exam platform's "Workfox" branding is renamed to YukthiX later. | 24 Sep 2026 |
