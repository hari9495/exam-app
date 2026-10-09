# 08 · Recruitment — Data Dictionary

Companion to [08-recruitment.md](08-recruitment.md). Every data object and field in this module of the reference codebase, generated from its field definitions and written with **plain labels only** (no internal names, no help text) — clean-room.

**Columns:** *Type* — Text, Number, Amount, Date, Yes/No, Choice, Link → other record, Table of child rows… · *Flags* — required, read-only, editable after submit, unique, hidden, copied from linked record, ≥ 0 · *Conditions* — when the field is shown / required / read-only; `[Label]` refers to another field on the same record.

Use this as the **checklist of data** a YukthiX equivalent must be able to hold; field names, structure and storage in YukthiX are our own design.

---


### Staffing Plan

*submittable (Draft → Submitted → Cancelled)* · 7 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Company | Link → Company |  |  | **required** |  |
| Department | Link → Department |  |  |  |  |
| From Date | Date |  |  | **required** |  |
| To Date | Date |  |  | **required** |  |
| Staffing Details | Table of *Staffing Plan Detail* |  |  | **required** |  |
| Total Estimated Budget | Amount |  | 0.00 | read-only |  |
| Amended From | Link → Staffing Plan |  |  | read-only |  |

### Staffing Plan Detail

*child table (rows inside another record)* · 7 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Designation | Link → Designation |  |  | **required** |  |
| Number Of Positions | Whole number |  |  | read-only |  |
| Estimated Cost Per Position | Amount |  |  | ≥ 0 |  |
| Current Count | Whole number |  |  | read-only |  |
| Current Openings | Whole number |  |  | read-only |  |
| Vacancies | Whole number |  |  | ≥ 0 |  |
| Total Estimated Cost | Amount |  |  | read-only |  |

### Job Requisition

*master / regular record* · 17 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Designation | Link → Designation |  |  | **required** |  |
| No of. Positions | Whole number |  |  | **required**, ≥ 0 |  |
| Expected Compensation | Amount |  |  | **required**, ≥ 0 |  |
| Status | Choice | Pending / Open & Approved / Rejected / Filled / On Hold / Cancelled |  | **required** |  |
| Company | Link → Company |  |  | **required** |  |
| Requested By | Link → Employee |  |  | **required** |  |
| Requested By (Name) | Text |  |  | read-only, copied from linked record |  |
| Department | Link → Department |  |  | read-only, copied from linked record |  |
| Designation | Link → Designation |  |  | read-only, copied from linked record |  |
| Posting Date | Date |  | Today | **required** |  |
| Expected By | Date |  |  |  |  |
| Completed On | Date |  |  |  | shown when [Status]="Filled"; required when [Status]="Filled" |
| Job Description | Rich text |  |  | **required**, copied from linked record |  |
| Naming Series | Choice | HR-HIREQ- |  |  |  |
| Reason for Requesting | Long text |  |  |  |  |
| Department | Link → Department |  |  |  |  |
| Time to Fill | Duration |  |  | read-only |  |

### Job Opening Template

*master / regular record* · 11 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Department | Link → Department |  |  |  |  |
| Employment Type | Link → Employment Type |  |  |  |  |
| Location | Link → Branch |  |  |  |  |
| Template Title | Text |  |  | **required**, unique |  |
| Description | Rich text |  |  |  |  |
| Designation | Link → Designation |  |  |  |  |
| Currency | Link → Currency |  |  |  |  |
| Upper Range | Amount |  |  | ≥ 0 |  |
| Lower Range | Amount |  |  | ≥ 0 |  |
| Salary Paid Per | Choice | Month / Year | Month |  |  |
| Publish Salary Range | Yes/No |  | 0 |  |  |

### Job Opening

