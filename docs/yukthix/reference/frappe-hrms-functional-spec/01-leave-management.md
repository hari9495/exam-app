# 01 · Leave Management — Functional Reference

**Source studied:** Frappe HR, `develop` branch (downloaded 23 Sep 2026), folder `hrms-develop`
**Maps to YukthiX:** §1.3.3 Leave Management (feeds §1.3.4 Attendance and §1.3.5 Payroll)
**Clean-room status:** written in our own words; no code, identifiers or UI text copied. Verify behaviour on the running Frappe instance, not by reading source.
**Data dictionary:** every object and field → [01-leave-management.data-dictionary.md](01-leave-management.data-dictionary.md)

---

## 0. How it works — the big picture

Everything about leave balances is driven by **one ledger**. Every event that adds or removes leave writes a signed line (+ or −) into a per-employee, per-leave-type ledger. The balance on any date is the sum of the ledger lines that apply on that date. Cancelling a document deletes the lines it wrote.

```
 Leave Type ──┐                        (rules for one kind of leave)
              ▼
 Leave Policy  = list of (Leave Type, days per year)
              ▼
 Policy Assignment = Policy × Employee × date range  ──►  one Allocation per Leave Type
                                                             │
 Holiday List Assignment ──► which days are holidays         ▼
                                                  ┌──── LEAVE LEDGER ────┐
 Allocation            (+ days)  ───────────────► │  + allocated         │
 Earned-leave accrual  (+ days, monthly etc.) ──► │  + carried forward   │
 Compensatory request  (+ days)  ───────────────► │  + / − adjustment    │
 Adjustment            (+ or −)  ───────────────► │  − leave taken       │
 Leave Application     (− days)  ───────────────► │  − encashed          │
 Encashment            (− days)  ───────────────► │  − expired           │
 Expiry job            (− days)  ───────────────► └──────────────────────┘
                                                             │
                                  Attendance ◄───────────────┤ (approved leave marks days "On Leave")
                                  Payroll    ◄───────────────┘ (unpaid / part-paid leave cuts payment days)
```

**Why this matters for YukthiX:** the ledger design is the single best idea in this module. Balances are never stored as a number that can drift; they are always re-derived. 💡 Adopt it.

---

## 1. Glossary

| Term | Meaning |
|---|---|
| Leave Type | A kind of leave (Casual, Sick, Earned, Comp-off, LWP…) with its rules |
| Leave Period | The company's leave year, e.g. 1 Apr – 31 Mar. One company can have many, not overlapping |
| Leave Policy | A named bundle: which leave types an employee gets and how many days per year |
| Policy Assignment | Attaching a policy to one employee for a date range; generates allocations |
| Allocation | "Employee X has N days of type Y valid from date A to date B" |
| Carry forward | Moving unused days of the previous allocation into the new one |
| Earned leave | A leave type that accrues gradually (monthly/quarterly/half-yearly/yearly) instead of all at once |
| LWP | Leave Without Pay — no balance needed, deducts salary |
| PPL | Partially Paid Leave — deducts a fraction of daily salary |
| Optional leave | Leave that can only be taken on dates in an "optional holiday" list (restricted holidays) |
| Comp-off | Compensatory leave earned by working on a holiday |
| Block date | A date on which leave approval is blocked (e.g. audit week) |
| Balance for consumption | The part of the balance that can actually be used before it expires |

---

## 2. Features

### 2.1 Leave Type

**Purpose.** Defines the behaviour of one kind of leave. Every other feature reads these settings.
**Who.** HR User / HR Manager create and edit; employees can view.

**Settings catalogue**

| Setting | Meaning | Default |
|---|---|---|
| Name | Unique name of the leave type | required |
| Max allocation per leave period | Upper limit of days that can be allocated to one employee within one leave period (0 = no limit) | 0 |
| Applicable after (calendar days) | Employee may apply only after this many days since joining | 0 |
| Max consecutive days | Longest continuous stretch allowed (joins back-to-back applications) | 0 = no limit |
| Carry forward | Unused days may move to the next allocation | off |
| Max carry-forward days | Cap on days carried | — |
| Carry-forward expiry (days) | Carried days expire this many days after the new allocation starts | — |
| Without pay (LWP) | No balance needed; payroll deducts full day | off |
| Partially paid (PPL) | Payroll pays only a fraction of the day | off |
| Paid fraction per PPL day | 0 to 1, e.g. 0.5 = half pay | required if PPL |
| Optional leave | Can be used only on optional-holiday dates | off |
| Allow negative balance | Can apply beyond balance (warning only) | off |
| Include holidays | Holidays/weekly-offs inside a leave range count as leave days ("sandwich" for the whole range) | off |
| Compensatory | Balance comes only from comp-off requests | off |
| Allow encashment | Unused balance can be paid out | off |
| Earning component | Salary component used to pay encashment | required for payroll encashment |
| Max encashable days | Cap per encashment | — |
| Non-encashable days | Days that must remain in balance and can't be encashed | — |
| Earned leave | Accrues periodically | off |
| Accrual frequency | Monthly / Quarterly / Half-Yearly / Yearly | — |
| Accrual rounding | none / 0.25 / 0.5 / 1 | none |
| Accrue on | First day / Last day of period / Date of joining (monthly only) | Last day |
| Allow over-allocation | Allocation may exceed the number of days in its date range | off |

