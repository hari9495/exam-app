# 06 · Expenses, Advances & Travel — Functional Reference

**Source studied:** Frappe HR, `develop` branch, folder `hrms-develop/hrms` (expense claim, employee advance, travel request, vehicle log, employee payment entry) + ERPNext Vehicle
**Maps to YukthiX:** §1.3.7 Expense, Travel & Reimbursement (links §1.3.5 Payroll, §1.3.13 F&F, §2.1.13 accounting integration)
**Clean-room status:** written in our own words; no code, identifiers or UI text copied. Verify behaviour on the running Frappe instance.
**Data dictionary:** every object and field → [06-expenses-advances-travel.data-dictionary.md](06-expenses-advances-travel.data-dictionary.md)

---

## 0. How it works — the big picture

```
 Travel Request (itinerary + costing)          (informational only — not linked to anything below)

 Employee Advance ──submit──► Payment Entry (pay advance) ──► Paid
        │                                         │
        │   unspent part ──► Return (journal) or recover via salary (Additional Salary)
        ▼
 Expense Claim ── lines (type, amount → sanctioned) + taxes − advances allocated = amount payable
        │  approver approves / rejects ──submit──► accounting: Dr expense (+ tax), Cr advance, Cr employee payable
        ▼
 Payment Entry / Journal (reimburse) ──► Unpaid → Partially Paid → Paid
        or "Is Paid" = paid on the spot from a cash/bank account

 Vehicle Log (odometer, fuel, service) ──► Expense Claim
```

**Key idea:** all employee money flows (advance, claim, gratuity, leave encashment) are paid with the same **employee payment entry** against an employee "party" account. 💡 YukthiX: one payout / reimbursement ledger per employee.

---

## 1. Expense Claim Type (master)

Name, description, **default expense account per company** (one row per company; account must belong to that company; no company twice), deferred expense account.

---

## 2. Expense Claim

**Purpose.** Employee claims reimbursement of business expenses; approver sanctions and approves; finance pays.
**Who.** Employee creates (web or mobile); **Expense Approver** approves/submits; HR User / HR Manager full.
**Data.** Employee, department, company, posting date, **expense approver**, approval status (Draft / Approved / Rejected), currency + exchange rate; **expense lines** (date, claim type, description, **claimed amount**, **sanctioned amount**, account, cost centre, project); **advances** allocated (advance, paid, unclaimed, allocated, returned); **taxes and charges** (account, rate or amount); totals (claimed, sanctioned, taxes, advance, grand total, reimbursed); payable account, cost centre, project / task, vehicle log, delivery trip; **Is Paid** + mode of payment; status (Draft / Unpaid / Partially Paid / Paid / Rejected / Cancelled).

**Status flow**
```
Draft ─approve/reject─► submit ─► Unpaid ─payment─► Partially Paid ─► Paid
                               └► Rejected (sanctioned forced to 0)
Draft ─discard─► Cancelled          Submitted ─cancel─► Cancelled
```

