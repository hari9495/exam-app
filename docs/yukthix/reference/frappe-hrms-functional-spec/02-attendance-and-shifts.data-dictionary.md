# 02 · Attendance, Shifts & Overtime — Data Dictionary

Companion to [02-attendance-and-shifts.md](02-attendance-and-shifts.md). Every data object and field in this module of the reference codebase, generated from its field definitions and written with **plain labels only** (no internal names, no help text) — clean-room.

**Columns:** *Type* — Text, Number, Amount, Date, Yes/No, Choice, Link → other record, Table of child rows… · *Flags* — required, read-only, editable after submit, unique, hidden, copied from linked record, ≥ 0 · *Conditions* — when the field is shown / required / read-only; `[Label]` refers to another field on the same record.

Use this as the **checklist of data** a YukthiX equivalent must be able to hold; field names, structure and storage in YukthiX are our own design.

---


### Attendance

*submittable (Draft → Submitted → Cancelled)* · 22 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Series | Choice | HR-ATT-.YYYY.- |  | **required** |  |
| Employee | Link → Employee |  |  | **required** |  |
| Employee Name | Text |  |  | read-only, copied from linked record |  |
| Working Hours | Number |  |  | read-only | shown when [Working Hours] is set |
| Status | Choice | Present / Absent / On Leave / Half Day / Work From Home | Present | **required** |  |
| Leave Type | Link → Leave Type |  |  |  | shown when [Status] is one of "On Leave", "Half Day"; required when [Status] is one of "On Leave", "Half Day" |
| Leave Application | Link → Leave Application |  |  | read-only |  |
| Attendance Date | Date |  |  | **required** |  |
| Company | Link → Company |  |  | **required**, read-only, copied from linked record |  |
| Department | Link → Department |  |  | read-only, copied from linked record |  |
| Shift | Link → Shift Type |  |  |  |  |
| Attendance Request | Link → Attendance Request |  |  | read-only |  |
| Amended From | Link → Attendance |  |  | read-only |  |
| Late Entry | Yes/No |  | 0 |  |  |
| Early Exit | Yes/No |  | 0 |  |  |
| In Time | Date & time |  |  | read-only | shown when [Shift] is set |
| Out Time | Date & time |  |  | read-only | shown when [Shift] is set |
| Status for Other Half | Choice | Present / Absent |  |  | shown when [Status]="Half Day" |
| modify_half_day_status | Yes/No |  | 0 | hidden |  |
| Overtime Type | Link → Overtime Type |  |  | read-only |  |
| Standard Working Hours | Number |  |  | read-only |  |
| Actual Overtime Duration | Number |  |  | read-only |  |

### Attendance Request

*submittable (Draft → Submitted → Cancelled)* · 13 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Employee | Link → Employee |  |  | **required** |  |
| Employee Name | Text |  |  | read-only, copied from linked record |  |
| Department | Link → Department |  |  | read-only, copied from linked record |  |
| Company | Link → Company |  |  | **required**, copied from linked record |  |
| From Date | Date |  |  | **required** |  |
| To Date | Date |  |  | **required** |  |
| Half Day | Yes/No |  | 0 |  |  |
| Half Day Date | Date |  |  |  | shown when [Half Day] is set; required when [Half Day] is set |
| Reason | Choice | Work From Home / On Duty |  | **required** |  |
| Explanation | Long text |  |  |  |  |
| Amended From | Link → Attendance Request |  |  | read-only |  |
| Shift | Link → Shift Type |  |  |  |  |
| Include Holidays | Yes/No |  | 0 |  |  |

### Employee Checkin

*master / regular record* · 17 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Employee | Link → Employee |  |  | **required** |  |
| Employee Name | Text |  |  | read-only, copied from linked record |  |
| Log Type | Choice | IN / OUT |  |  |  |
| Shift | Link → Shift Type |  |  | read-only |  |
| Time | Date & time |  | Now | **required** | read-only when [Attendance Marked] |
| Location / Device ID | Text |  |  |  |  |
| Skip Auto Attendance | Yes/No |  | 0 |  |  |
| Attendance Marked | Link → Attendance |  |  | read-only |  |
| Shift Start | Date & time |  |  | hidden |  |
| Shift End | Date & time |  |  | hidden |  |
| Shift Actual Start | Date & time |  |  | hidden |  |
| Shift Actual End | Date & time |  |  | hidden |  |
| Geolocation | Map location |  |  | read-only |  |
| Latitude | Number |  |  | read-only |  |
| Longitude | Number |  |  | read-only |  |
| Off-shift | Yes/No |  | 0 | read-only, hidden |  |
| Overtime Type | Link → Overtime Type |  |  | hidden |  |

### Shift Type