**Rules**

| ID | Rule |
|---|---|
| LV-TYP-01 | A type cannot be both Compensatory and Earned. |
| LV-TYP-02 | A type cannot be both LWP and PPL. |
| LV-TYP-03 | PPL paid fraction must be between 0 and 1 inclusive. |
| LV-TYP-04 | A type cannot be switched to LWP while any allocation of it is active today. |
| LV-TYP-05 | Reducing "max allocation" on an earned type that has active allocations shows a warning (accrual may go wrong), but is allowed. |
| LV-TYP-06 | Changing a leave type clears the payroll cache of LWP/PPL types. |

**Source:** `hrms/hr/doctype/leave_type/`

---

### 2.2 Leave Period

**Purpose.** The leave year per company. Used for policy assignment, optional holidays, comp-off validity and bulk allocation.
**Data.** From date, To date, Company, Active flag, optional-holiday list.

| ID | Rule |
|---|---|
| LV-PER-01 | To date must be strictly after From date. |
| LV-PER-02 | Periods of the same company must not overlap. |
| LV-PER-03 | Only **active** periods are considered when a feature looks up "the current leave period". |

**Source:** `hrms/hr/doctype/leave_period/`

---

### 2.3 Leave Policy

**Purpose.** A reusable bundle — e.g. "Standard India Policy: CL 12, SL 12, EL 18".
**Data.** Title; table of (Leave Type, annual days). Submittable (Draft → Submitted → Cancelled, can amend).

| ID | Rule |
|---|---|
| LV-POL-01 | Annual days for a type cannot exceed that type's max allocation (if a max is set). |

**Source:** `hrms/hr/doctype/leave_policy/`, `leave_policy_detail/`

---

### 2.4 Leave Policy Assignment

**Purpose.** Gives a policy to an employee for a date range and creates the actual allocations.
**Who.** HR User / HR Manager. Bulk version via Leave Control Panel (§2.15) and a list-view bulk action.

**Data.** Employee, Policy, "based on" (Leave Period / Joining Date / blank = custom), Leave Period, Effective from, Effective to, Carry forward flag, "leaves allocated" flag.

**Status flow.** Draft → Submitted (allocations created) → Cancelled.

**Rules**

| ID | Rule |
|---|---|
| LV-PA-01 | Based on Leave Period → dates are copied from the period. |
| LV-PA-02 | Based on Joining Date → start = joining date; if no end given, end = last day of the month 12 months after joining. |
| LV-PA-03 | An employee cannot have two submitted assignments whose date ranges overlap. |
| LV-PA-04 | If carry forward is ticked, show a warning for each policy type that doesn't support carry forward (it will be silently skipped for those). |
| LV-PA-05 | On submit, one allocation is created and submitted **per leave type in the policy**, except LWP types. |
| LV-PA-06 | If the computed days for a type are 0 and the type is not earned and not allow-negative, that type is skipped and a comment is logged on the assignment. |
| LV-PA-07 | An assignment can generate allocations only once. |
| LV-PA-08 | When the last allocation linked to an assignment is cancelled, the assignment is marked as "not allocated" again. |
| LV-PA-09 | Bulk assignment processes employees one by one; one failure is rolled back and reported, the rest succeed. |

**Calculation — days granted at assignment time**

1. Compensatory type → 0.
2. Earned type and today is before the assignment end → days for **periods already elapsed** (see §2.6).
3. Otherwise → annual days, pro-rated if the employee joined after the start:

   `days = annual × (days from joining to end, inclusive) ÷ (days in full range, inclusive)`, rounded to a whole number.
4. Cap at annual days — except earned leave with yearly frequency.

> **Example.** Policy CL = 12/year, leave period 1 Apr 2026 – 31 Mar 2027 (365 days). Employee joins 1 Oct 2026. Days from joining to end = 182. 12 × 182 ÷ 365 = 5.98 → **6 days**.

**Source:** `hrms/hr/doctype/leave_policy_assignment/`

---

### 2.5 Leave Allocation

**Purpose.** "N days of type Y valid from A to B" for one employee. Created manually, by policy assignment, by bulk tool, or by comp-off.

**Data.** Employee, Leave Type, From, To, New days, Carry-forward flag, Carried-in days (computed), Total (computed), Total encashed, Days carried out to next allocation, Expired flag, links to policy / assignment / period / comp-off request, earned-leave schedule (table), description.

**Status flow.** Draft → Submitted → Cancelled (amendable). "Expired" flag set by the expiry job.

**Rules**

