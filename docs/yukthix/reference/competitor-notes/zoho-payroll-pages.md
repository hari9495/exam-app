# Zoho Payroll (India): page-by-page reference

Seen 17 Nov 2026 in the founder's Zoho Payroll trial organisation (India data centre, `payroll.zoho.in`). The founder
said this is a new TEST organisation, so a little fictional demo data was created to see real flows. Nothing was paid,
filed, emailed, imported, exported or downloaded. No PAN, TAN, UAN, ESI, EPF, IFSC or bank number was typed anywhere.

Screenshots are in `shots/zoho-payroll/` next to this file. That folder is gitignored, because some shots show the
organisation name and the admin's own email. This file holds layout and features only.

The run stopped early (see "Unexpected event" below). The pay run itself could not be opened: Zoho blocks it until the
organisation PAN is entered. So the pay-run review steps are not covered here.

Same shape as `keka-pages.md` and `zoho-pages.md`, so builders can compare row by row.

## Demo data created (so the founder can delete it)

All of it is fictional. Created 17 Nov 2026 between 09:44 and 10:00 IST.

| What | Where | Details |
|---|---|---|
| Pay schedule | Settings › Setup & Configurations › Pay Schedule | Mon–Fri work week, actual days in month, pay on last day of month, first payroll November 2026, first pay date 30/11/2026. Note: Zoho says it cannot be edited after the first pay run. |
| Reimbursement component edited | Settings › Salary Components › Reimbursements | "Telephone Reimbursement" set Active, ₹1,000 per month, carry forward and encash at year end. |
| Salary template | Settings › Customisations › Salary Templates | "Demo Standard Template": annual CTC ₹6,00,000, Basic 50% of CTC, HRA 50% of Basic, Telephone Reimbursement ₹1,000/month, Fixed Allowance as balance. Description says "Safe to delete". |
| Designation | Settings › Organisation › Designations (made inline) | "Demo Engineer" |
| Department | Settings › Organisation › Departments (made inline) | "Demo Department" |
| Employee DEMO-001 | Employees | Demo Employee One, demo.one@example.com, joined 02/11/2026, Female, Head Office, CTC ₹6,00,000, payment mode Cash, DOB 15/06/1995, father "Demo Parent One". Portal access left OFF. |
| Employee DEMO-002 | Employees | Demo Employee Two, demo.two@example.com, joined 02/11/2026, Male, CTC ₹4,80,000, payment mode Cheque, DOB 20/03/1992, father "Demo Parent Two". Portal OFF. |
| Employee DEMO-003 | Employees | Demo Employee Three, demo.three@example.com, joined 16/11/2026 (mid-month, for pro-rata), Others, CTC ₹3,60,000, payment mode Cash, DOB 05/09/1998, father "Demo Parent Three". Portal OFF. |
| Reimbursement claim | Approvals › Reimbursements | CLAIM-00001 for DEMO-001, Telephone Reimbursement, bill no. DEMO-BILL-1, ₹500 claimed and approved ("Save & Approve"). |
| Getting Started step | Dashboard | Step 5 "Set up Salary Components" marked as completed. |
| Leave & Attendance module | Settings › General › Leave & Attendance | Enabled by clicking "Configure Leave And Attendance". See the unexpected event below. Zoho also auto-created an inactive leave type "Absent". |

Not created: no pay run, no loan, no statutory registration (EPF, ESI, LWF, bonus), no tax details, no salary
revision, no IT declaration, no role, no user.

## Unexpected event (stopped here)

Clicking "Configure Leave And Attendance" did more than enable a module. The Activity Log (`reports-02-activity-log.jpg`,
`reports-03-activity-log-zoho-people-sync.jpg`) shows, all at 09:49 by the admin:
- "Connected to Zoho People", and a "Zoho People" user added.
- Sync with Zoho People turned ON for: users, holidays, workweek, designations, employees, work locations, departments.
- Sync turned OFF for: salary revisions, LOP days.
- After that, each demo employee add also logged "Demo — User has been added".

So the payroll org is now linked to the founder's Zoho People account, and the three demo employees, the demo
department and the demo designation may have synced into Zoho People. No email or invite shows in the log. I did not
open Zoho People to check. The founder should look there, and turn the sync off or delete the demo records.

## Blocked: needs the founder

- **Pay runs:** Pay Runs › Run Payroll shows "There are a few things that need your attention… Complete Setup"
  (`payruns-01-blocked-complete-setup.jpg`). The open setup items are Tax Details (organisation PAN is mandatory,
  `settings-tax-details-01-pan-mandatory.jpg`) and the statutory step. Needs founder to enter PAN (and TAN if wanted).
