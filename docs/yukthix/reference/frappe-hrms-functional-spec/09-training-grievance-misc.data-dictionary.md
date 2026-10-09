# 09 · Training, Grievance & Other Features — Data Dictionary

Companion to [09-training-grievance-misc.md](09-training-grievance-misc.md). Every data object and field in this module of the reference codebase, generated from its field definitions and written with **plain labels only** (no internal names, no help text) — clean-room.

**Columns:** *Type* — Text, Number, Amount, Date, Yes/No, Choice, Link → other record, Table of child rows… · *Flags* — required, read-only, editable after submit, unique, hidden, copied from linked record, ≥ 0 · *Conditions* — when the field is shown / required / read-only; `[Label]` refers to another field on the same record.

Use this as the **checklist of data** a YukthiX equivalent must be able to hold; field names, structure and storage in YukthiX are our own design.

---


### Training Program

*master / regular record* · 9 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Training Program | Text |  |  | **required**, unique |  |
| Status | Choice | Scheduled / Completed / Cancelled | Scheduled | editable after submit |  |
| Company | Link → Company |  |  | **required** |  |
| Trainer Name | Text |  |  |  |  |
| Trainer Email | Text |  |  |  |  |
| Supplier | Link → Supplier |  |  |  |  |
| Contact Number | Text |  |  |  |  |
| Description | Rich text |  |  | **required** |  |
| Amended From | Link → Training Program |  |  | read-only |  |

### Training Event

*submittable (Draft → Submitted → Cancelled)* · 19 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Event Name | Text |  |  | **required**, unique |  |
| Training Program | Link → Training Program |  |  |  |  |
| Event Status | Choice | Scheduled / Completed / Cancelled |  | **required**, editable after submit |  |
| Has Certificate | Yes/No |  | 0 |  | shown when [Type] = 'Seminar' or [Type] = 'Workshop' or [Type] = 'Conference' or [Type] = 'Exam' |
| Type | Choice | Seminar / Theory / Workshop / Conference / Exam / Internet / Self-Study |  | **required** |  |
| Level | Choice | Beginner / Intermediate / Advance |  |  | shown when [Type] = 'Seminar' or [Type] = 'Workshop' or [Type] = 'Exam' |
| Company | Link → Company |  |  |  |  |
| Trainer Name | Text |  |  |  |  |
| Trainer Email | Text |  |  |  |  |
| Supplier | Link → Supplier |  |  |  |  |
| Contact Number | Text |  |  |  |  |
| Course | Text |  |  |  |  |
| Location | Text |  |  | **required** |  |
| Start Time | Date & time |  |  | **required** |  |
| End Time | Date & time |  |  | **required** |  |
| Introduction | Rich text |  |  | **required** |  |
| Employees | Table of *Training Event Employee* |  |  | editable after submit |  |
| Amended From | Link → Training Event |  |  | read-only |  |
| Employee Emails | Long text |  |  | hidden |  |

### Training Event Employee

*child table (rows inside another record)* · 6 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Employee | Link → Employee |  |  |  |  |
| Employee Name | Display only |  |  | copied from linked record |  |
| Department | Link → Department |  |  | read-only, copied from linked record |  |
| Status | Choice | Open / Invited / Completed / Feedback Submitted | Open | editable after submit |  |
| Attendance | Choice | Present / Absent |  |  |  |
| Is Mandatory | Yes/No |  | 1 |  |  |

### Training Result

*submittable (Draft → Submitted → Cancelled)* · 4 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Training Event | Link → Training Event |  |  | **required**, unique |  |
| Employees | Table of *Training Result Employee* |  |  |  |  |
| Amended From | Link → Training Result |  |  | read-only |  |
| Employee Emails | Long text |  |  | hidden |  |

### Training Result Employee

*child table (rows inside another record)* · 6 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Employee | Link → Employee |  |  |  |  |
| Employee Name | Display only |  |  | copied from linked record |  |
| Department | Link → Department |  |  | read-only, copied from linked record |  |
| Hours | Number |  |  | editable after submit, ≥ 0 |  |
| Grade | Text |  |  | editable after submit |  |
| Comments | Long text |  |  | editable after submit |  |

