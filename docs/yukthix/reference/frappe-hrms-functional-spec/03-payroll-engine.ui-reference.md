# 03 · Payroll Engine — UI Reference

> **Purpose.** How Frappe HR (with India Payroll) lays out the payroll setup, run, slip and tax screens, as a blueprint for the YukthiX React UI (decision D13).
> **Companion to:** [03-payroll-engine.md](03-payroll-engine.md) (behaviour) and [03-payroll-engine.data-dictionary.md](03-payroll-engine.data-dictionary.md) (fields). Statutory screens (PF/ESI/PT registers, Form 16, TDS returns) belong to module 04.
> **Format and clean-room rules:** same as the [Leave pilot](01-leave-management.ui-reference.md). Shared patterns P1–P5 are defined there.
> **Captured:** 24 Sep 2026 on the local test instance. 36 screenshots (34 desktop + 2 mobile) in [`../ui-screens/03-payroll/`](../ui-screens/03-payroll/). Internal reference only.

## Demo payroll behind the screenshots

Company *workfox*, September 2026. The run uses the attendance from module 02 and the leave from module 01.

**Structure:** "India Standard CTC". Basic 50 % of gross, HRA 20 %, Special Allowance 30 %, plus income tax. EPF, ESI and PT are added by India Payroll.

**Tax set-up:**
- Tax slabs for FY 2026-27, copied for *workfox*.
- Opening "taxable earnings / tax deducted till date" loaded for Apr–Aug, as a company moving to new software mid-year would have to.
- Vikram is on the **old regime** with declarations: 80C ₹1.6 L (capped at 1.5 L), 80D ₹25 k, rent ₹30 k/month.
- Priya has a ₹15,000 performance bonus entered as additional salary.

**Frappe's results:**

| Employee | Payment days | Gross | Deductions | Net | Why |
|---|---|---|---|---|---|
| Ananya (CEO) | 26/26 | 2,50,000 | 41,650 | 2,08,350 | PF 1,800 (capped) + PT 200 + TDS 39,650 (new regime, annual tax 4,75,800) |
| Vikram (HR) | 26/26 | 1,20,000 | 10,173.71 | 1,09,826.29 | Old regime: taxable 9,27,000 after HRA 2,88,000 + 80C/80D; TDS 8,173.71 |
| Priya (Sales) | 26/26 | 1,05,000 | 3,050 | 1,01,950 | Includes bonus; PT 1,250 (Tamil Nadu, half-yearly); tax nil (87A rebate) |
| Arjun (Sales) | 25/26 | 52,884.61 | 2,490 | 50,394.61 | ½ day from half-day leave + ½ day from half-day attendance |
| Meera (Ops) | 21/26 | 32,307.70 | 2,000 | 30,307.70 | 3 absent (incl. missed punch) + 2 LWP |
| Rahul (Ops) | 26/26 | 20,000 | 1,500 | 18,500 | Below the ESI threshold → ESI deducted |

Ananya's TDS matches our hand calculation exactly.

**Set-up problems we hit before the run succeeded.** Each one is a UI lesson (§3):
1. A formula component that also prorates by payment days was blocked, to stop HRA = 40 % of Basic being prorated twice.
2. The tax declaration was blocked until Basic and HRA components were set on the **Company** record.
3. The run was blocked because the payable account lacked an account type.
4. Submitting the slips **failed** because an employer-contribution component had no liability account. See the failed run screenshot [07b](../ui-screens/03-payroll/07b-payroll-run-failed.png).

---

## 1. Screen-by-screen

