# Appendix E · Setup hub, go-live readiness & admin editors

> **Status:** 📋 Catalogue defined, 26 Sep 2026. Closes GAP-REGISTER **G1–G6**; summarises **G7** (detail in [T05](T05-integrity-evaluation-outcomes.md) YX-EVAL-15). **P19 follow-up 26 Sep 2026:** readiness check "starter rules reviewed" and editors #177–181 (§3.9). **Validation pass 3 Must (S3), founder decision 28 Sep 2026:** a **quick start lane** per product (§1.6) beside the 22 cards, for first value in about 5 minutes; the go-live checks (§2) are unchanged. Rules in [P20](P20-growth-trial-customer-operations.md) (YX-GRO-01 / 02). **P22 follow-up 28 Sep 2026:** editors #195–200 (Workflow Studio, §3.9b). **P23 follow-up 28 Sep 2026:** editors #201–206 (assistant switches, coach frequency, timesheet mapping rules, perks, group insurance partner, AI review summaries opt-in; §3.9c).
> **Linked from:** [P01 §7](P01-tenancy-and-organisation.md) (the P01 org wizard and the M03 payroll wizard are now cards of this hub) and P01 §11 row G1.
> **Principle (spec D17):** every policy that varies between companies is **configurable**, ships as a clearly labelled **starter template** ("YukthiX starter — edit for your company"), and therefore **needs an editor screen**. Only law is enforced: legal values come from P07, are shown read-only with their source, and a company may only be more generous where the law allows.
> **New rules:** YX-ORG-23 (setup hub & starter review), YX-ORG-24 (go-live readiness & sign-off), YX-ORG-25 (every company policy has a registered editor).

---

## 0. Conventions

- **Starter badge.** Every value or record seeded from a starter template carries the badge **"YukthiX starter — edit for your company"** until a person reviews it (keeps it, or edits it). Editing removes the badge and records "edited from starter vN".
- **⚑ Review before go-live.** A starter applied at setup whose effect on pay, leave, legal notices or employee-facing behaviour is significant. Unreviewed ⚑ starters appear in the readiness model (§2) as **blocking** or **advisory** as listed there.
- **⚖️ Law.** A value fixed by law (P07 rule sets, statutory templates). Shown read-only with source and version; never a starter; never editable by the company except where P07 lists a legal option.
- **Scope codes** (P01 §4.6, YX-ORG-18): **T** tenant · **E** legal entity · **PG** pay group · **L** location · **D** department · **ET** employment type · **G** grade · **Dg** designation · **Emp** employee. **rec** = configuration held on a master record (per leave type, per shift, per queue, per cycle, per test…), not in the `settings` table; the record itself may be limited by the scopes shown.
- **Dated?** **dated** = settings-registry flag `dated: true`, stored with `valid_from` and resolved as of the period processed (YX-ORG-18) · **versioned** = the record is versioned; anything already issued or processed stays pinned to the version it used · **—** = neither (current value applies).
- **Proposed starter** values in *italics* are not yet decided in the owning doc; they are this appendix's proposal, to be confirmed by the owning doc's owner. Non-italic starter values are already decided in the cited doc.
- **Settings groups** follow the APX-D Settings map: **Organisation · People & Access · Time & Leave · Payroll & Statutory · Documents & Communication · Hiring & Assessments · Integrations & Developers · Billing & Account.** Where APX-D places an editor elsewhere, APX-D wins and this table is updated. Mapping used here for modules without an obvious group: M05 Expenses → Payroll & Statutory; M06 Performance, M07 Learning, M08 Helpdesk & cases → People & Access; M09 Engage and M08 policies → Documents & Communication; P09 Analytics → Organisation.

---

## 1. Setup hub (G1)

### 1.1 What it replaces
- The **P01 tenant set-up wizard** (company → entities → locations → departments → designations & grades → import employees) and the **M03 per-entity payroll setup wizard** (registrations → pay group & cut-off → template → bank format → accounting → opening balances) were two disconnected flows, and nothing covered the other ~20 areas a company must configure.
- They become **cards of one setup hub**: *Settings › Setup hub*, also the first-run landing page after sign-up and the target of the T6 "setup incomplete" banner. The old wizard steps survive, in the same order, as the steps of the **Organisation** (C01) and **Payroll** (C11) cards.

### 1.2 How it works
- **One card per area**, grouped by product (HRMS · ATS · Proctoring · Platform). A tenant sees only the cards of the products and waves it has switched on (spec D11: products per tenant through billing plans); a Proctoring-only tenant sees C01 (minimal: company + default entity), C02, C03, C05, C20, C21, C22.
- **Card anatomy:** title · progress ring · required steps done / total · optional steps done · blocking findings count · owner (sign-off role) · **Start / Continue / Review** · per-entity switcher for entity-level cards (payroll, leave year, letterheads, IC…).
- **Steps** are registered in code per module (like settings, permissions and request types: P01 §4.6, P02 §4.1, P03 §4.1) with: key, card, **required / optional**, `depends_on[]`, the **completion check** (a query, e.g. "every location has a holiday calendar for the current year"), the starter keys it applies, and the editor it opens. Completion is **computed**, never ticked by hand, except for off-system steps (e.g. "Meta business verification done"), which are marked done with a note and re-checked where an API exists.
- **Dependencies** are shown as locked steps with the reason ("Needs C01 · locations"). A card may be started before its dependencies are complete when only optional steps depend on them.
- **Starter templates are applied at setup (D17).** When a product or wave is switched on, the hub applies that area's starter templates (policies, templates, libraries) in one go, each with the starter badge; ⚑ items are listed on the card as "Review before go-live". Reviewing = opening the editor and choosing **Keep starter** (records reviewer and time) or editing. A later YukthiX starter update never overwrites a company value; it shows "new starter version available" with a diff (APX-F YX-DOC-20 for templates).
- **Bulk import** entry points (Excel / CSV / ZIP with validation preview, spec §2.1.11) sit on the steps that load data; the full migration framework is future **P15** (GAP A5), which reads the same step registry.
- **Data:** `setup_steps` (registry, code), `setup_step_status` (tenant × entity? × step: not started / in progress / done / skipped-optional, completed_by, completed_at, evidence note), `starter_applications` (setting key or record ref, starter version, status unreviewed / kept / edited, reviewed_by, reviewed_at). All carry `organization_id` + RLS.

### 1.3 Cards

Legend: **R** required · **O** optional · ⚑ starter applied, review before go-live.

