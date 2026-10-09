# 01 · Leave Management — Data Dictionary

Companion to [01-leave-management.md](01-leave-management.md). Every data object and field in this module of the reference codebase, generated from its field definitions and written with **plain labels only** (no internal names, no help text) — clean-room.

**Columns:** *Type* — Text, Number, Amount, Date, Yes/No, Choice, Link → other record, Table of child rows… · *Flags* — required, read-only, editable after submit, unique, hidden, copied from linked record, ≥ 0 · *Conditions* — when the field is shown / required / read-only; `[Label]` refers to another field on the same record.

Use this as the **checklist of data** a YukthiX equivalent must be able to hold; field names, structure and storage in YukthiX are our own design.

---


### Leave Type

*master / regular record* · 23 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Leave Type Name | Text |  |  | **required**, unique |  |
| Maximum Leave Allocation Allowed per Leave Period | Number |  |  | ≥ 0 |  |
| Allow Leave Application After (Calendar Days) | Whole number |  |  | ≥ 0 |  |
| Maximum Consecutive Leaves Allowed | Whole number |  |  | ≥ 0 |  |
| Carry Forward | Yes/No |  | 0 |  |  |
| Is Leave Without Pay | Yes/No |  | 0 |  | shown when [Is Partially Paid Leave] = 0 |
| Leave for optional holiday | Yes/No |  | 0 |  |  |
| Allow Negative Balance | Yes/No |  | 0 |  |  |
| Include holidays within leaves as leaves | Yes/No |  | 0 |  |  |
| Is Compensatory | Yes/No |  | 0 |  |  |
| Expire Carry Forwarded Leaves (Days) | Whole number |  |  | ≥ 0 | shown when [Carry Forward] is set |
| Allow Encashment | Yes/No |  | 0 |  |  |
| Earning Component | Link → Salary Component |  |  |  | shown when [Allow Encashment] is set |
| Is Earned Leave | Yes/No |  | 0 |  |  |
| Earned Leave Frequency | Choice | Monthly / Quarterly / Half-Yearly / Yearly |  |  | shown when [Is Earned Leave] is set |
| Rounding | Choice | 0.25 / 0.5 / 1.0 |  |  | shown when [Is Earned Leave] is set |
| Maximum Carry Forwarded Leaves | Number |  |  | ≥ 0 | shown when [Carry Forward] is set |
| Is Partially Paid Leave | Yes/No |  | 0 |  | shown when [Is Leave Without Pay] = 0 |
| Fraction of Daily Salary per Leave | Number |  |  |  | shown when [Is Partially Paid Leave] = 1; required when [Is Partially Paid Leave] = 1 |
| Allow Over Allocation | Yes/No |  | 0 |  |  |
| Allocate on Day | Choice | First Day / Last Day / Date of Joining | Last Day |  | shown when [Is Earned Leave] |
| Maximum Encashable Leaves | Whole number |  |  | ≥ 0 | shown when [Allow Encashment] is set |
| Non-Encashable Leaves | Whole number |  |  | ≥ 0 | shown when [Allow Encashment] is set |

### Leave Period

*master / regular record* · 5 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| From Date | Date |  |  | **required** |  |
| To Date | Date |  |  | **required** |  |
| Is Active | Yes/No |  | 0 |  |  |
| Company | Link → Company |  |  | **required** |  |
| Holiday List for Optional Leave | Link → Holiday List |  |  |  |  |

### Leave Policy

*submittable (Draft → Submitted → Cancelled)* · 3 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Leave Policy Details | Table of *Leave Policy Detail* |  |  | **required** |  |
| Amended From | Link → Leave Policy |  |  | read-only |  |
| Leave Policy Name | Text |  |  | **required**, editable after submit |  |

### Leave Policy Detail

*child table (rows inside another record)* · 2 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Leave Type | Link → Leave Type |  |  | **required** |  |
| Annual Allocation | Number |  |  | **required**, ≥ 0 |  |

### Leave Policy Assignment