### 1.1 Payroll home — [01](../ui-screens/03-payroll/01-payroll-workspace.png)
- **Layout:** sidebar (Dashboard, Payroll Entry, Salary Structure Assignment, Salary Slip, Additional Salary, Salary Withholding, Reports ›, Setup ›, Settings). An "outgoing salary" line chart (last year, monthly) and cards: outgoing salary last month, number of salary structures, incentives last month.
- **Observed:** after a full September run the cards show **₹0.00** ("last month" means August) and the chart is flat. The home screen says nothing about the run that just happened, what is pending, or what's next.
- **YukthiX:** a **payroll calendar home**. This month's run shows as a stepper (Inputs → Review → Approve → Pay → Statutory); the previous month's totals sit next to it with variance; deadlines are listed (PF 15th, TDS 7th, PT); open issues are shown ("2 employees missing bank details").

### 1.2 Salary components — list [02](../ui-screens/03-payroll/02-salary-component-list.png), Basic [03](../ui-screens/03-payroll/03-salary-component-basic.png), Income tax [04](../ui-screens/03-payroll/04-salary-component-income-tax.png)
- **Layout:** tabs Overview / Condition & Formula / Flexible Benefits.
  - Overview: abbr, type, description | about **11 checkboxes**: depends on payment days, tax applicable, deduct full tax on selected date, round, statistical, accrual, not in total, remove if zero, arrear, disabled.
  - Then an accounts grid per company (account + liability account).
  - Header buttons: "Create", "Update Salary Structures".
- **Observed:** the checkboxes interact (statistical vs not-in-total vs accrual) with only help text to explain them. Accounts live on each component, so a missing liability account only shows up when a payroll run fails (§1.5).
- **YukthiX:** a component library with presets: Basic, HRA, Special, LTA, Bonus, Overtime, Reimbursement, PF, ESI, PT, LWF, TDS. Each preset carries its tax treatment and proration, and the user only edits exceptions. Accounting mapping is one screen for all components, with a completeness check before any run.

### 1.3 Salary structure — details [05](../ui-screens/03-payroll/05-salary-structure.png), components [05b](../ui-screens/03-payroll/05b-salary-structure-components.png)
- **Layout:**
  - Details tab: connections (assignments 6, slips 6, grades); company, letter head | is active, currency; leave-encashment rate, max benefits | timesheet flag, payroll frequency.
  - Earnings & Deductions tab: grids with component, abbr, formula and condition.
  - Header "Create" and "Actions" menus.
- **Observed:** the landing tab shows **none of the pay design**; the formulas are one tab away. Formulas are free-text expressions (`base * 0.5`). The double-proration rule was only discovered on save.
- **YukthiX:** a **CTC designer**. Enter an annual CTC, split it with percentages or fixed amounts, and see a live monthly/annual preview including employer PF, ESI and gratuity. Statutory warnings appear as you type: "Basic below 50 % of CTC — new wage code".

### 1.4 Salary assignment — [06](../ui-screens/03-payroll/06-salary-structure-assignment.png)
- **Layout:**
  - Tabs Details / India Payroll.
  - Employee, employment state, name, department, designation | structure, from date, tax slab | company, payable account, currency.
  - "Base, variable & leave encashment": base, variable, encashment rate, annual gross, **Total CTC**.
  - Benefits, cost centres. The India tab has EPF/VPF/LWF/disability settings.
- **Observed:**
  - The screen shows **CTC = Gross (14,40,000)**, because employer PF isn't part of this structure. HR could easily read it as the real CTC.
  - Opening tax balances for a mid-year start ("taxable earnings / tax deducted till date") are stored here but are not visible on the Details tab.
- **YukthiX:** a **Compensation tab** on the employee profile:
  - Current CTC card with a breakdown.
  - Revision history timeline with effective dates and arrears preview.
  - Tax regime choice.
  - An "Opening balances" card, which exists only during onboarding or migration.

