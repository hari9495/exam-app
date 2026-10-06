# 00 · Core HR Masters — Functional Reference

**Source studied:** ERPNext, `develop` branch, folder `erpnext-develop/erpnext/setup` (GPL-3) — the records every HRMS module builds on
**Maps to YukthiX:** §1.3.1 Core HR · §2.1.1 Tenant & Organisation Setup
**Clean-room status:** written in our own words; no code, identifiers or UI text copied.
**Data dictionary:** every object and field → [00-core-hr-masters.data-dictionary.md](00-core-hr-masters.data-dictionary.md) (Employee has 70 fields)
**HRMS additions** to these records (approvers, grade, default shift, naming by series / number / full name, retirement age) are in [module 05 §2.1](05-employee-lifecycle.md).

---

## 0. The records

```
Company ─┬─ Department (tree, per company)      Designation (flat list)
         ├─ Branch (flat list)                    Employee Group (named list of employees)
         └─ Holiday List (dates, weekly offs, half days) — default per company, override per employee
                     │
 Employee ── reports to ─► Employee   (a tree = the org chart)
   ├─ personal, contact, address, passport, health, family
   ├─ job: company, department, designation, branch, grade, reports-to, holiday list
   ├─ dates: joining, offer, confirmation, contract end, retirement, resignation, relieving
   ├─ salary mode + bank
   ├─ user login link
   └─ education · external work history · internal work history (tables)
```

---

## 1. Employee

**Purpose.** The person record every HR, payroll and self-service feature points to.
**Data (summary).** Name (first / middle / last → full name), gender, date of birth, salutation, image; company, status, employee number, department, designation, branch, reports-to, holiday list; dates (joining, offer, confirmation, contract end, retirement, notice days, resignation letter, relieving); exit details (reason, exit interview held on, new workplace, feedback, leave encashed); salary mode (Bank / Cash / Cheque) with bank name and account; contacts (mobile, company / personal e-mail, preferred e-mail, emergency contact); addresses (permanent / current, rented or owned); passport; marital status, blood group, family background, health details; education, previous-employer history, internal work history; linked user login.

**Status.** Active / Inactive / Suspended / Left.

| ID | Rule |
|---|---|
| CM-EMP-01 | Status must be one of the four values. |
| CM-EMP-02 | Full name = first + middle + last (blanks skipped), recomputed on every save. |
| CM-EMP-03 | Date of birth can't be in the future and must be before joining; joining must be before retirement, relieving and contract end. |
| CM-EMP-04 | Company and personal e-mail must be valid e-mail addresses. |
| CM-EMP-05 | **Setting status to Left** requires a relieving date, and is blocked while any **active** employee still reports to this person (the blocking list is shown). |
| CM-EMP-06 | An employee can't report to themself. The reports-to chain forms a tree (org chart). |
| CM-EMP-07 | Preferred e-mail = whichever of company e-mail / personal e-mail / user ID is chosen; warning if that one is empty. E-mail used for notifications: user ID, else personal, else company e-mail (varies by feature). |
| CM-EMP-08 | **User link:** the user must exist; the same user can't be linked to two active employees. |
| CM-EMP-09 | On save with a user: the user gets the **Employee** role; name, gender, birth date and photo are copied to the user if missing; optionally restrict the user to see only their own employee record and company ("create user permission", default on). |
| CM-EMP-10 | **Status drives login:** changing status away from Active **disables** the linked user; back to Active re-enables it. |
| CM-EMP-11 | **Create user automatically** (on new employee): needs a company or personal e-mail; creates the login with the Employee role. Also available later as an action. |
| CM-EMP-12 | Removing the user link removes the Employee / Employee Self Service roles from that user (if not linked to another employee) and the record restriction. |
| CM-EMP-13 | When status becomes Left, a linked sales person (if any) is disabled. |

**Holiday list for an employee (base rule).** Employee's own holiday list, else the company default; none → error. *HRMS replaces this with date-effective Holiday List Assignments — module 01 §2.14.*

**Org chart.** Active employees shown as a tree by reports-to, filterable by company.

**Source:** `erpnext/setup/doctype/employee/`

---

## 2. Department

**Data.** Name, parent department, is-group, company, disabled; HRMS adds payroll cost centre, leave block list, approvers (leave / expense / shift), appraisal template, required skills.

