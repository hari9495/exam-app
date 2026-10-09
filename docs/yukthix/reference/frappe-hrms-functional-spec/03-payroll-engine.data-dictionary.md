# 03 · Payroll Engine — Data Dictionary

Companion to [03-payroll-engine.md](03-payroll-engine.md). Every data object and field in this module of the reference codebase, generated from its field definitions and written with **plain labels only** (no internal names, no help text) — clean-room.

**Columns:** *Type* — Text, Number, Amount, Date, Yes/No, Choice, Link → other record, Table of child rows… · *Flags* — required, read-only, editable after submit, unique, hidden, copied from linked record, ≥ 0 · *Conditions* — when the field is shown / required / read-only; `[Label]` refers to another field on the same record.

Use this as the **checklist of data** a YukthiX equivalent must be able to hold; field names, structure and storage in YukthiX are our own design.

---


### Additional Salary

*submittable (Draft → Submitted → Cancelled)* · 19 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Series | Choice | HR-ADS-.YY.-.MM.- |  | **required** |  |
| Employee | Link → Employee |  |  | **required** |  |
| Salary Component | Link → Salary Component |  |  | **required** |  |
| Amount | Amount |  |  | **required** |  |
| Overwrite Salary Structure Amount | Yes/No |  | 1 |  |  |
| Deduct Full Tax on Selected Payroll Date | Yes/No |  | 0 |  |  |
| Payroll Date | Date |  |  |  | shown when ([Is Recurring]=0); required when ([Is Recurring]=0) |
| Employee Name | Text |  |  | read-only, copied from linked record |  |
| Department | Link → Department |  |  | read-only, copied from linked record |  |
| Company | Link → Company |  |  | **required** |  |
| Salary Component Type | Text |  |  | read-only, copied from linked record |  |
| Amended From | Link → Additional Salary |  |  | read-only |  |
| Is Recurring | Yes/No |  | 0 |  |  |
| From Date | Date |  |  |  | shown when ([Is Recurring]=1); required when ([Is Recurring]=1) |
| To Date | Date |  |  |  | shown when ([Is Recurring]=1); required when ([Is Recurring]=1) |
| Reference Document Type | Link → DocType |  |  | read-only |  |
| Reference Document | Link (record type chosen in another field) |  |  | read-only |  |
| Currency | Link → Currency |  |  | **required**, read-only | shown when ([Docstatus]=1 or [Employee]) |
| Disabled | Yes/No |  | 0 | editable after submit | shown when [Is Recurring] |

### Arrear

*submittable (Draft → Submitted → Cancelled)* · 12 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Amended From | Link → Arrear |  |  | read-only |  |
| Employee | Link → Employee |  |  | **required** |  |
| Employee Name | Text |  |  | read-only, copied from linked record |  |
| Company | Link → Company |  |  | **required**, copied from linked record |  |
| Payroll Period | Link → Payroll Period |  |  | **required** | shown when [Employee] |
| Payroll Date | Date |  |  | **required** | shown when [Salary Structure] |
| Arrear Start Date | Date |  |  | **required** | shown when [Salary Structure] |
| Salary Structure | Link → Salary Structure |  |  | **required** | shown when [Payroll Period] |
| Currency | Link → Currency |  |  | **required**, read-only | shown when [Employee] |
| Earning Arrears | Table of *Payroll Correction Child* |  |  |  | shown when [Earning Arrears] is set |
| Deduction Arrears | Table of *Payroll Correction Child* |  |  |  | shown when [Deduction Arrears] is set |
| Accrual Arrears | Table of *Payroll Correction Child* |  |  |  | shown when [Accrual Arrears] is set |

### Bulk Salary Structure Assignment

*single settings record* · 11 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Salary Structure | Link → Salary Structure |  |  | **required** |  |
| From Date | Date |  |  | **required** |  |
| Income Tax Slab | Link → Income Tax Slab |  |  |  | shown when [Salary Structure] is set |
| Payroll Payable Account | Link → Account |  |  | copied from linked record |  |
| Branch | Link → Branch |  |  |  |  |
| Department | Link → Department |  |  |  |  |
| Designation | Link → Designation |  |  |  |  |
| Company | Link → Company |  |  | **required**, read-only, copied from linked record |  |
| Employment Type | Link → Employment Type |  |  |  |  |
| Employee Grade | Link → Employee Grade |  |  |  |  |
| Currency | Link → Currency |  |  | read-only, copied from linked record | shown when [Salary Structure] is set |

### Employee Benefit Application

*submittable (Draft → Submitted → Cancelled)* · 12 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Employee | Link → Employee |  |  | **required** |  |
| Employee Name | Text |  |  | read-only, copied from linked record |  |
| Max Benefits (Yearly) | Amount |  |  | read-only |  |
| Remaining Benefits (Yearly) | Amount |  |  | read-only |  |
| Date | Date |  | Today | **required** |  |
| Payroll Period | Link → Payroll Period |  |  | **required** |  |
| Department | Link → Department |  |  | read-only, copied from linked record |  |
| Amended From | Link → Employee Benefit Application |  |  | read-only |  |
| Flexible Benefits | Table of *Employee Benefit Application Detail* |  |  | **required** |  |
| Total Amount | Amount |  |  | read-only |  |
| Currency | Link → Currency |  |  | **required**, read-only | shown when ([Docstatus]=1 or [Employee]) |
| Company | Link → Company |  |  | **required**, copied from linked record |  |