*master / regular record* · 26 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Job Title | Text |  |  | **required** |  |
| Company | Link → Company |  |  | **required** |  |
| Status | Choice | Open / Closed |  | hidden |  |
| Designation | Link → Designation |  |  | **required** |  |
| Department | Link → Department |  |  |  |  |
| Staffing Plan | Link → Staffing Plan |  |  | read-only |  |
| Planned number of Positions | Whole number |  |  | read-only | shown when [Staffing Plan] is set |
| Publish on website | Yes/No |  | 0 |  |  |
| Route | Text |  |  | unique | shown when [Publish on website] is set |
| Description | Rich text |  |  |  |  |
| Currency | Link → Currency |  |  |  |  |
| Lower Range | Amount |  |  | ≥ 0 |  |
| Upper Range | Amount |  |  | ≥ 0 |  |
| Application Web Form Route | Text |  |  |  | shown when [Publish on website] is set |
| Publish Salary Range | Yes/No |  | 0 |  |  |
| Job Requisition | Link → Job Requisition |  |  | read-only |  |
| Vacancies | Whole number |  |  | read-only, copied from linked record | shown when [Job Requisition] is set |
| Posted On | Date & time |  | Now |  |  |
| Closes On | Date |  |  |  | shown when [Status] = 'Open' |
| Employment Type | Link → Employment Type |  |  |  |  |
| Location | Link → Branch |  |  |  |  |
| Closed On | Date |  |  |  | shown when [Status] = 'Closed' |
| Salary Paid Per | Choice | Month / Year | Month |  |  |
| Publish Applications Received | Yes/No |  | 1 |  | shown when [Publish on website] is set |
| Prevent Duplicate Applications | Yes/No |  | 0 |  | shown when [Publish on website] is set |
| Job Opening Template | Link → Job Opening Template |  |  |  |  |

### Job Applicant Source

*master / regular record* · 0 fields

_No data fields._

### Job Applicant

*master / regular record* · 18 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Full Name | Text |  |  | **required** |  |
| Email Address | Text |  |  | **required** |  |
| Status | Choice | Open / Replied / Shortlisted / Rejected / Hold / Accepted |  | **required** |  |
| Job Opening | Link → Job Opening |  |  |  |  |
| Source | Link → Job Applicant Source |  |  |  |  |
| Source Name | Link → Employee |  |  |  | shown when [Source]="Employee Referral" |
| Cover Letter | Long text |  |  |  |  |
| Attachment | File |  |  |  |  |
| Notes | Text |  |  | read-only |  |
| Phone Number | Text |  |  |  |  |
| Country | Link → Country |  |  |  |  |
| Link | Text |  |  |  |  |
| Applicant Rating | Rating |  |  |  |  |
| Lower Range | Amount |  |  | ≥ 0 |  |
| Upper Range | Amount |  |  | ≥ 0 |  |
| Currency | Link → Currency |  |  |  |  |
| Employee Referral | Link → Employee Referral |  |  | read-only |  |
| Designation | Link → Designation |  |  | copied from linked record |  |

### Employee Referral

*submittable (Draft → Submitted → Cancelled)* · 20 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| First Name  | Text |  |  | **required** |  |
| Last Name | Text |  |  | **required** |  |
| Full Name | Text |  |  | read-only |  |
| Contact No. | Text |  |  |  |  |
| Current Employer  | Text |  |  |  |  |
| Date | Date |  |  | **required** |  |
| Status | Choice | Pending / In Process / Accepted / Rejected / Cancelled |  | **required**, read-only, editable after submit |  |
| Current Job Title | Text |  |  |  |  |
| Resume | File |  |  |  |  |
| Department | Link → Department |  |  | read-only, copied from linked record |  |
| Work References | Rich text |  |  |  |  |
| Amended From | Link → Employee Referral |  |  | read-only |  |
| For Designation  | Link → Designation |  |  | **required** |  |
| Email | Text |  |  | **required** |  |
| Is Applicable for Referral Bonus | Yes/No |  | 1 |  |  |
| Why is this Candidate Qualified for this Position? | Rich text |  |  |  |  |
| Referrer | Link → Employee |  |  | **required** |  |
| Referrer Name | Text |  |  | read-only, copied from linked record |  |
| Resume Link | Text |  |  |  |  |
| Referral Bonus Payment Status | Choice | Unpaid / Paid |  | read-only |  |

### Interview Type

*master / regular record* · 6 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Designation | Link → Designation |  |  |  |  |
| Expected Skillset | Table of *Expected Skill Set* |  |  | **required** |  |
| Expected Average Rating | Rating |  |  |  |  |
| Interviewers | Multi-select of *Interviewer* |  |  |  |  |
| Description | Long text |  |  |  |  |
| Interview Type Name | Text |  |  | unique |  |

