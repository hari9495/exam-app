# Compare: timesheet and projects (Keka, Zoho People, YukthiX)

Draft of 17 Nov 2026, for the founder to decide row by row. Sources:
- `keka-pages.md` (Me › Timesheet, My Team › Timesheet, Project) and `keka-map.md`;
- `zoho-pages.md` (Time Tracker, Settings › Time Tracker, Reports);
- YukthiX code on `test/yukthix-main` (TIM-15, TIM-43, PRJ-01 to PRJ-08), plus `gap-audit.md` (K8, K20).

The YukthiX column was checked in code. "(unsure)" marks a cell that needs a look in the running app.

Pick key:
- **Keep ours:** YukthiX already does it as well or better.
- **Take K / Take Z:** build it the way Keka or Zoho does.
- **Mix:** combine.
- **Skip:** not worth it.

Every pick is built in our own design, kit first.

## A. My timesheet (employee)

| # | Feature | Keka | Zoho | YukthiX today | Pick |
|---|---|---|---|---|---|
| A1 | Weekly grid | Projects by days, task totals, total per day, comment pop-up | Time logs as a list or calendar; timesheets made from logs | Has: project × task × day grid, save, submit, recall, comment pop-up (TIM-15 `/yx/time/timesheet`) | **Keep ours:** same grid, with daily notes |
| A2 | View switch | Grid or one card per day | List or calendar | Partly: a day list only on narrow screens; no switch | **Take K:** let the person pick; helps phone users |
| A3 | Copy last week | Button | Clone (job schedule) | Designed only: drawn on TIM-15, not wired | **Take K:** wire the drawn button |
| A4 | Timer or start / end time | — | Inline timer; hours as a total, start and end, or timer | Missing | **Skip:** a weekly grid with daily notes is the norm here |
| A5 | Past-due and sent-back weeks | Two tabs with friendly empty states | Status filter on timesheets | Partly: sent-back weeks show in Time summary; no list of weeks never sent | **Take K:** a "Not sent" list; payroll needs full weeks |
| A6 | Activity on the week | "Timesheet activity" card | — | Partly: audit log only; the person sees "Approved by the project manager" | **Take K:** a small activity card on the week |
| A7 | Attach a file | Attach file | Attachment on a log | Missing | **Take K**, low priority: client sign-off sheets |
| A8 | Leave from the timesheet | Request leave button; time off in the total bar | — | Partly: leave and holidays show as grey days | **Take K:** a "Request leave" link on the week |
| A9 | My tasks | Phase, project, manager, end date, hours vs estimate, stage | Jobs list | Missing: tasks have no assignees | **Take K**, with C4 |
| A10 | My projects | Allocation dates, status, managers | Projects list | Missing as a page; the picker shows only allocated projects | **Take K:** a small "My projects" tab |
| A11 | Hours per project | Project list on the left, weeks and total on the right | Logged-hours report | Missing: weekly totals only | **Mix:** show my hours inside A10; no separate page |
| A12 | Time summary | Area chart over years, then a week table | — | Has (merged): chart and week table | **Keep ours** |
| A13 | Pre-fill from work tools | — | — | Has: TIM-43, off by default (`timesheet.tool_suggestions`) | **Keep ours** (neither has it) |
| A14 | Daily nudge | — | "You are yet to submit your time logs today" card | Missing: only approver reminders | **Take Z:** a Home nudge, plus a reminder before the weekly cut-off |
| A15 | Billable per line | Billable / non-billable totals | Billable dropdown | Has: tick per line, default from project and task | **Keep ours** |
| A16 | Required daily note | Comment pop-up, optional | Description, optional | Has: note per day with a minimum word count (company setting) | **Keep ours:** better proof for client billing |

## B. Manager approvals

