# P06 · Effective-Dated History & Scheduled Changes

> **Status:** ✅ Decided, 25 Sep 2026. All 8 questions answered (§11).
> **Covers:** gap summary "effective-dated job history + scheduled changes" (Frappe keeps history only for department / designation / branch and can't future-date promotions or transfers; mid-month salary revision), spec §1.3.1, module 05 U52/U54, analytics "as on date" (11-analytics §6).
> **Builds on:** P01 (employment + assignment tables), P03 (changes approved as requests), P08 (period locks, next).

---

## 1. Purpose & scope
HR data changes over time, and many questions depend on **when**:
- Who was Priya's manager on 1 Jul?
- What was Arjun's CTC in August?
- Which state's PT applied to Rahul in October?
- Promotion approved today, effective 1 Oct: apply it automatically on that day.
- HR discovers Meera's bank account was wrong since 1 Sep: fix it without losing what payroll actually used.

This doc defines one pattern for **dated facts**, **scheduled changes** and **corrections**, used by every module.

**Out of scope:** payroll arrears maths (module 03 design, which consumes this); lock rules (P08).

---

## 2. What exists today

| Where | Today |
|---|---|
| Exam app | No effective dating. `AuditLog` records that a row changed (actor, metadata), not what was true on a date |
| Frappe (reference) | Internal work history only for department / designation / branch; promotion/transfer can't be future-dated; salary assignment dated but mid-month changes awkward (gap summary; module 05 U52) |
| YukthiX P01 | `employee_assignments` with `valid_from` / `valid_to` + no-overlap constraint: the first dated fact |

---

## 3. Concepts

| Term | Meaning |
|---|---|
| **Dated fact** | A value that is true for a period: *Arjun's designation = Manager from 24 Sep 2026*. Stored as a row with `valid_from` / `valid_to` |
| **Effective date** | The business date a change takes effect (a calendar date in the employee's location) |
| **Recorded time** | When YukthiX learned or stored the fact (system timestamp) |
| **Change** | A request to alter one or more dated facts from an effective date, e.g. "promotion: designation + grade + CTC from 1 Oct". It goes draft → approved (P03) → scheduled → effective |
| **Future-dated change** | A change whose effective date is after today; applied automatically on that day |
| **Correction** | A change that rewrites what *should* have been true in the past (retro). The original is kept as superseded |
| **As-on query** | "Give me the facts for employee X on date D", as believed now, or as believed at time T (Q1) |

---

## 4. Design

### 4.1 Which facts are dated (Q2)

| Fact | Table | Notes |
|---|---|---|
| Assignment: location, department, designation, grade, manager, employment type, cost centres | `employee_assignments` (P01) | Promotion, transfer, reorg |
| Employment status milestones: probation → confirmed, notice period, exit | `employments` + dated status rows | Confirmation date, notice start |
| **Compensation**: CTC, salary structure, component amounts | `compensations` (module 03) | Revisions, increments, arrears |
| **Grade pay ranges** | `grade_pay_ranges` (P01) | Min / mid / max per grade × entity by period; comp review (M06 Q6) |
| **Bank account for salary** | `employee_bank_accounts` | Change approved + cooling period (P02 YX-SEC-13) → effective date |
| **Tax regime / declarations period** | `employee_tax_settings` | Regime per FY |
| **Statutory flags**: PF applicable, VPF, ESI coverage, PT/LWF exemption, disability | `employee_statutory` (module 03) | Drive payroll by period |
| **Shift / roster pattern** | module 02 | Weekly-off and shift rules by period |
| **Leave policy assignment** | module 01 | Entitlement changes by date |
| **Legal name** | `employee_legal_names` | Dated (e.g. after marriage) for letters and statutory filings |
| **Absence status** (E3) | `employee_absence_status` | Sabbatical, long LWP, maternity, long-term disability, suspension: `status`, `valid_from`, `expected_return_on`, actual return closes the row. Drives expected attendance (P08 YX-LOCK-07), accrual pause, zero-wage months and return-to-work tasks |
| **Gender, marital status** (E3) | `employee_personal_status` | Dated: gender drives PT gender slabs (P07) and leave eligibility; a marital-status change re-prompts nominee / beneficiary review |
| **Contract end date** (E6) | `employments.contract_end_on` + dated status rows | Fixed-term, intern, apprentice (P01); changed only by an extension or conversion change |

**Not dated but versioned** (history kept, no effective date): contact details, address, emergency contacts, photo, preferences. Their audit history (P08) answers "what was it before".

### 4.2 Storage pattern (same for every dated table)

Common columns:
- `valid_from date NOT NULL`, `valid_to date NULL` (open-ended);
- `change_id` (the change that created it);
- `recorded_at timestamptz`, `superseded_at timestamptz NULL`, `superseded_by_change_id` (Q1).

Constraints and helpers:
- **No overlaps among current rows**: `EXCLUDE USING gist (subject_id WITH =, daterange(valid_from, valid_to, '[]') WITH &&) WHERE (superseded_at IS NULL)`.
- **No gaps** where continuity is required (assignment, compensation, statutory settings), checked on write (YX-HIS-03).
- Views `*_current` (valid today, not superseded) and functions `*_as_of(subject, date)`, **all RLS-bound** (P01) and visibility-filtered (P02).

### 4.3 Changes (the only way dated facts are written)
A change is a registered **request type** (P03) carrying:
- effective date;
- the new values per fact;
- reason (promotion / annual increment / transfer / correction / data import…);
- attachments (letter);
- **impact preview**: what else changes (holiday calendar, PT state, approver chain, leave policy, payroll proration), as in module 05 §1.3.

**Life cycle:**
```
draft → pending approval (P03) → approved
      → if effective date ≤ today: applied now (retro rules if in the past)
      → else: scheduled → applied by the daily job on the effective date
```
- **Applying** = closing the current rows at `effective_date − 1` and inserting new rows from `effective_date`, in one transaction. Then emit `employee.change.effective` events (P04 notifications, P09 metrics, P02 grant recomputation).
- The **daily job** runs at the start of the day in each employee's location time zone (Q3). It is idempotent, so re-running doesn't double-apply.

### 4.4 Future changes
- Several future changes can be queued for one person (e.g. transfer 1 Oct, increment 1 Nov); they are applied in date order.
- **Inserting** a change dated before an already-scheduled one rebases the later change onto the new values (e.g. an increment scheduled for 1 Nov keeps its % but applies on the new base). The HR user sees a warning with the before/after.
- **Editing or cancelling** a scheduled change is allowed until it becomes effective (Q7). Editing a routing field (amount, effective date, grade…) sends it back for approval (P03 Q7 logic); cancelling needs a reason and notifies the approvers.

### 4.5 Corrections (retro changes)
- A change dated in the past **supersedes** the rows it replaces (`superseded_at` + link); nothing is deleted (Q1).
- If the correction touches a period with **processed payroll** (or locked attendance), the original payslips stay as issued; payroll computes **arrears or recoveries** in the next run from the difference between "as paid" and "as corrected" (Q4).
- How far back and who may correct: Q5; locked periods follow P08.
- The timeline shows both: "Designation corrected on 5 Oct by Vikram: was Analyst, should have been Senior Analyst from 1 Aug (reason…)".

### 4.6 Mid-period changes
When a change takes effect inside a pay period (a salary revision on 15 Sep), payroll receives **segments** (1–14 Sep old values, 15–30 Sep new values) from the as-on API. The pay period is then split by effective date, and each segment is prorated by that module's rule. The method is company policy per change type (Q6): segments (default), whole-month cut-off, or next month + arrears. Attendance, leave and statutory modules use the same segment API.

### 4.7 Reading history
- **As-on API:** `asOf(employee, date)` returns the full set of dated facts; `segments(employee, from, to)` returns the periods where any relevant fact changed.
- **Payroll snapshot:** each payroll run freezes the inputs it used (the as-on result per employee), stored with the rule-pack version on `payslips` / `payslip_lines` (M03 §4). Payslips can always be reproduced even after later corrections.
- **Profile "view as of date"**: the employee workspace can show the profile as it was on any past date, or as it will be on a future date (scheduled changes shown in a different style).

---

## 5. Data model (common pieces)

| Table | Key columns |
|---|---|
| `employee_changes` | `organization_id`, `employee_id`, `employment_id`, `change_type` (promotion / transfer / revision / confirmation / absence start / return / contract extension / conversion to permanent / retirement extension / re-employment / correction / import…), `effective_date`, `status` (draft / pending / approved / scheduled / effective / cancelled), `payload jsonb` (new values per fact), `impact jsonb`, `reason`, `approval_request_id`, `applied_at`, `rebased_from_change_id` |
| dated fact tables (§4.1) | fact columns + common columns (§4.2) |
| `payslips` / `payslip_lines` (module 03 §4) | store the inputs used (as-on result + segments) and the rule-pack version per employee per run; no separate snapshot table |

---

## 6. Rules

| ID | Rule |
|---|---|
| YX-HIS-01 | Dated facts are written only through changes; no direct edits of dated tables. |
| YX-HIS-02 | Current rows of a dated fact never overlap for the same subject (DB constraint). |
| YX-HIS-03 | Facts that need continuity (assignment, compensation, statutory settings) have no gaps between joining and exit. |
| YX-HIS-04 | Effective dates are calendar dates in the employee's location; scheduled changes apply at the start of that day in that time zone. |
| YX-HIS-05 | Applying a change closes and opens rows in one transaction and emits `employee.change.effective`; the daily job is idempotent. |
| YX-HIS-06 | A new change dated before a scheduled change rebases the later one; the user sees the recalculated values before confirming. |
| YX-HIS-07 | Retro changes supersede, never delete; superseded rows stay queryable with who, when and why. |
| YX-HIS-08 | Issued payslips are never altered by corrections; differences flow to the next payroll as arrears/recoveries (Q4). |
| YX-HIS-09 | Payroll runs freeze their inputs (as-on snapshot + segments) so any payslip can be reproduced. |
| YX-HIS-10 | As-on and segment queries respect tenant RLS and P02 visibility, including P02's time-bound manager access. |
| YX-HIS-12 | Past-dated changes are classified by reach: open payroll period (normal approval), processed payroll (correction request incl. Payroll Admin), before the tenant's retro limit (default: FY start; System Admin override with reason). |
| YX-HIS-13 | Mid-period treatment follows the tenant's policy per change type (and optionally per component): segments (default), whole-month cut-off day N, or next-month + arrears; statutory computations always use the legally required basis. |
| YX-HIS-14 | Absence status (sabbatical, long LWP, maternity, long-term disability, suspension), gender and marital status are dated facts written only through changes. Absence rows carry start and expected return; the impact preview shows the effects (expected attendance, accrual pause, zero-wage months; PT gender slab and leave eligibility for gender; nominee re-prompt for marital status). |
| YX-HIS-15 | Lifecycle change types **contract extension**, **conversion to permanent**, **retirement extension** and **re-employment** are dated changes: extension moves `contract_end_on` / the superannuation date; conversion changes employment type (and its P01 YX-ORG-20 statutory defaults) from the effective date; re-employment after retirement follows P01 YX-ORG-19 with the retired re-employed type. |
| YX-HIS-11 | Every change shows an impact preview before approval (derived effects on calendars, statutory state, approvers, leave policy, payroll proration). |

---

## 7. UI
- **Employee workspace › Timeline:** chronological changes (past, current, scheduled), filters by fact; each entry opens the change with its approval trail, letter and diff; corrections are visibly marked.
- **"Change" action** (module 05): pick change type → effective date → new values → impact preview → submit for approval.
- **As-of date picker** on the profile ("View as on 1 Jul 2026").
- **Scheduled changes** list for HR (next 30/60/90 days), with edit/cancel.
- **Bulk changes** (annual increment, reorg): the wizard (T5) creates many changes with one approval, previewing each person.

---

## 8. Migration
- The exam app has no HR data. On go-live, customers **import** current facts with an "import" change at their joining date or a cut-over date, optionally with past history rows for the current FY (for payroll YTD and analytics).
- Opening balances for payroll (YTD) are handled in module 03, not as fake history.

---

## 9. Acceptance tests (samples)
- A promotion approved on 24 Sep with effective date 1 Oct appears as "scheduled"; on 1 Oct at 00:00 IST the designation and grade change, the manager chain and approvals update, and the employee is notified (YX-HIS-04/05).
- A salary revision effective 15 Sep produces two segments in the September payroll (YX-HIS-§4.6).
- Correcting the bank account retro to 1 Sep after September payroll was paid leaves the September payslip unchanged and flags the payout discrepancy for HR/payroll (YX-HIS-08).
- Inserting a transfer on 15 Oct before a scheduled 1 Nov increment shows the rebased increment for confirmation (YX-HIS-06).
- The daily job re-run on the same day makes no duplicate rows (YX-HIS-05).
- "View as on 1 Aug" shows Arjun as Business Development Manager; today shows Manager (§4.7).

---

## 10. Open questions (answer one at a time)

| # | Question | Recommendation |
|---|---|---|
| Q1 | When the past is corrected, keep the old version ("what we believed before")? | **Yes: keep superseded versions** of dated facts (bitemporal-lite). Payslips and audits stay explainable; storage cost is small. |
| Q2 | Which facts are effective-dated at launch? | The list in §4.1 (assignment, employment milestones, compensation, salary bank account, tax regime, statutory flags, shift, leave policy, legal name); contact/address are versioned, not dated. |
| Q3 | When do scheduled changes apply? | **Start of the effective day in the employee's location time zone** (00:00 IST for Indian locations). |
| Q4 | A retro change affects an already-processed payroll: what happens? | **Arrears/recoveries in the next payroll run**; past payslips never altered. Re-opening a processed payroll is a separate, exceptional P08 action. |
| Q5 | Who can make past-dated changes, and how far back? | HR with `employee.change.retro`; within the **current open payroll period** needs normal approval; **older than that** goes through a correction approval (Payroll Admin involved); limit = current financial year by default (tenant can widen). |
| Q6 | Mid-period change: how are the old and new values split? | **Segments by effective date**, each prorated by the module's rule (payroll: by payment days in each segment). |
| Q7 | Can a scheduled (future) change be edited or cancelled? | **Yes, until its effective date**; editing a field that routed its approval (e.g. CTC amount) sends it back for approval (P03 Q7 logic). |
| Q8 | Is a legal name change effective-dated? | **Yes** (letters and statutory filings use the name valid on their date); preferred / display name is a plain editable field. |

## 11. Decisions

| # | Decision | Date |
|---|---|---|
| Q1 | **Keep superseded versions** (bitemporal-lite): corrections mark replaced rows `superseded_at` / `superseded_by_change_id`, never delete. As-on queries default to "as corrected now", with an option "as recorded at time T". | 24 Sep 2026 |
| Q2 | **Dated facts at launch = §4.1 list:** assignment (incl. cost centres), employment milestones, compensation, salary bank account, tax regime, statutory flags, shift/roster pattern, leave policy assignment, legal name. Contact details, address, emergency contacts and photo are versioned (history) but not effective-dated. | 24 Sep 2026 |
| Q3 | **Scheduled changes apply at 00:00 of the effective date in the employee's location time zone** (from the assignment's location, P01), via the idempotent daily job (YX-HIS-04/05). | 24 Sep 2026 |
| Q4 | **Retro corrections never alter issued payslips**; the difference (as paid vs as corrected) is computed as **arrears or recoveries in the next payroll run**, itemised per month with the reason, with tax recomputed. Reopening a processed payroll remains only an exceptional P08 admin action. Recovery limits are set in the payroll module design. | 24 Sep 2026 |
| Q5 | **Retro changes are tiered:** (1) within the current open payroll period → HR with `employee.change.retro`, normal approval; (2) touching processed payroll → **correction request** that adds a Payroll Admin approval step; (3) default limit = start of current financial year (tenant can widen); older → System Admin override with mandatory reason, audited. Rule YX-HIS-12. | 24 Sep 2026 |
| Q6 | **Mid-period changes: method chosen by company policy**, per change type (and optionally per salary component): (1) **split into segments** at each effective date, each prorated by the module's rule (default); (2) **whole-month cut-off**: change on/before day N applies to the whole month, later changes from next month; (3) **from next month + arrears** for the partial month. Statutory items keep legally required treatment regardless (e.g. PF/ESI ceilings per segment, PT per state rule). Leave, attendance and statutory use the same `segments()` API. Rule YX-HIS-13. | 25 Sep 2026 |
| Q7 | **Scheduled changes can be edited or cancelled until their effective date.** Minor edits save with a timeline entry; editing a routing field (amount, effective date, grade) sends it back for approval (P03 Q7 logic); cancellation needs a reason and notifies the approvers. | 25 Sep 2026 |
| Q8 | **Legal name is effective-dated**, changed through an approved change with proof and effective date; letters, payslips and statutory filings use the legal name valid on their date. **Display / preferred name** is a plain field the employee can edit any time (shown to colleagues). | 25 Sep 2026 |
| E3/E6/E7 | **More dated facts and lifecycle change types.** Absence status (sabbatical, long LWP, maternity, long-term disability, suspension) is a dated fact with start and expected return; gender and marital status become dated facts (PT gender slabs, leave eligibility, nominee re-prompt); contract end date is dated. New change types: contract extension, conversion to permanent, retirement extension, re-employment. Rules YX-HIS-14, YX-HIS-15. | 26 Sep 2026 |
