# M13 · Contract Labour (CLRA) — Principal-Employer Compliance

> **Status:** ✅ Decided (by principle), 26 Sep 2026. 4 questions decided by principle (D17 / D18), §11. **Correction C1 (validation pass 3), 28 Sep 2026:** contract labour is governed by the OSH Code (contract-labour chapter) since 21 Nov 2025; the design maps to it (§1 mapping, YX-CLRA-13); §11 C1. **Validation pass 3 Must (J15), founder decision 28 Sep 2026:** contract workers attach to P01 persons; device map keyed by person (YX-CLRA-14, YX-CLRA-12 amended); §11 J15.
> **Covers:** GAP-REGISTER **B17** (CLRA contract-labour vendor compliance part), spec §1.3.15 (statutory compliance) for companies that use contractors' workers on their sites.
> **Builds on:**
> - P07: new statute `IN.CLRA` (thresholds, registration, licences, liabilities, returns; from 21 Nov 2025 its values come from the OSH Code contract-labour chapter in `IN.OSH`, with CLRA 1970 rules as transitional values where a state has not notified OSH rules), `IN.REGISTERS` (register formats), `IN.MW` (minimum wages), compliance calendar, advisory feed (YX-STAT-17);
> - M02: shared kiosk and biometric devices for site attendance;
> - P10: device connectors, penny-drop / PAN verification;
> - M03: consultant / vendor payouts (YX-PAY-37/38), TDS s.194C (YX-TAX-16);
> - P02: external logins (§4.7), sensitivity classes;
> - P05: documents, verification, gate-pass / ID-card template (APX-F #11 pattern);
> - P03 / P04: approvals and notifications; P08: locks and audit.
>
> **D17:** every company policy here (which proofs are required, verification depth, payment hold, alert lead times) is company-configured from a labelled starter template; only the law (`IN.CLRA`, minimum wages, register formats) is enforced. **D18:** all M13 features are included in the $1 price; portal-verification partner calls are third-party add-ons.
> **Build wave:** 5.
> Policies in this module are P19 policy points (D19): companies can change them and use any field, including custom fields; the values in this doc are starter rules.

---

## 1. Purpose & scope
A company that uses **contractors' workers** on its sites (housekeeping, security, loading, canteen, production support) is the **principal employer** under the **Occupational Safety, Health and Working Conditions Code, 2020 (OSH Code)**, whose contract-labour chapter has governed contract labour since **21 Nov 2025** in place of the Contract Labour (Regulation & Abolition) Act, 1970 (P07 `IN.OSH`; CLRA rules continue only as transitional rules where a state has not yet notified its OSH rules). It must:
- hold a **registration** for each establishment (the single establishment registration under the OSH Code) and use only **licensed** contractors;
- make sure contractors pay wages on time (at least minimum wage) and deposit PF / ESI;
- keep registers and file returns;
- pay the wages / contributions itself if the contractor fails, and recover them.

M13 gives the principal employer one place to do this.

**OSH Code mapping (Correction C1).** The existing design already fits the code; what changes are dated parameters in P07:

| Topic | CLRA 1970 (before 21 Nov 2025; transitional where OSH rules are not notified) | OSH Code (from 21 Nov 2025) | M13 |
|---|---|---|---|
| Applicability | 20+ contract workers | higher threshold (**50**, per OSH Code, verify with compliance owner) | YX-CLRA-01 reads the dated threshold; no design change |
| Principal-employer registration | CLRA registration certificate per establishment | **single registration** of the establishment under the OSH Code, covering contract labour | a `clra_registrations` row with `family` = OSH Code |
| Contractor licence | licence per establishment | licence under the code, including a **single licence** covering several establishments / states (scope and validity per OSH Code, verify with compliance owner) | `contractor_licences.scope`; YX-CLRA-02 checks the deployment against the scope |
| Registers and returns | CLRA state forms | registers and returns per OSH rules | dated `IN.REGISTERS` / `IN.CLRA` formats (YX-CLRA-10) |
| Principal employer's liability for unpaid wages and dues | yes | yes | YX-CLRA-07 / 08 unchanged |

**Out of scope:** the contractor's own payroll (the contractor runs it; they upload proof); staffing-desk contractors whom the tenant itself employs and pays (M10 / M03, employment category "deployed contractor"); consultants paid on invoice with no site workforce (M03 A8, though the same payout path is reused).

## 2. What exists today

| Piece | Today | M13 |
|---|---|---|
| Exam app / YukthiX so far | Nothing for contract labour | New module |
| M03 consultant register & invoices (A8) | Non-employee payees, invoice approval, TDS 194C / 194J, payout in the bank file | **Reuse** for contractor bills and payments (a contractor is a vendor payee in that register) |
| M02 kiosk and biometric devices | Punches for employees (kiosk id + location; device → employee map) | **Extend** the person reference to contract workers |
| P07 `IN.REGISTERS`, compliance calendar | Register formats per state, due dates | **Extend** with `IN.CLRA` formats and returns |
| P02 §4.7 external logins | Consultant, client contact and other OTP templates | **Add** a **Contractor (vendor)** template |

## 3. Concepts

| Term | Meaning |
|---|---|
| **Principal employer** | The tenant's legal entity, per **establishment** (a location), that engages contract labour |
| **Registration certificate (RC)** | The principal employer's registration per establishment: RC number, authority, contractors covered, maximum contract workers per contractor, nature of work, validity / amendments |
| **Contractor (vendor)** | A firm supplying workers: legal name, PAN, GSTIN, PF establishment code, ESIC code, LIN, bank account, contact; plus a **licence** per establishment |
| **Contractor licence** | Licence number, issuing authority, establishment, nature of work, **maximum workers**, valid from / to, renewal due |
| **Work order** | Contract between principal and contractor: scope, site, headcount, rate, period |
| **Contract worker** | A person deployed by a contractor: name, photo, ID (masked), DOB (18+ check), gender, UAN, ESIC IP no., skill category, wage rate paid by the contractor, site, deployment dates, gate-pass no. Not an employee of the tenant |
| **Gate pass** | Site access card for a deployed worker (QR, photo, contractor, validity); also the kiosk / biometric credential |
| **Monthly compliance pack** | Per contractor × establishment × wage month: the proofs the company's policy requires (PF ECR + challan / TRRN, ESI challan, wage register, muster, wage-payment proof, PT / LWF where applicable) and their verification status |
| **Liability alert** | A warning that the principal employer may become liable: wages unpaid or below minimum, missing / short challans, expired licence, workers above the licence or RC maximum, underage worker |
| **Tenant as contractor (J17)** | A staffing / facility-services tenant whose own employees are deployed at **client** establishments: the tenant holds a contractor licence per client establishment (or a licence whose scope covers it), and sends each client a **monthly compliance pack** for its deployed staff, uploading proof to the client's portal |

## 4. Data model

| Table | Key columns |
|---|---|
| `clra_registrations` | `legal_entity_id`, `location_id`, `rc_no`, `authority`, `family` (CLRA / OSH Code), `max_workers`, `nature_of_work[]`, `valid_from`, `valid_to`, `document_id`, `status` |
| `contractors` | `legal_entity_id`, `name`, `pan` (+ verified), `gstin`, `pf_code`, `esic_code`, `lin`, `payee_ref` (M03 consultant / vendor register), `contact`, `login_ref?`, `status` |
| `contractor_licences` | `contractor_id`, `location_id`, `scope` (establishment / state / multi-state, with covered locations or states; C1), `licence_no`, `authority`, `nature_of_work`, `max_workers`, `valid_from`, `valid_to`, `document_id`, `status` |
| `work_orders` | `contractor_id`, `location_id`, `scope`, `headcount`, `rate jsonb`, `valid_from`, `valid_to`, `document_id` |
| `contract_workers` (Personal / Special fields per P02) | `person_id` (P01 `persons`, J15), `contractor_id`, `name`, `photo_ref`, `id_type`, `id_masked`, `dob`, `gender`, `uan?`, `esic_ip?`, `skill_category`, `wage_rate`, `status` |
| `contract_deployments` | `worker_id`, `location_id`, `work_order_id`, `from`, `to`, `gate_pass_no`, `gate_pass_valid_to`, `status` |
| `vendor_compliance_packs` | `contractor_id`, `location_id`, `wage_month`, `required_proofs[]` (from company policy), `status` (open / submitted / verified / discrepancy / overdue), `due_on` |
| `vendor_proofs` | `pack_id`, `type`, `document_id`, `reference` (TRRN, challan no.), `amount`, `workers_covered`, `period`, `verification` (pending / verified / discrepancy), `checks jsonb`, `verified_by`, `verified_at` |
| `contract_wage_lines` | `pack_id`, `worker_id`, `days_worked` (declared), `days_on_site` (from attendance), `gross`, `pf`, `esi`, `net`, `paid_on`, `min_wage_ref` (P07 version), `flags[]` |
| `clra_alerts` | `type`, `contractor_id`, `location_id`, `wage_month?`, `severity`, `raised_at`, `resolved_at`, `resolution_note` |
| punches (M02) | `person_id` (P01 `persons`), `person_type` (employee / contract_worker, from the person's open role on the punch date), source kiosk / device, location |
| `device_user_map` (P10) | keyed by `person_id` (not employee or worker id), so an enrolment follows the person across roles (YX-CLRA-14) |
| `client_establishments` / `own_contractor_licences` / `client_compliance_packs` (J17) | client establishment: `legal_entity_id` (tenant as contractor), client name, site address, principal's RC no., `portal_ref`; licence: `licence_no`, `scope` (client establishments / states), `max_workers`, `valid_from` / `valid_to`, `document_id`; pack: client establishment, wage month, contents (from M02 / M03), `status`, `due_on`, `uploaded_at`, `portal_ack_document_id` |

All tables carry `organization_id` + RLS (P01). Worker ID numbers are stored masked (Aadhaar last 4 only, YX-SEC-08).

## 5. Rules (YX-CLRA)

| ID | Rule |
|---|---|
| YX-CLRA-01 | **Applicability:** an establishment's contract-worker count (active deployments) is compared with the dated `IN.CLRA` thresholds for its state; crossing a threshold without a valid registration certificate raises a liability alert to the compliance owner. |
| YX-CLRA-02 | **Licence and RC limits:** a worker can be deployed only through a contractor with a licence valid for that establishment on the deployment date, and only while the contractor's active deployments stay within the licence and RC maximums; the check runs at deployment and daily. Licence and RC expiry alerts fire at the company's lead times (starter: 60 / 30 / 7 days). |
| YX-CLRA-03 | **Worker register:** every deployed worker has name, photo, masked ID, DOB (deployment blocked under 18), gender, skill category, wage rate and deployment dates; the contract-worker register for the establishment is generated from these records in the `IN.REGISTERS` format valid on the period date. |
| YX-CLRA-04 | **Site attendance:** contract workers check in only with a valid gate pass, through the M02 kiosk or a mapped biometric device; their punches carry `person_type = contract_worker`, never create employee exceptions or payroll inputs, and give the **days on site** used to check the contractor's wage register. |
| YX-CLRA-05 | **Monthly compliance pack:** for each contractor × establishment × wage month, the proofs required by company policy (starter: PF ECR + challan, ESI challan, wage register, wage-payment proof) are due by the policy date (starter: 15th of the following month, never later than the statutory dates in `IN.CLRA` / `IN.CAL`); missing proofs after the due date raise an overdue alert. |
| YX-CLRA-06 | **Verification:** each proof is verified by a holder of `clra.proof.verify` (never the person who uploaded it) with automatic checks: challan period and establishment code match the contractor, workers covered ≥ workers with site attendance, amounts consistent with declared wages, wages per worker ≥ the P07 minimum wage for the state, zone and skill category, days paid ≥ days on site. Each failed check is a discrepancy the contractor must answer. |
| YX-CLRA-07 | **Liability alerts:** unpaid wages (no payment proof by the statutory wage date), wages below minimum, missing or short PF / ESI challans, expired licence / RC, over-limit deployment or an underage worker each raise an alert to the compliance owner and site HR with the principal employer's potential liability estimated; alerts stay open until resolved with a note (audited). |
| YX-CLRA-08 | **Payment hold:** under the company's policy (starter: **hold** the contractor's bill payment while the month's pack has unresolved overdue or discrepancy items, with override by the compliance owner giving a reason), M03 marks the invoice held; payment of wages directly by the principal employer, when needed, is recorded and recovered from the contractor's next bills. |
| YX-CLRA-09 | **Contractor payments:** contractor bills are consultant / vendor invoices in M03 (YX-PAY-38) with TDS s.194C (YX-TAX-16) and GST captured; the invoice links to its work order and month's pack. |
| YX-CLRA-10 | **Registers & returns:** principal-employer registers (e.g. register of contractors) and returns (e.g. annual return) are generated in the dated `IN.REGISTERS` / `IN.CLRA` formats, frozen on the period lock, DSC-signed (as M03 YX-PAY-39) and tracked in the compliance calendar. |
| YX-CLRA-11 | **Contractor login:** a contractor's representative uses the **Contractor (vendor)** external login (P02 §4.7: OTP, own records only, not a billed seat, expires when the contractor is deactivated) to maintain worker lists, upload proofs and bills, and answer discrepancies. |
| YX-CLRA-13 | **OSH Code mapping (C1):** for dates from 21 Nov 2025, `IN.CLRA` parameters (thresholds, registration, licence scope and validity, registers, returns) come from the OSH Code contract-labour chapter in P07 `IN.OSH`; CLRA 1970 values apply before that date and, after it, only as transitional values for a state whose OSH rules are not notified (P07 flag per state). A registration row is the establishment's single OSH Code registration (`family` = OSH Code); a contractor licence may cover several establishments or states (`scope`), and YX-CLRA-02 checks the deployment's establishment against it. Threshold numbers are per OSH Code, verified by the compliance owner before a state's pack is marked verified. |
| YX-CLRA-14 | **Contract workers are persons (J15, J8).** Every contract worker links to a P01 `persons` record (YX-ORG-27 matching; the duplicate check across contractors runs on the person); the biometric / kiosk `device_user_map` is keyed by the person, so when the worker converts to employee (M01 YX-LC-30) the same enrolment keeps working and punches from the conversion date carry `person_type = employee`; earlier punches, deployments and register rows stay as contract-worker records. |
| YX-CLRA-12 | **Billing:** each contract worker with site attendance in the month counts as one HRMS billable unit for that legal entity (**amended 28 Sep 2026, J15:** once per person, and not again if the same person is also a billable employee or consultant that month, P14 YX-BILL-02) (as consultants, P14 YX-BILL-10); a registered worker with no attendance that month is not counted; the Contractor login is never billed. |
| YX-CLRA-15 | **Tenant as contractor (J17).** When a legal entity is flagged as a contractor, deploying its employees to a client establishment needs a valid licence covering that establishment (per client establishment, or a single OSH Code licence whose scope covers it, verify) with headroom under its maximum; each wage month it builds a compliance pack per client establishment from M02 / M03 (wage register, muster, PF ECR / TRRN, ESI challan, wage-payment proof, PT / LWF) by the client's due date (D17), and HR records the portal upload (date, reference, acknowledgement document); an overdue or missing upload alerts HR and the account owner. |

## 6. Flows
1. **Set up an establishment:** record the RC (upload certificate), link contractors covered and maximums; the applicability check (YX-CLRA-01) runs.
2. **Onboard a contractor:** HR adds the contractor (PAN / bank verified per P10, also creating the M03 payee), licence(s) per establishment, work order; invites the contractor's representative to the Contractor login.
3. **Deploy workers:** the contractor submits workers (or HR imports a list, P15); checks run (age, licence, limits, duplicates across contractors); the site admin approves (P03); gate passes are issued (P05 template, QR) and the kiosk / biometric enrolment is mapped to the **person** (P10 `device_user_map`, YX-CLRA-14); a worker already known as a person (earlier deployment, past employee, applicant) is linked, not duplicated (P01 YX-ORG-27).
4. **Daily:** workers check in / out at the kiosk or device; the site board shows on-site count per contractor vs work-order headcount.
5. **Monthly:** pack opens → contractor uploads proofs and the wage register → automatic checks + verifier → discrepancies answered → pack verified; liability alerts on overdue / failed items (YX-CLRA-05/06/07).
6. **Contractor bill:** bill uploaded → approval (P03) → payment in the M03 run or off-cycle, or **held** per policy (YX-CLRA-08/09).
7. **Registers & returns:** monthly / annual registers generated and signed; annual return drafted from the year's data (YX-CLRA-10).
8. **Release:** deployment end → gate pass void, device mapping removed, worker kept in the register for the retention period (P02 §6.1).

**Events** (catalogued in APX-B; notification types in APX-A): `clra.worker.deployed`, `clra.worker.released`, `clra.licence.expiring`, `clra.registration.expiring`, `clra.pack.overdue`, `clra.proof.discrepancy`, `clra.pack.verified`, `clra.alert.raised`, `clra.payment.held`.

## 7. UI
- **Compliance › Contract labour** (desk): establishments & RCs; contractor register with licence tracker (expiry badges); worker register (filter by contractor / site / status); **monthly compliance matrix** (contractor × proof type × status); proof verification screen (document beside automatic check results); liability alerts list; registers & returns.
- **Site board** (Time › Today pattern): on-site contract workers per contractor vs headcount, gate-pass scan.
- **Contractor portal** (T9 external shell, Contractor login): my establishments, workers (add / release), monthly packs with upload slots, discrepancies, bills and payment status.
- Admin editors: required-proofs policy per establishment, due dates, lead times, payment-hold policy (APX-E pattern).

## 8. Migration & rollout
- New module; no exam-app data. Contractor, licence and worker lists imported through the P15 framework (templates, validation, dry run).
- Wave 5; needs P07 `IN.CLRA` and state register formats verified by the compliance owner and partner CA firm first ("verify status" flags cleared per state).
- Team actions: add the `clra.*` events and notification types to APX-B / APX-A; add the Contractor login notice (G-09 variant) to APX-G.

## 9. Acceptance tests
- Deploying a 31st worker for a contractor whose licence allows 30 at that establishment is blocked with the licence limit shown (YX-CLRA-02).
- A worker with DOB making them 17 cannot be deployed (YX-CLRA-03).
- A contract worker's kiosk punch appears on the site board and in the pack's days-on-site, and creates no employee exception or payroll input (YX-CLRA-04).
- An ESI challan covering 40 workers when 52 had site attendance in the month is flagged "short challan" and raises a liability alert (YX-CLRA-06/07).
- A wage register paying a Tamil Nadu unskilled worker below the P07 minimum for that zone is flagged with the rule version (YX-CLRA-06).
- With the starter hold policy, the contractor's October bill is held while the October pack is overdue; the compliance owner's override with a reason releases it and is audited (YX-CLRA-08).
- A contractor representative sees only their own workers, packs and bills in the portal (YX-CLRA-11).
- 60 contract workers with site attendance in November add 60 HRMS units to that entity's invoice; the 5 registered but absent all month add none (YX-CLRA-12).
- A contractor holding one OSH Code licence scoped to Tamil Nadu and Karnataka deploys workers at a Chennai site and a Bengaluru site with no per-site licence; deploying the same contractor's workers at a Kochi site is blocked with "licence scope does not cover Kerala" (YX-CLRA-13/02; Correction C1).
- An establishment with 35 contract workers raises no registration alert for December 2025 dates under the OSH Code threshold (50, per OSH Code, verify), but its October 2025 records are checked against the CLRA threshold of 20 (YX-CLRA-01/13; Correction C1).
- A staffing tenant deploys a 51st guard to a client site whose licence allows 50: the deployment is blocked; October's pack for that client is generated from payroll and marked uploaded with the portal acknowledgement (YX-CLRA-15; J17).

## 10. Open questions (decided by principle)

| # | Question | Recommendation |
|---|---|---|
| Q1 | How are vendor statutory proofs verified? | **Upload + verification by the principal employer with automatic consistency checks, included** (D18); online verification against EPFO / ESIC data via a partner as a **third-party add-on**; the required proof list per establishment is company policy from a starter template (D17). |
| Q2 | Do contractors get their own login? | **Yes: a Contractor (vendor) external login** (OTP, own records only, not a seat, P02 §4.7) to maintain workers, upload proofs and bills, and answer discrepancies; HR can still do everything on their behalf. |
| Q3 | Should missing proofs block contractor payment? | **Company policy (D17); starter template = hold the bill with a compliance-owner override and reason**, because the law makes the principal employer liable for unpaid wages and dues; alerts always fire whatever the policy. |
| Q4 | Are contract workers billed? | **One HRMS unit per contract worker with site attendance in the month**, following the consultant rule (P14 YX-BILL-10) and D18 (base price covers per-person running cost); the Contractor login is never billed. |

## 11. Decisions

| # | Decision | Date |
|---|---|---|
| Q1 | **Decided by principle (D17 / D18), user decision 26 Sep 2026 — recommended option adopted:** proof upload with principal-employer verification and automatic checks included; EPFO / ESIC online verification via partner as a third-party add-on; required proofs per establishment from a starter template. YX-CLRA-05/06. | 26 Sep 2026 |
| Q2 | **Decided by principle (D17 / D18), user decision 26 Sep 2026 — recommended option adopted:** Contractor (vendor) external login (OTP, own records, not a seat, expires on deactivation); HR can act on the contractor's behalf. YX-CLRA-11. | 26 Sep 2026 |
| Q3 | **Decided by principle (D17 / D18), user decision 26 Sep 2026 — recommended option adopted:** payment hold is company policy; starter template holds the bill while the month's pack has overdue / discrepancy items, with a compliance-owner override and reason (audited); liability alerts always fire. YX-CLRA-07/08. | 26 Sep 2026 |
| Q4 | **Decided by principle (D17 / D18), user decision 26 Sep 2026 — recommended option adopted:** each contract worker with site attendance in the month is one HRMS billable unit per legal entity (as YX-BILL-10); absent workers and the Contractor login are not billed. YX-CLRA-12. | 26 Sep 2026 |
| C1 | **Correction C1 (validation pass 3), 28 Sep 2026:** "as it commences" wording removed. Contract labour is governed by the OSH Code contract-labour chapter since 21 Nov 2025 (P07 `IN.OSH`; CLRA 1970 rules only as transitional values where a state's OSH rules are not notified). Thresholds per the code (50, per OSH Code, verify with compliance owner); single establishment registration and contractor licence that may cover several establishments / states (`contractor_licences.scope`); the existing design maps to it (§1 mapping table). YX-CLRA-13. | 28 Sep 2026 |
| Validation pass 3 Must (J15), founder decision 28 Sep 2026 | **Contract workers attach to P01 persons (J15, J8).** `contract_workers.person_id`; duplicate check across contractors on the person; biometric device user map keyed by person so punches follow the person after conversion to employee; billing once per person (P14 YX-BILL-02). §4, §6 flow 3, YX-CLRA-12 amended, YX-CLRA-14. | 28 Sep 2026 |
| Validation pass 3 Should (J17), founder decision 28 Sep 2026 | **Staffing agency's own contract-labour duties as contractor:** licence per client establishment (or scoped single licence, verify), monthly compliance pack per client from M02 / M03, proof of client-portal upload tracked. Wave 4. §3, §4, YX-CLRA-15. | 28 Sep 2026 |