| # | Feature | Keka | Zoho | YukthiX today | Pick |
|---|---|---|---|---|---|
| B1 | Approval drill-down | Employee or project view; week → day → task in place; By date / By task | — | Partly: PRJ-02 `/yx/projects/approvals` cards by project and week; approve, reduce or reject per line | **Take K:** add the in-place drill-down and the Employee / Project switch |
| B2 | Bulk approve | Approve or reject ticked weeks | — | Has: "Approve N within allocation"; hours outside an allocation never go in bulk | **Keep ours:** safer than plain bulk |
| B3 | Team week summary | Direct / indirect; billable, non-billable, total per person | — | Partly: booked, approved, allocated per person on the project page | **Take K:** add billable and non-billable totals |
| B4 | Approval chain | Per project: approvers in levels | Approvals per form | Partly: one level (project manager, then client if set) | **Take K:** an optional second level (delivery head); keep "nobody approves own hours" |
| B5 | Approve on the phone | — | — | Designed only: phone approval screens drawn, not live | **Keep ours:** make the drawn screens live |
| B6 | Hours feed attendance and payroll | — | "Timesheet data for payroll" report | Has: an approved week sets the attendance day and the payroll feed; locked months never change | **Keep ours** |

## C. Projects

| # | Feature | Keka | Zoho | YukthiX today | Pick |
|---|---|---|---|---|---|
| C1 | Project list | Active / all / archived, billing model, column chooser, saved view | Shared list with employee / department switch | Has: PRJ-01 `/yx/projects`, status and billing filters, "Burn above 80%" view | **Keep ours** |
| C2 | Project overview | Burndown, estimate vs actual, actions pending, written insights, who is on leave | — | Partly: hours and cost burn, burn alert, task budget vs used; activity timeline designed only | **Take K:** add actions pending and who is on leave; burndown later |
| C3 | Team and allocation | Add several people at once; %, billability, billing role | — | Has: % or hours a week, dates, tentative / confirmed, role, rates | **Keep ours**; add "add several people at once" |
| C4 | Tasks | List, compact list, board by stage; phases, milestones, estimates, assignees, custom fields | Jobs with assignees | Partly: task list with budget and burn; milestones live; no board, phases, assignees or custom fields | **Mix:** Keka's assignees and board; Zoho's plain jobs as the light mode |
| C5 | Clients | Client on the project | Client list | Has: one client record shared with the staffing desk (GSTIN, portal) (unsure: may need the staffing desk on) | **Keep ours** |
| C6 | Schedule draft, then publish | — | Week grid, clone, publish | Partly: allocations are tentative or confirmed | **Skip:** tentative / confirmed already does this |
| C7 | Capacity and bench | — (project health is an upsell) | — | Has: PRJ-03 capacity, PRJ-07 resource requests, staffing bench | **Keep ours** (neither has it) |
| C8 | Cost and margin | — | — | Has: PRJ-04 `/yx/projects/costs`, journal export; cost hidden on small teams | **Keep ours** |
| C9 | Billing | Billing settings per project | Billing switch | Has: PRJ-05 workbench, PRJ-06 corrections, GST invoices on one engine | **Keep ours** |
| C10 | Project settings | Approval chain, manager and team permissions, time-entry rules, billing | Time tracker policies | Partly: company-wide rules only (`/yx/settings/projects`) | **Take K:** a per-project settings tab (approval levels, who may book) |
| C11 | Project reports | Resource hours, task hours, time entry details, unassigned people | Logged hours for clients, employee hours, timesheet data for payroll | Partly: capacity board, cost export, payroll feed; no hours reports | **Mix:** Keka's two hours reports plus Zoho's payroll report |
| C12 | Module switches | — | Projects, clients, timesheets, schedule, billing, breaks | Partly: `projects.enabled`, `staffing.desk.enabled`, `projects.expenses.enabled` | **Keep ours**; they join the modules list (admin A2) |

## Suggested order to build

1. **Must for daily use:**
   - A5 "Not sent" list (S);
   - A3 copy last week (S);
   - A14 daily nudge (S);
   - B1 approval drill-down (M);
   - B3 billable totals (S);
   - A8 request leave from the week (S).
2. **Depth:**
   - A10 / A11 my projects with my hours (S);
   - A9 / C4 tasks with assignees and a board (M);
   - C2 actions pending and who is on leave (M);
   - C10 per-project settings (M);
   - B4 second approval level (M);
   - C11 hours reports (M);
   - A2 view switch (S);
   - A6 activity card (S).
3. **Later:** A7 attach a file (S), B5 phone approvals (M), C3 add several people (S).
