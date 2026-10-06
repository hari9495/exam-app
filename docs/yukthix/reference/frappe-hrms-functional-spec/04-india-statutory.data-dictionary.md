# 04 · India Statutory — Data Dictionary

Companion to [04-india-statutory.md](04-india-statutory.md). Every data object and field in this module of the reference codebase, generated from its field definitions and written with **plain labels only** (no internal names, no help text) — clean-room.

**Columns:** *Type* — Text, Number, Amount, Date, Yes/No, Choice, Link → other record, Table of child rows… · *Flags* — required, read-only, editable after submit, unique, hidden, copied from linked record, ≥ 0 · *Conditions* — when the field is shown / required / read-only; `[Label]` refers to another field on the same record.

Use this as the **checklist of data** a YukthiX equivalent must be able to hold; field names, structure and storage in YukthiX are our own design.

---


### Form 16

*master / regular record* · 17 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Employee | Link → Employee |  |  | **required** |  |
| Employee Name | Text |  |  | read-only, copied from linked record |  |
| PAN | Text |  |  | copied from linked record |  |
| Company | Link → Company |  |  | **required** |  |
| TAN | Text |  |  | read-only, copied from linked record |  |
| Financial Year | Link → Fiscal Year |  |  | **required** |  |
| TDS Return (Q4) | Link → TDS Return |  |  |  |  |
| Gross Salary | Amount |  |  | read-only |  |
| Total Taxable Income | Amount |  |  | read-only |  |
| Total Tax Deducted | Amount |  |  | read-only |  |
| Part A Status | Choice | Pending / Requested / Available / Failed | Pending | read-only |  |
| TRACES Request ID | Text |  |  | read-only |  |
| Part A Job ID | Text |  |  | read-only, hidden |  |
| Part A PDF | File |  |  | read-only |  |
| Part B Status | Choice | Pending / Requested / Available / Failed | Pending | read-only |  |
| Part B Job ID | Text |  |  | read-only, hidden |  |
| Part B PDF | File |  |  | read-only |  |

### India Payroll Company Setting

*child table (rows inside another record)* · 5 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Company | Link → Company |  |  | **required** |  |
| ESIC Registration Number | Text |  |  |  |  |
| EPF Establishment Code | Text |  |  |  |  |
| Professional Tax Registration Number | Text |  |  |  |  |
| LWF Registration Number | Text |  |  |  |  |

### TDS Challan

*submittable (Draft → Submitted → Cancelled)* · 21 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Company | Link → Company |  |  | **required** |  |
| TAN | Text |  |  | read-only, copied from linked record |  |
| Series | Choice | TDS-CHL-.YYYY.- | TDS-CHL-.YYYY.- |  |  |
| Financial Year | Link → Fiscal Year |  |  | **required** |  |
| Quarter | Choice | Q1 / Q2 / Q3 / Q4 |  | **required** |  |
| Section | Text |  | 192 |  |  |
| Deposit Date | Date |  |  | **required** |  |
| BSR Code | Text |  |  | **required** |  |
| Challan Serial No | Text |  |  | **required** |  |
| Payment Mode | Choice | Net Banking / Debit Card / Over the Counter / NEFT/RTGS |  |  |  |
| Bank Name | Text |  |  |  |  |
| Total Deposited | Amount |  |  | **required** |  |
| Minor Head | Choice | TDS Payable by Taxpayer (200) / TDS Regular Assessment (400) | TDS Payable by Taxpayer (200) |  |  |
| TDS | Amount |  |  |  |  |
| Surcharge | Amount |  |  |  |  |
| Education Cess | Amount |  |  |  |  |
| Interest | Amount |  |  |  |  |
| Fee (Sec 234E) | Amount |  |  |  |  |
| Others | Amount |  |  |  |  |
| Amended From | Link → TDS Challan |  |  | read-only |  |
| Deduction Month | Choice | April / May / June / July / August / September / October / November / December / January / February / March |  |  |  |

### TDS Return

