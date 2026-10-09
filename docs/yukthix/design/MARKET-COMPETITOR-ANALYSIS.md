# Market & competitor analysis — what customers complain about, and where YukthiX stands

> **Date:** 26 Sep 2026. **Purpose:** find what buyers and users dislike about HRMS, payroll, ATS, open-source HR and proctoring products, check each pain against the YukthiX design, and list the claims we can make in marketing.
>
> **Method.** Four research passes (about 200 web searches, about 220 pages read): review sites (Capterra, GetApp, Software Advice, Trustpilot, Techjockey, SourceForge), app-store review pages, vendor forums (greytHR community, Zoho help, Frappe discuss, Odoo forum), GitHub issue trackers, Hacker News, Blind, Levels.fyi, news and court records, and vendor pricing pages. G2, Play Store, Reddit and Gartner block automated reading, so anything from them came through search snippets or third-party pages and is marked **indirect** in the raw reports. Competitor-written blogs are marked **competitor** and used only for checkable facts.
>
> **Raw evidence with every URL:** [research/research-india-hrms.md](research/research-india-hrms.md) · [research/research-global-hrms.md](research/research-global-hrms.md) · [research/research-opensource-ats.md](research/research-opensource-ats.md) · [research/research-proctoring.md](research/research-proctoring.md). Quote only from those files, and only the items marked as read first-hand, when writing anything public.
>
> **Products covered (58).** India HRMS: Keka, greytHR, Darwinbox, Zoho People / Payroll, HROne, Pocket HRMS, sumHR, Zimyo, Qandle, RazorpayX Payroll, factoHR, Spine HR, PeopleStrong, Kredily. Global: Workday, SAP SuccessFactors, Oracle HCM, BambooHR, Rippling, Gusto, Deel, Remote, Personio, HiBob, Paycom, Paylocity, ADP, Namely, TriNet / Zenefits, Justworks, Factorial, Lattice, Culture Amp, 15Five, Sage HR, Freshteam. Open source: Frappe HR, OrangeHRM, Odoo HR, Sentrifugo, IceHrm, Horilla, Bitrix24, Kimai, TimeOff.Management. ATS: Greenhouse, Lever, Workable, SmartRecruiters, iCIMS, Zoho Recruit, Ashby, Teamtailor, Recruitee, JazzHR, Bullhorn, Ceipal, Naukri RMS. Proctoring and assessment: HackerRank, Codility, CodeSignal, HackerEarth, Mettl, TestGorilla, iMocha, Xobin, Wheebox, Talview, Proctorio, Honorlock, ProctorU, Examity, Respondus, ExamSoft, Pearson VUE, SHL, Aon, Vervoe, Glider, Karat, HireVue.

---

## 1. The twelve pains that repeat across every market

Ordered by how many products and how many reviewers raise them.

