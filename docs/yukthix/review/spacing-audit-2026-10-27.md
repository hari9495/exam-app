# Spacing and alignment audit — 27 Oct 2026

Founder rule: proper spacing and proper alignment. Blocks never touch, gaps come from the `--yx-space-*` tokens, and things that should line up share edges. Every check below ran at **1278 x 635** (a 150 % laptop).

**Scope (narrowed by the founder during the audit).** We fix only real defects:
- blocks that touch (gap under 8 px)
- content that overlaps or is clipped
- sideways scroll bars and overflow
- text, dates or badges that break mid-word or onto awkward extra lines
- off-token gaps between major blocks

We do not re-lay out things that already look deliberate. The earlier checklist column alignment (commits cf99831f, eb0ba0d1 and d120d6a8) was reverted at the founder's request and is not redone here. Column alignment (category c) is still measured, but only reported.

## How it was measured

We wrote an automated checker (Playwright and in-page geometry). It opens **all 3,267 `screens-*` stories** in every area at 1278 x 635. That includes 481 stories that render an open dialog or drawer, and those dialogs and drawers are measured too. For each story it reports:

| Code | What it flags |
|---|---|
| a-touching | Two visible sibling blocks sit closer than 8 px, stacked or side by side. "Blocks" here means cards, alerts, tables, forms, fields, button rows, headings next to content, and buttons or badges. Ignored: inline text, deliberately joined controls (segments, input groups, table rows, square panes inside one bordered frame), nav lists, dense cell grids, skeletons and decorative dots. |
| b-off-token | The vertical gap between two adjacent major blocks (8–64 px) is not a spacing token. Ignored: grid rows and flex free space. |
| c-misaligned | Badges, buttons or values in the same role sit at different left/right/centre positions, by more than 2 px, across ≥ 3 stacked rows of a list. |
| d-wrap / d-midword | A badge, button, short heading (≤ 40 chars) or date breaks across lines, or a word breaks in the middle. |
| e-overflow | The page or a container scrolls sideways. |
| f-card-padding | Cards that share a column have different content insets. |

- **Checker:** `analyze.js` + `run.mjs` (scratchpad `spacing/`, not in the repo, as asked).
- **"Before":** the state at the start of this work. That includes the coordinator's card-body rule `cfdc33f5`, which landed while the audit was running. Each of my CSS changes is switched off in the page at run time, so the "before" numbers count only what my fixes changed.
- **"After":** the same run with all fixes in.
- **New findings after the fixes:** none. Every "after" finding was already in "before".

## Before and after

| Category | Before: findings (stories) | After: findings (stories) |
|---|---|---|
| a. Touching blocks | 309 (140) | **172 (93)** |
| b. Off-token gaps | 92 (37) | **62 (9)** |
| c. Misaligned columns (report only) | 288 (244) | 288 (244) |
| d. Unwanted wrap | 428 (225) | **416 (213)** |
| d. Mid-word breaks | 86 (29) | 86 (29) |
| e. Sideways scroll / overflow | 115 (106) | **98 (91)** |
| f. Card padding | 8 (8) | 8 (8) |

The ~60 a-touching findings that the coordinator's card rule `cfdc33f5` fixed while this audit ran are **not** in the "before" column. That rule is already part of the "before" state.

## Findings by root cause: fixed

All of these are CSS-only and use tokens. Each fix was committed on `feat/yukthix-people-gaps` and cherry-picked into `test/yukthix-main`.

| # | Root cause (shared rule) | Fix | Before → after |
|---|---|---|---|
| 1 | `.yx-select` had no `box-sizing`. The multi-select is a `div`, not a `button`, so its padding pushed it 22 px past its box. Drawers then scrolled sideways (Give kudos, every drawer form with a multi-pick). | `box-sizing: border-box` on `.yx-select` (select.css) | sideways drawer scroll 20 (20 stories) → 4. The 4 left are deliberate scroll areas, see below. |
| 2 | `.yx-portal__nav` had `flex: 1; min-width: 0`. On a busy portal header the menu squeezed into one-word lines ("Shared / jobs", "Timesheets / and / invoices"), and the header grew 280 px tall. | `flex: 1 1 max-content` and nowrap links. A menu that can't fit drops to its own row, as on phones. (_kit/frames.css) | 12 (12) → 0 |
| 3 | `.yx-card__body` stacked children with no gap. The coordinator fixed this in `cfdc33f5` (`> * + *`). That rule still lost to later screen resets like `.yx-lif-list { margin: 0 }`, `.yx-growth-list`, and `p.yx-ops-muted`. Badges placed straight in a card also sat edge to edge. | Companion rules in shell.css: `.yx-card__body > * + :is(ul, ol, dl, p)` and `.yx-card__body > .yx-badge + .yx-badge { margin-left: space-2 }`. | card-body touches 30 (26) → 0 |
| 4 | `.yx-drawer__body` had the same problem as the card body. | `.yx-drawer__body > :where(* + *:not(badge+badge, button+button)) { margin-top: space-4 }` (data.css) | 4 (4) → 0 |
| 5 | `.yx-card__actions` gap was `space-1`, so header buttons and badges sat 4 px apart. | gap `space-2` (shell.css) | 4 (4) → 0 |
| 6 | `.yx-lif-row` has its own `margin-top: 12px`. Inside a `.yx-tim-stack` that already has a 16 px gap, it made 28 px. | `.yx-tim-stack > .yx-lif-row { margin-top: 0 }` (people/live/live.css) | 15 (13) → 0 |
| 7 | Browser default margins leaked into flex stacks: `<p>` chat bubbles (+14 px), `<dl>` rows in the leave/encashment effect box (22 / 29 px), and `<blockquote>` moderation notes (30 px gaps plus a 40 px indent). | `margin: 0` on `.yxp-chat__msg`, `.yx-tim-effect > dl, .yx-tim-effect__row` and `.yx-growth-note` | 15 (15) → 0 |
| 8 | Question bank skill filter: each skill-group heading sat 4 px under the previous row. | `.yx-prc-facet li.yx-prc-stack { margin-top: space-2 }`, so 12 px | 24 (6) → 0 |
| 9 | Bias-check Use / Ignore buttons were 4 px apart. | `.yx-bias__actions` gap `space-2` | 7 (2) → 0 |
| 10 | Workflow test trace: the "Input" / "Output" labels touched their code box. | `margin-top: space-1` on `.yxp-trace__io pre` | 68 (7) → 0 |

## Findings by root cause: not fixed, with reason

| Root cause | Count (after) | Why not fixed now |
|---|---|---|
| **DataTable shrinks columns to 80 % (`MIN_FIT`) and the cell wraps.** Badges ("Waiting for the / company", "Punch · / block") and dates ("29 Sep 2026, 10:58 / AM") break onto a second line. | badges 121 (57 st), dates 117 (32 st) | This is a table-sizing bug, not CSS. The fix is in `table.tsx`: never shrink a column below its widest badge or date. `figureW` already does this for money. It is a real code change to the shared table with test impact, so it is the recommended next task rather than a CSS tweak. |
| Table header labels wrap to 2 lines (`.yx-table__sort > span`, line-clamp 2) | 68 (59 st) | Deliberate (A1/R5: wrap instead of "Payable d…"). Not a defect. |
| Long unbreakable values (emails in Directory, IDs such as `53000123450001001` in fact lists, `TN/OSH/CL/2026/1180`) break mid-word | 86 (29 st) | Deliberate safety net (`overflow-wrap: break-word`), otherwise they would overflow. A wider column or an ellipsis with a tooltip is a design choice. See founder decisions. |
| Wide tables / grids scroll sideways at 1278: BGV tracker (10 columns), muster, timesheet grid, kanban boards, org chart, workflow canvas, interview slot finder, offer break-up | 98 (91 st) | Each is a deliberate scroll area, or a table with no optional columns left. Making them fit means hiding columns or redesigning. See founder decisions. |
| Badge with a caption 2 px under it in table cells (`.yx-ppl__type`, `.yx-tim-list__main`, `.yx-auth__item-main`) | 53 (23 st) | A deliberate compact two-line cell (badge over a sub-line, `space-half`), not two blocks. |
| Keyboard hints (`kbd` ↑ ↓ 3 px apart), roster cell warning, workflow port label | 26 (22 st) | Inline glyph runs inside one control. Not blocks. |
| Proctored test runner notice band touching the exam body; details-fold summary over its checklist; command palette list / footer | 32 (25 st) | Full-width bands and joined panes by design. The visual gap comes from the summary's padding. |
| Org chart node → children "9.6 px" | 57 (6 st) | The org canvas is scaled (zoom), so a 12 px gap measures 9.6 px. Not off-token. |

## Needs founder decision

1. **Column alignment in lists (category c, 288 findings in 244 stories).** In lists like approval timelines (`.yx-approval__status`), person-record events, pre-boarding portal lists, leave-home lists, growth lists, ops clocks and payroll due dates, the badge or date follows its text, so it sits at a different x position on each row. You preferred this look for checklists, so we left all of these as they are.
2. **Tables that scroll sideways at 1278.** BGV tracker, offer break-up and payroll readiness tables. Mark some columns optional (hidden first) or accept the scroll.
3. **Long values breaking mid-word** (emails, PF/ESI and licence numbers): wider columns, an ellipsis with the full value on hover, or keep the break.
4. **Letter preview in the Issue letter drawer.** The A4 page is 156 px wider than the drawer and scrolls sideways. We could scale the preview to fit the drawer.
5. **Card padding on the payslip viewer** (`.yx-pay-panel`, 8 stories). The day-strip panel insets its content differently from the cards beside it, which is part of its calendar design.

## Note for the coordinator about `cfdc33f5`

`.yx-card__body > * + * { margin-top: space-3 }` is right. On its own, though, it is cancelled wherever a screen stylesheet that loads later resets `margin: 0` with a single class: lists, paragraphs, alerts. Commit 19f182eb adds `.yx-card__body > * + :is(ul, ol, dl, p)` (one element more specific) to cover lists and paragraphs. We did not change the original line. We found no case where the rule double-spaces: the "after" run has no new findings, and no off-token gaps inside card bodies.

## Commits (feat/yukthix-people-gaps → cherry-picked into test/yukthix-main)

- 2dd46ed4 Multi-select fits its box (drawer sideways scroll)
- 3447858b Drawers: blocks in a drawer body never touch
- f1a337f3 Portal header menu drops to its own row instead of squeezing
- 539ef0dd / 3455e9c2 Question bank skill groups 12 px clear
- 3e654ee3 Card header actions 8 px apart
- 30075e91 Bias check buttons 8 px apart
- 6022df50 Workflow trace labels 4 px above their box
- 3d0e501d Action row inside a stack keeps the stack gap
- 19f182eb Card body: lists, paragraphs and badges keep their gap
- b8e973af Moderation note: no browser blockquote margins
- fa4a297c Ask YukthiX chat bubbles: no browser paragraph margin
- 339b1251 Leave / encashment effect box rows keep the 8 px gap

**Checks:**
- `npx tsc --noEmit` (packages/yx-ui): passes.
- `npx vitest run` (packages/yx-ui): 114 files and 2,906 tests pass. Vitest still reports 1 unhandled error, a ProseMirror `getClientRects` call in jsdom from `screens/people/templates-live.test.tsx`. That error was already there and is outside this work.

## Per-screen list (after the fixes; remaining findings, all categories)