*submittable (Draft → Submitted → Cancelled)* · 63 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Company | Link → Company |  |  | **required** |  |
| TAN | Text |  |  | read-only, copied from linked record |  |
| Deductor PAN | Text |  |  | read-only, copied from linked record |  |
| Financial Year | Link → Fiscal Year |  |  | **required** |  |
| Quarter | Choice | Q1 / Q2 / Q3 / Q4 |  | **required** |  |
| Form Type | Choice | 24Q | 24Q | read-only |  |
| Return Type | Choice | Original / Revised | Original |  |  |
| Previous Receipt Number | Text |  |  |  | shown when [Return Type]='Revised'; required when [Return Type]='Revised' |
| Filing Status | Text |  | Draft | read-only |  |
| Deductor Name | Text |  |  | read-only, copied from linked record |  |
| Responsible Person Name | Text |  |  | copied from linked record |  |
| Responsible Person PAN | Text |  |  | copied from linked record |  |
| Responsible Person Designation | Text |  |  | copied from linked record |  |
| Deductees | Table of *TDS Return Deductee* |  |  |  |  |
| Total Amount Paid | Amount |  |  | read-only |  |
| Total Tax Deducted | Amount |  |  | read-only |  |
| Total Tax Deposited (Challans) | Amount |  |  | read-only |  |
| Validation Issues | Code / expression |  |  | read-only |  |
| Form 24Q TXT | File |  |  | read-only |  |
| CSI File | File |  |  | read-only |  |
| Sheet JSON (audit) | File |  |  | read-only |  |
| FVU File | File |  |  | read-only |  |
| Form 27A | File |  |  | read-only |  |
| Token Number | Text |  |  | read-only |  |
| Provisional Receipt Number | Text |  |  | read-only |  |
| Filing Date | Date & time |  |  | read-only |  |
| Filing Actions | Table of *TDS Return Action* |  |  | read-only |  |
| Amended From | Link → TDS Return |  |  | read-only |  |
| Branch / Division | Text |  |  |  |  |
| Deductor Type Code | Text |  |  |  |  |
| GSTIN | Text |  |  |  |  |
| Deductor Email | Text |  |  |  |  |
| Contact Country Code | Text |  | 91 |  |  |
| Contact Number | Text |  |  |  |  |
| Flat / Door / Block No. | Text |  |  |  |  |
| Post Office | Text |  |  |  |  |
| Road / Street / Block / Sector | Text |  |  |  |  |
| Area / Locality | Text |  |  |  |  |
| District / City | Text |  |  |  |  |
| State | Text |  |  |  |  |
| PIN Code | Text |  |  |  |  |
| Country | Text |  | INDIA |  |  |
| Government State Code | Text |  |  |  |  |
| Ministry Code | Text |  |  |  |  |
| Ministry Name (Other) | Text |  |  |  |  |
| AIN | Text |  |  |  |  |
| Email | Text |  |  |  |  |
| Contact Country Code | Text |  | 91 |  |  |
| Contact Number | Text |  |  |  |  |
| Flat / Door / Block No. | Text |  |  |  |  |
| Post Office | Text |  |  |  |  |
| Road / Street / Block / Sector | Text |  |  |  |  |
| Area / Locality | Text |  |  |  |  |
| District / City | Text |  |  |  |  |
| State | Text |  |  |  |  |
| PIN Code | Text |  |  |  |  |
| Country | Text |  | INDIA |  |  |
| CSI OTP Reference | Text |  |  | read-only, hidden |  |
| TRACES Mobile Number | Text |  |  |  |  |
| Deductor Address | Link → Address |  |  |  |  |
| Deductor Contact | Link → Contact |  |  |  |  |
| Responsible Person | Link → Contact |  |  |  |  |
| Responsible Person Address | Link → Address |  |  |  |  |

### TDS Return Action

*child table (rows inside another record)* · 7 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Action | Text |  |  | read-only |  |
| Status | Text |  |  | read-only |  |
| Time | Date & time |  |  | read-only |  |
| Job ID | Text |  |  | read-only |  |
| Request ID | Text |  |  | read-only, hidden |  |
| Integration Request | Link → Integration Request |  |  | read-only |  |
| Message | Long text |  |  | read-only |  |

### TDS Return Deductee