### 1.5 Payroll run — submitted [07](../ui-screens/03-payroll/07-payroll-run-submitted.png), failed [07b](../ui-screens/03-payroll/07b-payroll-run-failed.png), employees [07c](../ui-screens/03-payroll/07c-payroll-run-employees.png)
- **Layout:**
  - Tabs Overview / Employees / Accounting & Payment / (Failure Details) / Connections.
  - Overview: posting date, company | currency, exchange rate, payable account, status; timesheet flag, frequency, start/end | "deduct tax for unsubmitted proof".
  - Employees tab: employee, name, department, designation, "is salary withheld".
  - Header actions change by state: Create Slips → Submit Salary Slip → Make Bank Entry.
- **Observed:**
  - **Failed state:** a blue banner ("Salary Slip submission failed. You can resolve the issue and retry") and a Failure Details tab. The real cause, a missing liability account on *Employer State Insurance*, sits in an error log. The screen itself does not say which component or account.
  - **No review step:** the employee grid shows **no amounts** (no gross, net, LOP days or variance versus last month). HR has to open six slips to check the run.
  - Slip submission runs as a background job. From the UI it looked successful while the slips stayed in draft.
- **YukthiX:** a **payroll run wizard**:

  | Step | What happens |
  |---|---|
  | 1. Inputs | Attendance lock, LOP days, new joiners/leavers, additional pay, arrears, overtime. Each is an item that is either ready or needs attention. |
  | 2. Pre-flight | Missing accounts, bank details, PAN, UAN, tax regime. Blocking vs warning, with a "fix" link. |
  | 3. Review grid | One row per employee: payable days, gross, deductions, TDS, net, **Δ vs last month** with the reason (LOP, bonus, revision). Click a row to open the slip on the side. |
  | 4. Approve | Maker-checker. |
  | 5. Pay | Bank file / payout. |
  | 6. Publish | Slips to employees. |
  | 7. Statutory | PF/ESI/PT/TDS challans (module 04). |

  Background progress is shown inline, with per-employee success or failure.

### 1.6 Salary slip — list [08](../ui-screens/03-payroll/08-salary-slip-list.png); Meera LOP [09](../ui-screens/03-payroll/09-salary-slip-lop.png) / [09b](../ui-screens/03-payroll/09b-salary-slip-lop-payment-days.png) / [09c](../ui-screens/03-payroll/09c-salary-slip-lop-earnings.png); Ananya TDS [10](../ui-screens/03-payroll/10-salary-slip-tds.png) / [10b](../ui-screens/03-payroll/10b-salary-slip-tax-breakup.png); Priya bonus [11](../ui-screens/03-payroll/11-salary-slip-bonus.png) / [11b](../ui-screens/03-payroll/11b-salary-slip-bonus-earnings.png); print [12](../ui-screens/03-payroll/12-salary-slip-print.png)
- **Layout:**
  - Six tabs: Details / Payment Days / Earnings & Deductions / Net Pay Info / Income Tax Breakup / Bank Details.
  - **The landing tab (Details) shows only employee and payroll info, with no money at all.**
  - Payment Days: working 26, absent 3, LWP 2, payment days 21.
  - Earnings & Deductions: two side-by-side grids; totals gross 32,307.70 | deductions 2,000; "gross year to date".
  - Income Tax Breakup: CTC, other income, total earnings | non-taxable, standard exemption, declarations, deductions, annual taxable | deducted till date, current month, future tax, total tax.
- **Observed:**
  - The **absent days aren't explained**. The slip says 3 absent and 2 LWP but doesn't list the dates or link to attendance. The missed-punch day (module 02, U13) becomes lost pay with no trail.
  - **Year-to-date ignores the opening balances** we loaded for Apr–Aug. The slip, the print and the mobile app all show YTD = September only (₹1,09,826). Tax, however, *does* use them (deducted till date 52,773.71 = 44,600 opening + 8,173.71). So two "year so far" figures disagree.
  - **Labels mislead:** Ananya is on the new regime. Her "Standard Tax Exemption Amount" shows **0** and "Tax Exemption Declaration" shows **75,000**, but the 75,000 *is* the standard deduction. She declared nothing.
  - **The print format is poor:** narrow columns wrap words mid-word ("Amou / nt", "Hous / e Rent / Allow / ance"). Empty "tax on flexible benefit / additional salary" columns take space. "Rounded total", "company currency" and "total in words" are all repeated.
