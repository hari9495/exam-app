# 03 · Payroll Engine — Functional Reference

**Source studied:** Frappe HR, `develop` branch (downloaded 23 Sep 2026), folder `hrms-develop/hrms/payroll` (43 doctypes, 10 reports, ~9,000 lines) plus `hrms/regional`
**Maps to YukthiX:** §1.3.5 Payroll (with §1.3.6 Benefits, §1.3.13 F&F, §1.4.8 Payroll analytics)
**Clean-room status:** written in our own words; no code, identifiers or UI text copied. Verify behaviour on the running Frappe instance, not by reading source.
**Data dictionary:** every object and field → [03-payroll-engine.data-dictionary.md](03-payroll-engine.data-dictionary.md)
**Not covered here:** payment days / LWP (module 01 §2.19, module 02 §2.11); India PF / ESI / PT / LWF / TDS return filing / Form 16 (module 04, from `india-payroll`).

---

## 0. How it works — the big picture

```
SETUP (Part A)
 Salary Component ──► Salary Structure (template: rows with condition / formula / amount, frequency)
                          │
                          ▼
 Salary Structure Assignment  = employee × structure × from-date  + base, variable, tax slab, cost centres, opening tax
                          │                                           │
 Payroll Period (tax year) ┘          Income Tax Slab (regime) ◄──────┘
                                                                         
MONTHLY RUN (Parts B, C)
 Payroll Run ──► picks employees ──► one Salary Slip each ──► submit ──► Accrual journal (expense Dr / payable Cr)
                                          ▲                                  │
     Additional Salary (the single door) ─┤                                  ▼
       ◄─ incentives, retention bonus, overtime, arrears, LWP corrections,   Bank entry (payable Dr / bank Cr)
          leave encashment, gratuity, benefit claims, advance recovery        ◄─ Salary Withholding holds some slips
     Leave & attendance ─► payment days ─┤
     Tax declarations / proofs ─► TDS ───┤
     Flexible benefits ─► accruals ──────┘ ──► Benefit Ledger

YEAR-END / EXIT (Part D)
 Proofs → final TDS true-up · Gratuity · Reports (register, bank file, tax computation, PF/PT, CTC break-up)
```

**Key ideas worth keeping in YukthiX**
1. **Formula-driven structures** — pay rules as expressions over base, variable, other components and employee attributes. 💡 Keep, but with a safer evaluator and a formula tester.
2. **Everything extra goes through one door (Additional Salary).** 💡 Keep: one "pay item" object for all non-structure money.
3. **Annual TDS projection spread over remaining months, with a last-month true-up.** Standard Indian practice — keep.
4. **Accounting is generated from the slips** (accrual + payment journals, cost-centre split). 💡 For YukthiX, export to Tally / Zoho Books / QuickBooks (§2.1.13) instead of an in-house ledger.

---

---

## Part A — Setup: components, formulas, structures, assignments, periods, tax slabs

### A.1 Salary Component

**Purpose.** The catalogue of pay heads (earnings, deductions, employer contributions). Each carries default flags and a default condition / formula / amount that structures copy.
**Who.** HR User / HR Manager maintain; employees read.

**Settings catalogue**

| Setting | Meaning | Default |
|---|---|---|
| Name, abbreviation | Abbreviation is the short code used in formulas; auto-built from initials ("House Rent Allowance" → HRA) | required |
| Type | Earning / Deduction / Employer Contribution | required |
| Depends on payment days | Prorated: amount × payment days ÷ working days | **on** |
| Tax applicable (earnings) | Counted in taxable income | on |
| Deduct full tax on selected payroll date | One-off amounts are taxed fully in that slip, not spread | off |
| Do not include in total | Shown on slip but excluded from gross / total deduction (still in CTC) | off |
| Do not include in accounts | Excluded from the payroll journal (only with the above) | off |
| Statistical | Computed and usable by later formulas, but never shown or paid | off |
| Remove if zero | Drop zero rows from the slip | **on** |
| Round to nearest integer | Round the slip amount to whole rupees | off |
| Variable based on taxable salary | This **is** the income-tax (TDS) component; amount always comes from tax slabs | off |
| Exempted from income tax (deductions) | Reduces taxable income (only if the slab allows exemptions) | off |
| Arrear component | Eligible for arrears and LWP corrections | off |
| Accrual component (earnings) | Accrued in a benefit ledger instead of paid in gross | off |
| Flexible benefit + max yearly amount + payout method | Payout: (a) accrue and pay at period end, (b) accrue and pay on claim, (c) claim full amount; option to pay unclaimed in final cycle | off |
| Accounts | GL account per company | — |
| Condition / formula / amount | Defaults copied into structures | — |

| ID | Rule |
|---|---|
| PY-SC-01 | Abbreviations are unique; a clash is silently renamed HRA_1, HRA_2… |
| PY-SC-02 | Warning (not error) if a non-statistical component has no account for some company. |
| PY-SC-03 | Only earnings can be accrual components. Flexible-benefit payout (a)/(b) require accrual on; (c) requires it off. |
| PY-SC-04 | The tax component cannot be an arrear component. |
| PY-SC-05 | Form helpers: earning → tax applicable on; deduction → tax applicable, flexible and accrual off; arrear on → depends on payment days on; flexible benefit / tax component on → clears formula, condition and other flags. |
| PY-SC-06 | "Sync condition / formula" pushes the component's current value into every non-cancelled structure using it (**including submitted ones**, without re-validation). |

**Source:** `hrms/payroll/doctype/salary_component/`

---

### A.2 Condition & formula language

**Capabilities.** Arithmetic, comparisons, and/or/not, inline if-else, literals, date attributes (e.g. year of a date). Built-ins: integer/decimal conversion, round, ceil, floor, min, max, make/parse date, first/last day of month. Nothing else (no abs, sum). Unsafe constructs are blocked (block-list sandbox — trusted admins only).

**Variables available** (later layers override earlier):
1. every component abbreviation (starting at 0);
2. every salary-slip field at default;
3. every structure-assignment field — **base**, **variable**, from date, tax slab, opening balances…;
4. every employee-master field — employment type, branch, grade, gender, date of birth, joining date… (overrides same-named assignment fields);
5. at slip time: actual slip values — **payment days, working days, leave without pay, gross pay**, start/end dates;
6. each component's computed amount as it is evaluated.

**Order.** Earnings (row order) → deductions → employer contributions. **Referring to a component later in the order gives 0.** Gross pay becomes available to deductions. Condition false → row skipped. Formula result rounded to currency precision.

> **Example (base ₹50,000).** Basic = base × 0.5 → ₹25,000 · HRA = Basic × 0.4 → ₹10,000 · Special = base − Basic − HRA → ₹15,000 · PF = min(Basic, 15,000) × 0.12 → ₹1,800 · Intern stipend: condition "employment type = Intern", ₹1,000.

**Source:** `hrms/payroll/utils.py`

---

### A.3 Salary Structure

**Purpose.** Reusable pay template: component rows (condition / formula / amount) + frequency + options.
**Data.** Name, company, currency, active (Yes/No), payroll frequency (Monthly / Fortnightly / Bimonthly = twice a month / Weekly / Daily), timesheet-based flag with timesheet component + hour rate, leave-encashment amount per day, max benefits, earnings / deductions / employer-contribution rows, flexible-benefit rows, mode of payment + payment account.
**Status.** Draft → Submitted → Cancelled → Amend. After submit you can still edit: active flag, letter head, encashment per day, **row conditions and formulas**.

| ID | Rule |
|---|---|
| PY-SS-01 | Each row's payment-days, tax, tax-applicable and flexible flags are re-copied from the component on every save. |
| PY-SS-02 | A row with no amount and no formula gets the component's defaults. |
| PY-SS-03 | Warning if a row has formula text but the formula switch is off. |
| PY-SS-04 | The tax-component row must have no amount and no formula. |
| PY-SS-05 | **Double-proration guard:** a payment-days-dependent row whose formula references another payment-days-dependent row is blocked (it would be prorated twice). |
| PY-SS-06 | Timesheet structures: warning if the timesheet component also appears as an earning row (it will be overwritten). |
| PY-SS-07 | Flexible benefits: no duplicates; each ≤ component's yearly max; total ≤ structure max. |
| PY-SS-08 | Component pickers show only enabled components of the right type linked to the company. |

