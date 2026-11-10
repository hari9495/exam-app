# Contract labour: live pages and their designs (check)

This file checks, story by story, that every Contract labour design sub-page can be reached in the live app, in the same
shape as `hiring-design-map.md`. Founder rule: never build a second, simpler version of a designed screen; make the
designed one live.

Status 10 Nov 2026 (branch `docs/yukthix-contract-labour-map`, from `test/yukthix-main` at 61b163d4a). Audit only:
nothing was built.

## What is live today (plain English)

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
| A. Principal employer (contractors working at our sites) | 5 | 11 | 2 | 0 | 20 | 0 | 33 |
| B. We are the contractor (our staff at client sites) | 3 | 0 | 0 | 0 | 10 | 0 | 10 |
| C. Contractor portal | 1 | 0 | 0 | 0 | 9 | 0 | 9 |
| D. Settings | 1 | 0 | 2 | 0 | 0 | 0 | 2 |
| **All** | 10 | 11 | 4 | 0 | 39 | 0 | 54 |

Of the 43 stories under Screens/Contract labour, 11 are live and 2 live with a gap (CL-1); with the portal and settings pages, 15 of 54.

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
| Register · Register · renewal alerts | live (gap) | the register and the renewal banner (state from the server with `clra.licence_alerts`); the establishment cards wait for deployments and registrations (CL-2, CL-5; question 674) |
| Record · Contractor record (licence, work order) | live (gap) | statutory codes and licences; the work order (question 675) and the contractor login (CL-3) are left out; PAN "Verified" from the linked PAY 8 consultant |
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

#### CLB-02 · Contract workers register

| story (sub-page) | verdict | note |
|---|---|---|
| Register · Register | design only, feature not built | needs the deployment table and `contract_worker` person roles |
| Deploy · Deploy · checks pass | design only, feature not built | `deployBlocks` must run on the server too |
| LicenceFull · Deploy · licence maximum reached | design only, feature not built | count of active deployments per licence |
| Underage · Deploy · under 18 blocked | design only, feature not built | date of birth required; law, no override |
| OutOfScope · Deploy · licence scope excludes Kerala | design only, feature not built | licence states against the site's state |
| Empty · Empty | design only, feature not built | |
| Error · Error | design only, feature not built | |

#### CLB-03 · Vendor compliance tracker

| story (sub-page) | verdict | note |
|---|---|---|
| Matrix · Matrix · liability alerts · payment holds | design only, feature not built | needs monthly proofs per contractor and proof type (`clra.checklist`, due day `clra.doc_cutoff`) |
| Verify · Proof verification · short challan | design only, feature not built | `challanShortfall`: the challan covers fewer workers than the muster |
| Override · Payment hold override with reason | design only, feature not built | the hold sits on the PAY 8 bill; release with reason, audited |
| Finance · Finance view (no override) | design only, feature not built | finance key sees holds, cannot release |
| AllClear · All verified | design only, feature not built | |

#### CLB-04 · CLRA registers & returns

| story (sub-page) | verdict | note |
|---|---|---|
| Registers · Registers | design only, feature not built | reuse the statutory-registers service (freeze, DSC); new register types |
| Returns · Annual return | design only, feature not built | drafted from the year's deployments and days; filing is outside the app |
| Loading · Loading | design only, feature not built | |

#### CLB-05 · Convert worker to employee

| story (sub-page) | verdict | note |
|---|---|---|
| SamePerson · Same person kept | design only, feature not built | the same `persons` row; PPL-12 has no `contract_worker` source yet |
| EndRole · End contract role | design only, feature not built | ends the deployment and the role the day before joining |
| Employee · Employee details | design only, feature not built | the PPL-12 joiner fields |
| CarryOver · Identity and documents carried over | design only, feature not built | UAN, ESIC IP, ID and documents from the deployment |
| Review · Review and create | design only, feature not built | |

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
| SignIn · Sign in (email OTP) | design only, feature not built | reuse the client / consultant portal OTP pattern |
| Licences · Establishments and licence renewals | design only, feature not built | the contractor uploads a renewed licence; compliance verifies |
| Workers · Workers | design only, feature not built | the contractor's deployments only |
| UnderAge · Add worker · under 18 blocked | design only, feature not built | the same `deployBlocks` on the server |
| LicenceFull · Add worker · licence maximum reached | design only, feature not built | |
| Pack · Monthly pack · short challan | design only, feature not built | proofs uploaded here feed CLB-03 |
| PackVerified · Monthly pack · verified | design only, feature not built | |
| Bills · Bills · payment on hold | design only, feature not built | the PAY 8 bill with its hold reason |
| Phone · Monthly pack · phone | design only, feature not built | the same web portal at phone width (no app needed) |

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
