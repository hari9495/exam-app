# 07 · Performance — Data Dictionary

Companion to [07-performance.md](07-performance.md). Every data object and field in this module of the reference codebase, generated from its field definitions and written with **plain labels only** (no internal names, no help text) — clean-room.

**Columns:** *Type* — Text, Number, Amount, Date, Yes/No, Choice, Link → other record, Table of child rows… · *Flags* — required, read-only, editable after submit, unique, hidden, copied from linked record, ≥ 0 · *Conditions* — when the field is shown / required / read-only; `[Label]` refers to another field on the same record.

Use this as the **checklist of data** a YukthiX equivalent must be able to hold; field names, structure and storage in YukthiX are our own design.

---


### Appraisal Cycle

*master / regular record* · 13 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Start Date | Date |  |  | **required** |  |
| End Date | Date |  |  | **required** |  |
| Description | Rich text |  |  |  |  |
| Branch | Link → Branch |  |  |  |  |
| Department | Link → Department |  |  |  |  |
| Designation | Link → Designation |  |  |  |  |
| Company | Link → Company |  |  | **required** |  |
| Appraisees | Table of *Appraisee* |  |  |  |  |
| Cycle Name | Text |  |  | **required**, unique |  |
| KRA Evaluation Method | Choice | Automated Based on Goal Progress / Manual Rating | Automated Based on Goal Progress |  |  |
| Status | Choice | Not Started / In Progress / Completed | Not Started | read-only |  |
| Final Score Formula | Code / expression |  |  |  | shown when [Calculate Final Score based on Formula] is set; required when [Calculate Final Score based on Formula] is set |
| Calculate Final Score based on Formula | Yes/No |  | 0 |  |  |

### Appraisee

*child table (rows inside another record)* · 6 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Employee | Link → Employee |  |  | **required** |  |
| Employee Name | Text |  |  | read-only, copied from linked record |  |
| Department | Link → Department |  |  | read-only, copied from linked record |  |
| Designation | Text |  |  | read-only, copied from linked record |  |
| Branch | Link → Branch |  |  | read-only, copied from linked record |  |
| Appraisal Template | Link → Appraisal Template |  |  |  |  |

### Appraisal Template

*master / regular record* · 4 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Description | Long text |  |  |  |  |
| KRAs | Table of *Appraisal Template Goal* |  |  | **required** |  |
| Rating Criteria | Table of *Employee Feedback Rating* |  |  |  |  |
| Appraisal Template Title | Text |  |  | **required**, unique |  |

### Appraisal Template Goal

*child table (rows inside another record)* · 2 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Weightage (%) | Percent |  |  | **required**, ≥ 0 |  |
| KRA | Link → KRA |  |  | **required** |  |

### KRA

*master / regular record* · 2 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Title | Text |  |  | **required**, unique |  |
| Description | Long text |  |  |  |  |

### Employee Feedback Criteria

*master / regular record* · 1 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Criteria | Text |  |  | **required**, unique |  |

### Appraisal

*submittable (Draft → Submitted → Cancelled)* · 23 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Series | Choice | HR-APR-.YYYY.- |  | **required** |  |
| Employee | Link → Employee |  |  | **required** |  |
| Employee Name | Text |  |  | read-only, copied from linked record |  |
| Department | Link → Department |  |  | read-only, copied from linked record |  |
| Company | Link → Company |  |  | **required** |  |
| Designation | Link → Designation |  |  | read-only, copied from linked record |  |
| Appraisal Cycle | Link → Appraisal Cycle |  |  | **required** |  |
| KRA vs Goals | Table of *Appraisal KRA* |  |  |  | shown when not [Rate Goals Manually] |
| Total Goal Score | Number |  |  | read-only |  |
| Total Self Score | Number |  |  | read-only |  |
| Average Feedback Score | Number |  |  | read-only, hidden |  |
| Employee Image | Image file |  |  | editable after submit, hidden, copied from linked record |  |
| Appraisal Template | Link → Appraisal Template |  |  |  | required when not new record |
| Amended From | Link → Appraisal |  |  | read-only |  |
| Reflections | Rich text |  |  |  |  |
| Goals | Table of *Appraisal Goal* |  |  |  | shown when [Rate Goals Manually] is set |
| Remarks | Long text |  |  |  | shown when [Rate Goals Manually] is set |
| Rate Goals Manually | Yes/No |  | 0 | read-only |  |
| Start Date | Date |  |  | read-only |  |
| End Date | Date |  |  | read-only |  |
| Goal Score (%) | Number |  |  | read-only | shown when not [Rate Goals Manually] |
| Self ratings | Table of *Employee Feedback Rating* |  |  |  |  |
| Final Score | Number |  |  | read-only | shown when [Appraisal Cycle] is set |

