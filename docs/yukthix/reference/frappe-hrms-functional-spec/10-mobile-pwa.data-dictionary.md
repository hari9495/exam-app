# 10 · Mobile App (PWA) — Data Dictionary

Companion to [10-mobile-pwa.md](10-mobile-pwa.md). Every data object and field in this module of the reference codebase, generated from its field definitions and written with **plain labels only** (no internal names, no help text) — clean-room.

**Columns:** *Type* — Text, Number, Amount, Date, Yes/No, Choice, Link → other record, Table of child rows… · *Flags* — required, read-only, editable after submit, unique, hidden, copied from linked record, ≥ 0 · *Conditions* — when the field is shown / required / read-only; `[Label]` refers to another field on the same record.

Use this as the **checklist of data** a YukthiX equivalent must be able to hold; field names, structure and storage in YukthiX are our own design.

---


### PWA Notification

*master / regular record* · 6 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| From User | Link → User |  |  | copied from linked record |  |
| To User | Link → User |  |  | copied from linked record |  |
| Message | Rich text |  |  |  |  |
| Read | Yes/No |  | 0 |  |  |
| Reference Document Type | Link → DocType |  |  |  |  |
| Reference Document Name | Text |  |  |  |  |

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