| ID | Rule |
|---|---|
| LV-AL-01 | To date must be after From date. |
| LV-AL-02 | No two submitted allocations of the same employee + type may overlap in dates. |
| LV-AL-03 | LWP types cannot be allocated. |
| LV-AL-04 | If a **later** allocation of the same employee + type has already carried forward, you cannot create or change an allocation that ends before it (history is locked). |
| LV-AL-05 | Sum of allocations for the employee + type within the leave period (including this one) must not exceed the type's max allocation. |
| LV-AL-06 | Total days must not exceed the number of calendar days in the allocation range — unless the type allows over-allocation (then warning only). |
| LV-AL-07 | Total days is required (non-zero) unless the type is earned, compensatory, or allows negative balance. |
| LV-AL-08 | Carry forward is only allowed if the leave type supports it. |
| LV-AL-09 | Carry-forward takes the **remaining balance of the most recent earlier allocation**, capped by the type's max carry-forward days. |
| LV-AL-10 | If carried + new exceeds the type's max allocation, the carried part is reduced so the total equals the max. |
| LV-AL-11 | On submit with carry forward, the previous allocation is **expired** (its remainder is written off in the ledger) and it records how many days it passed on. |
| LV-AL-12 | After submit, "new days" can still be edited — except for earned leave that came from a policy (accrual owns it). |
| LV-AL-13 | An edit after submit cannot bring the total below leave already approved in that range — error, or warning if negative balance is allowed. |
| LV-AL-14 | Cancelling an allocation is blocked if any leave application sits inside its dates. |
| LV-AL-15 | Cancelling a carry-forward allocation resets the "carried out" figure on the previous allocation. |

**Ledger effect on submit**

- Carried-in days → one **+** line flagged "carry forward", valid from the allocation start until *start + expiry days − 1* (or the allocation end, whichever is earlier). If that expiry is already in the past, the user is prompted to run expiry now.
- New days → one **+** line for the full allocation range.
- Any later edit of new days → a **+/−** line for the difference.

**Manual top-up (earned leave).** HR can add N days on a chosen date inside the allocation. Capped by the type max; the non-carried total must not exceed the policy's annual days; a comment records who added what and when.

**Source:** `hrms/hr/doctype/leave_allocation/`

---

### 2.6 Earned-leave accrual

**Purpose.** Grant leave gradually — e.g. 18 EL/year credited as 1.5 each month.

**How it runs.** A daily background job looks at every earned leave type and every active allocation that came from a policy assignment (employee not "Left"). If today is that allocation's accrual date, it credits the period's share.

**Accrual schedule.** When a policy assignment creates an earned allocation, a **schedule** table is pre-computed for the whole range: one row per accrual date with the number of days. Rows already in the past are marked allocated immediately (via the assignment). Each row records: date, days, allocated?, attempted?, failed?, reason, credited by (job / assignment / manual).

**Calculations**

- Per-period share = annual days ÷ periods per year (12 / 4 / 2 / 1).
- **Pro-rating in the joining period:** share × (days from joining to period end) ÷ (days in period).
- **Rounding** (if set): to nearest 0.25, 0.5 or 1. Note: halfway values round to the **nearest even** number (e.g. 2.5 → 2). 💡 Decide our rounding deliberately.
- **Accrual date:** First day of period / Last day of period / (monthly only) the employee's joining day-of-month — falling back to month-end if that day doesn't exist in the month.
- **Half-yearly** periods are counted from the assignment start date when assignment is based on joining; otherwise Jan–Jun / Jul–Dec.
- **Catch-up at assignment:** if an assignment is created mid-year, all elapsed periods are credited at once (first one pro-rated if joining fell in it). The current period counts only if its accrual condition is already met today.

> **Example.** EL = 18/year, monthly, rounding 0.5, accrue on last day. Employee joins 16 Jan. January share = 1.5 × 16 ÷ 31 = 0.774 → rounded to 0.5 steps → **1.0**. From February: **1.5** on each month-end.

**Rules**

| ID | Rule |
|---|---|
| LV-EL-01 | Credit is skipped (and marked failed) if non-carried allocated days + this credit would exceed the policy's annual days — except yearly frequency. |
| LV-EL-02 | If the type has a max allocation: credit is reduced to the remaining quota; if no quota left, marked failed. |
| LV-EL-03 | Each failure is logged on the schedule row with a reason; all HR Managers get one summary email per run. |
| LV-EL-04 | HR can "retry failed allocations" from the allocation; the same caps apply; row is marked credited "manually". |
| LV-EL-05 | Allocations without a schedule (older data) fall back to computing today's accrual date and share on the fly. |

**Source:** `hrms/hr/utils.py` (accrual job), `hrms/hr/doctype/earned_leave_schedule/`, `leave_policy_assignment/`

---

### 2.7 Leave Application

**Purpose.** Employee requests leave; approver approves or rejects.
**Who.** Employee creates (web or mobile). Leave Approver / HR approve. HR can create on behalf and cancel.

**Data.** Employee, Leave Type, From, To, Half day flag, Half-day date, Total days (computed), Balance before application (computed), Reason, Approver, Status, Posting date, Follow-via-email flag, linked salary slip, colour (calendar).

**Status flow**

```
Draft/Open ──approve──► Approved ──submit──► Submitted (Approved)  ──cancel──► Cancelled
     │                                                                   ▲
     └──reject──► Rejected ──submit──► Submitted (Rejected)             │
     └──discard──► Cancelled                                            │
Only Approved or Rejected can be submitted. Submitted Approved can be cancelled.
```

**Validation rules (in the order they run)**

