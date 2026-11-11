# Contract labour: live pages and their designs (check)

This file checks, story by story, that every Contract labour design sub-page can be reached in the live app, in the same
shape as `hiring-design-map.md`. Founder rule: never build a second, simpler version of a designed screen; make the
designed one live.

Status 10 Nov 2026 (branch `docs/yukthix-contract-labour-map`, from `test/yukthix-main` at 61b163d4a). Audit only:
nothing was built.

## What is live today (plain English)

- **CL-8 is live (11 Nov 2026, branch `feat/yukthix-contract-labour-cl8`):** CLB-06 … 08, we are the contractor: client
  sites with the client's registration number, our own licences, the placement block past our licence maximum, and the
  monthly client packs with the portal upload recorded (menu Contract labour › We are the contractor).
- **CL-6 is live (19 Nov 2026, branch `feat/yukthix-contract-labour-cl6`):** CLB-04, the contract-labour registers per
  month and establishment (frozen and DSC-signed with payroll's) and the annual return draft with the filing recorded.
- **CL-7 is live (18 Nov 2026, branch `feat/yukthix-contract-labour-cl7`):** CLB-05, a deployed contract worker becomes
  an employee through the joiner flow on the same person record (Contract workers › Make employee).
- **CL-1 is live (10 Nov 2026, branch `feat/yukthix-contract-labour-1`):** CLB-01 Contractors register on
  /yx/contract-labour/contractors (menu Contract labour › Contractors) and Settings 4.9 on /yx/settings/contract-labour.
  Contractors are the vendor record (`agencies`); licences with their copy, verified renewals, the deployment block and
  the expiry alerts. CLB-02 … 08 and the contractor portal (T9-13) are not built yet.
- **Some pieces around it are live:** HLP-12 accident cases already name a contractor (free text) and chase the
  contractor's filing; People knows a `contract_worker` person role (database check only; nothing creates one); the
  staffing desk has clients, placements, vendors and vendor bills; payroll has PAY 8 consultants with bills, TDS and an
  email-OTP portal; payroll registers are generated from the `IN.REGISTERS` rule set, frozen and signed with the DSC.
- **The designs are complete for a first build.** The screens are in `packages/yx-ui/src/screens/ops/contract.tsx`, the
  sample data in `contract-data.ts` and the checks (under 18, licence validity, licence scope by state, licence maximum,
  expiry lead times, short challan) in `ops-rules.ts` (`deployBlocks`, `expiryTone`, `challanShortfall`).

Verdicts (the same words as the other maps): **live** · **live (gap)** · **wire design** · **design only, feature not
built** (no API for this feature) · **phone view, mobile app not built**.

## Counts (sub-pages = stories)

| | groups | live | live, gap | wire design | feature not built | phone view | stories |
|---|---|---|---|---|---|---|---|
| A. Principal employer (contractors working at our sites) | 5 | 51 | 1 | 0 | 0 | 0 | 52 |
| B. We are the contractor (our staff at client sites) | 3 | 14 | 1 | 0 | 0 | 0 | 15 |
| C. Contractor portal | 1 | 20 | 0 | 0 | 0 | 0 | 20 |
| D. Settings | 1 | 1 | 2 | 0 | 0 | 0 | 3 |
| **All** | 10 | 86 | 4 | 0 | 0 | 0 | 90 |
Recounted by script 11 Nov 2026 on `feat/yukthix-cl-841`: CLB-02 ApproveBelowMinimum drawn and live (answer 844).
Recounted by script 11 Nov 2026 on `feat/yukthix-contract-labour-approved-801-825` after answers 803, 807, 810, 821, 822 (five new drawn stories).
Recounted by script 11 Nov 2026 on `feat/yukthix-contract-labour-cl8` after CL-8: group B live (four new drawn stories).
Recounted by script 11 Nov 2026 on `feat/yukthix-cl-walk-ui`: CLB-05 SamePersonPhoto drawn and live (answer 809).
Recounted by script 19 Nov 2026 on `feat/yukthix-contract-labour-cl6` after CL-6: CLB-04 live (Registers with a gap: the inspection pack stays in Compliance › Registers).

Of the 57 stories under Screens/Contract labour, 44 are live (CL-1 to CL-5 and CL-7); with the portal and settings pages, 64 of 79.

Recounted by script 10 Nov 2026 on `feat/yukthix-contract-labour-cl5` after merging CL-7 (CLB-05 live, 5 stories, and CLB-05 Start).

Related stories in other areas (counted in their own maps, listed here so the build reaches them):

| story | area map | verdict there | what contract labour must add |
|---|---|---|---|
| PPL-01 HrContractWorkers · HR · contract workers | people | design only | the directory card from the contract-worker deployments; (CL-5, answer 686) All persons on the workforce page now counts each contract worker once |
| PPL-12 Conversion · Contract worker conversion | people | live (gap) | a `contract_worker` joiner source (CLB-05 uses it) |
| PPL-35 Panel · Panel alone (contract worker to employee, nominee) | people | live (gap) | something that creates `contract_worker` roles |
| PPL-49 Retirements and contract ends (10) | people | live | nothing: these are fixed-term employees, not contract labour |
| HLP-12 ContractWorker · Contract worker · contractor not filed | helpdesk | live | link the free-text contractor to the contractor record |
| CMP-08 Labour-law updates feed | compliance | not built | the `IN.CLRA` rule set changes appear in it once built |
| HIR-14 Client workspace · contracts | hiring | live | the client's sites and our licences (group B) hang off the same client |

No Mobile or kit-group stories mention contract labour.

## 1. What can be reused (one model per job, no second copy)

| need | reuse | what is missing |
|---|---|---|
| Contractor (PAN, GSTIN, bank, TDS, bills) | `agencies` (staffing vendor: PAN, GSTIN, TDS section, bank verified, agreement, `consultantId` link to PAY 8) and `consultants` (PAY 8: encrypted PAN with status, bank with cooling-off, invoices, TDS certificates) | PF code, ESIC code, LIN, the kind of work, status "Payment held"; a `kinds` flag so one vendor can supply staff and contract labour |
| Contractor bills and the payment hold | PAY 8 `consultant_invoices` (status, approval workflow, TDS, payout batch), as the staffing vendor bills already do (answer 496) | a hold reason and a release with reason by the compliance owner (CLB-03 Override); finance sees but cannot release |
| Contractor portal sign-in | the email-OTP portal sessions of the staffing client portal (`staffing_portal_sessions`, `OtpService`) and the consultant portal (`consultant_portal_sessions`) | a contractor session table on the same pattern; the T9-13 tabs |
| Contract worker as a person | `persons` + `person_roles` with role type `contract_worker` (already in the check constraint) | a deployment table: worker, contractor, establishment, licence, from / to, skill, wage, gate pass and validity, UAN, ESIC IP, masked ID, status |
| Establishments | `locations` (state, min-wage zone, registered factory) and `legal_entities` | the principal-employer registration number per location (or reuse `statutory_registrations` with a new statute code, see 628) |
| Headcount against the threshold | `establishment_coverage` (statute, headcount, threshold, crossed on, rule version) | a contract-labour statute code and the nightly count from deployments |
| Law details (thresholds, licence rules, register formats) | `statutory_rule_sets` (statute is varchar(20), so `IN.CLRA` fits) and the existing `IN.OSH` and `IN.REGISTERS` rows | `IN.CLRA` rows per state, marked verify; contract-labour register types in `IN.REGISTERS` |
| Registers, freeze and DSC signing | `payroll/statutory-registers.service.ts` (`statutory_registers`: type, period, format version, frozen file, SHA-256, signed copy) | the contract-labour register types (contractors, workmen, muster roll, wages) and their row builders |
| Attendance | `time/kiosk.service.ts` (kiosk punches, credentials, face enrolment) and the muster in `attendance-ops.service.ts` | everything is keyed to `employeeId`; contract workers need a kiosk credential and day records on the deployment, or entry by the contractor on the portal |
| Minimum wages | the payroll minimum-wage top-up (`calc.ts`, `min_wage_topup`) and `locations.minWageZone` | a check of each worker's paid wage against the site's minimum (read-only, the contractor pays) |
| Licence expiry reminders | `time/licence-jobs.ts` (employee licences such as a forklift licence: 60/30/7-day style reminders) | the same nightly reminder shape for contractor licences (different table: those are a person's skills, not a CLRA licence) |
| Accidents with contract workers | HLP-12 `accident_cases.contractor` (text) and the contractor-filed reminder | a contractor id next to the text |
| Convert worker to employee | the PPL-12 joiner flow (sources new, ex_employee, internal) | a `contract_worker` source that ends the deployment the day before joining and carries identity and documents |
| We as contractor: client sites and deployed staff | staffing `staffing_clients` (state, GSTIN, contract), `staffing_placements` (client, employee, start / end, status) | a client-site row (address, state, the client's registration number) and our own licences with a maximum; block the placement past the maximum |
| Monthly packs for clients | payroll payslips, PF / ESI files and attendance per employee | a monthly pack per client built from the placed employees, with a recorded portal upload |
| Settings with defaults | the settings registry (`org-structure/settings-registry.ts`) and the 4.9 design in `registry-g4.ts` (keys `clra.registrations`, `clra.threshold`, `clra.licence_check`, `clra.licence_alerts`, `clra.min_age`, `clra.checklist`, `clra.doc_cutoff`, `clra.payment_hold`) | the keys in the API registry with their defaults, and a live 4.9 page |

## 2. Live pages

None.

## 3. Designs with no live page or API

All 46 stories in section 4: there is no contractor, licence, deployment, proof or contract-labour register API.

## 4. Design groups, story by story

### A. Principal employer (contractors working at our sites)

#### CLB-01 · Contractors register

| story (sub-page) | verdict | note |
|---|---|---|
| Register · Register · renewal alerts | live | the register, the renewal banner and (CL-2, answer 674) the site cards: contract workers against the licence maximums and the `IN.CLRA` threshold; (CL-5, answers 673 and 681) the site's registration number and its end, and the highest number on any day of the last 12 months (kept nightly) |
| Record · Contractor record (licence, work order) | live | statutory codes, licences, (CL-2, answer 675) work orders with workers against the headcount and (CL-3, answer 631) the contractor login: contacts with access; PAN "Verified" from the linked PAY 8 consultant |
| Expired · Expired licence record | live | an ended verified licence with no verified renewal: "Deployment blocked" (`deployBlock`) |
| Empty · Empty | live | |
| Loading · Loading | live | |
| AddContractor · Add contractor (CL-1) | live | `POST contract-labour/contractors`; a vendor of the same name becomes the contractor (answer 623), PAN must match |
| ChangeContractor · Change contractor details (CL-1) | live | `PUT contract-labour/contractors/:id` |
| AddLicence · Add licence (CL-1) | live | `POST …/contractors/:id/licences` with the copy; must cover the establishment's state; waits for verification |
| Blocked · Expired licence · deployment blocked (CL-1) | live | as Expired |
| Renew · Add renewal (CL-1) | live | `POST …/licences/:id/renewal`; only of a verified licence, ending later, one at a time |
| RenewalPending · Renewal waiting for verification (CL-1) | live | `POST …/licences/:id/verify` (clean copy only) |
| Reject · Reject a renewal with the reason (CL-1) | live | `POST …/licences/:id/reject` with the reason |
| ReadOnly · Read only (view key, CL-1) | live | `clra.contractor.view`: reads and opens the copy, no changes |
| WorkOrder · Add work order (CL-2) | live | `POST/PUT contract-labour/contractors/:id/work-orders`; number, dates, headcount, sites |
| InviteContact · Invite to contractor login (CL-3) | live | `POST …/contractors/:id/contacts` (emailed the portal link), `POST …/contacts/:cid/remove` (ends their sessions) |
| PeakNotCounted · Highest in 12 months before the first nightly count (803) | live | answer 803: "Counted tonight" until the 08:30 count has a peak for the site (also in Settings 4.9 registrations) |

#### CLB-02 · Contract workers register

| story (sub-page) | verdict | note |
|---|---|---|
| Register · Register | live | /yx/contract-labour/workers (menu Contract labour › Contract workers); `GET contract-labour/workers`; masked ID, gate pass and its end |
| Deploy · Deploy · checks pass | live | `POST …/workers/check` then `POST …/workers` (the checks run again; nothing is written when one fails) |
| LicenceFull · Deploy · licence maximum reached | live | deployed and waiting workers of the contractor at the site against the in-force licence's maximum |
| Underage · Deploy · under 18 blocked | live | date of birth and Aadhaar required; age on the first day against the rule set's minimum, never under 18; no override |
| OutOfScope · Deploy · licence scope excludes Kerala | live | `deployBlock`: a verified licence for the site in force on the day covering its state |
| Empty · Empty | live | |
| Error · Error | live | |
| Duplicate · Deploy · same ID already deployed (CL-2) | live | the keyed Aadhaar hash: pending or deployed anywhere in the company |
| Threshold · Deploy · registration threshold warning (CL-2) | live | (CL-5, answers 622 and 681) warns at `clra.threshold_warn` (default 80 %) of the `IN.CLRA` threshold; without a registration the threshold blocks; a registered site is held to its maximum |
| Approve · Site approval · induction and gate pass (CL-2) | live | `POST …/workers/:id/approve`: induction within `clra.induction_months`; gate pass GP-<site>-<n> ending first of deployment, licence and induction |
| ApproveBelowMinimum · Site approval · below the minimum wage (844) | live | answer 844: the 810 warning on the approval dialog when the wage (a portal-added worker's included) is below the site's minimum (IN.MW, verify); never blocks |
| Release · Release a worker (CL-2) | live | `POST …/workers/:id/release` (or withdraw before approval): the deployment and the contract_worker role end |
| ReadOnly · Read only (view key, CL-2) | live | `clra.contractor.view` |
| GatePassCard · Gate pass card (CL-5) | live | answer 735: the card with the worker's photo (`POST/GET …/workers/:id/photo`, JPG or PNG up to 5 MB, a new file each time), printable |
| RenewPass · Renew gate pass (CL-5) | live | answer 684: `POST …/workers/:id/gate-pass` keeps the number; the new end must be later (otherwise 409); a new induction when the last ran out |
| KioskPin · Kiosk PIN shown once (CL-5) | live | answer 625: `POST …/workers/:id/kiosk-pin`, a random 4-digit PIN kept only as its argon2 hash; five wrong tries lock it for 15 minutes |
| AttendanceMonth · Attendance month (CL-5) | live | /yx/contract-labour/attendance (menu Contract labour › Attendance); `GET contract-labour/attendance?month=`: days on site per contractor and site, from the kiosk or the contractor |
| ConfirmMonth · Confirm a month (CL-5) | live | `POST …/attendance/confirm`: a past month only, once (409 after); the month is then locked for the kiosk and the portal |
| ConfirmZeroDays · Confirm a month with 0 days (807) | live | answer 807: a month with no days asks "Confirm 0 days?"; any confirmation names the workers with 0 days |
| LowWage · Deploy · wage below the minimum, a warning (810) | live | answer 810: a clear warning under the wage when it is below the site's minimum (IN.MW, verify); never a block |

#### CLB-03 · Vendor compliance tracker

| story (sub-page) | verdict | note |
|---|---|---|
| Matrix · Matrix · liability alerts · payment holds | live | /yx/contract-labour/compliance (menu Contract labour › Vendor compliance); `GET contract-labour/compliance?month=`: the required proofs per contractor and site (answer 741: five with the muster roll, `clra.required_proofs`; PT / LWF stay design), the hold, liability alerts (wages below the minimum, short challans, overdue proofs), each emailed once to the compliance owners (answer 743) |
| Verify · Proof verification · short challan | live | `POST …/compliance/proofs/:id/verify` (a clean copy; a short challan is refused: raise a discrepancy) and `…/discrepancy` with a note; (CL-5, answer 742) days paid against days on site, confirmed or not yet |
| Override · Payment hold override with reason | live | `POST …/compliance/holds/release` with the reason, the compliance owner only; the PAY 8 bank file refuses held contractors' bills (`heldConsultants`) |
| Finance · Finance view (no override) | live | `clra.contractor.view` (finance holds no contract labour change key): sees holds and alerts, no Release |
| AllClear · All verified | live | |
| PayByUs · Record payment by us (CL-4) | live | `POST …/compliance/direct-payments`; taken off the contractor's next approved PAY 8 bill (`consultant_invoices.clra_recovery`) |

#### CLB-04 · CLRA registers & returns

| story (sub-page) | verdict | note |
|---|---|---|
| Registers · Registers | live (gap) | live 19 Nov 2026 (CL-6) at /yx/contract-labour/registers: per month and establishment the registers of contractors, contract workers, the muster roll and wages (IN.CLRA.REGISTERS per state, verify) from the deployments and the contractors' wage registers; muster and wages wait for a contractor without one; frozen and DSC-signed through the payroll registers service; the muster's days are the wage registers' until CL-5; the drawn Inspection pack button is not on this page (question 783) |
| Returns · Annual return | live | drafted from the year's deployments and wage registers (contractors, workers, most workers on a day, days worked, wages); "Open draft" is the PDF; "Record filing" keeps the day and the portal's reference once |
| Loading · Loading | live | loading |

#### CLB-05 · Convert worker to employee

| story (sub-page) | verdict | note |
|---|---|---|
| SamePerson · Same person kept | live | live 18 Nov 2026 (CL-7) at /yx/contract-labour/workers/[id]/convert: the same `persons` row; refused when not deployed, already an employee or already joining (GET lifecycle/joiners/from-contract-worker/:deploymentId) |
| SamePersonPhoto · Same person kept · with the gate pass photo | live | answer 809: `GET lifecycle/joiners/from-contract-worker/:id/photo` (the onboarding key; another company 404; none yet 404) |
| EndRole · End contract role | live | the last day is the day before joining (answer 637), shown, not chosen; the deployment, the gate pass and the role end on the joining day |
| Employee · Employee details | live | the PPL-12 joiner fields, entity and location pre-filled from the deployment's site; the drawn CTC is gone (pay is set in Pay after joining, question 772) |
| CarryOver · Identity and documents carried over | live | the same person; UAN and ESIC IP raised on the employee record on the joining day for HR to approve; only the last 4 ID digits exist, so the original is checked on the joining day |
| Review · Review and create | live | "Start pre-boarding": POST lifecycle/joiners/from-contract-worker/:deploymentId; the joiner goes to the Onboarding board |
| Start · Start · Make employee on a deployed worker | live | drawn 18 Nov 2026: "Make employee" on a deployed worker in Contract workers, for HR with the onboarding key |

### B. We are the contractor (our staff at client sites)

#### CLB-06 · Client establishments

| story (sub-page) | verdict | note |
|---|---|---|
| List · List | live | CL-8: `staffing_client_sites` under the staffing client, with the client's registration number |
| AtMaximum · Site at licence maximum | live | deployed = our active own-payroll placements at the site, against the covering licence |
| NotCovered · Site not covered by any licence | live | |
| Empty · Empty | live | |
| AddSite · Add client site | live | CL-8, drawn first |

#### CLB-07 · Own licences

| story (sub-page) | verdict | note |
|---|---|---|
| List · Licences · renewal due | live | same `contractor_licences` table as CLB-01, owner = our legal entity; Start renewal opens Add licence for the same site |
| Blocked · 51st deployment blocked | live | Staffing placement create refuses (`LICENCE_MAXIMUM`); the screen's banner is the drawing's, the refusal shows in the placement sheet |
| Empty · Empty | live | |
| AddLicence · Add licence | live | CL-8, drawn first: one client site, or a single licence for states; copy required |

#### CLB-08 · Client compliance packs

| story (sub-page) | verdict | note |
|---|---|---|
| Packs · Packs by client and month | live (gap) | wage register, muster and (answer 821) the PF and ESI remittances from payroll's filed returns; the drawing's wage payment proof and PT are not in the pack (question 841) |
| RecordUpload · Record portal upload | live | date, reference and acknowledgement file; no client-portal integration |
| AllAccepted · All accepted | live | |
| ChallanMissing · Pack · ESI challan not filed yet (821) | live | answer 821: the pack names a PF or ESI challan not filed for the month; made again once filed |
| MakePack · Make pack | live | CL-8, drawn first; a remake before upload needs a reason |
| RecordAcceptance · Record client acceptance | live | CL-8, drawn first |

### C. Contractor portal

#### T9-13 · Contract-labour vendor portal

| story (sub-page) | verdict | note |
|---|---|---|
| SignIn · Sign in (email OTP) | live | /yx/contractor/[org]; `POST public/contractor-portal/:org/code` always answers "sent" (no telling who has access), rate-limited per email and IP; `…/verify` gives a 60-minute session kept only as its SHA-256 hash |
| Licences · Establishments and licence renewals | live | `GET …/me`: the own contractor's licences per site with workers against the maximum and (answer 731) the issuing office |
| Workers · Workers | live | the own contractor's waiting and deployed workers, masked ID, gate pass |
| UnderAge · Add worker · under 18 blocked | live | `POST …/workers/check` then `…/workers`: the CL-2 checks, no override; the contractor is always the contact's own |
| LicenceFull · Add worker · licence maximum reached | live | as UnderAge |
| LowWage · Add worker · wage below the minimum, a warning (810) | live | answer 810: the same warning as the staff deploy sheet |
| Pack · Monthly pack · short challan | live | `GET public/contractor-portal/:org/packs`, `…/pack?locationId&month`: the five proofs (the company's required ones; the others read "Optional") with their checks, days paid against days on site (CL-5) |
| PackVerified · Monthly pack · verified | live | |
| Bills · Bills · payment on hold | live | `GET …/bills`: the contractor's PAY 8 bills with TDS, wages we paid taken back, and the hold |
| Phone · Monthly pack · phone | live | the same web portal at phone width (answer 641) |
| Due · What is due and work orders (CL-3) | live | licences ending or ended, renewals being checked or not accepted, gate passes ending within 30 days, workers waiting for approval |
| RenewUpload · Upload a renewed licence (CL-3) | live | `POST …/licences/:id/renewal` with the copy: another contractor's licence 404; pending until the compliance owner verifies it |
| RenewalChecked · Renewal being checked, renewal not accepted (CL-3) | live | the renewal's state and the reason it was rejected |
| NothingDue · Nothing due (CL-3) | live | |
| DuePhone · What is due · phone (CL-3) | live | the same web portal at phone width (answer 641) |
| UploadChallan · Monthly pack · upload a challan (CL-4) | live | `POST …/pack/items` with the copy, the workers covered and the amount; a verified proof is final |
| UploadWages · Monthly pack · wage register (CL-4) | live | each worker deployed that month: days, wage paid, paid on; the minimum wage shown for each (verify) |
| Withdraw · Withdraw a waiting worker (CL-4) | live | answer 736: `POST …/workers/:id/withdraw` with a reason, the contractor's own waiting worker only (another's: 404); audited `via: contractor_portal` |
| Attendance · Attendance · mark the days (CL-5) | live | answer 625: `GET/POST public/contractor-portal/:org/attendance` where the site has no attendance kiosk (or `clra.attendance_source` is "contractor"); days inside the deployment, not in the future, not after the month is confirmed |
| AttendanceKiosk · Attendance · kiosk site (CL-5) | live | a kiosk site: the days from the workers' punches (gate pass number and PIN), read-only; entering refused (409) |

### D. Settings

#### Group 4 · Payroll & Statutory

| story (sub-page) | verdict | note |
|---|---|---|
| P4_9 · 4.9 Contract labour | live (gap) | the threshold and minimum age from `IN.CLRA` (verify), the licence block (law), `clra.licence_alerts`, the induction, the proofs due day and the hold; (CL-5) registrations with the 12-month peak (answer 673, added and changed in their sheet), `clra.threshold_warn`, `clra.attendance_source` and `clra.required_proofs` (answer 741); the per-site checklist ("Required at") stays design (question 751) |
| P4_9_ReadOnly · 4.9 Contract labour · read-only | live (gap) | without `clra.settings.manage` or `org.settings.manage` (or while acting for someone else) |
| P4_9_Registration · 4.9 Contract labour · registration (CL-5) | live | answer 673: `POST/PUT contract-labour/registrations`, `POST …/registrations/:id/remove` with the settings key; one active per site (409), version checked |

## 5. Two designs for one job

None found. Two places must stay one model: the contractor is the existing vendor (`agencies` + PAY 8 consultant), not
a new vendor table; and the licence table serves both CLB-01 (contractors' licences) and CLB-07 (our own licences).
Employee licences in Time (`licence_types`, `employee_licences`) are a person's skills and stay separate.

## 6. Questions for the founder (before building)

Every policy below becomes a company setting with the suggested default. Law details are rule-set data marked verify,
with a go-live line for counsel.

621. **Which law and which states?** Suggested: the OSH Code, 2020 contract-labour chapter from 21 Nov 2025 and the
     Contract Labour Act, 1970 for earlier dates, as the rule set `IN.CLRA` with one row per state (thresholds,
     licence rules, register formats), all marked verify. Start with the states our first customers use (Tamil Nadu,
     Karnataka) and add others as data.
622. **How do we count towards the threshold (50, or 20 before 21 Nov 2025)?** Suggested: per establishment, the
     highest number of contract workers on any day in the last 12 months, from the deployments, checked nightly; warn at
     80 % of the threshold (setting `clra.threshold_warn`, default 80 %) and alert the compliance owner when crossed.
623. **Where does a contractor live?** Suggested: the same vendor record as staffing vendors (`agencies`, with a flag
     "supplies contract labour"), adding PF code, ESIC code and LIN; its bills go through PAY 8 like answer 496.
     No second vendor table.
624. **Is a contract worker a person in YukthiX?** Suggested: yes, a person with a `contract_worker` role and a
     deployment (contractor, site, licence, from / to). Never an employee, never on our payroll; no login.
625. **Who enters contract workers' attendance?** Suggested: kiosk punches where the site has a kiosk, otherwise the
     contractor's supervisor on the portal; our site in-charge confirms the month before the muster is frozen. Setting
     `clra.attendance_source`, default "Kiosk where there is one, else the contractor".
626. **The principal-employer wage check.** The principal employer must make sure wages are paid on time and in full,
     and pays (then recovers) if the contractor does not. Suggested: each month the contractor uploads the wage
     register and bank proof; YukthiX checks each worker's paid amount against the site's minimum wage and the muster
     days, and raises a liability alert for any short or missing payment. Paying a worker directly is recorded by hand
     ("paid by us, recover from bill") and deducted from the next bill. Setting `clra.wage_check`, default on.
627. **Licences and renewals.** Suggested: alerts at 60, 30 and 7 days (already the 4.9 default); no grace day after
     expiry, deployment is blocked (law, always on); the contractor uploads the renewed licence on the portal and the
     compliance owner verifies it before the block lifts.
628. **Our own principal-employer registration.** Suggested: stored in `statutory_registrations` with a new statute
     code per legal entity and state (one row per establishment), not a new table.
629. **Registers and forms.** Suggested: the formats per state and period are data in `IN.REGISTERS` (marked verify);
     YukthiX builds them monthly from contractors, deployments and the muster, freezes them at period lock and signs
     with the company DSC, reusing the payroll registers service. Wage registers come from the contractor's upload.
630. **The annual return.** Suggested: YukthiX drafts it from the year's data; filing on the government portal stays
     manual and we record the filed date and reference. No portal integration now.
631. **Contractor portal.** Suggested: email OTP, one sign-in per contractor contact, no passwords; contractors see only
     their own workers, packs, bills and licences; links expire after the session (same pattern as the client portal).
632. **Safety induction.** Suggested: a worker needs a recorded site safety induction (date, given by) before the first
     gate pass; it lasts 12 months. Settings `clra.induction_required` (default on) and `clra.induction_months`
     (default 12). Record only; no course until Learning is built.
633. **Gate pass.** Suggested: a number and a valid-to date on the deployment; it ends with the deployment or the
     licence, whichever is first. No printed badges or gate hardware now.
634. **Monthly proofs and the payment hold.** Suggested: the 4.9 defaults stay (PF challan and ECR, ESI challan, wage
     register, bank proof, due by the 15th); the bill is held while proofs are overdue or disputed, and only the
     compliance owner can release it, with a reason (audited); finance sees the hold. Setting `clra.payment_hold`
     (already designed).
635. **Under-18 check.** Suggested: date of birth with an ID is required for every worker and anyone under 18 is
     blocked (law, no override).
636. **Worker ID numbers.** Suggested: keep only the last 4 digits of the Aadhaar (masked, as in the designs) plus a hash
     to spot duplicates across contractors; never the full number.
637. **Converting a worker to an employee.** Suggested: the PPL-12 joiner flow gains a "contract worker" source; the
     same person is kept, the deployment ends the day before joining, UAN, ESIC IP and documents carry over.
638. **We as the contractor (CLB-06 … 08).** Suggested: build it after the principal-employer side and only when a
     customer supplies staff to clients; it reuses staffing clients and placements, adds client sites and our own
     licences, and blocks a placement past the licence maximum.
639. **Client compliance packs.** Suggested: built monthly per client from payroll and attendance of the placed
     staff; the upload to the client's portal is recorded by hand (date, reference, acknowledgement).
640. **Accidents.** Suggested: HLP-12 keeps the free-text contractor and adds a link to the contractor record when there
     is one.
641. **Phones.** Suggested: no app; the contractor portal works at phone width (T9-13 Phone story).

## 7. Build plan (slices, smallest useful first, max 3 builders at once)

| slice | what | reuses | size | rough days |
|---|---|---|---|---|
| CL-1 | Contractors and licences: vendor flag and fields on `agencies`, licence table, nightly expiry alerts, CLB-01 live, settings 4.9 live, rule set `IN.CLRA` (verify) | agencies, PAY 8 consultant, settings registry, licence-jobs shape | M | 3-4 |
| CL-2 | Contract workers and deployments: `contract_worker` roles, deployment table, server `deployBlocks`, gate pass, safety induction record, CLB-02 live, PPL-01 card and PPL-35 panel | persons, person_roles, ops-rules | L | 5 |
| CL-3 | Contractor portal T9-13: OTP sign-in, workers, licence renewals, monthly pack upload, bills | staffing / consultant portal OTP pattern | M | 4 |
| CL-4 | Vendor compliance CLB-03: monthly proofs, verification, short challan, wage check, liability alerts, payment hold on the PAY 8 bill with release | PAY 8 invoices and workflow, `challanShortfall`, minimum wage | L | 5 |
| CL-5 | Contract-worker attendance: kiosk credentials for workers, portal entry, month confirmation, threshold count into `establishment_coverage` | kiosk, muster, establishment_coverage | M | 4 |
| CL-6 | Registers and annual return CLB-04: contract-labour register types in `IN.REGISTERS`, freeze, DSC sign, annual return draft | statutory-registers service | M | 3-4 |
| CL-7 | Convert worker to employee CLB-05 with the PPL-12 source | PPL-12 joiner flow | S | 2 |
| CL-8 | We as the contractor CLB-06 … 08: client sites, own licences, placement block, client packs | staffing clients and placements, payroll | M | 4 |
| CL-9 | HLP-12 contractor link | accident cases | S | 1 |

Rough total: 31-33 builder-days; with 3 builders in parallel about 2½-3 weeks, plus one walk-through pass. Order:
CL-1 first (everything hangs off contractors and licences), then CL-2 and CL-3 together, then CL-4 and CL-5, then CL-6
and CL-7; CL-8 and CL-9 when a customer needs them. Each slice draws any new state as a story first, then makes the
designed screen live with a `live` prop, with positive and negative tests and RLS on every new table.

## Appendix: the count script

Run from the repo root (`node check.js` after saving the block). It recounts section 4 and fails unless every Contract
labour story file in scope has exactly one row per story, in file order, with one of the five verdicts.

```js
// Run from the repo root: node check.js. Recounts section 4 of docs/yukthix/contract-labour-design-map.md and checks
// that every story file in scope has exactly one row per story, in file order. Reads the story files, not Storybook.
const fs = require('fs');
const UI = 'packages/yx-ui/src/';
const O = UI + 'screens/ops/';
const files = [
  ...fs.readdirSync(O).filter((f) => /^clb-\d+\.stories\.tsx$/.test(f)).sort().map((f) => O + f),
  UI + 'screens/portals/t9-13-contractor.stories.tsx',
  UI + 'screens/settings/settings-g4.stories.tsx',
];
// Only the contract labour page of Settings group 4 (4.1 … 4.8 are payroll pages).
const keep = (f, n) => !f.endsWith('settings-g4.stories.tsx') || /^P4_9/.test(n);
const want = {};
for (const f of files) {
  const s = fs.readFileSync(f, 'utf8');
  const title = s.match(/title:\s*'([^']+)'/)[1].split('/').pop();
  // Capital first letter only: lower-case exports are sample props (excludeStories).
  want[title] = [...s.matchAll(/^export const ([A-Z]\w*)\s*(?::\s*[\w<>.]+)?\s*=/gm)].map((m) => m[1]).filter((n) => keep(f, n));
}
const doc = fs.readFileSync('docs/yukthix/contract-labour-design-map.md', 'utf8');
const s4 = doc.split('## 4. Design groups, story by story')[1].split(/^## /m)[0];
const V = ['live', 'live (gap)', 'wire design', 'design only, feature not built', 'phone view, mobile app not built'];
const errs = [], counts = {};
for (const sec of s4.split(/^### /m).slice(1)) {
  const name = sec.split('\n')[0].slice(0, 40), c = (counts[name] = { groups: 0, stories: 0, ...Object.fromEntries(V.map((v) => [v, 0])) });
  for (const g of sec.split(/^#### /m).slice(1)) {
    const head = g.split('\n')[0].trim();
    const rows = g.split('\n').filter((l) => /^\| \w+ · /.test(l));
    const got = rows.map((l) => l.match(/^\| (\w+) · /)[1]);
    if (!want[head]) { errs.push('no story file: ' + head); continue; }
    if (got.join() !== want[head].join()) errs.push(`${head}: ${got.length} rows, ${want[head].length} stories`);
    for (const l of rows) { const v = l.split('|')[2].trim(); if (V.includes(v)) c[v]++; else errs.push(`${head}: bad verdict ${v}`); }
    c.groups++; c.stories += rows.length; delete want[head];
  }
}
for (const h in want) errs.push('story file with no rows: ' + h);
const all = { groups: 0, stories: 0, ...Object.fromEntries(V.map((v) => [v, 0])) };
for (const c of Object.values(counts)) for (const k in all) all[k] += c[k];
counts['All'] = all;
console.table(counts);
if (errs.length) { console.error(errs.join('\n')); process.exit(1); }
console.log('ok');
```


Founder approved, 10 Nov 2026 (questions 621-641, all as suggested; policies are company settings with defaults, law
details are rule-set data marked verify for counsel). Build after Visitors, CL-1 first; CL-8 and CL-9 when a customer
needs them.
Founder approved, 10 Nov 2026 (questions 671-678, all as suggested): (671) counsel confirms the LIN format; (672)
keep the adder verifying, a "second person verifies" company setting when a customer asks; (673) registrations list with
CL-5; (674) site cards with CL-2 and CL-5; (675) the work order in CL-2, warning when deployments pass its headcount; keep
676, 677; (678) also email the contractor once the portal (CL-3) exists.
Founder approved, 10 Nov 2026 (questions 681-686, 731-736, all as suggested): (681) block at the threshold once
registrations exist (CL-5); keep 682 (second approver setting later), 683, 685 (CL-4), 732, 733; (684) a "Renew gate pass"
action keeping the number; (686) count contract workers in All persons with CL-5; (731) optional issuing office on the
licence form in CL-4; (734) Aadhaar only for now, other IDs later under the last-4-plus-hash rule; (735) worker photo with
the gate pass card in CL-5; (736) the contractor can withdraw their own waiting workers.
Founder approved, 10 Nov 2026 (questions 741-746, all as suggested): (741) the muster roll in CL-5 and the proof
list a company setting; (742) paid days against attendance in CL-5; (743) a daily email to the compliance owners for new
liability alerts; keep 744 (release per month), 746; (745) a recovered-wages line on the payroll payment advice.
Founder approved, 10 Nov 2026 (questions 751-756, 771-775, 781-785, all as suggested): keep 751, 752, 755, 756,
771-774, 782, 784, 785; (753) the compliance owner can reopen a confirmed month with a reason, audited, later; (754) the
contractor can add the worker photo when adding the worker, checked at site approval; (775) drop the unused PPL-12
conversion row from the drawing; (781) muster days from confirmed attendance once CL-5 lands; (783) the inspection pack
stays in Compliance.
Founder decided, 11 Nov 2026: build CL-8 ("we are the contractor": CLB-06 client establishments, CLB-07 own licences,
CLB-08 client compliance packs) now, instead of waiting for a customer (changes answer 638).
Founder approved, 11 Nov 2026 (questions 801-811 and 821-825, all as suggested): keep 801, 823, 824 (counsel verifies
the number), 825; (802) done toasts use the success style across the ops areas; (803) show "Counted tonight" instead of 0
before the first nightly count; (805) use the drawing's menu name, the inspection pack stays in Compliance; (806) drop the
duplicate "Open"; (807) a 0-day month asks "Confirm 0 days?" first; (808) the Make employee steps fit 1278 x 635; (809) show
the worker's photo in Make employee; (810) a clear warning at deploy when the wage is below the minimum, not a block; (811)
the same no-access text as the other pages; (821) add the month's PF and ESI challan copies to the client pack; (822) the
client site is required for our own staff once a client has sites.
Founder approved, 11 Nov 2026 (questions 841-844, 851-853, all as suggested): (841) PT from payroll's PT filing in
the client pack, the wage payment proof stays by hand; (842) optional bank receipt upload in payroll later if clients ask;
keep 843, 851, 853; (844) the below-minimum-wage warning also on site approval of a portal-added worker; (852) "Ask your HR
team" on the three we-are-the-contractor pages too.

## CL-1 built (10 Nov 2026, branch `feat/yukthix-contract-labour-1`)

Answers 621, 623 and 627. Migration `202617o0000009_contract_labour_1`: `agencies` gains `contract_labour`, `work`,
`pf_code`, `esic_code` and `lin` (format checks); `contractor_licences` (establishment, licence number, work covered,
states, maximum workers, validity, the copy, the licence it renews, pending / verified / rejected with who and when)
and `contractor_licence_alerts` (one row per licence and lead day), both with RLS; keys `clra.contractor.manage`,
`clra.contractor.view` and `clra.settings.manage` (role template "Contract labour owner"); the rule set `IN.CLRA` for
IN-TN and IN-KA (the 1970 Act to 20 Nov 2025: 20 workers; the OSH Code from 21 Nov 2025: 50; minimum age 18; all
verify, GO-LIVE-CHECKLIST row 38). Company setting `clra.licence_alerts` (default 60, 30 and 7 days). A nightly job
(08:30 India time) tells the compliance owners once per lead day; a verified renewal or an inactive contractor stops
it. `deployBlock` (a verified licence for the establishment, in force on the day, covering its state) is ready for
CL-2. Tests: `clra-rules.spec.ts`, `contract-live.test.tsx`, the nav test and e2e `contract-labour-1` (9 tests).

## Founder questions from the CL-1 build (10 Nov 2026)

671. **LIN format.** We accept 10 digits, with or without hyphens (1-2345-6789-0). Suggested: keep; counsel confirms
     the Shram Suvidha format before go-live.
672. **Who verifies a licence.** Today the person who adds a licence may also verify it. Suggested: keep that as the
     default and add a company setting "a second person verifies licences" (default off) when a customer asks.
673. **Principal-employer registrations on 4.9 (answer 628).** Suggested: build the list with CL-5, where the
     threshold count from deployments needs it; until then the row stays hidden.
674. **Establishment cards on CLB-01** (workers against the threshold, registration). Suggested: they appear with CL-2
     and CL-5; hidden until then, never with sample numbers.
675. **Work order** (scope, headcount, period) in the contractor record. Suggested: add it in CL-2 as a record per
     contractor and establishment, and warn when deployments pass its headcount.
676. **The licence copy is required** for every licence and renewal (PDF, JPG or PNG, up to 10 MB), and only a clean
     (virus-checked) copy can be verified. Suggested: keep.
677. **Ended licences and renewals.** A licence that has already ended cannot be added (add its renewal instead), and a
     renewal keeps the establishment, work and states of the licence it renews; a change of states is a new licence.
     Suggested: keep.
678. **Who gets the alerts.** Holders of `clra.contractor.manage` for the whole company, else the System Admins.
     Suggested: keep, and also email the contractor once the portal exists (CL-3).

## CL-2 built (10 Nov 2026, branch `feat/yukthix-contract-labour-cl2`)

Answers 624, 632, 633, 635, 636, 674 and 675. (`feat/yukthix-contract-labour-2` already existed from 21 Oct 2026 with
other work, so this slice uses `-cl2`.) Migrations `202617o0000010_contract_labour_2` (`contract_deployments`: person,
contractor, site, skill, monthly wage paid by the contractor, date of birth, the last 4 Aadhaar digits and a keyed hash,
UAN, ESI IP, first and last day, status pending / deployed / released, induction, gate pass; RLS; never two active
deployments for one ID) and `202617o0000011_contract_labour_work_orders` (`contractor_work_orders`, RLS). A contract
worker is a person with the `contract_worker` role (source `contract_deployments`); no employee record, no login, never
on payroll. The same ID later reuses the same person, so history follows them. Server checks (`workerChecks`): age,
licence, licence maximum, the same ID (blocks, no override); work-order headcount and the registration threshold (warn).
Settings `clra.induction_required` (default on) and `clra.induction_months` (default 12) on 4.9. PPL-01: contract
workers and their card in the directory for the contract labour keys of the whole company (never while acting for
someone else); PPL-35: the role reads "contractor · site". Tests: `clra-rules.spec.ts`, `contract-live.test.tsx`,
the nav test and e2e `contract-labour-2` (8 tests).

## Founder questions from the CL-2 build (10 Nov 2026)

681. **Registration threshold.** Today crossing the `IN.CLRA` threshold at a site warns. Suggested: block it once the
     principal-employer registrations are recorded (CL-5, answer 673), unless the site is registered.
682. **Site approval.** A deployment waits for site approval, which records the induction and issues the gate pass. Today
     the same compliance owner can send and approve. Suggested: keep; a company setting "a second person approves" when
     a customer asks.
683. **Gate pass numbers.** GP-<site code>-<running number per site>, kept when a worker is released. Suggested: keep.
684. **Gate pass renewal.** When the licence is renewed or the induction is given again, the gate pass does not extend by
     itself yet. Suggested: a "Renew gate pass" action in CL-3 or CL-5, keeping the number.
685. **Minimum wage hint.** The design shows the state minimum wage under the wage field; we leave it out until the
     wage check (CL-4) reads the minimum-wage rule set. Suggested: keep it for CL-4.
686. **The directory.** Contract workers appear in People › Directory only for holders of the contract labour keys, and
     the "All persons" card does not count them yet. Suggested: count them in All persons in CL-5 with the monthly
     snapshot.

## CL-3 built (10 Nov 2026, branch `feat/yukthix-contract-labour-cl3`)

Answers 631, 636 and 678 (T9-13). Migration `202617o0000012_contract_labour_3`: `contractor_contacts` (name, email,
invited / active / none) and `contractor_portal_sessions` (the token only as its SHA-256 hash, 60 minutes, ended on
sign-out or when access is removed), both with RLS. The compliance owner invites a contact from the contractor record
(the contact is emailed the link /yx/contractor/<company>) and removes access. Sign-in reuses the OTP service of the
client portal: always "sent", a resend cooldown and hourly limits per email and IP (429). The portal reads only the
contact's own contractor (another contractor's licence: 404; no, ended or expired session: 401), adds a worker through
the CL-2 checks (`checkIn` / `sendIn`, audited `via: contractor_portal`) and uploads a renewal (`renewIn`, pending until
verified). Answer 678: licence alerts are also emailed to the contractor's contacts. Packs and bills wait for CL-4,
attendance for CL-5. Tests: `contractor-portal-live.test.tsx`, `contract-live.test.tsx` and e2e `contract-labour-3`
(7 tests).

## Founder questions from the CL-3 build (10 Nov 2026)

731. **Issuing office.** The design shows who issued each licence ("Assistant Commissioner of Labour, Hosur"); we do not
     record it. Suggested: add it to the licence form (optional) in CL-4.
732. **Contacts of two contractors.** A person who is a contact of two contractors signs in to the first one. Suggested:
     keep until it happens; then a contractor picker after the code.
733. **Session length.** 60 minutes, as the client portal. Suggested: keep; a company setting only if a customer asks.
734. **Worker ID types.** The portal design offered Voter ID, driving licence and passport; answer 636 keeps the Aadhaar
     last 4 digits and a hash. Suggested: Aadhaar only for now; other IDs with the same rule (last 4 and a hash) if a
     contractor's workers lack Aadhaar.
735. **Worker photo.** The design asked for a photo; it is not stored. Suggested: add it with the gate pass card in CL-5.
736. **Withdraw from the portal.** A contractor cannot withdraw a worker waiting for approval; the compliance owner can.
     Suggested: let the contractor withdraw their own waiting workers.

## CL-4 built (10 Nov 2026, branch `feat/yukthix-contract-labour-cl4`)

Answers 626, 634 and 685. Migration `202617o0000013_contract_labour_4`: `contractor_packs` (contractor, site, month),
`contractor_pack_items` (PF and ESI challans with the workers covered and the amount, the wage register, the wage payment
proof; submitted / verified / discrepancy with a note), `contractor_wage_lines` (each worker's days, wage paid and the day
paid), `contractor_hold_releases` and `contractor_direct_payments`, all with RLS; `consultant_invoices.clra_recovery`.
The minimum wage comes from the `IN.MW` rule sets (the national floor and the state table for the site's minimum-wage
zone and the worker's skill; verify). A month's pack is due on `clra.doc_cutoff` (default the 15th) of the next month;
overdue or disputed months hold the contractor's PAY 8 bills (`clra.payment_hold`, default hold): the bank file refuses
them until the compliance owner releases the month with a reason. Wages the company pays a worker itself are recorded and
taken off the contractor's next approved bill. The minimum wage shows under the wage field on CLB-02 and the portal.
Tests: `clra-rules.spec.ts`, `compliance-cl4.test.tsx`, the CL-3 portal test and e2e `contract-labour-4` (7 tests).

## Founder questions from the CL-4 build (10 Nov 2026)

741. **Which proofs.** We ask for four (PF challan, ESI challan, wage register, wage payment proof); the design also had
     PT / LWF and the muster roll, and 4.9 shows a configurable checklist. Suggested: add the muster roll with attendance
     (CL-5) and make the list a company setting with these four as the default.
742. **Days on site.** The wage check uses the days in the contractor's register; comparing them with the days on site
     needs contract workers' attendance. Suggested: in CL-5.
743. **Liability alerts by email.** Alerts show on Vendor compliance; nobody is emailed yet. Suggested: tell the
     compliance owners once a day when a new alert appears.
744. **What a hold covers.** Any held month holds all of the contractor's bills (the design: "the August bill is held
     until the August pack's discrepancy is fixed"). Suggested: keep; a release is per month.
745. **The recovery on the PAY 8 payment advice.** The bill's net shows the wages we paid taken back; the payment advice
     and the consultant invoice list do not name it yet. Suggested: add a line "Wages paid to your workers by us".
746. **Proofs for a month with no workers.** No pack is owed for a site and month with no deployment. Suggested: keep.

Answers 681-686 and 731-736 (founder, 10 Nov 2026), built in CL-4: 731 the optional issuing office on the licence and
renewal forms (migration `202617o0000014`), shown on the contractor record and the portal; 685 the minimum-wage hint;
736 the contractor withdraws its own waiting workers on the portal, with a reason, audited. Later slices: 684 "Renew gate
pass" keeping the number; 681 block at the threshold once registrations exist, 686 contract workers in All persons and
735 the worker photo with the gate pass card (CL-5). 734 stays Aadhaar only.

## CL-5 built (10 Nov 2026, branch `feat/yukthix-contract-labour-cl5`)

- **Attendance (625).** Contract workers punch at the site's attendance kiosk with the gate pass number and a kiosk PIN
  of their own (shown once, argon2 hash, locked after five wrong tries); punches go to `contract_attendance`, never to
  employee punches, and leave and training are refused at the kiosk. Where the site has no kiosk, or the company chose
  `clra.attendance_source` = contractor, the contractor marks the days on the portal. Our site in-charge (the contract
  labour key) confirms a past month on Contract labour › Attendance; it is then locked.
- **Wage check (742).** Days paid in the wage register against days on site, shown as confirmed or not yet confirmed.
- **Threshold (622, 681).** Each site's highest number of contract workers on any day of the last 12 months, kept
  nightly (`clra_site_peaks`). Warn at `clra.threshold_warn` (default 80 %); at the threshold a site without a
  registration takes no more; a registered site is held to its maximum.
- **Registrations (673).** Settings 4.9: one active registration per site, added, changed (version) and removed in a sheet.
- **All persons (686), photo (735), renew gate pass (684).** As in the rows above.
- **Founder answers 741, 743, 745.** The muster roll is a fifth monthly proof; `clra.required_proofs` (default all five)
  decides the pack status and the hold; a discrepancy on any uploaded proof still counts. New liability alerts (last
  three months) go to the compliance owners once each, in the app and by email, in the 08:30 job (`clra_alert_notices`).
  The PAY 8 payment advice shows "Recovered wages (paid to your workers by us)" when a bill had a recovery.
- Migrations `202617o0000015_contract_labour_5` and `202617o0000016_contract_labour_5b`; RLS on every new table.
- Tests: `clra-rules.spec.ts`, `notification-types.spec.ts`, the kit tests for CL-5 and e2e `contract-labour-5`.

## Founder questions from the CL-5 build (10 Nov 2026)

751. **Required proofs per site.** The 4.9 design has a checklist with "Required at" per site; we built one company-wide
     list. Suggested: keep company-wide until a customer needs per-site lists.
752. **Who confirms the month.** Anyone with the contract labour key (`clra.contractor.manage`) confirms a site's month;
     there is no separate site in-charge role. Suggested: keep; a site-scoped grant can come with access scopes.
753. **A wrong punch after confirming.** A confirmed month is locked; there is no unlock. Suggested: the compliance owner
     can reopen a month with a reason (audited) in a later slice.
754. **Photo from the portal.** Only our staff add the worker's photo. Suggested: let the contractor add it when adding
     the worker, checked at site approval.
755. **Kiosk for contract workers.** The kiosk shows contract workers only clock in and out (no leave, no training).
     Suggested: keep.
756. **Older alerts.** The nightly email covers alerts in the last three months; an older month's new alert shows on
     Vendor compliance only. Suggested: keep.

## CL-7 built (CLB-05, answer 637; 18 Nov 2026, branch `feat/yukthix-contract-labour-cl7`)

- **Joiner source:** the PPL-12 joiner flow takes the source `contract_worker` (migration
  `202617w0000007_contract_labour_7`: `preboardings.source` widened, `contract_deployment_id` with a check that it is set
  exactly for that source, one open conversion per deployment). The joiner is the worker's own `persons` row (never a
  copy); a former employee joins again on their record (rehire), as for any joiner.
- **Start:** HR with `lifecycle.onboarding.manage` opens Contract labour › Contract workers › Make employee (deployed
  workers only) → CLB-05: the person, the last day (the day before joining), the employee details pre-filled with the
  site's entity and location, what carries over. Refused: without the key 403, acting for someone else 403, another
  company's deployment 404, a worker not deployed or already joining 409, a joining day on or before the deployment
  start 400. Audited (`clra.worker.conversion_started`).
- **Joining day:** "Mark joined" makes the employee on the same person; the deployment ends the day before (status
  released, reason "Joined as an employee"), the gate pass with it, the `contract_worker` role closes; the UAN and ESIC IP
  from the deployment are raised as profile changes for HR to approve. Earlier deployments, punches and register rows
  stay as contract-worker history. Audited (`clra.worker.converted`).
- **Tests:** kit and web tests, e2e `contract-labour-7` (4 scenarios, positive and negative).

## Founder questions from CL-7 (18 Nov 2026)

771. **Who converts.** HR with the onboarding key starts it (they see the worker's UAN and masked ID for that). The
     contract-labour compliance owner does not need the onboarding key. *Suggested: keep.*
772. **Pay at conversion.** The drawing asked for the annual CTC; the joiner flow has no pay, so it is set in Pay after
     joining (as for every direct joiner). *Suggested: keep; the CTC field is gone from the drawing.*
773. **Contract service and probation.** Contract service does not count towards probation or gratuity (the new
     employment starts on the joining day). *Suggested: keep (the PPL-12 drawing says so; a company setting later if asked).*
774. **The contractor is not told.** The contractor learns of the end through the released deployment in their portal;
     no message is sent. *Suggested: keep; a notice to the contractor later if asked.*
775. **PPL-12 Ready to onboard.** That queue lists accepted offers; conversions start from the worker and go straight to
     the Onboarding board, so its drawn "Contract worker conversion" row stays unused. *Suggested: drop that row from the
     PPL-12 drawing.*

## CL-6 built (CLB-04, answers 629, 630; 19 Nov 2026, branch `feat/yukthix-contract-labour-cl6`)

- **Formats:** rule set `IN.CLRA.REGISTERS` per state (Tamil Nadu, Karnataka; from 21 Nov 2025, verify): the four
  registers with their columns and the annual return's due day (15 February). Migration
  `202617x0000006_contract_labour_6`.
- **Registers:** the compliance owner (`clra.contractor.manage`) makes a finished month's registers for one
  establishment: contractors (with the verified licence and its maximum), contract workers, the muster roll and wages.
  Workers are deployments approved and on site in the month. A contractor without a wage register for the month keeps the
  muster and wages waiting ("Waiting for N contractors"). The muster's days are the wage registers' until CL-5's site
  attendance lands (said on the register). The versions are `statutory_registers` rows (types `clra_*`) made through the
  payroll registers service (`storeIn`, now shared by payroll's own registers), so freezing, the company DSC signature
  and the inspection pack are payroll's routes with their key (`statutory.register.sign`, step-up); payroll's own
  register list and generation leave the `clra_*` rows alone. A new version needs a reason; a frozen or signed one is
  superseded, never changed. Readers (`clra.contractor.view`) download the PDFs (audited).
- **Annual return (630):** per establishment and year: contractors, contract workers, most workers on any day, days
  worked and wages from the wage registers; the draft as a PDF; filing stays on the portal: the filed day (in the next
  year, not in the future) and the portal's reference are recorded once (`clra_annual_returns`, forced RLS), with the
  figures as filed. Audited.
- **Refused:** without the key 403, acting for someone else 403, another company 404, a month not yet over or a year not
  yet over 400, a second filing 409.
- **Tests:** kit and web tests, e2e `contract-labour-6` (4 scenarios, positive and negative).
- **After CL-5 lands:** merge test main and take the muster's days from the confirmed attendance instead of the wage
  registers (one place: `ClraRegistersService.make`).

## Founder questions from CL-6 (19 Nov 2026)

781. **Muster before CL-5.** Until site attendance is live, the muster roll's days come from the contractors' wage
     registers, said on the register. *Suggested: keep until CL-5; then the confirmed attendance.*
782. **Who signs.** Freezing and the DSC signature need the company's register-signing key (the payroll compliance
     owner), not the contract-labour key. *Suggested: keep: one signer for all statutory registers.*
783. **Inspection pack.** The payroll inspection pack already includes the signed contract-labour registers of the
     same entity, place and month; the CLB-04 page has no button of its own. *Suggested: keep it in Compliance ›
     Registers.*
784. **A filed return is final.** A correction is filed again on the portal; YukthiX does not change the recorded
     filing. *Suggested: keep; a support fix if a reference was mistyped.*
785. **Register per contractor.** The drawing showed a register of workmen per contractor; YukthiX makes one register
     for the establishment with the contractor named on each row. *Suggested: keep (inspectors accept the combined form;
     verify with counsel).*

## Follow-up after CL-5 and CL-6 (answers 754, 775, 781; 11 Nov 2026, branch `feat/yukthix-contract-labour-followup`)

- **781:** the muster roll's days are the site attendance the site in-charge confirmed (CL-5). The muster waits until
  every contractor's month at the site is confirmed ("Waiting for attendance of N contractors"); the wage register still
  waits for every wage register. The annual return's days worked stay from the wage registers.
- **754:** the contractor adds the worker's photo when adding the worker on the portal (optional; JPG or PNG up to 5 MB;
  checked from the bytes, private storage, virus-scanned): `POST public/contractor-portal/:org/workers/:id/photo`, only
  for its own worker waiting for approval. It is the same single photo the site adds on the gate pass card (CL-5): one
  `photo_file_id` per deployment, never a second photo. At site approval a worker with a photo shows it, and the
  approval needs the tick "the person at the site is the one in this photo" (the API refuses without it). Audited.
- **775:** the PPL-12 Ready to onboard drawing has no "contract worker conversion" row or story any more (conversions
  start from the worker, CLB-05); its row is gone from the people map.

## CL-8 built (CLB-06 … 08, answers 638, 639; 11 Nov 2026, branch `feat/yukthix-contract-labour-cl8`)

- **Data:** migration `202617y0000008_contract_labour_8`: `staffing_client_sites` (client, site, state, principal
  employer and its registration number, where the pack goes, its due day 1-28; forced RLS); `staffing_placements.client_site_id`;
  `contractor_licences` now also holds our own licences (owner = our legal entity, for one client site or a single
  licence for states; a database check keeps the two owners apart); `client_packs` (site, month, the two register
  versions, upload day, reference, acknowledgement file, accepted; forced RLS).
- **Client sites (CLB-06):** under a staffing client; deployed against the covering licence. Keys: `clra.contractor.view`
  reads, `clra.contractor.manage` adds.
- **Own licences (CLB-07):** added with the copy (private, scanned), verified on entry. The covering licence is the
  site's own first, else a single licence for its state, valid that day.
- **Placement block (answer 638):** Staffing › New placement takes an optional client site (of the submission's client).
  For our own employee the API refuses past the licence maximum (`LICENCE_MAXIMUM`, "the 51st of 50"), and with no
  licence once the state's threshold (`IN.CLRA` rule set, verify) would be reached (`NO_LICENCE`). A vendor's worker is
  not ours and is not counted.
- **Client packs (answer 639):** for a finished month and site: our employees placed there; each needs an approved
  payslip (else "Payroll for … is not approved yet for …"); the wage register (days paid, gross, deductions, net) and the
  muster (days present, leave, absent from attendance) are `statutory_registers` (types `clpk_*`) made through the
  payroll registers service, held by the licence's legal entity; payroll's own lists and inspection pack leave them
  alone. Download is one ZIP with a cover of fingerprints (audited). The upload to the client's portal is recorded by
  hand once (day, reference, optional acknowledgement); the acknowledgement makes it accepted; after upload the pack is
  final. A remake before upload needs a reason. Overdue after the site's due day.
- **Refused:** without the key 403, acting for someone else 403, another company 404, bad input 400, repeats 409.
- **Tests:** API unit (`own-licence-rules.spec`), kit and web tests (positive and negative), e2e `contract-labour-8`
  (5 scenarios).

## Founder questions from CL-8 (11 Nov 2026)

821. **What the pack holds.** The drawing lists PF ECR, ESI challan, wage payment proof and PT with the wage register
     and muster. CL-8 packs the wage register and muster only. *Suggested: add the month's PF and ESI challan copies
     from payroll statutory filings in a later slice; keep the payment proof by hand.*
822. **Placements without a site.** A placement may still be made without a client site (as before CL-8); it is then
     not counted against any licence. *Suggested: make the site required for own staff once a client has sites.*
823. **Our licences are verified on entry.** The compliance owner who adds our own licence is trusted; there is no
     second approver. *Suggested: keep.*
824. **Licence threshold without a licence.** With no licence of ours at a site, placements stop when the state's
     threshold (IN.CLRA, 50 under the OSH Code) would be reached. *Suggested: keep; verify the number with counsel.*
825. **A pack after upload is final.** A correction is uploaded again on the client's portal outside YukthiX.
     *Suggested: keep; a support fix if needed (as for the annual return, 784).*

## Contract labour walk-through (11 Nov 2026, branch `feat/yukthix-walk-cl`)

Walked on the test app as real users (admin-tester, hr-tester, panel@, arjun@ and a contractor portal contact signed in by
mailpit code), live against the design screenshots at 1278 x 635. Test data made through the UI as admin-tester: the
contractor "Walk Security Services", licence WALK/CLRA/2026/001 (verified), two workers, a portal contact and a
registration; cleaned up afterwards (see the report).

| page | admin-tester | hr-tester | panel@ / arjun@ | portal contact |
|---|---|---|---|---|
| Contractors, licence, contact, site cards | pass (add, licence, verify, invite; empty saves name each field, focus on the first) | no access (403, kind page) | no access | not shown |
| Contract workers, deploy, approval, gate pass, renewal | pass (under 18 and the same ID refused; renewal that would not extend refused 409; photo PDF refused, JPG saved; kiosk PIN shown once) | no access | no access | sees own workers |
| Attendance | pass (Oct confirmed: 5 days; current month has no Confirm) | no access | no access | Oct days saved (5), kiosk text where a site has one |
| Vendor compliance | pass (Oct pack: five proofs open, wage check waiting) | no access | no access | pack opened; empty upload names each field |
| Registers & returns | pass (Make registers for a month with no workers refused) | no access | no access | not shown |
| Settings 4.9 | pass (registration: empty save named, then added) | can edit (settings key) | no access | not shown |
| Make employee (CL-7) | pass to "Check and start"; joining day on or before the start refused; nothing started | no access | no access | not shown |
| Portal: due, workers, attendance, packs, bills | | | | pass after the tab fix (below) |

Fixed on the branch: months and due dates as words (`49bb0ab0e`, `e2e12162d`); portal tab links signed the contact out,
"Access ends today" for everyone, photo size said 10 MB, ISO dates in two messages (`4389396d3`); a refused deployment
says why (`ff504e2a8`); "Upload pf ecr and challan" and the doubled size hint (`7920d0da0`); Make employee focus on the
wrong field (`7bb97c964`); "1 workers" (`248bb3636`).

## Founder questions from the Contract labour walk (11 Nov 2026)

801. **Three row buttons wrap.** A deployed worker shows Gate pass, Make employee and Release; at 1278 px Release wraps
     to a second line (the CLB-05 drawing shows the same). Suggested: Make employee inside the gate pass card.
802. **Done toasts look like information.** Contract labour (and the other ops areas) show success with the blue "i"
     toast. Suggested: the success tone for every done message in the ops screens.
803. **Highest in 12 months reads 0 until the night.** The peak is counted by the 08:30 job. Suggested: count it when a
     worker is approved or released too.
804. **Registers text said attendance was not live.** Seen on the walk; the CL-5/CL-6 follow-up merged since has changed
     both texts (rechecked in the code). *No question left.*
805. **Registers & returns against the drawing.** The drawing has "Inspection pack" at the top and the menu says "CLRA
     registers & returns"; the live page has the month and Make registers. Suggested: CL-6 builder to confirm.
806. **"Open" twice on the portal packs list.** The status "Open" sits next to the Open button. Suggested: the status
     "Not started" until a proof is uploaded.
807. **A month with no days can be confirmed.** Suggested: the confirmation names the workers with 0 days.
808. **Make employee scrolls.** Employee details and Check and start are taller than the screen (703 and 883 px against
     579). Suggested: keep (the fields need it), or put Designation, Department and Employment type in two columns.
809. **No photo on Make employee.** The same-person step shows the placeholder although the worker has a gate pass photo.
     Suggested: show it.
810. **Deployed below the minimum wage.** A worker at ₹9,000 a month (minimum ₹16,137, Karnataka) was deployed; the wage
     is only a hint until the monthly wage check. Suggested: keep, with the hint in red on the approval dialog.
811. **Registers no-access text.** "Ask an admin (the contract labour key)" while the other pages say "Ask your HR team".
     Suggested: the same words everywhere.

## Built from the founder's answers 803, 807, 810, 821, 822 (11 Nov 2026, branch `feat/yukthix-contract-labour-approved-801-825`)
- **803:** before the 08:30 job has counted a site, "Highest in 12 months" reads "Counted tonight" (Contractors cards and
  Settings 4.9 registrations), not 0.
- **807:** confirming a month with no days on site asks "Confirm 0 days?" (button "Confirm 0 days"); every month
  confirmation names the workers with 0 days.
- **810:** at deploy, a wage below the site's minimum (IN.MW, verify) shows a clear warning under the wage on the staff
  deploy sheet and the portal's Add worker; it never blocks (the monthly wage check flags the shortfall).
- **821:** a client pack also carries the month's PF and ESI remittances: a third register `clpk_challans` (statute,
  registration, challan or TRRN, amount, filed day), from payroll's filed returns of the licence's legal entity, for the
  statutes the entity is registered for. One not filed yet reads "Not filed yet", is named on the pack card and the ZIP
  cover, and the pack can be made again once it is filed. The employee-level ECR / ESI return file is never put in the
  pack: it lists every employee of the entity, not only those at the client. Migration
  `202617z0000001_contract_labour_approved` (`client_packs.challans_register_id`, `missing`).
- **822:** once a client has sites, our own employee's placement needs one (`SITE_REQUIRED`, 400; the sheet asks for
  it). A vendor's worker does not.
- **Tests:** API unit (`own-licence-rules.spec`), kit and web tests (positive and negative), e2e `contract-labour-8`.
## Founder questions from answers 803 … 822 (11 Nov 2026)
841. **Wage payment proof and PT in the pack.** The drawing also lists the wage payment proof and professional tax.
     *Suggested: PT from payroll's PT filing in the same register when the state has PT; the payment proof stays by hand.*
842. **Challan receipt copies.** Payroll records each return's portal reference (TRRN or challan number), amount and
     filed day, not the bank's challan receipt PDF; the pack shows those. *Suggested: keep; add an optional receipt
     upload to Payroll › Statutory filings later if clients ask for the PDF.*
843. **A pack before the challans are filed.** PF and ESI are due on the 15th, client packs often on the 10th; the pack is
     made without them and names them, rather than waiting. *Suggested: keep; remake it once filed.*
844. **Warning at site approval.** 810 warns where the wage is typed (staff sheet, portal). *Suggested: show the same
     warning on the site approval dialog for a portal-added worker.*
## Walk answers built (802, 805, 806, 808, 809, 811; 11 Nov 2026, branch `feat/yukthix-cl-walk-ui`)
- **802:** the ops toast hook (`useSay` in `ops-kit.tsx`) has `done()` (success) and `fail()` (error) beside `say()` (a
  neutral "why not"); contract labour's done messages use `done()` and every toast in `screens/ops` names its tone.
  Guard: `ops-toast-guard.test.ts` (a toast without a tone, or `say()` after a successful action, fails).
- **805:** the menu reads "CLRA registers & returns", as drawn.
- **806:** a pack still owed reads "To upload" on the portal (it said "Open" beside the Open button).
- **808:** Make employee fits 1278 x 635: Manager sits beside the joining date, designation, department and employment
  type open from a button, the review has one note box and one summary, and the failure shows once above the steps.
- **809:** the gate pass photo on the same-person step (`GET lifecycle/joiners/from-contract-worker/:id/photo`, the
  onboarding key; drawn as CLB-05 SamePersonPhoto).
- **811:** Registers & returns without access says "Ask your HR team", as the other pages do.
## Founder questions from the walk answers (11 Nov 2026)
851. **"To upload", not "Not started".** A pack is "open" also when some proofs are in, so "Not started" would be wrong
     for those; the portal says "To upload". *Suggested: keep.*
852. **Group B pages without access.** Client establishments, own licences and client packs (CL-8) still say "Ask an
     admin (the contract labour key)". *Suggested: the same "Ask your HR team" there too.*
853. **Optional details on request.** Designation, department and employment type open from a button on Make employee
     (they stay open once one is chosen). *Suggested: keep; the checklist can add them before joining.*

## Answers 841, 844 and 852 built (11 Nov 2026, branch `feat/yukthix-cl-841`)

- **841:** the client pack's remittances register (`clpk_challans`, now "PF, ESI and PT remittances") also carries PT
  from payroll's filed PT return, for the client site's state only (another state's PT is left out); a PT registration
  with no filing for the month reads "Not filed yet" and is named on the pack ("PT challan"). The wage payment proof
  stays by hand.
- **844:** the site approval dialog shows the 810 below-the-minimum-wage warning (drawn as CLB-02 ApproveBelowMinimum);
  it never blocks.
- **852:** client establishments, own licences and client packs without access say "Ask your HR team".
- **Tests:** `own-licence-rules.spec` (PT rows), kit and web tests (positive and negative), e2e `contract-labour-8`.

## Founder questions from answers 841, 844, 852 (11 Nov 2026)

881. **The warning for every approval.** The approval dialog warns for any worker whose wage is below the minimum, not
     only for workers the contractor added on the portal (staff were warned at deploy, but the wage may have been typed
     there regardless). *Suggested: keep.*
882. **PT paid half-yearly or yearly.** Some states collect PT half-yearly or yearly (Tamil Nadu: half-yearly). In a month
     with no PT return due, the pack would still say "PT challan not filed yet". *Suggested: name PT as missing only in
     the state's due months, from the IN.PT rule set's periods.*

