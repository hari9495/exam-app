# Zoho People: page-by-page reference

Seen 17 Nov 2026 with the founder's own login (Super Administrator, India data centre). Look-only: nothing was
checked in, approved, submitted, saved, sent, enabled or deleted. Forms and editors were opened only to screenshot
them, then closed with Cancel, X or Escape with nothing typed or selected.

Screenshots are in `shots/zoho/` next to this file. That folder is gitignored because the screenshots show real
account data. This file holds layout and features only: no names, emails, phones, salaries, IDs or company details.

The account is almost empty (two users, no leave history, no performance set-up, the founder's record has no date of
joining). So most module pages show their empty state. The admin and settings pages are full, and they hold most of
the value here.

Same shape as `keka-pages.md`, so builders can compare row by row.

## Navigation shape

- **Top bar (dark navy):** area tabs on the left (change per module: My Space / Team / Organization on Home,
  My Data / Team / Holidays in Leave Tracker, and so on). On the right: a blue "+" quick-create button, search,
  bell, settings gear, avatar, and the Zoho apps grid.
- **Second row:** sub-tabs under the active area tab, underlined in blue.
- **Left rail (dark navy, icon + label):** Home, Onboarding, Leave Tracker, Attendance, Time Tracker, one "recent"
  slot, More, then Operations and Reports pinned at the bottom.
  - The fifth slot is not fixed. It shows the last module opened from More (Performance, then LMS, Files, Tasks,
    General...). Clever: the rail stays short but the module you are using is always one click away.
- **More menu:** a slide-out panel with a search box, "More Services" and a Preferences link, then one card per
  module: Performance, LMS, Files, Employee Engagement, HR Help Desk, HR Letters, Travel, Tasks, Compensation,
  General (minus the one already in the rail).
- **Right rail (thin):** three small app shortcut icons, plus accessibility and dark-mode buttons at the bottom.
- **Bottom bar:** chat-app strip (My Pins, Chats with a red count, Channels, Threads, People) on the left; a green
  "Support Hub" button, an announcement icon and search on the right. These belong to the bundled chat app and were
  not opened.
- **Three layers for every module:**
  1. the module itself (employee and manager views),
  2. **Operations** (admin data work: user-specific edits, bulk lists, imports),
  3. **Settings** gear (policy and rules).
  Each Settings page has a "Go to Operations" link, and each Operations page has a back arrow.
- **Data pages use one shared list template** ("form view"): a saved-view dropdown with "Edit", "View All Data",
  a scope dropdown ("Reportees + My Data" / "All Data"), a blue Add button, a full-screen icon, a filter icon and a
  "..." menu. The table has sortable columns, a column-chooser icon, row checkboxes, a record count and a pager.
- **Every empty state** uses the same blue robot illustration plus one line, and often one primary button.

---

## Shell

### Quick-create "+" menu
Shots: `shell-quick-create-01-menu.jpg`
- Dropdown titled "Quick Actions" with a gear (to customise it) and a search box.
- Items: Candidate, Employee, Department, Designation, Leave, Address Proof, Bonafide Letter, Experience Letter,
  Travel Request, Travel Expense, Task, Exit Details.
- One place to start any record type, from any page.

### More menu
Shots: `shell-more-menu-01.jpg`
- Slide-out panel over the page, with search, Preferences and stacked module cards with icons.

### Notifications and search
Shots: `shell-notifications-01-empty.jpg`, `shell-search-01-employee-search.jpg`
- Bell opens a right-hand drawer, "Notifications", with an empty-state robot.
- Search icon turns the top bar into a wide "Search Employee" box with a "Search across Zoho" link on the right.

---

## Home › My Space

### Overview — `#home/myspace/overview-actionlist` and sibling tabs
Shots: `myspace-overview-01-activities.jpg` to `myspace-overview-15-related-data.jpg`
- Full-width cover photo. Left card: photo, employee code and name, designation, a red "Yet to check-in", a live
  00:00:00 timer and a green outlined Check-in button (not clicked).
- Right side: one card with a row of tabs and a "..." for more tabs, plus a customise icon. Tabs: Activities,
  Feeds, Profile, Approvals, Leave, Attendance, Time Logs, Timesheets, Jobs, Files, Career History, HR Help Desk,
  Goals, Feedback, Related Data.
- **Activities:** a time-of-day greeting card (moon icon in the evening), a "Work Schedule" card for this week as a
  dot timeline with the shift name and hours, weekends marked "Statutory (Weekend)" in orange, and a nudge card
  "You are yet to submit your time logs today!".
- **Feeds:** a status composer ("Type @ to mention someone"), then filter tabs All, Status, Announcement, Approvals,
  Mail Alerts, Holidays.
- **Profile:** icon tiles (location, department, shift, time zone, email), then "About Me" with a pencil
  ("Write a short introduction about yourself"), then "Organization Structure".
- **Leave** and **Career History** are blocked with a clear reason: "date of joining is not yet updated". Good
  pattern: the empty state tells you which missing field causes it.
- **Attendance:** this week as rows (day, shift chip, check-in/out text), weekends tinted yellow.
- **Time Logs:** an inline timer bar (project, job, "What are you working on?", billable dropdown, a green start
  timer). Not clicked.
- **Goals:** "This week / All" switch and a "+". **Related Data:** collapsible rows (Exit Details, Travel Expense,
  Travel Request) each with "+" and a count.
- Other tabs show one-line empty states.

### Dashboard — `#home/myspace/dashboard`
Shots: `myspace-dashboard-01-top.jpg`, `myspace-dashboard-02-middle.jpg`, `myspace-dashboard-03-bottom.jpg`
- Three-column grid of equal widget cards with a refresh and a customise icon on the top right.
- Widgets: Birthday, New Hires, Favorites, Quick Links (+), Announcements (+), Leave Report, Upcoming Holidays,
  My Pending Tasks (count chip), My Files (Organization Files / Employee Files tabs, total count), Work Anniversary,
  Wedding Anniversary, Employee Engagement (pending surveys count), Upcoming Sessions (LMS).