| ID | Rule |
|---|---|
| EX-EC-01 | Employee must be active. Department (if set) must belong to the claim's company. |
| EX-EC-02 | **Sanctioned ≤ claimed** on every line. |
| EX-EC-03 | If approval status is Rejected, every line's sanctioned amount becomes 0. |
| EX-EC-04 | Line account defaults from the claim type's account for the company; missing → error "set default account on the claim type". |
| EX-EC-05 | Multi-currency off (HR setting) → currency forced to company currency, rate 1. |
| EX-EC-06 | **Taxes:** a tax row with a rate = total sanctioned × rate; total taxes = Σ rows. |
| EX-EC-07 | **Grand total (payable) = total sanctioned + taxes − advances allocated.** |
| EX-EC-08 | Advances: each must belong to the same employee and currency; the advance account must be a **Receivable** account and its payment must be on record; allocated ≤ (unclaimed − returned); total allocated ≤ sanctioned + taxes. |
| EX-EC-09 | If a positive amount remains after advances, "Is Paid" is switched off. Is Paid requires a mode of payment. |
| EX-EC-10 | Submit requires approval status Approved or Rejected (not Draft). |
| EX-EC-11 | **Self-approval** blocked if the HR setting is on and no workflow exists (employee's own user submitting). |
| EX-EC-12 | Approver mandatory (HR setting, default on); approver picker offers the employee's expense approver + department (and parent department) expense approvers. |
| EX-EC-13 | Every line needs a cost centre to post accounting. |
| EX-EC-14 | Task set → project filled from the task; task's and projects' total expense claimed updated on submit/cancel. |

**Accounting on submit** (only if sanctioned > 0):
- Dr each line's expense account (sanctioned amount, line cost centre / project)
- Dr each tax account
- Cr each allocated advance (advance account, employee as party)
- Cr employee payable (grand total)
- If **Is Paid**: additionally Cr cash/bank and Dr employee payable (settled immediately)
- Exchange gain/loss journal if advances were paid at a different exchange rate.

> **Example.** Taxi claimed ₹4,000 sanctioned ₹3,500; hotel ₹6,000 sanctioned ₹6,000 → sanctioned **₹9,500**. Tax row 18 % → **₹1,710**. Advance allocated ₹5,000 → **grand total ₹6,210**.
> Dr taxi ₹3,500, Dr hotel ₹6,000, Dr tax ₹1,710 = ₹11,210 / Cr advance ₹5,000, Cr employee payable ₹6,210 = ₹11,210 ✔.

**Payment & status**
| ID | Rule |
|---|---|
| EX-EC-15 | Reimbursed = Is Paid ? grand total : Σ journal lines + Σ payment entries referencing the claim. |
| EX-EC-16 | Outstanding = sanctioned + taxes − reimbursed − advances. A journal can't pay more than the outstanding. |
| EX-EC-17 | Status: Approved & (Is Paid, or reimbursed = grand total, or grand total 0) → Paid; reimbursed > 0 → Partially Paid; else Unpaid. |
| EX-EC-18 | Changing the tax account or expense lines after submit re-posts the accounting. |

**Source:** `hr/doctype/expense_claim/`, `expense_claim_detail/`, `expense_claim_advance/`, `expense_taxes_and_charges/`, `expense_claim_type/`

---

## 3. Employee Advance

**Purpose.** Pay the employee money up front (travel, event) to be settled later by expense claims, return, or salary recovery.
**Data.** Employee, posting date, department, **purpose**, **advance amount**, currency + exchange rate, company, advance account, mode of payment; paid, claimed, returned, pending amounts; "repay unclaimed amount from salary" flag; status.

**Status:** Draft → Unpaid → Partially Paid → Paid → Claimed / Returned / Partly Claimed and Returned; Cancelled.

| ID | Rule |
|---|---|
| EX-ADV-01 | Employee must be active. |
| EX-ADV-02 | Advance account must be a **Receivable** account in the advance's currency. If blank at submit: company default (same currency only); otherwise error. |
| EX-ADV-03 | Paid amount (from payments) can't exceed the requested amount. |
| EX-ADV-04 | Returned amount can't exceed paid − claimed. |
| EX-ADV-05 | Claimed amount = Σ allocations in **approved, submitted** expense claims. |
| EX-ADV-06 | Pending amount = Σ (requested − paid) of this employee's unpaid / partly-paid advances up to this date. |
| EX-ADV-07 | **Return** options: (a) journal entry Cr advance / Dr cash-bank (same-currency account), or (b) **recover via salary** — an Additional Salary deduction for paid − claimed (module 03, PY-ADD-07 caps recoveries). |
| EX-ADV-08 | Cancel: if the HR setting is on, payment entries are unlinked from the advance. |

> **Example.** Requested ₹10,000, paid ₹10,000; expense claim allocates ₹7,000 → Partially claimed; employee returns ₹3,000 → **Partly Claimed and Returned**. Or: recover ₹3,000 from next salary.

**Source:** `hr/doctype/employee_advance/`

---

## 4. Paying employees (employee payment entry)

One payment screen for **Employee Advance, Expense Claim, Gratuity, Leave Encashment** (and journals):
- Party = employee; party account = advance account (advance) or payable account (others).
- Amount = outstanding (advance: requested − paid; claim: EX-EC-16; gratuity / encashment: amount − paid).
- Handles currency conversion between the bank account and the employee account; for advances the target exchange rate is stored back on the advance.
- Submitting/cancelling a payment or journal updates the referenced claim's reimbursed amount and status.

**Source:** `hrms/overrides/employee_payment_entry.py`

---

## 5. Travel Request

**Purpose.** Record a planned trip.
**Data.** Travel type (Domestic / International), funding (require full funding / fully sponsored / partially sponsored), purpose of travel (master), invitation copy, sponsor details, employee + contact, date of birth, ID document type & number, passport number; **itinerary** rows (from, to, mode of travel, meal preference, departure / arrival date-time, lodging required, preferred area, check-in / check-out, advance required + amount); **costing** rows (expense type, sponsored, funded, total, comments); cost centre, organizer name / address.

| ID | Rule |
|---|---|
| EX-TR-01 | Employee must be active — **the only rule**. |
| EX-TR-02 | Submittable, but no approval flow, status, budget, or link to advances, bookings or expense claims. "Advance required" on the itinerary does nothing. |

**Source:** `hr/doctype/travel_request/`, `travel_itinerary/`, `travel_request_costing/`, `purpose_of_travel/`

---

## 6. Vehicle Log (company vehicles)

**Data.** Vehicle (licence plate; make, model from the vehicle master), employee, date, **current odometer**, last odometer, fuel quantity, fuel price, supplier, invoice ref; service rows (service item, type, frequency, expense).

| ID | Rule |
|---|---|
| EX-VL-01 | Current odometer ≥ last odometer. |
| EX-VL-02 | Submit stores the new odometer on the vehicle; cancel subtracts the distance back. |
| EX-VL-03 | **Make Expense Claim:** one line "vehicle expenses" = fuel qty × price + Σ service expenses; error if 0; only one claim per log. |
| EX-VL-04 | Cancelling the log removes its line from draft expense claims (or deletes the draft claim if that was its only line). |

> **Example.** Odometer 12,000 → 12,450 (450 km); fuel 30 L × ₹105 = ₹3,150; service ₹1,200 → claim **₹4,350**.

**Source:** `hr/doctype/vehicle_log/`, `vehicle_service/`; vehicle master in ERPNext `setup/doctype/vehicle/`

---

## 7. Reports, settings, mobile

| Item | Content |
|---|---|
| **Employee Advance Summary** | Per advance: employee, account, department, branch, posting date, advance / paid / claimed / returned / outstanding, status. |
| **Unpaid Expense Claim** | Per claim: sanctioned, paid, outstanding. |
| **Vehicle Expenses** | Per log: vehicle, make, model, odometer, fuel qty × price, fuel expense, service expense, employee. |
| **HR Settings** | Expense approver mandatory (on), prevent self-approval (off), multi-currency expense claims (off), unlink payment on advance cancellation (off). |
| **Mobile PWA** | Create expense claims (with attachments), view my / team claims, approve; view advance balances. |

---

## 8. Permissions (default roles)

| Object | Employee | Expense Approver | HR User | HR Manager | Other |
|---|---|---|---|---|---|
| Expense Claim | create, edit | full incl. submit/cancel | full | full | All: read |
| Employee Advance | create, edit | full incl. submit/cancel | **— (verify)** | **— (verify)** | |
| Expense Claim Type | read | — | create/edit | create/edit | |
| Travel Request | — | — | — | — | **System Manager only** |
| Vehicle Log | — | — | — | — | Fleet Manager |

---

## 9. Suspected defects — verify on the running instance

| # | Suspicion | How to test |
|---|---|---|
| EX-D1 | **Travel Request is usable only by System Manager** — employees and HR can't create it by default. | Log in as Employee → new Travel Request. |
| EX-D2 | Employee Advance has no default permission for HR User / HR Manager (only Employee and Expense Approver). | Log in as HR Manager → submit an advance. |
| EX-D3 | Approver is only filtered in the browser; the server doesn't check the chosen approver is valid for the employee. | API: set a colleague as approver. |
| EX-D4 | No expense policy: no per-type / per-grade / per-day limits, no receipt-mandatory rule, no duplicate-bill check, no mileage rate. | Claim ₹1,00,000 taxi with no receipt. |
| EX-D5 | Taxes are computed on total sanctioned (one rate for all lines) — no GST per line, no input-credit data (GSTIN, invoice). | Two lines with different GST rates. |
| EX-D6 | Travel request "advance required" / amount has no effect; no conversion to advance. | Tick advance required. |
| EX-D7 | Cancelling a vehicle log silently deletes draft expense claims. | Create claim from log, cancel log. |
| EX-D8 | Vehicle odometer rollback on cancel can corrupt the vehicle's last reading when later logs exist. | Two logs, cancel the first. |
| EX-D9 | "Recover from salary" creates a single deduction for the whole unclaimed amount — no instalments. | Unclaimed ₹30,000. |

---

## 10. Gap analysis vs YukthiX spec §1.3.7

| Capability | Frappe | YukthiX spec | Note |
|---|---|---|---|
| Expense claims with approval | ✅ | ✅ | Multi-level via our workflow engine (§2.1.4). |
| **Policy limits** (per category, grade, city tier, per day / per trip) | ❌ | ✅ "policy limits" | Must build. |
| Receipt capture, **OCR**, mandatory receipts above an amount | ⚠️ attachments only | ❌ | 💡 AI layer (§2.1.14) for OCR. |
| Mileage claims (km × rate), per-diem | ⚠️ vehicle log only / ❌ | ✅ per-diem | Must build. |
| GST details per bill (GSTIN, HSN, input credit) | ❌ | ❌ | India need for finance. |
| Advances with settlement / return / salary recovery | ✅ | ✅ | Add instalment recovery. |
| Travel requests with approval, budget, booking | ⚠️ form only | ✅ "requests and bookings" | Must build; booking via travel partners later. |
| Reimbursement through payroll | ⚠️ (benefit claims only; expense claims paid by payment entry) | ⚠️ | Option to pay approved claims in the next payroll. |
| Corporate card reconciliation | ❌ | ❌ | Later. |
| Accounting export | ✅ in-house ledger | ⚠️ §2.1.13 | Journal export to Tally / Zoho. |
| Duplicate / fraud checks | ❌ | ❌ | 💡 AI flagging. |

---

## 11. YukthiX design questions (for the later design phase)

1. Expense policy engine: which limit types at launch (category, grade, city tier, daily cap)?
2. Reimbursement route: payroll, direct bank payout, or both?
3. Travel: request + approval only, or bookings (flights / hotels) via partners?
4. Receipts: mandatory above what amount? OCR at launch?
5. GST capture for input credit — needed by our first customers?
6. Advance recovery: instalments from salary?

---

## 12. Source pointers (for verification only)

| Area | Path |
|---|---|
| Expense claim | `hrms/hr/doctype/expense_claim*/`, `expense_taxes_and_charges/` |
| Advance | `hrms/hr/doctype/employee_advance/` |
| Payments | `hrms/overrides/employee_payment_entry.py` |
| Travel | `hrms/hr/doctype/travel_request/`, `travel_itinerary/`, `travel_request_costing/`, `purpose_of_travel/` |
| Vehicle | `hrms/hr/doctype/vehicle_log/`, `vehicle_service*/`; `erpnext/setup/doctype/vehicle/` |
| Reports | `hrms/hr/report/employee_advance_summary/`, `unpaid_expense_claim/`, `vehicle_expenses/` |
