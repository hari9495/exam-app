# Keka: page-by-page reference

Seen 16 Nov 2026 with the founder's own login (employee who also manages a team). Look-only: nothing was approved,
submitted, saved or sent. Forms were opened only to screenshot them, then closed with nothing typed.

Screenshots are in `shots/keka/` next to this file. That folder is gitignored because the screenshots show
colleagues. This file holds layout and features only: no names, emails, phones, salaries, bank, tax figures or IDs.

Wider summaries: `keka-map.md` (area by area) and `attendance-and-leave.md` (feature rows A1–A14, L1–L9).

Shell on every page: dark left rail (Home, Me, Inbox with a red count, My Team, My Finances, Org, Engage, Helpdesk,
Performance, Project), a blue top bar with the company name, a global search "Search employees or actions" (Alt + K),
a bell and the avatar. Inside an area: a first row of tabs in capitals, then a second row of sub-tabs.

## Home

### Home dashboard — `#/home/dashboard`
Shots: `home-01.jpg`, `home-02-top-wide.jpg`, `home-03-left-widgets-praise.jpg`, `home-04-feed-praise.jpg`,
`home-05-feed-poll.jpg`, `home-06-bottom.jpg`
- Full-width welcome banner with an artwork background and the person's first name.
- Two columns. Left "Quick Access" stack of small cards; right a social feed.
- Left cards top to bottom: Time Today (live clock, Web Clock-In, "Other" menu, View All), Project Time Today
  (Add Time Entry), Inbox (count of tasks waiting, Take Action), On Leave Today, Working Remotely, Holidays
  (a carousel with arrows and a festive illustration), Leave Balances (two small ring charts with days left,
  Request Leave, View All Balances), Feedbacks Received (Request Feedback), Quick Links (empty state).
- Every empty card has a soft illustration and one plain line ("Everyone is working today!").
- Right column: Organization / a second group tab (a practice), a composer with Post, Poll and Praise tabs,
  an announcements strip with a "+" button, then Birthdays / Work Anniversaries / New joinee tabs with counts.
- Feed items: praise posts render a full "Certificate of Appreciation" card with a badge (High Five, Above &
  Beyond, Customer Hero), the praiser and a project tag; polls show bars with % and vote counts, "Poll ended on",
  total voters; each post has Like, Comment, reaction icons and counts.

## Me › Attendance

### Attendance — `#/me/attendance`
Shots: `me-attendance-01-top.jpg`, `me-attendance-02-calendar-day-panel.jpg`, `me-attendance-03-list-view.jpg`,
`me-attendance-04-requests.jpg`
- Three cards on top: Attendance Stats (me vs my team, period picker), Timings (today's shift bar with the break,
  week as dots), Actions (live clock, Web Clock-In, Work From Home, On Duty, Attendance Policy).
- "Logs & Requests" below with tabs: Attendance Log, Calendar, Attendance Requests; a 24-hour switch.
- Log list: one row per day with a small worked-time bar, effective / gross hours, arrival status, an icon; weekly
  offs as a grey row. Month buttons (30 days, Nov, Oct, …) jump straight to a month.
- Calendar: click a day to open a right panel with shift, hours, late-by, every punch and a "Regularize" link.
- Requests tab: two lists, Work From Home / On Duty and Regularization, each with a date range.
- Full feature rows are in `attendance-and-leave.md` (A1–A14). The Regularize form was not opened again.

## Me › Timesheet

### All timesheets — `#/me/timesheet/all-timesheets`
Shots: `me-timesheet-01-all.jpg`, `me-timesheet-10-all-list-view.jpg`, `me-timesheet-11-all-card-view.jpg`
- Title row with a two-icon view switch: List view (grid of projects × days) and Card View (seven day columns,
  each with its hours and a "+" to add an entry).
- Week picker with arrows and a calendar icon; "Copy last week hours" button and a "..." menu.
- Total bar "0:00 / 56:00" with Time Off beside it.
- Grid: Projects column, one column per day (date + weekday), a Task total column, "+ Add Time Entry",
  a Total hours/day row.
- Footer: Request Leave, Attach file, Save, Submit weekly timesheet (not clicked).
- Below: Comment Summary and Timesheet Activity cards side by side, each with an empty-state illustration.

### Past due — `#/me/timesheet/overdue-timesheets`
Shots: `me-timesheet-02-past-due-empty.jpg`
- Empty state only: a mascot illustration and "Yay! There are no due timesheets".

### Rejected timesheets — `#/me/timesheet/rejected-timesheets`
Shots: `me-timesheet-03-rejected-empty.jpg`
- Same empty-state pattern: "Yay! There are no rejected timesheets".

### Project time — `#/me/timesheet/project-time`
Shots: `me-timesheet-04-project-time.jpg`, `me-timesheet-05-project-time-row-expanded.jpg`
- Master-detail: a searchable project list on the left (project name, client or practice, code).
- Right: a big "Total Duration" number card, then a date range and search.
- Table: timesheet period, date submitted, total, status, with a download icon and pages.
- Each row expands in place to show the tasks and hours inside that week.