- Each widget has its own one-line empty state.

### Calendar — `#home/myspace/calendar`
Shots: `myspace-calendar-01-month.jpg`
- Month grid with arrows and a date-picker icon. Each past working day carries a red "Absent" chip.
- Weekend columns tinted pale yellow, today in a blue pill.

### Delegation — `#home/myspace/delegation`
Shots: `myspace-delegation-01-empty.jpg`
- Empty state that explains the feature: "Delegation lets you reassign approvals from one employee to another for a
  specific time frame", with "Add Delegation".

## Home › Team

### Team Space — `#home/team/space-messages`
Shots: `team-space-01-department-wall.jpg`
- Three columns. Left: department card (initials tile, team strength), Team Availability (yet to check-in count),
  Location Diversity.
- Middle: Department Wall, Groups, Surveys tabs; a post composer for the department.
- Right: Work Anniversary, New Hires, Birthday Buddy, Department Files cards.

### Department — `#home/team/myteam`
Shots: `team-department-01-members.jpg`
- Department and location dropdowns, a member count on the right.
- People grouped in cards by designation, each row with code, name and live status ("Yet to check-in" in red).

### Approvals — `#home/team/approvals`
Shots: `team-approvals-01-empty-filters.jpg`, `team-approvals-02-filter-panel.jpg`
- Active filters shown as removable chips (Status : Pending, Approver, Employee Status) with "Reset".
- Filter icon opens a right drawer: Approver, Record owner, Forms, Status, Employee Status, then Apply and Reset.

## Home › Organization

### Overview — `#home/organization/overview-services`
Shots: `org-overview-01-services.jpg`, `org-overview-02-location-map.jpg`
- Cover photo with "Edit Cover Photo". Left: company card (logo, city, website) and Quick Links with "+".
- Right: Services and Location tabs. Services is a two-column list of every module with icons (a module directory).
- Location shows office cards on the left and a live map on the right.

### Announcements — `#home/organization/announcements/list`
Shots: `org-announcements-01-empty.jpg`
- "Add Announcement" button, search and filter icons, empty state.

### Policies — `#home/organization/policyfiles`
Shots: `org-policies-01-empty.jpg`
- "Manage" button, list / folder view switch, filter. Empty: "No shared files to display".

### Employee Tree and Department Tree
Shots: `org-employee-tree-01.jpg`, `org-department-tree-01.jpg`
- Employee Tree: org chart of person cards, with print and filter icons.
- Department Tree: department cards on the left (initials tile, name), with a blue count badge linking to member
  cards on the right.

### Department Directory — `#home/organization/departmentdirectory-...`
Shots: `org-department-directory-01.jpg`
- Master-detail: searchable department list on the left; on the right a header with the member count and
  photo cards (photo, code, name, email, designation, department, live status).

### Birthday Folks, New Hires, Calendar
Shots: `org-birthday-folks-01-empty.jpg`, `org-new-hires-01-empty.jpg`, `org-calendar-01-month.jpg`
- Birthday Folks: Today / This week dropdown, a date stepper, search. New Hires: last 15 days.
- Organization Calendar: month grid with a filter icon (holidays and events).

---

## Onboarding

### Candidate list — `#onboarding/candidate/listview`
Shots: `onboarding-candidate-01-list.jpg`, `onboarding-candidate-02-more-menu.jpg`
- Shared list template. Columns: First name, Last name, Email ID, Official Email, Onboarding Status
  ("Not Triggered"), Company, Business Unit, Division and more (scrolls sideways).
- "..." menu: Import, Export, Bulk File Upload, E-Sign Documents, **Show masked data**.

### Candidate record — `#onboarding/candidate/view-recordId:...`
Shots: `onboarding-candidate-03-record-top.jpg`, `onboarding-candidate-04-record-middle.jpg`,
`onboarding-candidate-05-record-bottom.jpg`
- Opens as a large modal with a header (photo, code, name), and edit, info and "..." icons.
- Two-column label/value grid in sections: Candidate Details, then Education and Experience as small tables, then
  "Related Forms" (E-Signature Documents with "+").
- UAN, Aadhaar and PAN show as `**********` by default (masking).
- Hovering a value shows a pencil for inline edit (not used).

---

## Leave Tracker

### My Data › Leave Summary — `#leavetracker/mydata/summary-mode:list`
Shots: `leave-mydata-01-summary-blocked.jpg`
- Blocked for this user: "Update the Date of Joining for this employee to display their leave information",
  where "Date of Joining" is a link straight to the employee record. Good fix-it link.

### My Data › Leave Requests — `#leavetracker/mydata/applications`
Shots: `leave-mydata-02-requests-empty.jpg`, `leave-mydata-04-requests-view-dropdown.jpg`
- View dropdown (Public views: Leave, plus "Create View"), filter and "..." icons. Empty state with "Add Request".

### My Data › Shift — `#leavetracker/mydata/employeeshiftmapping`
Shots: `leave-mydata-03-shift-week.jpg`
- Weekly / Monthly switch, week stepper, "Assign shift" button.
- Day rows against an hour axis (08 AM to 06 PM) with the shift drawn as a bar. Weekend rows tinted yellow.

### Team › On Leave — `#leavetracker/team/availability`
Shots: `leave-team-01-on-leave-week.jpg`, `leave-team-02-on-leave-month.jpg`
- Three view icons: list, week, month. Week stepper. Filter.
- Empty: "No team members on leave this week". Month view is a full calendar grid.

### Holidays — `#leavetracker/holiday`
Shots: `leave-holidays-01-empty.jpg`, `leave-holidays-02-scope-dropdown.jpg`
- Range set to the financial year (01-Apr to 31-Mar), list / calendar switch, "Add Holidays" split button.
- Scope dropdown: My Holidays, All Holidays, then grouped by Location and by Shift. Holidays can differ per
  location and per shift.

---

## Attendance