### Employee Benefit Application Detail

*child table (rows inside another record)* · 3 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Max Benefit Amount | Amount |  |  | **required**, read-only |  |
| Amount | Amount |  |  | **required**, ≥ 0 |  |
| Earning Component | Link → Salary Component |  |  | **required**, read-only |  |

### Employee Benefit Claim

*submittable (Draft → Submitted → Cancelled)* · 12 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Employee | Link → Employee |  |  | **required** |  |
| Employee Name | Text |  |  | read-only, copied from linked record |  |
| Department | Link → Department |  |  | read-only, copied from linked record |  |
| Claim Benefit For | Link → Salary Component |  |  | **required** |  |
| Max Amount Eligible For Claim | Amount |  |  | read-only |  |
| Claimed Amount | Amount |  |  | **required**, ≥ 0 |  |
| Amended From | Link → Employee Benefit Claim |  |  | read-only |  |
| Attachments | File |  |  |  |  |
| Currency | Link → Currency |  |  | **required**, read-only | shown when [Employee] |
| Company | Link → Company |  |  | **required**, copied from linked record |  |
| Payroll Date | Date |  | Today | **required** |  |
| Yearly Amount | Amount |  |  | read-only |  |

### Employee Benefit Detail

*child table (rows inside another record)* · 2 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Earning Component | Link → Salary Component |  |  | **required** |  |
| Benefit Amount | Amount |  |  | **required**, ≥ 0 |  |

### Employee Benefit Ledger

*master / regular record* · 14 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Employee | Link → Employee |  |  |  |  |
| Employee Name | Text |  |  | copied from linked record |  |
| Company | Text |  |  | copied from linked record |  |
| Transaction Type | Choice | Accrual / Payout |  |  |  |
| Posting Date | Date |  | Today |  |  |
| Yearly Benefit | Amount |  |  | ≥ 0 |  |
| Payroll Period | Link → Payroll Period |  |  |  |  |
| Remarks | Text |  |  |  |  |
| Amount | Amount |  |  | ≥ 0 |  |
| Salary Component | Link → Salary Component |  |  |  |  |
| Salary Slip | Link → Salary Slip |  |  |  |  |
| Flexible Benefit | Yes/No |  | 0 |  |  |
| Reference Doctype | Link → DocType |  |  |  | shown when [Flexible Benefit] |
| Reference Document | Link (record type chosen in another field) |  |  |  | shown when [Flexible Benefit] |

### Employee Cost Center

*child table (rows inside another record)* · 2 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Cost Center | Link → Cost Center |  |  | **required**, editable after submit |  |
| Percentage (%) | Whole number |  |  | **required**, editable after submit, ≥ 0 |  |

### Employee Incentive

*submittable (Draft → Submitted → Cancelled)* · 9 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Employee | Link → Employee |  |  | **required** |  |
| Incentive Amount | Amount |  |  | **required**, ≥ 0 |  |
| Payroll Date | Date |  |  | **required** |  |
| Amended From | Link → Employee Incentive |  |  | read-only |  |
| Employee Name | Text |  |  | read-only, copied from linked record |  |
| Department | Link → Department |  |  | read-only, copied from linked record |  |
| Salary Component | Link → Salary Component |  |  | **required** |  |
| Currency | Link → Currency |  |  | **required**, read-only | shown when ([Docstatus]=1 or [Employee]) |
| Company | Link → Company |  |  | **required** |  |

### Employee Other Income

*submittable (Draft → Submitted → Cancelled)* · 7 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Employee | Link → Employee |  |  | **required** |  |
| Payroll Period | Link → Payroll Period |  |  | **required** |  |
| Company | Link → Company |  |  | **required** |  |
| Source | Text |  |  |  |  |
| Amount | Amount |  |  | **required**, ≥ 0 |  |
| Employee Name | Text |  |  | read-only, copied from linked record |  |
| Amended From | Link → Employee Other Income |  |  | read-only |  |

### Employee Tax Exemption Category

*master / regular record* · 3 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Max Exemption Amount | Amount |  |  | ≥ 0 |  |
| Is Active | Yes/No |  | 1 |  |  |
| Description | Long text |  |  |  |  |

### Employee Tax Exemption Declaration

*submittable (Draft → Submitted → Cancelled)* · 10 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Employee | Link → Employee |  |  | **required** |  |
| Employee Name | Text |  |  | read-only, copied from linked record |  |
| Department | Link → Department |  |  | read-only, copied from linked record |  |
| Payroll Period | Link → Payroll Period |  |  | **required** |  |
| Company | Link → Company |  |  | copied from linked record |  |
| Amended From | Link → Employee Tax Exemption Declaration |  |  | read-only |  |
| Declarations | Table of *Employee Tax Exemption Declaration Category* |  |  |  |  |
| Total Declared Amount | Amount |  |  | read-only |  |
| Total Exemption Amount | Amount |  |  | read-only |  |
| Currency | Link → Currency |  |  | **required** | shown when [Employee] |

