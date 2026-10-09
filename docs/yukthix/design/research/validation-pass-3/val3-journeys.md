# Validation pass 3: end-to-end journeys (28 Sep 2026)

Lens: walk 7 cross-product journeys step by step and find broken hand-offs, missing steps and missing "moments that matter". Anything already in GAP-REGISTER (A–H, D1–D13, E1–E20) is excluded. I read §3–§6 of P14, P15, P16, M03, M10, M13 and M06 in full, and grepped the other docs for each step. **OK** = designed, **GAP** = the design is silent or broken (ID refers to the consolidated table).

## Journey 1: 12-person startup, self-serve at 11 pm

| # | Step | Doc § | Status |
|---|---|---|---|
| 1 | Sign-up, trial, setup hub | P14 §6.1, Q4; APX-E | OK |
| 2 | Excel import of employees, compensation, bank, statutory IDs | P15 §3, §6.1, YX-MIG-01..07 | OK |
| 3 | PF/ESI applicability for a 12-person firm (ESI at 10+, PF voluntary under 20, later mandatory) | P07 §1 (per-employee category only), P01 (voluntary PF) | **GAP J1**: no headcount-based coverage monitor (only CLRA has one, YX-CLRA-01) |
| 4 | UAN / ESI IP for first payroll | M03 YX-PAY-05 (E11) | OK |
| 5 | Single admin approves own run | P02 YX-SEC-12 | OK |
| 6 | Trial → live: payment method, first live payroll | P14 Q4 (bank files disabled in trial), YX-BILL-12/15 | **GAP J2**: salary due before the e-NACH mandate is active; no rule for going live while the mandate is pending |
| 7 | Salaries paid (bank file / payout API) | M03 §6.3.6; P10 Q5 | **GAP J2**: payout-partner KYB, funding account, low balance and partial payout are not designed |
| 8 | Subscription auto-debit | P14 YX-BILL-15 | OK |
| 9 | CA joins later | P16 §6.2, YX-PTR-01/05 | OK. Minor **J28**: a CA who isn't a verified firm yet waits on verification |

## Journey 2: 3,000-person manufacturer, 4 entities, 900 contract workers, 3 unions, greytHR mid-year

| # | Step | Doc § | Status |
|---|---|---|---|
| 1 | 4 entities, locations, pay groups | P01; M03 §3 | OK |
| 2 | greytHR mapper, YTD, history, parallel run | P15 Q1, YX-MIG-11/12, M03 YX-TAX-15 | OK |
| 3 | Retro wage revision / union settlement effective before go-live → arrears | P06 Q4 (arrears = as-paid vs corrected); YX-MIG-12 (imported periods never recalculated) | **GAP J3** |
| 4 | Unions: dues check-off, settlements, strike / lockout / lay-off / retrenchment / VRS | none (only a P18 custom-object example, "Union membership") | **GAP J4** |
| 5 | Changing workmen's service conditions via the P19 rule builder | P19 YX-RULE-06/08 | **GAP J5**: no statutory notice (ID Act s.9A) and no link to M08 re-acknowledgement |
| 6 | Biometric devices, 6 plants, enrolment mapping | P10 Q4, `device_user_map`; M02 E19 backfill | OK. **J8** (data model: `device_user_map` has no person_type for contract workers). Later: **J27** dual feed during the parallel run |
| 7 | Contract workers, compliance packs, liability | M13 §3–§6 | OK |
| 8 | Contract worker → own employee | M10 §3 hand-off matrix (matches `employees` only) | **GAP J8** |
| 9 | Workplace accident at a plant | "accidents" register in P07 IN.REGISTERS / YX-PAY-39; no source record | **GAP J6** |
| 10 | Subscription invoices for 4 GSTINs | P14 `subscriptions.billing entity` (one per subscription) | **GAP J16** |

## Journey 3: campus drive through to rehire