### Appraisal KRA

*child table (rows inside another record)* · 4 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| KRA | Link → KRA |  |  | **required** |  |
| Weightage (%) | Percent |  |  | **required**, ≥ 0 |  |
| Goal Completion (%) | Percent |  |  | read-only |  |
| Goal Score (weighted) | Number |  |  | read-only |  |

### Appraisal Goal

*child table (rows inside another record)* · 4 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Goal | Long text |  |  | **required** |  |
| Weightage (%) | Number |  |  | **required**, ≥ 0 |  |
| Score | Number |  |  | ≥ 0 |  |
| Score Earned | Number |  |  | read-only |  |

### Employee Feedback Rating

*child table (rows inside another record)* · 3 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Rating | Rating |  |  |  | shown when [Parenttype] ≠ "Appraisal Template" |
| Criteria | Link → Employee Feedback Criteria |  |  | **required** |  |
| Weightage (%) | Percent |  |  | **required**, ≥ 0 |  |

### Goal

*master / regular record* · 17 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Employee | Link → Employee |  |  | **required** |  |
| Start Date | Date |  |  | **required**, copied from linked record | shown when [Employee] is set |
| Progress | Percent |  |  | ≥ 0 | read-only when [Is Group] or [Status]='Closed' |
| Status | Choice | Pending / In Progress / Completed / Archived / Closed | Pending | read-only |  |
| Description | Rich text |  |  |  |  |
| Left | Whole number |  |  | read-only, hidden |  |
| Right | Whole number |  |  | read-only, hidden |  |
| Is Group | Yes/No |  | 0 |  |  |
| Old Parent | Link → Goal |  |  | hidden |  |
| Parent Goal | Link → Goal |  |  |  | shown when [Employee] is set |
| KRA | Link → KRA |  |  | copied from linked record | shown when [Employee] is set; required when not [Parent Goal] and [Appraisal Cycle]; read-only when [Parent Goal] |
| Appraisal Cycle | Link → Appraisal Cycle |  |  | copied from linked record | shown when [Employee] is set; read-only when [Parent Goal] |
| Employee Name | Text |  |  | read-only, copied from linked record |  |
| User | Text |  |  | read-only, copied from linked record |  |
| End Date | Date |  |  | copied from linked record | shown when [Employee] is set |
| Goal | Text |  |  | **required** |  |
| Company | Link → Company |  |  | read-only, copied from linked record |  |

### Employee Performance Feedback

*submittable (Draft → Submitted → Cancelled)* · 16 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Employee Name | Text |  |  | read-only, copied from linked record |  |
| Total Score | Number |  |  | read-only |  |
| Feedback | Rich text |  |  | **required** |  |
| Added On | Date & time |  | Now | **required** |  |
| For Employee | Link → Employee |  |  | **required** |  |
| Appraisal | Link → Appraisal |  |  | **required** |  |
| Designation | Link → Designation |  |  | read-only, copied from linked record |  |
| Reviewer | Link → Employee |  |  | **required** |  |
| Reviewer Name | Text |  |  | read-only, copied from linked record |  |
| Department | Link → Department |  |  | read-only, copied from linked record |  |
| Designation | Link → Designation |  |  | read-only, copied from linked record |  |
| Appraisal Cycle | Link → Appraisal Cycle |  |  | read-only, copied from linked record |  |
| Feedback Ratings | Table of *Employee Feedback Rating* |  |  |  |  |
| User | Link → User |  |  | read-only, copied from linked record |  |
| Amended From | Link → Employee Performance Feedback |  |  | read-only |  |
| Company | Link → Company |  |  | **required**, read-only, copied from linked record |  |