| Card | Steps (R / O) | Depends on | Starter templates applied (⚑ = review before go-live) | Sign-off owner | Product · wave |
|---|---|---|---|---|---|
| **C01 Organisation & entities** (P01) | R: company details · legal entities with PAN / TAN / GSTIN / CIN · locations (state, time zone, holiday-calendar link, geofence) · departments (template or import) · designations & grades · employment types with categories · employee-code pattern & scope · import employees (Excel with preview). O: grade pay ranges · cost centres (R before payroll accounting) · transfer defaults (YX-ORG-17) · branding / white-label (P11 Q7) | — | Department template (Sales, Operations, Finance, HR, IT, Admin); statutory default matrix per employment-type category (⚖️ P07); ⚑ transfer defaults; ⚑ employee-code pattern | System Admin | All products · wave 1 |
| **C02 Roles & admin users** (P02) | R: at least one System Admin and one HR Admin granted with scope · Payroll Admin + Finance approver (before C11) · review shipped role templates. O: second System Admin · custom roles · raise-on-behalf holders and request types (YX-SEC-27) · directory fields (YX-SEC-17) · suppression threshold (YX-SEC-14) · support-access defaults (YX-SEC-20) · SSO (future P12) | C01 | Role templates (P02 §4.2); directory preset (P02 Q4); suppression 5; ⚑ raise-on-behalf = *HR only, all request types that allow proxy* | System Admin | All · wave 1 |
| **C03 Privacy & notices** (P02 §6, APX-G) | R: publish the **employee privacy notice** from the template (APX-G G-06) in the tenant's languages · confirm data-retention schedule per data class · confirm "who accessed my data" setting (P08 Q6). O: optional-data consents (face check-in, diversity) · candidate privacy notice (G-07, R before C19 / C20 go-live) · biometric consent texts review (G-08, R before C20) · grievance / DPO contact (G-23) | C01, C02 | ⚑ Privacy-notice template; retention schedule (legal floors ⚖️, company periods starter); "who accessed my data" on | System Admin (DPO if named) | All · wave 1 |
| **C04 Approval policies** (P03) | R: one active policy per enabled request type, each passing **Simulate** (YX-WF-16) · payroll-run chain (two-level default, M03 Q2). O: out-of-app approval switch (P03 Q4) · duplicate-approver auto-approve (Q6) · auto-action delays for allowed types (Q2) · delegation defaults | C01, C02 | ⚑ Starter policy per request type (e.g. leave: manager; expense: manager → finance above *₹25,000*; payroll run: Payroll Admin → Finance approver; letters: HR per P05 Q4 defaults) | HR Admin (+ Payroll Admin for payroll / bank / statutory policies, P03 Q8) | All HRMS · wave 1 |
| **C05 Notification channels** (P04, APX-A) | R: in-app + push (automatic) · quiet hours confirm (9 pm–8 am default) · default channels per employment type / location (P04 Q1). O: **email domain** · **WhatsApp setup checklist** · **SMS / DLT** · email / in-app template edits · SMS cap (C22) — detail in §1.4 | C01, C03 (opt-in text) | Notification library (APX-A) with YukthiX wording; quiet hours; ⚑ field-staff = email off | System Admin | All · wave 1 (WhatsApp from wave 2) |
| **C06 Documents, letterheads & signatories** (P05, APX-F) | R: letterhead per legal entity · signatories per entity (title, signature image) · reference-number prefixes per entity × letter type · document-type registry review (sensitivity, verification, expiry, retention) · review the starter letters used in the active waves (APX-F). O: company DSC per entity (R before Form 16 / DSC-signed letters) · Aadhaar eSign add-on per letter type · QR default per letter type · self-service certificate types instant / approval (P05 Q8) | C01, C02, C04 (letters needing approval) | Letter & document library (APX-F); document-type registry (P05 §4.2, verification per P05 Q7); ⚑ reference prefix pattern *`{ENTITY}/HR/{YYYY}/{NNNN}`*; ⚑ each letter used in the wave | HR Admin | HRMS · wave 1 (letters wave 4; Form 16 wave 3) |
| **C07 Leave** (M02 A) | R: leave year per entity (L1) · leave types · leave-policy bundles + assignment rules · holiday calendars per location for the current year · opening balances (import or adjust with reason). O: optional holidays (N of M) · holiday-on-weekly-off per calendar · comp-off rules · encashment formulas · next-year calendars (clone) | C01 | ⚑ Leave-type set *(CL, SL, PL / EL, LOP, comp-off, paternity, bereavement)* + statutory maternity (⚖️ IN.LEAVE); ⚑ policy bundle per *grade band*; state festival templates; holiday on weekly off = none; leave in notice = allowed; accrual during long absence = pause on sabbatical / LWP, continue on maternity | HR Admin | HRMS · wave 2 |
| **C08 Time & attendance** (M02 B, P08) | R: **attendance mode per group** (Punch / Assumed present / Timesheet, D1) and Punch-mode **block / warn** switch · for Punch groups: shifts, weekly-off rules, **check-in rules per location / group** (restricted or field; geofence drawn on the map; IP / Wi-Fi ranges) · attendance cut-off day per entity (P08 Q2) · regularisation limits. O: shift patterns / rotations · OT policy per shift · late-penalty policy · WFH / on-duty limits · max lateness for late requests (P08 Q4) · timesheet approver resolver (Timesheet groups) | C01, C07 (calendars) | ⚑ Attendance mode = Punch, block; ⚑ General shift *(09:30–18:30, grace 10 min, break 30 min above 5 h)*; weekly off = Sunday (location default); regularisation 4 / month; late penalty off (ready policy 3 free, then ½ day per 3); OT min 30 min, round down 15 min, approval after the fact | HR Admin | HRMS · wave 2 |
| **C09 Kiosks & devices** (M04 Q4, P10 Q4) | O: register kiosks per site (heartbeat) · kiosk PIN / ID-card QR policy · biometric devices (cloud push / sync agent / CSV) with enrolment-ID mapping. R when the company uses kiosks or devices: every active device mapped and heartbeat green | C01, C08 | Kiosk auto-logout 30 s; ⚑ *PIN 4 digits, reset by HR* | HR Admin | HRMS · wave 2 |
| **C10 Mobile roll-out & device binding** (M04) | R: invite plan (batches by entity / location; SMS / WhatsApp / email) · device-binding policy (on for restricted-mode staff by default, field staff exempt, M04 Q3). O: session length (30 days default, M04 Q8) · store-app links (wave 3) · app PIN policy | C02, C03 (notice shown at first run), C05, C08 | ⚑ Binding on for restricted mode; 30-day session; re-auth on Pay / documents / bank-ID after 15 min idle | HR Admin | HRMS · wave 2 |
| **C11 Payroll** (M03, per entity) | R: statutory registrations (PF, ESI, PT / LWF per state) · **legal options** per entity (P07 YX-STAT-06) · pay groups & pay calendars with cut-off · component library review · salary template(s) · compensation load (Excel) · bank file format · bonus payment method (M03 Q8) · filing mode per statute (self / partner, Q6 / Q7) · opening balances & YTD / Form 12B (mid-FY go-live) · payslip layout review (APX-F) · **parallel run** variance sign-off (M03 §8). O: accounting ledger / cost-centre mapping (P10 Q7) · payment modes cash / cheque (YX-PAY-31) · loan types · one-time pay types · payroll settings (day basis, variance threshold, protected net, declaration / proof windows, regime cut-off) · payout API add-on | C01 (entity IDs, cost centres), C02 (Payroll Admin ≠ Finance approver), C04 (payroll-run policy), C06 (letterhead, DSC), C07 + C08 (attendance feed; or Assumed-present mode) | India standard CTC template; component library with wage-definition flags; ⚑ day basis *calendar days*; ⚑ variance ±10 % net; ⚑ protected net *50 % of gross*; ⚑ declaration window FY start, proof window Jan–Feb; ⚑ payslip layout (APX-F); bonus = annual with monthly provision | Payroll Admin + Finance approver | HRMS · wave 3 |
| **C12 Lifecycle** (M01) | R: onboarding & offboarding journey templates (incl. statutory items YX-LC-22) · pre-boarding checklist (M01 Q2) · probation policy per type / grade · **notice policy** by grade / type / confirmation status · hand-off mode per entity (M10 Q2, when ATS is on). O: asset categories · rehire policy · absconding timeline · contract-end policy · retirement policy · sabbatical policy · death-support policy · open-case hold policy · exit-interview questionnaire · custom fields | C01, C06 (letters), C07 (leave in notice) | ⚑ Journey templates; probation 6 months, review 15 days before, extend max 12 months total, no auto-confirm; ⚑ notice *30 days on probation / 60 days confirmed*; ⚑ rehire = fresh start, same record / code / UAN; ⚑ absconding 3 / 7 / 14 / 21; ⚑ contract end alert 30 & 7 days, no auto-exit; ⚑ retirement 58, end of month, alerts 6 / 3 / 1 months; death support all off; open-case hold = hold letters and F&F, HR may release | HR Admin | HRMS · wave 4 (core HR fields wave 1) |
| **C13 Expenses & travel** (M05) | R: categories with accounting heads, taxability, GST flag · city tiers · expense-policy matrix assigned to all grades · payment route (payroll default / direct) · advance rules. O: mileage and per-diem rates · receipt thresholds per category · over-limit handling per category · GST capture (off by default) · travel desk role | C01, C04 (claim / trip policies), C11 (payroll route) | ⚑ Policy templates by grade band × city tier (M05 §8); receipt above ₹500; advance settlement 30 days after trip, recovery up to 3 instalments; over-limit = justification + extra approval | Finance approver + HR Admin | HRMS · wave 5 |
| **C14 Performance** (M06) | R (before the first cycle): rating scale · review template · competency library review. O: comp matrix & budgets · PIP template · 360° defaults · calibration distribution guide | C01, C04 | Templates: annual, half-yearly, probation, OKR quarterly (M06 §8); scale 1–5 with labels; ⚑ competency library (core / functional / leadership); anonymity ≥ 3 | HR Admin | HRMS · wave 5 |
| **C15 Learning** (M07) | R: compliance assignment rules for mandatory courses (e.g. POSH awareness for joiners within 30 days) · certificate template. O: department training budgets per FY · bond terms · trainer master · completion threshold · effectiveness check delay | C01, C06 (certificate template) | ⚑ Mandatory-course templates: POSH awareness, fire safety, code of conduct, information security (M07 §8); completion 75 %; manager check after 60 days; budget = warn | L&D Admin (HR Admin) | HRMS · wave 5 |
| **C16 Helpdesk & cases** (M08) | R: queues with agents and business hours · categories with SLA by priority and sensitive flag · ethics officer for whistleblower (YX-CASE, Q8). O: knowledge-base import · macros · email-to-ticket address · misconduct matrix · grievance anonymous switch · audit-committee chair · case-retention extension | C01, C02 | ⚑ Queues HR / Payroll / IT / Admin / Finance; sensitive categories payroll / medical / personal; ⚑ misconduct matrix *(minor / major per model standing orders)*; show-cause reply 7 days; warning expiry 12 months; case retention 8 years | HR Admin (+ ethics officer) | HRMS · wave 5 (payslip-query queue wave 3, YX-PAY-25) |
| **C17 Internal Committee (POSH)** (M08, ⚖️) | R **by law** for every workplace / entity at or above the P07 POSH threshold: IC constitution (presiding officer, members, external member, tenure) passing YX-POSH-01 validation · IC display notice issued (APX-F) · POSH policy published. O: awareness-session log (wave 4) | C01, C02, C06 | ⚖️ Composition rules from P07 POSH parameters; POSH policy starter (⚑) and IC notices (APX-F) | HR Admin + IC presiding officer | HRMS · wave 4 |
| **C18 Engage** (M09) | R: company values (needed for kudos, YX-ENG-06). O: spaces & posting policies · blocked-word lists · report threshold · reward mode & budgets · celebration types · survey templates & cadence · Teams / Slack mirrors | C01, C03 | Value templates, badge set, survey templates (engagement, pulse, eNPS, onboarding, exit), blocked-word lists EN / HI / TA / TE; badges only; celebrations on; ⚑ values | HR Admin | HRMS · wave 5 |
| **C19 Hiring & staffing desk** (M10) | R: pipeline template · scorecard template · offer template (M03 template + APX-F letter) · candidate retention period · hand-off mode per entity (when HRMS is on). O: headcount-plan approval rules · career page · job boards · AI interview settings · BGV package & trigger · referral bonus rule · cost entries (P09 Q3). Staffing (O, R for staffing tenants): clients, contracts, rate cards · invoice series per entity / GSTIN · GST invoice & credit-note templates (APX-F) · ageing buckets & dunning schedule · bench policy | C01, C02, C03 (candidate notice), C04, C06 | Pipeline & scorecard starters; retention 12 months; BGV after acceptance; ⚑ referral bonus after 90 days; ⚑ bench policy; ⚑ ageing 0–30 / 31–60 / 61–90 / 90+; ⚑ dunning *at due + 7, + 15, + 30 days* | Recruiting lead (HR Admin); Finance approver for invoicing | ATS · wave 7 (exam-app ATS live earlier) |
| **C20 Proctoring defaults** (T01–T05) | R: consent texts per jurisdiction reviewed (T05 Q8, APX-G G-08) · retention per data class (T05 Q7) · default proctoring profile (mode preset + action matrix, T04 Q1) · **incident reviewer pool & assignment policy** (T05 YX-EVAL-15). O: delivery defaults (T03 Q1–Q7) · retake / timer / navigation defaults (T02) · exposure cap · result-visibility default · appeal windows · rubric library · question review workflow · proctor pool (company / YukthiX add-on + proctor-service opt-in, YX-SEC-23) · Live ratio | C01, C02, C03 | Starter question library (read-only, copy to edit); ⚑ result visibility = status only; recordings 90 days; ⚑ reviewer assignment = round-robin, COI on; appeal 7 days / decision 10 working days; incident SLA 3 working days; exposure cap 30 %; Live ratio 1 : 12 | Test owner / Proctoring admin | Proctoring · live today (exam app) |
| **C21 Integrations & developers** (P10, P11) | O: AI provider & feature toggles · PAN / bank verification switches per check type (on by default) · accounting connector · payout partner · biometric devices (with C09) · calendar sync · BGV partner · Teams / Slack mirrors · API keys · webhooks · OAuth apps · sandbox tenant | C01, C02 | YukthiX-managed AI; verification on; ⚑ AI features per P10 Q2 tiers | System Admin | All · per module wave |
| **C22 Billing & account** (future P14) | R: plan & products · billing contact · GST details for YukthiX invoices. O: add-ons (SMS overage, AI credits, storage, API limits, proctor hours, content packs, partner services) · SMS spend cap (YX-NTF-12) · AI-credit cap | C01 | Caps off until set | Account owner | All · wave 1 |

**Count:** 22 cards.

### 1.4 Channel set-up detail (C05)