Format: screen (stories with findings): counts by category, then up to 4 distinct items with the stories they appear in.

- **Analytics/ANL-02 · Role dashboards** (5 stories): wrap 6
  - heading "Payroll cost by department, Sep" on 4 lines (72px) at div.yx-chart__titles > h3.yx-heading.yx-chart__title — Executive
  - heading "Statutory due, Sep" on 2 lines (72px) at div.yx-chart__titles > h3.yx-heading.yx-chart__title — Payroll and finance
  - heading "Pipeline conversion, Backend hiring Q3" on 2 lines (228px) at div.yx-chart__titles > h3.yx-heading.yx-chart__title — Recruiter
  - heading "Hires and 90-day retention by source" on 2 lines (228px) at div.yx-chart__titles > h3.yx-heading.yx-chart__title — Recruiter
  - …and 2 more distinct items
- **Analytics/ANL-04 · Metric explorer** (4 stories): mid-word 4
  - "workforce.attrition_rate" broken mid-word (178px) at dd.yx-dl__value > span.yx-dl__text — Breakdown, Trend, Table +1
- **Analytics/ANL-09 · Ask analytics** (2 stories): wrap 2
  - heading "Attrition, Sales · Chennai office (%)" on 2 lines (190px) at div.yx-chart__titles > h3.yx-heading.yx-chart__title — Governed answer with definition, Generating
- **Compliance/CMP-02 · Statutory set-up** (3 stories): mid-word 3
  - "53000123450001001" broken mid-word (119px) at dd.yx-dl__value > span.yx-dl__text — Registrations complete
  - "51000987650001001" broken mid-word (119px) at dd.yx-dl__value > span.yx-dl__text — Missing deductor details, Switch on statute · completeness check
- **Compliance/CMP-03 · Statutory registers** (4 stories): wrap 4 · overflow 4
  - button "EPF employer 3.67%" on 2 lines (128px) at div.yx-table__th > button.yx-table__sort — EPF (covered / not covered), Empty, Loading +1
  - container-scroll-x 68px at div.yx-table > div.yx-table__scroll — EPF (covered / not covered), Empty, Loading +1
- **Compliance/CMP-07 · Missing-ID dashboard** (2 stories): wrap 2
  - badge "Portal may reject" on 2 lines (109px) at td > span.yx-badge — Payroll admin, HR (import option)
- **Compliance/CMP-08 · Statutory rules & updates** (2 stories): columns 2
  - badge `div.yx-ops-card__head/span.yx-ops-row/span.yx-badge/` in ul.yx-ops-stack.yx-ops-plain: left edges spread 135px, right 87px over 3 rows — Labour-law updates feed, Mark reviewed with note
- **Compliance/CMP-10 · POSH complaint filing** (1 stories): wrap 1
  - date "Due 28 Dec 2026" on 2 lines (97px) at li.yx-ops-clock__item > span.yx-ops-clock__due — Filed · phone
- **Compliance/CMP-11 · POSH case workspace** (4 stories): columns 4
  - value `span.yx-ops-clock__due/` in ol.yx-ops-clock__list: left edges spread 68px, right 124px over 4 rows — Notice to respondent due
  - value `span.yx-ops-clock__due/` in ol.yx-ops-clock__list: left edges spread 87px, right 159px over 4 rows — Inquiry near 90 days (escalated)
  - value `span.yx-ops-clock__due/` in ol.yx-ops-clock__list: left edges spread 30px, right 55px over 4 rows — IC report sent · employer action due
  - value `span.yx-ops-clock__due/` in ol.yx-ops-clock__list: left edges spread 71px, right 131px over 4 rows — Conciliation requested
- **Contract labour/CLB-01 · Contractors register** (3 stories): wrap 1 · mid-word 6
  - badge "Expired 14 days ago" on 2 lines (128px) at span.yx-ops-stack > span.yx-badge — Register · renewal alerts
  - "1180" broken mid-word (151px) at td > span.yx-ops-mono — Register · renewal alerts, Contractor record (licence, work order), Expired licence record
  - "0341" broken mid-word (151px) at td > span.yx-ops-mono — Register · renewal alerts, Contractor record (licence, work order), Expired licence record
- **Contract labour/CLB-02 · Contract workers register** (1 stories): wrap 1
  - button "Wage (by contractor)" on 2 lines (105px) at div.yx-table__th > button.yx-table__sort — Error
- **Contract labour/CLB-03 · Vendor compliance tracker** (3 stories): wrap 12
  - badge "Not required" on 2 lines (80px) at td > span.yx-badge — Matrix · liability alerts · payment holds
  - badge "Can be paid" on 2 lines (78px) at td > span.yx-badge — Finance view (no override)
  - badge "Not required" on 2 lines (83px) at td > span.yx-badge — Finance view (no override)
  - badge "Can be paid" on 2 lines (80px) at td > span.yx-badge — All verified
  - …and 1 more distinct items
- **Contract labour/CLB-04 · CLRA registers & returns** (1 stories): wrap 1
  - badge "Waiting for 2 contractors" on 2 lines (136px) at td > span.yx-badge — Registers
- **Engage/ENG-01 · Feed and spaces** (8 stories): columns 6 · wrap 2 · overflow 6
  - value `span.yx-growth-meta/` in ul.yx-growth-list: left edges spread 15px, right 15px over 4 rows — Feed (pinned, kudos, poll, celebration, event), Filtered to one space, Author sees their post held +3
  - container-scroll-x 104px at section.yx-growth-stack > div.yx-growth-strip — Feed (pinned, kudos, poll, celebration, event), Filtered to one space, Author sees their post held +2
  - badge "Not in this group" on 2 lines (101px) at td > span.yx-badge — Spaces directory
  - container-scroll-x 48px at section.yx-growth-stack > div.yx-growth-strip — Phone · Home tab
- **Engage/ENG-04 · Surveys list and builder** (1 stories): columns 1
  - value `span/span.yx-growth-meta/` in ol.yx-growth-list: left edges spread 226px, right 248px over 4 rows — Builder · question library and preview
- **Engage/ENG-07 · Action plans** (2 stories): wrap 7
  - button "Actions done" on 2 lines (85px) at div.yx-table__th > button.yx-table__sort — HR · plan completion (one overdue), HR · empty
  - date "31 Oct 2026" on 2 lines (100px) at tr > td — HR · plan completion (one overdue)
  - badge "Shared with team" on 2 lines (102px) at td > span.yx-badge — HR · plan completion (one overdue)
  - date "27 Sep 2026" on 2 lines (100px) at tr > td — HR · plan completion (one overdue)
- **Expenses/EXP-01 · Expenses home** (3 stories): columns 3
  - badge `div.yx-ops-tile__row/span.yx-ops-row/span.yx-badge/` in ul.yx-ops-stack.yx-ops-plain: left edges spread 188px, right 183px over 4 rows — Employee (my claims)
  - button `div.yx-actions__buttons/button.yx-button/` in ul.yx-actions__list: left edges spread 112px, right 112px over 3 rows — Manager (waiting for me)
  - badge `div.yx-ops-tile__row/span.yx-ops-row/span.yx-badge/` in ul.yx-ops-stack.yx-ops-plain: left edges spread 276px, right 271px over 4 rows — Employee · phone (camera first)
- **Expenses/EXP-02 · Claim composer** (3 stories): wrap 6 · mid-word 32
  - "27AABCS1429B1ZB" broken mid-word (114px) at dd.yx-dl__value > span.yx-dl__text — GST capture on
  - "27AAFCH8842K1Z3" broken mid-word (114px) at dd.yx-dl__value > span.yx-dl__text — GST capture on
  - date "14 Sep 2026" on 5 lines (19px) at dd.yx-dl__value > span.yx-dl__text — Reading receipt · phone, Claim · phone (you will receive)
  - "2026" broken mid-word (19px) at dd.yx-dl__value > span.yx-dl__text — Reading receipt · phone, Claim · phone (you will receive)
  - …and 14 more distinct items
- **Expenses/EXP-03 · Claim review** (4 stories): columns 4
  - badge `div.yx-approval__body/p.yx-approval__head/span.yx-approval__status/` in ol.yx-approval: left edges spread 123px, right 101px over 4 rows — Manager review · receipt beside lines, Reduce with reason, Reduce · reason missing
  - badge `div.yx-approval__body/p.yx-approval__head/span.yx-approval__status/` in ol.yx-approval: left edges spread 123px, right 123px over 4 rows — Finance audit step
- **Expenses/EXP-06 · To-pay queue** (2 stories): wrap 2
  - button "Advance adjusted" on 2 lines (104px) at div.yx-table__th > button.yx-table__sort — Loading, Error
- **Expenses/EXP-07 · Expense policy matrix** (3 stories): wrap 12
  - badge "Reason + extra approval" on 2 lines (137px) at td > span.yx-badge — Matrix (finance edits), Unsaved changes · new version, HR (read only)
- **Expenses/EXP-09 · Expense reports** (1 stories): wrap 1
  - badge "Payment in October payroll" on 2 lines (145px) at span.yx-ops-row > span.yx-badge — Unpaid claims (net payable first)
- **Expenses/Live · Claims** (2 stories): touch 1 · columns 1
  - span.yx-badge / span.yx-badge side by side 3.3px in td — Home
  - badge `span.yx-badge/` in ul.yx-lif-list: left edges spread 35px, right 22px over 3 rows — Review (approver and finance)
- **Expenses/Live · Trips and advances** (1 stories): touch 1
  - span.yx-badge / span.yx-badge side by side 3.3px in td — Advances
- **Helpdesk/HLP-01 · Help centre** (7 stories): columns 7
  - badge `div.yx-ops-tile__row/span.yx-badge/` in ul.yx-ops-stack.yx-ops-plain: left edges spread 443px, right 417px over 3 rows — Default, Search results, Search · no match +2
  - badge `div.yx-ops-tile__row/span.yx-badge/` in ul.yx-ops-stack.yx-ops-plain: left edges spread 287px, right 274px over 3 rows — Help centre · phone, Raise ticket · phone
- **Helpdesk/HLP-02 · Agent desk** (3 stories): wrap 3
  - badge "Waiting on employee" on 2 lines (116px) at td > span.yx-badge — My open tickets, IT agent (sensitive tickets hidden), Bulk selection
- **Helpdesk/HLP-04 · Knowledge base editor** (1 stories): touch 1 · wrap 1
  - span.yx-editor__divider / button.yx-button side by side 6px in div.yx-editor__tools — Published
  - heading "Why does my payslip show loss of pay?" on 2 lines (389px) at div.yx-page-header__title-row > h1.yx-heading — Published
- **Helpdesk/HLP-06 · Speak-up filing** (1 stories): columns 1
  - value `span.yx-ops-clock__due/` in ol.yx-ops-clock__list: left edges spread 42px, right 77px over 3 rows — Filed · named (GRC clock)
- **Helpdesk/HLP-07 · My cases** (4 stories): mid-word 4
  - "14(2)(c)" broken mid-word (380px) at dd.yx-dl__value > span.yx-dl__text — Show-cause reply, Show-cause · extension requested, Reply sent
  - "14(2)(c)" broken mid-word (198px) at dd.yx-dl__value > span.yx-dl__text — Show-cause reply · phone