### Time summary — `#/me/timesheet/time-summary`
Shots: `me-timesheet-06-time-summary-chart.jpg`, `me-timesheet-07-time-summary-table.jpg`
- A full-width area chart "Timesheet Hours" with every week across several years; hover shows the week's total.
- Dips to zero make missed weeks obvious at a glance.
- Below: a table of weeks (period, total, status) with expand chevrons and a download icon.

### My tasks — `#/me/timesheet/my-tasks`
Shots: `me-timesheet-08-my-tasks.jpg`
- Filter by Task Stage and a search box.
- Columns: task (with project code), phase, project, project manager (link), end date (red when past, with
  "starts on"), hours logged vs estimate, task stage with a coloured dot.

### Projects allocated — `#/me/timesheet/allocated-projects`
Shots: `me-timesheet-09-projects-allocated.jpg`
- Filters: allocation from, allocation till, project status, search; a download icon.
- Columns: project (expandable), project status, project managers (links, "+1" when more), project duration.

## Me › Leave

### Leave — `#/me/leave`
Shots: `me-leave-01-top.jpg`, `me-leave-02-balances.jpg`, `me-leave-03-history.jpg`, `me-leave-04-request-drawer.jpg`
- Pending requests block on top, with Request Leave and links (comp-off credit, comp-off history, leave policy).
- Year selector, then three charts: weekly pattern, consumed by leave type (donut), monthly stats (bars).
- One card per leave type with a ring chart of days left, available / consumed / accrued / quota, View details.
- Full leave history table with type and status filters, search, pages.
- Request Leave opens a right drawer: dates with a day count, type, note, Notify colleagues, Cancel / Request.
- Feature rows L1–L9 are in `attendance-and-leave.md`.

## Me › Performance

### KRAs — `#/me/performance/objectives/summary` (and `/company`)
Shots: `me-performance-kras-01-top.jpg`, `me-performance-kras-02-company-empty.jpg`
- Title "My KRAs" with a timeframe dropdown ("Active timeframes").
- Three toggle buttons: My KRAs, Department KRAs, Company KRAs.
- Filter row: KRA type (multi-select, "3 selected"), status, tags, search, a filter icon.
- Two cards: Average progress (big %) and Progress by status as coloured pills with counts (on track, needs
  attention, at risk, closed, not started).
- KRAs grouped by timeframe (for example "H2-2026") with a progress bar per group; an empty line inside the group.
- Company KRAs empty state: a target illustration and a welcome line.

### 1:1 meetings — `#/me/performance/oneonones/meetings`, `/agendatemplates`
Shots: `me-performance-oneonones-01-meetings.jpg`, `me-performance-oneonones-02-agenda-templates.jpg`
- Two inner tabs: My Meetings, Agenda Templates. "Schedule 1:1 meeting" primary button (not clicked).
- Filters: meeting type (multi-select), date range, search.
- Left accordion: Upcoming, Pending, Completed meetings; the right pane shows the chosen meeting or an empty state
  ("adjust the date range to view meetings").
- Agenda Templates: empty state with "Create Template" and a line on why templates save time.

### Feedback — `#/me/performance/continuousfeedback/*`
Shots: `me-performance-feedback-01-praises-received.jpg` to `me-performance-feedback-05-internal-notes.jpg`
- Five inner tabs: Praises Received, Feedback Received, Praises Given, Feedback Given, Internal Notes.
- Each tab has a title, a one-line description ("This section contains …") and its own empty state.
- Empty states carry a motivating line and, where useful, an action (Feedback Received: "Request feedback").
- Internal Notes explains how to start: take a note from the employee's profile.

### PIP — `#/me/performance/pip/inprocess`
Shots: `me-performance-pip-01-in-process.jpg`
- Tabs In process / Completed. A positive empty state: gauge icon, "You're on track".

### Reviews — `#/me/performance/reviews/myreviews`, `/reviews-to-others`
Shots: `me-performance-reviews-01-my-reviews.jpg`, `me-performance-reviews-02-given-to-others.jpg`,
`me-performance-reviews-03-review-form-view.jpg`
- Tabs: My performance reviews (with a count chip), Reviews given to others.
- My reviews: collapsible Active Reviews and Completed Reviews sections.
- Given to others: a searchable list of cards (person, review cycle, relation such as project manager or reporting
  manager, "View review form").
- The review form opens full screen and read-only: a header strip (person, job title, manager, department, joining
  date), Overall Summary with the rating out of 5 and a band label, View Breakdown, a print icon, a reviewer picker,
  a list / grid switch, tabs Questions and Projects with counts, and each answer shown as a comment card.

### Skills — `#/me/performance/skills`
Shots: `me-performance-skills-01-top.jpg`
- Four stat cards with soft round icons: total skills, category count, average rating, pending requests
  (with View requests).
- Update skills (outline) and + Assign skills (primary) on the title row.
- Filters: category, rating, approval status, search.
- Table: skill (link), category, rating as a star and "n/5", certifications (paperclip and count), experience,
  edit and menu actions.