| Channel | Default without set-up | Set-up checklist (in the card) |
|---|---|---|
| **Email domain** | YukthiX sending domain, sender name "‹Company› HR via YukthiX" (Workfox until D16 rename) | 1. Choose: YukthiX domain (done) · own verified domain · tenant SMTP (exam-app SMTP kept). 2. Own domain: add the SPF include, DKIM records and a DMARC policy shown on screen; **Verify** (DNS check, re-checked daily; failure alerts the System Admin and falls back to the YukthiX domain). 3. Sender name, reply-to. 4. Test send. Bounces update channel status (YX-NTF-11). |
| **WhatsApp** (P04 Q2) | **Inactive** until connected; key events use push / SMS / email meanwhile | 1. Meta Business account and **business verification** (off-system; marked done with a note, re-checked through the BSP). 2. **Embedded sign-up** through the YukthiX BSP: connect the WhatsApp Business account. 3. Register the phone number (not in use on the WhatsApp app) and get the **display name approved**. 4. **Template library auto-submitted** (all launch languages) under the company's account; per-template status approved / pending / rejected; a rejected template can be re-worded by request (P04 Q5). 5. **Opt-in capture** switched on: opt-in text (APX-G G-20) shown at app first run and in preferences; existing staff opt-ins imported (Excel, with source and date) — no business-initiated WhatsApp to a recipient without a recorded opt-in. 6. Choose the notification types that use WhatsApp (P04 Q1 defaults). 7. Test message to an admin. 8. Meta billing set in the company's own Meta account (not YukthiX). The card shows the messaging-limit tier reported by Meta. |
| **SMS / DLT** | YukthiX's DLT-registered sender header and templates; usage metered against the included quota (P04 Q3) | 1. Keep YukthiX sender (done) **or** use own DLT registration: principal-entity ID, sender header(s), content-template IDs mapped to each notification type and language; consent / service template category per TRAI rules. 2. Test SMS per template. 3. SMS spend cap (C22). OTP messages count towards quota (YX-NTF-13). |

### 1.5 Rules

| ID | Rule |
|---|---|
| YX-ORG-23 | **Setup hub.** Setup steps are registered in code per module with card, required / optional flag, dependencies, a computed completion check, the starter keys they apply and the editor they open; the hub shows one card per area for the products the tenant has switched on. Starter templates are applied when a product or wave is switched on, each labelled "YukthiX starter — edit for your company" and recorded in `starter_applications`; a starter flagged ⚑ stays "unreviewed" until a person keeps or edits it, and later YukthiX starter versions never overwrite a company value. |
| YX-ORG-24 | **Go-live readiness.** Each module has registered readiness checks, each **blocking** or **advisory** (§2). A module's employee-facing features (self-service requests, mobile invites, employee notifications for that module) are switched on for a legal entity only when all its blocking checks pass and the module owner has **signed off**; admins can configure and test before. Sign-off records the owner, time, readiness score and an acknowledgement note for every open advisory; it cannot be given while a blocking check fails. After go-live the checks keep running as health checks and a regression alerts the owner (P04 admin alert) without switching the module off. |
| YX-ORG-25 | **Every company policy has an editor.** Every setting key and policy record registered by a module declares its editor screen, Settings group, allowed scopes, `dated` flag and either a starter template or a P07 legal source; a CI check fails the build if a registered policy key has no editor route or no starter / legal source. Legal values (P07) are shown read-only with source and version and are never starters (spec D17). |

### 1.6 Quick start lanes (validation pass 3, S3)

The 22 cards and the go-live checks are right for payroll go-live but too slow for a trial. Each product the tenant switches on therefore gets a **quick start lane** at the top of the setup hub (the first-run landing page): three steps to the product's **first value** in about 5 minutes, using starter templates applied in one click (D17).
- **Not a card and not a shortcut to go-live.** Lane steps are ordinary registered setup steps (YX-ORG-23): finishing a lane step also completes the matching card step, and starters applied by the lane carry the starter badge and ⚑ flags as usual. A lane never marks a module `ready` or `live`; for payroll every §2 check still applies.
- **Trial limits apply** (P14 Q4): no live bank files, statutory filings, partner add-ons or bulk WhatsApp / SMS.
- **Demo data** (P15) can be loaded instead of real data at any step; the lane then says "Sample data" on every screen.
- The lane collapses once its first-value step is done and shows the next suggested card; it can be reopened from Help.

| Product | Lane steps (≈ 5 minutes) | Starters applied in one click | First value | Left to the full hub |
|---|---|---|---|---|
| **YukthiX Assess** | 1. Pick a test from the starter library (T01 library packs, e.g. "Customer support — English, 20 min") · 2. Check the default proctoring profile and result visibility · 3. **Send an invite** by email to one candidate or to yourself (candidate preview) | C20 default proctoring profile, consent texts per jurisdiction (G-08), retention defaults, result visibility = status only | First test invite sent | Reviewer pool (C20 R), own questions and tests, own email domain (C05), bulk invites, integrity review set-up |
| **YukthiX Hire** | 1. Company name and logo (C01 minimal) · 2. Create a job from a starter job template · 3. **Post the job to the careers page** and copy the link | Pipeline and scorecard starters (C19), careers page starter, candidate privacy notice (G-07) | First job posted to the careers page | Job boards, AI interview, BGV, offer template, staffing desk, hand-off to HR |
| **YukthiX HR** | 1. Company and one legal entity (C01 minimal: name, state) · 2. **Import employees from Excel** (starter sheet: name, employee code, email or mobile, joining date, department, designation, monthly CTC, work state) with the validation preview · 3. Apply the starter salary template and **see a payslip preview** for the imported employees | Department template, statutory defaults for the state (⚖️ P07), C11 component library and salary template starter, leave and attendance starters (C07 / C08) | First payslip preview | Registrations, legal options, pay calendar and cut-off, bank file, opening balances, parallel run, every §2 payroll check |

**Rules:** YX-GRO-01 (quick start lanes) and YX-GRO-02 (first value and activation) in P20.

---

## 2. Go-live readiness model

### 2.1 Model
- **Readiness check** (registered per module, like setup steps): key · module · entity-level or tenant-level · **blocking** or **advisory** · the query · plain-language message with a **Fix** link to the editor · owner role · the product wave it gates.
- **Readiness score** per module and entity = passed weight ÷ total weight × 100, with **blocking checks weighted 3 and advisory checks 1**. Shown on each hub card, on a *Go-live readiness* page (module × entity grid) and, after go-live, as a health widget on the admin home (T6).
- **Status per module × entity:** `setting_up` → `ready` (all blocking pass) → `signed_off` → `live`. Payroll adds `parallel_run` between `ready` and `signed_off` (M03 §8: the first pilot month runs side by side with the old system and its variance report is part of the sign-off).
- **Sign-off** (YX-ORG-24): by the module owner named below; one record per module × entity with score snapshot, open advisories and acknowledgement notes. Re-sign-off is required only when a module is switched on for an additional entity.
- **Data:** `readiness_checks` (registry, code), `readiness_results` (tenant × entity × check: pass / fail / n.a., last run, detail), `module_golive` (module × entity: status, signed_off_by, signed_off_at, score, acknowledgements jsonb). RLS as usual.
- **Feeds the implementation playbook (future P15, GAP A5):** the playbook's go-live checklist, UAT / pilot exit criteria and sandbox "promote configuration" read these checks, scores and sign-offs through the API (P11); P15 adds implementation tasks, not a second checklist.

### 2.2 Readiness checks

| Module (owner) | Check | Blocking / advisory | Source |
|---|---|---|---|
| Organisation (System Admin) | Every legal entity has PAN, TAN, FY start and default flag set; exactly one default | Blocking | YX-ORG-01 |
| Organisation | Every location has state and time zone | Blocking | YX-ORG-02 |
| Organisation | Every active employment has an assignment covering today with location, department, designation, grade and employment type | Blocking | YX-ORG-07 |
| Organisation | Every active employee except the top of the tree has a manager | Advisory | YX-ORG-09 |
| Organisation | Employee-code pattern set; no duplicate codes in scope | Blocking | YX-ORG-16 |
| Organisation | Cost centres exist and each assignment has 100 % allocation | Advisory (blocking for payroll accounting export) | Q8, P10 Q7 |
| Roles (System Admin) | At least two System Admins | Advisory | P02 |
| Roles | Payroll Admin and Finance approver are different people, or single-admin self-approval acknowledged | Advisory | P02 Q6, YX-PAY-07 |
| Roles | No unacknowledged role risk warnings | Advisory | YX-SEC-18 |
| Privacy (System Admin) | Employee privacy notice published in every language used by the entity's employees | Blocking (for employee invites) | P02 §6, APX-G G-06 |
| Privacy | Retention schedule confirmed (no data class left on "not set") | Advisory | P05 §4.7, B12 |
| Approvals (HR Admin) | Every enabled request type has an active policy that passed Simulate | Blocking | YX-WF-16 |
| Approvals | No approver coverage gap (a resolver that returns nobody for some employees) | Blocking | YX-SEC-18 (c) |
| Approvals | ⚑ Starter policies reviewed | Advisory | YX-ORG-23 |
| Notifications (System Admin) | Employees without a work email have at least one external channel (push, WhatsApp or SMS) | Advisory | P04 Q1 |
| Notifications | Own email domain (if chosen) verified | Blocking | P04 §4.4 |
| Notifications | WhatsApp (if enabled) connected, templates for enabled types approved, opt-in capture on | Blocking (for WhatsApp use only) | P04 Q2, YX-NTF-07, APX-G G-20 |
| Documents (HR Admin) | Letterhead and at least one active signatory per entity | Blocking (for letters) | P05 §4.3 |
| Documents | Reference prefixes set for every letter type in use | Blocking | YX-DOC-09 |
| Documents | Company DSC valid and not expiring within 30 days (entities issuing Form 16 / DSC letters) | Blocking for Form 16; advisory otherwise | P05 Q2 |
| Documents | Every active template passed placeholder validation and sample preview | Blocking | YX-DOC-15 |
| Documents | ⚑ Starter letters in use reviewed | Advisory | APX-F YX-DOC-20 |
| Leave (HR Admin) | Every active employee has a leave-policy assignment | Blocking | M02 §A2 |
| Leave | Every location has a holiday calendar for the current leave year | Blocking | L2 |
| Leave | Opening balances loaded or confirmed zero | Blocking | M02 adjustments |
| Leave | Next year's calendars published before the year starts | Advisory (from 1 Dec) | M02 §A2 |
| Leave | ⚑ Starter leave types and policies reviewed | Blocking | D17, YX-ORG-23 |
| Time (HR Admin) | Every active employee resolves to an attendance mode | Blocking | YX-AT-09 |
| Time | Every Punch-mode employee resolves to a shift and a weekly-off rule | Blocking | YX-AT-02 |
| Time | Every location with restricted Punch staff has a geofence or IP range | Blocking | YX-AT-01, M02 Q6 |
| Time | Attendance cut-off day set per entity (else "freeze at payroll start" acknowledged) | Advisory | P08 Q2 |
| Time | Every biometric device / kiosk mapped and heartbeat green | Blocking (when devices used) | P10 Q4, M04 Q4 |
| Time | ⚑ Attendance mode and block / warn switch reviewed | Blocking | D1 |
| Mobile (HR Admin) | Device-binding policy chosen; invites sent to ≥ *80 %* of employees | Advisory | M04 Q3 |
| Payroll (Payroll Admin + Finance approver) | PF / ESI / PT / LWF registrations exist wherever an employee's statutory flags need them | Blocking | M03 §4 |
| Payroll | Legal options set per entity | Blocking | YX-STAT-06 |
| Payroll | Every active employee is in a pay group with an active compensation | Blocking | M03 §3 |
| Payroll | Salary templates validated (dependency order, test run) | Blocking | YX-PAY-01 |
| Payroll | Salary bank accounts verified (or cash / cheque mode approved) | Blocking | YX-DOC-17, YX-PAY-31 |
| Payroll | PAN verified; UAN / ESI IP present for eligible employees | Advisory (warnings in pre-run) | YX-PAY-05, YX-TAX-10 |
| Payroll | Bank file format and filing mode set per entity | Blocking | M03 Q6 / Q7 |
| Payroll | Opening YTD / Form 12B loaded for mid-FY go-live | Blocking | M03 §8 |
| Payroll | Minimum-wage check passes | Advisory | YX-PAY-22 |
| Payroll | Accounting ledger mapping complete | Advisory | P10 Q7 |
| Payroll | ⚑ Payroll settings and payslip layout reviewed | Blocking | D17 |
| Payroll | Parallel-run variance report signed off | Blocking | M03 §8 |
| Lifecycle (HR Admin) | Onboarding and offboarding journey templates active per entity | Blocking | YX-LC-02 |
| Lifecycle | Notice and probation policies resolve for every employee | Blocking | YX-LC-01, YX-LC-04 |
| Lifecycle | ⚑ Absconding, contract-end, retirement, rehire, open-case-hold starters reviewed | Advisory | YX-LC-25 |
| Lifecycle | F&F, relieving and experience letters active | Blocking | APX-F |
| POSH (HR Admin + IC presiding officer) | Valid IC for every workplace at or above the P07 threshold | **Blocking (law)** | YX-POSH-01 |
| POSH | IC display notice issued; POSH policy published | Advisory | M08, APX-F |
| Expenses (Finance approver) | Every category has an accounting head; every grade has a policy | Blocking | M05 §4 |
| Expenses | Payment route set | Blocking | M05 Q2 |
| Performance (HR Admin) | The first cycle has a validated template and a frozen scale | Blocking (at cycle launch) | M06 PF-D7, Q3 |
| Learning (L&D Admin) | Mandatory-course assignment rules active | Advisory | M07 Q3 |
| Helpdesk (HR Admin) | Every category routes to a queue with at least one agent and a business-hours calendar | Blocking | YX-HD-01 |
| Helpdesk | Ethics officer designated (whistleblower enabled) | Blocking | M08 Q8 |
| Engage (HR Admin) | Company values defined | Blocking (for kudos) | YX-ENG-06 |
| ATS (Recruiting lead) | Pipeline, scorecard and offer templates active; candidate privacy notice published | Blocking | M10, APX-G G-07 |
| ATS | Hand-off mode set per entity (with HRMS) | Blocking | M10 Q2 |
| Staffing (Finance approver) | Invoice series per entity / GSTIN; GST invoice and credit-note templates valid | Blocking | M10 Q7, APX-F YX-DOC-22 |
| Proctoring (Test owner) | Consent texts reviewed for every jurisdiction the tenant tests in | **Blocking (law)** | YX-EVAL-09, G-08 |
| Proctoring | Incident reviewer pool non-empty and assignment policy set | Blocking | YX-EVAL-15 |
| Proctoring | Proctor pool sized for Live slots in the next 14 days | Advisory | T04 Q8 |
| Integrations (System Admin) | Every connected integration health green | Advisory | P10 §7 |
| Integrations | API keys have an expiry and an owner | Advisory | YX-SEC-22 |
| Integrations | Jobs & errors page (APX-D PLT-38) has no failed item older than 24 hours without a retry or a skip decision | Advisory | G6 (market analysis §4), P10 YX-INT-10 |
| Policies & rules (module policy owners) | Starter rules reviewed: every ⚑ starter rule at a policy point that affects pay, leave or employee-facing results is kept or edited (starter badge cleared) | Advisory | YX-RULE-01, YX-ORG-23 |