### Interviewer

*child table (rows inside another record)* · 1 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| User | Link → User |  |  |  |  |

### Expected Skill Set

*child table (rows inside another record)* · 2 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Skill | Link → Skill |  |  | **required** |  |
| Description | Long text |  |  | copied from linked record |  |

### Interview

*submittable (Draft → Submitted → Cancelled)* · 15 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Job Applicant | Link → Job Applicant |  |  | **required** |  |
| Job Opening | Link → Job Opening |  |  | read-only, copied from linked record |  |
| Status | Choice | Pending / Under Review / Cleared / Rejected / Cancelled | Pending | **required** |  |
| Obtained Average Rating | Rating |  |  | read-only, editable after submit |  |
| Interview summary | Long text |  |  | editable after submit |  |
| Resume link | Text |  |  | copied from linked record |  |
| Expected Average Rating | Rating |  |  | read-only, copied from linked record |  |
| Designation | Link → Designation |  |  | read-only, copied from linked record |  |
| Amended From | Link → Interview |  |  | read-only |  |
| Scheduled On | Date |  |  | **required** |  |
| Reminded | Yes/No |  | 0 | hidden |  |
| From Time | Time |  |  | **required** |  |
| To Time | Time |  |  | **required** |  |
| Interviewers | Table of *Interview Detail* |  |  | editable after submit |  |
| Interview Type | Link → Interview Type |  |  | **required** |  |

### Interview Detail

*child table (rows inside another record)* · 1 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Interviewer | Link → User |  |  |  |  |

### Interview Feedback

*submittable (Draft → Submitted → Cancelled)* · 9 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Interview | Link → Interview |  |  | **required** |  |
| Interviewer | Link → User |  |  | **required** |  |
| Skill assessment | Table of *Skill Assessment* |  |  | **required** |  |
| Average Rating | Rating |  |  | read-only |  |
| Amended From | Link → Interview Feedback |  |  | read-only |  |
| Feedback | Long text |  |  |  |  |
| Result | Choice | Cleared / Rejected |  | **required** |  |
| Job Applicant | Link → Job Applicant |  |  | read-only, copied from linked record |  |
| Interview Type | Link → Interview Type |  |  | **required**, read-only, copied from linked record |  |

### Skill Assessment

*child table (rows inside another record)* · 2 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Skill | Link → Skill |  |  | **required**, read-only |  |
| Rating | Rating |  |  | **required** |  |

### Job Offer

*submittable (Draft → Submitted → Cancelled)* · 14 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Job Applicant | Link → Job Applicant |  |  |  | shown when [Job Applicant] |
| Applicant Name | Text |  |  | **required**, copied from linked record |  |
| Applicant Email Address | Text |  |  | **required**, copied from linked record |  |
| Status | Choice | Awaiting Response / Accepted / Rejected / Cancelled |  | editable after submit |  |
| Offer Date | Date |  |  | **required** |  |
| Designation | Link → Designation |  |  | **required**, copied from linked record |  |
| Company | Link → Company |  |  | **required** |  |
| Job Offer Terms | Table of *Job Offer Term* |  |  |  |  |
| Select Terms and Conditions | Link → Terms and Conditions |  |  |  |  |
| Terms and Conditions | Rich text |  |  |  |  |
| Letter Head | Link → Letter Head |  |  | editable after submit, copied from linked record |  |
| Print Heading | Link → Print Heading |  |  | editable after submit |  |
| Amended From | Link → Job Offer |  |  | read-only |  |
| Job Offer Term Template | Link → Job Offer Term Template |  |  |  |  |

### Job Offer Term

*child table (rows inside another record)* · 2 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Offer Term | Link → Offer Term |  |  | **required** |  |
| Value / Description | Long text |  |  | **required** |  |

### Offer Term

*master / regular record* · 1 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Offer Term | Text |  |  | **required**, unique |  |

### Job Offer Term Template

*master / regular record* · 2 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Title | Text |  |  | unique |  |
| Offer Terms | Table of *Job Offer Term* |  |  |  |  |