### Competencies & core values — `#/me/performance/competencies`
Shots: `me-performance-competencies-01-top.jpg`, `me-performance-competencies-02-core-values.jpg`
- One table per job function: competency name, description, type (core / job specific), weightage, behaviours
  (a count link).
- Then a Core Values table: name, description, behaviours count.
- Read-only; tells the employee what is expected of them.

## Me › Expenses & Travel

### Pending expenses — `#/me/expenses/pending`
Shots: `me-expenses-pending-01-top.jpg`, `me-expenses-pending-02-add-expense-form.jpg`
- Three stacked sections, each with a title and a one-line description: Expenses to be Claimed (with
  "+ Add an Expense"), Expense claims in process, Advance settlements in process.
- Claims table: claim number, claim (title and date), expense count, approved amount "x of y", claim status (with
  the reason under it), action taken by (with date), waiting on, actions menu. Sortable headers.
- Add an Expense opens a full-screen form in two halves: left a dark receipt-preview pane with "Upload Receipts";
  right the fields (category, project / cost centre, title, date, currency, amount with a "payable amount" hint,
  comment, upload receipt).
- Footer: Save Expense, Save and Add Another, Submit Claim (disabled until valid). Closed with X, nothing typed.

### Past claims — `#/me/expenses/past`
Shots: `me-expenses-past-01-top.jpg`
- Two sections: Past Expense Claims and Past Advance Settlements, each with a paid-date range, payment mode, search.
- Blue empty rows: "No past claims to show within the date range selected".

### Advance requests — `#/me/expenses/advancerequests`
Shots: `me-expenses-advance-01-not-allowed.jpg`
- Only a yellow notice: advance requests are not enabled for this person; contact HR. The page follows policy.

## Me › Apps

### My apps / Apps center — `#/me/apps/my-apps/org-enabled-apps`, `#/me/apps/marketplace`
Shots: `me-apps-01-my-apps-org-enabled.jpg`, `me-apps-02-apps-center.jpg`
- My Apps: toggle Org Enabled / Installed apps, a search box, app cards in four columns (logo, name, one-line
  description, "Free" chip, a "Choice" badge for featured partners).
- Apps center: a left category list (training, payroll, project management, travel, time tracking, rewards, talent,
  documents, hiring, collaboration, personal finance, engagement), search, a location filter, Free / Paid
  checkboxes, then a three-column card grid (video-call, calendar, chat and spreadsheet integrations).

## Inbox

### Take action — `#/inbox/action/<kind>/<id>/details`
Shots: `inbox-01-take-action-regularization.jpg`, `inbox-02-take-action-leave.jpg`,
`inbox-03-take-action-timesheets.jpg`
- Three columns: pending task groups with counts (leave requests, attendance regularization, timesheet approvals);
  the requests in that group (select-all checkbox, Newest sort, search); the detail of the chosen request.
- List rows: avatar, requester, "n days ago", request title with dates, the note.
- Detail: requester header with "Requested by … on …", a date tile (day, month, weekday), the request summary,
  the note as a comment, a comment box, and Approve / Reject at the bottom (not clicked).
- Leave detail adds a character counter and the line "No teammates are on leave on this day": a team clash
  check right where the approver decides.
- The timesheet group switches to a people list (role, wait time) and the person's weeks on the right with a
  By date / By task toggle, status icon, billable and non-billable hours.

### Notifications — `#/inbox/notifications`
Shots: `inbox-04-notifications.jpg`
- A narrow centred feed "from Wall, Praises and Feedbacks", grouped (Previously), with "Mark all as Read".

### Archive — `#/inbox/archive/...`
Shots: `inbox-05-archive.jpg`
- Same three columns, labelled "Archive – last 3 months", with more groups (exit requests, working remotely,
  assets).
- Each item shows an Approved / Rejected tag and who acted; the detail shows the approval trail as ticked lines.

## My Team

### Summary — `#/myteam/summary/direct`, `/peer`
Shots: `myteam-summary-01.jpg`, `myteam-summary-02-legend-direct-reports.jpg`,
`myteam-summary-03-direct-reports-bottom.jpg`, `myteam-summary-04-peers-team-calendar.jpg`
- Direct Reports / Peers switch. Two wide cards (on leave today, not in yet today) with yellow empty notes.
- Four count cards with coloured left borders (on time, late arrivals with View Employees, WFH / on duty, remote
  clock-ins).
- Team calendar: month arrows, one row per person, day cells as coloured circles, and a legend (WFH, on duty, paid,
  unpaid, leave for no attendance, weekly off, holiday, someone on leave, several on leave, someone WFH / OD).
- Below: "Direct Reports (n)" as a three-column card grid (photo, name, title, location, department, email,
  mobile, an "IN" status badge).

### Attendance approvals — `#/myteam/attendance/approvals`
Shots: `myteam-attendance-approvals-01.jpg`
- See `keka-map.md`: stacked pending sections, a bulk approve / reject table with many org filters.

### OT approvals — `#/myteam/attendance/overtime-approvals/direct`
Shots: `myteam-attendance-ot-01-empty.jpg`
- One section with a blue "Hooray, no pending overtime approvals!" line.

