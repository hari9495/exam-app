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
| B. Finance (EXP-06 … 09, round 2) | 4 | 0 | 0 | 17 | 5 | 0 | 22 |
| **All EXP groups (A–B)** | **9** | **44** | **0** | **17** | **5** | **3** | **69** |

Round 2b recount (script, 3 Nov 2026, `feat/yukthix-exp-2b`): EXP-01 gains 5 design stories (Team claims: manager,
over-limit lines, nothing sent yet, not a manager, phone); the 3 "live (gap)" rows are now live (the manager cards drill
into Team claims; EXP-05 finance recovery shows the instalment amounts; the forex card is drawn). The Ops kit gains one
story (Receipt · stored photo and PDF), not counted here.

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
| /yx/expenses/advances/[id] | `AdvanceScreen` live, record view: balance card and ledger, overdue message with the recovery instalment amounts and months (round 2b), the forex settlement card for a foreign-currency advance (round 2b); approve less, approve / reject, record payment, record a return, claim against it | EXP-05 | `GET advances/:id` (implicit; now with `policy`: settle-by days and recovery instalments from the company settings, and `recovery` for the employee and finance: the loan engine's schedule once the recovery loan exists, else the preview), `PATCH advances/:id/amount` (the task holder), `POST advances/:id/pay`, `/return` (`expense.payout.manage`) | live |
| /yx/expenses/to-pay | `ToPayLiveScreen` (stand-in) | EXP-06 | `to-pay`, `payouts`, `journal` (`expense.payout.manage`) | wire design |
| /yx/settings/expenses | `ExpenseSetupScreen` (stand-in: starters, categories, tiers, policies, rates, GST, FX) | EXP-07 | setup routes (`expense.policy.manage`) | wire design |
| /yx/expenses/reports | `ExpenseReportsScreen` (stand-in copy in `expenses/live/reports.tsx`) | EXP-09 | `GET reports/:kind` (`expense.report.view`) | wire design |

## 2. Live Expenses pages with no design (stand-in copies still)

The design-live guard's `liveCopies` still lists three Expenses screens. Each has a design (EXP-06, EXP-07, EXP-09)
that does not show everything the stand-in does, so each needs its missing states drawn first (rule 18).

| page | what it renders (live copy) | note |
|---|---|---|
| /yx/expenses/to-pay | `ToPayLiveScreen` | EXP-06 has the queue, bulk payroll and bank file, failed; the bank file release by a second person, the bank's results upload and the expense journal have no design yet |
| /yx/settings/expenses | `ExpenseSetupScreen` | EXP-07 is a category × grade × tier matrix; the live policies are dated P19 policies (who they apply to) with rules per category × city tier, plus categories, tiers, mileage and per-diem rates, GST registrations and FX rates, none of which have a design |
| /yx/expenses/reports | `ExpenseReportsScreen` (live/reports.tsx) | EXP-09 has charts (spend by category, paid through, ageing buckets) and a filter bar; the API returns rows per report and has the approver-patterns report the design lacks |

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

Live page: /yx/expenses/to-pay renders the stand-in `ToPayLiveScreen` (round 2).

| story (sub-page) | verdict | note |
|---|---|---|
| Unpaid · Unpaid | wire design | stand-in lists the same claims |
| BulkPayroll · Bulk · add to payroll | wire design | API `POST to-pay/payroll` exists |
| BulkPayout · Bulk · pay now by bank file | wire design | API `POST payouts` exists |
| Failed · Payment failed · re-route | wire design | API results and re-route exist |
| All · All approved (with paid) | wire design | |
| Empty · Empty | wire design | |
| Loading · Loading | wire design | |
| Error · Error | wire design | |

#### EXP-07 · Expense policy matrix

Live page: /yx/settings/expenses renders the stand-in `ExpenseSetupScreen` (round 2, needs a founder decision, question 6).

| story (sub-page) | verdict | note |
|---|---|---|
| Matrix · Matrix (finance edits) | wire design | live policies are dated P19 policies with rules per category × city tier |
| Unsaved · Unsaved changes · new version | wire design | the API already versions a policy from a date |
| HrReadOnly · HR (read only) | wire design | |

#### EXP-08 · Card statement import & matching

| story (sub-page) | verdict | note |
|---|---|---|
| Upload · Upload statement | design only, feature not built | no statement import API |
| Map · Check columns | design only, feature not built | |
| Match · Auto-match results | design only, feature not built | |
| Resolve · Resolve | design only, feature not built | |
| EmployeePhone · Employee explains lines · phone | design only, feature not built | |

#### EXP-09 · Expense reports

Live page: /yx/expenses/reports renders the stand-in copy in `expenses/live/reports.tsx` (round 2).

| story (sub-page) | verdict | note |
|---|---|---|
| Summary · Summary | wire design | needs spend by category and "paid through" figures for the charts |
| Ageing · Advance ageing | wire design | needs ageing buckets |
| Unpaid · Unpaid claims (net payable first) | wire design | |
| OverLimit · Over limit | wire design | |
| Gst · GST input | wire design | |
| Loading · Loading | wire design | |

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
| EXP-08 card statement import | the feature: statement upload and mapping, matching engine, tables with RLS, employee explanations, bank formats (provider: to decide) | L |
| ~~Team claims list (question 1)~~ | done in round 2b | — |
| ~~EXP-05 recovery and forex~~ | done in round 2b | — |
| ~~Receipt picture~~ | done in round 2b (photos; PDFs show a tile) | — |
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
