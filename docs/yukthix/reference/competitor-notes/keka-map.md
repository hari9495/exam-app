# Keka: what it has, area by area (for the compare step)

Seen 16 Nov 2026 with the founder's own employee login (an employee who also approves for a team). Layout and flow
only; no colleague names, salaries, bank or tax figures are recorded here. Pages listing other employees (directory,
org tree, team attendance and approvals) were not read in detail: they show other people's data, so only their menu
names are noted. Zoho People comes next, in the same shape, then we compare and pick per row.

Detailed attendance and leave rows: `attendance-and-leave.md` (A1–A14, L1–L9).

## Navigation shape

- **Left rail:** Home, Me, Inbox (with a count), My Team, My Finances, Org, Engage, Helpdesk, Performance, Project.
- **Under "Me":** tabs along the top: Attendance, Timesheet, Leave, Performance, Expenses & Travel, Helpdesk (moved to the rail), Apps.
- **Each tab:** has its own sub-tabs in a second row.
- **Search box in the top bar:** "Search employees or actions (Ex: Apply Leave)" with Alt + K, so an action can be started from search.

## Home

- **Welcome banner:** with the person's name.
- **Quick access cards:**
  - Time today: live clock, Web clock-in and an "Other" menu.
  - Project time today: "Add time entry".
  - Inbox: tasks waiting with "Take action".
  - On leave today.
  - Working remotely.
- **Right column:** the organisation feed (post, poll, praise), announcements, then birthdays, work anniversaries and new joinees as tabs, with upcoming birthdays.

## Inbox

- **Three tabs:** Take action (count), Notifications, Archive.
- **Take action groups pending tasks by kind with counts:** leave requests, attendance regularisation, timesheet approvals.
- **Each task card:** shows who asked, how long ago, the date, the reason and the request time, with actions on the card.
- **Sorting:** newest first.

## Me › Timesheet

- **Sub-tabs:** All timesheets, Past due, Rejected timesheets, Project time, Time summary, My tasks, Projects allocated.
- **Weekly grid:** described in the timesheet reference already built (total bar, project and task, day columns, comment pop-up, total hours per day, Request leave, Attach file, Save, Submit weekly timesheet, Comment summary and Timesheet activity below).
- **List / grid view switch** on the timesheet.
- **Time summary:** a bar chart of hours per week across the year, then a table of every week (period, total hours, status: waiting for approval / approved), with download.
- **My tasks:** a table of tasks (phase, project, project manager, end date, hours logged against an estimate, task stage), filtered by stage.
- **Project time:** the person's projects grouped by client or practice.
- **Rejected timesheets:** a friendly empty state when there are none.

## Me › Performance

- **Sub-tabs:** KRAs, 1:1 meetings, Feedback, PIP, Reviews, Skills, Competencies & core values.
- **KRAs:**
  - My, Department and Company KRAs.
  - Timeframe selector (e.g. H2-2026), filters (KRA type, status, tags).
  - Average progress %.
  - Progress by status: on track, needs attention, at risk, closed, not started.
- **Reviews:** My performance reviews and Reviews given to others, split into Active and Completed.
- **Skills:**
  - Totals: number of skills, categories, average rating, pending requests.
  - Table: skill, category, rating out of 5, certifications, experience, actions.
  - Update skills and assign skills.

## Me › Expenses & Travel

- **Sub-tabs:** Pending expenses, Past claims, Advance requests.
- **Pending expenses:**
  - "Expenses to be claimed" with "+ Add an expense" (expenses saved first, claimed later).
  - Then "Expense claims in process": claim number, claim, expense count, approved amount, status, action taken by, waiting on, actions.

## Me › Apps

- My apps (org-enabled, installed) and an apps centre: for example Teams and Outlook for 1:1 check-ins, Jira for goals, a tax filing partner.

## My Team (manager view)

- **Tabs:** Summary, Attendance, Leave, Expenses & Travel, Timesheet (count), Profile changes, Performance, Hiring.
- **Summary:** Direct reports or peers switch, then:
  - who is on leave today;
  - not in yet today;
  - on time today (count, view employees);
  - late arrivals today (count, view employees);
  - work from home or on duty today.
- **Attendance:**
  - approvals, overtime approvals, bulk regularise and cancel penalties, shift and weekly-off approvals;
  - efforts and punctuality, negligence;
  - employee assignments, reports.