**Actions.** Create assignment / bulk assignment / tax slab; **preview salary slip** for an assigned employee.

**Source:** `hrms/payroll/doctype/salary_structure/`

---

### A.4 Salary Structure Assignment (SSA)

**Purpose.** Employee × structure from a date, with the employee's **base** and **variable** pay, tax slab, payable account, cost-centre split, opening tax balances; computes annual gross and **CTC**.
**Data.** Employee, structure (defaults from grade), from date, company, currency, base (default from grade), variable, income-tax slab, payroll payable account, cost centres (% table), opening taxable earnings and opening tax deducted, flexible benefits, leave-encashment per day, annual gross, CTC.
**Status.** Draft → Submitted → Cancelled. After submit: cost centres, opening balances and CTC stay editable.

| ID | Rule |
|---|---|
| PY-SSA-01 | One submitted assignment per employee per from date. |
| PY-SSA-02 | From date ≥ joining date and ≤ relieving date. |
| PY-SSA-03 | Structure must be the same company. |
| PY-SSA-04 | If the structure has a tax component, a tax slab is mandatory, in the same currency. |
| PY-SSA-05 | Payable account defaults to the company's payroll payable account. |
| PY-SSA-06 | Cost centres default to 100 % employee's (else department's) payroll cost centre; rows must total exactly 100 and belong to the company. |
| PY-SSA-07 | Opening tax balances are requested (warning) when the assignment starts after the payroll-period start (mid-year joiner / migration). |
| PY-SSA-08 | "Structure on a date" = latest submitted assignment with from date ≤ that date. |

**CTC calculation.** The structure is evaluated for one full cycle with no absences. Periods per year: Monthly 12, Fortnightly 26, Bimonthly 24, Weekly 52, Daily 365.
`Annual gross = gross per period × periods` · `CTC = (gross + "not in total" earnings + employer contributions) × periods`

> **Example.** Basic ₹25,000 + HRA ₹10,000 + Special ₹15,000 = gross ₹50,000; conveyance ₹1,600 (not in total); employer PF ₹1,800. Annual gross **₹6,00,000**; CTC = (50,000 + 1,600 + 1,800) × 12 = **₹6,40,800**.

**Bulk SSA tool.** Pick structure, from date, tax slab, payable account and filters → lists active employees with no assignment on that date → set base / variable per row (default base from grade) → confirm (warning for base 0) → each created independently; > 30 run in background.

**Source:** `hrms/payroll/doctype/salary_structure_assignment/`, `bulk_salary_structure_assignment/`, `employee_cost_center/`

---

### A.5 Payroll Settings

| Setting | Default | Effect |
|---|---|---|
| Working days based on | Leave | Leave or Attendance (see modules 01 and 02) |
| Unmarked attendance counts as | — | Present / Absent (attendance mode) |
| Include holidays in working days | off | On → lower per-day rate |
| Consider attendance on holidays | off | |
| Max working hours against timesheet | — | |
| Half-day paid fraction | 0.5 | 0 is reset to 0.5 |
| Disable rounded total | off | Hides slip rounded total |
| Show leave balances on slip | off | |
| Payroll accounting per employee | off | Payable split by employee |
| Email salary slip | **on** | + optional **password-protected PDF** with a password pattern built from employee fields (e.g. first name + birth year); sender account and template |
| Create overtime slips in payroll | off | |
| Mandatory benefit application | off | Flexible benefits need an application |

**Source:** `hrms/payroll/doctype/payroll_settings/`

---

### A.6 Payroll Period

**Purpose.** The tax/payroll year per company (e.g. 1 Apr – 31 Mar).

| ID | Rule |
|---|---|
| PY-PP-01 | Start ≤ end; periods of the same company must not overlap. |
| PY-PP-02 | New period defaults to the day after the latest period; end = start + 12 months − 1 day. |
| PY-PP-03 | A slip needs a payroll period covering its dates to compute tax. |

**Spreading tax ("remaining periods").** Window = period, trimmed to joining and relieving dates. Monthly: total months in period; remaining = months from this slip to the window end. Otherwise day-based: remaining = days left ÷ days in this slip.
`Tax this slip = (annual tax on projected income − tax already deducted this year) ÷ remaining periods`, never below 0.
> FY Apr–Mar, October slip → 6 remaining. Relieved 10 Jan → 4 remaining.

**Source:** `hrms/payroll/doctype/payroll_period/`

---

### A.7 Income Tax Slab

**Purpose.** One tax regime: progressive slabs, standard exemption, rebate threshold, cess/surcharge rows. Chosen per employee on the SSA. **Old vs new regime = two separate slab records** (one allowing exemptions, one not).
**Data.** Name, effective from, company, currency, allow tax exemption, standard exemption amount, taxable-income relief threshold (rebate: tax 0 at or below), disabled; slab rows (from, to [blank = no limit], %, optional condition); other charges (description, %, min / max taxable income); *India:* marginal-relief threshold.

| ID | Rule |
|---|---|
| PY-TAX-01 | No validation of slab order, overlaps or % — anything is accepted. |
| PY-TAX-02 | At slip time: SSA must have a slab; slab not disabled; effective from ≤ payroll period start. |
| PY-TAX-03 | Slab conditions can use employee, assignment, slip values and annual taxable income. |
| PY-TAX-04 | Income ≤ relief threshold → tax 0 (rebate, e.g. India 87A). |
| PY-TAX-05 | Slab tax = Σ (portion of income in each slab + 1) × % — "from" values are expected as previous "to" + 1 (e.g. 4,00,001). |
| PY-TAX-06 | India marginal relief: if relief threshold < income < marginal threshold and tax > (income − relief threshold), tax = income − relief threshold. |
| PY-TAX-07 | Other charges apply **in row order and compound** (surcharge then cess on tax+surcharge); a row applies only within its min/max income. No marginal relief on surcharge. |
| PY-TAX-08 | Standard exemption always deducted; declarations/proofs and exempt deductions only if the slab allows exemptions. |
| PY-TAX-09 | Annual taxable income = earnings so far this year (or opening balances) + current + projected future structured earnings + current one-off earnings + other declared income − exemptions. Tax on "full tax on this date" earnings = tax(with) − tax(without), charged entirely now. |

> **New-regime example (FY 2025-26):** 0–4 L 0 %, 4–8 L 5 %, 8–12 L 10 %, 12–16 L 15 %, 16–20 L 20 %, 20–24 L 25 %, 24 L+ 30 %; standard exemption ₹75,000; relief threshold ₹12,00,000; marginal threshold ₹12,75,000; cess 4 %.
> • Gross ₹15,00,000 → taxable ₹14,25,000 → 20,000 + 40,000 + 33,750 = ₹93,750 + cess ₹3,750 = **₹97,500/year**. After 6 months at ₹8,125, October TDS = (97,500 − 48,750) ÷ 6 = **₹8,125**.
> • Taxable ₹12,00,000 → **₹0** (rebate).
> • Taxable ₹12,10,000 → slab tax ₹61,500 but marginal relief caps at ₹10,000 + cess ₹400 = **₹10,400**.

**Source:** `hrms/payroll/doctype/income_tax_slab/`, `taxable_salary_slab/`, `income_tax_slab_other_charges/`, `hrms/regional/india/`

---

### A.8 Suspected defects — setup

