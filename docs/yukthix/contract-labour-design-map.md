# Contract labour: live pages and their designs (check)

This file checks, story by story, that every Contract labour design sub-page can be reached in the live app, in the same
shape as `hiring-design-map.md`. Founder rule: never build a second, simpler version of a designed screen; make the
designed one live.

Status 10 Nov 2026 (branch `docs/yukthix-contract-labour-map`, from `test/yukthix-main` at 61b163d4a). Audit only:
nothing was built.

## What is live today (plain English)

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
| A. Principal employer (contractors working at our sites) | 5 | 37 | 2 | 0 | 3 | 0 | 42 |
| B. We are the contractor (our staff at client sites) | 3 | 0 | 0 | 0 | 10 | 0 | 10 |
| C. Contractor portal | 1 | 16 | 1 | 0 | 0 | 0 | 17 |
| D. Settings | 1 | 0 | 2 | 0 | 0 | 0 | 2 |
| **All** | 10 | 53 | 5 | 0 | 13 | 0 | 71 |

Recounted by script 18 Nov 2026 on `feat/yukthix-contract-labour-cl7` after CL-7: CLB-05 live (5 stories) and 1 new story drawn and live (CLB-05 Start).

Of the 51 stories under Screens/Contract labour, 31 are live and 2 live with a gap (CL-1 to CL-4); with the portal and settings pages, 52 of 70.

Related stories in other areas (counted in their own maps, listed here so the build reaches them):

| story | area map | verdict there | what contract labour must add |
|---|---|---|---|
| PPL-01 HrContractWorkers · HR · contract workers | people | design only | the directory card from the contract-worker deployments |
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
| Register · Register · renewal alerts | live (gap) | the register, the renewal banner and (CL-2, answer 674) the site cards: contract workers against the licence maximums and the `IN.CLRA` threshold; the registration number waits for CL-5 (answer 673), so a site at the threshold reads "Registration needed" |
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
| Threshold · Deploy · registration threshold warning (CL-2) | live | warns at the `IN.CLRA` threshold (a block once registrations exist, CL-5) |
| Approve · Site approval · induction and gate pass (CL-2) | live | `POST …/workers/:id/approve`: induction within `clra.induction_months`; gate pass GP-<site>-<n> ending first of deployment, licence and induction |
| Release · Release a worker (CL-2) | live | `POST …/workers/:id/release` (or withdraw before approval): the deployment and the contract_worker role end |
| ReadOnly · Read only (view key, CL-2) | live | `clra.contractor.view` |

#### CLB-03 · Vendor compliance tracker

| story (sub-page) | verdict | note |
|---|---|---|
| Matrix · Matrix · liability alerts · payment holds | live | /yx/contract-labour/compliance (menu Contract labour › Vendor compliance); `GET contract-labour/compliance?month=`: the four proofs per contractor and site (PT / LWF: question 741), the hold, liability alerts (wages below the minimum, short challans, overdue proofs) |
| Verify · Proof verification · short challan | live (gap) | `POST …/compliance/proofs/:id/verify` (a clean copy; a short challan is refused: raise a discrepancy) and `…/discrepancy` with a note; days paid against days on site waits for attendance (CL-5) |
| Override · Payment hold override with reason | live | `POST …/compliance/holds/release` with the reason, the compliance owner only; the PAY 8 bank file refuses held contractors' bills (`heldConsultants`) |
| Finance · Finance view (no override) | live | `clra.contractor.view` (finance holds no contract labour change key): sees holds and alerts, no Release |
| AllClear · All verified | live | |
| PayByUs · Record payment by us (CL-4) | live | `POST …/compliance/direct-payments`; taken off the contractor's next approved PAY 8 bill (`consultant_invoices.clra_recovery`) |

#### CLB-04 · CLRA registers & returns

| story (sub-page) | verdict | note |
|---|---|---|
| Registers · Registers | design only, feature not built | reuse the statutory-registers service (freeze, DSC); new register types |
| Returns · Annual return | design only, feature not built | drafted from the year's deployments and days; filing is outside the app |
| Loading · Loading | design only, feature not built | |

