# 06 · Expenses, Advances & Travel — Data Dictionary

Companion to [06-expenses-advances-travel.md](06-expenses-advances-travel.md). Every data object and field in this module of the reference codebase, generated from its field definitions and written with **plain labels only** (no internal names, no help text) — clean-room.

**Columns:** *Type* — Text, Number, Amount, Date, Yes/No, Choice, Link → other record, Table of child rows… · *Flags* — required, read-only, editable after submit, unique, hidden, copied from linked record, ≥ 0 · *Conditions* — when the field is shown / required / read-only; `[Label]` refers to another field on the same record.

Use this as the **checklist of data** a YukthiX equivalent must be able to hold; field names, structure and storage in YukthiX are our own design.

---


### Expense Claim

*submittable (Draft → Submitted → Cancelled)* · 39 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Series | Choice | HR-EXP-.YYYY.- |  | **required** |  |
| From Employee | Link → Employee |  |  | **required** |  |
| Employee Name | Text |  |  | read-only, copied from linked record |  |
| Department | Link → Department |  |  | copied from linked record |  |
| Expense Approver | Link → User |  |  |  |  |
| Approval Status | Choice | Draft / Approved / Rejected / Cancelled | Draft |  |  |
| Total Claimed Amount | Amount |  |  | read-only |  |
| Total Sanctioned Amount | Amount |  |  | read-only |  |
| Is Paid | Yes/No |  | 0 |  | shown when ([Docstatus]=0 or [Is Paid]) |
| Expenses | Table of *Expense Claim Detail* |  |  | **required** |  |
| Posting Date | Date |  | Today | **required** |  |
| Vehicle Log | Link → Vehicle Log |  |  | read-only |  |
| Project | Link → Project |  |  | editable after submit |  |
| Task | Link → Task |  |  |  |  |
| Total Amount Reimbursed | Amount |  |  | read-only |  |
| Remark | Long text |  |  |  |  |
| Company | Link → Company |  |  | **required**, copied from linked record |  |
| Mode of Payment | Link → Mode of Payment |  |  |  | shown when [Is Paid] is set |
| Clearance Date | Date |  |  |  |  |
| Payable Account | Link → Account |  |  | copied from linked record | required when not [Is Paid] |
| Cost Center | Link → Cost Center |  |  | editable after submit, copied from linked record |  |
| Status | Choice | Draft / Paid / Partially Paid / Unpaid / Rejected / Submitted / Cancelled | Draft | read-only |  |
| Amended From | Link → Expense Claim |  |  | read-only |  |
| Advances | Table of *Expense Claim Advance* |  |  |  |  |
| Total Advance Amount | Amount |  |  | read-only |  |
| Expense Taxes and Charges | Table of *Expense Taxes and Charges* |  |  |  |  |
| Grand Total | Amount |  |  | read-only |  |
| Total Taxes and Charges | Amount |  |  | read-only |  |
| Delivery Trip | Link → Delivery Trip |  |  |  | shown when [Delivery Trip] |
| Currency | Link → Currency |  |  | **required**, copied from linked record | shown when ([Docstatus]=1 or [From Employee]) |
| Exchange Rate | Number |  |  | **required** | shown when [Currency] is set |
| Total Sanctioned Amount (Company Currency) | Amount |  |  | read-only |  |
| Grand Total (Company Currency) | Amount |  |  | read-only |  |
| Total Advance Amount (Company Currency) | Amount |  |  | read-only |  |
| Total Taxes and Charges (Company Currency) | Amount |  |  | read-only |  |
| Total Claimed Amount (Company Currency) | Amount |  |  | read-only |  |
| Bank / Cash Account | Link → Account |  |  |  | shown when [Mode of Payment] is set |
| Gain Loss Account | Link → Account |  |  |  | shown when [Total Exchange Gain/Loss] is set |
| Total Exchange Gain/Loss | Amount |  |  | read-only | shown when [Total Exchange Gain/Loss] is set |

### Expense Claim Detail

*child table (rows inside another record)* · 10 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Expense Date | Date |  | Today |  |  |
| Expense Claim Type | Link → Expense Claim Type |  |  | **required** |  |
| Default Account | Link → Account |  |  | read-only, hidden | shown when [Expense Claim Type] is set |
| Description | Rich text |  |  |  |  |
| Amount | Amount |  |  | **required**, ≥ 0 |  |
| Sanctioned Amount | Amount |  |  | ≥ 0 |  |
| Cost Center | Link → Cost Center |  |  | editable after submit |  |
| Project | Link → Project |  |  | editable after submit |  |
| Amount (Company Currency) | Amount |  |  | ≥ 0 |  |
| Sanctioned Amount (Company Currency) | Amount |  |  | ≥ 0 |  |

### Expense Claim Advance