*submittable (Draft → Submitted → Cancelled)* · 11 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Employee | Link → Employee |  |  | **required** |  |
| Employee name | Text |  |  | read-only, copied from linked record |  |
| Leave Policy | Link → Leave Policy |  |  | **required** |  |
| Assignment based on | Choice | Leave Period / Joining Date |  |  |  |
| Leave Period | Link → Leave Period |  |  |  | shown when [Assignment based on] = "Leave Period"; required when [Assignment based on] = "Leave Period" |
| Effective From | Date |  |  | **required** | read-only when [Assignment based on] |
| Effective To | Date |  |  | **required** | read-only when [Assignment based on] = "Leave Period" |
| Company | Link → Company |  |  | read-only, copied from linked record |  |
| Amended From | Link → Leave Policy Assignment |  |  | read-only |  |
| Add unused leaves from previous allocations | Yes/No |  | 0 |  |  |
| Leaves Allocated | Yes/No |  | 0 | hidden |  |

### Leave Allocation

*submittable (Draft → Submitted → Cancelled)* · 22 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Series | Choice | HR-LAL-.YYYY.- |  | **required** |  |
| Employee | Link → Employee |  |  | **required** |  |
| Employee Name | Text |  |  | read-only, copied from linked record |  |
| Department | Link → Department |  |  | read-only, copied from linked record |  |
| Leave Type | Link → Leave Type |  |  | **required** |  |
| From Date | Date |  |  | **required** |  |
| To Date | Date |  |  | **required** |  |
| New Leaves Allocated | Number |  |  | editable after submit, ≥ 0 |  |
| Add unused leaves from previous allocations | Yes/No |  | 0 |  |  |
| Unused leaves | Number |  |  | read-only | shown when [Add unused leaves from previous allocations] is set |
| Total Leaves Allocated | Number |  |  | **required**, read-only, editable after submit |  |
| Total Leaves Encashed | Number |  |  | read-only | shown when [Total Leaves Encashed]>0 |
| Compensatory Leave Request | Link → Compensatory Leave Request |  |  | read-only |  |
| Leave Period | Link → Leave Period |  |  | read-only |  |
| Leave Policy | Link → Leave Policy |  |  | read-only, hidden, copied from linked record |  |
| Expired | Yes/No |  | 0 | read-only, hidden |  |
| Amended From | Link → Leave Allocation |  |  | read-only |  |
| Description | Long text |  |  |  |  |
| Carry Forwarded Leaves | Number |  |  | read-only | shown when [Carry Forwarded Leaves] is set |
| Leave Policy Assignment | Link → Leave Policy Assignment |  |  | read-only |  |
| Company | Link → Company |  |  | **required**, read-only, copied from linked record |  |
| Earned leave schedule | Table of *Earned Leave Schedule* |  |  | read-only |  |

### Earned Leave Schedule

*child table (rows inside another record)* · 7 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Allocation Date | Date |  |  | read-only |  |
| Number of Leaves | Number |  |  | read-only |  |
| Is Allocated | Yes/No |  | 0 | read-only |  |
| Failure Reason | Long text |  |  | read-only |  |
| Allocated Via | Choice | Scheduler / Leave Policy Assignment / Manually |  | read-only |  |
| Attempted | Yes/No |  | 0 | read-only, hidden |  |
| Failed | Yes/No |  | 0 | read-only, hidden |  |

### Leave Application

*submittable (Draft → Submitted → Cancelled)* · 22 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Series | Choice | HR-LAP-.YYYY.- |  | **required** |  |
| Employee | Link → Employee |  |  | **required** |  |
| Employee Name | Text |  |  | read-only, copied from linked record |  |
| Leave Type | Link → Leave Type |  |  | **required** |  |
| Department | Link → Department |  |  | read-only, copied from linked record |  |
| Leave Balance Before Application | Number |  |  | read-only |  |
| From Date | Date |  |  | **required** |  |
| To Date | Date |  |  | **required** |  |
| Half Day | Yes/No |  | 0 |  |  |
| Half Day Date | Date |  |  |  | shown when [Half Day] and [From Date] and [To Date] and ([From Date] ≠ [To Date]) |
| Total Leave Days | Number |  |  | read-only |  |
| Reason | Long text |  |  |  |  |
| Leave Approver | Link → User |  |  |  |  |
| Leave Approver Name | Text |  |  | read-only |  |
| Status | Choice | Open / Approved / Rejected / Cancelled | Open | **required** |  |
| Posting Date | Date |  | Today | **required** |  |
| Company | Link → Company |  |  | **required**, read-only, copied from linked record |  |
| Follow via Email | Yes/No |  | 1 | editable after submit |  |
| Salary Slip | Link → Salary Slip |  |  |  |  |
| Letter Head | Link → Letter Head |  |  | editable after submit |  |
| Color | Colour |  |  | editable after submit |  |
| Amended From | Link → Leave Application |  |  | read-only |  |