| # | Pain | Where it shows up | Typical evidence |
|---|---|---|---|
| 1 | **Support that fails on payroll day.** Slow, unknowledgeable, ticket-only, closes tickets on escalation. | Nearly every HRMS, India and global; TestGorilla, Vervoe, Mettl, ProctorU. | Keka: 156 "poor customer support" mentions on G2 (indirect). greytHR: "support delays up to 4 months". ADP: 111 G2 mentions. Paylocity: "not once in 7 years did my rep answer". Gusto: "support simply closes tickets". |
| 2 | **Mobile attendance that doesn't work.** Wrong GPS, selfie crashes, login loops, no credential persistence, app slower than web, employees marked late or LOP because the app failed. | Keka, Darwinbox, greytHR, Zoho, HROne, Pocket, Frappe (PWA only), Bitrix24. | greytHR App Store: "I marked late because of this app many times". Darwinbox: "retry 10–15 times". Zoho: pin "2–3 streets away", no preview before submit. |
| 3 | **Payroll, leave and tax calculation errors** that recur monthly, and customers left to find them. | greytHR, Keka, factoHR, HROne, Zimyo; Gusto, Namely, Paylocity, Zenefits; Frappe, Horilla. | greytHR community: LOP of 44 days in one month, an unjoined employee paid a full month. Gusto: unpaid state taxes, wrong W-2s, penalties. Horilla: unpaid leave deducted twice. |
| 4 | **Rigid products.** Policies hard-wired, changes only through vendor support, can't model the company's own rules. | Keka, greytHR, HROne, Zimyo, Darwinbox; ADP, BambooHR, Oracle, SAP; Lever, iCIMS, Zoho Recruit. | Keka: "hard wired; impossible to make any changes". greytHR: "accrual calculations cannot be configured". ADP: "adjust their processes to fit ADP's way". Talview: form change "wait for 2 weeks". |
| 5 | **Reporting that is weak or sold separately.** Export to Excel to get anything done; custom reports on higher plans. | Almost all HRMS and ATS. | BambooHR: "export data to Excel and format it". Keka: custom reports "unless you pay for higher plans". Ceipal: dashboards only 3 months. Greenhouse, Lever, SmartRecruiters, Codility. |
| 6 | **Seat floors and minimums.** Small firms pay for 40–100 seats they don't have. | HROne 50, Qandle 50, Pocket 50, Zimyo 40, greytHR 50 in base, Keka 100 in base, RazorpayX ₹3,499 for up to 20; BambooHR $250/month floor, Lattice $4,000/year, Rippling and Gusto base fees. | indianhrm on HROne: "a 20-person company pays for 50 users… near ₹292 per employee". |
| 7 | **Hidden costs, add-on sprawl, renewal uplifts, billing from signature.** API, SSO, GPS, reports and mobile sold as add-ons; year-two price jumps; implementation billed before go-live. | greytHR (API ₹15/emp, SSO ₹10, GPS ₹140), Keka, Darwinbox, Pocket, HROne; Workday, Rippling, Paycom (25 % hike), Gusto (base $40→$49), Factorial ("doubled without notice"); Workable (+59 % with two add-ons), iCIMS (36-month terms, 5–7 % escalators), Greenhouse (8–15 % renewal). | Many reviewers say the surprise invoice, not the product, made them switch. |
| 8 | **Sudden changes and lock-in.** Free tiers withdrawn with two weeks' notice, features removed without warning, silent annual auto-renew, data held after exit, no grace period. | RazorpayX, Kredily, greytHR; Personio, JazzHR, Paycom ("when the contract is up, you're done"), Gusto (holds W-2s after churn), BambooHR (collections). | r/IndiaTax on RazorpayX: "₹2k per month for my 4 employees, with literally 2 weeks of notice". |
| 9 | **Integrations and API gated or missing.** No webhooks, API as paid add-on, weak Tally / QuickBooks / SAP / Slack connectors, one-way ATS sync. | greytHR (no webhooks), Paycom (no public API), Keka, factoHR; TestGorilla returns only summary scores to Greenhouse; iCIMS $2–10k per integration. | |
| 10 | **Slow, click-heavy, dated UI**, thin mobile parity. | Darwinbox (23 G2 mentions of slowness), greytHR, Spine, PeopleStrong; Workday, SAP, Oracle (30-second timesheet); Greenhouse, iCIMS ("from 2005"), Bullhorn, Ceipal. | Blind on Workday: "we use it and we hate it with passion". |
| 11 | **Long implementations and migration pain.** 3–9 months, billing meanwhile; botched data migrations; open-source upgrades need CLI work and irreversible migrations. | Darwinbox, Keka, Zimyo; Oracle (18 months), HiBob (8–12 weeks); JazzHR, Ceipal; Frappe, Horilla, OrangeHRM. | |
| 12 | **Unannounced downtime and no visibility of errors.** Maintenance without notice, no error logs for admins, no status page. | greytHR, HROne, Kredily, Qandle, Pocket ("Error log is missing"). | |

**Proctoring has its own top three**, all severe: opaque and unappealable cheating flags (CodeSignal changed its accusation on appeal; ProctorU and Pearson VUE revoke exams mid-test); documented bias in face detection (peer-reviewed: darker-skin students flagged five times more with Respondus; ExamSoft, Honorlock, Proctorio, HireVue); and privacy and legal exposure (Respondus $6.25M and HireVue $3.75M biometric settlements, ProctorU breach, room scans ruled a Fourth Amendment violation). Live proctor no-shows make ProctorU 1.1 / 5 on Trustpilot. Employers add AI cheating (CodeSignal reports fraud attempts in 35 % of proctored tests), question leakage, hidden test cases and annual credit lock-in.

