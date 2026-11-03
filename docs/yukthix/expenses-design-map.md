# Expenses: live pages and their designs (check)

This file checks, story by story, that every Expenses design sub-page can be reached in the live app. People, Pay, Time
and Performance were checked the same way (see `people-design-map.md`, `pay-design-map.md`, `time-design-map.md`,
`performance-design-map.md`). Founder rule: never build a second, simpler version of a designed screen; make the
designed one live.

Status 3 Nov 2026 (branch `feat/yukthix-exp-1`, from `test/yukthix-main`, round 1): EXP-01 to EXP-05 (expenses home,
claim composer, claim review, trips, advances: what employees, approvers and finance use most) are rendered by live
pages with a `live` prop. The live pages render the designed screens (`ExpensesHomeScreen`, `ClaimComposerScreen`,
`ClaimReviewScreen`, `TripScreen`, `AdvanceScreen` in `packages/yx-ui/src/screens/ops/expenses.tsx`), and the six
stand-in copies they replaced are deleted with their stories and tests (`expenses/live/claims.tsx`: ExpensesHomeScreen,
ClaimScreen; `expenses/live/travel.tsx`: TripsScreen, TripScreen, AdvancesScreen, AdvanceScreen). EXP-06 (to pay),
EXP-07 (policy matrix) and EXP-09 (reports) still render stand-ins (round 2); EXP-08 (card statement import) has no API.

Round 2b (branch `feat/yukthix-exp-2b`, 3 Nov 2026): the manager's read-only **Team claims** list (founder answer 1;
new design stories in EXP-01, page /yx/expenses/team) with the home cards drilling into it; EXP-05's recovery
instalment amounts and the separate forex card; the real receipt thumbnail (kit `ReceiptImage` takes the stored photo
or shows a PDF tile); the foreign-rate tolerance is the company setting `expense.fx_tolerance_pct` (default 3); and the
breadcrumbs name each Expenses page (Pay › Expenses, Pay › Trips, Pay › Advances, Pay › Team claims).

Verdicts (the same words as People and Performance): **live** (the live page renders the designed screen and can reach
this state; the note says how) · **live (gap)** (the design is live, but this state can't be fully reached yet; the
note says why) · **wire design** (a live page exists for this job but renders something else) · **design only,
feature not built** (no API) · **phone view, mobile app not built**.

## Counts (sub-pages = stories)

| | groups | live | live, gap | wire design | feature not built | phone view | stories |
|---|---|---|---|---|---|---|---|
| A. Claims, trips and advances (EXP-01 … 05, rounds 1 and 2b) | 5 | 44 | 0 | 0 | 0 | 3 | 47 |
| B. Finance (EXP-06 … 09, round 2) | 4 | 32 | 1 | 0 | 5 | 0 | 38 |
| **All EXP groups (A–B)** | **9** | **76** | **1** | **0** | **5** | **3** | **85** |
Round 2b recount (script, 3 Nov 2026, `feat/yukthix-exp-2b`): EXP-01 gains 5 design stories (Team claims: manager,
over-limit lines, nothing sent yet, not a manager, phone); the 3 "live (gap)" rows are now live (the manager cards drill
into Team claims; EXP-05 finance recovery shows the instalment amounts; the forex card is drawn). The Ops kit gains one
story (Receipt · stored photo and PDF), not counted here.
| A. Claims, trips and advances (EXP-01 … 05, round 1) | 5 | 36 | 3 | 0 | 0 | 3 | 42 |
Recounted by script on `feat/yukthix-exp-2a` (round 2): EXP-06, EXP-07 and EXP-09 are live. 16 design stories were drawn
first for the states the real record has (EXP-06: re-route, bank files, second-person release, the bank's results, the
journal with codes to map, the journal balanced and exported; EXP-07: the grade band grid with the other policies,
copy as a new policy, rates, categories, editing a category, city tiers, GST registrations, exchange rates, starters;
EXP-09: approver patterns). The three stand-ins (`ToPayLiveScreen`, `ExpenseSetupScreen`, the reports copy) are deleted
with their 8 "Live ·" stories, so no "Live ·" Expenses story is left. Only EXP-08 (card import, waits for a bank-format
decision) is not built; the one new gap is EXP-07 "HR (read only)" (no view-only key for the policy).