### Employee Tax Exemption Declaration Category

*child table (rows inside another record)* · 4 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Exemption Sub Category | Link → Employee Tax Exemption Sub Category |  |  | **required** |  |
| Exemption Category | Link → Employee Tax Exemption Category |  |  | **required**, read-only, copied from linked record |  |
| Maximum Exempted Amount | Amount |  |  | **required**, read-only, copied from linked record |  |
| Declared Amount | Amount |  |  | **required**, ≥ 0 |  |

### Employee Tax Exemption Proof Submission

*submittable (Draft → Submitted → Cancelled)* · 12 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Employee | Link → Employee |  |  | **required** |  |
| Employee Name | Text |  |  | read-only, copied from linked record |  |
| Department | Link → Department |  |  | read-only, copied from linked record |  |
| Submission Date | Date |  | Today | **required** |  |
| Payroll Period | Link → Payroll Period |  |  | **required** |  |
| Company | Link → Company |  |  | **required**, read-only, copied from linked record |  |
| Tax Exemption Proofs | Table of *Employee Tax Exemption Proof Submission Detail* |  |  |  |  |
| Total Actual Amount | Amount |  |  | read-only |  |
| Total Exemption Amount | Amount |  |  | read-only |  |
| Attachments | File |  |  |  |  |
| Amended From | Link → Employee Tax Exemption Proof Submission |  |  | read-only |  |
| Currency | Link → Currency |  |  | **required** | shown when [Employee] |

### Employee Tax Exemption Proof Submission Detail

*child table (rows inside another record)* · 6 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Exemption Sub Category | Link → Employee Tax Exemption Sub Category |  |  | **required** |  |
| Exemption Category | Display only |  |  | **required**, copied from linked record |  |
| Maximum Exemption Amount | Amount |  |  | **required**, read-only, copied from linked record |  |
| Type of Proof | Text |  |  | **required** |  |
| Actual Amount | Amount |  |  | ≥ 0 |  |
| Attach Proof | File |  |  |  |  |

### Employee Tax Exemption Sub Category

*master / regular record* · 4 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Tax Exemption Category | Link → Employee Tax Exemption Category |  |  | **required** |  |
| Max Exemption Amount | Amount |  |  | copied from linked record, ≥ 0 |  |
| Is Active | Yes/No |  | 1 |  |  |
| Description | Long text |  |  |  |  |

### Gratuity

*submittable (Draft → Submitted → Cancelled)* · 19 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Employee | Link → Employee |  |  | **required** |  |
| Company | Link → Company |  |  | **required**, read-only, copied from linked record |  |
| Posting date | Date |  |  | **required** |  |
| Current Work Experience | Number |  | 0 | ≥ 0 |  |
| Total Amount | Amount |  | 0 | **required**, read-only |  |
| Status | Choice | Draft / Unpaid / Paid / Submitted / Cancelled | Draft | read-only |  |
| Expense Account | Link → Account |  |  |  | shown when not [Pay via Salary Slip]; required when not [Pay via Salary Slip] |
| Mode of Payment | Link → Mode of Payment |  |  |  | shown when not [Pay via Salary Slip]; required when not [Pay via Salary Slip] |
| Gratuity Rule | Link → Gratuity Rule |  |  | **required** |  |
| Employee Name | Text |  |  | read-only, copied from linked record |  |
| Department | Link → Department |  |  | read-only, copied from linked record |  |
| Designation | Text |  |  | read-only, copied from linked record |  |
| Amended From | Link → Gratuity |  |  | read-only |  |
| Paid Amount | Amount |  | 0 | read-only | shown when [Pay via Salary Slip] = 0 |
| Payable Account | Link → Account |  |  |  | shown when not [Pay via Salary Slip]; required when not [Pay via Salary Slip] |
| Cost Center | Link → Cost Center |  |  |  |  |
| Pay via Salary Slip | Yes/No |  | 1 |  |  |
| Payroll Date | Date |  |  |  | shown when [Pay via Salary Slip] is set; required when [Pay via Salary Slip] is set |
| Salary Component | Link → Salary Component |  |  |  | shown when [Pay via Salary Slip] is set; required when [Pay via Salary Slip] is set |

### Gratuity Applicable Component

*child table (rows inside another record)* · 1 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Salary Component  | Link → Salary Component |  |  | **required** |  |

### Gratuity Rule

*master / regular record* · 7 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Disable | Yes/No |  | 0 |  |  |
| Calculate Gratuity Amount Based On | Choice | Current Slab / Sum of all previous slabs |  | **required** |  |
| Applicable Earnings Component | Multi-select of *Gratuity Applicable Component* |  |  | **required** |  |
| Current Work Experience | Table of *Gratuity Rule Slab* |  |  | **required** |  |
| Work Experience Calculation Method | Choice | Round off Work Experience / Take Exact Completed Years / Manual | Round off Work Experience |  |  |
| Total working Days Per Year | Number |  | 365 | ≥ 0 |  |
| Minimum Year for Gratuity | Whole number |  |  | ≥ 0 |  |

