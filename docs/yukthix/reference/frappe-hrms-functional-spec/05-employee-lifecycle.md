# 05 · Employee Lifecycle — Functional Reference

**Source studied:** Frappe HR, `develop` branch (downloaded 23 Sep 2026), folder `hrms-develop/hrms` (onboarding, promotion, transfer, separation, exit interview, full & final, appointment letter, employee master hooks, reminders, skills)
**Maps to YukthiX:** §1.3.1 Core HR · §1.3.2 Onboarding · §1.3.13 Offboarding · §1.3.14 Alumni · §2.1.9 Letters
**Clean-room status:** written in our own words; no code, identifiers or UI text copied. Verify behaviour on the running Frappe instance.
**Data dictionary:** every object and field → [05-employee-lifecycle.data-dictionary.md](05-employee-lifecycle.data-dictionary.md)
**Not in this codebase:** the **Employee master itself** (personal details, status Active / Inactive / Suspended / Left, joining / relieving / resignation dates, notice days, reason for leaving, bank, contacts) lives in **ERPNext**. HRMS only adds fields and behaviour to it (§2.1). Recruitment (job opening → applicant → interview → offer) is module 08.

---

## 0. How it works — the big picture

```
Job Offer (accepted) ─► Employee Onboarding ─► Project + Tasks (from template) ─► "required" tasks done ─► create Employee
                         (appointment letter from template)                                   │
                                                                                               ▼
                                              Employee ◄─ Promotion (changes fields + CTC, work history)
                                                 │     ◄─ Transfer  (changes fields / company, or new employee ID)
                                                 │
                    relieving date set on Employee (ERPNext) 
                                                 ▼
 Employee Separation ─► Project + Tasks (exit clearance checklist)        Exit Interview (+ questionnaire web form)
                                                 ▼
 Full & Final Statement ─ payables (withheld salary, gratuity, leave encashment, expense claims, bonus)
                         − receivables (advances, loans) − asset recovery ─► Journal Entry ─► Paid
```

**Key idea:** onboarding and separation are the **same engine** — a checklist template that becomes a project with tasks, auto-scheduled around holidays and assigned to users or roles. 💡 Worth keeping as one reusable "checklist / journey" engine in YukthiX (also useful for confirmations, transfers, asset handover).

---

## 1. Glossary

| Term | Meaning |
|---|---|
| Boarding template | Reusable checklist of activities for onboarding or separation, optionally per company / department / designation / grade |
| Activity | One checklist item: name, owner (a user **or** a role), start offset in days, duration in days, weight, description, "required before employee creation" |
| Boarding status | Pending → In Process → Completed, driven by the project's % complete |
| Property history | Table of (field, current value, new value) used by promotion and transfer |
| Internal work history | Employee's dated history of department / designation / branch |
| F&F | Full and Final settlement — final payables minus recoveries on exit |

---

## 2. Features

### 2.1 Employee master — what HRMS adds

The core record is ERPNext's. HRMS adds:

| Addition | Behaviour |
|---|---|
| **Naming** | HR Settings chooses employee ID by naming series, by employee number, or by full name. Not set → error on create. |
| **Approvers** | Leave approver, expense approver, shift-request approver on the employee. Saving grants the approver user the **Leave Approver / Expense Approver** role automatically; a user linked to an employee who is someone's approver gets those roles too. |
| **Department approvers** | Department holds lists of leave, expense and shift approvers (fallback when employee has none — see module 01 §2.17). |
| **Retirement date** | Date of birth + retirement age (HR Settings, default **60**). |
| **Employment details** | Employment type, grade, default shift, job applicant, job offer, payroll cost centre, employee advance account, health insurance provider + number. |
| **Grade** | Default salary structure and default base pay (used when assigning salary). |
| **Department** | Payroll cost centre, leave block list, appraisal template, required skills. |
| **Internal work history** | Dated rows of department / designation / branch; maintained by promotion and transfer (§2.4). |
| **Quick actions** | Assign leave policy / salary structure / shift schedule — offered only if a submitted master of that kind exists. |
| **Attendance heatmap** | Last 12 months of Present / Half Day attendance on the employee dashboard. |

