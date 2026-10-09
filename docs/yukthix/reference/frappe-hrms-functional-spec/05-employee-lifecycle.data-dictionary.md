# 05 · Employee Lifecycle — Data Dictionary

Companion to [05-employee-lifecycle.md](05-employee-lifecycle.md). Every data object and field in this module of the reference codebase, generated from its field definitions and written with **plain labels only** (no internal names, no help text) — clean-room.

**Columns:** *Type* — Text, Number, Amount, Date, Yes/No, Choice, Link → other record, Table of child rows… · *Flags* — required, read-only, editable after submit, unique, hidden, copied from linked record, ≥ 0 · *Conditions* — when the field is shown / required / read-only; `[Label]` refers to another field on the same record.

Use this as the **checklist of data** a YukthiX equivalent must be able to hold; field names, structure and storage in YukthiX are our own design.

---


### Employee Onboarding

*submittable (Draft → Submitted → Cancelled)* · 17 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Job Offer | Link → Job Offer |  |  | **required** |  |
| Job Applicant | Link → Job Applicant |  |  | copied from linked record | shown when [Job Applicant] |
| Employee Name | Text |  |  | **required**, copied from linked record |  |
| Employee | Link → Employee |  |  | read-only |  |
| Date of Joining | Date |  |  | **required** |  |
| Boarding Status | Choice | Pending / In Process / Completed | Pending | read-only, editable after submit |  |
| Notify users by email | Yes/No |  | 0 | editable after submit |  |
| Employee Onboarding Template | Link → Employee Onboarding Template |  |  |  |  |
| Company | Link → Company |  |  | **required**, copied from linked record |  |
| Department | Link → Department |  |  | copied from linked record |  |
| Designation | Link → Designation |  |  | copied from linked record |  |
| Employee Grade | Link → Employee Grade |  |  | copied from linked record |  |
| Project | Link → Project |  |  | read-only |  |
| Activities | Table of *Employee Boarding Activity* |  |  | editable after submit |  |
| Amended From | Link → Employee Onboarding |  |  | read-only |  |
| Onboarding Begins On | Date |  |  | **required** |  |
| Holiday List | Link → Holiday List |  |  |  |  |

### Employee Onboarding Template

*master / regular record* · 6 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Title | Text |  |  | **required** |  |
| Company | Link → Company |  |  |  |  |
| Department | Link → Department |  |  |  |  |
| Designation | Link → Designation |  |  |  |  |
| Employee Grade | Link → Employee Grade |  |  |  |  |
| Activities | Table of *Employee Boarding Activity* |  |  |  |  |

### Employee Boarding Activity

*child table (rows inside another record)* · 9 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Activity Name | Text |  |  | **required** |  |
| User | Link → User |  |  |  | shown when not [Role] |
| Role | Link → Role |  |  |  | shown when not [User] |
| Task | Link → Task |  |  | read-only |  |
| Task Weight | Number |  |  | ≥ 0 |  |
| Required for Employee Creation | Yes/No |  | 0 |  | shown when [Parenttype] is one of 'Employee Onboarding', 'Employee Onboarding Template' |
| Description | Rich text |  |  |  |  |
| Duration (Days) | Whole number |  |  | ≥ 0 |  |
| Begin On (Days) | Whole number |  |  | ≥ 0 |  |

### Employee Separation

*submittable (Draft → Submitted → Cancelled)* · 15 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Employee | Link → Employee |  |  | **required** |  |
| Employee Name | Text |  |  | read-only, copied from linked record |  |
| Resignation Letter Date | Date |  |  | read-only, copied from linked record |  |
| Status | Choice | Pending / In Process / Completed | Pending | read-only, editable after submit |  |
| Notify users by email | Yes/No |  | 0 | editable after submit |  |
| Employee Separation Template | Link → Employee Separation Template |  |  |  |  |
| Company | Link → Company |  |  | **required**, copied from linked record |  |
| Project | Link → Project |  |  | read-only |  |
| Department | Link → Department |  |  | read-only, copied from linked record |  |
| Designation | Link → Designation |  |  | read-only, copied from linked record |  |
| Employee Grade | Link → Employee Grade |  |  | read-only, copied from linked record |  |
| Activities | Table of *Employee Boarding Activity* |  |  | editable after submit |  |
| Exit Interview Summary | Rich text |  |  |  |  |
| Amended From | Link → Employee Separation |  |  | read-only |  |
| Separation Begins On | Date |  |  | **required** |  |