### Regularize & cancel penalties — `#/myteam/attendance/bulkregularisation/direct`
Shots: `myteam-attendance-bulkregularisation-01.jpg`
- Info banner: people already regularised or with pending requests are hidden.
- Filters: date range, status (Penalised), attendance discrepancy, department, location, search.
- The empty state explains the page: regularise attendance in bulk within a date range.

### Shift & weekly off approvals — `#/myteam/attendance/shift-weeklyoffs-approvals/direct`
Shots: `myteam-attendance-shift-weeklyoff-01-empty.jpg`
- Two stacked sections (shift approvals, weekly off approvals), each with a "Hooray, no pending …" line.

### Efforts / punctuality — `#/myteam/attendance/efforts-punctuality/direct`
Shots: `myteam-attendance-efforts-01-on-time-leaderboard.jpg`, `myteam-attendance-efforts-02-work-hours.jpg`,
`myteam-attendance-efforts-03-overtime.jpg`
- Three leaderboard cards, each with a week range and a menu: On Time, Avg. Work Hours, Avg. Overtime Hours.
- Each card: a top-5 list on the left (avatar, name, role, "5 / 5 working days" or "avg n hrs/day"); a chart on
  the right (bars of on-time count against team size per day, or a line per day).
- Under each chart three summary figures: average, least, maximum.

### Negligence — `#/myteam/attendance/negligence/direct`
Shots: `myteam-attendance-negligence-01-late-arrivals.jpg`, `myteam-attendance-negligence-02-hours-pie-breaks.jpg`
- The mirror of the efforts page for problems: Late Arrivals (bars), Least Hours Worked (pie by hour band:
  under 4, 4–5, 5–6, 6–7, 7–8, 8 and more), Frequent Breaks (a line of break hours).
- Same layout: top-5 list on the left, chart on the right, three summary figures.

### Employee assignments — `#/myteam/attendance/employeeassignments/direct`
Shots: `myteam-attendance-assignments-01-table.jpg`
- "Time Assignments": edit the team's shift, weekly off and penalisation policy.
- Filters: shift, weekly off, penalisation policy, department, location, search; a total count.
- Bulk buttons (Update Shift, Update Weekly Off, Update Penalisation Policy) enable when rows are ticked;
  "Import Shifts & Weekly Offs".
- Columns: employee, number, department, location, shift type (time range), weekly off, penalisation policy.

### Attendance reports — `#/myteam/attendance/reports`
Shots: `myteam-attendance-reports-01-home.jpg`, `myteam-attendance-reports-02-attendance-category.jpg`
- A reports library: left categories (Reports Home, request, attendance, punctuality, negligence reports,
  Scheduled reports); right a search, Favourites (empty state) and Recently Used.
- Each report is a card: title, one-line description, a "⋮" menu. Two columns.

### Leave overview — `#/myteam/leave/overview`
Shots: `myteam-leave-overview-01.jpg`
- See `keka-map.md`: consumption trend per type; cards for unplanned leave, no leave taken, most leave taken.

### Leave approvals — `#/myteam/leave/approvals/direct`
Shots: `myteam-leave-approvals-01-table.jpg`
- Pending Leave Approvals table with filters (business unit, department, location, legal entity, leave type,
  status, duration, search), bulk Approve / Reject, row tick / cross / menu.
- Columns: employee, number, department, location, business unit, legal entity, leave dates (with day count),
  leave type (requested on).
- A second section: Pending Compensatory off Approvals.

### Penalized leave — `#/myteam/leave/penalized`
Shots: `myteam-leave-penalized-01-moved-note.jpg`
- Only a notice that this moved under Attendance › Regularize & cancel penalties, with a link.

### Past leave requests — `#/myteam/leave/pastleave/direct`
Shots: `myteam-leave-pastleave-01-table.jpg`
- Date range, six filters and search; the columns add status (approved by) and leave note.

### Encashment — `#/myteam/leave/encashment/direct`
Shots: `myteam-leave-encashment-01.jpg`
- Pending encashment requests (empty line), then Past encashment requests with filters and a wide table
  (encashment days, action taken). "No records found".

### Leave reports — `#/myteam/leave/reports`
Shots: `myteam-leave-reports-01.jpg`
- The same reports-library layout. About 12 cards: exception logs, accrued, carry-over, consumed, opening and
  closing balances, comp-off requests, expiry, balance YTD, negative balance, hourly leave, team balances.

### Team expenses — `#/myteam/expenses/pending`, `approved`, `pastclaims`, `pastadvances`
Shots: `myteam-expenses-pending-01.jpg`, `myteam-expenses-approved-01.jpg`, `myteam-expenses-pastclaims-01.jpg`,
`myteam-expenses-pastadvances-01.jpg`
- Waiting for approval: three stacked sections (advance requests, expense claims, advance settlements).
- Approved claims: approved but unpaid items, with the note that the manager can still reject them.
- Past claims / advances: paid-date range, cost centre, payment mode, business unit, department, location, search.