- **YukthiX:** the **payslip is one page** that opens on the money:
  - Top: net pay (large) and paid-on date.
  - Earnings | deductions, side by side.
  - A "Days" strip: 30 calendar, 4 weekly offs, 26 working, **5 unpaid days**. Tap to see each date and reason (absent · missed punch 10 Sep, LWP 17–18 Sep), linking to regularisation.
  - A **tax card** in plain words: "Projected annual tax ₹4,75,800 · deducted so far ₹2,37,900 · this month ₹39,650 · remaining ₹1,98,250 over 5 months"; standard deduction named correctly; a regime comparison.
  - YTD including migrated opening balances.
  - A designed PDF template with company branding and bilingual option.

### 1.7 Additional salary — [13](../ui-screens/03-payroll/13-additional-salary.png) · Salary withholding (new) — [19](../ui-screens/03-payroll/19-salary-withholding-new.png)
- **Additional salary:** employee, component, amount, payroll date, recurring (from/to), overwrite-structure flag, "deduct full tax on selected payroll date". One document per person per item.
- **Salary withholding:** employee, from/to, number of cycles, reason. It then shows up only as a checkbox in the run's employee grid.
- **YukthiX:**
  - **"One-time pay & deductions"** as an input step of the run wizard: bulk grid / CSV upload (bonus for 40 people in one go), recurring items, and the tax treatment spelled out ("tax this bonus fully in September: +₹4,500 TDS").
  - **Hold salary** is an action on the review grid, with a reason, release month and approval.

### 1.8 Tax set-up — slab [14](../ui-screens/03-payroll/14-income-tax-slab.png), payroll period [15](../ui-screens/03-payroll/15-payroll-period.png)
- **Slab:** effective from, company, standard exemption, allow exemptions; slab grid (from, to, percent, condition); surcharge and cess tables; relief limits.
- **Observed:** slabs are **per company**, so a second company needs its own copies of the government slabs. Frappe's shipped slabs belonged to "workfox (Demo)" and we had to copy them for "workfox". The payroll period is also per company.
- **YukthiX:** YukthiX maintains the tax rules centrally per financial year, and every tenant uses them read-only. Companies choose only the default regime and employee choice rules. The financial year is global (India) or per legal entity (global expansion).

### 1.9 Tax declarations — declaration [16](../ui-screens/03-payroll/16-tax-declaration.png) / [16b](../ui-screens/03-payroll/16b-tax-declaration-details.png), proof (new) [17](../ui-screens/03-payroll/17-tax-proof-submission-new.png), regime selector [24](../ui-screens/03-payroll/24-tax-regime-selector.png)
- **Declaration layout:**
  - Details tab (employee, company, payroll period, currency).
  - Declarations tab: a grid of sub-category, category, maximum exempted, declared amount (80C 1,00,000 + 60,000; 80D 25,000).
  - **HRA exemption:** monthly rent 30,000, metro flag, HRA as per structure 2,88,000 | annual exemption 2,88,000, monthly 24,000.
  - Totals: declared 1,85,000, exemption 4,63,000.
  - Header has "Submit Proof".
- **Observed:**
  - **HR** keys this into a desk form. The employee has no mobile flow for it; the PWA has no tax section.
  - "Total declared 1,85,000" sits next to "Total exemption 4,63,000" with no explanation: the second includes HRA and applies the 80C cap.
  - India Payroll adds a **Tax Regime Selector** page ([24](../ui-screens/03-payroll/24-tax-regime-selector.png)) that compares regimes.