- **Helpdesk/HLP-08 · Cases (case team)** (5 stories): columns 5
  - value `span.yx-ops-clock__due/` in ol.yx-ops-clock__list: left edges spread 57px, right 105px over 3 rows — Grievance workspace (GRC, disposal clock), Add member · conflict of interest
  - value `span.yx-ops-clock__due/` in ol.yx-ops-clock__list: left edges spread 71px, right 130px over 3 rows — Disciplinary · reply awaited, Disciplinary · decision blocked before reply, Disciplinary · record decision
- **Helpdesk/HLP-09 · Ethics desk** (2 stories): wrap 2
  - button "Audit committee" on 2 lines (102px) at div.yx-table__th > button.yx-table__sort — Loading, Error
- **Helpdesk/HLP-11 · Policy admin** (1 stories): wrap 1
  - button "Asked to acknowledge again" on 2 lines (122px) at div.yx-table__th > button.yx-table__sort — Versions
- **Helpdesk/HLP-12 · Accident case workspace** (4 stories): wrap 4
  - date "Due 30 Sep 2026" on 3 lines (54px) at li.yx-ops-clock__item > span.yx-ops-clock__due — ESI covered · ESIC report due, Contract worker · contractor not filed
  - date "Due 14 Aug 2026" on 4 lines (15px) at li.yx-ops-clock__item > span.yx-ops-clock__due — Non-ESI · EC claim overdue with interest
  - date "Done 29 Sep 2026" on 2 lines (76px) at li.yx-ops-clock__item > span.yx-ops-clock__due — ESIC report submitted
- **Helpdesk/HLP-13 · Collective dispute / settlement** (2 stories): wrap 2
  - date "Done 6 Oct 2026" on 2 lines (76px) at li.yx-ops-clock__item > span.yx-ops-clock__due — Settlement signed · send to payroll arrears
  - date "Due 6 Oct 2026" on 3 lines (48px) at li.yx-ops-clock__item > span.yx-ops-clock__due — Conciliation in progress
- **Hiring/HIR-01 · Headcount plan board** (3 stories): columns 1 · wrap 5
  - badge "Fully drawn: a new requisition goes outs" on 2 lines (243px) at article.yx-hire-board__card > span.yx-badge — HR · approved plan, Finance · revision pending approval, Hiring manager · own department
  - badge `div.yx-approval__body/p.yx-approval__head/span.yx-approval__status/` in ol.yx-approval: left edges spread 43px, right 54px over 3 rows — Finance · revision pending approval
- **Hiring/HIR-02 · Requisitions** (3 stories): columns 5
  - badge `div.yx-approval__body/p.yx-approval__head/span.yx-approval__status/` in ol.yx-approval: left edges spread 104px, right 90px over 4 rows — Outside plan · extra CFO approval
  - badge `div.yx-hire-list__main/div.yx-hire-chips/span.yx-badge/` in ul.yx-hire-list: left edges spread 19px, right 58px over 3 rows — Outside plan · extra CFO approval
  - badge `div.yx-hire-list__main/span.yx-hire-consent/span.yx-badge/` in ul.yx-hire-list: left edges spread 15px, right 31px over 3 rows — Outside plan · extra CFO approval
  - badge `div.yx-approval__body/p.yx-approval__head/span.yx-approval__status/` in ol.yx-approval: left edges spread 80px, right 66px over 3 rows — In plan · short chain
  - …and 1 more distinct items
- **Hiring/HIR-04 · Pipeline board** (4 stories): wrap 4 · overflow 4
  - heading "AI round – review" on 2 lines (106px) at header.yx-kanban__head > h3.yx-kanban__title — Hiring manager, Recruiter · rich cards, Move to menu (keyboard alternative) +1
  - container-scroll-x 688px at div.yx-kanban-wrap > div.yx-kanban — Hiring manager, Recruiter · rich cards, Move to menu (keyboard alternative) +1
- **Hiring/HIR-06 · Interview calendar** (3 stories): columns 1 · overflow 2
  - container-scroll-x 337px at div.yx-hire-slots > div.yx-hire-slots__scroll — Slot finder · proposed slots ranked
  - badge `span.yx-badge/` in ul.yx-hire-list: left edges spread 106px, right 118px over 3 rows — Interviewer · my interviews and scorecards
  - container-scroll-x 341px at div.yx-hire-slots > div.yx-hire-slots__scroll — Slot finder · required panelist has no calendar
- **Hiring/HIR-09 · Offer builder** (4 stories): columns 1 · overflow 3
  - container-scroll-x 92px at aside.yx-hire-sheet__effect > div.yx-scroll-x — Recruiter · within range, CTC breakup preview, HR · employer costs, joining bonus with clawback, Revision v2 · re-approval because CTC changed
  - badge `div.yx-approval__body/p.yx-approval__head/span.yx-approval__status/` in ol.yx-approval: left edges spread 122px, right 159px over 3 rows — Above range · extra approval
- **Hiring/HIR-10 · BGV tracker** (7 stories): columns 1 · overflow 7
  - container-scroll-x 312px at div.yx-table > div.yx-table__scroll — HR · partner checks, Discrepancy · never auto-withdrawn, Consent pending +1
  - badge `span.yx-badge/` in ul.yx-hire-list: left edges spread 23px, right 34px over 5 rows — Discrepancy · never auto-withdrawn
  - container-scroll-x 148px at div.yx-table > div.yx-table__scroll — Empty, Loading, Error
- **Hiring/HIR-11 · Recruiting costs entry** (1 stories): wrap 2
  - badge "Payroll one-time pay" on 2 lines (106px) at td > span.yx-badge — Costs by type with cost per hire
  - badge "Assessment cost" on 2 lines (106px) at td > span.yx-badge — Costs by type with cost per hire
- **Hiring/HIR-14 · Clients** (1 stories): columns 1
  - badge `div.yx-hire-chips/span.yx-badge/` in ul.yx-hire-list: left edges spread 356px, right 335px over 4 rows — Client workspace · contacts and portal access
- **Hiring/HIR-16 · Submissions board** (3 stories): wrap 1 · overflow 3
  - heading "Rejected by client" on 2 lines (106px) at header.yx-kanban__head > h3.yx-kanban__title — Account manager · board
  - container-scroll-x 178px at div.yx-kanban-wrap > div.yx-kanban — Account manager · board, Submit to client (bulk), Recruiter · submit sheet
- **Hiring/HIR-18 · Invoices** (1 stories): overflow 1
  - container-scroll-x 4px at div.yx-table > div.yx-table__scroll — Finance · invoice list
- **Hiring/HIR-20 · Talent CRM** (2 stories): columns 1 · wrap 1
  - button "WhatsApp opt-in" on 2 lines (108px) at div.yx-table__th > button.yx-table__sort — Pools and hotlists
  - badge `span.yx-badge/` in ul.yx-hire-list: left edges spread 147px, right 23px over 3 rows — Sourced profiles · pending consent
- **Hiring/HIR-21 · Staffing vendors** (2 stories): columns 2 · wrap 1
  - badge `div.yx-hire-list__main/div.yx-hire-chips/span.yx-badge/` in ul.yx-hire-list: left edges spread 273px, right 274px over 4 rows — Vendor submissions · duplicate and over cap
  - badge `div.yx-hire-list__main/div.yx-hire-chips/span.yx-badge/` in ul.yx-hire-list: left edges spread 274px, right 338px over 4 rows — Vendor submissions · duplicate and over cap
  - button "Time to first submission" on 2 lines (127px) at div.yx-table__th > button.yx-table__sort — Scorecards
- **Hiring/HIR-26 · Rediscovery panel** (3 stories): columns 7
  - badge `div.yx-hire-list__main/div.yx-hire-chips/span.yx-badge/` in ul.yx-hire-list: left edges spread 19px, right 58px over 3 rows — Panel · recruiter, On the requisition · recruiter, Panel · hiring manager
  - badge `div.yx-hire-list__main/span.yx-hire-consent/span.yx-badge/` in ul.yx-hire-list: left edges spread 15px, right 31px over 3 rows — Panel · recruiter, On the requisition · recruiter, Panel · hiring manager
  - badge `div.yx-approval__body/p.yx-approval__head/span.yx-approval__status/` in ol.yx-approval: left edges spread 80px, right 80px over 3 rows — On the requisition · recruiter
- **Hiring/HIR-29 · Offer conditions tab** (2 stories): columns 2
  - badge `span.yx-badge/` in ul.yx-hire-list: left edges spread 246px, right 237px over 4 rows — Open conditions · on track, Overdue condition · lapse reminder
- **Hiring/Kit · Hiring and projects building blocks** (1 stories): overflow 1
  - container-scroll-x 345px at div.yx-hire-slots > div.yx-hire-slots__scroll — SlotGrid
- **Kit/Ops kit** (1 stories): columns 1
  - value `span.yx-ops-clock__due/` in ol.yx-ops-clock__list: left edges spread 87px, right 159px over 4 rows — Clock panel (POSH)
- **Learning/LRN-01 · My learning and catalogue** (5 stories): columns 5 · wrap 1
  - badge `span.yx-badge/` in ul.yx-growth-list: left edges spread 106px, right 93px over 4 rows — My learning, Phone, Gamification off
  - heading "Food safety and hygiene essentials" on 2 lines (259px) at article.yx-growth-card > h3.yx-growth-card__title — Catalogue with filters
  - badge `span.yx-badge/` in ul.yx-growth-list: left edges spread 179px, right 154px over 3 rows — Certificates (valid, expired, badges)
  - button `button.yx-button/` in ul.yx-growth-list: left edges spread 97px, right 97px over 3 rows — Certificates (valid, expired, badges)
- **Learning/LRN-09 · Team skills matrix** (1 stories): overflow 1
  - container-scroll-x 140px at div.yx-screen > div.yx-growth-scroll — Manager · people × skills with gaps
- **Learning/LRN-13 · My tests** (4 stories): columns 4
  - badge `span.yx-badge/` in ul.yx-growth-list: left edges spread 34px, right 57px over 4 rows — Assigned tests and results, Phone, Start test (consent per attempt) +1
- **Mobile shell/MOB-02 · Tab bar and Home** (5 stories): wrap 5
  - button "Fix attendance" on 2 lines (88px) at div.yx-ps-quick > button — Employee · not checked in, Employee · checked in, tracking on, Manager · Me segment +2
- **Mobile shell/MOB-03 · Settings and security** (3 stories): touch 3
  - span.yx-badge / span.yx-badge side by side 3.3px in span.yx-ps-list__title — Settings and security, Remote sign-out, Devices and sessions
- **Mobile/Home tab, first run, Time and Pay** (2 stories): overflow 2
  - container-scroll-x 72px at main.yx-phone__body > div.yx-m-strip — Home · to-dos, Home · to-dos · empty
- **Mobile/Requests and Me tabs** (1 stories): off-token 1
  - p.yx-m-code / div.yx-m-pin.yx-m-actions stacked 34px in main.yx-phone__body — Me · speak up · anonymous access code
- **Partner portal/PTR-01 · Clients** (4 stories): wrap 8
  - badge "Awaiting client approval" on 2 lines (144px) at td > span.yx-badge — Clients · phone, Clients, Firm not verified · links blocked +1
  - badge "Due this week" on 2 lines (91px) at td > span.yx-badge — Clients · phone, Clients, Firm not verified · links blocked +1
- **Partner portal/PTR-02 · Cross-client compliance calendar** (1 stories): touch 3
  - button.yx-ps-cal__item / button.yx-ps-cal__item stacked 4px in div.yx-ps-cal__day — Month view