### Gratuity Rule Slab

*child table (rows inside another record)* · 3 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Fraction of Applicable Earnings  | Number |  |  | **required**, ≥ 0 |  |
| From(Year) | Whole number |  | 0 | **required**, read-only |  |
| To(Year) | Whole number |  | 0 | **required**, ≥ 0 |  |

### Income Tax Slab

*submittable (Draft → Submitted → Cancelled)* · 10 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Effective from | Date |  |  | **required** |  |
| Allow Tax Exemption | Yes/No |  | 0 |  |  |
| Amended From | Link → Income Tax Slab |  |  | read-only |  |
| Taxable Salary Slabs | Table of *Taxable Salary Slab* |  |  | **required** |  |
| Disabled | Yes/No |  | 0 | editable after submit |  |
| Standard Tax Exemption Amount | Amount |  |  | ≥ 0 |  |
| Company | Link → Company |  |  |  |  |
| Other Taxes and Charges | Table of *Income Tax Slab Other Charges* |  |  |  |  |
| Currency | Link → Currency |  |  | **required**, copied from linked record |  |
| Taxable Income Relief Threshold Limit | Amount |  |  | ≥ 0 |  |

### Income Tax Slab Other Charges

*child table (rows inside another record)* · 4 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Description | Text |  |  | **required** |  |
| Percent | Percent |  |  | **required**, ≥ 0 |  |
| Min Taxable Income | Amount |  |  | ≥ 0 |  |
| Max Taxable Income | Amount |  |  | ≥ 0 |  |

### Payroll Correction

*submittable (Draft → Submitted → Cancelled)* · 16 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Amended From | Link → Payroll Correction |  |  | read-only |  |
| Employee | Link → Employee |  |  | **required** |  |
| Employee Name | Text |  |  | read-only, copied from linked record |  |
| Company | Link → Company |  |  | **required** |  |
| Currency | Link → Currency |  |  | copied from linked record | shown when [Company] and [Employee] |
| Payroll Period | Link → Payroll Period |  |  | **required** |  |
| Select Month for LWP Reversal | Choice |  |  | **required** | shown when [Payroll Period] is set |
| Salary Slip Reference | Link → Salary Slip |  |  | **required**, read-only | shown when [Select Month for LWP Reversal] is set |
| Working Days | Number |  |  | read-only | shown when [Salary Slip Reference] is set |
| Total Days Without Pay | Number |  |  | read-only | shown when [Salary Slip Reference] is set |
| Days to Reverse | Number |  |  | **required** | shown when [Salary Slip Reference] is set |
| Earning Arrears | Table of *Payroll Correction Child* |  |  | read-only | shown when [Earning Arrears] is set |
| Deduction Arrears | Table of *Payroll Correction Child* |  |  | read-only | shown when [Deduction Arrears] is set |
| Payroll Date | Date |  |  | **required** |  |
| Accrual Arrears | Table of *Payroll Correction Child* |  |  | read-only | shown when [Accrual Arrears] is set |
| Payment Days | Number |  |  | read-only | shown when [Salary Slip Reference] is set |

### Payroll Correction Child

*child table (rows inside another record)* · 2 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Salary Component | Link → Salary Component |  |  | **required** |  |
| Amount | Number |  |  | **required**, ≥ 0 |  |

### Payroll Employee Detail

*child table (rows inside another record)* · 5 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Employee | Link → Employee |  |  |  |  |
| Employee Name | Text |  |  | read-only, copied from linked record |  |
| Department | Link → Department |  |  | read-only, copied from linked record |  |
| Designation | Text |  |  | read-only, copied from linked record |  |
| Is Salary Withheld | Yes/No |  | 0 |  |  |

### Payroll Entry

*submittable (Draft → Submitted → Cancelled)* · 27 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Posting Date | Date |  | Today | **required** |  |
| Payroll Frequency | Choice | Monthly / Fortnightly / Bimonthly / Weekly / Daily |  |  | required when [Salary Slip Based on Timesheet] = 0 |
| Company | Link → Company |  |  | **required** |  |
| Branch | Link → Branch |  |  |  |  |
| Department | Link → Department |  |  |  |  |
| Designation | Link → Designation |  |  |  |  |
| Number Of Employees | Whole number |  |  | read-only |  |
| Employees | Table of *Payroll Employee Detail* |  |  |  |  |
| Validate Attendance | Yes/No |  | 0 |  |  |
| Salary Slip Based on Timesheet | Yes/No |  | 0 |  |  |
| Start Date | Date |  |  | **required** |  |
| End Date | Date |  |  | **required** |  |
| Deduct Tax For Unsubmitted Tax Exemption Proof | Yes/No |  | 0 |  |  |
| Cost Center | Link → Cost Center |  | :Company | **required** |  |
| Project | Link → Project |  |  |  |  |
| Payment Account | Link → Account |  |  | editable after submit, copied from linked record |  |
| Amended From | Link → Payroll Entry |  |  | read-only |  |
| Salary Slips Created | Yes/No |  | 0 | read-only, hidden |  |
| Salary Slips Submitted | Yes/No |  | 0 | read-only, hidden |  |
| Bank Account | Link → Bank Account |  |  |  |  |
| Currency | Link → Currency |  |  | **required** | shown when [Company] is set |
| Exchange Rate | Number |  |  | **required** | shown when [Company] is set |
| Payroll Payable Account | Link → Account |  |  | **required** | shown when [Company] is set |
| Error Message | Rich text |  |  | read-only | shown when [Status]='Failed' |
| Status | Choice | Draft / Submitted / Cancelled / Queued / Failed |  | read-only |  |
| Grade | Link → Employee Grade |  |  |  |  |
| Overtime Slip Step | Choice | Create / Submit |  |  |  |

