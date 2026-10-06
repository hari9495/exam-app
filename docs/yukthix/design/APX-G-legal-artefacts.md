# Appendix G · Legal & trust artefacts

> **Status:** 📋 Catalogue defined, 26 Sep 2026. Closes GAP-REGISTER **H6**. Feeds A2 (security programme, future P12) and B12 (DPDP / GDPR programme extras). **Extended 26 Sep 2026 (gap register, user decision):** eight artefacts for the new B / C features (G-24–G-31: EWA partner terms, field-force location consent, desktop-agent monitoring notice, visitor privacy notice, talent-CRM marketing consent, candidate-app terms, keystroke-biometrics consent, AI-allowed test disclosure) and two G-09 variants (staffing vendor contact, contract-labour vendor contact); footer owners in [APX-D §4](APX-D-screens-navigation.md). **Extended again 26 Sep 2026:** G-32 (contract-worker privacy notice, M13) and G-33 (Secure Client device-monitoring notice, T08). **P16 follow-up 26 Sep 2026:** G-34 (partner programme agreement) and G-35 (partner directory listing terms). **Corrected 28 Sep 2026 (validation pass 3, C3 / C4):** DPDP Rules 2025 dates, itemised per-purpose notices and the 72-hour Board breach report in G-03 / G-05 / G-06 / G-07 / G-23; new G-36 (EU AI Act deployer notice to workers and representatives) and G-37 (AI literacy guidance for tenant users). **Validation pass 3 Must follow-up, 28 Sep 2026:** identity chain and deepfake partner check in G-07 / G-08 / G-11, deepfake partner in G-04, deepfake add-on and export-under-LUT note in G-02, product analytics and opt-out in G-05, free-trial terms in G-01 (P14 YX-TEN-08). **P22 follow-up 28 Sep 2026:** customer-built workflow and script clause in G-01; inbound-email note in G-04 (§1.2). **P23 follow-up 28 Sep 2026:** G-43–G-47 (not-legal-advice and estimate-not-tax-advice disclaimers, insurance distribution disclosure, perks partner terms and redemption consent, work-tool connector privacy notice; §1.3); P23 partners in G-04; coach and review assistant in G-11.
> **Linked from:** [P02 §6](P02-access-visibility-privacy.md) (privacy) and P02 rule **YX-SEC-28** (versioned acceptance and re-acceptance).
> **What this is NOT:** legal text. This appendix defines, for each artefact, its purpose, audience, where the product shows it, the headings a lawyer must cover, the design decisions it must reflect, and how versions and acceptances are tracked. **Every artefact below: ⚖️ Requires legal drafting & review.** Nothing here is a draft clause, and no wording from this file may be published as-is.

---

## 0. Conventions

- **Surfaces** (where an artefact is linked or shown):
  - **Sign-up**: tenant sign-up / order acceptance (P01).
  - **Portal footer**: the footer on every signed-in and public portal (UI brief T9).
  - **Careers site**: public career pages (M10 YX-ATS-02).
  - **Candidate portal**: magic-link portal for candidates and test-takers (M10, T03).
  - **App first run**: web / PWA / store-app first sign-in (M04 §6 first run).
  - **Developer portal**: public API site and sandbox sign-up (P11 Q6).
  - **Public site**: yukthix marketing / trust site (Workfox until rename, D16).
- **Acceptance**: `click` = an explicit accept action recorded; `click + OTP` = accept with OTP evidence (P05 §4.4); `ack` = acknowledgement that a notice was shown (not consent); `consent` = purpose-specific consent with withdrawal; `none` = published and linked only.
- **Versioned**: every artefact marked "yes" is a row in `legal_documents` (§3) with version, locale and effective date.
- **Priority**: **before pilot** (wave 3 pilot, P11) · **before public launch** (YukthiX rename, D16) · **later** (before the named feature ships).
- **Brand at pilot:** pilot tenants still see **Workfox** (D16). Every artefact issued at pilot is re-issued under the YukthiX name at public launch; counsel decides whether the rename is a material change (§3.3).
- **Owner** = the accountable business owner; external counsel drafts. "Tenant" means the customer company publishes it from a YukthiX starter template (spec D17: starter templates the company edits, legal minimums enforced).

---

## 1. Catalogue

| ID | Artefact | Audience | Where surfaced | Acceptance | Versioned | Owner | Related docs | Priority |
|---|---|---|---|---|---|---|---|---|
| G-01 | Terms of service / subscription agreement | Tenant (signatory, System Admin) | Sign-up, public site, portal footer | click (tenant, by authorised signatory) | yes | Founder / commercial lead | spec D15, P02 YX-SEC-21, P11 Q8, P01, P14 YX-TEN-08 (trial) | Before pilot |
| G-02 | Order form | Tenant signatory | Sign-up; add-on purchase screens | click (per order) | yes (template) + per-order record | Commercial lead | spec D15, T04 Q8, P04 Q3, P10, T04 YX-PROC-20, P14 YX-BILL-16 | Before pilot |
| G-03 | Data processing agreement (DPA) | Tenant (controller) | Sign-up (incorporated into G-01), public site, Settings › Privacy | click (with G-01) | yes | DPO | P02 §6, YX-SEC-19/20/23, A2, B12 | Before pilot |
| G-04 | Sub-processor list page + change-notice process | Tenants, prospects | Public site, Settings › Privacy, DPA annex | none (notice; 30-day objection window) | yes | DPO | P02 §6 / Q7, P04 §4.4, P10, T04 Q8, P10 YX-INT-11 | Before pilot |
| G-05 | Tenant-facing privacy policy (YukthiX as processor and as controller) | Tenant admins, visitors, developer sign-ups | Public site, portal footer, sign-up, developer portal | ack | yes | DPO | P02 §6, P11, B12, P09 §4.10 / YX-MET-19 | Before pilot |
| G-06 | Employee privacy-notice template | Tenant's employees (tenant publishes) | App first run, Me › My data, portal footer (tenant version) | ack (re-ack on material change) | yes (YukthiX template + tenant version) | DPO (template); tenant (published notice) | P02 §6, M04 §6, P10 Q3 | Before pilot |
| G-07 | Candidate privacy notice | Candidates, test-takers (tenant publishes from template) | Careers site, candidate portal, Easy Apply, test invite | ack | yes (template + tenant version) | DPO (template); tenant | M10 Q4–Q6, YX-ATS-19/32, T05 Q7/Q8, T04 YX-PROC-19/20 | Before pilot |
| G-08 | Biometric consent texts (jurisdiction-aware) | Candidates / test-takers; employees using face check-in | Candidate portal pre-test consent step; app (face check-in enrolment) | consent (per purpose, withdrawable) | yes (per jurisdiction × locale) | DPO | T05 Q8, YX-EVAL-09/10/13/30, P10 Q3 / YX-AI-06, M10 Q4 / YX-ATS-32, T04 YX-PROC-19/20 | Before pilot (proctoring live today) |
| G-09 | External-login notices (six templates) | Pre-boarding candidate, alumni / nominee, external trainer, POSH IC external member, audit-committee chair, client contact | OTP sign-in screen of each external login; portal footer | ack (confidentiality undertaking: click) | yes (per template) | DPO | P02 §4.7, YX-SEC-21, M01, P05 Q6, M07 Q6, M08 Q4/Q8, M10 Q8 | Per login: pre-boarding + alumni before pilot; others before their wave |
| G-10 | Anonymous reporter notice | Anonymous grievance / whistleblower reporter | Report form and the no-login status page | none (shown only; no identity recorded) | yes | DPO + ethics lead | M08 YX-CASE-11, YX-CASE-06, Q8 | Later (wave 5) |
| G-11 | AI-use disclosure | Candidates, employees, tenant admins | AI interview invite and start; test instructions (probe questions); AI feature toggles in Settings; public site | ack (candidate: part of consent flow, M10 Q4) | yes | Product lead (AI) + DPO | M10 Q4 / YX-ATS-05/32, T04 Q7 / YX-PROC-03/20, P10 Q2 / YX-AI-02, T05 Q8 | Before pilot for T04 signals; AI interview before wave 7 |
| G-12 | Proctoring "what we record" notice | Test-takers | Candidate portal readiness / consent step (per test mode) | ack inside consent (YX-PROC-06) | yes (per mode × locale) | Proctoring product lead + DPO | T04 YX-PROC-06 / Q5, T03, T05 Q7 | Before pilot |
| G-13 | Public retention-schedule page | Candidates, public (BIPA), tenants | Public site; linked from G-07, G-08, candidate privacy centre | none | yes (generated) | DPO | T05 Q7/Q8, `retention_policies`, M10 Q6, B12 | Before public launch; before any US-located candidate is processed |
| G-14 | Cookie notice (public pages) | Visitors | Careers site, letter / certificate verify page, candidate portal, developer portal, public site | consent for non-essential only | yes | DPO + web lead | M10 YX-ATS-02, P05 Q5, T03, P11 Q6 | Before pilot |
| G-15 | Customer SLA document | Tenants | Public site, order form annex, Settings › Billing | via G-01 / G-02 | yes | Head of operations | spec D15, future P13 / P14, P11 status page | Before public launch (pilot uses order-form pilot terms) |
| G-16 | Acceptable-use policy (AUP) | Tenants, their users, API developers | Sign-up (via G-01), developer portal, Engage first post, portal footer | via G-01; developer: click at key creation | yes | Founder / trust & safety | M09 YX-ENG-03, P11 YX-API-08 / Q8, T04, P10 Q3 | Before pilot |
| G-17 | Accessibility statement (per product) | All users | Public site, portal footer, candidate portal | none | yes (per product) | Design lead | T03 Q8 / YX-DLV-11, D16 `packages/ui` | Before public launch (after audit) |
| G-18 | Security / trust page | Prospects, tenants, security reviewers | Public site, portal footer | none | yes | Security lead | A2 / future P12, P02 YX-SEC-19/20/23, P11 YX-API-09 | Before public launch |
| G-19 | E-sign disclosure & consent to electronic records | Employees, candidates, company signatories | First e-sign / click-to-accept (offer, appointment, critical policy); P05 signing screen | click + OTP (once, then per document evidence in P05) | yes | DPO + HR-legal counsel | P05 §4.4 / Q2, M08 Q6 / YX-POL-02, M10 offers | Before pilot |
| G-20 | WhatsApp & SMS opt-in consent text | Employees, candidates, external logins | App first run (step 4 notifications), candidate portal, preferences screen | consent (per channel, per recipient; opt-out anytime) | yes (per channel × locale) | Messaging product lead + DPO | P04 §4.4 / Q2 / Q3, YX-NTF-04/06, APX-A §5, M04 §6 | Before pilot |
| G-21 | Open-source attribution page | All users; licence compliance | Portal footer ("Open-source notices"), store-app About screen, developer portal | none | yes (generated per release) | Engineering lead | P05 Q1 (LibreOffice, docxtemplater), T04 Q2 (Safe Exam Browser), M07 (SCORM), YX-DOC-14 (fonts), D16 | Before pilot (store apps ship wave 3) |
| G-22 | Responsible disclosure policy / `security.txt` | Security researchers | Public site `/.well-known/security.txt`, trust page | none | yes | Security lead | A2 / future P12 | Before pilot |
| G-23 | Grievance officer / DPO contact page | Data principals (employees, candidates), tenants | Public site, portal footer, every privacy notice (G-05–G-10) | none | yes | DPO | B12, P02 §6, T05 privacy centre | Before pilot |
| G-24 | Earned wage access (EWA) partner terms disclosure | Employees using EWA | EWA request sheet (PAY-26), first use and each fee change | click (per partner terms version) | yes (per partner × locale) | Commercial lead + DPO | M03 §6 item 10 (B10), P14 YX-BILL-11, P10 B3 | Before EWA ships (wave 5) |
| G-25 | Location-tracking consent (field force) | Field employees in groups where the company switches tracking on | Mobile first run of field mode, tracking settings (TIM-33), Me › Privacy | consent (withdrawable; tracking duty-hours only) | yes (per locale) | DPO | M02 §B8 (B2), M04, P02 | Before field force ships (wave 5) |
| G-26 | Desktop-agent & Teams-presence monitoring notice | Employees in groups using presence-based attendance | Agent installer and first launch, Teams-presence opt-in screen, Me › Privacy | consent (per source; withdrawable) + notice | yes (per locale) | DPO + HR-legal counsel | M02 §B10 (C1), P10 | Before presence attendance ships (wave 6) |
| G-27 | Visitor privacy notice | Visitors to the tenant's locations | Visitor invite page (T9-14), visitor kiosk (VIS-03), printed at reception | ack (tenant publishes from template) | yes (template + tenant version) | DPO (template); tenant | M02 §B11 (C1) | Before visitor management ships (wave 6) |
| G-28 | Talent-CRM marketing / nurture consent | Candidates and prospects in talent pools | Careers site, Easy Apply, sourcing-extension capture follow-up, campaign footer, preference / unsubscribe page | consent (per channel; opt-out anytime) | yes (template + tenant version) | DPO + messaging product lead | M10 §11 B8, P04 G-20 rules, APX-A | Before talent CRM ships (wave 7) |
| G-29 | Candidate-app terms of use | Candidates using the native candidate app (and the candidate portal) | App store listing, app first run, candidate portal footer | click (app first run) | yes | Commercial lead + DPO | T03 §11 B7, G-07, G-12 | Before the candidate app ships (Proctoring track) |
| G-30 | Keystroke-biometrics consent | Test-takers of tests with keystroke-dynamics signal on | Pre-test consent step (per test), candidate privacy centre | consent (separate from G-08; withdrawable; never for under-18s) | yes (per jurisdiction × locale) | DPO | T04 §11 C5 (YX-PROC-15), T05 retention, G-08 variants | Before the signal ships (Proctoring track) |
| G-31 | AI-allowed test disclosure | Test-takers of AI-allowed tests; evaluators; hiring teams | Test instructions and start screen, score report header | ack (inside test consent) | yes (per locale) | Proctoring product lead + DPO | T04 §11 C5, G-11, T05 | Before AI-allowed mode ships (Proctoring track) |
| G-32 | Contract-worker privacy notice (with the contractor-login notice) | Contract workers deployed at the tenant's establishments; contractor representatives | Gate-pass issue and kiosk / biometric enrolment (M13 §6 flow 3), notice displayed at the site gate, Contractor portal (T9 external shell) | ack (recorded by site HR or the contractor for workers without a login; biometric / face enrolment also needs G-08) | yes (template + tenant version; per locale incl. state language) | DPO (template); tenant | M13 YX-CLRA-03 / 04 / 11, P02 §4.7 / §6.1, G-08, G-09 (contract-labour vendor variant) | Before contract labour ships (wave 5) |
| G-33 | Secure Client device-monitoring notice | Test-takers of tests that require or allow the YukthiX Secure Client or browser extension | Client download / install page, client self-test screen, kiosk status bar ("what is monitored"), candidate privacy centre | ack inside the test consent; separate consent for LAN second-device hints when the test turns them on | yes (per tier × locale) | Proctoring product lead + DPO | T08 YX-SCL-02 / 05 / 06, T04, T05 consent & retention, G-12, G-29 | Before the Secure Client ships (Proctoring track phase 2) |
| G-34 | Partner programme agreement | Partner firms (CA / accountant firms, payroll bureaus, resellers / referral and implementation partners), by an authorised signatory | Partner sign-up (P16 §6 flow 1), partner portal Profile and footer, YukthiX console verification | click (firm, by authorised signatory) | yes | Commercial lead + DPO | P16 YX-PTR-01…14, Q2–Q4; G-01, G-03; P14 YX-BILL-09 | Before partners ship (wave 3, with the payroll pilot) |
| G-35 | Partner directory listing terms | Verified partners that list in the directory; clients browsing it (ordering disclosure) | Partner portal › Profile › Directory listing; client-side directory (Settings › Partners) | click (partner admin, before the first listing); none for clients | yes | Commercial lead + trust & safety | P16 YX-PTR-14, Q4; G-34 | Before the directory ships (wave 3) |
| G-36 | EU AI Act deployer notice to workers and representatives | Tenant's workers' representatives and affected workers in the EU (tenant gives it, as deployer) | Settings › AI enable step for a high-risk employment feature (the tenant records it was given); Me › My data (AI in use); portal footer (tenant version) | ack (tenant admin records notice given, date and audience; workers: none) | yes (template + tenant version; per locale) | AI product lead + DPO (template); tenant | P10 §A4 / YX-AI-11 / 12, Art. 26(7); T05 YX-EVAL-29; G-06, G-11 | Before any EU tenant enables a high-risk employment feature (obligations from 2 Dec 2027) |
| G-37 | AI literacy guidance for tenant users | Tenant admins enabling AI features; managers, HR and recruiters using AI outputs | Settings › AI (before enabling any AI feature), first use of an AI feature, help centre | ack (per user, per version) | yes (per locale) | AI product lead | P10 §A4 / YX-AI-12, Art. 4; G-11 | Before any EU tenant uses an AI feature (duty applies since 2 Feb 2025); all tenants by public launch |