- **EPF, ESI enable:** the forms open, but the EPF number and ESI number fields are the first fields. Needs founder.
- **Loans:** Create Loan needs a "Paid Through Account" and a disbursement date, which records a payout. Not done.
- **Form 16:** needs a tax deductor first; Publish/Email is the last step. Not done.
- **IT declaration on behalf:** the form was opened but "Submit and Compare" was not clicked.

## Navigation shape

- **Left rail (dark navy, icon + label):** a "Getting Started" card with a progress bar at the top, then Dashboard,
  Employees, Pay Runs, Approvals (expands to Reimbursements, Proof Of Investments, Salary Revision), Form 16, Loans,
  Giving, a divider, Documents, Reports, Settings, Contact Support. A collapse button at the bottom.
- **Rail promo card:** "Track TDS Liabilities and Generate Form 138" (the new Income Tax Act name for the TDS form).
- **Top bar (white):** search "Search in Employee" with a scope menu, trial days left + Upgrade, org switcher, then
  icons: Refer and Earn, Ask Zia (AI), bell, settings gear, avatar, Zoho apps grid.
- **Orange "?" tab** on the right edge of most pages opens help.
- **Settings is a separate full-page shell:** "All Settings" header with the org name, a centred "Search settings ( / )"
  box, "Close Settings ×" on the right, and its own left tree.
- **Settings tree:** Organisation (Profile, Branding, Work Locations, Departments, Designations, AI Integration,
  Subscriptions), Users and Roles (Users, Roles), Taxes (Tax Details), Setup & Configurations (Pay Schedule, Statutory
  Components, Salary Components, Employee Portal, Claims and Declarations), Customisations (Email Templates, Sender
  Email Preferences, Salary Templates, PDF Templates, Reporting Tags), Automations (Workflow Rules, Actions, Schedules,
  Workflow Logs), General (Employees & Contractors, Pay Runs, Salary Revisions, Leave & Attendance, Loans), Payments
  (Direct Deposits, Bank Accounts), Integrations (Zoho Apps), Developer Data (Connections, Incoming Webhooks, Data
  Backup, Deluge usage).
- **Empty states everywhere:** a soft purple mascot illustration, one bold line, one grey line, one primary button.
- **Success = green toast at top centre** ("Pay schedule has been created.", "Department has been added").
- When a sub-flow opens (claim, IT declaration) the rail collapses to icons only.

## Dashboard and setup

### Dashboard (setup mode) — `#/home/dashboard`
Shots: `home-dashboard-01-getting-started.jpg`, `home-dashboard-02-setup-steps.jpg`, `home-dashboard-03-setup-4of8.jpg`,
`home-dashboard-04-mark-complete-confirm.jpg`
- Before the first pay run the dashboard IS the setup checklist. "Welcome <name>!" with confetti dots, a toll-free
  help line and a webinar strip with "Register Now".
- Blue card "Get started with Zoho Payroll" with "n/8 Completed" and a progress bar.
- Eight steps, each a row with a tick circle, a title link and either "COMPLETED" (green text) or "Complete Now":
  1 Organisation Details, 2 Tax Details, 3 Pay Schedule, 4 Statutory Components (sub-list EPF, ESI, LWF, PT with
  "Configured based on Work Location"), 5 Salary Components, 6 Add Employees, 7 Configure Prior Payroll,
  8 Connect with Zoho Books.
- Some steps have a "• Mark as Completed" link, with a confirm pop-up.
- Below: "Additional notable features" tiles (Direct Deposit, Salary Templates, Auto Reminder for IT & POI
  Declaration, Employee Custom Field), then help, videos, mobile app and other Zoho apps.
- The post-payroll dashboard (charts) could not be seen, as no pay run exists.

## Employees

### Employee list — `#/employees`
Shots: `employees-list-01-empty.jpg`, `employees-list-02-incomplete-banner.jpg`, `employees-list-03-three-active.jpg`,
`employees-list-04-views-dropdown.jpg`, `employees-list-05-more-menu.jpg`
- Title is a view picker: All, Active, Exited, Incomplete, Portal Enabled, Portal Disabled, Yet to Accept Portal
  Invite, each with a star to favourite, plus "+ New Custom View".
- Columns: checkbox, avatar letter + "Name - Employee ID" + designation under it, Work Email, Department, Employee
  Status (green "Active" pill), and a column-settings icon.
- **Incomplete rows:** the row shows an orange strip across the columns "This employee's profile is incomplete.
  Complete now". The header shows "You have 2 incomplete employees. View".
- Top right: "+ Add", "…" (Import Data, Export Data), filter funnel.
- Empty state: "Get your employees onboard" with Add Employee and Import Employees.

### Add employee wizard — `#/employees/new`, then `/employees/<id>/edit/<step>`
Shots: `employees-add-01-basic-details.jpg` to `employees-add-10-done-incomplete-warning.jpg`
- Four-step stepper at the top: Basic Details, Salary Details, Personal Details, Payment Information. Done steps get
  a green tick; a skipped required step gets an orange "!".