| ID | Rule |
|---|---|
| LV-APP-01 | Employee must be active. |
| LV-APP-02 | If "restrict back-dated applications" is on, a From date before today is allowed only for users with the configured role; if no role is configured, back-dating is fully blocked with a setup error. |
| LV-APP-03 | To date cannot be before From date. |
| LV-APP-04 | Half-day date must lie within the range and must not be a holiday. If From = To and half day is ticked, half-day date = that date. Only **one** half day per application. |
| LV-APP-05 | (Non-LWP, non-negative types) The dates must fall inside an allocation. The application cannot span two allocations. |
| LV-APP-06 | (Non-LWP) Cannot apply before a later allocation that has already carried forward. |
| LV-APP-07 | Total leave days is computed (§2.8). If it is 0 or less → error "all selected days are holidays". |
| LV-APP-08 | (Non-LWP, not being rejected) Days requested must not exceed **balance for consumption** (§2.9). Types allowing negative balance show a warning instead. |
| LV-APP-09 | No overlap with another Open or Approved application of the employee — **except** two half-day applications on the same half-day date (together max 1 day). |
| LV-APP-10 | Max consecutive days: this application plus all Open/Approved applications of the same type that touch it end-to-start (chained in both directions) must not exceed the type's limit. Holidays inside the chain follow the type's include-holiday setting. |
| LV-APP-11 | Block dates in range → warning listing them. If status is Approved and a block list applies to the approving user → error. |
| LV-APP-12 | (LWP types) Range must not touch a period for which a salary slip is already submitted. |
| LV-APP-13 | No date in range may already have submitted attendance of Present or Work-From-Home (a half-day where the other half is absent is allowed). |
| LV-APP-14 | (Optional-leave types) There must be an active leave period with an optional-holiday list, and **every** date in range must be in that list. |
| LV-APP-15 | "Applicable after N days" from joining must be satisfied. |
| LV-APP-16 | If "prevent self-approval" is on and no approval workflow is configured, a user cannot set their own application to Approved. The status field is locked for them in the form. |
| LV-APP-17 | If "approver mandatory" is on, an approver must be set. |

**Side effects**

| When | What happens |
|---|---|
| Created | Approver notified (if notifications on). Document shared with approver. Mobile app refreshes "my leaves" and "team leaves". |
| Saved as Open | Approver email (template from HR Settings). |
| Submitted as Approved | Attendance for each day is created or updated to **On Leave** (or **Half Day** on the half-day date). Holidays are skipped (and any attendance on them removed) unless the type includes holidays. Ledger **−** line(s). Employee notified. |
| Submitted as Rejected | Employee notified. No ledger or attendance effect. |
| Approved against an allocation that already ended (non-carry-forward type) | An offsetting **+** line is added at the allocation end so the days aren't counted twice (once as expired, once as taken). |
| Cancelled | Status → Cancelled. Its ledger lines are deleted. Attendance marked On Leave / Half Day in the range is cancelled. Employee notified. |

**Ledger splitting.** One application normally writes one **−** line. It writes two lines when:
- carried-forward days expire in the middle of the range (split at the expiry date), or
- the range spans two consecutive allocations (only possible for negative-balance types). Non-consecutive allocations → error.

**Source:** `hrms/hr/doctype/leave_application/`

---

### 2.8 Counting leave days

`days = calendar days from From to To (inclusive)`
`− 0.5 if half day and the half-day date is valid and not a holiday`
`− holidays in the range, if the leave type does NOT include holidays`

Holidays come from the employee's holiday list on each date (the list can change mid-range, §2.14).

> **Example.** Leave Fri 6 Mar – Mon 9 Mar; Sat/Sun are weekly offs in the holiday list.
> Include holidays **off** → 4 − 2 = **2 days**. Include holidays **on** → **4 days**.

Note: this is not a true "sandwich rule" (see Gaps). The setting counts every holiday in the range, not just holidays sandwiched between two leave days.

---

### 2.9 Leave balance

**Balance on a date** = sum of ledger lines for that employee + type in the current allocation window:
allocated (+) + carried forward (+) + adjustments (±) − leave taken − encashed − manually expired.

**Balance for consumption** — what can actually be used:
- the carried-forward part is usable only until its expiry date, and is capped at the number of days left until that expiry;
- the whole balance is capped at the number of calendar days from the leave's start date until the allocation ends.

> **Example.** Balance 10, allocation ends 31 Mar, applying from 29 Mar → usable balance = 3 (29, 30, 31 Mar).

Leave taken inside carried-forward validity is consumed from the carried part first; any excess comes from new days.

**Balance summary shown to employees / on salary slips** per type: total allocated, expired, taken, pending approval (Open applications), remaining. Expired = total − (remaining + taken), shown only if positive.

---

### 2.10 Leave ledger & expiry

**Ledger line fields.** Employee, Leave Type, source document (type + id), days (signed), From, To, carry-forward flag, expired flag, LWP flag, holiday list used, company.

| ID | Rule |
|---|---|
| LV-LED-01 | Line To date must not be before From date. |
| LV-LED-02 | Ledger lines are system-written; only expiry lines (and adjustment lines) may be cancelled directly. Cancelling an expiry line re-opens the allocation (expired flag cleared). |
| LV-LED-03 | Cancelling a source document deletes all its lines, plus an expiry line created at the same time (same day) for that employee + type. |