- **YukthiX:** an **employee tax centre** (mobile-first):
  1. Choose regime with a side-by-side "you pay ₹X vs ₹Y" comparison.
  2. Declare by plain-language questions ("Do you pay rent?", "Life insurance?"), with caps applied visibly ("80C: ₹1,60,000 declared, ₹1,50,000 counted").
  3. Upload proofs (camera), with HR verification and a per-line accept/reject.
  4. A window calendar: declaration opens April, proofs January.

### 1.10 Payroll settings — [18](../ui-screens/03-payroll/18-payroll-settings.png)
- **Layout:** payroll based on (Leave / Attendance), unmarked days, holidays in working days, half-day fraction, email slips, password policy, overtime slips, plus India Payroll statutory switches (EPF, ESIC, PT, LWF, multi-company).
- **YukthiX:** split into **Pay calendar** (cut-off, pay date, working-days basis) and **Statutory registrations** (per legal entity: PF code, ESIC, PT/LWF per state, TAN). Each is set once during onboarding with a checklist.

### 1.11 Accounting entry — [20](../ui-screens/03-payroll/20-accounting-entry.png)
- **Observed:** the run posts a journal entry (salary expense to payroll payable). In Frappe this is an ERPNext document. For companies without ERPNext it is noise.
- **YukthiX:** YukthiX has no general ledger. It offers an **accounting export** (Tally XML / Zoho Books / CSV) and connectors, with a mapping screen.

### 1.12 Reports — salary register [21](../ui-screens/03-payroll/21-report-salary-register.png), income-tax computation [22](../ui-screens/03-payroll/22-report-income-tax-computation.png), CTC break-up [23](../ui-screens/03-payroll/23-report-ctc-breakup.png)
- **Salary register:** filters (dates, currency, employee, company, status, department, designation, branch, employer contributions). A **very wide** grid: slip ID, employee, name, joining date, branch, department, designation, company, start, end, then one column per component. The amounts are off-screen to the right.
- **Income-tax computation:** requires a payroll period. **It did not accept the period from the link, even after two tries**, so it stays on "Please set filters". Not captured with data.
- **YukthiX:** a register with **pinned columns** (name + net), component columns grouped (earnings / deductions / employer), a totals row at the top, one-click Excel export, and comparison with the previous month.

### 1.13 Mobile — salary home [m1](../ui-screens/03-payroll/m1-pwa-salary-dashboard.png), payslip [m2](../ui-screens/03-payroll/m2-pwa-salary-slip.png)
- **Layout:**
  - **Salary tab:** a year-to-date card (₹1,09,826.29) with a financial-year picker, and a list of months ("Sep 2026 · gross ₹1,20,000 · net ₹1,09,826.29 ›").
  - **Payslip:** tabs Details / Earnings & Deductions / Net Pay Info / Income Tax…, with a "Download PDF" button pinned at the bottom.
- **Observed:**
  - The payslip opens on **Details**: about 12 read-only fields (employee, company, department… payroll entry ID) rendered as dropdown-style inputs. No money on the first screen.
  - The YTD issue from §1.6 appears here too.
  - The tabs are cut off on a phone ("Inc…").
- **YukthiX:**
  - **Salary tab:** month cards with net pay and a mini bar of gross → deductions → net; YTD including opening balances.
  - **Payslip:** net first, then earnings and deductions, days strip, tax card (§1.6), and Download / Share PDF.
  - Also on this tab: tax centre entry (§1.9), "Form 16" when available, and reimbursement claims (module 06).

---

## 2. YukthiX Payroll screen inventory

Each item from functional-spec gap analysis is shown next to the screen that carries it.