### Timesheet approvals — `#/myteam/timesheet/approvals/timesheet-approvals`
Shots: `myteam-timesheet-approvals-01.jpg`, `myteam-timesheet-approvals-02-employee-view-by-date.jpg`,
`myteam-timesheet-approvals-03-week-expanded.jpg`, `myteam-timesheet-approvals-04-by-task.jpg`,
`myteam-timesheet-approvals-05-project-view.jpg`
- Employee View / Project View switch. Left: a searchable list (person with weeks waiting and age, or project
  with a count).
- Right, By date: weeks with submitted on, number of tasks, status icon, billable, non-billable, total hours;
  a week expands into its days, and each day expands into tasks.
- By task: the same columns grouped by task with project and client chips; a task search box appears.
- Project View: a header with project code, client and "n employees"; rows grouped by task, then by person.
- Approve / Reject act on ticked rows (not clicked).

### Team project time — `#/myteam/timesheet/projecttime`
Shots: `myteam-timesheet-projecttime-01-empty.jpg`
- Project list on the left, date range and search on the right; a ghost illustration "No timesheets logged!".

### Week summary — `#/myteam/timesheet/weeksummary/direct`
Shots: `myteam-timesheet-weeksummary-01.jpg`
- Direct / Indirect reportees switch, date range, search, download.
- Columns: employee (expandable), timesheet count, total billable, total non-billable, total hours.

### Timesheet reports — `#/myteam/timesheet/reports`
Shots: `myteam-timesheet-reports-01.jpg`
- Report cards: time entry details, resource allocation summary, team status report, unassigned resources.

### Profile changes — `#/myteam/profile-changes/profile-approvals`, `past-changes`
Shots: `myteam-profile-approvals-01-empty.jpg`, `myteam-profile-past-01-empty.jpg`
- Big page title, a one-line description, a blue empty line. Employees' own profile edits wait for approval here.

### Team performance — `#/myteam/performance/*`
Shots: `myteam-performance-insights-01-top.jpg`, `myteam-performance-insights-02-table.jpg`,
`myteam-performance-kras-01.jpg`, `myteam-performance-feedback-01.jpg`, `myteam-performance-pip-01-empty.jpg`,
`myteam-performance-reviews-01.jpg`, `myteam-performance-skills-01.jpg`, `myteam-performance-reports-01.jpg`
- KRA Insights: a timeframe picker; four stat cards (employees, KRAs, employees without KRAs with a "Remind" link,
  KRAs not updated); three chart cards (total, by status, unaligned); then a per-person table (total, unaligned,
  not started, on track, needs attention, at risk, closed, a progress bar).
- Team KRAs: a "+ Add new kra" split button, filters, progress cards, a "Group by employees" toggle, one
  collapsible row per person with "+ Add KRAs".
- Feedback: three columns — the team list on the left, the feed in the middle (type filter, date range),
  "Quick actions" on the right (give praise, give personal feedback, write internal note, request feedback).
- PIP: tabs In Process / Completed / Approval Requests; an empty state with "+ Add an employee to PIP".
- Reviews: a left list of review cycles (active, completed), a searchable employee table on the right, and a
  list / person view switch.
- Skills: four stat cards, a "Group by skills" toggle, location and job title filters, bulk Assign skills /
  Update ratings; each person row expands into their skill table with a "skill gap" column.
- Reports: categories (review, 1:1, feedback, objectives, skill reports) with many report cards.

### Team hiring — `#/myteam/hiring/requisition/active/direct`, `#/myteam/hiring/internal-job/...`
Shots: `myteam-hiring-requisitions-01-empty.jpg`, `myteam-hiring-internal-job-01-empty.jpg`
- Requisitions: inner tabs Active / Pending Approvals / Past; a blue empty line.
- Internal Job Applications: Pending Approvals / Past Applicants, so managers approve internal moves.

## My Finances (layout only, no figures)

### Summary — `#/myfinances/summary`
Shots: `myfinances-summary-01-top.jpg`, `myfinances-summary-02-statutory-identity.jpg`
- Payroll summary strip: last processed cycle, working days, loss of pay, View payslip.
- Left: Payment Information (mode, bank, account, IFSC, name, branch) and Statutory Information (PF, ESI, PT).
- Right: Identity Information cards (PAN; Aadhaar as photo ID and address proof), each with a "Verified" tag,
  an attached-files count, and masked numbers with an eye icon to reveal.

### My salary — `#/myfinances/pay/salary`
Shots: `myfinances-pay-salary-01-timeline.jpg`
- Two cards: current compensation, payroll pay cycle.
- A yellow note on which tax regime is used.
- Salary Timeline: a vertical timeline of revisions, newest first, a "Current" tag, each with an expandable
  "regular = total" line and "View Salary Breakdown".

### Payslips — `#/myfinances/pay/payslips/IN/<year>/<id>`
Shots: `myfinances-pay-payslips-01.jpg`
- Year dropdown, a month list on the left, the payslip rendered as a document on the right (dark frame), a
  Download Payslip split button, and a link to download all payslips.