| # | Suspicion | How to test |
|---|---|---|
| A-D1 | Slab "+1" convention: if "from" = previous "to" (4,00,000 → 4,00,000), tax is overstated by % × ₹1 per slab. No slab validation at all. | Slabs 0–4 L, 4 L–8 L at 5 %; tax on ₹8 L = ₹20,000.05. |
| A-D2 | "Sync formula" writes unsaved form values into **submitted** structures without validation (double-proration guard skipped). | Edit formula, don't save, click Sync. |
| A-D3 | Double-proration check mis-handles abbreviations with symbols (+, ., parentheses). | Abbreviation "B+S". |
| A-D4 | Timesheet structure negative-net-pay check never fires. | Deductions > earnings on timesheet structure. |
| A-D5 | Company-less tax slabs never appear in the SSA picker; company slabs are forced to company currency → foreign-currency structures with TDS can't get a slab via UI. | USD structure with tax component in INR company. |
| A-D6 | SSA CTC/gross include accrual earnings that the slip doesn't pay in gross; CTC goes stale when submitted structure formulas are edited. | Accrual earning ₹2,000; edit formula after submit. |
| A-D7 | Employees can read all SSAs (base, CTC) unless user permissions restrict the Employee record. | Log in as Employee without restrictions. |
| A-D8 | Employee-master fields silently override same-named assignment fields in formulas (e.g. CTC). | Formula "ctc" with different master value. |
| A-D9 | Half-day fraction can't be 0; payment-days settings readable by any logged-in user. | Save 0; call as Employee. |

---

## Part B — The salary slip engine

**Purpose.** One employee's pay for one period: earnings, deductions, employer contributions, income tax (TDS), loan repayment, benefit accruals/payouts → gross, net, rounded net, amount in words, year-to-date and month-to-date.
**Who.** Payroll run (bulk create + submit); HR User (create, submit); HR Manager (also cancel, amend, delete); Employee (read, print, receives e-mail PDF). Also: structure **preview** (unsaved, full period), slip from a **timesheet**, background slips for the tax-computation report.

**Data.** Header (employee snapshot, posting date, start/end, frequency, structure, payroll run, currency + exchange rate, journal link, withholding link, timesheet flag, payroll period, status) · attendance block (working days, LWP, payment days, absent days) · timesheets (hours, hourly rate) · bank details (from employee) · earnings / deductions / employer-contribution rows (component, amount, full-cycle default amount, additional amount, additional-salary link, YTD, copied component flags) · accrued benefits · loans · leave balances · totals in slip and company currency · income-tax breakup (CTC, other income, exemptions, annual taxable, tax so far / this month / future / total).

**Status flow.**
```
new ─save─► Draft ─submit─► Submitted ─cancel─► Cancelled
            └─discard─► Cancelled
Withheld (draft or submitted) whenever an unreleased withholding cycle has exactly the slip's dates;
release voucher submitted → Submitted; release voucher cancelled → Withheld.
```

### B.1 Rules

| ID | Rule |
|---|---|
| PY-SL-01 | Employee not Inactive ("Left" allowed); must have a joining date; start ≤ end; error if joined after period end or relieved before period start; relieved before period start but status not "Left" → error asking to set Left. |
| PY-SL-02 | Dates from frequency: Monthly = calendar month (fiscal-year anchored); Bimonthly = 1–15 or 16–end; Weekly = +6 days; Fortnightly = +13; Daily = same day. |
| PY-SL-03 | Duplicate: no other non-cancelled slip for the same employee with exactly the same dates (when inside a payroll run, only slips of that run are checked). Timesheet slips: error only if a timesheet is already paid. |
| PY-SL-04 | Structure picked = latest submitted assignment of an active structure starting on/before max(period end, joining date); frequency must match (non-timesheet). None → warning, blank structure. |
| PY-SL-05 | Structure components are **recalculated on every save** — manual edits to structure rows in a draft are overwritten; manually added extra rows keep their amount. |
| PY-SL-06 | Manually entered LWP that differs from leave/attendance records → message only; manual value used. |
| PY-SL-07 | Additional salary: two overwrite entries for one component in the period → error. Recurring applies when from ≤ slip end ≤ to; one-off when payroll date in slip. Zero amount skipped if component "remove if zero". |
| PY-SL-08 | Formula / condition error stops the save, pointing at the structure row. |
| PY-SL-09 | A row is added if amount ≠ 0, or it's formula-based and its condition passed (even if 0), or it's fixed with "remove if zero" off. Condition false → never added. After proration, zero rows with "remove if zero" are dropped. |
| PY-SL-10 | Statistical and accrual components are evaluated (usable by formulas) but never become earning/deduction rows; accruals go to the accrued-benefits table and benefit ledger. |
| PY-SL-11 | "Not in total" rows appear but are excluded from gross/deductions; still taxable. |
| PY-SL-12 | Employer contributions: from structure only; never in gross, deductions, net or taxable; not printed. |
| PY-SL-13 | Rounding: component "round to integer" after proration; every amount to currency precision; net pay rounded to a whole unit (system method) unless "disable rounded total". |
| PY-SL-14 | **Net pay = gross − total deductions − total loan repayment.** Submit blocked if net < 0. |
| PY-SL-15 | Tax component found in order: structure tax rows with no formula/amount → tax rows already on the slip → (new slip) all enabled tax components of the company. |
| PY-SL-16 | Tax is computed only if a payroll period covers the slip; otherwise message, no tax row. Assignment must have an enabled slab effective by period start. |
| PY-SL-17 | Overwrite additional salary on the tax component = this month's tax (normal calc skipped); a non-overwrite one is silently removed. |
| PY-SL-18 | TDS never negative (no refunds via slip). |
| PY-SL-19 | Last cycle of the payroll period: "deduct tax for unsubmitted proofs" switches on automatically — only submitted proofs count from then. |
| PY-SL-20 | Not prorated again: arrears, payroll corrections, benefit-claim payouts, overwrite entries replacing a structure row, accrual components. |
| PY-SL-21 | Loans (lending add-on): open loans with "repay from salary" are added automatically; payment can't exceed amount payable at period end. |
| PY-SL-22 | YTD / MTD count submitted slips only. |
| PY-SL-23 | E-mail on submit if enabled (payroll runs e-mail after the batch); recipient = employee's preferred e-mail; future posting date delays the e-mail; optional password-protected PDF. |
| PY-SL-24 | Reversed LWP days from payroll corrections are added back to payment days (must match submitted corrections). |
| PY-SL-25 | Timesheet slip: structure must be timesheet-based with a wage component; wage = hourly rate × hours of submitted/billed timesheets **starting** in the period; alert if hours exceed the max setting. |

### B.2 Calculation order
1. Remaining tax periods.
2. **Earnings:** structure rows (in order) → additional-salary earnings → flexible benefits.
3. **Gross pay.**
4. **Deductions:** structure rows → additional-salary deductions → **income tax last** (sees everything).
5. Loan rows.
6. Regional statutory hook (empty in core).
7. Employer contributions.
8. Rounding → net pay → amount in words → tax breakup.

### B.3 Two-stage evaluation and proration
- The **assignment** first evaluates every component for one full cycle (no LWP) → each row's **default (full-cycle) amount**. A condition that's false in that first cycle drops the row permanently.
- The **slip** re-evaluates conditions and formulas with its own (prorated) values.
- A "depends on payment days" row = default amount × payment days ÷ working days (its own formula result is not used). Dependent formulas see the prorated values.

> **Example.** Base ₹40,000; BS = base (prorated); HRA = BS × 0.4 (not prorated). 30 working days, 2 LWP → 28 payment days.
> BS = 40,000 × 28/30 = **₹37,333.33**; HRA sees prorated BS → **₹14,933.33**; gross **₹52,266.66**.

**Additional salary on the slip.** *Add mode:* own row, prorated if the component is. ₹5,000 bonus at 28/30 → ₹4,666.67. *Overwrite mode:* replaces the structure row, not prorated. Structure ₹10,000, overwrite ₹12,000 → row ₹12,000.

### B.4 Flexible benefits & accruals
- Source: submitted benefit application for the period, else the assignment's benefits (unless "mandatory benefit application" is on).
- Per cycle: yearly amount ÷ cycles in period (12), prorated if the component is.
- Payout (a) accrue & pay at year end → last cycle pays accrued + this share − already paid. (b) accrue & pay on claim → claims reduce accrual; optional payout of unclaimed in final cycle. (c) claim full amount → just accrues.
- Everything is written to the benefit ledger on submit; removed on cancel.
> Yearly LTA ₹60,000, monthly: ₹5,000 accrues Apr–Feb; March pays out **₹60,000**.