*master / regular record* · 22 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Start Time | Time |  |  | **required** |  |
| End Time | Time |  |  | **required** |  |
| Holiday List | Link → Holiday List |  |  |  |  |
| Determine Check-in and Check-out | Choice | Alternating entries as IN and OUT during the same shift / Strictly based on Log Type in Employee Checkin |  |  |  |
| Working Hours Calculation Based On | Choice | First Check-in and Last Check-out / Every Valid Check-in and Check-out |  |  |  |
| Working Hours Threshold for Half Day | Number |  |  | ≥ 0 |  |
| Working Hours Threshold for Absent | Number |  |  | ≥ 0 |  |
| Begin check-in before shift start time (in minutes) | Whole number |  | 60 | ≥ 0 |  |
| Late Entry Grace Period | Whole number |  |  | ≥ 0 | shown when [Enable Late Entry Marking] is set |
| Early Exit Grace Period | Whole number |  |  | ≥ 0 | shown when [Enable Early Exit Marking] is set |
| Allow check-out after shift end time (in minutes) | Whole number |  | 60 | ≥ 0 |  |
| Enable Auto Attendance | Yes/No |  | 0 |  |  |
| Process Attendance After | Date |  | Today |  | required when [Enable Auto Attendance] is set |
| Last Sync of Checkin | Date & time |  |  |  | read-only when [Automatically update Last Sync of Checkin] is set |
| Mark Auto Attendance on Holidays | Yes/No |  | 0 |  |  |
| Absent Buffer (Days) | Whole number |  | 1 | ≥ 0 |  |
| Enable Late Entry Marking | Yes/No |  | 0 |  |  |
| Enable Early Exit Marking | Yes/No |  | 0 |  |  |
| Roster Color | Choice | Blue / Cyan / Fuchsia / Green / Lime / Orange / Pink / Red / Violet / Yellow | Blue |  |  |
| Automatically update Last Sync of Checkin | Yes/No |  | 0 |  |  |
| Allow Overtime | Yes/No |  | 0 |  |  |
| Overtime Type | Link → Overtime Type |  |  |  | shown when [Allow Overtime] = 1; required when [Allow Overtime] = 1 |

### Shift Assignment

*submittable (Draft → Submitted → Cancelled)* · 13 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Employee | Link → Employee |  |  | **required** |  |
| Employee Name | Text |  |  | read-only, copied from linked record |  |
| Department | Link → Department |  |  | read-only, copied from linked record |  |
| Shift Type | Link → Shift Type |  |  | **required** |  |
| Company | Link → Company |  |  | **required**, copied from linked record |  |
| Shift Request | Link → Shift Request |  |  | read-only |  |
| Amended From | Link → Shift Assignment |  |  | read-only |  |
| Start Date | Date |  |  | **required** |  |
| End Date | Date |  |  | editable after submit |  |
| Status | Choice | Active / Inactive | Active | editable after submit |  |
| Shift Location | Link → Shift Location |  |  |  |  |
| Shift Schedule Assignment | Link → Shift Schedule Assignment |  |  | read-only |  |
| Overtime Type | Link → Overtime Type |  |  | copied from linked record |  |

### Shift Request

*submittable (Draft → Submitted → Cancelled)* · 10 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Shift Type | Link → Shift Type |  |  | **required** |  |
| Employee | Link → Employee |  |  | **required** |  |
| Employee Name | Text |  |  | read-only, copied from linked record |  |
| Department | Link → Department |  |  | read-only, copied from linked record |  |
| Company | Link → Company |  |  | **required** |  |
| From Date | Date |  |  | **required** |  |
| To Date | Date |  |  |  |  |
| Amended From | Link → Shift Request |  |  | read-only |  |
| Status | Choice | Draft / Approved / Rejected | Draft | **required** |  |
| Approver | Link → User |  |  | **required**, copied from linked record |  |

### Shift Location

*master / regular record* · 5 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Location Name | Text |  |  | **required**, unique |  |
| Checkin Radius | Whole number |  |  | ≥ 0 |  |
| Longitude | Number |  |  |  |  |
| Geolocation | Map location |  |  |  |  |
| Latitude | Number |  |  |  |  |

### Shift Schedule

*submittable (Draft → Submitted → Cancelled)* · 4 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Frequency | Choice | Every Week / Every 2 Weeks / Every 3 Weeks / Every 4 Weeks |  | **required** |  |
| Repeat On Days | Table of *Assignment Rule Day* |  |  | **required** |  |
| Shift Type | Link → Shift Type |  |  | **required** |  |
| Amended From | Link → Shift Schedule |  |  | read-only |  |

### Shift Schedule Assignment

*master / regular record* · 8 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Enabled | Yes/No |  | 1 |  |  |
| Create Shifts After | Date |  | Today |  | shown when [Enabled]; required when [Enabled] |
| Employee | Link → Employee |  |  | **required** |  |
| Employee Name | Text |  |  | read-only, copied from linked record |  |
| Company | Link → Company |  |  | **required**, read-only, copied from linked record |  |
| Shift Status | Choice | Active / Inactive | Active |  |  |
| Shift Schedule | Link → Shift Schedule |  |  | **required** |  |
| Shift Location | Link → Shift Location |  |  |  |  |

### Shift Assignment Tool