### 1.1 Validation pass 3 Shoulds (28 Sep 2026)

Artefacts for the Should items of validation pass 3 (P21 global, M08 whistleblower, T05 bias audit, M06 evidence export); briefs in §2 (G-38–G-42).

| ID | Artefact | Audience | Where surfaced | Acceptance | Versioned | Owner | Related docs | Priority |
|---|---|---|---|---|---|---|---|---|
| G-38 | Cross-region transfer annex (DPA annex for data held in or moved between hosting regions) | Tenant (controller) | Sign-up (with G-03) when an entity's data region is outside the tenant's home region; Settings › Privacy; region-move request (APX-D PLT-46) | click (with G-03, or per region move) | yes (per region pair × locale) | DPO | P21 YX-GLB-01…16, P01 YX-ORG-28…30, P02 YX-SEC-37/38, P13, G-03, G-04 | Before the first non-India region goes live |
| G-39 | Region-move notice (to the tenant and, via the tenant, to its employees) | Tenant admins; tenant's employees (tenant publishes) | Region-move request and schedule (APX-D PLT-46), email / in-app to tenant admins, Me › My data (tenant version) | ack (tenant admin); employees: none (notice) | yes (template + tenant version) | DPO + head of operations | P21, P02 YX-SEC-37/38, P13, G-38 | Before the first region move |
| G-40 | EU whistleblower procedure (internal reporting channel procedure, Directive (EU) 2019/1937) | Tenant's workers and other reporters in the EU (tenant publishes) | Report form and status page (with G-10), Me › Policies, portal footer (tenant version) | none (published; reporter sees it before submitting) | yes (template + tenant version; per member state × locale) | DPO + ethics lead (template); tenant | M08 YX-CASE-17, `EU.WHISTLEBLOWER` pack (P07), G-10, APX-C RPT-CASE-05 | Before any EU tenant uses the whistleblower channel |
| G-41 | NYC Local Law 144 bias-audit summary publication | Candidates and employees for NYC roles; public | Careers site (tenant page) and job posts for NYC roles; audit record (APX-D HIR-23) | none (published; candidate notice at least 10 business days before use, **verify**) | yes (per audit; tenant version) | Compliance owner (tenant); AI product lead + DPO (template) | T05 YX-EVAL-31/32, M10, APX-C RPT-ATS-11, APX-E #193, G-11 | Before any NYC tenant uses an automated employment decision tool |
| G-42 | Electronic-records certificate format (Bharatiya Sakshya Adhiniyam s.63) — **verify with counsel** | Tenant signatories producing exported records as evidence; courts / tribunals (recipients) | Evidence export (APX-D PRF-15, M08 case export); template APX-F #133 | none (certificate signed by the tenant's authorised person) | yes (format version) | HR-legal counsel + DPO | M06 YX-PERF-20…22, M08, P08 audit, APX-F #133 / #134 | Before evidence export ships (wave 5) |

### 1.2 P22 Workflow Studio & AI assistant (28 Sep 2026)

No new artefact for [P22](P22-workflow-studio-ai-assistant.md). **G-01** gains clause 20 (customer-built workflows and scripts; AI-built workflows are drafts until a customer admin publishes them). **G-04** notes that inbound email for workflows uses the existing email provider (no new sub-processor unless a new vendor is added).

### 1.3 P23 Employee & manager assistants and marketplaces (28 Sep 2026)

Artefacts for [P23](P23-employee-manager-assistants-marketplaces.md) (YX-AST-01…19). Short briefs below the table; each still needs counsel's drafting (§2 note).