| # | Step | Doc § | Status |
|---|---|---|---|
| 1 | 20 colleges, registration, coordinators, admit cards | T03 §3 B7, YX-DLV-15 | OK |
| 2 | Test + proctoring at scale | T03, T04, T08 | OK |
| 3 | Shortlist → M10 | T05 §6.4 | OK |
| 4 | Interview day for hundreds (panels, rooms, queues) | M10 §6.7 (per-candidate auto-slotting only) | **GAP J9** |
| 5 | Offers to ~500: bulk approve, generate, e-sign; conditional on final marks / medical | M10 YX-ATS-17/18 (single offer) | **GAP J9, J10** |
| 6 | LOI, long pre-boarding, batch joining, renege | M10 YX-ATS-18; M01 §3.5 | OK |
| 7 | Probation → confirmation | M01 §3.4; M06 §6.5 | OK |
| 8 | First appraisal (joined mid-cycle) | M06 §3 "population rules" only | **GAP J11** |
| 9 | Promotion, transfer | M06 YX-PERF-10; P01 YX-ORG-17 | OK |
| 10 | Exit, F&F, bond recovery | M01 §3.7–3.8, M07 Q5 | OK |
| 11 | Alumni | P05 Q6 (docs); portal parked (wave 6) | OK (parked by decision) |
| 12 | Alumnus applies again | M10 YX-ATS-03 (dedup by email / phone); employee match only at acceptance | **GAP J14, J15** |
| 13 | Rehire | P01 YX-ORG-19; M10 hand-off | OK |

## Journey 4: staffing agency

| # | Step | Doc § | Status |
|---|---|---|---|
| 1 | Client, rate card, client job | M10 §6.3 | OK |
| 2 | Vendor submissions (C7) | M10 §6.8, YX-ATS-26/27 | OK |
| 3 | Client interviews in portal | M10 §6.3.5 | OK |
| 4 | Placement → contractor employment | M10 §3; P01 "contract – deployed" | OK |
| 5 | Agency's own CLRA duties as contractor at the client site | M13 is principal-side only | **GAP J17** |
| 6 | Timesheets, client approval | M02 §B7; M10 §6.3.8 | OK |
| 7 | Client GST invoice, IRN | M10 Q7 | OK |
| 8 | Client disputes approved hours after invoice and payroll | M10 `client_disputes`, credit notes (not linked to pay) | **GAP J19** |
| 9 | Collections, client TDS, 26AS | M10 YX-ATS-16 (E17) | OK |
| 10 | Contractor payroll (rate-based) | M03 YX-PAY-24 (D4) | OK |
| 11 | Client converts contractor / permanent-placement fee | none | **GAP J18** |
| 12 | Contract end → bench / exit | M10 YX-ATS-15 | OK |

## Journey 5: one employee's year

| # | Step | Doc § | Status |
|---|---|---|---|
| 1 | Leave, WFH, regularisation | M02 §B3 | OK |
| 2 | Travel, expense, advance | M05 | OK |
| 3 | Loan (perquisite) | M03 Q4 | OK |
| 4 | Declarations, proofs, Form 16 | M03 YX-TAX-01..08 | OK |
| 5 | Appraisal while on maternity leave | M06 (silent); M02 E2 no-dismissal only | **GAP J11** |
| 6 | Learning with test | M07; T03 YX-DLV-13 | OK (D2 verified) |
| 7 | Grievance | M08 | OK |
| 8 | Maternity, return to work | M02 / M03 YX-PAY-26; E3 | OK |
| 9 | Inter-entity + inter-state transfer | P01 YX-ORG-17; M03 YX-TAX-13 (12B, declarations, loans) | OK for PF / ESI / tax. **GAP J25**: PT / LWF when the state changes mid-period or mid-half-year |
| 10 | Billing that month | P14 Q1 (counted per legal entity) | **GAP J15b**: one person billed twice |
| 11 | Resignation, leave in notice | M01 §3.7; E10 | OK |

## Journey 6: admin year-end