---

## 2. Pain by market, in one line each

- **India HRMS:** support during payroll week, mobile check-in, calc errors, rigidity, gated reports, seat floors, add-ons, and multi-entity handled by running several tenants plus Excel (Zoho needs one Payroll subscription per legal entity).
- **Global HRMS:** support, quote-only pricing, price hikes, annual lock-in, weak reporting, US-only payroll, module creep, heavy implementations, and enterprise UX nobody likes. The one thing reviewers praise unprompted is a vendor that **publishes its prices** (Justworks).
- **Open source:** no complete India statutory pack in any free edition (Frappe's lives in a 23-star extension; Odoo's is Enterprise-only), high-severity CVEs in 2025–26 for Frappe, OrangeHRM and Horilla with "cloud users are safe, self-hosters patch yourselves", painful upgrades, open-core gating of API / SSO / payroll, and issues sitting 18 months with no reply.
- **ATS:** weak reporting, click-heavy UIs, duplicate candidates and bad parsing, scheduling without time zones or availability requests, hiring managers skipping scorecards, headcount-based pricing that punishes growth, no mobile app (Ashby, JazzHR), and, for candidates, re-typing a resume after uploading it, silent archiving and the "black hole". Freshteam's shutdown (renewals stopped Mar 2026) leaves SMBs wanting cheap ATS + onboarding in one place.
- **Staffing agencies:** no product bundles vendor submissions, timesheets and GST e-invoicing; SmartRecruiters' agency portal is "being mothballed"; Bullhorn is weak for temp and shift staffing; Naukri RMS has no integrated scheduling.
- **Proctoring:** see above. Also no candidate feedback (SHL, TestGorilla, HireVue), tests that don't reflect real work (Codility "edge-case puzzles", Glider "75 % pass the test then fail the client interview"), heavy lockdown clients, and quote-only pricing (Mettl, Talview, iMocha, HireVue).

---

## 3. Pain → YukthiX design: covered, partly covered, missing

Status key: ✅ designed and decided · 🟡 partly, or designed for a later wave · ❌ not in the design yet (see §4).

