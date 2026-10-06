# 00 · Core HR Masters (from ERPNext) — Data Dictionary

Companion to [00-core-hr-masters.md](00-core-hr-masters.md). Every data object and field in this module of the reference codebase, generated from its field definitions and written with **plain labels only** (no internal names, no help text) — clean-room.

**Columns:** *Type* — Text, Number, Amount, Date, Yes/No, Choice, Link → other record, Table of child rows… · *Flags* — required, read-only, editable after submit, unique, hidden, copied from linked record, ≥ 0 · *Conditions* — when the field is shown / required / read-only; `[Label]` refers to another field on the same record.

Use this as the **checklist of data** a YukthiX equivalent must be able to hold; field names, structure and storage in YukthiX are our own design.

---


### Employee

*master / regular record* · 70 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Employee | Text |  |  | hidden |  |
| Series | Choice | HR-EMP- |  |  |  |
| Salutation | Link → Salutation |  |  |  |  |
| First Name | Text |  |  | **required** |  |
| Middle Name | Text |  |  |  |  |
| Last Name | Text |  |  |  |  |
| Full Name | Text |  |  | read-only |  |
| Image | Image file |  |  | hidden |  |
| Company | Link → Company |  |  | **required** |  |
| Status | Choice | Active / Inactive / Suspended / Left | Active | **required** |  |
| Employee Number | Text |  |  |  |  |
| Gender | Link → Gender |  |  | **required** |  |
| Date of Birth | Date |  |  | **required** |  |
| Date of Joining | Date |  |  | **required** |  |
| Emergency Phone | Text |  |  |  |  |
| Emergency Contact Name | Text |  |  |  |  |
| Relation | Text |  |  |  |  |
| User ID | Link → User |  |  |  |  |
| Create User Permission | Yes/No |  | 1 |  | shown when [User ID] or [Create User Automatically] |
| Create User Automatically | Yes/No |  | 0 |  | shown when new record and not [User ID] |
| Offer Date | Date |  |  |  |  |
| Confirmation Date | Date |  |  |  |  |
| Contract End Date | Date |  |  |  |  |
| Notice (days) | Whole number |  |  |  |  |
| Date Of Retirement | Date |  |  |  |  |
| Department | Link → Department |  |  |  |  |
| Designation | Link → Designation |  |  |  |  |
| Reports to | Link → Employee |  |  |  |  |
| Branch | Link → Branch |  |  |  |  |
| Holiday List | Link → Holiday List |  |  |  |  |
| Salary Mode | Choice | Bank / Cash / Cheque |  |  |  |
| Bank Name | Text |  |  |  | shown when [Salary Mode] = 'Bank' |
| Bank A/C No. | Text |  |  |  | shown when [Salary Mode] = 'Bank' |
| Mobile | Text |  |  |  |  |
| Preferred Contact Email | Choice | Company Email / Personal Email / User ID |  |  |  |
| Preferred Email | Text |  |  | read-only |  |
| Company Email | Text |  |  |  |  |
| Personal Email | Text |  |  |  |  |
| Unsubscribed | Yes/No |  | 0 |  |  |
| Permanent Address Is | Choice | Rented / Owned |  |  |  |
| Permanent Address | Long text |  |  |  |  |
| Current Address Is | Choice | Rented / Owned |  |  |  |
| Current Address | Long text |  |  |  |  |
| Bio / Cover Letter | Rich text |  |  |  |  |
| Passport Number | Text |  |  |  |  |
| Date of Issue | Date |  |  |  |  |
| Valid Up To | Date |  |  |  |  |
| Place of Issue | Text |  |  |  |  |
| Marital Status | Choice | Single / Married / Divorced / Widowed |  |  |  |
| Blood Group | Choice | A+ / A- / B+ / B- / AB+ / AB- / O+ / O- |  |  |  |
| Family Background | Long text |  |  |  |  |
| Health Details | Long text |  |  |  |  |
| Education | Table of *Employee Education* |  |  |  |  |
| External Work History | Table of *Employee External Work History* |  |  |  |  |
| Internal Work History | Table of *Employee Internal Work History* |  |  |  |  |
| Resignation Letter Date | Date |  |  |  |  |
| Relieving Date | Date |  |  |  | required when [Status] = "Left" |
| Reason for Leaving | Long text |  |  |  |  |
| Leave Encashed? | Choice | Yes / No |  |  |  |
| Encashment Date | Date |  |  |  | shown when [Leave Encashed?] ="Yes" |
| Exit Interview Held On | Date |  |  |  |  |
| New Workplace | Text |  |  |  |  |
| Feedback | Long text |  |  |  |  |
| lft | Whole number |  |  | read-only, hidden |  |
| rgt | Whole number |  |  | read-only, hidden |  |
| Old Parent | Text |  |  | hidden |  |
| Attendance Device ID (Biometric/RF tag ID) | Text |  |  | unique |  |
| Salary Currency | Link → Currency |  |  |  |  |
| Cost to Company (CTC) | Amount |  |  |  |  |
| IBAN | Text |  |  |  | shown when [Salary Mode] = 'Bank' |