**Daily expiry job**
- For each allocation line whose validity ended before today and that has no expiry line yet, write a **−** line for the unused remainder and mark the allocation expired.
- Carried-forward lines with their own expiry period expire separately from new-days lines.

**Source:** `hrms/hr/doctype/leave_ledger_entry/`

---

### 2.11 Leave Encashment

**Purpose.** Pay out unused leave.
**Who.** HR creates/submits; employees can create drafts. Also auto-created (see below).

**Data.** Leave period, Employee, Leave Type, allocation, balance, encashable days (computed), days to encash, amount, encashment date, currency, company, "pay via payment entry" flag, payable/expense accounts, cost centre, paid amount, status.

**Status.** Draft → Unpaid (submitted, amount > paid) → Paid → Cancelled.

**Calculation**
1. Balance = allocation total − days carried out to next allocation − leave taken/encashed up to the encashment date.
2. Encashable = balance − non-encashable days (floor 0), then capped at max encashable days.
3. Days to encash defaults to encashable; cannot exceed it.
4. Amount = days × **per-day encashment rate** — taken from the employee's latest salary structure assignment on/before the date, else from the salary structure itself.

> **Example.** Balance 20, non-encashable 5, max encashable 10 → encashable = min(15, 10) = **10** days. Rate ₹1,000/day → **₹10,000**.

| ID | Rule |
|---|---|
| LV-ENC-01 | Leave type must allow encashment. |
| LV-ENC-02 | Employee must have an allocation of that type covering the encashment date. |
| LV-ENC-03 | For payroll payout, a salary structure must be assigned on the encashment date and the type must have an earning component. |
| LV-ENC-04 | Amount must be > 0 to submit. |
| LV-ENC-05 | Paid amount can never exceed encashment amount. |

**Side effects on submit.** Either (a) an **additional salary** line for the earning component on the encashment date (paid in the next payroll), or (b) accounting entries: debit expense account, credit employee payable (paid later by payment entry). Allocation's "total encashed" increases. Ledger **−** line on the encashment date (plus the same "already-expired offset" as §2.7). Cancel reverses all of it.

**Auto-encashment (HR Settings switch).** Daily job: for every allocation of an encashable type that **ended yesterday**, create a **draft** encashment on the allocation end date — only for employees with a salary structure.

**Source:** `hrms/hr/doctype/leave_encashment/`, `hrms/hr/utils.py`

---

### 2.12 Compensatory Leave Request (comp-off)

**Purpose.** Employee worked on holiday(s) → earns leave.
**Who.** Employee requests; HR submits.

**Data.** Employee, Leave Type (comp-off type), Work from, Work to, Half day + date, Reason (required), resulting allocation.

| ID | Rule |
|---|---|
| LV-CO-01 | Work dates: To ≥ From; not in the future; not before joining; not after relieving. |
| LV-CO-02 | Half day requires a half-day date inside the work range. |
| LV-CO-03 | No overlap with another non-cancelled comp-off request of the employee. |
| LV-CO-04 | **Every** work date must be a holiday in the employee's holiday list. |
| LV-CO-05 | Every work date must have submitted attendance of Present / WFH / Half Day. |
| LV-CO-06 | If attendance on a date is Half Day, the request must be a half-day request on that date. |
| LV-CO-07 | Leave type is required. |