*single settings record* · 17 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Action | Choice | Assign Shift / Assign Shift Schedule / Process Shift Requests | Assign Shift | **required** |  |
| Company | Link → Company |  |  | **required** |  |
| Shift Type | Link → Shift Type |  |  |  | shown when [Action] = "Assign Shift"; required when [Action] = "Assign Shift" |
| Status | Choice | Active / Inactive | Active |  |  |
| Start Date | Date |  |  |  | required when [Action] = "Assign Shift" or [Action] = "Assign Shift Schedule" |
| End Date | Date |  |  |  |  |
| Branch | Link → Branch |  |  |  |  |
| Department | Link → Department |  |  |  |  |
| Designation | Link → Designation |  |  |  |  |
| Employment Type | Link → Employment Type |  |  |  |  |
| Shift Type | Link → Shift Type |  |  |  |  |
| Approver | Link → User |  |  |  |  |
| From Date | Date |  |  |  |  |
| To Date | Date |  |  |  |  |
| Employee Grade | Link → Employee Grade |  |  |  |  |
| Shift Location | Link → Shift Location |  |  |  |  |
| Shift Schedule | Link → Shift Schedule |  |  |  | shown when [Action] = "Assign Shift Schedule"; required when [Action] = "Assign Shift Schedule" |

### Employee Attendance Tool

*single settings record* · 13 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Date | Date |  | Today |  |  |
| Department | Link → Department |  |  |  |  |
| Branch | Link → Branch |  |  |  |  |
| Company | Link → Company |  |  |  |  |
| Status | Choice | Present / Absent / Half Day / Work From Home |  |  |  |
| Late Entry | Yes/No |  | 0 |  |  |
| Early Exit | Yes/No |  | 0 |  |  |
| Shift | Link → Shift Type |  |  |  | required when [Filter by Shift] is set |
| Employment Type | Link → Employment Type |  |  |  |  |
| Designation | Link → Designation |  |  |  |  |
| Employee Grade | Link → Employee Grade |  |  |  |  |
| Status for Other Half | Choice | Present / Absent |  |  |  |
| Filter by Shift | Yes/No |  | 0 |  |  |

### Overtime Type

*master / regular record* · 10 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Overtime Salary Component | Link → Salary Component |  |  | **required** |  |
| Applicable Salary Components | Multi-select of *Overtime Salary Component* |  |  |  | shown when [Overtime Amount Calculation] = "Salary Component Based"; required when [Overtime Amount Calculation] = "Salary Component Based" |
| Maximum Overtime Hours Allowed Per Day | Number |  |  | ≥ 0 |  |
| Standard Multiplier | Number |  |  | **required**, ≥ 0 |  |
| Apply for Weekend | Yes/No |  | 0 | **required** |  |
| Weekend Multiplier | Number |  |  | ≥ 0 | shown when [Apply for Weekend] = 1; required when [Apply for Weekend] = 1 |
| Apply for Public Holiday | Yes/No |  | 0 |  |  |
| Public Holiday Multiplier | Number |  |  | ≥ 0 | shown when [Apply for Public Holiday] = 1; required when [Apply for Public Holiday] = 1 |
| Hourly Rate | Amount |  |  | ≥ 0 | shown when [Overtime Amount Calculation] = "Fixed Hourly Rate"; required when [Overtime Amount Calculation] = "Fixed Hourly Rate" |
| Overtime Amount Calculation | Choice | Salary Component Based / Fixed Hourly Rate | Salary Component Based |  |  |

### Overtime Salary Component

*child table (rows inside another record)* · 1 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Salary Component | Link → Salary Component |  |  | **required** |  |

### Overtime Slip

*submittable (Draft → Submitted → Cancelled)* · 13 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Amended From | Link → Overtime Slip |  |  | read-only |  |
| Posting Date | Date |  | Today | **required** |  |
| Employee | Link → Employee |  |  | **required** |  |
| Employee Name | Text |  |  | copied from linked record |  |
| Department | Link → Department |  |  | copied from linked record |  |
| Company | Link → Company |  |  | **required**, copied from linked record |  |
| Overtime Details | Table of *Overtime Details* |  |  | **required** |  |
| Total Overtime Duration | Number |  |  | read-only |  |
| Salary Slip | Link → Salary Slip |  |  | read-only, editable after submit |  |
| Start Date | Date |  |  | **required** |  |
| End Date | Date |  |  | **required** |  |
| Payroll Entry | Link → Payroll Entry |  |  | read-only | shown when [Payroll Entry] is set |
| Submitted via Payroll Entry | Yes/No |  | 0 | hidden |  |

### Overtime Details

*child table (rows inside another record)* · 6 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Reference Document | Link → Attendance |  |  | read-only |  |
| Date | Date |  |  | **required** |  |
| Overtime Type | Link → Overtime Type |  |  | **required** |  |
| Overtime Duration | Number |  |  | **required**, ≥ 0 |  |
| Maximum Overtime Hours Allowed | Number |  |  | read-only, copied from linked record |  |
| Standard Working Hours | Number |  |  | **required**, ≥ 0 |  |
