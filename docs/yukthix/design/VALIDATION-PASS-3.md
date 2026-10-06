# Validation pass 3 — what is still missing for a gold-standard product

> **Date:** 28 Sep 2026. **Status: proposals only. Nothing here is added to the design docs until the founder decides.**
>
> **Method.** Five independent reviews, each with a lens the first two passes (GAP-REGISTER A–H, market additions G1–G17) did not use. Every reviewer read README and GAP-REGISTER first and grepped the whole design folder with several synonyms before calling anything missing:
> 1. **Laws in force or arriving 2025–2027** (India and global): R1–R20
> 2. **What leading HR / talent / assessment products ship in 2026**: T1–T24
> 3. **Industry verticals and global readiness**: V1–V18, G1–G13
> 4. **SaaS growth, customer lifecycle and operations around the product**: S1–S21
> 5. **Seven end-to-end journeys walked step by step**: J1–J28
>
> **Raw reports with the evidence for every row** (grep terms used, doc and section where it is missing or partial): [research/validation-pass-3/](research/validation-pass-3/).
>
> **Progress (28 Sep 2026):** §1 corrections done. **§2 Musts all decided and applied:** J6 accident module (M08 YX-CASE-14..16, M02 YX-LV-15, M03 YX-PAY-50, P07 YX-STAT-25), J20 PF/ESI post-filing corrections (YX-PAY-51, YX-STAT-26), J21 revised Form 130/131 (YX-TAX-20), J3 migration as-paid lines (YX-MIG-15, YX-PAY-52), J15 person record (P01 YX-ORG-26/27, P02 YX-SEC-36, M01 YX-LC-29/30, M13 YX-CLRA-14, M10 YX-ATS-33, P09 YX-MET-22), J15b billing once per person (YX-BILL-02/03/10), T10 identity chain + deepfake partner (T04 YX-PROC-19/20, T05 YX-EVAL-30, T03 YX-DLV-21, M10 YX-ATS-32, P10 YX-INT-11, M01 YX-LC-31), S1 own product analytics on P09 (YX-MET-19..21, YX-CONSOLE-08), S2/S3/S10/S11 new P20 (YX-GRO-01..10), S12 export invoices under LUT (YX-BILL-16/17), S13 synthetic probes (P13 brief), plus trial end (YX-TEN-08). Catalogues updated: APX-A 519 types, APX-B 512 events, APX-C 161 reports, APX-D 334 screens, APX-F 115 templates, APX-G 37 artefacts. **§3 Should items all decided and applied (28 Sep 2026)** — decisions in [research/validation-pass-3/SHOULD-DECISIONS.md](research/validation-pass-3/SHOULD-DECISIONS.md): India compliance (P07 YX-STAT-27..32, M03 YX-PAY-53..63, YX-TAX-21), pay types incl. weekly pay and piece rate moved to wave 3, lifecycle / attendance / cases (M01 YX-EMP-14..18, YX-LC-32/33; M02 YX-AT-27..30, YX-LV-16; M08 YX-CASE-17/18; M13 YX-CLRA-15; P19 YX-RULE-13/14), hiring and staffing (M10 YX-ATS-34..45; M12 YX-PRJ-15..17) with pay transparency for every company (starter ON), skills library replacing separate lists and AI agents with human confirmation (T01–T05, M06 YX-PERF-20..22, M07 YX-LRN-15, P10 YX-AI-13/14, YX-INT-12), growth and operations (P20 YX-GRO-11..17; P14 YX-CONSOLE-09, YX-BILL-18..21; P12 YX-SECOPS-12; M04 YX-MOB-19), BRSR and Board's-report packs (P09 YX-MET-23/24), and new **P21 Global readiness** (YX-GLB-01..16; P01 YX-ORG-28..30; P02 YX-SEC-37/38; UI brief principles 12–13). Catalogues: APX-A 601 types, APX-B 620 events, APX-C 206 reports, APX-D 403 screens, APX-E 194 editors, APX-F 135 templates, APX-G 42 artefacts. **Remaining: §4 Later and §5 Skip are recorded as-is.**
>
> **Result.** 109 rows, **98 distinct gaps** after merging duplicates. **20 are Must: 4 corrections (§1), because laws already in force were written as "to be verified", and 16 new items (§2).** An earlier draft said 22 new Musts; that was a miscount. The rest are Should (§3), Later (§4) and one Skip (§5). No reviewer found a problem with the core architecture; the gaps are laws that moved, blue-collar and industry pay types, cross-product identity, global prerequisites, and the growth machinery around the product.
>
> **Dates marked † in the raw regulation report were checked on the web; others are from memory and must be confirmed with counsel before acting.**

