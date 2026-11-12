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
| A. Projects and timesheets (PRJ-01, PRJ-02, PRJ-08) | 3 | 0 | 8 | 0 | 17 | 1 | 26 |
| B. Capacity and bench (PRJ-03, PRJ-07) | 2 | 0 | 1 | 0 | 9 | 0 | 10 |
| C. Cost and billing (PRJ-04 to PRJ-06) | 3 | 0 | 5 | 0 | 11 | 0 | 16 |
| **All A-C** | **8** | **0** | **14** | **0** | **37** | **1** | **52** |

Counted by script on 12 Nov 2026 on `docs/yukthix-projects-map` (the script is in the appendix; it prints "ok"). There
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
| FinanceList · Finance · all projects with margin | design only, feature not built | no projects list with client, budgets, fee or margin (searches in section 2) |
| PmList · PM · my projects | design only, feature not built | no "my projects" page for a PM; `timesheet_projects.manager_user_id` exists but no list reads it for the PM |
| HrList · HR · no fee or margin | live (gap) | HR sees and edits projects in HR › Shifts set-up (`ShiftEditorScreen`, `POST|PUT /projects`): code, name, PM, billable, activities. Gap: no client, billing model, budgets, status, people count; not the designed list |
| PmOverview · Workspace · PM overview, burn alert | design only, feature not built | no budgets, so no burn; no workspace page |
| FinanceOverview · Workspace · finance overview with margin | design only, feature not built | no project cost or margin (cost rates exist, payroll only: `employee_cost_rates`) |
| Team · Workspace · team and allocations | design only, feature not built | no allocation table; today anyone may book any active project |
| FixedFeeMilestones · Workspace · fixed fee, tasks and milestones (over budget) | design only, feature not built | no tasks, milestones or billing model |
| Timesheets · Workspace · timesheets with attendance mismatch | design only, feature not built | the hours exist (`timesheet_lines` by `project_id`) and the day engine knows attendance, but no API lists a project's timesheets or compares them |
| Billing · Workspace · billing, hours held for client approval | design only, feature not built | no project WIP; the staffing equivalent is placement hours waiting for the client |
| Expenses · Workspace · expenses | design only, feature not built | expense lines have no project |
| Closed · Workspace · closed project | design only, feature not built | `timesheet_projects.active` false stops new time, but there is no closed status, no adjustment week and no workspace |
| Empty · Empty | design only, feature not built | as FinanceList |
| Loading · Loading | design only, feature not built | as FinanceList |
| Error · Error | design only, feature not built | as FinanceList |

#### PRJ-02 · Timesheet approvals

| story (sub-page) | verdict | note |
|---|---|---|
| ByProjectWeek · PM · grouped by project and week | live (gap) | PMs approve timesheets in `/yx/approvals` (`ApprovalsInboxScreen`, engine key `time.timesheet`). Gaps: a whole week per task, not grouped by project and week; no reduce; a reject has no per-line reason; every PM of the week must approve the whole week (`mode: 'all'` in `timesheet.service.ts`) |
| ClientApproval · Client approval after PM | live (gap) | only for staffing placements: an approved week flows to the placement's hours and the client approves it in the portal (`hours-from-time.ts`, `client-portal.service.ts`). Not for project clients; the whole week, not the client's project lines (914) |
| BulkConfirm · Bulk approve within allocation | live (gap) | the inbox has bulk decide (PLT-04, `approvals-engine.service.ts` line 576). No "within allocation" check (no allocations) |
| Empty · Empty · all caught up | live (gap) | the inbox's empty state |
| Loading · Loading | live (gap) | the inbox's loading state |
| Error · Error | live (gap) | the inbox's error state |
| Phone · phone | phone view, mobile app not built | `TimesheetApprovalsPhone` (also `settings: MobileTimesheetApprovalsScreen` on `notLive`) |

#### PRJ-08 · Timesheet mapping rules

| story (sub-page) | verdict | note |
|---|---|---|
| Rules · HR · rules by priority | design only, feature not built | no rule table; TIM-43 matches only by project code or name (`matchProject`) |
| Tested · Test against last week | design only, feature not built | no test run |
| Edit · Edit rule | design only, feature not built | no rule API |
| PrefillOff · Pre-fill switched off | live (gap) | the switch is the company setting `timesheet.tool_suggestions` (`settings-registry.ts` line 498; default off, the design says starter on: question 1409), set on the generic settings page, not on this designed page |
| Empty · Empty · no rules | design only, feature not built | "suggestions only from the AI" is not built either (question 1410) |