*child table (rows inside another record)* · 15 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Employee Advance | Link → Employee Advance |  |  | **required** |  |
| Posting Date | Date |  |  | read-only |  |
| Advance Paid | Amount |  |  | read-only |  |
| Unclaimed Amount | Amount |  |  | **required**, read-only |  |
| Allocated Amount | Amount |  |  | ≥ 0 |  |
| Advance Account | Link → Account |  |  | hidden |  |
| Returned Amount | Amount |  |  | read-only | shown when [Returned Amount] is set |
| Advance Paid (Company Currency) | Amount |  |  | read-only |  |
| Unclaimed Amount (Company Currency) | Amount |  |  | read-only |  |
| Allocated Amount (Company Currency) | Amount |  |  | read-only |  |
| Exchange Rate | Number |  |  | read-only |  |
| Exchange Gain/Loss | Amount |  |  | read-only | shown when [Exchange Gain/Loss] is set |
| Payment Entry Reference | Text |  |  | read-only, hidden |  |
| Reference Type | Choice | Payment Entry / Journal Entry |  | read-only |  |
| Reference Name | Link (record type chosen in another field) |  |  | read-only |  |

### Expense Taxes and Charges

*child table (rows inside another record)* · 9 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Account Head | Link → Account |  |  | **required**, editable after submit |  |
| Cost Center | Link → Cost Center |  | :Company | editable after submit |  |
| Description | Long text |  |  | **required** |  |
| Rate | Number |  |  |  |  |
| Amount | Amount |  |  | ≥ 0 |  |
| Total | Amount |  |  | read-only |  |
| Project | Link → Project |  |  | editable after submit |  |
| Total (Company Currency) | Amount |  |  | read-only |  |
| Amount (Company Currency) | Amount |  |  | read-only |  |

### Expense Claim Type

*master / regular record* · 4 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Expense Claim Type | Text |  |  | **required**, unique |  |
| Description | Long text |  |  |  |  |
| Accounts | Table of *Expense Claim Account* |  |  |  |  |
| Deferred Expense Account | Yes/No |  | 0 |  |  |

### Expense Claim Account

*child table (rows inside another record)* · 2 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Company | Link → Company |  |  |  |  |
| Default Account | Link → Account |  |  | **required** |  |

### Employee Advance

*submittable (Draft → Submitted → Cancelled)* · 19 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Series | Choice | HR-EAD-.YYYY.- |  |  |  |
| Employee | Link → Employee |  |  | **required** |  |
| Employee Name | Display only |  |  | copied from linked record |  |
| Posting Date | Date |  | Today | **required** |  |
| Department | Link → Department |  |  | read-only, copied from linked record |  |
| Purpose | Long text |  |  | **required** |  |
| Advance Amount | Amount |  |  | **required**, ≥ 0 |  |
| Claimed Amount | Amount |  |  | read-only |  |
| Status | Choice | Draft / Paid / Partially Paid / Unpaid / Claimed / Returned / Partly Claimed and Returned / Cancelled |  | read-only |  |
| Company | Link → Company |  |  | **required**, read-only, copied from linked record |  |
| Amended From | Link → Employee Advance |  |  | read-only |  |
| Advance Account | Link → Account |  |  | copied from linked record |  |
| Mode of Payment | Link → Mode of Payment |  |  |  |  |
| Returned Amount | Amount |  |  | read-only, editable after submit |  |
| Repay Unclaimed Amount from Salary | Yes/No |  | 0 |  |  |
| Pending Amount | Amount |  |  | read-only | shown when cur_frm.[Employee] |
| Currency | Link → Currency |  |  | **required**, copied from linked record | shown when ([Docstatus]=1 or [Employee]) |
| Paid Amount (Company Currency) | Amount |  |  | read-only |  |
| Paid Amount | Amount |  |  | read-only |  |

### Travel Request

*submittable (Draft → Submitted → Cancelled)* · 22 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Travel Type | Choice | Domestic / International |  | **required** |  |
| Travel Funding | Choice | Require Full Funding / Fully Sponsored / Partially Sponsored, Require Partial Funding |  |  |  |
| Copy of Invitation/Announcement | File |  |  |  |  |
| Purpose of Travel | Link → Purpose of Travel |  |  | **required** |  |
| Details of Sponsor (Name, Location) | Text |  |  |  |  |
| Any other details | Long text |  |  |  |  |
| Employee | Link → Employee |  |  | **required** |  |
| Employee Name | Text |  |  | read-only, copied from linked record |  |
| Contact Number | Text |  |  | copied from linked record |  |
| Contact Email | Text |  |  | copied from linked record |  |
| Date of Birth | Date |  |  | read-only, copied from linked record |  |
| Identification Document Type | Link → Identification Document Type |  |  |  |  |
| Identification Document Number | Text |  |  |  |  |
| Passport Number | Text |  |  | copied from linked record |  |
| Itinerary | Table of *Travel Itinerary* |  |  |  |  |
| Cost Center | Link → Cost Center |  |  |  |  |
| Costing | Table of *Travel Request Costing* |  |  |  |  |
| Name of Organizer | Text |  |  |  |  |
| Address of Organizer | Text |  |  |  |  |
| Other Details | Long text |  |  |  |  |
| Amended From | Link → Travel Request |  |  | read-only |  |
| Company | Link → Company |  |  | read-only, copied from linked record |  |