**On create from recruitment:** linked Job Applicant → status Accepted; linked Job Offer → status Accepted (warning if the offer was Rejected / Cancelled). If an onboarding exists for that offer/applicant and isn't completed, its **required tasks must be complete** first; the onboarding then links to the new employee.

**Source:** `hrms/overrides/employee_master.py`, `hrms/setup.py` (custom fields), `hr/doctype/employee_grade/`

---

### 2.2 Onboarding templates & Employee Onboarding

**Template.** Title, optional company / department / designation / grade, list of activities.
**Activity data.** Name (required); owner = **user or role** (one or the other); task weight; description; begin on (days after boarding start); duration (days); "required for employee creation" (onboarding only).

**Employee Onboarding data.** **Job Offer (required)**, job applicant, employee name, date of joining, boarding begins on (required), company, department, designation, grade, holiday list (needed when no employee exists yet), template, activities, notify users by e-mail, project (created), status.

**Status flow.** Draft → Submitted (project + tasks created, status Pending) → In Process → Completed; Cancel deletes project and tasks.

| ID | Rule |
|---|---|
| LC-ON-01 | Only one non-cancelled onboarding per job offer. |
| LC-ON-02 | Employee auto-linked if an employee with that job offer already exists. |
| LC-ON-03 | On submit: a **project** "Employee Onboarding : \<applicant\>" starting on the joining date, and one **task per activity**: start = boarding start + begin-on days, end = start + duration, each moved forward past holidays (employee's holiday list, else the onboarding's). |
| LC-ON-04 | Each task is assigned to the activity's user and/or **every enabled user holding the activity's role** (Administrator excluded); optional e-mail notification. |
| LC-ON-05 | Activities added after submit get their tasks created on save. Amending clears task links. |
| LC-ON-06 | Status follows the project: 0 % Pending, between In Process, 100 % Completed (updated whenever a task or project changes). |
| LC-ON-07 | **Create Employee** only after submit and only when every "required for employee creation" task is Completed or Cancelled. Maps name, grade, department, designation, company, joining date; personal e-mail from the offer; status Active. |
| LC-ON-08 | "Mark as completed" sets all tasks and the project to Completed. |

> **Example.** Boarding begins Mon 1 Sep. Activity "Laptop setup": begin on 2, duration 1 → task 3 Sep – 4 Sep. Activity "ID card": begin on 5 → 6 Sep is Saturday (holiday) → moved to **Mon 8 Sep**.

**Source:** `hr/doctype/employee_onboarding/`, `employee_onboarding_template/`, `employee_boarding_activity/`, `hrms/controllers/employee_boarding_controller.py`

---

### 2.3 Appointment letter

**Template:** name, introduction, list of terms (title + description), closing notes. **Letter:** job applicant, applicant name, company, appointment date, template, introduction, terms, closing notes — pre-filled from the template, then editable and printed. No other letter types (offer letter lives in recruitment; **no relieving / experience / confirmation letters**).

**Source:** `hr/doctype/appointment_letter/`, `appointment_letter_template/`

---

### 2.4 Employee Promotion

**Purpose.** Record a promotion on a date: change employee fields (typically designation, grade, department) and optionally CTC.
**Data.** Employee, company, promotion date, list of (field, current, new), current CTC, revised CTC (currency from salary).
**Who.** HR User (create, submit), HR Manager (also cancel); employees read.