### Employee Education

*child table (rows inside another record)* · 6 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| School/University | Long text |  |  |  |  |
| Qualification | Text |  |  |  |  |
| Level | Choice | Graduate / Post Graduate / Under Graduate |  |  |  |
| Year of Passing | Whole number |  |  |  |  |
| Class / Percentage | Text |  |  |  |  |
| Major/Optional Subjects | Long text |  |  |  |  |

### Employee External Work History

*child table (rows inside another record)* · 6 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Company | Text |  |  |  |  |
| Designation | Text |  |  |  |  |
| Salary | Amount |  |  |  |  |
| Address | Long text |  |  |  |  |
| Contact | Text |  |  |  |  |
| Total Experience | Text |  |  |  |  |

### Employee Internal Work History

*child table (rows inside another record)* · 5 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Branch | Link → Branch |  |  |  |  |
| Department | Link → Department |  |  |  |  |
| Designation | Link → Designation |  |  |  |  |
| From Date | Date |  |  |  |  |
| To Date | Date |  |  |  |  |

### Department

*master / regular record* · 8 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Department | Text |  |  | **required** |  |
| Parent Department | Link → Department |  |  |  |  |
| Company | Link → Company |  |  | **required** |  |
| Is Group | Yes/No |  | 0 |  |  |
| Disabled | Yes/No |  | 0 |  |  |
| lft | Whole number |  |  | read-only, hidden |  |
| rgt | Whole number |  |  | read-only, hidden |  |
| Old Parent | Text |  |  | hidden |  |

### Designation

*master / regular record* · 2 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Designation | Text |  |  | **required**, unique |  |
| Description | Long text |  |  |  |  |

### Branch

*master / regular record* · 1 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Branch | Text |  |  | **required**, unique |  |

### Employee Group

*master / regular record* · 2 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Name | Text |  |  | **required**, unique |  |
| Employee | Table of *Employee Group Table* |  |  |  |  |

### Employee Group Table

*child table (rows inside another record)* · 3 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Employee | Link → Employee |  |  |  |  |
| Employee Name | Text |  |  | copied from linked record |  |
| ERPNext User ID | Text |  |  | read-only, copied from linked record |  |

### Holiday List

*master / regular record* · 10 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Holiday List Name | Text |  |  | **required**, unique |  |
| From Date | Date |  |  | **required** |  |
| To Date | Date |  |  | **required** |  |
| Total Holidays | Number |  |  | read-only |  |
| Weekly Off | Choice | Sunday / Monday / Tuesday / Wednesday / Thursday / Friday / Saturday |  |  |  |
| Holidays | Table of *Holiday* |  |  |  |  |
| Color | Colour |  |  |  |  |
| Country | Choice |  |  |  |  |
| Subdivision | Choice |  |  |  | shown when [Country] is set |
| Is Half Day | Yes/No |  | 0 |  |  |

### Holiday

*child table (rows inside another record)* · 4 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Date | Date |  |  | **required** |  |
| Description | Rich text |  |  | **required** |  |
| Weekly Off | Yes/No |  | 0 |  |  |
| Is Half Day | Yes/No |  | 0 |  |  |