*child table (rows inside another record)* · 19 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Employee | Link → Employee |  |  | **required** |  |
| Employee Name | Text |  |  | read-only, copied from linked record |  |
| PAN | Text |  |  |  |  |
| Deductee Status | Choice | Resident / Non-Resident | Resident |  |  |
| Month | Choice | April / May / June / July / August / September / October / November / December / January / February / March |  |  |  |
| Date of Payment / Credit | Date |  |  |  |  |
| Amount Paid / Credited | Amount |  |  |  |  |
| Tax Deducted | Amount |  |  |  |  |
| Date of Deduction | Date |  |  |  |  |
| Challan | Link → TDS Challan |  |  |  |  |
| Remarks | Long text |  |  |  |  |
| Surcharge | Amount |  | 0 |  |  |
| Health & Education Cess | Amount |  | 0 |  |  |
| Tax Deposited | Amount |  |  |  |  |
| Opting New Regime | Yes/No |  | 1 |  |  |
| Employee Category | Choice | general / senior_citizen / super_senior_citizen | general |  |  |
| PAN Operative | Yes/No |  | 1 |  |  |
| Reason for Lower Deduction | Text |  |  |  |  |
| Certificate Number | Text |  |  |  |  |

## Fields added to HRMS / ERPNext records by India Payroll

### Added to *Payroll Settings*

10 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Enable Multi-Company Payroll | Yes/No |  |  |  |  |
| Company Payroll Settings | Table of *India Payroll Company Setting* |  |  |  | shown when [Enable Multi-Company Payroll] |
| Enable Professional Tax Deduction | Yes/No |  |  |  |  |
| Enable ESIC Deduction | Yes/No |  |  |  |  |
| ESIC Registration Number | Text |  |  |  | shown when [Enable ESIC Deduction] and not [Enable Multi-Company Payroll] |
| Enable LWF Deduction | Yes/No |  |  |  |  |
| Enable EPF Deduction | Yes/No |  |  |  |  |
| EPF Establishment Code | Text |  |  |  | shown when [Enable EPF Deduction] and not [Enable Multi-Company Payroll] |
| Cached Access Token | Secret (encrypted) |  |  | read-only, hidden |  |
| Access Token Expiry | Date & time |  |  | read-only, hidden |  |

### Added to *Company*

5 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| TAN | Text |  |  |  |  |
| Deductor Type | Choice | Company / Branch / Division of Company / Central Government / State Government / Statutory body / Autonomous body / Local Authority / Firm / Individual / HUF / AOP / BOI |  |  |  |
| Responsible Person Name | Text |  |  |  |  |
| Responsible Person PAN | Text |  |  |  |  |
| Responsible Person Designation | Text |  |  |  |  |

### Added to *Employee*

7 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| UAN | Text |  |  |  |  |
| Name as per UAN | Text |  |  |  |  |
| ESIC IP Number | Text |  |  |  |  |
| IFSC Code | Text |  |  |  | shown when [Salary mode] = "Bank" |
| MICR Code | Text |  |  |  | shown when [Salary mode] = "Bank" |
| Payment Mode | Choice | NEFT / RTGS |  |  | shown when [Salary mode] = "Bank" |
| Account Type | Choice | Savings / Current / Salary |  |  | shown when [Salary mode] = "Bank" |

### Added to *Income Tax Slab*

1 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Surcharge Slabs | Table of *Income Tax Slab Other Charges* |  |  |  |  |

### Added to *Salary Structure Assignment*

8 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Person with Disability | Yes/No |  |  | editable after submit |  |
| LWF Exempted | Yes/No |  |  | editable after submit |  |
| LWF Exemption Reason | Long text |  |  | editable after submit | shown when [LWF Exempted] |
| EPF Applicable | Yes/No |  |  | editable after submit |  |
| Contribute on Actual PF Wage | Yes/No |  |  | editable after submit |  |
| VPF Mode | Choice | Amount / Percentage | Amount | editable after submit |  |
| VPF Percentage | Percent |  |  | editable after submit | shown when [VPF Mode] = 'Percentage' |
| VPF Amount | Amount |  |  | editable after submit | shown when [VPF Mode] = 'Amount' |