### Employee Separation Template

*master / regular record* · 6 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Title | Text |  |  | **required** |  |
| Company | Link → Company |  |  |  |  |
| Department | Link → Department |  |  |  |  |
| Designation | Link → Designation |  |  |  |  |
| Employee Grade | Link → Employee Grade |  |  |  |  |
| Activities | Table of *Employee Boarding Activity* |  |  |  |  |

### Employee Promotion

*submittable (Draft → Submitted → Cancelled)* · 10 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Employee | Link → Employee |  |  | **required** |  |
| Employee Name | Text |  |  | read-only, copied from linked record |  |
| Department | Link → Department |  |  | read-only, copied from linked record |  |
| Promotion Date | Date |  |  | **required** |  |
| Company | Link → Company |  |  | copied from linked record |  |
| Promotion details | Table of *Employee Property History* |  |  |  |  |
| Amended From | Link → Employee Promotion |  |  | read-only |  |
| Salary Currency | Link → Currency |  |  | read-only, copied from linked record |  |
| Current CTC | Amount |  |  | copied from linked record, ≥ 0 | required when [Revised CTC] is set |
| Revised CTC | Amount |  |  | ≥ 0 | shown when [Current CTC] is set |

### Employee Transfer

*submittable (Draft → Submitted → Cancelled)* · 11 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Employee | Link → Employee |  |  | **required** |  |
| Employee Name | Text |  |  | read-only, copied from linked record |  |
| Transfer Date | Date |  |  | **required** |  |
| Company | Link → Company |  |  | copied from linked record |  |
| New Company | Link → Company |  |  |  |  |
| Department | Link → Department |  |  | read-only, copied from linked record |  |
| Employee Transfer Detail | Table of *Employee Property History* |  |  | **required** |  |
| Re-allocate Leaves | Yes/No |  | 0 | hidden |  |
| Create New Employee Id | Yes/No |  | 0 |  |  |
| New Employee ID | Link → Employee |  |  | read-only, editable after submit |  |
| Amended From | Link → Employee Transfer |  |  | read-only |  |

### Employee Property History

*child table (rows inside another record)* · 4 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Property | Text |  |  | read-only |  |
| Current | Text |  |  | read-only |  |
| New | Text |  |  | read-only |  |
| Field Name | Text |  |  | read-only, hidden |  |

### Exit Interview

*submittable (Draft → Submitted → Cancelled)* · 19 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Employee | Link → Employee |  |  | **required** |  |
| Employee Name | Text |  |  | read-only, copied from linked record |  |
| Department | Link → Department |  |  | read-only, copied from linked record |  |
| Relieving Date | Date |  |  | read-only, copied from linked record |  |
| Company | Link → Company |  |  | **required** |  |
| Date | Date |  |  |  | required when [Status]='Scheduled' |
| Reference Document Type | Link → DocType |  |  |  |  |
| Reference Document Name | Link (record type chosen in another field) |  |  |  |  |
| Interviewers | Multi-select of *Interviewer* |  |  |  | required when [Status]='Scheduled' |
| Date of Joining | Date |  |  | read-only, copied from linked record |  |
| Reports To | Link → Employee |  |  | read-only, copied from linked record |  |
| Designation | Link → Designation |  |  | read-only, copied from linked record |  |
| Naming Series | Choice | HR-EXIT-INT- |  |  |  |
| Questionnaire Email Sent | Yes/No |  | 0 | read-only |  |
| Email ID | Text |  |  | read-only |  |
| Status | Choice | Pending / Scheduled / Completed / Cancelled |  | **required** |  |
| Final Decision | Choice | Employee Retained / Exit Confirmed |  |  | required when [Status]='Completed' |
| Amended From | Link → Exit Interview |  |  | read-only |  |
| Interview Summary | Rich text |  |  |  |  |

