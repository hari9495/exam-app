# Appendix F · Letter, document & message template library

> **Status:** 📋 Catalogue defined, 26 Sep 2026. Closes GAP-REGISTER **F7**; also covers the payslip layout (**F6 / U33**), the ID card (**C1**), the admit card (**B7**, placeholder), Form 131 (was Form 16A) and the consultant payment advice (**A8**), and register formats and the inspection pack (**A9**). **Extended 26 Sep 2026 (gap register):** rows 94–105 (ESOP grant letter, 1099-NEC statement, staffing vendor agreement, session report B5, three psychometric reports T06, contract-worker gate pass and CLRA registers / annual return M13, visitor pass and visitor acknowledgement M02 §B11); the admit card (#86) is firmed up now that B7 is decided (T03 YX-DLV-16). **Corrected 28 Sep 2026 (validation pass 3, C1 / C2):** Income-tax Act 2025 forms added from 1 Apr 2026 — #106 Form 130 (was Form 16), #107 Form 131 (was Form 16A), #108 Form 12BB successor (verify number); #76 / #78 / #79 kept for periods up to 31 Mar 2026; #6 and #53 cite the Labour Code duties (P07 `IN.OSH` / `IN.IR`). **Validation pass 3 Musts J6 / J21, 28 Sep 2026:** rows 109–111 (ESIC accident report, statutory accident notice, Employees' Compensation letter; M08 YX-CASE-15/16); revised Form 130 / 131 after a correction return reuse #106 / #107 (§3.4). **Validation pass 3 Must follow-up, 28 Sep 2026:** group N rows 112–115 (export invoice under LUT, P14 YX-BILL-16; incident and maintenance message sets, P20 YX-GRO-08; tenant deletion certificate for exit and trial end, P14 YX-TEN-04 / 08). **P23 follow-up 28 Sep 2026:** group P rows 136–143 (policy questionnaire and starter policy drafts, coach nudge text and 1:1 agenda, bias-check word lists, payslip cause strings, insurance comparison layout, partner offer label and redemption consent; §2.2).
> **Linked from:** [P05 §4.3](P05-letters-documents-esign.md) (the P05 list is the short form; this appendix is the complete shipped library) and P05 §11 row F7.
> **Principle (spec D17):** every template below ships as a **starter template** labelled "YukthiX starter — edit for your company" in the template list and editor. The company edits wording, layout, letterhead, signatory, languages, approval and QR settings. **Only law is fixed:** prescribed statutory forms, the mandatory contents of a GST tax invoice / credit note and of a wage slip, and legal notice periods come from P07 and are locked in the editor (YX-DOC-22).
> **New rules:** YX-DOC-20 (starter library & updates), YX-DOC-21 (verify page for restricted-area letters), YX-DOC-22 (legally mandatory content is locked).
> **Not in scope here:** notification wording (email / in-app / WhatsApp / SMS per notification type) belongs to APX-A, the P04 notification-type catalogue. The **email** rows below are only emails that carry or accompany a document.

---

## 0. Conventions

- **Type:** `letter` · `certificate` · `form` (agreement, declaration or statutory form) · `invoice` (GST tax invoice / credit note) · `notice` (formal notice, display notice or policy) · `email` (document-carrying email) · `document` (non-letter layout: payslip, ID card, admit card).
- **Signatory:** **AUTH** authorised signatory of the entity (director / HR head, P05 `signatories`) · **HR** HR signatory · **PAY** payroll signatory · **FIN** finance signatory · **DA** disciplinary authority · **APP** appellate authority · **IC** IC presiding officer · **EO** ethics officer · **L&D** L&D head · **TO** test owner · **EMP** the employee / candidate signs or accepts · **SYS** computer-generated, no signature line. Other signing parties (vendor, visitor) are named in words.
- **E-sign / DSC** (P05 §4.4, starter choice, company changes per type): **DSC** company digital signature (PAdES) · **Img** signature image · **OTP** employee click-to-accept with OTP evidence · **eSign** Aadhaar eSign optional add-on · **Ack** plain acknowledgement click · **—** none.
- **Languages:** **L4** = English, Hindi, Tamil, Telugu (launch set, YX-DOC-14) · **EN** English only · **EN†** prescribed government format (English; Hindi where the government publishes one).
- **QR verify default** (P05 Q5, YX-DOC-11): **On** · **On-G** on, but the public verify page shows the generic label "Confidential HR letter" instead of the letter type (YX-DOC-21) · **Off** starter off, company may switch on · **—** not applicable (statutory form verified elsewhere, e.g. TRACES; invoice uses the e-invoice IRN QR when e-invoicing applies).
- **Retention class** (P05 §4.7; legal floors ⚖️ from P07, company periods are starters):
  - **EMP** employee file: while employed, then *8 years after exit* (starter; aligned with the 7-year alumni access, YX-DOC-16, and 8-year audit retention, P08 Q7), never below a statutory minimum;
  - **STAT** statutory minimum from P07 (payslips, registers, tax and statutory forms), not shortenable;
  - **CASE** M08 Q7: 8 years after case closure, legal hold stops deletion;
  - **CAND** M10 Q6: non-hired candidates 12 months (6–36) then anonymised; moves to EMP on joining;
  - **FIN** finance and GST records: statutory minimum from P07 (GST / accounting record rules);
  - **TEST** T05 Q7 per data class; certificates follow the learning record (EMP) or the candidate (CAND);
  - **POL** while in force, then as long as any acknowledgement or case that refers to it is retained;
  - **VIS** M02 §B11 visitor data: company period (starter 90 days; ID images 30 days), then deleted.
- **Status:** **P05** = already in the P05 §4.3 library · **Named** = mentioned in a module doc but not in the P05 library (template now defined here) · **New** = new in this appendix · **New · placeholder** = listed so the library is complete; its detailed layout is designed with its owning work item (A8, A9, B7).

---

## 1. Rules

| ID | Rule |
|---|---|
| YX-DOC-20 | **Starter library.** Every template in this library ships as a versioned starter template labelled "YukthiX starter — edit for your company" in the template list and editor (never printed on issued documents). The company edits a copy; a later YukthiX starter version never overwrites a company-edited template and is offered as "new starter version available" with a diff. Issuing from a starter that nobody has reviewed shows the issuer a one-time warning and counts as an advisory readiness finding (APX-E YX-ORG-24). |
| YX-DOC-21 | **Restricted-area letters on the verify page.** Letters issued from a restricted-area case (POSH, disciplinary, grievance, whistleblower; P02) keep QR verification on by default (P05 Q5), but the public verify page shows the letter type only as "Confidential HR letter", with company, name, date and current / superseded status; the case type never appears outside the app. |
| YX-DOC-22 | **Legally mandatory content is locked.** For templates whose content is prescribed by law (statutory forms, GST tax invoice and credit note, wage slip / payslip, legally required notice wording) the editor locks the mandatory fields and blocks; the company may change branding, layout of non-mandatory parts, optional fields and language. A template cannot be activated when a mandatory field is missing (extends YX-DOC-15); the mandatory field list comes from P07 and changes with it. |

---

## 2. Library

| # | Template | Type | Trigger module & event | Signatory | E-sign / DSC | Languages | QR verify default | Retention | Status |
|---|---|---|---|---|---|---|---|---|---|
| **A** | **Hiring, pre-boarding & joining** | | | | | | | | |
| 1 | Offer letter (CTC annexure from M03 template) | letter | M10 offer approved (P03); exam-app offer in waves 4–6 | AUTH | Img + OTP; eSign opt. | L4 | On | CAND → EMP | P05 |
| 2 | Offer revision letter (supersedes previous version) | letter | M10 new offer version, YX-ATS-17 | AUTH | Img + OTP | L4 | On | CAND → EMP | Named (M10) |
| 3 | Letter of intent (LOI) | letter | M10 YX-ATS-18 / M01 YX-LC-24 campus hire | AUTH | Img + OTP | L4 | On | CAND → EMP | Named (M01, M10) |
| 4 | Offer withdrawal letter (after acceptance; reason) | letter | M10 YX-ATS-14 withdrawn · M01 YX-LC-12 unwind | AUTH | Img | L4 | On | CAND | Named (M01) |
| 5 | Pre-boarding welcome & joining instructions (first-day info, documents to bring, reporting place, manager, portal link) | email + PDF | M01 pre-boarding session created (`ats.offer.accepted` or Create employee); resent at journey offset *T−7* | HR | — | L4 | Off | CAND → EMP | New |
| 6 | Appointment letter (mandatory for every worker, OSH Code, P07 `IN.OSH`) | letter | M01 pre-boarding e-sign step / joining | AUTH | Img + OTP; eSign opt. | L4 | On | EMP | P05 |
| 7 | Placement / deployment letter (client, site, start / end, pay rate, reporting) | letter | M10 `ats.placement.started` | AUTH | Img + OTP | L4 | On | EMP | New |
| 8 | Rehire letter (continuity options chosen) | letter | M01 rehire, YX-LC-18 / YX-ORG-19 | AUTH | Img + OTP | L4 | On | EMP | P05 |
| 9 | NDA / confidentiality agreement | form | M01 pre-boarding e-sign (M01 Q2 key policies) | AUTH + EMP | OTP; eSign opt. | L4 | Off | EMP | Named (M01) |
| 10 | Asset acknowledgement | form | M01 §3.6 asset assigned / returned | EMP | Ack (OTP opt.) | L4 | Off | EMP | Named (M01) |
| 11 | Employee ID card (photo, name, code, designation, entity, blood group opt., emergency contact opt., QR) | document | M01 joined ("Mark joined"); reprint on photo / designation / entity change | AUTH | Img | EN (+ second script opt.) | On (verifies current employment only) | EMP (card void on exit) | New (C1) |
| **B** | **Probation, confirmation & job changes** | | | | | | | | |
| 12 | Confirmation letter | letter | M01 probation outcome confirm, YX-LC-01 | HR | Img | L4 | On | EMP | P05 |
| 13 | Probation extension letter | letter | M01 probation outcome extend | HR | Img | L4 | On | EMP | P05 |
| 14 | Increment / salary revision letter | letter | M03 compensation change · M06 `perf.comp.approved` (bulk) | AUTH | Img | L4 | On | EMP | P05 |
| 15 | Promotion letter | letter | M01 promotion change · M06 comp review | AUTH | Img | L4 | On | EMP | P05 |
| 16 | Transfer letter (variants: same entity; inter-entity with continuity summary, YX-EMP-08) | letter | M01 transfer change (P06) | AUTH | Img | L4 | On | EMP | P05 |
| 17 | Deputation / secondment / client-site posting letter | letter | M01 host posting start / end, YX-EMP-07 | AUTH | Img + OTP | L4 | On | EMP | P05 |
| 18 | Contract extension / renewal letter | letter | M01 contract extension change, YX-LC-19 | HR | Img + OTP | L4 | On | EMP | P05 |
| 19 | Conversion to permanent letter | letter | M01 conversion change, YX-LC-19 | AUTH | Img + OTP | L4 | On | EMP | P05 |
| 20 | Maternity leave approval letter (dates, statutory benefit, ESIC note) | letter | M02 maternity leave approved, YX-LV-10 | HR | Img | L4 | On | EMP | P05 |
| 21 | Long-absence approval letter (sabbatical / long LWP; return date, pay, bond) | letter | M01 absence start, YX-EMP-06 | HR | Img + OTP | L4 | On | EMP | New |
| **C** | **Pay, loans, bonus & tax** | | | | | | | | |
| 22 | Bonus / incentive letter (statutory bonus, performance bonus, incentive) | letter | M03 one-time pay approved (bonus / incentive) · statutory bonus run (M03 Q8) · M06 bonus-pool split | AUTH | Img | L4 | On | EMP | New |
| 23 | Retention-bonus / joining-bonus clawback agreement | form | M10 offer lines with clawback (Q3) · M03 retention one-time pay | AUTH + EMP | Img + OTP; eSign opt. | L4 | On | EMP | New |
| 24 | Loan / salary-advance sanction letter (principal, interest, EMI schedule, perquisite note) | letter | M03 loan request approved (Q4) | PAY | Img + OTP (schedule accepted) | L4 | On | EMP (until loan closed + retention) | New |
| 25 | Overpayment recovery consent (instalment plan) | form | M03 YX-PAY-30 | PAY + EMP | OTP | L4 | Off | EMP | Named (M03) |
| 26 | Cash / cheque disbursement acknowledgement | form | M03 YX-PAY-31 disbursement register | PAY + EMP | signature upload | L4 | Off | STAT | Named (M03) |
| 27 | **Payslip layout template** (U33; §3.1) | document | M03 `payslip.published` | SYS | — | L4 | Off | STAT | New |
| 94 | ESOP grant letter (plan, units, exercise price, vesting schedule, exercise window, leaver rule) | letter | M03 `esop.grant.approved`, YX-PAY-46 | AUTH + EMP | Img + OTP; eSign opt. | L4 | On | EMP | Named (M03) |
| **D** | **Self-service certificates** | | | | | | | | |
| 28 | Salary certificate | certificate | Self-service request (instant, P05 Q8) | AUTH | Img | L4 | On | EMP | P05 |
| 29 | Address proof letter | certificate | Self-service (instant) | AUTH | Img | L4 | On | EMP | P05 |
| 30 | Employment verification letter | certificate | Self-service (instant) | AUTH | Img | L4 | On | EMP | P05 |
| 31 | NOC (visa, higher studies, external engagement) | certificate | Self-service (instant) | AUTH | Img | L4 | On | EMP | P05 |
| **E** | **Conduct, cases & POSH** (restricted areas) | | | | | | | | |
| 32 | Show-cause notice (reply within 7 days) | notice | M08 disciplinary step 3, YX-CASE-07 | DA | Img + Ack | L4 | On-G | CASE | P05 |
| 33 | Inquiry / hearing notice (disciplinary) | notice | M08 inquiry scheduled | DA | Img + Ack | L4 | On-G | CASE | New |
| 34 | Suspension letter (pending inquiry; subsistence allowance) | letter | M08 Q5 suspension · M03 YX-PAY-23 | DA | Img + Ack | L4 | On-G | CASE | P05 |
| 35 | Warning letter (level, expiry) | letter | M08 decision = warning | DA | Img + Ack | L4 | On-G | CASE (+ EMP while active) | P05 |
| 36 | Disciplinary decision letter (warning / suspension / deduction / termination / no action; appeal route) | letter | M08 disciplinary decision | DA | Img + Ack | L4 | On-G | CASE | New |
| 37 | Appeal outcome letter (disciplinary or grievance) | letter | M08 appeal decided | APP | Img | L4 | On-G | CASE | New |
| 38 | Grievance acknowledgement & resolution letter | letter | M08 grievance acknowledged / resolved | HR (case owner) | Img | L4 | On-G | CASE | New |
| 39 | PIP letter (goals, support, check-ins) | letter | M06 PIP started (HR approved), YX-PERF-11 | HR | Img + OTP (employee acknowledges) | L4 | On-G | EMP | P05 |
| 40 | PIP outcome letter (met / extended / not met) | letter | M06 `perf.pip.closed` | HR | Img + Ack | L4 | On-G | EMP | New |
| 41 | **POSH complaint acknowledgement** (to complainant) | notice | M08 POSH complaint filed | IC | Img | L4 | On-G | CASE | New |
| 42 | POSH notice to respondent (with complaint copy; P07 7-day timeline) | notice | M08 POSH notice step, YX-POSH-03 | IC | Img; delivery logged | L4 | On-G | CASE | P05 |
| 43 | POSH hearing notice / summons | notice | M08 POSH hearing scheduled | IC | Img | L4 | On-G | CASE | P05 |
| 44 | POSH conciliation settlement record (no monetary basis, YX-POSH-04) | form | M08 conciliation at complainant's request | IC + parties | OTP | L4 | On-G | CASE | New |
| 45 | IC inquiry report & recommendation to employer | letter | M08 IC report (within 10 days of inquiry) | IC | Img | EN | On-G | CASE | P05 |
| 46 | Employer action-taken letter (POSH; within 60 days) | letter | M08 employer action | AUTH | Img | L4 | On-G | CASE | New |
| 47 | **IC constitution order & display notice** (members, contacts, how to complain) | notice | Hub card C17: IC constituted / membership change | AUTH | Img | L4 | On | POL | New |
| 48 | POSH annual report (to employer and District Officer) | form | M08 YX-POSH-06, compliance calendar | IC | Img | EN† | — | STAT | New · placeholder (format from P07 POSH parameters) |
| 49 | Whistleblower acknowledgement & outcome note (named reports) | notice | M08 whistleblower filed / closed | EO | — | L4 | On-G | CASE | New |
| **F** | **Exit & separation** | | | | | | | | |
| 50 | Resignation acceptance letter (accepted LWD, notice, leave-in-notice effect) | letter | M01 resignation accepted (P03), YX-LC-04 | HR | Img | L4 | On | EMP | New |
| 51 | Early release / notice buy-out letter (shortfall, who pays) | letter | M01 early release or buy-out approved | HR | Img + OTP (recovery accepted) | L4 | On | EMP | New |
| 52 | Resignation withdrawal acceptance | letter | M01 withdrawal approved | HR | Img | L4 | On | EMP | New |
| 53 | **Termination letter** (variants: during probation; performance after PIP; disciplinary; redundancy / retrenchment with ⚖️ notice or pay in lieu and retrenchment compensation per P07 `IN.IR`, government-permission reference at 300+ workers) | letter | M01 exit case type termination (blocked during maternity leave, YX-LV-10) | AUTH | Img; DSC opt. | L4 | On (On-G for the disciplinary variant) | EMP | New |
| 54 | End of contract letter (completion / non-renewal) | letter | M01 contract-end policy, YX-LC-19 | HR | Img | L4 | On | EMP | New |
| 55 | Retirement intimation & superannuation letter | letter | M01 retirement alert / exit case, YX-LC-20 | AUTH | Img | L4 | On | EMP | P05 |
| 56 | Retirement extension / re-employment letter | letter | M01 retirement extension change · re-employment (retired re-employed type) | AUTH | Img + OTP | L4 | On | EMP | P05 |
| 57 | Absconding notice 1 (return / explain by date; email + registered post) | notice | M01 absconding timeline step (starter day 7), YX-LC-17 | HR | Img | L4 | On | EMP | P05 |
| 58 | Absconding notice 2 (final notice) | notice | M01 absconding timeline step (starter day 14) | HR | Img | L4 | On | EMP | P05 |
| 59 | Deemed abandonment letter (LWD = last day present; recovery-only F&F) | letter | M01 absconding timeline step (starter day 21) | AUTH | Img | L4 | On | EMP | P05 |
| 60 | No-dues / clearance certificate | certificate | M01 clearance complete | HR | Img | L4 | On | EMP | New |
| 61 | Full & final settlement statement | letter | M01 F&F paid (YX-LC-06) | PAY | Img; DSC opt. | L4 | On | EMP | P05 |
| 62 | Relieving letter | letter | M01 LWD, exit case closed (subject to open-case hold, YX-LC-23) | AUTH | DSC | L4 | On | EMP | P05 |
| 63 | Experience letter | letter | M01 LWD (subject to open-case hold) | AUTH | DSC | L4 | On | EMP | P05 |
| **G** | **Death in service, nominees & next of kin** | | | | | | | | |
| 64 | Condolence letter to next of kin | letter | M01 death-in-service flow started, YX-LC-16 | AUTH | Img | L4 | Off | EMP | P05 |
| 65 | Dues statement to nominees / legal heir (per payee share) | letter | M01 / M03 death F&F computed, YX-PAY-27 | PAY | Img; DSC opt. | L4 | On | EMP | P05 |
| 66 | Claim guidance letter (EDLI, EPS family pension, PF, ESI dependant, gratuity) | letter | M01 death flow forms checklist | HR | Img | L4 | Off | EMP | P05 |
| 67 | Nominee claim cover letters (PF / EDLI / gratuity / insurance) | letter | M01 death flow, per claim | AUTH | Img | L4 | On | EMP | P05 |
| 68 | Nominee portal access letter (OTP login, what is released, until when; YX-DOC-19) | email + PDF | M01 nominee access granted | HR | — | L4 | Off | EMP | New |
| 69 | Nomination acknowledgement (PF / gratuity / insurance nominees recorded or changed; re-prompt on marriage) | letter | M01 `employee_nominations` changed · P06 marital-status change | HR | Ack (OTP opt.) | L4 | Off | EMP | New |
| **H** | **Statutory forms library** (prescribed formats, YX-DOC-22) | | | | | | | | |
| 70 | PF Form 11 (declaration) | form | M01 pre-boarding statutory item, YX-LC-22 | EMP | OTP | EN† | — | STAT | New · placeholder (A9) |
| 71 | PF Form 2 (EPF / EPS nomination) | form | M01 pre-boarding; nomination change | EMP | OTP | EN† | — | STAT | New · placeholder (A9) |
| 72 | ESIC Form 1 (declaration) | form | M01 pre-boarding (ESI-covered), YX-LC-22 | EMP | OTP | EN† | — | STAT | New · placeholder (A9) |
| 73 | Gratuity Form F (nomination) | form | M01 pre-boarding; nomination change | EMP (+ employer ack) | OTP | EN† | — | STAT | New · placeholder (A9) |
| 74 | Gratuity Form L (employer's notice of amount, within 15 days) | form | M01 exit / death, YX-LC-22 | AUTH | Img | EN† | — | STAT | New · placeholder (A9) |
| 75 | PF / EPS / EDLI claim-form pack (Form 13, 19, 10C, 10D, 20, 5 IF; employer attestation) | form | M01 exit / retirement / death checklists | EMP / nominee + AUTH | Img | EN† | — | STAT | New · placeholder (A9) |
| 76 | Form 12BB (employee investment declaration) — for periods up to 31 Mar 2026 (successor #108) | form | M03 declaration window | EMP | OTP | EN† | — | STAT | New · placeholder (A9) |
| 77 | Form 12BA (perquisites statement) | form | M03 year end (perquisites, YX-TAX-12) | PAY | DSC | EN† | — | STAT | New · placeholder (A9) |
| 78 | Form 16 (Part A imported from TRACES + Part B generated) — for periods up to 31 Mar 2026 (successor #106) | form | M03 year end; also to legal heir (YX-LC-16) and alumni | PAY | DSC | EN† | — | STAT | Named (M03, P05 Q2) |
| 79 | Form 16A (non-salary TDS, consultants; per consultant per quarter) — for periods up to 31 Mar 2026 (successor #107) | form | M03 26Q filed (YX-TAX-17); published in the Consultant login | PAY | DSC | EN† | — | STAT | New (A8) |
| 80 | IW-1 (international workers, monthly return) | form | M03 YX-PAY-33 | PAY | — | EN† | — | STAT | New · placeholder (A9) |
| 91 | Consultant payment advice (invoice, taxable value, GST, TDS section and amount, net paid, payment ref) | document | M03 consultant invoice paid, YX-PAY-38; published in the Consultant login; also staffing vendors (M10 YX-ATS-29, vendor portal) and CLRA contractors (M13 YX-CLRA-09, Contractor portal) | SYS | — | EN | Off | FIN | New (A8) |
| 92 | **Statutory register formats** (template family: labour-code unified registers — wages, attendance / muster, deductions, fines, advances, overtime, leave, bonus, maternity, accidents — plus legacy state S&E / Factories Act formats; one member per P07 `IN.REGISTERS` format version) | form | M03 period lock → register generation, YX-PAY-39 | AUTH | DSC | EN† (+ state language where prescribed) | — | STAT | New (A9) |
| 93 | Inspection pack cover sheet (entity, location, period, register list with format and register versions, signature details) | document | M03 inspection pack generated, YX-PAY-39 | AUTH | DSC | EN | — | STAT | New (A9) |
| 95 | 1099-NEC recipient statement (US contractors paid through the consultant register; payer, recipient TIN masked, nonemployee compensation) | form | M03 calendar year end, YX-PAY-45 (US pack) | PAY | — | EN† | — | STAT | New · placeholder (C4; format from the US country pack) |
| 106 | **Form 130** (was Form 16; salary TDS certificate under the Income-tax Act 2025, from tax year 2026-27; layout per the notified form) | form | M03 year end, YX-TAX-19; also to legal heir (YX-LC-16) and alumni | PAY | DSC | EN† | — | STAT | New (C2) |
| 107 | **Form 131** (was Form 16A; non-salary TDS certificate, consultants; per consultant per quarter from 1 Apr 2026) | form | M03 Form 140 filed (YX-TAX-17 / 19); published in the Consultant login | PAY | DSC | EN† | — | STAT | New (C2) |
| 108 | Form 12BB successor (verify number; employee investment / claims declaration under the Income-tax Act 2025, from tax year 2026-27) | form | M03 declaration window | EMP | OTP | EN† | — | STAT | New · placeholder (C2; number and fields from the P07 law version) |
| 109 | **ESIC accident report** (employer's report of an employment injury to ESIC; pre-filled from the M08 accident case; due within the prescribed time per ESI regs, verify) | form | M08 accident case for an ESI-covered person, YX-CASE-15 | AUTH | Img; DSC opt. | EN† | — | STAT | New · placeholder (J6; form and time limit from P07 `IN.ESI`) |
| 110 | **Statutory accident notice** (Factories Act / OSH Code notice of a reportable accident — death or disablement beyond the prescribed days — to the authority) | form | M08 accident case flagged reportable, YX-CASE-15 | AUTH | Img; DSC opt. | EN† (+ state language where prescribed) | — | STAT | New · placeholder (J6; form per state from P07 `IN.OSH` / transitional `IN.FACTORIES`) |
| 111 | Employees' Compensation letter (compensation computed with its calculation, P07 rule version, payment or commissioner-deposit details and due date; to the employee or dependants, with the deposit covering note to the commissioner where required) | letter | M08 EC claim computed / paid, YX-CASE-16 | AUTH | Img | L4 | Off | STAT | New (J6) |
| **I** | **Learning** | | | | | | | | |
| 81 | Training-bond agreement | form | M07 enrolment in a bonded course (Q5) | L&D + EMP | OTP | L4 | On | EMP | P05 |
| 82 | Training certificate (course / path completion, validity) | certificate | M07 `learning.enrolment.completed`, YX-LRN-02 | L&D | Img | L4 | On | EMP | Named (M07; exam-app certificate generalised) |
| **J** | **Staffing desk (client documents)** | | | | | | | | |
| 83 | **Client GST tax invoice** (per entity / GSTIN series; timesheet annexure; PO number; IRN / QR when e-invoicing) | invoice | M10 `ats.invoice.issued` from client-approved timesheets; also M12 project invoices (T&M, milestone, retainer; YX-PRJ-11, `source = project`) | FIN | Img; DSC opt. | EN | — (IRN QR) | FIN | New |
| 84 | **GST credit note** (linked to the invoice it corrects) | invoice | M10 dispute / short payment / correction, YX-ATS-16 | FIN | Img; DSC opt. | EN | — (IRN QR) | FIN | New |
| 85 | Client statement of account & dunning reminder | email + PDF | M10 dunning schedule, YX-ATS-16 | FIN | — | EN | — | FIN | New |
| 96 | Staffing vendor agreement (rate card, rate caps, right-to-represent, ownership window, confidentiality of client and candidate data, TDS section, pay-when-paid if chosen) | form | M10 vendor onboarded, YX-ATS-25 | AUTH + vendor | OTP; eSign opt. | EN | Off | FIN | Named (M10) |
| **K** | **Assessments** | | | | | | | | |
| 86 | Admit card / hall ticket (photo, test / drive, slot, venue or link, seat where assigned, ID rules, instructions, signed single-attempt QR; §3.3) | document | T03 `admit_card.issued`: eligible drive registration approved or slot booked (YX-DLV-16); reissue revokes the previous QR; also the YX-EVAL-14 alternate identity path | TO | Img | L4 | On (QR = signed check-in token, checked by the invigilator app) | TEST | New (B7) |
| 87 | Assessment certificate (certification tests) | certificate | T05 outcome passed (certificate template on the test) | TO | Img | L4 | On | TEST / EMP | Named (exam app `CertificateTemplate`) |
| 88 | Candidate score report (per T05 Q5 visibility settings) | document | T05 result released | SYS | — | L4 | On | TEST | New · placeholder (B5) |
| 97 | **Session report** (per attempt: candidate and test, identity result without ID image, session timeline with flag markers, key stills with face-blur option, integrity score and weights, incidents with verdict, reviewer and date; §3.6) | document | T05 `session_report.ready` (integrity review closed, or on demand watermarked "provisional — review open") | SYS | — | EN | Off (shared by expiring link, watermarked per viewer) | TEST | New (B5) |
| 98 | Psychometric recruiter report (scale profile vs named norm group with confidence bands, job-profile fit ranges, interview probes, response-quality flags; §3.7) | document | T06 `psych.report.released` (recruiter) | SYS | — | L4 | Off | TEST | Named (T06) |
| 99 | Psychometric candidate feedback report (plain-language, strengths first, no misreadable scores; company setting) | document | T06 `psych.report.released` (candidate), T06 Q5 | SYS | — | L4 | Off | TEST | Named (T06) |
| 100 | Psychometric development report (employee version for IDPs and coaching) | document | T06 `psych.report.released` (development), T06 Q6 | SYS | — | L4 | Off | EMP | Named (T06) |
| **L** | **Company documents & notices** | | | | | | | | |
| 89 | Starter policies: code of conduct, POSH policy, leave & attendance policy, IT acceptable use, whistleblower / vigil mechanism, anti-bribery | notice | M08 policy published (YX-POL-01); onboarding task (YX-POL-03) | AUTH | Ack; OTP for critical | L4 | Off | POL | New (starters for M08 Q6) |
| 90 | Holiday list notice | notice | M02 holiday calendar published | HR | — | L4 | Off | POL | New |
| **M** | **Sites, contract labour & visitors** | | | | | | | | |
| 101 | Contract-worker gate pass / ID card (photo, name, contractor, establishment, skill category, validity, QR; APX-F #11 pattern) | document | M13 `clra.worker.deployed`; void on `clra.worker.released` | AUTH | Img | EN (+ second script opt.) | On (verifies current deployment only) | STAT (card void on release) | Named (M13) |
| 102 | **CLRA register formats** (template family: register of contractors, register of contract workers per establishment and the other principal-employer registers in the dated `IN.CLRA` / `IN.REGISTERS` formats; one member per format version) | form | M13 period lock → register generation, YX-CLRA-03 / 10 | AUTH | DSC | EN† (+ state language where prescribed) | — | STAT | New (B17) |
| 103 | CLRA annual return (principal employer) | form | M13 YX-CLRA-10; due date from the compliance calendar (SCH-07) | AUTH | DSC | EN† | — | STAT | New · placeholder (B17; format from P07 `IN.CLRA`) |
| 104 | Visitor pass / badge (name, host, photo, date / window, location, single-visit QR) | document | M02 `visitor.registered` (QR pass in the invite) · `visitor.checked_in` (printed or on-screen badge) | SYS | — | EN (+ second script opt.) | Off (QR is the check-in token, not the verify page) | VIS | Named (M02) |
| 105 | Visitor NDA / safety-induction acknowledgement (per location rules) | form | M02 YX-AT-22, before entry (kiosk, invite page or reception) | visitor | Ack | L4 | Off | VIS | Named (M02) |
| **N** | **YukthiX platform documents** (YukthiX to the tenant; not company-editable except where noted) | | | | | | | | |
| 112 | **Export tax invoice under LUT** (variant of the YukthiX subscription invoice for a customer outside India: no IGST, the words "Supply meant for export under LUT without payment of IGST", LUT reference (ARN and financial year), currency and exchange rate; no valid LUT for the year = staff review, not issued) | invoice | P14 export invoice issued, YX-BILL-16 / 17 | YukthiX finance | DSC | EN | — (IRN QR where applicable) | FIN (YukthiX) | Named (P14) |
| 113 | Incident message set (stages investigating → identified → monitoring → resolved → post-incident summary; payroll-day note; per-channel wording in APX-A) | notice | P20 incident posted / updated, YX-GRO-08 / 09 (P14 YX-CONSOLE-07) | YukthiX (SYS) | — | EN | — | YukthiX status-page history | Named (P20) |
| 114 | Maintenance notice set (scheduled ≥ 72 hours ahead → reminder → started → completed; per-channel wording in APX-A) | notice | P20 maintenance scheduled, YX-GRO-08 / 09 (P14 YX-CONSOLE-07) | YukthiX (SYS) | — | EN | — | YukthiX status-page history | Named (P20) |
| 115 | **Tenant deletion certificate** (tenant, data deleted, date, crypto-shredding of keys, backup age-out date, legal holds and statutory carve-outs kept; one template for exit after cancellation and for trial deletion after the 30-day read-only period) | certificate | P14 tenant data deleted, YX-TEN-04 (exit) · YX-TEN-08 (trial end without switching on) | YukthiX (AUTH) | DSC | EN | On | YukthiX record (kept after the tenant is deleted) | Named (P14) |

### 2.1 Validation pass 3 Shoulds (28 Sep 2026)

Templates for the Should items of validation pass 3 (M01, M03, M06, M08, M10, P19, P21, T02, T03). **EN + AR** = English and Arabic side by side (P21).

| # | Template | Type | Trigger module & event | Signatory | E-sign / DSC | Languages | QR verify default | Retention | Status |
|---|---|---|---|---|---|---|---|---|---|
| **O** | **Validation pass 3 Shoulds (28 Sep 2026)** | | | | | | | | |
| 116 | Incentive plan document (plan, targets, slabs, payout timing, eligibility; per employee annexure) | notice | M03 YX-PAY-53…63 plan published (APX-D PAY-32) | AUTH | Ack | L4 | Off | EMP | New |
| 117 | Commission plan & clawback terms | notice | M03 YX-PAY-53…63 plan published; employee acknowledges before first statement | AUTH | OTP | L4 | Off | EMP | New |
| 118 | Tips pool policy (collection, distribution basis, service-charge treatment) | notice | M03 YX-PAY-53…63 pool rule published (APX-D PAY-34) | HR | Ack | L4 | Off | POL | New |
| 119 | On-call & standby pay policy | notice | M03 YX-PAY-53…63 / M02 rule published (APX-D PAY-35) | HR | Ack | L4 | Off | POL | New |
| 120 | Piece-rate card (items / operations, rate, effective date; minimum-wage guarantee line ⚖️) | document | M03 YX-PAY-53…63 rate card published (APX-D PAY-31) | PAY | — | L4 | Off | STAT | New |
| 121 | Union check-off authorisation (and revocation) form | form | M01 / M03 employee authorises deduction for a union (APX-D PAY-36) | EMP | OTP | L4 | Off | EMP | New |
| 122 | VRS scheme letter (scheme offer, benefits, acceptance window, acceptance and relieving; listed by E1 and E2, one template) | letter | M01 YX-LC-32/33 scheme launched / application accepted (APX-D PPL-40) | AUTH | Img + OTP | L4 | On | EMP | New |
| 123 | Equal-opportunity policy | notice | M08 policy published (YX-POL-01); onboarding task | AUTH | Ack | L4 | Off | POL | New |
| 124 | Notice of change (IR Code; change in conditions of service, displayed and sent before the change) | notice | P19 YX-RULE-13/14 notice-of-change panel (APX-D PLT-44) | AUTH | — | EN† (+ state language) | Off | STAT | New · placeholder (format from P07; **verify**) |
| 125 | Code-of-conduct annual attestation | form | M01 / M08 attestation cycle opened | EMP | OTP | L4 | Off | POL | New |
| 126 | Bilingual offer letter (Arabic / English) | letter | M10 offer approved for a UAE / KSA entity (P21) | AUTH | Img + OTP | EN + AR | On | CAND → EMP | New |
| 127 | Bilingual employment contract (Arabic / English; the Arabic text prevails where the law says so, **verify**) | form | M01 joining for a UAE / KSA entity (P21) | AUTH + EMP | Img + OTP | EN + AR | On | EMP | New |
| 128 | Bilingual payslip (Arabic / English layout of the payslip template, §3.1) | document | M03 run published for a bilingual entity (P21) | SYS | — | EN + AR | Off | STAT | New |
| 129 | Bilingual warning letter (Arabic / English) | letter | M08 warning issued for a UAE / KSA entity (P21) | DA | Img + OTP | EN + AR | On-G | CASE | New |
| 130 | End-of-service benefit statement (gratuity per P07 country pack, final dues) | letter | M01 exit settled for a UAE / KSA entity (P21) | PAY | Img | EN + AR | On | STAT | New |
| 131 | Singapore key employment terms (KETs) | form | M01 joining for a Singapore entity (P21) | AUTH | Img + OTP | EN | On | EMP | New |
| 132 | Singapore itemised payslip | document | M03 run published for a Singapore entity (P21) | SYS | — | EN | Off | STAT | New |
| 133 | Electronic-records certificate (Bharatiya Sakshya Adhiniyam s.63; for exported records produced as evidence) | certificate | M06 / M08 evidence export (APX-D PRF-15) | AUTH | DSC | EN | On | CASE | New · placeholder (format **verify with counsel**, APX-G G-42) |
| 134 | Evidence export cover sheet (case / dispute, items, hashes, export date, exporter) | document | M06 / M08 evidence export (APX-D PRF-15) | SYS | — | EN | On | CASE | New |
| 135 | Result-reuse consent text (candidate) | form | T02 YX-TB-19 / T03 YX-DLV-22/23 reuse offered (APX-D PRC-32) | EMP | Ack | L4 | — | CAND | New |

### 2.2 P23 Employee & manager assistants and marketplaces (28 Sep 2026)

Templates for [P23](P23-employee-manager-assistants-marketplaces.md) (YX-AST-01…19). AI output built on these starters stays a suggestion until a person accepts it (YX-AST-01); amounts shown in them always come from the M03 / P07 engines (YX-AST-05).

| # | Template | Type | Trigger module & event | Signatory | E-sign / DSC | Languages | QR verify default | Retention | Status |
|---|---|---|---|---|---|---|---|---|---|
| **P** | **Employee & manager assistants and marketplaces (P23)** | | | | | | | | |
| 136 | Policy & handbook questionnaire (industry, states, headcount, working pattern, leave and conduct choices; versioned answers) | form | P23 policy writer started (APX-D HLP-14), YX-AST-06 | HR | — | EN | — | POL | New |
| 137 | Starter policy drafts, one grouped row (leave, attendance and hours, code of conduct, POSH, expenses and travel, remote work, IT and data use, grievance, plus the employee handbook; clause source tags law / company / AI; "Not legal advice; review by counsel recommended", APX-G G-43; state law floors ⚖️ from P07) | notice | P23 `policy_draft.created` → approved into M08 (`policy_draft.approved`) | AUTH | Ack | L4 | Off | POL | New |
| 138 | Manager coach nudge text set (one phrasing per signal type: feedback gap, 1:1 overdue, unused leave, onboarding tasks open, goal off track; team-member names and counts only, never Special data or leave reasons) | notice | P23 `coach.nudge.sent` (SCH-96), YX-AST-10 | SYS | — | L4 | — | EMP | New |
| 139 | Suggested 1:1 agenda (goals off track, recent feedback, check-in notes, open actions; manager edits before use) | document | P23 coach agenda opened in the 1:1 screen (APX-D PRF-16) | SYS | — | L4 | Off | EMP | New |
| 140 | Bias-check word lists (gendered, personality, age-related and vague terms per language; inconsistency prompts rating vs text) | document | P23 review assistant (APX-D PRF-17), YX-AST-11 | SYS | — | L4 | — | POL | New |
| 141 | Payslip cause explanation strings (one per cause code: LOP, arrears, tax change, new / ended component, loan, one-time pay, wage add-back, withhold, "not explained, raise a query") | notice | P23 `payslip.diff.computed`, YX-AST-04 | SYS | — | L4 | — | STAT | New |
| 142 | Group insurance quote comparison layout (same fields for every quote: insurer, cover, sum insured, premium, waiting periods, exclusions; partner name and IRDAI licence; distribution disclosure APX-G G-45; no YukthiX recommendation) | document | P23 `insurance.quote.received` (APX-D PAY-43), YX-AST-14 | SYS | — | EN | Off | FIN | New |
| 143 | Partner offer label and redemption consent sheet ("Partner offer" label; fields to share, each ticked by the employee; partner terms link APX-G G-46) | form | P23 perk redemption (APX-D ENG-12), YX-AST-16 | EMP | Ack | L4 | — | EMP | New |

**Count:** 143 templates — 36 already in the P05 library (**P05**), 22 named in module docs and now defined (**Named**), 67 **New**, 18 **New · placeholder**. By type: letter 50 · form 37 · notice 22 · certificate 9 · document 19 · email + PDF 3 · invoice 3. Rows 136–143 (group P, P23 assistants and marketplaces, 28 Sep 2026, §2.2) are numbered after 135; before: 135 templates (P05 36 · Named 22 · New 59 · placeholder 18). Rows 116–135 (group O, validation pass 3 Shoulds, 28 Sep 2026, §2.1) are numbered after 115; before: 115 templates (P05 36 · Named 22 · New 41 · placeholder 16). Rows 91–93 (A8 / A9) and 94–105 (gap-register features, 26 Sep 2026; group M added) are numbered after 90 so existing numbers stay stable. Before the 26 Sep 2026 extension: 93 templates (P05 36 · Named 10 · New 35 · placeholder 12). Rows 106–108 (Income-tax Act 2025 forms, correction C2, 28 Sep 2026) are numbered after 105; before C2: 105 templates (P05 36 · Named 18 · New 38 · placeholder 13). Rows 109–111 (workplace accident / injury, validation pass 3 Must J6, 28 Sep 2026) are numbered after 108; before J6: 108 templates (P05 36 · Named 18 · New 40 · placeholder 14). Rows 112–115 (group N, YukthiX platform documents; Validation pass 3 Must follow-up, 28 Sep 2026) are numbered after 111; before: 111 templates (P05 36 · Named 18 · New 41 · placeholder 16).

---

## 3. Non-letter templates

### 3.1 Payslip layout template (U33)
- **Editor:** *Payroll › Payslip layout* (APX-E #106), per entity and optionally per pay group; preview with a sample employee and the last run; language tabs (L4); versioned (a published payslip keeps its layout version, YX-PAY-12).
- **Blocks** (order and visibility editable): letterhead · employee block (name, code, designation, department, location, PAN masked, UAN, bank masked, pay period, paid days, LOP days) · earnings · deductions · employer contributions (starter: shown) · one-time pay · loans and balances · YTD · tax summary (regime, projected tax, TDS this month) · net pay in figures and words · attendance summary · leave balances (starter: off) · "why this number" link into the app (never figures in the link) · footer text.
- **Locked (⚖️, YX-DOC-22):** the wage-slip particulars required by the applicable P07 rule set for the employee's state and establishment type; the company cannot hide them.
- **Components** appear per their "shown on payslip" flag (M03 §3). Watermark with name and download time on download (YX-MOB-07). A password-protected PDF attachment is not in scope (GAP B19 is undecided).

### 3.2 GST tax invoice & credit note (staffing desk)
- Template = layout + the mandatory GST particulars locked by YX-DOC-22 (supplier and recipient GSTIN, unique serial per series and FY, date, place of supply, SAC, taxable value, rate and CGST / SGST / IGST split, signature or IRN / QR when e-invoicing applies). Company edits: logo, layout of optional parts, bank details block, terms, timesheet-annexure format, PO number display.
- Numbering series per entity / GSTIN (M10 Q7, APX-E #153); a credit note always references its invoice.

### 3.3 ID card and admit card
- **ID card:** CR80 layout (front / back), fields picked from the employee record within P02 (Confidential / Special fields cannot be placed); QR opens the verify page, which shows only company, name, photo and "currently employed: yes / no". Printing is a batch export (PDF sheet); no card-printer integration at launch.
- **Admit card / hall ticket (B7, T03 YX-DLV-16):** A5 / A4 PDF and in-portal card, generated from `admit_cards` when an eligible drive registration is approved or a slot is booked. **Blocks:** company / drive header; candidate name, photo (registration photo), registration or roll no., institution (campus drives); test or drive name, date, time + zone, reporting time; venue with centre and seat (test-centre mode, T03 C5) or the online link; ID rules (accepted IDs; institution-attested photo route, YX-EVAL-14); instructions (items allowed / prohibited, device and client requirements, T08); **signed single-attempt QR** (token hash only in `admit_cards`). **Reissue** creates a new version and revokes the old QR (a revoked or foreign QR fails at check-in, YX-DLV-16). The invigilator app scans the QR and runs the photo-ID check (YX-DLV-19). Company edits wording, logo, instructions and languages; the QR and identity blocks are locked.

### 3.4 Statutory forms (placeholders)
- Rows 70–80, 106–108 and 109–110 are generated from P07 form definitions (prescribed fields and layout, versioned with the rule set) and filled from the employee, nomination and payroll records; companies change only the letterhead / signatory where the form allows. Detailed field maps are designed with GAP **A9** (statutory forms library). **Form 131** (#107; Form 16A #79 for quarters up to 31 Mar 2026, A8 / C2) follows the P07 `IN.TDS` format of its law version, from TRACES in either filing mode, DSC-signed. The law version (P07 §4.8) picks the form: periods up to 31 Mar 2026 use #76 / #78 / #79, later periods #106 / #107 / #108. **Revised certificates (J21, M03 YX-TAX-20):** after a correction return, the same template (#106 / #107, or #78 / #79 for old periods) is issued again marked "Revised" and citing the certificate it supersedes; the earlier one is kept and shown as superseded on the verify page. The correction statement that accompanies it uses the payslip layout (#27).
- **Accident forms (J6):** #109 and #110 are pre-filled from the M08 accident case (YX-CASE-15) in the P07 form version valid on the accident date; mandatory fields are locked (YX-DOC-22); injury details on them are Special and the documents are visible only to the case team and the compliance scope.

### 3.5 Register formats & inspection pack (A9)
- **#92** is a template family: each member is one P07 `IN.REGISTERS` format version (state, family labour-code / legacy, valid_from / valid_to). Mandatory columns and layout are locked (YX-DOC-22); the company changes only letterhead and signatory. Rendered monthly as PDF and XLSX, DSC-signed, versioned on correction (YX-PAY-39).
- **#93** cover sheet lists every register in the inspection pack with its format version, register version and signature, and any superseded versions with the correction reason.

### 3.6 Session report (B5, #97)
- One PDF per attempt, generated when the integrity review closes (T05), or on demand with the watermark "provisional — review open"; stored as a P05 document, watermarked per viewer, shared by expiring link; `session_report.ready` (APX-B) notifies and feeds ATS connectors.
- **Blocks:** candidate and test; identity result (method, match result — never the ID image); session timeline with flag markers; key stills (count set by the company, starter 6; face-blur option); flags with the integrity score and its weights (T04 YX-PROC-14); incidents with verdict, reviewer and date. Company edits branding and the still count; evidence blocks are locked.

### 3.7 Psychometric reports (T06, #98–100)
- Rendered from `psychometric_reports` per audience and template version; every score names its norm group with confidence bands (YX-PSY-03); wording passes the banned-claims list (YX-PSY-06); fit is shown as ranges and probes, never pass / fail (YX-PSY-10).
- **Recruiter** (#98): scale profile chart, fit summary, interview probes, response-quality flags. **Candidate feedback** (#99): short, plain-language, strengths first; issued only when the company turns it on (T06 Q5). **Development** (#100): employee version for IDPs and coaching, always given to the employee (T06 Q6).

### 3.8 Gate pass, CLRA registers and visitor documents (M13, M02)
- **Gate pass (#101)** follows the ID-card layout (§3.3): Confidential / Special fields cannot be placed; the QR verify page shows only contractor, name, photo and "currently deployed: yes / no"; the pass is also the kiosk / biometric credential (YX-CLRA-04).
- **CLRA registers (#102)** are a template family like #92 (locked mandatory columns, DSC, frozen on period lock); **annual return (#103)** is a placeholder until P07 `IN.CLRA` formats are verified per state.
- **Visitor pass (#104)** and **acknowledgement (#105)** follow the location's rules (M02 §B11); the pass QR is a single-visit token that expires with the visit window; visitor records are deleted after the VIS retention period.