### B.5 Income tax (TDS) projection

`R` = remaining periods (Monthly: months from this slip to period end or relieving date; otherwise days left ÷ days in slip).

**Annual taxable T** = previous (taxable earnings on earlier submitted slips this period + opening "taxable earnings till date") + current (this slip's structured taxable earnings) + future (this month's full-cycle structured taxable × (round(R) − 1)) + additional (this slip's taxable one-offs; recurring ones × remaining months) + other income − exemptions (declaration total, or proof total once proofs are enforced, **+ standard exemption always**; exempt deductions like PF / PT subtracted when the slab allows exemptions).

`T′` = T − one-off amounts flagged "deduct full tax on this date".

**This month's TDS** = max(0, (Tax(T′) − tax already paid) ÷ R + [Tax(T) − Tax(T′)])
Tax already paid = earlier submitted slips' tax + opening "tax deducted till date". Last month R = 1 → full true-up.

> **Example 1 — new regime, April.** Slabs 0–4 L 0 %, 4–8 L 5 %, 8–12 L 10 %, 12–16 L 15 %, 16–20 L 20 %; standard exemption ₹75,000; rebate threshold ₹12 L; cess 4 %. Monthly taxable ₹1,50,000, R = 12.
> T = 1,50,000 + 1,50,000 × 11 − 75,000 = **₹17,25,000** → 20,000 + 40,000 + 60,000 + 25,000 = ₹1,45,000 + cess ₹5,800 = **₹1,50,800/year** → April TDS = **₹12,566.67**.
>
> **Example 2 — one-time bonus taxed in full, October.** Paid so far 6 × 12,566.67 = ₹75,400. Bonus ₹2,00,000 flagged "full tax". R = 6.
> Tax(T′) = ₹1,50,800. T = ₹19,25,000 → 20,000 + 40,000 + 60,000 + 65,000 = 1,85,000 × 1.04 = ₹1,92,400.
> October TDS = (1,50,800 − 75,400) ÷ 6 + (1,92,400 − 1,50,800) = 12,566.67 + 41,600 = **₹54,166.67**. November back to ₹12,566.67.
> Without the flag: (1,92,400 − 75,400) ÷ 6 = **₹19,500** each month (spread).
>
> **Example 3 — marginal relief.** Rebate threshold ₹12 L, marginal threshold ₹12.75 L, taxable ₹12,40,000 → slab tax ₹66,000, but excess over ₹12 L is ₹40,000 → tax **₹40,000** + cess = **₹41,600**.

### B.6 Loans, timesheets, totals
- **Loans:** principal + interest per loan; total subtracted from net (not a deduction row). Gross ₹60,000, deductions ₹7,200, EMI ₹8,500 → net **₹44,300**. Submit creates loan repayments against payroll payable; cancel reverses.
- **Timesheet:** ₹500/h × 120 h = **₹60,000**.
- **Company currency:** every figure × exchange rate (net USD 5,000 × 83.25 = ₹4,16,250).
- **YTD:** submitted slips from payroll-period start + this slip. **MTD:** same month (useful for weekly/fortnightly).

### B.7 Side effects
| When | Effect |
|---|---|
| Save | Live refresh for the employee; leave balances rebuilt (if enabled). |
| Submit | Status Submitted/Withheld; timesheets marked paid; loan repayments created; gratuity & leave encashment marked paid; benefit ledger written; e-mail. |
| Cancel | Reverse all of the above. |
| Delete | Naming counter rolled back if last slip. |
| Journal cancelled elsewhere | Journal link cleared. |

**Source:** `hrms/payroll/doctype/salary_slip/`, `salary_detail/`, `salary_slip_leave/`, `salary_slip_loan/`, `salary_slip_timesheet/`

### B.8 Suspected defects — slip engine

| # | Suspicion | How to test |
|---|---|---|
| B-D1 | **Mid-period salary revision**: structure lookup uses period end, assignment lookup uses period start → old figures without proration, or an error. No split-period calculation at all. | New assignment effective the 15th; create that month's slip. |
| B-D2 | A condition false in the assignment's first cycle drops the row forever. | Condition "month = March", assignment from April; March slip. |
| B-D3 | A prorated component ignores its own formula (always default × payment/working days). | Formula "base ÷ 30 × payment days" with proration on. |
| B-D4 | Overlapping slips (monthly vs weekly, or two runs) are not detected. | Two runs same month. |
| B-D5 | YTD includes later slips (window is the whole period). | Submit October, create September. |
| B-D6 | Previous-employer opening balances vanish after a mid-year structure revision. | Openings on SSA-A (Oct), new SSA-B (Jan). |
| B-D7 | Past flexible-benefit payouts drop out of "previous taxable" → tax reverses. | Taxable benefit paid one month; check next month. |
| B-D8 | Two tax components → tax doubled. | Two tax-flagged deductions. |
| B-D9 | Several submitted declarations/proofs → one picked arbitrarily. | Two proofs. |
| B-D10 | Recurring additional salary missed in its final partial month; future projection counts months even for weekly pay. | Recurring 1 Jan–15 Mar. |
| B-D11 | Tax breakup uses ceil(R) while tax uses round(R) → breakup ≠ tax charged (weekly / mid-period joiners). Daily frequency + formula exempt deduction crashes the breakup. | Weekly slip. |
| B-D12 | Company-currency YTD/MTD fields never filled; unmarked days never saved. | Foreign-currency slip. |
| B-D13 | No payroll period + accrual component → submit crashes. | Remove period, submit. |
| B-D14 | On-screen gross (form recalculation) includes "not in total" rows until saved. | Edit a draft with such a row. |
| B-D15 | Timesheets assigned by start date only — one spanning two periods is paid entirely in the first. | Timesheet 28 Jan–5 Feb. |

---

## Part C — Payroll run & adjustments

### C.1 Payroll Run (Payroll Entry)

**Purpose.** Processes salary for a group of employees for one pay period: picks employees → creates and submits one salary slip each → books one accrual journal (salary expense vs salary payable) → creates a bank/cash payment voucher → later releases withheld salaries. Cancelling undoes it.
**Who.** HR Manager only (create, edit, submit, cancel, delete). Slips and journals are created by the system on the user's behalf.

**Data.** Posting date (today); Company; payroll currency + exchange rate (1 if same as company); payroll payable account (must be a Payable-type ledger); status (Draft / Submitted / Queued / Failed / Cancelled); timesheet-based flag; payroll frequency (Monthly / Fortnightly / Bimonthly = twice a month / Weekly / Daily) — required unless timesheet-based; start & end date; "deduct tax for unsubmitted exemption proofs" flag; employee filters (branch, department, designation, grade); employee table (employee, name, department, designation, "salary withheld" flag); "validate attendance" flag; cost centre (required), project, accounting dimensions; payment account (Bank/Cash ledger) and bank account.

**Status flow.** Draft → (Get Employees → optional overtime step) → Submit = "Create Salary Slips" → slips created (Queued in background if > 30 employees; Failed with stored error if creation fails, retry button) → "Submit Salary Slips" (accrual journal created; Queued if > 30) → "Make Bank Entry" (draft voucher) → optional "Release Withheld Salaries" → Cancel (queued if > 50 slips).

| ID | Rule |
|---|---|
| PY-RUN-01 | A salary structure qualifies for the run if it is submitted, active, same company, same currency, same timesheet flag, and (non-timesheet) same payroll frequency. |
| PY-RUN-02 | An employee qualifies if: has a submitted structure assignment to a qualifying structure starting on/before run end; that assignment's payable account = run's payable account; status is not Inactive (so "Left" employees can still be paid); same company; joined on/before run end; relieving date empty or on/after run start; matches every filter set. |
| PY-RUN-03 | Employees who already have a **submitted** slip with exactly the same start and end dates are excluded. |
| PY-RUN-04 | If nobody qualifies, an error lists the criteria used. |
| PY-RUN-05 | After fetching, an employee is flagged "salary withheld" if a submitted withholding has an unreleased cycle whose dates exactly equal the run's dates. |
| PY-RUN-06 | Changing company, frequency, start date or any filter clears the employee table. |
| PY-RUN-07 | Before submit: no listed employee may have a non-cancelled slip (draft or submitted) for the same dates; payable account must be Payable type; if "validate attendance" is on, no employee may have unmarked attendance days. |
| PY-RUN-08 | Slip creation skips employees who already have a slip from this run; others get a draft slip carrying the run's dates, frequency, posting date, currency, exchange rate, tax-proof flag and a link to the run. |
| PY-RUN-09 | If creation fails, all creation is rolled back, the error is stored, status = Failed. |
| PY-RUN-10 | Slip submission: slips with **negative net pay** are left unsubmitted; slips failing validation are left unsubmitted; any other error aborts the batch (Failed). |
| PY-RUN-11 | If at least one slip submitted: accrual journal created for submitted slips only; slips emailed (if setting on); status Submitted. |
| PY-RUN-12 | Every component posted must have an account set for the company, else error. A component row is posted unless it is both "not in total" and "not in accounts". Statistical components are not paid. |
| PY-RUN-13 | Cost-centre split per employee: percentages on the latest structure assignment; else employee's payroll cost centre; else department's; else the run's. |
| PY-RUN-14 | A deduction that recovers an Employee Advance is posted as its own credit against the advance (employee as party), not merged. |
| PY-RUN-15 | Employee-wise payroll accounting (setting): payable is split per employee with the employee as party; otherwise one combined payable line. |
| PY-RUN-16 | Bank voucher = earnings − deductions − loan repayments of submitted, non-withheld slips; Bank Entry or Cash Entry by payment account type; created as **draft**. No voucher if total ≤ 0. |
| PY-RUN-17 | Release of withheld salary: a separate voucher from withheld slips only; submitting it releases the withholding cycles (see C.3). |
| PY-RUN-18 | Cancel: cancels and then **permanently deletes** all slips of the run; cancels submitted journals referencing the run; status Cancelled. Draft vouchers are left untouched. |
| PY-RUN-19 | Overtime gate (if payroll setting on): before slips, eligible employees need overtime slips created and submitted; buttons replace "Create Salary Slips" until done. |
| PY-RUN-20 | The run respects accounting period locks and is audit-trailed. |

**Default period from posting date.** Monthly → calendar month containing the date (via fiscal year; error if none). Bimonthly → 1st–15th or 16th–month end. Weekly → start + 6 days. Fortnightly → start + 13. Daily → same day. Editing start sets end = start + frequency − 1 day.

**Unmarked attendance (validation).** Payroll days (joining/relieving-adjusted) − holidays − submitted attendance records = unmarked. Example: run 1–30 Apr, joined 10 Apr → 21 days; 4 holidays; 15 attendance → **2 unmarked** → blocked.

> **Accrual example.** A: Basic ₹50,000, HRA ₹20,000; PF ₹1,800, PT ₹200; cost centres Mumbai 60 % / Pune 40 %. B: Basic ₹30,000; PF ₹1,800, advance recovery ₹5,000; Delhi 100 %.
> **Debit** Basic expense: Mumbai ₹30,000, Pune ₹20,000, Delhi ₹30,000; HRA expense: Mumbai ₹12,000, Pune ₹8,000.
> **Credit** PF payable: Mumbai ₹1,080, Pune ₹720, Delhi ₹1,800; PT payable: Mumbai ₹120, Pune ₹80; Employee Advance (B) ₹5,000; **Payroll Payable ₹91,200** (= 1,00,000 − 8,800).
> **Bank entry:** Credit Bank ₹91,200 / Debit Payroll Payable ₹91,200.

**Multi-currency.** If an account is in company currency, amount × exchange rate; otherwise the payroll-currency amount with the run's rate on the line.

**Source:** `hrms/payroll/doctype/payroll_entry/`, `payroll_employee_detail/`

---

### C.2 Additional Salary

**Purpose.** A one-off or recurring earning/deduction that the salary slip picks up automatically. It is the **single channel** through which other features reach the slip: incentives, retention bonus, referral bonus, advance recovery, payroll corrections, arrears, benefit claims, leave encashment, gratuity, overtime, F&F.
**Who.** HR User / HR Manager create and submit (no cancel!); System Manager full.

**Data.** Employee, company, recurring flag; recurring → from & to date; one-off → payroll date; disabled flag (recurring, editable after submit); salary component (earning/deduction); currency (employee's salary currency); amount (pre-filled from component default); "deduct full tax on this payroll date" (from component); **overwrite structure amount (default on)**; reference document.

| ID | Rule |
|---|---|
| PY-ADD-01 | Employee not Inactive; dates within joining/relieving; from ≤ to. |
| PY-ADD-02 | Employee must have a submitted structure assignment on/before the date. If overwrite is on but the component isn't in that structure, overwrite is switched off with a notice. |
| PY-ADD-03 | No two enabled recurring entries for the same employee + component with overlapping dates. |
| PY-ADD-04 | With overwrite on: no other overwrite entry for the same employee + component on the same payroll date (or recurring covering it). Two overwrite entries for one component in one slip → slip blocked. |
| PY-ADD-05 | Tax components require overwrite on (warning: slab tax is replaced by this amount). |
| PY-ADD-06 | Amount ≥ 0. |
| PY-ADD-07 | Advance recovery can't exceed (advance paid − claimed − already scheduled recoveries). Example: paid ₹20,000, claimed ₹12,000, scheduled ₹5,000 → max ₹3,000. |
| PY-ADD-08 | Referral bonus: referral must be eligible, Accepted, and component an earning; submit marks referral Paid, cancel Unpaid. |
| PY-ADD-09 | Pick-up by slip: one-off if payroll date within slip dates; recurring if it starts on/before slip end **and ends on/after slip end**. |
| PY-ADD-10 | Overwrite on → replaces the structure's row for that component; off → added as an extra row. |
| PY-ADD-11 | Entries from Arrear, Payroll Correction or Benefit Claim, and accrual components, are not prorated again by payment days; others follow the component's setting. |

**Source:** `hrms/payroll/doctype/additional_salary/`

---

### C.3 Salary Withholding

**Purpose.** Hold an employee's net pay for N consecutive pay cycles (e.g. notice period, absconding, investigation). Salary is still processed and accrued; only payment is held until released.
**Who.** HR Manager full; System Manager all but cancel; employee read.
**Data.** Employee, posting date, payroll frequency (from the salary structure), number of cycles, from date, to date (computed), status (Draft / Withheld / Released), reason; cycles table (from, to, released flag, release voucher).

| ID | Rule |
|---|---|
| PY-WH-01 | Frequency comes from the employee's current salary structure; error if none. |
| PY-WH-02 | Cycles are recomputed on every save. Cycle length: Monthly 1 month, Bimonthly **2 months**, Fortnightly 14 days, Weekly 7, Daily 1. To = from + length × cycles − 1 day. 0 cycles = 1. |
| PY-WH-03 | No overlapping non-cancelled withholding for the same employee. |
| PY-WH-04 | Slips whose dates exactly match an unreleased cycle show status **Withheld** and are left out of the normal bank voucher. |
| PY-WH-05 | Submitting a release voucher: linked slips → Submitted, run rows unflagged, cycle released, status recomputed (Released when all cycles done). Cancelling the voucher reverses this. |

> **Example.** Monthly, from 1 Jan, 2 cycles → 1–31 Jan and 1–28 Feb. January net ₹45,000 is excluded from January's bank entry; released later by a separate voucher (Credit Bank / Debit Payroll Payable ₹45,000).

**Source:** `hrms/payroll/doctype/salary_withholding/`, `salary_withholding_cycle/`

---

### C.4 Payroll Correction (LWP reversal)

**Purpose.** Pay back salary deducted for Leave-Without-Pay days in an earlier, submitted slip (e.g. leave later regularised).
**Who.** HR User / HR Manager / System Manager create & submit; employees can create drafts; **no role can cancel**.
**Data.** Employee, company, payroll period, payroll date (when arrears are paid), month to reverse (list of submitted slips in the period with LWP > 0), slip, working days, payment days, LWP days, days to reverse; earning / deduction / accrual arrear tables (computed).

| ID | Rule |
|---|---|
| PY-COR-01 | Days to reverse > 0, and (already reversed by other submitted corrections + this) ≤ LWP days of that slip (LWP = working − payment days). |
| PY-COR-02 | Eligible components: on the slip, marked "arrear component", not from Additional Salary, not tax, not disabled; plus accrued benefit components. None → notice, empty tables. |
| PY-COR-03 | Earning/deduction arrear = (full-month amount ÷ slip working days) × days reversed. Accrual arrear = (accrued amount ÷ payment days) × days reversed. |
| PY-COR-04 | On submit: one submitted Additional Salary per earning/deduction row on the payroll date; one benefit-ledger accrual per accrual row. At least one row required. |

> **Example.** June slip: 30 working, 26 payment → LWP 4. Reverse 3 days: Basic ₹30,000 → ₹1,000 × 3 = **₹3,000**; PF ₹3,600 → **₹360** deduction.

**Source:** `hrms/payroll/doctype/payroll_correction/`

---

### C.5 Arrear (salary revision back-pay)

**Purpose.** When a revised structure is effective from a past date, pay the difference between what submitted slips paid and what the new structure would have paid.
**Who.** HR Manager full; System Manager all but cancel.
**Data.** Employee, company, currency, payroll period, new salary structure, arrear start date, payroll date; earning / deduction / accrual arrear tables (computed).

| ID | Rule |
|---|---|
| PY-ARR-01 | Arrear start must be inside the payroll period. A submitted structure assignment for this structure must exist starting on/after the arrear start. One submitted arrear per employee + structure + period. |
| PY-ARR-02 | Takes every submitted slip starting on/after the arrear start; sums arrear components (excluding Additional Salary and tax) + previous corrections = "paid". |
| PY-ARR-03 | Recomputes each slip with the new structure (same dates, LWP reduced by corrections) = "should have paid". |
| PY-ARR-04 | Keeps only **positive** differences per component (decreases ignored). All zero → refused. |
| PY-ARR-05 | On submit: Additional Salary per earning/deduction row; benefit-ledger accrual per accrual row. |

> **Example.** Basic ₹40,000 → ₹44,000 from 1 Apr; Apr–Jun already paid. Earning arrear **₹12,000**; PF at 12 %: 3 × (5,280 − 4,800) = **₹1,440** deduction arrear.

**Source:** `hrms/payroll/doctype/arrear/`

---

### C.6 Employee Incentive, Retention Bonus, Other Income

| Feature | Behaviour |
|---|---|
| **Employee Incentive** | One-off earning on a payroll date → on submit creates a submitted Additional Salary (overwrite off). Needs any structure assignment to exist. HR Manager submits; HR User drafts. |
| **Retention Bonus** | Bonus payable on a future date (date can't be in the past). On submit creates an Additional Salary on that date; on cancel reduces/cancels it. **Email reminder to all HR Managers 14 days before** the due date. |
| **Employee Other Income** | Declares income outside this employer (previous employer, interest…) for a payroll period. All submitted amounts are added to annual taxable income in the TDS projection. Employees can create and submit. |

**Source:** `hrms/payroll/doctype/employee_incentive/`, `retention_bonus/`, `employee_other_income/`, `hrms/payroll/notification/retention_bonus/`

---

### C.7 Suspected defects — run & adjustments

| # | Suspicion | How to test |
|---|---|---|
| C-D1 | "Bimonthly" = twice a month in the run but **every 2 months** in withholding → withholding never matches bimonthly runs. | Bimonthly structure; withholding from 1 Jan, 1 cycle; run 1–15 Jan → not withheld. |
| C-D2 | Releasing one withheld month clears the withheld flag on that employee's rows in **all** runs. | Withhold Jan + Feb; release Jan only; check Feb run. |
| C-D3 | "Release" can be clicked twice → two draft vouchers. | Click twice before submitting. |
| C-D4 | A cancelled bank voucher still counts as existing → "Make Bank Entry" never returns. | Make, submit, cancel bank entry; reload run. |
| C-D5 | Cancelling a run permanently deletes slips (no audit trail) and leaves draft vouchers. | Cancel a run with a draft bank entry. |
| C-D6 | Employee selection may match an **older** structure assignment, not the current one. | Monthly SSA Jan, weekly SSA Mar; monthly run in Apr. |
| C-D7 | Partial submission (e.g. one negative-net slip) marks the run submitted; leftover slips never get an accrual. | Force a negative net pay. |
| C-D8 | Employee-wise accounting credits payable at the run's cost centre but debits it at employee cost centres → payable doesn't net per cost centre. | 60/40 split, compare payable by cost centre. |
| C-D9 | Recurring Additional Salary ending mid-month is **not paid in its last month**. | ₹5,000 from 15 Jan to 15 Mar → March slip. |
| C-D10 | HR roles can't cancel Additional Salary; nobody can cancel Payroll Correction (and its Additional Salaries wouldn't be cancelled). | Try as HR Manager. |
| C-D11 | Arrear ignores pay decreases and includes slips outside the payroll period / company. | Slip from next FY. |
| C-D12 | Retention Bonus creates Additional Salary without currency (may fail); a past due date blocks amend. | Submit and inspect. |
| C-D13 | Employees can create/submit Other Income for colleagues (subject only to user permissions). | Log in as plain Employee. |

---

## Part D — Tax declarations, HRA, flexible benefits, gratuity, reports

### D.1 Tax exemption categories & sub-categories

- **Category** (e.g. Section 80C) with an annual cap (0 / blank = no cap) and active flag.
- **Sub-category** (e.g. PPF, ELSS under 80C) with its own cap (defaults to the category cap) and active flag.

| ID | Rule |
|---|---|
| PY-EX-01 | Caps can't be negative; sub-category cap ≤ category cap. |
| PY-EX-02 | Only active sub-categories are offered in declarations/proofs (form filter only). |

---

### D.2 Tax Exemption Declaration (start of year)

**Purpose.** Employee declares planned investments and rent. The submitted declaration's exemption reduces projected taxable income in every slip **except the last** of the period.
**Who.** Employee, HR User, HR Manager — **employees can submit and cancel their own** (no HR approval).
**Data.** Employee, company, payroll period, currency; rows (sub-category, category, cap, declared amount); totals (declared, exemption). *India:* monthly rent, metro flag → HRA as per structure, annual and monthly HRA exemption.

| ID | Rule |
|---|---|
| PY-EX-10 | Employee not Inactive; no duplicate sub-category; one non-cancelled declaration per employee per period. |
| PY-EX-11 | Exemption = capped sum (each row capped at its sub-category cap → summed per category → capped at category cap) + annual HRA exemption. |
| PY-HRA-01 | Rent entered → company must have Basic and HRA components configured; a submitted salary structure assignment must exist at submit. |

> **Capped-sum example.** 80C (cap ₹1,50,000): PPF ₹1,00,000 + ELSS ₹80,000 = ₹1,80,000 → **₹1,50,000**. 80D (cap ₹75,000): Self ₹30,000 with sub-cap ₹25,000 → **₹25,000**. Declared ₹2,10,000; exemption **₹1,75,000**.

**HRA exemption (India)** = min( actual HRA for the year, rent × 12 − 10 % of Basic, 50 % of Basic if metro else 40 % ). Annual Basic and HRA are built from each structure assignment in the period (segments; preview slip per segment × cycles).
> Basic ₹50,000/month, HRA ₹20,000/month, rent ₹18,000 in a metro → min(2,40,000 ; 2,16,000 − 60,000 = **1,56,000** ; 3,00,000) = **₹1,56,000/year (₹13,000/month)**. Declaration exemption becomes ₹1,75,000 + ₹1,56,000 = ₹3,31,000.

**Source:** `hrms/payroll/doctype/employee_tax_exemption_declaration/`, `employee_tax_exemption_category/`, `employee_tax_exemption_sub_category/`, `hrms/regional/india/`

---

### D.3 Tax Exemption Proof Submission (end of year)

**Purpose.** Actual proof amounts (with attachments) and rent actually paid. In the **last payroll cycle**, the slip uses the submitted proof instead of the declaration.
**Data.** Employee, submission date, payroll period, company, currency; rows (sub-category, category, cap, proof type, actual amount, attachment). *India:* rent paid, metro, rented from/to → monthly rent, monthly and total eligible HRA.

| ID | Rule |
|---|---|
| PY-EX-20 | Same checks as declaration; one proof per employee per period. |
| PY-EX-21 | Exemption = capped sum + total eligible HRA. Can be pre-filled from the declaration. |
| PY-HRA-10 | Rent paid → both rented dates required; span ≥ 15 days. |
| PY-HRA-11 | Months = span days ÷ 30 rounded to nearest 0.5; monthly rent = rent paid ÷ months; total HRA = monthly exemption × months. |

> Rented 1 Apr – 30 Sep (183 days → 6.0 months), rent paid ₹1,08,000 → ₹18,000/month → monthly exemption ₹13,000 → **₹78,000**.
>
> ⚠️ **No proof by the last cycle → declared exemptions drop to zero** (only standard exemption stays) → TDS spike in March.

**Source:** `hrms/payroll/doctype/employee_tax_exemption_proof_submission/`

---

### D.4 India regional setup

Runs when an India company is created: adds **PAN, PF account number, IFSC, MICR** to employee; a **component type** for deductions (Provident Fund, Additional PF, PF Loan, Professional Tax — drives PF/PT reports); company HRA settings (Basic, HRA, Arrear components); HRA fields on declaration/proof; **marginal-relief threshold** on tax slabs (INR). Creates default components (Basic, HRA, PF, Professional Tax, Arrear, Leave Encashment) and a default gratuity rule (15/26, minimum 5 years — but with **no applicable components**, so it fails until configured). UAE setup creates three gratuity rules.

**Source:** `hrms/regional/india/`, `hrms/regional/united_arab_emirates/`

---

### D.5 Flexible benefits: Application, Claim, Ledger

**Benefit Application** — employee chooses, for a payroll period, how much of each flexible benefit (within the assignment's limits) they want. Replaces the assignment's benefit rows for that period.
| ID | Rule |
|---|---|
| PY-BEN-01 | Employee not Inactive; one submitted application per employee per period; each amount > 0 and ≤ its row max; total ≤ max benefits. Employees can draft, HR submits. |

> Allowed ₹60,000 total (Fuel ≤ ₹36,000, Meal ≤ ₹30,000): Fuel ₹30,000 + Meal ₹30,000 ✓; ₹36,000 + ₹30,000 ✗.

**Benefit Claim** — employee claims a reimbursement (medical, fuel…) with attachment; on submit becomes a one-off earning (Additional Salary) on the payroll date, not prorated.
| ID | Rule |
|---|---|
| PY-BEN-10 | Only components with payout "accrue & pay on claim" or "claim full amount". |
| PY-BEN-11 | Max eligible: *accrue & claim* = accrued this period + this month's accrual − paid; *full claim* = yearly amount − paid. |
| PY-BEN-12 | Claim > 0 and ≤ max eligible; payroll date not in the past; one submitted claim per component per month. |

> Fuel ₹24,000/year accrue-and-claim: 5 months accrued ₹10,000 + this month ₹2,000 − paid ₹4,000 → eligible **₹8,000**. Medical full-claim ₹50,000 with ₹15,000 paid → **₹35,000**.

**Benefit Ledger** — system-only record of every accrual and payout per employee / component / period, written when slips are submitted and **hard-deleted** when they're cancelled. Feeds claims and the Accrued Earnings report.

**Source:** `hrms/payroll/doctype/employee_benefit_application/`, `employee_benefit_claim/`, `employee_benefit_ledger/`

---

### D.6 Gratuity

**Gratuity Rule.** Amount basis (**current slab** or **sum of all previous slabs**); applicable earning components; slabs (from year, to year [0 = open], fraction of earnings e.g. 15/26); experience method (round off / exact years / manual); working days per year (365); minimum years.

**Gratuity** (per exiting employee). Employee, posting date, rule, experience (editable for manual), amount, status (Draft / Unpaid / Paid / Cancelled); pay via salary slip (default on → payroll date + component) or via accounts (expense + payable account, mode of payment → Payment Entry).

**Calculation**
1. Service days = relieving − joining, minus LWP days (leave mode) or absent days (attendance mode).
2. Years = days ÷ working days per year; round off (halfway → even), exact (fractional), or manual.
3. Years < minimum → blocked (not for manual).
4. Base = full (unprorated) amounts of the applicable components on the employee's **latest submitted salary slip**.
5. Current slab: base × years × slab fraction. Sum of slabs: each passed slab's years × fraction, plus the remainder in the current slab.

> **India example.** Joined 1 Jun 2018, relieved 15 Dec 2025 → 2,754 days ÷ 365 = 7.55 → **8 years**. Basic ₹52,000 × 8 × 15/26 = **₹2,40,000**. (No ₹20 lakh statutory cap applied.)
> 1 Oct 2020 – 31 Mar 2025 → 4.499 → 4 years → **rejected** (< 5).
> **Sum-of-slabs example.** Slabs 0–1 × 0, 1–5 × 21/30, 5+ × 1; base ₹1,00,000; 7 years → 0 + 4 × 0.7 × 1 L + 2 × 1 L = **₹4,80,000** (current-slab basis would give ₹7,00,000).

**Side effects.** Via slip → Additional Salary; status Paid when that slip is submitted. Via accounts → expense debit / payable credit; Payment Entry marks paid.

**Source:** `hrms/payroll/doctype/gratuity/`, `gratuity_rule/`, `gratuity_rule_slab/`, `gratuity_applicable_component/`

---

### D.7 Reports

| Report | Purpose | Key logic |
|---|---|---|
| **Salary Register** | Slip-wise register, every component as a column | Filters: dates, company, employee, department, designation, branch, currency, status. Only non-zero component columns; company-currency conversion by exchange rate. |
| **Bank Remittance** | Bank upload file of net pay | Payroll runs paid from a bank account; company account no., employee account no., IFSC, net pay. |
| **Salary Payments via ECS** | Per-employee bank details for ECS | Bank / cash / cheque filter; IFSC and MICR for India. |
| **Salary Payments by Payment Mode** | Net pay by branch × payment mode + gross/deduction/net summary | Chart of net pay per mode. |
| **Employee CTC Break-up** | One employee's CTC by component: per cycle, annual, % of CTC | Employees can see only their own. Basic ₹50,000/month of CTC ₹12 L → 50 %. |
| **Income Tax Computation** | Year-end projection per employee: gross, other income, exempt components, exemption categories, HRA, standard exemption, taxable, tax, deducted, payable | Projects future slips from the last actual slip; proofs first, optionally declarations; payable = max(applicable − deducted, 0). |
| **Income Tax Deductions** | TDS per slip, with PAN | Components flagged as income-tax. |
| **Provident Fund Deductions** | PF, additional PF, PF loan per slip | Uses India component types. |
| **Professional Tax Deductions** | PT per slip | Uses India component type. |
| **Accrued Earnings** | Accrued vs paid per accrual component; one-click payout of unpaid non-flexible accruals | From the benefit ledger. |

**Source:** `hrms/payroll/report/`

---

### D.8 Suspected defects — tax, benefits, gratuity, reports

| # | Suspicion | How to test |
|---|---|---|
| D-D1 | Category cap 0 (= "no cap") rejects every positive sub-category cap. | Category cap 0, sub-category ₹10,000. |
| D-D2 | HRA: rent always × 12 even for mid-year joiners (joining/relieving ignored) → inflated exemption. | Join 1 Oct, rent ₹20,000. |
| D-D3 | No proof by last cycle → declarations drop to zero → TDS spike. | Declaration only; run March slip. |
| D-D4 | Gratuity: no submit/cancel permission for any HR role (only Administrator). Cancel doesn't cancel its Additional Salary. | Submit as HR Manager. |
| D-D5 | Gratuity rounding halfway → even (4.5 → 4); "exact years" keeps fractions instead of completed years; manual skips minimum; no ₹20 L cap; disabled rule still usable; India/UAE default rules misconfigured. | Rule with 360 days, 1,620 days service. |
| D-D6 | Benefit claim trusts the max-eligible value from the browser (not recomputed on save). | API claim above entitlement. |
| D-D7 | Benefit accrual keeps accruing once the yearly total is reached (cap only works for a partial remainder). | 13th cycle. |
| D-D8 | Income Tax Computation: may crash without exempt components; double-subtracts non-taxable earnings; uses latest assignment even if dated after the period; ignores sub-category caps. | Compare with slip annual taxable. |
| D-D9 | **Employee role can run Income Tax / PF / PT reports for every employee** (PAN, PF no., tax) — data leak. | Run as plain Employee without filter. |
| D-D10 | Bank Remittance loses leading zeros of account numbers and uses exclusive date bounds. | Account starting with 0. |
| D-D11 | Accrued Earnings builds link HTML from raw values (injection risk). | Component name with a quote. |
| D-D12 | Employees can submit/cancel their own declarations and proofs with no HR verification. | Submit as Employee. |

---

---

## Permissions summary (default roles)

| Object | Employee | HR User | HR Manager | Other |
|---|---|---|---|---|
| Salary Component | read | create/edit | full | |
| Salary Structure | — | full (no import/export) | full | |
| Structure Assignment | **read (incl. base & CTC)** | create, submit | full | System Manager: no submit |
| Payroll Settings | — | — | read/write | System Manager full |
| Payroll Period | read | full | full | |
| Income Tax Slab | — | full | full | |
| Payroll Run | — | — | **only role** | |
| Salary Slip | read, print | create, submit | + cancel, amend, delete | |
| Additional Salary | — | create, submit (**no cancel**) | create, submit (**no cancel**) | System Manager full |
| Salary Withholding | read | — | full | |
| Payroll Correction | draft | create, submit | create, submit | **nobody can cancel** |
| Arrear | — | — | full | |
| Incentive / Retention Bonus | read | draft / full | full | |
| Other Income | **full (any employee)** | full | full | |
| Tax Declaration / Proof | **full incl. submit** | full | full | |
| Benefit Application / Claim | draft | full | full | |
| Gratuity | — | create/edit (**no submit**) | create/edit (**no submit**) | Administrator only submits |
| Tax / PF / PT reports | **all employees visible** | ✓ | ✓ | |

---

## Gap analysis vs YukthiX spec §1.3.5

Our spec lists: *salary structures and revisions · payroll run and payslips · tax declarations, investment proofs, Form 16 · statutory packs — PF, ESI, PT, TDS, gratuity, returns and challans · loans and advances · full and final settlement*.

| Capability | Frappe | YukthiX spec | Note |
|---|---|---|---|
| Components, formula structures, assignments, CTC | ✅ | ✅ | 💡 Add a formula tester and a **CTC-first builder** (enter annual CTC → breakup computed) — the way Indian HR actually works. |
| Salary revision | ⚠️ new assignment; arrears for increases only | ✅ | **Better:** mid-month revision split (defect B-D1), decreases/recoveries, revision letters. |
| Payroll run, slips, e-mail with password PDF | ✅ | ✅ | |
| Payroll run approval workflow (maker-checker) | ❌ | ❌ | Add — HR prepares, finance approves. |
| Payroll lock / freeze after run | ⚠️ | ❌ | Add — lock attendance, leave and inputs once approved. |
| Pre-run validations dashboard (missing bank, PAN, structure, attendance) | ⚠️ attendance only | ❌ | 💡 Add a readiness checklist. |
| Month-over-month variance report | ❌ | ❌ | 💡 Add — catches payroll mistakes before pay-out. |
| TDS projection, regimes, rebate, marginal relief, cess | ✅ | ✅ (TDS) | Old/new regime as separate slabs; **employee regime choice** comes from `india-payroll` (module 04). |
| Tax declarations & proofs with HR verification | ⚠️ employees self-submit, no HR approval | ✅ | Add approve/reject per row with comments. |
| HRA exemption | ✅ (with defects) | ✅ | Fix mid-year joiner and proof-missing spike. |
| Previous employer income (Form 12B) | ⚠️ opening balances / other income | ❌ | Add explicit 12B capture. |
| Form 16 | ❌ (in `india-payroll`) | ✅ | Module 04. |
| PF, ESI, PT, LWF computation & challans / returns (ECR, ESIC, PT returns, 24Q) | ❌ in core (reports only) | ✅ | Module 04. |
| Gratuity | ✅ (with defects) | ✅ | Add ₹20 L cap, completed-years rule (≥ 6 months rounds up per Payment of Gratuity Act), provisioning. |
| Loans & advances | ⚠️ needs separate lending app | ✅ | Build native: salary advance, loan with EMI, interest/perquisite, recovery in F&F. |
| Full & final settlement | ⚠️ pieces exist (encashment, gratuity, withholding) — F&F doc lives in HR module | ✅ | Module 05. |
| Bonus Act (statutory bonus 8.33–20 %) | ❌ | ❌ | India pack. |
| Minimum wages check by state / skill | ❌ | ❌ | India pack — warn when below. |
| Reimbursements (claims with bills) | ✅ via benefit claims | ⚠️ §1.3.7 | Align with Expenses. |
| Off-cycle / supplementary payroll | ⚠️ manual slips | ❌ | Add. |
| Multi-currency / multi-entity | ✅ | ✅ (§2.1.6) | |
| Accounting journals | ✅ (in-house ERPNext) | ⚠️ §2.1.13 export | Generate journals and push to Tally / Zoho / QuickBooks. |
| Bank payment file | ✅ basic | ❌ | Add bank-specific formats (HDFC, ICICI, SBI…) and payment-status reconciliation. |
| Payslip self-service & tax sheet | ✅ | ✅ (§1.3.11) | |
| Report privacy | ❌ **employees can see all employees' tax/PF** | — | Must fix by design (row-level security). |

---

## YukthiX design questions (for the later design phase)

1. CTC-first or structure-first salary setup (or both)?
2. Mid-month revisions: split the month by days at old/new rates?
3. Payroll approval: how many levels, who?
4. Accounting: our own ledger, or journal export only (which tools first — Tally, Zoho Books)?
5. Loans: interest-bearing loans with perquisite tax, or only interest-free advances at launch?
6. Declarations/proofs: HR verification per line, deadlines, reminders?
7. Pay frequencies needed at launch — monthly only, or weekly/daily for blue-collar customers?
8. Bank integrations: file formats only, or direct payouts via bank APIs / payment partners (RazorpayX, Cashfree)?

---

## Source pointers (for verification only)

| Area | Path in `hrms-develop/hrms` |
|---|---|
| Components, structures, assignments | `payroll/doctype/salary_component/`, `salary_structure/`, `salary_structure_assignment/`, `bulk_salary_structure_assignment/` |
| Formula evaluation | `payroll/utils.py` |
| Settings, periods, tax slabs | `payroll/doctype/payroll_settings/`, `payroll_period/`, `income_tax_slab/`, `taxable_salary_slab/` |
| Slip engine | `payroll/doctype/salary_slip/` |
| Run & accounting | `payroll/doctype/payroll_entry/` |
| Adjustments | `payroll/doctype/additional_salary/`, `arrear/`, `payroll_correction/`, `salary_withholding/`, `employee_incentive/`, `retention_bonus/`, `employee_other_income/` |
| Tax declarations | `payroll/doctype/employee_tax_exemption_*` |
| Benefits | `payroll/doctype/employee_benefit_*` |
| Gratuity | `payroll/doctype/gratuity*` |
| India / UAE | `regional/india/`, `regional/united_arab_emirates/` |
| Reports | `payroll/report/` |