| # | Step | Doc § | Status |
|---|---|---|---|
| 1 | Leave year-end, carry forward, encashment | M02 year-end; M03 YX-TAX-09 | OK |
| 2 | Bonus | M03 Q8, YX-PAY-16 | OK |
| 3 | Gratuity / leave provisions | M03 YX-PAY-15; APX-C finance provisions | **GAP J24**: no actuarial census export (Ind AS 19 / AS 15) |
| 4 | Audit access | P02 Auditor (time-boxed); P16 read-only auditor | OK |
| 5 | Annual returns | P07 calendar; M13 YX-CLRA-10 | OK |
| 6 | Next year's holiday list | APX-A `holiday.calendar.published` | OK |
| 7 | Policy updates via P19 | P19 YX-RULE-06/08 | **GAP J5** |
| 8 | Archive / retention | P02 §6; T05 YX-EVAL-08 | OK |

## Journey 7: incidents

| # | Step | Doc § | Status |
|---|---|---|---|
| 1 | Overpayment found after payment → recovery plan | M03 YX-PAY-30 | OK |
| 2 | Correction run, register new version | M03 §3 off-cycle, YX-PAY-39 | OK |
| 3 | Revised TDS in-year / correction 24Q | YX-TAX-02 / YX-TAX-08 | OK |
| 4 | Revised Form 16 / 16A after a correction return | none | **GAP J21** |
| 5 | Revised PF ECR / ESI for a paid, filed month | YX-PAY-21 ("regenerate with reason"); P07 7Q / 14B estimates only | **GAP J20** |
| 6 | Data breach at a tenant: record, clocks, notices | P02 YX-SEC-32; P12 Q6 | OK |
| 7 | Breach containment (revoke sessions / keys / grants, freeze bank changes and exports) | none | **GAP J22** |
| 8 | Proctoring appeal escalated to legal | T05 §6.2 ("decision is final"); legal hold named in YX-EVAL-08 | **GAP J23** |

## Cross-product data consistency

| Check | Result |
|---|---|
| Candidate → employee → alumni → candidate | Works at offer acceptance only (M10 hand-off matrix). Rehire-ineligible alumni are only caught at the offer (**J14**). There is no person master across candidate, employee, consultant, contract worker, vendor worker, campus registrant and test-taker (**J15**) |
| One test result reused across jobs | Not designed. T02 retake cooldown (Q5) would block a second invite for another job (**J12**) |
| Employee as test-taker (D2) | **Verified fixed**: T03 `subject_type`, YX-DLV-13, M07 §3, P02 YX-SEC-26. Remaining hole: an *internal applicant* taking a hiring test (**J13**) |
| Multi-product billing | HRMS vs Proctoring is consistent (P14 Q2 decision). Double count on inter-entity transfer (**J15b**). Contract worker, consultant and employee units are consistent (YX-BILL-10, YX-CLRA-12) |

## Consolidated gaps