### Payroll Period

*master / regular record* · 4 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Company | Link → Company |  |  | **required** |  |
| Start Date | Date |  |  | **required** |  |
| End Date | Date |  |  | **required** |  |
| Payroll Periods | Table of *Payroll Period Date* |  |  |  |  |

### Payroll Period Date

*child table (rows inside another record)* · 2 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Start Date | Date |  |  | **required** |  |
| End Date | Date |  |  | **required** |  |

### Payroll Settings

*single settings record* · 18 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Calculate Payroll Working Days Based On | Choice | Leave / Attendance | Leave |  |  |
| Max working hours against Timesheet | Number |  |  | ≥ 0 |  |
| Include holidays in Total no. of Working Days | Yes/No |  | 0 |  |  |
| Disable Rounded Total | Yes/No |  | 0 |  |  |
| Fraction of Daily Salary for Half Day | Number |  | 0.5 | ≥ 0 |  |
| Email Salary Slip to Employee | Yes/No |  | 1 |  |  |
| Encrypt Salary Slips in Emails | Yes/No |  | 0 |  | shown when [Email Salary Slip to Employee] = 1 |
| Password Policy | Text |  |  |  | shown when [Encrypt Salary Slips in Emails] = 1 |
| Consider Unmarked Attendance As | Choice | Present / Absent |  |  | shown when [Calculate Payroll Working Days Based On] = 'Attendance' |
| Show Leave Balances in Salary Slip | Yes/No |  | 0 |  |  |
| Process Payroll Accounting Entry based on Employee | Yes/No |  | 0 |  |  |
| Consider Marked Attendance on Holidays | Yes/No |  | 0 |  | shown when [Include holidays in Total no. of Working Days] is set |
| Sender | Link → Email Account |  |  |  | shown when [Email Salary Slip to Employee] |
| Sender Email | Text |  |  | read-only, copied from linked record | shown when [Sender] |
| Email Template | Link → Email Template |  |  |  | shown when [Email Salary Slip to Employee] |
| Create Overtime Slip For Eligible Employee(s) | Yes/No |  | 0 |  |  |
| Sender Copy | Link → Email Account |  |  |  | shown when [Email Salary Slip to Employee] |
| Mandatory Benefit Application | Yes/No |  | 0 |  |  |

### Retention Bonus

*submittable (Draft → Submitted → Cancelled)* · 10 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Company | Link → Company |  |  | **required** |  |
| Employee | Link → Employee |  |  | **required** |  |
| Bonus Payment Date | Date |  |  | **required** |  |
| Bonus Amount | Amount |  |  | **required**, ≥ 0 |  |
| Amended From | Link → Retention Bonus |  |  | read-only |  |
| Employee Name | Text |  |  | read-only, copied from linked record |  |
| Department | Link → Department |  |  | read-only, copied from linked record |  |
| Date of Joining | Text |  |  | read-only, copied from linked record |  |
| Salary Component | Link → Salary Component |  |  | **required** |  |
| Currency | Link → Currency |  |  | **required**, read-only | shown when ([Docstatus]=1 or [Employee]) |

### Salary Component