| # | Pain | YukthiX answer | Where | Status |
|---|---|---|---|---|
| 1 | Support on payroll day | Standard support **included**: business hours, extended hours on payroll days, Severity-1 around the clock. Priority Support is the only paid support add-on. Product support separate from the tenant's own HR helpdesk. | P14 Q8, YX-CONSOLE-03 / 04 | ✅ |
| 2 | Mobile check-in reliability | One codebase for PWA and store apps, passkey / biometric / PIN login with a 30-day session, GPS geofence with multiple locations, field mode, an offline queue shown on the check-in card, device binding as a company option. | M04 YX-MOB-01..10, M02 Q6 | 🟡 offline check-in and selfie are wave 6; GPS pin preview before submit not stated |
| 3 | Calculation errors | Statutory rules as versioned data with golden tests; pre-run validation (bank, PAN, UAN, attendance exceptions, negative net, minimum wage, joiners / leavers); variance review of every payslip against last month; attendance exceptions detected daily and blocking approval; parallel run before go-live; impact preview before any rule change. | P07, M03 YX-PAY-05 / 06 / 22, P08 YX-LOCK-08, P15 YX-MIG-08, P19 YX-RULE-07 | ✅ (add the specific "impossible value" checks, §4) |
| 4 | Rigidity | **D17 configurable by default** and **D19 every rule editable with any field**: one rule builder with no-code and formula modes across all modules, custom fields and objects, per-role layouts, law as a floor. | spec D17 / D19, P19, P18 | ✅ strongest differentiator |
| 5 | Reporting | Report builder, custom dashboards, 138 catalogued reports, metric layer, AI "ask analytics", all **included**, never tiered. Scheduled reports by email or secure link. | P09, APX-C, D18 | ✅ |
| 6 | Seat floors | $1 per billable unit per product; billable = employee active any day of the month; pre-boarders, alumni, nominees, external logins, hiring managers not billed. A **small minimum monthly amount** per product exists (D18). | P14 YX-BILL-01..03, D18 | 🟡 the minimum must stay tiny and be published, or we inherit this complaint |
| 7 | Hidden costs and add-ons | All built features included; paid extras only storage beyond fair use, AI credits, third-party pass-through, custom connections, customisation work, Priority Support. API, webhooks, SSO, GPS, reports, mobile, sandbox, white-label all included. Bundle and annual discounts automatic. | D18, P14 YX-BILL-01, P11, P12 | ✅ |
| 7a | Billing from signature, implementation fees | 30-day trial without card; self-service migration and setup free; assisted implementation is paid customisation. | P14 Q4, P15 | 🟡 "billing starts at go-live, never at signature" is not written as a rule |
| 8 | Sudden changes and exit lock-in | Whole-tenant export any time; 30-day read-only exit with full export and a deletion certificate; employees keep payslip / Form 16 access while a tenant is restricted; 12-month API deprecation. | P14 YX-TEN-02..05, P11 | 🟡 no rule on price-change notice, feature-removal notice, renewal reminders, or employees' documents after the tenant leaves |
| 9 | Integrations and API | REST and GraphQL from day one, webhook catalogue with replay, scoped keys, SDKs; Tally / Zoho / QuickBooks / Busy / Marg connectors, biometric cloud push and on-prem agent, Slack / Teams bot, Naukri / Shine / Foundit / LinkedIn / Indeed job boards, six ATS connectors for standalone Proctoring, two-way result sync with per-section detail as the company allows. | P11, P10, M10 YX-ATS-23, T05 B6 | ✅ (SAP / Oracle connectors: later) |
| 10 | Slow, click-heavy UI | UI brief with 10 principles, shared component library, mobile tab map, keyboard-first is implied but not stated; mobile parity map for every module. | 99-ui-design-brief, APX-D | 🟡 add "bulk actions and keyboard-first everywhere" as an explicit principle |
| 11 | Implementation and migration pain | Import framework with templates, dry-run, rollback, ID mapping; file mappers for greytHR, Keka, Zoho, Darwinbox, Frappe plus direct API pull; full-history import as locked periods; implementation playbook; pilot exit criteria. | P15 YX-MIG-01..13 | 🟡 add Freshteam, OrangeHRM, Horilla and generic ATS mappers |
| 12 | Downtime, no error visibility | Public status page and on-call in the infrastructure brief; delivery logs for notifications and integrations; readiness checks; maintenance notices always shown to admins. | P13 brief, P04 YX-NTF-10, P10, APX-E, YX-CONSOLE-06 | 🟡 no tenant-facing commitment: notice period, no maintenance on payroll-critical days, one admin "errors and jobs" page |
| 13 | Multi-entity, multi-state | Multiple legal entities in one tenant on every plan; all states' rules as data from the pilot; masters shared or per entity. | P01 Q2 / Q3, P07 Q7 | ✅ |
| 14 | Privacy inside the product | Directory fields configurable with limits; payslip PDF password option; "who accessed my data"; Special-class data isolated. | P02, P04 YX-NTF-15, P08 | ✅ |
| 15 | Ads, features hidden behind support | Never; setup hub with 174 self-serve editors. | APX-E | ✅ |
| 16 | Open-source security and upgrade burden | Managed SaaS, ISO 27001 by launch then SOC 2, pen test before pilot, per-tenant keys and BYOK, CERT-In reporting. | P12 | ✅ |
| 17 | ATS duplicates, parsing | One person across jobs, dedup by email, phone and embedding; PAN-duplicate check at hire; vendor submission duplicate and ownership checks. | M10, YX-ATS-27, M01 YX-EMP-02 | ✅ |
| 18 | ATS scheduling | Panel auto-slotting from calendar free / busy with time zones, buffers, load caps, candidate availability, self-booking. | M10 YX-ATS-24 | ✅ |
| 19 | Hiring-manager adoption | Scorecards, AI first-round summary, Slack / Teams / WhatsApp actions. | M10, P04 B9 | ✅ |
| 20 | Candidate experience: re-typing, black hole | Resume parsing to prefill; candidate portal; candidate survey; retention 12 months then anonymise. | M10, M09 YX-ENG-11 | 🟡 make "never re-type after upload" and "status visible at every stage" explicit; portable candidate profile is a decision (§4) |
| 21 | ATS pricing by headcount | Per recruiter seat only; hiring managers and panel free. | D18, YX-BILL-03 | ✅ |
| 22 | Staffing agency stack | Staffing desk with client portal, vendor submission portal, timesheets, GST invoices with IRN, projects and billing. | M10, M12, M13 | ✅ unique |
| 23 | Freshteam refugees | ATS + onboarding + core HR in one product at $1. | M10, M01 | 🟡 needs the Freshteam import mapper |
| 24 | Proctoring: opaque flags | Detections are signals only; nothing auto-fails; two reviewers to invalidate; appeals with an evidence summary to a different reviewer; integrity score with visible weights; company decides what candidates see. | T04 YX-PROC-02 / 14, T05 YX-EVAL-01..05 | ✅ |
| 25 | Proctoring: bias | Published fairness report per model; adverse-impact and item-bias monitoring; manual fallback; no emotion recognition; accommodations override detections. | T05 Q8, YX-EVAL-24..28, T06 YX-PSY-06, T08 YX-SCL-04 | 🟡 add an explicit "no face detection" mode option |
| 26 | Proctoring: privacy and legal | Jurisdiction-aware consent (DPDP, GDPR, BIPA); retention default 90 days, company sets 30–365; room scan only for high-stakes modes; recordings in-region; client runs only during the test, no kernel driver; LAN hints off by default. | T05 Q7 / Q8, T04, T08 | ✅ (Proctorio's court win used 30-day deletion; our default is 90) |
| 27 | Live proctor reliability | Own proctors 1:12 plus YukthiX proctors as an add-on. | T04 | ❌ no start-time SLA or automatic fallback |
| 28 | AI cheating, leakage | Exposure caps, versions, leak monitoring, LLM-likeness and timing signals, AI-allowed mode, process blocking and virtual-device detection in the client, keystroke playback. | T01, T02, T04, T05, T07, T08 | 🟡 name overlay assistants and second-device voice tools explicitly in T08 |
| 29 | Hidden test cases, unrealistic tests | Visible and hidden tests, run history, editor policy, project workspaces with terminal, real-work task types, predictive validity vs later performance. | T02, T07, A13 | ✅ |
| 30 | Assessment pricing lock-in | Per attempt started, no credits, no expiry, monthly. | D18 | ✅ |

**Score:** 30 pain themes. 19 fully covered, 10 partly covered, 1 missing. The partly-covered items are small; §4 lists them.

---

## 4. Additions from this research (decided 26 Sep 2026)

**Founder decisions:** G1–G12 and G14–G17 **adopted** and applied to the docs (spec decision **D20**). **G8:** offline check-in moves to **wave 2**. **G13: not adopted**, candidates keep per-company profiles. **G2 / G3 / G17:** adopted as stated (90-day price notice, 6-month feature-removal notice, renewal reminders, published tiny minimum, 30-day proctoring evidence default).

| # | Addition | Doc | Kind |
|---|---|---|---|
| G1 | **Billing starts at go-live**, never at signature: the meter starts on the day the tenant marks go-live (or first live payroll for HRMS), the trial covers setup, no implementation fee for self-service. | P14 | commitment |
| G2 | **Price-change notice:** at least 90 days' notice of any list-price change, and existing annual terms never change mid-term. **Feature-removal notice:** at least 6 months, with an export path. **Renewal reminders** 30 and 7 days before an annual renewal; monthly plans cancel any time. | P14 | commitment (**decision** on the periods) |
| G3 | **Published price list** for every product and add-on, including the minimum monthly amount, on the website and in the app. Set the minimum low enough that a 5-person company pays a few dollars, not a 50-seat floor. | P14 / D18 | **decision** on the minimum |
| G4 | **After a tenant leaves:** during the 30-day read-only exit, every employee can download their own payslips, Form 16 and letters, and the tenant export includes per-employee document packs. | P14 | rule |
| G5 | **Maintenance and status:** public status page, maintenance notices at least 72 hours ahead to admins, **no planned maintenance in the payroll-critical window** (company-configurable, starter = last 3 and first 7 days of the month) or on statutory due dates, incident notices within 30 minutes. | P14 / P13 brief | rule |
| G6 | **Admin "jobs and errors" page:** one place for import errors, integration deliveries, notification failures, scheduled-job failures and automation failures, with retry. | APX-D / APX-E / P10 | rule |
| G7 | **Check-in card shows the GPS pin, accuracy radius and geofence before the employee submits**, with "retry location" and a plain reason when outside; every failed check-in attempt is logged so HR can regularise without the employee being marked late. | M02 / M04 | rule |
| G8 | **Move offline check-in from wave 6 to wave 2** (queue punches with device time and GPS, sync later, flagged as offline). It is the second-most common complaint in India. | M02 / M04 | **decision** |
| G9 | **Impossible-value checks** added to pre-run validation: LOP greater than calendar days, pay for days before joining or after leaving, leave credited but not reflected, net pay change above the threshold with no input change, duplicate bank account across employees. | M03 YX-PAY-05 | rule |
| G10 | **UI principle: bulk actions and keyboard-first everywhere** (multi-select on every list, inline edit, command palette already in P17), and a target of **no core task deeper than three clicks** from Home. | UI brief | rule |
| G11 | **Migration mappers for Freshteam, OrangeHRM, Horilla and a generic ATS CSV** (candidates, jobs, stages, notes, attachments), plus a "Freshteam switch kit" page. | P15 | rule |
| G12 | **Candidate promises:** no re-typing after a resume upload (parsed fields shown for edit only), status visible to the candidate at every stage with a company-editable label set, a plain reason or "not selected" notice when the company enables it, one login per candidate per company. | M10 | rule |
| G13 | ~~Portable candidate profile across employers~~ **Not adopted (26 Sep 2026):** per-company candidate profiles only; resume parsing prefills each application. | M10 | decided no |
| G14 | **Live proctor SLA:** a live session starts within 10 minutes of the slot or the attempt automatically continues in Record & review with time credit and a flag, never a termination. | T04 | rule |
| G15 | **"No face detection" mode** as a company option per test (identity by ID check and proctor, no continuous face analysis), for accommodations and for jurisdictions that restrict biometrics. | T04 | rule |
| G16 | Name **overlay assistants and second-device voice tools** in T08 detections and in the T04 AI-assistance signals. | T08 / T04 | wording |
| G17 | **Retention default for proctoring evidence** reconsidered: 30 days instead of 90 (the setting the Amsterdam court accepted), company still sets 30–365. | T05 | **decision** |

---

## 5. Marketing: claims we can make and prove

Use only claims backed by our design decisions, and only compare with facts read first-hand in the raw reports. Indian comparative-advertising rules require claims to be true and provable, so quote reviewers as "reviewers on Capterra report…" with the URL, never as our own statement about a competitor.

**Headline positions**
1. **"$1 per user, per product. Everything included."** No tiers, no seat floors, no add-ons for API, SSO, GPS, reports or mobile. Every competitor studied charges $4–25 per user per module or a ₹40–100-seat floor. (D18, P14)
2. **"Your rules, not ours."** Every policy editable, any field usable, formula or no-code, with an impact preview before it goes live. Law is a floor, not a wall. (D17, D19, P19, P18)
3. **"Payroll that checks itself."** Pre-run validation, variance review, impossible-value checks, statutory rules as versioned data with golden tests, parallel run before go-live, arrears never rewrite locked months. (M03, P07, P08, P15)
4. **"A human on payroll day, included."** Extended hours on payroll days and Severity-1 around the clock in the base price. (P14)
5. **"Leave whenever you like, with everything."** Full export any time, 30-day exit, deletion certificate, employees keep their documents. (P14)
6. **"One tenant, every legal entity, every state."** (P01, P07)
7. **"Built for India's whole workforce."** Contract labour and CLRA, consultants with 194C / 194J, state registers, minimum wages for all states, earned wage access, WhatsApp in four languages. (M13, M03, P07, P04)
8. **"The only stack for staffing agencies."** ATS + vendor portal + timesheets + GST e-invoicing + payroll for deployed staff in one product. (M10, M12, M13, M03)
9. **"Proctoring that is fair by design."** No auto-fail, evidence-based appeals, published fairness reports, adverse-impact monitoring, accommodations override detections, no kernel driver, no room scan unless the company chooses it, retention the company controls. (T04, T05, T08, A13)
10. **"Open-source flexibility without the patching."** Import from Frappe HR in a day; ISO 27001, per-tenant keys, BYOK. (P15, P12)

**Battlecard one-liners** (each is a reviewer-reported complaint in the raw reports, paired with our design)
- greytHR: REST API is ₹15 per employee per month and has no webhooks → ours is included, with webhooks and replay.
- Keka: base plan covers 100 employees; "hard wired" → no floor above the small minimum; every rule editable.
- Zoho: one Payroll subscription per legal entity, leave and attendance only on Premium → all entities in one tenant, everything included.
- HROne / Qandle / Pocket: 50-user minimum billing, no refund of unused credit → pay for active employees, monthly, cancel any time.
- Darwinbox: implementations of 3–9 months billed from day one (competitor-sourced, verify) → billing from go-live, self-service migration free.
- RazorpayX / Kredily: free tier withdrawn on two weeks' notice; features removed without warning → 90-day price notice, 6-month feature notice (D20).
- Workday / SAP / Oracle: months of implementation, consultant-only configuration → setup hub with 174 self-serve editors and a 30-day trial.
- BambooHR / HiBob / Personio: export to Excel for reports → report builder and dashboards included.
- Paycom: no public API, no data grace at exit → REST + GraphQL, 30-day exit with export.
- Gusto: holds W-2s after churn → employees keep payslips and Form 16 through exit.
- Greenhouse / Ashby / iCIMS: priced by total headcount → per recruiter seat only.
- TestGorilla / Codility: annual-only, credits that expire → per attempt, no expiry.
- ProctorU: live proctor no-shows → start-within-10-minutes or automatic fallback (YX-PROC, D20).
- Respondus / Honorlock: biometric settlements, room scans → consent by jurisdiction, no room scan by default, no-face mode (D20).

**The bar we must also meet** (what reviewers praise): greytHR's statutory depth (ECR, challans, Form 16, 24Q out of the box); Keka's and Darwinbox's UI; Zoho's price and ecosystem; Rippling's "one data model, no sync jank"; Paycom's 4.8-star employee app; Justworks' published prices; Greenhouse's structured scorecards; Ashby's analytics; Bullhorn's single candidate-to-placement record; HackerRank's question library; Honorlock's hybrid AI plus human pop-in.

---

## 6. Pricing benchmarks found (for the pricing page and sales)

| Segment | Cheapest comparable list price | Notes |
|---|---|---|
| India HRMS + payroll | Zoho People ₹50–60 + Zoho Payroll ₹40–100 per employee; Kredily paid ₹50–70 per employee; Zimyo ₹60 | Most have 40–100-seat floors; greytHR / Keka base plans ₹2,495–15,999 per month covering 50–100 seats |
| Global core HRIS | BambooHR $10, Factorial ~$8, Rippling $8 + $35–40 base | Payroll adds $6–12; performance modules $4–11 each |
| ATS | Recruitee $199 / month, Workable $149–299 / month, Greenhouse ~$5–6k / year entry, Ashby $300–400 / month by headcount | Per-recruiter models are rare; headcount-based is the norm |
| Coding tests | Codility $1,200 / year for 120 invites (~$10 per invite), CodeSignal $79 / month for 60 credits (~$16 per attempt), TestGorilla $142 / month annual | All annual or credit-based |
| Exam proctoring | Proctorio $3–5 per exam, Honorlock $4–12.50, ProctorU $16.80–32.55 by duration, Respondus $15 per student per year | Rush fees $8–12 |

YukthiX at $1 per user per product is 4–10× below the cheapest comparable in every segment. The unit-economics guard (YX-BILL-09) must hold before we publish.

---

## 7. Caveats

- G2, Play Store, Reddit, Trustpilot (India pages) and Gartner were not readable directly; their figures are indirect and should be re-checked before public use.
- Several implementation-fee and renewal-uplift claims about Keka, Darwinbox and greytHR come from competitor blogs and are **unverified**.
- Indian staffing-agency complaints about GST invoicing and timesheets were inferred from product coverage, not from agency posts.
- Keka and greytHR list prices differ between trackers; verify on the vendor sites before quoting.