| ID | Gap | Journey + step | Evidence | Suggested home | Size | Priority |
|---|---|---|---|---|---|---|
| J1 | **Establishment coverage monitor**: headcount-driven applicability per entity or establishment (ESI 10+, PF 20+ and "once covered, always covered", gratuity 10+, bonus 20+, POSH IC 10+, standing orders, crèche 50+) with an alert and setup task | J1-3 | Only CLRA has an applicability check (YX-CLRA-01); P07 applicability is per employment type (YX-STAT-13) | P07 + APX-E readiness + P04 scheduler | S | Should |
| J2 | **Go-live payment readiness**: (a) trial → live conversion while the e-NACH mandate is pending (grace or allow first run); (b) payout partner KYB, funding / virtual account, balance check before release, partial payout handling, bank cut-off times | J1-6/7 | P14 Q4 disables live bank files in trial; P10 Q5 names the payout API only | P14 §6.1 + P10 + M03 §6.3.6 | M | Should |
| J3 | **Arrears across the migration boundary**: a retro revision effective before go-live has no "as paid" base, because imported periods are never recalculated and document-only history has no lines. Need imported as-paid lines as the arrear base, or an arrears import | J2-3 | P06 Q4; YX-MIG-12; P15 Q2 docs-vs-data | P15 + M03 | M | **Must** |
| J4 | **Industrial relations pack**: union register and recognised union; check-off dues deduction and remittance per union; wage settlement / LTS with retro arrears by category; attendance statuses strike / lockout / lay-off; lay-off, retrenchment and closure compensation with government notices; VRS (s.10(10C)) | J2-4 | No hits for union dues, strike, lay-off, retrench or VRS in M01–M13 / P07 | M01 §3.7 + M03 + M02 + P07 `IN.IR` | L | Should (Must for the manufacturing segment) |
| J5 | **Change-of-conditions control in P19**: rule changes touching workmen's conditions need the statutory notice period (ID Act s.9A / IR Code) before the effective date; each rule version should link to the M08 policy document version and trigger re-acknowledgement or notice to affected employees | J2-5, J6-7 | P19 YX-RULE-06/08 cover approval and effective date only; M08 YX-POL-01 is separate | P19 law guard + M08 | S | Should |
| J6 | **Workplace accident / employment injury**: incident record (the source for the accidents register), ESIC accident report within its deadline, EC Act compensation for non-ESI staff, injury leave and pay treatment, GPA claim hand-off (M11) | J2-9 | "accidents" register listed in P07 / YX-PAY-39 with no producing record | M08 (case type) + M02 + M03 + M11 + P07 | M | **Must** (factory tenants: the register has no data) |
| J8 | **Contract worker identity across products**: the hand-off matrix matches only `employees`, so M13 `contract_workers` can't be converted with history. P10 `device_user_map` has `employee_id` only, while M13 punches carry `person_type` | J2-6/8 | M10 §3 hand-off; P10 §4; M13 §4 | M10 + P10 + M13 | S | Should |
| J9 | **Bulk campus hiring ops**: interview-day logistics (batch slots, panel rooms, walk-in queue, on-the-day feedback) and bulk offers (one approval for a batch, bulk letters and e-sign) | J3-4/5 | M10 auto-slotting is per candidate (§6.7); no bulk offer | M10 | M | Should |
| J10 | **Offer conditions**: conditions list (degree / final marks, medical fitness, documents, BGV) with due dates, evidence, auto-lapse or withdraw and the pre-boarding unwind | J3-5 | No condition tracking in M10 / M01 | M10 offers + M01 §3.5 | S | Should |
| J11 | **Review-cycle population dynamics**: joining cut-off, mid-cycle joiners, leavers and entity transfers, people on maternity or long leave (no adverse treatment), increment proration by months of service | J3-8, J5-5 | M06 §3 has "population rules" only; nothing on proration | M06 | S | Should |
| J12 | **Test result reuse**: validity window, "reuse existing result" for another job, how that interacts with the retake cooldown, and candidate consent to reuse | Cross | No reuse concept in T02 / T05 / M10 | T05 outcomes + M10 application scores | S | Should |
| J13 | **Internal applicant as test-taker**: subject type, result routing to M10 (not M07 / M06), and keeping the application and test result hidden from the current manager | Cross, J5 | YX-DLV-13 routes employee results to M07 / M06 only; internal-mobility privacy not stated | T03 + M10 + P02 | S | Should |
| J14 | **Early rehire / alumni detection**: flag the employee match (rehire-eligibility, YX-LC-10) at application or screening, not at offer acceptance | J3-12 | M10 §3 matrix runs "on acceptance" | M10 | S | Should |
| J15 | **Cross-role person identity**: no person link across candidate, employee, alumni, consultant, contract worker, vendor worker, campus registrant and test-taker. DSAR access and erasure, consent and dedup run per table and can miss records | Cross, J3-12 | P02 DSAR tracker (§6); separate tables in M10, M03, M13, T03 | P01 (person link) + P02 DSAR resolver | M | **Must** (DPDP DSAR completeness) |
| J15b | **Billing double count**: an inter-entity transfer in a month counts one person as 2 HRMS units ("per legal entity") | J5-10 | P14 Q1 / YX-BILL-02 | P14 | S | **Must** (published $1 price; trust) |
| J16 | **Invoice per legal entity / GSTIN**: a group needs GST invoices per entity for ITC and cost allocation; a subscription has one billing entity | J2-10 | P14 §4 `subscriptions` | P14 | S | Should |
| J17 | **Agency-side CLRA**: the agency is the contractor at client sites. It needs a licence per client establishment, an outbound monthly compliance pack to the client and a client-portal proof upload | J4-5 | M13 is principal-employer only | M10 staffing + M13 (reverse mode) | M | Should |
| J18 | **Permanent placement and conversion fees**: perm fee (% of CTC) invoice, contract-to-hire conversion fee, replacement-guarantee period | J4-11 | M10 invoices come from timesheets only (Q7) | M10 | S | Should |
| J19 | **Post-invoice timesheet correction**: a client dispute on paid and invoiced hours → credit note linked to the pay recovery (or no recovery by policy) and margin restated | J4-8 | M10 `client_disputes`, credit notes; not linked to M03 recovery | M10 + M02 §B7 + M03 | S | Should |
| J20 | **PF / ESI corrections after filing**: arrear / supplementary ECR for under-remittance (incl. PF on arrears per YX-PAY-33), excess-remittance treatment, ESI past-period payment; 7Q / 14B / ESI interest as payable lines, not only estimates. The "regenerate with a reason" rule assumes a re-upload the portals don't allow | J7-5 | M03 YX-PAY-21; P07 YX-STAT-14 | M03 statutory hub + P07 formats | M | **Must** |
| J21 | **Correction artefacts**: revised Form 16 / 16A after a correction 24Q / 26Q (YX-TAX-08), superseding the old one with a notice to the employee or consultant; a correction statement for the overpaid month | J7-4 | No re-issue rule in M03 / P05 | M03 + P05 | S | **Must** |
| J22 | **Tenant breach containment toolkit**: one-click revoke of all sessions, API keys, OAuth and partner grants; forced re-auth; freeze bank-detail changes, bulk exports and payout release; incident banner for employees | J7-7 | YX-SEC-32 covers the record and clocks only; no containment actions in P12 / P02 | P12 + P02 | M | Should |
| J23 | **Proctoring dispute beyond appeal**: an escalation state after the "final" appeal (legal notice, court, DPB complaint); a legal-hold placement flow; a court-ready evidence export with an electronic-records certificate (BSA 2023 s.63, counsel to confirm); routing between controller (tenant) and processor (YukthiX) | J7-8 | T05 §6.2 step 4 "decision is final"; legal hold named, no flow | T05 + P02 + APX-G | M | Should |
| J24 | **Actuarial census export** for gratuity and leave liability (Ind AS 19 / AS 15) and booking the actuary's figures back as the provision | J6-3 | M03 YX-PAY-15 formula provision; APX-C provisions | M03 + APX-C | S | Should |
| J25 | **PT / LWF on a state change within an employment** mid-month or mid-half-year (TN / Kerala half-yearly, LWF deduction month): which state, proration, no double or zero deduction | J5-9 | M03 YX-PAY-19 "one deduction per period per employment"; E9 covers PF / ESI / tax only | M03 + P07 | S | Should |
| J27 | **Device feed during the parallel run**: biometric push goes to one server, so a relay or dual feed to the old system is needed while migrating | J2-6 | P10 Q4; P15 parallel run | P10 + P15 | S | Later |
| J28 | **CA not yet a verified partner**: an interim path (tenant Auditor / Payroll role now, link converts once the firm is verified) | J1-9 | YX-PTR-01 blocks links until verification | P16 | S | Later |

**Must for launch (6):** J3, J6, J15, J15b, J20, J21.