**Count:** 69 checks (46 blocking, 23 advisory; a conditional check is counted under its first-named case; the Jobs & errors check was added 26 Sep 2026, market analysis G6).

---

## 3. Admin editor inventory (G2–G5)

Columns: **Configurable item** · **Owning doc / rule** · **Editor screen** · **Settings group** · **Scope** · **Dated?** · **Starter template** · **Bulk import** (Excel = XLSX / CSV with validation preview; ZIP = files named by code; — = no import).

### 3.1 Organisation & platform (P01, P02, P03, P08, P09)

| # | Configurable item | Owning doc / rule | Editor screen | Settings group | Scope | Dated? | Starter template | Bulk import |
|---|---|---|---|---|---|---|---|---|
| 1 | Legal entities & identifiers | P01 §4.1, YX-ORG-01 | Entity workspace | Organisation | T | — | — | Excel |
| 2 | Locations, state, time zone, geofence | P01 §4.2, YX-ORG-02 | Location workspace with **map editor** (shared with #54) | Organisation | E | — | — | Excel (incl. lat / lng / radius) |
| 3 | Departments tree | P01 §4.3, YX-ORG-03 | Department tree editor | Organisation | T · E (ownership) | — | Department template | Excel |
| 4 | Designations, grades | P01 §4.3 | Masters list (T2) | Organisation | T · E | — | — | Excel |
| 5 | Grade pay ranges | P01 §4.3 | Grade workspace › Pay ranges | Organisation | E × G | dated | — | Excel |
| 6 | Cost centres | P01 §4.3, Q8 | Cost-centre tree | Organisation | E | — | — | Excel |
| 7 | Employment types & statutory default matrix | P01 YX-ORG-20 | Employment types › Statutory matrix | Organisation | T · E | dated | ⚖️ P07 defaults; override only where law allows | — |
| 8 | Employee-code pattern & scope | P01 YX-ORG-16 | Organisation › Employee codes | Organisation | T · E | — | *Per entity, `{PREFIX}{NNNN}`* | — |
| 9 | Transfer defaults (5 options) | P01 YX-ORG-17 | Organisation › Transfers | Organisation | T · E | — | *Carry leave · continue service · keep code · no F&F · keep structure* | — |
| 10 | Branding & white-label | P11 Q7 | Organisation › Branding | Organisation | T · E | — | YukthiX default theme | — |
| 11 | Setup hub & readiness | This appendix, YX-ORG-23/24 | Setup hub · Go-live readiness | Organisation | T · E | — | Card starters (§1.3) | — |
| 12 | Roles & role templates | P02 §4.2, YX-SEC-18 | Roles & access › Role workspace | People & Access | T | versioned | Shipped role templates | — |
| 13 | Role grants / admin users | P02 §7 | User access tab | People & Access | T (grant scopes) | dated (validity) | — | Excel |
| 14 | Directory fields | P02 Q4, YX-SEC-17 | People & Access › Directory | People & Access | T · E | — | P02 Q4 preset | — |
| 15 | Small-group suppression threshold | P02 YX-SEC-14, P09 Q2 | People & Access › Privacy › Analytics | People & Access | T | — | 5 (range 3–10) | — |
| 16 | Employee privacy notice (+ external-login notices) | P02 §6, APX-G G-06 / G-09 | Privacy › Notices (per language) | People & Access | T · E | versioned | APX-G template ⚑ | — |
| 17 | Optional-data consents & purposes | P02 §6 | Privacy › Consents | People & Access | T | versioned | Off | — |
| 18 | Retention schedule per data class | P02 §6, P05 §4.7, B12 | Privacy › Retention schedule | People & Access | T | versioned | Legal floors ⚖️; company periods starter | — |
| 19 | "Who accessed my data" | P08 Q6 | Privacy › Transparency | People & Access | T | — | On | — |
| 20 | Raise on behalf: roles & request types | P02 YX-SEC-27, P03 YX-WF-18 | Approvals › Proxy requests | People & Access | T · E | — | *HR only* ⚑ | — |
| 21 | Support-access defaults | P02 YX-SEC-20 | Privacy › Support access | People & Access | T | — | 24 h window, masked | — |
| 22 | Approval policies per request type | P03 §4, YX-WF-16 | Approvals › Policy editor (conditions, steps, Simulate) | People & Access | T (conditions on E / L / D / G / Dg / ET) | versioned | Starter policy per request type ⚑ | — |
| 23 | SLA, reminders, escalation, auto-action | P03 Q2 | Policy editor › Step cards | People & Access | rec: per policy step | versioned | Remind 50 % / 100 %, escalate to manager; no auto-action | — |
| 24 | Out-of-app approval links | P03 Q4 | Approvals › Channels | People & Access | T | — | On for low-risk types | — |
| 25 | Duplicate-approver auto-approve | P03 Q6 | Policy editor | People & Access | rec: per policy | versioned | On | — |
| 26 | Request-type risk level (raise only) | P03 Q4 | Approvals › Request types | People & Access | T | — | Registry default | — |
| 27 | Custom fields | M01 §3.1, YX-EMP-03 | People & Access › Custom fields | People & Access | T · E | — | — | — |
| 28 | Attendance cut-off day | P08 Q2 | Time › Payroll cut-off | Time & Leave | E | dated | Freeze at payroll start | — |
| 29 | Maximum lateness for late requests | P08 Q4 | Time › Late requests | Time & Leave | T · E | dated | *60 days* | — |
| 30 | Audit retention extension | P08 Q7 | Privacy › Audit | People & Access | T | — | 8 years (never shorter) | — |
| 31 | Attrition population (contractors / interns in main figure) | P09 Q1 | Analytics › Metric settings | Organisation | T | — | Permanent + probation only | — |
| 32 | Dashboard-builder grants | P09 Q4 | Analytics › Permissions | Organisation | T | — | HR / Payroll / System Admin, dept heads | — |
| 33 | Tenant calculated metrics | P09 Q5, YX-MET-11 | Analytics › Formula builder | Organisation | T | versioned | — | — |
| 34 | Scheduled reports & delivery | P09 Q7 | Analytics › Schedules | Organisation | rec: per schedule | — | — | — |

### 3.2 Documents & communication (P04, P05, M08 policies, M09)

| # | Configurable item | Owning doc / rule | Editor screen | Settings group | Scope | Dated? | Starter template | Bulk import |
|---|---|---|---|---|---|---|---|---|
| 35 | Channel accounts: email domain, WhatsApp, SMS / DLT | P04 §4.4, Q2 | Notifications › Channels (checklists §1.4) | Documents & Communication | T | — | YukthiX domain & SMS sender; WhatsApp inactive | — |
| 36 | Default channels per employment type / location | P04 Q1 | Notifications › Defaults | Documents & Communication | T · L · ET | — | P04 Q1 defaults ⚑ | — |
| 37 | Quiet hours (tenant default) | P04 Q7, YX-NTF-06 | Notifications › Quiet hours | Documents & Communication | T · L | — | 9 pm–8 am | — |
| 38 | Email / in-app template wording | P04 Q5 | Notifications › Template editor (variables, preview, test send) | Documents & Communication | T · language | versioned | APX-A library | — |
| 39 | WhatsApp / SMS template choice & re-wording requests | P04 Q5, YX-NTF-07 | Notifications › Approved templates | Documents & Communication | T · language | versioned | YukthiX pre-approved set | — |
| 40 | WhatsApp / SMS opt-in records | P04, APX-G G-20 | Notifications › Opt-ins | Documents & Communication | Emp | — | Opt-in text (G-20) | Excel (source, date) |
| 41 | Document-type registry | P05 §4.2, YX-DOC-04 | Documents › Document types | Documents & Communication | T | versioned | System types (PAN, Aadhaar, bank proof, medical certificate…) | — |
| 42 | Verification requirement per type & auto-verification switch | P05 Q7, P10 Q6, YX-DOC-17 | Document types › Verification | Documents & Communication | T | — | PAN, Aadhaar, bank, education, experience verified; partner checks on | — |
| 43 | Signatories & DSC | P05 §5 `signatories`, Q2 | Documents › Signatories & DSC | Documents & Communication | E | — | — | — |
| 44 | Letterheads | P05 §4.3 | Documents › Letterheads (per entity, per language) | Documents & Communication | E | versioned | *YukthiX plain letterhead with entity name / address / CIN* | — |
| 45 | Reference-number prefixes | P05 YX-DOC-09 | Documents › Reference numbers | Documents & Communication | E × letter type | — | *`{ENTITY}/HR/{YYYY}/{NNNN}`* ⚑ | — |
| 46 | Letter & document templates | P05 §4.3, APX-F | Documents › Templates (upload Word / in-app editor) | Documents & Communication | T · E · language | versioned | APX-F library ⚑ | ZIP (.docx per type) |
| 47 | Approval before issue, per letter type | P05 Q4, YX-DOC-10 | Templates › Issue settings | Documents & Communication | T · E | — | P05 Q4 defaults | — |
| 48 | QR verification per letter type | P05 Q5, YX-DOC-11 | Templates › Issue settings | Documents & Communication | T | — | On (restricted-area letters generic label, APX-F YX-DOC-21) | — |
| 49 | Self-service certificate types | P05 Q8 | Templates › Self-service | Documents & Communication | T · E | — | Instant: salary certificate, address proof, employment verification, NOC | — |
| 50 | Policy library (audience, critical / OTP, re-acknowledge, quiz) | M08 Q6, YX-POL-01/02 | Policies › Library | Documents & Communication | rec: audience E / L / D / Dg | versioned | Starter policies ⚑ (code of conduct, POSH, leave, IT use) | ZIP (existing policies) |
| 51 | Engage spaces & posting policies | M09 Q1, YX-ENG-02 | Engage › Spaces | Documents & Communication | rec: per space | — | Org spaces auto; company space = announcers + approval | — |
| 52 | Moderation: blocked words, report threshold, pre-approval, AI check | M09 Q2, YX-ENG-03 | Engage › Moderation | Documents & Communication | T · language | — | EN / HI / TA / TE lists; 3 reports; post-moderation | Excel (word lists) |
| 53 | Values, badges, rewards (mode, budgets, point value, threshold, partner), celebrations, survey templates & cadence | M09 Q4 / Q5 / Q8, YX-ENG-06/07/08 | Engage › Recognition · Celebrations · Surveys | Documents & Communication | T · E | — | Values & badges; badges only; celebrations on; pulse monthly, eNPS quarterly, engagement yearly | Excel (reward catalogue) |

### 3.3 Time & leave (M02, M04 kiosk & devices)

| # | Configurable item | Owning doc / rule | Editor screen | Settings group | Scope | Dated? | Starter template | Bulk import |
|---|---|---|---|---|---|---|---|---|
| 54 | **Check-in rules per location / group** (restricted / field, multiple allowed locations, **geofence drawn on a map**, IP / Wi-Fi ranges) | M02 Q6, YX-AT-01 | Time › Check-in rules with **map editor** (draw circle / polygon, radius, test-a-point, list of allowed sites) | Time & Leave | L · D · ET · Emp | dated | Restricted for office locations; *radius 200 m* | Excel (sites, lat / lng, radius, IP ranges) |
| 55 | Attendance mode + missing-punch effect (D1) | M02 §B3, YX-AT-09, P01 §4.6 | Time › Attendance modes | Time & Leave | E · L · D · ET | dated | Punch, block ⚑ | — |
| 56 | Shifts (times, break rule, grace, thresholds, flexi / core, split, night) | M02 §B2, Q3 | Time › Shifts | Time & Leave | rec: per shift (limited to E / L) | versioned | General shift ⚑ | Excel |
| 57 | Shift patterns / rotations | M02 Q2 | Time › Shift patterns (cycle designer, 60-day preview) | Time & Leave | rec; assigned to Emp / groups (dated fact) | dated (assignment) | *Weekly repeat; 4 on / 2 off sample* | Excel (assignments) |
| 58 | **Weekly-off rules & precedence** (employee > pattern / roster > location; alternate Saturdays, nth weekday) | M02 Q1, YX-AT-02 | Time › Weekly offs (rule builder + calendar preview; precedence shown per employee) | Time & Leave | L · Emp (override) · rec: pattern | dated | Sunday at location level | Excel (employee overrides) |
| 59 | Roster (publish, swaps) | M02 §B2, YX-AT-07 | Time › Roster (§4) | Time & Leave | D / team (see §4) | — | — | Excel (roster upload) |
| 60 | **Late-penalty policy** | M02 Q4, YX-AT-05 | Time › Late penalty | Time & Leave | E · L · D · ET | dated | Off; ready policy 3 free / ½ day per 3 more, CL first | — |
| 61 | **Regularisation limits** & look-back | M02 Q5, YX-AT-06 | Time › Requests › Regularisation | Time & Leave | E · ET | dated | 4 / month; look-back = open payroll period | — |
| 62 | WFH / on-duty monthly limits | M02 §B4, YX-AT-06 | Time › Requests › WFH & on-duty | Time & Leave | E · D · ET · G | dated | *WFH 4 / month; on-duty unlimited* | — |
| 63 | OT policy (minimum, rounding, approval, comp-off option, rate categories) | M02 Q7, YX-AT-04 | Shift › OT policy | Time & Leave | rec: per shift | versioned | 30 min, round down 15 min, after-the-fact; caps ⚖️ P07 | — |
| 64 | Timesheet settings (projects, approver resolver) | M02 §B7 | Time › Timesheets | Time & Leave | E · D | — | PM resolver; client contact for placements | Excel (projects) |
| 65 | Settings › Time (cut-off #28, max lateness #29, device binding #78, session length #79) | G2 | Time › General | Time & Leave | E | dated where noted | as rows | — |
| 66 | Leave year | M02 L1 | Leave › Leave year | Time & Leave | E | dated | Financial year (April) | — |
| 67 | **Leave types** (9 sections: basics, eligibility, crediting, counting, rules, year end, statutory, long absence, notice period) | M02 §A2, YX-LV-02/03/05/11/12 | Leave › Leave types (sectioned editor, live example) | Time & Leave | rec: per type (eligibility on ET / G / L / gender) | versioned | Starter set ⚑; maternity ⚖️ IN.LEAVE | — |
| 68 | **Leave-policy bundles & assignment rules** | M02 §A2 | Leave › Policies (bundle editor + rule list + "who gets this" preview) | Time & Leave | E · L · G · ET · Emp override | dated (assignment is a P06 fact) | Per grade band ⚑ | Excel (employee overrides) |
| 69 | Holiday calendars (state templates, optional N of M, holiday on weekly off, transfer prorate / reset) | M02 §A2, YX-AT-11, YX-LV-13 | Leave › Holiday calendars (clone to next year) | Time & Leave | rec: per calendar → L; Emp override | — | State festival templates; holiday on weekly off = none; optional holidays prorated | Excel |
| 70 | Comp-off rules (auto-credit, expiry window, approval) | M02 §A2, YX-LV-06 | Leave › Comp-off | Time & Leave | E · ET | dated | *Expire in 60 days; manager approval* | — |
| 71 | Maternity company settings (crèche, post-maternity WFH, top-up) | M02 YX-LV-10, M03 YX-PAY-26 | Leave › Maternity (statutory values read-only) | Time & Leave | E | dated | Top-up off; crèche compliance check ⚖️ at 50+ | — |
| 72 | Opening balances & adjustments | M02 §A2 | Leave › Adjust balance (reason required) | Time & Leave | Emp | — | — | Excel |
| 73 | Kiosk registration & heartbeat | M04 Q4 | Devices › Kiosks (register, heartbeat, last punch) | Time & Leave | L | — | Auto-logout 30 s | — |
| 74 | Kiosk PIN / ID-card QR policy | M04 Q4 | Devices › Kiosks › Sign-in policy | Time & Leave | E · L | — | *Code + 4-digit PIN; QR + PIN off* | Excel (PIN reset list) |
| 75 | Biometric devices & enrolment mapping | P10 Q4 | Integrations › Devices (mapping screen) | Time & Leave | L | — | — | Excel (enrolment-ID ↔ employee) |
| 76 | Device-bind queue | M04 Q3, YX-MOB-08 | Devices › Bind requests (P03 queue) | Time & Leave | E | — | — | — |
| 77 | HR remote sign-out | M04 YX-MOB-09 | Employee workspace › Devices | Time & Leave | Emp | — | — | — |
| 78 | Device-binding policy | M04 Q3 | Time › General › Device binding | Time & Leave | E · L · ET · Emp exempt | — | On for restricted mode, field exempt | — |
| 79 | Session length & re-auth | M04 Q8 | People & Access › Sessions | People & Access | T · ET | — | 30 days; re-auth 15 min idle | — |

### 3.4 Lifecycle (M01)

| # | Configurable item | Owning doc / rule | Editor screen | Settings group | Scope | Dated? | Starter template | Bulk import |
|---|---|---|---|---|---|---|---|---|
| 80 | **Journey / checklist templates** (onboarding, offboarding, return-to-work, custom; owners, ± offsets, dependencies, SLA) | M01 §3.5, YX-LC-02/22 | Lifecycle › Journey builder | People & Access | E · D · Dg (template scope) | versioned | Default onboarding (incl. UAN, ESIC IP, Form 11 / 2) and offboarding (EPFO / ESIC exit, Form L) ⚑ | Excel (tasks) |
| 81 | Pre-boarding checklist | M01 Q2 | Lifecycle › Pre-boarding portal | People & Access | E · D · Dg | versioned | M01 Q2 default | — |
| 82 | **Probation policy** | M01 Q3, YX-LC-01 | Lifecycle › Probation | People & Access | ET · G | dated | 6 months; review 15 days; extend max 12 months; no auto-confirm | — |
| 83 | **Notice policy** (incl. early release / buy-out approvals) | M01 Q6, YX-LC-04 | Lifecycle › Notice | People & Access | G · ET · confirmation status | dated | *30 days probation / 60 days confirmed* ⚑ | — |
| 84 | Change types (facts, approval, letter, effective-date rules) & mid-period method | M01 §3.3, P06 Q6 YX-HIS-13 | Lifecycle › Change types | People & Access | T · per change type (component for pay) | versioned | Segments (default) | — |
| 85 | **Rehire policy** | M01 YX-LC-18, P01 YX-ORG-19 | Lifecycle › Rehire | People & Access | T · E | dated | Fresh start, same record / code / UAN ⚑ | — |
| 86 | **Asset categories** | M01 §3.6 | Lifecycle › Assets › Categories | People & Access | T | — | *Laptop, phone, SIM, ID / access card, vehicle, tools* | Excel (assets) |
| 87 | **Death-in-service support policy** | M01 YX-LC-16 | Lifecycle › Exit policies › Death support | People & Access | E | dated | All items off / blank with guidance | — |
| 88 | **Absconding timeline** | M01 YX-LC-17 | Lifecycle › Exit policies › Absconding (step editor) | People & Access | E · ET | dated | Day 3 hold · 7 notice 1 · 14 notice 2 · 21 deemed abandonment ⚑ | — |
| 89 | **Contract-end policy** | M01 YX-LC-19 | Lifecycle › Exit policies › Contract end | People & Access | ET | dated | Alert 30 & 7 days; no auto-exit ⚑ | — |
| 90 | **Retirement policy** | M01 YX-LC-20 | Lifecycle › Exit policies › Retirement | People & Access | ET · G | dated | 58, end of month; alerts 6 / 3 / 1 months ⚑ | — |
| 91 | **Sabbatical policy** | M01 YX-EMP-06 | Lifecycle › Absence › Sabbatical | People & Access | E · G | dated | *Min 3 years' service, max 6 months, unpaid* | — |
| 92 | Open-case hold policy | M01 YX-LC-23 | Lifecycle › Exit policies › Open cases | People & Access | E | dated | Hold letters and F&F, HR may release | — |
| 93 | Exit settings (deprovisioning T+N, exit-interview questionnaire, exit reasons) | M01 §3.7, YX-LC-14/15 | Lifecycle › Exit settings | People & Access | T · E | — | T+N 30 days; exit survey template | — |
| 94 | Settings › Lifecycle: F&F deadline display, retro-correction limit | M01 §3.8, P06 Q5 YX-HIS-12 | Lifecycle › General | People & Access | E | dated | F&F deadline ⚖️ (to verify, M01 Q7); retro limit = start of FY | — |

### 3.5 Payroll, statutory & expenses (M03, P07, M05)

| # | Configurable item | Owning doc / rule | Editor screen | Settings group | Scope | Dated? | Starter template | Bulk import |
|---|---|---|---|---|---|---|---|---|
| 95 | Statutory registrations | M03 §4 | Payroll › Registrations | Payroll & Statutory | E × statute × state | dated | — | — |
| 96 | Legal options per entity | P07 Q1, YX-STAT-06 | Payroll › Legal options (source links) | Payroll & Statutory | E | dated | ⚖️ options only (no starter beyond P07 default option) | — |
| 97 | Statutory rules browser | P07 §7 | Payroll › Statutory rules (read-only) | Payroll & Statutory | E · L | versioned | ⚖️ | — |
| 98 | **Component library** (flags: taxable, PF / ESI / PT / gratuity / bonus wage, 50 % test, prorated, on payslip) | M03 §3, YX-PAY-17 | Payroll › Components | Payroll & Statutory | T · E | versioned | India standard components ⚑ | Excel |
| 99 | Salary templates (CTC-first, formula editor, live test employee) | M03 §7, YX-PAY-01 | Payroll › Template builder | Payroll & Statutory | E · G · Dg | versioned | India standard CTC template ⚑ | — |
| 100 | **Pay groups** & pay calendars | M03 §3 | Payroll › Pay groups | Payroll & Statutory | E | dated | Monthly, cut-off per P08 | Excel (members) |
| 101 | Compensation load & revisions | M03 §6.2 | Employee › Compensation; bulk revision wizard | Payroll & Statutory | Emp | dated | — | Excel |
| 102 | **Loan types** (advance / loan, limits, EMIs, interest, eligibility) | M03 Q4 | Payroll › Loan types | Payroll & Statutory | E · G · ET | dated | *Salary advance ≤ 1 month's net, 3 EMIs, interest-free* | — |
| 103 | **Bonus policy** (statutory method per entity; company bonus / incentive schemes) | M03 Q8, YX-PAY-16 | Payroll › Bonus | Payroll & Statutory | E | dated | Annual with monthly provision; statutory % ⚖️ | — |
| 104 | **One-time pay types** | M03 §3 | Payroll › One-time pay types | Payroll & Statutory | T · E | — | Bonus, incentive, arrear, recovery, reimbursement, referral, joining bonus, ex-gratia | — |
| 105 | **Month-end inputs** (LOP for Assumed-present groups, one-time pay, arrears, recoveries) | M03 §6.3, G4 | Run workspace › Inputs | Payroll & Statutory | PG · Emp | — | — | **Excel** (row validation, reason per row) |
| 106 | **Payslip layout** (U33) | M03 YX-PAY-12, APX-F | Payroll › Payslip layout editor | Payroll & Statutory | E · PG | versioned | APX-F payslip layout ⚑ | — |
| 107 | **HR proof-verification queue** (declaration / proof windows, line-by-line verification) | M03 Q5, YX-TAX-05 | Payroll › Tax › Proof verification (T2 queue, per-line approve / reject / partial) | Payroll & Statutory | E | — | — | ZIP (proofs) |
| 108 | **Payroll settings** (day basis, variance threshold, protected net, declaration / proof windows, regime cut-off) | M03 YX-PAY-02/06/11, YX-TAX-01, G4 | Payroll › General | Payroll & Statutory | E · PG | **dated** (YX-ORG-18) | Calendar days; ±10 %; *50 %*; FY start / Jan–Feb; *30 April* ⚑ | — |
| 109 | **Payment modes** (cash / cheque enable, reasons) | M03 YX-PAY-31 | Payroll › Payment modes | Payroll & Statutory | E · Emp | dated | Bank only | Excel (per employee) |
| 110 | **Deduction / recovery order** | M03 YX-PAY-11, YX-PAY-32 | Payroll › Recovery order (statutory and court attachment fixed first ⚖️; company orders the rest) | Payroll & Statutory | E | dated | Loans → advances → carry-forward → other | — |
| 111 | Salary-hold reasons & auto-hold triggers | M03 YX-PAY-28 | Payroll › Holds | Payroll & Statutory | E | — | Six reason codes; triggers on | — |
| 112 | Overpayment recovery defaults | M03 YX-PAY-30 | Payroll › Recoveries | Payroll & Statutory | E | — | *Up to 6 instalments, consent required* | — |
| 113 | Bank file formats | M03 §6.1, P10 Q5 | Payroll › Bank files | Payroll & Statutory | E | — | HDFC / ICICI / SBI / Axis / Kotak / generic | — |
| 114 | Accounting ledger & cost-centre mapping | P10 Q7 | Integrations › Accounting mapping | Payroll & Statutory | E | versioned | — | Excel |
| 115 | Filing mode per statute | M03 Q6 / Q7 | Payroll › Statutory filing | Payroll & Statutory | E × statute | dated | Self-file | — |
| 116 | Opening balances & YTD / Form 12B | M03 §6.1, §8 | Payroll › Opening balances | Payroll & Statutory | Emp | — | — | Excel |
| 117 | Expense categories | M05 §3 | Expenses › Categories | Payroll & Statutory | T | — | Travel, lodging, meals, conveyance, mileage, per diem, phone / internet, entertainment, other | Excel |
| 118 | Expense-policy matrix (category × grade × tier limits per line / day / trip / month, receipt threshold, justification) | M05 Q1, YX-EXP-01 | Expenses › Policy matrix | Payroll & Statutory | E · G · Dg | dated | Templates by grade band × tier ⚑; receipt above ₹500 | Excel |
| 119 | **City tiers** | M05 §4 | Expenses › City tiers | Payroll & Statutory | T | — | Tier 1 / 2 / 3 + international list | Excel |
| 120 | **Mileage rates** | M05 §4 | Expenses › Mileage | Payroll & Statutory | E | dated | *Two-wheeler / car rates* ⚑ | Excel |
| 121 | **Per-diem rates** | M05 §4 | Expenses › Per diem | Payroll & Statutory | E · G | dated | *By tier / country* ⚑ | Excel |
| 122 | **Advance rules** (settlement window, recovery instalments) | M05 Q6, YX-EXP-09 | Expenses › Advances | Payroll & Statutory | E | dated | 30 days; up to 3 instalments | — |
| 123 | Over-limit handling & payment route & GST capture | M05 Q2 / Q5 / Q7 | Expenses › Rules | Payroll & Statutory | T · per category | — | Extra approval; payroll route; GST off | — |

### 3.6 Performance, learning, helpdesk & cases (M06, M07, M08)

| # | Configurable item | Owning doc / rule | Editor screen | Settings group | Scope | Dated? | Starter template | Bulk import |
|---|---|---|---|---|---|---|---|---|
| 124 | **Review templates** (sections, weights, final-score formula) | M06 §3, PF-D7 | Performance › Template builder | People & Access | rec: per cycle | versioned | Annual, half-yearly, probation, OKR quarterly | — |
| 125 | **Rating scales** & bands | M06 Q3, YX-PERF-07 | Performance › Rating scales | People & Access | rec: per cycle (frozen at launch) | versioned | 1–5 labelled | — |
| 126 | **Competency library** & levels, designation map | M06 Q8 | Performance › Competencies | People & Access | T · Dg | versioned | Core / functional / leadership library ⚑ | Excel |
| 127 | Cycle stages, 360° rules, anonymity, calibration guide | M06 Q2 / Q4 / Q5 | Performance › Cycle set-up | People & Access | rec: per cycle | versioned | M06 Q2 default stages; ≥ 3 anonymity | — |
| 128 | Comp matrix & budgets | M06 Q6, YX-PERF-10 | Performance › Comp review set-up | People & Access | E · D | versioned | *Band × compa-ratio ranges* ⚑ | Excel |
| 129 | PIP templates | M06 Q7 | Performance › PIP templates | People & Access | T | versioned | 30 / 60 / 90 days | — |
| 130 | **Assignment (compliance) rules** | M07 Q3, YX-LRN-04 | Learning › Assignment rules | People & Access | E · L · D · Dg · joiner / role change | versioned | Mandatory-course rules ⚑ | — |
| 131 | **Training budgets** | M07 Q5, YX-LRN-07 | Learning › Budgets | People & Access | D × FY | dated | Warn | Excel |
| 132 | **Bond terms** | M07 Q5 | Learning › Bonds | People & Access | E · per course above cost | versioned | *Above ₹50,000: 12 months, pro-rata* | — |
| 133 | **Trainer master** (internal / external, access window) | M07 Q6 | Learning › Trainers | People & Access | T | — | External access ends *7 days* after last session | Excel |
| 134 | Completion threshold, effectiveness delay, certificate templates & validity | M07 Q7 / Q8, YX-LRN-02/05 | Learning › Course settings | People & Access | rec: per course | versioned | 75 %; 60 days; renewal 30 days before expiry | — |
| 135 | **Helpdesk queues** (agents, lead, business hours) | M08 Q1, YX-HD-01 | Helpdesk › Queues | People & Access | E · L | — | HR, Payroll, IT, Admin, Finance ⚑ | Excel (agents) |
| 136 | Categories & SLA by priority, sensitive flag, macros, email-to-ticket | M08 Q1 / Q2, YX-HD-02/03 | Helpdesk › Categories & SLA | People & Access | rec: per queue | — | Sensitive: payroll, medical, personal | Excel |
| 137 | **Knowledge base** | M08 YX-HD-04 | Helpdesk › KB editor (versioned articles, audience) | Documents & Communication | rec: audience | versioned | — | ZIP / Excel |
| 138 | **Misconduct matrix** (types, minor / major, suggested actions, reply days, warning expiry) | M08 Q5, YX-CASE-07 | Cases › Misconduct matrix | People & Access | E | versioned | *Model standing-orders list* ⚑; 7 days; 12 months | Excel |
| 139 | **IC membership** (presiding officer, members, external member, tenure) | M08 YX-POSH-01 | Cases › IC console › Membership | People & Access | E · workplace | dated (tenure) | ⚖️ composition from P07 | — |
| 140 | Grievance anonymity, whistleblower routing (ethics officer, audit-committee chair, serious threshold), case retention | M08 Q3 / Q7 / Q8 | Cases › Settings | People & Access | T · E | — | Anonymous on; 8 years | — |

### 3.7 Hiring & assessments (M10, T01–T05)

| # | Configurable item | Owning doc / rule | Editor screen | Settings group | Scope | Dated? | Starter template | Bulk import |
|---|---|---|---|---|---|---|---|---|
| 141 | **Pipeline templates** | M10 §2 | Hiring › Pipelines | Hiring & Assessments | T · per job | versioned | Starter pipelines (lateral, campus, staffing) | — |
| 142 | **Scorecard templates** | M10 YX-ATS-04 | Hiring › Scorecards | Hiring & Assessments | T · Dg | versioned | From M06 competencies | — |
| 143 | Headcount-plan approval rules | M10 Q1, YX-ATS-01 | Approvals › Requisitions (P03) | Hiring & Assessments | E · D | versioned | Outside plan → CFO / CEO | Excel (plan lines) |
| 144 | **Hand-off mode** | M10 Q2 | Hiring › Hand-off | Hiring & Assessments | E | — | *Manual (Ready to onboard)* ⚑ | — |
| 145 | Offer settings (template link, expiry, clawback terms) | M10 Q3, YX-ATS-06/17 | Hiring › Offers | Hiring & Assessments | E · G | versioned | *Expiry 7 days* | — |
| 146 | Candidate retention | M10 Q6, YX-ATS-09 | Hiring › Retention | Hiring & Assessments | T | — | 12 months (6–36) | — |
| 147 | Career page & job boards, referral rules | M10 §2, YX-ATS-12 | Hiring › Careers · Referrals | Hiring & Assessments | T · E | — | Referral after 90 days ⚑ | — |
| 148 | AI interview settings | M10 Q4 | Hiring › AI interview | Hiring & Assessments | T · per job | versioned | EN + HI | — |
| 149 | **BGV packages** & trigger point | M10 Q5 | Hiring › BGV | Hiring & Assessments | T · per job | — | After acceptance | — |
| 150 | Cost entries for cost per hire | P09 Q3 | Hiring › Recruiting costs | Hiring & Assessments | T | — | — | Excel |
| 151 | **Rate cards** (per role / skill / location, OT & holiday multipliers) | M10 Q7 | Staffing › Clients › Rate cards | Hiring & Assessments | rec: per client contract | dated | — | Excel |
| 152 | **Bench policy** | M10 YX-ATS-15 | Staffing › Bench policy | Hiring & Assessments | E | dated | *50 % pay, 30 days, then exit review* ⚑ | — |
| 153 | Invoice series per entity / GSTIN, ageing buckets, dunning schedule | M10 Q7, YX-ATS-16 | Staffing › Billing settings | Hiring & Assessments | E × GSTIN | — | 0–30 / 31–60 / 61–90 / 90+ ⚑ | — |
| 154 | Client portal users & SLA per contract | M10 Q8 | Staffing › Clients › Portal access | Hiring & Assessments | rec: per client | — | — | Excel |
| 155 | **Proctoring profiles** (mode preset + action matrix, ID check, room scan, companion phone, recording) | T04 Q1–Q5, YX-PROC-01 | Assessments › Proctoring profiles | Hiring & Assessments | T · per test | versioned | Four mode presets | — |
| 156 | Proctor pool, Live ratio, YukthiX proctor opt-in | T04 Q8, YX-SEC-23, YX-PROC-12 | Assessments › Proctors | Hiring & Assessments | T | — | 1 : 12; company pool | Excel (proctors) |
| 157 | Delivery defaults (window / slot, reschedule, reminders, no-show grace, offline tolerance, time credit, breaks, device policy, readiness block / warn, accommodation types) | T03 Q1–Q8 | Assessments › Delivery defaults | Hiring & Assessments | T · per test | versioned | T03 decided defaults | — |
| 158 | Test defaults (retake, timer, navigation, score bands, publish approval threshold) | T02 Q3–Q6 | Assessments › Test defaults | Hiring & Assessments | T · per test | versioned | 1 hiring / 3 training attempts; 500-candidate approval | — |
| 159 | **Exposure cap** | T02 Q7, YX-TB-09 | Assessments › Item exposure | Hiring & Assessments | T · per test / drive | — | 30 % in 30 days | — |
| 160 | Question review workflow & skill taxonomy extensions | T01 Q2 / Q3 | Question bank › Collections · Taxonomy | Hiring & Assessments | rec: per collection | versioned | Author → 1 reviewer; YukthiX starter taxonomy | Excel (questions) |
| 161 | **Retention per data class** | T05 Q7, YX-EVAL-08 | Assessments › Retention | Hiring & Assessments | T | — | 90 days (30–365) | — |
| 162 | **Consent texts** per jurisdiction | T05 Q8, YX-EVAL-09, APX-G G-08 | Assessments › Consent texts | Hiring & Assessments | T · jurisdiction · language | versioned | APX-G G-08 ⚑ (legal review) | — |
| 163 | **Result visibility** | T05 Q5 | Test › Results & release | Hiring & Assessments | T · per test | versioned | Status only ⚑ | — |
| 164 | **Rubrics** & evaluator set-up (blind, disagreement threshold) | T05 Q4, YX-EVAL-05 | Assessments › Rubrics | Hiring & Assessments | rec: per question / test | versioned | 1 evaluator; *threshold 30 % of max* | — |
| 165 | Appeal window, incident SLA, **reviewer assignment policy & pool** | T05 Q1 / Q2, YX-EVAL-15 | Assessments › Integrity review (§5) | Hiring & Assessments | T · per test | — | 7 days / 10 working days; 3 working days; round-robin, COI on ⚑ | Excel (reviewer pool) |
| 166 | ATS auto-advance rules | T05 Q6, YX-EVAL-12 | Job › Assessment rules | Hiring & Assessments | rec: per job | versioned | Suggest next stage | — |

### 3.8 Integrations, developers & billing (P10, P11, future P14, P16)

| # | Configurable item | Owning doc / rule | Editor screen | Settings group | Scope | Dated? | Starter template | Bulk import |
|---|---|---|---|---|---|---|---|---|
| 167 | AI provider, feature toggles, data-tier approvals | P10 Q1 / Q2 | Settings › AI | Integrations & Developers | T | — | YukthiX-managed; P10 Q2 tiers | — |
| 168 | Connectors (verification, payout, BGV, calendar, TDS / compliance partner, GSP, travel, rewards, Teams / Slack mirrors) | P10 §7, YX-INT-10 | Settings › Integrations (catalogue, connect wizard, health, run logs) · **Jobs & errors** (APX-D PLT-38: retry / skip across imports, deliveries, notifications, scheduled jobs, automations) | Integrations & Developers | T · E | — | Verification on | — |
| 169 | API keys (scopes, field classes, IP allow-list, expiry, rotation) | P11 Q4, YX-SEC-22 | Developers › API keys | Integrations & Developers | T | — | — | — |
| 170 | Webhook endpoints & event filters | P11 Q5 | Developers › Webhooks | Integrations & Developers | T | — | — | — |
| 171 | OAuth apps & consents | P11 Q4 | Developers › OAuth apps | Integrations & Developers | T | — | — | — |
| 172 | Embeddables & sandbox tenant | P11 Q6 / Q7 | Developers › Embeds · Sandbox | Integrations & Developers | T | — | — | — |
| 173 | Plan, products, add-ons | spec D15, future P14 | Billing › Plan & add-ons | Billing & Account | T | — | — | — |
| 174 | SMS spend cap / AI-credit cap | P04 YX-NTF-12, P10 Q1 | Billing › Usage & caps | Billing & Account | T | — | No cap | — |
| 175 | **Partner links & grant editor** (relationship type, modules / entities / actions, approval delegation per step, end link, ownership transfer) | P16 YX-PTR-02 / 03 / 05 / 13, Q6 | Settings › Partners (APX-D 2.11, PLT-30) | People & Access | T (grant scopes on E) | versioned | Starter grant per relationship type (*Operates payroll*, *Advises compliance*, *Auditor read-only*); all steps need client-side approval ⚑ | — |
| 176 | Partner programme settings (commission %, partner discount, verification checklist, directory listing fields and moderation rules) | P16 YX-PTR-01 / 11 / 14, Q3 | YukthiX console › Partners (APX-D YX-06…08; platform-level, not a tenant setting) | — (platform console) | platform | versioned | — (team action: rates set by YukthiX, must pass YX-BILL-09) | — |

### 3.9 Policy rules & automations (P19)

| # | Configurable item | Owning doc / rule | Editor screen | Settings group | Scope | Dated? | Starter template | Bulk import |
|---|---|---|---|---|---|---|---|---|
| 177 | **Rules per policy point** (builder and formula tabs, scope, priority, effective date; one Policies page per module) | P19 §3, YX-RULE-01 / 02 / 09, Q1 | *Module* › Policies › Rule builder (APX-D PLT-31 / 32) | Group of the owning module | T · E · L · D · G · ET · Emp + custom-field conditions | dated (versioned) | Module starter rules ⚑; legal floors and caps ⚖️ read-only (YX-RULE-03) | — |
| 178 | Lookup tables (city tier → per-diem, grade → mileage rate, site → shift allowance…) | P19 §3 | Policies & rules › Lookup tables (APX-D 1.8, PLT-34) | Organisation | T · E | dated | Starter tables where a starter rule reads one | Excel |
| 179 | Validation rules per record type (condition, message, block / warn) | P19 §6 flow 3, YX-RULE-05 | Policies & rules › Validation rules (PLT-36) | Organisation | T · E (per record type) | versioned | — | — |
| 180 | Automations (trigger, conditions, actions, dry run) | P19 §6 flow 4, Q2, YX-RULE-04 / 11 | Policies & rules › Automations (PLT-35) | Organisation | T · E | versioned | — | — |
| 181 | Rule approval settings (rule categories needing a second approver, approvers per module, "promotion required" for rules) | P19 YX-RULE-06 / 12, Q4 | Policies & rules › Approvals (APX-D 1.8) | Organisation | T | — | Second approver for pay, leave balances, access and visibility (always on); promotion required off | — |

### 3.9a Validation pass 3 Shoulds (28 Sep 2026)

| # | Configurable item | Owning doc / rule | Editor screen | Settings group | Scope | Dated? | Starter template | Bulk import |
|---|---|---|---|---|---|---|---|---|
| 182 | Public-holiday feed subscription (country / region feed, auto-import as draft, review before publish) | P21 YX-GLB-01…16 | Time › Holiday calendars › Feed (APX-D TIM-42) | Time & Leave | E · L | — | — (feed off until chosen) | — |
| 183 | Name and address formats per country (field order, local-script name, required parts) | P21 YX-GLB-01…16 | Settings › Organisation › Regional formats | Organisation | T · E | — | Per-country starter formats | — |
| 184 | Gender list (values offered, incl. transgender, non-binary, prefer not to say; mapping for statutory reports) | P21 YX-GLB-01…16, P09 | Settings › People › Gender list | People & Access | T | — | *Male · female · transgender · non-binary · prefer not to say*; statutory mapping ⚖️ read-only | — |
| 185 | Split-pay limits (max bank accounts per employee, fixed / % split, currencies) | P21 YX-GLB-01…16, M03 | Payroll › Payment settings | Payroll & Statutory | T · E · PG | — | Max 3 accounts (P21 YX-GLB-09); primary account takes the remainder | — |
| 186 | Work-permit reminder days | P21 YX-GLB-01…16 | Settings › People › Work authorisations | People & Access | T · E | — | 90 / 60 / 30 / 7 days before expiry (confirmed 28 Sep 2026) | — |
| 187 | Skills library (taxonomy, synonyms, proficiency scale, role requirements) | M06 YX-PERF-20…22, M07 YX-LRN-15 | Learning › Skills library (APX-D LRN-14) | People & Access | T | versioned | YukthiX starter taxonomy | Excel |
| 188 | Pay-band visibility to employees (own band, position in range) | M06 YX-PERF-20…22 | Settings › Payroll › Pay-band visibility (APX-D PAY-39) | Payroll & Statutory | T · E · G | — | **On** (own band only) | — |
| 189 | Appraisal eligibility rules (minimum service in cycle, probation, long leave, notice period) | M06 YX-PERF-20…22 | Performance › Cycles › Eligibility | People & Access | T · E · rec (cycle) | versioned | *Joined ≥ 90 days before cycle end; excludes employees serving notice* | — |
| 190 | Assessment result validity window (reuse of a result for another job) | T02 YX-TB-19, T03 YX-DLV-22/23 | Settings › Assessments › Result reuse | Hiring & Assessments | T · rec (test) | — | 6 months | — |
| 191 | Copilot channels (web, Teams / Slack, WhatsApp) and WhatsApp account linking | P10 YX-AI-13/14 | Settings › AI › Copilot channels | Integrations & Developers | T | — | *Web on; chat apps and WhatsApp off until linked* | — |
| 192 | Per-user AI fair-use allowance (actions / credits per user per month, over-use behaviour) | P10 YX-AI-13/14 | Billing › Usage & caps | Billing & Account | T · G | — | *Per-plan allowance; soft warning at 80 %* | — |
| 193 | NYC automated-employment-decision-tool setting (roles / locations in scope, bias-audit record, candidate notice) | T05 YX-EVAL-31/32, M10 | Settings › Hiring › AEDT compliance | Hiring & Assessments | T · L | — | ⚖️ On for NYC locations when an AEDT is used (NYC LL144) | — |
| 194 | EOR provider connection (provider, countries, worker sync, invoice import) | P10 YX-INT-12 | Settings › Integrations › EOR (APX-D PLT-49) | Integrations & Developers | T | — | — | — |

### 3.9b P22 Workflow Studio & AI assistant (28 Sep 2026)

| # | Configurable item | Owning doc / rule | Editor screen | Settings group | Scope | Dated? | Starter template | Bulk import |
|---|---|---|---|---|---|---|---|---|
| 195 | Workflow Studio settings (who may build and publish, workflow categories needing a second approver, "promotion required" for workflows, AI build and do modes on / off) | P22 YX-WFS-04 / 15 / 16 / 20 | Policies & rules › Workflow Studio (APX-D 1.8, PLT-55) | Organisation | T | versioned | Second approver for pay, leave balances, access and people data (always on); promotion required off; AI modes off until enabled | — |
| 196 | Approved endpoints (outbound HTTP hosts and P10 connectors a workflow or script may call) | P22 YX-WFS-11 / 13 | Policies & rules › Workflow Studio › Approved endpoints (APX-D 1.8) | Organisation | T | — | — (none approved) | — |
| 197 | Service identities (one per script-publishing workflow; scopes equal to or narrower than the publisher; vault secrets) | P22 YX-WFS-14 | Policies & rules › Workflow Studio › Service identities (APX-D 1.8, PLT-61) | Organisation | T | — | — | — |
| 198 | Inbound email and webhook per workflow (inbound address, allow-listed senders, HMAC secret, 5-minute timestamp window) | P22 YX-WFS-11 | Workflow › Trigger settings (APX-D PLT-55) | Organisation | rec: per workflow | — | — | — |
| 199 | Workflow limits (per run: records touched, steps, duration; per tenant per day: runs, records touched, script CPU seconds, AI calls; 80 % / 100 % alerts) | P22 YX-WFS-07, D18 | Billing › Usage & caps (APX-D 8.2); per-run limits on the workflow | Billing & Account | T · rec: per workflow | — | *Team-set defaults per plan; per-run limits at the default* | — |
| 200 | Tenant-wide kill switch (pause all workflows; confirmation; resume or cancel held runs) | P22 YX-WFS-12 | Policies & rules › Workflow Studio (APX-D 1.8) | Organisation | T | — | — (off) | — |

### 3.9c P23 Employee & manager assistants and marketplaces (28 Sep 2026)

| # | Configurable item | Owning doc / rule | Editor screen | Settings group | Scope | Dated? | Starter template | Bulk import |
|---|---|---|---|---|---|---|---|---|
| 201 | Assistant switches (payslip explainer chat, policy writer, timesheet auto-fill, manager coach, review assistant, tax planner, salary optimiser; rule-based parts keep working without AI credits) | P23 YX-AST-17 / 18, P10 YX-AI-07 | Settings › AI › Assistants (APX-D 7.6) | Integrations & Developers | T | — | Rule-based helpers on; AI helpers on within fair use (review assistant: see #206) | — |
| 202 | Manager coach frequency and signal types; manager opt-out | P23 YX-AST-10 / 18 | Performance › Coach (APX-D 6.3); opt-out in the manager's profile | People & Access | T · rec: per manager (opt-out) | — | *Weekly, Monday 09:00* ⚑; all permitted signals on | — |
| 203 | Timesheet mapping rules (source pattern → project / task, priority) and allowed work-tool connectors | P23 YX-AST-08 / 09 / 18 | Projects & timesheets › Mapping rules (APX-D PRJ-08, 3.11) | Time & Leave | T | — | — (no rules; connectors calendar / Jira / GitHub allowed, each per-user opt-in) | Excel |
| 204 | Perks marketplace on / off and categories | P23 YX-AST-16 / 18 | Benefits & FBP › Perks (APX-D 4.11) | Payroll & Statutory | T | — | *Off* ⚑ (categories chosen when switched on) | — |
| 205 | Group insurance partner enablement (marketplace on / off, partner shown, census fields shared) | P23 YX-AST-14 / 15 | Benefits & FBP › Group health (APX-D 4.11, PAY-43) | Payroll & Statutory | T | — | *Off*; only an IRDAI-licensed broker / corporate agent with an in-date licence can be shown ⚖️ | — |
| 206 | AI review summaries and review assistant opt-in (bias check, "Help me draft") | P23 YX-AST-11, P10 YX-AI-02 / 11 | Settings › AI (APX-D 7.6) | Integrations & Developers | T | — | *Off* (tenant opt-in; off for EU tenants until conformity) | — |

**Count:** 206 editor rows (174 + 175–176 added by the P16 follow-up, 26 Sep 2026; 177–181 by the P19 follow-up, §3.9; 182–194 by validation pass 3 Shoulds, 28 Sep 2026, §3.9a; 195–200 by P22, 28 Sep 2026, §3.9b; 201–206 by P23, 28 Sep 2026, §3.9c): 166 carry a starter value and / or a legal source (⚖️ law-bound values appear in 15 of them, shown read-only); 40 are masters, operational screens or platform settings with no starter. **Excel import** is supported by 53 editors, **ZIP** by 4 (one editor offers both).

### 3.10 Editor pattern (all rows)
Every editor follows one pattern so D17 is visible everywhere:
- **Source line** for each value: "YukthiX starter vN — edit for your company" · "Edited by ‹name› on ‹date›" · "Inherited from ‹scope›" (YX-ORG-12) · "⚖️ Law — P07 ‹rule set› v‹n›, source ‹link›".
- **Reset to starter** and **compare with starter** actions; legal values have neither.
- **Dated** editors show a timeline of values with `valid_from` and refuse edits that would change a value already used by a locked period (YX-ORG-18, P08).
- **Impact preview** before save where the value affects people ("changes probation end for 14 employees", "moves 3 LWDs").
- Save is audited (P08); policy records save a new version (P06 / P03 pattern).

---

## 4. Roster ownership (G6)

- **Permission:** `attendance.roster.manage` (added in P02 §4.1, D2 row): **team scope for managers / supervisors**, **entity scope for HR**.
- **Who owns which screen:**

| Screen | Owner | Scope | Notes |
|---|---|---|---|
| **Roster** (Time › Roster: drag-assign, copy week, publish + notify) | **Line manager / supervisor** of the team; HR Admin for any team in the entity | `attendance.roster.manage` team / entity | A team without a manager holding the permission falls to HR (readiness advisory "team has no roster owner") |
| **Shift swap** | Employees propose; the colleague consents; the roster owner approves (P03) | team | YX-AT-07 conflict badges shown to the approver |
| **Shifts, shift patterns, weekly-off rules** (masters, #56–#58) | HR Admin | `attendance.roster.manage` entity scope | Managers pick from these masters; they cannot create shifts |
| **Pattern assignment** (dated fact, P06) | HR Admin; roster owners for their team from a start date | team / entity | — |
| **Muster lock** | HR Admin (`attendance.muster.lock`) | entity | P08 freeze / lock |
| **Kiosk / device roster sync** | HR Admin | entity | — |

- A roster published by a manager for dates inside a frozen period is refused and routed as an HR bulk correction (P08, YX-AT-13).

---

## 5. Incident reviewer assignment (G7), summary

Detail and the rule are in **[T05](T05-integrity-evaluation-outcomes.md) YX-EVAL-15**. In short:
- **Assignment policy** per tenant (and optionally per test): **round-robin** (starter) · **by language** (attempt language matches the reviewer's languages) · **by load** (fewest open items weighted by severity); a per-reviewer capacity cap; out-of-office from P03 delegation / M02 leave.
- **Conflict of interest:** the reviewer is never the candidate's recruiter, hiring manager or interviewer / panel member for that application (for employee test-takers: never in the employee's manager chain), nor the test-taker; appeals and second reviews also exclude the first reviewer (YX-EVAL-01 / 04). With no eligible reviewer, the item escalates to the pool owner; there is no override.
- **Reviewer capacity & SLA dashboard** (T6): open items per reviewer by severity, age against the 3-working-day SLA, overdue, throughput, appeals against the 10-working-day SLA, reassign action.
- Configured in hub card **C20** and editor row **#165**.