- **Pay/Kit · Pay building blocks** (1 stories): columns 1
  - value `span.yx-pay-due__date/` in ul.yx-pay-due: left edges spread 64px, right 56px over 7 rows — DueDateStrip · with estimated penalty
- **Pay/Live 5h** (1 stories): touch 1
  - span.yx-badge / div.yx-tim-muted stacked 0px in td — Consultants
- **Pay/Live 5j** (1 stories): columns 1
  - badge `details/summary/span.yx-ppl__line-label/span.yx-badge/` in ul: left edges spread 209px, right 209px over 3 rows — PPL-22 · Full and final
- **Pay/Live ops** (1 stories): touch 1
  - span.yx-badge / p.yx-tim-note stacked 0px in td — PAY-22 · My tax declarations
- **Pay/PAY-01 · Payroll home** (6 stories): columns 6 · wrap 6
  - value `span.yx-pay-due__date/` in ul.yx-pay-due: left edges spread 59px, right 56px over 7 rows — In review · blocked (payroll admin), Nothing blocking (finance approver), Finance approver +3
  - date "20 Sep 2026" on 2 lines (71px) at li > span.yx-pay-due__date — In review · blocked (payroll admin), Nothing blocking (finance approver), Finance approver +3
- **Pay/PAY-02 · Run readiness** (3 stories): columns 4 · wrap 10 · overflow 2
  - badge `div/p.yx-pay-findings__title/span.yx-badge/` in ul.yx-pay-findings: left edges spread 218px, right 218px over 8 rows — Blocking items, Waive with reason (dialog open)
  - button `div.yx-pay-findings__acts/button.yx-button/` in ul.yx-pay-findings: left edges spread 113px, right 113px over 8 rows — Blocking items, Waive with reason (dialog open)
  - badge "Locked · Available once blocking items a" on 3 lines (236px) at span.yx-stepper__text > span.yx-stepper__status — Blocking items
  - badge "Locked · Needs finance approval (maker ≠" on 2 lines (236px) at span.yx-stepper__text > span.yx-stepper__status — Blocking items, Ready to calculate
  - …and 7 more distinct items
- **Pay/PAY-03 · Run workspace** (6 stories): columns 2 · wrap 8
  - button "Days paid" on 2 lines (50px) at div.yx-table__th > button.yx-table__sort — Payslips tab · in review, Calculating · per-employee progress, Calculation failed · named fixes
  - button "Pay mode" on 2 lines (50px) at div.yx-table__th > button.yx-table__sort — Payslips tab · in review, Calculating · per-employee progress, Calculation failed · named fixes
  - badge `div.yx-pay-findings__acts/span.yx-badge/` in ul.yx-pay-findings: left edges spread 196px, right 148px over 9 rows — Validations tab
  - badge `div.yx-approval__body/p.yx-approval__head/span.yx-approval__status/` in ol.yx-approval: left edges spread 51px, right 65px over 3 rows — Approvals tab (finance approver)
  - …and 2 more distinct items
- **Pay/PAY-04 · Manual LOP input** (5 stories): wrap 7
  - button "Payable days" on 2 lines (78px) at div.yx-table__th > button.yx-table__sort — Inline entry · one row with an error, Empty · no Assumed-present groups, Period frozen · late request only +2
  - button "Absent after leave balance ran out" on 2 lines (217px) at td > button.yx-table__editable — Inline entry · one row with an error
- **Pay/PAY-05 · One-time pay** (5 stories): wrap 5
  - button "Earning or deduction" on 2 lines (105px) at div.yx-table__th > button.yx-table__sort — List · filters and bulk actions, Loading, Error
  - date "October (15–31 Oct)" on 2 lines (128px) at div.yx-dl__row > dt.yx-dl__label — Add recurring item · prorated months
  - button "Earning or deduction" on 2 lines (114px) at div.yx-table__th > button.yx-table__sort — Empty · first use
- **Pay/PAY-06 · Salary holds and releases** (2 stories): wrap 2
  - badge "Release requested" on 2 lines (112px) at td > span.yx-badge — Holds by reason · ageing chart, Tab on One-time pay and holds
- **Pay/PAY-11 · Off-cycle run** (1 stories): wrap 1
  - badge "Needs changes · Permission reference mis" on 2 lines (236px) at span.yx-stepper__text > span.yx-stepper__status — F&F retrenchment · blocked without permission
- **Pay/PAY-13 · Template builder** (5 stories): wrap 10
  - button "House rent allowance HRA" on 2 lines (145px) at div.yx-pay-cards__row > button.yx-pay-why__row — Formula editor · live test employee, Autocomplete open, Validation error · circular formula +2
  - button "Leave travel allowance LTA" on 2 lines (145px) at div.yx-pay-cards__row > button.yx-pay-why__row — Formula editor · live test employee, Autocomplete open, Validation error · circular formula +2
- **Pay/PAY-15 · Payslip layout editor** (3 stories): wrap 3 · overflow 3
  - heading "Always shown (required on wage slips)" on 2 lines (259px) at div.yx-form-section__head > h2.yx-heading — Draft · sample-employee preview, Second language on, Published version
  - container-scroll-x 309px at div.yx-pay-preview > div.yx-print — Draft · sample-employee preview, Second language on, Published version
- **Pay/PAY-18 · Loan or salary advance request** (2 stories): columns 2
  - badge `div.yx-approval__body/p.yx-approval__head/span.yx-approval__status/` in ol.yx-approval: left edges spread 91px, right 127px over 4 rows — Submitted · approval steps, phone · submitted
- **Pay/PAY-20 · Payslip query queue** (1 stories): wrap 2
  - badge "Paused since 3 Sep" on 2 lines (103px) at td > span.yx-badge — Open queries
  - badge "Waiting for employee" on 2 lines (121px) at td > span.yx-badge — Open queries
- **Pay/PAY-21 · Payslip viewer** (4 stories): card padding 4
  - Days in September11: Paid22: Paid33: Pai inset 17px vs 21px at div.yx-pay-stack > section.yx-pay-panel — Net first · why this number, Raise a query on a line, Query sent +1
- **Pay/PAY-23 · Proof verification queue** (1 stories): wrap 9
  - date "10 Sep 2026" on 2 lines (102px) at tr > td — Waiting lines
  - date "19 Sep 2026" on 2 lines (102px) at tr > td — Waiting lines
  - date "22 Sep 2026" on 2 lines (102px) at tr > td — Waiting lines
  - date "25 Sep 2026" on 2 lines (102px) at tr > td — Waiting lines
  - …and 4 more distinct items
- **Pay/PAY-25 · Payroll reports** (2 stories): overflow 2
  - container-scroll-x 104px at div.yx-table > div.yx-table__scroll — Salary register
  - container-scroll-x 82px at div.yx-table > div.yx-table__scroll — Gratuity provision
- **Pay/PAY-29 · Weekly and fortnightly runs** (1 stories): wrap 2
  - date "Week 39 · 21–27 Sep 2026" on 2 lines (194px) at tr > td — Run list · weekly
  - date "Week 38 · 14–20 Sep 2026" on 2 lines (194px) at tr > td — Run list · weekly
- **Pay/PAY-30 · Coverage monitor** (1 stories): wrap 3
  - badge "Crossed: set-up needed" on 2 lines (124px) at td > span.yx-badge — Threshold crossed · blocks approval
  - badge "Covered permanently" on 2 lines (124px) at td > span.yx-badge — Threshold crossed · blocks approval
- **Pay/PAY-31 · Piece-rate cards and output** (4 stories): wrap 4 · overflow 3
  - button "Days worked" on 2 lines (76px) at div.yx-table__th > button.yx-table__sort — Earnings check · minimum-wage top-up, Loading, Error
  - container-scroll-x 100px at div.yx-table > div.yx-table__scroll — Earnings check · minimum-wage top-up, Loading, Error
  - date "31 Sep · Labelling · 40" on 2 lines (132px) at tr > td — Output import · validation preview
- **Pay/PAY-35 · On-call and standby rules** (2 stories): wrap 2
  - button "Normal day" on 2 lines (72px) at div.yx-table__th > button.yx-table__sort — Rules · weekday worked example, Holiday multiplier example
- **Pay/PAY-36 · Union check-off** (1 stories): touch 11 · overflow 1
  - span.yx-badge / p.yx-pay-note stacked 0px in div — Authorisations
  - container-scroll-x 3px at div.yx-table > div.yx-table__scroll — Authorisations
- **Pay/PAY-40 · Why is my pay different** (4 stories): card padding 4
  - Days in September11: Paid22: Paid33: Pai inset 17px vs 21px at div.yx-pay-stack > section.yx-pay-panel — Every change explained, Not explained row · raise payslip query, Chat panel (wave 5, own payslip only) +1
- **Pay/PAY-41 · Compare tax regimes** (1 stories): touch 2
  - span.yx-pay-bars__label / span.yx-pay-bars__track stacked 0px in li — phone
- **People/Job history** (4 stories): touch 12
  - span.yx-text / span.yx-badge stacked 2px in span.yx-auth__item-main — HR · today, Payroll · pay shown (recorded), As on 1 Nov 2026 (scheduled promotion) +1
- **People/Kit** (1 stories): columns 1
  - badge `details/summary/span.yx-ppl__line-label/span.yx-badge/` in ul: left edges spread 180px, right 239px over 4 rows — Explained F&F lines
- **People/PPL-01 · Directory** (5 stories): wrap 5 · mid-word 15
  - badge "Deployment ending" on 2 lines (104px) at td > span.yx-badge — HR · contract workers
  - badge "Deployment ending" on 2 lines (109px) at td > span.yx-badge — HR · all persons
  - "akash.krishnan@kaverifoods.in" broken mid-word (218px) at tr > td — Employee · public fields only, Live · employee (quick chips from the person)
  - "ananya.mathew@kaverifoods.in" broken mid-word (218px) at tr > td — Employee · public fields only, Live · employee (quick chips from the person)
  - …and 6 more distinct items
- **People/PPL-02 · Org chart** (8 stories): off-token 57 · overflow 4
  - div.yx-org__card / ul[role=group] stacked 9.6px in li.yx-org__node — Reporting lines (today), Department view, Position view with vacancies +3
  - container-scroll-x 4285px at div.yx-org > div.yx-org__viewport — Department view
  - container-scroll-x 1812px at div.yx-org > div.yx-org__viewport — As on 1 Oct 2026 (scheduled changes), Employee view
  - container-scroll-x 49700px at div.yx-org > div.yx-org__viewport — One entity · manager in another entity
- **People/PPL-03 · Person record** (17 stories): columns 21 · wrap 4
  - badge `span.yx-badge/` in ul.yx-ppl__rail-events: left edges spread 167px, right 158px over 4 rows — HR · overview (masked IDs with audited reveal), Employee · own record, Manager · team member (Personal hidden) +14
  - badge `div.yx-ppl__check-main/span.yx-ppl__check-title/span.yx-badge.yx-ppl__class/` in ul.yx-ppl__checklist: left edges spread 60px, right 64px over 7 rows — Documents tab · HR verify
  - badge `span.yx-badge/` in ul.yx-ppl__checklist: left edges spread 256px, right 188px over 7 rows — Documents tab · HR verify
  - badge `div.yx-ppl__check-main/span.yx-ppl__check-title/span.yx-badge.yx-ppl__class/` in ul.yx-ppl__checklist: left edges spread 19px, right 19px over 3 rows — Documents tab · manager (restricted classes hidden)
  - …and 4 more distinct items