### Attendance Summary — `#attendance/entry/summary-mode:list|tabler|calendar`
Shots: `attendance-summary-01-list-week.jpg`, `attendance-summary-02-request-menu.jpg`,
`attendance-summary-03-tabular.jpg`, `attendance-summary-04-calendar.jpg`
- Top card: shift name and hours, a note box "Add notes for check-in", and a big green "Check-in 00:00:00 Hrs"
  button (not clicked).
- Three views:
  - **List:** one row per day with a timeline track, "Statutory (Weekend)" labels and "Hrs worked" on the right.
  - **Tabular:** Date, First In, Last Out, Total Hours, Payable Hours, then Present / Late Night / Total /
    Overtime grouped under "Present".
  - **Calendar:** month grid with red "Absent" chips.
- Request split button: Regularization, On Duty.
- **Sticky footer:** Days / Hours toggle, then coloured counters: Payable Days, Present, On Duty, Paid leave,
  Holidays, Weekend, "...", plus the shift name. An hour ruler runs across the bottom.

### Regularization, On Duty — `#attendance/entry/regularization`, `/onduty`
Shots: `attendance-regularization-01-empty.jpg`, `attendance-regularization-02-status-filter.jpg`,
`attendance-onduty-01-empty.jpg`
- Month stepper, status dropdown (All, Submitted, Cancelled), Add Request, filter, "...". Total Record Count footer.

### Shift — `#attendance/entry/employeeshiftmapping`
Shots: `attendance-shift-01-week.jpg`
- Same weekly shift timeline as in Leave Tracker (shift lives in both modules).

---

## Time Tracker

### Time Logs — `#timetracker/mydata/timelogs-mode:list`
Shots: `timetracker-timelogs-01-list.jpg`
- "Log Time" split button, list / calendar switch, filter, "...". Week stepper.
- Inline timer bar: Select Project, Select Job, "What are you working on?", Billable dropdown, a notes icon, a link
  icon and a green 00:00:00 start timer.
- Sticky footer counters: Total, Submitted, Not Submitted (with an arrow).

### Timesheets, Jobs, Projects, Job Schedule
Shots: `timetracker-timesheets-01-empty.jpg`, `timetracker-jobs-01-empty.jpg`, `timetracker-projects-01-empty.jpg`,
`timetracker-job-schedule-01-week.jpg`
- Timesheets: month stepper, status dropdown, "Create Timesheet".
- Jobs and Projects: shared list template with an Employee / Department / Division switch.
- Job Schedule: a week grid of days by 24 hours with planned hours per day, Day / Week switch, "Clone",
  "0 pending changes" and a "Published" button. Schedules are drafted, then published. Not clicked.

### Team › Clients — `#timetracker/team/clients/listview`
Shots: `timetracker-team-clients-01-empty.jpg`
- Client list with "Add Client".

---

## Performance

### Getting Started — `#performance/gettingstarted`
Shots: `performance-getting-started-01-review-methods.jpg`, `performance-getting-started-02-review-types.jpg`,
`performance-getting-started-03-how-to.jpg`
- The module is not switched on. Left: title, short blurb, illustration. Right: a three-step explainer card.
  1. Review Methods: KRA, Goals, Skill Set, Competency.
  2. Review Types: Self, Multi-Rater, Manager, Continuous.
  3. How to use: a dotted flow "Create an appraisal template → Specify review parameters → Select reviewers →
     Setup rating and normalization".
- "Getting Started" button at the end (not clicked; it would switch the module on).
- LMS "Skill Set" redirects here too, because skills belong to Performance.

---

## More › LMS

### My Data — `#lms/mydata/*`
Shots: `lms-mydata-courses-01-empty.jpg`, `lms-mydata-learning-plans-01-empty.jpg`, `lms-mydata-notes-01-empty.jpg`,
`lms-mydata-assessment-01-empty.jpg`, `lms-mydata-competency-01-empty.jpg`
- Sub-tabs: Courses, Learning Plans, Notes, Assessment, Skill Set, Learning Competency.
- Each empty state says what to do next ("Head to the catalog page to enroll... Click Add Course").
- Notes is a personal note space for learners.

### Team, Catalog, Calendar, Moderation, Course Request
Shots: `lms-team-courses-01-empty.jpg`, `lms-catalog-01-empty.jpg`, `lms-calendar-01-month.jpg`,
`lms-moderation-01-empty.jpg`, `lms-course-request-01-empty.jpg`
- Catalog: Courses / Learning Plans tabs, "Applicable Courses" dropdown, search, filter.
- Calendar: month grid with a Today button and a "Courses" dropdown.
- Moderation: an approval queue for course content ("All Requests").
- Course Request: employees ask for a course that does not exist yet.

## More › Files

### Files — `#files/myfile/pers`, `/me`, `/role`, `#files/team/dept`, `#files/orgfile`
Shots: `files-mydata-personal-01-empty.jpg`, `files-mydata-shared-with-me-01-empty.jpg`,
`files-team-department-01-empty.jpg`, `files-organization-01-empty.jpg`
- My Data: Personal Uploads, Shared with Me, Shared with My Role. Team: Department Files. Organization files.
- Personal Uploads promises privacy: "Other users and administrators do not have access to your personal files".
- List / folder view switch, "Manage" for admins.

## More › Employee Engagement

### Surveys — `#employeeengagement/mydata/mysurveys`, `#employeeengagement/surveys/enps|pulse|fullengagement`
Shots: `engagement-mydata-surveys-01-empty.jpg`, `engagement-surveys-enps-01-empty.jpg`,
`engagement-surveys-pulse-01-empty.jpg`, `engagement-surveys-engagement-01-empty.jpg`
- Three survey types as tabs: eNPS (single 0–10 question), Pulse survey (up to 10 rating questions), Engagement
  Survey (up to 200 questions). Each tab has a create button and a template dropdown arrow.
- Employees see "My Data › Surveys" to answer.

## More › HR Help Desk