- **Leave:** leave overview, approvals, penalised leave, past requests, encashment requests, reports.
- **Expenses:** waiting for approval, approved claims, past claims, past advances.
- **Timesheet:** approvals, project time, week summary, reports.
- **Profile changes:** approvals and past changes (employees' own profile edits need approval).
- **Performance:** KRA insights, team KRAs, feedback, PIP, reviews, skills, reports.
- **Hiring:** requisitions, internal job applications.

## My Finances

- **Tabs:** Summary, My pay, Manage tax.
- **Summary:**
  - Payroll summary: last processed cycle, working days, loss of pay, view payslip.
  - Payment information: payment mode, bank, account, IFSC, name on account.
  - Statutory information (PF and similar).
- **My pay:**
  - My salary.
  - Payslips: year selector, a month list on the left, the payslip on the right with download.
  - Income tax.
- **Manage tax:**
  - Declaration: the financial year, which tax regime the income is computed under, the investment declaration window with its dates and the monthly window, proof submission.
  - Previous income, forms, tax filing, tax-saving investments.

## Org

- **Employees:** employee directory, organisation tree.
- **Documents:** organisation documents.
- **Also:** Engage, Helpdesk, and Hiring › Refer & apply (internal jobs and referrals).

## Engage

- Announcements, surveys, polls, articles.

## Helpdesk

- **Tickets:** open, closed, raised by me, following.

## Performance (company level)

- **KRAs:** insights; me, my team, department, company; manage KRAs.
- **1:1 meetings:** my meetings, action items, agenda templates.
- **Salary & promotion:** pending revisions and promotions, all revisions and promotions.
- **Skills:** my skills, my team's skills, manage update requests.

## Project

- **Projects:** list, project health.
- **Analytics:** reports.

## First thoughts for the compare step

- **Patterns worth weighing:**
  - search that starts actions (Alt + K);
  - an Inbox that groups pending approvals by kind with counts;
  - "expenses to be claimed" saved before claiming;
  - profile changes that need approval;
  - a My Team summary of today (on leave, not in, late, WFH);
  - the time summary chart per week;
  - the payslip month list beside the payslip.
- **YukthiX already has much of this in its own shape:** the Home today card, approvals, the people directory, payslips, tax declaration, Helpdesk, Engage, performance and projects. The compare step is row by row once Zoho is noted.

## Team and directory pages (screenshots with the founder's approval, 16 Nov 2026; layout only, no names)

- **My Team › Summary:**
  - Direct reports / Peers switch.
  - Two wide cards: "Who is on leave today", "Not in yet today".
  - Four count cards, each with a coloured left edge: on time today, late arrivals today, work from home / on duty today, remote clock-ins today.
  - Then a **team calendar**:
    - one row per person (photo, name), one column per day of the month;
    - each day is a coloured dot: work from home, on duty, paid leave, unpaid leave, leave for no attendance, weekly off, holiday;
    - a legend below, and markers on the day headers when someone is on leave or WFH;
    - month arrows.
  - Then the direct reports list.
- **My Team › Attendance › Approvals:**
  - Sub-tabs: approvals, OT requests, regularise & cancel penalties, shift & weekly off, efforts / punctuality, negligence, employee assignments, reports.
  - The approvals page stacks three sections: pending regularisation, pending work from home / on duty, pending remote clock-in. Each has an empty state ("Hooray, no pending …").
  - The regularisation table:
    - filters: business unit, department, location, legal entity, request type, request status, requested on, search;
    - Approve / Reject for many at once;
    - columns: employee number, department, location, business unit, legal entity, attendance date (with an icon), request type, requested on / by;
    - row actions: approve (tick), reject (cross), comment;
    - total count and pages.
- **My Team › Leave › Overview:**
  - Sub-tabs: overview, approvals, penalised leave, past requests, encashment, reports.
  - A leave consumption trend: totals per leave type across the top, then a line chart per type over the chosen week, and a date range.
  - Three cards: unplanned leave (who, instances), no leave taken, most leave taken.
- **My Team › Timesheet › Approvals:**
  - Employee view / Project view.
  - Left: a list of people with how many weeks are waiting and how long ago (searchable).
  - Right: the chosen person's weeks:
    - columns: dates, submitted on, number of tasks, status, billable, non-billable, total hours;
    - By date / By task toggle;
    - Approve / Reject for selected weeks;
    - each week can be opened.
- **Org › Employee directory:**
  - Filters: business unit, department, location, cost centre, legal entity, search; "Showing N of N".
  - Cards in three columns: photo or initials, name, job title, department, location, email, phone.
- **Org › Organisation tree:**
  - A chart of boxes (photo, name, title, department) with a count badge to expand reports.
  - Search, "Go to: My department / Top of the org / Me", "Group by department", zoom.

**Ideas from these for the compare step:**
- The team calendar with coloured day dots and a legend.
- Stacked approval sections with friendly empty states.
- Timesheet approvals as people on the left and their weeks on the right.
- The org tree's "Go to me / top / my department".