- **People/PPL-04 · Change action** (4 stories): columns 4
  - badge `div.yx-approval__body/p.yx-approval__head/span.yx-approval__status/` in ol.yx-approval: left edges spread 87px, right 123px over 3 rows — HR · transfer with impact preview (PT state)
  - badge `div.yx-approval__body/p.yx-approval__head/span.yx-approval__status/` in ol.yx-approval: left edges spread 92px, right 123px over 4 rows — HR · promotion with pay change, HR · correction into processed payroll, Manager · promotion without salary grant
- **People/PPL-05 · Scheduled changes** (3 stories): touch 6
  - span / span.yx-badge stacked 2px in span.yx-ppl__type — Next 30 days, Cancel with reason, Next 90 days (two changes for one person)
  - span.yx-badge / span.yx-ppl__sub stacked 2px in span.yx-ppl__type — Next 30 days, Cancel with reason, Next 90 days (two changes for one person)
- **People/PPL-06 · Bulk changes wizard** (2 stories): touch 6
  - span.yx-ppl__sub / span.yx-badge stacked 2px in span.yx-ppl__type.yx-ppl__type--end — Step 3 · per-person preview (3 above band), Step 3 · company rule: block above the band
- **People/PPL-09 · Bulk transfer and restructure** (3 stories): columns 2 · wrap 1
  - badge `div.yx-ppl__check-side/span.yx-badge/` in ul.yx-ppl__checklist: left edges spread 193px, right 183px over 4 rows — Step 3 · close blocked (payroll not locked)
  - badge "Couldn't move" on 2 lines (85px) at td > span.yx-badge — Restructure record · done, one person could not move
  - badge `div.yx-ppl__check-side/span.yx-badge/` in ul.yx-ppl__checklist: left edges spread 33px, right 17px over 7 rows — PPL-10 · continuity checklist (live items)
- **People/PPL-11 · Onboarding board** (1 stories): overflow 1
  - container-scroll-x 178px at div.yx-kanban-wrap > div.yx-kanban — Board with progress rings
- **People/PPL-12 · Ready to onboard** (5 stories): touch 10
  - span.yx-badge / span.yx-ppl__sub stacked 2px in span.yx-ppl__type — Queue by person type, Create employee (new person), Create employee (rehire impact preview) +2
- **People/PPL-13 · Journey record** (4 stories): touch 11 · columns 2
  - ul.yx-ppl__checklist / details.yx-ppl__done-fold stacked 0px in section — HR · all tasks with owners and relative dates, New hire · own tasks, Appointment letter overdue (compliance alert)
  - summary / ul.yx-ppl__checklist stacked 0px in details.yx-ppl__done-fold — HR · all tasks with owners and relative dates, Manager · manager and buddy tasks, New hire · own tasks +1
  - badge `div.yx-ppl__check-side/span.yx-badge/` in ul.yx-ppl__checklist: left edges spread 30px, right 30px over 5 rows — HR · all tasks with owners and relative dates, Appointment letter overdue (compliance alert)
- **People/PPL-17 · Probation review form** (2 stories): touch 2
  - summary / section.yx-card stacked 0px in details.yx-ppl__done-fold — · phone, · phone, extend 3 months
- **People/PPL-18 · Resignation** (2 stories): columns 2
  - badge `div.yx-approval__body/p.yx-approval__head/span.yx-approval__status/` in ol.yx-approval: left edges spread 48px, right 14px over 3 rows — Submitted, pending (withdraw directly)
  - badge `div.yx-approval__body/p.yx-approval__head/span.yx-approval__status/` in ol.yx-approval: left edges spread 48px, right 48px over 3 rows — Accepted (withdraw needs approval)
- **People/PPL-19 · Exit cases** (5 stories): touch 6 · columns 3 · wrap 3
  - span.yx-badge / span.yx-text stacked 2px in span.yx-ppl__type — HR · exit cases, Manager · my team
  - badge "Open case: letters held" on 2 lines (121px) at td > span.yx-badge — HR · exit cases
  - date "F&F due 22 Oct 2026" on 2 lines (121px) at span.yx-ppl__type > span.yx-text — HR · exit cases
  - badge "Approval and notice" on 2 lines (121px) at span.yx-ppl__type > span.yx-badge — HR · exit cases
  - …and 2 more distinct items
- **People/PPL-22 · F&F calculator** (4 stories): columns 4
  - badge `details/summary/span.yx-ppl__line-label/span.yx-badge/` in ul: left edges spread 180px, right 239px over 4 rows — Explained lines with deadline countdown, One working day left (holiday skipped), Overdue
  - badge `details/summary/span.yx-ppl__line-label/span.yx-badge/` in ul: left edges spread 288px, right 298px over 5 rows — Part held for an open case
- **People/PPL-23 · Death in service** (5 stories): wrap 5
  - badge "Needs changes · A bank account is not ve" on 2 lines (236px) at span.yx-stepper__text > span.yx-stepper__status — Payees per nominations, No valid nomination (legal heirs), Dues split by share +2
- **People/PPL-28 · Issue letters** (5 stories): wrap 3 · overflow 3
  - container-scroll-x 156px at div.yx-ppl__stack > div.yx-ppl__letter — Issue letter · preview with real data, Issue letter · approval before issue
  - badge "Needs changes · 2 letters can’t be gener" on 2 lines (236px) at span.yx-stepper__text > span.yx-stepper__status — Bulk issue · preview with failures, Live · bulk issue · preview with failures
  - container-scroll-x 246px at div.yx-ppl__stack > div.yx-ppl__letter — Bulk issue · preview with failures
  - badge "Pending approval" on 2 lines (102px) at td > span.yx-badge — Issued letters register (superseded, held)
- **People/PPL-29 · Letter templates** (2 stories): touch 1 · wrap 1
  - span.yx-editor__merge / span.yx-editor__merge stacked 4px in p — In-app editor with merge fields
  - button "Before issue" on 2 lines (76px) at div.yx-table__th > button.yx-table__sort — · empty
- **People/PPL-32 · Profile change request** (1 stories): columns 1
  - badge `div.yx-approval__body/p.yx-approval__head/span.yx-approval__status/` in ol.yx-approval: left edges spread 58px, right 72px over 4 rows — Submitted · approved, cooling period
- **People/PPL-34 · Identity panel** (2 stories): columns 2 · wrap 10 · mid-word 11 · overflow 2
  - badge `span.yx-badge/` in ul.yx-ppl__rail-events: left edges spread 167px, right 158px over 4 rows — On the person record (consented), Face consent refused (ID check and attestation)
  - date "20 Jan 2021" on 3 lines (60px) at tr > td — On the person record (consented)
  - badge "Captured (ID + selfie)" on 3 lines (80px) at td > span.yx-badge — On the person record (consented)
  - date "25 Jan 2021" on 3 lines (60px) at tr > td — On the person record (consented)
  - …and 17 more distinct items
- **People/PPL-35 · Person roles panel** (1 stories): columns 1
  - badge `span.yx-badge/` in ul.yx-ppl__rail-events: left edges spread 167px, right 158px over 4 rows — On the person record
- **People/PPL-41 · Buddy panel** (3 stories): touch 3
  - summary / ul.yx-ppl__checklist stacked 0px in details.yx-ppl__done-fold — HR · pool, load and check-ins, HR · assign a buddy to a joiner, · empty pool
- **People/PPL-42 · Re-verification cycles** (2 stories): wrap 6
  - button "On a role move" on 2 lines (85px) at div.yx-table__th > button.yx-table__sort — HR · rules
  - date "1 Apr 2026" on 2 lines (92px) at tr > td — HR · rules
  - badge "Ended 31 Mar 2026" on 2 lines (112px) at td > span.yx-badge — HR · rules
  - date "1 Apr 2025" on 2 lines (92px) at tr > td — HR · rules
  - …and 2 more distinct items
- **People/PPL-45 · Work authorisations tab** (1 stories): columns 1
  - badge `span.yx-badge/` in ul.yx-ppl__rail-events: left edges spread 167px, right 158px over 4 rows — On the record (visa expiring, occupation differs)
- **People/PPL-46 · International bank details** (1 stories): columns 1
  - badge `span.yx-badge/` in ul.yx-ppl__rail-events: left edges spread 167px, right 158px over 4 rows — On the Pay tab
- **People/PPL-47 · My checklist tasks** (1 stories): columns 1
  - badge `div.yx-ppl__check-side/span.yx-badge/` in ul.yx-ppl__checklist: left edges spread 30px, right 30px over 3 rows — Manager · tasks by person
- **Performance/Live · Comp review** (2 stories): touch 2
  - span.yx-badge / span.yx-badge side by side 3.3px in td — Manager Sheet, Hr Sheet With Equity
- **Performance/Live · Improvement plans** (4 stories): columns 4
  - badge `span.yx-badge/` in ul.yx-lif-list: left edges spread 3px, right 14px over 3 rows — Manager View, Employee To Acknowledge, Hr Paused With Warning +1
- **Performance/Live · Set-up** (1 stories): touch 2
  - span.yx-badge / span.yx-badge side by side 3.3px in td — Templates (one draft not ready)
- **Performance/PRF-01 · Performance home** (3 stories): columns 8 · wrap 1
  - value `div.yx-actions__main/div.yx-actions__meta/span.yx-actions__due/` in ul.yx-actions__list: left edges spread 51px, right 43px over 4 rows — Manager, Manager · phone
  - button `div.yx-actions__buttons/button.yx-button/` in ul.yx-actions__list: left edges spread 112px, right 112px over 4 rows — Manager, HR admin
  - button `button.yx-button/` in ul.yx-coach__list: left edges spread 55px, right 55px over 4 rows — Manager
  - value `div.yx-actions__main/div.yx-actions__meta/span.yx-actions__due/` in ul.yx-actions__list: left edges spread 63px, right 71px over 4 rows — HR admin
  - …and 3 more distinct items
- **Performance/PRF-04 · Cycle set-up and control room** (2 stories): columns 2
  - badge `span.yx-badge/` in ul.yx-growth-list: left edges spread 5px, right 5px over 3 rows — Control room · clickable funnel, Control room · names behind a stage
- **Performance/PRF-05 · Review workspace** (4 stories): columns 8
  - value `div.yx-growth-stack.yx-growth-grow/div.yx-growth-row/span.yx-growth-meta/` in ul.yx-growth-list: left edges spread 369px, right 369px over 3 rows — Employee · self review, Section without goals excluded, Manager · manager review with advisory peer panel +1
  - value `div.yx-growth-stack.yx-growth-grow/span.yx-growth-list__title/span.yx-growth-meta/` in ul.yx-growth-list: left edges spread 34px, right 34px over 3 rows — Employee · self review, Section without goals excluded, Manager · manager review with advisory peer panel +1
- **Performance/PRF-08 · Quick feedback** (4 stories): columns 6
  - value `div.yx-growth-list__main/span.yx-growth-meta/` in ul.yx-growth-list: left edges spread 62px, right 27px over 3 rows — Received, Give feedback sheet
  - value `div.yx-growth-list__main/span.yx-growth-meta/` in ul.yx-growth-list: left edges spread 62px, right 64px over 3 rows — Phone, Phone · give feedback
  - badge `span.yx-badge/` in ul.yx-growth-list: left edges spread 324px, right 297px over 3 rows — Phone, Phone · give feedback