### Leave Ledger Entry

*submittable (Draft → Submitted → Cancelled)* · 14 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Employee | Link → Employee |  |  |  |  |
| Employee Name | Text |  |  | copied from linked record |  |
| Leave Type | Link → Leave Type |  |  |  |  |
| Amended From | Link → Leave Ledger Entry |  |  | read-only |  |
| Transaction Type | Link → DocType |  |  |  |  |
| Transaction Name | Link (record type chosen in another field) |  |  |  |  |
| Leaves | Number |  |  |  |  |
| From Date | Date |  |  |  |  |
| To Date | Date |  |  |  |  |
| Is Carry Forward | Yes/No |  | 0 |  |  |
| Is Expired | Yes/No |  | 0 |  |  |
| Is Leave Without Pay | Yes/No |  | 0 |  |  |
| Holiday List | Link → Holiday List |  |  |  |  |
| Company | Link → Company |  |  | **required**, read-only, copied from linked record |  |

### Leave Encashment

*submittable (Draft → Submitted → Cancelled)* · 22 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Leave Period | Link → Leave Period |  |  | **required** |  |
| Employee | Link → Employee |  |  | **required** |  |
| Employee Name | Text |  |  | read-only, copied from linked record |  |
| Department | Link → Department |  |  | read-only, copied from linked record |  |
| Leave Type | Link → Leave Type |  |  | **required** |  |
| Leave Allocation | Link → Leave Allocation |  |  | read-only |  |
| Leave Balance | Number |  |  | read-only |  |
| Amended From | Link → Leave Encashment |  |  | read-only |  |
| Encashment Amount | Amount |  |  | read-only |  |
| Encashment Date | Date |  | Today |  |  |
| Additional Salary | Link → Additional Salary |  |  | read-only |  |
| Currency | Link → Currency |  |  | **required**, read-only | shown when ([Docstatus]=1 or [Employee]) |
| Company | Link → Company |  |  | **required**, copied from linked record |  |
| Encashment Days | Number |  |  | ≥ 0 |  |
| Actual Encashable Days | Number |  |  | read-only |  |
| Payable Account | Link → Account |  |  |  | shown when [Pay via Payment Entry] is set; required when [Pay via Payment Entry] is set |
| Pay via Payment Entry | Yes/No |  | 0 |  |  |
| Paid Amount | Amount |  | 0.0 | read-only | shown when [Pay via Payment Entry] is set |
| Status | Choice | Draft / Unpaid / Paid / Submitted / Cancelled |  | read-only |  |
| Posting Date | Date |  | Today |  | shown when [Pay via Payment Entry] is set |
| Expense Account | Link → Account |  |  |  | shown when [Pay via Payment Entry] is set; required when [Pay via Payment Entry] is set |
| Cost Center | Link → Cost Center |  |  |  | required when [Pay via Payment Entry] is set |

### Compensatory Leave Request

*submittable (Draft → Submitted → Cancelled)* · 11 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Employee | Link → Employee |  |  | **required** |  |
| Employee Name | Text |  |  | read-only, copied from linked record |  |
| Department | Link → Department |  |  | read-only, copied from linked record |  |
| Leave Type | Link → Leave Type |  |  |  |  |
| Leave Allocation | Link → Leave Allocation |  |  | read-only |  |
| Work From Date | Date |  |  | **required** |  |
| Work End Date | Date |  |  | **required** |  |
| Half Day | Yes/No |  | 0 |  |  |
| Half Day Date | Date |  |  |  | shown when [Half Day] is set |
| Reason | Long text |  |  | **required** |  |
| Amended From | Link → Compensatory Leave Request |  |  | read-only |  |

### Leave Adjustment