| ID | Rule |
|---|---|
| LC-PR-01 | Employee must be active. |
| LC-PR-02 | **Cannot be submitted before the promotion date** (no future-dated scheduling). |
| LC-PR-03 | Changeable fields: any employee field except identity and personal ones (name parts, ID, naming series, gender, date of birth, joining date, marital status, status, image, CTC) and non-data field types — the exclusion is enforced **only in the browser**. |
| LC-PR-04 | On submit: each new value is written to the employee (converted to the field's type); if department / designation / branch changed, a new **work-history row** from the promotion date is added (with an initial row from the joining date if history was empty) and the previous row's end date is set to the day before. Revised CTC → employee's CTC field. |
| LC-PR-05 | On cancel: old values restored, matching work-history rows removed, CTC reverted. |

> Note: promotion **does not** create a new salary structure assignment — the actual pay change must be done separately (module 03).

**Source:** `hr/doctype/employee_promotion/`, `hr/employee_property_update.js`, `hrms/hr/utils.py`

---

### 2.5 Employee Transfer

**Purpose.** Move an employee to another department / branch / location or **another company** on a date.
**Data.** Employee, company, transfer date, new company, list of (field, current, new) — required, "re-allocate leaves" flag, "create new employee ID" flag, new employee ID (result).

| ID | Rule |
|---|---|
| LC-TR-01 | Cannot be submitted before the transfer date. |
| LC-TR-02 | **Same employee ID:** field changes applied + work history as in promotion; if the company changes, company is updated **and date of joining reset to the transfer date**. |
| LC-TR-03 | **New employee ID:** a copy of the employee is created with the new values (new company → work history cleared, joining date = transfer date); the user login moves to the new record unless the user itself is being changed; **old record set to Left with relieving date = transfer date**. |
| LC-TR-04 | Cancel with a new ID requires deleting the new employee first; then old record back to Active. Otherwise values restored. |
| LC-TR-05 | "Re-allocate leaves" is stored but **does nothing**. |

**Source:** `hr/doctype/employee_transfer/`

---

### 2.6 Separation templates & Employee Separation (exit clearance)

Same engine as onboarding (§2.2): template of activities → on submit a project "Employee Separation : \<employee\>" starting on the resignation letter date, tasks from boarding start + offsets (holidays skipped), assigned to users / roles, status Pending → In Process → Completed; cancel deletes project and tasks.
**Data.** Employee (required), resignation letter date (from employee), company, department, designation, grade, template, activities, boarding begins on, notify by e-mail, a free-text exit-interview note, project, status.
**Typical activities:** manager handover, IT access removal, asset return, finance clearance, library/ID card.

**Source:** `hr/doctype/employee_separation/`, `employee_separation_template/`

---

### 2.7 Exit Interview

**Data.** Employee, company, date, interviewers (multiple), status (Pending / Scheduled / Completed / Cancelled), final decision (**Employee Retained** / **Exit Confirmed**), summary, reference document, questionnaire-sent flag, employee e-mail, joining date, relieving date, reports-to, designation, department.

| ID | Rule |
|---|---|
| LC-EI-01 | Employee must already have a **relieving date**. |
| LC-EI-02 | One non-cancelled exit interview per employee. |
| LC-EI-03 | Only status **Completed** can be submitted; submit writes the interview date onto the employee ("exit interview held on"); cancel clears it. |
| LC-EI-04 | **Exit questionnaire:** HR selects interviews and sends an e-mail (template from HR Settings) linking to a web form; each interview is e-mailed only once; missing e-mail reported. Needs the web form and template configured. |

**Source:** `hr/doctype/exit_interview/`

---

### 2.8 Full and Final Statement (F&F)

**Purpose.** Settle everything owed to and by a leaving employee.
**Data.** Employee, transaction date, joining & relieving dates, company, department, designation; **payables** and **receivables** tables (component, reference type, reference document, account, amount, status Settled / Unsettled, remark, paid-via-salary-slip); **assets** table (asset movement, asset name, date, actual cost, recovery cost, action Return / Recover Cost, status Owned / Returned, account, description); totals; status (Unpaid / Paid / Cancelled).

**How rows are prepared**
- On create (needs a relieving date): payables pre-listed as **Gratuity, Expense Claim, Bonus, Leave Encashment**, plus every **withheld salary slip** (amount = net pay, marked paid via slip); receivables pre-listed as **Employee Advance** (+ **Loan** if lending app installed). HR must pick the actual reference document for each; account and amount are then filled:
  - Gratuity: its amount; Leave Encashment: its amount; Expense Claim: total − reimbursed − advance adjusted; Employee Advance: paid − claimed − returned; Loan: total − paid; Salary slip: net pay.
- **Assets:** from asset movement records, every asset moved **to** the employee more times than **from** them is listed as Owned, action Return, cost = asset cost.

| ID | Rule |
|---|---|
| LC-FF-01 | Relieving date required. |
| LC-FF-02 | Totals: payable = Σ payables; receivable = Σ receivables + asset recovery costs. |
| LC-FF-03 | **Submit only when** every payable and receivable row is Settled, and every "Return" asset is Returned ("Recover Cost" rows count as settled). |
| LC-FF-04 | **Create Journal Entry** (bank entry dated today): debit each payable not paid via slip; credit each receivable; credit each asset recovery (employee as party); plus one balancing line for (payable − receivable) referencing the F&F — HR supplies the bank/cash account. |
| LC-FF-05 | When that journal is submitted, F&F → **Paid**, and linked Gratuity / Leave Encashment are marked paid; cancelling the journal reverses to Unpaid. |
| LC-FF-06 | Submit processes loan interest accrual (lending app); cancel reverses loan repayment. |

> **Example.** Withheld March salary ₹42,000 (paid via slip), gratuity ₹2,40,000, leave encashment ₹18,000; advance outstanding ₹10,000; laptop not returned, recover ₹35,000.
> Payable ₹3,00,000; receivable ₹45,000. Journal as generated: Dr gratuity payable ₹2,40,000, Dr payroll payable (encashment) ₹18,000 (the withheld slip is skipped — it's released through payroll) / Cr employee advance ₹10,000, Cr asset recovery ₹35,000, balancing Cr **₹2,55,000** (= 3,00,000 − 45,000).
> Debits ₹2,58,000 vs credits ₹3,00,000 → **the entry does not balance** (off by the withheld salary ₹42,000) — see defect LC-D14. The correct bank credit is ₹2,13,000.

> **What F&F does NOT do:** compute the final month's salary, notice-period pay or recovery, leave encashment or gratuity automatically (they must be created first in their own documents), bonus, or generate any settlement / relieving letter.

**Source:** `hr/doctype/full_and_final_statement/`, `full_and_final_outstanding_statement/`, `full_and_final_asset/`

---

### 2.9 Skills

**Skill** master; **designation skills** (skills expected per designation); **Employee Skill Map** — per employee: skills with proficiency rating and trainings attended. Used by appraisal/training (modules 07, 09).

**Source:** `hr/doctype/skill/`, `employee_skill_map/`, `employee_skill/`, `designation_skill/`

---

### 2.10 Reminders

| Reminder | Rule |
|---|---|
| **Birthdays** (daily) | For each company, everyone born today is announced by e-mail to **all other employees of that company** (setting, default on). |
| **Work anniversaries** (daily) | Same, for joining-date anniversaries. |
| **Holidays in advance** (weekly or monthly) | Each employee gets their upcoming non-weekly-off holidays for the week or month. |

**Source:** `hrms/controllers/employee_reminders.py`

---

### 2.11 Reports

| Report | Shows |
|---|---|
| **Employee Exits** | Employees with a relieving date in range: joining, relieving, exit interview + status + final decision, F&F statement, department, designation, reports-to. Filters include "exit interview pending", "questionnaire pending", "F&F pending". |
| Employee Information / Analytics / Birthday | Master listings (ERPNext-based). |

---

### 2.12 Settings

HR Settings: employee naming (series / number / full name), **retirement age**, standard working hours, reminders (birthdays, anniversaries, holidays + frequency), exit questionnaire web form and e-mail template, hiring sender.

---

### 2.13 Permissions (default roles)

| Object | Employee | HR User | HR Manager | System Manager |
|---|---|---|---|---|
| Onboarding | — | create, edit (**no submit**) | + submit, cancel | full |
| Onboarding / separation template | — | edit (separation: read) | full | full |
| Separation | — | create, edit | create, edit (**no submit**) | full (only role that can submit) |
| Promotion / Transfer | read | create, submit | + cancel, delete | — |
| Exit Interview | — | **read only** | create, edit | full |
| Full & Final | — | create, edit (**no submit**) | full | create, edit |
| Appointment letter | — | — | full | full |
| Grade, Skill Map | — | edit | full | full |

---

## 3. Suspected defects — verify on the running instance

| # | Suspicion | How to test |
|---|---|---|
| LC-D1 | **HR Manager cannot submit an Employee Separation** — only System Manager can. | Log in as HR Manager, submit a separation. |
| LC-D2 | Onboarding **requires a Job Offer** — employees hired outside the recruitment module (or migrated) can't be onboarded. | Create onboarding without an offer. |
| LC-D3 | Role-based activities assign the task to **every** enabled user with that role, across all companies. | Activity role "HR User" with 20 HR users. |
| LC-D4 | Promotion / transfer can't be submitted before the effective date → future-dated changes must be remembered and submitted on the day. | Promotion dated next month. |
| LC-D5 | Promotion "revised CTC" only updates a field on the employee; payroll is unaffected. | Promote with revised CTC, run payroll. |
| LC-D6 | "Re-allocate leaves" on transfer does nothing. | Tick it, transfer across companies, check leave. |
| LC-D7 | Transfer to another company **without** a new ID resets date of joining → service history lost (gratuity, leave accrual, anniversaries); old company's salary assignment and leave allocations remain. | Transfer, then compute gratuity. |
| LC-D8 | Field restriction on promotion/transfer is browser-only — via API any employee field (status, date of birth) can be changed. | API call with fieldname "date_of_birth". |
| LC-D9 | Cancelling a promotion/transfer deletes work-history rows matched loosely by value and date — may delete the wrong rows. | Two promotions to the same designation, cancel one. |
| LC-D10 | F&F has no salary / notice-pay / encashment / gratuity calculation; reference documents are picked manually; balancing journal line has no account; asset list only from asset-movement records. | Create F&F for a leaver with no prior documents. |
| LC-D11 | HR User can't submit F&F or onboarding; exit interview read-only for HR User. | Log in as HR User. |
| LC-D12 | Cancelling onboarding/separation **force-deletes** the project and tasks — checklist history lost. | Cancel a completed onboarding. |
| LC-D13 | Birthday e-mails expose birthdays to the whole company; no employee opt-out. | Enable reminders. |
| LC-D14 | **F&F journal doesn't balance when withheld salary is included**: the balancing line uses total payable (incl. withheld slips) − receivable, but withheld slips aren't debited. | F&F with one withheld slip + gratuity; click Create Journal Entry; try to save. |

---

## 4. Gap analysis vs YukthiX spec §1.3.1, §1.3.2, §1.3.13, §1.3.14

| Capability | Frappe | YukthiX spec | Note |
|---|---|---|---|
| Employee master + custom fields | ✅ (ERPNext) | ✅ | Custom fields via §2.1.5. |
| Org chart, reporting lines | ✅ (ERPNext) | ✅ | |
| **Probation & confirmation** (probation period, review, confirm / extend / terminate, confirmation letter) | ❌ | ✅ | Must build. |
| Effective-dated history of **all** job attributes (salary, grade, location, manager, cost centre) | ⚠️ department / designation / branch only | ✅ | Build a full effective-dated job history; schedule future-dated changes. |
| Promotion / transfer with approval workflow | ⚠️ no approval, no future dating | ✅ | Tie to salary revision (module 03) and letters. |
| Headcount & workforce planning | ⚠️ staffing plan in recruitment (module 08) | ✅ | |
| Succession planning | ❌ | ✅ | Must build. |
| Contingent workforce (via External ATS) | ❌ | ✅ | |
| Manager self-service | ⚠️ approvals only | ✅ | Team view, initiate changes, approve. |
| **Pre-boarding portal** (candidate uploads documents, fills forms before day 1) | ❌ | ✅ | Must build. |
| Document collection & verification (PAN, Aadhaar, certificates) | ❌ | ✅ | With §2.1.8 document management. |
| Background verification integration | ❌ | ✅ | Provider integrations (§2.1.13). |
| Induction checklists / tasks | ✅ (project + tasks) | ✅ | 💡 Generic journey engine; SLA and reminders. |
| Asset issue / return | ⚠️ ERPNext asset movements | ✅ §1.3.10 | Own asset register. |
| **Resignation workflow** (employee submits, manager/HR accept, notice period calculated, early release, buy-out, withdrawal) | ❌ | ✅ | Must build. |
| Exit clearance by departments | ✅ (separation tasks) | ✅ | Add clearance sign-off per department. |
| Exit interview + questionnaire | ✅ | ✅ | 💡 Built-in survey instead of web form. |
| **F&F calculation** (last salary, notice pay/recovery, leave encashment, gratuity, bonus, deductions, TDS) | ❌ (settlement ledger only) | ✅ | Must build; statutory deadline (Code on Wages: within 2 working days) alerts. |
| Relieving, experience, F&F letters | ❌ | ✅ | Letter generator §2.1.9. |
| Rehire eligibility | ⚠️ retained / exit confirmed only | ✅ | Add eligible-for-rehire flag + reason. |
| Alumni portal (payslips, Form 16, letters after exit) | ❌ | ✅ §1.3.14 | Must build. |
| Birthday / anniversary / holiday reminders | ✅ | ⚠️ | Add opt-out and privacy controls. |

---

## 5. YukthiX design questions (for the later design phase)

1. Onboarding: start from our ATS offer only, or also direct entry / bulk import?
2. Pre-boarding portal: what must candidates complete before joining (documents, forms, e-sign)?
3. Probation: default length per grade/type, who reviews, what happens on no action?
4. Job changes: one generic "job change" with types (promotion, transfer, re-designation, salary revision), or separate flows? Future-dated scheduling?
5. Resignation: employee-initiated in self-service? notice period by grade? buy-out rules?
6. F&F: full calculation in YukthiX including TDS, or settlement tracking only?
7. Which letters at launch (offer, appointment, confirmation, promotion, relieving, experience, F&F)?

---

## 6. Source pointers (for verification only)

| Area | Path in `hrms-develop/hrms` |
|---|---|
| Employee hooks, naming, approver roles, retirement | `overrides/employee_master.py`, `setup.py` |
| Onboarding / separation engine | `controllers/employee_boarding_controller.py`, `hr/doctype/employee_onboarding*/`, `employee_separation*/`, `employee_boarding_activity/` |
| Promotion, transfer, work history | `hr/doctype/employee_promotion/`, `employee_transfer/`, `employee_property_history/`, `hr/employee_property_update.js`, `hr/utils.py` |
| Exit interview | `hr/doctype/exit_interview/` |
| Full & final | `hr/doctype/full_and_final_*` |
| Letters | `hr/doctype/appointment_letter*/` |
| Skills, grade | `hr/doctype/skill/`, `employee_skill_map/`, `designation_skill/`, `employee_grade/` |
| Reminders | `controllers/employee_reminders.py` |
| Reports | `hr/report/employee_exits/` |