Counted by script 3 Nov 2026 on `feat/yukthix-exp-1` (the script is in the appendix): every `export const` story in the
nine `exp-NN.stories.tsx` files against the rows in section 4. The script fails unless each story file has exactly one
row per story, in file order, and every verdict is one of the five words. Before this branch the nine files had 57
stories; this branch adds 7 design stories for states the real record has (EXP-01 new claim and the view switch;
EXP-02 add a line and a line read from a receipt; EXP-03 finance flag check; EXP-04 trips list; EXP-05 advances list)
and one kit story (Ops kit › Money lead in another currency). The lead's "about 80" also counted the 23 "Live ·" stories
of the stand-ins; 15 of them are deleted with the stand-ins, and the 8 left (Live · Reports 3, Live · Expense set-up 3,
Live · To pay 2) go with the round 2 stand-ins. They are pictures of the live app, not designs, so they are not rows here.

The design-live guard (`packages/yx-ui/src/design-live-guard.known.json`) shrinks by 11 lines: `liveCopies` loses
expenses: AdvancesScreen, ClaimScreen, TripsScreen and ops: AdvanceScreen, ExpensesHomeScreen, TripScreen; `notLive`
loses ops: AdvanceScreen, ClaimComposerScreen, ClaimReviewScreen, ExpensesHomeScreen, TripScreen. The kit guard's raw
element count for `expenses` goes from 8 to 4 (the stand-ins' hidden file inputs are gone; uploads use `FileUpload`).

## How it is wired (same as People, Pay, Time and Performance)

- The designed screen takes a `live` prop: `'live' in props ? <LiveX live={props.live} /> : <SampleX {...props} />`.
  Stories keep the sample; the app passes `live` with real data, `state`, `onRetry` and the actions. Trips and advances
  have one designed component each for the list and one record, picked by `live.view` (`'list'` or `'record'`).
- The live parts are in `packages/yx-ui/src/screens/ops/expenses-live.tsx` (EXP-01 … 03) and
  `expenses-travel-live.tsx` (EXP-04, 05); the API shapes stay in `screens/expenses/live/types.ts`; the pure parts
  (status words, exact money in paise, a line's checks, the approval steps, the trip timeline) in
  `expenses-live-data.ts`, unit-tested; the stories' and tests' live sample data in `expenses-live-samples.ts`.
- Money is exact: the API sends decimal strings; sums on the page are done in whole paise (`sumMoney`), never in
  floating point; typed amounts are checked for at most two decimals and sent as typed.
- Kit first (rule 18): the Ops kit's `MoneyLead` takes the pay currency (story "Money lead · pay currency other than
  rupees"). Receipt and booking uploads use the kit `FileUpload` (the phone offers its camera through `capture`).
- Every success is a toast; refusals stay in the drawer or dialog (or a toast that stays for an action without one);
  confirm buttons are never disabled (pressed too early they show the field error and focus the field). Pick-one
  choices use Segment (views, who books, who paid) or the design's RadioGroup (what are you adding, advance type).
- A refused page (403) shows the kit's no-access state, never "check your connection" (`loadState` → `no-access`).
- Phone layouts are the designs' phone frames under 768 px (`useNarrow`); in the live app the shell is the phone's
  header and tabs, so the frame keeps only the title and content.

## 1. Live pages

| page | screen it renders | design | API (permission) | verdict |
|---|---|---|---|---|
| /yx/expenses (?new=1) | `ExpensesHomeScreen` live: my claims with "You will receive" and the payroll month; "Waiting for me" (claims, trips, advances; team spend and over-limit lines) for approvers; "Finance" (to pay, failed, flagged, advances overdue, cut-off) for finance; Segment when someone has more than one view | EXP-01 | `GET me/home` (implicit: own claims; `team` only for a manager's direct reports today; `payroll` from the company setting), `GET claims?view=approvals` (implicit, the task holder), `GET trips?view=approvals`, `GET advances?view=approvals` (implicit), `GET advances` (own), `GET to-pay` (`expense.payout.manage`), `GET advances?view=payout` (`expense.payout.manage`), `GET claims?view=review` (`expense.finance.review`), `POST claims` (implicit: an employee with a current job) | live |
| /yx/expenses/claims/[id] (?add=receipt\|mileage\|perdiem\|bill) | the claimant gets `ClaimComposerScreen` live (lines with their checks, add-a-line sheet, line form, submit, withdraw); anyone else allowed to see it gets `ClaimReviewScreen` live (lines table, receipt rail, reduce and reject a line, approve, send back, reject, finance flags, approval timeline) | EXP-02, EXP-03 | `GET claims/:id` (implicit: claimant, approver holding or having held a task, `expense.claim.view` in scope, `expense.finance.review` for the entity; now with `can.own` and each route step's approvers and decision time), `GET categories`, `POST claims/:id/receipts`, `POST/PUT/DELETE claims/:id/lines`, `POST claims/:id/submit`, `/withdraw` (claimant), `PATCH claims/:id/lines/:lineId/approve-amount`, `POST claims/:id/decide` (the open task's holder), `POST flags/:id` (`expense.finance.review`), receipt and rate-proof files (streamed after the same checks) | live |
| /yx/expenses/team (?month=yyyy-mm, ?over=1) | `TeamClaimsScreen` live: a manager's read-only list of their direct reports' sent claims in this month or last (Segment), all or only those with over-limit lines (Segment); team spend as on the home card; Open only on claims the manager may open anyway (an approver on it, scope or finance) | EXP-01 (Team stories) | `GET claims?view=team&month=` (implicit: someone with direct reports today; 403 for anyone else, 400 for a bad month) | live |
| /yx/expenses/trips (?new=1) | `TripScreen` live, list view: my trips, waiting for me, to book (travel desk); request sheet | EXP-04 | `GET trips`, `GET trips?view=approvals` (implicit), `GET trips?view=desk` (`travel.booking.manage`), `POST trips`, `POST trips/:id/submit` (traveller) | live |
| /yx/expenses/trips/[id] | `TripScreen` live, record view: timeline, itinerary and bookings, settlement, claims on the trip; approve / reject, cancel, close, add claim | EXP-04 | `GET trips/:id` (implicit; money hidden from the travel desk), bookings (`can.book`), `POST trips/:id/close` (`travel.booking.manage`), `POST workflow/approvals/tasks/:id/decide` (the task holder) | live |
| /yx/expenses/advances | `AdvanceScreen` live, list view: mine, waiting for me, finance; request sheet | EXP-05 | `GET advances`, `?view=approvals` (implicit), `?view=payout` (`expense.payout.manage`), `POST advances` (implicit) | live |
| /yx/expenses/advances/[id] | `AdvanceScreen` live, record view: balance card and ledger, overdue message with the company's recovery instalments; approve less, approve / reject, record payment, record a return, claim against it | EXP-05 | `GET advances/:id` (implicit; now with `policy`: settle-by days and recovery instalments from the company settings), `PATCH advances/:id/amount` (the task holder), `POST advances/:id/pay`, `/return` (`expense.payout.manage`) | live |
| /yx/expenses/to-pay | `ToPayScreen` live: the claims queue (saved views Unpaid / Payment failed / All approved, filters, search, bulk "Add to <month> payroll" and "Pay now by bank file" with the pay-from account, re-route a failed payment), Bank files (download, release by someone other than the maker with the typed phrase, cancel, the bank's results) and Journal (codes to map, export, mark posted); the payroll cut-off line | EXP-06 | `GET to-pay` (`expense.payout.manage` for the entity; now with `payroll`: cut-off day and month from the company setting), `POST to-pay/payroll`, `POST payouts`, `GET payouts/:id/file`, `POST payouts/:id/release` (not the maker; step-up and phrase), `/cancel`, `/results`, `GET journal`, `POST journal/export`, `POST journal/:id/posted` (all `expense.payout.manage`) | live |
| /yx/settings/expenses | `PolicyMatrixScreen` live: Limits matrix (grade band grid for policies that apply to one grade; other policies listed below and opened in the grid; sticky save bar saves a new version from a date; copy as a new policy), Mileage & per diem, Receipts & over-limit (categories), City tiers, GST registrations, Exchange rates; set-up check; starters for a new company | EXP-07 | setup routes (`expense.policy.manage`) | live |
| /yx/expenses/reports | `ExpenseReportsScreen` live: Summary (spend by category, paid through, table), Advance ageing (chart, buckets, detail), Unpaid claims, Over limit, GST input, Approver patterns; filter bar (department, period; the legal entity comes from the top bar); Export (CSV) and Download as XLSX | EXP-09 | `GET reports/:kind` (`expense.report.view` for the entities granted; now with `charts` (exact decimal strings) and `departments`; `departmentId` takes up to 20 ids; `format=xlsx`) | live |

## 2. Live Expenses pages with no design (stand-in copies still)

None (round 2). The design-live guard lists no Expenses screen under `liveCopies`, and only EXP-08's screen under
`notLive`.

## 3. Designs with no live page or API

| design | what it needs | size |
|---|---|---|
| EXP-08 card statement import and matching (5 stories) | statement upload and column mapping, auto-match to claim lines, resolve, employee "explain this line"; tables with RLS, a statement parser per bank (provider: to decide) | L |
| EXP-02 in-page camera (3 phone stories) | the mobile app's own camera view; the web page opens the phone's camera through the file picker | mobile app |

## 4. Design groups, story by story

### A. Claims, trips and advances (EXP-01 … 05)

#### EXP-01 · Expenses home

Live page: /yx/expenses (menu Expenses). `GET me/home` decides what each person has: their own claims always; "Waiting
for me" when something waits for them or they manage people; "Finance" with the finance keys.

| story (sub-page) | verdict | note |
|---|---|---|
| Employee · Employee (my claims) | live | my claims as tiles (name links to the claim, amount, sent date, status and payment badges, "Approved ₹X of ₹Y" when cut); rail: "You will receive" with the payroll month (setting `expense.payroll_cutoff_day`), open advance card |
| Manager · Manager (waiting for me) | live | "Waiting for you" lists claims, trips and advances waiting (Review opens each); team spend and over-limit lines for direct reports today, by IST month, against last month. Round 2b: "View team claims" and "View over-limit lines" open Team claims (all, or ?over=1). The waiting items have no due date (none in the API) |
| Finance · Finance (to pay) | live | to pay (exact sum of net payable), payment failed, flagged for audit, advances overdue; the payroll cut-off card with the claims queued for that payroll; the "Flagged for audit" table (Check opens the review) |
| Empty · Empty (first use) | live | no claims: "Snap a receipt" starts a claim that opens on a receipt |
| Loading · Loading | live | while GET me/home loads |
| Error · Error | live | GET me/home fails; Retry refetches |
| Phone · Employee · phone (camera first) | live | under 768 px: "You will receive", Snap a receipt, Request a trip, Add mileage, My claims |
| NewClaim · New claim · name it first | live | "New claim" (or Ctrl K, N E: ?new=1); pressed too early says why and focuses the box |
| ManyRoles · Employee who also approves and pays (view switch) | live | Segment "My expenses / Waiting for me / Finance", shown only to someone with more than one view |
| Team · Team claims · manager, read only | live | /yx/expenses/team: direct reports' sent claims this month (drafts and withdrawn stay private); month Segment (this, last); Open only where the manager may open the claim |
| TeamOverLimit · Team claims · with over-limit lines | live | the "Over-limit lines" card's drill (?over=1), or the Show Segment |
| TeamEmpty · Team claims · nothing sent yet | live | a month with no sent claims |
| TeamNoAccess · Team claims · not a manager (no access) | live | the API refuses (403) anyone with no one reporting to them today; the page shows the kit's no-access state |
| TeamPhone · Team claims · phone | live | under 768 px: the table becomes cards |

#### EXP-02 · Claim composer

Live page: /yx/expenses/claims/[id] for the person claiming (`can.own`). Each line is saved as it is added; "Save draft"
goes back to the home with a toast saying so.

| story (sub-page) | verdict | note |
|---|---|---|
| Draft · Draft · policy flags, per diem, mileage | live | line cards with the real receipt thumbnail (round 2b: the stored photo, or a PDF tile; the drawn receipt while it loads or before the virus check) and the server's policy check (over the limit with the reason box, receipt needed, flags), worked-out mileage and per diem, policy limit; rail: what I will receive after the advance |
| Gst · GST capture on | live | GST details on lines where captured; the rail note shows when a category is GST-eligible |
| ForeignCurrency · Foreign currency · rate variance flag | live | a bill in another currency with the rate used; a rate I entered shows how far it is from the company rate (the server flags it for the approver beyond its tolerance); "Add rate proof" opens the line form with the statement upload |
| FieldDraft · Field-visit distance to confirm | live | a field-day draft line: "Confirm distance" saves it as it is; "Edit distance" opens the form |
| Blocked · Hard block and duplicate | live | a blocked line or a same-receipt / same-invoice flag shows in red and "Remove or fix the blocked line to submit"; the server refuses submit with the list of blockers |
| Empty · Empty claim | live | no lines; "Submit claim" says "Add a line first" and sends nothing |
| Submitted · Submitted | live | toast "Claim submitted: … went to <approver> for approval"; no editing; withdraw; approval timeline in the rail |
| PhoneCamera · Receipt capture · phone | phone view, mobile app not built | the web page opens the phone's own camera through the file picker (`FileUpload capture`), not an in-page camera frame |
| PhoneReading · Reading receipt · phone | phone view, mobile app not built | while the receipt uploads and is read, the upload row shows its progress |
| PhoneDenied · Camera off · phone | phone view, mobile app not built | the browser handles camera permission; a photo can still be chosen from the gallery |
| Phone · Claim · phone (you will receive) | live | under 768 px: lead first, lines, "Add another receipt" and "Submit claim", bottom sheet |
| AddLine · Add a line · what are you adding | live | a receipt (upload, read by OCR into a line to confirm), mileage, per diem, or a bill without a receipt (declared) |
| CheckReadLine · Line read from a receipt · check and confirm | live | "Check and confirm" opens the line form with what was read and low-confidence fields marked; saving confirms it |

#### EXP-03 · Claim review

Live page: /yx/expenses/claims/[id] for anyone else allowed to see the claim: the approver whose turn it is (approve,
reduce, send back, reject), finance (`expense.finance.review`: clear or confirm flags), people with
`expense.claim.view` in scope and earlier approvers (read only).

| story (sub-page) | verdict | note |
|---|---|---|
| Manager · Manager review · receipt beside lines | live | lines table (policy badge from the server's check and open flags, decision); clicking a row shows its real receipt (round 2b) and the employee's reason in the rail; approval timeline with who holds each step (new: route step approvers and decision time) |
| Reduce · Reduce with reason | live | "Reduce" opens the design's drawer; the amount is checked (at most claimed, two decimals) and the reason is required; the preview shows what the employee sees; "Reject line" approves nil with a reason |
| ReasonMissing · Reduce · reason missing | live | pressed too early: the field error, focus on the field, nothing sent |
| FinanceAudit · Finance audit step | live | finance sees the audit message and the flags; no approve or reduce buttons |
| FlagCheck · Finance · clear or confirm a flag | live | Clear or Confirm with a note (required); a confirmed duplicate pays nothing for that line |

#### EXP-04 · Trip

Live pages: /yx/expenses/trips (list and request sheet; ?new=1 opens the sheet) and /yx/expenses/trips/[id].

| story (sub-page) | verdict | note |
|---|---|---|
| Record · Trip record · employee receives balance | live | timeline (requested, approved, advance paid, travelled, claim submitted, settled) worked out from the record; itinerary and bookings; claims on the trip; settlement card; "Add claim to this trip" |
| ToReturn · Settlement · advance to return | live | open advance balance: "You return" and the date to return it by, with "Open the advance" |
| Settled · Settled | live | a closed trip: "Settled on <date>" with the reason |
| Request · Request sheet | live | purpose, dates, legs (add, remove), estimate, advance, who books (Segment), forex card currency; pressed too early lists what is missing |
| PhoneRequest · Request · phone | live | under 768 px: bottom sheet |
| PhoneRecord · Trip · phone | live | under 768 px: settlement first |
| List · Trips list · mine, waiting for me, to book | live | Segment; the travel desk's list only with `travel.booking.manage` |

#### EXP-05 · Advance card + request

Live pages: /yx/expenses/advances (list and request sheet) and /yx/expenses/advances/[id].

| story (sub-page) | verdict | note |
|---|---|---|
| Ledger · Balance ledger (settled by claim) | live | paid, open balance, settle by; ledger rows link to their claims |
| Overdue · Overdue · recovery warning | live | "Settlement window ended" with the company's number of salary instalments (setting `expense.advance.recovery_instalments`, default 3) |
| FinanceRecovery · Finance · recovery instalments | live | round 2b: "Recover ₹X from salary in N instalments: ₹a (Dec 2026), ₹b (Jan 2027), …": before the daily job, the preview (balance ÷ the company's instalments from next month, the loan engine's own rounding); after it, the loan engine's schedule ("Being recovered"). The employee sees the same amounts; an approver who is neither sees none. Recovery is scheduled by the daily job (no "Schedule recovery" button) |
| Forex · Forex advance · exchange difference | live | a forex advance shows its loading rate, the ledger in both currencies and (round 2b) the design's forex settlement card: loaded, spent on trip lines, each return at its rate, the exchange difference, worked out exactly from the ledger |
| Request · Request an advance | live | standing imprest: amount and purpose (pressed too early says why); "For a trip" sends you to the trip request |
| Phone · Advances · phone | live | under 768 px |
| PhoneRequest · Request · phone | live | under 768 px: bottom sheet |
| List · Advances list · mine, waiting for me, finance | live | Segment; finance's list only with `expense.payout.manage` |

### B. Finance (EXP-06 … 09)

#### EXP-06 · To-pay queue

Live page: /yx/expenses/to-pay (menu Expenses › To pay), with `expense.payout.manage`; anyone else sees the no-access state.

| story (sub-page) | verdict | note |
|---|---|---|
| Unpaid · Unpaid | live | saved view Unpaid; net payable, approved, advance adjusted, route (the payroll month or direct payout), status with the bank's reason, payment reference; the cut-off line from the company setting |
| BulkPayroll · Bulk · add to payroll | live | "Add N to <month> payroll"; refusals (no pay that month, locked month) stay on the page with each person's reason; claims already in a payroll, a bank file or paid cannot be chosen (the table says why) |
| BulkPayout · Bulk · pay now by bank file | live | the confirm asks for the pay-from account (6–20 digits, pressed too early says why); one legal entity per file (else it says so) |
| Failed · Payment failed · re-route | live | the danger banner's "Show failed" opens the Payment failed view; a failed bank payment has "Re-route"; a failed salary payment is paid again by payroll |
| All · All approved (with paid) | live | saved view All approved, with paid claims and their payment reference (a year back) |
| Empty · Empty | live | "Nothing to pay." |
| Loading · Loading | live | while GET to-pay loads |
| Error · Error | live | GET to-pay fails; Retry refetches (a 403 shows the no-access state instead) |
| Reroute · Payment failed · re-route to payroll or a new bank file | live | Segment: next payroll (moves it) or a new bank file (opens the bank-file confirm for that claim) |
| BankFiles · Bank files · made by you, released by someone else | live | download; the maker pressing Release is told someone else releases it; cancel with a reason |
| Release · Bank file · second-person release | live | the kit's irreversible sheet: payments, total, file check, typed phrase "RELEASE n"; the server also asks for step-up |
| Results · Bank file · the bank's results | live | per payment: Paid / Failed / Came back (Segment), bank reference, the bank's reason (required unless paid) |
| Journal · Journal · codes to map before export | live | the month's debits and credits for a legal entity; Export is never greyed out, pressed with codes unmapped it says to map them |
| JournalReady · Journal · balanced, exported, mark posted | live | export (CSV) and mark posted |

#### EXP-07 · Expense policy matrix

Live page: /yx/settings/expenses (menu Settings › Expenses), with `expense.policy.manage`; anyone else sees the
no-access state. Founder answer 6: the grade band grid shows policies that apply to exactly one grade; every other
policy is listed below and opens in the same grid.

| story (sub-page) | verdict | note |
|---|---|---|
| Matrix · Matrix (finance edits) | live | grade band picker; category rows with the kind of limit, an Any city column and one per city tier, and over the limit (reason + extra approval, or hard block) |
| Unsaved · Unsaved changes · new version | live | the sticky save bar: a policy in force saves as the next version from a date after its start (pressed too early says why); one not yet in force saves in place; Discard |
| HrReadOnly · HR (read only) | live (gap) | no view-only key for the policy: every set-up route needs `expense.policy.manage`, so HR without it sees the no-access state |
| GradeBands · Grade band grid · other policies listed below | live | "Other policies" table (company-wide, by location or other conditions) with Edit limits |
| CopyPolicy · Copy as a new policy (for one grade) | live | name, applies to (Everyone or conditions; a single grade makes a new grade band), priority, start date |
| Rates · Mileage & per diem · add a rate | live | dated mileage and per-diem rates |
| Categories · Receipts & over-limit · categories | live | receipt needed above, GST, ledger code (unmapped ones stand out) |
| EditCategory · Category · receipt threshold, GST, ledger code | live | the code is kept once saved (read only) |
| Tiers · City tiers | live | |
| Gst · GST registrations · add one | live | GSTIN shape checked after Save, before any call |
| ExchangeRates · Exchange rates | live | the company's own rate table |
| Starters · New company · start from the starters | live | |

#### EXP-08 · Card statement import & matching

| story (sub-page) | verdict | note |
|---|---|---|
| Upload · Upload statement | design only, feature not built | no statement import API |
| Map · Check columns | design only, feature not built | |
| Match · Auto-match results | design only, feature not built | |
| Resolve · Resolve | design only, feature not built | |
| EmployeePhone · Employee explains lines · phone | design only, feature not built | |

#### EXP-09 · Expense reports

Live page: /yx/expenses/reports (menu Expenses › Expense reports), with `expense.report.view`; anyone else sees the
no-access state.

| story (sub-page) | verdict | note |
|---|---|---|
| Summary · Summary | live | spend by category and paid through (payroll, direct payout, company paid) from the server's exact figures; the table |
| Ageing · Advance ageing | live | chart and bucket table (0–30, 31–60, 61–90, over 90 days; every bucket shown) with the exact total, then each advance |
| Unpaid · Unpaid claims (net payable first) | live | approved claims not paid yet |
| OverLimit · Over limit | live | approved bills over a limit with the reason given |
| Gst · GST input | live | GSTR-2B column order |
| Loading · Loading | live | while the report loads |
| ApproverPatterns · Approver patterns · a second look, never a block | live | an approver who approved 3 or more flagged or over-limit claims of the same person in 90 days |

## 5a. Rules built in round 2

- **Paid through** (product default): approved claims decided in the period, their net payable by route (payroll or
  direct payout; no route yet counts as payroll), and their company-paid bills. **Spend by category** is the approved
  amount of personal bills, as in the table. Exact decimal strings; the page adds in paise.
- **Advance ageing buckets** (product default, for reading only): 0–30, 31–60, 61–90 and over 90 days since paid.
- **Department filter**: people whose job is in the department on the report's end date; up to 20 departments.
- **Excel export**: every cell written as text, so money stays exact; CSV keeps the formula guard.
- **To pay cut-off line**: the company setting `expense.payroll_cutoff_day` (for the one legal entity shown, else the
  company default).
- **Grade band** (founder answer 6): a policy whose "applies to" is exactly one condition on the grade with one value.
- **No disabled buttons**: Export journal, Release (by the maker), Pay by bank file (several entities) and Save (nothing
  changed: the save bar only shows with a change) say why instead of being greyed out.

## 5. Rules built in round 1 (and where they come from)

- **Team spend** (product default): my direct reports today; claims by the IST month they were sent; the approved amount
  once decided, else the amount claimed; drafts, withdrawn and rejected claims do not count. **Over-limit lines**: lines
  on those claims whose policy check said "over, needs a reason" or "blocked". Unit-tested (`home-rules.spec.ts`) at the
  IST month edge, the year end and with no claims.
- **Payroll month** (company setting `expense.payroll_cutoff_day`, default 23, per legal entity): approved on or before
  the cut-off day, this month's payroll; after it, the next. The page shows the month; the payments service still skips
  a locked month when it books the claim.
- **Advance settle-by days and recovery instalments** (settings `expense.advance.settle_days`, default 15, and
  `expense.advance.recovery_instalments`, default 3, per legal entity) are now sent with an advance and shown in words.
- **Who sees what**: unchanged on the server (claimant, the task holder, scope, finance per legal entity; travel desk
  without money). The home's team figures are totals only; they name no claim.
- **Money**: exact decimals end to end (paise on the page).

- **Round 2b rules.** Team claims: direct reports today (the same people as the home's team figures), claims by the
  IST month sent, statuses sent / sent back / approved / partly approved / rejected; the list grants no new access (Open
  only where the manager already may open the claim). Recovery preview = what the daily job hands the loan engine
  (open balance, in the pay currency for a forex advance, ÷ `expense.advance.recovery_instalments`, rounded up, the last
  instalment smaller). Foreign-rate tolerance: setting `expense.fx_tolerance_pct` (1, 2, 3, 5, 10; default 3; per
  company or legal entity) replaces the code constant. Receipt thumbnail: the file streams through the receipt route
  (claim access checked, other companies get 404, never a storage link); photos only, a PDF shows a tile because the
  repo has no safe PDF renderer.

## 6. Questions for the founder (safe default built)

1. **Team claims list.** The manager's "Team spend" and "Over-limit lines" cards drill to Approvals, because there is no
   list of my team's claims. *Suggested:* add a read-only "Team claims" view (direct reports, this month and last) in
   round 2 (size S–M), and point the drills at it.
2. **What counts as team spend.** Built: claims sent in the month, approved amount once decided, claimed amount while
   waiting. *Suggested:* keep.
3. **A fourth "Add a line" option**, "A bill without a receipt" (type it in and declare it), next to receipt, mileage and
   per diem. *Suggested:* keep (the API already allows a declared line under the receipt threshold).
4. **"Save draft"** returns to the home with a toast, because every line is saved as it is added. *Suggested:* keep.
5. **Finance home table.** Built: a "Flagged for audit" table under the finance cards (the design only had a drill).
   *Suggested:* keep.
6. **EXP-07 matrix vs dated policies.** The design is one matrix of category × grade × tier; the live set-up is policies
   with "applies to" conditions and rules per category × city tier. *Suggested:* show the matrix for policies whose
   "applies to" is a single grade condition (one column per policy), list the others below it, and draw stories for
   categories, tiers, rates, GST registrations and FX rates before wiring (round 2, L).

### Round 2b questions (safe default built)
7. **Team claims reach.** Built: direct reports only (as the home cards). *Suggested:* keep; add "whole reporting line"
   later only if managers of managers ask.
8. **Opening a team claim.** Built: the list is read only and Open shows only where the manager already may open the
   claim (they approve it). *Suggested:* keep; a manager reading every report's claim would be a new access rule.
9. **PDF receipts.** Built: a "PDF" tile; "View receipt" opens the file. *Suggested:* keep until a vetted PDF renderer
   (pdf.js in the browser, or a worker) is chosen.
10. **Who sees the recovery amounts.** Built: the employee and finance; not an approver alone. *Suggested:* keep.
## 7. Left for round 2 (sizes)
| piece | what | size |
|---|---|---|
| EXP-06 to-pay | make the design live with the API that exists; draw the release-by-a-second-person, bank results and expense journal states first; delete `ToPayLiveScreen` and its 2 Live stories | M |
| EXP-09 reports | server figures for the charts (spend by category, paid through, ageing buckets), entity filter, CSV; draw the approver-patterns report; delete the reports copy and its 3 Live stories | M |
| EXP-07 policy matrix and set-up | founder decision 6, then stories for the set-up parts, then wire; delete `ExpenseSetupScreen` and its 3 Live stories | L |
| EXP-08 card statement import | waits for the bank-format decision; then statement upload and mapping, matching, tables with RLS, employee explanations | L |
| ~~Team claims list (question 1)~~ | done in round 2b | — |
| ~~EXP-05 recovery and forex~~ | done in round 2b | — |
| ~~Receipt picture~~ | done in round 2b (photos; PDFs show a tile) | — |
## 7. Left after round 2 (sizes)
| EXP-07 HR read only | a view-only key for the expense policy (`expense.policy.view`), if HR should see it without editing | S |
| Team claims, advance instalments and forex card, receipt thumbnail, FX tolerance setting | another builder (round 2b) | — |
| Phone camera (3 stories) | the mobile app's in-page camera | mobile app |

## Appendix: the count script

Run from the repo root (`node check.js` after saving the block). It recounts section 4 and fails unless every Expenses
story file has exactly one row per story, in file order, with one of the five verdicts.

```js
// Run from the repo root: node check.js. Recounts section 4 of docs/yukthix/expenses-design-map.md and checks that
// every Expenses design story file has exactly one row per story, in file order.
const fs = require('fs');
const UI = 'packages/yx-ui/src/screens/ops/';
const files = fs.readdirSync(UI).filter((f) => /^exp-\d+\.stories\.tsx$/.test(f));
const want = {};
for (const f of files) {
  const s = fs.readFileSync(UI + f, 'utf8');
  want[s.match(/title:\s*'Screens\/Expenses\/([^']+)'/)[1]] = [...s.matchAll(/^export const (\w+)\s*(?::\s*[\w<>.]+)?\s*=/gm)].map((m) => m[1]);
}
const doc = fs.readFileSync('docs/yukthix/expenses-design-map.md', 'utf8');
const s4 = doc.split('## 4. Design groups, story by story')[1].split('## 5.')[0];
const V = ['live', 'live (gap)', 'wire design', 'design only, feature not built', 'phone view, mobile app not built'];
const errs = [], counts = {};
for (const sec of s4.split(/^### /m).slice(1)) {
  const name = sec.split('\n')[0], c = (counts[name] = { groups: 0, stories: 0, ...Object.fromEntries(V.map((v) => [v, 0])) });
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
console.table(counts);
if (errs.length) { console.error(errs.join('\n')); process.exit(1); }
```

## Founder answers, 3 Nov 2026 (Expenses round 1, "all good")
(1) managers get a read-only "Team claims" list; the home cards drill into it; (2) team spend counts claims sent in the
month, using the approved amount once decided; (3) keep "A bill without a receipt" as a fourth way to add a line;
(4) "Save draft" returns to the home with a toast; (5) keep finance's "Flagged for audit" table; (6) the policy matrix
shows the category × grade × city-tier grid for policies that apply to a single grade and lists the rest below it.
Also: the foreign-rate tolerance (today `FX_TOLERANCE_PCT` = 3 in API code) becomes a company setting with that default.
Card statement import (EXP-08) waits for a bank-format decision.

## Founder answers, 3 Nov 2026 (Expenses round 2, "all good")
Build: HR gets a view-only expense policy key (`expense.policy.view`): HR sees the limits, rates and tabs without editing.
Keep as built: "Paid through" counts a claim with no route yet as payroll; team claims = direct reports only; the team list
is read-only, "Open" only where the manager already approves; PDF receipts show a "PDF" tile until a vetted PDF viewer is
chosen; recovery amounts only for the employee and finance. Card statement import (EXP-08): format decision pending.
Demo: the starters were copied into demo-org by admin-tester on 3 Nov 2026 (founder OK).