*master / regular record* · 27 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Name | Text |  |  | **required**, unique |  |
| Abbr | Text |  |  | **required** |  |
| Type | Choice | Earning / Deduction / Employer Contribution |  | **required** |  |
| Is Tax Applicable | Yes/No |  | 1 |  | shown when [Type] = "Earning" |
| Depends on Payment Days | Yes/No |  | 1 |  | read-only when [Arrear Component] and not [Amount based on formula] |
| Do Not Include in Total | Yes/No |  | 0 |  | shown when [Type] ≠ "Employer Contribution" |
| Deduct Full Tax on Selected Payroll Date | Yes/No |  | 0 |  | shown when [Is Tax Applicable] and [Type]='Earning' |
| Disabled | Yes/No |  | 0 |  |  |
| Description | Long text |  |  |  |  |
| Statistical Component | Yes/No |  | 0 |  | shown when [Type] ≠ "Employer Contribution" |
| Is Flexible Benefit | Yes/No |  | 0 |  | shown when [Type] ≠ "Employer Contribution" |
| Max Benefit Amount (Yearly) | Amount |  |  | ≥ 0 | shown when [Is Flexible Benefit] is set |
| Variable Based On Taxable Salary | Yes/No |  | 0 |  | shown when [Type] = "Deduction" |
| Accounts | Table of *Salary Component Account* |  |  |  |  |
| Condition | Code / expression |  |  |  |  |
| Amount based on formula | Yes/No |  | 0 |  |  |
| Formula | Code / expression |  |  |  | shown when [Amount based on formula] is set |
| Amount | Amount |  |  | ≥ 0 | shown when [Amount based on formula]≠1 |
| Round to the Nearest Integer | Yes/No |  | 0 |  |  |
| Exempted from Income Tax | Yes/No |  | 0 |  | shown when [Type] = "Deduction" and not [Variable Based On Taxable Salary] |
| Is Income Tax Component | Yes/No |  | 0 |  | shown when [Type] = "Deduction" |
| Remove if Zero Valued | Yes/No |  | 1 |  | shown when not [Statistical Component] and [Type] ≠ "Employer Contribution" |
| Do Not Include in Accounting Entries | Yes/No |  | 0 |  | shown when [Do Not Include in Total] |
| Arrear Component | Yes/No |  | 0 |  | shown when [Type] ≠ "Employer Contribution"; read-only when [Variable Based On Taxable Salary] is set |
| Accrual Component | Yes/No |  | 0 |  | shown when [Type]="Earning"; read-only when [Is Flexible Benefit]=1 |
| Payout Method | Choice | Accrue and payout at end of payroll period / Accrue per cycle, pay only on claim / Allow claim for full benefit amount |  |  | shown when [Is Flexible Benefit] is set; required when [Is Flexible Benefit] is set |
| Payout Unclaimed Amount in Final Payroll Cycle | Yes/No |  | 0 |  | shown when ([Is Flexible Benefit] and [Payout Method]="Accrue per cycle, pay only on claim") |

### Salary Component Account

*child table (rows inside another record)* · 2 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Company | Link → Company |  |  |  |  |
| Account | Link → Account |  |  |  |  |

### Salary Detail

*child table (rows inside another record)* · 23 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Component | Link → Salary Component |  |  | **required** |  |
| Abbr | Text |  |  | read-only, copied from linked record | shown when [Parenttype]='Salary Structure' |
| Statistical Component | Yes/No |  | 0 | copied from linked record |  |
| Is Tax Applicable | Yes/No |  | 0 | read-only, copied from linked record | shown when [Parentfield]='earnings' |
| Is Flexible Benefit | Yes/No |  | 0 | read-only, copied from linked record | shown when [Parentfield]='earnings' |
| Variable Based On Taxable Salary | Yes/No |  | 0 | read-only, copied from linked record | shown when [Parentfield]='deductions' |
| Depends on Payment Days | Yes/No |  | 0 | read-only, copied from linked record |  |
| Deduct Full Tax on Selected Payroll Date | Yes/No |  | 0 | read-only |  |
| Condition | Code / expression |  |  | editable after submit | shown when [Parenttype]='Salary Structure' |
| Amount based on formula | Yes/No |  | 0 |  | shown when [Parenttype]='Salary Structure' |
| Formula | Code / expression |  |  | editable after submit | shown when [Amount based on formula]≠0 and [Parenttype]='Salary Structure' |
| Amount | Amount |  |  |  | shown when [Amount based on formula]≠1 or [Parenttype]='Salary Slip' |
| Do not include in total | Yes/No |  | 0 | copied from linked record |  |
| Default Amount | Amount |  |  |  | shown when [Parenttype]='Salary Structure' |
| Additional Amount | Amount |  |  | read-only, hidden |  |
| Tax on flexible benefit | Amount |  |  | read-only | shown when [Parenttype]='Salary Slip' and [Parentfield]='deductions' and [Variable Based On Taxable Salary] = 1 |
| Tax on additional salary | Amount |  |  | read-only | shown when [Parenttype]='Salary Slip' and [Parentfield]='deductions' and [Variable Based On Taxable Salary] = 1 |
| Additional Salary  | Link → Additional Salary |  |  | read-only |  |
| Exempted from Income Tax | Yes/No |  | 0 | read-only, copied from linked record | shown when [Parentfield]='deductions' |
| Year To Date | Amount |  |  | read-only |  |
| Is Recurring Additional Salary | Yes/No |  | 0 | read-only | shown when [Parenttype]='Salary Slip' and [Additional Salary ] |
| Do Not Include in Accounting Entries | Yes/No |  | 0 | copied from linked record | shown when [Do not include in total] |
| Accrual Component | Yes/No |  | 0 | read-only, copied from linked record |  |

### Salary Slip