- The record is saved after step 1. Each step has "Save and Continue"; Personal and Payment have "Skip".
- The work email shows an info box: it cannot be changed later, because it is used for payslips and the portal login.
- Designation and Department dropdowns have "+ New Designation" / "+ New Department" at the bottom, which open a
  small modal and select the new value. The next new employee pre-fills the last designation and department.
- **Salary step** has three stacked cards: Statutory Components (only PT here, because EPF/ESI are not enabled),
  Salary Structure (template picker, annual CTC, live table), Other Benefits ("Add Benefit"). Each card saves on its own.
- **Personal step:** Date of Birth and Father's Name are mandatory; PAN is optional here. Skipping leaves the
  profile "incomplete" and blocks the employee from pay runs ("Before you pay Demo in your next pay run, some loose
  ends need tying up").
- **Payment step:** four selectable rows with a tick on the right: Direct Deposit (Configure Now), Bank Transfer
  (manual, download bank advice), Cheque, Cash.
- Finish screen: mascot, "You've successfully added …", "Add Another Employee", "Go to Employee Details".

### Employee profile — `#/employees/<id>` and tabs
Shots: `employees-profile-01-overview.jpg` to `employees-profile-11-loans-empty.jpg`
- Header: avatar, "ID - Name", status pill, designation; right: "Add" menu (Scheduled Earning, Deduction, Benefit,
  Donation Contribution), "…" (Add/Update Vehicle Details, Delete Employee, Initiate Exit Process), close ×.
- Tabs: Overview, Salary Details, Investments, Reimbursements, Payslips & Forms, Loans.
- **Overview:** cards with a pencil each: Basic Information (portal access "Disabled (Enable)" inline), Statutory
  Information (PT "Enabled (Disable)"), Personal Information, Payment Information.
- **Salary Details:** Annual and Monthly CTC card with "…", the structure table with "Salary Template: <name>",
  each component with its rule under the name ("50.00 % of CTC"), reimbursements with "Max Limit … Monthly Carry
  Forward", Perquisites "Additional Benefits ₹0.00 View Details".
- **Investments:** IT Declaration / Proof Of Investments toggle, Period "2026 - 27". Locked state with "Submit
  Declaration" (admin can submit on the employee's behalf).
- **Reimbursements:** YTD table per component: Paid, Approved & Unpaid, Pending Approval, Unclaimed; formula note
  "Unclaimed = Eligible − (Paid + Approved & Unpaid + Pending)"; note that unclaimed amounts become taxable.
- **Payslips & Forms:** left "Payslips and TDS Sheets" with a financial-year filter; right "Form 16" panel.
- **Loans:** empty state with "Create Loan".

### Exit and full and final settlement
Shots: `employees-profile-03-more-menu-exit.jpg`
- Exit starts from the profile "…" › "Initiate Exit Process". Not opened (it would change a demo employee).
- Related pieces seen elsewhere: deductions "Notice Pay Deduction" and "Withheld Salary", earnings "Notice Pay",
  "Leave Encashment", "Gratuity", "Hold Salary (Non Taxable)", an email template "Full & Final Settlement Payslip
  Notification", a "Final Settlement Payslip" PDF template, and a "Full and Final Settlement Report".

## Salary set-up

### Salary components — Settings › Salary Components (`#/settings/salary-components/earnings`)
Shots: `settings-salary-components-01-earnings.jpg` to `settings-salary-components-08-reimb-activated-toast.jpg`
- Tabs: Earnings, Deductions, Benefits, Reimbursements. "Add Component" menu: Earning, Correction, Benefit,
  Deduction, Reimbursement.
- Earnings columns: Name, Earning Type, Calculation Type ("Fixed; 50% of CTC", "Variable; Flat Amount"), Consider
  for EPF ("Yes", "No", or "Yes (If PF Wage < ₹15,000)"), Consider for ESI, Status (Active / Inactive), "…".
- Seeded earnings: Basic, HRA, Conveyance, Children Education, Transport, Travelling, Fixed Allowance, Overtime,
  Gratuity, Bonus, Commission, Leave Encashment, Notice Pay, Hold Salary. Deductions: Withheld Salary, Notice Pay
  Deduction (both One Time). Benefits: Voluntary Provident Fund. Reimbursements: Fuel, Driver, Vehicle Maintenance,
  Telephone, LTA.
- **Edit earning:** type (locked), name, name in payslip, calculation (Flat or % of CTC), active tick; right column
  "Other Configurations": part of salary structure, taxable (tax spread across the year), pro-rata on working days,
  EPF (always / only when PF wage < ₹15,000), ESI, show in payslip. Note: after use, only name and amount can change,
  and amount changes apply to new employees only.
- **Edit reimbursement:** name in payslip, "Include as a Flexible Benefit Plan component", unclaimed handling (carry
  forward and encash at year end, or encash monthly), amount per month, active.

### Salary templates — Settings › Salary Templates (`#/settings/salary-templates`)
Shots: `settings-salary-templates-01-empty.jpg` to `settings-salary-templates-04-list.jpg`
- Full-screen builder. Left panel "Build your Template": groups Earnings, Reimbursements, FBP Components, Benefits,
  One Time Earnings; click a component to add it ("Click on a component to add it to the template" hint).
- Main: name, description, Annual CTC, then the table (component, calculation type, monthly, annual).
- **Fixed Allowance is the balancing line:** "Monthly CTC − Sum of all other components". Adding a ₹1,000
  reimbursement lowered Fixed Allowance from 12,500 to 11,500 at once; CTC stays ₹50,000 / ₹6,00,000.
- A template picked on an employee fills CTC and every line; you can still edit per employee.
- List: Template Name, Description, Status, "…".

## Pay runs

### Run Payroll / Payroll History — `#/payruns`, `#/payruns/payroll-history`
Shots: `payruns-01-blocked-complete-setup.jpg`, `payruns-02-history-empty.jpg`
- Two tabs. Run Payroll is fully blocked until setup is done: illustration, "There are a few things that need your
  attention", "Complete Setup" goes back to the dashboard checklist.
- History: "Payroll Type: All" filter and a funnel; empty state "You don't have any pay runs for the filter applied".
- The draft, review, approve and pay screens were not reachable (organisation PAN missing).

### Pay run approval settings — Settings › General › Pay Runs
Shots: `settings-module-02-payrun-approval-types.jpg`
- Three radio cards: Simple Approval (anyone with the Pay Run approve permission), Multi-Level Approval (all levels
  must approve), Custom Approval (rules on criteria). Same three for Salary Revisions
  (`settings-module-03-salary-revision-approval.jpg`).
- Other tabs: Custom Button, Record Locking, Related List.

## Statutory

### Statutory Components — Settings › Statutory Components (`#/settings/statutory-details/list`)
Tabs: EPF, ESI, Professional Tax, Labour Welfare Fund, Statutory Bonus.

**EPF** — Shots: `settings-statutory-01-epf-empty.jpg` to `settings-statutory-04-epf-preview.jpg`
- Empty: "Are you registered for EPF?" with a line on the 20-employee rule and "Enable EPF".
- Form: EPF Number (format hint), Deduction Cycle (Monthly, locked), Employee rate "12% of Actual PF Wage",
  Employer rate (12% of Actual PF Wage, or "Restrict Contribution to ₹15,000 of PF Wage") with "View Splitup".
- Ticks: include employer contribution in salary structure (and EDLI, and admin charges), override PF rate per
  employee.
- "PF Configuration when LOP Applied": pro-rate restricted PF wage; consider all components if PF wage falls below
  ₹15,000 after LOP.
- Right panel "Sample EPF Calculation" (₹20,000 wage: EE 2,400; ER EPS 1,250 + EPF 1,150).
- **"Preview EPF Calculation" modal:** three sample packages side by side with Basic, Transport, Telephone and the
  resulting PF, with a "With 15 days LOP" tick. Explains which components count only below ₹15,000.

**ESI** — Shot: `settings-statutory-05-esi-form.jpg`
- ESI Number, Deduction Cycle Monthly, employee 0.75% and employer 3.25% of gross (read-only), include employer
  share in salary structure.
- Note: deduct only if monthly salary ≤ ₹21,000; after a raise above it, continue to the end of the contribution
  period (Apr–Sep or Oct–Mar).

**Professional Tax** — Shots: `settings-statutory-06-pt-card.jpg`, `settings-statutory-07-pt-slabs.jpg`
- One card per work location: PT Number ("Update PT Number" link), State, Deduction Cycle, "View Tax Slabs".
- Slabs modal is read-only, from the state: deduction cycle, effective from, gross ranges and monthly tax.
- PT is auto-configured from the work location state; a new employee gets PT ticked by default.

**Labour Welfare Fund** — Shot: `settings-statutory-08-lwf.jpg`
- Card per state with employee and employer amounts, Yearly cycle, and "Status Disabled (Enable)".

**Statutory Bonus** — Shots: `settings-statutory-09-bonus-empty.jpg`, `settings-statutory-10-bonus-form.jpg`
- Payment frequency Monthly / Yearly, percentage (8.33% to 20% enforced), notes (monthly bonus is taxable;
  percentage can change only at next fiscal year once used), and "Minimum Wage in Each State" with "Add Minimum
  Wage" per state. Bonus is on the higher of minimum wage or Basic + DA.

### Tax details and TDS — Settings › Taxes › Tax Details
Shot: `settings-tax-details-01-pan-mandatory.jpg`
- Organisation Tax Details: PAN (mandatory), TAN, TDS circle / AO code (four boxes), Tax Payment Frequency (Monthly).
- Tax Deductor: type Employee / Non-Employee, deductor name (pick an employee), father's name.
- This page gates pay runs.

### Regime, declarations and proofs
Shots: `settings-claims-03-it-declaration-locked.jpg`, `settings-claims-04-poi-locked.jpg`,
`employees-profile-05-investments-locked.jpg`, `employees-profile-06-it-declaration-form.jpg`,
`employees-profile-07-it-declaration-bottom.jpg`, `employees-profile-08-it-declaration-sections.jpg`
- Declaration windows are **locked by default**. Admin releases them org-wide ("Release IT Declaration", "Release
  Proof Of Investments"), or fills them per employee.
- Settings: allow employees to switch tax regimes; allow TDS change above the year's calculated tax; process payroll
  with approved POI amount from a chosen month (March) onwards; mandate proof attachments; mandate reviewer comments
  for partial approvals.
- **Uses the new Income Tax Act section numbers with the old ones in brackets:** "Section 123 Investments (Earlier:
  80C)", "Section 126 Exemptions (Earlier: 80D)", "Section 124(1B) (80CCD(1B))", "Section 127 (80DD)". Limits shown
  in the note under each section (₹1,50,000, ₹1,00,000).
- Declaration form order: three yes/no toggles (rented house, home loan on self-occupied house, let-out property
  income), Other Sources of Income, Section 123, Section 126, Other Investments & Exemptions (searchable grouped
  list), Previous Employment. Footer "Submit and Compare" (shows old vs new regime next; not clicked).
- The URL carries `tax_regime=with_exemptions`, so the regime choice comes after the declaration.

### Form 16 — `#/taxes-and-forms/form16`
Shot: `form16-01-deductor-steps.jpg`
- "Form 16: Select" year picker. "Verify your tax deductor" box ("Tax Deductor is not found", "+ Add Tax Deductor"),
  warning that deductor details cannot change after generation.
- Four-step strip: Upload Form 16 Part A, Generate Form 16, Sign Form 16, Publish/Email, plus a video card.

### Arrears and LOP
- No arrears screen was reachable without a pay run. The salary component menu has a "Correction" type, which is
  where Zoho handles back-pay corrections.
- LOP: pay schedule chooses actual days vs fixed working days; EPF has LOP-specific options; reports include
  "Loss Of Pay Summary"; Leave & Attendance can feed LOP (its LOP sync with Zoho People was turned off).

## Reimbursements and claims

### Claims settings — Settings › Claims and Declarations
Shots: `settings-claims-01-fbp-empty.jpg`, `settings-claims-02-reimbursement-cutoff.jpg`
- Tabs: Flexible Benefit Plan, Reimbursement Claims, Income Tax Declaration, Proof Of Investments.
- FBP empty state explains how to make a reimbursement an FBP component.
- Reimbursement Claims: last day of the month to submit bills (Day picker), and three email alerts (cut-off changed,
  submission released, submission locked).

### Claims list and new claim — Approvals › Reimbursements (`#/approvals/reimbursements`)
Shots: `approvals-reimb-01-empty.jpg`, `approvals-reimb-02-new-claim-form.jpg`, `approvals-reimb-03-list-approved.jpg`,
`approvals-reimb-04-claim-detail.jpg`
- "All Claims" view picker, filter chips: Claim Month (defaults to this month, with ×), Employees, "Clear Filter".
- Columns: Claim Number (CLAIM-00001), Employee Name (with ID), Submitted Date, Status pill, Claim Amount, Approved
  Amount.
- New Claim: employee picker, Claim Date (today), then a bill grid: Reimbursement Type (only the employee's active
  types), Bill Date, Bill Number, Attachments (clip icon), Claim Amount, Approved Amount, comment icon;
  "+ Add another bill". Admin entry is "Save & Approve" in one step.
- Detail: split view (list on the left), header with status, Reject and Edit; bills grouped by type with totals.

### Proof of investments and salary revisions — Approvals
Shots: `approvals-poi-01-empty.jpg`, `approvals-salary-revision-01-empty.jpg`
- POI: filters Fiscal Year, Tax Regime, Employees; header nudge "3 employee(s) yet to submit POI. View"; a 3-step
  illustration (employee submits, admin approves or rejects, employee gets the tax saving).
- Salary Revision: filters Payout Month and Employees; "Send Revision Letters" button (not clicked).

## Loans — `#/loans`
Shots: `loans-01-create-form.jpg`, `loans-02-paid-through-accounts.jpg`, `loans-03-list-empty.jpg`
- List "All Loans" with "View Loan Repayments", "+ Add", "…", filter; empty state explains salary-deducted
  instalments.
- Create Loan: Loan Name (loan types with a perquisite rate), Employee, Loan Amount, Disbursement Date, Paid Through
  Account (ledger accounts like Undeposited Funds, Petty Cash, from Zoho Books), Reference Number, Reason, and
  "Exempt this loan from perquisite calculation" with the Rule 15(5) note (medical loans or total under ₹2,00,000).
- Settings › Loans: custom fields (0/59 used), custom buttons, validation rules, record locking, related lists.

## Leave and attendance (inside payroll)

Shots: `settings-leave-01-enable.jpg` to `settings-leave-05-holidays-empty.jpg`
- Off by default. "Configure Leave And Attendance" turns it on AND connects Zoho People (see unexpected event).
- Then a 5-step setup card: Leave types, Holiday Management, Attendance Management, Setup Preferences, Employee
  Leave Balance (import). Each has "Configure Now" and "Mark as Completed" or "Do It Later", plus "Disable Leave And
  Attendance".
- Preferences: attendance cycle per pay schedule, a payroll report generation day (1–7 days after the cycle ends and
  before payday), include leave encashment in the pay run.
- Holidays: year and location filters, "+ Add New".

## Other modules

### Giving — `#/donations`
Shot: `giving-01-campaigns-empty.jpg`
- "Active Campaigns" for employee donations deducted from salary; "New Campaign".

### Documents — `#/documents/organization-folder/details`
Shot: `documents-01-org-folders-empty.jpg`
- Tabs Organization Documents / Employee Documents; folder tree with "+ New folder", Trash, storage meter
  "1GB / 100 employees". Portal setting decides if employees see them.

### Reports — `#/reports`
Shots: `reports-01-centre.jpg`, `reports-02-activity-log.jpg`, `reports-03-activity-log-zoho-people-sync.jpg`
- "Reports Centre" with a big search box; left: Home, Favorites, Shared, Scheduled, then categories.
- 41 system reports in a table (name with a star, category, created by, last visited). Categories: Payroll Overview
  (Payroll Summary, Salary Register Monthly, Salary Statement, Pay Summary, Liability Summary, Leave Encashment, Loss
  Of Pay, Variable Pay, Scheduled Earning), Statutory (EPF Summary, EPF ECR, ESI Summary, ESI Monthly, PT Summary,
  Employee-wise PT, Annual PT, LWF Summary), Employee (Compensation, Reimbursement Claims, Perquisites, Full and Final
  Settlement, Salary Revisions, Revision History, Salary Withhold), Declarations (FBP, Investment Declaration, POI),
  Deductions (Benefits & Deductions, Deductions, Benefits, Donations), Taxes (TDS Deduction, Form 24Q), Loans
  (Outstanding, Perquisite, Perquisite Projection, Summary), Payroll Journal, Activity Logs, Automation.
- Report view: breadcrumb, date-range chip, "More Filters", "Run Report", "Customize Report Columns", "Export as",
  schedule icon. A printed-style header with org name, report name and date range.
- **Activity Log:** every change with time, record, plain sentence, "by <user>" or "by System", and "Show Versions"
  for an audit diff.

## Settings pages (not covered above)

- **Organisation Profile** (`settings-org-profile-01.jpg`): logo (used on payslips and TDS worksheets), name, business
  location, industry, date format and separator, address, filing address, primary contact email, "Emails are sent
  through". Banner: changes also apply in Zoho Books.
- **Work Locations** (`settings-work-locations-01.jpg`): card per location with address, employee count, a "FILING
  ADDRESS" ribbon, edit and "…".
- **Departments / Designations** (`settings-departments-01-empty.jpg`, `settings-designations-01-empty.jpg`): empty
  state with New and Import, and a "With this feature you can" strip.
- **Pay Schedule** (`settings-pay-schedule-01-form.jpg` to `-03-saved.jpg`): work-week day chips, salary calculation
  method (actual days, or fixed working days), pay date (last day, or day N), note that a holiday payday moves to the
  previous working day; first payroll month and first pay date with a mini calendar. Saved view lists frequency, days,
  pay day and "Upcoming Payrolls" for two months; banner "cannot be edited once you process the first pay run".
- **Employee Portal** (`settings-employee-portal-01-preferences.jpg`): Enable Portal Access (ACTIVE), banner message
  with an end date and "View Sample Preview", portal contact, document visibility; Web Tabs; quick links.
- **Email Templates** (`settings-email-templates-01.jpg`): Payslip Notification, Payslip Notification for portal-disabled
  employees, Off Cycle & One-Time payroll payslip, Full & Final Settlement payslip.
- **PDF Templates** (`settings-pdf-templates-01-payslip-gallery.jpg`): Regular Payslips gallery (Elegant default,
  Standard, Mini, Simple, Lite, Simple Spreadsheet, Professional), Final Settlement Payslip, letter templates (Salary
  Certificate, Salary Revision Letter, Bonus Letter).
- **Roles** (`settings-roles-01-list.jpg`, `settings-roles-02-new-role-matrix.jpg`): Admin, Manager,
  Reimbursements and POI Reviewer (locked). New Role is a long permission matrix: Employee areas × Full/View/Create/
  Edit/Delete; Payroll Run × View/Create/Edit/Approve/Pay; Loan × …/Record Disbursement; Approvals; Documents;
  Settings ticks (incl. "access to protected data"); Reports by group × View/Export/Schedule/Share. Opened and
  cancelled.
- **Employees & Contractors** (`settings-module-01-contractors.jpg`): a separate Contractors module to enable; custom
  fields, buttons, validation rules, record locking, related lists.
- **Direct Deposits** (`settings-payments-01-direct-deposit.jpg`): Zoho Payments payouts (₹3 per employee per pay
  run + GST) with a "How it works" flow, then bank integrations (ICICI needs a paid plan, HSBC, Axis). Not touched.
- **Workflow Rules** (`settings-automation-01-workflow-rules.jpg`): daily usage counters (functions 0/1000, webhooks
  0/1000, email alerts 0/500), module and status filters, "Change Execution Order".
- **Integrations** (`settings-integrations-01-zoho-apps.jpg`): Zoho Books ACTIVE (set before this session), Zoho
  Expense and Zoho Analytics "Connect" (not clicked).

## Forms

### Add Employee — step 1 Basic Details
- Fields: First / Middle / Last name*, Employee ID*, Date of Joining* (date picker), Work Email*, Mobile Number,
  "Director / person with substantial interest" tick, Gender* (Male, Female, Others), Work Location* (prefilled),
  Designation* (+ New), Department* (+ New), "Enable Portal Access" tick (off by default) with "Preview mail".
- Buttons: Save and Continue, Cancel.

### Add Employee — step 2 Salary Details
- Statutory Components ticks (PT only here), Save and Continue.
- Salary Structure: Salary Template, Annual CTC*, component table, "+ Add Earning", "Reimbursements"; Save and
  Continue, Cancel.
- Other Benefits: "+ Add Benefit"; Proceed, Cancel.

### Add Employee — step 3 Personal Details
- Date of Birth* (Age auto-filled), Father's Name*, PAN, Differently Abled Type (None default), Personal Email,
  Residential Address (line 1, line 2, city, state, PIN).
- Buttons: Save and Continue, Skip.

### Add Employee — step 4 Payment Information
- One choice: Direct Deposit (Configure Now), Bank Transfer, Cheque, Cash. Buttons: Save and Continue, Skip.

### Pay Schedule
- Work week chips*, salary calculation method*, pay date*, first payroll month*, first pay date*. Button: Save.

### New Salary Template
- Template Name*, Description (500 chars), Annual CTC, component rows (value + basis, monthly, annual, remove ×),
  Cost to Company totals. Buttons: Save, Cancel.

### Edit Reimbursement component
- Name in Payslip*, FBP tick, unclaimed handling radio, Amount* per month, Mark as Active. Buttons: Save, Cancel.

### New Designation / New Department (inline modals)
- Designation Name*. Department Name*, Department Code, Description (250 chars). Buttons: Save, Cancel.

### New Claim
- Employee Name, Claim Date*, bill rows (Type*, Bill Date, Bill Number, Attachment, Claim Amount*, Approved Amount*,
  comment), "+ Add another bill". Buttons: Save & Approve, Cancel.

### Create Loan (opened, not saved)
- Loan Name*, Employee Name*, Loan Amount*, Disbursement Date*, Paid Through Account*, Reference Number, Reason*,
  perquisite exemption tick. Buttons: Save, Cancel.

### EPF / ESI enable (opened, not saved)
- EPF: EPF Number, cycle, employee rate, employer rate, five ticks, Enable / Cancel.
- ESI: ESI Number, cycle, employee and employer rates, one tick, Enable / Cancel.

### IT Declaration on behalf (opened, not submitted)
- Three toggles, Other Sources of Income, Section 123, Section 126, Other Investments (each "Select an Investment" +
  amount, "+ Add an Investment"), Previous Employment. Buttons: Submit and Compare, Cancel.

## Pages not opened or partly covered

- Pay run draft, review, approve, payslip preview, record payment: blocked by missing PAN.
- Off-cycle and one-time payrolls, arrears screen, F&F settlement flow: need a pay run or an exit.
- Employee self-service portal: needs an invite; not sent.
- Users list, Subscriptions, Branding, Sender Email Preferences, Reporting Tags, Bank Accounts, Developer Data:
  not opened (account or billing settings, or low value).
- Prior payroll (step 7) was already "COMPLETED" before this session.

## Ideas YukthiX may be missing

1. **Setup checklist as the first dashboard, with a hard gate on pay runs** — eight steps, progress bar, "Mark as
   Completed", and Run Payroll stays locked until the must-have steps are done. Dashboard
   (`home-dashboard-02-setup-steps.jpg`, `payruns-01-blocked-complete-setup.jpg`).
2. **"Incomplete employee" state** — a saved-but-incomplete employee shows an inline strip in the list, a header
   count with a View link, its own saved view, and is kept out of pay runs. Employees
   (`employees-list-02-incomplete-banner.jpg`, `employees-add-10-done-incomplete-warning.jpg`).
3. **EPF calculation preview with LOP** — side-by-side sample packages showing which allowances count for PF below
   ₹15,000, with a "15 days LOP" toggle, right inside the EPF settings. Statutory › EPF
   (`settings-statutory-04-epf-preview.jpg`).
4. **Fixed Allowance as the automatic balancing line** — "Monthly CTC − sum of all other components", recalculated
   live as lines are added, so CTC always ties out. Salary Templates
   (`settings-salary-templates-03-filled-auto-balance.jpg`).
5. **Per-component statutory flags in the component list** — EPF "Yes (If PF Wage < ₹15,000)", ESI yes/no, taxable,
   pro-rata, show in payslip, all visible as list columns and edit ticks. Salary Components
   (`settings-salary-components-01-earnings.jpg`, `settings-salary-components-03-edit-basic.jpg`).
6. **New Income Tax Act section names with old names in brackets** — "Section 123 (Earlier: 80C)", plus "Form 138"
   naming, so users are not lost during the law change. IT Declaration
   (`employees-profile-08-it-declaration-sections.jpg`, `employees-profile-06-it-declaration-form.jpg`).
7. **Declaration and POI windows that admins release and lock** — locked by default, org-wide release, admin can
   fill on behalf, POI amounts used in payroll from a chosen month. Claims and Declarations
   (`settings-claims-03-it-declaration-locked.jpg`, `settings-claims-04-poi-locked.jpg`).
8. **Reimbursement YTD ledger per employee** — Paid / Approved & Unpaid / Pending / Unclaimed with the formula, and
   a monthly claim cut-off day. Employee › Reimbursements (`employees-profile-09-reimbursement-ytd.jpg`,
   `settings-claims-02-reimbursement-cutoff.jpg`).
9. **Approval workflow choice per object** — Simple, Multi-Level or Custom (criteria) for pay runs and for salary
   revisions, as three radio cards. Settings › Pay Runs (`settings-module-02-payrun-approval-types.jpg`).
10. **Role matrix with payroll-specific verbs** — Approve and Pay as separate rights on Payroll Run, Record
    Disbursement on Loans, "access to protected data", report groups with Export/Schedule/Share. Roles
    (`settings-roles-02-new-role-matrix.jpg`).
11. **Activity log with "Show Versions"** — every change as a plain sentence with actor and a version diff, including
    system actions and integration sync changes. Reports › Activity Logs (`reports-02-activity-log.jpg`).
12. **PT slabs and LWF auto-filled from the work-location state**, shown read-only per location card. Statutory › PT
    and LWF (`settings-statutory-06-pt-card.jpg`, `settings-statutory-07-pt-slabs.jpg`, `settings-statutory-08-lwf.jpg`).
13. **Statutory Bonus with per-state minimum wage** and an enforced 8.33–20% range. Statutory › Bonus
    (`settings-statutory-10-bonus-form.jpg`).
14. **Payslip template gallery and letter templates** (salary certificate, revision letter, bonus letter). PDF
    Templates (`settings-pdf-templates-01-payslip-gallery.jpg`).
15. **Pay schedule preview of upcoming payrolls** and a note that a holiday payday moves to the previous working day.
    Pay Schedule (`settings-pay-schedule-03-saved.jpg`, `settings-pay-schedule-01-form.jpg`).
16. **Loan perquisite handling** — loan types with perquisite rates and the Rule 15(5) exemption tick, plus loan
    perquisite reports. Loans (`loans-01-create-form.jpg`).
17. **Inline "+ New Designation / Department"** inside the add-employee form, and the next add pre-fills the last
    choice. Add Employee (`employees-add-02-inline-new-designation.jpg`).
18. **Giving (payroll donations)** campaigns deducted from salary, with a donations report. Giving
    (`giving-01-campaigns-empty.jpg`).