- **Performance/PRF-09 · Calibration board and 9-box** (4 stories): touch 3 · wrap 5
  - span.yx-growth-meta / span.yx-badge stacked 2px in div.yx-growth-list__main — HR · ratings board with guide, HR · change rating with reason, Manager · own team movable
  - heading "1 · Needs improvement" on 2 lines (142px) at div.yx-growth-row > h3.yx-growth-h — HR · ratings board with guide, Manager · own team movable
  - badge "Protected leave · not counted" on 2 lines (142px) at div.yx-growth-list__main > span.yx-badge — HR · ratings board with guide, Manager · own team movable
  - date "28 Sep 2026" on 2 lines (96px) at tr > td — Changes log
- **Performance/PRF-11 · 1:1s** (3 stories): wrap 6
  - button "Agenda items" on 2 lines (84px) at div.yx-table__th > button.yx-table__sort — Manager · list, Empty, Loading
  - button "Open actions" on 2 lines (84px) at div.yx-table__th > button.yx-table__sort — Manager · list, Empty, Loading
- **Performance/PRF-12 · PIP record** (6 stories): columns 6
  - badge `div.yx-approval__body/p.yx-approval__head/span.yx-approval__status/` in ol.yx-approval: left edges spread 124px, right 124px over 3 rows — Manager · active plan, Manager · check-ins, Manager · record outcome +2
  - badge `div.yx-approval__body/p.yx-approval__head/span.yx-approval__status/` in ol.yx-approval: left edges spread 87px, right 64px over 3 rows — HR · approve proposed plan
- **Performance/PRF-15 · Dispute escalation and evidence export** (4 stories): columns 4
  - badge `div.yx-approval__body/p.yx-approval__head/span.yx-approval__status/` in ol.yx-approval: left edges spread 78px, right 89px over 5 rows — Employee · escalation raised, HR · dispute record with legal hold, HR · exported +1
- **Performance/PRF-16 · Manager coach and 1:1 agenda** (1 stories): columns 2
  - button `button.yx-button/` in ul.yx-coach__list: left edges spread 29px, right 44px over 4 rows — Coach card · phone
  - button `button.yx-button/` in ul.yx-coach__list: left edges spread 310px, right 310px over 4 rows — Coach card · phone
- **Performance/PRF-17 · Review assistant and bias check** (5 stories): columns 10
  - value `div.yx-growth-stack.yx-growth-grow/div.yx-growth-row/span.yx-growth-meta/` in ul.yx-growth-list: left edges spread 369px, right 369px over 3 rows — Help me draft, Draft suggested, Bias flags with Accept or Ignore +2
  - value `div.yx-growth-stack.yx-growth-grow/span.yx-growth-list__title/span.yx-growth-meta/` in ul.yx-growth-list: left edges spread 34px, right 34px over 3 rows — Help me draft, Draft suggested, Bias flags with Accept or Ignore +2
- **Platform/Customisation** (6 stories): wrap 9 · mid-word 1
  - heading "Canteen / transport pass" on 2 lines (150px) at div.yx-plt-tile__head > h3.yx-plt-tile__title — PLT-22 · Object builder · starters
  - button "Canteen pass number" on 2 lines (158px) at div.yx-plt-stack > button.yx-plt-palette-field — PLT-23 · Layout builder · mobile preview as employee, PLT-23 · Layout builder · canvas (desk preview), PLT-23 · Layout builder · locked field can’t be hidden
  - button "Emergency contact 2" on 2 lines (158px) at div.yx-plt-stack > button.yx-plt-palette-field — PLT-23 · Layout builder · mobile preview as employee, PLT-23 · Layout builder · canvas (desk preview), PLT-23 · Layout builder · locked field can’t be hidden
  - "XXXXXX234F" broken mid-word (82px) at dd.yx-dl__value > span.yx-dl__text — PLT-23 · Layout builder · mobile preview as employee
  - …and 2 more distinct items
- **Platform/Governance & rules** (2 stories): wrap 2
  - heading "Setu Implementation Partners" on 2 lines (190px) at div.yx-plt-tile__head > h3.yx-plt-tile__title — PLT-30 · Partners · directory & link request
  - badge "Kaveri Foods Pvt Ltd (Tamil Nadu)" on 2 lines (146px) at span.yx-plt-chips > span.yx-badge — PLT-31 · Policies page (Time & Leave)
- **Platform/Inbox & requests** (13 stories): touch 5 · columns 5 · wrap 20
  - li.yx-plt-notif / li.yx-plt-notif stacked 0px in ul.yx-plt-notifs — PLT-03 · Notifications inbox, PLT-03 · Notifications · Approvals category, PLT-03 · Notifications · phone
  - button `div.yx-plt-notif__actions/button.yx-button/` in ul.yx-plt-notifs: left edges spread 224px, right 152px over 3 rows — PLT-03 · Notifications inbox
  - badge "Within policy" on 2 lines (85px) at td > span.yx-badge — PLT-04 · Approvals · delegated to me, PLT-04 · Approvals · waiting for me, PLT-04 · Approvals · bulk blocked (high risk selected)
  - badge "Bank change" on 2 lines (80px) at td > span.yx-badge — PLT-04 · Approvals · waiting for me, PLT-04 · Approvals · bulk blocked (high risk selected)
  - …and 5 more distinct items
- **Platform/Integrations, audit & billing** (9 stories): wrap 32
  - heading "Hosur plant biometric devices" on 2 lines (179px) at div.yx-plt-tile__head > h3.yx-plt-tile__title — PLT-14 · Integrations · catalogue & health
  - heading "Hosur plant biometric devices" on 2 lines (143px) at div.yx-plt-tile__head > h3.yx-plt-tile__title — PLT-14 · Integrations · catalogue & health
  - heading "Salary bank file (host-to-host)" on 2 lines (130px) at div.yx-plt-tile__head > h3.yx-plt-tile__title — PLT-14 · Integrations · catalogue & health
  - badge "Needs changes · 3 components need a ledg" on 2 lines (236px) at span.yx-stepper__text > span.yx-stepper__status — PLT-14 · Integrations · connect wizard, PLT-14 · Integrations · connect wizard ledger mapping
  - …and 17 more distinct items
- **Platform/PLT-33…37, 44 · Rules** (1 stories): wrap 2
  - date "29 Sep 2026, 8:40 am" on 2 lines (135px) at tr > td — PLT-35 · Automation · failure queue (retry / skip)
  - date "28 Sep 2026, 5:02 pm" on 2 lines (135px) at tr > td — PLT-35 · Automation · failure queue (retry / skip)
- **Platform/PLT-38…43, 50…54 · Jobs, trial & account** (7 stories): columns 5 · wrap 4
  - badge "Integration delivery" on 2 lines (125px) at td > span.yx-badge — PLT-38 · Jobs & errors · System Admin (all, escalated), PLT-38 · Jobs & errors · payroll admin
  - badge `span.yxp-row/span.yx-badge/` in ol.yxp-feed: left edges spread 14px, right 11px over 3 rows — PLT-50 · What’s new · HR admin
  - badge `div.yxp-check__body/span.yxp-row/span.yx-badge/` in ol.yxp-plain: left edges spread 37px, right 91px over 4 rows — PLT-54 · Payout readiness · mandate pending (grace run), KYB pending
  - badge `div.yxp-check__body/span.yxp-row/span.yx-badge/` in ol.yxp-plain: left edges spread 37px, right 27px over 4 rows — PLT-54 · Payout readiness · balance short, partial payout
  - …and 1 more distinct items
- **Platform/PLT-45…49 · Regions, copilot & EOR** (5 stories): wrap 15
  - button "Feature and version" on 2 lines (123px) at div.yx-table__th > button.yx-table__sort — PLT-48 · Agent actions log · System Admin (undo)
  - date "29 Sep 2026, 9:12 am" on 2 lines (147px) at tr > td — PLT-48 · Agent actions log · System Admin (undo)
  - date "29 Sep 2026, 8:50 am" on 2 lines (147px) at tr > td — PLT-48 · Agent actions log · System Admin (undo)
  - date "28 Sep 2026, 5:30 pm" on 2 lines (147px) at tr > td — PLT-48 · Agent actions log · System Admin (undo)
  - …and 8 more distinct items
- **Platform/PLT-55…64 · Workflow Studio & assistant** (13 stories): touch 4 · columns 1 · wrap 18 · overflow 4
  - span.yx-node__port-label / button.yx-button.yx-node__add side by side 4px in div.yx-node__port — PLT-55 · Studio canvas, PLT-55 · Studio · paused by kill switch, PLT-62 · AI build panel · draft with explanation and preview +1
  - container-scroll-x 276px at div.yx-builder__stage > div.yx-builder__viewport — PLT-55 · Studio canvas, PLT-55 · Studio · paused by kill switch
  - badge "Waiting for approval" on 2 lines (123px) at td > span.yx-badge — PLT-58 · Versions · owner (diff, re-publish)
  - badge "Waiting for approval" on 2 lines (118px) at td > span.yx-badge — PLT-58 · Versions · second approver
  - …and 9 more distinct items
- **Platform/Set-up & administration** (4 stories): touch 2 · columns 1 · wrap 4 · mid-word 1
  - button `button.yx-button/` in ul.yx-plt-list: left edges spread 60px, right 60px over 4 rows — PLT-11 · Roles & access · who has this role
  - span.yx-editor__merge / span.yx-editor__merge stacked 4px in p — PLT-13 · Notification settings · template editor, PLT-13 · Notification settings · test sent
  - date "29 Sep 2026, 9:12 am" on 2 lines (157px) at tr > td — PLT-13 · Notification settings · delivery log
  - date "29 Sep 2026, 7:05 am" on 2 lines (157px) at tr > td — PLT-13 · Notification settings · delivery log
  - …and 2 more distinct items
- **Platform/Shell & homes** (21 stories): touch 14 · columns 14 · wrap 3
  - div.yx-palette__empty / div.yx-palette__foot stacked 0px in div — PLT-01 · App shell · search waiting for the server, PLT-20 · Command palette · no results
  - kbd.yx-kbd / kbd.yx-kbd side by side 2.8px in span — PLT-01 · App shell · search waiting for the server, PLT-20 · Command palette · @ people, PLT-20 · Command palette · recent and actions +4
  - button `div.yx-actions__buttons/button.yx-button/` in ul.yx-actions__list: left edges spread 112px, right 112px over 4 rows — PLT-02 · Role home · manager, PLT-02 · Role home · manager, live, PLT-02 · Role home · manager, live, Nudge sent +1
  - badge `span.yx-plt-row/span.yx-badge/` in ul.yx-plt-list: left edges spread 236px, right 212px over 3 rows — PLT-02 · Role home · HR, PLT-02 · Role home · customising widgets
  - …and 9 more distinct items
- **Portals/T9-01 · Pre-boarding portal** (5 stories): columns 9
  - badge `span.yx-badge/` in ul.yx-ps-list: left edges spread 71px, right 70px over 5 rows — Checklist, Checklist · campus joining batch, Checklist · phone +1
  - badge `span.yx-badge/` in ul.yx-ps-list: left edges spread 82px, right 70px over 5 rows — Checklist, Checklist · campus joining batch, Checklist · phone +1
  - badge `div.yx-choice/div.yx-choice__text/label/span.yx-badge/` in ul.yx-consent__list: left edges spread 173px, right 169px over 4 rows — Background verification consent