### B. Capacity and bench (PRJ-03, PRJ-07)

#### PRJ-03 · Capacity and utilisation board

| story (sub-page) | verdict | note |
|---|---|---|
| Hr · HR · heatmap and utilisation vs target | design only, feature not built | no allocations and no utilisation target; available hours could come from Time (expected hours, leave, holidays) |
| Pm · PM · team of 7 | design only, feature not built | as above |
| Suppressed · PM · small team suppressed | design only, feature not built | the rule ("fewer than 5") is not built; `suppress()` in `performance/calibration-rules.ts` is the pattern |
| Loading · Loading | design only, feature not built | as Hr |

#### PRJ-07 · Bench board and resource requests

| story (sub-page) | verdict | note |
|---|---|---|
| Bench · Bench board with ageing | live (gap) | **duplicate:** Staffing desk › Bench (`/yx/staffing/bench`, `BenchBoardScreen`) lists people between placements with days on bench against the bench policy. Gaps: bench comes from placements, not project allocations; no "partly allocated"; skills not shown (question 1417) |
| Requests · Resource manager · requests | design only, feature not built | no resource requests (section 2) |
| Match · Match · bench first, confirmed skill | design only, feature not built | no allocations and no person skills (question 1418) |
| NoMatch · Match · no one free | design only, feature not built | as Match |
| Raise · PM · raise request | design only, feature not built | as Requests |
| Empty · Empty requests | design only, feature not built | as Requests |

### C. Cost and billing (PRJ-04 to PRJ-06)

#### PRJ-04 · Project costing and margin

| story (sub-page) | verdict | note |
|---|---|---|
| Finance · Finance · provisional September | design only, feature not built | no project cost; inputs exist: approved `timesheet_lines` and `employee_cost_rates` (payroll scope only) |
| Pm · PM · one-person project cost hidden | design only, feature not built | the one-person rule is not built (question 1412) |
| Final · Finance · August final, NRP-WEB restated | design only, feature not built | cost rates are written at payroll finalise (`runs.service.ts` line 1270), so a restatement job has its trigger; not built |
| Empty · Empty | design only, feature not built | as Finance |
| Loading · Loading | design only, feature not built | as Finance |

#### PRJ-05 · Billing workbench

| story (sub-page) | verdict | note |
|---|---|---|
| Wip · Finance · WIP by client, held items | design only, feature not built | no project WIP (hours, milestones, retainers). The staffing equivalent is `CreateInvoicesSheet` from client-approved placement hours |
| Drafts · Draft invoices · CGST/SGST and IGST | live (gap) | staffing drafts split CGST/SGST or IGST by supplier state and place of supply (`billing-rules.ts gstSplit`, `billing.service.ts draft`). Gap: from placement hours only, not project WIP |
| Approve · Approve and issue · e-invoice window | live (gap) | **duplicate:** staffing issue (`issue()`, next number of the series, `staffing.einvoice.applies`) and the HIR-31 window (rule `GST.EINVOICE_WINDOW`). Gaps: one step (finance issues), the drawn account manager then finance approval is not built (question 1415); the IRP is not connected |
| OldDraft · Approve · draft dated 27 Aug, IRN blocked | live (gap) | live drafts take their date when issued, so an old draft cannot block; past the window an issued invoice is cancelled and reissued (`reissue()`). The drawn "redate before issue" warning is not built |
| Issued · Issued | live (gap) | **duplicate:** issued invoices show in `/yx/staffing/invoices` and the client portal, with PDF and accounting export; the drawn "Issued" summary of the run is not built |
| Empty · Empty · nothing to bill | design only, feature not built | as Wip |

#### PRJ-06 · Timesheet correction and credit note

| story (sub-page) | verdict | note |
|---|---|---|
| CreditWithRecovery · PM · down 8 h, credit note and pay recovery | design only, feature not built | approved weeks cannot change (`timesheet.service.ts`: "approved and can no longer change"); no pay recovery |
| CreditNoRecovery · Finance · credit note, policy none | live (gap) | finance raises a credit note by amount on the invoice record (`creditNote()`, never an edit). Gap: the hours themselves are not corrected and the amount is typed, not worked out from the hours |
| Supplementary · Up 4 h · supplementary invoice | design only, feature not built | no supplementary invoice from corrected hours |
| Locked · Period locked · adjustment line | design only, feature not built | locked months are enforced (P08 `lockedDates`), but no adjustment line in an open period |
| Review · Review documents | design only, feature not built | as CreditWithRecovery |

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