| ID | Artefact | Audience | Where surfaced | Acceptance | Versioned | Owner | Related docs | Priority |
|---|---|---|---|---|---|---|---|---|
| G-43 | "Not legal advice" disclaimer (AI policy & handbook writer) | Tenant HR admins and approvers | Draft editor banner and approval dialog (APX-D HLP-14); starter drafts (APX-F #137) | none (shown; approver confirms review before Approve & load) | yes | HR-legal counsel + AI product lead | P23 YX-AST-06 / 07, P07, P19, M08 | Before the policy writer ships (wave 5) |
| G-44 | "Estimate, not tax advice" disclaimer (tax planner and salary optimiser) | Employees (tax planner); HR / Payroll (salary split) | Compare tax regimes panel (APX-D PAY-41), Suggest split (PAY-42) | none (shown with every estimate) | yes (per law version) | Tax counsel + payroll product lead | P23 YX-AST-05 / 12 / 13, P07 `IN.TDS` | Before wave 3 tax planner |
| G-45 | Insurance distribution disclosure — **verify with counsel (IRDAI)** | Tenant owners / HR admins; employees covered | Benefits › Group health (APX-D PAY-43), quote comparison (APX-F #142), partner purchase hand-off | ack (tenant admin, before the first quote request) | yes (per partner) | Commercial lead + counsel (insurance regulation) | P23 YX-AST-14 / 15, M11, P14 YX-BILL-11, G-04 | Before group insurance ships (wave 5) |
| G-46 | Perks partner terms and redemption consent notice | Employees redeeming offers; tenant admins enabling perks | Employee app › Perks consent sheet (APX-D ENG-12, APX-F #143); Settings › Benefits & FBP › Perks | consent per redemption (fields ticked; YX-SEC-28); admin ack on switch-on | yes (per partner × locale) | DPO + commercial lead | P23 YX-AST-16 / 19, P02 YX-SEC-28, G-04 | Before perks ship (wave 5) |
| G-47 | Work-tool connector privacy notice (Google / Microsoft Calendar, Jira, GitHub; metadata only) | Employees connecting their tools | Connect screen (APX-D TIM-43), OAuth consent step, Me › My data | ack at connect (per provider) | yes | DPO | P23 YX-AST-08 / 09, P10 B3, G-06 | Before timesheet auto-fill ships (wave 5) |

- **G-43 required contents:** drafts are starting points, not legal advice; law-floor checks cover only the P07 rule sets named; counsel review recommended before publishing; the company approves and owns the published policy (YX-AST-06).
- **G-44 required contents:** figures are estimates for the stated law version and projected salary; not tax advice; the employee chooses the regime (YukthiX never does); what-if inputs are private to the employee (YX-AST-12).
- **G-45 required contents:** the partner's name, IRDAI registration / licence number and category (broker or corporate agent) and expiry; **YukthiX is neither the insurer nor an insurance intermediary** and gives no advice or recommendation; quotes shown with the same fields and no ranking; premium paid to the partner / insurer, not YukthiX; **commission or fee YukthiX receives, disclosed only as IRDAI rules permit (verify)**; census fields shared, health declarations kept on the partner's screen; complaints route (partner, insurer, IRDAI Bima Bharosa / Insurance Ombudsman — verify).
- **G-46 required contents:** "Partner offer" meaning; partner identity and its own terms; YukthiX may earn a commission; which fields go to the partner (only those the employee ticks) and why; withdrawal and the partner's own privacy notice; no offers on payroll, payslip, tax or statutory screens (YX-AST-16).
- **G-47 required contents:** read-only scopes per provider; what is read (titles, times, durations, issue keys, repository names) and never read (code, diffs, message or comment bodies); raw activity and unaccepted suggestions visible only to the employee; revoke any time, tokens deleted on revoke or exit (YX-AST-08 / 09).

**Count:** 47 artefacts, G-01–G-47 (23 + G-24–G-33 added 26 Sep 2026 + G-34–G-35 P16 follow-up + G-36–G-37 validation pass 3 C4, 28 Sep 2026 + G-38–G-42 validation pass 3 Shoulds, 28 Sep 2026, §1.1 + G-43–G-47 P23, 28 Sep 2026, §1.3; trial terms added inside G-01, no new artefact, Validation pass 3 Must follow-up, 28 Sep 2026; G-09 has eight variants incl. staffing vendor and contract-labour vendor contacts; G-08 and G-30 have one variant per jurisdiction; G-33 one variant per client tier; P22 customer-logic clause inside G-01 and inbound-email note in G-04, no new artefact, 28 Sep 2026, §1.2; P23 partner entries in G-04 and assistant entries in G-11, 28 Sep 2026, §1.3).

---

## 2. Artefacts

> Each subsection lists **required contents** as headings the lawyer must cover. Wording, legal positions and numbers are for counsel unless a design doc has already fixed them (then the doc is cited and the artefact must match it).
> ⚖️ **Every subsection: Requires legal drafting & review.**

### G-01 · Terms of service / subscription agreement
⚖️ Requires legal drafting & review.
- **Purpose:** the contract between YukthiX and the tenant for all four products.
- **Audience / surface:** tenant signatory at sign-up; public site; portal footer. **Acceptance:** click by an authorised signatory on behalf of the tenant; stored in `legal_acceptances` with the tenant as party.
- **Required contents:**
  1. Parties, definitions (tenant, user, external login, add-on, fair use, tenant data).
  2. Products and plans: **one plan per product** (HRMS per employee, ATS per recruiter / job, Proctoring per test taken), Analytics included, bundle discount, **no tiers** (spec D15).
  3. Add-ons: partner services with per-use cost and usage above fair use, as enumerated in spec D15; what is **included** (white-label, embeddables, developer sandbox, support, ATS staffing desk).
  4. Billable units and exclusions: **external / limited logins are not billed seats** (P02 YX-SEC-21); how employees, recruiters, tests taken are counted.
  5. Fair use: API calls, webhook endpoints, SMS quota, AI credits, storage; what happens above fair use (metered add-on, not suspension; P11 Q8, P04 Q3, YX-API-08).
  6. Tenant responsibilities: lawful basis for its own data; publishing G-06 / G-07; configuring policies (spec D17: YukthiX ships starter templates only, the tenant owns its policy choices); statutory filings remain the tenant's legal duty.
  7. YukthiX responsibilities: service, security (reference G-18 / future P12), support, data region (YX-SEC-19), support access only with per-session tenant approval (YX-SEC-20), YukthiX proctors only through the proctor-service grant (YX-SEC-23).
  8. Acceptable use: incorporates G-16.
  9. Data protection: incorporates G-03.
  10. Service levels: incorporates G-15.
  11. Fees, invoicing, taxes (GST), payment terms, price changes.
  12. **Suspension**: grounds, notice, what keeps working during suspension (counsel to consider employee self-service and payslip access), reinstatement.
  13. **Term, termination and exit**: **data return** (export formats: the P11 API and bulk exports), export window, deletion after the window, deletion certificate, legal-hold and statutory-retention carve-outs (P02 §6 retention, T05 legal hold).
  14. Third-party services: WhatsApp billed by Meta to the tenant's own account (P04 Q2); partner add-ons (BGV, eSign, payout, filing) subject to partner terms.
  15. AI features: outputs are advisory, human decides (M10 YX-ATS-05, YX-PROC-03); cross-reference G-11.
  16. Warranties / disclaimers (statutory calculations as data, P07; the tenant verifies filings), liability caps, indemnities (incl. IP and data breach), confidentiality, IP ownership (tenant data vs platform), feedback.
  17. Changes to terms: notice period, material-change re-acceptance (§3.3, YX-SEC-28).
  18. Governing law, dispute resolution, notices, assignment, entity name (Workfox → YukthiX, D16).
  19. **Free trial** (Validation pass 3 Must follow-up, 28 Sep 2026; P14 YX-TEN-08, P20 YX-GRO-06): 30 days plus **one 14-day extension**; trial limits (no live bank file, statutory filing, partner add-on or bulk WhatsApp / SMS); if no product is switched on, **30 days read-only** (view and full export only) with reminders, then **deletion with a deletion certificate** (YX-TEN-04; APX-F #115); switching on before deletion keeps all data; no card or mandate is charged for a trial.
  20. **Customer-built workflows and scripts** (P22, 28 Sep 2026; YX-WFS-13 / 14 / 16): the customer is responsible for the workflows and scripts it publishes and for their results; YukthiX provides the sandbox, limits, audit and undo tooling and is not liable for customer logic; workflows and scripts drafted by the AI assistant are **drafts until a customer admin publishes them**.
- **Must reflect:** spec D15, D17; P02 YX-SEC-19/20/21/23; P11 Q8; P04 Q2/Q3; T05 Q7; P14 YX-TEN-08; P22 YX-WFS-13 / 14 / 16.
- **Owner:** founder / commercial lead.

### G-02 · Order form
⚖️ Requires legal drafting & review.
- **Purpose:** the per-customer commercial record under G-01.
- **Surface:** sign-up checkout; add-on purchase screens; countersigned PDF for sales-led deals (generated through P05).
- **Required contents:** customer legal entity and billing entities (P01); products subscribed (one plan each, D15); unit counts and price per unit; bundle discount; add-ons selected with unit prices (partner services; overage: SMS, AI credits, storage, API limits; **YukthiX live proctors per proctored hour**, T04 Q8; licensed question packs, T01 Q7); fair-use limits applicable; data region (YX-SEC-19); term and renewal; pilot terms (for wave-3 pilots); **proctoring add-on opt-in** that authorises the proctor-service grant (YX-SEC-23); **deepfake / voice-clone check add-on** (partner, pass-through cost per checked interview beyond fair use; T04 YX-PROC-20, D18); for customers outside India, a note that invoices are **export of services under YukthiX's GST LUT** (zero-rated, no IGST; currency and exchange-rate basis; P14 YX-BILL-16 / 17, APX-F #112); order of precedence with G-01.
- **Must reflect:** spec D15; YX-SEC-19, YX-SEC-23; P04 Q3 (SMS billing options); T04 YX-PROC-20; P14 YX-BILL-16 / 17 (Validation pass 3 Must follow-up, 28 Sep 2026).
- **Versioning:** template versioned in `legal_documents`; each executed order stored as an acceptance with the order snapshot hash.
- **Owner:** commercial lead.

### G-03 · Data processing agreement
⚖️ Requires legal drafting & review.
- **Purpose:** processor terms for tenant personal data (DPDP "data processor"; GDPR Art. 28).
- **Surface:** incorporated at sign-up; downloadable from Settings › Privacy and the public site.
- **Required contents:**
  1. Roles: **tenant = controller / data fiduciary; YukthiX = processor**; where YukthiX is itself controller (G-05 part B) is out of scope of the DPA.
  2. Subject matter, nature, purpose, duration; categories of data subjects (employees, candidates, test-takers, external logins, anonymous reporters) and data categories by **P02 sensitivity class** (Public → Special).
  3. Processing only on documented instructions (tenant configuration counts as instructions).
  4. Confidentiality of personnel; YukthiX staff access only via YX-SEC-20 sessions; YukthiX proctors only via YX-SEC-23.
  5. Security measures annex (links G-18; controls from future P12 / A2: encryption, key management, access control, audit P08).
  6. **Sub-processors**: general authorisation, the G-04 list, **30-day advance notice** of changes, objection right and remedy.
  7. Data location: region fixed at sign-up, India default (YX-SEC-19); cross-border transfers only to listed sub-processors with minimised data; transfer mechanisms for EU data (SCCs or equivalent).
  8. AI processing: Special data never sent to external AI; face / voice in-region (P02 §6, P10 Q2 / YX-AI-02, M10 R1).
  9. **Breach notification**: YukthiX → tenant timeline (counsel sets; must let the tenant meet the **DPDP Rules 2025** intimation to the Data Protection Board and affected Data Principals **without delay** and the **detailed report to the Board within 72 hours**, and **GDPR Art. 33** 72-hour notice; P02 YX-SEC-32), content of the notice, cooperation; security annex states log retention of **at least 1 year** (P12 YX-SECOPS-07).
  10. Assistance with data-principal rights (access, correction, erasure, grievance), DPIAs and regulator enquiries; DSAR tooling reference (B12).
  11. **Audit rights**: reports / certifications first (SOC 2 / ISO roadmap, A2), on-site audit conditions, frequency, cost.
  12. **Return and deletion** at end: export window, deletion incl. backups, certificate; statutory retention and legal hold exceptions.
  13. Liability link to G-01; order of precedence.
- **Must reflect:** P02 §6, YX-SEC-10/19/20/23/32; P10 Q2; T05 Q7/Q8; A2; B12; DPDP Rules 2025 (main duties from 13 May 2027, P02 §6.2).
- **Owner:** DPO.

### G-04 · Sub-processor list page + change-notice process
⚖️ Requires legal drafting & review.
- **Purpose:** public, versioned list of sub-processors and the process for adding one.
- **Surface:** public site; Settings › Privacy (with "notify me" subscription for tenant admins); DPA annex.
- **Required contents (per entry):** name, legal entity, service provided, data categories and sensitivity classes, **processing location / region**, which products and add-ons use it (e.g. WhatsApp only when the tenant connects its own number, P04 Q2), transfer mechanism.
- **Known categories to inventory:** hosting / storage per region, email, SMS (DLT sender, P04), WhatsApp (Meta), push (FCM / APNs), AI model providers (P10), OCR (in-region), eSign provider, BGV partner (M10 Q5), **deepfake / voice-clone detection partner** (interview clips or frames only, in-region / India residency preferred, nothing retained after the result; T04 YX-PROC-20, P10 YX-INT-11; Validation pass 3 Must follow-up, 28 Sep 2026), payout / penny-drop / PAN verification, GST e-invoicing, filing partners, travel booking, error monitoring / support tooling, payment gateway.
- **Workflow inbound email (P22 YX-WFS-11, 28 Sep 2026):** inbound email for workflows uses the existing email provider already on the list; no new sub-processor unless a new vendor is added (then the change process below applies).
- **P23 partners (28 Sep 2026):** the **group insurance broker / corporate agent** (IRDAI-licensed; census fields only; YX-AST-14 / 15; disclosure G-45) and each **perks partner** (only the fields an employee consents to at redemption; YX-AST-16; G-46) are listed as independent partners / recipients with their role, data shared and location; **Jira and GitHub** connectors read metadata through the customer's own accounts (no new sub-processor; G-47); P23 AI helpers use the AI model providers already listed (P10).
- **Change process:** **30 days' notice** to tenant admins (email + in-app banner) before a new sub-processor processes their data; objection window and remedy (per G-03); emergency replacement rule; each list change creates a new `legal_documents` version with a change summary.
- **Must reflect:** P02 §6 Processors row and Q7; YX-SEC-19; P10; P04.
- **Owner:** DPO.

### G-05 · Tenant-facing privacy policy
⚖️ Requires legal drafting & review.
- **Purpose:** how YukthiX handles personal data, in two parts.
- **Surface:** public site, portal footer, sign-up, developer portal sign-up. **Acceptance:** ack.
- **Required contents:**
  - **Part A, YukthiX as processor:** short statement that tenant data is processed for the tenant under G-03; data subjects should go to their employer / hiring company; how YukthiX forwards requests it receives.
  - **Part B, YukthiX as controller** of its own data: tenant admin and billing contacts, sales leads, public-site visitors, developer-portal and sandbox users, support tickets, platform telemetry, usage metering (billing), security logs, **product analytics** (pseudonymous usage events: feature, screen, product, role; never HR data; raw events deleted after 13 months; P09 §4.10, YX-MET-19/20) and the **tenant opt-out** of non-essential analytics in Settings › Billing & Account (Validation pass 3 Must follow-up, 28 Sep 2026); purposes and lawful basis; retention; sharing; transfers; rights; cookies (G-14); children; contact (G-23).
  - Region and transfer summary (YX-SEC-19); AI summary (G-11).
- **Must reflect:** P02 §6; P11 Q6 (sandbox); B12; Part B itemised per purpose in plain language in the DPDP Rules 2025 schedule format (P02 YX-SEC-35), in force before 13 May 2027.
- **Owner:** DPO.

### G-06 · Employee privacy-notice template
⚖️ Requires legal drafting & review.
- **Purpose:** the notice each tenant gives its employees (the tenant is the data fiduciary). The template **already exists as a design requirement** in P02 §6 ("Notice & purpose"); this artefact defines what the template must cover.
- **Surface:** shown at onboarding / first login (M04 §6 first run, before step 4), under Me › My data, portal footer. **Acceptance:** ack; re-ack on material change (YX-SEC-28).
- **Tenant editing (spec D17):** tenant edits a labelled starter template; mandatory sections cannot be removed; published per locale.
- **Required contents:** **itemised per purpose in plain language** in the DPDP Rules 2025 schedule format: for each purpose, the data items, the purpose, how to withdraw consent, how to exercise rights and how to complain to the Data Protection Board (P02 YX-SEC-35; the template is ready before the main duties start on **13 May 2027**, P02 §6.2); controller identity (tenant legal entity, P01); purposes tagged per data category (P02 §6); categories incl. sensitivity classes; **optional data by consent** (selfie / face check-in P10 Q3, health, diversity attributes) with withdrawal; monitoring disclosures (geofence / GPS check-in and background location for field staff, M04 Q1; device binding; biometric devices, P10 Q4); AI features in use (G-11); recipients (payroll partners, statutory bodies, YukthiX as processor, sub-processors G-04); retention per category and legal hold (P02 §6), erasure when the purpose is served (48-hour prior intimation where the Rules' retention schedule applies; verify applicability to employers); for EU tenants, high-risk AI in use and the G-36 deployer notice; rights (access, correction, erasure, nomination, grievance) and the "My data" page; restricted-area cases (POSH, grievance) handling; data region; tenant grievance officer contact.
- **Must reflect:** P02 §6, §6.2, §4.4, YX-SEC-34/35; P10 Q3 / YX-AI-06, §A4; M04; M09 (anonymous survey guarantees, YX-ENG-04).
- **Owner:** DPO (template); tenant (published notice).

### G-07 · Candidate privacy notice
⚖️ Requires legal drafting & review.
- **Purpose:** notice to job applicants and test-takers of the hiring tenant.
- **Surface:** careers site, Easy Apply, candidate portal, test invite email link. **Acceptance:** ack; purpose consents recorded separately (M10 "consent per purpose").
- **Tenant editing:** starter template per D17; staffing tenants add client-sharing wording (M10 Q8).
- **Required contents:** controller (hiring tenant; for staffing, sharing with client contacts); purposes (application, assessment, proctoring, AI interview, BGV); **identity chain** (with consent, face template and ID check captured once and matched again at test, AI and live interview and day-1 onboarding; mismatch is a review flag, never an auto-reject; explain / re-verify / appeal; T04 YX-PROC-19, M10 YX-ATS-32, T05 YX-EVAL-30) and, where the company has the add-on, the **partner deepfake / voice-clone check** on interview video / audio (T04 YX-PROC-20; Validation pass 3 Must follow-up, 28 Sep 2026); **retention: default 12 months after last activity, tenant sets 6–36, then anonymise; renewal email** (M10 Q6); proctoring data retention **90 days default, 30–365** (T05 Q7), with link to G-13; BGV only after explicit consent (YX-ATS-08); AI use and human review (G-11); **minors**: DOB gate, verifiable guardian consent, no AI interview or profiling (YX-ATS-19, YX-EVAL-13); rights, candidate privacy centre (T05 §7), erasure (YX-EVAL-10); transfers; contact (G-23 and tenant contact).
- **Must reflect:** M10 Q4–Q6, YX-ATS-08/09/19/32; T04 YX-PROC-19/20; T05 YX-EVAL-30; T05 Q7/Q8; T04 YX-PROC-06; P02 YX-SEC-35 (itemised per-purpose notice, DPDP Rules 2025 schedule format, before 13 May 2027).
- **Owner:** DPO (template); tenant.

### G-08 · Biometric consent texts (jurisdiction-aware)
⚖️ Requires legal drafting & review.
- **Purpose:** explicit, purpose-specific consent before any face, voice or ID-image capture.
- **Surface:** candidate portal pre-test consent step (T04 flow step 2); application verification (M10 YX-ATS-32); AI and live interview start; day-1 onboarding identity check (M01 YX-LC-31); employee face check-in enrolment (P10 Q3). **Acceptance:** consent, recorded in T05 `consent_records` (text version = `legal_documents` id), withdrawable.
- **Variants (selected by candidate location, T05 Q8):**
  - **India (DPDP):** notice + consent, purpose, withdrawal, grievance route; guardian consent for under-18 (DPDP s.9, YX-EVAL-13).
  - **EU / EEA (GDPR Art. 9):** explicit consent for special-category data, lawful basis, rights, transfer statement.
  - **US Illinois (BIPA):** **written release**, specific purpose and length of term, link to the **public retention schedule** (G-13), no sale / profit statement.
  - **Default:** other regions get the strictest applicable text (T05 Q8).
- **Required contents (each variant):** what is captured (face image, face template, voice, ID image); purpose (identity check, face match, check-in); **identity-chain capture and reuse across hiring** (Validation pass 3 Must follow-up, 28 Sep 2026): captured once at the first of application verification, test ID check or pre-boarding, attached to the person record and re-matched at test, AI / live interview and day-1 onboarding (T04 YX-PROC-19); where face detection is off or consent is refused, ID check with interviewer / HR attestation; **deepfake / voice-clone partner check** on interview video / audio only, minimal clip, partner keeps nothing, separate opt-in shown when the company has the add-on (T04 YX-PROC-20); results are review flags only (T05 YX-EVAL-30); who processes (in-region, in-house, never external AI; P10 Q2); retention (T05 Q7) and deletion; **fallback if declined** (manual ID check / unproctored alternative, or clear statement the test can't proceed; YX-EVAL-09, YX-EVAL-11); withdrawal and erasure (YX-EVAL-10); fairness report link (T05 Q8).
- **Must reflect:** T05 Q8, YX-EVAL-09/10/11/13/30; T04 YX-PROC-19/20; M10 YX-ATS-32; M01 YX-LC-31; P10 YX-AI-06; D17 (consent is a legal requirement, not switchable).
- **Owner:** DPO.

### G-09 · External-login notices (six templates)
⚖️ Requires legal drafting & review.
- **Purpose:** short notice for each P02 §4.7 external login explaining what they can see, why, for how long, and how their own data is handled.
- **Surface:** the OTP sign-in screen of each login (first sign-in), and portal footer. **Acceptance:** ack; the IC external member, audit-committee chair and client contact also **click a confidentiality undertaking** (recorded in `legal_acceptances`).
- **Common required contents:** who the controller is (the tenant); what the login grants (named records only, YX-SEC-21); OTP identity; **automatic expiry** and when; all sign-ins and views audited (P08); the person's own data held (name, contact, OTP logs) and its retention; contact.
- **Per-template additions:**

  | Variant | Additional contents | Source |
  |---|---|---|
  | Pre-boarding candidate | Checklist and documents collected before joining; e-sign (G-19); access ends at joining (becomes employee notice G-06) or withdrawal | M01, P05 |
  | Alumni / nominee | Access to own letters, payslips, tax documents for the retention period (7 years, P05 Q6); nominee access to claim letters after death in service (GAP E) | P05 Q6, M01 |
  | External trainer | Sees attendee names, attendance, results and feedback summary for own sessions only; confidentiality of attendee data | M07 Q6 |
  | POSH IC external member | Restricted-area access to appointed cases only (YX-SEC-10); statutory confidentiality of POSH proceedings; conflict-of-interest declaration | M08 Q4 |
  | Audit-committee chair | Whistleblower outcomes routed to the committee; reporter-protection and anti-retaliation duties (YX-CASE-08) | M08 Q8 |
  | Client contact | Candidates / submissions shared with the client; permitted use of candidate data; no onward sharing | M10 Q8 |
- **Owner:** DPO.

### G-10 · Anonymous reporter notice
⚖️ Requires legal drafting & review.
- **Purpose:** tells an anonymous grievance / whistleblower reporter what anonymity means in YukthiX.
- **Surface:** anonymous report form; no-login status page. **Acceptance:** none. **No acceptance record is stored**, because YX-CASE-11 forbids storing identity, IP or device against the case.
- **Required contents:** what is and isn't recorded (no identity, IP or device); the **case access code** is shown once, can't be recovered, rate-limited; optional contact for content-free alerts is encrypted and visible to nobody (YX-CASE-06/11); how the case is routed (ethics officer, audit committee; HR not a member unless added); anti-retaliation protection (YX-CASE-08); limits of anonymity (content of the report itself may identify the reporter).
- **Must reflect:** M08 YX-CASE-06/08/11, Q8.
- **Owner:** DPO + ethics lead.

### G-11 · AI-use disclosure
⚖️ Requires legal drafting & review.
- **Purpose:** plain disclosure of where AI is used, what it decides (nothing on its own) and what data it sees.
- **Surface:** AI interview invite and start screen (M10 Q4); test instructions when follow-up probes may appear (T04 Q7); Settings when an admin enables an AI feature; public site AI page.
- **Required contents:**
  - **AI interview (M10 Q4):** asynchronous; rubric scoring with evidence quotes; **advisory only, human reviews every result, never auto-reject** (YX-ATS-05); only the text transcript goes to an external LLM, video / voice / face stay in-region (P10, M10 R1); not offered to minors (YX-ATS-19).
  - **Proctoring AI signals (T04 Q7):** response-time anomaly, LLM-likeness scoring of descriptive answers, optional follow-up probe questions (candidate told probes may appear); **flags for human review only** (YX-PROC-02/03).
  - **Platform AI features (P10):** data tiers (never Special; Confidential masked by default; performance text only with tenant opt-in; YX-AI-02); BYO-key option; metering in AI credits.
  - **Interview identity and deepfake checks** (Validation pass 3 Must follow-up, 28 Sep 2026): AI and live interviews re-match the candidate to the identity-chain record and, where the company has the add-on, a partner checks the interview video / audio for synthetic video or voice clones; both produce **flags for human review only**, never a reject or stage move; the candidate can explain or re-verify (T04 YX-PROC-19/20, M10 YX-ATS-32, T05 YX-EVAL-30).
  - **Employee and manager assistants (P23, 28 Sep 2026):** payslip explainer chat (own payslip only; causes only from payroll records), policy writer (drafts, HR approves; G-43), timesheet auto-fill (suggestions, employee submits; G-47), **manager coach** (nudges from data the manager already sees; never Special data or leave reasons; manager opt-out) and **review assistant** (draft help and bias flags as suggestions; the manager's text and rating are final; off for EU tenants until conformity, P10 §A4); all advisory (YX-AST-01 / 10 / 11).
  - How to request human review / contest an outcome (T05 appeals); fairness report (T05 Q8).
  - **EU (C4):** which features are high-risk under the EU AI Act (P10 §A4 classification) and, for workers, a link to the tenant's G-36 deployer notice; AI literacy guidance for tenant users is G-37.
- **Must reflect:** M10 Q4, YX-ATS-05/19/32; T04 Q7, YX-PROC-02/03/19/20; P10 Q2, YX-AI-02; T05 Q8, YX-EVAL-30.
- **Owner:** AI product lead + DPO.

### G-12 · Proctoring "what we record" notice
⚖️ Requires legal drafting & review.
- **Purpose:** tell the candidate exactly what is recorded before consenting (YX-PROC-06).
- **Surface:** candidate portal readiness / consent step, generated per test from its proctoring mode. **Acceptance:** ack inside the consent step.
- **Required contents:** proctoring mode (Open, AI-only, Record & review, Live; T04); streams recorded: camera / screen / audio / companion phone (T04 Q5, `recordings`); ID check and face match (T04 Q3); room scan; secure browser requirement (Safe Exam Browser, T04 Q2); who may view (tenant reviewers; YukthiX proctors only under YX-SEC-23); retention (T05 Q7) and link to G-13; that signals are review flags, not automatic fails (YX-PROC-02); accommodations route (T03 Q8); appeal route (T05).
- **Must reflect:** T04 YX-PROC-02/06, Q2/Q3/Q5; T05 Q7; T03 Q8; P02 YX-SEC-23.
- **Owner:** proctoring product lead + DPO.

### G-13 · Public retention-schedule page
⚖️ Requires legal drafting & review (framing text; the figures are generated).
- **Purpose:** publicly available retention and destruction schedule for biometric identifiers (BIPA) and, for transparency, other candidate data classes.
- **Surface:** public site; linked from G-07, G-08, G-12 and the candidate privacy centre.
- **Generation:** built from platform defaults and ranges in `retention_policies` (T05) and M10 `candidate_retention`: recordings / clips / face data / ID images default **90 days, 30–365**; candidates **12 months, 6–36**. A tenant-specific view shows that tenant's configured values (linked from its candidate notice). Regenerated on any change; each regeneration is a new `legal_documents` version.
- **Required contents:** data class, default and allowed range, trigger (last activity, attempt end), destruction method, legal-hold override, guideline for permanent destruction (BIPA: when the purpose is satisfied or the statutory maximum, whichever first).
- **Must reflect:** T05 Q7/Q8, YX-EVAL-08; M10 Q6; B12 master retention schedule.
- **Owner:** DPO.

### G-14 · Cookie notice (public pages)
⚖️ Requires legal drafting & review.
- **Purpose:** disclose cookies and similar technologies on unauthenticated pages.
- **Surface:** careers site, letter / certificate **verify page** (P05 Q5), candidate portal, developer portal, public site.
- **Privacy-preserving defaults:** strictly necessary cookies only by default; **no analytics or marketing cookies until the visitor opts in**; reject as easy as accept; no third-party trackers on the verify page and candidate portal; choice remembered and changeable from the footer.
- **Required contents:** categories (necessary, preferences, analytics, marketing), each cookie's name, provider, purpose, duration; how to change choice; tenant-branded careers pages: who is controller for tenant-added scripts.
- **Owner:** DPO + web lead.

### G-15 · Customer SLA document
⚖️ Requires legal drafting & review.
- **Purpose:** service commitments referenced by G-01.
- **Surface:** public site, order form annex, Settings › Billing.
- **Required contents:** uptime commitment and measurement (status page, P11 Q6), exclusions (maintenance windows, partner outages: Meta, DLT, eSign, BGV), support hours and channels, severity levels and response / resolution targets, **service credits** and how to claim, incident communication, RPO / RTO statement, data export on request.
- **Numbers:** **not set here**; they come from future **P13 / P14** (operations and commercial). Until then pilots run on order-form pilot terms (G-02).
- **Owner:** head of operations.

### G-16 · Acceptable-use policy
⚖️ Requires legal drafting & review.
- **Purpose:** what tenants, their users and API developers may not do.
- **Surface:** incorporated by G-01; developer portal (click at API key / OAuth app creation); Engage first post (link); portal footer.
- **Required contents:**
  - **Engage content** (M09): prohibited content categories, moderation and reporting (YX-ENG-03), tenant as first-line moderator.
  - **API fair use** (P11): rate limits (YX-API-08), no scraping or load testing without consent, key security, no circumventing limits or field-class redaction (YX-SEC-22).
  - **Lawful use of proctoring and biometrics:** tenant must have a lawful basis, must not use proctoring or face check-in covertly, must offer the fallback (YX-EVAL-11), must not use AI signals as automatic decisions (YX-PROC-03).
  - Messaging: WhatsApp / SMS only for permitted notification types and with opt-in (G-20).
  - Security: no probing outside G-22; no uploading malware (P05 virus scan).
  - Enforcement: warning, suspension (link to G-01 suspension).
- **Owner:** founder / trust & safety.

### G-17 · Accessibility statement (per product)
⚖️ Requires legal drafting & review.
- **Purpose:** state the accessibility standard met, known gaps and how to get help.
- **Surface:** public site, portal footer, candidate portal. One statement each for HRMS, ATS, Proctoring (candidate test UI) and mobile app.
- **Required contents:** target standard **WCAG 2.1 AA** (T03 YX-DLV-11); **independent audit** date, scope and auditor (T03 Q8: before public launch); known non-conformities and plan; accommodations process for test-takers (T03 Q8); feedback / contact route and response time; date of last review.
- **Owner:** design lead.

### G-18 · Security / trust page
⚖️ Requires legal drafting & review.
- **Purpose:** single public page for security reviewers and procurement.
- **Surface:** public site; portal footer; linked from G-03 security annex.
- **Required contents:** hosting and data regions (YX-SEC-19); tenant isolation (RLS, P01); access model (P02: restricted areas, support access YX-SEC-20, proctor grants YX-SEC-23); encryption and key management, secure SDLC, pen testing, incident response (**future P12 / A2**); **certifications roadmap** (SOC 2 / ISO 27001, A2) with status; webhook signing (YX-API-09); links to G-04, G-22, status page; downloadable security questionnaire / reports on request (NDA).
- **Owner:** security lead.

### G-19 · E-sign disclosure & consent to electronic records
⚖️ Requires legal drafting & review.
- **Purpose:** consent to transact and sign electronically and to receive records electronically (Information Technology Act, 2000), and disclosure of how evidence is captured.
- **Surface:** before the first click-to-accept or e-sign (offer, appointment, critical-policy acknowledgement); P05 signing screen. **Acceptance:** click + OTP once; each later signature carries its own P05 evidence.
- **Required contents:** which methods are used and their legal effect: **click-to-accept with OTP** (evidence: time, IP, device, OTP channel, document hash; P05 §4.4), **Aadhaar eSign** via licensed provider, company **DSC**; the **completion certificate** page (P05); right to a copy / download from the vault; how to withdraw consent to electronic records and the paper alternative; documents excluded from e-sign by law; hardware / software requirements.
- **Must reflect:** P05 §4.4 / Q2; M08 Q6, YX-POL-02; M10 offers.
- **Owner:** DPO + HR-legal counsel.

### G-20 · WhatsApp & SMS opt-in consent text
⚖️ Requires legal drafting & review.
- **Purpose:** per-recipient, per-channel opt-in record required by Meta (WhatsApp Business policy) and TRAI / DLT (commercial communications). Fills the gap that P04 has opt-out only (H6).
- **Surface:** app first run (M04 §6 step 4, "Allow notifications"); candidate portal; notification preferences screen; external-login first sign-in. **Acceptance:** consent per channel, stored in `legal_acceptances` (§3); opt-out stays in P04 preferences and is honoured immediately.
- **Required contents:** channel, sender (the tenant's own WhatsApp Business number, P04 Q2; YukthiX's DLT sender or the tenant's own for SMS), message types (transactional / service vs any promotional; OTPs as a separate class, YX-NTF-13), **no Confidential / Special content in messages** (YX-NTF-04), quiet hours (YX-NTF-06), how to stop (reply keyword / preferences), charges (none to the recipient by YukthiX).
- **Must reflect:** P04 §4.4 / Q2 / Q3, YX-NTF-04/06/13; **APX-A §5** (channel matrix and opt-in capture; apply when APX-A is published); M04 §6.
- **Counsel to confirm:** whether OTP / authentication messages need prior opt-in.
- **Owner:** messaging product lead + DPO.

### G-21 · Open-source attribution page
⚖️ Requires legal drafting & review (licence obligations review).
- **Purpose:** meet notice obligations of open-source components and fonts.
- **Surface:** portal footer "Open-source notices", store-app About screen (M04 Q1), developer portal (SDK licences).
- **Generation:** produced per release from the SBOM (A2 secure SDLC); each release creates a new `legal_documents` version.
- **Required contents / components to cover:** **LibreOffice** (MPL-2.0, separate process in the worker; P05 Q1); **Safe Exam Browser** (MPL-2.0, run as a separate app; T04 Q2); **SCORM / xAPI runtime** used by M07 (licence to confirm); **docxtemplater** core (**licence to verify before adoption**, P05 Q1); **fonts** embedded in letters and UI (Indic fonts for Hindi / Tamil / Telugu, YX-DOC-14; typically OFL); Capacitor (store apps), UI and server dependencies from `packages/ui` and the monorepo (D16); SDK dependencies (P11 Q6). For each: name, version, licence, copyright notice, source-offer where the licence requires it.
- **Owner:** engineering lead.

### G-22 · Responsible disclosure policy / `security.txt`
⚖️ Requires legal drafting & review.
- **Purpose:** safe channel for security researchers.
- **Surface:** `/.well-known/security.txt` on every public domain (incl. tenant-branded careers domains where YukthiX serves them); trust page (G-18).
- **Required contents:** contact, encryption key, policy URL, expiry (security.txt fields); scope (in / out, e.g. sandbox yes, other tenants' data never); rules of engagement (no data exfiltration, no social engineering, no DoS); safe-harbour statement; response timelines; recognition / bounty (if any).
- **Owner:** security lead.

### G-23 · Grievance officer / DPO contact page
⚖️ Requires legal drafting & review.
- **Purpose:** DPDP-required contact for grievances and data-principal requests (B12: DPO / grievance officer).
- **Surface:** public site; portal footer; referenced from G-05 to G-10.
- **Required contents:** YukthiX grievance officer / DPO name or designation and contact; what YukthiX handles (its controller data) vs what goes to the employer / hiring company (processor data) and how YukthiX forwards; response timeline (counsel sets, per the DPDP Rules 2025 held as rule data, P02 YX-SEC-30 / 34); escalation to the Data Protection Board; EU representative (if needed for GDPR).
- **Owner:** DPO.

### G-24 · Earned wage access (EWA) partner terms disclosure
⚖️ Requires legal drafting & review (with the EWA partner's counsel; RBI digital-lending guidance to be assessed).
- **Purpose:** tell the employee, before each first use and on any fee change, that the advance is provided by a named regulated partner, what it costs and how it is recovered.
- **Surface:** PAY-26 request sheet; mobile Pay tab. **Acceptance:** click per partner-terms version, recorded in `legal_acceptances`; each draw keeps the version accepted.
- **Required contents:** partner identity and regulatory status; YukthiX's role (technology and payroll recovery only; YukthiX does not lend, hold funds or decide eligibility beyond the company's policy); amount available (earned-to-date formula from the company policy), fee or charge and who bears it (company or employee, D17 setting), total cost shown as a number before confirming; recovery from the next salary and on exit from F&F, respecting the Payment of Wages deduction cap (M03, P07); what happens if salary is insufficient; data shared with the partner (minimum: identity, earned amount, bank account) and its basis; cancellation / cooling-off; grievance route (partner + G-23); no effect on employment decisions.
- **Must reflect:** M03 §6 item 10 and its B10 decision; P14 YX-BILL-11; P02 field classes (bank and pay data are Confidential).
- **Owner:** commercial lead + DPO.

### G-25 · Location-tracking consent (field force)
⚖️ Requires legal drafting & review.
- **Purpose:** consent for a location trail of field employees **during duty hours only**.
- **Surface:** field-mode first run on mobile, tracking status banner, Me › Privacy (withdraw). **Acceptance:** consent, recorded per employee; withdrawal stops the trail and switches the employee to check-in-only mode (the company can't block withdrawal; it can apply its attendance rules to the check-in-only mode).
- **Tenant editing:** starter per D17; the company fills purposes and retention within the legal minimums.
- **Required contents:** what is collected (location points, time, distance, visit check-ins, device status), when (duty hours only, never off-duty or on leave; visible tracking indicator); purposes (visit verification, conveyance, safety); who sees it (manager and HR in scope, P02); retention (company-set, starter in M02 §B8); no sale / no marketing use; withdrawal and its consequences; rights and grievance route.
- **Must reflect:** M02 §B8 and its B2 decision; P02 scopes; M04 mobile permissions.
- **Owner:** DPO.

### G-26 · Desktop-agent & Teams-presence monitoring notice
⚖️ Requires legal drafting & review.
- **Purpose:** notice and consent before any activity / presence signal is read for attendance.
- **Surface:** desktop agent installer and first launch; Teams-presence opt-in screen; Me › Privacy. **Acceptance:** consent per source (agent, Teams), withdrawable; the notice is re-shown when the company changes the idle threshold or sources.
- **Required contents:** exactly which signals are read (active / idle, lock / unlock, agent start / stop, Teams presence states) and what is **never** read (no screenshots, keystrokes, application or website names, message content, camera or microphone); how signals become an attendance day; idle threshold (company-set); who sees the result (day status only for managers; raw signals only for HR on a dispute); retention; how to uninstall / withdraw and the fallback check-in; employer's legitimate-use statement per jurisdiction.
- **Must reflect:** M02 §B10 and its C1 decision; D17 (company option per group, starter off).
- **Owner:** DPO + HR-legal counsel.

### G-27 · Visitor privacy notice
⚖️ Requires legal drafting & review.
- **Purpose:** notice to visitors whose details, photo and ID are captured at the tenant's locations.
- **Surface:** visitor invite page (T9-14), kiosk (VIS-03), reception printout. **Acceptance:** ack; any photo / ID capture is described in the notice; optional NDA is a separate tenant document.
- **Tenant editing:** starter per D17; the tenant is the controller.
- **Required contents:** controller (tenant) and contact; data captured (name, phone, company, host, purpose, photo, ID type and last digits, entry / exit times); purposes (security, safety, evacuation roll-call); ID images not stored unless the company's policy requires it and then masked; retention (company-set, starter in M02 §B11) and deletion; sharing (host, security); rights and grievance route; CCTV reference if the location uses it (tenant text).
- **Must reflect:** M02 §B11 and its C1 decision; P02 field classes.
- **Owner:** DPO (template); tenant.

### G-28 · Talent-CRM marketing / nurture consent
⚖️ Requires legal drafting & review (DPDP, TRAI-DLT, Meta WhatsApp policy; GDPR / CAN-SPAM for non-India candidates).
- **Purpose:** consent to receive job alerts and nurture campaigns, separate from the application's processing.
- **Surface:** careers site and Easy Apply (unticked box), follow-up to sourcing-extension captures (no messages until consent), campaign footer, preference / unsubscribe page. **Acceptance:** consent per channel (email / WhatsApp / SMS), recorded in `legal_acceptances`; opt-out one click, honoured immediately; campaigns stop on reply.
- **Required contents:** who sends (hiring tenant; staffing tenant and its clients where relevant), what messages (job alerts, events, company news), channels and frequency cap, how profile data is used for matching, retention of pool records (aligned with G-07 retention), how to opt out and to erase; sourced profiles: source and how the candidate was found.
- **Must reflect:** M10 §11 B8; P04 YX-NTF-14 and G-20 channel rules; APX-A campaign templates.
- **Owner:** DPO + messaging product lead.

### G-29 · Candidate-app terms of use
⚖️ Requires legal drafting & review.
- **Purpose:** terms for the native candidate app (and the candidate portal footer "Terms of use").
- **Surface:** app store listing, app first run, candidate portal footer (APX-D §4). **Acceptance:** click on app first run.
- **Required contents:** who provides the app (YukthiX) vs who runs the test (hiring tenant); permitted use; device permissions (camera, microphone, screen, notifications) and why; proctoring conduct rules (link G-12); prohibited conduct (impersonation, sharing content, tampering); test content confidentiality; availability and technical failures (reset policy, T03); account and data (link G-07, G-08, G-30); app updates; liability limits; governing law; contact.
- **Must reflect:** T03 §11 B7; T04 / T05 integrity rules; G-07 / G-12.
- **Owner:** commercial lead + DPO.

### G-30 · Keystroke-biometrics consent
⚖️ Requires legal drafting & review (biometric data under DPDP, GDPR Art. 9, BIPA).
- **Purpose:** separate, explicit consent before typing-rhythm data is used as an impersonation signal.
- **Surface:** pre-test consent step for tests with the signal on; candidate privacy centre. **Acceptance:** consent recorded in T05 `consent_records` (text version = `legal_documents` id); declining gives a test **without** the signal (no penalty); **never offered to under-18s**.
- **Variants:** per jurisdiction as G-08 (India, EU / EEA, Illinois BIPA written release, default strictest).
- **Required contents:** what is captured (key timing patterns, not the text typed beyond the answer itself), purpose (flag possible impersonation for human review only; never an automatic verdict), processing in-region, retention (T05) and deletion, fallback if declined, withdrawal and erasure, fairness statement.
- **Must reflect:** T04 §11 C5 (YX-PROC-15); T05 retention / erasure; G-08.
- **Owner:** DPO.

### G-31 · AI-allowed test disclosure
⚖️ Requires legal drafting & review.
- **Purpose:** make clear to the test-taker, evaluators and hiring teams that a test allows a YukthiX-hosted AI assistant, and on what terms.
- **Surface:** test instructions and start screen; score report header ("AI-allowed test"). **Acceptance:** ack inside the test consent.
- **Required contents:** which assistant is allowed and that other tools remain prohibited; that prompts and responses are recorded and shown to evaluators as part of the evidence; how use is scored (company's rubric); processing and retention of the transcript (in-region; transcript text to the AI provider under P10 rules); that results are not comparable with non-AI tests; rights and appeal (T05).
- **Must reflect:** T04 §11 C5; G-11; T05 appeals.
- **Owner:** Proctoring product lead + DPO.

### G-32 · Contract-worker privacy notice (with the contractor-login notice)
⚖️ Requires legal drafting & review (DPDP; CLRA / OSH Code record-keeping; biometric consent via G-08).
- **Purpose:** tell contractors' workers what the principal employer (the tenant) records about them at its sites, and why; the contractor's own login is covered by the G-09 contract-labour vendor variant, which this notice links to.
- **Surface:** given at gate-pass issue and kiosk / biometric enrolment (M13 §6 flow 3); displayed at the site gate in the state language; available in the Contractor portal for the contractor to pass on. **Acceptance:** ack, recorded by site HR or the contractor for workers without a login; face / fingerprint enrolment additionally needs G-08 consent.
- **Tenant editing:** starter per D17; the tenant (principal employer) is the controller for site access, attendance and CLRA registers; the contractor remains the employer for wages and its own records.
- **Required contents:** controller(s) and contact; data recorded (name, photo, masked ID — Aadhaar last 4 only, DOB for the 18+ check, gender, UAN / ESIC IP no., skill category, wage rate declared by the contractor, site punches, gate-pass no.); purposes (site access and safety, statutory registers and returns, checking the contractor's wage and PF / ESI compliance because the principal employer is liable); who sees it (site HR, compliance owner, proof verifier; the contractor sees only its own workers); no use for employment decisions about the worker by the tenant; retention (register period from P07, gate pass void on release, P02 §6.1); rights and grievance route (G-23, contractor contact).
- **Must reflect:** M13 YX-CLRA-03 / 04 / 11 / 12; YX-SEC-08 masking; P02 field classes; G-08 for biometrics.
- **Owner:** DPO (template); tenant.

### G-33 · Secure Client device-monitoring notice
⚖️ Requires legal drafting & review.
- **Purpose:** explain, before install and before each test, what the YukthiX Secure Client (desktop) or browser extension checks on the candidate's device, and what it never reads.
- **Surface:** download / install page, the client's self-test screen, the kiosk status bar ("what is monitored"), candidate privacy centre. **Acceptance:** ack inside the test consent (T05); a separate, per-test consent when LAN second-device hints are on (off in the starter template, T08 Q4).
- **Variants:** per tier (desktop client, browser extension) × locale; SEB tests keep their existing notice (G-12).
- **Required contents:** what the client is (signed app, runs only during the attempt, no always-on service or kernel driver, clean uninstall; admin rights only at first install where the OS needs them); what is checked (process names against the blocked list, VM / emulator indicators, virtual camera and audio drivers, display count, mirroring / casting, screenshot or recording attempts, remote-desktop sessions, clipboard inside the test, client version and integrity, crash logs); what is **never** read (files or file names, documents, browsing history, keystroke content outside the test, personal data); LAN hints (passive, count and device class only, advisory); how detections are used (flags via the T04 action matrix, human review, never an automatic fail, appeal via T05); accommodations (approved assistive technology is exempted, T03); retention and region (T05); what to do if the client cannot be installed (company's allowed alternatives, contact).
- **Must reflect:** T08 YX-SCL-01…08 and Q3 / Q4; T04 YX-PROC-02; G-12, G-29.
- **Owner:** Proctoring product lead + DPO.

### G-34 · Partner programme agreement
⚖️ Requires legal drafting & review (contract; DPDP processor / sub-processor terms; GST and TDS on commission and partner invoices; ICAI rules on fee-sharing and advertising for CA firms).
- **Purpose:** the contract between YukthiX and a partner firm (CA / accountant firm, payroll bureau, reseller / referral partner, implementation partner) under which it is verified, links to client tenants, works inside them under a client grant and is paid.
- **Surface:** partner sign-up after the application (P16 §6 flow 1); partner portal › Profile and footer; the YukthiX console shows the accepted version during verification. **Acceptance:** click by an authorised signatory of the firm (`legal_acceptances.subject_kind = partner`); material changes need re-acceptance before continued use (YX-SEC-28); a partner without the current version can't activate new client links (YX-PTR-01).
- **Required contents:**
  1. Parties, partner types and the reseller hierarchy (at most master partner → partner; a master partner never gets client data through a sub-partner, YX-PTR-10).
  2. **Verification:** firm identity, GSTIN / PAN, ICAI firm registration for CA firms; duty to keep them accurate; YukthiX's right to re-verify, suspend (all client access stops at once) and terminate (YX-PTR-01).
  3. **Data processing:** the client company stays the data fiduciary; for data in a client tenant the partner acts only on the client's instructions as a **sub-processor for that client** (counsel to settle processor vs sub-processor and flow down G-03); only assigned users, only within the grant, never Special data (YX-PTR-03); no copying client data out except through client-approved exports; every action audited in the client's log (YX-PTR-04); breach notice to YukthiX and the client; client data stays with the client when a link ends (YX-PTR-12).
  4. **Confidentiality:** client data, other clients' data and YukthiX non-public information; survives termination.
  5. **Security duties:** MFA for all partner users, SSO or passkeys at 10+ users, desk session limits, prompt removal of leavers (YX-PTR-06); payroll / bank-file release, filing and DSC signing only as delegated by the client, with step-up (YX-PTR-05).
  6. **Commission and discount terms:** billing mode per client (direct + monthly referral commission, or consolidated partner invoice at a partner discount, YX-PTR-11); commission basis (client subscription excluding add-on pass-through and taxes), accrual, approval, payout timing, clawback on credit notes or client non-payment; partner-invoice discount and payment terms; the client's YukthiX price never above the published price and the client's right to switch to direct billing if the partner doesn't pay; GST / TDS treatment; rate changes with notice (rates must pass YX-BILL-09).
  7. **Tenant ownership and transfer:** client-owned vs partner-owned tenants (P16 Q2); the named client contact's rights the partner can't remove (audit view, full export, transfer request); **notice period for partner-owned → client-owned transfer set here, never more than 30 days (starter 30)**; the partner can't block a transfer and must complete or hand over open payroll runs; the billing account moves with ownership (YX-PTR-13).
  8. **Service responsibility:** the partner, not YukthiX, is responsible to its clients for the payroll and filing work it performs; YukthiX runs no payroll service and takes no statutory filing liability (YX-PTR-14); the partner's engagement terms with each client are separate.
  9. **Branding:** partner branding on the partner portal and, with the client's consent, on the client's login page (P16 Q5); use of YukthiX marks.
  10. **Non-solicitation of directory ranking:** the partner may not offer or pay YukthiX staff or anyone else for directory placement, and may not solicit, buy or incentivise reviews; ranking is by fit and verified reviews only (YX-PTR-14; listing rules in G-35).
  11. Term, termination (for convenience with notice; for cause immediately) and its effect on client links (clients notified, access stops, data stays with clients); liability caps, indemnities, governing law, disputes.
- **Must reflect:** P16 YX-PTR-01…14 and Q1–Q6; G-01 / G-03 (the client terms the partner works under); P14 YX-BILL-09; P02 §4.7 partner-user row.
- **Owner:** Commercial lead + DPO.

### G-35 · Partner directory listing terms
⚖️ Requires legal drafting & review (fair advertising / consumer protection; ICAI advertising guidelines for CA firms).
- **Purpose:** rules for verified partners who list in the in-product partner directory, and the disclosure clients see about how the directory is ordered.
- **Surface:** partner portal › Profile › Directory listing (before a listing goes live); the client-side directory (Settings › Partners, APX-D PLT-30) shows the ordering disclosure and links these terms. **Acceptance:** click by a partner admin before the first listing and on material change; none (notice) for clients.
- **Required contents:** who may list (verified, not suspended partners only, YX-PTR-01 / 14); listing content (services, states, languages, client-size band, fee range) and an accuracy undertaking; professional-body rules the partner must follow; **ordering disclosure:** fit to the client's needs and verified reviews from linked clients only, never payment to YukthiX; reviews (only from linked clients, verification, moderation, right of reply, removal of fake or incentivised reviews); link requests from the directory (the client chooses, no obligation); moderation, delisting and appeal; YukthiX does not endorse or guarantee partner services; how the partner's listing data is processed (G-05).
- **Must reflect:** P16 YX-PTR-14 and Q4; G-34 item 10.
- **Owner:** Commercial lead + trust & safety.

### G-36 · EU AI Act deployer notice to workers and representatives
⚖️ Requires legal drafting & review (EU AI Act Art. 26(7); national works-council / information-and-consultation law per member state).
- **Purpose:** the notice an EU tenant, as **deployer**, gives to **workers' representatives and affected workers before putting a high-risk AI system into service at the workplace** (Art. 26(7)); YukthiX supplies the template.
- **Surface:** the enable step of a high-risk employment feature in Settings › AI (P10 §A4 table, every "yes" / "depends" row) for EU tenants; the published tenant version under Me › My data (AI in use) and the portal footer. **Acceptance:** a tenant admin records that the notice was given (date, audience, channel, representative body) as a `legal_acceptances` row (`subject_kind = tenant`, action `ack`); the feature can't be enabled without it (YX-AI-12). Workers: none (notice).
- **Tenant editing:** starter per D17; one version per feature group (hiring, performance / attrition, allocation, attendance monitoring) and locale; the tenant adds its representative bodies and any consultation outcome.
- **Required contents:** which AI system and feature, what it does and what it doesn't decide (advisory only, human decides, YX-AI-01); which decisions it supports (recruitment, promotion / termination, task allocation, performance or behaviour monitoring); data used and never used (no Special data or protected attributes, M06 YX-PERF-17); human oversight arrangements and who the overseers are; logging and retention; bias testing and fairness results (T05 YX-EVAL-29, P10 model card); how a worker can ask for an explanation or human review and contest an outcome; start date; contact (G-23 and tenant contact).
- **Must reflect:** P10 §A4, YX-AI-10 / 11 / 12; T05 YX-EVAL-29; G-06, G-11.
- **Owner:** AI product lead + DPO (template); tenant (published notice).

### G-37 · AI literacy guidance for tenant users
⚖️ Requires legal drafting & review (EU AI Act Art. 4).
- **Purpose:** help the tenant meet its **AI literacy duty (Art. 4, applies since 2 Feb 2025)** for staff who configure or use YukthiX AI features, and make safe use of advisory outputs normal practice everywhere.
- **Surface:** Settings › AI before an admin enables any AI feature; a short guide at a user's first use of an AI feature (suggestion badge, AI interview review, attrition-risk list, review summaries); help centre. **Acceptance:** ack per user per version (`legal_acceptances`).
- **Required contents:** what each YukthiX AI feature does and its limits (P10 §A2 / §A4 classification); outputs are advisory and must be checked, never rubber-stamped (YX-AI-01); known error types and bias risks with the fairness results (T05 A13); what data may be pasted into AI features (P10 tiers, YX-AI-02); how to override, report a bad output or trigger an AI incident (P10 §A4); duties under the deployer notice (G-36) for high-risk features; where to get training.
- **Must reflect:** P10 §A4, YX-AI-01 / 02 / 12; T05 A13; G-11, G-36.
- **Owner:** AI product lead.

### G-38 · Cross-region transfer annex
⚖️ Requires legal drafting & review (DPDP Act cross-border rules; GDPR Chapter V; UAE / KSA data laws; per region).
- **Purpose:** annex to the DPA (G-03) stating where each entity's data is hosted, which transfers between regions happen (support access, backups, sub-processors) and the legal basis for each.
- **Surface:** sign-up with G-03 when a non-home region is chosen; Settings › Privacy; every region-move request (PLT-46). **Acceptance:** click, recorded per version and region pair (`legal_acceptances`).
- **Required contents:** regions and entities; data categories per region; transfer list with purpose, recipient and safeguard; support-access model; backup location; sub-processors per region (G-04); change and objection process.
- **Must reflect:** P21, P01 YX-ORG-28…30, P02 YX-SEC-37/38, P13. **Owner:** DPO.

### G-39 · Region-move notice
⚖️ Requires legal drafting & review.
- **Purpose:** tell the tenant (and, through the tenant's version, its employees) that an entity's data will move region: what moves, when, downtime, and what changes in G-38.
- **Surface:** region-move request and schedule (PLT-46); email / in-app to tenant admins; tenant version under Me › My data. **Acceptance:** ack by a tenant admin before the move is scheduled; employees: notice only.
- **Required contents:** entity, source and target region, date and window, data moved and not moved, service impact, rollback, updated annex G-38, contact (G-23).
- **Must reflect:** P21, P02 YX-SEC-37/38, P13. **Owner:** DPO + head of operations.

### G-40 · EU whistleblower procedure
⚖️ Requires legal drafting & review (Directive (EU) 2019/1937 and member-state transpositions).
- **Purpose:** the procedure an EU tenant publishes for its internal reporting channel; YukthiX supplies the template matching the product's clocks and protections.
- **Surface:** report form and status page (with G-10), Me › Policies, portal footer (tenant version). **Acceptance:** none.
- **Required contents:** who may report and what; channels (written, oral, meeting on request); acknowledgement within 7 days and feedback within 3 months (clocks from the `EU.WHISTLEBLOWER` pack, M08 YX-CASE-17); anonymity and confidentiality; protection from retaliation; external reporting to competent authorities; record keeping and retention; designated impartial handler.
- **Must reflect:** M08 YX-CASE-06 / 11 / 17, G-10, APX-C RPT-CASE-05. **Owner:** DPO + ethics lead (template); tenant.

### G-41 · NYC Local Law 144 bias-audit summary publication
⚖️ Requires legal drafting & review (NYC Local Law 144 and DCWP rules; **verify** notice periods and required fields).
- **Purpose:** the public summary of the latest independent bias audit a tenant must publish before using an automated employment decision tool for NYC candidates or employees, plus the candidate notice.
- **Surface:** tenant careers page and NYC job posts; audit record (HIR-23); setting APX-E #193. **Acceptance:** none (published); the candidate notice is shown in the application flow.
- **Required contents:** audit date and auditor; tool and its use; data source; selection or scoring rates and impact ratios by sex, race / ethnicity and intersectional categories (from RPT-ATS-11); number of unknown-category individuals; distribution date; candidate notice (tool used, job qualifications assessed, alternative process or accommodation, data retention).
- **Must reflect:** T05 YX-EVAL-31/32, M10, G-11. **Owner:** compliance owner (tenant); AI product lead + DPO (template).

### G-42 · Electronic-records certificate format (BSA s.63)
⚖️ Requires legal drafting & review. **Verify with counsel:** the prescribed certificate format and signatories under the Bharatiya Sakshya Adhiniyam, 2023, s.63.
- **Purpose:** confirm the certificate that accompanies records exported from YukthiX for use as evidence (appraisal disputes, cases), so the template APX-F #133 matches the law.
- **Surface:** evidence export (PRF-15, M08 case export) generates the certificate with the cover sheet APX-F #134. **Acceptance:** none; signed by the tenant's authorised person (and an expert part if counsel says it is required).
- **Required contents:** description of the records and the system; how produced; hash values per item; the conditions of s.63 as counsel confirms them; signatory, designation, date, place.
- **Must reflect:** M06 YX-PERF-20…22, M08, P08 audit trail, APX-F #133 / #134. **Owner:** HR-legal counsel + DPO.

**G-09 new variants (26 Sep 2026):** **staffing vendor contact** (M10 §11 C7: own vendor's shared jobs and submissions; confidentiality of client and candidate data; no re-use of candidates outside the job shared) and **contract-labour vendor contact** (M13: own contractor's worker records, challans and registers; accuracy undertaking for uploaded statutory documents). Same structure and owner as the six existing G-09 templates.

---

## 3. Product mechanics

### 3.1 Tables

| Table | Key columns | Notes |
|---|---|---|
| `legal_documents` | `id`, `organization_id` (null = YukthiX platform document; set = tenant-published version of a template, e.g. G-06 / G-07), `type` (catalogue ID G-01…G-42 + variant, e.g. `G-08.bipa`, `G-09.client_contact`), `product` (hrms / ats / proctoring / all), `jurisdiction` (nullable), `version`, `locale`, `effective_from`, `superseded_at`, `url` (published page), `content_hash`, `material_change` (bool), `change_summary`, `acceptance_mode` (none / ack / click / click_otp / consent), `template_id` (for tenant versions: the YukthiX template version it derives from), `published_by`, `published_at` | Immutable once published; a change is a new version. RLS on `organization_id` (null rows readable by all tenants). |
| `legal_acceptances` | `id`, `organization_id`, `legal_document_id` (exact version + locale), `subject_kind` (user / external_login / candidate / tenant / partner), `subject_id`, `on_behalf_of` (tenant, when a signatory accepts G-01 / G-02 / G-03), `action` (ack / accept / consent / withdraw / opt_out), `channel` (for G-20: whatsapp / sms), `surface` (sign-up, first run, candidate portal…), `accepted_at`, `ip`, `user_agent` / `device_id`, `otp_channel` (when click_otp), `evidence_hash` | **Append-only**; withdrawal is a new row. Each insert is written to the P08 audit log. |

**Links to existing records (no duplication):**
- T05 `consent_records.text version` and M10 per-purpose consents reference the `legal_documents.id` shown (G-07 / G-08 / G-11 / G-12).
- P05 signature requests keep per-document evidence; G-19 acceptance is recorded once in `legal_acceptances`.
- P04 preferences hold opt-out; the G-20 opt-in is the `legal_acceptances` row the P04 channel filter checks before sending non-OTP WhatsApp / SMS.
- **Anonymous reporters (G-10):** never write `legal_acceptances` (YX-CASE-11).

### 3.2 Publishing
- YukthiX legal documents are published by platform staff with two-person approval; tenant versions (G-06, G-07, tenant variant of G-09) by a tenant role holding `privacy.notice.publish` (P02 YX-SEC-28; default holders: HR Admin + System Admin). Mandatory sections of a template can't be deleted (spec D17).
- Publishing requires `effective_from`, `change_summary` and the `material_change` flag; the flag is set with counsel's sign-off for YukthiX documents.

### 3.3 Re-acceptance on material change (YX-SEC-28)
- **Not material:** a dismissible **banner** ("Updated … effective …, what changed") on next sign-in plus the portal footer link; existing acceptances stay valid.
- **Material:** the subject must **re-accept (or re-acknowledge, for notices) before continued use**:
  - Users and external logins: a blocking interstitial on next sign-in shows the change summary and the new text.
  - Tenant contract documents (G-01 / G-02 / G-03): tenant admins are told in advance (email + banner; notice period set by counsel; G-04 changes 30 days); after the effective date the **admin console** is gated until an authorised signatory accepts. Employee self-service keeps working so payroll and payslips aren't disrupted (counsel to confirm against G-01 suspension terms).
  - Candidates: re-ack at the next portal visit; consents (G-08) are re-collected before the next capture.
- Every banner shown, interstitial passed or dismissed is audited (P08).

### 3.4 Reporting & evidence
- Per document version: accepted / pending / withdrawn counts per tenant; "who hasn't accepted version N" list for tenant admins and platform staff (P09 metric once registered, H2).
- **Acceptance certificate** export (PDF via P05): subject, document version hash, time, IP, device, OTP channel.
- Retention of acceptance records: for the contract term plus the limitation period (counsel sets), under legal hold when disputed.

---

## 4. Team actions

1. **Engage counsel:** Indian technology / privacy counsel (DPDP, IT Act, TRAI-DLT, POSH) now; EU (GDPR) and US (Illinois BIPA) counsel before the first non-India tenant or US-located candidate. Brief them with this appendix, the sub-processor inventory (G-04), the data map / RoPA (B12) and T05 / M10 retention defaults.
2. **Drafting order:**

   | Batch | Artefacts | Deadline |
   |---|---|---|
   | 1 · Pilot-blocking | G-01, G-02 (with pilot terms), G-03, G-04, G-05, G-06, G-07, G-08 (India first; EU / BIPA before those markets), G-09 (pre-boarding, alumni), G-12, G-14, G-16, G-19, G-20, G-21, G-22, G-23; G-11 (T04 signals part) | Before wave 3 pilot |
   | 2 · Public launch | G-15 (after P13 / P14 numbers), G-17 (after the T03 audit), G-18 (after P12), G-13, rename re-issue of all Workfox-branded documents (D16) | Before public launch |
   | 1b · DPDP Rules 2025 (C3) | Updates to G-03 (72-hour Board report), G-05 Part B, G-06 and G-07 (itemised per-purpose notices), G-23 (timelines); consent-manager wording in G-06 / G-07 | Consent-manager wording by Nov 2026; everything before 13 May 2027 |
   | 3 · Later, per feature | G-09 trainer (M07), IC external member (wave 4), audit-committee chair (wave 5); G-10 (wave 5); G-11 AI interview (wave 7); **added 26 Sep 2026:** G-24 EWA and G-25 field-force (wave 5); G-26 presence and G-27 visitors (wave 6); G-28 talent CRM and G-09 staffing-vendor variant (wave 7); G-09 contract-labour vendor variant and G-32 contract-worker notice (with M13, wave 5); G-29, G-30, G-31, G-33 (Proctoring track, before each feature); **P16 follow-up:** G-34 and G-35 (partners and directory, wave 3 with the payroll pilot); **C4 (28 Sep 2026):** G-37 AI literacy guidance before any EU tenant uses an AI feature (all tenants by public launch), G-36 deployer notice before any EU tenant enables a high-risk employment feature (and by 2 Dec 2027) | Before each feature ships |
3. **Build:** `legal_documents` / `legal_acceptances` and the §3.3 gating in wave 1 platform work, before the pilot; G-13 and G-21 generators with the retention and SBOM work.
4. **Dependencies to close:** verify the docxtemplater licence (P05 Q1); confirm the SCORM runtime licence (M07); register DLT templates and submit Meta templates (P04); appoint the DPO / grievance officer (B12); book the accessibility audit (T03 Q8).