- **Portals/T9-04 · POSH IC external member portal** (5 stories): columns 5
  - badge `span.yx-badge/` in ul.yx-ps-list: left edges spread 98px, right 70px over 4 rows — Appointed cases, First sign-in · confidentiality undertaking
  - badge `div.yx-approval__body/p.yx-approval__head/span.yx-approval__status/` in ol.yx-approval: left edges spread 73px, right 68px over 7 rows — Case detail
  - badge `div.yx-approval__body/p.yx-approval__head/span.yx-approval__status/` in ol.yx-approval: left edges spread 73px, right 88px over 7 rows — Case past the 90-day limit
  - badge `div.yx-approval__body/p.yx-approval__head/span.yx-approval__status/` in ol.yx-approval: left edges spread 283px, right 283px over 5 rows — External party · case status
- **Portals/T9-05 · Audit-committee chair portal** (2 stories): columns 2
  - badge `span.yx-badge/` in ul.yx-ps-list: left edges spread 163px, right 49px over 4 rows — Cases routed to the chair, Cases · phone
- **Portals/T9-06 · Client portal** (4 stories): columns 7
  - badge `span.yx-badge/` in ul.yx-ps-list: left edges spread 189px, right 212px over 5 rows — Submissions, Submissions · reject with feedback, Submissions · phone
  - button `button.yx-button/` in ul.yx-ps-list: left edges spread 212px, right 212px over 5 rows — Submissions, Submissions · reject with feedback, Submissions · phone
  - badge `span.yx-badge/` in ul.yx-ps-list: left edges spread 241px, right 212px over 4 rows — Timesheets · approve (incl. vendor workers)
- **Portals/T9-09 · Careers site** (3 stories): touch 12
  - h3.yx-careers__job-title / ul.yx-careers__job-meta stacked 4px in div.yx-careers__job-main — Careers home, Careers home · phone, Careers home · white-label
- **Portals/T9-12 · Staffing vendor portal** (1 stories): columns 1
  - badge `span.yx-badge/` in ul.yx-ps-list: left edges spread 97px, right 96px over 4 rows — Account not active yet
- **Portals/T9-13 · Contract-labour vendor portal** (2 stories): columns 2
  - badge `span.yx-badge/` in ul.yx-ps-list: left edges spread 136px, right 110px over 6 rows — Monthly pack · short challan, Monthly pack · phone
- **Portals/T9-14 · Visitor invite page** (1 stories): columns 1
  - badge `div.yx-choice/div.yx-choice__text/label/span.yx-badge/` in ul.yx-consent__list: left edges spread 96px, right 96px over 3 rows — Privacy notice, induction and NDA
- **Portals/T9-19 · Alternative process and deletion request** (1 stories): columns 1
  - badge `div.yx-approval__body/p.yx-approval__head/span.yx-approval__status/` in ol.yx-approval: left edges spread 84px, right 119px over 3 rows — Received · complete-by date
- **Proctoring/Kit · Proctoring building blocks** (1 stories): columns 1
  - badge `div.yx-syscheck__main/div.yx-syscheck__head/span.yx-badge/` in ul.yx-syscheck: left edges spread 128px, right 122px over 8 rows — System check rows
- **Proctoring/PRC-02 · Question editor** (8 stories): columns 1 · overflow 14
  - container-scroll-x 28px at div.yx-prc-block__body > pre.yx-anl-formula — Default, Major edit creates a new version, Duplicate blocks approval +4
  - badge `span.yx-badge/` in ul.yx-prc-plain: left edges spread 39px, right 82px over 4 rows — Translations
- **Proctoring/PRC-04 · Test builder** (1 stories): columns 1
  - badge `span.yx-badge/` in ul.yx-prc-plain: left edges spread 43px, right 43px over 4 rows — Template library
- **Proctoring/PRC-07 · Invitations and drives** (5 stories): wrap 10
  - button "Reminders sent" on 2 lines (75px) at div.yx-table__th > button.yx-table__sort — Invitations, Empty, Loading +1
  - date "28 Sep 2026, 9:00 am IST" on 2 lines (182px) at tr > td — Invitations
  - badge "Under review" on 2 lines (83px) at td > span.yx-badge — Invitations
  - date "29 Sep 2026, 1:00 pm IST" on 2 lines (182px) at tr > td — Invitations
  - …and 3 more distinct items
- **Proctoring/PRC-08 · Slot calendar** (3 stories): wrap 4
  - badge "Short of proctors" on 2 lines (82px) at button.yx-prc-slot > span.yx-badge — Centre slot selected, Full slot, Short of proctors
- **Proctoring/PRC-09 · Drive capacity planner** (3 stories): columns 3
  - badge `span.yx-badge/` in ul.yx-prc-plain: left edges spread 453px, right 453px over 4 rows — Draft plan, 3 waves, Wave over capacity (blocked), Approved
- **Proctoring/PRC-11 · Accommodation review queue** (2 stories): wrap 2
  - badge "More information requested" on 2 lines (153px) at td > span.yx-badge — Queue, HR / L&D (employee test-takers)
- **Proctoring/PRC-15 · Company audit view** (1 stories): wrap 10
  - date "28 Sep, 9:02 am" on 2 lines (112px) at tr > td — Grouped by slot
  - date "Mon 28 Sep, 9:00 am" on 2 lines (144px) at tr > td — Grouped by slot
  - date "28 Sep, 9:26 am" on 2 lines (112px) at tr > td — Grouped by slot
  - date "28 Sep, 9:40 am" on 2 lines (112px) at tr > td — Grouped by slot
  - …and 2 more distinct items
- **Proctoring/PRC-16 · Integrity review queue** (1 stories): wrap 2
  - button "Open (high / medium / low)" on 2 lines (144px) at div.yx-table__th > button.yx-table__sort — Reviewer capacity and SLA
  - badge "On leave from 1 Oct" on 2 lines (109px) at td > span.yx-badge — Reviewer capacity and SLA
- **Proctoring/PRC-19 · Evaluator console** (7 stories): touch 7
  - kbd.yx-kbd / kbd.yx-kbd side by side 3.1px in span.yx-prc-small.yx-prc-muted — Blind marking, not scored yet, Scored: AI suggestion revealed, Disagreement: moderation +4
- **Proctoring/PRC-22 · Readiness check and practice** (5 stories): columns 5
  - badge `div.yx-syscheck__main/div.yx-syscheck__head/span.yx-badge/` in ul.yx-syscheck: left edges spread 128px, right 122px over 8 rows — System check: fails with fix steps, System check · phone
  - badge `div.yx-syscheck__main/div.yx-syscheck__head/span.yx-badge/` in ul.yx-syscheck: left edges spread 128px, right 170px over 8 rows — System check running
  - badge `span.yx-badge/` in ul.yx-prc-plain: left edges spread 260px, right 236px over 4 rows — Secure Client install and self-test
  - badge `div.yx-syscheck__main/div.yx-syscheck__head/span.yx-badge/` in ul.yx-syscheck: left edges spread 128px, right 128px over 8 rows — All passed: practice test
- **Proctoring/PRC-26 · Test runner** (9 stories): touch 9
  - p.yx-proctor-notice / div.yx-exam__body stacked 0px in div.yx-exam — Multiple choice with sections, Coding question, Descriptive answer +6
- **Proctoring/PRC-29 · Campus drive kit** (1 stories): wrap 3
  - badge "Not eligible: CGPA below 6.5" on 2 lines (171px) at td > span.yx-badge — Registrants with dedupe
  - badge "Matched: same email, new roll number" on 2 lines (198px) at td > span.yx-badge — Registrants with dedupe
- **Proctoring/PRC-31 · Candidate app** (1 stories): columns 1
  - badge `div.yx-syscheck__main/div.yx-syscheck__head/span.yx-badge/` in ul.yx-syscheck: left edges spread 33px, right 39px over 4 rows — Readiness · phone
- **Projects/PRJ-01 · Projects and project workspace** (1 stories): columns 1
  - badge `span.yx-badge/` in ul.yx-hire-list: left edges spread 124px, right 127px over 3 rows — Workspace · fixed fee, tasks and milestones (over budget)
- **Projects/PRJ-07 · Bench board and resource requests** (1 stories): wrap 2
  - date "1 Nov 2026 – 30 Apr 2027" on 2 lines (147px) at tr > td — Resource manager · requests
  - date "5 Oct 2026 – 31 Mar 2027" on 2 lines (147px) at tr > td — Resource manager · requests
- **Security/Admin** (3 stories): columns 1 · wrap 8
  - date "29 Sep 2026, 10:58 AM" on 2 lines (154px) at tr > td — Login activity · signed in now, Login activity · signed in now · phone
  - date "29 Sep 2026, 8:10 AM" on 2 lines (154px) at tr > td — Login activity · signed in now, Login activity · signed in now · phone
  - date "29 Sep 2026, 10:59 AM" on 2 lines (154px) at tr > td — Login activity · signed in now, Login activity · signed in now · phone
  - date "29 Sep 2026, 10:20 AM" on 2 lines (154px) at tr > td — Login activity · signed in now, Login activity · signed in now · phone
  - …and 1 more distinct items
- **Service desk/Batch 4 standalone and privacy** (1 stories): columns 1
  - badge `span.yx-ops-row/span.yx-badge/` in ul.yx-ops-list: left edges spread 3px, right 4px over 5 rows — Get Started
- **Service desk/HLP-04 Knowledge** (3 stories): touch 3
  - li.yx-ops-list__item / li.yx-ops-list__item stacked 0px in ul.yx-ops-list — SD-1.24 Spaces and articles, SD-1.24 Article editor with review, SD-1.24 Article editor · author only
- **Service desk/Phase 3b-1 (wired screens)** (5 stories): touch 2 · columns 1 · wrap 1 · overflow 1
  - badge "Waiting on requester" on 2 lines (125px) at td > span.yx-badge — HLP-02 Agent desk · list
  - container-scroll-x 178px at div.yx-kanban-wrap > div.yx-kanban — HLP-02 Agent desk · board
  - li.yx-ops-list__item / li.yx-ops-list__item stacked 0px in ul.yx-ops-list — Desk set-up, SD-1.22 Customers
  - badge `span.yx-ops-list__main/span.yx-ops-row/span.yx-badge/` in ol.yx-ops-list: left edges spread 87px, right 93px over 3 rows — SD-1.18 Email (desk set-up tab)
- **Settings/Group 1 · Organisation** (2 stories): wrap 12
  - badge "On file" on 2 lines (43px) at td > span.yx-badge — 1.2 Legal entities
  - badge "On file" on 2 lines (45px) at td > span.yx-badge — 1.2 Legal entities
  - badge "On file" on 2 lines (47px) at td > span.yx-badge — 1.2 Legal entities · read-only
  - badge "On file" on 2 lines (48px) at td > span.yx-badge — 1.2 Legal entities · read-only
- **Settings/Group 7 · Integrations & Developers** (2 stories): wrap 5
  - date "26 Sep 2026, 11:02 am" on 2 lines (157px) at tr > td — 7.1 Integrations
  - date "31 Mar 2027" on 2 lines (95px) at tr > td — 7.7 Developers
  - date "30 Jun 2027" on 2 lines (95px) at tr > td — 7.7 Developers
  - date "31 Dec 2026" on 2 lines (95px) at tr > td — 7.7 Developers
  - …and 1 more distinct items
- **Settings/Settings home and page states** (1 stories): columns 1
  - badge `a.yx-set-result/span.yx-set-result__label/span.yx-badge/` in ul.yx-set-results__list: left edges spread 68px, right 68px over 4 rows — Settings home · search "late coming"
