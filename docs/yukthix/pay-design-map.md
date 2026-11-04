# Pay: live pages and their designs (plan)

This is the plan to make every Pay page in the web app render its designed PAY screen with real data, in place of the
separate "Live" copy it renders today. Founder rule: never build a second, simpler version of a designed screen; make
the designed one live. Time was done this way (see `time-design-map.md`); Pay follows the same pattern.

Builder 1 (29 Oct 2026) made the runs, inputs, payments, queries and coverage pages live, and designed and wired periods, reopen requests, audit, documents and payment modes; see "Builder 1 status" at the end. The rest of this paragraph is the plan as written: The guard (`packages/yx-ui/src/design-live-guard.known.json`) lists 38 Pay

Status 29 Oct 2026: builder 3's pages render their PAY designs (section 5b); the others still render copies. The guard (`packages/yx-ui/src/design-live-guard.known.json`) lists 38 Pay
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

| | pages | live | live, gap | wire | wire, gap | feature not built | phone view | ? | sub-pages |
|---|---|---|---|---|---|---|---|---|---|
| A. Runs and payments | 10 | 64 | 0 | 0 | 0 | 0 | 0 | 0 | 64 |
| B. Inputs, loans, recoveries, queries | 8 | 52 | 0 | 0 | 0 | 0 | 2 | 0 | 54 |
| C. Structures and set-up | 6 | 43 | 0 | 0 | 0 | 0 | 0 | 0 | 43 |
| D. Employee pay and tax | 6 | 48 | 0 | 0 | 0 | 1 | 9 | 0 | 58 |
| E. Special pay, earned wage access, actuarial, benefits | 14 | 91 | 0 | 0 | 0 | 6 | 8 | 0 | 105 |
| F. Reports | 1 | 14 | 0 | 0 | 0 | 0 | 0 | 0 | 14 |
| G. Records | 3 | 44 | 0 | 0 | 0 | 0 | 0 | 0 | 44 |
| H. New designs, made live | 5 | 50 | 0 | 0 | 0 | 0 | 0 | 0 | 50 |
| **All** | **53** | **406** | **0** | **0** | **0** | **7** | **19** | **0** | **432** |

HLP-12 answers 92 and 93 (4 Nov 2026, branch `feat/yukthix-hlp-12`): PAY-03 gains 1 story (Inputs tab · special days and
late injury leave to review), designed first and live: Runs 63 → 64, All 405 → 406 live, 432 sub-pages.

Pay followups (2 Nov 2026, branch `feat/yukthix-pay-followups`, founder answers 2, 4 and 7): PAY-32 gets 3 results-sheet
stories, designed first (live); PAY-25 NoAccess and PAY-04 Frozen notes updated. Recounted by the same script: 405 live,
0 live with a gap, 7 not built, 19 phone view, 431 sub-pages. Status in "Pay followups status" at the end.

Pay gaps last (2 Nov 2026, branch `feat/yukthix-pay-gaps-last`): the last 13 `live, gap` rows are live: PAY-18 Submitted,
PAY-21 Document, PAY-22 Overview and NoPan, PAY-23 Line, OwnProof and ResidencyOwn, PAY-27 Recoveries and
Reconciliation, PAY-33 Default, PAY-39 InBand, PAY-41 OldLower, PAY-58 NoAccess; PAY-23 gets 3 new PAN-link stories,
designed first (live). Recounted by the same script (it gives 386 / 13 / 425 on the map before this run): 402 live,
0 live with a gap, 7 not built, 19 phone view, 428 sub-pages. Status in "Pay gaps last status" at the end.

Pay gaps run (2 Nov 2026, branch `feat/yukthix-pay-gaps-run`): the 22 `live (gap)` rows of PAY-02, 03, 04, 05, 09, 10, 11,
12, 19, 25, 29, 30, 32, 35, 37 and 38 are live. Recounted by script: every story row of section 4 (between `## 4.` and
`## 5.`), its verdict cell counted per group heading `### A.` … `### H.`, pages = the `#### PAY-NN` headings under each
group (the script gives exactly the earlier table, 364 / 35 / 7 / 19 / 425, on the map before this run). Status in
"Pay gaps run status" at the end.

Pay last four (30 Oct 2026, branch `feat/yukthix-pay-last`): PAY-23 gets 6 residency stories (5 live, 1 live with a gap), PAY-24 3 new
 state stories (live); D, E and All recounted by hand from those rows.

Reports builder (30 Oct 2026, branch `feat/yukthix-pay-reports`): PAY-25 is live (13 stories made live, 1 state story
added first; No access is live with a gap); F and All recounted from the PAY-25 rows below.

Bonus builder (29 Oct 2026, branch `feat/yukthix-pay-bonus`): PAY-24 is live (4 stories made live, 6 state stories added
first); E and All recounted from the PAY-24 rows below.

Follow-ups builder A (30 Oct 2026, branch `feat/yukthix-pay-followups-a`, founder answers 1-6, 9, 16, 19, 22, 23): B, D, H and
All recounted by hand from the rows changed below (PAY-17 Record, PreClose; PAY-21 Desktop and the new WithdrawQuery
story; PAY-22 Locked, NonResident; PAY-56 LoadError, NoAccess and the new SessionEnded story). Status and API in
"Follow-ups builder A status" at the end.