**On submit.** Days earned = work days (inclusive) − 0.5 if half day. Comp-off is valid **from the day after the last work date**. An active leave period must cover that date (else error asking HR to create one). If an allocation of that type already covers that date, it is increased; otherwise a new allocation is created from that date to the leave period end (carry forward per the type's setting).
**On cancel.** The allocation is reduced (never below 0) and a matching **−** ledger line is written.

**Source:** `hrms/hr/doctype/compensatory_leave_request/`

---

### 2.13 Leave Adjustment

**Purpose.** HR corrects an allocation up or down with a reason (e.g. migration, error fix).
**Data.** Employee, Leave Type, allocation (with its dates and current days), posting date, type (Allocate / Reduce), days, days after adjustment, reason.

| ID | Rule |
|---|---|
| LV-ADJ-01 | Only **one** submitted adjustment per allocation; to change it, amend the existing one. |
| LV-ADJ-02 | Days must be non-zero. |
| LV-ADJ-03 | Allocate: new total must not exceed the type's max allocation. |
| LV-ADJ-04 | Reduce: days must not exceed the balance on the posting date. |

**Ledger.** **+** or **−** line spanning the allocation dates; reversed on cancel.

**Source:** `hrms/hr/doctype/leave_adjustment/`

---

### 2.14 Holiday lists & assignment

A **Holiday List** (from ERPNext) is a named set of dates, each flagged as weekly-off or holiday, with a validity range. HRMS adds **Holiday List Assignment**: assign a list to an **Employee** or a **Company** from a start date.

| ID | Rule |
|---|---|
| LV-HOL-01 | Assignment start must be within the holiday list's own date range. |
| LV-HOL-02 | Only one submitted assignment per assignee per start date. |
| LV-HOL-03 | Lookup on a date: the employee's latest assignment starting on/before that date; if none, the company's; if none → error telling HR to assign one. |
| LV-HOL-04 | When a range spans two lists (assignment changed mid-range), each part uses its own list. Gaps in employee assignments are filled from the company list. |
| LV-HOL-05 | Editing a holiday list clears the payroll holiday cache. |

**Source:** `hrms/hr/doctype/holiday_list_assignment/`, `hrms/utils/holiday_list.py`

---

### 2.15 Leave Block List

**Purpose.** Stop leave on critical dates.
**Data.** Name, Company, "applies to whole company" flag, optional Leave Type, dates (each with reason), users allowed to approve anyway.

| ID | Rule |
|---|---|
| LV-BLK-01 | No repeated dates in one list. |
| LV-BLK-02 | A list applies to an employee if it is company-wide (for their company), or if it is the list set on their department. |
| LV-BLK-03 | A list with a leave type applies only to applications of that type; without a type, to all. |
| LV-BLK-04 | Users in the list's allowed-users table are exempt when approving. |
| LV-BLK-05 | Helper: add all given weekdays between two dates as block dates with one reason. |

Effect: warning when applying; approval blocked (LV-APP-11).

**Source:** `hrms/hr/doctype/leave_block_list/`

---

### 2.16 Leave Control Panel (bulk allocation)

**Purpose.** Allocate leave to many employees at once.
**Filters.** Company, employment type, branch, department, designation, grade + any advanced filter; only **Active** employees.
**Dates based on.** Leave Period / Joining Date (start = each employee's joining) / Custom range.
**Mode.** By policy (creates policy assignments) or by one leave type + number of days (creates allocations). Carry forward defaults **on**.

| ID | Rule |
|---|---|
| LV-BULK-01 | Required fields depend on mode (period / to-date / from+to; policy / type+days). |
| LV-BULK-02 | Employee list excludes anyone who already has a submitted allocation overlapping the range for the relevant type(s). |
| LV-BULK-03 | Each employee is processed independently; failures are rolled back individually and reported; results pushed live to the screen. |

**Source:** `hrms/hr/doctype/leave_control_panel/`

---

### 2.17 Approvers & notifications

- **Default approver** = the approver on the employee record; else the **first** leave approver listed on the employee's department.
- **Approver picker** offers: the employee's own approver + leave approvers of their department **and all parent departments**.
- Approver needs the **Leave Approver** role; the application is shared with them so they can open it.
- Emails use templates set in HR Settings; if a template is missing, the user sees a prompt and no email is sent. Per-application "follow via email" toggle.
- Multi-level approval is **not** built in; it is possible only through the generic workflow engine.

**Source:** `hrms/hr/doctype/department_approver/`, `leave_application/`

---

### 2.18 Integration — Attendance

| ID | Rule |
|---|---|
| LV-ATT-01 | Approving leave creates/updates attendance per day (On Leave / Half Day) — see §2.7. |
| LV-ATT-02 | When attendance is marked manually on a date covered by approved leave, its status is forced to On Leave (or Half Day on the half-day date) and linked to the leave. |
| LV-ATT-03 | Attendance marked On Leave / Half Day without any approved leave is kept but flagged (half-day other half set to Absent) with an alert. |
| LV-ATT-04 | Leave cannot be applied over days already marked Present/WFH (LV-APP-13). |

---

### 2.19 Integration — Payroll

Payroll counts unpaid days in one of two modes (Payroll Settings → "working days based on"):

**Mode A — Leave (default).** For each working day in the pay period, look at approved LWP/PPL applications not yet linked to a salary slip:
- skip holidays unless the leave type includes holidays; stop after the relieving date;
- full day = 1; half day = (1 − half-day paid fraction, default 0.5);
- PPL: multiply by (1 − paid fraction).

**Mode B — Attendance.** For each submitted attendance record:
- On Leave with an LWP/PPL type → 1 (PPL: × paid fraction — see defect D1);
- Half Day with LWP/PPL type → (1 − half-day fraction) (PPL: × paid fraction);
- Absent → counted as absent;
- holidays skipped unless "consider marked attendance on holidays" is on.

**Payment days** = days in period (minus holidays unless holidays are included in working days) − unpaid leave days (− absents in mode B, − unmarked days if they're treated as absent).

> **Example (mode A).** 30-day month, holidays excluded (8), so 22 working days. Employee took 2 LWP days and 2 PPL days at 50% pay. Unpaid = 2 + 2 × 0.5 = 3. Payment days = 22 − 3 = **19**.

Optional: show leave balances on the salary slip (Payroll Settings).

**Source:** `hrms/payroll/doctype/salary_slip/` (working-days and LWP sections)

---

### 2.20 Scheduled jobs

| Job | Frequency | Does |
|---|---|---|
| Expire allocations | Daily (long) | §2.10 |
| Auto-encashment | Daily (long) | §2.11 — only if the HR Settings switch is on |
| Earned-leave accrual | Daily (long) | §2.6 |

---

### 2.21 Reports, dashboards, calendar, mobile

| Report / view | Shows |
|---|---|
| Employee Leave Balance | Per employee × type for a date range: opening, allocated, taken, expired, closing. Opening = balance the day before the start (only carried days if the start is exactly an allocation boundary). Closing = opening + allocated − (taken + expired). Filters: dates, company, department, employee, employee status, consolidate types. |
| Employee Leave Balance Summary | Balance per type on a single date. |
| Leave Ledger | Every ledger line with filters. |
| Employees Working on a Holiday | Attendance on holiday dates (input for comp-off). |
| Number cards | Holidays this month; employees on leave today / this month. |
| Chart | Leave applications by type. |
| Leave calendar | Own + department colleagues' Open/Approved leave, block dates, holidays. HR setting can show all department members regardless of permissions. |
| Mobile PWA | Leave dashboard (balances), apply-leave form, list of my/team applications, approve from mobile, holiday list, push notifications. |

---

### 2.22 Settings reference

**HR Settings — Leave**

| Setting | Default | Effect |
|---|---|---|
| Send leave notifications | on | Emails to approver/employee |
| Approval notification template | — | Email to approver |
| Status notification template | — | Email to employee |
| Approver mandatory | on | LV-APP-17 |
| Show all department members in calendar | off | Calendar visibility |
| Auto leave encashment | off | Daily job §2.11 |
| Restrict back-dated applications | off | LV-APP-02 |
| Role allowed for back-dated applications | — | LV-APP-02 |
| Prevent self-approval | off | LV-APP-16 |

**Payroll Settings — leave-related:** working days based on (Leave / Attendance), include holidays in working days, half-day paid fraction (0.5), consider attendance on holidays, show leave balances on slip.

---

### 2.23 Permissions (default roles)

| Object | Employee | Leave Approver | HR User | HR Manager |
|---|---|---|---|---|
| Leave Type | read | — | full (no submit) | full |
| Leave Period / Policy / Assignment | — | — | full | full |
| Allocation | — | — | full | full |
| Application | create, edit own, read | read, edit, submit, cancel | full | full |
| Encashment | create/edit draft | — | full | full |
| Comp-off request | create/edit draft | — | full | full |
| Adjustment | — | — | full | full |
| Block List | — | — | create/edit | create/edit |
| Holiday List Assignment | — | — | — | full |

Access helper: balance/leave-day lookups are allowed only for the employee themself, their approver, or users with read access to that employee.

---

## 3. Suspected defects — verify on the running instance

Frappe has these, so YukthiX should **not** copy them. Test each on `hrms.localhost` before concluding.

| # | Area | Suspicion | How to test |
|---|---|---|---|
| D1 | Payroll, attendance mode | For partially-paid leave, leave mode deducts (1 − paid fraction) but attendance mode deducts (paid fraction). With 75 % paid, one mode deducts 0.25 day, the other 0.75 day. | PPL type at 0.75; one day's leave; run a salary slip in each mode; compare payment days. |
| D2 | Policy assignment | Allocations created from an assignment "based on Leave Period" seem never to store the leave period link. Auto-encashment copies that link into a field that is required → auto-created encashments may fail silently. | Assign by leave period, open the allocation, check the leave period field; let it end with auto-encashment on and check for drafts. |
| D3 | Rounding | Earned-leave rounding sends halfway values to the nearest even number (2.5 → 2, 3.5 → 4). Probably unintended for HR. | Annual 30, monthly, rounding 1 → share 2.5; check credit. |

---

## 4. Gap analysis vs YukthiX spec §1.3.3

Our spec lists: *leave types, accrual and balances · approvals and delegation · holiday calendars per location*.

| Capability | Frappe | YukthiX spec | Note |
|---|---|---|---|
| Leave types with rules | ✅ rich | ✅ | Use §2.1 catalogue as the baseline. |
| Accrual (monthly/quarterly/…) | ✅ | ✅ | |
| Balances via ledger | ✅ | ✅ (implied) | 💡 Adopt ledger design. |
| Carry forward + expiry | ✅ | ❌ not explicit | Add to spec. |
| Encashment (payroll or payment) | ✅ | ❌ not explicit | Add; link to F&F §1.3.13. |
| Comp-off | ✅ | ❌ | Add. |
| Leave adjustment with reason | ✅ | ❌ | Add (also used for migration §2.1.11). |
| Block dates | ✅ | ❌ | Add. |
| Optional / restricted holidays | ✅ (via leave type + list) | ❌ | Add, with "choose N of M" quota. |
| Holiday calendars **per location** | ⚠️ only per employee or company | ✅ | **Better:** assign by location/branch/legal entity. |
| **Delegation** (approver out of office) | ❌ | ✅ | Must build. |
| Multi-level approval | ⚠️ generic workflow only | ✅ via §2.1.4 | Use our workflow engine. |
| True **sandwich rule** (count a holiday only when leave is on both sides) | ❌ (all-or-nothing per type) | ❌ | 💡 Common India SMB policy — add. |
| First half / second half | ❌ | ❌ | Add. |
| Hourly / short leave / permission hours | ❌ | ❌ | Add. |
| Eligibility (gender, marital status, employment type, probation) | ❌ | ❌ | Needed for maternity/paternity. |
| Mandatory attachment (e.g. medical certificate after N days) | ❌ | ❌ | Add. |
| Minimum notice, max applications per month | ❌ | ❌ | Add. |
| Comp-off expiry window (use within N days) | ❌ | ❌ | Common in India — add. |
| Employee-initiated cancellation / withdrawal after approval | ❌ (HR cancels) | ❌ | Add with approval. |
| Accrual based on days worked (e.g. 1 EL per 20 days worked) | ❌ | ❌ | Needed for Factories Act / state S&E Acts. |
| Accrual reduced by LOP days | ❌ | ❌ | Add. |
| Encashment rate formula (e.g. Basic ÷ 26 or ÷ 30) | ❌ (fixed per-day amount) | ❌ | Add — ties to payroll. |
| Leave year per legal entity / location | ⚠️ per company | ❌ | Add. |
| Statutory templates (Maternity 26 weeks, state S&E carry-forward caps, state festival holidays) | ❌ | ❌ | India pack, §2.1.6. |
| Year-end processing wizard (preview → carry forward + encash + lapse) | ❌ (three separate jobs) | ❌ | 💡 Strong UX win. |
| Team availability when approving ("who else is off") | ⚠️ calendar only | ❌ | 💡 Show inline in approval. |
| Balance projection ("what will I have on 1 Dec") | ❌ | ❌ | 💡 Nice-to-have. |

---

## 5. YukthiX design decisions (all 6 answered 23 Sep 2026)

**Scope (23 Sep 2026):** every "Add" and 💡 item in §4 is **in scope for the first release** (option A). `spec.md` §1.3.3 updated accordingly.

1. Leave year: calendar year, financial year (Apr–Mar), or per employee's joining anniversary — or all three?
   **✅ Decided (23 Sep 2026):** Configurable leave year per company / legal entity — calendar year, financial year, or any custom start month. Per-employee anniversary year is **deferred**; add only on customer demand.
2. Should holidays be counted per **location** only, or also per shift/roster (links to §1.3.4)?
   **✅ Decided (23 Sep 2026):** Holiday list follows the employee's **work location**, with an optional per-employee override. Weekly offs by shift/roster are **deferred to module 02 (Attendance & Shifts)**.
3. Sandwich rule: which variants do we support (weekends only / holidays only / both / only when leave is on both sides)?
   **✅ Decided (23 Sep 2026):** Configurable **per leave type**: mode = None / Sandwich (holiday counted only when leave is on both sides) / Always (every holiday in range counted). Sub-settings: applies to weekly offs, public holidays, or both; whether a half day adjacent to a holiday triggers the sandwich.
4. Rounding rule for accrual: always half-up? configurable?
   **✅ Decided (23 Sep 2026):** Configurable **per leave type**: none (2 decimals) / nearest 0.25 / 0.5 / 1, halfway values always round **up**. Year-total guarantee: the last accrual of the leave year trues up so the year's credits equal the (pro-rated) annual entitlement exactly — rounding never gains or loses days over a year.
5. Encashment: payroll only, or also a standalone payout? At year end, on exit, or on request?
   **✅ Decided (23 Sep 2026):** Three triggers, each enabled **per leave type**: (a) on exit — automatic into F&F (§1.3.13); (b) year end — auto-drafted in the year-end wizard for HR review; (c) employee request during the year — through approval. Per-day rate = **formula per leave type**: sum of selected salary components (e.g. Basic + DA) ÷ divisor (26 / 30 / actual days in month), evaluated on the encashment date so salary revisions are picked up. Paid through payroll as a taxable earning by default; standalone payout allowed for exit / off-cycle.
6. Do we allow negative balances as "advance leave" recovered from F&F?
   **✅ Decided (23 Sep 2026):** Allowed **per leave type** with a configurable maximum negative (e.g. −3). Future accruals repay the negative first. On exit, any remaining negative is **deducted in F&F** at the leave type's encashment-rate formula (Q5). Option per type to instead convert excess days to LWP in payroll.

---

## 6. Source pointers (for verification only)

| Area | Path in `hrms-develop/hrms` |
|---|---|
| Leave types | `hr/doctype/leave_type/` |
| Periods, policies, assignments | `hr/doctype/leave_period/`, `leave_policy/`, `leave_policy_detail/`, `leave_policy_assignment/` |
| Allocations & accrual schedule | `hr/doctype/leave_allocation/`, `earned_leave_schedule/` |
| Applications | `hr/doctype/leave_application/` |
| Ledger & expiry | `hr/doctype/leave_ledger_entry/` |
| Encashment, comp-off, adjustment | `hr/doctype/leave_encashment/`, `compensatory_leave_request/`, `leave_adjustment/` |
| Block lists, bulk tool | `hr/doctype/leave_block_list*/`, `leave_control_panel/` |
| Holidays | `hr/doctype/holiday_list_assignment/`, `utils/holiday_list.py` |
| Shared helpers & scheduled jobs | `hr/utils.py`, `hooks.py` |
| Settings | `hr/doctype/hr_settings/`, `payroll/doctype/payroll_settings/` |
| Payroll integration | `payroll/doctype/salary_slip/` |
| Attendance integration | `hr/doctype/attendance/` |
| Reports | `hr/report/employee_leave_balance*/`, `leave_ledger/`, `employees_working_on_a_holiday/` |
| Mobile | `frontend/src/views/leave/`, `frontend/src/components/Leave*.vue` |