---

## 1. Corrections: laws already in force that the design treats as future

These are not new features. The design text was out of date.

> ✅ **All four corrections applied, 28 Sep 2026** (founder approved): C1 Labour Codes → P07 YX-STAT-20..23, M03 YX-PAY-47..49, M01 YX-LC-26..28 + YX-EMP-13, M02 YX-AT-25/26, M08 YX-CASE-12/13, M13 YX-CLRA-13; C2 Income-tax Act 2025 → P07 YX-STAT-24, M03 YX-TAX-19, forms renamed in P07 / M03 / APX-A / B / C / F (APX-F #106–108), section cross-walk left for the compliance owner; C3 DPDP Rules → P02 YX-SEC-34/35, YX-SEC-32 and YX-SECOPS-07 amended (1-year logs, 72-hour Board report), P13 brief and hosting model updated; C4 EU AI Act → P10 YX-AI-11/12 (classification table, 2 Dec 2027), T05 YX-EVAL-29, APX-G G-36/G-37. Items marked "verify" in those docs go to the compliance owner.

| ID | What changed | What the design says today | Fix |
|---|---|---|---|
| **R1** | **All four Labour Codes in force since 21 Nov 2025†** (wages, social security, OSH, IR) | P07, M01, M13 mark the 50 % wage-definition rule, fixed-term gratuity after one year and F&F within 2 working days as "verify status" | Dated rule sets in P07 (`IN.CODES` from 21 Nov 2025) with transition rules for periods that straddle the date; remove "verify" flags; also model the code duties the design lacks: appointment letter for every worker, free yearly health check-up for workers 40+, national floor wage, grievance redressal committee, retrenchment re-skilling fund contribution (R3) |
| **R4** | **Income-tax Act 2025 in force from 1 Apr 2026†**; sections renumbered; forms renamed (Form 16 → **130**, 16A → **131**, 24Q → **138**, 26Q → **140**, 27Q → **144**, 15G/H → **121**) | Sections and forms still cite the 1961 Act | Tax pack v2026 in P07 and M03 with an old/new split by period (periods to 31 Mar 2026 keep old forms); rename forms across M03, P07, APX-F, APX-A |
| **R9** | **DPDP Rules 2025 notified Nov 2025†**; consent managers from Nov 2026, main duties from **13 May 2027**† | "As the rules require"; logs kept 180 days (CERT-In) | Pin dates in P02 / P12; detailed breach report to the Data Protection Board within **72 hours**; keep processing logs **1 year**; children's-data and consent-manager hooks |
| **R12** | **EU AI Act**: Digital Omnibus (June 2026†) moves employment high-risk duties to **2 Dec 2027**; scope covers AI used on **employees** (attrition risk, performance scoring), not only hiring | P10 has no date; scope = recruitment only | Add date and widen scope in P10 / T05 governance (Should, needed before EU sales) |

---

## 2. Must — before launch (16 new items; V3 and the R3 duties were completed with correction C1, leaving 14)

| ID | Gap | Why it is a Must | Home | Size |
|---|---|---|---|---|
| **V3** (+R3c) | **Women on night shifts**: written consent, transport, minimum group, register; roster and auto-roster must enforce it as a law guard | Legal condition in factories, BPO, IT, hospitals | P07 rule + M02 roster constraint | S |
| **J6** (+V8) | **Workplace accident / injury**: incident record, ESIC accident report, Factories Act notice, Employees' Compensation claim, injury leave and pay | The statutory accidents register (YX-PAY-39) has no data source | New M01/M08 section + P07 forms | M |
| **J20** | **PF / ESI corrections after filing**: arrear / supplementary ECR, excess remittance, ESI past-period payment, 7Q / 14B interest | "Regenerate the file" assumes a re-upload the EPFO portal does not allow | M03 + P07 | M |
| **J21** | **Revised Form 16 / 16A (130 / 131)** after a correction TDS return, with notice to the employee or consultant | Corrections exist; certificates are never re-issued | M03 | S |
| **J3** | **Arrears across the migration boundary**: back-dated revision (e.g. union settlement) before go-live needs imported "as-paid" pay lines | Mid-year migration is our main sales path | P15 + M03 | M |
| **J15** (+J8, T6) | **One person across roles**: candidate, employee, alumni, consultant, contract worker, vendor worker, campus registrant, test-taker are unlinked records | DPDP access / erasure requests can miss records; conversions lose history; no total-workforce view | P01 person entity + P02 DSAR | L |
| **J15b** | **Billing double count**: a mid-month inter-entity transfer bills one person as 2 HRMS units | Contradicts the published $1 promise | P14 YX-BILL-02 | S |
| **T10** | **Deepfake and identity continuity across hiring**: deepfake / proxy detection in AI and live interviews; same person from application → test → interview → day-1 onboarding | Integrity is what YukthiX Assess sells | T04 / T05 / M10 / M01 | M |
| **S1** | **Product analytics and activation funnel** (feature usage events, sign-up → activation → paid, time to first payroll / first test / first job) | Cannot run a $1 PLG business blind | New P14 / P09 section | M |
| **S2** | **Trial-to-paid journey**: lifecycle nudges tied to setup progress, in-app upgrade moments, sales-assist hand-off | 30-day trial with no conversion design | P14 | S |
| **S3** | **5-minute first value per product** (Assess: send a library test; Hire: post a job; HR: add employees and see payslip preview) | The 67-check setup hub is right for payroll go-live, too slow for a trial | APX-E / P15 | S |
| **S10** | **Public help centre for admins** (searchable, versioned; academy later) | P14 names it as a support channel; nobody designs it | New ops doc | S |
| **S11** | **Incident and maintenance message templates** and notification types | YX-CONSOLE-07 sets timings, not content | P14 + APX-A | S |
| **S12** (+G10 part) | **Tax on non-INR invoices**: export of services under GST LUT (zero-rated), FIRC / e-BRC reconciliation | Otherwise foreign invoices carry 18 % IGST | P14 | S |
| **S13** | **Synthetic monitoring** of login, payslip view, bank file, test start, careers apply, feeding the status page | Status page promise has no probes | P13 team brief | S |
| **R1-R3** | Labour-code duties listed in §1 (appointment letter, 40+ health check, floor wage, grievance committee, re-skilling fund) | Law in force | P07 / M01 | M |

(The four §1 corrections are also Musts. Total Must = 20.)

---

## 3. Should — plan into waves (50 items, grouped)

**India statutory and compliance**
- **R5** ELI scheme (employment-linked incentive) claims and UAN activation by face authentication.
- **R6 + R7 + T5** SEBI BRSR workforce pack and Companies Act Board's-report disclosures (POSH counts, maternity-benefit statement, gender incl. transgender). YukthiX already holds every input.
- **R8** Disability status (RPwD) field and equal-opportunity policy artefact.
- **R20** GST e-invoice 30-day reporting guard.
- **J1** Establishment coverage monitor (ESI 10+, PF 20+, gratuity 10+, bonus 20+, POSH IC 10+, crèche 50+; "once covered always covered").
- **J4** Industrial-relations pack: union register, check-off dues, wage settlements, strike / lockout / lay-off / retrenchment / VRS.
- **J5** Statutory notice period before rule-builder changes to workmen's conditions, linked to policy re-acknowledgement.
- **J17** Staffing agency's own contract-labour duties at client sites.
- **J24** Actuarial census export for gratuity and leave liability.
- **J25** PT / LWF when an employee changes state mid-period.
- **J16** GST invoice per legal entity for groups.

**Pay types and industries**
- **V1** Piece-rate wages · **V2** incentive and commission plans · **V5** weekly / fortnightly pay UI (move from wave 6) · **V6** tips and service charge · **V7** on-call and standby pay.
- **V11 + T22** periodic re-verification of employees (BGV) · **V12** BFSI HR (block leave, fit-and-proper, insider-trading disclosures, code-of-conduct attestation) · **V13** licences gating work assignment · **V18** internal bench for IT services.

**Hiring and assessment**
- **T4 + R10 + R11** pay transparency (ranges on job ads, employee-visible bands, pay-history ban, right-to-information, gap reports). Must before selling in the EU or US pay-transparency states.
- **R13 / R14 / R15** US AI-hiring laws (NYC bias audit, Illinois AI video interview consent and deletion, Colorado / California ADMT). Must before US sales.
- **T8** WhatsApp / chatbot apply and screening · **T9** interview notetaker for human interviews · **T11** automated reference checks · **T12** candidate rediscovery · **T13** non-technical job simulations and role-play assessments · **T19** onboarding buddy.
- **J9** bulk campus interview day and bulk offers · **J10** offer conditions with auto-lapse · **J12** reuse a test result across jobs · **J13** internal applicant's test result routed to the application, hidden from the current manager · **J14** alumni detected at application · **J18** permanent placement and conversion fees · **J19** timesheet correction after invoice.
- **J11** appraisal cycles handling mid-cycle joiners, leavers, maternity leave and increment proration.
- **J23** proctoring dispute after the final appeal: legal hold and court-ready evidence export.

**AI and employee experience**
- **T1** Agentic AI with an action contract (tool calls that raise requests, human confirmation, per-agent scopes, audit) and manager / employee copilots.
- **T2** One skills library with skills inference (the base for T3 later).
- **T7** Office-attendance policy for hybrid work · **T14** AI course authoring and recommendations · **T17** connectors to global payroll / EOR providers.

**Growth and operations**
- **S4** What's new · **S5** feature requests, public roadmap, beta programme · **S6** cancellation reasons and win-back · **S7** customer referral programme and "Powered by" attribution · **S8** free SEO calculators and letter generators · **S9** Google for Jobs markup · **S15** cost per tenant · **S17** mobile performance budgets · **S18** integrations directory · **S10b** admin and partner academy.
- **J2** Go-live payment readiness (first payroll while the auto-debit mandate is pending; payout partner funding checks) · **J22** one-click breach containment for a tenant.

**Global (Must before the first customer in that region)**
- **G1** Arabic / right-to-left UI · **G2** country holiday feeds · **G3** name and address formats · **G4 + T18** visas, work permits, national IDs · **G5** IBAN / SEPA / ACH / BACS bank formats · **G9 + S16** region catalogue and tenant region move · **G10** KSA / UAE / EU e-invoicing · **R16** Emiratisation / Nitaqat / GOSI / Mudad · **R17** Singapore CPF / MOM · **R18** EU whistleblower timings · **R19** accessibility evidence for the whole HRMS (WCAG 2.2, EN 301 549, VPAT).

---

## 4. Later (21 items)

R2 gig and platform aggregator contribution · V4 night-shift cab roster · V9 canteen deductions · V10 construction workers (BOCW) and migrant registers · V14 driver trip allowances · V15 grant-wise salary and FCRA · V16 government pay matrix, DA and pension · V17 education HR · G6 13th / 14th-month pay · G7 semi-monthly pay and non-April tax years · G8 works councils · G11 cross-border employees and shadow payroll · G12 multi-currency pay in one run · G13 global contractor payouts · T3 internal talent marketplace · T15 continuous listening · T16 wellbeing signals · T20 financial wellness · T21 DigiLocker issuer / verifiable credentials · T23 visual org-design what-ifs · S14 game days · S19 A/B testing · S20 quarterly review pack · S21 community · J27 device feed during parallel run · J28 interim path for an unverified CA.

## 5. Skip

T24 game-based assessments (validity debate, heavy build; revisit with T13).

---

## 6. Confirmed as already covered (spot checks)

Maternity and crèche, POSH, apprentices, state Shops & Establishments registers, EPS higher pension, ESIC, deduction cap, contract labour, DPDP core, GDPR, BIPA, emotion-recognition ban, UAE WPS, e-invoice IRN, succession, career paths, attrition risk, workforce planning, pay equity, total rewards, OKRs and 1:1s, recognition, EWA, kiosk, shift swap, e-sign, OCR, DigiLocker pull, sourcing, AI interviewer, pre-boarding, AI-allowed tests, adaptive tests, dunning, health score, status page, support tiers, trust page, sub-processors, DPA, SOC 2 access, API changelog, feature flags, load tests, sandbox, export on exit, multi-currency pricing, offline mobile, product tours, demo data, employees as test-takers (D2).

---

## 7. How to decide (suggested order)

1. **Approve the four corrections (§1)** — they fix text that is already wrong.
2. **Decide the 16 new Musts (§2)** one by one, like earlier passes.
3. **Pick waves for the Should groups (§3)**; for the global group, tie each item to "before the first customer in region X".
4. **Record Later / Skip** as-is.