- **Time/TIM-01 · Today board** (1 stories): columns 1
  - badge `span.yx-tim-list__main/span.yx-tim-row/span.yx-badge/` in ul.yx-tim-list: left edges spread 122px, right 27px over 7 rows — Phone · Team today
- **Time/TIM-02 · Muster** (8 stories): overflow 8
  - container-scroll-x 770px at div.yx-screen > div.yx-tim-muster — Open month, Cell → day card, Freeze inputs +3
  - container-scroll-x 811px at div.yx-screen > div.yx-tim-muster — Lock · typed confirmation (August), Locked (August)
- **Time/TIM-04 · Attendance exceptions** (3 stories): columns 1 · wrap 2
  - button "Reminders sent" on 2 lines (81px) at div.yx-table__th > button.yx-table__sort — Loading, Error
  - badge `span.yx-tim-list__main/span.yx-tim-row/span.yx-badge/` in ul.yx-tim-list: left edges spread 65px, right 65px over 3 rows — Phone · manager
- **Time/TIM-05 · Roster** (4 stories): touch 8
  - span.yx-roster__block / span.yx-roster__warn stacked 2px in div.yx-roster__cell — Manager · draft with conflicts, Copy last week, Swap shifts +1
- **Time/TIM-08 · Shift change or swap** (1 stories): columns 1
  - button `button.yx-button/` in ul.yx-tim-list: left edges spread 278px, right 278px over 4 rows — Phone · request
- **Time/TIM-09 · OT review** (3 stories): touch 6
  - span.yx-badge / span.yx-tim-muted stacked 2px in span.yx-tim-list__main — Plant head · over the legal limit, HR, HR · override limit with reason
- **Time/TIM-11 · Periods** (2 stories): columns 2
  - badge `span.yx-tim-row/span.yx-badge/` in ul.yx-tim-check: left edges spread 189px, right 168px over 7 rows — Pre-lock checklist · blocked
  - badge `span.yx-tim-row/span.yx-badge/` in ul.yx-tim-check: left edges spread 199px, right 168px over 7 rows — October · month not over
- **Time/TIM-14 · Devices and kiosks** (1 stories): mid-word 4
  - "Attendance" broken mid-word (88px) at tr > td — System Admin
- **Time/TIM-15 · Timesheets** (5 stories): overflow 5
  - container-scroll-x 107px at div.yx-ts > div.yx-ts__scroll — Desk · weekly grid
  - container-scroll-x 25px at div.yx-ts > div.yx-ts__scroll — Submitted · last week, Approved · last week
  - container-scroll-x 165px at div.yx-ts > div.yx-ts__scroll — Sent back with reason · last week
  - container-scroll-x 15px at div.yx-ts > div.yx-ts__scroll — Locked · August week
- **Time/TIM-16 · Attendance reports** (7 stories): wrap 1 · overflow 6
  - container-scroll-x 7px at div.yx-table > div.yx-table__scroll — Late and early, Overtime, August 2026 (locked) +3
  - button "Night hours (7 pm–6 am)" on 2 lines (146px) at div.yx-table__th > button.yx-table__sort — Women night-shift register
- **Time/TIM-17 · Leave home** (2 stories): columns 2
  - button `span.yx-tim-row/button.yx-button/` in ul.yx-tim-list: left edges spread 113px, right 113px over 3 rows — Employee
  - button `span.yx-tim-row/button.yx-button/` in ul.yx-tim-list: left edges spread 287px, right 287px over 3 rows — Phone · employee
- **Time/TIM-19 · Leave request detail** (7 stories): columns 7
  - button `span.yx-tim-row/button.yx-button/` in ul.yx-tim-list: left edges spread 113px, right 113px over 3 rows — Employee · pending, Withdraw, Employee · approved +2
  - badge `span.yx-tim-list__main/span.yx-tim-row/span.yx-badge/` in ul.yx-tim-list: left edges spread 9px, right 16px over 3 rows — Manager · with team availability, Manager · approve
- **Time/TIM-20 · Team leave calendar** (2 stories): touch 2
  - h2.yx-cal__title / p.yx-teamcal__summary stacked 4px in div — Manager · people × days, HR · all teams
- **Time/TIM-23 · Optional holidays** (2 stories): columns 2
  - badge `div.yx-tim-row/span.yx-badge/` in ul.yx-tim-check: left edges spread 20px, right 17px over 3 rows — Choose 2 of 5, Phone
- **Time/TIM-32 · Field-force map** (6 stories): columns 6
  - button `span.yx-tim-row/button.yx-button/` in ul.yx-tim-list: left edges spread 133px, right 133px over 4 rows — Manager · live map, Person trail and visits, Integrity flag +2
  - button `span.yx-tim-row/button.yx-button/` in ul.yx-tim-list: left edges spread 133px, right 133px over 5 rows — HR · all field staff
- **Time/TIM-34 · Auto-roster** (3 stories): columns 3
  - button `span.yx-tim-row/button.yx-button/` in ul.yx-tim-list: left edges spread 32px, right 32px over 3 rows — Coverage and draft, Approved · publish, Unfilled slot explained
- **Time/TIM-38 · Standby and call-out** (1 stories): overflow 1
  - container-scroll-x 80px at section.yx-roster > div.yx-roster__scroll — After the shift is moved
- **Time/TIM-39 · Block-leave planner** (2 stories): columns 6
  - badge `span.yx-tim-row/span.yx-badge/` in ul.yx-tim-list: left edges spread 576px, right 551px over 4 rows — HR · compliance view, Access suspension confirmation
  - badge `span.yx-tim-row/span.yx-badge/` in ul.yx-tim-list: left edges spread 158px, right 183px over 3 rows — HR · compliance view, Access suspension confirmation
  - button `span.yx-tim-row/button.yx-button/` in ul.yx-tim-list: left edges spread 183px, right 237px over 3 rows — HR · compliance view, Access suspension confirmation
- **Time/TIM-41 · Hybrid office days** (1 stories): touch 10
  - strong / div.yx-segment stacked 2px in span.yx-tim-list__main — Phone · my office days
  - div.yx-segment / span.yx-tim-muted stacked 2px in span.yx-tim-list__main — Phone · my office days
  - strong / span.yx-badge stacked 2px in span.yx-tim-list__main — Phone · my office days
  - span.yx-badge / span.yx-tim-muted stacked 2px in span.yx-tim-list__main — Phone · my office days
- **Time/TIM-43 · Timesheet pre-fill from my tools** (3 stories): overflow 3
  - container-scroll-x 107px at div.yx-ts > div.yx-ts__scroll — Suggestions · rule and AI, Connect tools, No suggestions
- **YukthiX console/Platform console (step 3)** (2 stories): wrap 2
  - button "Employee records" on 2 lines (108px) at div.yx-table__th > button.yx-table__sort — Companies
  - badge "Waiting for the company" on 2 lines (149px) at td > span.yx-badge — Support sessions
- **YukthiX console/Support desk (SD-1.31)** (2 stories): wrap 2
  - date "8 Oct 2026, 12:30 pm" on 2 lines (121px) at dd.yx-dl__value > span.yx-dl__text — Ticket · access asked, Ticket · Priority Support
- **YukthiX console/YX-01 · Rule-set editor** (3 stories): wrap 2 · mid-word 3
  - date "21 Nov 2025" on 2 lines (100px) at tr > td — Rule sets list
  - "Calendar" broken mid-word (74px) at tr > td — Rule sets list
  - "gazette.karnataka.example" broken mid-word (146px) at dd.yx-dl__value > span.yx-dl__text — Slab editor · draft, Published version (locked)
- **YukthiX console/YX-02 · Golden-case runner and review** (2 stories): off-token 4
  - p.yx-ps-diff__del / p.yx-ps-diff__del stacked 14px in div — Review drawer (checker), Maker cannot review own change
  - p.yx-ps-diff__add / p.yx-ps-diff__add stacked 14px in div — Review drawer (checker), Maker cannot review own change
- **YukthiX console/YX-04 · Customer-success console and tenants** (2 stories): wrap 5
  - date "10 Mar 2025" on 2 lines (100px) at tr > td — Tenants list
  - date "14 Feb 2026" on 2 lines (100px) at tr > td — Tenants list
  - date "30 Oct 2023" on 2 lines (100px) at tr > td — Tenants list
  - button "30-day change" on 2 lines (78px) at div.yx-table__th > button.yx-table__sort — Tenant health
  - …and 1 more distinct items
- **YukthiX console/YX-06 · Partner verification** (2 stories): columns 4
  - badge `span.yx-badge/` in ul.yx-ps-list: left edges spread 37px, right 37px over 3 rows — Partner applications, Application review (ICAI pending)
  - badge `span.yx-badge/` in ul.yx-ps-list: left edges spread 37px, right 26px over 3 rows — Partner applications, Application review (ICAI pending)
- **YukthiX console/YX-08 · Partner directory moderation** (1 stories): columns 1
  - badge `span.yx-badge/` in ul.yx-ps-list: left edges spread 139px, right 168px over 3 rows — Reviews and complaints
- **YukthiX console/YX-09 · Product analytics** (1 stories): wrap 1
  - heading "Quick-start step completion (%)" on 2 lines (145px) at div.yx-chart__titles > h3.yx-heading.yx-chart__title — Product analytics
- **YukthiX console/YX-11 · Help-centre editor** (1 stories): wrap 1 · mid-word 2
  - badge "In review" on 2 lines (67px) at td > span.yx-badge — Help articles and no-result searches
  - "Employee" broken mid-word (83px) at tr > td — Help articles and no-result searches
  - "Candidate" broken mid-word (83px) at tr > td — Help articles and no-result searches
- **YukthiX console/YX-12 · Nudge and switch-on copy editor** (2 stories): columns 2
  - value `div.yx-ps-list__main/span.yx-ps-list__meta/` in ul.yx-ps-list: left edges spread 7px, right 40px over 5 rows — Trial nudges, Switch-on copy · approver is author
- **YukthiX console/YX-13 · Sales-assist queue** (2 stories): wrap 4
  - button "Set-up %" on 2 lines (62px) at div.yx-table__th > button.yx-table__sort — Sales-assist queue · empty
  - button "Set-up %" on 2 lines (60px) at div.yx-table__th > button.yx-table__sort — Sales-assist queue
  - badge "Due 5:00 pm" on 2 lines (85px) at td > span.yx-badge — Sales-assist queue
  - badge "Due 12:00 pm" on 2 lines (85px) at td > span.yx-badge — Sales-assist queue
- **YukthiX console/YX-14 · Export invoices, LUT and FIRC** (1 stories): columns 1
  - badge `span.yx-badge/` in ul.yx-ps-list: left edges spread 81px, right 75px over 3 rows — Receipts to match
- **YukthiX console/YX-16 · E-invoice log** (1 stories): wrap 1
  - button "Payload hash" on 2 lines (77px) at div.yx-table__th > button.yx-table__sort — E-invoice log
- **YukthiX console/YX-17 · Cost per tenant** (1 stories): wrap 2 · overflow 1
  - button "Gross margin" on 2 lines (76px) at div.yx-table__th > button.yx-table__sort — Cost per tenant
  - button "Cost share" on 2 lines (68px) at div.yx-table__th > button.yx-table__sort — Cost per tenant
  - container-scroll-x 4px at div.yx-table > div.yx-table__scroll — Cost per tenant