#### CLB-05 · Convert worker to employee

| story (sub-page) | verdict | note |
|---|---|---|
| SamePerson · Same person kept | live | live 18 Nov 2026 (CL-7) at /yx/contract-labour/workers/[id]/convert: the same `persons` row; refused when not deployed, already an employee or already joining (GET lifecycle/joiners/from-contract-worker/:deploymentId) |
| EndRole · End contract role | live | the last day is the day before joining (answer 637), shown, not chosen; the deployment, the gate pass and the role end on the joining day |
| Employee · Employee details | live | the PPL-12 joiner fields, entity and location pre-filled from the deployment's site; the drawn CTC is gone (pay is set in Pay after joining, question 772) |
| CarryOver · Identity and documents carried over | live | the same person; UAN and ESIC IP raised on the employee record on the joining day for HR to approve; only the last 4 ID digits exist, so the original is checked on the joining day |
| Review · Review and create | live | "Start pre-boarding": POST lifecycle/joiners/from-contract-worker/:deploymentId; the joiner goes to the Onboarding board |
| Start · Start · Make employee on a deployed worker | live | drawn 18 Nov 2026: "Make employee" on a deployed worker in Contract workers, for HR with the onboarding key |

### B. We are the contractor (our staff at client sites)

#### CLB-06 · Client establishments

| story (sub-page) | verdict | note |
|---|---|---|
| List · List | design only, feature not built | reuse `staffing_clients`; needs a client-site row with the client's registration number |
| AtMaximum · Site at licence maximum | design only, feature not built | placements at the site against our licence maximum |
| NotCovered · Site not covered by any licence | design only, feature not built | |
| Empty · Empty | design only, feature not built | |

#### CLB-07 · Own licences

| story (sub-page) | verdict | note |
|---|---|---|
| List · Licences · renewal due | design only, feature not built | same licence table as CLB-01, owner = our legal entity |
| Blocked · 51st deployment blocked | design only, feature not built | block in the staffing placement create |
| Empty · Empty | design only, feature not built | |

#### CLB-08 · Client compliance packs

| story (sub-page) | verdict | note |
|---|---|---|
| Packs · Packs by client and month | design only, feature not built | built from payroll and attendance of the placed employees |
| RecordUpload · Record portal upload | design only, feature not built | date, reference and acknowledgement file; no client-portal integration |
| AllAccepted · All accepted | design only, feature not built | |

### C. Contractor portal

#### T9-13 · Contract-labour vendor portal

| story (sub-page) | verdict | note |
|---|---|---|
| SignIn · Sign in (email OTP) | live | /yx/contractor/[org]; `POST public/contractor-portal/:org/code` always answers "sent" (no telling who has access), rate-limited per email and IP; `…/verify` gives a 60-minute session kept only as its SHA-256 hash |
| Licences · Establishments and licence renewals | live | `GET …/me`: the own contractor's licences per site with workers against the maximum and (answer 731) the issuing office |
| Workers · Workers | live | the own contractor's waiting and deployed workers, masked ID, gate pass |
| UnderAge · Add worker · under 18 blocked | live | `POST …/workers/check` then `…/workers`: the CL-2 checks, no override; the contractor is always the contact's own |
| LicenceFull · Add worker · licence maximum reached | live | as UnderAge |
| Pack · Monthly pack · short challan | live (gap) | `GET public/contractor-portal/:org/packs`, `…/pack?locationId&month`: the four proofs with their checks; the muster roll and days on site wait for attendance (CL-5) |
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

### D. Settings

#### Group 4 · Payroll & Statutory

| story (sub-page) | verdict | note |
|---|---|---|
| P4_9 · 4.9 Contract labour | live (gap) | the threshold and minimum age from `IN.CLRA` (verify), the licence block (law) and `clra.licence_alerts`; registrations (question 673) and monthly compliance (CL-4) left out |
| P4_9_ReadOnly · 4.9 Contract labour · read-only | live (gap) | without `clra.settings.manage` or `org.settings.manage` (or while acting for someone else) |

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