Counted by script (coordinator, 29 Oct 2026, after builders 1, 2, 3 and round 2 of builders 1 and 2, compliance and bonus were merged into the test
app): every `export const` story in the 53 `pay-NN-*.stories.tsx` files, and the verdict row each story has in section 4
(the script checks one row per story; no story is missing a row). "wire, gap" in C and E = the page renders the design
but this state needs an API first (builder 2's wording); read it as "live, gap". The Kit (9 stories) is not counted.

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
| /yx/payroll/loans, /yx/me/loans (fixed: PAY-17, PAY-18) | `LoansScreen` (live/operations.tsx, deleted) | PAY-17 `LoansScreen` (admin-tax-loans.tsx) |
| /yx/payroll/ewa (fixed: PAY-27) | `EwaAdminScreen` (live/special.tsx, deleted) | PAY-27 `EwaAdminScreen` (admin-tax-loans.tsx) |
| /yx/payroll/actuarial (done, builder 2) | `ActuarialScreen` (live/special.tsx) | PAY-38 `ActuarialScreen` (offcycle.tsx) |
| /yx/payroll/statutory (fixed: CMP-01) | `StatutoryHubScreen` (live/compliance.tsx, deleted) | CMP-01 `StatutoryHubScreen` (ops/compliance.tsx) |
| /yx/payroll/registers (fixed: CMP-03) | `RegistersScreen` (live/operations.tsx, deleted) | CMP-03 `RegistersScreen` (ops/compliance.tsx) |
| /yx/me/pay-documents (fixed: PAY-54) | `MyPayDocumentsScreen` (live/documents.tsx, moved) | its own story "Screens/Pay/Me · Pay documents" (not titled Live, so the guard takes it as a design) |

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


**Founder answers, 30 Oct 2026 ("all OK" to all 30):** loans and tax: (1) loan interest is a company setting per loan
type, not typed by employees; (2) a residential-status change waits for HR approval with the certificate (TRC, Form 10F);
(3) after the regime cut-off, an "ask HR to change my regime" request through Approvals; (4) My pay menu gets "Pay
documents" and "My equity"; (5) expose a loan's repayments for the PAY-17 schedule; (6) payslip days strip from the
attendance feed; (7) Form 12B counts only once approved; (8) equity approvals stay in Approvals; (9) consultant portal
"session ended, sign in again" page. Runs: (10) a released hold goes into the next regular run's bank file; (11)
input-source table also in the run's Validations tab; (12) state-wise PT and LWF due dates in the rule files; (13)
unfiled dues read back three months; (14) retrenchment permission stays in People › Exits; (15) a one-person re-pay
file on the same run is fine; (16) an employee may withdraw their own query. Union dues: (17) one call per union until a
company has more than about 10; (18) no extra stale warning on send. Compliance: (19) menu "Statutory set-up" becomes
"Statutory rules"; (20) per-person register rows later (M); (21) TDS returns stay on the hub; (22) build supplementary
filings (CMP-12) then Missing IDs (CMP-07); (23) payroll may correct a challan amount with an audited reason. Bonus:
(24) eligibility on the full-month salary rate; (25) the 30 days count paid and lay-off days (maternity when its feed
exists); (26) the Rs 100 minimum scales by eligible months; (27) any rate from the supported rate up to 20 %; (28) the
4-year carry stays fixed; (29) leavers' bonus is paid in the off-cycle bonus run; (30) notify the approver on send, and a
Form C register export.


**Founder answers, 30 Oct 2026 (last 10):** (1) bonus eligibility uses the salary on the month's last day by default,
and HR can change the rule per company (a setting: last day, first day, or the highest rate in the month); (2) Form C as
both CSV and a PDF (letterhead, signature boxes) now; (3) Form C lists eligible employees only. Managers above the
Rs 21,000 limit get no statutory bonus; a company's own performance or festival bonus for them is paid through one-time
pay or an incentive plan, not this register; (4) a released hold goes into the next regular run of the same legal
entity; (5) loan interest and limit settings get a screen in Settings > Payroll & Statutory; (6) the preparer never
changes a challan amount; (7) back to resident needs HR approval, no document; (8) early-closure interest stays simple
daily interest; (9) "Correct this month" only on PF and ESI cards; (10) a PAY-23 design story for the residency row
first, then the live row matches it.


**Founder answers, 30 Oct 2026:** (a) PDFs print Indian-language names correctly: Noto fonts (open font licence) bundled
in the app, chosen per script by one shared PDF helper used by every pay PDF (payslips, registers, Form C, Form 16);
(b) HR saving a lowest bonus rate above the highest is refused at save time.

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
| /yx/payroll/loans | `LoansScreen` (live/operations.tsx, hidden copy) | PAY-17 | live (builder 3) | request for someone (person search); pause, pre-close, reschedule; "expense" loan (overdue expense advance, M05); `can.manage` |
| /yx/me/loans | `LoansScreen` with `mine` (hidden copy) | PAY-18 | live (builder 3) | ask for a loan or advance (instalments, interest, first month); what is left to repay; approval goes to the Approvals inbox |
| /yx/payroll/arrears | `ArrearsScreen` (live/compliance.tsx) | PAY-28 `ArrearsBaseScreen` (PAY-19 tabs from builder 1 go in the `recoveryTabs` slot) | live already (builder 2, 29 Oct) | worksheet list; confirm base with as-paid lines and reason; approve into an off-cycle run; cancel; overpayment write-off with reason; `can.approve / writeOff`; maker is not checker (`me`) |
| /yx/payroll/compensation | `CompensationLiveScreen` (live/structures.tsx) | PAY-12 `CompensationScreen` + PAY-42 | live already (builder 2, 29 Oct) | person search; pay in force; preview breakup; submit change with reason (goes for approval); revision letter with signatory; statutory profile (PF, ESI, VPF) with reason; suggest split |
| /yx/payroll/templates | `TemplatesLiveScreen` (live/structures.tsx) | PAY-13 `TemplateBuilderScreen` | live already (builder 2, 29 Oct) | template per legal entity; formula check; validate with a sample breakup and the code-wage flag; new version from a date |
| /yx/payroll/components | `ComponentLibraryLiveScreen` (live/structures.tsx) | PAY-14 `ComponentLibraryScreen` | live already (builder 2, 29 Oct) | add and edit with wage flags; install the starter set (shows how many were added) |
| /yx/payroll/payslip-layout | `PayslipLayoutLiveScreen` (live/setup.tsx) | PAY-15 `PayslipLayoutScreen` | live already (builder 2, 29 Oct) | legal entity picker; save blocks and languages; preview PDF; activate |
| /yx/payroll/setup | `PaySetupScreen` (live/setup.tsx) | PAY-16 `PayrollSetupScreen` (Registrations step) | live already (builder 2, 29 Oct) | legal entity picker; checklist steps that open other pages; registrations; legal options with a valid-from date |
| /yx/payroll/pay-groups | `PayGroupsScreen` (live/setup.tsx) | PAY-16 `PayrollSetupScreen` (Pay group step) | live already (builder 2, 29 Oct) | add and edit groups (day basis, cut-off, pay day, monthly / weekly / fortnightly, anchor date, version); members from a date; calendar per year |
| /yx/payroll/imports | `PayImportsScreen` (live/setup.tsx) | PAY-16 `PayrollSetupScreen` (Opening balances step) | live already (builder 2, 29 Oct) | stage a CSV per kind, commit; go-live check for a month |
| /yx/payroll/coverage | `CoverageLiveScreen` (live/setup.tsx) | PAY-30 | live: PAY-30 (builder 1) | legal entity column; read only |
| /yx/payroll/proofs | `ProofCheckScreen` (live/operations.tsx) | PAY-23 | live (builder 3) | filter pending / approved / part / rejected; open file n of a line; decide with comment |
| /yx/payroll/ewa | `EwaAdminScreen` (live/special.tsx, hidden copy) | PAY-27 | live (builder 3) | legal entity and month; policy editor (share %, least and most a draw, draws a month, closed days, fee and who pays); mark paid with bank reference; mark failed with reason |
| /yx/payroll/special-pay | `SpecialPayScreen` (live/special.tsx) | PAY-50 `SpecialPayHomeScreen`, with PAY-31, 32, 34, 35, 36, 37 as tabs | live already (builder 2, 29 Oct) | legal entity and month; list of postings sent to payroll with status; rate cards; key output and CSV import; plans, results, send a month; tip pools (hours, points, shifts; "paid by customers directly" record only); on-call rules and slots; unions, authorisations, revoke, remittance; wage settlements; **lay-off days and VRS (no design, Q9)** |
| /yx/payroll/actuarial | `ActuarialScreen` (live/special.tsx, hidden copy) | PAY-38 `ActuarialScreen` | live already (builder 2, 29 Oct) | legal entity; census (Ind AS 19 / AS 15) and its download; record a valuation (gratuity or leave) with the report file; post the journal; `can.census / journal` |
| /yx/me/payslips | `MyPayslipsScreen` (live/employee.tsx) | PAY-21 + PAY-40 | live (builder 3) | published payslips; detail with every line explained; PDF; query on a line; "what changed" worked out only from the two payslips' lines; reimbursements section; "Your net pay is on hold" |
| /yx/me/tax | `MyTaxScreen` (live/employee.tsx) | PAY-22 "Overview" + PAY-41 | live (builder 3) | workspace; compare regimes; choose a regime |
| /yx/me/tax-declarations | `MyDeclarationsScreen` (live/operations.tsx) | PAY-22 "Declarations", "Proofs" | live (builder 3) | declare a line; upload a proof; Part A of my certificates (download) |
| /yx/me/earned-pay | `MyEwaScreen` (live/special.tsx) | PAY-26 (desktop stories) | live (builder 3) | draw an amount; tick "I understand … is taken from this month's pay"; my draws. Has no error state today (the design's states fix it) |
| /yx/me/incentives | `MyIncentivesScreen` (live/special.tsx) | PAY-33 | live (builder 3) | results and clawbacks. Has no error state today |
| /yx/performance/pay-band | `MyPayBandScreen` (performance/live/comp.tsx) | PAY-39 | live (builder 3) | loading / error / retry; nothing shown when the company turns bands off |
| /yx/payroll/statutory | `StatutoryHubScreen` (live/compliance.tsx, hidden copy) | CMP-01, CMP-04, CMP-05, CMP-12 (ops area) | live (Compliance builder, see "Compliance") | entity and month; make, upload, file each return (second factor + typed phrase); TDS challan; quarterly TDS return (reconcile, file, .fvu, filed) |
| /yx/payroll/registers | `RegistersScreen` (live/operations.tsx, hidden copy) | CMP-03 | live (Compliance builder, see "Compliance") | make, download, freeze, sign with the company token, inspection pack; `can.generate / sign / download` |
| /yx/payroll/certificates | `TaxCertificatesScreen` (live/operations.tsx) | CMP-06 Form 16 bulk | live (Compliance builder, see "Compliance") | Part A ZIP import or one PDF; issue one or all (with `Confirmation`); tax year |
| /yx/payroll/statutory-rules | `StatutoryRulesScreen` (live/setup.tsx) | CMP-08 "Rules" | live (Compliance builder, see "Compliance") | legal entity; read only |
| /yx/payroll/advisories | `AdvisoriesScreen` (live/operations.tsx) | CMP-08 "Updates" | live (Compliance builder, see "Compliance") | legal entity; mark reviewed with a note |
| /yx/payroll/consultant-tds | `ConsultantTaxScreen` (live/consultants.tsx) | CMP-04 / CMP-05 (for Form 140, 131) | live (Compliance builder, see "Compliance") | challans per section; draft, reconcile, make file, filed (token, `Confirmation`); import Form 131 certificates |
| /yx/payroll/fnf | `FnfCalculator` (people, PPL-22) | PPL-22 | live already | (see Q2 for PAY-11) |
| /yx/people/pay-access | `PayAccessRequests` (frame, PPL-50) | PPL-50 | live already | |
| /yx/time/payroll-feed | `AttendanceReportsScreen` with `live` | TIM-16 | live already | |
| /yx/pay-portal/[org], /yx/verify/[code] | T9 portal sign-in, alumni and nominee tabs, verify page | T9-02, T9-08 | live already | |
| /yx/me/pay-documents | `MyPayDocumentsScreen` (live/documents.tsx) | its own story "Me · Pay documents" | live already (by the guard; Q10) | |
| /yx/payroll/audit, documents, periods, reopen-requests, payment-modes | designed first, then live (builder 1) | PAY-46, PAY-48, PAY-49, PAY-10 "Payment modes" | live | everything the copies did, see section 2 |
| /yx/payroll/go-live | `GoLiveScreen` (deleted) | PAY-16 `PayrollSetupScreen` (Go-live step, new stories) | live already (builder 2, 29 Oct) | readiness; parallel run upload; sign off or waive (the uploader cannot sign off) |
| /yx/payroll/country-packs | `CountryPacksScreen` (copy deleted) | PAY-51 `CountryPacksScreen` (new) | live already (builder 2, 29 Oct) | switch on; UAE EOSB and WPS; US W-9 and 1099-NEC |
| /yx/payroll/consultants, /yx/consultant/[org], /yx/payroll/equity, /yx/me/equity | `ConsultantsScreen`, `ConsultantPortalScreen`, `EquityScreen`, `MyEquityScreen` (consultants.tsx, equity.tsx) | PAY-55, 56, 57, 58 (new, founder decision 3) | live (builder 3) | everything the copies did (section 2 keep-list) |

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
| ~~PAY-24 Bonus computation (4)~~ | Built (bonus builder, 29 Oct 2026): see "Bonus builder status" at the end. | — |
| ~~PAY-25 Payroll reports (13)~~ | Built (reports builder, 30 Oct 2026): see "Reports builder status" at the end. Was: `GET payroll/reports/:kind` with filters and export, read only, behind the pay guard and a new `payroll.report.view` key: salary register, reconciliation, variance, CTC by department, arrears, YTD, bank advice, hold ageing, gratuity provision, loan ledger. The data is already in payslips, holds, loans, journal and actuarial | L |
| PAY-43 Group health (5) | an insurance broker partner (licensed), quotes, disclosure acknowledgement, policy and endorsements, minimum headcount rule; new tables. Blocked on choosing a partner | L |
| PAY-27 "Partner connection" (1) | partner-funded earned wage access (connector P10); today draws are employer-funded only | M |
| PAY-40 "Chat panel" (1) | a chat about one's own payslip (wave 5); nothing in the API | M |
| PAY-18 "Over limit", "Not eligible" (2) | DONE (builder 3, founder decision 8). Was: company settings for loans: most a loan or advance (e.g. months of pay) and who may ask (after probation, months of service); checked in `requestLoan` | S |
| Gaps (10 stories marked "wire design (gap)") | hold ageing (work out in the page, S); "waiting for a new IFSC" payment status (S); retrenchment permission read by the F&F run (S); court order remittances (S); carry-forward list (S); deduction-cap read (S); employee enters Form 12B (M, Q5); regime what-if inputs (S); EWA reconciliation (S) | S to M |
| PAY-19 court orders | API exists (`GET/POST court-orders`) but no live page shows them: the wiring adds them to /yx/payroll/arrears (Q6) | S |

## 4. Design groups, story by story

### A. Runs and payments

#### PAY-01 · Payroll home

Live page: /yx/payroll/runs (founder Q1)

| story (sub-page) | verdict | note |
|---|---|---|
| InReviewBlocked · In review · blocked (payroll admin) | live | "Due this month" shows PF, ESI, TDS, PT dues (GET statutory/home-dues, statutory.filing.view) |
| FinanceApprover · Finance approver | live | as a person with payroll.run.approve |
| ReadyToApprove · Nothing blocking (finance approver) | live |  |
| Approved · Approved · bank file next | live |  |
| Paid · Paid · publish next | live |  |
| Draft · Draft · new month | live |  |
| FirstUse · Empty · payroll not set up | live | no pay group yet: link to /yx/payroll/setup |
| Loading · Loading | live |  |
| ErrorState · Error | live |  |
| SeveralGroups · Several pay groups · one stage row each | live | new story (round 2) |

#### PAY-02 · Run readiness

Live page: /yx/payroll/runs/[id] (Checks step)

| story (sub-page) | verdict | note |
|---|---|---|
| Blocked · Blocking items | live | inside the run workspace (Validations tab) with the input-source table (founder item 11); pay gaps (2 Nov 2026): the attendance mode per group (GET runs/:id/readiness `groups`: people by location and the dated settings attendance.mode / missing_punch_effect, open exceptions, manual LOP entered; Open LOP input), the design table now one kit component `AttendanceGroupsPanel`; only blocking checks can be waived |
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
| Failed · Calculation failed · named fixes | live | "Retry N failed": POST runs/:id/retry-failed (payroll.run.prepare, audited) |
| Variance · Variance tab · acknowledge | live |  |
| Inputs · Inputs tab | live | GET runs/:id/input-sources: people and days or amount per source |
| InputsSpecialDays · Inputs tab · special days and late injury leave to review | live | HLP-12 answers 92, 93 (designed first, `SpecialDaysCard`): GET runs/:id/special-days (RUN_VIEW): per person injury / maternity / suspension days with their source ("Injury leave in Time" or "Entered by payroll"); Edit (payroll.input.manage, run a draft or in review, month not locked; PUT special-days with the run's month, payroll's value then wins; field errors and focus; toast); injury leave approved after an earlier month was locked shows as "to review" with Add to this month (prefilled, still saved by payroll; never applied by itself) or **Not paid** (answer 121: reason of 5+ letters required, audited `payroll.correction.not_paid`; it leaves the list and the fill never raises it again; "Marked not paid" lists it with **Undo** only while the run is open; POST runs/:id/special-days/corrections/:cid/not-paid and /undo-not-paid, payroll.input.manage). The card has a visible "Special days" heading and a one-line note like the other Inputs panels |
| Validations · Validations tab | live |  |
| Approvals · Approvals tab (finance approver) | live |  |
| Files · Files tab · approved | live | pay gaps: bank file, payslips, disbursement register, Journal (lines, ready or posted; Export journal opens the payments page Journal tab) and one row per statutory file of the month (download through the single-use file link) plus Statutory files (open the hub); rows only for payroll.journal.export / statutory.filing.view |
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
| SelfApproval · Sole payroll admin · reason required | live | pay gaps: GET runs/:id `publishAlone`; the publish sheet asks for the reason (self-approval badge); POST runs/:id/publish refuses without it (SELF_APPROVAL_REASON), keeps it in the audit event and tells the System Admins |
| Published · Published · progress finished | live |  |

#### PAY-10 · Payments and files

Live page: /yx/payroll/runs/[id]/payments

| story (sub-page) | verdict | note |
|---|---|---|
| Status · Payment status · failures | live |  |
| Failure · Returned payment · re-pay route | live | POST payslips/:id/repay (route + reason, audited `payroll.payment.repay`); off-cycle is a one-person bank file released by someone else |
| FailedIfsc · Failed payment · waiting for corrected IFSC | live | pay gaps: payment results take a cause (ifsc, account, other); an IFSC failure shows "Waiting for corrected IFSC" (runs/:id/payslips `waitingFor`), bank files skip it and re-pay through the bank is refused (409 WAITING_FOR_IFSC) until a new salary account is on file; the reimbursement account still pays |
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
| Fnf · F&F · 2-working-day deadline | live | /yx/payroll/runs/[id] of an F&F run renders OffCycleRunScreen (live): deadline, settlement lines, then the workspace tabs |
| Retrenchment · F&F retrenchment · blocked without permission | live | pay gaps: the F&F view returns `permission` (needed at the IN.IR threshold, and the request recorded in People › Exits: "authority, granted on …"), shown in the design's "Government permission reference" field; retrenchment lines in the run without a granted permission block approval (not waivable). The reference is the authority and decision date (People has no order number field: question) |
| RetrenchmentOk · F&F retrenchment · permission recorded | live | same as above |
| Death · F&F on death in service · nominee shares | live | nominee shares read from the settlement; edited in People's death in service case |
| Bonus · Bonus run | live | pay gaps: GET payroll/runs/:id/items; a bonus (or any non-F&F) off-cycle run renders the design's lines table (`OffCycleLinesTable`, shared with the story) above the workspace |
| ChooseType · Choose run type (arrears only, correction) | live | /yx/payroll/runs/off-cycle ("Start off-cycle run"); Full and final points to /yx/payroll/fnf |

#### PAY-29 · Weekly and fortnightly runs

Live page: /yx/payroll/runs (weekly and fortnightly groups)

| story (sub-page) | verdict | note |
|---|---|---|
| WeeklyList · Run list · weekly | live | run list under the PAY-01 home on /yx/payroll/runs; no pay date per run in the API |
| FortnightlyList · Run list · fortnightly | live |  |
| WeeklyRun · Weekly run · payslips step | live | pay gaps: GET runs/:id `payGroup`; a weekly or fortnightly run renders the PAY-29 step view (`FrequencyRunSteps`, shared with the story: readiness, payslips with totals, approval, bank file) over the run workspace, which keeps every action. "Days worked" is not in the payslip list (left out) |
| Loading · Loading | live |  |

#### PAY-30 · Coverage monitor

Live page: /yx/payroll/coverage (and inside PAY-02 checks)

| story (sub-page) | verdict | note |
|---|---|---|
| Crossed · Threshold crossed · blocks approval | live | pay gaps: GET payroll/coverage says `crossed` (covered, no registration on or applied for: the rule that blocks approval) with the registration; Switch on / Record applied save through the statutory set-up registrations (payroll.statutory.setup, second step); without the key the row says what is needed |
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
| Frozen · Period frozen · late request only | live | pay gaps: GET payroll/input-periods/:month (stage per entity); a frozen or locked month shows the design's badge and alert, no inline edits, and a Late request drawer (POST payroll/input-corrections: a pay correction for one day, approved by someone else with payroll.correction.approve). Pay followups (founder answer 4): the API refuses LOP for a frozen month too (409 PERIOD_FROZEN) |
| Empty · Empty · no Assumed-present groups | live |  |
| Loading · Loading | live |  |
| ErrorState · Error | live |  |

#### PAY-05 · One-time pay

Live page: /yx/payroll/inputs (One-time pay)

| story (sub-page) | verdict | note |
|---|---|---|
| List · List · filters and bulk actions | live | pay gaps: one-time pay drafts (migration 20261320000100); select rows, "Send N for approval" / "Delete N drafts" (POST one-time-pays/bulk, all or nothing, same limit and approver rule as one item) |
| AddSheet · Add one-time pay · effect summary | live | pay gaps: GET one-time-pays/effect works the month out with the payroll calculator with and without the item: gross, TDS, PF, ESI and net change; Save as draft |
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
| Release · Release sheet · next bank file or off-cycle | live | reason required + route, audited `payroll.hold.released`; "next bank file" pays in the entity's next regular run's bank file, never the held payslip's own run's (founder item 10, 30 Oct 2026): the hold keeps no run until that file claims it (`releasedRunId`), results recorded on that run settle both |
| AddHold · Hold a salary · reason code | live |  |
| AsTab · Tab on One-time pay and holds | live |  |
| Loading · Loading | live |  |
| ErrorState · Error | live |  |

#### PAY-17 · Loans and advances

Live page: /yx/payroll/loans

| story (sub-page) | verdict | note |
|---|---|---|
| List · List · filters | live | status and type filters, search; open loans and the exact amount left in the header |
| Record · Loan record · EMI schedule | live | founder answer 5: GET payroll/loans/:id/repayments; recovered months from the approved payslips, then scheduled from the balance (paused months shown); the company rate on the loan |
| Paused · EMIs paused | live | "paused until" from the API |
| PauseDialog · Pause EMIs with reason | live | POST loans/:id/schedule-changes (pause); also "Change instalment" (reschedule) kept from the copy |
| PreClose · Pre-closure | live | founder answer 5: outstanding, interest to today (days at the loan's rate, from the month after the last recovery) and the total, worked out by the server and kept with the change. Collected outside payroll; "recover in the next run" not built (question) |
| Empty · Empty | live |  |
| Loading · Loading | live |  |
| LoadError · Error · retry | live | and no access ("your payroll admin") |

#### PAY-18 · Loan or salary advance request

Live page: /yx/me/loans

| story (sub-page) | verdict | note |
|---|---|---|
| Advance · Salary advance · schedule preview | live | instalment preview exact for interest-free (rounded up, as the API); with interest an estimate. Founder answer 1: no rate field; the company's rate per loan type (settings `payroll.loan.interest_rate.advance` / `.loan`, default 0) is shown and applied by the server, which refuses a rate sent by the client |
| OverLimit · Personal loan · over limit | live | founder decision 8: GET payroll/loans/rules; the server refuses too |
| NotEligible · Not eligible · new joiner on probation | live | founder decision 8: on probation, the reason and the end day |
| Submitted · Submitted · approval steps | live | pay gaps last: GET payroll/loans gives one's own requests the approvals engine's route (each step's state, who decided and when, or who it waits for; nobody else's loans carry it); a request waiting for approval shows the design's ApprovalTimeline above the loans table (Submitted done by you, then each step) |
| Phone · phone | phone view, mobile app not built |  |
| PhoneSubmitted · phone · submitted | phone view, mobile app not built |  |

#### PAY-19 · Court orders and recoveries

Live page: /yx/payroll/arrears (founder Q6)

| story (sub-page) | verdict | note |
|---|---|---|
| CourtOrders · Court orders | live | tab on /yx/payroll/arrears (RecoveriesScreen in the recoveryTabs slot) |
| OrderPanel · Court order record · remittances | live | pay gaps: court_order_remittances (migration 20261320000200, insert-only); GET/POST court-orders/:id/remittances: each month's deduction and its payment to the court with the reference, once per month |
| CarryForwards · Carry-forwards (negative net) | live | pay gaps: GET payroll/carry-forwards (origin month, recovered, balance); a Carry-forwards tab for payroll.input.manage |
| Overpayments · Overpayments · consent and write-off | live | write-off with reason; "Send reminder" has no API |
| Cap · Deduction cap check · EMI deferred | live | pay gaps: GET payroll/deferrals and payslips/:id/deduction-cap (the calculator returns its wages, cap, protected net and statutory total); the design's `CapPreview` (now shared) for one payslip |
| Loading · Loading | live |  |

#### PAY-20 · Payslip query queue

Live page: /yx/payroll/payslip-queries

| story (sub-page) | verdict | note |
|---|---|---|
| Open · Open queries | live |  |
| Thread · Query drawer · reply in app | live | line, amount and explanation; reassign to a colleague with payroll.query.handle; closing needs a reply (server, 409) |
| InProgress · Query in progress | live |  |
| Empty · Empty | live |  |
| Loading · Loading | live |  |
| ErrorState · Error | live |  |

#### PAY-28 · Arrears base confirmation

Live page: /yx/payroll/arrears (`ArrearsBaseScreen` with `live`, offcycle-live.tsx). The "Recoveries" tab is the slot `live.recoveryTabs` for builder 1's PAY-19 tabs; until they land it shows an interim overpayments table with write-off

| story (sub-page) | verdict | note |
|---|---|---|
| Missing · Month missing · approval blocked | live |  |
| Confirmed · Base confirmed · ready to compute | live | PF/ESI split shows as "Extra company cost" (what the API returns) |
| Computed · Arrears computed · send for approval | live | approve; maker is not checker |
| List · Worksheets · list (the page) | live | new |
| ListOpen · Worksheets · one open, base needed | live | new |
| Empty · Empty · no worksheets | live | new |
| Loading · Loading | live | new |
| ErrorState · Error | live | new |
| NoAccess · No access | live | new |

### C. Structures and set-up

#### PAY-12 · Compensation and revision

Live page: /yx/payroll/compensation (builder 2: `CompensationScreen` with `live`, comp-setup-live.tsx)

| story (sub-page) | verdict | note |
|---|---|---|
| Tab · Compensation tab · breakup and history | live | history: GET employees/:id/compensation-history (round 2): salaries and waiting or turned-down requests, who asked and approved |
| Revision · Revision sheet · effect summary | live | POST compensations/preview, then employees/:id/compensation-changes (for approval); revision letter with signatory |
| Arrears · Back-dated revision · arrears preview | live | pay gaps: compensations/preview returns `arrears` (months already paid, gross difference, first month prorated); the design's table (`ArrearsPreviewTable`, shared) in the revision sheet; the arrears worksheet works the exact lines out once approved |
| Hourly · Pay basis · hourly rate (placement) | live | pay gaps: the gap note was out of date: the API already took payBasis (monthly, hourly, daily) and rate. The revision sheet now has "Paid by" and the rate; the tab shows the basis and rate |
| HrPersona · HR view | live | Revise only with employee.salary.manage + employee.change.manage; payroll keeps the statutory profile tab |
| Loading · Loading | live |  |
| ErrorState · Error | live | retry |

#### PAY-13 · Template builder

Live page: /yx/payroll/templates (`TemplateBuilderScreen` with `live`)

| story (sub-page) | verdict | note |
|---|---|---|
| Default · Formula editor · live test employee | live | test employee = sample CTC, state and age (no named-person pick) |
| Autocomplete · Autocomplete open | live | POST formulas/check on leaving the field |
| Cycle · Validation error · circular formula | live | POST templates/validate |
| AddBack · Code wage add-back flagged | live |  |
| Published · Published new version | live | new version from a date; "compare with version N" not shown: the API returns no version lines |

#### PAY-14 · Component library

Live page: /yx/payroll/components (`ComponentLibraryScreen` with `live`)

| story (sub-page) | verdict | note |
|---|---|---|
| List · Grouped by type · flag columns | live | starter set shows how many were added |
| Edit · Edit component flags | live | "used in N templates" shows "on payslips since …" (the API gives usedAt only) |
| Statutory · Statutory component · locked | live |  |
| Loading · Loading | live |  |
| ErrorState · Error | live |  |

#### PAY-15 · Payslip layout editor

Live page: /yx/payroll/payslip-layout (`PayslipLayoutScreen` with `live`)

| story (sub-page) | verdict | note |
|---|---|---|
| Draft · Draft · sample-employee preview | live | save, Preview PDF (real layout), publish; the on-screen preview uses sample figures. Discard draft, logo and PDF password: no API |
| Bilingual · Second language on | live | hi, ta, te, kn |
| Published · Published version | live |  |

#### PAY-16 · Payroll set-up wizard

Live page: /yx/payroll/setup, /pay-groups, /imports, /go-live (`PayrollSetupScreen` with `live`; each route opens its step; setup-live.tsx)

| story (sub-page) | verdict | note |
|---|---|---|
| Registrations · Registrations · completeness check failing | live |  |
| RegistrationsComplete · Registrations complete | live |  |
| PayGroup · Pay group and cut-off | live | /yx/payroll/pay-groups |
| Opening · Opening balances · as-paid import | live | /yx/payroll/imports. The bank format and accounting mapping steps stay sample: no debit-account API, ledger mappings not wired |
| Review · Review | live | "Switch payroll on" has no API: go-live readiness stands in |
| GoLiveCompare · Go-live · parallel run compared, differences to sign off | live | new (founder decision 3); /yx/payroll/go-live |
| GoLiveSignOffDialog · Go-live · sign off with differences (dialog open) | live | new; the uploader cannot sign off |
| GoLiveWaiveDialog · Go-live · waive the parallel run (dialog open) | live | new |
| GoLiveSignedOff · Go-live · signed off, ready | live | new |
| GoLiveWaived · Go-live · waived | live | new |
| GoLiveEmpty · Go-live · no comparison yet | live | new |
| LegalOptions · Registrations · legal options | live | new; option with a valid-from date |
| PayGroups · Pay groups · list | live | new |
| PayGroupAdd · Pay groups · add a group (drawer open) | live | new |
| PayGroupMembers · Pay groups · members and calendar | live | new |
| OpeningChecked · Opening balances · rows checked, ready to commit | live | new |
| OpeningRowErrors · Opening balances · a row has a problem | live | new |
| Loading · Loading | live | new |
| ErrorState · Error | live | new |
| NoAccess · No access | live | new |

#### PAY-42 · Suggest split

Live page: /yx/payroll/compensation (Suggest split)

| story (sub-page) | verdict | note |
|---|---|---|
| Options · Options side by side · one not offered | live |  |
| Stale · Stale after a law change | live | POST compensations/suggest/check before Use (round 2): a rule for India or the work state published after the options were made; Refresh |
| Chosen · Option chosen (HR) | live |  |

### D. Employee pay and tax

#### PAY-21 · Payslip viewer

Live page: /yx/me/payslips

| story (sub-page) | verdict | note |
|---|---|---|
| Desktop · Net first · why this number | live | net first, lines explained, reimbursements, year to date from the payslips. Founder answer 6: the days strip from GET payroll/payslips/:id `days` (attendance days and approved leave, as the feed counts them; the frozen feed's paid / unpaid totals); none for off-cycle |
| RaiseQuery · Raise a query on a line | live |  |
| QuerySent · Query sent | live | a 5-second toast (house rule) instead of the inline alert |
| WithdrawQuery · Your query · withdraw | live | new story (founder answer 16): the person's own queries on the payslip; Withdraw asks first, closes it with no reply needed (PATCH payroll/queries/:id status closed; the server already allowed it), 5-second toast |
| Document · Payslip PDF | live | pay gaps last: Download PDF opens the design's 'Payslip PDF' drawer; the same signed-in PDF as a same-origin object URL drawn by the kit's PdfPages (PDF.js, no plug-in or frame); the drawer's Download PDF downloads with the toast; the URL is revoked on close; a fetch failure says so |
| Held · Salary on hold | live |  |
| NotPublished · Empty · not published yet | live | "No payslips yet" |
| Loading · Loading | live |  |
| ErrorState · Error | live |  |
| Phone · phone | phone view, mobile app not built |  |
| PhoneQuery · phone · raise a query | phone view, mobile app not built |  |

#### PAY-22 · Tax workspace

Live page: /yx/me/tax and /yx/me/tax-declarations (founder Q5)

| story (sub-page) | verdict | note |
|---|---|---|
| Overview · Overview · TDS explanation | live | from GET tax/me/tax-sheet. Pay gaps last: the sheet now returns `months` (12, from April): what the approved payslips of each month deducted, then the monthly TDS over the months it is spread across; the design's 'Tax deducted by month' chart under the working |
| Declarations · Declarations · choose regime | live | regime as a Segment; rent is a monthly amount, as the API takes it |
| Locked · Regime locked after cut-off | live | founder answer 3: "Ask HR to change regime" with a reason (POST tax/me/regime-request) goes to Approvals (tax.regime.override, never the person); pending and turned-down states; approved changes the regime (audited) |
| Proofs · Proofs · old-regime variant, rejected line | live |  |
| Previous · Previous employer (Form 12B) | live | founder decision 6: GET/POST tax/me/form12b; counts in tax once payroll approves it; other income through the workspace |
| NonResident · Residential status · non-resident | live | founder answer 2: sent with the TRC (PDF), its last day and Form 10F filed (POST tax/me/residency); waits for payroll in the proof queue (PAY-23, tax.proof.verify, never one's own); pending and rejected states; the workspace changes only on approval |
| NoPan · PAN inoperative warning | live | pay gaps last: How to link PAN opens the design's sheet (portal steps, the confirmation upload; Send to payroll refused with a field error until a file is attached; toast). POST tax/me/pan-link through the shared file pipeline (PDF/PNG/JPEG, 5 MB, virus scan), only while the PAN is recorded inoperative; checked in PAY-23 (tax.proof.verify, never one's own); approved, the PAN is operative again. Waiting / refused (with the reason, send again) shown. The design's helper 'This also updates your PAN in Me › Documents' is left out (not true; question) |
| Loading · Loading | live |  |
| ErrorState · Error | live |  |
| Phone · phone | phone view, mobile app not built |  |
| PhoneDeclarations · phone · declarations | phone view, mobile app not built |  |
| PhoneProofs · phone · proofs (old-regime variant) | phone view, mobile app not built |  |

#### PAY-23 · Proof verification queue

Live page: /yx/payroll/proofs

| story (sub-page) | verdict | note |
|---|---|---|
| Queue · Waiting lines | live | with the Form 12B rows (founder decision 6) |
| Line · Line with document · approve | live | pay gaps last: the decision drawer shows the file in the kit's DocumentViewer (images and PDFs; a Segment between several files); a same-origin object URL typed as PDF or image only (other files download-only), revoked on change or close; Download still uses the audited file route |
| Partial · Approve part with comment | live |  |
| Reject · Reject with comment | live |  |
| OwnProof · Own proof · cannot verify | live | pay gaps last: a deep link /yx/payroll/proofs?line=<own line id> opens one's own line read only with the design's 'This is your own proof' warning and nothing to decide (the page reads it from tax/me/*; the queue still never lists it and the server still refuses it) |
| Empty · Empty · nothing submitted | live |  |
| Loading · Loading | live |  |
| ResidencyQueue · Residency · in the queue (TRC and back to resident) | live | founder last 10, item 10: designed first; the row says the change, then the TRC (valid until, treaty country) or "no document needed"; Declared shows "Certificate sent" / "No document" |
| ResidencyPendingTrc · Residency · to non-resident with a TRC · decide | live | its own drawer (description list, not the Form 12B layout): change, sent, certificate button, valid until, treaty country, Form 10F; Approve / Refuse (Segment); a refusal needs the reason (error and focus) |
| ResidencyBackToResident · Residency · back to resident · no document | live | founder last 10, item 7: "None needed: going back to resident only needs your approval." |
| ResidencyApproved · Residency · approved | live | read only, with the day decided |
| ResidencyRefused · Residency · refused with a reason | live | the row shows "Refused: <reason>"; status label "Refused" |
| ResidencyOwn · Residency · deciding your own · refused | live | pay gaps last: a deep link ?residency=<own request id> opens one's own request in its decision drawer; deciding it shows the server's refusal ('Someone else checks your own residential status.') in the designed notice; the server rule is unchanged |
| PanLinkQueue · PAN link · in the queue | live | pay gaps last, new story (PAY-22 NoPan is checked here): 'PAN linked with Aadhaar', 'Portal confirmation · tax year', 'Confirmation sent'; from GET tax/pan-links |
| PanLinkDecide · PAN link · confirmation · decide | live | new story: its drawer with the file in the document viewer; Approve / Refuse (Segment); a refusal needs the reason (error and focus); approving makes the PAN operative (toast) |
| PanLinkRefused · PAN link · refused with a reason | live | new story: read only with the reason; the row says 'Refused: <reason>' |

#### PAY-39 · My pay band

Live page: /yx/performance/pay-band

| story (sub-page) | verdict | note |
|---|---|---|
| InBand · Within band | live | pay gaps last: GET me/pay-band (the signed-in person only) also returns their own annual CTC; the design's RangeMarker, the annual CTC and 'Compared with midpoint' |
| Above · Above band maximum | live |  |
| Off · Visibility off | live |  |
| Phone · phone | phone view, mobile app not built |  |
| Loading · Loading | live |  |
| ErrorState · Error | live |  |

#### PAY-40 · Why is my pay different

Live page: /yx/me/payslips (pay change panel)

| story (sub-page) | verdict | note |
|---|---|---|
| Explained · Every change explained | live | worked out only from the two payslips' lines, in paise |
| NotExplained · Not explained row · raise payslip query | live | a line with no explanation offers the query |
| Chat · Chat panel (wave 5, own payslip only) | design only, feature not built | chat about one's payslip (wave 5): nothing in the API |
| Same · No change from last month | live |  |
| Phone · phone | phone view, mobile app not built |  |
| PhoneUnexplained · phone · not explained | phone view, mobile app not built |  |

#### PAY-41 · Compare tax regimes

Live page: /yx/me/tax (Compare regimes)

| story (sub-page) | verdict | note |
|---|---|---|
| NewLower · New regime lower | live | POST tax/me/regime-compare, inside the workspace |
| OldLower · What-if · old regime lower (rent and home loan) | live | pay gaps last: POST tax/me/regime-compare takes an optional monthly rent and the year's home loan interest (validated); they replace the declared ones in that calculation only, through the real tax engine; nothing saved. The design's two sliders start at the declared figures (interest up to the rule's limit, returned by the API); each change is worked out again |
| NonResident · Non-resident · no rebate | live |  |
| InWorkspace · Inside the tax workspace | live |  |
| Phone · phone | phone view, mobile app not built |  |
| Loading · Loading | live |  |
| ErrorState · Error | live |  |

### E. Special pay, earned wage access, actuarial, benefits

#### PAY-24 · Bonus computation

Live page: /yx/payroll/bonus

| story (sub-page) | verdict | note |
|---|---|---|
| Minimum · Compute at 8.33% | live |  |
| Higher · Compute at 20% | live |  |
| Surplus · Allocable surplus step | live |  |
| Approve · Approve and pay | live |  |
| Empty · Empty · not worked out yet | live | new state story |
| TooEarly · Send for approval · pressed too early (field error) | live | new state story |
| Refused · Approve · refused by the server (own bonus) | live | new state story |
| Approved · Form C register ready to download | live | new state story (item 30); founder last 10, item 2: "Download Form C" opens PDF or Spreadsheet (CSV), once approved or sent |
| FormCChoices · Approved · Download Form C: PDF or spreadsheet | live | new state story (last 10, item 2): the menu open; each choice downloads with a 5 s toast; every download audited with its format |
| RateRuleHighest · Compute · eligibility on the highest rate in the month | live | new state story (last 10, item 1): the note above the table names the company's rule |
| RateRuleFirstDay · Compute · eligibility on the month's first day | live | new state story (last 10, item 1) |
| Sent · Sent to the off-cycle bonus run | live | new state story |
| Loading · Loading | live | new state story |
| ErrorState · Error | live | new state story |

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
| Desktop · Desktop | live | with the error state the copy lacked |
| DesktopConfirm · Desktop · confirm | live | the exact amount taken back (draw + fee when the person pays it) |
| Off · Off for pay group | live | the API's reasons |

#### PAY-27 · EWA admin

Live page: /yx/payroll/ewa

| story (sub-page) | verdict | note |
|---|---|---|
| Draws · Draws this period | live | legal entity and month; record payment with bank reference, or failed with reason |
| Policy · Policy editor (Settings) | live | from a date; on/off and fee payer as Segments |
| Partner · Partner connection | design only, feature not built | partner-funded draws not wired (DECISION NEEDED in ewa.service.ts) |
| NoPartner · Partner not connected | live | the true state today |
| Recoveries · Recoveries in payroll | live | pay gaps last: GET payroll/ewa/recoveries (payroll.ewa.manage): the last six months, each paid draw matched to its recovery (recovered on an approved regular payslip; deferred = the part the payslip's negative net carried forward; to F&F = taken by the leaver's settlement, which now takes back any draw no approved payslip recovered); the design's table |
| Reconciliation · Reconciliation (finance approver) | live | pay gaps last: GET payroll/ewa/reconciliation (payroll.ewa.manage or payroll.run.approve): the month's draws matched to their payslip deductions; the design's figures with the difference explained (no partner, so paid by the company, not remitted). A finance approver opens the page on Reconciliation only, with the entities they reach |
| Loading · Loading | live |  |

#### PAY-31 · Piece-rate cards and output

Live page: /yx/payroll/special-pay, tab Piece rates (`PieceRateScreen` with `live`)

| story (sub-page) | verdict | note |
|---|---|---|
| Check · Earnings check · minimum-wage top-up | live | GET special/piece/check (round 2): the top-up read before the month is sent |
| Cards · Rate cards | live |  |
| Output · Output this period | live |  |
| Import · Output import · validation preview | live | CSV import |
| Loading · Loading | live |  |
| ErrorState · Error | live |  |

#### PAY-32 · Incentive plan builder

Live page: /yx/payroll/special-pay, tab Incentives (`IncentivePlanScreen` with `live`)

| story (sub-page) | verdict | note |
|---|---|---|
| Draft · Draft · tiers, accelerator, cap, clawback | live | pay gaps (migration 20261320000500): effective dates, payout frequency, metric source, department / location, drafts (Save draft, Edit draft, Publish) and versions (New version from a later date ends the earlier one); results refused on a draft, outside the dates, outside a quarter-end month for a quarterly plan, or for someone outside its group |
| Overlap · Validation error · overlapping tiers | live |  |
| Published · Published | live | results, send a month, send clawbacks |
| Loading · Loading | live |  |
| ErrorState · Error | live |  |
| ResultsHeld · Results sheet · a held row | live | pay followups, new story designed first (founder answer 7): each published plan's Results opens the month's results (GET special/plans/:id/results) with the part held until the customer pays and its reason; Add a result takes an optional held part (at most the incentive, a reason when held) |
| ReleaseConfirm · Results sheet · release the held part (asks first) | live | new story: Release asks, then POST special/plans/:id/results/:resultId/release for the page's month; toast; a payroll approver approves it |
| ReleaseRefused · Results sheet · release refused | live | new story: the server's refusal (for example "Send the month's results to payroll first...", "already released") stays in the sheet's notice |

#### PAY-33 · My incentive statement

Live page: /yx/me/incentives

| story (sub-page) | verdict | note |
|---|---|---|
| Default · Earned, paid, held | live | pay gaps last: results keep the part held until the customer pays (with its reason; payroll releases it later as its own approved posting); GET me/incentives adds the financial-year quarter, payout frequency and tier reached. The design's latest-quarter summary (quota, achieved, tier, earned, held, sent to payroll, being checked, clawback) and the statement by month with quarter totals. Payroll's results sheet has no held column yet (question) |
| Clawback · With a clawback | live |  |
| Empty · Empty · not on a plan | live |  |
| Phone · phone | phone view, mobile app not built |  |
| PhoneClawback · phone · clawback | phone view, mobile app not built |  |

#### PAY-34 · Tips pool

Live page: /yx/payroll/special-pay, tab Tips (`TipsPoolScreen` with `live`)

| story (sub-page) | verdict | note |
|---|---|---|
| Pools · Pools by outlet and period | live | "paid by customers directly" is record only; "collecting" pools and a card/UPI vs cash split are not in the API |
| Points · Pool · split by points | live |  |
| Hours · Pool · split by hours | live |  |
| Empty · Empty | live |  |
| Loading · Loading | live |  |
| ErrorState · Error | live |  |

#### PAY-35 · On-call and standby rules

Live page: /yx/payroll/special-pay, tab On-call (`OnCallRulesScreen` with `live`)

| story (sub-page) | verdict | note |
|---|---|---|
| Weekday · Rules · weekday worked example | live | rules and slots |
| Holiday · Holiday multiplier example | live | pay gaps (migration 20261320000300): public-holiday multiplier, "pay standby when called out", "count towards the weekly hours limit" per rule; a slot can be a public holiday; the worked example has Normal day / Public holiday. The Time roster check does not yet read call-out hours (question) |
| Empty · Empty · no slot types in the roster | live |  |
| Loading · Loading | live |  |
| ErrorState · Error | live |  |

#### PAY-36 · Union check-off

Live page: /yx/payroll/special-pay, tab Unions (`UnionCheckoffScreen` with `live`)

| story (sub-page) | verdict | note |
|---|---|---|
| Authorisations · Authorisations | live | withdraw is now wired (the API had it); uploading the signed form has no API |
| Deductions · Monthly deduction list | live | send dues |
| Remittance · Remittance per union | live | statement and "Mark remitted" (round 2: POST special/unions/:id/remittance, amount from the approved check-off, once, audited) |
| Loading · Loading | live |  |
| ErrorState · Error | live |  |

#### PAY-37 · Wage-settlement arrears

Live page: /yx/payroll/special-pay, tab Settlements (`SettlementArrearsScreen` with `live`, settlement-live.tsx)

| story (sub-page) | verdict | note |
|---|---|---|
| Categories · Categories and arrears | live | pay gaps: GET special/settlements/:id/preview?month: workers and arrears per category (the posting uses the same helper) |
| Settlement · Settlement terms | live | send the arrears; "New settlement" drawer (round 2) |
| Worksheet · Arrears worksheet | live | pay gaps: Affected employees step (worker, category, from, months, arrears) and the Arrears worksheet step with the PAY-28 worksheet lines (`WorksheetLinesTable`, shared with the arrears worksheet) |
| Empty · Empty · no settlement yet | live | new (round 2); offers New settlement |
| NewSettlement · New settlement · drawer open | live | new (founder answer 4); POST special/settlements |
| NewSettlementFilled · New settlement · filled in | live | new |
| NewSettlementTooEarly · New settlement · pressed too early (field errors) | live | new; first bad field takes focus; each category once |
| NewSettlementRefused · New settlement · refused by the server | live | new; the refusal stays in the drawer |

#### PAY-38 · Actuarial census and valuation

Live page: /yx/payroll/actuarial (`ActuarialScreen` with `live`, offcycle-live.tsx)

| story (sub-page) | verdict | note |
|---|---|---|
| Census · Census versions | live | Ind AS 19 / AS 15, download |
| Upload · Valuation upload · figures to enter | live | pay gaps (migration 20261320000400): service cost, interest cost, benefits paid, actuarial loss and gain (all or none; they must reach the closing obligation from the opening one, checked by the API and the database); the design's figures table works the closing out |
| Uploaded · Valuation uploaded | live |  |
| Posting · Provision posting | live | someone else posts it |
| JournalPreview · Provision posting · journal preview | live |  |
| Posted · Journal posted | live | no "Reverse posting" or "Remind actuary" in the API |
| Loading · Loading | live | new |
| ErrorState · Error | live | new |
| NoAccess · No access | live | new |

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
| Ready · Sent to payroll · special pay types | live | entity and month; sheets sent to payroll with status and lines; one status per sheet (no approver reason shown) |
| LayOff · Lay-off days · drawer open | live | lay-off days per entity; send lay-off pay |
| Vrs · Pay VRS · exemption worked out | live | Rs 5,00,000 lifetime exemption (s. 10(10C)) |
| Empty · Empty · nothing sent this month | live |  |
| Loading · Loading | live |  |
| ErrorState · Error | live |  |
| NoAccess · No access | live |  |

#### PAY-51 · Country packs

Live page: /yx/payroll/country-packs (`CountryPacksScreen`, country-packs.tsx). New group (founder decision 3)

| story (sub-page) | verdict | note |
|---|---|---|
| Off · UAE · not switched on | live |  |
| SwitchOn · UAE · switch on (dialog) | live | each setting is checked against its pattern from the pack |
| UaeOn · UAE · provision and WPS file | live | the provision shows the total and head count only (its rows carry ids, no names) |
| UaeWps · UAE · record WPS ids (drawer) | live |  |
| UsOn · US · 1099-NEC and W-9 | live | file and recipient copy |
| UsW9 · US · record a W-9 (drawer) | live |  |
| India · India entity · nothing to switch on | live |  |
| Empty · Empty · no entity chosen | live |  |
| Loading · Loading | live |  |
| ErrorState · Error | live |  |
| NoAccess · No access | live |  |

### F. Reports

#### PAY-25 · Payroll reports

Live page: /yx/payroll/reports

| story (sub-page) | verdict | note |
|---|---|---|
| Register · Salary register | live | one column per pay component (the design's combined "PF, ESI, PT" column is one column each) |
| Reconciliation · Reconciliation (finance approver) | live | Finance Approver holds the key |
| Variance · Variance · chart and table | live | the limit is the company setting `payroll.variance_threshold_pct` |
| Ctc · CTC by department | live |  |
| Arrears · Arrears | live |  |
| Ytd · Year to date | live |  |
| BankAdvice · Bank advice | live |  |
| HoldAgeing · Hold ageing | live |  |
| Gratuity · Gratuity provision | live | "Provision to date" is the sum of the payslips' gratuity lines (not an actuarial liability) |
| LoanLedger · Loan ledger | live |  |
| Empty · Empty · no data for filters | live |  |
| Loading · Loading | live |  |
| ErrorState · Error · the report did not load | live | new state story |
| NoAccess · No access (HR without payroll scope) | live | pay gaps: "Request access" (POST payroll/reports/access-request) through the approvals engine to the people who grant roles (access.role.manage; the System Admins when nobody holds it); the page says when it was sent, approved or turned down. Pay followups (founder answer 2): the request names a legal entity (the person's own when left out); approving gives a read-only "Payroll reports (read only, on request)" role grant for that entity at once, for the company's days (setting payroll.reports_access.days, default 90), ending by itself, in Roles & access with its last day, audited; the page says until when, or that it ended (ask again) |

The design's "Schedule" button and dialog stay in the stories only: scheduled reports are not built.

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

### H. New designs, made live (builder 3, founder decisions 3 and 12)

#### PAY-54 · My pay documents

Live page: /yx/me/pay-documents (and the nominee drawer on /yx/payroll/documents)

| story (sub-page) | verdict | note |
|---|---|---|
| Documents · Current and superseded | live | founder decision 12: the accepted story, now a design in My pay |
| Purged · One deleted after its retention period | live | |
| DownloadFailed · Download refused | live | |
| Empty · Empty · none yet | live | |
| Loading · Loading | live | |
| LoadError · Error · retry | live | |
| NoAccess · No access | live | |
| Nominee · Add a nominee (HR) | live | /yx/payroll/documents, payroll.document.issue and the second factor |

#### PAY-55 · Consultants

Live page: /yx/payroll/consultants

| story (sub-page) | verdict | note |
|---|---|---|
| Invoices · Invoices · TDS and what to pay | live | |
| Register · Register · PAN and bank check | live | |
| BankFiles · Bank files · made by one, released by another | live | |
| AddConsultant · Add consultant | live | |
| BankCheck · Record bank check | live | never by whoever changed the account |
| Certificate197 · Lower deduction certificate (s.197) | live | |
| EnterInvoice · Enter an invoice | live | |
| MakeBankFile · Make bank file | live | |
| Release · Release bank file · typed phrase | live | the maker never sees Release |
| Results · Record bank results | live | |
| ViewOnly · Release only (no consultant key) | live | |
| Empty · Empty | live | |
| Loading · Loading | live | |
| LoadError · Error · retry | live | |
| NoAccess · No access | live | |

#### PAY-56 · Consultant portal

Live page: /yx/consultant/[org] (sign-in stays the designed T9 one)

| story (sub-page) | verdict | note |
|---|---|---|
| Invoices · Your invoices · advices and certificates | live | |
| Upload · Send an invoice | live | |
| UploadClosed · Sign in again to send | live | |
| NoPan · No working PAN | live | |
| Empty · Empty | live | |
| Loading · Loading | live | |
| LoadError · Error · retry | live | founder answer 9: a failed load after sign-in shows the error with Retry |
| NoAccess · No access | live | a 403 on the load shows no access |
| SessionEnded · Session ended · sign in again | live | new story (founder answer 9): any call answered 401 part-way shows "Your session ended" with Sign in again |

#### PAY-57 · Equity

Live page: /yx/payroll/equity

| story (sub-page) | verdict | note |
|---|---|---|
| Grants · Grants · vesting and exercises | live | grant and exercise approval is in Approvals |
| Plans · Plans · pools and cap table | live | |
| Valuations · Valuations | live | |
| AddPlan · Add a plan | live | |
| AddValuation · Add a valuation | live | |
| MakeGrant · Make a grant | live | units within the pool left |
| ConfirmVesting · Confirm milestone vesting | live | |
| PriceReceived · Exercise price received | live | |
| Empty · Empty | live | |
| Loading · Loading | live | |
| LoadError · Error · retry | live | |
| NoAccess · No access | live | |

#### PAY-58 · My equity

Live page: /yx/me/equity

| story (sub-page) | verdict | note |
|---|---|---|
| Grants · My grants · vesting | live | |
| Exercise · Exercise units | live | the exact price payable |
| Empty · Empty | live | |
| Loading · Loading | live | |
| LoadError · Error · retry | live | |
| NoAccess · No access | live | pay gaps last: GET/POST payroll/me/equity need payroll.equity.own (migration 20261370000000 gives it to every base role, company role and override; every template carries it); a role without it gets 403 and the designed No access |

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

## 5b. Builder 3 status (employee pay, tax, loans, EWA; branch `feat/yukthix-pay-employee`, 29 Oct 2026)

**Live now (the designed screen with `live`):** /yx/me/payslips (PAY-21 + 40), /yx/me/tax and /yx/me/tax-declarations
(PAY-22 + 41, one workspace opened on Overview or Declarations), /yx/me/loans (PAY-18), /yx/payroll/loans (PAY-17),
/yx/payroll/proofs (PAY-23), /yx/me/earned-pay (PAY-26 desktop), /yx/payroll/ewa (PAY-27), /yx/me/incentives (PAY-33),
/yx/performance/pay-band (PAY-39), /yx/me/pay-documents (PAY-54, founder decision 12), and the new designs PAY-55 … 58
(consultants, consultant portal, equity, my equity; founder decision 3). Copies deleted: `MyPayslipsScreen`,
`MyTaxScreen` (live/employee.tsx), `LoansScreen`, `ProofCheckScreen`, `MyDeclarationsScreen`, `NomineeDrawer`
(live/operations.tsx), `EwaAdminScreen`, `MyEwaScreen`, `MyIncentivesScreen`, `EquityScreen`, `MyEquityScreen`
(live/special.tsx), `ConsultantsScreen`, `ConsultantPortalScreen` (live/consultants.tsx), `MyPayDocumentsScreen`
(live/documents.tsx), `MyPayBandScreen` (performance/live/comp.tsx), with their Live stories; their tests moved to
`employee-pay.test.tsx`, `admin-tax-loans.test.tsx`, `consultants.test.tsx`, `equity.test.tsx`.

**Rules built**

| rule | source | setting · default |
|---|---|---|
| A loan or advance is at most N months of gross pay (earning, non-statutory lines in force today), less what is still to repay on open loans (requested, active, paused) in every legal entity | company (founder decision 8) | `payroll.loan.max_gross_months` · 2 (none, 1, 2, 3, 4, 6, 12); tenant or legal entity |
| Only people past probation may ask (status in force today, IST) | company (founder decision 8) | `payroll.loan.after_probation` · confirmed (or everyone) |
| Both rules apply when payroll asks on someone's behalf; no pay set + a limit = refused | product | — |
| Form 12B: the employee sends previous employer income with the signed PDF until the proof cut-off; it counts in TDS only once payroll approves it; approved = read-only for the employee; reject needs a comment; never one's own | product (founder decision 6) | proof cut-off: `tax.proof_cutoff` (existing) |
| Rent (HRA) is declared as a monthly amount with its months and city (the API works out the year; the old copy called it "for the year") | API | — |
| Money on these pages is formatted from the API's decimal strings and added up in paise (no floating point) | product | — |

**API (builder 3):** `GET /payroll/loans/rules` (self); `POST /payroll/loans` now enforces both rules (403 probation,
400 no pay, 400 over the limit, plain-English reason); `GET/POST /tax/me/form12b` (self); `GET /tax/form12b`,
`GET /tax/form12b/:id/file`, `POST /tax/form12b/:id/decision` (all `tax.proof.verify`, entity scope, never one's own).
**Migration:** `20261307000000_pay_form12b` (table `form12b_submissions`, forced RLS, tenant + support + pay guard
policies, self-verify trigger); proved on a fresh database from zero plus `migrate status`.

**Gaps (states the live page cannot reach yet; reasons in section 4):** PAY-18 approval timeline; PAY-21 PDF preview;
PAY-22 tax-by-month chart, PAN link upload; PAY-23 in-page document viewer, own-proof state (never listed); PAY-27
deferred / F&F recoveries and reconciliation; PAY-33 quarter and tier breakdown; PAY-39 own-CTC marker; PAY-41 what-if
inputs; PAY-58 no-access. (Closed 30 Oct by follow-ups builder A: PAY-17 schedule and pre-close interest, PAY-21 days
strip, PAY-22 "ask HR to change regime" and TRC / Form 10F / HR review, PAY-56 error and no-access.)

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

## Builder 1, round 2 (branch `feat/yukthix-pay-runs-2`, 29 Oct 2026)

**PAY-11 live:** "Start off-cycle run" opens `/yx/payroll/runs/off-cycle` (ChooseType); an off-cycle run's page
(`runType === 'offcycle'`) renders `OffCycleRunScreen` with `live` (PAY-11 header and settlement lines, then the run
workspace tabs). Change in builder 2's `offcycle.tsx`: one import of `LiveOffCycleRunScreen` from
`offcycle-run-live.tsx`; `OffCycleRunScreen` takes `live?`; the old body is renamed `SampleOffCycleRun`.

**Server additions (no migrations):**

| route | permission | audit |
|---|---|---|
| GET statutory/home-dues?month&legalEntityId | statutory.filing.view, in scope; another company gets nothing; 403 when acting for someone | read only |
| POST payslips/:id/repay { route, reason, debitAccount? } | payroll.payment.record (+ payroll.bankfile.generate to pay now); failed or returned only; a repeat is 409 | `payroll.payment.repay` |
| POST runs/:id/pay-views | anyone who may read the run's pay | `payroll.pay.shown` |
| GET queries/:id/handlers; PATCH queries/:id { assigneeId } | payroll.query.handle; never the asker | audited with the query |
| PATCH queries/:id (close) | payroll closes only after a payroll reply (409 "Reply to the employee before closing the query.") | |
| POST runs/:id/retry-failed | payroll.run.prepare; a draft run with failures; 409 while calculating | `payroll.run.retry_failed` |
| GET runs/:id/input-sources | run read, in scope | read only |
| POST holds/:id/release { reason, route } | payroll.hold.manage; never one's own hold | `payroll.hold.released` (reason, route, amount) |

One stage row per pay group on Payroll home uses existing reads (new PAY-01 story "SeveralGroups").

**Gaps closed:** PAY-01 statutory dues and several pay groups; PAY-03 Failed and Inputs; PAY-06 Release; PAY-10
Failure (and "Show pay is recorded"); PAY-20 Thread; PAY-19 tabs are live on /yx/payroll/arrears. **Still open:** PAY-02
Blocked (attendance-group table), PAY-03 Files, PAY-09 SelfApproval, PAY-10 FailedIfsc, PAY-29 WeeklyRun, PAY-30 Crossed,
PAY-04 Frozen, PAY-05 List and AddSheet, PAY-11 Retrenchment (reference recorded in People) and Bonus (own table),
PAY-19 OrderPanel, CarryForwards, Cap.

**Questions (suggested answers):** (1) "Next bank file" on hold release should use the next regular run's file:
*yes, a small follow-up in payout.service*. (2) Show the input-source table in Validations too (PAY-02): *yes*.
(3) State-wise PT and LWF due dates in the rule files: *yes, size S*. (4) Read unfiled dues back three months: *yes*.
(5) The retrenchment permission reference stays in People › Exits, not typed on the run: *yes*. (6) Re-pay "off-cycle"
is a one-person bank file on the same run: *accept*. (7) An employee may still withdraw their own query without a reply: *yes*.

## Compliance (founder decision 5; branch `feat/yukthix-pay-compliance`, 29 Oct 2026)

The six Compliance pages now render the CMP designs (`packages/yx-ui/src/screens/ops/compliance.tsx`) with `live`;
the live parts sit in `ops/compliance-live.tsx`, tests in `ops/compliance-live.test.tsx` (22). The designs are exported
from `@yukthix/ui/pay`. Routes and the menu are unchanged.

| page | design | was (copy, deleted) |
|---|---|---|
| /yx/payroll/statutory | CMP-01 `StatutoryHubScreen` (cards, due-date calendar); CMP-04 `TdsChallanScreen` as the sheet over it; CMP-05 `TdsReturnWizardScreen` in its "TDS returns" tab | `StatutoryHubScreen` (live/compliance.tsx) |
| /yx/payroll/registers | CMP-03 `RegistersScreen` | `RegistersScreen` (live/operations.tsx) |
| /yx/payroll/certificates | CMP-06 `Form16BulkScreen` | `TaxCertificatesScreen` (live/operations.tsx) |
| /yx/payroll/statutory-rules | CMP-08 `RulesBrowserScreen`, Rules tab | `StatutoryRulesScreen` (live/setup.tsx) |
| /yx/payroll/advisories | CMP-08 `RulesBrowserScreen`, Labour-law updates tab | `AdvisoriesScreen` (live/operations.tsx) |
| /yx/payroll/consultant-tds | CMP-13 `ConsultantTdsScreen` (new design; its returns tab is the CMP-05 wizard with Form 140 / 26Q) | `ConsultantTaxScreen` (live/consultants.tsx) |

Kept from the copies: entity and month; make, make again (reason), download, mark uploaded (portal reference), mark
filed (typed phrase, second step); prepare the TDS challan and record its deposit; start, reconcile, make file, download,
upload .fvu and mark filed a return (token, phrase); registers made, new version (reason), freeze (asks first), signed PDF,
inspection pack; Part A ZIP import with unmatched files, one Part A PDF, issue one or all (phrase); rules read only with
source and values; mark an update reviewed with a note, only https sources as links; consultant challans per section,
Form 140 / 26Q and Form 131 / 16A import. Permissions as before (`can` from the same keys); the API checks every call
and the entity scope. New: toasts (5 s) for every finished action; pressed-too-early field errors with focus (the old
consultant page disabled its buttons; the CMP-04 design disabled Save); "Rules" tab only for payroll set-up holders on
the updates page; certificates page reads the year's Q4 return to show the CMP-06 link.

Copies deleted: `StatutoryHubScreen`, `RegistersScreen`, `AdvisoriesScreen`, `TaxCertificatesScreen`,
`StatutoryRulesScreen`, `ConsultantTaxScreen` (files live/compliance.tsx, operations.tsx, consultants.tsx; the rules part
of live/setup.tsx); stories pay-ops-live, pay-5h-live, pay-5b-live and the Statutory story of pay-5j-live; tests
pay-ops-live.test.tsx and the statutory case of pay-5j-live.test.tsx (ported). `FormDrawer` and `FileButton` moved to
`pay-kit.tsx`; the dead live/special.tsx is deleted. 12 lines left `known.json` (6 live copies, 6 not live). Still in
`known.json` from this area: "ops: StatutorySetupScreen" (CMP-02). ("ops: MissingIdsScreen" left on 30 Oct: CMP-07 is live.)

CMP gaps (branch `feat/yukthix-pay-gaps-statutory`, 2 Nov 2026): CMP-01 SetupNeeded, CMP-03 Epf / Esic / Pt / LwfNotDue,
CMP-05 Completeness / MissingMonth, CMP-06 WrongQuarter / NotYetAvailable and CMP-08 MarkReviewed went live (see each
row). Left as gaps on purpose (an outside provider): CMP-05 Partner (filing partner connector) and CMP-06 Sign (DSC).
Migration 20261330000000_form16_return_link; rule pack packs/in-tds-dates.json. Manual steps MT-CMP-G-01 … 08.
No deductees this month (founder answer 2, branch `feat/yukthix-cmp-no-deductees`): 2 new CMP-05 stories, both live;
migration 20261360000000_tds_nil_months; manual steps MT-CMP-G-09, 10. Counts now 56 live of 83. Before it, recounted
row by row: 54 live, 2 live (gap), 5 wire (gap), 20 not Pay = 81 (the earlier total of 47 live was off by 3; the rows gave 44).

### Counts (sub-pages = stories)

| group | live | live, gap | wire, gap | feature not built | not Pay | sub-pages |
|---|---|---|---|---|---|---|
| CMP-01 Statutory hub | 5 | 0 | 0 | 0 | 0 | 5 |
| CMP-02 Statutory set-up | 0 | 0 | 5 | 0 | 0 | 5 |
| CMP-03 Registers | 7 | 0 | 0 | 0 | 0 | 7 |
| CMP-04 TDS challan sheet | 4 | 0 | 0 | 0 | 0 | 4 |
| CMP-05 TDS return wizard | 8 | 1 | 0 | 0 | 0 | 9 |
| CMP-06 Form 16 | 4 | 1 | 0 | 0 | 0 | 5 |
| CMP-07 Missing IDs | 4 | 0 | 0 | 0 | 0 | 4 |
| CMP-08 Rules & updates | 5 | 0 | 0 | 0 | 0 | 5 |
| CMP-09 … 11 IC console, POSH | 0 | 0 | 0 | 0 | 20 | 20 |
| CMP-12 Supplementary filing | 4 | 0 | 0 | 0 | 0 | 4 |
| CMP-13 Consultant TDS (new) | 15 | 0 | 0 | 0 | 0 | 15 |
| **All** | **56** | **2** | **5** | **0** | **20** | **83** |

### CMP-01 · Statutory hub

Live page: /yx/payroll/statutory

| story (sub-page) | verdict | note |
|---|---|---|
| Cards · Cards per statute (overdue with penalty) | live | penalty from the hub's estimate; the TDS challan is a card |
| Calendar · Due-date calendar | live | the month after the pay month |
| AllOnTrack · All on track | live | |
| SetupNeeded · Empty (set-up needed) | live | GET statutory/hub carries `setupMissing` (PF, ESI, TDS unless the entity has a TAN, PT / LWF for each state of the entity where a published rule charges it; "not registered" counts as recorded). With something missing and nothing owed, the hub shows the design's `SetupNeededState` naming what to register, and "Open payroll set-up" for `payroll.setup.manage` holders. (The old note was out of date: "Nothing to file" never showed, as PF, ESI and TDS cards always come back.) |
| Loading · Loading | live | |

### CMP-02 · Statutory set-up

Live page: none of its own. Registrations and legal options are live in PAY-16 `PayrollSetupScreen` (/yx/payroll/setup).
The Compliance menu item "Statutory rules" (renamed from "Statutory set-up", founder answer 19) opens /yx/payroll/statutory-rules.

| story (sub-page) | verdict | note |
|---|---|---|
| Complete · Registrations complete | wire design (gap) | same data as PAY-16 Registrations step (Q1) |
| Incomplete · Missing deductor details | wire design (gap) | Q1 |
| SwitchOnCheck · Switch on statute · completeness check | wire design (gap) | needs a completeness check read (S) |
| LegalOptions · Legal options | wire design (gap) | live in PAY-16 |
| FilingMode · Filing mode | wire design (gap) | no filing-mode setting in the API (self / partner); partner connector not built |

### CMP-03 · Statutory registers

Live page: /yx/payroll/registers

| story (sub-page) | verdict | note |
|---|---|---|
| Epf · EPF (covered / not covered) | live | GET statutory/registers/epf/rows: one row a person from the approved payslips (an off-cycle payslip adds to the regular one): UAN last four, PF wage, employee, EPS and EPF employer shares; not covered with its reason ("Not a PF member", "No PF on this payslip"); six months of employee / employer totals for the chart; location and coverage filters. The design's `RegisterTabs` renders it; the register files (make, freeze, sign, inspection pack) are its "Register files" tab |
| Esic · ESIC (not covered above ceiling) | live | same read (esic): IP last four, gross, shares; above the ceiling says "Wages above the ESI limit of ₹…" with the limit from the published ESI rule |
| Pt · PT | live | same read (pt): work location, gross, PT; "Below the PT slab" or "No PT in <state>" |
| LwfNotDue · LWF (not due this month) | live | same read (lwf): a month outside the state's LWF months is "Not due" with "LWF is deducted in December in Karnataka" (months from the published LWF rule) |
| Empty · Empty | live | "No register for … yet." with Make registers |
| Loading · Loading | live | |
| Error · Error | live | |

### CMP-04 · TDS challan sheet

Live page: /yx/payroll/statutory (Open challan sheet on the TDS challan card)

| story (sub-page) | verdict | note |
|---|---|---|
| OnTime · Pre-filled, on time | live | TDS from the approved run; BSR, serial, date; pressed too early shows errors |
| LateInterest · Late deposit · interest computed | live | interest from the API |
| EditedNeedsReason · Amount changed · reason required | live | founder answer 23: the amount is editable with "Payroll says …"; a change needs a reason (focus there), is audited (statutory.challan.corrected: from, to, payroll figure, reason) and is refused for the person who prepared the challan. Receipt upload with reading the BSR code is not built |
| Consultants · Consultant section 194J | live | CMP-13 Challans tab, one row per section |

### CMP-05 · TDS return wizard

Live page: /yx/payroll/statutory › TDS returns (salary); /yx/payroll/consultant-tds › Quarterly returns (Form 140)

| story (sub-page) | verdict | note |
|---|---|---|
| Completeness · Completeness (prior-month rows imported) | live | each salary return carries `completeness`: rows per month with their source (payroll / imported as-paid lines), PAN warnings (no PAN, or recorded inoperative for the tax year) and the count checked; the step shows both check lists |
| MissingMonth · Blocked · prior-month rows missing | live | a quarter month before the entity's first approved payroll with nothing imported is missing: the step errors ("July rows missing"), filing says so, and POST tds-returns/:id/file is refused (409 TDS_MONTH_MISSING). "Import rows" takes the month's as-paid lines (employeeCode, componentCode, amount) through the existing PAY-2.12 import (payroll.import.run): every row checked, bad rows listed, nothing lands until all are right; then the draft is started again with the rows (TDS from the TDS lines, paid from the earning lines) and the month unblocks. Founder answer 2: next to it, "No deductees this month" (`NoDeducteesDialog`) records the month with a reason (POST statutory/tds-nil-months, statutory.filing.generate; tds_nil_months, migration 20261360000000: RLS, audited, versioned, never deleted); the return counts it complete with zero rows; Undo until the quarter's return is filed. Refused plainly for a month not over, one whose approved payslips or imported lines carry TDS, one already recorded, or one in a filed quarter |
| NoDeducteesConfirm · Blocked · no deductees this month (confirm) | live | the confirm names the month and asks why (5 to 500 characters; pressed empty: field error); done: toast |
| NoDeducteesRefused · Blocked · no deductees refused (TDS on payslips) | live | the server's refusal shows in the dialog ("July 2026 has approved payslips with ₹4,200 of TDS…"); nothing is recorded |
| Reconciliation · Reconciliation · small difference flagged | live | |
| Fvu · Self-file · FVU validation | live | make file, download, upload .fvu, validation result |
| Partner · Filing partner | live (gap) | filing partner connector not built |
| Filed · Filed and locked | live | token and phrase |
| Correction24Q · Correction return (24Q, old quarter) | live | corrections are listed as returns ("· correction"); starting one (POST tds-returns/:id/correction exists) is not on the page yet, S |

### CMP-06 · Form 16

Live page: /yx/payroll/certificates

| story (sub-page) | verdict | note |
|---|---|---|
| PartA · Part A import (1 missing) | live | ZIP import, unmatched files, one PDF per person |
| WrongQuarter · Q2 return linked · blocked | live | form16_return_links (migration 20261330000000): POST statutory/form16-link (statutory.filing.generate, versioned, audited) links the year's certificates to a salary return of the entity; GET statutory/form16-status shows it with its problem. A link to another quarter, another year, a correction or an unfiled return is kept, shown in the step ("Not a Q4 return") and blocks issuing (one or all). With no link issuing works as before (question 2) |
| Sign · Sign with DSC | live (gap) | DSC signing not built; the step says Part B is made at issue |
| Publish · Publish | live | Issue n ready with the typed phrase |
| NotYetAvailable · Form 130 · not available yet | live | no certificates and the year's Q4 return not filed: the design's `NotYetAvailableState` with "For tax year 2026-27 that is after 31 May 2027" (`availableAfter` from the new IN.TDS-DATES rule, packs/in-tds-dates.json, verify) and "Open Form 16 for 2025-26" |

### CMP-07 · Missing IDs

| story (sub-page) | verdict | note |
|---|---|---|
| PayrollAdmin · Payroll admin | live | /yx/payroll/missing-ids (menu Missing IDs, statutory.filing.view): GET statutory/missing-ids; PAN for everyone (missing or inoperative), UAN unless the profile says no PF, ESI IP when ESI applies, salary bank account missing or waiting; counts per ID drill to its people; Fix opens the person. Bulk "Ask n to update" not built (no API) |
| Hr · HR (import option) | live | same page for HR with statutory.filing.view; "Import from file" not built |
| AllClear · Empty (all IDs complete) | live | "Every statutory ID is in place." with the head count |
| Loading · Loading | live | |

### CMP-08 · Statutory rules & updates

Live pages: /yx/payroll/statutory-rules (Rules tab), /yx/payroll/advisories (Labour-law updates tab)

| story (sub-page) | verdict | note |
|---|---|---|
| Rules · Rules browser + updates banner | live | |
| History · Rule history and source | live | values shown as stored |
| Updates · Labour-law updates feed | live | severity is not in the API: "To review" / "Reviewed" and "Check the source" |
| MarkReviewed · Mark reviewed with note | live | note required; "Create a task" puts a standalone help desk task (the existing desk task list) on a desk the reviewer works on (GET statutory/advisories/task-desks), given to them with a due date; no seat says so. "Share with HR admins" sends an in-app note to holders of employee.change.manage reaching the entity. Both are audited. "Share" is a Checkbox here and in the story (the kit keeps Switch for settings that apply at once) |
| NoUpdates · No unreviewed updates | live | |

### CMP-09 … CMP-11 · IC console, POSH complaint, POSH case (20 stories)

Not Pay: People / Helpdesk area, out of this plan.

### CMP-12 · Supplementary filing

Live page: /yx/payroll/statutory

| story (sub-page) | verdict | note |
|---|---|---|
| ChildCards · Child cards under the original month | live | founder answer 22: GET statutory/hub cards carry `children` (supplementary filings and excess records); "Correct this month" on a filed PF / ESI card makes one |
| PfSupplementary · Supplementary ECR · interest and damages | live | the panel shows reason, people, shares, caused by and the 7Q / 14B lines; download, mark uploaded, mark filed |
| EsiPastPeriod · ESI past-period contribution | live | same for ESI |
| ExcessRefund · Excess remittance refund request | live | recorded with amount and reason ("Paid too much · refund"); paying it back to employees through payroll is not built |

### CMP-13 · Consultant TDS (new design)

Live page: /yx/payroll/consultant-tds

| story (sub-page) | verdict | note |
|---|---|---|
| Returns · Quarterly returns (Form 140) | live | |
| ReturnOpen · A return opened · wizard | live | |
| Difference · Return with a challan difference | live | |
| MarkFiled · Mark filed · type the phrase (sheet) | live | |
| MarkFiledTooEarly · Mark filed · pressed with no token | live | |
| Challans · Challans for a month | live | |
| ChallansTooEarly · Challans · pressed with no month | live | |
| Certificates · Certificates from TRACES | live | |
| Refused · Server refusal | live | |
| ReadOnly · Read only (returns only) | live | |
| Empty · Empty · no returns yet | live | |
| Loading · Loading | live | |
| Error · Error | live | |
| NoAccess · No access | live | |
| ChallansTab · Tabs · challans opened from returns | live | |

### Questions for the founder (suggested answers)

1. The menu item "Statutory set-up" opens the rules browser (/yx/payroll/statutory-rules). Rename it "Statutory rules"
   and leave registrations in Payroll set-up (PAY-16)? *Yes*; CMP-02 then waits as "wire design (gap)".
2. Registers: the API keeps register documents (wages, deductions, overtime), the design shows EPF / ESIC / PT / LWF rows
   per person. Add a read of those rows from the payslips (size M) so CMP-03's tabs go live? *Yes, later*. Done 2 Nov 2026
   (branch `feat/yukthix-pay-gaps-statutory`).
3. TDS returns live in the hub's "TDS returns" tab, Form 16 on "TDS & Form 16". Move the returns tab to "TDS & Form 16"
   (as the CMP-04 page shows them)? *No for now*: the hub is where the challan is.
4. Supplementary filings (CMP-12) and the Missing IDs page (CMP-07): build next, in that order? *Yes*, both M.
5. Changing the challan amount with a reason (CMP-04) and a filing-partner connector (CMP-05 Partner): *amount yes (S);
   partner waits*.

## Bonus builder status (PAY-24 statutory bonus; branch `feat/yukthix-pay-bonus`, 29 Oct 2026)

Founder decision 9: bonus first. `/yx/payroll/bonus` renders the designed `BonusComputationScreen` with `live`; the design
stories feed the same screen with sample data. Menu: Pay › Statutory bonus (`payroll.bonus.manage` or `payroll.bonus.approve`).

- **Rules (Payment of Bonus Act):** eligibility at most the limit a month (a month above it earns nothing) and at least the
  working days in the year (paid days plus lay-off days from the payroll feed; a paid month with no feed counts the days
  employed); bonus wage = the `bonusWage` components of approved payslips (imported history for months with no payslip),
  each month up to the higher of the ceiling and the minimum wage at the place of work; rate from the allocable surplus
  between the lowest and highest rate (a higher rate is the company's choice); at least ₹100 a year, cut down by months;
  set-on (capped at 20 % of the bonus wage) and set-off, oldest first, carried for 4 years; puja / customary bonus and
  misconduct loss deducted with a reason; a s.9 dismissal pays nothing; due 8 months after the year end (badge, overdue).
- **Settings (HR, company or legal entity; the Act's values are the defaults, only more generous values offered):**
  `payroll.bonus.year_start_month` 4, `eligibility_wage` 21000, `calculation_ceiling` 7000, `min_rate` 8.33, `max_rate` 20,
  `min_working_days` 30, `min_amount` 100, `allocable_percent` 60, `carry_years` 4, `due_months` 8.
- **Workflow:** compute (only after the year ends; once per entity and year) → change surplus, rate, deductions (draft,
  rebuilt from payroll each time) → submit → approve or send back (`payroll.bonus.approve`, never by anyone who computed,
  changed or submitted it, from the audit trail; the table also checks) → send: one-time `bonus` pay per person into a
  draft off-cycle bonus run (new one in the entity's first pay group this month, or a chosen draft one); the run's own
  approval and bank file follow. Every write carries the version (stale = 409). Audited: computed, changed, row_changed,
  submitted, returned, approved, sent.
- **API:** `GET payroll/bonus/entities`, `GET payroll/bonus?legalEntityId&yearStart`, `GET payroll/bonus/:id`,
  `POST payroll/bonus`, `PATCH payroll/bonus/:id`, `PATCH payroll/bonus/:id/rows/:employmentId`, `POST …/submit`,
  `POST …/approve`, `POST …/return`, `POST …/send`.
- **Data:** `bonus_computations`, `bonus_computation_rows` (RLS: tenant, support exclusion, pay guard); migrations
  `20261308000000_pay_bonus`, `20261308000100_pay_bonus_source`.
- **Gaps:** bonus for employees under 15 (₹60) and the new-establishment exemption (s.16) are not modelled. See "Pay
  follow-ups B" below for what changed on 30 Oct 2026.

## Pay follow-ups B (founder items 10, 11, 12, 13, 24, 25, 29, 30; branch `feat/yukthix-pay-followups-b`, 30 Oct 2026)

- **10 Held pay.** A hold released to "next bank file" is paid in the bank file of the entity's next regular run (period
  after the held payslip's), not its own run's. The hold keeps `releasedRunId` empty until a regular run's bank file
  claims it (then that run); the own run's file leaves it out (409 "Nobody in this run is waiting to be paid by bank." when
  nothing else waits). The bank file's audit lists `releasedHeldPay`; the result is recorded on the run that paid it and
  both runs settle. A hold released before this change (own run kept) or to "off-cycle" stays with its own run. Re-pay
  and off-cycle files never carry another run's payslips. PAY-06 release sheet text updated.
- **11 Input sources.** The PAY-02 "Inputs for this period" table (GET runs/:id/input-sources) also shows in the run's
  Validations tab, above the checks, as the design places it.
- **12 PT and LWF due dates.** `src/statutory/packs/in-dues.json`: one `IN.CALENDAR` rule set per state (KA, MH, TN, TS,
  DL), items `pt` and `lwf`, all marked verify; `due()` takes a day past the month end as its last day. The hub dates PT
  and LWF cards from the state's calendar; a state without one still shows no date. Loaded by the seed; on an existing
  database run `npx ts-node scripts/load-rule-pack.ts src/statutory/packs/in-dues.json <drafter> <publisher>` (two staff).
  Not loaded into examapp_org by the builder.
- **13 Unfiled dues.** GET statutory/home-dues reads this month and the three before it; of the two oldest months only
  items owed and not filed (and an undeposited TDS challan) are sent (`homeDueMonths`, `onlyUnfiled`).
- **24 Bonus eligibility.** The ₹21,000 limit (company setting) is tested on the full-month salary rate: the bonus-wage
  lines of the monthly salary in force on the month's last day employed. A month with no salary record (imported history)
  or an hourly or daily basis is tested on what it earned. Each row's months carry `rate`.
- **25 Bonus 30 days.** Still paid days plus lay-off days from the payroll feed. Gap: the feed has no column for maternity
  days; paid maternity leave is already inside paid days, but maternity days paid as an ESI benefit instead of salary
  (`special_days` kind maternity) are not counted. Needs a feed column (a migration) when its feed exists.
- **29 Leavers' bonus.** In an off-cycle bonus run, someone whose items are all bonus lines has no "no salary this month"
  check; with no salary or job in the month their last salary and job stand in (one segment; the items-only run pays no
  salary). Someone with any other item still needs a salary that month. No salary ever recorded: "No salary was ever
  recorded for this leaver. Pay their bonus through the F&F settlement."
- **30 Approver notice and Form C.** On send for approval, everyone with `payroll.bonus.approve` on the entity (never a
  maker) gets the in-app notice `payroll.bonus.submitted` and an email. GET payroll/bonus/:id/form-c (either bonus key in
  scope; approved or sent, else 409 "Form C is made once the bonus is approved."; rate limited) returns the Form C CSV:
  one row per eligible employee, income tax and the amount paid from the off-cycle run once known, Father's name blank
  (not held in YukthiX). Audited `payroll.bonus.register_exported` (rows, SHA-256).
- **Migrations:** none.
- **Tests:** see the builder report; manual steps MT-PAY-G-01 … 06.

## Reports builder status (PAY-25 payroll reports; branch `feat/yukthix-pay-reports`, 30 Oct 2026)

Founder decision: bonus first, then reports. `/yx/payroll/reports` renders the designed `PayrollReportsScreen` with `live`; the
design stories feed the same view (`reports-live.tsx`) with sample data in the API's shape. Menu: Pay › Reports › Payroll
reports (`payroll.reports.view`).

- **Key:** `payroll.reports.view` (Payroll Admin, Payroll Approver and Finance Approver templates; migration
  `20261309000100_pay_reports_grant` adds it to hand-edited roles that hold `payroll.run.prepare` or `payroll.run.approve`).
  Scoped to legal entities; the database pay guard is opened to exactly those entities. HR without payroll keys sees no access.
- **Reports (read only, approved payslips only):** salary register (one column per component); reconciliation (the month
  against the month before, regular runs; gross bridge: joiners, leavers, changes; six-month trend); variance (against each
  person's last paid month within 12 months, the company limit); CTC by department; arrears (approved worksheets by the
  month paid); year to date (April to the month; TDS from the components mapped to TDS); bank advice (unheld, bank-mode
  payslips; IFSC and the last four digits only); hold ageing (as on today: 0–30, 31–60, over 60 days, and by reason);
  gratuity provision (the month's and the to-date provision lines; payable after the gratuity rule's minimum service);
  loan ledger (opening, recovered, closing, worked back from each loan's own balance).
- **Filters:** legal entity, month or month range (at most 36), department (with its sub-departments), location; a
  person's department and location are the ones on the last day of each month.
- **API:** `GET payroll/reports` (filter choices), `GET payroll/reports/:kind?legalEntityId&from&to&departmentId&locationId&page&pageSize`
  (at most 200 rows a page; totals over every row), `…&format=csv` (every row, up to 50,000; formula-safe; audited as
  `payroll.report.exported` with the filters and the row count). Sums in SQL numeric, sent as decimal strings; a fixed
  number of queries per report (no per-row queries).
- **Migrations:** `20261309000000_pay_reports` (key, three indexes), `20261309000100_pay_reports_grant`.
- **Gaps:** scheduled reports and "Request access" are design only; CSV only (no XLSX or PDF); the reconciliation bridge
  does not yet split revisions, unpaid leave, arrears and statutory changes (APX-C RPT-PAY-02); year to date has one row per
  employment (a rehired person's employments are not combined).


## Follow-ups builder A status (founder answers 1-6, 9, 16, 19, 22, 23; branch `feat/yukthix-pay-followups-a`, 30 Oct 2026)

- **1 Loan interest:** settings `payroll.loan.interest_rate.advance` and `payroll.loan.interest_rate.loan` (company or
  legal entity, HR's `org.settings.manage`; values 0 … 12, default 0 = interest-free). `GET payroll/loans/rules` returns
  `interestRate`; `POST payroll/loans` refuses any `interestRate` from the client (400) and keeps the company rate on the
  loan; the Approvals summary shows it. PAY-18 and the PAY-17 Add loan drawer have no rate field. No settings screen
  for the loan settings yet (as for the loan limit): question 1.
- **5 Loan repayments:** `GET payroll/loans/:id/repayments` (own loan, or `payroll.loan.manage` over its entity; else
  404): recovered months from `loan_repayments` and their payslips, then the schedule from the balance (paused through
  `pausedUntil`), and `closing` (interest at the loan's rate, simple, 365-day year, from the month after the last
  recovery to today). A pre-closure records interest, total and day with the schedule change and the audit.
- **2 Residential status:** table `tax_residency_requests`; `POST tax/me/residency` (multipart: status, TRC PDF checked by
  content, valid-until not past, treaty country, Form 10F filed); one open request; `GET tax/residency`,
  `GET tax/residency/:id/file`, `POST tax/residency/:id/decision` (`tax.proof.verify`, entity scope, never one's own;
  trigger too). `PATCH tax/me/workspace` refuses a status or treaty change (409). PAY-22 pending / rejected; PAY-23 rows.
- **3 Regime after the cut-off:** table `tax_regime_requests`; `POST tax/me/regime-request` (after the cut-off, reason
  10+ letters, one open) → Approvals type `tax.regime_change`, approvers hold `tax.regime.override` in the entity, never
  the requester or the person; approved sets the regime as payroll's override (audited `tax.regime.overridden`).
- **4 My pay menu:** `myPayPanel` has "Pay documents" and "My equity"; PAY-54 and PAY-58 highlight their own item.
- **6 Payslip days:** `GET payroll/payslips/:id` returns `days` (regular monthly payslips): one cell per day employed,
  from attendance days and approved leave as the feed counts them, plus the frozen feed's totals.
- **9 Consultant portal:** 401 part-way → "Your session ended" (new PAY-56 story); load error with Retry; 403 no access.
- **16 Withdraw a query:** the server already allowed it (own query, `status: closed`, no reply); PAY-21 lists the
  person's queries with Withdraw (new story). Payroll still replies before closing.
- **19 Menu:** "Statutory set-up" → "Statutory rules" (nav test).
- **22 CMP-12 then CMP-07:** hub `children`; Correct this month (supplementary / refund / adjustment); panel actions;
  `GET statutory/missing-ids` and /yx/payroll/missing-ids (menu Missing IDs).
- **23 Challan correction:** see CMP-04 EditedNeedsReason.
- **Migration:** `20261309000000_pay_tax_requests` (two tables, forced RLS with tenant, support-exclusion and pay-guard
  policies, self-decision triggers, one-open partial unique indexes). No new permission keys, so no grant migration.
- **Manual steps:** MT-PAY-F-01 … MT-PAY-F-10 in `docs/yukthix/tracker/manual-tests.json`.


## Pay last four (founder answers, 30 Oct 2026, last 10: items 1, 2, 5, 10; branch `feat/yukthix-pay-last`)

- **1 Bonus eligibility rule.** Setting `payroll.bonus.eligibility_rate_on` (company or legal entity; `last_day` default,
  `first_day`, `highest_in_month`). `rateInMonth` in `bonus.ts` (pure) takes the salary records in force and the days
  employed that month (joined … left): the rate on the last day, on the first day, or the highest in force on any day.
  Read into the computation's rules (so an approved bonus keeps its rule); PAY-24 shows "Eligibility rule: …" above the
  table. Unit tests: a raise on the 15th from ₹20,000 to ₹22,000 under each rule, a raise on the 1st, a cut on the last
  day, the limit and limit + ₹0.01, joiners and leavers mid-month, no monthly salary.
- **2 Form C PDF.** `GET payroll/bonus/:id/form-c?format=pdf|csv` (default csv; anything else 400). The PDF follows the
  register house pattern (pdfkit, A4 landscape): letterhead (legal entity name and registered address), "Form C, Payment
  of Bonus Act, 1965, Rule 4", the year and rate, the 18 register columns (eligible employees only), a Total row
  (money columns, paise-exact), the employer signature line and a Date box; the header repeats on each page. Approved or
  sent only (409 before); either bonus key in the entity (403 / 404 otherwise); rate limited; every download audited
  (`payroll.bonus.register_exported` with `format`, rows, SHA-256). PAY-24: "Download Form C" → PDF / Spreadsheet (CSV).
- **5 Loan settings screen.** New page **Settings › Payroll & Statutory › Payroll rules** (`/yx/settings/payroll-rules`):
  the designed company-settings screen (`CompanySettingsScreen section="payroll"`) with two panels: Statutory bonus
  (all 11 bonus settings, which had no screen) and Loans and advances (`payroll.loan.max_gross_months`,
  `.after_probation`, `.interest_rate.advance`, `.interest_rate.loan`). Each per company or legal entity, starter value
  shown, values only from the registry list (the API refuses others, 400). Save pressed too early: field error, focus
  on the field, never disabled; saved: 5 s toast; every change audited (`org.setting.changed`, before and after).
  Who: changing stays HR's (`org.settings.manage`, on the entity or company-wide), as before (MT-PAY-B-07, MT-PAY-F-01:
  payroll never changes company policy); `payroll.setup.manage` may now read the settings (GET org/settings) and sees
  the page read only. Menu item for either key. Question 1 in the report: should payroll set-up edit them instead? Stories: Settings/Organisation PayrollRules, LoanTooEarly, BonusRule, ReadOnly, Loading, Error.
- **10 PAY-23 residency row.** Six new stories (above), then the live row and drawer render them.
- **Migrations:** none (settings are registry rows; no schema change).
- **Gaps:** the lowest bonus rate above the highest is not refused when saved (the bonus computation refuses it with a
  clear message); the Form C PDF uses the built-in Helvetica font, so names outside Latin-1 (Tamil, Hindi) print wrongly
  (the registers have the same limit); father's name stays blank (not held); OwnProof / ResidencyOwn cannot occur live.
- **Manual steps:** MT-PAY-L-01 … MT-PAY-L-05 in `docs/yukthix/tracker/manual-tests.json`.

## Founder answers, 2 Nov 2026 (finish Pay)
Every Pay "live (gap)" row we can build ourselves is being made live now (run and pay screens; statutory screens). The 9
rows that need an outside partner wait until the founder picks each partner, then are built against the real partner:
TDS filing partner (CMP-05 Partner), Form 16 DSC signing (CMP-06 Sign), group health (5 rows), partner-funded earned wage
access (Partner), payslip chat (Chat).

## Founder answers, 2 Nov 2026 (statutory gaps, "ok for all")
(1) issuing Form 16 requires a valid Q4 return link once linking is in normal use; (2) a plain "No deductees this month"
choice for a month that needs import but had no salary TDS (small follow-up); (3) the review follow-up task can later be
given to someone else on the desk; (4) "HR admins" = holders of `employee.change.manage` for the entity (keep).
## Pay gaps run status (branch `feat/yukthix-pay-gaps-run`, 2 Nov 2026)

All 22 PAY rows that were `live (gap)` (not the CMP groups) are live. Two gap notes were out of date: PAY-12 Hourly (the
API already took payBasis hourly / daily and rate since batch 5b; only the screen lacked the field) and PAY-02 "only
blocking checks can be waived" (a rule, not a gap).

Migrations (forward-only, prefix 2026132): `20261320000000_pay_failed_ifsc` (payment_records.cause),
`20261320000100_pay_one_time_drafts` (one_time_pays status draft), `20261320000200_pay_court_order_remittances`
(new insert-only table, RLS, support exclusion, pay guard), `20261320000300_pay_oncall_holiday`,
`20261320000400_pay_actuarial_movement`, `20261320000500_pay_incentive_plan_versions`.

New API routes and their keys: GET runs/:id (+ publishAlone, payGroup), GET runs/:id/readiness (+ groups),
POST runs/:id/publish (+ selfApprovalReason) · payroll.payslip.publish; payment results `cause` · payroll.payment.record;
GET payroll/runs/:id/items · payroll.offcycle.prepare, payroll.run.view or payroll.run.approve; GET input-periods/:month,
POST input-corrections · payroll.input.manage; POST one-time-pays/bulk, GET one-time-pays/effect · payroll.input.manage;
GET / POST court-orders/:id/remittances, GET carry-forwards · payroll.input.manage; GET deferrals,
GET payslips/:id/deduction-cap · a run key; GET special/settlements/:id/preview, PUT special/plans/:id,
POST special/plans/:id/publish, POST special/plans/:id/versions · payroll.special.manage; GET / POST
reports/access-request · none (the person's own request; listed in the new payroll endpoint-permissions spec).

Run checks: a generation's checks count only its latest pass (a cause fixed since no longer blocks; rows are kept).

Questions for the founder (safe default built, suggested answer):
1. PAY-11 permission reference: People › Exits keeps the authority and the decision date, not an order number. Add an
   order number field to the permission request? Suggested: yes, in People (one optional field); the run shows it.
2. PAY-25: on approval the approver gives the access in Roles & access by hand. Auto-grant a time-bound
   "Payroll reports (read only)" role on approval? Suggested: yes, for the entity of the requester, with a company
   setting for the days (default 90).
3. PAY-35: "count call-out hours towards the weekly hours limit" is stored and shown; the Time roster check does not
   read call-out hours yet. Suggested: the Time builder adds them to the weekly hours check.
4. PAY-04: a frozen month still accepts LOP through the API (only locked / filed are refused); the screen offers only
   late requests for frozen months. Suggested: the API refuses LOP for frozen months too (same as the screen).
5. PAY-09: when several people may publish, the person who prepared the run may still publish alone. Suggested: keep
   (the run was already approved by someone else).

## Pay gaps last status (2 Nov 2026, branch `feat/yukthix-pay-gaps-last`)

Every PAY row is live or a phone view / feature not built. Migrations: 20261370000000_pay_equity_own_key,
20261370000100_tax_pan_link_requests, 20261370000200_incentive_held.

New or changed routes (all declare their key, or are a listed own route in endpoint-permissions.spec.ts, which now
covers TaxController too):
- GET/POST payroll/me/equity(/exercises): payroll.equity.own (every role by default).
- GET performance/me/pay-band: own route; now with one's own CTC.
- GET tax/me/tax-sheet: own; now `months`. POST tax/me/regime-compare: own; optional what-if body.
- POST tax/me/pan-link: own, rate limited, shared file pipeline. GET tax/pan-links, GET tax/pan-links/:id/file,
  POST tax/pan-links/:id/decision: tax.proof.verify, entities in scope, never one's own.
- GET payroll/loans: one's own requests carry `approval`.
- GET payroll/ewa/recoveries: payroll.ewa.manage. GET payroll/ewa/reconciliation: payroll.ewa.manage or payroll.run.approve.
- POST payroll/special/plans/:id/results/:resultId/release: payroll.special.manage. Results take `held` + `heldReason`.

Questions (safe default built):
1. PAY-22 NoPan design helper "This also updates your PAN in Me › Documents": left out, as nothing updates the
   document. Suggested: keep it out; the PAN link is a tax check, the PAN document stays HR's.
2. PAY-33 held part: payroll enters it with the results through the API; the results sheet (PAY-32 screen) has no held
   column or Release button yet (no design story). Suggested: add both to the PAY-32 design, then wire them.
3. PAY-27: the reconciliation is for payroll.run.approve holders (Payroll and Finance Approvers). Suggested: keep;
   or a separate finance key if Finance should see it without approving runs.
4. PAY-27: a negative net's carry-forward is laid on the EWA deduction first when splitting "deferred". Suggested:
   fine until the calculation records which deduction it cut.
5. PAY-58: the fixed read-only auditor base role does not get payroll.equity.own (outside auditors are not employees).
   Suggested: keep.
6. PAY-41: rent with no rent declared counts for the whole tax year in a non-metro city. Suggested: keep (the lower,
   safer exemption); a metro choice can be added to the design.


## Founder answers, 2 Nov 2026 (pay gaps run and last 13 rows, "ok for all")
Build: (1) an optional order number on the retrenchment permission in People > Exits, shown on the run; (2) approving
"Request access" grants a time-limited read-only payroll reports role automatically, days a company setting (default 90);
(3) the Time roster check counts call-out hours towards the weekly limit when the on-call rule says so; (4) the API refuses
LOP input for a frozen month (late request only); (7) a "held" column and Release on the PAY-32 results sheet, designed
first then wired. Keep as built: (5) the preparer publishes without a reason when others can publish; (6) the NoPan line
about Me > Documents stays out; (8) EWA reconciliation for run approvers; (9) deferred counts the EWA deduction first;
(10) the auditor role has no own-equity key; (11) a what-if rent uses the non-metro rate.

## Pay followups status (2 Nov 2026, branch `feat/yukthix-pay-followups`)

Built from the founder answers: (2) an approved PAY-25 "Request access" gives a read-only payroll reports role grant
for the legal entity asked, at once, for `payroll.reports_access.days` (company setting, tenant or legal entity,
default 90), ending by itself, in Roles & access with its last day, audited (`access.grant.created`); the role
"Payroll reports (read only, on request)" holds payroll.reports.view only and its keys cannot be changed. (4) PUT
payroll/lop-inputs/:month refuses a frozen month (409 PERIOD_FROZEN). (7) the PAY-32 results sheet with the held part
and Release, designed first. No migrations (the reports role is made once per company when first granted).

Questions (safe default built):
1. PAY-25: the request names the person's own legal entity; there is no entity choice on the no-access page (it has
   no design). Suggested: keep; add an entity choice to the design if HR outside payroll needs other entities.
2. PAY-25: approving again while access is open is impossible (the person already holds the key, so they cannot ask);
   an extension waits until it ends. Suggested: keep; Roles & access can lengthen a grant by hand.

Built 2 Nov 2026 (branch `feat/yukthix-exit-order-callout`): (1) People › VRS schemes › Government permission: "Record the
decision" takes an optional order number with a grant (1 to 60 characters; letters, digits, spaces and . / ( ) - & , : _;
refused with a deemed grant or a refusal), audited with the date; the PAY-11 Retrenchment run's permission reference now
reads "authority, order no. X, granted on 18 Sep 2026" (the house date). Migration 20261390000000_ir_permission_order_number.
PAY-11 RetrenchmentOk's sample shows the same wording (no new Pay story). (3) The Time roster's weekly-hours check counts
call-out hours of on-call slots whose rule says "count towards weekly hours" (see time-design-map.md). Manual tests
MT-PPL-C-13..15 and MT-TIM-L-39..40.