*submittable (Draft → Submitted → Cancelled)* · 68 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Posting Date | Date |  | Today | **required** |  |
| Employee | Link → Employee |  |  | **required** |  |
| Employee Name | Display only |  |  | **required**, copied from linked record |  |
| Department | Link → Department |  |  | read-only, copied from linked record |  |
| Designation | Link → Designation |  |  | read-only, copied from linked record | shown when [Designation] |
| Branch | Link → Branch |  |  | read-only, copied from linked record |  |
| Status | Choice | Draft / Submitted / Cancelled / Withheld |  | read-only |  |
| Journal Entry | Link → Journal Entry |  |  |  |  |
| Payroll Entry | Link → Payroll Entry |  |  | read-only |  |
| Company | Link → Company |  |  | **required**, copied from linked record |  |
| Letter Head | Link → Letter Head |  |  | editable after submit |  |
| Salary Slip Based on Timesheet | Yes/No |  | 0 | read-only |  |
| Start Date | Date |  |  |  |  |
| End Date | Date |  |  |  |  |
| Salary Structure | Link → Salary Structure |  |  | **required**, read-only |  |
| Payroll Frequency | Choice | Monthly / Fortnightly / Bimonthly / Weekly / Daily |  |  |  |
| Working Days | Number |  |  | **required**, read-only |  |
| Leave Without Pay | Number |  |  |  |  |
| Payment Days | Number |  |  | **required**, read-only |  |
| Salary Slip Timesheet | Table of *Salary Slip Timesheet* |  |  |  |  |
| Total Working Hours | Number |  |  |  |  |
| Hour Rate | Amount |  |  |  |  |
| Bank Name | Text |  |  |  |  |
| Bank Account No | Text |  |  |  |  |
| Deduct Tax For Unsubmitted Tax Exemption Proof | Yes/No |  | 0 |  |  |
| Earnings | Table of *Salary Detail* |  |  |  |  |
| Deductions | Table of *Salary Detail* |  |  |  |  |
| Gross Pay | Amount |  |  | read-only |  |
| Net Pay | Amount |  |  | read-only |  |
| Rounded Total | Amount |  |  | read-only |  |
| Amended From | Link → Salary Slip |  |  | read-only |  |
| Mode Of Payment | Choice |  |  | read-only |  |
| Absent Days | Number |  |  | read-only |  |
| Unmarked days | Number |  |  | hidden |  |
| Currency | Link → Currency |  |  | **required**, read-only, copied from linked record | shown when ([Docstatus]=1 or [Salary Structure]) |
| Total Deduction | Amount |  |  | read-only |  |
| Total in words | Text |  |  | read-only |  |
| Hour Rate (Company Currency) | Amount |  |  |  |  |
| Gross Pay (Company Currency) | Amount |  |  | read-only |  |
| Exchange Rate | Number |  | 1.0 | **required**, hidden |  |
| Total Deduction (Company Currency) | Amount |  |  | read-only |  |
| Net Pay (Company Currency) | Amount |  |  | read-only |  |
| Rounded Total (Company Currency) | Amount |  |  | read-only |  |
| Total in words (Company Currency) | Text |  |  | read-only |  |
| Year To Date | Amount |  |  | read-only |  |
| Month To Date | Amount |  |  | read-only |  |
| Year To Date(Company Currency) | Amount |  |  | read-only |  |
| Month To Date(Company Currency) | Amount |  |  | read-only |  |
| Leave Details | Table of *Salary Slip Leave* |  |  | read-only |  |
| Gross Year To Date | Amount |  |  | read-only |  |
| Gross Year To Date(Company Currency) | Amount |  |  | read-only |  |
| CTC | Amount |  |  | read-only |  |
| Income from Other Sources | Amount |  |  | read-only |  |
| Total Earnings | Amount |  |  | read-only |  |
| Non Taxable Earnings | Amount |  |  | read-only |  |
| Deductions before tax calculation | Amount |  |  | read-only |  |
| Tax Exemption Declaration | Amount |  |  | read-only |  |
| Standard Tax Exemption Amount | Amount |  |  | read-only |  |
| Annual Taxable Amount | Amount |  |  | read-only |  |
| Income Tax Deducted Till Date | Amount |  |  | read-only |  |
| Future Income Tax | Amount |  |  | read-only |  |
| Current Month Income Tax | Amount |  |  | read-only |  |
| Total Income Tax | Amount |  |  | read-only |  |
| Salary Withholding | Link → Salary Withholding |  |  | read-only |  |
| Salary Withholding Cycle | Text |  |  | read-only, hidden |  |
| Current Payroll Period | Link → Payroll Period |  |  | read-only, hidden |  |
| Accrued Benefits | Table of *Employee Benefit Detail* |  |  | read-only |  |
| Employer contributions | Table of *Salary Detail* |  |  |  |  |

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

### Salary Slip Loan

*child table (rows inside another record)* · 8 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Loan | Link → Loan |  |  | **required**, read-only |  |
| Loan Account | Link → Account |  |  | read-only |  |
| Interest Income Account | Link → Account |  |  | read-only |  |
| Principal Amount | Amount |  |  | read-only |  |
| Interest Amount | Amount |  |  | read-only |  |
| Total Payment | Amount |  |  |  |  |
| Loan Repayment Entry | Link → Loan Repayment |  |  | read-only |  |
| Loan Product | Link → Loan Product |  |  | read-only, copied from linked record |  |

### Salary Slip Timesheet

*child table (rows inside another record)* · 2 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Time Sheet | Link → Timesheet |  |  | **required** |  |
| Working Hours | Number |  |  | read-only, copied from linked record |  |

### Salary Structure