### Income tax — `#/myfinances/pay/incometax/IN/FY/<year>`
Shots: `myfinances-pay-incometax-01.jpg`
- Financial-year picker and a download icon. An "Important!" box explains the calculation basis.
- A summary figures row, then lettered sections (A: gross earnings) as a month-by-month grid; a legend marks
  previous employer, current employer and projected months.

### Declaration — `#/myfinances/managetax/declaration/summary`
Shots: `myfinances-tax-declaration-01.jpg`
- Two window cards with an OPEN tag: Investment Declaration (current and monthly window) and Proof Submission.
- Three big figure cards (net taxable income with a link to the computation, total tax payable, tax paid).
- Inner tabs per section (deductions, other deductions, allowances, house property, other income), then a
  My Declarations table (declarations, count, declared, proof submitted, rejected, accepted).

### Previous income, forms, tax filing, tax-saving — `#/myfinances/managetax/*`
Shots: `myfinances-tax-previous-income-01.jpg`, `myfinances-tax-forms-01.jpg`, `myfinances-tax-filing-01.jpg`,
`myfinances-tax-saving-01.jpg`
- Previous income: a help link and a green note when it is not needed this year.
- Forms: two cards (annual salary certificate, investment proof form), each with a year picker and Download;
  an empty state when not yet released, and a partner link to file returns.
- Tax filing: an ITR due-date banner and a featured partner card with steps; other partners below.
- Tax-saving investment: two partner cards with bullets and "Invest & Save Tax" (links out; not followed).

## Org

### Employee directory — `#/org/employees/directory`
Shots: `org-directory-01.jpg`
- See `keka-map.md`: org filters, "Showing N of N", three-column person cards.

### Organisation tree — `#/org/employees/tree`
Shots: `org-tree-01.jpg`
- See `keka-map.md`: box chart with expand counts, "Go to: my department / top / me", group by department, zoom.

### Organisation documents — `#/org/documents/org/folder/<id>`
Shots: `org-documents-01-folders.jpg`
- A note that admins upload these and every employee can view them.
- Left: searchable folder list with a document count under each folder.
- Right: folder header, then a table (document title as a link, description, expiration date, size, last updated).

### Org › Engage and Org › Helpdesk — `#/org/engage`, `#/org/helpdesk`
Shots: `org-engage-01-moved-note.jpg`, `org-helpdesk-01-moved-note.jpg`
- Old tabs kept as stubs: a blue line "moved to the left nav menu" with a link. Nothing else.

### Refer & apply — `#/org/hiring/refer-apply`
Shots: `org-hiring-refer-apply-01.jpg`
- Left: job openings (empty: "Job openings not available").
- Right: a side card with tabs My Referrals / My Application; each referral shows the candidate, role, date and
  an "In process" status dot.

## Engage

### Announcements — `#/engage/announcements/list`
Shots: `engage-announcements-01.jpg`
- Tabs with counts: Active, Drafts, All. Filters: date range, announcement type, status, search.
- Announcement cards: a cover image with a "Live" tag, title, like and comment counts, author and time, a menu.

### Surveys — `#/engage/survey-revamp/survey-dashboard`
Shots: `engage-surveys-01.jpg`
- Tabs with counts (Active, Drafts, All); grid / list view switch; "New survey" split button (not clicked).
- Filters: created on, type, search. Blue "No Results Found".

### Polls — `#/engage/polls/list`
Shots: `engage-polls-01.jpg`
- Left "Options" filter panel with Reset: search, added by (employee search), a switch "Exclude polls from Wall",
  date range, department, location.
- Right: poll cards (question, author, date, a "Wall" tag, result bars with % and votes, end date, voter total,
  Like / Comment).

### Articles — `#/engage/articles/home`
Shots: `engage-articles-01.jpg`
- Sub-tabs Home / Categories. Two sections: Recent Articles, Most Popular Articles (both empty).

## Helpdesk

### Tickets — `#/helpdesk/tickets/open`, `closed`, `mytickets`, `ticketsfollowing`
Shots: `helpdesk-tickets-open-01.jpg`, `helpdesk-tickets-closed-01.jpg`, `helpdesk-tickets-mine-01.jpg`,
`helpdesk-tickets-following-01.jpg`
- Inner tabs: Open Tickets, Closed Tickets, Raised by me, Following.
- Open (agent view): date range, category, sub-category, priority, ticket status, assigned to, escalation reason.
- Closed: adds closing reason and score (satisfaction) filters; columns include closed on, priority, escalation
  reason, first-response (FRT) status, resolution status, closed by — SLA tracking is visible.
- Raised by me: "+ New Ticket"; two tables (open, closed) each with search and a "Last 3 months" period picker;
  columns: number, title (with category under it), raised on, priority, category, assigned to, status, updated.
- Following: same two tables for tickets the person follows.

### Raise a ticket — drawer on `#/helpdesk/tickets/mytickets`
Shots: `helpdesk-tickets-mine-02-raise-ticket-drawer.jpg`
- Right drawer: category dropdown, one-line title, a rich-text box (bold, italic, underline, lists, quote, link),
  Attach File with an info tip. Footer: Cancel and "Raise ticket". Closed with Cancel, nothing typed.