| ID | Rule |
|---|---|
| CM-DEP-01 | Departments form a **tree**; a department with no parent is placed under the root "All Departments". |
| CM-DEP-02 | With a company, the stored name gets the company abbreviation appended (e.g. "Sales - ACME"); renaming keeps the suffix. |
| CM-DEP-03 | Disabled departments are hidden in the tree unless asked. |

---

## 3. Designation, Branch, Employee Group

- **Designation:** a name (+ description; HRMS adds appraisal template and expected skills). No rules.
- **Branch:** a name. No rules.
- **Employee Group:** a named list of employees (employee, name, user) — used to target notifications / reports.

---

## 4. Holiday List

**Data.** Name, from date, to date, total holidays (computed), weekly-off day + half-day flag (for bulk add), country + subdivision (for bulk add), colour; holiday rows (date, description, weekly off, half day).

| ID | Rule |
|---|---|
| CM-HOL-01 | From ≤ to; every holiday date must fall inside the list's range. |
| CM-HOL-02 | A date can appear only once. |
| CM-HOL-03 | Total = full days + 0.5 × half days. |
| CM-HOL-04 | Rows sorted with public holidays first, then weekly offs, each by date. |
| CM-HOL-05 | **Add weekly offs:** every chosen weekday between from and to (skipping dates already present), marked weekly-off (optionally half day). |
| CM-HOL-06 | **Add local holidays:** public holidays for a chosen country and state/subdivision from a built-in calendar library, inside the range. |
| CM-HOL-07 | "Is holiday" checks treat **half-day holidays as not a holiday**; a separate check identifies half-day holidays (used by attendance to halve thresholds — module 02). |

> **Example.** List 1 Jan – 31 Dec 2026, weekly off Sunday → 52 Sundays; add India / Karnataka holidays → Republic Day, Ugadi, Independence Day, Gandhi Jayanti…; mark 24 Dec half day → total = 52 + n + 0.5.

**Source:** `erpnext/setup/doctype/holiday_list/`, `holiday/`

---

## 5. Suspected defects — verify on the running instance

| # | Suspicion | How to test |
|---|---|---|
| CM-D1 | Mandatory fields are only first name, gender, date of birth, joining date, company, status — **no PAN, Aadhaar, UAN, bank IFSC** in core (India fields come from add-ons). | Create an employee with minimum data. |
| CM-D2 | Bank details are two free-text fields (bank name, account number) — no IFSC, no validation, no multiple accounts. | Enter any text. |
| CM-D3 | Sensitive data (health details, family background, passport, blood group) sits on the main record with no field-level protection. | Check who can read. |
| CM-D4 | Probation / confirmation date is just a date field — no workflow (module 05 gap). | — |
| CM-D5 | Deactivating the user on status change also happens for **Suspended** — a suspended employee can't log in to see payslips. | Suspend an employee. |

---

## 6. Gap analysis vs YukthiX §1.3.1 / §2.1.1

| Capability | ERPNext | YukthiX | Note |
|---|---|---|---|
| Employee master with custom fields | ✅ | ✅ | |
| India identity fields (PAN, Aadhaar, UAN, ESIC IP, IFSC) with validation | ⚠️ via add-ons | ✅ | Build in with format checks and masking. |
| Multiple bank accounts / salary split | ❌ | ⚠️ | Consider. |
| Documents (ID proofs, certificates) with expiry | ❌ | ✅ §1.3.15 | Document management. |
| Field-level security for sensitive data | ❌ | ✅ | Encrypt / mask Aadhaar, bank, health (DPDP). |
| Org chart | ✅ | ✅ | Add dotted-line / matrix managers. |
| Legal entity → locations → departments hierarchy | ⚠️ company + branch + department tree | ✅ §2.1.1 | Locations with state (PT/LWF), address, holiday calendar. |
| Holiday calendars with public-holiday import | ✅ | ✅ | Per location (Leave decision Q2). |
| Employee self-edit with approval (address, bank change) | ❌ | ✅ | Change-request workflow. |

---

## 7. Source pointers (for verification only)

| Area | Path in `erpnext-develop/erpnext` |
|---|---|
| Employee | `setup/doctype/employee/` |
| Department, Designation, Branch | `setup/doctype/department/`, `designation/`, `branch/` |
| Employee Group | `setup/doctype/employee_group/`, `employee_group_table/` |
| Holiday List | `setup/doctype/holiday_list/`, `holiday/` |
