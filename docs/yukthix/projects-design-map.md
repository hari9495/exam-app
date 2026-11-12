# YukthiX Projects: designs and what exists (audit)

This file checks, story by story, every design under `Screens/Projects/` against what is live, in the same shape as
`console-design-map.md`. Founder rules: never build a second, simpler version of a designed screen (make the designed
one live); every policy choice is a company setting with a default; build only from the design kit.

Status 12 Nov 2026 (branch `docs/yukthix-projects-map`, from `test/yukthix-main` at e3328e5a1). Audit only: nothing was
built.

## What is live today (plain English)

- **There is no Projects area.** No page under `apps/web` renders any of the ten Projects screens, there is no
  Projects menu, and all ten screens are on the `notLive` list of `packages/yx-ui/src/design-live-guard.known.json`
  (`hiring: ProjectsListScreen`, `ProjectWorkspaceScreen`, `TimesheetApprovalsScreen`, `TimesheetApprovalsPhone`,
  `CapacityBoardScreen`, `CostingMarginScreen`, `BillingWorkbenchScreen`, `TimesheetCorrectionScreen`,
  `BenchRequestsScreen`, `MappingRulesScreen`). There is no projects API beyond Time's basic timesheet projects.
- **But a lot of the plumbing is already live elsewhere:**
  - **Time has simple projects and weekly timesheets** (`apps/api/src/time/timesheet.service.ts`, "M02 §B7 basic
    timesheets ... no M12 project accounting"). A project is a code, name, project manager, billable flag and activity
    list (`timesheet_projects`). HR adds them in HR › Shifts set-up (`/yx/time/shifts-setup`, `POST|PUT /projects`, key
    `leave.settings.manage`). People fill a weekly grid at My timesheet (`/yx/time/timesheet`). A submitted week goes
    through the approvals engine to the project managers of its lines (all of them must approve), else the person's
    manager; nobody approves their own hours. Approved hours set the attendance day and feed payroll. Hours of a locked
    month never change.
  - **Timesheet pre-fill from work tools (TIM-43)** is live: people connect their own tools, suggestions are matched to a
    project by its code or name (`matchProject` in `time/providers/work-tools.ts`), behind the company setting
    `timesheet.tool_suggestions` (default off). There are no company mapping rules.
  - **The staffing desk** (`apps/api/src/staffing`, `/yx/staffing/*`, switched on by `staffing.desk.enabled`) has
    clients with GSTIN and state, rate cards, placements, weekly placement hours that the client approves in the client
    portal (`/yx/client/[org]`), tax invoices and credit notes on numbered series (CGST/SGST or IGST by place of supply),
    the e-invoice window (HIR-31: cancel and reissue), invoice PDF, receipts and collections, a Tally/Zoho accounting
    export, and a Bench page for people between placements.
  - **Time feeds staffing already:** when an own-payroll worker's timesheet is approved, the whole week becomes their
    placement's hours, waiting for the client (`staffing/hours-from-time.ts`, answer 497). This is where parked item 914
    sits (below).
  - **Cost rates exist.** Each finalised payroll writes every employee's monthly cost rate (employer cost / standard
    hours) to `employee_cost_rates` (`payroll/runs.service.ts` line 1270). Only payroll staff of the entity can read
    them (key `payroll.cost_rate.view`, and the database's `pay_guard` policy).
- **So:** 14 stories are "live (gap)" (the live app does part of the job with another screen), 37 are "design only,
  feature not built", 1 is a phone view. None is fully live, none is "wire design" (no projects API to wire to).

### Two designs duplicate live pages

| drawn here | already live | suggestion (keep one version) |
|---|---|---|
| PRJ-07 Bench board tab (`BenchRequestsScreen`, bench part) | Staffing desk › Bench (`/yx/staffing/bench`, `BenchBoardScreen`, `staffing_bench`, bench pay policy) | Keep the live Bench page and its records as the one bench. Add "allocated %" and "partly allocated" to `BenchBoardScreen` in the kit first. The PRJ-07 page keeps only its Resource requests tab and links to Bench (question 1417) |
| PRJ-05 Approve / Issued and PRJ-06 credit note (`BillingWorkbenchScreen`, `TimesheetCorrectionScreen`) | Staffing desk › Invoices and one invoice (`InvoicesScreen`, `InvoiceRecordScreen`, `staffing_invoices`, series, PDF, credit notes, portal, export) | One invoice engine and one Invoices list. Project billing makes drafts on the staffing invoice engine (the design itself says "the shared invoice engine"); the workbench's WIP and drafts steps are new, issued invoices open in the live invoice record (question 1414) |

Two more overlaps are not duplicates but must share data, never copy it:

- **Projects:** PRJ-01's project is Time's `timesheet_projects` grown up (client, billing model, budgets, status). There
  must be one project list, not a Time one and a Projects one (question 1402).
- **Clients:** a project's client is the staffing desk's client (one GSTIN, one portal contact list) (question 1403).

### Parked item 914 ("a client sees only their own project hours")

Answer 914 (`hiring-design-map.md`, approved 12 Nov 2026 in `contract-labour-design-map.md`): today the whole approved
week (all projects) becomes the placement's hours, so the client portal shows and approves hours the worker may have
spent on other clients' projects. The answer was "count only the client's project lines once Time projects are linked to
clients". Projects link to clients in slice **P-1**; the portal and the hours flow change in slice **P-2** (question 1408).

### Security facts that matter for Projects

- **Company isolation (RLS).** Every table this area builds on has forced row-level security with the company policy:
  `timesheet_projects`, `timesheets`, `timesheet_lines` (migration `20261023000000_time_leave_b2`, line 538, plus
  `portal_none` so a portal session reads none of them); `staffing_hours`, `staffing_invoices` and the rest of billing
  (`202617o0000005_staffing_3`, line 207); `staffing_bench` (`202617o0000004_staffing_2`). New tables (allocations,
  budgets, milestones, requests, mapping rules, project cost) must join the same loop, with the same policies.
- **The client portal** reads only the signed-in contact's client: `client-portal.service.ts` checks
  `h.clientId !== s.clientId` before approving hours. Project lines in the portal must keep that check per line.
- **Who sees cost and margin (pay data).** Individual cost rates are pay data: `employee_cost_rates` has the
  `pay_guard` policy (own rows, or payroll staff of the legal entity; no super-admin escape, migration
  `20261028000000_payroll_5c`, line 506). A project manager's session therefore cannot read them, which is right. The
  designs agree: HR sees no fee or margin (`HrList`); a PM sees project totals only, and a cost that would reveal one
  person's rate is hidden (`CostingMarginScreen`, "one person on the project in the month"); finance sees margin. So
  project cost must be worked out by a job that runs with payroll scope and stores only per-project, per-month totals,
  never per-person rates, and the small-number rule must be applied in the API, not the screen (question 1412). The
  existing `suppress(cells, min)` helper (`performance/calibration-rules.ts`) is the pattern for PRJ-03's small-team
  rule.
- **Staffing margins** today go only to account managers (`ats.staffing.manage`); finance has its own key
  (`ats.staffing.billing`). Projects needs its own keys (suggested: `projects.view`, `projects.manage` for PMs,
  `projects.finance` for cost, margin and billing, `projects.resource` for the resource manager).

Verdicts (the same words as the other maps): **live** · **live (gap)** (the live app does the job with another screen,
named in the note) · **wire design** (the API exists and the screen is not wired) · **design only, feature not built**
· **phone view, mobile app not built**.

## Counts (sub-pages = stories)

| | groups | live | live, gap | wire design | feature not built | phone view | stories |
|---|---|---|---|---|---|---|---|
| A. Projects and timesheets (PRJ-01, PRJ-02, PRJ-08) | 3 | 66 | 0 | 0 | 0 | 1 | 67 |
| B. Capacity and bench (PRJ-03, PRJ-07) | 2 | 20 | 0 | 0 | 0 | 0 | 20 |
| C. Cost and billing (PRJ-04 to PRJ-06) | 3 | 33 | 0 | 0 | 0 | 0 | 33 |
| **All A-C** | **8** | **119** | **0** | **0** | **0** | **1** | **120** |

Counted by script on 12 Nov 2026 on `docs/yukthix-projects-map` (the script is in the appendix; it prints "ok"). Recounted on 12 Nov 2026 on `feat/yukthix-projects-p1` after P-1: PRJ-01 has 30 stories (16 live-state stories added), 68 in all. Recounted after P-3 on `feat/yukthix-projects-p3`: PRJ-08 has 15 (10 live-state stories added), 78 in all. After the walk fixes and P-2 (`feat/yukthix-projects-p2`): PRJ-02 has 12 (5 live-state stories added), 86 in all. After P-4 (`feat/yukthix-projects-p4`): PRJ-03 8, PRJ-07 12, PRJ-01 and PRJ-02 one more each, 98 in all. After P-5 (`feat/yukthix-projects-p5`): PRJ-04 9, PRJ-01 three more, 105 in all. After P-6 (`feat/yukthix-projects-p6`): PRJ-05 13 and PRJ-06 11 (13 live-state stories added), 118 in all. On `feat/yukthix-ops-small` (founder 12 Nov): PRJ-01 two Billing-tab live stories, 120 in all; FinanceList, Billing and the redrawn PRJ-05 IssuedToday are live; only the phone view waits (the mobile app). There
are 52 stories in 8 files whose title starts `Screens/Projects/`: `packages/yx-ui/src/screens/hiring/prj-01-projects`
(14), `prj-02-timesheet-approvals` (7), `prj-03-capacity` (4), `prj-04-costing` (5), `prj-05-billing-workbench` (6),
`prj-06-timesheet-correction` (5), `prj-07-bench-requests` (6), `prj-08-mapping-rules` (5), all `.stories.tsx`. The
screens are in `screens/hiring/projects.tsx` and `projects-billing.tsx`. One story is a phone view (PRJ-02 `Phone`).

## 1. Live pages that do part of the job

| page | screen | API | what it covers |
|---|---|---|---|
| `/yx/time/shifts-setup` (HR) | `ShiftEditorScreen` (TIM-06), projects part | `POST /projects`, `PUT /projects/:id` (`leave.settings.manage`) | project code, name, PM, billable, activities |
| `/yx/time/timesheet` (everyone) | `TimesheetScreen` (TIM-15, TIM-43 drawer) | `GET|PUT /me/timesheet`, `POST /me/timesheet/submit`, `/tools…` | weekly hours per project and activity; pre-fill from tools |
| `/yx/approvals` | `ApprovalsInboxScreen` | approvals engine, `time.timesheet` (quick approve; PLT-04 bulk decide) | PM approves or rejects a whole week |
| `/yx/client/[org]` (client contact) | client portal, timesheets tab | `client-portal.service.ts` `timesheet()` | client approves or sends back a placement's week |
| `/yx/staffing/invoices`, `/yx/staffing/invoices/[id]` | `InvoicesScreen`, `CreateInvoicesSheet`, `InvoiceRecordScreen` | `billing.service.ts` `draft`, `issue`, `creditNote`, `reissue`, `pdfIn` | drafts from client-approved hours, GST split, issue, credit note, e-invoice window |
| `/yx/staffing/bench` | `BenchBoardScreen` | `staffing-work.service.ts` `addToBench`, `removeFromBench` | people between placements, days on bench against the bench policy |
| Settings › Company rules | `CompanySettingsPage` (settings registry) | `/settings` | the `timesheet.tool_suggestions` switch (I did not check which section lists it) |

## 2. Searches run for "not built" (12 Nov 2026, on `test/yukthix-main`)

- Kit screens in the web app: `grep -rlE "ProjectsListScreen|ProjectWorkspaceScreen|TimesheetApprovalsScreen|TimesheetApprovalsPhone|CapacityBoardScreen|CostingMarginScreen|BillingWorkbenchScreen|TimesheetCorrectionScreen|BenchRequestsScreen|MappingRulesScreen" apps/web`: **no hits**. In `packages/yx-ui/src` they appear only in their own files and in the guard's `notLive` list.
- Web routes: `ls apps/web/app/yx/(app)` has no `projects` folder; `grep -rn "yx/projects" apps/web/lib apps/web/app`: none; `apps/web/lib/yx-nav.ts` has no Projects menu (only "My timesheet").
- Prisma models (`apps/api/prisma/schema.prisma`, `^model \w*(Allocation|Milestone|ProjectTask|ResourceRequest|Skill|Utili|Wip|Retainer)`): only `CompanySkill` (the company's skill list) and `StaffingReceiptAllocation` (money against invoices). No allocation, budget, milestone, task, resource request, mapping rule or project cost table.
- Person skills: `@@map("…skill…")` gives only `company_skills`; `endorse|skill.?confirm|confirmed.?skill` in `apps/api/src`: none. Growth's `SkillsProfileScreen` and `TeamSkillsMatrixScreen` are on the `notLive` list. PRJ-07's "confirmed skill" match has no data to read.
- Expenses: `ExpenseLine` has no project field; `grep -rniE project apps/api/src/expenses`: none. PRJ-01's Expenses tab has no source.
- Capacity: `utilisation|utilization` in `apps/api/src`: none.
- Mapping rules: `matchProject` (code or name match) is the only matching; no rule table.
- Cost: `cost.?rate` gives `payroll/inputs.service.ts costRates` (payroll only) and the payroll role templates. No project cost.

## 3. Design groups, story by story

### A. Projects and timesheets (PRJ-01, PRJ-02, PRJ-08)

#### PRJ-01 · Projects and project workspace

| story (sub-page) | verdict | note |
|---|---|---|
| FinanceList · Finance · all projects with margin | live | P-1: `/yx/projects` (`ProjectsListScreen` live) shows fee to Projects finance; founder 12 Nov (after P-6): fee billed and margin too, from the stored totals only (issued project invoice lines less credit notes; the nightly job's cost and expenses); never to a project manager or anyone else (checked in the API) |
| PmList · PM · my projects | live | P-1: a project manager without a key sees only the projects they manage (`GET /projects`) |
| HrList · HR · no fee or margin | live | P-1: without Projects finance the list has no fee, cost or margin (answer 1412) |
| PmOverview · Workspace · PM overview, burn alert | live | P-1: `/yx/projects/[id]` hours budget bar and the burn alert at the company levels (1405); alerts to the PM and Projects finance by the hourly sweep |
| FinanceOverview · Workspace · finance overview with margin | live | P-5 (1412, 1413): cost to date from the nightly job against the cost budget, provisional until payroll is final; margin is on PRJ-04 (P-6, 1621: revenue is billed project revenue for every billing model) |
| Team · Workspace · team and allocations | live | P-1: allocations add, change and end; only allocated people book time (1404) |
| FixedFeeMilestones · Workspace · fixed fee, tasks and milestones (over budget) | live | P-1: tasks (Time activities) with used hours; milestones on fixed-fee projects, client acceptance per project (1420) |
| Timesheets · Workspace · timesheets with attendance mismatch | live | P-4 (answer 1541): `GET /projects/:id/timesheets`, each allocated person's week on the project against the allocation, their line decisions, and the whole week against attendance (an hour or more apart is flagged; pay never changes) |
| Billing · Workspace · billing, hours held for client approval | live | founder 12 Nov (after P-6): the workspace Billing tab (`GET /projects/billing/project/:id`) for Projects finance and account managers: unbilled work of every month, hours waiting for client approval, billed to date, and the project's draft and issued invoices, each opening in Staffing desk › Invoices (never a copy) |
| Expenses · Workspace · expenses | live | P-5 (1419): `GET /projects/:id/expenses`, submitted and approved lines naming the project, with re-billing |
| Closed · Workspace · closed project | live | P-1: closed status; no new time, team, tasks or milestones; reopen |
| Empty · Empty | live | P-1: the live list empty state |
| Loading · Loading | live | P-1: the live list loading state |
| Error · Error | live | P-1: the live list error state |
| LiveList · Live · list (Projects manage) | live | P-1 live state |
| LiveListFinance · Live · list (Projects finance, with fee) | live | P-1 live state (1412) |
| LiveListNoAccess · Live · no access (Request access) | live | The kit's `NoAccessState` with Request access (answers 946, 972; walk 12 Nov) |
| LiveListOff · Live · Projects switched off | live | Shown only to people who could otherwise open Projects (walk 12 Nov) |
| LiveListLongNames · Live · long codes and names (ellipsis) | live | Code and Project sized for 1278 px; a longer name ends in an ellipsis with the full text as its tooltip (walk 12 Nov) |
| LiveNewProject · Live · new project drawer | live | P-1: `ProjectDrawer`, starts as a draft |
| LiveWorkspace · Live · workspace overview with burn alert | live | P-1 live state |
| LiveTeam · Live · team and allocations | live | P-1 live state |
| LiveAllocate · Live · add allocation drawer | live | P-1: `AllocationDrawer`, overlaps refused by the API |
| LiveEdit · Live · edit details and budgets drawer | live | P-1: `ProjectDrawer` in edit |
| LiveTasks · Live · tasks | live | P-1 live state |
| LiveTaskDrawer · Live · add task drawer | live | P-1: `TaskDrawer`, at most 20 in use |
| LiveMilestones · Live · fixed fee milestones (client accepts) | live | P-1 live state (1420) |
| LiveMilestoneDrawer · Live · add milestone drawer | live | P-1: `MilestoneDrawer`, total at most 100% |
| LiveClosed · Live · closed project (read-only) | live | P-1 live state |
| LiveReader · Live · Projects view only (no edits) | live | P-1: `projects.view` reads; no actions |
| LiveLoading · Live · workspace loading | live | P-1 live state |
| LiveError · Live · workspace error | live | P-1 live state |
| LiveTimesheets · Live · timesheets this week, attendance check | live | P-4 live state (1541) |
| LiveCostFinance · Live · finance overview with cost against budget | live | P-5 live state |
| LiveCostPm · Live · project manager, cost totals (one month left out) | live | P-5 live state (1412) |
| LiveExpenses · Live · expenses tagged to the project | live | P-5 live state (1419) |
| LiveBilling · Live · billing, hours held for client approval | live | P-6 follow-up live state |
| LiveBillingEmpty · Live · billing, nothing to bill yet | live | P-6 follow-up live state |

#### PRJ-02 · Timesheet approvals

| story (sub-page) | verdict | note |
|---|---|---|
| ByProjectWeek · PM · grouped by project and week | live | P-2: `/yx/projects/approvals` (`TimesheetApprovalsScreen` live, `GET /time/line-approvals`): each approver sees only their own lines (the project manager; else the person's manager; else HR) and approves, reduces or rejects each with a reason the person sees (1406). P-4 (1541): each card flags the week against attendance |
| ClientApproval · Client approval after PM | live | P-2: a per-project "client approves the hours" (off by default); approved lines wait for the client in the client portal, line by line, only that client's own project lines (1408). A placed worker's week counts only that client's project lines (914, `hours-from-time.ts`) |
| BulkConfirm · Bulk approve within allocation | live | P-2: only lines within the person's allocation share (a setting, on by default, 1407); hours outside an allocation (1442) never in bulk |
| Empty · Empty · all caught up | live | P-2 live state |
| Loading · Loading | live | P-2 live state |
| Error · Error | live | P-2 live state |
| Phone · phone | phone view, mobile app not built | `TimesheetApprovalsPhone` (also `settings: MobileTimesheetApprovalsScreen` on `notLive`) |
| LiveByProject · Live · my lines by project and week | live | P-2 live state (a person over their allocation, one booked outside one) |
| LiveBulk · Live · bulk approve within allocation | live | P-2 live state |
| LiveEmpty · Live · all caught up | live | P-2 live state |
| LiveLoading · Live · loading | live | P-2 live state |
| LiveError · Live · error | live | P-2 live state |
| LiveMismatch · Live · timesheet against attendance | live | P-4 live state (1541) |

#### PRJ-08 · Timesheet mapping rules

| story (sub-page) | verdict | note |
|---|---|---|
| Rules · HR · rules by priority | live | P-3: `/yx/settings/projects/mapping-rules` (`MappingRulesScreen` live): company rules by priority, applied before the code/name match in TIM-43 pre-fill; Projects managers and System Admins only |
| Tested · Test against last week | live | P-3: the saved rules over the editor's own items from last week (raw activity stays the person's own; question 1502) |
| Edit · Edit rule | live | P-3: `MappingRuleDrawer`; never a closed project; tools are the live ones (work calendar, issue tracker, code host; question 1501) |
| PrefillOff · Pre-fill switched off | live | P-3: `timesheet.tool_suggestions` (off by default, 1409) on this page and on 3.11; only a System Admin switches it; off maps nothing |
| Empty · Empty · no rules | live | P-3: without rules a suggestion goes to a project only when its code or name is in the item; the AI suggestion is later (1410) |
| LiveRules · Live · rules by priority (one not applying) | live | P-3 live state |
| LiveTested · Live · tested against my last week | live | P-3 live state |
| LiveNotConnected · Live · test with no tools connected | live | P-3 live state |
| LiveAdd · Live · add rule drawer | live | P-3 live state |
| LiveEdit · Live · change rule drawer | live | P-3 live state |
| LivePrefillOff · Live · pre-fill off (System Admin) | live | P-3 live state |
| LiveManager · Live · Projects manager (pre-fill read-only) | live | P-3 live state |
| LiveEmpty · Live · no rules yet | live | P-3 live state |
| LiveNoAccess · Live · no access (Request access) | live | The kit's `NoAccessState` with Request access (walk 12 Nov) |
| LiveOff · Live · Projects switched off | live | Shown only to Projects managers and System Admins (walk 12 Nov) |
| LiveError · Live · error | live | P-3 live state |

### B. Capacity and bench (PRJ-03, PRJ-07)

#### PRJ-03 · Capacity and utilisation board

| story (sub-page) | verdict | note |
|---|---|---|
| Hr · HR · heatmap and utilisation vs target | live | P-4: `/yx/projects/capacity` (`CapacityBoardScreen` live, `GET /projects/capacity`): six weeks of allocated against available hours (weekdays less holidays and leave), last month's approved billable utilisation against the company target (1411, default 75%). The skill, role and location filters wait for skills (1418, question 1581) |
| Pm · PM · team of 7 | live | P-4: a project manager sees the people allocated to their projects |
| Suppressed · PM · small team suppressed | live | P-4: under the company limit (1411, default 5) per-person figures are hidden from the PM; Projects manage and resource (HR's view) always see them |
| Loading · Loading | live | P-4 live state |
| LiveHr · Live · HR view (Projects resource) | live | P-4 live state |
| LiveSuppressed · Live · PM, small team hidden | live | P-4 live state |
| LiveEmpty · Live · no one allocated | live | P-4 live state |
| LiveNoAccess · Live · no access | live | P-4 live state |

#### PRJ-07 · Bench board and resource requests

| story (sub-page) | verdict | note |
|---|---|---|
| Bench · Bench board with ageing | live | P-4 (1417): the one bench is Staffing desk › Bench (`BenchBoardScreen`), which now shows each person's project allocation and "Partly allocated" (kit first, HIR-17 `LiveBenchAllocated`); the live PRJ-07 page links there and draws no second bench |
| Requests · Resource manager · requests | live | P-4: `/yx/projects/requests` (`BenchRequestsScreen` live): a project's manager (or Projects manage) raises a request with a role, a share and dates; Projects resource or manage fill it |
| Match · Match · bench first, confirmed skill | live | P-4 (1418): people with at least the asked share free over the dates, bench first; the skill match waits for Growth's skills profile (question 1581) |
| NoMatch · Match · no one free | live | P-4 live state |
| Raise · PM · raise request | live | P-4: kit `RaiseDrawer` (role instead of the skills library until skills exist) |
| Empty · Empty requests | live | P-4 live state |
| LiveList · Live · resource requests (link to the one bench) | live | P-4 live state |
| LiveRaise · Live · raise request drawer | live | P-4 live state |
| LiveMatch · Live · people with free time, bench first | live | P-4 live state |
| LiveNoMatch · Live · no one has this much free time | live | P-4 live state |
| LivePm · Live · project manager (raises, cannot fill) | live | P-4 live state |
| LiveEmpty · Live · no requests | live | P-4 live state |

### C. Cost and billing (PRJ-04 to PRJ-06)

#### PRJ-04 · Project costing and margin

| story (sub-page) | verdict | note |
|---|---|---|
| Finance · Finance · provisional September | live | P-5: `/yx/projects/costs` (`CostingMarginScreen` live, `GET /projects/costs`): project totals from the nightly job (`project-cost`, payroll access; no session reads a rate), provisional on the last final rate until the month's payroll is final (1413), with approved project expenses (1419); revenue and margin for Projects finance only. P-6 (1621, 1622): revenue is billed revenue for every model (issued project invoice lines less credit notes, by invoice date); quarters (`?quarter=`) and the month's project cost journal (`GET /projects/costs/journal`, CSV, audited; "Export project cost journal") are built |
| Pm · PM · one-person project cost hidden | live | P-5 (1412): a project's manager sees totals for their projects; a month with fewer people than `projects.cost.min_people` (default 2) shows "Hidden"; checked in the API |
| Final · Finance · August final, NRP-WEB restated | live | P-5 (1413): when the month's payroll is final the job recomputes it, keeps the provisional total as "restated from" and audits it once |
| Empty · Empty | live | P-5 live state |
| Loading · Loading | live | P-5 live state |
| LiveFinance · Live · finance, one month restated | live | P-5 live state |
| LivePm · Live · project manager, totals only (small month hidden) | live | P-5 live state |
| LiveEmpty · Live · no costs this month | live | P-5 live state |
| LiveNoAccess · Live · no access | live | P-5 live state |

#### PRJ-05 · Billing workbench

| story (sub-page) | verdict | note |
|---|---|---|
| Wip · Finance · WIP by client, held items | live | P-6 (1414): `/yx/projects/billing` (`BillingWorkbenchScreen` live, `GET /projects/billing`): the month's unbilled project work for Projects finance: time-and-material hours at the project's bill rate (one row per person and project), fixed-fee milestones, the month's retainer, re-billed expenses (P-5); held items say why (client approval, client acceptance, no rate, fee or client) |
| Drafts · Draft invoices · CGST/SGST and IGST | live | P-6 (1414): `POST /projects/billing/drafts`: one staffing invoice per client (the one invoice engine: series, GST split by supplier state and place of supply), each line naming its project; `project_billings` records each item once (unique source), so nothing is billed twice; a deleted draft frees its work |
| Approve · Approve and issue · e-invoice window | live | P-6 (1415): the account manager approves before finance issues when the company switched it on (`projects.billing.am_approval`, default off); finance issues through the staffing engine (`issueIn`: next number, e-invoice state); the staffing desk's own Issue is held the same way |
| IssuedToday · Approve · drafts dated when issued; an old invoice cancelled and reissued | live | redrawn 12 Nov 2026 (founder) to what the app does: a draft takes today's date and the series' next number when issued ("Issued today"); an issued invoice past the 30-day window is cancelled and reissued (`reissue()`, "Cancel and reissue" on the invoice record) |
| Issued · Issued | live | P-6: the issued run (tiles per invoice) with "Open invoices" to Staffing desk › Invoices, the one invoice list; the PDF, client portal and Tally/Zoho export are the staffing engine's |
| Empty · Empty · nothing to bill | live | P-6 live state |
| LiveWip · Live · finance, unbilled work with held items | live | P-6 live state |
| LiveDrafts · Live · drafts, CGST/SGST and IGST | live | P-6 live state |
| LiveApprove · Live · account manager approval on, one waiting | live | P-6 live state (1415) |
| LiveApprover · Live · account manager approves | live | P-6 live state (1415): an account manager without Projects finance sees only the drafts |
| LiveIssued · Live · issued | live | P-6 live state |
| LiveEmpty · Live · nothing to bill | live | P-6 live state |
| LiveNoAccess · Live · no access | live | P-6 live state |

#### PRJ-06 · Timesheet correction and credit note

| story (sub-page) | verdict | note |
|---|---|---|
| CreditWithRecovery · PM · down 8 h, credit note and pay recovery | live | P-6 (1416): `/yx/projects/billing/correct` (`TimesheetCorrectionScreen` live, `POST /projects/billing/lines/:id/correct`): fewer billed hours make a credit note against the invoice (the staffing engine's `credit()`, never more than is left), worked out from the hours at the billed rate; pay recovery is a setting (`projects.correction.pay_recovery`, default none), recorded in hours (no rate leaves payroll). Projects finance corrects (question 1706) |
| CreditNoRecovery · Finance · credit note, policy none | live | P-6 (1416): the same, with no recovery |
| Supplementary · Up 4 h · supplementary invoice | live | P-6 (1416): more billed hours make a supplementary draft on the same series and client, in the workbench to issue |
| Locked · Period locked · adjustment line | live | P-6 (1416): a week in a frozen or locked month (`lockedDates`) is never changed: the correction is an adjustment counted in the current month by the cost job; an unbilled line bills at the corrected hours |
| Review · Review documents | live | P-6: before and after, the document, pay recovery, audit; the employee is told |
| LivePick · Live · choose the line | live | P-6 live state: a time-and-material project, a month, its approved lines with what was billed |
| LiveCredit · Live · down 8 h, credit note | live | P-6 live state |
| LiveRecovery · Live · credit note and pay recovery | live | P-6 live state |
| LiveSupplementary · Live · up 4 h, supplementary invoice | live | P-6 live state |
| LiveLocked · Live · month locked, adjustment | live | P-6 live state |
| LiveNoAccess · Live · no access | live | P-6 live state |

## 4. What can be reused, and what is missing

Reuse (never a second version):

- **Projects and timesheets:** `timesheet_projects`, `timesheets`, `timesheet_lines`, `TimesheetService` (save, submit,
  locked days, no self-approval), the approvals engine (`time.timesheet`, bulk decide), the day engine, TIM-43 pre-fill.
- **Clients, billing and portal:** `staffing_clients` (GSTIN, state, terms), invoice series, `StaffingBillingService`
  (draft, issue, credit note, reissue, PDF, receipts, Tally/Zoho export), the client portal and its sign-in.
- **Bench:** `staffing_bench`, `BenchBoardScreen`, the bench policy settings.
- **Cost:** `employee_cost_rates` (payroll scope), `suppress()`.
- **Settings:** the settings registry for every policy below.

Missing (to build): project fields (client, billing model, budgets, status), allocations, tasks and milestones, burn
alerts, line-level timesheet decisions with reasons, client approval for project lines, mapping rules, capacity and
utilisation, resource requests and matching, person skills (Growth), project cost and margin, project expenses, project
WIP and billing runs, timesheet correction after invoice, a Projects menu and keys.

## 5. Questions for the founder (before building)

1401. **Projects as an area.** *Suggested: a Projects menu (Projects, Timesheet approvals, Capacity, Costing, Billing,
      Resource requests), switched on per company by a setting `projects.enabled`, default off, like the staffing desk.*
1402. **One project list.** Time already has simple projects (code, name, manager, activities). *Suggested: grow those
      into the designed Projects (add client, billing model, budgets, dates, status); HR's project editor in Shifts
      set-up moves to Projects. Never two project lists.*
1403. **One client list.** *Suggested: a project's client is the staffing desk's client (same GSTIN, contacts and
      portal). The Clients page shows when Projects or the staffing desk is on.*
1404. **Who may book time.** *Suggested: only people allocated to a project can book time to it, as drawn. A company
      setting "only allocated people book time", default on.*
1405. **Burn alerts.** *Suggested: alerts to the PM and finance when hours or cost reach 80% and 100% of budget; both
      numbers are company settings with those defaults.*
1406. **Approving timesheets.** Today the whole week goes to every PM of it. *Suggested: each PM approves, reduces or
      rejects only their own project's lines, with a reason the person sees, on the designed Timesheet approvals page;
      the week is approved when every line is decided. The approvals inbox keeps a link to it.*
1407. **Bulk approve.** *Suggested: bulk approve only weeks within the person's allocation; a company setting, default
      on.*
1408. **Client approval and item 914.** *Suggested: a per-project choice "client approves hours", default off, through
      the existing client portal; the client sees and approves only their own project's lines. A placed worker's week
      then counts only the lines of that client's projects (914).*
1409. **Pre-fill default.** The design says the tool pre-fill starts on; live it starts off. *Suggested: keep off by
      default, because it reads people's own tools; companies switch it on in Settings › Time & Leave › Projects &
      timesheets.*
1410. **Mapping rules and AI.** *Suggested: company rules by priority (Jira, calendar, GitHub pattern to project and
      task), tested against last week's items anonymised; the person still reviews and submits. Leave the "AI
      suggestion" for items no rule matches for later; they show "Choose a project" as today.*
1411. **Capacity rules.** *Suggested: billable utilisation target 75% and the small-team limit 5 (fewer people: per
      person figures hidden from the PM, HR still sees them) as company settings with those defaults.*
1412. **Who sees cost and margin.** *Suggested: only people with a new Projects finance key see cost, fee and margin.
      PMs see project totals only, and a project with fewer than 2 people in a month shows no cost to the PM (a setting,
      default 2). HR sees no fee or margin. Nobody outside payroll ever sees a person's cost rate. Cost is worked out by
      a nightly job and stored as project totals only.*
1413. **Provisional cost.** *Suggested: before the month's payroll is final, use the person's last final cost rate and
      mark the month provisional; restate it when payroll is final, as drawn.*
1414. **One invoice engine.** *Suggested: project invoices use the staffing desk's invoice engine (series, numbers,
      GST, PDF, credit notes, client portal, Tally/Zoho export) and appear in the one Invoices list. The Billing
      workbench adds only the drawn steps the live pages lack: unbilled work by project, and drafts from it.*
1415. **Two approvals before issuing.** The design has account manager then finance; live has finance only.
      *Suggested: a company setting "account manager approves before finance issues", default off (as today); companies
      that want it switch it on.*
1416. **Correcting invoiced time.** *Suggested: fewer hours makes a credit note, more hours a supplementary invoice,
      both worked out from the hours; a locked month gets an adjustment line in the next open week. Pay recovery from
      the employee is a company setting, default "none".*
1417. **One bench.** *Suggested: keep the live Staffing desk › Bench page as the one bench; add "allocated %" and
      "partly allocated" to it (kit first). The PRJ-07 page keeps its Resource requests tab and links to Bench. The
      "over 30 days" warning uses the existing bench policy (maximum bench days), not a second setting.*
1418. **Skills for matching.** Nobody's skills are recorded today (Growth's skills profile is designed, not built).
      *Suggested: match on free capacity first (bench first); add the skill match when Growth's skills profile is
      built. No separate skills list in Projects.*
1419. **Project expenses.** *Suggested: an optional project (and "re-bill to client") on expense lines, so the Expenses
      tab and re-billing work; a company setting "project required on expenses of project staff", default off.*
1420. **Billing models.** *Suggested: time and material, fixed fee with milestones, retainer and non-billable, as
      drawn. A client accepting a milestone in the portal is a per-project choice, default off.*
1421. **Phone.** *Suggested: the phone approval screen waits for the mobile app.*

## 6. Build plan (slices, max 3 builders at once)

| slice | what | reuses | size | rough estimate |
|---|---|---|---|---|
| P-1 | Projects core: grow `timesheet_projects` (client, model, budgets, dates, status, closed), allocations, tasks and milestones, burn alerts, keys, menu, `projects.enabled`; PRJ-01 list and workspace (overview, team, tasks, closed) (1401 to 1405, 1420) | Time projects, staffing clients, settings registry | L | 8 days |
| P-2 | Timesheet approvals: line decisions with reasons, bulk within allocation, client approval of project lines in the portal and the 914 change to `hours-from-time.ts`; PRJ-02 desktop and PRJ-01 Timesheets tab with the attendance mismatch (1406 to 1408) | approvals engine, `TimesheetService`, day engine, client portal | M | 6 days |
| P-3 | Mapping rules: rule table, priority, test against last week, rules before `matchProject`; PRJ-08 (1409, 1410) | TIM-43 pre-fill | S | 3 days |
| P-4 | Capacity, bench and requests: PRJ-03 (available hours from Time, target, small-team rule), allocation % on the live Bench, resource requests and matching (1411, 1417, 1418) | Time expected hours, leave, holidays; `BenchBoardScreen`; `suppress()` | L | 8 days |
| P-5 | Cost and margin: nightly cost job with payroll scope, provisional and restated months, totals-only API, project expenses; PRJ-04 and the workspace finance overview and Expenses tab (1412, 1413, 1419) | `employee_cost_rates`, expenses | M | 7 days |
| P-6 | Billing and corrections: project WIP, drafts on the staffing invoice engine, the optional second approval, issued run; correction with credit note, supplementary invoice, adjustment line and pay recovery setting; PRJ-05, PRJ-06, workspace Billing tab (1414 to 1416) | `StaffingBillingService`, invoice record, portal, export | L | 10 days |

Order (at most three builders at once):

1. Wave 1: P-1 and P-3 (P-3 needs only Time projects). Two builders.
2. Wave 2: P-2, P-4 and P-5 together (each needs P-1's projects and allocations). Three builders.
3. Wave 3: P-6 (needs P-2's approved lines and P-5's cost). One or two builders.

Every slice draws any new state in the kit first, keeps RLS (new tables in the forced-RLS loop, `portal_none` where a
portal must not read), audits every write, and adds positive and negative tests and an e2e suite. The phone story waits
for the mobile app.

## 7. Total estimate

**42 builder-days of build** (8 + 6 + 3 + 8 + 7 + 10), about **50 builder-days with a 20% allowance** for the verify
pass, manual test write-ups and fixes. With three builders in the waves above it is about 8 + 8 + 10 = **26 working days
end to end (5 to 6 weeks)**, because P-1 and P-6 sit on the critical path.

Why not more: the hardest parts already exist and are reused, not rebuilt: weekly timesheets with locks and approvals,
clients and the client portal, the whole GST invoice engine with credit notes, the e-invoice window, PDF and export,
cost rates from payroll, and the bench. Why not less: there is no project model beyond a code and a name, so budgets,
allocations, milestones, WIP and cost all start from nothing, and cost needs careful pay-data handling.

Projects against Analytics: I did not read the Analytics map (it is being written on `docs/yukthix-analytics-map` and
has no total yet), so I cannot say which finishes first. Compare its total builder-days with the 50 here; also note
P-1 blocks most of Projects, so Projects cannot go faster than about 5 weeks even with more builders.

## Appendix: the count script

Run from the repo root (`node check.js` after saving the block). It recounts section 3 and fails unless every story of
every `Screens/Projects/` file has exactly one row, in file order, under the heading that is its title after the
prefix, with one of the five verdicts. Copied from `console-design-map.md`; only the prefix, the file and the section
heading differ.

```js
// Run from the repo root: node check.js. Recounts section 3 of docs/yukthix/projects-design-map.md and checks that every
// story under Screens/Projects/ has exactly one row, in file order. Reads the story files, not Storybook.
const fs = require('fs');
const path = require('path');
const PREFIX = 'Screens/Projects/';
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const want = {};
for (const f of walk('packages/yx-ui/src').filter((f) => f.endsWith('.stories.tsx'))) {
  const src = fs.readFileSync(f, 'utf8');
  const t = /title:\s*'([^']+)'/.exec(src)?.[1];
  // Capital first letter only: lower-case exports would be sample props.
  if (t?.startsWith(PREFIX)) want[t.slice(PREFIX.length)] = [...src.matchAll(/^export const ([A-Z]\w*)\s*(?::\s*[\w<>.]+)?\s*=/gm)].map((m) => m[1]);
}
const doc = fs.readFileSync('docs/yukthix/projects-design-map.md', 'utf8');
const s3 = doc.split('## 3. Design groups, story by story')[1].split(/^## /m)[0];
const V = ['live', 'live (gap)', 'wire design', 'design only, feature not built', 'phone view, mobile app not built'];
const errs = [], counts = {};
for (const sec of s3.split(/^### /m).slice(1)) {
  const name = sec.split('\n')[0].slice(0, 44), c = (counts[name] = { groups: 0, stories: 0, ...Object.fromEntries(V.map((v) => [v, 0])) });
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
counts['All A-C'] = all;
console.table(counts);
if (errs.length) { console.error(errs.join('\n')); process.exit(1); }
console.log('ok');
```

## Founder approved (12 Nov 2026, "ok for all, start both together")
1401 to 1421 approved as suggested. Build P-1 first, then P-3, then P-2, P-4 and P-5 together, then P-6 (at most 3 builders, shared with Settings).

## P-1 built (12 Nov 2026): questions for the founder

1441. **Companies that already keep Time's projects.** The migration switched Projects on for them (so HR keeps the
      project editor that moved out of Shifts set-up) and, because nobody is allocated yet, set "only allocated people
      book time" off for them; new companies get it on. *Suggested: keep; their System Admin turns the rule on in
      Settings › Projects & timesheets once teams are in.*
1442. **The booking rule's second choice.** The drawn 3.11 page offered "Allow with project manager approval"; P-1 has
      Block or Allow. *Suggested: keep the two choices; project manager approval of unallocated hours comes with P-2's
      line decisions if still wanted.*
1443. **Who changes Settings 3.11.** The design names a `projects.settings.manage` key. P-1 lets System Admins
      (`org.settings.manage`) change it and Projects managers read it. *Suggested: keep, no extra key.*
1444. **New projects billable by default.** The drawn page starts "New projects are billable" on, so the new-project
      form starts on Time & material and asks for a client. *Suggested: keep; make it a company setting with the
      other P-3 settings.*
1445. **Burn alerts on hours only.** P-1 has no cost, so alerts compare booked hours (submitted and approved weeks) with
      the hours budget, checked every hour. *Suggested: add the cost budget to the same alerts with P-4's nightly cost.*
1446. **Who sees a project without a key.** A person who neither holds a Projects key nor manages the project gets "not
      found" for it, not "no access", so its name is never confirmed. *Suggested: keep.*

- 1441 to 1446 approved as suggested (12 Nov 2026, "ok for all"). To build: manager approval of unallocated hours with P-2 (1442); the default billing model as a company setting in P-3 (1444); cost in burn alerts with P-4 (1445).
1441 to 1446 approved as suggested (12 Nov 2026); 1444 is built in P-3 (the billing model for new projects is a company setting, default Time & material).

## P-3 built (12 Nov 2026): questions for the founder

1501. **Tool names.** The design names Jira, GitHub and the calendar; no work-tool provider is chosen yet, so the rules
      say Work calendar, Issue tracker and Code host. *Suggested: keep the general names until a provider is chosen;
      then show its name.*
1502. **Test against last week.** The design tests on a sample employee's items, anonymised. P-3 tests on the editor's
      own items only, so nobody sees another person's activity. *Suggested: keep; it needs the editor to connect their
      own tools.*
1503. **A rule's project the person is not allocated to.** P-3 skips that rule and tries the next one (then the code or
      name match), so the person never gets a line they could not save. *Suggested: keep.*
1504. **Two rules with the same priority.** The older rule wins. *Suggested: keep, and show the order on the page as it
      is applied (it is).*
1505. **Rules while Projects is off.** Rules are kept but not used, and the page says Projects is off. *Suggested: keep.*
1506. **Billing model for new projects (1444).** Built in P-3 on Settings 3.11, default Time & material. An API call that
      leaves the model out uses the company's choice for a new project and keeps the project's own on a change.
      *Suggested: keep.*

- 1501 to 1506 approved as suggested (12 Nov 2026, "ok for all").
## P-2 built (12 Nov 2026): questions for the founder

1541. **Attendance mismatch on PRJ-02.** The design flags "timesheet 42 h vs attendance 40 h worked" on a card. P-2 does not
      compare them yet (nor the PRJ-01 Timesheets tab). *Suggested: add both in P-4 with the cost job, which reads the
      same days.*
1542. **A week with some lines rejected.** The week is approved when any hours are approved; rejected lines count as none
      and the person sees why. To book those hours again they correct next week or ask the manager. *Suggested: keep;
      an "adjustment line" for a closed week comes with P-6.*
1543. **Who approves a line with no project manager.** The person's reporting manager, else HR (leave approvers).
      *Suggested: keep.*
1544. **Allocation share for bulk approval.** A share of a 40-hour week (as PRJ-01 shows), not the company's normal week
      setting, which is per country pack. *Suggested: keep 40 hours until the normal week is a plain company number.*
1545. **A placed worker on a project of the same client that asks the client to approve hours.** Those lines go once, as
      the placement's week the client approves in Timesheets; they are not also listed under Project hours.
      *Suggested: keep (never approved twice).*
1546. **A week none of whose lines is on a client's project.** For a company that has not linked projects to clients yet,
      a placed worker's week still counts whole, as before 914. *Suggested: keep for now; once every placement client
      has projects, count only client lines.*
1547. **The client portal needs the staffing desk on.** A company using Projects without the staffing desk has no client
      portal, so "client approves the hours" does nothing there. *Suggested: show the switch only when the desk is on
      (a small follow-up), or open the portal for Projects clients too.*
1548. **Companies with Projects on** now decide every submitted week line by line on PRJ-02; weeks already waiting in the
      approvals inbox finish there as before. *Suggested: keep.*

- 1541 to 1548 approved as suggested (12 Nov 2026, "ok for all"). To build: Timesheets tab and the timesheet-vs-attendance warning with P-4 (1541); show "the client approves the hours" only when the staffing desk is on (1547).
1541 to 1548 approved as suggested (12 Nov 2026); 1541 (the Timesheets tab and the attendance check) and 1547 (the client-approval switch only with the staffing desk on) are built in P-4.

## P-4 built (12 Nov 2026): questions for the founder

1581. **Skills in capacity and matching.** The drawn skill, role and location filters on PRJ-03 and the "confirmed skill"
      match on PRJ-07 need people's skills, which Growth has not built. P-4 matches on free capacity only, bench first,
      and a request names a role in words. *Suggested: add the skill filter and match when Growth's skills profile is
      live (1418).*
1582. **Available hours.** An 8-hour Monday-to-Friday day less holidays and leave, not each person's shift or roster.
      *Suggested: keep until rosters feed Projects; then use the person's expected hours.*
1583. **Free capacity over a period.** A person's free share is 100% less every confirmed allocation that overlaps the
      requested dates at any point (the busiest case). *Suggested: keep (never over-allocates); a day-by-day view can
      come later.*
1584. **Who sees capacity in full.** Projects manage and Projects resource are "HR's view" and always see per-person
      figures; a project manager sees their own team, hidden under the small-team limit. *Suggested: keep.*
1585. **Who fills a request.** Only Projects resource or Projects manage; a project's manager without those keys raises
      and withdraws but cannot fill (P-1 still lets them add their own team directly on the project). *Suggested: keep;
      say if a PM should no longer allocate directly once requests exist.*
1586. **Bench.** "On the bench" in matching means on Staffing desk › Bench or with no allocation at all. The bench page
      shows allocation today; the 30-day warning stays the bench policy's maximum days (1417). *Suggested: keep.*
1587. **Attendance check.** Flagged when the week's timesheet and the worked hours from check-ins are an hour or more
      apart; people whose attendance comes from their timesheet are never flagged. *Suggested: keep; make the hour a
      setting only if asked.*

- 1581 to 1587 approved as suggested (12 Nov 2026, "ok for all").

## P-5 built (12 Nov 2026): questions for the founder

1621. **Revenue for margin.** Billing (P-6) is not built, so revenue is the fixed fee's share of milestones accepted in
      the month; time-and-material and retainer projects show cost but no margin yet. *Suggested: keep until P-6 brings
      billed and unbilled revenue.*
1622. **Periods and the cost journal.** PRJ-04 offers single months (the last twelve); the drawn quarter view and
      "Export project cost journal" are not built. *Suggested: add both with P-6's accounting export.*
1623. **Which months are recomputed.** Every night the last three months, and any older month still provisional, so a
      late payroll is restated when it becomes final. *Suggested: keep.*
1624. **Expenses in cost.** Approved claim lines naming the project, at the approved amount, in the month they were
      spent; re-billed lines are counted separately for P-6. *Suggested: keep.*
1625. **Who names a project on an expense.** Anyone, any open project, when the company switched it on; re-billing needs
      a project with a client. *Suggested: keep; limit it to people allocated to the project if you prefer.*
1626. **Cost burn alerts.** Cost (people and expenses, all months) against the cost budget at the same 80% and 100%
      levels as hours, to Projects finance, and to the project's manager only when the latest month has enough people.
      *Suggested: keep.*

- 1621 to 1626 approved as suggested (12 Nov 2026, "ok for all"); 1621 and 1622 are built in P-6.
## P-6 built (12 Nov 2026): questions for the founder

1701. **Which work a run shows.** Hours by their week's Monday, expenses by the day they were spent, the month's
      retainer; an accepted milestone shows in every month until it is billed. *Suggested: keep.*
1702. **Invoice lines.** One invoice per client per run; one line per person and project for hours, one per milestone,
      retainer month and expense. *Suggested: keep; one invoice per project only if a client asks.*
1703. **Retainers.** The project's fee is the monthly retainer, billed for each month the project runs (start to end),
      a part month in full. *Suggested: keep; pro-rate part months if asked.*
1704. **Revenue for margin (1621).** Billed revenue: issued project invoice lines less their credit notes, in the month
      of the invoice date; unbilled work is not revenue yet. *Suggested: keep; show unbilled work beside it later if
      wanted.*
1705. **Who approves (1415).** Anyone with the Staffing desk manage key approves any project draft (clients have no
      named account manager yet); they see only the drafts. *Suggested: keep until clients have a named account
      manager.*
1706. **Who corrects.** Only Projects finance (the drawn PM persona asks finance). *Suggested: keep.*
1707. **Pay recovery.** With "In the next payroll" the correction records the hours to recover and tells the
      employee; payroll does not deduct it yet (a person's rate stays in payroll). *Suggested: payroll reads it as a
      recovery input in its next slice.*
1708. **Time on a draft invoice** cannot be corrected: delete the draft (its work comes back) or issue it first.
      *Suggested: keep.*
1709. **The cost journal (1622).** A monthly CSV of project totals (people cost against payroll cost clearing,
      expenses against employee expenses clearing, the project as cost centre), its own download on PRJ-04, not inside
      the staffing Tally/Zoho export (that one is per invoice series). *Suggested: keep; account names as settings if
      your accountant asks.*
1710. **Bill rate.** One hourly rate per time-and-material project, set by Projects finance in the project drawer.
      *Suggested: keep; a rate per role when a client needs it.*
1711. **The menu.** Billing workbench shows to Projects finance and to account managers who can open Projects.
      *Suggested: keep.*

- 1701 to 1711 approved as suggested (12 Nov 2026, "ok for all"). 1707: payroll reads recorded pay recovery as a recovery input in its next slice.
- Founder asked why "live (gap)" and "not built" (12 Nov 2026). Checked in code: FinanceList gap is now buildable (the live list hides the Margin column behind !live, though P-5/P-6 now supply cost and billed revenue); the workspace Billing tab IS drawn (prj-01 story "Workspace · billing, hours held for client approval", defaultTab billing) and must be built. OldDraft stays a gap by design: live drafts take their date at issue, so the drawn redate warning cannot arise. Phone waits for the mobile app.

## Founder request: a required timesheet note (12 Nov 2026, "ok for all")
- 1731: one note per project row (each PM reads only their own project's work).
- 1732: company setting on Settings › Projects & timesheets, "Timesheet note: required, at least N words", defaults
  required and 200 words.
- 1733: Save draft works without it; Submit week is refused until every row with hours has a note of at least N words;
  a live word count ("142 of 200 words"); the API checks it too. The note column widens from 200 characters.
- 1734: the person, that row's approver and finance (billing workbench) see it; the client in the portal only when a
  per-project setting "show notes to the client" is on (off by default).
- 1735: rows pre-filled from work tools still need the person's own note; the pre-filled items are a starting point.
- 1736: drawn in the timesheet design first, then made live.

## The required timesheet note built (13 Nov 2026, `feat/yukthix-timesheet-note`): questions for the founder

Built as asked (1731 to 1736): one note per row; Settings › Projects & timesheets "Timesheet note: required on every row
with hours" (on) and "at least" (200 words); Save draft never asks; Submit week is refused by the page and the API until
every row with hours has enough words, with a live count; the note holds up to 4,000 characters (was 200); the row's
approver, Projects finance (billing workbench) and the person see it; the client only when the project's "Show
timesheet notes to the client" is on (off by default); pre-filled rows start with no note. Drawn first in TIM-15
(`NoteRequired`, `NoteRefused`, `NoteOptional`, `PhoneNote`).

1771. **Words.** A word is any run of letters or signs between spaces, so "Fixed bugs." is 2 words and a pasted list
      of codes counts each code. *Suggested: keep.*
1772. **The choices for N.** 10, 25, 50, 100, 150, 200, 250 or 300 words. *Suggested: keep; another number if you ask.*
1773. **Rows without hours** need no note; a row with hours on any day needs one. *Suggested: keep.*
1774. **Weeks already submitted** before the switch are not asked again; a week sent back must meet the rule when it is
      resubmitted. *Suggested: keep.*
1775. **Without Projects switched on** (basic timesheets) the same rule applies, because the setting is the company's.
      *Suggested: keep; or ask notes only when Projects is on.*