*submittable (Draft → Submitted → Cancelled)* · 21 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Company | Link → Company |  |  | **required** |  |
| Letter Head | Link → Letter Head |  |  | editable after submit, copied from linked record |  |
| Is Active | Choice | Yes / No | Yes | **required**, editable after submit |  |
| Payroll Frequency | Choice | Monthly / Fortnightly / Bimonthly / Weekly / Daily | Monthly |  | shown when [Salary Slip Based on Timesheet] = 0 |
| Is Default | Choice | Yes / No | No | read-only, hidden |  |
| Salary Slip Based on Timesheet | Yes/No |  | 0 |  |  |
| Salary Component | Link → Salary Component |  |  |  |  |
| Hour Rate | Amount |  |  | ≥ 0 |  |
| Leave Encashment Amount Per Day | Amount |  |  | editable after submit, ≥ 0 |  |
| Max Benefits (Amount) | Amount |  |  | ≥ 0 |  |
| Earnings | Table of *Salary Detail* |  |  |  |  |
| Deductions | Table of *Salary Detail* |  |  |  |  |
| Employer Contributions | Table of *Salary Detail* |  |  |  |  |
| Total Earning | Amount |  |  | read-only, hidden |  |
| Total Deduction | Amount |  |  | read-only, hidden |  |
| Net Pay | Amount |  |  | read-only, hidden |  |
| Mode of Payment | Link → Mode of Payment |  |  |  |  |
| Payment Account | Link → Account |  |  |  |  |
| Amended From | Link → Salary Structure |  |  | read-only |  |
| Currency | Link → Currency |  |  | **required** |  |
| Flexible Benefits | Table of *Employee Benefit Detail* |  |  |  |  |

### Salary Structure Assignment

*submittable (Draft → Submitted → Cancelled)* · 22 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Employee | Link → Employee |  |  | **required** |  |
| Employee Name | Text |  |  | read-only, copied from linked record |  |
| Department | Link → Department |  |  | read-only, copied from linked record |  |
| Designation | Link → Designation |  |  | read-only, copied from linked record |  |
| Salary Structure | Link → Salary Structure |  |  | **required**, copied from linked record |  |
| From Date | Date |  |  | **required** |  |
| Company | Link → Company |  |  | **required**, copied from linked record |  |
| Base | Amount |  |  | copied from linked record, ≥ 0 |  |
| Annual Gross Earning | Amount |  |  | read-only |  |
| Total Cost To Company (CTC) | Amount |  |  | read-only, editable after submit |  |
| Variable | Amount |  |  | ≥ 0 |  |
| Amended From | Link → Salary Structure Assignment |  |  | read-only |  |
| Income Tax Slab | Link → Income Tax Slab |  |  |  | shown when [Salary Structure] is set |
| Currency | Link → Currency |  |  | **required**, read-only, copied from linked record | shown when ([Docstatus]=1 or [Salary Structure]) |
| Payroll Payable Account | Link → Account |  |  |  | shown when [Employee] is set |
| Cost Centers | Table of *Employee Cost Center* |  |  | editable after submit |  |
| Grade | Link → Employee Grade |  |  | read-only, copied from linked record |  |
| Tax Deducted Till Date | Amount |  |  | editable after submit, ≥ 0 |  |
| Taxable Earnings Till Date | Amount |  |  | editable after submit, ≥ 0 |  |
| Flexible Benefits | Table of *Employee Benefit Detail* |  |  |  |  |
| Maximum Benefit Amount | Amount |  |  | copied from linked record, ≥ 0 |  |
| Leave Encashment Amount Per Day | Amount |  |  | copied from linked record, ≥ 0 |  |

### Salary Withholding

*submittable (Draft → Submitted → Cancelled)* · 14 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Employee | Link → Employee |  |  | **required** |  |
| Employee Name | Text |  |  | read-only, copied from linked record |  |
| Company | Link → Company |  |  | read-only, copied from linked record |  |
| Payroll Frequency | Choice | Monthly / Fortnightly / Bimonthly / Weekly / Daily |  | read-only |  |
| Number of Withholding Cycles | Whole number |  |  | **required**, ≥ 0 |  |
| Posting Date | Date |  | Today | **required** |  |
| From Date | Date |  |  | **required** |  |
| To Date | Date |  |  | **required**, read-only |  |
| Date of Joining | Date |  |  | read-only, copied from linked record |  |
| Relieving Date | Date |  |  | read-only, copied from linked record |  |
| Reason for Withholding Salary | Long text |  |  |  |  |
| Cycles | Table of *Salary Withholding Cycle* |  |  | read-only |  |
| Amended From | Link → Salary Withholding |  |  | read-only |  |
| Status | Choice | Draft / Withheld / Released / Cancelled | Draft | read-only |  |

### Salary Withholding Cycle

*child table (rows inside another record)* · 4 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| From Date | Date |  |  | **required** |  |
| To Date | Date |  |  | **required** |  |
| Is Salary Released | Yes/No |  | 0 | read-only |  |
| Journal Entry | Link → Journal Entry |  |  | read-only |  |

### Taxable Salary Slab

*child table (rows inside another record)* · 4 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| From Amount | Amount |  | 0 | **required**, ≥ 0 |  |
| To Amount | Amount |  |  | ≥ 0 |  |
| Percent Deduction | Percent |  | 0 | **required**, ≥ 0 |  |
| Condition | Code / expression |  |  |  |  |