### Ask Us and My Requests — `#hrcase/home`, `#hrcase/myrequest/list`
Shots: `helpdesk-ask-us-01.jpg`, `helpdesk-my-requests-01-empty.jpg`
- "Got a question? Find your answers here" hero with a big FAQ search, then category cards with an "Ask Us" button.
- Search FAQs first, raise a case second. Good deflection.
- My Requests empty state: "Raise one to get it answered by experts".

## More › HR Letters

### Address Proof, Bonafide Letter, Experience Letter — `#hrservices/*/listview`
Shots: `hrletters-address-proof-01-list.jpg`, `hrletters-bonafide-01-list.jpg`, `hrletters-experience-01-list.jpg`
- Each letter type is its own tab and its own request form, in the shared list template.
- Columns: Employee ID, Date of request, change in present address, Reason for request, other reason text,
  new present address.

## More › Travel

### Travel Request, Travel Expense — `#travel/travelrequest/listview`, `#travel/travelexpenses/listview`
Shots: `travel-request-01-list.jpg`, `travel-expense-01-list.jpg`
- Shared list template. Request columns: Employee ID, Travel ID, Department, Place of visit, Expected departure,
  Expected arrival, Purpose of visit, and more.
- Expense columns: Employee ID, Travel ID, Added By, Added Time, Modified By, Modified Time.

## More › Tasks

### Tasks and Checklists — `#task/taskuserview/*`, `#task/checklist/*`
Shots: `tasks-my-tasks-01-empty.jpg`, `tasks-track-tasks-01-empty.jpg`, `tasks-all-tasks-01-empty.jpg`,
`tasks-form-view-01-list.jpg`, `tasks-checklists-01-empty.jpg`
- Sub-tabs: My Tasks, Track Tasks (tasks I gave), All Tasks, Form View (raw list).
- Count chips act as filters: Total, Unassigned, Open, Completed.
- Checklists: Track Checklists / Related Checklists (for onboarding and offboarding lists).

## More › Compensation

### My Salary — `#salarydetails/mysalary/view`
Shots: `compensation-my-salary-01-verify-identity.jpg`
- A modal "Verify your Identity" covers the page: compensation needs a fresh sign-in. Not passed (no sign-in by
  rule), so the salary page itself was not seen.
- Settings show the re-auth timeout (15 minutes here).

## More › General

### Exit Details — `#generalservice/exitinterview/listview`
Shots: `general-exit-details-01-list.jpg`
- Exit interview records in the shared list template. Columns: Employee ID, Interviewer, Separation date, Reason for
  leaving, "Working for this organization again", and more.

---

## Operations (admin)

### Operations home — `#operations/home`
Shots: `operations-home-01-services.jpg`
- "Search Operations" box, then a grid of 19 big icon tiles: Onboarding, Employee Information, Leave Tracker,
  Attendance, Shift, Time Tracker, Performance, LMS, Files, Employee Engagement, HR Letters, Travel, Tasks,
  Compensation, General, Offboarding, Assessment, Approvals, Data Administration.

### Employee Information — `#operations/organization/*`
Shots: `ops-employee-info-01-employees-list.jpg` to `ops-employee-info-13-delegation-empty.jpg`
- Tabs: Employees, User-specific Operations, Insights, Departments, Designations, HR Process, Groups, Delegation.
- **Employees list:** shared list template. Available columns include ID, names, nick name, email, photo,
  department, designation, role, employment type, status, source of hire, joining date, current and total
  experience, reporting manager, birth date, age, gender, marital status, about me, expertise, work phone,
  extension, seating location, tags, personal mobile and email, exit date, added/modified by and time, onboarding
  status, present and permanent address, company, business unit, division, Aadhaar, PAN, UAN.
- **Employee record:** modal with sections Basic information, Work Information, Hierarchy Information, Personal
  Details, Identity Information (masked), Contact Details, System Fields, Work experience, Education Details,
  Dependent Details, Separation Information, Related Forms. Lock icons on department and location (changed only
  through HR Process).
  - "..." menu: Audit History, Print, Show masked data, Regenerate Employee ID.
- **User-specific Operations:** one big "Search Employee" box. You pick a person, then act on their data.
- **Insights:** cards for Headcount, Addition and Attrition with this month and year-on-year growth for two years;
  six-month trend line charts (count and %); top-10 pies for designation, department and location.
- **Departments / Designations:** list template with mail alias and audit columns.
- **HR Process:** a log of Department Change, Location Change and Designation Change, with Status, Employee,
  Key Field, Value, Effective date, Process, Reason; "Initiate Process" (not clicked).
- **Groups:** user groups by location, department, designation or role. **Delegation:** admin-level delegation.

### Leave Tracker — `#operations/leavetracker/*`
Shots: `ops-leave-01-user-specific-ops.jpg` to `ops-leave-05-exceptional-working-days.jpg`
- Tabs: User-specific Operations, Leave Requests (All Data), Holidays, Customize Balance, Customize Policy,
  Exceptional Working days.
- **Customize Balance:** a grid of employees against leave types, grouped Paid (Casual, Earned, Maternity,
  Paternity, Sabbatical, Sick) and Unpaid (Leave Without Pay), with a "Customize" button for manual adjustments.
- **Customize Policy:** per-person policy overrides.
- **Exceptional Working days:** mark a holiday or weekend as a working day.

### Attendance — `#operations/attendance/*`
Shots: `ops-attendance-01-user-specific-ops.jpg` to `ops-attendance-04-punch-import-export.jpg`
- Tabs: User-specific Operations, Regularization (all users, with an "Active Users" chip), On Duty,
  Biometric ID mapping, Check-in/out Import & Export.
- Biometric mapping links device user IDs to people.
- Import & Export page: left half imports XLS/XLSX/CSV (5 MB), right half exports with a format radio and
  "Include all check-in / check-out entries". Neither was used.