### Full and Final Statement

*submittable (Draft → Submitted → Cancelled)* · 16 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Employee | Link → Employee |  |  | **required** |  |
| Employee Name | Text |  |  | read-only, copied from linked record |  |
| Designation | Link → Designation |  |  | read-only, copied from linked record |  |
| Status | Choice | Paid / Unpaid / Cancelled | Unpaid | read-only |  |
| Department | Link → Department |  |  | read-only, copied from linked record |  |
| Amended From | Link → Full and Final Statement |  |  | read-only |  |
| Assets allocated | Table of *Full and Final Asset* |  |  |  |  |
| Relieving Date  | Date |  |  | read-only, copied from linked record |  |
| Date of Joining | Date |  |  | read-only, copied from linked record |  |
| Company | Link → Company |  |  | read-only, copied from linked record |  |
| Payables | Table of *Full and Final Outstanding Statement* |  |  |  |  |
| Receivables | Table of *Full and Final Outstanding Statement* |  |  |  |  |
| Transaction Date | Date |  |  | **required** |  |
| Total Payable Amount | Amount |  |  | read-only |  |
| Total Receivable Amount | Amount |  |  | read-only |  |
| Total Asset Recovery Cost | Amount |  |  | read-only |  |

### Full and Final Outstanding Statement

*child table (rows inside another record)* · 8 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Status | Choice | Settled / Unsettled | Unsettled |  |  |
| Remark | Long text |  |  |  |  |
| Reference Document | Link (record type chosen in another field) |  |  |  | shown when [Reference Document Type] is set; required when [Reference Document Type] is set |
| Component | Text |  |  | **required** |  |
| Account | Link → Account |  |  |  |  |
| Amount | Amount |  |  | ≥ 0 |  |
| Reference Document Type | Link → DocType |  |  |  |  |
| Paid via Salary Slip | Yes/No |  | 0 |  |  |

### Full and Final Asset

*child table (rows inside another record)* · 9 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Reference | Link → Asset Movement |  |  | **required**, read-only |  |
| Status | Choice | Owned / Returned |  | **required** |  |
| Description | Long text |  |  |  |  |
| Asset Name | Text |  |  | read-only |  |
| Date | Date & time |  |  | read-only |  |
| Action | Choice | Return / Recover Cost | Return | **required** |  |
| Cost | Amount |  |  | ≥ 0 | required when [Action] = "Recover Cost"; read-only when [Action] ≠ "Recover Cost" |
| Account | Link → Account |  |  |  |  |
| Actual Cost | Amount |  |  | read-only |  |

### Appointment Letter

*master / regular record* · 8 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Applicant Name | Text |  |  | **required**, read-only, copied from linked record |  |
| Appointment Date | Date |  |  | **required** |  |
| Appointment Letter Template | Link → Appointment Letter Template |  |  | **required** |  |
| Introduction | Long text |  |  | **required**, copied from linked record |  |
| Job Applicant | Link → Job Applicant |  |  | **required** |  |
| Company | Link → Company |  |  | **required** |  |
| Closing Notes | Long text |  |  |  |  |
| Terms | Table of *Appointment Letter content* |  |  | **required** |  |

### Appointment Letter Template

*master / regular record* · 4 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Introduction | Long text |  |  | **required** |  |
| Closing Notes | Long text |  |  |  |  |
| Terms | Table of *Appointment Letter content* |  |  | **required** |  |
| Template Name | Text |  |  | **required**, unique |  |

### Appointment Letter content

*child table (rows inside another record)* · 2 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Title | Text |  |  | **required** |  |
| Description | Long text |  |  | **required** |  |

### Employee Grade