### Ticket detail — `#/helpdesk/ticket/<id>/details`
Shots: `helpdesk-ticket-detail-01.jpg`
- "Back to all open tickets" link; header with number, title and an "Open" status pill.
- Left: the conversation as chat bubbles with timestamps, a rich-text reply box at the bottom.
- Right: ticket raised on, category, assigned to (avatar chip), Ticket followers.

## Performance (company menu)

### KRAs — `#/performance/objectives/*`
Shots: `performance-kras-insights-01.jpg`, `performance-kras-department-01-empty.jpg`,
`performance-kras-manage-01.jpg`
- Sub-tabs: Insights, Me, My Team, Department, Company, Manage KRAs. "Me" and "My Team" repeat the pages under
  Me › Performance and My Team › Performance.
- Insights: Direct Reports picker and timeframe picker on top of the same stat cards and charts as team insights.
- Manage KRAs: title with a scope dropdown ("of Direct Reports"), KRAs / Employees toggle, "Import kras & kpis" and
  "+ Add kra" split buttons (not clicked), count tabs (all, pending approval, unaligned, not updated), and seven
  filters (time frame, type, approval, owner, progress, worker type, department).

### 1:1 meetings — `#/performance/oneonone/me/meetings`, `/actionitems/me`
Shots: `performance-oneonone-me-01.jpg`, `performance-oneonone-actionitems-01.jpg`
- My Meetings mirrors Me › 1:1 meetings.
- Action Items: every action item from all meetings in one table (name, employee, department, sub-department,
  due date, status), filters for status and date range.

### Salary & promotion — `#/performance/salary-promotion/*`
Shots: `performance-salary-promotion-pending-01.jpg`, `performance-salary-promotion-all-01.jpg`
- Pending: "My team" scope, tabs Pending revisions & promotions / Finalised with counts; filters (review cycle,
  review group, pay grade, pay band, status, business unit, department); columns: employee, cycle, rating,
  status, salary change, job title change, waiting on, actions.
- All revisions: history per person (rating, job title change, "View history"), download.
- Ties review ratings straight to salary and title recommendations by the manager.

### Skills — `#/performance/skills/*`
Shots: `performance-skills-mine-01.jpg`, `performance-skills-team-01.jpg`, `performance-skills-update-requests-01.jpg`
- My skills and My team's skills repeat the Me and My Team skills pages.
- Manage update requests: Pending requests / Past requests tabs for skill changes that need approval.

## Project

### Project list — `#/project-timesheets/projects/list/active-projects`
Shots: `project-list-01-active.jpg`
- Tabs: Active projects, All projects, Archived projects.
- Billing model filter, search, a column-chooser icon and a saved-view picker ("Standard View").
- Columns: project (name + code), client, billing model, start and end date, created on, project managers, actions.

### Project page — `#/project-timesheets/projects/<id>/summary`
Shots: `project-detail-01-overview-top.jpg`, `project-detail-02-overview-charts.jpg`, `project-detail-03-team.jpg`,
`project-detail-04-tasks-list.jpg`, `project-detail-05-tasks-board.jpg`, `project-detail-06-reports.jpg`,
`project-detail-07-settings-view.jpg`
- Header: name, code, client; client manager, project manager, status, start date; a "⋮" menu.
- Tabs: Overview, Team, Tasks, Reports, Settings.
- Overview: "Project intelligence dashboard" with next refresh time; burndown chart (actual vs ideal effort,
  period picker); estimated vs actual hours per task (bars); right rail with Actions pending (timesheet approvals
  and submissions with counts), written insights ("variance decreased by …", "no one on leave this week"),
  Project health (blurred upsell), Employees on leave.
- Team: Active / Inactive allocation; filters; "Add Resource"; columns: resource, department, sub-department,
  allocation duration with %, billability, billing role and site, edit / delete / menu (not clicked).
- Tasks: "+Add task" split button, search, stage and assignee filters; three views — list (phase, task,
  milestone tree with duration, billability, submitted vs estimated hours, stage, avatars), compact list, and a
  board grouped by stage (not started, in progress, on hold, completed) with hour bars on cards.
- Reports: two linked reports (resource work hours, task work hours).
- Settings (viewed only): left menu — approval chain, project manager permissions, team permissions, time entry
  settings, billing; approval chain shows "Timesheet approvals: 2 approvers in 1 level".

### Project health — `#/project-timesheets/projects/upgrade/project-health`
Shots: `project-health-01-upsell.jpg`
- An upgrade page: screenshot carousel on the left, three ticked benefits and "Request a call to learn more"
  (not clicked).

### Project analytics — `#/project-timesheets/analytics/reports`
Shots: `project-analytics-reports-01.jpg`
- The shared reports library: categories (clients & project, work hours, status, scheduled), favourites, recently
  used cards.

## Pages not opened or partly covered

- Me › Attendance "Regularize" form: not reopened this round (earlier shots cover the day panel).
- Me › Helpdesk tab: it is the same Helpdesk area, covered under Helpdesk.
- Direct routes `#/me/performance/reviews/reviewsgiven` and `#/myteam/summary/peers` do not exist; the real pages
  were reached through on-page tabs (`/reviews-to-others`, `/peer`).
