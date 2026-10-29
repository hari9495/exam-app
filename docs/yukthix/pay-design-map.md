# Pay: live pages and their designs (plan)

This is the plan to make every Pay page in the web app render its designed PAY screen with real data, in place of the
separate "Live" copy it renders today. Founder rule: never build a second, simpler version of a designed screen; make
the designed one live. Time was done this way (see `time-design-map.md`); Pay follows the same pattern.

Builder 1 (29 Oct 2026) made the runs, inputs, payments, queries and coverage pages live, and designed and wired periods, reopen requests, audit, documents and payment modes; see "Builder 1 status" at the end. The rest of this paragraph is the plan as written: The guard (`packages/yx-ui/src/design-live-guard.known.json`) lists 38 Pay
live copies and 36 designed Pay screens that no page reaches. Six more live copies hide from the guard (see "Hidden
copies" below).

Builder 2 (29 Oct 2026, branch feat/yukthix-pay-structures): compensation, templates, components, payslip layout, set-up,
pay groups, imports, go-live, special pay, arrears (PAY-28), actuarial and country packs now render their designs; 12
live copies and 12 "not live" lines left `known.json`.

Verdicts: **wire design** (a live page and the API exist for this job; the page should render the design) ·
**wire design (gap)** (the same, but one part of the story needs a small API or rule first; the note says what) ·
**design only, feature not built** (the API has nothing for it) · **phone view, mobile app not built** ·
**live already**. After builder 1: **live** (the page renders the design and reaches this state) · **live (gap)** (the design is live; this state is not reachable yet, the note says why) · **wire design (ready)** (the component takes `live`; another builder's page renders it).

## Counts (sub-pages = stories)

| | live | live, with a gap | wire design | wire, with a gap | feature not built | phone view | all |
|---|---|---|---|---|---|---|---|
| A. Runs and payments (PAY-01, 02, 03, 07, 08, 09, 10, 11, 29, 30) | 47 | 9 | 4 | 2 | 0 | 0 | 62 |
| B. Inputs, loans, recoveries, queries (PAY-04, 05, 06, 17, 18, 19, 20, 28) | 20 | 5 | 16 | 3 | 2 | 2 | 48 |
| C. Structures and set-up (PAY-12, 13, 14, 15, 16, 42) | 0 | 0 | 28 | 0 | 0 | 0 | 28 |
| D. Employee pay and tax (PAY-21, 22, 23, 39, 40, 41) | 0 | 0 | 36 | 2 | 1 | 9 | 48 |
| E. Special pay, EWA, actuarial, benefits (PAY-24, 26, 27, 31, 32, 33, 34, 35, 36, 37, 38, 43) | 0 | 0 | 47 | 1 | 10 | 8 | 66 |
| F. Reports (PAY-25) | 0 | 0 | 0 | 0 | 13 | 0 | 13 |
| G. Records, new designs (PAY-46, 48, 49) | 44 | 0 | 0 | 0 | 0 | 0 | 44 |
| **All 46 design groups (309 sub-pages counted)** | **111** | **14** | **131** | **8** | **26** | **19** | **309** |

Recounted by script after builder 1 (branch `feat/yukthix-pay-runs`, 29 Oct 2026) from the 46 PAY story files (every
`export const` story) and the verdict of each story row below; the script also checks that every story file has exactly
one row per story. New since the plan: PAY-10 "Payment modes" (4 stories) and the new groups PAY-46, 48, 49 (44 stories).
"live" = the live page renders the designed screen and reaches this state; "live, with a gap" = the designed screen is
live but this state is not reachable yet (the note says why). PAY-19 "wire design (ready)" rows count as wire design:
the component takes `live`, builder 2's /yx/payroll/arrears page renders it. The Kit (`pay-kit.stories.tsx`) is not counted.

**Builder 2's own recount (groups C and E; before builder 1 was merged in, so A and B differ):**

| | wire design | wire, with a gap | feature not built | phone view | live already | all |
|---|---|---|---|---|---|---|
| A. Runs and payments (PAY-01, 02, 03, 07, 08, 09, 10, 11, 29, 30) | 55 | 3 | 0 | 0 | 0 | 58 |
| B. Inputs, loans, recoveries, queries (PAY-04, 05, 06, 17, 18, 19, 20, 28) | 37 | 4 | 2 | 2 | 9 | 54 |
| C. Structures and set-up (PAY-12, 13, 14, 15, 16, 42) | 0 | 4 | 0 | 0 | 39 | 43 |
| D. Employee pay and tax (PAY-21, 22, 23, 39, 40, 41) | 36 | 2 | 1 | 9 | 0 | 48 |
| E. Special pay, EWA, actuarial, benefits, country packs (PAY-24, 26, 27, 31 … 38, 43, 50, 51) | 11 | 8 | 10 | 8 | 50 | 87 |
| F. Reports (PAY-25) | 0 | 0 | 13 | 0 | 0 | 13 |
| **All 45 design groups (303 sub-pages counted)** | **139** | **21** | **26** | **19** | **98** | **303** |

Counted by script from the 45 PAY story files (`pay-01-*.stories.tsx` … `pay-51-*.stories.tsx`, every `export const`
story) and the verdict of each story in the tables below, 29 Oct 2026 (recounted after builder 2). The Kit
(`pay-kit.stories.tsx`, 9 stories) is shared parts, not pages, and is not counted. "live already" counts the stories a
live page now renders with real data; "wire, with a gap" in groups C and E are wired pages whose story shows a state
the API cannot feed yet (the note says what).

## How to wire (same as Time)

- The designed screen takes a `live` prop: `p.live ? <LiveX live={p.live} /> : <SampleX {...p} />`. Stories keep the
  sample; the app passes `live` with real data, `state`, `onRetry`, the actions and `can` (permissions).
- In live mode the screen renders without its own `PayFrame` / `MyPayFrame` (the app shell gives the menu).
- Everything the live copy does today moves into the designed screen (the "keep" column below). Nothing is dropped.
- Then the live copy, its "Live" stories and its tests are deleted; the tests are ported to the design
  (as Time did with `attendance-live.test.tsx`). The line leaves `known.json`.
- Types stay where they are (`live/types*.ts`); the design file imports them, as Time imports `time/live/types`.
- Routes stay the same; the menu (`apps/web/lib/yx-nav.ts`) does not change unless the founder says so (Q1).

## Hidden copies (the guard cannot see them)

The guard matches screens by name only. These live pages render a live copy whose name is the same as a designed
screen, so the guard counts them as "designed and live". They need the same wiring:

| live page | screen it renders today (file) | design with the same name |
|---|---|---|
| /yx/payroll/loans, /yx/me/loans | `LoansScreen` (live/operations.tsx) | PAY-17 `LoansScreen` (admin-tax-loans.tsx) |
| /yx/payroll/ewa | `EwaAdminScreen` (live/special.tsx) | PAY-27 `EwaAdminScreen` (admin-tax-loans.tsx) |
| /yx/payroll/actuarial (done, builder 2) | `ActuarialScreen` (live/special.tsx) | PAY-38 `ActuarialScreen` (offcycle.tsx) |
| /yx/payroll/statutory | `StatutoryHubScreen` (live/compliance.tsx) | CMP-01 `StatutoryHubScreen` (ops/compliance.tsx) |
| /yx/payroll/registers | `RegistersScreen` (live/operations.tsx) | CMP-03 `RegistersScreen` (ops/compliance.tsx) |
| /yx/me/pay-documents | `MyPayDocumentsScreen` (live/documents.tsx) | its own story "Screens/Pay/Me · Pay documents" (not titled Live, so the guard takes it as a design) |

Also: `@yukthix/ui/pay` (`live/index.ts`) exports only live screens today. No designed Pay screen is exported to the app
yet; each builder adds its design exports there.

## Founder decisions, 29 Oct 2026 ("all OK": every suggestion in section 6 accepted)

1. Payroll home: PAY-01 shows on `/yx/payroll/runs`, run list under it; menu "Runs" becomes "Payroll home".
2. F&F: the People settlement calculator (PPL-22) works out the amount; PAY-11 F&F stories are the off-cycle run that pays it.
3. The 12 live screens with no design get a design story first (new PAY groups), then go live. Order: periods,
   consultants, audit, documents, go-live (inside PAY-16), payment modes (inside PAY-10), special pay home, equity,
   country packs.
4. Special pay home: new group "PAY-50 · Special pay home" (lay-off days, VRS, postings), linking PAY-31…37.
5. Compliance pages (CMP-01…08 in ops/compliance.tsx): their own map and builder after these three.
6. Form 12B: employee enters previous-employer income in the tax workspace; payroll checks it in PAY-23.
7. Court orders: a tab on `/yx/payroll/arrears` ("Arrears and recoveries").
8. Loans: company settings with defaults, at most 2 months' gross and only after probation; HR can change both.
9. Features not built: bonus (PAY-24) first, then reports (PAY-25); group health, EWA partner, payslip chat wait.
10. Phone views wait for the mobile app.
11. Guard fixed first (commit ed0708c8): it follows the web's imports, so same-name copies now count.
12. Me › Pay documents: its story is accepted as the design, moved into `employee-pay.tsx` with `MyPayFrame`.


**Founder answers to builders 1 and 2 (29 Oct, "all ok"):** (1) taller pages accepted where the content needs it
(Payroll home with runs, set-up wizard, payslip layout); (2) build the small server additions: statutory dues on the
home, one stage row per pay group, re-pay a failed payment (reason, audited), record "Show pay" views, release hold with
reason and off-cycle choice, reassign a query, retry only failed, compensation history, suggest-split stale flag,
minimum-wage top-up read, mark union dues remitted; (3) later: hourly pay basis, actuary detail rows, reopen requests in
Approvals; (4) "New settlement" drawer on PAY-37, design first; (5) fix the shared form bug (a key typed after an
error shows is lost) with a guard test; (6) a payslip query is closed only after a reply; (7) builder 1 wires PAY-11
(off-cycle and F&F run) on the run pages.

## 1. Live pages

One row per live Pay page. "Keep" is what the live copy does that the design does not show yet: states, actions,
permissions. The wiring must keep all of it.

| page | live screen today | design that replaces it | verdict | keep (live copy has, design lacks) |
|---|---|---|---|---|
| /yx/payroll/runs | `PayRunsScreen` (live/runs.tsx) | PAY-01 home + PAY-29 run list + PAY-11 "Choose run type" | live: PAY-01 home + PAY-29 run list (builder 1) | list of runs by month with 9 statuses (incl. Void, Reopened); New run drawer: monthly or off-cycle (bonus, arrears, correction, payment), pay group, month, sub-period for weekly groups; `canPrepare`, `canOffcycle`; "No payroll runs yet" |
| /yx/payroll/runs/[id] | `PayRunScreen` (live/runs.tsx) | PAY-02, PAY-03, PAY-07, PAY-08, PAY-09 (PAY-30 inside the checks) | live: PAY-03 workspace with PAY-02 checks, PAY-07, 08, 09 (builder 1) | void a run with reason ("This run is void"); add an item to the run; confirm a pay change with a note; reject with reason; typed phrase + second factor (`Confirmation`) on approve, bank release, publish; bank file made by one person, released by another; `can.prepare / approve / bankGenerate / bankRelease / publish / offcycle`; "Calculate the run first" |
| /yx/payroll/runs/[id]/payments | `RunPaymentsScreen` (live/operations.tsx) | PAY-10 | live: PAY-10 (builder 1) | record bank results row by row or by file (all or nothing, row errors shown); cash and cheque entry; `can.record`; back to the run |
| /yx/payroll/files | `ExchangeFilesScreen` (live/documents.tsx) | PAY-10 "Bank files" tab (partly) | live: PAY-10 Bank files, every payroll file (builder 1) | every payroll file (not only bank files) with hash, rows, totals; single-use download link; release by a second person with `Confirmation` |
| /yx/payroll/inputs | `PayInputsScreen` (live/inputs.tsx) | PAY-04, PAY-05, PAY-06 | live: PAY-04, 05, 06 as tabs (builder 1) | month picker; person search; LOP days with reason; one-time pay returns "needs review" above the company limit (`payroll.one_time_review_above`); cancel one-time pay; hold with reason code, release; a locked month takes no inputs |
| /yx/payroll/payslip-queries | `PayslipQueriesScreen` (live/operations.tsx) | PAY-20 | live: PAY-20 (builder 1) | filter open / answered / closed; reply; close; never one's own query |
| /yx/payroll/loans | `LoansScreen` (live/operations.tsx, hidden copy) | PAY-17 | wire design | request for someone (person search); pause, pre-close, reschedule; "expense" loan (overdue expense advance, M05); `can.manage` |
| /yx/me/loans | `LoansScreen` with `mine` (hidden copy) | PAY-18 | wire design | ask for a loan or advance (instalments, interest, first month); what is left to repay; approval goes to the Approvals inbox |
| /yx/payroll/arrears | `ArrearsScreen` (live/compliance.tsx) | PAY-28 `ArrearsBaseScreen` (PAY-19 tabs from builder 1 go in the `recoveryTabs` slot) | live already (builder 2, 29 Oct) | worksheet list; confirm base with as-paid lines and reason; approve into an off-cycle run; cancel; overpayment write-off with reason; `can.approve / writeOff`; maker is not checker (`me`) |
| /yx/payroll/compensation | `CompensationLiveScreen` (live/structures.tsx) | PAY-12 `CompensationScreen` + PAY-42 | live already (builder 2, 29 Oct) | person search; pay in force; preview breakup; submit change with reason (goes for approval); revision letter with signatory; statutory profile (PF, ESI, VPF) with reason; suggest split |
| /yx/payroll/templates | `TemplatesLiveScreen` (live/structures.tsx) | PAY-13 `TemplateBuilderScreen` | live already (builder 2, 29 Oct) | template per legal entity; formula check; validate with a sample breakup and the code-wage flag; new version from a date |
| /yx/payroll/components | `ComponentLibraryLiveScreen` (live/structures.tsx) | PAY-14 `ComponentLibraryScreen` | live already (builder 2, 29 Oct) | add and edit with wage flags; install the starter set (shows how many were added) |
| /yx/payroll/payslip-layout | `PayslipLayoutLiveScreen` (live/setup.tsx) | PAY-15 `PayslipLayoutScreen` | live already (builder 2, 29 Oct) | legal entity picker; save blocks and languages; preview PDF; activate |
| /yx/payroll/setup | `PaySetupScreen` (live/setup.tsx) | PAY-16 `PayrollSetupScreen` (Registrations step) | live already (builder 2, 29 Oct) | legal entity picker; checklist steps that open other pages; registrations; legal options with a valid-from date |
| /yx/payroll/pay-groups | `PayGroupsScreen` (live/setup.tsx) | PAY-16 `PayrollSetupScreen` (Pay group step) | live already (builder 2, 29 Oct) | add and edit groups (day basis, cut-off, pay day, monthly / weekly / fortnightly, anchor date, version); members from a date; calendar per year |
| /yx/payroll/imports | `PayImportsScreen` (live/setup.tsx) | PAY-16 `PayrollSetupScreen` (Opening balances step) | live already (builder 2, 29 Oct) | stage a CSV per kind, commit; go-live check for a month |
| /yx/payroll/coverage | `CoverageLiveScreen` (live/setup.tsx) | PAY-30 | live: PAY-30 (builder 1) | legal entity column; read only |
| /yx/payroll/proofs | `ProofCheckScreen` (live/operations.tsx) | PAY-23 | wire design | filter pending / approved / part / rejected; open file n of a line; decide with comment |
| /yx/payroll/ewa | `EwaAdminScreen` (live/special.tsx, hidden copy) | PAY-27 | wire design | legal entity and month; policy editor (share %, least and most a draw, draws a month, closed days, fee and who pays); mark paid with bank reference; mark failed with reason |
| /yx/payroll/special-pay | `SpecialPayScreen` (live/special.tsx) | PAY-50 `SpecialPayHomeScreen`, with PAY-31, 32, 34, 35, 36, 37 as tabs | live already (builder 2, 29 Oct) | legal entity and month; list of postings sent to payroll with status; rate cards; key output and CSV import; plans, results, send a month; tip pools (hours, points, shifts; "paid by customers directly" record only); on-call rules and slots; unions, authorisations, revoke, remittance; wage settlements; **lay-off days and VRS (no design, Q9)** |
| /yx/payroll/actuarial | `ActuarialScreen` (live/special.tsx, hidden copy) | PAY-38 `ActuarialScreen` | live already (builder 2, 29 Oct) | legal entity; census (Ind AS 19 / AS 15) and its download; record a valuation (gratuity or leave) with the report file; post the journal; `can.census / journal` |
| /yx/me/payslips | `MyPayslipsScreen` (live/employee.tsx) | PAY-21 + PAY-40 | wire design | published payslips; detail with every line explained; PDF; query on a line; "what changed" worked out only from the two payslips' lines; reimbursements section; "Your net pay is on hold" |
| /yx/me/tax | `MyTaxScreen` (live/employee.tsx) | PAY-22 "Overview" + PAY-41 | wire design | workspace; compare regimes; choose a regime |
| /yx/me/tax-declarations | `MyDeclarationsScreen` (live/operations.tsx) | PAY-22 "Declarations", "Proofs" | wire design | declare a line; upload a proof; Part A of my certificates (download) |
| /yx/me/earned-pay | `MyEwaScreen` (live/special.tsx) | PAY-26 (desktop stories) | wire design | draw an amount; tick "I understand … is taken from this month's pay"; my draws. Has no error state today (the design's states fix it) |
| /yx/me/incentives | `MyIncentivesScreen` (live/special.tsx) | PAY-33 | wire design | results and clawbacks. Has no error state today |
| /yx/performance/pay-band | `MyPayBandScreen` (performance/live/comp.tsx) | PAY-39 | wire design | loading / error / retry; nothing shown when the company turns bands off |
| /yx/payroll/statutory | `StatutoryHubScreen` (live/compliance.tsx, hidden copy) | CMP-01, CMP-04, CMP-05, CMP-12 (ops area) | wire design, not in this plan (Q4) | entity and month; make, upload, file each return (second factor + typed phrase); TDS challan; quarterly TDS return (reconcile, file, .fvu, filed) |
| /yx/payroll/registers | `RegistersScreen` (live/operations.tsx, hidden copy) | CMP-03 | wire design, not in this plan (Q4) | make, download, freeze, sign with the company token, inspection pack; `can.generate / sign / download` |
| /yx/payroll/certificates | `TaxCertificatesScreen` (live/operations.tsx) | CMP-06 Form 16 bulk | wire design, not in this plan (Q4) | Part A ZIP import or one PDF; issue one or all (with `Confirmation`); tax year |
| /yx/payroll/statutory-rules | `StatutoryRulesScreen` (live/setup.tsx) | CMP-08 "Rules" | wire design, not in this plan (Q4) | legal entity; read only |
| /yx/payroll/advisories | `AdvisoriesScreen` (live/operations.tsx) | CMP-08 "Updates" | wire design, not in this plan (Q4) | legal entity; mark reviewed with a note |
| /yx/payroll/consultant-tds | `ConsultantTaxScreen` (live/consultants.tsx) | CMP-04 / CMP-05 (for Form 140, 131) | wire design, not in this plan (Q4) | challans per section; draft, reconcile, make file, filed (token, `Confirmation`); import Form 131 certificates |
| /yx/payroll/fnf | `FnfCalculator` (people, PPL-22) | PPL-22 | live already | (see Q2 for PAY-11) |
| /yx/people/pay-access | `PayAccessRequests` (frame, PPL-50) | PPL-50 | live already | |
| /yx/time/payroll-feed | `AttendanceReportsScreen` with `live` | TIM-16 | live already | |
| /yx/pay-portal/[org], /yx/verify/[code] | T9 portal sign-in, alumni and nominee tabs, verify page | T9-02, T9-08 | live already | |
| /yx/me/pay-documents | `MyPayDocumentsScreen` (live/documents.tsx) | its own story "Me · Pay documents" | live already (by the guard; Q10) | |
| /yx/payroll/audit, documents, periods, reopen-requests, payment-modes | designed first, then live (builder 1) | PAY-46, PAY-48, PAY-49, PAY-10 "Payment modes" | live | everything the copies did, see section 2 |
| /yx/payroll/go-live | `GoLiveScreen` (deleted) | PAY-16 `PayrollSetupScreen` (Go-live step, new stories) | live already (builder 2, 29 Oct) | readiness; parallel run upload; sign off or waive (the uploader cannot sign off) |
| /yx/payroll/country-packs | `CountryPacksScreen` (copy deleted) | PAY-51 `CountryPacksScreen` (new) | live already (builder 2, 29 Oct) | switch on; UAE EOSB and WPS; US W-9 and 1099-NEC |
| /yx/payroll/consultants, equity; /yx/me/equity; /yx/consultant/[org] | live copies | none | no design (section 2) | |

## 2. Live pages with no design

These live copies have no design story at all. The design comes first (a story in the house style), then the wiring.
Until then they stay in `known.json`.

| page | screen | what it does | suggestion |
|---|---|---|---|
| /yx/payroll/go-live (done, builder 2) | `GoLiveScreen` | what a legal entity still needs before its first live month; the parallel run (old payroll's register uploaded on a YukthiX run, compared person by person; someone else signs it off or waives it) | add stories to **PAY-16** (a "Go-live" step after "Review"): readiness list, parallel run compare, signed off / waived |
| /yx/payroll/country-packs (done, builder 2: PAY-51) | `CountryPacksScreen` | switch on a country pack per entity; UAE end-of-service provision and WPS ids and file; US W-9 and 1099-NEC | **new group** (PAY-44 · Country packs); it is a separate job and grows per country |
| /yx/payroll/consultants | `ConsultantsScreen` | consultant register, bank check, lower-TDS certificate (197), invoices with TDS, payout batches (made by one, released by another), results | **new group** (PAY-45 · Consultants) |
| /yx/consultant/[org] | `ConsultantPortalScreen` | the consultant's own page after a one-time code: upload invoices, payment advices, TDS certificates | a story in **PAY-45** with the T9 portal frame (sign-in is already the designed T9 one) |
| /yx/payroll/audit | `AuditScreen` | business events with Confidential values masked, a record's timeline, daily chain check and "Check now", export (itself recorded) | **done: PAY-46 · Audit log** (13 stories), live |
| /yx/payroll/equity, /yx/me/equity | `EquityScreen`, `MyEquityScreen` | plans (ESOP, RSU, SAR), valuations (FMV), grants and vesting, confirm vesting, exercise paid, cap table; the person's grants and exercising | **new group** (PAY-47 · Equity), admin and employee stories |
| /yx/payroll/documents | `PayDocumentsScreen` + `NomineeDrawer` | issued pay documents (never change; superseded by a correction), reference, SHA-256, verify code; add a nominee for the pay portal | **done: PAY-48 · Pay documents** (10 stories, nominee drawer inside the screen), live |
| /yx/payroll/periods, /yx/payroll/reopen-requests | `PayPeriodsScreen`, `ReopenRequestsScreen` | stage of every month per legal entity, its history; ask to reopen; two-approval reopen (maker is not checker, second factor, typed phrase) | **done: PAY-49 · Pay periods** (21 stories, reopen requests included), live |
| /yx/payroll/payment-modes | `PaymentModesScreen` | who is paid by cash or cheque instead of the bank; asked for here, approved by someone else | **done: PAY-10 "Payment modes" tab** (4 stories), live |
| /yx/payroll/special-pay (part; done, builder 2: PAY-50) | lay-off days, VRS, postings list in `SpecialPayScreen` | lay-off compensation days per entity, VRS payment with exemption; the month's special pay sent to payroll | **new group** (PAY-50 · Special pay home): postings list, lay-off, VRS; it links to PAY-31…37 |

(PAY-46, 48, 49 are used by builder 1; PAY-44, 45, 47 are left unused; builder 2 uses PAY-50 … 53, builder 3 PAY-54 and up.)

## 3. Designs with no live page or API

| design | what it needs | size |
|---|---|---|
| PAY-24 Bonus computation (4) | Payment of Bonus Act: eligible employees and bonus wage (the `bonusWage` flag exists), 8.33 % to 20 %, allocable surplus from the accounts (an input), set-on and set-off over 4 years; a `bonus_computations` table; pays through the existing off-cycle "bonus" run | M |
| PAY-25 Payroll reports (13) | `GET payroll/reports/:kind` with filters and export, read only, behind the pay guard and a new `payroll.report.view` key: salary register, reconciliation, variance, CTC by department, arrears, YTD, bank advice, hold ageing, gratuity provision, loan ledger. The data is already in payslips, holds, loans, journal and actuarial | L |
| PAY-43 Group health (5) | an insurance broker partner (licensed), quotes, disclosure acknowledgement, policy and endorsements, minimum headcount rule; new tables. Blocked on choosing a partner | L |
| PAY-27 "Partner connection" (1) | partner-funded earned wage access (connector P10); today draws are employer-funded only | M |
| PAY-40 "Chat panel" (1) | a chat about one's own payslip (wave 5); nothing in the API | M |
| PAY-18 "Over limit", "Not eligible" (2) | company settings for loans: most a loan or advance (e.g. months of pay) and who may ask (after probation, months of service); checked in `requestLoan` | S |
| Gaps (10 stories marked "wire design (gap)") | hold ageing (work out in the page, S); "waiting for a new IFSC" payment status (S); retrenchment permission read by the F&F run (S); court order remittances (S); carry-forward list (S); deduction-cap read (S); employee enters Form 12B (M, Q5); regime what-if inputs (S); EWA reconciliation (S) | S to M |
| PAY-19 court orders | API exists (`GET/POST court-orders`) but no live page shows them: the wiring adds them to /yx/payroll/arrears (Q6) | S |

## 4. Design groups, story by story

### A. Runs and payments

#### PAY-01 · Payroll home

Live page: /yx/payroll/runs (founder Q1)

| story (sub-page) | verdict | note |
|---|---|---|
| InReviewBlocked · In review · blocked (payroll admin) | live |  |
| FinanceApprover · Finance approver | live | as a person with payroll.run.approve |
| ReadyToApprove · Nothing blocking (finance approver) | live |  |
| Approved · Approved · bank file next | live |  |
| Paid · Paid · publish next | live |  |
| Draft · Draft · new month | live |  |
| FirstUse · Empty · payroll not set up | live | no pay group yet: link to /yx/payroll/setup |
| Loading · Loading | live |  |
| ErrorState · Error | live |  |

#### PAY-02 · Run readiness

Live page: /yx/payroll/runs/[id] (Checks step)

| story (sub-page) | verdict | note |
|---|---|---|
| Blocked · Blocking items | live (gap) | inside the run workspace (Validations tab); no API for the attendance-group and input-source tables; only blocking checks can be waived |
| WaiveDialog · Waive with reason (dialog open) | live | POST runs/:id/validations/:vid/waive |
| AllClear · Ready to calculate | live |  |
| Loading · Loading | live |  |
| ErrorState · Error | live |  |

#### PAY-03 · Run workspace

Live page: /yx/payroll/runs/[id]

| story (sub-page) | verdict | note |
|---|---|---|
| Payslips · Payslips tab · in review | live |  |
| WhyDrawer · Payslip why-this-number drawer | live | GET payslips/:id (lines with rule cited) |
| Calculating · Calculating · per-employee progress | live | GET runs/:id/progress |
| Failed · Calculation failed · named fixes | live (gap) | failures are named in the progress panel; no "retry the failed only" call in the API |
| Variance · Variance tab · acknowledge | live |  |
| Inputs · Inputs tab | live (gap) | no per-source input summary in the API; shows the run facts and, for off-cycle runs, Add item |
| Validations · Validations tab | live |  |
| Approvals · Approvals tab (finance approver) | live |  |
| Files · Files tab · approved | live (gap) | no journal or statutory rows with links; one "Payments and journal" row opens the payments page |
| Loading · Loading | live |  |
| ErrorState · Error | live |  |

#### PAY-07 · Approve run and lock period

Live page: /yx/payroll/runs/[id] (Approve)

| story (sub-page) | verdict | note |
|---|---|---|
| Ready · Impact preview · type to confirm | live |  |
| Blocked · Blocked · attendance exceptions open | live |  |
| SamePerson · Maker is checker · refused | live | API refuses maker = checker |
| SelfApproval · Sole approver · self-approval with reason | live | asked when sending for approval (submit with selfApprovalReason), not in the approve sheet |
| Done · Approved and locked | live |  |

#### PAY-08 · Release bank file

Live page: /yx/payroll/runs/[id] (Bank file)

| story (sub-page) | verdict | note |
|---|---|---|
| Ready · Impact preview · type to confirm | live |  |
| Regenerate · Regenerate with reason | live | "Make a new bank file" with a required reason |
| Released · Released · download | live |  |

#### PAY-09 · Publish payslips

Live page: /yx/payroll/runs/[id] (Publish)

| story (sub-page) | verdict | note |
|---|---|---|
| Ready · Impact preview · type to confirm | live |  |
| SelfApproval · Sole payroll admin · reason required | live (gap) | the API has no publish self-approval reason |
| Published · Published · progress finished | live |  |

#### PAY-10 · Payments and files

Live page: /yx/payroll/runs/[id]/payments

| story (sub-page) | verdict | note |
|---|---|---|
| Status · Payment status · failures | live |  |
| Failure · Returned payment · re-pay route | live (gap) | no re-pay endpoint (next bank file / off-cycle / reimbursement account); live shows the status and Record result |
| FailedIfsc · Failed payment · waiting for corrected IFSC | live (gap) | the API has no "waiting for a new IFSC" status |
| Register · Disbursement register · cash and cheque | live |  |
| Files · Bank files | live | also /yx/payroll/files: every payroll file, second-person release |
| Journal · Journal export (finance approver) | live | GET runs/:id/journal and export; "Send to accounting system" has no API, live offers Tally, CSV, Zoho Books |
| Loading · Loading | live |  |
| ErrorState · Error | live |  |
| PaymentModes · Payment modes · cash and cheque people | live | new (founder decision 3); /yx/payroll/payment-modes |
| PaymentModesAsk · Payment modes · ask for a mode (drawer) | live | new |
| PaymentModesEmpty · Payment modes · empty, everyone by bank | live | new |
| PaymentModesNoAccess · Payment modes · no access | live | new |

#### PAY-11 · Off-cycle run

Live page: /yx/payroll/runs (New run) and /yx/payroll/runs/[id] for an off-cycle run (founder Q2)

| story (sub-page) | verdict | note |
|---|---|---|
| Fnf · F&F · 2-working-day deadline | wire design | F&F run; the settlement itself is the designed PPL-22 page /yx/payroll/fnf |
| Retrenchment · F&F retrenchment · blocked without permission | wire design (gap) | the permission is recorded in People exits (lifecycle); the run does not read it yet |
| RetrenchmentOk · F&F retrenchment · permission recorded | wire design (gap) | same as above |
| Death · F&F on death in service · nominee shares | wire design | POST fnf/:id/payees (nominee shares) |
| Bonus · Bonus run | wire design |  |
| ChooseType · Choose run type (arrears only, correction) | wire design |  |

#### PAY-29 · Weekly and fortnightly runs

Live page: /yx/payroll/runs (weekly and fortnightly groups)

| story (sub-page) | verdict | note |
|---|---|---|
| WeeklyList · Run list · weekly | live | run list under the PAY-01 home on /yx/payroll/runs; no pay date per run in the API |
| FortnightlyList · Run list · fortnightly | live |  |
| WeeklyRun · Weekly run · payslips step | live (gap) | a weekly run opens the PAY-03 run workspace, not this step view |
| Loading · Loading | live |  |

#### PAY-30 · Coverage monitor

Live page: /yx/payroll/coverage (and inside PAY-02 checks)

| story (sub-page) | verdict | note |
|---|---|---|
| Crossed · Threshold crossed · blocks approval | live (gap) | the API status has no "crossed, set-up needed"; the page is read only, so Switch on / Record applied never show |
| Approaching · Approaching only | live | /yx/payroll/coverage; "Counting" always Employees (no basis in the API) |
| Empty · Empty · nothing near a threshold | live |  |
| Loading · Loading | live |  |

### B. Inputs, loans, recoveries, queries

#### PAY-04 · Manual LOP input

Live page: /yx/payroll/inputs (Loss of pay)

| story (sub-page) | verdict | note |
|---|---|---|
| Default · Inline entry · one row with an error | live |  |
| BulkUpload · Bulk upload · row validation | live | CSV read in the page, one PUT lop-inputs/:month |
| Frozen · Period frozen · late request only | live (gap) | the inputs API does not return the month stage; a locked month shows as the refusal on save; no late-request form |
| Empty · Empty · no Assumed-present groups | live |  |
| Loading · Loading | live |  |
| ErrorState · Error | live |  |

#### PAY-05 · One-time pay

Live page: /yx/payroll/inputs (One-time pay)

| story (sub-page) | verdict | note |
|---|---|---|
| List · List · filters and bulk actions | live (gap) | filters and search work; bulk "send for approval" / "delete drafts" have no API (items are never drafts) |
| AddSheet · Add one-time pay · effect summary | live (gap) | no TDS, PF, ESI effect preview in the API; the panel shows the month or recurring plan and the approval rule |
| Recurring · Add recurring item · prorated months | live | API has a recurring end date (dto-5c); the live copy has no recurring form today |
| BulkUpload · Bulk upload · row validation | live | CSV read in the page, one POST each row |
| Empty · Empty · first use | live |  |
| Loading · Loading | live |  |
| ErrorState · Error | live |  |

#### PAY-06 · Salary holds and releases

Live page: /yx/payroll/inputs (Holds)

| story (sub-page) | verdict | note |
|---|---|---|
| Default · Holds by reason · ageing chart | live | ageing worked out in the page from hold dates |
| Release · Release sheet · next bank file or off-cycle | live (gap) | the API releases into the next bank file only; no off-cycle choice, no release reason |
| AddHold · Hold a salary · reason code | live |  |
| AsTab · Tab on One-time pay and holds | live |  |
| Loading · Loading | live |  |
| ErrorState · Error | live |  |

#### PAY-17 · Loans and advances

Live page: /yx/payroll/loans

| story (sub-page) | verdict | note |
|---|---|---|
| List · List · filters | wire design |  |
| Record · Loan record · EMI schedule | wire design |  |
| Paused · EMIs paused | wire design |  |
| PauseDialog · Pause EMIs with reason | wire design |  |
| PreClose · Pre-closure | wire design |  |
| Empty · Empty | wire design |  |
| Loading · Loading | wire design |  |
| LoadError · Error · retry | wire design |  |

#### PAY-18 · Loan or salary advance request

Live page: /yx/me/loans

| story (sub-page) | verdict | note |
|---|---|---|
| Advance · Salary advance · schedule preview | wire design |  |
| OverLimit · Personal loan · over limit | design only, feature not built | no loan limit rule in the API (needs a company setting) |
| NotEligible · Not eligible · new joiner on probation | design only, feature not built | no probation or eligibility rule in the API (needs a company setting) |
| Submitted · Submitted · approval steps | wire design |  |
| Phone · phone | phone view, mobile app not built |  |
| PhoneSubmitted · phone · submitted | phone view, mobile app not built |  |

#### PAY-19 · Court orders and recoveries

Live page: /yx/payroll/arrears (founder Q6)

| story (sub-page) | verdict | note |
|---|---|---|
| CourtOrders · Court orders | wire design (ready) | RecoveriesScreen takes `live`; builder 2 renders it on /yx/payroll/arrears |
| OrderPanel · Court order record · remittances | wire design (gap) | no remittances endpoint; shows remitted against cap only |
| CarryForwards · Carry-forwards (negative net) | wire design (gap) | no list endpoint; tab left out of live |
| Overpayments · Overpayments · consent and write-off | wire design (ready) | write-off with reason; "Send reminder" has no API |
| Cap · Deduction cap check · EMI deferred | wire design (gap) | no read endpoint; tab left out of live |
| Loading · Loading | wire design (ready) |  |

#### PAY-20 · Payslip query queue

Live page: /yx/payroll/payslip-queries

| story (sub-page) | verdict | note |
|---|---|---|
| Open · Open queries | live |  |
| Thread · Query drawer · reply in app | live (gap) | reply, assign to me, resolve work; line amount and reassign to a named colleague have no API |
| InProgress · Query in progress | live |  |
| Empty · Empty | live |  |
| Loading · Loading | live |  |
| ErrorState · Error | live |  |

#### PAY-28 · Arrears base confirmation

Live page: /yx/payroll/arrears (`ArrearsBaseScreen` with `live`, offcycle-live.tsx). The "Recoveries" tab is the slot `live.recoveryTabs` for builder 1's PAY-19 tabs; until they land it shows an interim overpayments table with write-off

| story (sub-page) | verdict | note |
|---|---|---|
| Missing · Month missing · approval blocked | live already |  |
| Confirmed · Base confirmed · ready to compute | live already | PF/ESI split shows as "Extra company cost" (what the API returns) |
| Computed · Arrears computed · send for approval | live already | approve; maker is not checker |
| List · Worksheets · list (the page) | live already | new |
| ListOpen · Worksheets · one open, base needed | live already | new |
| Empty · Empty · no worksheets | live already | new |
| Loading · Loading | live already | new |
| ErrorState · Error | live already | new |
| NoAccess · No access | live already | new |

### C. Structures and set-up

#### PAY-12 · Compensation and revision

Live page: /yx/payroll/compensation (builder 2: `CompensationScreen` with `live`, comp-setup-live.tsx)

| story (sub-page) | verdict | note |
|---|---|---|
| Tab · Compensation tab · breakup and history | wire design (gap) | live: salary in force and lines in force; history timeline: the API returns only the salary in force (no history endpoint) |
| Revision · Revision sheet · effect summary | live already | POST compensations/preview, then employees/:id/compensation-changes (for approval); revision letter with signatory |
| Arrears · Back-dated revision · arrears preview | wire design (gap) | a back-dated date is taken; the month-by-month arrears table needs arrears months in the preview response |
| Hourly · Pay basis · hourly rate (placement) | wire design (gap) | the API takes only entryMode ctc or fixed: no hourly or daily pay basis |
| HrPersona · HR view | live already | Revise only with employee.salary.manage + employee.change.manage; payroll keeps the statutory profile tab |
| Loading · Loading | live already |  |
| ErrorState · Error | live already | retry |

#### PAY-13 · Template builder

Live page: /yx/payroll/templates (`TemplateBuilderScreen` with `live`)

| story (sub-page) | verdict | note |
|---|---|---|
| Default · Formula editor · live test employee | live already | test employee = sample CTC, state and age (no named-person pick) |
| Autocomplete · Autocomplete open | live already | POST formulas/check on leaving the field |
| Cycle · Validation error · circular formula | live already | POST templates/validate |
| AddBack · Code wage add-back flagged | live already |  |
| Published · Published new version | live already | new version from a date; "compare with version N" not shown: the API returns no version lines |

#### PAY-14 · Component library

Live page: /yx/payroll/components (`ComponentLibraryScreen` with `live`)

| story (sub-page) | verdict | note |
|---|---|---|
| List · Grouped by type · flag columns | live already | starter set shows how many were added |
| Edit · Edit component flags | live already | "used in N templates" shows "on payslips since …" (the API gives usedAt only) |
| Statutory · Statutory component · locked | live already |  |
| Loading · Loading | live already |  |
| ErrorState · Error | live already |  |

#### PAY-15 · Payslip layout editor

Live page: /yx/payroll/payslip-layout (`PayslipLayoutScreen` with `live`)

| story (sub-page) | verdict | note |
|---|---|---|
| Draft · Draft · sample-employee preview | live already | save, Preview PDF (real layout), publish; the on-screen preview uses sample figures. Discard draft, logo and PDF password: no API |
| Bilingual · Second language on | live already | hi, ta, te, kn |
| Published · Published version | live already |  |

#### PAY-16 · Payroll set-up wizard

Live page: /yx/payroll/setup, /pay-groups, /imports, /go-live (`PayrollSetupScreen` with `live`; each route opens its step; setup-live.tsx)

| story (sub-page) | verdict | note |
|---|---|---|
| Registrations · Registrations · completeness check failing | live already |  |
| RegistrationsComplete · Registrations complete | live already |  |
| PayGroup · Pay group and cut-off | live already | /yx/payroll/pay-groups |
| Opening · Opening balances · as-paid import | live already | /yx/payroll/imports. The bank format and accounting mapping steps stay sample: no debit-account API, ledger mappings not wired |
| Review · Review | live already | "Switch payroll on" has no API: go-live readiness stands in |
| GoLiveCompare · Go-live · parallel run compared, differences to sign off | live already | new (founder decision 3); /yx/payroll/go-live |
| GoLiveSignOffDialog · Go-live · sign off with differences (dialog open) | live already | new; the uploader cannot sign off |
| GoLiveWaiveDialog · Go-live · waive the parallel run (dialog open) | live already | new |
| GoLiveSignedOff · Go-live · signed off, ready | live already | new |
| GoLiveWaived · Go-live · waived | live already | new |
| GoLiveEmpty · Go-live · no comparison yet | live already | new |
| LegalOptions · Registrations · legal options | live already | new; option with a valid-from date |
| PayGroups · Pay groups · list | live already | new |
| PayGroupAdd · Pay groups · add a group (drawer open) | live already | new |
| PayGroupMembers · Pay groups · members and calendar | live already | new |
| OpeningChecked · Opening balances · rows checked, ready to commit | live already | new |
| OpeningRowErrors · Opening balances · a row has a problem | live already | new |
| Loading · Loading | live already | new |
| ErrorState · Error | live already | new |
| NoAccess · No access | live already | new |

#### PAY-42 · Suggest split

Live page: /yx/payroll/compensation (Suggest split)

| story (sub-page) | verdict | note |
|---|---|---|
| Options · Options side by side · one not offered | live already |  |
| Stale · Stale after a law change | wire design (gap) | POST compensations/suggest returns no "stale after a law change" flag |
| Chosen · Option chosen (HR) | live already |  |

### D. Employee pay and tax

#### PAY-21 · Payslip viewer

Live page: /yx/me/payslips

| story (sub-page) | verdict | note |
|---|---|---|
| Desktop · Net first · why this number | wire design |  |
| RaiseQuery · Raise a query on a line | wire design |  |
| QuerySent · Query sent | wire design |  |
| Document · Payslip PDF | wire design | GET me/payslips/:id/pdf |
| Held · Salary on hold | wire design |  |
| NotPublished · Empty · not published yet | wire design |  |
| Loading · Loading | wire design |  |
| ErrorState · Error | wire design |  |
| Phone · phone | phone view, mobile app not built |  |
| PhoneQuery · phone · raise a query | phone view, mobile app not built |  |

#### PAY-22 · Tax workspace

Live page: /yx/me/tax and /yx/me/tax-declarations (founder Q5)

| story (sub-page) | verdict | note |
|---|---|---|
| Overview · Overview · TDS explanation | wire design |  |
| Declarations · Declarations · choose regime | wire design |  |
| Locked · Regime locked after cut-off | wire design |  |
| Proofs · Proofs · old-regime variant, rejected line | wire design |  |
| Previous · Previous employer (Form 12B) | wire design (gap) | Form 12B income is read (imports); the employee cannot enter it |
| NonResident · Residential status · non-resident | wire design |  |
| NoPan · PAN inoperative warning | wire design | workspaces/:id/pan-status |
| Loading · Loading | wire design |  |
| ErrorState · Error | wire design |  |
| Phone · phone | phone view, mobile app not built |  |
| PhoneDeclarations · phone · declarations | phone view, mobile app not built |  |
| PhoneProofs · phone · proofs (old-regime variant) | phone view, mobile app not built |  |

#### PAY-23 · Proof verification queue

Live page: /yx/payroll/proofs

| story (sub-page) | verdict | note |
|---|---|---|
| Queue · Waiting lines | wire design |  |
| Line · Line with document · approve | wire design |  |
| Partial · Approve part with comment | wire design |  |
| Reject · Reject with comment | wire design |  |
| OwnProof · Own proof · cannot verify | wire design | API refuses one's own proof |
| Empty · Empty · nothing submitted | wire design |  |
| Loading · Loading | wire design |  |

#### PAY-39 · My pay band

Live page: /yx/performance/pay-band

| story (sub-page) | verdict | note |
|---|---|---|
| InBand · Within band | wire design |  |
| Above · Above band maximum | wire design |  |
| Off · Visibility off | wire design |  |
| Phone · phone | phone view, mobile app not built |  |
| Loading · Loading | wire design |  |
| ErrorState · Error | wire design |  |

#### PAY-40 · Why is my pay different

Live page: /yx/me/payslips (pay change panel)

| story (sub-page) | verdict | note |
|---|---|---|
| Explained · Every change explained | wire design |  |
| NotExplained · Not explained row · raise payslip query | wire design |  |
| Chat · Chat panel (wave 5, own payslip only) | design only, feature not built | chat about one's payslip (wave 5): nothing in the API |
| Same · No change from last month | wire design |  |
| Phone · phone | phone view, mobile app not built |  |
| PhoneUnexplained · phone · not explained | phone view, mobile app not built |  |

#### PAY-41 · Compare tax regimes

Live page: /yx/me/tax (Compare regimes)

| story (sub-page) | verdict | note |
|---|---|---|
| NewLower · New regime lower | wire design |  |
| OldLower · What-if · old regime lower (rent and home loan) | wire design (gap) | POST me/regime-compare takes no what-if inputs (rent, home loan) |
| NonResident · Non-resident · no rebate | wire design |  |
| InWorkspace · Inside the tax workspace | wire design |  |
| Phone · phone | phone view, mobile app not built |  |
| Loading · Loading | wire design |  |
| ErrorState · Error | wire design |  |

### E. Special pay, earned wage access, actuarial, benefits

#### PAY-24 · Bonus computation

Live page: none

| story (sub-page) | verdict | note |
|---|---|---|
| Minimum · Compute at 8.33% | design only, feature not built |  |
| Higher · Compute at 20% | design only, feature not built |  |
| Surplus · Allocable surplus step | design only, feature not built |  |
| Approve · Approve and pay | design only, feature not built |  |

#### PAY-26 · Earned wage access request

Live page: /yx/me/earned-pay

| story (sub-page) | verdict | note |
|---|---|---|
| Available · phone · available amount | phone view, mobile app not built |  |
| Confirm · phone · fee and recovery disclosure | phone view, mobile app not built |  |
| Disbursed · phone · sent to salary account | phone view, mobile app not built |  |
| Blackout · phone · blackout before cut-off | phone view, mobile app not built |  |
| OnHold · phone · not available, salary on hold | phone view, mobile app not built |  |
| DrawsUsed · phone · all draws used | phone view, mobile app not built |  |
| Desktop · Desktop | wire design |  |
| DesktopConfirm · Desktop · confirm | wire design |  |
| Off · Off for pay group | wire design |  |

#### PAY-27 · EWA admin

Live page: /yx/payroll/ewa

| story (sub-page) | verdict | note |
|---|---|---|
| Draws · Draws this period | wire design |  |
| Policy · Policy editor (Settings) | wire design |  |
| Partner · Partner connection | design only, feature not built | partner-funded draws not wired (DECISION NEEDED in ewa.service.ts) |
| NoPartner · Partner not connected | wire design | the true state today |
| Recoveries · Recoveries in payroll | wire design |  |
| Reconciliation · Reconciliation (finance approver) | wire design (gap) | no reconciliation endpoint; work out from draws |
| Loading · Loading | wire design |  |

#### PAY-31 · Piece-rate cards and output

Live page: /yx/payroll/special-pay, tab Piece rates (`PieceRateScreen` with `live`)

| story (sub-page) | verdict | note |
|---|---|---|
| Check · Earnings check · minimum-wage top-up | wire design (gap) | the top-up is worked out only when the month is sent; no endpoint reads it before |
| Cards · Rate cards | live already |  |
| Output · Output this period | live already |  |
| Import · Output import · validation preview | live already | CSV import |
| Loading · Loading | live already |  |
| ErrorState · Error | live already |  |

#### PAY-32 · Incentive plan builder

Live page: /yx/payroll/special-pay, tab Incentives (`IncentivePlanScreen` with `live`)

| story (sub-page) | verdict | note |
|---|---|---|
| Draft · Draft · tiers, accelerator, cap, clawback | wire design (gap) | the live form uses the API plan model (target, tiers, cap %, clawback days); effective dates, payout frequency, metric source, group, drafts and versions are not in the model |
| Overlap · Validation error · overlapping tiers | live already |  |
| Published · Published | live already | results, send a month, send clawbacks |
| Loading · Loading | live already |  |
| ErrorState · Error | live already |  |

#### PAY-33 · My incentive statement

Live page: /yx/me/incentives

| story (sub-page) | verdict | note |
|---|---|---|
| Default · Earned, paid, held | wire design |  |
| Clawback · With a clawback | wire design |  |
| Empty · Empty · not on a plan | wire design |  |
| Phone · phone | phone view, mobile app not built |  |
| PhoneClawback · phone · clawback | phone view, mobile app not built |  |

#### PAY-34 · Tips pool

Live page: /yx/payroll/special-pay, tab Tips (`TipsPoolScreen` with `live`)

| story (sub-page) | verdict | note |
|---|---|---|
| Pools · Pools by outlet and period | live already | "paid by customers directly" is record only; "collecting" pools and a card/UPI vs cash split are not in the API |
| Points · Pool · split by points | live already |  |
| Hours · Pool · split by hours | live already |  |
| Empty · Empty | live already |  |
| Loading · Loading | live already |  |
| ErrorState · Error | live already |  |

#### PAY-35 · On-call and standby rules

Live page: /yx/payroll/special-pay, tab On-call (`OnCallRulesScreen` with `live`)

| story (sub-page) | verdict | note |
|---|---|---|
| Weekday · Rules · weekday worked example | live already | rules and slots |
| Holiday · Holiday multiplier example | wire design (gap) | the API has one multiplier: no holiday multiplier, "pay standby when called out" or "count towards 48 h" |
| Empty · Empty · no slot types in the roster | live already |  |
| Loading · Loading | live already |  |
| ErrorState · Error | live already |  |

#### PAY-36 · Union check-off

Live page: /yx/payroll/special-pay, tab Unions (`UnionCheckoffScreen` with `live`)

| story (sub-page) | verdict | note |
|---|---|---|
| Authorisations · Authorisations | live already | withdraw is now wired (the API had it); uploading the signed form has no API |
| Deductions · Monthly deduction list | live already | send dues |
| Remittance · Remittance per union | wire design (gap) | the remittance statement is live; "Mark remitted" has no API |
| Loading · Loading | live already |  |
| ErrorState · Error | live already |  |

#### PAY-37 · Wage-settlement arrears

Live page: /yx/payroll/special-pay, tab Settlements (`SettlementArrearsScreen` with `live`, settlement-live.tsx)

| story (sub-page) | verdict | note |
|---|---|---|
| Categories · Categories and arrears | wire design (gap) | worker counts per category are not in the API |
| Settlement · Settlement terms | live already | send the arrears; no form to create a settlement yet (POST settlements exists; the old copy had none either) |
| Worksheet · Arrears worksheet | wire design (gap) | the affected-employees list and the embedded PAY-28 worksheet are not in the settlement API |

#### PAY-38 · Actuarial census and valuation

Live page: /yx/payroll/actuarial (`ActuarialScreen` with `live`, offcycle-live.tsx)

| story (sub-page) | verdict | note |
|---|---|---|
| Census · Census versions | live already | Ind AS 19 / AS 15, download |
| Upload · Valuation upload · figures to enter | wire design (gap) | only the closing figure is stored: service cost, interest, benefits paid, gains and losses cannot be entered |
| Uploaded · Valuation uploaded | live already |  |
| Posting · Provision posting | live already | someone else posts it |
| JournalPreview · Provision posting · journal preview | live already |  |
| Posted · Journal posted | live already | no "Reverse posting" or "Remind actuary" in the API |
| Loading · Loading | live already | new |
| ErrorState · Error | live already | new |
| NoAccess · No access | live already | new |

#### PAY-43 · Group health

Live page: none

| story (sub-page) | verdict | note |
|---|---|---|
| Quotes · Neutral quote table | design only, feature not built |  |
| Disclosure · Disclosure to acknowledge before quotes | design only, feature not built |  |
| Active · Policy active · endorsement status | design only, feature not built |  |
| NotEligible · Not eligible · under minimum headcount | design only, feature not built |  |
| LicenceExpired · Partner licence expired · offers hidden | design only, feature not built |  |

#### PAY-50 · Special pay home

Live page: /yx/payroll/special-pay (`SpecialPayHomeScreen` with `live`; its tabs render PAY-31, 32, 34, 35, 36, 37). New group (founder decisions 3 and 4)

| story (sub-page) | verdict | note |
|---|---|---|
| Ready · Sent to payroll · special pay types | live already | entity and month; sheets sent to payroll with status and lines; one status per sheet (no approver reason shown) |
| LayOff · Lay-off days · drawer open | live already | lay-off days per entity; send lay-off pay |
| Vrs · Pay VRS · exemption worked out | live already | Rs 5,00,000 lifetime exemption (s. 10(10C)) |
| Empty · Empty · nothing sent this month | live already |  |
| Loading · Loading | live already |  |
| ErrorState · Error | live already |  |
| NoAccess · No access | live already |  |

#### PAY-51 · Country packs

Live page: /yx/payroll/country-packs (`CountryPacksScreen`, country-packs.tsx). New group (founder decision 3)

| story (sub-page) | verdict | note |
|---|---|---|
| Off · UAE · not switched on | live already |  |
| SwitchOn · UAE · switch on (dialog) | live already | each setting is checked against its pattern from the pack |
| UaeOn · UAE · provision and WPS file | live already | the provision shows the total and head count only (its rows carry ids, no names) |
| UaeWps · UAE · record WPS ids (drawer) | live already |  |
| UsOn · US · 1099-NEC and W-9 | live already | file and recipient copy |
| UsW9 · US · record a W-9 (drawer) | live already |  |
| India · India entity · nothing to switch on | live already |  |
| Empty · Empty · no entity chosen | live already |  |
| Loading · Loading | live already |  |
| ErrorState · Error | live already |  |
| NoAccess · No access | live already |  |

### F. Reports

#### PAY-25 · Payroll reports

Live page: none

| story (sub-page) | verdict | note |
|---|---|---|
| Register · Salary register | design only, feature not built |  |
| Reconciliation · Reconciliation (finance approver) | design only, feature not built |  |
| Variance · Variance · chart and table | design only, feature not built |  |
| Ctc · CTC by department | design only, feature not built |  |
| Arrears · Arrears | design only, feature not built |  |
| Ytd · Year to date | design only, feature not built |  |
| BankAdvice · Bank advice | design only, feature not built |  |
| HoldAgeing · Hold ageing | design only, feature not built |  |
| Gratuity · Gratuity provision | design only, feature not built |  |
| LoanLedger · Loan ledger | design only, feature not built |  |
| Empty · Empty · no data for filters | design only, feature not built |  |
| Loading · Loading | design only, feature not built |  |
| NoAccess · No access (HR without payroll scope) | design only, feature not built |  |

### G. Records (new designs, founder decision 3; builder 1)

Designed first in `payroll-records.tsx` (data-driven: the stories pass sample data, the pages pass `live`), then made live. PAY-44, 45 and 47 are not used.

#### PAY-46 · Audit log

Live page: /yx/payroll/audit

| story (sub-page) | verdict | note |
|---|---|---|
| Ready · Events · chain OK, export allowed | live |  |
| ReadOnly · Events · read only (no export, no Check now) | live |  |
| Broken · Chain check found a break | live |  |
| NotChecked · Chain not checked yet | live |  |
| Details · An event’s details · pay values masked (drawer) | live |  |
| Timeline · A record’s timeline (drawer) | live |  |
| Checking · Check now · checking | live |  |
| CheckRefused · Check now · refused | live |  |
| NothingFound · Empty · nothing matches the filters | live |  |
| Empty · Empty · no events yet | live |  |
| Loading · Loading | live |  |
| LoadError · Error | live |  |
| NoAccess · No access | live |  |

#### PAY-48 · Pay documents

Live page: /yx/payroll/documents (nominee drawer included)

| story (sub-page) | verdict | note |
|---|---|---|
| Ready · Issued, superseded, awaiting signature, purged | live |  |
| OneEntity · Filtered to one legal entity | live |  |
| ReadOnly · Cannot add a nominee | live |  |
| DownloadRefused · Download refused | live |  |
| Nominee · Add a nominee (drawer) | live |  |
| NomineeMissing · Add a nominee · pressed with nothing filled | live |  |
| Empty · Empty · no documents yet | live |  |
| Loading · Loading | live |  |
| LoadError · Error | live |  |
| NoAccess · No access | live |  |

#### PAY-49 · Pay periods

Live page: /yx/payroll/periods and /yx/payroll/reopen-requests

| story (sub-page) | verdict | note |
|---|---|---|
| Periods · Pay periods · stage per legal entity | live |  |
| ReadOnly · Pay periods · cannot ask to reopen | live |  |
| History · A month’s history and corrections (drawer) | live |  |
| AskReopen · Ask to reopen · reason (drawer) | live |  |
| AskReopenMissing · Ask to reopen · sent with no reason | live |  |
| AskReopenRefused · Ask to reopen · the server refuses | live |  |
| Empty · Empty · no legal entity in scope | live |  |
| Loading · Loading | live |  |
| LoadError · Error | live |  |
| NoAccess · No access | live |  |
| Requests · Reopen requests · one waiting for me | live |  |
| RequestMine · Reopen requests · asked by me (two others approve) | live |  |
| Approve · Approve a reopen · type the phrase (sheet) | live |  |
| ApproveMissing · Approve a reopen · pressed without the phrase | live |  |
| ApproveRefused · Approve a reopen · second sign-in step timed out | live |  |
| TurnDown · Turn down a reopen · reason (drawer) | live |  |
| TurnDownMissing · Turn down a reopen · pressed with no reason | live |  |
| RequestsEmpty · Reopen requests · empty | live |  |
| RequestsLoading · Reopen requests · loading | live |  |
| RequestsError · Reopen requests · error | live |  |
| RequestsNoAccess · Reopen requests · no access | live |  |

## 5. Split into 3 builders

Split by design file, so each builder owns its own design files and its own page files.

| builder | design files (owner) | design groups | live pages | live copies removed | size |
|---|---|---|---|---|---|
| 1 · Runs | `payroll-run.tsx`, `payroll-inputs.tsx` | PAY-01 … 10, 19, 20, 29, 30 (83 stories) | runs, runs/[id], runs/[id]/payments, files, inputs, payslip-queries, arrears (PAY-19 tabs only), coverage | `live/runs.tsx`, `live/inputs.tsx`; from `live/operations.tsx`: `RunPaymentsScreen`, `PayslipQueriesScreen`; from `live/setup.tsx`: `CoverageLiveScreen` | L |
| 2 · Structures and special pay | `comp-setup.tsx`, `offcycle.tsx`, `special-pay.tsx` | PAY-11 … 16, 28, 31, 32, 34 … 38, 42 (73 stories; PAY-24 and 43 not built) | compensation, templates, components, payslip-layout, setup, pay-groups, imports, special-pay, arrears (PAY-28), actuarial | `live/structures.tsx`; from `live/setup.tsx`: `PaySetupScreen`, `PayGroupsScreen`, `PayslipLayoutLiveScreen`, `PayImportsScreen` (keep the shared helpers `EntityPicker`, `parseCsv`); from `live/special.tsx`: `SpecialPayScreen`, `ActuarialScreen`; from `live/compliance.tsx`: `ArrearsScreen` | L |
| 3 · Employee pay, tax, loans, EWA | `employee-pay.tsx`, `admin-tax-loans.tsx` | PAY-17, 18, 21, 22, 23, 26, 27, 33, 39, 40, 41 (83 stories; PAY-25 not built) | me/payslips, me/tax, me/tax-declarations, me/loans, me/earned-pay, me/incentives, performance/pay-band, loans, proofs, ewa | `live/employee.tsx`; from `live/operations.tsx`: `LoansScreen`, `ProofCheckScreen`, `MyDeclarationsScreen`; from `live/special.tsx`: `EwaAdminScreen`, `MyEwaScreen`, `MyIncentivesScreen`; `MyPayBandScreen` from `performance/live/comp.tsx` | L |

**/yx/payroll/arrears** is shared: builder 2 owns the page and PAY-28; builder 1 builds the PAY-19 tabs as a component in
`payroll-inputs.tsx` that builder 2's page renders. Builder 1 merges first.

**Shared files and how to avoid conflicts**

| shared file | who touches it | rule |
|---|---|---|
| `packages/yx-ui/src/design-live-guard.known.json` | all three | remove only your own lines; never re-sort. On a rebase conflict keep both removals, then run the guard (`YX_GUARD_WRITE=1` only shrinks the file) |
| `packages/yx-ui/src/screens/pay/live/index.ts` (`@yukthix/ui/pay`) | all three | edit only the export lines of the screens you replace; add your design exports as one new line per design file at the end (`export { … } from '../payroll-run'`) |
| `packages/yx-ui/src/screens/pay/pay-data.ts` | none, if possible | sample data for stories only; do not change it. If a new story needs data, add a block at the end named after the group |
| `apps/web/lib/yx-nav.ts` (menu) | builder 1 only, and only if the founder says yes to Q1 | routes stay the same |
| `live/operations.tsx`, `live/special.tsx`, `live/setup.tsx`, `live/compliance.tsx` | 1 and 3; 2 and 3; 1 and 2; 2 | delete only your own functions; do not move, rename or reformat the rest; remove unused imports in a last commit after rebase |
| `pay-kit.tsx`, `pay.css` | any, rarely | additions only, at the end of the file, named after the group; no changes to existing parts |
| `live/types*.ts`, `apps/web/lib/yx-pay*.ts` | read only | keep as they are; designs import the types from them |
| live tests (`pay-5j-live.test.tsx`, `pay-ops-live.test.tsx`, `pay-5b-live.test.tsx`, `pay-5i-live.test.tsx`, `pay-live.test.tsx`) and Live stories | all three | each builder moves its own cases to a new test file next to its design file and deletes its own cases and stories from the old files; the last builder deletes the empty files |

**Merge order:** builder 1, then 2, then 3, each rebased on the one before. Step 0 (Q8, before they start, small): make
the guard key by file and name so the six hidden copies show up in `known.json`.

## 6. Questions for the founder

1. **Payroll home (PAY-01) has no page.** Should /yx/payroll/runs show the PAY-01 home (this month's run, what blocks it,
   due dates) with the list of runs under it, and the menu item "Runs" become "Payroll home"?
   *Suggested: yes.* One page for one job, no new route, and the design already exists. The run list keeps the PAY-29
   look for weekly and fortnightly groups.
2. **Full and final has two designs.** The F&F calculator (PPL-22) is live at /yx/payroll/fnf. PAY-11 also designs F&F
   (deadline, retrenchment, death in service). Which one wins?
   *Suggested: keep PPL-22 for the settlement; use the PAY-11 F&F stories for the F&F run itself* (/yx/payroll/runs/[id]
   of an F&F off-cycle run, opened by "Open the F&F run"). Why: no two screens for one job, and both designs get used.
3. **Twelve live screens have no design** (section 2). Design them first, then wire?
   *Suggested: yes, in this order:* pay periods and reopen requests, consultants (and their portal), audit log, pay
   documents, go-live (inside PAY-16), payment modes (inside PAY-10), special pay home, equity, country packs. Why: the
   rule says design first; this order puts the screens payroll uses every month first. They stay in `known.json` until then.
4. **Compliance pages** (statutory hub, registers, certificates, rules, advisories, consultant TDS) have designs
   CMP-01 … CMP-08 in the ops area, not live. Include them in this plan?
   *Suggested: a separate "Compliance design map" and a builder after these three.* Why: the designs live in
   `ops/compliance.tsx`, so there is no file overlap, and it keeps three builders at a time.
5. **Previous employer income (Form 12B).** Today it comes only from the import. PAY-22 lets the employee enter it.
   *Suggested: yes, the employee enters it with the Form 12B as proof, and payroll checks it in the proof queue (PAY-23).*
   Why: people who join mid-year need it for correct TDS; the data model (`previousEmploymentIncome`) already exists. Size M.
6. **Court orders and recoveries (PAY-19).** The API has court orders, but no page shows them. Put PAY-19 on
   /yx/payroll/arrears ("Arrears and recoveries")?
   *Suggested: yes, as tabs next to arrears worksheets.* Why: the menu already calls that page "Arrears and recoveries",
   and it needs no new route.
7. **Loan limits and who may ask (PAY-18).** The API has no limit and no eligibility rule.
   *Suggested: two company settings with defaults: most a loan or advance = 2 months' gross pay, and asking only after
   probation.* Why: company policy must be a setting with a default, never hard-coded. Size S.
8. **The guard misses six copies** (section "Hidden copies"). Fix the guard first (match by file and name)?
   *Suggested: yes, a small change before the builders start.* Why: otherwise loans, EWA, actuarial, statutory hub,
   registers and Me › Pay documents would look done while they show the copy.
9. **Special pay home.** Lay-off days, VRS and the list of postings sent to payroll have no design.
   *Suggested: a new group "PAY-50 · Special pay home"* that lists the month's postings and has lay-off and VRS, and
   links to PAY-31 … 37. Why: these are real legal payments the live page already makes; they need a designed home.
10. **Me › Pay documents.** Its only "design" is a story of the live screen, in the live folder.
    *Suggested: accept it as the design, but move it into `employee-pay.tsx` with the `MyPayFrame`, like the other My
    pay screens.* Why: then it is a real design story and the guard checks it properly. Size S.
11. **Features not built: which first?** Bonus (PAY-24), reports (PAY-25), group health (PAY-43), EWA partner, payslip chat.
    *Suggested: bonus first, then reports; group health, EWA partner and chat wait.* Why: bonus is a legal duty (Payment
    of Bonus Act) and reports are used every month; the other three need a partner or wave 5.
12. **Phone views (19 stories).** *Suggested: leave them for the mobile app,* as Time did. Why: the web pages wire the
    desktop stories; the phone stories are the mobile app's design.

## Builder 1 status (Runs; branch `feat/yukthix-pay-runs`, 29 Oct 2026)

**Live, rendering the design with `live`** (each live part sits in a sibling `*-live.tsx`, like Time's `devices-live.tsx`):

| page | design | live file | tests |
|---|---|---|---|
| /yx/payroll/runs | PAY-01 `PayrollHomeScreen` + PAY-29 run list | `payroll-home-live.tsx` | `payroll-home-live.test.tsx` (12) |
| /yx/payroll/coverage | PAY-30 `CoverageMonitorPanel` | `payroll-home-live.tsx` | same file |
| /yx/payroll/runs/[id] | PAY-03 `RunWorkspaceScreen` (PAY-02 checks in Validations, PAY-07, 08, 09 sheets) | `run-workspace-live.tsx` | `run-workspace-live.test.tsx` (17) |
| /yx/payroll/runs/[id]/payments, /files, /payment-modes | PAY-10 `PaymentsScreen` | `payments-live.tsx` | `payments-live.test.tsx` (15) |
| /yx/payroll/inputs | PAY-05 `OneTimePayScreen` with Loss of pay (PAY-04), One-time pay, Salary holds (PAY-06) tabs | `payroll-inputs-live.tsx` | `payroll-inputs-live.test.tsx` (13) |
| /yx/payroll/payslip-queries | PAY-20 `QueryQueueScreen` | `payroll-inputs-live.tsx` | same file |
| /yx/payroll/periods, /reopen-requests, /audit, /documents | PAY-49, PAY-46, PAY-48 (`payroll-records.tsx`) | the design itself (data-driven) | `payroll-records.test.tsx` (19) |

Menu: "Runs" is now "Payroll home" (`yx-nav.ts`, nav test added).

**Copies deleted:** `PayRunsScreen`, `NewRunDrawer`, `PayRunScreen` and its tabs (live/runs.tsx; the shared `rupees`,
`RunStatusBadge`, `runName`, `PayslipLines`, `ReasonDrawer` stay for other copies); `PayInputsScreen` (live/inputs.tsx;
`PersonPicker` stays); `PayslipQueriesScreen`, `RunPaymentsScreen`, `PaymentModesScreen`, `NomineeDrawer`
(live/operations.tsx); `ExchangeFilesScreen`, `PayDocumentsScreen` (live/documents.tsx; `MyPayDocumentsScreen` stays for
builder 3); `CoverageLiveScreen` (live/setup.tsx); `PayPeriodsScreen`, `ReopenRequestsScreen`, `StageBadge`
(live/periods.tsx keeps only `monthText`); `AuditScreen` (live/audit.tsx deleted); `pay-5a-live.stories.tsx` deleted; their
Live stories and test cases moved to the new test files. 21 lines left `known.json`.

**For builder 2 (PAY-19 on /yx/payroll/arrears):** render `RecoveriesScreen` with
`live={{ orders: { state, rows, canAdd: perms.has('payroll.input.manage'), onAdd: (x) => write('/court-orders', x) },
overpayments: { state, rows, canWriteOff: perms.has('payroll.writeoff.approve'), onWriteOff: (r, reason) =>
write(`/overpayments/${id}/write-off`, { reason }) }, nameOf, onSearch, today, onRetry }}` (types `LiveRecoveriesData`,
`LiveCourtOrder`, `CourtOrderInput` from `@yukthix/ui/pay`; optional `tab: 'court' | 'over'`). Then "pay: RecoveriesScreen"
leaves `notLive`.

**Still in `known.json` from this scope:** "pay: RunReadinessScreen" (PAY-02's own wizard; its content shows inside the
run workspace, see question 1) and "pay: RecoveriesScreen" (until builder 2).

**Guard change:** `design-guard.test.ts` (a) now also counts a story file's `component: X` as rendered, so args-only PAY
stories are seen as designs.

**Questions for the founder (suggested answers):**
1. PAY-02 readiness shows inside the run workspace's Validations tab, not as its own wizard page. Accept that? *Yes*: one page per run.
2. Coverage (PAY-30) inside the run's checks: read `/coverage` on the run page? *Yes*, small.
3. Statutory dues (PF, ESI, TDS, PT) in the home's "Due this month": add a read-only call? *Yes*, size S.
4. Several pay groups: one stage-track row per group on Payroll home? *Yes*, compact rows.
5. Payroll home with the run list under it needs more than 1278 x 635. *Accept the scroll*, the content needs it.
6. Re-pay a failed payment (next bank file / off-cycle / reimbursement account): *yes*, `POST payslips/:id/repay` with route and reason, audited.
7. Record each "Show pay" on the payments page: *yes*, a light audit event.
8. Hold release: required reason and an off-cycle choice in the API: *yes*, size S.
9. Reassign a payslip query to a named colleague: *yes*, a list of people with `payroll.query.handle`.
10. Close a query without a reply: *no*, keep the design rule (reply first).
11. Retry only the failed people in a calculation, and a per-source input summary: *yes*, both S.
12. Reopen requests also in the Approvals inbox: *yes, later* (API change).