### Travel Itinerary

*child table (rows inside another record)* · 13 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Travel From | Text |  |  |  |  |
| Travel To | Text |  |  |  |  |
| Mode of Travel | Choice | Flight / Train / Taxi / Rented Car |  |  |  |
| Meal Preference | Choice | Vegetarian / Non-Vegetarian / Gluten Free / Non Diary |  |  |  |
| Travel Advance Required | Yes/No |  | 0 |  |  |
| Advance Amount | Text |  |  |  | shown when [Travel Advance Required] is set |
| Departure Datetime | Date & time |  |  |  |  |
| Arrival Datetime | Date & time |  |  |  |  |
| Lodging Required | Yes/No |  | 0 |  |  |
| Preferred Area for Lodging | Text |  |  |  | shown when [Lodging Required] is set |
| Check-in Date | Date |  |  |  | shown when [Lodging Required] is set |
| Check-out Date | Date |  |  |  | shown when [Lodging Required] is set |
| Other Details | Long text |  |  |  |  |

### Travel Request Costing

*child table (rows inside another record)* · 5 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Expense Type | Link → Expense Claim Type |  |  |  |  |
| Sponsored Amount | Amount |  |  | ≥ 0 |  |
| Funded Amount | Amount |  |  | ≥ 0 |  |
| Total Amount | Amount |  |  | ≥ 0 |  |
| Comments | Long text |  |  |  |  |

### Purpose of Travel

*master / regular record* · 1 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Purpose of Travel | Text |  |  | unique |  |

### Vehicle Log

*submittable (Draft → Submitted → Cancelled)* · 14 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Series | Choice | HR-VLOG-.YYYY.- |  | **required** |  |
| License Plate | Link → Vehicle |  |  | **required** |  |
| Employee | Link → Employee |  |  | **required**, copied from linked record |  |
| Model | Display only |  |  | copied from linked record |  |
| Make | Display only |  |  | copied from linked record |  |
| Date | Date |  |  | **required** |  |
| Current Odometer value  | Whole number |  |  | **required**, ≥ 0 |  |
| Fuel Qty | Number |  |  | ≥ 0 |  |
| Fuel Price | Amount |  |  | ≥ 0 |  |
| Supplier | Link → Supplier |  |  |  |  |
| Invoice Ref | Text |  |  |  |  |
| Service detail | Table of *Vehicle Service* |  |  |  |  |
| Amended From | Link → Vehicle Log |  |  | read-only |  |
| Last Odometer Value  | Whole number |  |  | **required**, read-only, copied from linked record |  |

### Vehicle Service

*child table (rows inside another record)* · 4 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Service Item | Link → Vehicle Service Item |  |  | **required** |  |
| Type | Choice | Inspection / Service / Change |  | **required** |  |
| Frequency | Choice | Mileage / Monthly / Quarterly / Half Yearly / Yearly |  | **required** |  |
| Expense | Amount |  |  | **required**, ≥ 0 |  |

### Vehicle Service Item

*master / regular record* · 1 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| Service Item | Text |  |  | **required**, unique |  |

### Vehicle

*master / regular record* · 21 fields

| Field | Type | Options | Default | Flags | Conditions |
|---|---|---|---|---|---|
| License Plate | Text |  |  | **required**, unique |  |
| Make | Text |  |  | **required** |  |
| Model | Text |  |  | **required** |  |
| Odometer Value (Last) | Whole number |  |  | **required** |  |
| Acquisition Date | Date |  |  |  |  |
| Location | Text |  |  |  |  |
| Chassis No | Text |  |  |  |  |
| Vehicle Value | Amount |  |  |  |  |
| Employee | Link → Employee |  |  |  |  |
| Insurance Company | Text |  |  |  |  |
| Policy No | Text |  |  |  |  |
| Start Date | Date |  |  |  |  |
| End Date | Date |  |  |  |  |
| Fuel Type | Choice | Petrol / Diesel / Natural Gas / Electric |  | **required** |  |
| Fuel UOM | Link → UOM |  |  | **required** |  |
| Last Carbon Check | Date |  |  |  |  |
| Color | Text |  |  |  |  |
| Wheels | Whole number |  |  |  |  |
| Doors | Whole number |  |  |  |  |
| Amended From | Link → Vehicle |  |  | read-only |  |
| Company | Link → Company |  |  |  |  |