### Shift — `#operations/shift/*`
Shots: `ops-shift-01-user-specific-ops.jpg`, `ops-shift-02-manage-shifts.jpg`,
`ops-shift-03-employee-shift-mapping.jpg`, `ops-shift-04-shift-groups-empty.jpg`
- Manage Shifts: shift name and time, with a copy icon per row.
- Employee Shift Mapping: a roster grid of people by days with shift chips, Weekly / Daily, a grid / dot view
  switch, "Assign shift".
- Shift Group: groups people for rostering.

### Offboarding, Assessment, Approvals
Shots: `ops-offboarding-01-getting-started.jpg`, `ops-assessment-01-question-bank.jpg`,
`ops-approvals-01-all-approvals.jpg`
- Offboarding is off. Its explainer lists Offboarding Flow (own notice period and clearances), Clearances,
  Exit Interview templates, Generate exit documents, Track Offboarding.
- Assessment: a Question Bank as category cards (Customer Support, IT & Security, Admin & Operations, Marketing &
  Sales, Human Resource, General), each with a question count, plus "Create category", Add Question, Import.
- All Approvals: org-wide pending approvals with filter chips.

### Data Administration — `#operations/dataadministration/*`
Shots: `ops-data-admin-01-import-log.jpg` to `ops-data-admin-05-recycle-bin.jpg`
- Tabs: Import Log, Export Log, Activity Log, Localization, Data Backup, Recycle Bin.
- **Activity Log:** a vertical timeline by date, with a time, an action icon and a plain sentence per event
  ("... has updated the employee onboarding flow", "... has created a new Employee ID generation rule").
  Export and filter icons.
- **Localization:** rename system terms and add languages for forms, fields and views.
- **Data Backup:** full backup with a schedule dropdown and a monthly quota ("Monthly backup 5/5"), plus a log.
- **Recycle Bin:** deleted records per form, restorable for 180 days.

---

## Settings (admin) — gear icon, `#settings/service`

### Settings home
Shots: `settings-home-01-services.jpg`, `settings-home-02-services-bottom.jpg`
- Header card: company, user-licence ring ("1/1"), the admin's name and "Super Administrator".
- Grid of tiles: Manage Accounts, Onboarding, Employee Information, Leave Tracker, Attendance, Shifts, Time
  Tracker, Performance, LMS, Files, Employee Engagement, HR Help Desk, HR Letters, Travel, Tasks, Compensation,
  General, Offboarding, Marketplace, Developer Space, Zia (AI). Then "Custom Services" with "Add Service".
- **Every module's settings use the same top tabs:** Configuration, Extend Service (custom forms and buttons),
  Approvals, Automation (schedulers, workflows, notifications), Permissions. The left column lists that module's
  pages.

### Manage Accounts — `#settings/service/accountsetup/*`
Shots: `settings-accounts-01-users.jpg`, `settings-accounts-02-org-details.jpg`, `settings-accounts-03-roles.jpg`,
`settings-accounts-04-manage-service.jpg`
- Tabs: Users, Organization Setup, User Access Control, Manage Service, Automation, Approvals, Subscription.
- **Users:** left filters All, Login Enabled, Login Disabled, Invited, Downgraded, Employee Profiles. Table: basic
  info, joining date, roles (crown for super admin), location, status, account status. Add User(s), Import.
- **Organization Setup:** Organization Details (logo, name, website, type, contact, address), Organization Policy,
  Organization Structure, Locations (code, time zone, user count), Departments, Designations, Domains and
  Rebranding (verified domains, custom login URL, custom login page, federated sign-in), From Addresses, Email
  Authentication.
- **Organization Policy options:** turn email notifications and chat on or off; let employees hide birthday,
  work anniversary and mobile number; allow search by mobile number; who may update profile pictures and whether
  that needs approval; whether employees may pick their own My Space cover.
- **User Access Control:** General Roles as cards (Admin, Director, Manager, Team Incharge, Team member) with
  members; Specific Role and Specific Role Assignment; Function Based Permissions (per role: search employee,
  delegation, quick links, tags, API access, announcements, trees, birthday buddy, favourites, anniversaries,
  show experience, show location); Administrator (per-service Full / Partial / No access); Applicability groups
  (dynamic groups by role, designation, location, department, employee type, reused by policies and forms).
- **Manage Service:** a numbered, draggable list of all 19 services (OKR and Benefits included) with an on/off
  switch and an edit pencil per row. Order sets the menu order.

### Employee Information — `#settings/service/organization/policy/*`
- Tabs: Policy, HR Process, Extend Service, Automation, Access Control.
- Options: dual reporting managers on/off; Streams (group designations); Employee ID rules (pattern, last ID,
  default rule); Employee Status list (Active, Terminated, Deceased, Resigned, Probation, Notice period, each typed
  Active or Inactive, add more); Career History permissions per role (self / reportees, edit / delete).

### Onboarding — `#settings/service/onboarding/*`
- Preferences: switch Candidate onboarding (pre-joining portal) and Employee onboarding (day-one flow) on or off;
  Offer Letter and Appointment Letter with acceptance tracking.
- Candidate Onboarding: name the candidate portal (its link goes into the welcome email).
- Employee Onboarding: flows with "Applicable for" rules and a status.

### Leave Tracker — `#settings/service/leavetracker/*`
Shots: `settings-leave-01-methods.jpg` to `settings-leave-10-work-calendar.jpg`
- Left pages: Methods, Leave Policy, Compensatory Off, Bradford Score, Work Calendar, Pay Period, Reports,
  Leave Request, Holidays, Additional Options.