| # | YukthiX screen | Based on Frappe | Notes / additions |
|---|---|---|---|
| 1 | Payroll home (calendar + run stepper + deadlines) | 1.1 | Statutory due dates, open issues |
| 2 | Component library (presets) + accounting map | 1.2, 1.11 | Pre-flight completeness, export to Tally/Zoho |
| 3 | CTC designer (structure) | 1.3 | Live preview incl. employer cost; wage-code 50 % check |
| 4 | Employee compensation tab | 1.4 | Revisions timeline, arrears preview, regime, opening balances |
| 5 | **Payroll run wizard** (inputs → pre-flight → review → approve → pay → publish → statutory) | 1.5, 1.7 | Variance vs last month, maker-checker, hold salary, bulk one-time pay, background progress per employee |
| 6 | Payslip (web + mobile + PDF) | 1.6, 1.13 | Days strip with dates, plain tax card, correct YTD |
| 7 | Employee tax centre | 1.9 | Regime compare, guided declarations, proof upload & verification |
| 8 | Tax rules (platform-maintained) | 1.8 | Central slabs per FY, no per-company copies |
| 9 | Pay calendar & statutory registrations | 1.10 | Per legal entity / state |
| 10 | Reports: register, variance, CTC, bank advice | 1.12 | Pinned columns, month comparison |

---

## 3. UI issues seen on the instance (do not copy)

U1–U24 are in the [Leave](01-leave-management.ui-reference.md) and [Attendance](02-attendance-and-shifts.ui-reference.md) references. U1 (hidden default company) and U12 (activity noise) happen here too.

| # | Screen | What we saw | YukthiX rule |
|---|---|---|---|
| U25 | Payroll run | A failure shows a generic banner; the cause (a missing account on one component) is in an error log. | Name the exact record and field; offer the fix. |
| U26 | Payroll run | The employee grid has no amounts, so there is no review before submitting. | A review grid with net and variance is mandatory before approval. |
| U27 | Payroll run | Submit ran in the background; the slips stayed draft while the action looked done. | Inline per-employee progress and result. |
| U28 | Set-up | Four blocking set-up errors found one at a time during the first run (proration rule, company Basic/HRA, account type, liability account). | A pre-flight checklist before the first run. |
| U29 | Salary slip | Opens on a tab with no money; numbers spread over five tabs. | One page, net pay first. |
| U30 | Salary slip | Absent/LWP counts with no dates or links. | Show the unpaid dates and their causes. |
| U31 | Slip, print, mobile | YTD ignores migrated opening balances, while tax uses them. | One YTD including opening balances. |
| U32 | Tax breakup | Standard deduction labelled as "tax exemption declaration"; "standard exemption" shows 0. | Correct, plain labels. |
| U33 | Print format | Mid-word wrapping, empty columns, duplicated totals. | A designed payslip template. |
| U34 | Workspace | "Last month" cards show ₹0 right after this month's run. | Show the current run's status. |
| U35 | Tax slab / period | Per-company copies of government tax rules. | Platform-maintained rules. |
| U36 | Assignment | "Total CTC" equals gross when employer contributions aren't in the structure. | CTC always includes employer cost, or is labelled "Gross". |
| U37 | Salary register | Component amounts off-screen to the right; no pinned columns. | Pinned name/net; grouped columns. |
| U38 | Income-tax computation report | The period filter from the link was not applied, so the page stayed empty. | Default to the current FY. |

---

## 4. Capture notes

- **Demo data:** `yx_demo03*.py` in the session scratchpad.
  - Payroll settings: attendance-based, EPF/ESIC/PT on.
  - Company Basic/HRA components set; payable account type fixed; component accounts and liability accounts added.
  - FY 2026-27 slabs and payroll period for *workfox*; structure; 6 assignments with opening balances; bonus; Vikram's declaration.
  - The payroll run for Sep, with slips submitted directly through Frappe's submit function because the background job didn't run.
- **Temporary changes, all reverted 24 Sep 2026:**
  - The API key was used for three capture batches and revoked after each.
  - Administrator was linked to Vikram for the mobile screens (unlinked).
  - A one-time login key (used once).
  - Administrator's default company was switched to *workfox* (restored to *workfox (Demo)*).
- The payroll data **remains** on the test instance. Module 04 (India statutory: PF/ESI/PT registers, TDS, Form 16) will use this September run.