*master / regular record* · 3 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Default Salary Structure | Link → Salary Structure |  |  |  |  |
| Default Base Pay | Amount |  |  | ≥ 0 | shown when [Default Salary Structure] is set |
| Currency | Link → Currency |  |  | read-only, hidden, copied from linked record |  |

### Skill

*master / regular record* · 2 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Skill Name | Text |  |  | unique |  |
| Description | Long text |  |  |  |  |

### Employee Skill Map

*master / regular record* · 5 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Employee | Link → Employee |  |  | unique |  |
| Employee Name | Display only |  |  | copied from linked record |  |
| Designation | Display only |  |  | copied from linked record |  |
| Employee Skills | Table of *Employee Skill* |  |  |  |  |
| Trainings | Table of *Employee Training* |  |  |  |  |

### Employee Skill

*child table (rows inside another record)* · 3 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Skill | Link → Skill |  |  | **required** |  |
| Proficiency | Rating |  |  | **required** |  |
| Evaluation Date | Date |  | Today |  |  |

### Designation Skill

*child table (rows inside another record)* · 1 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Skill | Link → Skill |  |  |  |  |

### Employment Type

*master / regular record* · 1 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Employment Type | Text |  |  | **required**, unique |  |

### Employee Health Insurance

*master / regular record* · 1 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Health Insurance Name | Text |  |  | **required**, unique |  |

### HR Settings

*single settings record* · 35 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Retirement Age (In Years) | Text |  |  |  |  |
| Employee Naming By | Choice | Naming Series / Employee Number / Full Name | Naming Series |  |  |
| Expense Approver Mandatory In Expense Claim | Yes/No |  | 1 |  |  |
| Leave Approver Mandatory In Leave Application | Yes/No |  | 1 |  |  |
| Show Leaves Of All Department Members In Calendar | Yes/No |  | 0 |  |  |
| Auto Leave Encashment | Yes/No |  | 0 |  |  |
| Role Allowed to Create Backdated Leave Application | Link → Role |  |  |  | shown when [Restrict Backdated Leave Application] = 1; required when [Restrict Backdated Leave Application] = 1 |
| Send Leave Notification | Yes/No |  | 1 |  |  |
| Leave Approval Notification Template | Link → Email Template |  |  |  | shown when [Send Leave Notification] = 1; required when [Send Leave Notification] = 1 |
| Leave Status Notification Template | Link → Email Template |  |  |  | shown when [Send Leave Notification] = 1; required when [Send Leave Notification] = 1 |
| Standard Working Hours | Number |  |  | ≥ 0 |  |
| Remind Before | Time |  | 00:15:00 |  | shown when [Send Interview Reminder] is set |
| Holidays | Yes/No |  | 1 |  |  |
| Work Anniversaries  | Yes/No |  | 1 |  |  |
| Set the frequency for holiday reminders | Choice | Weekly / Monthly | Weekly |  | shown when [Holidays]; required when [Holidays] is set |
| Birthdays | Yes/No |  | 1 |  |  |
| Send Interview Reminder | Yes/No |  | 0 |  |  |
| Send Interview Feedback Reminder | Yes/No |  | 0 |  |  |
| Feedback Reminder Notification Template | Link → Email Template |  |  |  | shown when [Send Interview Feedback Reminder] is set; required when [Send Interview Feedback Reminder] is set |
| Interview Reminder Notification Template | Link → Email Template |  |  |  | shown when [Send Interview Reminder] is set; required when [Send Interview Reminder] is set |
| Restrict Backdated Leave Application | Yes/No |  | 0 |  |  |
| Check Vacancies On Job Offer Creation | Yes/No |  | 0 |  |  |
| Exit Questionnaire Web Form | Link → Web Form |  |  |  |  |
| Exit Questionnaire Notification Template | Link → Email Template |  |  |  |  |
| Sender | Link → Email Account |  |  |  |  |
| Sender Email | Text |  |  | read-only, copied from linked record | shown when [Sender] |
| Sender | Link → Email Account |  |  |  |  |
| Sender Email | Text |  |  | read-only, copied from linked record | shown when [Sender] |
| Allow Multiple Shift Assignments for Same Date | Yes/No |  | 0 |  |  |
| Allow Employee Checkin from Mobile App | Yes/No |  | 1 |  |  |
| Allow Geolocation Tracking | Yes/No |  | 0 |  |  |
|  Unlink Payment on Cancellation of Employee Advance | Yes/No |  | 0 |  |  |
| Enable Multi-Currency Expense Claims | Yes/No |  | 0 |  |  |
| Prevent self approval for leaves even if user has permissions | Yes/No |  | 0 |  |  |
| Prevent self approval for expense claims even if user has permissions | Yes/No |  | 0 |  |  |