- Buttons that create or change things were not clicked: Schedule 1:1, Create Template, Add KRAs, Add an employee
  to PIP, New survey, Add Resource, Add task, Import, Remind, Request a call, Invest / File now (external links).
- Shot of the Least Hours Worked pie is partial (top cut) in `myteam-attendance-negligence-02-hours-pie-breaks.jpg`.

## Ideas YukthiX may be missing

1. **Inbox as a three-column approval desk** — groups with counts, request list, detail with Approve / Reject and a
   comment box, plus a 3-month Archive with the approval trail. Inbox (`inbox-01-take-action-regularization.jpg`,
   `inbox-05-archive.jpg`).
2. **"No teammates are on leave on this day" in the approver's view** — clash check where the decision is made.
   Inbox › Leave (`inbox-02-take-action-leave.jpg`).
3. **Team leaderboards for punctuality and effort** — top-5 list beside a daily chart with average / least / max.
   My Team › Efforts (`myteam-attendance-efforts-01-on-time-leaderboard.jpg`).
4. **Negligence view** — late arrivals, least hours (hour-band pie), frequent breaks in the same card layout.
   My Team › Negligence (`myteam-attendance-negligence-01-late-arrivals.jpg`).
5. **Team calendar with coloured day dots and a full legend**, for direct reports and peers.
   My Team › Summary (`myteam-summary-04-peers-team-calendar.jpg`).
6. **Bulk shift / weekly-off / penalty-policy assignment** with tick-to-enable bulk buttons and import.
   My Team › Employee assignments (`myteam-attendance-assignments-01-table.jpg`).
7. **Reports library pattern** — categories, search, favourites, recently used, scheduled reports, report cards
   with a one-line description; reused in every area. My Team › Attendance reports
   (`myteam-attendance-reports-01-home.jpg`), Leave reports (`myteam-leave-reports-01.jpg`).
8. **Timesheet approval drill-down** — week → day → task in place, By date / By task, Employee / Project view.
   My Team › Timesheet (`myteam-timesheet-approvals-03-week-expanded.jpg`, `myteam-timesheet-approvals-05-project-view.jpg`).
9. **Multi-year weekly hours area chart** that makes missed weeks jump out. Me › Time summary
   (`me-timesheet-06-time-summary-chart.jpg`).
10. **Expenses saved before claiming** plus a split receipt-preview / fields form with "Save and Add Another".
    Me › Expenses (`me-expenses-pending-02-add-expense-form.jpg`).
11. **KRA insights with "Employees without KRAs → Remind"** and a per-person status table.
    My Team › KRA insights (`myteam-performance-insights-01-top.jpg`).
12. **Feedback hub with Quick actions rail** (praise, personal feedback, internal note, request feedback).
    My Team › Feedback (`myteam-performance-feedback-01.jpg`).
13. **Praise as a certificate card in the feed** with badge types and a project tag. Home (`home-03-left-widgets-praise.jpg`).
14. **Polls with a filter panel and "Exclude polls from Wall"**, results as bars with % and votes.
    Engage › Polls (`engage-polls-01.jpg`).
15. **Helpdesk SLA columns** (first-response status, resolution status, satisfaction score filter) and ticket
    followers. Helpdesk (`helpdesk-tickets-closed-01.jpg`, `helpdesk-ticket-detail-01.jpg`).
16. **Salary revision timeline** with a "Current" tag and per-revision breakdown. My Finances
    (`myfinances-pay-salary-01-timeline.jpg`).
17. **Tax declaration windows as cards with an OPEN tag** (declaration and proof windows with dates).
    My Finances › Declaration (`myfinances-tax-declaration-01.jpg`).
18. **Masked IDs with an eye to reveal and a "Verified" tag** on identity documents. My Finances › Summary
    (`myfinances-summary-01-top.jpg`).
19. **Salary & promotion recommendations tied to review ratings**, pending / finalised. Performance
    (`performance-salary-promotion-pending-01.jpg`).
20. **Project page with an intelligence rail** — actions pending, written insights, who is on leave, burndown and
    estimate-vs-actual charts; tasks as list or board. Project (`project-detail-01-overview-top.jpg`,
    `project-detail-05-tasks-board.jpg`).
21. **Competencies and core values page** telling each employee what is expected, with weightage and behaviours.
    Me › Performance (`me-performance-competencies-01-top.jpg`).
22. **Read-only completed review form** with rating band, reviewer picker, questions and projects tabs.
    Me › Reviews (`me-performance-reviews-03-review-form-view.jpg`).
23. **Friendly per-tab empty states** with one motivating line and the next action ("Request feedback",
    "You're on track"). Me › Feedback, PIP (`me-performance-feedback-02-feedback-received.jpg`,
    `me-performance-pip-01-in-process.jpg`).
24. **Moved-page stubs** that point to the new place instead of a 404. Org › Engage (`org-engage-01-moved-note.jpg`).