*submittable (Draft → Submitted → Cancelled)* · 15 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Amended From | Link → Leave Adjustment |  |  | read-only |  |
| Employee | Link → Employee |  |  | **required** |  |
| Employee Name | Text |  |  | read-only, copied from linked record |  |
| Leave Type | Link → Leave Type |  |  | **required** |  |
| Allocation to Adjust | Link → Leave Allocation |  |  | **required**, read-only |  |
| From Date | Date |  |  | read-only, copied from linked record |  |
| Series | Choice | HR-LAD-.YYYY.- |  | **required** |  |
| To Date | Date |  |  | read-only, copied from linked record |  |
| Allocated Leaves | Number |  |  | read-only, copied from linked record |  |
| Posting Date | Date |  | Today | **required** |  |
| Leaves to Adjust | Number |  |  | **required**, ≥ 0 |  |
| Adjustment Type | Choice | Allocate / Reduce |  | **required** |  |
| Leaves After Adjustment | Number |  |  | read-only |  |
| Reason for Adjustment | Long text |  |  |  | shown when [Allocation to Adjust] |
| Company | Link → Company |  |  | read-only, copied from linked record |  |

### Leave Block List

*master / regular record* · 6 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Leave Block List Name | Text |  |  | **required**, unique |  |
| Company | Link → Company |  |  | **required** |  |
| Applies to Company | Yes/No |  | 0 |  |  |
| Leave Block List Dates | Table of *Leave Block List Date* |  |  | **required** |  |
| Leave Block List Allowed | Table of *Leave Block List Allow* |  |  |  |  |
| Leave Type | Link → Leave Type |  |  |  |  |

### Leave Block List Date

*child table (rows inside another record)* · 2 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Block Date | Date |  |  | **required** |  |
| Reason | Long text |  |  | **required** |  |

### Leave Block List Allow

*child table (rows inside another record)* · 1 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Allow User | Link → User |  |  | **required** |  |

### Leave Control Panel

*single settings record* · 15 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Company | Link → Company |  |  |  | required when [Dates Based On] = 'Leave Period' |
| Employment Type | Link → Employment Type |  |  |  |  |
| Branch | Link → Branch |  |  |  |  |
| Department | Link → Department |  |  |  |  |
| Designation | Link → Designation |  |  |  |  |
| Employee Grade | Link → Employee Grade |  |  |  |  |
| From Date | Date |  | Today |  | shown when [Dates Based On] ≠ 'Joining Date'; required when [Dates Based On] = 'Custom Range'; read-only when [Dates Based On] = 'Leave Period' |
| To Date | Date |  |  |  | required when [Dates Based On] ≠ 'Leave Period'; read-only when [Dates Based On] = 'Leave Period' |
| Leave Policy | Link → Leave Policy |  |  |  | shown when [Allocate Based On Leave Policy]; required when [Allocate Based On Leave Policy] |
| Leave Type | Link → Leave Type |  |  |  | shown when not [Allocate Based On Leave Policy]; required when not [Allocate Based On Leave Policy] |
| Carry Forward | Yes/No |  | 1 |  |  |
| New Leaves Allocated (In Days) | Number |  |  | ≥ 0 | shown when not [Allocate Based On Leave Policy]; required when not [Allocate Based On Leave Policy] |
| Dates Based On | Choice | Leave Period / Joining Date / Custom Range | Leave Period |  |  |
| Leave Period | Link → Leave Period |  |  |  | shown when [Dates Based On] = 'Leave Period'; required when [Dates Based On] = 'Leave Period' |
| Allocate Based On Leave Policy | Yes/No |  | 1 |  |  |

### Holiday List Assignment

*submittable (Draft → Submitted → Cancelled)* · 10 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Amended From | Link → Holiday List Assignment |  |  | read-only |  |
| Holiday List | Link → Holiday List |  |  | **required** |  |
| Naming Series | Choice | HR-HLA-.YYYY.- |  | **required** |  |
| Employee Name | Text |  |  | read-only, hidden, copied from linked record |  |
| Assigned To | Link (record type chosen in another field) |  |  | **required** |  |
| Employee Company | Link → Company |  |  | read-only, hidden |  |
| Applicable For | Choice | Employee / Company |  | **required** |  |
| Holiday List Start | Date |  |  |  |  |
| Holiday List End | Date |  |  |  |  |
| Assignment Starts From | Date |  |  | **required** |  |

### Salary Slip Leave

*child table (rows inside another record)* · 6 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Leave Type | Link → Leave Type |  |  | read-only |  |
| Total Allocated Leave(s) | Number |  |  | read-only |  |
| Expired Leave(s) | Number |  |  | read-only |  |
| Used Leave(s) | Number |  |  | read-only |  |
| Leave(s) Pending Approval | Number |  |  | read-only |  |
| Available Leave(s) | Number |  |  | read-only |  |