### Training Feedback

*submittable (Draft → Submitted → Cancelled)* · 9 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Employee | Link → Employee |  |  | **required** |  |
| Employee Name | Display only |  |  | copied from linked record |  |
| Department | Link → Department |  |  | read-only, copied from linked record |  |
| Course | Text |  |  | read-only, copied from linked record |  |
| Training Event | Link → Training Event |  |  | **required** |  |
| Event Name | Text |  |  | read-only, copied from linked record |  |
| Trainer Name | Text |  |  | read-only, copied from linked record |  |
| Feedback | Long text |  |  | **required** |  |
| Amended From | Link → Training Feedback |  |  | read-only |  |

### Employee Training

*child table (rows inside another record)* · 2 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Training | Link → Training Event |  |  |  |  |
| Training Date | Date |  |  | copied from linked record |  |

### Employee Grievance

*submittable (Draft → Submitted → Cancelled)* · 19 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Grievance Type | Link → Grievance Type |  |  | **required** |  |
| Date  | Date |  |  | **required** |  |
| Status | Choice | Open / Investigated / Resolved / Invalid / Cancelled | Open | **required** |  |
| Description | Long text |  |  | **required** |  |
| Cause of Grievance | Long text |  |  |  | required when [Status] = "Investigated" or [Status] = "Resolved" |
| Resolved By | Link → User |  |  |  | required when [Status] = "Resolved" |
| Employee Responsible  | Link → Employee |  |  |  |  |
| Resolution Details | Long text |  |  |  | required when [Status] = "Resolved" |
| Resolution Date | Date |  |  |  | required when [Status] = "Resolved" |
| Grievance Against | Link (record type chosen in another field) |  |  | **required** |  |
| Raised By | Link → Employee |  |  | **required** |  |
| Amended From | Link → Employee Grievance |  |  | read-only |  |
| Designation | Link → Designation |  |  | read-only, copied from linked record |  |
| Reports To | Link → Employee |  |  | read-only, copied from linked record |  |
| Grievance Against Party | Link → DocType |  |  | **required** |  |
| Associated Document Type | Link → DocType |  |  |  |  |
| Associated Document | Link (record type chosen in another field) |  |  |  |  |
| Employee Name | Text |  |  | read-only, copied from linked record |  |
| Subject | Text |  |  | **required** |  |

### Grievance Type

*master / regular record* · 0 fields

_No data fields._

### Daily Work Summary Group

*master / regular record* · 6 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Enabled | Yes/No |  | 1 |  |  |
| Users | Table of *Daily Work Summary Group User* |  |  | **required** |  |
| Send Emails At | Choice | 00:00 / 01:00 / 02:00 / 03:00 / 04:00 / 05:00 / 06:00 / 07:00 / 08:00 / 09:00 / 10:00 / 11:00 / 12:00 / 13:00 / 14:00 / 15:00 / 16:00 / 17:00 / 18:00 / 19:00 / 20:00 / 21:00 / 22:00 / 23:00 |  |  |  |
| Holiday List | Link → Holiday List |  |  |  |  |
| Subject | Text |  | What did you work on today? |  |  |
| Message | Rich text |  | <p>Please share what did you do today. If you reply by midnight, your response will be recorded!</p> |  |  |

### Daily Work Summary Group User

*child table (rows inside another record)* · 2 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| User | Link → User |  |  |  |  |
| email | Display only |  |  | copied from linked record |  |

### Daily Work Summary

*master / regular record* · 3 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Daily Work Summary Group | Link → Daily Work Summary Group |  |  | read-only |  |
| Status | Choice | Open / Sent | Open | read-only |  |
| Email Sent To | Code / expression |  |  | read-only |  |

### Department Approver

*child table (rows inside another record)* · 1 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Approver | Link → User |  |  | **required** |  |

### Identification Document Type

*master / regular record* · 1 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Identification Document Type | Text |  |  | unique |  |

### Interest

*master / regular record* · 1 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Interest | Text |  |  | **required**, unique |  |