## Fields added to ERPNext records by HRMS (Employee, Department, Company …)

### Added to *Company*

3 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Default Expense Claim Payable Account | Link → Account |  |  |  | shown when not new record |
| Default Employee Advance Account | Link → Account |  |  |  |  |
| Default Payroll Payable Account | Link → Account |  |  |  | shown when not new record |

### Added to *Department*

5 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Payroll Cost Center | Link → Cost Center |  |  |  |  |
| Leave Block List | Link → Leave Block List |  |  |  |  |
| Shift Request Approver | Table of *Department Approver* |  |  |  |  |
| Leave Approver | Table of *Department Approver* |  |  |  |  |
| Expense Approver | Table of *Department Approver* |  |  |  |  |

### Added to *Designation*

2 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Appraisal Template | Link → Appraisal Template |  |  |  |  |
| Skills | Table of *Designation Skill* |  |  |  |  |

### Added to *Employee*

12 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Employment Type | Link → Employment Type |  |  |  |  |
| Job Applicant | Link → Job Applicant |  |  | read-only | shown when [Job Applicant] |
| Job Offer | Link → Job Offer |  |  | read-only | shown when [Job Offer] |
| Grade | Link → Employee Grade |  |  |  |  |
| Default Shift | Link → Shift Type |  |  |  |  |
| Health Insurance Provider | Link → Employee Health Insurance |  |  |  |  |
| Health Insurance No | Text |  |  |  | shown when [Health Insurance Provider] |
| Expense Approver | Link → User |  |  |  |  |
| Leave Approver | Link → User |  |  |  |  |
| Shift Request Approver | Link → User |  |  |  |  |
| Employee Advance Account | Link → Account |  |  |  |  |
| Payroll Cost Center | Link → Cost Center |  |  | copied from linked record |  |

### Added to *Project*

1 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Total Expense Claim (via Expense Claims) | Amount |  |  | read-only |  |

### Added to *Task*

1 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Total Expense Claim (via Expense Claim) | Amount |  |  | read-only |  |

### Added to *Timesheet*

1 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Salary Slip | Link → Salary Slip |  |  | read-only |  |

### Added to *Terms and Conditions*

1 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| HR | Yes/No |  | 1 |  |  |

### Added to *Salary Slip*

4 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Employee Loan | Table of *Salary Slip Loan* |  |  |  |  |
| Total Principal Amount | Amount |  | 0 | read-only |  |
| Total Interest Amount | Amount |  | 0 | read-only |  |
| Total Loan Repayment | Amount |  | 0 | read-only |  |

### Added to *Loan*

1 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Repay From Salary | Yes/No |  | 0 |  | shown when [Applicant type]="Employee" |

### Added to *Loan Repayment*

3 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Repay From Salary | Yes/No |  | 0 |  |  |
| Payroll Payable Account | Link → Account |  |  |  | shown when [Repay From Salary]; required when [Repay From Salary] |
| Process Payroll Accounting Entry based on Employee | Yes/No |  | 0 | hidden | shown when [Applicant type]="Employee" |


> The core **Employee** record itself (70 fields) is in [00-core-hr-masters.data-dictionary.md](00-core-hr-masters.data-dictionary.md).