- **Methods:** switch Compensatory Off and Bradford Score on or off.
- **Leave Policy list:** coloured dot, name, Type (Paid / Unpaid / Compensatory Off), Policy type ("Experience
  based"), Unit (Days), Status switch. "Add Leave Policy" and a "Leave Policy Gallery" of ready-made policies.
- **Policy editor** (4-step wizard with a left stepper, Save / Cancel / Previous / Next):
  1. Details: name, colour, image, code, type, unit, description.
  2. Entitlement: effective after N years/months from joining; Accrual (N days, yearly/monthly, on day, of month);
     prorate accrual (start of policy, more options); credit in next accrual; Reset (yearly, on day, of month);
     carry forward unused leave; encash unused leave; Advanced Options; "Add New Level" for experience bands.
  3. Applicability: criteria rows (employee, department and so on) joined by OR, plus Exceptions.
  4. Restrictions: allow exceeding entitlement; sandwich policy; clubbing (cannot be taken with...); report
     display (full summary, balance as accrual-period balance); document needed after N days; allowed units (full,
     half, quarter day, hourly); past and future date windows; apply N days in advance; admin-only leave;
     min / max per request; max consecutive days; min gap between requests; max requests per week or month;
     "can be applied only on" certain days.
- **Compensatory Off:** request manually or auto from a scheduler (overtime to comp-off); units full / half /
  quarter / hourly; allow future dates (take first, work later); time input; reason mandatory; credit per weekend
  and per holiday worked; expiry at calendar-year end or after N days.
- **Bradford Score:** shows the formula, score types, and a link to Workflows for emails on score change.
- **Work Calendar:** per location: calendar year (April–March) and work week (Monday–Friday).
- **Pay Period:** configure pay periods for payroll reports.
- **Reports:** limit employees to their department's calendar; show or hide leave types (else shown as "L");
  payroll leave report options (weekends and holidays as payable days); unpaid leave treated as LOP or carried to
  the next period; LOP reversal.
- **Leave Request:** who may cancel (self, manager, approver) for past leave in the current pay period, today and
  upcoming, past leave this year; partial cancellation; reason mandatory. Same grid for leave extension. Apply up
  to N (1 year) in advance.
- **Additional Options:** org-wide sandwich rule; password-protected exports; Google and Microsoft 365 calendar sync
  with display format and busy/free status per leave type.
- Top tabs: Approvals (per form), Automation (Schedulers, Workflows), Permissions (Leave Administrator, record,
  field, import/export and table-section permissions).

### Attendance — `#settings/service/attendance/*`
Shots: `settings-attendance-01-methods.jpg`, `settings-attendance-02-attendance-policy.jpg`,
`settings-attendance-03-checkin-checkout.jpg`
- Left pages: Methods, Attendance Policy, Overtime Policies, Check In and Check Out, Specific Policies, Office In
  and Remote In, Remote Work Policy, Regularization, On Duty, Pay Period, Reports, FTP Plugin, Additional Options.
- **Methods (switches):** Regularization, On Duty, Hourly Permission, Break, Kiosk (photo check-in), Office In and
  Remote In, Location Tracking (mobile GPS during shift).
- **Attendance Policy:** total hours from first-in/last-out or every pair; Strict or Lenient expected hours; set
  manually or by shift (full day = shift, half day = half); overtime and deviation; max hours per day; round-off;
  what counts as payable (weekends, statutory and non-statutory weekends, holidays, leave); late-night hours window
  per location; effective date for re-calculating absent records; "Update older attendance entries".
- **Check In and Check Out:** web / mobile matrix (enable punches, location mandatory, breaks); show location; show
  all punches; same source for out as in; block punches on approved leave; show daily status and early/late info;
  facial recognition (capture, or capture and verify); who may add or edit own or reportees' entries; reminders.
- **Office In and Remote In:** which sources count as office (biometric, API, FTP, imports, on-duty,
  regularization); IP ranges and geo ranges; rule when a day has both; rename the two labels.
- **Regularization:** create a new punch or replace first/last; reasons list; show/mandatory for description and
  document; within N days; N per week; future dates; only on approved remote days.
- **On Duty:** allowed durations, on-duty types, future dates, field visibility.
- **Overtime, Specific, Remote Work policies:** empty, each with an Add button (remote policy caps remote days per
  week or month).
- **Reports:** manager access; who sees or edits expected vs worked hours; carry forward balance hours; show
  payable hours and paid / unpaid breaks to employees.

### Shifts, Time Tracker, HR Help Desk, Compensation, Engagement
Shots: `settings-shifts-01-general.jpg`, `settings-timetracker-01-methods.jpg`, `settings-helpdesk-01-categories.jpg`,
`settings-compensation-01-general.jpg`, `settings-engagement-01-methods.jpg`
- **Shifts:** default shift; manager / self matrix for viewing and editing shift mapping and past schedules; view
  department schedules; reason mandatory; notify on change. Also Auto Shift Assignment and Shift Patterns
  (rotations).
- **Time Tracker:** Methods (switches): Projects, Clients, Timesheets, Job Schedule, Billing, Break. Also Time Logs,
  Timesheets, Specific and Overtime policies, Billing, Pay Period, Additional Options.
- **HR Help Desk:** category cards with open counts, drag handles to reorder, "Ask your manager" switch (route
  queries to the reporting manager); Customization; Feedback (rating after closure).
- **Compensation:** pay only, or full breakup with benefits; round-off; re-authentication with a timeout in
  minutes; also Currencies, Salary Structure, Revision Letter Templates, Revision Reasons.
- **Employee Engagement:** switches for eNPS, Pulse and Engagement surveys (at least one must stay on).
- **Performance, Offboarding:** "Getting Started" explainers only (not switched on).

---

## Reports — `#reports/*`

### My, Team and Organization Reports
Shots: `reports-my-01-list.jpg`, `reports-org-01-list.jpg`
- Three-column library grouped by module, a star (favourite) beside each name, a big search box, "Access
  Permissions" button.
- My Reports: Career History; Leave balance; Early/late punches, Present/absent status, Presence hours break-up;
  Time Logs, Jobs status, Projects status, Scheduled vs Worked hours; LMS learner and plan progress.
- Team Reports add: Distribution, Diversity; Daily leave status, Resource availability, Employee leave balance,
  Leave booked and balance, Leave type wise summary, Loss of pay; Daily attendance status, Office In and Remote In,
  Attendance data for payroll, **Muster roll**, **Consecutive absences**.
- Organization Reports add: Dashboard, Headcount, Addition and Attrition trends, Experience wise exit; Leave
  encashment, Leave data for payroll; Logged hours for clients, Employee logged hours, Timesheet data for payroll;
  many LMS reports (course types, ratings, trainers, learners by location); Files (personal uploads,
  acknowledgement receipts, consent receipts); Compensation (salary distribution, current salary, trend, history,
  components, benefits, revision history).

### Muster roll — `#reports/admin/attendance/musterroll`
Shots: `reports-org-02-muster-roll.jpg`
- Breadcrumb (Attendance › Muster roll with a dropdown to jump reports), month stepper, Day / Hour switch.
- One row per person, each day split into Shift and Status columns (A, SW and so on).
- Legend strip at the bottom: P Present, OT Overtime, H Holiday, W Weekend, SW Statutory, NSW Non-statutory,
  A Absent, DT Deviation Time, Paid leave, On Duty.

### Employee dashboard — `#reports/admin/employee/dashboard`
Shots: `reports-org-03-employee-dashboard.jpg`
- Same cards as Operations Insights, each with a "Detailed Report" link.

### Analytics and Schedulers
Shots: `reports-analytics-01-empty.jpg`, `reports-schedulers-01-empty.jpg`
- Analytics: custom report builder with a module list on the left, a form dropdown and "Create Report".
- Schedulers: email reports to people on a schedule.

---

## Forms (opened, nothing typed, closed with Cancel)

### Apply Leave — `#leavetracker/mydata/applications/add`
Shots: `form-apply-leave-01.jpg`
- Full-page modal "Apply Leave", one card "Leave".
- Fields: Leave type* (dropdown), Date* (from and to date pickers), Team Email ID, Reason for leave (text area).
- Buttons: Submit, Cancel (bottom left), X (top right).

### Request Regularization — Attendance › Regularization › Add Request
Shots: `form-regularization-01.jpg`
- Fields: Period (Day), Date (date picker), Attachment (Desktop / Zoho WorkDrive / Others; PDF, XLS, DOC, image,
  5 MB), then a table: Worked day, Check-in*, Check-out*, Total Hours, Description.
- Buttons: Submit, Cancel. A colour legend in the footer (Unpaid leave, Absent, Paid leave, On Duty, Weekend,
  Holidays).

### Log Time — `#timetracker/mydata/timelogs/addtimelog`
Shots: `form-log-time-01.jpg`
- Fields: Project Name (with "+"), Job Name* (with "+"), Work Item, Date*, Description, Hours* as a radio
  (Total hours / Start and end time / Timer) with an hh:mm box, Billable Status*, Attachment.
- Buttons: Save, Cancel.

### HR Help Desk case — Ask Us on a category
Shots: `form-helpdesk-case-01.jpg`
- Left: Priority (Medium), Subject*, Description (rich-text toolbar), Attachments.
- Right panel: the category description and "Agent Details" (who will answer).
- Buttons: Submit, Cancel.

### Add Address Proof — HR Letters
Shots: `form-address-proof-01.jpg`
- Fields: EmployeeID* (picker, pre-filled), Date of Joining and Designation (read-only, pulled from the record),
  Is there any change in present address* , Date of request*, Reason for request*.
- Buttons: Submit, Submit and New, Save Draft, Cancel.

### Add Travel Request — Travel
Shots: `form-travel-request-01.jpg`
- Section "Travel Initiate": Employee ID*, Employee Department (with "+"), Expected date of departure, Purpose of
  visit, Is billable to customer (with "+"), Place of visit, Expected date of arrival, Expected duration in days,
  Customer name.
- Buttons: Submit, Submit and New, Save Draft, Cancel.

### Add Exit Details — General
Shots: `form-exit-details-01.jpg`, `form-exit-details-02-checklist.jpg`
- Separation: Employee ID*, Interviewer*, Separation date*, Reason for leaving (with "+").
- Questionnaire: Working for this organization again, What did you like the most, Think the organization do to
  improve staff welfare, Anything you wish to share.
- Checklist for Exit Interview: Company vehicle handed in, All equipments handed in, Library books submitted,
  Security, Exit interview conducted, Notice period followed, Resignation letter submitted, Manager/Supervisor
  clearance.
- Buttons: Submit, Submit and New, Save Draft, Cancel.

### Edit Leave policy (admin) — Settings › Leave Tracker › Leave Policy › a policy
Shots: `settings-leave-03-policy-details.jpg` to `settings-leave-07-policy-restrictions.jpg`
- Four steps, listed above under Settings. Buttons: Save, Cancel, Previous, Next. Closed with Cancel.

---

## Pages not opened or partly covered

- **Check-in / Check-out, timers, "Getting Started" (Performance, Offboarding), toggles, Save buttons:** never
  clicked, by rule.
- **Compensation › My Salary:** behind "Verify your Identity" (would need a sign-in). Only the gate was seen.
- **Leave Summary and leave balance:** blocked because the founder's record has no date of joining.
- **Performance, Offboarding, OKR, Benefits:** not switched on, so only their explainers exist.
- **Settings sub-pages:** Leave, Attendance, Accounts were read in full; Shifts, Time Tracker, Help Desk,
  Compensation, Engagement, Employee Information, Onboarding were read on their first page only. LMS, Files, HR
  Letters, Travel, Tasks, General, Marketplace, Developer Space and Zia settings were not opened.
- **Operations tiles** for Onboarding, Time Tracker, Performance, LMS, Files, Engagement, HR Letters, Travel,
  Tasks, Compensation and General were not opened (they mirror the module lists).
- **Bottom chat strip, apps grid, "Search across Zoho", Support Hub:** they lead to other Zoho apps, so not opened.
- Most module pages are empty because the account has almost no data. Layout is still visible.

---

## Ideas YukthiX may be missing

Marks: **[Better than Keka]** where Zoho does it better than what we saw in Keka, **[Different from Keka]** where it
is a different approach worth weighing.

1. **Three layers per module: use → Operations → Settings, with a cross-link on every settings page.** Admin data
   work (bulk edits, imports, per-person overrides) is kept apart from policy rules. Operations home
   (`operations-home-01-services.jpg`), Settings home (`settings-home-01-services.jpg`). **[Different from Keka]**
2. **Leave policy as a 4-step wizard** (Details, Entitlement, Applicability, Restrictions) with experience levels,
   accrual, reset, carry-forward, encashment, sandwich, clubbing, min/max, gaps, advance notice and allowed units.
   Settings › Leave (`settings-leave-03-policy-details.jpg` to `settings-leave-07-policy-restrictions.jpg`).
   **[Better than Keka]**
3. **Leave Policy Gallery:** ready-made policies to start from. Settings › Leave
   (`settings-leave-02-leave-policy-list.jpg`). **[Better than Keka]**
4. **"User-specific Operations" search box in every admin module:** pick one person, then fix their leave,
   attendance or shift. Operations › Leave (`ops-leave-01-user-specific-ops.jpg`). **[Different from Keka]**
5. **Customize Balance grid:** people by leave types, grouped Paid / Unpaid, for manual balance fixes in one table.
   Operations › Leave (`ops-leave-03-customize-balance.jpg`). **[Better than Keka]**
6. **Activity Log as a plain-sentence timeline** of every admin change, plus a 180-day Recycle Bin and scheduled
   full backups. Data Administration (`ops-data-admin-02-activity-log.jpg`, `ops-data-admin-05-recycle-bin.jpg`,
   `ops-data-admin-04-data-backup.jpg`). **[Better than Keka]**
7. **Sensitive data masked by default** (Aadhaar, PAN, UAN as stars) with "Show masked data" in the "..." menu, and
   **re-authentication with a timeout before compensation pages**. Employee record
   (`ops-employee-info-03-record-identity-masked.jpg`, `ops-employee-info-04-record-more-menu.jpg`), Compensation
   (`compensation-my-salary-01-verify-identity.jpg`, `settings-compensation-01-general.jpg`). **[Better than Keka]**
8. **Office In vs Remote In:** each punch is classed by source, IP range or geo range, with a rule for mixed days
   and custom labels. Settings › Attendance (`settings-attendance-01-methods.jpg`). **[Better than Keka]**
9. **Muster roll report with a full legend** (P, A, W, SW, NSW, OT, DT, H, leave, on duty), Day / Hour switch.
   Indian statutory need. Reports (`reports-org-02-muster-roll.jpg`). **[Better than Keka]**
10. **Empty states that name the missing field and link to it** ("Update the Date of Joining..." links to the
    record). Leave (`leave-mydata-01-summary-blocked.jpg`), My Space (`myspace-overview-05-leave-blocked.jpg`).
    **[Better than Keka]**
11. **Rail with a "last used" slot:** the module you opened from More takes the fifth rail slot. Shell
    (`shell-more-menu-01.jpg`, `lms-mydata-courses-01-empty.jpg`). **[Different from Keka]**
12. **Applicability groups:** dynamic employee groups (role, designation, location, department, type) reused by
    policies, forms and workflows. Settings › Accounts (`settings-accounts-03-roles.jpg`). **[Different from Keka]**
13. **Manage Service:** one list to switch modules on or off and reorder them for the whole company. Settings ›
    Accounts (`settings-accounts-04-manage-service.jpg`). **[Different from Keka]**
14. **Holidays per location and per shift**, on a financial-year range. Leave › Holidays
    (`leave-holidays-02-scope-dropdown.jpg`). **[Better than Keka]**
15. **Comp-off rules:** auto-credit from overtime via a scheduler, per-weekend / per-holiday credit, expiry,
    "take now, work later". Settings › Leave (`settings-leave-08-comp-off.jpg`). **[Better than Keka]**
16. **Bradford Score** for short, frequent absences, with workflow emails. Settings › Leave
    (`settings-leave-09-bradford-score.jpg`). **[Different from Keka]**
17. **Attendance sticky footer with Days / Hours counters** (payable, present, on duty, paid leave, holidays,
    weekend) under every attendance view. Attendance (`attendance-summary-01-list-week.jpg`). **[Different from
    Keka]**
18. **HR process log for transfers** (department, location, designation change) with effective date and reason,
    and locked fields on the record that can only change through it. Operations › Employee Information
    (`ops-employee-info-10-hr-process.jpg`, `ops-employee-info-02-record-top.jpg`). **[Better than Keka]**
19. **Help desk: search FAQs before raising a case**, and an "Ask your manager" route. HR Help Desk
    (`helpdesk-ask-us-01.jpg`, `settings-helpdesk-01-categories.jpg`). **[Different from Keka]**
20. **HR letter requests as self-service forms** (address proof, bonafide, experience) that pull joining date and
    designation from the record. HR Letters (`form-address-proof-01.jpg`). **[Better than Keka]**
21. **Exit details form with a built-in clearance checklist** (assets, books, notice period, manager clearance).
    General (`form-exit-details-02-checklist.jpg`). **[Different from Keka]**
22. **Three survey types (eNPS, Pulse, full Engagement)** as tabs with clear size limits. Employee Engagement
    (`engagement-surveys-enps-01-empty.jpg`). **[Better than Keka]**
23. **Job Schedule with draft → publish** ("0 pending changes", Clone, Published). Time Tracker
    (`timetracker-job-schedule-01-week.jpg`). **[Different from Keka]**
24. **Quick-create "+" menu with search** for every record type. Shell (`shell-quick-create-01-menu.jpg`).
    **[Different from Keka]**
25. **Leave cancel and extend permission grid** (self / manager / approver × past / current / upcoming), partial
    cancellation, calendar sync to Google and Microsoft 365. Settings › Leave (text captured; see section above).
    **[Better than Keka]**

Where Keka is ahead (for balance): Keka's Inbox approval desk, team leaderboards, negligence view and timesheet
drill-down (see `keka-pages.md`) have no visible match here, partly because this Zoho account has no data.
